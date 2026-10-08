# Dashboard surfaces critique (2026-10-08, T406)

**What this covers.** AC-352 and AC-343:

- the dashboard view (2026-09-24 design 04);
- the dashboard header (2026-09-27 design 04, state E; 2026-09-28 design 13);
- the tile's ⋯ menu and its Data as of submenu (design 08);
- the header's ⋯ menu and the Export pane (design 13);
- the settings page (design 05);
- the chart page (design 06).

**How it was judged.** From captures of the running app at 1,440 × 900, 1,024 × 768 and 390 × 844: screenshots, plus each visible element's box and computed styles.

**Not captured:**

- a KPI tile and a table tile (the seed dashboard has neither);
- Settings › Interactions and Markings;
- a marked tile;
- the tile menu at 1,280 × 720;
- the chart page's shared-chart state B;
- the History panel with sign-in on.

For each of these, the findings below say from the source whether it is built.

**Summary.** 23 findings (11 major, 11 minor, 1 polish) and 9 questions for the user.

## Findings

**DSH-01 · major · The tile's freshness badge** (design 04, note 4; the coordinator ruled it is built as drawn)

- **Design:** one small badge in the head: "✓ Pre-agg · 3m" in the status colour, or "● Live". The time to the second moves into the badge's tooltip: "Live query · as of 11:12:06 PM · 42 ms · no pre-aggregation" (04:160, 181–182, 237).
- **App:**
  - The badge reads "● Live · as of 09:15:34" (147 × 22). At 1,024 px it is squeezed to 86 px, "● Live · a…", which is the truncation note 4 exists to fix.
  - The tooltip reads "Live · Data as of 09:15:34", with no ms and no "no pre-aggregation".
  - A rollup's badge reads "⚡ 40m" plus the clock, not "✓ Pre-agg · 3m".
- **Covered already?** status.md row 04 says "the badge's relative time (T477)". T477 passed note 4 to the coordinator, and no open task covers it.
- **Must land with DSH-21** (see AC-148 below).

**DSH-02 · major · Whole-number ticks for counts** (design 04, pin 6)

- **Design:** "ticks 0, 20, 40, 60 — never 0.2 for a count" (`minInterval` 1 for count and count_distinct) (04:239).
- **App:** "Orders over time by status", a saved "Chart · Bar", has y-ticks 0, 0.2, 0.4 … 1. No renderer sets `minInterval`.
- **Covered already?** UX-022 was fixed for the editor's Auto line only. The coarser default grain is a proposal and is held back. Whole-number ticks are not a proposal.

**DSH-03 · major · A table tile's row count** (design 04, pin 7)

- **Design:** "626 rows · first 100" in the table tile's head (04:206, 240).
- **App:** not captured. `ChartTile.tsx` renders no row count in any head.
- **Covered already?** status.md row 04 lists it as left to build, but no task covers it.

**DSH-04 · minor · The KPI ramp** (design 04, pin 3; design 06, state B)

- **Design:** `text-kpi` 32/40 in a row; a lone KPI at `text-kpi-solo` 40/52/600, tabular, centred; the label above it in the tile-title style, 14/20/600.
- **App:** not captured. `.kpi__value` is always 32/40 (36 line-height on dashboards), with no solo variant. The label is 12/16/600 text-secondary.
- **Covered already?** status.md row 06 lists it. The label's style is Q3.

**DSH-05 · minor · The order of the header's buttons** (2026-09-27 design 04, state E; design 13, screen 1)

- **Design:** History, Bookmarks ▾, the primary "Edit in my workspace", then ⋯, all as `.btn` 32/14.
- **App:** Bookmarks (32 px), History (a 79 × 24 `btn-sm` at 12 px), Edit in my workspace, ⋯.

**DSH-06 · major · The workspace band is hidden on Settings** (2026-09-27 design 04, pin 2; rule 72)

