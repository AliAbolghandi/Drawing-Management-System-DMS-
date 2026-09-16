const express = require('express');
const sql = require('mssql/msnodesqlv8');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const util = require('util');
const { exec } = require('child_process');

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
const IMAGE_EXTENSIONS = new Set(['.jpg','.jpeg','.png','.gif','.bmp','.webp','.svg','.tif','.tiff','.ico']);
const INLINE_EXTENSIONS = new Set(['.pdf', ...IMAGE_EXTENSIONS]);

// IMPORTANT: dbo.Nodes has exactly these columns. There is NO nv column.
const NODE_COLUMNS = [
  'NodeID','ParentID','NodeCode','NodeName','IsActive','CreatedAt','UpdatedAt',
  'FolderPath','PathID','JET_Position','Norme','Mass',
].join(', ');

let srscStatusCache = null;
let srscStatusComputing = null;
let pdfCache = null;
let pdfCacheComputing = null;

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
    const matchesResult = await request.query(`SELECT ${NODE_COLUMNS} FROM dbo.Nodes WHERE NodeCode LIKE @q OR NodeName LIKE @q ORDER BY NodeID;`);
    const allResult = await sql.query(`SELECT ${NODE_COLUMNS}, CASE WHEN EXISTS (SELECT 1 FROM dbo.Nodes AS C WHERE C.ParentID=dbo.Nodes.NodeID) THEN 1 ELSE 0 END AS HasChildren FROM dbo.Nodes ORDER BY NodeID;`);
    const all = allResult.recordset;
    const map = new Map(all.map(n => [Number(n.NodeID), n]));
    const ancestors = new Set();
    for (const match of matchesResult.recordset) {
      let id = Number(match.NodeID); const seen = new Set();
      while (id && !seen.has(id)) {
        seen.add(id); const p = map.get(id)?.ParentID;
        if (p == null) break;
        ancestors.add(Number(p)); id = Number(p);
      }
    }
    const visibleIds = new Set(matchesResult.recordset.map(n => Number(n.NodeID)));
    ancestors.forEach(id => visibleIds.add(id));
    res.json({ matches: matchesResult.recordset, ancestorIds: [...ancestors], matchIds: matchesResult.recordset.map(n => Number(n.NodeID)), visibleNodes: all.filter(n => visibleIds.has(Number(n.NodeID))) });
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
        const r = new sql.Request(tx); r.input('parentId',sql.Int,parentId); r.input('code',sql.NVarChar(100),code); r.input('name',sql.NVarChar(255),name); r.input('folderPath',sql.NVarChar(sql.MAX),folderPath); r.input('pathId',sql.Int,parent.PathID ?? null); r.input('jet',sql.NVarChar(255),jet); r.input('norme',sql.NVarChar(255),norme); r.input('mass',sql.NVarChar(255),mass); r.input('active',sql.Bit,active);
        result = await r.query(`INSERT INTO dbo.Nodes (ParentID,NodeCode,NodeName,IsActive,CreatedAt,UpdatedAt,FolderPath,PathID,JET_Position,Norme,Mass) OUTPUT INSERTED.* VALUES (@parentId,@code,@name,@active,SYSUTCDATETIME(),SYSUTCDATETIME(),@folderPath,@pathId,@jet,@norme,@mass);`);
      } else {
        const idr = await new sql.Request(tx).query('SELECT ISNULL(MAX(NodeID),0)+1 AS NodeID FROM dbo.Nodes WITH (UPDLOCK,HOLDLOCK);');
        const r = new sql.Request(tx); r.input('nodeId',sql.Int,Number(idr.recordset[0].NodeID)); r.input('parentId',sql.Int,parentId); r.input('code',sql.NVarChar(100),code); r.input('name',sql.NVarChar(255),name); r.input('folderPath',sql.NVarChar(sql.MAX),folderPath); r.input('pathId',sql.Int,parent.PathID ?? null); r.input('jet',sql.NVarChar(255),jet); r.input('norme',sql.NVarChar(255),norme); r.input('mass',sql.NVarChar(255),mass); r.input('active',sql.Bit,active);
        result = await r.query(`INSERT INTO dbo.Nodes (NodeID,ParentID,NodeCode,NodeName,IsActive,CreatedAt,UpdatedAt,FolderPath,PathID,JET_Position,Norme,Mass) OUTPUT INSERTED.* VALUES (@nodeId,@parentId,@code,@name,@active,SYSUTCDATETIME(),SYSUTCDATETIME(),@folderPath,@pathId,@jet,@norme,@mass);`);
      }
      await tx.commit(); srscStatusCache = null; res.status(201).json({ success:true, node:result.recordset[0] });
    } catch (e) { try { await tx.rollback(); } catch (_) {} throw e; }
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
    r.input('id',sql.Int,id); r.input('code',sql.NVarChar(100),code); r.input('name',sql.NVarChar(255),name);
    r.input('jet',sql.NVarChar(255),req.body?.JET_Position == null ? null : String(req.body.JET_Position).trim());
    r.input('norme',sql.NVarChar(255),req.body?.Norme == null ? null : String(req.body.Norme).trim());
    r.input('mass',sql.NVarChar(255),req.body?.Mass == null || req.body.Mass === '' ? null : String(req.body.Mass).trim());
    r.input('active',sql.Bit,req.body?.IsActive === true || Number(req.body?.IsActive) === 1 ? 1 : 0);
    const result = await r.query(`UPDATE dbo.Nodes SET NodeCode=@code,NodeName=@name,JET_Position=@jet,Norme=@norme,Mass=@mass,IsActive=@active,UpdatedAt=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE NodeID=@id;`);
    if (!result.recordset.length) return res.status(404).json({ error: 'Node not found.' });
    srscStatusCache = null; res.json({ success:true, node:result.recordset[0] });
  } catch (e) { sendServerError(res, 'Node update failed', e); }
});

