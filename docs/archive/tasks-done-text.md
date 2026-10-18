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
