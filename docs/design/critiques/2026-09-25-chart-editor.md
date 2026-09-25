# Re-critique: chart editor against the design prototype (2026-09-25, after T255–T257)

Produced for T225 (AC-187) by a critique agent that measured with Playwright, and saved verbatim.

## What was compared

- **Prototype:** http://127.0.0.1:5500/index.html. I measured three entry points:
  - the library-chart editor: Explore › "Top 10 products" › Edit chart;
  - a new chart: Explore › ＋ New › Chart;
  - a dashboard tile's ✎ on "Northwind sales".
- **App:** http://localhost:5600, a production build with the real API. I measured:
  - `/explore/charts/seed-chart-axes/edit`, `…/seed-chart-status/edit` and `…/seed-chart-empty/edit`;
  - `/explore/dashboards/seed-root-dashboard-1`, then `edit-chart-tile-status` and `edit-chart-tile-region`.
- **Sizes and themes:** 1440×900 in light and dark, and 1280×800 in light.
- **Method:** Playwright (Chrome) as a library. Every value below is `getComputedStyle` or `getBoundingClientRect` on the named selector, or a screenshot I looked at.
  - Scripts and screenshots are in the session scratchpad, `critique-editor/`. That folder is temporary.
  - Where direction.md §5 or §7d replaces a prototype value, I did not count the difference: `text-muted` #6e6c67/#97958e, `role-measure` #a85400, dark `text-on-accent` #1f1f1e, `bg-hover` #efeeea/#2c2c2a.
- **Actions taken:**
  - Added fields, changed types (Combo, Pie), opened the gallery, "Why this chart?", Customize, the drawer tabs and the picker, typed in the title.
  - I left with Discard every time and never clicked Save or Back after a change.
  - Afterwards the three seeded charts still read "Orders with axis settings" (Bar), "Orders by category and status" (Bar) and "Untitled chart" (Auto).

**Summary**
- **Earlier findings (26):**
  - 14 FIXED;
  - 6 PARTLY FIXED;
  - 2 STILL OPEN;
  - 4 NOT RE-CHECKED, because they need Save, New › Chart, or a surface other than the editor.