- **Design:** "My workspace · only you can see this" on every page inside the workspace.
- **App:** `div.workspace-band` sits at [0,48,1440,32], but `div.settings-page`, overlaid by `.dashboard--overlaid { position:absolute; inset:0; z-index:5 }`, covers it.

**DSH-07 · major · The mode cards in Settings › Interactions** (design 05, pins 3–6)

- **Design:**
  - Each card has a radio and its title, design 05's description, a 128 px illustration, its gestures as keycaps ("Click marks · Ctrl/⌘ toggles · Drag rectangle · Alt+drag lasso · Esc unmarks"), and a foot: "1 marking · used by 2 tiles · limits 0 · Manage markings ›" or "Default for tile pairs: Filter · 0 pairs changed · Set tile pairs ›".
  - An intro above the cards: "How readers explore this dashboard… kept, not cleared."
  - An info line below them: "Switching mode clears readers' current marks…" (05:155–189, 207–210).
- **App:** not captured. In `SettingsPage.tsx`, each card has a name, the prototype's description and a refs line. There is no illustration, keycaps, foot, links, intro or info line, and the legend reads "Interaction mode".
- **Covered already?** status.md row 05 lists it, but no task covers it. The card's metrics are Q5.

**DSH-08 · minor · Settings' title bar and nav** (design 05, pins 1–2)

- **Design:**
  - The bar is at least 44 px. It reads "Dashboard settings", then "· 1 unsaved change" beside the title, then "Esc cancels", Cancel and Save settings.
  - The current nav row has an accent edge (`inset 2px 0 0 accent`).
  - The h1 is 16/22 and the h2 18/24.
- **App:**
  - The bar is 41 px.
  - "Unsaved changes" has no count and sits after the spacer.
  - There is no "Esc cancels", although Esc works.
  - The nav row has no edge.
  - The h1 is 16/20 and the h2 18/20.

