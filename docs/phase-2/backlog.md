# Phase 2 backlog: carried over from phase 1

**Decision (the user, 2026-09-25):** end phase 1 at a logical point and move everything pending to phase 2. Phase 2 starts with this backlog and the new requirements together, through the workflow from the top: project-interview, then write-spec, component-research, ui-design, plan-tasks and implement. What's here goes into that interview as input, and is prioritised there alongside the new requirements. It doesn't set phase 2's order.

Phase 1 closed with every other acceptance criterion in `docs/spec.md` checked on a passing test. The criteria below were taken out of `docs/spec.md`, and each feature section there points here. Their IDs stay theirs: IDs are global and never reused, so phase 2's spec can take a criterion back under its own ID. The tasks that were planned for them are still in `docs/tasks.md`, with their notes and research, marked `[moved to phase 2]`.

## 1. Acceptance criteria moved from phase 1

Each is quoted exactly as `docs/spec.md` had it, with why it moved and the tasks planned for it.

### F6. Quick calculations and calculation requests

These were deferred at the user's decision: integrate what Cube Core supports, and defer what needs machinery beyond it. Quick calculations generate companion multi-stage measures into the served model. The user's answers on running total, moving average and ranking ties are in `docs/handoff.md` §2.

- AC-047 WHEN the user opens the menu on a measure in the chart editor, THE SYSTEM SHALL offer % of total, difference from previous period, % difference from previous period, running total, rank and moving average.
  Fails when: any of the six is missing from the menu.
- AC-048 WHEN a quick calculation is applied, THE SYSTEM SHALL compute it in Cube as a multi-stage measure rather than in the browser, and the tile SHALL label the measure with the calculation applied.
  Fails when: the value is computed from the already-fetched rows, or the label does not name the calculation.
- AC-049 WHEN a quick calculation needs a time dimension and the chart has none, THE SYSTEM SHALL disable it and say which field is missing.
  Fails when: the calculation is offered and produces an error, or gives no reason when disabled.
- AC-050 WHEN the user requests a calculation the menu cannot express, THE SYSTEM SHALL record a request carrying the chart, the fields in use and the user's description, and show it in the Model workspace.
  Fails when: the request is stored without the chart reference, or does not appear in the Model workspace.
- AC-051 WHEN a semantic-layer engineer opens a calculation request, THE SYSTEM SHALL open the target cube in the model editor with the request visible beside it.
  Fails when: the editor opens without the request, or on a different cube than the request names.
- AC-052 WHEN a requested measure is added to the model and published, THE SYSTEM SHALL mark the request as resolved and name the member that resolves it.
  Fails when: the request stays open after the member exists, or names no member.

Tasks: T053, T054, T055, T056, T057, T058.

### F10 and F11. Markings: what phase 1 didn't reach

The marking subsystem shipped. It covers click, Ctrl/⌘ and keyboard marking, chips and badges, limits and details tiles, Filter to marked, View marked rows, the details panel, Drill by, Copy, bookmarks and links. These four refinements were not built.

