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

- [x] T854 (AC-506) Inside a combo, offer "Draw on a right axis" first for a measure on another scale, putting it there
  - Files: `packages/core/src/undrawn.ts` (the offers per chart type; + test), `packages/web/src/editor/Wells.tsx` (the offers row), `packages/web/src/editor/Wells.test.tsx`.
  - Failing test: `undrawn.test.ts`: a combo of Revenue and Margin %, both on Auto, gives Margin % "not drawn · on another scale" with offers right axis, small multiples, table in that order; a line chart of the same gives small multiples and table only; `Wells.test.tsx`: pressing "Draw on a right axis" sets Margin %'s axis to right and its pill to its R tag (AC-506).
  - Depends on: T845

- [x] T855 (AC-497, AC-498, AC-504, AC-219) Customize › Series: a 28 px row per series with its Mark and Axis radio groups and Back to Auto, grouped by measure while split
  - Files: `packages/web/src/editor/combo/SeriesRows.tsx` (+ test), `packages/web/src/editor/CustomizeTab.tsx`.
  - Failing test: `SeriesRows.test.tsx`: three rows with radio groups named "Revenue mark" and "Revenue axis", four mark buttons named Bar, Line, Area and Point in their tooltips and accessible names; ← and → move along a group; choosing Point and Right for Margin % updates the spec and shows "Back to Auto for Margin %: line, left", which restores it; split by Region, rows group under each measure with member rows of swatch, name and visibility; Margin %'s Bar is disabled with "Revenue draws bars. While the chart is split by Region, each measure needs its own mark." (AC-497, AC-498, AC-504, AC-219).
  - Depends on: T845, T852

- [x] T856 (AC-497) The Metrics pill's menu: Draw as and Axis as `menuitemradio` groups, Back to Auto, Format… and Remove; the pill's mark glyph and L or R tag
  - Files: `packages/web/src/editor/Wells.tsx`, `packages/web/src/editor/combo/PillMarkMenu.tsx` (+ test).
  - Failing test: `PillMarkMenu.test.tsx`: Margin %'s menu holds Draw as (Bar, Line, Area, Point) and Axis (Left, Right) as `menuitemradio` with the current ones checked, then Back to Auto, Format… and Remove; choosing Right puts an R tag before ×, and Customize › Series shows Right; Esc returns focus to the pill (AC-497).
  - Depends on: T855

- [x] T859 (AC-503) The stacking rows, Bars side by side or stacked, and Areas overlap or stacked while an area is drawn
  - Files: `packages/web/src/editor/combo/StackingRows.tsx` (+ test), `packages/web/src/editor/CustomizeTab.tsx`.
  - Failing test: `StackingRows.test.tsx`: Bars offers Side by side and Stacked; Areas shows only once Cost is drawn as an area; choosing Stacked sets the spec's stacking for every bar series (AC-503).
  - Depends on: T851, T855

- [x] T865 (AC-510) Keep the recommendation as it is when the author draws a second axis, and say so in "Why this recommendation?"
  - Files: `packages/recommender/src/explain.ts` (+ test), `packages/web/src/editor/WhyThisChart.tsx`.
  - Failing test: `explain.test.ts`: for time × 2 measures on different scales, a combo with Margin % on the right gives the same recommendation and runners-up as one without, and the one-value-axis rule reads "You drew a second axis by hand; the recommender never does" (AC-510).
  - Depends on: T845

- [x] T853 (AC-505) Hold a combo to 8 series: fold members to the top k + Other unless the author chose, then leave whole measures out, last added first
  - Files: `packages/core/src/combo.ts` (`comboLimit`), `packages/core/src/undrawn.ts` ("over 8 series"; + test), `packages/core/src/topN.ts`.
  - Failing test: `combo.test.ts`: 2 measures × 21 countries fold to top 3 + Other (8 series); 3 measures × 4 regions with nothing chosen fold to top 1 + Other (6); the same with "All" chosen draws 2 measures × 4 and leaves the third, last added, "not drawn · over 8 series"; 5 measures × 4 regions with nothing chosen draw 4 measures × (top 1 + Other); 9 unsplit measures draw 8; a hidden member and a member with no data each count (AC-505).
  - Depends on: T852

- [x] T857 (AC-497, AC-500) In the chart editor only, make each legend entry's glyph a 20 px button opening the pill's menu
  - Files: `packages/web/src/editor/combo/LegendGlyphButtons.tsx` (+ test), `packages/web/src/editor/PreviewFrame.tsx`, `e2e/combo.spec.ts`.
  - Failing test: `LegendGlyphButtons.test.tsx`: in the editor's preview each entry has a button named "Revenue target: line, left axis. Change mark or axis" opening the same menu; the e2e: on a dashboard, in view and edit mode, a combo tile's legend has no such button (AC-497, AC-500).
  - Depends on: T856, T848

- [x] T858 (AC-219, AC-499, AC-501, AC-502) Customize › Axes: the Left and Right axis groups, include zero locked with its reason, Synchronize with its toast, log scale on both, and the canvas line
  - Files: `packages/web/src/editor/AxisPanel.tsx` (+ test), `packages/web/src/editor/combo/SynchronizeSwitch.tsx` (+ test), `packages/web/src/editor/PreviewFrame.tsx`.
  - Failing test: `AxisPanel.test.tsx`: with every series on the left there's no Right group and no Synchronize; with Margin % on the right, the Right group lists "Margin % · %" and has no gridlines field; with a bar series, include zero reads "Include zero · on, because Revenue draws bars" and can't be switched; Log on one axis announces "Log scale on for both axes" and shows on both; `SynchronizeSwitch.test.tsx`: disabled for $ and % with the reason, and for $ and $ turning it on clears the right's fixed max with "Right axis now follows the left axis · Undo", which restores it; the canvas line reads "3 series on 2 value axes, aligned at zero", then "3 series on 2 axes, synchronized" (AC-219, AC-499, AC-501, AC-502).
  - Depends on: T849, T850, T855

