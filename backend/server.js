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
  connectionString:
    'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=dbDrawingManagment;Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  connectionTimeout: 15000,
  requestTimeout: 30000,
  pool: {
    max: 30,
    min: 2,
    idleTimeoutMillis: 30000,
  },
};

const ALLOWED_SRSC_FOLDERS = ['SLD', 'DOC', 'PIC', 'Catalog'];

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
  '.svg', '.tif', '.tiff', '.ico',
]);

const INLINE_EXTENSIONS = new Set(['.pdf', ...IMAGE_EXTENSIONS]);

const NODE_COLUMNS = [
  'NodeID', 'ParentID', 'NodeCode', 'NodeName', 'IsActive',
  'CreatedAt', 'UpdatedAt', 'FolderPath', 'PathID',
  'JET_Position', 'Norme', 'Mass', 'nv',
].join(', ');

let srscStatusCache = null;
let srscStatusComputing = null;
let pdfCache = null;
let pdfCacheComputing = null;

app.use(cors());
app.use(express.json());

// -----------------------------------------------------------------------------
// Utility and path-safety helpers
// -----------------------------------------------------------------------------

function normalizeRelativePath(value) {
  if (value == null) return null;

  const normalized = String(value).trim().replace(/\\/g, '/');

  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return null;
  }

  const parts = normalized.split('/').filter(Boolean);
  if (parts.includes('..')) return null;

  return parts.join(path.sep);
}

function getSafeNodeRoot(rootPath, folderPath) {
  const relative = normalizeRelativePath(folderPath);
  if (!rootPath || !relative) return null;
  return path.resolve(String(rootPath), relative);
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(
    path.resolve(parentPath),
    path.resolve(childPath),
  );

  return (
    relative === '' ||
    (
      Boolean(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative)
    )
  );
}

function getCanonicalAllowedFolder(folderName) {
  return ALLOWED_SRSC_FOLDERS.find(
    (folder) => folder.toLowerCase() === String(folderName).toLowerCase(),
  ) || null;
}

function isSafeChildPath(basePath, relativePath) {
  if (relativePath == null) return null;

  const normalized = String(relativePath).replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);

  if (
    !parts.length ||
    parts.includes('..') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return null;
  }

  const fullPath = path.resolve(basePath, ...parts);
  return isPathInside(basePath, fullPath) ? fullPath : null;
}

function getFileKind(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';

  if (
    ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf']
      .includes(extension)
  ) {
    return 'document';
  }

  if (
    [
      '.dwg', '.dxf', '.dws', '.dwt', '.sldprt', '.sldasm',
      '.slddrw', '.step', '.stp', '.iges', '.igs',
    ].includes(extension)
  ) {
    return 'cad';
  }

  return 'file';
}

function safePart(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim();
}

function sendServerError(res, label, error) {
  console.error(`${label}:`, error);
  res.status(500).json({ error: error.message || String(error) });
}

// -----------------------------------------------------------------------------
// Database and cache initialization
// -----------------------------------------------------------------------------

async function testDatabaseConnection() {
  try {
    const pool = await sql.connect(config);

    console.log('Database: dbDrawingManagment');
    console.log('SQL Server connected successfully');

    try {
      await pool.request().query(`
        IF NOT EXISTS (
          SELECT 1
          FROM sys.indexes
          WHERE name = 'IX_DanieliPDF_NodeID'
            AND object_id = OBJECT_ID('dbo.DanieliPDF')
        )
        CREATE INDEX IX_DanieliPDF_NodeID
          ON dbo.DanieliPDF(NodeID, PDFID);
      `);

      console.log('PDF lookup index verified');
    } catch (error) {
      console.warn('PDF index check skipped:', error.message);
    }

    warmPdfCache();
  } catch (error) {
    console.error('SQL Server connection failed');
    console.error(error);
  }
}

async function warmPdfCache() {
  if (pdfCache) return pdfCache;
  if (pdfCacheComputing) return pdfCacheComputing;

  pdfCacheComputing = sql
    .query(`
      SELECT PDFID, NodeID, NodeCode, PDFName
      FROM dbo.DanieliPDF
      ORDER BY NodeID, PDFID
    `)
    .then((result) => {
      pdfCache = result.recordset || [];
      pdfCacheComputing = null;
      console.log(
        `PDF cache ready: ${pdfCache.length.toLocaleString()} records`,
      );
      return pdfCache;
    })
    .catch((error) => {
      pdfCacheComputing = null;
      console.error('PDF cache warm-up failed:', error.message);
      return [];
    });

  return pdfCacheComputing;
}

