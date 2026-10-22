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

## Project-Wide UI Change Rule

Every new or modified DMS UI element MUST follow the existing DMS theme and shared UI patterns. This includes buttons, dialogs, modals, worklists, viewers, status indicators, forms, and action controls.

When modifying or adding UI:

- Reuse the existing DMS design tokens, CSS variables, typography, spacing, borders, radii, shadows, interaction states, and component patterns whenever available.
- Match the visual hierarchy and density of the surrounding DMS screen.
- Do not introduce isolated component styling, arbitrary colors, unrelated gradients, or a new visual language.
- Status colors must use the same semantic status conventions already used by DMS.
- New UI must support the existing DMS interaction conventions, including keyboard and modal close behavior where applicable.
- This rule applies automatically to every future UI change unless the user explicitly requests a different visual treatment.

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
