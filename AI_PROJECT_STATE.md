# DMS — AI Project State / Handoff

Last updated: 2026-09-22
Repository: https://github.com/AliAbolghandi/Drawing-Management-System-DMS-
Default branch: main

## Purpose
This file is the living handoff document for AI assistants working on the Drawing Management System (DMS). Read it before continuing development and update it after significant changes.

## Current Architecture
- Frontend: HTML/CSS/JavaScript
- Backend: Node.js + Express
- Database: Microsoft SQL Server
- Backend database access uses SQL Server / Windows Trusted Connection configuration.
- Authentication/RBAC is implemented in backend/auth.js and integrated in backend/server.js.
- Frontend login: frontend/login.html
- Main UI: frontend/index.html
- Main frontend logic: frontend/js/script.js
- Upload logic: frontend/js/node-upload.js
- Security SQL setup: SQL/security_setup.sql
- Security documentation: SECURITY_CHANGELOG.md

## Important Database Tables
- dbo.Nodes
- dbo.DanieliPDF
- dbo.tblPath
- dbo.Users
- dbo.UserRoles
- dbo.Roles
- dbo.RolePermissions
- dbo.Permissions
- dbo.Logs

Nodes currently contains the established hierarchy fields:
NodeID, ParentID, NodeCode, NodeName, IsActive, CreatedAt, UpdatedAt, FolderPath, PathID, JET_Position, Norme, Mass

Do not change the established Nodes structure unless the user explicitly requests it.

## Node Hierarchy Rules
- ParentID defines the parent-child relationship.
- A blank ParentID identifies a root.
- Known roots include MIDA and REBAR.
- Folder naming convention: NodeCode-NodeName.

## Drawing Structure
Danieli drawing roots:
- "serveraddress"\Source Files\Mida\Mida Danieli Drawing
- "serveraddress"\Source Files\Rebar\Rebar Danieli Drawing

Company drawing folders:
- SLD
- DOC
- PIC
- Catalog

The UI currently has:
1. SRSC PDF Drawing
2. Danieli PDF Drawing

SRSC PDF files are read from PDFs directly inside the selected node's root SLD folder, not from nested folders.

## Authentication / Authorization
backend/auth.js currently provides:
- 8-hour in-memory sessions
- HttpOnly dms_session cookie
- SameSite=Lax
- Secure cookie in production
- scrypt password verification
- login attempt rate limiting
- API rate limiting
- CORS/origin controls
- security headers
- authentication middleware
- permission middleware
- CSRF guard
- audit logging to dbo.Logs

Important limitation:
Sessions and rate-limit state are in memory. Restarting the backend logs users out; multiple backend instances would need a shared session store.

## RBAC
Permission checks are performed by PermissionCode, not by hardcoded PermissionID.

Important permission:
- PermissionID = 5
- PermissionCode = PDF_VIEW
- Meaning: permission to view PDF drawings.

The intended permission chain is:
User -> UserRoles -> Roles -> RolePermissions -> Permissions(PermissionCode)

Current VIEWER role was corrected to read-only:
- NODE_VIEW
- PDF_VIEW
- PDF_Danieli_Download

Do not assume PermissionID alone grants access; the user's role-permission relationship must grant PDF_VIEW.

## Important API Routes
Authentication:
- /api/auth
- /api/auth/me
- /api/auth/logout

Nodes:
- /api/nodes
- /api/nodes/search
- /api/nodes/:nodeId

PDF:
- /api/pdfs
- /api/pdf-open/:pdfId
- /api/pdf-file/:pdfId
- /api/srsc-pdfs/:nodeId
- /api/node-file

Files:
- /api/node-folder
- /api/node-folders/:nodeId
- /api/node-folder-files/:nodeId/:folderName
- /api/node-file-upload/:nodeId

## PDF Permission Rules
- /api/pdfs requires PDF_VIEW.
- /api/pdf-open/:pdfId requires PDF_VIEW.
- /api/pdf-file/:pdfId requires PDF_VIEW.
- /api/srsc-pdfs/:nodeId requires PDF_VIEW.
- /api/node-file dynamically requires PDF_VIEW for .pdf files and FILE_VIEW for non-PDF files.
- /api/node-file-upload/:nodeId requires FILE_Edit.
- /api/node-folder and deletion operations require FILE_Edit where applicable.

Recent security fix:
Commit 251711a115cf8c0eedd6c16e4900f0f086ce299f
Message: Enforce PDF_VIEW for SRSC PDF viewing

## Recent Implemented Features
### User menu / logout
The authenticated user menu in index.html shows:
- Name
- Family
- Username
- Logout

Logout invalidates the server session and redirects to login.html.

Relevant commit:
07a26b6ef9202893b848bea3d707f5dc436dd0fe

