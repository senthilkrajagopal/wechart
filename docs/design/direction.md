# wechart design direction

**Status:** proposed on 2026-09-19. Waiting for the user to accept it after reviewing the prototype.
**Phase 2 (2026-09-25):** principles 6–9, §7e and rules 59–89 extend this direction to sign-in, folder access, workspaces, proposals, history, bookmarks, the audit trail, the country map and the box plot. Evidence: `references.md` › "Phase 2". **Accepted by the user on 2026-09-25.**
**R78 (2026-10-17):** §7f and rules 90–108 extend it to the SQL runner workspace and personal access tokens. Evidence: `references-sql-runner.md` (its checklist rules 107–125, renumbered here and amended for R78's answers) and designs 17 and 18 (`reviews/2026-10-17/designs/`). **Accepted with designs 17 and 18 on 2026-10-17** ("Approve with defaults (Recommended)"; the defaults taken are in that review's `index.md`). Rule 107's Ctrl+Q and Ctrl+Alt+[ and ] wait on `docs/research/keyboard-shortcuts-sql-runner.md` (17-Q3, "Research first").
**R80 (2026-10-18):** §7h and rules 115–146 extend it to the combo chart, the Text tile (which replaces Markdown), dashboard parameters and the AI provider settings. Evidence: `references-combo-and-rich-tiles.md`, `references-spotfire-combo-textarea.md`, `references-copilot.md` §9, research `rich-tiles-and-combo-tech.md`, and designs 20–22 (`reviews/2026-10-18/designs/`). **Proposed; waiting for the user's approval of designs 20–22.**
**R81 (2026-10-18):** §7i and rules 147–167 extend it to fifteen new chart types: the KPI with comparison, target, sparkline and tile-by; the graphical table; waterfall; histogram; bubble; map layers; parallel coordinates; bullet chart; 100 % stacked bar and area; Sankey; box plot points and violin; funnel; timeline; calendar heatmap; icicle and sunburst. Evidence: `references-new-chart-components.md` and design 23 (`reviews/2026-10-18/designs/23-new-chart-types.html`). **Proposed; waiting for the user's approval of design 23.**
**Sources:**

- `references.md`: six enterprise BI products studied, with a committed direction.
- `observations-local.md`: values measured in the running Superset 6.1 and Metabase 0.63 instances.
- The dataviz method: validated palettes.

User roles are **provisional** until the requirements interview. Input IDs (IN-x) refer to `docs/inputs/2026-09-19-product-direction.md`, as labelled in `references.md`.

> **Direction.** One dense, three-pane analytical workbench shared by chart building, dashboard authoring and semantic-layer administration:
>
> - a **typed tree** on the left, a **live canvas** in the centre, and a **docked inspector** on the right;
> - Spotfire's linked-analysis behaviours (marking, trellis, related filtering), carried through Tableau- and Power BI-style **typed encoding wells**;
> - Show Me-style **ranked chart recommendations, each with a reason**;
> - every model object editable in **synchronized code and form views**, backed by Looker- and Power BI-style **jobs, history and test-as-role** screens.
>
> It is built to the depth of Superset, Metabase, Spotfire and Tableau, not a starter playground (`docs/inputs` §5).

## 1. Principles

1. **One object, many views.** A measure edited by the model engineer is the same object the analyst drags and the consumer reads in a tooltip. Any object opens in its other views ("Open in model", "Used by 4 charts") without changing applications.
   _Evidence:_ Looker's "Go to LookML" from its PDT page, and the shared tree/canvas/inspector shape of Superset Explore, the Looker IDE, and Metabase's metadata admin. _Roles:_ all three.
2. **Recommend, explain, never override silently.** The system proposes a chart and shows ranked runners-up, each with a one-line reason. A manual pick is pinned ~~until the user clicks "Back to recommended"~~ through later field changes until the user chooses Auto, or Use on the Recommended card (R76, 2026-10-08; AC-032).
   _Evidence:_ Tableau Show Me explains requirements; Power BI has the manual-pick rule; Metabase splits "recommended" from "More charts". None of them ranks with reasons, which is exactly IN-3. _Role:_ analyst.
3. **Linked by default, in the dashboard's chosen mode.** Each dashboard picks one interaction mode in its settings (user decision 2026-09-19, `docs/inputs` §11–12):
   - **Markings** (Spotfire): clicking marks items in a named, coloured marking. Every tile using that marking, on every page tab, shows the marked share and fades the rest. Details tiles are limited by markings.
   - **Cross-filtering and cross-highlighting** (Power BI and Superset): clicking filters or highlights the other tiles, set per tile pair to Filter, Highlight or None.

   Either way the result shows as chips that can be cleared, with no wiring needed.
   _Evidence:_ Spotfire markings (`references-markings.md`), Power BI's interactions matrix, Superset cross-filters, and Looker's chips. _Role:_ consumer.

4. **Dense but legible.** 12 px is the smallest text, controls are 28–32 px, and each row shows the most information that still reads cleanly. Figures use tabular numerals wherever they align.
   _Evidence:_ Superset's charts, where 12 px makes up 63 of 92 text nodes; Metabase's 12–13 px body text; the Fluent 2 ramp. _Role:_ analyst and engineer.
5. **Every state has a shape.** Status, validation, and job state always pair an icon with a label, never colour alone. The inspector is the complete path to every setting from the keyboard; on-canvas editing is only a shortcut.
   _Evidence:_ Superset's alert icons, and Power BI's own statement that its on-object mode has accessibility gaps. _Roles:_ all three.

Phase 2 adds four (evidence in `references.md` › Phase 2):

6. **Show only what's permitted, and never hint at the rest.** Hidden folders, items, counts, search hits and links behave as if they don't exist.
   _Evidence:_ Metabase ("won't be listed"), Spotfire ("will not be seen"). _ACs:_ AC-264, AC-268. _Roles:_ all.
7. **Access is read where it applies.** Every group that reaches a folder is shown on that folder, and an inherited one names the folder it comes from.
   _Evidence:_ Looker's inheritance indicator, Grafana's locked inherited rows, Tableau's effective permissions. _ACs:_ AC-259–AC-261. _Roles:_ Super-Admin, Admin.
8. **Private until proposed, and nothing lands unreviewed, your own work included.**
   _Evidence:_ Power BI's workspace as a "staging area", Sigma's Draft, Looker's Development Mode, GitHub pull requests. _ACs:_ AC-278, AC-284, AC-286. _Role:_ Admin.
9. **The reviewer sees the thing, not a description of it.**
   _Evidence:_ GitHub's Files changed, Power BI's Change review, Grafana's Changes and Compare. _AC:_ AC-287. _Roles:_ Admin, Super-Admin.

## 2. Layout

**App shell**

- Top bar, **48 px**:
  - Left: product mark, then the workspace switcher (**Explore · Dashboards · Model · Data sources · Security · Jobs · Admin**).
  - Right: global search (⌘K), "+ New", notifications, and the user menu.
- Superset's top bar is 61 px. wechart trims it to 48 px because the secondary headers carry the title rows.

**Workbench panes** (all three surfaces use them)

| Pane            | Default           | Range              | Behaviour                                                                   |
| --------------- | ----------------- | ------------------ | --------------------------------------------------------------------------- |
| Left tree       | **280 px**        | 220–400, resizable | Collapses to a 40 px rail. Search sits at the top. Groups can be collapsed. |
| Centre canvas   | fluid, min 560 px | —                  | The chart, the dashboard grid, or the code/diagram editor.                  |
| Right inspector | **320 px**        | 280–480, resizable | Sectioned tabs. Collapses to a 40 px rail.                                  |
| Bottom drawer   | 0 or 240 px       | 160–50%, resizable | Results/SQL/Query info in Explore, Problems in Model, Logs in Jobs.         |

- Widths come from the local measurements: Superset's Explore source panel is 300 px, its controls column 320 px, and its filter panel 260 px.

**Dashboard**

