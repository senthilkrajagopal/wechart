# wechart tasks

**Finished tasks show their line only.** Their `Files`, `Failing test`, `Depends on` and notes are in [`docs/archive/tasks-done.md`](./archive/tasks-done.md), word for word (moved 2026-10-17). When a task is ticked, its notes move there in the same commit.

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
- [x] T002 [P] (AC-004, AC-005) Define the design tokens and an automated type-size and contrast audit
- [x] T003 [P] (AC-014, AC-015) Build the metadata database, migrations and repositories with optimistic concurrency
- [x] T004 (AC-007, AC-008) Stand up the Fastify service as the only holder of Cube credentials

## F1. Application shell and navigation

- [x] T005 (AC-001) Render the top bar with a workspace switcher of exactly six entries
- [x] T006 (AC-002) Route every surface so a reload restores it
- [x] T007 (AC-003) Switch theme without changing the route or losing scroll position
- [x] T008 (AC-004, AC-005) Apply the tokens across the shell and run the audit over rendered surfaces
- [x] T009 (AC-006) Open the search palette on ⌘K / Ctrl+K with focus in its input

## F2. wechart service: Cube access, metadata and persistence

- [x] T010 (AC-009) Serve metadata from the new model within 60 seconds of a `schemaVersion` change
- [x] T011 (AC-010) Hold the request open while Cube replies "Continue wait"
- [x] T012 (AC-011) Cancel a superseded query against Cube before rendering the newer result
- [x] T013 (AC-012) Show a tile error state carrying Cube's message and the query JSON
- [x] T014 (AC-013) Mark a tile accelerated with a data age, or live
- [x] T015 (AC-016) Record every query wechart issues and list the records in the Jobs workspace

## F3. Explore: folders, catalog and search

- [x] T016 (AC-017) Show the folder tree and the selected folder's contents
- [x] T017 (AC-019) Search dashboards and library charts by title, excluding dashboard-local charts
- [x] T018 (AC-020) Create a folder, dashboard or chart into the selected folder and open it
- [x] T019 (AC-021) Keep every reference working when a folder, dashboard or chart is renamed or moved
- [x] T020 (AC-022) List the dashboards that use a library chart, and offer to add it to another
- [x] T021 (AC-023) Name the dependent dashboards and require confirmation before deleting a library chart *(retired 2026-09-30 with AC-023: T517 refuses the delete instead, AC-362)*
- [x] T022 (AC-024) Navigate the Explore contents with the arrow keys and open with Enter
- [x] T023 (AC-018, AC-039, AC-053, AC-054) Open a dashboard from Explore in view mode with its saved tabs, tiles and settings

## F4. Chart builder and recommendation

- [x] T024 (AC-025, AC-007) List cubes, views and their members grouped by type
- [x] T025 (AC-026) Add a field to a well by drag or by the well's "+" picker and re-run the query
- [x] T026 (AC-027) Mark each well legal or illegal during a drag, with a reason for every illegal well
- [x] T027 (AC-030, AC-031) Implement the recommender's legality rules: no second value axis, and the channel-capacity caps
- [x] T028 (AC-028, AC-030, AC-031) Recommend a chart type from the field signature, with at least one runner-up and a reason
- [x] T029 (AC-029) Show the "Why this chart?" trace
- [x] T030 (AC-032) Keep a manually chosen chart type until "Back to recommended"
- [x] T031 (AC-033) Say what is missing when the fields cannot produce the chosen type
- [x] T191 [P] (AC-182) Load an existing chart's cube, fields, type and axis settings into the editor
- [x] T193 (AC-034) Draw a chart that follows its recommendation on a dashboard, with the type the editor recommends
- [x] T194 (AC-046) Format a dashboard tile's values with each member's format from the Cube model
- [x] T195 (AC-046) Format values with their member's format in every chart type, and in labels and the results drawer
- [x] T201 (AC-046) Honour the rest of Cube's format vocabulary, dimension formats on charts, and test every place for every chart type
- [x] T032 (AC-034, AC-066) Open the editor from a tile as an overlay, preview at the tile's own size and filling the editor, and return with the tile updated
- [x] T196 (AC-002) Reflect the chart editor overlay in the URL, so a reload reopens it and the browser's Back closes it
- [x] T192 (AC-183) Write a tile's chart edit only when the dashboard is saved
- [x] T197 (AC-184) Keep the session when a dashboard save fails: stay in edit mode, keep every change and chart edit, and say why
- [x] T198 (AC-015) Check a dashboard save against the version the edit session started from, not the one current when Save is pressed
- [x] T200 (AC-186) Treat a dashboard save with no answer after 60 seconds as failed, keeping the session, and say it timed out
- [x] T199 (AC-185) Keep the settings page open until a view-mode save goes through, keeping what was entered if it fails
- [x] T033 (AC-035) Undo, redo and discard every change made since the editor opened
- [x] T034 (AC-036) Show the results drawer: result rows, underlying rows and the query JSON

## F5. Chart rendering

- [x] T035 (AC-037) Render the bar family from a chart spec
- [x] T036 (AC-037) Render the line and area family
- [x] T037 (AC-037) Render scatter
- [x] T038 (AC-037) Render pie and donut
- [x] T039 (AC-037) Render treemap and heatmap
- [x] T040 (AC-037) Render the KPI tile
- [x] T041 (AC-037, AC-178) Render the table, and offer a table view of every chart's data from the tile
- [x] T042 (AC-037) Render the pivot table with row subtotals and grand totals
- [x] T043 (AC-037, AC-045) Render trellis panels with a shared scale, per-panel titles and a cap of 20
> **Plan change, 2026-09-20 (user-approved).** A cold review found that no task produced the thing AC-037 is written against: "render … **from a chart spec**". A chart document held only catalog metadata — title, owner, folder — with no query, no encoding and no chart type, and nothing turned a saved chart into a `RenderSpec`. T186–T188 close that, and they come before T044 because T044 is the task that ticks AC-037. Grounded in `docs/research/{superset-chart-serialization,metabase-card-serialization,grafana-panel-schema}.md`; see each task for which finding decides what.

- [x] T186 (AC-014, AC-037) Define the saved chart document and read it back unchanged
- [x] T187 (AC-181) Upgrade a chart saved in an earlier format, and refuse one from a newer format
- [x] T188 (AC-037) Compile a saved chart document into a RenderSpec

- [x] T189 (AC-037) Draw the chart in the app, from a compiled spec
- [x] T044 (AC-037) Render the combo chart
- [x] T045 (AC-038) Show a legend for two or more series and none for one
- [x] T046 (AC-039) Give a member the same colour in every tile, and keep it when filters change the visible set
- [x] T047 (AC-040) Apply the axis editor's settings to the rendered chart
- [x] T048 (AC-041) Aggregate the remainder into a labelled "Other (n)"
- [x] T049 (AC-042) Show a chart-shaped loading skeleton and an error state offering Retry and details
- [x] T050 (AC-043) Show an empty state naming the filters in effect
- [x] T051 (AC-044) Sort categories by value or label and keep the order across a refresh
- [x] T052 (AC-046) Format every value with its member's format in axes, labels, tooltips and tables

## F6. Quick calculations and calculation requests

> **2026-09-21: T053–T058 are deferred for phase 1**, the quick calculations and the request flow alike. The user: "C. Defer or drop quick calculations for phase 1", then "any pending work.. defer". See the status note under F6 in spec.md. Don't start them unless asked. Nothing here had been built; the spike (`research/cube/spike-model-store-and-quick-calcs.md`) is kept.

- [moved to phase 2] T053 (AC-047) Offer the six quick calculations on a measure
  - Files: `packages/web/src/editor/QuickCalcMenu.tsx`, `packages/web/src/editor/QuickCalcMenu.test.tsx`
  - Failing test: `QuickCalcMenu.test.tsx`: the menu offers % of total, difference from previous period, % difference from previous period, running total, rank and moving average (AC-047).
  - Depends on: T025
- [moved to phase 2] T054 (AC-049) Disable a quick calculation that needs a missing time dimension, and say which
  - Files: `packages/web/src/editor/QuickCalcMenu.tsx`, `packages/web/src/editor/quickCalcAvailability.test.ts`
  - Failing test: `quickCalcAvailability.test.ts`: without a time dimension the period calculations are disabled and name the missing field, rather than being offered and erroring (AC-049).
  - Depends on: T053
- [moved to phase 2] T055 (AC-048) Compute quick calculations in Cube as multi-stage measures and label the measure
  - Files: `packages/core/src/quickCalc.ts`, `packages/core/src/quickCalc.test.ts`
  - Failing test: `quickCalc.test.ts`: applying a calculation adds a multi-stage measure to the Cube query rather than post-processing fetched rows, and the tile labels the measure with the calculation (AC-048).
  - Depends on: T053
- [moved to phase 2] T056 (AC-050) Record a calculation request carrying the chart, the fields in use and the description
  - Files: `packages/api/src/repos/calc-requests.ts`, `packages/web/src/editor/RequestCalcDialog.tsx`, `packages/api/src/repos/calc-requests.test.ts`
  - Failing test: `calc-requests.test.ts`: the stored request holds the chart reference, the fields and the description, and appears in the Model workspace listing (AC-050).
  - Depends on: T053, T137
- [moved to phase 2] T057 (AC-051) Open a calculation request's target cube in the model editor with the request beside it
  - Files: `packages/web/src/workspaces/model/RequestPane.tsx`, `packages/web/src/workspaces/model/RequestPane.test.tsx`
  - Failing test: `RequestPane.test.tsx`: opening a request opens the cube the request names, with the request text visible beside the editor (AC-051).
  - Depends on: T056, T138
- [moved to phase 2] T058 (AC-052) Resolve a calculation request and name the member that resolves it
  - Files: `packages/api/src/repos/calc-requests.ts`, `packages/api/src/repos/calc-resolution.test.ts`
  - Failing test: `calc-resolution.test.ts`: publishing a model containing the requested measure marks the request resolved and records the member name (AC-052).
  - Depends on: T057, T143

## F7. Dashboard authoring

- [x] T059 (AC-053) Show the edit bar and the edit sidebar
- [x] T060 (AC-054) Snap tiles to the 12-column grid and 8-pixel row units, with the grid visible while editing
- [x] T061 (AC-055) Resize a tile by edge or corner with a live readout, and offer no numeric size fields
- [x] T062 (AC-056) Drag a tile by its grip with a drop marker, including onto page-tab and tab-group labels
- [x] T063 (AC-057) Move, resize, edit and delete a focused tile from the keyboard
- [x] T064 (AC-058) Offer every element type in the Add palette and insert it at the stated position
- [x] T065 (AC-059) Wrap a tab group added outside a section in a new section, and say so
- [x] T066 (AC-060) Offer an undo for every delete, restoring the element and its contents
- [x] T067 (AC-061) Ask whether to delete or keep a section's contents
- [x] T068 (AC-062) Give a duplicated chart tile its own dashboard-local chart
- [x] T069 (AC-063) Warn on an image tile without alt text and accept only the allowed types and size
- [x] T070 (AC-064) Open a link tile's target, carrying filters to a dashboard and restricting URLs to http and https
- [x] T071 (AC-065) Persist the layout, tile settings, dashboard settings and marking definitions on save
- [x] T072 (AC-066) Restore the dashboard, its chart specs and its settings on discard
- [x] T073 (AC-067) Keep the canvas and sidebar scroll positions across a re-render
- [x] T074 (AC-068) Insert section templates as empty charts that state what they need

## F8. Dashboard settings and interaction modes

- [x] T075 (AC-069) Open the dashboard settings page with its five sections and a way back without saving
- [x] T076 (AC-070) Keep both interaction configurations and label the inactive one
- [x] T077 (AC-071) Clear marks and cross-filters when a mode change is saved
- [x] T078 (AC-072) Default a new dashboard to Markings with one default marking named "Marking"
- [x] T079 (AC-073) Guard against leaving the settings page with unsaved changes
- [x] T080 (AC-074) Record a settings save as one undoable change
- [x] T081 (AC-075) Render the dashboard centred at 1,440 px or full width, per the setting

## F9. Filters

- [x] T082 (AC-076) Offer the four filter widget types
- [x] T083 (AC-077) Scope a filter to the dashboard, a page tab or named tiles, and show its scope
- [x] T084 (AC-078) Re-query every tile in a filter's scope and no tile outside it
- [x] T085 (AC-079) Leave a tile unfiltered and mark it not covered when the member is unreachable
- [x] T086 (AC-080) Return every in-scope tile to the unfiltered result when a filter is cleared
- [x] T087 (AC-081) Put active filters in the dashboard URL
- [x] T088 (AC-082) Combine dashboard, tab and tile filters with marking limits using AND
- [x] T089 (AC-083) Send relative date presets to Cube as relative ranges

## F10. Markings

- [x] T090 (AC-084) Model markings: at least one, exactly one default, at most four
- [x] T091 (AC-085) Set a new chart tile to the default marking and offer "(None)" and the others
- [x] T092 (AC-086) Store a marking only as a predicate over dimension members or bounded ranges
- [x] T093 (AC-087) Replace a marking on click and toggle one item on Ctrl-click or ⌘-click
- [x] T094 (AC-088) Mark with a rectangle drag and an Alt-drag lasso, treating a motionless press as a click
- [x] T095 (AC-089) Toggle or add on a Ctrl-drag according to the enclosed items' state
- [x] T096 (AC-090) Mark a category from its legend entry, keeping visibility elsewhere
- [x] T097 (AC-091) Mark every item in a trellis panel from its header
- [x] T098 (AC-092) Mark table rows, with Shift-range, only when a primary key is available
- [x] T099 (AC-093) Mark a continuous range by dragging along an axis, shown as a stripe with stable bounds
- [x] T100 (AC-094) Unmark on an empty-plot click or Escape, leaving other markings alone
- [x] T101 (AC-095) Update every tile that uses or is limited by a marking, on every page tab
- [x] T102 (AC-096) Draw marked items with a marking-coloured outline and fade unmarked ones
- [x] T103 (AC-097) Draw partial marking as a baseline share for additive measures and a pattern otherwise
- [x] T104 (AC-098) Convey marking state beyond colour with tile badges and marking chips
- [x] T105 (AC-099) Keep every marking colour clear of the categorical palette under normal and CVD vision
- [x] T106 (AC-100) Mark from the keyboard on a focused tile
- [x] T107 (AC-101) Announce marking changes in a polite live region
- [x] T108 (AC-102) Refuse items past the 1,000-item limit, exempting "Mark all"
- [x] T109 (AC-103) Label a tile as not linked when it cannot resolve a marking's members
- [moved to phase 2] T110 (AC-104) Obtain the marked share with one extra query per tile and keep the base result cached
  - Files: `packages/web/src/query/markedShare.ts`, `packages/web/src/query/markedShare.test.ts`
  - Failing test: `markedShare.test.ts`: a marking change issues at most one additional query per tile and does not re-fetch the base result (AC-104).
  - Depends on: T012, T103
- [x] T111 (AC-105) Canonicalise the query so an identical marking produces identical query JSON
- [x] T112 (AC-106) Select a tile on click in edit mode and change no marking

## F11. Details tiles and marked-rows actions

- [x] T113 (AC-107) Limit a tile by markings, combined as AND or OR, skipping empty markings
- [x] T114 (AC-108) Prevent a tile from being limited by the marking it marks with, and say why
- [x] T115 (AC-109) Show the configured nothing-marked state when every limiting marking is empty
- [x] T116 (AC-110) Default a newly limited tile to the message state, pre-filled with the marking tiles' names
- [x] T117 (AC-111) Say the marked items are hidden by the filters instead of showing the nothing-marked state
- [x] T118 (AC-112, AC-199) Create a details tile limited by the source tile's marking
- [x] T119 (AC-113, AC-199) Turn a marking into a removable filter, or its negation, and clear the marking
- [x] T120 (AC-114, AC-199) Show the rows behind the marked items, with a total and an export
- [x] T121 (AC-115, AC-199) Invert a marking, or mark all, on one tile without disturbing other tiles' contributions
- [moved to phase 2] T122 (AC-116) Render marking and measure tokens in text tiles
  - Files: `packages/web/src/dashboard/tiles/TextTokens.ts`, `packages/web/src/dashboard/tiles/TextTokens.test.ts`
  - Failing test: `TextTokens.test.ts`: a marking token renders the summary or count, and a measure token limited by a marking shows the measure over the marked rows, or over all data when nothing is marked (AC-116).
  - Depends on: T113

## F12. Cross-filtering and cross-highlighting

- [x] T123 (AC-117) Apply the configured action for each source and target pair
- [x] T124 (AC-118) Apply and display the dashboard's default pair action
- [x] T125 (AC-119) Show a cross-filter chip and clear it on dismiss or Escape
- [x] T126 (AC-120) Offer no marking affordances in cross-filter mode

## F13. Bookmarks and shareable links

- [x] T127 (AC-121) Save a bookmark holding the page tab, filter values and current marks
- [x] T128 (AC-122) Apply a bookmark without changing the dashboard's saved definition
- [x] T129 (AC-123) Produce a link that reproduces the current filters and marks
- [x] T130 (AC-124) Open a dashboard with no marks when no bookmark or link parameters are given
- [x] T131 (AC-125) Save marking definitions with the dashboard and never the marked items

## F14. Chart ownership: local and library charts

- [x] T132 (AC-126) Keep a dashboard-created chart local, out of folders and search
- [x] T133 (AC-127) Save a local chart to a folder as a library chart, naming where it went
- [x] T134 (AC-128) State that a library chart is shared and on how many dashboards, and offer a local copy
- [x] T135 (AC-129) Repoint the tile to a local copy, keeping edits and leaving the shared chart untouched
- [x] T136 (AC-130) Change no other dashboard when a local chart is edited

## F15. Model editor (Cube YAML)

- [x] T137 (AC-131) List model files and the objects each defines
- [x] T138 (AC-132) Generate a form for every key Cube's validator accepts, with the validator's own enumerations
- [x] T139 (AC-133) Synchronise the form and the YAML view in both directions
- [x] T140 (AC-134) Warn and name what a code-to-form switch would lose
- [x] T141 (AC-135) List parse problems with file and line, and hold the form read-only until it parses
- [x] T142 (AC-136) Validate against Cube before publishing and refuse what Cube rejects
- [x] T143 (AC-137) Make published members available to the chart builder without restarting Cube
- [x] T144 (AC-138) Show the join graph and add a join from the editor
- [x] T275 (AC-250, AC-139) Run the user's Cube fork, and grant its `introspection` scope only to the tokens the API signs for it
- [x] T145 (AC-139, AC-250) Generate cubes from a data source's tables
- [x] T276 (AC-249) Refuse a generated cube whose name or file name is already in the model store, naming it
- [x] T146 (AC-140) Open Jinja, Python and JavaScript model files read-only with a reason
- [x] T147 (AC-141) List the charts and dashboards that reference a member before saving an edit to it

## F16. Pre-aggregations

- [x] T148 (AC-142) List each rollup with its full definition
- [x] T149 (AC-143) Write a rollup edited in the form back into the model file
- [x] T207 (AC-189) Refuse to publish a rollup that names members the model doesn't have, and name them on its row
- [x] T150 (AC-144) Say whether a chart's query matches a pre-aggregation, and name the member that prevents it
- [moved to phase 2] T151 (AC-145) List a rollup's partitions from Cube's system route, and rebuild the selected ones through the jobs API
  - **Un-deferred 2026-09-24** at the user's choice of "Cube's system API" (spec F16 status note). The partition list comes from `/cubejs-system/v1/pre-aggregations/partitions`, read-only. Rebuilds use the documented jobs API, one `dateRange` of a partition's start per selected partition. Building and failed states come from AC-150's history.
  - Files:
    - `docker-compose.yml`: the system secret, given to Cube and wechart's API only;
    - `packages/api/src/cube/client.ts` (+ test): a system-token read of the partitions;
    - `packages/api/src/jobs/partitions.ts` (+ test);
    - `packages/web/src/workspaces/jobs/*`;
    - `e2e/jobs.spec.ts`, with a month-partitioned cube file the test brings with it.
  - Failing test:
    - `partitions.test.ts`: the partitions Cube lists are all shown, each with its period, state and newest build time;
    - `e2e/jobs.spec.ts`: rebuilding two of eight partitions starts jobs whose tables name exactly those two;
    - a contract test that fails if the system route's shape changes on a Cube upgrade (AC-145).
  - Depends on: T148, T156, T263, `docs/research/cube/system-partitions.md`
- [x] T152 (AC-146) Define an index with ordered columns and an aggregate flag
- [x] T153 (AC-147) Warn on a chart that would fail under rollup-only mode
- [x] T154 (AC-148) Refresh a chart past wechart's cached result and show the new data-as-of time

## F17. Jobs, builds and scheduling

> **2026-09-21: T156, T159, T160 and T161 are deferred.** Cube Core has no API for them: wechart's own build history and scheduler. The user: "for requirements that dont work with cube defer". See the status note under F17 in spec.md. T155, T157, T158 and T162 stay.
>
> **2026-09-24: T159 and T160 are back, re-scoped to Cube-owned schedules.** An independent analysis found Cube's refresh worker runs a pre-aggregation's `refresh_key` cron itself. The user chose "Cube-owned now", with the cron edited in Model's pre-aggregation form and a note that a run can start up to about five minutes late. T258 (the publish guard) comes first. The wechart scheduler moves to T259 (AC-234), deferred with T161.
>
> **2026-09-24: T156 is back too, as T263, T156, T261 and T262 (AC-150).** A second analysis found Cube Core blocks only the refresh worker's half of the history, which Cube's `logger` option can supply. Told what the history is for, the user chose "Build it, all builds", keeping the last 100 records of each pre-aggregation, and moving Cube to v1.7.43 after research.

- [x] T155 (AC-149) Start a build, show its token, and poll to a terminal state
- [moved to phase 2] T263 (AC-150, AC-149) Move Cube and Cube Store to v1.7.45, the user's pick after `docs/research/cube/upgrade-1.7.43.md` (which recommended 1.7.44)
  - Files: `docker-compose.yml`, the research docs the upgrade doc corrects
  - Failing test: `e2e/jobs.spec.ts`: a build whose import fails is reported as a failure, not `done`. It can only fail on v1.7.42 if the research shows how to make an import fail on purpose; if it doesn't, the task says so and the full suite is the check.
  - **Why:** the user's decision of 2026-09-24 ("Proceed with cube update to 1.7.43", after research). On v1.7.42 a failed import can report `done`, and Run history would record it as a success.
  - Depends on: `docs/research/cube/upgrade-1.7.43.md`
- [moved to phase 2] T156 (AC-150) Record every build wechart starts in its own history, followed by the API to its end
  - Re-scoped 2026-09-24, when the user un-deferred AC-150 ("Build it, all builds"). It was a repository alone.
  - Files: a migration and `packages/api/src/repos/build-history.ts` (+ test), `packages/api/src/jobs/build.ts` (+ test), `packages/api/src/jobs/follow.ts` (+ test)
  - Failing test: `follow.test.ts` and `build-history.test.ts`:
    - a build started through `POST /api/builds` is stored with its pre-aggregation, "started from Jobs", and each partition's token;
    - the API itself asks Cube about each open token until it finishes, so a build finishes into the history with no browser polling;
    - after a restart, open builds are followed again;
    - a token Cube no longer knows is recorded as "Cube's record expired";
    - the log keeps every state Cube reported, with the time wechart saw it;
    - a 101st record of a pre-aggregation drops its oldest (AC-150).
  - Depends on: T155, T263, `docs/research/cube/job-records.md`
- [moved to phase 2] T261 (AC-150) Record the refresh worker's builds through Cube's `logger` option
  - Files: `infra/cube/cube.js`, `packages/api/src/jobs/events.ts` (+ test), `e2e/jobs.spec.ts`
  - Failing test:
    - `events.test.ts`: a completed or failed build event, in the shape the research records, is stored as "started by Cube's refresh worker", with its partition, duration and time in queue, or Cube's error.
    - `e2e/jobs.spec.ts`: a rollup whose refresh key is `* * * * *` appears in Run history within one of Cube's check periods; this fails if Cube renames its events.
    - `cube.js`'s logger never throws, and still prints every message as Cube's own logger would. When wechart can't be reached, Cube's builds and logging carry on, and only that build's record is lost (AC-150).
  - Depends on: T156, `docs/research/cube/logger-build-events.md`
- [moved to phase 2] T262 (AC-150, AC-152) Show Run history in the Jobs workspace
  - Files: `packages/api/src/jobs/build.ts` (a paged history route), `packages/web/src/workspaces/jobs/*`, `e2e/jobs.spec.ts`
  - Failing test: `e2e/jobs.spec.ts`: Jobs › Run history lists builds newest first with the prototype's columns (started, pre-aggregation, partition, status with its icon and label, duration, what started it), filters by status and by what started it, and opens a build's log; a build older than Cube's 24 hours is still listed (AC-150, AC-152).
  - Depends on: T156
- [moved to phase 2] T157 (AC-151) Show the build queue and cancel a queued entry
  - Files: `packages/web/src/workspaces/jobs/BuildQueue.tsx`, `packages/api/src/routes/jobs.ts`, `packages/api/src/jobs/queue.test.ts`
  - Failing test: `queue.test.ts`: every queued build appears with its pre-aggregation, partition, state and token, and cancelling removes it from the queue (AC-151).
  - Depends on: T155
  - **Deferred by the user, 2026-09-21** ("defer both as per recommendation"). Not to be started unless the user asks. Listing Cube's queue and cancelling an entry both need the same undocumented or unauthenticated sources as T151 (spec F17 status note).
- [x] T158 (AC-152) Pair every job and schedule state with an icon and a text label
- [x] T258 (AC-153) Refuse a refresh key's cron that Cube's refresh worker cannot run
- [x] T159 (AC-153) Set a pre-aggregation's refresh schedule as a cron in the model editor, with the next runs it implies
- [x] T160 (AC-154) List every pre-aggregation's refresh schedule in Schedules, labelled Cube's and read-only, linking to Model
- [moved to phase 2] T264 (AC-153, AC-154) Fix what T258's, T159's and T160's reviews found, then tick AC-153 and AC-154 again
  - Queued 2026-09-25 after the chart and dashboard work, at the user's direction ("focus on completing the chart and dashboards").
  - **T159 (AC-153):**
    - The form shows next runs for a rollup with `scheduled_refresh: false`, which the worker never refreshes. It should say it isn't scheduled.
    - The Los Angeles "08:00" tests read the real clock, so they fail in the days before each US daylight-saving change. Fix the clock.
    - A daylight-saving change within the five shown runs: decide with the user. Cube's offset is fixed when it compiles, and that is UNVERIFIED (research probe (b)).
    - `0 minute` / `0 hour` are accepted.
    - A huge interval throws while drawing.
    - Clearing a key that has `incremental` leaves one with no `every`.
    - The e2e's bound is the hourly check period, not the minute key's 36 s.
    - The spec still says "about five minutes".
  - **T258 (AC-153):**
    - A tab or newline around a cron is trimmed, but Cube's regex refuses it. Normalise spaces only, as Cube does.
    - The API check doesn't follow YAML aliases or merges, unlike Problems.
    - Crons that Cube runs on a schedule other than the one they say are refused. The research marks that UNVERIFIED: run probe (a2) and record the decision beside AC-153.
  - **T160 (AC-154):**
    - Rollups of hidden cubes are missing: read the model files too.
    - Descriptions to fix: cron with incremental, `original_sql` defaults, multi-cube default keys, `sql` + `every`, and the interval's epoch/UTC anchor.
    - Link to the pre-aggregation itself (`preagg=`), opened and scrolled to.
    - One description function shared with Jobs.
    - Show Cube's error text.
    - Add a "Next run" column from T159's `nextRefreshes`.
  - Failing tests: each finding above gets a test that fails first. The component, API and e2e tests are named in the reviews (session of 2026-09-25).
  - Depends on: T159, T160, T258
