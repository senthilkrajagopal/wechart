# Phase 2 backlog: carried over from phase 1

> **Absorbed into the spec, 2026-09-25.** The user took every backlog group into phase 2 (requirements.md, R16). Everything in §1 is back in `docs/spec.md` under its own ID, and the UI review's proposed changes and the R8 chart types are there as AC-041, AC-220 and AC-299 … AC-306. This file stays as the record of why each moved; `docs/spec.md` and `docs/requirements.md` Part 2 govern.

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

Tasks: T151, T156, T261, T262, T157, T264, T161, T259, and T263. Cube already runs v1.7.45: since 2026-09-26 the fork's package xcube, `xcube:v1.7.45-a13b9cff43` (T417). It was the package's earlier name, `cube:v1.7.45-introspection-0b6eef90a9` (T413), and before that the overlay build, `cube:v1.7.45-introspection-f6355de982`. What's left of T263 is its check that a failed import reports as a failure, which belongs with Run history (AC-150).

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

### F21 and F22–F23. Keyboard, design conformance, and three shipped criteria a late critique failed

The UI design review stream ended with re-critiques of every surface on 2026-09-25:
- `docs/design/critiques/2026-09-25-shell-explore.md`
- `docs/design/critiques/2026-09-25-chart-editor.md`
- `docs/design/critiques/2026-09-25-dashboard.md`
- `docs/design/critiques/2026-09-25-model-admin.md`

AC-176 was un-ticked by T182's review. AC-187 was never met. AC-201, AC-220 and AC-246 shipped with passing tests, but the critique measured one case of each that fails its SHALL. They moved rather than stay ticked on tests that miss that case.

- AC-176 THE SYSTEM SHALL make every action reachable from the keyboard: navigation, authoring, marking, filtering and every dialog, with a visible focus indicator distinct from the marking outline (direction.md rules 39, 52).
  Fails when: an action can be performed only with a pointer, or focus is invisible on any control.
  - Still pointer-only: cross-filtering, and marking on scatter points, legends, trellis panels and table rows (T307). T306 drew the keyboard's item apart from the marking outline.
- AC-187 THE SYSTEM SHALL draw the app bar, workspace navigation, buttons and inputs, the dashboard header and page tabs, the filter bar, tiles, and the edit sidebar with the component styles of the design prototype the user approved (`docs/design/prototype/index.html`, published as "wechart Workbench"; the user, 2026-09-21: "align with the ui styles in" it), in the tokens of direction.md §3–5.
  Fails when: one of those components' computed height, padding, border width or radius, font size or weight, or colour token differs from the prototype's rule for the same component.
  - Measured differences still open:
    - **Dashboards:**
      - the KPI head;
      - link and image tiles carrying tile chrome, and link buttons at radius 4 and weight 400;
      - chart legends and bars at ECharts defaults, with rounded ends only on a grouped bar's last series (direction.md §6);
      - `.seg`'s pressed state;
      - the tile ⋯ menu's max height;
      - the add slot and template rows;
      - the filter-pill value control;
      - three border differences.
    - **Model workspace:**
      - 32 px inputs;
      - the `.seg` tint;
      - picker chips;
      - the Generate dialog's buttons.
    - **Admin:**
      - the Jobs pane's buttons;
      - query-log selects at 24 px;
      - the Security textarea's line height.
    - **Chart editor:** the preview tile vanishes while loading.
    - **Shell:**
      - R12 is forced by AC-005 and needs a §7d record.
      - R1: Inter is never shipped, so the platform font paints. That is for the user to decide (§3).
- AC-201 THE SYSTEM SHALL show the marked-items badge in a chart tile's header row, beside its title, and only on chart tiles whose marking holds something.
  Fails when: the badge pushes the title down, or appears on a tile that does not mark or whose marking is empty.
  - Dashboard critique N1:
    - A marked KPI tile's title box measures 0 px at 1440×900, and at 1280×800 while editing.
    - The badge reads "Marking: 1 marked" where the prototype's reads "1 marked", with the name in its tooltip.
    - KPIs carry a freshness badge and a table-view button the prototype's don't.
    - The head reserves 90 px for its buttons, against the prototype's 54.
