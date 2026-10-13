# DMS — AI Project State / Handoff

Last updated: 2026-10-12
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


## Drawing Request + User Worklist UI — 2026-10-08

- Added the first usable UI/API layer for the v04 drawing-request workflow.
- backend/server.js:
  - Added POST /api/drawing-requests, protected by REQUEST_DRAWING_CREATE.
  - The route validates the selected active Node, resolves the requester’s active Manager through dbo.UserManager, creates a unique request number, inserts dbo.DrawingRequests, writes REQUEST_CREATED to dbo.DrawingRequestHistory, and creates a Manager notification.
  - Added GET /api/drawing-requests. It returns only requests allowed by effective PermissionCodes and responsibility/ownership:
    - REQUEST_DRAWING_VIEW_ALL
    - requester-owned requests through REQUEST_DRAWING_VIEW_OWN
    - manager-responsibility requests through REQUEST_DRAWING_VIEW_MANAGER
    - assigned DrawingExpert requests through REQUEST_DRAWING_VIEW_ASSIGNED
  - Added GET /api/drawing-requests/notifications and PATCH /api/drawing-requests/notifications/:notificationId/read, scoped to req.user.userId.
  - CORS now allows PATCH for notification read updates.
  - No RoleID or isAdmin bypass is used by these request/worklist routes.
- frontend/index.html:
  - Added Add Request beside Upload Files in the Node Details SRSC action area.
  - Added a slide-in User Worklist sidebar containing user name/username, Logout, notification badge, and worklist refresh.
  - Added the Add Drawing Request dialog with selected Node context and request description.
  - Added frontend/css/request-workflow.css and frontend/js/request-workflow.js.
- frontend/js/request-workflow.js:
  - Loads /api/auth/me and uses effective PermissionCode data to control Add Request visibility.
  - Submits the selected Node request to the backend.
  - Loads and renders the user’s permitted worklist.
  - Loads unread notification count.
- Database structures were not changed by this UI/API implementation. It depends on the v04 workflow tables already defined in SQL/Inserttable.sql: DrawingRequests, DrawingRequestStatuses, DrawingRequestAssignments, DrawingRequestHistory, and Notifications, plus UserManager.
- Runtime SQL Server and browser UI testing has not been performed in this session. Source-level verification was performed by fetching the changed files from main after each write.
- Commits for this feature:
  - 29af9dec948273a38bd78c4387bc5f3e56601cd9 — request/worklist/notification backend APIs
  - 1d6ca9c0a72d709233415ddeadf86d1857050e85 — request/worklist CSS
  - 07924bb872f752b1363c1226d446ecf0a592184f — request/worklist frontend logic
  - 2ac35faae9094e7c6e5b039bd76be75070b6b09c — Node Details Add Request and worklist sidebar
  - f1cb6d6feb6f235e29cb5d9b552634b8a15008b7 — allow PATCH through API CORS

## Add Request Button Fix — 2026-10-08
- Root cause: frontend/js/request-workflow.js correctly checked REQUEST_DRAWING_CREATE and controlled #addRequestBtn, but the current frontend/index.html did not actually contain an element with that ID.
- Restored the missing Node Details action button beside Upload Files:
  - id="addRequestBtn"
  - label: Add Request
  - class: request-drawing-btn (reuses existing request-workflow styling)
- Existing frontend authorization logic remains unchanged: request-workflow.js loads /api/auth/me, stores effective PermissionCodes in window.DMS.permissions, and hides the button unless REQUEST_DRAWING_CREATE is present.
- The backend POST /api/drawing-requests permission check remains authoritative.
- Verification: fetched frontend/index.html from main after the change and confirmed the button, label, styling class, and request-workflow.js script are present. Source inspection also confirmed the permission check and MutationObserver remain active.
- Runtime browser/SQL Server test has not been performed in this session.
- Commits:
  - 98e33c3439a8857a229204acf304ed100871ee46 — restore missing Add Request button
  - 59521d300ac4241f66e7e74d923391182d046c61 — apply existing request button styling

# Admin Database Management — 2026-10-08

## Current Task
Fix Admin Management API origin when frontend is opened through Live Server (`127.0.0.1:5500`), then validate the Admin database management environment.

Previous task: Add an Admin-only in-app database management environment so an Admin can view, add, edit, activate/deactivate, and delete records without using SQL manually.

## Implemented
- Added Admin-only **Management** button to the main DMS header.
  - File: `frontend/index.html`
  - The button is hidden by default and shown only when `/api/auth/me` reports `user.isAdmin=true`.
  - Commit: `5ef3bbb883232941b2d0c0802969363b6414042c`
- Added dedicated management page:
  - `frontend/management.html`
  - `frontend/js/management.js`
  - `frontend/css/management.css`
  - Supports table selection, table search, row search, pagination, add, edit, delete, confirmation, and error reporting.
  - Uses the existing DMS session cookie with `credentials: include`.
  - Commit: `b7c0d30c8aaff86d1de210ba5b41a6aebcb049e9`
  - Commit: `a1be812204e75d935c18fbc654ea84f357dc17de`
  - Commit: `cc9e05bd6868b81266818796467b5c2f9a591a4c`
- Added live Admin authorization:
  - File: `backend/auth.js`
  - `requireAdmin()` checks the current SQL Server relationship `Users -> UserRoles -> Roles`, requiring active user + active `RoleCode='Admin'`.
  - `writeAudit` is exported for Admin CRUD audit logging.
  - Commit: `80b829cde4d935b226b29a92c136570a491d98b3`
