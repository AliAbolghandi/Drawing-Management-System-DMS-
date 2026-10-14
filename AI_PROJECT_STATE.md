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
- `PredictedPartCount`
- `CroquisStartDate`, `CroquisEndDate`, `CroquisPartCount`
- `ModelingStartDate`, `ModelingEndDate`, `ModelingPartCount`
- `DrawingStartDate`, `DrawingEndDate`, `StandardPartCount`, `DrawnPartCount`
- `CreatedAt`, `UpdatedAt`

Migration: `SQL/ExpertDrawingWork.sql`.
Database constraints enforce non-negative counts and date order. Database triggers enforce:
- Accept cannot move to `IN_PROGRESS` without a prediction for the current assignment.
- Complete cannot move to `PENDING_FINAL_APPROVAL` until Croquis, Modeling and Final Drawing are represented across request contributions.

### Expert work APIs
Implemented under `/api/auth` in `backend/auth.js`:
- `GET /api/auth/expert-work/:requestId` — current/prior assigned expert or `REQUEST_DRAWING_VIEW_ALL` can read assignment contributions and totals.
- `POST /api/auth/expert-work/:requestId/prediction` — requires `REQUEST_DRAWING_ACCEPT`; saves prediction for the current assignment.
- `POST /api/auth/expert-work/:requestId/save` — requires `REQUEST_DRAWING_COMPLETE`; validates and saves current expert contribution without modifying other assignments.

### Frontend
`frontend/js/request-workflow.js` now:
- Shows a required prediction field when Expert clicks `Accept Work`.
- Shows Croquis, Modeling and Final Drawing fields in `Complete Work`.
- Displays previous expert contributions and request totals in Request Workflow details.
- Saves expert data through authenticated APIs before executing the existing workflow action.
- Uses the actionable pending request count for the sidebar badge.

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
- `32dff1b1c1c5b63c7517e81157a77d086125f6e5` — expert contribution table.
- `311d8b667e766ab0057db99f65b3103723868161` — database prerequisite triggers.
- `7b371e95eb2944eee9c377c2024273294e50121d` — expert-work APIs and actionable request count.
- `ae858dd84c0a579d48b55518f2c2809e2eece981` — expert-work frontend UI.
- `93027bf9dfae81f61a50b239c5d39df8a9762520` — project specification/state documentation update.

## Verification status
- GitHub source and `SQL/Relation between table.rpt` were inspected before this phase.
- SQL migration was structurally reviewed.
- Runtime SQL Server testing: NOT performed.
- LAN/browser runtime testing: NOT performed.
- `node --check` on the newly changed repository files: NOT yet performed.

## Known limitation / immediate follow-up
The backend save API supports partial stage saves, but the current UI exposes expert data entry through the Complete Work modal. A dedicated `Save Progress` action is still required so an expert can save completed Croquis or Modeling on an earlier day without completing the request.

# NEXT ACTION
1. Add `Save Progress` to the Expert Work modal and allow saving any fully completed stage independently while keeping Complete Work blocked until all three stages are complete.
2. Run `node --check backend/auth.js` and `node --check frontend/js/request-workflow.js` against the repository files.
3. Run `SQL/ExpertDrawingWork.sql` on `dbDrawingManagment` and verify the table, FK, indexes and triggers.
4. Test: Expert 1 prediction/accept -> Croquis save -> Modeling save -> transfer -> Expert 2 sees prior data -> Expert 2 adds Drawing -> Complete succeeds; also test incomplete stages and unauthorized direct API calls.
5. After testing, update this file with exact test results, latest commit SHA and any remaining bugs.