- [moved to phase 2] T161 (AC-155) Suspend a repeatedly failing schedule and offer Resume — **deferred with AC-155** (wechart's scheduler)
  - Files: `packages/api/src/scheduler/suspend.ts`, `packages/api/src/scheduler/suspend.test.ts`
  - Failing test: `suspend.test.ts`: after the configured number of consecutive failures the schedule stops running, says so, and a Resume action restarts it (AC-155).
  - Depends on: T259
- [moved to phase 2] T259 (AC-234) Run a wechart-owned cron schedule through Cube's jobs API — **deferred** (2026-09-24)
  - Files: `packages/api/src/scheduler/{schedules,worker}.ts` (pg-boss per `docs/research/scheduler.md`), `packages/web/src/workspaces/schedules/ScheduleForm.tsx`
  - Failing test: `schedules.test.ts`: the next runs shown match the cron expression, and with a fake clock a due run starts (AC-234).
  - Depends on: T160
- [x] T162 (AC-156) Show the refresh worker's state and the Cube deployment's health

## F18. Data sources and connections

> **2026-09-21: deferred, except T168.** Cube Core has no API to list, add or test a connection. The user: "for requirements that dont work with cube defer". See the status note under F18 in spec.md. T168 writes `data_source` into a model file and is done with the Model workspace (F15).

- [moved to phase 2] T163 (AC-157) List every data source with its driver, health and assigned cubes
  - Files: `packages/web/src/workspaces/sources/SourceList.tsx`, `packages/api/src/routes/sources.ts`, `packages/web/src/workspaces/sources/SourceList.test.tsx`
  - Failing test: `SourceList.test.tsx`: every configured source is listed with its driver type, the health from its last test, and the cubes the model assigns to it (AC-157).
  - Depends on: T005, T137
- [moved to phase 2] T164 (AC-158) Gate creating a data source on a passing test, or an explicit override
  - Files: `packages/web/src/workspaces/sources/AddSourceWizard.tsx`, `packages/web/src/workspaces/sources/AddSourceWizard.test.tsx`
  - Failing test: `AddSourceWizard.test.tsx`: the wizard takes driver type, connection fields, a Test step and a name, and refuses to create the source while the test fails unless the user overrides explicitly (AC-158).
  - Depends on: T163, T165
- [moved to phase 2] T165 (AC-159) Run connection tests from the service and show each check with the driver's error text
  - Files: `packages/api/src/sources/test.ts`, `packages/api/src/sources/test.test.ts`
  - Failing test: `test.test.ts`: the test executes in the service, each check reports its own result, and a failing check carries the driver's error text (AC-159).
  - Depends on: T163
- [moved to phase 2] T166 (AC-160) Offer the six driver types with their own authentication fields
  - Files: `packages/web/src/workspaces/sources/drivers/*.ts`, `packages/web/src/workspaces/sources/drivers/drivers.test.ts`
  - Failing test: `drivers.test.ts`: PostgreSQL, Snowflake, Databricks, BigQuery, SQL Server and Oracle are each offered, and each form covers every authentication method that driver requires (AC-160).
  - Depends on: T164
- [moved to phase 2] T167 (AC-161) Say that Cube must restart, and show whether it has picked the settings up
  - Files: `packages/web/src/workspaces/sources/RestartNotice.tsx`, `packages/api/src/sources/appliedState.test.ts`
  - Failing test: `appliedState.test.ts`: after a connection change the UI reports a restart is required and reports "not yet applied" while Cube still uses the previous settings (AC-161).
  - Depends on: T164
- [x] T168 (AC-162) Write `data_source` into a cube's model file when it is assigned
- [moved to phase 2] T169 (AC-163) Record connection test results over time and show the history per source
  - Files: `packages/api/src/repos/source-tests.ts`, `packages/api/src/repos/source-tests.test.ts`
  - Failing test: `source-tests.test.ts`: every test result is retained and listed under its source (AC-163).
  - Depends on: T165
- [moved to phase 2] T170 (AC-164) Never show a saved credential or send it to the browser
  - Files: `packages/api/src/sources/secrets.ts`, `packages/api/src/sources/secrets.test.ts`, `e2e/no-secret-leak.spec.ts`
  - Failing test: `secrets.test.ts`: a saved secret is never returned by any API response; `e2e/no-secret-leak.spec.ts`: no rendered field or network payload contains it (AC-164).
  - Depends on: T164

## F19. Security: policies and context preview

- [x] T171 (AC-165) List every access policy as declared
- [x] T172 (AC-166) Preview a dashboard under an edited security context, with a persistent banner
- [x] T173 (AC-167) Show a tile as unavailable to the context when the context hides a member it uses
- [x] T174 (AC-168) Show the generated SQL and the effective filters under the previewed context
- [x] T175 (AC-169) Warn persistently when Cube would accept unauthenticated requests
- [x] T176 (AC-170) Show the configured context's API scopes and mark screens whose scope is missing

## F20. Export

- [x] T177 (AC-171) Export a CSV matching what the tile shows
- [x] T178 (AC-172) State the exported row count and that a result was truncated
- [x] T179 (AC-173) Export formatted values alongside raw numerics for measures

## F21. Performance, accessibility and design conformance

- [x] T180 (AC-174) Meet the 3-second p95 for opening a 10-chart dashboard
- [x] T181 (AC-175) Meet the 3-second p95 for a marking change on a 10-chart dashboard
- [moved to phase 2] T182 (AC-176) Make every action keyboard-reachable with a focus indicator distinct from the marking outline
  - Files: `packages/web/src/shell/styles.ts` (the ring), `packages/web/src/shell/useFocusTrap.ts`, the dashboard, filter, settings, security, search and Explore surfaces it names below, `e2e/keyboard-coverage.spec.ts`. The planned `packages/ui/src/focus.css.ts` and `YamlEditor.tsx` hint were not needed; see below.
  - Failing test: `e2e/keyboard-coverage.spec.ts`: navigation, authoring, marking, filtering and every dialog are reachable from the keyboard, focus is visible on every control and is visually distinct from the marking outline, and Tab leaves the code editor, which is no keyboard trap (AC-176).
  - Depends on: T063, T106, T139
  - **Partly built 2026-09-22. Left unchecked, and AC-176 unticked, because marking is deferred** (T190, T120, T181): marking from the keyboard, and a focus ring distinct from the marking outline, come with markings. The prototype's ring is the accent, the same as the marking colours' neighbourhood; an audit measured accent against `mk4` at ΔE 7.4 (light) and against `mk2` under protanopia at 4.9 (dark). Built here, from that audit of what exists now:
    - **Properties from the tile.** Enter on a focused edit-mode tile selects it, then opens and focuses the sidebar's Properties panel, as direction.md's keyboard section and the prototype have it (`grid/keyboard.ts` `properties`, `EditSidebar` `openSidebarPanel`). Tabbing towards the sidebar selects every tile on the way, so a middle tile's Properties were out of the keyboard's reach. The tile's accessible name lists the key.
    - **Focus kept after a removal.** After Delete, the ⋯ menu's Delete, and either answer to the section question, focus goes to the next item in the container, else the previous one, else the enclosing section (`focusAfterDeleting`). The section question's Cancel goes back to the section. Move to keeps focus on the tile where it landed, or on its neighbour if it went to a page that isn't showing. A filter's Clear leaves focus on its summary; Remove moves it to the next filter, or the one before.
    - **Dialogs.** `shell/useFocusTrap` keeps Tab inside the four modal dialogs: the section question, discard settings, generated SQL and search. The library chart's delete confirmation opens on "Keep the chart", Escape keeps it, and focus returns to Delete chart. The settings page opens with focus on its section's heading, gives focus back to the gear on the way out, and "Keep editing" returns it to whatever asked.
    - **The code editor is no trap.** CodeMirror leaves Tab alone unless it's bound to indent, and ours isn't (`research/code-editor.md`), so Tab moves on and no Escape-then-Tab hint is needed. The planned hint is dropped, and the e2e shows Tab leaving the editor with the file unchanged.
    - **A tile's table** has a named, focusable scrolling region (`role=region`, "{title}, table"), so its rows can be reached and scrolled in WebKit too.
    - **Rings.** Inside a box that clips or scrolls, the ring is drawn inset (`outline-offset: -2px`): the model's YAML/Join toggle, the edit sidebar's tabs and panel, the settings nav, a tile's ⋯ menu, the Problems panel and a filter's options. The undo toast's ring is drawn in the toast's ink; the accent there was 2.89:1 light and 2.15:1 dark, under WCAG 1.4.11's 3:1. The planned `packages/ui/src/focus.css.ts` isn't needed: the ring is the app sheet's (`shell/styles.ts`).
    - **Reasons in words, not tooltips.** A tile a filter can't reach says why beneath "Not filtered by…" (`aria-describedby`). A disabled Download CSV says why beneath it; a disabled button takes no focus, so its tooltip was out of the keyboard's reach. The Accelerated badge keeps its rollup name in the tooltip, the prototype's form chosen at T014. The same name is reachable from the keyboard in the chart editor's Acceleration panel.
    - **Tests:**
      - `e2e/keyboard-coverage.spec.ts` covers:
        - Enter → Properties;
        - Delete and Move to keeping focus;
        - the section question's trap and Cancel;
        - the library delete confirmation;
        - filter Clear and Remove;
        - the settings page's focus in and out;
        - the table region;
        - the code editor's Tab;
        - rings measured whole against every clipping box around them;
        - the toast ring's contrast in both themes.
      - Unit tests: `shell/useFocusTrap.test.tsx` (including a modal stacked over another), `EditSidebar.test.tsx` (including the panel already open), `DeleteSectionDialog.test.tsx`, `SettingsPage.test.tsx` (focus in and out, and the discard question's trap), `GeneratedSql.test.tsx` and `SearchPalette.test.tsx` (their traps), `keyboard.test.ts` (Enter), `DataTable.test.tsx` (region), `coverageOnDashboard.test.tsx` and `TileViewMenu.test.tsx` (reasons). Each trap test was checked to fail with the trap switched off.
      - The e2e suite passes in all three browsers (957). The ten-chart perf test failed in Firefox and Safari under the full parallel run and passed alone.
    - **Cold review (one round), verdict FAIL. Fixed:**
      - **The section question pulled focus back onto "Keep the items" whenever the dashboard re-rendered,** for example when a chart answered or the toast timed out. Its effect was keyed on the owner's fresh `onCancel`. It now reads the latest Cancel from a ref, as the SQL dialog does, and is tested with a re-render.
      - **The table region's ring was cut off, and so were its last rows and scrollbar.** The chart and the table were drawn at the tile's whole height below its head, and ran 66 px past the tile's clipped bottom. The tile's body now takes what the tile has left (a flex column, with a zero basis outranking the pixel height). The chart follows its box. The e2e measures both the chart and the region inside the tile.
      - **Stacked modals:** a trap takes no Tab from another modal opened over it, such as search opened over a dialog.
      - **"Keep the items"** puts focus on the first kept item, where the section was.
      - **Enter with Properties already open** moved no focus. React skips a render for the same panel, so the sidebar now counts each ask.
      - **Coverage added:** the ⋯ menu's Delete, the "keep" answer, and the trap in each dialog.
    - **Still open, beyond marking:**
      - `role=tab` and `role=tree` without arrow keys in tab groups, page tabs, the results drawer and the folder tree;
      - the grip is a dead tab stop;
      - ⌘Z, F6 and `/` from direction.md are absent;
      - the 8 s undo toast can time out under focus, and its Undo and Dismiss leave focus on the page;
      - deleting a tab by its × leaves focus on the page;
      - Escape with search open over a dialog closes both;
      - removing the only filter leaves focus on the page;
      - after a view-mode settings save the gear may still be disabled, and then takes no focus.
  - **Second round, 2026-09-25, with markings built.** `e2e/keyboard-coverage.spec.ts` "T182: what the first round left open" has ten tests. The nine that test changed behaviour failed first. The marking test passed from the start, because AC-100's keys were already built. Each item above is closed as follows:
    - **Tabs take the arrow keys** (the APG tabs pattern, `shell/tabKeys.ts`). A dashboard's page tabs and a tab group's tabs are each one Tab stop, the tab showing. ← → Home End move along the strip, choosing as they go. The results drawer's tabs had them from T257.
    - **The folder tree moves with ↑ ↓ Home End**, as its tree role promises. Each folder is still a button, so Tab and Enter work as before.
    - **The grip is no dead stop.** Enter or Space on it hands focus to its tile, whose arrow keys move it (AC-057). It stays in the Tab order: T253's review asserts its focus ring from the keyboard.
    - **The undo toast is held while focus or the pointer is in it** (WCAG 2.2.1). The 8 s start again on leaving. Undo and Dismiss give focus back to where it was before the toast: after a delete, the tile beside it.
    - **Deleting a tab by its ×** leaves focus on its group's tab now showing.
    - **Escape with the search palette open closes the palette alone.** It is taken on the way down and kept, so a dialog under the palette stays open.
    - **Removing the last filter** leaves focus on the filter bar.
    - **The gear is `aria-disabled` while a save answers**, not `disabled`, so it takes focus back as the settings page closes. `saveInFlight.test.tsx` reads the attribute. Its assertion that the gear opens nothing meanwhile is unchanged.
    - **Marking by the keyboard, under a distinct ring.** A tile focused in view mode marks with AC-100's keys (→, then Space), and the chip appears. The focus ring is 2 px, 2 px outside the tile, in the accent. The marked items' outline is 1.5 px, hugging each mark, in the marking's ink. They differ in width, offset and colour, and the test measures all three.
    - **Not built, and not needed for the criterion:** direction.md's ⌘Z, F6 and `/` shortcuts. Undo and Redo are buttons in every editor, reachable by Tab, so no action waits on a shortcut.
  - ~~AC-176 ticked on `e2e/keyboard-coverage.spec.ts` (both rounds), with AC-100's keyboard marking tests in `e2e/markings.spec.ts`, all three browsers.~~ **Withdrawn after the cold review (below).**
  - **Cold review (one round), verdict FAIL: the tick was not earned.** T182 and AC-176 are unchecked again.
    - **Fixed, each with a test that failed first:**
      - **The undo toast could stay forever.** Undo or Dismiss by pointer took the toast from under the pointer with no leave, so the next toast with the same message ("Deleted Notes.") found itself held and never timed out. It is now let go of when it goes. The test deletes the same tile twice.
      - **The page tabs' ring lost its bottom edge** in their strip, which scrolls sideways. It is drawn inside the tab, as in the other clipped strips. The page-tab test measures the ring, and exercises wrap-around, Home and End.
      - The grip's older comment no longer says pressing it does nothing.
    - **Still open, and why AC-176 stays unchecked.** Each fails AC-176's Fails-when, and none is new in this task:
      - **Pointer-only actions:**
        - cross-filtering (no key makes a cross-filter; `crossfilter.spec.ts` asserts Space does nothing there);
        - marking a scatter's points;
        - marking a series or legend category (AC-090) or a trellis panel (AC-091);
        - marking a table tile's rows (AC-092: `<tr onClick>` only).
      - **The keyboard's focused chart item is drawn nowhere.** `markFocus` is state only, so a sighted keyboard user cannot see which item Space will mark.
      - These are planned as T306 and T307, in "The 2026-09-25 UI review" below.
- [x] T183 (AC-177) Pair every status, validation and job state with an icon and a text label
- [x] T184 (AC-179) Render dashboards, the chart editor and the model editor without horizontal scrolling at 1,280 px
- [moved to phase 2] T185 (AC-180) Run the acceptance suite in Chrome, Edge, Firefox and Safari against the built app
  - Files: `playwright.config.ts`, `.github/workflows/ci.yml`, `e2e/**`
  - Failing test: the full `e2e/` suite passes in all four desktop browsers (AC-180).
  - Depends on: T184
  - **Deferred 2026-09-22, at the user's direction.** Running Edge needs either the `msedge` install, which asks for the machine's password, or a push so CI runs it. Asked which to do, the user chose to defer. AC-180 stays unticked and carries the same note.
  - Note: two gaps to close here, both recorded at T001. **Edge** only runs where the `msedge` channel is installed and `CI` is set, so AC-180 is demonstrated by the CI run, not by a local one — do not tick AC-180 from a local three-browser pass. **Safari** is covered by Playwright's bundled WebKit, not by the shipped Safari; `docs/research/test-stack.md` records that as a residual gap against "current Safari". Switch the `webServer` from `vite dev` to `vite preview` over a real build first, so the suite exercises the artifact users receive rather than the dev server.

**Design conformance to the prototype (AC-187).** Added 2026-09-21 at the user's request ("align with the ui styles in" the published prototype, which is file-for-file the copy in `docs/design/prototype/`). Screenshots of the running app beside the prototype showed several differences:
- the app bar has no brand mark, and its workspace links have a pill background instead of the accent underline;
- the theme control is a text button, not an icon;
- the dashboard title is larger than the prototype's 24/32;
- page tabs are boxed buttons, not underlined tabs;
- the filter bar is full-size controls, not 32 px pills with a scope tag;
- tiles have no title header, and their "Table view" is a boxed button.

Each task below measures its components' computed styles in `e2e/design-conformance.spec.ts` against the prototype's CSS, citing the rule, with colours compared as tokens rather than hex values.

- [x] T202 (AC-187) Draw the app bar, workspace navigation, buttons, inputs and selects as the prototype does
- [x] T203 (AC-187) Draw the dashboard header, page tabs and tiles as the prototype does
- [x] T204 (AC-187) Draw each filter as the prototype's 32 px pill, its scope tag first, its control opening from it
- [x] T205 (AC-187) Draw the edit sidebar's tabs, Add palette and Properties as the prototype does

- [x] T206 (AC-188) Write time values by their granularity in axes, labels, tooltips and tables

## F22. Wiring the marking subsystem (deferred)

- [moved to phase 2: its open criteria are AC-093 and AC-097] T190 (AC-087, AC-088, AC-089, AC-090, AC-091, AC-092, AC-093, AC-094, AC-095, AC-096, AC-097, AC-098, AC-100, AC-101, AC-102, AC-103, AC-107, AC-108, AC-109) Connect the marking subsystem to the rendering path
  - Files: `packages/web/src/tiles/ChartTile.tsx`, `packages/web/src/dashboard/DashboardView.tsx`, `packages/web/src/dashboard/model/document.ts`, `packages/web/src/dashboard/settings/TileLimits.tsx`, `e2e/markings.spec.ts`
  - Failing test: `e2e/markings.spec.ts`: clicking a bar in a running dashboard marks it, a second tile limited by that marking re-queries, and the badge names the marking and the count — each of the listed criteria observed on a tile, the way its `Fails when:` is written.
  - Depends on: T086–T119
  - **Deferred 2026-09-20 at the user's direction; un-deferred by the user 2026-09-23** ("Markings (41 ACs)"), and being built in stages, each ticking only what it shows on a rendered tile.
  - **Stage 1, 2026-09-23: marking by clicking, drawn, said and cleared.**
    - `RenderSpec` gained `marking` (the predicate and the marking's colour), and `charts/src/marking/option.ts` applies `markedItemStyle` per drawn item by finding the row behind it — the same reading of an item the click uses, so what a click marks is what is drawn marked. Applied in `optionFor` beside the cross-filter highlight, so no chart type can forget a marking it is showing.
    - `DashboardView` holds `MarkingState` for the dashboard and reads it at render. Not pushed to tiles: a tab nobody has opened yet draws the same marking as the tiles already on screen the moment it appears, which is what AC-095 will ask.
    - A tile marks with its own `marksWith`, or the dashboard's default where it has none; `''` is "(None)". The picker is T091.
    - Clicking reuses the cross-filter click path, with the modifier now carried: plain replaces, Ctrl or ⌘ toggles the one item (AC-087). A release that no item took is a click on empty plot area, which unmarks that tile's marking — observed on the wrapper's `mouseup`, because `pointerup` fires *before* ECharts dispatches and every click on a mark would otherwise look like a click on nothing.
    - The badge on the tile and the chip on the bar name the marking and its count in words (AC-098); the change is announced politely with its count and the tile it came from (AC-101).
    - `useThemeName` was added beside `useTheme`: a marking's colour is a value ECharts paints with, and a surface rendered without a provider should still draw rather than fail over a colour it could default.
    - **Tests:** `charts/src/marking/option.test.ts` (own colour kept, marking-coloured outline, unmarked faded, by series where a dimension splits them, nothing when the marking is empty) and `e2e/markings.spec.ts` on a real two-tile dashboard: a click marks and fades the rest, the outline appears, the badge and chip say so, the announcement carries the count, a plain click replaces while Ctrl-click adds and removes, and a click on empty plot area unmarks.
    - **Ticked here: AC-087, AC-096, AC-098, AC-101.** AC-094 waits for Escape on a focused tile (its other half, with the keyboard work); AC-095 for a second tile using the same marking across page tabs.
  - **Stage 2, 2026-09-23: the tile's Marking setting (T091), and across page tabs.**
    - The marking is read at render from one place, so a tile on a page tab that was never open while the marking changed draws it the moment that tab is opened — which is AC-095's failing state, and the reason the state is held for the dashboard rather than pushed to tiles.
    - **Ticked here: AC-085, AC-095**, both on `e2e/markings.spec.ts`: a marking made on one page showing on a tile of a page opened afterwards, and the Marking setting on a real tile including "(None)", which then marks nothing.
  - **Stage 3, 2026-09-23: the legend, and a table's rows.**
    - **A legend entry marks its whole category** rather than hiding the series (AC-090), and Ctrl there *adds* a category where Ctrl on an item toggles one — the criteria differ, and Spotfire behaves the same way round.
    - **Read from the DOM, not from ECharts' legend events.** `selectedMode: false` is what stops a legend click hiding a series, and with it no legend mouse event arrived; a marking gesture that sometimes does nothing is worse than none. A release no mark took is matched against what the legend lists — the spec's own series names — and is otherwise a click on empty plot area.
    - **A table's rows mark, and Shift extends from the anchor** (AC-092). `DataTable` has had the behaviour since T098 and no caller ever passed it a marking; it does now. Rows are markable only where the cube declares a primary key, which `primaryKeyOf` reads from `/v1/meta` — a column that happens to be unique in one answer is not an identity. The lookup is done where the rest of the model is read, in `DashboardPage`, rather than querying again inside the dashboard.
    - **Tests:** `markings/primaryKey.test.ts` (the key, a cube without one, a hidden key, and no model yet) and `e2e/markings.spec.ts` — a legend click marking a category without changing how many marks are drawn, Ctrl adding a second, a row click marking one row and Shift-click marking the range.
    - **Ticked here: AC-090, AC-092.**
  - **Stage 4, 2026-09-23: trellis panel headers (AC-091).**
    - A panel's header marks every item in that panel: the facet value alone, which is what makes "every item" true whatever else varies inside it. The titles already carried `triggerEvent` for this, from T195.
    - **The panel is taken by its index, not by the words shown.** A panel of time is titled by its granularity ("Jan 2026"), so the title is not the value; the index is matched against the facet's own values in the order the panels were drawn.
    - **Tests:** `e2e/markings.spec.ts` — a header click marking the panel's category and fading the other panel's bars. The fixture names the facet in the chart's `encoding`, because two dimensions alone compile to an axis and a colour split, never to panels.
    - **Ticked here: AC-091.**
  - **Stage 5, 2026-09-23: the keyboard (AC-100), which completes AC-094.**
    - A tile is a tab stop in view mode as well, and answers the marking's keys there: arrows move between its items, Space marks the focused one, Ctrl and Space toggle it, Shift and an arrow extend from the anchor, and Escape unmarks the tile's marking. The same tab stop as edit mode, a different vocabulary, because arranging and reading are different things to be doing — and the tile's accessible name says which keys it answers.
    - **Arrows do not mark.** Every marking change re-queries each tile using it, so "select as you move" would fire a round of queries per keystroke; the move is announced instead ("shipped, 2 of 3. Space marks."), since nothing on screen says where the keyboard is.
    - An extend goes through `addItemsWithinLimit`, so a long Shift-extend stops at the 1,000-item cap and says so rather than refusing the gesture.
    - **Tests:** `e2e/markings.spec.ts` drives a focused tile with the keyboard alone — arrow announcing without marking, Space marking, Shift extending, Ctrl+Space toggling back, Escape unmarking.
    - **Ticked here: AC-100, and AC-094**, whose empty-plot-area half landed in stage 1.
  - **Stage 6, 2026-09-23: a tile that cannot reach the marking (AC-103).**
    - Such a tile is left unmarked and says so, rather than drawing every item faded — which would read as "none of it is in here", a different and wrong answer — and rather than sending a query Cube would refuse.
    - **This needed the model to be decisive, and it was not.** `reachFrom` only ruled a pair out when their join components differed, and a cube with no joins reports no component at all, so the answer was "cannot say" and nothing was labelled. Verified against the local Cube v1.7.42: `orders`, `products` and `customers` report `connectedComponent: 1`; `monthly_orders`, which declares no joins, reports none. `markings-query-support.md` §4.5 had this as a source reading marked UNVERIFIED; it is now verified there, with the probe.
    - **Absence counts only where the model reports components at all.** A model that says nothing about them — a different Cube version, or one read before the joins compiled — is telling us nothing, and reading that as "every cube is isolated" would stop every filter reaching every tile. That case stays "cannot say", and has its own test.
    - The same rule now spares dashboard filters a doomed query too (AC-079): a tile that cannot be reached is marked as such before anything is sent.
    - **Tests:** `filters/coverage.test.ts` (a join-less cube ruled out, its own members still its own, a joined pair unaffected, and silence everywhere still "cannot say") and `e2e/markings.spec.ts` — a tile on `monthly_orders` labelled not linked, unmarked, nothing faded, and no error on it.
    - **Ticked here: AC-103.**
  - **Stage 7, 2026-09-25: marking with a rectangle or a lasso (AC-088, AC-089).**
    - **Gestures.** A drag on a tile that marks draws a dashed rectangle over the chart. With Alt it draws a lasso. On release, it marks every item the shape touched.
      - The overlay is SVG over the canvas, drawn by `ChartCanvas`, as the prototype draws it.
      - `dragGesture` decides drag from click on the same 5 px as `itemClicks`, so exactly one of them answers any press.
      - A drag's release never counts as a click on empty plot area, which would unmark the tile.
    - **What a shape touches.** `itemsInShape` (`charts/src/interaction`) reads the chart as drawn through `convertToPixel`, which is what `research/echarts.md` says marking must rest on.
      - Bars, stacked segments, horizontal bars, line points, scatter points and heatmap cells are covered.
      - Each item is named as a click names it, so the dashboard reads a drag and a click through the same `clickedValue`.
      - Pies and treemaps have no axis to convert along. They mark by click, as the prototype's do.
    - **What it does to the marking** (`onMarkShape`):
      - A plain drag replaces the marking.
      - Ctrl or ⌘ toggles the enclosed items when all or none are marked, and otherwise adds them. This is `applyToggleOrAdd`'s rule, and a tile marked whole is expanded first, as a Ctrl-click expands it.
      - Growth stops at the 1,000-item cap and says so (`addItemsWithinLimit`).
      - A shape that touched nothing changes nothing, as in the prototype.
    - **Found on the way, fixed.** `touchesSpan` sampled nine points along a bar. A thin rectangle across a tall bar's foot fell between two samples and missed it: the e2e's first drag did exactly that. It is now exact: an end inside the shape, or the span crossing one of the shape's edges. The sampling test became one of a 1-pixel strip across a 1,000-pixel bar, for both a rectangle and a lasso.
    - **Tests:**
      - `charts/src/interaction/itemsInShape.test.ts`: a bar crossed at its foot, a miss, a lasso, a stacked segment, a horizontal bar, a line's and a scatter's points, the category an item carries, a gap.
      - `e2e/markings.spec.ts` "marking with a shape", on a real dashboard in all three browsers:
        - a rectangle over two bars marks both;
        - an Alt-lasso round the third replaces them;
        - a press moved under 5 px is a click;
        - Ctrl-dragging over a partly marked pair adds, over an unmarked bar toggles it on, and over the wholly marked pair toggles them off.
      - All failed first, for want of the drag.
    - **Ticked here: AC-088, AC-089.**
    - **Review 2026-09-25 (cold, FAIL), fixed once:**
      - **Log axes.** A shape on a log value axis marked every bar: its base was 0, whose pixel is infinite. A bar now starts at 1 there, as ECharts' does, and an item whose pixels are not finite is not marked.
      - **Bars are hit as the rectangles ECharts draws**, not their centre line. Each column's slot in the band follows ECharts' own layout (`laidBarWidth`, `research/echarts-bar-density.md`): unstacked series a column each, a stack one, and overlaid bars one. So a grouped bar is found by its own slot, and a wide bar by its edge. `hitTest.touchesRect` is exact, as `touchesSpan` is.
      - **Mixed-sign stacks** stack by sign, as ECharts 6.1 does (`samesign`). A negative segment is found below the baseline.
      - **A drag is never also a click.** An out-and-back drag ending on its bar, or a drag along a trellis header, fired both. The series and header releases now defer to a drag under way, and a header press is told apart by where it happened. `itemClicks.cancel` was added, and `itemClick.test.ts` covers it.
      - **Only the primary button marks.** zrender reports every button alike, so a right-click marked the item under it, or unmarked from empty plot area. A context menu opening cancels any press under way. That includes macOS's Ctrl+click, which presses the primary button (`research/context-menu-and-submenus.md`).
        - So on a Mac, toggling is ⌘ (AC-087 and AC-089 name both keys).
        - The e2e now presses `ControlOrMeta`, which is ⌘ on a Mac. Before, it pressed Control, the Mac's context-menu gesture. On Windows and Linux it is Ctrl, as before.
      - **A release belongs to the tile it was pressed on.** A drag overshooting onto a neighbouring tile no longer clears that tile's marking.
      - **A lost release ends the drag.** One that never arrives (another window, a context menu, the window losing focus) ends the drag with nothing marked, and a release of another button mid-drag is ignored.
      - **No rubber band** on a pie, donut, treemap, KPI, table or pivot, a tile set to "(None)", or a tile that can't reach its marking.
      - **A plain drag over nothing** replaces the marking with nothing, as direction.md rule 47 has it, like a click on empty plot area. With Ctrl or ⌘ it adds nothing.
      - **The tooltip** is hidden on every move of a drag, not only the first.
      - **Tests added:**
        - `itemsInShape.test.ts`: a bar's edge, a grouped bar's slot and the gap beside it, a mixed-sign stack, a log axis. All four failed first.
        - `e2e/markings.spec.ts` "a drag out and back, a right-click, an overshoot and an empty drag each do one thing", in all three browsers.
      - **Also fixed:** the AC-106 test's doc comment, which stage 7's block had separated from its test.
      - **Left as is:** a heatmap cell marks its column, as a click on it does (older than this stage). The part of a bar clipped off the plot when the axis leaves out zero can still be hit.
      - **A slip in T119's commit:** its new menu items broke "a chart tile's menu offers…". I had run only T119's own test before committing. The list is updated here, and the whole markings suite (102 tests) passes.
  - **Stage 8, 2026-09-25: the 1,000-item cap on a real tile (AC-102).**
    - T108 built the rule. It was ticked on `limit.test.ts` on 2026-09-20 and has been shown on a tile only now.
    - `e2e/markings.spec.ts` "a shape over more than 1,000 items…" uses a cube of the browser's own over `generate_series(1, 1500)`, drawn as a 1,500-bar tile (a bar chart folds categories only when its Top N is set).
      - A rectangle across the whole plot marks 1,000, and the announcement says "A marking holds at most 1,000 items. 500 were not added."
      - Mark all then marks all 1,500, because it stores the tile's filter.
    - **Found on the way, fixed:** the badge and the announcement printed "1000" beside a limit written "1,000". Both now group thousands (`en-GB`), as the chip and the limit message already did. Unit tests were added to `MarkBadge.test.tsx` and `LiveRegion.test.tsx`; both failed first.
    - **Ticked here: AC-102.** It was ticked on T108's unit test, then withdrawn with the other seventeen on 2026-09-20.
  - **Why this task exists.** T086–T119 each built and tested one module, and every one of their Files lists names only that module and its test — no renderer, no e2e spec. The F5–F9 dashboard tasks by contrast each list `DashboardView.tsx` and `e2e/dashboard.spec.ts`. So the plan never contained the step that makes marking reachable, and 18 criteria were ticked on unit tests of code nothing imports. Unticked 2026-09-20; see the status note in `docs/spec.md` under F10.
  - **The lesson worth keeping, independent of markings.** A criterion whose `Fails when:` names an observation on a tile is not demonstrated by a test that renders a component with hand-passed props. When planning any future feature, the task that introduces a UI module must also name the renderer that mounts it, or the feature is finished everywhere except where the user is.
  - Known interface hazard for whoever does this: `allLimitsEmpty(limitingMarkings(xs))` is false for every input, because `limitingMarkings` keeps only the non-empty markings. Pinned by a test in `NothingMarked.test.tsx`.

## Spec F22. Following the design prototype's structure

Planned 2026-09-24 from the critiques in `docs/design/critiques/2026-09-24-*.md` (R9: the user chose to do this before more features, then resume the handoff order). Every task here is surface work, so every one names the renderer and an e2e spec — the lesson of T190 above. The prototype is served for comparison with `python3 -m http.server 5500` in `docs/design/prototype/`.

Order: the reopened criteria first (they are ticked-and-false, the worst state to leave), then Explore and the shell, then dashboards.

- [x] T208 (AC-042) Offer Retry and details on a dashboard tile's error state, and never report a failed query as a missing chart
- [x] T209 (AC-053) Show the dashboard's tree in the Outline tab, a row selecting and scrolling to its element
- [x] T210 (AC-005, AC-211) Draw charts in the dark theme's palette and tokens, and bring chart text and the open palette into the contrast audit
- [x] T211 (AC-190, AC-191) Put the search field and avatar in the top bar, and make the palette search fields and model files with arrow-key results
- [x] T212 (AC-019, AC-192) Give each Explore folder its breadcrumb, heading with Rename, search box and New menu
- [x] T213 (AC-193) List a folder's contents under Name, Type, Built on, Updated and Owner, with a row menu for rename and move
- [x] T214 (AC-194) Dock the folder tree as a full-height pane with "Folders", "+ Folder", counts and a "My workspace" root
- [x] T215 (AC-197) Edit a dashboard's name, folder and description in Settings › General, and show the description in Explore
- [x] T216 (AC-195) Show a breadcrumb back to the folder on dashboards and chart pages, and keep the folder in Explore's URL
- [x] T217 (AC-196, AC-207) Fix the dashboard's header, tabs and filter bar above the scrolling tiles, with the filter bar's hint and the empty state
- [x] T218 (AC-198) Manage markings in Settings › Markings, with the tiles-and-markings table
- [x] T219 (AC-199, AC-201) Give a chart tile's view-mode menu its items, and put the marked badge in the header row
- [x] T220 (AC-200) Make the marking chip bordered, titled by members' titles, naming its source tile, with a menu and ×
- [x] T221 (AC-202, AC-208) Draw sections as collapsible bands, and render markdown
- [x] T222 (AC-203, AC-187) Open Properties on selecting a tile, with its Chart, Marking and Layout sections at the prototype's inset
- [x] T223 (AC-204, AC-205, AC-206) Make Discard leave edit mode, order the edit-mode tile menu, and mark tiles editable at rest
- [x] T224 (AC-209, AC-210) Name tiles by their titles, and never draw an empty plot for returned rows
- [x] T226 (AC-212) Rebuild the library chart page: title, type, the chart drawn, its fields, Used in, and Edit chart
- [x] T227 (AC-213) Open the chart editor from New › Chart, and land a saved new chart on its page in the open folder
- [x] T228 (AC-214) Lay the chart editor out as the prototype's three panes, with the preview always in view and one header row
- [x] T229 (AC-215, AC-216) Group fields by cube with search and click-to-add, and give well pills titles, tags, granularity, a Filters well and Top N
- [x] T230 (AC-217, AC-218) Show the chart type by name with a searchable gallery, and warn on a manual combo or an over-capacity pick
- [x] T231 (AC-219) Add the Customize tab: axes, legend, series and values
- [x] T232 (AC-220, AC-221) Name members by their titles everywhere a person reads them, and list every pie slice in its legend
- [x] T233 (AC-004) Raise the two 11 px rules to the 12 px floor, and open a problem and a tile note in the type audit
- [x] T234 (AC-222, AC-223) Make Model one workspace: a file tree beside full-height form and code panes, Problems docked
- [x] T235 (AC-224) Edit member references with pickers, and a join's target with a list of cubes
- [x] T236 (AC-225) Give member rows their type, SQL preview and badges, and show only the fields that apply when expanded
- [x] T237 (AC-226, AC-227) Show unpublished changes with Discard and a leave warning, and validate enums and required keys on every parse
- [x] T238 (AC-231, AC-233) Give every workspace page its title style and table cards, and give Schedules and Data sources their frame
- [x] T239 (AC-228, AC-229) Give Jobs a docked inspector, and pre-aggregation rows their state, trigger and Model link
- [x] T240 (AC-230) Filter, sort and page the query log, with its headers kept in view
- [x] T241 (AC-228, AC-232) Dock Security's preview with presets, effective access, a bounded dashboard list and Model links
- [x] T242 (AC-037) Encode a scatter, a heatmap and small multiples for the channels they read, so each draws from the editor's wells
- [moved to phase 2] T225 (AC-187) Re-run the design critique on every surface, and tick AC-187 only on measured conformance
  - Files: `docs/design/critiques/`
  - Failing test: the `design-critic` report finds no `STRUCTURE` or AC-187 finding on the surfaces above (AC-187).
  - Depends on: T208–T241, and T243–T251 (the re-critique's fixes)
  - Re-critiques of 2026-09-24: `2026-09-24-recheck-shell-explore.md` (14 of 27 earlier findings fixed, 17 new, 23 AC-187 mismatches) and `2026-09-24-recheck-dashboard.md` (16 of 30 fixed, 10 new, 35 mismatches). Their fixes are T243–T251; the chart editor, Model and admin re-critiques follow.

### The 2026-09-24 re-critique's fixes

- [x] T243 (AC-193) Name an Explore chart by its drawn type, move a folder into a sibling, and make each row one target
- [x] T244 (AC-187, AC-231) Dock Explore's folder tree, and set its table, header and states to the prototype's measures
- [x] T245 (AC-187) Match the app bar's search trigger, avatar and palette to the prototype, and open a new dashboard in edit mode
- [x] T246 (AC-187) Match the dashboard header, filter band, marking chip and badge to the prototype
- [x] T247 (AC-187) Draw tab-group tabs, the Header element, Markdown and sections as the prototype does, and name Markdown tiles by their text
- [x] T252 (AC-187) Draw a chart tile's badges, head and incomplete state as the prototype does
- [x] T254 (AC-187) Draw a chart's text in Inter with tabular numerals, and its plot down to the tile's foot, as the prototype does
- [x] T255 (AC-214) Save a chart with the title as it reads, one still being typed included
- [x] T256 (AC-214, AC-213) Give the chart editor the prototype's way back and its ownership note
- [x] T257 (AC-187, AC-214) Match the chart editor's header, field list, wells, preview tile, drawer and empty state to the prototype, measured
- [x] T253 (AC-187) Use the prototype's picker for tile menus, its inline grip, and its tinted edit grid
- [x] T248 (AC-187) Put the edit sidebar under the filter band, and match its palette, add slots, Properties and Outline to the prototype
- [x] T249 (AC-187, AC-231) Give the dashboard settings page the prototype's bar, nav, content and tables, with Escape and an inactive banner
- [x] T250 (AC-187) Below 1,024 pixels, stack a dashboard to one column in view mode only, keeping every tile's title
- [x] T251 (AC-187) Draw a dashboard's frame while it loads, and give a failed tile its details and its menu

## Spec F23. The chart tile's menu (DSH-08), and F16's join refusal

Planned 2026-09-25 from the user's choices on `docs/design/reviews/2026-09-24/chart-context-menu.md`. Every task names the renderer and an e2e spec (T190's lesson). The user's order: finish charts and dashboards, then the Superset-parity test. These go after the marking and bookmark tasks they build on (T119, T120, T190).

- [x] T265 (AC-235) Refuse at publish a rollup naming cubes Cube cannot join, with the rollup, its file and Cube's reason
- [x] T266 (AC-199, AC-246) Make the tile menu a menu with submenus, opened by ⋯, a right-click on the plot, Shift+F10 and the Menu key
- [x] T267 (AC-247) Head the tile menu with the marking, its values by title, and "n of N"
- [x] T268 (AC-239) View underlying rows for the whole tile when nothing is marked
- [x] T269 (AC-240) A details panel that follows the marking, toggled from the menu and the panel
- [x] T270 (AC-236, AC-237, AC-238) Drill a tile's marked items by another dimension, in place, with a breadcrumb and Back
- [x] T271 (AC-241, AC-242, AC-243) Copy › Marked values, Image and To dashboard
- [x] T272 (AC-244, AC-199) Export › the tile's CSV, the marked rows' CSV, SVG and PNG
- [x] T273 (AC-245) Data as of › the pre-aggregation, its last build, schedule and next run, Refresh now, Open in Jobs, Edit schedule in Model

## Spec F24. Deployment to Kubernetes

- [x] T274 (AC-248) A Helm chart that deploys wechart, Cube, its refresh worker and Cube Store to docker-desktop, with Superset's northwind database as Cube's data source

## The 2026-09-25 UI review: Superset-parity gaps, the re-critique, and AC-176's open parts

Added 2026-09-25 by the UI review stream. Its sources:
- the gaps found when Superset's "Northwind Sales Overview" was rebuilt in wechart (`docs/design/superset-parity.md`);
- the T225 re-critique of every surface (`docs/design/critiques/2026-09-25-*.md`);
- T182's cold review.

Only gaps that break an accepted criterion or a numbered direction.md rule are tasks here. The rest are proposed spec changes for the user, not built.

- [x] T300 (AC-187) Draw the KPI tile as the prototype does
- [x] T301 (AC-039) Colour a pie's slices and a treemap's rectangles by the dashboard's assignment, and let only tiles that draw categorical colour claim a colour
- [x] T302 (AC-219) Offer "Stack series" on a horizontal bar with more than one series
- [x] T303 (AC-044) Order a pivot's rows by the chart's sort
- [x] T304 (AC-187) Draw table and pivot tiles as the prototype's `.grid-table.comfy`
- [x] T305 (AC-031) Hold a candidate that colours by a dimension to the 8-colour cap
- [x] T306 (AC-176, AC-100) Draw the item a tile's keyboard focus is on, distinct from the marking outline
- [moved to phase 2] T307 (AC-176) Reach the pointer-only chart actions from the keyboard
  - From T182's review. These could only be done with the pointer:
    - cross-filtering from a mark;
    - marking a scatter's points;
    - marking a legend category (AC-090) or a trellis panel (AC-091);
    - marking a table tile's rows (AC-092).
  - Files: `packages/web/src/dashboard/DashboardView.tsx`, `packages/web/src/tiles/DataTable.tsx`, `e2e/keyboard-coverage.spec.ts`, `e2e/crossfilter.spec.ts`
  - Failing test: each of those actions is done from the keyboard alone (AC-176).
  - Depends on: T306
- [x] T309 (AC-210) Keep a pie's or donut's ring clear of a legend placed at its side
- [x] T310 (AC-187) Draw the chart editor's remaining controls as the prototype does

---

## Coverage: acceptance criterion → task

| AC     | Task       | AC     | Task | AC     | Task | AC     | Task       |
| ------ | ---------- | ------ | ---- | ------ | ---- | ------ | ---------- |
| AC-001 | T005       | AC-046 | T052, T194, T195, T201 | AC-091 | T097 | AC-136 | T142       |
| AC-002 | T006, T196 | AC-047 | T053 | AC-092 | T098 | AC-137 | T143       |
| AC-003 | T007, T016 | AC-048 | T055 | AC-093 | T099 | AC-138 | T144       |
| AC-004 | T002, T008 | AC-049 | T054 | AC-094 | T100 | AC-139 | T145       |
| AC-005 | T002, T008 | AC-050 | T056 | AC-095 | T101 | AC-140 | T146       |
| AC-006 | T009       | AC-051 | T057 | AC-096 | T102 | AC-141 | T147       |
| AC-007 | T004, T024 | AC-052 | T058 | AC-097 | T103 | AC-142 | T148       |
| AC-008 | T004       | AC-053 | T059, T023 | AC-098 | T104 | AC-143 | T149       |
| AC-009 | T010       | AC-054 | T060, T023 | AC-099 | T105 | AC-144 | T150       |
| AC-010 | T011       | AC-055 | T061 | AC-100 | T106, T306 | AC-145 | T151       |
| AC-011 | T012       | AC-056 | T062 | AC-101 | T107 | AC-146 | T152       |
| AC-012 | T013       | AC-057 | T063 | AC-102 | T108 | AC-147 | T153       |
| AC-013 | T014       | AC-058 | T064 | AC-103 | T109 | AC-148 | T154       |
| AC-014 | T003, T186 | AC-059 | T065 | AC-104 | T110 | AC-149 | T155       |
| AC-015 | T003, T198 | AC-060 | T066 | AC-105 | T111 | AC-150 | T263, T156, T261, T262 |
| AC-016 | T015       | AC-061 | T067 | AC-106 | T112 | AC-151 | T157       |
| AC-017 | T016       | AC-062 | T068 | AC-107 | T113 | AC-152 | T158       |
| AC-018 | T023       | AC-063 | T069 | AC-108 | T114 | AC-153 | T258, T159, T264 |
| AC-019 | T017       | AC-064 | T070 | AC-109 | T115 | AC-154 | T160       |
| AC-020 | T018       | AC-065 | T071 | AC-110 | T116 | AC-155 | T161       |
| AC-021 | T019       | AC-066 | T072, T032 | AC-111 | T117 | AC-156 | T162       |
| AC-022 | T020       | AC-067 | T073 | AC-112 | T118 | AC-157 | T163       |
| AC-023 | T021       | AC-068 | T074 | AC-113 | T119 | AC-158 | T164       |
| AC-024 | T022       | AC-069 | T075 | AC-114 | T120 | AC-159 | T165       |
| AC-025 | T024       | AC-070 | T076 | AC-115 | T121 | AC-160 | T166       |
| AC-026 | T025       | AC-071 | T077 | AC-116 | T122 | AC-161 | T167       |
| AC-027 | T026       | AC-072 | T078 | AC-117 | T123 | AC-162 | T168       |
| AC-028 | T028, T305 | AC-073 | T079 | AC-118 | T124 | AC-163 | T169       |
| AC-029 | T029       | AC-074 | T080 | AC-119 | T125 | AC-164 | T170       |
| AC-030 | T027, T028 | AC-075 | T081 | AC-120 | T126 | AC-165 | T171       |
| AC-031 | T027, T028, T305 | AC-076 | T082 | AC-121 | T127 | AC-166 | T172       |
| AC-032 | T030       | AC-077 | T083 | AC-122 | T128 | AC-167 | T173       |
| AC-033 | T031       | AC-078 | T084 | AC-123 | T129 | AC-168 | T174       |
| AC-034 | T032, T193 | AC-079 | T085 | AC-124 | T130 | AC-169 | T175       |
| AC-035 | T033       | AC-080 | T086 | AC-125 | T131 | AC-170 | T176       |
| AC-036 | T034       | AC-081 | T087 | AC-126 | T132 | AC-171 | T177       |
| AC-037 | T035–T044, T186, T188, T242 | AC-082 | T088 | AC-127 | T133 | AC-172 | T178 |
| AC-038 | T045       | AC-083 | T089 | AC-128 | T134 | AC-173 | T179       |
| AC-039 | T046, T023, T301 | AC-084 | T090 | AC-129 | T135 | AC-174 | T180       |
| AC-040 | T047       | AC-085 | T091 | AC-130 | T136 | AC-175 | T181       |
| AC-041 | T048       | AC-086 | T092 | AC-131 | T137 | AC-176 | T182, T306, T307 |
| AC-042 | T049       | AC-087 | T093 | AC-132 | T138 | AC-177 | T183       |
| AC-043 | T050       | AC-088 | T094 | AC-133 | T139 | AC-178 | T041       |
| AC-044 | T051, T303 | AC-089 | T095 | AC-134 | T140 | AC-179 | T184       |
| AC-045 | T043       | AC-090 | T096 | AC-135 | T141 | AC-180 | T001, T185 |
| AC-181 | T187       | AC-182 | T191 | AC-183 | T192 | AC-184 | T197       |
| AC-185 | T199       | AC-186 | T200 | AC-187 | T202, T203, T204, T205, T222, T225, T244–T254, T300, T304, T310 | AC-188 | T206       |
| AC-189 | T207       | AC-190 | T211 | AC-191 | T211 | AC-192 | T212       |
| AC-193 | T213, T243 | AC-194 | T214 | AC-195 | T216 | AC-196 | T217       |
| AC-197 | T215       | AC-198 | T218 | AC-199 | T219, T118–T121 | AC-200 | T220       |
| AC-201 | T219       | AC-202 | T221 | AC-203 | T222 | AC-204 | T223       |
| AC-205 | T223       | AC-206 | T223 | AC-207 | T217 | AC-208 | T221       |
| AC-209 | T224       | AC-210 | T224, T309 | AC-211 | T210 | AC-212 | T226       |
| AC-213 | T227, T256 | AC-214 | T228, T255–T257 | AC-215 | T229 | AC-216 | T229       |
| AC-217 | T230       | AC-218 | T230 | AC-219 | T231, T302 | AC-220 | T232       |
| AC-221 | T232       | AC-222 | T234 | AC-223 | T234 | AC-224 | T235       |
| AC-225 | T236       | AC-226 | T237 | AC-227 | T237 | AC-228 | T239, T241 |
| AC-229 | T239       | AC-230 | T240 | AC-231 | T238, T244, T249 | AC-232 | T241       |
| AC-233 | T238, T160 | AC-234 | T259 | AC-235 | T265 | AC-236 | T270       |
| AC-237 | T270       | AC-238 | T270 | AC-239 | T268 | AC-240 | T269       |
| AC-241 | T271       | AC-242 | T271 | AC-243 | T271 | AC-244 | T272       |
| AC-245 | T273       | AC-246 | T266 | AC-247 | T267 | AC-248 | T274       |
| AC-249 | T276       | AC-250 | T275, T145 |        |      |        |            |

AC-139 is covered by T145 and T275 (the fork's Cube and its scope, R10).

AC-199 is also covered by T266 and T272 (its reworded Export item). AC-153 by T264, AC-154 by T160 and T264.

Reopened 2026-09-24 and now also covered by the prototype-alignment tasks: AC-004 → T008, T233 · AC-005 → T008, T210 · AC-019 → T017, T212 · AC-042 → T049, T208 (re-ticked) · AC-053 → T059, T209.

---

# Phase 2

Inputs: `docs/spec.md` F25–F36 and the phase-1 criteria returned or rewritten for phase 2 (104 open criteria); `docs/requirements.md` Part 2 (R11–R23); `docs/research/` (openid-client, dex, credential-encryption, cube/per-folder-models, connection-testing, box-plot, country-map, scheduler, and the CodeMirror merge research); `docs/design/direction.md` §7e and rules 59–89.

The `[moved to phase 2]` tasks above are superseded by the tasks below, which carry their notes forward where they still hold.

**Amended 2026-09-26** by the final integration plan (`docs/inputs/2026-09-26-integration-plan-decisions.md`, cited `[IP n]`; its doc's snapshot `docs/inputs/2026-09-26-integration-plan.md`, cited `[plan]`), round R28, and the spec's amendment (AC-319 to AC-332).
- Tasks the plan overturns are retired or rewritten in place, with the old text struck through and the ID kept.
- wechart's side of the plan's slices 2–8 is in **P2.17**, one task per behaviour. Each waits on xcube's routes for its slice. Those are built on the Cube side, never from this repository.
- All work is on branch `feat/xcube` until the user merges it (R28 Q10).
- New research: `cube/xcube-runtime.md`, `cube/prefixed-names.md`, `cube/generated-policies.md`, `cube/whole-model-publish.md`, `cube/tokens-and-service-credential.md` (`jose` 6.2.12), `cube/ha-topology.md`, `credential-sealing.md` (`hpke` 1.1.7) and `cube/xcube-rename.md`, each marked where the plan supersedes it.

**Decisions this plan takes** (small, under the standing instruction; each can be changed with its task):

- **Where the user comes from.** Every request carries `request.wechartUser = { key, name, groups, superAdmin }`. With security off it is the one user `admin`, a Super-Admin. With security on it comes from the server-side session. Handlers read nothing else (research `openid-client.md`, "Security off").
- **Group access is stored on the folder.** Each folder document's body gains `access: { readOnly: string[] | null, readWrite: string[] | null }`, where `null` means unset. The shared root's access is a `setting` document `root-access`. Effective access is computed in memory from the folder list by a pure function in `packages/core/src/access/`.
- **Workspaces are folder ids** of the form `ws:<userKey>`. The phase-1 pseudo-root `mine` resolves to the signed-in user's workspace, and phase-1 items in `mine` move to the workspace of the single user `admin`.
- ~~**The folder chain Cube compiles** is the list of model-bearing folder ids, nearest first, in a signed `wechartModel` claim that only the API mints after checking access (research `cube/per-folder-models.md`, layout B).~~ **Superseded 2026-09-25** by the user's architecture decisions 1–3 and 5 (`docs/inputs/2026-09-25-architecture-decisions.md`; requirements §P2.4 "Architecture", R27). Cube plus xcube serve one flat model under folder-id prefixes. xcube binds short names at publish, nearest first from each item's own folder. No chain is signed into tokens. **Then, 2026-09-26** `[IP 1–4]`: wechart publishes changesets and the folder tree to xcube, and xcube compiles the published items as modules.
- **The security-on end-to-end suite is separate.** It is `playwright.security.config.ts`, with its own API (port 4300), web preview (port 5373) and Dex, so the phase-1 suite (security off) stays as it is until AC-308's end-of-phase check (the user's R13).
- **Every API route declares its access class**: `public` (health and `/api/auth/*`), `cube` (key-guarded model routes), `user`, or `admin` (a Super-Admin's alone, T323). A test fails for any unclassified route (T318). *The `cube` class goes with the model routes (decision 1: Cube never calls wechart; AC-251, AC-327). That happens in ~~slice 3~~ slice 2's cut-over (T431, done 2026-09-26).*
- **The service credential and xcube's admin routes (2026-09-26).** wechart calls xcube's admin API (`/v1/semantic/*`, `[plan]` "The contract") only from its server, with a service token of its own (`role: service`, `aud: xcube-admin`). The contract's paths are the plan's draft. A route the tasks need but the draft lacks, such as the JWKS push, is proposed on the plan doc's contract section before it is built.

## P2.0 Foundations: the request's user and effective access

- [x] T311 [P] (AC-254) Carry the request's user, and run as the single Super-Admin while security is off
- [x] T312 [P] (AC-260, AC-261, AC-255) Compute each folder's effective read-only and read-write groups
- [x] T313 (AC-262, AC-263, AC-264, AC-265, AC-256) Decide what each user may see and change in each folder
- [x] T314 (AC-259, AC-260) Store each folder's groups and serve its effective access

## P2.1 Sign-in (F25)

- [x] T315 [P] (AC-257) Run Dex 2.45.1 beside wechart in docker-compose, with the test users and their groups
- [x] T316 (AC-252, AC-316) Sign users in with openid-client, keeping identity and groups in a server-side session
- [x] T317 (AC-253) Sign out: end the wechart session so the next request needs a new sign-in
- [x] T318 (AC-251) Refuse every API route without a session, except health and sign-in, and prove no route is unclassified
- [x] T319 (AC-252, AC-254) Show the account button and menu, or the single-user chip
- [x] T320 (AC-257, AC-252) Build the security end-to-end harness: its own API, web preview and Dex, with a sign-in fixture per role
- [x] T321 (AC-251, AC-316, AC-253) Send a page request without a session to sign-in, rendering no wechart content first
- [x] T322 (AC-008) Put the signed-in user's groups into every Cube request's security context
- [x] T323 (AC-256, AC-265) Take the Super-Admin group from the deployment's configuration and open every admin surface to its members
- [x] T324 (AC-257, AC-251) Run Dex beside wechart in the Helm release on docker-desktop and sign in there

- [x] T412 (AC-317) Refuse a request from another site that would change something
- [x] T416 (AC-318) Refuse to start with sign-in on and no Super-Admin group

## P2.2 Folder permissions and roles (F26)

- [x] T325 (AC-264, AC-194, AC-261) List and count only what the user may see in the tree, listings and search
- [x] T326 (AC-263, AC-266, AC-264) Read-only users read dashboards and change nothing
- [x] T327 (AC-262) Read-write members see their folders' ancestors view-only
- [x] T328 (AC-267) When security is first turned on, keep phase-1 content as the shared tree, visible only to Super-Admins
- [x] T329 (AC-291) Apply subfolders, permissions, renames, moves and deletes at once for read-write members
- [x] T330 (AC-259, AC-260, AC-265) Edit a folder's groups in the Access panel
- [x] T331 (AC-001, AC-192, AC-194) Shape Explore and the top bar by role

## P2.3 Credentials (F34)

- [x] T332 [P] (AC-298) Encrypt data-source credentials in the metadata database
- [x] T333 (AC-324, AC-298) ~~(AC-311, AC-298) Load the encryption key, and refuse to start without a usable one~~ Load xcube's public key, and refuse to start without it *(rewritten 2026-09-26: AC-311 is retired; wechart holds no decryption key, `[AD 7, IP 1, R27]`)*

## P2.4 Models and data sources in folders; names and per-folder Cube (F27, F28)

*2026-09-26: "per-folder Cube" is superseded. wechart keeps model files and data sources as folder items, and publishes them to xcube as changesets. The tasks that served Cube a chain per folder are retired or rewritten here, and the publishing itself is in P2.17.*

- [x] T334 (AC-269, AC-131, AC-262, AC-266) Keep model files in folders and list them in Explore
- [x] T335 (AC-269, AC-164, AC-312, AC-298, AC-262, AC-161) Keep data sources as folder items, never sending a credential to the browser
- [x] T336 (AC-270, AC-271, AC-249) Keep names unique per folder, and free across folders
- **T337 (retired 2026-09-25, superseded by the architecture decisions 1–3 and 5; the ID stays):** ~~(AC-272, AC-275, AC-309) Serve each folder chain its model, nearest definition first~~. There are no chains: xcube binds names at publish in one flat model, and AC-309 is retired. The new resolution and publish tasks replace it (P2.17).
  - Files: `packages/api/src/model/chain.ts` (+ test), `packages/api/src/model/publish.ts` (`GET /api/cube-model/chains`, `/chains/:chain/files`, `/chains/:chain/version`)
  - Failing test: `chain.test.ts`:
    - /A/B's chain serves /A/B's `sales` and not /A's, and nothing from /A/B/C or a sibling (AC-272);
    - a join inside /A's model naming `orders` binds to /A/B's `orders` in /A/B's chain (AC-309);
    - changing /A changes the version of every chain through /A that doesn't define the name nearer, and of no other (AC-275).
  - Depends on: T334
- **T338 (retired 2026-09-26, superseded by decision 3 and the plan; the ID stays):** ~~(AC-273, AC-310) Resolve each model's data sources from its own folder, and give a cube with none the nearest `default`~~. xcube binds `data_source` names at publish, nearest first from the model's own folder, with no descendant fallback `[IP 3, plan]`. wechart's side is T435 (binding) and T443 (the root's `default`).
  - Files: `packages/api/src/model/data-sources.ts` (+ test), `packages/api/src/model/chain.ts` (served files name canonical `ds_<id>_v<n>` sources)
  - Failing test: `data-sources.test.ts`: a model in /A/B naming `warehouse` uses /A's when /A has one, and /A/B/C's only when no folder on the path has it; two descendants' `warehouse` and none on the path is refused, naming both (AC-273); a cube with no data source uses the nearest `default` on its model's path, else the deployment's (AC-310).
  - Depends on: T335, T337
- **T339 (retired 2026-09-25, superseded by the architecture decisions 1, 2 and 7; the ID stays):** ~~(AC-008, AC-272) Configure Cube for folder chains: app id, files, version, refresh contexts and data sources from wechart~~. Cube takes its model and connections from xcube, never from wechart. xcube's configuration task replaces it, through the Cube-expert agent (P2.17).
  - Files: `infra/cube/cube.js` (the `wechartModel` claim in `contextToAppId`, `repositoryFactory` and `schemaVersion`; `scheduledRefreshContexts` from `/chains`; `driverFactory` answering `ds_*` names from `/api/cube-model/data-sources/:name`, from memory), `packages/api/src/model/publish.ts` (the key-guarded, decrypted data-source route), `packages/api/src/model/cube-config.test.ts`
  - Failing test: `cube-config.test.ts`: two chains get different app ids and fetch their own files; groups never enter an app id; `driverFactory` answers a `ds_*` name from wechart once and from memory after; an unknown name throws (AC-008, AC-272).
  - Depends on: T337, T338, T333
- [x] T340 (AC-268) ~~(AC-272, AC-268) Make every query name the item it serves, check access, and sign that item's chain~~ Make every query name the item it serves, and check access before it reaches Cube *(rewritten 2026-09-26: there is no chain to sign; binding is T429's, `[IP 3, IP 6]`)*
- [x] T341 (AC-274, AC-328) Keep two folders' same-named cubes and their rollups apart, under their prefixed names *(rewritten 2026-09-26: xcube publishes each under `<folderId>__<shortName>` with its own `sql_alias`; nothing is served from wechart, `[IP 3, plan, R28]`; amended again 2026-09-26, `[X3, user; R30]`: the root's stay bare)*
- [x] T342 (AC-222, AC-131, AC-141, AC-329) Open a model in its folder, beside that folder's files, read-only when shared

## P2.5 Workspaces (F29)

- [x] T343 (AC-276, AC-277) Give each Super-Admin and read-write member a private workspace, and read-only users none
- [x] T344 (AC-278, AC-279) Copy a dashboard into the workspace with its charts, never editing shared items in place *(2026-09-27: the copy; the refusal of in-place edits moved to T349, and on 2026-09-28 to T352)*
- [x] T345 (AC-282, AC-192) Create items in the workspace with a target folder
- [x] T346 (AC-280, AC-298) Copy a data source into the workspace with its credentials, still encrypted *(rewritten 2026-09-26: wechart copies the ciphertext and never opens it, `[AD 7, IP 1]`)*
- [x] T347 (AC-281, AC-283, AC-323, AC-280, AC-329) Resolve a workspace item's cubes in the workspace first, then along its origin's or target's path, through an xcube overlay *(rewritten 2026-09-26: slice 5; there are no `ws:<user>` chains, `[AD 8, IP 7, plan]`)*
- [x] T348 (AC-278) Show the workspace band, each item's origin and target, and "Edit in my workspace" / "Open my copy"
- [x] T498 (AC-343) My workspace as design 04 draws it in Explore: first in the tree, its band, each item's origin and target, and its status *(added 2026-09-27, split from T348; design 04 of 2026-09-27, pins 1–4 and 8)*

## P2.6 Proposals, approval and history (F30)

- [x] T349 (AC-284) Propose a workspace item into its target folder, with an optional description of up to 1,000 characters
- [x] T350 (AC-285) Put the workspace-only models a proposed dashboard needs into the same proposal
- [x] T351 (AC-286) Let only the author, the target folder's read-write members and Super-Admins decide a proposal
- [x] T352 (AC-288, AC-298) Land an approved item in its folder, keeping the replaced version in history *(rewritten 2026-09-26: an approved model lands through xcube's changeset, T426; "the served files of that folder's chains" are gone, `[IP 1, IP 5]`. AC-278's refusal moved to T502, 2026-09-28)*
- [x] T502 (AC-278) Refuse in-place changes to a shared dashboard, chart or data source while sign-in is on *(split from T352, 2026-09-28)*
- [x] T353 (AC-290) Return a rejected proposal to its author with the approver's reason
- [x] T354 (AC-289) Keep each item's last 10 versions for read-write members and Super-Admins, and restore one only through a proposal
- [x] T355 (AC-287) List the proposals each user may decide, with their number in the top bar
- [x] T356 (AC-287, AC-286, AC-288, AC-341, AC-343) Review a proposal by seeing the item itself, then approve or reject it
- [x] T357 (AC-289) Show an item's history, compare a version, and propose restoring it
- [x] T358 (AC-284, AC-290) Propose from the workspace item: the dialog, the counter, the bundle and the waiting band
- [x] T359 (AC-254) With security off, the single user works through a workspace and approves their own proposals *(2026-10-01, `[R52]`: "Workspace-only now". With security off, shared items are changed only through the workspace, as with sign-in on, and the phase-1 suite's in-place editing steps are rewritten to go through the workspace and a self-approved proposal: AC-308's rewrite, pulled forward)*

## P2.7 Data sources and connections (F18, returned)

- [x] T360 [P] (AC-160) Define the six driver types' connection and authentication fields
- [x] T361 (AC-159, AC-312) Have Cube run a connection test with its own driver, at wechart's request, and show each check *(rewritten 2026-09-26: slice 6; the test is xcube's `POST /v1/semantic/connections/test`, taking the ciphertext, `[IP 1, plan]`)*
- [x] T362 (AC-163, AC-298) Record each connection test and show a source's test history
- [x] T363 (AC-158, AC-159, AC-160, AC-161, AC-163, AC-325, AC-282) Add a data source in the workspace through Type → Connection → Test → Name, refusing a failing test without an override
- [x] T461 (AC-158, AC-163) Save a change to a data source's connection only once a test of that change passed *(added 2026-09-27, split from T363; no override, R32; re-split 2026-09-27: the settings page is T462, built to the phase-2 design review)*
- [x] T462 (AC-269, AC-161, AC-163) Open a stored data source in its settings, from Explore and from Data sources *(added 2026-09-27, split from T461; built to design 03 of 2026-09-27. Re-split 2026-09-27: changing it is T497)*
- [x] T497 (AC-161, AC-310, AC-158, AC-164, AC-312) Change a data source on its settings page, saved only after a passing test of the change *(added 2026-09-27, split from T462; design 03 of 2026-09-27)*
- [x] T499 (AC-343) Design 03's remainder: Usage's Model column, a data source's description, and the bar's workspaces asking before leaving *(added 2026-09-27; design 03 of 2026-09-27, states B, F and I)*
- [x] T364 (AC-157, AC-233) List every visible data source with its folder, driver and health *(2026-09-27: the cubes using each moved to T459; its AC-001 clause is T331's; its AC-161 showing is T363's)*
- [x] T365 (AC-161) After an approved change to a source, show whether every running Cube instance uses it, with no restart *(rewritten 2026-09-26: slice 6; xcube swaps the driver and reports each instance's state, `[plan]`)*

## P2.8 Bookmarks (F31)

- [x] T366 (AC-292) Keep each bookmark its saver's own
- [x] T367 (AC-293) Share a bookmark with everyone who may see the dashboard; only its owner changes it
- [x] T580 (AC-293) Let a Super-Admin delete any shared bookmark, so one its owner can no longer reach can be removed *(added 2026-10-04, R61)*

## P2.9 Audit trail (F32)

- [x] T368 (AC-294, AC-298) Record every sign-in, permission change, proposal, approval, rejection, restore and data-source change
- [x] T581 (AC-298, AC-325) Drive the rest of the credential plan: every driver's secret fields, the remaining flows, and the dumped envelopes opened *(added 2026-10-04, R61)*
- [x] T369 (AC-295) Show the audit trail to Super-Admins only, newest first, filtered by user, event and folder
- [x] T370 (AC-296) Remove audit records older than the configured retention, one year by default

- [x] T500 (AC-001, AC-295, AC-265, AC-343) Security for Super-Admins alone, in tabs at their own addresses, its Policies worded for folder groups *(added 2026-09-27; design 08 of 2026-09-27, pin 1 and states D and F)*

## P2.10 Jobs and Schedules (F17 returned, F33)

- [x] T371 (AC-297) Scope Jobs and Schedules to the models of the user's read-write folders
- [x] T504 (AC-145, AC-150, AC-151, AC-155, AC-234, AC-297) Design the Jobs and Schedules surfaces no design draws, and reconcile designs 10 and 07 *(added 2026-09-28, R40: "Draw new designs first")*
- [x] T372 [P] (AC-150) Record each build wechart starts, one record per start, and follow it to its end on the server
- [moved to the next phase] T373 (AC-150) ~~Record the refresh worker's builds through Cube's `logger` option~~ Pull the refresh worker's builds from xcube into wechart's history *(rewritten 2026-09-26: Cube never calls wechart, so xcube records build events through Cube's `logger` option and wechart pulls them, `[AD 1, R27]`; research `cube/xcube-runtime.md`, finding 6. **Deferred 2026-09-28, R41:** the user, "History of the refresh worker's build.. we can defer this to the next phase"; `docs/phase-2/backlog.md` §7)*
  - Files: `packages/api/src/xcube/builds.ts` (+ test), `packages/api/src/repos/build-history.ts`. xcube's build-event record and its route come from the Cube side; the route is proposed on the plan's contract, which lists none yet.
  - Failing test: `builds.test.ts`, against the stub xcube:
    - a completed or failed refresh-worker build is stored once as "started by Cube's refresh worker", however many replicas pull;
    - a `* * * * *` rollup appears in Run history within one check period (AC-150).
  - ~~Files: as T261 (above). Failing test: as T261: … the logger never throws (AC-150).~~
  - Depends on: T372, T420
- [x] T374 (AC-150) Show Run history in Jobs, and a build's log
- [x] T376 (AC-151) Show the build queue, and cancel a queued build wechart started
- [x] T375 (AC-145) List a rollup's partitions with their states, and rebuild the selected ones or all
- [x] T550 (AC-391) Each pre-aggregation's row: its state, when it was last built, who started that build, and its partitions *(added 2026-10-02, `[R56]`: design 16's screen 1)*
- [x] T377 [P] (AC-153) Fix what T258's and T159's reviews found, with design 16's daylight-saving rule, then tick AC-153 again
- [x] T551 (AC-154) Schedules' refresh-key rows as design 16 draws them, every rollup included *(added 2026-10-02, `[R56]`; T160's review findings, moved from T377)*
- *T505 moved below T379 on 2026-10-02 (`[R56]`): it records the cancel and the schedule changes, so it follows them.*
- [x] T506 (AC-353) Keep a stored BigQuery key or Snowflake or Dremio token unless replaced, and warn that replacing it rebuilds the rollups *(added 2026-09-28, R42.5)*
- [x] T378 (AC-234, AC-297) Run wechart's own schedules: each due run builds every partition through Cube's jobs API
- [x] T552 (AC-234, AC-392, AC-154) Make, change and delete a wechart schedule on Schedules, listed beside the refresh keys *(added 2026-10-02, `[R56]`: design 16's screen 2 and state D)*
- [x] T379 (AC-155) Suspend a wechart schedule after its set number of failed runs in a row, say so, and offer Resume
- [x] T505 (AC-294) Record builds started from Jobs, cancels, and changes to wechart-owned schedules in the audit trail, a suspension by "wechart's scheduler" *(added 2026-09-28, R42.8; rewritten and moved here 2026-10-02 to design 16's state I and Q12, `[R56]`)*
- [x] T553 [P] (AC-393) The refresh worker's badge and panel, from xcube's refresh-worker route *(added 2026-10-02, `[R56]`: design 16's state F and Q4)*
- [x] T554 (AC-394) Stop a building build that wechart started *(added 2026-10-02, `[R56]`: design 16's P1)*
- [x] T555 (AC-395) Run now on a wechart schedule *(added 2026-10-02, `[R56]`: design 16's P2)*
- [x] T556 (AC-396) Pause and resume a wechart schedule by hand *(added 2026-10-02, `[R56]`: design 16's P3)*
- [x] T557 (AC-397) Schedules' owner filter, with counts *(added 2026-10-02, `[R56]`: design 16's P4)*
- [x] T558 (AC-398) Jobs' header summary: building, queued, failed and suspended *(added 2026-10-02, `[R56]`: design 16's P5)*
- [x] T559 (AC-297, AC-399) The Folder column, filter and scope note on every Jobs tab and on Schedules *(added 2026-10-02, `[R56]`; the "Folder column and filter" T371 left to the design)*
- [x] T560 (AC-399) Design 16's states, and its rewording of design 10's note *(added 2026-10-02, `[R56]`: design 16's state G and state J)*
- [x] T610 (AC-399) The rest of design 16: Search, Queue's Started by, G1's heads, G5b, G6's Not found page, G7's "You", G8's pinned actions, H2's indents *(added 2026-10-07 by the coordinator: design 16 is approved and binding, so what T559 and T560 left unbuilt is built here)*
- [x] T640 (AC-176, AC-399) Jobs' and Schedules' sheets below 1,024 px act as sheets: Esc, Tab kept in them, their toast over them, focus back to what opened them *(added 2026-10-07 by the coordinator, from group 6's read-only audit of T560; the user: reuse the `.source-pane` sheets of designs 01, 11 and 13)*
- [x] T611 (AC-399) Design 16's structure and behaviour still unbuilt *(added 2026-10-07, from the design 16 audit during T610; the coordinator: "T611 (structure and behaviour), T612 (wording) and T613 (icons and styling), one commit each")*
- [x] T612 (AC-399) Design 16's wording still unbuilt *(added 2026-10-07, from the design 16 audit during T610; R68 keeps "Cube's default: every hour" and "wechart didn't see how it ended" as built)*
- [x] T613 (AC-399) Design 16's icons and styling still unbuilt *(added 2026-10-07, from the design 16 audit during T610)*
- [x] T614 (AC-399) Design 16's refresh worker panel as F2 and F3 draw it, and Jobs' list below 1,024 px as G8 draws it *(added 2026-10-08; the coordinator, under the user's delegation, R76: J1 (a), J2 (a), J3 (b))*

## P2.11 Quick calculations and calculation requests (F6, returned)

- [x] T380 [P] (AC-047) Offer the six quick calculations on a measure
- [x] T381 (AC-049) Disable a period calculation without a time dimension, and say which field is missing
- [x] T382 (AC-048) Compute quick calculations in Cube as generated multi-stage measures, and label the measure
- [x] T383 (AC-050, AC-287) Record a calculation request and show it to the read-write members of the folder whose model defines the cube
- [x] T384 (AC-051) Open a request's cube in the member's workspace model editor, with the request beside it
- [x] T385 (AC-052) Resolve a request when its measure is approved into the folder, naming the member

## P2.12 Markings (F10, F11, returned)

- [x] T386 [P] (AC-093) Mark a continuous range by dragging along an axis
- [x] T387 [P] (AC-097) Draw a partly marked item: the marked share for additive measures, a pattern for the others
- [x] T453 [P] (AC-097) Draw partly marked items on the remaining chart types *(added 2026-09-26 from T387's review: they fade every item, "no marked share")*
- [x] T388 [P] (AC-104) Obtain the marked share with one extra query per tile, keeping the base result cached
- [x] T389 [P] (AC-116) Render marking and measure tokens in text tiles
## P2.13 Charts (F35)

- [x] T390 [P] (AC-041) Fold the remainder into "Other (n)" or drop it, and offer a row limit
- [x] T391 [P] (AC-299) Thin or abbreviate value-axis labels so none overlap
- [x] T392 [P] (AC-300) Draw, stack and list series in the order set in Customize
- [x] T393 [P] (AC-301) Order a table's columns as the wells order its fields
- [x] T394 [P] (AC-302) Edit a markdown tile's text in edit mode
- [x] T395 [P] (AC-303) Draw pie and donut labels whole, moving or hiding the ones that don't fit
- [x] T396 [P] (AC-304) Fold the app bar into a menu below 1,024 pixels
- [x] T397 [P] (AC-313) Detect ISO-3 country codes, with the model's marking overriding
- [x] T398 (AC-305, AC-313) Draw a country map on Natural Earth 1:50m boundaries, with a legend, and name the codes it can't place
- [x] T399 [P] (AC-306) Draw a box plot with type-7 quartiles, and whiskers per the chart option
- [x] T400 (AC-314) Compute a box plot's values once per "Each point is"
- [x] T401 (AC-315) Say "computed from _n_ of _N_ rows" when a box plot's data passes Cube's row limit

## P2.14 The UI fixes (F21–F23, returned)

- [x] T402 [P] (AC-201) Keep the marked-items badge in the header row beside the title
- [x] T403 [P] (AC-220) Name members by their titles in the Acceleration tab and every other place the re-critique found
- [x] T404 [P] (AC-246) Open the tile's menu with Shift+F10 or the Menu key on any chart tile, one with no fields included
- [x] T405 (AC-176) Reach the remaining pointer-only actions from the keyboard
- [ ] T743 (AC-176) **Not built, by R75 (2026-10-08): build only on the user's approval.** Keep Tab inside the data source wizard, Import, Export and Generate cubes sheets below 1,024 px, and give focus back after Import's Keep going, the folder heading's Rename and "Back to current" *(added 2026-10-08, from T405's re-audit)*
  - Files:
    - `packages/web/src/workspaces/data-sources/NewSourceWizard.tsx`
    - `packages/web/src/workspaces/explore/import/ImportPane.tsx`
    - `packages/web/src/dashboard/export/ExportPane.tsx`
    - `packages/web/src/workspaces/model/GenerateCubes.tsx`
    - `packages/web/src/workspaces/explore/ExplorePage.tsx`
    - `packages/web/src/workspaces/data-sources/{SourceVersion,SourceSettings}.tsx`
    - `packages/web/src/dashboard/DashboardPage.tsx`
    - each with its tests, plus `e2e/sheets.spec.ts` and `e2e/keyboard-coverage.spec.ts`
  - Failing test:
    - **Sheets, at 390 px:** in each of the four, Tab from its last stop goes to its first, and Shift+Tab from its first goes to its last; Esc closes it from anywhere in it; focus goes back to what opened it. This is T640's `SheetTrap`, or the same keeping.
    - **Import:** "Keep going", and Esc over the question, put focus back where it was in the pane.
    - **Explore:** Enter, Esc and blur in the heading's Rename give focus to the Rename button.
    - **A version's view:** "Back to current" gives focus to the History button, or to the version's row if the panel is open.
    - **In the browser:** check the disabled-while-busy cases listed under T405's re-audit, and fix those that drop focus.
  - Depends on: T640
- [x] T631 (AC-176, AC-090, AC-091) Mark or cross-filter a series or a trellis panel from the tile's ⋯ menu *(added 2026-10-04, R63)*
- [x] T632 (AC-091, AC-117, AC-188) A trellis header's click names its own panel once a filter has dropped others; the tile menu writes values of time as the legend does *(added 2026-10-04, from T631's review; the coordinator)*
- [x] T633 (AC-329, AC-342) A dashboard filter's "Filter on" as design 10's grouped picker *(added 2026-10-04, R64: "Yes, same picker")*
- [x] T634 (AC-176) Ctrl+Enter on a "Mark series ›" or "Mark panel ›" entry adds it to the marking, as a Ctrl-click does *(added 2026-10-04, R64: "Ctrl+Enter adds")*
- [x] T635 (AC-091) A Ctrl- or ⌘-click on a trellis header adds its panel to the marking *(added 2026-10-07: the coordinator's call, overturnable, on T634's question)*
- [x] T636 (AC-176, AC-093) Mark a range from the keyboard: "Mark range…" in the tile's ⋯ menu, asking a from and a to *(added 2026-10-07, R66: ""Mark range…" in tile menu")*
- [x] T637 (AC-176) A review's YAML diff unfolds from the keyboard: "Show all lines" beside it, and each folded stretch a button *(added 2026-10-07, R66: ""Show all lines" toggle")*
- [x] T638 (AC-176) A visible focus ring wherever one was hidden or cut off, and Ctrl+Enter takes a marked series off *(added 2026-10-07, from T405's re-audit for AC-176; the coordinator's calls: E (a), F (b))*
- [x] T639 (AC-176) The calculation request asks before a typed description is lost and gives focus back; the target tree keeps its tab stop *(added 2026-10-07, from T405's re-audit for AC-176: its rule-85 asides; the coordinator)*
- [ ] T406 (AC-187) Re-run the design critique on every surface and tick AC-187 only on measured conformance
  - Files and failing test: as T225 (above), with the phase-2 surfaces added (AC-187).
  - Depends on: T330, T348, T356, T364, T369; for its re-run, T681–T699 and T742
  - **Step 1, done 2026-10-08: the critique.** T406 stays open, and AC-187 unticked. Its failing test, T225's ("the `design-critic` report finds no `STRUCTURE` or AC-187 finding"), fails on what the critique found: 156 findings besides those already covered, one of them (EXP-01) fixed since by T741. They are planned below as T681–T699 and T742. Step 2, once they land, is T406's own: the critique run again over the same surfaces, ticking T406 and AC-187 if it finds nothing.
    - **What it covered.** Every surface, judged against the approved designs (`docs/design/reviews/status.md`, and designs 13–16), the prototype, and direction.md §3–5. The later design wins where two disagree (R37). Folded in, at the coordinator's direction:
      - AC-352's surfaces: 2026-09-24 designs 01, 02, and 04–06. Its seventh, Schedules (design 07), is drawn again by 2026-10-01 design 16, which wins (R37).
      - **Jobs and Schedules, not judged again here:** 2026-09-24 design 07, and 2026-09-27 design 10's Jobs and Schedules parts, are superseded by design 16 (approved R56). The design 16 audit of 2026-10-07 (during T610) planned their differences as T611–T613 (AC-399), which the Jobs and Schedules agent is building. T476's schedule pane and Jobs' and Schedules' pills are among them.
      - **Design 10's other surfaces**, the bookmarks and the cube picker (with Filter on's picker, which reuses it, R64), are judged in `2026-10-08-design-10.md`.
      - **Design 15** is judged on what its captures reached (the SQL tab with the runner off). Its screen 1 and states A–J need a source to run SQL on, and are built (T535, T539, T536, T545–T549); the re-run captures them.
      - AC-344's Model workspace differences;
      - T476's deferred control sizes (its Q1, Q2 and Q5 surfaces);
      - design 04 note 4, which is built as drawn (the coordinator's call), in T681.
    - **How it was done.**
      - Captures of the running app, taken with a Super-Admin under the e2e lock:
        - with sign-in off, at 1,440 × 900, with some at 1,024 × 768 and 390 × 844;
        - with sign-in on, at 1,440 × 900.
      - Each capture saved a screenshot and every visible element's box and computed styles.
      - Seven `design-critic` agents judged them, one per group of surfaces, without picking any new values.
    - **The critiques**, in `docs/design/critiques/`:

      | File | Findings | Questions |
      |---|---|---|
      | `2026-10-08-chart-editor.md` | EDI-01–25 | 9 |
      | `2026-10-08-dashboard.md` | DSH-01–23 | 9 |
      | `2026-10-08-model-workspace.md` | MOD-01–07 | 4 |
      | `2026-10-08-data-sources.md` | SRC-01–23 | 6 |
      | `2026-10-08-explore-access-signin.md` | EXP-01–27 | 8 |
      | `2026-10-08-security-reviews.md` | SEC-01–27 | 6 |
      | `2026-10-08-components.md` (AC-187's component rules) | CMP-01–13 | 5 |
      | `2026-10-08-design-10.md` (bookmarks, the cube picker; added from the cold review) | D10-01–13 | 7 |

      Each finding gives the design's value with its line or pin, the app's measured value, and whether a task, backlog entry or decision already covers it.
    - **Recorded with it:**
      - AC-344's Fails-when gets AC-352's escape (the coordinator's direction).
      - Backlog §6(a) gets the Model workspace's differences that tasks.md alone gave reasons for: the head without `model/`, Format as text, the tab strip's spacing, the 676:524 split, and T451's read-only state, which has no design.
      - "Hide" and the stacked editor below 1,024 px were already in §6(a).
    - **AC-148 holds with design 04 note 4.** The head's clock moves into the badge's tooltip, but AC-148's text needs no change if T681 lands DSH-01 and DSH-21 together. The tile menu's Data as of submenu then shows the time to the second, as design 08 state D draws it, and AC-148's test reads it there.
    - **Questions for the user: 53** (46, and design 10's 7). Each critique lists its own with options. Explore's Q7 was settled by design 15 (R37), and the components critique's Q1 narrowed to list heads, both from the cold review. The model critique's Q2 is recorded in backlog §6(a) at the coordinator's direction. The tasks below name the questions they wait on; the coordinator batches them.
    - **status.md is stale.** It lists as "left to build" items whose tasks are ticked (T331, T348, T498, T515, T473). Backlog §6(c)'s "design 03's Propose, History and version line" is unblocked, since the proposal chain T349–T358 has landed. T698 updates both.
  - **Step 2, 2026-10-17 (lane D): the re-run.** T406 stays open, and AC-343 and AC-187 unticked. **AC-352 is ticked.**
    - **How.** Each of the 2026-10-08 critiques' 158 findings was checked against the task that built it, the decisions, `accepted-differences.md` and the backlog, and against the test that measures it on the running app (design-conformance and each surface's own e2e). A finding with no measuring test got one: EDI-13 (the status line 12/16 muted, the canvas padded 12), EDI-21 (the underlying rows' cap line, 12/16 secondary, padded 6 12, the accent icon), SEC-15 (the policy cells' code face), D10-03 (the C/V chip at 12/600).
    - **The full real-Chrome run** (at cb91076a, with the known failures fixed): security 370 passed. Main 819 passed and 5 failed, and all 5 passed when rerun alone in real Chrome: `filters:201`, `model-design:263`, `model-design:855`, `model-popout:21`, `sheets:183`.
    - **AC-352 (designs 01, 02, 04–07 of 2026-09-24):** every EDI and DSH finding is built and measured. Two words differ, and both are now recorded in `accepted-differences.md` from their tasks' notes: EDI-02's "Details in Acceleration" link and DSH-21's "today".
    - **Accepted differences of 4 px or less:** none new. Every finding is built to a measuring test, or already recorded.
    - **AC-343 stays open** on a state design 09 draws: **EXP-20 state E**, the page for a sign-in whose groups claim didn't come. It needs a missing claim told apart from Entra's overage, which T411 holds (the Phase 2 End Run). T694-3's "Open in ‹folder›" (design 04 pin 7) is also not built, recorded as a later decision. Both are for the coordinator.
    - **AC-187 waits on AC-343** (R77: it closes on the per-surface results). No component difference is left unaccounted for.
    - **D10-13:** `status.md` row 10 and backlog §6(c) corrected.
- [x] T681 (AC-352, AC-148) A tile's freshness as design 04 note 4 draws it, and the tile menu's Data as of as design 08 draws it *(added 2026-10-08 by T406)*
- [x] T682 (AC-352, AC-199, AC-245, AC-247) The tile ⋯ menu's groups, order, heading and rows as design 08 draws them *(added 2026-10-08 by T406)*
- [x] T683 (AC-352, AC-187) The dashboard view's remaining differences: whole-number count axes, a table tile's row count, the KPI ramp, and backlog §1's residuals *(added 2026-10-08 by T406)*
- [x] T684 (AC-187, AC-352) One button rule and one pressed state: every `.btn` 32/14, item heads at one height with History first, and the designs' `.btn.pressed` *(added 2026-10-08 by T406)*
- [x] T685 (AC-352, AC-070, AC-073) The dashboard settings page as design 05 draws it *(added 2026-10-08 by T406)*
- [x] T686 (AC-352, AC-126, AC-022) The chart page as design 06 draws it, with "Add to a dashboard…" as its picker *(added 2026-10-08 by T406)*
- [x] T687 (AC-354, AC-360, AC-352) The Export pane docks beside the dashboard, which narrows, as design 13 draws it *(added 2026-10-08 by T406)*
- [x] T688 (AC-352, AC-187) The chart editor's inspector, field list and type gallery as design 01 and the prototype draw them *(added 2026-10-08 by T406)*
- [x] T689 (AC-352, AC-028, AC-029, AC-217, AC-032, AC-220) The recommendation in the inspector: the type card, quick picks, the Recommended card, "Why this recommendation?" and the aggregation menu, as design 01 draws them *(added 2026-10-08 by T406)*
- [x] T690 (AC-352, AC-036, AC-147, AC-301) The results drawer and the answer's facts as design 02 draws them *(added 2026-10-08 by T406)*
- [x] T691 (AC-344, AC-343, AC-187) The Model workspace's remaining differences and the shared pane chrome of Generate cubes and the data source wizard *(added 2026-10-08 by T406)*
- [x] T692 (AC-343, AC-344, AC-192, AC-282, AC-356) Making things in My workspace: the New menu as design 13 state G draws it, and the target folder as design 04 states A and B draw it *(added 2026-10-08 by T406)*
- [x] T693 (AC-187, AC-343, AC-369, AC-370) Explore's list, head, tree and menus as designs 14 and 04 draw them *(added 2026-10-08 by T406)*
- [x] T694 (AC-343, AC-278, AC-284, AC-289, AC-281) Each row's ⋯ by its kind and place, and My workspace's rows on two lines *(added 2026-10-08 by T406)*
- [x] T695 (AC-289, AC-343) The History panel as design 06 draws it: docked full height, its rows, and the current version always listed *(added 2026-10-08 by T406)*
- [ ] T766 (AC-289) History's Current row for an item with no kept version offers View, which opens the item as it is now *(added 2026-10-17: the user's answer to T695-1, "View opens it as now (Recommended)", R78)*
  - Files: `packages/web/src/workspaces/history/HistoryPanel.tsx` (+ test), `e2e/security/history.spec.ts`.
  - Today: the Current row with `kept: false` offers no View and no restore (T695-1, now overturned in `docs/design/decisions-2026-10-08.md`).
  - Failing test: for an item with no kept version (phase-1 content, or one made directly), the History panel's Current row offers View and no restore, and View opens the item as it is now, the same as opening it from Explore. A kept Current row keeps its View unchanged.
- [x] T696 (AC-187, AC-004, AC-252, AC-254, AC-287, AC-304, AC-190) The app bar, the account menu and the single-user chip as design 09 draws them *(added 2026-10-08 by T406)*
- [x] T697 (AC-251, AC-253, AC-343) wechart's own pages after signing out, when sign-in fails, and when no group list comes back, as design 09 states C–E draw them *(added 2026-10-08 by T406)*
- [x] T698 (AC-343, AC-284, AC-374, AC-187) A data source's pages as designs 03 and 15 draw them: Propose and the version line, the frame, the editor, Test to save, the save bar, and the SQL tab's off panel *(added 2026-10-08 by T406)*
- [x] T699 (AC-343, AC-165, AC-166, AC-169, AC-287, AC-290, AC-294, AC-295, AC-187) Security, the audit trail and reviews as designs 08 and 05 draw them *(added 2026-10-08 by T406)*
- [x] T742 (AC-329, AC-343, AC-293, AC-187) Design 10's cube picker and Bookmarks as drawn: every item's cubes under their folder with their paths, the pickers' search box, and the Bookmarks popover *(added 2026-10-08 by T406, from its cold review: design 10 hadn't been judged)*
- [x] T741 (AC-199, AC-245, AC-187, AC-231) A tile menu opened before its tile's answer is placed again as it grows; Explore's spacing as design 14 draws it; two layout tests re-based on their designs *(added 2026-10-08: the coordinator's calls on T680's three reported tests)*
- [x] T680 (AC-304, AC-034) A shared model file's head wraps at 390 px, and a tile's head is 22 px in edit mode too *(added 2026-10-08, from the five layout failures the coordinator passed on)*
- [ ] T407 (AC-180) Run the acceptance suites in Chrome, Edge, Firefox and Safari
  - Files: `playwright.config.ts`, `playwright.security.config.ts` (an Edge project locally when Edge is installed), `docs/handoff.md`
  - Failing test: both suites pass in all four browsers (AC-180).
  - Depends on: T405, T406
  - **Order- or environment-dependent tests to look at here** (found by T631–T635's runs):
    - `keyboard-coverage.spec.ts` "the folder tree moves with the arrow keys" failed once in each full run of the spec, in T631's and T633's, and passes alone.
    - `markings.spec.ts:2078` "Invert marking and Mark all…" failed in a run of the whole spec (2026-10-07: "1 of 3", then "1 of 4" bars faded on "By category"). It failed again alone while ports 4100 and 5173 may have been held by another worktree's servers, which `reuseExistingServer` then used. With both ports free it passed alone, on a fresh seed. Look for what an earlier test leaves in the shared seed.

## P2.15 The whole-surface checks

- [x] T408 (AC-268, AC-255, AC-261) Ask every route as users in and out of each group, and get nothing outside their folders
- [ ] T409 (AC-307) Render a 10-chart dashboard in a folder with its own models within 3 s at p95 with security on
  - Files: `e2e/perf/secure-dashboard-open.spec.ts`
  - Failing test: `secure-dashboard-open.spec.ts`: 20 opens as `writer` of a 10-chart dashboard in /A/B, ~~whose chain has its own models~~ which has its own models (published as their own modules, 2026-09-26), render every tile with p95 ≤ 3,000 ms (AC-307).
  - Depends on: T341, T408
- [ ] T410 (AC-308) End of phase 2: pass the phase-1 suite with security off, editing through the workspace and a self-approved proposal
  - Files: the phase-1 specs in `e2e/` whose steps edit shared content
  - Failing test: the phase-1 suite in all four browsers with security off (AC-308).
  - Depends on: T407, T409
- [ ] T411 (AC-258) End of phase 2: sign in against Microsoft Entra ID, or on-prem AD through a broker, and resolve groups
  - Files: `docs/deploy.md` (the configuration used), `docs/handoff.md` (the result)
  - Failing test: signing in as a directory user whose groups are known, and comparing the groups wechart resolves with the directory's (AC-258). **Needs the user:** a tenant or broker to test against.
  - Depends on: T410
  - Also to check there (T317's review): the provider must accept ~~wechart's public root~~ `<publicUrl>/signed-out` (T697, design 09 state C; the coordinator, 2026-10-08) as a post-logout redirect URI, which Entra requires to be registered; and a sign-out URL whose `id_token_hint` carries a token with up to 200 group GUIDs must fit the URL limits on the way.
  - Also from T697: design 09's state E ("Your sign-in worked, but no group list came with it.") isn't built. Dex and Keycloak leave the groups claim out for a user in no group, so its absence can't tell an Entra overage from such a user. Check here how Entra marks an overage, if the user chooses to detect it.

## P2.16 The Cube introspection package (branch `feat/xcube`)

The user's Cube fork moved the introspection API out of Cube's own packages into a standalone package, `cube-introspection/`, on an unmodified Cube v1.7.45: branch `feat/introspection-package` at `0b6eef90a9` (`docs/inputs/2026-09-25-cube-introspection-package.md`; research `cube/introspection-api.md`, which found no difference over HTTP and seven below it, none reaching wechart). The user took the switch on 2026-09-25 as the first step of slice 0 of their wechart ↔ Cube integration plan, on branch `feat/xcube` in both repositories so it can be rolled back. The image is still built locally. The rename to xcube landed with T417 (2026-09-26); a registry and a digest pin are the rest of slice 0.

- [x] T413 (AC-139, AC-250) Run the package's image in compose, for Cube and its refresh worker
- [x] T414 (AC-248) Run it in the docker-desktop Helm release
- [x] T415 (AC-248) Say how to build the image from the package
- [x] T417 (AC-139, AC-248) Run the renamed package, xcube, for Cube and its refresh worker in compose and the docker-desktop release

*The rest of slice 0, the image from a registry pinned by digest `[plan]`, waits on the Cube side's registry decision. Until then the image is built locally, as T417 does.*

## P2.17 The integration plan, wechart's side, slice by slice (added 2026-09-26)

These tasks carry out wechart's column of the plan's slices (`docs/inputs/2026-09-26-integration-plan.md`, "Slices"). Each depends on the xcube routes its slice brings, which the Cube side builds and the user brings over. Routes the plan's contract lacks are proposed on the plan doc's contract section first: the JWKS push, and the build-event record.

The IDs T424, T434 and T439 are unused; no task carries them.

Most tests here run against a **stub xcube** (`packages/api/src/xcube/fake.ts`), a server that records every call and answers as the contract says. Each slice's end-to-end test runs against compose's Cube once it runs xcube's slice.

Slice 7 is optional in the plan and has no criterion, so it has no task. It would use Cube's own answers in place of the rules wechart re-implements. *(2026-09-28, R39: deferred past phase 2, with aliasing a file-set model's JavaScript, Jinja and Python cubes on a changed target; `docs/phase-2/backlog.md` §7.)* The plan's runbook (slice 8) has no criterion either; either can be proposed as a spec change when the user wants it.

### Slice 2: foundation

- [x] T418 [P] (AC-319) Keep publish drafts in the metadata database, so any API replica answers Cube's read-back
*Rewritten 2026-09-26 for xcube's slice 2 as built (`[X2, R29]`; `docs/research/xcube-slice-2.md`). xcube's side is done at the fork's `83cb9f0888`. wechart's side cuts over in one step, T447: xcube serves the model from then on, with no switch back but the previous image and release. Until T447, the code below runs only where the xcube settings are given (the model id and the admin token), so each commit leaves both suites passing on today's Cube. T431 then removes the old path. The service credential moves to slice 4 (T420): until then, xcube's admin routes take its static admin token (R29).*

- [x] T419 (AC-333, AC-330) ~~Bring xcube's copy up to date when the API starts, with a full snapshot when it is missing or behind~~ Push the whole published file set to xcube at start, after each publish and every 60 s, recording what xcube acknowledged
- [x] T445 (AC-136, AC-235) Check a publish with xcube's dry run in place of the draft Cube compiles, refusing every break
- [x] T446 (AC-335, AC-140) Send only plain YAML to xcube, and keep other model files read-only in wechart's store
- [x] T447 (AC-333, AC-334, AC-330, AC-335, AC-235) Cut over: xcube serves the model in compose and the docker-desktop release
- [x] T420 (AC-326, AC-250, AC-333) Call Cube and xcube on wechart's own behalf with a service credential, never a user's token *(moved to slice 4, 2026-09-26: xcube's admin routes take its static admin token until then, `[X2, R29]`)*
- [x] T421 (AC-334, AC-319) Name the model and the revision in every query token, key the metadata cache by xcube's revision, and wait for the migration lock
- [x] T422 [P] (AC-319) Retry the web app's ~~idempotent requests~~ queries when an API replica or a Cube instance goes away
- [x] T423 (AC-319) Run two Cube instances and two API replicas in the docker-desktop release, and survive stopping one of each

### Slice 3: names and modules

*Rewritten 2026-09-26 for xcube's slice 3 as built (`[X3, X3A, R30]`; `docs/research/xcube-slice-3a.md`, `xcube-slice-3b.md`). xcube's side is done in the fork, and published as `ghcr.io/senthilkrajagopal/xcube:v1.7.45-c0610bb768`.*
- *The root keeps its bare names, and nothing stored is migrated (AC-331 retired; AC-336).*
- *wechart moves its model to items mode once (T449), then publishes through changesets (T426).*
- *Modules (3b) change nothing wechart sends. What comes back can differ once a cube is shared across zones: union waits and `503`s, merged meta, a job token per module (`xcube-slice-3b.md`, Gotchas 3-7). Today's model is one module.*
- *Order: T448 and T425 run first, on today's image. T449 is the switch and brings the image. T430, T426 and then the rest follow it. Every commit leaves both suites working.*
- *Questions for xcube go through `~/Work/xcube-exchange/`.*

- [x] T448 [P] (AC-337) Keep one cube or view per model file: split files at start, and refuse a publish declaring two
- [x] T425 [P] (AC-328) ~~Push the folder tree to xcube, ids and parents, when the API starts and on every folder change~~ Give each folder a stored xcube id, never reused, and build the published folder tree
- [x] T449 (AC-333) Move the model to xcube's items mode with one items snapshot, and reconcile on the items hash, on xcube's published image
- [x] T430 (~~AC-331~~ AC-336) ~~Migrate every stored member reference to its prefixed name, and show every dashboard as before~~ Show every existing dashboard as before across the move to items mode, with nothing stored changed
- [x] T426 (~~AC-321,~~ AC-136, ~~AC-288, AC-291,~~ AC-009, AC-137) Publish through xcube's changesets, checking every module a change affects *(split 2026-09-26: proposals don't exist yet (T343–T359), so their check and approval are T451; a direct delete comes with T428's deletes)*
- [x] T451 (AC-321, AC-288, AC-291, AC-322, AC-285, AC-278, AC-254, AC-189, AC-235) Check a proposal with a changeset's dry run when it is made, and apply that changeset at approval *(split from T426, 2026-09-26)*
- [x] T427 (AC-322) Word a refused publish: breaks named in the folders the user may see, a count for the rest, all in the audit trail
- [x] T428 (AC-275) Keep published items bound until they are published again, and refuse to delete or rename a name still referenced
- [x] T452 (AC-328, AC-271) Publish model files into any folder, as that folder's items in xcube *(added 2026-09-26: after T334, only the root's files reached xcube, and T429's picker and T341's isolation both need a folder's cubes published)*
- [x] T429 (AC-272, AC-329) Bind a chart's and a dashboard's cubes at publish ~~to their prefixed names~~ through xcube's resolver, and pick cubes by title and folder path
- [x] T431 (AC-327, AC-251) Remove Cube's model callbacks: `/api/cube-model/*`, the `cube` access class, and the model logic in `cube.js` *(moved into slice 2's cut-over, 2026-09-26, `[R29]`: it follows T447 there)*
- [x] T450 (AC-329, AC-189, AC-249) Compare a folder item's members by short name and show them by title, in the checks and places that read the model
- **T432 (retired 2026-09-26 into T426, `[R30]`; the ID stays and is never reused):** ~~(AC-009, AC-137) Serve metadata from xcube's merged field list, with a new revision seen within 60 s~~ xcube has no field-list route; T426 re-runs AC-009's and AC-137's tests on items mode.
  - ~~Files: `packages/api/src/cube/meta-cache.ts`, `packages/api/src/xcube/meta.ts` (+ test). Failing test: `meta.test.ts`: after a changeset lands, `/api/meta` from either replica returns its new members once xcube reports the revision active on every instance, within 60 s, and without restarting Cube. AC-009 and AC-137 keep their wording, and T447 re-runs their tests against xcube (2026-09-26, `[R29]`); here they are checked again against the merged field list. Depends on: T421, T426~~
- [x] T433 [P] (AC-332) Refuse to publish a model item that isn't plain YAML
- **T435 moved to slice 6 (2026-09-26).** xcube binds `data_source` with connections, not in slice 3. Until then it passes the name through unchanged `[xcube answer to-wechart/2026-09-26-1030-data-source-binding.md]`.

### Slices 4–6 as built: the order (2026-09-26, `[X4, X5, X6, XD, XOV, R31]`)

xcube's slices 4, 5 and 6 are built, and one image carries all three: `ghcr.io/senthilkrajagopal/xcube:v1.7.45-ed08180c37@sha256:bc041aa208df0cd748b59fbfdbeca8684538f08c67f6020b0316d1efd1eb6fd8` (R31). Research: `xcube-slice-4.md`, `xcube-slice-5.md`, `xcube-slice-6.md` and `xcube-overlay-data-sources.md`, the last correcting the others where they differ. The tasks below are rewritten to the routes as built.

The user asked (2026-09-26) that connections and data sources, shown in folders, come first. So the order is:
1. **T420**: the image pin and the service credential. Every own-behalf call moves off the static admin token; user tokens stay as they are until T437.
2. **The data-source path:** T454 (the eight drivers and their target) → T335 (data sources as folder items, listed in Explore) → T441 (sealed in the browser) → T455 (the key-id check) → T442 (landed in xcube as connections) → T443 (the root's `default`, seeded by a Job) → T361, T362 (tests and their history) → T435 (binding at publish) → T365 (health) → T364 (the Data sources page) → T459 (the cubes using each, once xcube reports them).
3. **The rest of slice 4:** T437 (RS256 and the key push) → T436 (the folder gate) → T438 (Preview as) → T457 (AC-272 against xcube) → T458 (AC-327: no callbacks, shown).
4. **Workspaces and proposals** (F29, F30), with slice 5's overlays: T343 → T344 → T345 → T363 → T346 → T347 → T348 → T349 → T350 → T351 → T352 → T451 → T440 → T456, then T353–T359.

Every step leaves both suites working. The slice-4 image takes HS256 tokens until a model's first key push, and security stays off until T436 turns it on. The static admin token keeps working while it is set.

### Slice 4: permissions and tokens

- [x] T436 (AC-320, AC-263, AC-321) Push each folder's allowed groups, and security, to xcube, so Cube refuses what wechart refuses *(rewritten 2026-09-26 to slice 4 as built, `[X4]`)*
- [x] T437 (AC-326, AC-008) Sign every query token RS256, carrying only the groups some policy or folder names, and push the keys to xcube *(rewritten 2026-09-26 to slice 4 as built, `[X4]`)*
- [x] T438 (AC-166) Preview a dashboard as the chosen groups, with a token carrying exactly those *(header restored 2026-09-28: 6f46537 dropped the line and left its body under T437)*
- [x] T457 (AC-272) Show a chart's second cube bound through its source cube's bindings, and a save refused while xcube is unreachable, against xcube *(added 2026-09-26: T429 showed both against the stub xcube only)*
- [x] T458 (AC-327) Show that no request from Cube or xcube reaches wechart during a publish, a query, a refresh or a connection test *(added 2026-09-26, from T361's review: T431 and T442 are done, and AC-327's request-side Fails-when had no test)*
- [x] T459 (AC-157) Show beside each data source the cubes bound to it, from xcube's items *(added 2026-09-27, from T364: xcube binds a cube at publish and never rebinds it, so only xcube knows which cubes use a data source)*
- [x] T460 (AC-273) Send a model's publishes one at a time, each as its own changeset, so no publish sends the whole model over another in flight *(added 2026-09-27, from T343's full security run)*
- [x] T501 (AC-161, AC-328) Pin xcube `919cff8c6e`: a data source changed in place served from its new target at once, never its old cache or rollups; a cube's names kept while its data source is at the target it was first served with *(added 2026-09-28: the user's answer "No and No" of 2026-09-27, asked of xcube in `to-xcube/2026-09-27-0400-changed-in-place.md` and `2026-09-27-2330-sql-dry-run-403.md`, answered in `to-wechart/2026-09-28-0100-changed-in-place.md`; re-pinned from `bc18f82c01` for R38, `to-xcube/2026-09-28-0700-alias-only-after-a-change.md`)*

### Slice 5: previews

T347 (above) pushes workspace overlays, with the workspace's data sources.

- [x] T440 (AC-323) Let a proposal's overlay be queried only by its author, the target folder's read-write members and Super-Admins, and drop it once decided *(amended 2026-09-26 to slice 5 as built, `[X5]`)*
- [x] T456 (AC-321) Refuse an approval when any item would bind otherwise than ~~in the proposal's preview~~ when it was proposed *(added 2026-09-26, `[R31]`; amended 2026-10-01, `[R52]`)*

### Slice 6: connections

T333, T346, T361 and T365 (above) are rewritten for this slice, and T335, T362–T364 follow it. The order is at the head of slice 4.

- [x] T454 [P] (AC-160, AC-312) Define the eight drivers xcube takes, and each one's connection target, TLS included *(added 2026-09-26, `[XD, X6, R31]`; T360 defined six)*
- [x] T441 (AC-325, AC-298) Seal a typed secret in the browser to xcube's public key, and store only the ciphertext *(amended 2026-09-26: the golden vectors and the TLS target, `[X6]`)*
- [x] T455 (AC-324) Refuse to start when xcube holds no credential key with wechart's public key's id *(added 2026-09-26, `[X6]`)*
- [x] T442 (AC-161, AC-327, AC-330) Land each folder data source in xcube as a connection: driver, fields and ciphertext, never plaintext *(rewritten 2026-09-26 to slice 6 as built, `[X6]`)*
- [x] T435 (AC-273, AC-310, AC-328, AC-161) Bind a model's data sources at publish, nearest first from its folder, and give a cube with none the nearest `default` *(moved here from slice 3, 2026-09-26)*
- [x] T443 (AC-310) Seed the shared root's `default` data source at install with a post-install Job, and manage it like any other *(rewritten 2026-09-26, `[R31]`: ~~from the Helm values~~ a Job seals the password, so wechart never receives it)*
### Slice 8: hardening

- [ ] T444 (AC-307, AC-319) Hold a 10-chart dashboard's p95 under 3 s on two Cube instances, with one stopped mid-run
  - Files: `e2e/perf/ha-load.spec.ts`
  - Failing test: `ha-load.spec.ts`: 20 opens of the 10-chart dashboard of T409, across two Cube instances with one deleted mid-run, render every tile with p95 ≤ 3,000 ms (AC-307, AC-319).
  - Depends on: T409, T423

## P2.18 Applying the UI reviews of 2026-09-27 (`[R33]`)

The reviews are in `docs/design/reviews/2026-09-27/`: `phase-1-recheck.md` and `ui-review.md`, with designs 01–10.
- **The user's answers (R33):**
  - all ten phase-2 designs are approved, proposals included (AC-338 … AC-343);
  - phase 1 gets bugs and consistency only, and the editor and drawer are not rebuilt to phase-1 designs 01–02;
  - UI first.
- **The order:**
  1. the critical and major bugs (T463–T465);
  2. the data-source path (T471, T472, T462);
  3. roles and the workspace (T331, T348);
  4. the cross-screen patterns (T466–T470, T476–T478). *(2026-09-27, after T472: moved ahead of T462, T331 and T348, since the user asked after the phase-1 cleanup — a small decision, reported.)*
  5. the other phase-2 surfaces as their tasks come (T473–T475, and T357, T358, T367, T369, T371 with their designs);
  6. then T437 (RS256 keys, paused: `git stash list`, "T437 wip") and T347 (overlays).
- **Every UI task:**
  - is checked against its design with screenshots in Chrome, before its review;
  - names the design and state it matches;
  - for a phase-1 fix, names the finding id it closes (UX-0xx or UX-1xx), and for a phase-2 surface its design number and the UX-2xx findings.
- ~~**T437's migration** is set aside with the stash. When it resumes, it takes a timestamp later than any migration made meanwhile (node-pg-migrate refuses one out of order).~~ Resumed 2026-09-30 without a migration: xcube holds the key set's version (T437's as-built note).

### Bugs and consistency, phase 1 (R33: "Bugs and consistency only")

- [x] T463 (AC-126, AC-127) Never lead a dashboard-local chart's page to an editor that can't save
- [x] T464 (AC-201, AC-013) Keep a tile's title whole, moving its badges to the foot whenever the head can't hold both
- [x] T465 (AC-039) Colour a single series in the first palette colour and one category alike on every tile
- [x] T466 (AC-187) One page frame and one dialog pattern
- [x] T476 (AC-187) Control sizes by context, and the theme's own controls
- [x] T477 (AC-187) One date and time format, with the exact time in a tooltip
- [x] T478 (AC-187, AC-220) Members by title in the search palette and the query log
- [x] T467 (AC-036, AC-039, AC-042, AC-187) Fix the chart bugs the re-check found
- [x] T510 (AC-036, AC-187) Never draw a metric invisibly: per-metric small multiples, and "not drawn" on a metric a form can't draw *(split from T467, 2026-09-28: UX-057 with the user's answers)*
- [x] T516 (AC-036, AC-187) Offer the horizontal bar as the runner-up when most category labels would be hidden *(added 2026-09-28: UX-117's second half, from T467)*
- [x] T468 (AC-187) Edit mode: a new filter is selected with focus in its field picker, and edit heads show the element's kind
- [x] T469 (AC-149, AC-187) Jobs: a row click selects and never navigates, and the query log names members by title
- [x] T470 (AC-187, AC-344) The Model editor's tab strip fits its pane

### The Model workspace, to design 03 and designs 11–12, first (R34, AC-344)

*Added 2026-09-27 after the user asked for this, as a priority: "Cleanup the models page.. add models page and generate cube page".*

- **The references:**
  - phase-1 design 03 (`docs/design/reviews/2026-09-24/designs/03-model-workspace.html`), approved for the Model workspace by R34;
  - designs 11 (Generate cubes) and 12 (the overview), in `docs/design/reviews/2026-09-27/designs/`;
  - the critique of the running app, `docs/design/critiques/2026-09-27-model-workspace.md`, whose MW-ids each task names.
- **The critique's D-items**, decided here as small decisions within the approved design:
  - **D1:** the file path in the editor head is 13/600 mono, as design 03 draws it. It is the editor's head, not a workspace page title, so AC-231's 20/600 holds for the overview's "Model".
  - **D2:** Discard and Save are shown disabled at rest, as design 03 draws them.
  - **D3:** the Jinja note says nothing of xcube.
  - **D5:** badges and tags are 12 px, direction's floor, not the design's 11 px.
  - **D4, left as built:** Generate cubes still publishes. Adding the cubes as drafts instead is a proposal for the user.
- **Proposals, left for the user:**
  - MW-19: New view opening on Cubes with nothing filled in;
  - MW-13's line saying what an empty list is for.
- Each task's e2e grows `e2e/model-design.spec.ts`, measured at 1,440 × 900.

- [x] T479 (AC-222, AC-226, AC-344) The tree and the editor head as design 03 notes 1 and 2
- [x] T480 (AC-225, AC-344) Member rows that read like the YAML, opening into a short grouped form
- [x] T481 (AC-132, AC-344) General as design 03's state B: Basics, Refresh and Advanced
- [x] T482 (AC-134, AC-344) Say upfront what the form would drop, and show it in the YAML
- [x] T483 (AC-140, AC-344) A Jinja file in the editor's frame, read-only and saying so
- [x] T484 (AC-222, AC-344) New cube and New view as design 03's state C
- [x] T485 (AC-139, AC-249, AC-344) Generate cubes as design 11's docked pane
- [x] T486 (AC-131, AC-344) The Model overview as design 12's table
- [x] T487 (AC-187, AC-344) The editor below 1,280 px: Form | YAML

#### Designs 11 and 12's proposals, approved (R36)

- [x] T488 (AC-345, AC-346, AC-249) Generate cubes adds drafts, and a draft publishes with the drafts it joins
- [x] T489 [P] (AC-347) "In model" on Generate cubes' Tables step
- [x] T490 [P] (AC-348) Each data source's health on Generate cubes' Source step
- [x] T491 [P] (AC-349) Choose every table on the page from the table list's header
- [x] T492 (AC-350) With security on, Generate cubes says "in My workspace" and adds there; offered on a data source's page and its row's ⋯ *(amended 2026-10-02, `[R57]`)*
- [x] T493 (AC-351, AC-344) New view with no cube chosen for the user, opened on Cubes
- [x] T494 (AC-187, AC-344) The Model editor side by side with design 03: what still differed
- [x] T495 (AC-344) The tree as design 12: a locked Jinja tag, and its reading and empty states
- [x] T496 (AC-157, AC-343) The Data sources list and the narrow sheet as design 01 (2026-09-27) draws them

### Phase 2's surfaces, to their approved designs (AC-343)

- [x] T471 (AC-158, AC-159, AC-160, AC-282, AC-325, AC-339, AC-340, AC-343) Rebuild the new data source wizard as design 01's docked pane, with design 02's driver forms
- [x] T472 (AC-338) Mark each driver with its vendor's logo where its licence allows, else a monogram
- [x] T473 (AC-259, AC-260, AC-265, AC-267, AC-343) Redraw the Access panel as design 07
- [x] T474 (AC-165, AC-166, AC-295, AC-343) Security as design 08's three tabs, for Super-Admins only
- [x] T475 (AC-329, AC-342, AC-343) The cube picker as design 10: cubes on the item's path grouped by folder, and a hidden same-named cube dimmed
- [x] T630 (AC-166, AC-343) Preview as groups as design 08's state E draws it: the banner, and one list of what the groups reach *(added 2026-10-04, R63: "drawn as designed, since AC-343 binds the design")*
- *The designs of the phase-2 tasks already planned:*
  - T462: design 03 (a data source's settings);
  - T331: design 09, and design 04's shared-folder and read-only states (UX-230, UX-231, UX-237);
  - T348: design 04;
  - T358, T351, T356: design 05, with AC-341's changed and new tiles in the review view;
  - T357: design 06;
  - T367: design 10's bookmarks;
  - T369: design 08's Audit trail;
  - T371: design 10's Jobs and Schedules.
  Each adds AC-343 to its criteria and checks its surface against its design's states.

## P2.19 Found and asked for on 2026-09-28

- [x] T507 (AC-096) Mark a heatmap's cells and a scatter's points by the rows they draw, not by category index *(added 2026-09-28: found by T453's agent)*
- [x] T508 (AC-354, AC-355, AC-356, AC-357, AC-358, AC-359) Export a dashboard with the dependencies chosen, and import one into My workspace *(added 2026-09-28, R43)*
- [x] T509 (AC-353) Warn that switching a data source's sign-in to a key or token rebuilds its rollups *(added 2026-09-28, from T506's review)*
- [x] T511 (AC-354, AC-355, AC-360) Export a dashboard: the pane, its dependencies ticked with what uses each, the hidden count, and one JSON file without secrets
- [x] T512 (AC-359) Read an export file, and refuse one this wechart can't take, naming the part and why
- [x] T513 (AC-356, AC-357) Import into My workspace: File, Target and Review with its warnings, landing as new drafts
- [x] T514 (AC-358, AC-361) Import's data sources: map to an existing one, or create it in the workspace with its secrets and a passing test, under another name where the target has it
- [x] T515 (AC-289, AC-158) Restore a data source's version through a proposal, its connection tested first *(added 2026-09-28, from T354's review; design 06, state D)*

## P2.20 Deleting, clearing and finding (F39, added 2026-09-30, `[R48]`)

Every surface here follows design 14 (R48), drawn before the UI tasks start. The API halves of T517–T521 depend on nothing else.

*Design 14 approved 2026-09-30 (R49), with its proposals P1 (a folder row's second line shows its description, AC-369) and P2 (the kind in the address, AC-370). Its questions were answered:*
- *Q1: drafts don't hold back a chart's delete (AC-362).*
- *Q2: deleting a workspace item withdraws its open proposal (AC-372, T528).*
- *Q3: readers get no kind filter (AC-370).*
- *Q4: deletes are permanent, and every confirmation says "You can't undo this."*

- [x] T517 [P] (AC-362) Refuse deleting a library chart a dashboard uses, naming the dashboards it may name
- [x] T518 [P] (AC-363) Delete a dashboard with its own charts and its bookmarks
- [x] T519 [P] (AC-364) Refuse deleting a data source a cube is bound to, naming the cubes it may name
- [x] T520 (AC-365) Refuse deleting a cube, or its model file, while a view, a join, a chart or a dashboard depends on it
- [x] T526 (AC-364, AC-365) Delete a folder's data source, and a model file, from their pages, showing what refuses it *(added 2026-09-30, from T519 and T520's review)*
- [x] T527 (AC-371) Put a library chart from off a dashboard's folder path on it as a chart of the dashboard's own *(added 2026-09-30, `[R49]`: the user's "Copy on use" for AC-263)*
- [x] T537 (AC-371) Copy on move and at approval: no dashboard left showing a library chart off its folder's path *(added 2026-10-01, the user's answer on T527's review: "Copy on move + approval")*
- [x] T540 (AC-389) Recreate a deleted target folder when its proposal is approved *(added 2026-10-01, `[R52]`)*
- [x] T542 (AC-281, AC-323) Rebind a workspace item's stored names to the workspace's own cube in its previews *(added 2026-10-01, `[R53]`: "Rebind in the workspace")*
- [x] T543 (AC-283) Copy a model from a folder one may only read into My workspace, to use and never propose back *(added 2026-10-01, `[R53]`: "Yes, use-only copy")*
- [x] T544 (AC-390) Make the review's two side panels collapsible, and draw the review as design 05's main screen *(added 2026-10-01, `[R54]`)*
- [x] T546 (AC-141) List, at a workspace model's save, the shared charts and dashboards that landing it would change *(added 2026-10-02, `[R55]`)*
- [x] T541 (AC-388) Freeze a workspace item while it is in an open proposal *(added 2026-10-01, `[R52]`)*
- [x] T528 (AC-372) Withdraw an item's open proposal when the item is deleted from My workspace, naming it in the confirmation *(added 2026-09-30, `[R49]`, design 14's Q2)*
- [x] T529 (AC-008, AC-168) Rewrite the sample model's policy, and phase 1's two security tests, on groups *(added 2026-09-30, `[R49]`: xcube's tokens carry only groups)*
- [x] T521 (AC-366) Delete only an empty folder, and offer Delete only on one
- [x] T522 (AC-367) Clear My workspace, withdrawing its open proposals
- [x] T523 (AC-368) Put each "Edit in my workspace" into its own project folder
- [x] T524 (AC-369) Give folders a description, shown under the name in Explore, prefilled for a project folder
- [x] T525 (AC-370) Filter Explore's open folder by kind
- [x] T530 (AC-222) Point Schedules', Jobs', "Data as of"'s and search's model links at the file's own folder *(added 2026-10-01, from T342's report)*

## P2.21 The SQL runner (F40, added 2026-10-01, `[R50]`)

Read-only SQL on a data source's own connection, or on Cube Store, through xcube, which alone opens the credential. Asked of xcube in `~/Work/xcube-exchange/to-xcube/2026-10-01-0057-sql-runner.md`.

*xcube answered with `ghcr.io/senthilkrajagopal/xcube:v1.7.45-89628a0e88@sha256:155d204c…7a4d17` (`to-wechart/2026-10-01-1200-sql-runner-built.md`). It provides:*
- *`POST …/connections/{name}/sql`, with `?overlay=<id>` for a workspace's own data source, named `<folderId>__<name>`;*
- *`POST …/cubestore/sql`, SELECT and EXPLAIN only;*
- *`POST …/sql/cancel`, which reaches the instance running the run.*

*Things to know: many drivers return numbers as strings, every SQL Server number among them; column types are the database's own names, and null on Cube Store; a database's error can quote the SQL's values.*

*Design 15 was approved 2026-10-01 with P1–P5 and its answers (R51). AC-373, AC-374, AC-378 … AC-381, AC-383 … AC-385 were amended, and AC-386 and AC-387 added.*

- [x] T531 [P] (AC-374, AC-373) Switch the runner on and off, for a Super-Admin only, with the read-only confirmation recorded
- [x] T532 (AC-373, AC-375, AC-376, AC-377, AC-378, AC-383) Run SQL on a data source through xcube, for those who may
- [x] T533 (AC-379) One run at a time per user, and Cancel
- [x] T534 (AC-381, AC-382) Keep each user's run history, and audit every run with its SQL's literals replaced
- [x] T535 (AC-373, AC-377, AC-378, AC-379, AC-380, AC-381, AC-383, AC-385, AC-387) The SQL tab on a data source's page, as design 15 draws it
- [x] T539 (AC-386) A schema browser beside the SQL editor
- [x] T547 (AC-386) Browse a workspace data source not yet landed through its workspace's overlay *(added 2026-10-02, from T539's review)*
- [x] T536 (AC-384, AC-374) Cube Store: its switch, its listing, and read-only SQL on it
- [x] T545 (AC-378, AC-379) Show the rows that came back before a stop or a cancel, marked stopped *(added 2026-10-02, from T535's review)*
- [x] T548 (AC-378, AC-379) Cube Store's stop: as the user decides *(added 2026-10-04, from T545's review)*
- [x] T549 (AC-378, AC-379) Cube Store's work past its timeout: as the user decides *(added 2026-10-04, from T548)*
- [x] T538 (AC-354) Set export-import's hidden dependencies up as copy-on-use allows *(added 2026-10-01, from T527)*

## P2.23 Calculation requests on views (added 2026-10-04, `[R64]`)

- [x] T590 (AC-052) Resolve a request on a view when the taker's approved measure lands on a cube on the view's join paths

## P2.22 The model editor's pane, popped out (added 2026-10-02, `[R58]`)

- [x] T600 (AC-420) Pop the model editor's YAML and join diagram out into a larger dialog, and back into place

## Phase 2 — R71/R72: one name per item

*Added 2026-10-07, `[R71, R72]`. The spec amendment is commit `2889984`. xcube's side was asked in `to-xcube/2026-10-07-1900-global-names.md` and `to-xcube/2026-10-07-2100-global-names-choices.md`. xcube answered asks 2.1, 2.2 and 4.4 in `to-wechart/2026-10-07-2005-global-names-grammar-and-extends.md`, and is building R71 now.*

- **xcube's image.** wechart implements R71 only against xcube's R71 image (to be published).
  - T701 pins that image and writes its research doc.
  - Every task here that touches xcube depends on T701, directly or through another task.
  - Only T700, T706 and T725 touch nothing of xcube's, so only they are `[P]`.
- **R70's rebinding on move was never built.** No code carries it. Its only WIP, `6d5e6a5` on `group4-close-2`, is AC-353's half, which T725 takes up. So nothing has to be removed. T714 and T715 build the rule that replaces it: a move rebinds nothing, and a move that would strand a reference is refused.
- **Nearest-first resolution and the prefixes** go in T709 (the API), T710 (the web), T711 (charts' and dashboards' bindings), T716 (workspace previews, with `access/rebind.ts`) and T718 (the picker's hidden rows, AC-342 retired).
- **Done tasks' tests.** Some tasks here break a unit test of a done task, because the test assumed folder-scoped names, prefixes or nearest-first resolution. Each such task brings that test to the new rule in the same commit, so the full unit suite passes at every commit.
  - T727 … T733 then rework the rest of those done tasks' tests, area by area, their e2e specs included. Each re-demonstrates its ACs on the R71 image.

  | Done tasks | Reworked by |
  |---|---|
  | T276, T336, T485, T488 | T727 (names and Generate cubes) |
  | T341, T425, T450, T452, T460, T501 | T728 (publishing under own names) |
  | T428, T429, T457, T537 | T729 (bindings and moves) |
  | T435, T443, T497, T506 | T730 (data sources) |
  | T345, T347, T363, T471, T542, T543 | T731 (workspaces) |
  | T475, T633 | T732 (the cube picker) |
  | T513, T514 | T733 (imports) |

- **Open tasks.** T451, T508 and T509 each carry a note dated 2026-10-07 saying what R71/R72 changes for it.

### Fresh start (R71 9: no migration)

- [x] T700 [P] (AC-421, AC-426, AC-310) Seed data and shared test fixtures in which no two items share a name: bare names, in the grammar, and only the root's `default`

- [x] T701 (AC-421, AC-424) Pin xcube's R71 image (to be published), and read its new refusals

- [x] T702 (AC-328, AC-310, AC-421, AC-424) Fresh start: drop wechart's metadata and xcube's schema in every environment and seed them again under one name per item

### The API's name rules

- [x] T703 (AC-426) Accept a cube, view or data source name only in R72's grammar

- [x] T704 (AC-421, AC-422, AC-424, AC-321) Land each name only once in its namespace: an approval holding a name that has already landed, in any case, is refused before anything of it lands

- [x] T705 (AC-422, AC-424, AC-282, AC-270, AC-271) Check a draft's name when it is made, renamed and proposed: against every landed name and the workspace's other drafts, never another workspace's; an edit copy keeps its original's name

- [x] T706 [P] (AC-423, AC-291, AC-275) Keep a landed cube's, view's or data source's name: no rename through the API or an edit copy's proposal, while titles and drafts' names still change

- [x] T707 (AC-427) Let a deleted cube's, view's or data source's name be taken again

- [x] T708 (AC-310, AC-426) Hold `default` to the shared root

### Binding by name, and every reference on its referrer's path

- [x] T709 (AC-328) Publish and read every cube, view and data source under its own name: the API's `<folderId>__` prefixes and nearest-first lookups go

- [x] T710 (AC-329, AC-328) The web finds and shows each cube by its one name, with no prefix stripped and no nearest-first lookup

- [x] T711 (AC-272, AC-263) Bind a chart's and a dashboard's cubes by name, to the one cube or view of that name on the item's folder path

- [x] T712 (AC-273) Bind a model's data sources by name, to the one data source of that name on the model's path; a cube that extends another runs on its parent's

- [x] T713 (AC-425, AC-322, AC-321) Refuse a model whose join, `extends`, view or data source points off its folder's path, when it is proposed and when it is approved

- [x] T714 (AC-425, AC-272, AC-263, AC-371) Refuse a chart's, dashboard's or folder's move that would leave a chart or dashboard using a cube off its new path; a move rebinds nothing

- [x] T715 (AC-425, AC-291, AC-275, AC-322) Refuse a folder's, model's or data source's move that would leave a model referring off its path, as xcube refuses it

### Workspaces

- [x] T716 (AC-281, AC-323) Answer a workspace's previews from its own cube of a name, and otherwise from the landed cube of that name; stored names are no longer rebound

- [x] T717 (AC-283) A use-only copy is proposed to no folder: the API refuses it and the UI offers no Propose

- [x] T718 (AC-428, AC-329) List the user's workspace copy in the cube picker in place of the landed cube, marked as theirs

### Imports (with T508 and its model import in progress)

- [x] T719 (AC-358) Map an imported data source whose name has landed to that landed data source; create any other under its own name

- [x] T720 (AC-357, AC-356) Import a file's models: those of a landed name are mapped to the landed item, and the rest land as drafts in My workspace

- [x] T736 (AC-357) An import blocked by an off-path mapped item can leave out the charts that use it, and their tiles

- [x] T721 (AC-358) Bind an imported model's cubes to the data source chosen for, or mapped to, the file's one

### The UI

- [x] T722 (AC-423, AC-291) Offer no Rename for a landed cube, view or data source; its title stays editable, and a draft's name too

- [x] T723 (AC-424, AC-426, AC-422) Say a refused name in the UI as in use, never where, and refuse a name outside the grammar before it is sent

### Generate cubes

- [x] T724 (AC-249, AC-424) Refuse a generated cube whose name has landed in any folder, or is another draft's in the workspace, in any case, saying only that it is in use

- [x] T734 (AC-249) Generate cubes suggests a name in the grammar, editable before saving

- [x] T737 (AC-423) A draft's model file name follows its cube's name until it lands

- [x] T738 (AC-141, AC-329, AC-132, AC-344, AC-313, AC-356, AC-357) Fix the phase-1 and security e2e failures the naming work caused

- [x] T650 (AC-375, AC-378) Refuse a Cube Store join its router would run, before it runs, and say why

- [x] T740 (AC-336) Pin xcube 2e611eae61, which keeps an item's own rollup table names (R38), and show the move to items rebuilds nothing

- [x] T739 (AC-323, AC-422) Keep xcube's overlay of My workspace holding exactly its drafts when a workspace folder is deleted

### AC-353: R70's identity warning (with T509)

- [x] T725 [P] (AC-353) Warn before Save that any change moving a data source's connection identity rebuilds its pre-aggregations

### Refusals that never say where, across the API

- [x] T726 (AC-424) Every name-in-use refusal the API answers holds nothing of where the name is held

### Done tasks' tests, reworked by area

- [x] T727 (AC-249, AC-270, AC-271) Rework the tests of T276, T336, T485 and T488 to names held once across the system

- [x] T728 (AC-328, AC-271, AC-273, AC-161, AC-329) Rework the tests of T341, T425, T450, T452, T460 and T501 to items published under their own names

- [x] T729 (AC-272, AC-275, AC-371, AC-425) Rework the tests of T428, T429, T457 and T537 to bindings by name on the path

- [x] T730 (AC-273, AC-310, AC-161, AC-353) Rework the tests of T435, T443, T497 and T506 to data sources named once, with `default` at the root only

- [x] T731 (AC-281, AC-282, AC-283, AC-323, AC-280) Rework the tests of T345, T347, T363, T471, T542 and T543 to workspaces under one name per item

- [x] T732 (AC-329, AC-428) Rework the tests of T475 and T633 to a picker with no hidden cubes and the user's copy in place

- [x] T733 (AC-357, AC-358, AC-361) Rework the tests of T513 and T514 to imports that map landed names

## Phase 2 — group 3's verification passes (added 2026-10-08)

These tasks are what group 3's check of the open criteria found missing. Each is test-first.

- [x] T760 (AC-277) Offer no create or edit action to a user who is read-only everywhere: the chart page's Add to dashboard and its Edit chart, and the tile menu's Copy › To dashboard…

- [x] T761 (AC-291) A folder's rename needs read-write access to the folder holding it too

- [x] T763 (AC-279, AC-368, AC-283) Offer a dashboard's models in Edit in my workspace, unticked, and copy the ticked ones into the dashboard's project folder

- [x] T764 (AC-320) Show a folder's grant and its revocation reaching every Cube instance within 60 seconds, on docker-desktop's Cube pods

- [x] T765 (AC-330) Show an API's start bringing xcube's copy of a model up to date, folders, groups and data sources included, and Cube answering with every API process of it stopped

- [x] T762 (AC-429) List phase 1's bookmarks to Super-Admins with sign-in on

## P2.24 The MCP server and the SQL runner workspace (F41, F42, added 2026-10-17, `[R78]`)

*Numbered P2.24 because P2.19 is taken ("Found and asked for on 2026-09-28").*

F41 lets Claude Code read wechart, edit in its owner's My workspace and propose, through `/mcp` with personal access tokens. F42 moves the SQL runner into its own workspace at `/sql`. Designs 17 and 18 were approved on 2026-10-17 with their drawn defaults (`docs/design/reviews/2026-10-17/designs/index.md`, "Decided 2026-10-17"). Research: `mcp-typescript-sdk.md`, `mcp-deployment-and-tokens.md`, `fastify-rate-limit.md`, `gateway-api.md`, `sql-parameter-binding.md`, `code-editor.md`, `xcube-sql-runner.md` and `cube/data-apis.md` (`/v1/cubesql`).

**Two lanes,** each in its own worktree, touching disjoint files as far as possible:
- **Lane MCP:** `packages/api/src/mcp/`, the token repos and routes, `packages/web/src/account/`, Security's Access tokens tab, and `deploy/helm/`. Order: T767, T768, T769, T770, T771, T772, T773, T774, T775, T776, T777, T778, T779, T780, T781, T782, T783, T784, T785, T786, T787, T788, T789, T790, T791, then the Helm tasks T792, T793, T794, T795. T773 and T792 depend on nothing and can go first.
- **Lane SQL:** `packages/web/src/workspaces/sql/`, the SQL routes and repos in `packages/api/src/routes/sql-*.ts` and `packages/api/src/repos/sql-*.ts`, and the data source page's SQL tab. Order: T796, T797, T798, T799, T800, T801, T802, T803, T804, T805, T806, T807, T808, T809, T810, T812, T813, T814, T815, T816, T817, T818, T819, T820, T821, T823, T824, T825, T826; then, once their outside work lands, T811, T822 and T827.
- **Shared files** (expect cherry-pick conflicts there, nowhere else): `packages/api/src/server.ts` (both register routes; lane MCP also changes the global error handler), `packages/web/src/router/routes.tsx` (`/account/tokens` and `/security/tokens` against `/sql`), and `packages/api/src/audit/record.ts` (lane MCP's MCP mark against lane SQL's "Cube" mark).
- **Migrations,** above 1758660000000, numbered per lane so the two never clash: lane MCP from 1758670000000, lane SQL from 1758680000000.

**Waiting on outside work.** Three tasks carry a "Waits on" line and start only when it lands: T811 and T822 wait on xcube's image that takes bound values (`~/Work/xcube-exchange/to-xcube/2026-10-17-1900-sql-run-bound-parameters.md`), published and pinned by digest; T827 waits on `docs/research/keyboard-shortcuts-sql-runner.md` (design 17's Q3, "Research first"), and a conflict it finds goes back to the user before building. Every other task can start now.

**Open, for the coordinator** (none blocks a task's start): the token digest, SHA-256 or HMAC-SHA-256 with a Helm-made pepper (`mcp-deployment-and-tokens.md` §4 leaves it to the user; T767's test passes either way); and the proposals of designs 17 and 18 (17-P1 … P3, 18-P1, 18-P2), which "Approve with defaults" didn't name and no criterion holds, so no task builds them.

### Lane MCP: tokens

- [x] T767 [P] (AC-430, AC-468, AC-469, AC-442) Make a personal access token through the API: a name, the three scopes with read always in, 7, 30 or 90 days, its text shown once and kept only as a digest, and "Token made" in the audit trail

- [x] T768 (AC-431, AC-442) Revoke your own token through the API, keep a token that stops working under "No longer working" with its state, when and who revoked it, and Remove it from there; "Token revoked" in the audit trail

- [x] T769 (AC-430, AC-468, AC-469, AC-479) The Access tokens page at `/account/tokens`, from the account menu and the single-user chip, with its list and the New token dialog, as design 18 screens 1 and 2 draw them

- [x] T770 (AC-430) Show a new token's text once, with Copy and the filled-in Claude Code command, and ask before closing it uncopied, as design 18 screen 3 and state C draw it

- [x] T771 (AC-431) Revoke a token from the page, confirmed with no Undo, and list stopped tokens under "No longer working" with Remove, as design 18 states D and E draw them

- [x] T772 (AC-470) Security › Access tokens: every user's tokens for Super-Admins, with their owners, filters and Revoke, and to no one else, as design 18 screen 4 and state F draw it

### Lane MCP: the `/mcp` endpoint

- [x] T773 [P] (AC-474, AC-479) Trust the proxy named in `WECHART_TRUST_PROXY` in every security mode, and set it from the Helm values

- [x] T774 (AC-476) Serve `/mcp` only where an MCP host is configured, and say on the token pages that MCP isn't set up where none is

- [x] T775 (AC-436) Answer a request to `/mcp` with a foreign `Host` or a foreign `Origin` with 403, before its token is read

- [x] T776 (AC-435, AC-431, AC-430) Take a token only from `Authorization: Bearer` on `/mcp`: 401 with `WWW-Authenticate: Bearer` for none, a bad, revoked or expired one, the query string or the session cookie; refuse tokens on every other route; record Last used

- [x] T777 (AC-471, AC-432) Act on `/mcp` as the token's owner, with the groups of the owner's latest web sign-in

- [x] T778 (AC-434) Serve MCP at `/mcp` over Streamable HTTP at 2026-07-28, 2025-era clients through the stateless fallback, and GET and DELETE with 405

- [x] T779 (AC-472, AC-473) Limit each token's requests to `/mcp` in the metadata database, 60 a minute where unset, with 429 and `Retry-After` over it and 503 while the store fails; the error handler answers both

- [x] T780 (AC-474, AC-473) Limit requests to `/mcp` bearing a bad or missing token per IP address, 20 a minute where unset, IPv6 by its /64

- [x] T781 (AC-478, AC-442) Record every MCP tool call in the audit trail with who, the token's name, the tool, the outcome and when, and no argument values; mark every event caused through MCP with the token's name

### Lane MCP: the tools

- [x] T782 (AC-437, AC-432, AC-469) Read and explore through MCP: list folders and their items, and read a dashboard's, chart's, cube's, view's or data source's definition, as its owner may, with no credential ever

- [x] T783 (AC-443) Return user-written text and rows only in marked data fields, and keep the server's instructions and every tool's name and description fixed

- [x] T784 (AC-437, AC-475, AC-443) Query cubes and views through MCP as the owner, and page every tool's result past 1,000 rows or 50,000 characters with a cursor

- [x] T785 (AC-438, AC-433, AC-469, AC-432) Edit in my workspace through MCP: copy a shared dashboard, chart or model into its project folder in the owner's workspace; refuse with 403 `insufficient_scope` without workspace-edit

- [x] T786 (AC-438) Create, change and delete dashboards, charts, cubes and views in the owner's workspace through MCP, and nowhere else

- [x] T787 (AC-439, AC-442, AC-469) Propose, withdraw and list the owner's proposals through MCP, checked as the web app's are, and marked in the audit trail as through MCP

- [x] T788 (AC-477, AC-469) List jobs, builds and schedules through MCP, with Run now and Cancel where the owner may, and no schedule edits

- [x] T789 (AC-440, AC-441) Offer no tool that approves or rejects, or that touches data sources, a shared folder directly, the SQL runner, the audit trail or tokens

- [ ] T790 (AC-444) Connect Claude Code to `/mcp` with a token, list the token's tools and answer a read as its owner
  - Lane: MCP
  - Files: `e2e/mcp/claude-code.spec.ts`, `e2e/mcp/fixtures.ts`.
  - Failing test: `claude-code.spec.ts`, against the e2e stack with an MCP host: `claude mcp add --transport http wechart <url>/mcp --header "Authorization: Bearer <token>"` in a scratch config, then `claude mcp get wechart` reports it connected with the read tools, and a non-interactive `claude -p` limited to the folder-listing tool returns the owner's folders and none of another user's (AC-444).
  - Depends on: T780, T782

- [ ] T791 (AC-479) With sign-in off, make tokens and serve `/mcp` as the single user, with every F41 check still applying
  - Lane: MCP
  - Files: `packages/api/src/mcp/single-user.test.ts`, `e2e/access-tokens-single-user.spec.ts`.
  - Failing test: `single-user.test.ts`, sign-in off: a token the single user made lists and reads as that user; a request with no token, a bad one, a foreign `Host` or `Origin`, or past the token's or the address's limit is refused as with sign-in on (401, 403, 429) (AC-479).
  - Depends on: T769, T780, T782

### Lane MCP: the Helm chart (Gateway API, Envoy Gateway)

- [ ] T792 [P] (AC-476) Render the MCP host's HTTPRoute, routing only `/mcp` to the API Service, on the chart's own Gateway (mode A) or on a named one (mode B)
  - Lane: MCP
  - Files: `deploy/helm/wechart/templates/mcp-gateway.yaml`, `deploy/helm/wechart/values.yaml` (`mcp.host`, `mcp.tlsSecretName`, `mcp.gateway.create`, `mcp.gateway.className`, `mcp.gateway.parentRefs`), `packages/api/src/deploy/mcp-gateway.test.ts` (`helm template`, per `gateway-api.md`).
  - Failing test: `mcp-gateway.test.ts`: with `mcp.host` set and `mcp.gateway.create: true`, the render has a Gateway with one HTTPS listener for that host, terminating TLS with the named Secret, and an HTTPRoute on it with one rule, `Exact` `/mcp`, to the API Service; with `create: false` and `parentRefs`, it has no Gateway and the HTTPRoute's `parentRefs` are exactly those; in both, no other path or host is routed (AC-476).
  - Depends on: none

- [ ] T793 (AC-476, AC-474) Let in only the listed source addresses with an Envoy Gateway SecurityPolicy, Anthropic's range a value off by default, and pass the client's address to the API
  - Lane: MCP
  - Files: `deploy/helm/wechart/templates/mcp-gateway.yaml`, `deploy/helm/wechart/values.yaml` (`mcp.allowedSourceRanges`, `mcp.allowAnthropicEgress: false`, documented with `160.79.104.0/21`, and `mcp.clientIPDetection`), `packages/api/src/deploy/mcp-gateway.test.ts`.
  - Failing test: `mcp-gateway.test.ts`: the render has a SecurityPolicy on the HTTPRoute with `defaultAction: Deny` and one Allow rule whose `clientCIDRs` are exactly `mcp.allowedSourceRanges`; `160.79.104.0/21` appears only with `allowAnthropicEgress: true`; in mode A a ClientTrafficPolicy on the Gateway sets the client-IP detection from the values (AC-476, AC-474); the values file documents each.
  - Depends on: T792, T773

- [ ] T794 (AC-476) Give the MCP route 130 s timeouts, tell the API its host, answer `/mcp` on the web app's host with 404, and render nothing for MCP when no host is named
  - Lane: MCP
  - Files: `deploy/helm/wechart/templates/mcp-gateway.yaml`, `deploy/helm/wechart/templates/api.yaml`, `deploy/helm/wechart/templates/web-config.yaml`, `packages/api/src/deploy/mcp-gateway.test.ts`.
  - Failing test: `mcp-gateway.test.ts`: the HTTPRoute rule's `timeouts.request` and `backendRequest` are 130 s, past Envoy's 15 s default (`gateway-api.md`, finding 4); with a host, the API container has `WECHART_MCP_HOST`; the web nginx config has `location = /mcp { return 404; }`; with no `mcp.host`, the render has no Gateway, HTTPRoute or policy and the API no `WECHART_MCP_HOST` (AC-476).
  - Depends on: T792, T774

- [ ] T795 (AC-476, AC-474) Deploy the MCP host on docker-desktop through Envoy Gateway v1.9.2, with the patched Envoy image, and check it end to end
  - Lane: MCP
  - Files: `deploy/helm/values/docker-desktop-mcp.yaml`, `deploy/README.md` (installing the Gateway API v1.6.3 CRDs and Envoy Gateway's own, with `distroless-v1.39.3`, per `gateway-api.md` "Install"), `e2e/mcp/gateway.spec.ts`.
  - Failing test: `gateway.spec.ts`, against the k8s deploy: `curl --resolve <host>:443:127.0.0.1 https://<host>/mcp` with a token lists tools over TLS; with the observed address taken off the allow-list, the same request answers 403 and reaches no API log; `/`, `/mcp/` and `/.well-known/oauth-protected-resource` on the MCP host answer 404; `/mcp` on the web app's host answers 404; plain HTTP isn't served; the API logs the client's address, not Envoy's (AC-476, AC-474).
  - Depends on: T793, T794, T780

### Lane SQL: the workspace

- [x] T796 [P] (AC-001, AC-446) SQL runner in the switcher after Schedules, for Super-Admins and read-write members, opening the workspace at `/sql`, and Not found to anyone else

- [x] T797 (AC-386, AC-381, AC-304) The workspace's three panes: the picker and schema browser on the left, the tabs over the results in the centre, Saved and History on the right, folding to rails below 1,024 px, as design 17 screen 1 and state O draw them

- [x] T798 (AC-447, AC-373, AC-383, AC-384) The data source picker: the sources the user may run SQL on, grouped by folder path, My workspace's first, Cube Store at the root while on, each with its driver and the runner's state; an off source only to those who may turn it on or see it off, opening the off panel

- [x] T799 (AC-466) A first visit: one tab, "Query 1", no data source, focus on the picker, and the sentences for no source and for none available, as design 17 state H draws them

- [x] T800 (AC-450) Editor tabs, each bound to one data source: "+", the tab's ⋯ with Rename…, Duplicate, Close and Close other tabs, a changed source keeping the SQL and clearing the result, the state in the tooltip and accessible name, and asking before closing unsaved text

- [x] T801 (AC-451, AC-446) Keep open tabs in this browser only, for the signed-in user, restore them on reload, and name the open tab in the address

- [x] T802 (AC-373, AC-385, AC-380) Run a tab's SQL on its data source from the workspace, under the run line and the warning naming that tab's source and login, with the result grid and CSV

- [x] T803 (AC-387) Run the selection, or with none the statement at the cursor, bounded by semicolons outside strings and comments

- [x] T804 (AC-452, AC-379) Show a run's state the same way on its tab, in its result head and in History; hold Run on every other tab with "Go to it · Cancel that run"; keep a run going while the user is away

- [x] T805 (AC-386) The schema browser in the left pane: the tab's source's schemas, tables and columns with their types, read as they're opened, putting a chosen name into the editor

- [x] T806 (AC-448) Find a table over the names read, saying so while pages are unread, and PK and FK tags, the FK's target in its tooltip

- [x] T807 (AC-449) A table's ⋯: Insert name, Insert SELECT with a 100-row limit in the driver's syntax, and Preview 100 rows as an ordinary run in a new tab; opening a node sends only catalog reads

- [x] T808 (AC-456) Autocomplete the tab's source's schemas, tables and columns as the user types: ↑ ↓ choose, Enter accepts, Esc closes the list only, Tab still leaves the editor

### Lane SQL: parameters

- [x] T809 (AC-453) List each `{{ name }}` outside strings and comments once, in a strip under the editor, typed Text, Number, Date or Boolean, and hold Run until each has a value

- [x] T810 (AC-482) Hold Run on Dremio and on Cube Store while the SQL holds a parameter, saying parameters aren't available on that source

- [x] T811 (AC-454) Send each parameter's value bound through xcube, keep `{{name}}` without values in the audit, and keep the values in History and saved queries for their owner alone

### Lane SQL: saved queries

- [x] T812 (AC-457, AC-483) Save… a query, with its name and description rules, keeping its SQL, data source and parameters; Save updates it, Save as new… makes another; no proposal and no audit event

- [x] T813 (AC-458) The Saved tab: the owner's saved queries by name with their source and "Only me", Open, Rename…, Duplicate and Delete with Undo; nobody else, a Super-Admin included, reaches one

- [x] T814 (AC-459) Open a saved query whose data source the user can no longer run SQL on with no source chosen, never naming it

- [x] T815 (AC-460) List the user's own saved queries in ⌘K, labelled "Saved query", and no one else's

- [x] T816 (AC-455) ⌘/Ctrl+S saves the open tab's query in the workspace, and ⌘/Ctrl+F opens the editor's own find

### Lane SQL: History

- [ ] T817 (AC-381, AC-452) History in the right pane: all of the user's runs by default, "This data source" to narrow, and a row whose source is no longer available reading so
  - Lane: SQL
  - Also (added by T804): each row shows its state as `runState.ts` names it, the icon and label its tab and result head use. The e2e then checks one run's state in all three places, and ticks AC-452, which T804 left open for want of History.
  - Files: `packages/api/src/routes/sql-runner.ts` (+ `sql-runner-history.test.ts`), `packages/web/src/workspaces/sql/HistoryList.tsx` (+ test), `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `sql-runner-history.test.ts`: `GET /api/sql-runs` with no source lists all the user's runs across sources, newest first, 50 at a time; a run on a source the user can no longer run SQL on comes back with neither its source nor its folder. `HistoryList.test.tsx`: History starts on All; each row has its SQL, source and folder, time, outcome and row count; "This data source" narrows to the open tab's; the unavailable row reads "A data source no longer available to you" (AC-381, as amended 2026-10-17).
  - Depends on: T797, T802

- [ ] T818 (AC-465) Choosing a History row puts its SQL into the current tab with Undo when the sources match, or into a new tab on the row's source, and never runs it
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/HistoryList.tsx` (+ test), `packages/web/src/workspaces/sql/tabs.ts` (+ test).
  - Failing test: `HistoryList.test.tsx`: a row of the open tab's source replaces the tab's text, and Undo brings the old text back; a row of another source opens a new tab on it and leaves the current tab's text; a row of an unavailable source opens a tab with no source; no choice sends a run (AC-465). Also, moved from T811 (decision T811-1): choosing a row with parameters puts its values back into the tab with its SQL, from the `parameters` each run in `GET /api/sql-runs` carries since T811 (AC-465's values).
  - Depends on: T817, T800

### Lane SQL: Make a cube and Make a chart

- [ ] T819 (AC-461) Offer Make a cube… and Make a chart… on a finished or limited SELECT on a data source to someone who may make a model, and disabled with the reason elsewhere
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/makeFrom.ts` (+ test), `packages/web/src/workspaces/sql/ResultHead.tsx` (+ test).
  - Failing test: `makeFrom.test.ts`: both are enabled for a Finished or Limited SELECT on a data source by someone who may make a model (AC-350); disabled with "isn't data to model" on an EXPLAIN, "holds rollups Cube builds; model the source instead" on Cube Store, "Run it to the end first" on a stopped or cancelled run, and "Two columns are named `a`: give each its own name with AS, and run it again" for repeated names (AC-461).
  - Depends on: T802

- [ ] T820 (AC-462) The Make a cube pane: a checked name, the folder starting at the source's own writable one, the source fixed, the SQL that ran read-only, numeric columns as `sum` measures and the rest as typed dimensions, one key, and a draft with `count` in My workspace
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/MakeCubePane.tsx` (+ test), `packages/web/src/workspaces/sql/columnKinds.ts` (+ test), `packages/api/src/routes/workspace-models.ts` (+ test, if the draft's route needs the SQL cube), `e2e/security/sql-make-cube.spec.ts`.
  - Failing test: `columnKinds.test.ts`: `numeric`, `integer`, `bigint`, `double precision` and SQL Server's numbers start as `sum` measures, except the chosen key; `text`, `varchar` start as string dimensions, `date` and `timestamp` as time, `boolean` as boolean. `MakeCubePane.test.tsx`: headed "Make a cube from this query · in My workspace"; the suggested name in the grammar, a taken or ungrammatical one refused as AC-422 checks; the folder starts at the source's folder when the user may write there, else empty; the SQL shown is what ran (only the selection when a selection ran). The e2e: Add to My workspace adds an unpublished draft cube with a `count` measure to the workspace model and nothing to any folder (AC-462).
  - Depends on: T819

- [ ] T821 (AC-463) Make a chart: save the cube as Make a cube does, then open the chart editor on a new chart in My workspace over it, nothing placed, with "← Back to SQL runner"
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/MakeCubePane.tsx` (+ test), `packages/web/src/editor/ChartEditor.tsx` (the back link only), `e2e/security/sql-make-cube.spec.ts`.
  - Failing test: the e2e: Make a chart… then Add and make a chart opens the chart editor on a new chart in My workspace whose target folder is the cube's, with the new cube chosen in the field tree, no field placed, and "← Back to SQL runner" returning to the same tab (AC-463).
  - Depends on: T820

- [ ] T822 (AC-462) Write a run's parameter values into Make a cube's SQL as literals, in the driver's own escaping, and say so in the pane
  - Lane: SQL
  - Waits on: xcube's image that takes bound values (as T811), since only then does a run with parameters finish.
  - Files: `packages/web/src/workspaces/sql/literalSql.ts` (+ test), `packages/web/src/workspaces/sql/MakeCubePane.tsx` (+ test).
  - Failing test: `literalSql.test.ts`: Text `O'Brien` becomes `'O''Brien'` on PostgreSQL and `'O\'Brien'` on MySQL, a Number its decimal, a Date its dialect's date literal, a Boolean `TRUE`/`FALSE` or `1`/`0` by driver. `MakeCubePane.test.tsx`: after a run with `{{c}}`, the pane's SQL holds the literal in its place and says the run's values are written in; it otherwise equals what ran (AC-462).
  - Depends on: T820, T811

### Lane SQL: the data source page, lost access and the "Cube" group

- [ ] T823 (AC-464, AC-373) The data source page's "SQL runner" tab holds the off panel or the switch's record, with Turn off and who may run, plus "Open in SQL runner", and no editor; "Open in SQL runner" in the page head's ⋯ and in each row's ⋯
  - Lane: SQL
  - Files: `packages/web/src/workspaces/data-sources/SqlRunner.tsx` (+ test; the editor removed), `packages/web/src/workspaces/data-sources/SourceEditor.tsx`, `packages/web/src/workspaces/data-sources/DataSourcesList.tsx` (+ test), `packages/web/src/workspaces/explore/FolderContents.tsx` (+ test), `e2e/security/sql-runner.spec.ts`.
  - Failing test: `SqlRunner.test.tsx`: the tab, renamed "SQL runner", shows the off panel when off, and when on the switch's record (who confirmed it and when), Turn off for a Super-Admin and who may run, plus "Open in SQL runner", and no editor; it is shown only to those AC-373 names. The e2e: "Open in SQL runner" from the tab, the page head's ⋯, a Data sources row's ⋯ and an Explore row's ⋯ each opens `/sql` on a new tab on that same source (AC-464, AC-373).
  - Depends on: T801

- [ ] T824 (AC-466, AC-373) A tab whose source is switched off, or whose folder access is lost, can't run, saying so without naming the source again
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/QueryTab.tsx` (+ test), `e2e/security/sql-workspace.spec.ts`.
  - Failing test: the e2e: with a tab open on a source, a Super-Admin turns its runner off and the tab's Run says "The SQL runner was turned off for ‹source›" and can't start; with the member's group removed from the folder, Run says the source "isn't available to you" without naming it again; the API refuses a run in both (AC-466, AC-373).
  - Depends on: T802

- [ ] T825 (AC-467) The "Cube" group: run a tab's SQL through Cube's `/v1/cubesql` as the user, say so on the run line in place of the warning, and list the cubes and views the user may query in the left pane
  - Lane: SQL
  - Files: `packages/api/src/routes/sql-cube.ts` (+ test; per `sql-parameter-binding.md` "The Cube group" and `cube/data-apis.md` §6, the user's own query token, NDJSON read line by line), `packages/api/src/server.ts`, `packages/web/src/workspaces/sql/SourcePicker.tsx`, `packages/web/src/workspaces/sql/CubeTree.tsx` (+ test), `packages/web/src/workspaces/sql/RunLine.tsx`, `e2e/security/sql-cube-group.spec.ts`.
  - Failing test: `sql-cube.test.ts`: a run posts to `/v1/cubesql` with the user's own token, never the service credential; rows a folder grant or an access policy hides from that user's chart don't come back; a cube the user may not query answers as Cube refuses it; a final `error` line is a failure. The e2e: the picker's one "Cubes and views you may query" entry (design 17's Q2) opens a tab whose run line says it runs through Cube, as the user, with no AC-385 warning; the left pane lists only the cubes and views the user may query, with their members (AC-467).
  - Depends on: T798, T802, T805

- [ ] T826 (AC-481, AC-482) The "Cube" group for everyone who may open the workspace, with no switch, R50's caps, audited as "Cube" and listed in History, no Make a cube… or Make a chart…, and Run held for a parameter
  - Lane: SQL
  - Files: `packages/api/src/routes/sql-cube.ts` (+ test), `packages/api/src/repos/sql-runs.ts` (+ test), `packages/api/src/audit/record.ts`, `packages/web/src/workspaces/sql/makeFrom.ts` (+ test), `packages/web/src/workspaces/sql/ParameterStrip.tsx` (+ test).
  - Failing test: `sql-cube.test.ts`: a read-write member gets the group with no switch; a run is cut at 10,000 rows and stopped at 30 seconds by aborting the request; it leaves an audit event marked "Cube" with the SQL's literals replaced, and a History row (AC-481); a run holding `{{x}}` is refused before Cube is called (AC-482). `makeFrom.test.ts`: on a Cube result both are disabled, saying the rows already come from cubes (AC-481). `ParameterStrip.test.tsx`: Run is held on a Cube tab with a parameter, saying why (AC-482).
  - Depends on: T825, T809, T817, T819

- [ ] T827 (AC-480) Ctrl+Q opens a tab on the current source, with Control on macOS too, in the workspace only; tabs are chosen with the tab bar; no key closes a tab
  - Lane: SQL
  - ~~Waits on: `docs/research/keyboard-shortcuts-sql-runner.md`~~ Settled 2026-10-17: the research (e32d86e5) found Ctrl+Alt+[ and ] unreachable on many Windows layouts and taken by VoiceOver; the user chose "Drop it; tab bar only (Recommended)". Match Ctrl+Q on `event.key`, falling back to `code === 'KeyQ'` for non-Latin layouts, Control without Alt, Meta or Shift (the research's sketch).
  - Files: `packages/web/src/workspaces/sql/tabKeys.ts` (+ test), `packages/web/src/workspaces/sql/SqlWorkspace.tsx`, `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `tabKeys.test.ts`: in the workspace, Ctrl+Q opens a tab on the current source, on a macOS platform with Control and not ⌘; Ctrl+Alt+[ and ] select no tab; no key closes a tab. The e2e: outside the workspace none of these keys does anything new (AC-480).
  - Depends on: T800

## P2.25 The compact dashboard header (F43, added 2026-10-17, `[R79]`)

F43 folds the dashboard's header into one 48 px row by default, with the description, the ownership line and the filter bar in a sheet the Filters toggle slides down, pushing the tiles. Design 19 was approved on 2026-10-17 with its drawn defaults (`docs/design/reviews/2026-10-17/designs/index.md`, "Decided 2026-10-17, design 19"); its tokens are direction.md §7g and its rules 109–114. No new package: the motion is CSS, and `inert`, `prefers-reduced-motion` and the disclosure pattern are sourced in `docs/design/references-compact-header.md` §2.

**Where it's built.** The header is `packages/web/src/dashboard/edit/EditChrome.tsx` (its `header`, `band` and `description`/`subtitle` props); `packages/web/src/dashboard/DashboardView.tsx` passes it `headerActions`, `band` (with `PageTabsRow` and the `FilterBar`) and the live regions; the bar is `packages/web/src/filters/FilterBar.tsx`; the CSS is `packages/web/src/shell/styles.ts`. New parts go in `packages/web/src/dashboard/header/`. Order: T828, T829, T830, T831, T832, T833, T834, T835, T836, T837, T838, T839, T840, T841, T842, T843, T844. `shell/styles.ts` is shared with lane SQL (P2.24); expect cherry-pick conflicts there only.

**The tests that reach the filter bar** open the sheet first from T828 on, through one helper each for unit tests and e2e. Opening it is the user's own step now (AC-490); no assertion is dropped or weakened.

- [x] T828 [P] (AC-196, AC-486, AC-487, AC-490) Move the description, the ownership line and the filter bar into a header sheet, closed whenever a dashboard opens, opened and closed by a Filters disclosure toggle with `aria-expanded` and `aria-controls`, and hidden from focus and assistive technology while closed

- [x] T829 (AC-484, AC-196, AC-496) The compact row: one 48 px row fixed above the tiles holding the way back, the title, the page tabs, the actions as today and the Filters toggle last

- [x] T830 (AC-485, AC-195) The way back "← ‹folder›" naming the whole path, and the title at `text-lg`, cut short with its tooltip and shown whole at the top of the open sheet only when cut

- [x] T831 (AC-486) The toggle's count of filters set, its name and description, "Filters, none set", and "Details" on a dashboard with no filters

- [x] T832 (AC-487) The open sheet pushes the tiles down, covers none of them, keeps the canvas's scroll position, and grows as its pills wrap

- [x] T833 (AC-488) Open the sheet by its height over 200 ms decelerating and close it over 150 ms accelerating, its contents inert while it moves, and with no animation under reduced motion

- [x] T834 (AC-489, AC-119) Close the sheet with its toggle or with Escape in the header, innermost first and ahead of the dashboard's own Escape, focus to the toggle; a click on the tiles leaves it open

- [x] T835 (AC-490) Keep the sheet open or closed for the visit only, across page tabs, a bookmark applied and a refresh, storing it nowhere

- [x] T836 (AC-491, AC-206, AC-056) In edit mode, show the sheet open with no toggle, "Editing ‹name›" and "+ Page tab" in the row, page tabs scrolling with no "More ▾", and the reader's state back when editing ends

- [x] T837 (AC-492) In view mode, put the page tabs that don't fit behind "More ▾", the open page always inline, the strip never scrolling

- [x] T838 (AC-200, AC-119, AC-098) While the sheet is closed, show compact marking chips, at most two then "+n", or the first cross-filter's compact chip then "+n", each with its menu and ×, the source tile in its tooltip, accessible name and menu heading

- [x] T839 (AC-493) Highlight the toggle's count for 2 s when its number changes while the sheet is closed, under reduced motion too

- [x] T840 (AC-493) Announce each change made while the sheet is closed exactly once, politely, with the new number, and leave the sheet closed

- [x] T841 (AC-494) From 1,024 to 1,279 px, keep one 48 px row, History and Bookmarks as icon buttons named in their accessible names and tooltips

- [ ] T842 (AC-495, AC-304) Below 1,024 px, keep the way back, the title, the toggle and ⋯ in the row, History and Bookmarks… in ⋯, a "Page: ‹name› ▾" menu on a 40 px row for more than one page, and the sheet's pills one under another
  - Files: `packages/web/src/dashboard/header/PageMenu.tsx` (+ test; through `shell/MenuButton.tsx`), `packages/web/src/dashboard/DashboardView.tsx` (`headerActions` and ⋯ through `useNarrowWindow`), `packages/web/src/filters/FilterBar.tsx` (stacked pills when narrow), `packages/web/src/shell/styles.ts`, `e2e/dashboard-header.spec.ts`.
  - Failing test: `PageMenu.test.tsx`: with two pages, "Page: Overview ▾" lists both with Overview checked, and choosing the other opens it; with one page there's no menu. The e2e at 390 and 900 px: the row holds the way back, the `h1` at 16 px, the toggle and ⋯, and ⋯ holds History and Bookmarks…; the page row is 40 px tall; the open sheet's pills share one left edge; at 390 px the document doesn't scroll sideways (AC-495, AC-304).
  - Depends on: T829, T831

- [ ] T843 (AC-496) Measure the chrome with sign-in on: at most 96 px closed, 128 px in My workspace and 205 px open, at 1,440 × 900 and 1,280 × 720
  - Files: `e2e/security/dashboard-header.spec.ts`.
  - Failing test: `dashboard-header.spec.ts`, signed in as a read-write member, on a shared dashboard with a one-line description, its ownership line, three page tabs and a filter set: at 1,440 × 900 and 1,280 × 720 the canvas's top edge (`[data-testid="canvas-scroll"]`) is at most 96 px below the viewport's top with the sheet closed and at most 205 px with it open (one row of pills); its copy in My workspace, under the band, at most 128 px (AC-496). It fails today at 274 px; T829 and T832 make it pass, and it holds the case with the ownership line that single-user mode doesn't show.
  - Depends on: T832, T838

- [ ] T844 (AC-352, AC-343, AC-187) Check the dashboard's header, page tabs and filter band against design 19 and direction.md §7g in the conformance spec
  - Files: `e2e/design-conformance.spec.ts`, `packages/web/src/shell/styles.ts` (only where a value differs).
  - Failing test: `design-conformance.spec.ts`: the compact row (48 px, padded 0 24, `border-subtle` rule), the title (20/26/600), the page tabs (13/600, 2 px `accent` underline), the toggle (32 px, radius 6) and its count pill (18 px, 12/600), a compact chip (24 px, radius 999, 12 px, 1.5 px border) and the sheet's description (`text-sm`, at most 860 px) and ownership line (12/16) each measure as §7g's table gives them, and design 04's crumbs row and separate tab row are gone (AC-352, AC-343, AC-187).
  - Depends on: T830, T831, T832, T838, T841, T842

## P2.26 Combo charts, the Text tile, dashboard parameters and AI summaries (F44–F48, added 2026-10-18, `[R80]`)

F44 gives combo charts per-series marks and axes, two aligned value axes, one split dimension, reference lines and bands, and the amended AC-218 warning. F45 replaces the Markdown tile with the Text tile, edited in place with Tiptap 3 and read through its static renderer. F46 adds filter controls, action buttons and field-switch dashboard parameters. F47 drafts AI summaries from facts computed through Cube, and F48 is Security › AI. Designs 20–22 were approved on 2026-10-18 (`docs/design/reviews/2026-10-18/designs/index.md`, "Decided 2026-10-18"); their tokens are direction.md §7h and rules 115–146.

**Packages,** each covered by its research doc and pinned exactly: `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/static-renderer` and `@tiptap/suggestion` at 3.32.0, all identical, `@tiptap/pm` resolving `prosemirror-view` ≥ 1.42.3 (`rich-tiles-and-combo-tech.md`); `@anthropic-ai/sdk@0.135.0`, `openai@7.38.0`, `@anthropic-ai/bedrock-sdk@0.35.0` and `zod@4.6.5` as a direct dependency of `@wechart/api` (`llm-providers.md`, `supporting-utilities.md`). Not `@tiptap/markdown` (beta), `echarts-stat` or `d3-shape`: wechart converts its own markdown subset and draws its own SVG.

**Two lanes,** each in its own worktree, touching disjoint files as far as possible. Foundations come first in each.
- **Lane COMBO:** `packages/core/src/combo.ts`, `render-spec.ts` and `undrawn.ts`; `packages/charts/`; `packages/recommender/`; the chart editor's combo parts in `packages/web/src/editor/`; `e2e/combo.spec.ts`. Order: T845, T846, T847, T848, T849, T850, T851, T852, T853, T854, T855, T856, T857, T858, T859, T860, T861, T862, T863, T864, T865, T866, T867. T845 depends on nothing.
- **Lane TEXT:** `packages/core/src/text-document*.ts` and the dashboard parameter model; `packages/web/src/tiles/text/`, the dashboard's model, edit sidebar, settings, bookmarks and filters; `packages/api/src/ai/`, the AI routes and repos, `packages/api/src/mcp/tools/`; `packages/web/src/workspaces/security/ai/`; `deploy/helm/`. Order: T868, T869, T870, T871, T872, T873, T874, T875, T876, T877, T878, T879, T880, T881, T882, T883, T884, T885, T886, T887, T888, T889, T891, T892, T893, T894, T895, T896, T897, T898, T899, T900, T890; the AI service T901, T902, T903, T904, T906, T907, T908, T909, T913; the AI pages T916, T917, T918, T919, T920, T921, T922, T924, T925, T926; then, once their questions are answered, T910, T911, T912, T914, T923, T927, T928, T929, T930, T931, T932, T933, and T905 and T915. T868, T895 and T901 depend on nothing and can go first.
- **Shared files** (expect cherry-pick conflicts there only): `packages/web/src/editor/Wells.tsx` (lane COMBO's pill menu, Split by well and offers; lane TEXT's Parameters group, T898); `packages/core/src/index.ts`; `packages/web/src/shell/styles.ts`; `packages/web/src/dashboard/DashboardView.tsx` (lane COMBO's tile edit-head warning, T861; lane TEXT's Text tile).
- **Migrations,** lane TEXT only, from 1758700000000.
- **Tests never call a provider.** Unit tests point each client at an in-process fake provider (`packages/api/src/ai/fake.ts`, after `packages/api/src/xcube/fake.ts`); the e2e stack runs the same fake over HTTPS with a test certificate the API trusts through `NODE_EXTRA_CA_CERTS`, set up as Azure OpenAI at the fake's address (`llm-providers.md` § Testing).

**Waiting on answers** (`docs/requirements.md` §P2.8, R80): T910 waits on R80-1 (the period a change compares); T912 on R80-2 (the day and month limits count in); T911 on R80-3 (a draft call's timeout and size caps; its test holds for any values, which come from config); T915 on R80-5 (starting without the key-encryption key) and R80-6; T905 on R80-6 (a research addendum to `llm-providers.md` for the Bedrock client's options). The draft route's dependants wait with it: T914, T923, T927 … T933. T901's test holds without R80-5's answer. Every other task can start now.

### Lane COMBO: the spec and the drawing

- [ ] T845 [P] (AC-497, AC-498, AC-037) Carry each combo series' mark and axis in the chart spec, and resolve Auto: the first measure as bars, the rest as lines, all on the left
  - Files: `packages/core/src/combo.ts` (+ test), `packages/core/src/render-spec.ts` (the sparse `options.series` and `options.combo` shapes), `packages/core/src/chart-spec.ts`, `packages/core/src/index.ts`.
  - Failing test: `combo.test.ts`: a combo of Revenue, Target and Margin % with no settings resolves to bar/left, line/left, line/left; with Margin % set to point/right it resolves so, and keeps that when Orders is added before it, Target removed or the measures reordered; `comboProblems` refuses a stored fifth mark or a third axis; a spec saved and parsed again keeps every setting (AC-497, AC-498, AC-037).
  - Depends on: none

- [ ] T846 (AC-497, AC-037) Draw each combo series with its own mark on its own value axis, in §7h's draw order, a line over bars on its surface halo
  - Files: `packages/charts/src/series/combo.ts` (+ test), `packages/charts/src/theme.ts`, `packages/charts/src/optionFor.ts`.
  - Failing test: `combo.test.ts`: Revenue bar/left, Target line/left, Margin % point/right and Cost area/left give ECharts series of type bar, line, scatter, and line with `areaStyle` at 0.24 opacity; Margin %'s `yAxisIndex` is 1 and the others' 0; `z` orders area < bar < line < point; a line has a 5 px `bg-surface` halo under its 2 px stroke; a point has an 8 px marker with a 1.5 px surface ring (AC-497, AC-037).
  - Depends on: T845

- [ ] T847 (AC-499) Align a combo's two value axes: one zero height, the right axis's ticks on the left's gridlines, include zero forced while bars are drawn, and no right gridlines
  - Files: `packages/charts/src/combo/alignedAxes.ts` (+ test), `packages/charts/src/series/combo.ts`.
  - Failing test: `alignedAxes.test.ts`: left data −38K…155K and right −4 %…38 % give extents with the same negative share and five ticks each; with bars on either axis both ranges include zero; lines only with the right axis's include zero off keeps 20 %…40 %; the right axis's `splitLine.show` is false; over 500 random pairs whose ranges include zero, zero's fraction of each axis agrees within 1e-9 and the tick counts are equal (wechart's own algorithm: `alignTicks` doesn't align zero, research §2) (AC-499).
  - Depends on: T846

- [ ] T848 (AC-500) Title each value axis above itself with its measures' glyphs and its unit, keep ticks `text-secondary`, give legend entries their glyphs and "(right)", and emphasise a hovered series' axis
  - Files: `packages/charts/src/combo/axisTitles.ts` (+ test), `packages/charts/src/legend.ts` (+ test), `packages/charts/src/series/combo.ts`, `packages/charts/src/interaction/axisEmphasis.ts` (+ test).
  - Failing test: `axisTitles.test.ts`: the left axis's name is rich text with a bar glyph (8 × 8, radius 2) and a line glyph (12 × 2), each in its series' colour, then "Revenue · Target ($)", `nameRotate` 0, at the axis's top; tick labels take `text-secondary` in light and dark; `legend.test.ts`: Margin % on the right reads "Margin % (right)" with the point glyph; `axisEmphasis.test.ts`: hovering Margin % puts the right axis's name and labels in `text-primary` and the left axis's series at opacity 0.28 (AC-500).
  - Depends on: T846

- [ ] T849 (AC-501) Synchronize a combo's two axes into one scale, labelled on both sides, only while both share a format
  - Files: `packages/core/src/combo.ts` (`canSynchronize`), `packages/charts/src/combo/alignedAxes.ts`, their tests.
  - Failing test: `combo.test.ts`: `canSynchronize` holds for $ and $, and for $ and % fails with "Revenue is in $ and Margin % in %"; `alignedAxes.test.ts`: synchronized, both axes have the same min, max and interval, and the right axis's fixed min and max are dropped (AC-501).
  - Depends on: T847

- [ ] T850 (AC-502) Give both axes one scale type, refuse log scale while bars are drawn, and count the values at or below zero a log axis leaves out
  - Files: `packages/core/src/combo.ts` (`logScaleState`), `packages/charts/src/series/combo.ts`, their tests.
  - Failing test: `combo.test.ts`: log on the left with two axes drawn makes the right log too; with a bar series, `logScaleState` is unavailable, "Log scale · unavailable: Revenue draws bars, which need a zero baseline"; the charts' `combo.test.ts`: Orders 0, 0, 0 and 12 on a log axis draws one point and reports 3 values not drawn (AC-502).
  - Depends on: T847

- [ ] T851 (AC-503) Stack a combo's bars, and its areas, for the whole chart and per axis, never across axes
  - Files: `packages/core/src/combo.ts` (the stacking options), `packages/charts/src/series/combo.ts`, their tests.
  - Failing test: `combo.test.ts`: Stacked bars give the left's bar series `stack` "0:bars" and the right's "1:bars"; Overlap areas give no `stack` and Stacked areas "‹axis›:areas"; a combo with no area series offers no area stacking (AC-503).
  - Depends on: T846

- [ ] T852 (AC-504) Split a combo by one dimension across every measure: a series per measure × member, coloured by member, on its measure's axis, one mark per measure
  - Files: `packages/core/src/render-spec.ts` (`seriesOf` for a split combo; + test), `packages/core/src/combo.ts` (`markTakenBy`), `packages/charts/src/series/combo.ts`, `packages/charts/src/colorAssignment.ts` (+ test).
  - Failing test: `render-spec.test.ts`: Revenue and Margin % split by 4 regions give 8 series, Revenue's on the left and Margin %'s on the right, a measure's bars grouped in member order; `colorAssignment.test.ts`: EMEA takes in the combo the colour it takes in a bar chart on the same dashboard; `combo.test.ts`: with Revenue on bars, `markTakenBy('bar')` names Revenue while split and nothing unsplit; a second split dimension replaces the first (AC-504).
  - Depends on: T845

- [ ] T853 (AC-505) Hold a combo to 8 series: fold members to the top k + Other unless the author chose, then leave whole measures out, last added first
  - Files: `packages/core/src/combo.ts` (`comboLimit`), `packages/core/src/undrawn.ts` ("over 8 series"; + test), `packages/core/src/topN.ts`.
  - Failing test: `combo.test.ts`: 2 measures × 21 countries fold to top 3 + Other (8 series); 3 measures × 4 regions with nothing chosen fold to top 1 + Other (6); the same with "All" chosen draws 2 measures × 4 and leaves the third, last added, "not drawn · over 8 series"; 5 measures × 4 regions with nothing chosen draw 4 measures × (top 1 + Other); 9 unsplit measures draw 8; a hidden member and a member with no data each count (AC-505).
  - Depends on: T852

- [ ] T854 (AC-506) Inside a combo, offer "Draw on a right axis" first for a measure on another scale, putting it there
  - Files: `packages/core/src/undrawn.ts` (the offers per chart type; + test), `packages/web/src/editor/Wells.tsx` (the offers row), `packages/web/src/editor/Wells.test.tsx`.
  - Failing test: `undrawn.test.ts`: a combo of Revenue and Margin %, both on Auto, gives Margin % "not drawn · on another scale" with offers right axis, small multiples, table in that order; a line chart of the same gives small multiples and table only; `Wells.test.tsx`: pressing "Draw on a right axis" sets Margin %'s axis to right and its pill to its R tag (AC-506).
  - Depends on: T845

- [ ] T855 (AC-497, AC-498, AC-504, AC-219) Customize › Series: a 28 px row per series with its Mark and Axis radio groups and Back to Auto, grouped by measure while split
  - Files: `packages/web/src/editor/combo/SeriesRows.tsx` (+ test), `packages/web/src/editor/CustomizeTab.tsx`.
  - Failing test: `SeriesRows.test.tsx`: three rows with radio groups named "Revenue mark" and "Revenue axis", four mark buttons named Bar, Line, Area and Point in their tooltips and accessible names; ← and → move along a group; choosing Point and Right for Margin % updates the spec and shows "Back to Auto for Margin %: line, left", which restores it; split by Region, rows group under each measure with member rows of swatch, name and visibility; Margin %'s Bar is disabled with "Revenue draws bars. While the chart is split by Region, each measure needs its own mark." (AC-497, AC-498, AC-504, AC-219).
  - Depends on: T845, T852

- [ ] T856 (AC-497) The Metrics pill's menu: Draw as and Axis as `menuitemradio` groups, Back to Auto, Format… and Remove; the pill's mark glyph and L or R tag
  - Files: `packages/web/src/editor/Wells.tsx`, `packages/web/src/editor/combo/PillMarkMenu.tsx` (+ test).
  - Failing test: `PillMarkMenu.test.tsx`: Margin %'s menu holds Draw as (Bar, Line, Area, Point) and Axis (Left, Right) as `menuitemradio` with the current ones checked, then Back to Auto, Format… and Remove; choosing Right puts an R tag before ×, and Customize › Series shows Right; Esc returns focus to the pill (AC-497).
  - Depends on: T855

- [ ] T857 (AC-497, AC-500) In the chart editor only, make each legend entry's glyph a 20 px button opening the pill's menu
  - Files: `packages/web/src/editor/combo/LegendGlyphButtons.tsx` (+ test), `packages/web/src/editor/PreviewFrame.tsx`, `e2e/combo.spec.ts`.
  - Failing test: `LegendGlyphButtons.test.tsx`: in the editor's preview each entry has a button named "Revenue target: line, left axis. Change mark or axis" opening the same menu; the e2e: on a dashboard, in view and edit mode, a combo tile's legend has no such button (AC-497, AC-500).
  - Depends on: T856, T848

- [ ] T858 (AC-219, AC-499, AC-501, AC-502) Customize › Axes: the Left and Right axis groups, include zero locked with its reason, Synchronize with its toast, log scale on both, and the canvas line
  - Files: `packages/web/src/editor/AxisPanel.tsx` (+ test), `packages/web/src/editor/combo/SynchronizeSwitch.tsx` (+ test), `packages/web/src/editor/PreviewFrame.tsx`.
  - Failing test: `AxisPanel.test.tsx`: with every series on the left there's no Right group and no Synchronize; with Margin % on the right, the Right group lists "Margin % · %" and has no gridlines field; with a bar series, include zero reads "Include zero · on, because Revenue draws bars" and can't be switched; Log on one axis announces "Log scale on for both axes" and shows on both; `SynchronizeSwitch.test.tsx`: disabled for $ and % with the reason, and for $ and $ turning it on clears the right's fixed max with "Right axis now follows the left axis · Undo", which restores it; the canvas line reads "3 series on 2 value axes, aligned at zero", then "3 series on 2 axes, synchronized" (AC-219, AC-499, AC-501, AC-502).
  - Depends on: T849, T850, T855

- [ ] T859 (AC-503) The stacking rows, Bars side by side or stacked, and Areas overlap or stacked while an area is drawn
  - Files: `packages/web/src/editor/combo/StackingRows.tsx` (+ test), `packages/web/src/editor/CustomizeTab.tsx`.
  - Failing test: `StackingRows.test.tsx`: Bars offers Side by side and Stacked; Areas shows only once Cost is drawn as an area; choosing Stacked sets the spec's stacking for every bar series (AC-503).
  - Depends on: T851, T855

- [ ] T860 (AC-504, AC-505) The combo's Split by well, its count against 8, "‹dimension› shown", and "not drawn · over 8 series" with its offers
  - Files: `packages/web/src/editor/Wells.tsx`, `packages/web/src/editor/combo/SplitCount.tsx` (+ test), `packages/web/src/editor/Wells.test.tsx`.
  - Failing test: `Wells.test.tsx`: a combo's Data tab has a Split by well taking one dimension, a second replacing the first; `SplitCount.test.tsx`: "2 measures × 4 regions = 8 of 8 series"; adding Orders with "Regions shown" at All gives its pill "not drawn · over 8 series" and the row "Orders isn't drawn…" with Small multiples by Region, Table and Remove Orders; with nothing chosen the well reads "top 1 + Other of 4" (AC-504, AC-505).
  - Depends on: T853, T855

- [ ] T861 (AC-218) Warn the author only while a combo draws two unsynchronized axes, in Customize › Axes, on the type card and in the tile's edit-mode head, with its variants and offers, and never a viewer
  - Files: `packages/recommender/src/warnings.ts` (+ test), `packages/web/src/editor/combo/ComboWarning.tsx` (+ test), `packages/web/src/editor/ChartTypeCard.tsx`, `packages/web/src/tiles/ChartTile.tsx` (the edit head), `e2e/combo.spec.ts`.
  - Failing test: `warnings.test.ts`: a combo on one axis, or two synchronized, gives no warning; two unsynchronized axes in $ and % give "Two scales: Revenue ($) and Margin % (%) can be made to look related." with One axis, Synchronize (disabled, with the reason), Small multiples and Table; $ and $ give the stronger wording with Synchronize first; lines with the right axis off zero add "The right axis doesn't start at zero."; a pie of 7 slices still warns; `ComboWarning.test.tsx`: One axis puts every series on the left; the e2e: the tile's edit head shows ⚠ opening the editor at Axes, and in view mode no part of the warning shows (AC-218).
  - Depends on: T849, T858

- [ ] T862 (AC-507) Reference lines and bands: the list and its form in Customize, horizontal or vertical, fixed or computed from a drawn series, with Edit, Duplicate and Delete with Undo
  - Files: `packages/core/src/combo.ts` (the references' shape and `referenceProblems`), `packages/web/src/editor/combo/ReferenceList.tsx` (+ test), `packages/web/src/editor/combo/ReferenceForm.tsx` (+ test).
  - Failing test: `ReferenceForm.test.tsx`: a horizontal line on the right axis offers Fixed, Average, Median, Minimum and Maximum of a drawn series; a vertical line on a month axis takes a month; a band with From $120K and To $90K keeps Add disabled with "A band's From must be below its To"; an empty label keeps Add disabled; `ReferenceList.test.tsx`: each row shows its icon, label, value and axis; Delete shows an Undo toast that restores it; `combo.test.ts`: an average on a split chart is one line per measure over every member (AC-507).
  - Depends on: T855

- [ ] T863 (AC-508) Draw reference lines and bands with their styles and order, label them in the chart, move a colliding label, and leave out one outside its axis's range
  - Files: `packages/charts/src/combo/references.ts` (+ test), `packages/charts/src/series/combo.ts`.
  - Failing test: `references.test.ts`: a fixed line is a `markLine` of width 1.5, dash [5, 4], in `text-secondary`; one from Margin %'s average is dashed in Margin %'s colour; a band is a `markArea` in `bg-subtle` with no border, below every series; labels are `text-xs` `text-primary` on a 3 px surface halo and not in the legend; two lines 2 px apart get their labels at opposite ends, then 16 px inward; a line at $500K on a $0–$160K axis isn't drawn and its row reads "Outside the axis range" (AC-508).
  - Depends on: T862, T847

- [ ] T864 (AC-509) Name each series' mark, axis and unit, and each reference line, in the text alternative and the table view
  - Files: `packages/charts/src/combo/describe.ts` (+ test), `packages/web/src/tiles/DataTable.tsx` (+ test), `packages/web/src/tiles/ChartCanvas.tsx`.
  - Failing test: `describe.test.ts`: the split example reads "Combo, by quarter, split by Region. Revenue: bars, left axis, dollars. Margin %: line, right axis, percent. Axes aligned at zero. 8 series." and adds "Monthly plan: line at $100K, left axis"; `DataTable.test.tsx`: a split combo's table has two header rows, the first "Revenue · bars, left · $" (AC-509).
  - Depends on: T852, T863

- [ ] T865 (AC-510) Keep the recommendation as it is when the author draws a second axis, and say so in "Why this recommendation?"
  - Files: `packages/recommender/src/explain.ts` (+ test), `packages/web/src/editor/WhyThisChart.tsx`.
  - Failing test: `explain.test.ts`: for time × 2 measures on different scales, a combo with Margin % on the right gives the same recommendation and runners-up as one without, and the one-value-axis rule reads "You drew a second axis by hand; the recommender never does" (AC-510).
  - Depends on: T845

- [ ] T866 (AC-511) Below 1,024 px, keep axis titles above their axes, compact ticks, thinned category labels, a wrapped legend and reference labels without values
  - Files: `packages/charts/src/series/combo.ts`, `packages/charts/src/combo/references.ts`, `e2e/combo.spec.ts`.
  - Failing test: the e2e at 390 px: a combo tile's axis titles sit above their axes; no two category labels' boxes overlap; the reference label reads "Monthly plan" alone and its tooltip "$100K"; the document doesn't scroll sideways (AC-511).
  - Depends on: T848, T863

- [ ] T867 (AC-037, AC-497, AC-499) A combo of three measures on two axes, made in the editor, saved, reopened and drawn the same on its dashboard
  - Files: `e2e/combo.spec.ts`.
  - Failing test: `combo.spec.ts`: in the chart editor, a combo of Revenue (bars), Revenue target (points) and Margin % (line, right) saves; reopened, Customize › Series shows the same; on the dashboard the tile's two zero lines are within 1 px of each other and the right axis's ticks fall on the left's gridlines (AC-037, AC-497, AC-499).
  - Depends on: T858, T861

### Lane TEXT: the document

- [ ] T868 [P] (AC-513, AC-518) The Text tile's stored document: wechart's own schema and version, with its nodes, marks and attributes, link checks and element count
  - Files: `packages/core/src/text-document.ts` (+ test), `packages/core/src/index.ts`.
  - Failing test: `text-document.test.ts`: a document of paragraphs, three heading levels, a Large value, bold, italic, both lists, a link to `https://` and one to a wechart dashboard, and one element of each kind passes `textDocumentProblems`; it refuses an unknown node, an unknown mark, an attribute not declared (`onclick`, `style`, `class`), a `javascript:`, `data:` or `vbscript:` link, and 11 elements, each named; `elementsOf` counts live elements, controls and buttons (AC-513, AC-518).
  - Depends on: none

- [ ] T869 (AC-512, AC-116) Convert wechart's markdown subset and its `{{…}}` tokens into a Text document, an HTML tag kept as literal text
  - Files: `packages/core/src/text-document-from-markdown.ts` (+ test), `packages/core/src/text-tokens.ts`.
  - Failing test: `text-document-from-markdown.test.ts`: every case in `packages/web/src/tiles/Markdown.test.tsx` gives a document whose text, heading levels, lists, links and line breaks match; `{{measure:orders.revenue | marking:Marking}}` becomes a Value limited by Marking; `<b>hi</b>` stays the literal text "<b>hi</b>"; the result passes `textDocumentProblems` (AC-512, AC-116).
  - Depends on: T868

- [ ] T870 (AC-527) Write a Text document back as markdown, each element as a `{{…}}` token naming its kind and source
  - Files: `packages/core/src/text-document-to-markdown.ts` (+ test).
  - Failing test: `text-document-to-markdown.test.ts`: a document of every block, mark and element kind writes markdown whose tokens name each element's kind and source (`{{change:orders.revenue | vs:previous_period}}`, `{{filter-control:country}}`, `{{button:Go to Detail}}`), and converting that markdown back (T869) gives the same text and the same elements for the kinds markdown tiles had (AC-527).
  - Depends on: T869

- [ ] T871 (AC-513, AC-518) Refuse with 400, naming the tile, a dashboard save holding a Text tile that fails the schema or holds more than 10 elements
  - Files: `packages/api/src/repos/documents.ts`, `packages/api/src/routes/text-tiles.test.ts`.
  - Failing test: `text-tiles.test.ts`: saving a dashboard whose Text tile holds `{"type":"image","attrs":{"src":"x","onerror":"alert(1)"}}`, a `javascript:` link or 11 elements answers 400 naming the tile, and nothing is stored; a valid document saves; a tile still in markdown saves and is read back unchanged (AC-513, AC-518).
  - Depends on: T868

- [ ] T872 (AC-512) Bind at publish, and rename on copy, the members a Text tile's elements name
  - Files: `packages/api/src/model/bind.ts`, `packages/core/src/text-document.ts` (`textDocumentMembers`, `textDocumentRenamed`), `packages/api/src/routes/text-tile-binding.test.ts`.
  - Failing test: `text-tile-binding.test.ts`: publishing a dashboard whose only reference to `orders` is a Text tile's Value binds `orders`, and one naming a cube off its path is refused naming it, as for a token (AC-272); a copy into My workspace renames the element's member as it renamed tokens (AC-512).
  - Depends on: T869

### Lane TEXT: reading and editing

- [ ] T873 (AC-208, AC-513) Read mode: render a Text tile through Tiptap's JSON static renderer into React elements, with wechart's own link check
  - Files: `packages/web/package.json` (the `@tiptap/*` packages at 3.32.0), `packages/web/src/tiles/text/TextTile.tsx` (+ test), `packages/web/src/tiles/text/readMapping.tsx`, `packages/web/src/tiles/text/SafeLink.tsx` (+ test).
  - Failing test: `TextTile.test.tsx`: headings render as `h3`, `h4` and `h5` at `text-xl`, `text-lg` and `text-md`, Large value at 32/40 tabular, lists as `ul` and `ol`, bold as `strong`; no element under the tile has `innerHTML` set from data (a document holding the text "<b>x</b>" renders that text); `SafeLink.test.tsx`: `javascript:alert(1)` renders as plain text with no `href`, `https://` and a dashboard link as links (AC-208, AC-513).
  - Depends on: T868

- [ ] T874 (AC-058) The `text` tile kind, and the Text element in Add in place of Markdown, inserting an empty Text tile
  - Files: `packages/web/src/dashboard/model/document.ts` (+ test), `packages/web/src/dashboard/edit/AddPanel.tsx`, `packages/web/src/dashboard/edit/templates.ts` (+ test), `packages/web/src/dashboard/model/insert.ts`, `packages/web/src/dashboard/edit/Outline.tsx`.
  - Failing test: `templates.test.ts`: Add's elements are chart, chart from folders, section, tab group, text, header, divider, image, link and filter, with no markdown; inserting Text after the selection adds a `text` tile with an empty document; `document.test.ts`: `TILE_KINDS` holds `text` and a new dashboard's tiles are never `markdown` (AC-058).
  - Depends on: T873

- [ ] T875 (AC-512) A markdown tile shown as a Text tile, converted on open, and stored as a document on the next save
  - Files: `packages/web/src/dashboard/model/document.ts`, `packages/web/src/dashboard/model/stored.ts` (+ test), `packages/web/src/dashboard/DashboardView.tsx`, `packages/web/src/tiles/Markdown.tsx` (removed with its test, whose cases move to T869's), `e2e/text-tile.spec.ts`.
  - Failing test: `stored.test.ts`: a stored `markdown` tile reads as a `text` tile whose document equals T869's conversion; saving writes `kind: "text"` and the document; the e2e: a seeded markdown tile with "## Marked share" and two tokens shows the same heading, text and values before and after a save, and the saved body holds no markdown (AC-512).
  - Depends on: T869, T874

- [ ] T876 (AC-302) Edit a Text tile in place on the canvas: double-click, or "Edit text on the canvas" by keyboard; Esc, Tab or a click outside leaves; one Undo takes the whole edit
  - Files: `packages/web/src/tiles/text/TextEditor.tsx` (+ test; loaded with `React.lazy`), `packages/web/src/tiles/text/editorExtensions.ts`, `packages/web/src/dashboard/edit/TileProperties.tsx` (the first control; no markdown textarea), `packages/web/src/dashboard/edit/EditChrome.tsx`, `e2e/text-tile.spec.ts`.
  - Failing test: `TextEditor.test.tsx`: the editor is a `textbox` with `aria-multiline="true"` named after the tile; Esc leaves it with the tile selected and focused, Tab moves to the next control; the e2e: Enter on a focused Text tile then Enter on "Edit text on the canvas" puts focus at the text's end with a 2 px `accent` border; typing then clicking outside and pressing the edit bar's Undo once restores the old text whole; Properties has no textarea (AC-302).
  - Depends on: T875

- [ ] T877 (AC-514) Keep the editor's code out of view mode: no editor chunk until a Text tile is first edited
  - Files: `packages/web/vite.config.ts` (the editor chunk's name), `e2e/text-tile.spec.ts`.
  - Failing test: `text-tile.spec.ts`: opening a dashboard with two Text tiles in view mode requests no script whose name holds the editor chunk's; double-clicking a tile in edit mode then requests it (AC-514).
  - Depends on: T876

- [ ] T878 (AC-515) The toolbar: block style in §3's sizes, bold, italic, both lists, link, Insert and the element count, and nothing for colour, font or size
  - Files: `packages/web/src/tiles/text/TextToolbar.tsx` (+ test).
  - Failing test: `TextToolbar.test.tsx`: a `toolbar` with one Tab stop and ← → along it, holding in order the block-style menu button, Bold, Italic, Bulleted list, Numbered list, Link, Insert and "3 / 10 elements"; the block-style menu lists Paragraph, Heading small, Heading medium, Heading large and Large value, each in its own size; choosing Heading medium makes the line an `h4` at 20 px (AC-515).
  - Depends on: T876

- [ ] T879 (AC-516) Convert markdown patterns as typed, undone by the next Undo, and let only ⌘B, ⌘I and ⌘Z act inside the text
  - Files: `packages/web/src/tiles/text/editorExtensions.ts` (the input rules and the keymap), `packages/web/src/tiles/text/keys.test.ts`.
  - Failing test: `keys.test.ts`: `## ` makes Heading medium, `- ` a bulleted list, `1. ` a numbered list, `**a**` bold, `*a*` italic, `[a](https://x.example)` a link, each reversed by the next ⌘Z; ⌘B and ⌘I toggle bold and italic and ⌘Z undoes typing; ⌘U, ⌘E, ⇧⌘X, ⌘⌥1 and ⇧⌘Z change nothing; with focus outside the text, ⌘B does nothing (AC-516).
  - Depends on: T876

- [ ] T880 (AC-513) Strip what the schema doesn't allow from pasted content, and refuse unsafe links, in the editor
  - Files: `packages/web/src/tiles/text/editorExtensions.ts` (`transformPastedHTML`, the Link mark's `isAllowedUri`), `e2e/text-tile.spec.ts`.
  - Failing test: `text-tile.spec.ts`: pasting `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><iframe src="https://x.example"></iframe><a href="javascript:window.__xss=3">a</a>` leaves `window.__xss` undefined in edit mode and after saving and reloading in view mode; the tile's DOM holds no `img`, `script`, `iframe`, `on…` attribute or `javascript:` address; the text "a" remains (AC-513).
  - Depends on: T876, T871

- [ ] T881 (AC-517) The insert menu, opened by `/`, `{{` or Insert: a combobox of kinds in three groups, then measures by cube
  - Files: `packages/web/src/tiles/text/InsertMenu.tsx` (+ test; on `@tiptap/suggestion`), `packages/web/src/tiles/text/editorExtensions.ts`.
  - Failing test: `InsertMenu.test.tsx`: `/` at a line's start, after a space, `{{` and Insert each open a 320 px listbox with Live values (8 kinds), Controls (3) and Copilot groups in that order, focus staying in the text with `aria-activedescendant`; typing "marg" lists Margin % under Orders; Enter on it inserts a Value of it; → on it lists Value, Change, Sparkline, Icon, Bullet graph and As of; Esc closes it and leaves "{{marg" as text; `/` inside a word opens nothing (AC-517).
  - Depends on: T878

- [ ] T882 (AC-519) Live elements as atoms in edit mode, controls inert, and the Elements list in Properties
  - Files: `packages/web/src/tiles/text/nodes/*.ts` (one node per kind, inline atoms with `ReactNodeViewRenderer`), `packages/web/src/tiles/text/ElementsList.tsx` (+ test), `packages/web/src/tiles/text/elementName.ts` (+ test).
  - Failing test: `ElementsList.test.tsx`: elements listed in text order with kind and source and "3 of 10"; choosing a row selects that element and opens its settings; `elementName.test.ts`: "Change, Revenue against previous quarter"; a node test: → steps over an element as one character and selects it; Backspace after it removes it whole; a filter control in edit mode ignores a click's change (AC-519).
  - Depends on: T881

- [ ] T883 (AC-518) Hold a Text tile to 10 elements in the editor: the count, the disabled menu and Insert with the reason, and a refused paste
  - Files: `packages/web/src/tiles/text/elementLimit.ts` (+ test), `packages/web/src/tiles/text/InsertMenu.tsx`, `packages/web/src/tiles/text/TextToolbar.tsx`.
  - Failing test: `elementLimit.test.ts`: at 10 elements Insert and every menu row are disabled with "This tile holds 10 elements, the most a Text tile can. Remove one, or add another Text tile."; pasting text holding 2 elements into a tile of 9 is refused with that reason and changes nothing; a filter control and a button count (AC-518).
  - Depends on: T882

- [ ] T884 (AC-520, AC-116) The Value and Change elements: their settings, model formats, marking limits, own filters, and Change's triangle, sign and direction colour
  - Files: `packages/web/src/tiles/text/elements/ValueElement.tsx` (+ test), `packages/web/src/tiles/text/elements/ChangeElement.tsx` (+ test), `packages/web/src/tiles/text/elementQueries.ts` (+ test).
  - Failing test: `ValueElement.test.tsx`: Revenue in its model's currency format; limited by Marking, over the marked rows, and with nothing marked all data, or "—" when chosen; its own filter added to the tile's in the query; `ChangeElement.test.tsx`: +4.2 % with Higher is better reads "▲ 4.2%" in `status-success`, −2.1 % "▼ 2.1%" in `status-error`, Neutral in `text-secondary`; as an amount "▲ $50K" (AC-520, AC-116).
  - Depends on: T882

- [ ] T885 (AC-521) Sparkline and Bullet graph as wechart's own SVG, word-sized, each an image with its text alternative
  - Files: `packages/web/src/tiles/text/elements/Sparkline.tsx` (+ test), `packages/web/src/tiles/text/elements/BulletGraph.tsx` (+ test).
  - Failing test: `Sparkline.test.tsx`: a 64 × 16 `svg` with `role="img"`, one `path` of stroke width 2 in Revenue's dashboard colour, no axis, a last-point circle only when chosen, and the label "Revenue by month, last 12 months: from $1.0M to $1.27M, low $0.95M, high $1.3M"; `BulletGraph.test.tsx`: 96 × 16, a 4 px value bar and a 2 px target in `text-primary`, three range rects in `bg-subtle`, `border-subtle` and `border-strong`, a fourth range refused, and its label naming value, target and ranges (AC-521).
  - Depends on: T884

- [ ] T886 (AC-522, AC-116) The Icon, Marking, Filter value and As of elements
  - Files: `packages/web/src/tiles/text/elements/IconElement.tsx` (+ test), `packages/web/src/tiles/text/elements/MarkingElement.tsx`, `packages/web/src/tiles/text/elements/FilterValueElement.tsx` (+ test), `packages/web/src/tiles/text/elements/AsOfElement.tsx` (+ test).
  - Failing test: `IconElement.test.tsx`: rules ≥ 100 % On track, ≥ 90 % Watch, otherwise Behind show the first match's icon and word; with no data, "No rule matched" with a neutral ring; `FilterValueElement.test.tsx`: Country set to Germany and France reads "Germany, France", unset "all countries"; `AsOfElement.test.tsx`: "as of 14:05" with a tooltip naming a pre-aggregation; a Marking element shows its count (AC-522, AC-116).
  - Depends on: T884

- [ ] T887 (AC-523) A Text tile as a cross-filter target only, Filter or None, and its elements of one cube in one Cube request
  - Files: `packages/web/src/dashboard/settings/CrossFilterMatrix.tsx`, `packages/web/src/tiles/text/elementQueries.ts` (+ test), `packages/web/src/dashboard/crossfilter/` (targets).
  - Failing test: `elementQueries.test.ts`: three Values of `orders` measures under the same filters make one `/load` query; a fourth with its own filter makes a second; `CrossFilterMatrix` test: a Text tile's Highlight is disabled with "Text has no marks to highlight" and it isn't listed as a source; with Filter, a click on a bar changes the tile's Value (AC-523).
  - Depends on: T884

- [ ] T888 (AC-524) View mode: values as text in their sentence's type and weight, focusable, with a dotted underline and a tooltip that is their accessible description
  - Files: `packages/web/src/tiles/text/ElementTooltip.tsx` (+ test), `packages/web/src/tiles/text/readMapping.tsx`.
  - Failing test: `ElementTooltip.test.tsx`: a Value in a Heading large is 24 px at the heading's weight with `font-variant-numeric: tabular-nums` and no background or border; Tab reaches it; on focus it shows a dotted `text-muted` underline and a tooltip naming "Change · Revenue", "This quarter against the previous", the tile's and its own filters, "Marking: none" and "as of 14:05 · pre-aggregation", the same text as its `aria-describedby` (AC-524).
  - Depends on: T884, T873

- [ ] T889 (AC-525) The element states: loading, no data, error, no permission and a removed member; and the empty tile
  - Files: `packages/web/src/tiles/text/ElementState.tsx` (+ test), `packages/web/src/tiles/text/TextTile.tsx`, `packages/web/src/dashboard/edit/Outline.tsx`.
  - Failing test: `ElementState.test.tsx`: loading shows a skeleton the width of the last value, or 4ch, and the tile `aria-busy`; no data "—" with "No data for these filters"; an error the warning icon and "Unavailable", Details on focus; a 403 from Cube "Unavailable" with no member named, the same as a folder the groups can't reach; a removed member "Unavailable" and, in edit mode, "1 element needs fixing" with its Elements row marked; an empty tile shows the placeholder in edit mode, nothing in view mode, and "Empty text" in the Outline (AC-525).
  - Depends on: T888

- [ ] T890 (AC-526) Below 1,024 px, a Text tile full width with stacked controls, wrapping buttons and tooltips on tap
  - Files: `packages/web/src/tiles/text/textStyles.ts`, `e2e/text-tile.spec.ts`.
  - Failing test: `text-tile.spec.ts` at 390 px: a Controls tile's parameter control and filter control are on separate rows, each the tile's width; its four buttons wrap with none cut off; tapping a value shows its tooltip and tapping elsewhere hides it; the document doesn't scroll sideways (AC-526).
  - Depends on: T888, T892, T894, T899 (built after T900, for its controls)

- [ ] T891 (AC-527) Return Text tiles through MCP as markdown with tokens, and store a Text tile an MCP client writes in markdown as a checked document
  - Files: `packages/api/src/mcp/tools/read.ts`, `packages/api/src/mcp/tools/workspace.ts`, `packages/api/src/mcp/tools/text-tiles.test.ts`.
  - Failing test: `text-tiles.test.ts`: reading a dashboard returns its Text tile's content as T870's markdown inside the marked data field (AC-443); writing a dashboard with a markdown Text tile stores a document equal to T869's conversion; one holding `<script>` stores it as literal text; one of 11 tokens is refused (AC-527).
  - Depends on: T870, T871

### Lane TEXT: controls and dashboard parameters

- [ ] T892 (AC-528) A Filter control that is one of the dashboard's filters: the bar's widget at 28 px with its scope tag, one value in both places, and a deleted filter's control needing fixing
  - Files: `packages/web/src/tiles/text/elements/FilterControl.tsx` (+ test), `packages/web/src/filters/FilterBar.tsx` (the shared widget), `e2e/text-tile.spec.ts`.
  - Failing test: `FilterControl.test.tsx`: the control renders the bar's widget for Country with its scope tag, at 28 px; the e2e: choosing Spain in the control updates the bar's pill, the header's count and every tile in scope, announced once; clearing it in the bar clears the control; a second Text tile's control of Country shows the same value; deleting Country shows "1 element needs fixing" in edit mode (AC-528).
  - Depends on: T882

- [ ] T893 (AC-529) A filter control of more than 1,000 values: the first 1,000, the count, and search through Cube
  - Files: `packages/web/src/filters/widgets/` (the list widget's cap and search), `packages/web/src/tiles/text/elements/FilterControl.tsx`, tests.
  - Failing test: the list widget's test over 4,212 customers: 1,000 options and "Showing 1,000 of 4,212 · type to find the rest"; typing "acme" queries Cube with `contains` and lists "Acme Retail SARL", which wasn't in the first 1,000, with "3 matches in all 4,212 customers" (AC-529).
  - Depends on: T892

- [ ] T894 (AC-530) Action buttons: a label, a style, and an ordered list of declared actions, run in order and nothing else
  - Files: `packages/core/src/text-document.ts` (the four action kinds), `packages/web/src/tiles/text/elements/ActionButton.tsx` (+ test), `packages/web/src/tiles/text/ActionList.tsx` (+ test).
  - Failing test: `ActionList.test.tsx`: + action offers Go to page tab, Apply bookmark, Reset filters and Export only; Move up reorders; `ActionButton.test.tsx`: Reset filters then Go to page tab Detail runs in that order; Reset filters leaves a parameter's value; Export of two tiles downloads two CSVs, each as AC-171 makes it; a stored button with `{"kind":"script"}` is refused by `textDocumentProblems` and runs nothing (AC-530).
  - Depends on: T882

- [ ] T895 [P] (AC-531) The dashboard parameter in the dashboard's document: a name, a role, ordered labelled choices of at most 1,000 and a default among them
  - Files: `packages/core/src/dashboard-parameters.ts` (+ test), `packages/core/src/dashboard-document.ts`, `packages/core/src/index.ts`.
  - Failing test: `dashboard-parameters.test.ts`: a Measure parameter of Revenue, Orders and Margin % with default Revenue passes; 1,001 choices, a default outside the choices, a Dimension choice in a Measure parameter, and an empty name are each refused, named (AC-531).
  - Depends on: none

- [ ] T896 (AC-531) Dashboard settings › Parameters: the section and its list, and New parameter in the section or a 520 px dialog from the insert menu and a well's picker
  - Files: `packages/web/src/dashboard/settings/ParametersSettings.tsx` (+ test), `packages/web/src/dashboard/settings/ParameterForm.tsx` (+ test), `packages/web/src/dashboard/settings/SettingsPage.tsx`.
  - Failing test: `ParametersSettings.test.tsx`: Parameters sits after Cross-filtering and before Layout with its count; rows show name, "Field switch", Measure, 3, Revenue and "3 · 1 chart, 2 Text tiles"; `ParameterForm.test.tsx`: choices are picked with the field picker and can't be typed; Move up reorders; switching to Dimension with choices set asks first; opened from the insert menu it is a 520 px dialog that returns focus there; one Undo reverses the saved settings (AC-531).
  - Depends on: T895

- [ ] T897 (AC-532) A parameter's uses as links, Save held for a choice a bound chart can't query, and deleting a used parameter
  - Files: `packages/web/src/dashboard/settings/ParametersSettings.tsx`, `packages/web/src/dashboard/settings/parameterUses.ts` (+ test).
  - Failing test: `parameterUses.test.ts`: uses list the chart's Metrics well, a parameter control and a Value; a choice from a cube the bound chart doesn't join holds Save settings with "Revenue by month can't query Products › Margin target"; deleting the parameter asks, then each use keeps the current choice as a fixed field and its tile says so (AC-532).
  - Depends on: T896

- [ ] T898 (AC-533) Bind a parameter from a local chart's well, follow it in the chart and in Value elements, and say "set by ‹parameter›" in view mode
  - Files: `packages/web/src/editor/Wells.tsx` (the Parameters group), `packages/core/src/chart-spec.ts` (a parameter in a well; + test), `packages/web/src/dashboard/chartSpec.ts` (resolving it; + test), `packages/web/src/tiles/ChartTile.tsx` ("set by").
  - Failing test: `chartSpec.test.ts`: a local chart whose Metrics well holds "Metric to show" queries Revenue, then Orders when the parameter changes, its title and format following; its pinned type stays; `Wells.test.tsx`: the picker lists "Parameters of this dashboard" first with Metric to show only in Metrics; the pill reads "Metric to show · now Revenue" with its tooltip; a chart from folders lists no Parameters group; the tile's head shows "· set by Metric to show" in view mode (AC-533).
  - Depends on: T895

- [ ] T899 (AC-534) The Parameter control in a Text tile: segments for up to 5 choices, a listbox beyond, the default at open, applied at once and announced once
  - Files: `packages/web/src/tiles/text/elements/ParameterControl.tsx` (+ test), `packages/web/src/dashboard/parameters/useParameters.ts` (+ test).
  - Failing test: `ParameterControl.test.tsx`: 3 choices render a `radiogroup`, 6 a `listbox`; choosing Orders re-queries the bound chart and Value with Orders and the polite region receives "Metric to show: Orders" once; `useParameters.test.ts`: a dashboard opened plainly starts at the default (AC-534).
  - Depends on: T898, T882

- [ ] T900 (AC-121, AC-123) Bookmarks and copied links carry each parameter's value, and applying one sets it
  - Files: `packages/web/src/dashboard/bookmarks/viewState.ts` (+ test), `packages/web/src/dashboard/bookmarks/applyBookmark.ts` (+ test), `packages/web/src/filters/url.ts` (+ test).
  - Failing test: `viewState.test.ts`: a bookmark saved with Metric to show at Orders stores it, and applying it sets it back from Revenue; `url.test.ts`: a copied link holds the parameter's value, and opening it starts there (AC-121, AC-123).
  - Depends on: T899

### Lane TEXT: the AI service

- [ ] T901 [P] (AC-549) Encrypt the AI key at rest with AES-256-GCM under its own key-encryption key, bound to the settings, the provider and the endpoint's origin
  - Files: `packages/api/src/ai/keyStore.ts` (+ test), `packages/api/src/config.ts` (`WECHART_AI_KEY_KEYRING_FILE`, through `keyOf`), `packages/api/src/config.test.ts`.
  - Failing test: `keyStore.test.ts`: a key sealed for Azure OpenAI at `https://acme.openai.azure.com` opens with the same binding and fails to open for OpenAI or for `https://evil.example`; each seal has a fresh 12-byte IV and a 16-byte tag; `config.test.ts`: the keyring is refused when it equals the signing, service or seed key (AC-549).
  - Depends on: none
  - What the API does with no keyring at all is R80-5's, and T915's; this task's test provides one.

- [ ] T902 (AC-546, AC-548) The AI settings in wechart's database and their API, for Super-Admins only (404 for others), the key write-only, and the single user with sign-in off
  - Files: `packages/api/src/db/migrations/1758700000000_ai-settings.cjs`, `packages/api/src/repos/ai-settings.ts` (+ test), `packages/api/src/routes/ai-settings.ts` (+ test), `packages/api/src/server.ts`.
  - Failing test: `ai-settings.test.ts`: a Super-Admin's GET returns provider, model, endpoint, limits and "stored" with who and when, and no key or ciphertext field; a read-write member's GET and PUT answer 404; with sign-in off the single user's answer 200; the key column is in its own table, not read by `SELECT` on the settings; a canary key never appears in any response or the captured log (AC-546, AC-548).
  - Depends on: T901

- [ ] T903 (AC-549, AC-547) Clear the stored key when the provider or the endpoint changes, and keep Anthropic's and OpenAI's endpoints fixed
  - Files: `packages/api/src/routes/ai-settings.ts`, `packages/api/src/ai/providers.ts` (the providers and their fields; + test).
  - Failing test: `ai-settings.test.ts`: changing Azure's endpoint, or the provider, clears the key and a test without a new one answers 409 "Enter the key again"; a PUT setting Anthropic's endpoint to anything but `https://api.anthropic.com` is refused 400; `providers.test.ts`: each provider's fields are as AC-547 lists, Bedrock's credentials IAM role first (AC-549, AC-547).
  - Depends on: T902

- [ ] T904 (AC-537, AC-558) A provider port with Anthropic and OpenAI / Azure OpenAI clients set explicitly, schema-constrained, `store: false`, with no tools, against a fake provider
  - Files: `packages/api/package.json` (`@anthropic-ai/sdk@0.135.0`, `openai@7.38.0`, `zod@4.6.5`), `packages/api/src/ai/llm.ts` (the port and the `Narrative` schema), `packages/api/src/ai/anthropic.ts` (+ test), `packages/api/src/ai/openai.ts` (+ test), `packages/api/src/ai/fake.ts`.
  - Failing test: `anthropic.test.ts`, with `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` and `ANTHROPIC_LOG=debug` set in the environment: the fake receives one request, at the configured base URL, with the saved key, `output_config.format`, no `tools`, and a system prompt holding no fixture title; a 500 isn't retried; nothing is logged; `openai.test.ts`, with the OpenAI variables set: a Responses request with `store: false`, `text.format` strict, the saved key and base URL; zod 4.6.5's schema for `Narrative` uses `anyOf`, not `oneOf` (AC-537, AC-558).
  - Depends on: T903

- [ ] T905 (AC-558, AC-547) The Amazon Bedrock client through `AnthropicBedrockMantle`: the region, and the pods' IAM role or a saved access key pair
  - Files: `packages/api/package.json` (`@anthropic-ai/bedrock-sdk@0.35.0`), `packages/api/src/ai/bedrock.ts` (+ test).
  - Failing test: `bedrock.test.ts`: with an access key pair saved and other AWS credentials in the environment, the fake receives a request signed with the saved pair for the saved region; with the IAM role chosen, the client takes the default credential chain and nothing is stored; no `output_config.format` is sent, and the response still goes through T906's check (AC-558, AC-547).
  - Depends on: T904, T906
  - Waits on: R80-6, a research addendum to `docs/research/llm-providers.md` for the client's region, credential and base-URL options.

- [ ] T906 (AC-538) Check every draft, and retry once: typed segments only, known facts only, no digit in text, no refusal or cut-off
  - Files: `packages/api/src/ai/validateNarrative.ts` (+ test), `packages/api/src/ai/draft.ts` (+ test).
  - Failing test: `validateNarrative.test.ts`: rejects "grew 4.2%" in a text segment, Arabic-Indic "٤" in one, a `ref` not issued, an extra property, a non-array `segments`, `stop_reason` "refusal" and "max_tokens", and an OpenAI refusal; `draft.test.ts`: a first rejection is drafted once more and a second ends with the "couldn't keep every number live" outcome; a Bedrock-shaped answer goes through the same check (AC-538).
  - Depends on: T904

- [ ] T907 (AC-550) Test connection: four checks in order, 30 s each, mapped from the provider's errors, the test summary checked in 2 tries
  - Files: `packages/api/src/ai/testConnection.ts` (+ test), `packages/api/src/routes/ai-settings.ts`.
  - Failing test: `testConnection.test.ts` against the fake: success gives four passed checks with Reachable's ms; a 401 gives "Key refused. The provider answered "401 Unauthorized". …" and the last two "not run"; a 404 for the model gives "The model or deployment wasn't found. "wechart-narative" doesn't exist at this endpoint."; no answer gives "Timed out" at 30 s; two digit-holding answers give the warning "… in 2 of 2 tries …"; no result holds the key or a stack (AC-550).
  - Depends on: T906

- [ ] T908 (AC-551) Hold a save of the provider, endpoint or region, model, key or Bedrock credentials until a test made with them passed
  - Files: `packages/api/src/ai/testConnection.ts` (the passed test's fingerprint), `packages/api/src/routes/ai-settings.ts`, `packages/api/src/routes/ai-settings-save.test.ts`.
  - Failing test: `ai-settings-save.test.ts`: changing the model and saving without a test answers 409 "Save is held until Test connection passes"; after a passing test with that model it saves; a test passed with another key doesn't count; a limit change saves with no test (AC-551).
  - Depends on: T907

- [ ] T909 (AC-552, AC-556) Replace the key only after a passing test with the new one, and audit settings changes and key replacements, never a key
  - Files: `packages/api/src/routes/ai-settings.ts`, `packages/api/src/audit/record.ts` ("AI settings changed", "AI key replaced"), `packages/api/src/routes/ai-key-replace.test.ts`.
  - Failing test: `ai-key-replace.test.ts`: replacing without a passing test with the new key answers 409 and the old key is still used; after one, drafts use the new key; the audit records "AI key replaced" with "Tested: 4 of 4 checks passed" and neither key; a limit change from 10 to 20 records "Summaries per person per day: 10 → 20" (AC-552, AC-556).
  - Depends on: T908

- [ ] T910 (AC-536) Compute a summary's facts through Cube as the author, under the page's filters: change against the previous period, and top and bottom contributors
  - Files: `packages/api/src/ai/facts.ts` (+ test), `packages/api/src/cube/` (queries as the user).
  - Failing test: `facts.test.ts`: for Revenue under Country = Germany, France, the change fact's two queries carry the author's token and that filter; the contributors fact ranks members by Revenue; a measure in a folder the author can't reach gives no fact and is never sent (AC-536).
  - Depends on: T904
  - Waits on: R80-1, which period a change compares.

- [ ] T911 (AC-535, AC-537, AC-540) The draft route: AI on, Who may use AI (403 otherwise), facts then the provider then the check, and nothing of the draft kept
  - Files: `packages/api/src/routes/ai-summaries.ts` (+ test), `packages/api/src/ai/draft.ts`.
  - Failing test: `ai-summaries.test.ts`: a viewer, and a member outside the chosen AD groups, get 403; with AI off, 409; a draft answers segments and facts; afterwards no table holds the draft's text or the facts sent, and the captured log holds neither; the provider request carries the timeout and output cap from config (AC-535, AC-537, AC-540).
  - Depends on: T906, T910
  - Waits on: R80-3, for the timeout's and caps' values (config; the test holds for any).

- [ ] T912 (AC-543) Count drafts against the daily and monthly limits, and refuse one over a limit with 429 before any provider call
  - Files: `packages/api/src/ai/limits.ts` (+ test), `packages/api/src/routes/ai-summaries.ts`.
  - Failing test: `limits.test.ts`: with 20 a day, the 21st draft the same day answers 429 with the Super-Admin's message and the fake receives nothing; an automatic retry counts nothing; the monthly limit answers its own message (AC-543).
  - Depends on: T911
  - Waits on: R80-2, which day and month the limits count in.

- [ ] T913 (AC-544) Report a provider that can't be reached, refuses the key or is past its spending limit with wechart's own words and the request id, never retrying a spending-limit refusal
  - Files: `packages/api/src/ai/errors.ts` (+ test), `packages/api/src/ai/draft.ts`.
  - Failing test: `errors.test.ts`: a connection error, a 401 and a 429 with `enforced_spend_limit_reached` each give "provider unreachable" with the provider's request id; the 429 is sent once only; a provider message echoing the key is scrubbed from everything stored, returned or logged (AC-544).
  - Depends on: T906

- [ ] T914 (AC-545) Keep a usage record per draft request and an "AI summary inserted" audit event per insert, holding no prompt, fact value or draft
  - Files: `packages/api/src/db/migrations/1758700001000_ai-usage.cjs`, `packages/api/src/repos/ai-usage.ts` (+ test), `packages/api/src/routes/ai-summaries.ts` (the insert record), `packages/api/src/audit/record.ts`.
  - Failing test: `ai-usage.test.ts`: a draft records who, provider, model, input and output tokens, request id, duration and outcome; an insert records "AI summary inserted" with the folder, "Revenue overview › EMEA summary" and "5 live values · 4 facts"; neither holds a fact's value or any text of the draft (AC-545).
  - Depends on: T911

- [ ] T915 (AC-549, AC-547) The Helm chart: the AI keyring as its own Secret mounted for `_FILE`, and the pods' IAM role for Bedrock
  - Files: `deploy/helm/wechart/values.yaml`, `deploy/helm/wechart/templates/` (the Secret, the mount and the service account's annotations), `deploy/helm/verify.sh`.
  - Failing test: `verify.sh`: the rendered chart mounts the AI keyring Secret at the path `WECHART_AI_KEY_KEYRING_FILE` names, apart from the signing and service keys; with `ai.bedrock.roleArn` set, the API's service account carries the annotation the research names (AC-549, AC-547).
  - Depends on: T901
  - Waits on: R80-5 and R80-6.

### Lane TEXT: Security › AI

- [ ] T916 (AC-546) Security's fifth tab, AI, at `/security/ai`, with its state chip, and Not found for everyone else
  - Files: `packages/web/src/workspaces/security/ai/AiTab.tsx` (+ test), `packages/web/src/workspaces/security/SecurityPage.tsx`, `packages/web/src/router/routes.tsx`.
  - Failing test: `AiTab.test.tsx`: a Super-Admin sees AI after Access tokens with "Not set up", then "On · tested 18 Oct, 09:12" once saved and tested, each with its icon; a read-write member at `/security/ai` sees Not found; with sign-in off the single user sees the tab (AC-546).
  - Depends on: T902

- [ ] T917 (AC-547, AC-548) The settings form: AI on, Who may use AI, the provider and its fields, the key typed once or stored, and what's sent
  - Files: `packages/web/src/workspaces/security/ai/AiSettingsForm.tsx` (+ test), `packages/web/src/workspaces/security/ai/StoredKey.tsx` (+ test).
  - Failing test: `AiSettingsForm.test.tsx`: Who may use AI defaults to "Everyone who can edit dashboards"; the AD group combobox appears for "Only these AD groups"; Anthropic shows model and key with the endpoint read-only; Azure endpoint, deployment and key; Bedrock region, model ID and credentials with IAM role first; no second model; the What's sent card reads as AC-547 says; `StoredKey.test.tsx`: the key field is `type="password"` with `autocomplete="off"` and no show button; once stored it reads "Stored · encrypted · set 2 Oct 2026 by Ada Admin" with Replace… (AC-547, AC-548).
  - Depends on: T916, T903

- [ ] T918 (AC-550) The Test connection card: the four checks running in order, their results and failures, the announcement, and the last result kept
  - Files: `packages/web/src/workspaces/security/ai/ConnectionChecks.tsx` (+ test).
  - Failing test: `ConnectionChecks.test.tsx`: checks show running, then passed, each with an icon and label; after "Key refused…" the rest read "not run"; Stop appears after 10 s; the polite region receives "4 of 4 checks passed" once and focus stays on the button; the card keeps "passed · 18 Oct, 09:12 · Ada Admin" (AC-550).
  - Depends on: T917, T907

- [ ] T919 (AC-551) Save ‹n› changes, held with its reason until the test passes, and asking before leaving or Discard
  - Files: `packages/web/src/workspaces/security/ai/AiSettingsForm.tsx`, `packages/web/src/workspaces/security/ai/useAiDraft.ts` (+ test).
  - Failing test: `useAiDraft.test.ts`: two changed fields give "Save 2 changes"; a model change holds Save with "Save is held until Test connection passes" beside it until a pass; a limit change doesn't; switching to the Audit trail tab asks "Leave without saving 2 changes?" with focus on Keep editing; Discard asks first and clears the typed key (AC-551).
  - Depends on: T918, T908

- [ ] T920 (AC-552) The Replace the API key dialog: tested before Replace key, Cancel changing nothing
  - Files: `packages/web/src/workspaces/security/ai/ReplaceKeyDialog.tsx` (+ test).
  - Failing test: `ReplaceKeyDialog.test.tsx`: a 520 px dialog taking focus; Replace key disabled until "Tested with the new key: all 4 checks passed"; Cancel and Esc close it with the stored line unchanged and focus back on Replace… (AC-552).
  - Depends on: T918, T909

- [ ] T921 (AC-553) Turning AI off: the line saying what Save will do, no confirmation, everything kept
  - Files: `packages/web/src/workspaces/security/ai/AiSettingsForm.tsx`, `packages/web/src/workspaces/security/ai/AiOffLine.test.tsx`.
  - Failing test: `AiOffLine.test.tsx`: switching AI off shows "When saved: no one can draft summaries. The 38 summaries already in Text tiles stay, …" and no dialog; after Save and back on, the provider, the stored key and the limits are as before (AC-553).
  - Depends on: T919

- [ ] T922 (AC-554) The limits and the limit message: whole numbers or "No limit", "Was ‹old› · unsaved", the 280-character counter, and the 90 % line
  - Files: `packages/web/src/workspaces/security/ai/LimitsCard.tsx` (+ test).
  - Failing test: `LimitsCard.test.tsx`: an empty limit reads "No limit"; 2.5 is refused; changing 10 to 20 shows "Was 10 · unsaved"; a 281-character message holds Save with "281 / 280"; at 1,812 of 2,000 the page shows "1,812 of 2,000 summaries used this month.", and at 1,799 it doesn't (AC-554).
  - Depends on: T919

- [ ] T923 (AC-555) Usage this month for Super-Admins: person, drafted, inserted and last used, newest first, with its empty and loading states
  - Files: `packages/web/src/workspaces/security/ai/UsageTable.tsx` (+ test), `packages/api/src/routes/ai-settings.ts` (the usage read).
  - Failing test: `UsageTable.test.tsx`: rows of 34 px in newest-use order with counts from the usage records and "This month 1,284 of 2,000"; none gives "No summaries drafted yet. Authors find Summarize… in a Text tile's insert menu."; loading shows a skeleton; the API's usage read answers a read-write member 404 (AC-555).
  - Depends on: T916, T914

- [ ] T924 (AC-557) Below 1,024 px, Security › AI read-only with its reason
  - Files: `packages/web/src/workspaces/security/ai/AiTab.tsx`, `e2e/security/ai-settings.spec.ts`.
  - Failing test: `ai-settings.spec.ts` at 900 px: the state and settings show with "Changing AI settings needs a window at least 1,024 px wide.", and no Save, Replace… or Test connection (AC-557).
  - Depends on: T917

### Lane TEXT: Summarize

- [ ] T925 (AC-535) The Copilot group in the insert menu for those who may use AI, a disabled row with its link for Super-Admins while AI is off, and nothing for viewers
  - Files: `packages/web/src/tiles/text/InsertMenu.tsx`, `packages/web/src/tiles/text/ai/useAiAvailability.ts` (+ test).
  - Failing test: `useAiAvailability.test.ts`: with AI on, an author in Who may use AI sees "Summarize… a reviewed draft"; a read-write member outside the chosen groups sees no Copilot group; with AI off a Super-Admin sees it disabled with "Set up AI in Security › AI" linking to `/security/ai`, and an author nothing (AC-535).
  - Depends on: T881, T902

- [ ] T926 (AC-536) Summarize's settings in the edit sidebar: what it covers, which facts, the length, and what Copilot is sent
  - Files: `packages/web/src/tiles/text/ai/SummarizePanel.tsx` (+ test).
  - Failing test: `SummarizePanel.test.tsx`: the page's chart tiles and the tile's measures are checked; "Latest orders · a table; no facts to compute" is unchecked and disabled; both fact kinds and 1 sentence or A short paragraph are offered; the panel reads "It sees those facts, the tiles' titles and the members' names; never rows."; after a draft, "Computed 4 facts · 2 Cube queries" (AC-536).
  - Depends on: T925

- [ ] T927 (AC-539) The draft card: not in the text, its heading and number, live numbers, the facts, the provider line, a fixed setting as text, Writing… with Stop, and nothing saved
  - Files: `packages/web/src/tiles/text/ai/DraftCard.tsx` (+ test).
  - Failing test: `DraftCard.test.tsx`: a group named "Draft from Copilot · not in the tile yet" with "Draft 1", its numbers as element atoms, "Facts wechart computed through Cube · 4" with values, "Azure OpenAI · wechart-narrative · set by your Super-Admin", and Insert, Regenerate and Discard; the bullet graph's 25 % goes in as text with the note; while writing, "Writing…" and Stop, which aborts the request; the tile's document and the saved dashboard don't hold the card's text (AC-539).
  - Depends on: T926, T911

- [ ] T928 (AC-538) After a second rejected draft, say Copilot couldn't keep every number live, with Try again and Details
  - Files: `packages/web/src/tiles/text/ai/DraftCard.tsx`, `packages/web/src/tiles/text/ai/DraftFailed.test.tsx`.
  - Failing test: `DraftFailed.test.tsx`: the API's "couldn't keep every number live" outcome shows "Copilot couldn't write a summary that keeps every number live. Try again, or write it yourself with the facts below." with Try again and Details, and the facts still listed (AC-538).
  - Depends on: T927

- [ ] T929 (AC-540, AC-545) Insert, Regenerate and Discard: the draft inserted as editable text, its elements counted, undoable and announced, and the insert audited
  - Files: `packages/web/src/tiles/text/ai/DraftCard.tsx`, `packages/web/src/tiles/text/ai/insertDraft.ts` (+ test), `e2e/ai-summary.spec.ts`.
  - Failing test: `insertDraft.test.ts`: Insert puts the paragraph at the cursor with its 5 elements, the count going from 0 to 5; the polite region receives "Summary inserted, 5 live values"; one Undo removes it; Regenerate shows "Draft 2"; Discard removes the card; the e2e, against the fake provider: an inserted summary records "AI summary inserted" in the audit trail (AC-540, AC-545).
  - Depends on: T927, T914

- [ ] T930 (AC-541) The "Written with Copilot · reviewed by ‹name›, ‹date›" chip, kept through edits and gone with its text
  - Files: `packages/web/src/tiles/text/ai/AiLabel.tsx` (+ test), `packages/core/src/text-document.ts` (the summary block's label attributes).
  - Failing test: `AiLabel.test.tsx`: under the inserted paragraph, in view and edit mode, a 24 px chip of an icon and "Written with Copilot · reviewed by Wren Writer, 12 Jul 2026" in `text-secondary`; after Finn edits the paragraph it still names Wren and 12 Jul 2026; deleting the paragraph removes it (AC-541).
  - Depends on: T929

- [ ] T931 (AC-542) "Written for earlier data" for authors when a cited fact changes sign or rank, with Review and Keep as written, and "wording as of ‹date›" for viewers
  - Files: `packages/web/src/tiles/text/ai/EarlierData.tsx` (+ test), `packages/web/src/tiles/text/ai/citedFacts.ts` (+ test), `packages/api/src/routes/ai-summaries.ts` (recomputing cited facts, with no provider call).
  - Failing test: `citedFacts.test.ts`: APAC ranked first at insert and EMEA first now is a change of rank; a change from +6.8 % to +4.2 % isn't; `EarlierData.test.tsx`: authors in edit mode see the row naming "APAC was the fastest-growing region" with Review and Keep as written, which hides it; viewers see "wording as of 12 Jul 2026" in the chip and no row; a refresh or a filter change makes no provider request (AC-542).
  - Depends on: T930, T910

- [ ] T932 (AC-543) At a limit, Summarize's message from the Super-Admin, and the author's allowance
  - Files: `packages/web/src/tiles/text/ai/SummarizePanel.tsx`, `packages/web/src/tiles/text/ai/LimitReached.test.tsx`.
  - Failing test: `LimitReached.test.tsx`: the API's 429 shows "You've used today's 20 summaries. "Summaries reset at midnight UTC. Ask the BI team if you need more." · from your Super-Admin" in place of the button; the monthly one "wechart has used this month's 2,000 summaries."; the panel reads "You've drafted 3 of 20 today." (AC-543).
  - Depends on: T926, T912

- [ ] T933 (AC-544) A provider failure in the draft card: one sentence, Retry and Details, "Open Security › AI" for Super-Admins, and no key or stack
  - Files: `packages/web/src/tiles/text/ai/ProviderFailed.tsx` (+ test).
  - Failing test: `ProviderFailed.test.tsx`: the warning icon, "Copilot can't reach its provider. Tell your Super-Admin.", Retry and Details holding the request id; a Super-Admin also sees "Open Security › AI"; Details never holds the text of the API's internal error (AC-544).
  - Depends on: T927, T913

## Phase 2 coverage: acceptance criterion → task

| AC | Tasks | AC | Tasks | AC | Tasks |
|---|---|---|---|---|---|
| AC-001 | T331 | AC-008 | T322, ~~T339~~ T437 | AC-041 | T390 |
| AC-047 | T380 | AC-048 | T382 | AC-049 | T381 |
| AC-050 | T383 | AC-051 | T384 | AC-052 | T385, T590 |
| AC-093 | T386 | AC-097 | T387, T453 | AC-104 | T388 |
| AC-116 | T389 | AC-131 | T334, T342 | AC-141 | T342, T546 |
| AC-145 | T375, T504 | | | | |
| AC-150 | T372, ~~T373~~ (next phase, R41), T374, T376, T504 | AC-151 | T376, T504 | AC-153 | T377 |
| AC-154 | ~~T377~~ T551, T552 | AC-155 | T379, T504 | AC-157 | T364, T459 |
| AC-158 | T363, T461, T497 | AC-159 | T361, T363 | AC-160 | T360, T454, T363 |
| AC-161 | T335, T363, T365, T435, T442, T462, T497, T501, T728, T730 | AC-163 | T362, T363, T461, T462 | AC-164 | T335, T497 |
| AC-176 | T405, T640, T743 | AC-180 | T407 | AC-187 | T406, T466–T470, T476–T478 |
| AC-192 | T331, T345 | AC-194 | T325, T331 | AC-201 | T402 |
| AC-220 | T403 | AC-222 | T342 | AC-233 | T364 |
| AC-234 | T378, T552, T504 | AC-246 | T404 | AC-249 | T336, T450, T724, T726, T727, T734 |
| AC-251 | T318, T321, T324, T431 | AC-252 | T316, T319, T320 | AC-253 | T317, T321 |
| AC-254 | T311, T319, T351, T359 | AC-255 | T312, T408 | AC-256 | T313, T323, T325, T326 |
| AC-257 | T315, T320, T324 | AC-258 | T411 | AC-259 | T314, T330, T473 |
| AC-260 | T312, T314, T330, T473 | AC-261 | T312, T325, T408 | AC-262 | T313, T327, T334, T335 |
| AC-263 | T313, T326, T334, T335, T436, T711, T714 | AC-264 | T313, T325, T326 | AC-265 | T313, T323, T328, T330, T369, T371, T473 |
| AC-266 | T326, T340, T334 | AC-267 | T328, T334, T335, T343, T408, T473 | AC-268 | T340, T408 |
| AC-269 | T334, T335, T462 | AC-270 | T336, T705, T727 | AC-271 | T336, T452, T705, T727, T728 |
| AC-272 | ~~T337, T339, T340~~ T429, T457, T711, T714, T729 | AC-273 | ~~T338~~ T435, T712, T728, T730 | ~~AC-274~~ | retired 2026-10-07, `[R71]` (was T341; its spec reworked by T728) |
| AC-275 | ~~T337, T352~~ T428, T706, T715, T729 | AC-276 | T343 | AC-277 | T343 |
| AC-278 | T344, T348, T502 | AC-279 | T344 | AC-280 | T346, T347, T731 |
| AC-281 | T347, T716, T731 | AC-282 | T345, T347, T363, T705, T731 | AC-283 | T347, T717, T731 |
| AC-284 | T349, T358 | AC-285 | T350, T451 | AC-286 | T351 |
| AC-287 | T355, T356 | AC-288 | T352, ~~T426~~ T451 | AC-289 | T354, T357, T515, T766 |
| AC-290 | T353, T358 | AC-291 | T329, ~~T426~~ T451, T706, T715, T722 | AC-292 | T366 |
| AC-293 | T367, T580 | AC-294 | T368, T505, T554, T555, T556 | AC-295 | T369 |
| AC-353 | T506, T509, T725, T730 | AC-096 | T507 | | |
| AC-354 | T508, T511 | AC-355 | T508, T511 | AC-356 | T508, T513, T720 |
| AC-357 | T508, T513, T720, T733 | AC-358 | T508, T514, T719, T721, T733 | AC-359 | T508, T512 |
| AC-360 | T511 | AC-361 | T514, T733 | | |
| AC-362 | T517 | AC-363 | T518 | AC-364 | T519, T526 |
| AC-365 | T520, T526 | AC-366 | T521 | AC-367 | T522 |
| AC-368 | T523 | AC-369 | T524 | AC-370 | T525 |
| AC-371 | T527, T537, T714, T729 | AC-372 | T528 | | |
| AC-373 | T531, T532, T535 | AC-374 | T531, T536 | AC-375 | T532 |
| AC-376 | T532 | AC-377 | T532, T535 | AC-378 | T532, T535, T545, T548, T549 |
| AC-379 | T533, T535, T545, T548, T549 | AC-380 | T535 | AC-381 | T534, T535 |
| AC-382 | T534 | AC-383 | T532, T535 | AC-384 | T536 |
| AC-385 | T535 | AC-386 | T539, T547 | AC-387 | T535 |
| AC-388 | T541 | AC-389 | T540 | AC-390 | T544 |
| AC-391 | T550 | AC-392 | T552 | AC-393 | T553 |
| AC-394 | T554 | AC-395 | T555 | AC-396 | T556 |
| AC-397 | T557 | AC-398 | T558 | AC-399 | T559, T560, T473, T610, T640, T611, T612, T613, T614 |
| AC-281 (again, rebinding) | T542 | AC-283 (again, use-only copies) | T543 | | |
| AC-354 (again, copy on use) | T538 | | | | |
| AC-296 | T370 | AC-297 | T371, T378, T559, T504 | AC-298 | T332, T333, T335, T346, T352, T362, T368, T441, T581 |
| AC-299 | T391 | AC-300 | T392 | AC-301 | T393 |
| AC-302 | T394 | AC-303 | T395 | AC-304 | T396 |
| AC-305 | T398 | AC-306 | T399 | AC-307 | T409, T444 |
| AC-308 | T410 | ~~AC-309~~ | retired 2026-09-25 (was T337) | AC-310 | ~~T338~~ T435, T443, T497, T700, T702, T708, T730 |
| ~~AC-311~~ | retired 2026-09-25 (T333 now serves AC-324) | AC-312 | T335, T454, T361, T497 | AC-313 | T397, T398 |
| AC-314 | T400 | AC-315 | T401 | AC-316 | T316, T321 |
| AC-317 | T412 | AC-318 | T416 | AC-139 | T413, T417 |
| AC-248 | T414, T415, T417 | AC-250 | T413, T420 | AC-009 | T447, T432 |
| AC-136 | T445, T447, T426 | AC-137 | T447, ~~T432~~ T426 | AC-166 | T438 |
| AC-332 (again) | T426 | AC-235 (again) | T445, T447 | AC-140 (again) | T446 |
| AC-319 | T418, T421, T422, T423, T444 | AC-320 | T436 | AC-321 | ~~T426~~ T451, T436, T456, T704, T713 |
| AC-322 | T427, T451, T713, T715 | AC-323 | T347, T440, T716, T731 | AC-324 | T333, T455 |
| AC-325 | T441, T363, T581 | AC-326 | T420, T437 | AC-327 | T431, T442, T458 |
| AC-328 | T341, T425, T449, T452, T435, T501, T702, T709, T710, T728 | AC-329 | T429, T450, T342, T347, T710, T718, T728, T732 | AC-330 | T419, T447, T425, T449, T436, T442 |
| ~~AC-331~~ (retired, `[R30]`) | ~~T430~~ | AC-332 | T433 | AC-333 | T419, T447, T449, T425, T420 |
| AC-334 | T421, T447 | AC-335 | T446, T447 | AC-336 | T430, T449, T740 |
| AC-337 | T448 | AC-009 (again) | T426 | AC-189, AC-249 (again, folder items) | T450 |
| AC-338 | T472 | AC-339 | T471 | AC-340 | T471 |
| AC-341 | T356 | ~~AC-342~~ | retired 2026-10-07, `[R71]` (was T475, T633; their tests reworked by T732) | AC-343 | T471, T473, T474, T475, T462, T331, T348, T356, T357, T358, T367, T369, T371 |
| AC-344 | T470, T479–T487, T493, T494 | AC-345 | T488 | AC-346 | T488 |
| AC-347 | T489 | AC-348 | T490 | AC-349 | T491 |
| AC-350 | T492 | AC-351 | T493 | AC-249 (again, drafts) | T488 |
| AC-420 | T600 | AC-189, AC-235 (again, amended `[R60]`) | T451 | AC-254 (again, models) | T451 |
| AC-421 | T700, T701, T702, T704 | AC-422 | T704, T705, T723, T724 | AC-423 | T706, T722, T737 |
| AC-424 | T701, T702, T704, T705, T723, T724, T726 | AC-425 | T713, T714, T715, T729 | AC-426 | T700, T703, T708, T723 |
| AC-427 | T707 | AC-428 | T718, T732 | | |
| AC-323, AC-422 (again, the overlay after a workspace folder's delete) | T739 | | | | |
| AC-141, AC-329 (again, the naming work's regressions) | T738 | AC-132, AC-344 (again, T481 after T722) | T738 | AC-313, AC-356, AC-357 (again, races under one name per item) | T738 |
| AC-277 (again, group 3) | T760 | AC-291 (again, a folder's rename) | T761 | AC-429 | T762 |
| AC-279 (again, its models) | T763 | AC-320 (again, every instance) | T764 | | |
| AC-304, AC-034 (again, T680's layout fixes) | T680 | AC-187 (T406's critique of 2026-10-08) | T681, T683, T684, T688, T691, T693, T696, T698, T699, T742 | AC-352 (T406's critique) | T681–T690 |
| AC-343 (T406's critique) | T691–T699, T742 | AC-344 (T406's critique) | T691, T692 | AC-148 (again, with design 04 note 4) | T681 |
| AC-001 (again, SQL runner after Schedules, `[R78]`) | T796 | AC-373 (again, the workspace) | T798, T802, T823, T824 | AC-381 (again, the workspace; 17-Q4) | T797, T817 |
| AC-385 (again, every tab) | T802 | AC-386 (again, the left pane) | T797, T805 | AC-387 (again, the statement at the cursor) | T803 |
| AC-304 (again, the workspace's rails) | T797 | AC-379, AC-380 (again, in a tab) | T804, T802 | AC-383, AC-384 (again, the picker) | T798 |
| AC-430 | T767, T769, T770, T776 | AC-431 | T768, T771, T776 | AC-432 | T777, T782, T785 |
| AC-433 | T785 | AC-434 | T778 | AC-435 | T776 |
| AC-436 | T775 | AC-437 | T782, T784 | AC-438 | T785, T786 |
| AC-439 | T787 | AC-440 | T789 | AC-441 | T789 |
| AC-442 | T767, T768, T781, T787 | AC-443 | T783, T784 | AC-444 | T790 |
| ~~AC-445~~ | retired 2026-10-17, `[R78]` ("Defer Claude.ai") | AC-446 | T796, T801 | AC-447 | T798 |
| AC-448 | T806 | AC-449 | T807 | AC-450 | T800 |
| AC-451 | T801 | AC-452 | T804 | AC-453 | T809 |
| AC-454 | T811 | AC-455 | T816 | AC-456 | T808 |
| AC-457 | T812 | AC-458 | T813 | AC-459 | T814 |
| AC-460 | T815 | AC-461 | T819 | AC-462 | T820, T822 (waits on xcube's image) |
| AC-463 | T821 | AC-464 | T823 | AC-465 | T818 (its values half moved from T811, decision T811-1) |
| AC-466 | T799, T824 | AC-467 | T825 | AC-468 | T767, T769 |
| AC-469 | T767, T769, T782, T785, T787, T788 | AC-470 | T772 | AC-471 | T777 |
| AC-472 | T779 | AC-473 | T779, T780 | AC-474 | T773, T780, T793, T795 |
| AC-475 | T784 | AC-476 | T774, T792, T793, T794, T795 | AC-477 | T788 |
| AC-478 | T781 | AC-479 | T769, T773, T791 | AC-480 | T827 (waits on the keyboard research) |
| AC-481 | T826 | AC-482 | T810, T826 | AC-483 | T812 |
| AC-484 | T829 | AC-485 | T830 | AC-486 | T828, T831 |
| AC-487 | T828, T832 | AC-488 | T833 | AC-489 | T834 |
| AC-490 | T828, T835 | AC-491 | T836 | AC-492 | T837 |
| AC-493 | T839, T840 | AC-494 | T841 | AC-495 | T842 |
| AC-496 | T829, T843 | AC-196 (again, the compact header, `[R79]`) | T828, T829 | AC-200 (again, compact chips, `[R79]`) | T838 |
| AC-119 (again, compact chips and Escape's order, `[R79]`) | T834, T838 | AC-352 (again, design 19) | T844 | AC-343 (again, design 19) | T844 |
| AC-187 (design 19 counts as conformance) | T844 | AC-195, AC-206, AC-056, AC-098, AC-304 (held, retested with the compact header) | T830, T836, T838, T842 | | |
| AC-497 | T845, T846, T855, T856, T857, T867 | AC-498 | T845, T855 | AC-499 | T847, T858, T867 |
| AC-500 | T848, T857 | AC-501 | T849, T858 | AC-502 | T850, T858 |
| AC-503 | T851, T859 | AC-504 | T852, T855, T860 | AC-505 | T853, T860 |
| AC-506 | T854 | AC-507 | T862 | AC-508 | T863 |
| AC-509 | T864 | AC-510 | T865 | AC-511 | T866 |
| AC-037 (again, the combo, `[R80]`) | T845, T846, T867 | AC-218 (again, two unsynchronized axes, `[R80]`) | T861 | AC-219 (again, the combo's settings, `[R80]`) | T855, T858 |
| AC-512 | T869, T872, T875 | AC-513 | T868, T871, T873, T880 | AC-514 | T877 |
| AC-515 | T878 | AC-516 | T879 | AC-517 | T881 |
| AC-518 | T868, T871, T883 | AC-519 | T882 | AC-520 | T884 |
| AC-521 | T885 | AC-522 | T886 | AC-523 | T887 |
| AC-524 | T888 | AC-525 | T889 | AC-526 | T890 |
| AC-527 | T870, T891 | AC-528 | T892 | AC-529 | T893 |
| AC-530 | T894 | AC-531 | T895, T896 | AC-532 | T897 |
| AC-533 | T898 | AC-534 | T899 | AC-535 | T911 (waits on R80-3), T925 |
| AC-536 | T910 (waits on R80-1), T926 | AC-537 | T904, T911 | AC-538 | T906, T928 |
| AC-539 | T927 | AC-540 | T911, T929 | AC-541 | T930 |
| AC-542 | T931 | AC-543 | T912 (waits on R80-2), T932 | AC-544 | T913, T933 |
| AC-545 | T914, T929 | AC-546 | T902, T916 | AC-547 | T903, T905 (waits on R80-6), T915 (waits on R80-5, R80-6), T917 |
| AC-548 | T902, T917 | AC-549 | T901, T903, T915 | AC-550 | T907, T918 |
| AC-551 | T908, T919 | AC-552 | T909, T920 | AC-553 | T921 |
| AC-554 | T922 | AC-555 | T923 | AC-556 | T909 |
| AC-557 | T924 | AC-558 | T904, T905 | | |
| AC-058 (again, Text in place of Markdown, `[R80]`) | T874 | AC-116 (again, every element kind, `[R80]`) | T869, T884, T886 | AC-208 (again, the Text tile, `[R80]`) | T873 |
| AC-302 (again, editing on the canvas, `[R80]`) | T876 | AC-121, AC-123 (again, parameter values, `[R80]`) | T900 | AC-030, AC-029, AC-443 (held, `[R80]`) | T865, T891 |

AC-009, AC-136 and AC-137 are ticked from phase 1. ~~They stay ticked until slice 3 changes how publishing works; T426 and T432 then reword them and retest them (R28 Q9).~~ They keep their wording and their ticks while their tests pass: T447 re-runs them against xcube at slice 2's cut-over, and T426 and T432 again in slice 3 (2026-09-26, `[R29]`). AC-235 was unticked by R29 and is ticked again by T445 and T447.
