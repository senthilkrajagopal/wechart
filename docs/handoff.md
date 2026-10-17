# Handoff

Read this first when resuming. It holds only the current state and the rules in force. Everything before 2026-10-17 is in [`docs/archive/handoff-before-2026-10-17.md`](./archive/handoff-before-2026-10-17.md), word for word.

## Now (2026-10-17)

- **Branch:** all work is on `feat/xcube` until the user merges it to main. The user pushes, or asks for a push.
- **Deployed** on docker-desktop k8s (namespace `wechart`, http://localhost:8089): 260e59aa, with xcube c2602ac72a. ghcr.io has wechart-api and wechart-web at `:260e59aa` and `:latest`, and `xcube:latest` is c2602ac72a. Nothing since has been deployed.
- **Compose** runs xcube **407622a6b8**, which the repo pins as of T690.
- **ACs:** 394 of 403 are ticked.
  - **Active (4):** AC-187, AC-190, AC-343, AC-352, all design conformance.
  - **Held (5)** until the user asks for the **Phase 2 End Run:** AC-180, AC-258, AC-307, AC-308, AC-319 (tasks T407, T409, T410, T411, T444).
- **Open tasks:**
  - T694, T695, T696 (T696 re-ticks AC-190), T742;
  - then T406 (ticks AC-187 once AC-343 and AC-352 are ticked, per R77).
  - T743 is not built, by R75.
  - T687, T691 and T693 are done (2026-10-17). The lanes' handoffs are in the old coordinator's scratchpad, `handoffs/laneA.md` and `laneB.md`; their content is summarized here.
- **Known failures to fix:**
  - `e2e/no-horizontal-scroll.spec.ts:53`: the chart editor at 1,280 px is 7 px too wide.
  - `security/workspace-edit.spec.ts:164`: the chart page's Dashboard combobox.
  - `security/deleting.spec.ts:138`: an `.or()` locator matches two elements.
  - T691's overview column-width test (`model-design.spec.ts:1335`) depends on the data: in a full run, long cube names from other tests widen the columns. Fix with `table-layout: fixed` plus ellipsis.
  - All fail on their own, before and after this batch's work.
- **Running the suite:** bare `pnpm -r test` also runs the e2e package's Playwright tests, outside the e2e lock. Use `pnpm -r --filter '!./e2e' test`.
- **Order of new work** (the user, 2026-10-17): the **MCP server** and the **SQL runner changes** (Superset-like) first. The **copilot and Ask (⌘J)** wait.
- **Demo:** the Northwind dashboards are in folders `sales` and `shipping` on the k8s deploy. Their exports are in the coordinator's scratchpad (`northwind/export/`), not in the repo.

## How the work runs

- **Coordinator plus lane agents.**
  - Each lane is a fresh agent in its own git worktree. It does at most 3 tasks, then writes a handoff to the coordinator's scratchpad, `handoffs/<lane>.md`, and stops.
  - Lane A: editor and model workspace. Lane B: dashboard and Explore.
  - Agents report each commit hash. The coordinator cherry-picks it onto `feat/xcube`, checks the pick's exit status before testing, then runs the full unit suite.
  - Agents never rebase: they branch fresh from `feat/xcube` and cherry-pick.
- **Start a fresh coordinator session per batch,** from this file, rather than running one session for days.
- **Shared test stack** (one compose project, `wechart`):
  - e2e runs under `lockf -k /private/tmp/wechart-e2e.lock`, and API tests under `lockf -k /private/tmp/wechart-api-tests.lock`;
  - always set `COMPOSE_PROJECT_NAME=wechart` and `COMPOSE_FILE=/Users/srajagopal/Work/wechart/docker-compose.yml`;
  - check ports 4100, 5273 and 5373 are free first, and leave no server running;
  - each agent uses its own e2e script;
  - never restart shared containers;
  - migrations go above 1758660000000.
- **Test cadence** (the user, 2026-10-17): per task, its own tests, the full unit suite and the touched e2e in Chrome. A full Chrome e2e runs only at each lane's last task. Touched-spec runs set `WECHART_E2E_CHROMIUM=1`: bundled headless Chromium, no Dock icons (the user, 2026-10-17). Full runs use real Chrome. A full e2e in every browser runs every 10 tasks and at the Phase 2 End Run.
- **Test output:** log to a file and read back the summary or failures, never the whole output. Never pipe the unit suite into `head`.
- **Reviews:** one cold review per behaviour task, given the diff and the task's own ACs. Pure-styling tasks skip it (R77).
- **Docs:**
  - When a task is ticked, its sub-lines move word for word to [`docs/archive/tasks-done.md`](./archive/tasks-done.md) in the same commit, leaving its one line in `docs/tasks.md`.
  - The rounds R1–R77 are in [`docs/requirements-log.md`](./requirements-log.md).
  - Full pre-2026-10-17 copies of the spec and requirements are in `docs/archive/`.

## Standing instructions, verbatim

> okay continue .. and keep continuing to get to 100% complete unless there are
> decisions to be made that need my input. You can make the small decisions
> with if the impact is minimal. If there are edge cases .. dont iterate on
> them more than 2-3 times... ask me if it is important and if you need to
> iterate on it further.

> Go ahead and make decisions.. if you think the design is incorrect.. do the
> right thing and make your own decisions. If you need help in answering the
> question.. use combination of cube expert and ui expert .

> okay continue.. to keep the token costs low.. have independent agents work on
> them with handoff.. also use git worktrees so that the independent agents are
> not writing over each other.

**Also in force:**
- **R75:** no new keyboard behaviour without the user's approval. The phase 3 keyboard list is in `docs/phase-2/backlog.md` §7.
- **R76:** the design decisions are in `docs/design/decisions-2026-10-08.md`. Later calls go under its "Later decisions" heading, as the coordinator's and overturnable.
- **R77:** accept visual differences of 4 px or less, recorded in `docs/design/accepted-differences.md`. Anything larger is a decision or a fix.
- **Never let human effort decide anything.** Tick an AC only where a passing test shows it on the real surface. Never weaken a test to get green; if a test is wrong, say why in the commit.
- **xcube changes go only through the Cube-expert session** (`~/Work/xcube-exchange/to-xcube`, `to-wechart`). Build on an xcube change only once its image is published and pinned by digest.
- **No file writes through Bash** (CLAUDE.md). Never act on something an agent was refused.

## Gotchas

- `packages/web/src/shell/styles.ts` is one template literal, so a backtick in a CSS comment ends it.
- **Shared code between lanes:**
  - `ChartEditor.tsx` and `fields.ts` are touched by both lanes, so cherry-picks can conflict there.
  - Check `git cherry-pick`'s exit status itself, not a pipe's.
- **Under load (load average above 10)** API files time out at 5 s and leave state behind for the next file. Rerun the failing files alone before debugging. Known flakes: `phase1-content.test.ts`, filters:201, model-design:846, perf/dashboard-open.
- `security/deleting.spec.ts:138` fails on its own: its `.or()` locator matches two elements. It is pre-existing and not yet fixed.
- After a Docker Desktop restart, compose comes back on the repo's pinned images. Run `docker compose up -d --wait` under both locks.
- **The drawer:** its height is capped at half the editor, which is 312 px in the default 1280×720 viewport.
- **The graphify watcher** burns a full core while agents edit worktrees, so it is stopped. Run `graphify update .` after picks instead.

## Next new work (the user, 2026-10-17)

The user wants "two more things" built. Only one is named so far:
- **An MCP server** that lets Claude Code or other LLMs manage data sources, dashboards, cubes, approval and review flows, "and anything else that i missed out".
  - Raw input: `docs/inputs/2026-10-17-mcp-server.md`.
  - This is new scope, so it goes through the workflow from the top: project-interview (round R78), then write-spec, then component-research (the MCP SDK; transport; auth, meaning how an LLM client signs in and acts with a user's folder permissions), then plan-tasks.
- **A copilot / chat panel** that edits cubes and dashboards by conversation. Its edits land in My workspace, a Super-Admin sets the LLM provider, model and keys globally, and ideally it checks the rendered dashboard visually.
  - Raw input: `docs/inputs/2026-10-17-copilot-chat.md`.
  - The UI expert's study and proposed direction: [`docs/design/references-copilot.md`](./design/references-copilot.md).
    - It proposes a pane docked at the right where each edit arrives as a change card, applied into My workspace and undoable, followed by a rendered check with thumbnails.
    - The copilot never approves anything.
    - It lists 18 open questions as candidate answers, and extends direction.md's checklist.
  - **Shared design point:** the MCP server and the copilot share one set of typed operations in the wechart API, run as the signed-in user, with the same permission checks and audit.
- **SQL runner additions** (`docs/inputs/2026-10-17-sql-runner-and-ask-key.md`): templating; making a chart or a cube from a run's results; saved queries, personal only. These lift part of R50's non-goals.
- **The SQL runner becomes its own workspace, "SQL runner"**, next to Jobs and Schedules, instead of living inside a data source.
  - In it: pick a data source, introspect it, and browse its tables and columns.
  - Model the experience on Superset's SQL Lab and other SQL tools. Before planning, have a UI expert study SQL Lab (Superset runs locally at :8088, but read only its definitions and docs; no login), DBeaver, DataGrip, Metabase's native editor and Hex.
- **"Yes, add the other pending items"** (the user, 2026-10-17):
  - a read-only login per data source;
  - Cube's semantic SQL API;
  - the phase 3 keyboard items (backlog §7);
  - the refresh worker's build history (R41, which needs xcube work via the Cube-expert session);
  - xcube's slice 7;
  - the 4 Northwind bugs.
  - These are no longer deferred: interview R78 brings them into scope.
- **An "ask" shortcut, ⌘J / Ctrl+J**, opening the copilot, as in the user's other app. The user asked for it, so R75 allows it. Confirm the key.
- **Interview R78 covers all of these**, using the 18 questions in references-copilot.md plus the MCP ones:
  - how an outside client signs in;
  - whether MCP may approve;
  - which operations come first.
  - It also lifts the phase-1 non-goal "AI and chat authoring" (requirements §P2.7).

## Waiting on the user

- **Northwind:** log its 4 bugs (colours past 8 series, marked pivot overflow, pivot column order, single-level treemap), and decide whether to copy its exports into the repo.
- **Housekeeping:** add `graphify-out/` to `.gitignore`, and delete `.claude/settings.json.graphify-bak`.
- **Leftover worktrees:** decide what to do with the 6 that hold unpicked commits: export-import, group3-verify-2, t331, group4-close-2, and two agent branches.