- Added secure metadata-driven CRUD API:
  - File: `backend/admin-db.js`
  - Registered from `backend/server.js`.
  - Commit: `0b5da40bcc75172f46f53eb7336b6e3f20921e4e`
  - Hardened after implementation:
    - `sysdiagrams` is excluded from management.
    - `dbo.Logs` is read-only to preserve audit integrity.
    - `Users.PasswordHash` is never returned to the UI.
    - Users can set/change password through a dedicated password field; hashing uses the same scrypt format as `backend/set-password.js`.
    - Commit: `790de20c2e8bbbd04705d3d97a1741127e4e9cad`
- `backend/server.js` now imports/registers the dedicated Admin module and serves `/management.html`.
  - Commit: `96bfe72c4f7cee27fed7f02b844576ba8c927ba1`
  - Management route: `GET /management.html` (authenticated page; API remains Admin-only).
  - Admin API routes:
    - `GET /api/admin/tables`
    - `GET /api/admin/tables/:tableName/rows`
    - `POST /api/admin/tables/:tableName/rows`
    - `PATCH /api/admin/tables/:tableName/rows`
    - `DELETE /api/admin/tables/:tableName/rows`
- Database schema was not changed.
- Current verified schema source: `SQL/Relation between table.rpt`.
- Current schema contains 17 dbo tables. Important RBAC tables include `Users`, `UserRoles`, `Roles`, `RolePermissions`, `Permissions`, and workflow tables include `DrawingRequests`, `DrawingRequestStatuses`, `DrawingRequestAssignments`, `DrawingRequestHistory`, `Notifications`, plus `UserManager`.
- The Admin UI is metadata-driven from SQL Server system catalog, so it automatically reflects current table columns/PKs/FKs instead of hardcoding the table structure.

## Security / Behavior
- Table/column identifiers are resolved from SQL Server metadata and safely quoted.
- Row values are parameterized; the UI never submits arbitrary SQL.
- Primary keys, Identity columns, Computed columns, and audit timestamps are not directly editable.
- Foreign-key constraints remain enforced by SQL Server. Delete/update failures are returned as controlled errors.
- Every successful Admin insert/update/delete writes an entry to `dbo.Logs`.
- `Logs` cannot be edited/deleted through this panel.
- Admin authorization is checked server-side for every Admin API request; hiding the Management button is not the security boundary.
- User activation/deactivation is supported through the `Users.IsActive` field.
- Role permissions can be managed through `RolePermissions` records by editing/adding/removing `RoleID` + `PermissionID`.

## Testing Status
- Source files were fetched again from GitHub after the changes and structural anchors were verified.
- A local runtime test could not be performed because this AI environment cannot reach the user's local SQL Server at `localhost`.
- An external `git clone`/Node syntax check was attempted but the execution environment could not resolve `github.com`; therefore no claim of runtime/syntax execution is made.
- Next real-machine test must start the DMS backend against the actual SQL Server and verify:
  1. Admin sees Management.
  2. Non-Admin cannot access Admin APIs.
  3. Users can be added and activated/deactivated.
  4. RolePermissions can be added/removed.
  5. Delete behavior respects foreign keys.
  6. Password creation/reset from the Users form allows login.

## Latest Fix — 2026-10-08
- User reported `GET http://127.0.0.1:5500/api/auth/me 404` and `GET http://127.0.0.1:5500/api/admin/tables/null/rows 404`.
- Root cause: frontend was opened through Live Server on port 5500, while Node backend serves APIs on port 3000. Relative `/api/...` requests therefore went to Live Server instead of Node.
- Fixed `frontend/js/management.js` to use `API_BASE` dynamically: when frontend runs on ports 5500/5501 it targets the same hostname on port 3000; when served by the Node backend it remains same-origin.
- Commit: `1579eefb62bc61e5934b17c8d49eb5afbf0cd375`.

## Known Limitations
- The management UI currently uses generic inputs for FK columns; it does not yet provide relationship-aware dropdowns for every FK.
- `dbo.Logs` is intentionally read-only.
- `sysdiagrams` is intentionally excluded.
- Runtime SQL Server/browser validation remains pending on the user's machine.


## Management Table Row Ordering Fix — 2026-10-08
- User requirement: records shown in the **Management** database table view must be ordered by the table's primary key.
- Backend file: `backend/admin-db.js`.
- `metadata()` now reads SQL Server `sys.index_columns.key_ordinal` for primary-key columns and exposes `PrimaryKeyOrdinal` in table metadata.
- `GET /api/admin/tables/:tableName/rows` now builds its `ORDER BY` from all primary-key columns in actual PK ordinal order. This also correctly handles composite primary keys; it no longer sorts only by the first PK column.
- If a table has no PK, the existing fallback remains the first column.
- No database schema was changed.
- Code commit: `de451fcd2fa9127276790d1e4a23ae24969d0140` — Sort Management table rows by full primary key
- Verification: the updated file was fetched from `main` after commit and the SQL/JavaScript change was structurally inspected. Runtime Management/UI testing against SQL Server has not been performed in this session.

## Management Column Sorting — 2026-10-08
- User changed the requirement: Management should allow sorting the currently opened table by clicking any column header.
- Backend: `backend/admin-db.js`
  - `GET /api/admin/tables/:tableName/rows` accepts `sortBy` and `sortDir`.
  - `sortBy` is validated against actual table metadata, so arbitrary SQL identifiers are not accepted.
  - `sortDir` accepts only `asc` or `desc`; invalid values fall back to `ASC`.
  - If no column is selected, the default remains PK-based ordering.
  - When sorting by a non-PK column, the PK columns are appended as deterministic tie-breakers.
- Frontend: `frontend/js/management.js`
  - Every table header is clickable.
  - First click sorts ascending.
  - Second click on the same header switches to descending.
  - Active header shows `▲` / `▼`.
  - Changing table resets sorting to the default state.
