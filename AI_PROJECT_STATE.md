# DMS — AI Project State / Handoff

Last updated: 2026-10-14
Repository: AliAbolghandi/Drawing-Management-System-DMS-
Default branch: main

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

## Recent commits
- `d3d284b2a7224b16a7cf13d64f933cd34c854481` — Expert Work Save Progress UI and partial-save handling.
- `bd0af20043d5f456b1e0fcc2269614fed1a11754` — completion trigger changed to aggregate contributions across expert assignments.
- `93027bf9dfae81f61a50b239c5d39df8a9762520` — project specification/state documentation update.
- `7b371e95eb2944eee9c377c2024273294e50121d` — expert-work APIs and actionable request count.

## Verification status
- GitHub source and `SQL/Relation between table.rpt` were inspected before this phase.
- SQL migration was structurally reviewed.
- Runtime SQL Server testing: NOT performed.
- LAN/browser runtime testing: NOT performed.
- `node --check` on the newly changed repository files: NOT yet performed in this environment.

## Known limitation / immediate follow-up
The implementation is committed, but the migration must be executed on the actual `dbDrawingManagment` database before the new table/trigger-backed workflow can operate. Runtime testing is still required.

# NEXT ACTION
1. Execute `SQL/ExpertDrawingWork-v01.sql` on `dbDrawingManagment` and verify `dbo.DrawingRequestExpertWork`, its three FKs, indexes, and `TR_DrawingRequests_ExpertWorkCompletionGuard`.
2. Run `node --check` on `backend/auth.js` and `frontend/js/request-workflow.js` using the repository files.
3. Test the full scenario: Expert 1 Accept with prediction -> Save Progress Croquis -> Save Progress Modeling -> transfer -> Expert 2 sees prior contributions -> Expert 2 adds Drawing -> Complete succeeds.
4. Test the alternative: Expert 2 adds 3 Croquis parts; Expert 1's count remains unchanged and total increases by 3.
5. Test incomplete-stage completion, invalid dates/counts, unauthenticated direct API access, and unauthorized expert access.
6. Record actual runtime results and latest commit SHA here after testing.
