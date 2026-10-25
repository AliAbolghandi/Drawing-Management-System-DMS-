# Project decision — Stamp phase stopped (2026-10-24)

The user explicitly stopped the Stamp phase because it did not deploy correctly. Do not restore or continue it. The current schema report for `dbDrawingManagment` contains no Stamp tables. Stamp-only routes/UI/migrations, vendored PDF.js/pdf-lib assets, and active Stamp security documentation have been removed. Preserve the existing Drawing Request workflow and all unrelated features.

## Current task — profile image storage
- Profile images must be stored on the filesystem using the protected storage root in `dbo.tblPath` where `PathID=5`.
- The filename is based on the active user's `Username`; do not add image binary columns to `dbo.Users`.
- The profile API must remain under `/api/auth/me/*`, require an authenticated session, enforce rate limits and CSRF/origin checks on state-changing requests, validate image MIME and file signatures, and never expose the storage root as a public static directory.
- Remove `backend/profile-routes.js` only after equivalent profile/profile-password/profile-image endpoints are implemented in `backend/auth.js`.

# DMS — AI Project State / Handoff

Last updated: 2026-10-24

## Current change status — 2026-10-24
- `backend/auth.js`: profile, profile-password and profile-image APIs are implemented in the existing auth router. Image files are resolved under `dbo.tblPath.PathID=5`, named from the active `Username`, accepts JPEG/PNG/WebP, crops selected originals in the browser to 512×512 JPEG, and caps the processed API payload at 8 MB for server safety; endpoints are protected by authentication, rate limiting and CSRF/origin checks on mutations.
- `backend/profile-routes.js` was deleted after moving the equivalent routes into `backend/auth.js`.
- Stamp-only vendored PDF.js/pdf-lib assets were deleted. Current source tree has no Stamp route/UI/migration files.
- Commits for this cleanup: `33c6641ab67d2ee91207713d121dec74ef33486d` (`backend/auth.js`), `c1df581d86bf29a7190466435dd08183e5fc49fd` (safe temporary upload filename), `acb3b59bc5a84c511d7780a35791044bd0736c22` (`backend/profile-routes.js` deletion), `7947908014ea19cc240c765e6362791c39e7bc07` (last PDF-lib asset deletion). Additional related file deletions and documentation updates are recorded in Git history.
Repository: AliAbolghandi/Drawing-Management-System-DMS-
Default branch: main

## Architecture
- Frontend: `frontend/` HTML/CSS/JavaScript.
- Backend: `backend/server.js` Node.js + Express.
- Authentication/RBAC: `backend/auth.js`, mounted under `/api/auth`.
- Admin DB routes: `backend/admin-db.js`.
- Database: SQL Server `dbDrawingManagment`, Windows Trusted Connection, `mssql/msnodesqlv8`.
- Main UI: `frontend/index.html`; workflow UI: `frontend/js/request-workflow.js`.
- Admin dashboard: `frontend/admin-dashboard.html`, `frontend/css/admin-dashboard.css`, `frontend/js/admin-dashboard.js`.

## Permanent requirements
- Official/default DMS calendar is Solar Hijri (Jalali). Existing DB/API date contract remains Gregorian ISO; UI converts Jalali <-> Gregorian.
- Preserve existing DB structures, API contracts, permissions, workflow statuses and functionality unless explicitly approved.
- Effective authorization is `UserRoles -> Roles -> RolePermissions -> Permissions`, checked by `PermissionCode`; frontend hiding is not a security boundary.
- Admin pages/APIs require authenticated active `Admin` role.
- Never commit credentials, tokens or secrets.

## Core database
- `dbo.Nodes`, `dbo.DanieliPDF`, `dbo.tblPath`
- `dbo.Users`, `dbo.UserManager`, `dbo.Roles`, `dbo.Permissions`, `dbo.RolePermissions`, `dbo.UserRoles`, `dbo.Logs`
- Workflow: `dbo.DrawingRequests`, `dbo.DrawingRequestStatuses`, `dbo.DrawingRequestAssignments`, `dbo.DrawingRequestHistory`, `dbo.Notifications`
- Production: `dbo.DrawingRequestExpertWork`
- Relationships are documented in `SQL/Relation between table.rpt`.
- `dbo.DrawingRequestAssignments.AssignmentID` is the unique FK target for `dbo.DrawingRequestExpertWork`.
- `DrawingRequestExpertWork` production fields: `PredictedPartCount`, `CroquisStartDate`, `CroquisEndDate`, `CroquisPartCount`, `ModelingStartDate`, `ModelingEndDate`, `ModelingPartCount`, `DrawingStartDate`, `DrawingEndDate`, `StandardPartCount`, `DrawnPartCount`.

