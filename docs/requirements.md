# wechart requirements

**Status:** written 2026-09-19 from the project interview (rounds R1–R6). Input files: `docs/inputs/2026-09-19-product-direction.md` (§1–13). Design work already done is in `docs/design/`; Cube research is in `docs/research/cube/`.

**Phase 2 (2026-09-25):** Part 2 at the end of this file holds phase 2's requirements, from rounds R11–R17. Part 1, below, is phase 1's record. Where the two differ, Part 2 governs.

Every statement traces to a round (`[R1]`–`[R6]`), an input file (`[docs/inputs §n]`), `[CLAUDE.md]`, or a research doc. Nothing here is Claude's assumption; anything undecided is in **Open questions**.

---

## 1. Problem

wechart is a BI tool intended to **eventually replace Spotfire** for the user's own organisation, built on Cube because **Cube's model is close to Spotfire's model** `[R1]`.

What fails today `[R1]`:

- **Licence cost per seat.** Spotfire seats are expensive, so access is rationed: people who should explore the data get a screenshot or a PDF.
- **Desktop client and IT overhead.** Analyst work needs the installed client, with versions, hotfixes and licence features, and the web client can't do everything the desktop can.
- **Data has to be loaded into the tool.** Analyses depend on in-memory data tables and scheduled loads, so live warehouse data is limited and the copy goes stale or grows too large.

The bar is set by two comparisons `[R1]`:

- **Superset and Metabase** — the open-source BI a team would otherwise self-host next to Cube.
- **Spotfire** — the way the organisation's analysts work today: marking, trellis, details on demand.

Cube's own UI (Playground, Cube Cloud) is explicitly _not_ the bar `[docs/inputs §5]`.

Audience: **the user's own organisation**, one deployment the user controls `[R1]`. Selling or open-sourcing it is not a phase-1 concern.

## 2. Users

Four roles, all in scope `[R2]`:

| Role                        | What they do                                                                                              | Notes                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Analyst / author**        | Picks cubes and measures, builds charts and dashboards, marks and drills. Today's Spotfire Analyst users. | **Spotfire power user, no SQL** `[R2]`: fluent in marking, trellis, filters and expressions, but doesn't write SQL and shouldn't have to see it. |
| **Business consumer**       | Opens dashboards others built, filters, marks, exports.                                                   | Never builds a chart from scratch.                                                                                                               |
| **Semantic-layer engineer** | Owns the Cube model: cubes, views, joins, pre-aggregations, data sources.                                 | Writes YAML and SQL.                                                                                                                             |
| **Platform operator**       | Runs the deployment: refresh jobs, queues, caches, connections, access policies.                          |                                                                                                                                                  |

**Scale: 500 or more people** once it replaces Spotfire `[R2]`. Concurrency, permissions and dashboard sprawl are therefore first-order problems, even though phase 1 itself ships without login (§4).

## 3. Success metrics

| #   | Metric                                                                                                                    | How it is measured                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| M1  | The **50 most-used `.dxp` analyses** are rebuilt in wechart and **signed off by their owners** as equivalent `[R3]`       | Owner sign-off per analysis, against the parity checklist (M4) |
| M2  | **At least 80% of new dashboards are built by analysts with no engineer involved** `[R3]`                                 | The creator recorded on each dashboard                         |
| M3  | A **10-chart dashboard on live warehouse data renders in under 3 seconds at p95** `[R3]`                                  | wechart's own query timings                                    |
| M4  | **A Spotfire feature-parity checklist is demonstrably covered** — marking, trellis, details, filtering, text areas `[R3]` | The checklist, demonstrated feature by feature                 |

Not chosen as metrics, and so not tracked: retiring Spotfire seats on a deadline, and viewer reach beyond today's seat count `[R3]`.

## 4. Constraints

**Deployment**