- **New findings (15):** 2 major, 13 minor.
  - (a) breaks AC-187: 6 (#1, #3, #4, #5, #6, #7).
  - (b) breaks another AC: 1 (#9, AC-220).
  - (c) breaks a numbered rule: 2 (#1 rule 17, #2 rule 31).
  - (d) none of these: 7.
- **AC-187 verdict: does not conform.**
  - Header, field list, wells, picker, Sort/Top N, preview tile and the Actual size/Fit `.seg` all match, in both themes.
  - These fail:
    - the Customize controls;
    - the gallery controls;
    - "Why this chart?";
    - the chart type card;
    - the title field's hover and focus;
    - hover on the inspector and drawer tabs.
- **Checked and passing:**
  - Rule 1: no text under 12 px, in the Data tab, the trace or Customize.
  - The dark theme follows the §5 tokens. All panes, pills, chips and picker measured.
  - AC-215: search "amo" leaves Total Amount and Average Amount; clicking Total Amount adds it.
  - AC-216: the time pill has a grain select, Hour…Year.
  - AC-217: gallery searchable, grouped by purpose, needs stated, types it can't draw tinted and saying what is missing.
  - AC-218: combo and 240-slice pie each warn, with a "Use …" button.
  - AC-219: legend position, data labels and include zero are all present.
  - AC-221: a 6-slice pie has 6 legend entries, paged 1/2.

## 1. Earlier findings

Sources: 2026-09-24-chart-editor.md (F1–F19), 2026-09-24-recheck-chart-editor.md (N1–N6), and the Superset-parity gap.

| # | Status | Measured evidence |
|---|---|---|
| F1 Library chart page stub | NOT RE-CHECKED | Outside this surface. Fixed in the 2026-09-24 re-check. |
| F2 New chart never opens editor | NOT RE-CHECKED | New › Chart writes a document. |
| F3 Scrolling document, not 3 panes | **FIXED** | `.chart-editor` grid is `280px 800px 360px` at 1440 and `280px 640px 360px` at 1280, the prototype's. Header is one 49 px row. Preview tile top at y 165 (prototype 133). Drawer at y 680–900. |
| F4 Header lacks title, badges, note | **PARTLY FIXED** | Title, ↶ ↷, back and note are fixed (table §4). Still open: there are no `.badge`s in the header. The prototype has "Raw query" / "✓ Pre-aggregation" and "75 rows · 18 ms": 22 px, radius 999, `bg-subtle`, 12/400. The app has `.chart-editor__meta` "Orders · 3 rows" as plain 12/16 `text-secondary` text with no ms. The cache state is a "● Live" `.badge` in the canvas row at y 122. |
| F5 Fields by role, no search/types/click | **PARTLY FIXED** | Fixed: search `.input.sm` 28/12, cube head 28 px 12/600, `.field-row` 28 px, padding 0 12 0 22, 12 px, 18 px role chips, 6 px accent "used" dot, meta in `text-muted`. Still open: no pane head. The prototype has `.pane-head` 44 px with h2 "View: sales" 14/600 and puts the source select in the Data tab. The app puts "Cube or view" and `#cube-picker` at the top of the field pane. The MEASURES/DIMENSIONS `h4`s are a recorded deviation (AC-025). |
| F6 Wells | **FIXED** | `.well` is 38 px, 1px dashed #c9c7c1, radius 6, padding 6. Label is 12/16/600 `text-secondary`. "+ metric" `.addbtn` is 24 px. Picker is 240 px. Pills are 24 px, radius 4, 12/600. There are a Filters well and a Top N field. Time pill has `select.pill__grain` (Hour…Year). |
| F7 Reco shows ids / generic reasons | **PARTLY FIXED** | Card names are human ("Bar", "Combo (bar + line)"). Still open, in three parts. (1) No quick-pick buttons: the prototype has `.btn.sm` 34×24 icons under "Suggested for these fields". (2) An unstyled `[data-testid=recommendation]` block sits under Top N: `p` 14/20/400 "Recommended: Bar", `h4` "Or", and a bulleted `li` list at 14 px. It has no prototype counterpart; the prototype shows a `.pinned` banner (12 px, `bg-subtle`, radius 6, padding 6 8, with [Use]) only when the pinned type differs from the recommendation. (3) Reasons are still fixed per type: a pie over 240 IDs reads "Recommended: Bar, horizontal / Long category names read better across than down.", with no count. Class (d); rule 9 passes. |
| F8 No gallery | **FIXED** (structure) | `.type-gallery` is 920×600, with search, 9 purpose shelves, 18 cards, a "Needs …" line, a Suggested badge and "Use Auto". Its styling is new finding #3. |
| F9 No pinned state | **FIXED** | "Chosen manually · Change…" shows, and "Back to recommended" only while pinned. The prototype shows `.btn.sm` "Auto" in the same state. |
| F10 Combo: no warning | **PARTLY FIXED** | The warning is fixed: `[data-testid=type-warning]` reads "Two value axes let the chart imply a relationship…" with "Use Bar" (AC-218). **Still open, major: the combo still draws one value axis.** With Count and Total Amount by category × status (seed-chart-status), the axis ticks only 0–40, the legend is "shipped, completed, processing", and Total Amount is not drawn. With Count and Total Amount by status (seed-chart-axes), there is one left axis from 5 to 80,000 and the Count bars sit flat on the baseline (screenshots). Class (b), arguably AC-037 ("a listed type cannot be produced from a valid spec"): a two-measure combo drops a measure, or has no second axis. |
| F11 Over-capacity pinned type, no warning | **FIXED** | Pie over ID, 240 rows: "A pie is readable up to 6 slices; this has 240." with "Use Bar, horizontal". |
| F12 Pie legend omits slices | **FIXED** | Category × status pie: 6 slices and 6 legend entries, "Components · shipped" … (paged 1/2). |
| F13 Legend/headers show ids | **FIXED** | Combo legend reads "Orders Count", "Orders Total Amount". Results and Underlying rows `th` read "Orders Status", "Orders Count". The trace field table uses titles. The one leftover is new finding #9. |
| F14 Debug JSON above preview | **FIXED** | `.chart-editor__canvas` holds only `.result-source` and the tile. |
| F15 Customize: unstyled fieldsets, no legend/series/values | **PARTLY FIXED** | Legend, Series, Values and Include zero exist (AC-219). `fieldset.axis-panel` is now 1px #e3e2de, radius 6; it was a UA 2 px groove. Its controls are still 32/14, which is new finding #1. |
| F16 "Why" raw dump buries the preview | **PARTLY FIXED** | The preview no longer moves: tile top stays at 165 with the trace open, which scrolls `.chart-editor__inspector-body` (scrollHeight 1,582 in 766 px). Still a raw dump: `[data-testid=why-this-chart]` is 906 px tall. It holds a Fields table with `th` at 14/700 (§3 allows only 400 and 600), then 5 candidates × 7 rule ids ("✓ no_encodings passed", "✓ pie_single_measure passed"). The prototype has 5 `.check` lines at 12/16 with status icons. Class (d); rule 29 passes. |
| F17 Pressed + hover "Actual size" 1.16:1 | **FIXED** | Under the pointer the pressed button keeps #e3f0f4 background and #1f6f86 text, 12/600. |
| F18 Empty state one plain sentence | **FIXED** | seed-chart-empty: tile 768×771 with "Add at least one metric or dimension" at 16/22/600 and the hint at 12/16 `text-secondary`, matching the prototype's 16/20/600 and 12/16. Other states are new findings #8 and #10. |
| F19 Offline never errors | **STILL OPEN** | After `context.setOffline(true)` and clicking Total Amount, 20 s later the canvas still says "Loading chart" (skeleton), with no Retry, and the drawer says "No rows.". Class (d): AC-042's Fails-when needs a failure, and the load never fails. |
| N1 Typed title lost on Save | NOT RE-CHECKED | Needs Save. While the title is still being typed, Back's title already reads "Saves the change, then opens the chart", so the editor sees the typed title. |
| N2 No way back | **FIXED** | `[data-testid=editor-back]` `.btn.sm` 24 px: "← Back to chart", or "← Back to Company dashboard 01" from a tile. Note: "Shared chart · not on a dashboard yet". |
| N3 Preview not in a tile | **FIXED** | `[data-testid=preview-frame]`: 1px #e3e2de, radius 6, padding 16, #fff. In dark: 1px rgba(255,255,255,.1), #1c1c1b. |
| N4 Drawer closed to a button | **FIXED** | `.results-drawer` 220 px, tabs 36 px 12/600, open by default. Collapses to 38 px (prototype `.drawer.closed` 36). The empty editor has no drawer (#10). |
| N5 Two names for one member | **STILL OPEN** | The list says "Count", the pill "Orders Count". T257 held this for the user's reading of AC-220. |
| N6 New › Chart writes before Save | NOT RE-CHECKED | Would write a document. |
| Superset gap: page scrolls when a low inspector control takes focus | **FIXED** | Customize tab, focus on the last control: `window.scrollY` 0, header top 48, tile top 165. Only `.chart-editor__inspector-body` scrolled: 501 at 1440×900, 601 at 1280×800. The dashboard overlay at 1280×800 behaves the same (inspector 701, header 48). |

## 2. New findings

**1. The Customize tab's controls are full-size form fields, not the inspector's compact controls.** Major.
- `#axis-x-title`, `#axis-x-min` and `#axis-x-max` are 32 px at 14/400. `#axis-x-rotation` and `#axis-x-format` are selects at 32 px, 14 px.
- Log scale, Gridlines, Include zero, Show the legend and Data labels are native 13×13 checkboxes. Their labels (`.customize-tab__check`) are 13 px, which is off the §3 scale; §7d allows 13 px only on filter pills and page tabs.
- The prototype uses:
  - `.input.sm` and `.select.sm`, 28 px at 12 px;
  - `.switch` 32×18, radius 999, `border-strong`, or `accent` when on;
  - label rotation as a `.seg` (28 px buttons).
- Result: the Axes section is 849 px tall against the prototype's AXES at 367 px, and the tab's content is 1,186 px inside a 766 px pane.
- **Class:** (a) AC-187, inputs: height 32 vs 28 and font 14 vs 12, and checkbox vs switch. (c) Rule 17 (inspector rows 28 px) and §7d.

**2. Clicking a mark in the editor's preview does nothing except show a tooltip.** Major.
- A left-click on a bar showed only the tooltip "completed / Orders Count: 80". A right-click opened no menu.
- The prototype's editor says "click a mark to drill or filter" and opens Drill into, Keep only, Exclude and View underlying rows.
- **Class:** (c) rule 31.

**3. The chart-type gallery's controls use default sizes.** Minor.
- Search: 32 px, 14 px (`.input.sm` is 28, 12).
- Close and Use Auto: 32 px, padding 0 12, radius 4 (`.btn.sm` is 24, 0 8, radius 6).
- Purpose buttons: padding 4 8, 14/400, radius 4 (`.file` is 0 12 0 24, 12 px, radius 0).
- Cards: name 14/600 against 13/600, and no 28 px type icon.
- Also:
  - "Suggested" badge 18 px, 12/400, padding 0 6 (`.badge.accent` 22 px, 12/600, 0 8);
  - the "Needs" line in `text-secondary` (prototype `text-muted`);
  - dialog radius 6 with no shadow (prototype radius 8, `shadow-pop`);
  - h2 20/700 (prototype 16/700).
- **Class:** (a) AC-187, buttons and inputs. The badge, dialog and heading are (d).

**4. "Why this chart?" is a default button.** Minor.
- App `.why-chart button`: 32 px, padding 0 12, 1px #c9c7c1, 14/400, #fff background.
- Prototype `.btn.ghost.sm`: 24 px, padding 0 8, 1px transparent, 12/400, no background.
- **Class:** (a) buttons: height, padding, border colour, font size, background.

**5. The chart type card lacks the prototype's icon and density.** Minor.
- App `.type-card-field__change`: padding 8 10, name 14/600, one column, 56 px tall.
- Prototype `.reco-row`: padding 8, `.reco-name` 12/600, a 28×28 `.ico` on `bg-subtle` radius 6, 70 px tall.
- Border (1px `border-subtle`) and radius (6) match.
- **Class:** (a) buttons: padding and font size. The missing quick picks are (d), under F7.

**6. The title field draws a border when hovered or focused.** Minor.
- App `.chart-editor__title` on hover or focus: border #c9c7c1, background #fff, 2 px accent outline.
- Prototype `[data-title]`: border and background stay transparent on hover and focus, with only the 2 px accent outline. At rest the two match.
- **Class:** (a) inputs: border colour token on hover and focus.

**7. The inspector and drawer tabs take a hover background.** Minor.
- App: an unselected tab under the pointer has background #efeeea (`bg-hover`).
- Prototype: `.tabs button` has background none in every state; its hover measured transparent.
- **Class:** (a) buttons: colour token on hover.

**8. The preview loses its tile while loading and when the type cannot be drawn.** Minor.
- **Loading** (the load request delayed 6 s):
  - the tile is replaced by `[data-testid=result-loading]`, a borderless 768×320 skeleton at y 113;
  - the Live and rollup row disappears, so the frame jumps from 165 → 113 → 165;
  - the drawer body says "No rows." at 14/400 with 0 padding (x 280), while the query is still running.
- **Cannot be drawn** (Combo with one measure): there is no `[data-testid=preview-frame]`, and `.chart-editor__missing` is 14 px text on the bare canvas.
- The prototype keeps `.tile` and centres its "needs" line inside it.
- **Class:** (d). AC-042 passes, since the skeleton is chart-shaped.

**9. The Acceleration tab prints internal names.** Minor.
- It reads "Stopped by orders.count: orders has no pre-aggregations."
- **Class:** (b) AC-220's SHALL ("wherever a person reads it … never by its internal name"); its Fails-when list does not name this tab.

**10. The empty editor has no drawer and no Data-tab warning.** Minor.
- seed-chart-empty: `.results-drawer` is absent, and the tile runs from y 113 to 884.
- The prototype keeps the 220 px drawer with its tabs, and shows a `.warnbar` in the Data tab ("Add at least one metric or dimension", 12 px, 16 % warn tint).
- **Class:** (d). AC-214's SHALL names the drawer, but its Fails-when does not cover a missing one.

**11. Ownership is shown as an outlined chip, and the note uses the wrong colour.** Minor.
- The dashboard path shows "Local · only on this dashboard", and a local chart opened on its own shows "Local to a dashboard". Both are `span.badge`: 20 px, 1px #c9c7c1, radius 999, 12/600, transparent.
- The prototype uses a plain `xs muted` note, "Only on this dashboard" (12/16 `text-muted`); its own `.badge` is 22 px on `bg-subtle` at 400.
- The library note "Shared chart · not on a dashboard yet" is `text-secondary` #5c5b57; the prototype's is `text-muted`.
- **Class:** (d).

**12. Discard and Undo stay disabled while a title is being typed.** Minor.
- After typing " X" with focus still in the field: `discard.disabled` and `undo.disabled` are both true, while Back's title already says "Saves the change…".
- After a blur both enable, and Discard restores the title.
- **Class:** (d). AC-035's Fails-when is not met.

**13. A dashboard-local chart opened on its own can be edited but not saved.** Minor.
- `/explore/charts/seed-chart-status/edit`: no save button. The right end of the header reads "This chart belongs to a dashboard; edit and save it there." (`span.chart-page__none`).
- The wells, type and Customize stay fully editable, and Back reads "← Back to dashboard".
- **Class:** (d). AC-214's SHALL lists "the save action".

**14. The type warning is not the prototype's `.warnbar`.** Minor.
- App `.type-card-field__warning`: 14 % warn tint (rgb 254/244/223), padding 8, gap 6.
- Prototype: 16 % tint (rgb 254/243/218), padding 8 12, gap 8.
- The combo warning's icon wraps onto its own line (icon y 273, text y 293); the pie warning's icon stays inline.
- **Class:** (d).

**15. Canvas and Data-tab layout details.** Minor.
- The canvas pads 16; the prototype's `.canvas-wrap` pads 12.
- The prototype's 16 px "Showing Bar (auto) · click a mark to drill or filter" row (12/16 muted) is replaced by the 32 px Live chip and rollup-warning row. So the tile is 768×499 at y 165, against 776×535 at y 133.
- "Table view" sits 62 px in from the tile's right edge (`.tile-head` padding-right 62).
- "Actual size" drops the prototype's "(3/12)" and sits at the left; the prototype's `.seg` is right-aligned.
- The Data tab is one grid with 12 px gaps. The prototype splits it into `.section`s, each padded 12 with a 1px `border-subtle` rule.
- **Class:** (d).

## 3. AC-187 conformance: buttons, inputs and tile on this surface

- **Values:** light, 1440×900. The dark values differ only by §5 tokens: borders rgba(255,255,255,.2) and .1, surface #1c1c1b.
- **Prototype rule:** where the prototype has no rule for a state, its value is taken as none.

| Component | Property | App | Prototype | Conforms |
|---|---|---|---|---|
| Back `.btn.sm` | height / padding / border / radius / font / colours | 24 / 0 8 / 1px #c9c7c1 / 6 / 12/400 / #1f1f1e on #fff | same | yes |
| Discard `.btn.sm` | same set | 24 / 0 8 / 1px #c9c7c1 / 6 / 12/400 | same | yes |
| Save chart, Save dashboard `.btn.primary.sm` | height / padding / border / radius / font / colours | 24 / 0 8 / 1px #1f6f86 / 6 / 12/600 / #fff on #1f6f86 | same | yes |
| Undo, Redo `.iconbtn` | size / border / radius / font / colour / disabled | 32×32 / 1px transparent / 6 / 14/400 / #5c5b57 / opacity .4 | same (UA padding 1 6; the rule sets none) | yes |
| Title input | height / padding / border / radius / font / background, at rest | 32 / 0 8 / 1px transparent / 4 / 15/600 / transparent | same | yes |
| Title input | border and background on hover/focus | #c9c7c1 / #fff | transparent / transparent | **no** |
| Field search `.input.sm` | height / padding / border / radius / font | 28 / 0 8 / 1px #c9c7c1 / 4 / 12 | same | yes |
| Cube or view `.select.sm` | height / padding / border / radius / font | 28 / 0 4 0 8 / 1px / 4 / 12 | same | yes |
| Field row `.frow` (button) | height / padding / radius / font | 28 / 0 12 0 22 / 4 / 12/400 | same | yes |
| Picker items | height / padding / radius / font | 28 / 0 6 / 4 / 12 | same | yes |
| `.addbtn` "+ metric" | height / padding / border / radius / font / colour | 24 / 0 6 / none / 4 / 12/400 / `text-muted` | same | yes |
| Pill × | size / radius | 18×18 / 3 | same | yes |
| Sort by `.select.sm`, Top N `.input.sm` | height / padding / border / radius / font | 28 / 0 4 0 8 and 0 8 / 1px / 4 / 12 | same | yes |
| Chart type card (`.reco-row` button) | padding / name font / border / radius | 8 10 / 14/600 / 1px #e3e2de / 6 | 8 / 12/600 / same / same | **no** |
| Back to recommended (`.btn.sm`; prototype "Auto") | height / padding / radius / font | 24 / 0 8 / 6 / 12/400 | same | yes |
| Warning "Use Bar" `.btn.sm` | height / padding / radius / font | 24 / 0 8 / 6 / 12/400 | same | yes |
| "Why this chart?" (`.btn.ghost.sm`) | height / padding / border / font / background | 32 / 0 12 / 1px #c9c7c1 / 14 / #fff | 24 / 0 8 / transparent / 12 / none | **no** |
| Inspector and drawer tabs `.tabs button` | height / padding / font / colours at rest and selected | 36 / 0 10 / 12/600 / #5c5b57; #1f6f86 + 2px | same | yes |
| Inspector and drawer tabs | background on hover | #efeeea | none | **no** |
| Actual size / Fit `.seg` | box / buttons / pressed / pressed + hover | 30, 1px #c9c7c1, radius 4 / 28, 0 10, 12 / #e3f0f4, #1f6f86, 600 / unchanged | same | yes |
| Table view `.btn.ghost.sm` | height / padding / border / radius / font | 24 / 0 8 / transparent / 6 / 12 | same | yes |
| Drawer toggle (icon-button) | size | 28×28 | no counterpart; `.iconbtn` 32×32 | no* |
| Customize text inputs | height / font | 32 / 14 | `.input.sm` 28 / 12 | **no** |
| Customize rotation, axis format selects | height / font | 32 / 14 | `.select.sm` 28 / 12 (rotation is `.seg`) | **no** |
| Customize toggles | component / size | native checkbox 13×13 | `.switch` 32×18, radius 999 | **no** |
| Legend position, values format `.select.sm` | height / font | 28 / 12 | same | yes |
| Series colour | height | 32 (native colour input) | `.select.sm` 28 | **no** |
| Gallery search | height / font | 32 / 14 | `.input.sm` 28 / 12 | **no** |
| Gallery Close, Use Auto | height / padding / radius | 32 / 0 12 / 4 | `.btn.sm` 24 / 0 8 / 6 | **no** |
| Gallery purpose buttons | padding / font / radius | 4 8 / 14 / 4 | `.file` 0 12 0 24 / 12 / 0 | **no** |
| Gallery type cards (buttons) | padding / border / radius / name font | 12 / 1px #e3e2de / 6 / 14/600 | 12 / same / 6 / 13/600 | **no** |
| Preview tile `.tile`, drawn | background / border / radius / padding | #fff / 1px #e3e2de / 6 / 16 | same | yes |
| Preview tile, while loading or when it cannot be drawn | presence | not drawn | tile kept | **no** (#8) |
| Empty-state tile | background / border / radius / padding / text | #fff / 1px #e3e2de / 6 / 16 / 16/600 and 12/16 | same | yes |

\* The prototype has no drawer toggle, so this row compares against the nearest rule.

**Verdict:** AC-187 fails on this surface. The failing rows are:
- the Customize controls;
- the gallery controls;
- "Why this chart?";
- the chart type card;
- the title field on hover and focus;
- hover on the inspector and drawer tabs;
- the tile missing while loading or when the chart cannot be drawn.

Everything else measured on the header, field list, wells, picker, preview tile and `.seg` matches the prototype in both themes.
