# DMS — AI Project State / Handoff

Last updated: 2026-10-14
Repository: AliAbolghandi/Drawing-Management-System-DMS-
Default branch: main

## Permanent UI requirement — official calendar
- The official and default calendar throughout DMS must be Solar Hijri (Persian/Jalali), not Gregorian.
- Apply this consistently to every date picker and date-entry control in all forms, including all six date fields (start/end for Croquis, Modeling, and Final Drawing) in the dynamically generated **Complete Drawing Work** form in `frontend/js/request-workflow.js`.
- Preserve the backend/database date contract: convert selected Jalali dates to valid Gregorian ISO dates before submitting to the existing APIs, and convert stored dates back to Jalali for display. Do not change SQL date column types or API contracts for this UI requirement.
- This requirement is permanent and must be retained in future AI handoffs.

## Architecture
- Frontend: `frontend/` HTML/CSS/JavaScript.
- Backend: `backend/server.js` Node.js + Express.
- Authentication/RBAC: `backend/auth.js`, mounted under `/api/auth` by `backend/server.js`.
- Admin DB routes: `backend/admin-db.js`.
- Database: SQL Server `dbDrawingManagment`, Windows Trusted Connection, `mssql/msnodesqlv8`.
- Main UI: `frontend/index.html`; workflow UI: `frontend/js/request-workflow.js`.

## Core database tables
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
- Workflow: `dbo.DrawingRequests`, `dbo.DrawingRequestStatuses`, `dbo.DrawingRequestAssignments`, `dbo.DrawingRequestHistory`, `dbo.Notifications`.

`dbo.Nodes` columns currently referenced: `NodeID, ParentID, NodeCode, NodeName, IsActive, CreatedAt, UpdatedAt, FolderPath, PathID, JET_Position, Norme, Mass`.
Database relationships are documented in `SQL/Relation between table.rpt`.

## RBAC / security rules
- Effective permissions come from `UserRoles -> Roles -> RolePermissions -> Permissions` and are checked by `PermissionCode`.
- Admin authorization is server-side through the active `Admin` role.
- Protected pages `/management.html` and `/admin-dashboard.html` require an authenticated Admin session.
- Protected APIs require the DMS session; frontend hiding is never the security boundary.
- API calls from outside the UI receive the same authentication/authorization checks.
- SQL inputs are parameterized; IDs, paths, filenames and workflow states are validated server-side.
- No credentials, tokens or secrets may be committed.

## Request workflow
Current statuses include: `PENDING_MANAGER`, `MANAGER_APPROVED`, `MANAGER_REJECTED`, `PENDING_DRAWING_APPROVAL`, `DRAWING_APPROVAL_REJECTED`, `ASSIGNED`, `IN_PROGRESS`, `TRANSFERRED`, `EXPERT_REJECTED`, `RETURNED_FOR_CORRECTION`, `PENDING_FINAL_APPROVAL`, `FINAL_APPROVED`, `FINAL_REJECTED`, `CANCELLED`.

Current workflow API: `POST /api/drawing-requests/:requestId/action` in `backend/server.js`.

Expert assignment is represented by `dbo.DrawingRequestAssignments.AssignmentID`. A request normally has one current Drawing Expert but may be transferred to another expert.

## Pending request notification
`GET /api/auth/pending-drawing-count` now calculates actionable requests from workflow state/user responsibility rather than `Notifications.IsRead`.
Frontend `frontend/js/request-workflow.js` refreshes the badge on load and every 30 seconds.

## Expert drawing work phase — implemented
Each drawing request has four production data points:
1. Predicted Part Count — mandatory during Expert Accept.
2. Croquis/vector sketch — start date, end date, expert contribution count.
3. Modeling — start date, end date, expert contribution count.
4. Final Drawing — start date, end date, standard-part count and drawn-part count.

### Contribution rule
Work is stored per expert assignment, not as one overwriteable request row.
Example: Expert 1 records 10 Croquis parts. Expert 2 later adds 3. Expert 1 remains 10; Expert 2 stores 3; request total is 13. The same rule applies to Modeling and Final Drawing.

### Database
New table: `dbo.DrawingRequestExpertWork`, linked by unique `AssignmentID -> dbo.DrawingRequestAssignments.AssignmentID`.

Columns:
- `ExpertWorkID`
- `AssignmentID`
- `RequestID`
- `ExpertUserID`
- `PredictedPartCount`
- `CroquisStartDate`, `CroquisEndDate`, `CroquisPartCount`
- `ModelingStartDate`, `ModelingEndDate`, `ModelingPartCount`
- `DrawingStartDate`, `DrawingEndDate`, `StandardPartCount`, `DrawnPartCount`
- `CreatedAt`, `UpdatedAt`

