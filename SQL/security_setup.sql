USE [dbDrawingManagment];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*
  DMS security/RBAC deployment script
  - Safe to run repeatedly.
  - Preserves existing user IDs and role/permission IDs.
  - Removes orphan RolePermissions.
  - Uses only the four defined roles: Admin, DrawingSupervisor, DrawingExpert, VIEWER.
  - Existing blank IsActive values are treated as inactive by the application.
*/

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users
    (
        UserID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
        Username NVARCHAR(100) NOT NULL,
        Name NVARCHAR(100) NULL,
        Family NVARCHAR(100) NULL,
        PasswordHash NVARCHAR(500) NULL,
        IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT (0),
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NULL,
        LastLoginAt DATETIME2(0) NULL
    );
END;

IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Roles
    (
        RoleID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Roles PRIMARY KEY,
        RoleCode NVARCHAR(100) NOT NULL,
        RoleName NVARCHAR(150) NOT NULL,
        Description NVARCHAR(500) NULL,
        IsActive BIT NOT NULL CONSTRAINT DF_Roles_IsActive DEFAULT (1)
    );
END;

IF OBJECT_ID(N'dbo.Permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Permissions
    (
        PermissionID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Permissions PRIMARY KEY,
        PermissionCode NVARCHAR(100) NOT NULL,
        PermissionName NVARCHAR(150) NOT NULL,
        Description NVARCHAR(500) NULL,
        IsActive BIT NOT NULL CONSTRAINT DF_Permissions_IsActive DEFAULT (1)
    );
END;

IF OBJECT_ID(N'dbo.UserManager', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserManager
    (
        UserManagerID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserManager PRIMARY KEY,
        ManagerID INT NOT NULL,
        UserID INT NOT NULL
    );
END;

IF OBJECT_ID(N'dbo.UserRoles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserRoles
    (
        UserRoleID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_UserRoles PRIMARY KEY,
        UserID INT NOT NULL,
        RoleID INT NOT NULL
    );
END;

IF OBJECT_ID(N'dbo.RolePermissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RolePermissions
    (
        RolePermissionID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_RolePermissions PRIMARY KEY,
        RoleID INT NOT NULL,
        PermissionID INT NOT NULL
    );
END;

IF OBJECT_ID(N'dbo.Logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Logs
    (
        LogID BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Logs PRIMARY KEY,
        UserID INT NULL,
        UserName NVARCHAR(100) NULL,
        Action NVARCHAR(100) NOT NULL,
        IPAddress NVARCHAR(64) NULL,
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Logs_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END;

IF COL_LENGTH(N'dbo.Users', N'PasswordHash') IS NULL
    ALTER TABLE dbo.Users ADD PasswordHash NVARCHAR(500) NULL;

IF COL_LENGTH(N'dbo.Users', N'LastLoginAt') IS NULL
    ALTER TABLE dbo.Users ADD LastLoginAt DATETIME2(0) NULL;

IF COL_LENGTH(N'dbo.Users', N'UpdatedAt') IS NULL
    ALTER TABLE dbo.Users ADD UpdatedAt DATETIME2(0) NULL;

IF COL_LENGTH(N'dbo.Users', N'IsActive') IS NULL
    ALTER TABLE dbo.Users ADD IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive_Added DEFAULT (0) WITH VALUES;

IF COL_LENGTH(N'dbo.Logs', N'UserName') IS NULL
    ALTER TABLE dbo.Logs ADD UserName NVARCHAR(100) NULL;

IF COL_LENGTH(N'dbo.Logs', N'Action') IS NULL
    ALTER TABLE dbo.Logs ADD Action NVARCHAR(100) NULL;

IF COL_LENGTH(N'dbo.Logs', N'IPAddress') IS NULL
    ALTER TABLE dbo.Logs ADD IPAddress NVARCHAR(64) NULL;

IF COL_LENGTH(N'dbo.Logs', N'CreatedAt') IS NULL
    ALTER TABLE dbo.Logs ADD CreatedAt DATETIME2(0) NULL;

/*
  If Logs.LogID already exists but is not IDENTITY, this script does not silently
  rebuild a live audit table. The verification query at the end will report it.
*/

-- Remove broken/orphaned RBAC links from older Excel imports.
DELETE rp
FROM dbo.RolePermissions rp
WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleID = rp.RoleID)
   OR NOT EXISTS (SELECT 1 FROM dbo.Permissions p WHERE p.PermissionID = rp.PermissionID);

-- Roles: exactly the four roles currently defined by tblUser.xlsx.
IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleCode = N'Admin')
    INSERT dbo.Roles (RoleCode, RoleName, Description, IsActive)
    VALUES (N'Admin', N'Super Administrator', N'Full system administration', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleCode = N'DrawingSupervisor')
    INSERT dbo.Roles (RoleCode, RoleName, Description, IsActive)
    VALUES (N'DrawingSupervisor', N'Administrator', N'Manage users, roles and system data', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleCode = N'DrawingExpert')
    INSERT dbo.Roles (RoleCode, RoleName, Description, IsActive)
    VALUES (N'DrawingExpert', N'Engineer', N'View and manage assigned engineering files', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE RoleCode = N'VIEWER')
    INSERT dbo.Roles (RoleCode, RoleName, Description, IsActive)
    VALUES (N'VIEWER', N'Viewer', N'Read-only access to assigned data', 1);

-- Permissions.
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'NODE_VIEW')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'NODE_VIEW', N'View Nodes', N'View the node tree', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'NODE_CREATE')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'NODE_CREATE', N'Create Node', N'Create a new node', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'NODE_EDIT')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'NODE_EDIT', N'Edit Node', N'Edit an existing node', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'NODE_DELETE')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'NODE_DELETE', N'Delete Node', N'Delete a node', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'PDF_VIEW')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'PDF_VIEW', N'View PDF', N'View Danieli PDF records/files', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'PDF_Danieli_Download')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'PDF_Danieli_Download', N'Download Danieli PDF', N'Download Danieli PDF files', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'PDF_SRSC_Download')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'PDF_SRSC_Download', N'Download SRSC', N'Download SRSC/company files', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'PDF_Approve')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'PDF_Approve', N'Approve PDF', N'Approve drawing files', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'FILE_VIEW')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'FILE_VIEW', N'View Files', N'Browse company files', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'FILE_Edit')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'FILE_Edit', N'Edit Files', N'Create/upload/delete company files and folders', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'USER_VIEW')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'USER_VIEW', N'View Users', N'View users', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'USER_Manager')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'USER_Manager', N'Manage Users', N'Create/edit/deactivate users', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'ROLE_MANAGE')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'ROLE_MANAGE', N'Manage Roles', N'Manage roles and role permissions', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Permissions WHERE PermissionCode = N'AUDIT_VIEW')
    INSERT dbo.Permissions (PermissionCode, PermissionName, Description, IsActive) VALUES (N'AUDIT_VIEW', N'View Audit Logs', N'View security/audit logs', 1);

