/*
  Migration: reorder dbo.DrawingRequestExpertWork columns and add assignment snapshot fields.
  Target: SQL Server / dbDrawingManagment
  IMPORTANT: Run during a maintenance window with application writes stopped.
  The transaction preserves existing work rows and AssignmentID relationships.
*/
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'dbo.DrawingRequestExpertWork', N'U') IS NULL
        THROW 51000, 'dbo.DrawingRequestExpertWork does not exist.', 1;

    IF COL_LENGTH(N'dbo.DrawingRequestExpertWork', N'RequestNumber') IS NOT NULL
       OR COL_LENGTH(N'dbo.DrawingRequestExpertWork', N'DrawingExpertUsername') IS NOT NULL
        THROW 51001, 'Target columns already exist. Review the current schema before running this migration.', 1;

    -- SQL Server cannot reorder columns in-place. Rename the original table temporarily.
    EXEC sys.sp_rename
        @objname = N'dbo.DrawingRequestExpertWork',
        @newname = N'DrawingRequestExpertWork_PreRebuild',
        @objtype = N'OBJECT';

    CREATE TABLE dbo.DrawingRequestExpertWork
    (
        ExpertWorkID           int IDENTITY(1,1) NOT NULL,
        AssignmentID           int NOT NULL,
        RequestNumber          nvarchar(30) NULL,
        DrawingExpertUsername  nvarchar(100) NULL,
        PredictedPartCount     int NULL,
        CroquisStartDate       date NULL,
        CroquisEndDate         date NULL,
        CroquisPartCount       int NULL,
        ModelingStartDate      date NULL,
        ModelingEndDate        date NULL,
        ModelingPartCount      int NULL,
        DrawingStartDate       date NULL,
        DrawingEndDate         date NULL,
        StandardPartCount      int NULL,
        DrawnPartCount         int NULL,
        CreatedAt              datetime2(3) NOT NULL
            CONSTRAINT DF_DrawingRequestExpertWork_CreatedAt DEFAULT (sysutcdatetime()),
        UpdatedAt              datetime2(3) NOT NULL
            CONSTRAINT DF_DrawingRequestExpertWork_UpdatedAt DEFAULT (sysutcdatetime())
    );

    SET IDENTITY_INSERT dbo.DrawingRequestExpertWork ON;

    INSERT INTO dbo.DrawingRequestExpertWork
    (
        ExpertWorkID, AssignmentID, RequestNumber, DrawingExpertUsername,
        PredictedPartCount,
        CroquisStartDate, CroquisEndDate, CroquisPartCount,
        ModelingStartDate, ModelingEndDate, ModelingPartCount,
        DrawingStartDate, DrawingEndDate, StandardPartCount, DrawnPartCount,
        CreatedAt, UpdatedAt
    )
    SELECT
        old.ExpertWorkID,
        old.AssignmentID,
        assignment.RequestNumber,
        assignment.DrawingExpertUsername,
        old.PredictedPartCount,
        old.CroquisStartDate, old.CroquisEndDate, old.CroquisPartCount,
        old.ModelingStartDate, old.ModelingEndDate, old.ModelingPartCount,
        old.DrawingStartDate, old.DrawingEndDate, old.StandardPartCount, old.DrawnPartCount,
        old.CreatedAt, old.UpdatedAt
    FROM dbo.DrawingRequestExpertWork_PreRebuild AS old
    INNER JOIN dbo.DrawingRequestAssignments AS assignment
        ON assignment.AssignmentID = old.AssignmentID;

    IF (SELECT COUNT_BIG(*) FROM dbo.DrawingRequestExpertWork)
       <> (SELECT COUNT_BIG(*) FROM dbo.DrawingRequestExpertWork_PreRebuild)
        THROW 51002, 'Migration row-count mismatch. Transaction will be rolled back.', 1;

    SET IDENTITY_INSERT dbo.DrawingRequestExpertWork OFF;

    -- Remove the original table and its old constraints/indexes only after data validation.
    DROP TABLE dbo.DrawingRequestExpertWork_PreRebuild;

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT PK_DrawingRequestExpertWork
        PRIMARY KEY CLUSTERED (ExpertWorkID);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT FK_DrawingRequestExpertWork_Assignment
        FOREIGN KEY (AssignmentID)
        REFERENCES dbo.DrawingRequestAssignments (AssignmentID);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT UQ_DrawingRequestExpertWork_Assignment
        UNIQUE NONCLUSTERED (AssignmentID);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT CK_DrawingRequestExpertWork_CroquisDates
        CHECK (CroquisEndDate IS NULL OR CroquisStartDate IS NULL OR CroquisEndDate >= CroquisStartDate);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT CK_DrawingRequestExpertWork_CroquisPartCount
        CHECK (CroquisPartCount IS NULL OR CroquisPartCount >= 0);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT CK_DrawingRequestExpertWork_DrawingDates
        CHECK (DrawingEndDate IS NULL OR DrawingStartDate IS NULL OR DrawingEndDate >= DrawingStartDate);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT CK_DrawingRequestExpertWork_DrawnPartCount
        CHECK (DrawnPartCount IS NULL OR DrawnPartCount >= 0);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT CK_DrawingRequestExpertWork_ModelingDates
        CHECK (ModelingEndDate IS NULL OR ModelingStartDate IS NULL OR ModelingEndDate >= ModelingStartDate);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT CK_DrawingRequestExpertWork_ModelingPartCount
        CHECK (ModelingPartCount IS NULL OR ModelingPartCount >= 0);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT CK_DrawingRequestExpertWork_PredictedPartCount
        CHECK (PredictedPartCount IS NULL OR PredictedPartCount >= 0);

    ALTER TABLE dbo.DrawingRequestExpertWork
        ADD CONSTRAINT CK_DrawingRequestExpertWork_StandardPartCount
        CHECK (StandardPartCount IS NULL OR StandardPartCount >= 0);

    CREATE NONCLUSTERED INDEX IX_DrawingRequestExpertWork_AssignmentID
        ON dbo.DrawingRequestExpertWork (AssignmentID);

    CREATE NONCLUSTERED INDEX IX_DrawingRequestExpertWork_Dates
        ON dbo.DrawingRequestExpertWork (CroquisStartDate, ModelingStartDate, DrawingStartDate);

    -- Keep the snapshot columns populated for future inserts from existing APIs or other clients.
    EXEC sys.sp_executesql N'
        CREATE TRIGGER dbo.TR_DrawingRequestExpertWork_AssignmentSnapshot
        ON dbo.DrawingRequestExpertWork
        AFTER INSERT
        AS
        BEGIN
            SET NOCOUNT ON;
            UPDATE work
            SET RequestNumber = assignment.RequestNumber,
                DrawingExpertUsername = assignment.DrawingExpertUsername
            FROM dbo.DrawingRequestExpertWork AS work
            INNER JOIN inserted AS i ON i.ExpertWorkID = work.ExpertWorkID
            INNER JOIN dbo.DrawingRequestAssignments AS assignment
                ON assignment.AssignmentID = work.AssignmentID;
        END;
    ';

    COMMIT TRANSACTION;

    -- Verification: column order and preserved row count.
    SELECT
        c.column_id AS Ordinal,
        c.name AS ColumnName,
        TYPE_NAME(c.user_type_id) AS DataType,
        c.max_length AS MaxLength,
        c.is_nullable AS IsNullable
    FROM sys.columns AS c
    WHERE c.object_id = OBJECT_ID(N'dbo.DrawingRequestExpertWork')
    ORDER BY c.column_id;

    SELECT COUNT_BIG(*) AS MigratedRows
    FROM dbo.DrawingRequestExpertWork;

    SELECT COUNT_BIG(*) AS RowsWithoutAssignmentMatch
    FROM dbo.DrawingRequestExpertWork AS work
    LEFT JOIN dbo.DrawingRequestAssignments AS assignment
        ON assignment.AssignmentID = work.AssignmentID
    WHERE assignment.AssignmentID IS NULL;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    BEGIN TRY
        SET IDENTITY_INSERT dbo.DrawingRequestExpertWork OFF;
    END TRY
    BEGIN CATCH
        -- Ignore cleanup errors; preserve the original exception.
    END CATCH;
    THROW;
END CATCH;
