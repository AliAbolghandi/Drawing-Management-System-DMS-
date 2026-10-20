const fs = require('fs');
const path = require('path');

function registerStampRoutes(app, deps) {
  const { sql, auth, sendServerError } = deps;
  const STAMP_PERMISSION = 'REQUEST_DRAWING_STAMP';
  const MAX_STAMPED_PDF_BYTES = 1024 * 1024 * 1024;
  const RETENTION_MS = 24 * 60 * 60 * 1000;

  function bad(message, statusCode = 400) { return Object.assign(new Error(message), { statusCode }); }
  function sendStampError(res, label, error) { console.error(`${label}:`, error); res.status(Number(error?.statusCode) || 500).json({ error: error?.message || String(error) }); }
  function safeName(value, fallback = 'stamped.pdf') {
    const name = path.basename(String(value || '').trim()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    return name || fallback;
  }
  async function pathById(pathId) {
    const r = new sql.Request(); r.input('pathId', sql.Int, pathId);
    const q = await r.query('SELECT TOP 1 PathID,RootPath FROM dbo.tblPath WHERE PathID=@pathId;');
    return q.recordset[0] || null;
  }
  async function nodeStorage(nodeId) {
    const r = new sql.Request(); r.input('nodeId', sql.Int, nodeId);
    const q = await r.query(`SELECT TOP 1 N.NodeID,N.NodeCode,N.NodeName,N.FolderPath,N.PathID,P.RootPath FROM dbo.Nodes N LEFT JOIN dbo.tblPath P ON P.PathID=N.PathID WHERE N.NodeID=@nodeId AND N.IsActive=1;`);
    return q.recordset[0] || null;
  }
  function safeNodeFile(rootPath, folderPath, fileName) {
    if (!rootPath || !fileName) return null;
    const root = path.resolve(String(rootPath), String(folderPath || ''));
    const normalized = String(fileName).replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    if (!parts.length || parts.includes('..') || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
    const full = path.resolve(root, ...parts); const rel = path.relative(root, full);
    return rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) ? null : full;
  }
  async function canStampUser(userId) {
    const r = new sql.Request(); r.input('userId', sql.Int, userId);
    const q = await r.query(`SELECT TOP 1 p.PermissionID,p.PermissionCode FROM dbo.UserRoles ur INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1 INNER JOIN dbo.Users u ON u.UserID=ur.UserID AND u.IsActive=1 WHERE ur.UserID=@userId AND p.PermissionID=18 AND p.PermissionCode=N'REQUEST_DRAWING_STAMP';`);
    return q.recordset.length > 0;
  }
  async function getStampRequest(stampRequestId) {
    const r = new sql.Request(); r.input('stampRequestId', sql.Int, stampRequestId);
    const q = await r.query(`SELECT TOP 1 sr.StampRequestID,sr.RequestID,sr.RequestedByUserID,sr.StatusCode AS StampStatus,sr.ApprovedByUserID,sr.ApprovedAt,sr.RejectedByUserID,sr.RejectedAt,sr.CompletedAt,sr.ExpiresAt,dr.RequestNumber,dr.NodeID,dr.NodeCode,n.NodeName,dr.RequesterUserID,s.StatusCode,s.StatusName FROM dbo.DrawingRequestStamps sr INNER JOIN dbo.DrawingRequests dr ON dr.RequestID=sr.RequestID INNER JOIN dbo.Nodes n ON n.NodeID=dr.NodeID INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID WHERE sr.StampRequestID=@stampRequestId;`);
    return q.recordset[0] || null;
  }

  app.get('/api/stamp/node/:nodeId/pdfs', auth.requirePermission('REQUEST_DRAWING_CREATE'), async (req,res)=>{
    const nodeId=Number(req.params.nodeId); if(!Number.isInteger(nodeId)||nodeId<=0)return res.status(400).json({error:'Invalid Node ID.'});
    try{
      const node=await nodeStorage(nodeId); if(!node)return res.status(404).json({error:'Node not found or inactive.'});
      const r=new sql.Request();r.input('nodeId',sql.Int,nodeId);
      const danieli=await r.query('SELECT d.PDFID,d.NodeID,d.PDFName,d.PathID FROM dbo.DanieliPDF d WHERE d.NodeID=@nodeId ORDER BY d.PDFID;');
      const srscRoot=node.RootPath&&node.FolderPath?path.resolve(String(node.RootPath),String(node.FolderPath),'SLD'):null;const srsc=[];
      if(srscRoot&&fs.existsSync(srscRoot)&&fs.statSync(srscRoot).isDirectory())for(const entry of fs.readdirSync(srscRoot,{withFileTypes:true}))if(entry.isFile()&&/\.pdf$/i.test(entry.name))srsc.push({fileName:entry.name,sourceType:'SRSC'});
      res.json({node:{NodeID:node.NodeID,NodeCode:node.NodeCode,NodeName:node.NodeName},pdfs:[...danieli.recordset.map(x=>({pdfId:Number(x.PDFID),pdfName:x.PDFName,sourceType:'DANIELI'})),...srsc.sort((a,b)=>a.fileName.localeCompare(b.fileName,undefined,{numeric:true,sensitivity:'base'}))]});
    }catch(e){sendStampError(res,'Stamp PDF list failed',e);}
  });

  app.post('/api/stamp/requests', auth.requirePermission('REQUEST_DRAWING_CREATE'), async(req,res)=>{
    const requestId=Number(req.body?.requestId),items=Array.isArray(req.body?.items)?req.body.items:[];
    if(!Number.isInteger(requestId)||requestId<=0)return res.status(400).json({error:'A valid DrawingRequest ID is required.'});
    if(!items.length||items.length>100)return res.status(400).json({error:'Select one or more PDFs for Stamp.'});
    try{
      const base=await getStampRequest(requestId);if(!base)return res.status(404).json({error:'Drawing request not found.'});
      if(Number(base.RequestedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Only the DrawingRequest requester can create its Stamp request.'});
      const unique=new Set(),resolved=[];
      for(const raw of items){const sourceType=String(raw?.sourceType||'').toUpperCase();const key=sourceType==='DANIELI'?`D:${Number(raw?.pdfId)}`:`S:${String(raw?.fileName||'').trim().toLowerCase()}`;if(unique.has(key))continue;unique.add(key);
        const node=await nodeStorage(base.NodeID);if(!node)throw bad('Node not found or inactive.',404);
        if(sourceType==='DANIELI'){const pdfId=Number(raw?.pdfId);if(!Number.isInteger(pdfId)||pdfId<=0)throw bad('Invalid Danieli PDF ID.');const r=new sql.Request();r.input('pdfId',sql.Int,pdfId);r.input('nodeId',sql.Int,base.NodeID);const q=await r.query('SELECT TOP 1 d.PDFID,d.NodeID,d.PDFName,d.PathID,p.RootPath FROM dbo.DanieliPDF d INNER JOIN dbo.tblPath p ON p.PathID=d.PathID WHERE d.PDFID=@pdfId AND d.NodeID=@nodeId;');const row=q.recordset[0];if(!row)throw bad('Selected Danieli PDF does not belong to this Node.',403);const full=safeNodeFile(row.RootPath,'',row.PDFName);if(!full||!fs.existsSync(full)||!fs.statSync(full).isFile())throw bad('Danieli PDF file not found.',404);resolved.push({sourceType:'DANIELI',PDFID:row.PDFID,PDFName:row.PDFName,sourcePath:row.PDFName});}
        else if(sourceType==='SRSC'){const fileName=path.basename(String(raw?.fileName||'').trim());if(!fileName||!/\.pdf$/i.test(fileName))throw bad('A valid SRSC PDF filename is required.');const full=safeNodeFile(node.RootPath,node.FolderPath,`SLD/${fileName}`);if(!full||!fs.existsSync(full)||!fs.statSync(full).isFile())throw bad('Selected SRSC PDF file not found.',404);resolved.push({sourceType:'SRSC',PDFID:null,PDFName:fileName,sourcePath:`SLD/${fileName}`});}
        else throw bad('Unsupported PDF source type.');
      }
      const tx=new sql.Transaction();await tx.begin();try{
        const q=new sql.Request(tx);q.input('requestId',sql.Int,requestId);q.input('userId',sql.Int,req.user.userId);q.input('username',sql.NVarChar(100),req.user.username);
        const existing=await q.query('SELECT TOP 1 StampRequestID FROM dbo.DrawingRequestStamps WITH (UPDLOCK,HOLDLOCK) WHERE RequestID=@requestId AND RequestedByUserID=@userId AND StatusCode IN (N\'PENDING\',N\'APPROVED\');');if(existing.recordset.length)throw bad('This DrawingRequest already has an active Stamp request.',409);
        const inserted=await q.query('INSERT INTO dbo.DrawingRequestStamps(RequestID,RequestedByUserID,StatusCode,CreatedAt,UpdatedAt) OUTPUT INSERTED.StampRequestID VALUES(@requestId,@userId,N\'PENDING\',SYSUTCDATETIME(),SYSUTCDATETIME());');const stampRequestId=Number(inserted.recordset[0].StampRequestID);
        for(const item of resolved){const i=new sql.Request(tx);i.input('stampRequestId',sql.Int,stampRequestId);i.input('requestId',sql.Int,requestId);i.input('nodeId',sql.Int,base.NodeID);i.input('sourceType',sql.NVarChar(20),item.sourceType);i.input('pdfId',sql.Int,item.PDFID);i.input('pdfName',sql.NVarChar(260),item.PDFName);i.input('sourcePath',sql.NVarChar(1000),item.sourcePath);await i.query('INSERT INTO dbo.DrawingRequestStampItems(StampRequestID,RequestID,NodeID,SourceType,PDFID,PDFName,SourceRelativePath,StatusCode,CreatedAt,UpdatedAt) VALUES(@stampRequestId,@requestId,@nodeId,@sourceType,@pdfId,@pdfName,@sourcePath,N\'PENDING\',SYSUTCDATETIME(),SYSUTCDATETIME());');}
        await tx.commit();res.status(201).json({success:true,stampRequestId,requestId,statusCode:'PENDING',itemCount:resolved.length});
      }catch(e){await tx.rollback();throw e;}
    }catch(e){sendStampError(res,'Stamp request creation failed',e);}
  });

  app.get('/api/stamp/requests', async(req,res)=>{try{const canStamp=await canStampUser(req.user.userId);const db=new sql.Request();db.input('userId',sql.Int,req.user.userId);db.input('canStamp',sql.Bit,canStamp);const q=await db.query(`SELECT sr.StampRequestID,sr.RequestID,sr.RequestedByUserID,sr.StatusCode AS StampStatus,sr.CreatedAt AS StampCreatedAt,sr.CompletedAt,sr.ExpiresAt,dr.RequestNumber,dr.NodeID,dr.NodeCode,n.NodeName,dr.RequesterUsername,requesterUser.Name AS RequesterName,requesterUser.Family AS RequesterFamily FROM dbo.DrawingRequestStamps sr INNER JOIN dbo.DrawingRequests dr ON dr.RequestID=sr.RequestID INNER JOIN dbo.Nodes n ON n.NodeID=dr.NodeID INNER JOIN dbo.Users requesterUser ON requesterUser.UserID=dr.RequesterUserID WHERE (@canStamp=1 OR sr.RequestedByUserID=@userId) AND (sr.ExpiresAt IS NULL OR sr.ExpiresAt>SYSUTCDATETIME()) ORDER BY sr.CreatedAt DESC,sr.StampRequestID DESC;`);res.json({canStamp,currentUserId:Number(req.user.userId),requests:q.recordset});}catch(e){sendStampError(res,'Stamp request list failed',e);}});

  app.get('/api/stamp/requests/:stampRequestId', async(req,res)=>{const id=Number(req.params.stampRequestId);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Stamp Request ID.'});try{const request=await getStampRequest(id);if(!request)return res.status(404).json({error:'Stamp request not found.'});const canStamp=await canStampUser(req.user.userId);if(!canStamp&&Number(request.RequestedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Permission denied.'});const r=new sql.Request();r.input('stampRequestId',sql.Int,id);const items=await r.query('SELECT StampItemID,StampRequestID,RequestID,NodeID,SourceType,PDFID,PDFName,SourceRelativePath,StatusCode,StampedFileName,CompletedByUserID,StampedAt,ExpiresAt FROM dbo.DrawingRequestStampItems WHERE StampRequestID=@stampRequestId ORDER BY StampItemID;');res.json({request,items:items.recordset});}catch(e){sendStampError(res,'Stamp request detail failed',e);}});

  app.post('/api/stamp/requests/:stampRequestId/decision', async(req,res)=>{const id=Number(req.params.stampRequestId),decision=String(req.body?.decision||'').toLowerCase(),comment=typeof req.body?.comment==='string'?req.body.comment.trim().slice(0,1000):'';if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Stamp Request ID.'});if(!['approve','reject'].includes(decision))return res.status(400).json({error:'Decision must be approve or reject.'});try{if(!(await canStampUser(req.user.userId)))return res.status(403).json({error:'Permission denied.'});const tx=new sql.Transaction();await tx.begin();try{const q=new sql.Request(tx);q.input('stampRequestId',sql.Int,id);q.input('userId',sql.Int,req.user.userId);q.input('username',sql.NVarChar(100),req.user.username);q.input('comment',sql.NVarChar(1000),comment||null);q.input('decision',sql.NVarChar(10),decision);const result=await q.query(`DECLARE @requestId int,@fromStatus nvarchar(20);SELECT @requestId=RequestID,@fromStatus=StatusCode FROM dbo.DrawingRequestStamps WITH(UPDLOCK,HOLDLOCK) WHERE StampRequestID=@stampRequestId;IF @requestId IS NULL THROW 51101,'Stamp request not found.',1;IF @fromStatus<>N'PENDING' THROW 51102,'Stamp request is no longer pending.',1;UPDATE dbo.DrawingRequestStamps SET StatusCode=CASE WHEN @decision=N'approve' THEN N'APPROVED' ELSE N'REJECTED' END,ApprovedByUserID=CASE WHEN @decision=N'approve' THEN @userId ELSE ApprovedByUserID END,ApprovedAt=CASE WHEN @decision=N'approve' THEN SYSUTCDATETIME() ELSE ApprovedAt END,RejectedByUserID=CASE WHEN @decision=N'reject' THEN @userId ELSE RejectedByUserID END,RejectedAt=CASE WHEN @decision=N'reject' THEN SYSUTCDATETIME() ELSE RejectedAt END,Comment=@comment,UpdatedAt=SYSUTCDATETIME() WHERE StampRequestID=@stampRequestId;INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt)SELECT dr.RequestID,dr.RequestNumber,CASE WHEN @decision=N'approve' THEN N'STAMP_APPROVED' ELSE N'STAMP_REJECTED' END,dr.StatusID,dr.StatusID,@userId,@username,@comment,SYSUTCDATETIME() FROM dbo.DrawingRequests dr WHERE dr.RequestID=@requestId;`);await tx.commit();res.json({success:true,stampRequestId:id,decision});}catch(e){await tx.rollback();throw e;}}catch(e){sendStampError(res,'Stamp decision failed',e);}});

  app.get('/api/stamp/requests/:stampRequestId/source/:stampItemId', async(req,res)=>{const id=Number(req.params.stampRequestId),itemId=Number(req.params.stampItemId);if(!Number.isInteger(id)||!Number.isInteger(itemId)||id<=0||itemId<=0)return res.status(400).json({error:'Invalid Stamp request or item ID.'});try{const request=await getStampRequest(id);if(!request)return res.status(404).json({error:'Stamp request not found.'});const canStamp=await canStampUser(req.user.userId);if(!canStamp&&Number(request.RequestedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Permission denied.'});const r=new sql.Request();r.input('stampRequestId',sql.Int,id);r.input('stampItemId',sql.Int,itemId);const q=await r.query(`SELECT TOP 1 i.StampItemID,i.SourceType,i.PDFID,i.PDFName,i.SourceRelativePath,n.FolderPath,COALESCE(dp.RootPath,p.RootPath) AS RootPath FROM dbo.DrawingRequestStampItems i INNER JOIN dbo.Nodes n ON n.NodeID=i.NodeID LEFT JOIN dbo.DanieliPDF d ON d.PDFID=i.PDFID LEFT JOIN dbo.tblPath dp ON dp.PathID=d.PathID LEFT JOIN dbo.tblPath p ON p.PathID=n.PathID WHERE i.StampRequestID=@stampRequestId AND i.StampItemID=@stampItemId;`);const item=q.recordset[0];if(!item)return res.status(404).json({error:'Stamp item not found.'});const full=item.SourceType==='DANIELI'?(safeNodeFile(item.RootPath,'',item.PDFName)||path.resolve(String(item.RootPath),String(item.PDFName))):safeNodeFile(item.RootPath,item.FolderPath,item.SourceRelativePath);if(!full||!fs.existsSync(full)||!fs.statSync(full).isFile())return res.status(404).json({error:'Source PDF file not found.'});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`inline; filename="${safeName(item.PDFName)}"`);res.sendFile(full);}catch(e){sendStampError(res,'Stamp source PDF failed',e);}});

  // Accept one stamped PDF as a binary body so large drawings do not hit express.json's 1 MB limit.
  app.post('/api/stamp/requests/:stampRequestId/item/:stampItemId/complete',
    require('express').raw({ type: 'application/pdf', limit: '1gb' }),
    async (req, res) => {
      const id=Number(req.params.stampRequestId), itemId=Number(req.params.stampItemId);
      if(!Number.isInteger(id)||id<=0||!Number.isInteger(itemId)||itemId<=0)return res.status(400).json({error:'Invalid Stamp request or item ID.'});
      try {
        if(!Buffer.isBuffer(req.body)||req.body.length<5||req.body.subarray(0,5).toString()!=='%PDF-')return res.status(400).json({error:'Request body must be a valid PDF.'});
        if(req.body.length>MAX_STAMPED_PDF_BYTES)return res.status(413).json({error:'Stamped PDF exceeds the configured size limit.'});
        if(!(await canStampUser(req.user.userId)))return res.status(403).json({error:'Permission denied.'});
        const request=await getStampRequest(id);
        if(!request)return res.status(404).json({error:'Stamp request not found.'});
        if(String(request.StampStatus)!=='APPROVED')return res.status(409).json({error:'Stamp request is not approved.'});
        if(Number(request.ApprovedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Only the approving Stamp user can complete this request.'});
        const pathRow=await pathById(4);
        if(!pathRow?.RootPath)return res.status(500).json({error:'tblPath PathID=4 is not configured.'});
        const root=path.resolve(String(pathRow.RootPath)); await fs.promises.mkdir(root,{recursive:true});
        const tx=new sql.Transaction(); await tx.begin();
        let outputPath=null;
        try {
          const q=new sql.Request(tx); q.input('sid',sql.Int,id); q.input('itemId',sql.Int,itemId);
          const itemQ=await q.query("SELECT TOP 1 StampItemID,PDFName,StatusCode FROM dbo.DrawingRequestStampItems WITH(UPDLOCK,HOLDLOCK) WHERE StampRequestID=@sid AND StampItemID=@itemId;");
          const item=itemQ.recordset[0];
          if(!item)throw bad('Stamp item not found.',404);
          if(item.StatusCode==='COMPLETED')throw bad('This PDF has already been completed.',409);
          const safe=safeName(item.PDFName,'drawing.pdf').replace(/\.pdf$/i,'');
          const fileName=`${Date.now()}_${id}_${itemId}_${safe}_STAMPED.pdf`;
          outputPath=path.resolve(root,fileName); const rel=path.relative(root,outputPath);
          if(!rel||rel==='..'||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel))throw bad('Invalid stamped output path.');
          await fs.promises.writeFile(outputPath,req.body,{flag:'wx'});
          q.input('fileName',sql.NVarChar(260),fileName); q.input('uid',sql.Int,req.user.userId); q.input('username',sql.NVarChar(100),req.user.username);
          q.input('expiresAt',sql.DateTime2(3),new Date(Date.now()+RETENTION_MS));
          await q.query("UPDATE dbo.DrawingRequestStampItems SET StatusCode=N'COMPLETED',StampedFileName=@fileName,CompletedByUserID=@uid,StampedAt=SYSUTCDATETIME(),ExpiresAt=@expiresAt,UpdatedAt=SYSUTCDATETIME() WHERE StampRequestID=@sid AND StampItemID=@itemId AND StatusCode<>N'COMPLETED';");
          await q.query("INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt) SELECT dr.RequestID,dr.RequestNumber,N'STAMP_PDF_COMPLETED',dr.StatusID,dr.StatusID,@uid,@username,CONVERT(nvarchar(100),@itemId),SYSUTCDATETIME() FROM dbo.DrawingRequests dr INNER JOIN dbo.DrawingRequestStamps sr ON sr.RequestID=dr.RequestID WHERE sr.StampRequestID=@sid;");
          const left=await q.query("SELECT COUNT(1) AS Remaining FROM dbo.DrawingRequestStampItems WHERE StampRequestID=@sid AND StatusCode<>N'COMPLETED';");
          if(Number(left.recordset[0]?.Remaining)===0){
            q.input('requestExpiresAt',sql.DateTime2(3),new Date(Date.now()+RETENTION_MS));
            await q.query("UPDATE dbo.DrawingRequestStamps SET StatusCode=N'COMPLETED',CompletedAt=SYSUTCDATETIME(),ExpiresAt=@requestExpiresAt,UpdatedAt=SYSUTCDATETIME() WHERE StampRequestID=@sid AND StatusCode=N'APPROVED';");
            const status=await q.query("SELECT TOP 1 StatusID FROM dbo.DrawingRequestStatuses WHERE StatusCode=N'STAMP_COMPLETED';");
            if(!status.recordset.length)throw bad('STAMP_COMPLETED status is missing from DrawingRequestStatuses.',500);
            q.input('statusId',sql.Int,status.recordset[0].StatusID);
            await q.query("UPDATE dbo.DrawingRequests SET StatusID=@statusId,UpdatedAt=SYSUTCDATETIME() WHERE RequestID=(SELECT RequestID FROM dbo.DrawingRequestStamps WHERE StampRequestID=@sid);");
            q.input('username',sql.NVarChar(100),req.user.username);
            await q.query("INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt) SELECT dr.RequestID,dr.RequestNumber,N'STAMP_COMPLETED',NULL,dr.StatusID,@uid,@username,NULL,SYSUTCDATETIME() FROM dbo.DrawingRequests dr INNER JOIN dbo.DrawingRequestStamps sr ON sr.RequestID=dr.RequestID WHERE sr.StampRequestID=@sid;");
          }
          await tx.commit();
          res.json({success:true,stampRequestId:id,stampItemId:itemId,itemCompleted:true,requestCompleted:Number(left.recordset[0]?.Remaining)===0});
        } catch(e) { await tx.rollback(); if(outputPath)await fs.promises.unlink(outputPath).catch(()=>{}); throw e; }
      } catch(e) { sendStampError(res,'Stamp item completion failed',e); }
    });

  app.post('/api/stamp/requests/:stampRequestId/complete', async(req,res)=>{const id=Number(req.params.stampRequestId),items=Array.isArray(req.body?.items)?req.body.items:[];if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Stamp Request ID.'});if(!items.length||items.length>100)return res.status(400).json({error:'Stamped PDF items are required.'});try{if(!(await canStampUser(req.user.userId)))return res.status(403).json({error:'Permission denied.'});const request=await getStampRequest(id);if(!request)return res.status(404).json({error:'Stamp request not found.'});if(String(request.StampStatus)!=='APPROVED')return res.status(409).json({error:'Stamp request is not approved.'});if(Number(request.ApprovedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Only the approving Stamp user can complete this request.'});const pathRow=await pathById(4);if(!pathRow?.RootPath)return res.status(500).json({error:'tblPath PathID=4 is not configured.'});const outputRoot=path.resolve(String(pathRow.RootPath));await fs.promises.mkdir(outputRoot,{recursive:true});const r=new sql.Request();r.input('stampRequestId',sql.Int,id);const expected=(await r.query('SELECT StampItemID,PDFName FROM dbo.DrawingRequestStampItems WHERE StampRequestID=@stampRequestId ORDER BY StampItemID;')).recordset;const byId=new Map(items.map(x=>[Number(x.stampItemId),x]));if(expected.some(x=>!byId.has(Number(x.StampItemID))))return res.status(400).json({error:'Every selected PDF must be completed before finalizing the Stamp request.'});const written=[];for(const item of expected){const payload=byId.get(Number(item.StampItemID));const b64=String(payload.pdfBase64||'').replace(/^data:application\/pdf;base64,/i,'');if(!b64)throw bad(`Invalid stamped PDF for item ${item.StampItemID}.`);const buffer=Buffer.from(b64,'base64');if(buffer.length<5||buffer.subarray(0,5).toString()!=='%PDF-')throw bad(`Stamped output for item ${item.StampItemID} is not a PDF.`);if(buffer.length>MAX_STAMPED_PDF_BYTES)throw bad(`Stamped PDF for item ${item.StampItemID} exceeds the size limit.`);const fileName=safeName(payload.fileName,`${safeName(item.PDFName,'drawing').replace(/\.pdf$/i,'')}_STAMPED.pdf`);const finalName=`${Date.now()}_${request.RequestID}_${Number(item.StampItemID)}_${fileName}`;const full=path.resolve(outputRoot,finalName);const rel=path.relative(outputRoot,full);if(!rel||rel==='..'||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel))throw bad('Invalid stamped output path.');await fs.promises.writeFile(full,buffer,{flag:'wx'});written.push({stampItemId:Number(item.StampItemID),fileName:finalName,expiresAt:new Date(Date.now()+RETENTION_MS)});}const tx=new sql.Transaction();await tx.begin();try{const q=new sql.Request(tx);q.input('stampRequestId',sql.Int,id);q.input('userId',sql.Int,req.user.userId);q.input('username',sql.NVarChar(100),req.user.username);for(const x of written){q.input(`id${x.stampItemId}`,sql.Int,x.stampItemId);q.input(`file${x.stampItemId}`,sql.NVarChar(260),x.fileName);q.input(`exp${x.stampItemId}`,sql.DateTime2(3),x.expiresAt);await q.query(`UPDATE dbo.DrawingRequestStampItems SET StatusCode=N'COMPLETED',StampedFileName=@file${x.stampItemId},CompletedByUserID=@userId,StampedAt=SYSUTCDATETIME(),ExpiresAt=@exp${x.stampItemId},UpdatedAt=SYSUTCDATETIME() WHERE StampItemID=@id${x.stampItemId} AND StampRequestID=@stampRequestId;`);}q.input('expiresAt',sql.DateTime2(3),new Date(Date.now()+RETENTION_MS));await q.query(`UPDATE dbo.DrawingRequestStamps SET StatusCode=N'COMPLETED',CompletedAt=SYSUTCDATETIME(),ExpiresAt=@expiresAt,UpdatedAt=SYSUTCDATETIME() WHERE StampRequestID=@stampRequestId AND StatusCode=N'APPROVED';`);const status=await q.query(`SELECT TOP 1 StatusID FROM dbo.DrawingRequestStatuses WHERE StatusCode=N'STAMP_COMPLETED';`);if(!status.recordset.length)throw bad('STAMP_COMPLETED status is missing from DrawingRequestStatuses.',500);q.input('statusId',sql.Int,status.recordset[0].StatusID);await q.query(`UPDATE dbo.DrawingRequests SET StatusID=@statusId,UpdatedAt=SYSUTCDATETIME() WHERE RequestID=(SELECT RequestID FROM dbo.DrawingRequestStamps WHERE StampRequestID=@stampRequestId);`);await q.query(`INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt) SELECT dr.RequestID,dr.RequestNumber,N'STAMP_COMPLETED',NULL,dr.StatusID,@userId,@username,NULL,SYSUTCDATETIME() FROM dbo.DrawingRequests dr INNER JOIN dbo.DrawingRequestStamps sr ON sr.RequestID=dr.RequestID WHERE sr.StampRequestID=@stampRequestId;`);await tx.commit();}catch(e){await tx.rollback();throw e;}res.json({success:true,stampRequestId:id,statusCode:'STAMP_COMPLETED',items:written});}catch(e){sendStampError(res,'Stamp completion failed',e);}});

  app.get('/api/stamp/requests/:stampRequestId/download/:stampItemId', async(req,res)=>{const id=Number(req.params.stampRequestId),itemId=Number(req.params.stampItemId);if(!Number.isInteger(id)||!Number.isInteger(itemId)||id<=0||itemId<=0)return res.status(400).json({error:'Invalid Stamp request or item ID.'});try{const request=await getStampRequest(id);if(!request)return res.status(404).json({error:'Stamp request not found.'});if(Number(request.RequestedByUserID)!==Number(req.user.userId))return res.status(403).json({error:'Only the requester can download the stamped drawing.'});if(String(request.StampStatus)!=='COMPLETED')return res.status(409).json({error:'Stamped drawing is not ready for download.'});if(!request.ExpiresAt||new Date(request.ExpiresAt).getTime()<=Date.now())return res.status(410).json({error:'The stamped drawing download period has expired.'});const r=new sql.Request();r.input('stampRequestId',sql.Int,id);r.input('stampItemId',sql.Int,itemId);const q=await r.query('SELECT TOP 1 StampedFileName,ExpiresAt FROM dbo.DrawingRequestStampItems WHERE StampRequestID=@stampRequestId AND StampItemID=@stampItemId AND StatusCode=N\'COMPLETED\';');const item=q.recordset[0];if(!item||!item.StampedFileName||new Date(item.ExpiresAt).getTime()<=Date.now())return res.status(410).json({error:'The stamped PDF has expired.'});const pathRow=await pathById(4);if(!pathRow?.RootPath)return res.status(500).json({error:'tblPath PathID=4 is not configured.'});const full=path.resolve(String(pathRow.RootPath),safeName(item.StampedFileName));if(!fs.existsSync(full)||!fs.statSync(full).isFile())return res.status(404).json({error:'Stamped PDF file is no longer available.'});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${safeName(item.StampedFileName)}"`);res.sendFile(full);}catch(e){sendStampError(res,'Stamped PDF download failed',e);}});

  async function cleanupExpired(){try{const q=await new sql.Request().query('SELECT StampItemID,StampedFileName FROM dbo.DrawingRequestStampItems WHERE StatusCode=N\'COMPLETED\' AND ExpiresAt IS NOT NULL AND ExpiresAt<=SYSUTCDATETIME() AND StampedFileName IS NOT NULL;');const pathRow=await pathById(4);if(pathRow?.RootPath){const root=path.resolve(String(pathRow.RootPath));for(const row of q.recordset){const full=path.resolve(root,safeName(row.StampedFileName));const rel=path.relative(root,full);if(rel&&rel!=='..'&&!rel.startsWith(`..${path.sep}`)&&!path.isAbsolute(rel))await fs.promises.unlink(full).catch(()=>{});}}await new sql.Request().query('UPDATE dbo.DrawingRequestStampItems SET StampedFileName=NULL,UpdatedAt=SYSUTCDATETIME() WHERE StatusCode=N\'COMPLETED\' AND ExpiresAt IS NOT NULL AND ExpiresAt<=SYSUTCDATETIME(); UPDATE dbo.DrawingRequestStamps SET ExpiresAt=NULL,UpdatedAt=SYSUTCDATETIME() WHERE StatusCode=N\'COMPLETED\' AND ExpiresAt IS NOT NULL AND ExpiresAt<=SYSUTCDATETIME();');}catch(e){console.error('Stamp cleanup failed:',e.message);}}
  setInterval(cleanupExpired,60*60*1000); cleanupExpired();
}
module.exports={registerStampRoutes};
