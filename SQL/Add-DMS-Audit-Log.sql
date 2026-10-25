/*
  DMS Audit Log extension
  Purpose: preserve the existing dbo.Logs audit trail while adding enough
  target/context data to trace files, workflow transitions, permissions and
  security events.

  Safe to run repeatedly.
*/

IF COL_LENGTH('dbo.Logs', 'TargetType') IS NULL
BEGIN
    ALTER TABLE dbo.Logs ADD TargetType nvarchar(50) NULL;
END;

IF COL_LENGTH('dbo.Logs', 'TargetID') IS NULL
BEGIN
    ALTER TABLE dbo.Logs ADD TargetID nvarchar(100) NULL;
END;

IF COL_LENGTH('dbo.Logs', 'DetailsJson') IS NULL
BEGIN
    ALTER TABLE dbo.Logs ADD DetailsJson nvarchar(max) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_Logs_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.Logs')
)
BEGIN
    CREATE INDEX IX_Logs_CreatedAt ON dbo.Logs(CreatedAt DESC, LogID DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_Logs_UserID_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.Logs')
)
BEGIN
    CREATE INDEX IX_Logs_UserID_CreatedAt ON dbo.Logs(UserID, CreatedAt DESC, LogID DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_Logs_Action_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.Logs')
)
BEGIN
    CREATE INDEX IX_Logs_Action_CreatedAt ON dbo.Logs(Action, CreatedAt DESC, LogID DESC);
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_Logs_Target_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.Logs')
)
BEGIN
    CREATE INDEX IX_Logs_Target_CreatedAt ON dbo.Logs(TargetType, TargetID, CreatedAt DESC, LogID DESC);
END;
GO

/*
  Recommended action taxonomy used by the application:

  Authentication:
    LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, SESSION_EXPIRED

  User / RBAC:
    USER_CREATED, USER_UPDATED, USER_DISABLED, USER_ENABLED,
    USER_ROLE_ADDED, USER_ROLE_REMOVED,
    ROLE_CREATED, ROLE_UPDATED, ROLE_DISABLED, ROLE_ENABLED,
    PERMISSION_CREATED, PERMISSION_UPDATED, PERMISSION_DISABLED,
    PERMISSION_ENABLED, ROLE_PERMISSION_ADDED, ROLE_PERMISSION_REMOVED

  Nodes:
    NODE_CREATED, NODE_UPDATED, NODE_DISABLED, NODE_ENABLED, NODE_DELETED

  Files:
    FILE_UPLOAD, FILE_DELETE, FILE_REPLACE, FILE_RENAME, FILE_MOVE,
    FOLDER_CREATE, FOLDER_DELETE, FILE_VIEW, FILE_DOWNLOAD

  Workflow:
    REQUEST_CREATED, WORKFLOW_STATUS_CHANGED, WORKFLOW_APPROVED,
    WORKFLOW_REJECTED, WORKFLOW_RETURNED, WORKFLOW_ASSIGNED,
    WORKFLOW_TRANSFERRED, WORKFLOW_ACCEPTED, WORKFLOW_COMPLETED,
    WORKFLOW_CANCELLED

  Security / system:
    AUTHORIZATION_DENIED, CSRF_REJECTED, RATE_LIMITED, SECURITY_ERROR,
    DATABASE_ERROR, FILESYSTEM_ERROR

  DetailsJson must never contain passwords, password hashes, session tokens,
  cookies, CSRF tokens or other credentials/secrets.
*/