// -----------------------------------------------------------------------------
// Node API
// -----------------------------------------------------------------------------

app.get('/api/nodes', async (req, res) => {
  try {
    const hasParentParameter = req.query.parentId !== undefined;
    const rawParentId = req.query.parentId;
    const parentId =
      hasParentParameter && rawParentId !== '' ? Number(rawParentId) : null;

    if (
      hasParentParameter &&
      rawParentId !== '' &&
      (!Number.isInteger(parentId) || parentId <= 0)
    ) {
      return res.status(400).json({ error: 'Invalid Parent ID.' });
    }

    const request = new sql.Request();
    let whereClause = '';

    if (hasParentParameter) {
      if (parentId === null) {
        whereClause = 'WHERE ParentID IS NULL';
      } else {
        request.input('parentId', sql.Int, parentId);
        whereClause = 'WHERE ParentID = @parentId';
      }
    }

    const result = await request.query(`
      SELECT
        ${NODE_COLUMNS},
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM dbo.Nodes AS C
            WHERE C.ParentID = dbo.Nodes.NodeID
          ) THEN 1
          ELSE 0
        END AS HasChildren
      FROM dbo.Nodes
      ${whereClause}
      ORDER BY NodeID;
    `);

    res.json(result.recordset);
  } catch (error) {
    sendServerError(res, 'Nodes query failed', error);
  }
});

app.get('/api/nodes/search', async (req, res) => {
  const text = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (!text) {
    return res.json({
      matches: [],
      ancestorIds: [],
      matchIds: [],
      visibleNodes: [],
    });
  }

  try {
    const request = new sql.Request();
    request.input('q', sql.NVarChar(255), `%${text}%`);

    const matchResult = await request.query(`
      SELECT ${NODE_COLUMNS}
      FROM dbo.Nodes
      WHERE NodeCode LIKE @q
         OR NodeName LIKE @q
      ORDER BY NodeID;
    `);

    const allResult = await sql.query(`
      SELECT
        ${NODE_COLUMNS},
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM dbo.Nodes AS C
            WHERE C.ParentID = dbo.Nodes.NodeID
          ) THEN 1
          ELSE 0
        END AS HasChildren
      FROM dbo.Nodes
      ORDER BY NodeID;
    `);

    const allNodes = allResult.recordset;
    const nodeMap = new Map(
      allNodes.map((node) => [Number(node.NodeID), node]),
    );

    const ancestors = new Set();

    for (const match of matchResult.recordset) {
      let currentId = Number(match.NodeID);
      const seen = new Set();

      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        const parentId = nodeMap.get(currentId)?.ParentID;

        if (parentId == null) break;

        ancestors.add(Number(parentId));
        currentId = Number(parentId);
      }
    }

    const visibleIds = new Set(
      matchResult.recordset.map((node) => Number(node.NodeID)),
    );

    ancestors.forEach((id) => visibleIds.add(id));

    for (const node of allNodes) {
      if (node.ParentID != null) continue;

      for (const id of visibleIds) {
        let currentId = id;

        while (
          currentId &&
          nodeMap.get(currentId)?.ParentID != null
        ) {
          currentId = Number(nodeMap.get(currentId).ParentID);

          if (currentId === Number(node.NodeID)) {
            visibleIds.add(Number(node.NodeID));
            break;
          }
        }
      }
    }

    res.json({
      matches: matchResult.recordset,
      ancestorIds: [...ancestors],
      matchIds: matchResult.recordset.map((node) => Number(node.NodeID)),
      visibleNodes: allNodes.filter((node) =>
        visibleIds.has(Number(node.NodeID)),
      ),
    });
  } catch (error) {
    sendServerError(res, 'Node search failed', error);
  }
});

