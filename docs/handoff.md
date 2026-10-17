# Handoff

Read this first when resuming. It holds only the current state and the rules in force. Everything before 2026-10-17 is in [`docs/archive/handoff-before-2026-10-17.md`](./archive/handoff-before-2026-10-17.md), word for word.

## Now (2026-10-17)

- **Branch:** all work is on `feat/xcube` until the user merges it to main. The user pushes, or asks for a push.
- **Deployed** on docker-desktop k8s (namespace `wechart`, http://localhost:8089): 260e59aa, with xcube c2602ac72a. ghcr.io has wechart-api and wechart-web at `:260e59aa` and `:latest`, and `xcube:latest` is c2602ac72a. Nothing since has been deployed.
- **Compose** runs xcube **407622a6b8**, which the repo pins as of T690.
- **ACs:** 393 of 403 are ticked.
  - **Active (5):** AC-187, AC-190, AC-343, AC-344, AC-352, all design conformance.
  - **Held (5)** until the user asks for the **Phase 2 End Run:** AC-180, AC-258, AC-307, AC-308, AC-319 (tasks T407, T409, T410, T411, T444).
- **Open tasks:**
  - T687 (Export pane docking);
  - T691 (Model workspace; ticks AC-344);
  - T693, T694, T695, T696 (T696 re-ticks AC-190), T742;
  - then T406 (ticks AC-187 once AC-343, AC-344 and AC-352 are ticked, per R77).
  - T743 is not built, by R75.
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
- **Test cadence** (the user, 2026-10-17): per task, its own tests, the full unit suite and the touched e2e in Chrome. A full Chrome e2e runs only at each lane's last task. A full e2e in every browser runs every 10 tasks and at the Phase 2 End Run.
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

## Waiting on the user

- **Northwind:** log its 4 bugs (colours past 8 series, marked pivot overflow, pivot column order, single-level treemap), and decide whether to copy its exports into the repo.
- **Housekeeping:** add `graphify-out/` to `.gitignore`, and delete `.claude/settings.json.graphify-bak`.
- **Leftover worktrees:** decide what to do with the 6 that hold unpicked commits: export-import, group3-verify-2, t331, group4-close-2, and two agent branches.