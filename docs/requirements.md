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
  - **Which groups, and what else** `[IP 8, R28]`. The token carries the user's groups that some access policy names, generated or written in a model. That keeps a user in hundreds of groups inside the request-header limit.
  - It also carries the token's own kind (`role: user`), issuer, audience and expiry. It carries no subject or other attribute of the user.
- What wechart asks Cube or xcube for on its own behalf uses a separate **service credential**: introspection, builds and jobs, system partitions, health, and every xcube admin call `[AD 12, R27]`.
- Compiling belongs to xcube, at publish `[AD 1, AD 6]`, module by module `[IP 4, IP 5]`.
- Cube enforces access too: xcube generates access policies from each folder's allowed groups (below) `[AD 4]`.
- The Security workspace's "Preview as" chooses groups, and previews exactly those `[R27]`.

**Credentials.** Data-source credentials are ~~encrypted in wechart's metadata database, with a key from the deployment's Secret~~ stored in wechart's metadata database, encrypted to xcube's public key; wechart can never decrypt them, only xcube can `[AD 7]`. They are never shown again, and never sent to the browser. This holds in development and in production `[R14, R15]`.
- ~~Every API pod mounts the same Secret, so every pod can decrypt every data source `[R21]`.~~ **Superseded** `[AD 7]`: no wechart pod holds a decryption key. xcube holds the private key.
- ~~Development (docker-compose on a laptop) uses one fixed development key written in the repository's compose file `[R21]`.~~ **Superseded** `[AD 7]`: development uses a fixed xcube key pair. Its private half is in xcube's compose environment only, and wechart is given the public half.
- ~~An API pod that starts without the key, or with a key that can't decrypt the stored credentials, refuses to start and says why `[R21]`.~~ **Superseded** `[AD 7, R27]`: wechart's API refuses to start without xcube's public key. xcube refuses to start without its private key, or with one that can't decrypt a sample credential. Each says which key is missing.
- **A newly typed secret is encrypted in the browser**, before it is sent, so wechart never sees the plaintext, not even for a connection test `[R27]`.
- wechart keeps a credential's lifecycle without decrypting it: copied into a workspace, cleared when the target changes `[AD 7]`.
- Changing where a data source connects (host, account, warehouse and the like) clears its stored secret, so it must be entered again `[R21]`. **Amended** `[X6]`: its TLS settings count too; the keys per driver are under "Slices 4–6 as built".

**Audit.** wechart records sign-ins, permission changes, copies proposed, approved and rejected, and data-source changes. Super-Admins can browse the record `[R14]`. How long records are kept is a deployment setting, one year by default `[R18]`.

**Phase 1's content.** When security is first turned on, everything phase 1 created stays in place as the shared tree, with no groups set. Only Super-Admins see it until they assign groups `[R17]`.

**Cube.** The user's Cube fork may be changed where Cube's own configuration can't meet these requirements. Changes go through the Cube-expert agent, on the fork's branch `[R15]`. They live in xcube's package, and Cube's own code stays unmodified `[AD 1]`.

**Relaxed from phase 1.** ~~A cube's name no longer has to be unique across the whole model.~~ Cubes, models, dashboards and data sources must be unique **within a folder** `[P2 input]`.
- **Superseded in part** `[AD 2, R27]`. The whole deployment is one flat model.
- Every cube, view and data source is published under a unique name, prefixed by its folder's id.
- ~~The shared root adds no prefix, so phase-1 content and links resolve as they are.~~ ~~**Superseded** `[IP 3, R28]`: the shared root is prefixed like any other folder, with no special handling.~~ **Superseded again** `[X3, user]`: **the shared root keeps its bare names** (`orders`), and only an item in any other folder is published as `<folderId>__<shortName>` (`f7k2__orders`). Short names never hold `__`, so the two can't collide `[X3; research xcube-slice-3a.md]`.
  - ~~A published name is `<folderId>__<shortName>`.~~ A published name is the bare short name in the root, and `<folderId>__<shortName>` elsewhere `[X3, user]`.
  - ~~The folder id is written as `f` plus the id's letters and digits, since Cube names can't hold a hyphen or start with a digit. A folder's UUID gives its 32 hex digits. The shared root, whose id is `root`, gives `froot`: one rule, with no special case.~~ **Superseded** `[X3A, R30]`: xcube checks only a folder id's form (`f` and 1–40 lower-case letters and digits; the root `froot`), and wechart allocates the ids. **Each folder stores its xcube id**, allocated when the folder is made and never reused: a folder with a UUID takes `f` plus its 32 hex digits, and any other folder a new id. Stripping an id to its letters and digits would not do, since `ws:a.b` and `ws:ab` would collide `[X3A, R30]`. The id never changes, so renaming or moving a folder changes no name `[X3A]`.
  - ~~xcube gives every cube and pre-aggregation a short, stable `sql_alias`, so database identifiers stay within the database's limits `[plan, R28]`.~~ **Superseded** `[X3; research]`: xcube gives a folder item a short, stable `sql_alias`, and a pre-aggregation one only where its rollup table's name would be too long. Root items keep their SQL and rollup table names as they were, so nothing is rebuilt `[X3A]`.
  - ~~Every stored reference to a member is migrated to the prefixed names in slice 3. That covers charts, dashboards, markings, bookmarks and links, the places R27 lists as naming members by short cube names. Every existing dashboard renders unchanged `[IP 3, plan, R27]`.~~ **Superseded** `[X3, user]`: nothing stored is migrated. Charts, dashboards, markings, bookmarks and links keep naming the root's cubes as they do, so every existing dashboard renders unchanged by construction. A before-and-after comparison of each dashboard's data is kept as a check.

**Architecture** `[AD 1–12, R27; IP 1–9, plan, R28]`
- **Who owns what** `[AD 1]`:
  - ~~Cube plus xcube own the published model, Cube's rules (validation and access policies) and the connection runtime.~~ **Superseded** `[IP 1, IP 2, plan]`:
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
- ~~**Every publish compiles the whole model**, and is refused if anything anywhere breaks `[AD 6]`.~~ **Superseded** `[IP 5, plan]`: **every publish validates each module it affects**, in a throwaway compile, and is refused if any of them breaks.
  - A proposal is checked when proposed, as an overlay, and again at approval `[R27]`.
  - Renames, moves and deletes that touch models, data sources or folders holding them are checked the same way, and refused when something would break `[R27]`.
  - A delete or rename of a name that another published item still references is refused, naming those items `[plan]`.
  - A refusal names what broke in folders the publisher can see. ~~with Cube's error per file~~ Each break comes with its error and its item, and with line and column where xcube can give them `[plan]`. For the rest it says "_n_ items in folders you can't see would break". A Super-Admin sees everything named, and the audit trail records all of it `[R27]`.
