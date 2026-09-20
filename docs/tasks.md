# wechart tasks

Inputs: [`docs/spec.md`](./spec.md) (180 acceptance criteria, F1–F21), [`docs/research/`](./research/), [`docs/design/direction.md`](./design/direction.md).

185 tasks. Every AC is covered by at least one task, and every task cites at least one AC; the coverage table at the end lists all 180. Tasks are ordered by dependency first, then by user value. `[P]` means the task depends on no unfinished task at the point it appears, so it can run in parallel with its neighbours.

**Format.** Each task line follows the shape CLAUDE.md defines, with `Files`, `Failing test` and `Depends on` sub-bullets. `[P]` marks a task whose dependencies are already met where it appears.

**Order.** Task numbers group the work by feature; the real order is the `Depends on` graph, which is acyclic. Thirteen tasks depend on a higher-numbered task (for example T023 on T071, T088 on T113) — always take the next unchecked task whose dependencies are met, never the next number.

**Working rules.** One task, one observable behaviour, one commit, message `T00N: <title> (AC-…)`. Write the failing test first, confirm it fails for the right reason, then the code. Tick an AC in `docs/spec.md` only when a passing test demonstrates it.

**`--passWithNoTests` is temporary.** The scaffold gives each package a `test` script before it has tests, so the flag keeps `pnpm test` green. It also turns a mistyped include glob into a silent pass, so drop it from a package's `test` script in the same commit as that package's first test. Scaffold tasks cite the ACs they first make testable.

**Package layout** (created by T001):

| Package                | Contents                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `packages/core`        | chart spec, marking model, filter model, canonical Cube query builder — no DOM, no React   |
| `packages/api`         | Fastify service: Cube proxy, metadata persistence, jobs, connection tests                  |
| `packages/web`         | Vite + React app: shell, Explore, chart editor, dashboards, model editor, admin workspaces |
| `packages/charts`      | ECharts renderer for the chart spec, plus the marking/hit-test layer                       |
| `packages/ui`          | in-house primitives and design tokens                                                      |
| `packages/recommender` | legality rules and weighted scoring                                                        |
| `e2e`                  | Playwright acceptance tests                                                                |

---

## Phase 0. Scaffold

- [x] T001 [P] (AC-180) Create the pnpm workspace, strict TypeScript configs, lint and format, and the test stack across the four desktop browsers
  - Files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `playwright.config.ts`, `.github/workflows/ci.yml`, `packages/{core,api,web,charts,ui,recommender}/package.json`, `packages/*/tsconfig.json`, `e2e/smoke.spec.ts`
  - Failing test: `e2e/smoke.spec.ts`: the app shell **renders** — React's own output, not the static `index.html` — with no page error, in Chrome, Edge, Firefox and WebKit. This is the harness AC-180 is measured with, so its assertions must fail when an engine runs the app badly, not merely when the server is down. Every package declares `test` and `typecheck`; the TypeScript configs exclude `.claude/`.
  - Depends on: none
  - Note: Edge runs in CI only. `playwright install msedge` shells out to `sudo`, so it cannot be installed unattended on a developer machine; `.github/workflows/ci.yml` installs the `chrome` and `msedge` channels and sets `CI`, which is what adds the Edge project. A local run covers Chrome, Firefox and Safari. Root `test` runs the package suites only; `pnpm e2e` runs the acceptance suite, so the Stop hook is not gated on browsers that may be absent.
  - Done 2026-09-19. AC-180 stays **unchecked**: a local run proves three browsers, and the criterion names four. T185 ticks it from a CI run. TypeScript is pinned at 6.0.3 rather than the researched 7.0.2 — see requirements.md §5.
- [x] T002 [P] (AC-004, AC-005) Define the design tokens and an automated type-size and contrast audit
  - Files: `packages/ui/src/tokens.ts`, `packages/ui/src/tokens.test.ts`, `packages/ui/src/audit/contrast.ts`, `packages/ui/src/audit/contrast.test.ts`
  - Failing test: `packages/ui/src/audit/contrast.test.ts`: the audit flags a token pair below 4.5:1 (3:1 for ≥18.66 px bold or ≥24 px) and a font-size token below 12 px, in both themes (AC-004, AC-005).
  - Depends on: none
  - Done 2026-09-19. **AC-004 and AC-005 stay unchecked.** Both are stated over *rendered* text nodes; this task proves only that the token set is sound, and a component hard-coding `font-size: 11px` without a token would pass every test here. `docs/research/test-stack.md` says the same: AC-005 "can only be verified with axe running against a real browser rendering". T008 ticks both from the rendered audit.
  - The audit found five real failures in the published palette, all on `bg-subtle`, which direction.md's original `bg-surface`-only ratios had missed; those five tokens moved, `text-on-accent` was added (white on dark `accent` is 2.41:1), and §5 now carries worst-case ratios for every row. `contrast.ts` uses 700 for the bold allowance, not our type scale's 600, so it agrees with axe-core at T008 — sourced in `research/test-stack.md`.
- [x] T003 [P] (AC-014, AC-015) Build the metadata database, migrations and repositories with optimistic concurrency
  - Files: `docker-compose.yml`, `packages/api/src/db/{client,schema,migrate}.ts`, `packages/api/src/db/migrations/*.cjs`, `packages/api/src/repos/documents.ts`, `packages/api/src/repos/documents.test.ts`, `packages/api/vitest.config.ts`, `packages/api/vitest.globalSetup.ts`
  - Failing test: `packages/api/src/repos/documents.test.ts`: each of the five kinds reads back unchanged after the connection pool is recreated (AC-014), and a save carrying a stale version is refused with a "changed" error rather than overwriting (AC-015).
  - Depends on: T001
  - Done 2026-09-19. One versioned `documents` table rather than five per-kind repositories: AC-014 names five kinds but asks only that each is stored and returns unchanged, and AC-015 asks that a stale save is refused. Neither needs per-kind columns, and inventing a relational shape for behaviour no AC describes would be guesswork. T016 (folder tree), T017 (title search) and T019 (references) add columns and indexes in their own migrations.
  - `pnpm test` starts the Docker Postgres and applies migrations through `vitest.globalSetup.ts`, per the user's decision. If Docker is not running the run **fails with an explanation**; it never skips, because a green run that proved nothing is worse than a red one.
- [x] T004 (AC-007, AC-008) Stand up the Fastify service as the only holder of Cube credentials
  - Files: `packages/api/src/server.ts`, `packages/api/src/config.ts`, `packages/api/src/cube/client.ts`, `packages/api/src/cube/client.test.ts`, `packages/api/src/server.test.ts`
  - Failing test: `client.test.ts`: every outbound Cube request carries the configured security context, signed with the configured secret (AC-008); `server.test.ts`: the API answers for metadata and queries, and no reply carries the secret — success, Cube failure or service failure (AC-007).
  - Depends on: T001, T003
  - Done 2026-09-19. **AC-008 ticked. AC-007 stays unchecked**: its second half is "the browser SHALL make no request to the Cube API host", and the app makes no data requests at all yet, so an e2e assertion would pass vacuously — the same trap T001's first smoke test fell into. T024 is the first task where the browser needs metadata; it ticks AC-007 with `e2e/no-direct-cube.spec.ts`.
  - The security context travels as the JWT payload Cube reads, signed with HMAC-SHA256 from `node:crypto` rather than through a JWT dependency, so the secret passes through no third-party code. Tests run against a stub Cube over real HTTP; the real Cube joins docker-compose at T010/T024, where metadata correctness is the point rather than what wechart sends.

## F1. Application shell and navigation

- [x] T005 (AC-001) Render the top bar with a workspace switcher of exactly six entries
  - Files: `packages/web/src/shell/{AppShell,WorkspaceSwitcher}.tsx`, `packages/web/src/shell/{AppShell,WorkspaceSwitcher}.test.tsx`, `packages/web/src/test-setup.ts`, `e2e/smoke.spec.ts`
  - Failing test: `WorkspaceSwitcher.test.tsx`: the switcher lists exactly Explore, Model, Data sources, Jobs, Schedules and Security, and contains no "Dashboards" entry (AC-001).
  - Depends on: T001
  - Done 2026-09-19. AC-001 ticked. The tests assert the **whole list** rather than the presence of each name, because "exactly" is the criterion — a seventh entry has to fail. `WORKSPACES` is the one list both the switcher and the router (T006) read, so they cannot drift apart. `e2e/smoke.spec.ts` now asserts the rendered switcher rather than a string in `main`, which keeps the AC-180 harness tied to something React produces.
- [x] T006 (AC-002) Route every surface so a reload restores it
  - Files: `packages/web/src/router/routes.tsx`, `packages/web/src/App.tsx`, `e2e/routing.spec.ts`
  - Failing test: `e2e/routing.spec.ts`: opening a workspace, a dashboard, a chart and a model file each changes the URL, and reloading each URL restores the same surface and the same selected object (AC-002).
  - Depends on: T005
  - Done 2026-09-19. AC-002 ticked: 12 cases, each of which navigates, **reloads**, and asserts the surface and selected object came back — reload is the criterion, so none asserts only that a link works. Workspace routes are generated from `WORKSPACES`, so a workspace cannot exist in the switcher and not the router.
  - The object routes render a placeholder naming the selected object. The URL↔selection contract is what this task settles; the surfaces themselves arrive at T023 (dashboard), T032 (chart editor) and T137 (model file), and each re-runs the reload assertion against real content.
  - The switcher still uses plain `<a href>` rather than client-side navigation, so a workspace change is a full page load. No AC covers that yet; revisit if a task needs state to survive a workspace switch.
- [x] T007 (AC-003) Switch theme without changing the route or losing scroll position
  - Files: `packages/web/src/shell/{ThemeProvider,ThemeToggle,styles}.tsx|ts`, `packages/web/src/shell/ThemeToggle.test.tsx`, `packages/ui/src/css.ts`, `packages/ui/src/css.test.ts`, `packages/web/src/main.tsx`, `e2e/theme.spec.ts`
  - Failing test: `e2e/theme.spec.ts`: after a theme switch the route and scroll offset are unchanged and no element retains the previous theme's background colour (AC-003).
  - Depends on: T002, T006
  - Done 2026-09-19. **AC-003 stays unchecked**: the route half and the repaint half are demonstrated (computed `background-color` on `body` and `.app-bar`, in both directions, and across a reload), but the criterion also says "without losing scroll position" and no surface is long enough to scroll yet. Asserting that against a page that cannot scroll would prove nothing. T016 builds the Explore contents list and ticks AC-003 with the scroll assertion added.
  - Both palettes ship in one stylesheet and the switch is a `data-theme` attribute on the document element, so nothing remounts and no navigation happens — which is *why* the route and scroll survive, rather than something that needs defending per surface. The stylesheet is generated from the tokens by `@wechart/ui`'s `themeCss()`, so what the browser paints and what the contrast audit checks are the same values.
- [x] T008 (AC-004, AC-005) Apply the tokens across the shell and run the audit over rendered surfaces
  - Files: `packages/web/src/shell/styles.ts`, `e2e/a11y-tokens.spec.ts`, `e2e/tsconfig.json`
  - Failing test: `e2e/a11y-tokens.spec.ts`: on the rendered shell in both themes, every text node computes to at least 12 px and meets its contrast threshold (AC-004, AC-005).
  - Depends on: T002, T007
  - Done 2026-09-19. **AC-004 and AC-005 ticked**, from the rendered page rather than the token table — axe-core for contrast and a computed-style sweep over every visible text node, across four surfaces in both themes. This is what T002 deliberately left open: a component hard-coding a colour or an 11 px size passes every unit test and fails here.
  - Two of the eighteen cases exist to prove the audits can fail: each injects a violation (an 11 px paragraph, and `#bbbbbb` on white) and asserts it is caught. Without them, "no offenders" could equally mean the sweep found no text at all.
  - Re-run on every surface a later task adds. The audit is only as broad as `SURFACES`.
