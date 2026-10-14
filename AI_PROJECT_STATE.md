# DMS — AI Project State / Handoff

Last updated: 2026-10-14
Repository: https://github.com/AliAbolghandi/Drawing-Management-System-DMS-
Default branch: main

## Architecture
- Frontend: HTML/CSS/JavaScript under `frontend/`.
- Backend: Node.js + Express under `backend/`.
- Database: Microsoft SQL Server `dbDrawingManagment`, Windows Trusted Connection via `mssql/msnodesqlv8`.
- Main frontend: `frontend/index.html`, `frontend/js/script.js`.
- Authentication/RBAC: `backend/auth.js` integrated by `backend/server.js`.
- Database administration UI: `frontend/management.html`, `frontend/js/management.js`, `backend/admin-db.js`.
- Main backend server: `backend/server.js`.

## Established database structure
Core tables currently referenced by the live repository:
- `dbo.Nodes`
- `dbo.DanieliPDF`
- `dbo.tblPath`
- `dbo.Users`
- `dbo.UserManager`
- `dbo.Roles`
- `dbo.Permissions`
- `dbo.RolePermissions`
- `dbo.UserRoles`
- `dbo.Logs`

`dbo.Nodes` established columns: `NodeID, ParentID, NodeCode, NodeName, IsActive, CreatedAt, UpdatedAt, FolderPath, PathID, JET_Position, Norme, Mass`.
Do not alter established database structures without explicit user approval.

## RBAC / security
- Authorization is based on effective `PermissionCode` values through `UserRoles -> Roles -> RolePermissions -> Permissions`.
- `RoleID` is a relational key, not a permission identifier.
- `backend/auth.js` provides 8-hour in-memory sessions, HttpOnly `dms_session`, scrypt password verification, login/API rate limiting, CORS/origin checks, security headers, CSRF guard, authentication middleware and audit logging to `dbo.Logs`.
- `requirePermission()` does not allow `req.user.isAdmin` to bypass RolePermissions.
- `requireAdmin()` checks active `Admin` role server-side.
- VIEWER is intended to be read-only; existing PDF/file/node permission semantics must remain intact.
- Sessions/rate limits are in memory; restart logs users out and multiple backend instances would require shared session storage.

## Mandatory security coding policy
Security is a mandatory requirement for all DMS code. New and modified frontend, backend, API, database, file, authentication, authorization, upload, download, workflow, and administrative code must be secure by default.
- Protected pages, APIs, files, dashboards, management functions and administrative functions must not be usable by unauthenticated users.
- Authentication and authorization must be enforced server-side for every protected API. Frontend hiding/redirects are not security boundaries.
- Admin endpoints must require server-side Admin authorization through the existing RBAC model.
- Permission checks must use effective `PermissionCode` relationships, not frontend state, hidden controls, `RoleID` assumptions, query parameters, or client claims.
- Direct API calls from outside the DMS UI must receive the same authentication and authorization checks; no unauthenticated API backdoor is allowed.
- Protected static pages such as `management.html` and `admin-dashboard.html` must not expose protected data/functionality merely because their URL is known. Access control must be enforced by the application/server.
- Validate all user-supplied IDs, paths, filenames, permissions, roles and workflow states server-side. Prevent path traversal and arbitrary filesystem access.
- Upload/download/delete/open operations require server-side authentication, authorization, validation and safe path handling.
- Database queries must use parameterized inputs and normal users must never receive arbitrary SQL execution.
- Security-sensitive changes must be checked with unauthenticated (401), unauthorized (403), Admin-only, direct URL, and direct API/bypass scenarios before completion.

