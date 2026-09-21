const express = require('express');
const sql = require('mssql/msnodesqlv8');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const util = require('util');
const { exec } = require('child_process');
const multer = require('multer');
const readline = require('readline');

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const FRONTEND_ORIGINS = new Set(
  String(process.env.DMS_FRONTEND_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000')
    .split(',').map(x => x.trim()).filter(Boolean)
);

app.set('trust proxy', process.env.DMS_TRUST_PROXY === '1');

function getClientIp(req) {
  return String(req.ip || req.socket.remoteAddress || '').trim();
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' http://localhost:3000 http://127.0.0.1:3000; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function parseCookies(req) {
  const out = {};
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', [
    'dms_session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(SESSION_TTL_MS / 1000) + secure
  ]);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'dms_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
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
      const parts = stored.split('

const execAsync = util.promisify(exec);
const app = express();
const PORT = 3000;

const config = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=dbDrawingManagment;Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  connectionTimeout: 15000,
  requestTimeout: 30000,
  pool: { max: 30, min: 2, idleTimeoutMillis: 30000 },
};

const ALLOWED_SRSC_FOLDERS = ['SLD', 'DOC', 'PIC', 'Catalog'];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tif', '.tiff', '.ico']);
const INLINE_EXTENSIONS = new Set(['.pdf', ...IMAGE_EXTENSIONS]);

// IMPORTANT: dbo.Nodes has exactly these columns. There is NO nv column.
const NODE_COLUMNS = [
  'NodeID', 'ParentID', 'NodeCode', 'NodeName', 'IsActive', 'CreatedAt', 'UpdatedAt',
  'FolderPath', 'PathID', 'JET_Position', 'Norme', 'Mass',
].join(', ');
const NODE_COLUMNS_N = NODE_COLUMNS.split(', ').map(c => `N.${c}`).join(', ');

let pdfCache = null;
let pdfCacheComputing = null;

const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'dms-uploads');
try { fs.rmSync(UPLOAD_TMP_DIR, { recursive: true, force: true }); } catch (_) { }
fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_TMP_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${path.basename(file.originalname)}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024, files: 1000 }, // 1GB/file, 1000 files/request — generous for CAD/PDF drawings
});