- **Unpublished workspace and proposal content** is pushed to xcube as short-lived overlays `[AD 8]`.
  - A workspace overlay is its owner's alone.
  - A proposal overlay may be queried by its author, the target folder's read-write members and Super-Admins until it is approved or rejected, then dropped.
  - Names resolve in the overlay first, then along the target's or origin's folder path `[R27]`.
- **wechart keeps each published version** of its model items, for history, compare and restore. xcube holds only what is published now `[R27]`.
- **Build history:** ~~xcube records the refresh worker's builds, and wechart pulls them into its own history `[R27]`.~~ **Deferred to the next phase** `[R41]`: phase 2 keeps the history of the builds wechart starts. The refresh worker's builds, and what only they supply, come later.
- **Scale:** designed for 100–200 model-bearing folders. ~~Sharding is a later add-on `[AD 9]`.~~ **Superseded** `[IP 4, plan]`: thousands of cubes, with modules keeping compile and planning costs flat.
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
  - **The model store goes in this cut-over** `[R29]`: the `/api/cube-model/*` routes, the publish-drafts table, the route class Cube used, the store settings and the draft claims. ~~Removed in slice 3.~~ Nothing reads them once xcube serves the model.
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
  - **The image** for slices 4–6 is the one built last *(Q18's rule, kept as xcube builds more: `e53cf2a8b8` from 2026-09-27, T459; research `xcube-22132c309c.md`, `xcube-e53cf2a8b8.md`)*: ~~`ghcr.io/senthilkrajagopal/xcube:v1.7.45-ed08180c37`, pulled by digest `sha256:bc041aa208df0cd748b59fbfdbeca8684538f08c67f6020b0316d1efd1eb6fd8`~~ `ghcr.io/senthilkrajagopal/xcube:v1.7.45-e53cf2a8b8`, pulled by digest `sha256:58e5329448f2962d3b95df9b5542db2b94f9b5783531bd8195d25b8246f1ab58`. It carries slices 4, 5 and 6, the TLS binding and overlay data sources `[R31; research xcube-overlay-data-sources.md]`.
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
- ~~xcube's slice 2 at the fork's commit `83cb9f0888`, as the Cube image for every Cube process `[X2]`;~~ **Superseded** `[X3A, the user]`: xcube's published image `ghcr.io/senthilkrajagopal/xcube:v1.7.45-c0610bb768` (3a, 3b and the fixes after them), pulled by digest, as the Cube image for every Cube process;
- `jose` 6.2.12 to sign tokens in wechart's API, and `hpke` 1.1.7 (RFC 9180) to encrypt credentials to xcube's public key in the browser `[R28]`.

**Decided after research** (these were the open items; the user chose on 2026-09-25, rounds R20–R22)

| Item | Decision | Research |
|---|---|---|
| **How sign-in is built** | **wechart's API is its own OIDC client** (openid-client 6.8.8), with a server-side session in the metadata database (@fastify/session 11.1.3 with @fastify/cookie 11.1.2). Not oauth2-proxy `[R20]`. | `docs/research/openid-client.md`; compared with `docs/research/oauth2-proxy.md` |
| **Development OIDC provider** | **Dex 2.45.1**, with users and groups from its config file `[R20]`. | `docs/research/dex.md`; compared with `docs/research/keycloak.md` and `docs/research/authelia.md` |
| **Per-folder models in Cube** | ~~One compile per folder chain, nearest file first, and connections served by wechart `[R20]`.~~ **Superseded** `[AD 1, AD 2, AD 5]`: one flat model owned by Cube and xcube, under folder-prefixed names. xcube resolves names and runs connections. **Then** `[IP 1–4]`: one flat namespace, compiled as modules. wechart is the system of record, and xcube keeps the derived copy. | `docs/research/cube/per-folder-models.md` (superseded); `cube/xcube-runtime.md`, `cube/prefixed-names.md`, `cube/whole-model-publish.md` |
| **How credentials are encrypted** | ~~AES-256-GCM through `node:crypto`, key from the deployment's Secret.~~ **Superseded** `[AD 7]`: encrypted to xcube's public key, in the browser `[R27]`, with HPKE through `hpke` 1.1.7 `[R28]`. | `docs/research/credential-encryption.md` (superseded); `docs/research/credential-sealing.md` |
| **How tokens are signed** | RS256 through `jose` 6.2.12, keys pushed to xcube, and a separate service credential `[AD 12, R27, R28]`. | `docs/research/cube/tokens-and-service-credential.md` |
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
- ~~**Rebinding.** When a nearer definition is published, the items whose binding changes are re-resolved at that publish, and the whole-model compile checks the result. Deleting something others are bound to fails that compile, so the delete is refused, naming what depends on it `[R27]`.~~ **Superseded** `[IP 3, plan, R28]`: **no rebinding.**
  - Each item keeps the binding it was published with. When a nearer definition is published, an item beneath it binds to it only when that item is next published.
  - Deleting or renaming a name that another published item still references is refused, naming those items.
- **Path only.** An item uses only the cubes found on its own folder path, and the chart editor lists only those. A cube elsewhere is reached by publishing an item in a folder beneath it `[R27]`.
- **Prefixes are built from folder ids**, so renaming or moving a folder keeps names, references, pre-aggregations and links. People see titles in the UI; the prefixed name shows only in YAML and SQL `[R27]`.
  - The picker shows each cube's title with its folder path beside it `[plan]`.
  - The name's form and the folder id's are set out in §P2.4, "Relaxed from phase 1" `[IP 3, R28]`.
- ~~**The shared root has no prefix**, so phase-1 content and links resolve as they are, with nothing migrated `[R27]`.~~ ~~**Superseded** `[IP 3, R28]`: the root is prefixed like every folder. Stored references are migrated in slice 3, and every existing dashboard renders unchanged.~~ **Superseded again** `[X3, user]`: **the shared root has no prefix**, and nothing stored is migrated, as R27 had it. Every existing dashboard renders unchanged by construction.
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

*What needs no approval:* creating subfolders, setting permissions, renaming, moving and deleting are direct for read-write members `[R17]`. Where they touch models, data sources or folders holding them, they apply only if ~~the whole model still compiles~~ every module they affect still compiles `[R27; IP 5]`.

*Every proposal* is checked against ~~the whole model~~ every module it affects when it is proposed, and again at approval. An approval that would break anything is refused `[AD 6, R27; IP 5]`.

**F. Bookmarks** `[R12]`
- Personal to each user by default.
- A user can share a bookmark with everyone who can see the dashboard.

**G. Data sources: all of backlog F18, per folder** `[R16]`
- A list per folder, with each source's health.
- Adding a source with a connection test, run by Cube's own drivers at wechart's request `[R20]`, in xcube, which alone decrypts the credential `[AD 1, AD 7]`.
- The six driver types, each with its own authentication.
- ~~The restart note, and~~ whether ~~Cube has~~ every Cube instance has picked the change up `[AD 11]`. No change needs a restart: xcube swaps the connection's driver while queries run. A change of database type lands as a publish, because the SQL dialect is fixed at compile `[plan]`.
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
  - **The warning** is always shown above the editor, and can't be hidden (Q3).

## P2.7 Non-goals for phase 2

- **Individual users on folders.** AD groups only `[P2 input, R16]`.
- **User attributes in Cube's security context.** Groups only, for now `[R14, R16]`.
- **Notices outside the app.** No email or chat `[R12, R16]`.
- **Testing more than one identity provider during development.** Entra ID and brokers are checked at the end of phase 2 `[R14, R15, R16]`.
- ~~**Sharding the model.** Designed for 100–200 model-bearing folders; sharding is a later add-on `[AD 9]`.~~ **Superseded** `[IP 4]`: modules split the compile. Nothing further is planned for scale.
- **Cube Store beyond one node** `[AD 11]`.
- **Anything but wechart's server calling Cube or xcube**, for now `[AD 10]`.
- **xcube's slice 7**, and **aliasing a file-set model's JavaScript, Jinja and Python cubes when their data source's target changes** `[R39]`.
- **Around the SQL runner** `[R50]`:
  - a separate read-only login per data source, which is phase 3 `[R50-2]`;
  - Cube's semantic SQL API (`/v1/cubesql`), still deferred from Part 1;
  - saved or shared queries `[R50-12]`;
  - templating in the SQL;
  - making a cube or a chart from a run's results.
  - *The last four weren't asked for, so they stay out until asked.*

Phase 1's non-goals still stand, except two that phase 2 brings into scope:
- **Users, groups, roles and SSO** (§P2.6 A–B).
- **Maps and geo charts:** the country map, from R8 and the backlog (§P2.6 H).

The rest still apply: AI and chat authoring, scheduled delivery and alerts, embedding, `.dxp` migration tooling, Spotfire Subsets, Tags and Lists and data functions, touch, controls inside text tiles, and selling wechart `[Part 1 §7]`.

## P2.8 Open questions

**None.** All seven were resolved with the user on 2026-09-25 in round R18. The decisions are folded into §P2.2, §P2.4 and §P2.6, and the log is in §P2.9. The seventeen questions the architecture decisions left open were settled in round R27, and are folded into the same sections. The ten the 2026-09-26 plan left open were settled in round R28, in the same way. The four xcube's slice 2 left open were settled in round R29, and are in §P2.4, "Slice 2 as built". The six xcube's slice 3 left open were settled in round R30, after xcube answered the questions they raised, and are in §P2.4, "Relaxed from phase 1" and "Slice 3 as built". The nine that slices 4–6 left open were settled in round R31, and are in §P2.4, "Slices 4–6 as built".

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
| R50-14 | Where in the UI | **A tab on each data source** |

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

**R51 — design 15 approved; copy on move; its questions** (2026-10-01, the user)
- T527's review found a dashboard can still come to show a library chart off its folder's path: by a move, or by approving a copy no save judged. Asked what then: "Copy on move + approval (Recommended)". *AC-371 amended; T537.*
- Design 15 (`docs/design/reviews/2026-10-01/designs/15-sql-runner.html`): "Approve (Recommended)".
  - P1, while off: "Tab with an off panel (Recommended)".
  - Proposals: "P2 CodeMirror SQL editor, P3 Schema browser, P4 Audit the switch, P5 Cube Store switch in ⋯".
  - Q4, a change of login: "Turns off until reconfirmed (Recommended)".
  - Q1: "The selection (Recommended)".
  - Q2: "This source's, 50 at a time (Recommended)".
  - Q3: "Always above the editor (Recommended)".
  - Q5: "The database's own (Recommended)".
  - Q6, rows before a stop: "Show them, marked cut".
  - Q7, Cube Store and workspace owners: "No, switched-on folders only (Recommended)".
  - Q8, a repointed copy: "Needs the switch if repointed (Recommended)".
  - Q9, Cube Store's confirmation: "That everyone allowed reads all rollups (Recommended)".

**R50 — the SQL runner** (2026-09-30 to 2026-10-01, the user)
- The user: "3. Build a SQL runner into wechart through xcube. This would be a guarded admin route that runs read-only SQL on a model's connection, like Cube Cloud's SQL Runner. have any independent agent do analysis on on Cube Cloud's SQL Runner and Superset SQL Lab. You can use superset instance on localhost:8088. (This is a dev instance so you can get the password from the config files if required)"
- *An independent agent studied both (`docs/research/sql-runner.md`). Claude asked its questions:*
  - R50-1, who may run SQL on a data source: "Own-folder writers, if enabled"
  - R50-2, which credential runs it: "Is there anyway to ensure only read-only operations are done on the datastore for example on select queries.. no update, delete, insert queries or not create table create view kind of operation if that is doable we can do that... for phase 3.. we can just go with otion 3 here"
    - *Option 3 was "Serving login, admin attests". Claude answered that read-only can be enforced in layers. Only single SELECT or EXPLAIN statements parse; a read-only transaction applies where the database has one; there is one statement per run, and BigQuery gets a dry run. One gap remains: on Snowflake, SQL Server and Dremio, a SELECT calling a writing function passes the parse, and only a SELECT-only login closes that (phase 3). Recorded so in §P2.6 J.*
  - R50-3, what it can target: "Landed data sources, My workspace's copies, "Cube Store, read-only""
  - R50-4, which statements run: "SELECT and EXPLAIN only"
  - R50-7, row cap: "10,000 rows"
  - R50-8, time cap: "30 seconds"
  - R50-9, concurrency: "1 per user"
  - R50-10, result size: "10 MB"
  - R50-5, who may run SQL on Cube Store: "Same switch as sources"
  - R50-6, a copy in My workspace: "Always, for its owner"
  - R50-11, results: "CSV up to the row cap"
  - R50-12, history: "My own run history"
  - R50-13, audit: "The event + SQL, literals redacted"
  - R50-14, where it lives: "A tab on each data source (Recommended)"

**R49 — design 14 approved; its questions; a restored data source's test; xcube's tokens and the sample policy** (2026-09-30, the user)
- Design 14 (`docs/design/reviews/2026-09-30/designs/14-deleting-clearing-finding.html`): "Approve (Recommended)".
- Its proposals: "P1 Description in rows, P2 Kind in the address". *A folder row's second line shows its description; the chosen kind is kept in the address (`?kind=`) and stays as subfolders open. P3 (auditing deletes) is not adopted.*
- Q1, another user's draft dashboard showing a shared chart: "No, drafts don't block". *Only a dashboard in a shared folder blocks a library chart's delete; a draft that showed the chart loses the tile.*
- Q2, deleting one workspace item that has an open proposal: "Withdraw it, named (Recommended)". *The confirmation names the proposal, and deleting withdraws it, as Clear My workspace does.*
- Q3, readers and the kind filter: "Readers see only Dashboards and chart that they are entitled to.. no filters for readers".
- Q4, permanent deletes: "Permanent, said so (Recommended)". *Every delete confirmation ends "You can't undo this."*
- A data source's version restored as a draft (T515) and AC-158: "Test before proposing (Recommended)". *The draft is saved as the version had it and proposed only once a test of exactly its settings passes; AC-158 is amended so.*
- xcube's query tokens carry only groups (T437), so the phase-1 sample policy's `securityContext.is_employee` can never hold: "Rewrite on groups (Recommended)". *The sample model's policy and the two phase-1 tests (T172, T174) use a group instead.*
- AC-263, a library chart kept in a folder a reader can't see, on a dashboard they may see: once xcube gates folders (T436), Cube refuses its tile. The user chose "Copy on use". *A dashboard shows only library charts found on its own folder's path; putting one from elsewhere on it makes it a chart of the dashboard's own, so no tile ever needs a folder its readers can't see.*

**R48 — deleting, clearing the workspace, a folder per edit, filtering Explore by kind** (2026-09-30, the user; to requirements only, not to be worked on yet)
- The user: "Let us add the option of deleting empty folders, or deleting individual artifacts. Example if charts can be deleted if no dashboards are using it, dashboards can be deleted because nothing else depends on it, datasources can be deleted if no cubes depend on it, and cubes can be deleted if there are no views connecting to it. In workspaece there should be option to clear the entire workspace, when editing a resource from folder view, it should create a project<date+time> folder (And if possible have folder comments on what resource is being modified).. Also in the explore view there should be option to filter resources only by dashboards and charts, or only by datasources, or only by models. Add it the requirements.. dont work on it right now"
- *Folded into §P2.6 I. A data source is already refused a delete while a cube is bound to it.*
- On resuming, the user: "okay lets resume.. first we will tackle the most recent requirements and go on to implementing.. 1. Workspaces and proposals (finishing the edit-in-a-copy flow) and in parallel request 2. Cube enforcing access itself (xcube) ... then we will start with 3. Jobs and Schedules and 5. Audit trail and bookmarks and then 6"
- Claude asked the seven questions. The user's answers:
  - R48-1, a chart some dashboards use: "Refuse until unused (Recommended)"
  - R48-2, what blocks deleting a cube: "Anything depending on it (Recommended)"
  - R48-3, a folder that isn't empty: "Only empty folders (Recommended)"
  - R48-4, clearing My workspace with open proposals: "Withdraw them too (Recommended)"
  - R48-5, the project folder: "One per edit, all copies in it (Recommended)"
  - R48-5b, a new item made in My workspace: "No, only edits (Recommended)"
  - R48-6, the folder's comment: "Editable description, prefilled (Recommended)"
  - R48-7, Explore's kind filter: "The open folder (Recommended)"

**R47 — Jobs: the pre-aggregation's name as plain text** (2026-09-28, the user)
- UX-080 against AC-229: "Plain text, amend AC-229". *A row click only selects. The docked pane's "Open in Model", deep-linking to the pre-aggregation, is the way to its definition. AC-229's "name linking to its definition in Model" is amended to "a way from its row" (T469's follow-up).*

**R46 — design 13 approved; quick calculations on demand; three chart-editor answers** (2026-09-28, the user)
- **Design 13 (export and import):**
  - Claude asked design 13's open questions. The user chose:
    - Q4, the file: "JSON, *.wechart.json". *Named after the dashboard, and renamable before export.*
    - Q5, dependencies in folders the user may not see: "Show the count". *A count with its reason, naming neither them nor their folders (AC-354).*
    - Proposals adopted:
      - P1, "Outline tiles on hover" (AC-360);
      - P5, "Driver-mismatch warning" (AC-361);
      - "Import in My workspace › New", under a divider (AC-192);
      - "⋯ menu in dashboard header", holding Export, as do Explore's row menus (AC-354).
    - Not adopted: P2 (auditing exports and imports), P3 ("imported from *file*"), P4 (editing settings before the test).
  - Then: "Approve". *T508 is split into build tasks.*
- **Quick calculations:** xcube advised generating the companion measures at serve time on the same cube (`to-wechart/2026-09-28-1500-quick-calcs.md`, option c′). The user chose which measures get them: "On demand". *The first request for a measure's calculation recompiles that module once. xcube runs its spike, then builds and publishes an image.*
  - *Claude disables, with the reason, each calculation xcube's table shows would be wrong or change meaning for a measure type. The list is in `to-xcube/2026-09-28-1600-quick-calcs-decision.md`.*
- **T467's UX-057:** a second metric is on another scale when "Its format differs". For two or more such metrics, Auto draws "per-metric small multiples", which are to be built.
- **T468's UX-031:** "Properties panel for filters". *Selecting or adding a filter shows its field, scope and Remove in Properties, with focus in the field picker. The pill's popover keeps the value.*
- **T453's box plot tooltip:** "Keep n: 120 · Marked: 40".

**R45 — quick calculations: four answers** (2026-09-28, the user; T380 and T381 built, T382 next)
- Claude asked four questions. The user chose the recommended answer to each:
  1. **What a calculation does to its measure:** "Replace in place". *One calculation per measure; the pill names it, and the chart draws the calculated measure. To see both, add the measure twice.*
  2. **Rank's scope:** "Across all rows". *One ranking over every row the chart shows (Cube's `grain: {keep_only: []}`), with competition ranking for ties (2026-09-24).*
  3. **% of total with two dimensions:** "Of the grand total". *Each cell's share of everything shown, which is the filtered total (2026-09-24).*
  4. **The chart's last time field removed while a period calculation is applied:** "Keep it, draw plain + note". *The calculation stays chosen but paused. The chart draws the plain measure with a note naming the field it needs, and resumes when a time field returns.*
- *Still open, asked of xcube first (`to-xcube/2026-09-28-1400-quick-calcs.md`): where the companion measures live under the items model; a running total starting at the chart's range (the user's 2026-09-24 answer); which calculations are correct per measure type. Who publishes companions, and when, follows xcube's answer.*