### SRSC PDF Drawing
SRSC PDFs in the root SLD folder are displayed above Danieli PDF Drawing.

Relevant commits:
75eea78a87c3fd01549afe6f6599b49b41081274
7beb8c816169b58ab382c5212698e1faecfe1152
09705096203a0ed246bf4551e7feaf65ce67b16d
b6a28c4b352b483f7ad3cdf7b6387b26ceb93f07

### Upload authentication
XMLHttpRequest uploads now send the authentication cookie using withCredentials=true.

Relevant commit:
a8ecbf16e14fd4df20dd9093a9751987d8c2b3d2

## Recent UI Change
- Nodes that have both `has-pdf` (Danieli PDF) and `has-srsc` (SRSC status) now render the complete node text (`JET`, `NodeCode`, separator, and `NodeName`) in the green `--ok` color.
- CSS change committed in `frontend/css/style.css`.
- Commit: 6fa91fba7f025b811033e07b550e345109118439

## Current Known Issue
The user currently suspects a database/RBAC permission problem:
PermissionID=5 / PDF_VIEW is intended to allow users to see the PDFs in both:
- SRSC PDF Drawing
- Danieli PDF Drawing

Backend route protection has already been corrected to use PDF_VIEW for SRSC PDF listing and PDF access.

The next diagnostic step is to inspect the actual User -> Role -> RolePermissions -> Permissions rows for the affected username.

Diagnostic SQL:
SELECT
    u.UserID,
    u.Username,
    u.IsActive,
    r.RoleID,
    r.RoleCode,
    p.PermissionID,
    p.PermissionCode,
    p.PermissionName,
    p.IsActive AS PermissionIsActive
FROM dbo.Users u
LEFT JOIN dbo.UserRoles ur
    ON ur.UserID = u.UserID
LEFT JOIN dbo.Roles r
    ON r.RoleID = ur.RoleID
LEFT JOIN dbo.RolePermissions rp
    ON rp.RoleID = r.RoleID
LEFT JOIN dbo.Permissions p
    ON p.PermissionID = rp.PermissionID
WHERE u.Username = N'USERNAME_HERE'
ORDER BY r.RoleID, p.PermissionID;

## Recent Commit History
- 251711a115cf8c0eedd6c16e4900f0f086ce299f — Enforce PDF_VIEW for SRSC PDF viewing
- 07a26b6ef9202893b848bea3d707f5dc436dd0fe — Fix logout API scope and redirect after session invalidation
- b6a28c4b352b483f7ad3cdf7b6387b26ceb93f07 — Fix SRSC PDF open path
- 09705096203a0ed246bf4551e7feaf65ce67b16d — Show SRSC PDF Drawing above Danieli PDFs
- 7beb8c816169b58ab382c5212698e1faecfe1152 — Display SRSC PDF Drawing files above Danieli drawings
- 75eea78a87c3fd01549afe6f6599b49b41081274 — Add SRSC root SLD PDF API
- 99bee71b12ee7f0f4a78c50d1d42c755aeecd448 — Add authenticated user menu and logout
- a8ecbf16e14fd4df20dd9093a9751987d8c2b3d2 — Send session cookie with file uploads
- 3b0ed71f27a6edde90203855e4d27cd58af61905 — Document DMS security changes
- efbda4415e04adc92d0b7daabc6bf7e80012ac73 — Correct VIEWER role to read-only permissions
- 0e252b7a762268cc3cc8e7d585f397b2e986bc48 — Integrate modular authentication and RBAC security

## Important Constraints
- Do not change existing database structures without explicit user approval.
- Do not remove existing features while implementing new ones.
- Preserve API contracts where possible.
- Preserve established naming conventions and folder structures.
- Never store credentials, tokens, passwords, or secrets in this file or in GitHub.
- If a credential is exposed, recommend revocation/rotation.

## AI Continuity Rule
This file must be treated as a living technical memory of the project.
After every significant change:
1. Implement the change.
2. Test/syntax-check where possible.
3. Commit the code.
4. Update this file with the new state and commit.
5. Ensure NEXT ACTION is accurate.

Before the AI session approaches its usage/context limit, the AI must warn the user in Persian and update this file before stopping.

# NEXT ACTION

1. Verify in the UI that a Node with both a Danieli PDF and an SRSC PDF displays all Node text in green.
2. Confirm that Nodes with only Danieli PDF or only SRSC content keep their existing colors.
3. Continue diagnosing the PDF_VIEW permission issue if it is still present.
4. Inspect the affected user's UserRoles and RolePermissions records using the diagnostic SQL above.
5. If PDF_VIEW is present, inspect authentication/session permission loading in backend/auth.js.
6. If PDF_VIEW is absent, correct the database role-permission assignment according to the user's intended RBAC configuration.
