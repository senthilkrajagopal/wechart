# Finished tasks' notes: P2.27, new chart types (lane CHARTS-A)

Lane CHARTS-A's ticked tasks from `docs/tasks.md` §P2.27 (F49–F55), their sub-lines word for word, kept apart from `tasks-done.md` while the lanes run in parallel. Each task keeps its one line in `docs/tasks.md`.

- [x] T934 [P] (AC-559, AC-217) Register R81's types, names, needs and nine shelves, Flow among them and Map in place of Country map, with no gauge; a greyed card stays choosable and highlights the well it needs
  - Files: `packages/core/src/render-spec.ts` (the `ChartType` union), `packages/core/src/chart-type-names.ts` (+ test), `packages/core/src/chart-types/index.ts`, `packages/recommender/src/requirements.ts` (+ test), `packages/web/src/editor/chartTypeCatalog.ts` (+ test), `packages/web/src/editor/ChartTypeGallery.tsx` (+ test), `packages/web/src/editor/ChartTypeIcon.tsx`, `packages/web/src/editor/Wells.tsx` (routing R81's wells to `editor/wells/registry.ts`), `packages/charts/src/series/registry.ts`, `packages/charts/src/optionFor.ts`, `packages/web/src/tiles/tableView/index.ts`, `packages/charts/src/describe/index.ts`.
  - Failing test: `chartTypeCatalog.test.ts`: `TYPE_PURPOSES` is the nine purposes of AC-559 in order with their cards, Flow holding Sankey and Funnel, Funnel also under Ranking, Bullet chart also under KPI; Waterfall's `needsText` reads "Needs a summed measure, and a dimension or time for its steps", and those of 100 % stacked bar and area, Sankey and Icicle say "summed"; `typesMatching('gauge')` is Bullet chart and KPI; `chart-type-names.test.ts`: `map` reads "Map"; `ChartTypeGallery.test.tsx`: with Revenue by Region, Bullet chart is greyed with "Put a measure or a value in Target" in `text-primary`, and choosing it pins `bullet` and asks the editor to highlight Target (AC-559, AC-217).
  - Depends on: none
  - Done (2026-10-18): the eleven new ids, the nine shelves and the 100 % cards as presets (`docs/design/decisions-charts-a.md`, T934-1 … T934-6); the five registries, each empty until its type's task; the editor highlights the first well a chosen, greyed type lacks (e2e `chart-editor.spec.ts`, "a greyed type chosen from the gallery highlights the well it needs"). AC-559 stays open for T972's dashboard e2e, and AC-217 until a Target well exists to highlight (T936, T953).

- [x] T935 [P] (AC-098) Say "● ‹marking›'s share shown" on a tile whose items are all only partly marked, in place of "0 marked"
  - Files: `packages/web/src/dashboard/markings/MarkBadge.tsx` (+ test), `packages/web/src/dashboard/markings/markedValues.ts`.
  - Failing test: `MarkBadge.test.tsx`: a tile whose every item has a marked share between 0 and its whole, with Region = EMEA marked elsewhere, reads "● EMEA's share shown" and never "0 marked"; a tile with 1 whole item marked still reads "● 1 marked" (AC-098).
  - Depends on: none
  - Done (2026-10-18): `shareShownOf` and `showsShareOnly` in `markedValues.ts`, the badge's `shareShown`, wired in `DashboardView`'s `markingOn` from `markedShareReached` (decision T935-1). The badge keeps the marking's name before the words, as every badge does. AC-098 stays open for T972, since no type that shows a share is drawn yet.

- [x] T936 (AC-564, AC-037) The KPI's Compare to, Target, Time, Tile by and Direction in its spec and wells, and a KPI with none set drawn as before
  - Files: `packages/core/src/chart-types/kpi.ts` (+ test), `packages/core/src/chart-spec.ts`, `packages/web/src/editor/wells/kpi.tsx` (+ test), `packages/web/src/tiles/Kpi.test.tsx`.
  - Failing test: `kpi.test.ts`: a KPI spec with Compare to Same period last year, a Target measure, Time by month, Tile by Region and Lower is better parses and saves back the same; a spec with none of them parses with Direction Higher is better; `kpi.test.tsx` (wells): the five wells follow Metrics, Compare to offers its five choices; `Kpi.test.tsx`: every existing case renders the same DOM, with no change line, sparkline or target (AC-564, AC-037).
  - Depends on: T934
  - Done (2026-10-18): the settings in the chart's options under `kpi`, sparse (decision T936-1), not in `chart-spec.ts`; the KPI's wells module registered, R81's type wells moved to right after Metrics (direction.md §7i amended). AC-564 ticked on `e2e/new-charts-a.spec.ts` (the wells after Metrics, Compare to's choices, Higher is better first, a KPI with none set drawn as its value and label alone, the settings kept through a save). AC-037 stays open for R81's other types.

