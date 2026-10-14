const express = require('express');
const crypto = require('crypto');
const sql = require('mssql/msnodesqlv8');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const API_WINDOW_MS = 60 * 1000;
const API_MAX_REQUESTS = 240;

function createAuth(frontendOrigins) {
  const router = express.Router();
  const sessions = new Map();
  const loginAttempts = new Map();
  const apiRateLimits = new Map();

  function getClientIp(req) { return String(req.ip || req.socket.remoteAddress || '').trim(); }

  function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://localhost:3000 http://127.0.0.1:3000; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const protectedAdminPages = new Set(['/management.html', '/admin-dashboard.html']);
    if (protectedAdminPages.has(req.path)) return authenticateAdminPage(req, res, next);
    next();
  }

  function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i <= 0) continue;
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (_) {}
    }
    return out;
  }

  function setAuthCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'dms_session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000) + secure);
  }
  function clearAuthCookie(res) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', 'dms_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + secure);
  }
  function createSession(user) {
    const token = crypto.randomBytes(48).toString('base64url');
    sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
    return token;
  }

  function passwordVerify(password, stored) {
    return new Promise((resolve, reject) => {
      try {
        if (!password || !stored || typeof stored !== 'string') return resolve(false);
        const parts = stored.split('$');
        if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
        const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
        const salt = Buffer.from(parts[4], 'base64'), expected = Buffer.from(parts[5], 'base64');
        if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) || !salt.length || !expected.length) return resolve(false);
        if (N < 2 || (N & (N - 1)) !== 0 || r <= 0 || p <= 0 || expected.length < 16 || expected.length > 128) return resolve(false);
        crypto.scrypt(password, salt, expected.length, { N, r, p, maxmem: 128 * 1024 * 1024 }, (err, derived) => {
          if (err) return reject(err);
          resolve(crypto.timingSafeEqual(expected, derived));
        });
      } catch (e) { reject(e); }
    });
  }

  async function writeAudit(userId, userName, action, ip) {
    try {
      const r = new sql.Request();
      r.input('userId', sql.Int, userId == null ? null : userId);
      r.input('userName', sql.NVarChar(100), userName || null);
      r.input('action', sql.NVarChar(100), action);
      r.input('ip', sql.NVarChar(64), ip || null);
      await r.query("INSERT INTO dbo.Logs (UserID,UserName,Action,IPAddress,CreatedAt) VALUES (@userId,@userName,@action,@ip,SYSUTCDATETIME());");
    } catch (e) { console.warn('Audit log failed:', e.message); }
  }

  function authenticate(req, res, next) {
    const token = parseCookies(req).dms_session;
    const session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return res.status(401).json({ error: 'Authentication required.' });
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    req.user = session.user;
    req.sessionToken = token;
    next();
  }

  function requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
      const permissionCode = typeof permission === 'string' ? permission.trim() : '';
      if (permissionCode && req.user.permissions.has(permissionCode)) return next();
      return res.status(403).json({ error: 'Permission denied.' });
    };
  }

  function requireAdmin() {
    return async (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
      try {
        const r = new sql.Request();
        r.input('userId', sql.Int, req.user.userId);
        const q = await r.query(`SELECT TOP 1 1 AS IsAdmin FROM dbo.UserRoles ur INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID INNER JOIN dbo.Users u ON u.UserID=ur.UserID WHERE ur.UserID=@userId AND u.IsActive=1 AND r.RoleCode=N'Admin' AND r.IsActive=1;`);
        if (!q.recordset.length) return res.status(403).json({ error: 'Admin access required.' });
        next();
      } catch (e) {
        console.error('Admin authorization check failed:', e.message);
        res.status(500).json({ error: 'Authorization service is unavailable.' });
      }
    };
  }

  function apiRateLimit(req, res, next) {
    const key = getClientIp(req), now = Date.now();
    let state = apiRateLimits.get(key);
    if (!state || now - state.startedAt >= API_WINDOW_MS) { state = { startedAt: now, count: 0 }; apiRateLimits.set(key, state); }
    state.count += 1;
    if (state.count > API_MAX_REQUESTS) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((API_WINDOW_MS - (now - state.startedAt)) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  }

  function csrfGuard(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.headers.origin, referer = req.headers.referer;
    if (origin && !frontendOrigins.has(origin)) return res.status(403).json({ error: 'Forbidden origin.' });
    if (!origin && referer) {
      try { if (!frontendOrigins.has(new URL(referer).origin)) return res.status(403).json({ error: 'Forbidden origin.' }); }
      catch (_) { return res.status(403).json({ error: 'Forbidden origin.' }); }
    }
    next();
  }

  function authenticatePage(req, res, next) {
    const token = parseCookies(req).dms_session, session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); return res.redirect('/login.html'); }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    req.user = session.user;
    next();
  }
  function authenticateAdminPage(req, res, next) {
    const token = parseCookies(req).dms_session, session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); return res.redirect('/login.html'); }
    if (!session.user?.isAdmin) return res.status(403).send('Admin access required.');
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    req.user = session.user;
    next();
  }

  router.post('/login', async (req, res) => {
    const ip = getClientIp(req), now = Date.now();
    const state = loginAttempts.get(ip) || { count: 0, firstAt: now, blockedUntil: 0 };
    if (state.blockedUntil > now) return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    if (now - state.firstAt > LOGIN_WINDOW_MS) { state.count = 0; state.firstAt = now; state.blockedUntil = 0; }
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    try {
      const r = new sql.Request(); r.input('username', sql.NVarChar(100), username);
      const q = await r.query(`SELECT TOP 1 u.UserID,u.Username,u.Name,u.Family,u.PasswordHash,u.IsActive, CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.UserRoles ur INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID WHERE ur.UserID=u.UserID AND rr.RoleCode='Admin' AND rr.IsActive=1) THEN 1 ELSE 0 END AS bit) AS IsAdmin FROM dbo.Users u WHERE u.Username=@username;`);
      const user = q.recordset[0];
      const valid = user && Number(user.IsActive) === 1 && await passwordVerify(password, user.PasswordHash);
      if (!valid) {
        state.count += 1; if (state.count >= LOGIN_MAX_ATTEMPTS) state.blockedUntil = now + LOGIN_WINDOW_MS; loginAttempts.set(ip, state);
        await writeAudit(user?.UserID || null, username, 'LOGIN_FAILED', ip);
        return res.status(401).json({ error: 'Invalid username or password.' });
      }
      const p = new sql.Request(); p.input('userId', sql.Int, user.UserID);
      const pr = await p.query(`SELECT DISTINCT p.PermissionCode FROM dbo.UserRoles ur INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1 WHERE ur.UserID=@userId`);
      const permissions = new Set(pr.recordset.map(x => String(x.PermissionCode)));
      const sessionUser = { userId:Number(user.UserID), username:String(user.Username), name:user.Name||'', family:user.Family||'', isAdmin:Number(user.IsAdmin)===1, permissions };
      const token = createSession(sessionUser); setAuthCookie(res, token); loginAttempts.delete(ip);
      const u = new sql.Request(); u.input('userId', sql.Int, user.UserID); await u.query('UPDATE dbo.Users SET LastLoginAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId;');
      await writeAudit(user.UserID, user.Username, 'LOGIN_SUCCESS', ip);
      res.json({ success:true, user:{ userId:sessionUser.userId, username:sessionUser.username, name:sessionUser.name, family:sessionUser.family } });
    } catch (e) { console.error('Login failed:', e); res.status(500).json({ error:'Login service is unavailable.' }); }
  });

  router.post('/logout', async (req, res) => {
    const token = parseCookies(req).dms_session, session = token ? sessions.get(token) : null;
    if (session) { await writeAudit(session.user.userId, session.user.username, 'LOGOUT', getClientIp(req)); sessions.delete(token); }
    clearAuthCookie(res); res.json({ success:true });
  });

  router.get('/me', (req, res) => {
    const token = parseCookies(req).dms_session, session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); return res.status(401).json({ authenticated:false }); }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    const u = session.user;
    res.json({ authenticated:true, user:{ userId:u.userId, username:u.username, name:u.name, family:u.family, isAdmin:u.isAdmin }, permissions:[...u.permissions] });
  });

  /* Actionable request count used by the sidebar notification badge. This is intentionally
     independent of Notifications.IsRead: a request remains counted until the user has
     actually taken the workflow action assigned to them. */
  router.get('/pending-drawing-count', authenticate, async (req, res) => {
    const userId = Number(req.user.userId);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(401).json({ error:'Authentication required.' });
    const permissions = req.user.permissions;
    const db = new sql.Request();
    db.input('userId', sql.Int, userId);
    db.input('canAssign', sql.Bit, permissions.has('REQUEST_DRAWING_ASSIGN'));
    db.input('canFinalApprove', sql.Bit, permissions.has('REQUEST_DRAWING_FINAL_APPROVE'));
    try {
      const result = await db.query(`
        SELECT COUNT(DISTINCT dr.RequestID) AS PendingCount
        FROM dbo.DrawingRequests dr
        INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID
        WHERE
          (s.StatusCode=N'PENDING_MANAGER' AND dr.ManagerUserID=@userId)
          OR (s.StatusCode IN (N'ASSIGNED',N'TRANSFERRED',N'RETURNED_FOR_CORRECTION') AND dr.AssignedDrawingExpertID=@userId)
          OR (s.StatusCode=N'PENDING_DRAWING_APPROVAL' AND @canAssign=1)
          OR (s.StatusCode=N'PENDING_FINAL_APPROVAL' AND @canFinalApprove=1);`);
      res.json({ pendingCount:Number(result.recordset[0]?.PendingCount || 0) });
    } catch (e) { console.error('Pending drawing request count failed:', e.message); res.status(500).json({ error:'Pending drawing request count failed.' }); }
  });

  function parseNonNegativeInt(value, label, required = false) {
    if (value === undefined || value === null || value === '') {
      if (required) throw Object.assign(new Error(label + ' is required.'), { statusCode:400 });
      return null;
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) throw Object.assign(new Error(label + ' must be a non-negative integer.'), { statusCode:400 });
    return n;
  }

  function parseDate(value, label, required = false) {
    if (value === undefined || value === null || value === '') {
      if (required) throw Object.assign(new Error(label + ' is required.'), { statusCode:400 });
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw Object.assign(new Error(label + ' must use YYYY-MM-DD.'), { statusCode:400 });
    const d = new Date(String(value) + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== String(value)) throw Object.assign(new Error(label + ' is invalid.'), { statusCode:400 });
    return String(value);
  }

  async function getExpertAssignment(requestId, userId, allowedStatuses) {
    const r = new sql.Request();
    r.input('requestId', sql.Int, requestId); r.input('userId', sql.Int, userId);
    const q = await r.query(`
      SELECT TOP 1 a.AssignmentID,a.RequestID,a.DrawingExpertUserID,a.IsCurrent,a.AssignmentStatus,s.StatusCode
      FROM dbo.DrawingRequestAssignments a
      INNER JOIN dbo.DrawingRequests dr ON dr.RequestID=a.RequestID
      INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID
      WHERE a.RequestID=@requestId AND a.DrawingExpertUserID=@userId AND a.IsCurrent=1
        AND s.StatusCode IN (${allowedStatuses.map((_,i)=>'@status'+i).join(',')});`);
    allowedStatuses.forEach((status,i)=>r.input('status'+i, sql.NVarChar(50), status));
    return q.recordset[0] || null;
  }

  router.get('/expert-work/:requestId', authenticate, async (req, res) => {
    const requestId = Number(req.params.requestId);
    if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error:'Invalid Request ID.' });
    try {
      const access = new sql.Request(); access.input('requestId', sql.Int, requestId); access.input('userId', sql.Int, req.user.userId);
      const ar = await access.query(`
        SELECT TOP 1 dr.RequestID,dr.RequestNumber,dr.AssignedDrawingExpertID,
          CASE WHEN dr.AssignedDrawingExpertID=@userId THEN 1 ELSE 0 END AS IsCurrentExpert,
          CASE WHEN EXISTS(SELECT 1 FROM dbo.DrawingRequestAssignments pa WHERE pa.RequestID=dr.RequestID AND pa.DrawingExpertUserID=@userId) THEN 1 ELSE 0 END AS WasAssigned
        FROM dbo.DrawingRequests dr WHERE dr.RequestID=@requestId;`);
      const request = ar.recordset[0];
      if (!request) return res.status(404).json({ error:'Drawing request not found.' });
      const canAll = req.user.permissions.has('REQUEST_DRAWING_VIEW_ALL');
      if (!canAll && Number(request.IsCurrentExpert)!==1 && Number(request.WasAssigned)!==1) return res.status(403).json({ error:'Permission denied.' });
      const q = new sql.Request(); q.input('requestId', sql.Int, requestId);
      const result = await q.query(`
        SELECT a.AssignmentID,a.DrawingExpertUserID,a.DrawingExpertUsername,a.AssignedAt,a.AcceptedAt,a.CompletedAt,a.IsCurrent,a.AssignmentStatus,
          w.ExpertWorkID,w.PredictedPartCount,w.CroquisStartDate,w.CroquisEndDate,w.CroquisPartCount,
          w.ModelingStartDate,w.ModelingEndDate,w.ModelingPartCount,w.DrawingStartDate,w.DrawingEndDate,w.StandardPartCount,w.DrawnPartCount,
          u.Name AS ExpertName,u.Family AS ExpertFamily
        FROM dbo.DrawingRequestAssignments a
        INNER JOIN dbo.Users u ON u.UserID=a.DrawingExpertUserID
        LEFT JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID
        WHERE a.RequestID=@requestId ORDER BY a.AssignedAt ASC,a.AssignmentID ASC;`);
      const rows=result.recordset;
      res.json({ request, contributions:rows, totals:{
        predictedPartCount:rows.reduce((s,x)=>s+Number(x.PredictedPartCount||0),0),
        croquisPartCount:rows.reduce((s,x)=>s+Number(x.CroquisPartCount||0),0),
        modelingPartCount:rows.reduce((s,x)=>s+Number(x.ModelingPartCount||0),0),
        standardPartCount:rows.reduce((s,x)=>s+Number(x.StandardPartCount||0),0),
        drawnPartCount:rows.reduce((s,x)=>s+Number(x.DrawnPartCount||0),0)
      }});
    } catch(e) { console.error('Expert work load failed:',e); res.status(500).json({error:'Expert work load failed.'}); }
  });

  router.post('/expert-work/:requestId/prediction', authenticate, requirePermission('REQUEST_DRAWING_ACCEPT'), async (req, res) => {
    const requestId=Number(req.params.requestId);
    if(!Number.isInteger(requestId)||requestId<=0)return res.status(400).json({error:'Invalid Request ID.'});
    try {
      const predicted=parseNonNegativeInt(req.body?.predictedPartCount,'Predicted part count',true);
      const assignment=await getExpertAssignment(requestId,req.user.userId,['ASSIGNED','TRANSFERRED']);
      if(!assignment)return res.status(403).json({error:'This request is not currently assigned to you for acceptance.'});
      const db=new sql.Request();
      db.input('assignmentId',sql.Int,assignment.AssignmentID); db.input('predicted',sql.Int,predicted);
      await db.query(`
        IF EXISTS(SELECT 1 FROM dbo.DrawingRequestExpertWork WHERE AssignmentID=@assignmentId)
          UPDATE dbo.DrawingRequestExpertWork SET PredictedPartCount=@predicted,UpdatedAt=SYSUTCDATETIME() WHERE AssignmentID=@assignmentId;
        ELSE
          INSERT INTO dbo.DrawingRequestExpertWork(AssignmentID,PredictedPartCount) VALUES(@assignmentId,@predicted);`);
      await writeAudit(req.user.userId,req.user.username,'EXPERT_PREDICTED_PART_COUNT',getClientIp(req));
      res.json({success:true,assignmentId:Number(assignment.AssignmentID),predictedPartCount:predicted});
    } catch(e){console.error('Expert prediction save failed:',e);res.status(e.statusCode||500).json({error:e.message||'Expert prediction save failed.'});}
  });

  router.post('/expert-work/:requestId/save', authenticate, requirePermission('REQUEST_DRAWING_COMPLETE'), async (req, res) => {
    const requestId=Number(req.params.requestId);
    if(!Number.isInteger(requestId)||requestId<=0)return res.status(400).json({error:'Invalid Request ID.'});
    try {
      const assignment=await getExpertAssignment(requestId,req.user.userId,['IN_PROGRESS','RETURNED_FOR_CORRECTION']);
      if(!assignment)return res.status(403).json({error:'This request is not currently assigned to you for drawing work.'});
      const body=req.body||{};
      const fields={
        CroquisStartDate:parseDate(body.croquisStartDate,'Croquis start date'),CroquisEndDate:parseDate(body.croquisEndDate,'Croquis end date'),CroquisPartCount:parseNonNegativeInt(body.croquisPartCount,'Croquis part count'),
        ModelingStartDate:parseDate(body.modelingStartDate,'Modeling start date'),ModelingEndDate:parseDate(body.modelingEndDate,'Modeling end date'),ModelingPartCount:parseNonNegativeInt(body.modelingPartCount,'Modeling part count'),
        DrawingStartDate:parseDate(body.drawingStartDate,'Drawing start date'),DrawingEndDate:parseDate(body.drawingEndDate,'Drawing end date'),StandardPartCount:parseNonNegativeInt(body.standardPartCount,'Standard part count'),DrawnPartCount:parseNonNegativeInt(body.drawnPartCount,'Drawn part count')
      };
      const groups=[['CroquisStartDate','CroquisEndDate','CroquisPartCount','Croquis'],['ModelingStartDate','ModelingEndDate','ModelingPartCount','Modeling'],['DrawingStartDate','DrawingEndDate','StandardPartCount','DrawnPartCount','Drawing']];
      for(const g of groups){const vals=g.slice(0,-1).map(k=>fields[k]);const any=vals.some(v=>v!==null);const all=vals.every(v=>v!==null);if(any&&!all)throw Object.assign(new Error(g[g.length-1]+' fields must be completed together.'),{statusCode:400});}
      if(fields.CroquisStartDate&&fields.CroquisEndDate&&fields.CroquisEndDate<fields.CroquisStartDate)throw Object.assign(new Error('Croquis end date cannot precede start date.'),{statusCode:400});
      if(fields.ModelingStartDate&&fields.ModelingEndDate&&fields.ModelingEndDate<fields.ModelingStartDate)throw Object.assign(new Error('Modeling end date cannot precede start date.'),{statusCode:400});
      if(fields.DrawingStartDate&&fields.DrawingEndDate&&fields.DrawingEndDate<fields.DrawingStartDate)throw Object.assign(new Error('Drawing end date cannot precede start date.'),{statusCode:400});
      const db=new sql.Request(); db.input('assignmentId',sql.Int,assignment.AssignmentID);
      for(const [k,v] of Object.entries(fields)) db.input(k, k.includes('Date')?sql.Date:sql.Int, v);
      await db.query(`
        IF EXISTS(SELECT 1 FROM dbo.DrawingRequestExpertWork WHERE AssignmentID=@assignmentId)
          UPDATE dbo.DrawingRequestExpertWork SET CroquisStartDate=COALESCE(@CroquisStartDate,CroquisStartDate),CroquisEndDate=COALESCE(@CroquisEndDate,CroquisEndDate),CroquisPartCount=COALESCE(@CroquisPartCount,CroquisPartCount),ModelingStartDate=COALESCE(@ModelingStartDate,ModelingStartDate),ModelingEndDate=COALESCE(@ModelingEndDate,ModelingEndDate),ModelingPartCount=COALESCE(@ModelingPartCount,ModelingPartCount),DrawingStartDate=COALESCE(@DrawingStartDate,DrawingStartDate),DrawingEndDate=COALESCE(@DrawingEndDate,DrawingEndDate),StandardPartCount=COALESCE(@StandardPartCount,StandardPartCount),DrawnPartCount=COALESCE(@DrawnPartCount,DrawnPartCount),UpdatedAt=SYSUTCDATETIME() WHERE AssignmentID=@assignmentId;
        ELSE
          INSERT INTO dbo.DrawingRequestExpertWork(AssignmentID,CroquisStartDate,CroquisEndDate,CroquisPartCount,ModelingStartDate,ModelingEndDate,ModelingPartCount,DrawingStartDate,DrawingEndDate,StandardPartCount,DrawnPartCount) VALUES(@assignmentId,@CroquisStartDate,@CroquisEndDate,@CroquisPartCount,@ModelingStartDate,@ModelingEndDate,@ModelingPartCount,@DrawingStartDate,@DrawingEndDate,@StandardPartCount,@DrawnPartCount);`);
      await writeAudit(req.user.userId,req.user.username,'EXPERT_WORK_DATA_SAVED',getClientIp(req));
      res.json({success:true,assignmentId:Number(assignment.AssignmentID)});
    } catch(e){console.error('Expert work save failed:',e);res.status(e.statusCode||500).json({error:e.message||'Expert work save failed.'});}
  });

  function cleanup() {
    const now=Date.now();
    for(const [token,session] of sessions)if(session.expiresAt<=now)sessions.delete(token);
    for(const [ip,state] of loginAttempts)if(state.blockedUntil<=now&&now-state.firstAt>LOGIN_WINDOW_MS)loginAttempts.delete(ip);
    for(const [ip,state] of apiRateLimits)if(now-state.startedAt>API_WINDOW_MS)apiRateLimits.delete(ip);
  }

  return { router, securityHeaders, authenticate, requirePermission, requireAdmin, writeAudit,
    apiSecurity:(req,res,next)=>apiRateLimit(req,res,err=>{if(err)return next(err);csrfGuard(req,res,next);}),
    authenticatePage, authenticateAdminPage, cleanup };
}

module.exports={createAuth};
