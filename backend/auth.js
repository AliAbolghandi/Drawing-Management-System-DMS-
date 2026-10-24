const express = require('express');
const crypto = require('crypto');
const sql = require('mssql/msnodesqlv8');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const API_WINDOW_MS = 60 * 1000;
const API_MAX_REQUESTS = 240;
const AUTH_REFRESH_MS = 15 * 1000;

function createAuth(frontendOrigins) {
  const router = express.Router();
  const sessions = new Map();
  const loginAttempts = new Map();
  const apiRateLimits = new Map();
  const accountAttempts = new Map();

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
    sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS, checkedAt: Date.now() });
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

  async function loadUserAccess(userId) {
    const r = new sql.Request();
    r.input('userId', sql.Int, userId);
    const q = await r.query(`
      SELECT u.UserID, u.Username, u.Name, u.Family, u.IsActive,
        CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.UserRoles ur INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID WHERE ur.UserID=u.UserID AND rr.RoleCode=N'Admin' AND rr.IsActive=1) THEN 1 ELSE 0 END AS bit) AS IsAdmin
      FROM dbo.Users u WHERE u.UserID=@userId;
      SELECT DISTINCT p.PermissionCode FROM dbo.UserRoles ur
        INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1
        INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID
        INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1
        WHERE ur.UserID=@userId;
    `);
    const row = q.recordsets?.[0]?.[0];
    if (!row) return null;
    return { active: Number(row.IsActive) === 1, username: String(row.Username || ''), name: row.Name || '', family: row.Family || '', isAdmin: Number(row.IsAdmin) === 1, permissions: new Set((q.recordsets?.[1] || []).map(x => String(x.PermissionCode))) };
  }

  async function authenticate(req, res, next) {
    const token = cookies(req).dms_session;
    const session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return res.status(401).json({ error: 'Authentication required.' });
    }
    // Re-validate active state, Admin role and permissions from SQL at most every AUTH_REFRESH_MS.
    if (!session.checkedAt || Date.now() - session.checkedAt > AUTH_REFRESH_MS) {
      try {
        const access = await loadUserAccess(session.user.userId);
        if (!access || !access.active) { sessions.delete(token); clearCookie(res); return res.status(401).json({ error: 'Authentication required.' }); }
        Object.assign(session.user, { username: access.username || session.user.username, name: access.name, family: access.family, isAdmin: access.isAdmin, permissions: access.permissions });
        session.checkedAt = Date.now();
      } catch (e) {
        console.error('Session re-validation failed:', e.message);
        return res.status(503).json({ error: 'Authorization service is unavailable.' });
      }
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
    const accountKey = username.toLowerCase().slice(0, 100);
    const acct = accountAttempts.get(accountKey) || { count: 0, firstAt: now, blockedUntil: 0 };
    if (acct.blockedUntil > now) return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    if (now - acct.firstAt > LOGIN_WINDOW_MS) { acct.count = 0; acct.firstAt = now; acct.blockedUntil = 0; }
    try {
      const r = new sql.Request(); r.input('username', sql.NVarChar(100), username);
      const q = await r.query("SELECT TOP 1 u.UserID,u.Username,u.Name,u.Family,u.PasswordHash,u.IsActive, CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.UserRoles ur INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID WHERE ur.UserID=u.UserID AND rr.RoleCode='Admin' AND rr.IsActive=1) THEN 1 ELSE 0 END AS bit) AS IsAdmin FROM dbo.Users u WHERE u.Username=@username;");
      const user = q.recordset[0];
      const valid = user && Number(user.IsActive) === 1 && await verifyPassword(password, user.PasswordHash);
      if (!valid) { acct.count++; if (acct.count >= LOGIN_MAX_ATTEMPTS) acct.blockedUntil = now + LOGIN_WINDOW_MS; accountAttempts.set(accountKey, acct); state.count++; if (state.count >= LOGIN_MAX_ATTEMPTS) state.blockedUntil = now + LOGIN_WINDOW_MS; loginAttempts.set(ip, state); await writeAudit(user?.UserID || null, username, 'LOGIN_FAILED', ip); return res.status(401).json({ error: 'Invalid username or password.' }); }
      const p = new sql.Request(); p.input('userId', sql.Int, user.UserID);
      const pr = await p.query("SELECT DISTINCT p.PermissionCode FROM dbo.UserRoles ur INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1 WHERE ur.UserID=@userId;");
      const permissions = new Set(pr.recordset.map(x => String(x.PermissionCode)));
      const sessionUser = { userId:Number(user.UserID), username:String(user.Username), name:user.Name||'', family:user.Family||'', isAdmin:Number(user.IsAdmin)===1, permissions };
      setCookie(res, createSession(sessionUser)); loginAttempts.delete(ip); accountAttempts.delete(accountKey);
      const u = new sql.Request(); u.input('userId', sql.Int, user.UserID); await u.query('UPDATE dbo.Users SET LastLoginAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId;');
      await writeAudit(user.UserID, user.Username, 'LOGIN_SUCCESS', ip);
      res.json({ success:true, user:{ userId:sessionUser.userId, username:sessionUser.username, name:sessionUser.name, family:sessionUser.family } });
    } catch (e) { console.error('Login failed:', e); res.status(500).json({ error:'Login service is unavailable.' }); }
  });

  router.post('/logout', async (req, res) => { const token=cookies(req).dms_session, session=token?sessions.get(token):null; if(session){await writeAudit(session.user.userId,session.user.username,'LOGOUT',clientIp(req));sessions.delete(token);} clearCookie(res); res.json({success:true}); });

  // Self-service profile APIs. Profile images stay outside static hosting in tblPath.PathID=5.
  const profileImageUpload = multer({ storage: multer.memoryStorage(), limits: { files: 1 } });

  function safeProfileUsername(username) {
    const value = String(username || '');
    return /^[A-Za-z0-9._@-]{1,100}$/.test(value) ? value : null;
  }

  async function profileImageLocation(username) {
    const safeUsername = safeProfileUsername(username);
    if (!safeUsername) throw new Error('Invalid active username for profile image storage.');
    const q = new sql.Request();
    const result = await q.query('SELECT TOP 1 RootPath FROM dbo.tblPath WHERE PathID=5;');
    const rootValue = result.recordset?.[0]?.RootPath;
    if (typeof rootValue !== 'string' || !rootValue.trim()) throw new Error('Profile image storage (tblPath.PathID=5) is not configured.');
    const root = path.resolve(rootValue);
    await fs.promises.mkdir(root, { recursive: true });
    return { root, safeUsername, files: ['jpg','png','webp'].map(ext => path.resolve(root, safeUsername + '.' + ext)) };
  }

  function profileImageType(buffer) {
    if (!Buffer.isBuffer(buffer)) return null;
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
    if (buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return { mime: 'image/png', ext: 'png' };
    if (buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
    return null;
  }

  router.get('/me/profile', rateLimit, authenticate, async (req, res) => {
    try {
      const q = new sql.Request();
      q.input('userId', sql.Int, req.user.userId);
      const result = await q.query(`
        SELECT u.UserID,u.Username,u.Name,u.Family,u.LastLoginAt,
          COALESCE(STUFF((SELECT N', ' + r.RoleName FROM dbo.UserRoles ur
            INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1
            WHERE ur.UserID=u.UserID FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),1,2,N''),N'Signed in') AS Role
        FROM dbo.Users u WHERE u.UserID=@userId AND u.IsActive=1;
      `);
      const row = result.recordset?.[0];
      if (!row) return res.status(401).json({ error: 'Authentication required.' });
      const storage = await profileImageLocation(row.Username);
      let hasProfileImage = false;
      for (const file of storage.files) { try { await fs.promises.access(file); hasProfileImage = true; break; } catch (_) {} }
      res.set('Cache-Control','no-store').json({ user: {
        userId: Number(row.UserID), username: row.Username, name: row.Name || '', family: row.Family || '',
        role: row.Role || 'Signed in', lastLoginAt: row.LastLoginAt || null, hasProfileImage
      }});
    } catch (e) {
      console.error('Profile load failed:', e.message);
      res.status(500).json({ error: 'Unable to load profile.' });
    }
  });

  router.put('/me/profile', rateLimit, csrf, authenticate, async (req, res) => {
    const name = req.body?.name, family = req.body?.family;
    if (typeof name !== 'string' || typeof family !== 'string' || name.trim().length > 100 || family.trim().length > 100) {
      return res.status(400).json({ error: 'Name and family must be text up to 100 characters.' });
    }
    try {
      const q = new sql.Request();
      q.input('userId', sql.Int, req.user.userId);
      q.input('name', sql.NVarChar(100), name.trim());
      q.input('family', sql.NVarChar(100), family.trim());
      await q.query('UPDATE dbo.Users SET Name=@name,Family=@family,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId AND IsActive=1;');
      await writeAudit(req.user.userId, req.user.username, 'SELF_PROFILE_UPDATED', clientIp(req));
      for (const session of sessions.values()) if (session.user.userId === req.user.userId) { session.user.name = name.trim(); session.user.family = family.trim(); }
      res.json({ success: true });
    } catch (e) { console.error('Profile update failed:', e.message); res.status(500).json({ error: 'Could not update profile.' }); }
  });

  router.put('/me/profile-password', rateLimit, csrf, authenticate, async (req, res) => {
    const currentPassword = req.body?.currentPassword, newPassword = req.body?.newPassword;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 256) {
      return res.status(400).json({ error: 'New password must be 8 to 256 characters.' });
    }
    try {
      const q = new sql.Request(); q.input('userId', sql.Int, req.user.userId);
      const found = await q.query('SELECT PasswordHash FROM dbo.Users WHERE UserID=@userId AND IsActive=1;');
      const stored = found.recordset?.[0]?.PasswordHash;
      if (!stored || !(await verifyPassword(currentPassword, stored))) {
        await writeAudit(req.user.userId, req.user.username, 'SELF_PROFILE_PASSWORD_FAILED', clientIp(req));
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      const salt = crypto.randomBytes(16), N = 16384, r = 8, p = 1;
      const derived = await new Promise((resolve, reject) => crypto.scrypt(newPassword, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
      const passwordHash = ['scrypt',N,r,p,salt.toString('base64'),derived.toString('base64')].join('
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
      session.checkedAt = Date.now();
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


  // User Management — Admin-only (authenticated, active user holding the active Admin role, verified server-side from SQL).
  // It is intentionally NOT assignable through a permission code.
  const userManagementGuard = [rateLimit, csrf, authenticate, requireAdmin()];

  function validateNewPassword(password) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) return 'New password must be between 8 and 256 characters.';
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain upper-case, lower-case letters and a digit.';
    return null;
  }

  // True when userId is currently an active Admin and no other active Admin remains.
  async function isLastActiveAdmin(userId) {
    const r = new sql.Request(); r.input('userId', sql.Int, userId);
    const q = await r.query(`
      SELECT (SELECT COUNT(DISTINCT u.UserID) FROM dbo.Users u INNER JOIN dbo.UserRoles ur ON ur.UserID=u.UserID INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 AND r.RoleCode=N'Admin' WHERE u.IsActive=1) AS TotalAdmins,
             CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Users u INNER JOIN dbo.UserRoles ur ON ur.UserID=u.UserID INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 AND r.RoleCode=N'Admin' WHERE u.UserID=@userId AND u.IsActive=1) THEN 1 ELSE 0 END AS bit) AS TargetIsAdmin;`);
    const row = q.recordset[0];
    return Number(row.TargetIsAdmin) === 1 && Number(row.TotalAdmins) <= 1;
  }

  router.get('/user-management/users', ...userManagementGuard, async (req, res) => {
    try {
      const q = await new sql.Request().query(`
        SELECT u.UserID, u.Username, u.Name, u.Family, u.IsActive, u.CreatedAt, u.UpdatedAt, u.LastLoginAt,
          STUFF((SELECT N', ' + r.RoleName FROM dbo.UserRoles ur
            INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID
            WHERE ur.UserID=u.UserID AND r.IsActive=1 FOR XML PATH(''), TYPE).value('.','nvarchar(max)'),1,2,N'') AS Roles,
          (SELECT MAX(l.CreatedAt) FROM dbo.Logs l WHERE l.UserID=u.UserID AND l.Action=N'LOGOUT') AS LastLogoutAt
        FROM dbo.Users u
        ORDER BY u.Family, u.Name, u.Username;
      `);
      res.json({ users: q.recordset });
    } catch (e) { console.error('User management list failed:', e.message); res.status(500).json({ error: 'Could not load users.' }); }
  });

  router.get('/user-management/users/:userId', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    try {
      const userRequest = new sql.Request(); userRequest.input('userId', sql.Int, userId);
      const userResult = await userRequest.query(`
        SELECT u.UserID,u.Username,u.Name,u.Family,u.IsActive,u.CreatedAt,u.UpdatedAt,u.LastLoginAt,
          (SELECT MAX(l.CreatedAt) FROM dbo.Logs l WHERE l.UserID=u.UserID AND l.Action=N'LOGOUT') AS LastLogoutAt
        FROM dbo.Users u WHERE u.UserID=@userId;
        SELECT r.RoleID,r.RoleCode,r.RoleName FROM dbo.UserRoles ur
          INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID WHERE ur.UserID=@userId ORDER BY r.RoleName;
        SELECT DISTINCT p.PermissionID,p.PermissionCode,p.PermissionName,r.RoleCode AS GrantedByRole
          FROM dbo.UserRoles ur
          INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1
          INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID
          INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1
          WHERE ur.UserID=@userId ORDER BY p.PermissionCode;
        SELECT TOP 100 l.LogID,l.Action,l.UserName AS ActorUserName,l.IPAddress,l.CreatedAt
          FROM dbo.Logs l WHERE l.UserID=@userId OR l.Action LIKE N'%[_]TARGET[_]' + CAST(@userId AS nvarchar(20))
          ORDER BY l.CreatedAt DESC, l.LogID DESC;
      `);
      const user = userResult.recordsets?.[0]?.[0];
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const key = String(user.Username || '').toLowerCase(), acct = accountAttempts.get(key);
      const userSessions = [...sessions.values()].filter(x => x.user.userId === userId && x.expiresAt > Date.now());
      res.json({ user, roles: userResult.recordsets[1] || [], permissions: userResult.recordsets[2] || [], activity: userResult.recordsets[3] || [], locked: !!(acct && acct.blockedUntil > Date.now()), activeSessions: userSessions.length });
    } catch (e) { console.error('User management details failed:', e.message); res.status(500).json({ error: 'Could not load user details.' }); }
  });

  router.put('/user-management/users/:userId/password', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    const password = req.body?.password;
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    const passwordError = validateNewPassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    try {
      const lookup = new sql.Request(); lookup.input('userId', sql.Int, userId);
      const target = await lookup.query('SELECT Username FROM dbo.Users WHERE UserID=@userId;');
      const targetUsername = target.recordset?.[0]?.Username;
      if (!targetUsername) return res.status(404).json({ error: 'User not found.' });
      const salt = crypto.randomBytes(16), N = 16384, r = 8, p = 1;
      const derived = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
      const passwordHash = ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$');
      const update = new sql.Request(); update.input('userId',sql.Int,userId); update.input('passwordHash',sql.NVarChar(512),passwordHash);
      const result = await update.query('UPDATE dbo.Users SET PasswordHash=@passwordHash,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId AND IsActive=1; SELECT @@ROWCOUNT AS Affected;');
      if (!Number(result.recordset?.[0]?.Affected)) return res.status(404).json({ error: 'Active user not found.' });
      await writeAudit(req.user.userId, req.user.username, 'USER_PASSWORD_RESET_TARGET_' + userId, clientIp(req));
      for (const [token, session] of sessions) if (session.user.userId === userId) sessions.delete(token);
      res.json({ success: true, sessionsRevoked: true });
    } catch (e) { console.error('User password reset failed:', e.message); res.status(500).json({ error: 'Could not reset password.' }); }
  });

  router.patch('/user-management/users/:userId/status', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId), isActive = req.body?.isActive;
    if (!Number.isSafeInteger(userId) || userId <= 0 || typeof isActive !== 'boolean') return res.status(400).json({ error: 'Invalid user status request.' });
    if (userId === req.user.userId && !isActive) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    try {
      if (!isActive && await isLastActiveAdmin(userId)) return res.status(400).json({ error: 'The last active Admin cannot be deactivated.' });
      const update = new sql.Request(); update.input('userId',sql.Int,userId); update.input('isActive',sql.Bit,isActive);
      const result = await update.query('UPDATE dbo.Users SET IsActive=@isActive,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId; SELECT @@ROWCOUNT AS Affected; SELECT Username FROM dbo.Users WHERE UserID=@userId;');
      if (!Number(result.recordset?.[0]?.Affected)) return res.status(404).json({ error: 'User not found.' });
      const action = isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
      await writeAudit(req.user.userId, req.user.username, action + '_TARGET_' + userId, clientIp(req));
      if (!isActive) for (const [token, session] of sessions) if (session.user.userId === userId) sessions.delete(token);
      res.json({ success: true, isActive });
    } catch (e) { console.error('User status update failed:', e.message); res.status(500).json({ error: 'Could not update user status.' }); }
  });

  router.put('/user-management/users/:userId', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    const clean = v => typeof v === 'string' ? v.trim() : null;
    const username = clean(req.body?.username), name = clean(req.body?.name), family = clean(req.body?.family);
    if (!username || username.length > 100 || !/^[A-Za-z0-9._@-]+$/.test(username)) return res.status(400).json({ error: 'Username is required (max 100; letters, digits, . _ @ - only).' });
    if (name === null || family === null || name.length > 100 || family.length > 100) return res.status(400).json({ error: 'Name and family must be text up to 100 characters.' });
    try {
      const dup = new sql.Request(); dup.input('userId', sql.Int, userId); dup.input('username', sql.NVarChar(100), username);
      const d = await dup.query('SELECT TOP 1 1 AS X FROM dbo.Users WHERE Username=@username AND UserID<>@userId;');
      if (d.recordset.length) return res.status(409).json({ error: 'Username is already in use.' });
      const up = new sql.Request(); up.input('userId', sql.Int, userId); up.input('username', sql.NVarChar(100), username); up.input('name', sql.NVarChar(100), name); up.input('family', sql.NVarChar(100), family);
      const result = await up.query('UPDATE dbo.Users SET Username=@username,Name=@name,Family=@family,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId; SELECT @@ROWCOUNT AS Affected;');
      if (!Number(result.recordset?.[0]?.Affected)) return res.status(404).json({ error: 'User not found.' });
      await writeAudit(req.user.userId, req.user.username, 'USER_PROFILE_UPDATED_TARGET_' + userId, clientIp(req));
      for (const session of sessions.values()) if (session.user.userId === userId) session.checkedAt = 0;
      res.json({ success: true });
    } catch (e) { console.error('User profile update failed:', e.message); res.status(500).json({ error: 'Could not update user.' }); }
  });

  router.post('/user-management/users/:userId/unlock', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    try {
      const r = new sql.Request(); r.input('userId', sql.Int, userId);
      const q = await r.query('SELECT Username FROM dbo.Users WHERE UserID=@userId;');
      const username = q.recordset?.[0]?.Username;
      if (!username) return res.status(404).json({ error: 'User not found.' });
      accountAttempts.delete(String(username).toLowerCase());
      await writeAudit(req.user.userId, req.user.username, 'USER_UNLOCKED_TARGET_' + userId, clientIp(req));
      res.json({ success: true });
    } catch (e) { console.error('User unlock failed:', e.message); res.status(500).json({ error: 'Could not unlock user.' }); }
  });

  router.delete('/user-management/users/:userId/sessions', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    let revoked = 0;
    for (const [token, session] of sessions) if (session.user.userId === userId) { sessions.delete(token); revoked++; }
    await writeAudit(req.user.userId, req.user.username, 'USER_SESSIONS_REVOKED_TARGET_' + userId, clientIp(req));
    res.json({ success: true, revoked });
  });


  async function hashPassword(password) {
    const salt = crypto.randomBytes(16), N = 16384, r = 8, p = 1;
    const derived = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
    return ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$');
  }

  function parseIdList(value) {
    if (!Array.isArray(value) || value.length > 500) return null;
    const ids = value.map(Number);
    if (!ids.every(n => Number.isSafeInteger(n) && n > 0)) return null;
    return [...new Set(ids)];
  }

  function markSessionsForRefresh(userId) {
    for (const session of sessions.values()) if (userId == null || session.user.userId === userId) session.checkedAt = 0;
  }

  // Admin changes their own password (current password required; other sessions of the same user are revoked).
  router.put('/me/password', rateLimit, csrf, authenticate, requireAdmin(), async (req, res) => {
    const currentPassword = req.body?.currentPassword, newPassword = req.body?.newPassword;
    if (typeof currentPassword !== 'string' || !currentPassword) return res.status(400).json({ error: 'Current password is required.' });
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });
    if (newPassword === currentPassword) return res.status(400).json({ error: 'New password must differ from the current password.' });
    try {
      const r = new sql.Request(); r.input('userId', sql.Int, req.user.userId);
      const q = await r.query('SELECT PasswordHash FROM dbo.Users WHERE UserID=@userId AND IsActive=1;');
      const stored = q.recordset?.[0]?.PasswordHash;
      if (!stored || !(await verifyPassword(currentPassword, stored))) {
        await writeAudit(req.user.userId, req.user.username, 'USER_PASSWORD_CHANGE_FAILED_SELF', clientIp(req));
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      const u = new sql.Request(); u.input('userId', sql.Int, req.user.userId); u.input('passwordHash', sql.NVarChar(512), await hashPassword(newPassword));
      await u.query('UPDATE dbo.Users SET PasswordHash=@passwordHash,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId;');
      await writeAudit(req.user.userId, req.user.username, 'USER_PASSWORD_CHANGED_SELF', clientIp(req));
      for (const [token, session] of sessions) if (session.user.userId === req.user.userId && token !== req.sessionToken) sessions.delete(token);
      res.json({ success: true });
    } catch (e) { console.error('Own password change failed:', e.message); res.status(500).json({ error: 'Could not change password.' }); }
  });

  router.post('/user-management/users', ...userManagementGuard, async (req, res) => {
    const clean = v => typeof v === 'string' ? v.trim() : null;
    const username = clean(req.body?.username), name = clean(req.body?.name), family = clean(req.body?.family), password = req.body?.password;
    if (!username || username.length > 100 || !/^[A-Za-z0-9._@-]+$/.test(username)) return res.status(400).json({ error: 'Username is required (max 100; letters, digits, . _ @ - only).' });
    if (name === null || family === null || name.length > 100 || family.length > 100) return res.status(400).json({ error: 'Name and family must be text up to 100 characters.' });
    const passwordError = validateNewPassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    try {
      const dup = new sql.Request(); dup.input('username', sql.NVarChar(100), username);
      if ((await dup.query('SELECT TOP 1 1 AS X FROM dbo.Users WHERE Username=@username;')).recordset.length) return res.status(409).json({ error: 'Username is already in use.' });
      const ins = new sql.Request(); ins.input('username', sql.NVarChar(100), username); ins.input('name', sql.NVarChar(100), name); ins.input('family', sql.NVarChar(100), family); ins.input('passwordHash', sql.NVarChar(512), await hashPassword(password));
      const result = await ins.query('INSERT INTO dbo.Users (Username,Name,Family,PasswordHash,IsActive,CreatedAt) OUTPUT inserted.UserID VALUES (@username,@name,@family,@passwordHash,1,SYSUTCDATETIME());');
      const newId = Number(result.recordset[0].UserID);
      await writeAudit(req.user.userId, req.user.username, 'USER_CREATED_TARGET_' + newId, clientIp(req));
      res.status(201).json({ success: true, userId: newId });
    } catch (e) { console.error('User creation failed:', e.message); res.status(500).json({ error: 'Could not create user.' }); }
  });

  router.get('/user-management/roles', ...userManagementGuard, async (req, res) => {
    try {
      const q = await new sql.Request().query(`
        SELECT r.RoleID,r.RoleCode,r.RoleName,r.Description,r.IsActive,(SELECT COUNT(*) FROM dbo.UserRoles ur WHERE ur.RoleID=r.RoleID) AS UserCount FROM dbo.Roles r ORDER BY r.RoleName;
        SELECT PermissionID,PermissionCode,PermissionName,Description,IsActive FROM dbo.Permissions ORDER BY PermissionCode;
        SELECT RoleID,PermissionID FROM dbo.RolePermissions;
      `);
      res.json({ roles: q.recordsets[0] || [], permissions: q.recordsets[1] || [], rolePermissions: q.recordsets[2] || [] });
    } catch (e) { console.error('Roles load failed:', e.message); res.status(500).json({ error: 'Could not load roles.' }); }
  });

  router.get('/user-management/users/:userId/roles', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    try {
      const r = new sql.Request(); r.input('userId', sql.Int, userId);
      const q = await r.query('SELECT RoleID FROM dbo.UserRoles WHERE UserID=@userId;');
      res.json({ roleIds: q.recordset.map(x => Number(x.RoleID)) });
    } catch (e) { console.error('User roles load failed:', e.message); res.status(500).json({ error: 'Could not load user roles.' }); }
  });

  // Replace the set of roles assigned to a user.
  router.put('/user-management/users/:userId/roles', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    const roleIds = parseIdList(req.body?.roleIds);
    if (!roleIds) return res.status(400).json({ error: 'roleIds must be an array of role IDs.' });
    let tx;
    try {
      const ex = new sql.Request(); ex.input('userId', sql.Int, userId);
      if (!(await ex.query('SELECT TOP 1 1 AS X FROM dbo.Users WHERE UserID=@userId;')).recordset.length) return res.status(404).json({ error: 'User not found.' });
      if (roleIds.length) {
        const rr = new sql.Request(); roleIds.forEach((id, i) => rr.input('r' + i, sql.Int, id));
        const found = await rr.query(`SELECT COUNT(*) AS C FROM dbo.Roles WHERE RoleID IN (${roleIds.map((_, i) => '@r' + i).join(',')});`);
        if (Number(found.recordset[0].C) !== roleIds.length) return res.status(400).json({ error: 'One or more roles do not exist.' });
      }
      // Never remove the Admin role from the last active Admin, or from the acting Admin themself.
      let keepsAdmin = false;
      if (roleIds.length) {
        const ar = new sql.Request(); roleIds.forEach((id, i) => ar.input('r' + i, sql.Int, id));
        keepsAdmin = (await ar.query(`SELECT TOP 1 1 AS X FROM dbo.Roles WHERE RoleCode=N'Admin' AND IsActive=1 AND RoleID IN (${roleIds.map((_, i) => '@r' + i).join(',')});`)).recordset.length > 0;
      }
      if (!keepsAdmin) {
        if (userId === req.user.userId) return res.status(400).json({ error: 'You cannot remove the Admin role from your own account.' });
        if (await isLastActiveAdmin(userId)) return res.status(400).json({ error: 'The Admin role cannot be removed from the last active Admin.' });
      }
      tx = new sql.Transaction(); await tx.begin();
      const del = new sql.Request(tx); del.input('userId', sql.Int, userId);
      await del.query('DELETE FROM dbo.UserRoles WHERE UserID=@userId;');
      for (const roleId of roleIds) {
        const ins = new sql.Request(tx); ins.input('userId', sql.Int, userId); ins.input('roleId', sql.Int, roleId);
        await ins.query('INSERT INTO dbo.UserRoles (UserID,RoleID) VALUES (@userId,@roleId);');
      }
      await tx.commit(); tx = null;
      markSessionsForRefresh(userId);
      await writeAudit(req.user.userId, req.user.username, 'USER_ROLES_CHANGED_TARGET_' + userId, clientIp(req));
      res.json({ success: true });
    } catch (e) {
      if (tx) { try { await tx.rollback(); } catch (_) {} }
      console.error('User roles update failed:', e.message); res.status(500).json({ error: 'Could not update user roles.' });
    }
  });

  // Replace the set of permissions granted to a role.
  router.put('/user-management/roles/:roleId/permissions', ...userManagementGuard, async (req, res) => {
    const roleId = Number(req.params.roleId);
    if (!Number.isSafeInteger(roleId) || roleId <= 0) return res.status(400).json({ error: 'Invalid Role ID.' });
    const permissionIds = parseIdList(req.body?.permissionIds);
    if (!permissionIds) return res.status(400).json({ error: 'permissionIds must be an array of permission IDs.' });
    let tx;
    try {
      const ex = new sql.Request(); ex.input('roleId', sql.Int, roleId);
      if (!(await ex.query('SELECT TOP 1 1 AS X FROM dbo.Roles WHERE RoleID=@roleId;')).recordset.length) return res.status(404).json({ error: 'Role not found.' });
      if (permissionIds.length) {
        const pr = new sql.Request(); permissionIds.forEach((id, i) => pr.input('p' + i, sql.Int, id));
        const found = await pr.query(`SELECT COUNT(*) AS C FROM dbo.Permissions WHERE PermissionID IN (${permissionIds.map((_, i) => '@p' + i).join(',')});`);
        if (Number(found.recordset[0].C) !== permissionIds.length) return res.status(400).json({ error: 'One or more permissions do not exist.' });
      }
      tx = new sql.Transaction(); await tx.begin();
      const del = new sql.Request(tx); del.input('roleId', sql.Int, roleId);
      await del.query('DELETE FROM dbo.RolePermissions WHERE RoleID=@roleId;');
      for (const permissionId of permissionIds) {
        const ins = new sql.Request(tx); ins.input('roleId', sql.Int, roleId); ins.input('permissionId', sql.Int, permissionId);
        await ins.query('INSERT INTO dbo.RolePermissions (RoleID,PermissionID) VALUES (@roleId,@permissionId);');
      }
      await tx.commit(); tx = null;
      markSessionsForRefresh(null);
      await writeAudit(req.user.userId, req.user.username, 'ROLE_PERMISSIONS_CHANGED_ROLE_' + roleId, clientIp(req));
      res.json({ success: true });
    } catch (e) {
      if (tx) { try { await tx.rollback(); } catch (_) {} }
      console.error('Role permissions update failed:', e.message); res.status(500).json({ error: 'Could not update role permissions.' });
    }
  });

  function cleanup(){const now=Date.now();for(const[token,s]of sessions)if(s.expiresAt<=now)sessions.delete(token);for(const[ip,s]of loginAttempts)if(s.blockedUntil<=now&&now-s.firstAt>LOGIN_WINDOW_MS)loginAttempts.delete(ip);for(const[k,s]of accountAttempts)if(s.blockedUntil<=now&&now-s.firstAt>LOGIN_WINDOW_MS)accountAttempts.delete(k);for(const[ip,s]of apiRateLimits)if(now-s.startedAt>API_WINDOW_MS)apiRateLimits.delete(ip);}
  return { router, securityHeaders, authenticate, requirePermission, requireAdmin, writeAudit, apiSecurity:(req,res,next)=>rateLimit(req,res,err=>{if(err)return next(err);csrf(req,res,next);}), authenticatePage, authenticateAdminPage, cleanup };
}