app.post('/api/nodes', async (req, res) => {
  const code =
    typeof req.body?.NodeCode === 'string' ? req.body.NodeCode.trim() : '';
  const name =
    typeof req.body?.NodeName === 'string' ? req.body.NodeName.trim() : '';
  const parentId = Number(req.body?.ParentID);

  if (!code || !name) {
    return res.status(400).json({
      error: 'Node Code and Node Name are required.',
    });
  }

  if (!Number.isInteger(parentId) || parentId <= 0) {
    return res.status(400).json({
      error: 'A valid parent Node is required.',
    });
  }

  try {
    const pool = await sql.connect(config);
    const transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const parentRequest = new sql.Request(transaction);
      parentRequest.input('parentId', sql.Int, parentId);

      const parentResult = await parentRequest.query(`
        SELECT TOP 1 NodeID, FolderPath, PathID
        FROM dbo.Nodes WITH (UPDLOCK, HOLDLOCK)
        WHERE NodeID = @parentId;
      `);

      if (!parentResult.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Parent Node not found.' });
      }

      const parent = parentResult.recordset[0];
      const parentFolder = parent.FolderPath
        ? String(parent.FolderPath).trim()
        : '';
      const childFolder = `${safePart(code)} -${safePart(name)}`;
      const folderPath = parentFolder
        ? `${parentFolder}\\${childFolder}`
        : childFolder;

      const identityResult = await new sql.Request(transaction).query(`
        SELECT COLUMNPROPERTY(
          OBJECT_ID('dbo.Nodes'),
          'NodeID',
          'IsIdentity'
        ) AS IsIdentity;
      `);

      const isIdentity =
        Number(identityResult.recordset[0]?.IsIdentity) === 1;
      let insertResult;

      if (isIdentity) {
        const request = new sql.Request(transaction);
        request.input('parentId', sql.Int, parentId);
        request.input('code', sql.NVarChar(100), code);
        request.input('name', sql.NVarChar(255), name);
        request.input('folderPath', sql.NVarChar(sql.MAX), folderPath);
        request.input('pathId', sql.Int, parent.PathID ?? null);

        insertResult = await request.query(`
          INSERT INTO dbo.Nodes (
            ParentID, NodeCode, NodeName, IsActive,
            CreatedAt, UpdatedAt, FolderPath, PathID
          )
          OUTPUT INSERTED.*
          VALUES (
            @parentId, @code, @name, 1,
            SYSUTCDATETIME(), SYSUTCDATETIME(),
            @folderPath, @pathId
          );
        `);
      } else {
        const idResult = await new sql.Request(transaction).query(`
          SELECT ISNULL(MAX(NodeID), 0) + 1 AS NodeID
          FROM dbo.Nodes WITH (UPDLOCK, HOLDLOCK);
        `);

        const nodeId = Number(idResult.recordset[0].NodeID);
        const request = new sql.Request(transaction);

        request.input('nodeId', sql.Int, nodeId);
        request.input('parentId', sql.Int, parentId);
        request.input('code', sql.NVarChar(100), code);
        request.input('name', sql.NVarChar(255), name);
        request.input('folderPath', sql.NVarChar(sql.MAX), folderPath);
        request.input('pathId', sql.Int, parent.PathID ?? null);

        insertResult = await request.query(`
          INSERT INTO dbo.Nodes (
            NodeID, ParentID, NodeCode, NodeName, IsActive,
            CreatedAt, UpdatedAt, FolderPath, PathID
          )
          OUTPUT INSERTED.*
          VALUES (
            @nodeId, @parentId, @code, @name, 1,
            SYSUTCDATETIME(), SYSUTCDATETIME(),
            @folderPath, @pathId
          );
        `);
      }

      await transaction.commit();
      srscStatusCache = null;

      res.status(201).json({
        success: true,
        node: insertResult.recordset[0],
      });
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (_) {
        // The transaction may already have been rolled back.
      }
      throw error;
    }
  } catch (error) {
    sendServerError(res, 'Node creation failed', error);
  }
});