## Existing important APIs
- Auth: `/api/auth`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/pending-drawing-count`
- Nodes: `/api/nodes`, `/api/nodes/search`, `/api/nodes/:nodeId`, `/api/node-hierarchy/:nodeId`
- PDF: `/api/pdfs`, `/api/pdf-open/:pdfId`, `/api/pdf-file/:pdfId`, `/api/srsc-pdfs/:nodeId`, `/api/srsc-status`
- Files: `/api/node-folder`, `/api/node-folders/:nodeId`, `/api/node-folder-files/:nodeId/:folderName`, `/api/node-file`, `/api/node-file-upload/:nodeId`
- Drawing workflow APIs are implemented in `backend/server.js`, including request worklists, notifications, drawing experts and `/api/drawing-requests/:requestId/action`.
- Admin database APIs are in `backend/admin-db.js` under `/api/admin/tables...` and are protected by `requireAdmin()`.

## Drawing / filesystem rules
- Node hierarchy uses `ParentID`; roots have `ParentID IS NULL`. Known roots include MIDA and REBAR.
- Folder naming convention is `NodeCode -NodeName` as currently implemented.
- Company folders: `SLD`, `DOC`, `PIC`, `Catalog`.
- SRSC status is based on real files anywhere under the four allowed top-level folders; empty top-level folders are cleaned conservatively.
- Danieli PDFs are represented by `dbo.DanieliPDF`.
- Existing Node color matrix: Danieli only = yellow; SRSC only = green; both = green; neither = default.

## Request workflow
The current backend contains request workflow logic and references:
- `DrawingRequests`
- `DrawingRequestStatuses`
- `DrawingRequestAssignments`
- `DrawingRequestHistory`
- `ActionCode`
- `Notifications`
The v04 design has 14 statuses including `PENDING_MANAGER`, `MANAGER_APPROVED`, `MANAGER_REJECTED`, `PENDING_DRAWING_APPROVAL`, `DRAWING_APPROVAL_REJECTED`, `ASSIGNED`, `IN_PROGRESS`, `TRANSFERRED`, `EXPERT_REJECTED`, `RETURNED_FOR_CORRECTION`, `PENDING_FINAL_APPROVAL`, `FINAL_APPROVED`, `FINAL_REJECTED`, `CANCELLED`.
Request permissions use the `REQUEST_DRAWING_*` PermissionCode model. Backend state/ownership checks are required; frontend visibility is never the authorization boundary.

## Current admin dashboard implementation — 2026-10-14
Implemented frontend dashboard:
- `frontend/admin-dashboard.html`
- `frontend/css/admin-dashboard.css`
- `frontend/js/admin-dashboard.js`
Features:
- KPI cards for total Nodes, Danieli PDFs, Users, Roles, Audit Logs and Drawing Requests.
- Last-7-days audit activity bar chart.
- Drawing Request status distribution chart when `DrawingRequests` exists.
- System Health indicators for node records, active users, notifications and failed actions.
- Recent audit activity list.
- Refresh button.
- Navigation to DMS and Database Management.
- Dashboard data uses existing protected `/api/admin/tables` and `/api/admin/tables/:tableName/rows` APIs; no duplicate statistics are stored and no database schema was changed.
- If workflow tables are absent, the dashboard reports workflow unavailable instead of failing.
- Admin authorization remains server-side through the existing admin database API.
- `frontend/management.html` has an `Admin Dashboard` button.
- Admin Dashboard is reachable from the main DMS sidebar `Dashboard` item for Admin users.
- Dashboard page now has vertical scrolling so all lower panels remain reachable on smaller screens.

Dashboard limitation:
- This first implementation uses the generic admin-table API, so some values are table row counts / latest 200 rows rather than dedicated aggregate SQL. Exact all-time workflow status counts and exact 7-day activity counts are therefore not guaranteed when more than 200 records exist.

## Security fix — 2026-10-14
- `backend/auth.js` protects direct access to `/management.html` and `/admin-dashboard.html` at the server middleware layer before `express.static()` can serve them.
- Unauthenticated direct navigation is redirected to `/login.html`.
- Authenticated non-Admin users receive HTTP 403 for those pages.
- Existing `/api` authentication middleware remains in force, so direct API calls still require the session cookie and Admin APIs still require `requireAdmin()`.
- `frontend/js/script.js` hides the Admin Dashboard sidebar button from non-Admin users and routes an Admin click on `Dashboard` to `admin-dashboard.html`.
- No database schema was changed.

## Pending Drawing Request notification — 2026-10-14
- Added authenticated endpoint `/api/auth/pending-drawing-count` in `backend/auth.js`.
- The count is calculated from the CURRENT workflow status and the logged-in user's responsibility, not from an `IsRead` flag. This means the sidebar badge represents requests still waiting for that user/type of user to act.
- Current responsibility mapping:
  - `PENDING_MANAGER` -> `DrawingRequests.ManagerUserID = current user`.
  - `ASSIGNED`, `TRANSFERRED`, `RETURNED_FOR_CORRECTION` -> `DrawingRequests.AssignedDrawingExpertID = current user`.
  - `PENDING_DRAWING_APPROVAL` -> users with `REQUEST_DRAWING_ASSIGN` permission.
  - `PENDING_FINAL_APPROVAL` -> users with `REQUEST_DRAWING_FINAL_APPROVE` permission.
- `frontend/js/script.js` updates `#dmsRequestsBadge`, hides it at zero, displays `99+` above 99, refreshes on load and every 30 seconds, and exposes `window.DMS.refreshPendingRequestBadge()` for immediate refresh hooks.
- The badge is informational only; all actual workflow actions remain protected by backend authorization.

