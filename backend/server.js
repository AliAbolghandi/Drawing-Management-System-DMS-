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
const { createAuth } = require('./auth');

const execAsync = util.promisify(exec);
const app = express();

const FRONTEND_ORIGINS = new Set(String(process.env.DMS_FRONTEND_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000').split(',').map(x => x.trim()).filter(Boolean));
app.set('trust proxy', process.env.DMS_TRUST_PROXY === '1');
const auth = createAuth(FRONTEND_ORIGINS);
const PORT = 3000;

const config = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=dbDrawingManagment;Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  connectionTimeout: 15000,
  requestTimeout: 30000,
  pool: { max: 30, min: 2, idleTimeoutMillis: 30000 },
};

const ALLOWED_SRSC_FOLDERS = ['SLD', 'DOC', 'PIC', 'Catalog'];
const IMAGE_EXTENSIONS = new Set(['.jpg','.jpeg','.png','.gif','.bmp','.webp','.svg','.tif','.tiff','.ico']);
const INLINE_EXTENSIONS = new Set(['.pdf', ...IMAGE_EXTENSIONS]);

// IMPORTANT: dbo.Nodes has exactly these columns. There is NO nv column.
const NODE_COLUMNS = [
  'NodeID','ParentID','NodeCode','NodeName','IsActive','CreatedAt','UpdatedAt',
  'FolderPath','PathID','JET_Position','Norme','Mass',
].join(', ');
const NODE_COLUMNS_N = NODE_COLUMNS.split(', ').map(c => `N.${c}`).join(', ');

let pdfCache = null;
let pdfCacheComputing = null;

const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'dms-uploads');
try { fs.rmSync(UPLOAD_TMP_DIR, { recursive: true, force: true }); } catch (_) {}
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

app.use(auth.securityHeaders);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || FRONTEND_ORIGINS.has(origin)),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/auth', auth.router);
app.use('/api', auth.apiSecurity, auth.authenticate);

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
  if (['.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.rtf'].includes(ext)) return 'document';
  if (['.dwg','.dxf','.dws','.dwt','.sldprt','.sldasm','.slddrw','.step','.stp','.iges','.igs'].includes(ext)) return 'cad';
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