**DSH-09 · minor · Settings › General control sizes** (design 05; T476's Q2, "dashboard settings at 28/12")

- **App:** Name and Folder are 280 × 32 at 14 px, while the description is 12 px.
- **Covered already?** T476 left this surface to T406.

**DSH-10 · major · Settings' discard question** (design 05, state C: "The dialog names what changed.")

- **Design:** "Discard your changes to settings?" / "You changed the interaction mode. Leaving now keeps the dashboard as it was." (05:249–255).
- **App:** "Discard your changes?" / "These settings have not been saved. Leaving now loses them."

**DSH-11 · major · The chart page's head for a local chart** (design 06, pins 1 and 5)

- **Design:** "Save to folders…", the primary "Edit on Company dashboard 01", and ⋯ with Open Company dashboard 01, Copy link, View query, Download CSV and Delete chart….
- **App:** no actions. The ⋯ exists only where Delete is allowed, and then holds only "Delete chart…" (`LibraryChartPage.tsx`).
- **Covered already?** The two edit buttons give way to rule 71 (status.md row 06; what replaces them is Q7). The ⋯'s non-editing items are not covered.

**DSH-12 · major · The chart page's Updated section** (design 06, main screen and state B)

- **Design:** "Updated: Sep 21 by admin" (written day first since T477).
- **App:** Built on, Metrics, Dimensions and Lives on only.

**DSH-13 · minor · The chart page's crumbs, ownership and Lives on** (design 06, pins 2 and 4)

- **Design:**
  - The crumbs read "← Explore / Shared / Company dashboard 01".
  - The ownership line reads "Local chart · only on **Company dashboard 01**", with the dashboard's chip.
  - "Lives on" is an Explore item row (32 px, ▦, name, "Open ›").
- **App:**
  - The crumbs stop at "Shared".
  - The ownership line reads "Lives on Company dashboard 01 · only there".
  - "Lives on" is a plain link.

**DSH-14 · minor · The chart page's tile head** (design 06, pin 3)

- **Design:** one badge, "6 rows" muted on the right, and values labelled at the bar ends.
- **App:** "● Live · as of 09:15:36" and "Table view", with no count and no labels.
- **Covered already?** status.md row 06 lists the row count.

**DSH-15 · minor · The chart page's pane and type badge** (design 06)

- **Design:**
  - Section heads are 12/16/600, uppercase, letter-spacing .04em.
  - The pane is bg-surface with a border-subtle left rule, and its sections are ruled off.
  - The measure and dimension pills are in their role tints at 600, the measure with its aggregation.
  - The type badge is 22 px, radius 999, bg-subtle, 400, reading "Bar, grouped · auto".
- **App:**
  - The headings are not uppercase.
  - The aside is transparent, with no rule.
  - The pills are bg-subtle, 12/400 text-primary, with no aggregation.
  - The badge is 38 × 20 at 600, transparent with a 1 px border, reading "Bar".
- **Covered already?** status.md row 06 covers "Naming the drawn form" only.

**DSH-16 · major · The chart page's "Add to a dashboard…" picker** (design 06, pin 4 and state B)

- **Design:** "＋ Add to a dashboard…" (24 px) opens a searchable picker: "Find a dashboard", then rows with ▦, name and folder.
- **App:** not captured. In the source, a "Dashboard" label, a native `<select>` and an "Add to dashboard" button.
- **Covered already?** status.md row 06 lists it, and T476 named it T406's.

**DSH-17 · major · The Export pane covers the dashboard** (design 13, pins 1–2)

- **Design:** a docked 480 px pane (`1fr 480px`). The dashboard narrows, and its header, with the ⋯ shown pressed, stays in view.
- **App:**
  - `aside.export-pane--over` is fixed at [960,48,480,852].
  - The header stays 1,440 wide, and Bookmarks and "Open my copy" sit under the pane.
  - `main` has `padding-right: 0`, although `main:has(.export-pane--over) { padding-right: 480px }` is meant to apply.
  - The Markdown tile is cut at x 960.

**DSH-18 · minor · The order and groups of the tile menu** (design 08, main screen and state H)

- **Design:**
  - heading;
  - Filter to marked, Filter out marked, Invert marking, Mark all, Unmark;
  - View marked rows…, Drill by ›, Create details tile, Details panel ☐;
  - View as table, View query, Copy ›, Export ›, Edit chart;
  - then the Data as of footer.
  - With nothing marked, "View underlying rows…" takes the place of "View marked rows…".
- **App:**
  - One marked group: Filter to marked, Filter out marked, View marked rows, Drill by ›, Details panel, Invert marking, Mark all, Mark series ›, Unmark.
  - Then View as table, View underlying rows, View query, Copy ›, Export ›.
  - Then Data as of.
  - With nothing marked, both a disabled "View marked rows" and "View underlying rows" appear.
- **Covered already?** Mark series and Mark range are R63 and R66, and belong in the marking group. Edit chart and Create details tile are absent on a shared dashboard under rule 71.

**DSH-19 · minor · The tile menu's heading** (design 08, pin 5 and state H)

- **Design:** three lines: the tile's title (12/16/600, primary); "▪ Marking · 2 of 6 marked" (secondary, with the marking's swatch); and the values, or with nothing marked "Click or drag on the chart to mark" (muted).
- **App:** one line, "● Marking · 0 of 2 marked", 12/16/400 muted.

**DSH-20 · minor · The tile menu's rows** (design 08)

- **Design:**
  - a 14 px icon on each row;
  - each disabled row says why on its right ("mark first");
  - Details panel has a checkbox;
  - "View marked rows…" ends in an ellipsis;
  - the shortcut hints Ctrl+M, Ctrl+Shift+M and Esc.
- **App:** none of these.
- **Covered already?** status.md row 08 lists the Ctrl+M hints.

**DSH-21 · major · The Data as of footer and submenu** (design 08, pin 10 and states C–D; AC-148 depends on it once DSH-01 lands)