- [x] T937 (AC-565) A KPI's comparison through `compareDateRange`, another measure or a value, and its change line coloured by Direction
  - Files: `packages/core/src/chart-types/kpi.ts` (`kpiQueries`; + test), `packages/web/src/tiles/kpi/KpiChange.tsx` (+ test), `packages/web/src/tiles/Kpi.tsx`.
  - Failing test: `kpi.test.ts`: Previous period over October 2026 by month asks Cube for `compareDateRange` [Oct 2026, Sep 2026] on Ordered at, and Same period last year [Oct 2026, Oct 2025]; `KpiChange.test.tsx`: $1.35M against $1.32M with Higher is better reads "▲ +2.4% vs Sep 2026 ($1.32M)" in `status-success`; Return rate 1.8 % against 2.2 % with Lower is better reads "▼ −0.4 pts vs Sep 2026 (2.2%) · lower is better" in `status-success`; Neutral in `text-secondary` (AC-565).
  - Depends on: T936, T884
  - Done (2026-10-18), decision T937-1:
    - **Query:** core `kpiQueries` (via `ChartSpec.kpi`, set by `toChartSpec` and the editor's query; `toCubeQuery(spec, now)`). With Time, the value is Time's current period; Previous period and Same period last year ask both periods as one `compareDateRange`; Another measure is asked beside the value.
    - **Cube's multi answer:** the API's `CubeClient.load` sends `queryType: 'multi'` for a `compareDateRange` query, which Cube otherwise refuses (observed on the local Cube, 2026-10-18); `loadTile` reads the answer as one, each period's rows in order.
    - **Tile:** `tiles/kpi/KpiChange.tsx` draws R80's Change classes and tones, then "vs ‹period› (‹value›)"; `Kpi.tsx` names Time's period beside the measure and draws the value at 40/52 (`kpi--detailed`); the CSS is `tiles/kpi/kpiStyles.ts`, in lane A's `CHARTS_A_CSS`.
    - **Tests:** `kpi.test.ts`, `client.test.ts` (api), `loadTile.test.ts`, `KpiChange.test.tsx` and `Kpi.test.tsx` seen red, then green; e2e `new-charts-a.spec.ts`, "KPIs on 4- to 6-column tiles compare this month with the last…" (a fixed clock in August 2026), on headless Chromium. AC-565 stays open for T938's trend and target.

- [x] T938 (AC-565) A KPI's trend as R80's sparkline at the content width × 32, and its target as R80's bullet graph at the content width × 16 with "‹p›% of ‹target›"
  - Files: `packages/web/src/tiles/kpi/KpiTrend.tsx` (+ test), `packages/web/src/tiles/kpi/KpiTarget.tsx` (+ test), `packages/web/src/tiles/Kpi.tsx`.
  - Failing test: `KpiTrend.test.tsx`: in a 280 px tile the sparkline is R80's `Sparkline` at 256 × 32, over Ordered at by month; `KpiTarget.test.tsx`: $1.35M against $1.40M draws R80's `BulletGraph` 16 px tall and "97% of $1.40M" in `text-xs` `text-secondary` (AC-565).
  - Depends on: T937, T885
  - Done (2026-10-18), decision T938-1:
    - **Trend:** core `kpiTrendQuery` asks the tile's own query, its filters and limits in, for the measure by Time's grain over the last 12 periods. The tile's query reaches the KPI through `ChartTile`'s new `query` prop (`DashboardView`'s `queryOf`, the editor's query, the chart page's). `KpiTrend` draws R80's `SparklineSvg`, which now takes a size, at the content width × 32.
    - **Target:** `kpiQueries` asks a Target measure beside the value. `KpiTarget` draws R80's `BulletGraphSvg`, which also takes a size now, 16 px tall, its ranges the bullet chart's 80, 100 and 120 %, with "‹p›% of ‹target›" beside it.
    - **Figures:** `kpi/kpiNumbers.ts`'s `kpiShort` writes the compared value and the target to three significant digits ("$1.40M").
    - **Tests:** `kpi.test.ts` (core), `KpiTrend.test.tsx`, `KpiTarget.test.tsx` and `Kpi.test.tsx` seen red, then green; e2e `new-charts-a.spec.ts`, "KPIs on 4- to 6-column tiles draw their trend…", on headless Chromium. AC-565 is left for T940, which draws the tiled value at `text-kpi`.

- [x] T939 (AC-566) A KPI comparing periods with no Time says it needs one, and a compared period with no data reads "— vs ‹period› · No data for the comparison period"
  - Files: `packages/web/src/tiles/kpi/KpiChange.tsx`, `packages/web/src/tiles/kpi/KpiEmpty.test.tsx`.
  - Failing test: `KpiEmpty.test.tsx`: Previous period with Time empty shows "Compare to: Previous period needs a time dimension in Time." with a Time action that opens the Time well; a compared period of no rows reads "— vs Sep 2026 · No data for the comparison period" and no 0 % (AC-566).
  - Depends on: T937
  - Done (2026-10-18), decision T939-1:
    - **No Time:** `Kpi.tsx` says the sentence under the value, in `status-warning` text, with + Time where the tile has an action (`onAddTime` through `ChartTile`): from a dashboard it opens the chart, as the bullet's + Target does; in the editor it focuses the KPI's Time well.
    - **No data:** `KpiChange` reads "— vs ‹period› · No data for the comparison period" where the compared period's value is empty, its row is missing, or its count is 0 (Cube's count of no rows); the period is named from Cube's tag, else from the value's own period.
    - **AC-566** is ticked on `e2e/new-charts-a.spec.ts`, "a KPI says a period comparison needs Time…" (dashboard tiles 4 and 5 columns wide on a fixed clock of January 2026, and the editor's + Time), on headless Chromium, with `KpiEmpty.test.tsx` seen red, then green.

- [x] T940 (AC-567) Tile a KPI by a dimension: one tile per member as a list, ordered by value unless the author orders them, paged past 20
  - Files: `packages/web/src/tiles/kpi/KpiTiles.tsx` (+ test), `packages/web/src/editor/wells/kpi.tsx` (Customize's tile order).
  - Failing test: `KpiTiles.test.tsx`: Revenue tiled by 4 regions draws a `list` of 4 items in value order, EMEA's named "EMEA: $412K, up 4.2% vs Sep 2026, 92% of $450K"; a custom order is kept; 32 members show 20 with "Tiles 1–20 of 32" and ‹ › (AC-567).
  - Depends on: T938
  - Done (2026-10-18), decision T940-1:
    - **Query:** `kpiQueries` asks a tiled KPI by its Tile by dimension, so its compared period and its trend come back per member.
    - **Tiles:** `tiles/kpi/KpiTiles.tsx`, drawn by `Kpi.tsx` while Tile by is set. One `list` item per member, named "‹member›: ‹value›, up ‹change› vs ‹period›, ‹p›% of ‹target›" (`changeWordsOf`), each with its value at `text-kpi` and its own change, trend and target. The tiles are 8 px apart, scroll inside the tile and page by 20 with "Tiles 1–20 of ‹n›" and ‹ ›. The figures shared with the single KPI moved to `kpi/kpiFigures.ts`; `kpi/useBox.ts` measures the content box.
    - **Order:** by value, highest first; the KPI's Tile by well offers "Tile order" (By value, highest first; By value, lowest first; By name), stored as `tileOrder` only when not the default.
    - **ACs:** AC-567 is ticked, and AC-565 with it (its tiled value at `text-kpi`, 32/40), on `e2e/new-charts-a.spec.ts`, "a KPI tiled by status draws a named tile per member by value…" (6- and 5-column tiles on a fixed clock), with T937–T939's KPI e2e tests, on headless Chromium; unit tests `KpiTiles.test.tsx`, `kpi.test.tsx` (wells) and `kpi.test.ts` (core) seen red, then green.

- [x] T941 (AC-568) A KPI tile marks and cross-filters its member, the marked tile outlined and the others dimmed, every tile recomputing when limited
  - Files: `packages/web/src/tiles/kpi/KpiTiles.tsx`, `packages/web/src/tiles/kpi/kpiMarking.test.tsx`.
  - Failing test: `kpiMarking.test.tsx`: clicking EMEA's tile marks Region = EMEA; Ctrl-click on APAC adds it; the marked tile has the 1.5 px outline and "● Marked", the others' values in `text-secondary` and their sparklines at opacity 0.28; limited by a marking of Channel = Web every tile's query carries it; in cross-filter mode a tile filters the others to its Region, and as a Highlight target shows "Selected: $X · p%" (AC-568).
  - Depends on: T940
  - Done (2026-10-18), decision T941-1:
    - **Click:** a tile's click reaches `onItemClick` as its member (`marks`, as a Sankey's node does), through `ChartTile` and `Kpi`. Ctrl/⌘ toggles. `clickedValue` and `clickedMarkItem` read a KPI's click as its member, for marking and for cross-filtering.
    - **Drawing:** the marked tile (`matchesPredicate` on its row) takes a 1.5 px inset ring in the marking's colour and "● Marked". While any tile is marked, the others have their value in `text-secondary` and their micro-charts at 0.28.
    - **Highlight:** a tiled KPI (`isTiledKpi`) is a share target (`highlightKind`'s new `tiledKpi`), each tile saying "Selected: $X · p%" as the marked badge does. A single KPI is still filtered.
    - **Limits:** a limited KPI's value and trend queries carry the marking's limit, as every tile's query does.
    - **AC-568** is ticked on `e2e/new-charts-a.spec.ts`, "a tiled KPI on a 6-column tile marks, toggles, limits, cross-filters and highlights…", with the whole spec green on headless Chromium; `kpiMarking.test.tsx` seen red, then green.

- [x] T942 (AC-569) The KPI's table view and its sparkline's text alternative
  - Files: `packages/web/src/tiles/tableView/kpi.ts` (+ test).
  - Failing test: `kpi.test.ts` (table view): tiled by Region, rows read "EMEA · $412,000 · $395,000 · ▲ +4.2% · $450,000 · 92%"; each sparkline's alternative names the first, last, low and high values (AC-569).
  - Depends on: T940
  - Done (2026-10-18), decision T942-1:
    - **Table view:** `tiles/tableView/kpi.ts`, registered as the KPI's `TABLE_VIEWS` entry. It lists one row per tile, in the tiles' order, or one row: the tile's member, the value under its period, the compared value under its period (or the measure's title, or "Compared with"), the change as R80's Change writes it (`changeTextOf`), the target and its share. It has only the columns the KPI has; a period with no data reads "—". A KPI with none of R81's settings keeps its rows as queried, so `TableViewOf` may now answer undefined.
    - **Shared:** `tilesOf` and `ordered` moved to `kpi/kpiFigures.ts`, for the tiles and the table alike.
    - **Text alternative:** each sparkline is R80's named image ("Count, shipped by month, last 12 months: from 30 to 29, low 28, high 31"), first, last, low and high.
    - **AC-569** is ticked on `e2e/new-charts-a.spec.ts`, "a KPI tiled by status…" (its table view's columns and rows against its tiles, and a tile's sparkline name), and `table-view.spec.ts`'s kpi walk, on headless Chromium; `tableView/kpi.test.ts` seen red, then green.

- [x] T943 (AC-570, AC-037) The graphical table's spec and wells: Rows, Group rows by, and ordered columns of R80's element kinds, moved and removed from a ⋯ menu with Undo
  - Files: `packages/core/src/chart-types/graphicalTable.ts` (+ test), `packages/web/src/editor/wells/graphicalTable.tsx` (+ test).
  - Failing test: `graphicalTable.test.ts`: a spec of Category with Value, Sparkline, Bullet, Icon and Change columns parses and saves back in order; `graphicalTable.test.tsx` (wells): + Column offers the five kinds; a column's row opens its R80 element settings; its ⋯ holds Move up, Move down and Remove, Remove offering Undo; with no column the tile says "Add a column: Value, Change, Sparkline, Bullet or Icon." (AC-570, AC-037).
  - Depends on: T934
  - Done (2026-10-18): the columns in the chart's options under `graphicalTable`, each R80's element of its kind as the Text tile stores it and checked by its schema; Rows and Group rows by from the chart's dimensions; each column's settings, design 21 C1–C5's for its kind, below its row; ⋯ with Move up, Move down and Remove, the app's Undo toast putting a removed column back (decision T943-1). e2e `new-charts-a.spec.ts`, "a graphical table takes Rows, Group rows by and ordered columns…", passes on headless Chromium. AC-570 stays open until T944 draws Group rows by's sections in the tile; AC-037 for R81's other types.

- [x] T944 (AC-571, AC-570) Draw the graphical table as a real `<table>` with its caption, 24 px rows, and its Value, Change, Sparkline, Bullet and Icon cells
  - Files: `packages/web/src/tiles/GraphicalTable.tsx` (+ test).
  - Failing test: `GraphicalTable.test.tsx`: 6 categories render a `table` with column headers and the caption "Categories at a glance: 6 rows; 2 on track, 2 at risk, 2 off track."; rows 24 px under a 28 px header; Sparkline cells are 64 × 16 `img`s each scaled to its own row; a Bullet cell is 96 × 16 with "23.1%" beside it, read "23.1 % of 25 %, in the 80–100 % band"; an Icon cell shows the icon and "At risk"; a row with no trend shows "—" with "No data for these filters"; Group rows by Region puts each region's rows under a heading row (AC-571); with no column the tile says "Add a column: Value, Change, Sparkline, Bullet or Icon." with + Column (design 23 sheet 2's empty state), and AC-570 is ticked on an e2e of both (added 2026-10-18 after T943's review: T943 built the wells, the tile is T944's).
  - Depends on: T943, T885, T886
  - Done (2026-10-18), decision T944-1:
    - **Query:** a graphical table's values are asked by Rows and Group rows by alone, with every column's measures (`targetMeasuresOf` with `graphicalTableMeasures`). Its trends come from core `graphicalTableTrends`: one query per time and grain, over the last periods, by Rows, under the values' filters.
    - **Drawing:** `tiles/GraphicalTable.tsx`, drawn by `ChartTile` as a DOM type. Each cell is R80's own element: `SparklineSvg`, `BulletGraphSvg` (which takes a `label` now), `IconText` and `ChangeText`. A Change compares the latest two periods with data. Group rows by makes a `tbody` per member, headed by a `th scope="rowgroup"`. With no column, it shows `NO_COLUMNS` and + Column (`onAddColumn`): from a dashboard that opens the chart; in the editor it opens the Columns well's + Column menu. Its CSS is `tiles/graphicalTableStyles.ts`, in `CHARTS_A_CSS`.
    - **Shared:** core `kpiTrendQuery`, `kpiTrendPeriods` and `kpiTrendValues` take a number of periods. `defaultEncoding` reads a graphical table's Rows as x and Group rows by as facet. `graphicalTable` came out of `AWAITING_SERIES`.
    - **ACs:** AC-571 and AC-570 are ticked on `e2e/new-charts-a.spec.ts`, "graphical tables on 5- and 6-column tiles draw their cells, sections and empty state, and + Column opens Columns" (fixed clock), with `chart-editor.spec.ts`'s undrawn walk, on headless Chromium; `GraphicalTable.test.tsx` and core `graphicalTable.test.ts` seen red, then green. A bullet cell reads its values in their own format ("23.1% of 25%"); the task's "23.1 %" spacing is the format's.

- [x] T945 (AC-572) Page a graphical table at 50 rows, each page asking Cube for its values and its own members' trends
  - Files: `packages/web/src/tiles/GraphicalTable.tsx`, `packages/core/src/chart-types/graphicalTable.ts` (`pageQueries`; + test).
  - Failing test: `graphicalTable.test.ts`: page 2 of 214 rows makes two queries, the second filtered to that page's 50 members and by month; `GraphicalTable.test.tsx`: "Rows 51–100 of 214" with ‹ › (AC-572).
  - Depends on: T944
  - Done (2026-10-18), decision T945-1:
    - **Core:** `GRAPHICAL_TABLE_PAGE_ROWS` (50), `graphicalTablePage` (a page past the last is the last) and `pageQueries`, which gives the values query unchanged and each trend filtered to the page's members of Rows, each once.
    - **Tile:** `GraphicalTable` keeps the page and asks only its trends; `GraphicalTableView` takes `page` and `onPage`, or keeps its own. Past 50 rows, "Rows 51–100 of 214" sits under the table between ‹ › ("Previous rows", "Next rows"), as the tiled KPI's pager does. The caption still counts every row. Sections are drawn within the page.
    - **AC-572** is ticked on `e2e/new-charts-a.spec.ts`, "a graphical table of 240 orders shows 50 a page…", on headless Chromium: page 2 asks one new request, its trend, for exactly its 50 shown members. Unit tests seen red, then green.

- [x] T946 (AC-573) Mark a graphical table's rows as table tiles do, never by sorting, with "· $X marked" in partly marked additive cells, and cross-filter by row
  - Files: `packages/web/src/tiles/GraphicalTable.tsx`, `packages/web/src/tiles/graphicalTableMarking.test.tsx`, `packages/charts/src/marking/partial.ts`.
  - Failing test: `graphicalTableMarking.test.tsx`: click marks Seafood, Ctrl-click adds Dairy, Shift-click from Seafood marks the range; sorting by Revenue keeps the marking; marked rows are bold with a left rule, others' text `text-secondary` and micro-charts 0.28 while Change and Icon keep their colours; with Region = EMEA marked elsewhere, Beverages' Revenue reads "$1.21M · $310K marked" and Margin % shows "Marked: 22.8%" only in its tooltip; in cross-filter mode a row filters the others to its Category (AC-573).
  - Depends on: T944, T935
  - Done (2026-10-19), decision T946-1:
    - **Gestures:** a row's click carries its member of Rows as `marks`, as a tiled KPI's tile does. `clickedValue` and `clickedMarkItem` take `graphicalTable`, so marking, Ctrl/⌘ toggling and cross-filtering go the existing way. Shift-click sends the rows from the anchor to the clicked row, in the order drawn, through `onShapeMark`. The anchor is the last plain click; a Ctrl/⌘ toggle and the range itself leave it where it is. `ChartTile` passes `onItemClick` and `onShapeMark` to the table.
    - **Drawing:** charts' `rowMarksOf` reads each row over every column's measures, as a table's rows are read. A row gets `data-marked`. `GT_CSS` makes a marked row 600 with a 3 px rule in the marking's colour (`--gt-mark`). On the others, every cell's text except `.gt__change` and `.gt__icon` dims to `text-secondary`, and every micro-chart outside an Icon cell dims to 0.28.
    - **Partly marked:** charts' new `markedCellOf` says where a part goes. An additive Value cell adds `.gt__marked` " · ‹amount› marked"; any other gets `title` "Marked: ‹amount›". Amounts are in the measure's own format ("$310,000"), as its cell is; the task's "$310K" was the design's abbreviation.
    - **Sorting:** the table has no header sort; it is drawn in the chart's Sort order (AC-044), as a table tile is. A row is marked by its member, so any order keeps the marking, as the unit test shows by reversing the rows.
    - **AC-573** is ticked on `e2e/new-charts-a.spec.ts`, "a graphical table on a 6-column tile marks its rows by click, Ctrl and Shift…", on headless Chromium, with the unit tests named seen red, then green.
    - **Also here:** an `eslint-disable` for the T944-1 region's `tabIndex`, as `DataTable`'s region has one.

- [x] T947 (AC-574) "View as table" for a graphical table: the numbers behind every cell
  - Files: `packages/web/src/tiles/tableView/graphicalTable.ts` (+ test).
  - Failing test: `graphicalTable.test.ts` (table view): Beverages reads "$1,210,000 · $84K → $112K · 23.1% / 25% · At risk", each matching its drawn cell (AC-574).
  - Depends on: T944
  - Done (2026-10-19), decision T947-1:
    - **The view:** `tableView/graphicalTable.ts`, `graphicalTableTableView(spec, trends, now)`. It is built from the same helpers the cells use, now exported from `GraphicalTable.tsx`: `trendFor`, `valuesAlong`, `headingOf`, `targetOf`, `iconValueOf`, `rulesOf`, `matcherFor` and the new `changeReadingOf`. `ChangeElement`'s `changeWordsOf` is exported.
    - **Its trends:** they are needed alongside the rows, so the view isn't a `TABLE_VIEWS` line. `ChartTile` draws `GraphicalTableAsTable` in table view instead. It asks the trends with `useGraphicalTableTrends(spec, query, 'every')`: at 50 rows or fewer these are the first page's queries, already cached, and past 50 there is one unfiltered query per time and grain. It passes the view to `DataTable`'s new `view` prop.
    - **Test file:** the test is `graphicalTable.test.tsx`, not `.ts`, because it renders the table to compare every cell. The sparkline is written as its text alternative writes it (`shortValues`), so "$84K" may read "$84.0K"; the test pins it to the cell's.
    - `graphicalTable` came out of `AWAITING_TABLE_VIEW`.
    - **AC-574** is ticked on `e2e/new-charts-a.spec.ts`, "a graphical table's table view lists the numbers behind every cell…" (fixed clock), and `table-view.spec.ts`'s graphicalTable walk, both on headless Chromium. Unit tests seen red, then green.

- [x] T968 (AC-560, AC-031, AC-028) The new top picks: ~~histogram, bubble,~~ parallel coordinates, bullet and KPI with a target; line kept for one measure over time with KPI with trend next; and R81's caps on ~~bubbles and~~ KPI tiles (the histogram and bubble parts parked, the user, 2026-10-18)
  - Files: `packages/recommender/src/recommend.ts` (+ test), `packages/recommender/src/legality.ts` (+ test), `packages/recommender/src/reason.ts`.
  - Failing test: `recommend.test.ts`: ~~one numeric dimension alone gives Histogram; one measure with Each point is gives Histogram then Box plot; Revenue, Margin % and Order count by 12 Products give Bubble then Parallel coordinates;~~ 5 measures by 14 Products give Parallel coordinates; a Target with Region gives Bullet chart, and with no dimension KPI then a single bullet; Revenue by month gives Line then "KPI with trend"; `legality.test.ts`: ~~a bubble with Colour of 4 or Shape of 7, and~~ a KPI tiled by 21~~, are~~ is rejected (AC-560, AC-031, AC-028).
  - Parked (the user, 2026-10-18, "any of the charts that you have not started implmentation put them in the parking lot for now"): the histogram's and the bubble's top picks and the bubble's caps, struck through above, go with T959–T967 and T1018 (§"Parked" below).
  - Depends on: T934
  - Done (2026-10-19), decision T968-1:
    - **Signature:** `Signature.target`. The web's `signatureOf` and `recommendedTypeOf` take the chart's options and set it where a bullet chart's or a KPI's Target is there, whatever type the chart draws as. The editor and the dashboard's `chartSpec.ts` both pass the options.
    - **Candidates:** a bullet per member of one dimension, or a single bullet, where a Target is set; a KPI with its time dimension ("KPI with trend") for one measure over time; parallel coordinates for 4 or more measures by one dimension.
    - **Order:** `r81PicksOf` gives AC-560's top pick and named first runner-up by the signature, ahead of the scores. `withR81Picks` puts them first, and otherwise keeps every R81 type behind the first that isn't one. Reasons: "One number against its target.", "A single bullet: the number against its target and bands." and "KPI with trend: this period's number, its trend beneath."
    - **Cap:** legality's `kpi_tile_capacity`, `CAPS.kpiTiles` 20, on a KPI's `facetField`.
    - **Picking "KPI with trend":** the editor's quick pick sets the KPI's Time to the chart's time dimension at its grain, or the month (`editor/kpiTrendPick.ts`), so the trend is drawn.
    - `reason.ts` needed no change: `dataReasonFor` names the type by `CHART_TYPE_NAMES`.
    - **Seen:** unit tests red, then green; the recommender package's tests and the web's editor and query tests passed; `e2e/new-charts-a.spec.ts`, "one measure over time is drawn as a Line in Auto, 'KPI with trend' next…", on headless Chromium.
    - **ACs not ticked:** AC-560 also needs the Map's picks (lane B's T1012). AC-031 has the Sankey's and other caps still to come. AC-028 waits for AC-561 and AC-562 (T969, T970).