Migration: `SQL/ExpertDrawingWork-v01.sql`.
Database constraints enforce count/date validity. A database trigger prevents transition to `PENDING_FINAL_APPROVAL` until the request has prediction plus complete Croquis, Modeling and Final Drawing data represented across its expert contributions. This deliberately aggregates contributions across assignments, so Expert 2 can finish a request using Croquis/Modeling completed by Expert 1.

### Expert work APIs
Implemented under `/api/auth` in `backend/auth.js`:
- `GET /api/auth/expert-work/:requestId` — current/prior assigned expert or `REQUEST_DRAWING_VIEW_ALL` can read assignment contributions and totals.
- `POST /api/auth/expert-work/:requestId/prediction` — requires `REQUEST_DRAWING_ACCEPT`; saves prediction for the current assignment.
- `POST /api/auth/expert-work/:requestId/save` — requires `REQUEST_DRAWING_COMPLETE`; validates and saves current expert contribution without modifying other assignments. Empty stage values remain NULL, enabling progressive saves.

### Save Progress — implemented 2026-10-14
`frontend/js/request-workflow.js` now adds a `Save Progress` button to the Complete Work expert-data modal.
- An expert can save a fully completed Croquis group today and return later for Modeling.
- A stage's fields must be supplied together when that stage is being entered; unrelated stages may remain blank.
- Save Progress does not execute the workflow `complete` action and therefore does not move the request to final approval.
- Existing expert contributions are not overwritten because the record is scoped to the current `AssignmentID`.
- The backend endpoint remains the authorization boundary.

## Admin dashboard
- `frontend/admin-dashboard.html`
- `frontend/css/admin-dashboard.css`
- `frontend/js/admin-dashboard.js`
- Admin-only Dashboard is reachable from the main sidebar.
- Dashboard has vertical scrolling.
- Uses protected admin APIs; no duplicate statistics table was added.

## Durable specification
Detailed expert-work requirements: `docs/EXPERT_DRAWING_WORKFLOW.md`.

## UI restoration and theme alignment — 2026-10-14
- Restored the missing **Step-by-step workflow** section in the Drawing Request details view in `frontend/js/request-workflow.js`.
- The timeline renders `request.WorkflowHistory` supplied by the existing drawing-requests API, with action labels, status, actor full name, timestamp, comments, approval/rejection accents, and a safe empty state. It does not add or change database structures or API contracts.
- Updated the injected expert-work styles in `frontend/js/request-workflow.js` so Croquis / Vector Sketch, Modeling, Final Drawing, contribution summaries, inputs and action modal use the DMS dark navy/slate/cyan palette rather than light cards.
- Added responsive timeline and expert-work styling in `frontend/css/request-workflow.css`.
- Bumped the `frontend/index.html` asset query versions to prevent stale browser cache from hiding the fixes.
- Commits:
  - `47a437412b10fe47e0b8f514994f304d5974893b` — restore step-by-step workflow rendering.
  - `6c8cfad565e7f0ef7f31cfe804363710973eed35` — align dynamically injected expert-work styles with DMS theme.
  - `08c7f033d0d886a71e5b17b09de4b159c427b913` — theme Croquis/Modeling/Final Drawing and workflow timeline CSS.
  - `56c10d0d8b75bc2eeace9766e8727cd8fd96d518` — refresh frontend asset cache versions.
- Verification: source structure and API data flow were inspected. Runtime browser verification and `node --check` were not completed in this environment; a local clone attempt failed because this environment could not resolve `github.com`.

## Request final-approval side-border rule — 2026-10-14
- Fixed the request list item class generation in `frontend/js/request-workflow.js`: the CSS already defined a green left border for `.rw-request-final-approved`, but the rendered request card never received that class. This caused even `FINAL_APPROVED` cards to keep the red left border.
- Request cards now receive `rw-request-final-approved` only when `StatusCode` (case-normalized) is exactly `FINAL_APPROVED`. All other displayed request statuses remain without that class and use the existing red left-border selector. Status background classes remain independent of the left-border completion rule.
- Bumped the `frontend/index.html` workflow script query version to `20261014-final-border-fix` to avoid stale browser cache.
- Commits: `714832db8eacf523c52a563eb6ba0b791bfa0ec7` (JS class fix), `8a2b161d0c72c57cb07df63163e3b83fcda4b68e` (cache version).
- Verification: inspected the committed template and confirmed the final-approved class condition exists; live browser behavior has not been tested in this environment.