- **Design:**
  - A two-line footer with a clock: "Data as of 09:04 today", then "⚡ Pre-aggregation · every hour" or "● Live · from the database".
  - The database submenu: "Answered by the database" / "No pre-aggregation matched this chart's query.", then a key-value row "Data as of: Today 09:27:42 / when Cube answered", then Refresh now and Why not accelerated? (08:303, 477–496).
- **App:**
  - One line, "Data as of 09:15 ›", to the minute.
  - The submenu reads "Answered by the database, not a pre-aggregation", then Refresh now and Why not accelerated?
  - No line in the menu shows the time to the second.

**DSH-22 · minor · The tile menu's width and length** (design 04, state B, against design 08)

- **Design 08:** 284 px wide, 14 rows of 28 px, a 60 px heading and a 44 px footer, about 542 px tall unscrolled. It says nothing on a cap.
- **Design 04, state B:** 250 px and about 360 px.
- **App:** 250 px, `max-height: min(480px, 100vh − 16px)`, scrolling. At 1,440 × 900 it is 250 × 472. With T631–T636's rows it scrolls (`acceleration.spec.ts:252`, T680).
- **Covered already?** No. See Q6.

**DSH-23 · polish · The freshness badge's size** (design 04, `.fresh`)

- **Design:** 20 px, padding 0 7, gap 5, a 6 px dot.
- **App:** 22 px, padding 0 8, and an 11 px "●" glyph. Change it with DSH-01.

## AC-148, with design 04 note 4 built

AC-148's text needs no change, provided DSH-01 and DSH-21 land together in one task:

- **The risk:** if the head says only "● Live", with the time to the second only in the badge's tooltip, a refresh shows the new time only to someone hovering with a pointer. The badge is a non-focusable `<span>`, and today's menu shows minutes only, so a refresh within the same minute would show an unchanged timestamp. That is AC-148's failing state.
- **Why it still holds:** with design 08 state D's submenu ("Data as of · Today 09:27:42 · when Cube answered"), the time to the second stays reachable, by pointer and by keyboard.
- **Its test:** AC-148's test (`refresh.spec.ts`), which reads the head's "Data as of 09:15:34", is then pointed at that line.
- **A related choice:** making the badge's tooltip reachable by focus as well is Q9.

## Measured and passing

- **Rule 1:** every measured text is at least 12 px.
- **Rule 2:** the badge (text-secondary on bg-subtle, 5.91:1), the menu heading (muted on white, 4.56:1 or better) and "Edit in my workspace" (white on the accent, 5.71:1) all pass.
- **Rule 3:** Active and Inactive carry icons; Live pairs its ● with the word.
- **Rule 4:** the 3-series charts have legends.
- **Rule 15:** the tiles are 688 + 16 + 688.
- **Rule 16:** the 17 px inset.
- **Rule 71:** "Edit in my workspace" before a copy exists and "Open my copy" after; no gear on a shared dashboard.
- **Rule 72:** the band shows on the edit page. Settings is DSH-06.
- **Rule 73:** the ownership line "Copied from Shared › Company dashboard 01 · version 1 · Target: Shared".
- **Rule 83:** "No secrets · no bookmarks".
- **Design 04:**
  - the filter band is 53 px with its hint;
  - the tabs are 36 px at 13/600;
  - the h1 is 24/32/600 (design 13 and text-xl agree);
  - ↻ and ⋯ show only on hover.
- **State E:** "In Shared · version 1" at 12/16 secondary.
- **Design 13:**
  - a 480 px pane with a pinned head and foot;
  - the "always in the file" rows;
  - "Bookmarks aren't exported";
  - the three groups with "n of m", All and None, and their "Used by" lines;
  - the secrets line;
  - the foot's counts, the file name and Export file;
  - the header's ⋯ with Export… and Delete dashboard… (design 14).
- **Settings:**
  - a 220 px nav with 32 px rows;
  - the current row on accent-soft;
  - the bar's order;
  - Markings' swatches, Default, the Delete reason and the "marks with it" reason are built.