**R44 — an import always lands in My workspace, with warnings; and design 13's first answers** (2026-09-28, the user)
- On design 13, Claude asked four questions. The user chose the recommended answer to each:
  1. **A data source whose name the target already has:** "Map or create". *No Replace for a data source: map it to the existing one, or create it under another name.*
  2. **Skip, for a library chart on the imported dashboard:** "Target's same-named chart".
  3. **Replace with sign-in off:** "Yes, keep it in History".
  4. **Dependencies in Export:** "Ticked". *They start ticked, so the file works wherever it goes.*
- Then the user: "lets have imports always going to the users workspace.. and from there it can follow the usual flow when it is moved to a folder. Does that make sense? will it make the implementation easier and less confusing. While imorting.. show warnings on which resources may be impacted.. for example.. duplicate model or duplicate datasource for instance.. if this makes sense update the import workflow. and also update the ui design.. have a seperate agent work on this"
  - *An import puts everything it holds into the importer's workspace as new drafts. It never replaces, renames or skips a shared item. R43.3's "Ask per item" is superseded, and with it answers 2 and 3 above.*
  - *From the workspace, each item follows the usual flow. Its target is chosen as New in My workspace chooses one. It reaches a shared folder only by Propose and Approve, whose check says what it replaces and refuses what can't land (AC-278, AC-284, AC-288).*
  - *Before importing, wechart warns, without blocking, of what the drafts may affect when proposed:*
    - *an item of the same kind and name in the target or the workspace;*
    - *a model defining a cube or view whose name the target already has (AC-270);*
    - *a data source whose name the target already has (AC-282). Mapping to that one instead is offered beside the warning.*
  - *Answer 1 stands: a data source is mapped to an existing one, or created in the workspace with its secrets entered and a passing test. Where the target has its name, it is created under another name, as AC-282 already requires.*
  - *With sign-in off, the import also goes to the single user's workspace, and they approve their own proposals (R19, AC-254). An earlier note here said sign-in off has no workspace; that was Claude's error, caught by the design agent.*
  - *The design agent redraws design 13's Import to this.*