- **12-column grid**, **8 px** row unit, **16 px** gutter.
- A new chart tile is 4 columns wide; a KPI tile is 3. Sizes change only on the canvas: drag the tile's right edge, bottom edge or corner, or press Shift+Arrow keys. There are no width presets and no size fields (user feedback in `docs/inputs` §8; Grafana 13 in `references-dashboard-authoring.md`).
- The dashboard is fixed-width and centred (max **1440 px**), with a toggle for full width.
- Structure (Grafana 13's grammar, `references-dashboard-authoring.md`):
  - **Page tabs** at the top.
  - **Sections** (titled, collapsible, header can be hidden in view mode) inside page tabs.
  - **Tab groups** only inside a section. Adding one elsewhere wraps it in a new section.
  - **Chart, Markdown, Header, Divider, Image, Link/button** inside any of these (Image and Link/button were the user's choice on 2026-09-19, `docs/inputs` §9; iframe embeds are out of phase 1).
  - **Image:** PNG, JPEG, WebP, GIF or SVG up to 2 MB, stored with the dashboard, with required alt text (flagged on the tile until set) and Fit inside or Fill and crop. In view mode it has no tile chrome.
  - **Link/button:** a label; a style of Button, Primary or Text link; and a target that is either another dashboard (optionally passing the current filters) or an http(s) URL opened in a new tab with `rel="noopener noreferrer"`. Any other URL scheme is rejected.
  - No Row/Column containers; the 12-column grid does that job. Section templates come from Metabase.
- Tabs load lazily.

**Dashboard edit mode** (`references-dashboard-authoring.md`, recommended model)

- An explicit **Edit** switches the dashboard in place. The edit bar shows Undo, Redo, "Discard (n changes)" and Save (⌘S).
- A docked **edit sidebar**, 300 px, with three tabs:
  - **Add:** the element palette (click to insert after the selection or into the chosen "+ Add" slot, or drag onto the canvas), "Chart from folders" with search, and section templates.
  - **Outline:** the tree of page tabs, sections, tab groups and tiles. Clicking a row selects and scrolls to it.
  - **Properties:** settings for the selected element, or for the dashboard when nothing is selected.
- The canvas shows a faint 12-column grid while editing, and a stronger one during a drag or resize. A resize shows a live readout ("6 / 12 cols · 50% · 320 px").
- A tile can be moved by dragging its grip or header. A drop marker shows where it will land. Dropping onto a page-tab or tab-group label moves the tile to the end of that tab.
- Each tile's ⋯ menu offers Duplicate, Move to (page tab, tab group or section, excluding its current container), and Delete. Deleting anything shows a toast with Undo.
- Deleting a non-empty section asks whether to delete its items or ungroup them (keep the items).
- **Chart ownership** (user decision 2026-09-19, `docs/inputs` §9):
  - A chart created on a dashboard (new chart, section template, or Duplicate) belongs to that dashboard only and never appears in Explore folders.
  - "Save to folders…" (in the tile menu or Properties) publishes it as a shared chart.
  - "Chart from folders" adds a shared chart, which stays linked. In edit mode its tile shows a ⛓ badge.
  - Properties and the editor header say that a chart is shared and on how many dashboards, with a warning when more than one dashboard uses it.
  - "Make a local copy" (in the tile menu, Properties or the editor header) detaches the tile, keeps any edits made so far, and leaves the shared chart unchanged.
  - Undo and Discard also revert chart edits, new local charts, publishing and detaching.
- A tile's ✎ pencil opens the chart editor as a full-viewport overlay with "← Back to _dashboard_". From view mode, the pencil switches the dashboard into edit mode first.
- Inside the editor: its own Undo/Redo, "Discard changes", "Save dashboard" (applies the chart and saves the dashboard), an Actual size / Fit preview at the tile's own size, and Esc = Back (keeps the changes).

**Dashboard settings page** (gear icon in the dashboard header, in view and edit mode; user request 2026-09-19)

- Full-viewport, like the chart editor, with "← Back to _dashboard_", Cancel and Save settings. Esc cancels, and asks first if there are unsaved changes.
- Sections in the left nav:
  - **General:** name, folder, description.
  - **Interactions:** Markings or Cross-filtering and cross-highlighting, as radio cards. Both configurations are kept; only the selected one is active, and the nav labels each section active or inactive. Switching clears current marks and cross-filters.
  - **Markings:** the marking list (colour slot, name, default, "Used by n · limits n", Delete; + New marking) and a "Tiles and markings" table (which marking each tile marks with, and which markings limit it).
  - **Cross-filtering:** the default action for tile pairs (Filter, Highlight or None) and the source → target matrix.
  - **Layout:** page width, either fixed (1,440 px) or full width.
- Saving in view mode saves the dashboard. While editing, a save is one undoable change, and Discard reverts it.

**Filter bar**

- Horizontal, under the title (the Metabase and Looker pattern). Optionally it can be a left vertical panel 260 px wide (Superset).
- *From R79 (2026-10-17, design 19):* the bar sits in the header's sheet, under the compact row, closed by default; the compact row summarises it with the Filters toggle's count and compact chips. See §7g.
- Each filter shows its scope badge: dashboard, tab, or tile. Filters created by "Filter to / Filter out marked" appear here as ordinary removable filters.
- The right-hand group holds the interaction chips: one **marking chip** per non-empty marking in Markings mode, or cross-filter chips in cross-filter mode. When the group is empty it shows a one-line hint, for example "Click, drag or Alt+drag to mark · Ctrl/⌘ adds or toggles · Esc unmarks".

**Breakpoints**

- **≥1280:** all panes shown.
- **1024–1279:** the inspector overlays the canvas.
- **<1024:** view mode only. Dashboards stack to one column, and the filter bar becomes a sheet.

## 3. Type scale

Family: **Inter**, falling back to `system-ui, -apple-system, "Segoe UI", sans-serif`. Code: **IBM Plex Mono**, falling back to `ui-monospace, Menlo`. Superset measured `Inter, Helvetica, Arial`.

| Token            | px size / line height | Weight      | Use                                                          | From                                                  |
| ---------------- | --------------------- | ----------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| `text-xs`        | 12/16                 | 400         | axis ticks, legend, data labels, field-tree and file-tree rows, inspector fields (R76, 2026-10-08: Explore's folder tree is `text-sm` rows under a `text-md` heading, as designs 04, 07, 09 and 14 draw it) | Superset charts (12 px measured), Fluent Caption 1    |
| `text-xs-strong` | 12/16                 | 600         | grid headers, inspector section labels, well pills           | Fluent Caption 1 Strong                               |
| `text-sm`        | 14/20                 | 400         | forms, menus, dialogs, Markdown body, tables                 | Superset body (14 px measured), Fluent Body 1         |
| `text-sm-strong` | 14/20                 | 600         | tile titles                                                  | Metabase card titles 14/700 (measured)                |
| `text-md`        | 16/22                 | 600         | pane headers, small Header element                           | Superset chart titles 16/500 (measured)               |
| `text-lg`        | 20/26                 | 600         | page titles, medium Header element                           | Metabase dashboard title 20/700 (measured)            |
| `text-xl`        | 24/32                 | 600         | dashboard title, large Header element                        | Fluent Title 3                                        |
| `text-kpi`       | 32/40                 | 600, `tnum` | KPIs in a multi-KPI row                                      | Superset big number 36 px (measured), Fluent Title 1  |
| `text-kpi-solo`  | 40/52                 | 600, `tnum` | a tile with a single KPI                                     | Metabase scalar 54 px (measured) sets the upper bound |

- **Floor:** no text smaller than 12 px.
  - **The floor is absolute** (R76, 2026-10-08, components-Q5). No design drawing overrides it. A design's 11 px text, glyph chips and tags included (the cube picker's C/V chip, design 03's tree tag), is built at 12 px, and no 11 px exception is recorded in §7d. The WebKit native select below is a platform limit, not a design choice, and stays the only exception.
  - **One platform exception, found at T019 and corrected by measurement on 2026-09-20.** The original wording said WebKit "ignores author `font-size` on `<option>`" and that "the closed control inherits our type". Both halves were wrong; measuring each engine directly (`docs/research/webkit-select-font-size.md`) gives:
    - `font: inherit` on a `select` does **not** take in WebKit — the control computes to **11 px**, its UA default, where Firefox honours it and reports 14 px.
    - An explicit `font-size` on `option` **is** honoured: WebKit reports 20 px for `option { font-size: 20px }`. So the option half is fixable and was never the platform limit.
    - The `select` itself stays at 11 px in WebKit even with an explicit `font-size`. That is the real exception, and it is the **closed** control — the part read without opening anything.
  - The rendered audit walks text nodes, and a `select`'s text lives in its `option` children, so skipping `option` also hid the closed control. The decision (2026-09-20) is to accept 11 px for native selects in WebKit rather than replace them with custom listboxes. Any surface that must meet the floor in a dropdown needs a custom listbox.
- **Weights:** only 400 and 600 are used.
- **Numerals:** tabular figures (`tnum`) in tables, axes and KPIs.

## 4. Density and spacing

| Token          | Value                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base unit      | 4 px                                                                                                                                                      |
| Spacing scale  | 4, 8, 12, 16, 24, 32, 40. Use 2 and 6 only for icon alignment.                                                                                            |
| Control height | **32** by default (buttons, inputs, filter widgets; Metabase measured 32); **28** compact (tree rows, inspector rows); **24** small (well pills, chips)   |
| Table rows     | **34** by default (admin lists); **24** dense (result grids, table tiles, logs). Superset's list rows measured 45–48, and wechart is deliberately denser. Table tiles moved from 34 to 24 dense, the editor's results grid, as design 04 note 7 draws them (R76, 2026-10-08, dashboard-Q4). |
| Cell padding   | 8 px inline                                                                                                                                               |
| Tile           | 16 px padding, **6 px radius** (Superset and Metabase both measured 6 px), 1 px border in `border-subtle`. Tiles have no shadow at rest.                  |
| Radius         | 6 px for containers, 4 px for controls and pills, and 999 px for chips                                                                                    |

## 5. Color

**UI roles.** Contrast ratios below are WCAG ratios computed on 2026-09-19.

**Re-derived 2026-09-19 at T002.** The ratios first published here were computed against `bg-surface` (white / `#1c1c1b`) alone. Text also sits on `bg-page`, `bg-raised` and `bg-subtle`, and five tokens fell below 4.5:1 on the darker of those: light `text-muted` (4.06 on `#f0efec`) and `role-measure` (4.17), and dark `text-muted` (4.28 on `#2a2a28`), `status-success` (4.29) and `status-error` (4.45). Those five are corrected below; every other published value held its threshold.

**Every ratio in this table is now the worst case across all four surfaces**, recomputed — so the unchanged tokens read lower than before too (light `text-primary` 16.5 → 14.35, `accent` 5.7 → 4.97, and so on). `packages/ui/src/tokens.test.ts` fails if any text token drops below its threshold on any surface, in either theme (AC-005).

Two further changes made at the same time, neither of them a contrast failure:

- **`text-on-accent` is new.** Text on a filled `accent` control was never specified. White works in light (5.71:1) but is **2.41:1 on dark `accent`** — an AA failure waiting to be written; dark uses `#1f1f1e` (6.84:1). The same gap exists for `crossfilter` and `mk1`–`mk4` chips and is picked up at T105/T125.
- **Dark `status-error` now names its icon colour explicitly** (`#e66767`, unchanged from the single value published before). Only the *text* moved to `#eb7070`. Icons are non-text and answer to WCAG 1.4.11's 3:1, which `#e66767` meets at 4.45:1 on `bg-subtle`.

**On headroom.** The corrected values clear 4.5:1 by 0.06–0.35 rather than landing exactly on it, so a rounding difference between our audit and axe-core cannot flip a token. That margin is a deliberate choice, not a computation artefact; the values were picked as the smallest shift from the published colour that reaches it.

| Role                          | Light                                     | Dark                    | Notes                                                                                                             |
| ----------------------------- | ----------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bg-page` (canvas wallpaper)  | `#f4f4f2`                                 | `#121211`               |                                                                                                                   |
| `bg-surface` (tiles, panes)   | `#ffffff`                                 | `#1c1c1b`               |                                                                                                                   |
| `bg-raised` (menus, popovers) | `#ffffff` + shadow                        | `#252523`               |                                                                                                                   |
| `bg-subtle` (hover, wells)    | `#f0efec`                                 | `#2a2a28`               |                                                                                                                   |
| `border-subtle`               | `#e3e2de`                                 | `rgba(255,255,255,.10)` |                                                                                                                   |
| `border-strong`               | `#c9c7c1`                                 | `rgba(255,255,255,.20)` |                                                                                                                   |
| `text-primary`                | `#1f1f1e` (14.35:1)                       | `#f2f2f0` (12.83:1)     |                                                                                                                   |
| `text-secondary`              | `#5c5b57` (5.91:1)                        | `#b4b3ab` (6.83:1)      |                                                                                                                   |
| `text-muted`                  | `#6e6c67` (4.56:1)                        | `#97958e` (4.80:1)      | Both moved at T002 to hold on `bg-subtle`                                                                         |
| `accent`                      | `#1f6f86` (4.97:1)                        | `#4fb3d1` (5.96:1)      | Superset's teal lineage, darkened for AA. Text **on** it is `text-on-accent`, below                               |
| `text-on-accent`              | `#ffffff` (5.71:1 on `accent`)            | `#1f1f1e` (6.84:1)      | New at T002. White on dark `accent` would be 2.41:1, an AA failure                                                |
| `crossfilter`                 | `#7a3fb0` (5.77:1)                        | `#b58be0` (5.30:1)      | Cross-filter mode only. Kept distinct from `accent` and from standard filters (Looker).                           |
| `mk1` ("Marking", default)    | `#151107`                                 | `#f2f2f2`               | Marking colours sit outside the categorical lightness band: an "ink" in each theme, like Spotfire's dark outline. |
| `mk2`                         | `#2d025e`                                 | `#b6bcd8`               |                                                                                                                   |
| `mk3`                         | `#5b3106`                                 | `#fab72a`               |                                                                                                                   |
| `mk4`                         | `#225c60`                                 | `#81fbbe`               |                                                                                                                   |
| `role-dimension`              | `#2d6ab4` (4.77:1)                        | `#7fb0ea` (6.37:1)      | Always shown with a type icon: Aa, #, clock, ⊙ (geo), ◐ (boolean)                                                  |
| `role-measure`                | `#a85400` (4.64:1)                        | `#f0a35c` (6.92:1)      | Always shown with the Σ icon (Looker's blue/orange convention). Light darkened at T002                            |
| `status-success`              | `#1d7a3f` text (4.67:1), `#0ca30c` icon   | `#17aa17` text (4.66:1), `#0ca30c` icon | Always paired with an icon and a label. Dark text lightened at T002; the icon keeps its hue, since an icon is non-text |
| `status-warning`              | `#8a5a00` text (5.15:1), `#fab219` icon   | `#fab219` text (7.84:1), `#fab219` icon | |
| `status-error`                | `#c2362f` text (4.73:1), `#d03b3b` icon   | `#eb7070` text (4.85:1), `#e66767` icon | Dark text lightened at T002; the dark icon keeps the previously published `#e66767` (4.45:1, above 1.4.11's 3:1)   |

**Marking colours.**

- Validated with `validate_palette.js` against every categorical slot and `other`, pair by pair, in both themes. **That script is not in this repository**, so the figures below cannot be re-run and are historical notes rather than expected test output. The live check is `packages/ui/src/audit/markingPalette.test.ts` (AC-099), whose numbers are a new measurement; see `docs/research/palette-validation.md`.
- Each marking is at least ΔE 15 (normal vision) and at least ΔE 8 (protan/deutan simulation) from every series colour. So with "Use separate color for marked items", marked items stay distinguishable from every series.
- **ΔE here means W3C CSS Color 4's ΔEOK scaled ×100** (user decision, 2026-09-20), on which black→white is 100. Simulation is Viénot, Brettel & Mollon 1999 at full dichromacy. The criterion named none of these, and each changes every number.
- **The thresholds 15 and 8 are product decisions, not a published standard** — the same footing as the channel-capacity numbers below. No published just-noticeable-difference exists for any OKLab ΔE, and CIELAB's familiar ≈2.3 does not transfer, because CIELAB L\* runs 0–100 where OKLab L runs 0–1.
- Between markings, dark-mode `mk1`↔`mk4` is ΔE 6.8 under colour-blindness simulation, inside the 6–8 floor band. That is legal only with secondary encoding, which chips and badges provide by always naming the marking. **The 6–8 band is also a product decision** — no source was found for it — and marking↔marking distance is deliberately outside AC-099, which constrains marking-vs-series only.
- The earlier single `crossfilter`/marking token, `#7a3fb0`, failed against categorical violet `#4a3aa7` (ΔE 9.0), so it is no longer used for markings.
- Four slots exist. How many markings analyses need at once is still open (`references-markings.md`, open question 7).
- **Unmarked fade:** opacity 0.28. **Marked outline:** 1.5 px in the marking colour. Spotfire publishes neither value; both are derived here.

**Data-viz palettes.** These are validated with `dataviz/scripts/validate_palette.js`.

- **Categorical, 8 slots, in fixed order** (light / dark):
  1. blue `#2a78d6` / `#3987e5`
  2. orange `#eb6834` / `#d95926`
  3. aqua `#1baf7a` / `#199e70`
  4. yellow `#eda100` / `#c98500`
  5. magenta `#e87ba4` / `#d55181`
  6. green `#008300` / `#008300`
  7. violet `#4a3aa7` / `#9085e9`
  8. red `#e34948` / `#e66767`
- **Validator results:**
  - Light, on `#ffffff`: every check passes. The worst adjacent-pair CVD ΔE is 9.1, and the worst normal-vision ΔE is 19.6. Contrast is a **WARN**: aqua, yellow and magenta fall below 3:1, so the relief rule below applies.
  - Dark, on `#1c1c1b`: every check passes. The worst CVD ΔE is 8.4, and all 8 slots reach at least 3:1.
- **Channel capacity** (hard constraints on the recommender). Provenance, checked in `docs/research/recommender-algorithms.md` §5: these are **product decisions**, not figures from the literature. The claims in IN-3 that they come from graphical-perception research do not hold — no retrievable source gives a maximum number of distinguishable colours or trellis panels, and in Draco the colour and shape limits are _soft_ penalties, not hard constraints.
  - At most **8** categorical colours. Past 8, the recommender facets the chart or uses the top 7 plus a neutral "Other". Grounded in our own palette, which has exactly 8 validated slots (above); Draco penalises past 10 and Vega's default `tableau10` carries 10.
  - All-pairs forms (scatter, bubble, map, small multiples) take at most **3** colour series.
  - At most **6** shapes. The only _published_ hard number is 8 — "Vega-Lite only implements 8 shape types", matching Vega's 8-entry default symbol range — so 6 is a deliberately conservative choice, not the cited limit.
  - At most **20** trellis panels before paging. No published basis; Draco's nearest rule penalises past 5 columns.
- **"Other" / null:** a neutral outside the palette, `#b3b1ab` light and `#5c5b57` dark.
- **Colour follows the member, not its rank.** Each member keeps the same colour across every tile on a dashboard and after filtering.
- **Sequential:** a single blue hue, running 100→700 (`#cde2fb` … `#0d366b`).
- **Diverging:** blue ↔ red with a gray midpoint (`#f0efec` light, `#383835` dark).
- **Status colours are reserved.** They are never used as series colours.

## 6. Charts

- **Legend:** appears whenever there are 2 or more series (never for one). Hover highlights a series.
  - In **Markings** mode, clicking a legend entry's text marks every item of that category, and Ctrl/⌘ adds more (Spotfire). Unmarked entries are greyed. Series visibility moves to the tile's Customize panel.
  - In **cross-filter** mode, clicking toggles the series.
  - Position is top by default, and can be set to top, right, bottom, left, or none.
  - Charts with 4 or fewer series also get direct labels, so identity never depends on colour alone.
- **Axes:** these options are available in the inspector's Axes section for X, Y and trellis:
  - title on/off plus text
  - min/max, either auto or fixed
  - include zero
  - reverse
  - log scale
  - label rotation 0, 45 or 90
  - maximum label count
  - gridlines on/off
  - number format (auto, compact, full, %, currency)
- **Trellis axes:** axes are synchronized by default; each can be set to independent.
- **Dual y-axes:** the recommender never proposes them. Two measures with different scales become small multiples or an indexed chart instead. The inspector allows a dual axis only as an explicit override, and shows a warning when it is on.
- **Marks:**
  - bars have a 2 px surface gap and 4 px rounded data-ends anchored at the baseline
  - lines are 2 px
  - markers are at least 8 px
  - data labels are selective, never on every point
- **Recommendation panel**, in the inspector under the "Chart" tab:
  - The **Recommended** card shows the top pick with a one-line reason (for example "Time × 1 measure, 184 dense points → line").
  - **Runners-up**, up to 4, each with a reason (for example "42 categories: color would be unreadable, so faceted instead").
  - **Not applicable** types are greyed, and hovering one shows the requirement (the Tableau pattern).
  - Choosing a different type pins it ~~and shows a "Pinned · Back to recommended" chip~~. The type card reads "Chosen manually", and the Auto quick pick, pressed while the recommended type is drawn, returns to the recommendation, as does Use on the Recommended card (R76, 2026-10-08; AC-217, AC-032).
- **States:**
  - Empty: an illustration, a sentence, and a primary action.
  - Loading: a skeleton of the chart form, not a spinner.
  - Error: a status icon, a message, a "Details" disclosure with the query and error, and Retry.
  - Stale or cached: a badge showing the age and whether a pre-aggregation was hit.
- **Tooltip:** a crosshair and tooltip on line and area charts; a per-mark tooltip on bar, dot and cell marks. The tooltip lists the member values plus any extra tooltip fields.

## 7. Interaction

- **Drag and drop**
  - Sources: fields from the tree.
  - Targets: named wells (X, Y, Color, Size, Shape, Label, Tooltip, Trellis rows, Trellis columns, Trellis panels, Detail, Filters).
  - During a drag, the legal wells highlight and the illegal ones dim, with a reason on hover (for example "Color takes one dimension; 42 values would exceed 8 colors").
  - Dropping replaces the well's content; Shift-drop adds to it (Spotfire's replace/add semantics).
  - **Every drop target also has a "+" picker**, so nothing requires dragging and everything is keyboard reachable.
- **Selection: two interaction modes, one per dashboard** (Settings › Interactions)
  - **Markings** (Spotfire): see §7a.
  - **Cross-filtering and cross-highlighting** (Power BI and Superset):
    - Clicking a mark filters or highlights the other tiles on the tab, as set per source → target pair in Settings › Cross-filtering. The default comes from "Default for tile pairs".
    - Ctrl/⌘+click adds to the selection. Esc clears it.
    - The chip shows "⨯ Category = Beverages (from Revenue by Category)".
    - Each tile's filter indicator lists every filter acting on it.
  - Clicking in dashboard edit mode selects the tile and never marks or filters.
  - A mark counts as clicked when the pointer is pressed and released on the same item with no drag in between, so a click is never confused with a rectangle or lasso.
- **Global filters:** date range with presets, list with search, range slider, and checkbox list (Spotfire's filter types). Each can be scoped to the dashboard, a tab, or specific tiles, and filters can be linked across related cubes.
- **Undo/redo:** available in every editor (⌘Z / ⇧⌘Z) and shown in the editor header.
- **Keyboard:**
  - ⌘K for command/search, `/` to focus the tree search, and F6 to cycle panes.
  - Arrow keys move the grid selection. Enter opens the inspector.
  - On a focused dashboard tile in edit mode: arrow keys move it one position within its container, Shift+arrow keys resize it by one column or one 8 px row, E opens the chart editor, Delete removes it, and Enter focuses its Properties. A polite live region announces each move and resize.
- **Code ↔ form:** model objects have _Form_ and _Code (YAML)_ tabs that stay synchronized. If switching views would lose information, a warning names what would be lost.

## 7a. Markings (Spotfire), when a dashboard uses Markings mode

**Where this comes from.**

- User input: §2 "markdown (spotfire)" was corrected to _markings_ (§10). The user's answers are in §11, and the per-dashboard mode choice is in §12.
- Research: `references-markings.md` (Spotfire 14–15, compared with Qlik, Tableau, Power BI, Superset, Looker and Grafana) and `docs/research/cube/markings-query-support.md` (Cube 1.7.42).

**Why markings.** In Spotfire, marking selects "parts of the data that you find of certain interest to examine in more detail". Analysts use it for four things:

- **Brushing and linking:** every tile that uses the marking shows the marked rows.
- **Master–detail drill-down:** details tiles are limited by markings.
- **Subset-vs-whole comparison:** KPIs and text show the marked value next to the total.
- **Acting on the selection:** filter to or out, view the rows, copy, share a link.

**Model**

- A **marking** is named and coloured, and belongs to the whole dashboard, spanning every page tab. A new dashboard has one, "Marking", set as the default. New chart tiles use the default marking.
- Each chart tile **marks with** one marking or **(None)**. A (None) tile can't be marked. KPI tiles can't mark, but show the default marking's marked share.
- A marking is stored as a **predicate over Cube dimension members**: an OR of AND-tuples, with a time bucket stored as its member, granularity and value. It is never stored as row indexes, because nothing behind live Cube queries has a stable row identity; Spotfire likewise always uses symbolic marking for in-database data.
  - It compiles to Cube's `{or:[{and:[…]}]}`. A single tuple becomes flat single-value `equals` filters.
  - Marked NULL becomes `notSet`.
  - A span of time buckets becomes `timeDimensions.dateRange`, the only form that pre-aggregations match (`markings-query-support.md` Q1–Q2).
- **Operations** follow Spotfire's algebra: Replace, Add, Subtract, Toggle, and ToggleOrAdd for Ctrl+drag.

**Gestures** (view mode only)

| Gesture                      | Effect                                                                                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click an item                | Replace the marking with it                                                                                                                                                                                                                                                                   |
| Ctrl/⌘+click                 | Toggle it                                                                                                                                                                                                                                                                                     |
| Drag                         | Rectangle: marks the items touched, replacing the marking                                                                                                                                                                                                                                     |
| Alt+drag                     | Lasso                                                                                                                                                                                                                                                                                         |
| Ctrl/⌘+drag                  | ToggleOrAdd: toggle if all or none of the enclosed items are marked, otherwise add                                                                                                                                                                                                            |
| Click empty plot area        | Unmark this tile's marking                                                                                                                                                                                                                                                                    |
| Esc                          | Unmark all markings (Esc on a focused tile unmarks its marking)                                                                                                                                                                                                                               |
| Click legend text            | Mark the category; Ctrl/⌘ adds                                                                                                                                                                                                                                                                |
| Click a trellis panel header | Mark the panel; Ctrl/⌘ adds (T635, the coordinator's call on R64, overturnable)                                                                                                                                                                                                              |
| Table tiles                  | Click a row; Ctrl/⌘ toggles; Shift+click marks the range from the anchor row                                                                                                                                                                                                                  |
| Keyboard, focused tile       | Arrows move focus between items **without marking** (each marking change re-queries other tiles; WAI-ARIA APG). Space marks, Ctrl/⌘+Space toggles, Shift+arrow extends, Esc unmarks, Ctrl+M / Ctrl+Shift+M filter to or out. A polite live region announces "Beverages, 2 of 8. Space marks." |

**Rendering** in every tile that uses the marking. Partial-bar rendering is the user's decision (§11); the rest follows the research.

- Marked items keep their own colour and get a 1.5 px outline in the marking colour. Unmarked items fade to 0.28.
- **Partly marked items, additive measures** (Cube `sum` and `count`): the marked share is drawn from the baseline at full strength and the remainder fades. In a stacked bar, each segment is split on its own.
- **Non-additive measures** (avg, count distinct, ratios): a partly marked item keeps full colour with a hatch pattern. The tooltip shows "Marked: X" beside the total. A sub-length is never drawn, because a partial average isn't part of a whole.
- **Lines and trellis:** the faded total line plus a full-strength line for the marked share. **Heatmap:** marked cells get a solid outline (dashed when partly marked); the rest fade. **Pie:** marked sectors are outlined, partly marked ones hatched, never a sub-angle. **Tables:** marked rows are bold with a left rule; the others are dimmed.
- **KPI tiles:** a "Marked $X · p%" badge (no % for non-additive measures).
- **"Use separate color for marked items"** (a tile option): marked items take the marking colour and unmarked items keep theirs.
- Marking state is never shown by colour alone:
  - the tile header badge "● n marked"
  - chips that name the marking and summarise its values ("Category: Beverages, Seafood +3")
  - outlines, fade and pattern

**Details tiles** (Spotfire's details visualizations; strings kept, with "visualization" read as "tile")

- Tile Properties › Marking has:
  - **Marking**: (None) or a marking.
  - **Use separate color for marked items**.
  - **Limit data using markings**: a checkbox per marking. The tile's own marking is disabled, with the reason given.
  - **Rows must be included in: All markings (AND) / Any marking (OR)**.
  - **If no items are marked in the master tiles, show: All data / Empty visualization / Message on empty background**. **Message is the default** (user decision 2026-09-19, `docs/inputs` §13), pre-filled with the master tiles' names.
- **Proposed rule, not from Spotfire's docs:** empty markings are skipped when combining. The nothing-marked state applies only when every limiting marking is empty.
- **Create details tile** (tile menu): adds a table tile limited by this tile's marking, with the message state. From view mode it enters edit mode first.
- If a limiting marking isn't empty but its items are all filtered out, the tile says so instead of showing the nothing-marked state.
- Marking limits AND dashboard filters.

**Marked rows** (tile ⋯ menu and chip menu)

- Filter to marked and Filter out marked create ordinary removable dashboard filters from the predicate, then clear the marking. Spotfire's versions don't work in-db and can't be bookmarked.
- View marked rows opens a drawer with the rows behind the marked items: a Cube `ungrouped` query, capped, with Export CSV.
- Also: Copy marked values, Invert marking, Mark all, Unmark, Copy link with marks.
- Dropped for phase 1:
  - Delete rows and Tags, because Cube is read-only.
  - Lists, Group from marked, and data functions triggered by marking, pending the user (`references-markings.md` open questions 8–9).

**Markdown tokens**

- `{{measure:id | marking:Name}}` limits the value to the marking. When nothing is marked it shows all data, as Spotfire's calculated values do.
- `{{marking:Name.summary}}` and `{{marking:Name.count}}` print the marking's state.

**Across cubes** (user decision §11: "Markings across related tables")

- A marking reaches a tile only through Cube joins or view members (`markings-query-support.md` Q4). Tiles it can't reach show "Not linked to ‹marking›".
- Reachability is checked with `/v1/dry-run` and cached per member set. `connectedComponent` is used only to rule reachability out.

**Persistence** (user decision §11)

- Saved dashboards keep marking **definitions**: names, colours, the default, which tile uses which marking, and limits.
- Current marks travel only in the URL ("Copy link with marks") and in bookmarks, if phase 1 has them.

**Markings panel** (the Markings button in the view-mode header): every marking with its summary, "Used by n · limits n", Unmark, and jump-to-tile.

**Query strategy** (implementation guidance from `markings-query-support.md`)

- **Local derivation:** when every marked member is already one of the tile's groupings, compute the marked share from the tile's own rows.
- **Otherwise:** run two REST queries, base and base ∧ marking, the only option exact for every measure type. The base stays cached.
- **Canonical order:** sort tuples and values, so identical markings produce identical SQL and hit the cache.
- **Debounce** marking bursts, and cancel superseded loads.

**Still open for the user** (`references-markings.md`):

- Whether to say "tile" or "visualization" in the strings.
- How many markings analyses need at once.
- Which `.dxp` features must migrate.
- Whether phase 1 needs range-based marking (Spotfire 15), bookmarks, or touch.
- The item cap. Spotfire's in-db default is 1,000.

## 7b. Model editor (Cube YAML authoring, `docs/inputs` §4b)

- **Layout (user decision, 2026-09-19):** file tree (`model/cubes/*.yml`, `model/views/*.yml`) · **Form** (the tabs General, Dimensions, Measures, and so on) as the main working area · **YAML** on the right, with syntax highlighting and line numbers, a Problems panel beneath it, and a toggle to the join diagram. Both sides edit the same parsed document. Short form fields flow two per row; SQL, lists and member pickers span the full width.
- **Form tabs per cube:** **General** (name, sql_table/sql, data_source, title, description, public, refresh_key, meta) · **Dimensions** · **Measures** · **Joins** · **Segments** · **Hierarchies** · **Pre-aggregations** · **Access policy**. Views get **General · Cubes (join_path, includes/excludes, prefix, alias) · Folders · Access policy**. *(2026-09-27, T470: labelled **Pre-aggs** and **Access** as the prototype and design 03 label them, each with its whole name as its tooltip, so a cube's eight tabs fit its form pane.)*
- **Rows:** each member is one row in a list, showing name, type, SQL preview, and badges for primary key, public, and format. A row expands in place into its complete field set. Enum fields use selects populated from the validator's allowed values. Reference fields (`drill_members`, pre-aggregation measures and dimensions, join targets) use member pickers, never free text.
- **Sync:**
  - A form edit re-serializes the document and updates the code.
  - Code edits re-parse after a 300 ms pause, then update the form.
  - A parse error freezes the form and shows the error's line in the Problems panel.
- **Lossy round-trip warning:** switching to the form when the file has comments, Jinja blocks or YAML anchors shows a warning that names exactly what the form can't represent. Those constructs stay editable in Code only.
- **Validation:** a Problems panel with Errors and Warnings (Looker validator model). Each problem links to a line and a field, for example "Measure `revenue` has no `sql`", "Cube `orders` has no primary_key dimension", or "Unknown member `orders.stauts` in drill_members".
- **Schema source:** fields, enums, defaults and dependencies come from `docs/research/cube/data-modeling.md` → _YAML schema inventory_, checked against Cube's Joi validator at v1.7.42. The prototype's enum lists are **illustrative until that doc is saved**.

## 7c. Phase 1 scope adjustments (user decision, 2026-09-19)

- **Users and groups are phase 2.** Phase 1 assumes a single user. The Security surface is limited to listing access policies (authored in the model) and a **security-context preview**: the user edits a JWT payload and sees effective access, generated SQL and a dashboard preview. There are no user or group admin screens. *Phase 2 (amended 2026-09-25, decision 12, R27): the preview chooses groups rather than editing a payload, and the effective access includes the policies xcube generates from folder groups (AC-166, AC-320).*
- **Schedules is a first-class surface.** It shows two schedulers side by side, each labelled:
  - **Cube's refresh worker** (`refresh_key`): read-only here and edited in the model.
  - **wechart's scheduler**: pre-aggregation builds through `POST /v1/pre-aggregations/jobs`, dashboard deliveries, and cache warm-ups.
  - Each schedule shows a cron expression with presets, its next runs, retry and suspend policy, and history.
- **Jobs** adds Run history (wechart-owned, because Cube Core keeps none), a Queue view with job tokens, per-run logs, partition-level builds, and "Resume" for suspended schedules.
- **Data sources** adds an add wizard (Type → Connection → Test → Name and assign), driver-specific fields, a health history recorded by wechart's periodic tests, and a Usage tab listing the cubes on each source. *Amended 2026-09-25 (decisions 1 and 7): the tests run in xcube, at wechart's request, and the secret is encrypted in the browser. The prototype's data-source copy that says wechart serves connections through `driverFactory` and runs the tests itself (`prototype/admin-sources.js`, `schema.js`) is superseded, and is corrected when those screens are built (T363, T364).*

## 7d. Taken from the approved prototype (AC-187, user decision, 2026-09-21)

The user asked that the UI "align with the ui styles in" the design prototype (`docs/design/prototype/`). Where the prototype's component rules differ from §3–5, the prototype's rule is followed, and each difference is recorded here:

- **Radius:** buttons, icon buttons, filter pills, tiles and panels are 6 px, where §4 says 4 px for controls. Inputs and selects stay 4 px, and a pill's scope tag is 3 px.
- **13 px type**, which is outside the §3 scale, on filter pills and page tabs. *(2026-09-27, T479, R34: also the file's path in the model editor's head, 13/600 in the code face, as phase-1 design 03 draws it. It heads an editor pane, not a page: the Model overview's title stays 20/600.)*
- **Inspector controls** (the Properties panel) are 28 px at 12 px (`.input.sm`), as §4's compact row for inspectors.
- **`bg-hover`**, a token not in §5, for a hovered button or row. Light `#efeeea`, dark `#2c2c2a`. These are the nearest shades to the prototype's that pass the contrast audit (AC-005); the prototype's own `#e9e8e4` does not.
- **`bg-role-dimension-soft`**, the prototype's `--role-dim-soft`, a token not in §5: the avatar's ground, under `role-dimension` initials. Light `#e6eef8`, dark `#1d2a3a`, the prototype's own values. `role-dimension` on it is 4.68:1 in light and 6.44:1 in dark, and the pair is audited with the other tints (T245).
- **`--wc-shadow-pop`**, the prototype's popover shadow, in each theme. It is a shadow, not a colour text sits on, so it is outside the audited tokens.
- **Layout:** the dashboard runs edge to edge. The header, the page tabs, the filter band and the tiles are each padded 24 px from the sides, the filter band sits below the page tabs, and the edit sidebar is docked with a rule on its left.

## 7e. Phase 2: security, folders, workspaces and proposals (accepted 2026-09-25)

**Direction.** Govern where the content lives. Explore shows each person only what they may see. Access is edited in a panel docked beside the folder, separating "Set here" from "From _ancestor_", for AD groups only. All authoring happens in a clearly banded "My workspace". Work reaches a shared folder only through a proposal whose review view renders the item itself, and a restore is itself a proposal. Bookmarks are private or shared the Spotfire way. Super-Admins get an audit trail inside Security.

Nothing in §2–§7d changes. No new colour and no new type size is added: every new state is an icon plus a label on the existing roles (rule 3). The full surface text, with every string, state and keyboard rule, is in `references.md` › Phase 2 › Surfaces 1–10, and is binding where this section is silent.

**Approved designs (2026-09-27, R33).** Every phase-2 surface is drawn as its design in `docs/design/reviews/2026-09-27/designs/` (01–10), proposals included; the user approved all ten ("Approve all with proposals"). A design's structure, placement, controls, wording and states are binding (AC-343). Where a design and this section differ, the design wins, since it was drawn from this section and measured against the running app (`ui-review.md`). The new data source wizard is a 480 px pane docked beside the Data sources list, not a dialog (design 01).

**Where each surface lives**

| Surface | Placement | Size | ACs |
| --- | --- | --- | --- |
| Account | Top bar, right, after Reviews and the theme toggle: a 28 px avatar with initials plus the name (12/16, 600), truncated at 160 px, name hidden below 1,280 px. Menu: identity, a Super-Admin badge, Sign out. Security off: a "Single-user mode" chip (open padlock, `status-warning`) with no Sign out. | — | AC-251–AC-254 |
| Signed-out and failure states | Product mark, one sentence, one action: signed out; sign-in failed (provider text in Details); no group list received; session ended (modal); no access anywhere (Explore empty state naming no folder). | — | AC-251 |
| Access panel | Docked right from the folder header's Access button (read-write and Super-Admin only). Read-write groups, then read-only groups; each splits Set here / From ancestors (lock icon, source folder as a link, no remove); "Not set here. Inherits from _folder_."; "Only Super-Admins can see this folder" when nothing reaches it. Save _n_ changes; Undo toast. | 360 px; rows 28 | AC-259–AC-261, AC-265, AC-267 |
| Explore by role | Tree: My workspace first (person icon), then "Our analytics" with only visible folders. Folder header: access chip (Super-Admin, Read-write or View only). Read-only users see subfolders and dashboards only, with no actions that change anything. | — | AC-192, AC-194, AC-262–AC-264, AC-277 |
| Models and data sources as items | Listing rows with Type as text. A model opens in the model editor under the folder breadcrumb, read-only in a shared folder; a data source opens its settings (General, Connection, Test history, Usage). Credentials show only as "Stored · encrypted". | — | AC-131, AC-157, AC-222, AC-269 |
| My workspace | A 32 px `bg-subtle` band "My workspace · only you can see this" on every workspace page. Each item shows its origin ("Copied from _path_ · version _n_" or "New") and its target. "Edit in my workspace" dialog; "Open my copy" when a copy exists. New items pick a target from read-write folders only. | dialogs 520 px | AC-276–AC-283 |
| Proposals | Propose dialog: target, new or replaces v_n_, bundled workspace models with the reason, description with a "_n_ / 1,000" counter that blocks above 1,000. Top-bar Reviews control with a count pill. Reviews page: To review / My proposals / Calculation requests (amended 2026-10-04, [R60]: the third tab, in design 05's list and inspector; the count pill includes its open requests). Review view: full viewport, 240 / fluid / 360, rendering the item (dashboard drawn read-only with Proposed / Current, model YAML diff, data-source settings diff). Approve (confirmed) and Reject (optional reason) only there. "Approve my own proposal" when the reviewer is the author. | 520 / 400 px dialogs; rows 34 | AC-284–AC-291 |
| History | Docked right from the History button: last 10 versions, newest first, Current tagged; View, Compare with current, Propose restoring… (never a direct restore). | 360 px; rows 48 | AC-288, AC-289 |
| Bookmarks | The phase-1 Bookmarks popover gains Mine then Shared, each newest first; visibility as icon and label ("Only me", "Shared"); owner menu with Share or Stop sharing; others get "Save a copy to mine". | 320 px | AC-292, AC-293 |
| Audit trail | Security › Audit trail (Super-Admin only). Filters User, Event, Folder, Time combine with AND as chips. Table: Time, User, Event, Folder, Item, Details, newest first; inspector with the full record; a footnote naming the retention period. | rows 34 | AC-294–AC-296 |
| Data sources, Jobs, Schedules | Data sources lists every visible source with Folder, Driver, Health (icon, label, last test) and Used by. Jobs and Schedules add a Folder column and filter, with a scope note for non-Super-Admins. The connection test shows each check Cube ran (AC-159). | rows 34 | AC-157, AC-158, AC-233, AC-297 |

**Group identifiers** are shown exactly as the groups claim carries them, in the code face (IBM Plex Mono 12/16), because Entra sends object IDs by default. The picker is labelled "AD group" and never offers a person.

**Decisions on the gaps the research found** (`references.md` › Phase 2 › Open for the user; accepted by the user 2026-09-25, requirements R23):
1. Groups are shown exactly as the token carries them; wechart stores no group labels.
2. A proposal is a snapshot; later edits in the workspace are flagged "not in the proposal".
3. After approval the workspace copy stays, marked "In folder as v_n_".
4. "Edit in my workspace" isn't offered where the user is view-only.
5. History is shown to read-write members and Super-Admins, never to read-only users.
6. **Read-only users don't see Data sources in the switcher at all** (AC-001 reworded). This replaces `references.md` surface 10's empty-state page for them.
7. Sign out lives in the account menu, which is in the top bar.
8. In shared folders the Owner column shows the author of the current version.
9. The review view includes the Proposed / Current compare and the diffs.

**Country map** (AC-305, AC-313; research `country-map.md`)
- Equal Earth projection (an equal-area projection, which choropleths require), through d3-geo 3.1.1.
- Colour: §5's sequential ramp (`#cde2fb` … `#0d366b`); countries with no value take §5's null neutral (`#b3b1ab` / `#5c5b57`), and the legend adds a "No data" swatch. The pair's separation from the ramp's pale end must pass the palette validator before shipping.
- Legend: a horizontal continuous bar below the map, with its two end values formatted by the measure's format.
- Codes that can't be placed are named in a note under the map ("Not on the map: XKX, …"), in wechart's DOM, not in the chart canvas.
- Hover: the country's name, then the measure; "No data" when it has none. Marking a country uses outline and fade, never fill (§7a).

**Box plot** (AC-306, AC-314, AC-315; research `box-plot.md`)
- One box per category: box from Q1 to Q3, a median line, whiskers per the chart option, and outliers as dots in the category's colour at 60 % opacity.
- The "Each point is" field sits in the box plot's wells below the value.
- Over Cube's row limit, a warning band on the tile reads "Computed from _n_ of _N_ rows", with the status-warning icon.
- Hover on a box: the category, n, minimum, Q1, median, Q3 and maximum (and the whisker ends when Tukey is on), in tabular numerals.

## 7f. R78: the SQL runner workspace and personal access tokens (accepted 2026-10-17)

**Direction** (`references-sql-runner.md` › Direction). A "SQL runner" workspace after Schedules, laid out as §2's three-pane workbench: a data source picker and lazy schema browser on the left; tabs bound to a data source in the centre, each with F40's warning, the CodeMirror editor, typed and bound parameters and a dense result grid; Saved and History on the right. Make a cube and Make a chart turn a finished run into drafts in My workspace. The data source's page keeps only the runner's switch and "Open in SQL runner". Personal access tokens for MCP live under the person's account, reached from the account menu, with every user's in Security for Super-Admins.

Nothing in §2–§7e changes, except that the switcher gains SQL runner after Schedules (AC-001 as amended; §2's phase-1 list is superseded by AC-001). No new colour, type size or weight is added (`references-sql-runner.md` › Tokens: "No new colour, type size or weight is needed"). Every value below reuses an existing token; the table records which, so design-critic can measure against it.

| Token use | Value | Traced to |
| --- | --- | --- |
| SQL runner left pane (picker and schema browser) | 280 px, 220–400, rail 40 | §2 "Left tree"; references-sql-runner.md Tokens (Superset's 400 px rejected) |
| SQL runner right pane (Saved and History) | 320 px, 280–480, rail 40 | §2 "Right inspector"; references-sql-runner.md Tokens; design 15 placed My runs at the right |
| Editor : results split | 30 : 70 to start; editor ≥ 200 px, results ≥ 160 px | references-sql-runner.md Tokens (Superset `INITIAL_NORTH_PERCENT` 30, minimum north 200); §2 bottom drawer minimum 160 |
| Make a cube / Make a chart pane | 480 px, docked | §7e (design 01's wizard pane); Generate cubes' shared head (T691-4) |
| Save… dialog; New token dialog | 520 px | §7e, the workspace dialogs |
| Revoke and Close tab? dialogs | 520 px alert dialogs, focus on the safe choice | §7e; design 15's dialogs; rule 85 |
| Code face (editor, SQL in panes, token text, the Claude Code command) | IBM Plex Mono 12/16 | §3; decisions model-Q2 #6 (12/16, not design 15's 12/18) |
| Schema tree rows | 28 px, `text-xs` | §4; rule 17; §3 "field and file trees" |
| Result grid rows | 24 px dense, cells padded 8 px | §4; decisions dashboard-Q4, data-sources-Q1 |
| History and Saved rows | design 15's two-line rows, `text-xs` | design 15 screen 1 pin 12 |
| Editor tabs | the page-tab style, 13 px | §7d (13 px on page tabs) |
| Controls (Run, Save, Make…, picker, New token) | 32 px; parameter fields and editor-head buttons 28 px compact | §4; decisions components-Q1 |
| PK / FK tags; token scope tags | 12/16 text tags, `border-subtle` outline, radius 3 | §3 floor (absolute); §7d scope-tag radius |
| Run and token states | `status-success`, `status-warning`, `status-error` and idle, each an icon and a label | §5; rule 3; design 15's state legend |
| "Yours", "Only me" | the person icon and a label, on the workspace badge | rules 72, 81 |
| Preview and Insert SELECT limit | 100 rows | references-sql-runner.md (Superset `PREVIEW_QUERY_LIMIT` 100; Hex "100-row preview"); AC-449 |
| Run caps | 10,000 rows · 10 MB · 30 s · one run per person | AC-377 … AC-379 (unchanged) |
| Access tokens page | list rows 34; "Connect a client" pane 400 px | §4 admin lists; design 16's docked pane |

**Where each surface lives**

| Surface | Placement | ACs |
| --- | --- | --- |
| SQL runner | Switcher, after Schedules, for Super-Admins and read-write members; `/sql` with the open tab named | AC-001, AC-446 |
| A data source's SQL runner tab | Design 15's sixth tab, renamed, holding the switch and Open in SQL runner, with no editor | AC-464, AC-373 |
| Access tokens | Account menu (and the single-user chip's), above Sign out; `/account/tokens`; every signed-in user | AC-430, AC-479 |
| Every user's tokens | Security › Access tokens, after Audit trail; Super-Admins only | AC-470 |

## 7g. R79: the compact dashboard header (accepted 2026-10-17)

**Direction** (`references-compact-header.md` §4; design 19). One sticky row by default; one control both summarises and opens the rest; the rest pushes the tiles down; Esc or the control closes it; nothing is remembered past the visit. It replaces design 04's crumbs row, title row, page-tab row and filter band (2026-09-24, and 2026-09-27 states E and F) for the dashboard view only. The description moves into the sheet: decision dashboard-Q2 is amended, not overturned.

No new colour, type size or weight. Every value reuses a token:

| Token use | Value | Traced to |
| --- | --- | --- |
| Compact row | 48 px, padded 0 24, `border-subtle` rule, `bg-page`, sticky under the app bar | `--wc-app-bar-height`; §4 control 32 + 8 + 8; §7d 24 px sides |
| Way back | "← ‹folder›", a 24 px ghost link; the whole path in its name and tooltip | design 19 pin 1; AC-195 |
| Title | `text-lg` 20/26/600, cut with "…", never below 160 px; `text-md` 16/22 below 1,024 px | §3 "page titles"; 19-Q4 |
| Page tabs | 13/600, the row's full height, 2 px `accent` underline on the row's rule; "More ▾" for those that don't fit in view mode | §7d; 19-Q5 |
| Toggle | 32 px `.btn`, radius 6; count pill 18 px, 12/600, `accent` on `text-on-accent`; pressed on `bg-subtle` | §4, §7d; design 18's `.count` |
| Compact chips | 24 px, radius 999, 12 px; marking chips bordered 1.5 px in the marking's colour, values cut at 240 px; cross-filter in `crossfilter`; beyond two, "+n" | §4 chips; AC-200, AC-119 |
| Sheet | description `text-sm` text-secondary, at most 860 px; ownership 12/16 text-secondary; the filter bar as built (53) | dashboard-Q2; `.dashboard__ownership`; `.filter-bar` |
| Motion | height only: 200 ms `cubic-bezier(0,0,0,1)` opening, 150 ms `cubic-bezier(1,0,1,1)` closing; none under reduced motion | Fluent 2 `durationNormal`, `durationFast`, `curveDecelerateMid`, `curveAccelerateMid` |
| Change highlight | `accent-soft` ground and an `accent` border on the toggle's count, 2 s | existing tokens; the 2 s is wechart's (19-Q6) |
| Below 1,024 px | the page menu on a 40 px second row; the sheet padded 16 px, pills one under another | design 19 state D; §2 breakpoints |

## 7h. R80: combo charts, the Text tile, dashboard parameters and the AI provider (proposed 2026-10-18)

**Direction** (both studies' common ground, settled by R80's answers). A combo is a set of per-series layers on one category axis: each measure picks its mark (bar, line, area, point) and its side (left, right); a second value axis exists only by the author's choice, and when drawn its zero and ticks align and it's titled by mark glyph; one dimension may split every measure, colour then meaning the member. The Text tile is today's Markdown tile edited in place with Tiptap 3: typed blocks on §3's scale, live elements that follow filters and markings, Spotfire's controls and action buttons built as declarations, and an AI summary written from facts wechart computed, reviewed before it lands and never silently regenerated. The AI provider is set once, by a Super-Admin, in Security › AI.

Nothing in §2–§7g changes except as the designs' criteria tables say: §6's dual-axis sentence and rule 30 (design 20), §2's and §8's "Markdown" and rule 25 (design 21). No new colour, type size or weight. Every value below reuses a token or is derived from one, and says which, so design-critic can measure against it.

| Token use | Value | Traced to |
| --- | --- | --- |
| Series row (Customize › Series) | 28 px, `text-xs`; Mark as four 24 × 22 icon buttons; Axis as a 28 px Left \| Right segmented control | §4 compact rows; rule 17; references-combo §5 |
| Mark glyphs (legend, axis titles, pills) | bar: 8 × 8, radius 2; line: 12 × 2; point: 8 px dot with a 1 px surface ring; area: 12 × 8 with its top edge | wechart's product decision; nothing published (references-combo Tokens) |
| Axis titles | `text-xs`, `text-secondary`, horizontal above each axis, glyphs in the series colour | §3; rule 2 (series-coloured ticks rejected); 20-Q10 |
| Gridlines with two axes | the left axis's only | §6; ECharts `alignTicks` (research §2) |
| Line over bar | 2 px line on a 5 px `bg-surface` halo; markers 8 px with a 1.5 px surface ring | §6 Marks; derived here |
| Area fill | the series colour at 0.24 opacity, drawn behind bars | derived here, so bars behind stay readable (Spotfire study "derive it") |
| Draw order | bands, areas, bars, lines, points, reference lines, labels | derived here |
| Reference line | 1.5 px, dash 5 4: `text-secondary` when fixed, the series colour when computed from it | §5 roles; derived dash |
| Reference band | `bg-subtle` fill, no edge | §5 |
| Reference label | `text-xs` in `text-primary` on a 3 px `bg-surface` halo | §3; rule 2 |
| AC-218 warning, "not drawn" row | `status-warning` icon and `text-xs` on the warn tint, 8 px padding, radius 6; offers as 24 px small buttons | §5; rule 3; design 01 state B |
| Series limit | 8 drawn series after any split; "Other" in §5's null neutral | §5; rule 6; R80 |
| Text tile toolbar | 40 px strip, 32 px buttons, radius 6; block-style button 128 px wide | §4 controls |
| Editing border | 2 px `accent` | §5 accent; the selected-tile pattern |
| Text body; headings; Large value | `text-sm` 14/20 (24 px line in tiles); `text-md` 16/22, `text-lg` 20/26, `text-xl` 24/32; `text-kpi` 32/40, `tnum` | §3 |
| Live element, edit form | `bg-subtle`, 1 px `border-subtle`, radius 4, padding 0 4, the text's own size; selected: `accent` border and the 3 px `accent-ring` | §4, §5 |
| Live value, view form | the sentence's own type and weight, `tnum`; a dotted `text-muted` underline on hover and focus | §3; 21-Q2 |
| Change | ▲ / ▼ and the sign; `status-success`, `status-error` or `text-secondary` text by its direction | §5 status roles (not series colours) |
| Icon element | a status icon and its word, `status-*` text; "No rule matched" with a neutral ring in `text-secondary` | rule 3 |
| Sparkline | 64 × 16, 2 px line in the measure's dashboard colour, no axes or markers | 16 = `text-xs` line height; 64 = 16 × 4 (wechart's); §6 line width; 21-Q13 |
| Bullet graph | 96 × 16; ranges `bg-subtle`, `border-subtle`, `border-strong`; value bar 4 px `text-primary`; target 2 px `text-primary` | §5 roles; derived sizes; 21-Q13 |
| Insert menu | 320 px wide, 28 px rows, `bg-raised`, group headings `text-xs-strong` `text-muted` | §2 inspector width; §4; rule 17 |
| Inline controls | filter control: the filter bar's widget at 28 px compact, with its scope tag; parameter control: a 32 px segmented control (≤ 5 choices) or a list; action buttons: the Link/button tile's styles at 32 px | §2 Link/button; §4; rule 14 |
| Element limit | 10 per Text tile; list controls 1,000 values with search | R80 |
| Parameters list | Settings › Parameters; 34 px rows; choice rows 34 px; dialogs 520 px | §2 settings page; §4; §7e dialogs |
| AI draft card | `bg-surface`, 1 px `border-subtle`, radius 6, 12 px padding, a 3 px `border-strong` rule on its left; buttons 32 px | references-copilot change card tokens |
| AI label | 24 px chip, radius 999, 1 px `border-subtle`, icon and `text-xs` `text-secondary`; no sparkle or AI colour | references-copilot "Made with Copilot"; §4 chips |
| AI settings page | Security's fifth tab; 820 px form column of cards and a fluid right column; 32 px inputs; usage rows 34 px | design 18 screen 4; §4 |

**Where each surface lives**

| Surface | Placement |
| --- | --- |
| Combo series, axes, reference lines | The chart editor's Customize tab (Series, Axes, Reference lines and bands); mark and axis also in the Metrics pill's menu and, in the editor only, behind each legend glyph |
| Split by | The combo's Data tab, a Split by well (one dimension) |
| Text tile | The Add palette's Text element (renamed from Markdown); edited on the canvas in edit mode; element settings in the edit sidebar's Properties |
| Dashboard parameters | Dashboard settings › Parameters, after Cross-filtering; also opened from the insert menu and a well's picker |
| Summarize | The insert menu's Copilot group; its settings in Properties; the draft card in the tile |
| AI provider | Security › AI, after Access tokens; Super-Admins only; `/security/ai` |

## 7i. R81: new chart types (proposed 2026-10-18)

**Direction** (`references-new-chart-components.md` › Direction, settled by R81's answers). Add the chart types that answer the questions Spotfire analysts already ask: performance against a target, contribution to a change, distribution, multi-measure profiles, mix, flow, time spans and hierarchy. Each draws from Cube's grouped (or, where it says so, ungrouped) queries, is markable at the granularity it draws, says what it can't mark, and has a table view and a text alternative. The KPI and the graphical table are built from R80's Change, sparkline, icon and bullet-graph elements (§7h), drawn as designs 20 and 21 draw them. No gauge (R81). Every type is designed in parallel with R80 (R81).

Nothing in §2–§7h changes except as design 23's criteria table says: §6's bar marks for histograms and waterfalls (below), rule 50's wording for a tile whose items are partly marked, AC-305's country map becoming the Map's Regions layer, and the gallery's purposes (a Flow shelf, 23-Q11). No new colour, type size or weight. Every value below reuses a token or is derived from one, and says which, so design-critic can measure against it.

| Token use | Value | Traced to |
| --- | --- | --- |
| Gallery card | as built: 12 px padding, radius 6, 28 px icon in `accent`, name 13/600, description and needs `text-xs` `text-secondary`, what's missing in `text-primary` on a `bg-subtle` card | AC-217; `styles.ts` `.type-card` (T688) |
| KPI value | `text-kpi-solo` 40/52 alone; `text-kpi` 32/40 when tiled; `tnum` | §3 |
| KPI comparison line | R80's Change (▲/▼, sign, `status-success`, `status-error` or `text-secondary` by Direction), then "vs ‹period› (‹value›)" in `text-xs` `text-secondary` | §7h Change; rule 133 |
| KPI sparkline | R80's sparkline (2 px line in the measure's dashboard colour, no axes or markers) at the tile's content width × 32 px; 132 × 32 when tiled | §7h Sparkline; 32 = 2 × 16; 23-Q14 |
| KPI target | R80's bullet graph at the content width × 16, then "‹p›% of ‹target›" in `text-xs` `text-secondary` | §7h Bullet graph |
| KPI tiles | 8 px gap, 1 px `border-subtle`, radius 6, padding 10 12; a marked tile has the 1.5 px marking outline; unmarked tiles keep their text in `text-secondary` and fade their micro-charts to 0.28 | §4; §5 marking outline and fade; rule 2 |
| Graphical table | 24 px dense rows, 28 px header; Sparkline cells 64 × 16; Bullet cells 96 × 16 with the value beside; Icon cells the status icon and its word; partly marked Value cells add "· $X marked" in `text-secondary` | §4 table rows; §7h; §7a "Tables" |
| Waterfall | increase §5's diverging blue (categorical slot 1's hex), decrease its red (slot 8's hex), totals `text-secondary`; labels ▲/▼ and a sign in `text-xs` `text-primary`; square ends; 2 px surface gap; connectors 1 px `border-strong`, dash 2 2 | §5 diverging "blue ↔ red"; rule 3; 23-Q12 |
| Histogram | bins in slot 1 (or the Colour members), a 1 px surface gap and square ends; ticks at bin edges | §5; derived here (bins are a continuous range) |
| Bubble | size by area, 8–40 px across; fill at 0.72 with a 1 px `bg-surface` ring; larger marks drawn first; shapes in order circle, square, triangle, diamond, down-triangle, cross (≤ 6); a size legend of three reference circles, 1 px `text-secondary` | §6 markers ≥ 8 px; §5 ≤ 6 shapes, ≤ 3 colours on all-pairs forms; 23-Q13 |
| Map layers | regions: §5's sequential ramp, the null neutral and "No data", 0.5 px `bg-surface` boundaries; points: area-proportional 8–24 px, 0.72 fill, 1 px surface ring, slot 2 over a Regions layer (slot 1 is the ramp's hue); density: the sequential ramp fading to transparent, regions drawn as 1 px `border-strong` outlines while it shows | §7e Country map; rule 86; derived here |
| Parallel coordinates | axes 1 px axis colour, each titled `text-xs` `text-primary` with its max above and min below in `text-secondary`; lines 1.5 px, at 0.6 past 50 lines; brushed range: the drag overlay | §6; §7a DragOverlay; derived here |
| Bullet chart | 24 px band rows, 48 px pitch; bands R80's three greys (`bg-subtle`, `border-subtle`, `border-strong`), lightest lowest; value bar 8 px `text-primary`; target 2 × 32 px `text-primary`; one shared axis from 0 | §7h Bullet graph, scaled 2 × (band 12→24, bar 4→8) |
| 100 % stacked | value axis fixed 0–100 %, ticks every 25 %; tooltip "‹value› · ‹p›% of ‹category›" | §6; derived here |
| Sankey | nodes 12 px wide; the colouring step's nodes in their members' colours, other steps' nodes `text-secondary`; links in that colour at 0.4, 0.6 hovered; labels `text-xs` outside the nodes with their totals | §5; derived here |
| Box plot layers | violin in the category colour at 0.24 with a 1.5 px edge; box 20 px wide inside a violin; points 8 px at 0.6 | §7h area fill; §6 markers; §7e outliers at 60 % |
| Funnel | §6 bars on one left baseline, 28 px, 44 px pitch, one colour; conversion `text-xs` `text-secondary` after each value | §6; derived here |
| Timeline | bars 16 px in 28 px rows, radius 3; "▸ running" for an open end; Today as R80's fixed reference line (1.5 px, dash 5 4, `text-secondary`); a zero-length task an 8 px diamond | §4 compact rows; §7h Reference line |
| Calendar heatmap | 14 px cells on a 16 px pitch, radius 2; §5's sequential ramp; days with no rows in the null neutral with a "No data" swatch; weekday and month labels `text-xs` `text-secondary` | §5; rule 86; 16 = `text-xs` line height |
| Icicle and sunburst | 1 px surface gaps; colour follows the first level's member and deeper boxes inherit it; root `border-strong`; labels `text-xs` `text-primary` on a 3 px `bg-surface` halo where a box is ≥ 16 px tall | rule 7; §7h Reference label halo |
| Marking on new types | §5's 1.5 px marking outline and 0.28 fade throughout; a range or brush drawn as the drag overlay on `bg-subtle` | §5; §7a |
| Paging | "Tiles 1–20 of n", "Rows 1–50 of n" with 24 px ‹ › buttons | §4 small controls; 23-Q5 |
| Proposed caps (23-Q5) | KPI tiles 20; graphical-table rows 50 a page; parallel-coordinate lines 1,000; Sankey flows 50; calendar 366 days a panel, offered from 56; bullet bands 2–3; histogram bins 5–50 | proposed, not decided |

**Where each surface lives**

| Surface | Placement |
| --- | --- |
| The new types | The chart-type gallery (AC-217), on the shelves design 23's screen 1 lists, one new shelf, Flow (23-Q11) |
| New wells | The chart editor's Data tab, after Metrics and Dimensions in each type's order (design 23's sheets) |
| Stack 100 %, Draw as, Points and Violin, Colour links by, Percent of, Scale, Week starts | The chart editor's Customize tab |
| Boundary sets (custom GeoJSON) | Uploaded by the semantic-layer engineer; where, after research (23-Q6) |
| Bin dimensions | Drafted from the histogram's "Make bins in the model…" into My workspace, in the model editor (23-Q4) |

## 8. Components (primitives and states)

- **Shell:** TopBar, WorkspaceSwitcher, Pane (with collapsed rail), Splitter, Drawer, CommandPalette.
- **Fields:** FieldTree and FieldRow, with role icon, type icon, name, description tooltip, drag handle, and "used" dot.
- **Wells:** Well and WellPill. The pill shows name, aggregation or granularity menu, sort, and ×. It can be `default`, `drag-over-legal`, `drag-over-illegal`, or `error`.
- **Charts:** ChartTile (title, filter indicator, cache badge, ⋯ menu), plus the empty, loading, error, and stale states. Also RecommendationCard and RecommendationRow.
- **Filters:** FilterBar, FilterWidget (date, list, range, checkbox), CrossFilterChip, and FilterChip (from "Filter to/out marked").
- **Markings:**
  - MarkingChip (swatch, name, value summary, source tile, menu, ×)
  - MarkingBadge ("● n marked"; "Details · Marking & Countries")
  - MarkingsPanel
  - MarkedRowsDrawer
  - NothingMarkedState (message, empty, all data)
  - DragOverlay (rectangle or lasso)
- **Dashboard settings:** SettingsPage (nav plus sections), InteractionModeCard, MarkingRow (colour slot, name, default, usage), and TileMarkingTable.
- **Inspector:** InspectorTabs, Section, Field (text, number, select, segmented, switch, color swatch), and AxisEditor.
- **Admin:**
  - DataGrid (sortable, filterable, virtualized, 34/24 row modes)
  - StatusBadge (icon + label: queued, running, running late, succeeded, failed, suspended)
  - PermissionGrid (group × object, with drill-down)
  - CodeEditor (YAML/JS, with problems gutter)
  - ValidationPanel
  - ConnectionForm (General · Connection · Advanced · Test, with per-check results)
  - Schedule editor
  - JobDetail (history table and dependency graph)
- **Markdown:** MarkdownTile with typed live-value tokens: `{{filter:region}}`, `{{measure:orders.revenue}}`, `{{sparkline:…}}`. No raw HTML.
- **Phase 2:**
  - AccountButton and AccountMenu; SingleUserChip; SignedOutState (the five states of §7e)
  - AccessPanel, GroupRow (set here, inherited with source link, outranked), GroupCombobox
  - AccessChip (Super-Admin, Read-write, View only)
  - WorkspaceBand; OriginLine; TargetPicker (read-write folders only)
  - EditInWorkspaceDialog; ProposeDialog (with the character counter); ProposalStatus (Waiting, Approved, Rejected; icon and label)
  - ReviewsControl (count pill); ReviewsList; ReviewView (item pane, rendered item or diff, inspector); YamlDiff; SettingsDiff
  - HistoryPanel and VersionRow
  - BookmarkRow (visibility icon and label)
  - AuditTable, AuditFilters and AuditRecord
  - CountryMapTile (map, legend, "No data" swatch, unplaced-codes note); BoxPlotTile (row-limit warning band)
- **R78 (§7f):**
  - SourcePicker (custom listbox, grouped, state per row); SchemaTree (PK / FK tags, Find a table, table ⋯)
  - EditorTabs (state icon, ⋯, ×); RunLine; ParameterStrip; RunBar (held, with its reason); ResultHead (Make a cube…, Make a chart…, Download CSV)
  - SavedList and HistoryList (Only me); SaveQueryDialog; MakeCubePane (columns table)
  - TokenList (working, no longer working); NewTokenDialog; TokenShownOnce; ConnectHelp; RevokeDialog
- **R80 (§7h, proposed):**
  - SeriesRow (swatch, name, MarkSegmented, AxisSegmented, Auto); SeriesGroup (a split measure and its members); AxisGroup (Left, Right, with the locked include-zero line); ComboWarning; NotDrawnPill; SplitByWell; LegendGlyphButton; ReferenceList and ReferenceForm (line, band; horizontal, vertical)
  - TextTile (view: static renderer; edit: the Tiptap editor); TextToolbar (block style, bold, italic, lists, link, Insert, the element counter); InsertMenu (combobox and listbox)
  - LiveElement kinds: Value, Change, Sparkline, Icon, BulletGraph, Marking, FilterValue, AsOf; each with edit, view, loading, no-data, error, no-permission and broken states; ElementTooltip
  - FilterControl (the filter bar's widget, compact); ParameterControl (segmented or list); ActionButton and ActionList
  - ParametersSection, ParameterForm (role, choices, default, used by); ParameterPill (in a well)
  - SummarizePanel; DraftCard (facts, Insert, Regenerate, Discard); AILabel; EarlierDataWarning
  - AISettingsPage (General, Provider, Limits, What's sent, Test connection, Usage); StoredKey and ReplaceKeyDialog; ConnectionChecks
- **R81 (§7i, proposed):**
  - KpiTile (value, Change, sparkline, target; tiled list with paging); CompareToField; DirectionSegmented
  - GraphicalTable (Value, Change, Sparkline, Bullet and Icon columns; ColumnList with ⋯ Move up, Move down, Remove; paging)
  - WaterfallChart; HistogramChart (BinsField; "Make bins in the model…"); BubbleChart (SizeLegend, ShapeLegend); MapLayers (BoundarySetSelect, RegionsLayer, PointsLayer, DensityLayer, UnplacedNote); ParallelCoordinates (ScaleWarning, AxisRangeInputs if 23-Q8 (a)); BulletChart (BandsField); StackModeSegmented; SankeyChart; BoxPlotDistribution (Points, Violin); FunnelChart (PercentOf); TimelineChart (EachBarIs; RunningEnd); CalendarHeatmap (WeekStart; NoDataSwatch); IcicleChart (DrawAs; ZoomBreadcrumb)
  - States per type: empty (what's missing, one action), over a limit (the cap and an alternative), can't be marked (icon and label), and the table view

## 9. Checklist (numbered rules for design-critic and write-spec)

1. No text is smaller than 12 px, whatever a design draws; the WebKit native select (§3) is the only exception (R76, 2026-10-08). Tables, axes and KPIs use tabular numerals.
2. All text meets WCAG AA contrast (4.5:1 for body text, 3:1 for text ≥ 18.66 px bold or ≥ 24 px) in both themes.
3. Every status, validation, or job state shows an icon and a text label, never colour alone.
4. A legend appears when a chart has 2 or more series. A single-series chart has no legend box.
5. A chart with 4 or fewer series also has direct labels, or a table view is one click away.
6. No chart uses more than 8 categorical colours. Past 8, it folds to "Other" or facets.
7. A member keeps the same colour in every tile on a dashboard and after any filter.
8. The recommender never proposes a dual y-axis.
9. The recommendation panel shows the top pick and at least one runner-up, each with a reason of 80 characters or fewer.
10. After the user picks a chart type manually, the choice stays pinned through later field changes ~~until "Back to recommended" is clicked~~ until the user chooses Auto, or Use on the Recommended card (R76, 2026-10-08; AC-032).
11. Every drop target can also be filled from a keyboard-reachable "+" picker.
12. During a drag, illegal wells show the reason they are illegal.
13. Every dashboard uses exactly one interaction mode, set in Settings › Interactions: Markings or Cross-filtering. In cross-filter mode, clicking a mark filters or highlights the other tiles on the tab, and a clearable chip appears. In Markings mode, rules 43–56 apply.
14. Each filter widget shows its scope (dashboard, tab, or tile).
15. Dashboard tiles snap to a 12-column grid with 16 px gutters.
16. Tiles use 16 px padding and a 6 px radius, with no shadow at rest.
17. Tree and inspector rows are 28 px high, controls 32 px, and pills and chips 24 px.
18. Loading states use a skeleton of the chart form. Error states offer Retry and a Details disclosure.
19. Each chart's canvas shows whether its query hit a pre-aggregation and the age of its cache.
20. Model objects offer Form and Code views that stay synchronized. Switching warns if information would be lost.
21. Any dashboard can be previewed "as" a group or user (the security "view as" mode), and a persistent banner shows it is active. *Amended 2026-09-25 (`docs/inputs/2026-09-25-architecture-decisions.md`, decision 12; requirements R27): tokens carry groups only, so the preview is "as" one or more groups, and "as a user" means as that user's groups (AC-166).*
22. The jobs list shows name, status (icon + label), last success, duration against average, trigger, and model link.
23. A data-source connection can't be saved until a Test step passes, ~~or the user overrides it explicitly~~ with no override (the user's answer, 2026-09-27). The Test step shows each check's result.
24. Light and dark themes are both complete. Neither is produced by automatically inverting the other.
25. Markdown tiles never render raw HTML. Live values use typed tokens.
26. Every key the Cube YAML schema accepts for a cube or view can be edited in the Form view, and every enum offers exactly the validator's allowed values.
27. A form edit appears in the YAML within one render, and a valid YAML edit appears in the form within 500 ms.
28. A YAML parse error names its line in Problems and puts the form in read-only mode until the error is fixed.
29. Every chart recommendation offers ~~a "Why this chart?" trace listing the signature, the cardinalities, and each hard rule's pass or fail~~ "Why this recommendation?": a checklist with ✓/⚠ icons of the signature, the cardinalities and the rules that decided, with every hard rule's pass or fail for every type one link away ("Show every rule for every type") (R76, 2026-10-08; AC-029).
30. A dual-axis (combo) chart is reachable only as a manual pick, and while it's active it shows a warning.
31. Clicking a mark in Explore offers Drill into (when a hierarchy exists), Keep only, Exclude, and View underlying rows. Drill-down shows a breadcrumb that goes back.
32. In cross-filter mode, Settings › Cross-filtering sets Filter, Highlight or None for every source → target tile pair. The default comes from "Default for tile pairs", which starts at Filter.
33. A details tile offers "Limit data using markings", "Rows must be included in: All markings (AND) / Any marking (OR)" and "If no items are marked in the master tiles, show: All data / Empty visualization / Message on empty background".
34. Schedules labels its owner as Cube (refresh_key) or wechart (builds, deliveries, warm-ups), and Cube-owned schedules are read-only there.
35. A new data source can't be created until the wizard's Test step passes.
36. Dashboard edit mode has no width or height fields. Tiles are sized only by dragging an edge or corner, or with Shift+arrow keys, and a resize shows a live columns · percent · pixels readout.
37. A tab group can exist only inside a section. Adding one elsewhere wraps it in a section and says so.
38. Every destructive dashboard edit (delete a tile, section or tab, or ungroup) can be undone from a toast and from Undo (⌘Z).
39. Every edit-mode action can be done without a mouse: move, resize, edit chart, delete, and add from the sidebar.
40. Re-rendering the dashboard in edit mode keeps the canvas and sidebar scroll positions.
41. Editing a dashboard-local chart never changes any other dashboard. Before a shared chart is edited, the editor states that it is shared and on how many dashboards, and offers "Make a local copy".
42. An Image tile without alt text shows a warning in edit mode. A Link/button accepts only dashboard targets or http(s) URLs.
43. Every dashboard has at least one marking, and exactly one is the default. New chart tiles use the default marking.
44. A tile's Marking setting lists "(None)" and every marking. A (None) tile can't be marked.
45. A tile can't be limited by the marking it marks with. That marking is disabled in its limit list, with the reason shown.
46. A marking is stored only as a predicate over Cube dimension members (tuples of member, granularity and value), never as row indexes or result positions.
47. Click replaces the marking, Ctrl/⌘+click toggles, drag marks a rectangle, Alt+drag a lasso, and Ctrl/⌘+drag is ToggleOrAdd. Clicking an empty plot area unmarks that tile's marking. A drag of 5 px or more is never treated as a click.
48. Markings span every page tab of the dashboard.
49. Marked items keep their colour and gain an outline in the marking colour; unmarked items fade. A partly marked item shows its marked share from the baseline only for additive measures (sum, count). Non-additive measures get a pattern plus "Marked: X" in the tooltip.
50. Marking state is never conveyed by colour alone. Every tile using a non-empty marking shows "n marked" beside the marking's swatch, and every non-empty marking has a chip naming it and summarising its values.
51. Every marking colour is at least ΔE 15 (normal vision) and at least ΔE 8 (colour-blind simulation) from every categorical slot in both themes.
52. Arrow keys move focus between a tile's items without changing the marking. Space marks the focused item, and each marking change is announced in a polite live region.
53. "Filter to marked" and "Filter out marked" create removable dashboard filters and clear the marking. "View marked rows" shows the underlying rows, capped, with export.
54. Saved dashboards store marking definitions only. Current marks are carried only by a link ("Copy link with marks") or a bookmark.
55. When every limiting marking is empty, a details tile shows its nothing-marked state. When a marking is non-empty but its items are filtered out, the tile says the items are hidden by filters.
56. The settings page keeps both interaction configurations and labels the inactive one. Saving settings while editing is one undoable change.
57. A new dashboard starts in Markings mode, with one marking named "Marking" set as the default (user decision 2026-09-19).
58. When a tile is first limited by a marking, its nothing-marked state defaults to "Message on empty background", pre-filled with the master tiles' names (user decision 2026-09-19).

Phase 2 (§7e; evidence in `references.md` › Phase 2):

59. The top bar shows the signed-in user's name beside a 28 px avatar at widths of 1280 px and above. The account menu holds the identity, a Super-Admin label for Super-Admins, and Sign out. With security off, the same place shows a "Single-user mode" chip (icon and label) and there is no Sign out.
60. The signed-out, sign-in-failed, no-group-list and session-ended states show only the product mark, one sentence and one action. No folder, item or wechart content renders behind them.
61. A signed-in user with no folder access sees an Explore empty state that names no folder and says access comes from AD groups.
62. The Access panel lists read-write groups before read-only groups. Each list separates "Set here" from "From ancestors". Every inherited group names its source folder as a link. Inherited rows carry a lock icon and have no remove control.
63. An unset list says "Not set here. Inherits from _folder_." When nothing reaches a folder, its header and Access panel both say "Only Super-Admins can see this folder".
64. The group picker is labelled "AD group". It suggests only the editor's own groups and groups already set on folders the editor may see, and it never offers a person.
65. Access changes apply only on Save, and the Save button counts pending changes. A save that would remove the editor's own read-write access asks first. Every saved change can be undone from its toast and appears in the audit trail.
66. A group set on a folder that an ancestor already grants at a higher level states which grant outranks it.
67. No tree, listing, count, search result or link reveals a folder or item the user may not see. A link to one renders the same Not found page as a missing item, and there are no locked or greyed placeholders.
68. A read-only user's Explore has no "+ Folder", New menu, My workspace, Access, History or pencil, lists only subfolders and dashboards, and offers no row action that changes anything.
69. Every folder header shows the user's access there as a chip with icon and label: Super-Admin, Read-write or View only.
70. Models and data sources appear in folder listings with their kind as text in Type. They open in the model editor or the source settings under the folder's breadcrumb, read-only in shared folders.
71. A shared item offers no in-place editing. For read-write members its primary action is "Edit in my workspace", or "Open my copy" when a copy exists. In folders where the user is view-only, neither appears.
72. "My workspace" is the first tree root, above the shared root, with a person icon. Every page inside it carries the band "My workspace · only you can see this".
73. Every workspace item shows its origin ("Copied from _path_ · version _n_" or "New") and its target folder. The Edit in my workspace dialog for a dashboard lists models and data sources unchecked, and says that uncopied ones are used from their folders.
74. Creating a dashboard, chart, model or data source in the workspace asks for a target folder from a picker that lists only folders where the user has read-write access.
75. The Propose dialog names the target and says whether the item is new or replaces version _n_. It warns when the item it replaces isn't its origin, and lists bundled workspace models with the reason and no way to remove them. Its description counter reads "_n_ / 1,000" and blocks submission above 1,000 without truncating.
76. The top-bar Reviews control appears only to users who may approve something. ~~Its count equals the rows in To review~~ Its count equals the rows in To review plus the open requests in Calculation requests, and its accessible name includes the count (amended 2026-10-04, [R60]).
77. Approve and Reject are available only in the review view. That view renders the proposed item: a drawn dashboard with a Proposed / Current switch, a model YAML diff, or a data-source settings diff with no credential values. Approve asks for confirmation. Reject offers an optional reason with a "_n_ / 1,000" counter.
78. When the reviewer is the author, the review view says so and the button reads "Approve my own proposal".
79. Proposal states always pair an icon and a label: Waiting for review, Approved, Rejected. A rejected workspace item shows the approver, the time and the reason at the top of the item.
80. History lists at most 10 versions, newest first, each with number, time, author, approver and description, and marks the current one. Restoring always opens "Propose restoring version _n_" and never replaces directly.
81. Bookmarks list Mine before Shared, newest first within each. New bookmarks are "Only me". Each row shows its visibility as icon and label, and shared rows name who shared them. Only the owner sees Update, Rename and Stop sharing; the owner sees Delete, and so does a Super-Admin on another user's shared bookmark; others see "Save a copy to mine" (amended 2026-10-04, R61, AC-293: ~~Only the owner sees Update, Rename, Stop sharing and Delete~~).
82. The audit trail sits under Security and is shown to Super-Admins only. It lists newest first with time, user, event (icon and label), folder, item and details. Its User, Event, Folder and Time filters combine with AND as removable chips, and the page states the retention period.
83. No stored credential renders as text anywhere, including diffs and audit records. The UI shows "Stored · encrypted", "Kept from _folder_ · encrypted" or "replaced".
84. Data sources lists each source with its folder path, driver, health (icon, label and last-test time) and the cubes using it. Jobs and Schedules show a Folder column and filter. A scoped user's page says it shows only their read-write folders and names no other folder. Read-only users see none of the three in the switcher.
85. Every new panel, dialog and popover takes focus on open, closes on Esc (asking first when there are unsaved changes), and returns focus to the control that opened it. No approval, rejection or access change is bound to a single-key shortcut.
86. A country map uses an equal-area projection and §5's sequential ramp. Countries without a value take the null neutral, and the legend shows a "No data" swatch beside the continuous bar, whose two ends are labelled with formatted values.
87. A country map names every code it can't place in a text note under the map, in page DOM rather than inside the chart.
88. A box plot draws Q1–Q3 boxes with a median line, whiskers per its option, and outliers as dots. Its tooltip lists n and the five statistics in tabular numerals.
89. A box plot drawn from fewer rows than its data holds shows "Computed from _n_ of _N_ rows" on the tile, with the warning icon.

R78, the SQL runner workspace (§7f; design 17). From `references-sql-runner.md` › Checklist, its rules 107–125 renumbered from 90 (the copilot study's proposed 90–106 aren't adopted), and amended where R78's answers differ, each amendment named:

90. The workspace switcher lists **SQL runner** after Schedules, to Super-Admins and read-write members only. Its address names the open tab, and reloading in the same browser restores that tab, its data source and its text. *(ref. 107; AC-001, AC-446; amended for R78's "Browser only")*
91. The SQL runner has three panes: on the left, the data source picker and schema browser (280 px, 220–400, rail 40); in the centre, the editor tabs over the results; on the right, Saved and History (320 px, 280–480, rail 40). F6 cycles them. The editor and the results split at 30 : 70 to start, with the editor at least 200 px and the results at least 160 px. *(ref. 108)*
92. The picker lists only data sources the person may run SQL on, or could once a Super-Admin turns the runner on: their own My workspace sources first, then by folder path, then Cube Store at the root while it is on, then the "Cube" group, which everyone who may open the workspace sees, with no switch. Each row shows the driver and the runner's state as an icon and a label. An off source is listed only to Super-Admins and to its own folder's read-write members, and choosing it shows the off panel. *(ref. 109; AC-447, AC-481; the "Cube" group added for R78-13)*
93. Every editor tab is bound to exactly one data source. A tab's run state appears as an icon, with its label in the tab's tooltip and accessible name, never as colour alone. Changing a tab's data source keeps the SQL and clears the result. Tabs are kept in that browser only, for that signed-in user, and never on wechart's server. *(ref. 110; AC-450, AC-451; storage amended for R78's "Browser only")*
94. Above every tab's editor stand the run line (database, host, login) and AC-385's warning, naming that tab's data source. Neither can be hidden. A tab in the "Cube" group says instead that it runs through Cube, as the user, and shows no bypass warning. *(ref. 111; AC-385, AC-467)*
95. The schema browser lists schemas → tables → columns, each column with its database type and PK or FK tags, an FK's tooltip naming its target. Nothing runs when a node opens, except catalog reads. "Insert SELECT" writes a SELECT in the driver's dialect with a 100-row limit and doesn't run it. "Preview 100 rows" is an ordinary run in a new tab: capped, audited and listed in History. *(ref. 112; AC-448, AC-449)*
96. One person has at most one run going across every tab. Every other tab's Run is disabled, with "Go to it" and "Cancel that run". Esc never cancels a run. *(ref. 113; AC-452, AC-379)*
97. Every run outcome uses design 15's labels as an icon and a label, the same in the tab, the result head and History. A result cut at any limit says which limit. *(ref. 114; AC-452, AC-377, AC-378)*
98. A `{{name}}` outside strings and comments is a parameter. It is listed once under the editor with a type (Text, Number, Date or Boolean) and a value, and Run is held, naming what is missing, until every parameter has a value. Values are sent bound and never written into the SQL text. The audit record's SQL keeps `{{name}}` and holds no value. Where research hasn't shown that a source binds values, Run is held and says parameters aren't available on that source. *(ref. 115; AC-453, AC-454; the last sentence added for R78-14, AC-482)*
99. Saved queries are personal. Only their owner can list, open or find them, Super-Admins included. They never appear in Explore, a folder, a proposal or a bookmark. Each shows "Only me" as an icon and a label, and Delete offers Undo. A name is required, at most 100 characters and unique among the owner's saved queries; a description is at most 1,000 characters. *(ref. 116; AC-458, AC-460; the name rule added for R78-15, AC-483)*
100. A saved query or History row whose data source the person can no longer use opens with no data source chosen, and never names the old one. *(ref. 117; AC-459; design 17 Q4)*
101. Make a cube… and Make a chart… are enabled only on a Finished or Limited SELECT run on a data source (not Cube Store, and not the "Cube" group), for someone who may make a model. Otherwise they are disabled, with the reason given. *(ref. 118; AC-461; the "Cube" group added for R78-13, AC-481)*
102. Make a cube… opens a docked pane headed "in My workspace". It shows the name (held to AC-422), a target folder among read-write folders only, the run's data source, the SQL that ran (with parameter values written in, and saying so), and each column with include, member name, dimension or measure, Cube type and primary key. It adds a `count` measure, adds an unpublished draft, and publishes nothing to any folder. *(ref. 119; AC-462)*
103. Make a chart… does what rule 102 does, then opens the chart editor on a new chart in My workspace over that cube, with nothing placed and "← Back to SQL runner". *(ref. 120; AC-463; "nothing placed" added for R78's answer to the study's Q7)*
104. The SQL runner's empty, loading and error states each show an icon and one sentence, and an action where there is one. Lists load as skeleton rows. A database error is shown redacted, and marks its line in the editor where the database names one. *(ref. 121; AC-466)*
105. Closing a tab whose text is neither saved nor the SQL of its last run asks first. *(ref. 122; AC-450; its storage sentence moved to rule 93)*
106. A data source's page keeps the runner's switch, its record, the off panel and "Open in SQL runner", and holds no SQL editor. *(ref. 123; AC-464)*
107. The SQL runner adds only the keys R78 approved under R75: ⌘/Ctrl+Enter runs the selection, or else the statement at the cursor; ⌘/Ctrl+S saves; ⌘/Ctrl+F finds inside the editor; autocomplete opens as you type (↑ ↓ choose, Enter accepts, Esc closes the list only, Tab still leaves the editor); Ctrl+Q opens a tab on the current data source, and Ctrl+Alt+[ and Ctrl+Alt+] select the previous and next tab, with Control on macOS too. No key closes a tab. *(ref. 124; AC-387, AC-455, AC-456, AC-480; amended from "no shortcut … unless the user approves it" to the set R78 approved)*
108. Every SQL runner pane, dialog and popover follows rule 85. The picker is a custom listbox that meets the 12 px floor. The workspace adds no colour, type size or weight. *(ref. 125)*

R79, the compact dashboard header (§7g; design 19, approved 2026-10-17). From `references-compact-header.md` §4, "Proposed checklist rules", numbered from 109 in its order. ~~The copilot study's proposed rules (`references-copilot.md`) are still unnumbered; when the copilot is taken up they follow these, from 115.~~ R80's rules take 115–146 below; ~~the copilot study's proposed rules, when the copilot is taken up, follow them, from 147 (2026-10-18)~~ R81's take 147–167; the copilot study's proposed rules, when the copilot is taken up, follow them, from 168 (2026-10-18).

109. The dashboard header is one 48 px row by default. It holds the way back to the folder, the title, the page tabs, the interaction summary, the actions and the Filters toggle, and stays fixed above the scrolling tiles. *(AC-484, AC-196)*
110. The toggle is a disclosure button with `aria-expanded`. Its visible label names "Filters" and the number set, or "Details" when the dashboard has no filters. *(AC-486)*
111. The expanded sheet pushes the tiles down, never covers them, and holds the description, the ownership line and the full filter bar. It closes with its toggle, or with Esc while focus is in the header, and focus returns to the toggle. *(AC-487, AC-489)*
112. Under `prefers-reduced-motion: reduce` the sheet opens and closes without animation. *(AC-488)*
113. A filter changed while the sheet is closed changes the toggle's count, or a compact chip, and is announced politely. *(AC-493)*
114. In edit mode the sheet is open and has no toggle. *(AC-491)*

R80, combo charts, the Text tile, dashboard parameters and the AI provider (§7h; designs 20–22, **proposed 2026-10-18**). Drawn from both studies' proposed rules and R80's answers. ~~The copilot study's rules follow from 147 when the copilot is taken up~~ R81's rules follow from 147; the copilot study's rules follow those, from 168, when the copilot is taken up; its 103 and 104 (its numbering) overlap 142–144 and would be merged then.

*Combo charts (design 20)*

115. A combo draws each measure as its own series with its own mark (Bar, Line, Area or Point) and value axis (Left or Right), set in Customize › Series, in the Metrics pill's menu, and, in the chart editor only, from each legend entry's glyph. A new combo draws the first measure as bars and the rest as lines, all on the left. Each series row shows Back to Auto once changed, and a manual mark or axis stays pinned through field changes.
116. A combo has at most two value axes, one left and one right. The Right axis group, and Synchronize axes, appear only while a series is on the right. Synchronize is offered only when both axes share a format; otherwise it's disabled with the reason. Synchronized, both sides show one scale.
117. Only the author's explicit choice puts a series on the right axis; the recommender, Auto and field changes never do. A combo draws at most 8 series after any split: members fold to the top *k* plus "Other" first, then a measure past the limit shows "not drawn · over 8 series" with Small multiples and Table. In a combo, a measure on another scale is "not drawn · on another scale", and its first offer is "Draw on a right axis".
118. With two value axes, both include zero whenever either carries a bar series (the include-zero control shows locked, with the reason), their zero lines sit at the same height, the right axis's ticks fall on the left axis's gridlines, and the right axis draws no gridlines.
119. Each value axis is titled with its measures, each preceded by its mark glyph in its series colour, then its unit. Tick labels stay `text-secondary` in both themes.
120. A combo's legend entries show their mark glyph, and a right-axis series adds "(right)". A split combo's legend has two parts: the split's members as swatches, then the measures as glyphs in `text-secondary`. Hovering a series or its legend entry emphasises its axis.
121. While a combo draws two value axes that aren't synchronized, the editor and the tile's edit mode show a `status-warning` row naming both measures and their units, offering One axis, Synchronize, Small multiples and Table; when both share a format the row says so and offers Synchronize first. A combo with one axis, or two synchronized, shows no warning, and viewers never see it. *(AC-218 as amended)*
122. A combo splits by at most one dimension, across every measure; series are measure × member. Colour follows the member, as in every tile (rule 7), so while split each measure has its own mark, a mark another measure uses being disabled with the reason. Every member of a measure sits on that measure's axis.
123. Each value axis offers log scale. While two axes are drawn, both use the same scale type and change together. Log scale is unavailable while either axis carries bars, with the reason. Values at or below zero on a log axis aren't drawn, and their count is shown.
124. Reference lines and bands are horizontal (reading one value axis) or vertical (reading the category axis, at a member or a date). Each has a required label drawn beside it in the chart, never in the legend. A fixed line is dashed `text-secondary`; a line computed from a series (average, median, minimum, maximum) is dashed in that series' colour; a band fills `bg-subtle` behind the marks. One outside its axis's range isn't drawn, and its row says so with the warning icon.
125. A combo's text alternative and table view name each series' mark, axis and unit, and each reference line.
126. Stacking is chart-wide: bars side by side or stacked, areas overlapping or stacked. Stacks never cross axes.

*The Text tile and dashboard parameters (design 21)*

127. The dashboard has one Text element, which replaces Markdown in place. Every existing markdown tile opens in it unchanged, its tokens as live elements. It never stores or renders raw HTML and never runs a script.
128. In edit mode a Text tile is edited in place on the canvas, reached by double-click or by "Edit text on the canvas", Properties' first control. Its toolbar offers block style, bold, italic, bulleted and numbered lists, link and Insert, and counts elements. Block styles map to §3's tokens only (Paragraph, three headings, Large value at `text-kpi`), and there's no free colour, font or size. Markdown shortcuts convert as typed. Esc or Tab leaves the text.
129. `/` at a line's start or after a space, the toolbar's Insert, and `{{` open the insert menu: a combobox with a listbox (↑ ↓, →, Enter, Esc) listing the element kinds in groups (Live values, Controls, Copilot), then, as the author types, measures grouped by cube.
130. The live elements are Value, Change, Sparkline, Icon, Bullet graph, Marking, Filter value and As of. Each follows the filters that reach its tile, the tile's cross-filter setting (Filter or None; Highlight disabled with the reason) and any marking it names; its own filter is listed in its tooltip. In edit mode an element is an atom on `bg-subtle` with a `border-subtle` outline; selecting it opens its settings in Properties, where every element is listed.
131. A Text tile holds at most 10 elements (live elements, controls and buttons). The toolbar shows "n / 10 elements"; at 10, Insert and the menu's rows are disabled with the reason.
132. In view mode a value reads as text in the sentence's own type and weight, with tabular numerals and its member's model format. It's focusable; hover or focus shows what it is, the filters in effect, its marking and the data's age, which is also its accessible description.
133. A Change shows ▲ or ▼ and its sign, coloured by its direction (Higher is better, Lower is better, Neutral). An Icon always shows an icon and its word, and "No rule matched" when no rule applies. A sparkline (64 × 16) and a bullet graph (96 × 16) have no axes and carry a text alternative naming their measure and values.
134. A loading element shows a skeleton the width of its last value; no data shows "—" with "No data for these filters"; an error shows the warning icon and "Unavailable", with Details on focus; a value the viewer may not query shows "Unavailable" and never names the member; a removed member adds "n element needs fixing" in edit mode. An empty tile shows a placeholder in edit mode and nothing in view mode.
135. A filter control in a Text tile is one of the dashboard's filters, not a copy: the same widget, scope tag, value and state as the filter bar, so a change in either shows in both and in the header's count. A list control shows up to 1,000 values, says when there are more, and searches every value through Cube.
136. An action button uses the Link/button tile's styles and runs an ordered list of declared actions: go to a page tab, apply a bookmark, reset filters, export. Nothing runs that isn't one of these.
137. A dashboard parameter is defined in Dashboard settings › Parameters: a name, the role it switches (Measure or Dimension), ordered choices of model members with labels (up to 1,000), a default, and a list of what uses it. A parameter control in a Text tile sets it; a dashboard-local chart's well binds it from the picker's Parameters group, and in view mode such a chart says "set by ‹parameter›". Every choice must be queryable by every bound chart, or settings can't be saved. Bookmarks and copied links carry each parameter's value.

*AI summaries (design 21)*

138. "Summarize…" appears in the insert menu only while a Super-Admin has AI on and the author may use it (Super-Admins see it disabled, with a link, when it's off). A summary is drafted only at the author's request, from facts wechart computed through Cube as the author, which are shown with the draft. Every number in a draft is a live element; a draft holding a number outside one is rejected before the author sees it.
139. A draft appears as a card in the tile, headed as not yet in the tile, with Insert, Regenerate and Discard. Nothing lands until Insert; once inserted it is ordinary editable text and its elements count toward 10.
140. Text inserted from a draft carries "Written with Copilot · reviewed by ‹name›, ‹date›" as an icon and a label in `text-secondary`, in view and edit mode, with no AI colour.
141. AI wording is never regenerated by a refresh, a filter or a viewer. When a fact it cites changes sign or rank, authors see "Written for earlier data" with what changed, Review and Keep as written; viewers see "wording as of ‹date›" in the label.

*The AI provider (design 22)*

142. Security › AI is shown to Super-Admins only; anyone else gets Not found. It sets AI on or off, who may use it, the provider, endpoint and model, and the API key, which is write-only: once stored it reads "Stored · encrypted" with Replace…, and it is never shown, sent to a browser or written to the audit trail.
143. A change to the provider, endpoint, model or key can't be saved until Test connection passes with it. The test shows each check (reachable, key accepted, model answers, a test summary keeping every number live) with an icon and a label; later checks after a failure show "not run". Save counts pending changes, and leaving with unsaved changes asks first.
144. Usage limits (per person per day, for everyone per month) and the message shown at a limit (at most 280 characters, counted) are set here. An author at a limit sees the Super-Admin's message instead of Summarize. Every AI failure shows an icon, one sentence, Details and Retry, and never a key or a stack trace.
145. The page states what is sent to the provider (computed facts, tile titles, member names) and what never is (rows, SQL, model code, credentials). Settings changes, key replacements and inserted summaries are recorded in the audit trail.

*For all of R80*

146. Designs 20–22 add no colour, type size or weight and keep the 12 px floor. They add no keyboard shortcut beyond the insert menu's combobox keys and markdown's typing patterns (the editor's standard text keys wait on 21-Q11), and every panel, dialog and popover follows rule 85.

R81, the new chart types (§7i; design 23, **proposed 2026-10-18**). Drawn from `references-new-chart-components.md` §5 and R81's answers. Caps named here are 23-Q5's proposals until decided. The copilot study's rules follow from 168 when the copilot is taken up.

*The gallery and the KPI types (design 23, screen 1 and sheets 1, 2, 8)*

147. The chart-type gallery lists every new type on the shelf of each question it answers (design 23, screen 1), a type on two shelves being the same card. Each card states what it needs in the field list's words, saying "summed" where the measure must add up, and a card the chart's fields can't draw is greyed with what's missing. No gauge is offered.
148. A KPI takes optional Compare to (previous period, same period last year, another measure, a value), Target, Time, Tile by and Direction (Higher is better, Lower is better, Neutral). With none set it draws as today. Its change shows ▲ or ▼ by the value's direction, a sign and "vs ‹period› (‹value›)", coloured by Direction with status text roles; its sparkline and target are R80's elements at tile size, each with a text alternative. Tiled, each tile is a list item whose accessible name gives the member, value, change and target, and tiles page past 20.
149. A graphical table is a real `<table>` of one row per member with ordered columns, each a Value, Change, Sparkline (64 × 16), Bullet (96 × 16) or Icon (an icon and its word). Rows mark as table tiles do (click, Ctrl/⌘, Shift+click); sorting never changes the marking; a row partly marked by another tile shows its marked share in its Value cells; rows page past 50, each page querying its own trends.
150. A bullet chart draws each member's value bar against its target tick and 2–3 bands in R80's greys, lightest lowest, on one shared axis from zero. It's offered only while Target is set. Each bullet's accessible name is "‹member›: ‹value› of ‹target› (‹p›%), in the ‹band› band"; a member without a target says "No target".

*Ranking, flow and part of a whole (sheets 3, 9, 10, 12, 15)*

151. A waterfall's steps float from the running total with dashed connectors; totals start at zero and are `text-secondary`. Every step label carries ▲ or ▼ and a sign, so increase and decrease never rest on colour. It takes only a summed measure, refusing others with the reason. A total marks every member it sums; "Other (n)" marks its members; with Compare periods each step is a member's change between the two periods.
152. 100 % stacked bars and areas take only summed measures. Folding to "Other" and the row limit apply before shares are taken; the axis is fixed at 0–100 %; tooltips and the table view give both the value and the share.
153. A Sankey draws 2–4 ordered dimensions and one summed measure as acyclic flows, a member repeated in a later step being split as "‹member› (2)". A node marks its member and a link its (source, target) tuple; a link's marked share is given in its tooltip, not drawn, and the tile says so. Flows past 50 fold into "Other".
154. A funnel draws stages (a dimension, or two or more measures sharing a format) as bars on one baseline, in stage order, with "‹p›% of previous" (or "of first") as text. Stages that are measures can't be marked, and the tile says so. A stage larger than the one before is drawn as it is, with a warning.
155. An icicle (or, as its option, a sunburst) draws 2–4 levels or a hierarchy of one summed measure. A box is a path predicate and marking it marks everything under it. Click marks; double-click or "Zoom into" zooms, with a breadcrumb back, and zooming never marks or filters. Colour follows the first level's member; labels sit on a surface halo where a box is at least 16 px tall.

*Distribution and correlation (sheets 4, 5, 7, 11)*

156. A histogram's bins touch (a 1 px surface gap and square ends) and are spoken "from ‹a› to under ‹b›". Bins from a model bin dimension mark as ranges (AC-093); bins computed in the browser mark as entity lists of at most 1,000 and show "Computed from n of N" when the data was cut.
157. The box plot's Points (None, Outliers, All, Beeswarm) and Violin need Each point is, and say so when it's missing. A point marks its entity by ID; points are placed from a fixed seed so redraws match; a beeswarm that can't fit falls back to All and says so.
158. A bubble chart sizes marks by area between 8 and 40 px across, draws larger marks first, and shows a size legend of three reference circles with values. Colour takes at most 3 values and Shape at most 6, an over-cap well saying why; marks with a size at or below zero aren't drawn and are counted.
159. Parallel coordinates draw one line per member across 3 or more measure axes, each axis labelled with its own minimum and maximum, and the warning not to compare heights across axes is visible text. Brushing marks the members whose lines pass through every brushed range, stored as a member list of at most 1,000; lines past 1,000 aren't drawn and the tile says how many.

*Time and place (sheets 6, 13, 14)*

160. A map draws Regions, Points and Density layers on vector boundaries (Countries, Admin-1, or a custom set) with no tile basemap. Regions follow rules 86–87 on every boundary set. Points are area-proportional and take a non-blue slot over a Regions layer. The Density layer can't be marked and says so. Keys or locations that can't be placed are named under the map.
161. A timeline draws one bar per row from its start to its end on a time axis; a bar with no end runs to Today and reads "▸ running"; rows that end before they start aren't drawn and are named. A drag along the axis marks the bars that overlap the range. Durations are spoken in words.
162. A calendar heatmap draws one cell per day on §5's sequential ramp, days with no rows in the null neutral with a "No data" swatch; past 366 days it draws a calendar per year. A drag marks a contiguous date range; Ctrl/⌘ toggles a day.

*For every new type*

163. Each new type marks at the granularity it draws, with §5's outline and fade; where an item can only be partly marked it shows the marked share as its form allows (from its own base, in its cells, or in its tooltip), and a tile whose items are all partly marked says "‹marking›'s share shown" instead of a count. Anything that can't be marked says so with an icon and a label.
164. The recommender proposes a new type as the top pick only where design 23's sheets say (histogram, bubble, parallel coordinates, map, bullet with a target); every other new type is only a runner-up, each with a reason of at most 80 characters, and line stays the top pick for one measure over time. No new type needs a second value axis. Saved charts in Auto follow 23-Q3's answer.
165. Every new type has an empty state naming what's missing with one action, and every cap it meets shows the cap and an alternative (page, fold to "Other", filter, table); nothing over a cap is dropped silently.
166. Every new type has a table view (AC-178) holding the numbers behind every mark, and a text alternative naming the type, its encodings, its range and its extremes. No state rests on colour alone.
167. Design 23 adds no colour, type size or weight and keeps the 12 px floor. It adds no keyboard shortcut; keyboard marking on the new types uses §7a's existing keys only if the user approves it (23-Q8), and the table view is always the complete path.