function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.array('files')(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

async function moveFile(src, dest) {
  try {
    await fs.promises.rename(src, dest);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e; // crossing drives (temp dir vs. network share) — copy then remove
    await fs.promises.copyFile(src, dest);
    await fs.promises.unlink(src);
  }
}

// Splits+validates a relative path (folder upload / manual subfolder), rejecting traversal
// and reserved/illegal Windows filename characters. Returns the path segments, or null.
function sanitizeRelativePath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some(p => p === '..' || p === '.' || /[<>:"|?*\x00-\x1f]/.test(p))) return null;
  return parts;
}

app.use((req, res, next) => { applySecurityHeaders(res); next(); });
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || FRONTEND_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by DMS CORS policy.'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '1mb' }));
app.use((req,res,next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Authentication endpoints must remain public.
app.post('/api/auth/login', async (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const state = loginAttempts.get(ip) || { count: 0, firstAt: now, blockedUntil: 0 };
  if (state.blockedUntil > now) return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  if (now - state.firstAt > LOGIN_WINDOW_MS) { state.count = 0; state.firstAt = now; state.blockedUntil = 0; }
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required.' });

  try {
    const r = new sql.Request();
    r.input('username', sql.NVarChar(100), username);
    const q = await r.query(`
      SELECT TOP 1 u.UserID,u.Username,u.Name,u.Family,u.PasswordHash,u.IsActive,
             CAST(CASE WHEN EXISTS (
               SELECT 1 FROM dbo.UserRoles ur
               INNER JOIN dbo.Roles rr ON rr.RoleID=ur.RoleID
               WHERE ur.UserID=u.UserID AND rr.RoleCode='Admin' AND rr.IsActive=1
             ) THEN 1 ELSE 0 END AS bit) AS IsAdmin
      FROM dbo.Users u
      WHERE u.Username=@username;
    `);
    const user = q.recordset[0];
    const valid = user && Number(user.IsActive) === 1 && await passwordVerify(password, user.PasswordHash);
    if (!valid) {
      state.count += 1;
      if (state.count >= LOGIN_MAX_ATTEMPTS) state.blockedUntil = now + LOGIN_WINDOW_MS;
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
    await u.query('UPDATE dbo.Users SET LastLoginAt=SYSUTCDATETIME(), UpdatedAt=SYSUTCDATETIME() WHERE UserID=@userId;');
    await writeAudit(user.UserID, user.Username, 'LOGIN_SUCCESS', ip);

    res.json({ success: true, user: { userId: sessionUser.userId, username: sessionUser.username, name: sessionUser.name, family: sessionUser.family } });
  } catch (e) {
    console.error('Login failed:', e);
    res.status(500).json({ error: 'Login service is unavailable.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = parseCookies(req).dms_session;
  const session = token ? sessions.get(token) : null;
  if (session) {
    await writeAudit(session.user.userId, session.user.username, 'LOGOUT', getClientIp(req));
    sessions.delete(token);
  }
  clearAuthCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = parseCookies(req).dms_session;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ authenticated: false });
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  const u = session.user;
  res.json({ authenticated: true, user: { userId:u.userId, username:u.username, name:u.name, family:u.family, isAdmin:u.isAdmin }, permissions:[...u.permissions] });
});

const API_WINDOW_MS = 60 * 1000;
const API_MAX_REQUESTS = 240;
const apiRateLimits = new Map();

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
    res.setHeader('Retry-After', String(Math.ceil((API_WINDOW_MS - (now - state.startedAt)) / 1000)));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
}

function csrfGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (origin && !FRONTEND_ORIGINS.has(origin)) return res.status(403).json({ error: 'Forbidden origin.' });
  if (!origin && referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!FRONTEND_ORIGINS.has(refererOrigin)) return res.status(403).json({ error: 'Forbidden origin.' });
    } catch (_) {
      return res.status(403).json({ error: 'Forbidden origin.' });
    }
  }
  next();
}

app.use('/api', apiRateLimit, csrfGuard, authenticate);

function normalizeRelativePath(value) {
  if (value == null) return null;
  const normalized = String(value).trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes('..')) return null;
  return parts.join(path.sep);
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === '' || (Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function getSafeNodeRoot(rootPath, folderPath) {
  const relative = normalizeRelativePath(folderPath);
  return rootPath && relative ? path.resolve(String(rootPath), relative) : null;
}

function isSafeChildPath(basePath, relativePath) {
  if (relativePath == null) return null;
  const normalized = String(relativePath).replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
  const fullPath = path.resolve(basePath, ...parts);
  return isPathInside(basePath, fullPath) ? fullPath : null;
}

function getCanonicalAllowedFolder(folderName) {
  return ALLOWED_SRSC_FOLDERS.find(f => f.toLowerCase() === String(folderName).toLowerCase()) || null;
}

function getFileKind(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf'].includes(ext)) return 'document';
  if (['.dwg', '.dxf', '.dws', '.dwt', '.sldprt', '.sldasm', '.slddrw', '.step', '.stp', '.iges', '.igs'].includes(ext)) return 'cad';
  return 'file';
}

function safePart(value) { return String(value || '').replace(/[\\/:*?"<>|]/g, '-').trim(); }
function sendServerError(res, label, error) { console.error(`${label}:`, error); res.status(500).json({ error: 'Internal server error.' }); }

async function warmPdfCache() {
  if (pdfCache) return pdfCache;
  if (pdfCacheComputing) return pdfCacheComputing;
  pdfCacheComputing = sql.query('SELECT PDFID, NodeID, NodeCode, PDFName FROM dbo.DanieliPDF ORDER BY NodeID, PDFID')
    .then(r => { pdfCache = r.recordset || []; pdfCacheComputing = null; console.log(`PDF cache ready: ${pdfCache.length.toLocaleString()} records`); return pdfCache; })
    .catch(e => { pdfCacheComputing = null; console.error('PDF cache warm-up failed:', e.message); return []; });
  return pdfCacheComputing;
}

async function testDatabaseConnection() {
  try {
    const pool = await sql.connect(config);
    console.log('Database: dbDrawingManagment');
    console.log('SQL Server connected successfully');
    try {
      await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DanieliPDF_NodeID' AND object_id=OBJECT_ID('dbo.DanieliPDF')) CREATE INDEX IX_DanieliPDF_NodeID ON dbo.DanieliPDF(NodeID, PDFID);`);
      console.log('PDF lookup index verified');
    } catch (e) { console.warn('PDF index check skipped:', e.message); }
    try {
      // Every child-listing request and the search CTE filter/join on ParentID against
      // a 106,000+ row table; without this index those were full table scans.
      await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Nodes_ParentID' AND object_id=OBJECT_ID('dbo.Nodes')) CREATE INDEX IX_Nodes_ParentID ON dbo.Nodes(ParentID);`);
      console.log('Nodes ParentID index verified');
    } catch (e) { console.warn('Nodes ParentID index check skipped:', e.message); }
    warmPdfCache();
  } catch (e) { console.error('SQL Server connection failed'); console.error(e); }
}

app.get('/api/nodes', requirePermission('NODE_VIEW'), async (req, res) => {
  try {
    const hasParent = req.query.parentId !== undefined;
    const raw = req.query.parentId;
    const parentId = hasParent && raw !== '' ? Number(raw) : null;
    if (hasParent && raw !== '' && (!Number.isInteger(parentId) || parentId <= 0)) return res.status(400).json({ error: 'Invalid Parent ID.' });
    const request = new sql.Request();
    let where = '';
    if (hasParent) {
      if (parentId === null) where = 'WHERE ParentID IS NULL';
      else { request.input('parentId', sql.Int, parentId); where = 'WHERE ParentID = @parentId'; }
    }
    const result = await request.query(`SELECT ${NODE_COLUMNS}, CASE WHEN EXISTS (SELECT 1 FROM dbo.Nodes AS C WHERE C.ParentID=dbo.Nodes.NodeID) THEN 1 ELSE 0 END AS HasChildren FROM dbo.Nodes ${where} ORDER BY NodeID;`);
    res.json(result.recordset);
  } catch (e) { sendServerError(res, 'Nodes query failed', e); }
});

app.get('/api/nodes/search', requirePermission('NODE_VIEW'), async (req, res) => {
  const text = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!text) return res.json({ matches: [], ancestorIds: [], matchIds: [], visibleNodes: [] });
  try {
    const request = new sql.Request();
    request.input('q', sql.NVarChar(255), `%${text}%`);
    // Walks ancestors entirely in SQL (matches + their parent chain only) instead of
    // pulling the whole Nodes table into Node.js to compute ancestors in JS.
    const result = await request.query(`
      ;WITH MatchSeed AS (
        SELECT NodeID, ParentID, CAST(1 AS BIT) AS IsMatch
        FROM dbo.Nodes
        WHERE NodeCode LIKE @q OR NodeName LIKE @q
      ),
      Ancestry AS (
        SELECT NodeID, ParentID, IsMatch FROM MatchSeed
        UNION ALL
        SELECT N.NodeID, N.ParentID, CAST(0 AS BIT)
        FROM dbo.Nodes N
        INNER JOIN Ancestry A ON N.NodeID = A.ParentID
      ),
      DistinctIds AS (
        SELECT NodeID, MAX(CAST(IsMatch AS INT)) AS IsMatch
        FROM Ancestry
        GROUP BY NodeID
      )
      SELECT ${NODE_COLUMNS_N},
             CASE WHEN EXISTS (SELECT 1 FROM dbo.Nodes C WHERE C.ParentID = N.NodeID) THEN 1 ELSE 0 END AS HasChildren,
             D.IsMatch
      FROM dbo.Nodes N
      INNER JOIN DistinctIds D ON D.NodeID = N.NodeID
      ORDER BY N.NodeID
      OPTION (MAXRECURSION 1000);
    `);
    const rows = result.recordset;
    const isMatch = r => r.IsMatch === 1 || r.IsMatch === true;
    const matches = rows.filter(isMatch);
    const ancestorIds = rows.filter(r => !isMatch(r)).map(r => Number(r.NodeID));
    const matchIds = matches.map(r => Number(r.NodeID));
    const visibleNodes = rows.map(({ IsMatch, ...rest }) => rest);
    res.json({ matches, ancestorIds, matchIds, visibleNodes });
  } catch (e) { sendServerError(res, 'Node search failed', e); }
});

app.post('/api/nodes', requirePermission('NODE_CREATE'), async (req, res) => {
  const code = typeof req.body?.NodeCode === 'string' ? req.body.NodeCode.trim() : '';
  const name = typeof req.body?.NodeName === 'string' ? req.body.NodeName.trim() : '';
  const parentId = Number(req.body?.ParentID);
  const jet = req.body?.JET_Position == null ? null : String(req.body.JET_Position).trim();
  const norme = req.body?.Norme == null ? null : String(req.body.Norme).trim();
  const mass = req.body?.Mass == null || req.body.Mass === '' ? null : String(req.body.Mass).trim();
  const active = req.body?.IsActive === false || Number(req.body?.IsActive) === 0 ? 0 : 1;
  if (!code || !name) return res.status(400).json({ error: 'Node Code and Node Name are required.' });
  if (!Number.isInteger(parentId) || parentId <= 0) return res.status(400).json({ error: 'A valid parent Node is required.' });
  try {
    const pool = await sql.connect(config); const tx = new sql.Transaction(pool); await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const pr = new sql.Request(tx); pr.input('parentId', sql.Int, parentId);
      const parentResult = await pr.query('SELECT TOP 1 NodeID, FolderPath, PathID FROM dbo.Nodes WITH (UPDLOCK,HOLDLOCK) WHERE NodeID=@parentId;');
      if (!parentResult.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'Parent Node not found.' }); }
      const parent = parentResult.recordset[0];
      const parentFolder = parent.FolderPath ? String(parent.FolderPath).trim() : '';
      const folderPath = parentFolder ? `${parentFolder}\\${safePart(code)} -${safePart(name)}` : `${safePart(code)} -${safePart(name)}`;
      const identity = await new sql.Request(tx).query(`SELECT COLUMNPROPERTY(OBJECT_ID('dbo.Nodes'),'NodeID','IsIdentity') AS IsIdentity;`);
      let result;
      if (Number(identity.recordset[0]?.IsIdentity) === 1) {
        const r = new sql.Request(tx); r.input('parentId', sql.Int, parentId); r.input('code', sql.NVarChar(100), code); r.input('name', sql.NVarChar(255), name); r.input('folderPath', sql.NVarChar(sql.MAX), folderPath); r.input('pathId', sql.Int, parent.PathID ?? null); r.input('jet', sql.NVarChar(255), jet); r.input('norme', sql.NVarChar(255), norme); r.input('mass', sql.NVarChar(255), mass); r.input('active', sql.Bit, active);
        result = await r.query(`INSERT INTO dbo.Nodes (ParentID,NodeCode,NodeName,IsActive,CreatedAt,UpdatedAt,FolderPath,PathID,JET_Position,Norme,Mass) OUTPUT INSERTED.* VALUES (@parentId,@code,@name,@active,SYSUTCDATETIME(),SYSUTCDATETIME(),@folderPath,@pathId,@jet,@norme,@mass);`);
      } else {
        const idr = await new sql.Request(tx).query('SELECT ISNULL(MAX(NodeID),0)+1 AS NodeID FROM dbo.Nodes WITH (UPDLOCK,HOLDLOCK);');
        const r = new sql.Request(tx); r.input('nodeId', sql.Int, Number(idr.recordset[0].NodeID)); r.input('parentId', sql.Int, parentId); r.input('code', sql.NVarChar(100), code); r.input('name', sql.NVarChar(255), name); r.input('folderPath', sql.NVarChar(sql.MAX), folderPath); r.input('pathId', sql.Int, parent.PathID ?? null); r.input('jet', sql.NVarChar(255), jet); r.input('norme', sql.NVarChar(255), norme); r.input('mass', sql.NVarChar(255), mass); r.input('active', sql.Bit, active);
        result = await r.query(`INSERT INTO dbo.Nodes (NodeID,ParentID,NodeCode,NodeName,IsActive,CreatedAt,UpdatedAt,FolderPath,PathID,JET_Position,Norme,Mass) OUTPUT INSERTED.* VALUES (@nodeId,@parentId,@code,@name,@active,SYSUTCDATETIME(),SYSUTCDATETIME(),@folderPath,@pathId,@jet,@norme,@mass);`);
      }
      await tx.commit(); res.status(201).json({ success: true, node: result.recordset[0] });
    } catch (e) { try { await tx.rollback(); } catch (_) { } throw e; }
  } catch (e) { sendServerError(res, 'Node creation failed', e); }
});

app.put('/api/nodes/:nodeId', requirePermission('NODE_EDIT'), async (req, res) => {
  const id = Number(req.params.nodeId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID.' });
  const code = typeof req.body?.NodeCode === 'string' ? req.body.NodeCode.trim() : '';
  const name = typeof req.body?.NodeName === 'string' ? req.body.NodeName.trim() : '';
  if (!code || !name) return res.status(400).json({ error: 'Node Code and Node Name are required.' });
  try {
    const r = new sql.Request();
    r.input('id', sql.Int, id); r.input('code', sql.NVarChar(100), code); r.input('name', sql.NVarChar(255), name);
    r.input('jet', sql.NVarChar(255), req.body?.JET_Position == null ? null : String(req.body.JET_Position).trim());
    r.input('norme', sql.NVarChar(255), req.body?.Norme == null ? null : String(req.body.Norme).trim());
    r.input('mass', sql.NVarChar(255), req.body?.Mass == null || req.body.Mass === '' ? null : String(req.body.Mass).trim());
    r.input('active', sql.Bit, req.body?.IsActive === true || Number(req.body?.IsActive) === 1 ? 1 : 0);
    const result = await r.query(`UPDATE dbo.Nodes SET NodeCode=@code,NodeName=@name,JET_Position=@jet,Norme=@norme,Mass=@mass,IsActive=@active,UpdatedAt=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE NodeID=@id;`);
    if (!result.recordset.length) return res.status(404).json({ error: 'Node not found.' });
    res.json({ success: true, node: result.recordset[0] });
  } catch (e) { sendServerError(res, 'Node update failed', e); }
});

app.delete('/api/nodes/:nodeId', requirePermission('NODE_DELETE'), async (req, res) => {
  const id = Number(req.params.nodeId); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID.' });
  try {
    const r = new sql.Request(); r.input('id', sql.Int, id);
    if (!(await r.query('SELECT TOP 1 NodeID FROM dbo.Nodes WHERE NodeID=@id;')).recordset.length) return res.status(404).json({ error: 'Node not found.' });
    if ((await r.query('SELECT TOP 1 NodeID FROM dbo.Nodes WHERE ParentID=@id;')).recordset.length) return res.status(409).json({ error: 'This Node has child Nodes. Delete or move the child Nodes first.' });
    if ((await r.query('SELECT TOP 1 PDFID FROM dbo.DanieliPDF WHERE NodeID=@id;')).recordset.length) return res.status(409).json({ error: 'This Node has registered PDF files. Remove the PDF records first.' });
    await r.query('DELETE FROM dbo.Nodes WHERE NodeID=@id;'); srscCache.delete(id); res.json({ success: true, deleted: true, nodeId: id });
  } catch (e) { if (e.number === 547) return res.status(409).json({ error: 'This Node is referenced by another database record and cannot be deleted.' }); sendServerError(res, 'Node deletion failed', e); }
});

app.get('/api/pdfs', requirePermission('PDF_VIEW'), async (req, res) => {
  try {
    let ids = null;
    if (req.query.nodeIds !== undefined) ids = String(req.query.nodeIds).split(',').map(Number).filter(Number.isInteger);
    else if (req.query.nodeId !== undefined) ids = [Number(req.query.nodeId)];
    if (ids && ids.some(id => id <= 0)) return res.status(400).json({ error: 'Invalid Node ID.' });
    const data = pdfCache || await warmPdfCache(); if (!ids) return res.json(data); const wanted = new Set(ids); res.json(data.filter(x => wanted.has(Number(x.NodeID))));
  } catch (e) { sendServerError(res, 'PDF query failed', e); }
});

async function getPdfRecord(id) { const r = new sql.Request(); r.input('id', sql.Int, id); const q = await r.query('SELECT d.PDFName,p.RootPath FROM dbo.DanieliPDF d JOIN dbo.tblPath p ON d.PathID=p.PathID WHERE d.PDFID=@id;'); return q.recordset[0] || null; }
app.get('/api/pdf-open/:pdfId', requirePermission('PDF_VIEW'), async (req, res) => { const id = Number(req.params.pdfId); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid PDF ID' }); try { const row = await getPdfRecord(id); if (!row) return res.status(404).json({ error: 'PDF record not found' }); const full = isSafeChildPath(row.RootPath, row.PDFName); if (!full || !fs.existsSync(full)) return res.status(404).json({ error: 'PDF file not found on disk' }); await execAsync(`start "" "${full.replace(/"/g, '')}"`, { windowsHide: true }); res.json({ success: true }); } catch (e) { sendServerError(res, 'PDF open failed', e); } });
app.get('/api/pdf-file/:pdfId', requirePermission('PDF_VIEW'), async (req, res) => { const id = Number(req.params.pdfId); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid PDF ID' }); try { const row = await getPdfRecord(id); if (!row) return res.status(404).json({ error: 'PDF record not found' }); const full = isSafeChildPath(row.RootPath, row.PDFName); if (!full || !fs.existsSync(full)) return res.status(404).json({ error: 'PDF file not found on disk' }); res.sendFile(full); } catch (e) { sendServerError(res, 'PDF file request failed', e); } });

async function pathIsDir(p) {
  try { const s = await fs.promises.stat(p); return s.isDirectory(); } catch (_) { return false; }
}

// nodeId -> boolean. Filled lazily as nodes are actually looked up, never a full upfront scan.
const srscCache = new Map();

async function checkNodeSrsc(nodeId, rootPath, folderPath) {
  if (srscCache.has(nodeId)) return srscCache.get(nodeId);
  const root = getSafeNodeRoot(rootPath, folderPath);
  let found = false;
  if (root && await pathIsDir(root)) {
    for (const f of ALLOWED_SRSC_FOLDERS) {
      if (await pathIsDir(path.join(root, f))) { found = true; break; }
    }
  }
  srscCache.set(nodeId, found);
  return found;
}

// Runs async work with a bounded number of requests in flight at once, instead of either
// doing everything sequentially (slow) or all at once (floods a network drive / SQL Server).
async function mapWithConcurrency(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

// Only checks the specific Nodes the client currently has on screen (via ?nodeIds=1,2,3),
// with disk checks done asynchronously and in parallel (bounded), and cached per Node
// afterwards. Nothing here scans the whole table or blocks the event loop.
app.get('/api/srsc-status', requirePermission('FILE_VIEW'), async (req, res) => {
  try {
    if (req.query.nodeIds === undefined) return res.json({ nodeIds: [], count: 0 });
    const ids = String(req.query.nodeIds).split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    if (!ids.length) return res.json({ nodeIds: [], count: 0 });

    if (req.query.refresh === '1') ids.forEach(id => srscCache.delete(id));

    const toLookup = ids.filter(id => !srscCache.has(id));
    if (toLookup.length) {
      const r = new sql.Request();
      const placeholders = toLookup.map((id, i) => { r.input(`id${i}`, sql.Int, id); return `@id${i}`; }).join(',');
      const q = await r.query(`SELECT N.NodeID, N.FolderPath, N.PathID, P.RootPath FROM dbo.Nodes N LEFT JOIN dbo.tblPath P ON N.PathID=P.PathID WHERE N.NodeID IN (${placeholders});`);
      await mapWithConcurrency(q.recordset, 12, row => checkNodeSrsc(Number(row.NodeID), row.RootPath, row.FolderPath));
    }

    const found = ids.filter(id => srscCache.get(id));
    res.json({ nodeIds: found, count: found.length });
  } catch (e) { sendServerError(res, 'SRSC status failed', e); }
});

async function getNodeStorage(id) { const r = new sql.Request(); r.input('id', sql.Int, id); const q = await r.query(`SELECT TOP 1 N.NodeID,N.NodeCode,N.FolderPath,N.PathID,P.RootPath FROM dbo.Nodes N LEFT JOIN dbo.tblPath P ON N.PathID=P.PathID WHERE N.NodeID=@id;`); return q.recordset[0] || null; }
app.get('/api/node-folders/:nodeId', requirePermission('FILE_VIEW'), async (req, res) => { const id = Number(req.params.nodeId); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID' }); try { const node = await getNodeStorage(id); if (!node) return res.status(404).json({ error: 'Node not found' }); const root = getSafeNodeRoot(node.RootPath, node.FolderPath); if (!root) return res.json({ nodeId: id, nodeCode: node.NodeCode, hasFolderPath: false, folders: [] }); if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return res.json({ nodeId: id, nodeCode: node.NodeCode, hasFolderPath: true, folderExists: false, folders: [] }); const folders = ALLOWED_SRSC_FOLDERS.map(name => { const p = path.join(root, name); try { return { name, exists: fs.existsSync(p) && fs.statSync(p).isDirectory() }; } catch (_) { return { name, exists: false }; } }).filter(x => x.exists); res.json({ nodeId: id, nodeCode: node.NodeCode, hasFolderPath: true, folderExists: true, folders }); } catch (e) { sendServerError(res, 'Node folders request failed', e); } });

app.get('/api/node-folder-files/:nodeId/:folderName', requirePermission('FILE_VIEW'), async (req, res) => { const id = Number(req.params.nodeId); const folder = getCanonicalAllowedFolder(req.params.folderName); const subPath = typeof req.query.subPath === 'string' ? req.query.subPath : ''; if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID' }); if (!folder) return res.status(400).json({ error: 'Folder is not allowed' }); try { const node = await getNodeStorage(id); if (!node) return res.status(404).json({ error: 'Node not found' }); const root = getSafeNodeRoot(node.RootPath, node.FolderPath); const target = root ? path.join(root, folder) : null; if (!root || !target || !isPathInside(root, target) || !fs.existsSync(target) || !fs.statSync(target).isDirectory()) return res.status(404).json({ error: 'SRSC folder not found' }); let browse = target; if (subPath) { const safe = isSafeChildPath(target, subPath); if (!safe || !fs.existsSync(safe) || !fs.statSync(safe).isDirectory()) return res.status(404).json({ error: 'Subfolder not found' }); browse = safe; } const items = []; for (const entry of fs.readdirSync(browse, { withFileTypes: true })) { if (entry.name.startsWith('~$')) continue; const p = path.join(browse, entry.name); try { const stat = fs.statSync(p); if (entry.isDirectory()) items.push({ name: entry.name, type: 'folder', kind: 'folder' }); else if (entry.isFile()) items.push({ name: entry.name, type: 'file', kind: getFileKind(entry.name), extension: path.extname(entry.name).toLowerCase(), size: stat.size, modifiedAt: stat.mtime.toISOString() }); } catch (_) { } } items.sort((a, b) => a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })); res.json({ nodeId: id, nodeCode: node.NodeCode, folder, subPath, items }); } catch (e) { sendServerError(res, 'SRSC folder files request failed', e); } });

app.get('/api/node-file', requirePermission('FILE_VIEW'), async (req, res) => { const id = Number(req.query.nodeId); const folder = getCanonicalAllowedFolder(req.query.folder); const file = req.query.file; const subPath = typeof req.query.subPath === 'string' ? req.query.subPath : ''; if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID' }); if (!folder || !file || typeof file !== 'string') return res.status(400).json({ error: 'Invalid folder or file' }); try { const node = await getNodeStorage(id); if (!node) return res.status(404).json({ error: 'Node not found' }); const root = getSafeNodeRoot(node.RootPath, node.FolderPath); const base = root ? path.join(root, folder) : null; const sub = base && subPath ? isSafeChildPath(base, subPath) : base; const full = sub ? isSafeChildPath(sub, file) : null; if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(404).json({ error: 'File not found' }); const ext = path.extname(full).toLowerCase(); res.setHeader('Content-Disposition', `${INLINE_EXTENSIONS.has(ext) ? 'inline' : 'attachment'}; filename="${path.basename(full).replace(/"/g, '')}"`); res.sendFile(full); } catch (e) { sendServerError(res, 'Node file request failed', e); } });

// Deletes a file, or a subfolder (recursively, with everything inside it), from one of a
// Node's SLD/DOC/PIC/Catalog folders. Never allows deleting the SLD/DOC/PIC/Catalog folder
// itself — only files/folders inside it.
app.delete('/api/node-file', requirePermission('FILE_Edit'), async (req, res) => {
  const id = Number(req.query.nodeId);
  const folder = getCanonicalAllowedFolder(req.query.folder);
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  const subPath = typeof req.query.subPath === 'string' ? req.query.subPath : '';
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID' });
  if (!folder) return res.status(400).json({ error: 'Folder is not allowed' });
  if (!name) return res.status(400).json({ error: 'Missing item name' });
  try {
    const node = await getNodeStorage(id);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const root = getSafeNodeRoot(node.RootPath, node.FolderPath);
    const base = root ? path.join(root, folder) : null;
    const parent = base && subPath ? isSafeChildPath(base, subPath) : base;
    const target = parent ? isSafeChildPath(parent, name) : null;
    if (!root || !base || !parent || !target) return res.status(400).json({ error: 'Invalid path' });
    if (path.resolve(target) === path.resolve(base)) return res.status(400).json({ error: 'Cannot delete a top-level company folder (SLD/DOC/PIC/Catalog).' });
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'Item not found' });
    const stat = fs.statSync(target);
    if (stat.isDirectory()) await fs.promises.rm(target, { recursive: true, force: true });
    else await fs.promises.unlink(target);
    srscCache.delete(id);
    res.json({ success: true, deleted: name, type: stat.isDirectory() ? 'folder' : 'file' });
  } catch (e) { sendServerError(res, 'Delete failed', e); }
});

// Uploads files (optionally a whole dragged/browsed folder, via parallel relativePaths[])
// into one of the SLD/DOC/PIC/Catalog folders for a Node. The Node's own storage folder
// (RootPath + FolderPath) is created on disk automatically if it doesn't exist yet — e.g.
// for a brand-new Node — and any subfolder structure is allowed underneath the chosen
// root folder.
// Creates an empty folder inside one of a Node's SLD/DOC/PIC/Catalog folders (or a
// subfolder of one). Used by the "Manage Files" New Folder action.
app.post('/api/node-folder', requirePermission('FILE_Edit'), async (req, res) => {
  const id = Number(req.body?.nodeId);
  const folder = getCanonicalAllowedFolder(req.body?.folder);
  const subPath = typeof req.body?.subPath === 'string' ? req.body.subPath : '';
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID' });
  if (!folder) return res.status(400).json({ error: `Folders can only be created inside one of: ${ALLOWED_SRSC_FOLDERS.join(', ')}` });
  const nameParts = sanitizeRelativePath(name);
  if (!nameParts) return res.status(400).json({ error: 'Invalid folder name.' });
  try {
    const node = await getNodeStorage(id);
    if (!node) return res.status(404).json({ error: 'Node not found.' });
    if (!node.RootPath) return res.status(400).json({ error: 'This Node has no storage root path configured (missing tblPath.RootPath).' });
    if (!node.FolderPath) return res.status(400).json({ error: 'This Node has no FolderPath configured in the database.' });
    const nodeRoot = getSafeNodeRoot(node.RootPath, node.FolderPath);
    if (!nodeRoot) return res.status(400).json({ error: 'Could not resolve a safe storage path for this Node.' });
    await fs.promises.mkdir(nodeRoot, { recursive: true });

    const subParts = subPath ? sanitizeRelativePath(subPath) : [];
    if (subPath && !subParts) return res.status(400).json({ error: 'Invalid subfolder path.' });
    const targetBase = path.join(nodeRoot, folder, ...(subParts || []));
    if (!isPathInside(nodeRoot, targetBase)) return res.status(400).json({ error: 'Invalid subfolder path.' });

    const newFolder = path.join(targetBase, ...nameParts);
    if (!isPathInside(targetBase, newFolder)) return res.status(400).json({ error: 'Invalid folder name.' });
    await fs.promises.mkdir(newFolder, { recursive: true });
    srscCache.delete(id);
    res.json({ success: true, name: nameParts.join('/') });
  } catch (e) { sendServerError(res, 'Folder creation failed', e); }
});

app.post('/api/node-file-upload/:nodeId', requirePermission('FILE_Edit'), async (req, res) => {
  const id = Number(req.params.nodeId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID' });

  try {
    await runMulter(req, res);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Upload failed.' });
  }

  const tempFiles = req.files || [];
  const cleanup = () => Promise.all(tempFiles.map(f => fs.promises.unlink(f.path).catch(() => { })));

  try {
    const folder = getCanonicalAllowedFolder(req.body?.folder);
    if (!folder) { await cleanup(); return res.status(400).json({ error: `Files can only be uploaded into one of: ${ALLOWED_SRSC_FOLDERS.join(', ')}` }); }

    const subPathRaw = typeof req.body?.subPath === 'string' ? req.body.subPath.trim() : '';
    const subPathParts = subPathRaw ? sanitizeRelativePath(subPathRaw) : [];
    if (subPathRaw && !subPathParts) { await cleanup(); return res.status(400).json({ error: 'Invalid subfolder path.' }); }

    if (!tempFiles.length) return res.status(400).json({ error: 'No files were uploaded.' });

    let relativePaths = req.body?.relativePaths;
    if (relativePaths === undefined) relativePaths = [];
    else if (!Array.isArray(relativePaths)) relativePaths = [relativePaths];

    const node = await getNodeStorage(id);
    if (!node) { await cleanup(); return res.status(404).json({ error: 'Node not found.' }); }
    if (!node.RootPath) { await cleanup(); return res.status(400).json({ error: 'This Node has no storage root path configured (missing tblPath.RootPath).' }); }
    if (!node.FolderPath) { await cleanup(); return res.status(400).json({ error: 'This Node has no FolderPath configured in the database.' }); }

    const nodeRoot = getSafeNodeRoot(node.RootPath, node.FolderPath);
    if (!nodeRoot) { await cleanup(); return res.status(400).json({ error: 'Could not resolve a safe storage path for this Node.' }); }

    // Creates the Node's own folder on disk if it's missing — e.g. a brand-new Node,
    // or one whose folder was never created — before anything is uploaded into it.
    await fs.promises.mkdir(nodeRoot, { recursive: true });

    const targetBase = path.join(nodeRoot, folder, ...(subPathParts || []));
    if (!isPathInside(nodeRoot, targetBase)) { await cleanup(); return res.status(400).json({ error: 'Invalid subfolder path.' }); }
    await fs.promises.mkdir(targetBase, { recursive: true });

    const results = [];
    for (let i = 0; i < tempFiles.length; i++) {
      const file = tempFiles[i];
      const relParts = sanitizeRelativePath(relativePaths[i]);
      const finalParts = relParts && relParts.length ? relParts : [path.basename(file.originalname)];
      const destPath = path.join(targetBase, ...finalParts);
      if (!isPathInside(targetBase, destPath)) {
        await fs.promises.unlink(file.path).catch(() => { });
        results.push({ name: finalParts.join('/'), error: 'Invalid path, skipped.' });
        continue;
      }
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await moveFile(file.path, destPath);
      results.push({ name: finalParts.join('/'), size: file.size });
    }

    srscCache.delete(id);
    res.json({ success: true, uploaded: results.filter(r => !r.error).length, files: results, folder, subPath: (subPathParts || []).join('/') });
  } catch (e) {
    await cleanup();
    sendServerError(res, 'File upload failed', e);
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  for (const [ip, state] of loginAttempts) {
    if (state.blockedUntil <= now && now - state.firstAt > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
  for (const [ip, state] of apiRateLimits) {
    if (now - state.startedAt > API_WINDOW_MS) apiRateLimits.delete(ip);
  }
}, 10 * 60 * 1000);

function authenticatePage(req, res, next) {
  const token = parseCookies(req).dms_session;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return res.redirect('/login.html');
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  next();
}

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));
app.get('/index.html', authenticatePage, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.use(express.static(FRONTEND_DIR, { index: false }));

app.listen(PORT, '0.0.0.0', async () => { console.log(`Server running on http://0.0.0.0:${PORT}`); await testDatabaseConnection(); });
);
      if (parts.length !== 6 || parts[0] !== 'scrypt') return resolve(false);
      const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
      const salt = Buffer.from(parts[4], 'base64');
      const expected = Buffer.from(parts[5], 'base64');
      if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) || !salt.length || !expected.length) return resolve(false);
      crypto.scrypt(password, salt, expected.length, { N, r, p }, (err, derived) => {
        if (err) return reject(err);
        resolve(crypto.timingSafeEqual(expected, derived));
      });
    } catch (e) { reject(e); }
  });
}

async function writeAudit(userId, userName, action, ip) {
  try {
    const r = new sql.Request();
    r.input('userId', sql.Int, userId);
    r.input('userName', sql.NVarChar(100), userName);
    r.input('action', sql.NVarChar(100), action);
    r.input('ip', sql.NVarChar(64), ip);
    await r.query("INSERT INTO dbo.Logs (UserID,UserName,Action,IPAddress,CreatedAt) VALUES (@userId,@userName,@action,@ip,SYSUTCDATETIME());");
  } catch (e) { console.warn('Audit log failed:', e.message); }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (req.user.isAdmin || req.user.permissions.has(permission)) return next();
    return res.status(403).json({ error: 'You do not have permission to perform this operation.' });
  };
}

function authenticate(req, res, next) {
  if (req.path === '/auth/login' || req.path === '/auth/logout' || req.path === '/auth/me') return next();
  const cookies = parseCookies(req);
  const token = cookies.dms_session;
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: 'Authentication required.' });
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  req.user = session.user;
  next();
}


const execAsync = util.promisify(exec);
const app = express();
const PORT = 3000;

const config = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=dbDrawingManagment;Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  connectionTimeout: 15000,
  requestTimeout: 30000,
  pool: { max: 30, min: 2, idleTimeoutMillis: 30000 },
};

const ALLOWED_SRSC_FOLDERS = ['SLD', 'DOC', 'PIC', 'Catalog'];
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tif', '.tiff', '.ico']);
const INLINE_EXTENSIONS = new Set(['.pdf', ...IMAGE_EXTENSIONS]);

// IMPORTANT: dbo.Nodes has exactly these columns. There is NO nv column.
const NODE_COLUMNS = [
  'NodeID', 'ParentID', 'NodeCode', 'NodeName', 'IsActive', 'CreatedAt', 'UpdatedAt',
  'FolderPath', 'PathID', 'JET_Position', 'Norme', 'Mass',
].join(', ');
const NODE_COLUMNS_N = NODE_COLUMNS.split(', ').map(c => `N.${c}`).join(', ');

let pdfCache = null;
let pdfCacheComputing = null;

const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'dms-uploads');
try { fs.rmSync(UPLOAD_TMP_DIR, { recursive: true, force: true }); } catch (_) { }
fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_TMP_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${path.basename(file.originalname)}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024, files: 1000 }, // 1GB/file, 1000 files/request — generous for CAD/PDF drawings
});