**R43 — exporting and importing a dashboard; and two answers for markings** (2026-09-28, the user)
- The user: "can we add requirement for export and import dashboard. while exporting dashboard it should give option to select the dependencies.. for datasource, everything can be exported except for the secrets. have any ui agent create a ui-design for this functionality."
- Claude asked four questions. The user chose the recommended answer to each, and all three optional dependencies:
  1. **Where an import lands:** "My workspace, then propose". *Imported items go into the importer's workspace, with the target folder they choose, and reach it by a proposal like any change (AC-278). With sign-in off, straight into the chosen folder.*
  2. **The dependencies offered at export:** "Library charts it shows, Models its charts use, Data sources". *The dashboard's own charts always go with it. Bookmarks are not exported.*
  3. **A same-named item where an import lands:** "Ask per item". *Replace (by proposal where shared), keep both (the import renamed), or skip.* *Superseded by R44: an import lands as new drafts in the workspace, with warnings.*
  4. **An exported data source on import:** "Map or create". *Map it to an existing data source the importer may use, or create it from the exported settings with its secrets entered, tested before saving.*
- *A data source is exported with everything but its secrets: its driver, settings and description; never a secret, sealed or not.*
- *One file holds the export.*
- *A UI design comes first: `docs/design/reviews/2026-09-28/designs/13-dashboard-export-import.html`.*
- *Importing models waits on workspace models (T347, T350). Until then an import holds dashboards, charts and data sources, and the models go by proposal once T347 is built.*
- *For markings (AC-097, T453), the user answered two questions:*
  - *a partly marked table row: "Rule and marked value", the prototype's left rule in the secondary colour, and the marked share beside each measure ("10 · Marked: 4");*
  - *a partly marked scatter point, box plot or map region: "Outlined, hatched, tooltip", as pies and treemaps are drawn. A box plot's box is partly marked when some of its rows are, and each outlier is marked or not.*

