# Re-critique: dashboard view, edit and settings against the design prototype (2026-09-25, after T246–T254, T266, T300–T309)

Produced for T225 (AC-187), dashboards group, by a critique agent that measured with Playwright. Saved verbatim.

## What was compared

- **App:** http://localhost:5600 (production build, API on :4300).
  - Seed `seed-root-dashboard-1` ("Company dashboard 01"), view mode only.
  - **"Critique 0925 tiles"** (`5502276a-ee48-4b6f-9350-d8e95622f8bd`, root folder), which I built through `POST/PUT :4300/api/documents`. Page "Tiles" holds:
    - a Header, 2 KPIs, Markdown (`##`, bold, emphasis, list), a grouped bar, a line, a donut, a table and a pivot;
    - a Divider, Link tiles (button, primary, text), an Image (uploaded 1×1 PNG, with alt text);
    - an incomplete KPI (no chart), a chart with no fields, and a failed chart (`orders.no_such_measure`);
    - a Section holding a two-tab tab group (second tab empty).
    - It also has a second, empty page, and two filters (list on `orders.status`, date range on `orders.ordered_at`).
- **Prototype:** http://127.0.0.1:5500/index.html#explore › "Northwind sales": view, marked, tile menus, edit, Properties, Outline, edit menu and Settings (all five sections).
  - The prototype has no Header, Divider, Image, pivot, donut, failed or loading tile. For those I compared against the rules in its source (`dashboard.js` itemHtml 290–366, `charts.js`).
- **Sizes and themes:**
  - 1440×900 in light and dark, for view, marked, edit and settings.
  - 1280×800 light, for view and edit.
  - 390×844 light, for view.
- **How:** Playwright (Chrome) as a node library.
  - Styles come from `getComputedStyle` and `getBoundingClientRect` on the matching element in each.
  - Chart options come from `echarts.getInstanceByDom().getOption()` in the prototype and from SVG path and text geometry in the app.
  - I looked at the screenshots in `…/scratchpad/critique-dashboard/*.png`.
  - Differences that direction.md §5/§7d accounts for are not counted: `text-muted` #6e6c67 and #97958e, dark `text-on-accent` #1f1f1e, `bg-hover`.
- **Nothing saved on the seeds:**
  - Every edit session on my dashboard ended with Discard.
  - Settings were left with Escape, or by navigating away.
  - The seeds were only viewed.

**Summary:**
- Of the 40 earlier findings (F1–F30 and N1–N10), **32 are FIXED, 5 PARTLY FIXED and 3 STILL OPEN**.
- Of the 35 AC-187 mismatches, **33 are FIXED**:
  - mismatch 10 is partly fixed, as a recorded deviation;
  - mismatch 35 was declined in T249.
- There are **15 new findings**. The major one is N1: KPI tiles lose their title entirely when marked, or while editing at 1280–1440.
- **AC-187 does not conform:** 15 rows of the table in section 4 still differ. Most are small.

## 1. Earlier findings

**F1. Tabs and filter band scroll away: FIXED.** `.dashboard__fixed` (y=128–226) sits outside `[data-testid=canvas-scroll]`, which starts at y=226, the same as the prototype's `.dash-scroll`.

**F2. Filter bar missing, no hint: FIXED.** The band is 53 px in all three states: hint only, two pills, and a marking chip. The hint is 12/16 `text-muted`.

**F3. Header lacks the status badge and Markings button: PARTLY FIXED.**
- Fixed: the 80 px header and the "← Explore / Shared" breadcrumb.
- Still missing: the Published badge, Markings, Preview as and Schedule. The prototype's header holds all four. T246 put them to the user.

**F4. View ⋯ menu incomplete: PARTLY FIXED (AC-199 ticked).**
- The menu now reads:
  - Filter to/out marked, View marked rows, Details panel, Invert marking, Mark all, Unmark, Create details tile;
  - View as table, View query, Copy ›, Export ›, Edit chart;
  - Data as of ›.
- It uses `role=menu`.
- Against the prototype:
  - "View full screen" is absent;
  - "Copy marked values" is not a top-level item. There is a Copy › submenu, which I did not open.