- [x] T009 (AC-006) Open the search palette on ⌘K / Ctrl+K with focus in its input
  - Files: `packages/web/src/shell/SearchPalette.tsx`, `packages/web/src/shell/SearchPalette.test.tsx`, `packages/web/src/shell/{AppShell,styles}.tsx|ts`, `e2e/search-palette.spec.ts`
  - Failing test: `SearchPalette.test.tsx`: the shortcut opens the palette from any workspace and `document.activeElement` is the palette input (AC-006).
  - Depends on: T005
  - Done 2026-09-19. AC-006 ticked. The shortcut is bound on the document, not a container, because "anywhere in the application" includes while focus sits in another input — where a container-scoped handler never sees the event, and which is the case both the component test and the e2e assert.
  - Escape returns focus to wherever it came from. A shortcut that strands the keyboard somewhere else is worse than no shortcut (AC-176).
  - The palette has no click-to-dismiss backdrop: the a11y lint rejected a clickable `div`, correctly, so the ways out are Escape and a real Close button, which every input method can reach.
  - What the palette *searches* arrives with Explore search at T017; this task is the shortcut, the surface and the focus contract.

## F2. wechart service: Cube access, metadata and persistence

- [x] T010 (AC-009) Serve metadata from the new model within 60 seconds of a `schemaVersion` change
  - Files: `packages/api/src/cube/meta-cache.ts`, `packages/api/src/cube/meta-cache.test.ts`, `packages/api/src/server.ts`
  - Failing test: `meta-cache.test.ts`: with a fake clock, a changed `schemaVersion` causes the next metadata request after at most 60 s to return the new model's members, with no process restart (AC-009).
  - Depends on: T004
  - Done 2026-09-19. AC-009 ticked. Research correction: `schemaVersion` is a Cube **config hook** (`fn(ctx) => string`, called per request, recompiling when the string changes — `research/cube/configuration-deployment.md` §3), not something Cube pushes to clients. So the 60-second bound is wechart's own: a cached entry older than that is refetched before being served.
  - Caching is what makes the bound necessary. Without it metadata is never stale, but a ten-tile dashboard becomes ten `/v1/meta` requests against a queue whose default concurrency is 2. Concurrent callers share one in-flight fetch for the same reason.
  - `invalidate()` skips the bound for wechart's own publishes (T142/T143): waiting out 60 seconds is the wrong answer to "did my change take effect?". Failures are never cached.
- [x] T011 (AC-010) Hold the request open while Cube replies "Continue wait"
  - Files: `packages/web/src/query/{loadTile,useTileData}.ts`, `packages/web/src/query/{loadTile,useTileData}.test.ts|tsx`
  - Failing test: `loadTile.test.ts`: two "Continue wait" responses followed by a result leave the tile in its loading state throughout and then render the result, with no error state (AC-010).
  - Depends on: T004
  - Done 2026-09-19. AC-010 ticked. Cube answers a still-running query with HTTP **200** and a body of `{"error":"Continue wait"}` — an error-shaped body that is not an error. Trusting the status code renders an empty tile; trusting the word "error" shows a red tile for a query that is merely slow. Both are the failure this criterion names, so the sentinel is matched explicitly and a test asserts the tile never passes through an error state on the way.
  - The request id is minted once and carried across the whole poll, so Cube sees one query rather than a series — and so T012 has something to name when it cancels.
  - The poll is bounded (`maxPolls`), because a tile that hangs forever is its own failure. Retries are off in the hook: a Cube error is something the tile shows (AC-012), and backoff would hide it and spend AC-175's budget.
- [x] T012 (AC-011) Cancel a superseded query against Cube before rendering the newer result
  - Files: `packages/web/src/query/loadTile.ts`, `packages/web/src/query/cancel.test.ts`, `packages/api/src/cube/client.ts`, `packages/api/src/server.ts`, `packages/api/src/server.test.ts`
  - Failing test: `cancel.test.ts`: changing a tile's filters aborts the in-flight fetch and issues `DELETE /v1/running-query/{requestId}` for it, and the older result never replaces the newer one (AC-011).
  - Depends on: T011
  - Done 2026-09-19. AC-011 ticked. **Dropping the response is not cancelling** — the criterion says "against Cube". An abandoned query keeps running and holds one of the queue's two default slots until its orphan timeout, so a user dragging a filter slider can starve their own dashboard. The abort listener fires `DELETE /api/running-query/{id}`, which the service forwards to Cube.
  - A test asserts the cancellation names the id the load actually used: one naming a fresh id stops nothing, and would pass a weaker assertion.
  - The route always answers 204, including when Cube says the query is unknown. The tile that issued it is already gone and a failed cancellation is not something anyone can act on; the warning goes to the log.
- [x] T013 (AC-012) Show a tile error state carrying Cube's message and the query JSON
  - Files: `packages/web/src/tiles/TileError.tsx`, `packages/web/src/tiles/TileError.test.tsx`
  - Failing test: `TileError.test.tsx`: a Cube error renders the message and a control that reveals the exact query JSON sent, instead of an empty chart (AC-012).
  - Depends on: T011
  - Done 2026-09-19. AC-012 ticked. Cube's message is shown **verbatim** rather than translated into something friendlier: "Can't find join path between Orders and Suppliers" tells an author what to change, where "Something went wrong" tells them to file a ticket. A test asserts the original message survives.
  - The query JSON is one control away — the other half of diagnosing a failure, but noise while the message is enough. The state pairs an icon with a label, never colour alone.
- [x] T014 (AC-013) Mark a tile accelerated with a data age, or live
  - Files: `packages/web/src/tiles/AccelerationBadge.tsx`, `packages/web/src/tiles/AccelerationBadge.test.tsx`
  - Failing test: `AccelerationBadge.test.tsx`: a response with `usedPreAggregations` renders the accelerated badge and the data age; a source-database response renders the live badge (AC-013).
  - Depends on: T011
  - Done 2026-09-19. AC-013 ticked. Both directions are asserted, because both mislead: labelling everything "live" hides that a number is an hour old, and labelling everything "accelerated" claims a freshness guarantee that is not there (requirements §4 — volumes vary widely, so the UI has to say which queries are accelerated).
  - Cube sends `usedPreAggregations` **with no entries** for a source-database query, so its presence proves nothing; only a non-empty set means accelerated. A test pins that case, since checking for the key alone would label every tile accelerated.
- [x] T015 (AC-016) Record every query wechart issues and list the records in the Jobs workspace
  - Files: `packages/api/src/repos/query-log.ts`, `packages/api/src/repos/query-log.test.ts`, `packages/api/src/db/migrations/1758240001000_query-log.cjs`, `packages/api/src/db/schema.ts`, `packages/api/src/server.ts`, `packages/api/src/server.test.ts`, `packages/web/src/workspaces/jobs/QueryLog.tsx`, `packages/web/src/workspaces/jobs/QueryLog.test.tsx`
  - Failing test: `query-log.test.ts`: rendering a chart produces one record holding the Cube request, the duration and the acceleration flag, and the Jobs endpoint returns it (AC-016).
  - Depends on: T005, T011
  - Done 2026-09-19. AC-016 ticked. **Failed queries are recorded too.** A query that ran for four seconds and then errored is exactly what someone opens the Jobs workspace to find; recording only successes would make it a log of what worked rather than of what the system did.
  - Recording never fails a chart that loaded. A test asserts a load still returns 200 when the log write throws — observability that can break the thing it observes is worse than none.
  - Its own table, not `documents`: this is append-only and read by recency, so the only index is `created_at DESC` (`research/db-access.md`).
  - Still to wire: the Jobs **route** renders `QueryLog` against `/api/jobs/queries`. The component and the endpoint both exist and are tested; joining them belongs with the Jobs surface work at T155–T158.

## F3. Explore: folders, catalog and search

- [ ] T016 (AC-017) Show the folder tree and the selected folder's contents
  - Files: `packages/web/src/workspaces/explore/{FolderTree,FolderContents}.tsx`, `packages/api/src/routes/folders.ts`, `packages/web/src/workspaces/explore/FolderContents.test.tsx`
  - Failing test: `FolderContents.test.tsx`: every dashboard and library chart in the folder is listed with its type, owner and last-updated time, and no column is blank for an item that has that value (AC-017).
  - Depends on: T003, T005
  - Also ticks **AC-003**, carried from T007: this is the first surface long enough to scroll, so `e2e/theme.spec.ts` can add the half of that criterion T007 could not demonstrate — scroll the contents list, switch theme, assert the offset is unchanged.
- [ ] T017 (AC-019) Search dashboards and library charts by title, excluding dashboard-local charts
  - Files: `packages/web/src/workspaces/explore/Search.tsx`, `packages/api/src/routes/search.ts`, `packages/api/src/routes/search.test.ts`
  - Failing test: `search.test.ts`: a substring match returns every library item whose title contains it and never a dashboard-local chart (AC-019).
  - Depends on: T016
- [ ] T018 (AC-020) Create a folder, dashboard or chart into the selected folder and open it
  - Files: `packages/web/src/workspaces/explore/CreateMenu.tsx`, `packages/api/src/routes/folders.ts`, `e2e/explore-create.spec.ts`
  - Failing test: `e2e/explore-create.spec.ts`: each new object lands in the selected folder and the app navigates to it (AC-020).
  - Depends on: T016
- [ ] T019 (AC-021) Keep every reference working when a folder, dashboard or chart is renamed or moved
  - Files: `packages/api/src/repos/{folders,charts}.ts`, `packages/api/src/repos/references.test.ts`
  - Failing test: `references.test.ts`: after moving a library chart, a dashboard that uses it still resolves it and renders no missing-chart state (AC-021).
  - Depends on: T016
- [ ] T020 (AC-022) List the dashboards that use a library chart, and offer to add it to another
  - Files: `packages/web/src/workspaces/explore/LibraryChartPage.tsx`, `packages/api/src/routes/charts.ts`, `packages/web/src/workspaces/explore/LibraryChartPage.test.tsx`
  - Failing test: `LibraryChartPage.test.tsx`: every dashboard containing the chart appears in the list and an "Add to dashboard" action is offered (AC-022).
  - Depends on: T019
- [ ] T021 (AC-023) Name the dependent dashboards and require confirmation before deleting a library chart
  - Files: `packages/web/src/workspaces/explore/DeleteChartDialog.tsx`, `packages/api/src/routes/charts.ts`, `packages/web/src/workspaces/explore/DeleteChartDialog.test.tsx`
  - Failing test: `DeleteChartDialog.test.tsx`: deletion is blocked until confirmation, and the dialog names each dashboard that uses the chart (AC-023).
  - Depends on: T020
- [ ] T022 (AC-024) Navigate the Explore contents with the arrow keys and open with Enter
  - Files: `packages/web/src/workspaces/explore/FolderContents.tsx`, `packages/web/src/workspaces/explore/keyboard.test.tsx`
  - Failing test: `keyboard.test.tsx`: arrow keys move the selection through the listed items and Enter opens the selected one (AC-024).
  - Depends on: T016
- [ ] T023 (AC-018) Open a dashboard from Explore in view mode with its saved tabs, tiles and settings
  - Files: `packages/web/src/dashboard/DashboardView.tsx`, `packages/web/src/dashboard/DashboardView.test.tsx`
  - Failing test: `DashboardView.test.tsx`: a saved dashboard opens in view mode with every saved page tab, tile and setting present, and not in edit mode (AC-018).
  - Depends on: T016, T071

## F4. Chart builder and recommendation

- [ ] T024 (AC-025) List cubes, views and their members grouped by type
  - Files: `packages/web/src/editor/FieldList.tsx`, `packages/api/src/routes/meta.ts`, `packages/web/src/editor/FieldList.test.tsx`
  - Failing test: `FieldList.test.tsx`: every measure, dimension, segment and time dimension in the metadata appears under its group, and members marked hidden do not (AC-025).
  - Depends on: T010
  - Also ticks **AC-007**, carried from T004: this is the first task where the browser needs metadata, so `e2e/no-direct-cube.spec.ts` can assert that the page issues at least one metadata request, that none targets the Cube API host, and that no response body carries the Cube secret. Asserting that before the app fetched anything would have passed vacuously.
