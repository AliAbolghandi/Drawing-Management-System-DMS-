/* ============================================================================
   Create dbo.DanieliDWG and import DWG metadata from DanieliDWG_Import.csv
   Database : dbDrawingManagment
   SQL      : SQL Server 2022
   CSV      : 5 columns: DWGID, NodeID, NodeCode, DWGName, PathID
   Rows     : 1298
   PathID   : 3 (shared Danieli Drawing root used by PDF and DWG files)

   IMPORTANT:
   - @CsvPath is interpreted by the SQL Server machine/service, not SSMS client.
   - The CSV must be closed by Excel/other applications before import.
   - This script creates the table only after CSV and relational checks pass.
   - If any step fails, the transaction is rolled back and temp tables are cleaned.
   ============================================================================ */

USE dbDrawingManagment;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @CsvPath   nvarchar(400) = N'C:\Temp\DanieliDWG_Import.csv';
DECLARE @DwgPathID int           = 3;
DECLARE @ExpRows   int           = 1298;

BEGIN TRY
    /* Remove leftovers from an earlier execution in the same SSMS session. */
    IF OBJECT_ID(N'tempdb..#W0') IS NOT NULL DROP TABLE #W0;
    IF OBJECT_ID(N'tempdb..#W')  IS NOT NULL DROP TABLE #W;

    /* Preconditions. */
    IF @DwgPathID IS NULL
        THROW 56001, N'Set @DwgPathID before running this script.', 1;

    IF NOT EXISTS (SELECT 1 FROM dbo.tblPath WHERE PathID = @DwgPathID)
        THROW 56002, N'@DwgPathID does not exist in dbo.tblPath.', 1;

    IF OBJECT_ID(N'dbo.DanieliDWG', N'U') IS NOT NULL
        THROW 56003, N'dbo.DanieliDWG already exists. Import was not started.', 1;

    /* 1. Load all five CSV columns, including PathID. */
    CREATE TABLE #W0
    (
        DWGID    varchar(20)   NULL,
        NodeID   varchar(20)   NULL,
        NodeCode nvarchar(200) NULL,
        DWGName  nvarchar(200) NULL,
        PathID   varchar(20)   NULL
    );

    DECLARE @sql nvarchar(max) =
        N'BULK INSERT #W0
          FROM ''' + REPLACE(@CsvPath, N'''', N'''''') + N'''
          WITH
          (
              FORMAT = ''CSV'',
              FIELDQUOTE = ''"'',
              FIRSTROW = 2,
              CODEPAGE = ''65001'',
              ROWTERMINATOR = ''0x0d0a'',
              TABLOCK
          );';

    EXEC sys.sp_executesql @sql;

    /* Reject missing or non-integer key/path values before conversion. */
    IF EXISTS
    (
        SELECT 1
        FROM #W0
        WHERE NULLIF(LTRIM(RTRIM(DWGID)), '') IS NULL
           OR TRY_CONVERT(int, DWGID) IS NULL
           OR NULLIF(LTRIM(RTRIM(NodeID)), '') IS NULL
           OR TRY_CONVERT(int, NodeID) IS NULL
           OR NULLIF(LTRIM(RTRIM(PathID)), '') IS NULL
           OR TRY_CONVERT(int, PathID) IS NULL
           OR NULLIF(LTRIM(RTRIM(NodeCode)), N'') IS NULL
           OR NULLIF(LTRIM(RTRIM(DWGName)), N'') IS NULL
    )
        THROW 56004, N'CSV contains an empty or invalid required value.', 1;

    SELECT
        CONVERT(int, DWGID)  AS DWGID,
        CONVERT(int, NodeID) AS NodeID,
        NodeCode,
        DWGName,
        CONVERT(int, PathID) AS PathID
    INTO #W
    FROM #W0;

    /* 2. Validate imported data before creating the permanent table. */
    IF (SELECT COUNT(*) FROM #W) <> @ExpRows
        THROW 56005, N'CSV row count is not the expected 1298 rows.', 1;

    IF EXISTS (SELECT 1 FROM #W GROUP BY DWGID HAVING COUNT(*) > 1)
        THROW 56006, N'Duplicate DWGID found in the CSV.', 1;

    IF EXISTS (SELECT 1 FROM #W GROUP BY NodeID, DWGName HAVING COUNT(*) > 1)
        THROW 56007, N'Duplicate (NodeID, DWGName) found in the CSV.', 1;

    IF EXISTS
    (
        SELECT 1
        FROM #W
        WHERE DWGName NOT LIKE
            N'[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9].dwg'
    )
        THROW 56008, N'A DWGName is not in the required 8-digits + .dwg format.', 1;

    IF EXISTS (SELECT 1 FROM #W WHERE PathID <> @DwgPathID)
        THROW 56009, N'CSV PathID values do not match @DwgPathID (3).', 1;

    IF EXISTS
    (
        SELECT 1
        FROM #W AS w
        WHERE NOT EXISTS
        (
            SELECT 1
            FROM dbo.Nodes AS n
            WHERE n.NodeID = w.NodeID
              AND n.NodeCode = w.NodeCode
        )
    )
        THROW 56010, N'Some CSV rows do not match dbo.Nodes by both NodeID and NodeCode. Confirm the node import first.', 1;

    /* 3. Create and populate the permanent table atomically. */
    BEGIN TRANSACTION;

        CREATE TABLE dbo.DanieliDWG
        (
            DWGID    int           NOT NULL,
            NodeID   int           NOT NULL,
            NodeCode nvarchar(200) NOT NULL,
            DWGName  nvarchar(200) NOT NULL,
            PathID   int           NOT NULL,

            CONSTRAINT PK_DanieliDWG
                PRIMARY KEY CLUSTERED (DWGID),

            CONSTRAINT FK_DanieliDWG_Nodes
                FOREIGN KEY (NodeID) REFERENCES dbo.Nodes (NodeID),

            CONSTRAINT FK_DanieliDWG_tblPath
                FOREIGN KEY (PathID) REFERENCES dbo.tblPath (PathID)
        );

        CREATE NONCLUSTERED INDEX IX_DanieliDWG_NodeID
            ON dbo.DanieliDWG (NodeID);

        INSERT INTO dbo.DanieliDWG
            (DWGID, NodeID, NodeCode, DWGName, PathID)
        SELECT
            DWGID, NodeID, NodeCode, DWGName, PathID
        FROM #W
        ORDER BY DWGID;

        IF (SELECT COUNT(*) FROM dbo.DanieliDWG) <> @ExpRows
            THROW 56011, N'Row count after inserting into dbo.DanieliDWG is incorrect.', 1;

    COMMIT TRANSACTION;

    DROP TABLE #W0;
    DROP TABLE #W;

    /* 4. Import summary and sample rows. */
    SELECT
        COUNT(*) AS Rows,
        COUNT(DISTINCT NodeID) AS NodesWithDwg,
        COUNT(DISTINCT DWGName) AS DistinctDwg,
        MIN(PathID) AS MinPathID,
        MAX(PathID) AS MaxPathID
    FROM dbo.DanieliDWG;

    SELECT TOP (5) *
    FROM dbo.DanieliDWG
    ORDER BY DWGID;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    IF OBJECT_ID(N'tempdb..#W0') IS NOT NULL DROP TABLE #W0;
    IF OBJECT_ID(N'tempdb..#W')  IS NOT NULL DROP TABLE #W;

    THROW;
END CATCH;
GO