## Recent commits
- `8a2b161d0c72c57cb07df63163e3b83fcda4b68e` — refreshed workflow JS cache version for final-approval border fix.
- `714832db8eacf523c52a563eb6ba0b791bfa0ec7` — apply `rw-request-final-approved` class only when `StatusCode=FINAL_APPROVED`.
- `e5ed79ccd890798fd75352643d24331559da8db8` — fixed login 500: `backend/auth.js` called undefined `setAuthCookie`; now calls the already-defined `setCookie` helper, preserving the existing `dms_session` cookie behavior.
- `dd0e675eafd8a63e2864a765261f271dfce23a77` — fixed the missing closing parenthesis in the completion trigger's `IF EXISTS` condition.
- `3a2814417976b6f827c52d59440f586f4536156b` — replaced both trigger `THROW` statements with `RAISERROR` checks for compatibility with older SQL Server parsers.
- `da4d4d545cb40042e24c6555d903df19988266a0` — wrapped both trigger `THROW` statements in `BEGIN...END` blocks so the `IF EXISTS` condition controls the error correctly.
- `31b672a79d90e438e361aaa25fe6bd7948a097e1` — initial `THROW` semicolon fix (superseded by the block fix).
- `d3d284b2a7224b16a7cf13d64f933cd34c854481` — Expert Work Save Progress UI and partial-save handling.
- `bd0af20043d5f456b1e0fcc2269614fed1a11754` — completion trigger changed to aggregate contributions across expert assignments.
- `93027bf9dfae81f61a50b239c5d39df8a9762520` — project specification/state documentation update.
- `7b371e95eb2944eee9c377c2024273294e50121d` — expert-work APIs and actionable request count.

## Login error — fixed in source, runtime pending
- Reported local error: `ReferenceError: setAuthCookie is not defined` at `backend/auth.js:178`, followed by `POST /api/auth/login` 500.
- Root cause confirmed in source: the existing cookie helper is named `setCookie(res, token)`, but the login handler called `setAuthCookie(...)`.
- Fix committed to `main`: `e5ed79ccd890798fd75352643d24331559da8db8`.
- Expected effect: login should no longer fail at cookie creation; the next response will reveal whether credentials/account status also pass validation.
- Runtime login and Node syntax checks have NOT been performed in this environment.

## Verification status
- GitHub source and `SQL/Relation between table.rpt` were inspected before this phase.
- SQL migration was structurally reviewed.
- `SQL/ExpertDrawingWork.sql`: both trigger checks use `RAISERROR(..., 16, 1)` followed by transaction rollback and return. The completion trigger's outer `IF EXISTS` now has its required closing parenthesis before `BEGIN`.
- The prior syntax error near `BEGIN` was traced to that missing parenthesis and corrected in commit `dd0e675eafd8a63e2864a765261f271dfce23a77`.
- Runtime SQL Server testing: NOT performed; rerun the script against the target database to verify compilation.
- LAN/browser runtime testing: NOT performed.
- `node --check` on the newly changed repository files: NOT yet performed in this environment.

## Known limitation / immediate follow-up
The compatibility correction is committed, but the migration must be executed on the actual `dbDrawingManagment` database before the new table/trigger-backed workflow can operate. Runtime testing is still required.

## Complete Drawing Work — Jalali calendar fix — 2026-10-15
- Replaced all six native HTML `type="date"` controls in `frontend/js/request-workflow.js` (Croquis, Modeling, Final Drawing start/end) with text fields and an in-form Jalali calendar picker. Calendar month/day selection uses the browser's Persian calendar data and renders Jalali year/month/day.
- The date text inputs have an empty placeholder, so browser text such as `mm/dd/yyyy` is no longer shown.
- On save, selected Jalali dates are converted through `DMSDate.fromJalaliInput(value, true)` to Gregorian `YYYY-MM-DD` strings, preserving the existing backend/database contract. Date validation reports invalid Jalali input.
- Refreshed the `frontend/index.html` workflow script query version to `20261015-jalali-picker`.
- Commits: `db09c5565daac00cdcde32f8808890555e0c3dc6` (Jalali picker and six fields); index cache-bust commit `680321d5ac149a9f49f8d0979272e4239bd918fb`.
- Verification: JavaScript syntax parsed successfully with `new Function(...)`; confirmed zero remaining `type="date"` controls in `request-workflow.js`. Live browser interaction and backend save were not tested in this environment.

