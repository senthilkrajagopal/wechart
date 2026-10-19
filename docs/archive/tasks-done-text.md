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

- [x] T876 (AC-302) Edit a Text tile in place on the canvas: double-click, or "Edit text on the canvas" by keyboard; Esc, Tab or a click outside leaves; one Undo takes the whole edit
  - Files: `packages/web/src/tiles/text/TextEditor.tsx` (+ test; loaded with `React.lazy`), `packages/web/src/tiles/text/editorExtensions.ts`, `packages/web/src/dashboard/edit/TileProperties.tsx` (the first control; no markdown textarea), `packages/web/src/dashboard/edit/EditChrome.tsx`, `e2e/text-tile.spec.ts`.
  - Failing test: `TextEditor.test.tsx`: the editor is a `textbox` with `aria-multiline="true"` named after the tile; Esc leaves it with the tile selected and focused, Tab moves to the next control; the e2e: Enter on a focused Text tile then Enter on "Edit text on the canvas" puts focus at the text's end with a 2 px `accent` border; typing then clicking outside and pressing the edit bar's Undo once restores the old text whole; Properties has no textarea (AC-302).
  - Depends on: T875

- [x] T878 (AC-515) The toolbar: block style in §3's sizes, bold, italic, both lists, link, Insert and the element count, and nothing for colour, font or size
  - Files: `packages/web/src/tiles/text/TextToolbar.tsx` (+ test).
  - Failing test: `TextToolbar.test.tsx`: a `toolbar` with one Tab stop and ← → along it, holding in order the block-style menu button, Bold, Italic, Bulleted list, Numbered list, Link, Insert and "3 / 10 elements"; the block-style menu lists Paragraph, Heading small, Heading medium, Heading large and Large value, each in its own size; choosing Heading medium makes the line an `h4` at 20 px (AC-515).
  - Depends on: T876

- [x] T881 (AC-517) The insert menu, opened by `/`, `{{` or Insert: a combobox of kinds in three groups, then measures by cube
  - Files: `packages/web/src/tiles/text/InsertMenu.tsx` (+ test; on `@tiptap/suggestion`), `packages/web/src/tiles/text/editorExtensions.ts`.
  - Failing test: `InsertMenu.test.tsx`: `/` at a line's start, after a space, `{{` and Insert each open a 320 px listbox with Live values (8 kinds), Controls (3) and Copilot groups in that order, focus staying in the text with `aria-activedescendant`; typing "marg" lists Margin % under Orders; Enter on it inserts a Value of it; → on it lists Value, Change, Sparkline, Icon, Bullet graph and As of; Esc closes it and leaves "{{marg" as text; `/` inside a word opens nothing (AC-517).
  - Depends on: T878

- [x] T882 (AC-519) Live elements as atoms in edit mode, controls inert, and the Elements list in Properties
  - Files: `packages/web/src/tiles/text/nodes/*.ts` (one node per kind, inline atoms with `ReactNodeViewRenderer`), `packages/web/src/tiles/text/ElementsList.tsx` (+ test), `packages/web/src/tiles/text/elementName.ts` (+ test).
  - Failing test: `ElementsList.test.tsx`: elements listed in text order with kind and source and "3 of 10"; choosing a row selects that element and opens its settings; `elementName.test.ts`: "Change, Revenue against previous quarter"; a node test: → steps over an element as one character and selects it; Backspace after it removes it whole; a filter control in edit mode ignores a click's change (AC-519).
  - Depends on: T881

- [x] T884 (AC-520, AC-116) The Value and Change elements: their settings, model formats, marking limits, own filters, and Change's triangle, sign and direction colour
  - Files: `packages/web/src/tiles/text/elements/ValueElement.tsx` (+ test), `packages/web/src/tiles/text/elements/ChangeElement.tsx` (+ test), `packages/web/src/tiles/text/elementQueries.ts` (+ test).
  - Failing test: `ValueElement.test.tsx`: Revenue in its model's currency format; limited by Marking, over the marked rows, and with nothing marked all data, or "—" when chosen; its own filter added to the tile's in the query; `ChangeElement.test.tsx`: +4.2 % with Higher is better reads "▲ 4.2%" in `status-success`, −2.1 % "▼ 2.1%" in `status-error`, Neutral in `text-secondary`; as an amount "▲ $50K" (AC-520, AC-116).
  - Depends on: T882