**F5. Marking chip: FIXED.** In both themes it is equal on every property: 24 px, padding 0 2 0 8, `mk1` border, radius 999, swatch 10 px with radius 3 and a ring, name 600, summary secondary, "from" 12/16 muted, buttons 20 px padded 0 4.

**F6. Badge placement: FIXED.** The badge is in the head. Its text is the problem, in N1.

**F7. Sections: FIXED.**
- The band is `color-mix` (computed #fafaf9), 1 px `border-subtle`, radius 6, padded 8 12 12.
- The head is 36 px, the toggle 24×24 with radius 6, the h2 16/22/600, and the count 12/16 muted.
- In view mode it collapses from 212 px to 58, and the toggle reads "Expand Grouped".

**F8. Crowded tile header, truncated titles: STILL OPEN, and worse on KPI tiles.**
- The two freshness pills are now one `.badge` (22 px).
- The measurements are in N1 and N2.

**F9. Dead band under charts: FIXED.** The lowest label ("Components") sits about 6 px above the SVG's 256 px foot.

**F10. Error state: FIXED.**
- The tile keeps its ⋯ (Shift+F10 opens it).
- "Details" (`aria-expanded`) reveals Cube's message with "(HTTP 400)" and the query in a 12/18 `pre`.
- Retry is present.
- Spacing is in N13.

**F11. Empty dashboard: FIXED.** "Empty page" shows "Nothing here yet. Edit the dashboard to add charts." at 14/20 secondary, centred, above a 32 px primary "Start editing".

**F12. Markdown headings: FIXED.**

**F13. Incomplete placeholders: FIXED.**
- A chart with no fields keeps its head. Its message is 12/16 secondary, centred, and ends "…its ✎." in view mode.
- A tile with no chart document shows only the message ("KPI needs a measure…"), with no ✎. The prototype adds "Use ✎ to finish it".

**F14. Tile names: FIXED.** Examples:
- "Chart: Order count."
- "Markdown: Heading two."
- "Tab group: First tab, Second tab."
- "Divider 10 of 18."

**F15. Page spinner while loading: FIXED.** With the dashboard GET held for 4 s, the app draws:
- the 80 px header with placeholders;
- the 45 px tab row and the 53 px band;
- three tile frames with bar and line skeletons;
- "Loading the dashboard…" with its icon.

**F16. Outline: FIXED.** Rows are 28 px, and the page row is 28 px. The chip is 18 px, with glyphs at 12 px against the prototype's 10 (a recorded AC-004 deviation).

**F17. Discard: FIXED.**

**F18. Edit ⋯ menu: PARTLY FIXED.**
- The style equals `.picker`:
  - 250 px, `border-strong`, pop shadow;
  - 28 px items at 12 px;
  - "Move to" heading 24 px, 12/16 muted;
  - Delete in `status-error`.
- Still missing: "Create details tile". The prototype offers it for chart tiles in Markings mode.

**F19. Properties: PARTLY FIXED.**
- Fixed:
  - selection opens Properties;
  - the title is 14/600;
  - Edit chart (primary) and Save to folders… are 24 px, full width (275);
  - the select is 28 px, padded 0 4 0 8, radius 4;
  - the selected ring is 2 px `accent` at offset 2.
- Still missing:
  - the "Use separate color for marked items" switch;
  - swatches in the limit list;
  - "Manage markings…".
- Other differences:
  - Ownership is its own section heading; in the prototype it is a `.lbl` field inside Chart;
  - the limit legend is 24 px tall against 16;
  - the disabled limit's reason is 12/16/600, against the prototype's "(marks with it)" at 12/16/400 muted.

**F20. Edit title and "+ Page tab": FIXED.**

**F21. Edit-mode signal at rest: FIXED.** Tiles have a 1 px dashed `border-strong` outline at offset 2, and the grip is visible.

**F22. Dense chart draws nothing: FIXED** (as before).

**F23. Palette, add slots and sidebar position: FIXED.**
- The sidebar starts at y=226, under the full-width band.
- Palette rows are 50 px with a 24 px chip.
- "＋ Add" is 600, with a 56 px minimum.
- Residuals are in N9.

**F24 and F25. Settings › Markings, General: FIXED.**

**F26. Settings bar and nav: FIXED.**
- The bar is 41 px, padded 8 16, on `bg-surface`.
- Back, Cancel and Save are 24 px at 12 px with radius 6. Save is primary.
- The nav is 220 px, with 32 px rows padded 0 12 0 24; the selected row is `accent-soft` / `accent` / 600.
- The content has an 18 px h2.
- The title and h2 are 600 against 700, a recorded deviation.

**F27. Mode cards: FIXED.**
- The cards are 432 px, padded 12, radius 8.
- The chosen card has 1 px `accent`, a 1 px ring and a 40% tint; the radios are in the accent.
- The copy differs: see N14.

**F28. Inactive banner: FIXED.** It lacks the prototype's bottom rule (N14).

**F29. Escape on settings: FIXED.** With no change, Escape closed the page.

**F30. Dark charts: FIXED.** Axis text is `#5c5b57` in light (`text-secondary`) and the dark palette is used in dark (screenshot `a-mine-dark.png`).

**N1 (old). Tab-group tabs: FIXED.**
- Tabs are 36 px, padded 0 12, at 13/600. The selected tab has a 2 px `accent` underline; the others are secondary.
- The group sits in its own band inside the section, as in `dashboard.js:359`.

**N2 (old). Below 1024 px: PARTLY FIXED.**
- Fixed at 390×844:
  - tiles are one column (all 342 px wide);
  - there is no Edit or gear.
- Still open:
  - The filter bar is not a sheet (direction §2). It wraps to 133 px, so the header (80), tabs (45) and band (133) hold 258 px fixed out of 796 px below the app bar.
  - Every chart title is still ellipsized (N2 new).
  - The document is 845 px wide because the app bar overflows. That is the shell group's surface.

**N3 (old). Linked tiles claim marked items but draw none: STILL OPEN** (AC-097 and AC-104 are open). After marking "Components" in the bar tile:
- the donut shows "Marking: 1 marked" with every slice faded;
- the line shows the same badge and nothing is faded;
- the table and pivot show the badge with no row marked (screenshot `a-marked-light.png`).
- The prototype's KPIs show "Marked $406.7K · 22%". The app's KPIs show only the badge.

**N4 (old). Tile menus to `.picker`: FIXED on style.** The height is new finding N7.

**N5 (old). Header element: FIXED.** It is 20/26/600 with no chrome, matching `.dplain` h2 at 20 px with line-height 1.3.

**N6 (old). Markdown: FIXED.**
- `##` is drawn at 20/26/600 primary; the body is 14/22 secondary.
- Residual: `p` has an 8 px bottom margin against the prototype's 0 (`<p style="margin:0">`). Margin is not one of AC-187's properties.

**N7 (old). Chart font: FIXED.** SVG text is `Inter, system-ui, sans-serif`, 12 px, `tabular-nums`.

**N8 (old). Band height shifts: FIXED** (53 px in every state).

**N9 (old). Markdown names: FIXED** ("Markdown: Heading two.").

**N10 (old). The chip ▾ menu has only "Unmark": STILL OPEN.** It is 220×38 with one item. The prototype has five: Filter to marked, Filter out marked, View marked rows, Copy link with marks, Unmark.

**The 35 AC-187 mismatches of 2026-09-24:**
- **FIXED:** 1–9, 11–34.
  - Measured equal as listed under F-items above, and in section 4.
  - 11 has one residual: the badge gap is 6 against 4.
  - 34 has one residual: `.chk` is 26 px against 25.
- **Partly fixed:** 10. There is one badge now, but it is not status-coloured and not hidden while marked. This is recorded in T252 because AC-013 needs it.
- **Declined:** 35. T249 recorded it. The app's segmented control is 420 px wide; the prototype's is 872.

## 2. New findings

**N1. Tile titles are squeezed out of the head; KPI titles vanish (major)**
- **Measured** (title box against its text width, `.tile-head__title`):
  - 1440×900, after marking one bar:
    - KPI (336 px tile): **0 / 81.1 px**, so no title is drawn;
    - donut (453 px): 80.9 / 155.2, "Orders by…";
    - table: 83.5 / 83.9;
    - pivot: 80.9 / 83.6.
  - 1280×800, edit mode: KPI (221 px) **0 / 81.1**; donut 74 / 155.2.
  - 1440×900, edit mode: KPI 35 / 81, "Or…".
  - Screenshots: `a-marked-light.png`, `a-1280-light-edit.png`.
- **Cause, against the prototype:**
  - The badge reads "■ Marking: 1 marked" (136.5 px); the prototype's `.mbadge` reads "■ 1 marked" (77.9 px), with the name in its `title`.
  - KPIs carry a freshness badge and a ⊞ Table view. The prototype's KPIs carry neither (`kpi || n ? '' : badge`).
  - The head reserves `padding-right: 90px` for ↻ ✎ ⋯. The prototype's in-flow ✎ ⋯ take 54 px.
- **Class:** (b) AC-201's SHALL ("in a chart tile's header row, beside its title"). No title remains for the badge to be beside. Its Fails-when names only "pushes the title down". This also contradicts T250's record that "every tile keeps its title".

**N2. Titles that fit are still ellipsized by under a pixel (minor)**
- `.tile-head__title` is `flex: 1 1 auto` and shrinks with the badge.
- Measured:
  - 1440, unmarked: "Order count" box 80.67 against text 81.06, shown as "Order cou…" (`kpi-clip.png`);
  - 390×844: 7 of 7 chart titles cut, for example "Orders per month" 118.7 against 119.3, and "Orders table" 83.8 against 83.9.
- **Class:** (d).

**N3. Link tiles are drawn as tiles, and their buttons off the button rule (minor)**
- The tile (`[data-tile=tile-link-*]`): padded 16, 1 px `border-subtle`, `bg-surface`. The prototype's `.dplain.dlink` has no padding, border or background.
- The button (`.link-tile--button`) has radius **4** against `.btn`'s 6.
- `.link-tile--primary` is weight **400** against `.btn.primary`'s 600.
- `.link-tile--text` is 14/400 against `.linklike`'s 600 with underline.
- A URL target has no "↗", which the prototype adds.
- **Class:** (a) AC-187 buttons (radius, weight) and tiles (padding, border, background).

**N4. The Image tile keeps tile chrome in view mode (minor)**
- `[data-tile=tile-image]` is padded 16, with a 1 px `border-subtle` and `bg-surface`.
- The prototype draws it with `padding:0; background:none; border-color:transparent` (dashboard.js:327).
- Direction §2 says an image "in view mode has no tile chrome".
- **Class:** (a) AC-187 tiles (padding, border colour, background).

**N5. Chart legend and bars use ECharts defaults, not the prototype's options (minor)**
- **Legend:**
  - App: centred (x 184–470 of a 654 px SVG), with 25×14 swatches.
  - Prototype: `left: 0`, `roundRect`, 10×10, `itemGap 8`.
- **Bars:**
  - App: 71.2 px wide.
  - Prototype: `barMaxWidth: 36`, `barCategoryGap: '28%'`.
- **Bar ends:** in a grouped (unstacked) bar only the last series gets the 4 px data-end radius.
  - The blue and orange paths are square (`M68.3 37.96 L139.5 37.96…`); the aqua path has `A4 4`.
  - The cause is `packages/charts/src/series/bar.ts:100–105`: `outermostAt` returns `series.length - 1` when not stacked.
  - The prototype's `barItem` rounds every bar, as direction §6 does.
- **Class:** (a) AC-187 tiles (legend swatch height 14 against 10; bar radius 0 against 4). These are chart options, as T254 treated the grid and font.

**N6. Segmented control's pressed state is not `accent-soft` (minor)**
- `.seg button[aria-pressed=true]` is `color-mix(accent 12%, surface)` (`styles.ts:602–606`), against the prototype's `var(--accent-soft)`.
- Light: rgb(228,238,241) against #e3f0f4.
- Dark: rgb(34,46,49) against **#173640**, visibly flatter (`a-set-cf-dark.png`).
- There is no recorded deviation.
- **Class:** (a) AC-187 buttons (colour token).

**N7. The tile ⋯ menu has no height cap, so it flips over the app bar and over its own ⋯ (minor)**
- The marked menu (`[popover]:popover-open`) is 250×**460**. The prototype's `.picker` has `max-height: 280px; overflow: auto`.
- Opened from ⋯ at (669,424), it lands at x 445–695, y **8–468**: over the 48 px app bar and over the ⋯ button.
- T266 records that the menu is "kept inside the dashboard canvas", whose top is y=226.
- **Class:** (a) AC-187 tiles (menu height against the picker's `max-height`).

**N8. "Shift and F10 open its menu" is announced on a tile that has no menu (minor)**
- `[data-tile=tile-nofields]` is named "Chart: No fields yet. Shift and F10 open its menu."
- Focused, Shift+F10 opens nothing (`menuOpen: false`). The failed tile and the KPI do open.
- **Class:** (b) AC-246, whose Fails-when includes "the keys do nothing" on a focused chart tile.

**N9. Edit canvas and sidebar sizes (minor)**
- **Add slot:** `.grid-canvas__add` beside an 80 px tile is **80 px** tall. `.dadd` has a 56 px minimum in an `align-items: start` grid, so the prototype's stays 56.
- **Template rows:** `[data-testid=template-kpis]` is **52** px (a 2 px label/hint gap) against 50.
- **Palette spacing:** rows are 4 px apart against 8 (`.section` gap).
- **Class:** (a) AC-187 edit sidebar (template-row height) and tiles (add-slot height).

**N10. An empty tab in a tab group draws nothing (minor)**
- "Second tab" shows only the tab strip in a 67 px band.
- The prototype's `gridHtml` prints "Nothing here yet. Edit the dashboard to add charts." in view mode.
- **Class:** (d). AC-207 covers page tabs only.

**N11. Filter pill value control (minor)**
- `.filter-pill__summary` is padded 0 2 with radius 6, and ends in a 6 px "▾" glyph in `text-muted`.
- The prototype's `.fw select` has padding 0, radius 0 and the native arrow.
- **Class:** (a) AC-187 filter bar (padding, radius). The radius shows only on hover and focus.

**N12. Transparent-border and crumb differences (minor, mostly invisible)**
- "← Explore" has a 0 px border against `.btn`'s 1 px transparent, which makes it 2.4 px narrower.
- The section toggle has a 0 px border against `.iconbtn`'s 1 px transparent.
- "+ Page tab" has a 1 px transparent border all round, against `.dash-tabs button`'s 0 0 2 0.
- The folder crumb is a 20 px link padded 2 4 with radius 4, against a 16 px plain `span.muted`.
- **Class:** (a) AC-187 header and page tabs (border width, padding).

**N13. Failed tile layout (minor)**
- Retry and Details are 0.7 px apart: `.tile-error__actions` is `display: block` with no gap.
- The headline is 14/400 with ⚠ in `text-primary`, not the `status-error` icon colour.
- There is no prototype rule for this state.
- **Class:** (d).

**N14. Settings › Interactions copy and nav labels (minor)**
- The prototype's intro ("How clicking a chart affects…") is absent.
- The footnote reads "The configuration of the mode you are not using is kept, not cleared." instead of "Switching clears any current marks or cross-filters…". Direction §2 says switching clears them; the page does not say so.
- The nav "Active" is an icon with secondary text, against a `.badge` in `status-ok`.
- The inactive banner lacks `.warnbar`'s 1 px bottom rule (36 px against 37).
- **Class:** (d).

**N15. KPI tiles take part in marking, where the prototype excludes them (minor, for the user)**
- In the KPI's ⋯ menu, "● Marking · 0 marked" heads Filter to/out marked, View marked rows, Details panel, Unmark and Create details tile.
- Once marked, the KPI shows "Marking: 1 marked".
- The prototype skips KPIs (`isKpi` in markedRowsMenu and the badge), and instead writes "Marked $X · p%" under the value.
- Settings lists the KPI as "Marks with: Marking (default)", so AC-201's "a tile that does not mark" is arguable.
- **Class:** (d). This feeds N1.

## 3. Checks that pass

- **Rule 1:** no text under 12 px. Text nodes checked: view 187, marked 218, edit 258, Outline 268, each settings section 203–237.
- **Tabular numerals:** on axes, in table and pivot cells, and on the KPI value.
- **Rule 3:** "⚠ Could not load this chart", "✓ Active" and "◷ Inactive" each pair an icon with a label.
- **Rules 15–17:**
  - a 12-column, 16 px grid (tiles 336, 688 and 1392 at 1440);
  - tile padding 16, radius 6, no shadow;
  - controls 32 px, Properties and Outline rows 28 px, chips 24 px.
- **Dark theme:** every measured component resolves to the dark tokens. The only differences are the §5 replacements and N6.

## 4. AC-187 conformance table (1440×900; dark checked on the same selectors)

| Component | Property | App | Prototype rule | Conforms |
|---|---|---|---|---|
| Dashboard header | height / padding / gap | 80 / 12 24 0 / 12 | 80 / 12 24 0 / 12 | yes |
| | h1 | 24/32/600, −0.24 px | same | yes |
| | "← Explore" | 24 px, 0 8, r6, 12/16, primary, **border 0** | `.btn.ghost.sm`, border 1 px transparent | no (N12) |
| | folder crumb | link 20 px, pad 2 4, r4, muted | span 16 px, no pad, muted | no (N12) |
| | Edit / gear | 32, 0 12, r6, 14/600, accent / 32×32 r6 | same | yes |
| | edit bar | Undo/Redo 32, 14 px secondary, .4; Discard 32 14/400 `border-strong`; Save primary 600 | same | yes |
| | "Editing" | 20/32/400 muted | same | yes |
| Page tabs | tablist | 45, pad 8 24 0, 1 px `border-subtle`, gap 4 | same | yes |
| | tab / selected | 36, 0 12, 13/600 secondary / primary + 2 px accent | same | yes |
| | "+ Page tab" | 24, 0 8, 12/600 secondary, r6, **border 1 px all** | border 0 0 2 0 | no (N12, invisible) |
| | tab-group tabs | 36, 0 12, 13/600, accent underline | same | yes |
| Filter bar | band | 53 (hint, pills, chip), pad 10 24, `bg-page`, 1 px rule, gap 8 | 53, same | yes |
| | hint | 12/16 muted | same | yes |
| | pill | 32, 0 6 0 10, 1 px `border-strong`, r6, 13 px, surface | same | yes |
| | scope tag | 22, 12/600 muted, 1 px subtle, r3, 0 4 | same | yes |
| | pill value control | 28, 13/600, **pad 0 2, r6** | select 28, 13/600, pad 0, r0 | no (N11) |
| | marking chip | 24, 0 2 0 8, mk border, r999, 12 px, name 600, parts as the prototype | same | yes |
| Tiles | chart tile | pad 16, 1 px subtle, r6, surface, no shadow | same | yes |
| | head / title | 22, gap 8, mb 8 / 14/20/600 | same | yes |
| | freshness badge | 22, 0 8, r999, 12 px, `bg-subtle`, secondary | `.badge` | yes |
| | marking badge | 20, 0 6, 1 px strong, r999, 12/600 secondary on subtle, swatch 8 r3 ring | same | yes (text: N1) |
| | action buttons | 26×26 r6, hidden at rest | same | yes |
| | KPI | pad 12 16; value 32/36/600 tnum; label 12/16/600 secondary; **head 22** | head 20 (no badge) | no (N1) |
| | table / pivot | th 28 12/600 subtle sticky 0 8; td 34 12 tnum 0 8; num right | `.grid-table.comfy` | yes |
| | Markdown | body 14/22 secondary; `##` 20/26/600 | same | yes |
| | Header / Divider | 20/26/600, no chrome / 1 px `border-strong`, margin 8 0 | same | yes |
| | section | band mix, 1 px, r6, 8 12 12; head 36; toggle 24 r6; h2 16/22/600; count 12/16 muted | same | yes |
| | Link tile | **pad 16, border, surface; button r4; primary 400** | no chrome; r6; 600 | no (N3) |
| | Image tile (view) | **pad 16, 1 px border, surface** | pad 0, transparent, none | no (N4) |
| | incomplete chart | 12/16 secondary, centred | same | yes |
| | chart text | Inter 12 px tnum, secondary | same | yes |
| | chart legend / bars | **25×14 centred / 71 px, r4 on last series only** | 10×10 left / max 36, r4 each | no (N5) |
| | ⋯ menus (view, edit) | 250, strong, pop shadow, r6, pad 4; items 28 12 px 0 6 r4; heading 12/16 muted; Delete error; **height 460** | same; max-height 280 | no (N7) |
| | edit outline / selected / grip / grid bands | dashed 1 px strong +2 / 2 px accent +2 / 14/14 muted 2 4 r4 / 4% accent | same | yes |
| | "＋ Add" slot | dashed strong, r6, 600, secondary; **80 px beside a taller tile** | min-height 56, top-aligned | no (N9) |
| Edit sidebar | panel, tabs | 300, left rule, top 226; tabs 37/36, 0 10, 12/600, accent + 2 px | same | yes |
| | palette row / chip | 50, 6 8, 1 px subtle, r6, gap 10 / 24 r4 role-dim on soft | same | yes |
| | template row | **52**, dashed strong | 50 | no (N9) |
| | headings | 12/16/600 uppercase .04em secondary | same | yes |
| | Properties controls | select 28 12 px 0 4 0 8 r4; buttons 24 full width | same | yes |
| | Outline | rows 28, chip 18 | same (glyph 12 vs 10, recorded) | yes |
| Buttons/inputs (settings) | bar, Back/Cancel/Save | 41, 8 16; `.btn.sm` 24 12 px r6; Save primary | same | yes |
| | nav | 220; rows 32, 12 px, 0 12 0 24; selected accent-soft/accent/600 | same | yes |
| | Name / Folder / Description | 32 r4 strong 0 8 / 0 4 0 8 / 6 8 | same | yes |
| | mode cards | 432, 12, r8, strong; chosen accent + ring + 40% tint | same | yes |
| | markings tables | th 28, rows 29, input/select 28, slot 22×24, "+ New marking" 24 | same | yes |
| | limit pill | **26** | `.chk` 25 | no (1 px) |
| | `.seg` pressed | **mix(accent 12%)** (dark #222e31) | `accent-soft` (dark #173640) | no (N6) |

**Verdict:** AC-187 does not conform for this group. 15 rows differ.
- 4 rows are invisible or 1 px: the transparent borders, the folder crumb and the 26 px limit pill.
- The substantive ones are the Link and Image tiles, the chart legend and bars, the KPI head, the menu height, the `.seg` tint, and the add and template row heights.

**Relevant files:**
- `docs/design/prototype/index.html`:
  - `.btn` 551–582; `.seg` 609–630; `.picker` 955–992; `.badge` 1014; `.tile` 1039–1066; `.grid-table` 1089–1126;
  - `.dash`/`.filterbar`/`.fw` 1217–1317; `.md` 1359; `.dlink`/`.dplain` 1874–1912; `.mchip`/`.mbadge` 1967–2034;
  - settings 2107–2205; `.dsection-head`/`.dadd` 2228–2257.
- `docs/design/prototype/dashboard.js`: tile menus 243–274; itemHtml 290–366, with the image at 322 and the link at 329.
- `docs/design/prototype/charts.js`: `chrome()` 102–157; `barItem` 160; bar series 270–300.
- App causes:
  - `packages/charts/src/series/bar.ts:100–124` (N5);
  - `packages/web/src/shell/styles.ts:602–606` (N6).
- Scripts and screenshots: `/private/tmp/claude-501/-Users-srajagopal-Work-wechart/390bc406-66bd-4e41-8657-c5005c38ab2c/scratchpad/critique-dashboard/`.
