# DMS — AI Project State / Handoff

Last updated: 2026-09-28
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
- VIEWER must not see node/file editing controls unless the effective PermissionCode set grants them.
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

## Root Node Creation UI — 2026-09-27
- Replaced the previous root-level `+ Add Child Node` row with a single square `+` control placed after the last main root in the tree while `Edit Node` mode is active.
- The square `+` opens `Add Root Node`; it creates a new top-level Node rather than a child of MIDA/REBAR.
- `frontend/js/node-actions.js` now manages the single root-add control and calls `openCreateRootModal()`.
- `frontend/js/node-create.js` now supports `root` creation mode and sends `ParentID: null` to the existing Node creation API.
- `backend/server.js` now accepts `ParentID = NULL` for root creation while continuing to validate non-null parent IDs. Root `FolderPath` is generated from the new root's code/name. No database schema was changed.
- Removed the previous `root-add-row` / `+ Add Child Node` UI.
- Code commits: `2a25e6300da77d47aea53786c687608b58955d85`, `2c1518ae6b358834fb00df01af895e0b0cb1343c`, `1d8ef9c287b291b90f985c341150648a48fbf245`, `1adf31a96636bffa9f641f11d1f844c763d2d2e1`, `630fe95ab96eec3f682b1388d703bad40efe45de`, `fb3837950b9e841a03519d75f19391fe760d83f4`.
- Verification: the changed files were fetched again from `main`; the root creation flow and MutationObserver behavior were inspected. Runtime SQL Server/UI testing and `node --check` have not yet been performed.



## New Project Phase — Request-Based Drawing Access & Workflow — 2026-09-28
This is the next functional phase of DMS. The system is moving from direct PDF/file visibility toward controlled, request-based access for actions that require authorization or controlled processing.

### New Functional Goals
- A user must be able to submit a request for a **stamped PDF** associated with a selected Node instead of treating the currently visible PDF as automatically sufficient for every business action.
- A user must be able to submit a **request for an SRSC drawing** when the required drawing/action is not simply covered by normal viewing permission.
- Every drawing-related request must receive a **unique Request ID** and persist its business data in the database.
- A request must retain at least the selected Node/context, requester identity, request description/reason, current status, and relevant workflow timestamps/actors.
- The system must provide worklists appropriate to the user's responsibility:
  - Requester: view and track their own requests and statuses.
  - Manager: review requests requiring managerial approval and approve/reject them.
  - Admin / DrawingSupervisor: manage/assign approved or actionable requests to a DrawingExpert.
  - DrawingExpert: receive assigned drawing work and process the requested drawing action.
- The workflow must support **manager approval/rejection** before controlled drawing work proceeds where approval is required.
- Admin/DrawingSupervisor must be able to assign a request to a **DrawingExpert**.
- The system must provide notifications for important workflow transitions/assignments so responsible users can identify pending actions.
- Request authorization must be enforced in the backend through RBAC/PermissionCode checks. Frontend visibility alone is not an authorization boundary.
- The existing PDF viewing permissions and current SRSC/Danieli access behavior must remain intact unless a new request workflow explicitly governs a separate controlled action.
- Existing Node, PDF, file, authentication, and RBAC functionality must not be removed while this phase is implemented.
- API contracts and the established database structure must remain backward-compatible where possible. Any new database objects required for the request workflow must be additive and must not delete or structurally alter existing tables without explicit approval.

### Request Workflow Concept
1. User selects a Node and chooses the applicable request action, such as **Request Stamped PDF** or **Request SRSC Drawing**.
2. DMS creates a unique request record and captures the requester, Node, request type, description, and initial status.
3. If the request requires managerial approval, it enters the Manager worklist.
4. Manager approves or rejects the request; the decision and actor/time are persisted.
5. Approved actionable requests become available to Admin/DrawingSupervisor for assignment.
6. Admin/DrawingSupervisor assigns the request to a DrawingExpert.
7. DrawingExpert processes the assigned request and the request status progresses through the defined workflow.
8. Notifications are generated for relevant users when a request is created, approved/rejected, assigned, or otherwise requires action.
9. Request history must remain auditable; important state changes and assignments must not be silently overwritten.