- [x] T860 (AC-504, AC-505) The combo's Split by well, its count against 8, "‹dimension› shown", and "not drawn · over 8 series" with its offers
  - Files: `packages/web/src/editor/Wells.tsx`, `packages/web/src/editor/combo/SplitCount.tsx` (+ test), `packages/web/src/editor/Wells.test.tsx`.
  - Failing test: `Wells.test.tsx`: a combo's Data tab has a Split by well taking one dimension, a second replacing the first; `SplitCount.test.tsx`: "2 measures × 4 regions = 8 of 8 series"; adding Orders with "Regions shown" at All gives its pill "not drawn · over 8 series" and the row "Orders isn't drawn…" with Small multiples by Region, Table and Remove Orders; with nothing chosen the well reads "top 1 + Other of 4" (AC-504, AC-505).
  - Depends on: T853, T855

- [x] T861 (AC-218) Warn the author only while a combo draws two unsynchronized axes, in Customize › Axes, on the type card and in the tile's edit-mode head, with its variants and offers, and never a viewer
  - Files: `packages/recommender/src/warnings.ts` (+ test), `packages/web/src/editor/combo/ComboWarning.tsx` (+ test), `packages/web/src/editor/ChartTypeCard.tsx`, `packages/web/src/tiles/ChartTile.tsx` (the edit head), `e2e/combo.spec.ts`.
  - Failing test: `warnings.test.ts`: a combo on one axis, or two synchronized, gives no warning; two unsynchronized axes in $ and % give "Two scales: Revenue ($) and Margin % (%) can be made to look related." with One axis, Synchronize (disabled, with the reason), Small multiples and Table; $ and $ give the stronger wording with Synchronize first; lines with the right axis off zero add "The right axis doesn't start at zero."; a pie of 7 slices still warns; `ComboWarning.test.tsx`: One axis puts every series on the left; the e2e: the tile's edit head shows ⚠ opening the editor at Axes, and in view mode no part of the warning shows (AC-218).
  - Depends on: T849, T858

- [x] T862 (AC-507, AC-219) Reference lines and bands: the list and its form in Customize, horizontal or vertical, fixed or computed from a drawn series, with Edit, Duplicate and Delete with Undo
  - Files: `packages/core/src/combo.ts` (the references' shape and `referenceProblems`), `packages/web/src/editor/combo/ReferenceList.tsx` (+ test), `packages/web/src/editor/combo/ReferenceForm.tsx` (+ test).
  - Failing test: `ReferenceForm.test.tsx`: a horizontal line on the right axis offers Fixed, Average, Median, Minimum and Maximum of a drawn series; a vertical line on a month axis takes a month; a band with From $120K and To $90K keeps Add disabled with "A band's From must be below its To"; an empty label keeps Add disabled; `ReferenceList.test.tsx`: each row shows its icon, label, value and axis; Delete shows an Undo toast that restores it; `combo.test.ts`: an average on a split chart is one line per measure over every member (AC-507).
  - Depends on: T855

- [x] T863 (AC-508) Draw reference lines and bands with their styles and order, label them in the chart, move a colliding label, and leave out one outside its axis's range
  - Files: `packages/charts/src/combo/references.ts` (+ test), `packages/charts/src/series/combo.ts`.
  - Failing test: `references.test.ts`: a fixed line is a `markLine` of width 1.5, dash [5, 4], in `text-secondary`; one from Margin %'s average is dashed in Margin %'s colour; a band is a `markArea` in `bg-subtle` with no border, below every series; labels are `text-xs` `text-primary` on a 3 px surface halo and not in the legend; two lines 2 px apart get their labels at opposite ends, then 16 px inward; a line at $500K on a $0–$160K axis isn't drawn and its row reads "Outside the axis range" (AC-508).
  - Depends on: T862, T847

- [x] T864 (AC-509) Name each series' mark, axis and unit, and each reference line, in the text alternative and the table view
  - Files: `packages/charts/src/combo/describe.ts` (+ test), `packages/web/src/tiles/DataTable.tsx` (+ test), `packages/web/src/tiles/ChartCanvas.tsx`.
  - Failing test: `describe.test.ts`: the split example reads "Combo, by quarter, split by Region. Revenue: bars, left axis, dollars. Margin %: line, right axis, percent. Axes aligned at zero. 8 series." and adds "Monthly plan: line at $100K, left axis"; `DataTable.test.tsx`: a split combo's table has two header rows, the first "Revenue · bars, left · $" (AC-509).
  - Depends on: T852, T863

- [x] T866 (AC-511) Below 1,024 px, keep axis titles above their axes, compact ticks, thinned category labels, a wrapped legend and reference labels without values
  - Files: `packages/charts/src/series/combo.ts`, `packages/charts/src/combo/references.ts`, `e2e/combo.spec.ts`.
  - Failing test: the e2e at 390 px: a combo tile's axis titles sit above their axes; no two category labels' boxes overlap; the reference label reads "Monthly plan" alone and its tooltip "$100K"; the document doesn't scroll sideways (AC-511).
  - Depends on: T848, T863
