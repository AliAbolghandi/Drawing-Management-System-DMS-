const express = require('express');
const sql = require('mssql/msnodesqlv8');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const util = require('util');
const execAsync = util.promisify(require('child_process').exec);

const app = express();

// ========================================
// Server Configuration
// ========================================

const HOST = '0.0.0.0';
const PORT = 80;
const FRONTEND_PATH = path.join(__dirname, '..', 'frontend');

app.use(cors());
app.use(express.json());

// Serve the frontend from this Node.js server.
// Users on the LAN only need a browser.
app.use(express.static(FRONTEND_PATH));

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

console.log('========================================');
console.log('Drawing Management System');
console.log('========================================');
console.log('WEB      : http://172.30.101.14/');
console.log('BIND     : 0.0.0.0');
console.log('PORT     : 80');
console.log('DATABASE : dbDrawingManagment');
console.log('AUTH     : Windows Authentication');
console.log('DRIVER   : ODBC Driver 17 for SQL Server');
console.log('FRONTEND :', FRONTEND_PATH);
console.log('========================================');

// ========================================
// Test Database Connection
// ========================================

async function testDatabaseConnection() {
    try {
        await sql.connect(config);
        console.log('✅ SQL Server connected successfully');
        console.log('✅ Database:', 'dbDrawingManagment');
    } catch (err) {
        console.error('❌ SQL Server connection failed');
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

        console.log(`✅ Nodes loaded: ${result.recordset.length}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ Nodes query failed:');
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

        console.log(`✅ PDFs loaded: ${result.recordset.length}`);
        res.json(result.recordset);
    } catch (err) {
        console.error('❌ PDFs query failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// API - Serve PDF to the requesting browser
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
            return res.status(404).json({
                error: 'PDF record not found (or its PathID has no matching row in tblPath)'
            });
        }

        const { PDFName: pdfName, RootPath: rootPath } = pdfResult.recordset[0];
        const fullPath = path.join(rootPath, pdfName);

        if (!fs.existsSync(fullPath)) {
            console.error('❌ PDF file not found on disk:', fullPath);
            return res.status(404).json({
                error: 'PDF file not found on disk',
                path: fullPath
            });
        }

        // This sends the PDF to the user's browser.
        // It does NOT open the PDF on the server PC.
        res.sendFile(fullPath);
    } catch (err) {
        console.error('❌ PDF file request failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// Legacy API - Open PDF on the server PC
// Kept for local/same-PC compatibility.
// Remote users should use /api/pdf-file/:pdfId.
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
            return res.status(404).json({
                error: 'PDF record not found (or its PathID has no matching row in tblPath)'
            });
        }

        const { PDFName: pdfName, RootPath: rootPath } = pdfResult.recordset[0];
        const fullPath = path.join(rootPath, pdfName);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({
                error: 'PDF file not found on disk',
                path: fullPath
            });
        }

        await execAsync(`start "" "${fullPath}"`);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ PDF open request failed:');
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// Root page
// ========================================

app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_PATH, 'index.html'));
});

// ========================================
// Start Server
// ========================================

app.listen(PORT, HOST, async () => {
    console.log(`🚀 DMS server running on http://172.30.101.14/`);
    console.log('🌐 LAN access enabled');
    await testDatabaseConnection();
});
