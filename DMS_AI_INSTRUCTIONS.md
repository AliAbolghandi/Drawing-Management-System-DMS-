# DMS AI Working Instructions

You are an AI assistant working on the Drawing Management System (DMS).

Repository:
https://github.com/AliAbolghandi/Drawing-Management-System-DMS-

Default branch:
main

## Mandatory first step
Before making project changes, read:
AI_PROJECT_STATE.md

Then inspect the current GitHub source when needed and verify that the documented state matches the repository.

## Mandatory continuity responsibility
AI_PROJECT_STATE.md is a living project memory and MUST be maintained by every AI working on this project.

After every significant change:
1. Implement the change.
2. Test or syntax-check it where possible.
3. Commit the code.
4. Update AI_PROJECT_STATE.md.
5. Record the relevant commit hash and current status.
6. Update the # NEXT ACTION section.

Significant changes include features, bug fixes, API changes, database/RBAC changes, authentication changes, UI changes, file/folder behavior changes, important discoveries, and architectural decisions.


## Handoff requirements
AI_PROJECT_STATE.md must contain actionable technical information:
- architecture
- important files
- APIs
- database tables/columns
- RBAC relationships and permission codes
- implemented features
- known bugs
- recent commits
- user decisions/constraints
- current task
- exact next action

Do not write vague summaries. Prefer exact file paths, function names, API routes, SQL table/column names, errors, and commit hashes.

## Preserve user requirements
Do not silently change established requirements.
Do not modify established database structures without explicit user approval.
Do not remove existing functionality while implementing new functionality.
Preserve API contracts, naming conventions, folder structures, and permission semantics unless the user explicitly requests a change.

## Security — MANDATORY FOR ALL CODE
Security is a mandatory requirement for every part of DMS. Every new or modified frontend, backend, API, database, file, authentication, authorization, upload, download, workflow, and administrative feature MUST be implemented using a secure-by-default approach.

### Authentication and API access
- No protected page, API endpoint, file, dashboard, management function, or administrative function may be accessible to an unauthenticated user.
- Authentication MUST be enforced server-side for every protected API; hiding a button or page in the frontend is NOT security.
- Administrative endpoints MUST require authenticated Admin authorization through the existing RBAC model (`requireAdmin()` or an explicitly equivalent server-side authorization check).
- Permission checks MUST use the established `PermissionCode` / RBAC relationships and MUST NOT rely on frontend state, hidden UI elements, `RoleID` assumptions, query parameters, or client-supplied claims.
- Direct API calls from outside the DMS UI must receive the same authentication and authorization enforcement as requests originating from the UI. There must be no unauthenticated API backdoor.
- Protected static pages such as `management.html` and `admin-dashboard.html` MUST not expose protected data or functionality merely because their URL is known. Access control must be enforced by the application/server, not only by frontend redirects.

### Authorization and data protection
- Every route MUST explicitly define whether it is public, authenticated-user-only, permission-controlled, or Admin-only.
- Sensitive data and operations MUST be denied by default and allowed only after successful authentication and authorization.
- Never trust user-supplied IDs, paths, filenames, permissions, roles, or workflow states. Validate them server-side.
- File-system access MUST remain inside authorized DMS paths; never allow arbitrary path traversal or direct access to internal storage.
- Upload, download, delete, rename, and file-open operations MUST enforce authentication, authorization, validation, and safe path handling server-side.
- Database queries MUST use parameterized inputs and must not expose arbitrary SQL execution to normal users.

### Security verification before completion
Before declaring a security-sensitive feature complete, verify at minimum:
1. Unauthenticated request to each protected API returns an authentication failure (normally HTTP 401).
2. Authenticated user without the required permission receives an authorization failure (normally HTTP 403).
3. Admin-only endpoints reject non-Admin users.
4. Direct URL access to protected pages cannot expose protected data or administrative functionality without authentication.
5. Direct API requests from outside the UI cannot bypass the same controls.

Any discovered security bypass is a bug and MUST be fixed before the feature is considered complete.

## Testing
Do not claim a change was tested unless it was actually tested.
Before declaring a feature complete, inspect related frontend/backend/database behavior and perform appropriate syntax/structural checks.

## GitHub
Use the main branch unless the user specifies otherwise.
Inspect the repository before modifying files.
Prefer meaningful commits.
Never invent commit hashes.

## Security
Never put passwords, API keys, GitHub tokens, database passwords, session secrets, or other credentials into AI_PROJECT_STATE.md, this instruction file, source code, or commit messages.

If a credential is exposed, recommend revocation/rotation.

## Language
Communicate with the user primarily in Persian. Keep code, API names, database identifiers, file names, and technical identifiers in their original form.

## Starting work from another AI
When continuing an existing task:
1. Read AI_PROJECT_STATE.md.
2. Inspect the current GitHub repository.
3. Verify the state against the current code.
4. Continue from # NEXT ACTION.
5. Update AI_PROJECT_STATE.md after significant changes.

## Final session rule
Before ending a substantial development session, ensure AI_PROJECT_STATE.md accurately describes the current repository state.

The final section of AI_PROJECT_STATE.md MUST be:

# NEXT ACTION

It must contain concrete actions another AI can execute immediately.

## Priority
Use this priority when resolving conflicts:
1. User's latest explicit request
2. Existing user-established project requirements
3. Current GitHub source
4. AI_PROJECT_STATE.md
5. Earlier conversation history
6. General assumptions

The AI_PROJECT_STATE.md file must never override a newer explicit user requirement.
