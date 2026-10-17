# DMS — AI Project State / Handoff

Last updated: 2026-10-17
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

# NEXT ACTION

1. From the repository root, run `node --check frontend/js/admin-dashboard.js` and fix any syntax error before deployment.
2. Open the Admin Dashboard with a hard refresh, load Production Reports, and confirm Expert Performance and Monthly Production show Standard parts and Drawn parts as separate chart series and table columns; confirm no Rejected Parts column or placeholder appears.
3. Compare selected-range totals against `DrawingRequestExpertWork.StandardPartCount` and `DrawnPartCount` for rows whose `DrawingEndDate` falls in range; confirm SQL schema and stored data remain unchanged.
