---
name: ui-design
description: Runs the design research and direction phase. ui-researcher studies real products in the domain, this skill commits a design direction and tokens to docs/design/, and after UI is built design-critic reviews the rendered result. Use before planning or building any UI, and after UI tasks land.
---

# UI design

Outputs: `docs/design/references.md`, `docs/design/direction.md`, and `docs/design/critiques/<YYYY-MM-DD>-<surface>.md`.

## Phase A: research (before any UI task is planned)

1. Dispatch ui-researcher with:
   - the product domain: enterprise BI, covering dashboard authoring, chart building, and semantic-layer management on Cube
   - the user roles from `docs/requirements.md`
   - the UI-facing ACs from `docs/spec.md`
   - `docs/inputs/`

   It studies 5–8 real products and commits to one direction.
2. Write its result verbatim to `docs/design/references.md`.

## Phase B: direction (commit, then codify)

Write `docs/design/direction.md` from the committed direction:

- **Principles:** 3–5 principles. Tie each one to a reference observation and a user role.
- **Layout:** the app shell, authoring canvas, panels and inspectors, dashboard grid, tabs and sections, and breakpoints.
- **Type scale:** size, line-height, and weight tokens, noting which reference product each value comes from.
- **Density and spacing:** the base unit, the spacing scale, and row heights for tables and lists.
- **Color:** UI roles (surface, text, border, accent, status), plus data-viz palettes (categorical, sequential, diverging) in light and dark. Include channel-capacity limits, such as at most 8–10 categorical colors.
- **Charts:** legend rules, axis defaults and the customization users can make, empty, loading, and error states, and how a recommended chart and the user's override are shown.
- **Interaction:** drag-and-drop affordances, selection, global filters and cross-filters, undo, and keyboard access.
- **Components:** the primitives and their states.
- **Checklist:** numbered, checkable rules that design-critic and write-spec can refer to. Examples: "a legend appears when there are 2 or more series", "all text meets WCAG AA contrast".

Choose based on user fit and the evidence in the references, never on how much effort a direction takes to build. Show the user a summary of the direction and let them accept or redirect it with AskUserQuestion before any UI task is planned.

## Phase C: build support

When implementing UI, apply `docs/design/direction.md` alongside the frontend-design skill (installed as a project plugin). Where the two disagree, direction.md wins.

## Phase D: critique (after UI tasks land)

1. Make sure the app is running locally and reachable.
2. Dispatch design-critic with the URLs, the surfaces to review, and the paths to references.md and direction.md.
3. Save its report to `docs/design/critiques/<YYYY-MM-DD>-<surface>.md`.
4. A finding that violates a spec AC becomes a fix. A finding that doesn't map to any AC goes to the user as a proposed spec change.
