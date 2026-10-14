# Expert Drawing Work — Agreed Requirements

Last reviewed: 2026-10-14
Repository: https://github.com/AliAbolghandi/Drawing-Management-System-DMS-
Status: Requirements recorded; implementation and database migration have not yet been performed.

## Drawing production stages

Each drawing request has four production data points:
1. **Predicted part count** — mandatory when the assigned Drawing Expert accepts the request.
2. **Croquis / vector sketch** — start date, end date, and number of parts sketched.
3. **Modeling** — start date, end date, and number of parts modeled.
4. **Final drawing** — start date, end date, standard-part count, and drawn-part count.

## Workflow rules confirmed by the user

- When an expert accepts a request, the expert must enter a valid predicted part count. The request must not be accepted without it. After successful acceptance, the request status becomes `IN_PROGRESS`.
- Work can span multiple days. An expert may perform a stage and register its data, then continue another stage on a later date. Stage data must therefore be saved in the database as it is entered; it must not exist only in a temporary modal.
- A request's work must not be marked complete until the required Croquis, Modeling, and Final Drawing data have all been completed and validated.
- Clicking **Complete Work** opens a modal for entering/completing stage data. Required fields must be validated server-side; incomplete data must block completion.
- Final Drawing requires two separate non-negative counts: standard parts and drawn parts.
- Normally one expert owns a request at a time. The workflow may transfer/reassign the request to another expert. The application must preserve each assignment's history and must not attribute one expert's contribution to another expert.
- If different experts contribute to the same request, each expert must be able to register their own Croquis, Modeling, and Final Drawing data for that request. Reporting must be able to attribute dates and part counts to the request and to the relevant expert/assignment.
- The resulting data is intended for future reporting and analytics; persist it in SQL Server, not only in browser state.
- Follow existing security rules: authenticated session, effective permission checks, server-side validation, parameterized SQL, and no trust in client-supplied expert identity or status.

## Current schema facts verified from `SQL/Relation between table.rpt`

- `dbo.DrawingRequests` has primary key `RequestID` and current expert field `AssignedDrawingExpertID`.
- `dbo.DrawingRequestAssignments` has primary key `AssignmentID`, foreign key `RequestID`, `DrawingExpertUserID`, `AssignedAt`, `AcceptedAt`, `CompletedAt`, `IsCurrent`, and `AssignmentStatus`. Its foreign keys point to `dbo.DrawingRequests` and `dbo.Users`.
- `dbo.DrawingRequestHistory` records request actions and status transitions.
- The schema report was generated 2026-10-14 at 11:44:15 and says no table data was exported.
- Do not assume a new expert-work table already exists. No database migration for this feature has been applied.

## Proposed database design (not yet implemented)

Add a separate table, tentatively named `dbo.DrawingRequestExpertWork`, linked to **`DrawingRequestAssignments.AssignmentID`** so work data belongs to a specific expert assignment rather than being overwritten on `DrawingRequests`.

Proposed data fields:
- Identity primary key, e.g. `ExpertWorkID`.
- `AssignmentID` foreign key to `dbo.DrawingRequestAssignments(AssignmentID)` (unique if the chosen design is one cumulative record per assignment).
- Predicted part count.
- Croquis start/end dates and sketched-part count.
- Modeling start/end dates and modeled-part count.
- Final Drawing start/end dates, standard-part count, and drawn-part count.
- Created/updated timestamps and, if required by the final schema, the user who last updated the record.

Use appropriate integer types for counts, non-negative constraints, date-order validation (end must not precede start), foreign keys, and indexes. Keep the schema normalized and report-friendly. Confirm whether one cumulative row per assignment is sufficient before finalizing; if multiple separate work sessions per stage must be recorded, use a stage/session detail table instead.

## Unresolved decision before implementation

When a request is transferred and multiple experts contribute, should **Complete Work** be allowed when the current expert has completed all three stage records for their own assignment, or should the system aggregate contributions from multiple assignments and only complete the request once all required stages/counts across the request are complete? Preserve per-expert attribution either way.

## Required implementation sequence

1. Re-read this file and `AI_PROJECT_STATE.md`; inspect current `backend/server.js`, `frontend/js/request-workflow.js`, and the current SQL relationship report.
2. Confirm the unresolved completion rule above.
3. Add an idempotent SQL migration script under `SQL/` to create the new table and relationships; do not change existing tables without explicit approval.
4. Update the accept action so predicted part count is required and saved before status changes to `IN_PROGRESS`.
5. Add secure APIs to read/save the current assignment's stage data, with assignment ownership and permission checks enforced server-side.
6. Add UI fields to accept and progressively save stage data; update Complete Work modal and block completion until required data is valid.
7. Ensure reassignment creates/uses the new assignment's separate record without overwriting prior experts' data.
8. Syntax-check changed JavaScript and inspect the SQL migration. Test authentication/authorization, invalid counts/dates, partial saves, reassignment, and completion blocking; test against SQL Server when available.
9. Commit implementation and update `AI_PROJECT_STATE.md` with exact commit SHA, tests actually performed, known limitations, and a concrete `# NEXT ACTION`.

## Non-negotiable constraints

- Do not alter existing database structures without explicit user approval.
- Do not claim runtime SQL/UI testing unless it actually ran.
- Preserve existing workflow statuses, permission codes, API contracts, and audit history unless the user explicitly approves a change.
