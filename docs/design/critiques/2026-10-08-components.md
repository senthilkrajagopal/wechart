# Component styles critique (2026-10-08, T406)

**What this covers.** AC-187 names these components: the app bar, workspace navigation, buttons and inputs, the dashboard header and page tabs, the filter bar, tiles, and the edit sidebar.

**What it was judged against.**
- The prototype, `docs/design/prototype/index.html` and its `.js` files.
- The later approved designs, which win where they draw a component differently (R37).
- direction.md §3–5 and §7d.
- T476's per-surface size calls, Q1–Q5.

**How it was measured.** Captures of the running app, light theme, at 1,440, 1,024 and 390 px. Where a parallel critique raised a difference first, it is cited rather than repeated (DSH-, EDI-, MOD-).

**Not captured:** the dark theme; filter pills, since the seed dashboard has none; the sidebar's Outline and Properties tabs; KPI, link, image and tab-group tiles; a marked tile; the Reviews count; hover and focus.

**Summary.** 13 findings (1 major, 11 minor, 1 polish) and 5 questions for the user.

AC-187 is not met. Most of the prototype's core rules now measure equal (see "Measured and passing"). What remains:
- one button rule, used everywhere (CMP-01);
- pressed states;
- design 09's app bar;
- open residuals from backlog §1.

## Findings

| # | Sev. | Component | Design | App | Covered? |
|---|---|---|---|---|---|
| CMP-01 | minor | A `button.btn`, the secondary button (every surface) | Prototype `.btn` (index.html:551–561), designs 03 and 13: 32 tall, padding 0 12, 14/400, radius 6, 1 px border-strong | Draws at the browser's size, 24 tall with padding 1 6. Examples: "Discard my copy…", "Discard changes" beside a 32 px Save, "Generate cubes…", Export's Cancel. `styles.ts` sizes only `button:not([class])` and `a.btn`; about 25 call sites use `className="btn"`. | no |
| CMP-02 | minor | The data source page's head | Design 06 pin 1 and design 13: every header action 32 px | History `btn-sm` 24 at 12 px; "Generate cubes…" 24 (CMP-01); "Edit in my workspace" 32; ⋯ 30 × 24 | DSH-05 is the same rule on the dashboard header |
| CMP-03 | minor | Pressed states | `.btn.pressed`: accent-soft ground, accent border and ink, weight 600 (06:68, 07:69) | History with its panel open: accent ink and border on white, 400. `.seg[aria-pressed]` uses `color-mix(accent 12%)`. `.dashboard__more.is-pressed` and `.model-picker__chip` use accent-soft. That makes three pressed looks. | `.seg` is in backlog §1 (and EDI-14); History is not covered |
| CMP-04 | **major** | The Reviews count pill (app bar) | Design 09 `.count`: min-width 18, height 18, padding 0 5, radius 999, 600 12/18 | Not captured. Source `styles.ts:273–283`: **11 px**, radius 9, weight inherited. Below the 12 px floor (rule 1, AC-004) wherever it shows. | no |
| CMP-05 | minor | The Reviews control's label and current state | `.reviews` at the body's 14/400, text-secondary (designs 03–10, 13–16); `.reviews.on` accent-soft, accent, 600 (05:65) | 12/600 everywhere; on the Reviews page, accent ink on transparent | no |
| CMP-06 | minor | The single-user chip | Design 09 state B `.chipwarn`: 28 px, padding 0 10, gap 6, 12/600 status-warning, border-strong, radius 999; unlock icon, label and ▾; replaces the account button | 32 tall, padding 0 8, no ▾. The "AD" avatar still shows beside it. The colour, 12/600 and the radius match. | status.md row 09 lists the replacement, with no task; height, padding and ▾ are not covered |
| CMP-07 | minor | The app bar at 1,024 and 390 | Design 09 `.iconbtn { flex: none }` 32 × 32; `.search` 260; state H's order below 1,024: brand, menu, spacer, Reviews, theme, avatar | At 1,024: "Data sources" wraps to two lines; the search shrinks to 197; theme 24 × 32; the chip's label wraps. At 390: theme 27 × 32; the menu button sits after Reviews. `.icon-button` has no `flex: none`. | AC-304 covers fitting the bar; nothing covers its order or the 1,024–1,279 band (Q4). Backlog §6 calls the narrow bar undesigned, but design 09 state H draws it. |
| CMP-08 | minor | Security's preview fields | T476 Q1: 28/12 in Security's preview (09-27 08); the prototype's `textarea.input` line is 18 | "Find a dashboard" 32/14; the context textarea 12 px code on a 20 px line | The textarea's line is in backlog §1; the input is not covered |
| CMP-09 | minor | The edit sidebar's Add tab | Prototype `.section` gap 8; template rows 50 px | Palette rows 4 px apart; template rows 52. The add slot is fixed at 56. | backlog §1 (N9) |
| CMP-10 | polish | The dashboard header and page tabs | Prototype `.btn.ghost.sm` has a 1 px transparent border; `.dash-tabs button` has border 0 and a 2 px bottom; the folder crumb is a plain `span.muted` | "← Explore" has border 0; the folder crumb is a 20 px link; "+ Page tab" has a transparent border all round | backlog §1 (N12) |
| CMP-11 | minor | The filter pill's value (source only) | Prototype `.fw select`: no border or ground, height 28, 600, padding 0, radius 0 | `button.filter-pill__summary` has padding 0 2, radius 6, and a muted "▾". The pill and the scope tag match. | backlog §1 |
| CMP-12 | minor | Chart legends and bars | Prototype `chrome()`: legend left, `roundRect` 10 × 10, itemGap 8; `barMaxWidth: 36`; bar ends rounded 4 | Swatches 25 × 14; the legend centred; bars 71 wide | backlog §1 |
| CMP-13 | minor | Link and image tiles (source only) | No padding, border or ground (dashboard.js:322, 329; direction §2 "no tile chrome"); a link styled as a button is `.btn` r6, 600 as primary; a text link is `.linklike` 600 | No rule drops `.grid-tile`'s chrome for them; `.link-tile--button` and `--primary` have radius 4 and no weight; `--text` has no 600 | backlog §1 (N3, N4) |