- [ ] T025 (AC-026) Add a field to a well by drag or by the well's "+" picker and re-run the query
  - Files: `packages/web/src/editor/{Well,FieldPicker}.tsx`, `packages/web/src/editor/Well.test.tsx`
  - Failing test: `Well.test.tsx`: both routes add the field to the well and the chart re-queries, replacing the previous result (AC-026).
  - Depends on: T024
- [ ] T026 (AC-027) Mark each well legal or illegal during a drag, with a reason for every illegal well
  - Files: `packages/web/src/editor/wellRules.ts`, `packages/web/src/editor/wellRules.test.ts`
  - Failing test: `wellRules.test.ts`: dragging a dimension over a measure-only well marks it illegal with a reason, and dropping on it is refused (AC-027).
  - Depends on: T025
- [ ] T027 (AC-030, AC-031) Implement the recommender's legality rules: no second value axis, and the channel-capacity caps
  - Files: `packages/recommender/src/rules/{legality,capacity}.ts`, `packages/recommender/src/rules/legality.test.ts`
  - Failing test: `legality.test.ts`: a two-value-axis candidate is rejected (AC-030), and candidates over 8 colour categories, 20 trellis panels, 6 pie slices or 200 heatmap cells are rejected (AC-031). Rule names are ported from `docs/research/recommender-algorithms.md` §2; the four caps are recorded there as product decisions.
  - Depends on: T001
- [ ] T028 (AC-028) Recommend a chart type from the field signature, with at least one runner-up and a reason
  - Files: `packages/recommender/src/{score,recommend}.ts`, `packages/web/src/editor/Recommendation.tsx`, `packages/recommender/src/recommend.test.ts`
  - Failing test: `recommend.test.ts`: a field change produces a top pick plus at least one runner-up, each with a reason of at most 80 characters (AC-028).
  - Depends on: T027
- [ ] T029 (AC-029) Show the "Why this chart?" trace
  - Files: `packages/web/src/editor/WhyThisChart.tsx`, `packages/web/src/editor/WhyThisChart.test.tsx`
  - Failing test: `WhyThisChart.test.tsx`: the panel shows the field signature, each field's cardinality, and every hard rule with its pass or fail result, including each rule that rejected a candidate (AC-029).
  - Depends on: T028
- [ ] T030 (AC-032) Keep a manually chosen chart type until "Back to recommended"
  - Files: `packages/web/src/editor/chartTypeState.ts`, `packages/web/src/editor/chartTypeState.test.ts`
  - Failing test: `chartTypeState.test.ts`: after a manual pick, later field changes leave the type unchanged, and "Back to recommended" restores the recommendation (AC-032).
  - Depends on: T028
- [ ] T031 (AC-033) Say what is missing when the fields cannot produce the chosen type
  - Files: `packages/web/src/editor/MissingFields.tsx`, `packages/web/src/editor/MissingFields.test.tsx`
  - Failing test: `MissingFields.test.tsx`: the message names the well and the member type needed, instead of rendering empty axes (AC-033).
  - Depends on: T030
- [ ] T032 (AC-034) Preview at the tile's own size and filling the editor, and return with the tile updated
  - Files: `packages/web/src/editor/PreviewFrame.tsx`, `e2e/editor-preview.spec.ts`
  - Failing test: `e2e/editor-preview.spec.ts`: opened from a tile, the tile-size preview matches the tile's width and height, and returning applies the changes to that tile (AC-034).
  - Depends on: T025, T060
- [ ] T033 (AC-035) Undo, redo and discard every change made since the editor opened
  - Files: `packages/web/src/editor/history.ts`, `packages/web/src/editor/history.test.ts`
  - Failing test: `history.test.ts`: every editor change is undoable and redoable, and Discard restores the chart exactly as it was on open (AC-035).
  - Depends on: T025
- [ ] T034 (AC-036) Show the results drawer: result rows, underlying rows and the query JSON
  - Files: `packages/web/src/editor/ResultsDrawer.tsx`, `packages/web/src/editor/ResultsDrawer.test.tsx`
  - Failing test: `ResultsDrawer.test.tsx`: all three views are present and each reflects the query the chart actually rendered (AC-036).
  - Depends on: T025

## F5. Chart rendering

- [ ] T035 (AC-037) Render the bar family from a chart spec
  - Files: `packages/core/src/spec.ts`, `packages/charts/src/series/bar.ts`, `packages/charts/src/series/bar.test.ts`
  - Failing test: `bar.test.ts`: bar, horizontal bar, grouped bar and stacked bar each render from a valid spec (AC-037).
  - Depends on: T001
- [ ] T036 (AC-037) Render the line and area family
  - Files: `packages/charts/src/series/line.ts`, `packages/charts/src/series/line.test.ts`
  - Failing test: `line.test.ts`: line, multi-series line, area and stacked area each render from a valid spec (AC-037).
  - Depends on: T035
- [ ] T037 (AC-037) Render scatter
  - Files: `packages/charts/src/series/scatter.ts`, `packages/charts/src/series/scatter.test.ts`
  - Failing test: `scatter.test.ts`: a scatter spec renders its points with both value axes bound (AC-037).
  - Depends on: T035
- [ ] T038 (AC-037) Render pie and donut
  - Files: `packages/charts/src/series/pie.ts`, `packages/charts/src/series/pie.test.ts`
  - Failing test: `pie.test.ts`: pie and donut each render from a valid spec (AC-037).
  - Depends on: T035
- [ ] T039 (AC-037) Render treemap and heatmap
  - Files: `packages/charts/src/series/{treemap,heatmap}.ts`, `packages/charts/src/series/heatmap.test.ts`
  - Failing test: `heatmap.test.ts`: treemap and heatmap each render from a valid spec (AC-037).
  - Depends on: T035
- [ ] T040 (AC-037) Render the KPI tile
  - Files: `packages/charts/src/dom/Kpi.tsx`, `packages/charts/src/dom/Kpi.test.tsx`
  - Failing test: `Kpi.test.tsx`: a KPI spec renders its value and sub-line without clipping (AC-037).
  - Depends on: T035
- [ ] T041 (AC-037, AC-178) Render the table, and offer a table view of every chart's data from the tile
  - Files: `packages/charts/src/dom/DataTable.tsx`, `packages/web/src/tiles/TableView.tsx`, `packages/charts/src/dom/DataTable.test.tsx`, `e2e/table-view.spec.ts`
  - Failing test: `DataTable.test.tsx`: a table spec renders with real `<table>` semantics and virtualised rows (AC-037); `e2e/table-view.spec.ts`: every chart type offers a table view reachable from its tile (AC-178).
  - Depends on: T035
- [ ] T042 (AC-037) Render the pivot table with row subtotals and grand totals
  - Files: `packages/charts/src/dom/PivotTable.tsx`, `packages/core/src/pivot.ts`, `packages/charts/src/dom/PivotTable.test.tsx`
  - Failing test: `PivotTable.test.tsx`: a pivot spec renders nested column headers from Cube's `tableColumns`, with row subtotals and grand totals (AC-037).
  - Depends on: T041
- [ ] T043 (AC-037, AC-045) Render trellis panels with a shared scale, per-panel titles and a cap of 20
  - Files: `packages/charts/src/layout/trellis.ts`, `packages/charts/src/layout/trellis.test.ts`
  - Failing test: `trellis.test.ts`: panels lay out in a grid, share one scale while the shared setting is on, each carry a title, and never exceed 20 (AC-037, AC-045).
  - Depends on: T035
- [ ] T044 (AC-037) Render the combo chart
  - Files: `packages/charts/src/series/combo.ts`, `packages/charts/src/series/combo.test.ts`
  - Failing test: `combo.test.ts`: a combo spec renders bar and line series against one value axis (AC-037).
  - Depends on: T036
- [ ] T045 (AC-038) Show a legend for two or more series and none for one
  - Files: `packages/charts/src/legend.ts`, `packages/charts/src/legend.test.ts`
  - Failing test: `legend.test.ts`: a two-series chart renders a legend and a single-series chart renders no legend box (AC-038).
  - Depends on: T036
- [ ] T046 (AC-039) Give a member the same colour in every tile, and keep it when filters change the visible set
  - Files: `packages/charts/src/colorAssignment.ts`, `packages/charts/src/colorAssignment.test.ts`
  - Failing test: `colorAssignment.test.ts`: a member keeps one colour across two tiles, and keeps it after a filter removes other members (AC-039).
  - Depends on: T035
- [ ] T047 (AC-040) Apply the axis editor's settings to the rendered chart
  - Files: `packages/web/src/editor/AxisPanel.tsx`, `packages/charts/src/axis.ts`, `packages/charts/src/axis.test.ts`
  - Failing test: `axis.test.ts`: minimum, maximum, logarithmic scale, gridlines, tick rotation, number format and axis title each change the rendered axis (AC-040).
  - Depends on: T035
- [ ] T048 (AC-041) Aggregate the remainder into a labelled "Other (n)"
  - Files: `packages/core/src/topN.ts`, `packages/core/src/topN.test.ts`
  - Failing test: `topN.test.ts`: past the top-N setting the chart renders N categories plus one "Other (n)" labelled with the number of members it covers (AC-041).
  - Depends on: T035
- [ ] T049 (AC-042) Show a chart-shaped loading skeleton and an error state offering Retry and details
  - Files: `packages/web/src/tiles/{TileSkeleton,TileError}.tsx`, `packages/web/src/tiles/TileSkeleton.test.tsx`
  - Failing test: `TileSkeleton.test.tsx`: loading renders a skeleton matching the chart's shape, and a failure renders Retry plus the error details (AC-042).
  - Depends on: T013
- [ ] T050 (AC-043) Show an empty state naming the filters in effect
  - Files: `packages/web/src/tiles/TileEmpty.tsx`, `packages/web/src/tiles/TileEmpty.test.tsx`
  - Failing test: `TileEmpty.test.tsx`: a zero-row result renders a message naming every active filter, not blank axes (AC-043).
  - Depends on: T049, T084
- [ ] T051 (AC-044) Sort categories by value or label and keep the order across a refresh
  - Files: `packages/core/src/sort.ts`, `packages/core/src/sort.test.ts`
  - Failing test: `sort.test.ts`: ascending, descending and label orders are applied, and a refresh with unchanged data preserves the order (AC-044).
  - Depends on: T035
- [ ] T052 (AC-046) Format every value with its member's format in axes, labels, tooltips and tables
  - Files: `packages/core/src/format.ts`, `packages/core/src/format.test.ts`
  - Failing test: `format.test.ts`: currency and percentage members render with their declared format in all four places (AC-046).
  - Depends on: T041, T047

## F6. Quick calculations and calculation requests

- [ ] T053 (AC-047) Offer the six quick calculations on a measure
  - Files: `packages/web/src/editor/QuickCalcMenu.tsx`, `packages/web/src/editor/QuickCalcMenu.test.tsx`
  - Failing test: `QuickCalcMenu.test.tsx`: the menu offers % of total, difference from previous period, % difference from previous period, running total, rank and moving average (AC-047).
  - Depends on: T025
- [ ] T054 (AC-049) Disable a quick calculation that needs a missing time dimension, and say which
  - Files: `packages/web/src/editor/QuickCalcMenu.tsx`, `packages/web/src/editor/quickCalcAvailability.test.ts`
  - Failing test: `quickCalcAvailability.test.ts`: without a time dimension the period calculations are disabled and name the missing field, rather than being offered and erroring (AC-049).
  - Depends on: T053
