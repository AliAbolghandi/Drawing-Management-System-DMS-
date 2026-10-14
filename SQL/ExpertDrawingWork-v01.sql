/*
  DMS Expert Drawing Work - v01
  Purpose: persist per-expert contributions without overwriting previous experts.
  Safe to run repeatedly.
*/

IF OBJECT_ID(N'dbo.DrawingRequestExpertWork', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DrawingRequestExpertWork
    (
        ExpertWorkID INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_DrawingRequestExpertWork PRIMARY KEY,
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

        CONSTRAINT FK_DrawingRequestExpertWork_Assignment
            FOREIGN KEY (AssignmentID) REFERENCES dbo.DrawingRequestAssignments(AssignmentID),
        CONSTRAINT FK_DrawingRequestExpertWork_Request
            FOREIGN KEY (RequestID) REFERENCES dbo.DrawingRequests(RequestID),
        CONSTRAINT FK_DrawingRequestExpertWork_Expert
            FOREIGN KEY (ExpertUserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT UQ_DrawingRequestExpertWork_Assignment UNIQUE (AssignmentID),
        CONSTRAINT CK_DrawingRequestExpertWork_Counts CHECK
        (
            (PredictedPartCount IS NULL OR PredictedPartCount > 0) AND
            (CroquisPartCount IS NULL OR CroquisPartCount > 0) AND
            (ModelingPartCount IS NULL OR ModelingPartCount > 0) AND
            (StandardPartCount IS NULL OR StandardPartCount >= 0) AND
            (DrawnPartCount IS NULL OR DrawnPartCount >= 0)
        ),
        CONSTRAINT CK_DrawingRequestExpertWork_Dates CHECK
        (
            (CroquisStartDate IS NULL OR CroquisEndDate IS NULL OR CroquisEndDate >= CroquisStartDate) AND
            (ModelingStartDate IS NULL OR ModelingEndDate IS NULL OR ModelingEndDate >= ModelingStartDate) AND
            (DrawingStartDate IS NULL OR DrawingEndDate IS NULL OR DrawingEndDate >= DrawingStartDate)
        )
    );

    CREATE INDEX IX_DrawingRequestExpertWork_RequestID
        ON dbo.DrawingRequestExpertWork(RequestID, AssignmentID);
    CREATE INDEX IX_DrawingRequestExpertWork_ExpertUserID
        ON dbo.DrawingRequestExpertWork(ExpertUserID, UpdatedAt DESC);
END;
GO

/* Backfill/repair is intentionally not performed: existing workflow data has no
   reliable expert-stage contribution values to infer. */
