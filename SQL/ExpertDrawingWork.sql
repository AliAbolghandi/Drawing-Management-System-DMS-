/*
  DMS Expert Drawing Work Contributions
  Version: 2026-10-14
  Purpose: persist per-expert contributions without overwriting prior experts.

  IMPORTANT:
  - Run only after reviewing against the live database.
  - This script does not alter existing tables except for the two validation triggers below.
  - One row represents one expert's cumulative contribution for one assignment.
*/

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.DrawingRequestExpertWork', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DrawingRequestExpertWork
    (
        ExpertWorkID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DrawingRequestExpertWork PRIMARY KEY,
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
        CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_DrawingRequestExpertWork_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_DrawingRequestExpertWork_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_DrawingRequestExpertWork_Assignment UNIQUE (AssignmentID),
        CONSTRAINT FK_DrawingRequestExpertWork_Assignment FOREIGN KEY (AssignmentID) REFERENCES dbo.DrawingRequestAssignments(AssignmentID),
        CONSTRAINT CK_DrawingRequestExpertWork_PredictedPartCount CHECK (PredictedPartCount IS NULL OR PredictedPartCount >= 0),
        CONSTRAINT CK_DrawingRequestExpertWork_CroquisPartCount CHECK (CroquisPartCount IS NULL OR CroquisPartCount >= 0),
        CONSTRAINT CK_DrawingRequestExpertWork_ModelingPartCount CHECK (ModelingPartCount IS NULL OR ModelingPartCount >= 0),
        CONSTRAINT CK_DrawingRequestExpertWork_StandardPartCount CHECK (StandardPartCount IS NULL OR StandardPartCount >= 0),
        CONSTRAINT CK_DrawingRequestExpertWork_DrawnPartCount CHECK (DrawnPartCount IS NULL OR DrawnPartCount >= 0),
        CONSTRAINT CK_DrawingRequestExpertWork_CroquisDates CHECK (CroquisEndDate IS NULL OR CroquisStartDate IS NULL OR CroquisEndDate >= CroquisStartDate),
        CONSTRAINT CK_DrawingRequestExpertWork_ModelingDates CHECK (ModelingEndDate IS NULL OR ModelingStartDate IS NULL OR ModelingEndDate >= ModelingStartDate),
        CONSTRAINT CK_DrawingRequestExpertWork_DrawingDates CHECK (DrawingEndDate IS NULL OR DrawingStartDate IS NULL OR DrawingEndDate >= DrawingStartDate)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.DrawingRequestExpertWork') AND name=N'IX_DrawingRequestExpertWork_AssignmentID')
    CREATE INDEX IX_DrawingRequestExpertWork_AssignmentID ON dbo.DrawingRequestExpertWork(AssignmentID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.DrawingRequestExpertWork') AND name=N'IX_DrawingRequestExpertWork_Dates')
    CREATE INDEX IX_DrawingRequestExpertWork_Dates ON dbo.DrawingRequestExpertWork(CroquisStartDate, ModelingStartDate, DrawingStartDate);

/*
  Accept prerequisite: an expert cannot move an assignment to IN_PROGRESS
  unless that assignment already has a predicted part count.
*/
IF OBJECT_ID(N'dbo.TR_DrawingRequests_ExpertAcceptPrerequisite', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_DrawingRequests_ExpertAcceptPrerequisite;
GO
CREATE TRIGGER dbo.TR_DrawingRequests_ExpertAcceptPrerequisite
ON dbo.DrawingRequests
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(StatusID) RETURN;

    IF EXISTS
    (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.RequestID=i.RequestID
        INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=i.StatusID
        WHERE s.StatusCode=N'IN_PROGRESS'
          AND EXISTS
          (
              SELECT 1
              FROM dbo.DrawingRequestAssignments a
              LEFT JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID
              WHERE a.RequestID=i.RequestID
                AND a.DrawingExpertUserID=i.AssignedDrawingExpertID
                AND a.IsCurrent=1
                AND w.PredictedPartCount IS NULL
          )
    )
        ;THROW 51021, 'A predicted part count is required before accepting drawing work.', 1;
END;
GO

/*
  Completion prerequisite: all three stages must have at least one completed
  contribution across the request's expert assignments. Final Drawing must
  also contain both standard-part and drawn-part counts.
*/
IF OBJECT_ID(N'dbo.TR_DrawingRequests_ExpertCompletePrerequisite', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_DrawingRequests_ExpertCompletePrerequisite;
GO
CREATE TRIGGER dbo.TR_DrawingRequests_ExpertCompletePrerequisite
ON dbo.DrawingRequests
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(StatusID) RETURN;

    IF EXISTS
    (
        SELECT 1
        FROM inserted i
        INNER JOIN deleted d ON d.RequestID=i.RequestID
        INNER JOIN dbo.DrawingRequestStatuses s ON s.StatusID=i.StatusID
        WHERE s.StatusCode=N'PENDING_FINAL_APPROVAL'
          AND
          (
              NOT EXISTS
              (
                  SELECT 1
                  FROM dbo.DrawingRequestAssignments a
                  INNER JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID
                  WHERE a.RequestID=i.RequestID
                    AND w.CroquisStartDate IS NOT NULL
                    AND w.CroquisEndDate IS NOT NULL
                    AND w.CroquisPartCount IS NOT NULL
              )
              OR NOT EXISTS
              (
                  SELECT 1
                  FROM dbo.DrawingRequestAssignments a
                  INNER JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID
                  WHERE a.RequestID=i.RequestID
                    AND w.ModelingStartDate IS NOT NULL
                    AND w.ModelingEndDate IS NOT NULL
                    AND w.ModelingPartCount IS NOT NULL
              )
              OR NOT EXISTS
              (
                  SELECT 1
                  FROM dbo.DrawingRequestAssignments a
                  INNER JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID
                  WHERE a.RequestID=i.RequestID
                    AND w.DrawingStartDate IS NOT NULL
                    AND w.DrawingEndDate IS NOT NULL
                    AND w.StandardPartCount IS NOT NULL
                    AND w.DrawnPartCount IS NOT NULL
              )
          )
        ;THROW 51022, 'Croquis, Modeling and Final Drawing data are required before completing the request.', 1;
END;
GO

COMMIT TRANSACTION;
GO