app.put('/api/nodes/:nodeId', async (req, res) => {
  const id = Number(req.params.nodeId);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid Node ID.' });
  }

  const code =
    typeof req.body?.NodeCode === 'string' ? req.body.NodeCode.trim() : '';
  const name =
    typeof req.body?.NodeName === 'string' ? req.body.NodeName.trim() : '';

  if (!code || !name) {
    return res.status(400).json({
      error: 'Node Code and Node Name are required.',
    });
  }

  try {
    const request = new sql.Request();

    request.input('id', sql.Int, id);
    request.input('code', sql.NVarChar(100), code);
    request.input('name', sql.NVarChar(255), name);
    request.input(
      'jet',
      sql.NVarChar(255),
      req.body?.JET_Position == null
        ? null
        : String(req.body.JET_Position).trim(),
    );
    request.input(
      'norme',
      sql.NVarChar(255),
      req.body?.Norme == null ? null : String(req.body.Norme).trim(),
    );
    request.input(
      'mass',
      sql.NVarChar(255),
      req.body?.Mass == null || req.body.Mass === ''
        ? null
        : String(req.body.Mass).trim(),
    );
    request.input(
      'nv',
      sql.NVarChar(255),
      req.body?.nv == null ? null : String(req.body.nv).trim(),
    );
    request.input(
      'active',
      sql.Bit,
      req.body?.IsActive === true || Number(req.body?.IsActive) === 1
        ? 1
        : 0,
    );

    const result = await request.query(`
      UPDATE dbo.Nodes
      SET
        NodeCode = @code,
        NodeName = @name,
        JET_Position = @jet,
        Norme = @norme,
        Mass = @mass,
        nv = @nv,
        IsActive = @active,
        UpdatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE NodeID = @id;
    `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Node not found.' });
    }

    srscStatusCache = null;

    res.json({
      success: true,
      node: result.recordset[0],
    });
  } catch (error) {
    sendServerError(res, 'Node update failed', error);
  }
});

app.delete('/api/nodes/:nodeId', async (req, res) => {
  const id = Number(req.params.nodeId);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid Node ID.' });
  }

  try {
    const pool = await sql.connect(config);
    const request = pool.request();
    request.input('id', sql.Int, id);

    const nodeResult = await request.query(`
      SELECT TOP 1 NodeID
      FROM dbo.Nodes
      WHERE NodeID = @id;
    `);

    if (!nodeResult.recordset.length) {
      return res.status(404).json({ error: 'Node not found.' });
    }

    const childResult = await request.query(`
      SELECT TOP 1 NodeID
      FROM dbo.Nodes
      WHERE ParentID = @id;
    `);

    if (childResult.recordset.length) {
      return res.status(409).json({
        error:
          'This Node has child Nodes. Delete or move the child Nodes first.',
      });
    }

    const pdfResult = await request.query(`
      SELECT TOP 1 PDFID
      FROM dbo.DanieliPDF
      WHERE NodeID = @id;
    `);

    if (pdfResult.recordset.length) {
      return res.status(409).json({
        error:
          'This Node has registered PDF files. Remove the PDF records first.',
      });
    }

    await request.query(`
      DELETE FROM dbo.Nodes
      WHERE NodeID = @id;
    `);

    srscStatusCache = null;

    res.json({
      success: true,
      deleted: true,
      nodeId: id,
    });
  } catch (error) {
    console.error('Node deletion failed:', error);

    if (error.number === 547) {
      return res.status(409).json({
        error:
          'This Node is referenced by another database record and cannot be deleted.',
      });
    }

    res.status(500).json({ error: error.message || String(error) });
  }
});

// -----------------------------------------------------------------------------
// PDF API
// -----------------------------------------------------------------------------

app.get('/api/pdfs', async (req, res) => {
  try {
    let nodeIds = null;

    if (req.query.nodeIds !== undefined) {
      nodeIds = String(req.query.nodeIds)
        .split(',')
        .map(Number)
        .filter(Number.isInteger);
    } else if (req.query.nodeId !== undefined) {
      nodeIds = [Number(req.query.nodeId)];
    }

    if (nodeIds && nodeIds.some((id) => id <= 0)) {
      return res.status(400).json({ error: 'Invalid Node ID.' });
    }

    const data = pdfCache || (await warmPdfCache());

    if (!nodeIds) return res.json(data);

    const wanted = new Set(nodeIds);
    res.json(data.filter((item) => wanted.has(Number(item.NodeID))));
  } catch (error) {
    sendServerError(res, 'PDF query failed', error);
  }
});

app.get('/api/pdf-open/:pdfId', async (req, res) => {
  const id = Number(req.params.pdfId);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid PDF ID' });
  }

  try {
    const request = new sql.Request();
    request.input('id', sql.Int, id);

    const result = await request.query(`
      SELECT d.PDFName, p.RootPath
      FROM dbo.DanieliPDF AS d
      JOIN dbo.tblPath AS p ON d.PathID = p.PathID
      WHERE d.PDFID = @id;
    `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'PDF record not found' });
    }

    const { PDFName, RootPath } = result.recordset[0];
    const fullPath = isSafeChildPath(RootPath, PDFName);

    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'PDF file not found on disk' });
    }

    await execAsync(`start "" "${fullPath.replace(/"/g, '')}"`, {
      windowsHide: true,
    });

    res.json({ success: true });
  } catch (error) {
    sendServerError(res, 'PDF open failed', error);
  }
});

