# DMS Security Changes

## Authentication
- Added `POST /api/auth/login`.
- Added `POST /api/auth/logout`.
- Added `GET /api/auth/me`.
- Authentication uses an HttpOnly `dms_session` cookie.
- Session lifetime is 8 hours and expired sessions are periodically removed.
- Password verification uses scrypt hashes.
- Plain-text passwords are never stored by the authentication code.
- Login failures are rate-limited per client IP.
- Login errors do not reveal whether a username exists.

## Authorization
The API now uses RBAC:

`Users -> UserRoles -> Roles -> RolePermissions -> Permissions`

Protected permissions include:
- NODE_VIEW
- NODE_CREATE
- NODE_EDIT
- NODE_DELETE
- PDF_VIEW
- FILE_VIEW
- FILE_Edit
- DASHBOARD_REPORT_EXPERT
- REQUEST_DRAWING_STAMP

The four configured roles are:
- Admin
- DrawingSupervisor
- DrawingExpert
- VIEWER

## Stamp Drawing
- Stamp approval/processing is authorized server-side by the effective `REQUEST_DRAWING_STAMP` permission.
- The Stamp authorization query requires both `PermissionID=18` and `PermissionCode=REQUEST_DRAWING_STAMP`; RoleID is not used as a permission substitute.
- A Stamp request can only be created by the requester of the parent `DrawingRequest`.
- Selected PDFs are revalidated against the parent Node before they are attached to a Stamp request.
- Danieli and SRSC source paths are validated server-side and traversal is rejected.
- Source PDFs are never overwritten by the Stamp workflow.
- Generated stamped PDFs are stored under `tblPath.PathID=4` and are downloadable only by the original requester while `ExpiresAt` is valid.
- Stamped files are deleted by a backend cleanup job after the one-day retention period.
- Stamp decisions use row locking and only a currently `PENDING` Stamp request can be approved or rejected.
- Completion is restricted to the user who approved the Stamp request.
- Generated output is validated as a PDF before it is written to the Stamp storage root.
- The browser Stamp workspace accepts PNG files only.
- The per-PDF completion endpoint accepts `application/pdf` binary bodies and rechecks the effective Stamp permission, approval ownership, request status, and item status server-side; concurrent item completion is serialized with SQL row locks.
- Request creation, approval/rejection, per-PDF completion, and requester downloads are recorded in `dbo.DrawingRequestHistory`.
- Durable lifecycle audit records are also written to `dbo.DrawingRequestStampAudit`, including system-recorded expiration and deletion of generated PDFs.

## Expert Reports
- `GET /api/auth/expert-reports` requires an authenticated session and the effective `DASHBOARD_REPORT_EXPERT` permission.
- Authorization is checked server-side from the session permission set populated from `UserRoles -> Roles -> RolePermissions -> Permissions`.
- The Expert Reports endpoint does not use `RoleID` as a substitute for the permission and does not trust a client-supplied permission claim.
- Unauthenticated requests are rejected with HTTP 401; authenticated users without the permission are rejected with HTTP 403.
- Report filters are validated as Gregorian ISO dates at the API boundary; the UI converts Jalali dates to the existing Gregorian API contract.
- Expert production is read-only and uses parameterized SQL inputs.

## API protection
- All protected `/api/*` routes require an authenticated session.
- Server-side permission checks are applied to node, PDF, company-file, Expert Reports and Stamp endpoints.
- API requests have a lightweight per-IP rate limit.
- State-changing API requests are checked against the configured Origin/Referer policy.
- CORS is restricted by `DMS_FRONTEND_ORIGINS`.

## File-system protection
Existing path validation was retained and is enforced for:
- Node storage paths
- SRSC/company folders
- File browsing
- File open/download
- Uploads
- Folder creation
- File/folder deletion
- Stamp output storage

Relative paths reject traversal such as `..`, absolute paths and invalid Windows filename characters.

## HTTP security
The backend sends:
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy
- Permissions-Policy
- Content-Security-Policy