- AC-220 THE SYSTEM SHALL name every member by its title from the model wherever a person reads it — legends, tooltips, table headers, well pills, marking chips and the "Why this chart?" trace — and never by its internal name.
  Fails when: a legend, table header, pill, chip or trace shows a name such as "orders.count".
  - Chart-editor critique #9: the Acceleration tab reads "Stopped by orders.count: orders has no pre-aggregations". The member comes from `/api/acceleration`, and the API writes the reason with cube names. `AccelerationPanel.test.tsx` and `e2e/preaggregations.spec.ts` pin the internal name today.
- AC-246 WHEN the user right-clicks a chart tile's plot, or presses Shift+F10 or the Menu key on a focused chart tile, THE SYSTEM SHALL open the tile's menu at the pointer or at the tile, and the browser's own menu SHALL not open there.
  Fails when: the browser's context menu opens instead, the keys do nothing, or a right-click changes a marking.
  - Dashboard critique N8: a chart tile with no fields yet is announced "Shift and F10 open its menu", and Shift+F10 opens nothing.

Tasks: T182, T307 (AC-176), T225 (AC-187), and new ones for the fixes above.

## 2. Follow-ups found in phase 1's reviews

These are not criteria. Each needs either a spec decision or research before it can become one.

- **A link with a very large marking can exceed a URL limit** (T127–T129's review). A proxy's or server's limit on a request line would stop it opening. The limit needs research before a cap or a fallback, such as offering a bookmark instead, is chosen.
- **A link's `view` is taken only when the dashboard mounts.** An in-app navigation to the same dashboard carrying `view` would be ignored, although nothing in the app makes one today.
- **Bookmarks:**
  - They can be saved and applied, but not renamed or deleted, and no criterion asks for either.
  - They belong to a dashboard, shared by everyone, which only suits single-user phase 1. With users and groups (below), phase 2 should decide whose they are.
  - Two saves under one name at the same moment can both be kept. This was left as is, following the standing guidance not to harden concurrency.
- **⌘K results grouped by kind** (UX-013's second half, the 2026-09-27 re-check's cleanup item 12; found by T478's review, 2026-10-04). The re-check recommends Dashboards, Charts and Models, then "Fields (_n_)" collapsed to 3, with the cube as a group rather than a detail line. T478 built only the first half: members and their cubes by title, never an id. No task or criterion asks for the grouping. AC-191 asks only that each result has its type.
- **Copy link with marks is in the marking chip's menu only.** direction.md also lists it in the tile's ⋯ menu, whose order an e2e pins.
- **A camelCase `preAggregations` key isn't read by the unknown-name check.** `rollupReferences.ts` (AC-189) reads only `pre_aggregations`. The join check (AC-235) reads both, since Cube accepts both.
- **Cube's refusal names cubes, not rollups** (AC-235), so it is placed by matching cubes. When a cube's rollups fail on different cubes, Cube reports only the first, and a second publish shows the next.
- **The flaky markings test's expected count** (added 2026-09-27; the user approved correcting it and put it here, to do after the rest). In `e2e/markings.spec.ts`, "Invert marking and Mark all…" fails 3 of 6 runs alone.
  - The likely cause: the test predates AC-097's marked share. Once the status tile marks "shipped", the category tile's Components bar is partly marked. Its marked share then draws a third path ("1 of 3", where "1 of 2" is expected) whenever the share's query answers before the first poll.
  - The fix: correct the expectation to the count the marked share gives, and wait for that share's query, so the test no longer races it.

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

It was merged into main as 7140626: T182's review round, T300–T306, T309, T310, and T225's four re-critiques. AC-176 and AC-187's standing, and the three shipped criteria a critique failed, are in §1.

**Open findings that no criterion covers yet:**
- Clicking a mark in the chart editor's preview offers no drill or filter (direction.md rule 31).
- Admin error states have no Retry or Details (rule 18).
- Below 1,024 px, the dashboard's filter bar isn't a sheet (direction.md §2).
- At 390 px the shell overflows (N16, §3).
- The empty KPI tile's "No value" sits above its name, and the prototype's bottom alignment isn't carried over (T300).
- `search-palette.spec` has known flaky tests.

**Two tests the review stream found wrong, and changed to the criteria:**
- `customize.test.ts` asserted that a horizontal bar never stacks. AC-219 says its series can.
- `chartTypeCatalog.test.ts` expected a pivot to need "2 dimensions". A pivot also draws from a time dimension and a dimension.

**Spec changes it proposes, for the user.** Each gives the criterion, then its Fails-when:
- **Value-axis labels:** "WHEN a chart's value-axis labels would overlap at the tile's width, THE SYSTEM SHALL thin or abbreviate them so no two overlap." Fails when: two value-axis labels overlap in a drawn tile.
- **Series order:** "WHEN the user orders a chart's series in Customize, THE SYSTEM SHALL draw, stack and list them in that order, and keep it after a refresh." Fails when: series stack alphabetically after another order was set, or the order changes on refresh.
- **Table columns:** "THE SYSTEM SHALL order a table's columns as the wells order its fields: time and dimensions, then measures in the Metrics well's order." Fails when: a table's columns differ from the wells' order.
- **AC-041, amended:** "WHEN the user sets Top N, THE SYSTEM SHALL offer to fold the rest into "Other (n)" or drop it, and SHALL offer a row limit that drops rows past it." Fails when: the remainder cannot be dropped, or no row limit can be set.
- **Markdown tiles:** "WHEN the user selects a markdown tile in edit mode, THE SYSTEM SHALL let them edit its text and render the change." Fails when: a markdown tile's text cannot be changed in the UI.
- **AC-220, amended** (with T257's N5): name a member "by its short title where its cube or view is evident (a pill, a legend or a KPI label of a one-source chart), and its full title elsewhere." Fails when: a one-source chart's legend or KPI label repeats the source's title.
- **Pie labels:** "WHEN data labels are on for a pie or donut, THE SYSTEM SHALL draw each label whole, moving or hiding labels that do not fit." Fails when: a slice label shows a truncated value such as "$…".
- **Narrow shell:** "WHILE the window is narrower than 1,024 px, THE SYSTEM SHALL fit the app bar within it, folding navigation and search into a menu." Fails when: a page scrolls sideways at 390 px.

**Decisions it asks for:**
- Whether to ship Inter (R1), which needs a research doc and a task.
- Recording R12 in direction.md §7d.
- ACs for maps and the box plot, beside AC-037. The spec's non-goals still list maps.
- Still pending from earlier rounds:
  - T245's palette wording;
  - AC-017's folder rows;
  - T246's header items;
  - AC-231's settings-page ruling;
  - the filter bar as a sheet in direction.md.

## 6. Design items held back (R37, 2026-09-27)

R37 asks for both UI reviews' designs to be built, with the 2026-09-27 ones winning where they differ. Items blocked by a decision, by xcube, or by wechart work not yet built go here. `docs/design/reviews/status.md` tracks each design.

**(a) Waiting on the user's decision**
- **2026-09-24 design 02, state B / approve 5:** underlying rows by the measure's drill members. It is a proposal the user never decided, and it changes AC-036.
- **2026-09-24 design 04, approve 5:** a coarser default time grain (a proposal).
- **2026-09-24 design 08:**
  - .xlsx export (research and approval, spec.md F23);
  - state B's "Keep as details tile".
- **2026-09-24 design 03, note 4:** "Hide" rather than "Edit in form anyway". Claude chose it because the form now keeps comments (T482).
- **Model editor below 1,024 px:** MW-26's overlay, or today's stacking (T396).
- **The Model workspace's differences from 2026-09-24 design 03, built with reasons recorded only in tasks.md** (T406, 2026-10-08; the coordinator's direction to record them here; `docs/design/critiques/2026-10-08-model-workspace.md`, Q2). Each waits on the user, to keep as built or to build as drawn:
  - **The editor's head without `model/`:** the design writes "model/cubes/orders.yml"; the app writes the path as the address names it, "cubes/orders.yml" (T479, T494; AC-002).
  - **Format as a text field:** the design draws a select, "(not set)"; the app takes typed text, because Cube also takes d3 format specifiers, which a select can't hold (T494; research `data-modeling.md`, Formats).
  - **The tab strip's spacing:** the design draws padding 0 8 with a 2 px gap, and tabs padded 0 9; the app has 8 px and no gap. T470 recorded that they don't fit at the design's spacing, with 29 px to spare at the app's; the 2026-10-08 critique's arithmetic gives the design's spacing 30 px more, an overflow of 1 px.
  - **The 676:524 split:** the design's drawing is 676:524, and its note 8 says "1.15 fr : 1 fr" (642:558); the app follows the drawing, because the tabs don't fit at 642 (T470).
  - **A shared model file, read-only, with "Edit in my workspace" (T451):** no design draws it. The nearest is 2026-09-27 design 03 state A (data source settings: a 32 px "Edit in my workspace" and a 22 px bg-subtle badge on a meta line). Options: keep it as built; carry state A's badge and button over; or have a design drawn.
  - Also recorded only in tasks.md, and asked with these: "Checked against Cube's rules as you type" for the design's "Checked with Cube's validator on every change"; code at 12/16 for the design's 12/19 (direction §3 says 12/16); Refresh as a titled group, the time zone's wording and Title's placeholder; Description with no placeholder.
  - Not here: the 12 px badges, which D5 records and design 12 (later) draws.
- ~~**2026-09-27 design 05, state M:** the rejected band's Dismiss. Is it kept for the user (on every device, until the item is proposed again) or for the session only? The design doesn't say. T358 draws the band (T353's review, 2026-09-28).~~ *Answered 2026-09-28 (R42.1): until proposed again, for the user on every device.*
- **MW-13:** the proposed empty-list line.
- **2026-09-27 design 01, approve 11:** whether to ask vendors for permission to show their logos (T472 uses monograms).
- **2026-09-27 design 07, state F:** the Access panel with sign-in off. This contradicts the earlier answer "no Access button with sign-in off" (`docs/handoff.md`, T330).
- **references.md › Phase 2 › surface 2 (the Access panel), where design 07 is silent** (found by T473's review, 2026-10-04). No task covers these, and T473's failing test didn't name them:
  - the panel in the address (`…?panel=access`);
  - "Access…" in a subfolder row's ⋯;
  - Delete or Backspace on a focused group row removes it;
  - F6 takes the panel into the pane cycle;
  - opening focuses the panel's heading (it focuses the panel itself, as T330 built it).
- **2026-09-27 design 03, state E:** a "Scheduled health check" row. It is only needed if periodic tests are wanted, which is a spec change.
- **Explore and the top bar below 1,024 px:** neither review designs them (§3, N16).
- **2026-09-27 design 04, pin 6:** "Search My workspace" or "Search Sales / EMEA" names the box for its folder, but AC-019's Explore search looks through the whole library, not one folder. Either the search is scoped to the open folder (an AC-019 change), or the box keeps its global label.
- **Jobs and Schedules, from the 2026-09-28 sync check (R40; `docs/design/reviews/2026-09-28-jobs-schedules/`).** *Trigger, cache warm-up, AC-155, Data as of for readers, auditing builds and query records answered 2026-09-28 (R42.2–R42.4, R42.6–R42.8).* Still open, asked when their work is reached:
  - ~~"Trigger": the refresh key, as AC-229 says and as built, or who started the last build, as design 10 draws it; or both, as "Trigger" and "Started by".~~
  - ~~What AC-234's "cache warm-up" warms~~ (R42.3: pre-aggregations only).
  - ~~Whose schedules AC-155 suspends, and what "the configured number" is~~ (R42.4: wechart's, 3 by default, per schedule).
  - A rollup with both a refresh key and a wechart schedule: whether wechart offers `scheduled_refresh: false`, and how Schedules labels its owner.
  - Next runs across a DST change: at today's offset with a caveat, or up to the change.
  - The refresh worker's indicator: "Refresh worker up", or its last run and error per model (an xcube change).
  - ~~Data as of for readers~~ (R42.7: freshness only).
  - ~~Whether builds, cancels and schedule changes go in the audit trail~~ (R42.8: yes).
  - ~~Whether read-write members see other users' query records~~ (R42.6: their own only).
- *Answered 2026-09-28 (R42.5): warn before replacing.* ~~**A key or token entered again, unchanged (T501's review; `xcube-2d5ac86f24.md`, open question 2):** a BigQuery key, Snowflake OAuth token or Dremio token entered again, even the same one, counts as a new target for good. The data source's cubes take an alias and their rollups are rebuilt, the root's included, where R38 keeps names while the target is the same. wechart can't tell it is the same, since it is sealed in the browser anew each time. The options:
  - keep it so (as built);
  - ask xcube to compare such a secret by its opened value when it decides whether a target changed;
  - have the form keep the stored key unless the user chooses to replace it (it does today), and say that replacing it rebuilds the rollups.~~

**(b) Waiting on xcube** (R35: needs xcube changed, through the Cube-expert agent)
- **2026-09-27 design 01, state D:** the test's four checks ticking off one by one. xcube's test route answers once, at the end.
- **2026-09-27 design 10, main screen:** builds run by Cube's refresh worker in Recent builds. T373 needs an xcube route for build events, which xcube's contract doesn't have.

**(c) Waiting on wechart work not yet built**
- **Proposals, approval and history** (T349 → T351 → T352, T353 → T354 → T355 → T356 → T357):
  - all of 2026-09-27 designs 05 and 06;
  - design 04's statuses, "Propose to…" and History;
  - design 03's Propose, History and version line;
  - design 09's Reviews control.
- **Model copies in the workspace** (T437, paused in a stash by R33's order, then T347 → T350 → T358; T440; T456):
  - design 04's Model in New and model copies;
  - design 05's bundle and bundled previews;
  - design 10 state D's workspace group;
  - design 11 proposal 5 (T492).
- **The audit trail** (T368 → T369, T370, T427):
  - 2026-09-27 design 08's Audit tab;
  - ~~design 07's audit note;~~ *drawn by T473, 2026-10-04*
  - design 05 pin 7.
- **Preview as groups, enforced by Cube** (T437 → T436 → T438): design 08 state E's folder reach, and state F's folder-refusal sentence.
- **Build history** (AC-150: T340 → T371 → T372 → T374):
  - 2026-09-27 design 10's Folder column and filter, and Recent builds;
  - 2026-09-24 design 07's Last build;
  - wechart-owned schedules (AC-234, T378).
- **Models opened in their folder** (T342):
  - design 10 state D's cube picker (T475, AC-342);
  - design 10 pin 5's model link;
  - the "Open in Model" links of 2026-09-24 designs 02, 07 and 08.

## 7. Deferred past phase 2 (R39, 2026-09-28)

The user: these "will be deferred and not done in this phase". No task builds them, and requirements §P2.7 lists them as non-goals.

- **xcube's slice 7.** The plan's optional slice: Cube's own answers in place of the rules wechart re-implements (`docs/tasks.md`, "Slice 7").
- **JavaScript, Jinja and Python cubes on a changed target.** When a data source's target changes, xcube aliases only YAML cubes. A JavaScript, Jinja or Python cube in a file-set model keeps its alias, so its rollups renew only on their refresh keys. Its results are still its epoch's own (`~/Work/xcube-exchange/to-wechart/2026-09-28-0100-changed-in-place.md`).
  - wechart isn't affected today: its models are items, and it publishes only YAML (AC-332, AC-335).
  - It matters once dynamic models are brought in (requirements R6, deferred).
- **The refresh worker's build history (R41, 2026-09-28).** The user: "History of the refresh worker's build.. we can defer this to the next phase.. and anything else blocked by it to next phase".
  - AC-150's refresh-worker half, and T373. AC-150 keeps the builds wechart starts.
  - What only that history supplies, for builds Cube starts on its own:
    - design 10's "Failed", "Duration vs average", "Trigger: Schedule" and "Recent builds";
    - design 07's last build outcome, and who started it.
  - xcube would record build events from Cube's logger in every process, map orchestrators to models, and serve `GET …/builds?after=`, each event tagged with its pre-aggregation and folder (`docs/inputs/2026-09-28-jobs-schedules-analysis.md`).

## 8. Deferred past phase 3

- **The SQL runner on an unchanged workspace copy (T532's review, 2026-10-02).**
  - **What happens.** An unchanged My workspace copy of a data source runs SQL on its original's login with no switch of its own (R50-6, design 15's Q8). That holds even while the original's runner is switched off. So any read-write member can copy a shared source whose runner is off and run SQL on it at once.
  - **The risk.** On Snowflake, SQL Server and Dremio, a SELECT calling a writing function passes xcube's read-only check. There, the read-only-login attestation behind the switch is the only guard.
  - **Options raised:** a copy runs only while its original's runner is on, on every driver or on those three only.
  - **The user (2026-10-02):** "Not a problem. Ignore this for now. Track it in a backlog.. it will not be addressed in this phase or in phase 3". The runner stays as R50-6 decided.
