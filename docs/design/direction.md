# wechart design direction

**Status:** proposed on 2026-09-19. Waiting for the user to accept it after reviewing the prototype.
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
2. **Recommend, explain, never override silently.** The system proposes a chart and shows ranked runners-up, each with a one-line reason. A manual pick is pinned until the user clicks "Back to recommended".
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
| `text-xs`        | 12/16                 | 400         | axis ticks, legend, data labels, tree rows, inspector fields | Superset charts (12 px measured), Fluent Caption 1    |
| `text-xs-strong` | 12/16                 | 600         | grid headers, inspector section labels, well pills           | Fluent Caption 1 Strong                               |
| `text-sm`        | 14/20                 | 400         | forms, menus, dialogs, Markdown body, tables                 | Superset body (14 px measured), Fluent Body 1         |
| `text-sm-strong` | 14/20                 | 600         | tile titles                                                  | Metabase card titles 14/700 (measured)                |
| `text-md`        | 16/22                 | 600         | pane headers, small Header element                           | Superset chart titles 16/500 (measured)               |
| `text-lg`        | 20/26                 | 600         | page titles, medium Header element                           | Metabase dashboard title 20/700 (measured)            |
| `text-xl`        | 24/32                 | 600         | dashboard title, large Header element                        | Fluent Title 3                                        |
| `text-kpi`       | 32/40                 | 600, `tnum` | KPIs in a multi-KPI row                                      | Superset big number 36 px (measured), Fluent Title 1  |
| `text-kpi-solo`  | 40/52                 | 600, `tnum` | a tile with a single KPI                                     | Metabase scalar 54 px (measured) sets the upper bound |

- **Floor:** no text smaller than 12 px.
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
| Table rows     | **34** by default (admin lists, table tiles); **24** dense (result grids, logs). Superset's list rows measured 45–48, and wechart is deliberately denser. |
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
  - Choosing a different type pins it and shows a "Pinned · Back to recommended" chip.
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
| Click a trellis panel header | Mark the panel                                                                                                                                                                                                                                                                                |
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
- **Form tabs per cube:** **General** (name, sql_table/sql, data_source, title, description, public, refresh_key, meta) · **Dimensions** · **Measures** · **Joins** · **Segments** · **Hierarchies** · **Pre-aggregations** · **Access policy**. Views get **General · Cubes (join_path, includes/excludes, prefix, alias) · Folders · Access policy**.
- **Rows:** each member is one row in a list, showing name, type, SQL preview, and badges for primary key, public, and format. A row expands in place into its complete field set. Enum fields use selects populated from the validator's allowed values. Reference fields (`drill_members`, pre-aggregation measures and dimensions, join targets) use member pickers, never free text.
- **Sync:**
  - A form edit re-serializes the document and updates the code.
  - Code edits re-parse after a 300 ms pause, then update the form.
  - A parse error freezes the form and shows the error's line in the Problems panel.
- **Lossy round-trip warning:** switching to the form when the file has comments, Jinja blocks or YAML anchors shows a warning that names exactly what the form can't represent. Those constructs stay editable in Code only.
- **Validation:** a Problems panel with Errors and Warnings (Looker validator model). Each problem links to a line and a field, for example "Measure `revenue` has no `sql`", "Cube `orders` has no primary_key dimension", or "Unknown member `orders.stauts` in drill_members".
- **Schema source:** fields, enums, defaults and dependencies come from `docs/research/cube/data-modeling.md` → _YAML schema inventory_, checked against Cube's Joi validator at v1.7.42. The prototype's enum lists are **illustrative until that doc is saved**.

## 7c. Phase 1 scope adjustments (user decision, 2026-09-19)

- **Users and groups are phase 2.** Phase 1 assumes a single user. The Security surface is limited to listing access policies (authored in the model) and a **security-context preview**: the user edits a JWT payload and sees effective access, generated SQL and a dashboard preview. There are no user or group admin screens.
- **Schedules is a first-class surface.** It shows two schedulers side by side, each labelled:
  - **Cube's refresh worker** (`refresh_key`): read-only here and edited in the model.
  - **wechart's scheduler**: pre-aggregation builds through `POST /v1/pre-aggregations/jobs`, dashboard deliveries, and cache warm-ups.
  - Each schedule shows a cron expression with presets, its next runs, retry and suspend policy, and history.
