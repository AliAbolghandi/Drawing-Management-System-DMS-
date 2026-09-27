# DMS — AI Project State / Handoff

Last updated: 2026-09-27
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

## Current Known Issue / Resolution
The Node color issue was caused by an authorization mismatch in the SRSC status endpoint.

Observed behavior:
- A user with FILE_VIEW could call /api/srsc-status, so a Node containing an SRSC PDF was detected and a Node containing both Danieli + SRSC PDFs became green.
- A user with only PDF_VIEW could open SRSC PDFs through /api/srsc-pdfs/:nodeId, but /api/srsc-status returned 403 because it incorrectly required FILE_VIEW. The frontend therefore treated SRSC as absent and a Node containing both PDFs appeared yellow (Danieli-only state).

Resolution:
- Changed backend/server.js route /api/srsc-status authorization from FILE_VIEW to PDF_VIEW.
- This matches the actual SRSC PDF access rule and preserves FILE_VIEW for non-PDF file/folder browsing.
- Commit: a2eaed9dd52995f90386ad77fbc6496aacd8ea37

Expected color matrix remains:
- Danieli only -> yellow
- SRSC only -> green
- Danieli + SRSC -> green
- Neither -> default


## Recent Node Detail Hierarchy
- Node Detail now displays the first three levels of the selected Node's real `ParentID` chain: Main Root, First Child, and Second Child.
- Display format is `NodeCode - NodeName`, for example `MIDA`, `GP0BV001 - Melt Shop`, and `GP 0BV0010111 - SCRAP BUCKET ASSEMBLY`.
- Backend endpoint added: `GET /api/node-hierarchy/:nodeId`, protected by `FILE_VIEW` permission. It walks `dbo.Nodes.ParentID` upward and returns the root-to-level-2 chain without adding or changing database columns.
- Frontend files changed: `frontend/index.html`, `frontend/js/script.js`.
- Backend file changed: `backend/server.js`.
- Code commits: `828b7b0144414c38f15ea2b96e008afb13ff7d44`, `470c939a127b0f640e6dd4493279fb12521d0039`, `adc1679986b155afac8f2c620a26fd57852a4f3f`.

## Recent SRSC Empty-Folder Cleanup / Node Color Fix
- SRSC status is now based on the presence of at least one real file anywhere under the four allowed top-level company folders: SLD, DOC, PIC, Catalog.
- Empty top-level SRSC folders are automatically removed when their entire subtree contains no files.
- Nested empty directories inside an SRSC folder do not count as content; if the top-level folder contains no files anywhere below it, the whole top-level folder is removed.
- Files in nested subfolders keep the corresponding top-level folder and keep the Node in SRSC/green status.
- Filesystem inspection/deletion errors are handled conservatively: the folder is kept and the status is treated as populated so an I/O/permission error cannot cause unintended deletion.
- The delete-file API immediately re-checks the four SRSC folders after a successful deletion and updates the Node SRSC cache, so removing the last file can immediately clear the green status.
- No database schema/API permission contract was changed.
- Code commit: b669d64944681fa8d85460f7c62711d18e25d9aa — Fix SRSC empty-folder cleanup and node color status

