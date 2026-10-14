/* DMS Expert Drawing Work v01 */

IF OBJECT_ID(N'dbo.DrawingRequestExpertWork', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DrawingRequestExpertWork
    (
        ExpertWorkID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DrawingRequestExpertWork PRIMARY KEY,
        AssignmentID INT NOT NULL,
        RequestID INT NOT NULL,
        ExpertUserID INT NOT NULL,
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
        CreatedAt DATETIME2(7) NOT NULL CONSTRAINT DF_DrawingRequestExpertWork_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(7) NOT NULL CONSTRAINT DF_DrawingRequestExpertWork_UpdatedAt DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_DrawingRequestExpertWork_Assignment FOREIGN KEY (AssignmentID) REFERENCES dbo.DrawingRequestAssignments(AssignmentID),
        CONSTRAINT FK_DrawingRequestExpertWork_Request FOREIGN KEY (RequestID) REFERENCES dbo.DrawingRequests(RequestID),
        CONSTRAINT FK_DrawingRequestExpertWork_Expert FOREIGN KEY (ExpertUserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT UQ_DrawingRequestExpertWork_Assignment UNIQUE (AssignmentID),
        CONSTRAINT CK_DrawingRequestExpertWork_Counts CHECK
        ((PredictedPartCount IS NULL OR PredictedPartCount > 0) AND
         (CroquisPartCount IS NULL OR CroquisPartCount > 0) AND
         (ModelingPartCount IS NULL OR ModelingPartCount > 0) AND
         (StandardPartCount IS NULL OR StandardPartCount >= 0) AND
         (DrawnPartCount IS NULL OR DrawnPartCount >= 0)),
        CONSTRAINT CK_DrawingRequestExpertWork_Dates CHECK
        ((CroquisStartDate IS NULL OR CroquisEndDate IS NULL OR CroquisEndDate >= CroquisStartDate) AND
         (ModelingStartDate IS NULL OR ModelingEndDate IS NULL OR ModelingEndDate >= ModelingStartDate) AND
         (DrawingStartDate IS NULL OR DrawingEndDate IS NULL OR DrawingEndDate >= DrawingStartDate))
    );

    CREATE INDEX IX_DrawingRequestExpertWork_RequestID ON dbo.DrawingRequestExpertWork(RequestID, AssignmentID);
    CREATE INDEX IX_DrawingRequestExpertWork_ExpertUserID ON dbo.DrawingRequestExpertWork(ExpertUserID, UpdatedAt DESC);
END;
GO

/* Existing workflow data is not backfilled because historical expert contributions cannot be inferred reliably. */

/* Database-level completion guard: incomplete current expert work cannot reach final approval. */
IF OBJECT_ID(N'dbo.TR_DrawingRequests_ExpertWorkCompletionGuard', N'TR') IS NOT NULL
    DROP TRIGGER dbo.TR_DrawingRequests_ExpertWorkCompletionGuard;
GO

CREATE TRIGGER dbo.TR_DrawingRequests_ExpertWorkCompletionGuard
ON dbo.DrawingRequests
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(StatusID) RETURN;

    DECLARE @targetStatusID INT = (SELECT TOP 1 StatusID FROM dbo.DrawingRequestStatuses WHERE StatusCode=N'PENDING_FINAL_APPROVAL');
    IF @targetStatusID IS NULL RETURN;

    IF EXISTS
    (
        SELECT 1
        FROM inserted i
        LEFT JOIN dbo.DrawingRequestAssignments a
          ON a.RequestID=i.RequestID AND a.DrawingExpertUserID=i.AssignedDrawingExpertID AND a.IsCurrent=1
        LEFT JOIN dbo.DrawingRequestExpertWork w ON w.AssignmentID=a.AssignmentID
        WHERE i.StatusID=@targetStatusID
          AND (a.AssignmentID IS NULL OR w.ExpertWorkID IS NULL OR w.PredictedPartCount IS NULL
            OR w.CroquisStartDate IS NULL OR w.CroquisEndDate IS NULL OR w.CroquisPartCount IS NULL
            OR w.ModelingStartDate IS NULL OR w.ModelingEndDate IS NULL OR w.ModelingPartCount IS NULL
            OR w.DrawingStartDate IS NULL OR w.DrawingEndDate IS NULL
            OR w.StandardPartCount IS NULL OR w.DrawnPartCount IS NULL)
    )
    BEGIN
        THROW 51020, 'Drawing work is incomplete. Croquis, Modeling and Final Drawing data are required before completion.', 1;
    END;
END;
GO