**R42 — the waiting questions, in two batches** (2026-09-28, the user, after asking why criteria closed slowly)
- The user chose all four ways to close criteria faster: "Finish chains to close ACs", "Parallel agents in worktrees", "Pin xcube only when needed", "Batch the open questions now".
- Claude put eight of the backlog's questions to the user in two batches. The user chose the recommended answer to each.
  1. **A rejected proposal's Dismiss** (design 05, state M): "Until proposed again". *Stored for the user on every device; the band stays gone until the item is proposed again (T358).*
  2. **Jobs' Trigger column** (AC-229 against design 10): "Both: Trigger + Started by". *"Trigger" stays the refresh key in words (AC-229). "Started by" is added for the builds wechart records (AC-150). The refresh worker's builds show no starter until their history comes, next phase (R41).*
  3. **AC-234's cache warm-up:** "Pre-aggregations only". *A wechart schedule builds pre-aggregations. Result-cache warm-ups are dropped, since they would need tokens per group set (AC-008).*
  4. **AC-155's suspension:** "wechart's, after 3, per schedule". *Only wechart-owned schedules suspend. The number of consecutive failures is set per schedule, 3 by default. Cube's refresh keys keep Cube's own retry with backoff.*
  5. **A BigQuery key, Snowflake OAuth token or Dremio token entered again:** "Warn before replacing". *The form keeps the stored secret unless the user chooses to replace it, and says that replacing it rebuilds the data source's rollups.*
  6. **Query records for a read-write member:** "Their own queries". *wechart records who ran each query. A read-write member sees their own in Jobs; a Super-Admin sees every one (T371).*
  7. **Data as of for a reader:** "Freshness only". *A reader sees what served the tile, how fresh it is and its schedule in words. "Open in Jobs" and "Edit schedule" show only to those who may use them. No refresh-key SQL or file reaches a reader (T371's review).*
  8. **Auditing builds:** "Yes, all three". *A build started from Jobs, a cancel, and a change to a wechart schedule are recorded in the audit trail (AC-294).*

**R41 — the refresh worker's build history, deferred; the rest worked out with xcube** (2026-09-28, the user)
- The user sent xcube's analysis of Jobs and Schedules (`docs/inputs/2026-09-28-jobs-schedules-analysis.md`): "please review it.. and work with cube for implementing these..".
- Then: "History of the refresh worker's build.. we can defer this to the next phase.. and anything else blocked by it to next phase".
  - *Deferred to the next phase, and no task builds them in phase 2:*
    - *the refresh worker's builds in wechart's history: AC-150's worker half, and T373;*
    - *what only that history supplies, for builds Cube starts on its own:*
      - *design 10's "Failed", "Duration vs average", "Trigger: Schedule" and "Recent builds" for such builds;*
      - *design 07's last build outcome, and who started it;*
      - *a "* * * * *" rollup in Run history within one check period (AC-150's Fails-when).*
  - *R40.3's first ask of xcube, the build-event route, is withdrawn.*
  - *Asked of xcube now (`to-xcube/2026-09-28-1200-jobs-schedules-routes.md`):*
    - *the build queue with cancel, R40.3's second ask, with each entry's pre-aggregation (AC-151);*
    - *hidden cubes on the admin meta, so every rollup is listed (AC-154);*
    - *the refresh worker's status: the revision it serves, its last tick and its errors (AC-156).*
  - *wechart moves Jobs' and Schedules' field list to xcube's admin `…/meta?revision=` before security goes on (the analysis; T371 and T437).*
  - *The analysis's options for AC-234's cache warm-up go to the backlog question (R40).*

**R40 — Jobs and Schedules, after an independent sync check** (2026-09-28, the user: "can we have independent ui-expert as well as bi tools/cube expert analyze the jobs and schedules.. and see if the ui designs and the requirements are in sync"; the reports are in `docs/design/reviews/2026-09-28-jobs-schedules/`)
- Claude asked four questions from the two reports. The user chose the recommended answer to each.
  1. **Every Jobs and Schedules route was open to any signed-in user** (a reader could list every folder's rollups, start builds, and read everyone's queries). The user: "Build T371 properly next".
     - *Jobs and Schedules are scoped to Super-Admins and each folder's read-write members, for their own folders, as AC-297 says. T371 is built next, ahead of the rest of designs 05 and 06. Data as of keeps a narrow answer for readers.*
  2. **Design 10 says "building and scheduling need no proposal", but a Cube-owned schedule is a `refresh_key` in the model.** The user: "Schedule edits go by proposal".
     - *Changing a `refresh_key` is a model change: workspace, propose, approve (§P2.6 E, AC-278). "Direct" covers only building now and wechart-owned schedules (AC-234). AC-297's "schedule" reads so. Design 10's note (pin 6, and the pane's note) and `references.md` are superseded on this point.*
  3. **AC-150's history of the refresh worker's builds, and AC-151's queue and cancel, need xcube routes that don't exist.** The user: "Ask xcube for both".
     - *Asked of xcube, through the Cube-expert agent, in `to-xcube/2026-09-28-1100-build-events-and-queue.md`:*
       - *a model-scoped route listing build outcomes (pre-aggregation, table or partition, who started it, start, end, duration, outcome with error, module and epoch);*
       - *a queue route with cancel.*
     - *wechart builds on them once the image is published (R35).*
  4. **Partitions (AC-145), Run history (AC-150), the queue (AC-151), suspend and Resume (AC-155) and wechart's own schedules (AC-234) have no approved design.** The user: "Draw new designs first".
     - *A UI design round draws them, with every state (loading, error, empty, refused), and reconciles designs 10 and 07, before they are built.*
- *The reports' other questions wait in `docs/phase-2/backlog.md` §6, to be asked when their work is reached:*
  - *the meaning of "Trigger" (AC-229);*
  - *what "cache warm-up" is (AC-234);*
  - *whose schedules AC-155 suspends, and the configured number;*
  - *a rollup with both kinds of schedule;*
  - *next runs across DST;*
  - *the refresh worker's indicator;*
  - *readers' Data as of links;*
  - *auditing builds.*

**R39 — xcube's slice 7, and JavaScript, Jinja and Python cubes on a changed target, deferred** (2026-09-28, the user, after Claude reported them still open)
- The user: "requirements and functionality relating to "Lets defer this "Still open: Slice 7 stays deferred, and the file-set gap from before is unchanged: JavaScript, Jinja and Python cubes still aren't renamed when their target changes." it will not be done in this phase." will be deferred and not done in this phase"
  - *Not done in phase 2, and no task builds them:*
    - *xcube's slice 7, the plan's optional slice: Cube's own answers in place of the rules wechart re-implements.*
    - *Aliasing a file-set model's JavaScript, Jinja and Python cubes when their data source's target changes (`to-wechart/2026-09-28-0100-changed-in-place.md`: such a cube keeps its alias, so its rollups renew only on their refresh keys).*
  - *Neither touches what wechart serves: its models are items, and it publishes only YAML (AC-332, AC-335). Both are in `docs/phase-2/backlog.md` §7.*

**R38 — a root item's names, and a data source changed in place** (2026-09-28, the user, asked when xcube `bc18f82c01` renamed every root cube on the stored `default`)
- Claude asked: xcube's new image serves a moved data source from its new target by aliasing each cube by its connection's identity. That also renames the root's cubes and rebuilds their rollups once at upgrade, which breaks AC-328 ("root items keep their names, SQL and rollup tables; no rollup rebuilt"). Options: alias only after a change; accept identity aliases; keep AC-328 strictly.
- The user chose: "Alias only after a change (Recommended)".
  - *A cube keeps the names it has while its connection still has the identity it was first served with. It takes an identity alias only once that connection's target changes (host, database, user or key holder; a password doesn't count), when its rollups are rebuilt anyway. Moved back, it has its first names again. Nothing is renamed or rebuilt at upgrade.*
  - *This keeps `[X3A]`'s "Nothing Cube serves changes for the root's items" until the root's data source is moved to another target. It also keeps the 2026-09-27 answer ("No and No"): a moved data source never answers from its old target's cache or rollups.*
  - *Asked of xcube in `to-xcube/2026-09-28-0700-alias-only-after-a-change.md`. wechart pins the image that carries it, not `bc18f82c01` (T501).*

**R37 — both UI reviews' designs, as a priority** (2026-09-27, the user, while design 03's check ran)
- The user: "after your current work.. please work on designs in /Users/srajagopal/Work/wechart/docs/design/reviews/2026-09-27/designs and /Users/srajagopal/Work/wechart/docs/design/reviews/2026-09-24/designs if there is a conflict.. designs on 2026-09-27 will take precedence and supersede the ones on 2026-09-24. Make this a priority. If any of them is blocked because of decisions to be made, or because of xcube, or because some of the foundational decisions or apis have not been implemented then put them into backlog and continue with the rest.."
- Then: "after completing 03.. deploy to kubernetes.. and the same with all the other pages.. some of them should already be implemented.. keep track of which designs are completed to completion"
  - *The 2026-09-24 designs are to be built as drawn. This supersedes R33's "Bugs and consistency only" for designs 01, 02 and 04–07. Design 03 was approved by R34 and design 08 on 2026-09-25 (F23).*
  - *Where a 2026-09-24 design and a 2026-09-27 design differ, the 2026-09-27 one is built.*
  - *A design's items marked "proposal — needs the user's approval" that the user never decided stay undecided. The same goes for other open questions (a design against an earlier answer, say). All of these go to the backlog, with what is to be decided.*
  - *An item that waits on xcube, or on wechart work not yet built (the proposal chain, the audit trail, build history), goes to the backlog with what it waits on. The rest is built.*
  - *Each design is finished in turn and then deployed to docker-desktop. `docs/design/reviews/status.md` tracks each design's state.*

**R36 — the proposals of designs 11 and 12, and the markings flake** (2026-09-27, the user, after Claude listed the open proposals)
- The user: "okay for both Your OK to fix the flaky markings test's expected count. - The open proposals in 11 and 12 and MW-19... first let me know what is the open proposal for designs 11 and 12 and MW19.. for flaky markings test put in backlog.. we will do it after we complete other things"
  - *The markings test's expectation is to be corrected, later: it is in `docs/phase-2/backlog.md` §2.*
- Claude listed design 11's five proposals and design 12's MW-19. The user: "sure okay for all", then "proveed".
  - *Approved, all six:*
    1. *Generate cubes adds the generated cubes as unpublished drafts in the tree, saved with "Save & reload Cube" as New cube's are, instead of publishing them. This settles the critique's D4, which had been left as built pending the user (AC-345).*
    2. *The Tables step marks a table a cube in the model already reads from as "In model", before generating (AC-347).*
    3. *The Source step shows each data source's health, from Data sources (AC-348).*
    4. *A select-all checkbox for the page in the table list's header (AC-349).*
    5. *With security on, the pane's head says "in My workspace", as design 01's does (AC-350).*
    6. *MW-19: New view writes no `cubes` and opens on its Cubes tab, ready to add one (AC-351).*
  - *What follows from 1, decided by Claude as the one way the drafts compile:* Cube refuses a join to a cube it doesn't have, at compile ("Cube <name> doesn't exist", research/cube/rollup-join-paths.md and whole-model-publish.md), and Generate's cubes often join one another. So saving a draft publishes with it the unpublished drafts it joins, named beside Save before it is pressed (AC-346).
  - *Proposal 2's mark reads the model's `sql_table`s, not a predicted cube name: Cube's scaffolder names a cube by its whole batch (research/cube/introspection-api.md, "Cube names depend on the batch"). The clash check after generating is unchanged (AC-249).*

**R35 — designs 11 and 12, and what the backend can't yet do** (2026-09-27, the user, after seeing designs 11 and 12)
- The user: "i checked the ui design.. and it looks great.. if any of the ui is not based on the backend design., and if it requires redesigning any of the backend (xcube) then it can be put in the backlog. If it is achievable by simple changes in the backend.. then we should do it..."
  - *Read as the approval of designs 11 (Generate cubes) and 12 (the Model overview), as drawn. Their "Proposals (need approval)" notes stay proposals.*
  - *Where a design draws something the backend does not provide:*
    - *if it takes a simple change in wechart's API or in xcube, make it;*
    - *if it needs xcube redesigned, put it in `docs/phase-2/backlog.md` and draw the UI without it.*
  - *Changes to xcube still go through the Cube-expert agent, and are built on only once its image is published.*

**R34 — the Model workspace and Generate cubes, as a priority** (2026-09-27, the user, after T472)
- The user: "Cleanup the models page.. add models page and generate cube page.. all of them are not in sync with the rest of the app and the ui design.. if required use an ui expert agent. take this as a priority. since the app is already running the ui expert can use that to check the experience."
  - *Read as the approval, for the Model workspace, of phase-1 design 03 (`docs/design/reviews/2026-09-24/designs/03-model-workspace.html`), which R33's "bugs and consistency only" had left unapplied. It covers:*
    - *the Model overview;*
    - *a model file's editor;*
    - *"New cube" and "New view", the "add models page";*
    - *Generate cubes, the "generate cube page".*
  - *These are to be brought in line with that design and with the rest of the app as rebuilt since.*
  - *A UI expert's critique of the running app is at `docs/design/critiques/2026-09-27-model-workspace.md`.*
  - *It goes ahead of the other UI work.*

**R33 — the UI reviews of 2026-09-27** (`docs/design/reviews/2026-09-27/`: `ui-review.md` with designs 01–10 for phase 2, and `phase-1-recheck.md`; asked after the user's "The ui for the wizard looks bad.. go back to the ui design review that was run in phase 1.. and clean up the entire ui when we get a chance.. and also for phase 2 requirements run it through a ui expert, get the designs and apply the designs to our screens")
- Q: How should I treat the ten phase-2 designs? A: "Approve all with proposals"
  - *All ten designs are approved as drawn, with their five proposals: vendor logos on the driver tiles (AC-338), the `http://` Dremio Cloud warning (AC-339), BigQuery's `client_email` read in the browser (AC-340), changed and new tiles marked in a review (AC-341), and a hidden same-named cube listed dimmed (AC-342). AC-343 holds every phase-2 surface to its design.*
- Q: The phase-1 designs 01–07 were never approved, and 25 findings are still open. What should the cleanup cover? A: "Bugs and consistency only"
  - *The re-check's broken flows and cross-screen inconsistencies are fixed. The editor's inspector and drawer are not rebuilt to phase-1 designs 01–02.*
- Q: What order should the UI work take relative to the remaining xcube integration? A: "UI first (Recommended)"
  - *The critical bugs first, then the data-source wizard and settings, then the rest of the UI, then T437 (RS256 keys, paused in a stash) and T347 (overlays).*

**R32 — asked after T363's review** (2026-09-27; its cold review found rule 35 and the approved prototype at odds with AC-158's override)
- Q: Test first, or allow "without a test"? Design rule 35 and the approved prototype say a new data source can't be made until its test passes. AC-158 and the task allow an explicit "without a test". Keep the override, or remove it?
  A: "test first, and dont save if test fails.. both in create new as well as edit.."
  - *AC-158 and rule 23 are amended: no override, for a create and for a change to a data source's connection (T461).*
- Q: Wizard tests never used: tests run in a wizard that was then cancelled stay stored, attached to no data source. Should they be cleaned up after some time, or kept?
  A: *(answered with the question above; not separately)*
  - *They are kept for now. A cancelled wizard's tests belong to no data source; those of a wizard that makes one join its history.*

**R31 — what xcube's slices 4–6, as built, left open** (`docs/inputs/2026-09-26-xcube-slice-{4,5,6}-contract.md`, `…-connections-drivers.md` and `…-xcube-overlay-data-sources.md`, checked in `docs/research/xcube-slice-{4,5,6}.md` and `xcube-overlay-data-sources.md`; asked in the conversation, 2026-09-26, numbered as the handoff numbers them)
- Q18: Which xcube image to pin for slices 4–6? The TLS binding exists only from `1249dda9ca` on; `ed08180c37` has it too, with overlay data sources. A: "use the latest one.. whichever was built last"
- Q19 (xcube's question): a workspace copy of a data source can change its driver in a preview, but landing it answers `409 driver_change`. Should the workspace refuse the change up front? A: "Yes"
- Q20: AC-161: xcube never removes the health rows of Cube instances that are gone. Until it does, what should the UI show when stale rows are present? For example, hide rows older than a limit. A: "For example, hide rows older than a limit", then, asked for the limit: "lets do it 1 hr..."
- Q21: AC-273, AC-310: xcube binds a data source only at publish. When a nearer `default` or source appears on a cube's path, should wechart republish the cubes it would now bind differently? A: "No"
- Q22: Dremio Cloud: require `https:` URLs (the token would travel in clear otherwise)? A: "No"
- Q25: Should a chart or dashboard save in a folder be refused while xcube is unreachable (it is now, with a 502), or stored unbound and bound at the next save? A: "Yres" (read as yes, refuse)
- Then asked together (AskUserQuestion, 2026-09-26):
  - Q: How should the shared root's `default` data source get its sealed secret? wechart may never see a plaintext password, but today the chart feeds the database password to Cube's environment. A: "Post-install Job (Recommended)"
  - Q: A data source created new in a workspace, under a published one's full name (same folder, same short name), would replace the published one in the workspace's previews, for published cubes too. Allow that? A: "Copies only (Recommended)"
  - Q: In a proposal's preview, names resolve among the overlay's items first, whatever their folder; once landed they resolve nearest-first along each item's path. So a proposal whose preview worked can land bound to other cubes. What should approval do? A: "Refuse on a difference (Recommended)"

**R30 — what xcube's slice 3, as built, left open** (`docs/inputs/2026-09-26-xcube-slice-3a-contract.md`, checked in `docs/research/xcube-slice-3a.md`; xcube's answers `docs/inputs/2026-09-26-xcube-answers-slice-3.md`, checked in `docs/research/xcube-slice-3b.md`; 2026-09-26)
- The user's brief, before the round, recorded as `[X3, user]`:
  - "Root items keep their bare names. Only items in other folders are <folderId>__<shortName>. Amend AC-328 accordingly and drop AC-331's reference migration: no stored chart, dashboard, bookmark or URL changes, and every dashboard renders unchanged by construction (keep T430's comparison as a check)."
  - "Slice 3 ships as 3a (names) and 3b (modules). 3b needs nothing from wechart: queries, /v1/meta and jobs are routed to modules transparently."
  - "Use image xcube:v1.7.45-f9f833d324."
- Claude listed what the contract changes in the plan; the user answered "go ahead" and "withe interview round R30".
- First asking (folder ids, workspaces, model files, rollback): the user answered each "Please check what is implemented in ~/Work/bi/cube/xcube branch feat/xcube".
- Claude read the fork at `f9f833d324` and reported: folder ids checked only by form, with no mapping; no overlays; exactly one cube or view per item, nothing split; the slice-2 image refused once 3a has run. The rephrased questions were declined with "The user wants to clarify these questions", and the user then said: "If you any questions give it to me as a prompt and i will work with the agent in cube that will answer it for you.."
- Claude wrote the eight questions as a prompt; xcube's answers came back as `[X3A]`. The user then asked that the two sessions work directly through `~/Work/xcube-exchange/`, and: "Build against the published image, ghcr.io/senthilkrajagopal/xcube (amd64 and arm64), pulled by digest."
- Q: xcube's answer: wechart allocates folder ids; they must be stable, unique and never reused, and any injective encoding works (UUIDs as `f` + 32 hex; others e.g. `f` + 24 hex of SHA-256, or a stored counter). Which for wechart's non-UUID ids (seed and workspace)? A: "Stored id per folder (Recommended)"
- Q: xcube's answer: splitting multi-cube files into items when sending is supported, but one cube or view per file keeps error placement and the items hash simple, and is its recommended layout. wechart's model store: A: "One per file (Recommended)"
- Q: xcube's answer: overlays are slice 5 and not built; until then workspaces should stay out of the folder tree, since anything in it is published and served. For slice 3: A: "Out until slice 5 (Recommended)"
- Q: AC-331 (rewrite every stored reference to its prefixed name) no longer applies: root names stay bare, so nothing stored changes. What should the spec do? A: "Retire it, add a new one (Recommended)"
- Q: xcube's answer: there's no xcube field-list route; Cube's /v1/meta, merged across modules and keyed by x-xcube-revision, is the field list (slice 4 plans an own-behalf admin read). T432 ('serve metadata from xcube's merged field list') therefore has nothing new to build. What happens to it? A: "Retire it into T426 (Recommended)"
- Q: xcube's answer: the slice-2 image refuses a schema migrated by 3a or 3b, but xcube's schema is derived data, so the way back is dropping it and letting the slice-2 release re-import its file set (or restoring a pg_dump taken before the first 3a start). For the switch: A: "Drop and re-import (Recommended)"

