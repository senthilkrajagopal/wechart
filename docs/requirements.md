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
- **AI and chat authoring** — natural-language questions, AI chart generation, AI summaries `[R6]`.
- **Scheduled delivery and alerts** — emailing or Slacking dashboards, threshold alerts `[R6]`.
- **Embedding in other applications**, with tokens or white-labelling `[R6]`.
- **Maps and geo charts** `[R6]`.
- **`.dxp` migration tooling** — nothing automated in phase 1. The corpus serves as a parity checklist and as evidence of what analysts do `[R6]`. A `.dxp` **inspection** tool is planned for after phase 1, to size the migration `[R7]`.
- **Spotfire Subsets, Tags and Lists, and data functions** — not phase 1, but the design must not rule them out later `[R7]`.
- **Touch and tablet support** `[R7]`.
- **Spotfire-style controls inside text tiles** (filter dropdowns, buttons and input fields placed in the text) `[R7]`.
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

Questions are Claude's; answers are the user's, verbatim.

**R1 — Problem**

- Q: "What problem does wechart solve, and for whom?" (options: replace Spotfire on Cube / Cube has no real BI front end / other BI tools bypass the model / no UI for running Cube)
  A: "Create a BI tool that is better than what exists today.. leveraging cube to the best possible way"
- Q (follow-up, vagueness): better than which tool, and for whom?
  A: "Superset and Metabase, Spotfire"
- Q (clarification asked by the user, answered in their own words):
  A: "Idea is to build a BI tool.. that can eventually replace spotfire. By my analysis, cubes model is almost similar to spotfire so going with cube."
- Q: "What makes replacing Spotfire worth doing?"
  A: "Desktop client and IT overhead, Licence cost per seat, Data has to be loaded into it"
- Q: "Who is wechart being built for?"
  A: "Your own organisation"

**R2 — Users**

- Q: "Which roles will use wechart in your organisation?"
  A: "Analyst / author, Business consumer, Semantic-layer engineer, Platform operator"
- Q: "Roughly how many people, once it replaces Spotfire?"
  A: "500 or more"
- Q: "What can your typical analyst do without help?"
  A: "Spotfire power user, no SQL"

**R3 — Success metrics**

- Q: "What observable outcome would show wechart is succeeding?"
  A: "Analyses rebuilt and accepted, Self-service authoring"
- Q: "What performance bar must a dashboard meet?"
  A: "p95 under 3 s, 10 charts"
- Q: "How will you know the Spotfire replacement actually happened?"
  A: "Feature parity checklist"

**R4 — Constraints**

- Q: "Where will wechart run in production?"
  A: "Self-hosted Kubernetes"
- Q: "Which databases must Cube connect to?"
  A: "PostgreSQL, Snowflake, Databricks or BigQuery, SQL Server or Oracle"
- Q: "How big is the data behind a typical analysis?"
  A: "Varies widely"
- Q: "What must phase 1 do about login and access?"
  A: "Single user, no login"

**R5 — Stack**

- Q: "Does wechart have its own backend in phase 1?"
  A: "Node/TypeScript API + Postgres"
- Q: "How should the chart recommender be built?"
  A: "TypeScript rules + weights"
- Q: "How should the UI be built?"
  A: "Build everything ourselv3es, but make it modular so that we can add more dialogs, menus, combobox, charts.."
- Q: "Two libraries with real consequences. How do you want them chosen?"
  A: "Open-source only, research picks"

**R6 — Non-goals**

- Q: "Which product capabilities are out of scope for phase 1?"
  A: "AI and chat authoring, Scheduled delivery and alerts, Maps and geo charts, Embedding in other apps"
- Q: "Which Cube areas should phase 1 skip?"
  A: "SQL API and BI connections, Dynamic models (Jinja, Python, JS)"
- Q: "And these? Same question, the operational surfaces."
  A: "Advanced pre-aggregation types, Cube Store internals, Deployment and config screens, Real-time and live dashboards"
- Q: "What happens with the roughly 5,000 Spotfire .dxp analyses in phase 1?"
  A: "Nothing automated"

**R6 follow-up — unselected scope items**

- Q: "Model import — dbt, LookML, or database tables. In phase 1?"
  A: "Only from database tables"
- Q: "Multi-tenancy — per-tenant models and orchestrators. In phase 1?"
  A: "Defer it"

**R7 — resolving the open questions** (asked before writing the spec, because write-spec requires no open questions)