- [ ] T055 (AC-048) Compute quick calculations in Cube as multi-stage measures and label the measure
  - Files: `packages/core/src/quickCalc.ts`, `packages/core/src/quickCalc.test.ts`
  - Failing test: `quickCalc.test.ts`: applying a calculation adds a multi-stage measure to the Cube query rather than post-processing fetched rows, and the tile labels the measure with the calculation (AC-048).
  - Depends on: T053
- [ ] T056 (AC-050) Record a calculation request carrying the chart, the fields in use and the description
  - Files: `packages/api/src/repos/calc-requests.ts`, `packages/web/src/editor/RequestCalcDialog.tsx`, `packages/api/src/repos/calc-requests.test.ts`
  - Failing test: `calc-requests.test.ts`: the stored request holds the chart reference, the fields and the description, and appears in the Model workspace listing (AC-050).
  - Depends on: T053, T137
- [ ] T057 (AC-051) Open a calculation request's target cube in the model editor with the request beside it
  - Files: `packages/web/src/workspaces/model/RequestPane.tsx`, `packages/web/src/workspaces/model/RequestPane.test.tsx`
  - Failing test: `RequestPane.test.tsx`: opening a request opens the cube the request names, with the request text visible beside the editor (AC-051).
  - Depends on: T056, T138
- [ ] T058 (AC-052) Resolve a calculation request and name the member that resolves it
  - Files: `packages/api/src/repos/calc-requests.ts`, `packages/api/src/repos/calc-resolution.test.ts`
  - Failing test: `calc-resolution.test.ts`: publishing a model containing the requested measure marks the request resolved and records the member name (AC-052).
  - Depends on: T057, T143

## F7. Dashboard authoring

- [ ] T059 (AC-053) Show the edit bar and the edit sidebar
  - Files: `packages/web/src/dashboard/edit/{EditBar,EditSidebar}.tsx`, `packages/web/src/dashboard/edit/EditBar.test.tsx`
  - Failing test: `EditBar.test.tsx`: activating Edit reveals Undo, Redo, Discard and Save, and the sidebar's Add, Outline and Properties panels (AC-053).
  - Depends on: T005
- [ ] T060 (AC-054) Snap tiles to the 12-column grid and 8-pixel row units, with the grid visible while editing
  - Files: `packages/web/src/dashboard/grid/{Canvas,geometry}.ts`, `packages/web/src/dashboard/grid/geometry.test.ts`
  - Failing test: `geometry.test.ts`: every tile's width is a whole number of columns and its height a multiple of 8 px, and the gridlines render in edit mode (AC-054).
  - Depends on: T059
- [ ] T061 (AC-055) Resize a tile by edge or corner with a live readout, and offer no numeric size fields
  - Files: `packages/web/src/dashboard/grid/resize.ts`, `packages/web/src/dashboard/grid/resize.test.ts`, `e2e/no-size-fields.spec.ts`
  - Failing test: `resize.test.ts`: dragging an edge or corner resizes the tile and shows columns, percentage and pixels (AC-055); `e2e/no-size-fields.spec.ts`: no width or height input exists anywhere in the editor.
  - Depends on: T060
- [ ] T062 (AC-056) Drag a tile by its grip with a drop marker, including onto page-tab and tab-group labels
  - Files: `packages/web/src/dashboard/grid/{drag,dropTarget}.ts`, `packages/web/src/dashboard/grid/dropTarget.test.ts`
  - Failing test: `dropTarget.test.ts`: a grip drag shows a drop marker and moves the tile, and a drop on a tab label moves it into that tab (AC-056). Built in-house per `docs/research/dashboard-grid.md`, with the accessibility baseline that doc makes a condition.
  - Depends on: T060
- [ ] T063 (AC-057) Move, resize, edit and delete a focused tile from the keyboard
  - Files: `packages/web/src/dashboard/grid/keyboard.ts`, `packages/web/src/dashboard/grid/keyboard.test.ts`
  - Failing test: `keyboard.test.ts`: arrow keys move the focused tile, Shift+arrows resize it, E opens its chart editor and Delete removes it (AC-057).
  - Depends on: T061, T062
- [ ] T064 (AC-058) Offer every element type in the Add palette and insert it at the stated position
  - Files: `packages/web/src/dashboard/edit/AddPanel.tsx`, `packages/web/src/dashboard/model/insert.ts`, `packages/web/src/dashboard/model/insert.test.ts`
  - Failing test: `insert.test.ts`: chart, chart from folders, section, tab group, markdown, header, divider, image, link and filter are all offered, and each inserts after the selection or into the chosen "+ Add" slot (AC-058).
  - Depends on: T059
- [ ] T065 (AC-059) Wrap a tab group added outside a section in a new section, and say so
  - Files: `packages/web/src/dashboard/model/grammar.ts`, `packages/web/src/dashboard/model/grammar.test.ts`
  - Failing test: `grammar.test.ts`: adding a tab group directly to a page tab creates a wrapping section and surfaces a message explaining it (AC-059).
  - Depends on: T064
- [ ] T066 (AC-060) Offer an undo for every delete, restoring the element and its contents
  - Files: `packages/web/src/dashboard/edit/history.ts`, `packages/web/src/dashboard/edit/history.test.ts`
  - Failing test: `history.test.ts`: deleting a tile, section, page tab or tab offers a toast undo and an Undo entry, and either restores the element with its contents (AC-060).
  - Depends on: T064
- [ ] T067 (AC-061) Ask whether to delete or keep a section's contents
  - Files: `packages/web/src/dashboard/edit/DeleteSectionDialog.tsx`, `packages/web/src/dashboard/edit/DeleteSectionDialog.test.tsx`
  - Failing test: `DeleteSectionDialog.test.tsx`: deleting a non-empty section prompts, "delete contents" removes them and "keep" preserves every tile (AC-061).
  - Depends on: T066
- [ ] T068 (AC-062) Give a duplicated chart tile its own dashboard-local chart
  - Files: `packages/web/src/dashboard/model/duplicate.ts`, `packages/web/src/dashboard/model/duplicate.test.ts`
  - Failing test: `duplicate.test.ts`: editing the duplicate leaves the original tile's chart unchanged (AC-062).
  - Depends on: T064, T132
- [ ] T069 (AC-063) Warn on an image tile without alt text and accept only the allowed types and size
  - Files: `packages/web/src/dashboard/tiles/ImageTile.tsx`, `packages/api/src/routes/uploads.ts`, `packages/web/src/dashboard/tiles/ImageTile.test.tsx`
  - Failing test: `ImageTile.test.tsx`: a tile without alt text shows a warning in edit mode, and files outside PNG, JPEG, WebP, GIF and SVG or over 2 MB are refused (AC-063).
  - Depends on: T064
- [ ] T070 (AC-064) Open a link tile's target, carrying filters to a dashboard and restricting URLs to http and https
  - Files: `packages/web/src/dashboard/tiles/LinkTile.tsx`, `packages/web/src/dashboard/tiles/LinkTile.test.tsx`
  - Failing test: `LinkTile.test.tsx`: a dashboard target opens with the current filters when the option is on, and a `javascript:` or `file:` URL is refused while http(s) opens in a new tab (AC-064).
  - Depends on: T064, T087
- [ ] T071 (AC-065) Persist the layout, tile settings, dashboard settings and marking definitions on save
  - Files: `packages/api/src/repos/dashboards.ts`, `packages/web/src/dashboard/edit/save.ts`, `packages/web/src/dashboard/edit/save.test.ts`
  - Failing test: `save.test.ts`: reopening a saved dashboard restores all four, and saving leaves edit mode (AC-065).
  - Depends on: T003, T064
- [ ] T072 (AC-066) Restore the dashboard, its chart specs and its settings on discard
  - Files: `packages/web/src/dashboard/edit/discard.ts`, `packages/web/src/dashboard/edit/discard.test.ts`
  - Failing test: `discard.test.ts`: no change made during the session survives Discard, chart specs and settings included (AC-066).
  - Depends on: T071
- [ ] T073 (AC-067) Keep the canvas and sidebar scroll positions across a re-render
  - Files: `packages/web/src/dashboard/edit/EditSidebar.tsx`, `packages/web/src/dashboard/grid/Canvas.tsx`, `e2e/edit-scroll.spec.ts`
  - Failing test: `e2e/edit-scroll.spec.ts`: after an edit-mode re-render, both scroll offsets are unchanged (AC-067).
  - Depends on: T060
- [ ] T074 (AC-068) Insert section templates as empty charts that state what they need
  - Files: `packages/web/src/dashboard/edit/templates.ts`, `packages/web/src/dashboard/edit/templates.test.ts`
  - Failing test: `templates.test.ts`: every tile a template inserts is an empty chart stating its requirements, bound to no fields the user did not choose (AC-068).
  - Depends on: T064, T031

## F8. Dashboard settings and interaction modes

- [ ] T075 (AC-069) Open the dashboard settings page with its five sections and a way back without saving
  - Files: `packages/web/src/dashboard/settings/SettingsPage.tsx`, `packages/web/src/dashboard/settings/SettingsPage.test.tsx`
  - Failing test: `SettingsPage.test.tsx`: the gear opens a page with General, Interactions, Markings, Cross-filtering and Layout, and leaving without saving applies nothing (AC-069).
  - Depends on: T059
- [ ] T076 (AC-070) Keep both interaction configurations and label the inactive one
  - Files: `packages/web/src/dashboard/settings/interactionMode.ts`, `packages/web/src/dashboard/settings/interactionMode.test.ts`
  - Failing test: `interactionMode.test.ts`: switching modes preserves the other mode's configuration, exactly one mode is active, and the other is labelled inactive (AC-070).
  - Depends on: T075
- [ ] T077 (AC-071) Clear marks and cross-filters when a mode change is saved
  - Files: `packages/web/src/dashboard/settings/interactionMode.ts`, `packages/web/src/dashboard/settings/modeSwitch.test.ts`
  - Failing test: `modeSwitch.test.ts`: after saving a mode change, no mark or cross-filter from the previous mode affects any tile (AC-071).
  - Depends on: T076, T090
- [ ] T078 (AC-072) Default a new dashboard to Markings with one default marking named "Marking"
  - Files: `packages/web/src/dashboard/model/newDashboard.ts`, `packages/web/src/dashboard/model/newDashboard.test.ts`
  - Failing test: `newDashboard.test.ts`: a new dashboard's interaction mode is Markings and it carries exactly one marking, named "Marking", flagged default (AC-072).
  - Depends on: T076, T090
- [ ] T079 (AC-073) Guard against leaving the settings page with unsaved changes
  - Files: `packages/web/src/dashboard/settings/SettingsPage.tsx`, `packages/web/src/dashboard/settings/dirtyGuard.test.ts`
  - Failing test: `dirtyGuard.test.ts`: leaving with a dirty field prompts before discarding, and a clean page leaves silently (AC-073).
  - Depends on: T075
- [ ] T080 (AC-074) Record a settings save as one undoable change
  - Files: `packages/web/src/dashboard/edit/history.ts`, `packages/web/src/dashboard/settings/undo.test.ts`
  - Failing test: `undo.test.ts`: one Undo after saving several settings reverts all of them (AC-074).
  - Depends on: T066, T075
- [ ] T081 (AC-075) Render the dashboard centred at 1,440 px or full width, per the setting
  - Files: `packages/web/src/dashboard/grid/Canvas.tsx`, `packages/web/src/dashboard/settings/pageWidth.test.ts`
  - Failing test: `pageWidth.test.ts`: the rendered canvas width follows the setting in both positions (AC-075).
  - Depends on: T075

## F9. Filters

- [ ] T082 (AC-076) Offer the four filter widget types
  - Files: `packages/web/src/filters/widgets/{DateRange,ListSearch,NumericRange,CheckboxList}.tsx`, `packages/web/src/filters/widgets/widgets.test.tsx`
  - Failing test: `widgets.test.tsx`: a date range with presets, a searchable list, a numeric range and a checkbox list can each be added to a dashboard (AC-076).
  - Depends on: T064