- **Jobs** adds Run history (wechart-owned, because Cube Core keeps none), a Queue view with job tokens, per-run logs, partition-level builds, and "Resume" for suspended schedules.
- **Data sources** adds an add wizard (Type → Connection → Test → Name and assign), driver-specific fields, a health history recorded by wechart's periodic tests, and a Usage tab listing the cubes on each source.

## 7d. Taken from the approved prototype (AC-187, user decision, 2026-09-21)

The user asked that the UI "align with the ui styles in" the design prototype (`docs/design/prototype/`). Where the prototype's component rules differ from §3–5, the prototype's rule is followed, and each difference is recorded here:

- **Radius:** buttons, icon buttons, filter pills, tiles and panels are 6 px, where §4 says 4 px for controls. Inputs and selects stay 4 px, and a pill's scope tag is 3 px.
- **13 px type**, which is outside the §3 scale, on filter pills and page tabs.
- **Inspector controls** (the Properties panel) are 28 px at 12 px (`.input.sm`), as §4's compact row for inspectors.
- **`bg-hover`**, a token not in §5, for a hovered button or row. Light `#efeeea`, dark `#2c2c2a`. These are the nearest shades to the prototype's that pass the contrast audit (AC-005); the prototype's own `#e9e8e4` does not.
- **`bg-role-dimension-soft`**, the prototype's `--role-dim-soft`, a token not in §5: the avatar's ground, under `role-dimension` initials. Light `#e6eef8`, dark `#1d2a3a`, the prototype's own values. `role-dimension` on it is 4.68:1 in light and 6.44:1 in dark, and the pair is audited with the other tints (T245).
- **`--wc-shadow-pop`**, the prototype's popover shadow, in each theme. It is a shadow, not a colour text sits on, so it is outside the audited tokens.
- **Layout:** the dashboard runs edge to edge. The header, the page tabs, the filter band and the tiles are each padded 24 px from the sides, the filter band sits below the page tabs, and the edit sidebar is docked with a rule on its left.

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

## 9. Checklist (numbered rules for design-critic and write-spec)

1. No text is smaller than 12 px. Tables, axes and KPIs use tabular numerals.
2. All text meets WCAG AA contrast (4.5:1 for body text, 3:1 for text ≥ 18.66 px bold or ≥ 24 px) in both themes.
3. Every status, validation, or job state shows an icon and a text label, never colour alone.
4. A legend appears when a chart has 2 or more series. A single-series chart has no legend box.
5. A chart with 4 or fewer series also has direct labels, or a table view is one click away.
6. No chart uses more than 8 categorical colours. Past 8, it folds to "Other" or facets.
7. A member keeps the same colour in every tile on a dashboard and after any filter.
8. The recommender never proposes a dual y-axis.
9. The recommendation panel shows the top pick and at least one runner-up, each with a reason of 80 characters or fewer.
10. After the user picks a chart type manually, the choice stays pinned until "Back to recommended" is clicked.
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
21. Any dashboard can be previewed "as" a group or user (the security "view as" mode), and a persistent banner shows it is active.
22. The jobs list shows name, status (icon + label), last success, duration against average, trigger, and model link.
23. A data-source connection can't be saved until a Test step passes, or the user overrides it explicitly. The Test step shows each check's result.
24. Light and dark themes are both complete. Neither is produced by automatically inverting the other.
25. Markdown tiles never render raw HTML. Live values use typed tokens.
26. Every key the Cube YAML schema accepts for a cube or view can be edited in the Form view, and every enum offers exactly the validator's allowed values.
27. A form edit appears in the YAML within one render, and a valid YAML edit appears in the form within 500 ms.
28. A YAML parse error names its line in Problems and puts the form in read-only mode until the error is fixed.
29. Every chart recommendation offers a "Why this chart?" trace listing the signature, the cardinalities, and each hard rule's pass or fail.
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
