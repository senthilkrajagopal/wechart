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

- [x] T847 (AC-499) Align a combo's two value axes: one zero height, the right axis's ticks on the left's gridlines, include zero forced while bars are drawn, and no right gridlines
  - Files: `packages/charts/src/combo/alignedAxes.ts` (+ test), `packages/charts/src/series/combo.ts`.
  - Failing test: `alignedAxes.test.ts`: left data −38K…155K and right −4 %…38 % give extents with the same negative share and five ticks each; with bars on either axis both ranges include zero; lines only with the right axis's include zero off keeps 20 %…40 %; the right axis's `splitLine.show` is false; over 500 random pairs whose ranges include zero, zero's fraction of each axis agrees within 1e-9 and the tick counts are equal (wechart's own algorithm: `alignTicks` doesn't align zero, research §2) (AC-499).
  - Depends on: T846

- [x] T848 (AC-500) Title each value axis above itself with its measures' glyphs and its unit, keep ticks `text-secondary`, give legend entries their glyphs and "(right)", and emphasise a hovered series' axis
  - Files: `packages/charts/src/combo/axisTitles.ts` (+ test), `packages/charts/src/legend.ts` (+ test), `packages/charts/src/series/combo.ts`, `packages/charts/src/interaction/axisEmphasis.ts` (+ test).
  - Failing test: `axisTitles.test.ts`: the left axis's name is rich text with a bar glyph (8 × 8, radius 2) and a line glyph (12 × 2), each in its series' colour, then "Revenue · Target ($)", `nameRotate` 0, at the axis's top; tick labels take `text-secondary` in light and dark; `legend.test.ts`: Margin % on the right reads "Margin % (right)" with the point glyph; `axisEmphasis.test.ts`: hovering Margin % puts the right axis's name and labels in `text-primary` and the left axis's series at opacity 0.28 (AC-500).
  - Depends on: T846

- [x] T849 (AC-501) Synchronize a combo's two axes into one scale, labelled on both sides, only while both share a format
  - Files: `packages/core/src/combo.ts` (`canSynchronize`), `packages/charts/src/combo/alignedAxes.ts`, their tests.
  - Failing test: `combo.test.ts`: `canSynchronize` holds for $ and $, and for $ and % fails with "Revenue is in $ and Margin % in %"; `alignedAxes.test.ts`: synchronized, both axes have the same min, max and interval, and the right axis's fixed min and max are dropped (AC-501).
  - Depends on: T847

- [x] T850 (AC-502) Give both axes one scale type, refuse log scale while bars are drawn, and count the values at or below zero a log axis leaves out
  - Files: `packages/core/src/combo.ts` (`logScaleState`), `packages/charts/src/series/combo.ts`, their tests.
  - Failing test: `combo.test.ts`: log on the left with two axes drawn makes the right log too; with a bar series, `logScaleState` is unavailable, "Log scale · unavailable: Revenue draws bars, which need a zero baseline"; the charts' `combo.test.ts`: Orders 0, 0, 0 and 12 on a log axis draws one point and reports 3 values not drawn (AC-502).
  - Depends on: T847

- [x] T851 (AC-503) Stack a combo's bars, and its areas, for the whole chart and per axis, never across axes
  - Files: `packages/core/src/combo.ts` (the stacking options), `packages/charts/src/series/combo.ts`, their tests.
  - Failing test: `combo.test.ts`: Stacked bars give the left's bar series `stack` "0:bars" and the right's "1:bars"; Overlap areas give no `stack` and Stacked areas "‹axis›:areas"; a combo with no area series offers no area stacking (AC-503).
  - Depends on: T846

- [x] T852 (AC-504) Split a combo by one dimension across every measure: a series per measure × member, coloured by member, on its measure's axis, one mark per measure
  - Files: `packages/core/src/render-spec.ts` (`seriesOf` for a split combo; + test), `packages/core/src/combo.ts` (`markTakenBy`), `packages/charts/src/series/combo.ts`, `packages/charts/src/colorAssignment.ts` (+ test).
  - Failing test: `render-spec.test.ts`: Revenue and Margin % split by 4 regions give 8 series, Revenue's on the left and Margin %'s on the right, a measure's bars grouped in member order; `colorAssignment.test.ts`: EMEA takes in the combo the colour it takes in a bar chart on the same dashboard; `combo.test.ts`: with Revenue on bars, `markTakenBy('bar')` names Revenue while split and nothing unsplit; a second split dimension replaces the first (AC-504).
  - Depends on: T845

- [x] T855 (AC-497, AC-498, AC-504, AC-219) Customize › Series: a 28 px row per series with its Mark and Axis radio groups and Back to Auto, grouped by measure while split
  - Files: `packages/web/src/editor/combo/SeriesRows.tsx` (+ test), `packages/web/src/editor/CustomizeTab.tsx`.
  - Failing test: `SeriesRows.test.tsx`: three rows with radio groups named "Revenue mark" and "Revenue axis", four mark buttons named Bar, Line, Area and Point in their tooltips and accessible names; ← and → move along a group; choosing Point and Right for Margin % updates the spec and shows "Back to Auto for Margin %: line, left", which restores it; split by Region, rows group under each measure with member rows of swatch, name and visibility; Margin %'s Bar is disabled with "Revenue draws bars. While the chart is split by Region, each measure needs its own mark." (AC-497, AC-498, AC-504, AC-219).
  - Depends on: T845, T852
