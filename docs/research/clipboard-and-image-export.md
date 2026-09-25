---
library: Browser Clipboard API and chart image export
packages: []
version: 6.1.0
researched: 2026-09-25
sources:
  [
    https://w3c.github.io/clipboard-apis/,
    https://github.com/w3c/clipboard-apis/blob/main/index.bs,
    https://w3c.github.io/webappsec-secure-contexts/,
    https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API,
    https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write,
    https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/ClipboardItem,
    https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/supports_static,
    https://github.com/mdn/browser-compat-data/blob/main/api/Clipboard.json,
    https://github.com/mdn/browser-compat-data/blob/main/api/ClipboardItem.json,
    https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/127,
    https://bugzilla.mozilla.org/show_bug.cgi?id=1619947,
    https://webkit.org/blog/10855/async-clipboard-api/,
    https://web.dev/articles/async-clipboard,
    https://html.spec.whatwg.org/multipage/interaction.html#transient-activation-duration,
    https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts,
    https://github.com/apache/echarts/blob/6.1.0/src/core/echarts.ts,
    https://github.com/apache/echarts-doc/blob/master/en/api/echarts-instance.md,
    https://github.com/ecomfe/zrender/blob/6.1.0/src/svg/Painter.ts,
    https://github.com/ecomfe/zrender/blob/6.1.0/src/svg/core.ts,
    https://github.com/ecomfe/zrender/blob/6.1.0/src/svg/mapStyleToAttrs.ts,
    https://github.com/ecomfe/zrender/blob/6.1.0/src/svg/graphic.ts,
    https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image,
    https://www.w3.org/TR/svg-integration/,
    https://groups.google.com/a/chromium.org/g/blink-dev/c/JpA2vmA9XT8,
    https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob,
    https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html,
    https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a,
    https://w3c.github.io/FileAPI/,
    https://www.w3.org/TR/png-3/,
    https://github.com/microsoft/playwright/blob/v1.63.0/docs/src/api/class-browsercontext.md,
    https://github.com/microsoft/playwright/blob/v1.63.0/docs/src/api/class-download.md,
    https://github.com/microsoft/playwright/blob/v1.63.0/tests/library/permissions.spec.ts,
  ]
---

# Browser Clipboard API and chart image export (ECharts 6.1.0, SVG renderer)

**What is pinned.** `version: 6.1.0` means `echarts@6.1.0` and its dependency `zrender@6.1.0`, which the export recipe reads. The browser APIs have no package version; their minimum browser versions come from MDN's browser-compat-data (BCD) below. The test recipes are pinned to `@playwright/test@1.63.0`. That release bundles Chromium 153.0.8010.12, Firefox 155.0 and WebKit 26.6 (`PW/browsers.json`). The TypeScript notes are checked against the installed `typescript@6.0.3` `lib.dom.d.ts`. **No new package is needed.**

Source-path conventions, relative to the repository root. Line numbers are from the installed compiled `lib/` files. GitHub links go to the `src/*.ts` files at the same tag.

- `EC` = `node_modules/.pnpm/echarts@6.1.0/node_modules/echarts`
- `ZR` = `node_modules/.pnpm/zrender@6.1.0/node_modules/zrender`
- `PW` = `node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core`

## Summary

This doc serves four draft criteria from the caller: **Copy › Marked values**, **Copy › Image**, **Export › SVG** and **Export › PNG**. It also serves AC-180, the supported browsers: current desktop Chrome, Edge, Firefox and Safari. It builds on the CSV download already in place (AC-171, T177).

### Recommended recipe per feature

1. **Copy › Marked values: `navigator.clipboard.writeText(tsv)`, called synchronously inside the menu item's click handler.**
   - The TSV has a header row, tab-separated fields, one record per line. The header line is part of the `text/tab-separated-values` format, and fields containing tabs are not allowed in it ([IANA TSV][iana-tsv]).
   - writeText is supported in Chrome 66, Firefox 63 and Safari 13.1, and Edge mirrors Chrome ([BCD Clipboard][bcd-clip]).
   - Firefox and Safari require the call inside a user-gesture handler ([BCD Clipboard][bcd-clip], [MDN Clipboard API][mdn-clip-api]).

2. **Copy › Image: get the tile's ECharts instance, then `renderToSVGString()`, then post-process the SVG, then start rasterising it to a `Promise<Blob>`.** Then call `navigator.clipboard.write([new ClipboardItem({ 'image/png': thatPromise })])`, and build the item and call `write` synchronously in the click handler, with no `await` before them.
   - Why: WebKit rejects `write` outside a user gesture immediately ([WebKit blog][webkit-clip]). Google's guidance for Safari is to "run all asynchronous operations in a promise whose result you assign to the `ClipboardItem`" ([web.dev][webdev]).
   - The spec checks write permission when `write` is called, and only then reacts to each representation's promise ([spec source][clip-bs]).
   - For a KPI, table or pivot tile, or a chart in its Table view, no ECharts instance is attached (`echarts.getInstanceByDom` returns `EChartsType | undefined`, `EC/types/dist/shared.d.ts:9270`). Disable the item and say why.

3. **Export › SVG: the same post-processed SVG at CSS size, handed to the existing `saveFile`** with type `image/svg+xml` (`packages/web/src/dashboard/TileViewMenu.tsx:20-30`).

4. **Export › PNG: the same rasteriser, with the Blob handed to `saveFile`.** Widen its parameter from `string` to `string | Blob`, since `new Blob([part])` accepts a Blob part ([MDN Blob()][mdn-blob]).