- CSS: `frontend/css/management.css` styles the header sort buttons.
- Commits:
  - Backend: `a3b8bf1b55acb408a8e324567e11f6d8e2ef2d4f`
  - Frontend JS: `a28aeb6e424dbb8092afb490e908828e53d9a93e`
  - Frontend CSS: `df867b2ec93cccf910fb2019e8e063fc4007dece`
- Runtime browser/SQL Server test was not performed in this session.



## Drawing Request Workflow Actions — 2026-10-10

- Added backend endpoint `POST /api/drawing-requests/:requestId/action` in `backend/server.js`.
- Actions use effective PermissionCodes and validate request ownership/responsibility/status; status changes and `DrawingRequestHistory` are written in a SQL transaction.
- Supported: requester cancel; Manager approve/reject; Admin/DrawingSupervisor refer to DrawingExpert or reject at drawing approval; DrawingExpert accept, transfer, reject work, and complete; authorized supervisor/admin return for correction or final approval.
- Added `REQUEST_DRAWING_CANCEL` and idempotent RolePermissions mappings to `SQL/Inserttable.sql`.
- Updated `frontend/js/request-workflow.js` to render workflow actions by PermissionCode, user responsibility, and status. Assignment prompts for an active DrawingExpert username. Updated `frontend/css/request-workflow.css`.
- Runtime SQL Server/browser tests have not been performed from this environment.
- Known schema issue: `Notifications.RequestNumber` is UNIQUE in v04, so no additional per-action notifications are inserted by this change.
- Baseline before workflow-action changes: `11bc49e52a21e3f3b7f26babe3e43ea6ca259a1`.
- Commits for this change:
- d5ac303897629135f1b7d9e0f5c29cb45cb2252f — backend/server.js
- b137a121fd87770ef06fa62ec8e6d24aed7b095b — SQL/Inserttable.sql
- a19cfa84817b316dc77b06a47414ad12d73a207d — frontend/js/request-workflow.js
- a2001e88d9d09dcd7832faa974ba1c1a0140bb96 — frontend/css/request-workflow.css

## Drawing Workflow Button Visibility Fix — 2026-10-10

- User reported that none of the requested workflow buttons were visible and confirmed they had not run `SQL/Inserttable.sql`.
- Updated `frontend/js/request-workflow.js`:
  - `Add Request` remains visible and becomes disabled when `REQUEST_DRAWING_CREATE` is absent from the effective PermissionCode set; its tooltip explains the missing permission.
  - Workflow action buttons are now rendered for applicable request status/ownership even when the current user lacks the required PermissionCode; unauthorized buttons are visibly disabled and expose the required permission in a tooltip/data attribute.
  - The click handler rechecks the required PermissionCode before calling the action API.
  - Backend PermissionCode checks remain authoritative; this UI change does not grant permissions or bypass RBAC.
- Updated `frontend/css/request-workflow.css` so disabled workflow controls are visibly disabled.
- Commits:
  - `9d5d2ddfe7c4a8c34e85ccd5464937a6adfa5c3f` — Keep drawing workflow action buttons visible with RBAC disabled states
  - `083124d975217a068ce6aca5a6fa14136e57de00` — Style visible but unauthorized drawing workflow buttons
- Source verification after commits confirmed the JS/CSS changes and that `frontend/index.html` loads `js/request-workflow.js`.
- No runtime browser test, Node syntax check, or SQL Server test was run from this environment.
- Important prerequisite: user has not run `SQL/Inserttable.sql`. According to the migration documented above, request/worklist APIs depend on the workflow tables and seed permissions in that script. Until the migration is reviewed and applied to the target database, the controls may be visible but requests/actions cannot be confirmed functional.

## Drawing Request Workflow — user-requested UI corrections — 2026-10-11

- User requested the next six fixes for drawing requests:
  1. Request-number search in the worklist sidebar.
  2. Separate Approved Requests and Unapproved Requests sections.
  3. Requester can cancel only while status is `PENDING_MANAGER`.
  4. Fix duplicate display after creation (the frontend previously prepended `data.request` to the API list, which already contained the same newly-created row).
  5. Requester cancellation confirmation through a modal.
  6. Manager Approve/Reject opens an action modal; Continue opens a second confirmation modal; cancelling the second modal returns to the first.
- Implemented in `frontend/js/request-workflow.js`:
  - Added case-insensitive client-side search by `RequestNumber`.
  - Renders two sections. `PENDING_MANAGER`, `MANAGER_REJECTED`, and `CANCELLED` are in Unapproved Requests; other workflow states are in Approved Requests (this reflects manager approval progression, including later-stage states).
  - Cancel Request is rendered only for the request owner when status is `PENDING_MANAGER`.
  - After successful creation, the UI reloads the server list instead of rendering a manually prepended duplicate.
  - Added modal flow for cancellation and two-stage Manager approve/reject confirmation. The second modal's Cancel/close hides only the confirmation modal, preserving the first modal and its comment.
  - Cancellation errors are shown in the cancellation modal; approve/reject errors are shown in the confirmation modal.
- Added search input and two action modal elements to `frontend/index.html`; added styles in `frontend/css/request-workflow.css`.
- Commits:
  - `1ade88c00f1b1210d47f7a82083013a0f9b979a5` — Fix drawing request worklist and modal approval workflow
  - `13902d6d2a6b534e0b9466c11e2184611c449c88` — Add request search and action confirmation modal markup
  - `3d830f5659e84879dd9b880e52818ab0f31e637b` — Style drawing worklist search, sections, and confirmation modals
  - `0dcabffdd8e2bcc9a712519580e7362328971891` — Keep cancellation errors visible in the cancellation modal
