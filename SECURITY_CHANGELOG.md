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
- Server-side permission checks are applied to node, PDF, company-file and Expert Reports endpoints.
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