- [x] T953 (AC-580, AC-037) The bullet chart's spec and wells: Target, 2–3 bands at 80, 100 and 120 % by default, and its empty state
  - Files: `packages/core/src/chart-types/bullet.ts` (+ test), `packages/web/src/editor/wells/bullet.tsx` (+ test).
  - Failing test: `bullet.test.ts`: bands default to [80, 100, 120]; a fourth band is refused with "At most 3 bands: R80's three greys, and no fourth without a new colour."; one band is refused; `bullet.test.tsx` (wells): with Target emptied the tile says "A bullet chart compares each member with a target. Put a measure or a value in Target." with Target as its action (AC-580, AC-037).
  - Depends on: T934
  - Done (2026-10-18): Target and Bands in the chart's options under `bullet`, sparse (decision T953-1); the editor counts a set Target towards the chart's needs (`targetCount`), so the card is greyed and the chart undrawn until one is set; the Target well says AC-580's sentence with its own select as the action, highlighted when a greyed card is chosen (AC-217). AC-580 ticked on `e2e/new-charts-a.spec.ts`, "a bullet chart is drawable only with a Target…", on headless Chromium. AC-217, which T934 left open until a Target well existed to highlight, ticked on the same test with `chart-editor.spec.ts`'s gallery and Auto tests, all passing on headless Chromium. AC-037 stays open for R81's other types.