- [x] T885 (AC-521) Sparkline and Bullet graph as wechart's own SVG, word-sized, each an image with its text alternative
  - Files: `packages/web/src/tiles/text/elements/Sparkline.tsx` (+ test), `packages/web/src/tiles/text/elements/BulletGraph.tsx` (+ test).
  - Failing test: `Sparkline.test.tsx`: a 64 × 16 `svg` with `role="img"`, one `path` of stroke width 2 in Revenue's dashboard colour, no axis, a last-point circle only when chosen, and the label "Revenue by month, last 12 months: from $1.0M to $1.27M, low $0.95M, high $1.3M"; `BulletGraph.test.tsx`: 96 × 16, a 4 px value bar and a 2 px target in `text-primary`, three range rects in `bg-subtle`, `border-subtle` and `border-strong`, a fourth range refused, and its label naming value, target and ranges (AC-521).
  - Depends on: T884

- [x] T886 (AC-522, AC-116) The Icon, Marking, Filter value and As of elements
  - Files: `packages/web/src/tiles/text/elements/IconElement.tsx` (+ test), `packages/web/src/tiles/text/elements/MarkingElement.tsx`, `packages/web/src/tiles/text/elements/FilterValueElement.tsx` (+ test), `packages/web/src/tiles/text/elements/AsOfElement.tsx` (+ test).
  - Failing test: `IconElement.test.tsx`: rules ≥ 100 % On track, ≥ 90 % Watch, otherwise Behind show the first match's icon and word; with no data, "No rule matched" with a neutral ring; `FilterValueElement.test.tsx`: Country set to Germany and France reads "Germany, France", unset "all countries"; `AsOfElement.test.tsx`: "as of 14:05" with a tooltip naming a pre-aggregation; a Marking element shows its count (AC-522, AC-116).
  - Depends on: T884