- Verification performed against latest GitHub source: JavaScript compiled successfully with a JS parser; checked presence of search binding, modal markup, section labels, duplicate fix, pending-only cancel condition, and two-stage Manager confirmation.
- Not performed: browser/UI interaction test, API integration test, or SQL Server runtime test. `SQL/Inserttable.sql` has not been run by the user; workflow runtime may still depend on its tables/permissions being present.
- No database structure or SQL migration changed in this task.

## Request Workflow — Universal Action Modals and Comment Visibility — 2026-10-11

- Extended the existing request action modal flow to every workflow action in `frontend/js/request-workflow.js`; actions no longer use browser `prompt()` for comments or expert usernames.
- All non-cancel workflow actions use the action modal and the second confirmation modal. Cancel keeps the existing confirmation in the action modal. The second modal's Cancel/close hides only confirmation and leaves the action modal/comment intact.
- Added `#rwActionExpertField` / `#rwActionExpertUsername` in `frontend/index.html`; assignment and transfer require a DrawingExpert username before confirmation. The backend continues to validate the active DrawingExpert account and action permission.
- `GET /api/drawing-requests` in `backend/server.js` now includes a `Comments` array per request, sourced from non-empty `dbo.DrawingRequestHistory.Comment` rows. It only queries comments for requests already authorized for the current worklist.
- Comment visibility is filtered in SQL Server on the backend: users with active `VIEWER` or `Manager` role see only comments authored by that request's `RequesterUserID` or `ManagerUserID`; users without either role see all comments for the requests in their authorized worklist. Frontend rendering is not used as a security boundary.
- `frontend/js/request-workflow.js` renders each request's comments inline beneath its description, including author, action code, and timestamp. `frontend/css/request-workflow.css` styles the comments and expert input.
- No database changes are required: `dbo.DrawingRequestHistory` already contains `HistoryID`, `RequestID`, `ActionByUserID`, `ActionByUsername`, `Comment`, and `CreatedAt`; workflow action comments are already written there by the action API.
- Commits:
  - `d68b4d5896c7f4ae59df2e42ad0cc5650ee5ed64` — Return request comments with backend role filtering
  - `6313a0c7a45774b74b64651adad06d304034e37c` — Use workflow modals for all request actions and render comments
  - `0a2491d9b6c7b4e0724cb4a098c3a05437c97016` — Add expert assignment field to workflow action modal
  - `8a6bd2ad75cc6549dad5858dba5324efe7d9f306` — Style inline request comments and expert assignment modal
- Verification performed after fetching current `main`: `new Function(...)` syntax parsing passed for `backend/server.js` and `frontend/js/request-workflow.js`; structural checks passed for role-filtered comment query, inline rendering, removal of comment/expert `prompt()` calls, assignment input, and CSS.
- Not performed: browser interaction test, live API integration test, or SQL Server runtime test. In particular, confirm real account RoleCode values are exactly `VIEWER` and `Manager` in the target database; the code uses these established role codes from the migration/state.

## Request Sidebar and Details Modal — 2026-10-11

- User requested unread/read visual state for sidebar requests, a compact request card, and a request-specific details modal containing request information, actions appropriate to the current user's role/permissions, tree navigation, and comments at the bottom.
- `backend/server.js`: `GET /api/drawing-requests` now includes `HasWorkflowAction`, based on existence of a `dbo.DrawingRequestHistory` record whose `ActionCode` is not `REQUEST_CREATED`. New requests remain unread/red until an actual workflow action has been recorded; after any workflow action the card uses the read/background style. This is derived from server history, not browser-only state.
- `frontend/js/request-workflow.js`: worklist cards are compact and show request number/status, node code/name, requester, manager, assigned expert, and created time. Each card is keyboard accessible and opens its request detail modal. Actions were moved from the sidebar cards into the detail modal.
- Details modal includes request number, current status, node info, requester/manager/expert, created/updated timestamps, request description, available manager/expert/workflow actions, manager decision/comment/assignment time when present, a “Show location in tree” button, and role-filtered comments at the bottom.
- `frontend/index.html`: added `#rwDetailsModal` markup.
- `frontend/js/script.js`: exposed `window.DMS.revealNodeLocation(nodeId, nodeCode)`; it searches the node tree, expands the real ancestor chain, selects the target Node, opens node details, and scrolls the node into view.
- `frontend/css/request-workflow.css`: added red unread and normal-background read styles, plus responsive detail modal layout.
- Commits:
  - `32825b0c7b0ea7266915dcbf584cbec2b45df4ed` — Expose workflow action state for request sidebar styling
  - `acc5557bb057643efdd5715f94e60328ac24bdb4` — Make request sidebar compact and add full request details modal
  - `536590ec34ec53dd4addd70a33e8be2ab01ca6a0` — Add request details modal with actions and comments
  - `cf68d16b5dc0e29dceacb00d35a12e24ffb542cd` — Expose tree navigation for drawing request details
  - `95b2fbd858f9ead7e394090e777913e17720cb33` — Style unread and read request cards and request details modal
  - `d78e5e8771e2a5cccdc80609cdb1802c639833cc` — Make compact request cards accessible interactive elements
- Syntax checks passed using JavaScript parser for `backend/server.js`, `frontend/js/request-workflow.js`, and `frontend/js/script.js`. Structural checks passed for the state field, details modal, action controls, tree-navigation hook, comments, modal IDs, and CSS.
- Not yet performed: live browser testing, API integration test, SQL Server runtime test, or verification of real-world tree navigation for a nested Node. No database schema change is required.


## Requester Cancellation Authorization Fix — 2026-10-11

