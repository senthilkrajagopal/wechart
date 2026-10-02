---
library: CodeMirror 6 (recommended) vs Monaco Editor (rejected)
packages: [codemirror, @codemirror/state, @codemirror/view, @codemirror/language, @codemirror/commands, @codemirror/search, @codemirror/autocomplete, @codemirror/lint, @codemirror/lang-yaml, @codemirror/lang-sql, @codemirror/lang-json, @lezer/highlight, monaco-editor, @monaco-editor/react]
version: 6.0.2
researched: 2026-09-19
sources: [https://registry.npmjs.org/codemirror/latest, https://code.haverbeke.berlin/codemirror/view, https://raw.githubusercontent.com/codemirror/lint/main/src/lint.ts, https://raw.githubusercontent.com/codemirror/website/main/site/examples/styling/index.md, https://raw.githubusercontent.com/codemirror/website/main/site/examples/tab/index.md, https://raw.githubusercontent.com/microsoft/monaco-editor/main/docs/integrate-esm.md, https://github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide, https://github.com/microsoft/monaco-editor/issues/2427]
---

# CodeMirror 6 (pinned set below) — embedded code editor

## Summary

The model editor needs a YAML code view paired with the generated form (AC-132), a two-way sync that repaints YAML in one render and the form within 500 ms (AC-133), a problems list with file/line plus a read-only form while YAML is broken (AC-135), a read-only SQL view for chart previews (AC-168), full keyboard reachability with a visible focus ring (AC-176), and WCAG AA text contrast in both themes from wechart's own tokens (AC-005).
Recommendation: **CodeMirror 6**. It styles from plain CSS (so our design tokens drive contrast directly), does not trap Tab, ships YAML/SQL/JSON as separate small packages, and its transaction model maps the cursor through externally applied changes. Monaco is rejected mainly on theming (no CSS variables) and Tab trapping; details in [Alternatives](#alternatives-considered).

## Install

```
pnpm add codemirror@6.0.2 @codemirror/state@6.7.5 @codemirror/view@6.43.12 \
  @codemirror/language@6.12.4 @codemirror/lint@6.9.7 \
  @codemirror/lang-yaml@6.1.3 @codemirror/lang-sql@6.10.0 @codemirror/lang-json@6.0.2
```

- `@codemirror/commands` (history and the default keymaps) was not pinned above; T139 pinned it at `6.11.1`, the registry's latest on 2026-09-21 (`npm view @codemirror/commands version`).
- `@lezer/highlight` **1.2.3** (MIT; its one dependency is `@lezer/common ^1.3.0`, [registry](https://registry.npmjs.org/@lezer/highlight/latest)). Pinned on 2026-09-21 for the `tags` a highlight style targets. It is what `@codemirror/language` 6.12.4 itself depends on (`"@lezer/highlight": "^1.0.0"`), and the lockfile already resolves it to 1.2.3. See "Highlighting from tokens" below.
- All MIT ([codemirror](https://registry.npmjs.org/codemirror/latest), [view](https://registry.npmjs.org/@codemirror/view/latest), [state](https://registry.npmjs.org/@codemirror/state/latest), [lint](https://registry.npmjs.org/@codemirror/lint/latest), [lang-yaml](https://registry.npmjs.org/@codemirror/lang-yaml/latest), [lang-sql](https://registry.npmjs.org/@codemirror/lang-sql/latest), [lang-json](https://registry.npmjs.org/@codemirror/lang-json/latest)).
- No peer deps to satisfy; `@codemirror/view` is `"type": "module"` with dual ESM/CJS `exports` ([registry](https://registry.npmjs.org/@codemirror/view/latest)), so Vite resolves it without configuration.
- `codemirror` 6.0.2 is only "an example configuration" bundling view/state/language/commands/search/autocomplete/lint ([registry](https://registry.npmjs.org/codemirror/latest), [README](https://code.haverbeke.berlin/codemirror/basic-setup/raw/branch/main/README.md)); prefer composing extensions explicitly so unused ones stay out of the chunk.
- Bundle: the official bundling guide measures a `basicSetup` editor at "approximately 1 megabyte" raw, "roughly 400 kilobytes minified (135 KB gzipped)", and a minimal setup at 250 KB minified / 75 KB gzipped; it notes unused code is eliminated by a tree-shaking bundler and that language packages can be dynamically imported ([bundling example](https://raw.githubusercontent.com/codemirror/website/main/site/examples/bundle/index.md)).

## Init / auth pattern

No auth. React 19 + Vite: hold a ref, construct the view in an effect, destroy it in cleanup (Strict Mode double-invokes the effect; `destroy()` makes that safe).

- `EditorViewConfig.parent`: "When given, the editor is immediately appended to the given element on creation." `state`: "The view's initial state. If not given, a new state is created by passing this configuration object to `EditorState.create`". `destroy()`: "Clean up this editor view, removing its element from the document, unregistering event handlers… The view instance can no longer be used after calling this." ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts))
- `EditorState.create` is "only needed when initializing an editor—updated states are created by applying transactions" ([state.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/state.ts)).
- There is no official React binding; the editor is driven through `view.dispatch` ("All regular editor state updates should go through this") ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)).

## API surface we will use

**Languages.** `yaml()` returns `LanguageSupport`; `yamlLanguage` is "a language provider based on the Lezer YAML parser, extended with highlighting and indentation information"; `yamlFrontmatter({content})` handles `---`-delimited frontmatter ([lang-yaml README](https://code.haverbeke.berlin/codemirror/lang-yaml/raw/branch/main/README.md)). `sql(config?: SQLConfig) → LanguageSupport` with `dialect`, `schema`, `defaultTable`, `defaultSchema`, `upperCaseKeywords`, `keywordCompletion`; dialects include StandardSQL, PostgreSQL, MySQL, MariaSQL, MSSQL, SQLite, Cassandra, PLSQL, plus `SQLDialect.define()` and `schemaCompletionSource()` ([lang-sql README](https://raw.githubusercontent.com/codemirror/lang-sql/main/README.md)). `json()` from `@codemirror/lang-json` ([registry](https://registry.npmjs.org/@codemirror/lang-json/latest)).

**Diagnostics (AC-135).** `linter(source: LintSource | null, config?: LintConfig): Extension` with `delay` (default 750 ms), `needsRefresh`, `markerFilter`, `tooltipFilter`, `hideOn`, `autoPanel`. `Diagnostic = {from, to, severity: "hint"|"info"|"warning"|"error", markClass?, source?, message, renderMessage?, actions?}`. `setDiagnostics(state, diagnostics)` "updates active diagnostics and enables linting if inactive"; `forceLinting(view)` "runs configured linters immediately regardless of idle state"; `lintGutter(config?)` "installs gutter showing diagnostic markers per line" with `hoverTime` (default 300 ms) ([lint.ts](https://raw.githubusercontent.com/codemirror/lint/main/src/lint.ts)).
Pattern for AC-135: parse YAML with our own parser, map its line/col to document offsets, then `view.dispatch(setDiagnostics(view.state, diags))` — squiggles come from the diagnostic ranges, the per-line marker from `lintGutter()`, and our problems list renders from the same array (so "file and line" text and the editor markers cannot drift).
Scrolling (T139's review, checked 2026-09-21):
- "By default, the editor adjusts to the height of its content, but you can make `cm-scroller` `overflow: auto`, and assign a `height` or `max-height` to `cm-editor`, to make the editor scrollable" ([styling example](https://raw.githubusercontent.com/codemirror/website/main/site/examples/styling/index.md)).
- A `max-height` alone cuts the lines past it off instead of scrolling to them. It also leaves the page as the nearest scrollable ancestor, so a `scrollIntoView` scrolls the page.

Showing a form edit (T139's review, checked 2026-09-21):
- The editor draws only the lines near its scroll position (observed: 36 of a 50-line file), so a key the form adds at a cube's end is in the document but not on screen.
- The change from the form is dispatched with `effects: EditorView.scrollIntoView(from, {y: 'nearest'})`. That static method "Returns an effect that can be added to a transaction to cause it to scroll the given position or range into view". With the default `"nearest"`, "the position will be vertically scrolled only the minimal amount required" ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)).
- It moves the view, not the cursor.

Going to a problem (T141, checked 2026-09-21): dispatch `{selection: {anchor}, scrollIntoView: true}` — `TransactionSpec.scrollIntoView` "When set to `true`, the transaction is marked as needing to scroll the current selection into view", and `selection` offsets "should refer to the document as it is _after_ the transaction" ([transaction.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/transaction.ts)) — then `view.focus()`, "Put focus on the editor" ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)). Observed in the browser tests on @codemirror/lint 6.9.7: an error diagnostic's range carries the class `cm-lintRange-error`.

**Controlled value (AC-133).** Dispatch a change instead of recreating state: `EditorState.update` creates "a transaction that updates this state"; `TransactionSpec.selection` — "When set, this transaction explicitly updates the selection"; and when it is not set, the transaction "will map the start state's current selection through the changes made by the transaction" ([transaction.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/transaction.ts)). So writing form edits back as `{changes: {from, to, insert}}` keeps the caret where the user left it. Use `Annotation`s ("tagged values used to add metadata to transactions", suitable for "origin information") to tag form-originated transactions so the `updateListener` does not echo them back into the form. Avoid `view.setState()`, which "will cause the entire document to be redrawn and all view plugins to be reinitialized… use dispatch instead" ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)).

**Read-only + decorations (AC-168).** `EditorState.readOnly` — "Returns true when the editor is configured to be read-only" ([state.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/state.ts)); `EditorView.editable` — "Facet that controls whether the editor content DOM is editable. When its highest-precedence value is `false`, the element will not have its `contenteditable` attribute set" ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)). Keep `editable: false` plus `readOnly: true` for the generated-SQL view so text stays selectable and screen-reader navigable while input is refused. Per-line marks use `Decoration.line` — "can add DOM attributes to the line starting at the given position", with `class`/`attributes` specs; `Decoration.mark` "influences the styling of the content in its range"; `Decoration.widget`, `Decoration.replace`, `Decoration.set` for building sets ([decoration.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/decoration.ts)).

**Theming (AC-005).** `EditorView.theme()` "takes an object whose properties are CSS selectors and whose values are styles, and returns an extension that installs the theme"; `EditorView.baseTheme()` supports `&dark`/`&light` variants; stable class names `cm-editor`, `cm-content`, `cm-focused`, `cm-gutters`, `cm-line`, `cm-cursor`, `cm-selectionBackground` can be targeted from a plain stylesheet, as long as "your own rules [are] at least as specific as the injected rules, for example by prefixing them with `.cm-editor`" ([styling example](https://raw.githubusercontent.com/codemirror/website/main/site/examples/styling/index.md)). Style values are ordinary CSS declarations, so `var(--wc-color-fg)` tokens work; pass `dark: true` so "the editor will enable its dark default styles for things not explicitly styled by the theme" ([same page](https://raw.githubusercontent.com/codemirror/website/main/site/examples/styling/index.md)), and `EditorView.darkTheme` records that a dark theme is active ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)). If both themes read the same custom properties, a `data-theme` swap on an ancestor repaints the editor with no editor API call at all.

**Highlighting from tokens (AC-005; T139's review, 2026-09-21).** `defaultHighlightStyle` is a light-theme style. In dark mode it drew YAML keys `#0000cc` on `#1c1c1b`, 1.52:1, which the rendered audit measured. The fix is a highlight style of our own, whose colours are `var(--wc-code-*)` tokens:
- `HighlightStyle.define(specs: readonly TagStyle[], options?: {scope?, all?, themeType?: "dark" | "light"})` "associates the given styles to the given tags". A `TagStyle`'s `tag` is "the tag or tags to target", and its further properties "will be interpreted as in style objects". `syntaxHighlighting(highlighter, {fallback})` installs it ([highlight.ts](https://raw.githubusercontent.com/codemirror/language/main/src/highlight.ts)).
- The YAML grammar tags its nodes as follows ([@lezer/yaml highlight.js](https://raw.githubusercontent.com/lezer-parser/yaml/main/src/highlight.js)):
  - a key: `t.definition(t.propertyName)`
  - a quoted value: `t.string`, and a block literal's header `t.special(t.string)`
  - a plain value: `t.content`
  - an anchor or alias: `t.labelName`, and a tag `t.typeName`
  - a comment: `t.lineComment`
  - a directive: `t.keyword`, and `---`/`...` `t.meta`
- Tags come from `@lezer/highlight`'s `tags` export, "the default set of highlighting tags". `definition` is a "modifier that indicates that a given element is being defined", so a style on `propertyName` also colours a defined one ([reference](https://lezer.codemirror.net/docs/ref/#highlight.tags)).
- With one set of tokens redefined per theme, one style serves both themes, so `themeType` is not needed.

**Runtime reconfiguration.** `Compartment`: "Extension compartments can be used to make a configuration dynamic. By wrapping part of your configuration in a compartment, you can later replace that part through a transaction" — `compartment.of(ext)`, `compartment.reconfigure(content) → StateEffect`, `compartment.get(state)` ([facet.ts](https://raw.githubusercontent.com/codemirror/state/main/src/facet.ts)). Use one compartment each for theme, language, and read-only, so switching any of them is a dispatch, not a re-created editor (document, scroll, undo history and cursor survive).

**Accessibility (AC-176).** The content element gets `role="textbox"`, `aria-multiline="true"`, and `aria-readonly="true"` when not editable; `EditorView.announce` is a "state effect used to include screen reader announcements in a transaction. These will be added to the DOM in a visually hidden element with `aria-live="polite"`"; `EditorView.contentAttributes` and `EditorView.editorAttributes` supply further DOM attributes (e.g. `aria-label`, `aria-describedby` pointing at the problems list) ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)). By default "CodeMirror _does not_ handle the Tab key", explicitly because "it is really unfriendly towards such users to have focusable inputs that they cannot escape from", aligning with the WCAG no-keyboard-trap criterion; `indentWithTab` from `@codemirror/commands` opts into Tab indentation, with Escape-then-Tab as the escape hatch ([tab example](https://raw.githubusercontent.com/codemirror/website/main/site/examples/tab/index.md)). The focus ring is ours to draw via `.cm-editor.cm-focused` ([styling example](https://raw.githubusercontent.com/codemirror/website/main/site/examples/styling/index.md)).

## Gotchas

- **Repositories moved off GitHub.** `codemirror/view`, `codemirror/website` and siblings were "archived by the owner on Apr 15, 2026. It is now read-only", with READMEs pointing to `https://code.haverbeke.berlin/codemirror/<pkg>` ([github.com/codemirror/view](https://github.com/codemirror/view), [github.com/codemirror/website](https://github.com/codemirror/website)). The GitHub mirrors are stale: their changelog stops at 6.41.0 (2026-04-01) while the live changelog runs to 6.43.12 (2026-09-15) ([GitHub CHANGELOG](https://raw.githubusercontent.com/codemirror/view/main/CHANGELOG.md), [current CHANGELOG](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/CHANGELOG.md)). Cite code.haverbeke.berlin in future research; npm remains the distribution channel and releases are frequent (6.43.9–6.43.12 all landed between 2026-08-16 and 2026-09-15, one of them "screen reader announcements") ([CHANGELOG](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/CHANGELOG.md)).
- Version skew across `@codemirror/*` is real: `@codemirror/lint` 6.9.7 requires `@codemirror/view ^6.42.0` ([registry](https://registry.npmjs.org/@codemirror/lint/latest)). Keep a single hoisted `@codemirror/state` and `@codemirror/view` in the pnpm workspace; two copies of `@codemirror/state` break extensions silently.
- Hand-written CSS must out-specify the injected style-mod rules — prefix with `.cm-editor` ([styling example](https://raw.githubusercontent.com/codemirror/website/main/site/examples/styling/index.md)).
- `linter()` defaults to a 750 ms debounce ([lint.ts](https://raw.githubusercontent.com/codemirror/lint/main/src/lint.ts)); AC-133's 500 ms budget means driving diagnostics through `setDiagnostics` from our own parse (or lowering `delay`), not relying on the default.
- The editor renders only the visible viewport, so `document.querySelector` assertions in tests see partial text; assert on `view.state.doc.toString()`.

## Alternatives considered

**Monaco Editor 0.56.0**, MIT, deps `marked` + `dompurify` ([registry](https://registry.npmjs.org/monaco-editor/latest)); React binding `@monaco-editor/react` 4.7.0, MIT, peer `react ^19` ([registry](https://registry.npmjs.org/@monaco-editor/react/latest)). It is actively maintained: 0.56.0 "reorganized ESM module exports to provide supported, tree-shakeable entry points", renamed `stackOridinal`→`stackOrdinal`, and removed deprecated worker API types; 0.55.0 moved language namespaces to top level; 0.53.0 deprecated the AMD build ([CHANGELOG](https://raw.githubusercontent.com/microsoft/monaco-editor/main/CHANGELOG.md)). YAML and SQL exist as Monarch definitions with 0.56 entry points `languages/definitions/yaml/register` and `languages/definitions/sql/register` ([typedoc yaml](https://microsoft.github.io/monaco-editor/typedoc/modules/languages_definitions_yaml_register.html), [typedoc sql](https://microsoft.github.io/monaco-editor/typedoc/modules/languages_definitions_sql_register.html)). Diagnostics map cleanly: `editor.setModelMarkers` with `IMarkerData {severity, message, startLineNumber, startColumn, endLineNumber, endColumn, source?, code?, tags?, relatedInformation?}` ([typedoc](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IMarkerData.html)), and line decorations via `IModelDecorationOptions {isWholeLine, className, glyphMarginClassName, linesDecorationsClassName, inlineClassName, hoverMessage, overviewRuler…}` ([typedoc](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IModelDecorationOptions.html)); read-only is `readOnly` (default false), `domReadOnly`, `readOnlyMessage`, and `renderValidationDecorations` (default `editable`) ([typedoc](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IEditorOptions.html)). Reasons it loses on our ACs:

1. **Theming cannot consume our tokens.** Themes are data passed to `editor.defineTheme`/`setTheme`; "Allow CSS variables in themes" (#2427) was closed as not planned, and the reported failure is `Error: Illegal value for token color: var(--color-code-bg)` ([issue 2427](https://github.com/microsoft/monaco-editor/issues/2427)). AC-005 would require generating two hex palettes out of the CSS custom properties and keeping them in sync by hand — a second source of truth for contrast. CodeMirror reads the tokens directly.
2. **Tab is trapped by default.** The accessibility guide says "You can toggle the trapping of Tab with Ctrl+M on Windows and Linux and with Ctrl+Shift+M on OSX" ([accessibility guide](https://github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide)); AC-176 wants every action keyboard-reachable, and CodeMirror's default is the WCAG-aligned one ([tab example](https://raw.githubusercontent.com/codemirror/website/main/site/examples/tab/index.md)).
3. **Payload.** The published package is 97,911,464 bytes over 1,909 files ([registry](https://registry.npmjs.org/monaco-editor/latest)); the all-features minified core chunk is `min/vs/editor-KLE6jdfb.js` at 2,389,392 bytes plus `editor/editor.main.css` at 350,112 bytes ([unpkg meta](https://unpkg.com/monaco-editor@0.56.0/min/vs/?meta)), versus CodeMirror's measured 400 KB min / 135 KB gzip basic setup ([bundling example](https://raw.githubusercontent.com/codemirror/website/main/site/examples/bundle/index.md)). 0.56 tree-shaking narrows this, but the floor is far higher.
4. **Vite needs worker plumbing.** Monaco docs require implementing `MonacoEnvironment.getWorker` (explicitly "NOT the `getWorkerUrl`") with `?worker` imports for `editor.worker` plus json/css/html/ts workers ([integrate-esm.md](https://raw.githubusercontent.com/microsoft/monaco-editor/main/docs/integrate-esm.md)); those land as separate chunks (e.g. `editor.worker` 272,787 bytes, `json.worker` 404,061 bytes minified) ([unpkg meta](https://unpkg.com/monaco-editor@0.56.0/min/vs/assets/?meta)). CodeMirror has no workers and no bundler plugin.
5. **Controlled value is coarser.** `@monaco-editor/react` applies an external `value` change as `executeEdits('', [{range: model.getFullModelRange(), text: value, forceMoveMarkers: true}])` followed by `pushUndoStop()`, and falls back to `setValue(value)` when the editor is read-only ([Editor.tsx](https://raw.githubusercontent.com/suren-atoyan/monaco-react/master/src/Editor/Editor.tsx)) — a whole-document edit per form keystroke plus an undo stop, where CodeMirror dispatches a minimal range change and maps the selection automatically ([transaction.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/transaction.ts)).

Where Monaco is genuinely stronger: documented screen-reader strategy — "The Monaco Editor supports screen readers in the editor using a strategy based on paging the text" ([accessibility guide](https://github.com/microsoft/monaco-editor/wiki/Monaco-Editor-Accessibility-Guide)) — backed by `accessibilitySupport` (default `'auto'`), `accessibilityPageSize` and `ariaLabel` ([typedoc](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor_editor_api.editor.IEditorOptions.html)). CodeMirror's equivalent is native `contenteditable` with `role="textbox"`/`aria-multiline` and `aria-live` announcements ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)); this is the one area where the chosen option is documented less thoroughly, so it needs an explicit NVDA/VoiceOver check during UI work.

## Open questions / unverified

- UNVERIFIED: gzipped size of a Vite production chunk containing Monaco's core + YAML/SQL only. Tried bundlephobia (`monaco-editor@0.56.0` reports 167,387 B / 25,006 B gzip, which cannot be the real editor payload and appears to measure a stub entry — [bundlephobia](https://bundlephobia.com/api/size?package=monaco-editor@0.56.0)) and unpkg/jsDelivr file metadata (raw minified bytes only, no gzip). Only raw minified figures above are trustworthy.
- UNVERIFIED: exact release date of monaco-editor 0.56.0. The GitHub releases listing returned dates inconsistent with the 2026 dev builds on the same page ([releases](https://github.com/microsoft/monaco-editor/releases)); npm's `latest` document carries no `time` field.
- UNVERIFIED: whether the CodeMirror docs site (codemirror.net) is still the canonical docs host after the April 2026 move — three fetches of codemirror.net pages returned nothing, so every CodeMirror claim here comes from package sources on code.haverbeke.berlin or the archived website repo.
- Open question for the user: should the SQL preview (AC-168) reuse `@codemirror/lang-sql`'s `schema` completion with the Cube-generated schema, or stay a plain read-only highlight with no completion? The ACs do not say.

## Addendum 2026-09-27: wrapping, line tints and gutter flags (T482)

*The integration-researcher's report, verbatim, as saved for T482.*

**Versions checked.** These are the installed copies, one of each in the store and pinned in `packages/web/package.json`: `@codemirror/view` **6.43.12**, `@codemirror/state` **6.7.5**, `@codemirror/lint` **6.9.7** and `@codemirror/lang-yaml` **6.1.3**. The registry has since published view 6.43.13 (2026-09-22). Its two fixes are "`coordsAtPos` … non-dominant-direction text" and "`visualLineSide` … now deprecated", and neither touches the APIs below ([CHANGELOG](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/CHANGELOG.md)). T482 needs no new package.

**Source key.** Paths are relative to the repo root, and line numbers are for the versions above.
- `view.d.ts` / `view.js` = `node_modules/.pnpm/@codemirror+view@6.43.12/node_modules/@codemirror/view/dist/index.{d.ts,js}`
- `state.d.ts` / `state.js` = `node_modules/.pnpm/@codemirror+state@6.7.5/node_modules/@codemirror/state/dist/index.{d.ts,js}`
- `lint.js` = `node_modules/.pnpm/@codemirror+lint@6.9.7/node_modules/@codemirror/lint/dist/index.js`
- Reference manual: `https://codemirror.net/docs/ref/`. It loaded on 2026-09-27, as did the examples pages cited below. That answers the earlier open question about codemirror.net: it is still the docs host.

### 1. Soft wrap, switchable at runtime

- **Signature:** `static lineWrapping: Extension;`. The doc comment says it "enables line wrapping in the editor (by setting CSS `white-space` to `pre-wrap` in the content)" (`view.d.ts:1442-1446`; [ref](https://codemirror.net/docs/ref/#view.EditorView^lineWrapping)).
- **What it does:** it is only `EditorView.contentAttributes.of({ "class": "cm-lineWrapping" })` (`view.js:8994`). The base theme then sets `white-space: break-spaces` (with `pre-wrap` as a fallback), `word-break: break-word`, `overflow-wrap: anywhere` and `flex-shrink: 1` (`view.js:6858-6864`). So in 6.43.12 the real value is `break-spaces`, not the `pre-wrap` the comment names.
- **Compartment:** the API is `of(ext: Extension): Extension` and `reconfigure(content: Extension): StateEffect<unknown>` (`state.d.ts:725-748`; [ref](https://codemirror.net/docs/ref/#state.Compartment)). `lineWrapping` is a plain `Extension`, so it can sit in a compartment and be swapped with `[]`. The migration guide uses the same pattern for `tabSize` ([migration](https://codemirror.net/docs/migration)).
- **No manual re-measure is needed.** On every measure the view reads `getComputedStyle(contentDOM).whiteSpace`. If wrapping has turned on or off relative to its height oracle, it refreshes the line heights (`view.js:5374`, `5401-5403`, `5418-5421`, `6333-6337`).

```ts
const wrap = new Compartment();                         // once per editor, not per render
// extensions: wrap.of(wrapOn ? EditorView.lineWrapping : []),
view.dispatch({ effects: wrap.reconfigure(on ? EditorView.lineWrapping : []) });
```

**Gotchas**
- **One compartment per configuration.** Putting the same `Compartment` twice in one configuration throws `RangeError("Duplicate use of compartment in extensions")` (`state.js:1991-1993`).
- **The `view.lineWrapping` getter lags.** It returns `viewState.heightOracle.lineWrapping` (`view.d.ts:1091-1096`, `view.js:8598`), which changes only at the next measure. The measure is scheduled with `requestAnimationFrame` (`view.js:8041-8042`, `8344-8346`). The `cm-lineWrapping` class, by contrast, is written synchronously during `dispatch` by `updateAttrs()` (`view.js:8032`).
- **Unit tests run in jsdom.** `packages/web/vite.config.ts:27` sets `environment: 'jsdom'`, and jsdom does no layout ("returning zeros for many layout-related properties", [jsdom README](https://raw.githubusercontent.com/jsdom/jsdom/main/README.md)). Unit tests should assert that `.cm-content` has the `cm-lineWrapping` class. Wrapped heights need the Playwright e2e.
- **Gutter heights under wrap.** Each gutter element gets `style.height` equal to its line block's height (`view.js:11574-11586`, `11677-11681`). A wrapped line's number, lint dot and any `gutterLineClass` class therefore span the whole wrapped height. The content sits at the top of that span, because the base theme gives `.cm-gutterElement` only `box-sizing` and line numbers only padding and `text-align: right` (`view.js:6978-6986`).

### 2. Tinting whole lines (1-based numbers from React props)

**Signatures**
- `static line(spec: LineDecorationSpec): Decoration`. The spec is `{ attributes?, class?: string /* Shorthand for {attributes: {class: value}} */ }` (`view.d.ts:182-197`, `343-346`; [ref](https://codemirror.net/docs/ref/#view.Decoration^line)).
- `static set(of: Range<Decoration> | readonly Range<Decoration>[], sort?: boolean): DecorationSet` and `static none: DecorationSet` (`view.d.ts:347-356`).
- `static decorations: Facet<DecorationSet | ((view: EditorView) => DecorationSet), …>` (`view.d.ts:1307-1323`).
- `StateField.define<Value>(config: StateFieldSpec<Value>)`, where the spec has `create`, `update(value, tr)` and `provide?: (field) => Extension` (`state.d.ts:611-661`).
- `StateEffect.define<Value = null>(spec?)` (`state.d.ts:836`).
- `Facet.from<T extends Input>(field: StateField<T>): Extension`, with an overload `from<T>(field, get: (value: T) => Input)` (`state.d.ts:586-593`; [ref](https://codemirror.net/docs/ref/#state.Facet.from)).
- `RangeSetBuilder`: `add(from, to, value)` then `finish(): RangeSet<T>`. Ranges "should be added in sorted (by `from` and `value.startSide`) order" (`state.d.ts:1656-1683`).
- `RangeSet.map(changes: ChangeDesc): RangeSet<T>` (`state.d.ts:1580-1583`).
- `Text.line(n: number): Line`, documented as "the (1-based) line number", with `Line.from` as "the start of the line" (`state.d.ts:44-47`, `119-141`).

The pattern follows the [decoration example](https://codemirror.net/examples/decoration/) ("`underlines.map(tr.changes)`", "`provide: f => EditorView.decorations.from(f)`"):

```ts
/** Valid, unique, sorted 1-based line numbers → line-start offsets in `doc`. */
function lineStarts(doc: Text, lines: readonly number[]): number[] {
  return [...new Set(lines)]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= doc.lines)
    .sort((a, b) => a - b)
    .map((n) => doc.line(n).from);
}
const setTinted = StateEffect.define<readonly number[]>();
const tint = Decoration.line({ class: 'wc-yaml-tint' });
const tintField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);                     // positions → new doc
    for (const e of tr.effects)
      if (e.is(setTinted)) {
        const b = new RangeSetBuilder<Decoration>();
        for (const at of lineStarts(tr.newDoc, e.value)) b.add(at, at, tint);
        deco = b.finish();
      }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
// React: useEffect(() => { view.current?.dispatch({ effects: setTinted.of(lines) }); }, [lines]);
```

`tr.newDoc` is the documented cheap way to reach the new document from inside a transaction ("won't force the entire new state to be computed", `state.d.ts:944-952`).

**Gotchas**
- **StateField or ViewPlugin?**
  - Sets provided directly (a field) may affect vertical layout. Sets provided as functions (a plugin) "are called *after* the new viewport has been computed, and thus **must not** introduce block widgets or replacing decorations that cover line breaks" (`view.d.ts:1307-1323`). A plugin that tries throws "Block decorations may not be specified via plugins" (`view.js:2750-2755`).
  - Line decorations are neither of those, so either route works. The field is the right one here: the input arrives as effects from React, and it must map through edits between prop updates.
  - The [zebra example](https://codemirror.net/examples/zebra/) shows the ViewPlugin variant. It rebuilds over `view.visibleRanges` on each doc or viewport change, which suits decorations computable from the view alone.
- **Sorted order is enforced.** `RangeSetBuilder.add` throws `"Ranges must be added sorted by \`from\` position and \`startSide\`"` (`state.js:3510-3513`). `Decoration.set` and `RangeSet.of` also go through a strict builder unless `sort` is `true` (`state.js:3424-3429`, `view.js:293-295`). Hence the sort in `lineStarts`.
- **Stale line numbers throw.** `doc.line(n)` throws `RangeError("Invalid line number …")` when `n < 1` or `n > doc.lines` (`state.js:18-20`). Line numbers from props can be stale against the document, so filter them against `doc.lines`, as `lineStarts` does.
- **Ranges must be zero-length, at the line start.** A line decoration's `range(from, to)` throws "Line decoration ranges must be zero-length" (`view.js:332-335`). A line decoration affects the line's DOM "when positioned at the start of a line" ([decoration example](https://codemirror.net/examples/decoration/)), so always use `doc.line(n).from`.
- **How mapping moves tints between prop updates.**
  - A line decoration is a point with `startSide = -200000000` and `mapMode = TrackBefore` (`view.js:323-339`). Zero-length ranges map with `mapPos(pos, startSide, mapMode)` (`state.js:3108-3112`).
  - `TrackBefore` means "Return null if the character *before* the position is deleted" (`state.d.ts:156-159`). A tint is dropped when its line is joined to the previous one.
  - A negative `assoc` "will move it before insertions at that point" (`state.d.ts:223-226`). Pressing Enter at column 0 of a tinted line leaves the tint on the new empty line. This lasts until the next `setTinted`.
- **Classes merge.** Line-decoration classes are appended to `cm-line` and to one another (`view.js:36-46`, `2855-2866`). `LineDecoration.eq` compares `class` and `attributes` (`view.js:327-331`).
- **Selection visibility.** The `drawSelection` layer is drawn *below* the text (`above: false`, `view.js:9603-9604`; `LayerConfig.above`, `view.d.ts:1777-1781`). YamlEditor installs no `drawSelection` today (see its imports), so the native `::selection` shows. If `drawSelection` is ever added, an opaque `.cm-line` background would hide the selection, so keep the tint translucent. The base theme's own `.cm-activeLine` uses alpha colours (`view.js:6946-6947`).

### 3. Flagging lines in the gutter

**Signatures**
- `abstract class GutterMarker extends RangeValue` has `eq(other)`, `toDOM?(view): Node`, `elementClass: string` ("add CSS classes to the gutter element that contains this marker") and `destroy(dom)` (`view.d.ts:2271-2290`; [ref](https://codemirror.net/docs/ref/#view.GutterMarker)).
- `gutterLineClass: Facet<RangeSet<GutterMarker>, …>` is "used to add a class to all gutter elements for a given line. Markers given to this facet should *only* define an `elementClass`, not a `toDOM` (or the marker will appear in all gutters for the line)" (`view.d.ts:2291-2298`; [ref](https://codemirror.net/docs/ref/#view.gutterLineClass)).
- `lineNumberMarkers: Facet<RangeSet<GutterMarker>, …>` is "used to provide markers to the line number gutter" (`view.d.ts:2385-2388`). A marker with DOM here replaces the number: "markers … which replace the line numbers for affected lines" ([gutter example](https://codemirror.net/examples/gutter/)).
- `gutter(config: GutterConfig): Extension` takes `class`, `markers(view)`, `lineMarker`, `renderEmptyElements` (default false) and `side`. "The order in which the gutters appear is determined by their extension priority" (`view.d.ts:2307-2360`).
- **Marker defaults:** `point = true`, `startSide = endSide = -1`, `mapMode = TrackBefore`, `elementClass = ""`, and `eq()` returns `false` (`view.js:11321-11342`). So place a marker with `marker.range(doc.line(n).from)`.

```ts
const flag = new (class extends GutterMarker { override elementClass = 'wc-yaml-flag'; })(); // singleton
const setFlagged = StateEffect.define<readonly number[]>();
const flagField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    set = set.map(tr.changes);
    for (const e of tr.effects)
      if (e.is(setFlagged)) set = RangeSet.of(lineStarts(tr.newDoc, e.value).map((at) => flag.range(at)));
    return set;
  },
  provide: (f) => gutterLineClass.from(f),   // or lineNumberMarkers.from(f): class on the number column only
});
```

The library's own `highlightActiveLineGutter` follows the same shape: a singleton marker with `elementClass = "cm-activeLineGutter"`, fed to `gutterLineClass` (`view.js:11817-11833`). The [gutter example](https://codemirror.net/examples/gutter/)'s breakpoint field also maps with `set.map(transaction.changes)`, as `lintGutter`'s own marker field does (`lint.js:848-865`).

**Gotchas**
- **How `gutterLineClass` meets `lintGutter()`.**
  - `lintGutter()` is a separate `gutter({class: "cm-gutter-lint", markers: …})`. Its `LintGutterMarker` has a `toDOM` and no `elementClass`, and it does not use `gutterLineClass` (`lint.js:759-776`, `836-847`, `923-925`).
  - `gutterLineClass` markers are appended to *every* gutter's marker list for the line (`view.js:11465-11495`, `11587-11598`). So a flagged line's class lands on the line-number element *and* on the lint-gutter element.
  - The lint gutter also renders an otherwise empty `cm-gutterElement` for a flagged line that has no diagnostic, because the list is non-empty and `renderEmptyElements: false` no longer applies.
  - To style one column only, scope the selector: `.cm-lineNumbers .cm-gutterElement.wc-yaml-flag` (`view.js:6981`, `11773-11776`) or `.cm-gutter-lint …`. Alternatively use `lineNumberMarkers`, which adds the class to the number column only.
- **Never give a class marker a `toDOM`.**
  - The line-number gutter's `lineMarker` returns no number when any other marker has a `toDOM` (`others.some(m => m.toDOM)`, `view.js:11777-11781`). A `toDOM` marker in `gutterLineClass` or `lineNumberMarkers` therefore *hides the line number*, and under `gutterLineClass` it also shows in the lint column.
  - For an icon, either draw it in CSS on the class (the lint gutter draws its dots with CSS `content: url(svg)`, `lint.js:876-896`), or add a dedicated `gutter({ class: 'wc-flag-gutter', markers: v => v.state.field(flagField) })` whose marker defines `toDOM`.
- **DOM churn.** Markers are compared by identity, or by same constructor plus `eq` (`view.js:11325-11327`). Elements re-render their markers when the lists differ (`view.js:11684-11685`, `11732-11739`). Because the default `eq` is `false`, use a singleton marker or implement `eq`.
- **Only rendered lines have gutter elements.** Elements exist only for `viewportLineBlocks` (`view.js:11468`), the same partial-render caveat as the text.
- **Accessibility.** The gutter container is `aria-hidden="true"` (`view.js:11405`), so flags and tints are visual only. The warn bar's text must carry the meaning.

### 4. Scrolling a line to the top of the view

- **Signature:** `static scrollIntoView(pos: number | SelectionRange, options?: { y?: ScrollStrategy; x?: ScrollStrategy; yMargin?: number; xMargin?: number }): StateEffect<unknown>`, with `ScrollStrategy = "nearest" | "start" | "end" | "center"`. `"start"` moves the position "to the top of the view". `yMargin` "Defaults to 5. Must be less than the height of the editor" (`view.d.ts:58`, `1126-1158`; [ref](https://codemirror.net/docs/ref/#view.EditorView^scrollIntoView)).
- **It goes in `effects`,** typed `StateEffect<any> | readonly StateEffect<any>[]` (`state.d.ts:878`), so it can travel with the tint:

```ts
const doc = view.state.doc;
if (n >= 1 && n <= doc.lines)
  view.dispatch({ effects: [setTinted.of(lines),
    EditorView.scrollIntoView(doc.line(n).from, { y: 'start', yMargin: 0 })] });
```

**Gotchas**
- **It is asynchronous.** The effect is stored during `dispatch` (`view.js:8020-8023`) and applied in the next measure (`view.js:8232-8239`), which runs on `requestAnimationFrame` (`view.js:8344-8346`). E2e tests should poll `scrollTop` or the line's position rather than read it right away. While the editor has zero height, the target is held, not dropped (`view.js:8233`).
- **Ancestors can scroll too.**
  - The scroll walks every scrollable ancestor, starting at `.cm-scroller` and stopping at the body or at a `position: fixed|sticky` element. It skips non-overflowing elements (`view.js:540-555`, `624-630`).
  - With `y: 'start'`, the strategy drops to `'nearest'` for ancestors only when an element actually moved the full distance (`view.js:616-621`).
  - For a line near the end of the file, `.cm-scroller` cannot move far enough. The outer pane or page is then also scrolled to put the line at *its* top. This is read from the source, not documented.
  - If that shows up, make sure the editor's own scroller is the scrolling element (see "Scrolling" above), or take over with `EditorView.scrollHandler` (`view.d.ts:1235-1246`).
- **Safe alongside a doc change.** The target is mapped through the transaction's changes and clipped to the document length (`view.js:1348-1357`), so it can ride with a `value` change.
- **The default margin.** `yMargin` defaults to 5 px (`view.js:8680-8683`). Pass `0` for a flush top. `x` stays `'nearest'`, and the gutter's width is already counted as a scroll margin (`view.js:11549-11557`, `3455-3459`).

### 5. Hanging indent while wrapped (added with T482)

Design 03 note 8 draws a wrapped line's later rows under the line's text (`padding-left: Nch; text-indent: -Nch`). This builds only from APIs cited above:
- `Decoration.line` takes `attributes` as well as `class` ("can add DOM attributes to the line starting at the given position", [decoration.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/decoration.ts); `view.d.ts:182-197`). A `style` attribute sets the hang per line.
- The lines' texts are read from the view, so the zebra example's ViewPlugin shape fits: it rebuilds over `view.visibleRanges` on a doc or viewport change ([zebra example](https://codemirror.net/examples/zebra/)). A line decoration from a plugin is allowed, since it is not a block widget or a replace across line breaks (see "StateField or ViewPlugin?" above).
- It sits in the same compartment as `lineWrapping`, so turning wrap off removes both together.
- The base theme's `.cm-line` padding is `0 2px 0 6px`. An inline `padding-left` replaces it, so the style adds the 6 px back: `calc(Nch + 6px)`.
- Checked in a browser by the T482 e2e.

### Open questions / unverified

- Observed in the T482 e2e: for "Show in YAML" on a line that `.cm-scroller` cannot bring to its top (`cubes/orders.yml`, line 19 of 41), the scroller stops at its end and the line is in view. The Model pane does not scroll, so nothing spills over.
- UNVERIFIED as an observed behaviour: the ancestor-scroll spill for `y: 'start'` near the end of the document. It is inferred from reading `scrollRectIntoView` (`view.js:540-631`) and has not been seen in a browser. The T482 e2e should cover "Show in YAML" on the file's last lines.
- **Frontmatter:** no new packages. `@codemirror/view`, `@codemirror/state` and `@codemirror/lint` are already in `packages:`. The pinned versions above match `packages/web/package.json`. The reference manual and example URLs could be added to `sources:`.

## Addendum 2026-10-01: the SQL runner's editor (T535, design 15's P2 and Q1)

Read in the installed packages: `@codemirror/commands` 6.11.1, `@codemirror/view` 6.43.12 and `@codemirror/state` 6.7.5, as `packages/web/package.json` pins them. No new package.

- **⌘/Ctrl+Enter is taken by the default keymap.** `defaultKeymap` binds `Mod-Enter` to `insertBlankLine` (`@codemirror/commands/dist/index.js:1806`). So the editor's own `Mod-Enter`, which runs the SQL, is given at `Prec.highest`, ahead of it ([Prec](https://codemirror.net/docs/ref/#state.Prec)). `Mod` is Cmd on a Mac and Ctrl elsewhere ([keymap](https://codemirror.net/docs/ref/#view.keymap)).
- **The selection's text:** `state.selection.main` and `state.sliceDoc(from, to)`. An `updateListener` sees `update.selectionSet` when the selection moves ([ViewUpdate](https://codemirror.net/docs/ref/#view.ViewUpdate)).
- **A name put in at the cursor** (T539): `state.replaceSelection(text)` replaces the selection, or inserts at the cursor, and places the cursor after it (`@codemirror/state/dist/index.js:2639`; [EditorState.replaceSelection](https://codemirror.net/docs/ref/#state.EditorState.replaceSelection)).
- **The empty editor's hint:** `placeholder(text)` from `@codemirror/view` (`dist/index.js:10102`; [placeholder](https://codemirror.net/docs/ref/#view.placeholder)).
- **Testing a key in jsdom:** `runScopeHandlers(view, event, 'editor')` runs the keymap's handlers for a `KeyboardEvent`, and says whether one took it (`dist/index.js:9113`; [runScopeHandlers](https://codemirror.net/docs/ref/#view.runScopeHandlers)). jsdom's `navigator.platform` isn't a Mac's, so `Mod` there is Ctrl.

Sources:
- https://codemirror.net/docs/ref/
- https://codemirror.net/examples/decoration/
- https://codemirror.net/examples/gutter/
- https://codemirror.net/examples/zebra/
- https://codemirror.net/docs/migration
- https://code.haverbeke.berlin/codemirror/view/raw/branch/main/CHANGELOG.md
- https://raw.githubusercontent.com/jsdom/jsdom/main/README.md
