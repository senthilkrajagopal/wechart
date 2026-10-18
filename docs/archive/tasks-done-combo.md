# Finished tasks' notes: P2.26, combo charts (lane COMBO)

Lane COMBO's ticked tasks from `docs/tasks.md` §P2.26 (F44), their sub-lines word for word, kept apart from `tasks-done.md` while the lanes run in parallel. Each task keeps its one line in `docs/tasks.md`.

- [x] T845 [P] (AC-497, AC-498, AC-037) Carry each combo series' mark and axis in the chart spec, and resolve Auto: the first measure as bars, the rest as lines, all on the left
  - Files: `packages/core/src/combo.ts` (+ test), `packages/core/src/render-spec.ts` (the sparse `options.series` and `options.combo` shapes), `packages/core/src/chart-spec.ts`, `packages/core/src/index.ts`.
  - Failing test: `combo.test.ts`: a combo of Revenue, Target and Margin % with no settings resolves to bar/left, line/left, line/left; with Margin % set to point/right it resolves so, and keeps that when Orders is added before it, Target removed or the measures reordered; `comboProblems` refuses a stored fifth mark or a third axis; a spec saved and parsed again keeps every setting (AC-497, AC-498, AC-037).
  - Depends on: none

- [x] T846 (AC-497, AC-037) Draw each combo series with its own mark on its own value axis, in §7h's draw order, a line over bars on its surface halo
  - Files: `packages/charts/src/series/combo.ts` (+ test), `packages/charts/src/theme.ts`, `packages/charts/src/optionFor.ts`.
  - Failing test: `combo.test.ts`: Revenue bar/left, Target line/left, Margin % point/right and Cost area/left give ECharts series of type bar, line, scatter, and line with `areaStyle` at 0.24 opacity; Margin %'s `yAxisIndex` is 1 and the others' 0; `z` orders area < bar < line < point; a line has a 5 px `bg-surface` halo under its 2 px stroke; a point has an 8 px marker with a 1.5 px surface ring (AC-497, AC-037).
  - Depends on: T845
