# Expert Drawing Work — Agreed Requirements

Last reviewed: 2026-10-14
Repository: https://github.com/AliAbolghandi/Drawing-Management-System-DMS-
Status: Phase implementation committed; SQL Server runtime/UI verification is still pending.

## Drawing production stages

Each drawing request has four production data points:
1. **Predicted part count** — mandatory when the assigned Drawing Expert accepts the request.
2. **Croquis / vector sketch** — start date, end date, and number of parts contributed by that expert.
3. **Modeling** — start date, end date, and number of parts contributed by that expert.
4. **Final drawing** — start date, end date, standard-part count, and drawn-part count contributed by that expert.

## Workflow rules confirmed by the user

- Accept requires a valid predicted part count. After the prediction is persisted, the request moves to `IN_PROGRESS`.
- Work can span multiple days and stages. Work data is persisted in SQL Server rather than being temporary browser state.
- A request normally has one current expert. Reassignment creates a separate `DrawingRequestAssignments` record and must never overwrite the previous expert's contribution.
- A later expert can see previous experts' contribution data.
- If the later expert completes only the missing Drawing stage, only that expert's Drawing contribution is stored; previous Croquis/Modeling values remain attributed to the previous expert.
- If the later expert adds 3 Croquis parts to a previous expert's 10, the previous expert remains at 10 and the later expert stores 3. Reporting can therefore show both the individual contributions and the request total of 13.
- Complete Work is allowed only after the request has completed Croquis, Modeling, and Final Drawing across its expert contributions. Final Drawing requires both Standard Part Count and Drawn Part Count.
- Counts are non-negative integers. A stage's start/end dates must be supplied together and end date cannot precede start date.
- Server-side validation is mandatory; the client cannot choose another expert's assignment or bypass workflow state.

## Database design implemented

New table: `dbo.DrawingRequestExpertWork`

- `ExpertWorkID` — PK, identity.
- `AssignmentID` — unique FK to `dbo.DrawingRequestAssignments(AssignmentID)`.
- `PredictedPartCount`.
- `CroquisStartDate`, `CroquisEndDate`, `CroquisPartCount`.
- `ModelingStartDate`, `ModelingEndDate`, `ModelingPartCount`.
- `DrawingStartDate`, `DrawingEndDate`, `StandardPartCount`, `DrawnPartCount`.
- `CreatedAt`, `UpdatedAt`.
- CHECK constraints enforce non-negative counts and valid date ordering.
- Indexes support assignment/date reporting.

Migration file: `SQL/ExpertDrawingWork.sql`.

The migration also contains database-level triggers:
- `dbo.TR_DrawingRequests_ExpertAcceptPrerequisite`: blocks transition to `IN_PROGRESS` if the current assignment has no predicted part count.
- `dbo.TR_DrawingRequests_ExpertCompletePrerequisite`: blocks transition to `PENDING_FINAL_APPROVAL` until Croquis, Modeling, and Final Drawing are all represented by valid contributions across the request's assignments.

This design intentionally leaves existing workflow tables unchanged.

## Implemented APIs

Implemented under the existing authenticated `/api/auth` router:
- `GET /api/auth/expert-work/:requestId` — returns assignment-level expert contributions and request totals; access is limited to the current/prior assigned expert or users with `REQUEST_DRAWING_VIEW_ALL`.
- `POST /api/auth/expert-work/:requestId/prediction` — requires `REQUEST_DRAWING_ACCEPT`, validates non-negative prediction, and saves it against the current expert assignment.
- `POST /api/auth/expert-work/:requestId/save` — requires `REQUEST_DRAWING_COMPLETE`, validates stage data, and saves it against the current expert assignment without changing another assignment's row.
- `GET /api/auth/pending-drawing-count` now counts actionable workflow requests assigned to the current user instead of relying on `Notifications.IsRead`.

## Implemented frontend behavior

`frontend/js/request-workflow.js` now:
- Requires Predicted Part Count when an expert clicks **Accept Work**.
- Shows the expert-work completion fields when **Complete Work** is selected.
- Shows request-level contribution totals and each expert's contribution in Request Workflow details.
- Sends expert data through authenticated APIs before the existing workflow action is executed.
- Uses the actionable pending-count API for the sidebar notification badge and refreshes it every 30 seconds.

## Current implementation commits

- `32dff1b1c1c5b63c7517e81157a77d086125f6e5` — initial expert contribution table.
- `311d8b667e766ab0057db99f65b3103723868161` — database prerequisites/triggers.
- `7b371e95eb2944eee9c377c2024273294e50121d` — secure expert-work APIs and actionable request count.
- `ae858dd84c0a579d48b55518f2c2809e2eece981` — expert work UI, Accept prediction and Complete Work modal.

## Verification status

- Repository structure and `SQL/Relation between table.rpt` were inspected before implementation.
- SQL migration was reviewed structurally.
- Runtime SQL Server testing has **not** been performed in this session.
- Browser/LAN runtime testing has **not** been performed in this session.
- JavaScript `node --check` against the repository file has not yet been completed in this session.

## Important limitation to resolve next

The current UI exposes expert work entry through the Complete Work modal. The backend supports stage-level partial saves, but a dedicated **Save Progress** UI action for recording Croquis/Modeling on an earlier day before final completion still needs to be wired in. This is required to fully match the agreed multi-day work behavior.

## Security constraints

- All expert-work APIs require an authenticated DMS session.
- Permission checks are server-side.
- Assignment ownership is server-side; the client cannot select another expert's assignment for writing.
- SQL inputs are parameterized.
- Database triggers provide a second enforcement boundary for Accept and Complete transitions.
- Direct API access without the DMS session remains unauthorized.

## Non-negotiable constraints

- Do not alter existing database structures without explicit user approval.
- Do not claim runtime SQL/UI testing unless it actually ran.
- Preserve existing workflow statuses, permission codes, API contracts, and audit history unless the user explicitly approves a change.
