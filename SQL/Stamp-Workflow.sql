/* DMS Stamp workflow migration
   Run after backing up dbDrawingManagment. */
SET XACT_ABORT ON;
BEGIN TRANSACTION;

/* Stamp requests bypass Manager approval. The shared DrawingRequests table therefore
   must allow the Manager fields to be NULL for this request type. */
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id=OBJECT_ID(N'dbo.DrawingRequests') AND name=N'ManagerUserID' AND is_nullable=0
)
    ALTER TABLE dbo.DrawingRequests ALTER COLUMN ManagerUserID INT NULL;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id=OBJECT_ID(N'dbo.DrawingRequests') AND name=N'ManagerUsername' AND is_nullable=0
)
    ALTER TABLE dbo.DrawingRequests ALTER COLUMN ManagerUsername NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM dbo.DrawingRequestStatuses WHERE StatusCode=N'PENDING_STAMP')
    INSERT INTO dbo.DrawingRequestStatuses(StatusCode,StatusName,Description)
    VALUES (N'PENDING_STAMP',N'Pending Stamp',N'Separate Stamp Drawing request waiting for a user with REQUEST_DRAWING_STAMP.');

IF NOT EXISTS (SELECT 1 FROM dbo.DrawingRequestStatuses WHERE StatusCode=N'STAMP_COMPLETED')
    INSERT INTO dbo.DrawingRequestStatuses(StatusCode,StatusName,Description)
    VALUES (N'STAMP_COMPLETED',N'Stamp Completed',N'All selected PDFs in the Stamp request were stamped successfully.');

