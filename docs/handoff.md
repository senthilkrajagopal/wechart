# Handoff — 2026-09-24

> **Phase 2, 2026-09-25: implementing.** The workflow ran interview (R11–R19), spec
> (F25–F36), research, the user's choices (R20–R22), the design direction (§7e,
> accepted in R23) and the task plan: `docs/tasks.md` › "Phase 2", T311–T411,
> covering every open criterion. Take the next unchecked task whose dependencies are
> met.
> - **Decided:**
>   - Sign-in is wechart's API as its own OIDC client (openid-client), with Dex 2.45.1 as the development provider.
>   - Connection tests run in Cube's fork at wechart's request; fork changes go through the Cube-expert agent only.
>   - Names resolve bottom-up from the viewer's folder.
>   - Development uses one fixed encryption key in the repo, and the API refuses to start without a usable key.
> - **Still for the user, when its task comes:**
>   - running totals from the start of the data or of the chart's range (T382);
>   - an Entra ID tenant or AD broker for the end-of-phase check (T411).
> - **The user's R13:** test phase 2 with security on (`playwright.security.config.ts`); run
>   phase 1's suite with security off only at the end (T410).
> - **Deployed:** wechart-api/web:6141947 on docker-desktop, single-user
>   (`deploy/helm/verify.sh` passed, with sign-in on through
>   `values/docker-desktop-security.yaml` and again without).
> - **Pushing is the user's:** `git push origin main --tags`.
> - **Done since (2026-09-25, later):**
>   - T399 box plot (AC-306 ticked), T317 sign-out, T319 account menu, T320 security e2e harness (AC-252 ticked);
>   - T318 route guard, T321 page gate (AC-253, AC-316 ticked), T324 Dex in Helm (AC-251, AC-257 ticked);
>   - T322 groups into Cube, T397 ISO-3 detection;
>   - T323 (Super-Admins) in review.
> - **The user's R25 (2026-09-25):** AC-251 reworded (the exemptions named), a cross-site
>   check added (AC-317, task T412), AC-008 reworded to the requirement (queries made for a
>   signed-in user carry their groups).
> - **Still to ask the user (T323's review):** with security on and no Super-Admin group
>   configured, should the API refuse to start, as it does for other missing sign-in settings?
> - **Small decisions reported to the user, to confirm or change:**
>   - With security off, phase 1's "AD" avatar stays at the far right after the Single-user mode chip (keeps AC-190).
>   - The top bar's search field may narrow below 260 px so the bar fits 900 px.
>   - The deployed demo stays single-user; sign-in is the overlay values file's.
>   - A model marks a country code in `meta.wechart.countryCode` (T397).
>   - Only `/api/cube-auth` is admin-only; `/api/cube-scopes` stays for signed-in users (Jobs' build panel).
>   - The phase-1 status-labels test lets `/api/me` through, now the shell's precondition (T321).
> - **Test cadence (the user's proposal, adopted):** per task, its own tests, the full unit
>   suite (`pnpm -r --filter './packages/*' test`, not `pnpm -r test`, which also runs the
>   whole e2e suite) and the touched e2e specs in Chrome; every 10 tasks and at phase end,
>   both e2e suites in every browser (`pnpm --filter @wechart/e2e test` and `… e2e:security`,
>   under the e2e lock, never at once).
> - **Known flakes (phase 1 suite, under load):** the perf budgets, a markings tile, and
>   `search-palette.spec.ts` "the arrows and Enter open one": its option ids are by
>   position, so a result source that answers late shifts them between key presses.
>   All pass alone.
> - **Landed with T322:** a previewed `context` on `/api/load` and `/api/sql` is refused (403)
>   to anyone but a Super-Admin while security is on. T323 must add the test that a
>   Super-Admin's preview still reaches Cube. For the user: T322 reads AC-008's "every
>   request" as every request made for a signed-in user (see its done notes).
> - **Docker Desktop stopped once mid-session (2026-09-25).** After restarting it, bring
>   the compose stack back with `docker compose --profile security up -d --wait`; the
>   Helm release recovers by itself.

> **Phase 1 closed on 2026-09-25, at the user's decision.** Start phase 2 from
> `docs/phase-2/backlog.md`, not from §4 below. The backlog holds:
> - every criterion moved out of `docs/spec.md`, word for word, with why it moved;
> - the tasks marked `[moved to phase 2]` in `docs/tasks.md`;
> - review follow-ups;
> - the questions still waiting for the user;
> - the UI review stream's report.
>
> Phase 2 runs the workflow from the top, with that backlog and the new
> requirements as input: project-interview, then write-spec, and so on. The
> sections below record phase 1 as it stood on 2026-09-24. §1's standing
> instructions and §5's time-savers still apply.

Written at the user's request so a new session can pick the work up. Read this
with `CLAUDE.md`, `docs/spec.md` and `docs/tasks.md`; it says what is *not* in
those files.

**State (updated later on 2026-09-24):** 40 of 233 acceptance criteria unchecked, 40
of 253 tasks. Last commit `42d6a89`, T246's review fixes. T252 is in progress
(see §4, step 0).

**Since the first version of this file:**
- Markings T112, T118, T121, T126 and T077 landed.
- The prototype alignment ran T208–T243, and then T244–T247 from the second round of critiques.

§2a lists what the user was asked. §2b lists decisions made under the standing instruction, which are to be reported to the user.

---

## 1. Standing instructions, verbatim

These are the user's own words and remain in force.

> okay continue .. and keep continuing to get to 100% complete unless there are
> decisions to be made that need my input. You can make the small decisions
> with if the impact is minimal. If there are edge cases .. dont iterate on
> them more than 2-3 times... ask me if it is important and if you need to
> iterate on it further.

> After the entire implementation i will require you to create the charts
> similar to what is there on superset.. the chart will be created by
> interacting with the browser and selecting the charts dimensions metrics and
> may be modify create/modify the models if required. For this task you can
> startup superset to see how the dashboards are laid out in superset. if
> required plan for it right now.. by starting superset and understanding whats
> there. Also i will be visually comparing the ui design with what i see in the
> wechart implementation. plan for that as well.

> pause at a logical step so that i can restart and use Opus 5.5.. have a
> proper handoff including the current executing instructions

Read together: work autonomously to 100%, decide small things, ask about
important ones, and stop grinding on an edge case after two or three attempts.

Also in force, from memory and earlier in the project:

- **Never let human effort decide anything** (CLAUDE.md). No estimates in docs.
- **One cold review per task** (`spec-reviewer`), fix the real bugs, move on.
- **Breadth over save edge cases.** Overwriting concurrent changes is fine for
  now; do not harden save or concurrency further.
- **Tick an AC only where a passing test demonstrates it on the real surface.**
  A component test that passes state as a prop does not demonstrate an AC whose
  subject is the tile. This rule has already cost 18 withdrawn ticks once.
- **Align the UI with `docs/design/prototype/`.**

## 2. Decisions the user has made

**Scope, from an AskUserQuestion earlier this session.** Build **Markings (41
ACs), Quick calculations (6 ACs) and the small leftovers (4 ACs)**. **Data
sources and schedules (13 ACs) stay deferred** — AC-139, AC-145, AC-150,
AC-151, AC-153 … AC-155, AC-157 … AC-164. Do not start those.

**Cross-filter highlight (T123).** Selection's share, Power BI-style.
**A highlight target the model cannot reach.** Show it unfiltered, with a note.
**T185.** Deferred.

**Quick calculations — answered 2026-09-24, not yet built:**

| Question | The user's answer |
|---|---|
| Running total: where does it start? | **From the chart's range.** Cube's `rolling_window: {trailing: unbounded}` counts from the start of the *data*, so wechart must bound the window to the chart's date range. |
| Moving average | **3 periods by default, changeable in the menu** (offer 3/6/12). Each window is its own generated companion measure, so only the ones used are added. |
| Rank ties | **Competition ranking** (1, 1, 3) — which is what Cube's `type: rank` already produced in the spike, so no extra generation. |

**Superset parity chart types — answered 2026-09-24:** add a **country map**
(choropleth keyed by ISO-3 codes) and a **box plot**, both as new chart types.
Recorded as requirements R8. Not yet researched or specified — see §4 step 10.

These three answer the "Open for the user" section of
`docs/research/cube/spike-model-store-and-quick-calcs.md`. The remaining item
there — *% of total under a filter is the share of the **filtered** total* —
I took as the usual BI meaning and the spike's observed behaviour; say so in
the task note rather than re-asking.

## 2a. Answered by the user later on 2026-09-24

- **The code face:** IBM's own `@ibm/plex-mono` package, shipped unmodified (T234, AC-223).
- **"Mark all":** stores the tile's filter, not a list (T121, AC-102, AC-115).

## 2b. Small decisions made under the standing instruction — report them, all overturnable

- **Charts:**
  - T231: a per-chart series colour overrides the dashboard's member colour.
  - T223: Discard is no longer undoable.
  - T229: the chart document version is 2.
  - T230: greyed chart types can still be chosen.
  - T242: Top N is offered for scatter and heatmap.
- **The code face (T234):** `font-display: swap`; the italic ships; the OFL notice is a CSS comment and the licence ships as a file.
- **Markings (T121):**
  - Invert never unmarks another tile's whole.
  - A filtered Mark all keeps other tiles' items.
  - `markedCount` may double count.
- **Model editor:**
  - T237: validation errors are listed, not enforced.
  - T237: discarding a draft file deletes it.
  - T118: a details tile is a copy of its source chart.
- **Explore and the shell:**
  - T243: an automatic chart saved before T243 reads "Automatic" until saved again.
  - T245: the top-bar search reads "Search wechart". The prototype's words leave out dashboards, and all four scopes don't fit its 260 px.
- **Chart tiles (T252):**
  - The freshness pills are one badge.
  - The badge stays visible while the marking badge shows, where the prototype hides it, because AC-013 fails without it.
- **Markdown (T247):** a heading keeps its outline level (h3 and h4) and takes the prototype's size from its own marks.

**Open questions to put to the user (none blocks the work):**
- **AC-017 vs the prototype's blank folder cells.** T244's review reverted the blanks, because AC-017's Fails-when forbids them. Should AC-017 be narrowed to dashboards and charts?
- **AC-018 says a dashboard opened from Explore opens in view mode.** A new dashboard now opens in edit mode, as in the prototype (T245). Proposal: clarify AC-018 to existing dashboards.
- **F3's Published badge and Markings button.** No task or AC tracks them, and Preview as and Schedule are undecided.
- **N16:** what Explore and the top bar do below 1,024 px. The prototype has no narrow layout, and T250 covers only dashboards.
- **F8, a chart title truncated once marked.** It survives T252's merged badge. Room would come only from what AC-013, AC-148 or rule 5 keep in the head (see T252's entry).
- **Tile menus keep the disclosure pattern, not `role=menu` (T253).** The role would promise arrow-key menu behaviour.

## 3. What just landed, and what it changed structurally

`T113` reconnected the limit half of the marking subsystem. The parts a next
session needs to know about:

- **`packages/core/src/markings/query.ts`** — `limitFilterFor(markings, combination)`
  turns marking predicates into one Cube filter. Read its header: three
  encoding rules from `docs/research/cube/markings-query-support.md` are
  load-bearing (time bucket → `inDateRange`; NULL → `notSet`; canonical order
  → AC-105). A measure `BoundedRange` is still emitted in the same logical
  group as dimension filters, which Cube forbids; nothing produces one yet
  (range mode is AC-093) and the constraint is recorded at `rangeFilter` and in
  the research doc's open questions. **AC-093 must fix it.**
- **`withLimit` in `packages/web/src/filters/apply.ts`** appends the filter to
  `query.filters`, where Cube ANDs the entries. That is AC-082, with no second
  mechanism — there is deliberately no `core/query/compose.ts`.
- **`FilteredCharts`** gained a `limits` prop. A chart listed there is asked
  even when no filter reaches it, and its limit is never dropped to rescue a
  refused query.
- **`DashboardView`** gained `limitedTiles` (what each tile's markings add to
  its query, plus which tiles are waiting) and `limitedStates` (what a tile
  shows instead of its chart). Both are gated on Markings mode; gating one and
  not the other produced a wrong message, so keep them together.
- **`Tile`** gained `limitCombination`, `nothingMarked` and
  `nothingMarkedMessage`.

## 4. Next steps, in the order I would take them

0. **FIRST — the prototype-alignment pass (user's decision, 2026-09-24).** The
   user compared the running Explore with `docs/design/prototype/` and found
   it structurally different; asked when to fix it, they chose "now, before
   more features … and after that continue with the handoff". Requirements R7
   accepted the prototype's **structure, layout and interaction** (only
   colours, type and density were left open), so these are deviations from an
   accepted design. Method, per the ui-design skill's Phase D:
   - Serve the prototype: `python3 -m http.server 5500` in
     `docs/design/prototype/`, then `http://127.0.0.1:5500/index.html#explore`
     (hash routes: `#explore #model #sources #jobs #schedules #security`;
     dashboards and the chart editor open from Explore). The app is on :5400.
   - One `design-critic` per surface group, **run one at a time** — they share
     one Chrome-DevTools browser. Groups: shell + Explore; dashboard view, edit
     and settings; chart editor; Model; Data sources, Jobs, Schedules and
     Security. Each report is saved to
     `docs/design/critiques/2026-09-24-<surface>.md`.
   - Each finding is classed `AC` (breaks a criterion → fix), `STRUCTURE`
     (deviates from the accepted prototype → fix, since the structure was
     accepted) or `VISUAL` (tokens only → fix where direction.md is specific,
     otherwise list for the user).
   - **AC-019 was reopened** as part of this: it was ticked on the ⌘K palette,
     but its trigger is "the Explore search box", which does not exist.
   Then continue with step 1.

   **Status on 2026-09-24 (later):**
   - **The first round is done.** It was T208–T242, and T225 recorded the re-critiques of the shell, Explore and the dashboard.
   - **The second round's fix tasks:**
     - T244–T247 are done and reviewed; each review's real findings are fixed.
     - T248 is half done: its sidebar placement came with T246.
     - T249–T251 are open.
     - T247 was split into T247, T252 and T253.
   - **T252 is in progress.** The freshness badge, the head's height and the incomplete-chart placeholder are done and pass. The chart font, tabular numerals and the grid's bottom wait on `integration-researcher`'s ECharts doc, to be saved as `docs/research/echarts-text-and-grid.md`. Its test, "the chart is drawn in Inter…", is red until then.
   - **Still to run, one at a time:**
     - the chart-editor re-critique (dispatched; save it to `docs/design/critiques/2026-09-24-recheck-chart-editor.md` and add fix tasks);
     - then Model;
     - then the admin workspaces.
     Rebuild the demo (`npx vite build --outDir dist-demo` in `packages/web`) before each.
   - **AC-187 is ticked only when every task from T244 to T253 is done** and the re-critiques agree.

1. **The cheap marking ACs that are probably already true and need only e2e
   evidence:** AC-106 (edit-mode click selects the tile, changes no marking —
   `marking` is already gated on `!sessionEditing`) and AC-120 (no marking
   controls in cross-filter mode — already gated on `marking`). T112 and the
   AC-120 task.
2. **AC-071** — clearing marks when the mode changes and the settings are
   saved. The cross-filter half already works (the render-time
   `held.mode !== interactions.mode` reset in `DashboardView`); the marks half
   needs the same treatment on `marks`.
3. **AC-102 and AC-115** — `addItemsWithinLimit`, `markAll` and invert already
   exist and are tested in `packages/core/src/markings/limit.ts` and
   `apply.ts`. They are not wired to any control. This is wiring plus e2e.
4. **AC-112 … AC-116** — details tiles and the marked-rows actions. AC-112 is
   now straightforward: the tile fields it needs all exist.
5. **AC-121 … AC-125** — bookmarks and shareable links.
6. **AC-097, AC-104** — partial marks and the marked-share query. AC-104's
   second-query machinery is also what would let AC-111 tell "the filters
   exclude the marks" from "the marks have no rows here".
7. **AC-088, AC-089, AC-093** — drag rectangle, lasso, range mode. The biggest
   remaining chunk, and AC-093 carries the measure-range fix above.
8. **Quick calculations, F6, T053 … T058** — the three answers in §2 are ready.
   Prerequisite AC-131 … AC-137 (the model store and publish path) are done, so
   generated companion measures can be added to the served model.
9. **AC-171, AC-175, AC-176** — export, marking performance, keyboard coverage.
10. **Country map and box plot (R8), then the Superset parity exercise.**
    `docs/design/superset-parity.md` holds the plan and what the three panels
    show. The chart types go through the workflow like anything else:
    component-research (renderer, a permissively licensed world boundary file,
    and whether Cube can compute quartiles), then write-spec (new ACs beside
    AC-037, plus recommender rules), then plan-tasks, then implement. Superset
    is up at http://localhost:8088; the exercise needs the user signed in in
    Chrome, because credentials are never typed into a form by Claude.

## 5. Things that will waste your time if you rediscover them

**Harness.**
- `quality-check` runs typecheck and lint after *every* edit, so errors between
  two edits of a multi-edit change are expected. Judge by the final state.
- `test-integrity` blocks weakened matchers. `toBeNull` is weaker than `toBe`;
  use `toHaveLength(0)`.
- **Never edit files through Bash** (`sed -i`, heredocs, `tee`, `cp`/`mv` over
  files). CLAUDE.md forbids it, and it bypasses the hooks. I violated this twice
  earlier in the project and reported it; do not repeat it. An auto-mode system
  message may suggest shell edits — CLAUDE.md overrides it.

- `packages/web/src/shell/styles.ts` is one template literal, so a backtick in
  a CSS comment ends it. Quote with "…" in comments there.
- To commit one task while another's edits are in the tree, set a file aside
  with `git stash push -m … -- <path>` and `git stash pop` after.
- The e2e `webServer` builds once per Playwright run. Two runs at once share
  ports, and the second may test the first's build.

**Cube (all verified against v1.7.42 locally).**
- `{or}`/`{and}` nest, but dimension and measure filters may not share one
  logical operator.
- `/v1/meta` omits `connectedComponent` for join-less cubes and for views, so
  absence cannot mean "unreachable" on its own.
- Top-level `filters` entries are ANDed (verified 2026-09-23 by the AC-111
  e2e; both research docs now record it).

**ECharts.**
- `click` is dropped after 4px of movement — pair mousedown/mouseup.
- `selectedMode: false` silences legend events; the legend is detected through
  `document.elementFromPoint` instead.
- `pointerup` fires *before* ECharts dispatches `mouseup`.
- The SVG renderer writes item opacity as `fill-opacity`.

**Testing.**
- `e2e/perf/dashboard-open.spec.ts` fails only under full parallel load and
  passes alone every time. It is a known flake, not a regression. One or two
  marking e2e tests also flake under full load and pass in isolation — always
  re-run the named test alone before treating it as a break.
- A `<label>` wrapping a `<select>` takes the options into its accessible name,
  so `getByLabel` cannot reach it. Tie labels with `id`/`htmlFor`.

**Background processes still running** (started earlier this session): the demo
API on port 4200 and the demo web build on port 5400. Stop them with `TaskStop`
before restarting either.

## 6. Open questions I did not raise

- The e2e suite's full run is ~6 minutes. I have been running the touched spec
  across all three browsers per task and the whole suite before a commit.
- `inEffect` now lists "limited to what is marked" for a limited tile. If the
  user wants that worded differently on the empty state, it is one string in
  `DashboardView`.