- User clarified the requester (including VIEWER) can cancel their own drawing request only until their Manager approves it; once the Manager has approved, cancellation must be denied.
- Root cause in `backend/server.js`: the `cancel` action authorization excluded several terminal statuses but still allowed cancellation from post-approval states such as `PENDING_DRAWING_APPROVAL`, `ASSIGNED`, and later workflow states.
- Updated the backend authorization condition to require both request ownership (`RequesterUserID === req.user.userId`) and exact status `PENDING_MANAGER`.
- The frontend already renders Cancel Request only for the owner while status is `PENDING_MANAGER`; backend authorization is now aligned and remains authoritative.
- No database/schema or permission mapping changes.
- Commit: `f2a2a3187d731f6d634a8474eea2ce27f0b8f643` — Restrict requester cancellation to pre-manager approval
- Verification: source condition was matched and replaced against the current `main` file. No live SQL Server/API/browser integration test was available/performed in this session.

## Viewer Cancellation Disabled-State Fix — 2026-10-11

- User reported that Viewer can see the Cancel Request button but it is disabled.
- Root cause: frontend action availability was tied to the `REQUEST_DRAWING_CANCEL` PermissionCode, and backend rejected every action without its mapped permission before checking request ownership/status. This prevented Viewer cancellation when that permission was absent from the user's effective PermissionCode set.
- `frontend/js/request-workflow.js` now treats Cancel Request as available only in the existing owner + `PENDING_MANAGER` branch; that specific action is enabled without relying on a separate permission code.
- `backend/server.js` now exempts only the `cancel` action from the generic PermissionCode gate. Its existing action authorization still requires `RequesterUserID === req.user.userId` and exact status `PENDING_MANAGER`. All other workflow actions retain their permission checks.
- No database schema or permission mapping was changed. A Viewer cannot cancel another user's request or any request after Manager approval.
- Commits:
  - `7daff6dce96fe8b7efd960f28b9160f846afd636` — Enable requester cancellation before manager approval
  - `5c9fbc365c7d2b921a167f1050d39ea3e0cce496` — Authorize own pending request cancellation by ownership and status
- Verification: fetched and inspected the current source before applying exact replacements; the expected frontend/backend changes were confirmed in the updated source content returned by GitHub. Runtime browser/API/SQL Server tests have not been run in this environment.

## Viewer Cancellation Cache Follow-up — 2026-10-11

- User still sees `Permission denied: REQUEST_DRAWING_CANCEL` after the Cancel button became enabled.
- Current `main` frontend click handlers bypass the PermissionCode check for `cancel`, and `backend/server.js` exempts `cancel` from the generic permission gate while requiring request ownership and `PENDING_MANAGER` status.
- This exact frontend alert is consistent with an older cached/local `request-workflow.js`. Updated `frontend/index.html` to load `js/request-workflow.js?v=20261011-cancel-fix`.
- Commit: `ef2507bf3500419c0ca33249e011dfd689a7468f`.
- Runtime browser/API/SQL Server testing has not been performed.



## Worklist Unread State — Per Current User — 2026-10-11

- User reported that after a Viewer request is approved by its Manager, the next responsible users did not see the request as unread/red in their Worklist.
- Root cause: `GET /api/drawing-requests` computed `HasWorkflowAction` by checking whether *any* non-`REQUEST_CREATED` action existed for the request. A Manager's approval therefore marked the card as read for every user, including the next actor.
- Fixed `backend/server.js`: `HasWorkflowAction` now checks for a non-`REQUEST_CREATED` history action performed by the currently authenticated user (`ActionByUserID=@userId`). A Manager's action no longer marks the request as read for the next user.
- Updated `frontend/index.html` cache-buster for `js/request-workflow.js` to `v=20261011-user-worklist-read`.
- No database/schema changes.
- Commits:
  - `296bddd43eb0a0815979485ff4e49bfe1f8f518a` — Track drawing worklist read state per current user
  - `ddfd4833c1ead496a07f51b23c86e390fd61892c` — Refresh workflow frontend after per-user unread fix
- Source-level verification: confirmed the old global history-existence condition was replaced with the current-user condition and the frontend cache-buster was updated. Live browser/API/SQL Server testing has not been performed.


## Worklist Unread State — Latest Workflow Action — 2026-10-11

- Follow-up: the previous per-user HasWorkflowAction check still treated a request as read forever after a user had acted on it once. This failed when the same request returned to that user later, and did not explicitly model the latest workflow handoff.
- Updated backend/server.js in GET /api/drawing-requests: HasWorkflowAction is now true only when the latest non-REQUEST_CREATED row in dbo.DrawingRequestHistory belongs to the currently authenticated user. Ordering uses CreatedAt DESC, HistoryID DESC for deterministic handling of equal timestamps.
- Expected behavior: a new request is unread; after Manager approval it is read for the Manager but unread for the next responsible user; after assignment it is unread for the DrawingExpert; after any later handoff it becomes unread again for the newly responsible user, even if that user acted on this request in an earlier workflow stage.
- Updated frontend/index.html cache-buster for request-workflow.js to v=20261011-worklist-latest-action so the current unread/read rendering is loaded after refresh.
- No database schema or permission changes.
- Source-level validation: confirmed the old existence-based query was found and replaced exactly; confirmed the frontend cache-buster was updated. Runtime browser/API/SQL Server testing has not been performed in this environment.
- Backend commit: 1241787d05499d03252955c786916dadfacbc914
- Frontend cache-buster commit: 93efd9e333698e0ccda345d7ce1e5fd4ca0daed2

## Completed Workflow Status Colors and Transfer Handoff — 2026-10-11