-- Users from tblUser.xlsx. Existing rows are matched by Username.
-- Blank IsActive values in the workbook are intentionally treated as 0.
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'ali.abolghandi')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'ali.abolghandi', N'ali', N'abolghandi', NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'mohsen.naghdinejadian')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'mohsen.naghdinejadian', N'mohsen', N'naghdi nejadian', NULL, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'morteza.golsoltani')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'morteza.golsoltani', N'morteza', N'golsoltani', NULL, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'hamed.rouzitalab')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'hamed.rouzitalab', N'hamed', N'rouzi talab', NULL, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'ehsan.vahidian')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'ehsan.vahidian', N'ehsan.', N'vahidian', NULL, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'reza.sharafi')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'reza.sharafi', N'reza', N'sharafi', NULL, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'mahmud.zaker')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'mahmud.zaker', N'mahmud', N'zaker', NULL, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'mehran.shahhoseini')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'mehran.shahhoseini', N'mehran', N'shahhoseini', NULL, 0);
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'bahamn.fakouri')
    INSERT dbo.Users (Username, Name, Family, PasswordHash, IsActive) VALUES (N'bahamn.fakouri', N'bahamn', N'fakouri', NULL, 0);

-- UserManager, matched by usernames instead of hard-coded UserIDs.
DECLARE @UserManager TABLE (ManagerUsername NVARCHAR(100), UserUsername NVARCHAR(100));
INSERT @UserManager VALUES
(N'ali.abolghandi',N'ali.abolghandi'),
(N'ali.abolghandi',N'mohsen.naghdinejadian'),
(N'mohsen.naghdinejadian',N'morteza.golsoltani'),
(N'mohsen.naghdinejadian',N'hamed.rouzitalab'),
(N'mohsen.naghdinejadian',N'ehsan.vahidian'),
(N'reza.sharafi',N'reza.sharafi'),
(N'reza.sharafi',N'mahmud.zaker');

