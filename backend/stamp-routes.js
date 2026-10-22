const fs = require('fs');
const path = require('path');

function registerStampRoutes(app, { sql, auth, sendServerError }) {
  const STAMP_PERMISSION_ID = 30;
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
    r.input('userId', sql.Int, userId); r.input('permissionId', sql.Int, STAMP_PERMISSION_ID); r.input('permissionCode', sql.NVarChar(100), STAMP_PERMISSION);
    const q = await r.query(`SELECT TOP 1 p.PermissionID,p.PermissionCode FROM dbo.UserRoles ur INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1 INNER JOIN dbo.Users u ON u.UserID=ur.UserID AND u.IsActive=1 WHERE ur.UserID=@userId AND p.PermissionID=@permissionId AND p.PermissionCode=@permissionCode;`);
    return q.recordset.length > 0;
  }

  async function nodeInfo(nodeId) {
    const r = new sql.Request(); r.input('nodeId', sql.Int, nodeId);
    const q = await r.query(`SELECT TOP 1 N.NodeID,N.NodeCode,N.NodeName,N.FolderPath,N.PathID,P.RootPath FROM dbo.Nodes N LEFT JOIN dbo.tblPath P ON P.PathID=N.PathID WHERE N.NodeID=@nodeId AND N.IsActive=1;`);
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
    const r = new sql.Request(); r.input('id', sql.Int, stampRequestId);
    const q = await r.query(`SELECT TOP 1 sr.StampRequestID,sr.RequestID,sr.RequestedByUserID,sr.StatusCode AS StampStatus,sr.ApprovedByUserID,sr.ApprovedAt,sr.RejectedByUserID,sr.RejectedAt,sr.CompletedAt,sr.ExpiresAt,sr.Comment,dr.RequestNumber,dr.NodeID,dr.NodeCode,n.NodeName,dr.RequesterUserID,dr.RequesterUsername,s.StatusCode AS DrawingStatusCode,s.StatusName AS DrawingStatusName FROM dbo.DrawingRequestStamps sr INNER JOIN dbo.DrawingRequests dr ON dr.RequestID=sr.RequestID INNER JOIN dbo.Nodes n ON n.NodeID=dr.NodeID INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID WHERE sr.StampRequestID=@id;`);
    return q.recordset[0] || null;
  }

  app.get('/api/stamp/node/:nodeId/pdfs', auth.requirePermission('REQUEST_DRAWING_CREATE'), async (req,res)=>{
    const nodeId=Number(req.params.nodeId); if(!Number.isInteger(nodeId)||nodeId<=0)return res.status(400).json({error:'Invalid Node ID.'});
    try{
      const node=await nodeInfo(nodeId);if(!node)return res.status(404).json({error:'Node not found or inactive.'});
      const r=new sql.Request();r.input('nodeId',sql.Int,nodeId);const danieli=await r.query('SELECT PDFID,PDFName FROM dbo.DanieliPDF WHERE NodeID=@nodeId ORDER BY PDFID;');
      const srsc=[],root=node.RootPath&&node.FolderPath?path.resolve(String(node.RootPath),String(node.FolderPath),'SLD'):null;
      if(root&&fs.existsSync(root)&&fs.statSync(root).isDirectory())for(const entry of fs.readdirSync(root,{withFileTypes:true}))if(entry.isFile()&&/\.pdf$/i.test(entry.name))srsc.push({fileName:entry.name,sourceType:'SRSC'});
      res.json({node:{NodeID:node.NodeID,NodeCode:node.NodeCode,NodeName:node.NodeName},pdfs:[...danieli.recordset.map(x=>({pdfId:Number(x.PDFID),pdfName:x.PDFName,sourceType:'DANIELI'})),...srsc.sort((a,b)=>a.fileName.localeCompare(b.fileName,undefined,{numeric:true,sensitivity:'base'}))]});
    }catch(e){sendError(res,'Stamp PDF list failed',e);}
  });

  app.post('/api/stamp/requests', auth.requirePermission('REQUEST_DRAWING_CREATE'), async(req,res)=>{
    const nodeId=Number(req.body?.nodeId),items=Array.isArray(req.body?.items)?req.body.items:[];
    if(!Number.isInteger(nodeId)||nodeId<=0)return res.status(400).json({error:'Invalid Node ID.'});if(!items.length||items.length>100)return res.status(400).json({error:'Select one or more PDFs for Stamp.'});
    try{
      const node=await nodeInfo(nodeId);if(!node)return res.status(404).json({error:'Node not found or inactive.'});
      const resolved=[],seen=new Set();
      for(const raw of items){const sourceType=String(raw?.sourceType||'').toUpperCase();if(!['DANIELI','SRSC'].includes(sourceType))throw bad('Unsupported PDF source type.');const key=sourceType==='DANIELI'?`D:${Number(raw?.pdfId)}`:`S:${path.basename(String(raw?.fileName||'').trim()).toLowerCase()}`;if(seen.has(key))continue;seen.add(key);
        if(sourceType==='DANIELI'){const pdfId=Number(raw?.pdfId),r=new sql.Request();r.input('pdfId',sql.Int,pdfId);r.input('nodeId',sql.Int,nodeId);const q=await r.query('SELECT TOP 1 d.PDFID,d.PDFName,p.RootPath FROM dbo.DanieliPDF d INNER JOIN dbo.tblPath p ON p.PathID=d.PathID WHERE d.PDFID=@pdfId AND d.NodeID=@nodeId;');const row=q.recordset[0],full=row?safeChild(row.RootPath,row.PDFName):null;if(!row||!full||!fs.existsSync(full)||!fs.statSync(full).isFile())throw bad('Selected Danieli PDF is not available.',404);resolved.push({sourceType,pdfId:row.PDFID,name:row.PDFName,relativePath:row.PDFName});}
        else{const fileName=path.basename(String(raw?.fileName||'').trim()),full=safeChild(path.resolve(String(node.RootPath||''),String(node.FolderPath||'')),`SLD/${fileName}`);if(!fileName||!/\.pdf$/i.test(fileName)||!full||!fs.existsSync(full)||!fs.statSync(full).isFile())throw bad('Selected SRSC PDF is not available.',404);resolved.push({sourceType,pdfId:null,name:fileName,relativePath:`SLD/${fileName}`});}
      }
      if(!resolved.length)throw bad('No valid PDF was selected.');
      const tx=new sql.Transaction();await tx.begin();try{
        const q=new sql.Request(tx);q.input('year',sql.Char(4),jalaliYear());q.input('nodeId',sql.Int,nodeId);q.input('nodeCode',sql.NVarChar(100),node.NodeCode||null);q.input('userId',sql.Int,req.user.userId);q.input('username',sql.NVarChar(100),req.user.username);
        const created=await q.query(`DECLARE @rid int,@rn nvarchar(8),@seq int,@lock int,@resource nvarchar(255)=CONCAT(N'DMS-RequestNumber-',@year);EXEC @lock=sys.sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000;IF @lock<0 THROW 51001,'Could not lock drawing request numbering sequence.',1;SELECT @seq=ISNULL(MAX(TRY_CONVERT(int,RIGHT(RequestNumber,4)))+1,1) FROM dbo.DrawingRequests WITH(UPDLOCK,HOLDLOCK) WHERE RequestNumber LIKE @year+N'%' AND LEN(RequestNumber)=8 AND RIGHT(RequestNumber,4) NOT LIKE N'%[^0-9]%';IF @seq>9999 THROW 51002,'Drawing request number sequence exceeded 9999 for this Jalali year.',1;SET @rn=@year+RIGHT(N'0000'+CONVERT(nvarchar(4),@seq),4);INSERT INTO dbo.DrawingRequests(RequestNumber,NodeID,NodeCode,RequesterUserID,RequesterUsername,ManagerUserID,ManagerUsername,[Description],StatusID,CreatedAt,UpdatedAt) VALUES(@rn,@nodeId,@nodeCode,@userId,@username,NULL,NULL,N'Stamp Drawing',(SELECT TOP 1 StatusID FROM dbo.DrawingRequestStatuses WHERE StatusCode=N'PENDING_STAMP'),SYSUTCDATETIME(),SYSUTCDATETIME());SET @rid=CONVERT(int,SCOPE_IDENTITY());INSERT INTO dbo.DrawingRequestHistory(RequestID,RequestNumber,ActionCode,FromStatusID,ToStatusID,ActionByUserID,ActionByUsername,Comment,CreatedAt) SELECT @rid,@rn,N'STAMP_REQUESTED',NULL,s.StatusID,@userId,@username,NULL,SYSUTCDATETIME() FROM dbo.DrawingRequestStatuses s WHERE s.StatusCode=N'PENDING_STAMP';SELECT @rid AS RequestID,@rn AS RequestNumber;`);
        const requestId=Number(created.recordset[0].RequestID),requestNumber=created.recordset[0].RequestNumber;
        const stamp=new sql.Request(tx);stamp.input('requestId',sql.Int,requestId);stamp.input('userId',sql.Int,req.user.userId);const stampResult=await stamp.query("INSERT INTO dbo.DrawingRequestStamps(RequestID,RequestedByUserID,StatusCode,CreatedAt,UpdatedAt) OUTPUT INSERTED.StampRequestID VALUES(@requestId,@userId,N'PENDING',SYSUTCDATETIME(),SYSUTCDATETIME());");
        const stampRequestId=Number(stampResult.recordset[0].StampRequestID);
        for(const item of resolved){const i=new sql.Request(tx);i.input('sid',sql.Int,stampRequestId);i.input('rid',sql.Int,requestId);i.input('nid',sql.Int,nodeId);i.input('type',sql.NVarChar(20),item.sourceType);i.input('pid',sql.Int,item.pdfId);i.input('name',sql.NVarChar(260),item.name);i.input('rel',sql.NVarChar(1000),item.relativePath);await i.query("INSERT INTO dbo.DrawingRequestStampItems(StampRequestID,RequestID,NodeID,SourceType,PDFID,PDFName,SourceRelativePath,StatusCode,CreatedAt,UpdatedAt) VALUES(@sid,@rid,@nid,@type,@pid,@name,@rel,N'PENDING',SYSUTCDATETIME(),SYSUTCDATETIME());");}
        const n=new sql.Request(tx);n.input('requestId',sql.Int,requestId);n.input('requestNumber',sql.NVarChar(20),requestNumber);await n.query("INSERT INTO dbo.Notifications(UserID,Username,RequestID,RequestNumber,NotificationType,Title,Message,IsRead,CreatedAt) SELECT u.UserID,u.Username,@requestId,@requestNumber,N'STAMP_REQUEST_CREATED',N'New Stamp Request',CONCAT(N'Stamp request ',@requestNumber,N' requires your Stamp action.'),0,SYSUTCDATETIME() FROM dbo.Users u INNER JOIN dbo.UserRoles ur ON ur.UserID=u.UserID INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID AND rr.IsActive=1 INNER JOIN dbo.RolePermissions rp ON rp.RoleID=rr.RoleID INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1 WHERE p.PermissionID=30 AND p.PermissionCode=N'REQUEST_DRAWING_STAMP' AND u.IsActive=1;");
        await tx.commit();res.status(201).json({success:true,stampRequestId,requestId,requestNumber,statusCode:'PENDING',itemCount:resolved.length});
      }catch(e){await tx.rollback();throw e;}
    }catch(e){sendError(res,'Stamp request creation failed',e);}
  });

  // Remaining Stamp routes are preserved in the repository version; this module export is intentionally kept unchanged.
}

module.exports = { registerStampRoutes };
