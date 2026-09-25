---
library: IBM Plex Mono (IBM's own npm distribution)
packages: [@ibm/plex-mono]
version: 2.5.0
researched: 2026-09-24
sources: [https://registry.npmjs.org/@ibm/plex-mono/latest, https://registry.npmjs.org/@ibm/plex-mono, https://registry.npmjs.org/@ibm/plex-mono/2.5.0, https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/package.json, https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/README.md, https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/LICENSE.txt, https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/fonts/complete/woff2/license.txt, https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/css/ibm-plex-mono-default.css, https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/scss/index.scss, https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/scss/regular/_index.scss, https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/telemetry.yml, https://data.jsdelivr.com/v1/packages/npm/@ibm/plex-mono@2.5.0?structure=flat, https://github.com/IBM/plex/releases/tag/%40ibm%2Fplex-mono%402.5.0, https://github.com/IBM/plex/tree/master/packages/plex-mono, https://github.com/carbon-design-system/carbon/blob/main/docs/guides/ibm-plex.md, https://github.com/ibm-telemetry/telemetry-js, https://openfontlicense.org/open-font-license-official-text/, https://openfontlicense.org/ofl-faq/, https://openfontlicense.org/webfonts-and-reserved-font-names/, https://pnpm.io/settings/build, https://vite.dev/guide/assets, https://vite.dev/config/build-options, https://cdn.jsdelivr.net/npm/vite@8.3.0/client.d.ts, https://www.w3.org/TR/css-fonts-3/, https://www.w3.org/TR/css-font-loading-3/, https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check, https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/CSS.pdl, https://playwright.dev/docs/api/class-browsercontext]
---

# IBM Plex Mono (`@ibm/plex-mono`) 2.5.0

## Summary

`@ibm/plex-mono` is IBM's own npm package of the IBM Plex Mono typeface. Its description is "The package of IBM's typeface, IBM Plex Mono"; the repository is `github.com/ibm/plex` and the license is `OFL-1.1` ([registry](https://registry.npmjs.org/@ibm/plex-mono/latest)). Version 2.5.0 was published by `leo-costa-ibm` <leocosta@ibm.com> ([registry 2.5.0](https://registry.npmjs.org/@ibm/plex-mono/2.5.0)).

- **Version.** The `latest` dist-tag is **2.5.0**, published 2026-06-11T19:08:56Z. All versions: 0.0.2-alpha.0, 0.0.3-alpha.0, 1.0.0, 1.1.0 and 2.5.0. None is deprecated ([registry](https://registry.npmjs.org/@ibm/plex-mono)).
- **Font version.** The release notes give it as "IBM PLEX MONO V2.5 – 2026-04-21". This release adds glyphs, stylistic alternates and ASCII control pictures (U+2400–2421) ([release](https://github.com/IBM/plex/releases/tag/%40ibm%2Fplex-mono%402.5.0)).

Why wechart needs it:
- AC-223 (`docs/spec.md:704-705`) fails when "code is set in a face other than IBM Plex Mono".
- `docs/design/direction.md:120` sets the code face to "**IBM Plex Mono**, falling back to `ui-monospace, Menlo`".
- `packages/web/src/shell/styles.ts:17-19` names the face in `--wc-font-code` but ships no font file.
- The user chose IBM's package over `@fontsource/ibm-plex-mono` (see `docs/research/fontsource-ibm-plex-mono.md`). The aim is to ship IBM's **unmodified** files, because of the Reserved Font Name "Plex" (see Licensing).

**Recommendation.**
- Ship IBM's files byte-for-byte:
  - `fonts/complete/woff2/IBMPlexMono-Regular.woff2` (400)
  - `fonts/complete/woff2/IBMPlexMono-SemiBold.woff2` (600)
  - optionally `fonts/complete/woff2/IBMPlexMono-Italic.woff2` (400 italic)
- Reference them through Vite `?url` imports, from our own `@font-face` rules in `SHELL_CSS`.
- Ship IBM's license text alongside them.
- Don't import IBM's CSS. The reasons are under "Alternative init" and in Gotchas.

## Install

1. **Declare the build-script decision first.** pnpm 12 would otherwise fail the install.
   - The package has `"postinstall": "ibmtelemetry --config=telemetry.yml"` and a dependency on `@ibm/telemetry-js ^1.6.1` ([package.json](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/package.json)).
   - The repo pins `pnpm@12.5.1` (`package.json:6`).
   - pnpm 12.x docs: `strictDepBuilds` "Default: **true** … the installation will exit with a non-zero exit code if any dependencies have unreviewed build scripts (aka postinstall scripts)" ([pnpm build settings](https://pnpm.io/settings/build)).
   - `allowBuilds` (added in v10.26.0) is "A map of package matchers to explicitly allow (`true`) or disallow (`false`) script execution" ([pnpm build settings](https://pnpm.io/settings/build)). It "replaces `onlyBuiltDependencies` and `ignoredBuiltDependencies`" ([pnpm 10.26 release](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/10.26.md)).
   - `pnpm-workspace.yaml` has no `allowBuilds` today. Add:
   ```yaml
   allowBuilds:
     '@ibm/plex-mono': false
   ```
2. Add the package, pinned exactly:
   ```sh
   pnpm --filter @wechart/web add -E @ibm/plex-mono@2.5.0
   ```

Package facts:
- **Installable without scripts.** The fonts, CSS and SCSS come prebuilt in the tarball. `files` lists `css`, `scss`, `fonts/complete/woff/*`, `fonts/complete/woff2/*`, `fonts/split/woff2/*` and `telemetry.yml`. The `build` script (`cd ../ && yarn build`) is a repo script, not a lifecycle script ([package.json](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/package.json)).
- **Missing manifest fields.** There are no peer dependencies, `engines`, `exports`, `main`, `types` or `sideEffects` ([registry 2.5.0](https://registry.npmjs.org/@ibm/plex-mono/2.5.0)).
- **Size.** Unpacked, it is 3,296,995 bytes in 158 files ([registry](https://registry.npmjs.org/@ibm/plex-mono/latest)).
- **Transitive dependency `@ibm/telemetry-js`.** `latest` is 1.11.0, Apache-2.0, with no runtime dependencies. It is 4,474,193 bytes unpacked and has the bin `ibmtelemetry` ([registry](https://registry.npmjs.org/@ibm/telemetry-js/latest)). It is installed, but nothing in wechart imports it, so it never reaches the bundle.
- **Opting out in CI (optional).** Set `IBM_TELEMETRY_DISABLED='true'` in the CI environment ([telemetry-js](https://github.com/ibm-telemetry/telemetry-js)).

## Init / auth pattern

No auth. Init means registering the faces.

Put this in a new module, for example `packages/web/src/shell/fonts.ts`, and interpolate it into `SHELL_CSS`. `installStyles` (`styles.ts:3305-3312`) then injects it in its `<style>` element:

```ts
import plexMono400 from '@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Regular.woff2?url';
import plexMono600 from '@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-SemiBold.woff2?url';
// Only if the italic face is adopted (Open questions):
// import plexMono400i from '@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Italic.woff2?url';

export const PLEX_MONO_FACES = `
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 400;
  src: url('${plexMono400}') format('woff2');
}
@font-face {
  font-family: 'IBM Plex Mono';
  font-style: normal;
  font-weight: 600;
  src: url('${plexMono600}') format('woff2');
}`;
```

(`font-display` is deliberately left out. Its value is a design decision; see Open questions.)

How this works in Vite and TypeScript:
- **`?url` returns the resolved URL.** "Importing a static asset will return the resolved public URL". A file under `src/` becomes something like `/assets/img.2d8efhg.png` in the build, and the file gets a hashed name ([Vite assets](https://vite.dev/guide/assets)).
- **Emitted file name.** The default app `assetFileNames` is `path.posix.join(options.assetsDir, '[name]-[hash].[ext]')` ([vite build.ts v8.3.0](https://raw.githubusercontent.com/vitejs/vite/v8.3.0/packages/vite/src/node/build.ts)). The files land as `assets/IBMPlexMono-Regular-<hash>.woff2`.
- **`base` is honoured.** "JS-imported asset URLs … are all automatically adjusted to respect this option" ([Vite build](https://vite.dev/guide/build)).
- **No inlining.** `build.assetsInlineLimit` defaults to 4096 bytes ([build options](https://vite.dev/config/build-options)). Each file is about 50 KB, so none is inlined. `?url&no-inline` is also declared if you want that guaranteed ([client.d.ts](https://cdn.jsdelivr.net/npm/vite@8.3.0/client.d.ts)).
- **The JS-string `url()` concern is resolved.** Vite resolves the URL at import time, so nothing has to rewrite a `url()` inside a JS string. This settles the sibling doc's UNVERIFIED note about `url()` in `styles.ts`.
- **Deep imports are allowed.** Node encapsulates subpaths only "When the `"exports"` field is defined" ([Node packages](https://nodejs.org/api/packages.html)), and this package defines none.
- **Types.** `vite/client` declares `declare module '*?url' { const src: string; export default src }`, and also `'*.woff2'` ([client.d.ts](https://cdn.jsdelivr.net/npm/vite@8.3.0/client.d.ts)). `packages/web/tsconfig.json` already has `"types": ["vite/client"]`.
- **Unit tests.** With jsdom, "Vitest follows the same rules that Vite does when importing CSS and assets" ([Vitest environment](https://vitest.dev/guide/environment)).
- **The rules become `FontFace` objects.** "A CSS @font-face rule automatically defines a corresponding FontFace object, which is automatically placed in the document's font source when the rule is parsed" ([CSS Font Loading 3 §2.3](https://www.w3.org/TR/css-font-loading-3/)).
- **Family name.** IBM's CSS and README use `font-family: 'IBM Plex Mono'` for every weight and style ([README](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/README.md), [default.css](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/css/ibm-plex-mono-default.css)). That matches `--wc-font-code: 'IBM Plex Mono', …` exactly.
- **Why no `local()`.**
  - With `local()`, "the user agent iterates over the set of references listed using the first one it can successfully activate", so an installed copy wins over the shipped file. That copy may be a different version.
  - "user agents may ignore user-installed fonts when using `local()`" ([MDN src](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/src)), so behaviour would vary by engine.
  - CDP's `isCustomFont` "Indicates if the font was downloaded or resolved locally" ([CSS.pdl](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/CSS.pdl)). With `local()` in the rule, that check can't tell the shipped file from an installed one.
  - Writing our own CSS modifies nothing of IBM's; we just don't ship IBM's CSS. OFL FAQ 1.20 says you need to include "only the fonts you use and the copyright and license that apply to them" ([OFL FAQ](https://openfontlicense.org/ofl-faq/)).

**Alternative init (not recommended): `import '@ibm/plex-mono/css/ibm-plex-mono-default.css'`.**
- **What it registers.** 300, 400 and 600 normal. Each weight gets a *complete* face (woff2 + woff) and 5 *split* woff2 faces with `unicode-range`. Every face lists `local()` first. No face sets `font-display` ([default.css](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/css/ibm-plex-mono-default.css), [scss/index.scss `default` mixin](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/scss/index.scss)).
- **Paths.** The `url()`s are relative (`../fonts/complete/woff2/…`). Vite handles "`url()` references in CSS … the same way" as imports ([Vite assets](https://vite.dev/guide/assets)).
- **What the build carries.** Vite would emit 21 files, 557,532 bytes, including woff fallbacks and Light (300), which the UI doesn't use (sums from the [file list](https://data.jsdelivr.com/v1/packages/npm/@ibm/plex-mono@2.5.0?structure=flat)).
- **Silent failure.** A `url()` that fails to resolve only logs "didn't resolve at build time, it will remain unchanged" ([vite css.ts](https://raw.githubusercontent.com/vitejs/vite/v8.3.0/packages/vite/src/node/plugins/css.ts)).
- **Types.** The side-effect import typechecks: TS 6.0 makes `noUncheckedSideEffectImports` true by default ([TS 6.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)), and `vite/client` declares `declare module '*.css' {}`, which is the documented fix ([TSConfig](https://www.typescriptlang.org/tsconfig/noUncheckedSideEffectImports.html), [client.d.ts](https://cdn.jsdelivr.net/npm/vite@8.3.0/client.d.ts)).
- **Test problem.** See Gotcha 4.

## API surface we will use

### Files (all IBM-published, byte sizes and base64 SHA-256 from jsDelivr)

The data API's `hash` field is "A base64-encoded sha256 of file contents" ([jsDelivr spec](https://data.jsdelivr.com/v1/spec.yaml)).

| Path in package | Face | Bytes | sha256 (base64) |
|---|---|---|---|
| `fonts/complete/woff2/IBMPlexMono-Regular.woff2` | 400 normal | 49,248 | `uiBEl/FrbTNM7p0eljqDG3PjpW4dYwCoSJ0Y33IUs1A=` |
| `fonts/complete/woff2/IBMPlexMono-SemiBold.woff2` | 600 normal | 50,600 | `aoJbSCTAHLtAHoKeWgZqGBhBG8s1OLWleSxcqbgjQ8M=` |
| `fonts/complete/woff2/IBMPlexMono-Italic.woff2` | 400 italic | 53,408 | `ICS/KwgCfc1tCQkThXVuMndEu+JreCxBE4Hf/ED/xiI=` |
| `fonts/complete/woff2/license.txt` | OFL text | 4,360 | `kcJcNQ08rDnaJzbXT3ujfvZI9SN6TjMKJAYVvI2MQ2A=` |
| `LICENSE.txt` | OFL text | 4,456 | `fmsoGO29j2oBroBkHMjxalEIDQj7TlMr46C290rbB9o=` |

Source: [jsDelivr file list](https://data.jsdelivr.com/v1/packages/npm/@ibm/plex-mono@2.5.0?structure=flat).

Weight and style mapping, and IBM's `local()` names:
- Regular → 400 normal (`local("IBM Plex Mono"), local("IBMPlexMono")`)
- SemiBold → 600 normal (`"IBM Plex Mono SemiBold"`, `"IBMPlexMono-SemiBold"`)
- Italic → 400 italic (`"IBM Plex Mono Italic"`, `"IBMPlexMono-Italic"`)

Sources: [default.css](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/css/ibm-plex-mono-default.css), [all.css](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/css/ibm-plex-mono-all.css).

The code face is used at 400 and 600 today (`styles.ts:571`, `:1303`). Italic is used only for YAML comments (`YamlEditor.tsx:24`).

### Package layout

- **Styles.** 16 styles: Thin 100, ExtraLight 200, Light 300, Regular 400, Text 450, Medium 500, SemiBold 600, Bold 700, each with an italic. `all.css` declares weights in the order 700, 200, 400, 300, 500, 600, 450, 100 ([all.css](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/css/ibm-plex-mono-all.css)).
- **`fonts/complete/{woff,woff2}/`** holds one file per style ([file list](https://data.jsdelivr.com/v1/packages/npm/@ibm/plex-mono@2.5.0?structure=flat)). IBM's Carbon guide says a complete file "includes all characters in one file" ([Carbon ibm-plex guide](https://github.com/carbon-design-system/carbon/blob/main/docs/guides/ibm-plex.md)).
- **`fonts/split/woff2/`** holds, per style, `Cyrillic`, `Pi`, `Latin1`, `Latin2` and `Latin3` files plus a per-style CSS. The split files "split characters by Unicode ranges, optimal for performance" ([Carbon guide](https://github.com/carbon-design-system/carbon/blob/main/docs/guides/ibm-plex.md)).
  - Latin1's range is `U+0020-007E, U+00A0-00FF, U+0131, U+0152-0153, U+02C6, U+02DA, U+02DC, U+2013-2014, U+2018-201A, U+201C-201E, U+2020-2022, U+2026, U+2030, U+2039-203A, U+2044, U+20AC, U+2122, U+2212, U+FB01-FB02` ([IBMPlexMono-Regular.css](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/fonts/split/woff2/IBMPlexMono-Regular.css)).
- **The split files are IBM's own subsets.** They are committed in IBM's repo under `packages/plex-mono/fonts/{complete,split}` ([IBM/plex tree](https://github.com/IBM/plex/tree/master/packages/plex-mono/fonts)), and each fonts folder carries the OFL `license.txt`. So they belong to the Original Version (see Licensing), not a third party's Modified Version. Either set is compliant if shipped unmodified. The complete set is recommended for correctness and testability (Gotcha 4), not for licensing.
- **`css/ibm-plex-mono-{all,default}{,.min}.css`** plus `scss/`. SCSS `default()` includes light, regular and semibold ([scss/index.scss](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/scss/index.scss)).

### Size impact

| Choice | Bytes |
|---|---|
| Recommended, dist and over the wire once used: 400 + 600 complete woff2 | 49,248 + 50,600 = **99,848** |
| Recommended, with the italic added | **153,256** |
| For comparison: IBM's Latin1 splits for 400 + 600 | 17,544 + 17,872 = 35,416 |
| For comparison: Fontsource latin 400 + 600 (sibling doc) | 30,328 |
| IBM's `default.css` route, in dist | 557,532 |

Sources: [file list](https://data.jsdelivr.com/v1/packages/npm/@ibm/plex-mono@2.5.0?structure=flat), `docs/research/fontsource-ibm-plex-mono.md` for the Fontsource figure.

### Verifying the drawn face (Playwright: chrome, firefox, safari; edge in CI)

Use four checks together. Each one alone has a gap.

1. **The file was served.** `request.resourceType()` can be `font` ([Playwright Request](https://playwright.dev/docs/api/class-request)). Assert that an OK response for `/assets/IBMPlexMono-Regular-<hash>.woff2` came from the app's origin. Register the listener before `goto`.
2. **The face loaded (all engines).**
   - First wait until an element set in the code face is visible, then `await document.fonts.ready`. `ready` "resolves once font loading and layout operations have completed" ([MDN FontFaceSet](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet)).
   - Then assert a CSS-connected `FontFace` with family `IBM Plex Mono`, weight 400 and style normal has `status === 'loaded'`. `status` is one of `"unloaded"`, `"loading"`, `"loaded"`, `"error"` and is Baseline widely available ([MDN FontFace.status](https://developer.mozilla.org/en-US/docs/Web/API/FontFace/status)).
   - Because there is no `local()`, `loaded` means the shipped file loaded.
   - Also assert the element's computed `font-family` starts with `IBM Plex Mono`.
3. **`document.fonts.check()` is not enough on its own.** Per spec: "If font face list is empty, or all fonts in the font face list either have a status attribute of 'loaded' or are system fonts, return true" ([CSS Font Loading 3 §3.3](https://www.w3.org/TR/css-font-loading-3/), [MDN check](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check)). So it returns true when no Plex rule exists at all. Use it only together with check 2. With the recommended rules, `check('12px "IBM Plex Mono"')` is false until the 400 face has loaded.
4. **Chromium ground truth (chrome and edge projects).**
   - Playwright: "CDP sessions are only supported on Chromium-based browsers" ([BrowserContext.newCDPSession](https://playwright.dev/docs/api/class-browsercontext)). The `browserName` fixture is `"chromium" | "firefox" | "webkit"` ([TestOptions](https://playwright.dev/docs/api/class-testoptions)), so the Chrome and Edge channels report `chromium`.
   - `CSS.getPlatformFontsForNode({nodeId})` returns `PlatformFontUsage[]` with `familyName`, `postScriptName`, `isCustomFont` and `glyphCount` ([CSS.pdl](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/CSS.pdl)).
   - Branch on `browserName`. Don't use `test.skip`: CLAUDE.md forbids reaching green with skip.
   ```ts
   if (browserName === 'chromium') {
     const cdp = await page.context().newCDPSession(page);
     await cdp.send('DOM.enable');
     await cdp.send('CSS.enable');
     const { root } = await cdp.send('DOM.getDocument');
     const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.model-editor__path' });
     const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
     // expected postScriptName 'IBMPlexMono' (UNVERIFIED; inferred from IBM's local() names), isCustomFont true
   }
   ```
5. **"Unmodified" as a build check.** After `vite build`, compare the SHA-256 of `dist/assets/IBMPlexMono-Regular-*.woff2` with the installed package file, or with the hash in the table. This proves nothing we ship was altered.

Don't call `document.fonts.load()` before asserting: it starts the load itself, so a page that never uses the face would still pass ([MDN load](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load)).

## Gotchas

1. **pnpm install fails without `allowBuilds`.** The telemetry `postinstall` plus pnpm 12's default `strictDepBuilds: true` break the install (see Install). The error is expected on the first `pnpm add` if `allowBuilds` isn't set yet.
2. **Telemetry and privacy.**
   - The README says: "By installing this package as a dependency you are agreeing to telemetry collection" ([README](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/README.md)).
   - Collection "runs on CI servers … It never runs locally on a developer's machine", and is triggered by the `postinstall` script ([telemetry-js](https://github.com/ibm-telemetry/telemetry-js)).
   - The endpoint is `https://www-api.ibm.com/ibm-telemetry/v1/metrics` ([telemetry.yml](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/telemetry.yml)).
   - With `allowBuilds: false` the script never runs. `IBM_TELEMETRY_DISABLED='true'` is a second safeguard.
3. **IBM's CSS sets no `font-display`.** The UA default `auto` applies, where "The font display strategy is defined by the user agent" ([MDN font-display](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display)). The request to add `swap` ([IBM/plex#304](https://github.com/IBM/plex/issues/304)) is closed.
4. **IBM's CSS makes `check()` misleading.**
   - IBM's CSS defines the complete face first and the splits after it, with Latin1 last ([regular/_index.scss](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/scss/regular/_index.scss)).
   - "the rules are ordered in the reverse order they were defined; the last rule defined is the first to be checked for a given character" ([CSS Fonts 3 §4.5](https://www.w3.org/TR/css-fonts-3/)). So Latin text is drawn from the Latin1 split file.
   - `check()`'s `text` defaults to `" "` and keeps every face whose range contains it ([MDN check](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check)). That includes the complete face, which covers U+0-10FFFF and is still `unloaded`.
   - The following is derived from those two rules, not tested: `check()` returns false while the text is correctly drawn in Plex.
5. **README table disagrees with the CSS.** The README's weights table marks `bold` as in `default()`. The SCSS mixin and `default.css` actually contain light, regular and semibold ([README](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/README.md), [scss/index.scss](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/scss/index.scss)).
6. **`sideEffects` and `exports` are absent.** Deep `?url` imports resolve (no `exports` encapsulation). With no `sideEffects` flag, the bundler default is side-effectful: Rollup's `treeshake.moduleSideEffects` defaults to `true` ([Rollup](https://rollupjs.org/configuration-options/#treeshake-modulesideeffects)). Vite 8 builds with Rolldown, and the equivalent default there is UNVERIFIED. This only matters for the CSS-import route.
7. **Missing glyphs fall back per character.** "If no matching face exists or the matched face does not contain a glyph for the character to be rendered, the next family name is selected" ([CSS Fonts 3 §5.2](https://www.w3.org/TR/css-fonts-3/)). Characters that Plex lacks are drawn in `ui-monospace`. The complete file avoids missing a glyph that is only in an unshipped subset.
8. **Italic.** YAML comments are italic (`YamlEditor.tsx:24`). Without the italic face the browser synthesises a slant from Regular (sibling doc Gotcha 5, [MDN font-synthesis-style](https://developer.mozilla.org/en-US/docs/Web/CSS/font-synthesis-style)).
9. **node_modules footprint.** The package plus telemetry-js adds about 7.8 MB unpacked (3,296,995 + 4,474,193 bytes). Only the imported files reach `dist/`.
10. **Unit tests and the `FontFace` API.** Keep the `FontFace` constructor out of code that unit tests run. Whether jsdom 30 implements `FontFace` or `document.fonts` is UNVERIFIED (see [jsdom#2698](https://github.com/jsdom/jsdom/issues/2698)). The `@font-face`-in-CSS route never needs it.

## Licensing

1. **The license carries the Reserved Font Name.** The package's `LICENSE.txt` begins "Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"", then "This Font Software is licensed under the SIL Open Font License, Version 1.1." ([LICENSE.txt](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/LICENSE.txt)). The same header is in `fonts/complete/woff2/license.txt` ([license.txt](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/fonts/complete/woff2/license.txt)).
2. **IBM's files are the Original Version.**
   - OFL definitions: "Original Version" is "the collection of Font Software components as distributed by the Copyright Holder(s)". A "Modified Version" is "any derivative made by adding to, deleting, or substituting – in part or in whole – any of the components of the Original Version" ([OFL text](https://openfontlicense.org/open-font-license-official-text/)).
   - IBM's own woff2 files, including its split subsets, are components as distributed by IBM.
   - SIL notes: "Some authors (including SIL) are now providing web versions of their fonts as part of their normal OFL distribution packages". Its first option for keeping RFNs is "Host the Original Version without any changes at all" ([SIL webfonts & RFNs](https://openfontlicense.org/webfonts-and-reserved-font-names/)).
3. **The RFN restriction doesn't apply.** Condition 3 applies only to Modified Versions: "No Modified Version of the Font Software may use the Reserved Font Name(s) unless explicit written permission is granted … This restriction only applies to the primary font name as presented to the users" ([LICENSE.txt](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/LICENSE.txt)). Shipping the files unchanged keeps the name "IBM Plex Mono" usable.
4. **Things that would make it a Modified Version.** Don't subset, don't re-encode, and don't run the files through an optimising plugin:
   - FAQ 2.6: subsetting a webfont "is considered modification".
   - FAQ 2.2: "A change in font format normally is considered modification".
   - FAQ 2.5: optimised versions "are Modified Versions".
   - Source: [OFL FAQ](https://openfontlicense.org/ofl-faq/).
   - Vite's assets "can be processed by plugins for optimization" ([Vite assets](https://vite.dev/guide/assets)). `vite.config.ts` registers only `@vitejs/plugin-react`. The hash test in API surface item 5 guards this.
5. **Hashed file names.** Vite renames the files (`[name]-[hash]`). No OFL FAQ entry covers file names; I asked the FAQ page for "file name" and "filename" and got no match. Treating a rename as unmodified is an interpretation, based on the Modified Version definition (which concerns components' contents) and condition 3's "primary font name as presented to the users".
6. **Notice and license: serving webfonts counts as distribution.**
   - Condition 2: "Original or Modified Versions of the Font Software may be bundled, redistributed and/or sold with any software, provided that each copy contains the above copyright notice and this license. These can be included either as stand-alone text files, human-readable headers or in the appropriate machine-readable metadata fields within text or binary files as long as those fields can be easily viewed by the user" ([LICENSE.txt](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/LICENSE.txt)).
   - FAQ 1.10: the OFL text may be omitted only "when a font is embedded in a document or bundled within a program".
   - FAQ 1.11: embedding means extraction is "difficult or clearly discouraged", and "Any other means of delivering a font to another person is considered 'distribution', and needs to be accompanied by any copyright notices and licensing information".
   - FAQ 2.1: webfonts "hosted on the same server as other site assets" are "explicitly allowed by the licensing model because it is distribution" ([OFL FAQ](https://openfontlicense.org/ofl-faq/)).
   - wechart's woff2 files are separately fetchable same-origin URLs. So the conservative reading is distribution, not "bundled within a program", and **the copyright notice and OFL text must ship with the build**.
   - **Correction to `fontsource-ibm-plex-mono.md`:** its FAQ 1.10 line ("may omit the OFL text") should be read together with FAQ 2.1.
7. **Minimum to ship.** FAQ 1.20 (apps): "At a minimum you must include the copyright statement, the license notice and the license text … You do not, however, need to include the full contents of the font package - only the fonts you use". It calls an About-box mention with a link "good practice" ([OFL FAQ](https://openfontlicense.org/ofl-faq/)).
   - Ways to carry the text: put a copy of IBM's `LICENSE.txt` in `packages/web/public/`, which Vite copies "to the root of the dist directory as-is" ([Vite public dir](https://vite.dev/guide/assets)).
   - Or import it: `?url` emits it as an asset, and `?raw` gives the text for an in-app notices view. Both are declared in [client.d.ts](https://cdn.jsdelivr.net/npm/vite@8.3.0/client.d.ts).
   - Which surface to use is a requirements question (Open questions).
8. **Other conditions.**
   - Condition 5: the font "must be distributed entirely under this license". Don't relabel the font files under wechart's own license.
   - Condition 1 (not sold by itself) doesn't apply.
   - Source: [LICENSE.txt](https://cdn.jsdelivr.net/npm/@ibm/plex-mono@2.5.0/LICENSE.txt).

## Open questions / unverified

- **For the user (design):** which `font-display` value to use. IBM ships none; the Fontsource build uses `swap`. Not decided here.
- **For the user (design):** whether to ship the italic face (53,408 bytes) for YAML comments, or accept a synthesised slant.
- **For the user (requirements):** where the OFL notice and license appear. Options are a license file in `dist/`, an in-app About or third-party-notices view, or both.
- UNVERIFIED: whether the woff2 files' own metadata (name table copyright and license fields) contains the OFL text or URL. No tool here could inspect the binaries. Shipping the text file satisfies condition 2 either way.
- UNVERIFIED: the exact `postScriptName` and `familyName` CDP reports (expected `IBMPlexMono` / `IBM Plex Mono`), and how each engine serialises `FontFace.family` (quotes) and `.weight` (`"400"` vs `"normal"`). Normalise both in the test.
- UNVERIFIED: whether pnpm also flags `@ibm/telemetry-js` for build approval. Its manifest lists a `prepare` script but no `preinstall`, `install` or `postinstall`. The first `pnpm install` will list any flagged package.
- UNVERIFIED: that Vite core never rewrites asset bytes. The docs only say plugins *can*. The build hash test settles it.
- UNVERIFIED: whether Vite's CSS `url()` resolver accepts bare package specifiers. The recommended `?url` route doesn't need it.
- Not researched: IBM's trademark guidance for "IBM Plex®" (the README uses ®). Also `@ibm/plex-mono-variable` 1.0.0, which exists (OFL-1.1, same telemetry `postinstall`, [registry](https://registry.npmjs.org/@ibm/plex-mono-variable/latest)).
