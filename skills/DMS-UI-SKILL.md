---
name: dms-ui-skill
description: Design and improve the factory Drawing Management System UI using Taste-inspired visual quality while strictly preserving DMS functionality, permissions, workflow, data behavior, and existing technology.
---

# DMS UI Skill

## Purpose

This skill governs all UI/UX work on the factory Drawing Management System (DMS).

Use Taste principles as the visual-quality baseline, but adapt them to an internal industrial engineering application rather than a marketing website. The interface must feel professional, technical, dense where useful, calm, predictable, and production-ready.

## Non-Negotiable Project Constraints

- Work with the existing technology stack. Do not migrate frameworks or replace the application architecture for visual work.
- Do not rewrite the application from scratch.
- Do not break existing functionality.
- Do not change backend business rules, SQL schema, API contracts, authorization logic, drawing workflow, or file paths unless explicitly requested.
- Preserve the existing RBAC model. UI visibility is not authorization; backend permissions remain authoritative.
- Never hard-code a role as a substitute for a permission. Use the application's permission model.
- Preserve English LTR unless explicitly requested otherwise.
- Preserve the existing DMS information architecture: tree, node details, drawings/files, workflow/cart, and administration.
- Existing user workflows take priority over visual experimentation.
- Before adding a dependency, inspect the project's dependency files and prefer existing libraries.

## Design Direction

The visual language should communicate:

- Industrial engineering
- Precision
- Document control
- Reliability
- Technical hierarchy
- Controlled workflow
- Professional enterprise software

Avoid generic AI-dashboard aesthetics. Do not use the common purple/blue AI-gradient look, excessive glassmorphism, excessive rounded cards, decorative blobs, meaningless gradients, or visual effects that compete with engineering data.

Use one coherent accent system and a restrained neutral palette. Existing DMS brand/theme choices should be preserved unless there is a clear design reason to refine them.

## Existing Project Audit

Before changing UI:

1. Read the relevant code.
2. Identify the current framework, CSS architecture, components, and shared styles.
3. Identify existing design tokens and reusable UI patterns.
4. Identify the relevant permission checks and API calls before changing controls.
5. Identify states: loading, empty, error, disabled, active, selected, hover, focus, and permission-denied.
6. Identify existing responsive behavior.
7. Fix the smallest set of high-impact problems first.

Do not assume that a visually weak component should be replaced wholesale. Prefer targeted improvements.

## Layout

- Use CSS Grid for major page structure where it improves alignment and maintainability.
- Use a consistent container and spacing system.
- Preserve the DMS tree/detail relationship.
- Keep the interface information-dense where users work with nodes, drawings, files, requests, and production data.
- Do not add unnecessary whitespace merely to imitate marketing websites.
- Maintain stable positions for controls between expanded and collapsed states.
- The sidebar must not cause primary controls to jump vertically when its state changes.
- A collapsed sidebar should remain usable as an icon rail; labels must remain accessible through tooltips or equivalent accessible naming.
- Interactive targets should be comfortably clickable, preferably at least 44x44px where practical.
- Avoid excessive card grids. Use panels, tables, grouped controls, split views, and structured sections where those better match the data.
- Use visual depth intentionally, not decoration for its own sake.

## Typography

- Use a deliberate type hierarchy.
- Avoid relying on browser-default typography.
- Do not use excessive font weights.
- Use medium and semibold weights to establish hierarchy.
- Data-heavy numbers should use tabular figures where appropriate.
- Keep labels concise and readable.
- Use sentence case for UI headings unless an established DMS convention requires otherwise.
- Avoid decorative typography that reduces technical readability.

## Color and Surfaces

- Use a restrained palette with one primary accent.
- Keep neutral colors within one coherent temperature family.
- Avoid oversaturated colors.
- Avoid the purple/blue AI-gradient aesthetic.
- Do not use pure black backgrounds unless specifically required.
- Use borders, tonal surfaces, spacing, and subtle elevation to establish hierarchy.
- Do not give every element a border and shadow.
- Use status colors semantically and consistently.
- Do not use color as the only indication of state; pair it with text, iconography, or another visual cue.

## DMS-Specific Status Semantics

Where applicable, status should be immediately understandable:

- Success / completed: positive semantic treatment
- Pending / waiting: neutral or attention treatment
- Rejected: negative semantic treatment
- Returned for correction: warning/attention treatment
- In progress: active treatment
- Permission denied: muted but explicit treatment
- Error: clear negative treatment

Do not invent new statuses or rename workflow statuses during UI-only work.

## Interaction and States

Every important interactive component must account for:

- Default
- Hover
- Focus
- Active/pressed
- Disabled
- Loading
- Empty
- Error
- Permission denied
- Selected/current state

Use transitions around 150–300ms where appropriate. Prefer transform and opacity for animation rather than animating layout properties.

Keyboard focus must remain visible.

Never use `window.alert()` for normal application errors when an inline or contextual message can be used.

Loading states should match the shape of the content where practical instead of relying exclusively on generic spinners.

