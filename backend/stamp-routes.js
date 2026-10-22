const fs = require('fs');
const path = require('path');

function registerStampRoutes(app, { sql, auth, sendServerError }) {
  const STAMP_PERMISSION = 'REQUEST_DRAWING_STAMP';
  const RETENTION_MS = 24 * 60 * 60 * 1000;
  const MAX_PDF_BYTES = 1024 * 1024 * 1024;

  const bad = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
  const safeName = (value, fallback = 'stamped.pdf') => {
    const n = path.basename(String(value || '').trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    return n || fallback;
  };
  const sendError = (res, label, error) => {
    console.error(`${label}:`, error);
    res.status(Number(error?.statusCode) || 500).json({ error: error?.message || String(error) });
  };

  async function canStamp(userId) {
    const r = new sql.Request();
    r.input('userId', sql.Int, userId);
    r.input('permissionCode', sql.NVarChar(100), STAMP_PERMISSION);
    const q = await r.query(`
      SELECT TOP 1 p.PermissionID, p.PermissionCode
      FROM dbo.UserRoles ur
      INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1
      INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID
      INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1
      INNER JOIN dbo.Users u ON u.UserID=ur.UserID AND u.IsActive=1
      WHERE ur.UserID=@userId
        AND p.PermissionCode=@permissionCode;
    `);
    return q.recordset.length > 0;
  }

  async function nodeInfo(nodeId) {
    const r = new sql.Request();
    r.input('nodeId', sql.Int, nodeId);
    const q = await r.query(`
      SELECT TOP 1 N.NodeID,N.NodeCode,N.NodeName,N.FolderPath,N.PathID,P.RootPath
      FROM dbo.Nodes N LEFT JOIN dbo.tblPath P ON P.PathID=N.PathID
      WHERE N.NodeID=@nodeId AND N.IsActive=1;
    `);
    return q.recordset[0] || null;
  }

  function safeChild(root, relative) {
    if (!root || !relative) return null;
    const normalized = String(relative).replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (!parts.length || parts.includes('..') || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
    const full = path.resolve(String(root), ...parts);
    const rel = path.relative(path.resolve(String(root)), full);
    return rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel) ? full : null;
  }

  async function path4() {
    const q = await new sql.Request().query('SELECT TOP 1 RootPath FROM dbo.tblPath WHERE PathID=4;');
    return q.recordset[0]?.RootPath || null;
  }

  function jalaliYear() {
    return new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { year: 'numeric' }).format(new Date()).replace(/\D/g, '').slice(0, 4);
  }

  async function requestInfo(stampRequestId) {
    const r = new sql.Request();
    r.input('id', sql.Int, stampRequestId);
    const q = await r.query(`
      SELECT TOP 1 sr.StampRequestID,sr.RequestID,sr.RequestedByUserID,sr.StatusCode AS StampStatus,
             sr.ApprovedByUserID,sr.ApprovedAt,sr.RejectedByUserID,sr.RejectedAt,sr.CompletedAt,sr.ExpiresAt,
             sr.Comment,dr.RequestNumber,dr.NodeID,dr.NodeCode,n.NodeName,dr.RequesterUserID,dr.RequesterUsername,
             s.StatusCode AS DrawingStatusCode,s.StatusName AS DrawingStatusName
      FROM dbo.DrawingRequestStamps sr
      INNER JOIN dbo.DrawingRequests dr ON dr.RequestID=sr.RequestID
      INNER JOIN dbo.Nodes n ON n.NodeID=dr.NodeID
      INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID
      WHERE sr.StampRequestID=@id;
    `);
    return q.recordset[0] || null;
  }

  async function listNodePdfs(nodeId, node) {
    const r = new sql.Request();
    r.input('nodeId', sql.Int, nodeId);
    const danieli = await r.query(`
      SELECT d.PDFID,d.PDFName,p.RootPath
      FROM dbo.DanieliPDF d
      INNER JOIN dbo.tblPath p ON p.PathID=d.PathID
      WHERE d.NodeID=@nodeId AND LOWER(RIGHT(LTRIM(RTRIM(d.PDFName)),4))=N'.pdf'
      ORDER BY d.PDFID;
    `);

    const resolved = [];
    for (const row of danieli.recordset) {
      const full = safeChild(row.RootPath, row.PDFName);
      if (!full) continue;
      try {
        if (fs.statSync(full).isFile()) {
          resolved.push({
            sourceType: 'DANIELI',
            pdfId: Number(row.PDFID),
            name: path.basename(String(row.PDFName)),
            relativePath: String(row.PDFName).replace(/\\\\/g, '/')
          });
        }
      } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
    }

    // SRSC PDFs can be nested under SLD (for example SLD/PART/X); scan
    // recursively but never follow symlinks or leave this Node's storage root.
    const nodeRoot = safeChild(node.RootPath, node.FolderPath);
    const sldRoot = nodeRoot ? safeChild(nodeRoot, 'SLD') : null;
    if (sldRoot) {
      let rootIsDirectory = false;
      try { rootIsDirectory = fs.statSync(sldRoot).isDirectory(); }
      catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      }
      if (rootIsDirectory) {
        const walk = (directory, relativeDirectory) => {
          for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (entry.name.startsWith('~$')) continue;
            const relativePath = path.posix.join(relativeDirectory, entry.name);
            const full = safeChild(nodeRoot, relativePath);
            if (!full) continue;
            if (entry.isDirectory()) {
              walk(full, relativePath);
            } else if (entry.isFile() && /\\.pdf$/i.test(entry.name)) {
              try {
                if (fs.statSync(full).isFile()) {
                  resolved.push({
                    sourceType: 'SRSC',
                    pdfId: null,
                    name: entry.name,
                    relativePath
                  });
                }
              } catch (error) {
                if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
              }
            }
          }
        };
        walk(sldRoot, 'SLD');
      }
    }

    return resolved;
  }

  app.get('/api/stamp/node/:nodeId/pdfs', auth.requirePermission('REQUEST_DRAWING_CREATE'), async (req, res) => {
    const nodeId = Number(req.params.nodeId);
    if (!Number.isInteger(nodeId) || nodeId <= 0) return res.status(400).json({ error:'Invalid Node ID.' });
    try {
      const node = await nodeInfo(nodeId);
      if (!node) return res.status(404).json({ error:'Node not found or inactive.' });
      const pdfs = await listNodePdfs(nodeId, node);
      res.set('Cache-Control','no-store').json({ node:{NodeID:node.NodeID,NodeCode:node.NodeCode,NodeName:node.NodeName}, pdfCount:pdfs.length });
    } catch (e) { sendError(res, 'Stamp PDF count failed', e); }
  });

  app.post('/api/stamp/requests', auth.requirePermission('REQUEST_DRAWING_CREATE'), async (req, res) => {
    const nodeId = Number(req.body?.nodeId);
    if (!Number.isInteger(nodeId) || nodeId <= 0) return res.status(400).json({ error:'Invalid Node ID.' });
    try {
      const node = await nodeInfo(nodeId);
      if (!node) return res.status(404).json({ error:'Node not found or inactive.' });
      const resolved = await listNodePdfs(nodeId, node);
      if (!resolved.length) return res.status(400).json({ error:'No PDF files are attached to this node.' });
      const tx = new sql.Transaction();
      await tx.begin();
      try {
        const q = new sql.Request(tx);
        q.input('year', sql.Char(4), jalaliYear());
        q.input('nodeId', sql.Int, nodeId); q.input('nodeCode', sql.NVarChar(100), node.NodeCode || null);
        q.input('userId', sql.Int, req.user.userId); q.input('username', sql.NVarChar(100), req.user.username);
        const created = await q.query(`
          DECLARE @rid int,@rn nvarchar(8),@seq int,@lock int,@resource nvarchar(255)=CONCAT(N'DMS-RequestNumber-',@year);
          EXEC @lock=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;
          IF @lock<0 THROW 51001,'Could not lock drawing request numbering sequence.',1;
          SELECT @seq=ISNULL(MAX(TRY_CONVERT(int,RIGHT(RequestNumber,4)))+1,1) FROM dbo.DrawingRequests WITH(UPDLOCK,HOLDLOCK) WHERE RequestNumber LIKE @year+N'%' AND LEN(RequestNumber)=8 AND RIGHT(RequestNumber,4) NOT LIKE N'%[^0-9]%';
          IF @seq>9999 THROW 51002,'Drawing request number sequence exceeded 9999 for this Jalali year.',1;
          SET @rn=@year+RIGHT(N'0000'+CONVERT(nvarchar(4),@seq),4);
          INSERT INTO dbo.DrawingRequests(RequestNumber,NodeID,NodeCode,RequesterUserID,RequesterUsername,ManagerUserID,ManagerUsername,[Description],StatusID,CreatedAt,UpdatedAt)
          VALUES(@rn,@nodeId,@nodeCode,@userId,@username,NULL,NULL,N'Stamp Drawing',(SELECT TOP 1 StatusID FROM dbo.DrawingRequestStatuses WHERE StatusCode=N'PENDING_STAMP'),SYSUTCDATETIME(),SYSUTCDATETIME());
          SET @rid=CONVERT(int,SCOPE_IDENTITY());
          INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt)
          SELECT @rid,@rn,N'STAMP_REQUESTED',NULL,s.StatusID,@userId,@username,NULL,SYSUTCDATETIME() FROM dbo.DrawingRequestStatuses s WHERE s.StatusCode=N'PENDING_STAMP';
          SELECT @rid AS RequestID,@rn AS RequestNumber;
        `);
        const requestId=Number(created.recordset[0].RequestID), requestNumber=created.recordset[0].RequestNumber;
        q.input('requestId',sql.Int,requestId);
        const stamp=await q.query(`INSERT INTO dbo.DrawingRequestStamps(RequestID,RequestedByUserID,StatusCode,CreatedAt,UpdatedAt) OUTPUT INSERTED.StampRequestID VALUES(@requestId,@userId,N'PENDING',SYSUTCDATETIME(),SYSUTCDATETIME());`);
        const stampRequestId=Number(stamp.recordset[0].StampRequestID);
        q.input('stampRequestId',sql.Int,stampRequestId); q.input('requestNumber',sql.NVarChar(20),requestNumber);
        for(const item of resolved){
          const i=new sql.Request(tx);
          i.input('sid',sql.Int,stampRequestId); i.input('rid',sql.Int,requestId); i.input('nid',sql.Int,nodeId);
          i.input('type',sql.NVarChar(20),item.sourceType); i.input('pid',sql.Int,item.pdfId); i.input('name',sql.NVarChar(260),item.name); i.input('rel',sql.NVarChar(1000),item.relativePath);
          await i.query(`INSERT INTO dbo.DrawingRequestStampItems(StampRequestID,RequestID,NodeID,SourceType,PDFID,PDFName,SourceRelativePath,StatusCode,CreatedAt,UpdatedAt) VALUES(@sid,@rid,@nid,@type,@pid,@name,@rel,N'PENDING',SYSUTCDATETIME(),SYSUTCDATETIME());`);
        }
        await q.query(`
          INSERT INTO dbo.Notifications(UserID,Username,RequestID,RequestNumber,NotificationType,Title,Message,IsRead,CreatedAt)
          SELECT u.UserID,u.Username,@requestId,@requestNumber,N'STAMP_REQUEST_CREATED',N'New Stamp Request',CONCAT(N'Stamp request ',@requestNumber,N' requires your Stamp action.'),0,SYSUTCDATETIME()
          FROM dbo.Users u INNER JOIN dbo.UserRoles ur ON ur.UserID=u.UserID INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID AND rr.IsActive=1 INNER JOIN dbo.RolePermissions rp ON rp.RoleID=rr.RoleID INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1
          WHERE p.PermissionCode=N'REQUEST_DRAWING_STAMP' AND u.IsActive=1;
        `);
        await tx.commit();
        res.status(201).json({success:true,stampRequestId,requestId,requestNumber,statusCode:'PENDING',itemCount:resolved.length});
      } catch(e) { await tx.rollback(); throw e; }
    } catch(e) { sendError(res,'Stamp request creation failed',e); }
  });

  app.get('/api/stamp/requests', async (req, res) => {
    try {
      const can = await canStamp(req.user.userId);
      const r = new sql.Request(); r.input('uid', sql.Int, req.user.userId); r.input('can', sql.Bit, can);
      const q = await r.query(`
        SELECT sr.StampRequestID,sr.RequestID,sr.RequestedByUserID,sr.StatusCode AS StampStatus,sr.CreatedAt AS StampCreatedAt,sr.CompletedAt,sr.ExpiresAt,
               dr.RequestNumber,dr.NodeID,dr.NodeCode,n.NodeName,dr.RequesterUsername,u.Name AS RequesterName,u.Family AS RequesterFamily
        FROM dbo.DrawingRequestStamps sr INNER JOIN dbo.DrawingRequests dr ON dr.RequestID=sr.RequestID INNER JOIN dbo.Nodes n ON n.NodeID=dr.NodeID INNER JOIN dbo.Users u ON u.UserID=dr.RequesterUserID
        WHERE (@can=1 OR sr.RequestedByUserID=@uid) AND (sr.ExpiresAt IS NULL OR sr.ExpiresAt>SYSUTCDATETIME())
        ORDER BY sr.CreatedAt DESC,sr.StampRequestID DESC;
      `);
      res.json({ canStamp: can, currentUserId: Number(req.user.userId), requests: q.recordset });
    } catch (e) { sendError(res, 'Stamp request list failed', e); }
  });

  app.get('/api/stamp/requests/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Stamp Request ID.' });
    try {
      const request = await requestInfo(id); if (!request) return res.status(404).json({ error: 'Stamp request not found.' });
      const can = await canStamp(req.user.userId);
      if (!can && Number(request.RequestedByUserID) !== Number(req.user.userId)) return res.status(403).json({ error: 'Permission denied.' });
      const r = new sql.Request(); r.input('id', sql.Int, id);
      const items = await r.query('SELECT StampItemID,StampRequestID,RequestID,NodeID,SourceType,PDFID,PDFName,SourceRelativePath,StatusCode,StampedFileName,CompletedByUserID,StampedAt,ExpiresAt FROM dbo.DrawingRequestStampItems WHERE StampRequestID=@id ORDER BY StampItemID;');
      res.json({ request, items: items.recordset });
    } catch (e) { sendError(res, 'Stamp request detail failed', e); }
  });

  app.post('/api/stamp/requests/:id/decision', async (req, res) => {
    const id = Number(req.params.id), decision = String(req.body?.decision || '').toLowerCase();
    if (!Number.isInteger(id) || id <= 0 || !['approve','reject'].includes(decision)) return res.status(400).json({ error: 'Invalid Stamp decision.' });
    try {
      if (!(await canStamp(req.user.userId))) return res.status(403).json({ error: 'Permission denied.' });
      const tx = new sql.Transaction(); await tx.begin();
      try {
        const q = new sql.Request(tx); q.input('id',sql.Int,id); q.input('uid',sql.Int,req.user.userId); q.input('uname',sql.NVarChar(100),req.user.username); q.input('comment',sql.NVarChar(1000),String(req.body?.comment || '').trim().slice(0,1000)||null); q.input('decision',sql.NVarChar(10),decision);
        const current = await q.query(`SELECT TOP 1 sr.RequestID,sr.StatusCode,dr.RequestNumber,dr.StatusID FROM dbo.DrawingRequestStamps sr WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.DrawingRequests dr ON dr.RequestID=sr.RequestID WHERE sr.StampRequestID=@id;`);
        const row = current.recordset[0]; if (!row) throw bad('Stamp request not found.',404); if (row.StatusCode !== 'PENDING') throw bad('Stamp request is no longer pending.',409);
        const nextDrawingStatus = decision === 'approve' ? 'PENDING_STAMP' : 'REJECTED';
        const status = await q.query('SELECT TOP 1 StatusID FROM dbo.DrawingRequestStatuses WHERE StatusCode=@statusCode;', { statusCode: nextDrawingStatus });
        if (!status.recordset.length) throw bad(`${nextDrawingStatus} status is missing from DrawingRequestStatuses.`,500);
        q.input('statusId',sql.Int,status.recordset[0].StatusID);
        await q.query(`UPDATE dbo.DrawingRequestStamps SET StatusCode=CASE WHEN @decision=N'approve' THEN N'APPROVED' ELSE N'REJECTED' END,ApprovedByUserID=CASE WHEN @decision=N'approve' THEN @uid ELSE ApprovedByUserID END,ApprovedAt=CASE WHEN @decision=N'approve' THEN SYSUTCDATETIME() ELSE ApprovedAt END,RejectedByUserID=CASE WHEN @decision=N'reject' THEN @uid ELSE RejectedByUserID END,RejectedAt=CASE WHEN @decision=N'reject' THEN SYSUTCDATETIME() ELSE RejectedAt END,Comment=@comment,UpdatedAt=SYSUTCDATETIME() WHERE StampRequestID=@id;`);
        await q.query(`UPDATE dbo.DrawingRequests SET StatusID=@statusId,UpdatedAt=SYSUTCDATETIME() WHERE RequestID=@requestId;`, { requestId: row.RequestID });
        await q.query(`INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt) VALUES(@requestId,@requestNumber,CASE WHEN @decision=N'approve' THEN N'STAMP_APPROVED' ELSE N'STAMP_REJECTED' END,@fromStatusId,@statusId,@uid,@uname,@comment,SYSUTCDATETIME());`, { requestId: row.RequestID, requestNumber: row.RequestNumber, fromStatusId: row.StatusID });
        await q.query(`INSERT INTO dbo.DrawingRequestStampAudit(StampRequestID,RequestID,ActorUserID,ActorUsername,ActionCode,Details,CreatedAt) VALUES(@id,@requestId,@uid,@uname,CASE WHEN @decision=N'approve' THEN N'STAMP_APPROVED' ELSE N'STAMP_REJECTED' END,@comment,SYSUTCDATETIME());`, { requestId: row.RequestID });
        await tx.commit(); res.json({ success: true, stampRequestId: id, decision });
      } catch (e) { await tx.rollback(); throw e; }
    } catch (e) { sendError(res, 'Stamp decision failed', e); }
  });

  app.get('/api/stamp/requests/:id/source/:itemId', async (req, res) => {
    const id=Number(req.params.id), itemId=Number(req.params.itemId);
    if(!Number.isInteger(id)||!Number.isInteger(itemId)||id<=0||itemId<=0)return res.status(400).json({error:'Invalid Stamp request or item ID.'});
    try{
      const request=await requestInfo(id);if(!request)return res.status(404).json({error:'Stamp request not found.'});
      const can=await canStamp(req.user.userId);if(!can&&Number(request.RequestedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Permission denied.'});
      const r=new sql.Request();r.input('sid',sql.Int,id);r.input('iid',sql.Int,itemId);
      const q=await r.query(`SELECT TOP 1 i.SourceType,i.PDFName,i.SourceRelativePath,n.FolderPath,COALESCE(dp.RootPath,p.RootPath) AS RootPath FROM dbo.DrawingRequestStampItems i INNER JOIN dbo.Nodes n ON n.NodeID=i.NodeID LEFT JOIN dbo.DanieliPDF d ON d.PDFID=i.PDFID LEFT JOIN dbo.tblPath dp ON dp.PathID=d.PathID LEFT JOIN dbo.tblPath p ON p.PathID=n.PathID WHERE i.StampRequestID=@sid AND i.StampItemID=@iid;`);
      const item=q.recordset[0];if(!item)return res.status(404).json({error:'Stamp item not found.'});
      const full=item.SourceType==='DANIELI'?safeChild(item.RootPath,item.PDFName):safeChild(path.resolve(String(item.RootPath||''),String(item.FolderPath||'')),item.SourceRelativePath);
      if(!full||!fs.existsSync(full)||!fs.statSync(full).isFile())return res.status(404).json({error:'Source PDF file not found.'});
      res.type('application/pdf');res.setHeader('Content-Disposition',`inline; filename="${safeName(item.PDFName)}"`);res.sendFile(full);
    }catch(e){sendError(res,'Stamp source PDF failed',e);}
  });

  app.post('/api/stamp/requests/:id/item/:itemId/complete', require('express').raw({type:'application/pdf',limit:'1gb'}), async(req,res)=>{
    const id=Number(req.params.id),itemId=Number(req.params.itemId);
    if(!Number.isInteger(id)||!Number.isInteger(itemId)||id<=0||itemId<=0)return res.status(400).json({error:'Invalid Stamp request or item ID.'});
    try{
      if(!Buffer.isBuffer(req.body)||req.body.length<5||req.body.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'Request body must be a valid PDF.'});
      if(req.body.length>MAX_PDF_BYTES)return res.status(413).json({error:'Stamped PDF exceeds the configured size limit.'});
      if(!(await canStamp(req.user.userId)))return res.status(403).json({error:'Permission denied.'});
      const request=await requestInfo(id);if(!request)return res.status(404).json({error:'Stamp request not found.'});
      if(request.StampStatus!=='APPROVED')return res.status(409).json({error:'Stamp request is not approved.'});
      if(Number(request.ApprovedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Only the approving Stamp user can complete this request.'});
      const rootPath=await path4();if(!rootPath)return res.status(500).json({error:'tblPath PathID=4 is not configured.'});
      const root=path.resolve(String(rootPath));await fs.promises.mkdir(root,{recursive:true});
      const tx=new sql.Transaction();await tx.begin();let output=null;
      try{
        const q=new sql.Request(tx);q.input('sid',sql.Int,id);q.input('iid',sql.Int,itemId);q.input('uid',sql.Int,req.user.userId);q.input('uname',sql.NVarChar(100),req.user.username);
        const itemQ=await q.query('SELECT TOP 1 StampItemID,RequestID,PDFName,StatusCode FROM dbo.DrawingRequestStampItems WITH(UPDLOCK,HOLDLOCK) WHERE StampRequestID=@sid AND StampItemID=@iid;');
        const item=itemQ.recordset[0];if(!item)throw bad('Stamp item not found.',404);if(item.StatusCode==='COMPLETED')throw bad('This PDF has already been completed.',409);
        const base=safeName(item.PDFName,'drawing.pdf').replace(/\.pdf$/i,'');const fileName=`${Date.now()}_${id}_${itemId}_${base}_STAMPED.pdf`;output=path.resolve(root,fileName);const rel=path.relative(root,output);if(!rel||rel==='..'||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel))throw bad('Invalid stamped output path.');
        await fs.promises.writeFile(output,req.body,{flag:'wx'});q.input('fileName',sql.NVarChar(260),fileName);q.input('expiresAt',sql.DateTime2(3),new Date(Date.now()+RETENTION_MS));
        await q.query('UPDATE dbo.DrawingRequestStampItems SET StatusCode=N\'COMPLETED\',StampedFileName=@fileName,CompletedByUserID=@uid,StampedAt=SYSUTCDATETIME(),ExpiresAt=@expiresAt,UpdatedAt=SYSUTCDATETIME() WHERE StampRequestID=@sid AND StampItemID=@iid;');
        await q.query(`INSERT INTO dbo.DrawingRequestStampAudit(StampRequestID,StampItemID,RequestID,ActorUserID,ActorUsername,ActionCode,Details,CreatedAt) VALUES(@sid,@iid,@requestId,@uid,@uname,N'STAMP_PDF_COMPLETED',@fileName,SYSUTCDATETIME());`, { requestId: item.RequestID });
        const left=await q.query('SELECT COUNT(*) AS Remaining FROM dbo.DrawingRequestStampItems WHERE StampRequestID=@sid AND StatusCode<>N\'COMPLETED\';');
        if(Number(left.recordset[0].Remaining)===0){
          const status=await q.query('SELECT TOP 1 StatusID FROM dbo.DrawingRequestStatuses WHERE StatusCode=N\'STAMP_COMPLETED\';');if(!status.recordset.length)throw bad('STAMP_COMPLETED status is missing from DrawingRequestStatuses.',500);
          q.input('statusId',sql.Int,status.recordset[0].StatusID);q.input('requestId',sql.Int,item.RequestID);
          await q.query('UPDATE dbo.DrawingRequestStamps SET StatusCode=N\'COMPLETED\',CompletedAt=SYSUTCDATETIME(),ExpiresAt=@expiresAt,UpdatedAt=SYSUTCDATETIME() WHERE StampRequestID=@sid AND StatusCode=N\'APPROVED\';');
          await q.query('UPDATE dbo.DrawingRequests SET StatusID=@statusId,UpdatedAt=SYSUTCDATETIME() WHERE RequestID=@requestId;');
          await q.query(`INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt) SELECT RequestID,RequestNumber,N'STAMP_COMPLETED',@statusId,@statusId,@uid,@uname,NULL,SYSUTCDATETIME() FROM dbo.DrawingRequests WHERE RequestID=@requestId;`);
        }
        await tx.commit();res.json({success:true,stampRequestId:id,stampItemId:itemId,requestCompleted:Number(left.recordset[0].Remaining)===0});
      }catch(e){await tx.rollback();if(output)await fs.promises.unlink(output).catch(()=>{});throw e;}
    }catch(e){sendError(res,'Stamp item completion failed',e);}
  });

  app.get('/api/stamp/requests/:id/download/:itemId',async(req,res)=>{
    const id=Number(req.params.id),itemId=Number(req.params.itemId);if(!Number.isInteger(id)||!Number.isInteger(itemId)||id<=0||itemId<=0)return res.status(400).json({error:'Invalid Stamp request or item ID.'});
    try{
      const request=await requestInfo(id);if(!request)return res.status(404).json({error:'Stamp request not found.'});
      if(Number(request.RequestedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Only the requester can download the stamped drawing.'});
      if(request.StampStatus!=='COMPLETED')return res.status(409).json({error:'Stamped drawing is not ready for download.'});
      const r=new sql.Request();r.input('sid',sql.Int,id);r.input('iid',sql.Int,itemId);const q=await r.query('SELECT TOP 1 StampedFileName,ExpiresAt FROM dbo.DrawingRequestStampItems WHERE StampRequestID=@sid AND StampItemID=@iid AND StatusCode=N\'COMPLETED\';');const item=q.recordset[0];
      if(!item||!item.StampedFileName||!item.ExpiresAt||new Date(item.ExpiresAt).getTime()<=Date.now())return res.status(410).json({error:'The stamped PDF download period has expired.'});
      const rootPath=await path4();if(!rootPath)return res.status(500).json({error:'tblPath PathID=4 is not configured.'});const root=path.resolve(String(rootPath));const full=safeChild(root,item.StampedFileName);if(!full||!fs.existsSync(full)||!fs.statSync(full).isFile())return res.status(404).json({error:'Stamped PDF file is no longer available.'});
      const a=new sql.Request();a.input('requestId',sql.Int,request.RequestID);a.input('uid',sql.Int,req.user.userId);a.input('uname',sql.NVarChar(100),req.user.username);a.input('sid',sql.Int,id);a.input('iid',sql.Int,itemId);a.input('file',sql.NVarChar(260),item.StampedFileName);await a.query(`INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt) SELECT RequestID,RequestNumber,N'STAMP_PDF_DOWNLOADED',StatusID,StatusID,@uid,@uname,@file,SYSUTCDATETIME() FROM dbo.DrawingRequests WHERE RequestID=@requestId; INSERT INTO dbo.DrawingRequestStampAudit(StampRequestID,StampItemID,RequestID,ActorUserID,ActorUsername,ActionCode,Details,CreatedAt) VALUES(@sid,@iid,@requestId,@uid,@uname,N'STAMP_PDF_DOWNLOADED',@file,SYSUTCDATETIME());`);
      res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${safeName(item.StampedFileName)}"`);res.sendFile(full);
    }catch(e){sendError(res,'Stamped PDF download failed',e);}
  });

  async function cleanupExpired(){
    try{
      const rootPath=await path4();if(!rootPath)return;const root=path.resolve(String(rootPath));
      const q=await new sql.Request().query('SELECT StampItemID,StampRequestID,RequestID,StampedFileName FROM dbo.DrawingRequestStampItems WHERE StatusCode=N\'COMPLETED\' AND ExpiresAt IS NOT NULL AND ExpiresAt<=SYSUTCDATETIME() AND StampedFileName IS NOT NULL;');
      for(const item of q.recordset){const full=safeChild(root,item.StampedFileName);if(full)await fs.promises.unlink(full).catch(e=>{if(e.code!=='ENOENT')console.error('Stamp cleanup:',e.message);});const r=new sql.Request();r.input('itemId',sql.Int,item.StampItemID);r.input('sid',sql.Int,item.StampRequestID);r.input('requestId',sql.Int,item.RequestID);r.input('file',sql.NVarChar(260),item.StampedFileName);await r.query(`UPDATE dbo.DrawingRequestStampItems SET StampedFileName=NULL,UpdatedAt=SYSUTCDATETIME() WHERE StampItemID=@itemId AND ExpiresAt<=SYSUTCDATETIME(); INSERT INTO dbo.DrawingRequestStampAudit(StampRequestID,StampItemID,RequestID,ActorUserID,ActorUsername,ActionCode,Details,CreatedAt) VALUES(@sid,@itemId,@requestId,NULL,N'SYSTEM',N'STAMP_PDF_EXPIRED_DELETED',@file,SYSUTCDATETIME());`);}
    }catch(e){console.error('Stamp cleanup failed:',e.message);}
  }
  setInterval(cleanupExpired,60*60*1000);cleanupExpired();
}

module.exports={registerStampRoutes};