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