## Profile image storage
- API routes: `GET /api/auth/me/profile`, `PUT /api/auth/me/profile`, `PUT /api/auth/me/profile-password`, `GET/PUT/DELETE /api/auth/me/profile-image`.
- Filesystem root is read from `dbo.tblPath.RootPath` where `PathID=5`; the storage directory is not exposed by static hosting. File names are based on the validated active `Users.Username` plus `.jpg`, `.png`, or `.webp`.
- The current schema report lists no `Users.ProfileImage` or `Users.ProfileImageContentType` columns; no database migration or image-binary columns are required.
- Validation completed: JavaScript syntax parse of `backend/auth.js` passed. SQL Server filesystem permissions, API 401/CSRF behavior, image upload/download/delete, and browser behavior still require runtime verification.

## Workflow / expert work
- Statuses: `PENDING_MANAGER`, `MANAGER_APPROVED`, `MANAGER_REJECTED`, `PENDING_DRAWING_APPROVAL`, `DRAWING_APPROVAL_REJECTED`, `ASSIGNED`, `IN_PROGRESS`, `TRANSFERRED`, `EXPERT_REJECTED`, `RETURNED_FOR_CORRECTION`, `PENDING_FINAL_APPROVAL`, `FINAL_APPROVED`, `FINAL_REJECTED`, `CANCELLED`.
- Expert work is assignment-level and additive. If Expert 1 records 10 Croquis and Expert 2 later records 3, request production total is 13; previous contribution is not overwritten.
- `Croquis` production = `CroquisPartCount` counted on `CroquisEndDate`.
- `Modeling` production = `ModelingPartCount` counted on `ModelingEndDate`.
- `Final Drawing` production = `StandardPartCount + DrawnPartCount`, counted on `DrawingEndDate`.
- A stage is not counted as completed production without its `EndDate`.
- Expert APIs exist under `/api/auth/expert-work/:requestId`; server-side permission and assignment ownership are enforced.
- Save Progress is implemented in `frontend/js/request-workflow.js` and does not move the request to final approval.

## Recent workflow fixes
- Jalali picker for all six Complete Drawing Work dates: commits `db09c5565daac00cdcde32f8808890555e0c3dc6` and `680321d5ac149a9f49f8d0979272e4239bd918fb`.
- Expert work column-order rebuild migration: `SQL/Rebuild-DrawingRequestExpertWork-ColumnOrder.sql`; commits `74c4bbc8e92f2b6f57844da1f42afbfd9d823a4c` and `80cb4f29b01cb2fc3735a54232e9ef359354ceac`.
- Final-approved request left-border fix: commits `714832db8eacf523c52a563eb6ba0b791bfa0ec7` and `8a2b161d0c72c57cb07df63163e3b83fcda4b68e`.
- Login 500 from undefined `setAuthCookie` fixed by commit `e5ed79ccd890798fd75352643d24331559da8db8`.
- Expert completion trigger syntax/compatibility fixes: `dd0e675eafd8a63e2864a765261f271dfce23a77` and `3a2814417976b6f827c52d59440f586f4536156b`.

## Production Reports — current task / 2026-10-15
User reported that the `Production Reports` section calculates incorrect values, especially completed Croquis, Modeling and Drawing parts, and requested a full recalculation review.

### Current implementation
- `frontend/js/admin-dashboard.js` calculates the report directly from protected admin table APIs rather than trusting the older aggregated production-report endpoint.
- Source tables loaded completely with pagination:
  - `DrawingRequestExpertWork`
  - `DrawingRequestAssignments`
  - `Users`
- Mapping is `ExpertWork.AssignmentID -> DrawingRequestAssignments.AssignmentID -> DrawingExpertUserID -> Users`.
- Each `AssignmentID` is explicitly deduplicated in `buildProductionReport()` before stage counts are added.
- Croquis is counted only when `CroquisEndDate` is inside the selected range, using `CroquisPartCount`.
- Modeling is counted only when `ModelingEndDate` is inside the selected range, using `ModelingPartCount`.
- Final Drawing is counted only when `DrawingEndDate` is inside the selected range, using `StandardPartCount + DrawnPartCount`.
- Zero, negative, NaN and missing part counts are not added to production totals.
- Delegated/previous assignments remain additive; a completed stage belonging to an earlier expert is not reassigned to the later expert.
- Predictions remain request-level forecasts and are counted once per `RequestID`, using the latest assignment prediction.
- Monthly Production groups completed stage production by the actual stage `EndDate` month.
- Rejected part count remains `نامشخص`; the current schema does not contain an authoritative rejected-part quantity.