User-approved display rules:
- Yellow = this user is the current responsible actor.
- Orange = the request is waiting for an earlier/currently responsible workflow stage.
- Green = the request passed this user's earlier stage or is positively completed.
- Red = rejected; where `FINAL_REJECTED` allows a correction action, the responsible correction authority may see yellow.
- Gray = the referring Expert's transferred request, work in progress for the Expert, or cancelled status. `CANCELLED` is excluded from the open Worklist.
- Unread is independent of status background and is indicated by a red left border. Backend `HasWorkflowAction` continues to reflect whether the latest non-`REQUEST_CREATED` workflow history action was performed by the current user.

Implemented:
- `frontend/js/request-workflow.js`: completed role-aware color matrix. Requester and assigned Manager see `PENDING_MANAGER` in yellow; assignment/final approval turns yellow for the responsible permission holder; rejected states display red; `RETURNED_FOR_CORRECTION` is yellow for the assigned Expert and orange for other workflow participants; cancelled requests are filtered from open work.
- `backend/server.js`: `GET /api/drawing-requests` returns `WasPreviouslyAssignedExpert` and includes the previous Expert's own `TRANSFERRED` request in that Expert's worklist, allowing it to display gray after referral. `accept` now allows the current assigned Expert to accept a request in either `ASSIGNED` or `TRANSFERRED`, aligned with the existing frontend action.
- `frontend/css/request-workflow.css`: replaced red unread background and dark read background with the five workflow status backgrounds; unread now uses an independent red left border.
- `frontend/index.html`: removed duplicated inline workflow color rules and updated cache-buster to `js/request-workflow.js?v=20261011-workflow-colors-final`.
- No database schema changes.

Commits:
- `a7d89bc628168e856c54d5c014ce95f233a12c6e` — Complete role-aware request workflow color matrix
- `129be110b46615c562c415d6994f788db5e89f41` — Complete transferred request handoff and prior expert visibility
- `b29d12a75a05eeb84ba80b8ec818a1cff7e1eaa3` — Separate unread marker from workflow status backgrounds
- `a36d7c37bc9f233e2cdf1494d8456f2ef536875e` — Use consolidated workflow styles and refresh frontend cache

Validation: JavaScript parser checks passed for both `frontend/js/request-workflow.js` and `backend/server.js`. An isolated test of `getRequestColorClass()` passed 11 cases: Viewer/Manager pending Manager, Admin waiting and acting, assigned/new/prior Expert on transfer, rejection, correction, and final approval. Source checks confirmed all five CSS colors, the separate unread border, cancelled filtering, the final cache-buster, backend acceptance of `TRANSFERRED`, and prior Expert visibility. No live browser, API, or SQL Server runtime test has been run; verify against the deployed database before declaring runtime completion.

## Request Details Workflow — Single Box Update — 2026-10-12

User follow-up implemented:
- The step-by-step workflow is presented inside one unified dark-slate bordered panel with a heading and step count.
- Each stage remains inside the panel with actor/stage, action, timestamp, comment, and a connector arrow to the next stage.
- Removed the separate Comments section from the request details modal. Comments are shown only within their corresponding workflow steps, retaining the existing authorized comment visibility filtering.
- Preserved request status, node path, action buttons, API contracts, and database schema.
- Updated frontend cache-busters to `request-workflow.css?v=20261012-workflow-single-box` and `request-workflow.js?v=20261012-workflow-single-box`.

Commits:
- `f7e1f176fb9c3da32ed9493c00aacd0e933e33f9` — Show request workflow in one unified panel
- `1450f1094832f77ba4f4fbbe28a6d16ba2d993f5` — Style workflow as a unified dark panel
- `a0ee7e10eec9fb66c14c29612c33a98f5f1e1d9f` — Refresh workflow panel frontend assets

Validation:
- JavaScript parser check passed.
- Structural checks passed: standalone Comments section removed from the modal, workflow renderer retained, unified panel CSS present, asset cache-busters updated.
- Browser interaction and live API/SQL Server integration tests have not been run in this environment.

## Request Details Modal Layout — 2026-10-12

User requirements implemented:
- `rwDetailsModal` now uses the DMS dark-slate theme consistent with the request sidebar.
- The STATUS row appears immediately below the request number; `Show location in tree` is directly under STATUS.
- Under the location button, the modal shows only the selected node's root-to-current ancestry chain (NodeCode + NodeName per ancestor), not sibling nodes or unrelated branches.
- Available action buttons are below the location button and node path.
- Removed the standalone `Description / Reason` and separate ManagerComment detail fields to avoid duplicating comments.
- Added a vertical workflow timeline ordered by `DrawingRequestHistory.CreatedAt, HistoryID`: each step shows stage, action, timestamp, and comment, with a down arrow to the next step. Request creation displays the requester reason/comment from the `REQUEST_CREATED` history row.
- Existing Comments section remains in the modal; existing comment metadata still displays `ActionCode`.
- `GET /api/drawing-requests` now includes `WorkflowHistory` for timeline events. Timeline comments reuse the same visible comment-history IDs as the existing `Comments` list to preserve the current Viewer/Manager comment visibility rule.
- Preserved the existing `GET /api/node-hierarchy/:nodeId` contract and `FILE_VIEW` permission (three-level result); added `GET /api/node-hierarchy/:nodeId/full` with `NODE_VIEW` permission for the modal's complete root-to-current chain.
- Updated frontend cache-busters to `request-workflow.css?v=20261012-details-modal-final2` and `request-workflow.js?v=20261012-details-modal-final2`.
- No database schema changes.

