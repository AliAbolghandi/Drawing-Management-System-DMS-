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

### Latest code change
- Commit `780228be106082a83ccda6d795179d62f50b01ad` — revised `frontend/js/admin-dashboard.js` Production Reports calculation.
- Main technical change: `buildProductionReport()` now explicitly deduplicates `AssignmentID`, validates positive part counts, separates each completed stage, and keeps assignment-level expert contributions additive.

### Backend note
- `GET /api/admin/dashboard/production-reports?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` still exists in `backend/admin-db.js` with an older SQL aggregation implementation.
- The current dashboard does not use that endpoint for rendering; it reads the underlying protected admin table rows directly.
- Do not remove or change the existing endpoint/API contract until a single authoritative backend calculation path is implemented and tested.


# NEXT ACTION