### Latest code change — Jalali month attribution fix (2026-10-17)
- Root cause confirmed in `frontend/js/admin-dashboard.js` and `frontend/js/monthly-production-fix.js`: events were grouped by Gregorian `YYYY-MM`, then the Gregorian month-start date was converted to a Jalali label. For example, Gregorian September 2026 was displayed as Jalali `1405/06`, even though events on 2026-09-23 onward belong to Jalali `1405/07`.
- `frontend/js/admin-dashboard.js` now groups each completed stage and prediction by `DMSDate.toJalaliInput(eventDate).slice(0, 7)`; chart and table use that Jalali month key directly.
- `frontend/js/monthly-production-fix.js` was aligned with the same Jalali grouping to prevent the old implementation from reintroducing the bug.
- `frontend/admin-dashboard.html` no longer loads the duplicate `monthly-production-fix.js` renderer. The main dashboard is the sole active monthly renderer; cache-busting version updated.
- Commits:
  - `928ec3c7f7f357e5947a44d65ca46837b22fa874` — fix Jalali month grouping in production reports.
  - `c83fbbf0c045c77a4da839309c25ff9e54a0c7a0` — align monthly production helper with Jalali calendar.
  - `9ff6170b5ec46af468ff2bb472916446684d3b28` — remove duplicate monthly report renderer.
- Validation status: source transformations checked for remaining Gregorian month-key logic and duplicate script inclusion. Runtime/browser and live SQL verification were not possible in this session; do not mark the fix as runtime-tested until verified in the DMS environment.

### Backend note
- `GET /api/admin/dashboard/production-reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` remains an older SQL aggregation implementation in `backend/admin-db.js`.
- The current dashboard does not use that endpoint for rendering; it reads underlying protected admin table rows directly.
- Preserve the existing endpoint/API contract until the backend report is consolidated and tested. If this endpoint becomes a dashboard source, align its month grouping with the Jalali calendar before use.


## Dashboard report change — Standard vs Drawn parts (2026-10-17)
- Updated `frontend/js/admin-dashboard.js`: completed drawing work is now attributed to `DrawingEndDate` and counted separately from `StandardPartCount` into `StandardParts`, and `DrawnPartCount` into `DrawnParts`.
- Expert Performance chart/table display Croquis, Modeling, Standard parts, and Drawn parts separately; totals include all four production categories.
- Monthly Production chart/table display Predicted, Croquis, Modeling, Standard parts, and Drawn parts separately; production total is Croquis + Modeling + Standard + Drawn (predicted remains a separate forecast column and is not included in completed production total).
- Removed the rejected-parts state flag and the rejected-parts placeholder/cell from the production report. No database schema or stored SQL data was changed.
- Updated `frontend/admin-dashboard.html` headers and empty-state column spans to match the six-column expert table and seven-column monthly table.
- Commits:
  - `2267835c8f19522af5638b530f39409381829a64` — clean report state and repair the drawing-stage line break.
  - `d03a7b39752293586b30417cc462fff36044d983` — monthly table columns.
  - `f84d17c1ea420f97f9057e5ecec288e19cd3732f` — expert table columns.
- Validation: inspected current GitHub source and verified the separate source fields, chart/table references, and matching table headers/column spans. A Node syntax check, live browser test, API test, and SQL data comparison have NOT been run in this session.

## Process instruction change — final change reports (2026-10-17)
- Updated `DMS_AI_INSTRUCTIONS.md` to require every final response reporting project changes to include a section titled exactly `فایل‌های اصلی تغییرکرده:`, with a Markdown bullet list of the exact repository-relative paths changed in the current task.
- The list must only contain files actually changed; it must include `AI_PROJECT_STATE.md` whenever state was updated, and `DMS_AI_INSTRUCTIONS.md` whenever the instructions file changed.
- Final change reports must also state real commit hashes, distinguish structural checks from runtime/database tests, and list remaining actions.
- Commit: `c9753a5235f3738c402089714c1eaa0ad0c3a724` — Require changed-file list in final reports.