**R29 — what xcube's slice 2, as built, left open or contradicted** (`docs/inputs/2026-09-26-xcube-slice-2-contract.md`, checked in `docs/research/xcube-slice-2.md`; asked together, 2026-09-26)
- Q: xcube takes only plain YAML by default. The seed model holds one Jinja file, cubes/product_catalog.yml, which AC-140 shows read-only and model.spec checks Cube compiles. What happens to non-YAML files when wechart pushes its whole model to xcube? A: "Leave them out (Recommended)"
  - *The option read: "Only YAML files go into xcube's snapshot. Non-YAML files already stored stay viewable read-only (AC-140) but are never served. The seed's template is rewritten as plain YAML so product_catalog keeps working."*
- Q: A publish's rollup probes: the fork session's contract sends compare: true so a rollup already refused before the change doesn't block it. The requirements (AD 6, then IP 5) say a publish is refused if any module it affects breaks, and the research says the second probe can go. Which holds? A: "Refuse every break (Recommended)"
- Q: When do Cube's model callbacks go: /api/cube-model/*, the publish_drafts table (T418's interim fix), the CUBE route class, WECHART_MODEL_STORES/KEY and the draft claims? A: "In slice 2's cut-over (Recommended)"
- Q: xcube's admin routes take a static token from XCUBE_ADMIN_TOKENS (32+ characters, rotatable as a list), which slice 4 replaces with the service credential. AC-326 says every own-behalf call uses the service credential. For slice 2: A: "Static token until slice 4 (Recommended)"