5. **Don't use `getDataURL({ type: 'png' })`.** Under the SVG renderer it returns an SVG data URL whatever `type` says, and it ignores `pixelRatio` and `backgroundColor` (`EC/lib/core/echarts.js:649`, see API surface).

## Install

None. Everything here is a browser API or already installed:

- `echarts@6.1.0` is already a dependency of `@wechart/charts` ([echarts.md](/Users/srajagopal/Work/wechart/docs/research/echarts.md)).
- `@playwright/test@1.63.0` is already covered by [test-stack.md](/Users/srajagopal/Work/wechart/docs/research/test-stack.md).

Runtime requirements:

- A **secure context**, because `Clipboard` and `ClipboardItem` are `[SecureContext]` ([Clipboard API IDL][clip-spec]).
- **Transient user activation** at the moment `write` or `writeText` is called (next section).
- Minimum browser versions:

| API | Chrome / Edge | Firefox | Safari | Source |
|---|---|---|---|---|
| `clipboard.writeText` | 66 | 63 | 13.1 | [BCD Clipboard][bcd-clip] |
| `clipboard.write` | 76 (Edge 79) | **127** | 13.1 | [BCD Clipboard][bcd-clip] |
| `ClipboardItem` constructor, all value kinds | **133** (98–132: only `Blob` or `Promise<Blob>`; 76–97: only `Blob`) | 127 | 13.1 | [BCD ClipboardItem][bcd-ci] |
| `ClipboardItem.supports()` | 121 | 127 | **18.4** | [BCD ClipboardItem][bcd-ci] |

The builds Playwright 1.63.0 bundles (Chromium 153, Firefox 155, WebKit 26.6; `PW/browsers.json`) are all above these minimums.

## Init / auth pattern

### Secure context

- **The rule.** An origin is potentially trustworthy if it is `https`/`wss` or `file`, or its host is in `127.0.0.0/8` or `::1/128`. So is `localhost`, `localhost.`, or `*.localhost`, if the browser guarantees that name resolves to loopback. Anything else is not, unless the user has configured the origin as trustworthy ([Secure Contexts §3.1][sc-spec]). The same spec allows browsers to let users mark staging origins trustworthy (§7.2).
- **Chrome and Edge** treat `http://localhost/` and `http://*.localhost/` as secure contexts, "just like https://example.com/ and http://127.0.0.1/" ([blink-dev intent][blink-localhost]).
- **Firefox** has treated `localhost` URLs as secure since Firefox 84, when it began resolving them to loopback ([Firefox 84 notes][fx84]).
- **WebKit** treats `localhost`, `*.localhost`, `127.*.*.*` and `[::1]` as potentially trustworthy in `SecurityOrigin.cpp` on `main` ([WebKit source][wk-origin]). Its own bug tracker says `isSecureContext` is true on localhost even though secure cookies and mixed-content checks disagree ([WebKit 281149][wk-281149]).

**What this means for wechart:**