- [ ] T083 (AC-077) Scope a filter to the dashboard, a page tab or named tiles, and show its scope
  - Files: `packages/web/src/filters/scope.ts`, `packages/web/src/filters/scope.test.ts`
  - Failing test: `scope.test.ts`: the widget displays its scope, and a tab-scoped filter leaves tiles on other tabs unchanged (AC-077).
  - Depends on: T082
- [ ] T084 (AC-078) Re-query every tile in a filter's scope and no tile outside it
  - Files: `packages/web/src/filters/apply.ts`, `packages/web/src/filters/apply.test.ts`
  - Failing test: `apply.test.ts`: a value change re-queries exactly the in-scope tiles, and out-of-scope tiles issue no query (AC-078).
  - Depends on: T083
- [ ] T085 (AC-079) Leave a tile unfiltered and mark it not covered when the member is unreachable
  - Files: `packages/web/src/filters/coverage.ts`, `packages/web/src/filters/coverage.test.ts`
  - Failing test: `coverage.test.ts`: when a filter's member is not reachable from a tile's cube or view, that tile renders unfiltered with a "not covered" label and no query error (AC-079).
  - Depends on: T084
- [ ] T086 (AC-080) Return every in-scope tile to the unfiltered result when a filter is cleared
  - Files: `packages/web/src/filters/apply.ts`, `packages/web/src/filters/clear.test.ts`
  - Failing test: `clear.test.ts`: after clearing, no tile in scope reflects the filter (AC-080).
  - Depends on: T084
- [ ] T087 (AC-081) Put active filters in the dashboard URL
  - Files: `packages/web/src/filters/url.ts`, `packages/web/src/filters/url.test.ts`
  - Failing test: `url.test.ts`: opening the produced URL in a fresh session reproduces the same filter values (AC-081).
  - Depends on: T006, T084
- [ ] T088 (AC-082) Combine dashboard, tab and tile filters with marking limits using AND
  - Files: `packages/core/src/query/compose.ts`, `packages/core/src/query/compose.test.ts`
  - Failing test: `compose.test.ts`: a row satisfying only the filter or only the marking limit is excluded from the composed query (AC-082).
  - Depends on: T084, T113
- [ ] T089 (AC-083) Send relative date presets to Cube as relative ranges
  - Files: `packages/core/src/query/dateRange.ts`, `packages/core/src/query/dateRange.test.ts`
  - Failing test: `dateRange.test.ts`: "last 30 days" produces a relative `dateRange`, not fixed dates (AC-083).
  - Depends on: T082

## F10. Markings

- [ ] T090 (AC-084) Model markings: at least one, exactly one default, at most four
  - Files: `packages/core/src/markings/model.ts`, `packages/core/src/markings/model.test.ts`
  - Failing test: `model.test.ts`: a dashboard always has a default marking, and creating a fifth marking is refused (AC-084).
  - Depends on: T001
- [ ] T091 (AC-085) Set a new chart tile to the default marking and offer "(None)" and the others
  - Files: `packages/web/src/dashboard/settings/TileMarking.tsx`, `packages/web/src/dashboard/settings/TileMarking.test.tsx`
  - Failing test: `TileMarking.test.tsx`: a newly created chart tile marks with the dashboard's default, and the setting lists "(None)" plus every marking (AC-085).
  - Depends on: T090
- [ ] T092 (AC-086) Store a marking only as a predicate over dimension members or bounded ranges
  - Files: `packages/core/src/markings/predicate.ts`, `packages/core/src/markings/predicate.test.ts`
  - Failing test: `predicate.test.ts`: a stored marking holds member/granularity/value tuples or ranges and never a row index or result position (AC-086).
  - Depends on: T090
- [ ] T093 (AC-087) Replace a marking on click and toggle one item on Ctrl-click or ⌘-click
  - Files: `packages/core/src/markings/apply.ts`, `packages/charts/src/interaction/itemClick.ts`, `packages/core/src/markings/apply.test.ts`
  - Failing test: `apply.test.ts`: a plain click replaces the marking with the clicked item, and a modified click toggles it while leaving the rest (AC-087). Item clicks are detected by pairing mousedown and mouseup, per `docs/research/echarts.md`.
  - Depends on: T092
- [ ] T094 (AC-088) Mark with a rectangle drag and an Alt-drag lasso, treating a motionless press as a click
  - Files: `packages/charts/src/interaction/{dragOverlay,hitTest}.ts`, `packages/charts/src/interaction/hitTest.test.ts`
  - Failing test: `hitTest.test.ts`: a rectangle and a lasso each mark every item they touch via `convertToPixel` hit-testing, a drag of at least 5 px is never a click, and a press-and-release without movement is (AC-088).
  - Depends on: T093
- [ ] T095 (AC-089) Toggle or add on a Ctrl-drag according to the enclosed items' state
  - Files: `packages/core/src/markings/apply.ts`, `packages/core/src/markings/toggleOrAdd.test.ts`
  - Failing test: `toggleOrAdd.test.ts`: a Ctrl-drag over an all-marked or all-unmarked set toggles it, and over a partly marked set adds rather than unmarks (AC-089).
  - Depends on: T094
- [ ] T096 (AC-090) Mark a category from its legend entry, keeping visibility elsewhere
  - Files: `packages/charts/src/interaction/legendMark.ts`, `packages/charts/src/interaction/legendMark.test.ts`
  - Failing test: `legendMark.test.ts`: clicking a legend entry's text marks every item of that category without hiding the series, and Ctrl-click adds further categories (AC-090).
  - Depends on: T093, T045
- [ ] T097 (AC-091) Mark every item in a trellis panel from its header
  - Files: `packages/charts/src/interaction/panelMark.ts`, `packages/charts/src/interaction/panelMark.test.ts`
  - Failing test: `panelMark.test.ts`: a click on a panel header marks all of that panel's items, not one and not none (AC-091). Uses `title.triggerEvent` per `docs/research/echarts.md`.
  - Depends on: T093, T043
- [ ] T098 (AC-092) Mark table rows, with Shift-range, only when a primary key is available
  - Files: `packages/charts/src/dom/DataTable.tsx`, `packages/charts/src/dom/rowMarking.test.tsx`
  - Failing test: `rowMarking.test.tsx`: a click marks the row, Shift-click marks the range from the anchor in display order, and rows are not markable when the cube exposes no primary key (AC-092).
  - Depends on: T041, T093
- [ ] T099 (AC-093) Mark a continuous range by dragging along an axis, shown as a stripe with stable bounds
  - Files: `packages/core/src/markings/range.ts`, `packages/charts/src/interaction/axisRange.ts`, `packages/core/src/markings/range.test.ts`
  - Failing test: `range.test.ts`: an axis drag stores a bounded range, renders a coloured stripe on that axis, and the bounds are unchanged after a filter change (AC-093).
  - Depends on: T094
- [ ] T100 (AC-094) Unmark on an empty-plot click or Escape, leaving other markings alone
  - Files: `packages/charts/src/interaction/clear.ts`, `packages/charts/src/interaction/clear.test.ts`
  - Failing test: `clear.test.ts`: clicking empty plot area or pressing Escape on a focused tile clears only that tile's marking (AC-094).
  - Depends on: T093
- [ ] T101 (AC-095) Update every tile that uses or is limited by a marking, on every page tab
  - Files: `packages/web/src/dashboard/markings/store.ts`, `packages/web/src/dashboard/markings/propagation.test.ts`
  - Failing test: `propagation.test.ts`: after a marking change, a tile on a different page tab shows the new state when that tab is opened (AC-095).
  - Depends on: T093
- [ ] T102 (AC-096) Draw marked items with a marking-coloured outline and fade unmarked ones
  - Files: `packages/charts/src/marking/render.ts`, `packages/charts/src/marking/render.test.ts`
  - Failing test: `render.test.ts`: marked items carry their own colour plus the marking's outline and unmarked items render faded, on every chart type that marks (AC-096).
  - Depends on: T101
- [ ] T103 (AC-097) Draw partial marking as a baseline share for additive measures and a pattern otherwise
  - Files: `packages/charts/src/marking/partial.ts`, `packages/charts/src/marking/partial.test.ts`
  - Failing test: `partial.test.ts`: a partly marked sum renders the marked share from the baseline at full strength with the remainder faded, and a partly marked average or distinct count renders whole with a decal and both values in its tooltip (AC-097).
  - Depends on: T102
- [ ] T104 (AC-098) Convey marking state beyond colour with tile badges and marking chips
  - Files: `packages/web/src/dashboard/markings/{MarkBadge,MarkChip}.tsx`, `packages/web/src/dashboard/markings/MarkBadge.test.tsx`
  - Failing test: `MarkBadge.test.tsx`: every tile using a non-empty marking shows a badge naming it and the marked-item count, and every non-empty marking shows a chip naming it and summarising its values (AC-098).
  - Depends on: T102
- [ ] T105 (AC-099) Keep every marking colour clear of the categorical palette under normal and CVD vision
  - Files: `packages/ui/src/tokens.ts`, `packages/ui/src/audit/markingPalette.test.ts`
  - Failing test: `markingPalette.test.ts`: the validator reports every marking colour at ΔE ≥ 15 from each series colour under normal vision and ΔE ≥ 8 under protan and deutan simulation, in both themes (AC-099).
  - Depends on: T002, T102
- [ ] T106 (AC-100) Mark from the keyboard on a focused tile
  - Files: `packages/charts/src/interaction/keyboardMarking.ts`, `packages/charts/src/interaction/keyboardMarking.test.ts`
  - Failing test: `keyboardMarking.test.ts`: arrow keys move between items without changing the marking, Space marks the focused item, Ctrl/⌘+Space toggles it and Shift+arrows extend the marking (AC-100).
  - Depends on: T102
- [ ] T107 (AC-101) Announce marking changes in a polite live region
  - Files: `packages/web/src/dashboard/markings/LiveRegion.tsx`, `packages/web/src/dashboard/markings/LiveRegion.test.tsx`
  - Failing test: `LiveRegion.test.tsx`: each marking change announces the marking's name, the number of marked items and the source tile (AC-101).
  - Depends on: T101
- [ ] T108 (AC-102) Refuse items past the 1,000-item limit, exempting "Mark all"
  - Files: `packages/core/src/markings/limit.ts`, `packages/core/src/markings/limit.test.ts`
  - Failing test: `limit.test.ts`: adding past 1,000 items is refused with an explanation, while "Mark all" succeeds because it stores the tile's filter rather than a list (AC-102).
  - Depends on: T092
- [ ] T109 (AC-103) Label a tile as not linked when it cannot resolve a marking's members
  - Files: `packages/core/src/markings/applicability.ts`, `packages/core/src/markings/applicability.test.ts`
  - Failing test: `applicability.test.ts`: when a tile's cube or view cannot resolve a predicate member, the tile renders unmarked with a "not linked" label and no query error; join-path applicability is checked with `/v1/dry-run` (AC-103).
  - Depends on: T101
- [ ] T110 (AC-104) Obtain the marked share with one extra query per tile and keep the base result cached
  - Files: `packages/web/src/query/markedShare.ts`, `packages/web/src/query/markedShare.test.ts`
  - Failing test: `markedShare.test.ts`: a marking change issues at most one additional query per tile and does not re-fetch the base result (AC-104).
  - Depends on: T012, T103
- [ ] T111 (AC-105) Canonicalise the query so an identical marking produces identical query JSON
  - Files: `packages/core/src/query/canonical.ts`, `packages/core/src/query/canonical.test.ts`
  - Failing test: `canonical.test.ts`: two markings covering the same set, built in different orders, serialise to byte-identical query JSON and the same cache key (AC-105).
  - Depends on: T110
- [ ] T112 (AC-106) Select a tile on click in edit mode and change no marking
  - Files: `packages/web/src/dashboard/grid/Canvas.tsx`, `packages/web/src/dashboard/edit/editModeClick.test.ts`
  - Failing test: `editModeClick.test.ts`: clicking a chart in edit mode selects the tile and leaves every marking unchanged (AC-106).
  - Depends on: T093, T060