## Repository recovery note — 2026-10-14
- An intermediate attempt accidentally replaced `backend/server.js` with an incomplete file. The branch was immediately recovered by moving `main` back to the known-good commit `e397c83e4e01bfad18db80c026cc7426c5daa560` and applying the new changes on top.
- Current `main` therefore retains the full known-good `backend/server.js` from `e397c83e4e01bfad18db80c026cc7426c5daa560`.

## Verification
- `frontend/js/admin-dashboard.js` had previously passed `node --check`.
- GitHub source was inspected after the changes.
- Runtime SQL Server/LAN UI testing has NOT been performed in this session.
- `node --check` for the newly modified `backend/auth.js` and `frontend/js/script.js` has not been run in this environment.

## Constraints
- Do not change existing database structures without explicit user approval.
- Do not remove existing functionality.
- Preserve API contracts, naming conventions and folder structure.
- Never commit passwords, API keys, tokens or secrets.
- For significant changes: implement -> test/syntax-check -> commit -> update this file -> record commit -> update NEXT ACTION.


## Expert drawing work tracking — requirements recorded 2026-10-14

Detailed durable specification: `docs/EXPERT_DRAWING_WORKFLOW.md` (commit `6a7bd24cd70e15f6c82f0fe89273955e45beca1b`).

Confirmed business rules:
- Each drawing request tracks predicted part count, Croquis/vector sketch, Modeling, and Final Drawing.
- Accept must require a valid predicted part count, persist it, then set status to `IN_PROGRESS`.
- Stage data is saved persistently as work progresses across days; it cannot live only in the Complete Work modal.
- Complete Work opens a modal and must be blocked until all required Croquis, Modeling, and Final Drawing fields are valid.
- Croquis and Modeling each require start date, end date, and part count.
- Final Drawing requires start/end dates, standard-part count, and drawn-part count.
- Counts must be non-negative; end date must not precede start date.
- A request normally has one current expert, but may be reassigned. Each expert's work must remain attributable to that expert's specific assignment; reassignment must not overwrite prior contributions.
- Data must be stored in SQL Server for future reporting.

Schema findings from current `SQL/Relation between table.rpt`:
- `dbo.DrawingRequestAssignments.AssignmentID` is the correct candidate key to associate work with a specific expert assignment; it includes `RequestID`, `DrawingExpertUserID`, `AssignedAt`, `AcceptedAt`, `CompletedAt`, `IsCurrent`, and `AssignmentStatus`.
- `dbo.DrawingRequests` holds request-level status/current expert; `dbo.DrawingRequestHistory` records workflow actions/status transitions.
- A new table tentatively named `dbo.DrawingRequestExpertWork` is proposed. This is not yet implemented and no migration has been applied.
- One design decision remains unresolved: for a request transferred between experts, should Complete Work require all three stages on the current assignment, or should completion aggregate valid stage contributions across multiple assignments? See the detailed specification.
- Existing database tables must not be changed without explicit approval. First implementation step is to resolve the completion rule, then add an idempotent migration and secure assignment-scoped APIs/UI.

# NEXT ACTION
1. Resolve the expert-work completion rule in `docs/EXPERT_DRAWING_WORKFLOW.md`: per-current-assignment completion vs. aggregating contributions across multiple expert assignments.
2. Re-inspect the current `backend/server.js`, `frontend/js/request-workflow.js`, and `SQL/Relation between table.rpt` before implementation.
3. Design and add an idempotent SQL migration for `dbo.DrawingRequestExpertWork`, linked to `dbo.DrawingRequestAssignments.AssignmentID`; do not modify existing tables without explicit approval.
4. Implement server-side persistence and authorization for predicted part count and each expert's Croquis, Modeling, and Final Drawing data.
5. Update expert Accept and Complete Work UI, including progressive stage saves and mandatory modal validation.
6. Syntax-check changed JS, inspect SQL, and test auth/permissions, invalid counts/dates, partial saves, reassignment, and completion blocking. Do not claim SQL runtime tests unless run.
7. Commit code and update this file with exact commit SHA, actual test results, known issues, and next actions.