- [x] T957 (AC-584, AC-037) Customize › Stack, Sum or 100 %, on stacked bar and area, with the two gallery presets, only for summed measures, folding before shares, on a fixed 0–100 % axis
  - Files: `packages/core/src/chart-types/stack100.ts` (+ test), `packages/charts/src/series/bar.ts`, `packages/charts/src/series/line.ts`, `packages/web/src/editor/wells/stack.tsx` (+ test), `packages/web/src/editor/chartTypeCatalog.ts` (the presets' cards).
  - Failing test: `stack100.test.ts`: Revenue by Region and Channel at 100 % gives each Region's drawn shares summing to 100 within 1e-9, with 12 channels folded to 7 and "Other (5)" before shares are taken; the value axis is 0–100 % with interval 25 and no log or include-zero option; the tooltip reads "Web: $210K · 51 % of EMEA"; `stack.test.tsx`: Margin % disables 100 % with "Margin % is an average, so its shares of a total wouldn't mean anything. 100 % takes a summed measure."; the 100 % stacked bar card opens Stacked bar at 100 % (AC-584, AC-037).
  - Depends on: T934
  - Done (2026-10-18): `options.stack` and Customize › Stack (decision T957-1); the shares, axis and tooltip drawn last over the bar and line families (`charts/src/series/stack100.ts`, wired in `optionFor.ts`, not in `bar.ts` or `line.ts`), the series folded to 8 first (`foldForShares`); the cards' stacking set in the editor's gallery choice (`stackChoice`), `chartTypeCatalog.ts` unchanged. AC-584 ticked on `e2e/new-charts-a.spec.ts`, "the 100 % stacked bar card opens Stacked bar at 100 %…", on headless Chromium, with `charts/src/series/stack100.test.ts` (shares adding to 100, folding before shares, the tooltip, direct labels). AC-037 stays open for R81's other types.

- [x] T958 (AC-585) Mark a 100 % segment as its tuple, draw a marked share as a fraction of the segment, and add the share to the text alternative and table
  - Files: `packages/charts/src/marking/partial.ts`, `packages/charts/src/describe/stack100.ts` (+ test), `packages/web/src/tiles/tableView/stack100.ts` (+ test), `packages/charts/src/series/stack100Marking.test.ts`.
  - Failing test: `stack100Marking.test.ts`: a segment marks (Region, Channel); a legend entry marks its Channel; with a marking covering half of EMEA · Web, the drawn marked part is half the segment's height from its own base; (describe) "Web's share is largest in APAC (62 %) and smallest in LATAM (38 %)."; (table view) a "Share of Region" column (AC-585).
  - Depends on: T957, T935
  - Done (2026-10-18), decision T958-1:
    - A 100 % segment's click or shape marks its tuple (`clickedMarkItem`, in `web/dashboard/crossfilter/clicked.ts`, wired in `DashboardView`), and its legend entry marks the colour member. A stack at Sum marks as before. AC-585's "as stacked charts mark today" is clarified in the spec; whether Sum stacks should mark tuples too is the user's question.
    - The marked share already drew as a fraction of the segment from its own base, through T957's split and scaling. `stack100Marking.test.ts` pins this and passed at once. `partial.ts` is unchanged.
    - The text alternative (`describe/stack100.ts`) is the first entry in `DESCRIBE`, and the tile now carries it as visually hidden text named by the canvas.
    - "Share of ‹category›" is added after the tile's table rows (`ADDED_COLUMNS` in `tiles/tableView/index.ts`, drawn by `DataTable`).
    - A stack at 100 % joins the "share shown" badge (T935-1).
    - AC-585 is ticked on `e2e/new-charts-a.spec.ts`, "a 100 % stacked bar on a 5-column tile…" (a real dashboard tile five columns wide), on headless Chromium, with the unit tests named.

- [x] T954 (AC-581) Draw one bullet per member on one axis from zero: R80's greys lightest lowest, an 8 px value bar and a 2 × 32 px target
  - Files: `packages/charts/src/series/bullet.ts` (+ test).
  - Failing test: `bullet.test.ts` (series): 4 regions share one value axis with `min: 0` and the note "Axis starts at $0: bars are lengths"; bands are `bg-subtle`, `border-subtle`, `border-strong` from low to high, 24 px tall on a 48 px pitch; the value bar is 8 px `text-primary`; the target 2 × 32 px; a member with no target draws its bar labelled "No target"; 30 members scroll with the axis fixed (AC-581); a saved bullet chart with Target emptied draws, in the tile, design 23 sheet 8's empty state: "A bullet chart compares each member with a target. Put a measure or a value in Target." with + Target (added 2026-10-18 after T953's review: T953 says it in the editor's Target well).
  - Depends on: T953
  - Done (2026-10-18), decision T954-1, research `docs/research/echarts-bullet.md`:
    - **Query:** the Target measure is asked of Cube beside the Metrics (`ChartSpec.targets`, `targetMeasuresOf`, in `toChartSpec` and the editor's query).
    - **Drawing:** `series/bullet.ts`, registered in `SERIES`.
      - The value bar is on a hidden second member axis, so ECharts centres it on the bands.
      - The target is a `rect` scatter mark.
      - Each member's figures are in its label.
    - **Scrolling:** members past the tile's height scroll by the wheel or a slim slider.
      - This uses the DataZoom `inside` and `slider` components, now registered.
      - `zoomLock` is left off the `inside` dataZoom, which would silence the wheel.
      - `layout/scrollWindow.ts` keeps the window across the tile's redraws.
    - **Empty Target:** the tile says AC-580's sentence, with + Target where the dashboard offers the chart's pencil (`ChartTile`'s `onAddTarget`, through `TileBody`).
    - **Dark theme:** `bg-subtle` and `text-primary` are recoloured.
    - **e2e walk:** `bullet` comes out of `e2e/r81Awaiting.ts`'s `AWAITING_SERIES`.
    - **AC-581** is ticked on `e2e/new-charts-a.spec.ts`, "bullet charts draw on dashboard tiles 4 to 6 columns wide…" (tiles 5, 6, 4 and 5 columns wide, on headless Chromium). This sits with `bullet.test.ts` (sizes, colours, order, pitch, scrolling), `bulletQuery.test.ts`, `bulletTile.test.tsx` and `scrollWindow.test.ts`.

- [x] T955 (AC-582) Mark and cross-filter a bullet as its member, drawing another tile's marked share on the value bar from zero
  - Files: `packages/charts/src/series/bullet.ts`, `packages/charts/src/series/bulletMarking.test.ts`.
  - Failing test: `bulletMarking.test.ts`: a click marks EMEA, Ctrl toggles, a drag marks the bullets it touches; with Channel = Web marked elsewhere, EMEA's bar draws $210K from 0 at full opacity and the rest at 0.28; an average measure draws no share and its tooltip reads "Marked: 24.1%"; in cross-filter mode a bullet filters the others to its Region (AC-582).
  - Depends on: T954
  - Done (2026-10-18), decision T955-1:
    - **What a bullet's marks name:** every mark names its member. The bands and the value bar get it by their member axis, and the target by its item's name. So a click, a Ctrl-click and a drag (`itemsInShape`) mark the member, and cross-filtering filters by it. This works through the same `clickedValue` path as a bar's category, now covered by `clickedBullet.test.ts`.
    - **A marking:** it outlines the value bar. It fades an unmarked bullet's bands and target, but never outlines them (`markedAs: 'fade'`, read by `withMarks`).
    - **A partly marked bullet:**
      - The value bar is split as a bar's is, its marked share drawn from zero (`drawsPartly` takes the bullet).
      - The bands and the target are left as they are.
      - An average is hatched, with "Marked: …" in its tooltip.
    - **AC-582** is ticked on `e2e/new-charts-a.spec.ts`, "a bullet chart on a 5-column tile marks a bullet as its member…", on headless Chromium, with the unit tests named.

- [x] T956 (AC-583) Name each bullet and the chart, and give the bullet chart its table view
  - Files: `packages/charts/src/describe/bullet.ts` (+ test), `packages/web/src/tiles/tableView/bullet.ts` (+ test).
  - Failing test: `bullet.test.ts` (describe): "EMEA: $412K of $450K target (92 %), in the 80–100 % band." and "4 regions; 1 above target (North America)."; (table view) Region, Revenue, Target, % of target, Band (AC-583).
  - Depends on: T954
  - Done (2026-10-18), decision T956-1:
    - **Band:** core `bulletBandOf` gives the share of target and its band.
    - **Text alternative:** `describe/bullet.ts`, registered in `DESCRIBE`. It gives the chart's summary first, then each bullet.
    - **Table view:** `tiles/tableView/bullet.ts`. It is the first entry in `TABLE_VIEWS`, and `DataTable` now draws a type's own table view in place of its rows.
    - **Fixed here:** a bullet chart is now drawn by its first plain dimension, never by a time dimension. `defaultEncoding` had laid it out as a bar and drew it per day; `table-view.spec.ts`'s walk found this. The walk now also takes `bullet`, setting a Target in its fixture, and `bullet` comes out of `AWAITING_TABLE_VIEW`.
    - **AC-583** is ticked on `e2e/new-charts-a.spec.ts`, "a bullet chart's tile names the chart and each bullet…" (a 5-column dashboard tile), with `table-view.spec.ts`'s bullet walk, both on headless Chromium.