## F11. Details tiles and marked-rows actions

- [ ] T113 (AC-107) Limit a tile by markings, combined as AND or OR, skipping empty markings
  - Files: `packages/core/src/markings/limit-by.ts`, `packages/core/src/markings/limit-by.test.ts`
  - Failing test: `limit-by.test.ts`: two limiting markings with one empty return the rows of the non-empty one, and OR returns the union where AND returns the intersection (AC-107).
  - Depends on: T092
- [ ] T114 (AC-108) Prevent a tile from being limited by the marking it marks with, and say why
  - Files: `packages/web/src/dashboard/settings/TileLimits.tsx`, `packages/web/src/dashboard/settings/TileLimits.test.tsx`
  - Failing test: `TileLimits.test.tsx`: the tile's own marking is not selectable as a limit and the reason is shown where the option appears (AC-108).
  - Depends on: T113
- [ ] T115 (AC-109) Show the configured nothing-marked state when every limiting marking is empty
  - Files: `packages/web/src/dashboard/tiles/NothingMarked.tsx`, `packages/web/src/dashboard/tiles/NothingMarked.test.tsx`
  - Failing test: `NothingMarked.test.tsx`: each of all data, empty visualization and message renders exactly as set on the tile (AC-109).
  - Depends on: T113
- [ ] T116 (AC-110) Default a newly limited tile to the message state, pre-filled with the marking tiles' names
  - Files: `packages/web/src/dashboard/settings/TileLimits.tsx`, `packages/web/src/dashboard/settings/nothingMarkedDefault.test.ts`
  - Failing test: `nothingMarkedDefault.test.ts`: limiting a tile for the first time sets the message option and fills the message with the names of the tiles that mark with those markings (AC-110).
  - Depends on: T115
- [ ] T117 (AC-111) Say the marked items are hidden by the filters instead of showing the nothing-marked state
  - Files: `packages/web/src/dashboard/tiles/NothingMarked.tsx`, `packages/web/src/dashboard/tiles/hiddenByFilters.test.ts`
  - Failing test: `hiddenByFilters.test.ts`: a non-empty limiting marking whose items the filters exclude renders the "hidden by filters" message, not the nothing-marked state (AC-111).
  - Depends on: T115, T088
- [ ] T118 (AC-112) Create a details tile limited by the source tile's marking
  - Files: `packages/web/src/dashboard/tiles/createDetails.ts`, `packages/web/src/dashboard/tiles/createDetails.test.ts`
  - Failing test: `createDetails.test.ts`: the new tile is limited by that marking and carries a pre-filled nothing-marked message (AC-112).
  - Depends on: T116
- [ ] T119 (AC-113) Turn a marking into a removable filter, or its negation, and clear the marking
  - Files: `packages/web/src/dashboard/markings/filterToMarked.ts`, `packages/web/src/dashboard/markings/filterToMarked.test.ts`
  - Failing test: `filterToMarked.test.ts`: "Filter to marked" creates a removable dashboard filter whose rows equal the marked rows, "Filter out marked" its negation, and both clear the marking (AC-113).
  - Depends on: T086, T113
- [ ] T120 (AC-114) Show the rows behind the marked items, with a total and an export
  - Files: `packages/web/src/dashboard/markings/MarkedRows.tsx`, `packages/web/src/dashboard/markings/MarkedRows.test.tsx`
  - Failing test: `MarkedRows.test.tsx`: the rows match the marking, the total row count is stated, and an export is offered (AC-114).
  - Depends on: T113, T041
- [ ] T121 (AC-115) Invert a marking, or mark all, on one tile without disturbing other tiles' contributions
  - Files: `packages/core/src/markings/apply.ts`, `packages/core/src/markings/invert.test.ts`
  - Failing test: `invert.test.ts`: Invert marks exactly the tile's unmarked items, Mark all marks every visible item, and neither changes other tiles' contributions to that marking (AC-115).
  - Depends on: T108
- [ ] T122 (AC-116) Render marking and measure tokens in text tiles
  - Files: `packages/web/src/dashboard/tiles/TextTokens.ts`, `packages/web/src/dashboard/tiles/TextTokens.test.ts`
  - Failing test: `TextTokens.test.ts`: a marking token renders the summary or count, and a measure token limited by a marking shows the measure over the marked rows, or over all data when nothing is marked (AC-116).
  - Depends on: T113

## F12. Cross-filtering and cross-highlighting

- [ ] T123 (AC-117) Apply the configured action for each source and target pair
  - Files: `packages/web/src/dashboard/crossfilter/apply.ts`, `packages/web/src/dashboard/crossfilter/apply.test.ts`
  - Failing test: `apply.test.ts`: a pair set to Filter filters the target, one set to Highlight highlights it, and one set to None leaves it unchanged (AC-117).
  - Depends on: T076, T084
- [ ] T124 (AC-118) Apply and display the dashboard's default pair action
  - Files: `packages/web/src/dashboard/settings/CrossFilterMatrix.tsx`, `packages/web/src/dashboard/crossfilter/defaults.test.ts`
  - Failing test: `defaults.test.ts`: an unset pair behaves as the stated default, and the settings page shows that default (AC-118).
  - Depends on: T123
- [ ] T125 (AC-119) Show a cross-filter chip and clear it on dismiss or Escape
  - Files: `packages/web/src/dashboard/crossfilter/CrossFilterChip.tsx`, `packages/web/src/dashboard/crossfilter/CrossFilterChip.test.tsx`
  - Failing test: `CrossFilterChip.test.tsx`: the chip names the member, the value and the source tile, and dismissing it or pressing Escape leaves no tile filtered (AC-119).
  - Depends on: T123
- [ ] T126 (AC-120) Offer no marking affordances in cross-filter mode
  - Files: `packages/web/src/dashboard/DashboardView.tsx`, `e2e/crossfilter-mode.spec.ts`
  - Failing test: `e2e/crossfilter-mode.spec.ts`: in cross-filter mode no marking control, chip or badge appears anywhere in the dashboard (AC-120).
  - Depends on: T123, T104

## F13. Bookmarks and shareable links

- [ ] T127 (AC-121) Save a bookmark holding the page tab, filter values and current marks
  - Files: `packages/api/src/repos/bookmarks.ts`, `packages/web/src/dashboard/bookmarks/SaveBookmark.tsx`, `packages/api/src/repos/bookmarks.test.ts`
  - Failing test: `bookmarks.test.ts`: the stored bookmark carries the tab, every filter value and the mark set, under the given name (AC-121).
  - Depends on: T087, T101
- [ ] T128 (AC-122) Apply a bookmark without changing the dashboard's saved definition
  - Files: `packages/web/src/dashboard/bookmarks/applyBookmark.ts`, `packages/web/src/dashboard/bookmarks/applyBookmark.test.ts`
  - Failing test: `applyBookmark.test.ts`: applying restores the state and leaves the stored dashboard definition byte-identical (AC-122).
  - Depends on: T127
- [ ] T129 (AC-123) Produce a link that reproduces the current filters and marks
  - Files: `packages/web/src/dashboard/markings/shareLink.ts`, `packages/web/src/dashboard/markings/shareLink.test.ts`
  - Failing test: `shareLink.test.ts`: opening the copied URL reproduces the same filters and the same marks (AC-123).
  - Depends on: T087, T101
- [ ] T130 (AC-124) Open a dashboard with no marks when no bookmark or link parameters are given
  - Files: `packages/web/src/dashboard/DashboardView.tsx`, `packages/web/src/dashboard/openEmpty.test.ts`
  - Failing test: `openEmpty.test.ts`: a plain open leaves every marking empty (AC-124).
  - Depends on: T129
- [ ] T131 (AC-125) Save marking definitions with the dashboard and never the marked items
  - Files: `packages/api/src/repos/dashboards.ts`, `packages/api/src/repos/markingPersistence.test.ts`
  - Failing test: `markingPersistence.test.ts`: names, colours, the default, tile assignments and limits persist, and reopening restores no marked items (AC-125).
  - Depends on: T071, T090

## F14. Chart ownership: local and library charts

- [ ] T132 (AC-126) Keep a dashboard-created chart local, out of folders and search
  - Files: `packages/api/src/repos/charts.ts`, `packages/api/src/repos/ownership.test.ts`
  - Failing test: `ownership.test.ts`: a chart created on a dashboard appears in no folder listing and in no search result (AC-126).
  - Depends on: T017
- [ ] T133 (AC-127) Save a local chart to a folder as a library chart, naming where it went
  - Files: `packages/web/src/editor/SaveToFolder.tsx`, `packages/web/src/editor/SaveToFolder.test.tsx`
  - Failing test: `SaveToFolder.test.tsx`: the chart becomes reusable by other dashboards and the confirmation names the folder (AC-127).
  - Depends on: T132
- [ ] T134 (AC-128) State that a library chart is shared and on how many dashboards, and offer a local copy
  - Files: `packages/web/src/editor/SharedChartNotice.tsx`, `packages/web/src/editor/SharedChartNotice.test.tsx`
  - Failing test: `SharedChartNotice.test.tsx`: opening a library chart used by more than one dashboard shows the shared indication with the count and a "make a local copy" action (AC-128).
  - Depends on: T133
- [ ] T135 (AC-129) Repoint the tile to a local copy, keeping edits and leaving the shared chart untouched
  - Files: `packages/web/src/editor/detach.ts`, `packages/web/src/editor/detach.test.ts`
  - Failing test: `detach.test.ts`: after detaching, the tile uses the copy with the edits made so far, and the shared chart is unchanged (AC-129).
  - Depends on: T134
- [ ] T136 (AC-130) Change no other dashboard when a local chart is edited
  - Files: `packages/web/src/editor/applyChanges.ts`, `e2e/local-chart-isolation.spec.ts`
  - Failing test: `e2e/local-chart-isolation.spec.ts`: editing a local chart leaves a second dashboard's rendering unchanged (AC-130).
  - Depends on: T132

## F15. Model editor (Cube YAML)

- [ ] T137 (AC-131) List model files and the objects each defines
  - Files: `packages/web/src/workspaces/model/FileList.tsx`, `packages/api/src/routes/model.ts`, `packages/web/src/workspaces/model/FileList.test.tsx`
  - Failing test: `FileList.test.tsx`: every cube, view, measure, dimension, segment, hierarchy, join and pre-aggregation a file defines is listed under it (AC-131).
  - Depends on: T010
- [ ] T138 (AC-132) Generate a form for every key Cube's validator accepts, with the validator's own enumerations
  - Files: `packages/web/src/workspaces/model/form/{schema,CubeForm}.tsx`, `packages/web/src/workspaces/model/form/schema.test.ts`
  - Failing test: `schema.test.ts`: every accepted key on a cube or view has a field, and each enumeration offers exactly the validator's allowed values (AC-132).
  - Depends on: T137
- [ ] T139 (AC-133) Synchronise the form and the YAML view in both directions
  - Files: `packages/web/src/workspaces/model/{YamlEditor,sync}.tsx`, `packages/web/src/workspaces/model/sync.test.ts`
  - Failing test: `sync.test.ts`: a form edit updates the YAML within one render, and a valid YAML edit updates the form within 500 ms (AC-133). Monaco is driven as a controlled editor per `docs/research/code-editor.md`; parsing uses `yaml` with Cube's own options.
  - Depends on: T138
- [ ] T140 (AC-134) Warn and name what a code-to-form switch would lose
  - Files: `packages/web/src/workspaces/model/lossCheck.ts`, `packages/web/src/workspaces/model/lossCheck.test.ts`
  - Failing test: `lossCheck.test.ts`: a file with comments and anchors produces a warning naming each before the change is applied, and no comment disappears silently (AC-134).
  - Depends on: T139
- [ ] T141 (AC-135) List parse problems with file and line, and hold the form read-only until it parses
  - Files: `packages/web/src/workspaces/model/Problems.tsx`, `packages/web/src/workspaces/model/problems.test.ts`
  - Failing test: `problems.test.ts`: unparseable YAML lists each problem with its file and line and the form is not editable; a parsing file re-enables it (AC-135).
  - Depends on: T139