IF OBJECT_ID(N'dbo.DrawingRequestStamps',N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DrawingRequestStamps
    (
        StampRequestID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_DrawingRequestStamps PRIMARY KEY,
        RequestID int NOT NULL,
        RequestedByUserID int NOT NULL,
        StatusCode nvarchar(20) NOT NULL CONSTRAINT DF_DrawingRequestStamps_Status DEFAULT(N'PENDING'),
        ApprovedByUserID int NULL,
        ApprovedAt datetime2(3) NULL,
        RejectedByUserID int NULL,
        RejectedAt datetime2(3) NULL,
        CompletedAt datetime2(3) NULL,
        ExpiresAt datetime2(3) NULL,
        Comment nvarchar(1000) NULL,
        CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_DrawingRequestStamps_CreatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_DrawingRequestStamps_UpdatedAt DEFAULT(SYSUTCDATETIME()),
        CONSTRAINT FK_DrawingRequestStamps_Request FOREIGN KEY(RequestID) REFERENCES dbo.DrawingRequests(RequestID),
        CONSTRAINT FK_DrawingRequestStamps_User FOREIGN KEY(RequestedByUserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT CK_DrawingRequestStamps_Status CHECK(StatusCode IN(N'PENDING',N'APPROVED',N'REJECTED',N'COMPLETED'))
    );
END;

IF OBJECT_ID(N'dbo.DrawingRequestStampItems',N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DrawingRequestStampItems
    (
        StampItemID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_DrawingRequestStampItems PRIMARY KEY,
        StampRequestID int NOT NULL,
        RequestID int NOT NULL,
        NodeID int NOT NULL,
        SourceType nvarchar(20) NOT NULL,
        PDFID int NULL,
        PDFName nvarchar(260) NOT NULL,
        SourceRelativePath nvarchar(1000) NULL,
        StatusCode nvarchar(20) NOT NULL CONSTRAINT DF_DrawingRequestStampItems_Status DEFAULT(N'PENDING'),
        StampPng varbinary(max) NULL,
        StampedFileName nvarchar(260) NULL,
        CompletedByUserID int NULL,
        StampedAt datetime2(3) NULL,
        ExpiresAt datetime2(3) NULL,
        CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_DrawingRequestStampItems_CreatedAt DEFAULT(SYSUTCDATETIME()),
        UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_DrawingRequestStampItems_UpdatedAt DEFAULT(SYSUTCDATETIME()),
        CONSTRAINT FK_DrawingRequestStampItems_StampRequest FOREIGN KEY(StampRequestID) REFERENCES dbo.DrawingRequestStamps(StampRequestID) ON DELETE CASCADE,
        CONSTRAINT FK_DrawingRequestStampItems_Request FOREIGN KEY(RequestID) REFERENCES dbo.DrawingRequests(RequestID),
        CONSTRAINT FK_DrawingRequestStampItems_Node FOREIGN KEY(NodeID) REFERENCES dbo.Nodes(NodeID),
        CONSTRAINT FK_DrawingRequestStampItems_PDF FOREIGN KEY(PDFID) REFERENCES dbo.DanieliPDF(PDFID),
        CONSTRAINT FK_DrawingRequestStampItems_User FOREIGN KEY(CompletedByUserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT CK_DrawingRequestStampItems_SourceType CHECK(SourceType IN(N'DANIELI',N'SRSC')),
        CONSTRAINT CK_DrawingRequestStampItems_Status CHECK(StatusCode IN(N'PENDING',N'APPROVED',N'REJECTED',N'COMPLETED')),
        CONSTRAINT CK_DrawingRequestStampItems_Source CHECK((SourceType=N'DANIELI' AND PDFID IS NOT NULL) OR (SourceType=N'SRSC' AND PDFID IS NULL))
    );
END;

IF OBJECT_ID(N'dbo.DrawingRequestStampPages',N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DrawingRequestStampPages
    (
        StampPageID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_DrawingRequestStampPages PRIMARY KEY,
        StampItemID int NOT NULL,
        PageNumber int NOT NULL,
        X decimal(12,4) NOT NULL,
        Y decimal(12,4) NOT NULL,
        Width decimal(12,4) NOT NULL,
        Height decimal(12,4) NOT NULL,
        CONSTRAINT FK_DrawingRequestStampPages_Item FOREIGN KEY(StampItemID) REFERENCES dbo.DrawingRequestStampItems(StampItemID) ON DELETE CASCADE,
        CONSTRAINT UQ_DrawingRequestStampPages_ItemPage UNIQUE(StampItemID,PageNumber),
        CONSTRAINT CK_DrawingRequestStampPages_Page CHECK(PageNumber>0),
        CONSTRAINT CK_DrawingRequestStampPages_Size CHECK(Width>0 AND Height>0 AND X>=0 AND Y>=0)
    );
END;

IF OBJECT_ID(N'dbo.DrawingRequestStampAudit',N'U') IS NULL
BEGIN
    CREATE TABLE dbo.DrawingRequestStampAudit
    (
        StampAuditID bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_DrawingRequestStampAudit PRIMARY KEY,
        StampRequestID int NULL,
        StampItemID int NULL,
        RequestID int NULL,
        ActorUserID int NULL,
        ActorUsername nvarchar(100) NOT NULL,
        ActionCode nvarchar(50) NOT NULL,
        Details nvarchar(1000) NULL,
        CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_DrawingRequestStampAudit_CreatedAt DEFAULT(SYSUTCDATETIME())
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_DrawingRequestStampAudit_Request' AND object_id=OBJECT_ID(N'dbo.DrawingRequestStampAudit')) CREATE INDEX IX_DrawingRequestStampAudit_Request ON dbo.DrawingRequestStampAudit(RequestID,CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_DrawingRequestStampAudit_Item' AND object_id=OBJECT_ID(N'dbo.DrawingRequestStampAudit')) CREATE INDEX IX_DrawingRequestStampAudit_Item ON dbo.DrawingRequestStampAudit(StampItemID,CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_DrawingRequestStamps_RequestID' AND object_id=OBJECT_ID(N'dbo.DrawingRequestStamps')) CREATE INDEX IX_DrawingRequestStamps_RequestID ON dbo.DrawingRequestStamps(RequestID,StatusCode,CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_DrawingRequestStampItems_StampRequestID' AND object_id=OBJECT_ID(N'dbo.DrawingRequestStampItems')) CREATE INDEX IX_DrawingRequestStampItems_StampRequestID ON dbo.DrawingRequestStampItems(StampRequestID,StatusCode);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_DrawingRequestStampItems_ExpiresAt' AND object_id=OBJECT_ID(N'dbo.DrawingRequestStampItems')) CREATE INDEX IX_DrawingRequestStampItems_ExpiresAt ON dbo.DrawingRequestStampItems(ExpiresAt) WHERE ExpiresAt IS NOT NULL;

COMMIT TRANSACTION;