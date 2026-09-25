---
library: CodeMirror merge view
packages: [@codemirror/merge]
version: 6.12.2
researched: 2026-09-25
sources: [https://registry.npmjs.org/@codemirror/merge/latest, https://registry.npmjs.org/@codemirror/merge, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/CHANGELOG.md, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/README.md, https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts, https://unpkg.com/@codemirror/merge@6.12.2/dist/index.js, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/unified.ts, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/deco.ts, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/diff.ts, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/chunk.ts, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/merge.ts, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/theme.ts, https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/index.ts, https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/gutter.ts, https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts, https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/state.ts, https://code.haverbeke.berlin/codemirror/dev/issues/1756, https://codemirror.net/docs/ref/#merge]
---

# CodeMirror merge view (@codemirror/merge) 6.12.2

## Summary

`@codemirror/merge` is CodeMirror 6's diff package. "This package implements a merge interface for the CodeMirror code editor" ([README](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/README.md)). It offers two views:
- **`MergeView`**: two editors side by side.
- **`unifiedMergeView`**: an extension that shows the diff inside one editor. The docs say "Changed chunks will be highlighted, with uneditable widgets displaying the original text displayed above the new text" ([index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts); [Context7 /websites/codemirror_net → codemirror.net/docs/ref](https://codemirror.net/docs/ref/#merge)).

wechart would use it for **`YamlDiff`** (direction §8), in two places:
- **Review view (rule 77, AC-287).** A read-only, unified YAML diff of a proposed model file against the folder's current file.
- **History (rule 80, AC-289).** "Compare with current" reuses the same component ([references.md › Phase 2 › surfaces 6–7](/Users/srajagopal/Work/wechart/docs/design/references.md)).

It fits the stack because it is an extension on the editor the model editor already uses (see `code-editor.md`). Our YAML language, `lineNumbers()`, the IBM Plex Mono theme and the token-driven highlight style all apply to the diff unchanged.

It does not meet rule 3 (never by colour alone) or rule 2 (AA contrast) on its own:
- The default styling marks changes by colour only. Deleted text gets `textDecoration: "none"`, and line tints are 8 %-alpha backgrounds ([theme.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/theme.ts)).
- So the +/− markers and the colours must come from our theme. See "Styling hooks" below.

## Install

```
pnpm --filter @wechart/web add @codemirror/merge@6.12.2
```

**Package facts**
- **Version:** 6.12.2 is `latest`, published 2026-06-09T07:58:41Z. Earlier releases: 6.12.1 on 2026-03-11, 6.12.0 on 2026-02-15, 6.11.2 on 2025-11-07 ([registry](https://registry.npmjs.org/@codemirror/merge)).
- **License:** MIT ([registry](https://registry.npmjs.org/@codemirror/merge/latest)).
- **Module format:** `"type": "module"`, with `exports` `import: ./dist/index.js` and `require: ./dist/index.cjs` ([registry](https://registry.npmjs.org/@codemirror/merge/latest)). Vite needs no configuration.
- **Dependencies:** `@codemirror/view ^6.17.0`, `@codemirror/state ^6.0.0`, `@codemirror/language ^6.0.0`, `@lezer/highlight ^1.0.0`, `style-mod ^4.1.0`. There are **no peerDependencies** ([registry](https://registry.npmjs.org/@codemirror/merge/latest)).

**Compatibility with our pins**
- view 6.43.12, state 6.7.5, language 6.12.4 and `@lezer/highlight` 1.2.3 all satisfy these ranges.
- `@codemirror/view` 6.43.12 depends on `style-mod ^4.1.0`, the same range ([registry](https://registry.npmjs.org/@codemirror/view/6.43.12)), so one copy serves both.
- APIs from `@codemirror/view` this doc relies on, and when they arrived:
  - `lineNumberWidgetMarker`: 6.31.0 (2024-08-11).
  - gutter `widgetMarker`: 6.11.0 (2023-05-03).
  - Both are in 6.43.12 ([view CHANGELOG](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/CHANGELOG.md)).
- The deps are regular dependencies, not peers. After installing, confirm that `pnpm why @codemirror/state` and `pnpm why @codemirror/view` each show a single version. `code-editor.md` › Gotchas already records that two copies of state "break extensions silently".

**Maintenance**
- The maintainer is Marijn Haverbeke ([registry](https://registry.npmjs.org/@codemirror/merge)).
- Since 2025-10 there have been six releases, including a new `DiffConfig.override` in 6.12.0 ([CHANGELOG](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/CHANGELOG.md)).
- The GitHub repo "was archived by the owner on Apr 15, 2026" and "has moved to https://code.haverbeke.berlin/codemirror/merge" ([github.com/codemirror/merge](https://github.com/codemirror/merge)).
- Issues are tracked at [code.haverbeke.berlin/codemirror/dev/issues](https://code.haverbeke.berlin/codemirror/dev/issues?q=merge&type=all&state=all). The maintainer answered issue #1756, opened 2026-09-17, within the month ([#1756](https://code.haverbeke.berlin/codemirror/dev/issues/1756)).

**Bundle size**
- Bundlephobia (a third-party measuring service, not a primary source) gives 271,320 B minified / 86,880 B gzip for the package *with* its dependencies. Of that, `@codemirror/merge` itself is ≈58,602 B minified; the rest (view, state, language, lezer) is already in our bundle ([bundlephobia](https://bundlephobia.com/api/size?package=@codemirror/merge@6.12.2)).
- The published unminified ESM file `dist/index.js` is 71,734 B ([unpkg meta](https://unpkg.com/@codemirror/merge@6.12.2/dist/?meta)).
- The gzip size of the merge-only share is UNVERIFIED (see the end of this doc).

## Init / auth pattern

There is no auth. The unified view is an ordinary `EditorView` with one more extension, so the React effect, ref and `destroy()` pattern in `code-editor.md` applies unchanged.

The upstream minimal example ([README](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/README.md)):

```js
const view = new EditorView({
  parent: document.body,
  doc: "one\ntwo\nthree\nfour",
  extensions: [basicSetup, unifiedMergeView({original: "one\n...\nfour"})]
})
```

For wechart the **editor's document is the proposed file (B)** and `original` is the folder's current file (A). The sketch below is ours, assembled from the cited APIs:

```ts
import {EditorState} from "@codemirror/state"
import {EditorView, lineNumbers, keymap} from "@codemirror/view"
import {yaml} from "@codemirror/lang-yaml"
import {unifiedMergeView, goToNextChunk, goToPreviousChunk} from "@codemirror/merge"

function yamlDiffState(current: string, proposed: string, collapse: boolean): EditorState {
  return EditorState.create({
    doc: proposed,
    extensions: [
      lineNumbers(),
      yaml(),
      EditorState.readOnly.of(true),        // blocks typing, paste, drop and cut; sets aria-readonly
      // EditorView.editable is left at its default (true) so the diff can take focus
      EditorView.contentAttributes.of({"aria-label": "<label: open question>"}),
      keymap.of([/* keys undecided */ {key: "<next>", run: goToNextChunk},
                 {key: "<prev>", run: goToPreviousChunk}]),
      unifiedMergeView({
        original: current,
        mergeControls: false,               // no Accept/Reject buttons
        ...(collapse ? {collapseUnchanged: {}} : {}),   // margin 3, minSize 4 by default
      }),
      wcDiffTheme,                          // our EditorView.theme, see Styling hooks
      wcHighlightStyle,                     // existing token highlight style (code-editor.md)
    ],
  })
}
```

To switch to another proposal or file, call `view.setState(yamlDiffState(...))` or recreate the view. For a read-only diff this is simpler than mutating both documents. In-place updates are still possible with `originalDocChangeEffect` or `updateOriginalDoc` plus a doc change, fixed for single transactions that change both documents in 6.10.2 ([CHANGELOG](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/CHANGELOG.md)). A bug where reconfiguring `unifiedMergeView` in a Compartment did not update `original` was fixed in `@codemirror/state` 6.5.2 ([#1515](https://code.haverbeke.berlin/codemirror/dev/issues/1515), [state CHANGELOG](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/CHANGELOG.md)); our 6.7.5 is later.

## API surface we will use

### `unifiedMergeView(config: UnifiedMergeConfig): (Extension | StateField<DecorationSet>)[]`

Signature from [index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts). The options:

| Option | Type | Doc (quoted) and default |
| --- | --- | --- |
| `original` | `Text \| string` | "The other document to compare the editor content with." A string is split with `/\r?\n/` ([dist](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.js)). |
| `mergeControls` | `boolean \| ((type: "reject" \| "accept", action: (e: MouseEvent) => void) => HTMLElement)` | "Controls whether accept/reject buttons are displayed for each changed chunk. Defaults to true." Buttons render only `if (mergeControls)`, with no check of `readOnly` or `editable` ([unified.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/unified.ts)), so **read-only does not hide them. Pass `false`.** |
| `collapseUnchanged` | `{margin?: number, minSize?: number}` | "long stretches of unchanged text are collapsed. `margin` … (default is 3), and `minSize` … (defaults to 4)." Available in the unified view since 6.7.0 ([CHANGELOG](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/CHANGELOG.md)). |
| `gutter` | `boolean` | "Controls whether a gutter marker is shown next to changed lines." Default on. |
| `highlightChanges` | `boolean` | "the merge view will mark inserted and deleted text in changed chunks." Default on. |
| `syntaxHighlightDeletions` | `boolean` | Deleted chunks are "highlighted using the main editor's language… this doesn't always work well." Default on. The deleted text is parsed with `lang.parser.parse(text)` ([unified.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/unified.ts)). |
| `syntaxHighlightDeletionsMaxLength` | `number` | Documented as "Defaults to 3000", but **ignored**; see Gotchas. |
| `allowInlineDiffs` | `boolean` | "(off by default) chunks that look like they contain only inline changes will have the changes displayed inline." Keep it off: inline mode drops the deleted-line widget, and with it the per-line "−" row. |
| `diffConfig` | `DiffConfig` | "By default, the merge view sets `scanLimit` to 500." |

Sources: the [index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts) doc comments, unless another link is given in the row.

### Other exports

**State helpers**
- `getOriginalDoc(state): Text`: "Get the original document from a unified merge editor's state."
- `originalDocChangeEffect(state, changes: ChangeSet)` and `updateOriginalDoc`: effects that "update the original document that's being compared against."
- `uncollapseUnchanged: StateEffectType<number>`: "expands the section of collapsed unchanged code starting at the given position."

Source for all three: [index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts).

**Chunk navigation**
- `goToNextChunk` and `goToPreviousChunk` are `StateCommand`s: "Move the selection to the next/previous changed chunk" ([index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts)).
- They set `selection: {anchor: from}`, `userEvent: "select.byChunk"` and `EditorView.scrollIntoView(...)`, and wrap around at either end (`% chunks.length`) ([merge.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/merge.ts)).
- **The package installs no keymap** ([merge.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/merge.ts), [unified.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/unified.ts)). We bind the keys ourselves.
- A `StateCommand` is the "Subtype of `Command` that doesn't require access to the actual editor view. Mostly useful to define commands that can be run and tested outside of a browser environment" ([state extension.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/extension.ts)).

**Reading chunks**
- `getChunks(state): {chunks: readonly Chunk[], side: "a"|"b"|null} | null` returns `null` "if the editor doesn't have a merge extension active or hasn't finished initializing yet" ([merge.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/merge.ts)).

**Split view (not the design's choice)**
- `MergeView({a, b, parent?, root?, orientation?, revertControls?, renderRevertControl?, highlightChanges?, gutter?, collapseUnchanged?, diffConfig?})` has `.a`, `.b`, `.dom`, `.chunks`, `reconfigure()` and `destroy()` ([index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts)).
- Read-only there means `EditorView.editable.of(false)` and `EditorState.readOnly.of(true)` in each side's config ([README](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/README.md)).
- `mergeViewSiblings(view)` finds the other editor ([index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts)).

### DOM produced by the unified view

Sources: [deco.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/deco.ts), [unified.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/unified.ts), [dist](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.js).

**Editor wrapper:** gets class `cm-merge-b`.

**Added and changed lines (document B, real editor content)**
- Every line of a chunk gets a line decoration, `Decoration.line({class: "cm-changedLine"})`.
- The chunk's whole range is wrapped in `Decoration.mark({tagName: "ins", class: "cm-insertedLine"})`, so it renders as `<ins>`.
- With `highlightChanges` on, the changed spans inside it get `Decoration.mark({class: "cm-changedText"})`.

**Deleted lines (from A, shown as a widget)**
- They render as `Decoration.widget({block: true, side: -1, widget: new DeletionWidget(...)})` placed before the chunk.
- DOM structure: `div.cm-deletedChunk`, with `div.cm-chunkButtons` only when `mergeControls` is on.
- Then one `div.cm-deletedLine > del` **per deleted line**. That structure was introduced after [#1484](https://code.haverbeke.berlin/codemirror/dev/issues/1484).
- Inside each line: syntax `span`s, with changed text as `span.cm-deletedText`. An empty line gets a `<br>`.
- CodeMirror sets `contentEditable = "false"` on the DOM of a non-editable widget ([view tile.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/tile.ts)).

**Change gutter:** `Prec.low(gutter({class: "cm-changeGutter", …, widgetMarker: … DeletionWidget ? deletedChunkGutterMarker : null}))`.
- Each changed B line gets a marker with `elementClass = "cm-changedLineGutter"`.
- Each deletion widget gets **one** gutter element with class `cm-deletedLineGutter`.
- Both markers are empty; they carry a class only.

**Collapsed region:** `Decoration.replace({widget: new CollapseWidget(lines), block: true})`.
- It renders `div.cm-collapsedLines`, whose text is `view.state.phrase("$ unchanged lines", n)`.
- A **`click`** listener dispatches `uncollapseUnchanged.of(pos)`.
- It sets no tabindex, role or aria attribute ([deco.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/deco.ts)).

### Styling hooks for +/−, colour and themes

**Default theme values** ([theme.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/theme.ts)). Each of these must be overridden with our tokens:

| Selector | Default |
| --- | --- |
| `&.cm-merge-b .cm-changedLine` | `rgba(100,160,128,.08)` background |
| `.cm-deletedChunk` | `rgba(160,128,100,.08)` background, `paddingLeft: 6px` |
| `.cm-insertedLine, .cm-deletedLine, .cm-deletedLine del` | `textDecoration: "none"` |
| `&.cm-merge-b .cm-deletedText` | `#ff000033` background |
| `.cm-changedText` | a 2 px gradient underline; `&light` `#22bb22aa`, `&dark` `#88ff88aa` |
| `.cm-changeGutter` | `width: 3px` |
| `.cm-changedLineGutter` | `&light` `#2b2`, `&dark` `#8f8` |
| `.cm-deletedLineGutter` | `&light` `#e43`, `&dark` `#fa9` |
| `.cm-collapsedLines` | `&light` `#444` text on a `#f3f3f3` gradient, `&dark` `#ddd` on `#222`; `⦚` added through `:before`/`:after` |

**Theme precedence**
- `baseTheme` is registered at `Prec.lowest`, and `&dark`/`&light` "only target editors with a dark or light theme" ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)).
- Put our overrides in an `EditorView.theme`. In it, use `var(--wc-…)` tokens, which work in both themes with the `data-theme` swap described in `code-editor.md`.
- Without `EditorView.darkTheme` set, only the package's `&light` defaults fire. That is harmless once every colour above is overridden.

**Marking +/− without relying on colour (rule 3).** These are options; none is decided:
- **Deleted lines:** `.cm-deletedLine::before { content: "−" }`. This is inside the widget, not in document content.
- **Added lines, in the gutter:** `.cm-changedLineGutter::before { content: "+" }`, with the gutter widened from 3 px. There is one gutter element per changed B line.
- **Added lines, in the content:** a `::before` on `.cm-changedLine`. That sits inside editable content; its effect on caret measurement is UNVERIFIED.
- **Custom gutter:** a `gutter({lineMarker, widgetMarker})` of our own. `lineMarker` "Can be used to optionally add a single marker to every line"; `widgetMarker` "Associate[s] markers with block widgets" ([gutter.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/gutter.ts)).
- **Limit:** a deleted chunk can have only **one** gutter marker. The maintainer: "Only actual editor content is addressable with the position system, and thus with individual gutter markers" ([#1484](https://code.haverbeke.berlin/codemirror/dev/issues/1484)).

**Line numbers**
- `lineNumbers()` numbers only the B (proposed) lines. Deleted lines get no number unless we supply a `lineNumberWidgetMarker`, typed `Facet<(view, widget: WidgetType, block: BlockInfo) => GutterMarker | null>`: "Facet used to create markers in the line number gutter next to widgets" ([gutter.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/gutter.ts)).
- Only one marker is allowed per widget. Showing A's line numbers per deleted line would need a marker whose DOM stacks n numbers; that rendering is UNVERIFIED.

**Collapsed-bar text:** reword it with `EditorState.phrases.of({"$ unchanged lines": "…"})`. "A single `$` is equivalent to `$1`" ([state.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/state.ts)). The maintainer says "The text is configurable via `phrases`" ([#1467](https://code.haverbeke.berlin/codemirror/dev/issues/1467)).

### Diffing without a view (tests, changed-line counts)

**Algorithm**
- "Implementation of Myers 1986 'An O(ND) Difference Algorithm and Its Variations'", on characters.
- It trims the common prefix and suffix first, then bisects ([diff.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/diff.ts)).
- `presentableDiff` cleans the result up "by dropping short unchanged ranges, and aligning changes to word boundaries when appropriate" ([index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts)).
- `Chunk.build` runs `presentableDiff(a.toString(), b.toString(), conf)` and groups the changes into line-aligned chunks ([chunk.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/chunk.ts)).

**Pure functions** (no DOM needed) ([index.d.ts](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.d.ts), [chunk.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/chunk.ts)):
- `diff(a: string, b: string, config?: DiffConfig): readonly Change[]`. A `Change` has `fromA`, `toA`, `fromB`, `toB`.
- `presentableDiff(a, b, config?)`, with the same signature.
- `Chunk.build(a: Text, b: Text, conf?: DiffConfig): readonly Chunk[]`. It needs only `@codemirror/state` `Text`.

**`Chunk` fields**
- `fromA`/`toA`: "`toA` … is equal to `fromA` when the chunk covers no lines in document A, or is one unit past the end of the last line".
- `fromB`/`toB`: `toB`'s doc comment says "document A", which reads as a typo.
- `changes` are "stored relative to the start of the chunk".
- `precise` "is set to false when the diff … fell back to fast, imprecise diffing".
- `endA`/`endB` give "the end of the last line in the chunk".

**`DiffConfig`**
- `scanLimit`: falls back to "a faster but less precise approach when there is more than this many changed characters".
- `timeout`, in ms: "aborts detailed diffing".
- `override: (a, b) => readonly Change[]`: "Provide your own diff algorithm". Added in 6.12.0 ([CHANGELOG](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/CHANGELOG.md)).

**Counting changed lines in a test** (our sketch, built from these semantics):
- Call `Chunk.build(Text.of(cur.split("\n")), Text.of(prop.split("\n")), {scanLimit: 500})`.
- Removed lines per chunk: 0 when `fromA == toA`. Otherwise `a.lineAt(endA).number - a.lineAt(fromA).number + 1`. Added lines likewise on B.
- `Text.of` throws `RangeError("A document must have at least one line")` for an empty array ([text.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/text.ts)). `"".split("\n")` gives `[""]`, which is fine.
- Pass `{scanLimit: 500}` explicitly. The view's `defaultDiffConfig = {scanLimit: 500}` ([chunk.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/chunk.ts)) is not exported ([index.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/index.ts)). With no config, `diff` uses `1e9` ([diff.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/diff.ts)), so the chunks in a test could differ from the ones on screen.
- `goToNextChunk` can be unit-tested against a plain `{state, dispatch}` because it is a `StateCommand`.

## Gotchas

- **Accept/Reject buttons show by default, even when read-only.** Set `mergeControls: false` ([unified.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/unified.ts)).

- **Colour-only by default.** There is no strikethrough and no +/−, and the line tints are 8 % alpha ([theme.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/theme.ts)). Rules 2 and 3 are met only by our theme. Any tint we add behind code text must be audited with the text tokens it sits under.

- **`syntaxHighlightDeletionsMaxLength` is ignored in 6.12.2.**
  - `unifiedMergeView` passes a hard-coded `syntaxHighlightDeletionsMaxLength: 3000` to `mergeConfig` ([dist](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.js)).
  - It is compared as `chunk.toA - chunk.fromA <= syntaxHighlightDeletionsMaxLength`.
  - So deleted blocks longer than 3,000 characters always render unhighlighted, whatever the option says.

- **Large files: fallbacks in the diff.** With the view's `scanLimit: 500`, `diff` stores `scanLimit = 500 >> 1 = 250` ([dist](https://unpkg.com/@codemirror/merge@6.12.2/dist/index.js)). Then `findSnake` ([diff.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/diff.ts)) does this:
  - When the unmatched range, after trimming the shared prefix and suffix, has `Math.min(lenA, lenB) > scanLimit * 16` (4,000 characters), it switches to `crudeMatch`, a substring-anchor heuristic, and sets `precise = false`.
  - When `min > scanLimit * 64` (16,000 characters), it returns **the whole range as one change**.
  - It also falls back when the search depth exceeds 250.

  The numbers are our reading of the source. In practice, a model rewritten or re-ordered throughout, larger than about 16 KB on both sides, could show as one big delete-plus-insert block. `diffConfig: {scanLimit, timeout}` or `DiffConfig.override` change this. Choosing values is a product decision; none is set here.

- **Large deletions build DOM eagerly.** Open issue [#1756](https://code.haverbeke.berlin/codemirror/dev/issues/1756) (2026-09-17):
  - The report: the renderer "creates a `.cm-deletedLine` wrapper and a `<del>` element for every deleted line". A 10,000-line deletion made 20,000 elements, outside the viewport too.
  - The maintainer floated "a configurable cut-off in deleted block size". There is no fix yet.
  - Deleting a whole large model file is the worst case for us.

- **Collapsed regions can't be expanded from the keyboard.** The bar is a `div` with only a `click` listener, and no tabindex or role ([deco.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/deco.ts)). If we use `collapseUnchanged`, we need a keyboard path of our own:
  - a command that dispatches `uncollapseUnchanged.of(pos)`, or
  - a control outside the editor that rebuilds the state without `collapseUnchanged`.

  The maintainer declined to build partial uncollapse into the package and pointed to the exported effect instead ([discuss, 2025-10](https://discuss.codemirror.net/t/custom-uncollapse-behavior-in-codemirror-merge/9526), a forum post).

- **Focus: keep `editable` true and use `readOnly`.**
  - `EditorState.readOnly` is "Not to be confused with `EditorView.editable`, which controls whether the editor's DOM is set to be editable (and thus focusable)" ([state.ts](https://code.haverbeke.berlin/codemirror/state/raw/branch/main/src/state.ts)).
  - The content element gets `contenteditable: !editable ? "false" : "true"` and no tabindex ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)).
  - So with `editable: false` the diff cannot take focus, and chunk-navigation keys never fire.
  - With `editable` true and `readOnly` true:
    - typed DOM changes are ignored: "Ignore changes when the editor is read-only" ([domchange.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/domchange.ts));
    - paste and drop are blocked, and cut doesn't delete ([input.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/input.ts));
    - the element carries `aria-readonly="true"` ([editorview.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/editorview.ts)).
  - **Correction to `code-editor.md`:** its advice that `editable: false` keeps text "screen-reader navigable" needs revisiting for any view that needs keyboard focus.

- **Copy leaves out deleted lines.** Copy takes text from `state.sliceDoc` over the selection ([input.ts](https://code.haverbeke.berlin/codemirror/view/raw/branch/main/src/input.ts)), and deleted lines are widgets, not document text. Copying from the diff therefore yields proposed text only.

- **Deleted text is not addressable.** Deleted lines are not in the document: no cursor, selection or per-line gutter marker can reach them ([#1484](https://code.haverbeke.berlin/codemirror/dev/issues/1484)).

- **Diff shape differs from `git diff`.** The diff is character-level, then aligned to lines. Line-boundary alignment bugs were fixed in 6.7.4 ([#1466](https://code.haverbeke.berlin/codemirror/dev/issues/1466)), and the maintainer notes "there are often multiple valid diffs for a given pair of documents". To match `git diff` exactly would take `DiffConfig.override`.

- **Recent regressions, all fixed in the pinned version:**
  - 6.12.0 crashed with "Ranges must be added sorted by `from`", fixed in 6.12.1 ([#1680](https://code.haverbeke.berlin/codemirror/dev/issues/1680)).
  - 6.12.1 fixed duplicated chunks at document start.
  - 6.11.2 fixed dropped chunks at document end.

  Sources for the last two: the [CHANGELOG](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/CHANGELOG.md).

- **Split view only: height.** `MergeView` forces `height: auto !important` on its scrollers ([theme.ts](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/src/theme.ts)). The unified view has no `cm-mergeView` wrapper, so the scroll setup in `code-editor.md` applies.

- **Tests see only the viewport.** As `code-editor.md` notes, only viewport lines render. Assert chunk contents through `getChunks(view.state)` and `getOriginalDoc`, not through `querySelectorAll`.

## Alternatives considered

A cross-library comparison was not requested. Within the package:
- **`MergeView` (split)** is the alternative to `unifiedMergeView`.
- The design specifies a **unified** diff ([references.md](/Users/srajagopal/Work/wechart/docs/design/references.md), surface 6).
- The unified view is also a single `EditorView`, so it has a single focus stop, a single `aria-label`, and one reading order for screen readers.

## Open questions / unverified

- **Screen-reader behaviour (UNVERIFIED in our stack).**
  - Deleted lines are real text in `<del>` inside a `contenteditable="false"` block widget. Added lines are wrapped in `<ins>`. This dates from 6.1.0, "to give screen readers a chance to communicate their role" ([CHANGELOG](https://code.haverbeke.berlin/codemirror/merge/raw/branch/main/CHANGELOG.md)).
  - Support for `ins`/`del` varies. A vendor test (Vispero, 2023, a third-party article) reports:
    - NVDA and JAWS convey them.
    - VoiceOver conveys them "on iOS (Not on macOS)".
    - Narrator conveys none ([Vispero](https://vispero.com/resources/screen-readers-support-for-text-level-html-semantics/)).
  - Whether caret-based line reading inside the textbox announces or skips the deleted widget lines was not verified. It needs NVDA and VoiceOver checks during UI work.
- **Line numbers.** Should the diff show A's (current) line numbers beside deleted lines, as a git-style two-column diff does, or only the proposed file's? The design says "line numbers" (surface 6). A stacked `lineNumberWidgetMarker` is untested.
- **History compare direction.** In "Compare with current", which side is `original`: the old version, or the current file? The direction doesn't say (rule 80, surface 7).
- **Keys and label.** The keys for next and previous chunk, and the diff's accessible label, are undecided. The design gives F6 to pane cycling only (surface 6, Keyboard).
- **Collapsing.** Whether to collapse unchanged regions at all, and the wording of the collapsed bar, are design decisions not yet made.
- **Bundle.** UNVERIFIED: the gzip size of `@codemirror/merge`'s own share. Bundlephobia gives only the aggregate gzip, and unpkg gives raw bytes.
- **Content `::before` markers.** UNVERIFIED: whether a `::before` "+" on `.cm-changedLine` inside editable content disturbs caret or coordinate mapping. Prefer the gutter-class or custom-gutter options until a browser test says otherwise.
- **Docs host.** codemirror.net reference pages were reached only through Context7 (`/websites/codemirror_net`). Every signature above was checked against the published `dist/index.d.ts` 6.12.2 and the source on code.haverbeke.berlin.
