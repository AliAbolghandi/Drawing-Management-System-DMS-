# Current task — SQL-backed node search and per-user request limits (2026-11-08)

## Implemented status
- Search results are sourced from SQL Server API output, not the client's previously loaded tree state. All matching Nodes and their complete ancestor paths are rendered in a dedicated search tree; the displayed total is `data.matchIds.length`.
- Search requests are single-flight, the Search button is disabled while running, and successful exact-query responses are cached for 30 seconds (up to 20 query entries).
- General protected API traffic is limited to 240 requests per authenticated UserID per minute. Node search has an independent limit of 20 requests per authenticated UserID per minute and does not consume the general API counter.
- Main implementation commits: `1605722b6993a33227a1ef92e9b9b8847cab2268`, `26185eadee0c3684deca47828b4f280605b78c08`, `1d775cb471456e523673789c987dd7b51cf03755`, `ba5b2834c7de6676833107878a6e405acca397af`, `ef1a48068a67b034e42f7abf8b4e7427405b3e0f`, `fc32c5846e60679b6aba83913c472ddb7c382b13`, `2795adb8e10c40715443184625f3d552fff72ed5`.
- Code has been committed to `main`. Syntax, browser, SQL Server, shared-IP, and 401/403/429 runtime tests remain pending.

# Previous task — Audit Management UI and read-only search (2026-11-01)
## Audit event detail modal — 2026-11-01
- The Details action (.dms-audit-detail-btn) now opens a dedicated, larger modal (#dmsAuditDetailModal) above the Audit Management search modal. The existing field/value detail table and read-only API are preserved.
- The detail modal closes with its close button, backdrop click, or Escape. Escape closes the detail modal first and leaves the underlying Audit Management search modal open; closing the parent closes both.
- Responsive dialog uses up to 98vw × 96vh on desktop and full viewport on small screens. No database, API, or permission changes.
- Files: frontend/index.html, frontend/js/audit-management.js, frontend/css/audit-management.css.
- Validation: source-level replacement checks completed; browser visual/runtime and live API tests remain pending.


- Added the Audit Management navigation entry to the main sidebar. It is revealed only when `/api/auth/me` returns at least one of the five audit PermissionCodes.
- Added a modal with Node and exact-username search modes, mandatory Jalali date range inputs, event details, and bounded 25-row pagination.
- Frontend converts Jalali input to UTC ISO timestamps using the existing `DMSDate` helper. Audit timestamps are displayed through the existing Jalali formatter.
- Added idempotent SQL seed `SQL/AuditManagementPermissions.sql` for the five audit PermissionCodes; it does not hard-code identity IDs or assign permissions to roles. Run it once, then grant the required codes to intended roles through the existing Role Permissions UI.
- Fixed Audit Management initialization: `frontend/index.html` now loads `js/audit-management.js` with `defer`, because the script tag precedes the sidebar button and modal markup. The previous synchronous load ran before those elements existed, causing initialization to fail. Cache version bumped to `20261101-audit-v2`. Commit: `cc887d73509e95f02fc49756b4c4f7d440167ee9`.
- Added `backend/audit-routes.js` with read-only paginated search and per-event detail routes. Node mode is restricted to FILE/NODE/WORKFLOW; user mode matches `Logs.UserName` (actor only) and independently gates all five categories by PermissionCode. Detail reads repeat category authorization.
- Mounted the routes behind the existing API rate limiter, Origin/Referer CSRF middleware, and authenticated session middleware. No RoleID-based authorization, schema change, audit edit/delete, or unbounded fetch was introduced.
- Commits: `2c214e097692946148896a2b50972edd1c087350` (route creation), `d41d7ba3d26b75873d4f42b404e67f86a1922ada` (secure mount), `a93eb300e2fc1b1c40c0570aab7b300d6dab0188` (frontend behavior), `fa14be02f1523f179a207e358851723e47af6f4a` (styles), `c3049094159d8d6a299923c9c6adf2627b7ff3b2` (navigation/modal), `68555d1d009b8bd8027478943611f8643f4263ba` (permission seed), `2a1e7498d2b0b08f56aa46605f28a4ec77994701` (responsive form layout), `1936288c5670298db6bb0e3ad52ace34f30561a6` (single API rate-limit/auth pass), `6827a8ad87ad939d38d2160b753abee552cc3a4c` and `80701e7464c54e01f8825da64afb6e88a51073bc` (documentation).
- Validation status: source files and route wiring inspected. Runtime JavaScript, SQL Server query, permission-denial, browser responsive, and end-to-end acceptance tests have not yet been run in the target environment; do not mark this feature production-verified until those tests pass.

# Project decision — Stamp phase stopped (2026-10-24)

The user explicitly stopped the Stamp phase because it did not deploy correctly. Do not restore or continue it. The current schema report for `dbDrawingManagment` contains no Stamp tables. Stamp-only routes/UI/migrations, vendored PDF.js/pdf-lib assets, and active Stamp security documentation have been removed. Preserve the existing Drawing Request workflow and all unrelated features.

## Current task — profile image storage
- Profile images must be stored on the filesystem using the protected storage root in `dbo.tblPath` where `PathID=5`.
- The filename is based on the active user's `Username`; do not add image binary columns to `dbo.Users`.
- The profile API must remain under `/api/auth/me/*`, require an authenticated session, enforce rate limits and CSRF/origin checks on state-changing requests, validate image MIME and file signatures, and never expose the storage root as a public static directory.
- Remove `backend/profile-routes.js` only after equivalent profile/profile-password/profile-image endpoints are implemented in `backend/auth.js`.

# DMS — AI Project State / Handoff

Last updated: 2026-11-08

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


## Profile dialog Taste Skill redesign — 2026-10-25

- Updated `frontend/js/profile.js` to restyle `dms-profile-dialog` and its related crop, confirmation, and password modals using the requested upstream `design-taste-frontend` skill's app-screen guidance.
- Kept the existing HTML structure, element IDs, event handlers, API calls, staged photo changes, crop behavior, save confirmation, password confirmation, and password rules unchanged. No backend, API, RBAC, database, or workflow changes were made.
- Visual direction: DMS dark navy surfaces, cyan as the single action accent, stronger typography, larger touch targets, a more structured identity section, and responsive single-column form layout on small screens. No new dependencies or remote assets were added.
- Taste Skill source reviewed: upstream `skills/taste-skill/SKILL.md` and `skills/taste-skill/references/app-screens.md`. `skills/DMS-UI-SKILL.md` was not present on the current main branch (fetch returned 404; repository skill index says to use it only if it exists).
- Commit: `ceb29705d3112cbaa08938694f6aaae51cb5c936`.
- Validation: source replacement completed through GitHub API. Browser screenshots, keyboard flow, responsive rendering, JavaScript runtime, and profile/password API behavior have not been tested in this session.


## Audit logging — File Upload stage (2026-10-25)

- User confirmed the SQL migration `SQL/Add-DMS-Audit-Log.sql` was executed successfully. The migration adds `dbo.Logs.TargetType`, `TargetID`, `DetailsJson` and reporting indexes.
- Current stage updates `backend/auth.js` `writeAudit(userId, username, action, ip, metadata)` to persist optional target/context columns while keeping existing four-argument callers compatible.
- `backend/server.js` `POST /api/node-file-upload/:nodeId` writes one audit row after each successful file move: `FILE_UPLOAD` for a new file and `FILE_REPLACE` when an existing regular file was replaced.
- Audit target: `TargetType='NODE'`, `TargetID=NodeID`. `DetailsJson` includes NodeID/code/name, PathID, company folder, relative path, filename, size, extension and prior file size/modified time for replacements. It intentionally excludes absolute storage paths and secrets.
- The API response contract and existing RBAC/path validation are unchanged. Audit write failures are reported by the existing `writeAudit` warning and do not roll back a successful file write.
- Commits on `main`: `9bfcdb1389aa788e5872190fe8e71f6ae6ede130` (structured audit writer), `4dc307e3bb2bf93ab833b1ca420dcbff759f7a81` (upload/replacement audit), `43fe631dca5ec270c9344894477e4e96ed3ca710` (include NodeName in audit context), `63a0259b74766285b60e83679d440b001383e9b9` (security changelog), `5153b93ac77edc11aa0f81f429a9f117b6d68167` (project state). Runtime SQL/HTTP verification is pending user test.

## File Audit — additional file operations (2026-10-25)

- Commit `6edafdc219c4732bd0241e81e06547868aabd443` updates `backend/server.js`.
- `DELETE /api/node-file` now writes `FILE_DELETE` for files and `FOLDER_DELETE` for recursively deleted subfolders, after the filesystem deletion succeeds. Details include the Node context, relative path, item type, size/modified time when applicable, and whether deletion was recursive.
- `POST /api/node-folder` writes `FOLDER_CREATE` only when the requested directory did not already exist; details include Node context and relative folder path.
- `GET /api/node-file` writes `FILE_VIEW` for inline files and `FILE_DOWNLOAD` for attachment delivery after a successful sendFile callback. Existing permission checks and path containment checks remain in place.
- All events use the central `dbo.Logs` writer, target the Node, and avoid recording absolute storage paths.
- Structural source review only; syntax/runtime, SQL Server, API authorization and browser checks are pending user validation.

## Drawing request workflow audit — 2026-10-25

- Commit `656dd8fc13cb0787e33df76384ef90ac9ac45132` updates `backend/server.js`.
- Successful `POST /api/drawing-requests` writes `REQUEST_CREATED` to `dbo.Logs` after the request transaction commits.
- Successful `POST /api/drawing-requests/:requestId/action` writes the existing workflow action code after the workflow transaction commits.
- Events use `TargetType='DRAWING_REQUEST'` and `TargetID=RequestID`; details include request number, Node ID/code, action, from/to status, and target expert identity when assigning/transferring. Comment text is not copied into audit details.
- Runtime workflow/API tests remain pending. File audit events were confirmed by the user on 2026-10-25.

## Audit logging — Node and administration batch (2026-10-25)

- Commits: `76f9542ee19d8a66174b5c7689826fae0cc0e214` (`backend/server.js`), `11c1145b033af98e326a0dae212452feecffba12` (`backend/auth.js`), `4ddaa52d80c85ab9ba87dada547e510453ac0d87` (`backend/admin-db.js`).
- Node create/update/delete now writes structured events: `NODE_CREATED`, `NODE_UPDATED`, `NODE_ACTIVATED`, `NODE_DEACTIVATED`, `NODE_DELETED`; events use `TargetType='NODE'` and the NodeID as TargetID. Updates include changed field names and active-state transition context.
- User-management audit events now include structured USER targets for create/profile/status/password-reset/unlock/session-revoke/role-change operations while retaining existing Action strings used by the user activity view. Passwords and hashes are never logged.
- Role permission changes include ROLE target metadata and before/after PermissionID lists; user role changes include before/after RoleID lists.
- Generic Admin table insert/update/delete events in `backend/admin-db.js` include table name, primary-key identifiers, operation and changed column names; they do not log submitted row values or password fields.
- JavaScript source parsing passed for all three changed backend files. Live SQL Server/API tests have not been run; do not mark this batch as runtime-verified until the user tests it.
- Drawing request workflow audit was tested by the user on 2026-10-25: request creation, manager decisions, expert assignment/acceptance/completion, and correction return produced structured rows in `dbo.Logs`.

## Admin Dashboard modal click reliability fix — 2026-10-27

- Updated `frontend/index.html` so the Dashboard sidebar click is handled in the capture phase directly by the modal controller, independent of the earlier navigation listener or the `active` class.
- Added an explicit `.dms-dashboard-modal.hidden { display: none !important; }` rule to ensure the closed Dashboard modal stays hidden despite its flex display rule.
- The change is limited to the Dashboard nav click and Dashboard modal visibility. Management modal behavior, dashboard contents, API, RBAC, database, and workflow code are unchanged.
- Commit: `7c22cb98f9b038ee94ce42791fa439765222b2c0`.
- Validation: source anchors and all inline JavaScript blocks in `frontend/index.html` passed syntax parsing. Browser/runtime verification remains pending.

## Dashboard navigation conflict fix — 2026-10-27

- Root cause confirmed in `frontend/js/script.js`: a capture-phase click handler for `[data-dms-nav="home"]` called `window.location.assign('admin-dashboard.html')`, overriding the modal controller in `frontend/index.html`.
- Removed only that conflicting click handler. Kept the existing Admin check and Dashboard visibility logic intact; the existing modal controller now handles the click.
- Commit: `abd82f2dccddc4bcb860cf3e7958aa1148fb75a7`.
- Validation: source inspection confirms the conflicting `window.location.assign('admin-dashboard.html')` handler is removed. Browser/runtime verification remains pending.

## Admin Dashboard modal — 2026-10-27

- The active Dashboard navigation item (data-dms-nav="home") in frontend/index.html now opens admin-dashboard.html?dmsModal=1 inside a responsive iframe modal rather than scrolling to the tree.
- The modal supports close button, backdrop, Escape, and page-scroll locking. Same-origin messages from the dashboard iframe close it or switch to the existing Database Management modal; the reverse transition from Management to Dashboard also opens the Dashboard modal.
- frontend/js/admin-dashboard.js makes both DMS/back buttons close the modal when embedded and makes Database Management switch to the parent Management modal; normal standalone navigation remains unchanged.
- No backend, API, RBAC, database, or workflow behavior was changed.
- Validation: source-level replacements and message origins/path allow-list were checked. JavaScript syntax, browser interaction, and live Admin/API tests were not run.

## Admin Database Management modal — 2026-10-27
- The Administration sidebar item `data-dms-nav="management"` in `frontend/index.html` now opens Database Management inside a large responsive modal with an iframe instead of navigating away from the DMS home page.
- `frontend/management.html?dmsModal=1` retains the existing Admin authentication/API checks and database management behavior. Its Back to DMS control closes the parent modal; Admin Dashboard navigation exits the modal and opens the dashboard in the top-level page.
- The parent accepts modal messages only from the same origin and only permits navigation to `admin-dashboard.html`. Closing via the close button, backdrop, or Escape clears the iframe and restores page scrolling.
- Commits: `79367bf27a247200c2d1024abb8ca80e465b2e55` (`frontend/index.html`); `19ac1a4bd2c9c35a4e4bb1d639319ec1eb4660d3` (`frontend/js/management.js`); `4cd716958e61ebe99deced0725c8de3782450ce3` (`frontend/management.html`).
- Validation: verified source replacement anchors and modal/message wiring structurally. JavaScript syntax checks, browser interaction/responsive checks, and live Admin/API acceptance tests have not been run in this session.

## Dashboard modal cache refresh — 2026-10-27

- `frontend/js/script.js` on `main` no longer contains the old capture-phase `window.location.assign('admin-dashboard.html')` handler; commit `abd82f2dccddc4bcb860cf3e7958aa1148fb75a7` removed that conflict.
- `frontend/index.html` previously loaded `js/script.js` without a version query, allowing a browser to reuse a cached script. Added `?v=20261027-dashboard-modal-fix` to force clients to request the corrected script.
- Validation: checked current GitHub source for the removed navigation call and confirmed the script tag replacement. Browser runtime verification is still pending.

## Dashboard modal iframe fix — 2026-10-27

- Root cause (from source, not browser-verified): `securityHeaders()` in `backend/auth.js` sent `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` for every path, so `admin-dashboard.html?dmsModal=1` / `management.html?dmsModal=1` could not load in the modal iframes; CSP `script-src 'self'` (no `'unsafe-inline'`) also blocks inline `<script>` blocks.
- `backend/auth.js`: only `/management.html` and `/admin-dashboard.html` get `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'`; everything else stays `DENY`/`'none'`. Admin-page authentication unchanged.
- `frontend/js/dms-modals.js` (new): the former inline `dmsManagementModalController` script from `frontend/index.html` (Dashboard + Management modal controller, `window.DMS.openDashboardModal/openManagementModal`, capture-phase click on `[data-dms-nav="home"]`). `frontend/index.html` loads it via `<script src="js/dms-modals.js?v=20261027-dashboard-iframe">`.
- Not changed: the other inline `<script>` blocks in `frontend/index.html` (drag/drop guard, profile menu/logout/sidebar, permissions + nav handler) are subject to the same CSP; verify in browser whether they run.
- `skills/DMS-UI-SKILL.md` does not exist on `main`.
- Commit: `29763f8ccf711b2fae2910e8eebf4f79286020cd`.
- Validation: `node --check` passed for `backend/auth.js` and `frontend/js/dms-modals.js`. No browser, HTTP-header or SQL Server test was run.

## Node search result navigation — 2026-10-31
- `frontend/js/script.js`: the node search result IDs returned by the existing permission-protected `GET /api/nodes/search` endpoint are retained in order. The first result is selected automatically; Previous/Next navigate within the result set, update the selected Node details, and scroll the corresponding tree row into view. The counter displays the current position as `n of total`; Previous/Next are disabled at the first/last result. Empty searches and zero-result searches do not expose navigation controls.
- `frontend/css/style.css`: added compact responsive styling for the result counter/navigation controls and a distinct current-result highlight. No HTML markup, backend/API, SQL, RBAC, permissions, or workflow changes were required.
- The project-specific `skills/DMS-UI-SKILL.md` is absent from the current `main` branch (GitHub 404). The user explicitly approved continuing while preserving the existing DMS UI design.
- Commits: `7d31280e5db7ff030e775b6288d0187489778a6b` (`frontend/js/script.js`); `4be6ee4602b93637a117bb63cdee7eccdd22fef3` (`frontend/css/style.css`).
- Validation: verified the implementation against the existing API response contract (`matchIds`, `visibleNodes`) and checked the inserted event delegation, result-index bounds, first/last disabled states, selection, detail rendering, and scroll behavior in source. JavaScript parser checks, browser interaction, and live API/SQL Server tests have not been run in this session.

## Audit event detail table — 2026-11-01

- Updated `frontend/js/audit-management.js`: the Details action now renders audit event metadata and parsed `DetailsJson` values in a semantic two-column Field/Value table instead of a raw JSON `<pre>` block. Nested objects and arrays are expanded into readable field paths; values are inserted with `textContent` to avoid interpreting audit data as HTML.
- Updated `frontend/css/audit-management.css`: added responsive, independently scrollable detail-table styling consistent with the existing Audit Management modal.
- No API, SQL schema, permission, or audit-data behavior changed.
- Commits: `416e6285a97e3c6e220df1f70fcc063dcd33bb68` (detail rendering), `d1b50c9ca09137d433a9bc74eece50dd23743fe6` (table styling), and `e0a522cbe1de498374b40839c17bd84b97df5b31` (field-label formatting correction).
- Validation: `node --check` passed for the updated `frontend/js/audit-management.js`; the changed rendering path and CSS structure were inspected. Browser rendering and live API/SQL Server tests have not been run in this session.

## Node folder rename — SLD to DWG (2026-11-03)

- Replaced the SRSC node folder name `SLD` with `DWG` in the backend allowlist and folder-resolution logic, upload folder choices/validation text, and frontend folder browsing/PDF opening.
- The only allowed top-level folders are now `DWG`, `DOC`, `PIC`, and `Catalog`. Backend canonical-folder validation remains in place; existing authentication, `FILE_VIEW`/file permissions, path containment checks, and audit logging are unchanged.
- Legacy `SLD` directories are not migrated or read by the application. No automatic filesystem deletion was implemented; they may remain physically on the file server until removed separately. No database schema or data changes.
- Code commit: `46593e53f83028fa44095a028add8777dd4f8d80`.
- Validation: searched the indexed repository for `SLD`; the active references were limited to the three changed source files. The changed files were checked for remaining `SLD`/`sld` references. Node syntax checks, browser upload/browse tests, and live file-server tests remain pending.

## Danieli DWG RBAC — 2026-11-05

- The Danieli DWG list endpoint `GET /api/danieli-dwgs` now requires `DWG_Danieli_View`.
- The file delivery endpoint `GET /api/danieli-dwg-file/:dwgId` now requires `DWG_Danieli_Download`.
- Frontend reads the effective permission codes from `GET /api/auth/me`; it requests and renders Danieli DWG metadata only with the View permission, and only starts the file download action when the Download permission is present.
- Backend permission middleware remains authoritative for direct API requests. Existing parameterized DWG lookup, PathID root resolution, path containment validation and download audit logging are preserved. No SQL schema, permission records, or role assignments were changed.
- Validation in this session: source-level changes only. JavaScript syntax, SQL Server, 401/403 permission matrix, browser behavior and actual file transfer have not yet been tested. Commits: `fd383646c137889973d1858d7123579346a9674a` (backend authorization), `1761fe3fd948e1d3461f45fb4dbd6e4d76259d2b` (frontend permission-aware listing/download), `8467655ae95b668da3d00593cce14a781b802fde` (security changelog), and `516b1347b596bfd8cf8bed33ad217ca577f52266` (project state).

## DanieliDWG SQL import script — 2026-11-04

- Added `SQL/Create_DanieliDWG.sql` to create and populate `dbo.DanieliDWG` from the five-column `DanieliDWG_Import.csv` file (`DWGID`, `NodeID`, `NodeCode`, `DWGName`, `PathID`).
- The script uses the existing shared `dbo.tblPath.PathID=3` (Danieli Drawing), expects 1,298 rows, validates eight-digit `.dwg` names, CSV PathID values, duplicate keys, and each `NodeID + NodeCode` against `dbo.Nodes`.
- Table creation and insertion are transactional; failed runs roll back and clean up local temporary tables. CSV path is currently `C:\\Temp\\DanieliDWG_Import.csv` and must be accessible to the SQL Server service.
- Git commit: `6ae22e878cafa40c90c8c89b03b438a5c78ad9b7`.
- Validation: inspected the uploaded CSV and confirmed its header plus 1,298 data rows, five columns, and PathID value 3 in the sample rows. The SQL script has been committed but has NOT been executed against SQL Server. The previously reported SQL Server error 7301 (BULK provider IID_IColumnsInfo) remains unresolved until the import is tested in the target SQL Server instance.

## Danieli DWG included in Node status colors — 2026-11-05

- Updated `frontend/js/script.js` so a Node is treated as having Danieli files when it has either a registered Danieli PDF or at least one registered Danieli DWG.
- Existing status classes and CSS colors are preserved: Danieli only = orange (`has-pdf`); SRSC only = green (`has-srsc`); Danieli plus SRSC = green (`has-both`); neither = no status class / existing default appearance.
- `prefetchDwgs()` now refreshes the affected Node status after DWG metadata is loaded, so orange/green status updates when DWGs arrive asynchronously.
- Updated the `frontend/js/script.js` cache-busting query in `frontend/index.html`.
- No database, API, RBAC, or security behavior changed.
- Commits: `6b3799ec866f632d91993553ed816a4c9c73247d` (Node status logic) and `d8992e39abda98ffeda0c09c82e87d5fcb0b066a` (frontend cache version).
- Validation: inspected the exact status-class logic, existing CSS color selectors, and DWG prefetch flow. Browser rendering, JavaScript runtime, and live API tests have not been run in this session.

## Password policy update — 2026-11-07
- User Management password validation now enforces length only: minimum 8 characters, maximum 256 characters. Uppercase, lowercase, and digit composition requirements have been removed.
- Frontend: `frontend/js/user-management.js` updates the shared client validator and the New User, My Password, and Reset Password labels; `frontend/index.html` cache-busts the script as `20261107-password-length-only`.
- Backend: `backend/auth.js` updates the shared `validateNewPassword()` used by user creation, Admin password reset, and Admin self-service password change. The profile-password endpoint already enforced length only and remains unchanged.
- Password hashing (scrypt), current-password verification, session revocation, rate limiting, CSRF checks, and RBAC remain unchanged.
- Validation: pending JavaScript syntax checks and runtime acceptance tests for passwords with lowercase-only, uppercase-only, digits-only, symbols, 7 characters, 8 characters, and 257 characters.

## Profile photo crop coordinate fix — 2026-11-05
- Fixed the crop-to-source coordinate conversion in `frontend/js/profile.js`. The previous `sourceX` / `sourceY` expressions reversed the offset between the centered image and the viewport, selecting a different region for non-square images. The corrected expressions calculate the source square from the rendered image center minus the user's pan offset, then clamp the source rectangle to image bounds.
- Crop viewport dimensions now come from its computed CSS dimensions rather than a separate viewport-width estimate, avoiding disagreement between the crop math and the responsive dialog size.
- Pointer dragging is constrained to keep the crop viewport inside the image, preventing selections beyond the image edges.
- Updated the `frontend/index.html` profile script query version to `20261105-crop-fix` so browsers request the corrected JavaScript.
- Commits: `30aff7a3397ec773bf3f8b2b9dad806b4206ff5f` (crop logic), `3bc02d46efcf365007454ab5e944444aea73edc3` (cache version), `c8ac4cc7d1595ea777993b1ac85168125d2b3564` (keep crop position within image after zoom changes).
- Validation: source replacement checks passed. Browser interaction, visual review, and upload/API runtime tests have not been run; verify landscape, portrait, square, zoom, and drag cases in the target browser.


## Upload destination behavior — 2026-11-07

- Reworked `frontend/js/node-upload.js` so upload destination is determined by the current SRSC browser view.
- From the SRSC root/grid (`currentSrscView.type === 'grid'`), the user must select one of `DWG`, `DOC`, `PIC`, or `Catalog`; uploads go directly into that selected top-level folder.
- From any open folder (`currentSrscView.type === 'folder'`), the destination folder and subpath are taken from the current view and displayed as read-only. The target-folder choices and manually editable subfolder field are not available.
- Removed the `upload-strip-row` checkbox and its `stripOuterFolder`, `commonTopSegment`, `autoDetectStrip`, and `effectiveRelativePath` logic. Selected file/folder relative paths are now passed unchanged, preserving the selected folder itself and its internal hierarchy below the fixed destination.
- `frontend/index.html` removes the manual subfolder input, adds the fixed-destination display, and cache-busts `node-upload.js`. `frontend/css/node-upload.css` removes obsolete checkbox styling and styles the destination display.
- No backend/API, SQL schema, permission, or RBAC changes. The existing upload API still validates the four allowed top-level folders, sanitizes relative paths, checks path containment, and enforces `FILE_Edit`.
- Commits: `0e223a23ec3b901cc81f65bb029cb748cfb43848` (upload routing), `435e137e71ff5a60489dd107699aafd9242867d0` (dialog markup/cache version), `49b191a11c30f3e18b04805d901fb87eff013735` (upload dialog styles).
- Validation: V8 JavaScript syntax parse passed for `frontend/js/node-upload.js`; source checks confirmed removal of strip/subfolder controls, fixed destination wiring, and preservation of selected relative paths. Browser upload, nested-folder, drag/drop, and live file-server tests remain pending.


## Upload request-size limit — 2026-11-07
- User decision: limit each upload request (including a selected folder and all its files) to a maximum aggregate HTTP body size of 500 MB.
- `backend/web.config` now configures IIS request filtering with `<requestLimits maxAllowedContentLength="500000000" />`. This limit applies to the complete multipart request, so multipart overhead counts toward the 500 MB ceiling.
- `backend/server.js` Multer limits were intentionally left unchanged: 1 GiB per file and 1,000 files per request. The IIS aggregate limit governs the total request size when traffic passes through this IIS application.
- No API route, database, permission, RBAC, file-path, or audit behavior was changed.
- Commit: `abbd1c2aa7236283478d6a3cb1430ca373b3e851` (IIS config); security documentation commit follows in Git history.
- Validation: XML source structure inspected; no IIS runtime, deployed upload, or boundary-size test has been run. Confirm that the active IIS application for `/api/node-file-upload/:nodeId` uses this `backend/web.config`, then test a folder upload below 500 MB and one exceeding the limit.



## SQL-backed node search and isolated request limits — 2026-11-08
- `frontend/js/script.js`: search now uses the complete `visibleNodes` + `matchIds` response from `GET /api/nodes/search` to construct a search-only tree. The client no longer filters matches by `state.nodeElements`; every SQL match and its full ancestor path is inserted into the tree, and all matching paths are expanded so every match is present in the rendered tree. Search children are served from the API response map, not per-user lazy-loaded tree state.
- Search count/navigation total is `data.matchIds.length`. A response missing a match or ancestor is treated as an API integrity error rather than silently dropping the result.
- Search is single-flight: `state.searchInProgress` prevents concurrent execution, the Search button is disabled with `aria-busy` during the operation, and Enter is ignored while the same operation is active. Clearing the query restores the regular root tree.
- Client search-result cache: exact trimmed query key, 30-second TTL, maximum 20 entries (LRU refresh on hit). Cache only stores successful API responses.
- Search metadata prefetch is batched once after building the search tree; expanding each result branch does not trigger repeated per-branch metadata requests.
- `backend/auth.js` and `backend/server.js`: general API rate limit is now 240 requests / authenticated UserID / 60 seconds. `/api/nodes/search` is excluded from that general counter and receives a dedicated 20 requests / authenticated UserID / 60 seconds limit. Search still requires `NODE_VIEW`; authentication is enforced before either limiter. Login IP/account protections and CSRF checks remain intact.
- `frontend/index.html` cache-busts `script.js` as `20261108-sql-search-v2`.
- Commits: `1605722b6993a33227a1ef92e9b9b8847cab2268` (`backend/auth.js`); `26185eadee0c3684deca47828b4f280605b78c08` (`backend/server.js`); `1d775cb471456e523673789c987dd7b51cf03755` and `ba5b2834c7de6676833107878a6e405acca397af` (`frontend/js/script.js`); `ef1a48068a67b034e42f7abf8b4e7427405b3e0f` (`frontend/index.html`); `fc32c5846e60679b6aba83913c472ddb7c382b13` (`frontend/js/script.js`, selection reset); `2795adb8e10c40715443184625f3d552fff72ed5` (`SECURITY_CHANGELOG.md`).
- Validation: source-level changes and GitHub file updates completed. No Node syntax check, browser test, live SQL Server search, shared-IP concurrency test, 401/403 test, or 429 boundary test has been run. The DMS-local `skills/DMS-UI-SKILL.md` and upstream Taste Skill `references/app-screens.md` were not available at their documented paths; no visual restyling was performed.

# NEXT ACTION

1. Run `node --check` for `backend/auth.js`, `backend/server.js`, and `frontend/js/script.js`; fix any syntax issues before deployment.
2. In a browser with SQL Server connected, search a term that returns matches under unloaded branches. Confirm every match is rendered, the counter equals SQL `matchIds.length`, and the same query returns the same result IDs/count for two users with `NODE_VIEW`.
3. Test repeated Search clicks and Enter during an active search; confirm only one request runs, the button disables/re-enables, and repeated identical searches within 30 seconds use cache. Clear the query and confirm the normal full tree returns.
4. Test rate limits: two users sharing one client IP retain independent 240/min API budgets; Search allows 20/min per user without consuming the general API counter; the 21st search returns 429 with `Retry-After`; unauthenticated search returns 401 and a user without `NODE_VIEW` returns 403.
5. Deploy and run the outstanding 500 MB IIS upload-limit and folder-upload checks, then complete the upload permission/audit, password-policy, Danieli DWG RBAC, and SQL import checks listed below.
6. Open `DWG/Part` and upload individual files and a selected/dropped folder; verify destination and hierarchy preservation.
7. Verify upload permission denial (unauthenticated 401 and authenticated user without `FILE_Edit` 403) and confirm successful upload audit rows in `dbo.Logs`.
8. Complete password-policy acceptance tests (8–256 characters, any composition) and test Danieli DWG RBAC plus `SQL/Create_DanieliDWG.sql` import validation.