## Dashboard chart color fix — Standard parts (2026-10-17)
- Updated `frontend/js/admin-dashboard.js` so Standard parts use the dedicated `standard` chart class, Drawn parts use `drawn`, and Predicted parts use `predicted` in both Expert Performance and Monthly Production.
- Updated `frontend/css/admin-dashboard.css` with distinct chart-bar and legend colors: Standard parts = royal blue, Drawn parts = medium sea green, Predicted parts = orange. This avoids confusing Standard parts with Predicted parts and keeps the legend aligned with each series.
- No database, API, or production calculation behavior changed.
- Commits:
  - `6ea8e331b32b054af7378c609b8e1449fa81e9da` — assign separate chart classes and legend labels.
  - `1d6b6564c7ca9c21c13f8f63e990e2e488aa121e` — add distinct series colors.
- Validation: source-level replacements were inspected. Browser visual verification and runtime tests have NOT been performed.


## Mandatory UI/UX skill instruction (2026-10-17)
- Updated `DMS_AI_INSTRUCTIONS.md` to require every agent to read and follow `skills/DMS-UI-SKILL.md` from the current `main` branch before creating, modifying, fixing, reviewing, or otherwise working on any DMS UI/UX.
- The skill is authoritative project-specific UI/UX guidance; existing functionality, RBAC, workflow, API contracts, database structures, file paths, and technology stack must remain protected. User's latest explicit requirement takes precedence in conflicts, without silently changing other established constraints.
- Do not claim visual verification unless the rendered UI was actually reviewed in a browser.
- Instruction commit: `ec68763cb7daeff4566cccbebe69e15ffd54d338` — Require DMS UI skill for all UI work.
- Validation: fetched the existing skill file from `skills/DMS-UI-SKILL.md` and confirmed it exists on `main`; verified the instruction update was committed. No application code changed and no runtime tests were needed for this documentation-only change.

## Admin dashboard UI redesign — 2026-10-17
- Followed `skills/DMS-UI-SKILL.md` before making UI changes. Audited `frontend/admin-dashboard.html`, `frontend/js/admin-dashboard.js`, and `frontend/css/admin-dashboard.css`; retained the existing HTML structure, JavaScript data loading, report calculations, chart/table IDs, date behavior, and API calls.
- Updated `frontend/admin-dashboard.html` to cache-bust the dashboard stylesheet (`?v=20261017-industrial-ui-v1`) so the redesign appears after reload. Commit: `e7a6caf966a35870995fd8e7a54fd41d969286e2`.
- Updated only `frontend/css/admin-dashboard.css` with a restrained industrial dashboard treatment: tighter technical hierarchy, neutral dark surfaces, consistent borders, reduced decorative shadows/rounding, clearer metric cards, improved report tables and filter controls, keyboard focus styles, and reduced-motion support.
- Preserved distinct production chart colors: Standard parts blue, Drawn parts green, Predicted parts orange; Modeling remains a separate muted gold. Updated chart bars and legends to use matching values.
- No SQL schema/data, backend, permissions, workflow, or API contracts changed.
- Commit: `3a7a5fd9e3cb1b09ac29ad6cdcd62d6f4cebfea8` — Redesign admin dashboard with restrained industrial UI.
- Validation: GitHub source update succeeded. No local browser rendering, screenshot review, Node check, API test, or live database test was performed in this session. Treat visual verification as pending.

## Relative API base / configurable port — 2026-10-19

- Added `frontend/js/config.js` (loaded first via `<script src="js/config.js">` in `login.html`, `index.html`, `admin-dashboard.html`, `management.html`). It sets `window.DMS_API_BASE`: `''` (relative `/api/...`, same origin as the page) by default; `protocol//hostname:3000` only when the page runs on Live Server ports 5500/5501 (`DEV_BACKEND_PORT` in config.js). A preset `window.DMS_API_BASE` string overrides it.
- Replaced every hard-coded `http://${host}:3000/api` with `` `${window.DMS_API_BASE || ''}/api` `` in `login.html`, `index.html` (2 places), `js/script.js` (4), `expert-reports.js`, `admin-dashboard.js`, `monthly-production-fix.js`, `request-workflow.js`, `expert-drawing-work.js`. `management.js` already used `window.DMS_API_BASE`; `dashboard.html` left unchanged (already relative, Live Server fallback).
- `backend/server.js`: `const PORT = Number(process.env.PORT) || 3000;`.
- `backend/auth.js`: CSP `connect-src` reduced to `'self'` (removed `localhost:3000`/`127.0.0.1:3000`).
- Unchanged: Origin/Referer policy and CORS still use `DMS_FRONTEND_ORIGINS`; on a new server set it to the real origin (e.g. `http://server:PORT`, plus `http://host:5500` for Live Server). Behind a proxy set `DMS_TRUST_PROXY=1`.
- Commit: `c567c9d4367243208cd6f1506f0a493fbb14a957` — Use relative /api via frontend/js/config.js; configurable PORT; tighten CSP connect-src.
- Validation: `node --check` passed for all `frontend/js/*.js` and `backend/*.js`; `grep` confirms no `:3000` left in frontend except the Live Server fallbacks. No browser, API, or SQL Server test was run.

