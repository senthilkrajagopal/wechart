# Finished tasks' notes: P2.26, the Text tile, dashboard parameters and AI summaries (lane TEXT)

Lane TEXT's ticked tasks from `docs/tasks.md` §P2.26 (F45–F48), their sub-lines word for word, kept apart from `tasks-done.md` while the lanes run in parallel. Each task keeps its one line in `docs/tasks.md`.

- [x] T868 [P] (AC-513, AC-518) The Text tile's stored document: wechart's own schema and version, with its nodes, marks and attributes, link checks and element count
  - Files: `packages/core/src/text-document.ts` (+ test), `packages/core/src/index.ts`.
  - Failing test: `text-document.test.ts`: a document of paragraphs, three heading levels, a Large value, bold, italic, both lists, a link to `https://` and one to a wechart dashboard, and one element of each kind passes `textDocumentProblems`; it refuses an unknown node, an unknown mark, an attribute not declared (`onclick`, `style`, `class`), a `javascript:`, `data:` or `vbscript:` link, and 11 elements, each named; `elementsOf` counts live elements, controls and buttons (AC-513, AC-518).
  - Depends on: none

- [x] T869 (AC-512, AC-116) Convert wechart's markdown subset and its `{{…}}` tokens into a Text document, an HTML tag kept as literal text
  - Files: `packages/core/src/text-document-from-markdown.ts` (+ test), `packages/core/src/text-tokens.ts`.
  - Failing test: `text-document-from-markdown.test.ts`: every case in `packages/web/src/tiles/Markdown.test.tsx` gives a document whose text, heading levels, lists, links and line breaks match; `{{measure:orders.revenue | marking:Marking}}` becomes a Value limited by Marking; `<b>hi</b>` stays the literal text "<b>hi</b>"; the result passes `textDocumentProblems` (AC-512, AC-116).
  - Depends on: T868

- [x] T870 (AC-527) Write a Text document back as markdown, each element as a `{{…}}` token naming its kind and source
  - Files: `packages/core/src/text-document-to-markdown.ts` (+ test).
  - Failing test: `text-document-to-markdown.test.ts`: a document of every block, mark and element kind writes markdown whose tokens name each element's kind and source (`{{change:orders.revenue | vs:previous_period}}`, `{{filter-control:country}}`, `{{button:Go to Detail}}`), and converting that markdown back (T869) gives the same text and the same elements for the kinds markdown tiles had (AC-527).
  - Depends on: T869

- [x] T871 (AC-513, AC-518) Refuse with 400, naming the tile, a dashboard save holding a Text tile that fails the schema or holds more than 10 elements
  - Files: `packages/api/src/repos/documents.ts`, `packages/api/src/routes/text-tiles.test.ts`.
  - Failing test: `text-tiles.test.ts`: saving a dashboard whose Text tile holds `{"type":"image","attrs":{"src":"x","onerror":"alert(1)"}}`, a `javascript:` link or 11 elements answers 400 naming the tile, and nothing is stored; a valid document saves; a tile still in markdown saves and is read back unchanged (AC-513, AC-518).
  - Depends on: T868

- [x] T872 (AC-512) Bind at publish, and rename on copy, the members a Text tile's elements name
  - Files: `packages/api/src/model/bind.ts`, `packages/core/src/text-document.ts` (`textDocumentMembers`, `textDocumentRenamed`), `packages/api/src/routes/text-tile-binding.test.ts`.
  - Failing test: `text-tile-binding.test.ts`: publishing a dashboard whose only reference to `orders` is a Text tile's Value binds `orders`, and one naming a cube off its path is refused naming it, as for a token (AC-272); a copy into My workspace renames the element's member as it renamed tokens (AC-512).
  - Depends on: T869

- [x] T873 (AC-208, AC-513) Read mode: render a Text tile through Tiptap's JSON static renderer into React elements, with wechart's own link check
  - Files: `packages/web/package.json` (the `@tiptap/*` packages at 3.32.0), `packages/web/src/tiles/text/TextTile.tsx` (+ test), `packages/web/src/tiles/text/readMapping.tsx`, `packages/web/src/tiles/text/SafeLink.tsx` (+ test).
  - Failing test: `TextTile.test.tsx`: headings render as `h3`, `h4` and `h5` at `text-xl`, `text-lg` and `text-md` (levels 1, 2 and 3; a converted markdown tile's levels are by rank, so its lone `##` is level 1 and `h3`: decision T869-1), Large value at 32/40 tabular, lists as `ul` and `ol`, bold as `strong`; no element under the tile has `innerHTML` set from data (a document holding the text "<b>x</b>" renders that text); `SafeLink.test.tsx`: `javascript:alert(1)` renders as plain text with no `href`, `https://` and a dashboard link as links (AC-208, AC-513).
  - Depends on: T868

- [x] T874 (AC-058) The `text` tile kind, and the Text element in Add in place of Markdown, inserting an empty Text tile
  - Files: `packages/web/src/dashboard/model/document.ts` (+ test), `packages/web/src/dashboard/edit/AddPanel.tsx`, `packages/web/src/dashboard/edit/templates.ts` (+ test), `packages/web/src/dashboard/model/insert.ts`, `packages/web/src/dashboard/edit/Outline.tsx`.
  - Failing test: `templates.test.ts`: Add's elements are chart, chart from folders, section, tab group, text, header, divider, image, link and filter, with no markdown; inserting Text after the selection adds a `text` tile with an empty document; `document.test.ts`: `TILE_KINDS` holds `text` and a new dashboard's tiles are never `markdown` (AC-058).
  - Depends on: T873

- [x] T875 (AC-512) A markdown tile shown as a Text tile, converted on open, and stored as a document on the next save
  - Files: `packages/web/src/dashboard/model/document.ts`, `packages/web/src/dashboard/model/stored.ts` (+ test), `packages/web/src/dashboard/DashboardView.tsx`, `packages/web/src/tiles/Markdown.tsx` (removed with its test, whose cases move to T869's), `e2e/text-tile.spec.ts`.
  - Failing test: `stored.test.ts`: a stored `markdown` tile reads as a `text` tile whose document equals T869's conversion; saving writes `kind: "text"` and the document; the e2e: a seeded markdown tile with "## Marked share" and two tokens shows the same heading, text and values before and after a save, and the saved body holds no markdown (AC-512); a tile of 12 tokens converts with all 12 live, and in edit mode shows "12 / 10 elements" in the warning state with Save held, "Remove 2 live values to save" (decision T875-1).
  - Depends on: T869, T874