- Production: **self-hosted Kubernetes**, operated by the user's team, running wechart, Cube and Cube Store as containers `[R4]`.
- Local development: docker-compose (Cube API, Cube Store, a seeded sample Postgres, wechart's metadata DB) `[CLAUDE.md]`, plus end-to-end deploys to docker-desktop Kubernetes, namespace `wechart` `[docs/inputs]`.

**Data**

- Cube must connect to **PostgreSQL, Snowflake, Databricks or BigQuery, and SQL Server or Oracle** `[R4]`. Each has its own driver settings, authentication and export-bucket rules `[research/cube/data-sources.md]`.
- Volumes **vary widely**: both small marts and very large fact tables, so **the UI must make clear which queries are accelerated and which are not** `[R4]`.

**Performance**

- p95 under 3 seconds for a 10-chart dashboard on live data (M3) `[R3]`.

**Security, phase 1**

- **Single user, no login.** Phase 1 assumes one trusted user on a trusted network, and wechart holds one Cube security context `[R4]`, consistent with users and groups being phase 2 `[docs/inputs §7]`.
- Cube's own access policies still exist in the model; wechart's Security surface is limited to viewing them and previewing a security context (§6).

**Platform**

- **Cube Core v1.7.42.** Cube Cloud-only capabilities are unavailable and must be built by wechart or dropped `[research/cube/*]`.
  - **From 2026-09-25, the user's fork of Cube v1.7.45** (`cube:v1.7.45-introspection`: upstream v1.7.45 plus a data-source introspection API). It runs as both Cube and its refresh worker, in docker-compose and in the docker-desktop Helm release. It is built locally and pushed to no registry `[R10]`.
- Consequences already established by research: Cube Core has no connection-management API, no build history beyond 24 hours, no users or groups, and dev mode bypasses authentication.

**Devices**

- **Desktop browsers only**: current Chrome, Edge, Firefox and Safari. Nothing is promised for phones or tablets, and touch marking is not in phase 1 `[R7]`.

**Design**

- Built to the depth of Superset, Metabase, Spotfire and Tableau, not a starter playground `[docs/inputs §5]`.
- The committed design direction is `docs/design/direction.md`: dense three-pane workbench, 12 px minimum text, validated palettes, WCAG AA in both themes, full keyboard access.
- **Accepted** for structure, layout and interaction, including its numbered checklist, which acceptance criteria may cite. Colours, type and density may still change while building `[R7]`.

**Process**

- TDD, one commit per task, spec-gated edits `[CLAUDE.md]`.
- No decision may be made on human effort, build complexity or time estimates `[CLAUDE.md]`.

## 5. Stack

**Decided**

| Area                      | Choice                                                                                                                                                                                                                          | Source                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Repo                      | pnpm workspace monorepo, Node 26, TypeScript strict everywhere                                                                                                                                                                  | `[CLAUDE.md]`              |
| Web app                   | Vite + React                                                                                                                                                                                                                    | `[CLAUDE.md]`              |
| Charts                    | Apache ECharts, with engine-neutral chart specs saved as data                                                                                                                                                                   | `[CLAUDE.md]`              |
| Semantic layer            | Cube Core + Cube Store                                                                                                                                                                                                          | `[CLAUDE.md]`              |
| Local dev                 | docker-compose: Cube, Cube Store, sample Postgres, wechart metadata DB                                                                                                                                                          | `[CLAUDE.md]`              |
| **Backend**               | **A wechart Node/TypeScript API with Postgres**: stores dashboards, charts, folders and settings; proxies Cube with a security context; tests connections; runs the scheduler. The browser never holds Cube credentials. *Phase 2: connection tests run in xcube, and wechart is Cube and xcube's client `[AD 1, AD 7]`.* | `[R5]`                     |
| **Recommender**           | **TypeScript hard rules plus weighted scoring.** Legality rules (channel capacity, mark and type compatibility) then weights ported from Draco's soft constraints. Runs in-process, explainable, no Python in the request path. | `[R5]`, `[docs/inputs §3]` |
| **UI primitives**         | **Built in-house and modular**, so dialogs, menus, comboboxes and chart types can be added over time. No third-party component library.                                                                                         | `[R5]`                     |
| **Third-party libraries** | **Permissively licensed open source only.** No paid licences (rules out AG Grid Enterprise and similar).                                                                                                                        | `[R5]`                     |

**Decided by component research (2026-09-19), user-confirmed**

Every row is backed by a doc in `docs/research/`. All licences are permissive; nothing is behind a paid tier.

| Area                             | Choice                                                                                                                                                                                                                                                                                                                                                                                                                | Doc                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Dashboard grid and drag-and-drop | **In-house**, CSS-grid flow plus pointer events. react-grid-layout's flat absolutely-positioned model cannot express the nested page-tab → section → tab-group → tile tree, and neither candidate can drop a tile onto a tab label. Condition: ship dnd-kit's accessibility baseline (`aria-roledescription`, described-by instructions, polite live-region announcements on pick-up, move, drop, cancel and resize). | `research/dashboard-grid.md`         |
| Data table and pivot             | `@tanstack/react-table` 9.2.4 + `@tanstack/react-virtual` 3.14.13. Cross-tab columns come from Cube's `ResultSet.tablePivot`/`tableColumns`; the grid supplies header groups, row subtotals and grand totals.                                                                                                                                                                                                         | `research/table.md`                  |
| React data layer                 | `@tanstack/react-query` 5.103.1 — the only candidate that hands the query function an `AbortSignal` and aborts superseded fetches, which is what the cancel-on-supersede requirement needs.                                                                                                                                                                                                                           | `research/data-layer.md`             |
| Code editor                      | **Monaco Editor 0.56.0** with `@monaco-editor/react` 4.7.0. Chosen over CodeMirror 6 for its documented screen-reader paging strategy. Two consequences to carry: Monaco themes cannot read CSS custom properties, so both palettes are generated from our design tokens at build time; and Tab is trapped by default, so the editor shows a visible "Ctrl+M / ⌃⇧M to exit" hint.                                     | `research/code-editor.md`            |
| YAML parsing and writing         | `yaml` 2.9.1 (eemeli). The only candidate that round-trips comments and collects multiple errors instead of throwing. Parse options must match Cube's own parser (`merge: true`, `customTags: ['timestamp']`).                                                                                                                                                                                                        | `research/yaml.md`                   |
| Chart renderer                   | Apache ECharts 6.1.0. Marking gestures use a DOM drag overlay plus `convertToPixel` hit-testing, because the built-in brush selects data only in scatter, bar and candlestick series.                                                                                                                                                                                                                                 | `research/echarts.md`                |
| Routing                          | TanStack Router                                                                                                                                                                                                                                                                                                                                                                                                       | `research/router.md`                 |
| API server                       | Fastify                                                                                                                                                                                                                                                                                                                                                                                                               | `research/api-framework.md`          |
| Metadata DB access               | `pg` + Kysely + node-pg-migrate                                                                                                                                                                                                                                                                                                                                                                                       | `research/db-access.md`              |
| Scheduler                        | pg-boss                                                                                                                                                                                                                                                                                                                                                                                                               | `research/scheduler.md`              |
| Tests                            | Vitest + Testing Library + Playwright                                                                                                                                                                                                                                                                                                                                                                                 | `research/test-stack.md`             |
| Lint and format                  | ESLint + Prettier + typescript-eslint                                                                                                                                                                                                                                                                                                                                                                                 | `research/lint-format.md`            |
| TypeScript version               | **6.0.3, not the 7.0.2 that `research/toolchain.md` pins.** typescript-eslint 8.70.0 refuses to load against TS 7 ("typescript-eslint does not support TS 7.0", tracking issue #10940), so TS 7 and typed linting are mutually exclusive today. User chose typed linting over the native-port compiler at T001; revisit when typescript-eslint supports TS 7.                                                          | `research/lint-format.md`, `research/toolchain.md` |
| Recommender references           | Draco 2.0.1 is a **reference only, never a dependency** — it needs Python and clingo, and its shipped weights are hand-tuned, not learned. Port its hard-constraint names and soft-constraint weights, CompassQL's type↔channel table, and Draco-APT's per-type channel order.                                                                                                                                        | `research/recommender-algorithms.md` |
| Vega-Lite's role                 | Reference for scale, axis, legend and stack defaults only. It never picks the mark, so it contributes nothing to chart recommendation. ECharts stays the renderer.                                                                                                                                                                                                                                                    | `research/vega-lite.md`              |

Recorded as a consequence of that research: the channel-capacity caps (8 colours, 6 shapes, 20 trellis panels, 6 pie slices, 200 heatmap cells) are **product decisions**, not figures from the graphical-perception literature, and `docs/design/direction.md` §5 now says so.

**Still open, with the requirement that decides each**

| Open item                 | Decided by                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Recommender weight source | Weights kept separate so they can later be refitted from the `.dxp` corpus and from which charts analysts keep or swap `[R5]` |

## 6. Scope

Product surfaces, from the design work already reviewed (`docs/design/direction.md`, and the prototype):

- **Explore** — folder browser for dashboards and charts; chart pages; no separate Dashboards nav `[docs/inputs §8]`.
- **Dashboard authoring** — WYSIWYG 12-column grid, page tabs, sections, tab groups, markdown, header, divider, image, link/button; edit sidebar (Add, Outline, Properties); keyboard move and resize `[docs/inputs §8, §9]`.
- **Markings (Spotfire)** — named, coloured, dashboard-wide selections; brushing with the marked share drawn at full strength; details tiles limited by markings; marked-rows actions; per-dashboard choice of markings or cross-filtering, in dashboard settings `[docs/inputs §10–13]`. **At most four markings per dashboard, at most 1,000 marked items each, and Spotfire's wording is kept. Range-based marking and bookmarks are in phase 1; touch is not** `[R7]`.
- **Quick calculations** — a fixed menu on a measure (% of total, difference and % difference from the previous period, running total, rank, moving average), each mapping to a Cube multi-stage measure. Anything else becomes a tracked request to the semantic-layer engineer, carrying the chart it came from `[R7]`.
- **Text tiles** — Markdown with live tokens (measure values, marking summaries) and no raw HTML `[R7]`.
- **Chart builder** — cube/view picker, metrics and dimensions, chart-type gallery, recommendation with a one-line reason and "Why this chart?", axis and legend customisation, drill `[docs/inputs §2–3]`.
- **The prototype's structure, followed** `[R7, R9]`. R7 accepted `docs/design/prototype/` for structure, layout and interaction; R9 makes following it phase-1 work, surface by surface, from the critiques in `docs/design/critiques/2026-09-24-*.md`. Two structural choices it settles: the folder tree has **a shared root and a personal "My workspace" root** — in phase 1, with one user, simply a place for personal and draft work — and **global search covers dashboards, charts, Cube fields and model files**, each result labelled with its type, while Explore's own search box stays dashboards and charts `[R9]`. Two parts of the prototype are left out: **model-file History** (the user: "Not in phase 1" `[R9]`), and the Model pane's **"main · dev mode" branch badge**, which describes Cube Cloud's branches — Cube Core, which wechart targets, has none — so the Model workspace shows wechart's own draft state in its place (a decision taken during planning, recorded here so it can be overturned).
- **Two more chart types: a country map and a box plot** `[R8]`. The map is a country-level choropleth keyed by ISO-3 country codes, with one measure coloured per country. The box plot draws one box per category over a numeric value — median, quartiles and whiskers. Both come from the Superset parity exercise (`docs/design/superset-parity.md`): Superset's two Northwind dashboards use them for three of their 22 charts, and nothing else wechart draws can reproduce those panels.
- **Model editor** — Cube YAML authoring with synchronised form and code views `[docs/inputs §4b]`.
- **Data sources, jobs, schedules, security preview** — `[docs/inputs §7]`.

### Cube capability inventory

From `docs/research/cube/` (Cube Core 1.7.42). **In** = phase 1. **Deferred** = later phase, per `[R6]`. Cube Cloud-only capabilities are unavailable on Core and are listed once at the end.

**Data modelling (Cube YAML)**

- **In:** cube definition (`sql_table` or `sql`, `data_source`, title, description, `public`, `meta`); the YAML form editor over every validator key plus a raw code editor, with Joi errors grouped by file.
- **In:** measures — count, count_distinct(_approx), sum, avg, min, max, number, string, time, boolean; `filters`, `drill_members`, `format`, `currency`; rolling windows and period-to-date; multi-stage measures (`time_shift`, `grain`, `filter`, `rank`, `case`).
- **In:** dimensions — string, number, boolean, time, geo, switch; `case` bucketing, `sub_query`, proxy references, `order`, `primary_key`, `links`; the 8 default time granularities plus custom granularities.
- **In:** segments, hierarchies, joins (`one_to_one`, `one_to_many`, `many_to_one`, directed) with a join-graph editor, views (`includes`, `excludes`, `prefix`, `alias`, member overrides, `extends`), view folders and groups, `default_filters`.
- **In:** `refresh_key` and context variables (`CUBE`, `FILTER_PARAMS`, `FILTER_GROUP`, `SQL_UTILS`); reading and publishing the model (`/v1/meta`, `schemaVersion`).
- **In:** **generating cubes from database tables**, by browsing a connection's schemas and tables `[R6 confirmation]`. **Un-deferred 2026-09-25 `[R10]`:** browsing and generation go through the data-source introspection API in the user's Cube fork (`[docs/inputs/2026-09-25-cube-introspection-api.md]`). wechart browses through Cube, the user picks tables, and Cube returns generated YAML that it writes nowhere. wechart then saves that YAML to its own model store and publishes it through the existing validate-then-publish flow. Anyone may generate in phase 1. A generated cube whose name or file name is already in the model store is refused, naming the existing one, and nothing existing is overwritten `[R10]`.
- **Deferred:** dynamic models (Jinja, Python `globals.py`, JavaScript `asyncModule`) `[R6]`.
- **Deferred:** import from a dbt manifest or from LookML `[R6 confirmation]`.
- **Deferred:** multi-tenant models (`contextToAppId`, `COMPILE_CONTEXT`) `[R6 confirmation]`.

**Queries and data APIs**

- **In:** grouped queries; time bucketing with absolute and relative date ranges; period-over-period (`compareDateRange`); the filter operators with nested and/or groups; segments, sorting, pagination, `total`, timezone; ungrouped (row-level) queries; data blending; drill-down from `drill_members`; client-side pivot; dry run and generated SQL for validation and "View SQL"; progress, cancel and abort; freshness and acceleration indicators (`lastRefreshTime`, `usedPreAggregations`, `slowQuery`).
- **In:** markings as filters (canonical tuple sets compiled to Cube filters), partial highlight as two queries, and marking applicability checks.
- **Deferred:** the SQL API — a SQL runner in wechart and a "connect Excel or Tableau" page `[R6]`.
- **Deferred:** real-time subscriptions and auto-refreshing tiles `[R6]`.
- Not applicable: GraphQL API (no wechart surface), MDX and DAX (Cloud).

**Pre-aggregations and caching**

- **In:** `rollup` definitions (measures, dimensions, segments, time dimension, granularity) with a pre-aggregation editor; partitioning and build range; refresh strategy (`refresh_key`, `incremental`, `update_window`, `scheduled_refresh`); indexes including aggregate indexes; hit prediction and "would this query be accelerated" feedback; inventory, partitions and preview; rollup-only warnings; result-cache policy and "Refresh now".
- **Deferred:** `rollup_join`, `rollup_lambda`, `original_sql`, ksqlDB streaming `[R6]`.
- **Deferred:** Cube Store internals — partition and chunk tables, `EXPLAIN ANALYZE`, cache clearing over the Cube Store port `[R6]`.

**Jobs, refresh and scheduling**

- **In:** background refresh-worker status; triggering builds (`POST /v1/pre-aggregations/jobs`) and polling job status; rebuilding selected partitions; the build queue with cancel; query-queue concurrency display; health probes; wechart's own event store for run history, because Cube Core keeps only 24 hours.
- **In:** wechart's scheduler for pre-aggregation builds and cache warm-ups.
- **Deferred:** dashboard delivery on a schedule, and alerts `[R6]`.

**Access control and security**

- **In (read and preview only, phase 1):** viewing access policies (member level, row level, conditions, masking); the security-context inspector and "preview as" a context; member visibility (`public`); API scopes; a banner when Cube would accept unauthenticated requests.
- **Deferred to phase 2:** users, groups, roles and any admin surface for them `[docs/inputs §7]`; wechart's own login and SSO `[R4]`.

**Data sources and connections**

- **In:** the default and named data sources; an add-connection wizard with a Test step; assigning a cube to a data source; driver authentication and TLS settings; concurrency, pool and timeout settings; build connection and export bucket; schema and table browsing; a health history recorded by wechart's own periodic tests.
- Constraint: Cube Core has no production connection-test API, so wechart's server runs the test itself `[research/cube/data-sources.md]`. *Superseded in phase 2: the test runs in xcube, at wechart's request (R20; decisions 1 and 7, `docs/inputs/2026-09-25-architecture-decisions.md`).*

**Configuration and deployment**

- **Deferred:** configuration and topology screens, environment-variable views, logging and telemetry settings `[R6]`. Cube Core needs a restart to change them.

**Cube Cloud-only (unavailable on Core; out of scope unless wechart builds its own)**

- Workbooks and their persistence, Cloud's query builder and chart UI, dashboards-as-code, draft/publish and revision history, server-rendered PNG/PDF export and notifications, AI features, Python analysis, workspace sharing and user management, Excel/Sheets/Slack integrations, audit log, usage analytics, Performance Insights, Query History, hibernation and autoscaling.
- Several of these are **rebuildable from Core APIs**, and where wechart needs them they appear above as wechart features (for example the chart picker, chart configuration, small multiples, the table, dashboard building and controls).

## 7. Non-goals for phase 1

- **Users, groups, roles and SSO** — phase 2 `[docs/inputs §7]`, `[R4]`.
- **AI and chat authoring** — natural-language questions, AI chart generation, AI summaries `[R6]`. *Lifted 2026-10-18 for AI summaries in Text tiles `[R80]` (§P2.6 O); the copilot chat is §P2.6 M.*
- **Scheduled delivery and alerts** — emailing or Slacking dashboards, threshold alerts `[R6]`.
- **Embedding in other applications**, with tokens or white-labelling `[R6]`.
- **Maps and geo charts** `[R6]`.
- **`.dxp` migration tooling** — nothing automated in phase 1. The corpus serves as a parity checklist and as evidence of what analysts do `[R6]`. A `.dxp` **inspection** tool is planned for after phase 1, to size the migration `[R7]`.
- **Spotfire Subsets, Tags and Lists, and data functions** — not phase 1, but the design must not rule them out later `[R7]`.
- **Touch and tablet support** `[R7]`.
- **Spotfire-style controls inside text tiles** (filter dropdowns, buttons and input fields placed in the text) `[R7]`. *Lifted 2026-10-18 for the Text tile's filter controls, parameter controls and action buttons `[R80]` (§P2.6 O); scripts stay out.*
- **Selling or open-sourcing wechart** — not a phase-1 concern `[R1]`.
- Plus everything marked _Deferred_ in §6.

## 8. Open questions

**None.** All 11 were resolved with the user on 2026-09-19 (round R7); the decisions are folded into §4, §6 and §7, and the log is in §9.

Decisions taken in R7:

| #   | Question                          | Decision                                                                                                                                                                                      |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Marking wording                   | Keep Spotfire's strings, including "visualization"                                                                                                                                            |
| 2   | Markings per dashboard            | **Four**, the validated colour slots                                                                                                                                                          |
| 3   | Marked-item cap                   | **1,000**, as in Spotfire's in-database default. "Mark all" is exempt because it stores the tile's filter, not a list                                                                         |
| 4   | Phase-1 marking extras            | **Range-based marking and bookmarks are in.** Touch is dropped                                                                                                                                |
| 5   | `.dxp` features to keep reachable | Subsets, Tags and Lists, and data functions must remain possible later; they are not phase 1                                                                                                  |
| 6   | Text tiles                        | **Keep** Markdown text tiles with live tokens and no raw HTML. Spotfire's in-text controls are not phase 1                                                                                    |
| 7   | Devices                           | **Desktop browsers only**: current Chrome, Edge, Firefox and Safari                                                                                                                           |
| 8   | Design direction                  | **Accepted** for structure, layout and interaction; colours, type and density may still change while building                                                                                 |
| 9   | Calculations for non-SQL analysts | **Quick calculations plus a request flow**: a fixed menu on a measure, each mapping to a Cube multi-stage measure, and anything else becomes a tracked request to the semantic-layer engineer |
| 10  | Phase-2 group ownership           | The **identity provider** owns groups and attributes; they reach Cube through SSO claims, and wechart stores no user records                                                                  |
| 11  | `.dxp` inspection tool            | **Yes, after phase 1**, to size the migration                                                                                                                                                 |

## 9. Interview log

Phase 1's interview log (rounds R1–R10) is in [`docs/requirements-log.md`](./requirements-log.md), word for word (moved 2026-10-17, the user's decision, to keep this file small). Requirements and the spec cite its rounds as `[R1]` … `[R80]`; search that file for the round.

# Part 2 — Phase 2 requirements (2026-09-25)

Written from the phase-2 interview, rounds R11–R17. Its inputs:
- `docs/inputs/2026-09-25-phase-2-security-folders-workspaces.md`, cited as `[P2 input]`;
- `docs/phase-2/backlog.md`, cited as `[backlog]`, which holds what phase 1 moved on.

As in Part 1, every statement traces to a round or an input. Anything undecided is in §P2.8.

**Amended 2026-09-25 by the user's architecture decisions** (`docs/inputs/2026-09-25-architecture-decisions.md`), cited as `[AD n]` for decision n, and by round R27, which settled what they left open.
- Cube plus **xcube**, the Cube-side package in the user's fork (formerly `cube-introspection`), is the semantic service. wechart is its client.
- The architecture is set out in §P2.4, "Architecture".
- Passages the decisions overturn are kept, marked **Superseded** with the decision that replaces them, and followed by what now holds.

**Amended again 2026-09-26 by the final integration plan** (`docs/inputs/2026-09-26-integration-plan-decisions.md`, which supersedes the 2026-09-25 decisions), cited as `[IP n]` for its decision n. The shared plan doc it names is kept as a snapshot (`docs/inputs/2026-09-26-integration-plan.md`), cited as `[plan]`. Round R28 settled what the two left open.
- wechart is the system of record for everything people author and manage. xcube keeps a derived copy of what is published, in its own schema.
- xcube groups cubes that reference each other into **modules** and compiles each on its own. A publish checks only the modules it affects.
- The work is split into the plan's slices 0–8. wechart's side of each goes through these gates.
- Passages the plan overturns are marked **Superseded** in the same way, with `[IP n]`, `[plan]` or `[R28]`.

**Amended again 2026-09-26 by xcube's slice 2 as built** (`docs/inputs/2026-09-26-xcube-slice-2-contract.md`, written from the Cube fork session at the user's request), cited as `[X2]`. Its claims were checked against the fork at commit `83cb9f0888` (`docs/research/xcube-slice-2.md`), and only verified ones are stated here. Round R29 settled what it left open or contradicted.
- xcube serves wechart's model from its own schema, and wechart pushes its published files to xcube. The details are in §P2.4, "Architecture", under "Slice 2 as built".

**Amended again 2026-09-26 by xcube's slice 3 as built** (`docs/inputs/2026-09-26-xcube-slice-3a-contract.md`, cited as `[X3]`, and xcube's answers to wechart's questions about it, `docs/inputs/2026-09-26-xcube-answers-slice-3.md`, cited as `[X3A]`; both written from the Cube fork session at the user's request). Their claims were checked against the fork at `36aedeb6c4` (3a, `docs/research/xcube-slice-3a.md`) and `c0610bb768` (3b and the fixes after it, `docs/research/xcube-slice-3b.md`); only verified ones are stated here. The user's decisions recorded in `[X3]` are cited as `[X3, user]`. Round R30 settled what they left open.
- The shared root keeps its bare names; only items in other folders are prefixed. Nothing stored is migrated.
- wechart publishes **items** (one cube or view each) and its folder tree through xcube's changesets. xcube resolves names and compiles the model in modules. The details are in §P2.4, "Architecture", under "Slice 3 as built".

