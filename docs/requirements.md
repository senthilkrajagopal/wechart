# wechart requirements

**Status:** written 2026-09-19 from the project interview (rounds R1–R6). Input files: `docs/inputs/2026-09-19-product-direction.md` (§1–13). Design work already done is in `docs/design/`; Cube research is in `docs/research/cube/`.

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
| **Backend**               | **A wechart Node/TypeScript API with Postgres**: stores dashboards, charts, folders and settings; proxies Cube with a security context; tests connections; runs the scheduler. The browser never holds Cube credentials.        | `[R5]`                     |
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
- **In:** **generating cubes from database tables**, by browsing a connection's schemas and tables `[R6 confirmation]`.
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
- Constraint: Cube Core has no production connection-test API, so wechart's server runs the test itself `[research/cube/data-sources.md]`.

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
