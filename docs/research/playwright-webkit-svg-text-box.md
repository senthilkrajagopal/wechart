---
library: Playwright (WebKit)
packages: []
version: 1.63.0
researched: 2026-09-24
sources:
  [
    local measurement on this repository (T254), described below,
  ]
---

# Playwright's `boundingBox()` of middle-anchored SVG text in WebKit

An observation, not a documented behaviour. It is recorded because the markings
and cross-filter e2e helpers were changed on the strength of it (T254). No
upstream issue or documentation was consulted, so the cause is **UNVERIFIED**.

## What was measured

- **Setup:**
  - Playwright 1.63.0's bundled WebKit and Chrome (channel `chrome`), at a 1280×720 viewport.
  - The seeded dashboard `seed-root-dashboard-1` on the demo build.
  - The axis label "Components" in the tile `tile-status`. ECharts writes it as `<text dominant-baseline="central" text-anchor="middle" transform="translate(162.2109 236.485)" …>`.
- **Chrome:** `element.getBoundingClientRect()` gave x = 167.2, width 71.9.
- **WebKit:**
  - `element.getBoundingClientRect()` gave x = 167.2, width 72.1, the same as Chrome.
  - Playwright's `locator.boundingBox()` gave **x = 203.2**, width 72.1, in two separate runs.
  - That is half the width to the right, as if the anchor were ignored.
- **The consequence:**
  - The helpers click 10 px above the label's centre as `boundingBox()` gave it.
  - In WebKit, on the prototype's wider grid (T254), that point fell in the surface gap between two bars. `elementFromPoint` returned the `<svg>`, so nothing was marked.
  - Before T254 the same misplaced click happened to land on a bar.

## Consequence for tests

To find where a middle-anchored SVG label is, read the element's own
`getBoundingClientRect()` rather than Playwright's `boundingBox()`. Wait until
two readings agree, since a chart can still be laying out.

## UNVERIFIED

- Whether this is a WebKit protocol quad issue, a Playwright one, or specific to `text-anchor="middle"` with a `translate` transform.
- Whether it affects `text-anchor="end"` the same way.
