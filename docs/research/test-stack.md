---
library: Test stack — Vitest + Testing Library + Playwright (vs Jest + Cypress)
packages: [vitest, "@vitest/browser", "@testing-library/react", "@testing-library/user-event", jsdom, happy-dom, "@playwright/test", "@axe-core/playwright", jest, "jest-environment-jsdom", cypress, cypress-axe]
version: 'vitest@5.0.1, @testing-library/react@16.3.3, @testing-library/user-event@14.6.7, jsdom@30.1.0, happy-dom@20.14.5, @playwright/test@1.63.0, @axe-core/playwright@4.13.0, jest@30.5.2, cypress@16.1.0, cypress-axe@1.7.0'
researched: 2026-09-19
sources:
  [
    https://vitest.dev/guide/browser/,
    https://vitest.dev/guide/workspace.html,
    https://testing-library.com/docs/user-event/pointer/,
    https://testing-library.com/docs/user-event/keyboard/,
    https://testing-library.com/docs/user-event/convenience/,
    https://playwright.dev/docs/browsers,
    https://playwright.dev/docs/trace-viewer-intro,
    https://playwright.dev/docs/accessibility-testing,
    https://playwright.dev/docs/test-use-options,
    https://playwright.dev/docs/docker,
    https://playwright.dev/docs/input,
    https://playwright.dev/docs/aria-snapshots,
    https://playwright.dev/docs/api/class-cdpsession,
    https://jestjs.io/docs/ecmascript-modules,
    https://docs.cypress.io/app/references/trade-offs,
    https://docs.cypress.io/app/guides/cross-browser-testing,
    https://github.com/jsdom/jsdom,
    https://github.com/nickcolley/jest-axe,
    https://registry.npmjs.org,
  ]
---

# Test stack: Vitest + Testing Library + Playwright, vs Jest + Cypress (2026-09-19)

## Summary

Recommendation for wechart's test stack, evaluated against AC-057 (keyboard tile ops), AC-088 (pointer rectangle/lasso mark selection), AC-005 (WCAG AA contrast), AC-174 (p95 render timing), AC-180 (cross-browser). Covers the web app (Vite/React SPA), the Node/TypeScript API, and the pnpm monorepo.

## Pinned versions (npm registry, `/latest`, checked 2026-09-19)

