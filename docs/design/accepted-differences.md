# Accepted small visual differences (R77)

The user accepted these on 2026-10-08 (R77): "Accept small visual differences". Each entry is a difference between the app and its approved design that was recorded, not fixed.

A difference counts as small only when all of these hold:
- it is at most 4 px in a size, spacing or position;
- any colour stays within the same token role;
- it changes no structure, control, wording, state or behaviour the design draws;
- it breaks no hard rule: the 12 px floor, WCAG AA contrast, the 400/600 weights, or no horizontal scroll at 390 px.

Anything larger is fixed, or goes to the user.

This list is the recorded decision that the escape clause of AC-343, AC-344 and AC-352 asks for, and that AC-187 accepts (R77).

| Surface | Design and state | What the design draws | What the app does | Difference | Task |
| --- | --- | --- | --- | --- | --- |
| Dashboard tile | 2026-09-24 design 04, pins 5–6 (R76 dashboard-Q1) | End-point labels on every chart of 4 or fewer series | Direct labels on line, area and bar charts only; combo, scatter-by-colour and box plot name their series by the legend alone | Recorded as the coordinator's call (overturnable), not a small difference: ECharts' end labels are researched for line, area and bar only (`docs/research/echarts-end-labels.md`), and the legend keeps rule 5 for the others | T681 follow-up |
| Dashboard tile | 2026-09-24 design 04, pins 5–6 | A series' name at its end, whole | A name past 120 px is cut short with "…" | wechart's figure, not the design's: a third of the 360 px a half-width tile draws in, so a long name never takes the plot's room. The legend still names it whole. The coordinator's call | T681 follow-up |
| Tile ⋯ menu | 2026-09-24 design 08, main screen | "Ctrl+M" on Filter to marked and "Ctrl+Shift+M" on Filter out marked | No hint on either; Unmark's "Esc" is drawn | Not a small difference: binding the keys is new keyboard work, held under R75 for the user's approval, and a hint for an unbound key would promise what doesn't happen. The user made it a phase 3 TODO: `docs/phase-2/backlog.md` §7 | T682 |
| Tile ⋯ menu | 2026-09-24 design 08, main screen | Icons on the rows design 08 lists | Mark range…, Mark series › and Mark panel › (R63, R66; rows design 08 doesn't draw) have icons of wechart's own, in the same style | Rows the design doesn't draw, given icons so every row reads alike | T682 |
| Tile ⋯ menu | 2026-09-24 design 08, main screen | One divider above Data as of | While the actions scroll, they pass under the pinned Data as of with no divider of its own above it | None in the resting state; drawn only while scrolled, a state design 08 doesn't draw | T682 |
| Edit sidebar, Add tab | Prototype `.section` (CMP-09) | Palette rows 8 px apart; template rows 50 px tall | Palette rows 4 px apart; template rows 52 px | 4 px and 2 px | T683 |
| Dashboard header | Prototype `.btn.ghost.sm` (CMP-10) | "← Explore" with a 1 px transparent border | "← Explore" with border 0 | 1 px | T683 |
| Dashboard page tabs | Prototype `.dash-tabs button` (CMP-10) | "+ Page tab" with border 0 and a 2 px bottom border | "+ Page tab" with a transparent border all round | 1 px, nothing drawn in it | T683 |
| Dashboard header | Prototype `span.muted` crumb (CMP-10) | The folder crumb as a plain muted span | The folder crumb stays a link to its folder | Not a small difference. Decided in `decisions-2026-10-08.md`, "Later decisions": CMP-10 folder crumb (AC-195 requires the crumb to navigate; the spec wins over the drawing) | T683 |
| Filter pill | Prototype `.fw select` (CMP-11) | The value control with padding 0 and radius 0 | `button.filter-pill__summary` with padding 0 2 px and the button radius | 2 px of padding. The radius draws nothing, because the control has no border or ground; only its focus ring follows it. The coordinator's call | T683 |
| KPI tile | 2026-09-24 design 04 pin 3 (R76 dashboard-Q3) | The value as `text-kpi`, 32/40, 4 px under the tile's head | On a dashboard tile, the value at 32 px on a 36 px line, with no gap under the head | 4 px and 4 px: padded 16 now and with its label on a 20 px line, a KPI tile at its saved height keeps its value and badge inside it | T683 |
| Link tile | Prototype `.btn` (CMP-13) | A link styled as a button at radius 6 | Radius 4 | 2 px | T683 |
| Settings › Interactions | 2026-09-24 design 05, pin 5 | The cross-filtering card's gestures: "Click filters · Ctrl/⌘ adds · Esc clears" | "Click filters · Esc clears" | Not a small difference. A tile holds one cross-filter selection, and a click replaces it (AC-117), so a "Ctrl/⌘ adds" keycap would promise what doesn't happen. Design 05 note 5 also asks for "the same strings as the filter band's hint", and that hint names no modifier ("Click a bar, slice or panel to cross-filter"). Lane B's call, reported to the coordinator | T685 |
| Settings › Interactions | 2026-09-24 design 05, pin 3 | A card's description at 13/19 | 14/20 (`text-sm`) | 1 px, to the type scale (R76 principle 2) | T685 |
| Settings › Interactions | 2026-09-24 design 05, pins 3–4 | A drawn 18 px radio | The native radio at 18 × 18 in the accent (`accent-color`) | None in size; the browser draws the ring | T685 |
| Settings bar | 2026-09-24 design 05, pin 1 | "· 1 unsaved change" in words alone | The same words with the idle state icon after the "·" | An icon the design doesn't draw, kept because AC-177 pairs every state with an icon | T685 |
| Settings over a workspace dashboard | 2026-09-27 design 04, pin 2 (DSH-06) | The workspace band over every page in the workspace | Settings opens 32 px down, under the band | None while the band is one line; at a width where its words would wrap, the band's second line would sit under Settings' bar | T685 |
