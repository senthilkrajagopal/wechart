# Finished tasks' notes: P2.27, the new chart types (lane CHARTS-B)

Lane CHARTS-B's ticked tasks from `docs/tasks.md` §P2.27 (F49–F55), their sub-lines word for word, kept apart from `tasks-done.md` while the lanes run in parallel. Each task keeps its one line in `docs/tasks.md`.

- [x] T990 [P] (AC-591, AC-306) Customize › Distribution on a box plot: Points and Violin, Outliers by default, and All, Beeswarm and Violin unavailable without Each point is
  - Files: `packages/core/src/chart-types/boxplotDistribution.ts` (+ test), `packages/web/src/editor/wells/boxplotDistribution.tsx` (+ test).
  - Failing test: `boxplotDistribution.test.ts`: a box plot saved before R81 reads as Points Outliers and no Violin; `boxplotDistribution.test.tsx`: without Each point is, All, Beeswarm and Violin are disabled, each described "Points need Each point is: choose what one point is, such as an Order." (AC-591, AC-306).
  - Depends on: none

- [x] T973 (AC-622, AC-305, AC-037) One Map type in place of the Country map: a boundary set and Regions, Points and Density layers in its spec, and saved country maps opening as Regions on Countries, unchanged
  - Files: `packages/core/src/chart-types/map.ts` (+ test), `packages/core/src/chart-migrations.ts` (+ test), `packages/web/src/editor/wells/map.tsx` (+ test), `packages/charts/src/series/map.ts`.
  - Failing test: `chart-migrations.test.ts`: a country map saved before R81 reads as a Map with a Regions layer on Countries and the same measure and dimension; `map.test.ts` (series): it draws the same countries in the same colours as before; `map.test.tsx` (wells): Boundary set offers Countries, Admin-1 and custom sets, and the three layers; the gallery has one Map card (AC-622, AC-305, AC-037).
  - Depends on: T934

- [x] T981 (AC-597, AC-037) Parallel coordinates' spec and wells: Line by, 3 or more ordered measures, Colour, and Scale with Shared only for one format
  - Files: `packages/core/src/chart-types/parallel.ts` (+ test), `packages/web/src/editor/wells/parallel.tsx` (+ test).
  - Failing test: `parallel.test.ts`: a spec of Product and 5 measures parses in order; `parallel.test.tsx` (wells): Shared is disabled for $ and % with the reason; 2 measures say "Parallel coordinates need at least 3 measures; there are 2. Add a measure, or use Scatter." with + Measure (AC-597, AC-037).
  - Depends on: T934

- [x] T982 (AC-598) Draw one line per member over min-to-max axes, the scale warning as text, and at most 1,000 lines with the cut said
  - Files: `packages/charts/src/series/parallel.ts` (+ test), `packages/web/src/tiles/ParallelNotes.tsx` (+ test).
  - Failing test: `parallel.test.ts` (series): each `parallelAxis` has its own min and max, its name its max above and its min below; lines are 1.5 px and, with 60 lines, at opacity 0.6; `ParallelNotes.test.tsx`: the warning is DOM text; 4,210 products draw 1,000 by Revenue with "Showing 1,000 of 4,210 products, by Revenue. Filter, or open the table." (AC-598).
  - Depends on: T981