- AC-093 WHILE a marking is in range mode, THE SYSTEM SHALL let the user drag along an axis to mark a continuous range, show it as a coloured stripe on that axis, and keep its bounds when filters change (direction.md rule 30 of §7a; `[R7]`).
  Fails when: the stripe does not appear, or the bounds move when a filter changes.
  - It carries the measure-range fix recorded at `rangeFilter`: Cube forbids a measure `BoundedRange` in the same logical group as dimension filters (`docs/handoff.md` §3; T113's note).
- AC-097 WHEN an item is partly marked and its measure is additive, THE SYSTEM SHALL draw the marked share from the baseline at full strength and fade the remainder; WHEN the measure is not additive, THE SYSTEM SHALL draw the whole item with a pattern and show the marked and total values in its tooltip (direction.md rule 49; `[docs/inputs §11]`).
  Fails when: a partial average or distinct count is drawn as a sub-length, or a partly marked sum shows no marked share.
- AC-104 WHEN a tile needs the marked share and the marking's members are not among its own groupings, THE SYSTEM SHALL obtain it with one additional query per tile and keep the unmarked result cached across marking changes.
  Fails when: more than one extra query per tile is issued for a marking change, or the base result is re-fetched when only the marking changed.
  - When it is built, run `e2e/perf/marking-update.spec.ts` (AC-175) again. The second query adds load that phase 1's measurement didn't include.
- AC-116 WHEN a text tile contains a marking token, THE SYSTEM SHALL render the marking's summary or count, and a measure token limited by a marking SHALL show the measure over the marked rows, or over all data when nothing is marked.
  Fails when: a token renders as literal text, or a limited measure ignores the marking.

Tasks: T110 (AC-104), T122 (AC-116), and T190, whose only open criteria are AC-093 and AC-097.

### F17. Jobs, builds and scheduling

AC-150, AC-151, AC-155 and AC-234 need wechart's own scheduler and build history, beyond what Cube Core exposes, and were deferred at the user's decision. AC-153 and AC-154 were built and ticked, then reopened by T258's, T159's and T160's reviews (T264). AC-145 needs Cube's undocumented system partitions route, whose secret opens much more (`docs/research/cube/system-partitions.md`, Security).

- AC-145 WHEN the user opens a partitioned rollup in Jobs, THE SYSTEM SHALL list every partition Cube derives from its build range in the time zones wechart builds in, each with its period, its build state (built, not built, building or failed) and the time Cube last built it, and SHALL rebuild the partitions the user selects through Cube's jobs API.
  Fails when: a partition Cube lists for the rollup is missing, or shows a last build time other than Cube's newest version of it; or a rebuild starts a job whose table names a partition the user did not select, or starts none for one they did.
- AC-150 WHEN a pre-aggregation build finishes, whether wechart started it through Cube's jobs API or Cube's refresh worker started it on its refresh key, THE SYSTEM SHALL record it in wechart's own history with its pre-aggregation, partition, what started it, its duration, its outcome with Cube's error when it failed, and a log of what Cube reported for it. It SHALL also list the record in the Jobs workspace's Run history after Cube's own record of the job has expired, and keep the latest 100 records of each pre-aggregation.
  Fails when: a build that finished more than 24 hours ago is missing from Run history, or lacks any of those fields; a rebuild of a rollup with a `* * * * *` refresh key is not in Run history within one of Cube's check periods of finishing; a build started from Jobs that finishes while no browser has Jobs open is not recorded; a recorded outcome differs from what Cube reported; or a pre-aggregation has more than 100 records.
- AC-151 THE SYSTEM SHALL show the build queue with each entry's pre-aggregation, partition, state and token, and allow cancelling a queued entry.
  Fails when: a queued build is missing, or cancelling leaves it queued.
- AC-153 WHEN the user sets a pre-aggregation's refresh schedule in the model editor as a cron expression and time zone, THE SYSTEM SHALL accept only expressions Cube's refresh worker can run, show the next runs Cube's refresh key implies with a note that a run can start up to about five minutes after its time, and write the schedule into the model as that pre-aggregation's `refresh_key`, validated and published as any model change.
  Fails when: a shown run differs from when Cube's refresh key turns over, an expression Cube cannot run is published, or the pre-aggregation is not rebuilt within one of Cube's check periods of a shown run.
- AC-154 THE SYSTEM SHALL list every pre-aggregation's refresh schedule in Schedules, label each with its owner, Cube's refresh worker or wechart's scheduler, show Cube-owned schedules read-only there with a link opening the pre-aggregation in the model editor, and say when one is not scheduled (direction.md rule 34).
  Fails when: a `refresh_key` schedule is editable on the Schedules page, is unlabelled, or its link does not open the model editor.
- AC-155 IF a scheduled build fails repeatedly, THEN THE SYSTEM SHALL suspend the schedule after the configured number of consecutive failures, say so on the schedule, and offer Resume.
  Fails when: the schedule keeps running after the limit, or offers no Resume.
- AC-234 WHEN the user creates a schedule for a pre-aggregation build or a cache warm-up that a refresh key cannot express, THE SYSTEM SHALL accept a cron expression and time zone, show the next runs it implies, and start each run at its time through Cube's jobs API. **Deferred with AC-150 and AC-155** (see the status note above).
  Fails when: the next runs shown do not match the expression, or a due run does not start.

Tasks: T151, T156, T261, T262, T157, T264, T161, T259, and T263. Cube already runs v1.7.45 (the fork's build, `cube:v1.7.45-introspection-f6355de982`). What's left of T263 is its check that a failed import reports as a failure, which belongs with Run history (AC-150).

### F18. Data sources and connections

These were deferred at the user's decision, because they need machinery beyond Cube Core. Cube reads its data sources from its own environment, so creating one means changing that and restarting Cube. The user's Cube fork now has an introspection API, which wechart uses to generate cubes (T145, T275, T276; AC-139, AC-249, AC-250). Phase 2 can build on it.

- AC-157 THE SYSTEM SHALL list every configured data source with its driver type, its health from the last test, and the cubes assigned to it.
  Fails when: a configured source is missing, or the cube list disagrees with the model.
- AC-158 WHEN the user adds a data source, THE SYSTEM SHALL take the driver type, the connection fields for that driver, a Test step and a name, and SHALL refuse to create it until the test passes or the user explicitly overrides (direction.md rules 23, 35).
  Fails when: a source is created with a failing test and no override.
- AC-159 WHEN the user runs a connection test, THE SYSTEM SHALL run it from the wechart service, show each check's result, and show the driver's error text when a check fails.
  Fails when: the test runs in the browser, or a failure shows no error text.
- AC-160 THE SYSTEM SHALL offer PostgreSQL, Snowflake, Databricks, BigQuery, SQL Server and Oracle as driver types, with each driver's own authentication fields (`[R4]`).
  Fails when: a listed driver is absent, or its form omits an authentication method the driver requires.
- AC-161 WHEN a connection's settings change, THE SYSTEM SHALL say that Cube must restart before they take effect, and show whether the running Cube has picked them up.
  Fails when: the UI claims the change is live while Cube still uses the previous settings.
- AC-163 THE SYSTEM SHALL record the result of each connection test over time and show that history per source.
  Fails when: a test result is missing from the history.
- AC-164 THE SYSTEM SHALL never show a stored credential in plain text after it is saved, and SHALL never send it to the browser.
  Fails when: a saved secret is readable in the UI or in a response to the browser.

Tasks: T163, T164, T165, T166, T167, T169, T170.

### F21. Browsers

The acceptance suite runs in Chrome, Firefox and Safari. Edge was deferred at the user's decision on 2026-09-22 (T185). It needs the `msedge` channel, whose install asks for the machine's password, or a CI run, which needs a push. The Playwright and CI configuration for all four browsers is in place (T001). The criterion is ticked by a four-browser run, not by the local three.

- AC-180 THE SYSTEM SHALL work in current Chrome, Edge, Firefox and Safari on desktop (`[R7]`).
  Fails when: any acceptance test in this spec fails in one of those browsers.

Task: T185.

## 2. Follow-ups found in phase 1's reviews

These are not criteria. Each needs either a spec decision or research before it can become one.

- **A link with a very large marking can exceed a URL limit** (T127–T129's review). A proxy's or server's limit on a request line would stop it opening. The limit needs research before a cap or a fallback, such as offering a bookmark instead, is chosen.
- **A link's `view` is taken only when the dashboard mounts.** An in-app navigation to the same dashboard carrying `view` would be ignored, although nothing in the app makes one today.
- **Bookmarks:**
  - They can be saved and applied, but not renamed or deleted, and no criterion asks for either.
  - They belong to a dashboard, shared by everyone, which only suits single-user phase 1. With users and groups (below), phase 2 should decide whose they are.
  - Two saves under one name at the same moment can both be kept. This was left as is, following the standing guidance not to harden concurrency.
- **Copy link with marks is in the marking chip's menu only.** direction.md also lists it in the tile's ⋯ menu, whose order an e2e pins.
- **A camelCase `preAggregations` key isn't read by the unknown-name check.** `rollupReferences.ts` (AC-189) reads only `pre_aggregations`. The join check (AC-235) reads both, since Cube accepts both.
- **Cube's refusal names cubes, not rollups** (AC-235), so it is placed by matching cubes. When a cube's rollups fail on different cubes, Cube reports only the first, and a second publish shows the next.

## 3. Questions for the user, carried into phase 2

Each is recorded where it arose.

- **AC-017 and the prototype's blank folder cells** (`docs/handoff.md` §2b): should AC-017 be narrowed to dashboards and charts?
- **AC-018:** a new dashboard opens in edit mode, as the prototype does (T245). Should AC-018 be clarified to mean existing dashboards?
- **F3's Published badge and Markings button:** no task or criterion tracks them, and Preview as and Schedule are undecided.
- **N16:** what Explore and the top bar do below 1,024 px (T250).
- **F8:** a chart title is truncated once marked (T252).
- **Export's four image choices** (T272, "M2"):
  1. the image carries the tile's surface;
  2. PNGs are at the device pixel ratio;
  3. images are disabled while a newer answer is on its way;
  4. the tile's title is not in the image.
- **A failed save leaves edit mode**, and the session's changes with it (T192).
- **Duplicate** (T068):
  - whether the copy joins the original's tile-scoped filters;
  - that it keeps the original's chart title;
  - Duplicate on tile kinds other than charts.
- **The canvas panes are fixed-height in view mode too** (T073).
- **The item cap:** the spec says 1,000, while direction.md's open list still asks (T108).
- **Rollups:**
  - the Rollups row for `rollup_join` and `rollup_lambda`, whose authoring is a non-goal (T148);
  - a rollup Cube plans but hasn't built reads as served (T153).
- **The UI design review's proposed spec changes** (listed in §5 once the UI agent reports).

## 4. Already decided for phase 2

- **Users and groups** were deferred from phase 1 (single-user) to phase 2.
- **Country map and box plot** (R8, the user's answer of 2026-09-24): a choropleth keyed by ISO-3 codes and a box plot, as new chart types. They still need research (a renderer, a permissively licensed world boundary file, and whether Cube can compute quartiles), then spec and tasks. The Superset parity exercise follows (`docs/design/superset-parity.md`).
- **Cube fork changes** are made only through a Cube-expert agent, on the fork's `feat/data-source-introspection-api` branch.

## 5. The UI design review at phase 1's close

(Filled in when the UI agent reports: its branch, what merged, AC-187's standing, and its open findings.)