- [ ] T142 (AC-136) Validate against Cube before publishing and refuse what Cube rejects
  - Files: `packages/api/src/routes/model.ts`, `packages/api/src/model/validate.ts`, `packages/api/src/model/validate.test.ts`
  - Failing test: `validate.test.ts`: an invalid model is not published and Cube's error is attributed to the file it came from (AC-136).
  - Depends on: T141
- [ ] T143 (AC-137) Make published members available to the chart builder without restarting Cube
  - Files: `packages/api/src/cube/meta-cache.ts`, `e2e/publish-model.spec.ts`
  - Failing test: `e2e/publish-model.spec.ts`: after publishing, the new member appears in the chart builder's field list once Cube reports the new schema version, with no restart (AC-137).
  - Depends on: T142, T024
- [ ] T144 (AC-138) Show the join graph and add a join from the editor
  - Files: `packages/web/src/workspaces/model/JoinEditor.tsx`, `packages/web/src/workspaces/model/JoinEditor.test.tsx`
  - Failing test: `JoinEditor.test.tsx`: every declared join appears with the direction the model declares, and adding one takes a target cube, a relationship and a condition (AC-138).
  - Depends on: T138
- [ ] T145 (AC-139) Generate cubes from a data source's tables
  - Files: `packages/api/src/model/generate.ts`, `packages/web/src/workspaces/model/GenerateCubes.tsx`, `packages/api/src/model/generate.test.ts`
  - Failing test: `generate.test.ts`: each selected table produces a cube whose columns map to dimensions plus a count measure, and any dropped column is reported (AC-139).
  - Depends on: T142, T165
- [ ] T146 (AC-140) Open Jinja, Python and JavaScript model files read-only with a reason
  - Files: `packages/web/src/workspaces/model/dynamicFiles.ts`, `packages/web/src/workspaces/model/dynamicFiles.test.ts`
  - Failing test: `dynamicFiles.test.ts`: a file containing `{{`, `{%` or `{#`, or a `.py`/`.js` model file, opens read-only in the code view with a stated reason and no editable form (AC-140).
  - Depends on: T139
- [ ] T147 (AC-141) List the charts and dashboards that reference a member before saving an edit to it
  - Files: `packages/api/src/model/references.ts`, `packages/api/src/model/references.test.ts`
  - Failing test: `references.test.ts`: editing a member lists every chart and dashboard referencing it before the save proceeds (AC-141).
  - Depends on: T142

## F16. Pre-aggregations

- [ ] T148 (AC-142) List each rollup with its full definition
  - Files: `packages/web/src/workspaces/model/preagg/RollupList.tsx`, `packages/web/src/workspaces/model/preagg/RollupList.test.tsx`
  - Failing test: `RollupList.test.tsx`: every declared rollup appears with its measures, dimensions, time dimension, granularity, partition granularity and indexes (AC-142).
  - Depends on: T137
- [ ] T149 (AC-143) Write a rollup edited in the form back into the model file
  - Files: `packages/web/src/workspaces/model/preagg/RollupForm.tsx`, `packages/api/src/model/writeRollup.ts`, `packages/api/src/model/writeRollup.test.ts`
  - Failing test: `writeRollup.test.ts`: the edit appears as YAML in the model file and goes through the same validation and publishing path as any model change (AC-143).
  - Depends on: T142, T148
- [ ] T150 (AC-144) Say whether a chart's query matches a pre-aggregation, and name the member that prevents it
  - Files: `packages/web/src/editor/AccelerationPanel.tsx`, `packages/api/src/cube/preaggMatch.ts`, `packages/api/src/cube/preaggMatch.test.ts`
  - Failing test: `preaggMatch.test.ts`: a matching query reports the rollup Cube actually uses, and a non-matching one names the member that blocks the match (AC-144).
  - Depends on: T014, T148
- [ ] T151 (AC-145) List a rollup's partitions and rebuild the selected ones
  - Files: `packages/web/src/workspaces/model/preagg/Partitions.tsx`, `packages/api/src/routes/preagg.ts`, `packages/api/src/routes/partitions.test.ts`
  - Failing test: `partitions.test.ts`: every partition is listed with its build state and last build time, and a rebuild targets exactly the selected partitions (AC-145).
  - Depends on: T148
- [ ] T152 (AC-146) Define an index with ordered columns and an aggregate flag
  - Files: `packages/web/src/workspaces/model/preagg/IndexEditor.tsx`, `packages/web/src/workspaces/model/preagg/IndexEditor.test.tsx`
  - Failing test: `IndexEditor.test.tsx`: column order can be changed and is preserved in the written YAML, and an aggregate index is written as `type: aggregate` (AC-146).
  - Depends on: T149
- [ ] T153 (AC-147) Warn on a chart that would fail under rollup-only mode
  - Files: `packages/web/src/editor/AccelerationPanel.tsx`, `packages/api/src/cube/rollupOnly.test.ts`
  - Failing test: `rollupOnly.test.ts`: a chart whose query has no matching rollup carries a warning that it depends on the source database (AC-147).
  - Depends on: T150
- [ ] T154 (AC-148) Refresh a chart past wechart's cached result and show the new data-as-of time
  - Files: `packages/web/src/tiles/refresh.ts`, `packages/web/src/tiles/refresh.test.ts`
  - Failing test: `refresh.test.ts`: "Refresh now" re-queries Cube bypassing the cached result and the displayed as-of time advances (AC-148).
  - Depends on: T012, T014

## F17. Jobs, builds and scheduling

- [ ] T155 (AC-149) Start a build, show its token, and poll to a terminal state
  - Files: `packages/api/src/jobs/build.ts`, `packages/web/src/workspaces/jobs/BuildPanel.tsx`, `packages/api/src/jobs/build.test.ts`
  - Failing test: `build.test.ts`: the job token is shown and polling reports done, missing partition, failure or not found (AC-149).
  - Depends on: T015, T151
- [ ] T156 (AC-150) Keep build history in wechart beyond Cube's 24-hour window
  - Files: `packages/api/src/repos/build-history.ts`, `packages/api/src/repos/build-history.test.ts`
  - Failing test: `build-history.test.ts`: a build recorded more than 24 hours ago is still listed with its target, partitions, duration, outcome and log (AC-150).
  - Depends on: T155
- [ ] T157 (AC-151) Show the build queue and cancel a queued entry
  - Files: `packages/web/src/workspaces/jobs/BuildQueue.tsx`, `packages/api/src/routes/jobs.ts`, `packages/api/src/jobs/queue.test.ts`
  - Failing test: `queue.test.ts`: every queued build appears with its pre-aggregation, partition, state and token, and cancelling removes it from the queue (AC-151).
  - Depends on: T155
- [ ] T158 (AC-152) Pair every job and schedule state with an icon and a text label
  - Files: `packages/web/src/workspaces/jobs/StateBadge.tsx`, `packages/web/src/workspaces/jobs/StateBadge.test.tsx`
  - Failing test: `StateBadge.test.tsx`: every job and schedule state renders an icon and a text label, and none is conveyed by colour alone (AC-152).
  - Depends on: T157
- [ ] T159 (AC-153) Create a cron schedule, show the next runs and run it at those times
  - Files: `packages/api/src/scheduler/{schedules,worker}.ts`, `packages/web/src/workspaces/schedules/ScheduleForm.tsx`, `packages/api/src/scheduler/schedules.test.ts`
  - Failing test: `schedules.test.ts`: the next runs shown match the cron expression, and with a fake clock a due run starts (AC-153). Runs on pg-boss per `docs/research/scheduler.md`.
  - Depends on: T155
- [ ] T160 (AC-154) Label each schedule's owner and show Cube-owned schedules as read-only
  - Files: `packages/web/src/workspaces/schedules/ScheduleList.tsx`, `packages/web/src/workspaces/schedules/ownership.test.ts`
  - Failing test: `ownership.test.ts`: a `refresh_key` schedule is labelled as Cube's and is not editable, and a wechart schedule is labelled and editable (AC-154).
  - Depends on: T159
- [ ] T161 (AC-155) Suspend a repeatedly failing schedule and offer Resume
  - Files: `packages/api/src/scheduler/suspend.ts`, `packages/api/src/scheduler/suspend.test.ts`
  - Failing test: `suspend.test.ts`: after the configured number of consecutive failures the schedule stops running, says so, and a Resume action restarts it (AC-155).
  - Depends on: T159
- [ ] T162 (AC-156) Show the refresh worker's state and the Cube deployment's health
  - Files: `packages/web/src/workspaces/jobs/Health.tsx`, `packages/api/src/cube/health.ts`, `packages/api/src/cube/health.test.ts`
  - Failing test: `health.test.ts`: an unhealthy reply from Cube's health endpoint marks the deployment down, and the refresh worker's state is shown (AC-156).
  - Depends on: T158

## F18. Data sources and connections

- [ ] T163 (AC-157) List every data source with its driver, health and assigned cubes
  - Files: `packages/web/src/workspaces/sources/SourceList.tsx`, `packages/api/src/routes/sources.ts`, `packages/web/src/workspaces/sources/SourceList.test.tsx`
  - Failing test: `SourceList.test.tsx`: every configured source is listed with its driver type, the health from its last test, and the cubes the model assigns to it (AC-157).
  - Depends on: T005, T137
- [ ] T164 (AC-158) Gate creating a data source on a passing test, or an explicit override
  - Files: `packages/web/src/workspaces/sources/AddSourceWizard.tsx`, `packages/web/src/workspaces/sources/AddSourceWizard.test.tsx`
  - Failing test: `AddSourceWizard.test.tsx`: the wizard takes driver type, connection fields, a Test step and a name, and refuses to create the source while the test fails unless the user overrides explicitly (AC-158).
  - Depends on: T163, T165
- [ ] T165 (AC-159) Run connection tests from the service and show each check with the driver's error text
  - Files: `packages/api/src/sources/test.ts`, `packages/api/src/sources/test.test.ts`
  - Failing test: `test.test.ts`: the test executes in the service, each check reports its own result, and a failing check carries the driver's error text (AC-159).
  - Depends on: T163
- [ ] T166 (AC-160) Offer the six driver types with their own authentication fields
  - Files: `packages/web/src/workspaces/sources/drivers/*.ts`, `packages/web/src/workspaces/sources/drivers/drivers.test.ts`
  - Failing test: `drivers.test.ts`: PostgreSQL, Snowflake, Databricks, BigQuery, SQL Server and Oracle are each offered, and each form covers every authentication method that driver requires (AC-160).
  - Depends on: T164
- [ ] T167 (AC-161) Say that Cube must restart, and show whether it has picked the settings up
  - Files: `packages/web/src/workspaces/sources/RestartNotice.tsx`, `packages/api/src/sources/appliedState.test.ts`
  - Failing test: `appliedState.test.ts`: after a connection change the UI reports a restart is required and reports "not yet applied" while Cube still uses the previous settings (AC-161).
  - Depends on: T164
- [ ] T168 (AC-162) Write `data_source` into a cube's model file when it is assigned
  - Files: `packages/api/src/model/assignSource.ts`, `packages/api/src/model/assignSource.test.ts`
  - Failing test: `assignSource.test.ts`: assigning a cube writes `data_source` into that cube's YAML, not only into wechart's database (AC-162).
  - Depends on: T149, T163
- [ ] T169 (AC-163) Record connection test results over time and show the history per source
  - Files: `packages/api/src/repos/source-tests.ts`, `packages/api/src/repos/source-tests.test.ts`
  - Failing test: `source-tests.test.ts`: every test result is retained and listed under its source (AC-163).
  - Depends on: T165