- [x] T991 (AC-592, AC-306) Points as None, All or Beeswarm, these two from a fixed seed, 8 px at 0.6, falling back to All with a note where a beeswarm can't fit
  - Files: `packages/charts/src/series/boxplot.ts` (+ test).
  - Failing test: `boxplot.test.ts`: None draws no dots, not even the outliers (added 2026-10-18 from T990's review: no other task drew it); Beeswarm gives points with no two overlapping; All jitters them; two draws of the same data give identical positions; points are 8 px at opacity 0.6; APAC's 3,000 points fall back to All with "Too many points to place side by side in APAC: drawn as All, jittered."; Outliers draws as before R81 (AC-592, AC-306).
  - Depends on: T990
  - Waits on: research: ECharts 6.1's jitter and `jitterOverlap`, and how its placement can be seeded (the study: "not published").

- [x] T986 (AC-610, AC-037) The Sankey's spec and wells: 2–4 ordered steps, one summed measure, Colour links by, one grouped query, and its empty state
  - Files: `packages/core/src/chart-types/sankey.ts` (+ test), `packages/web/src/editor/wells/sankey.tsx` (+ test).
  - Failing test: `sankey.test.ts`: Channel → Region → Category with Revenue makes one Cube request of the three dimensions and links only adjacent pairs; a fifth step and an average are refused; `sankey.test.tsx` (wells): one step says "A Sankey shows flows between steps. Add a second dimension to Steps." with + Step (AC-610, AC-037).
  - Depends on: T934

- [x] T992 (AC-592) The violin: the category's colour at 0.24 with a 1.5 px edge, the box narrowing to 20 px inside it
  - Files: `packages/charts/src/series/violin.ts` (+ test), `packages/charts/src/series/boxplot.ts`.
  - Failing test: `violin.test.ts`: with Violin on, each Region has a violin in its colour at opacity 0.24 with a 1.5 px edge and its box 20 px wide inside it (AC-592).
  - Depends on: T990
  - Waits on: research: `@echarts-x/custom-violin` (version, licence, maintenance, its KDE options), before import; wechart's own custom series if it's unmaintained (23-Q10 (a)).

- [x] T993 (AC-593) Mark a box plot's points by entity ID, at most 1,000, and add points and violin to its text alternative, with "View points"
  - Files: `packages/charts/src/series/boxplot.ts`, `packages/charts/src/describe/boxplot.ts` (+ test), `packages/web/src/tiles/tableView/boxplot.ts` (+ test), `packages/charts/src/series/boxplotMarking.test.ts`.
  - Failing test: `boxplotMarking.test.ts`: clicking a point marks its Order ID; a lasso over 1,200 points refuses as AC-102 says; a box marks its Region; (describe) adds "Points: every order, as a beeswarm. Violin: …"; (table view) "View points" lists the orders and their values (AC-593).
  - Depends on: T991

- [x] T987 (AC-611) Draw the Sankey's nodes and links, split a repeated member as "‹member› (2)", and fold flows past 50 into "Other"
  - Files: `packages/charts/src/series/sankey.ts` (+ test).
  - Failing test: `sankey.test.ts` (series): nodes 12 px wide; the colouring step's nodes in their members' colours, others `text-secondary`; links at 0.4, emphasis 0.6; EMEA in steps 1 and 3 yields a node "EMEA (2)" and the note; 214 flows keep each step's members carrying its top 50 and fold the rest into "Other" with the note (AC-611).
  - Depends on: T986

- [x] T988 (AC-612) Mark a Sankey node as its member and a link as its tuple, give a link's marked share in its tooltip, and cross-filter
  - Files: `packages/charts/src/series/sankey.ts`, `packages/charts/src/marking/partial.ts`, `packages/charts/src/series/sankeyMarking.test.ts`.
  - Failing test: `sankeyMarking.test.ts`: clicking Web → EMEA marks (Channel = Web, Region = EMEA); with a marking elsewhere unmarked links fade to 0.28 of 0.4 and Web → EMEA's tooltip reads "Marked: $96K of $210K"; the tile's ⓘ says the share is in the tooltip; the chip reads "Channel: Web · Region: EMEA" (AC-612).
  - Depends on: T987

- [x] T989 (AC-613) The Sankey's text alternative and its table of flows
  - Files: `packages/charts/src/describe/sankey.ts` (+ test), `packages/web/src/tiles/tableView/sankey.ts` (+ test).
  - Failing test: (describe) "Sankey of Revenue from Channel to Region, 12 flows, $1.35M. Largest: Web → North America $237K; Web → EMEA $210K; Retail → North America $183K."; (table view) "Web → EMEA · $210,000 · 32.3%" (AC-613).
  - Depends on: T987