## App icons / favicon / manifest — 2026-10-19

- Added user-supplied icons: `frontend/assets/icons/favicon.ico` (16/32 px+), `frontend/assets/icons/dms-icon-192.png`, `frontend/assets/icons/dms-icon-512.png`.
- Added `frontend/manifest.json` (name `Drawing Management System`, short_name `DMS`, `start_url` `/`, `display` standalone, 192/512 icons).
- Added `<link rel="icon">`, `<link rel="apple-touch-icon">`, `<link rel="manifest">` right after `</title>` in `login.html`, `index.html`, `admin-dashboard.html`, `management.html`, `dashboard.html` (relative paths, same style as `css/`/`js/`).
- Icons/manifest are public static assets served by `express.static(FRONTEND_DIR)` in `backend/server.js` (needed by the public login page). No backend, CSP, RBAC, API, or SQL change; existing CSP (`img-src 'self'`, default `'self'` for manifest) already allows them.
- Validation: manifest JSON parse check and link-tag insertion inspected. No browser/runtime test performed. PWA install ("Install app") needs HTTPS or localhost; over plain `http://server:PORT` only tab icon works (a Windows shortcut with the `.ico` is the alternative).

## Responsive #nodeDetails + Add Request theme — 2026-10-19

- Followed `skills/DMS-UI-SKILL.md` (audit first, targeted CSS only; no HTML structure, JS, API, RBAC, workflow or DB change).
- `frontend/css/style.css` (appended block "Responsive details panel"): `.details-panel` is now a container (`container-type: inline-size`, name `details`); `.details-grid` = 2 columns, 3 columns at panel width >= 760px, 1 column at <= 400px (replaces the old viewport-only 1-column rule at <= 900px); header/section-heading/action-button rows wrap; `.srsc-folder-grid` uses `repeat(auto-fill, minmax(132px, 1fr))` instead of fixed 4 columns; long names wrap (`overflow-wrap`); action buttons get `min-height` 36px (44px at panel <= 400px) and visible `:focus-visible`; at viewport 901-1280px `.main-container` columns are `minmax(280px,1fr) minmax(360px,1fr)` so the details panel is not squeezed; panel padding reduced at <= 1280px and <= 900px (bottom 86px kept for the mobile bottom nav).
- `frontend/css/request-workflow.css`: `.request-drawing-btn` (`#addRequestBtn`) restyled to the DMS theme tokens (cyan accent, same size/radius/weight as `.upload-files-btn`, stronger tint as the primary action); `:disabled` rule unchanged.
- `frontend/index.html`: cache-bust versions for `style.css` and `request-workflow.css`.
- Requires container query support (Chrome/Edge 105+, Firefox 110+, Safari 16+); older browsers fall back to the 2-column grid with wrapping.
- Validation: CSS brace balance checked and diff inspected only. NO browser rendering, screenshots or runtime test performed; visual verification is pending.

## User Management panel — 2026-10-22
- Added sidebar entry `User Management`, inserted only when `GET /api/auth/me` includes effective permission code `DASHBOARD_USER_MANAGEMENT` (user specified PermissionID 32; code is the authorization key).
- Added `frontend/js/user-management.js` and `frontend/css/user-management.css`. The modal includes searchable user list, clickable user names, account metadata, assigned roles, effective role-derived permissions, last login/logout, latest 100 audit events, password reset, and account activation/deactivation.
- Added APIs in `backend/auth.js` under `/api/auth/user-management`:
  - `GET /users`
  - `GET /users/:userId`
  - `PUT /users/:userId/password`
  - `PATCH /users/:userId/status`