- [ ] T170 (AC-164) Never show a saved credential or send it to the browser
  - Files: `packages/api/src/sources/secrets.ts`, `packages/api/src/sources/secrets.test.ts`, `e2e/no-secret-leak.spec.ts`
  - Failing test: `secrets.test.ts`: a saved secret is never returned by any API response; `e2e/no-secret-leak.spec.ts`: no rendered field or network payload contains it (AC-164).
  - Depends on: T164

## F19. Security: policies and context preview

- [ ] T171 (AC-165) List every access policy as declared
  - Files: `packages/web/src/workspaces/security/PolicyList.tsx`, `packages/api/src/routes/security.ts`, `packages/web/src/workspaces/security/PolicyList.test.tsx`
  - Failing test: `PolicyList.test.tsx`: every policy appears with its role, member-level rules, row-level filters, conditions and masking, as the model declares them (AC-165).
  - Depends on: T005, T137
- [ ] T172 (AC-166) Preview a dashboard under an edited security context, with a persistent banner
  - Files: `packages/web/src/workspaces/security/ContextPreview.tsx`, `packages/api/src/cube/security-context.ts`, `e2e/context-preview.spec.ts`
  - Failing test: `e2e/context-preview.spec.ts`: the dashboard's queries carry the edited context and a persistent banner names the context in effect (AC-166).
  - Depends on: T171, T023
- [ ] T173 (AC-167) Show a tile as unavailable to the context when the context hides a member it uses
  - Files: `packages/web/src/tiles/TileUnavailable.tsx`, `packages/web/src/tiles/TileUnavailable.test.tsx`
  - Failing test: `TileUnavailable.test.tsx`: a member hidden by the previewed context renders the unavailable state rather than a raw Cube error (AC-167).
  - Depends on: T172
- [ ] T174 (AC-168) Show the generated SQL and the effective filters under the previewed context
  - Files: `packages/web/src/workspaces/security/GeneratedSql.tsx`, `packages/web/src/workspaces/security/GeneratedSql.test.tsx`
  - Failing test: `GeneratedSql.test.tsx`: the SQL shown includes the row-level filters the policy adds, and the effective filters are listed beside it (AC-168). Rendered read-only in Monaco.
  - Depends on: T172
- [ ] T175 (AC-169) Warn persistently when Cube would accept unauthenticated requests
  - Files: `packages/api/src/cube/authCheck.ts`, `packages/web/src/workspaces/security/AuthWarning.tsx`, `packages/api/src/cube/authCheck.test.ts`
  - Failing test: `authCheck.test.ts`: when an unauthenticated probe succeeds, the Security workspace shows a persistent warning (AC-169).
  - Depends on: T171
- [ ] T176 (AC-170) Show the configured context's API scopes and mark screens whose scope is missing
  - Files: `packages/web/src/workspaces/security/Scopes.tsx`, `packages/web/src/workspaces/security/scopes.test.ts`
  - Failing test: `scopes.test.ts`: the granted scopes are listed, and a screen whose scope is absent reports it as unavailable instead of failing with an error (AC-170).
  - Depends on: T171

## F20. Export

- [ ] T177 (AC-171) Export a CSV matching what the tile shows
  - Files: `packages/core/src/export/csv.ts`, `packages/core/src/export/csv.test.ts`
  - Failing test: `csv.test.ts`: the CSV's rows and columns equal the tile's, with the applied filters and marking limits, for both a chart and a marked-rows view (AC-171).
  - Depends on: T120
- [ ] T178 (AC-172) State the exported row count and that a result was truncated
  - Files: `packages/core/src/export/csv.ts`, `packages/core/src/export/truncation.test.ts`
  - Failing test: `truncation.test.ts`: an export past Cube's row limit reports how many rows were written and that it is truncated (AC-172).
  - Depends on: T177
- [ ] T179 (AC-173) Export formatted values alongside raw numerics for measures
  - Files: `packages/core/src/export/csv.ts`, `packages/core/src/export/format.test.ts`
  - Failing test: `format.test.ts`: values carry their member formats and every measure also appears as a raw number (AC-173).
  - Depends on: T177, T052

## F21. Performance, accessibility and design conformance

- [ ] T180 (AC-174) Meet the 3-second p95 for opening a 10-chart dashboard
  - Files: `e2e/perf/dashboard-open.spec.ts`, `packages/api/src/repos/query-log.ts`
  - Failing test: `e2e/perf/dashboard-open.spec.ts`: over a repeated run against live warehouse data, the p95 time to render all ten tiles, taken from wechart's own query timings, is under 3 s (AC-174).
  - Depends on: T015, T023
- [ ] T181 (AC-175) Meet the 3-second p95 for a marking change on a 10-chart dashboard
  - Files: `e2e/perf/marking-update.spec.ts`, `packages/web/src/query/concurrency.ts`
  - Failing test: `e2e/perf/marking-update.spec.ts`: the p95 time to update every affected tile after a marking change is under 3 s (AC-175). The client-side concurrency bound is set here against Cube's queue concurrency.
  - Depends on: T110, T180
- [ ] T182 (AC-176) Make every action keyboard-reachable with a focus indicator distinct from the marking outline
  - Files: `packages/ui/src/focus.css.ts`, `packages/web/src/workspaces/model/YamlEditor.tsx`, `e2e/keyboard-coverage.spec.ts`
  - Failing test: `e2e/keyboard-coverage.spec.ts`: navigation, authoring, marking, filtering and every dialog are reachable from the keyboard, focus is visible on every control and is visually distinct from the marking outline, and the code editor shows its Tab-escape hint so it is not a keyboard trap (AC-176).
  - Depends on: T063, T106, T139
- [ ] T183 (AC-177) Pair every status, validation and job state with an icon and a text label
  - Files: `packages/ui/src/StatusBadge.tsx`, `e2e/status-labels.spec.ts`
  - Failing test: `e2e/status-labels.spec.ts`: across every workspace, no status, validation or job state is conveyed by colour alone (AC-177).
  - Depends on: T158
- [ ] T184 (AC-179) Render dashboards, the chart editor and the model editor without horizontal scrolling at 1,280 px
  - Files: `packages/web/src/**/*.css.ts`, `e2e/no-horizontal-scroll.spec.ts`
  - Failing test: `e2e/no-horizontal-scroll.spec.ts`: at a 1,280 px viewport none of the three surfaces scrolls horizontally (AC-179).
  - Depends on: T023, T032, T139
- [ ] T185 (AC-180) Run the acceptance suite in Chrome, Edge, Firefox and Safari against the built app
  - Files: `playwright.config.ts`, `.github/workflows/ci.yml`, `e2e/**`
  - Failing test: the full `e2e/` suite passes in all four desktop browsers (AC-180).
  - Depends on: T184
  - Note: two gaps to close here, both recorded at T001. **Edge** only runs where the `msedge` channel is installed and `CI` is set, so AC-180 is demonstrated by the CI run, not by a local one — do not tick AC-180 from a local three-browser pass. **Safari** is covered by Playwright's bundled WebKit, not by the shipped Safari; `docs/research/test-stack.md` records that as a residual gap against "current Safari". Switch the `webServer` from `vite dev` to `vite preview` over a real build first, so the suite exercises the artifact users receive rather than the dev server.

---

## Coverage: acceptance criterion → task

| AC     | Task       | AC     | Task | AC     | Task | AC     | Task       |
| ------ | ---------- | ------ | ---- | ------ | ---- | ------ | ---------- |
| AC-001 | T005       | AC-046 | T052 | AC-091 | T097 | AC-136 | T142       |
| AC-002 | T006       | AC-047 | T053 | AC-092 | T098 | AC-137 | T143       |
| AC-003 | T007, T016 | AC-048 | T055 | AC-093 | T099 | AC-138 | T144       |
| AC-004 | T002, T008 | AC-049 | T054 | AC-094 | T100 | AC-139 | T145       |
| AC-005 | T002, T008 | AC-050 | T056 | AC-095 | T101 | AC-140 | T146       |
| AC-006 | T009       | AC-051 | T057 | AC-096 | T102 | AC-141 | T147       |
| AC-007 | T004, T024 | AC-052 | T058 | AC-097 | T103 | AC-142 | T148       |
| AC-008 | T004       | AC-053 | T059 | AC-098 | T104 | AC-143 | T149       |
| AC-009 | T010       | AC-054 | T060 | AC-099 | T105 | AC-144 | T150       |
| AC-010 | T011       | AC-055 | T061 | AC-100 | T106 | AC-145 | T151       |
| AC-011 | T012       | AC-056 | T062 | AC-101 | T107 | AC-146 | T152       |
| AC-012 | T013       | AC-057 | T063 | AC-102 | T108 | AC-147 | T153       |
| AC-013 | T014       | AC-058 | T064 | AC-103 | T109 | AC-148 | T154       |
| AC-014 | T003       | AC-059 | T065 | AC-104 | T110 | AC-149 | T155       |
| AC-015 | T003       | AC-060 | T066 | AC-105 | T111 | AC-150 | T156       |
| AC-016 | T015       | AC-061 | T067 | AC-106 | T112 | AC-151 | T157       |
| AC-017 | T016       | AC-062 | T068 | AC-107 | T113 | AC-152 | T158       |
| AC-018 | T023       | AC-063 | T069 | AC-108 | T114 | AC-153 | T159       |
| AC-019 | T017       | AC-064 | T070 | AC-109 | T115 | AC-154 | T160       |
| AC-020 | T018       | AC-065 | T071 | AC-110 | T116 | AC-155 | T161       |
| AC-021 | T019       | AC-066 | T072 | AC-111 | T117 | AC-156 | T162       |
| AC-022 | T020       | AC-067 | T073 | AC-112 | T118 | AC-157 | T163       |
| AC-023 | T021       | AC-068 | T074 | AC-113 | T119 | AC-158 | T164       |
| AC-024 | T022       | AC-069 | T075 | AC-114 | T120 | AC-159 | T165       |
| AC-025 | T024       | AC-070 | T076 | AC-115 | T121 | AC-160 | T166       |
| AC-026 | T025       | AC-071 | T077 | AC-116 | T122 | AC-161 | T167       |
| AC-027 | T026       | AC-072 | T078 | AC-117 | T123 | AC-162 | T168       |
| AC-028 | T028       | AC-073 | T079 | AC-118 | T124 | AC-163 | T169       |
| AC-029 | T029       | AC-074 | T080 | AC-119 | T125 | AC-164 | T170       |
| AC-030 | T027       | AC-075 | T081 | AC-120 | T126 | AC-165 | T171       |
| AC-031 | T027       | AC-076 | T082 | AC-121 | T127 | AC-166 | T172       |
| AC-032 | T030       | AC-077 | T083 | AC-122 | T128 | AC-167 | T173       |
| AC-033 | T031       | AC-078 | T084 | AC-123 | T129 | AC-168 | T174       |
| AC-034 | T032       | AC-079 | T085 | AC-124 | T130 | AC-169 | T175       |
| AC-035 | T033       | AC-080 | T086 | AC-125 | T131 | AC-170 | T176       |
| AC-036 | T034       | AC-081 | T087 | AC-126 | T132 | AC-171 | T177       |
| AC-037 | T035–T044  | AC-082 | T088 | AC-127 | T133 | AC-172 | T178       |
| AC-038 | T045       | AC-083 | T089 | AC-128 | T134 | AC-173 | T179       |
| AC-039 | T046       | AC-084 | T090 | AC-129 | T135 | AC-174 | T180       |
| AC-040 | T047       | AC-085 | T091 | AC-130 | T136 | AC-175 | T181       |
| AC-041 | T048       | AC-086 | T092 | AC-131 | T137 | AC-176 | T182       |
| AC-042 | T049       | AC-087 | T093 | AC-132 | T138 | AC-177 | T183       |
| AC-043 | T050       | AC-088 | T094 | AC-133 | T139 | AC-178 | T041       |
| AC-044 | T051       | AC-089 | T095 | AC-134 | T140 | AC-179 | T184       |
| AC-045 | T043       | AC-090 | T096 | AC-135 | T141 | AC-180 | T001, T185 |