**Amended again 2026-09-26 by xcube's slices 4–6 as built**, each written from the Cube fork session: the folder gate and RS256 tokens (`docs/inputs/2026-09-26-xcube-slice-4-contract.md`, cited as `[X4]`), overlays (`…-xcube-slice-5-contract.md`, `[X5]`), connections (`…-xcube-slice-6-contract.md`, `[X6]`), the user's driver list (`…-connections-drivers.md`, `[XD]`) and an overlay's own data sources (`…-xcube-overlay-data-sources.md`, `[XOV]`). Their claims were checked against the fork in `docs/research/xcube-slice-4.md`, `xcube-slice-5.md`, `xcube-slice-6.md` and `xcube-overlay-data-sources.md` (at `ed08180c37`, which corrects the other three where they differ); only verified ones are stated here. Decisions the inputs record as the user's are cited as `[X5, user]` and the like, and those recorded in the plan doc as `[X4, plan]`. Round R31 settled what they left open.
- Cube refuses a folder's items to tokens without the folder's groups; tokens are RS256 and admin calls use a service credential; previews run on overlays; data sources are connections in xcube, sealed to its key. The details are in §P2.4, "Architecture", under "Slices 4–6 as built".

## P2.1 Problem

Phase 2 builds on phase 1 from the user's inputs `[R11]`. Phase 1 has no sign-in and one trusted user. It has one Cube model and one data source for everything, and a change to shared content is live at once `[Part 1 §4]`. Phase 2 adds:

- **Sign-in through OIDC/SSO, switchable.** Turned off, wechart runs in single-user mode, as in phase 1 `[P2 input]`.
- **Folder access by AD group**, inherited down the tree, with three roles: Super-Admin, Admin and User `[P2 input]`.
- **Models and data sources as folder items**, under the same access rules. The Model tab goes `[P2 input]`.
- **A private workspace per user.** Creating and editing happen there, and work reaches shared folders only by being copied in and approved `[P2 input, R12]`.
- **Names unique within a folder, not across the whole app.** **Superseded** `[AD 2, AD 3]`: short names are unique within a folder. The model is one flat namespace, in which each name is prefixed by its folder. A short name inside an item is bound when the item is published, nearest first from the item's own folder (§P2.6 D).
- **Everything in the phase-2 backlog** `[R16]`.

## P2.2 Users and roles

**Sign-in.** With security on, every user signs in: Super-Admins, Admins and Users alike. Nothing is reachable without credentials `[R11]`.

**Folder permissions.** A folder can have two optional settings: the AD groups with **read-only** access and the AD groups with **read-write** access `[R11]`.
- An unset setting is inherited from the parent folder, each setting on its own `[R11]`.
- Folders take AD groups only, never individual users `[P2 input]`.

**How far a grant reaches** `[P2 input, R12]`:
- **Down:** a grant on a folder reaches every descendant, read and write alike, even where a descendant sets its own groups. A descendant's own groups are added alongside, never in place.
- **Up:** members of a group granted anywhere see everything in every ancestor folder up to the root (dashboards, charts, models and data sources), view-only.
- **Read-only users see dashboards only**, and the charts on them. That holds in their folder, its descendants and its ancestors. Models, data sources and library charts are hidden from them, while the dashboards they open `[P2 input, R19]` query the cubes their charts were bound to at publish, which Cube's generated policies admit them to `[AD 3, AD 4]`. The "everything in ancestors" above therefore applies to read-write members.
- **A chart on a dashboard they can see opens for them even when it's kept in a folder they can't see.** Nothing names or links that folder `[R27]`.

**Roles** `[P2 input, R12]`:

| Role | Who | What they can do |
|---|---|---|
| **Super-Admin** | Members of one AD group, the Super-Admin group, named in the deployment's configuration `[R18]` | Read-write on every folder, plus every admin surface: Jobs, Schedules, Security, folder permissions and the audit trail. |
| **Admin** | Members of a folder's read-write groups (set or inherited) | Create data sources, models, dashboards and charts in that folder, through their workspace and an approval (§P2.6). Create subfolders under it and set their permissions. Run and schedule builds of the folder's pre-aggregations in Jobs and Schedules `[R18]`. |
| **User** | Members of a folder's read-only groups (set or inherited) | View the dashboards in that folder, its descendants and its ancestors. |

With security on, a deployment that names no Super-Admin group refuses to start and says why, as it does for its other missing sign-in settings: without one, nobody could reach the admin surfaces `[R26]`.

**Workspaces.** Every Super-Admin and every member of any read-write group has a private workspace, which only they can open. Read-only users have none, and only view `[P2 input, R12]`.

**Scale.** Phase 1's figure stands: 500 or more people `[R2, R13]`. One user can belong to hundreds of AD groups, nested groups included `[R12]`.

**Who owns identities.** The identity provider owns users and groups, as decided in R7 (#10). wechart manages no users or groups. It keys each workspace, personal bookmark and audit entry by the user's identity from the provider `[R7, R12, R14]`.

## P2.3 Success metrics

| # | Metric | How it is measured |
|---|---|---|
| S1 | **Zero access leaks** `[R13]` | An automated suite asks every API route and page as users in and out of each group. Nothing outside their permitted folders is ever returned or shown. |
| S2 | **Speed holds with security on** `[R13]` | A signed-in user's 10-chart dashboard, in a folder with its own models, renders in under 3 s at p95 (phase 1's M3), from wechart's own query timings. |
| S3 | **Phase 1 intact with security off** `[R13, R19]` | The full phase-1 end-to-end suite passes in single-user mode. Its editing steps go through the workspace and a self-approved proposal, because security off uses phase 2's flows `[R19]`. **Checked once, at the end of phase 2, not on every task**: phase-2 testing focuses on security `[R13]`. |

- Phase 1's M1–M4 carry over unchanged `[R13]`.
- Folder listing has no budget of its own `[R13]`.

## P2.4 Constraints

**Identity**
- **Any OIDC provider**, configured by issuer, client and the claim that carries groups `[R14]`.
- **Development and tests use one provider**, the lightest self-hosted one research finds, whether Keycloak or something smaller `[R14, R15]`.
- **Production is Microsoft Entra ID, or on-prem AD through an OIDC broker.** That is checked once, at the end of phase 2. Development doesn't test several providers `[R14, R15]`.
- **Group counts:** a user can be in hundreds of groups, nested ones included. Research must show how the chosen sign-in handles that for each provider `[R12]`. The development test uses a user in 20 groups `[R19]`.
- **A sign-in lasts 12 hours**, whatever the activity; there is no idle limit `[R24]`.
- **Requests from another site change nothing.** A request that changes something (POST, PUT, PATCH, DELETE), sent from another site, is refused, whatever cookie it carries `[R25]`.

**Security off.** wechart runs in single-user mode, as in phase 1 `[P2 input]`. Workspaces and approval work as they do with security on, and the one user approves their own copies `[R17]`.

**Data inside cubes.** The signed-in user's AD groups go into Cube's security context, so the model's access policies can filter rows and members by group. For now it's groups only; user attributes come later `[R14]`. That is every query made for a signed-in user;.
- **Superseded** `[AD 1, AD 4, AD 12]`. A signed-in user's queries carry an RS256 token holding their groups only, signed by wechart.
  - **Which groups, and what else** `[IP 8, R28]`. The token carries the user's groups that some access policy names, generated or written in a model. That keeps a user in hundreds of groups inside the request-header limit.
  - It also carries the token's own kind (`role: user`), issuer, audience and expiry. It carries no subject or other attribute of the user.
- What wechart asks Cube or xcube for on its own behalf uses a separate **service credential**: introspection, builds and jobs, system partitions, health, and every xcube admin call `[AD 12, R27]`.
- Compiling belongs to xcube, at publish `[AD 1, AD 6]`, module by module `[IP 4, IP 5]`.
- Cube enforces access too: xcube generates access policies from each folder's allowed groups (below) `[AD 4]`.
- The Security workspace's "Preview as" chooses groups, and previews exactly those `[R27]`.

**Credentials.** Data-source credentials are stored in wechart's metadata database, encrypted to xcube's public key; wechart can never decrypt them, only xcube can `[AD 7]`. They are never shown again, and never sent to the browser. This holds in development and in production `[R14, R15]`.
- **Superseded** `[AD 7]`: no wechart pod holds a decryption key. xcube holds the private key.
- **Superseded** `[AD 7]`: development uses a fixed xcube key pair. Its private half is in xcube's compose environment only, and wechart is given the public half.
- **Superseded** `[AD 7, R27]`: wechart's API refuses to start without xcube's public key. xcube refuses to start without its private key, or with one that can't decrypt a sample credential. Each says which key is missing.
- **A newly typed secret is encrypted in the browser**, before it is sent, so wechart never sees the plaintext, not even for a connection test `[R27]`.
- wechart keeps a credential's lifecycle without decrypting it: copied into a workspace, cleared when the target changes `[AD 7]`.
- Changing where a data source connects (host, account, warehouse and the like) clears its stored secret, so it must be entered again `[R21]`. **Amended** `[X6]`: its TLS settings count too; the keys per driver are under "Slices 4–6 as built".

**Audit.** wechart records sign-ins, permission changes, copies proposed, approved and rejected, and data-source changes. Super-Admins can browse the record `[R14]`. How long records are kept is a deployment setting, one year by default `[R18]`.

**Phase 1's content.** When security is first turned on, everything phase 1 created stays in place as the shared tree, with no groups set. Only Super-Admins see it until they assign groups `[R17]`.

**Cube.** The user's Cube fork may be changed where Cube's own configuration can't meet these requirements. Changes go through the Cube-expert agent, on the fork's branch `[R15]`. They live in xcube's package, and Cube's own code stays unmodified `[AD 1]`.

**Relaxed from phase 1.** Cubes, models, dashboards and data sources must be unique **within a folder** `[P2 input]`.
- **Superseded in part** `[AD 2, R27]`. The whole deployment is one flat model.
- Every cube, view and data source is published under a unique name, prefixed by its folder's id.
- **Superseded again** `[X3, user]`: **the shared root keeps its bare names** (`orders`), and only an item in any other folder is published as `<folderId>__<shortName>` (`f7k2__orders`). Short names never hold `__`, so the two can't collide `[X3; research xcube-slice-3a.md]`.
  - A published name is the bare short name in the root, and `<folderId>__<shortName>` elsewhere `[X3, user]`.
  - **Superseded** `[X3A, R30]`: xcube checks only a folder id's form (`f` and 1–40 lower-case letters and digits; the root `froot`), and wechart allocates the ids. **Each folder stores its xcube id**, allocated when the folder is made and never reused: a folder with a UUID takes `f` plus its 32 hex digits, and any other folder a new id. Stripping an id to its letters and digits would not do, since `ws:a.b` and `ws:ab` would collide `[X3A, R30]`. The id never changes, so renaming or moving a folder changes no name `[X3A]`.
  - **Superseded** `[X3; research]`: xcube gives a folder item a short, stable `sql_alias`, and a pre-aggregation one only where its rollup table's name would be too long. Root items keep their SQL and rollup table names as they were, so nothing is rebuilt `[X3A]`.
  - **Superseded** `[X3, user]`: nothing stored is migrated. Charts, dashboards, markings, bookmarks and links keep naming the root's cubes as they do, so every existing dashboard renders unchanged by construction. A before-and-after comparison of each dashboard's data is kept as a check.

**Architecture** `[AD 1–12, R27; IP 1–9, plan, R28]`
- **Who owns what** `[AD 1]`:
  - **Superseded** `[IP 1, IP 2, plan]`:
    - **wechart is the system of record** for everything people author and manage: folders, cube and view items as written, data-source records, drafts, workspaces, proposals, approvals, the 10-version history, permissions, dashboards, credentials and the audit trail.
    - **xcube keeps a derived runtime copy** of what is published: resolved items, the reference graph, modules and their versions, folder groups and active connections. It lives in xcube's own `xcube` schema, under its own database role, on wechart's Postgres cluster. Neither side reads the other's tables.
    - **The copy can be rebuilt.** If xcube's copy is lost, wechart sends a full snapshot and xcube rebuilds it.
    - **Rules and runtime.** xcube resolves names, groups modules, validates, and generates access policies. Cube Core compiles, plans, runs queries and evaluates access policies, unmodified.
  - wechart owns workflow, folders, permissions, users and groups, dashboards and the UI.
  - Cube never calls wechart at runtime. There are no model callbacks to wechart, and no drafts held in the API's memory.
- **Modules** `[IP 4, plan]`:
  - xcube groups cubes and views that reference each other into modules (the connected components of their references), and compiles and versions each module on its own. Adding or changing a cube recompiles only its module.
  - Shared cubes are copied into each module that uses them.
  - A query spanning modules compiles an on-demand union of them.
  - The field list merges every module's metadata, filtered by the caller's groups.
- **Only YAML models** `[R28]`. Model code runs where xcube decrypts credentials, so xcube accepts only YAML model items, and runs with Node's `require` switched off. A JavaScript, Python or Jinja model file is refused at publish.
- **The work is sliced** as the plan sets out (slices 0–8). Each slice leaves both systems working, and wechart's side of each follows xcube's routes for it `[plan]`.
- **xcube knows the folder tree:** ids and parents, plus each folder's allowed groups. xcube resolves names `[AD 5]`.
- **Each folder's allowed groups** are those granted on the folder, on any ancestor, or on any descendant (whose items use its cubes), plus the Super-Admin group.
  - wechart works the set out and sends it with the tree.
  - A folder no group reaches admits only Super-Admins.
  - With security off, no policies are generated.
  - Row-level policies written in the model still apply inside `[R27]`.
  - **How Cube applies them** `[IP 6, R28]`. xcube checks a query's folders against the token's groups for each request, in addition to the model's own policies, which still apply. The folder check is not a policy ORed with the authored ones. A permission change takes effect in Cube without recompiling any module.