## Recent UI/RBAC Change — Viewer controls
- VIEWER (RoleID 4 / RoleCode VIEWER) must not see node/file editing controls.
- Updated frontend/index.html to load /api/auth/me permissions and hide:
  - Edit Node button (#createNewNodeBtn) unless NODE_EDIT/NODE_CREATE/NODE_DELETE is granted.
  - Upload Files button (#uploadFilesBtn) unless FILE_Edit is granted.
  - Delete Files button (#DeleteFilesBtn) unless FILE_Edit is granted.
  - Dynamic per-node + / Edit / Delete controls (.node-edit-actions) for users without node edit permissions.
- Visibility is permission-based rather than hardcoded to RoleID 4, so it follows the existing RBAC model and also protects other read-only roles.
- Backend authorization remains authoritative; UI hiding does not replace requirePermission checks.
- Commit: bb5cd53478227a4fbce4f0b9e3711bf23923061a

## Recent Node Create/Edit Fix
- Fixed Node creation/edit authentication failure caused by direct fetch() calls in frontend/js/node-create.js not sending the DMS session cookie. Node POST and PUT requests now use credentials: 'include'.
- Node deletion in frontend/js/node-actions.js now also sends the authenticated session cookie explicitly.
- In Edit Node mode, root Nodes such as MIDA and REBAR now show an explicit + Add Child Node action directly below the root row. This allows the first child to be added even when the normal tree expand control is disabled because the root currently has no children.
- Optional Node fields JET_Position, Norme, and Mass are normalized so an empty value is stored as SQL NULL rather than a generated/default value. NodeCode and NodeName remain required.
- The Node Active checkbox was redesigned as a themed toggle using the existing DMS color variables.
- Files changed: backend/server.js, frontend/js/node-create.js, frontend/js/node-actions.js, frontend/index.html, frontend/css/node-create.css, frontend/css/node-actions.css.
- Code commit: 726b157afa5ecebb810fab69d41a8a218ea9c24b — Fix Node creation auth, root child add, and blank fields.
- No database schema was changed.

## Node Create/Edit Rework — 2026-09-27
- Reworked the actual Node create/edit implementation on main after verifying that the previous attempted change was not present in the live file contents.
- `frontend/js/node-create.js`: Node create `POST` and edit `PUT` now send the DMS session cookie with `credentials: 'include'`.
- `frontend/js/node-actions.js`: Node delete also sends credentials. In Edit Node mode, root Nodes marked by the existing `root` tree class (including MIDA/REBAR) receive a separate `+ Add Child Node` row directly below the root. The action uses the existing `openCreateChildModal` flow, so the created Node receives that root as `ParentID`.
- `backend/server.js`: empty optional values for `JET_Position`, `Norme`, and `Mass` are normalized to SQL `NULL` on create and edit. `NodeCode` and `NodeName` remain required. No database schema was changed.
- `frontend/index.html`, `frontend/css/node-create.css`: Active checkbox redesigned as a themed toggle using existing DMS variables.
- `frontend/css/node-actions.css`: added styling for the root `+ Add Child Node` row.
- Individual code commits: `780d683d89c6f5ed1e7ff0c860eecbb1a7aa6ce8`, `8b7df76380065fe5e1c1186f9497bcbfccb399af`, `b96c19f6a2bf070b748c99b8039465c88e4cc696`, `cc5118699d9f9549ced685dc215f863afcd209e0`, `e6b487d2070b4ba88859d7c6768c46ff43995773`, `3c4848b4afef13fb2573ab9d1610f8510bc75026`.
- Verification performed: fetched each changed file again from `main` and confirmed the expected changes are present. Runtime SQL Server/UI testing has not yet been performed.

## Recent Commit History
- a2eaed9dd52995f90386ad77fbc6496aacd8ea37 — Fix SRSC node color status permission (use PDF_VIEW for /api/srsc-status)
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

1. Restart `backend/server.js` so the current server.js is loaded.
2. Login, click `Edit Node`, and verify MIDA and REBAR show `+ Add Child Node` directly below each root.
3. Create a child under each root and verify the saved `ParentID` points to the selected root.
4. Edit a Node, clear `JET_Position`, `Norme`, and `Mass`, save, and verify SQL values are `NULL`.
5. Verify Node create/edit no longer returns HTTP 401 and confirm the request carries the authenticated session cookie in browser Network headers.
6. Verify Active toggle and both Active/Inactive saves.
7. Run `node --check backend/server.js`, `node --check frontend/js/node-create.js`, and `node --check frontend/js/node-actions.js` in the pilot environment, then perform the real SQL Server/UI regression test.