app.get('/api/pdf-file/:pdfId', async (req, res) => {
  const id = Number(req.params.pdfId);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid PDF ID' });
  }

  try {
    const request = new sql.Request();
    request.input('id', sql.Int, id);

    const result = await request.query(`
      SELECT d.PDFName, p.RootPath
      FROM dbo.DanieliPDF AS d
      JOIN dbo.tblPath AS p ON d.PathID = p.PathID
      WHERE d.PDFID = @id;
    `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: 'PDF record not found' });
    }

    const { PDFName, RootPath } = result.recordset[0];
    const fullPath = isSafeChildPath(RootPath, PDFName);

    if (!fullPath || !fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'PDF file not found on disk' });
    }

    res.sendFile(fullPath);
  } catch (error) {
    sendServerError(res, 'PDF file request failed', error);
  }
});

// -----------------------------------------------------------------------------
// SRSC storage API
// -----------------------------------------------------------------------------

async function computeSrscStatus() {
  const result = await sql.query(`
    SELECT
      N.NodeID,
      N.FolderPath,
      N.PathID,
      P.RootPath
    FROM dbo.Nodes AS N
    LEFT JOIN dbo.tblPath AS P ON N.PathID = P.PathID
    WHERE N.FolderPath IS NOT NULL
      AND LTRIM(RTRIM(N.FolderPath)) <> '';
  `);

  const nodeIds = [];

  for (const row of result.recordset) {
    const root = getSafeNodeRoot(row.RootPath, row.FolderPath);
    if (!root) continue;

    try {
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue;

      const hasAllowedFolder = ALLOWED_SRSC_FOLDERS.some((folder) => {
        try {
          const folderPath = path.join(root, folder);
          return (
            fs.existsSync(folderPath) &&
            fs.statSync(folderPath).isDirectory()
          );
        } catch (_) {
          return false;
        }
      });

      if (hasAllowedFolder) nodeIds.push(Number(row.NodeID));
    } catch (_) {
      // Ignore inaccessible folders during the status scan.
    }
  }

  return nodeIds;
}

async function getSrscStatus(force = false) {
  if (!force && srscStatusCache) return srscStatusCache;
  if (srscStatusComputing) return srscStatusComputing;

  srscStatusComputing = computeSrscStatus()
    .then((nodeIds) => {
      srscStatusCache = nodeIds;
      srscStatusComputing = null;
      return nodeIds;
    })
    .catch((error) => {
      srscStatusComputing = null;
      throw error;
    });

  return srscStatusComputing;
}

app.get('/api/srsc-status', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === '1';

    if (!forceRefresh && !srscStatusCache) {
      getSrscStatus(false).catch((error) => {
        console.error('SRSC background scan failed:', error.message);
      });

      return res.json({
        nodeIds: [],
        count: 0,
        pending: true,
      });
    }

    const nodeIds = await getSrscStatus(forceRefresh);

    res.json({
      nodeIds,
      count: nodeIds.length,
      pending: false,
    });
  } catch (error) {
    sendServerError(res, 'SRSC status failed', error);
  }
});

async function getNodeStorage(id) {
  const request = new sql.Request();
  request.input('id', sql.Int, id);

  const result = await request.query(`
    SELECT TOP 1
      N.NodeID,
      N.NodeCode,
      N.FolderPath,
      N.PathID,
      P.RootPath
    FROM dbo.Nodes AS N
    LEFT JOIN dbo.tblPath AS P ON N.PathID = P.PathID
    WHERE N.NodeID = @id;
  `);

  return result.recordset[0] || null;
}

app.get('/api/node-folders/:nodeId', async (req, res) => {
  const id = Number(req.params.nodeId);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid Node ID' });
  }

  try {
    const node = await getNodeStorage(id);

    if (!node) return res.status(404).json({ error: 'Node not found' });

    const root = getSafeNodeRoot(node.RootPath, node.FolderPath);

    if (!root) {
      return res.json({
        nodeId: id,
        nodeCode: node.NodeCode,
        hasFolderPath: false,
        folders: [],
      });
    }

    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return res.json({
        nodeId: id,
        nodeCode: node.NodeCode,
        hasFolderPath: true,
        folderExists: false,
        folders: [],
      });
    }

    const folders = ALLOWED_SRSC_FOLDERS
      .map((name) => {
        const folderPath = path.join(root, name);

        try {
          return {
            name,
            exists:
              fs.existsSync(folderPath) &&
              fs.statSync(folderPath).isDirectory(),
          };
        } catch (_) {
          return { name, exists: false };
        }
      })
      .filter((folder) => folder.exists);

    res.json({
      nodeId: id,
      nodeCode: node.NodeCode,
      hasFolderPath: true,
      folderExists: true,
      folders,
    });
  } catch (error) {
    sendServerError(res, 'Node folders request failed', error);
  }
});

