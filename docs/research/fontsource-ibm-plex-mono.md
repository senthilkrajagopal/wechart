---
library: Fontsource IBM Plex Mono
packages: [@fontsource/ibm-plex-mono]
version: 5.3.0
researched: 2026-09-24
sources: [https://registry.npmjs.org/@fontsource/ibm-plex-mono/latest, https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/package.json, https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/400.css, https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/600.css, https://fontsource.org/docs/getting-started/install, https://fontsource.org/docs/getting-started/subsets, https://fontsource.org/docs/getting-started/preload, https://fontsource.org/docs/getting-started/faq, https://vite.dev/guide/assets, https://vite.dev/guide/features, https://vite.dev/config/build-options, https://www.w3.org/TR/css-font-loading-3/, https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check, https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load, https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/CSS.pdl, https://playwright.dev/docs/api/class-cdpsession]
---

# Fontsource IBM Plex Mono 5.3.0

Status: **not adopted yet.** Whether wechart ships this package, IBM's own
`@ibm/plex-mono`, or no font file at all is a decision for the user (see
"Licensing: Reserved Font Name" below). Recorded so that decision has its
sources.

## Summary

`@fontsource/ibm-plex-mono` is a self-hosted copy of the Google Fonts build of
IBM Plex Mono, packaged for npm ("Self-host the IBM Plex Mono font in a neatly
bundled NPM package." — [registry](https://registry.npmjs.org/@fontsource/ibm-plex-mono/latest)).

- `docs/design/direction.md` §3 sets the code face to "**IBM Plex Mono**,
  falling back to `ui-monospace, Menlo`"; AC-223 fails when "code is set in a
  face other than IBM Plex Mono".
- `packages/web/src/shell/styles.ts` names the face in `--wc-font-code` and
  ships no file, so machines without Plex installed draw the fallback.
- The design prototype loads it from `fonts.googleapis.com`
  (`docs/design/prototype/index.html:11`), which cannot work offline or on-prem.

Facts ([registry](https://registry.npmjs.org/@fontsource/ibm-plex-mono/latest), [metadata.json](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/metadata.json)):
- `latest` is **5.3.0**; Google Fonts data `v20`, `lastModified` 2025-09-16,
  `"variable": false`, weights 100–700 italic and normal, subsets `cyrillic`,
  `cyrillic-ext`, `latin`, `latin-ext`, `vietnamese` (default `latin`).
- License: package and font `OFL-1.1`; attribution "Copyright 2017 IBM Corp. All rights reserved."
- OFL condition 2 allows bundling with software, "provided that each copy
  contains the above copyright notice and this license"
  ([LICENSE](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/LICENSE));
  OFL FAQ 1.10: a font "bundled within a program" may omit the OFL text
  ([OFL FAQ](https://openfontlicense.org/ofl-faq/)). `LICENSE` is exported at
  `@fontsource/ibm-plex-mono/LICENSE`.

## Install

```sh
pnpm --filter @wechart/web add -E @fontsource/ibm-plex-mono@5.3.0
```

No dependencies, peer dependencies or engines ([package.json](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/package.json)).
Unpacked 1,489,824 bytes in 244 files; only files the imported CSS references
reach the build. Needs a bundler ([install](https://fontsource.org/docs/getting-started/install)).
TypeScript: Vite's `client.d.ts` declares `declare module '*.css' {}`, which
`"types": ["vite/client"]` in `packages/web/tsconfig.json` already brings in.

## Init

Two side-effect imports in `packages/web/src/main.tsx`:

```ts
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
```

"Each import loads one font file" per weight/style
([install](https://fontsource.org/docs/getting-started/install)). Keep the
`@font-face` rules in an imported `.css`, not in `styles.ts`'s string: Vite
rewrites `url()` in CSS it processes ([assets](https://vite.dev/guide/assets),
[features](https://vite.dev/guide/features)); a `url()` inside a JS string is
UNVERIFIED either way.

## API surface

| Import | Registers | Source |
|---|---|---|
| `@fontsource/ibm-plex-mono/400.css` | 400 normal, 5 subsets with `unicode-range` | [400.css](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/400.css) |
| `@fontsource/ibm-plex-mono/600.css` | 600 normal, 5 subsets | [600.css](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/600.css) |
| `@fontsource/ibm-plex-mono/400-italic.css` | 400 italic, 5 subsets | [400-italic.css](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/400-italic.css) |
| `@fontsource/ibm-plex-mono/latin-400.css` | latin only, **without** `unicode-range` | [latin-400.css](https://cdn.jsdelivr.net/npm/@fontsource/ibm-plex-mono@5.3.0/latin-400.css) |

Every block registers `font-family: 'IBM Plex Mono'`, `font-display: swap`,
`src: url(./files/…woff2) format('woff2'), url(./files/…woff) format('woff')`.
With `unicode-range`, a subset is fetched only if a character in it renders
([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/unicode-range));
only woff2 is fetched by the browsers in AC-180's matrix
([CSS Fonts 4 §4.3](https://www.w3.org/TR/css-fonts-4/), [caniuse](https://caniuse.com/woff2)).

Vite emits referenced fonts as hashed same-origin assets; each file exceeds
the 4096-byte inline limit, so none is inlined
([assets](https://vite.dev/guide/assets), [build options](https://vite.dev/config/build-options)).

### Verifying the drawn face (Playwright)

- `document.fonts.check('12px "IBM Plex Mono"')` returns `true` even with no
  such face registered ([CSS Font Loading 3 §3.3](https://www.w3.org/TR/css-font-loading-3/),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/check)) — not a regression test alone.
- `document.fonts.load(font, text)` resolves with the loaded `FontFace`s; an
  empty array means none matched ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load)).
- Chromium ground truth: CDP `CSS.getPlatformFontsForNode` → `isCustomFont`
  (needs `DOM.enable` then `CSS.enable`) ([CSS.pdl](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/CSS.pdl));
  CDP sessions are Chromium-only ([Playwright](https://playwright.dev/docs/api/class-browsercontext)).
- Font requests are `request.resourceType() === 'font'`; assert their origin is the app's.

## Gotchas

1. `font-display: swap`: the fallback draws until the file arrives
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display)).
2. A same-named web font hides an installed one, even when it fails to load
   ([CSS Fonts 3](https://www.w3.org/TR/css-fonts-3/#font-family-desc)).
3. Subset-only imports lose `unicode-range` and coverage
   ([subsets](https://fontsource.org/docs/getting-started/subsets)).
4. Characters outside the five ranges (e.g. U+2192 "→") fall back per character ([CSS Fonts 4 §5](https://www.w3.org/TR/css-fonts-4/)).
5. YAML comments are italic (`YamlEditor.tsx`); without `400-italic.css` the
   browser synthesises a slant ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/font-synthesis-style)).
6. Sizes: latin 400 + 600 woff2 = 30,328 bytes over the wire; `dist/` holds all
   20 files, 190,484 bytes ([file list](https://data.jsdelivr.com/v1/packages/npm/@fontsource/ibm-plex-mono@5.3.0?structure=flat)).
7. Playwright screenshots wait on fonts; an unloadable font can time one out
   ([playwright#35972](https://github.com/microsoft/playwright/issues/35972)).
8. CodeMirror's base theme sets `fontFamily: "monospace"`; `styles.ts` overrides
   it for `.yaml-editor .cm-scroller`, the only `EditorView`.
9. Vite `server.fs.strict` can 403 fonts resolved outside the workspace root
   ([Drape#842](https://github.com/michaelpaulrattray/Drape/issues/842)); not
   this repo's layout.
10. **Licensing: Reserved Font Name "Plex".** Upstream licenses begin
    "Copyright © 2017 IBM Corp. with Reserved Font Name "Plex""
    ([google/fonts OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/OFL.txt),
    [IBM/plex LICENSE.txt](https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt));
    Fontsource's LICENSE header omits the RFN clause. OFL condition 3 bars
    Modified Versions from using an RFN without permission, and OFL FAQ 2.6
    counts webfont subsetting as modification
    ([OFL FAQ](https://openfontlicense.org/ofl-faq/),
    [SIL on webfonts and RFNs](https://openfontlicense.org/webfonts-and-reserved-font-names/)).
    Whether an IBM–Google agreement covers Google's subsets is UNVERIFIED.
    IBM's own `@ibm/plex-mono` 2.5.0 (OFL-1.1) exists
    ([registry](https://registry.npmjs.org/@ibm/plex-mono/latest)) and was not
    researched here.

## Alternatives

- `@fontsource-variable/ibm-plex-mono`: does not exist (registry 404; `"variable": false`).
- Hand-written `@font-face` in `styles.ts` from `?url` imports: allows another
  `font-display`, at the cost of copying the `unicode-range` values.
- Google Fonts CDN: fails the offline/on-prem requirement.
- IBM's `@ibm/plex-mono`: from the name's holder; not researched.

## Open questions

- Licensing (for the user): the RFN question above, and how the shipped app
  carries OFL condition 2's notice.
- Whether to import `400-italic.css` for YAML comments.
- UNVERIFIED: the `familyName` CDP reports; per-engine `FontFace` serialisation;
  the 5.3.0 publish date; why its woff2 files are larger than its woff files.
