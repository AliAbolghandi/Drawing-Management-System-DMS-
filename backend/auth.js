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

  function getClientIp(req) {
    return String(req.ip || req.socket.remoteAddress || '').trim();
  }

  function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://localhost:3000 http://127.0.0.1:3000; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
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
    res.setHeader(
      'Set-Cookie',
      'dms_session=' + encodeURIComponent(token) +
      '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000) + secure
    );
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

        const N = Number(parts[1]);
        const r = Number(parts[2]);
        const p = Number(parts[3]);
        const salt = Buffer.from(parts[4], 'base64');
        const expected = Buffer.from(parts[5], 'base64');

        if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) ||
            !salt.length || !expected.length) return resolve(false);
        if (N < 2 || (N & (N - 1)) !== 0 || r <= 0 || p <= 0 ||
            expected.length < 16 || expected.length > 128) return resolve(false);

        crypto.scrypt(password, salt, expected.length, {
          N, r, p, maxmem: 128 * 1024 * 1024
        }, (err, derived) => {
          if (err) return reject(err);
          resolve(crypto.timingSafeEqual(expected, derived));
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function writeAudit(userId, userName, action, ip) {
    try {
      const r = new sql.Request();
      r.input('userId', sql.Int, userId == null ? null : userId);
      r.input('userName', sql.NVarChar(100), userName || null);
      r.input('action', sql.NVarChar(100), action);
      r.input('ip', sql.NVarChar(64), ip || null);
      await r.query(
        "INSERT INTO dbo.Logs (UserID,UserName,Action,IPAddress,CreatedAt) " +
        "VALUES (@userId,@userName,@action,@ip,SYSUTCDATETIME());"
      );
    } catch (e) {
      console.warn('Audit log failed:', e.message);
    }
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
      if (req.user.isAdmin || req.user.permissions.has(permission)) return next();
      return res.status(403).json({ error: 'Permission denied.' });
    };
  }

  function apiRateLimit(req, res, next) {
    const key = getClientIp(req);
    const now = Date.now();
    let state = apiRateLimits.get(key);

    if (!state || now - state.startedAt >= API_WINDOW_MS) {
      state = { startedAt: now, count: 0 };
      apiRateLimits.set(key, state);
    }

    state.count += 1;
    if (state.count > API_MAX_REQUESTS) {
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((API_WINDOW_MS - (now - state.startedAt)) / 1000)))
      );
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    next();
  }

  function csrfGuard(req, res, next) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    if (origin && !frontendOrigins.has(origin)) {
      return res.status(403).json({ error: 'Forbidden origin.' });
    }

    if (!origin && referer) {
      try {
        if (!frontendOrigins.has(new URL(referer).origin)) {
          return res.status(403).json({ error: 'Forbidden origin.' });
        }
      } catch (_) {
        return res.status(403).json({ error: 'Forbidden origin.' });
      }
    }

    next();
  }

  function authenticatePage(req, res, next) {
    const token = parseCookies(req).dms_session;
    const session = token ? sessions.get(token) : null;

    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return res.redirect('/login.html');
    }

    session.expiresAt = Date.now() + SESSION_TTL_MS;
    req.user = session.user;
    next();
  }

  router.post('/login', async (req, res) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const state = loginAttempts.get(ip) || { count: 0, firstAt: now, blockedUntil: 0 };

    if (state.blockedUntil > now) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }

    if (now - state.firstAt > LOGIN_WINDOW_MS) {
      state.count = 0;
      state.firstAt = now;
      state.blockedUntil = 0;
    }

    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    try {
      const r = new sql.Request();
      r.input('username', sql.NVarChar(100), username);

      const q = await r.query(`
        SELECT TOP 1 u.UserID,u.Username,u.Name,u.Family,u.PasswordHash,u.IsActive,
               CAST(CASE WHEN EXISTS (
                 SELECT 1
                 FROM dbo.UserRoles ur
                 INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID
                 WHERE ur.UserID=u.UserID AND rr.RoleCode='Admin' AND rr.IsActive=1
               ) THEN 1 ELSE 0 END AS bit) AS IsAdmin
        FROM dbo.Users u
        WHERE u.Username=@username;
      `);

      const user = q.recordset[0];
      const valid = user && Number(user.IsActive) === 1 &&
        await passwordVerify(password, user.PasswordHash);

      if (!valid) {
        state.count += 1;
        if (state.count >= LOGIN_MAX_ATTEMPTS) {
          state.blockedUntil = now + LOGIN_WINDOW_MS;
        }
        loginAttempts.set(ip, state);
        await writeAudit(user?.UserID || null, username, 'LOGIN_FAILED', ip);
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const p = new sql.Request();
      p.input('userId', sql.Int, user.UserID);

      const pr = await p.query(`
        SELECT DISTINCT p.PermissionCode
        FROM dbo.UserRoles ur
        INNER JOIN dbo.Roles r ON r.RoleID=ur.RoleID AND r.IsActive=1
        INNER JOIN dbo.RolePermissions rp ON rp.RoleID=r.RoleID
        INNER JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID
        WHERE ur.UserID=@userId
      `);

      const permissions = new Set(pr.recordset.map(x => String(x.PermissionCode)));
      const sessionUser = {
        userId: Number(user.UserID),
        username: String(user.Username),
        name: user.Name || '',
        family: user.Family || '',
        isAdmin: Number(user.IsAdmin) === 1,
        permissions
      };

      const token = createSession(sessionUser);
      setAuthCookie(res, token);
      loginAttempts.delete(ip);

      const u = new sql.Request();
      u.input('userId', sql.Int, user.UserID);
      await u.query(
        'UPDATE dbo.Users SET LastLoginAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId;'
      );

      await writeAudit(user.UserID, user.Username, 'LOGIN_SUCCESS', ip);

      res.json({
        success: true,
        user: {
          userId: sessionUser.userId,
          username: sessionUser.username,
          name: sessionUser.name,
          family: sessionUser.family
        }
      });
    } catch (e) {
      console.error('Login failed:', e);
      res.status(500).json({ error: 'Login service is unavailable.' });
    }
  });

  router.post('/logout', async (req, res) => {
    const token = parseCookies(req).dms_session;
    const session = token ? sessions.get(token) : null;

    if (session) {
      await writeAudit(session.user.userId, session.user.username, 'LOGOUT', getClientIp(req));
      sessions.delete(token);
    }

    clearAuthCookie(res);
    res.json({ success: true });
  });

  router.get('/me', (req, res) => {
    const token = parseCookies(req).dms_session;
    const session = token ? sessions.get(token) : null;

    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return res.status(401).json({ authenticated: false });
    }

    session.expiresAt = Date.now() + SESSION_TTL_MS;
    const u = session.user;

    res.json({
      authenticated: true,
      user: {
        userId: u.userId,
        username: u.username,
        name: u.name,
        family: u.family,
        isAdmin: u.isAdmin
      },
      permissions: [...u.permissions]
    });
  });

  function cleanup() {
    const now = Date.now();

    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) sessions.delete(token);
    }

    for (const [ip, state] of loginAttempts) {
      if (state.blockedUntil <= now && now - state.firstAt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(ip);
      }
    }

    for (const [ip, state] of apiRateLimits) {
      if (now - state.startedAt > API_WINDOW_MS) apiRateLimits.delete(ip);
    }
  }

  return {
    router,
    securityHeaders,
    authenticate,
    requirePermission,
    apiSecurity: (req, res, next) => apiRateLimit(req, res, err => {
      if (err) return next(err);
      csrfGuard(req, res, next);
    }),
    authenticatePage,
    cleanup
  };
}

module.exports = { createAuth };