### Planned / Proposed Request-Workflow Data Model
The request phase is expected to use additive tables based on the Tables-v02 design discussion:
- `DrawingRequests`
- `DrawingRequestStatuses`
- `DrawingRequestAssignments`
- `Notifications`

These tables are intended to support request persistence, status tracking, assignment history, and notifications. Exact columns, keys, foreign keys, status codes, and permission mappings must be verified against the actual Tables-v02/Tables-v03 files and current SQL Server schema before any SQL change is applied.

### Request Permissions / RBAC
New request-specific permissions should be additive and follow the existing PermissionCode model. Candidate capabilities from the phase discussion include:
- Create drawing request
- View own drawing requests
- Review/approve/reject requests
- Assign drawing requests
- View/act on assigned DrawingExpert work
- View/manage request notifications

Exact PermissionCode names and role mappings must be finalized against the current security schema before implementation. Existing PDF_VIEW, FILE_VIEW, FILE_Edit, NODE_VIEW, NODE_EDIT/NODE_CREATE/NODE_DELETE and established role semantics must not be changed merely to introduce the request workflow.

### UI Direction
- Add a request action such as **Request Drawing** in the relevant Node/drawing context.
- The request dialog must clearly identify the selected Node and request type and collect the required description/reason.
- Provide a **My Requests** view for requesters.
- Provide dedicated pending/request worklists for Manager, Admin/DrawingSupervisor, and DrawingExpert according to RBAC.
- Request status, Request ID, requester, Node, assignment, and approval state must be visible where appropriate.
- Notifications should be accessible from the authenticated DMS UI.
- Existing Viewer restrictions and current drawing/file viewing UI must remain functional.

### Security / Audit Requirements for This Phase
- Request creation, approval/rejection, assignment, and status transitions must be validated server-side.
- A user must not be able to approve, reject, assign, or process a request by modifying frontend code, URL parameters, Request ID, or direct API calls.
- Backend authorization must validate both the user's permission and the request/workflow state where applicable.
- Request IDs must not be trusted as authorization; ownership/role and workflow state must be checked server-side.
- Sensitive request information must not be exposed to unauthorized users.
- Workflow events should be auditable through the existing logging/audit approach.

# Current Task — table-v04 database migration — 2026-10-08

- User supplied and finalized Tables-v04.xlsx as the current request-workflow schema/data definition.
- Existing production/pilot database is still based on Tables-v02/current SQL Server schema; the request-workflow tables from v03/v04 did not previously exist.
- Current GitHub schema reference remains SQL/Relation between table.rpt; it documents the existing 11-table database and existing relationships.
- Added SQL/Inserttable.sql as an idempotent SQL Server migration/seed script.
- The migration adds the v04 workflow objects:
  - dbo.DrawingRequestStatuses
  - dbo.ActionCode
  - dbo.DrawingRequests
  - dbo.DrawingRequestAssignments
  - dbo.DrawingRequestHistory
  - dbo.Notifications
- The migration adds Role Manager (RoleID is resolved by RoleCode/existing identity state).
- It adds the 15 request permissions REQUEST_DRAWING_* from v04 and the v04 RolePermissions mapping without duplicating existing mappings.
- It aligns UserID=7 from VIEWER to Manager when the existing v02 row is present, resolving both roles by RoleCode rather than fixed RoleID values.
- It seeds the 14 v04 workflow statuses, including EXPERT_REJECTED, RETURNED_FOR_CORRECTION, PENDING_FINAL_APPROVAL, FINAL_APPROVED, FINAL_REJECTED, and CANCELLED.
- It seeds the 14 v04 ActionCode rows.
- Existing Nodes, DanieliPDF, tblPath, Users, UserManager, and Logs data are not re-imported.
- Important schema reconciliation: the actual current dbo.Permissions table has no Module column and PermissionName is NOT NULL. The migration therefore does NOT attempt to add/use Module; it supplies valid PermissionName/Description values while preserving the existing database structure.
- Static validation of the committed SQL file was performed: transaction/TRY-CATCH structure, all six new table names, all 14 status codes, all 14 action codes, and compatibility with the current Permissions column layout were verified. The SQL has NOT yet been executed against the real SQL Server instance in this session.
- Git commit containing the corrected migration: 11bc49e52a21e3f3b7f26babe3e43ea6ca259a1 — Align table-v04 permission seed with current Permissions schema.
- Previous initial migration commit superseded by the corrected file: be0d93c8a08308795f66675b4fa0e6bd093fad10.