## DrawingRequestExpertWork column-order rebuild — 2026-10-15
- Inspected `SQL/Relation between table.rpt`: the existing `dbo.DrawingRequestExpertWork` has `ExpertWorkID, AssignmentID, PredictedPartCount, ...`; `RequestNumber` and `DrawingExpertUsername` currently exist on `dbo.DrawingRequestAssignments`, not on the expert-work table.
- Added `SQL/Rebuild-DrawingRequestExpertWork-ColumnOrder.sql`. It transactionally rebuilds the original table with `RequestNumber` and `DrawingExpertUsername` immediately after `AssignmentID`, copies existing rows while preserving `ExpertWorkID`, obtains the two values by joining through `AssignmentID`, checks the row count, and recreates the primary key, assignment FK, unique constraint, all eight check constraints, and the two documented indexes.
- Added insert trigger `dbo.TR_DrawingRequestExpertWork_AssignmentSnapshot` so existing API insert statements that only provide `AssignmentID` and work fields still populate the two snapshot columns from `DrawingRequestAssignments`. Existing API contracts and assignment relationship are retained.
- GitHub commits: `74c4bbc8e92f2b6f57844da1f42afbfd9d823a4c` (migration added); `80cb4f29b01cb2fc3735a54232e9ef359354ceac` (populate snapshot columns for future inserts).
- Verification status: inspected schema metadata and current API insert patterns. The migration has NOT been executed against the user's SQL Server; do not claim database runtime validation. Run it during a maintenance window and verify row counts, column ordinals, constraints, and trigger after completion.
- Safety note: the migration aborts if either requested column already exists, and its transaction rolls back on errors. Take a database backup before running it.

## Dashboard production reports — 2026-10-15

- Added Admin-only read endpoint `GET /api/admin/dashboard/production-reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` in `backend/admin-db.js`. The route validates ISO date range, uses parameterized SQL dates, and reads existing tables only.
- Updated `frontend/admin-dashboard.html`, `frontend/css/admin-dashboard.css`, and `frontend/js/admin-dashboard.js` with Production Reports, Jalali date range fields, expert filter, charts and data tables.
- Expert performance reports part contributions by stage end date: `CroquisPartCount`, `ModelingPartCount`, and final drawing parts = `StandardPartCount + DrawnPartCount`. The table and chart share date/expert filters.
- Monthly production groups predicted parts, Croquis parts, Modeling parts and final drawing parts by month. Prediction timestamp does not exist in the current schema, so predicted counts are attributed to `DrawingRequestAssignments.AssignedAt`; this limitation is exposed in the UI/API response.
- Rejected part source investigation: the inspected schema has no part-level rejection table/column. `DrawingRequestHistory` stores workflow actions/status transitions, which cannot safely be interpreted as rejected part counts. The API returns `rejectedPartsAvailable: false` and no fabricated count; the UI displays «نامشخص». Do not change database schema or infer rejection counts without explicit approval and an identified business source.
- No database tables, columns, constraints, or API contracts were changed. Existing admin session/role protection is applied to the new endpoint.
- Commits on `main`:
  - `959b462f6c88fb489a4802b4c40f16bc07e77beb` — read-only production reports API.
  - `5131b100c85df411ae840477ace855bf6ae0c801` — dashboard report sections and Jalali date utility.
  - `2624f3a3af69f48c6f39572639fb2d454e996064` — report styles.
  - `50a2c402bbb927cfc82e509c692ccd8cac78e030` — initial report UI implementation.
  - `c01e9ef8529b1ce8dbbc599c45419895b79a9ae2` — corrected frontend script syntax and chart legend refresh.
  - `10b0e171c72195fe3e5038d3cccbe41db8aa08ca` — corrected API date validation.
- Verification: `new Function(...)` syntax checks passed for `backend/admin-db.js` and `frontend/js/admin-dashboard.js` after the final fixes. The Jalali utility was exercised in the JS runtime: `1405/07/01` converted to `2026-09-23`. No live SQL Server query, browser UI interaction, authorization integration, or real production-data validation has been performed.

# NEXT ACTION
1. On the DMS test environment, restart the backend and log in as an Admin.
2. Open `admin-dashboard.html`; choose a Jalali date range and verify both reports load through `GET /api/admin/dashboard/production-reports`.
3. Compare expert totals against `dbo.DrawingRequestExpertWork` joined to `dbo.DrawingRequestAssignments`, verifying each stage uses its own end date and Drawing parts equals `StandardPartCount + DrawnPartCount`.
4. Verify monthly prediction grouping is understood as `DrawingRequestAssignments.AssignedAt` because no prediction timestamp exists; verify date-boundary behavior and zero-result ranges.
5. Verify non-Admin sessions receive 403 and unauthenticated requests receive 401. Check responsive layout and expert filter in a browser.
6. Identify the authoritative source for actual rejected part counts with the user/business owner. Do not add schema or infer values until that source and any required schema change are explicitly approved.
7. Continue pending checks from the prior NEXT ACTION: run `SQL/Rebuild-DrawingRequestExpertWork-ColumnOrder.sql` only during the approved maintenance window after backup and stop DMS writes; then validate the Jalali work form, workflow border/timeline/theme, login, and expert-work triggers.
