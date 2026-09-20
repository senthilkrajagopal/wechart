---
library: WebKit native select and option font sizing
packages: []
version: WebKit bundled with Playwright 1.63.0
researched: 2026-09-20
sources:
  [
    'measured directly — packages listed above, probe reproduced below',
    https://github.com/microsoft/playwright/releases/tag/v1.63.0,
  ]
---

# WebKit `<select>` / `<option>` font sizing

Measured, not read. This exists because `docs/design/direction.md` §3 carried a
claim about WebKit that was written from an observation rather than a test, and
the claim was wrong in both halves. AC-004 ("every text node at a computed font
size of at least 12 px") rests on it, so it is worth having the facts.

## Method

Each engine is launched through Playwright and asked for the **computed**
`font-size` of a `select` and of its `option`, on a page whose `body` is
`14px/20px system-ui`. Run from `e2e/`, where `@playwright/test` resolves:

```js
import { chromium, firefox, webkit } from '@playwright/test';

const page = (css) =>
  'data:text/html,' +
  encodeURIComponent(
    `<style>body { font: 14px/20px system-ui; } ${css}</style>` +
      `<select id="s"><option id="o">Item</option></select>`,
  );

const browser = await webkit.launch();
const tab = await browser.newPage();
await tab.goto(page('select, option { font: inherit; }'));
await tab.evaluate(() => ({
  select: getComputedStyle(document.getElementById('s')).fontSize,
  option: getComputedStyle(document.getElementById('o')).fontSize,
}));
```

## Results

Inheriting, which is what wechart ships (`packages/web/src/shell/styles.ts`):

| Engine | rule | `select` | `option` |
| --- | --- | --- | --- |
| WebKit | `select, option { font: inherit }` | **11 px** | **11 px** |
| Firefox | `select, option { font: inherit }` | 14 px | 14 px |
| Chromium | — | not run; the Playwright chromium build is not installed locally (the suite uses the real `chrome` channel) |

WebKit only, varying the rule:

| rule | `select` | `option` |
| --- | --- | --- |
| `select, option { font: inherit }` | 11 px | 11 px |
| `select, option { font-size: 14px; font-family: inherit }` | **11 px** | **14 px** |
| `select { font-size: 14px; font-family: inherit }` | 11 px | 11 px |
| `#big option { font-size: 20px }` | — | **20 px** |

## What follows

1. **WebKit does not ignore author `font-size` on `option`.** An explicit size
   is honoured — 14 px and 20 px both came through. The original claim was
   wrong, and the option half of the exception is fixable with one declaration.
2. **`font: inherit` does not take on a `select` in WebKit.** The control falls
   back to its UA 11 px where Firefox honours the inherited 14 px. That is the
   difference between the engines, and it is about `select`, not `option`.
3. **An explicit `font-size` does not move the `select` either** — 11 px in all
   three WebKit rows. This is the genuine platform limit, and it applies to the
   **closed** control, which is the part a reader sees without opening anything.
   The original wording had this backwards, claiming the closed control was fine
   and only the open popup was not.
4. **The audit could not have caught it.** `FONT_SIZE_SWEEP` in
   `e2e/a11y-tokens.spec.ts` walks text nodes and attributes each to its parent
   element; a `select`'s text lives in its `option` children, so `select` is
   never measured directly and skipping `option` silenced the control as well.

## Open questions / unverified

- **UNVERIFIED: whether Safari the browser behaves as Playwright's WebKit
  build does.** These numbers come from the bundled WebKit, which is not the
  shipped Safari. The e2e suite treats WebKit as the closest available proxy
  (see `docs/research/test-stack.md`), and the same caveat applies here.
- **UNVERIFIED: why an explicit `font-size` moves `option` but not `select`.**
  Measured, not explained. No WebKit source or bug report was read.
- **Not measured: Chromium.** Its Playwright build is not installed; the suite
  runs the real `chrome` channel instead. Whether Chrome matches Firefox here
  is untested.
- **Not measured: `appearance: none`,** which is the usual lever for making a
  native control take author styling, and which might move the closed control.
  It was not tried, and it changes the control's whole appearance, so it is a
  design question rather than only a technical one.