function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.array('files')(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

async function moveFile(src, dest) {
  try {
    await fs.promises.rename(src, dest);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e; // crossing drives (temp dir vs. network share) — copy then remove
    await fs.promises.copyFile(src, dest);
    await fs.promises.unlink(src);
  }
}

// Splits+validates a relative path (folder upload / manual subfolder), rejecting traversal
// and reserved/illegal Windows filename characters. Returns the path segments, or null.
function sanitizeRelativePath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/\\/g, '/');
  const parts = normalized.split('/').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some(p => p === '..' || p === '.' || /[<>:"|?*\x00-\x1f]/.test(p))) return null;
  return parts;
}

app.use(cors());
app.use(express.json());

function normalizeRelativePath(value) {
  if (value == null) return null;
  const normalized = String(value).trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes('..')) return null;
  return parts.join(path.sep);
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === '' || (Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function getSafeNodeRoot(rootPath, folderPath) {
  const relative = normalizeRelativePath(folderPath);
  return rootPath && relative ? path.resolve(String(rootPath), relative) : null;
}

function isSafeChildPath(basePath, relativePath) {
  if (relativePath == null) return null;
  const normalized = String(relativePath).replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || parts.includes('..') || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;
  const fullPath = path.resolve(basePath, ...parts);
  return isPathInside(basePath, fullPath) ? fullPath : null;
}

function getCanonicalAllowedFolder(folderName) {
  return ALLOWED_SRSC_FOLDERS.find(f => f.toLowerCase() === String(folderName).toLowerCase()) || null;
}

function getFileKind(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf'].includes(ext)) return 'document';
  if (['.dwg', '.dxf', '.dws', '.dwt', '.sldprt', '.sldasm', '.slddrw', '.step', '.stp', '.iges', '.igs'].includes(ext)) return 'cad';
  return 'file';
}

function safePart(value) { return String(value || '').replace(/[\\/:*?"<>|]/g, '-').trim(); }
function sendServerError(res, label, error) { console.error(`${label}:`, error); res.status(500).json({ error: error.message || String(error) }); }

async function warmPdfCache() {
  if (pdfCache) return pdfCache;
  if (pdfCacheComputing) return pdfCacheComputing;
  pdfCacheComputing = sql.query('SELECT PDFID, NodeID, NodeCode, PDFName FROM dbo.DanieliPDF ORDER BY NodeID, PDFID')
    .then(r => { pdfCache = r.recordset || []; pdfCacheComputing = null; console.log(`PDF cache ready: ${pdfCache.length.toLocaleString()} records`); return pdfCache; })
    .catch(e => { pdfCacheComputing = null; console.error('PDF cache warm-up failed:', e.message); return []; });
  return pdfCacheComputing;
}

async function testDatabaseConnection() {
  try {
    const pool = await sql.connect(config);
    console.log('Database: dbDrawingManagment');
    console.log('SQL Server connected successfully');
    try {
      await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_DanieliPDF_NodeID' AND object_id=OBJECT_ID('dbo.DanieliPDF')) CREATE INDEX IX_DanieliPDF_NodeID ON dbo.DanieliPDF(NodeID, PDFID);`);
      console.log('PDF lookup index verified');
    } catch (e) { console.warn('PDF index check skipped:', e.message); }
    try {
      // Every child-listing request and the search CTE filter/join on ParentID against
      // a 106,000+ row table; without this index those were full table scans.
      await pool.request().query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_Nodes_ParentID' AND object_id=OBJECT_ID('dbo.Nodes')) CREATE INDEX IX_Nodes_ParentID ON dbo.Nodes(ParentID);`);
      console.log('Nodes ParentID index verified');
    } catch (e) { console.warn('Nodes ParentID index check skipped:', e.message); }
    warmPdfCache();
  } catch (e) { console.error('SQL Server connection failed'); console.error(e); }
}

app.get('/api/nodes', async (req, res) => {
  try {
    const hasParent = req.query.parentId !== undefined;
    const raw = req.query.parentId;
    const parentId = hasParent && raw !== '' ? Number(raw) : null;
    if (hasParent && raw !== '' && (!Number.isInteger(parentId) || parentId <= 0)) return res.status(400).json({ error: 'Invalid Parent ID.' });
    const request = new sql.Request();
    let where = '';
    if (hasParent) {
      if (parentId === null) where = 'WHERE ParentID IS NULL';
      else { request.input('parentId', sql.Int, parentId); where = 'WHERE ParentID = @parentId'; }
    }
    const result = await request.query(`SELECT ${NODE_COLUMNS}, CASE WHEN EXISTS (SELECT 1 FROM dbo.Nodes AS C WHERE C.ParentID=dbo.Nodes.NodeID) THEN 1 ELSE 0 END AS HasChildren FROM dbo.Nodes ${where} ORDER BY NodeID;`);
    res.json(result.recordset);
  } catch (e) { sendServerError(res, 'Nodes query failed', e); }
});

app.get('/api/nodes/search', async (req, res) => {
  const text = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!text) return res.json({ matches: [], ancestorIds: [], matchIds: [], visibleNodes: [] });
  try {
    const request = new sql.Request();
    request.input('q', sql.NVarChar(255), `%${text}%`);
    // Walks ancestors entirely in SQL (matches + their parent chain only) instead of
    // pulling the whole Nodes table into Node.js to compute ancestors in JS.
    const result = await request.query(`
      ;WITH MatchSeed AS (
        SELECT NodeID, ParentID, CAST(1 AS BIT) AS IsMatch
        FROM dbo.Nodes
        WHERE NodeCode LIKE @q OR NodeName LIKE @q
      ),
      Ancestry AS (
        SELECT NodeID, ParentID, IsMatch FROM MatchSeed
        UNION ALL
        SELECT N.NodeID, N.ParentID, CAST(0 AS BIT)
        FROM dbo.Nodes N
        INNER JOIN Ancestry A ON N.NodeID = A.ParentID
      ),
      DistinctIds AS (
        SELECT NodeID, MAX(CAST(IsMatch AS INT)) AS IsMatch
        FROM Ancestry
        GROUP BY NodeID
      )
      SELECT ${NODE_COLUMNS_N},
             CASE WHEN EXISTS (SELECT 1 FROM dbo.Nodes C WHERE C.ParentID = N.NodeID) THEN 1 ELSE 0 END AS HasChildren,
             D.IsMatch
      FROM dbo.Nodes N
      INNER JOIN DistinctIds D ON D.NodeID = N.NodeID
      ORDER BY N.NodeID
      OPTION (MAXRECURSION 1000);
    `);
    const rows = result.recordset;
    const isMatch = r => r.IsMatch === 1 || r.IsMatch === true;
    const matches = rows.filter(isMatch);
    const ancestorIds = rows.filter(r => !isMatch(r)).map(r => Number(r.NodeID));
    const matchIds = matches.map(r => Number(r.NodeID));
    const visibleNodes = rows.map(({ IsMatch, ...rest }) => rest);
    res.json({ matches, ancestorIds, matchIds, visibleNodes });
  } catch (e) { sendServerError(res, 'Node search failed', e); }
});

app.post('/api/nodes', async (req, res) => {
  const code = typeof req.body?.NodeCode === 'string' ? req.body.NodeCode.trim() : '';
  const name = typeof req.body?.NodeName === 'string' ? req.body.NodeName.trim() : '';
  const parentId = Number(req.body?.ParentID);
  const jet = req.body?.JET_Position == null ? null : String(req.body.JET_Position).trim();
  const norme = req.body?.Norme == null ? null : String(req.body.Norme).trim();
  const mass = req.body?.Mass == null || req.body.Mass === '' ? null : String(req.body.Mass).trim();
  const active = req.body?.IsActive === false || Number(req.body?.IsActive) === 0 ? 0 : 1;
  if (!code || !name) return res.status(400).json({ error: 'Node Code and Node Name are required.' });
  if (!Number.isInteger(parentId) || parentId <= 0) return res.status(400).json({ error: 'A valid parent Node is required.' });
  try {
    const pool = await sql.connect(config); const tx = new sql.Transaction(pool); await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const pr = new sql.Request(tx); pr.input('parentId', sql.Int, parentId);
      const parentResult = await pr.query('SELECT TOP 1 NodeID, FolderPath, PathID FROM dbo.Nodes WITH (UPDLOCK,HOLDLOCK) WHERE NodeID=@parentId;');
      if (!parentResult.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'Parent Node not found.' }); }
      const parent = parentResult.recordset[0];
      const parentFolder = parent.FolderPath ? String(parent.FolderPath).trim() : '';
      const folderPath = parentFolder ? `${parentFolder}\\${safePart(code)} -${safePart(name)}` : `${safePart(code)} -${safePart(name)}`;
      const identity = await new sql.Request(tx).query(`SELECT COLUMNPROPERTY(OBJECT_ID('dbo.Nodes'),'NodeID','IsIdentity') AS IsIdentity;`);
      let result;
      if (Number(identity.recordset[0]?.IsIdentity) === 1) {
        const r = new sql.Request(tx); r.input('parentId', sql.Int, parentId); r.input('code', sql.NVarChar(100), code); r.input('name', sql.NVarChar(255), name); r.input('folderPath', sql.NVarChar(sql.MAX), folderPath); r.input('pathId', sql.Int, parent.PathID ?? null); r.input('jet', sql.NVarChar(255), jet); r.input('norme', sql.NVarChar(255), norme); r.input('mass', sql.NVarChar(255), mass); r.input('active', sql.Bit, active);
        result = await r.query(`INSERT INTO dbo.Nodes (ParentID,NodeCode,NodeName,IsActive,CreatedAt,UpdatedAt,FolderPath,PathID,JET_Position,Norme,Mass) OUTPUT INSERTED.* VALUES (@parentId,@code,@name,@active,SYSUTCDATETIME(),SYSUTCDATETIME(),@folderPath,@pathId,@jet,@norme,@mass);`);
      } else {
        const idr = await new sql.Request(tx).query('SELECT ISNULL(MAX(NodeID),0)+1 AS NodeID FROM dbo.Nodes WITH (UPDLOCK,HOLDLOCK);');
        const r = new sql.Request(tx); r.input('nodeId', sql.Int, Number(idr.recordset[0].NodeID)); r.input('parentId', sql.Int, parentId); r.input('code', sql.NVarChar(100), code); r.input('name', sql.NVarChar(255), name); r.input('folderPath', sql.NVarChar(sql.MAX), folderPath); r.input('pathId', sql.Int, parent.PathID ?? null); r.input('jet', sql.NVarChar(255), jet); r.input('norme', sql.NVarChar(255), norme); r.input('mass', sql.NVarChar(255), mass); r.input('active', sql.Bit, active);
        result = await r.query(`INSERT INTO dbo.Nodes (NodeID,ParentID,NodeCode,NodeName,IsActive,CreatedAt,UpdatedAt,FolderPath,PathID,JET_Position,Norme,Mass) OUTPUT INSERTED.* VALUES (@nodeId,@parentId,@code,@name,@active,SYSUTCDATETIME(),SYSUTCDATETIME(),@folderPath,@pathId,@jet,@norme,@mass);`);
      }
      await tx.commit(); res.status(201).json({ success: true, node: result.recordset[0] });
    } catch (e) { try { await tx.rollback(); } catch (_) { } throw e; }
  } catch (e) { sendServerError(res, 'Node creation failed', e); }
});

app.put('/api/nodes/:nodeId', async (req, res) => {
  const id = Number(req.params.nodeId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID.' });
  const code = typeof req.body?.NodeCode === 'string' ? req.body.NodeCode.trim() : '';
  const name = typeof req.body?.NodeName === 'string' ? req.body.NodeName.trim() : '';
  if (!code || !name) return res.status(400).json({ error: 'Node Code and Node Name are required.' });
  try {
    const r = new sql.Request();
    r.input('id', sql.Int, id); r.input('code', sql.NVarChar(100), code); r.input('name', sql.NVarChar(255), name);
    r.input('jet', sql.NVarChar(255), req.body?.JET_Position == null ? null : String(req.body.JET_Position).trim());
    r.input('norme', sql.NVarChar(255), req.body?.Norme == null ? null : String(req.body.Norme).trim());
    r.input('mass', sql.NVarChar(255), req.body?.Mass == null || req.body.Mass === '' ? null : String(req.body.Mass).trim());
    r.input('active', sql.Bit, req.body?.IsActive === true || Number(req.body?.IsActive) === 1 ? 1 : 0);
    const result = await r.query(`UPDATE dbo.Nodes SET NodeCode=@code,NodeName=@name,JET_Position=@jet,Norme=@norme,Mass=@mass,IsActive=@active,UpdatedAt=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE NodeID=@id;`);
    if (!result.recordset.length) return res.status(404).json({ error: 'Node not found.' });
    res.json({ success: true, node: result.recordset[0] });
  } catch (e) { sendServerError(res, 'Node update failed', e); }
});

app.delete('/api/nodes/:nodeId', async (req, res) => {
  const id = Number(req.params.nodeId); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID.' });
  try {
    const r = new sql.Request(); r.input('id', sql.Int, id);
    if (!(await r.query('SELECT TOP 1 NodeID FROM dbo.Nodes WHERE NodeID=@id;')).recordset.length) return res.status(404).json({ error: 'Node not found.' });
    if ((await r.query('SELECT TOP 1 NodeID FROM dbo.Nodes WHERE ParentID=@id;')).recordset.length) return res.status(409).json({ error: 'This Node has child Nodes. Delete or move the child Nodes first.' });
    if ((await r.query('SELECT TOP 1 PDFID FROM dbo.DanieliPDF WHERE NodeID=@id;')).recordset.length) return res.status(409).json({ error: 'This Node has registered PDF files. Remove the PDF records first.' });
    await r.query('DELETE FROM dbo.Nodes WHERE NodeID=@id;'); srscCache.delete(id); res.json({ success: true, deleted: true, nodeId: id });
  } catch (e) { if (e.number === 547) return res.status(409).json({ error: 'This Node is referenced by another database record and cannot be deleted.' }); sendServerError(res, 'Node deletion failed', e); }
});

app.get('/api/pdfs', async (req, res) => {
  try {
    let ids = null;
    if (req.query.nodeIds !== undefined) ids = String(req.query.nodeIds).split(',').map(Number).filter(Number.isInteger);
    else if (req.query.nodeId !== undefined) ids = [Number(req.query.nodeId)];
    if (ids && ids.some(id => id <= 0)) return res.status(400).json({ error: 'Invalid Node ID.' });
    const data = pdfCache || await warmPdfCache(); if (!ids) return res.json(data); const wanted = new Set(ids); res.json(data.filter(x => wanted.has(Number(x.NodeID))));
  } catch (e) { sendServerError(res, 'PDF query failed', e); }
});

async function getPdfRecord(id) { const r = new sql.Request(); r.input('id', sql.Int, id); const q = await r.query('SELECT d.PDFName,p.RootPath FROM dbo.DanieliPDF d JOIN dbo.tblPath p ON d.PathID=p.PathID WHERE d.PDFID=@id;'); return q.recordset[0] || null; }
app.get('/api/pdf-open/:pdfId', async (req, res) => { const id = Number(req.params.pdfId); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid PDF ID' }); try { const row = await getPdfRecord(id); if (!row) return res.status(404).json({ error: 'PDF record not found' }); const full = isSafeChildPath(row.RootPath, row.PDFName); if (!full || !fs.existsSync(full)) return res.status(404).json({ error: 'PDF file not found on disk' }); await execAsync(`start "" "${full.replace(/"/g, '')}"`, { windowsHide: true }); res.json({ success: true }); } catch (e) { sendServerError(res, 'PDF open failed', e); } });
app.get('/api/pdf-file/:pdfId', async (req, res) => { const id = Number(req.params.pdfId); if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid PDF ID' }); try { const row = await getPdfRecord(id); if (!row) return res.status(404).json({ error: 'PDF record not found' }); const full = isSafeChildPath(row.RootPath, row.PDFName); if (!full || !fs.existsSync(full)) return res.status(404).json({ error: 'PDF file not found on disk' }); res.sendFile(full); } catch (e) { sendServerError(res, 'PDF file request failed', e); } });