app.get('/api/node-folder-files/:nodeId/:folderName', async (req, res) => {
  const id = Number(req.params.nodeId);
  const folder = getCanonicalAllowedFolder(req.params.folderName);
  const subPath =
    typeof req.query.subPath === 'string' ? req.query.subPath : '';

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid Node ID' });
  }

  if (!folder) {
    return res.status(400).json({ error: 'Folder is not allowed' });
  }

  try {
    const node = await getNodeStorage(id);

    if (!node) return res.status(404).json({ error: 'Node not found' });

    const root = getSafeNodeRoot(node.RootPath, node.FolderPath);
    const target = root ? path.join(root, folder) : null;

    if (
      !root ||
      !target ||
      !isPathInside(root, target) ||
      !fs.existsSync(target) ||
      !fs.statSync(target).isDirectory()
    ) {
      return res.status(404).json({ error: 'SRSC folder not found' });
    }

    let browsePath = target;

    if (subPath) {
      const safeSubPath = isSafeChildPath(target, subPath);

      if (
        !safeSubPath ||
        !fs.existsSync(safeSubPath) ||
        !fs.statSync(safeSubPath).isDirectory()
      ) {
        return res.status(404).json({ error: 'Subfolder not found' });
      }

      browsePath = safeSubPath;
    }

    const items = [];

    for (const entry of fs.readdirSync(browsePath, { withFileTypes: true })) {
      if (entry.name.startsWith('~$')) continue;

      const itemPath = path.join(browsePath, entry.name);

      try {
        const stat = fs.statSync(itemPath);

        if (entry.isDirectory()) {
          items.push({
            name: entry.name,
            type: 'folder',
            kind: 'folder',
          });
        } else if (entry.isFile()) {
          items.push({
            name: entry.name,
            type: 'file',
            kind: getFileKind(entry.name),
            extension: path.extname(entry.name).toLowerCase(),
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          });
        }
      } catch (_) {
        // Ignore files that disappear or become inaccessible while scanning.
      }
    }

    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;

      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    res.json({
      nodeId: id,
      nodeCode: node.NodeCode,
      folder,
      subPath,
      items,
    });
  } catch (error) {
    sendServerError(res, 'SRSC folder files request failed', error);
  }
});

app.get('/api/node-file', async (req, res) => {
  const id = Number(req.query.nodeId);
  const folder = getCanonicalAllowedFolder(req.query.folder);
  const file = req.query.file;
  const subPath = typeof req.query.subPath === 'string'
    ? req.query.subPath
    : '';

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid Node ID' });
  }

  if (!folder || !file || typeof file !== 'string') {
    return res.status(400).json({ error: 'Invalid folder or file' });
  }

  try {
    const node = await getNodeStorage(id);

    if (!node) return res.status(404).json({ error: 'Node not found' });

    const root = getSafeNodeRoot(node.RootPath, node.FolderPath);
    const basePath = root ? path.join(root, folder) : null;
    const subFolderPath = basePath && subPath
      ? isSafeChildPath(basePath, subPath)
      : basePath;
    const fullPath = subFolderPath
      ? isSafeChildPath(subFolderPath, file)
      : null;

    if (
      !fullPath ||
      !fs.existsSync(fullPath) ||
      !fs.statSync(fullPath).isFile()
    ) {
      return res.status(404).json({ error: 'File not found' });
    }

    const extension = path.extname(fullPath).toLowerCase();
    const disposition = INLINE_EXTENSIONS.has(extension)
      ? 'inline'
      : 'attachment';
    const safeName = path.basename(fullPath).replace(/"/g, '');

    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeName}"`,
    );

    res.sendFile(fullPath);
  } catch (error) {
    sendServerError(res, 'Node file request failed', error);
  }
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  await testDatabaseConnection();
});