- **Superseded** `[IP 5, plan]`: **every publish validates each module it affects**, in a throwaway compile, and is refused if any of them breaks.
  - A proposal is checked when proposed, as an overlay, and again at approval `[R27]`.
  - Renames, moves and deletes that touch models, data sources or folders holding them are checked the same way, and refused when something would break `[R27]`.
  - A delete or rename of a name that another published item still references is refused, naming those items `[plan]`.
  - A refusal names what broke in folders the publisher can see. Each break comes with its error and its item, and with line and column where xcube can give them `[plan]`. For the rest it says "_n_ items in folders you can't see would break". A Super-Admin sees everything named, and the audit trail records all of it `[R27]`.
- **Unpublished workspace and proposal content** is pushed to xcube as short-lived overlays `[AD 8]`.
  - A workspace overlay is its owner's alone.
  - A proposal overlay may be queried by its author, the target folder's read-write members and Super-Admins until it is approved or rejected, then dropped.
  - Names resolve in the overlay first, then along the target's or origin's folder path `[R27]`.
- **wechart keeps each published version** of its model items, for history, compare and restore. xcube holds only what is published now `[R27]`.
- **Build history:** **Deferred to the next phase** `[R41]`: phase 2 keeps the history of the builds wechart starts. The refresh worker's builds, and what only they supply, come later.
- **Scale:** designed for 100–200 model-bearing folders. **Superseded** `[IP 4, plan]`: thousands of cubes, with modules keeping compile and planning costs flat.
- **Callers:** only wechart's server calls Cube or xcube, for now `[AD 10]`.
- **High availability of the query path:** 2 or more Cube instances with the Cube Store queue, and a stateless wechart API on 2 or more replicas. Cube Store stays single-node for now `[AD 11]`. It is tested: stopping one Cube instance and one API replica during use loses no signed-in session and fails no query the web app retries `[R27]`.
  - Every Cube process runs the plan's runtime settings. These include the Cube Store queue, and a queue heartbeat of 5–10 s, so a crashed instance releases its queries in about 30 s `[IP 9, plan]`.
- **Tokens** carry groups only, for now `[AD 12]`. **Amended** `[X5, user]`: and, on a preview, the id of the overlay it may query.
  - wechart signs them RS256 and pushes its public keys (JWKS) to xcube when it starts and when keys rotate, so Cube verifies them without calling wechart `[AD 12, R27]`. The push goes to an xcube admin route. xcube never fetches keys from wechart `[R28]`.
  - Admin calls use the separate service credential `[AD 12]`. **Until slice 4** they use xcube's static admin token instead (below) `[X2, R29]`.
  - Where xcube's private key and wechart's signing key are kept in production is decided before slice 6 `[plan]`. Until then, development keeps the fixed key pair (above). **Decided** `[X4, plan]`: in Kubernetes Secrets, generated once by the chart.
- **Slice 2 as built** `[X2, R29]`. xcube's side is done in the fork. wechart's side is one cut-over, with no switch between old and new: the previous image and release are the way back `[X2]`.
  - **A model** is one wechart instance's whole data model, named by an id of 1–63 lower-case letters, digits, `_` and `-`, starting with a letter or digit: for example `dev`, `demo`, or the Helm release's name `[X2]`. Folders are paths inside it, never separate models `[X2; research]`.
  - **wechart pushes the whole published file set** to xcube: when the API starts, after each publish, and from a reconcile every 60 s. It reads xcube's current revision first and pushes only when the content differs. It records what xcube acknowledged (its generation, revision and content hash), and commits to its own store before pushing, so xcube is never ahead of wechart `[X2]`.
  - **A publish is checked by xcube's dry run**, in place of the draft Cube compiles today: the merged files, wechart's base context, and a probe for each cube's rollups `[X2]`. Every break in what the publish affects refuses it, a rollup already refused before the change included. No `compare` probe is sent, as IP 5 already has it `[R29]`.
  - **Only YAML files go to xcube** `[R29]`. A JavaScript, Python or Jinja file already in wechart's store stays there, viewable read-only with the reason (AC-140), and is never served. The seed's Jinja sample is rewritten as plain YAML, so its cube keeps working. xcube itself refuses such files unless told otherwise, and it is not `[X2, R28]`.
  - **Query tokens name the model** in a `wechartModel` claim, and the oldest revision the answer may come from in `wechartRevision`, so wechart reads its own writes across Cube instances and its own replicas. A Cube instance that hasn't reached that revision catches up first, or answers 503 to be tried again `[X2]`. In slice 2 tokens are still signed as today; RS256 comes with its own slice `[X2, plan]`.
  - **The model store goes in this cut-over** `[R29]`: the `/api/cube-model/*` routes, the publish-drafts table, the route class Cube used, the store settings and the draft claims. Nothing reads them once xcube serves the model.
  - **Admin calls use xcube's static admin token until slice 4**, which replaces it with the service credential `[X2, R29]`. The token is kept as a secret, at least 32 characters long, and more than one can be configured so it can be rotated `[X2]`. Every other call wechart makes on its own behalf stays as it is until then.
  - **What Cube needs xcube's database for** `[research]`. Cube answers from its active revision without reading the database. It reads the database to catch up to a newer revision, to load a model it doesn't have yet, and to start after a restart. So "Cube keeps answering with wechart and Postgres both down" holds only for requests the active revision already satisfies.
