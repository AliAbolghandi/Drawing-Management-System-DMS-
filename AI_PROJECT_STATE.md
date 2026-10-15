# DMS — AI Project State / Handoff

Last updated: 2026-10-15
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
User reported that the `Production Reports` values, especially completed Croquis, Modeling and Drawing parts, were incorrect and asked for all calculations to be rechecked.

### Calculation rules now implemented in `frontend/js/admin-dashboard.js`
- Dashboard no longer trusts the previously aggregated `expertPerformance` / `monthlyProduction` values from the production-report route.
- It reads authoritative rows from the existing protected admin table APIs:
  - `DrawingRequestExpertWork`
  - `DrawingRequestAssignments`
  - `Users`
- Pagination is handled by `getAllRows()` with 200 rows per page, so reports are not limited to the first 200 production records.
- Each expert-work row is mapped through `AssignmentID -> DrawingRequestAssignments -> DrawingExpertUserID -> Users`.
- Croquis, Modeling and Final Drawing are calculated independently. One assignment contribution is counted once for its corresponding completed stage.
- Date filtering is inclusive and uses the stage `EndDate`, not the start date and not assignment date.
- Final Drawing count is explicitly `StandardPartCount + DrawnPartCount`.
- Contributions from transferred experts remain additive by assignment.
- `PredictedPartCount` is treated as a request-level forecast, not production. When a request has multiple assignments, only the latest assignment prediction is counted, preventing prediction double-counting after transfer.
- Monthly report is monthly production totals, not falsely labelled cumulative production.
- Rejected part count remains `نامشخص`; the inspected schema has no authoritative part-level rejection count. `DrawingRequestHistory` contains workflow actions/status transitions and is not used to invent rejected-part quantities.

### UI changes
- `frontend/admin-dashboard.html` now labels the section `Monthly Production` and explicitly states the calculation definitions.
- Cache-bust changed to `admin-dashboard.js?v=20261015-production-reports-v2`.
- Expert table and chart display completed contributions by expert.
- Monthly table/chart display predicted, Croquis, Modeling and Drawing counts for the selected Jalali date range.

### Commits
- `262db3815f9bf67f5949145628a78ff26191d2aa` — corrected `frontend/js/admin-dashboard.js` production-report calculation logic.
- `85306c8de486eefd716d4e2ea53db9f8e8385421` — clarified Production Reports labels/definitions and refreshed cache version in `frontend/admin-dashboard.html`.

### Important backend note
- Existing `GET /api/admin/dashboard/production-reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` remains in `backend/admin-db.js` and still contains the earlier SQL aggregation implementation.
- The current dashboard intentionally calculates from the underlying protected table rows instead of using those pre-aggregated endpoint fields. This avoids changing DB schema/API contracts during the correction.
- A future cleanup should consolidate the authoritative calculation into one backend query/service so there is only one production-report calculation path. Do not remove the existing endpoint until that replacement is implemented and tested.

## Verification status for current Production Reports fix
- `node --check /tmp/new-admin-dashboard.js` passed for the exact new dashboard JavaScript content before committing.
- GitHub source was inspected, including `SQL/Relation between table.rpt` and `docs/EXPERT_DRAWING_WORKFLOW.md`.
- Real SQL Server production data was NOT available in this environment; the uploaded `Tables-v04.xlsx` is schema/definition material and contains no production rows in `DrawingRequestExpertWork`.
- Browser/LAN runtime verification has NOT been performed.
- Therefore do not claim that the displayed numeric results have been validated against real production records yet.

## Database migration pending
- `SQL/Rebuild-DrawingRequestExpertWork-ColumnOrder.sql` has not been executed against the user's SQL Server.
- Take a DB backup and stop DMS writes before executing it; then verify row counts, column ordinals, PK/FK/unique/check constraints and `TR_DrawingRequestExpertWork_AssignmentSnapshot`.

# NEXT ACTION
1. Restart the DMS backend and log in as Admin.
2. Open `admin-dashboard.html`, select a known Jalali range containing real expert-work records, and verify the Production Reports numbers against `dbo.DrawingRequestExpertWork` joined to `dbo.DrawingRequestAssignments`.
3. Manually verify at least one transferred request: previous expert contribution + new expert contribution must equal the request-level total without overwriting either expert.
4. Verify one record for each stage: Croquis uses `CroquisPartCount`/`CroquisEndDate`; Modeling uses `ModelingPartCount`/`ModelingEndDate`; Drawing uses `StandardPartCount + DrawnPartCount`/`DrawingEndDate`.
5. Verify pagination with more than 200 rows and verify date boundaries and zero-result ranges.
6. Verify Admin-only access: unauthenticated = 401, non-Admin = 403.
7. After runtime validation, decide whether to consolidate the duplicate backend production-report calculation into `backend/admin-db.js` and remove the old calculation path only after the replacement is tested.
8. Separately run `SQL/Rebuild-DrawingRequestExpertWork-ColumnOrder.sql` only during the approved maintenance window after backup and DMS write shutdown.
