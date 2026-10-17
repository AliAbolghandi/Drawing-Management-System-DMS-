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
- Updated only `frontend/css/admin-dashboard.css` with a restrained industrial dashboard treatment: tighter technical hierarchy, neutral dark surfaces, consistent borders, reduced decorative shadows/rounding, clearer metric cards, improved report tables and filter controls, keyboard focus styles, and reduced-motion support.
- Preserved distinct production chart colors: Standard parts blue, Drawn parts green, Predicted parts orange; Modeling remains a separate muted gold. Updated chart bars and legends to use matching values.
- No SQL schema/data, backend, permissions, workflow, or API contracts changed.
- Commit: `3a7a5fd9e3cb1b09ac29ad6cdcd62d6f4cebfea8` — Redesign admin dashboard with restrained industrial UI.
- Validation: GitHub source update succeeded. No local browser rendering, screenshot review, Node check, API test, or live database test was performed in this session. Treat visual verification as pending.

# NEXT ACTION

1. Open `frontend/admin-dashboard.html` in the DMS environment and review at wide desktop, laptop, and narrow viewport widths.
2. Verify KPI cards, Activity, Workflow Status, System Health, Recent Activity, report filters, both charts, and both tables remain readable and functional.
3. Confirm Standard parts are blue, Drawn parts green, Predicted parts orange, and Modeling gold in both chart bars and legends.
4. Run `node --check frontend/js/admin-dashboard.js` from the repository root; then perform a real browser/API test and report those separately from structural checks.
5. Continue validating Production Reports against `DrawingRequestExpertWork` without changing the database schema.
6. Include the exact **فایل‌های اصلی تغییرکرده:** section in the final change report, listing only files actually changed.