## Navigation and Sidebar

- Preserve the existing DMS sidebar architecture unless a redesign is explicitly requested.
- Expanded and collapsed states must share the same vertical alignment for corresponding controls.
- Do not allow collapse/expand to move controls to a different vertical position.
- Icon-only controls must have accessible names and tooltips.
- The active destination must be visually distinct.
- Do not hide important functionality solely because the sidebar is collapsed.
- If a navigation group is collapsed visually, ensure inactive content cannot create unwanted keyboard focus.

## Node Tree and Node Details

The tree is a core DMS control and must remain the visual anchor of the application.

- Preserve hierarchy visibility and expand/collapse behavior.
- Search results must remain understandable.
- Selected nodes must be clearly identifiable.
- Node metadata must not be visually confused with actionable controls.
- Node Details actions should be grouped according to importance.
- Do not introduce unnecessary modal dialogs for simple actions.
- Preserve drawing/file access behavior.

## Drawing and File UI

Drawing and document interfaces must prioritize identification and controlled access over decoration.

- Preserve file type and folder semantics.
- Make drawing/document status visible.
- Preserve existing Danieli/SRSC visual distinctions where those are part of the current product behavior.
- Do not alter file URLs, server paths, download behavior, or authorization while styling the UI.
- Do not expose direct filesystem paths to users merely for visual convenience.
- Upload, delete, and edit controls must continue to be governed by backend authorization.

## Workflow / Request UI

The drawing-request workflow is business-critical.

- Preserve request lifecycle and status semantics.
- Keep worklists/cart views easy to scan.
- Make current responsibility and next action obvious.
- Distinguish approve, reject, return-for-correction, delegate, accept, and complete actions clearly.
- Do not visually merge actions that have different business consequences.
- Confirmation should be used for destructive or irreversible actions.
- Do not modify workflow transitions during UI redesign.

## Tables and Dashboards

For production/reporting dashboards:

- Numbers must be visually scannable.
- Use tabular numerals for counters and measurements.
- Align numeric columns consistently.
- Never invent or approximate data for visual completeness.
- Empty data must be represented honestly.
- Charts should communicate a real metric and include understandable labels/units.
- Avoid decorative charts that do not answer a business question.
- Use hierarchy to distinguish headline KPIs from supporting metrics.
- Dense data is acceptable when grouping, spacing, and alignment remain clear.

## Content

- Use real DMS terminology.
- Do not use Lorem Ipsum.
- Do not use generic placeholder names in production UI.
- Avoid marketing clichés such as "Elevate", "Seamless", "Next-Gen", and similar AI-generated copy.
- Error messages should state what failed and what the user can do next.
- Success messages should be concise and professional.

## Accessibility

- Use semantic HTML where possible.
- Every meaningful image needs useful alt text.
- Interactive controls require accessible names.
- Maintain visible keyboard focus.
- Do not rely solely on color.
- Preserve adequate contrast.
- Do not leave hidden interactive elements in the keyboard tab order.
- Respect reduced-motion preferences for non-essential animation.

## Responsive Behavior

Test important screens at:

- Desktop / wide LAN workstation
- Laptop / medium desktop
- Narrow/mobile viewport where applicable

The desktop DMS experience is primary, but responsive degradation must be intentional rather than accidental.

## Visual Review Process

For every significant UI change:

1. Audit the existing implementation.
2. Identify the top visual and usability problems.
3. Implement focused improvements.
4. Check the result in a real browser when the execution environment permits it.
5. Review screenshots at multiple widths.
6. Fix the three most important remaining visual/usability problems.
7. Verify that functionality and permissions remain unchanged.

Do not stop at "it compiles". Visual work is incomplete until the rendered result has been reviewed.

## Fix Priority

Prioritize:

1. Broken or misleading hierarchy
2. Incorrect spacing/alignment
3. Poor typography
4. Weak interactive states
5. Inconsistent color/surface treatment
6. Generic component patterns
7. Missing loading/empty/error states
8. Final visual polish

## Code Quality

- Prefer semantic HTML.
- Keep styling inside the project's established styling system.
- Avoid arbitrary z-index values.
- Avoid duplicated CSS rules.
- Reuse existing components and design tokens.
- Keep changes reviewable and focused.
- Remove debug code and unused styles introduced during the task.
- Verify imports and dependencies before use.

## Final Verification Checklist

Before declaring a UI task complete, verify:

- Existing functionality still works.
- Existing API calls and data behavior are unchanged unless requested.
- Permissions still control action visibility and backend authorization remains authoritative.
- No workflow transition was accidentally changed.
- Sidebar expanded/collapsed states remain aligned.
- Loading, empty, error, disabled, hover, focus, and active states are covered where relevant.
- No generic AI visual patterns were introduced.
- Typography hierarchy is intentional.
- Spacing and alignment are consistent.
- Numeric data is aligned and readable.
- The UI remains usable at relevant viewport sizes.
- No new dependency was added unnecessarily.