The Stamp viewer loads pinned PDF.js/pdf-lib artifacts from `frontend/lib/pdfjs` and `frontend/lib/pdf-lib` on the DMS origin. The vendor workflow is `.github/workflows/vendor-pdf-libraries.yml`; the offline browser workflow still requires runtime verification on the factory LAN.

JSON request bodies are limited to 1 MB.

## Frontend protection
- `/` opens `login.html`.
- `/login.html` is public.
- `/index.html` requires an authenticated session.
- Static frontend assets remain available for the login page and authenticated application.
- Frontend API requests use the session cookie.
- Expert Reports navigation is hidden unless `/api/auth/me` confirms `DASHBOARD_REPORT_EXPERT`; this is UI visibility only and is not treated as the authorization boundary.
- Stamp UI visibility is not treated as an authorization boundary; Stamp APIs independently enforce permission and ownership.

## Audit
Login success, login failure and logout are written to `dbo.Logs`.

Stamp approval/rejection/completion actions are recorded in `dbo.DrawingRequestHistory`.

`Logs.LogID` should be an IDENTITY column so audit inserts do not need unsafe MAX(LogID)+1 logic.

## Database
see Relation  between table.rpt

## Password setup
Set a password without storing plaintext:

`node backend/set-password.js <username>`

Example:

`node backend/set-password.js ali.abolghandi`

## Deployment requirements
Set the allowed frontend origins explicitly in production:

`DMS_FRONTEND_ORIGINS=http://your-server:3000`

If the application is behind a trusted reverse proxy, set:

`DMS_TRUST_PROXY=1`

For production:
- Use HTTPS.
- Keep `NODE_ENV=production` so the session cookie gets the Secure flag.
- Do not commit passwords, tokens or PATs.
- Rotate/revoke any GitHub PAT that has previously been exposed in chat or source control.
- Back up the SQL database before applying migrations.
- Ensure `tblPath.PathID=4` points to the intended protected Stamp output storage.
- Keep the vendored PDF.js/pdf-lib versions pinned and review their license files when updating them.

## Current limitations
- Sessions are stored in backend memory. Restarting the backend logs users out.
- Multiple backend instances require a shared session store such as SQL/Redis.
- The current API rate limiter is in-memory and per-process.
- The Stamp approval UI must call the server decision endpoint and confirm `APPROVED` before enabling PDF completion; frontend state alone is not authoritative.

## Stamp access correction — 2026-10-22
- The Stamp PDF-count endpoint returns a count only; it does not return source PDF names or paths.
- Requesters without `REQUEST_DRAWING_STAMP` receive redacted source-file metadata from Stamp request details.
- Source PDF streaming is restricted to the user with `REQUEST_DRAWING_STAMP` who approved that Stamp request.
- SRSC Stamp discovery reads only direct PDF files in the Node's `SLD` folder; it does not traverse subdirectories.


## User Management — 2026-10-22
- Added permission-gated user management APIs under `/api/auth/user-management`.
- Access requires an authenticated session and effective `DASHBOARD_USER_MANAGEMENT` permission resolved from the current `/api/auth/me` permission set; no RoleID shortcut is used.
- User list/detail endpoints expose account metadata, assigned roles, effective role-derived permissions, login/logout timestamps, and the latest 100 records from `dbo.Logs`.
- Password resets use the existing scrypt hash format, require at least 12 characters, never return or store plaintext passwords, and revoke active in-memory sessions for the target user.
- Account activation/deactivation is permission-gated; users cannot deactivate their own account. Deactivation revokes the target user's in-memory sessions. Administrative audit events are attributed to the acting user and include the target UserID in the action because the existing `dbo.Logs` schema has no separate actor/target columns.
- User Management navigation is only inserted when `/api/auth/me` confirms `DASHBOARD_USER_MANAGEMENT`; this is UI visibility only. Backend endpoints independently enforce authentication and permission.
- Runtime SQL Server and browser acceptance tests remain pending.
