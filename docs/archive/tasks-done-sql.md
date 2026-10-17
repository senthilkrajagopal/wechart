# Done tasks, lane SQL (P2.24, from T797); the rest are in [`tasks-done.md`](./tasks-done.md)

### P2.24 Lane SQL: the workspace (ticked after 2026-10-17)

- [x] T797 (AC-386, AC-381, AC-304) The workspace's three panes: the picker and schema browser on the left, the tabs over the results in the centre, Saved and History on the right, folding to rails below 1,024 px, as design 17 screen 1 and state O draw them
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/SqlWorkspace.tsx` (+ test), `packages/web/src/workspaces/sql/sqlStyles.ts`, `e2e/security/sql-workspace.spec.ts`, `e2e/no-horizontal-scroll.spec.ts`.
  - Failing test: `SqlWorkspace.test.tsx`: the left pane is 280 px (220–400, a 40 px rail), the right 320 px (280–480, a 40 px rail), and the centre splits editor and results 30 : 70 with the editor at least 200 px and the results at least 160 px (direction §7f, rule 91). The e2e: below 1,024 px both side panes are 40 px rails that open over the centre and the editor stays usable (design 17's Q1); at 390 px nothing scrolls sideways (AC-304).
  - Depends on: T796
  - **Built 2026-10-17** (lane SQL). No AC is ticked: the panes hold only their headings until the picker (T798), the schema browser (T805) and History (T817) fill them, and AC-304 was ticked already. The sizes live in `panes.ts`; the grips are pointer-only, as the results drawer's is (R75). Below 1,280 px the right pane is a rail, below 1,024 the left one too (design 17, state O); a rail's pane opens over the centre, one at a time, takes focus, and closes on Esc (focus back to its rail) or a press outside it (rule 85). A dragged pane never leaves the editor under design 17's 560 px. `/sql` joins `shell.spec.ts`'s 390 px pages and `no-horizontal-scroll.spec.ts`.
