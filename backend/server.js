const express = require('express');
const sql = require('mssql/msnodesqlv8');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

const app = express();

app.use(cors());
app.use(express.json());

// ========================================
// SQL Server Configuration
// Windows Authentication
// ========================================

const config = {
    connectionString:
        'Driver={ODBC Driver 17 for SQL Server};' +
        'Server=localhost;' +
        'Database=dbDrawingManagment;' +
        'Trusted_Connection=Yes;' +
        'TrustServerCertificate=Yes;'
};

// ========================================
// SRSC Company Folder Configuration
// ========================================

// Only these four folders are exposed at the Node level.
// Other folders inside a Node folder are intentionally hidden.
const ALLOWED_SRSC_FOLDERS = ['SLD', 'DOC', 'PIC', 'Catalog'];

const IMAGE_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tif', '.tiff', '.ico'
]);

const INLINE_EXTENSIONS = new Set([
    '.pdf', ...IMAGE_EXTENSIONS
]);

function normalizeRelativePath(value) {
    if (value === null || value === undefined) return null;

    const normalized = String(value).trim().replace(/\\/g, '/');

    if (!normalized) return null;

    // FolderPath must be relative. Absolute paths and traversal are rejected.
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
        return null;
    }

    const parts = normalized.split('/').filter(Boolean);
    if (parts.includes('..')) return null;

    return parts.join(path.sep);
}

function getSafeNodeRoot(rootPath, folderPath) {
    if (!rootPath || !folderPath) return null;

    const relativeFolder = normalizeRelativePath(folderPath);
    if (!relativeFolder) return null;

    return path.resolve(String(rootPath), relativeFolder);
}

function isPathInside(parentPath, childPath) {
    const parent = path.resolve(parentPath);
    const child = path.resolve(childPath);
    const relative = path.relative(parent, child);
    return relative === '' || (relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function isAllowedFolder(folderName) {
    return ALLOWED_SRSC_FOLDERS.some(name => name.toLowerCase() === String(folderName).toLowerCase());
}

function getCanonicalAllowedFolder(folderName) {
    return ALLOWED_SRSC_FOLDERS.find(name => name.toLowerCase() === String(folderName).toLowerCase()) || null;
}

function isSafeChildPath(basePath, requestedRelativePath) {
    if (requestedRelativePath === null || requestedRelativePath === undefined) return null;

    const normalized = String(requestedRelativePath).replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);

    if (!parts.length || parts.includes('..')) return null;
    if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) return null;

    const fullPath = path.resolve(basePath, ...parts);
    return isPathInside(basePath, fullPath) ? fullPath : null;
}

function getFileKind(fileName) {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.pdf') return 'pdf';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.rtf'].includes(ext)) return 'document';
    if (['.dwg', '.dxf', '.dws', '.dwt', '.sldprt', '.sldasm', '.slddrw', '.step', '.stp', '.iges', '.igs'].includes(ext)) return 'cad';

    return 'file';
}

// ========================================
// Display Configuration
// ========================================

console.log('========================================');
console.log('SQL Server Configuration');
console.log('========================================');
console.log('SERVER   : localhost');
console.log('DATABASE : dbDrawingManagment');
console.log('AUTH     : Windows Authentication');
console.log('DRIVER   : ODBC Driver 17 for SQL Server');
console.log('========================================');

// ========================================
// Test Database Connection
// ========================================

async function testDatabaseConnection() {
    try {
        await sql.connect(config);
        console.log('Database: dbDrawingManagment');
        console.log('SQL Server connected successfully');
    } catch (err) {
        console.error('SQL Server connection failed');
        console.error(err);
    }
}

// ========================================
// API - Get All Nodes
// ========================================