Commits:
- `ad1343e6be2044d4b143ac36d84d7d7b78882953` — Redesign request details modal with node path and workflow timeline
- `52292a64186f0c390fc7bc0424d10c014d38105d` — Style request details modal to match DMS theme
- `e808a590ba13d2bc565d460d85f2898589442bfb` — Expose complete node ancestry and workflow history for request details
- `92e92082ee633bdc96a9f036a25f24594ae3aaf5` — Authorize node ancestry display with NODE_VIEW
- `443b8f4ba3098639cadfd3f5be3dbd6376ad8e0e` — Intermediate workflow comment visibility implementation, subsequently refined
- `4f4870990f740672fbc292f0b9f439ac74222aa3` — Reuse existing comment visibility rules in workflow timeline
- `4a67276c9d898df678c66f75e81b5c4ec1d5a17e` — Preserve existing comment metadata display in request details
- `90f7777c9099373c0e5f0016c95f98b338eda963` — Initial workflow asset refresh
- `553180c70a87c5f6b0fb20d949c1249cf60739d6` — Initial refresh cache for request details modal
- `ec04c2da6ec5bdbdf1573573bfb6858f7f240052` — Preserve existing node hierarchy contract and add full ancestry route
- `24ca7234e6fbc22d29401fcb3c461fb2e78ce8a0` — Load full node ancestry for request details modal
- `ffd686bdca4be4de62e1b88aef35fdc19d749190` — Refresh assets after full ancestry endpoint adjustment

Validation performed:
- JavaScript parser checks passed for `frontend/js/request-workflow.js` and `backend/server.js`.
- Structural assertions passed for STATUS placement, Show location placement, actions below location/path, timeline below actions, removal of standalone Description / Reason, full hierarchy, comment section preservation, dark modal theme, privacy filtering, and both cache-busters.
- Browser interaction and live API/SQL Server integration tests have not been run in this environment.

## Request Workflow Colors and Final-Approval Marker — 2026-10-12

User-approved behavior implemented:
- Removed the old read/unread styling concept from request cards. The left-side marker is now a workflow completion marker: red for every request that has not reached `FINAL_APPROVED`, green only after final approval.
- The request background color remains independent of that marker.
- Rejected states (`MANAGER_REJECTED`, `DRAWING_APPROVAL_REJECTED`, `EXPERT_REJECTED`, `FINAL_REJECTED`) display red for all relevant worklist viewers; `FINAL_REJECTED` no longer changes to yellow based on permission.
- The assigned Expert sees `IN_PROGRESS` in blue after accepting work.
- On `RETURNED_FOR_CORRECTION`, the assigned Expert sees yellow; other workflow participants see green to preserve their completed/previous-stage color.
- A user with `REQUEST_DRAWING_VIEW_ALL` sees yellow at `PENDING_FINAL_APPROVAL`, because final approval is the outstanding action. The permission does not make every request yellow.
- Preserved existing stage behavior for Manager, assignment, transferred requests, prior Expert gray state, and final approval green.
- No backend API contract, RBAC mapping, or database schema was changed. The backend's `HasWorkflowAction` field remains available for compatibility but no longer controls the request marker.
- Updated cache-busters in `frontend/index.html` to `20261012-workflow-color-marker`.

Commits:
- 5c573e62bd7bc6efd10a67c346a4050b70b57b69 — Apply updated drawing request workflow colors
- 2165dddc0807abb4ed45da8828dbf70f8102767c — Show final approval marker and expert progress color
- 041650bf9b7513fc743164eff78b3c315429e22c — Refresh request workflow color assets

Validation:
- Source-level assertions confirmed the old unread/read classes are no longer used for rendering, the final-approval marker is applied only to `FINAL_APPROVED`, blue status CSS exists, the `REQUEST_DRAWING_VIEW_ALL` final-approval condition exists, and both asset cache-busters were updated.
- No live browser, API, or SQL Server integration test was run in this environment.

## Jalali Calendar as the Application Date Standard — 2026-10-12

User requirement: all dates shown and entered in DMS must use the Jalali (Shamsi/Persian) calendar as the application-wide standard. Database timestamps and API contracts remain unchanged; conversion happens in the frontend.

Implemented:
- Added `frontend/js/date-utils.js` exposing `window.DMSDate.format()`, `toJalaliInput()`, and `fromJalaliInput()`. Display uses the browser's standard `Intl.DateTimeFormat` Persian calendar; date/time values preserve local display time. Jalali entry accepts `YYYY/MM/DD` and `YYYY/MM/DD HH:mm:ss`, including Persian/Arabic digits.
- Loaded the shared date utility on `frontend/index.html` and `frontend/management.html` before application scripts.
- `frontend/js/request-workflow.js`: request creation time and workflow timeline timestamps now display in Jalali date/time format.
- `frontend/js/management.js`: SQL date/datetime columns display as Jalali dates; date/datetime values in the admin editor use Jalali input and convert back to Gregorian date/ISO values on save. Date-only columns are parsed without a timezone-induced day shift.
- Updated frontend cache-busters to `20261012-jalali`.
- No SQL schema, persisted timestamp, or API response shape changes.

Validation:
- JavaScript syntax parsing passed for `frontend/js/date-utils.js`, `frontend/js/management.js`, and `frontend/js/request-workflow.js`.
- Four conversion checks passed: Jalali date to Gregorian date, Gregorian date to Jalali display, Persian-digit input, and Jalali date-time round trip.
- Structural checks confirmed the shared utility loads before application scripts and the final `# NEXT ACTION` section is present.
- No browser or live SQL Server integration test has been run yet.

## Jalali Date Display: English Numerals and Clear Date-Time Separation — 2026-10-12

User requested date/time values to display using English (Latin) numerals and for the space between date and time to be more noticeable. The Jalali calendar requirement remains unchanged.

Implemented:
- `frontend/js/date-utils.js`: display formatter now uses `en-US-u-ca-persian-nu-latn`, retaining Jalali year/month/day while displaying Latin digits.
- Date-time output now separates the date and time with three non-breaking spaces so the gap remains visible in HTML-rendered text. Date-only output is unchanged.
- Updated `frontend/index.html` and `frontend/management.html` date utility cache-busters to `20261012-jalali-en`.
- Jalali input conversion, Persian/Arabic digit normalization on entry, API contracts, and database timestamp storage are unchanged.