app.delete('/api/nodes/:nodeId', async (req,res) => {
  const id=Number(req.params.nodeId); if(!Number.isInteger(id)||id<=0) return res.status(400).json({error:'Invalid Node ID.'});
  try {
    const r= new sql.Request(); r.input('id',sql.Int,id);
    if(!(await r.query('SELECT TOP 1 NodeID FROM dbo.Nodes WHERE NodeID=@id;')).recordset.length) return res.status(404).json({error:'Node not found.'});
    if((await r.query('SELECT TOP 1 NodeID FROM dbo.Nodes WHERE ParentID=@id;')).recordset.length) return res.status(409).json({error:'This Node has child Nodes. Delete or move the child Nodes first.'});
    if((await r.query('SELECT TOP 1 PDFID FROM dbo.DanieliPDF WHERE NodeID=@id;')).recordset.length) return res.status(409).json({error:'This Node has registered PDF files. Remove the PDF records first.'});
    await r.query('DELETE FROM dbo.Nodes WHERE NodeID=@id;'); srscStatusCache=null; res.json({success:true,deleted:true,nodeId:id});
  } catch(e) { if(e.number===547) return res.status(409).json({error:'This Node is referenced by another database record and cannot be deleted.'}); sendServerError(res,'Node deletion failed',e); }
});

app.get('/api/pdfs', async (req,res)=>{
  try {
    let ids=null;
    if(req.query.nodeIds!==undefined) ids=String(req.query.nodeIds).split(',').map(Number).filter(Number.isInteger);
    else if(req.query.nodeId!==undefined) ids=[Number(req.query.nodeId)];
    if(ids && ids.some(id=>id<=0)) return res.status(400).json({error:'Invalid Node ID.'});
    const data=pdfCache || await warmPdfCache(); if(!ids) return res.json(data); const wanted=new Set(ids); res.json(data.filter(x=>wanted.has(Number(x.NodeID))));
  } catch(e){sendServerError(res,'PDF query failed',e);}
});

