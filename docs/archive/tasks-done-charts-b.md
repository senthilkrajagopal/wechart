# Finished tasks' notes: P2.27, the new chart types (lane CHARTS-B)

Lane CHARTS-B's ticked tasks from `docs/tasks.md` §P2.27 (F49–F55), their sub-lines word for word, kept apart from `tasks-done.md` while the lanes run in parallel. Each task keeps its one line in `docs/tasks.md`.

- [x] T990 [P] (AC-591, AC-306) Customize › Distribution on a box plot: Points and Violin, Outliers by default, and All, Beeswarm and Violin unavailable without Each point is
  - Files: `packages/core/src/chart-types/boxplotDistribution.ts` (+ test), `packages/web/src/editor/wells/boxplotDistribution.tsx` (+ test).
  - Failing test: `boxplotDistribution.test.ts`: a box plot saved before R81 reads as Points Outliers and no Violin; `boxplotDistribution.test.tsx`: without Each point is, All, Beeswarm and Violin are disabled, each described "Points need Each point is: choose what one point is, such as an Order." (AC-591, AC-306).
  - Depends on: none