- [x] T877 (AC-514) Keep the editor's code out of view mode: no editor chunk until a Text tile is first edited
  - Files: `packages/web/vite.config.ts` (the editor chunk's name), `e2e/text-tile.spec.ts`.
  - Failing test: `text-tile.spec.ts`: opening a dashboard with two Text tiles in view mode requests no script whose name holds the editor chunk's; double-clicking a tile in edit mode then requests it (AC-514).
  - Depends on: T876

- [x] T879 (AC-516) Convert markdown patterns as typed, undone by the next Undo, and let only ⌘B, ⌘I and ⌘Z act inside the text
  - Files: `packages/web/src/tiles/text/editorExtensions.ts` (the input rules and the keymap), `packages/web/src/tiles/text/keys.test.ts`.
  - Failing test: `keys.test.ts`: `## ` makes Heading medium, `- ` a bulleted list, `1. ` a numbered list, `**a**` bold, `*a*` italic, `[a](https://x.example)` a link, each reversed by the next ⌘Z; ⌘B and ⌘I toggle bold and italic and ⌘Z undoes typing; ⌘U, ⌘E, ⇧⌘X, ⌘⌥1 and ⇧⌘Z change nothing; with focus outside the text, ⌘B does nothing (AC-516).
  - Depends on: T876

- [x] T880 (AC-513) Strip what the schema doesn't allow from pasted content, and refuse unsafe links, in the editor
  - Files: `packages/web/src/tiles/text/editorExtensions.ts` (`transformPastedHTML`, the Link mark's `isAllowedUri`), `e2e/text-tile.spec.ts`.
  - Failing test: `text-tile.spec.ts`: pasting `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><iframe src="https://x.example"></iframe><a href="javascript:window.__xss=3">a</a>` leaves `window.__xss` undefined in edit mode and after saving and reloading in view mode; the tile's DOM holds no `img`, `script`, `iframe`, `on…` attribute or `javascript:` address; the text "a" remains (AC-513).
  - Depends on: T876, T871
  - Done (decision T880-1): the paste e2e passed before any code, by the schema and `prosemirror-view` 1.42.3; the code added checks a pasted element's settings in `nodes/elementNodes.ts`, with `editorExtensions.test.ts` red first.

- [x] T883 (AC-518) Hold a Text tile to 10 elements in the editor: the count, the disabled menu and Insert with the reason, and a refused paste
  - Files: `packages/web/src/tiles/text/elementLimit.ts` (+ test), `packages/web/src/tiles/text/InsertMenu.tsx`, `packages/web/src/tiles/text/TextToolbar.tsx`.
  - Failing test: `elementLimit.test.ts`: at 10 elements Insert and every menu row are disabled with "This tile holds 10 elements, the most a Text tile can. Remove one, or add another Text tile."; pasting text holding 2 elements into a tile of 9 is refused with that reason and changes nothing; a filter control and a button count (AC-518).
  - Depends on: T882

- [x] T887 (AC-523) A Text tile as a cross-filter target only, Filter or None, and its elements of one cube in one Cube request
  - Files: `packages/web/src/dashboard/settings/CrossFilterMatrix.tsx`, `packages/web/src/tiles/text/elementQueries.ts` (+ test), `packages/web/src/dashboard/crossfilter/` (targets).
  - Failing test: `elementQueries.test.ts`: three Values of `orders` measures under the same filters make one `/load` query; a fourth with its own filter makes a second; `CrossFilterMatrix` test: a Text tile's Highlight is disabled with "Text has no marks to highlight" and it isn't listed as a source; with Filter, a click on a bar changes the tile's Value (AC-523).
  - Depends on: T884

- [x] T888 (AC-524) View mode: values as text in their sentence's type and weight, focusable, with a dotted underline and a tooltip that is their accessible description
  - Files: `packages/web/src/tiles/text/ElementTooltip.tsx` (+ test), `packages/web/src/tiles/text/readMapping.tsx`.
  - Failing test: `ElementTooltip.test.tsx`: a Value in a Heading large is 24 px at the heading's weight with `font-variant-numeric: tabular-nums` and no background or border; Tab reaches it; on focus it shows a dotted `text-muted` underline and a tooltip naming "Change · Revenue", "This quarter against the previous", the tile's and its own filters, "Marking: none" and "as of 14:05 · pre-aggregation", the same text as its `aria-describedby` (AC-524).
  - Depends on: T884, T873

- [x] T889 (AC-525) The element states: loading, no data, error, no permission and a removed member; and the empty tile
  - Files: `packages/web/src/tiles/text/ElementState.tsx` (+ test), `packages/web/src/tiles/text/TextTile.tsx`, `packages/web/src/dashboard/edit/Outline.tsx`.
  - Failing test: `ElementState.test.tsx`: loading shows a skeleton the width of the last value, or 4ch, and the tile `aria-busy`; no data "—" with "No data for these filters"; an error the warning icon and "Unavailable", Details on focus; a 403 from Cube "Unavailable" with no member named, the same as a folder the groups can't reach; a removed member "Unavailable" and, in edit mode, "1 element needs fixing" with its Elements row marked; an empty tile shows the placeholder in edit mode, nothing in view mode, and "Empty text" in the Outline (AC-525).
  - Depends on: T888

- [x] T891 (AC-527) Return Text tiles through MCP as markdown with tokens, and store a Text tile an MCP client writes in markdown as a checked document
  - Files: `packages/api/src/mcp/tools/read.ts`, `packages/api/src/mcp/tools/workspace.ts`, `packages/api/src/mcp/tools/text-tiles.test.ts`.
  - Failing test: `text-tiles.test.ts`: reading a dashboard returns its Text tile's content as T870's markdown inside the marked data field (AC-443); writing a dashboard with a markdown Text tile stores a document equal to T869's conversion (`exported`, every element kind's token read back as its element); one holding `<script>` stores it as literal text; one of 11 tokens is refused; re-writing a tile with a Button on "Go to Detail" (two actions), a Change (Lower is better) and a Value (its own filter), read and sent back with its tokens unchanged, keeps every stored setting, matched by kind and source in order, and a new token takes the defaults (AC-527, decision T891-1).
  - Depends on: T870, T871

- [x] T895 [P] (AC-531) The dashboard parameter in the dashboard's document: a name, a role, ordered labelled choices of at most 1,000 and a default among them
  - Files: `packages/core/src/dashboard-parameters.ts` (+ test), `packages/core/src/dashboard-document.ts`, `packages/core/src/index.ts`.
  - Failing test: `dashboard-parameters.test.ts`: a Measure parameter of Revenue, Orders and Margin % with default Revenue passes; 1,001 choices, a default outside the choices, a Dimension choice in a Measure parameter, and an empty name are each refused, named (AC-531).
  - Depends on: none

- [x] T892 (AC-528) A Filter control that is one of the dashboard's filters: the bar's widget at 28 px with its scope tag, one value in both places, and a deleted filter's control needing fixing
  - Files: `packages/web/src/tiles/text/elements/FilterControl.tsx` (+ test), `packages/web/src/filters/FilterBar.tsx` (the shared widget), `e2e/text-tile.spec.ts`.
  - Failing test: `FilterControl.test.tsx`: the control renders the bar's widget for Country with its scope tag, at 28 px; the e2e: choosing Spain in the control updates the bar's pill, the header's count and every tile in scope, announced once; clearing it in the bar clears the control; a second Text tile's control of Country shows the same value; deleting Country shows "1 element needs fixing" in edit mode (AC-528).
  - Depends on: T882

- [x] T894 (AC-530) Action buttons: a label, a style, and an ordered list of declared actions, run in order and nothing else
  - Files: `packages/core/src/text-document.ts` (the four action kinds), `packages/web/src/tiles/text/elements/ActionButton.tsx` (+ test), `packages/web/src/tiles/text/ActionList.tsx` (+ test).
  - Failing test: `ActionList.test.tsx`: + action offers Go to page tab, Apply bookmark, Reset filters and Export only; Move up reorders; `ActionButton.test.tsx`: Reset filters then Go to page tab Detail runs in that order; Reset filters leaves a parameter's value; Export of two tiles downloads two CSVs, each as AC-171 makes it; a stored button with `{"kind":"script"}` is refused by `textDocumentProblems` and runs nothing (AC-530).
  - Depends on: T882

- [x] T896 (AC-531) Dashboard settings › Parameters: the section and its list, and New parameter in the section or a 520 px dialog from the insert menu and a well's picker
  - Files: `packages/web/src/dashboard/settings/ParametersSettings.tsx` (+ test), `packages/web/src/dashboard/settings/ParameterForm.tsx` (+ test), `packages/web/src/dashboard/settings/SettingsPage.tsx`.
  - Failing test: `ParametersSettings.test.tsx`: Parameters sits after Cross-filtering and before Layout with its count; rows show name, "Field switch", Measure, 3, Revenue and "3 · 1 chart, 2 Text tiles"; `ParameterForm.test.tsx`: choices are picked with the field picker and can't be typed; Move up reorders; switching to Dimension with choices set asks first; opened from the insert menu it is a 520 px dialog that returns focus there; one Undo reverses the saved settings (AC-531).
  - Depends on: T895

- [x] T898 (AC-533) Bind a parameter from a local chart's well, follow it in the chart and in Value elements, and say "set by ‹parameter›" in view mode
  - Files: `packages/web/src/editor/Wells.tsx` (the Parameters group), `packages/core/src/chart-spec.ts` (a parameter in a well; + test), `packages/web/src/dashboard/chartSpec.ts` (resolving it; + test), `packages/web/src/tiles/ChartTile.tsx` ("set by").
  - Failing test: `chartSpec.test.ts`: a local chart whose Metrics well holds "Metric to show" queries Revenue, then Orders when the parameter changes, its title and format following; its pinned type stays; `Wells.test.tsx`: the picker lists "Parameters of this dashboard" first with Metric to show only in Metrics; the pill reads "Metric to show · now Revenue" with its tooltip; a chart from folders lists no Parameters group; the tile's head shows "· set by Metric to show" in view mode (AC-533).
  - Depends on: T895