async function getPdfRecord(id){ const r=new sql.Request(); r.input('id',sql.Int,id); const q=await r.query('SELECT d.PDFName,p.RootPath FROM dbo.DanieliPDF d JOIN dbo.tblPath p ON d.PathID=p.PathID WHERE d.PDFID=@id;'); return q.recordset[0]||null; }
app.get('/api/pdf-open/:pdfId',async(req,res)=>{const id=Number(req.params.pdfId);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid PDF ID'});try{const row=await getPdfRecord(id);if(!row)return res.status(404).json({error:'PDF record not found'});const full=isSafeChildPath(row.RootPath,row.PDFName);if(!full||!fs.existsSync(full))return res.status(404).json({error:'PDF file not found on disk'});await execAsync(`start "" "${full.replace(/"/g,'')}"`,{windowsHide:true});res.json({success:true});}catch(e){sendServerError(res,'PDF open failed',e);}});
app.get('/api/pdf-file/:pdfId',async(req,res)=>{const id=Number(req.params.pdfId);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid PDF ID'});try{const row=await getPdfRecord(id);if(!row)return res.status(404).json({error:'PDF record not found'});const full=isSafeChildPath(row.RootPath,row.PDFName);if(!full||!fs.existsSync(full))return res.status(404).json({error:'PDF file not found on disk'});res.sendFile(full);}catch(e){sendServerError(res,'PDF file request failed',e);}});

async function computeSrscStatus(){
  const q=await sql.query(`SELECT N.NodeID,N.FolderPath,N.PathID,P.RootPath FROM dbo.Nodes N LEFT JOIN dbo.tblPath P ON N.PathID=P.PathID WHERE N.FolderPath IS NOT NULL AND LTRIM(RTRIM(N.FolderPath))<>'';`); const ids=[];
  for(const row of q.recordset){const root=getSafeNodeRoot(row.RootPath,row.FolderPath);if(!root)continue;try{if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())continue;if(ALLOWED_SRSC_FOLDERS.some(f=>{try{const p=path.join(root,f);return fs.existsSync(p)&&fs.statSync(p).isDirectory();}catch(_){return false;}}))ids.push(Number(row.NodeID));}catch(_){} }
  return ids;
}
async function getSrscStatus(force=false){if(!force&&srscStatusCache)return srscStatusCache;if(srscStatusComputing)return srscStatusComputing;srscStatusComputing=computeSrscStatus().then(ids=>{srscStatusCache=ids;srscStatusComputing=null;return ids;}).catch(e=>{srscStatusComputing=null;throw e;});return srscStatusComputing;}
app.get('/api/srsc-status',async(req,res)=>{try{const force=req.query.refresh==='1';if(!force&&!srscStatusCache){getSrscStatus(false).catch(e=>console.error('SRSC background scan failed:',e.message));return res.json({nodeIds:[],count:0,pending:true});}const ids=await getSrscStatus(force);res.json({nodeIds:ids,count:ids.length,pending:false});}catch(e){sendServerError(res,'SRSC status failed',e);}});

async function getNodeStorage(id){const r=new sql.Request();r.input('id',sql.Int,id);const q=await r.query(`SELECT TOP 1 N.NodeID,N.NodeCode,N.FolderPath,N.PathID,P.RootPath FROM dbo.Nodes N LEFT JOIN dbo.tblPath P ON N.PathID=P.PathID WHERE N.NodeID=@id;`);return q.recordset[0]||null;}
app.get('/api/node-folders/:nodeId',async(req,res)=>{const id=Number(req.params.nodeId);if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Node ID'});try{const node=await getNodeStorage(id);if(!node)return res.status(404).json({error:'Node not found'});const root=getSafeNodeRoot(node.RootPath,node.FolderPath);if(!root)return res.json({nodeId:id,nodeCode:node.NodeCode,hasFolderPath:false,folders:[]});if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())return res.json({nodeId:id,nodeCode:node.NodeCode,hasFolderPath:true,folderExists:false,folders:[]});const folders=ALLOWED_SRSC_FOLDERS.map(name=>{const p=path.join(root,name);try{return{name,exists:fs.existsSync(p)&&fs.statSync(p).isDirectory()};}catch(_){return{name,exists:false};}}).filter(x=>x.exists);res.json({nodeId:id,nodeCode:node.NodeCode,hasFolderPath:true,folderExists:true,folders});}catch(e){sendServerError(res,'Node folders request failed',e);}});

app.get('/api/node-folder-files/:nodeId/:folderName',async(req,res)=>{const id=Number(req.params.nodeId);const folder=getCanonicalAllowedFolder(req.params.folderName);const subPath=typeof req.query.subPath==='string'?req.query.subPath:'';if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Node ID'});if(!folder)return res.status(400).json({error:'Folder is not allowed'});try{const node=await getNodeStorage(id);if(!node)return res.status(404).json({error:'Node not found'});const root=getSafeNodeRoot(node.RootPath,node.FolderPath);const target=root?path.join(root,folder):null;if(!root||!target||!isPathInside(root,target)||!fs.existsSync(target)||!fs.statSync(target).isDirectory())return res.status(404).json({error:'SRSC folder not found'});let browse=target;if(subPath){const safe=isSafeChildPath(target,subPath);if(!safe||!fs.existsSync(safe)||!fs.statSync(safe).isDirectory())return res.status(404).json({error:'Subfolder not found'});browse=safe;}const items=[];for(const entry of fs.readdirSync(browse,{withFileTypes:true})){if(entry.name.startsWith('~$'))continue;const p=path.join(browse,entry.name);try{const stat=fs.statSync(p);if(entry.isDirectory())items.push({name:entry.name,type:'folder',kind:'folder'});else if(entry.isFile())items.push({name:entry.name,type:'file',kind:getFileKind(entry.name),extension:path.extname(entry.name).toLowerCase(),size:stat.size,modifiedAt:stat.mtime.toISOString()});}catch(_){}}items.sort((a,b)=>a.type!==b.type?(a.type==='folder'?-1:1):a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));res.json({nodeId:id,nodeCode:node.NodeCode,folder,subPath,items});}catch(e){sendServerError(res,'SRSC folder files request failed',e);}});

app.get('/api/node-file',async(req,res)=>{const id=Number(req.query.nodeId);const folder=getCanonicalAllowedFolder(req.query.folder);const file=req.query.file;const subPath=typeof req.query.subPath==='string'?req.query.subPath:'';if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid Node ID'});if(!folder||!file||typeof file!=='string')return res.status(400).json({error:'Invalid folder or file'});try{const node=await getNodeStorage(id);if(!node)return res.status(404).json({error:'Node not found'});const root=getSafeNodeRoot(node.RootPath,node.FolderPath);const base=root?path.join(root,folder):null;const sub=base&&subPath?isSafeChildPath(base,subPath):base;const full=sub?isSafeChildPath(sub,file):null;if(!full||!fs.existsSync(full)||!fs.statSync(full).isFile())return res.status(404).json({error:'File not found'});const ext=path.extname(full).toLowerCase();res.setHeader('Content-Disposition',`${INLINE_EXTENSIONS.has(ext)?'inline':'attachment'}; filename="${path.basename(full).replace(/"/g,'')}"`);res.sendFile(full);}catch(e){sendServerError(res,'Node file request failed',e);}});

app.listen(PORT,'0.0.0.0',async()=>{console.log(`Server running on http://0.0.0.0:${PORT}`);await testDatabaseConnection();});
