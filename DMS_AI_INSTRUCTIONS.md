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

## Usage/context capacity warning
The user explicitly requires advance warning before the AI session approaches its usage/context/capacity limit.

When the AI reasonably determines that the current session is approaching a point where continuing may become unreliable or interrupted:

1. Immediately warn the user in Persian.
2. Do NOT wait for the session to end.
3. Update AI_PROJECT_STATE.md before stopping.
4. Record:
   - current task
   - completed work
   - unfinished work
   - known bugs
   - latest commit
   - exact next action
5. Commit the updated state file to GitHub.

Suggested warning:
"⚠️ ظرفیت این نشست رو به اتمام است. برای اینکه ادامه پروژه از بین نرود، الان وضعیت کامل پروژه را در AI_PROJECT_STATE.md به‌روزرسانی می‌کنم و آخرین تغییرات را در GitHub ثبت می‌کنم."

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