- Q: Marking wording, "tile" or "visualization"? A: "Keep \"visualization\""
- Q: How many markings at once? A: "Four"
- Q: Marked-item cap? A: "1,000, like Spotfire"
- Q: Range-based marking, bookmarks or touch in phase 1? A: "Range-based marking, Bookmarks, Touch support"
- Q (conflict: touch chosen, desktop-only chosen): A: "Drop touch"
- Q: Markdown text tiles? A: "Keep them"
- Q: Browsers and devices? A: "Desktop browsers only"
- Q: Is the design direction accepted? A: "Accept, revisit visuals later"
- Q: What replaces Spotfire's expression language for non-SQL analysts? A: "Quick calculations plus a request flow"
- Q: Which Spotfire features must eventually reach wechart? A: "Subsets, Tags and Lists, Data functions"
- Q: Who owns group membership in phase 2? A: "Identity provider owns it"
- Q: A `.dxp` inspection tool? A: "Yes, after phase 1"

**R8 — chart types for the Superset parity exercise** (2026-09-24, asked because Superset's dashboards use two types AC-037 does not list)

- Q: World map — the two country charts (Revenue by Customer Country, Orders by Ship Country). What should wechart do? (options: add a country map type / substitute a sorted bar / defer maps to phase 2)
  A: "Add a country map type (Recommended)"
- Q: Box plot — Days to Ship Distribution by Shipper. What should wechart do? (options: add a box plot type / substitute a bar of the average / defer to phase 2)
  A: "Add a box plot type (Recommended)"

**R9 — the prototype-alignment pass** (2026-09-24, after the user compared the running Explore with `docs/design/prototype/` and found it structurally different)

- Q: When should the prototype-alignment pass happen? (options: now, before more features / Explore now, the rest later / after the remaining ACs)
  A: "Go with Option 1.. and after that continue with the handoff"
- Q: The prototype's folder tree has two roots, a shared one and a personal "My workspace"; wechart has one. Phase 1 is single-user. What should the tree have? (options: both roots now / one shared root for now)
  A: "Both roots now (Recommended)"
- Q: The prototype's top-bar search says "Search fields, charts, models"; the ⌘K palette searches dashboards and charts only. What should global search cover? (options: dashboards, charts, fields and models / dashboards and charts only)
  A: "Dashboards, charts, fields and models (Recommended)"
- Q: The prototype puts a "History" button on every model file; wechart keeps only each file's current version, and a publish overwrites it. Should the Model workspace have history? (options: yes — versions, diff, restore / not in phase 1)
  A: "Not in phase 1"

**R10 — generating cubes through Cube's introspection API** (2026-09-25, after the user added the API to a fork of Cube and wrote `docs/inputs/2026-09-25-cube-introspection-api.md`)

- The user: "Use this ffor unblocking creating models form datasouce by introspections docs/inputs/2026-09-25-cube-introspection-api.md"
- Q: Where should the fork's Cube image come from? The Helm chart and docker-compose would both switch cube and the refresh worker to it. (options: local build only / push to a registry)
  A: "Local build only (Recommended)"
- Q: Who may generate cubes from a data source? The introspection scope exposes the warehouse catalog. (options: anyone, phase 1 / model engineers only)
  A: "Anyone, phase 1 (Recommended)"
- Q: When a generated cube's name or file name matches one already in the model store, what should happen? (options: refuse and say which / rename automatically / ask per clash)
  A: "Refuse and say which (Recommended)"

---

# Part 2 — Phase 2 requirements (2026-09-25)

Written from the phase-2 interview, rounds R11–R17. Its inputs:
- `docs/inputs/2026-09-25-phase-2-security-folders-workspaces.md`, cited as `[P2 input]`;
- `docs/phase-2/backlog.md`, cited as `[backlog]`, which holds what phase 1 moved on.

As in Part 1, every statement traces to a round or an input. Anything undecided is in §P2.8.

**Amended 2026-09-25 by the user's architecture decisions** (`docs/inputs/2026-09-25-architecture-decisions.md`), cited as `[AD n]` for decision n, and by round R27, which settled what they left open.
- Cube plus **xcube**, the Cube-side package in the user's fork (formerly `cube-introspection`), is the semantic service. wechart is its client.
- The architecture is set out in §P2.4, "Architecture".
- Passages the decisions overturn are kept, marked **Superseded** with the decision that replaces them, and followed by what now holds.

## P2.1 Problem

Phase 2 builds on phase 1 from the user's inputs `[R11]`. Phase 1 has no sign-in and one trusted user. It has one Cube model and one data source for everything, and a change to shared content is live at once `[Part 1 §4]`. Phase 2 adds:

- **Sign-in through OIDC/SSO, switchable.** Turned off, wechart runs in single-user mode, as in phase 1 `[P2 input]`.
- **Folder access by AD group**, inherited down the tree, with three roles: Super-Admin, Admin and User `[P2 input]`.
- **Models and data sources as folder items**, under the same access rules. The Model tab goes `[P2 input]`.
- **A private workspace per user.** Creating and editing happen there, and work reaches shared folders only by being copied in and approved `[P2 input, R12]`.
- **Names unique within a folder, not across the whole app.** ~~A cube name resolves from the nearest folder upwards `[P2 input]`.~~ **Superseded** `[AD 2, AD 3]`: short names are unique within a folder. The model is one flat namespace, in which each name is prefixed by its folder. A short name inside an item is bound when the item is published, nearest first from the item's own folder (§P2.6 D).
- **Everything in the phase-2 backlog** `[R16]`.

## P2.2 Users and roles

**Sign-in.** With security on, every user signs in: Super-Admins, Admins and Users alike. Nothing is reachable without credentials `[R11]`.

**Folder permissions.** A folder can have two optional settings: the AD groups with **read-only** access and the AD groups with **read-write** access `[R11]`.
- An unset setting is inherited from the parent folder, each setting on its own `[R11]`.
- Folders take AD groups only, never individual users `[P2 input]`.

**How far a grant reaches** `[P2 input, R12]`:
- **Down:** a grant on a folder reaches every descendant, read and write alike, even where a descendant sets its own groups. A descendant's own groups are added alongside, never in place.
- **Up:** members of a group granted anywhere see everything in every ancestor folder up to the root (dashboards, charts, models and data sources), view-only.
- **Read-only users see dashboards only**, and the charts on them. That holds in their folder, its descendants and its ancestors. Models, data sources and library charts are hidden from them, while the dashboards they open ~~still resolve cubes through the folder's path~~ `[P2 input, R19]` query the cubes their charts were bound to at publish, which Cube's generated policies admit them to `[AD 3, AD 4]`. The "everything in ancestors" above therefore applies to read-write members.
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

**Data inside cubes.** The signed-in user's AD groups go into Cube's security context, so the model's access policies can filter rows and members by group. For now it's groups only; user attributes come later `[R14]`. That is every query made for a signed-in user; ~~what wechart asks Cube for itself (compiling a model, builds, schedules, a data source's catalog, health) carries the configured context alone `[R25]`~~.
- **Superseded** `[AD 1, AD 4, AD 12]`. A signed-in user's queries carry an RS256 token holding their groups only, signed by wechart.
- What wechart asks Cube or xcube for on its own behalf uses a separate **service credential**: introspection, builds and jobs, system partitions, health, and every xcube admin call `[AD 12, R27]`.
- Compiling belongs to xcube, at publish `[AD 1, AD 6]`.
- Cube enforces access too: xcube generates access policies from each folder's allowed groups (below) `[AD 4]`.
- The Security workspace's "Preview as" chooses groups, and previews exactly those `[R27]`.

**Credentials.** Data-source credentials are ~~encrypted in wechart's metadata database, with a key from the deployment's Secret~~ stored in wechart's metadata database, encrypted to xcube's public key; wechart can never decrypt them, only xcube can `[AD 7]`. They are never shown again, and never sent to the browser. This holds in development and in production `[R14, R15]`.
- ~~Every API pod mounts the same Secret, so every pod can decrypt every data source `[R21]`.~~ **Superseded** `[AD 7]`: no wechart pod holds a decryption key. xcube holds the private key.
- ~~Development (docker-compose on a laptop) uses one fixed development key written in the repository's compose file `[R21]`.~~ **Superseded** `[AD 7]`: development uses a fixed xcube key pair. Its private half is in xcube's compose environment only, and wechart is given the public half.
- ~~An API pod that starts without the key, or with a key that can't decrypt the stored credentials, refuses to start and says why `[R21]`.~~ **Superseded** `[AD 7, R27]`: wechart's API refuses to start without xcube's public key. xcube refuses to start without its private key, or with one that can't decrypt a sample credential. Each says which key is missing.
- **A newly typed secret is encrypted in the browser**, before it is sent, so wechart never sees the plaintext, not even for a connection test `[R27]`.
- wechart keeps a credential's lifecycle without decrypting it: copied into a workspace, cleared when the target changes `[AD 7]`.
- Changing where a data source connects (host, account, warehouse and the like) clears its stored secret, so it must be entered again `[R21]`.

**Audit.** wechart records sign-ins, permission changes, copies proposed, approved and rejected, and data-source changes. Super-Admins can browse the record `[R14]`. How long records are kept is a deployment setting, one year by default `[R18]`.

**Phase 1's content.** When security is first turned on, everything phase 1 created stays in place as the shared tree, with no groups set. Only Super-Admins see it until they assign groups `[R17]`.

**Cube.** The user's Cube fork may be changed where Cube's own configuration can't meet these requirements. Changes go through the Cube-expert agent, on the fork's branch `[R15]`. They live in xcube's package, and Cube's own code stays unmodified `[AD 1]`.

**Relaxed from phase 1.** ~~A cube's name no longer has to be unique across the whole model.~~ Cubes, models, dashboards and data sources must be unique **within a folder** `[P2 input]`.
- **Superseded in part** `[AD 2, R27]`. The whole deployment is one flat model.
- Every cube, view and data source is published under a unique name, prefixed by its folder's id.
- The shared root adds no prefix, so phase-1 content and links resolve as they are.

**Architecture** `[AD 1–12, R27]`
- **Who owns what** `[AD 1]`:
  - Cube plus xcube own the published model, Cube's rules (validation and access policies) and the connection runtime.
  - wechart owns workflow, folders, permissions, users and groups, dashboards and the UI.
  - Cube never calls wechart at runtime. There are no model callbacks to wechart, and no drafts held in the API's memory.
- **xcube knows the folder tree:** ids and parents, plus each folder's allowed groups. xcube resolves names `[AD 5]`.
- **Each folder's allowed groups** are those granted on the folder, on any ancestor, or on any descendant (whose items use its cubes), plus the Super-Admin group.
  - wechart works the set out and sends it with the tree.
  - A folder no group reaches admits only Super-Admins.
  - With security off, no policies are generated.
  - Row-level policies written in the model still apply inside `[R27]`.
- **Every publish compiles the whole model**, and is refused if anything anywhere breaks `[AD 6]`.
  - A proposal is checked when proposed, as an overlay, and again at approval `[R27]`.
  - Renames, moves and deletes that touch models, data sources or folders holding them are checked the same way, and refused when something would break `[R27]`.
  - A refusal names what broke in folders the publisher can see, with Cube's error per file. For the rest it says "_n_ items in folders you can't see would break". A Super-Admin sees everything named, and the audit trail records all of it `[R27]`.
- **Unpublished workspace and proposal content** is pushed to xcube as short-lived overlays `[AD 8]`.
  - A workspace overlay is its owner's alone.
  - A proposal overlay may be queried by its author, the target folder's read-write members and Super-Admins until it is approved or rejected, then dropped.
  - Names resolve in the overlay first, then along the target's or origin's folder path `[R27]`.
- **wechart keeps each published version** of its model items, for history, compare and restore. xcube holds only what is published now `[R27]`.
- **Build history:** xcube records the refresh worker's builds, and wechart pulls them into its own history `[R27]`.
- **Scale:** designed for 100–200 model-bearing folders. Sharding is a later add-on `[AD 9]`.
- **Callers:** only wechart's server calls Cube or xcube, for now `[AD 10]`.
- **High availability of the query path:** 2 or more Cube instances with the Cube Store queue, and a stateless wechart API on 2 or more replicas. Cube Store stays single-node for now `[AD 11]`. It is tested: stopping one Cube instance and one API replica during use loses no signed-in session and fails no query the web app retries `[R27]`.
- **Tokens** carry groups only, for now `[AD 12]`.
  - wechart signs them RS256 and pushes its public keys (JWKS) to xcube when it starts and when keys rotate, so Cube verifies them without calling wechart `[AD 12, R27]`.
  - Admin calls use the separate service credential `[AD 12]`.

## P2.5 Stack

**Decided.** Phase 1's stack stands `[Part 1 §5]`. To it phase 2 adds:
- credentials encrypted in the metadata database `[R14, R15]`, to xcube's public key `[AD 7]`;
- changes to the Cube fork where needed, through the Cube-expert agent `[R15]`, in xcube's package `[AD 1]`;
- Cube plus xcube as the semantic service, with wechart as its client `[AD 1]`;
- RS256 user tokens with their public keys pushed to xcube, and a separate service credential for admin calls `[AD 12, R27]`.

**Decided after research** (these were the open items; the user chose on 2026-09-25, rounds R20–R22)

| Item | Decision | Research |
|---|---|---|
| **How sign-in is built** | **wechart's API is its own OIDC client** (openid-client 6.8.8), with a server-side session in the metadata database (@fastify/session 11.1.3 with @fastify/cookie 11.1.2). Not oauth2-proxy `[R20]`. | `docs/research/openid-client.md`; compared with `docs/research/oauth2-proxy.md` |
| **Development OIDC provider** | **Dex 2.45.1**, with users and groups from its config file `[R20]`. | `docs/research/dex.md`; compared with `docs/research/keycloak.md` and `docs/research/authelia.md` |
| **Per-folder models in Cube** | ~~One compile per folder chain, nearest file first, and connections served by wechart `[R20]`.~~ **Superseded** `[AD 1, AD 2, AD 5]`: one flat model owned by Cube and xcube, under folder-prefixed names. xcube resolves names and runs connections. | `docs/research/cube/per-folder-models.md` (superseded); new research on xcube's admin API and the naming scheme |
| **How credentials are encrypted** | ~~AES-256-GCM through `node:crypto`, key from the deployment's Secret.~~ **Superseded** `[AD 7]`: encrypted to xcube's public key, in the browser `[R27]`. | `docs/research/credential-encryption.md` (superseded); new research on public-key encryption |
| **Where a connection test runs** | **In Cube, at wechart's request:** ~~a fork endpoint~~ an xcube route runs Cube's own drivers, so a pass means the Cube that will use the source can connect. wechart starts it and shows each check `[R20, AD 1]`. wechart sends only the ciphertext, and xcube decrypts `[AD 7]`. | `docs/research/connection-testing.md` |

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
- ~~A dashboard's cubes resolve bottom-up, from its folder to the root, and the nearest definition wins. Children's cubes aren't used.~~
- ~~Models can use any data source in their folder's path and in all its children `[P2 input]`.~~
- ~~**A data-source name resolves bottom-up from the model's own folder:** first the model's folder, then each ancestor up to the root. A descendant's data source is used only when no folder on that path has the name `[R19]`.~~
- ~~**Names inside an inherited model resolve from the viewer's folder.** When a chart or dashboard in /A/B uses a model defined in /A, a cube that model names resolves bottom-up from /A/B, so /A/B's own cube of that name wins `[R20]`.~~
- ~~**A cube that names no data source** uses a data source called `default`, resolved like any other name. If no folder on the path has one, it uses the deployment's own default connection `[R22]`.~~

**Superseded** `[AD 2, AD 3, R27]`. Names and resolution now:
- **Bound at publish.** A short name inside an item (a cube a chart or dashboard uses, a join target, a `data_source`) is resolved when the item is published. The search runs nearest first, from the item's **own** folder up to the root, and the full prefixed name is stored `[AD 3]`.
  - xcube does the resolving `[AD 5]`.
  - A name found nowhere on that path is refused at publish, naming it `[R27]`.
  - Children's items are never used, and there is no fallback to descendant folders `[R27]`.
- **Overriding.** A child folder overrides a name by publishing its own item. Binding from the viewer's folder is dropped `[AD 3]`.
- **Rebinding.** When a nearer definition is published, the items whose binding changes are re-resolved at that publish, and the whole-model compile checks the result. Deleting something others are bound to fails that compile, so the delete is refused, naming what depends on it `[R27]`.
- **Path only.** An item uses only the cubes found on its own folder path, and the chart editor lists only those. A cube elsewhere is reached by publishing an item in a folder beneath it `[R27]`.
- **Prefixes are built from folder ids**, so renaming or moving a folder keeps names, references, pre-aggregations and links. People see titles in the UI; the prefixed name shows only in YAML and SQL `[R27]`.
- **The shared root has no prefix**, so phase-1 content and links resolve as they are, with nothing migrated `[R27]`.
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

*What needs no approval:* creating subfolders, setting permissions, renaming, moving and deleting are direct for read-write members `[R17]`. Where they touch models, data sources or folders holding them, they apply only if the whole model still compiles `[R27]`.

*Every proposal* is checked against the whole model when it is proposed, and again at approval. An approval that would break anything is refused `[AD 6, R27]`.

**F. Bookmarks** `[R12]`
- Personal to each user by default.
- A user can share a bookmark with everyone who can see the dashboard.

**G. Data sources: all of backlog F18, per folder** `[R16]`
- A list per folder, with each source's health.
- Adding a source with a connection test, run by Cube's own drivers at wechart's request `[R20]`, in xcube, which alone decrypts the credential `[AD 1, AD 7]`.
- The six driver types, each with its own authentication.
- The restart note, and whether ~~Cube has~~ every Cube instance has picked the change up `[AD 11]`.
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

## P2.7 Non-goals for phase 2

- **Individual users on folders.** AD groups only `[P2 input, R16]`.
- **User attributes in Cube's security context.** Groups only, for now `[R14, R16]`.
- **Notices outside the app.** No email or chat `[R12, R16]`.
- **Testing more than one identity provider during development.** Entra ID and brokers are checked at the end of phase 2 `[R14, R15, R16]`.
- **Sharding the model.** Designed for 100–200 model-bearing folders; sharding is a later add-on `[AD 9]`.
- **Cube Store beyond one node** `[AD 11]`.
- **Anything but wechart's server calling Cube or xcube**, for now `[AD 10]`.

Phase 1's non-goals still stand, except two that phase 2 brings into scope:
- **Users, groups, roles and SSO** (§P2.6 A–B).
- **Maps and geo charts:** the country map, from R8 and the backlog (§P2.6 H).

The rest still apply: AI and chat authoring, scheduled delivery and alerts, embedding, `.dxp` migration tooling, Spotfire Subsets, Tags and Lists and data functions, touch, controls inside text tiles, and selling wechart `[Part 1 §7]`.

## P2.8 Open questions

**None.** All seven were resolved with the user on 2026-09-25 in round R18. The decisions are folded into §P2.2, §P2.4 and §P2.6, and the log is in §P2.9. The seventeen questions the architecture decisions left open were settled in round R27, and are folded into the same sections.

| # | Question | Decision |
|---|---|---|
| 1 | Where the Super-Admin group is named | **In the deployment's configuration** |
| 2 | Library charts when a dashboard is copied into a workspace | **Copied with it** |
| 3 | A dashboard whose cubes resolve only through workspace models | **One proposal, together with those models** |
| 4 | Who uses a folder's Jobs and Schedules | **Super-Admins, and the folder's read-write members** |
| 5 | What rejecting a proposal does | **Back to the author's workspace, with the approver's reason** |
| 6 | Audit retention | **A deployment setting, one year by default** |
| 7 | Self-approval with security on | **Yes, always.** The approval step is never skipped |

## P2.9 Interview log

Questions are Claude's; answers are the user's, verbatim.

**R11 — Problem**
- Q: What stops phase 1 from being rolled out today, and who is the first rollout group? *(The user asked to clarify instead.)*
  A: "we are not rolling out today.. we are building on phase 1.. based on the inputs i provided. If security is enabled, then security credentials have to be present for the super-admin/admin and users to use the application. when folder is created and permissions are set/edited.. the user can optionally set the AD group that has read permissions only or read-write permissions. if any of the permission are not set on the folder it will be inherited from parent. you can start with your interview now"

**R12 — Users and roles**
- Q: A group has read-write on /Sales; /Sales/EMEA sets its own read-write group. Does the /Sales group still have read-write in /Sales/EMEA? A: "Yes, write flows down too"
- Q: A group is granted on /Sales/EMEA. In the ancestors, what do its members see? A: "Everything, view-only"
- Q: What does a Super-Admin get? A: "Read-write everywhere + admin"
- Q: Who can create folders and set or edit their AD-group permissions? A: "Super-Admin + read-write groups"
- Q: Does a read-only user get a private workspace? A: "Read-write members only"
- Q: Copying from a workspace into a shared folder requires what? A: "Read-write + an approval"
- Q: How many AD groups can one user belong to? A: "Can be hundreds"
- Q: Bookmarks: whose are they now? A: "Personal, can be shared"
- Q (follow-up, the approval): Who can approve? A: "Another RW member or Super-Admin"
- Q: While a copy waits, what do the folder's readers see? A: "The old version"
- Q: How is an approver told? A: "In-app only"
- Q: What does the approver review? A: "The proposed item + description of the change that the promoting user can type in.. (It can be empty. The description will be less than 1000 characters)"

**R13 — Success metrics**
- Q: Which outcomes should phase 2 be measured by? A: "Zero access leaks, "Phase 1 intact, security off", Speed holds with security on, "hase 1 intact, security off - this will be end of phase check.. dont waste iterations in terms of testing this every time.. focus on phase 2 security. After phase 2 is complete we can check \"Phase 1 intact, security off\"""
- Q: A folder-listing budget? A: "No separate budget"
- Q: Do phase 1's M1–M4 carry into phase 2? A: "Keep all four"

**R14 — Constraints**
- Q: Which identity provider issues the users and AD groups? A: "Any oidc provider.. for testing.. we will pick up keycloak... or if there are other options similar to keycloak that are smaller and lighter than we can use that. The end state deployment is Microsoft Entra ID or On-prem AD via a broker... we will do all testing on a single oidc provider that we select for development.. we dont have to test on all possible oidc providers during development."
- Q: Do AD groups also limit the data inside a cube? A: "Yes pass groups to cube. We will add user attributes later on... but for now we will assume it is groups only"
- Q: Where are data-source credentials kept? A: "For development we will use wechart DB, encrypted.."
- Q: Is an audit trail needed in phase 2? A: "Yes, Super-Admin view"

**R15 — Stack**
- Q: How should sign-in be built? A: "Option 1 Research decides. Like i said.. we will test with any one oice provider.. we dont have to do "and working with both Entra ID and a broker" we can defer this to the end of phase.. where we will see if it works."
- Q: Development OIDC provider? A: "Research picks lightest"
- Q: Data-source credentials in production? A: "Same as development"
- Q: May the Cube fork change if Cube's hooks can't do per-folder models cleanly? A: "Yes, via the Cube agent"

**R16 — Non-goals and the backlog**
- Q: Data sources (backlog F18): how much comes into phase 2? A: "All of F18, per folder"
- Q: The design and UI fixes: phase 2? A: "In phase 2"
- Q (asked again, the first answers came back empty): Which backlog groups are in phase 2? A: "All of them"
- Q: Which of these are phase-2 non-goals (individual users on folders; user attributes in Cube; outside notifications; multi-IdP testing in development)? A: "All four"

**R17 — Scope details**
- Q: In a workspace, which folders' cubes does an item resolve against? A: "Its origin folder's path"
- Q: A dashboard in a folder: which cubes can it use? A: "Current folder, then ancestors"
- Q: An approved copy lands on a same-named item. What happens? A: "Replaces it, keeps history"
- Q: Copying a data source into a workspace: its credentials? A: "Copied, never shown"
- Q: When security is first turned on, what happens to phase 1's content? A: "Also lets have self approve.. but any change has to be approved even if it self approve. also for this questions Stays, Super-Admin only"
- Q: With security off, how do workspaces and approval work? A: "Same flows, self-approve"
- Q: Which changes to a shared folder need approval? A: "Content copies only"
- Q: How much history does a replaced item keep? A: "Last 10 versions"

**R18 — resolving the open questions** (asked before writing the spec, because write-spec requires no open questions)
- Q: Where is the Super-Admin AD group named? A: "Deployment configuration"
- Q: A dashboard that uses library charts is copied into a workspace. What happens to those charts? A: "Copied with it"
- Q: A proposed dashboard's cubes resolve only through the workspace's models. What happens? A: "One proposal together"
- Q: A folder's pre-aggregation jobs and schedules: who can use them? A: "Also the folder's RW"
- Q: What does rejecting a proposal do? A: "Back with a reason"
- Q: How long are audit records kept? A: "Configurable" (the option read: "A deployment setting, default 1 year")
- Q: With security on, may the author approve their own proposal? A: "Yes, always"

**R19 — asked while writing the spec** (conflicts and gaps that would otherwise have been invented)
- Q (conflict: R17 "same flows" against R13's "phase 1 intact"): Security off, which holds? A: "Phase 2 flows, self-approve"
- Q: Model goes from the top bar; what about the rest? A: "Data sources stay as a list"
- Q: In a folder where a user has read-only access, what can they see? A: "Dashboards only"
- Q: 'warehouse' in /A and in /A/B/C, and a model in /A/B names it. Which is used? A: "Resolution bottom up.. not top down"
- Q (follow-up, the example): Which is used? A: "/A's — up from the model"
- Q: Box plot whiskers? A: "Make it a configurable option while building the chart"
- Q (follow-up): The default? A: "1.5 × IQR, dots beyond"
- Q: What count should the test use to prove 'hundreds of groups'? A: "maybe 20 groups"

**R20 — choices after component research** (each with a side-by-side comparison and a recommendation)
- Q: How should sign-in be built when security is on? A: "API signs in itself (Recommended)"
- Q: Which development identity provider should docker-compose and the docker-desktop Helm release use? A: "Dex 2.45.1 (Recommended)"
- Q: Where should a data source's connection test run (AC-159 says 'from the wechart service')? A: "In Cube, at wechart's request (Recommended)"
- Q: A model defined in /A is used from /A/B; a join inside it names cube `orders`, and /A/B has its own `orders`. Which is used? A: "The viewer's folder (Recommended)"
  - *Superseded 2026-09-25 by decision 3 (`docs/inputs/2026-09-25-architecture-decisions.md`): names bind at publish from the item's own folder.*

**R21 — credentials and the box plot's row limit**
- Q (first wording, about a "gitignored" development key file): *(The user asked to clarify.)* "I did not understand this question.. what git are we talking about is it the user workspace? if we are using per user git folder, how will multi pod deployment work?" Claude explained that "gitignored" referred to wechart's own source repository, that wechart uses no git at runtime, and that every pod shares the key from the deployment's Secret; the question was about developer laptops only.
- Q: For a developer running wechart on their laptop with docker-compose, where should the encryption key come from? A: "One fixed key in the repo"
  - *Superseded 2026-09-25 by decision 7: wechart holds no decryption key; development uses a fixed xcube key pair (R27).*
- Q: What should a wechart API pod do if it starts without the encryption key, or with the wrong one? A: "Refuse to start (Recommended)"
  - *Superseded 2026-09-25 by decision 7 and R27: wechart refuses without xcube's public key, xcube without its private key.*
- Q: A read-write member changes where a data source connects. Must they type the password again? A: "Yes, re-enter it (Recommended)"
- Q: What should a box plot do when the data has more rows than Cube returns? A: "Use part, with a warning"

**R22 — box plot, country map and default data source**
- Q: Should wechart's box plot let the user choose what one observation is (e.g. one per order)? A: "Yes, an 'Each point is' setting (Recommended)"
- Q: How should wechart decide that a dimension holds ISO-3 country codes? A: "Values, plus a model override (Recommended)"
- Q: Which world map detail should the country map use? A: "Medium detail, 242 countries (Recommended)"
- Q: A cube in a folder's model doesn't name a data source. Which one should it use? A: "Folder source named 'default' (Recommended)"

**R27 — the questions the 2026-09-25 architecture decisions left open** (`docs/inputs/2026-09-25-architecture-decisions.md`; the user confirmed the list of places they contradict, then answered)
- Q: Rebinding (decision 3): when a nearer cube, data source or `default` is published after other items already bound a farther one, or a bound item is deleted, what happens to the items already bound? A: "Rebind at that publish (Recommended)"
- Q: Prefix (decision 2): what is a published cube's, view's or data source's prefix built from? A: "Folder ids (Recommended)"
- Q: AC-309 (decision 3 drops binding from the viewer's folder): what should the criterion become? A: "Retire it (Recommended)"
- Q: Descendants (AC-273, R19): today a data source can come from a descendant folder when no folder on the path up has the name, and a name found in two descendants is refused. Keep that? A: "Drop it (Recommended)"
- Q: Default connection (AC-310, R22): where does the deployment's own `default` data source live? A: "A root data source (Recommended)"
- Q: Crossing folders (AC-025, AC-283): may an item use a cube outside its own folder path by naming the cube's full prefixed name? A: "No: its path only (Recommended)"
- Q: Phase-1 names: charts, dashboards, markings, bookmarks and links from phase 1 name members by short cube names. How do they keep working? A: "The root has no prefix (Recommended)"
- Q: Model history (AC-289): does wechart keep copies of the model files it publishes? A: "Yes, per version (Recommended)"
- Q: Generated policies (decisions 4, 5): which groups does xcube's generated access policy admit to a folder's cubes? Items in /A/B bind cubes from /A, so /A's cubes are queried for /A/B's members too. A: "Reaching it or beneath (Recommended)"
- Q: Preview (AC-166, rule 21): with tokens carrying groups only, what does a Super-Admin's "Preview as" set? A: "Groups only (Recommended)"
- Q: Keys (decisions 1 and 12): Cube must verify wechart's RS256 tokens, but never calls wechart at runtime. How does it get wechart's public keys? A: "Pushed to xcube (Recommended)"
- Q: Hidden folders (AC-263 against AC-264): may a read-only user open a chart that is kept in a folder they can't see, when it's on a dashboard they can? A: "Yes, via the dashboard (Recommended)"
- Q: Credentials (decision 7): where is a newly typed secret encrypted to xcube's public key? A: "In the browser (Recommended)"
- Q: Start-up checks (AC-311 is retired): what should the services check about keys when they start? A: "Both refuse (Recommended)"
- Q: Whole-model refusals (decision 6): when a publish breaks something in a folder the publisher can't see, what does the refusal tell them? A: "Count elsewhere (Recommended)"
- Q: When is the whole-model check run for a proposal? A: "At propose and approve (Recommended)"
- Q: Overlays (decision 8): who may query a workspace's or a proposal's overlay, and how long does it live? A: "Owner, then deciders (Recommended)"
- Q: Build history (AC-150): Cube's refresh worker can no longer post its builds to wechart. How does wechart learn of the builds it starts? A: "Pull from xcube (Recommended)"
- Q: Direct changes (AC-291): do renaming, moving and deleting models, data sources, or folders holding them count as publishes, compiled whole and refused if anything breaks? A: "Yes (Recommended)"
- Q: HA (decision 11): should the query path's high availability get its own acceptance criterion? A: "Yes, testable (Recommended)"
- Claude's reading of decision 12, stated to the user before writing: the service credential covers every call wechart makes on its own behalf rather than for a signed-in user (introspection, builds and jobs, system partitions, health, and every xcube admin call).

**R26 — asked after T323** (its cold review raised it)
- Q: With sign-in on and no Super-Admin group configured, should the API refuse to start? A: "yes"

**R25 — asked while implementing T318–T322** (the cold reviews raised them)
- Q: AC-251 exempts only "health routes", but sign-in's own routes and the model routes Cube reads with its key are exempt too. Reword AC-251? A: "yes go ahead and change it"
  - *The model routes go with decision 1 (2026-09-25): Cube never calls wechart.*
- Q: Add a cross-site check (`Sec-Fetch-Site` / `Origin`) on requests that change something, which the research suggests and no task holds? A: "yes"
- Q: T322 reads AC-008's "every request" as every request made for a signed-in user, wechart's own requests keeping the configured context. Confirm, or reword AC-008? A: "reword to match with the requirements provided"
  - *wechart's own requests use the service credential from decision 12 (2026-09-25).*

**R24 — asked while implementing T316** (the research left it open, and the spec set none)
- Q: With security on, how long should a sign-in last before wechart asks the user to sign in again? A: "12 hours, no idle limit"

**R23 — accepting the phase-2 design direction** (`docs/design/direction.md` §7e)
- Q: Do you accept the phase-2 design direction, including the listed defaults? A: "Accept (Recommended)"
- Q: How should the Access panel show a group? A: "Exactly as the token sends it (Recommended)"
- Q: Should read-only users see a dashboard's or model's version History? A: "No, read-write and Super-Admin only (Recommended)"
- Q: AC-001 lists the Data sources page for every user, but read-only users may see no data sources. What should they get? A: "Hide it from read-only users (Recommended)"
