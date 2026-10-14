/*
  DMS Expert Drawing Work Contributions
  Version: 2026-10-14
  Purpose: persist per-expert contributions without overwriting prior experts.

  IMPORTANT:
  - Run only after reviewing against the live database.
  - This script does not alter existing tables.
  - One row represents one expert's cumulative contribution for one assignment.
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.DrawingRequestExpertWork', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DrawingRequestExpertWork
    (
        ExpertWorkID INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_DrawingRequestExpertWork PRIMARY KEY,

        AssignmentID INT NOT NULL,

        PredictedPartCount INT NULL,

        CroquisStartDate DATE NULL,
        CroquisEndDate DATE NULL,
        CroquisPartCount INT NULL,

        ModelingStartDate DATE NULL,
        ModelingEndDate DATE NULL,
        ModelingPartCount INT NULL,

        DrawingStartDate DATE NULL,
        DrawingEndDate DATE NULL,
        StandardPartCount INT NULL,
        DrawnPartCount INT NULL,

        CreatedAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_DrawingRequestExpertWork_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(3) NOT NULL
            CONSTRAINT DF_DrawingRequestExpertWork_UpdatedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT UQ_DrawingRequestExpertWork_Assignment
            UNIQUE (AssignmentID),

        CONSTRAINT FK_DrawingRequestExpertWork_Assignment
            FOREIGN KEY (AssignmentID)
            REFERENCES dbo.DrawingRequestAssignments(AssignmentID),

        CONSTRAINT CK_DrawingRequestExpertWork_PredictedPartCount
            CHECK (PredictedPartCount IS NULL OR PredictedPartCount >= 0),

        CONSTRAINT CK_DrawingRequestExpertWork_CroquisPartCount
            CHECK (CroquisPartCount IS NULL OR CroquisPartCount >= 0),

        CONSTRAINT CK_DrawingRequestExpertWork_ModelingPartCount
            CHECK (ModelingPartCount IS NULL OR ModelingPartCount >= 0),

        CONSTRAINT CK_DrawingRequestExpertWork_StandardPartCount
            CHECK (StandardPartCount IS NULL OR StandardPartCount >= 0),

        CONSTRAINT CK_DrawingRequestExpertWork_DrawnPartCount
            CHECK (DrawnPartCount IS NULL OR DrawnPartCount >= 0),

        CONSTRAINT CK_DrawingRequestExpertWork_CroquisDates
            CHECK (CroquisEndDate IS NULL OR CroquisStartDate IS NULL OR CroquisEndDate >= CroquisStartDate),

        CONSTRAINT CK_DrawingRequestExpertWork_ModelingDates
            CHECK (ModelingEndDate IS NULL OR ModelingStartDate IS NULL OR ModelingEndDate >= ModelingStartDate),

        CONSTRAINT CK_DrawingRequestExpertWork_DrawingDates
            CHECK (DrawingEndDate IS NULL OR DrawingStartDate IS NULL OR DrawingEndDate >= DrawingStartDate)
    );
END;

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.DrawingRequestExpertWork')
      AND name = N'IX_DrawingRequestExpertWork_AssignmentID'
)
BEGIN
    CREATE INDEX IX_DrawingRequestExpertWork_AssignmentID
        ON dbo.DrawingRequestExpertWork(AssignmentID);
END;

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'dbo.DrawingRequestExpertWork')
      AND name = N'IX_DrawingRequestExpertWork_Dates'
)
BEGIN
    CREATE INDEX IX_DrawingRequestExpertWork_Dates
        ON dbo.DrawingRequestExpertWork(CroquisStartDate, ModelingStartDate, DrawingStartDate);
END;

COMMIT TRANSACTION;
GO
