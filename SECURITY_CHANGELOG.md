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

The four configured roles are:
- Admin
- DrawingSupervisor
- DrawingExpert
- VIEWER

VIEWER is configured as read-only in `SQL/security_setup.sql`.

## API protection
- All protected `/api/*` routes require an authenticated session.
- Server-side permission checks are applied to node, PDF and company-file endpoints.
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

## Audit
Login success, login failure and logout are written to `dbo.Logs`.

`Logs.LogID` should be an IDENTITY column so audit inserts do not need unsafe MAX(LogID)+1 logic.

## Database
Run:

`SQL/security_setup.sql`

The script:
- Creates missing RBAC tables.
- Seeds the four defined roles.
- Seeds the defined permissions.
- Seeds users from `tblUser.xlsx`.
- Preserves existing UserIDs by matching usernames.
- Creates UserRoles and UserManager relationships.
- Removes orphan RolePermissions.
- Creates useful indexes.
- Verifies orphan links and Logs.LogID identity status.

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