- Each endpoint uses API rate limiting, the existing Origin/Referer CSRF policy, `authenticate`, and `requirePermission('DASHBOARD_USER_MANAGEMENT')`; role access is not hard-coded.
- Password reset uses scrypt, requires 12+ characters, and revokes target sessions. Deactivation also revokes target sessions; self-deactivation is rejected.
- Login/logout values use existing `dbo.Users.LastLoginAt` and `dbo.Logs` records. Logout history only reflects events actually logged by DMS. Administrative events are logged under the acting user and include the target UserID in the action string because `dbo.Logs` has no separate actor/target columns.
- Main commits for this feature: `0e092740b05d5d922b8d68fd817dc494dfc9d842` (CSS), `45ae2174610467fb8385c29b68355d49f5bc73dd` (UI), `aed1afb57bf0654e27e0fce6a2c9a9d3822eefb3` (asset loading), `c259f9cc8af665370fc7fd9d0efcdcb315d38d3e` (backend and audit), `dbfd2ed20f7e6c82d1ec4d95c5b52c5d2d1c3ce1` (CSRF and rate-limit enforcement), `0e3823f6fa0c8b85a6d51006a03bd9b7480f313f` (audit actor attribution), `cee9ec98621f3edd4c860f4bba0efc7fac21dacc` (load user list on modal open).
- Validation status: source paths, RBAC tables/columns, and existing authentication contracts were inspected. Static syntax and live browser/SQL Server acceptance tests are not yet verified in the target DMS runtime.

## User Management — Admin-only RBAC editing — 2026-10-22
- User decision: User Management is Admin-only and is NOT assignable via a permission code. `backend/auth.js` `userManagementGuard = [rateLimit, csrf, authenticate, requireAdmin()]` (supersedes the earlier `DASHBOARD_USER_MANAGEMENT` guard). Sidebar entry is shown when `/api/auth/me` returns `user.isAdmin === true` (UI visibility only).
- User decision: minimum password length 8 (max 256); `validateNewPassword()` also requires upper-case, lower-case and a digit. Used by reset, create-user and self-change.
- User decision (access model): permissions stay role-based; Admin edits user roles and per-role permissions. No schema change (`dbo.UserRoles(UserRoleID,UserID,RoleID)`, `dbo.RolePermissions(RolePermissionID,RoleID,PermissionID)`).
- New/changed APIs under `/api/auth` (all Admin-only unless noted):
  - `PUT /me/password` {currentPassword,newPassword}: Admin changes own password; verifies current password; revokes the same user's other sessions.
  - `POST /user-management/users` create user (IsActive=1, scrypt hash).
  - `GET /user-management/roles` roles + permissions + role-permission map.
  - `GET|PUT /user-management/users/:userId/roles` read/replace user roles in a transaction; blocks removing Admin from the acting Admin or from the last active Admin.
  - `PUT /user-management/roles/:roleId/permissions` replace role permissions in a transaction.
  - Pre-existing uncommitted work found in the working tree and kept: `PUT /user-management/users/:userId` (profile), `POST .../unlock`, `DELETE .../sessions`, per-account login lockout (`accountAttempts`), `authenticate` re-validation from SQL every `AUTH_REFRESH_MS` (15 s) incl. IsActive, last-active-Admin guard on deactivation, target-user audit rows (`Action LIKE '%_TARGET_<id>'`).
  - Role/permission changes set `session.checkedAt = 0` so affected sessions re-resolve permissions on the next request.
- Audit actions (`dbo.Logs.Action`, acting user in UserID): `USER_CREATED_TARGET_<id>`, `USER_ROLES_CHANGED_TARGET_<id>`, `ROLE_PERMISSIONS_CHANGED_ROLE_<id>`, `USER_PASSWORD_CHANGED_SELF`, `USER_PASSWORD_CHANGE_FAILED_SELF`.
- Frontend: `frontend/js/user-management.js` adds New user, Roles & permissions editor, per-user Roles tab, My password; `frontend/css/user-management.css` adds `.user-mgmt-check`, `.user-mgmt-select`; cache-bust `?v=20261022-user-management-v2` in `frontend/index.html`.
- Not implemented: force password change at next login (needs a new column — requires approval), audit before/after values, password history, MFA, server-side pagination/export, listing individual sessions.
- Validation: `node --check backend/auth.js` and `node --check frontend/js/user-management.js` passed. No SQL Server, API or browser test was run. Commit: `be87f73e9c7420657dc1f8ef99a90c15826cafc6` — User Management Admin-only, role/permission editing, create user, own password change, min password 8.

## Profile dialog control refinement — 2026-10-24

