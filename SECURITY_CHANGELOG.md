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

The four configured roles are:
- Admin
- DrawingSupervisor
- DrawingExpert
- VIEWER

## Expert Reports
- `GET /api/auth/expert-reports` requires an authenticated session and the effective `DASHBOARD_REPORT_EXPERT` permission.
- Authorization is checked server-side from the session permission set populated from `UserRoles -> Roles -> RolePermissions -> Permissions`.
- The Expert Reports endpoint does not use `RoleID` as a substitute for the permission and does not trust a client-supplied permission claim.
- Unauthenticated requests are rejected with HTTP 401; authenticated users without the permission are rejected with HTTP 403.
- Report filters are validated as Gregorian ISO dates at the API boundary; the UI converts Jalali dates to the existing Gregorian API contract.
- Expert production is read-only and uses parameterized SQL inputs.

## API protection
- All protected `/api/*` routes require an authenticated session.
- Server-side permission checks are applied to node, PDF, company-file, Expert Reports endpoints.
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

Relative paths reject traversal such as `..`, absolute paths and invalid Windows filename characters.

## HTTP security
The backend sends:
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy
- Permissions-Policy
- Content-Security-Policy

JSON request bodies are limited to 1 MB.

## Frontend protection
- `/` opens `login.html`.
- `/login.html` is public.
- `/index.html` requires an authenticated session.
- Static frontend assets remain available for the login page and authenticated application.
- Frontend API requests use the session cookie.
- Expert Reports navigation is hidden unless `/api/auth/me` confirms `DASHBOARD_REPORT_EXPERT`; this is UI visibility only and is not treated as the authorization boundary.

## Audit
Login success, login failure and logout are written to `dbo.Logs`.

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

## Current limitations
- Sessions are stored in backend memory. Restarting the backend logs users out.
- Multiple backend instances require a shared session store such as SQL/Redis.
- The current API rate limiter is in-memory and per-process.

## User Management — 2026-10-22
- User Management APIs under `/api/auth/user-management` and `PUT /api/auth/me/password` are Admin-only: authenticated session plus active `Admin` role verified from SQL by `requireAdmin()`; they are not assignable through a permission code. All use rate limiting and the Origin/Referer CSRF policy.
- Admin can create users, edit profiles, assign roles, edit role permissions, reset passwords, unlock accounts and revoke sessions. Role/permission inputs are validated server-side and written in SQL transactions with parameterized queries.
- Password policy: 8–256 characters with upper-case, lower-case and a digit; scrypt hashing; plaintext is never stored or returned. Resets and deactivation revoke the target's sessions; own-password change requires the current password and revokes the user's other sessions.
- Safeguards: an Admin cannot deactivate themself or remove their own Admin role; the last active Admin cannot be deactivated or lose the Admin role.
- Sessions re-validate active state, Admin role and permissions from SQL at most every 15 seconds; role/permission edits force re-validation of affected sessions.
- Login is rate-limited per IP and per account; an Admin can unlock an account.
- Administrative events are logged in `dbo.Logs` under the acting user with the target ID in the action string (`..._TARGET_<id>`); target users' activity lists include them.
- User Management navigation is UI visibility only. Runtime SQL Server and browser acceptance tests remain pending.

## Profile images — 2026-10-24
- Profile images are stored as files under the root configured by `dbo.tblPath.PathID=5`; the file basename is the active user's `Username` and the extension is derived from validated image content. No image bytes are stored in SQL Server.
- The root is never exposed through static file hosting. Authenticated endpoints are available under `/api/auth/me/profile`, `/api/auth/me/profile-password`, and `/api/auth/me/profile-image`; mutation routes apply rate limits and Origin/Referer CSRF checks.
- The browser accepts original JPEG/PNG/WebP images without a frontend file-size restriction, provides drag/zoom crop controls, and sends a fixed 512×512 JPEG crop. The API validates image MIME against file signatures and caps the processed upload at 8 MB to mitigate memory-exhaustion abuse.
- Profile and password changes use parameterized SQL; password changes verify the current password, enforce an 8–256 character length with no composition rules, and store only scrypt hashes. Profile/photo changes are audited in `dbo.Logs`.
- Runtime API, SQL Server filesystem permissions, and browser acceptance tests remain pending.
