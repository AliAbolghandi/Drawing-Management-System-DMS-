/*
    DMS - table-v04 database migration / seed
    Database: dbDrawingManagment
    Source: Tables-v04.xlsx

    Purpose:
      1) Add the new request-workflow tables required by table-v04.
      2) Add the new Manager role.
      3) Add request-workflow permissions.
      4) Add the table-v04 RolePermissions mappings.
      5) Align UserID=7 with the Manager role as defined by table-v04.
      6) Seed workflow Status and ActionCode data.

    IMPORTANT:
      - Existing Nodes, DanieliPDF, tblPath, Users, UserManager and Logs rows are NOT re-inserted.
      - Existing database structures are not dropped or rebuilt.
      - The script is idempotent: it can be executed again without duplicating rows.
      - Existing RolePermissions are preserved; only missing table-v04 mappings are added.
*/

USE [dbDrawingManagment];
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       1. New Role: Manager
       ============================================================ */
    IF NOT EXISTS (
        SELECT 1
        FROM dbo.Roles
        WHERE RoleCode = N'Manager'
    )
    BEGIN
        INSERT INTO dbo.Roles
            (RoleCode, RoleName, Description, IsActive)
        VALUES
            (N'Manager',
             N'Viewer and Approved Request',
             N'Read-only access to assigned data',
             1);
    END;

    /* ============================================================
       2. New request-workflow permissions: PermissionID 15..29
          PermissionID is identity in the existing database, so the
          migration resolves permissions by PermissionCode.
       ============================================================ */
    INSERT INTO dbo.Permissions
        (PermissionCode, PermissionName, Module, Description)
    SELECT v.PermissionCode, v.PermissionName, v.Module, v.Description
    FROM (VALUES
        (N'REQUEST_DRAWING_CREATE',           CAST(NULL AS nvarchar(150)), CAST(NULL AS nvarchar(100)), CAST(NULL AS nvarchar(500))),
        (N'REQUEST_DRAWING_VIEW_OWN',         NULL, NULL, NULL),
        (N'REQUEST_DRAWING_VIEW_MANAGER',     NULL, NULL, NULL),
        (N'REQUEST_DRAWING_APPROVE',          NULL, NULL, NULL),
        (N'REQUEST_DRAWING_REJECT',           NULL, NULL, NULL),
        (N'REQUEST_DRAWING_VIEW_ALL',         NULL, NULL, NULL),
        (N'REQUEST_DRAWING_ASSIGN',           NULL, NULL, NULL),
        (N'REQUEST_DRAWING_VIEW_ASSIGNED',    NULL, NULL, NULL),
        (N'REQUEST_DRAWING_ACCEPT',           NULL, NULL, N'DrawingExpert بتواند درخواست ارجاع‌شده را Accept کند.'),
        (N'REQUEST_DRAWING_TRANSFER',         NULL, NULL, N'DrawingExpert بتواند درخواست را به DrawingExpert دیگری واگذار کند.'),
        (N'REQUEST_DRAWING_EXPERT_REJECT',    NULL, NULL, N'DrawingExpert بتواند درخواست را Reject کند.'),
        (N'REQUEST_DRAWING_COMPLETE',         NULL, NULL, N'DrawingExpert بتواند کار را تمام‌شده اعلام کند.'),
        (N'REQUEST_DRAWING_RETURN_CORRECTION',NULL, NULL, N'کاربر مجاز بتواند درخواست را برای اصلاح برگرداند.'),
        (N'REQUEST_DRAWING_FINAL_APPROVE',    NULL, NULL, N'Admin/DrawingSupervisor بتوانند تأیید نهایی کنند.'),
        (N'REQUEST_DRAWING_FINAL_REJECT',     NULL, NULL, N'Admin/DrawingSupervisor بتوانند تأیید نهایی را رد کنند.')
    ) AS v(PermissionCode, PermissionName, Module, Description)
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.Permissions p
        WHERE p.PermissionCode = v.PermissionCode
    );

    /* ============================================================
       3. table-v04 RolePermissions mapping
          Existing mappings are preserved.
          Mapping is resolved by PermissionCode, not by identity
          values, so it remains safe if PermissionID values differ.
       ============================================================ */
    INSERT INTO dbo.RolePermissions (RoleID, PermissionID)
    SELECT rp.RoleID, p.PermissionID
    FROM (VALUES
        /* Admin */
        (1,N'NODE_VIEW'),(1,N'NODE_CREATE'),(1,N'NODE_EDIT'),(1,N'NODE_DELETE'),
        (1,N'PDF_VIEW'),(1,N'PDF_Danieli_Download'),(1,N'PDF_SRSC_Download'),(1,N'PDF_Approve'),
        (1,N'FILE_VIEW'),(1,N'FILE_Edit'),(1,N'USER_VIEW'),(1,N'USER_Manager'),
        (1,N'ROLE_MANAGE'),(1,N'AUDIT_VIEW'),
        (1,N'REQUEST_DRAWING_CREATE'),(1,N'REQUEST_DRAWING_VIEW_OWN'),(1,N'REQUEST_DRAWING_VIEW_MANAGER'),
        (1,N'REQUEST_DRAWING_APPROVE'),(1,N'REQUEST_DRAWING_REJECT'),(1,N'REQUEST_DRAWING_VIEW_ALL'),
        (1,N'REQUEST_DRAWING_ASSIGN'),(1,N'REQUEST_DRAWING_VIEW_ASSIGNED'),
        (1,N'REQUEST_DRAWING_ACCEPT'),(1,N'REQUEST_DRAWING_TRANSFER'),
        (1,N'REQUEST_DRAWING_EXPERT_REJECT'),(1,N'REQUEST_DRAWING_COMPLETE'),
        (1,N'REQUEST_DRAWING_RETURN_CORRECTION'),(1,N'REQUEST_DRAWING_FINAL_APPROVE'),
        (1,N'REQUEST_DRAWING_FINAL_REJECT'),

        /* DrawingSupervisor */
        (2,N'NODE_VIEW'),(2,N'NODE_CREATE'),(2,N'NODE_EDIT'),(2,N'NODE_DELETE'),
        (2,N'PDF_VIEW'),(2,N'PDF_Danieli_Download'),(2,N'PDF_SRSC_Download'),(2,N'PDF_Approve'),
        (2,N'FILE_VIEW'),(2,N'FILE_Edit'),(2,N'USER_VIEW'),
        (2,N'REQUEST_DRAWING_CREATE'),(2,N'REQUEST_DRAWING_VIEW_OWN'),(2,N'REQUEST_DRAWING_VIEW_MANAGER'),
        (2,N'REQUEST_DRAWING_APPROVE'),(2,N'REQUEST_DRAWING_REJECT'),(2,N'REQUEST_DRAWING_VIEW_ALL'),
        (2,N'REQUEST_DRAWING_ASSIGN'),(2,N'REQUEST_DRAWING_VIEW_ASSIGNED'),
        (2,N'REQUEST_DRAWING_RETURN_CORRECTION'),(2,N'REQUEST_DRAWING_FINAL_APPROVE'),
        (2,N'REQUEST_DRAWING_FINAL_REJECT'),

        /* DrawingExpert */
        (3,N'NODE_VIEW'),(3,N'NODE_CREATE'),(3,N'NODE_EDIT'),(3,N'NODE_DELETE'),
        (3,N'PDF_VIEW'),(3,N'PDF_Danieli_Download'),(3,N'PDF_SRSC_Download'),(3,N'PDF_Approve'),
        (3,N'FILE_VIEW'),(3,N'FILE_Edit'),
        (3,N'REQUEST_DRAWING_CREATE'),(3,N'REQUEST_DRAWING_VIEW_OWN'),
        (3,N'REQUEST_DRAWING_VIEW_ALL'),(3,N'REQUEST_DRAWING_VIEW_ASSIGNED'),
        (3,N'REQUEST_DRAWING_ACCEPT'),(3,N'REQUEST_DRAWING_TRANSFER'),
        (3,N'REQUEST_DRAWING_EXPERT_REJECT'),(3,N'REQUEST_DRAWING_COMPLETE'),
        (3,N'REQUEST_DRAWING_RETURN_CORRECTION'),

        /* VIEWER */
        (4,N'NODE_VIEW'),(4,N'PDF_VIEW'),(4,N'PDF_Danieli_Download'),
        (4,N'REQUEST_DRAWING_CREATE'),(4,N'REQUEST_DRAWING_VIEW_OWN'),

        /* Manager */
        (5,N'NODE_VIEW'),(5,N'PDF_VIEW'),(5,N'PDF_Danieli_Download'),
        (5,N'REQUEST_DRAWING_CREATE'),(5,N'REQUEST_DRAWING_VIEW_OWN'),
        (5,N'REQUEST_DRAWING_VIEW_MANAGER'),(5,N'REQUEST_DRAWING_APPROVE'),
        (5,N'REQUEST_DRAWING_REJECT')
    ) AS rp(RoleID, PermissionCode)
    INNER JOIN dbo.Permissions p
        ON p.PermissionCode = rp.PermissionCode
    WHERE EXISTS (
        SELECT 1
        FROM dbo.Roles r
        WHERE r.RoleID = rp.RoleID
    )
    AND NOT EXISTS (
        SELECT 1
        FROM dbo.RolePermissions x
        WHERE x.RoleID = rp.RoleID
          AND x.PermissionID = p.PermissionID
    );

    /* ============================================================
       4. Align table-v04 UserRoles data
          Tables-v02: UserID 7 = VIEWER (RoleID 4)
          Tables-v04: UserID 7 = Manager (RoleID 5)
       ============================================================ */
    IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserID = 7)
       AND EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleID = 5)
       AND EXISTS (
            SELECT 1 FROM dbo.UserRoles
            WHERE UserID = 7 AND RoleID = 4
       )
       AND NOT EXISTS (
            SELECT 1 FROM dbo.UserRoles
            WHERE UserID = 7 AND RoleID = 5
       )
    BEGIN
        UPDATE dbo.UserRoles
        SET RoleID = 5
        WHERE UserID = 7
          AND RoleID = 4;
    END;

    /* ============================================================
       5. DrawingRequestStatuses
       ============================================================ */
    IF OBJECT_ID(N'dbo.DrawingRequestStatuses', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.DrawingRequestStatuses
        (
            StatusID   int NOT NULL,
            StatusCode nvarchar(50) NOT NULL,
            StatusName nvarchar(150) NOT NULL,
            [Description] nvarchar(1000) NULL,

            CONSTRAINT PK_DrawingRequestStatuses
                PRIMARY KEY CLUSTERED (StatusID),

            CONSTRAINT UX_DrawingRequestStatuses_StatusCode
                UNIQUE (StatusCode)
        );
    END;

    /* ============================================================
       6. ActionCode
       ============================================================ */
    IF OBJECT_ID(N'dbo.ActionCode', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.ActionCode
        (
            ActionCodeID int NOT NULL,
            ActionCode   nvarchar(50) NOT NULL,

            CONSTRAINT PK_ActionCode
                PRIMARY KEY CLUSTERED (ActionCodeID),

            CONSTRAINT UX_ActionCode_ActionCode
                UNIQUE (ActionCode)
        );
    END;

    /* ============================================================
       7. DrawingRequests
       ============================================================ */
    IF OBJECT_ID(N'dbo.DrawingRequests', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.DrawingRequests
        (
            RequestID                 int IDENTITY(1,1) NOT NULL,
            RequestNumber             nvarchar(30) NOT NULL,
            NodeID                    int NOT NULL,
            NodeCode                  nvarchar(100) NULL,
            RequesterUserID           int NOT NULL,
            RequesterUsername         nvarchar(100) NULL,
            ManagerUserID             int NOT NULL,
            ManagerUsername           nvarchar(100) NULL,
            [Description]             nvarchar(1000) NULL,
            StatusID                  int NOT NULL,
            AssignedDrawingExpertID   int NULL,
            CreatedAt                 datetime2 NOT NULL,
            ManagerDecisionAt         datetime2 NULL,
            ManagerComment            nvarchar(1000) NULL,
            AssignedAt                datetime2 NULL,
            UpdatedAt                 datetime2 NOT NULL,

            CONSTRAINT PK_DrawingRequests
                PRIMARY KEY CLUSTERED (RequestID),

            CONSTRAINT UX_DrawingRequests_RequestNumber
                UNIQUE (RequestNumber),

            CONSTRAINT FK_DrawingRequests_Node
                FOREIGN KEY (NodeID)
                REFERENCES dbo.Nodes (NodeID),

            CONSTRAINT FK_DrawingRequests_Requester
                FOREIGN KEY (RequesterUserID)
                REFERENCES dbo.Users (UserID),

            CONSTRAINT FK_DrawingRequests_Manager
                FOREIGN KEY (ManagerUserID)
                REFERENCES dbo.Users (UserID),

            CONSTRAINT FK_DrawingRequests_Status
                FOREIGN KEY (StatusID)
                REFERENCES dbo.DrawingRequestStatuses (StatusID),

            CONSTRAINT FK_DrawingRequests_AssignedExpert
                FOREIGN KEY (AssignedDrawingExpertID)
                REFERENCES dbo.Users (UserID)
        );
    END;

    /* ============================================================
       8. DrawingRequestAssignments
       ============================================================ */
    IF OBJECT_ID(N'dbo.DrawingRequestAssignments', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.DrawingRequestAssignments
        (
            AssignmentID          int IDENTITY(1,1) NOT NULL,
            RequestID             int NOT NULL,
            RequestNumber         nvarchar(30) NULL,
            AssignedByUserID      int NOT NULL,
            AssignedUsername      nvarchar(100) NULL,
            DrawingExpertUserID   int NOT NULL,
            DrawingExpertUsername nvarchar(100) NULL,
            AssignedAt            datetime2 NOT NULL,
            AcceptedAt            datetime2 NULL,
            CompletedAt           datetime2 NULL,
            IsCurrent             bit NOT NULL
                CONSTRAINT DF_DrawingRequestAssignments_IsCurrent DEFAULT (1),
            AssignmentStatus      nvarchar(30) NULL,
            Comment               nvarchar(1000) NULL,

            CONSTRAINT PK_DrawingRequestAssignments
                PRIMARY KEY CLUSTERED (AssignmentID),

            CONSTRAINT FK_DrawingRequestAssignments_Request
                FOREIGN KEY (RequestID)
                REFERENCES dbo.DrawingRequests (RequestID),

            CONSTRAINT FK_DrawingRequestAssignments_AssignedBy
                FOREIGN KEY (AssignedByUserID)
                REFERENCES dbo.Users (UserID),

            CONSTRAINT FK_DrawingRequestAssignments_Expert
                FOREIGN KEY (DrawingExpertUserID)
                REFERENCES dbo.Users (UserID)
        );
    END;

    /* ============================================================
       9. DrawingRequestHistory
       ============================================================ */
    IF OBJECT_ID(N'dbo.DrawingRequestHistory', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.DrawingRequestHistory
        (
            HistoryID        int IDENTITY(1,1) NOT NULL,
            RequestID        int NOT NULL,
            RequestNumber    nvarchar(30) NULL,
            ActionCode       nvarchar(50) NOT NULL,
            FromStatusID     int NULL,
            ToStatusID       int NULL,
            ActionByUserID   int NOT NULL,
            ActionByUsername nvarchar(100) NULL,
            Comment          nvarchar(1000) NULL,
            CreatedAt        datetime2 NOT NULL,

            CONSTRAINT PK_DrawingRequestHistory
                PRIMARY KEY CLUSTERED (HistoryID),

            CONSTRAINT FK_DrawingRequestHistory_Request
                FOREIGN KEY (RequestID)
                REFERENCES dbo.DrawingRequests (RequestID),

            CONSTRAINT FK_DrawingRequestHistory_ActionCode
                FOREIGN KEY (ActionCode)
                REFERENCES dbo.ActionCode (ActionCode),

            CONSTRAINT FK_DrawingRequestHistory_FromStatus
                FOREIGN KEY (FromStatusID)
                REFERENCES dbo.DrawingRequestStatuses (StatusID),

            CONSTRAINT FK_DrawingRequestHistory_ToStatus
                FOREIGN KEY (ToStatusID)
                REFERENCES dbo.DrawingRequestStatuses (StatusID),

            CONSTRAINT FK_DrawingRequestHistory_User
                FOREIGN KEY (ActionByUserID)
                REFERENCES dbo.Users (UserID)
        );
    END;

    /* ============================================================
       10. Notifications
           Matches table-v04, including UNIQUE(RequestNumber).
       ============================================================ */
    IF OBJECT_ID(N'dbo.Notifications', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.Notifications
        (
            NotificationID   int IDENTITY(1,1) NOT NULL,
            UserID           int NOT NULL,
            Username         nvarchar(100) NULL,
            RequestID        int NULL,
            RequestNumber    nvarchar(30) NULL,
            NotificationType nvarchar(50) NULL,
            Title            nvarchar(200) NULL,
            Message          nvarchar(1000) NULL,
            IsRead           bit NOT NULL
                CONSTRAINT DF_Notifications_IsRead DEFAULT (0),
            CreatedAt        datetime2 NOT NULL,
            ReadAt           datetime2 NULL,

            CONSTRAINT PK_Notifications
                PRIMARY KEY CLUSTERED (NotificationID),

            CONSTRAINT UX_Notifications_RequestNumber
                UNIQUE (RequestNumber),

            CONSTRAINT FK_Notifications_User
                FOREIGN KEY (UserID)
                REFERENCES dbo.Users (UserID),

            CONSTRAINT FK_Notifications_Request
                FOREIGN KEY (RequestID)
                REFERENCES dbo.DrawingRequests (RequestID)
        );
    END;

    /* ============================================================
       11. Seed Status data from table-v04
       ============================================================ */
    INSERT INTO dbo.DrawingRequestStatuses
        (StatusID, StatusCode, StatusName, [Description])
    SELECT v.StatusID, v.StatusCode, v.StatusName, v.[Description]
    FROM (VALUES
        (1,  N'PENDING_MANAGER',           N'Pending Manager Approval',              N'درخواست توسط VIEWER ثبت شده و منتظر تأیید Manager مربوط به درخواست‌دهنده است.'),
        (2,  N'MANAGER_APPROVED',          N'Manager Approved',                      N'Manager درخواست را تأیید کرده و درخواست آماده بررسی Admin/DrawingSupervisor است.'),
        (3,  N'MANAGER_REJECTED',          N'Manager Rejected',                      N'Manager درخواست را رد کرده و Workflow این درخواست متوقف می‌شود.'),
        (4,  N'PENDING_DRAWING_APPROVAL',  N'Pending Drawing Approval',              N'درخواست پس از تأیید Manager در کارتابل Admin و DrawingSupervisor قرار گرفته است.'),
        (5,  N'DRAWING_APPROVAL_REJECTED', N'Drawing Approval Rejected',             N'Admin یا DrawingSupervisor درخواست ایجاد نقشه را رد کرده است و Workflow متوقف می‌شود.'),
        (6,  N'ASSIGNED',                  N'Assigned to Drawing Expert',            N'Admin یا DrawingSupervisor درخواست را به یک DrawingExpert ارجاع داده، ولی Expert هنوز آن را Accept نکرده است.'),
        (7,  N'IN_PROGRESS',               N'In Progress',                           N'DrawingExpert درخواست را پذیرفته و در حال انجام کار است.'),
        (8,  N'TRANSFERRED',               N'Transferred to Another Drawing Expert', N'DrawingExpert فعلی درخواست را به DrawingExpert دیگری واگذار کرده است.'),
        (9,  N'EXPERT_REJECTED',           N'Expert Rejected',                       N'DrawingExpert درخواست را به دلیل عدم امکان/صلاحیت انجام کار رد کرده است؛ درخواست باید برای تصمیم‌گیری مجدد به مرحله ارجاع Expert برگردد.'),
        (10, N'RETURNED_FOR_CORRECTION',   N'Returned for Correction',               N'درخواست/نقشه برای اصلاح به DrawingExpert برگشت داده شده است.'),
        (11, N'PENDING_FINAL_APPROVAL',    N'Pending Final Approval',                N'DrawingExpert کار را تمام کرده و درخواست منتظر تأیید نهایی Admin یا DrawingSupervisor است.'),
        (12, N'FINAL_APPROVED',            N'Final Approved',                        N'Admin یا DrawingSupervisor نقشه تکمیل‌شده را تأیید نهایی کرده و PDF SRSC می‌تواند برای کاربران مجاز منتشر شود.'),
        (13, N'FINAL_REJECTED',            N'Final Approval Rejected',               N'Admin یا DrawingSupervisor نتیجه نهایی را رد کرده است؛ نقشه نیازمند اصلاح است.'),
        (14, N'CANCELLED',                 N'Cancelled',                             N'درخواست به صورت کامل لغو شده و دیگر در Workflow فعال نیست.')
    ) AS v(StatusID, StatusCode, StatusName, [Description])
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.DrawingRequestStatuses s
        WHERE s.StatusID = v.StatusID
           OR s.StatusCode = v.StatusCode
    );

    /* ============================================================
       12. Seed ActionCode data from table-v04
       ============================================================ */
    INSERT INTO dbo.ActionCode
        (ActionCodeID, ActionCode)
    SELECT v.ActionCodeID, v.ActionCode
    FROM (VALUES
        (1,  N'REQUEST_CREATED'),
        (2,  N'MANAGER_APPROVED'),
        (3,  N'MANAGER_REJECTED'),
        (4,  N'DRAWING_APPROVED'),
        (5,  N'DRAWING_REJECTED'),
        (6,  N'ASSIGNED_TO_EXPERT'),
        (7,  N'EXPERT_ACCEPTED'),
        (8,  N'EXPERT_TRANSFERRED'),
        (9,  N'EXPERT_REJECTED'),
        (10, N'RETURN_FOR_CORRECTION'),
        (11, N'WORK_COMPLETED'),
        (12, N'FINAL_APPROVED'),
        (13, N'FINAL_REJECTED'),
        (14, N'REQUEST_CANCELLED')
    ) AS v(ActionCodeID, ActionCode)
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.ActionCode a
        WHERE a.ActionCodeID = v.ActionCodeID
           OR a.ActionCode = v.ActionCode
    );

    /* ============================================================
       13. Workflow indexes
       ============================================================ */
    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.DrawingRequests')
          AND name = N'IX_DrawingRequests_RequesterUserID'
    )
    BEGIN
        CREATE INDEX IX_DrawingRequests_RequesterUserID
            ON dbo.DrawingRequests (RequesterUserID);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.DrawingRequests')
          AND name = N'IX_DrawingRequests_ManagerUserID_StatusID'
    )
    BEGIN
        CREATE INDEX IX_DrawingRequests_ManagerUserID_StatusID
            ON dbo.DrawingRequests (ManagerUserID, StatusID);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.DrawingRequests')
          AND name = N'IX_DrawingRequests_AssignedDrawingExpertID_StatusID'
    )
    BEGIN
        CREATE INDEX IX_DrawingRequests_AssignedDrawingExpertID_StatusID
            ON dbo.DrawingRequests (AssignedDrawingExpertID, StatusID);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.DrawingRequestAssignments')
          AND name = N'IX_DrawingRequestAssignments_RequestID'
    )
    BEGIN
        CREATE INDEX IX_DrawingRequestAssignments_RequestID
            ON dbo.DrawingRequestAssignments (RequestID);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.DrawingRequestAssignments')
          AND name = N'IX_DrawingRequestAssignments_Expert_Current'
    )
    BEGIN
        CREATE INDEX IX_DrawingRequestAssignments_Expert_Current
            ON dbo.DrawingRequestAssignments (DrawingExpertUserID, IsCurrent);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.DrawingRequestHistory')
          AND name = N'IX_DrawingRequestHistory_RequestID_CreatedAt'
    )
    BEGIN
        CREATE INDEX IX_DrawingRequestHistory_RequestID_CreatedAt
            ON dbo.DrawingRequestHistory (RequestID, CreatedAt);
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.Notifications')
          AND name = N'IX_Notifications_UserID_IsRead_CreatedAt'
    )
    BEGIN
        CREATE INDEX IX_Notifications_UserID_IsRead_CreatedAt
            ON dbo.Notifications (UserID, IsRead, CreatedAt);
    END;

    COMMIT TRANSACTION;

    PRINT 'table-v04 migration completed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