| Package                                                                                                     | Version | Node engines                           | License                                    |
| ----------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------- | ------------------------------------------ |
| vitest                                                                                                      | 5.0.1   | `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`  | MIT                                        |
| jsdom                                                                                                       | 30.1.0  | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` | MIT                                        |
| happy-dom                                                                                                   | 20.14.5 | `>=20.0.0`                             | MIT                                        |
| @testing-library/react                                                                                      | 16.3.3  | peer react/react-dom `^18\|\|^19`      | MIT                                        |
| @testing-library/user-event                                                                                 | 14.6.7  | peer `@testing-library/dom >=7.21.4`   | MIT                                        |
| @playwright/test                                                                                            | 1.63.0  | `>=20`                                 | Apache-2.0                                 |
| @axe-core/playwright                                                                                        | 4.13.0  | peer `playwright-core >=1.0.0`         | (Deque, MIT-family; unverified exact SPDX) |
| jest                                                                                                        | 30.5.2  | `^18.14.0 \|\| ^20 \|\| ^22 \|\| >=24` | MIT                                        |
| cypress                                                                                                     | 16.1.0  | `^22.0.0 \|\| ^24.0.0 \|\| >=26.0.0`   | MIT                                        |
| cypress-axe                                                                                                 | 1.7.0   | peer `cypress ^10..^15`                | (unverified SPDX)                          |
| All engine ranges cover Node 26. Source: npm registry `latest` metadata for each package, fetched directly. |

## Init / auth pattern

**Vitest projects in the pnpm monorepo** — `workspace`/`vitest.workspace.ts` is deprecated since 3.2 in favor of a single root `projects` array; each project can set its own `environment` (`jsdom` for the web app, `node` for the API package), inherits root config unless `extends: false`, and can be filtered with `vitest --project web`. [Vitest workspace guide](https://vitest.dev/guide/workspace.html)

```ts
// vitest.config.ts (root)
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'web', include: ['apps/web/**/*.test.ts?(x)'], environment: 'jsdom' } },
      { test: { name: 'api', include: ['apps/api/**/*.test.ts'], environment: 'node' } },
    ],
  },
});
```

Each package still needs its own `test`/`typecheck` script per CLAUDE.md; each can invoke `vitest run --project <name>` against the root config, satisfying the hooks while sharing one config.

**Vitest browser mode** runs tests inside a real browser via a Playwright or WebdriverIO provider (Playwright provider → Chromium/Firefox/WebKit) rather than simulating the DOM, and is documented as a first-class, non-experimental feature in v5. [Vitest browser guide](https://vitest.dev/guide/browser/)

**Playwright**: `playwright.config.ts` with `projects` per browser (`chromium`, `firefox`, `webkit`, plus a Chromium project using `channel: 'chrome'`/`'msedge'` to test the actual installed Chrome/Edge binary rather than Playwright's bundled Chromium). [Playwright browsers](https://playwright.dev/docs/browsers)

## API surface we will use

- **@testing-library/user-event `pointer()`**: describes press/move/release sequences with `[MouseLeft>]` / `[/MouseLeft]`, and multi-pointer drags via `pointerName`; works only against jsdom's DOM, "there is no layout in jsdom" so it does not validate hit positions. [user-event pointer docs](https://testing-library.com/docs/user-event/pointer/)
- **`keyboard()`**: `'{ArrowUp}'`, `'{Shift>}{ArrowRight}{/Shift}'`, `'{Delete}'`, `'e'` — covers AC-057's key set syntactically. [user-event keyboard docs](https://testing-library.com/docs/user-event/keyboard/)
- **Playwright `page.mouse.down/move/up`** for drag sequences, **`page.keyboard.down('Alt')`/`up`** wrapping a mouse drag for modifier-held drags, and **`locator.press('Shift+ArrowRight')`** for single-shot keyboard combos — directly matches AC-057 and AC-088's Alt-drag lasso semantics, in a real browser with real layout. [Playwright input docs](https://playwright.dev/docs/input)
- **Playwright `toHaveScreenshot()`** / **Vitest browser `toMatchScreenshot()`**: pixel-diff screenshot assertions taken from the real rendered page, so canvas content (ECharts) is included — Vitest's own docs warn rendering "is not perfectly deterministic across environments" and recommend running in a standardized container/CI image. [Vitest visual regression](https://vitest.dev/guide/browser/visual-regression-testing)
- **`AxeBuilder` (`@axe-core/playwright`)**: `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze()`, asserting `results.violations` is empty — this is the tool that can actually check AC-005's contrast rule (see Gotchas). [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- **`page.ariaSnapshot()` / `expect(locator).toMatchAriaSnapshot()`**: YAML accessibility-tree snapshots for structural a11y regression testing (roles, names, aria-* state), independent from axe rule checks. [Playwright ARIA snapshots](https://playwright.dev/docs/aria-snapshots)
- **Trace/video**: `use: { trace: 'on-first-retry', video: 'retain-on-failure' }` (also `'on'`, `'off'`, `'on-all-retries'`); trace captures a step-by-step DOM/network/console record viewable in Trace Viewer. [Playwright trace viewer](https://playwright.dev/docs/trace-viewer-intro), [test-use-options](https://playwright.dev/docs/test-use-options)
- **Timing for AC-174**: no built-in "assert p95 < 3s" API. Options confirmed in docs: `page.evaluate(() => performance.now()/getEntriesByType(...))` for in-page timing, or a `CDPSession` (`page.context().newCDPSession(page)`, `client.send('Performance.getMetrics')`) for Chromium-only low-level metrics. [CDPSession docs](https://playwright.dev/docs/api/class-cdpsession). p95-over-N-runs aggregation is not a Playwright feature; it must be scripted outside the test framework (run N times, collect samples, compute the percentile).
- **Docker/remote**: official Playwright Docker image ships browsers + system deps but not the `playwright` package itself; to run against an already-deployed app (e.g. a k8s namespace), set `use.baseURL` from an env var (`STAGING=1` pattern), or run a `Playwright Server` in-cluster and connect via `PW_TEST_CONNECT_WS_ENDPOINT`. [Playwright Docker](https://playwright.dev/docs/docker), [parameterize/baseURL](https://playwright.dev/docs/test-parameterize)

## Gotchas

- **jsdom has no layout engine** ("Navigation and Layout" are explicitly out of scope); `getBoundingClientRect`/`offsetTop`/etc. return dummy zero values. This means AC-088's rectangle/lasso hit-testing (does the dragged shape geometrically touch a tile) **cannot be meaningfully exercised through the DOM in jsdom or happy-dom** — the selection geometry logic must be unit-tested as pure functions, or driven through Playwright/Vitest browser mode where real layout exists. [jsdom README](https://github.com/jsdom/jsdom)
- **jsdom canvas is not native**: `<canvas>` behaves like a `<div>` unless the separate `canvas` npm package is installed as a peer; even then it's a CPU canvas re-implementation, not the app's real ECharts renderer. Assertions against actual canvas pixel output (chart marks, selection highlight on AC-088) need a real browser (Playwright or Vitest browser mode), not jsdom. `vitest-canvas-mock` (v1.2.0) only stubs the API surface so canvas code doesn't throw in jsdom — it does not render real pixels. [jsdom README](https://github.com/jsdom/jsdom)
- **axe's `color-contrast` rule does not work under jsdom** — `jest-axe`'s README states this explicitly and turns the rule off by default; the same limitation applies to any axe run inside a jsdom/happy-dom environment. **AC-005 (WCAG AA contrast) can only be verified with axe running against a real browser rendering**, i.e. Playwright + `@axe-core/playwright`, not Vitest+jsdom. [jest-axe README](https://github.com/nickcolley/jest-axe)
- **Jest's ESM support is still experimental**: requires `NODE_OPTIONS=--experimental-vm-modules`, `jest.unstable_mockModule()` instead of `jest.mock()`, and loses static-import hoisting — real friction against a Vite/ESM-native codebase. Vitest shares Vite's config/transform pipeline and needs none of this. [Jest ECMAScript Modules docs](https://jestjs.io/docs/ecmascript-modules)
- **Cypress runs one browser per run** (no parallel multi-browser session in a single spec) and cross-origin navigation needs the explicit `cy.origin` command; the browser-support/trade-offs pages give no confirmation of real Alt/Shift-modified drag parity or canvas-pixel assertions, and the "browser-support" doc URL used in earlier Cypress versions now 404s (docs reorganized) — treat Cypress's modifier-key-drag and canvas story as **unverified**, not confirmed-working. [Cypress trade-offs](https://docs.cypress.io/app/references/trade-offs), [Cypress cross-browser testing](https://docs.cypress.io/app/guides/cross-browser-testing)
- **cypress-axe's declared peer range tops out at `cypress ^15`**, one major below the pinned `cypress@16.1.0` — using it today means relying on an unverified/undeclared compatibility. [cypress-axe package metadata](https://registry.npmjs.org/cypress-axe/latest)
- Playwright cannot use branded Safari or branded Firefox; it ships its own WebKit/Firefox builds "ahead of" or "matching" stable releases, and Safari testing is only ever via WebKit-engine parity, not the real Safari binary (Safari-proper testing needs macOS + actual Safari, outside both Playwright's and Cypress's native browser set). This is a real gap against AC-180's "current Safari" wording. [Playwright browsers](https://playwright.dev/docs/browsers)

## What each option cannot do for these ACs

- **jsdom/happy-dom (any runner)**: no layout → AC-088 hit-testing untestable at the DOM level; no real canvas → chart/selection pixel assertions untestable; axe contrast rule disabled → AC-005 untestable.
- **Jest**: same jsdom limitations above, plus experimental/fragile ESM support against a Vite-built codebase; no first-party Vite-config reuse.
- **Cypress**: no confirmed real modifier+drag/canvas story found in primary docs (unverified, see Gotchas); single-browser-per-run model; less mature axe peer-version support for the pinned version.
- **Playwright**: no built-in performance/percentile-assertion API — AC-174's p95 must be computed by custom scripting around Playwright, not a built-in feature; no real Safari binary.

## Recommendation

Vitest 5.0.1 + `@testing-library/react` 16.3.3 + `@testing-library/user-event` 14.6.7 + jsdom 30.1.0 for fast unit/component tests of pure logic and simple interactions (including the API package, via a `node` project) — Vite-native, no experimental-flag ESM friction, and the same `projects` mechanism serves both the web app and the API package. [Vitest workspace guide](https://vitest.dev/guide/workspace.html)

Playwright 1.63.0 (+`@axe-core/playwright` 4.13.0) for anything that depends on real layout, real canvas pixels, real cross-browser engines, or real timing: AC-088 (drag/lasso hit-testing), AC-005 (contrast, since axe's contrast rule needs real rendering), AC-174 (timing via CDP/Performance API, scripted percentile aggregation), and AC-180 (Chromium/`chrome`/`msedge` channels + Firefox + WebKit projects). This is a correctness argument, not a convenience one: jsdom structurally cannot produce the layout/pixel/contrast data these ACs require, regardless of which runner drives it.

Reject Jest+Cypress: Jest's ESM support is explicitly experimental against a Vite/ESM codebase, and Cypress's single-browser model plus unverified modifier-drag/canvas support and lagging axe peer range make it a weaker, less-verifiable fit for AC-088/AC-180/AC-005 than the Playwright option, with no countervailing correctness advantage found in its own docs.

## Open questions / unverified

- Whether `@testing-library/user-event`'s `pointer()` and `keyboard()` calls share modifier state (so `keyboard('{Alt>}')` then `pointer(...)` yields `altKey: true` on the resulting pointer events) is **not confirmed** by the docs pages fetched (`intro`, `pointer`, `keyboard`, GitHub README) — this needs a source-level check of the `user-event` package before relying on it to simulate AC-088's Alt-drag in jsdom-based component tests.
- Cypress's official current browser-support and WebKit-experimental-status page returned 404 at the URL tried; only `trade-offs` and `cross-browser-testing` pages were available, so Cypress's exact WebKit/Safari caveat text is unverified.
- `@axe-core/playwright` and `cypress-axe` SPDX license identifiers were not directly returned by the registry fetch (Deque-authored, MIT-family assumed but not confirmed).
- No official Playwright "performance testing" guide page was found (`test-timeouts` and `evaluating` pages don't cover it); the `CDPSession`/`Performance.getMetrics` approach is inferred from the general CDPSession API reference, not a dedicated performance-testing guide, and is Chromium-only.

---

## Addendum: the bold threshold for WCAG large text (added at T002, 2026-09-19)

Not part of the original research; added because `packages/ui/src/audit/contrast.ts` needed a numeric weight for "bold" and CLAUDE.md requires a source for third-party behaviour.

WCAG 2.2 defines "large scale" text as 18 pt, or **14 pt bold**, without defining a weight for "bold" ([Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)). Two facts settle it for us:

- CSS maps the `bold` keyword to numeric weight **700** ([CSS Fonts 4, `font-weight`](https://www.w3.org/TR/css-fonts-4/#font-weight-prop)).
- **axe-core 4.13.0 uses `boldValue: 700`**, and converts px to pt as `Math.ceil(fontSize * 72) / 96`, comparing against `largeTextPt: 18` and `boldTextPt: 14` — so 18.66 px is exactly 14 pt. Verified in the installed package at `node_modules/.pnpm/axe-core@4.13.0/node_modules/axe-core/axe.js` (`boldValue` at :33686 and :32618, applied at :27206; the pt conversion at :27207-27208).

This matters because T008 runs axe against the rendered page while `contrast.ts` audits the tokens. Our type scale's heavy weight is **600**, so a threshold of 600 would grant `text-lg` (20 px / 600) the 3:1 allowance that axe then refuses. `contrast.ts` therefore uses 700 — the stricter of the two — and `text-lg` clears 4.5:1 on every surface regardless.