app.get('/api/nodes', async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT *
            FROM dbo.Nodes
            ORDER BY NodeID
        `);

        console.log(`Nodes loaded: ${result.recordset.length}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('Nodes query failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// API - Get All PDFs
// ========================================

app.get('/api/pdfs', async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT
                PDFID,
                NodeID,
                NodeCode,
                PDFName
            FROM dbo.DanieliPDF
            ORDER BY NodeID, PDFID
        `);

        console.log(`PDFs loaded: ${result.recordset.length}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('PDFs query failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// API - Get SRSC Folders For A Node
// ========================================

app.get('/api/node-folders/:nodeId', async (req, res) => {
    const nodeId = Number(req.params.nodeId);

    if (!Number.isInteger(nodeId) || nodeId <= 0) {
        return res.status(400).json({ error: 'Invalid Node ID' });
    }

    try {
        const request = new sql.Request();
        request.input('nodeId', sql.Int, nodeId);

        const result = await request.query(`
            SELECT TOP 1
                N.NodeID,
                N.NodeCode,
                N.FolderPath,
                N.PathID,
                P.SourceName,
                P.RootPath
            FROM dbo.Nodes N
            LEFT JOIN dbo.tblPath P
                ON N.PathID = P.PathID
            WHERE N.NodeID = @nodeId
        `);

        if (!result.recordset.length) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const node = result.recordset[0];
        const nodeRoot = getSafeNodeRoot(node.RootPath, node.FolderPath);

        if (!nodeRoot) {
            return res.json({
                nodeId,
                nodeCode: node.NodeCode,
                hasFolderPath: false,
                folders: []
            });
        }

        if (!fs.existsSync(nodeRoot) || !fs.statSync(nodeRoot).isDirectory()) {
            return res.json({
                nodeId,
                nodeCode: node.NodeCode,
                hasFolderPath: true,
                folderExists: false,
                folders: []
            });
        }

        const folders = ALLOWED_SRSC_FOLDERS.map(name => {
            const fullPath = path.join(nodeRoot, name);
            let exists = false;

            try {
                exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
            } catch (_) {
                exists = false;
            }

            return {
                name,
                exists
            };
        }).filter(folder => folder.exists);

        res.json({
            nodeId,
            nodeCode: node.NodeCode,
            hasFolderPath: true,
            folderExists: true,
            folders
        });
    } catch (err) {
        console.error('SRSC folder query failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// API - Get Contents Of One Allowed SRSC Folder
// ========================================

app.get('/api/node-folder-files/:nodeId/:folderName', async (req, res) => {
    const nodeId = Number(req.params.nodeId);
    const folderName = getCanonicalAllowedFolder(req.params.folderName);
    const subPath = typeof req.query.subPath === 'string' ? req.query.subPath : '';

    if (!Number.isInteger(nodeId) || nodeId <= 0) {
        return res.status(400).json({ error: 'Invalid Node ID' });
    }

    if (!folderName) {
        return res.status(400).json({ error: 'Folder is not allowed' });
    }

    try {
        const request = new sql.Request();
        request.input('nodeId', sql.Int, nodeId);

        const result = await request.query(`
            SELECT TOP 1
                N.NodeID,
                N.NodeCode,
                N.FolderPath,
                N.PathID,
                P.SourceName,
                P.RootPath
            FROM dbo.Nodes N
            LEFT JOIN dbo.tblPath P
                ON N.PathID = P.PathID
            WHERE N.NodeID = @nodeId
        `);

        if (!result.recordset.length) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const node = result.recordset[0];
        const nodeRoot = getSafeNodeRoot(node.RootPath, node.FolderPath);

        if (!nodeRoot) {
            return res.status(404).json({ error: 'No valid FolderPath is configured for this Node' });
        }

        const targetFolder = path.join(nodeRoot, folderName);

        if (!isPathInside(nodeRoot, targetFolder) || !fs.existsSync(targetFolder) || !fs.statSync(targetFolder).isDirectory()) {
            return res.status(404).json({ error: 'SRSC folder not found' });
        }

        // Resolve an optional nested subPath *inside* the allowed top-level folder.
        // isSafeChildPath already rejects '..' segments and absolute paths, so
        // browsing stays confined to targetFolder no matter how deep the user goes.
        let browseFolder = targetFolder;

        if (subPath) {
            const resolvedSubFolder = isSafeChildPath(targetFolder, subPath);

            if (!resolvedSubFolder || !fs.existsSync(resolvedSubFolder) || !fs.statSync(resolvedSubFolder).isDirectory()) {
                return res.status(404).json({ error: 'Subfolder not found' });
            }

            browseFolder = resolvedSubFolder;
        }

        const entries = fs.readdirSync(browseFolder, { withFileTypes: true });
        const items = [];

        for (const entry of entries) {
            if (entry.name.startsWith('~$')) continue;

            const fullPath = path.join(browseFolder, entry.name);

            try {
                const stat = fs.statSync(fullPath);

                if (entry.isDirectory()) {
                    items.push({
                        name: entry.name,
                        type: 'folder',
                        kind: 'folder'
                    });
                } else if (entry.isFile()) {
                    items.push({
                        name: entry.name,
                        type: 'file',
                        kind: getFileKind(entry.name),
                        extension: path.extname(entry.name).toLowerCase(),
                        size: stat.size,
                        modifiedAt: stat.mtime.toISOString()
                    });
                }
            } catch (_) {
                // Ignore files that cannot be inspected.
            }
        }

        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        res.json({
            nodeId,
            nodeCode: node.NodeCode,
            folder: folderName,
            subPath,
            items
        });
    } catch (err) {
        console.error('SRSC folder contents query failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// API - Serve / Download A File From SRSC Folder
// ========================================

app.get('/api/node-file', async (req, res) => {
    const nodeId = Number(req.query.nodeId);
    const folderName = getCanonicalAllowedFolder(req.query.folder);
    const requestedFile = req.query.file;

    if (!Number.isInteger(nodeId) || nodeId <= 0) {
        return res.status(400).json({ error: 'Invalid Node ID' });
    }

    if (!folderName) {
        return res.status(400).json({ error: 'Folder is not allowed' });
    }

    if (!requestedFile || typeof requestedFile !== 'string') {
        return res.status(400).json({ error: 'File name is required' });
    }

    try {
        const request = new sql.Request();
        request.input('nodeId', sql.Int, nodeId);

        const result = await request.query(`
            SELECT TOP 1
                N.NodeID,
                N.NodeCode,
                N.FolderPath,
                N.PathID,
                P.RootPath
            FROM dbo.Nodes N
            LEFT JOIN dbo.tblPath P
                ON N.PathID = P.PathID
            WHERE N.NodeID = @nodeId
        `);

        if (!result.recordset.length) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const node = result.recordset[0];
        const nodeRoot = getSafeNodeRoot(node.RootPath, node.FolderPath);

        if (!nodeRoot) {
            return res.status(404).json({ error: 'No valid FolderPath is configured for this Node' });
        }

        const targetFolder = path.join(nodeRoot, folderName);
        if (!fs.existsSync(targetFolder) || !fs.statSync(targetFolder).isDirectory()) {
            return res.status(404).json({ error: 'SRSC folder not found' });
        }

        const fullPath = isSafeChildPath(targetFolder, requestedFile);
        if (!fullPath || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
            return res.status(404).json({ error: 'File not found' });
        }

        const ext = path.extname(fullPath).toLowerCase();

        if (INLINE_EXTENSIONS.has(ext)) {
            res.setHeader('Content-Disposition', `inline; filename="${path.basename(fullPath).replace(/"/g, '')}"`);
        } else {
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fullPath).replace(/"/g, '')}"`);
        }

        res.sendFile(fullPath);
    } catch (err) {
        console.error('SRSC file request failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// API - Open A PDF With The OS Default App
// ========================================

app.get('/api/pdf-open/:pdfId', async (req, res) => {
    const pdfId = Number(req.params.pdfId);

    if (!Number.isInteger(pdfId) || pdfId <= 0) {
        return res.status(400).json({ error: 'Invalid PDF ID' });
    }

    try {
        const pdfRequest = new sql.Request();
        pdfRequest.input('pdfId', sql.Int, pdfId);

        const pdfResult = await pdfRequest.query(`
            SELECT
                d.PDFName,
                p.RootPath
            FROM dbo.DanieliPDF d
            JOIN dbo.tblPath p
                ON d.PathID = p.PathID
            WHERE d.PDFID = @pdfId
        `);

        if (pdfResult.recordset.length === 0) {
            return res.status(404).json({ error: 'PDF record not found (or its PathID has no matching row in tblPath)' });
        }

        const { PDFName: pdfName, RootPath: rootPath } = pdfResult.recordset[0];
        const fullPath = path.join(rootPath, pdfName);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'PDF file not found on disk', path: fullPath });
        }

        await execAsync(`start "" "${fullPath}"`);
        res.json({ success: true });
    } catch (err) {
        console.error('PDF open request failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// API - Serve A Single Registered PDF File
// ========================================

app.get('/api/pdf-file/:pdfId', async (req, res) => {
    const pdfId = Number(req.params.pdfId);

    if (!Number.isInteger(pdfId) || pdfId <= 0) {
        return res.status(400).json({ error: 'Invalid PDF ID' });
    }

    try {
        const pdfRequest = new sql.Request();
        pdfRequest.input('pdfId', sql.Int, pdfId);

        const pdfResult = await pdfRequest.query(`
            SELECT
                d.PDFName,
                p.RootPath
            FROM dbo.DanieliPDF d
            JOIN dbo.tblPath p
                ON d.PathID = p.PathID
            WHERE d.PDFID = @pdfId
        `);

        if (pdfResult.recordset.length === 0) {
            return res.status(404).json({ error: 'PDF record not found' });
        }

        const { PDFName: pdfName, RootPath: rootPath } = pdfResult.recordset[0];
        const fullPath = path.join(rootPath, pdfName);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'PDF file not found on disk', path: fullPath });
        }

        res.sendFile(fullPath);
    } catch (err) {
        console.error('PDF file request failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// Start Server
// ========================================

app.listen(3000, '0.0.0.0', async () => {
    console.log('Server running on http://0.0.0.0:3000');
    await testDatabaseConnection();
});