Commits:
- `3352d056482ced837503782c33d2f8f30797aefe` — Display Jalali dates with English numerals and clearer spacing
- `2cf89f615568f8f101ee90a0648447767a036a45` — Refresh DMS date formatter asset cache
- `85bc5964ce846c752d646d38e3e4a71bb2d03ee5` — Refresh Management date formatter asset cache

Validation:
- Source-level assertions verified the formatter locale, Latin-digit numbering system, non-breaking-space separator, and updated cache-busters.
- Browser rendering and live SQL Server integration were not tested in this environment.

## Drawing Request Numbering by Jalali Year — 2026-10-12

User requirement: Drawing Request numbers must be exactly eight digits. The first four digits are the current Jalali year; the final four digits are a per-year sequence beginning at 0001 (examples: `14050001`, `14050002`, ...; in the next Jalali year: `14060001`, `14060002`, ...). The old `DR-<UTC timestamp>-<random hex>` format is removed.

Implemented in `backend/server.js`:
- `getJalaliRequestYear()` derives the Jalali year using `Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn')` and strips the calendar era suffix so only four numeric year digits are used (for example, `1405`, not `1405 AP`).
- Request creation generates `YYYYNNNN` inside the same SQL transaction as the insert, using existing `dbo.DrawingRequests.RequestNumber` values to determine the next suffix. No new table, column, or schema change.
- Uses a transaction-owned SQL Server application lock `DMS-RequestNumber-<JalaliYear>` plus a locked lookup to serialize concurrent creations for the same year and avoid duplicate sequence allocation.
- First suffix is `0001`; subsequent requests increment it. The SQL MAX lookup defaults to 1 when no request exists for the current Jalali year. If suffix 9999 has already been used, creation fails explicitly rather than generating a malformed number.
- The generated number is reused for `DrawingRequests`, `DrawingRequestHistory`, and `Notifications`, preserving existing relationships.

Commits:
- `eaeb6c9a8700ea7c0bf4c78b247ef3d6d7c4f7a9` — Use Jalali year and sequential request numbers
- `f398dce6edc91844a2243963e3f4ad6498b295ac` — Ensure SQL Server application lock uses a variable
- `50f9c53e915e2f1c8f809036848880c61f8dcd45` — Normalize Jalali year to four digits
- `36e9afb63c8f5b978f6690df7c1adaebb63fa20d` — Start Jalali request numbering at 0001

Validation performed:
- JavaScript parser check passed for the full `backend/server.js` source.
- Source assertions previously passed for Jalali-year formatting, eight-digit output, transaction-owned application lock, and removal of the old timestamp/random format. This change updates the no-existing-requests default from `0` to `1` so the first suffix is `0001`.
- Calendar check confirmed Gregorian date `2026-10-12` maps to Jalali year `1405` with the backend formatter.
- Live SQL Server concurrency/integration tests have not been run; actual database compatibility and sequence behavior must be verified against the configured SQL Server.

## Workflow User Full Names — 2026-10-13
- Workflow timeline events now display the acting user's first name and family name directly below the role heading (Requester, Manager, Drawing Supervisor / Admin, Drawing Expert).
- The worklist request cards also display full names for Requester, Manager, and Assigned Expert instead of usernames when the name fields are available; usernames remain the fallback for missing name data.
- Backend `GET /api/drawing-requests` now returns `RequesterName`, `RequesterFamily`, `ManagerName`, `ManagerFamily`, `AssignedDrawingExpertName`, and `AssignedDrawingExpertFamily` using joins to existing `dbo.Users`.
- `WorkflowHistory` items now include `ActionByName` and `ActionByFamily` from `dbo.Users`, so each timeline entry identifies the actual actor.
- Added CSS for the full-name line beneath each timeline role.
- No database schema or workflow permissions were changed.
- Files changed: `backend/server.js`, `frontend/js/request-workflow.js`, `frontend/css/request-workflow.css`.
- Code commits:
  - `960c366f2a653893751a2d7175e7c79134efc42f` — Include user names in drawing request workflow
  - `099a4dc03c7ddcfac6574e7668464a36838e9d88` — Include user names in drawing request workflow
  - `0b90b0b43447875a6135e4aaba1036475a1c56ad` — Include workflow actor full names
  - `34e0aa2ecfd10277cc5b350835960985050bb7a2`, `3c06eedf14aeb3135c884f655c32a96d1fae08c3`, `86ee040434ea85b34e7a962df045b9df52283093`, `15907da14ccdb9103fefedbafb9adec0260edec0`, `bf074ab543989a76a689962cccbb5070436fb569` — Display workflow user full names
  - `6bd67d76306b5c9256f2e878c591bb2e1d25c3b0` — Style workflow actor full names
- Verification: fetched the latest versions of all three changed files from `main` and passed source assertions for the user joins, history actor fields, timeline name rendering, request-card names, and CSS selector. Live browser and SQL Server integration tests have not been run.

# NEXT ACTION

1. Pull the latest `main` branch and restart the backend/frontend as needed.
2. Open a request with existing Requester, Manager, and Assigned Expert users; verify each workflow event shows the acting user's Name and Family below the role title.
3. Verify the worklist card shows full names for Requester, Manager, and Assigned Expert, and falls back to Username when Name/Family are empty.
4. Check workflow history for manager approval/rejection, assignment, expert acceptance/completion, and cancellation; confirm each event shows the correct actor rather than the assigned user by mistake.
5. Record live browser and SQL Server/API test results.