- Updated `frontend/js/profile.js` only for profile dialog controls; existing profile APIs, image storage (`tblPath.PathID=5`), and password behavior remain unchanged.
- Replaced the photo-change text button with an accessible pencil-icon button (`Edit profile photo`); the removal action now uses a trash icon plus the visible `Remove` label.
- Replaced external Show/Hide password buttons with inline eye/eye-off icon controls inside each password field. Accessible labels and titles switch between `Show password` and `Hide password`.
- Commit: `28d7e85c50276ab1129ea615e29c50015b5c3c85`.
- Validation: checked the source replacements and confirmed the old visible Show button text is absent. Browser rendering, keyboard interaction, and runtime API behavior were not tested.


## Profile image crop and save confirmation — 2026-10-24

- `frontend/js/profile.js`: added an image crop modal with pointer-drag repositioning and zoom control; the cropped output is 512×512 JPEG. The original selected file has no frontend byte-size restriction and is not sent to the server.
- Photo selection and removal are staged locally. Clicking **Save Changes** opens an **Are you sure?** confirmation modal; only confirmation sends profile/password/photo changes. On successful completion, `dms-profile-dialog` closes. Canceling the confirmation does not apply the staged photo change.
- `dms-profile-avatar` uses a fixed 34×34 CSS box with an image child sized to 100% and `object-fit: cover`, regardless of source dimensions.
- `backend/auth.js`: implemented `GET/PUT /api/auth/me/profile`, `PUT /api/auth/me/profile-password`, and `GET/PUT/DELETE /api/auth/me/profile-image`. Files use `dbo.tblPath.PathID=5` and the active username as basename; no image binary column or public static path is used.
- Image upload validates declared MIME against JPEG/PNG/WebP signatures. The API caps the *processed crop payload* at 8 MB to prevent memory-exhaustion abuse; the user-selected original image is cropped in the browser before upload. Mutating routes apply the existing rate-limit and Origin/Referer CSRF checks; audit events are written to `dbo.Logs`.
- Profile password changes require the current password and accept 8–256 characters with no additional composition rules.
- Commits: backend `b2ee17525d3171c5f6ef4d26e72646388c2b94cf`, `ba0344426d61e644c5e1c6745de9789ee5f3e308`; frontend `c78ee4dabfecc79daa7fe53bf16f9c96a8130431`, `5c039dc2ba387cfacc27cf5d0843b6f9fd1fc7da`, `2c9b852ea11080caf93cb56c3a54785a79a185ef`, `2a132661fca96439ccaab2cd77703d3e7bdf6efb`, `c85e408517b84489f7e324e4c857e03e86025043`; cache refresh commits `7e3547ecf076fee34dd218dee3965f10452bb473`, `9271058f8ca9d63b54cfe56c068ad7aaf99bb7cf`, `73b39fc5042453b94cec35092c402bce4fb40852`.
- Validation: JavaScript parse checks passed for `backend/auth.js` and `frontend/js/profile.js`. SQL Server storage permissions, real API behavior, and browser crop/modal behavior remain unverified.

## Password confirmation modal stacking fix — 2026-10-24

- Updated `frontend/js/profile.js`: set `#dmsProfilePasswordConfirmModal` to `z-index: 3010`, above the password modal's shared `z-index: 3000`. This makes the confirmation appear in front of the password-entry dialog. On successful confirmation, existing code hides both confirmation and password modals, revealing the still-open `dms-profile-dialog`.
- Code commit: `01d2fc0680a74f7645e4d905acda3b321d8717cd`.
- Validation: checked the CSS selector and confirmation handlers in source; browser rendering and live password API behavior were not tested.


## Modal backdrop text-selection dismissal fix — 2026-10-24

- Updated backdrop-close handlers so a modal closes only when both pointer-down and pointer-up occur on the backdrop itself. Selecting text inside a dialog and releasing the pointer outside no longer counts as an outside click; an ordinary click on the backdrop still closes it.
- Files: `frontend/js/node-create.js`, `frontend/js/node-upload.js`, `frontend/js/profile.js` (profile, password and crop dialogs), `frontend/js/expert-reports.js`, and `frontend/js/management.js`.
- Commits: `a87a62b4d9da3b8eb062bfbbb1688e5c6bc00b5c`, `d09958777beb5731080d3f7753d1f54f1de83601`, `2475707f4c95635b9847a4f8d74a3add7d870d04`, `10882e05e7d2f220443f0aac41b2edb21da5d387`, `a8b86a6869bf6e6a1fedf0f870323a60ec7c1418`, `1fdac0573bef31d515cc7b66b61b3be8adb6545c`, `62c30f7e308b53c7474e7598bb8516b90676b9d1`.
- Validation: confirmed each targeted backdrop handler was updated. JavaScript syntax checks and browser/runtime tests have not yet been run.

