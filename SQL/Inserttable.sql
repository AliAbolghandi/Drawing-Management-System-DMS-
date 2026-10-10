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
        (PermissionCode, PermissionName, [Description], IsActive)
    SELECT v.PermissionCode, v.PermissionName, v.[Description], 1
    FROM (VALUES
        (N'REQUEST_DRAWING_CREATE',             N'Create Drawing Request',              N'Create a drawing request.'),
        (N'REQUEST_DRAWING_VIEW_OWN',          N'View Own Drawing Requests',            N'View drawing requests created by the current user.'),
        (N'REQUEST_DRAWING_VIEW_MANAGER',      N'View Manager Requests',                N'View drawing requests assigned to the current manager for approval.'),
        (N'REQUEST_DRAWING_APPROVE',           N'Approve Drawing Request',              N'Approve a drawing request at the Manager approval stage.'),
        (N'REQUEST_DRAWING_REJECT',            N'Reject Drawing Request',               N'Reject a drawing request at the Manager approval stage.'),
        (N'REQUEST_DRAWING_VIEW_ALL',          N'View All Drawing Requests',             N'View all drawing requests permitted by the workflow.'),
        (N'REQUEST_DRAWING_ASSIGN',            N'Assign Drawing Request',               N'Assign an approved drawing request to a DrawingExpert.'),
        (N'REQUEST_DRAWING_VIEW_ASSIGNED',     N'View Assigned Drawing Requests',       N'View drawing requests assigned to the current DrawingExpert.'),
        (N'REQUEST_DRAWING_ACCEPT',            N'Accept Drawing Request',               N'DrawingExpert can accept an assigned request.'),
        (N'REQUEST_DRAWING_TRANSFER',          N'Transfer Drawing Request',             N'DrawingExpert can transfer a request to another DrawingExpert.'),
        (N'REQUEST_DRAWING_EXPERT_REJECT',     N'Expert Reject Drawing Request',        N'DrawingExpert can reject an assigned request.'),
        (N'REQUEST_DRAWING_COMPLETE',          N'Complete Drawing Request',             N'DrawingExpert can mark the assigned work as completed.'),
        (N'REQUEST_DRAWING_RETURN_CORRECTION', N'Return Drawing Request for Correction', N'An authorized user can return the request for correction.'),
        (N'REQUEST_DRAWING_FINAL_APPROVE',     N'Final Approve Drawing Request',        N'Admin/DrawingSupervisor can give final approval.'),
        (N'REQUEST_DRAWING_FINAL_REJECT',      N'Final Reject Drawing Request',         N'Admin/DrawingSupervisor can reject final approval.'),
        (N'REQUEST_DRAWING_CANCEL',              N'Cancel Own Drawing Request',              N'Requester may cancel their own non-final drawing request.')
    ) AS v(PermissionCode, PermissionName, [Description])
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
    /* ============================================================
       3. table-v04 RolePermissions mapping
          Authorization uses PermissionCode resolved through RoleCode.
          RoleID and PermissionID are database keys, not hard-coded
          authorization identifiers.
          Existing mappings are preserved; only missing mappings are added.
       ============================================================ */
    INSERT INTO dbo.RolePermissions (RoleID, PermissionID)
    SELECT r.RoleID, p.PermissionID
    FROM (VALUES
        (N'Admin',N'NODE_VIEW'),
        (N'Admin',N'NODE_CREATE'),
        (N'Admin',N'NODE_EDIT'),
        (N'Admin',N'NODE_DELETE'),
        (N'Admin',N'PDF_VIEW'),
        (N'Admin',N'PDF_Danieli_Download'),
        (N'Admin',N'PDF_SRSC_Download'),
        (N'Admin',N'PDF_Approve'),
        (N'Admin',N'FILE_VIEW'),
        (N'Admin',N'FILE_Edit'),
        (N'Admin',N'USER_VIEW'),
        (N'Admin',N'USER_Manager'),
        (N'Admin',N'ROLE_MANAGE'),
        (N'Admin',N'AUDIT_VIEW'),
        (N'Admin',N'REQUEST_DRAWING_CREATE'),
        (N'Admin',N'REQUEST_DRAWING_VIEW_OWN'),
        (N'Admin',N'REQUEST_DRAWING_VIEW_MANAGER'),
        (N'Admin',N'REQUEST_DRAWING_APPROVE'),
        (N'Admin',N'REQUEST_DRAWING_REJECT'),
        (N'Admin',N'REQUEST_DRAWING_VIEW_ALL'),
        (N'Admin',N'REQUEST_DRAWING_ASSIGN'),
        (N'Admin',N'REQUEST_DRAWING_VIEW_ASSIGNED'),
        (N'Admin',N'REQUEST_DRAWING_ACCEPT'),
        (N'Admin',N'REQUEST_DRAWING_TRANSFER'),
        (N'Admin',N'REQUEST_DRAWING_EXPERT_REJECT'),
        (N'Admin',N'REQUEST_DRAWING_COMPLETE'),
        (N'Admin',N'REQUEST_DRAWING_RETURN_CORRECTION'),
        (N'Admin',N'REQUEST_DRAWING_FINAL_APPROVE'),
        (N'Admin',N'REQUEST_DRAWING_FINAL_REJECT'),
        (N'DrawingSupervisor',N'NODE_VIEW'),
        (N'DrawingSupervisor',N'NODE_CREATE'),
        (N'DrawingSupervisor',N'NODE_EDIT'),
        (N'DrawingSupervisor',N'NODE_DELETE'),
        (N'DrawingSupervisor',N'PDF_VIEW'),
        (N'DrawingSupervisor',N'PDF_Danieli_Download'),
        (N'DrawingSupervisor',N'PDF_SRSC_Download'),
        (N'DrawingSupervisor',N'PDF_Approve'),
        (N'DrawingSupervisor',N'FILE_VIEW'),
        (N'DrawingSupervisor',N'FILE_Edit'),
        (N'DrawingSupervisor',N'USER_VIEW'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_CREATE'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_VIEW_OWN'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_VIEW_MANAGER'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_APPROVE'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_REJECT'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_VIEW_ALL'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_ASSIGN'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_VIEW_ASSIGNED'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_RETURN_CORRECTION'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_FINAL_APPROVE'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_FINAL_REJECT'),
        (N'DrawingExpert',N'NODE_VIEW'),
        (N'DrawingExpert',N'NODE_CREATE'),
        (N'DrawingExpert',N'NODE_EDIT'),
        (N'DrawingExpert',N'NODE_DELETE'),
        (N'DrawingExpert',N'PDF_VIEW'),
        (N'DrawingExpert',N'PDF_Danieli_Download'),
        (N'DrawingExpert',N'PDF_SRSC_Download'),
        (N'DrawingExpert',N'PDF_Approve'),
        (N'DrawingExpert',N'FILE_VIEW'),
        (N'DrawingExpert',N'FILE_Edit'),
        (N'DrawingExpert',N'REQUEST_DRAWING_CREATE'),
        (N'DrawingExpert',N'REQUEST_DRAWING_VIEW_OWN'),
        (N'DrawingExpert',N'REQUEST_DRAWING_VIEW_ALL'),
        (N'DrawingExpert',N'REQUEST_DRAWING_VIEW_ASSIGNED'),
        (N'DrawingExpert',N'REQUEST_DRAWING_ACCEPT'),
        (N'DrawingExpert',N'REQUEST_DRAWING_TRANSFER'),
        (N'DrawingExpert',N'REQUEST_DRAWING_EXPERT_REJECT'),
        (N'DrawingExpert',N'REQUEST_DRAWING_COMPLETE'),
        (N'DrawingExpert',N'REQUEST_DRAWING_RETURN_CORRECTION'),
        (N'VIEWER',N'NODE_VIEW'),
        (N'VIEWER',N'PDF_VIEW'),
        (N'VIEWER',N'PDF_Danieli_Download'),
        (N'VIEWER',N'REQUEST_DRAWING_CREATE'),
        (N'VIEWER',N'REQUEST_DRAWING_VIEW_OWN'),
        (N'Admin',N'REQUEST_DRAWING_CANCEL'),
        (N'DrawingSupervisor',N'REQUEST_DRAWING_CANCEL'),
        (N'DrawingExpert',N'REQUEST_DRAWING_CANCEL'),
        (N'VIEWER',N'REQUEST_DRAWING_CANCEL'),
        (N'Manager',N'REQUEST_DRAWING_CANCEL'),
        (N'Manager',N'NODE_VIEW'),
        (N'Manager',N'PDF_VIEW'),
        (N'Manager',N'PDF_Danieli_Download'),
        (N'Manager',N'REQUEST_DRAWING_CREATE'),
        (N'Manager',N'REQUEST_DRAWING_VIEW_OWN'),
        (N'Manager',N'REQUEST_DRAWING_VIEW_MANAGER'),
        (N'Manager',N'REQUEST_DRAWING_APPROVE'),
        (N'Manager',N'REQUEST_DRAWING_REJECT')
    ) AS rp(RoleCode, PermissionCode)
    INNER JOIN dbo.Roles r
        ON r.RoleCode = rp.RoleCode
       AND r.IsActive = 1
    INNER JOIN dbo.Permissions p
        ON p.PermissionCode = rp.PermissionCode
       AND p.IsActive = 1
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.RolePermissions x
        WHERE x.RoleID = r.RoleID
          AND x.PermissionID = p.PermissionID
    );

    /* ============================================================
       4. Align table-v04 UserRoles data
          Tables-v02: UserID 7 = VIEWER (RoleID 4)
          Tables-v04: UserID 7 = Manager (RoleID 5)
       ============================================================ */
    DECLARE @ViewerRoleID int = (
        SELECT TOP 1 RoleID FROM dbo.Roles WHERE RoleCode = N'VIEWER' AND IsActive = 1
    );
    DECLARE @ManagerRoleID int = (
        SELECT TOP 1 RoleID FROM dbo.Roles WHERE RoleCode = N'Manager' AND IsActive = 1
    );

    IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserID = 7)
       AND @ViewerRoleID IS NOT NULL
       AND @ManagerRoleID IS NOT NULL
       AND EXISTS (
            SELECT 1 FROM dbo.UserRoles
            WHERE UserID = 7 AND RoleID = @ViewerRoleID
       )
       AND NOT EXISTS (
            SELECT 1 FROM dbo.UserRoles
            WHERE UserID = 7 AND RoleID = @ManagerRoleID
       )
    BEGIN
        UPDATE dbo.UserRoles
        SET RoleID = @ManagerRoleID
        WHERE UserID = 7
          AND RoleID = @ViewerRoleID;
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
