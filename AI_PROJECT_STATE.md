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
- Auth: `/api/auth`, `/api/auth/me`, `/api/auth/logout`
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
The current backend already contains request workflow logic and references:
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
- `frontend/management.html` now has an `Admin Dashboard` button.

Dashboard limitation:
- This first implementation uses the generic admin-table API, so some values are table row counts / latest 200 rows rather than dedicated aggregate SQL. Exact all-time workflow status counts and exact 7-day activity counts are therefore not guaranteed when more than 200 records exist.
- Main DMS sidebar has not yet been changed; dashboard is currently reached from Database Management.

## Security issue discovered — 2026-10-14
- User reported that `management.html` and `admin-dashboard.html` can currently be opened without login.
- The coding policy has now been updated in `DMS_AI_INSTRUCTIONS.md` with mandatory secure-by-default rules.
- The next implementation task is to enforce authentication before protected pages can expose any management/dashboard content, while preserving the existing server-side Admin authorization for their APIs.
- Direct API access must be tested separately from UI access; knowing a URL must never grant access.

## Current repository discrepancy discovered 2026-10-14
- Previous handoff described `SQL/Inserttable.sql` and a v04 migration commit, but the current GitHub `main` tree was inspected and currently contains only `SQL/Relation between table.rpt` under `SQL`; `SQL/Inserttable.sql` is not present in the live tree.
- Do not assume the old migration commit/state exists on current `main`; verify GitHub before further SQL changes.

## Recent dashboard commits
- `47093daab4fa7fdd2f72883a4ab98c363d7280ae` — temporary dashboard backend module created; unused.
- `802b759ab455e14420d5772f82416461d7c4988f` — removed unused dashboard backend module.
- `87432b46ed21a70f46fb928d124bd01fb1b314e9` — added `frontend/admin-dashboard.html`.
- `590253fe80e7297d3495ce8f6564caa22983e32f` — added admin dashboard CSS.
- `bc6f4922a86e3f35b6ca74957281937c8a2bdc68` — added admin dashboard JavaScript.
- `fa3c43d0012d8bc56b4e12fa54635574b37becfc` — linked Database Management to Admin Dashboard.
- `276ed5d1367cc9eba131ba1d2ab4a256beed054a` — added mandatory secure-by-default coding rules to `DMS_AI_INSTRUCTIONS.md`.

## Verification
- `frontend/js/admin-dashboard.js` was syntax-checked with `node --check`; it passed.
- GitHub source for changed dashboard files was inspected after creation.
- Runtime SQL Server/UI testing has NOT been performed in this session.
- The reported unauthenticated page-access issue has not yet been fixed in code; only the mandatory coding policy has been added.

## Constraints
- Do not change existing database structures without explicit user approval.
- Do not remove existing functionality.
- Preserve API contracts, naming conventions and folder structure.
- Never commit passwords, API keys, tokens or secrets.
- For significant changes: implement -> test/syntax-check -> commit -> update this file -> record commit -> update NEXT ACTION.

# NEXT ACTION
1. Fix `frontend/management.html` and `frontend/admin-dashboard.html` so unauthenticated users cannot access protected content, using the existing authentication/session model without weakening server-side `requireAdmin()` checks.
2. Inspect `backend/server.js` static-file/page serving and `backend/auth.js` before implementing the page guard; prefer server-side protection for protected pages.
3. Verify direct unauthenticated requests to both pages and to `/api/admin/tables...` return authentication/authorization failures as appropriate.
4. Syntax-check and commit the security fix.