INSERT dbo.UserManager (ManagerID, UserID)
SELECT m.UserID, u.UserID
FROM @UserManager x
JOIN dbo.Users m ON m.Username=x.ManagerUsername
JOIN dbo.Users u ON u.Username=x.UserUsername
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.UserManager um WHERE um.ManagerID=m.UserID AND um.UserID=u.UserID
);

-- UserRoles from tblUser.xlsx, matched by username/role code.
DECLARE @UserRoleSeed TABLE (Username NVARCHAR(100), RoleCode NVARCHAR(100));
INSERT @UserRoleSeed VALUES
(N'ali.abolghandi',N'Admin'),
(N'mohsen.naghdinejadian',N'DrawingSupervisor'),
(N'morteza.golsoltani',N'DrawingExpert'),
(N'hamed.rouzitalab',N'DrawingExpert'),
(N'ehsan.vahidian',N'DrawingExpert'),
(N'reza.sharafi',N'DrawingExpert'),
(N'mahmud.zaker',N'VIEWER'),
(N'mehran.shahhoseini',N'VIEWER'),
(N'bahamn.fakouri',N'VIEWER');

INSERT dbo.UserRoles (UserID, RoleID)
SELECT u.UserID, r.RoleID
FROM @UserRoleSeed s
JOIN dbo.Users u ON u.Username=s.Username
JOIN dbo.Roles r ON r.RoleCode=s.RoleCode
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.UserRoles ur WHERE ur.UserID=u.UserID AND ur.RoleID=r.RoleID
);

-- Correct RolePermissions.
-- Role 1 Admin: all 14 permissions.
-- Role 2 DrawingSupervisor: permissions 1-11.
-- Role 3 DrawingExpert: permissions 1-10.
-- Role 4 VIEWER: permissions 1-10, matching the corrected four-role workbook.
DECLARE @RolePermissionSeed TABLE (RoleCode NVARCHAR(100), PermissionCode NVARCHAR(100));
INSERT @RolePermissionSeed
SELECT N'Admin', PermissionCode FROM dbo.Permissions
WHERE PermissionCode IN (N'NODE_VIEW',N'NODE_CREATE',N'NODE_EDIT',N'NODE_DELETE',N'PDF_VIEW',N'PDF_Danieli_Download',N'PDF_SRSC_Download',N'PDF_Approve',N'FILE_VIEW',N'FILE_Edit',N'USER_VIEW',N'USER_Manager',N'ROLE_MANAGE',N'AUDIT_VIEW')
UNION ALL
SELECT N'DrawingSupervisor', PermissionCode FROM dbo.Permissions
WHERE PermissionCode IN (N'NODE_VIEW',N'NODE_CREATE',N'NODE_EDIT',N'NODE_DELETE',N'PDF_VIEW',N'PDF_Danieli_Download',N'PDF_SRSC_Download',N'PDF_Approve',N'FILE_VIEW',N'FILE_Edit',N'USER_VIEW')
UNION ALL
SELECT N'DrawingExpert', PermissionCode FROM dbo.Permissions
WHERE PermissionCode IN (N'NODE_VIEW',N'NODE_CREATE',N'NODE_EDIT',N'NODE_DELETE',N'PDF_VIEW',N'PDF_Danieli_Download',N'PDF_SRSC_Download',N'FILE_VIEW',N'FILE_Edit',N'USER_VIEW')
UNION ALL
SELECT N'VIEWER', PermissionCode FROM dbo.Permissions
WHERE PermissionCode IN (N'NODE_VIEW',N'NODE_CREATE',N'NODE_EDIT',N'NODE_DELETE',N'PDF_VIEW',N'PDF_Danieli_Download',N'PDF_SRSC_Download',N'FILE_VIEW',N'FILE_Edit',N'USER_VIEW');