## Questions for the user

1. **Table view: in the head, or one click away?** Design 04 pin 5 puts it in ⋯; direction rule 5 wants it one click away. T252 kept it in the head, and the question is open as backlog §3 F8.
   - (a) Into ⋯ as drawn, with rule 5 holding only where direct labels are drawn.
   - (b) Keep it in the head.
   - (c) Into ⋯, adding direct labels to every chart of 4 or fewer series.
2. **The header: design 04 pin 1 or state E?** Pin 1 draws the description under the title and a Markings button. State E draws an ownership line, with no description and no Markings button. The Markings button is already open in backlog §3.
   - (a) State E only.
   - (b) State E's ownership line plus the description.
3. **The KPI label and padding.** Designs 04 and 06 draw the label 14/20/600 primary in a 16 px tile. The prototype and the app draw it 12/16/600 secondary, with 12/16 padding on KPI tiles, against rule 16's 16 px.
   - (a) The designs.
   - (b) The prototype.
4. **A table tile's row height.** Design 04 note 7 draws 24 px rows ("the same grid as the editor's drawer"). direction §4 says 34 px, and UX-024 was fixed at 34 px.
   - (a) 24 px.
   - (b) 34 px.
5. **Settings' cards and page metrics.** Design 05 draws cards with 16 px padding, a border-subtle border and a 16 px gap; content at 20/32; a 44 px bar. The prototype, which the app follows, draws `.radio-card` with 12 px padding, a border-strong border and an 8 px gap; `.settings-inner` at 16/24; a bar with no minimum height.
   - (a) Design 05.
   - (b) The prototype.
6. **The tile menu's width and length.**
   - (a) Width: 250 px (design 04 state B, as built) or 284 px (design 08).
   - (b) Length: design 08 draws about 542 px with no cap. The app caps it at 480 px and scrolls. The options are to keep the cap and scroll, to grow to the window, or to pin the Data as of footer outside the scrolling list.
7. **The chart page for a local chart on a shared dashboard.** Design 06's two edit buttons edit in place, which rule 71 forbids, and the design is silent on what replaces them.
   - (a) Nothing, as built.
   - (b) The dashboard's "Edit in my workspace" or "Open my copy".
   - (c) "Open Company dashboard 01" as the primary.
8. **The Export pane's empty groups** ("0 of 0"). Design 13 is silent.
   - (a) List them, as built.
   - (b) Leave them out.
9. **The badge's tooltip from the keyboard.** Design 04 note 4 draws hover only.
   - (a) Make the badge focusable, with its tooltip.
   - (b) Rely on DSH-21's submenu carrying the time to the second.

## Suggested grouping

| Group | Findings and questions | ACs |
|---|---|---|
| The tile head's freshness | DSH-01, DSH-21, DSH-23; Q1 and Q9 if decided | AC-352, AC-148 |
| Whole-number count axes | DSH-02 | AC-352 |
| A table tile's row count | DSH-03; Q4 | AC-352 |
| The KPI ramp | DSH-04, after Q3 | AC-352 |
| The dashboard header | DSH-05; Q2 | AC-352, AC-278 |
| The workspace band over Settings | DSH-06 | AC-352, rule 72 |
| The mode cards | DSH-07; Q5 | AC-352, AC-070 |
| Settings' bar, nav and discard question | DSH-08, DSH-10 | AC-352, AC-073 |
| Settings' control sizes | DSH-09 | AC-352 |
| The chart page | DSH-11 to DSH-15; Q7 | AC-352, AC-126 |
| "Add to a dashboard…" | DSH-16 | AC-022, AC-352 |
| Export docking | DSH-17; Q8 | AC-354, AC-360 |
| The tile menu per design 08 | DSH-18, DSH-19, DSH-20, DSH-22; Q6 | AC-199, AC-247, AC-245 |