- The dev server, `vite preview`, and Playwright's `baseURL` `http://localhost:5273` (`playwright.config.ts:3-4`) are secure contexts in all four browsers.
- The docker-desktop k8s deployment is a secure context as long as the browser reaches it as `http://localhost:<port>` or `http://127.0.0.1:<port>`.
- **Any other plain-`http` host is not a secure context.** That includes a LAN IP, a `*.local` name or a k8s ingress hostname. There, `navigator.clipboard` is absent: "`navigator.clipboard` is not present for `http://` websites" ([WebKit blog][webkit-clip]; MDN's table marks `http://example.com` not secure, [MDN][mdn-sc]).
- The only fixes there are HTTPS or a per-browser override. Chrome's is `chrome://flags/#unsafely-treat-insecure-origin-as-secure` or `--unsafely-treat-insecure-origin-as-secure="http://host"` ([Chromium][cr-insecure]).
- **Export › SVG/PNG do not need a secure context.** They use canvas and `<a download>`, neither of which is listed as secure-context-only in the sources used here.

### User activation and permissions

**The spec.** Its `check clipboard write permission` algorithm runs in this order ([spec source][clip-bs]):

1. If the `clipboard-write` permission with `allowWithoutGesture: true` is granted, write.
2. Otherwise, if the page has transient activation, and the call came from a user agent "copy" element, write.
3. Otherwise, request permission.

`write(data)` runs that check first, in parallel, and rejects with `NotAllowedError` if it fails. It then waits for each representation's promise, rejects with `NotAllowedError` if a promise rejects or a Blob's type is not a mandatory or optional type, optionally sanitises, and writes ([spec source][clip-bs]).

**The browsers** (per [MDN Clipboard API, Security considerations][mdn-clip-api]):

- **Chromium:** "Writing requires either the `clipboard-write` permission or transient activation." Iframes need the Permissions-Policy `clipboard-write`.
- **Firefox and Safari:** "Writing requires transient activation." The `clipboard-read` and `clipboard-write` permissions "are not supported (and not planned to be supported)".
- **Prompts:** MDN describes prompts only for reads (the Firefox/Safari "Paste" menu, Chromium's `clipboard-read`). For writes it lists only the activation and permission requirements. Neither of wechart's copy actions reads the clipboard.

**What gives activation.** A trusted `keydown` (not Escape or reserved shortcuts), `mousedown`, `pointerdown` (mouse), `pointerup` (non-mouse) or `touchend`. **`click` itself is not one of them**, but the preceding `mousedown`/`pointerdown`, or `keydown` for keyboard activation, grants it ([HTML][html-act], [MDN user activation][mdn-act]). The activation lasts a user-agent-defined time, "expected be at most a few seconds" ([HTML][html-act]).

**Safari.** "A call to `clipboard.write` or `clipboard.writeText` outside the scope of a user gesture (such as "click" or "touch" event handlers) will result in the immediate rejection of the promise" ([WebKit blog][webkit-clip]). web.dev: "Safari (WebKit) treats user activation differently than Chromium (Blink)"; do the async work inside the promise given to `ClipboardItem` ([web.dev][webdev]).

**Support detection** (typed against TS 6.0.3 `lib.dom`):

```ts
const secure = window.isSecureContext;
const canCopyText = secure && 'clipboard' in navigator && typeof navigator.clipboard.writeText === 'function';
const canCopyImage =
  secure &&
  typeof ClipboardItem === 'function' &&
  'clipboard' in navigator &&
  typeof navigator.clipboard.write === 'function' &&
  // supports() is missing before Safari 18.4 (BCD); where present it is always true for image/png (MDN).
  (!('supports' in ClipboardItem) || ClipboardItem.supports('image/png'));
```

- `lib.dom` types `navigator.clipboard` as always present (`readonly clipboard: Clipboard`, `typescript/lib/lib.dom.d.ts:25787`) and `ClipboardItem.supports` as always present (`:10778`). At runtime both can be missing, so test with `in`, not `?.`.
- `supports()` "will always return `true`" for `text/plain`, `text/html` and `image/png` ([MDN supports()][mdn-supports]).

**When it is refused.** `write` and `writeText` reject with a `NotAllowedError` `DOMException` ([MDN write()][mdn-write], [spec source][clip-bs]). Catch it and tell the user. On the Image item, point to Export › PNG, which needs neither a secure context nor a clipboard. Leave the item enabled but failing only where detection passed. Where detection fails, disable it and say why ("needs HTTPS"), as the Image criterion already does for DOM tiles.

## API surface we will use

### ECharts 6.1.0 under the SVG renderer

wechart registers only `SVGRenderer` (`packages/charts/src/echarts.ts:36-51`). `ChartCanvas` calls `echarts.init(element, null, {})`, and zrender falls back to the first registered painter, so the instance is SVG ([echarts-text-and-grid.md](/Users/srajagopal/Work/wechart/docs/research/echarts-text-and-grid.md) Init, `packages/web/src/tiles/ChartCanvas.tsx:69`).

**Getting a tile's instance:** `echarts.getInstanceByDom(dom: HTMLElement): EChartsType | undefined` (`EC/types/dist/shared.d.ts:9270`), called on the tile's `[data-testid="chart-canvas"]` element (`ChartCanvas.tsx:200-204`). `undefined` means a DOM-drawn tile.

**`renderToSVGString(opts?: { useViewBox?: boolean }): string`**

- Documented as "Available since v5.3.0"; "Available when setting `renderer: 'svg'`" ([echarts-doc][ec-doc]). Types at `EC/types/dist/shared.d.ts:9106-9108`.
- Source ([echarts.ts][ec-src], `EC/lib/core/echarts.js:604-615`): throws in development builds only if the painter is not SVG, then returns `painter.renderToString({ useViewBox })`.
- `SVGPainter.renderToString` ([Painter.ts][zr-painter], `ZR/lib/svg/Painter.js:89-98`) renders **the current display list** with these defaults:
  - `cssAnimation: true` and `cssEmphasis: true`, which emit a `<style>` with `@keyframes` and `:hover` classes (`Painter.js:80-86`, `ZR/lib/svg/cssEmphasis.js:3-60`);
  - `compress: true`;
  - `useViewBox: true`.
- **Root element:** `<svg width="W" height="H" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" baseProfile="full" viewBox="0 0 W H">`, where W and H are the painter's CSS-pixel size ([core.ts][zr-core], `ZR/lib/svg/core.js:97-107`). Explicit `width` and `height` matter for rasterising (Gotchas).
- **Per-item `itemStyle`, which is how marking is drawn** (`packages/charts/src/marking/render.ts:25-26,51-72`), is written as attributes ([mapStyleToAttrs.ts][zr-map], `ZR/lib/svg/mapStyleToAttrs.js:18-81`):
  - The fade becomes `fill-opacity` = fill alpha × `opacity`, written when below 1, so an unmarked item gets `fill-opacity="0.28"` (lines 24-33).
  - The outline becomes `stroke` and `stroke-width` (written when not 1, so `stroke-width="1.5"`), plus `stroke-opacity` when below 1 (lines 37-56).
  - Dashes become `stroke-dasharray` (lines 57-66).
- **The partial-marking `decal`** (`packages/charts/src/marking/partial.ts:79-91`) is built for SVG as an inline vnode tree (`EC/lib/util/decal.js:66,122-143`) and emitted as a `<pattern>` in `<defs>` holding a clone of that tree, referenced by `url(#id)` (`ZR/lib/svg/graphic.js:424-428,456-466`). It has no external image.
- **Text:** every `<text>` carries an inline `style` with `font-size`, `font-family` and non-normal `font-style`/`font-weight`, or the `font:` shorthand ([graphic.ts][zr-graphic], `ZR/lib/svg/graphic.js:204-233`). Only family **names** travel, no font data. Text content is HTML-encoded (`&amp; &lt; &gt; &quot; &#39;`, `ZR/lib/core/dom.js:99-111`). **Attribute values are not escaped** (`ZR/lib/svg/core.js:21-36`; see [echarts-text-and-grid.md](/Users/srajagopal/Work/wechart/docs/research/echarts-text-and-grid.md) Gotchas).
- **Background:** ECharts calls `zr.setBackgroundColor(ecModel.get('backgroundColor') || 'transparent')` (`EC/lib/core/echarts.js:1329-1330`). The default option leaves `backgroundColor` unset (`EC/lib/model/globalDefault.js:56`, commented out). wechart sets none at the root: `themed()` sets only `tooltip.backgroundColor` (`packages/charts/src/themed.ts:148-166`). The painter writes the background as `<rect width height x="0" y="0" fill="none">`, because `normalizeColor('transparent')` returns `'none'` (`ZR/lib/svg/Painter.js:223-251`, `ZR/lib/svg/helper.js:4-8`). **So the SVG, and a PNG made from it, is transparent. Light- or dark-theme text colours then sit on whatever the image is pasted onto.**
- **Not included:** the tooltip, which is an HTML `div`. The render mode resolves to `'html'` whenever `document` exists (`EC/lib/util/model.js:668-675`, `EC/lib/component/tooltip/TooltipView.js:87-88`). Also not included is anything wechart draws in DOM around the chart: the tile header, badges and the drag rubber band.
- **No `<foreignObject>`:** zrender's SVG output has none. The only external-looking reference is `<image href>` for image elements and patterns (`ZR/lib/svg/graphic.js:180,417`), which wechart's charts don't use.

**`getDataURL(opts?: { type?: 'png'|'jpeg'|'svg'; pixelRatio?; backgroundColor?; excludeComponents? }): string`**

- Documented: "NOTE: png, jpg is only available for canvas renderer. svg is only available for svg renderer." It also says it "returns a base64 URL" ([echarts-doc][ec-doc]).
- Source ([echarts.ts][ec-src], `EC/lib/core/echarts.js:628-654`):
  - It hides `excludeComponents` views.
  - Then `url = painter.getType() === 'svg' ? this.getSvgDataURL() : this.renderToCanvas(opts).toDataURL('image/' + (opts.type || 'png'))` (line 649).
  - **Under SVG, `type`, `pixelRatio` and `backgroundColor` are ignored.**
- `getSvgDataURL` fast-forwards every element's animation (`stopAnimation(null, true)`) and returns `painter.toDataURL()` (`echarts.js:619-627`).
- That is `'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(renderToString())`, **percent-encoded, not base64** unless the painter is called with `base64` (`ZR/lib/svg/Painter.js:205-213`).
- `renderToCanvas` exists but throws for non-canvas painters in development builds (`echarts.js:591-603`).

### Rasterising the SVG to PNG

**`<img>` from a data URL, drawn to `<canvas>`, read with `toBlob`:**

- **An SVG used as an image** has JavaScript disabled, and "External resources (e.g., images, stylesheets) cannot be loaded, though they can be used if inlined through `data:` URLs" ([MDN SVG as an image][mdn-svgimg]).
- SVG Integration puts `<img>` SVG in secure static or animated mode, with external references disabled. External references are URLs that differ from the document's "ignoring the fragment", so `url(#id)` references to patterns, clip paths and gradients still work ([SVG Integration][svg-int]).
- **Tainting:**
  - All browsers taint the canvas for an SVG that contains `foreignObject` and is loaded over HTTP.
  - "When the same SVG is referenced through a data URI all browsers agree not to taint the canvas."
  - Through a blob URI, WebKit taints (and Chromium did before M131), while Gecko does not ([blink-dev intent][blink-fo]).
  - ECharts emits no `foreignObject`, so neither route should taint. A `data:` URL is the choice every engine agrees on.
- A tainted canvas makes `toBlob` throw `SecurityError`. `toBlob`'s callback may receive `null` "if the image cannot be created for any reason", and `image/png` is the one required type ([MDN toBlob][mdn-toblob]).
- **`createImageBitmap` is not the route.** For a Blob source the HTML spec rejects when the data "is not in a supported image file format … or … a vector graphic with no natural size" ([HTML ImageBitmap][html-ib]), so an SVG Blob depends on the engine (UNVERIFIED below). An `<img>` holding the SVG is a valid source, but gains nothing over `drawImage(img)`.

**Recommended recipe** (untested; each step is sourced above or in Gotchas):

```ts
import { echarts } from '@wechart/charts';

type Chart = NonNullable<ReturnType<typeof echarts.getInstanceByDom>>;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** The chart as drawn, as a standalone SVG. pixelRatio 1 for the .svg file, devicePixelRatio for PNG. */
export function chartSvg(
  chart: Chart,
  { pixelRatio = 1, surface }: { pixelRatio?: number; surface?: string } = {},
): { svg: string; width: number; height: number } {
  const cssWidth = chart.getWidth();
  const cssHeight = chart.getHeight();
  const doc = new DOMParser().parseFromString(chart.renderToSVGString(), 'image/svg+xml');
  if (doc.querySelector('parsererror') !== null) throw new Error('The chart SVG did not parse');
  const root = doc.documentElement;
  const width = Math.round(cssWidth * pixelRatio);
  const height = Math.round(cssHeight * pixelRatio);
  // Natural size = output bitmap size; viewBox keeps drawing coordinates in CSS px.
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `0 0 ${cssWidth} ${cssHeight}`);
  // Page CSS does not reach an image: carry the tile's tabular figures (styles.ts:2883-2884).
  const style = doc.createElementNS(SVG_NS, 'style');
  style.textContent = 'text{font-variant-numeric:tabular-nums}';
  root.insertBefore(style, root.firstChild);
  if (surface !== undefined) {
    // Only if the spec decides the image carries the tile surface (open question).
    const bg = doc.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('width', String(cssWidth));
    bg.setAttribute('height', String(cssHeight));
    bg.setAttribute('fill', surface);
    root.insertBefore(bg, style.nextSibling);
  }
  return { svg: new XMLSerializer().serializeToString(doc), width, height };
}

/** Draws the SVG 1:1 onto a canvas of its own natural size and encodes it as PNG. */
export function svgToPng({ svg, width, height }: { svg: string; width: number; height: number }): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return reject(new Error('No 2D canvas'));
      context.drawImage(img, 0, 0, width, height);
      canvas.toBlob((png) => (png === null ? reject(new Error('No PNG')) : resolve(png)), 'image/png');
    };
    img.onerror = () => reject(new Error('The chart SVG did not load as an image'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** Copy › Image. Synchronous up to write(): nothing awaited before it (Safari). */
export function copyChartImage(chart: Chart, surface?: string): Promise<void> {
  const png = svgToPng(chartSvg(chart, { pixelRatio: window.devicePixelRatio, surface }));
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
```

- `DOMParser.parseFromString(…, 'image/svg+xml')` signals failure with a `<parsererror>` node ([MDN DOMParser][mdn-domparser]). `XMLSerializer` keeps namespace URIs ([MDN XMLSerializer][mdn-xmls]).
- The `ClipboardItem` value may be a `Blob`, a string, or a `Promise` resolving to either ([MDN ClipboardItem()][mdn-ci-ctor]). TS 6.0.3 types it as `string | Blob | PromiseLike<string | Blob>` (`lib.dom.d.ts:10772`).
- The Blob's own `type` must be a mandatory or optional type, or `write` rejects ([spec source][clip-bs]). `toBlob(…, 'image/png')` produces `image/png` ([MDN toBlob][mdn-toblob]).

### Clipboard calls

- `navigator.clipboard.writeText(data: string): Promise<void>` and `navigator.clipboard.write(data: ClipboardItem[]): Promise<void>`. The promise resolves once written. If the OS can't hold several items, only the first is written ([MDN write()][mdn-write], [spec IDL][clip-spec]).
- `new ClipboardItem(record, { presentationStyle? })`: "You can only pass in one clipboard item at a time" ([MDN ClipboardItem()][mdn-ci-ctor]).
- **Types per engine:**
  - Spec-mandatory: `text/plain`, `text/html`, `image/png` ([MDN supports()][mdn-supports]).
  - WebKit writes `text/plain`, `text/html`, `text/uri-list` and `image/png`, and **decodes then re-encodes PNGs** before they reach the pasteboard ([WebKit blog][webkit-clip]).
  - Firefox's `ClipboardItem` has supported `text/plain`, `text/html` and `image/png` since its Firefox 87 implementation behind `dom.events.asyncClipboard.clipboardItem` ([bug 1619947][bmo-1619947]). It has been enabled by default since **Firefox 127**: "The `ClipboardItem` interface, along with the `read()` and `write()` methods … have been enabled" ([Firefox 127 notes][fx127]).

### Downloading

The existing pattern is `saveFile(name, text, type)`: a Blob, an object URL on a detached `<a download>`, `link.click()`, and a revoke 60 s later (`packages/web/src/dashboard/TileViewMenu.tsx:20-30`). The file name comes from `csvFileName`, which replaces `/\?%*:|"<>` (`TileViewMenu.tsx:8-11`).

- The `download` attribute "only works for same-origin URLs, or the `blob:` and `data:` schemes". `/` and `\` in the name become `_`, and browsers adjust other characters the file system forbids ([MDN `<a>`][mdn-a]).
- The File API says: "Attempts to dereference url after it has been revoked will result in a network error. Requests that were started before the url was revoked should still succeed." Unloading the document revokes its URLs ([File API][fileapi]). Nothing sourced says when a download started by `click()` begins, so keep the delayed revoke.
- String parts of a Blob are encoded as UTF-8, and `endings: 'transparent'` (the default) leaves `\n` alone ([MDN Blob()][mdn-blob]).
- The HTML download steps let the browser refuse: "Optionally, the user agent may return, if it believes doing so would safeguard the user from a potentially hostile download." Downloads not started from browser UI go through the navigate event ([HTML links][html-links]).
- **What to change.** Widen `saveFile`'s `text: string` to `string | Blob` (and the `save` prop type at `TileViewMenu.tsx:68-69`), and generalise `csvFileName` to take the extension. The calls then become:
  - SVG: `saveFile(name + '.svg', chartSvg(chart, { surface }).svg, 'image/svg+xml')`.
  - PNG: `void svgToPng(chartSvg(chart, { pixelRatio: devicePixelRatio, surface })).then((png) => saveFile(name + '.png', png, 'image/png'))`, with its failure reported to the user.

### Testing with Playwright 1.63.0

- **`browserContext.grantPermissions(permissions, { origin? })`.** Its docs warn: "Supported permissions differ between browsers, and even between different versions of the same browser" (`PW/types/types.d.ts:10277-10311`, [class-browsercontext][pw-bc]). What it does per engine in 1.63.0:
  - **Chromium** (the `chrome` and `edge` projects; their `browserName` is `'chromium'`, `playwright/types/test.d.ts:6875`) maps `clipboard-read` to CDP `clipboardReadWrite` and `clipboard-write` to `clipboardSanitizedWrite` (`PW/lib/coreBundle.js:38653-38674`, [crBrowser.ts][pw-cr]).
  - **Firefox** has no clipboard permission, so both names **throw `Unknown permission`** (`coreBundle.js:45768-45783`, [ffBrowser.ts][pw-ff]).
  - **WebKit** accepts `clipboard-read` only, so `clipboard-write` throws (`coreBundle.js:47792-47807`, [wkPage.ts][pw-wk]).
  - So permissions must be set per project, never in the shared `use` block. Otherwise every WebKit and Firefox test fails at context creation ([playwright#13037][pw-13037]).
- **Reading the clipboard back.** Playwright's own test at v1.63.0 grants `clipboard-read` (plus `clipboard-write` on Chromium only), writes with `page.evaluate(() => navigator.clipboard.writeText(…))`, and asserts `readText()` returns it ([permissions.spec.ts][pw-perm-spec]).
  - It is marked `it.fail(browserName === 'firefox', 'No such permissions (requires flag) in Firefox')`.
  - It notes that branded Chromium "shows a dialog and does not resolve the promise" when reading without permission, so **always grant `clipboard-read` in the `chrome` and `edge` projects**.
  - A second test, "should isolate the headless clipboard from the operating system", runs in all three engines with no Firefox skip. It uses no permissions on Firefox and reads back through `page.evaluate` ([permissions.spec.ts][pw-perm-spec]).
- **`page.evaluate` counts as a user gesture in Chromium and WebKit.** Chromium passes `userGesture: true` (`coreBundle.js:35596-35607`) and WebKit `emulateUserGesture: true` (`coreBundle.js:46167-46179`). Firefox's `Runtime.callFunction` call carries no such flag in playwright-core (`coreBundle.js:44575-44585`).
- **Text read-back:** after clicking Copy › Marked values, `expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expectedTsv)`.
- **Image read-back** (Chromium, plus WebKit and Firefox where it works; UNVERIFIED): decode in the page and compare **pixels, not bytes**, because PNGs may be re-encoded ([WebKit blog][webkit-clip]; the spec allows "an optionally sanitized copy", [spec source][clip-bs]):

  ```ts
  const probe = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bitmap = await createImageBitmap(await item!.getType('image/png'));
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height /* , sampled pixels via ctx.getImageData(x, y, 1, 1) */ };
  });
  ```

  `createImageBitmap` on a PNG Blob is the supported bitmap case ([HTML ImageBitmap][html-ib]).
- **Downloads:** follow the existing `e2e/export.spec.ts:98-104`, which runs in every project (`playwright.config.ts:57-62`): `Promise.all([page.waitForEvent('download'), button.click()])`, `download.suggestedFilename()`, `readFile(await download.path())`. `path()` "will wait for the download to finish if necessary" (`PW/types/types.d.ts:21216-21224`, [class-download][pw-dl]).
  - **SVG file:** assert `<svg`, and the marking's `stroke="<marking colour>"`, `stroke-width="1.5"` and the fade's `fill-opacity="0.28"`, the attribute forms from `mapStyleToAttrs` above.
  - **PNG file:** the signature is bytes `137 80 78 71 13 10 26 10`, and IHDR comes first with width then height as 4-byte big-endian integers. So width = `readUInt32BE(16)` and height = `readUInt32BE(20)` ([PNG spec][png]).
  - **Expected size:** `Desktop Safari` runs at `deviceScaleFactor: 2`; Chrome, Edge and Firefox run at 1 (`PW/lib/coreBundle.js:29688-29745`). Compute the expected size from `devicePixelRatio` times the chart's CSS size.
  - `expect(buffer).toMatchSnapshot(name, { maxDiffPixels | maxDiffPixelRatio | threshold })` compares PNG buffers by pixels ([SnapshotAssertions][pw-snap]).

## Gotchas

- **Safari: construct the `ClipboardItem` and call `write` synchronously in the gesture, with a `Promise<Blob>` value.** Any `await` before `write` risks an immediate `NotAllowedError` in Safari ([WebKit blog][webkit-clip], [web.dev][webdev]). MDN's own canvas example awaits `toBlob` before `write` ([MDN write()][mdn-write]), which is exactly the pattern to avoid.
- **`getDataURL({ type: 'png' })` returns SVG under the SVG renderer**, and percent-encoded rather than the documented base64 (`EC/lib/core/echarts.js:649`, `ZR/lib/svg/Painter.js:205-213`, [echarts-doc][ec-doc]).
- **Transparent background.** The exported image has no background (`EC/lib/core/echarts.js:1329-1330`, `ZR/lib/svg/Painter.js:223-251`). In the dark theme, light text pasted onto a white document will be very hard to read. Whether to paint the tile surface is a spec decision (open question).
- **Page CSS does not travel.** The tile's `.chart-canvas svg text { font-variant-numeric: tabular-nums !important; }` (`packages/web/src/shell/styles.ts:2883-2884`) is a page stylesheet. An image can't load stylesheets ([MDN SVG as an image][mdn-svgimg]) and is its own SVG document, so without the injected `<style>` the image uses proportional figures. This follows from those two sources; confirm it in a test.
- **Fonts.** The chart family is `Inter, system-ui, sans-serif` (`packages/charts/src/themed.ts:28`). Inter is "named, as Inter is, not shipped" (`packages/web/src/shell/styles.ts:18-19`); the only web font the app ships is IBM Plex Mono, for code (`packages/web/src/shell/fonts.ts`). So no chart font needs embedding.
  - If a chart web font is ever shipped, it must be inlined as a `data:` `@font-face`, because external resources don't load in SVG images ([MDN][mdn-svgimg]).
  - A book companion page (not a primary source) warns "WebKit doesn't support data URIs in SVG-as-image: they are treated the same as external files" ([Using SVG extras][usingsvg]). Test before relying on it.
- **Give the SVG a natural size equal to the output size.**
  - Firefox drew nothing for an SVG without `width`/`height` until Firefox 120, which falls back to 300×150 ([bug 700533][bmo-700533]).
  - WebKit bug 206914, "drawImage() should use the destRect values to draw the SVG image", is still NEW; WebKit lays the SVG out at the `<img>`'s natural size ([WebKit 206914][wk-206914]).
  - The recipe sets `width`/`height` to device pixels and draws 1:1.
- **Use `onload`, not `decode()`, for the SVG image.** WebKit's `decode()` never resolved for SVG until it was fixed in 2019 ([WebKit 198527][wk-198527]). `onload` avoids depending on that fix.
- **Canvas size limits.** Most browsers allow more than 10,000×10,000; exceeding the limit "renders the canvas unusable" ([MDN canvas][mdn-canvas]). A tile at devicePixelRatio 2 is far below it.
- **Fingerprinting noise.** With Safari's advanced fingerprinting protection on (Safari 17+, including Private Browsing), "Safari applies tiny amounts of noise to pixels on the canvas that have been painted using drawing commands" ([WebKit: Private Browsing 2.0][wk-pb2]). Compare exported PNGs with a pixel tolerance. Firefox's equivalent is UNVERIFIED below.
- **Hover and emphasis state.** `renderToSVGString` serialises the live display list, including any hover or axis-pointer state at that moment (`ZR/lib/svg/Painter.js:58-60`). The HTML tooltip is never included (`EC/lib/util/model.js:668-675`). Whether a highlight from the right-click that opened the menu survives into the image is UNVERIFIED.
- **SVG string escaping.** Attribute values aren't escaped (`ZR/lib/svg/core.js:21-36`), so keep font names unquoted (`themed.ts:130-133`). Parsing through `DOMParser` in the recipe catches a malformed string before it reaches the user.
- **Playwright permissions are per engine.** Granting `clipboard-read`/`clipboard-write` in a shared `use` block throws in Firefox (both) and WebKit (`clipboard-write`) (`PW/lib/coreBundle.js:45768-45783,47792-47807`).
- **Chromium masks activation bugs in tests.** Chromium maps even `clipboard-read` to `clipboardReadWrite` (`coreBundle.js:38665`), which by its name also grants writing. So a Chromium test can pass while the app awaits before `write`. The WebKit project is the one that exercises the gesture path, and whether Playwright's WebKit enforces Safari's gesture rule is UNVERIFIED.
- **TSV cannot carry tabs.** "fields that contain tabs are not allowable in this encoding", and each record is one line ([IANA TSV][iana-tsv]). A member value containing a tab or line break needs a rule (open question).
- **jsdom has no Clipboard API and no canvas.** `jsdom@30.1.0/lib` has no clipboard implementation, and `HTMLCanvasElement.toBlob` needs the `canvas` npm package (`node_modules/.pnpm/jsdom@30.1.0/node_modules/jsdom/lib/jsdom/living/nodes/HTMLCanvasElement-impl.js:67-95`). Keep copy and save injectable as `save` already is (`TileViewMenu.tsx:68-69`). Unit-test the TSV builder and `chartSvg`'s DOM edits in jsdom, and the rasterising, clipboard and download in Playwright.

## Alternatives considered

Not requested. The in-browser routes this doc rules out are recorded under API surface and Gotchas: `getDataURL` under SVG, `createImageBitmap` on an SVG Blob, and awaiting before `write`.

## Open questions / unverified

**Decisions for the spec (not mine to make):**

- Does the image carry the tile surface colour, or stay transparent? If it carries the surface, which theme: the page's current theme, or always light?
- Does the image include the tile's DOM title?
- Pixel ratio for PNGs: devicePixelRatio "as drawn", or a fixed ratio? PNG's `pHYs` chunk is optional ([PNG spec][png]), and whether `toBlob` writes one, and so how large a 2× PNG pastes into other applications, is UNVERIFIED.
- How to write a member value containing a tab or newline in the TSV. Also `\n` vs `\r\n` between records; how Chrome, Firefox and Safari normalise line endings on the OS clipboard is UNVERIFIED.
- Should Copy › Image and Export › PNG/SVG be disabled while a newer answer is on its way, as Download CSV is (`TileViewMenu.tsx:286-307`)?

**UNVERIFIED:**

- **System fonts inside an SVG image** (Inter or `system-ui` resolving the same as on the page): no primary source found; the MDN and SVG Integration pages don't mention fonts. Confirm with a visual comparison in Playwright.
- **`createImageBitmap(svgBlob)` per engine:** the Chromium issue on it ([40461578](https://issues.chromium.org/issues/40461578)) needs sign-in to read. Not needed by the recipe.
- **Chrome's "Document is not focused" `NotAllowedError`** on write when the page lacks focus is reported in [Chromium issue 40836365](https://issues.chromium.org/issues/40836365), which I couldn't read. Relevant if Copy is ever triggered with focus elsewhere.
- **Reading an image back** with `navigator.clipboard.read()` in Playwright's Firefox and WebKit builds: Playwright's own tests cover only `readText` ([permissions.spec.ts][pw-perm-spec]). If it fails, record what the app hands the browser with an init script that wraps `Clipboard.prototype.write`. The wrapper must call the original synchronously, so it doesn't break Safari's gesture rule. Keep the real read-back in Chromium.
- **Whether Playwright's Firefox evaluate runs with user activation.** No flag appears in playwright-core (`coreBundle.js:44575-44585`). Firefox's read-back is inferred from the unskipped isolation test.
- **Clipboard isolation between parallel workers.** Isolation is shown for `browserType.launch({ headless: true })` ([permissions.spec.ts][pw-perm-spec], annotated issue #13097). Whether the branded `chrome`/`msedge` channels in new headless mode are isolated too is not. Four local workers (`playwright.config.ts:49`) could otherwise overwrite one OS clipboard.
- **Safari and a download started after an `await`.** `link.click()` after the PNG resolves: the HTML spec leaves refusal to the browser ([HTML links][html-links]), and I found no Safari-specific source. The WebKit e2e project will show it.
- **Firefox canvas randomisation** (fingerprinting protection) defaults: Mozilla's support page didn't load; only secondary sources were found.
- **How long Safari and Chrome wait** for a `ClipboardItem` promise before giving up: no source found.
- **ECharts GitHub `src` line numbers.** Links go to the files at tag 6.1.0 by function name. The line numbers given are from the installed compiled `lib/` files, which I read directly.

[clip-spec]: https://w3c.github.io/clipboard-apis/
[clip-bs]: https://github.com/w3c/clipboard-apis/blob/main/index.bs
[sc-spec]: https://w3c.github.io/webappsec-secure-contexts/
[mdn-sc]: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts
[blink-localhost]: https://groups.google.com/a/chromium.org/g/blink-dev/c/RC9dSw-O3fE/m/E3_0XaT0BAAJ
[fx84]: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/84
[wk-origin]: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/page/SecurityOrigin.cpp
[wk-281149]: https://bugs.webkit.org/show_bug.cgi?id=281149
[cr-insecure]: https://www.chromium.org/Home/chromium-security/deprecating-powerful-features-on-insecure-origins/
[mdn-clip-api]: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API
[mdn-write]: https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write
[mdn-ci-ctor]: https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/ClipboardItem
[mdn-supports]: https://developer.mozilla.org/en-US/docs/Web/API/ClipboardItem/supports_static
[bcd-clip]: https://github.com/mdn/browser-compat-data/blob/main/api/Clipboard.json
[bcd-ci]: https://github.com/mdn/browser-compat-data/blob/main/api/ClipboardItem.json
[fx127]: https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/127
[bmo-1619947]: https://bugzilla.mozilla.org/show_bug.cgi?id=1619947
[webkit-clip]: https://webkit.org/blog/10855/async-clipboard-api/
[webdev]: https://web.dev/articles/async-clipboard
[html-act]: https://html.spec.whatwg.org/multipage/interaction.html#transient-activation-duration
[mdn-act]: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation
[ec-src]: https://github.com/apache/echarts/blob/6.1.0/src/core/echarts.ts
[ec-doc]: https://github.com/apache/echarts-doc/blob/master/en/api/echarts-instance.md
[zr-painter]: https://github.com/ecomfe/zrender/blob/6.1.0/src/svg/Painter.ts
[zr-core]: https://github.com/ecomfe/zrender/blob/6.1.0/src/svg/core.ts
[zr-map]: https://github.com/ecomfe/zrender/blob/6.1.0/src/svg/mapStyleToAttrs.ts
[zr-graphic]: https://github.com/ecomfe/zrender/blob/6.1.0/src/svg/graphic.ts
[mdn-svgimg]: https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image
[svg-int]: https://www.w3.org/TR/svg-integration/
[blink-fo]: https://groups.google.com/a/chromium.org/g/blink-dev/c/JpA2vmA9XT8
[mdn-toblob]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
[html-ib]: https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html
[mdn-domparser]: https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString
[mdn-xmls]: https://developer.mozilla.org/en-US/docs/Web/API/XMLSerializer/serializeToString
[mdn-canvas]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas
[bmo-700533]: https://bugzilla.mozilla.org/show_bug.cgi?id=700533
[wk-206914]: https://bugs.webkit.org/show_bug.cgi?id=206914
[wk-198527]: https://bugs.webkit.org/show_bug.cgi?id=198527
[wk-pb2]: https://webkit.org/blog/15697/private-browsing-2-0/
[usingsvg]: https://oreillymedia.github.io/Using_SVG/extras/ch07-dataURI-fonts.html
[mdn-a]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a
[fileapi]: https://w3c.github.io/FileAPI/
[mdn-blob]: https://developer.mozilla.org/en-US/docs/Web/API/Blob/Blob
[html-links]: https://html.spec.whatwg.org/multipage/links.html#downloading-hyperlinks
[iana-tsv]: https://www.iana.org/assignments/media-types/text/tab-separated-values
[png]: https://www.w3.org/TR/png-3/
[pw-bc]: https://github.com/microsoft/playwright/blob/v1.63.0/docs/src/api/class-browsercontext.md
[pw-dl]: https://github.com/microsoft/playwright/blob/v1.63.0/docs/src/api/class-download.md
[pw-snap]: https://github.com/microsoft/playwright/blob/v1.63.0/docs/src/api/class-snapshotassertions.md
[pw-perm-spec]: https://github.com/microsoft/playwright/blob/v1.63.0/tests/library/permissions.spec.ts
[pw-cr]: https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/chromium/crBrowser.ts
[pw-ff]: https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/firefox/ffBrowser.ts
[pw-wk]: https://github.com/microsoft/playwright/blob/v1.63.0/packages/playwright-core/src/server/webkit/wkPage.ts
[pw-13037]: https://github.com/microsoft/playwright/issues/13037