**R28 — the questions the 2026-09-26 integration plan left open** (`docs/inputs/2026-09-26-integration-plan-decisions.md`; the list of places it contradicts went to the user first, and the user answered all ten in one message, then asked that the whole list be worked through)
- Q1: The shared root: R27 kept its names unprefixed, with nothing migrated. Decision 3 and the plan prefix every name and migrate chart and dashboard references in slice 3. Should the root be prefixed too? A: "keep it consistent... no special handling for root"
- Q2: Overrides: when a child folder publishes its own `orders`, do its existing items switch at once (R27, AC-275) or when each is next published (the plan)? A: "agree.. only when it is next published"
- Q3: Folder ids in names: wechart's folder ids are UUIDs, which Cube names reject. Recommended: `f` plus the UUID's 32 hex digits, with xcube's short `sql_alias` keeping database names short. A: "sql_alias"
- Q4: Token claims: groups trimmed to those some policy names, plus `role`, and no `sub`? A: "sounds good"
- Q5: Keys: wechart pushes its JWKS to xcube through an admin route, never fetched from wechart? A: "okay"
- Q6: Folder access in Cube: gate policy evaluation by folder inside xcube, rather than write folder policies into the model, where Cube would OR them with authored ones? A: "okay"
- Q7: Model files: xcube accepts YAML only, with Node's `require` off, because model code runs where credentials are decrypted? A: "okay"
- Q8: Libraries: `jose` 6.2.12 to sign tokens, `hpke` 1.1.7 to encrypt credentials in the browser? A: "okay"
- Q9: AC-136, AC-137 and AC-009 stay ticked until slice 3 changes how publishing works, then are retested? A: "okay"
- Q10: Which branch for the xcube slices? A: "feat/xcube all work with be in feat/xcube until i merge to main explicitly"
- Claude's reading of Q3, stated to the user before writing: Cube names can't hold a raw UUID, so a name is `f` plus the UUID's 32 hex digits, and xcube's `sql_alias` keeps database identifiers short.
- The user, after the answers: "We now have to work though all of this" (the list, pasted back).

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
