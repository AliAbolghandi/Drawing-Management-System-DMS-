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

  const clientIp = req => String(req.ip || req.socket.remoteAddress || '').trim();

  function cookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i <= 0) continue;
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch (_) {}
    }
    return out;
  }

  function setCookie(res, token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `dms_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`);
  }

  function clearCookie(res) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `dms_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  }

  function createSession(user) {
    const token = crypto.randomBytes(48).toString('base64url');
    sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
    return token;
  }

  function verifyPassword(password, stored) {
    return new Promise((resolve, reject) => {
      try {
        if (!password || typeof stored !== 'string') return resolve(false);
        const p = stored.split('$');
        if (p.length !== 6 || p[0] !== 'scrypt') return resolve(false);
        const N = Number(p[1]), r = Number(p[2]), costP = Number(p[3]);
        const salt = Buffer.from(p[4], 'base64');
        const expected = Buffer.from(p[5], 'base64');
        if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(costP) || !salt.length || expected.length < 16 || expected.length > 128) return resolve(false);
        if (N < 2 || (N & (N - 1)) !== 0 || r <= 0 || costP <= 0) return resolve(false);
        crypto.scrypt(password, salt, expected.length, { N, r, p: costP, maxmem: 128 * 1024 * 1024 }, (err, derived) => {
          if (err) return reject(err);
          resolve(crypto.timingSafeEqual(expected, derived));
        });
      } catch (e) { reject(e); }
    });
  }

  async function writeAudit(userId, username, action, ip) {
    try {
      const r = new sql.Request();
      r.input('userId', sql.Int, userId == null ? null : userId);
      r.input('username', sql.NVarChar(100), username || null);
      r.input('action', sql.NVarChar(100), action);
      r.input('ip', sql.NVarChar(64), ip || null);
      await r.query('INSERT INTO dbo.Logs (UserID,UserName,Action,IPAddress,CreatedAt) VALUES (@userId,@username,@action,@ip,SYSUTCDATETIME());');
    } catch (e) { console.warn('Audit log failed:', e.message); }
  }

  function authenticate(req, res, next) {
    const token = cookies(req).dms_session;
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

  function requirePermission(code) {
    return (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
      if (code && req.user.permissions.has(code)) return next();
      return res.status(403).json({ error: 'Permission denied.' });
    };
  }

  function requireAdmin() {
    return async (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
      try {
        const r = new sql.Request();
        r.input('userId', sql.Int, req.user.userId);
        const q = await r.query("SELECT TOP 1 1 AS IsAdmin FROM dbo.UserRoles ur INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID INNER JOIN dbo.Users u ON u.UserID=ur.UserID WHERE ur.UserID=@userId AND u.IsActive=1 AND r.RoleCode=N'Admin' AND r.IsActive=1;");
        if (!q.recordset.length) return res.status(403).json({ error: 'Admin access required.' });
        next();
      } catch (e) { console.error('Admin authorization check failed:', e.message); res.status(500).json({ error: 'Authorization service is unavailable.' }); }
    };
  }

  function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const pages = new Set(['/management.html', '/admin-dashboard.html']);
    if (pages.has(req.path)) return authenticateAdminPage(req, res, next);
    next();
  }

  function rateLimit(req, res, next) {
    const key = clientIp(req), now = Date.now();
    let state = apiRateLimits.get(key);
    if (!state || now - state.startedAt >= API_WINDOW_MS) { state = { startedAt: now, count: 0 }; apiRateLimits.set(key, state); }
    state.count++;
    if (state.count > API_MAX_REQUESTS) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((API_WINDOW_MS - (now - state.startedAt)) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
  }

  function csrf(req, res, next) {
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
    const token = cookies(req).dms_session, session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); return res.redirect('/login.html'); }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    req.user = session.user;
    next();
  }

  function authenticateAdminPage(req, res, next) {
    const token = cookies(req).dms_session, session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) { if (token) sessions.delete(token); return res.redirect('/login.html'); }
    if (!session.user?.isAdmin) return res.status(403).send('Admin access required.');
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    req.user = session.user;
    next();
  }

  router.post('/login', async (req, res) => {
    const ip = clientIp(req), now = Date.now();
    const state = loginAttempts.get(ip) || { count: 0, firstAt: now, blockedUntil: 0 };
    if (state.blockedUntil > now) return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    if (now - state.firstAt > LOGIN_WINDOW_MS) { state.count = 0; state.firstAt = now; state.blockedUntil = 0; }
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });
    try {
      const r = new sql.Request(); r.input('username', sql.NVarChar(100), username);
      const q = await r.query("SELECT TOP 1 u.UserID,u.Username,u.Name,u.Family,u.PasswordHash,u.IsActive, CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.UserRoles ur INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID WHERE ur.UserID=u.UserID AND rr.RoleCode='Admin' AND rr.IsActive=1) THEN 1 ELSE 0 END AS bit) AS IsAdmin FROM dbo.Users u WHERE u.Username=@username;");
      const user = q.recordset[0];
      const valid = user && Number(user.IsActive) === 1 && await verifyPassword(password, user.PasswordHash);
      if (!valid) { state.count++; if (state.count >= LOGIN_MAX_ATTEMPTS) state.blockedUntil = now + LOGIN_WINDOW_MS; loginAttempts.set(ip, state); await writeAudit(user?.UserID || null, username, 'LOGIN_FAILED', ip); return res.status(401).json({ error: 'Invalid username or password.' }); }
      const p = new sql.Request(); p.input('userId', sql.Int, user.UserID);
      const pr = await p.query("SELECT DISTINCT p.PermissionCode FROM dbo.UserRoles ur INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1 WHERE ur.UserID=@userId;");
      const permissions = new Set(pr.recordset.map(x => String(x.PermissionCode)));
      const sessionUser = { userId:Number(user.UserID), username:String(user.Username), name:user.Name||'', family:user.Family||'', isAdmin:Number(user.IsAdmin)===1, permissions };
      setCookie(res, createSession(sessionUser)); loginAttempts.delete(ip);
      const u = new sql.Request(); u.input('userId', sql.Int, user.UserID); await u.query('UPDATE dbo.Users SET LastLoginAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId;');
      await writeAudit(user.UserID, user.Username, 'LOGIN_SUCCESS', ip);
      res.json({ success:true, user:{ userId:sessionUser.userId, username:sessionUser.username, name:sessionUser.name, family:sessionUser.family } });
    } catch (e) { console.error('Login failed:', e); res.status(500).json({ error:'Login service is unavailable.' }); }
  });

  router.post('/logout', async (req, res) => { const token=cookies(req).dms_session, session=token?sessions.get(token):null; if(session){await writeAudit(session.user.userId,session.user.username,'LOGOUT',clientIp(req));sessions.delete(token);} clearCookie(res); res.json({success:true}); });
  router.get('/me', async (req,res) => {
    const token = cookies(req).dms_session;
    const session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return res.status(401).json({ authenticated: false });
    }
    try {
      // Permissions are intentionally refreshed from SQL on every /me request,
      // so RolePermissions changes take effect without requiring a new login.
      const r = new sql.Request();
      r.input('userId', sql.Int, session.user.userId);
      const q = await r.query(`
        SELECT u.UserID, u.Username, u.Name, u.Family, u.IsActive,
          CAST(CASE WHEN EXISTS (
            SELECT 1 FROM dbo.UserRoles ur
            INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID
            WHERE ur.UserID=u.UserID AND rr.RoleCode=N'Admin' AND rr.IsActive=1
          ) THEN 1 ELSE 0 END AS bit) AS IsAdmin
        FROM dbo.Users u WHERE u.UserID=@userId;
        SELECT DISTINCT p.PermissionCode
        FROM dbo.UserRoles ur
        INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1
        INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID
        INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1
        INNER JOIN dbo.Users u ON u.UserID=ur.UserID AND u.IsActive=1
        WHERE ur.UserID=@userId;
      `);
      const userRow = q.recordsets?.[0]?.[0];
      if (!userRow || Number(userRow.IsActive) !== 1) {
        sessions.delete(token);
        clearCookie(res);
        return res.status(401).json({ authenticated: false });
      }
      const u = session.user;
      u.username = String(userRow.Username || u.username);
      u.name = userRow.Name || '';
      u.family = userRow.Family || '';
      u.isAdmin = Number(userRow.IsAdmin) === 1;
      u.permissions = new Set((q.recordsets?.[1] || []).map(row => String(row.PermissionCode)));
      session.expiresAt = Date.now() + SESSION_TTL_MS;
      return res.set('Cache-Control', 'no-store').json({
        authenticated: true,
        user: { userId: u.userId, username: u.username, name: u.name, family: u.family, isAdmin: u.isAdmin },
        permissions: [...u.permissions]
      });
    } catch (e) {
      console.error('Auth permission refresh failed:', e.message);
      return res.status(500).json({ error: 'Unable to refresh user permissions.' });
    }
  });

  router.get('/expert-reports', authenticate, requirePermission('DASHBOARD_REPORT_EXPERT'), async (req,res) => {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) return res.status(400).json({ error: 'A valid Gregorian date range is required.' });
    try {
      const q = new sql.Request();
      q.input('startDate', sql.Date, startDate); q.input('endDate', sql.Date, endDate);
      const result = await q.query(`
        DECLARE @CompletedStages TABLE (
          AssignmentID int NOT NULL, RequestID int NOT NULL, UserID int NULL,
          ExpertName nvarchar(300) NOT NULL, ExpertUsername nvarchar(100) NULL,
          ProductionDate date NOT NULL, Stage nvarchar(20) NOT NULL, PartCount int NOT NULL
        );
        INSERT INTO @CompletedStages (AssignmentID,RequestID,UserID,ExpertName,ExpertUsername,ProductionDate,Stage,PartCount)
        SELECT a.AssignmentID,a.RequestID,a.DrawingExpertUserID,
          COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(u.Name,N' ',u.Family))),N''),a.DrawingExpertUsername,u.Username,N'Unknown'),
          a.DrawingExpertUsername,w.CroquisEndDate,N'Croquis',CASE WHEN w.CroquisPartCount>0 THEN w.CroquisPartCount ELSE 0 END
        FROM dbo.DrawingRequestAssignments a INNER JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID LEFT JOIN dbo.Users u ON u.UserID=a.DrawingExpertUserID
        WHERE w.CroquisEndDate BETWEEN @startDate AND @endDate;
        INSERT INTO @CompletedStages
        SELECT a.AssignmentID,a.RequestID,a.DrawingExpertUserID,
          COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(u.Name,N' ',u.Family))),N''),a.DrawingExpertUsername,u.Username,N'Unknown'),
          a.DrawingExpertUsername,w.ModelingEndDate,N'Modeling',CASE WHEN w.ModelingPartCount>0 THEN w.ModelingPartCount ELSE 0 END
        FROM dbo.DrawingRequestAssignments a INNER JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID LEFT JOIN dbo.Users u ON u.UserID=a.DrawingExpertUserID
        WHERE w.ModelingEndDate BETWEEN @startDate AND @endDate;
        INSERT INTO @CompletedStages
        SELECT a.AssignmentID,a.RequestID,a.DrawingExpertUserID,
          COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(u.Name,N' ',u.Family))),N''),a.DrawingExpertUsername,u.Username,N'Unknown'),
          a.DrawingExpertUsername,w.DrawingEndDate,N'Standard',CASE WHEN w.StandardPartCount>0 THEN w.StandardPartCount ELSE 0 END
        FROM dbo.DrawingRequestAssignments a INNER JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID LEFT JOIN dbo.Users u ON u.UserID=a.DrawingExpertUserID
        WHERE w.DrawingEndDate BETWEEN @startDate AND @endDate;
        INSERT INTO @CompletedStages
        SELECT a.AssignmentID,a.RequestID,a.DrawingExpertUserID,
          COALESCE(NULLIF(LTRIM(RTRIM(CONCAT(u.Name,N' ',u.Family))),N''),a.DrawingExpertUsername,u.Username,N'Unknown'),
          a.DrawingExpertUsername,w.DrawingEndDate,N'Drawn',CASE WHEN w.DrawnPartCount>0 THEN w.DrawnPartCount ELSE 0 END
        FROM dbo.DrawingRequestAssignments a INNER JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID LEFT JOIN dbo.Users u ON u.UserID=a.DrawingExpertUserID
        WHERE w.DrawingEndDate BETWEEN @startDate AND @endDate;

        SELECT UserID,ExpertName,ExpertUsername,
          SUM(CASE WHEN Stage=N'Croquis' THEN PartCount ELSE 0 END) AS CroquisParts,
          SUM(CASE WHEN Stage=N'Modeling' THEN PartCount ELSE 0 END) AS ModelingParts,
          SUM(CASE WHEN Stage=N'Standard' THEN PartCount ELSE 0 END) AS StandardParts,
          SUM(CASE WHEN Stage=N'Drawn' THEN PartCount ELSE 0 END) AS DrawnParts,
          SUM(PartCount) AS TotalParts
        FROM @CompletedStages WHERE PartCount>0
        GROUP BY UserID,ExpertName,ExpertUsername;

        SELECT ProductionDate,UserID,ExpertName,ExpertUsername,SUM(PartCount) AS TotalParts
        FROM @CompletedStages WHERE PartCount>0
        GROUP BY ProductionDate,UserID,ExpertName,ExpertUsername
        ORDER BY ProductionDate,ExpertName;
      `);
      res.json({ startDate, endDate, experts: result.recordsets[0] || [], daily: result.recordsets[1] || [] });
    } catch (e) { console.error('Expert reports load failed:', e); res.status(500).json({ error: 'Expert reports load failed.' }); }
  });

  router.get('/pending-drawing-count', authenticate, async (req,res) => {
    const r=new sql.Request();r.input('userId',sql.Int,req.user.userId);r.input('canAssign',sql.Bit,req.user.permissions.has('REQUEST_DRAWING_ASSIGN'));r.input('canFinalApprove',sql.Bit,req.user.permissions.has('REQUEST_DRAWING_FINAL_APPROVE'));
    try { const q=await r.query("SELECT COUNT(DISTINCT dr.RequestID) AS PendingCount FROM dbo.DrawingRequests dr INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID WHERE (s.StatusCode=N'PENDING_MANAGER' AND dr.ManagerUserID=@userId) OR (s.StatusCode IN (N'ASSIGNED',N'TRANSFERRED',N'RETURNED_FOR_CORRECTION') AND dr.AssignedDrawingExpertID=@userId) OR (s.StatusCode=N'PENDING_DRAWING_APPROVAL' AND @canAssign=1) OR (s.StatusCode=N'PENDING_FINAL_APPROVAL' AND @canFinalApprove=1);");res.json({pendingCount:Number(q.recordset[0]?.PendingCount||0)}); }
    catch(e){console.error('Pending drawing request count failed:',e.message);res.status(500).json({error:'Pending drawing request count failed.'});}
  });

  const nonNegative = (v,label,required=false) => { if(v===undefined||v===null||v===''){if(required)throw Object.assign(new Error(label+' is required.'),{statusCode:400});return null;}const n=Number(v);if(!Number.isInteger(n)||n<0)throw Object.assign(new Error(label+' must be a non-negative integer.'),{statusCode:400});return n; };
  const validDate = (v,label,required=false) => { if(v===undefined||v===null||v===''){if(required)throw Object.assign(new Error(label+' is required.'),{statusCode:400});return null;}if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v)))throw Object.assign(new Error(label+' must use YYYY-MM-DD.'),{statusCode:400});const d=new Date(String(v)+'T00:00:00Z');if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==String(v))throw Object.assign(new Error(label+' is invalid.'),{statusCode:400});return String(v); };

  async function currentExpertAssignment(requestId,userId,statuses){
    const r=new sql.Request();r.input('requestId',sql.Int,requestId);r.input('userId',sql.Int,userId);
    statuses.forEach((s,i)=>r.input('status'+i,sql.NVarChar(50),s));
    const q=await r.query(`SELECT TOP 1 a.AssignmentID,a.RequestID,a.DrawingExpertUserID,a.IsCurrent,a.AssignmentStatus,s.StatusCode FROM dbo.DrawingRequestAssignments a INNER JOIN dbo.DrawingRequests dr ON dr.RequestID=a.RequestID INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID WHERE a.RequestID=@requestId AND a.DrawingExpertUserID=@userId AND a.IsCurrent=1 AND s.StatusCode IN (${statuses.map((_,i)=>'@status'+i).join(',')});`);
    return q.recordset[0]||null;
  }

  router.get('/expert-work/:requestId',authenticate,async(req,res)=>{
    const requestId=Number(req.params.requestId);if(!Number.isInteger(requestId)||requestId<=0)return res.status(400).json({error:'Invalid Request ID.'});
    try{const a=new sql.Request();a.input('requestId',sql.Int,requestId);a.input('userId',sql.Int,req.user.userId);const access=await a.query("SELECT TOP 1 dr.RequestID,dr.RequestNumber,dr.AssignedDrawingExpertID,CASE WHEN dr.AssignedDrawingExpertID=@userId THEN 1 ELSE 0 END AS IsCurrentExpert,CASE WHEN EXISTS(SELECT 1 FROM dbo.DrawingRequestAssignments x WHERE x.RequestID=dr.RequestID AND x.DrawingExpertUserID=@userId) THEN 1 ELSE 0 END AS WasAssigned FROM dbo.DrawingRequests dr WHERE dr.RequestID=@requestId;");const request=access.recordset[0];if(!request)return res.status(404).json({error:'Drawing request not found.'});if(!req.user.permissions.has('REQUEST_DRAWING_VIEW_ALL')&&Number(request.IsCurrentExpert)!==1&&Number(request.WasAssigned)!==1)return res.status(403).json({error:'Permission denied.'});const q=new sql.Request();q.input('requestId',sql.Int,requestId);const result=await q.query("SELECT a.AssignmentID,a.DrawingExpertUserID,a.DrawingExpertUsername,a.AssignedAt,a.AcceptedAt,a.CompletedAt,a.IsCurrent,a.AssignmentStatus,w.ExpertWorkID,w.PredictedPartCount,w.CroquisStartDate,w.CroquisEndDate,w.CroquisPartCount,w.ModelingStartDate,w.ModelingEndDate,w.ModelingPartCount,w.DrawingStartDate,w.DrawingEndDate,w.StandardPartCount,w.DrawnPartCount,u.Name AS ExpertName,u.Family AS ExpertFamily FROM dbo.DrawingRequestAssignments a INNER JOIN dbo.Users u ON u.UserID=a.DrawingExpertUserID LEFT JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID WHERE a.RequestID=@requestId ORDER BY a.AssignedAt ASC,a.AssignmentID ASC;");const rows=result.recordset;res.json({request,contributions:rows,totals:{predictedPartCount:rows.reduce((s,x)=>s+Number(x.PredictedPartCount||0),0),croquisPartCount:rows.reduce((s,x)=>s+Number(x.CroquisPartCount||0),0),modelingPartCount:rows.reduce((s,x)=>s+Number(x.ModelingPartCount||0),0),standardPartCount:rows.reduce((s,x)=>s+Number(x.StandardPartCount||0),0),drawnPartCount:rows.reduce((s,x)=>s+Number(x.DrawnPartCount||0),0)}});}catch(e){console.error('Expert work load failed:',e);res.status(500).json({error:'Expert work load failed.'});}
  });

  router.post('/expert-work/:requestId/prediction',authenticate,requirePermission('REQUEST_DRAWING_ACCEPT'),async(req,res)=>{
    const requestId=Number(req.params.requestId);if(!Number.isInteger(requestId)||requestId<=0)return res.status(400).json({error:'Invalid Request ID.'});
    try{const predicted=nonNegative(req.body?.predictedPartCount,'Predicted part count',true);const a=await currentExpertAssignment(requestId,req.user.userId,['ASSIGNED','TRANSFERRED']);if(!a)return res.status(403).json({error:'This request is not currently assigned to you for acceptance.'});const q=new sql.Request();q.input('assignmentId',sql.Int,a.AssignmentID);q.input('predicted',sql.Int,predicted);await q.query("IF EXISTS(SELECT 1 FROM dbo.DrawingRequestExpertWork WHERE AssignmentID=@assignmentId) UPDATE dbo.DrawingRequestExpertWork SET PredictedPartCount=@predicted,UpdatedAt=SYSUTCDATETIME() WHERE AssignmentID=@assignmentId; ELSE INSERT INTO dbo.DrawingRequestExpertWork(AssignmentID,PredictedPartCount) VALUES(@assignmentId,@predicted);");await writeAudit(req.user.userId,req.user.username,'EXPERT_PREDICTED_PART_COUNT',clientIp(req));res.json({success:true,assignmentId:Number(a.AssignmentID),predictedPartCount:predicted});}catch(e){console.error('Expert prediction save failed:',e);res.status(e.statusCode||500).json({error:e.message||'Expert prediction save failed.'});}
  });

  router.post('/expert-work/:requestId/save',authenticate,requirePermission('REQUEST_DRAWING_COMPLETE'),async(req,res)=>{
    const requestId=Number(req.params.requestId);if(!Number.isInteger(requestId)||requestId<=0)return res.status(400).json({error:'Invalid Request ID.'});
    try{const a=await currentExpertAssignment(requestId,req.user.userId,['IN_PROGRESS','RETURNED_FOR_CORRECTION']);if(!a)return res.status(403).json({error:'This request is not currently assigned to you for drawing work.'});const b=req.body||{};const f={CroquisStartDate:validDate(b.croquisStartDate,'Croquis start date'),CroquisEndDate:validDate(b.croquisEndDate,'Croquis end date'),CroquisPartCount:nonNegative(b.croquisPartCount,'Croquis part count'),ModelingStartDate:validDate(b.modelingStartDate,'Modeling start date'),ModelingEndDate:validDate(b.modelingEndDate,'Modeling end date'),ModelingPartCount:nonNegative(b.modelingPartCount,'Modeling part count'),DrawingStartDate:validDate(b.drawingStartDate,'Drawing start date'),DrawingEndDate:validDate(b.drawingEndDate,'Drawing end date'),StandardPartCount:nonNegative(b.standardPartCount,'Standard part count'),DrawnPartCount:nonNegative(b.drawnPartCount,'Drawn part count')};const groups=[['CroquisStartDate','CroquisEndDate','CroquisPartCount','Croquis'],['ModelingStartDate','ModelingEndDate','ModelingPartCount','Modeling'],['DrawingStartDate','DrawingEndDate','StandardPartCount','DrawnPartCount','Drawing']];for(const g of groups){const vals=g.slice(0,-1).map(k=>f[k]);if(vals.some(v=>v!==null)&&vals.some(v=>v===null))throw Object.assign(new Error(g[g.length-1]+' fields must be completed together.'),{statusCode:400});}for(const [start,end,name] of [['CroquisStartDate','CroquisEndDate','Croquis'],['ModelingStartDate','ModelingEndDate','Modeling'],['DrawingStartDate','DrawingEndDate','Drawing']])if(f[start]&&f[end]&&f[end]<f[start])throw Object.assign(new Error(name+' end date cannot precede start date.'),{statusCode:400});const q=new sql.Request();q.input('assignmentId',sql.Int,a.AssignmentID);for(const[k,v]of Object.entries(f))q.input(k,k.includes('Date')?sql.Date:sql.Int,v);await q.query("IF EXISTS(SELECT 1 FROM dbo.DrawingRequestExpertWork WHERE AssignmentID=@assignmentId) UPDATE dbo.DrawingRequestExpertWork SET CroquisStartDate=COALESCE(@CroquisStartDate,CroquisStartDate),CroquisEndDate=COALESCE(@CroquisEndDate,CroquisEndDate),CroquisPartCount=COALESCE(@CroquisPartCount,CroquisPartCount),ModelingStartDate=COALESCE(@ModelingStartDate,ModelingStartDate),ModelingEndDate=COALESCE(@ModelingEndDate,ModelingEndDate),ModelingPartCount=COALESCE(@ModelingPartCount,ModelingPartCount),DrawingStartDate=COALESCE(@DrawingStartDate,DrawingStartDate),DrawingEndDate=COALESCE(@DrawingEndDate,DrawingEndDate),StandardPartCount=COALESCE(@StandardPartCount,StandardPartCount),DrawnPartCount=COALESCE(@DrawnPartCount,DrawnPartCount),UpdatedAt=SYSUTCDATETIME() WHERE AssignmentID=@assignmentId; ELSE INSERT INTO dbo.DrawingRequestExpertWork(AssignmentID,CroquisStartDate,CroquisEndDate,CroquisPartCount,ModelingStartDate,ModelingEndDate,ModelingPartCount,DrawingStartDate,DrawingEndDate,StandardPartCount,DrawnPartCount) VALUES(@assignmentId,@CroquisStartDate,@CroquisEndDate,@CroquisPartCount,@ModelingStartDate,@ModelingEndDate,@ModelingPartCount,@DrawingStartDate,@DrawingEndDate,@StandardPartCount,@DrawnPartCount);");await writeAudit(req.user.userId,req.user.username,'EXPERT_WORK_DATA_SAVED',clientIp(req));res.json({success:true,assignmentId:Number(a.AssignmentID)});}catch(e){console.error('Expert work save failed:',e);res.status(e.statusCode||500).json({error:e.message||'Expert work save failed.'});}
  });

  function cleanup(){const now=Date.now();for(const[token,s]of sessions)if(s.expiresAt<=now)sessions.delete(token);for(const[ip,s]of loginAttempts)if(s.blockedUntil<=now&&now-s.firstAt>LOGIN_WINDOW_MS)loginAttempts.delete(ip);for(const[ip,s]of apiRateLimits)if(now-s.startedAt>API_WINDOW_MS)apiRateLimits.delete(ip);}
  return { router, securityHeaders, authenticate, requirePermission, requireAdmin, writeAudit, apiSecurity:(req,res,next)=>rateLimit(req,res,err=>{if(err)return next(err);csrf(req,res,next);}), authenticatePage, authenticateAdminPage, cleanup };
}

module.exports={createAuth};