app.get('/api/nodes', auth.requirePermission('NODE_VIEW'), async (req, res) => {
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

app.get('/api/nodes/search', auth.requirePermission('NODE_VIEW'), async (req, res) => {
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

app.post('/api/nodes', auth.requirePermission('NODE_CREATE'), async (req, res) => {
  const code = typeof req.body?.NodeCode === 'string' ? req.body.NodeCode.trim() : '';
  const name = typeof req.body?.NodeName === 'string' ? req.body.NodeName.trim() : '';
  const parentRaw = req.body?.ParentID;
  const parentId = parentRaw === null || parentRaw === undefined || parentRaw === '' ? null : Number(parentRaw);
  const jetValue = req.body?.JET_Position == null ? '' : String(req.body.JET_Position).trim();
  const normeValue = req.body?.Norme == null ? '' : String(req.body.Norme).trim();
  const massValue = req.body?.Mass == null ? '' : String(req.body.Mass).trim();
  const jet = jetValue === '' ? null : jetValue;
  const norme = normeValue === '' ? null : normeValue;
  const mass = massValue === '' ? null : massValue;
  const active = req.body?.IsActive === false || Number(req.body?.IsActive) === 0 ? 0 : 1;
  if (!code || !name) return res.status(400).json({ error: 'Node Code and Node Name are required.' });
  if (parentId !== null && (!Number.isInteger(parentId) || parentId <= 0)) return res.status(400).json({ error: 'Invalid parent Node.' });
  try {
    const pool = await sql.connect(config); const tx = new sql.Transaction(pool); await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      let parent = null;
      if (parentId !== null) {
        const pr = new sql.Request(tx); pr.input('parentId', sql.Int, parentId);
        const parentResult = await pr.query('SELECT TOP 1 NodeID, FolderPath, PathID FROM dbo.Nodes WITH (UPDLOCK,HOLDLOCK) WHERE NodeID=@parentId;');
        if (!parentResult.recordset.length) { await tx.rollback(); return res.status(404).json({ error: 'Parent Node not found.' }); }
        parent = parentResult.recordset[0];
      }
      const parentFolder = parent?.FolderPath ? String(parent.FolderPath).trim() : '';
      const folderPath = parentFolder ? `${parentFolder}\\${safePart(code)} -${safePart(name)}` : `${safePart(code)} -${safePart(name)}`;
      const identity = await new sql.Request(tx).query(`SELECT COLUMNPROPERTY(OBJECT_ID('dbo.Nodes'),'NodeID','IsIdentity') AS IsIdentity;`);
      let result;
      if (Number(identity.recordset[0]?.IsIdentity) === 1) {
        const r = new sql.Request(tx); r.input('parentId',sql.Int,parentId); r.input('code',sql.NVarChar(100),code); r.input('name',sql.NVarChar(255),name); r.input('folderPath',sql.NVarChar(sql.MAX),folderPath); r.input('pathId',sql.Int,parent?.PathID ?? null); r.input('jet',sql.NVarChar(255),jet); r.input('norme',sql.NVarChar(255),norme); r.input('mass',sql.NVarChar(255),mass); r.input('active',sql.Bit,active);
        result = await r.query(`INSERT INTO dbo.Nodes (ParentID,NodeCode,NodeName,IsActive,CreatedAt,UpdatedAt,FolderPath,PathID,JET_Position,Norme,Mass) OUTPUT INSERTED.* VALUES (@parentId,@code,@name,@active,SYSUTCDATETIME(),SYSUTCDATETIME(),@folderPath,@pathId,@jet,@norme,@mass);`);
      } else {
        const idr = await new sql.Request(tx).query('SELECT ISNULL(MAX(NodeID),0)+1 AS NodeID FROM dbo.Nodes WITH (UPDLOCK,HOLDLOCK);');
        const r = new sql.Request(tx); r.input('nodeId',sql.Int,Number(idr.recordset[0].NodeID)); r.input('parentId',sql.Int,parentId); r.input('code',sql.NVarChar(100),code); r.input('name',sql.NVarChar(255),name); r.input('folderPath',sql.NVarChar(sql.MAX),folderPath); r.input('pathId',sql.Int,parent?.PathID ?? null); r.input('jet',sql.NVarChar(255),jet); r.input('norme',sql.NVarChar(255),norme); r.input('mass',sql.NVarChar(255),mass); r.input('active',sql.Bit,active);
        result = await r.query(`INSERT INTO dbo.Nodes (NodeID,ParentID,NodeCode,NodeName,IsActive,CreatedAt,UpdatedAt,FolderPath,PathID,JET_Position,Norme,Mass) OUTPUT INSERTED.* VALUES (@nodeId,@parentId,@code,@name,@active,SYSUTCDATETIME(),SYSUTCDATETIME(),@folderPath,@pathId,@jet,@norme,@mass);`);
      }
      await tx.commit(); res.status(201).json({ success:true, node:result.recordset[0] });
    } catch (e) { try { await tx.rollback(); } catch (_) {} throw e; }
  } catch (e) { sendServerError(res, 'Node creation failed', e); }
});

app.put('/api/nodes/:nodeId', auth.requirePermission('NODE_EDIT'), async (req, res) => {
  const id = Number(req.params.nodeId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID.' });
  const code = typeof req.body?.NodeCode === 'string' ? req.body.NodeCode.trim() : '';
  const name = typeof req.body?.NodeName === 'string' ? req.body.NodeName.trim() : '';
  if (!code || !name) return res.status(400).json({ error: 'Node Code and Node Name are required.' });
  try {
    const r = new sql.Request();
    r.input('id',sql.Int,id); r.input('code',sql.NVarChar(100),code); r.input('name',sql.NVarChar(255),name);
    const jetValue = req.body?.JET_Position == null ? '' : String(req.body.JET_Position).trim();
    const normeValue = req.body?.Norme == null ? '' : String(req.body.Norme).trim();
    const massValue = req.body?.Mass == null ? '' : String(req.body.Mass).trim();
    r.input('jet',sql.NVarChar(255),jetValue === '' ? null : jetValue);
    r.input('norme',sql.NVarChar(255),normeValue === '' ? null : normeValue);
    r.input('mass',sql.NVarChar(255),massValue === '' ? null : massValue);
    r.input('active',sql.Bit,req.body?.IsActive === true || Number(req.body?.IsActive) === 1 ? 1 : 0);
    const result = await r.query(`UPDATE dbo.Nodes SET NodeCode=@code,NodeName=@name,JET_Position=@jet,Norme=@norme,Mass=@mass,IsActive=@active,UpdatedAt=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE NodeID=@id;`);
    if (!result.recordset.length) return res.status(404).json({ error: 'Node not found.' });
    res.json({ success:true, node:result.recordset[0] });
  } catch (e) { sendServerError(res, 'Node update failed', e); }
});

app.delete('/api/nodes/:nodeId', auth.requirePermission('NODE_DELETE'), async (req,res) => {
  const id=Number(req.params.nodeId); if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:'Invalid Node ID.'});
  try {
    const r= new sql.Request(); r.input('id',sql.Int,id);
    if(!(await r.query('SELECT TOP 1 NodeID FROM dbo.Nodes WHERE NodeID=@id;')).recordset.length) return res.status(404).json({error:'Node not found.'});
    if((await r.query('SELECT TOP 1 NodeID FROM dbo.Nodes WHERE ParentID=@id;')).recordset.length) return res.status(409).json({error:'This Node has child Nodes. Delete or move the child Nodes first.'});
    if((await r.query('SELECT TOP 1 PDFID FROM dbo.DanieliPDF WHERE NodeID=@id;')).recordset.length) return res.status(409).json({error:'This Node has registered PDF files. Remove the PDF records first.'});
    await r.query('DELETE FROM dbo.Nodes WHERE NodeID=@id;'); srscCache.delete(id); res.json({success:true,deleted:true,nodeId:id});
  } catch(e) { if(e.number===547) return res.status(409).json({error:'This Node is referenced by another database record and cannot be deleted.'}); sendServerError(res,'Node deletion failed',e); }
});

app.get('/api/pdfs', auth.requirePermission('PDF_VIEW'), async (req,res)=>{
  try {
    let ids=null;
    if(req.query.nodeIds!==undefined) ids=String(req.query.nodeIds).split(',').map(Number).filter(Number.isInteger);
    else if(req.query.nodeId!==undefined) ids=[Number(req.query.nodeId)];
    if(ids && ids.some(id=>id<=0)) return res.status(400).json({error:'Invalid Node ID.'});
    const data=pdfCache || await warmPdfCache(); if(!ids) return res.json(data); const wanted=new Set(ids); res.json(data.filter(x=>wanted.has(Number(x.NodeID))));
  } catch(e){sendServerError(res,'PDF query failed',e);}
});

async function getPdfRecord(id){ const r=new sql.Request(); r.input('id',sql.Int,id); const q=await r.query('SELECT d.PDFName,p.RootPath FROM dbo.DanieliPDF d JOIN dbo.tblPath p ON d.PathID=p.PathID WHERE d.PDFID=@id;'); return q.recordset[0]||null; }
app.get('/api/pdf-open/:pdfId', auth.requirePermission('PDF_VIEW'),async(req,res)=>{const id=Number(req.params.pdfId);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid PDF ID'});try{const row=await getPdfRecord(id);if(!row)return res.status(404).json({error:'PDF record not found'});const full=isSafeChildPath(row.RootPath,row.PDFName);if(!full||!fs.existsSync(full))return res.status(404).json({error:'PDF file not found on disk'});await execAsync(`start "" "${full.replace(/"/g,'')}"`,{windowsHide:true});res.json({success:true});}catch(e){sendServerError(res,'PDF open failed',e);}});
app.get('/api/pdf-file/:pdfId', auth.requirePermission('PDF_VIEW'),async(req,res)=>{const id=Number(req.params.pdfId);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid PDF ID'});try{const row=await getPdfRecord(id);if(!row)return res.status(404).json({error:'PDF record not found'});const full=isSafeChildPath(row.RootPath,row.PDFName);if(!full||!fs.existsSync(full))return res.status(404).json({error:'PDF file not found on disk'});res.sendFile(full);}catch(e){sendServerError(res,'PDF file request failed',e);}});

async function pathIsDir(p) {
  try { const s = await fs.promises.stat(p); return s.isDirectory(); } catch (_) { return false; }
}

// nodeId -> boolean. Filled lazily as nodes are actually looked up, never a full upfront scan.
const srscCache = new Map();

// Checks whether a folder contains at least one real file anywhere below it.
// Directories alone (including nested empty directories) do not count as SRSC content.
// Unknown entry types such as symbolic links are treated conservatively as content so
// an unexpected filesystem object is never removed by the empty-folder cleanup.
async function folderContainsFile(folderPath) {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) return true;
    if (entry.isDirectory()) {
      if (await folderContainsFile(path.join(folderPath, entry.name))) return true;
      continue;
    }
    return true;
  }
  return false;
}

// The four SRSC top-level folders are disposable containers. If a container contains
// no files anywhere below it, remove the whole container. A filesystem inspection error
// is handled conservatively: the folder is kept and the status is considered populated
// so an access/IO problem can never cause data deletion.
async function cleanupEmptySrscFolders(root) {
  const removedFolders = [];
  let hasFiles = false;

  for (const folderName of ALLOWED_SRSC_FOLDERS) {
    const folderPath = path.join(root, folderName);
    if (!isPathInside(root, folderPath)) continue;

    let exists = false;
    try {
      exists = await pathIsDir(folderPath);
    } catch (_) {
      exists = false;
    }
    if (!exists) continue;

    let containsFile;
    try {
      containsFile = await folderContainsFile(folderPath);
    } catch (error) {
      console.warn(`SRSC folder inspection failed for ${folderPath}; keeping folder: ${error.message}`);
      hasFiles = true;
      continue;
    }

    if (containsFile) {
      hasFiles = true;
      continue;
    }

    try {
      await fs.promises.rm(folderPath, { recursive: true, force: true });
      removedFolders.push(folderName);
    } catch (error) {
      // Do not report the folder as empty/absent when deletion failed.
      console.warn(`Empty SRSC folder cleanup failed for ${folderPath}: ${error.message}`);
      hasFiles = true;
    }
  }

  return { hasFiles, removedFolders };
}

async function checkNodeSrsc(nodeId, rootPath, folderPath) {
  if (srscCache.has(nodeId)) return srscCache.get(nodeId);
  const root = getSafeNodeRoot(rootPath, folderPath);
  let found = false;
  if (root && await pathIsDir(root)) {
    const result = await cleanupEmptySrscFolders(root);
    found = result.hasFiles;
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
app.get('/api/srsc-pdfs/:nodeId', auth.requirePermission('PDF_VIEW'), async (req, res) => {
  const id = Number(req.params.nodeId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID' });
  try {
    const node = await getNodeStorage(id);
    if (!node) return res.status(404).json({ error: 'Node not found' });
    const root = getSafeNodeRoot(node.RootPath, node.FolderPath);
    if (!root) return res.json({ nodeId:id, files:[] });
    const sld = path.join(root, 'SLD');
    if (!isPathInside(root, sld) || !fs.existsSync(sld) || !fs.statSync(sld).isDirectory()) {
      return res.json({ nodeId:id, files:[] });
    }
    const files = [];
    for (const entry of fs.readdirSync(sld, { withFileTypes:true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.pdf' || entry.name.startsWith('~$')) continue;
      const full = path.join(sld, entry.name);
      const stat = fs.statSync(full);
      files.push({ name:entry.name, size:stat.size, modifiedAt:stat.mtime.toISOString() });
    }
    files.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
    res.json({ nodeId:id, files });
  } catch(e) { sendServerError(res,'SRSC PDF request failed',e); }
});

app.get('/api/srsc-status', auth.requirePermission('PDF_VIEW'), async (req, res) => {
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

async function getNodeHierarchy(id) {
  const chain = [];
  let currentId = Number(id);
  const seen = new Set();

  while (Number.isInteger(currentId) && currentId > 0 && !seen.has(currentId) && chain.length < 100) {
    seen.add(currentId);
    const request = new sql.Request();
    request.input('id', sql.Int, currentId);
    const result = await request.query(
      `SELECT TOP 1 NodeID, ParentID, NodeCode, NodeName
       FROM dbo.Nodes
       WHERE NodeID = @id;`
    );
    const node = result.recordset[0];
    if (!node) break;
    chain.push(node);
    currentId = node.ParentID == null ? null : Number(node.ParentID);
  }

  // chain is current -> parent -> ... -> root. Return root -> current.
  chain.reverse();
  return chain;
}

app.get('/api/node-hierarchy/:nodeId', auth.requirePermission('FILE_VIEW'), async (req, res) => {
  const id = Number(req.params.nodeId);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid Node ID' });
  }

  try {
    const chain = await getNodeHierarchy(id);
    if (!chain.length) return res.status(404).json({ error: 'Node not found' });

    res.json({
      nodeId: id,
      hierarchy: chain.slice(0, 3).map((node, index) => ({
        level: index,
        nodeId: Number(node.NodeID),
        nodeCode: node.NodeCode || '',
        nodeName: node.NodeName || '',
      })),
    });
  } catch (e) {
    sendServerError(res, 'Node hierarchy request failed', e);
  }
});

async function getNodeStorage(id){const r=new sql.Request();r.input('id',sql.Int,id);const q=await r.query(`SELECT TOP 1 N.NodeID,N.NodeCode,N.FolderPath,N.PathID,P.RootPath FROM dbo.Nodes N LEFT JOIN dbo.tblPath P ON N.PathID=P.PathID WHERE N.NodeID=@id;`);return q.recordset[0]||null;}
app.get('/api/node-folders/:nodeId', auth.requirePermission('FILE_VIEW'),async(req,res)=>{const id=Number(req.params.nodeId);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Node ID'});try{const node=await getNodeStorage(id);if(!node)return res.status(404).json({error:'Node not found'});const root=getSafeNodeRoot(node.RootPath,node.FolderPath);if(!root)return res.json({nodeId:id,nodeCode:node.NodeCode,hasFolderPath:false,folders:[]});if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())return res.json({nodeId:id,nodeCode:node.NodeCode,hasFolderPath:true,folderExists:false,folders:[]});const folders=ALLOWED_SRSC_FOLDERS.map(name=>{const p=path.join(root,name);try{return{name,exists:fs.existsSync(p)&&fs.statSync(p).isDirectory()};}catch(_){return{name,exists:false};}}).filter(x=>x.exists);res.json({nodeId:id,nodeCode:node.NodeCode,hasFolderPath:true,folderExists:true,folders});}catch(e){sendServerError(res,'Node folders request failed',e);}});

app.get('/api/node-folder-files/:nodeId/:folderName', auth.requirePermission('FILE_VIEW'),async(req,res)=>{const id=Number(req.params.nodeId);const folder=getCanonicalAllowedFolder(req.params.folderName);const subPath=typeof req.query.subPath==='string'?req.query.subPath:'';if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Node ID'});if(!folder)return res.status(400).json({error:'Folder is not allowed'});try{const node=await getNodeStorage(id);if(!node)return res.status(404).json({error:'Node not found'});const root=getSafeNodeRoot(node.RootPath,node.FolderPath);const target=root?path.join(root,folder):null;if(!root||!target||!isPathInside(root,target)||!fs.existsSync(target)||!fs.statSync(target).isDirectory())return res.status(404).json({error:'SRSC folder not found'});let browse=target;if(subPath){const safe=isSafeChildPath(target,subPath);if(!safe||!fs.existsSync(safe)||!fs.statSync(safe).isDirectory())return res.status(404).json({error:'Subfolder not found'});browse=safe;}const items=[];for(const entry of fs.readdirSync(browse,{withFileTypes:true})){if(entry.name.startsWith('~$'))continue;const p=path.join(browse,entry.name);try{const stat=fs.statSync(p);if(entry.isDirectory())items.push({name:entry.name,type:'folder',kind:'folder'});else if(entry.isFile())items.push({name:entry.name,type:'file',kind:getFileKind(entry.name),extension:path.extname(entry.name).toLowerCase(),size:stat.size,modifiedAt:stat.mtime.toISOString()});}catch(_){}}items.sort((a,b)=>a.type!==b.type?(a.type==='folder'?-1:1):a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));res.json({nodeId:id,nodeCode:node.NodeCode,folder,subPath,items});}catch(e){sendServerError(res,'SRSC folder files request failed',e);}});

app.get('/api/node-file', async(req,res)=>{const id=Number(req.query.nodeId);const folder=getCanonicalAllowedFolder(req.query.folder);const file=req.query.file;const subPath=typeof req.query.subPath==='string'?req.query.subPath:'';if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Node ID'});if(!folder||!file||typeof file!=='string')return res.status(400).json({error:'Invalid folder or file'});try{const node=await getNodeStorage(id);if(!node)return res.status(404).json({error:'Node not found'});const root=getSafeNodeRoot(node.RootPath,node.FolderPath);const base=root?path.join(root,folder):null;const sub=base&&subPath?isSafeChildPath(base,subPath):base;const full=sub?isSafeChildPath(sub,file):null;if(!full||!fs.existsSync(full)||!fs.statSync(full).isFile())return res.status(404).json({error:'File not found'});const ext=path.extname(full).toLowerCase();const requiredPermission=ext==='.pdf'?'PDF_VIEW':'FILE_VIEW';if(!req.user.permissions.has(requiredPermission))return res.status(403).json({error:'Permission denied.'});res.setHeader('Content-Disposition',`${INLINE_EXTENSIONS.has(ext)?'inline':'attachment'}; filename="${path.basename(full).replace(/"/g,'')}"`);res.sendFile(full);}catch(e){sendServerError(res,'Node file request failed',e);}});

// Deletes a file, or a subfolder (recursively, with everything inside it), from one of a
// Node's SLD/DOC/PIC/Catalog folders. Never allows deleting the SLD/DOC/PIC/Catalog folder
// itself — only files/folders inside it.
app.delete('/api/node-file', auth.requirePermission('FILE_Edit'), async (req, res) => {
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

    // Re-evaluate the four SRSC containers immediately after deletion. If the last
    // file was removed from a top-level container, that container is removed as well.
    const cleanupResult = await cleanupEmptySrscFolders(root);
    srscCache.set(id, cleanupResult.hasFiles);

    res.json({
      success: true,
      deleted: name,
      type: stat.isDirectory() ? 'folder' : 'file',
      removedEmptyFolders: cleanupResult.removedFolders,
      hasSrscFiles: cleanupResult.hasFiles,
    });
  } catch (e) { sendServerError(res, 'Delete failed', e); }
});

// Uploads files (optionally a whole dragged/browsed folder, via parallel relativePaths[])
// into one of the SLD/DOC/PIC/Catalog folders for a Node. The Node's own storage folder
// (RootPath + FolderPath) is created on disk automatically if it doesn't exist yet — e.g.
// for a brand-new Node — and any subfolder structure is allowed underneath the chosen
// root folder.
// Creates an empty folder inside one of a Node's SLD/DOC/PIC/Catalog folders (or a
// subfolder of one). Used by the "Manage Files" New Folder action.
app.post('/api/node-folder', auth.requirePermission('FILE_Edit'), async (req, res) => {
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

app.post('/api/node-file-upload/:nodeId', auth.requirePermission('FILE_Edit'), async (req, res) => {
  const id = Number(req.params.nodeId);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid Node ID' });

  try {
    await runMulter(req, res);
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Upload failed.' });
  }

  const tempFiles = req.files || [];
  const cleanup = () => Promise.all(tempFiles.map(f => fs.promises.unlink(f.path).catch(() => {})));

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
        await fs.promises.unlink(file.path).catch(() => {});
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


/* ============================================================
   Drawing Request / User Worklist API
   Authorization is PermissionCode-based. Ownership/responsibility
   is enforced in SQL and is never inferred from RoleID.
   ============================================================ */

function getRequestNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return 'DR-' + stamp + '-' + suffix;
}

app.post('/api/drawing-requests', auth.requirePermission('REQUEST_DRAWING_CREATE'), async (req, res) => {
  const nodeId = Number(req.body?.nodeId);
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';

  if (!Number.isInteger(nodeId) || nodeId <= 0) return res.status(400).json({ error: 'Invalid Node ID.' });
  if (description.length > 1000) return res.status(400).json({ error: 'Description must not exceed 1000 characters.' });

  const db = new sql.Request();
  db.input('nodeId', sql.Int, nodeId);
  db.input('requesterUserId', sql.Int, req.user.userId);

  try {
    const nodeResult = await db.query(`
      SELECT TOP 1 NodeID, NodeCode, NodeName
      FROM dbo.Nodes
      WHERE NodeID=@nodeId AND IsActive=1;
    `);
    const node = nodeResult.recordset[0];
    if (!node) return res.status(404).json({ error: 'Node not found or inactive.' });

    const managerResult = await db.query(`
      SELECT TOP 1 m.UserID AS ManagerUserID, m.Username AS ManagerUsername
      FROM dbo.UserManager um
      INNER JOIN dbo.Users m ON m.UserID=um.ManagerID AND m.IsActive=1
      WHERE um.UserID=@requesterUserId;
    `);
    const manager = managerResult.recordset[0];
    if (!manager) {
      return res.status(409).json({ error: 'No active Manager is assigned to the current user. The request cannot be submitted.' });
    }

    const requestNumber = getRequestNumber();
    const insertRequest = new sql.Request();
    insertRequest.input('requestNumber', sql.NVarChar(30), requestNumber);
    insertRequest.input('nodeId', sql.Int, node.NodeID);
    insertRequest.input('nodeCode', sql.NVarChar(100), node.NodeCode || null);
    insertRequest.input('requesterUserId', sql.Int, req.user.userId);
    insertRequest.input('requesterUsername', sql.NVarChar(100), req.user.username);
    insertRequest.input('managerUserId', sql.Int, Number(manager.ManagerUserID));
    insertRequest.input('managerUsername', sql.NVarChar(100), manager.ManagerUsername || null);
    insertRequest.input('description', sql.NVarChar(1000), description || null);

    const result = await insertRequest.query(`
      DECLARE @requestID int;
      INSERT INTO dbo.DrawingRequests
        (RequestNumber, NodeID, NodeCode, RequesterUserID, RequesterUsername,
         ManagerUserID, ManagerUsername, [Description], StatusID, CreatedAt, UpdatedAt)
      VALUES
        (@requestNumber, @nodeId, @nodeCode, @requesterUserId, @requesterUsername,
         @managerUserId, @managerUsername, @description,
         (SELECT TOP 1 StatusID FROM dbo.DrawingRequestStatuses WHERE StatusCode=N'PENDING_MANAGER'),
         SYSUTCDATETIME(), SYSUTCDATETIME());

      SET @requestID = CONVERT(int, SCOPE_IDENTITY());

      INSERT INTO dbo.DrawingRequestHistory
        (RequestID, RequestNumber, ActionCode, FromStatusID, ToStatusID,
         ActionByUserID, ActionByUsername, Comment, CreatedAt)
      SELECT @requestID, @requestNumber, N'REQUEST_CREATED', NULL, s.StatusID,
             @requesterUserId, @requesterUsername, @description, SYSUTCDATETIME()
      FROM dbo.DrawingRequestStatuses s
      WHERE s.StatusCode=N'PENDING_MANAGER';

      INSERT INTO dbo.Notifications
        (UserID, Username, RequestID, RequestNumber, NotificationType,
         Title, Message, IsRead, CreatedAt)
      VALUES
        (@managerUserId, @managerUsername, @requestID, @requestNumber,
         N'REQUEST_CREATED', N'New Drawing Request',
         CONCAT(N'Drawing request ', @requestNumber, N' requires your Manager approval.'),
         0, SYSUTCDATETIME());

      SELECT dr.RequestID, dr.RequestNumber, dr.NodeID, dr.NodeCode,
             n.NodeName, dr.RequesterUserID, dr.RequesterUsername,
             dr.ManagerUserID, dr.ManagerUsername,
             s.StatusCode, s.StatusName, dr.[Description],
             dr.CreatedAt, dr.UpdatedAt
      FROM dbo.DrawingRequests dr
      INNER JOIN dbo.Nodes n ON n.NodeID=dr.NodeID
      INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID
      WHERE dr.RequestID=@requestID;
    `);

    res.status(201).json({ success: true, request: result.recordset[0] });
  } catch (e) {
    console.error('Drawing request creation failed:', e);
    sendServerError(res, 'Drawing request creation failed', e);
  }
});

app.get('/api/drawing-requests', async (req, res) => {
  const permissions = req.user.permissions;
  const canOwn = permissions.has('REQUEST_DRAWING_VIEW_OWN');
  const canManager = permissions.has('REQUEST_DRAWING_VIEW_MANAGER');
  const canAssigned = permissions.has('REQUEST_DRAWING_VIEW_ASSIGNED');
  const canAll = permissions.has('REQUEST_DRAWING_VIEW_ALL');

  if (!canOwn && !canManager && !canAssigned && !canAll) return res.status(403).json({ error: 'Permission denied.' });

  const db = new sql.Request();
  db.input('userId', sql.Int, req.user.userId);
  db.input('canAll', sql.Bit, canAll);
  db.input('canOwn', sql.Bit, canOwn);
  db.input('canManager', sql.Bit, canManager);
  db.input('canAssigned', sql.Bit, canAssigned);

  try {
    const result = await db.query(`
      SELECT DISTINCT
        dr.RequestID, dr.RequestNumber, dr.NodeID, dr.NodeCode, n.NodeName,
        dr.RequesterUserID, dr.RequesterUsername, dr.ManagerUserID, dr.ManagerUsername,
        dr.AssignedDrawingExpertID, au.Username AS AssignedDrawingExpertUsername,
        s.StatusCode, s.StatusName, dr.[Description], dr.CreatedAt,
        dr.ManagerDecisionAt, dr.ManagerComment, dr.AssignedAt, dr.UpdatedAt
      FROM dbo.DrawingRequests dr
      INNER JOIN dbo.Nodes n ON n.NodeID=dr.NodeID
      INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=dr.StatusID
      LEFT JOIN dbo.Users au ON au.UserID=dr.AssignedDrawingExpertID
      WHERE (@canAll=1)
         OR (@canOwn=1 AND dr.RequesterUserID=@userId)
         OR (@canManager=1 AND dr.ManagerUserID=@userId)
         OR (@canAssigned=1 AND dr.AssignedDrawingExpertID=@userId)
      ORDER BY dr.UpdatedAt DESC, dr.RequestID DESC;
    `);
    res.json({ requests: result.recordset });
  } catch (e) {
    console.error('Drawing worklist load failed:', e);
    sendServerError(res, 'Drawing worklist load failed', e);
  }
});

app.get('/api/drawing-requests/notifications', async (req, res) => {
  const db = new sql.Request();
  db.input('userId', sql.Int, req.user.userId);
  try {
    const result = await db.query(`
      SELECT TOP 50 NotificationID, RequestID, RequestNumber, NotificationType,
             Title, Message, IsRead, CreatedAt, ReadAt
      FROM dbo.Notifications
      WHERE UserID=@userId
      ORDER BY IsRead ASC, CreatedAt DESC, NotificationID DESC;
    `);
    res.json({
      notifications: result.recordset,
      unreadCount: result.recordset.filter(x => !x.IsRead).length
    });
  } catch (e) {
    console.error('Notification load failed:', e);
    sendServerError(res, 'Notification load failed', e);
  }
});

app.patch('/api/drawing-requests/notifications/:notificationId/read', async (req, res) => {
  const notificationId = Number(req.params.notificationId);
  if (!Number.isInteger(notificationId) || notificationId <= 0) return res.status(400).json({ error: 'Invalid notification ID.' });

  const db = new sql.Request();
  db.input('notificationId', sql.Int, notificationId);
  db.input('userId', sql.Int, req.user.userId);
  try {
    const result = await db.query(`
      UPDATE dbo.Notifications
      SET IsRead=1, ReadAt=SYSUTCDATETIME()
      WHERE NotificationID=@notificationId AND UserID=@userId;
      SELECT @@ROWCOUNT AS Updated;
    `);
    if (Number(result.recordset[0]?.Updated || 0) === 0) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ success: true });
  } catch (e) {
    console.error('Notification update failed:', e);
    sendServerError(res, 'Notification update failed', e);
  }
});


/* ===== ADMIN DATABASE MANAGEMENT ===== */
async function adminMetadata(tableName) {
  const r = new sql.Request();
  r.input('tableName', sql.NVarChar(128), tableName);
  const q = await r.query(
    "SELECT c.column_id AS ColumnID,c.name AS ColumnName,ty.name AS DataType,c.max_length AS MaxLength,c.precision AS PrecisionValue,c.scale AS ScaleValue,c.is_nullable AS IsNullable,c.is_identity AS IsIdentity,c.is_computed AS IsComputed,dc.definition AS DefaultDefinition,CAST(CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS bit) AS IsPrimaryKey " +
    "FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id=t.schema_id INNER JOIN sys.columns c ON c.object_id=t.object_id INNER JOIN sys.types ty ON ty.user_type_id=c.user_type_id " +
    "LEFT JOIN sys.default_constraints dc ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id " +
    "LEFT JOIN (SELECT ic.object_id,ic.column_id FROM sys.index_columns ic INNER JOIN sys.indexes i ON i.object_id=ic.object_id AND i.index_id=ic.index_id WHERE i.is_primary_key=1) pk ON pk.object_id=c.object_id AND pk.column_id=c.column_id " +
    "WHERE s.name=N'dbo' AND t.name=@tableName ORDER BY c.column_id;"
  );
  if (!q.recordset.length) return null;
  const fq = await r.query(
    "SELECT pc.name AS ColumnName,OBJECT_SCHEMA_NAME(fkc.referenced_object_id)+N'.'+OBJECT_NAME(fkc.referenced_object_id) AS ReferencedTable,rc.name AS ReferencedColumn " +
    "FROM sys.foreign_key_columns fkc INNER JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id INNER JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id " +
    "WHERE fkc.parent_object_id=OBJECT_ID(N'dbo.' + @tableName);"
  );
  const columns=q.recordset.map(c=>({...c,ColumnID:Number(c.ColumnID),MaxLength:Number(c.MaxLength),PrecisionValue:Number(c.PrecisionValue),ScaleValue:Number(c.ScaleValue),IsNullable:Boolean(c.IsNullable),IsIdentity:Boolean(c.IsIdentity),IsComputed:Boolean(c.IsComputed),IsPrimaryKey:Boolean(c.IsPrimaryKey),ReadOnly:Boolean(c.IsIdentity||c.IsComputed||['CreatedAt','UpdatedAt','LastLoginAt'].includes(c.ColumnName))}));
  return {tableName,readOnly:tableName==='Logs',columns,foreignKeys:fq.recordset.map(x=>({ColumnName:x.ColumnName,ReferencedTable:x.ReferencedTable,ReferencedColumn:x.ReferencedColumn}))};
}
async function adminTableList(){
  const q=await new sql.Request().query("SELECT t.name AS TableName,SUM(p.rows) AS ApproxRows FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id=t.schema_id LEFT JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1) WHERE s.name=N'dbo' AND t.name<>N'sysdiagrams' GROUP BY t.name ORDER BY t.name;");
  return q.recordset.map(x=>({tableName:x.TableName,approxRows:Number(x.ApproxRows||0)}));
}
function adminQI(n){return '['+String(n).replace(/]/g,']]')+']';}
function adminType(c){
  const t=String(c.DataType).toLowerCase();
  if(['nvarchar','nchar','ntext'].includes(t))return sql.NVarChar(sql.MAX);
  if(['varchar','char','text'].includes(t))return sql.VarChar(sql.MAX);
  if(t==='uniqueidentifier')return sql.UniqueIdentifier;
  if(t==='int')return sql.Int;if(t==='bigint')return sql.BigInt;if(t==='smallint')return sql.SmallInt;if(t==='tinyint')return sql.TinyInt;if(t==='bit')return sql.Bit;
  if(['decimal','numeric'].includes(t))return sql.Decimal(Math.max(1,c.PrecisionValue||18),Math.max(0,c.ScaleValue||0));
  if(t==='float')return sql.Float;if(t==='real')return sql.Real;if(t==='date')return sql.Date;if(t==='datetime')return sql.DateTime;if(t==='datetime2')return sql.DateTime2;if(t==='smalldatetime')return sql.SmallDateTime;if(t==='time')return sql.Time;if(t==='money')return sql.Money;if(t==='smallmoney')return sql.SmallMoney;
  if(['binary','varbinary','image'].includes(t))return sql.VarBinary(sql.MAX);
  return sql.NVarChar(sql.MAX);
}
function adminValue(c,v){
  if(v===undefined)return undefined;if(v===null||v==='')return c.IsNullable?null:v;
  const t=String(c.DataType).toLowerCase();
  if(t==='bit'){if(typeof v==='boolean')return v;if(v===1||v==='1'||String(v).toLowerCase()==='true')return true;if(v===0||v==='0'||String(v).toLowerCase()==='false')return false;throw Object.assign(new Error('Invalid bit value for '+c.ColumnName+'.'),{statusCode:400});}
  if(['int','bigint','smallint','tinyint'].includes(t)){const n=Number(v);if(!Number.isInteger(n))throw Object.assign(new Error('Invalid integer value for '+c.ColumnName+'.'),{statusCode:400});return n;}
  if(['decimal','numeric','float','real','money','smallmoney'].includes(t)){const n=Number(v);if(!Number.isFinite(n))throw Object.assign(new Error('Invalid numeric value for '+c.ColumnName+'.'),{statusCode:400});return n;}
  return v;
}
function adminKeys(meta,keys,r){
  const pk=meta.columns.filter(c=>c.IsPrimaryKey);
  if(!pk.length)throw Object.assign(new Error('This table has no primary key and cannot be edited or deleted safely.'),{statusCode:400});
  if(!keys||typeof keys!=='object')throw Object.assign(new Error('Primary key values are required.'),{statusCode:400});
  return pk.map(c=>{if(!(c.ColumnName in keys))throw Object.assign(new Error('Missing primary key: '+c.ColumnName+'.'),{statusCode:400});const p='key_'+c.ColumnName.replace(/[^A-Za-z0-9_]/g,'_');r.input(p,adminType(c),adminValue(c,keys[c.ColumnName]));return adminQI(c.ColumnName)+'=@'+p;}).join(' AND ');
}
async function adminHash(password){
  if(typeof password!=='string'||password.length<8)throw Object.assign(new Error('Password must be at least 8 characters.'),{statusCode:400});
  return new Promise((resolve,reject)=>{const N=16384,r=8,p=1,keyLength=64,salt=crypto.randomBytes(16);crypto.scrypt(password,salt,keyLength,{N,r,p},(e,d)=>e?reject(e):resolve(['scrypt',N,r,p,salt.toString('base64'),d.toString('base64')].join('

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));
app.get('/index.html', auth.authenticatePage, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.get('/management.html', auth.authenticatePage, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'management.html')));
app.use(express.static(FRONTEND_DIR, { index: false }));

app.listen(PORT,'0.0.0.0',async()=>{console.log(`Server running on http://0.0.0.0:${PORT}`);await testDatabaseConnection();});
)));});
}
app.get('/api/admin/tables',auth.requireAdmin(),async(req,res)=>{
  try{const ts=await adminTableList();const tables=[];for(const t of ts)tables.push({...await adminMetadata(t.tableName),approxRows:t.approxRows});res.json({tables});}catch(e){sendServerError(res,'Admin table metadata failed',e);}
});
app.get('/api/admin/lookups/:tableName',auth.requireAdmin(),async(req,res)=>{
  try{const m=await adminMetadata(String(req.params.tableName||''));if(!m)return res.status(404).json({error:'Table not found.'});const pk=m.columns.filter(c=>c.IsPrimaryKey);if(pk.length!==1)return res.json({items:[]});const label=m.columns.find(c=>['name','code','username','title','statusname','permissioncode','rolecode','actioncode','sourcename'].includes(c.ColumnName.toLowerCase()))||pk[0];const q=await new sql.Request().query("SELECT TOP 1000 "+adminQI(pk[0].ColumnName)+" AS Value,TRY_CONVERT(nvarchar(255),"+adminQI(label.ColumnName)+") AS Label FROM dbo."+adminQI(m.tableName)+" ORDER BY "+adminQI(label.ColumnName)+";");res.json({items:q.recordset});}catch(e){sendServerError(res,'Admin lookup failed',e);}
});
app.get('/api/admin/tables/:tableName/rows',auth.requireAdmin(),async(req,res)=>{
  try{const m=await adminMetadata(String(req.params.tableName||''));if(!m)return res.status(404).json({error:'Table not found.'});const page=Math.min(10000,Math.max(1,Number(req.query.page)||1)),size=Math.min(200,Math.max(10,Number(req.query.pageSize)||50)),search=typeof req.query.search==='string'?req.query.search.trim():'';const order=m.columns.find(c=>c.IsPrimaryKey)?.ColumnName||m.columns[0].ColumnName,r=new sql.Request();r.input('offset',sql.Int,(page-1)*size);r.input('fetch',sql.Int,size);const ss=m.columns.filter(c=>['nvarchar','varchar','nchar','char','text','ntext'].includes(String(c.DataType).toLowerCase())).slice(0,10);let where='';if(search&&ss.length){r.input('search',sql.NVarChar(4000),'%'+search+'%');where='WHERE '+ss.map(c=>"TRY_CONVERT(nvarchar(max),"+adminQI(c.ColumnName)+") LIKE @search").join(' OR ');}const count=await r.query("SELECT COUNT_BIG(*) AS Total FROM dbo."+adminQI(m.tableName)+" "+where+";");const rows=await r.query("SELECT "+m.columns.map(c=>adminQI(c.ColumnName)).join(',')+" FROM dbo."+adminQI(m.tableName)+" "+where+" ORDER BY "+adminQI(order)+" OFFSET @offset ROWS FETCH NEXT @fetch ROWS ONLY;");res.json({table:m,rows:rows.recordset,total:Number(count.recordset[0].Total),page,pageSize:size});}catch(e){sendServerError(res,'Admin table rows failed',e);}
});
app.post('/api/admin/tables/:tableName/rows',auth.requireAdmin(),async(req,res)=>{
  try{const n=String(req.params.tableName||''),m=await adminMetadata(n);if(!m)return res.status(404).json({error:'Table not found.'});if(m.readOnly)return res.status(403).json({error:'This table is read-only.'});const data=req.body?.data&&typeof req.body.data==='object'?req.body.data:{},r=new sql.Request(),fields=[],params=[];for(const c of m.columns){if(c.IsIdentity||c.IsComputed||c.ReadOnly||c.ColumnName==='PasswordHash'||!(c.ColumnName in data))continue;const p='v_'+c.ColumnName.replace(/[^A-Za-z0-9_]/g,'_');r.input(p,adminType(c),adminValue(c,data[c.ColumnName]));fields.push(adminQI(c.ColumnName));params.push('@'+p);}if(n==='Users'&&typeof req.body?.password==='string'&&req.body.password.length){r.input('passwordHash',sql.NVarChar(500),await adminHash(req.body.password));fields.push('[PasswordHash]');params.push('@passwordHash');}if(!fields.length)return res.status(400).json({error:'No writable values were supplied.'});const q=await r.query("INSERT INTO dbo."+adminQI(n)+" ("+fields.join(',')+") OUTPUT INSERTED.* VALUES ("+params.join(',')+");");await auth.writeAudit(req.user.userId,req.user.username,'ADMIN_INSERT_'+n,req.ip);res.status(201).json({success:true,row:q.recordset[0]});}catch(e){if(e.number===2627||e.number===2601)return res.status(409).json({error:'Duplicate value violates a unique constraint.'});if(e.number===547)return res.status(409).json({error:'Foreign key constraint prevents this operation.'});res.status(e.statusCode||500).json({error:e.message||'Insert failed.'});}
});
app.patch('/api/admin/tables/:tableName/rows',auth.requireAdmin(),async(req,res)=>{
  try{const n=String(req.params.tableName||''),m=await adminMetadata(n);if(!m)return res.status(404).json({error:'Table not found.'});if(m.readOnly)return res.status(403).json({error:'This table is read-only.'});const data=req.body?.data&&typeof req.body.data==='object'?req.body.data:{},r=new sql.Request(),set=[];for(const c of m.columns){if(c.IsIdentity||c.IsComputed||c.ReadOnly||c.IsPrimaryKey||c.ColumnName==='PasswordHash'||!(c.ColumnName in data))continue;const p='v_'+c.ColumnName.replace(/[^A-Za-z0-9_]/g,'_');r.input(p,adminType(c),adminValue(c,data[c.ColumnName]));set.push(adminQI(c.ColumnName)+'=@'+p);}if(n==='Users'&&typeof req.body?.password==='string'&&req.body.password.length){r.input('passwordHash',sql.NVarChar(500),await adminHash(req.body.password));set.push('[PasswordHash]=@passwordHash');}if(!set.length)return res.status(400).json({error:'No editable values were supplied.'});const where=adminKeys(m,req.body?.keys,r),q=await r.query("UPDATE dbo."+adminQI(n)+" SET "+set.join(',')+" WHERE "+where+"; SELECT @@ROWCOUNT AS Affected;");if(Number(q.recordset[0]?.Affected||0)!==1)return res.status(404).json({error:'Record not found.'});await auth.writeAudit(req.user.userId,req.user.username,'ADMIN_UPDATE_'+n,req.ip);res.json({success:true});}catch(e){if(e.number===2627||e.number===2601)return res.status(409).json({error:'Duplicate value violates a unique constraint.'});if(e.number===547)return res.status(409).json({error:'Foreign key constraint prevents this operation.'});res.status(e.statusCode||500).json({error:e.message||'Update failed.'});}
});
app.delete('/api/admin/tables/:tableName/rows',auth.requireAdmin(),async(req,res)=>{
  try{const n=String(req.params.tableName||''),m=await adminMetadata(n);if(!m)return res.status(404).json({error:'Table not found.'});if(m.readOnly)return res.status(403).json({error:'This table is read-only.'});const r=new sql.Request(),where=adminKeys(m,req.body?.keys,r),q=await r.query("DELETE FROM dbo."+adminQI(n)+" WHERE "+where+"; SELECT @@ROWCOUNT AS Affected;");if(Number(q.recordset[0]?.Affected||0)!==1)return res.status(404).json({error:'Record not found.'});await auth.writeAudit(req.user.userId,req.user.username,'ADMIN_DELETE_'+n,req.ip);res.json({success:true});}catch(e){if(e.number===547)return res.status(409).json({error:'Foreign key constraint prevents deletion. Remove dependent records first.'});res.status(e.statusCode||500).json({error:e.message||'Delete failed.'});}
});

setInterval(() => auth.cleanup(), 10 * 60 * 1000);

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'login.html')));
app.get('/index.html', auth.authenticatePage, (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.use(express.static(FRONTEND_DIR, { index: false }));

app.listen(PORT,'0.0.0.0',async()=>{console.log(`Server running on http://0.0.0.0:${PORT}`);await testDatabaseConnection();});
