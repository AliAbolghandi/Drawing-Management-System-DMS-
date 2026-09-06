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

        console.log('✅ Database:', 'dbDrawingManagment');
        console.log('✅ SQL Server connected successfully');

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

        res.status(500).json({
            error: err.message
        });

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

        res.status(500).json({
            error: err.message
        });

    }

});

// ========================================
// API - Open/Serve A Single PDF File
// ========================================

app.get('/api/pdf-file/:pdfId', async (req, res) => {

    const pdfId = Number(req.params.pdfId);

    if (!Number.isInteger(pdfId) || pdfId <= 0) {

        return res.status(400).json({
            error: 'Invalid PDF ID'
        });

    }

    try {

        // ------------------------------------------
        // 1) Get The PDF File Name + Its RootPath
        //    (PathID now comes from the record itself)
        // ------------------------------------------

        const pdfRequest =
            new sql.Request();

        pdfRequest.input(
            'pdfId',
            sql.Int,
            pdfId
        );

        const pdfResult =
            await pdfRequest.query(`
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

        const { PDFName: pdfName, RootPath: rootPath } =
            pdfResult.recordset[0];


        // ------------------------------------------
        // 2) Build Full Path And Serve The File
        // ------------------------------------------

        const fullPath =
            path.join(
                rootPath,
                pdfName
            );

        if (!fs.existsSync(fullPath)) {

            console.error(
                '❌ PDF file not found on disk:',
                fullPath
            );

            return res.status(404).json({
                error: 'PDF file not found on disk',
                path: fullPath
            });

        }

        res.sendFile(fullPath);

    } catch (err) {

        console.error('❌ PDF file request failed:');
        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});

// ========================================
// API - Open A PDF With The OS Default App
// (Opens the file on the machine running this
// server — intended for local, same-PC use.)
// ========================================

app.get('/api/pdf-open/:pdfId', async (req, res) => {

    const pdfId = Number(req.params.pdfId);

    if (!Number.isInteger(pdfId) || pdfId <= 0) {

        return res.status(400).json({
            error: 'Invalid PDF ID'
        });

    }

    try {

        // ------------------------------------------
        // 1) Get The PDF File Name + Its RootPath
        // ------------------------------------------

        const pdfRequest =
            new sql.Request();

        pdfRequest.input(
            'pdfId',
            sql.Int,
            pdfId
        );

        const pdfResult =
            await pdfRequest.query(`
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

        const { PDFName: pdfName, RootPath: rootPath } =
            pdfResult.recordset[0];


        // ------------------------------------------
        // 2) Build Full Path And Check It Exists
        // ------------------------------------------

        const fullPath =
            path.join(
                rootPath,
                pdfName
            );

        if (!fs.existsSync(fullPath)) {

            console.error(
                '❌ PDF file not found on disk:',
                fullPath
            );

            return res.status(404).json({
                error: 'PDF file not found on disk',
                path: fullPath
            });

        }


        // ------------------------------------------
        // 3) Launch With The OS Default Application
        //    "start" is a cmd.exe builtin; the empty
        //    "" is the (required) window title slot.
        // ------------------------------------------

        await execAsync(
            `start "" "${fullPath}"`
        );

        res.json({
            success: true
        });

    } catch (err) {

        console.error('❌ PDF open request failed:');
        console.error(err);

        res.status(500).json({
            error: err.message
        });

    }

});

// ========================================
// Start Server
// ========================================

app.listen(3000, async () => {

    console.log('🚀 Server running on http://localhost:3000');

    await testDatabaseConnection();

});