module.exports={createAuth};
);
      const update = new sql.Request(); update.input('userId', sql.Int, req.user.userId); update.input('passwordHash', sql.NVarChar(512), passwordHash);
      await update.query('UPDATE dbo.Users SET PasswordHash=@passwordHash,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId AND IsActive=1;');
      await writeAudit(req.user.userId, req.user.username, 'SELF_PROFILE_PASSWORD_CHANGED', clientIp(req));
      res.json({ success: true });
    } catch (e) { console.error('Profile password update failed:', e.message); res.status(500).json({ error: 'Could not change password.' }); }
  });

  router.get('/me/profile-image', rateLimit, authenticate, async (req, res) => {
    try {
      const storage = await profileImageLocation(req.user.username);
      for (let i=0; i<storage.files.length; i++) {
        try {
          await fs.promises.access(storage.files[i]);
          res.set('Cache-Control','no-store');
          res.type(['jpg','png','webp'][i]);
          return res.sendFile(storage.files[i]);
        } catch (_) {}
      }
      return res.status(404).json({ error: 'Profile image not found.' });
    } catch (e) { console.error('Profile image read failed:', e.message); res.status(500).json({ error: 'Could not load profile image.' }); }
  });

  router.put('/me/profile-image', rateLimit, csrf, authenticate, (req,res,next) => {
    profileImageUpload.single('photo')(req,res,err => {
      if (err) return res.status(400).json({ error: 'Could not receive profile image.' });
      next();
    });
  }, async (req, res) => {
    const image = req.file;
    if (!image || !['image/jpeg','image/png','image/webp'].includes(image.mimetype)) return res.status(400).json({ error: 'Only JPG, PNG, and WebP images are allowed.' });
    const detected = profileImageType(image.buffer);
    if (!detected || detected.mime !== image.mimetype) return res.status(400).json({ error: 'Image content does not match its declared type.' });
    try {
      const storage = await profileImageLocation(req.user.username);
      const destination = path.resolve(storage.root, storage.safeUsername + '.' + detected.ext);
      if (path.dirname(destination) !== storage.root) return res.status(400).json({ error: 'Invalid profile image destination.' });
      const temporary = path.resolve(storage.root, '.' + storage.safeUsername + '.' + crypto.randomBytes(12).toString('hex') + '.tmp');
      try {
        await fs.promises.writeFile(temporary, image.buffer, { flag: 'wx', mode: 0o600 });
        for (const oldFile of storage.files) { try { await fs.promises.unlink(oldFile); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
        await fs.promises.rename(temporary, destination);
      } finally { try { await fs.promises.unlink(temporary); } catch (_) {} }
      await writeAudit(req.user.userId, req.user.username, 'SELF_PROFILE_IMAGE_UPDATED', clientIp(req));
      res.json({ success: true });
    } catch (e) { console.error('Profile image save failed:', e.message); res.status(500).json({ error: 'Could not save profile image. Check the configured storage path and permissions.' }); }
  });

  router.delete('/me/profile-image', rateLimit, csrf, authenticate, async (req, res) => {
    try {
      const storage = await profileImageLocation(req.user.username);
      let removed = false;
      for (const file of storage.files) {
        try { await fs.promises.unlink(file); removed = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      await writeAudit(req.user.userId, req.user.username, 'SELF_PROFILE_IMAGE_REMOVED', clientIp(req));
      res.json({ success: true, removed });
    } catch (e) { console.error('Profile image removal failed:', e.message); res.status(500).json({ error: 'Could not remove profile image.' }); }
  });

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
      session.checkedAt = Date.now();
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


  // User Management — Admin-only (authenticated, active user holding the active Admin role, verified server-side from SQL).
  // It is intentionally NOT assignable through a permission code.
  const userManagementGuard = [rateLimit, csrf, authenticate, requireAdmin()];

  function validateNewPassword(password) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) return 'New password must be between 8 and 256 characters.';
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain upper-case, lower-case letters and a digit.';
    return null;
  }

  // True when userId is currently an active Admin and no other active Admin remains.
  async function isLastActiveAdmin(userId) {
    const r = new sql.Request(); r.input('userId', sql.Int, userId);
    const q = await r.query(`
      SELECT (SELECT COUNT(DISTINCT u.UserID) FROM dbo.Users u INNER JOIN dbo.UserRoles ur ON ur.UserID=u.UserID INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 AND r.RoleCode=N'Admin' WHERE u.IsActive=1) AS TotalAdmins,
             CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.Users u INNER JOIN dbo.UserRoles ur ON ur.UserID=u.UserID INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1 AND r.RoleCode=N'Admin' WHERE u.UserID=@userId AND u.IsActive=1) THEN 1 ELSE 0 END AS bit) AS TargetIsAdmin;`);
    const row = q.recordset[0];
    return Number(row.TargetIsAdmin) === 1 && Number(row.TotalAdmins) <= 1;
  }

  router.get('/user-management/users', ...userManagementGuard, async (req, res) => {
    try {
      const q = await new sql.Request().query(`
        SELECT u.UserID, u.Username, u.Name, u.Family, u.IsActive, u.CreatedAt, u.UpdatedAt, u.LastLoginAt,
          STUFF((SELECT N', ' + r.RoleName FROM dbo.UserRoles ur
            INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID
            WHERE ur.UserID=u.UserID AND r.IsActive=1 FOR XML PATH(''), TYPE).value('.','nvarchar(max)'),1,2,N'') AS Roles,
          (SELECT MAX(l.CreatedAt) FROM dbo.Logs l WHERE l.UserID=u.UserID AND l.Action=N'LOGOUT') AS LastLogoutAt
        FROM dbo.Users u
        ORDER BY u.Family, u.Name, u.Username;
      `);
      res.json({ users: q.recordset });
    } catch (e) { console.error('User management list failed:', e.message); res.status(500).json({ error: 'Could not load users.' }); }
  });

  router.get('/user-management/users/:userId', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    try {
      const userRequest = new sql.Request(); userRequest.input('userId', sql.Int, userId);
      const userResult = await userRequest.query(`
        SELECT u.UserID,u.Username,u.Name,u.Family,u.IsActive,u.CreatedAt,u.UpdatedAt,u.LastLoginAt,
          (SELECT MAX(l.CreatedAt) FROM dbo.Logs l WHERE l.UserID=u.UserID AND l.Action=N'LOGOUT') AS LastLogoutAt
        FROM dbo.Users u WHERE u.UserID=@userId;
        SELECT r.RoleID,r.RoleCode,r.RoleName FROM dbo.UserRoles ur
          INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID WHERE ur.UserID=@userId ORDER BY r.RoleName;
        SELECT DISTINCT p.PermissionID,p.PermissionCode,p.PermissionName,r.RoleCode AS GrantedByRole
          FROM dbo.UserRoles ur
          INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1
          INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID
          INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID AND p.IsActive=1
          WHERE ur.UserID=@userId ORDER BY p.PermissionCode;
        SELECT TOP 100 l.LogID,l.Action,l.UserName AS ActorUserName,l.IPAddress,l.CreatedAt
          FROM dbo.Logs l WHERE l.UserID=@userId OR l.Action LIKE N'%[_]TARGET[_]' + CAST(@userId AS nvarchar(20))
          ORDER BY l.CreatedAt DESC, l.LogID DESC;
      `);
      const user = userResult.recordsets?.[0]?.[0];
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const key = String(user.Username || '').toLowerCase(), acct = accountAttempts.get(key);
      const userSessions = [...sessions.values()].filter(x => x.user.userId === userId && x.expiresAt > Date.now());
      res.json({ user, roles: userResult.recordsets[1] || [], permissions: userResult.recordsets[2] || [], activity: userResult.recordsets[3] || [], locked: !!(acct && acct.blockedUntil > Date.now()), activeSessions: userSessions.length });
    } catch (e) { console.error('User management details failed:', e.message); res.status(500).json({ error: 'Could not load user details.' }); }
  });

  router.put('/user-management/users/:userId/password', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    const password = req.body?.password;
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    const passwordError = validateNewPassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    try {
      const lookup = new sql.Request(); lookup.input('userId', sql.Int, userId);
      const target = await lookup.query('SELECT Username FROM dbo.Users WHERE UserID=@userId;');
      const targetUsername = target.recordset?.[0]?.Username;
      if (!targetUsername) return res.status(404).json({ error: 'User not found.' });
      const salt = crypto.randomBytes(16), N = 16384, r = 8, p = 1;
      const derived = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
      const passwordHash = ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$');
      const update = new sql.Request(); update.input('userId',sql.Int,userId); update.input('passwordHash',sql.NVarChar(512),passwordHash);
      const result = await update.query('UPDATE dbo.Users SET PasswordHash=@passwordHash,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId AND IsActive=1; SELECT @@ROWCOUNT AS Affected;');
      if (!Number(result.recordset?.[0]?.Affected)) return res.status(404).json({ error: 'Active user not found.' });
      await writeAudit(req.user.userId, req.user.username, 'USER_PASSWORD_RESET_TARGET_' + userId, clientIp(req));
      for (const [token, session] of sessions) if (session.user.userId === userId) sessions.delete(token);
      res.json({ success: true, sessionsRevoked: true });
    } catch (e) { console.error('User password reset failed:', e.message); res.status(500).json({ error: 'Could not reset password.' }); }
  });

  router.patch('/user-management/users/:userId/status', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId), isActive = req.body?.isActive;
    if (!Number.isSafeInteger(userId) || userId <= 0 || typeof isActive !== 'boolean') return res.status(400).json({ error: 'Invalid user status request.' });
    if (userId === req.user.userId && !isActive) return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    try {
      if (!isActive && await isLastActiveAdmin(userId)) return res.status(400).json({ error: 'The last active Admin cannot be deactivated.' });
      const update = new sql.Request(); update.input('userId',sql.Int,userId); update.input('isActive',sql.Bit,isActive);
      const result = await update.query('UPDATE dbo.Users SET IsActive=@isActive,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId; SELECT @@ROWCOUNT AS Affected; SELECT Username FROM dbo.Users WHERE UserID=@userId;');
      if (!Number(result.recordset?.[0]?.Affected)) return res.status(404).json({ error: 'User not found.' });
      const action = isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED';
      await writeAudit(req.user.userId, req.user.username, action + '_TARGET_' + userId, clientIp(req));
      if (!isActive) for (const [token, session] of sessions) if (session.user.userId === userId) sessions.delete(token);
      res.json({ success: true, isActive });
    } catch (e) { console.error('User status update failed:', e.message); res.status(500).json({ error: 'Could not update user status.' }); }
  });

  router.put('/user-management/users/:userId', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    const clean = v => typeof v === 'string' ? v.trim() : null;
    const username = clean(req.body?.username), name = clean(req.body?.name), family = clean(req.body?.family);
    if (!username || username.length > 100 || !/^[A-Za-z0-9._@-]+$/.test(username)) return res.status(400).json({ error: 'Username is required (max 100; letters, digits, . _ @ - only).' });
    if (name === null || family === null || name.length > 100 || family.length > 100) return res.status(400).json({ error: 'Name and family must be text up to 100 characters.' });
    try {
      const dup = new sql.Request(); dup.input('userId', sql.Int, userId); dup.input('username', sql.NVarChar(100), username);
      const d = await dup.query('SELECT TOP 1 1 AS X FROM dbo.Users WHERE Username=@username AND UserID<>@userId;');
      if (d.recordset.length) return res.status(409).json({ error: 'Username is already in use.' });
      const up = new sql.Request(); up.input('userId', sql.Int, userId); up.input('username', sql.NVarChar(100), username); up.input('name', sql.NVarChar(100), name); up.input('family', sql.NVarChar(100), family);
      const result = await up.query('UPDATE dbo.Users SET Username=@username,Name=@name,Family=@family,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId; SELECT @@ROWCOUNT AS Affected;');
      if (!Number(result.recordset?.[0]?.Affected)) return res.status(404).json({ error: 'User not found.' });
      await writeAudit(req.user.userId, req.user.username, 'USER_PROFILE_UPDATED_TARGET_' + userId, clientIp(req));
      for (const session of sessions.values()) if (session.user.userId === userId) session.checkedAt = 0;
      res.json({ success: true });
    } catch (e) { console.error('User profile update failed:', e.message); res.status(500).json({ error: 'Could not update user.' }); }
  });

  router.post('/user-management/users/:userId/unlock', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    try {
      const r = new sql.Request(); r.input('userId', sql.Int, userId);
      const q = await r.query('SELECT Username FROM dbo.Users WHERE UserID=@userId;');
      const username = q.recordset?.[0]?.Username;
      if (!username) return res.status(404).json({ error: 'User not found.' });
      accountAttempts.delete(String(username).toLowerCase());
      await writeAudit(req.user.userId, req.user.username, 'USER_UNLOCKED_TARGET_' + userId, clientIp(req));
      res.json({ success: true });
    } catch (e) { console.error('User unlock failed:', e.message); res.status(500).json({ error: 'Could not unlock user.' }); }
  });

  router.delete('/user-management/users/:userId/sessions', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    let revoked = 0;
    for (const [token, session] of sessions) if (session.user.userId === userId) { sessions.delete(token); revoked++; }
    await writeAudit(req.user.userId, req.user.username, 'USER_SESSIONS_REVOKED_TARGET_' + userId, clientIp(req));
    res.json({ success: true, revoked });
  });


  async function hashPassword(password) {
    const salt = crypto.randomBytes(16), N = 16384, r = 8, p = 1;
    const derived = await new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, { N, r, p, maxmem: 128 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
    return ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$');
  }

  function parseIdList(value) {
    if (!Array.isArray(value) || value.length > 500) return null;
    const ids = value.map(Number);
    if (!ids.every(n => Number.isSafeInteger(n) && n > 0)) return null;
    return [...new Set(ids)];
  }

  function markSessionsForRefresh(userId) {
    for (const session of sessions.values()) if (userId == null || session.user.userId === userId) session.checkedAt = 0;
  }

  // Admin changes their own password (current password required; other sessions of the same user are revoked).
  router.put('/me/password', rateLimit, csrf, authenticate, requireAdmin(), async (req, res) => {
    const currentPassword = req.body?.currentPassword, newPassword = req.body?.newPassword;
    if (typeof currentPassword !== 'string' || !currentPassword) return res.status(400).json({ error: 'Current password is required.' });
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });
    if (newPassword === currentPassword) return res.status(400).json({ error: 'New password must differ from the current password.' });
    try {
      const r = new sql.Request(); r.input('userId', sql.Int, req.user.userId);
      const q = await r.query('SELECT PasswordHash FROM dbo.Users WHERE UserID=@userId AND IsActive=1;');
      const stored = q.recordset?.[0]?.PasswordHash;
      if (!stored || !(await verifyPassword(currentPassword, stored))) {
        await writeAudit(req.user.userId, req.user.username, 'USER_PASSWORD_CHANGE_FAILED_SELF', clientIp(req));
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      const u = new sql.Request(); u.input('userId', sql.Int, req.user.userId); u.input('passwordHash', sql.NVarChar(512), await hashPassword(newPassword));
      await u.query('UPDATE dbo.Users SET PasswordHash=@passwordHash,UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId;');
      await writeAudit(req.user.userId, req.user.username, 'USER_PASSWORD_CHANGED_SELF', clientIp(req));
      for (const [token, session] of sessions) if (session.user.userId === req.user.userId && token !== req.sessionToken) sessions.delete(token);
      res.json({ success: true });
    } catch (e) { console.error('Own password change failed:', e.message); res.status(500).json({ error: 'Could not change password.' }); }
  });

  router.post('/user-management/users', ...userManagementGuard, async (req, res) => {
    const clean = v => typeof v === 'string' ? v.trim() : null;
    const username = clean(req.body?.username), name = clean(req.body?.name), family = clean(req.body?.family), password = req.body?.password;
    if (!username || username.length > 100 || !/^[A-Za-z0-9._@-]+$/.test(username)) return res.status(400).json({ error: 'Username is required (max 100; letters, digits, . _ @ - only).' });
    if (name === null || family === null || name.length > 100 || family.length > 100) return res.status(400).json({ error: 'Name and family must be text up to 100 characters.' });
    const passwordError = validateNewPassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    try {
      const dup = new sql.Request(); dup.input('username', sql.NVarChar(100), username);
      if ((await dup.query('SELECT TOP 1 1 AS X FROM dbo.Users WHERE Username=@username;')).recordset.length) return res.status(409).json({ error: 'Username is already in use.' });
      const ins = new sql.Request(); ins.input('username', sql.NVarChar(100), username); ins.input('name', sql.NVarChar(100), name); ins.input('family', sql.NVarChar(100), family); ins.input('passwordHash', sql.NVarChar(512), await hashPassword(password));
      const result = await ins.query('INSERT INTO dbo.Users (Username,Name,Family,PasswordHash,IsActive,CreatedAt) OUTPUT inserted.UserID VALUES (@username,@name,@family,@passwordHash,1,SYSUTCDATETIME());');
      const newId = Number(result.recordset[0].UserID);
      await writeAudit(req.user.userId, req.user.username, 'USER_CREATED_TARGET_' + newId, clientIp(req));
      res.status(201).json({ success: true, userId: newId });
    } catch (e) { console.error('User creation failed:', e.message); res.status(500).json({ error: 'Could not create user.' }); }
  });

  router.get('/user-management/roles', ...userManagementGuard, async (req, res) => {
    try {
      const q = await new sql.Request().query(`
        SELECT r.RoleID,r.RoleCode,r.RoleName,r.Description,r.IsActive,(SELECT COUNT(*) FROM dbo.UserRoles ur WHERE ur.RoleID=r.RoleID) AS UserCount FROM dbo.Roles r ORDER BY r.RoleName;
        SELECT PermissionID,PermissionCode,PermissionName,Description,IsActive FROM dbo.Permissions ORDER BY PermissionCode;
        SELECT RoleID,PermissionID FROM dbo.RolePermissions;
      `);
      res.json({ roles: q.recordsets[0] || [], permissions: q.recordsets[1] || [], rolePermissions: q.recordsets[2] || [] });
    } catch (e) { console.error('Roles load failed:', e.message); res.status(500).json({ error: 'Could not load roles.' }); }
  });

  router.get('/user-management/users/:userId/roles', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    try {
      const r = new sql.Request(); r.input('userId', sql.Int, userId);
      const q = await r.query('SELECT RoleID FROM dbo.UserRoles WHERE UserID=@userId;');
      res.json({ roleIds: q.recordset.map(x => Number(x.RoleID)) });
    } catch (e) { console.error('User roles load failed:', e.message); res.status(500).json({ error: 'Could not load user roles.' }); }
  });

  // Replace the set of roles assigned to a user.
  router.put('/user-management/users/:userId/roles', ...userManagementGuard, async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid User ID.' });
    const roleIds = parseIdList(req.body?.roleIds);
    if (!roleIds) return res.status(400).json({ error: 'roleIds must be an array of role IDs.' });
    let tx;
    try {
      const ex = new sql.Request(); ex.input('userId', sql.Int, userId);
      if (!(await ex.query('SELECT TOP 1 1 AS X FROM dbo.Users WHERE UserID=@userId;')).recordset.length) return res.status(404).json({ error: 'User not found.' });
      if (roleIds.length) {
        const rr = new sql.Request(); roleIds.forEach((id, i) => rr.input('r' + i, sql.Int, id));
        const found = await rr.query(`SELECT COUNT(*) AS C FROM dbo.Roles WHERE RoleID IN (${roleIds.map((_, i) => '@r' + i).join(',')});`);
        if (Number(found.recordset[0].C) !== roleIds.length) return res.status(400).json({ error: 'One or more roles do not exist.' });
      }
      // Never remove the Admin role from the last active Admin, or from the acting Admin themself.
      let keepsAdmin = false;
      if (roleIds.length) {
        const ar = new sql.Request(); roleIds.forEach((id, i) => ar.input('r' + i, sql.Int, id));
        keepsAdmin = (await ar.query(`SELECT TOP 1 1 AS X FROM dbo.Roles WHERE RoleCode=N'Admin' AND IsActive=1 AND RoleID IN (${roleIds.map((_, i) => '@r' + i).join(',')});`)).recordset.length > 0;
      }
      if (!keepsAdmin) {
        if (userId === req.user.userId) return res.status(400).json({ error: 'You cannot remove the Admin role from your own account.' });
        if (await isLastActiveAdmin(userId)) return res.status(400).json({ error: 'The Admin role cannot be removed from the last active Admin.' });
      }
      tx = new sql.Transaction(); await tx.begin();
      const del = new sql.Request(tx); del.input('userId', sql.Int, userId);
      await del.query('DELETE FROM dbo.UserRoles WHERE UserID=@userId;');
      for (const roleId of roleIds) {
        const ins = new sql.Request(tx); ins.input('userId', sql.Int, userId); ins.input('roleId', sql.Int, roleId);
        await ins.query('INSERT INTO dbo.UserRoles (UserID,RoleID) VALUES (@userId,@roleId);');
      }
      await tx.commit(); tx = null;
      markSessionsForRefresh(userId);
      await writeAudit(req.user.userId, req.user.username, 'USER_ROLES_CHANGED_TARGET_' + userId, clientIp(req));
      res.json({ success: true });
    } catch (e) {
      if (tx) { try { await tx.rollback(); } catch (_) {} }
      console.error('User roles update failed:', e.message); res.status(500).json({ error: 'Could not update user roles.' });
    }
  });

  // Replace the set of permissions granted to a role.
  router.put('/user-management/roles/:roleId/permissions', ...userManagementGuard, async (req, res) => {
    const roleId = Number(req.params.roleId);
    if (!Number.isSafeInteger(roleId) || roleId <= 0) return res.status(400).json({ error: 'Invalid Role ID.' });
    const permissionIds = parseIdList(req.body?.permissionIds);
    if (!permissionIds) return res.status(400).json({ error: 'permissionIds must be an array of permission IDs.' });
    let tx;
    try {
      const ex = new sql.Request(); ex.input('roleId', sql.Int, roleId);
      if (!(await ex.query('SELECT TOP 1 1 AS X FROM dbo.Roles WHERE RoleID=@roleId;')).recordset.length) return res.status(404).json({ error: 'Role not found.' });
      if (permissionIds.length) {
        const pr = new sql.Request(); permissionIds.forEach((id, i) => pr.input('p' + i, sql.Int, id));
        const found = await pr.query(`SELECT COUNT(*) AS C FROM dbo.Permissions WHERE PermissionID IN (${permissionIds.map((_, i) => '@p' + i).join(',')});`);
        if (Number(found.recordset[0].C) !== permissionIds.length) return res.status(400).json({ error: 'One or more permissions do not exist.' });
      }
      tx = new sql.Transaction(); await tx.begin();
      const del = new sql.Request(tx); del.input('roleId', sql.Int, roleId);
      await del.query('DELETE FROM dbo.RolePermissions WHERE RoleID=@roleId;');
      for (const permissionId of permissionIds) {
        const ins = new sql.Request(tx); ins.input('roleId', sql.Int, roleId); ins.input('permissionId', sql.Int, permissionId);
        await ins.query('INSERT INTO dbo.RolePermissions (RoleID,PermissionID) VALUES (@roleId,@permissionId);');
      }
      await tx.commit(); tx = null;
      markSessionsForRefresh(null);
      await writeAudit(req.user.userId, req.user.username, 'ROLE_PERMISSIONS_CHANGED_ROLE_' + roleId, clientIp(req));
      res.json({ success: true });
    } catch (e) {
      if (tx) { try { await tx.rollback(); } catch (_) {} }
      console.error('Role permissions update failed:', e.message); res.status(500).json({ error: 'Could not update role permissions.' });
    }
  });

  function cleanup(){const now=Date.now();for(const[token,s]of sessions)if(s.expiresAt<=now)sessions.delete(token);for(const[ip,s]of loginAttempts)if(s.blockedUntil<=now&&now-s.firstAt>LOGIN_WINDOW_MS)loginAttempts.delete(ip);for(const[k,s]of accountAttempts)if(s.blockedUntil<=now&&now-s.firstAt>LOGIN_WINDOW_MS)accountAttempts.delete(k);for(const[ip,s]of apiRateLimits)if(now-s.startedAt>API_WINDOW_MS)apiRateLimits.delete(ip);}
  return { router, securityHeaders, authenticate, requirePermission, requireAdmin, writeAudit, apiSecurity:(req,res,next)=>rateLimit(req,res,err=>{if(err)return next(err);csrf(req,res,next);}), authenticatePage, authenticateAdminPage, cleanup };
}

module.exports={createAuth};