## Known schema/design point to verify before workflow implementation

- Tables-v04.xlsx defines Notifications.RequestNumber as NVARCHAR(30) UNIQUE. The migration intentionally preserves this v04 definition. This may prevent multiple notifications for the same request, so it must be explicitly reviewed before implementing multi-event notifications.
- Tables-v04.xlsx does not contain request-row data in DrawingRequests, DrawingRequestAssignments, DrawingRequestHistory, or Notifications; only status/action seed data is present for the new workflow objects.

## Recent Authorization Hardening — 2026-10-08

- `backend/auth.js` is now strictly PermissionCode-driven for backend authorization.
- `requirePermission(permissionCode)` no longer allows `req.user.isAdmin` to bypass `RolePermissions`.
- Effective permissions loaded at login are resolved through:
  `Users -> UserRoles -> Roles -> RolePermissions -> Permissions`.
- Only active permissions (`Permissions.IsActive=1`) are loaded into the session permission set.
- `isAdmin` remains only informational/session metadata and is not an authorization bypass.
- `backend/server.js` dynamic `/api/node-file` authorization was also corrected: PDF access requires `PDF_VIEW`, non-PDF access requires `FILE_VIEW`, with no Admin bypass.
- All inspected `backend/server.js` protected routes use explicit PermissionCode strings such as `NODE_VIEW`, `NODE_CREATE`, `NODE_EDIT`, `NODE_DELETE`, `PDF_VIEW`, `FILE_VIEW`, and `FILE_Edit`; no RoleID is passed to `requirePermission`.
- `SQL/Inserttable.sql` RolePermissions seeding now resolves roles by `RoleCode` (`Admin`, `DrawingSupervisor`, `DrawingExpert`, `VIEWER`, `Manager`) and permissions by `PermissionCode`; fixed RoleID 1..5 mappings were removed.
- The v04 UserID=7 role alignment in `SQL/Inserttable.sql` now resolves VIEWER and Manager RoleIDs from their RoleCode values before updating `UserRoles`.
- `frontend/index.html` RBAC visibility documentation no longer references VIEWER RoleID; UI visibility remains based on effective PermissionCode values.
- Database schema was not changed by this authorization hardening; the existing `RolePermissions` relationship remains the authoritative RBAC mapping.
- Runtime SQL Server/UI testing is still pending in this session. Static source inspection confirmed there is no remaining `req.user.isAdmin` authorization bypass in the inspected Backend paths.

## Authorization Design Rule

- `RoleID` is a relational database key used to join `Roles` and `RolePermissions`; it is never a permission identifier.
- Backend route guards must receive a `PermissionCode`, never a RoleID.
- Authorization must be evaluated from the user's effective permissions produced by `UserRoles -> Roles -> RolePermissions -> Permissions`.
- Adding a new role must require only database Role/RolePermissions data; Backend route authorization must not require a new hard-coded RoleID.
- Adding/removing a permission from a role must be possible through `RolePermissions` without changing Backend authorization code.

# NEXT ACTION

1. Execute SQL/Inserttable.sql on the real dbDrawingManagment SQL Server database and capture any SQL Server errors/results.
2. Verify the authorization result with at least VIEWER, Manager, DrawingExpert, DrawingSupervisor, and Admin role assignments: changing RolePermissions must change backend access without changing code.
3. Verify no Backend route uses RoleID as a permission or relies on the Admin bypass; inspect any newly added workflow routes before implementation.
2. Verify the resulting tables, columns, PKs, FKs, unique constraints, indexes, 14 statuses, 14 action codes, 15 new permissions, Manager role, RolePermissions, and UserID=7 role mapping.
3. Re-run the database relationship export query and update SQL/Relation between table.rpt so it reflects the new v04 relationships.
4. Before implementing notifications, decide explicitly whether Notifications.RequestNumber should remain UNIQUE or be changed to allow multiple notifications per request.
5. After database verification, implement the request workflow backend incrementally with the v04 statuses/ActionCodes and RBAC permissions, starting with request creation and Manager approval/rejection.