## Measured and passing

**App bar**
- 48 tall, padding 0 12, gap 16, white, with a border-subtle rule.
- Mark 22 × 22. Search 260 × 32 at 13 px. Theme toggle 32 × 32. Avatar 28 × 28, 12/600.

**Workspace navigation**
- Items 47 tall, padding 0 12, 14 px, 2 px apart.
- The current item is 600 primary with a 2 px accent rule; the others are 400 secondary.

**Buttons**
- `.btn-primary`: 32, 0 12, radius 6, 14/600, white on the accent.
- Bookmarks is the `.btn` box.
- Every `btn-sm` is 24, 0 8, 12 px.
- Icon buttons are 32 × 32 with a transparent border.
- The edit bar's Discard and Save match dashboard.js.

**Inputs, per T476's calls**
- At 28/12: the inspector, Customize, Explore's search, the Model form, the gallery's search.
- At 32: the wizard's code fields (32/12 mono), the export file name, New cube.
- Switches are 32 × 18.

**Dashboard header and page tabs**
- Header: padding 12 24 0, h1 24/32/600, ownership line 12/16 secondary.
- Tab row: 45 px, padding 8 top and 24 left, with a rule.
- Tabs: 36 px, padding 0 12, 13/600; the selected tab primary with a 2 px accent rule.

**Filter bar**
- Band 53 px, padding 10 24, on bg-page, with a rule.
- Hint 12/16 muted.

**Tiles**
- Padding 16, 1 px border-subtle, radius 6, no shadow.
- Head 22, title 14/20/600.
- Badge 22, radius 999, 12 px, bg-subtle.
- Grid of 12 columns with 16 px gutters (688 + 16 + 688).

**Edit sidebar**
- Width 300, tabs 36 at 12/600, sections padding 12 with gap 8 and a rule.
- Palette rows 50 tall, padding 6 8, border-subtle, radius 6. The chip is 24 in its role tint.

**Rules**
- Rule 1 holds for every measured text. The uncaptured Reviews count is CMP-04.
- Rule 17 holds: 32, 28 and 24.
- Rule 16 holds.

**Fixed since 2026-09-25:** the add slot (56); Customize at 28/12 with switches; "Why this chart?" as `btn-ghost btn-sm`.

## Questions for the user

1. **The ⋯ in list and admin heads.** An item's head is settled (T406's review): designs 13, 14 (391, the chart page) and 15 (424, a data source) all draw a 32 px `.iconbtn` ⋯ there, so the data source page's 30 × 24 ⋯ is a finding (CMP-02). No design draws the Data sources list's head ⋯ (30 × 24), which holds Cube Store's switch (design 15 P5).
   - (a) 32 px, as on item heads.
   - (b) 24 px in list and admin heads.
2. **The filter pill's label weight.** Design 04 draws "Status: **all**", with the label at 400 and the value at 600. The prototype and the app draw the whole of it at 600. T476's Q3 cites both.
   - (a) Label 400, value 600.
   - (b) All at 600, as built.
3. **The chart title field at 15/600.** Design 01 draws `.title-in` at 15 px, and the app matches. direction §3 has no 15 px step, and §7d records only the 13 px exceptions.
   - (a) Record 15 px in §7d.
   - (b) Use text-md, 16/600.
4. **The app bar from 1,024 to 1,279 px.** Design 09 hides only the account's name below 1,280. Even with the chip in the avatar's place, the bar is about 66 px wider than 1,024.
   - (a) Below 1,280, the chip shows its icon only.
   - (b) Below 1,280, the search narrows to an icon.
   - (c) Below 1,280, Reviews drops its label.
5. **11 px in designs against the 12 px floor.** direction §3 and rule 1 forbid text under 12 px, yet 12 designs draw 11 px somewhere (design 03's tree tag, which the app mirrors in `.cube-picker__chip`; design 09). The app has 11 px in eight places (`styles.ts` 279, 2604, 2730, 2807, 2919, 3252, 4529, 7740).
   - (a) The floor wins, and every 11 px goes to 12.
   - (b) Record the designs' 11 px glyph chips in §7d as an exception, with their contrast audited.

## Suggested grouping

| Group | Findings | ACs |
|---|---|---|
| One button rule, and one control height in item heads | CMP-01, CMP-02 (with DSH-05) | AC-187 |
| One pressed state, the designs' `.btn.pressed` | CMP-03 (with EDI-14) | AC-187 |
| The app bar as design 09 draws it | CMP-04, CMP-05, CMP-06, CMP-07; Q4 | AC-187, AC-004, AC-287, AC-254, AC-304 |
| T476's remaining surfaces | CMP-08 (with DSH-09) | AC-187 |
| Backlog §1 residuals | CMP-09 to CMP-13; Q2 | AC-187 |
| The type floor | Q5, Q3 | AC-004, AC-187 |