## Drawing Requests worklist backdrop text-selection fix — 2026-10-24

- Updated `frontend/js/request-workflow.js` in the `init()` handler for `#rwWorklistModal`: it now closes from the backdrop only when both pointer-down and pointer-up occur on the backdrop. Selecting text inside `.rw-worklist-dialog` and releasing outside should no longer dismiss the worklist; a normal backdrop click still closes it.
- Commit: `183ebe187cc00585b09c3a697eda2ba8e84f0edb`.
- Validation: confirmed the exact handler was replaced in current GitHub source. JavaScript syntax check and browser/runtime test have not been run.

## Node hierarchy authorization fix — 2026-10-24

- Root cause: `GET /api/node-hierarchy/:nodeId` returned only hierarchy metadata (`NodeID`, `NodeCode`, `NodeName`) but required `FILE_VIEW`. The `VIEWER` and `Manager` roles have `NODE_VIEW` but not `FILE_VIEW`, so the frontend hierarchy request was denied and Main Root / First Child / Second Child remained blank.
- Updated `backend/server.js`: this metadata-only route now requires the established server-side `NODE_VIEW` permission. The separate `/api/node-hierarchy/:nodeId/full` route already uses `NODE_VIEW`; file and folder routes remain protected by `FILE_VIEW`.
- Updated `SECURITY_CHANGELOG.md` to record the authorization boundary. No database schema or role-permission data was changed.
- Commits: backend `48e4ca388e3c0f0a53f24fdfc689833ed82ba8c9`; security changelog `35b2bd8a414fe97c381d976febfbc585d4d5edff`.
- Validation: source-level route and permission mapping inspected. Live HTTP 401/403 checks, SQL Server-backed API execution, and browser verification have not been run; do not treat the fix as runtime-tested yet.

## Optional visual design skills — 2026-10-25

- Confirmed `skills/SKILL.md` already exists and its blob SHA matches the upstream `Leonxlnx/taste-skill/skills/taste-skill/SKILL.md` content; it is the `design-taste-frontend` skill.
- Added the upstream `SKILL.md` for `gpt-taste` at `skills/taste-skill-classics/gpt-taste/SKILL.md` (commit `0be6f027553f4b675d2c7c23a7654b81c016d462`).
- Added the upstream `SKILL.md` for `industrial-brutalist-ui` at `skills/taste-skill-classics/industrial-brutalist-ui/SKILL.md` (commit `0b4fa015ccd355fad0d566725cfef8c9c8da9f32`).
- Added the upstream `SKILL.md` for `image-to-code` at `skills/imagegen-skills/SKILL.md` (commit `fe336157913eade75110e56e2755e257e2569962`).
- Added `skills/README.md` with a quick guide explaining how to request each skill, DMS guardrails, and limitations of copying only `SKILL.md` (commit `24d2082608066f106b1c0b6e8368f260a7eccc39`).
- Updated `DMS_AI_INSTRUCTIONS.md` to describe these as optional, explicitly invoked visual skills that do not override the project-specific UI rules (commit `120b3de4675165022764fd2b11478e7586ade29a`).
- No application code, APIs, database structures, permissions, or workflow logic changed.
- Validation: GitHub fetch/create/update operations succeeded. Runtime/browser tests are not applicable to these documentation-only changes. The upstream skills' companion scripts/assets were not copied, so workflows requiring those files may need further vendoring.

# NEXT ACTION

1. Browser-test `rw-worklist-dialog` backdrop behavior first: ordinary backdrop click closes; select text inside the dialog and release outside, and confirm it stays open.
2. Browser-test other modal backdrop behavior: ordinary backdrop click closes; select text inside each affected modal and release outside, and confirm the modal stays open.
3. Browser-test password modal layering: click Change Password, enter valid values, click Done, confirm the confirmation modal appears in front; Cancel must return to password entry without changing the password.
4. Confirm Yes, Change Password updates the password, closes the confirmation/password modals, and reveals `dms-profile-dialog`; test API failure and ensure an error remains visible.
5. Browser-test profile crop/zoom, Save Changes confirmation, and cancel behavior; then test profile APIs on target SQL Server and verify `tblPath.PathID=5` storage.
6. Run the existing user-management RBAC and last-Admin protection checks documented above.
7. Do not restore the stopped Stamp phase.
