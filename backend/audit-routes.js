'use strict';

function registerAuditRoutes(router, deps) {
  const { sql, rateLimit, authenticate } = deps;
  const permissions = { FILE:'LOG_ACCESS_FILE', NODE:'LOG_ACCESS_NODE', WORKFLOW:'LOG_ACCESS_WORKFLOW', USER_RBAC:'LOG_ACCESS_USER_RBAC', AUTHENTICATION:'LOG_ACCESS_AUTHENTICATION' };
  const fileActions = "'FILE_UPLOAD','FILE_REPLACE','FILE_DELETE','FOLDER_DELETE','FOLDER_CREATE','FILE_VIEW','FILE_DOWNLOAD'";
  const nodeActions = "'NODE_CREATED','NODE_UPDATED','NODE_ACTIVATED','NODE_DEACTIVATED','NODE_DELETED'";
  const authActions = "'LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT'";
  const userRbac = "(l.TargetType IN (N'USER',N'ROLE') OR l.Action LIKE N'USER[_]%' OR l.Action LIKE N'ROLE[_]%' OR l.Action LIKE N'SELF_PROFILE[_]%' OR (l.TargetType=N'ADMIN_TABLE_ROW' AND ISJSON(l.DetailsJson)=1 AND JSON_VALUE(l.DetailsJson,'$.tableName') IN (N'Users',N'Roles',N'UserRoles',N'RolePermissions',N'Permissions')))";
  const categorySql = "CASE WHEN l.Action IN ("+fileActions+") THEN N'FILE' WHEN l.Action IN ("+nodeActions+") THEN N'NODE' WHEN l.TargetType=N'DRAWING_REQUEST' THEN N'WORKFLOW' WHEN l.Action IN ("+authActions+") THEN N'AUTHENTICATION' WHEN "+userRbac+" THEN N'USER_RBAC' ELSE NULL END";
  const validUtc = value => {
    if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : date;
  };
  const allowed = (user, names) => names.filter(name => user.permissions.has(permissions[name]));

  router.get('/audit/search', rateLimit, authenticate, async (req,res) => {
    const mode = String(req.query.mode || '');
    const fromUtc = validUtc(req.query.fromUtc), toUtc = validUtc(req.query.toUtc);
    const page = Math.min(100000,Math.max(1,Number.parseInt(req.query.page,10)||1));
    const pageSize = Math.min(100,Math.max(10,Number.parseInt(req.query.pageSize,10)||25));
    if (!['node','user'].includes(mode) || !fromUtc || !toUtc || fromUtc >= toUtc) return res.status(400).json({error:'A valid search mode and UTC date range are required.'});
    const names = mode === 'node' ? ['FILE','NODE','WORKFLOW'] : ['FILE','NODE','WORKFLOW','USER_RBAC','AUTHENTICATION'];
    const grants = allowed(req.user,names);
    if (!grants.length) return res.status(403).json({error:'Audit permission required.'});
    const r = new sql.Request();
    r.input('fromUtc',sql.DateTime2(3),fromUtc); r.input('toUtc',sql.DateTime2(3),toUtc);
    r.input('offset',sql.Int,(page-1)*pageSize); r.input('fetch',sql.Int,pageSize);
    for (const name of names) r.input('can'+name,sql.Bit,grants.includes(name));
    let filter;
    if (mode === 'node') {
      const term = typeof req.query.node === 'string' ? req.query.node.trim() : '';
      if (!term || term.length > 150) return res.status(400).json({error:'Node code or name is required.'});
      r.input('nodeLike',sql.NVarChar(302),'%'+term+'%');
      const nodeMatch = "(EXISTS(SELECT 1 FROM dbo.Nodes n WHERE n.NodeID=TRY_CONVERT(int,l.TargetID) AND (n.NodeCode LIKE @nodeLike OR n.NodeName LIKE @nodeLike)) OR (ISJSON(l.DetailsJson)=1 AND (JSON_VALUE(l.DetailsJson,'$.nodeCode') LIKE @nodeLike OR JSON_VALUE(l.DetailsJson,'$.nodeName') LIKE @nodeLike)))";
      const workflowMatch = "(EXISTS(SELECT 1 FROM dbo.DrawingRequests dr JOIN dbo.Nodes n ON n.NodeID=dr.NodeID WHERE dr.RequestID=TRY_CONVERT(int,l.TargetID) AND (n.NodeCode LIKE @nodeLike OR n.NodeName LIKE @nodeLike)) OR (ISJSON(l.DetailsJson)=1 AND (JSON_VALUE(l.DetailsJson,'$.nodeCode') LIKE @nodeLike OR JSON_VALUE(l.DetailsJson,'$.nodeName') LIKE @nodeLike)))";
      filter = "((@canFILE=1 AND l.TargetType=N'NODE' AND l.Action IN ("+fileActions+") AND "+nodeMatch+") OR (@canNODE=1 AND l.TargetType=N'NODE' AND l.Action IN ("+nodeActions+") AND "+nodeMatch+") OR (@canWORKFLOW=1 AND l.TargetType=N'DRAWING_REQUEST' AND "+workflowMatch+"))";
    } else {
      const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
      if (!username || username.length > 100) return res.status(400).json({error:'Username is required.'});
      r.input('username',sql.NVarChar(100),username);
      filter = "(l.UserName=@username AND ((@canFILE=1 AND l.Action IN ("+fileActions+")) OR (@canNODE=1 AND l.Action IN ("+nodeActions+")) OR (@canWORKFLOW=1 AND l.TargetType=N'DRAWING_REQUEST') OR (@canUSER_RBAC=1 AND "+userRbac+") OR (@canAUTHENTICATION=1 AND l.Action IN ("+authActions+"))))";
    }
    try {
      const baseSql = " FROM dbo.Logs l WHERE l.CreatedAt>=@fromUtc AND l.CreatedAt<@toUtc AND "+filter;
      const q = await r.query("SELECT COUNT_BIG(*) AS Total"+baseSql+"; SELECT l.LogID,l.UserID,l.UserName,l.Action,l.IPAddress,l.CreatedAt,l.TargetType,l.TargetID,"+categorySql+" AS Category"+baseSql+" ORDER BY l.CreatedAt DESC,l.LogID DESC OFFSET @offset ROWS FETCH NEXT @fetch ROWS ONLY;");
      res.set('Cache-Control','no-store').json({mode,page,pageSize,total:Number(q.recordsets?.[0]?.[0]?.Total||0),rows:q.recordsets?.[1]||[]});
    } catch(e) { console.error('Audit search failed:',e.message); res.status(500).json({error:'Audit search failed.'}); }
  });

  router.get('/audit/:logId',rateLimit,authenticate,async(req,res)=>{
    const id=Number(req.params.logId);
    if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Invalid audit log ID.'});
    try {
      const r=new sql.Request(); r.input('id',sql.Int,id);
      const q=await r.query("SELECT TOP 1 l.LogID,l.UserID,l.UserName,l.Action,l.IPAddress,l.CreatedAt,l.TargetType,l.TargetID,l.DetailsJson,"+categorySql+" AS Category FROM dbo.Logs l WHERE l.LogID=@id;");
      const row=q.recordset?.[0];
      if(!row||!row.Category)return res.status(404).json({error:'Audit event not found.'});
      if(!req.user.permissions.has(permissions[row.Category]))return res.status(403).json({error:'Permission denied.'});
      let details=null;
      if(row.DetailsJson){try{details=JSON.parse(row.DetailsJson);}catch(_){details={raw:row.DetailsJson};}}
      delete row.DetailsJson;
      res.set('Cache-Control','no-store').json({event:{...row,details}});
    } catch(e) { console.error('Audit detail failed:',e.message); res.status(500).json({error:'Could not load audit event details.'}); }
  });
}

module.exports = { registerAuditRoutes };
