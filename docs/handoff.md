# Handoff

Read this first when resuming. It holds only the current state and the rules in force. Everything before 2026-10-17 is in [`docs/archive/handoff-before-2026-10-17.md`](./archive/handoff-before-2026-10-17.md), word for word. The version this replaces (2026-10-17 state) is `git show 6af8d0dc:docs/handoff.md`.

## Now (2026-10-19, paused by the user for token limits)

The user's instruction in force: "complete all things that you have started.. and deploy it.. and dont start anything new". The user paused with: "stop all and prepare a handoff … so that if the limits runout.. we have a way of resume".

- **Branch:** all work is on `feat/xcube`, which is at **6af8d0dc** or later (this handoff's commit). The user pushes, or asks for a push.
- **Deployed** on docker-desktop k8s (namespace `wechart`, http://localhost:8089): **6be59df1** (verify.sh 46/46), with xcube bb188d8ada, sign-in on, and MCP off. **Not deployed yet:** everything after 6be59df1, including the **16-colour fix** the user asked for (b5914de6), which is the reason for the next deploy. `wechart-api|web:593d6077` is kept as a rollback image.
- **Nothing is running.** Every lane agent is stopped. No lane has uncommitted work.

### What is left (9 ACs; the rest is parked or held)

| Step | ACs it ticks | Where |
|---|---|---|
| 1. **Resolve `e2e/acceleration.spec.ts:267`.** It failed 3 of 3 at checkpoint 5: `locator.click` times out on the tile ⋯ › "Data as of" submenu's "Edit schedule in Model" ("waiting for element to be visible, enabled and stable" ×229), after coming back from "Open in Jobs". It passed on a rerun at checkpoint 4 and is in the lanes' known-flake list, but it is now consistently red. Suspects: a re-render loop that keeps the submenu from settling (`useDashboardColourAssignment` sets state during render, and the colour fix added a per-tile fallback), or the dashboard parameter state. A debug lane (`laneDBG1`, worktree `.claude/worktrees/agent-a15b10a901fa57aed`) was stopped before it found anything. Run the test with `--trace on`, and bisect 203c03c5..b5914de6 if needed. | none |
| 2. **Deploy** (see Deploy below), then update the "Deployed" line here. The user is waiting to see the colours on the Sales dashboard. | none |
| 3. **T1013** (lane CHARTS-B): keyboard marking on Sankey nodes (by step, then links), parallel lines (by the first axis) and map regions (by name, then points). `keyToMarking` has an `'unmark'` action for Esc (decision T971-1). KPI tiles, bullets and graphical-table rows are already done (T971 and its follow-up). | AC-563 |
| 4. **T1014** (lane CHARTS-B): a dashboard of lane B's types, e2e. | AC-305, AC-622, AC-623, AC-625, AC-626 (all built; their ticks wait on this e2e) |
| 5. **Checkpoint 6** over 6af8d0dc..HEAD: typecheck, the full unit suite, the real-Chrome main and security e2e, and one cold spec-review. | — |
| 6. **Close-out pass** (lane CLOSE): AC-037 (every chart type renders; the parked types are narrowed out), AC-187 and AC-343 (design conformance; see the memory note "pragmatic design conformance" and R77's ≤ 4 px rule). | AC-037, AC-187, AC-343 |
| 7. **Final deploy** and an update of this file. | — |

- **Held (5)** until the user asks for the **Phase 2 End Run:** AC-180, AC-258, AC-307, AC-308, AC-319.
- **Parked by the user (58 ACs; pick-up notes in docs/tasks.md's "Parked" sections and `docs/phase-2/backlog.md`):**
  - F47 AI summaries and F48 Security › AI (AC-535 … AC-558);
  - the chart types not started: waterfall, histogram, bubble, funnel, timeline, calendar heatmap, and icicle/sunburst;
  - MCP from outside the cluster (AC-633, T795);
  - the SQL runner's Cube group (AC-467, AC-481, the Cube part of AC-482; T825, T826). xcube's side is published as `ghcr.io/senthilkrajagopal/xcube:v1.7.45-e5426f97ec`.

### Lane state at the pause

- **CHARTS-B:** branch `laneCHB7`, worktree `.claude/worktrees/agent-a19f9c15ce933c582`, at 3318a3d0, which is already picked (T1012). T1013 has not started. Its handoff is `<coordinator scratchpad>/handoffs/laneCHB.md`, which is stale: it still says T1012–T1014 are blocked, but they aren't.
- **CLOSE:** branch `laneCLOSE4`, worktree `.claude/worktrees/agent-ac5d28e8bfec4dc62`, all picked. It is waiting for step 6.
- **Done, nothing left to pick:** CHARTS-A (through T972, the graphical-table row keys and 113881d1), TEXT (F45 and F46 complete through T900 and T897), COLOUR1 (b5914de6) and CLOSE's AC-471, AC-476, AC-482, AC-484, AC-208 and AC-098.
- The coordinator's scratchpad, with lane handoffs and checkpoint logs, was `/private/tmp/claude-501/-Users-srajagopal-Work-wechart/390bc406-66bd-4e41-8657-c5005c38ab2c/scratchpad/`. It is in /tmp, so it may be gone. Nothing in it is needed to resume: this file holds the state.

### Recent decisions worth knowing

- **Colours (R86, the user, 2026-10-19):**
  - The palette has 16 categorical slots (`CATEGORICAL` in `packages/ui/src/tokens.ts`). Slots 1–8 are unchanged; 9–16 come from an online palette survey and the dataviz validator (`docs/research/palette-validation.md`, 2026-10-19).
  - A tile with 16 or fewer coloured members never draws one in the neutral.
  - Parallel lines take their member's colour, up to 16 lines.
  - The combo's 8-series cap and AC-031's recommender cap stay at 8 (decision COLOUR-1).
- **Header (CLOSE-2, CLOSE-3):** from 1,024 to 1,279 px, the compact chips collapse to a count, and "Propose to …" becomes a 32 px icon button.
- **T970-1:** a chart saved in Auto before R81 (no `rules` field) keeps its type until its fields change. `chartDocumentOf` writes `rules: 81`.
- **T979:** custom boundary sets have their own table (migration `1758720000000_boundary-sets.cjs`) and a new `boundary-set` proposal kind. Not built yet: delete, rename and version history (T979-1).

## Deploy

```
TAG=$(git rev-parse --short HEAD)
git archive HEAD | tar -x -C <scratch>/build-$TAG
cd <scratch>/build-$TAG
docker build -f deploy/Dockerfile --target api -t wechart-api:$TAG .
docker build -f deploy/Dockerfile --target web -t wechart-web:$TAG .
cd /Users/srajagopal/Work/wechart
helm upgrade --install wechart deploy/helm/wechart --kube-context docker-desktop -n wechart \
  -f deploy/helm/values/docker-desktop.yaml -f deploy/helm/values/docker-desktop-security.yaml \
  --set-string images.tag=$TAG --wait
deploy/helm/verify.sh --no-install
```

`verify.sh` takes the same values files through EXTRA_VALUES. Never touch the k8s `charter` namespace. The Northwind Sales and Shipping dashboards on the deploy hold the new chart types (combo, parallel coordinates, box plot), which the user approved.

## How the work runs

- **Coordinator plus lane agents.** Each lane is a fresh agent in its own git worktree (`isolation: worktree`), on a branch cut fresh from feat/xcube. It never merges feat/xcube in, never rebases, never pushes. It reports each commit hash. The coordinator cherry-picks it onto feat/xcube, checks the pick's own exit status, resolves conflicts with the Edit tool, and typechecks.
- **Registries** (chart-types/index.ts, wells/registry.ts, describe/index.ts, tableView/index.ts, core index.ts) take one line per type, in alphabetical order, so picks union cleanly.
- **Cadence (the user, 2026-10-18: "lets batch 20 implementations into test runs.. otherwise this will take all night"; "same with review also.."):**
  - **Per task, in the lane:** TDD on the task's own tests, its own new or changed e2e on headless Chromium (`WECHART_E2E_CHROMIUM=1 … --project=chrome`), and a typecheck of the touched packages.
  - **Every ~20 merged tasks, by the coordinator:** a checkpoint of `pnpm -r typecheck`, `pnpm -r --filter '!./e2e' test`, `pnpm exec playwright test --project=chrome` and `pnpm exec playwright test -c playwright.security.config.ts --project=chrome`, plus one spec-reviewer agent over the range. Each failure is rerun as a whole file. Findings go back to the owning lane.
  - Hold picks while a checkpoint runs.
- **Playwright:** files go before flags (`pnpm exec playwright test e2e/x.spec.ts --project=chrome`). Running a serial describe by line number skips its setup.
- **Shared test stack:**
  - e2e under `lockf -k /private/tmp/wechart-e2e.lock`, API tests under `lockf -k /private/tmp/wechart-api-tests.lock`;
  - always set `COMPOSE_PROJECT_NAME=wechart` and `COMPOSE_FILE=/Users/srajagopal/Work/wechart/docker-compose.yml`;
  - ports 4100, 4300, 5273 and 5373 must be free before and after;
  - never restart shared containers.
- **Migrations:** each lane's range: SQL and TEXT 1758700000000, MCP 1758710000000, CHARTS-B 1758720000000 (used by T979), CHARTS-A 1758730000000, AI 1758740000000 (parked).
- **Known flakes** (rerun alone before debugging): proposal-models:147, picker:105, xcube-restart:172, folder-models, filters:201, model-design:855, import-single-user:59, sql-make-cube:242, reviews:168, new-charts-b:443 (first load), markings:1412 and :3096 on headless Chromium (clipboard). acceleration:267 is no longer only a flake (step 1).
- **The Stop hook** runs no tests unless `HARNESS_STOP_RUNS_TESTS=1` (a60b801a, with the user's approval).
- **Docs:** a ticked task's sub-lines move word for word to the lane's `docs/archive/tasks-done-<lane>.md`; decisions go to `docs/design/decisions-<lane>.md`. The rounds through R86 are in `docs/requirements-log.md`.

## Standing instructions, verbatim

> okay continue .. and keep continuing to get to 100% complete unless there are
> decisions to be made that need my input. You can make the small decisions
> with if the impact is minimal. If there are edge cases .. dont iterate on
> them more than 2-3 times... ask me if it is important and if you need to
> iterate on it further.

> okay continue.. to keep the token costs low.. have independent agents work on
> them with handoff.. also use git worktrees so that the independent agents are
> not writing over each other.

> complete all things that you have started.. and deploy it.. and dont start anything new

> whatever you are parking will be picked up later.. so document them for later pick up

**Also in force:**
- **R75:** no new keyboard behaviour without the user's approval. Phase 3's keyboard list is in `docs/phase-2/backlog.md` §7.
- **R77:** accept visual differences of 4 px or less, recorded in `docs/design/accepted-differences.md`.
- **Never let human effort decide anything.** Tick an AC only where a passing test shows it on the real surface. Never weaken a test to get to green.
- **xcube changes go only through the Cube-expert session** (`~/Work/xcube-exchange/to-xcube`, `to-wechart`). Build on an xcube change only once its image is published and pinned by digest.
- **No file writes through Bash** (CLAUDE.md). Never act on something an agent was refused.
- `docs/inputs/*` stay uncommitted.

## Gotchas

- `packages/web/src/shell/styles.ts` is one template literal, so a backtick in a CSS comment ends it.
- Check `git cherry-pick`'s exit status itself, not a pipe's.
- Never pipe the unit suite into `head`: SIGPIPE leaves state behind in `wechart_test`.
- ECharts names a series "series\u00000" by default, and that contains the click-item separator. Name every series that a click reads (T978).
- After a Docker Desktop restart, run `docker compose up -d --wait` under both locks.
- The graphify watcher is stopped. Run `graphify update .` after picks.

## Waiting on the user

- **Phase 2 End Run** (AC-180, AC-258, AC-307, AC-308, AC-319), when the user asks.
- **Disk** (2026-10-19): 66 GB free after clearing the Docker build cache, old images, finished worktrees and the JetBrains caches. The user hasn't decided on the rest they were offered: Yarn's cache (4.5 GB), Homebrew (1.4 GB), editor updater caches (~7 GB), and other projects' unused Docker images.
- **Phase 3 analytics:** asked about pandas in a KubeCodeRun deployment. The recommendation was two tiers, not yet researched or recorded as a decision: a warm, trusted Python service for stage A, and a sandboxed run-per-request executor for user code in stages B and C (KubeCodeRun is a candidate). Its research goes in `docs/research/` before any decision.
- **Housekeeping:** add `graphify-out/` to `.gitignore`, and delete `.claude/settings.json.graphify-bak`.