- **Slice 3 as built** `[X3, X3A, R30]`. xcube's side is done in the fork: 3a (folders, items and names) and 3b (modules) `[X3]`. wechart's side moves the model to **items mode** once, then publishes through changesets.
  - **The switch.** wechart sends one items snapshot of today's published model files, each file one root item `[X3]`. A model in items mode never takes a file set again `[X3; research]`.
    - **One cube or view per file** from the switch on `[R30]`. The switch splits any file declaring several into one file each, and the editor then refuses a file declaring a second. Each file is one item, so xcube's errors land on it directly `[X3A]`.
    - **Nothing Cube serves changes for the root's items.** Their names, SQL and rollup tables stay as they were, so no rollup is rebuilt. *(2026-09-28, `[R38]`: until the root's data source is moved to another target, when its cubes take an alias of that connection's identity and their rollups are rebuilt.)* `/v1/meta` gains each cube's `meta.xcube = { folderId, shortName }` `[X3A]`.
    - **The way back** is not in place: the slice-2 image refuses xcube's schema once any 3a or 3b process has started. Since xcube's schema is derived data, the way back is to drop it, re-run the bootstrap, and deploy the slice-2 release, which re-imports its file set as a new generation. This is written into the deployment guide `[X3A, R30]`.
  - **The folder tree** (each folder's xcube id and its parent) is pushed when the API starts and after every folder change. xcube can't give the tree back, so wechart compares the tree's hash with the one the push returns `[X3; research]`.
    - **Workspaces stay out of the tree until slice 5,** which brings overlays. Anything in the tree and published is served `[X3A, R30]`.
  - **A publish goes through xcube's changesets**: items upserted and deleted, on the base revision wechart last recorded. A proposal is checked with the changeset's dry run when it is made `[X3]`. Every break refuses it, as R29 has it.
  - **The reconcile** compares wechart's items hash with the one xcube reports, in place of slice 2's file-set hash `[X3]`.
  - **Charts and dashboards bind their cubes through xcube's resolver** at publish, nearest first from their folder. Other cubes a chart uses are bound through the recorded bindings of the item it starts from, so an override can't break a join `[X3]`.
  - **Deletes and renames.** xcube refuses removing an item another item is bound to, naming them. wechart checks its own charts and dashboards against xcube's items before sending a delete `[X3]`.
  - **People see titles, never full names** `[X3, AC-329]`. A folder item's title comes from its short name, as Cube would make it `[X3A]`.
  - **The field list is Cube's `/v1/meta`**, merged across modules and keyed by the revision header, as slice 2 already reads it. xcube has no field-list route of its own `[X3A]`, so the task that was to read one is folded into the publish task's retest of the field list `[R30]`.
  - **Modules (3b) change nothing wechart sends** `[X3, X3A]`. Queries, the field list and jobs are routed to modules by xcube.
    - *Qualified 2026-09-26 by `docs/research/xcube-slice-3b.md` (Gotchas 3-7).* What wechart sends is unchanged, but what comes back can differ:
      - a query needing a union of modules waits up to 120 s for it to compile, or answers `503` with `Retry-After: 120`;
      - the merged `/v1/meta` orders cubes and numbers `connectedComponent` differently;
      - jobs return one token per module.
    - Today's model is one module, so none of this applies until a root cube is shared by a root item and a folder item, or by two top-level folders.
  - **The image** is xcube's published one, `ghcr.io/senthilkrajagopal/xcube:v1.7.45-<commit>` for amd64 and arm64, pulled by digest (the user, 2026-09-26: "Build against the published image, ghcr.io/senthilkrajagopal/xcube (amd64 and arm64), pulled by digest"). Its titles match Cube's own, and its compile errors name the item with no line `[X3A]`.
  - **Questions to xcube** go as files in `~/Work/xcube-exchange/to-xcube/`, and its answers come back in `to-wechart/`. Anything that changes these requirements also arrives in `docs/inputs/` (the user, 2026-09-26).
- **Slices 4–6 as built** `[X4, X5, X6, XD, XOV, R31]`. xcube's side of each is done in the fork. wechart builds its side of all three against one image.
  - **The image** for slices 4–6 is the one built last *(Q18's rule, kept as xcube builds more: `e53cf2a8b8` from 2026-09-27, T459; research `xcube-22132c309c.md`, `xcube-e53cf2a8b8.md`)*: `ghcr.io/senthilkrajagopal/xcube:v1.7.45-e53cf2a8b8`, pulled by digest `sha256:58e5329448f2962d3b95df9b5542db2b94f9b5783531bd8195d25b8246f1ab58`. It carries slices 4, 5 and 6, the TLS binding and overlay data sources `[R31; research xcube-overlay-data-sources.md]`.
  - **The folder gate (slice 4)** `[X4]`:
    - Each folder push carries every folder's allowed groups, worked out by wechart as R28 has them, and whether security is on. xcube takes each set as given.
    - A folder no group reaches still carries the Super-Admin group, since an empty set admits nobody. A folder sent without its groups keeps them, unless it moved `[X4; research xcube-slice-4.md]`.
    - Cube refuses a folder's cubes and views to a token holding none of its allowed groups, and the model's own policies still apply within. A denied `/v1/load` answers 500 "hidden member", not 403.
    - A permission change reaches every Cube process with no compile: at once on the instance that answers, and on the others by notification or their next poll.
    - **No Super-Admin bypass of authored policies.** Super-Admins get in through the allowed sets wechart sends `[X4, plan]`.
    - **No way back past slice 4 once security is on.** An older image refuses the schema, since it would serve without the gate. The way back is to drop xcube's schema and re-import, as for slice 3 `[X4]`.
    - **A token's groups** are those some access policy names, **and those in any folder's allowed set**. The gate matches the token against the folder sets, so a group only a folder names must still reach Cube `[research xcube-slice-4.md, Gotcha 8; small decision, reported]`.
    - **A publish's dry-run probes, with security on,** carry the Super-Admin group, which every folder admits. Probes a folder refuses would pass without checking anything `[research xcube-slice-4.md, Gotcha 10; small decision, reported]`.
  - **Tokens and keys (slice 4)** `[X4]`:
    - User tokens are RS256, with `aud`, `role: user`, `iat`, `exp` (at most an hour after `iat`), `groups`, `wechartModel`, and `wechartRevision` where read-your-writes needs it. Cube receives only the model, the groups, the revision and the role.
    - wechart pushes its public signing keys to xcube as a whole set with a rising version: at start and on rotation. A rotation pushes the current and next keys, signs with the next only after the push answers, and drops the current once its tokens have expired.
    - **The service credential** is an RS256 token of its own key. It authenticates every xcube admin call, the key push included, the jobs API and introspection. Its public half is given to xcube by configuration, never pushed.
    - A model takes HS256 tokens only until its first key push. The static admin token is retired by unsetting it.
    - **Where keys are kept** (decided before slice 6, above): **Kubernetes Secrets, generated once by the chart** `[X4, plan]`. Development keeps its fixed key pairs in the repository.
    - Jobs and Schedules read the whole field list from xcube's own `…/meta`, with the service credential. Cube's `/cubejs-system/*` is no longer served, so a rollup's partitions come from xcube's partitions route `[X4, X6]`.
  - **Overlays (slice 5)** `[X5, user]`:
    - A query names its overlay in the signed token, as `wechartOverlay`. wechart signs it only into the tokens of those AC-323 allows, so Cube enforces AC-323 once a model has keys. Tokens carry groups **and this one claim**, which is an overlay's id, not an attribute of the user.
    - An overlay is **live**: a changeset applied to whatever is published when it is queried. If a publish leaves it not applying, its queries answer 409 until wechart pushes one that applies.
    - **Rollups are stripped in previews.** The items an overlay adds or changes, everything bound to them and the items those extend compile without their pre-aggregations, so previews read the source. Other items keep their built rollups.
    - **A push that doesn't compile is refused** with each error and its item, and the previous version keeps answering. This is also the proposal's check when it is made.
    - An overlay lives 24 hours from its last push by default, at most 7 days. Autosaves push over the version they last saw, so two saves can't land out of order.
    - Workspace pickers resolve through xcube's resolver with the overlay: its items first, then along the folder's path.
    - **The field list differs per overlay,** so a cached one is keyed by overlay as well as by groups `[research xcube-slice-5.md, Gotcha 18]`.
    - **What lands is what was previewed** `[R31]`. In an overlay, names resolve among its items first, whatever their folder; landed, they resolve nearest-first along each item's path `[research xcube-slice-5.md, Gotcha 5]`. So approval is refused, naming the items, when any item would bind differently than in its preview, as well as when landing fails. Where xcube doesn't report an overlay's bindings, that is asked of it through the Cube-expert agent.
    - **A change published to an item after a workspace copied it** is hidden in that workspace's preview, and approving the copy replaces it. That is accepted for now, as saves already overwrite concurrent changes (the user, earlier: "overwriting concurrent changes is OK for now") `[research xcube-slice-5.md, Gotcha 6]`.
  - **Connections (slice 6)** `[X6, XD]`:
    - **The drivers are eight** (the user, `[XD]`): PostgreSQL, Amazon Redshift, MySQL, Snowflake, BigQuery, SQL Server, Oracle and Dremio. Databricks is dropped. No data source was ever stored, so nothing is migrated `[small decision, reported]`.
    - Redshift takes a user and password (IAM authentication can't differ per connection in Cube 1.7.45). MySQL takes a password or a client certificate. Dremio takes a Cloud URL with a token, or a Software host and port with a token or a user and password `[XD]`. **Dremio Cloud URLs aren't required to be `https:`** `[R31]`.
    - **A secret is bound to its target**, which now includes each driver's TLS settings: `ssl`, `sslRejectUnauthorized` and `sslCa` for PostgreSQL, Redshift and MySQL; `encrypt` and `trustServerCertificate` for SQL Server; `ssl` for Dremio. Changing any of them clears the stored secret, as a host change does (the user's answer on TLS, `[X6]`; research `xcube-overlay-data-sources.md`).
    - xcube opens secrets with keys mounted from a Secret into every Cube process, API instances and the refresh worker alike. wechart checks its key id against xcube's list of credential keys.
    - **wechart lands a data source** in xcube as a connection: its driver, fields and sealed secrets. Every Cube process builds and tests the new driver, then swaps it in, with no restart; a failure keeps the old one. Queries on a dropped connection are refused at once, and one that published cubes use can't be dropped.
    - **A data source's driver never changes.** Cube fixes the SQL dialect at compile, and xcube refuses the change at landing. **wechart refuses it up front**, in the workspace, and a new data source is made under another name instead `[R31]`.
    - **Health** is read per Cube instance. "Every instance uses the new settings" means every instance reports the current version, live. xcube never removes the rows of instances that are gone, so **rows older than 1 hour are hidden** `[R31]`.
    - **A connection test** runs in xcube with Cube's own driver: opening the secrets, building the config, connecting, and reading the catalog where the driver can. Errors come back redacted of the secrets.
    - **Binding at publish:** a cube's data source binds nearest-first from its folder toward the root; a cube naming none gets the nearest `default`; one that extends another inherits its parent's. **No rebinding:** when a nearer data source appears, cubes already published stay bound to theirs until they are published again, and wechart republishes nothing `[X6, R31]`.
    - Each model's rollups live in a schema of the model's own, so they build once more after the upgrade `[X6]`.
    - **The shared root's `default` is seeded at install** `[R31]` by a post-install Job, run from xcube's image. It seals the database password from the chart's Secret with xcube's public key and creates the data source through wechart's API, so wechart never sees the plaintext. From then on it is managed like any other data source.
  - **A workspace's own data sources (slice 6, overlays)** `[XOV]`:
    - Every workspace save pushes the workspace's whole set of data sources with its items (at most 20). Each is pushed as it would land: its folder, short name, driver, authentication method, fields exactly as sealed, and sealed secrets.
    - **A copy keeps its original's full name** (the same folder and short name), so it replaces the original in the workspace's previews for every cube bound to it. Its envelopes are copied byte for byte and open only while its target is unchanged.
    - **Only copies replace** `[R31]`. A data source created new in a workspace can't take a name its target folder already holds, since names are unique per folder.
    - A preview with data sources of its own runs on an orchestrator of its own, with its own drivers and result cache, and builds no rollups.
  - **Saves while xcube is unreachable.** A chart or dashboard save in a folder xcube serves is refused (502), as a model publish is; nothing is stored unbound `[R31]`.

## P2.5 Stack

**Decided.** Phase 1's stack stands `[Part 1 §5]`. To it phase 2 adds:
- credentials encrypted in the metadata database `[R14, R15]`, to xcube's public key `[AD 7]`;
- changes to the Cube fork where needed, through the Cube-expert agent `[R15]`, in xcube's package `[AD 1]`;
- Cube plus xcube as the semantic service, with wechart as its client `[AD 1]`;
- RS256 user tokens with their public keys pushed to xcube, and a separate service credential for admin calls `[AD 12, R27]`, with xcube's static admin token in its place until slice 4 `[X2, R29]`;
- **Superseded** `[X3A, the user]`: xcube's published image `ghcr.io/senthilkrajagopal/xcube:v1.7.45-c0610bb768` (3a, 3b and the fixes after them), pulled by digest, as the Cube image for every Cube process;
- `jose` 6.2.12 to sign tokens in wechart's API, and `hpke` 1.1.7 (RFC 9180) to encrypt credentials to xcube's public key in the browser `[R28]`.

**Decided after research** (these were the open items; the user chose on 2026-09-25, rounds R20–R22)

| Item | Decision | Research |
|---|---|---|
| **How sign-in is built** | **wechart's API is its own OIDC client** (openid-client 6.8.8), with a server-side session in the metadata database (@fastify/session 11.1.3 with @fastify/cookie 11.1.2). Not oauth2-proxy `[R20]`. | `docs/research/openid-client.md`; compared with `docs/research/oauth2-proxy.md` |
| **Development OIDC provider** | **Dex 2.45.1**, with users and groups from its config file `[R20]`. | `docs/research/dex.md`; compared with `docs/research/keycloak.md` and `docs/research/authelia.md` |
| **Per-folder models in Cube** | **Superseded** `[AD 1, AD 2, AD 5]`: one flat model owned by Cube and xcube, under folder-prefixed names. xcube resolves names and runs connections. **Then** `[IP 1–4]`: one flat namespace, compiled as modules. wechart is the system of record, and xcube keeps the derived copy. | `docs/research/cube/per-folder-models.md` (superseded); `cube/xcube-runtime.md`, `cube/prefixed-names.md`, `cube/whole-model-publish.md` |
| **How credentials are encrypted** | **Superseded** `[AD 7]`: encrypted to xcube's public key, in the browser `[R27]`, with HPKE through `hpke` 1.1.7 `[R28]`. | `docs/research/credential-encryption.md` (superseded); `docs/research/credential-sealing.md` |
| **How tokens are signed** | RS256 through `jose` 6.2.12, keys pushed to xcube, and a separate service credential `[AD 12, R27, R28]`. | `docs/research/cube/tokens-and-service-credential.md` |
| **Where a connection test runs** | **In Cube, at wechart's request:** an xcube route runs Cube's own drivers, so a pass means the Cube that will use the source can connect. wechart starts it and shows each check `[R20, AD 1]`. wechart sends only the ciphertext, and xcube decrypts `[AD 7]`. | `docs/research/connection-testing.md` |

## P2.6 Scope

**A. Sign-in and security** `[P2 input, R11, R14, R15]`
- OIDC sign-in, switchable, with single-user mode when it's off.
- Groups passed to Cube's security context.
- The audit trail.

**B. Folder permissions and roles** `[P2 input, R11, R12]`
- Read-only and read-write group settings per folder, each inherited on its own when unset.
- Reach down and up, as in §P2.2.
- The three roles.
- Read-write members create subfolders and set their permissions directly `[R12, R17]`.

**C. Folders hold everything** `[P2 input]`
- Dashboards, charts, models and data sources are all folder items.
- The Model tab goes. Models open from the folder view.
- The Data sources tab stays, listing every data source the user can see across folders, each with its folder `[R19]`.

**D. Names and resolution** `[P2 input, R17]`
- Cube, model, dashboard and data-source names are unique within a folder.

**Superseded** `[AD 2, AD 3, R27]`. Names and resolution now:
- **Bound at publish.** A short name inside an item (a cube a chart or dashboard uses, a join target, a `data_source`) is resolved when the item is published. The search runs nearest first, from the item's **own** folder up to the root, and the full prefixed name is stored `[AD 3]`.
  - xcube does the resolving `[AD 5]`.
  - A name found nowhere on that path is refused at publish, naming it `[R27]`.
  - Children's items are never used, and there is no fallback to descendant folders `[R27]`.
- **Overriding.** A child folder overrides a name by publishing its own item. Binding from the viewer's folder is dropped `[AD 3]`.
- **Superseded** `[IP 3, plan, R28]`: **no rebinding.**
  - Each item keeps the binding it was published with. When a nearer definition is published, an item beneath it binds to it only when that item is next published.
  - Deleting or renaming a name that another published item still references is refused, naming those items.
- **Path only.** An item uses only the cubes found on its own folder path, and the chart editor lists only those. A cube elsewhere is reached by publishing an item in a folder beneath it `[R27]`.
- **Prefixes are built from folder ids**, so renaming or moving a folder keeps names, references, pre-aggregations and links. People see titles in the UI; the prefixed name shows only in YAML and SQL `[R27]`.
  - The picker shows each cube's title with its folder path beside it `[plan]`.
  - The name's form and the folder id's are set out in §P2.4, "Relaxed from phase 1" `[IP 3, R28]`.
- **Superseded again** `[X3, user]`: **the shared root has no prefix**, and nothing stored is migrated, as R27 had it. Every existing dashboard renders unchanged by construction.
- **A cube that names no data source** uses one called `default`, bound at publish like any other name `[R22, AD 3]`. The deployment's own default connection is a data source named `default` in the shared root, stored and managed like any other; the Helm values seed it on install `[R27]`.

**E. Workspaces, copying and approval** `[P2 input, R12, R17]`

*Getting work into a workspace:*
- Work starts in the workspace. A dashboard, model or data source is copied in from a folder; a dashboard alone is enough when only it changes.
- A copied dashboard brings the folder charts it uses with it (library charts) `[R18]`.
- A copied data source keeps its credentials, encrypted and never shown.
- A workspace item resolves cubes in the workspace first, then along the path of the folder it was copied from. A new item names its target folder when it's created.
- Workspace and proposal content reaches Cube as xcube overlays, which only the people in §P2.4's Architecture may query `[AD 8, R27]`.

*Getting work back out:*
- Copying into a shared folder is a **proposal**, with an optional description of up to 1,000 characters.
- A dashboard whose cubes resolve only through models in the author's workspace goes into the folder together with those models, as one proposal approved together `[R18]`.
- **Every proposal is approved before it lands.** The author may approve their own, with security on or off, and so may another read-write member of the folder, or a Super-Admin. The step is never skipped `[R12, R17, R18]`.
- The approver reviews the proposed item and its description.
- A rejected proposal goes back to the author's workspace unchanged, with the approver's reason (optional, up to 1,000 characters). The folder is untouched `[R18]`.
- While a proposal waits, the folder's readers see the old version. The folder's read-write members see a Reviews list with a count in the app, and that is the only notice `[R12]`.
- An approved item replaces a same-named item in the folder. The **last 10 versions** are kept and can be restored `[R17]`.
  - History always lists the current version, tagged Current, with View and no restore (R76). Where no version was kept, View opens the item as it is now ("View opens it as now (Recommended)", 2026-10-17, `[R78]`).

*What needs no approval:* creating subfolders, setting permissions, renaming, moving and deleting are direct for read-write members `[R17]`. Where they touch models, data sources or folders holding them, they apply only if every module they affect still compiles `[R27; IP 5]`.

*Every proposal* is checked against every module it affects when it is proposed, and again at approval. An approval that would break anything is refused `[AD 6, R27; IP 5]`.

**F. Bookmarks** `[R12]`
- Personal to each user by default.
- A user can share a bookmark with everyone who can see the dashboard.

**G. Data sources: all of backlog F18, per folder** `[R16]`
- A list per folder, with each source's health.
- Adding a source with a connection test, run by Cube's own drivers at wechart's request `[R20]`, in xcube, which alone decrypts the credential `[AD 1, AD 7]`.
- The six driver types, each with its own authentication.
- whether every Cube instance has picked the change up `[AD 11]`. No change needs a restart: xcube swaps the connection's driver while queries run. A change of database type lands as a publish, because the SQL dialect is fixed at compile `[plan]`.
- Test history.
- Credentials never shown.

**H. The rest of the phase-2 backlog** `[R16, backlog]`
- Quick calculations (F6).
- Scheduling and build history (F17).
- The markings refinements and keyboard gaps (AC-093, AC-097, AC-104, AC-116, AC-176).
- The country map and box plot (R8), and the UI review's eight proposed spec changes. The box plot's whisker rule is a chart option. It defaults to Tukey's 1.5 × IQR, with values beyond drawn as dots, and the other choice is the minimum and maximum `[R19]`.
  - **Box plot observations.** An "Each point is" setting chooses what one observation is (for example Order ID); the measure is computed per observation and the boxes summarise those values `[R22]`.
  - **Box plot over Cube's row limit.** The boxes are computed from the rows Cube returned, with a warning "computed from _n_ of _N_ rows" `[R21]`.
  - **Box plot statistics** (Claude's call under the standing instruction for small decisions, following the research): quartiles and median by linear interpolation (Hyndman–Fan type 7, the default of R, NumPy, PostgreSQL `percentile_cont` and ECharts). Tukey whiskers end at the most extreme value inside 1.5 × IQR.
  - **Country map offered** when every value of the dimension is an ISO 3166-1 alpha-3 code. The model author can also mark a dimension as a country code, or as not one, to override that `[R22]`.
  - **Country map detail:** Natural Earth 1:50m admin-0 boundaries (242 units, small states such as Singapore included) `[R22]`.
- The UI fixes: AC-187's style mismatches, the failing cases of AC-201, AC-220 and AC-246, and Edge (AC-180).

**I. Deleting, clearing and finding** `[R48]` *(added 2026-09-30; its questions settled the same day, §P2.8)*
- **Deleting one item only when nothing depends on it.** Otherwise the delete is refused, naming what depends on it:
  - **a chart**, when no dashboard uses it. This replaces phase 1's "name the dashboards and confirm", which deleted it anyway (AC-023) `[R48-1]`;
  - **a dashboard**, which nothing depends on;
  - **a data source**, when no cube depends on it;
  - **a cube**, when nothing depends on it: no view uses it, no other cube joins to it, and no chart or dashboard is bound to it `[R48-2]`;
  - **a folder**, only when it is empty: no subfolders, dashboards, charts, models or data sources `[R48-3]`.
- **Clearing My workspace:** one action removes every item in it. Its confirmation names any open proposals, and clearing withdraws them too `[R48-4]`.
- **A folder per edit.** Each "Edit in my workspace" creates one folder in My workspace, named `project-YYYY-MM-DD-HHmm` in the user's time (for example `project-2026-09-30-1430`). It holds the copy and everything copied with it: the library charts' copies and the data sources chosen `[R48-5]`.
  - A new item made in My workspace gets no project folder: it is made where the user makes it, as now `[R48-5b]`.
- **Folder descriptions.** Folders get a description, shown under the folder's name in Explore and editable. A project folder's is prefilled with what is being edited and where from, for example "Editing Revenue overview from Sales / EMEA" `[R48-6]`.
- **Filtering Explore by kind.** Over the open folder's contents: All (the default), Dashboards and charts, Data sources, or Models. The folder tree stays as it is `[R48-7]`.
- *Claude's calls, under the standing instruction for small decisions:*
  - A second project folder in the same minute is named with `-2`, then `-3`, since names are unique in a folder.
  - A folder's description holds up to 1,000 characters, as a proposal's does.
  - Under a kind filter, the open folder's subfolders stay listed, so they can still be opened from the list.

**J. The SQL runner** `[R50]` *(added 2026-10-01; research `docs/research/sql-runner.md`; its questions settled the same day, §P2.8)*
- **What it is.** Read-only SQL run on a data source's own connection, as Cube Cloud's SQL Runner does, through a guarded xcube admin route `[R50]`. Only xcube opens a data source's sealed secret, so only xcube runs the SQL `[AD 7]`, at the request of wechart's server, which decides who may and records it `[AD 10]`. It is raw SQL on the database's tables, not Cube's semantic SQL API: it bypasses the folder gate and every access policy, which the page says plainly (research §5 S3).
- **Who may run it** `[R50-1]`: Super-Admins, and the read-write members of the data source's own folder (not members who see it only as an ancestor's), on a data source a Super-Admin has switched the runner on for. Off by default.
- **Which credential** `[R50-2]`: the data source's own serving credential, with the Super-Admin who switches the runner on attesting that it is read-only. A separate read-only login per data source is for phase 3.
  - **Superseded** `[R78]`: the read-only login per data source is brought into scope, to be specified later (§P2.6 M).
- **Read-only, enforced in layers** `[R50-2, R50-4]`:
  - **Only SELECT and EXPLAIN run**: a statement must parse as a single `SELECT` (or `WITH … SELECT`) or an `EXPLAIN` without `ANALYZE`. Everything else is refused before it runs: INSERT, UPDATE, DELETE, MERGE, CREATE TABLE or VIEW, `SELECT … INTO`, `SELECT … FOR UPDATE`, and a `WITH` holding a write.
  - **One statement per run**, so nothing can end the transaction around it.
  - **A read-only transaction** where the database has one: PostgreSQL, Redshift, MySQL and Oracle. It also stops a SELECT that calls a writing function.
  - **BigQuery's dry run** classifies the statement first.
  - What remains (research §5 S2): on Snowflake, SQL Server and Dremio, a SELECT calling a function that writes passes the parse; only a SELECT-only login closes that, in phase 3.
- **What it runs on** `[R50-3]`: data sources landed in folders; the user's own data sources in My workspace (copies and new ones); and Cube Store, read-only.
  - **A workspace data source** may always be run on by its owner `[R50-6]`.
  - **Cube Store** has the same kind of switch, which a Super-Admin turns on. Then those who may run SQL on some data source may run read-only SQL on Cube Store, which holds every folder's rollups `[R50-5]`.
- **Caps per run** `[R50-7 … R50-10]`:
  - at most **10,000 rows**, said as "limited to 10,000 rows" when there were more;
  - at most **30 seconds**, stopped on the database's side;
  - **one run at a time per user**;
  - at most **10 MB** of results, marked truncated beyond.
- **Results** `[R50-11]`: a grid with the row count, duration and column types, and a **CSV download** of up to the row cap.
- **History** `[R50-12]`: each user sees their own past runs, kept in wechart.
- **Audit** `[R50-13]`: every run is an audit event: who, which data source and folder, when, the outcome, the row count and the duration, with the SQL, its literals redacted.
- **Where** `[R50-14]`: a tab on each data source's page, in Explore and in Data sources, beside its settings, test and history.
  - **Superseded** `[R78]`: the runner moves into its own workspace, "SQL runner" (§P2.6 L). The data source's page keeps a tab named "SQL runner" holding only the switch and "Open in SQL runner".
- *Claude's calls, under the standing instruction for small decisions:*
  - **With security off,** the single user holds every permission, as a Super-Admin does (AC-254), so the runner is offered to them on any data source switched on.
  - **The attestation** is part of switching the runner on: the Super-Admin confirms the credential is read-only, and the switch records who confirmed it and when.
  - **While a run is going,** Run is held back, and its user may cancel it. Cancelling stops the statement on the database.
  - **A CSV holds the rows the run returned.** The query isn't run again, unlike Superset's export.
  - **Cube Store is listed** as one more entry in the root's data sources, only for those who may run SQL on it.
  - **Run history is kept as long as audit records are** (a deployment setting, one year by default, R18-6), and only its user sees it.
- **Design 15, approved 2026-10-01** `[R51]`, with all five proposals and the answers to its nine questions:
  - **While the runner is off,** the SQL tab shows a panel saying so, to Super-Admins (with Turn on…) and to the folder's own read-write members, and to nobody else. Never a greyed-out tab (P1).
  - **The editor** is the app's CodeMirror in SQL mode (P2). With text selected, ⌘/Ctrl+Enter runs the selection, and Run reads "Run selection" (Q1).
  - **A schema browser** sits beside the editor: schemas, tables and columns with their types, from xcube's introspection routes (P3).
  - **The switch:**
    - turning it on or off is an audit event, with the confirmation given (P4);
    - a later approved change to how the data source signs in (its user, host or password) turns it off until a Super-Admin confirms again (Q4).
  - **Cube Store:**
    - It is switched on from the Data sources page's header ⋯ while it's off (P5).
    - Its confirmation is that everyone allowed may read every folder's rollups, with wechart's SELECT/EXPLAIN check the only guard (Q9).
    - Those allowed are Super-Admins and those allowed on a data source in a switched-on folder. A My workspace owner doesn't count (Q7).
    - It runs SELECT and EXPLAIN only: Cube Store 1.7.45 has no SHOW TABLES or DESCRIBE, and its other SHOW statements return every row uncapped (xcube's answer).
  - **A My workspace copy whose database, user or role differs from its original's** needs a Super-Admin's switch, like a shared data source. Unchanged copies, and data sources made new there, stay always open to their owner (Q8, refining R50-6).
  - **Results:**
    - columns are headed by the database's own type names (Q5);
    - rows that arrived before a run was stopped at 30 seconds, or cancelled, are shown, marked as cut (Q6).
  - **My runs** shows this data source's runs by default, with All, newest first, 50 at a time (Q2).
    - **Superseded** `[R78]`: in the workspace, History lists all of a user's runs by default, each naming its data source and folder, with a "This data source" filter (§P2.6 L).
  - **The warning** is always shown above the editor, and can't be hidden (Q3).
- **Superseded in part** `[R78]`: the editor, the schema browser, the results and My runs move into the SQL runner workspace (§P2.6 L). With nothing selected, ⌘/Ctrl+Enter runs the statement at the cursor, not the whole text. The safety rules above (the switch, SELECT and EXPLAIN only, the read-only transaction, the caps, one run per user, the audit, the warning) are unchanged.

**K. The MCP server** `[R78]` *(added 2026-10-17; input `docs/inputs/2026-10-17-mcp-server.md`; research `docs/research/mcp-typescript-sdk.md`; its open questions are in §P2.8)*
- **What it is.** A server speaking the Model Context Protocol, so that Claude Code and other LLM clients can work in wechart: "manage datasources, dashboards, cubes, approval and review flows and anything else that i missed out" `[docs/inputs/2026-10-17-mcp-server.md]`. The first release takes the operations below `[R78]`.
- **Order.** The MCP server and the SQL runner workspace come first; the copilot and the ask shortcut wait `[R78]`.
- **Signing in: personal access tokens** `[R78]`. Each user creates a scoped, expiring, revocable access token in wechart. A client using it acts as that user, with that user's own folder permissions. Signing in through OAuth (the research's options A and B) was not chosen.
- **Clients on day one** `[R78]`: Claude Code, and Claude.ai and Claude Desktop custom connectors.
  - Claude.ai and Desktop connectors call from Anthropic's cloud, so `/mcp` must be reachable from the public internet (research, "Remote support by client"). How it is exposed was settled in R78-7, below.
  - Both client kinds accept a fixed credential that they send on every request (research, option C).
  - **Superseded** `[R78]` ("Defer Claude.ai", 2026-10-17): **day one is Claude Code only.** Claude.ai and Desktop move to §P2.6 M, deferred. On Team and Enterprise plans an organisation Owner enters the connector's token once and Claude sends it for every member, so the calls couldn't act as each member, as personal tokens must (`docs/research/mcp-deployment-and-tokens.md`, finding 1). Claude Code connects from the user's own machine, inside the enterprise network (same research).
- **Operations in the first release** `[R78]`:
  - **read and explore;**
  - **edit in My workspace;**
  - **proposals and jobs.**
  - Data sources were not chosen, so the MCP server doesn't create, change, test or delete them.
- **Never approve or reject** a proposal `[R78]`.
- **What the MCP specification asks of a server**, taken in as requirements (research, "Transports", "Authorization" and "Gotchas"):
  - one endpoint, `/mcp`, over Streamable HTTP at the 2026-07-28 revision, with the SDK's stateless fallback for 2025-era clients;
  - tool calls rate-limited: servers "MUST … Rate limit tool invocations" (Gotcha 9). How, and the numbers, were settled in R78-5, below. Whatever is chosen, a request over the limit must be answered 429: wechart's global error handler today turns the limiter's 429 into a 500 (the coordinator, from `docs/research/fastify-rate-limit.md`, 2026-10-17);
  - the `Origin` header validated on every request, and the `Host` header checked, since wechart mounts the handler in its own Fastify app (Gotchas 3 and 4);
  - the token accepted only in the `Authorization` header, never in the query string (the spec), and the web app's session cookie not accepted on `/mcp` (Gotcha 6, a design inference);
  - tool outputs treated as untrusted data: titles, descriptions, markdown and query rows are written by users and reach the model (Gotcha 12).
- *The coordinator's calls (2026-10-17), overturnable:*
  - **The audit marks MCP actions.** Each event AC-294 records says when it was done through MCP, and names the token. Making and revoking a token are audit events too. Every MCP tool call is also audited (R78-9, below).
  - **A token is shown once,** when it is made, and wechart keeps only what is needed to check it (the handoff's research item "personal-token hashing and storage").
  - **A token works only on `/mcp`,** not on the web app's API.
- **Settled 2026-10-17** `[R78]` (§P2.8, R78-1 … R78-11):
  - **A token's lifetime:** its owner picks 7, 30 or 90 days, 30 by default, and none lasts longer than 90 (R78-1).
  - **Scopes:** three fixed ones, read, workspace-edit, and proposals-and-jobs. Read is always included (R78-2).
  - **Groups:** a token's calls use the groups of its owner's latest web sign-in (R78-3).
  - **Super-Admins** may list and revoke any user's tokens (R78-4).
  - **Rate limiting** (R78-5; research `docs/research/fastify-rate-limit.md`):
    - counted in a Postgres store on wechart-meta, so it is exact and shared across API replicas;
    - per token, with every MCP call counting;
    - 60 calls a minute, as a deployment setting;
    - closed when the store fails: nothing runs;
    - traffic with a bad or missing token limited per IP, 20 a minute by default, changeable per deployment ("20 per minute (Recommended)", 2026-10-17);
    - over the limit, a 429 with `Retry-After`.
  - **Output caps** (R78-6): a tool returns at most 1,000 rows and under 50,000 characters, says when it was cut, and offers the next page.
  - **Exposure** (R78-7): a separate host serving only `/mcp`, over TLS, allow-listed to Anthropic's published IP ranges and the enterprise network, set as Helm values.
    - **Superseded in part** `[R78]` (2026-10-17): with Claude.ai deferred, the allow-list covers the enterprise network only. Anthropic's outbound range, `160.79.104.0/21` (`docs/research/mcp-deployment-and-tokens.md`), stays a documented Helm value, off by default, for later.
    - **The route** ("Gateway API (Recommended)", 2026-10-17): the Helm chart has no ingress and ingress-nginx is retired (same research), so `/mcp` is exposed by a Gateway API HTTPRoute attached to a Gateway the deployment names. Which Gateway implementation is still being researched.
  - **Jobs** (R78-8): jobs, builds and schedules listed as the owner may see them, with Run now and Cancel as the owner may use them in the UI, and no schedule edits.
  - **Audit** (R78-9): every MCP tool call, reads included, is recorded with who, the token, the tool and the outcome, and no argument values.
  - **Sign-in off** (R78-10): tokens work, acting as the single user.
  - **No SQL runner** through MCP in the first release (R78-11).

**L. The SQL runner workspace** `[R78]` *(added 2026-10-17; input `docs/inputs/2026-10-17-sql-runner-and-ask-key.md`; design study `docs/design/references-sql-runner.md`; extends §P2.6 J)*
- **Its own workspace.** "a seperate tab.. next to jobs, schedules called SQL runner that lets you see and select the datasource, introspect the datasource see the tables, columns.. check superset for the experience" `[docs/inputs/2026-10-17-sql-runner-and-ask-key.md]`. It follows the design study's direction: a data source picker and schema browser on the left, tabs bound to a data source in the centre, Saved and History on the right `[R78]`.
- **Every safety rule of §P2.6 J stands,** per run: the switch and its confirmation, SELECT and EXPLAIN only, the read-only transaction, the caps, one run per user, the audit and the warning (design study, "Reasoning").
- **Typed parameters** `[R78]`: `{{name}}`, typed Text, Number, Date or Boolean, filled in a strip under the editor and bound as database parameters, never written into the SQL text.
- **Cube's semantic SQL API** in the runner, as a separate "Cube" group in the picker `[R78]`. It runs through Cube with the user's folder access and policies, so it has no bypass warning (design study Q13a).
- **Keyboard** `[R78]`, approved under R75: run the statement at the cursor; Save and Find; autocomplete from the introspected catalog; tab shortcuts. The tab shortcuts are Ctrl+Q for a new tab and Ctrl+Alt+[ and Ctrl+Alt+] for the previous and next tab; a tab closes with its × button only (R78-12).
- **Tabs are kept in the browser only** `[R78]`.
- **Saved queries, personal only** `[docs/inputs/2026-10-17-sql-runner-and-ask-key.md]`: "saved queries (no sharing)".
- **Making a cube or a chart from a run's results** `[docs/inputs/2026-10-17-sql-runner-and-ask-key.md]`. Both land as drafts in My workspace (design study §6, F29).
- **The design study's other questions take its recommended answers** `[R78]`. They are the coordinator's call, overturnable:
  - no optional clauses;
  - parameters stand for values only, never a table or column name;
  - no snippets;
  - parameter values kept in History and saved queries for their owner only, with the audit keeping the names only;
  - Make a cube writes the run's parameter values into its SQL as literals;
  - Make a chart starts with the new cube chosen and nothing placed;
  - History shows all of a user's runs by default;
  - saved queries appear in ⌘K for their owner;
  - the data source's page keeps a "SQL runner" tab with the switch and "Open in SQL runner";
  - the workspace is shown to Super-Admins and read-write members;
  - CSV only, with no copy to the clipboard;
  - no "Open in SQL runner" from a chart's View SQL;
  - "Preview 100 rows" only on request, as an ordinary, audited run.
- **Settled 2026-10-17** `[R78]` (§P2.8, R78-12 … R78-15):
  - **The "Cube" group** (R78-13) is shown to everyone who sees the workspace, with no switch. R50's caps apply, each run is audited as a SQL run marked "Cube" and listed in History, and Make a cube and Make a chart aren't offered on it.
  - **Parameters on Cube Store and in the "Cube" group** (R78-14) are offered only where research shows the source binds them. Elsewhere Run is held, saying parameters aren't available there.
    - **Dremio too** ("Hold Run, say why (Recommended)", 2026-10-17). The research binds values on PostgreSQL, Redshift, MySQL, Snowflake, BigQuery, SQL Server and Oracle, and on none of Dremio, Cube Store and Cube's SQL API (`docs/research/sql-parameter-binding.md`). On those three, a SQL holding a parameter isn't run, and Run says why.
  - **Binding needs xcube** (`docs/research/sql-parameter-binding.md`): xcube's run route takes no values today. The change has been asked of the Cube-expert session (`to-xcube/2026-10-17-1900-sql-run-bound-parameters.md`).
  - *The coordinator's call, overturnable:* a parameter is written `{{ name }}`, with optional spaces inside the braces. Its name matches `[A-Za-z_][A-Za-z0-9_]*` and is case-sensitive.
  - **A saved query's name** (R78-15) is required, unique among its owner's saved queries, and at most 100 characters. Its description is optional, at most 1,000 characters.

**M. Brought into scope by R78, to be specified later** `[R78]`
- The copilot (chat) panel, editing in My workspace, with a Super-Admin setting the provider, models and keys globally `[docs/inputs/2026-10-17-copilot-chat.md]`. It lifts phase 1's non-goal "AI and chat authoring" when it is taken up.
- The ask shortcut, read as ⌘J / Ctrl+J, opening the copilot `[docs/inputs/2026-10-17-sql-runner-and-ask-key.md]`.
- **Claude.ai and Claude Desktop as MCP clients**, deferred ("Defer Claude.ai", 2026-10-17). On Team and Enterprise plans a connector's token is entered once by an organisation Owner and sent for every member, so the calls would all act as the token's owner rather than each member (`docs/research/mcp-deployment-and-tokens.md`, finding 1). Taking them up needs a sign-in that acts per member, such as OAuth.
- A read-only login per data source.
- The refresh worker's build history `[R41]`.
- xcube's slice 7.
- The phase 3 keyboard items (backlog §7).
- The four Northwind demo bugs: colours past 8 series, marked pivot overflow, pivot column order, and the single-level treemap.

No criteria are written for these yet. Each gets its own questions where it is open.

**N. The compact dashboard header** `[R79]` *(added 2026-10-17; input `docs/inputs/2026-10-17-compact-dashboard-header.md`; design study `docs/design/references-compact-header.md`; design 19, approved the same day)*
- **The problem,** in the user's words: "nearly 30% of the page goes away for the dashboard header and the filters. Can we have a more compressed header that can be expanded with a slide down so that the complete header can be seen... default will be the compressed header" `[docs/inputs/2026-10-17-compact-dashboard-header.md]`. Measured from the CSS, the chrome above the tiles is 274 px, 30.4 % of 1,440 × 900 (the study's §1).
- **Compact by default:** one 48 px row holding the way back to the folder, the title, the page tabs, a summary of what's marked or cross-filtered, the actions as today, and a Filters toggle with the count of filters set, last. With the app bar, 96 px of chrome at 1,440 × 900 (design 19) `[R79]`.
- **Expanded by the toggle:** a sheet slides down under the row holding the description, the ownership line and today's filter bar, unchanged. It **pushes the tiles down** and never covers them ("Push down (Recommended)") `[R79]`.
- **Closing:** the toggle, or Esc with focus in the header, innermost first, ahead of the dashboard's own Esc; a click on the tiles doesn't close it (19-Q10) `[R79]`.
- **Motion:** the height only, 200 ms opening and 150 ms closing; none under reduced motion (design 19; the study's Fluent 2 tokens).
- **Never remembered:** every opening starts compact; the choice lasts the visit, across page tabs, bookmarks, refreshes and edit mode, and is stored nowhere ("No, always start compact (Recommended)") `[R79]`.
- **Feedback while compact:** a filter, marking or cross-filter change shows in the toggle's count or a compact chip, the count is highlighted for 2 s, and the change is announced once, politely; the sheet never opens by itself ("Highlight + announce (Recommended)") `[R79]`.
- **Design 19's other questions take its drawn answers** ("Approve (Recommended)") `[R79]`: the sheet open and no toggle in edit mode (19-Q3); the title at `text-lg` (19-Q4); page tabs that don't fit behind "More ▾" in view mode (19-Q5); many filters wrap (19-Q7); the My workspace band unchanged (19-Q8); a one-step "← ‹folder›" way back (19-Q9).
- **Narrow widths** as design 19 state D draws them: History and Bookmarks as icons from 1,024 to 1,279 px; below 1,024 px the row keeps the way back, the title, the toggle and ⋯, with the pages in a "Page: ‹name› ▾" menu.

**O. Combo charts, the Text tile, dashboard parameters and AI summaries** `[R80]` *(added 2026-10-18, a priority from phase 3; input `docs/inputs/2026-10-18-phase-3-advanced-analytics.md`; studies `docs/design/references-combo-and-rich-tiles.md` and `docs/design/references-spotfire-combo-textarea.md`; research `docs/research/rich-tiles-and-combo-tech.md` and `docs/research/llm-providers.md`; designs 20–22, approved the same day, "Approve (Recommended)")*
- **The request,** in the user's words: "let us work on combo charts and rich text charts... make it modern.. use the best technologies available. start working on this on priority..use ui/visualization/bi expert as well as spotfire expert." `[R80]`
- **Combo charts** (design 20):
  - each measure its own series, with its own mark (bar, line, area or point) and value axis (left or right), set in Customize › Series, the Metrics pill's menu and, in the chart editor only, the legend (20-Q5) `[R80]`;
  - **two value axes at most**, left and right ("2: left and right (Recommended)"); a second axis only by the author's explicit choice, never by Auto or the recommender (AC-030 holds); when drawn, zero and ticks aligned, each axis titled with its measures' mark glyphs `[R80]`;
  - **Synchronize axes**, offered only when both axes share a format (20-Q12); **log scale** per axis, the same on both, unavailable with bars (20-Q3); **reference lines and bands**, horizontal and vertical, labelled in the chart, from a fixed value or a drawn series' average, median, minimum or maximum, no set limit (20-Q7 … 20-Q9); stacking chart-wide, never across axes (20-Q11) `[R80]`;
  - **split by one dimension across every measure** ("One dimension, all measures"): series are measure × member, colour the member, each split measure its own mark (20-Q1); **at most 8 series**, folding members to the top *k* + Other first, then leaving whole measures not drawn (20-Q2) `[R80]`;
  - **the AC-218 warning** only while two unsynchronized axes are drawn, for authors only, stronger when both share a format (20-Q4, 20-Q6); inside a combo, R67's first offer is "Draw on a right axis" `[R80]`.
- **The Text tile** (design 21), replacing the Markdown tile in place:
  - **Tiptap 3** ("Tiptap 3 (Recommended)"), edited in place on the canvas in edit mode; stored as the editor's JSON document, validated by wechart's own schema; **no markdown source view** ("Canvas only (Recommended)"): an existing markdown tile is converted once, when opened, and reads the same `[R80]`;
  - block styles from §3's type scale only, bold, italic, lists and links; markdown shortcuts as typed; **⌘B, ⌘I and ⌘Z inside the text only** ("Yes, inside the text only (Recommended)", approved under R75) `[R80]`;
  - an insert menu opened by `/`, Insert or `{{`; **eight live elements**: Value, Change, Sparkline, Icon, Bullet graph, Marking, Filter value and As of, following the tile's filters and any marking they name; sparklines and bullet graphs as wechart's own SVG `[R80]`;
  - **Spotfire parity** ("Spotfire parity (Recommended)"): filter controls that are the filter bar's own filters; declarative action buttons (page, bookmark, reset filters, export, the last as CSV, 21-Q8); parameter controls; **no scripts and no raw HTML**; read mode through a static renderer that never sets HTML `[R80]`;
  - **10 elements per tile and 1,000 values in a list control** ("10 elements, 1,000 values (Recommended)"), every element counted (21-Q4) `[R80]`.
- **Dashboard parameters** ("Field switch now, what-if later (Recommended)"): a dashboard-level object choosing which measure or dimension bound charts and elements use, defined in Dashboard settings › Parameters (21-Q6), set from a parameter control, bound only by dashboard-local charts (21-Q5), carried by bookmarks and copied links; Reset filters leaves parameters alone (21-Q7) `[R80]`.
- **AI summaries** ("Now, with LLM settings"): drafted only at an author's request (21-Q10), from facts wechart computes through Cube as the author (change against the previous period, and top and bottom contributors, 21-Q12); every number a live element, a draft holding a digit outside one rejected and drafted once more; reviewed on a draft card before Insert; labelled "Written with Copilot · reviewed by ‹name›, ‹date›", kept through edits (21-Q9); never regenerated silently, with "Written for earlier data" for authors; no draft kept after it is inserted or discarded (22-Q8) `[R80]`.
- **Security › AI** (design 22), for Super-Admins only (22-Q1), and the one user with sign-in off (22-Q11):
  - AI on or off; who may use it, everyone who can edit dashboards by default (22-Q4); **providers Amazon Bedrock, Anthropic, Azure OpenAI and OpenAI** ("Bedrock, Anthropic, Azure and openAI"); one model (22-Q9) `[R80]`;
  - the API key typed once, tested, stored encrypted by wechart's API with a key of its own, its ciphertext bound to the provider and the endpoint so that changing either clears it, never shown again (22-Q3; research § Key handling). **Bedrock** uses AWS IAM credentials: the IAM role the deployment gives wechart's pods, preferred, or an access key pair stored the same way `[R80]`;
  - Test connection with four checks; Save held until it passes whenever the provider, endpoint, model or key changes (22-Q6); limits of summaries per person per day and for everyone per month, with a message of at most 280 characters (22-Q5, 22-Q10); usage this month; audit events for settings changes, key replacements and inserted summaries, never a key (22-Q7) `[R80]`.
- **On Bedrock,** which offers no strict structured output or forced tool use for current Claude models, the rule that every number is a live element is enforced by wechart's validation alone, and a non-conforming draft is rejected and retried `[R80]` (`docs/research/llm-providers.md` Gotcha 3).
- **Packages** (research): `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/static-renderer` and `@tiptap/suggestion` at 3.32.0; `@anthropic-ai/sdk@0.135.0`; `openai@7.38.0`; `@anthropic-ai/bedrock-sdk@0.35.0`; `zod@4.6.5` (already in the lockfile). Not `@tiptap/markdown` (beta): wechart converts its own markdown subset.
- **Lifted non-goals:** "Spotfire-style controls inside text tiles" (Part 1 §7) is lifted for filter controls, parameter controls and action buttons; scripts stay out. "AI and chat authoring" is lifted for AI summaries in Text tiles; the copilot chat stays in §P2.6 M `[R80]`.

## P2.7 Non-goals for phase 2

- **Individual users on folders.** AD groups only `[P2 input, R16]`.
- **User attributes in Cube's security context.** Groups only, for now `[R14, R16]`.
- **Notices outside the app.** No email or chat `[R12, R16]`.
- **Testing more than one identity provider during development.** Entra ID and brokers are checked at the end of phase 2 `[R14, R15, R16]`.
- **Superseded** `[IP 4]`: modules split the compile. Nothing further is planned for scale.
- **Cube Store beyond one node** `[AD 11]`.
- **Anything but wechart's server calling Cube or xcube**, for now `[AD 10]`.
- **xcube's slice 7**, and **aliasing a file-set model's JavaScript, Jinja and Python cubes when their data source's target changes** `[R39]`.
  - **Superseded in part** `[R78]`: xcube's slice 7 is brought into scope, to be specified later (§P2.6 M). The aliasing stays out.
- **Around the SQL runner** `[R50]`:
  - a separate read-only login per data source, which is phase 3 `[R50-2]`;
  - Cube's semantic SQL API (`/v1/cubesql`), still deferred from Part 1;
  - saved or shared queries `[R50-12]`;
  - templating in the SQL;
  - making a cube or a chart from a run's results.
  - *The last four weren't asked for, so they stay out until asked.*
  - **Superseded** `[R78]`: all five are lifted. Templating, Cube's SQL API in the runner, personal saved queries, and making a cube or a chart from a run are in §P2.6 L. The read-only login is in §P2.6 M, to be specified later. **Shared** queries stay out: "saved queries (no sharing)" `[docs/inputs/2026-10-17-sql-runner-and-ask-key.md]`.
- **Around the SQL runner workspace** `[R78]`, the design study's recommended answers:
  - optional clauses (`[[ … ]]`), parameters standing for a table or column name, and snippets;
  - parameter values in the audit trail;
  - copying results to the clipboard: CSV only, as R50-11 decided;
  - "Open in SQL runner" from a chart's View SQL;
  - tabs kept on wechart's server or shared across devices;
  - a table preview that runs when a table is opened.
- **Around the MCP server** `[R78]`:
  - approving or rejecting a proposal through MCP, ever;
  - creating, changing, testing or deleting data sources through MCP, in the first release;
  - running SQL in the SQL runner through MCP, in the first release (R78-11);
  - changing schedules through MCP (R78-8);
  - signing in through OAuth, so clients that need it (ChatGPT, per the research) aren't served in the first release.
- **Around the compact dashboard header** `[R79]`, the options not chosen:
  - remembering the header open or closed, per person, per dashboard or as an author's default;
  - a sheet that covers the tiles, or closes on a click outside;
  - a sheet that opens by itself when a filter changes.
- **Around combo charts, the Text tile and AI summaries** `[R80]`, the options designs 20–22 didn't choose:
  - a third value axis, splitting by a second dimension, a stack group per series, and "Index to 100" (20-Q13, research first);
  - reference lines from a measure's total in Cube or from a parameter, one computed line per member, and changing a series' mark or axis from a dashboard's legend;
  - showing the AC-218 warning to viewers;
  - a markdown source view or export in Properties, and free colour, font or size in text;
  - raw HTML and scripts in Text tiles, ever;
  - what-if (value) parameters, which come later; parameters bound by a chart from folders; a "Reset parameters" action; a PDF export;
  - viewers drafting summaries; keeping drafts or prompts; statistics beyond change and contributors as facts (phase 3 stage A);
  - Google Gemini, an endpoint compatible with OpenAI's API, Azure OpenAI through Entra ID, a second ("fast") model, and limits counted in provider tokens.

Phase 1's non-goals still stand, except two that phase 2 brings into scope:
- **Users, groups, roles and SSO** (§P2.6 A–B).
- **Maps and geo charts:** the country map, from R8 and the backlog (§P2.6 H).

R78 brings in two more:
- **Cube's SQL API**, in the SQL runner workspace only (§P2.6 L). Connecting external BI tools to it stays out.
- **AI and chat authoring**, for the copilot, when it is taken up (§P2.6 M). The MCP server serves outside LLM clients; it adds no chat to wechart.

R80 brings in two more:
- **Spotfire-style controls inside text tiles,** as the Text tile's filter controls, parameter controls and action buttons (§P2.6 O). Scripts stay out.
- **AI and chat authoring,** for AI summaries in Text tiles (§P2.6 O). The copilot chat stays in §P2.6 M.

The rest still apply: scheduled delivery and alerts, embedding, `.dxp` migration tooling, Spotfire Subsets, Tags and Lists and data functions, touch, and selling wechart `[Part 1 §7]`.

## P2.8 Open questions

### Round R80 (2026-10-18): still open

Found while specifying §P2.6 O. The spec states no value for any of them; each holds back only the task named, which carries a "Waits on" line.

| # | Question | Holds back |
|---|---|---|
| R80-1 | Which period a summary's "change against the previous period" compares. Design 21 draws "this quarter against the previous" on a page whose date filter is a year and whose chart is by month, with no period setting in Summarize. Options: a period setting in Summarize, as the Change element has; the date filter's own period; or each covered chart's time granularity | the facts task (F47, AC-536) |
| R80-2 | Which day and month the AI limits count in: UTC (design 22's sample message says "midnight UTC"), or the deployment's time zone | the limit-counting task (AC-543) |
| R80-3 | A draft call's timeout, its output-token cap, the most facts sent in one request, and the longest title or member name sent. The research's 60 s and 1,024 tokens are placeholders, not decisions (`llm-providers.md`, Open questions). Test connection's 30 s per check is design 22's and is decided | the draft-route task (AC-537) |
| R80-4 | Redo inside the text (⇧⌘Z, Ctrl+Shift+Z, Ctrl+Y). Not among the keys approved under R75 (⌘B, ⌘I, ⌘Z), so it is off (AC-516) until the user approves it | nothing; AC-516 holds without it |
| R80-5 | wechart's API starting without the AI key-encryption key: refuse to start, as R21 decided for the old credential key, or start with Security › AI unable to store a key and saying the deployment must provide one | the key-store task (AC-549) |
| R80-6 | *Research, not a question for the user.* `@anthropic-ai/bedrock-sdk@0.35.0`'s options for a region, the pod's IAM role through the AWS default credential chain, an access key pair, and a base URL for the tests' fake provider; and how the Helm chart gives wechart's pods an IAM role (a service-account annotation). Both are UNVERIFIED in `llm-providers.md` | the Bedrock adapter and its Helm values (AC-547) |

### Earlier rounds

R78's fifteen, below, were resolved by the user on 2026-10-17 and are folded into §P2.6 K and L. All seven were resolved with the user on 2026-09-25 in round R18. The decisions are folded into §P2.2, §P2.4 and §P2.6, and the log is in §P2.9. The seventeen questions the architecture decisions left open were settled in round R27, and are folded into the same sections. The ten the 2026-09-26 plan left open were settled in round R28, in the same way. The four xcube's slice 2 left open were settled in round R29, and are in §P2.4, "Slice 2 as built". The six xcube's slice 3 left open were settled in round R30, after xcube answered the questions they raised, and are in §P2.4, "Relaxed from phase 1" and "Slice 3 as built". The nine that slices 4–6 left open were settled in round R31, and are in §P2.4, "Slices 4–6 as built".

| # | Question | Decision |
|---|---|---|
| 1 | Where the Super-Admin group is named | **In the deployment's configuration** |
| 2 | Library charts when a dashboard is copied into a workspace | **Copied with it** |
| 3 | A dashboard whose cubes resolve only through workspace models | **One proposal, together with those models** |
| 4 | Who uses a folder's Jobs and Schedules | **Super-Admins, and the folder's read-write members** |
| 5 | What rejecting a proposal does | **Back to the author's workspace, with the approver's reason** |
| 6 | Audit retention | **A deployment setting, one year by default** |
| 7 | Self-approval with security on | **Yes, always.** The approval step is never skipped |

### Round R48 (2026-09-30): settled the same day

Round R48's seven questions were answered by the user, each with the recommended choice. The decisions are folded into §P2.6 I.

| # | Question | Decision |
|---|---|---|
| R48-1 | A chart some dashboards use | **Its delete is refused until none does**, naming them (AC-023's confirm is replaced) |
| R48-2 | What blocks deleting a cube | **Anything depending on it:** a view, a join from another cube, or a chart or dashboard bound to it |
| R48-3 | A folder that isn't empty | **Only empty folders can be deleted** |
| R48-4 | Clearing My workspace with items in open proposals | **The proposals are withdrawn too**, named in the confirmation |
| R48-5 | The project folder | **One per "Edit in my workspace"**, holding everything copied with it, named `project-YYYY-MM-DD-HHmm`; none for a new item |
| R48-6 | The folder's comment | **An editable folder description**, prefilled for a project folder |
| R48-7 | The kind filter | **Over the open folder's contents:** All (default), Dashboards and charts, Data sources, Models |

### Round R50 (2026-10-01): settled the same day

Round R50's fourteen questions on the SQL runner were answered by the user. The decisions are folded into §P2.6 J.

| # | Question | Decision |
|---|---|---|
| R50-1 | Who may run SQL on a data source | **Super-Admins and the own folder's read-write members, where a Super-Admin has switched it on** (off by default) |
| R50-2 | Which credential runs it | **The serving credential, a Super-Admin attesting it is read-only**, with read-only enforced in layers as far as each database allows; a separate read-only login is phase 3 |
| R50-3 | What it runs on | **Landed data sources, My workspace's, and Cube Store read-only** |
| R50-4 | Which statements | **SELECT and EXPLAIN only** |
| R50-5 | Who may run it on Cube Store | **The same switch as data sources** |
| R50-6 | A data source in My workspace | **Always, for its owner** |
| R50-7 | Row cap | **10,000 rows** |
| R50-8 | Time cap | **30 seconds** |
| R50-9 | Concurrency | **One run at a time per user** |
| R50-10 | Result size | **10 MB** |
| R50-11 | Results | **CSV up to the row cap** |
| R50-12 | History | **Each user's own run history** |
| R50-13 | Audit | **The event, with the SQL's literals redacted** |
| R50-14 | Where in the UI | **A tab on each data source** (superseded by R78: its own workspace, §P2.6 L) |

### Round R78 (2026-10-17): settled the same day

Values R78 and the design study left open, found while writing the spec. The user answered all fifteen on 2026-10-17: R78-3, R78-5 and R78-7 directly, and the rest by "Accept all (Recommended)", which takes each one's recommended option (`docs/requirements-log.md`, R78). The decisions are folded into §P2.6 K and L.

| # | Decision |
|---|---|
| R78-1 | **The owner picks 7, 30 or 90 days**, 30 by default, 90 at most |
| R78-2 | **Three fixed scopes:** read, workspace-edit, proposals-and-jobs; read always included |
| R78-3 | **The groups of the owner's latest web sign-in** |
| R78-4 | **Super-Admins may list and revoke any user's tokens** |
| R78-5 | **A Postgres counter, per token, every MCP call counted, 60 a minute as a deployment setting, closed when the store fails, and an IP limit on bad-token traffic**, 20 a minute by default (2026-10-17) |
| R78-6 | **At most 1,000 rows and under 50,000 characters per result, said when cut, with paging** |
| R78-7 | **A separate host serving only `/mcp`, allow-listed to Anthropic's IP ranges and the enterprise network, as a Helm value**; later the same day, with Claude.ai deferred, the enterprise network only, through a Gateway API HTTPRoute |
| R78-8 | **Jobs, builds and schedules listed; Run now and Cancel; no schedule edits** |
| R78-9 | **Every tool call audited, reads included, with no argument values** |
| R78-10 | **Tokens work with sign-in off,** as the single user |
| R78-11 | **No SQL runner through MCP** in the first release |
| R78-12 | **Ctrl+Q new tab; Ctrl+Alt+[ and Ctrl+Alt+] previous and next; close with ×** |
| R78-13 | **The "Cube" group for everyone who sees the workspace, no switch, R50's caps, audited and in History, no Make a cube** |
| R78-14 | **Parameters only where binding is shown to work**; elsewhere Run is held, saying so. Dremio is held too (2026-10-17) |
| R78-15 | **Name required, unique per owner, at most 100 characters; description optional, at most 1,000** |

The questions as first asked:

| # | Question | Waited in the spec |
|---|---|---|
| R78-1 | A token's lifetime: chosen when it is made or fixed, and its maximum | the expiry values (F41) |
| R78-2 | A token's scopes: which set is offered | the scope list (F41; AC-433 holds for any set) |
| R78-3 | Which groups a token's calls use, since groups arrive only with a sign-in | the group source (F41) |
| R78-4 | Whether Super-Admins may list and revoke other users' tokens | F41 |
| R78-5 | The rate limit (research `docs/research/fastify-rate-limit.md`): its store (in memory per replica, a Postgres store on wechart-meta, or Redis); per token or per user; every MCP POST or only `tools/call`; open or closed when the store fails; whether unauthenticated (401) traffic is limited by IP; the maximum and the window | the rate-limit criteria (F41) |
| R78-6 | The size caps on what a tool returns, query rows above all | the output-cap criterion (F41) |
| R78-7 | How `/mcp` is exposed to the public internet: its own ingress, an allow-list of Anthropic's IP ranges, or both | the exposure criterion (F41) |
| R78-8 | Which jobs operations MCP offers | the jobs criterion (F41) |
| R78-9 | Whether every MCP tool call is audited, reads included | F41 |
| R78-10 | Whether MCP works with sign-in off | F41 |
| R78-11 | Whether MCP may run SQL in the SQL runner | F41 |
| R78-12 | Which keys the SQL runner's tab shortcuts use | the tab-shortcut criterion (F42) |
| R78-13 | The "Cube" group: who sees it, whether it needs a switch, its caps, audit and History, and Make a cube from it | F42 (AC-467 holds for any answer) |
| R78-14 | Parameters on Cube Store and in the "Cube" group | F42 (AC-454 covers data sources) |
| R78-15 | A saved query's name and description: required, unique, and their lengths | F42 |

## P2.9 Interview log

Phase 2's interview log (rounds R11 onward, the user's later decisions included) is in [`docs/requirements-log.md`](./requirements-log.md), word for word (moved 2026-10-17, the user's decision, to keep this file small). Requirements and the spec cite its rounds as `[R1]` … `[R80]`; search that file for the round.
