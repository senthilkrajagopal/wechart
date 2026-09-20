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

- [x] T016 (AC-017) Show the folder tree and the selected folder's contents
  - Files: `packages/web/src/workspaces/explore/{FolderTree,FolderContents}.tsx`, `packages/api/src/routes/folders.ts`, `packages/web/src/workspaces/explore/FolderContents.test.tsx`
  - Failing test: `FolderContents.test.tsx`: every dashboard and library chart in the folder is listed with its type, owner and last-updated time, and no column is blank for an item that has that value (AC-017).
  - Depends on: T003, T005
  - Done 2026-09-19. **AC-017 and AC-003 both ticked.** The scroll half of AC-003, deferred from T007, is now in `e2e/explore.spec.ts` against a seeded list of 34 items; it asserts the page really scrolled before asserting the offset survives, so it cannot pass on a page that never moved.
  - **AC-003 genuinely failed the first time.** Not because the theme switch lost the scroll — nothing unmounted, the document height and row count were identical — but because the top bar scrolled away, so clicking the theme control made the browser scroll it back into view. The fix is a sticky bar, which a workbench wants regardless: the switcher, search and theme stay reachable however far a surface has scrolled.
  - Columns for the listing are **generated** from `body` in Postgres rather than written beside it, so a rename cannot leave the listing stale; a test covers exactly that.
  - Two infrastructure changes this task forced: the API now builds with Vite and runs as its own process in `playwright.config.ts` (Node's `--experimental-strip-types` does no module resolution, so it wants an explicit `.ts` on every relative import); and **the tests now use their own database**. Sharing one with development let test fixtures into the catalog the app listed, and the dev seed then saw folders nobody had created and skipped itself.
- [x] T017 (AC-019) Search dashboards and library charts by title, excluding dashboard-local charts
  - Files: `packages/api/src/repos/catalog.ts`, `packages/api/src/repos/catalog.test.ts`, `packages/api/src/server.ts`, `packages/api/src/seed.ts`, `packages/web/src/shell/SearchPalette.tsx`, `e2e/search.spec.ts`
  - Failing test: `catalog.test.ts`: a substring match returns every library item whose title contains it and never a dashboard-local chart (AC-019).
  - Depends on: T016
  - Done 2026-09-19. AC-019 ticked. Search lives in the ⌘K palette T009 built, rather than a second search box.
  - **A test caught a real injection-shaped bug:** `%` and `_` are LIKE wildcards, so a search for "50%" matched everything containing "50". User input is now escaped, backslash first.
  - The seed contains a chart local to a dashboard, titled so it matches the same search as the library items — without it, the second half of this criterion could not fail. One e2e asserts it is excluded, and another asserts a similarly named *library* chart is found, so the exclusion is not just an empty result.
  - Note: one a11y-tokens case failed once during a cold run where the API was still building, and has passed in three consecutive full runs since. Not reproduced; worth watching rather than chasing.
- [x] T018 (AC-020) Create a folder, dashboard or chart into the selected folder and open it
  - Files: `packages/web/src/workspaces/explore/{CreateMenu,ExplorePage}.tsx`, `packages/api/src/server.ts`, `packages/api/src/server.test.ts`, `packages/api/src/{main,seed}.ts`, `packages/web/src/shell/styles.ts`, `playwright.config.ts`, `e2e/explore-create.spec.ts`
  - Failing test: `e2e/explore-create.spec.ts`: each new object lands in the selected folder and the app navigates to it (AC-020).
  - Depends on: T016
  - Done 2026-09-19. AC-020 ticked. Both halves are asserted every time — where the object landed *and* that the app went there. A folder "opens" by becoming the selection, since it has no page of its own.
  - The id is minted by the service, never accepted from the browser, so a client cannot overwrite an existing object by claiming its id. A test asserts a supplied id is ignored.
  - **The rendered audit earned its keep:** Safari renders an unstyled `<button>` at 11 px, below AC-004's floor. Only WebKit, only visible in a real browser, and it appeared the moment this task added buttons. Fixed with `font: inherit` on form controls.
  - Two test-infrastructure fixes: browser runs now reset the catalog to the seed (`WECHART_RESET_DATA`), because these tests create objects and later runs began matching leftovers; and the a11y audit waits for the app to mount and the network to settle, since under parallel load axe was auditing a frame rendered before the token stylesheet applied.
- [x] T019 (AC-021) Keep every reference working when a folder, dashboard or chart is renamed or moved
  - Files: `packages/api/src/repos/{documents,catalog}.ts`, `packages/api/src/repos/catalog.test.ts`, `packages/api/src/server.ts`, `packages/web/src/workspaces/explore/{FolderContents,ExplorePage}.tsx`, `e2e/explore-rename-move.spec.ts`
  - Failing test: `catalog.test.ts`: after moving a library chart, a dashboard that uses it still resolves it (AC-021); `e2e/explore-rename-move.spec.ts`: a reference captured before a rename or move still resolves after it.
  - Depends on: T016
  - Done 2026-09-19. AC-021 ticked. **The id never changes** — that is the whole mechanism. A dashboard points at a chart's id, not at its title or its folder, so a move is a change of one field and nothing referring to it has to be told. Each test follows a reference captured *before* the change.
  - The rendered "missing-chart state" in the criterion's `Fails when:` is re-verified once dashboards render library charts (T023 with F5); the reference layer is what exists to test today.
  - Browser tests here **create their own objects** rather than renaming seeded ones. Mutating shared fixtures made other spec files fail depending on the order they ran in — a real isolation bug in the tests, not in the product.
  - Two more WebKit-only type-size findings from the rendered audit, and they did not have the same answer: `<button>` and `<select>` were fixed with `font: inherit`; `<option>` **cannot be** — WebKit draws the popup with the system font and ignores author `font-size`. Recorded as a platform exception in direction.md §3, with the consequence that a dropdown whose list must meet the floor has to be a custom listbox.
- [x] T020 (AC-022) List the dashboards that use a library chart, and offer to add it to another
  - Files: `packages/web/src/workspaces/explore/LibraryChartPage.tsx`, `packages/web/src/router/routes.tsx`, `packages/api/src/repos/{documents,catalog}.ts`, `packages/api/src/repos/catalog.test.ts`, `packages/api/src/server.ts`, `e2e/library-chart.spec.ts`
  - Failing test: `catalog.test.ts` and `e2e/library-chart.spec.ts`: every dashboard containing the chart appears in the list and an "Add to dashboard" action is offered (AC-022).
  - Depends on: T019
  - Done 2026-09-19. AC-022 ticked. **"Every" is the word under test**, so the fixture has three dashboards using the chart and one that does not — a page that listed only the first would satisfy a laxer assertion, and so would one that listed every dashboard regardless.
  - Adding a chart twice leaves one reference, not two: a double click must not produce two copies of the same tile reference.
  - The reverse lookup is a jsonb containment query on `body -> 'charts'`, which is the same index-friendly shape AC-023 (delete confirmation) and AC-128 (shared-chart warning) both need.
- [x] T021 (AC-023) Name the dependent dashboards and require confirmation before deleting a library chart
  - Files: `packages/api/src/repos/documents.ts`, `packages/api/src/server.ts`, `packages/api/src/server.test.ts`, `packages/web/src/workspaces/explore/LibraryChartPage.tsx`, `e2e/chart-delete.spec.ts`
  - Failing test: `server.test.ts` and `e2e/chart-delete.spec.ts`: deletion is blocked until confirmation, and the dialog names each dashboard that uses the chart (AC-023).
  - Depends on: T020
  - Done 2026-09-19. AC-023 ticked. **The check is on the server, not only in the dialog.** An unconfirmed delete is refused with the list of dashboards, so the naming cannot be skipped by calling the API directly — there is a test that sends exactly the request a script would. A guard that lives only in the UI is decoration.
  - The dialog lists what the **server** returned rather than a list the browser assembled, so what the user confirms is what the server checked.
  - Dashboards are **named, not counted**: "2 dashboards use this chart" tells the user nothing about whether they care. `409` rather than `400` — nothing about the request is malformed, it conflicts with the current state.
- [x] T022 (AC-024) Navigate the Explore contents with the arrow keys and open with Enter
  - Files: `packages/web/src/workspaces/explore/FolderContents.tsx`, `packages/web/src/workspaces/explore/FolderContents.test.tsx`, `packages/web/src/shell/styles.ts`, `e2e/explore-keyboard.spec.ts`
  - Failing test: `FolderContents.test.tsx` and `e2e/explore-keyboard.spec.ts`: arrow keys move the selection through the listed items and Enter opens the selected one (AC-024).
  - Depends on: T016
  - Done 2026-09-19. AC-024 ticked. A **roving tabindex**, so the list is one stop in the page's tab order rather than one per row — with thirty dashboards, tabbing through every one to reach what follows is its own accessibility failure, and a test asserts exactly one row is tabbable at a time.
  - Selection is marked with `aria-selected` and a background, not the focus ring alone, so it stays visible when focus moves into a control inside the row. Arrow keys stop at the ends rather than wrapping.
  - A test asserts Enter opens **the selected row, not always the first** — the bug an implementation that ignores the index would have.
- [ ] T023 (AC-018, AC-039) Open a dashboard from Explore in view mode with its saved tabs, tiles and settings
  - Files: `packages/web/src/dashboard/DashboardView.tsx`, `packages/web/src/dashboard/DashboardView.test.tsx`
  - Failing test: `DashboardView.test.tsx`: a saved dashboard opens in view mode with every saved page tab, tile and setting present, and not in edit mode (AC-018); one colour assignment is shared by every tile, so a member looks the same in all of them (AC-039).
  - Depends on: T016, T071, T046
  - **Also ticks AC-039.** The colour mechanism is built and tested at T046, but the criterion is about "every tile of a dashboard" and this is the first place several tiles are rendered together. Share one assignment across them and assert a member matches in two tiles at once.

## F4. Chart builder and recommendation

- [x] T024 (AC-025, AC-007) List cubes, views and their members grouped by type
  - Files: `docker-compose.yml`, `infra/sample-db/init.sql`, `infra/cube/model/cubes/*.yml`, `packages/web/src/editor/{fields.ts,fields.test.ts,FieldList.tsx}`, `packages/web/src/router/routes.tsx`, `playwright.config.ts`, `e2e/field-list.spec.ts`
  - Failing test: `FieldList.test.tsx`: every measure, dimension, segment and time dimension in the metadata appears under its group, and members marked hidden do not (AC-025).
  - Depends on: T010
  - Done 2026-09-20. **AC-025 and AC-007 both ticked.** AC-007 waited from T004 until the browser genuinely needed metadata: the test asserts the page *did* fetch `/api/meta`, then that nothing went to the Cube host and no response carried the secret. Without the first assertion the other two pass on a page that fetches nothing.
  - The real stack is now in `docker-compose.yml`: a seeded sample warehouse, Cube Store, and Cube 1.7.42 in **production mode** (no Playground, authentication enforced), so local development matches how it is deployed. The JWT the `CubeClient` mints authenticates against real Cube, which is AC-008 confirmed against the thing rather than a stub.
  - Two findings. **Cube talks to Cube Store on HTTP 3030, not the MySQL port 3306** — pointing it at 3306 fails with "Parse Error: Expected HTTP/" and a permanently unhealthy deployment. And Cube Store's image is per-architecture: `v1.7.42` is amd64-only, Apple Silicon needs `-arm64v8`, so the tag is an env var CI overrides.
  - **Time dimensions are not a separate array** in Cube's metadata — they are dimensions whose `type` is `time`. Listing them with the rest would bury the field most charts are built around, so they are their own group.
  - Also fixed here: the intermittent browser-suite failures seen since T017 were **browser context launch exceeding the 30s test timeout** on cold runs, not assertion failures — the app was never at fault. The per-test timeout is now 60s, verified over a forced cold run and a warm one.
- [x] T025 (AC-026) Add a field to a well by drag or by the well's "+" picker and re-run the query
  - Files: `packages/core/src/chart-spec.ts`, `packages/core/src/chart-spec.test.ts`, `packages/web/src/editor/{Wells,ChartEditor,FieldList}.tsx`, `e2e/chart-editor.spec.ts`
  - Failing test: `chart-spec.test.ts` and `e2e/chart-editor.spec.ts`: both routes add the field to the well and the chart re-queries, replacing the previous result (AC-026).
  - Depends on: T024
  - Done 2026-09-20. AC-026 ticked. **Both routes are exercised**, and each asserts the result *changed* rather than that something is displayed: adding a measure gives 1 row, grouping by status gives 3, by day gives 240 — real numbers from the seeded warehouse, so a query that silently did not re-run fails.
  - The picker is not a fallback for the drag. It is the only route a keyboard or screen reader has, and a drag-only well would fail AC-176 outright.
  - The chart spec lives in `@wechart/core` and is engine-neutral (CLAUDE.md): nothing in it mentions ECharts. `toCubeQuery` sorts members so the same spec always produces byte-identical JSON, which is what AC-105 will need for a result to come from cache.
  - Changing cube clears the wells: members belong to a cube, and keeping them would build a query naming fields the new cube does not have.
- [x] T026 (AC-027) Mark each well legal or illegal during a drag, with a reason for every illegal well
  - Files: `packages/web/src/editor/{Wells,ChartEditor,FieldList}.tsx`, `packages/web/src/editor/Wells.test.tsx`, `packages/web/src/shell/styles.ts`, `e2e/chart-editor.spec.ts`
  - Failing test: `Wells.test.tsx`: dragging a dimension over a measure-only well marks it illegal with a reason, and dropping on it is refused (AC-027).
  - Depends on: T025
  - Done 2026-09-20. AC-027 ticked. Both halves are load-bearing and both are tested: a well that shows a reason **and still takes the drop** fails, and so does one that refuses silently. Refusing is implemented by *not* calling `preventDefault` on `dragover`, which is what makes a target decline in HTML drag and drop.
  - The reason names **both sides** — what the well takes and what the field is — because "not allowed here" leaves the user to guess which of the two is wrong.
  - Legality is an outline plus written text, never colour alone (direction.md rule 3), and the illegal well points at its reason with `aria-describedby`.
  - The drag payload is not readable during `dragover` (browsers withhold it until drop), so the editor holds the dragged member in state rather than reading it back. The browser test drives the drag by hand rather than with `dragTo`, because the marking only exists *while* the drag is in progress.
- [x] T027 (AC-030, AC-031) Implement the recommender's legality rules: no second value axis, and the channel-capacity caps
  - Files: `packages/recommender/src/{types,legality,index}.ts`, `packages/recommender/src/legality.test.ts`
  - Failing test: `legality.test.ts`: a two-value-axis candidate is rejected (AC-030), and candidates over 8 colour categories, 20 trellis panels, 6 pie slices or 200 heatmap cells are rejected (AC-031). Rule names are ported from `docs/research/recommender-algorithms.md` §2; the four caps are recorded there as product decisions.
  - Depends on: T001
  - Done 2026-09-20. **AC-030 and AC-031 stay unchecked**: both are stated over what is *offered* ("never recommend", "offered as the top pick or a runner-up"), and nothing recommends yet. The rules provably reject, and T028 — which produces the recommendations — asserts no offered candidate violates them. That is the criterion's actual shape.
  - Every cap is tested **at the boundary in both directions**: accepted at the cap, rejected one past it. A rule written with the wrong comparison passes a test that only tries a wildly-over case.
  - The heatmap rule counts **cells**, not either axis: 15×15 is over the cap though neither side looks large.
  - The four caps live in one `CAPS` object with the provenance stated beside them — the research found no published maximum for any of them, so they are product decisions rather than literature.
  - `checkLegality` returns every rule's verdict, passed or failed, because AC-029's trace has to show the rules that *passed* too.
- [x] T028 (AC-028, AC-030, AC-031) Recommend a chart type from the field signature, with at least one runner-up and a reason
  - Files: `packages/recommender/src/{recommend,legality,index}.ts`, `packages/recommender/src/{recommend,legality}.test.ts`
  - Failing test: `recommend.test.ts`: a field change produces a top pick plus at least one runner-up, each with a reason of at most 80 characters (AC-028).
  - Depends on: T027
  - Done 2026-09-20. **AC-028, AC-030 and AC-031 all ticked.** The two carried from T027 are demonstrated the way they are written — over what is *offered* — by running eleven signatures through the recommender and asserting nothing it returns has two value axes or exceeds a channel cap.
  - Enumerate, filter, rank, the shape the research recommends. The **weights are ours**: Draco's shipped weights are hand-tuned rather than learned and its design space has no pie, KPI or table, so they could not be ported wholesale (research §7). What is ported is the *shape* — a cost summed from named soft rules, lower being better — plus the channel ordering from Draco-APT and CompassQL.
  - Runners-up are a different chart type from the winner, not the same chart again: an alternative should be another way of seeing the data, which is what Voyager's grouping achieves (research §3).
  - **A decision the tests forced into the open**: a field whose cardinality nobody knows is treated as *over* any cap, not under it. The guesses are not symmetric — assuming small offers a pie that then draws five hundred slices, while assuming large offers a bar for a category that turns out to have four values: a worse chart, not a broken one. `legality.ts` and `recommend.ts` had silently disagreed about this, and a test caught it.
- [x] T029 (AC-029) Show the "Why this chart?" trace
  - Files: `packages/recommender/src/explain.ts`, `packages/recommender/src/explain.test.ts`, `packages/web/src/editor/{WhyThisChart,ChartEditor}.tsx`, `infra/cube/model/cubes/orders.yml`, `e2e/chart-editor.spec.ts`
  - Failing test: `explain.test.ts` and `e2e/chart-editor.spec.ts`: the panel shows the field signature, each field's cardinality, and every hard rule with its pass or fail result, including each rule that rejected a candidate (AC-029).
  - Depends on: T028
  - Done 2026-09-20. AC-029 ticked. The trace includes the candidates that were **rejected**, with the rule that rejected them — the criterion's `Fails when:` is about exactly that. A trace of only the winner answers "what did you pick" and not "why not the one I expected", which is the question someone opens this to ask.
  - **Cardinalities come from the rows the query returned**, not from a separate count query. What decides whether a chart reads is how many values are in *this* result, and it costs nothing extra.
  - `orders.id` is now `public: true` in the sample model: Cube hides primary keys from metadata by default, and without a high-cardinality dimension no capacity rule could be exercised against real data. It is also what row-level marking will need at T098 (AC-092).
  - A test of mine was wrong first: it asserted the trace names `time_as_categories`, which is a **soft** rule (a weight) and so never appears in a legality trace. The rule was right; the assertion was not.
- [x] T030 (AC-032) Keep a manually chosen chart type until "Back to recommended"
  - Files: `packages/web/src/editor/chartTypeState.ts`, `packages/web/src/editor/chartTypeState.test.ts`, `packages/web/src/editor/ChartEditor.tsx`, `e2e/chart-editor.spec.ts`
  - Failing test: `chartTypeState.test.ts`: after a manual pick, later field changes leave the type unchanged, and "Back to recommended" restores the recommendation (AC-032).
  - Depends on: T028
  - Done 2026-09-20. AC-032 ticked. The rule is one-directional and stated as such: **a field change never clears a manual choice**, only "Back to recommended" does. Re-recommending over someone's explicit decision each time they add a field is the behaviour this criterion exists to forbid — it reads as the application arguing with them.
  - `afterFieldChange` is written as an identity function rather than left implicit, so the intent is visible and testable, and a test runs four field changes in a row: an implementation that survives one might not survive the next.
  - The browser test picks a type the recommender *did not* choose and then changes fields so the recommendation moves — otherwise "kept" and "recommended again" look identical.
- [x] T031 (AC-033) Say what is missing when the fields cannot produce the chosen type
  - Files: `packages/recommender/src/requirements.ts`, `packages/recommender/src/requirements.test.ts`, `packages/web/src/editor/ChartEditor.tsx`, `e2e/chart-editor.spec.ts`
  - Failing test: `requirements.test.ts` and `e2e/chart-editor.spec.ts`: the message names the well and the member type needed, instead of rendering empty axes (AC-033).
  - Depends on: T030
  - Done 2026-09-20. AC-033 ticked. The message names **the well and the member type**, because "not enough fields" leaves someone staring at three wells wondering which one wants what — and it counts how many more are needed. Every unmet requirement gets its own sentence, so a chart short of two different things says both.
  - **The type picker now offers every chart type, not just the recommended ones.** It previously listed only the top pick and runners-up, which are all drawable by construction — so this criterion could never have fired. An override limited to the runners-up is barely an override, and a type the fields cannot yet produce is answered by the message rather than by hiding the option.
  - A test asserts every chart type the recommender can offer has a requirements entry: one added without it would silently claim it can always be drawn.
- [ ] T032 (AC-034) Preview at the tile's own size and filling the editor, and return with the tile updated
  - Files: `packages/web/src/editor/PreviewFrame.tsx`, `e2e/editor-preview.spec.ts`
  - Failing test: `e2e/editor-preview.spec.ts`: opened from a tile, the tile-size preview matches the tile's width and height, and returning applies the changes to that tile (AC-034).
  - Depends on: T025, T060
- [x] T033 (AC-035) Undo, redo and discard every change made since the editor opened
  - Files: `packages/web/src/editor/history.ts`, `packages/web/src/editor/history.test.ts`, `packages/web/src/editor/ChartEditor.tsx`, `packages/web/src/shell/styles.ts`, `e2e/chart-editor.spec.ts`
  - Failing test: `history.test.ts`: every editor change is undoable and redoable, and Discard restores the chart exactly as it was on open (AC-035).
  - Depends on: T025
  - Done 2026-09-20. AC-035 ticked. The history stores **states, not actions**. "Every change" is the criterion, and storing states means a new kind of change is undoable the day it is added, with no inverse operation to remember to write. The editor's undoable state is therefore one value — cube, spec and chart type together — rather than three pieces each of which would have to record itself.
  - A drag in progress is deliberately **outside** the history: it is a pointer position, not a change to the chart, and undo should not step back through one.
  - **Discard is itself undoable.** It lands on the opening state with everything before it still in the past, so discarding by mistake is recoverable. The criterion asks that Discard restores the original, not that it destroys the history.
  - The browser test walks back through all four kinds of change — chart type, dimension, measure, and the choice of cube — until Undo is disabled, rather than testing one step.
- [x] T034 (AC-036) Show the results drawer: result rows, underlying rows and the query JSON
  - Files: `packages/core/src/chart-spec.ts`, `packages/web/src/editor/ResultsDrawer.tsx`, `packages/web/src/editor/ChartEditor.tsx`, `packages/web/src/editor/ResultsDrawer.test.tsx`, `e2e/chart-editor.spec.ts`
  - Failing test: `ResultsDrawer.test.tsx`: all three views are present, and a capped table says so (AC-036); `e2e/chart-editor.spec.ts`: each view reflects the query the chart actually rendered, on a cube with and without a published primary key (AC-036).
  - Depends on: T025
  - Done 2026-09-20. AC-036 ticked. The result rows are **the same data the chart rendered**, passed in rather than re-fetched — re-fetching would let the drawer and the chart disagree, which is exactly the failure the criterion names. A test changes the query and asserts both move together.
  - Underlying rows come from the chart's own query with `ungrouped: true` and a cap, which is what direction.md §7a already decided. Derived from the same spec as the chart's query, so the two cannot name different members, and the measures come back unaggregated — the drawer shows the amounts that were summed, not just the keys.
  - They are fetched only while that view is open. The rows beneath an aggregate can be a large query and nobody has asked for it yet.
  - **Rejected at cold review, then rebuilt.** The first attempt selected the cube's primary key alongside the dimensions, and claimed a cube without a public primary key "gives no way to ask". Both were wrong. Cube hides primary keys by default (`research/cube/data-modeling.md`), so the view was inert on `customers` and `products` — two of the three sample cubes — which is AC-036's own "any of the three views is missing". And the repo's research names `ungrouped` and `drill_members` as other routes, so the claim contradicted its own sources.
  - Verified against the running Cube 1.7.42 rather than reasoned about: `customers`, whose primary key is not public, returns ungrouped rows, because `CUBEJS_ALLOW_UNGROUPED_WITHOUT_PRIMARY_KEY` inherits `CUBESQL_SQL_PUSH_DOWN` and defaults on (`research/cube/markings-query-support.md`). A time member is selected in `dimensions`, not `timeDimensions`: without a granularity Cube filters without grouping, so the bare `timeDimensions` form returned no time column at all.
  - **Truncation is disclosed.** Both tables cap at 100 rows and say so. A table that silently stops at 100 while the chart reports 240 reads as the two disagreeing, which is the thing the criterion exists to prevent.
  - **A real bug the test caught:** the drawer was rendered inside the result's success branch, so any re-query unmounted it and it reopened closed — changing a field would silently shut a drawer the user had opened. The fix is twofold: it sits outside the loading and error branches, **and** its open/view state lives in the editor, because the drawer is still unmounted when the chart has no fields and state held inside it would be lost when a well is emptied or the cube changed.

## F5. Chart rendering

- [x] T035 (AC-037) Render the bar family from a chart spec
  - Files: `packages/core/src/render-spec.ts`, `packages/core/src/render-spec.test.ts`, `packages/charts/src/theme.ts`, `packages/charts/src/series/bar.ts`, `packages/charts/src/series/bar.test.ts`, `packages/charts/src/testing/renderToSvg.ts`
  - Failing test: `bar.test.ts`: bar, horizontal bar, grouped bar and stacked bar each render from a valid spec (AC-037).
  - Depends on: T001
  - Done 2026-09-20. **AC-037 stays unchecked**: it names 18 chart types and this task delivers 4. It is ticked at T044, when the last of them renders. T036–T044 carry the rest.
  - **The tests render, they do not inspect an option.** ECharts draws headlessly through its SSR mode (`init(null, …, { ssr: true, renderer: 'svg' })`), so each test produces a real SVG and reads the marks back out of it. AC-037 fails "when a listed type cannot be produced from a valid spec", and an option object is not a chart: a test asserting `series[0].type === 'bar'` passes just as happily when the option is unrenderable.
  - Orientation is read from where the category labels land — spread along the bottom for a bar, down the side for a horizontal bar — rather than from the option, so "horizontal" means the drawn result and not the flag we set.
  - Grouped and stacked are told apart by geometry: grouped marks occupy disjoint horizontal extents on a shared baseline, stacked marks share one column with the upper mark's foot meeting the lower one's head. Mutating the layout table so `hbar` is not horizontal and `stackedBar` is not stacked fails 4 tests, so the assertions discriminate.
  - **Rejected at cold review on the mark rules, then fixed.** The first version claimed direction.md §6 was "implemented and demonstrated" and neither half held. The gap was drawn as a 1 px border on each of two touching marks, on the assumption that two 1 px borders make 2 px — but an SVG stroke straddles the boundary the two marks share, so both strokes land in the same 1 px band. Each mark carries the **full** width. And the only assertion guarding it looked for `stroke="<surface>"` in the output, which survives a border width of 0: zrender emits `stroke` whatever the width, and omits `stroke-width` entirely when it is 1 — precisely the value the bug produced.
  - Rounding was asserted as "the outline contains an arc", which is true of a pill, of a half-pixel radius, and of a bar rounded at the baseline — the rule inverted. The helper now records each corner's radius and position, and the tests assert both. A **negative** bar grows downwards, so its data-end is its bottom; the radii follow the sign of each value, which also means they are per datum and not per series. Restoring either bug fails a test.
  - "Outermost segment" is per drawn segment, not per series: `seriesOf` emits `null` gaps, so a stack whose top series is missing in one category would otherwise get a flat top there.
  - `bar` and `groupedBar` share one layout, which the review rightly asked about. It is a decision: a grouped bar *is* a bar chart with more than one series, so grouping is a property of the data. Making `bar` refuse a second series would turn "add another measure" into an error for something the user plainly meant. A test pins the two together so they cannot quietly diverge, and so the grouped block is not read as proving something about the type that it only proves about the data.
  - The test palette is deliberately **not** the default ramp. With `DEFAULT_PALETTE[0]` and `[1]` every assertion passed even if `barOption` ignored `spec.palette` — and the palette being handed in rather than looked up is the hinge AC-039 hangs on.
  - **The chart-type vocabulary moved to `@wechart/core`**, which the recommender now re-exports. It is what a saved chart is written in, and the renderer has to agree with it; two lists would drift, and a recommendation for a type the renderer never heard of fails at draw time. The 18 names are unchanged, and `ChartSpec.chartType` is now typed as `ChartType` rather than `string` — without that the stated reason was aspirational, since a saved chart was not actually written in the vocabulary.
  - The path reader throws on any command it does not handle. Skipping one silently returns a wrong bounding box, which would make every geometry assertion in this file meaningless rather than failing.
  - A gap is `null`, never `0`: zero is a measurement and a missing row is the absence of one. Cube returns measures as JSON strings, so `seriesOf` converts them — a renderer trusting the raw value would sort and scale them as text.
- [x] T036 (AC-037) Render the line and area family
  - Files: `packages/charts/src/series/line.ts`, `packages/charts/src/series/line.test.ts`, `packages/charts/src/testing/renderToSvg.ts`
  - Failing test: `line.test.ts`: line, multi-series line, area and stacked area each render from a valid spec (AC-037).
  - Depends on: T035
  - Done 2026-09-20. **AC-037 stays unchecked** — 8 of its 18 types now render. It is ticked at T044.
  - A line is an unfilled area, so all four are one `line` series set differing only in whether the region beneath is filled and whether the series stack. Mutating that table so `area` does not fill and `stackedArea` does not stack fails 3 tests.
  - **Finding marks needed a second route.** A line is a stroke with `fill="none"`, invisible to the fill-based `marksOf`; an area draws both a filled polygon and the line on top. `strokesOf` keys on `fill="none"`, which is also what separates a line from its own markers — a marker is a stroked path in the series colour too, but a filled circle carrying a scale transform. Setting `symbolSize` made those markers appear and the first version of the helper counted them as lines, reporting four where one was expected.
  - Stacking is proved by geometry rather than by the `stack` option: the upper series' line sits above the lower one at every category. The multi-series test asserts the unstacked pair **crosses** (count is below total in jan and above it in feb), so a chart that merely claims to stack fails.
  - **A gap breaks the line.** `connectNulls` stays at ECharts' default of false, and the test asserts one break for a null month and none without. A missing month is not a month with no orders; joining across it would draw a trend through data that was never measured. This is the rendered consequence of `seriesOf` emitting `null` rather than `0`.
  - direction.md §6 is demonstrated: lines at 2 px, and a marker per point of at least 8 px. Marker size is read from the transform matrix, because ECharts scales a unit circle — the drawn diameter is nowhere in the path data.
  - Carries T035's review lessons: the test palette is not the default ramp, so the palette hand-in is falsifiable here too.
- [x] T037 (AC-037) Render scatter
  - Files: `packages/charts/src/series/scatter.ts`, `packages/charts/src/series/scatter.test.ts`, `packages/charts/src/testing/renderToSvg.ts`
  - Failing test: `scatter.test.ts`: a scatter spec renders its points with both value axes bound (AC-037).
  - Depends on: T035, T188
  - Done 2026-09-20. **AC-037 stays unchecked** — 9 of its 18 types now render.
  - **The first type whose x axis is a measure**, which is why it does not go through `seriesOf`: that shapes rows into categories and series, and a scatter has neither. Each row is one point. It is also the type the old `{category, series, values}` encoding could not express at all, and the reason the channel model landed first.
  - **"Both value axes bound" is tested as spacing, not as axis type.** A chart that draws points against two axes could still have one on a categorical scale, and nothing about the points' existence would show it. With x values 10, 20 and 40, a value axis puts the second gap at twice the first and a category axis spaces all three evenly. Mutating `xAxis` to `category` moves the ratio from 2.0 to 1.0 and fails the test.
  - A separate test pairs each point with its own row: left to right the points go low, high, middle, so a renderer that sorted rows by either measure produces a monotonic run and fails.
  - `pointsOf` is a third way of finding marks. A scatter point is the same scaled unit circle a line marker is, but filled with the series colour and carrying no stroke, so the stroke-keyed `markersOf` cannot see it. The position lives in the transform matrix, not in the path data.
  - A row missing either measure is dropped rather than drawn. There is no baseline to fall back to as a bar has, and a point at zero would assert a measurement that was never made.
- [x] T038 (AC-037) Render pie and donut
  - Files: `packages/charts/src/series/pie.ts`, `packages/charts/src/series/pie.test.ts`, `packages/charts/src/testing/renderToSvg.ts`
  - Failing test: `pie.test.ts`: pie and donut each render from a valid spec (AC-037).
  - Depends on: T035, T188
  - Done 2026-09-20. **AC-037 stays unchecked** — 11 of its 18 types now render.
  - **Counting slices does not test a pie.** Its whole claim is that each slice's *angle* is its share of the total, and a renderer that gave every category an equal slice would pass a count. The angles are read back out of the drawn geometry: with 50/25/25 the slices must be 180°, 90° and 90°, where an even split would be three 120° slices and fail all three.
  - **The hole is read from the geometry, not from the option that asked for it.** ECharts writes a pie slice with its edge running to the centre and a donut's stopping at the inner radius, so "is a ring" is a fact about the path. Setting the donut's inner radius to zero fails the test.
  - A category with no measurement is left out rather than drawn as a zero-width sliver. A sliver in the legend invites the reader to look for a slice that is not there.
  - Slices carry the same surface-coloured gap as the bar family, so a pie's slices and a stacked bar's segments read the same way across a dashboard.
- [x] T039 (AC-037) Render treemap and heatmap
  - Files: `packages/charts/src/series/{treemap,heatmap}.ts`, `packages/charts/src/series/heatmap.test.ts`, `packages/charts/src/theme.ts`, `packages/charts/src/testing/renderToSvg.ts`, `packages/core/src/render-spec.ts`
  - Failing test: `heatmap.test.ts`: treemap and heatmap each render from a valid spec (AC-037).
  - Depends on: T035, T188
  - Done 2026-09-20. **AC-037 stays unchecked** — 13 of its 18 types now render.
  - Each is tested on what makes it that chart: a treemap's rectangle **areas** are the shares (60/30/10 gives ratios of 2 and 3, where three equal tiles would pass a count and fail every ratio), and a heatmap's cell **darkness** is the value.
  - **Heatmap is the case the channel model exists for.** It is the one type whose y axis is categorical and whose measure drives colour rather than position — `x` and `y` name the two dimensions, `color` names the measure. `{category, series, values}` could not have said that at all.
  - **ECharts requires `visualMap` for a heatmap** and throws "Heatmap must use with visualMap" without one, which `docs/research/echarts.md` does not mention. So the colour scale is its component rather than a per-cell colour of ours; the ramp's endpoints are direction.md §5's sequential blue, and a test asserts the palest and darkest cells are exactly those, so the ramp is the one that was decided rather than ECharts' default.
  - direction.md publishes only the ends of that ramp, so the shades between are interpolated — recorded in `theme.ts` as a derivation, the way direction.md records its own derived values.
  - **A treemap rectangle's position lives in a `transform`**, not in its path, so `marksOf` now applies any translate. Without it every rectangle would have been measured in the same corner. All 55 existing tests passed unchanged afterwards, which is what says the change was safe.
  - `CHART_TYPES` now exists at runtime in core, so the "a type nothing draws yet is reported rather than drawn as something else" test derives its cases from the vocabulary instead of naming one that stops being true — which it had, twice, in this task alone.
- [x] T040 (AC-037) Render the KPI tile
  - Files: `packages/web/src/tiles/Kpi.tsx`, `packages/web/src/tiles/Kpi.test.tsx`, `packages/web/src/tiles/ChartTile.tsx`, `packages/web/src/tiles/ChartCanvas.tsx`, `packages/web/src/editor/ChartEditor.tsx`
  - Failing test: `Kpi.test.tsx`: a KPI spec renders its value and sub-line (AC-037).
  - Depends on: T035, T189
  - Done 2026-09-20. **AC-037 stays unchecked** — 14 of its 18 types now render.
  - **It lives in `packages/web`, not `packages/charts`.** The task listed `packages/charts/src/dom/Kpi.tsx`, but T189 settled that `@wechart/charts` stays framework-free: it builds options and `packages/web` owns the DOM and React. Adding React to charts for one component would undo that. The same will apply to the table and the pivot.
  - DOM rather than ECharts, which is also where `docs/research/echarts.md` lands: a number drawn on a canvas is unselectable, unsearchable and invisible to a screen reader, for no gain.
  - **A KPI is one number, so the work is all in its absence.** No rows, a row that does not carry the measure, a value that will not parse and no measure bound at all each say so rather than printing `0` — an empty result is not a measurement of zero.
  - New: `ChartTile` is the single place that knows which types are DOM and which go to ECharts, so nothing upstream has to. `ChartCanvas` lost its own not-drawable branch to it rather than keeping two copies.
  - Values are grouped (`9,876,543`) rather than printed as a wall of digits, and the string Cube sends over JSON is converted rather than trusted. Per-member formats — currency, percentages — are AC-046's business at T052.
- [x] T041 (AC-037, AC-178) Render the table, and offer a table view of every chart's data from the tile
  - Files: `packages/web/src/tiles/DataTable.tsx`, `packages/web/src/tiles/DataTable.test.tsx`, `packages/web/src/tiles/ChartTile.tsx`, `e2e/table-view.spec.ts`
  - Failing test: `DataTable.test.tsx`: a table spec renders with real `<table>` semantics and virtualised rows (AC-037); `e2e/table-view.spec.ts`: every chart type offers a table view reachable from its tile (AC-178).
  - Depends on: T035, T189
  - Done 2026-09-20. **AC-178 ticked. AC-037 stays unchecked** — 15 of its 18 types now render.
  - In `packages/web` rather than `packages/charts`, for the reason recorded at T040: charts stays framework-free.
  - **Two requirements pull against each other.** Real `<table>` semantics are what a screen reader needs, and virtualisation is what stops ten thousand rows being ten thousand DOM nodes — and the usual way to virtualise is absolute positioning, which destroys table layout. TanStack's own guide suggests `display: grid`, "breaking semantic HTML". `research/table.md` settles it the other way: fixed row heights plus **spacer rows** standing in for what is not drawn, so the native layout survives, and `aria-rowcount`/`aria-rowindex`, which the APG table pattern requires exactly when rows "are hidden or not present in the DOM".
  - **Only `@tanstack/react-virtual` is used so far.** `@tanstack/react-table` is the decided library and is installed, but a flat table of result rows needs none of its row model; v9's feature-registration surface is significant to adopt for nothing. It earns its place at the pivot (T042) and sorting (T051).
  - The virtualiser's rect is supplied rather than observed. The tile decides the height, so there is nothing to discover by measuring — and measuring is what fails without a layout engine: the default watcher reports a zero-height rect, the window comes out empty and nothing is drawn.
  - **AC-178 is tested against the vocabulary, not a sample.** All eighteen types are exercised, and the fixture fills every well so none is left unable to draw. Skipping the ones that fell short would have been the easy green and would have excused exactly the types most likely to lack a view — the test-integrity hook blocked a `test.skip` that would have done it.
  - Known, accepted: React Compiler declines to memoise `DataTable` because TanStack Virtual returns functions it cannot memoise safely (`react-hooks/incompatible-library`). It is a warning about optimisation, not correctness.
- [x] T042 (AC-037) Render the pivot table with row subtotals and grand totals
  - Files: `packages/core/src/pivot.ts`, `packages/core/src/pivot.test.ts`, `packages/web/src/tiles/PivotTable.tsx`, `packages/web/src/tiles/PivotTable.test.tsx`, `packages/web/src/tiles/ChartTile.tsx`
  - Failing test: `pivot.test.ts`: the cross-tab, its gaps and its totals (AC-037); `PivotTable.test.tsx`: nested column headers span rather than repeat, and the totals land in the right cells (AC-037).
  - Depends on: T041
  - Done 2026-09-20. **AC-037 stays unchecked** — 16 of its 18 types now render.
  - **The cross-tab is computed in core, not by the grid.** `research/table.md` is explicit that TanStack Table has row grouping and aggregation but *no* cross-tab. Doing it in `@wechart/core` also means it is tested on values rather than on rendered cells, and the component is left only drawing.
  - The task said to take the cross-tab from Cube's `ResultSet.tablePivot`/`tableColumns`. wechart does not use `@cubejs-client/core` — the API returns raw rows — so the same shape is derived from those rows instead. The `row` and `column` channels exist for exactly this and needed no extension.
  - **A gap is `null`, and so is a total of nothing.** Zero would claim a measurement the result never contained. Once one real number is present the gaps beside it are skipped.
  - **Sum only, and that is a limitation worth naming.** A subtotal of an average is not an average, and nothing here knows a measure's aggregation: `RenderSpec` carries member names, not the model's metadata. Non-additive measures need their totals from Cube — the same conclusion AC-048 reaches for quick calculations. Revisit when member metadata reaches the renderer at T052.
  - Nested headers span rather than repeat, and equal leaves under *different* parents do not merge. The first version of that test used leaves that were not adjacent, so it would have passed without the rule; with adjacent `Q1/paid` and `Q2/paid` it fails the moment the parent check is removed.
  - Last write wins for a duplicate row/column pair. Cube has already grouped by those dimensions, so two rows for one pair mean the query and the pivot disagree about the grain — not something to silently add up.
- [x] T043 (AC-037, AC-045) Render trellis panels with a shared scale, per-panel titles and a cap of 20
  - Files: `packages/charts/src/layout/trellis.ts`, `packages/charts/src/layout/trellis.test.ts`, `packages/core/src/render-spec.ts`, `packages/core/src/compile.ts`
  - Failing test: `trellis.test.ts`: panels lay out in a grid, share one scale while the shared setting is on, each carry a title, and never exceed 20 (AC-037, AC-045).
  - Depends on: T035, T188
  - Done 2026-09-20. **AC-045 ticked. AC-037 stays unchecked** — 17 of its 18 types now render; combo at T044 is the last.
  - One ECharts instance holding several `grid`s, each with its own axes, title and series — the arrangement `research/echarts.md` identifies, and the reason each title sets `triggerEvent`, which is the hook AC-091 needs to mark a whole panel from its header.
  - **The shared scale is the assertion that matters, and it is geometric.** Under independent scales every panel fills its own box, which looks correct and says something false: two regions whose values differ tenfold appear alike. The test compares bar heights *across* panels — east peaks at 100 and west at 10, so west's tallest bar must be under a fifth of east's — rather than asking the option what it was set to. Turning the setting off flips the same assertion.
  - **`RenderSpec` gained an `options` passthrough**, because a chart-type setting had no way to reach a renderer: the document carried one and `compile` dropped it. Sparse and untyped, for the reason Grafana and Metabase both leave the equivalent field untyped — an option belonging to a type that is not selected stays inert rather than becoming invalid, which is what lets a user switch type and switch back.
  - **A layout bug the tests caught.** Panels were laid on a fixed four-column grid, so two panels sat in the left half with empty space beside them — reading as two panels missing rather than as two panels. Columns are now capped at the panel count.
  - The cap keeps the *first* twenty in arrival order. Sorting would override the order Cube was asked for (AC-044), and dropping from the front would hide the panels a reader is most likely to want.
> **Plan change, 2026-09-20 (user-approved).** A cold review found that no task produced the thing AC-037 is written against: "render … **from a chart spec**". A chart document held only catalog metadata — title, owner, folder — with no query, no encoding and no chart type, and nothing turned a saved chart into a `RenderSpec`. T186–T188 close that, and they come before T044 because T044 is the task that ticks AC-037. Grounded in `docs/research/{superset-chart-serialization,metabase-card-serialization,grafana-panel-schema}.md`; see each task for which finding decides what.

- [x] T186 (AC-014, AC-037) Define the saved chart document and read it back unchanged
  - Files: `packages/core/src/chart-document.ts`, `packages/core/src/chart-document.test.ts`, `packages/core/src/index.ts`
  - Failing test: `chart-document.test.ts`: a document carrying source, wells, chart type, encoding overrides and options round-trips through JSON unchanged, and a body missing `schemaVersion` is refused rather than guessed at (AC-014).
  - Depends on: T035
  - **Persist the authoring shape only.** All three reference products agree and none stores a render shape: Grafana's resolved `DataFrame[]` is built by `PanelQueryRunner.getData()` and never saved, Metabase hands the renderer `{card, data}`, Superset builds `ChartProps` at render. The one exception anywhere is a Grafana snapshot, which is a separate mode with its own metadata block.
  - **No cached derived query.** Superset caches one in `slices.query_context` and it is the source of its worst documented maintenance problem: the `form_data` → `query_context` derivation lived only in the frontend, so keeping the cache correct forced ~50 TypeScript functions to be re-implemented in Python. `toCubeQuery(spec)` stays a pure function computed on demand.
  - **Roles are named in the data, not recovered by aliasing.** Superset's flat `{controlName: value}` map costs it `extract_query_fields`' alias table plus three hand-maintained key lists in `standardizedFormData.ts`, purely so switching chart type keeps the user's fields.
  - **Encoding and options are sparse overrides over a computed baseline**, which is Metabase's model and already wechart's own for `chartTypeState`: absent means "follow the recommendation", present means the user pinned it. It is also why a permissive options map is tolerable — an unknown key is inert, not corrupt.
  - Done 2026-09-20. **AC-014 was already ticked at T003 and stays ticked**; this task gives it a chart definition to carry rather than the catalog metadata it held before. AC-037 waits for T188 and T044.
  - The catalog fields stay at the document's top level because the `documents` table generates its `title`, `folder_id` and `owner` columns out of them — nesting them would empty the folder tree and search. A test asserts their position, not just their presence.
  - **Absent is not empty.** Reading a chart with no pinned encoding back as `encoding: {}` would turn every recommendation into a pin, which is the distinction AC-032 rests on. Mutating the reader to default it fails the test.
  - **The reader refuses what it cannot place** rather than recovering: no version, a newer version, no cube, or a well holding something that is not a member name. Metabase's reader recovers to an empty query on any error, which is how instances ended up with cards that exist but have no query — a condition a later schema upgrade was written to repair and, by its own comment, failed to. An unreadable chart is worth an error; a chart that reads as something else is not.
  - An older version is refused here too, and upgraded by T187 before the reader sees it. That keeps the reader single-format and the migration in one place.
- [x] T187 (AC-181) Upgrade a chart saved in an earlier format, and refuse one from a newer format
  - Files: `packages/core/src/chart-migrations.ts`, `packages/core/src/chart-migrations.test.ts`, `packages/core/src/chart-document.ts`, `packages/api/src/repos/documents.ts`, `packages/api/src/repos/documents.test.ts`
  - Failing test: `chart-migrations.test.ts`: a fixture document at every past version upgrades to the current one and produces the same chart type, members and query; a document from a newer version is refused with a message naming the version (AC-181).
  - Depends on: T186
  - Forward-only, upgrade-on-read, one step per version, with a fixture per version that must keep passing. Both Grafana (`DashboardMigrator`, `if (oldVersion < N && finalTargetVersion >= N)`) and Metabase (`upgrade-card-schema-to`) work this way.
  - **The chain is append-only.** Metabase has two upgrade steps it can never delete — 21 "caused performance problems", 23 "This fix was a failure … now it's just a no-op" — because older rows still have to traverse them. A step is therefore written once and neutered rather than removed.
  - **A newer format is refused, not guessed at.** Metabase's reader recovers to `{}` on any deserialization error, which is how instances ended up with cards that exist but have no query — the condition a later schema upgrade was written to repair and failed to.
  - Superset's approach is explicitly rejected: it has no version on the payload, rewrites every row in place, stores the whole pre-migration document inside the document as `form_data_bak` permanently, and swallows per-row failures so a partial migration surfaces nothing.
  - Done 2026-09-20. **AC-181 ticked.** The upgrade runs in `toDocument`, the single place a stored row becomes a document — Metabase's `after-select` position. Removing that one call fails the repo test, so the wiring is load-bearing: a migration nothing calls is not a migration.
  - **Reading never writes.** The upgrade is re-applied on every read until the user saves, which is what Grafana's panel migrations do. A test asserts the row's version does not move across repeated reads; an upgrade that saved itself would bump the version on every read and race with a concurrent edit (AC-015).
  - **A fixture per past version, frozen.** A test asserts there is one for every version below the current, so adding a version without a fixture fails. These are fixtures of *stored data*: if one stops passing, the migration is wrong, not the fixture.
  - **A design error the tests caught.** The reader refused an empty cube, but "no cube chosen yet" is exactly the state a newly opened editor is in, and it is what the pre-definition bodies upgrade to. A *missing* cube is malformed; an *empty* one is legitimate. Conflating them made those bodies unopenable.
  - **AC-014 and AC-181 interact, and two existing tests were measuring the wrong thing.** "Stores a chart unchanged" used an arbitrary body, which is now a version-0 chart and so is upgraded on read — it was exercising AC-181 while claiming to test storage fidelity. Its fixture is now a current-format chart; the assertions are untouched. A chart in the current format is unchanged; only an older one is upgraded, which is what AC-181 asks for.
- [x] T188 (AC-037) Compile a saved chart document into a RenderSpec
  - Files: `packages/core/src/compile.ts`, `packages/core/src/compile.test.ts`, `packages/core/src/render-spec.ts`, `packages/core/src/chart-document.ts`, `playwright.config.ts`
  - Failing test: `compile.test.ts`: a saved document plus result rows compiles to the `RenderSpec` the renderers already consume, and the same document with an encoding override compiles to the overridden channels (AC-037).
  - Depends on: T186
  - **This is the bridge AC-037 is written against.** Until it exists, "render … from a chart spec" cannot be demonstrated end-to-end however many chart types render.
  - **`Encoding` becomes a channel model** — x, y, colour, size, facet, row, column — replacing `{category, series, values[]}`, which was fitted to the bar and line families and cannot express scatter (two value axes), heatmap (two categories plus colour), treemap (hierarchy plus size), pivot (rows × columns × measures) or trellis (a facet). The channel vocabulary and its renderer-neutrality are already documented in `docs/research/vega-lite.md`: the fieldDef model "names data roles and visual channels", and rendering happens only after compiling.
  - **Channels bind to result columns by name.** Metabase's `graph.dimensions`/`graph.metrics` are plain result-column names, arrived at after abandoning ref-keyed settings over issue #11829 — open from 2019 to 2025 — and both keying schemes still coexist in their data. Cube member names are already stable names, so this costs nothing and avoids the whole class.
  - **Per-series and per-member settings need addressing, panel-wide ones do not** (Grafana's `options` vs `fieldConfig.defaults` vs matcher-selected `overrides`). The mechanical test: a setting that must apply to some series and not others has to be addressable. AC-040 (axes) and AC-046 (per-member format) are both in that category; the legend (AC-038) is not.
  - Done 2026-09-20. **AC-037 still waits for T044**, which needs all 18 types; the bridge it was missing now exists.
  - **The bar and line renderers pass unchanged.** That is the evidence the channel model is a faithful replacement for `{category, series, values}` rather than a rewrite: only `seriesOf` read the encoding's internals, and it now reads x, colour and y.
  - **Every channel holds a list**, even though most hold at most one member. The value axis genuinely takes several — a grouped bar of two measures — and Metabase's `graph.dimensions`/`graph.metrics` are both arrays for the same reason. One shape beats a union of singular and plural channels that every caller would have to know about.
  - **Three states, not two.** A channel the user never mentioned takes the computed default; one they filled wins; one they set to an **empty list** is them clearing it, and that also wins. Collapsing empty into absent would make "remove this field" impossible to express.
  - Overrides apply **per channel**. Mutating `compile` to swap in the override map wholesale fails a test — pinning a colour would otherwise blank the axes.
  - `defaultEncoding` prefers a time dimension on x and moves the plain dimension to colour. Time is the axis a reader expects to run left to right, and a second categorical member is more use as the series than fighting it for x.
  - **The e2e flake is solved, and it was never what it looked like.** The failure reports as `renders no text below 12 px at /explore` but the artifact says `Test timeout of 60000ms exceeded while setting up "context"` — the browser did not hand out a context in time, with nothing in the app involved. An earlier pass at this chased font tokens for a sub-12px value that does not exist. Playwright defaults to half the cores (6 here) and each worker launches a real browser at once, on a machine also running the docker stack and other services; local workers are now capped at 4 and CI keeps the default. Three consecutive full runs clean.

- [x] T189 (AC-037) Draw the chart in the app, from a compiled spec
  - Files: `packages/charts/src/echarts.ts`, `packages/charts/src/optionFor.ts`, `packages/charts/src/optionFor.test.ts`, `packages/web/src/tiles/ChartCanvas.tsx`, `packages/web/src/editor/ChartEditor.tsx`, `packages/web/vite.config.ts`, `playwright.config.ts`, `e2e/chart-editor.spec.ts`
  - Failing test: `e2e/chart-editor.spec.ts`: adding fields in the editor draws a chart with marks in it, and changing the fields redraws it (AC-037).
  - Depends on: T188
  - **User-approved plan change, 2026-09-20.** Eleven chart types rendered headlessly and nothing in the app drew one: `packages/web` imported neither `@wechart/charts` nor `echarts`, and no task created the component that would. The editor showed a row count and a JSON preview.
  - The headless SSR path proves an *option is renderable*. It says nothing about the browser lifecycle — `init` on a real node, `ResizeObserver`, `dispose` under React StrictMode, or switching theme — which is where integration failures actually live. Doing this with four renderer modules to adapt rather than eight is the point of doing it now.
  - `@wechart/charts` stays framework-free: it builds options, and `packages/web` owns the DOM and the React lifecycle, the same split `@wechart/ui` already has with tokens and components.
  - Imports go through `echarts/core` with an explicit registration set. `docs/research/echarts.md` is blunt about the alternative: `sideEffects` lists `index.js` and `lib/chart/*.js`, so one stray root import adds about 368 KB gzipped.
  - Done 2026-09-20. **AC-037 still waits for T044.** The editor now draws, with a browser test that asserts *marks*, not merely an `<svg>` — an empty chart frame would satisfy the latter — and that adding a second measure changes what is drawn.
  - **A type with no renderer says so rather than falling back.** `optionFor` throws and the canvas shows it. A fallback to bar would put a chart on screen the spec never asked for, which is worse than admitting the gap; the editor already explains unbuildable charts under AC-033.
  - The preview goes spec → document → `RenderSpec`, the same path a saved chart will take, so the preview and the saved chart cannot drift apart.
  - **Three real integration problems the headless tests could not have found**, which is the argument for doing this at four renderers rather than eight:
    1. **StrictMode double-invokes the effect** and ECharts throws on a second `init` for one element, so the instance is looked up with `getInstanceByDom` before creating one.
    2. **The browser suite was serving the dev server.** Once the app pulled ECharts through Vite's dev transform on every page load the suite went from about 40 seconds to two minutes and WebKit began timing out. It now serves the production build, as the API webServer already did — which is also the artefact users get.
    3. **`server.proxy` does not apply to `vite preview`.** Vite keeps `preview.proxy` separate, so serving the build without it would have 404'd every `/api` call.
  - Two test assumptions of mine were wrong, not the code: removing the dimension leaves one measure, which the recommender calls a KPI — a type with no renderer, so the app correctly declines to draw rather than redrawing; and the remove control is addressed by its label, not a test id.
  - The timeout is now 120s. It exists to catch a hung app and a pass takes about a second, so the ceiling costs no signal — it stops context-setup starvation on a loaded machine being reported as a product defect.
- [x] T044 (AC-037) Render the combo chart
  - Files: `packages/charts/src/series/combo.ts`, `packages/charts/src/series/combo.test.ts`, `packages/charts/src/optionFor.ts`, `e2e/chart-editor.spec.ts`
  - Failing test: `combo.test.ts`: a combo spec renders bar and line series against one value axis (AC-037).
  - Depends on: T036, T188
  - **This is the task that ticks AC-037**, so it needs every listed type to render *and* the compile step of T188, because the criterion says "from a chart spec".
  - Done 2026-09-20. **AC-037 ticked — all eighteen types render**, eleven through ECharts and three (KPI, table, pivot) as DOM, with the rest between.
  - **One value axis, and the test proves it geometrically.** direction.md rules out a dual axis because two scales in one frame let any two series be made to look related. With amounts ten times the counts, the line must sit above every bar; swapping which measure is which reverses the relationship. A chart that scaled each series independently would look identical both ways and pass neither.
  - The first measure takes bars and the rest lines. Which measure gets which mark is a decision a saved chart should eventually carry — Metabase keeps it per series in `series_settings.<key>.display` — but no criterion asks for it, and inventing a setting nothing sets would be guessing at a requirement.
  - **A test retired and was replaced by its opposite.** "The editor says so for a type it cannot draw yet" was true while renderers were landing and stopped being true here. In its place: every type in the vocabulary is selected in the editor and none reports itself undrawable — which is AC-037's end-to-end demonstration rather than a narrower one. The guard itself is still covered by the unit test.
  - The unit block named "a type nothing can draw yet" is now "a type ECharts does not draw", and asserts it is exactly KPI, pivot and table. Leaving the old name would have implied a gap that no longer exists.
- [x] T045 (AC-038) Show a legend for two or more series and none for one
  - Files: `packages/charts/src/legend.ts`, `packages/charts/src/legend.test.ts`, `packages/charts/src/optionFor.ts`
  - Failing test: `legend.test.ts`: a two-series chart renders a legend and a single-series chart renders no legend box (AC-038).
  - Depends on: T036
  - Done 2026-09-20. **AC-038 ticked.**
  - **Decided once, in `optionFor`, not per renderer.** AC-038 is a rule about charts, not about bar charts, and a renderer that forgot it would be a chart type quietly exempt from the criterion.
  - **"Series" is not the number of ECharts series.** It is the count of distinctly coloured things: a pie is one series and several coloured slices, and it is the slices a legend names. A heatmap counts zero because its colour is a *scale* rather than a set — naming its values would mean naming every cell. KPI, table, pivot and trellis count zero too, having no marks for a legend to name.
  - Both halves of the criterion are tested, and the second is the one usually got wrong: a legend naming the one thing the axis and title already name is clutter, and on a small tile it costs the chart its height. Relaxing the threshold from two to one fails two tests.
  - Legend clicks do nothing yet. Toggling series visibility belongs to the interaction modes of AC-070 and AC-071, not to drawing.
- [x] T046 (AC-039) Give a member the same colour in every tile, and keep it when filters change the visible set
  - Files: `packages/charts/src/colorAssignment.ts`, `packages/charts/src/colorAssignment.test.ts`, `packages/charts/src/colours.ts`, `packages/core/src/render-spec.ts`, and every series renderer
  - Failing test: `colorAssignment.test.ts`: a member keeps one colour across two tiles, and keeps it after a filter removes other members (AC-039).
  - Depends on: T035
  - Done 2026-09-20. **AC-039 is NOT ticked**, and this is a deferral, not an oversight: the criterion says "the same colour in every tile of **a dashboard**", and there are no dashboards yet. The mechanism is built and every renderer honours it; it is ticked at **T023**, the first task that renders several tiles together, when one assignment is shared across them.
  - **The failure this prevents is colour assigned by position.** Two tiles listing the same members in a different order paint them differently, and a filter that removes one member repaints every member after it — so a reader who has learnt that blue means "east" is taught something false by the act of filtering. A test removes the first member and asserts the second keeps its colour.
  - Superset shows the cost of the alternative: `label_colors` is a map copied into each chart, and one shipped example carries a fifty-entry map most of whose keys belong to *other* charts. An assignment here is a dashboard-level object handed to each tile, and it only ever grows.
  - **`RenderSpec.colours` is data, not a function**, so a compiled spec stays inspectable and serialisable. A member absent from it falls back to the palette by position, which is right for a chart standing on its own.
  - One lookup (`colours.ts`) is used by every renderer, so the rule is a property of wechart rather than of whichever renderers remembered it.
  - **Past the last palette slot a member takes the neutral, not a repeat.** direction.md caps categorical colour at its validated slots; cycling would give two members the same colour and so say they were the same thing, where the neutral says "not separately coloured", which is true.
  - A test caught the legend: with two series AC-038 adds one, and its swatches are filled paths in the same colours, so the bars had to be picked out by being far taller than a legend icon.
- [x] T047 (AC-040) Apply the axis editor's settings to the rendered chart
  - Files: `packages/charts/src/axis.ts`, `packages/charts/src/axis.test.ts`, `packages/web/src/editor/AxisPanel.tsx`, `packages/web/src/editor/ChartEditor.tsx`, `packages/charts/src/testing/renderToSvg.ts`, `e2e/chart-editor.spec.ts`
  - Failing test: `axis.test.ts`: minimum, maximum, logarithmic scale, gridlines, tick rotation, number format and axis title each change the rendered axis (AC-040); `e2e/chart-editor.spec.ts`: the inspector's controls reach the chart.
  - Depends on: T035
  - Done 2026-09-20. **AC-040 ticked.**
  - The criterion's failing state is "a setting is accepted and the drawing does not change", so every one of the seven is checked against the **drawn output**. An option that is set and never read looks identical to one that works.
  - **The log scale is tested geometrically.** With values 1, 10 and 100 a log axis puts the ticks one decade apart at equal spacing, and a linear axis does not — so the assertion is the ratio of the gaps, not the axis type.
  - Applied to whatever option the renderer produced, like the legend, so every chart type gets the settings and none can forget. Charts with no cartesian axes and the trellis — which has an array of axes per panel, a different editing problem — are left alone rather than half-handled, and the inspector hides the section for them: offering a setting that cannot apply is worse than offering none.
  - **A bug in the test helper, found here and affecting earlier tasks.** ECharts writes a rotation as a transform *matrix*, not a `rotate()`, and `labelsOf` only matched `translate(x y)` — so it was silently blind to every rotated label, including axis titles, which ECharts always rotates on a y axis. It now reads both forms.
  - Axis settings are part of the undo history, because AC-035 asks that every change is undoable and an axis edit is a change like any other. A browser test undoes one.
  - Settings are sparse: a field left alone is absent rather than stored as a default, which is what keeps the chart following the data when nobody has overridden anything.
- [x] T048 (AC-041) Aggregate the remainder into a labelled "Other (n)"
  - Files: `packages/core/src/topN.ts`, `packages/core/src/topN.test.ts`, `packages/core/src/compile.ts`, `packages/charts/src/colours.ts`
  - Failing test: `topN.test.ts`: past the top-N setting the chart renders N categories plus one "Other (n)" labelled with the number of members it covers (AC-041).
  - Depends on: T035
  - Done 2026-09-20. **AC-041 ticked.**
  - **The count in the label is what stops "Other" being a lie.** A slice labelled only "Other" could cover two members or two hundred, and a reader has no way to tell how much of the chart they are not seeing. The criterion asks for it explicitly and a test asserts it for two different tail sizes.
  - Folded in `compile`, not per renderer, so no chart type can be quietly exempt from the cap. It is a transformation of the rows, which is what that step is for.
  - **Ranked by value, not by arrival.** Otherwise the tail is whichever members Cube happened to return last, and the chart hides large members while showing small ones. A test puts the largest member second in the rows and expects it kept.
  - **The tail takes the neutral, not a palette slot** (direction.md §5). "Other" is not a member, and giving it a member's colour would put it in the same visual class as the things it hides.
  - No item is added when the category count is exactly the setting: an "Other (0)" would be an empty category taking a colour and a legend entry for nothing.
  - Ranking uses the *first* measure. Summing across measures of different units would be adding pounds to counts. The same additivity caveat as the pivot applies: a total of averages is not an average, and a non-additive measure needs its "Other" from Cube.
- [x] T049 (AC-042) Show a chart-shaped loading skeleton and an error state offering Retry and details
  - Files: `packages/web/src/tiles/TileSkeleton.tsx`, `packages/web/src/tiles/TileSkeleton.test.tsx`, `packages/web/src/editor/ChartEditor.tsx`
  - Failing test: `TileSkeleton.test.tsx`: loading renders a skeleton matching the chart's shape, and a failure renders Retry plus the error details (AC-042).
  - Depends on: T013
  - Done 2026-09-20. **AC-042 ticked.**
  - `TileError` already existed from AC-012, with Cube's own message, Retry and the query behind a disclosure — but **nothing used it**: the editor rendered a bare `<p role="alert">`. Half of this task was wiring the component that was already written and tested, which is worth noting as a failure mode of its own: a tested component nobody renders satisfies no criterion.
  - **"In the shape of the chart" is the part with teeth.** One grey rectangle for every type would satisfy "not an empty tile" and satisfy nothing else, so the tests assert the shape *varies* — a bar is not a pie, a line is not a bar, a horizontal bar is not a vertical one — and that types which genuinely look alike while empty share a shape, because pretending otherwise would be noise.
  - A skeleton rather than a spinner. A spinner says something is happening; a skeleton says something is happening *here* and will look like this, and a tile that reserves the right shape does not jump when the data lands.
  - The skeleton is `aria-hidden` with a single `role="status"` saying "Loading chart", so assistive technology is told once rather than being read the decoration.
- [ ] T050 (AC-043) Show an empty state naming the filters in effect
  - Files: `packages/web/src/tiles/TileEmpty.tsx`, `packages/web/src/tiles/TileEmpty.test.tsx`
  - Failing test: `TileEmpty.test.tsx`: a zero-row result renders a message naming every active filter, not blank axes (AC-043).
  - Depends on: T049, T084
- [x] T051 (AC-044) Sort categories by value or label and keep the order across a refresh
  - Files: `packages/core/src/sort.ts`, `packages/core/src/sort.test.ts`, `packages/core/src/compile.ts`, `packages/web/src/editor/ChartEditor.tsx`, `packages/web/src/tiles/ChartTile.tsx`, `e2e/chart-editor.spec.ts`
  - Failing test: `sort.test.ts`: ascending, descending and label orders are applied, and a refresh with unchanged data preserves the order (AC-044).
  - Depends on: T035
  - Done 2026-09-20. **AC-044 ticked.**
  - **"Keeps the order after a refresh" is what shaped it.** The order has to be a property of the chart, not of the rows that happened to arrive, so the same setting over the same data gives the same answer — ties included. Tied categories keep arrival order, which is what stops a refresh reshuffling a chart that did not change.
  - Sorting runs after the top-N fold in `compile`: the cap *selects* which categories are shown and the sort *arranges* what survives, so the tail is chosen on merit rather than on whatever the sort happened to put last.
  - A category with no measurement sorts last in **either** direction. Treated as zero it would lead an ascending chart and claim to be the smallest measurement, which it is not. "Other" is pinned last for the same reason: it is not a member, and sorting it by its total would imply it were one.
  - "Cube's order" is the default and a real choice rather than the absence of one — Cube was asked for an ordering and returned it, and leaving it alone is different from having none.
  - **A real bug the browser test found**, and the same class as the results drawer at T034: `ChartTile` kept "showing the table" in its own state, and the editor unmounts the tile on every re-query — so adding a field silently flipped a reader back from the table to the chart. The state now belongs to whatever outlives the tile, and the tile takes it as an optional controlled prop.
  - **A fixture that would have passed for the wrong reason:** the first version sorted by `orders.count`, and the sample data has exactly 80 orders in each status, so every category ties and ascending and descending are identical. Switched to a measure that varies.
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
| AC-014 | T003, T186 | AC-059 | T065 | AC-104 | T110 | AC-149 | T155       |
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
| AC-030 | T027, T028 | AC-075 | T081 | AC-120 | T126 | AC-165 | T171       |
| AC-031 | T027, T028 | AC-076 | T082 | AC-121 | T127 | AC-166 | T172       |
| AC-032 | T030       | AC-077 | T083 | AC-122 | T128 | AC-167 | T173       |
| AC-033 | T031       | AC-078 | T084 | AC-123 | T129 | AC-168 | T174       |
| AC-034 | T032       | AC-079 | T085 | AC-124 | T130 | AC-169 | T175       |
| AC-035 | T033       | AC-080 | T086 | AC-125 | T131 | AC-170 | T176       |
| AC-036 | T034       | AC-081 | T087 | AC-126 | T132 | AC-171 | T177       |
| AC-037 | T035–T044, T186, T188 | AC-082 | T088 | AC-127 | T133 | AC-172 | T178 |
| AC-038 | T045       | AC-083 | T089 | AC-128 | T134 | AC-173 | T179       |
| AC-039 | T046, T023 | AC-084 | T090 | AC-129 | T135 | AC-174 | T180       |
| AC-040 | T047       | AC-085 | T091 | AC-130 | T136 | AC-175 | T181       |
| AC-041 | T048       | AC-086 | T092 | AC-131 | T137 | AC-176 | T182       |
| AC-042 | T049       | AC-087 | T093 | AC-132 | T138 | AC-177 | T183       |
| AC-043 | T050       | AC-088 | T094 | AC-133 | T139 | AC-178 | T041       |
| AC-044 | T051       | AC-089 | T095 | AC-134 | T140 | AC-179 | T184       |
| AC-045 | T043       | AC-090 | T096 | AC-135 | T141 | AC-180 | T001, T185 |
| AC-181 | T187       |        |      |        |      |        |            |