INSERT dbo.RolePermissions (RoleID, PermissionID)
SELECT r.RoleID, p.PermissionID
FROM @RolePermissionSeed s
JOIN dbo.Roles r ON r.RoleCode=s.RoleCode
JOIN dbo.Permissions p ON p.PermissionCode=s.PermissionCode
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.RolePermissions rp WHERE rp.RoleID=r.RoleID AND rp.PermissionID=p.PermissionID
);

-- Remove any orphan links left by old Excel imports.
DELETE rp
FROM dbo.RolePermissions rp
WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleID=rp.RoleID)
   OR NOT EXISTS (SELECT 1 FROM dbo.Permissions p WHERE p.PermissionID=rp.PermissionID);

-- Helpful indexes. Each block is safe to run repeatedly.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_Users_Username' AND object_id=OBJECT_ID(N'dbo.Users'))
    CREATE UNIQUE INDEX UX_Users_Username ON dbo.Users(Username);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_Roles_RoleCode' AND object_id=OBJECT_ID(N'dbo.Roles'))
    CREATE UNIQUE INDEX UX_Roles_RoleCode ON dbo.Roles(RoleCode);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_Permissions_PermissionCode' AND object_id=OBJECT_ID(N'dbo.Permissions'))
    CREATE UNIQUE INDEX UX_Permissions_PermissionCode ON dbo.Permissions(PermissionCode);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_UserRoles_User_Role' AND object_id=OBJECT_ID(N'dbo.UserRoles'))
    CREATE UNIQUE INDEX UX_UserRoles_User_Role ON dbo.UserRoles(UserID,RoleID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_RolePermissions_Role_Permission' AND object_id=OBJECT_ID(N'dbo.RolePermissions'))
    CREATE UNIQUE INDEX UX_RolePermissions_Role_Permission ON dbo.RolePermissions(RoleID,PermissionID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_UserManager_UserID' AND object_id=OBJECT_ID(N'dbo.UserManager'))
    CREATE INDEX IX_UserManager_UserID ON dbo.UserManager(UserID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_UserRoles_RoleID' AND object_id=OBJECT_ID(N'dbo.UserRoles'))
    CREATE INDEX IX_UserRoles_RoleID ON dbo.UserRoles(RoleID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_RolePermissions_PermissionID' AND object_id=OBJECT_ID(N'dbo.RolePermissions'))
    CREATE INDEX IX_RolePermissions_PermissionID ON dbo.RolePermissions(PermissionID);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_Logs_UserID_CreatedAt' AND object_id=OBJECT_ID(N'dbo.Logs'))
    CREATE INDEX IX_Logs_UserID_CreatedAt ON dbo.Logs(UserID,CreatedAt);

COMMIT TRANSACTION;
GO

-- Verification.
SELECT RoleID, RoleCode, RoleName, IsActive
FROM dbo.Roles
ORDER BY RoleID;

SELECT UserID, Username, IsActive,
       CASE WHEN NULLIF(LTRIM(RTRIM(PasswordHash)),N'') IS NULL THEN 0 ELSE 1 END AS HasPasswordHash
FROM dbo.Users
ORDER BY UserID;

SELECT r.RoleCode, COUNT(*) AS PermissionCount
FROM dbo.RolePermissions rp
JOIN dbo.Roles r ON r.RoleID=rp.RoleID
JOIN dbo.Permissions p ON p.PermissionID=rp.PermissionID
GROUP BY r.RoleCode
ORDER BY r.RoleCode;

SELECT COUNT(*) AS OrphanRolePermissions
FROM dbo.RolePermissions rp
WHERE NOT EXISTS (SELECT 1 FROM dbo.Roles r WHERE r.RoleID=rp.RoleID)
   OR NOT EXISTS (SELECT 1 FROM dbo.Permissions p WHERE p.PermissionID=rp.PermissionID);

SELECT COLUMNPROPERTY(OBJECT_ID(N'dbo.Logs'),N'LogID','IsIdentity') AS Logs_LogID_IsIdentity;
GO
