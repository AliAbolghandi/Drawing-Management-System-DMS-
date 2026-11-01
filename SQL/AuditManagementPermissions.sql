SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'LOG_ACCESS_FILE')
    INSERT INTO dbo.Permissions (PermissionCode, PermissionName, Description, IsActive)
    VALUES (N'LOG_ACCESS_FILE', N'Audit File Events', N'View file upload, replacement, view, download and deletion audit events.', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'LOG_ACCESS_NODE')
    INSERT INTO dbo.Permissions (PermissionCode, PermissionName, Description, IsActive)
    VALUES (N'LOG_ACCESS_NODE', N'Audit Node Events', N'View node creation, update, activation, deactivation and deletion audit events.', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'LOG_ACCESS_WORKFLOW')
    INSERT INTO dbo.Permissions (PermissionCode, PermissionName, Description, IsActive)
    VALUES (N'LOG_ACCESS_WORKFLOW', N'Audit Workflow Events', N'View drawing request and workflow transition audit events.', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'LOG_ACCESS_USER_RBAC')
    INSERT INTO dbo.Permissions (PermissionCode, PermissionName, Description, IsActive)
    VALUES (N'LOG_ACCESS_USER_RBAC', N'Audit User and RBAC Events', N'View user, role, permission assignment and administrative access-control audit events.', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'LOG_ACCESS_AUTHENTICATION')
    INSERT INTO dbo.Permissions (PermissionCode, PermissionName, Description, IsActive)
    VALUES (N'LOG_ACCESS_AUTHENTICATION', N'Audit Authentication Events', N'View successful and failed sign-in and sign-out audit events.', 1);

COMMIT TRANSACTION;

SELECT PermissionID, PermissionCode, PermissionName, IsActive
FROM dbo.Permissions
WHERE PermissionCode IN (
    N'LOG_ACCESS_FILE',
    N'LOG_ACCESS_NODE',
    N'LOG_ACCESS_WORKFLOW',
    N'LOG_ACCESS_USER_RBAC',
    N'LOG_ACCESS_AUTHENTICATION'
)
ORDER BY PermissionCode;
