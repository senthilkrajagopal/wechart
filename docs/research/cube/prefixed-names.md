---
library: Cube naming rules for folder-prefixed names (Cube Core, Cube Store, xcube publish-time binding)
packages: []
version: 1.7.45
researched: 2026-09-25
sources: [
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/data-modeling/concepts/syntax.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/cube.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/view.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/view-group.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/joins.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/context-variables.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/connect-to-data/multiple-data-sources.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/connect-to-data/data-sources/postgres.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/pre-aggregations/using-pre-aggregations.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/cross-data-source-queries.mdx,
  https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts,
  https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts,
  https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts,
  https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts,
  /Users/srajagopal/Work/bi/cube (local checkout, see "Provenance"),
  https://github.com/cube-js/cube/issues/907,
  https://github.com/cube-js/cube/issues/4019,
  https://www.postgresql.org/docs/current/sql-syntax-lexical.html,
  https://docs.snowflake.com/en/sql-reference/identifiers-syntax,
  https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-names,
  https://docs.cloud.google.com/bigquery/docs/tables,
  https://docs.cloud.google.com/bigquery/docs/schemas,
  https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers,
  https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Database-Object-Names-and-Qualifiers.html,
  https://www.rfc-editor.org/rfc/rfc9562.html
]
---

# Cube 1.7.45: folder-prefixed names in one flat model

> **Superseded in part, 2026-09-26**, by the final integration plan ([docs/inputs/2026-09-26-integration-plan-decisions.md](../../inputs/2026-09-26-integration-plan-decisions.md), decision 3; [the plan's snapshot](../../inputs/2026-09-26-integration-plan.md), "Names") and round R28 (requirements §P2.4, AC-328). The researcher's text below is kept as written.
> - **Replaced: the scheme.** "`w` + 10 hex + `_`" becomes `<folderId>__<shortName>`, with the folder id written as `f` plus its letters and digits. A UUID gives its 32 hex digits, and the root gives `froot` (R28 Q3).
> - **Why length stops mattering.** xcube sets a short, stable `sql_alias` on every cube and pre-aggregation, so the identifiers Cube builds in SQL are the alias's, not the name's. That is §5's budget and this doc's rule 4.
> - **Replaced: the unprefixed root.** The shared root is prefixed like every folder (R28 Q1). That drops rule 2 (root names avoid the prefix pattern) and removes Gotcha 2's silent capture by a root cube. A short name xcube fails to rewrite now fails to compile.
> - **Replaced: rebinding.** A published item keeps its binding until it is next published (R28 Q2).
> - **Still holds:**
>   - the identifier grammar and case folding (rules 3 and 5);
>   - where references sit in a model file (§6), and the rewriting procedure;
>   - the database identifier limits (§4) that the aliases must meet;
>   - the gotchas on `extends`, `FILTER_PARAMS`, views' `prefix`/`split`, and Postgres truncation.
> - **The `__` separator:** Cube uses `__` between cube and member in its SQL aliases. With `sql_alias` set, that alias is the short one, so `f…__orders__count` never reaches SQL.

> **Corrected again, 2026-09-26**, by xcube's slice 3 as built, checked in [../xcube-slice-3a.md](../xcube-slice-3a.md) and [../xcube-slice-3b.md](../xcube-slice-3b.md), and round R30 (requirements §P2.4, AC-328). The note above is kept as written.
> - **The root is bare again.** Root items keep their short names; only items in other folders are `<folderId>__<shortName>`. Rule 2 and Gotcha 2 apply as the researcher wrote them: a root name never holds `__`, so it can't be taken for a prefixed one.
> - **Folder ids are wechart's to allocate and store,** never reused. xcube checks only their form, `^f[a-z0-9]{1,40}$`, root `froot`. Stripping an id to its letters and digits isn't injective.
> - **`sql_alias` goes on folder items only,** and on a pre-aggregation only when its rollup table's name would pass 25 characters of stem. Root items keep their SQL and rollup table names.

## Summary

**What this covers.** This doc covers the naming scheme that gives every cube, view and data source outside the shared root a unique name. The name is built from the item's folder id, so the whole deployment compiles as one flat Cube model. It also covers how xcube rewrites short names into those full names at publish. The decisions it serves:

- `docs/inputs/2026-09-25-architecture-decisions.md`:
  - **AD 2:** one flat namespace, in which every name is prefixed by its folder (L6).
  - **AD 3:** a short name is bound at publish, nearest first from the item's own folder, and stored as the full name (L7).
  - **AD 5:** xcube knows the folder tree and does the resolving (L8).
- **R27** (`docs/requirements.md` §P2.4 L464-467 and §P2.6 D L541-551):
  - prefixes are built from folder ids;
  - the shared root adds no prefix;
  - renaming or moving a folder changes no published name;
  - people see titles, and the prefixed name appears only in YAML and SQL.
- **Criteria** (`docs/spec.md` F28, L964-987):
  - AC-272 and AC-273: binding;
  - AC-274: isolation, including pre-aggregations;
  - AC-275: rebinding;
  - AC-310: the `default` data source;
  - AC-328: prefix by folder id, root unchanged, stable under rename and move;
  - AC-329: titles only.

**Findings that decide the design:**

1. **Cube's name grammar is `^[_a-zA-Z][_a-zA-Z0-9]*$`, with no length limit.** Cube and view names share one namespace across the whole model. The docs add three rules: start with a letter, don't use a Python keyword, keep names unique ([cv] L37-39, L1168-1169; [dict] L17-33; [d-syntax] L80-93). A `data_source` value is any string ([cv] L1178).
2. **Every name ends up in SQL.**
   - `aliasName` lowercases names through `inflection.underscore`. It turns `cube.member` into `cube__member`, and `cube.preAgg` into `cube_preAgg` for table names ([bq] L4229-4247).
   - A pre-aggregation table is `<schema>.<alias>_<preAgg><partition>_<≤8>_<≤8>_<7>` ([opa] L20-60, L882-888; [prl] L605-625).
3. **The database's identifier limit is the real length limit.** Postgres cuts identifiers at 63 bytes ([pg-ident]).
   - On Postgres, a pre-aggregation table that is built in, or staged through, the source database must satisfy `len(alias) + len(preAgg) + partition ≤ 36`.
   - A result column alias must satisfy `len(alias) + 2 + len(member) (+1+granularity) ≤ 63`.
   - If a column alias is truncated, Cube can't map the returned column back to its member ([qrt] L383-386).
4. **A full UUID doesn't fit in the prefix.** It takes 25 to 32 characters in any case-insensitive encoding, which leaves almost nothing of Postgres's budget. A fixed 40-bit slice of the UUID fits, and version-4 UUIDs are random in those bits ([rfc9562] §5.4; [node-uuid]).
5. **References to cubes are spread widely.**
   - They sit in about 30 field patterns ([cpt] L14-48).
   - They also appear in property positions: join paths `a.b.c` and `FILTER_PARAMS.<cube>` ([sym] L1261-1279; [bq] L5464-5513).
   - Cube resolves a name as a cube before it tries a member ([sym] L1428, L1453).
   - The root stays unprefixed, so a missed rewrite can silently bind to a root cube of the same short name.
6. **`/v1/meta`'s default title is built from the name** (`titleize(cubeName)`), and member titles are prefixed with the cube's title ([meta] L181-186, L240, L477-482). So xcube must write an explicit `title` for AC-329.

**Recommendation in one line.**

- A folder item's published name is `w` + the first 10 hex digits of the folder's UUID + `_` + the short name. For example, folder `3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90` gives `w3f2a9c1e5b_orders`.
- The shared root (`root`) keeps short names.
- Rules for uniqueness, the reserved root pattern, titles, `sql_alias`, view aliases, `data_source` and a length check at publish are set out under Recommendation.

**Provenance.**

- The local checkout `/Users/srajagopal/Work/bi/cube` is on branch `spike/xcube-feasibility` (`.git/HEAD`), and its packages report 1.7.45 (`packages/cubejs-schema-compiler/package.json` L5).
- I cross-checked these against the **v1.7.45 tag** on GitHub, and they match:
  - `identifierRegex`, `baseSchema` and the view `cubes` keys (`CubeValidator.ts`);
  - `encodeTimeStamp`, `version()`, the `tablesToVersionEntries` regex and `targetTableName` (orchestrator `PreAggregations.ts`);
  - `createTable`, `readOnly()` and `capabilities()` (`PostgresDriver.ts`);
  - how the build strategy is chosen, the temp-table flags, the cleanup check and `toDrop` (`PreAggregationLoader.ts`);
  - the docs' Naming section (`syntax.mdx`).
- Every other `file:line` is the checkout's and may drift from the tag.
- Nothing was run. Runtime behaviour is derived from source unless marked as observed. The probes are listed at the end.

## Rules

### 1. Identifiers: cubes, views, members, view groups, data sources

| Thing | Rule | Source |
|---|---|---|
| Cube and view `name` | Joi `identifier` = `/^[_a-zA-Z][_a-zA-Z0-9]*$/`. The cube and view schemas both inherit `baseSchema.name`. | [cv] L37-39, L1168-1169, L1211, L1315 |
| Docs' naming rules | "Start with a letter", "letters, numbers, and underscore", "Not be a reserved keyword in Python", with the DAX API "not clash with the names of columns in date hierarchies", and "Cube and view names must be unique across the data model" | [d-syntax] L80-93 |
| Uniqueness | One `Map` keyed by exact `name`, so matching is case-sensitive. The errors are "Found duplicate cube name", "duplicate view name" and "conflicting cube and view name". YAML files also check duplicates within each file. | [dict] L10-37; [yaml] L99, L106, L113 |
| Member names | Keys must match `identifierRegex`, and must be unique within their cube | [cv] L950, L1022, L1059; [yaml] L436-443 |
| Length | Cube sets none: the regex is unbounded and the docs name no limit | [cv] L37; [d-syntax] L80-93 |
| Reserved in references | `CUBE` and `TABLE` mean the current cube. The context symbols are `SECURITY_CONTEXT`, `security_context`, `securityContext`, `FILTER_PARAMS`, `FILTER_GROUP` and `SQL_UTILS`. `USER_CONTEXT` throws. Python keywords are refused in `{…}`. `groups`, `userAttributes` and `user_attributes` become security-context shorthands unless they resolve as symbols. `__user` and `__cubeJoinField` pass through `aliasName` unchanged. | [sym] L268-279, L1410-1412, L1618-1620; [py] L66-70; [cpt] L320, L350-373; [bq] L4242-4245 |
| View groups | "Unique among all view groups within a deployment". The schema is `Joi.string()` with no regex. | [d-vg] L20-24; [cv] L1262-1278 |
| `data_source` | `Joi.string()`, with no character or length rule in the model. It defaults to `'default'`. | [cv] L1178; [bq] L602-604 |
| `sql_alias` | Cube or view: `Joi.string()`. Pre-aggregation: `Joi.string().optional()`. Neither is an identifier regex. | [cv] L1177, L555 |
| Cube Store identifiers | They can't start with a digit, only with a letter, `_`, `$` or non-ASCII. Table and schema names are kept as written, so they are case-sensitive. | [cs] L733-740, L752-765 |

The validator allows a leading `_` ([cv] L37); the docs require a letter ([d-syntax] L84).

### 2. `sql_alias`, and how Cube builds SQL aliases

- **`aliasName(name, isPreAggregationName)`** ([bq] L4229-4247) works in four steps:
  1. It uses `options.memberToAlias[name]` if that is set.
  2. It replaces the cube part with the cube's `sqlAlias`, if it has one.
  3. It runs `inflection.underscore(name)`.
  4. It replaces `.` with `__`, or with `_` for pre-aggregation names.
- **`inflection.underscore` (1.13.1)** turns each uppercase letter into `_x`, strips one leading `_`, and lowercases everything ([infl] L571-572, L794-807). Consequences:
  - `Orders` and `orders` get the same alias, though Cube treats them as two cubes ([dict] L11-37).
  - `_orders` aliases as `orders`.
  - Names of `[a-z0-9_]` that don't start with `_` pass through unchanged.
- **Tesseract** (the Rust planner) uses `sql_alias`, or the cube name if there is none ([qt] L191-196). It converts with `convert_case` snake case, and all of its word boundaries involve an uppercase letter ([plan] L18-43, L150-162). By inference, all-lowercase names pass through unchanged there too (Open questions).
- **Where aliases appear:**
  - Table alias: `"<alias>"` ([bq] L784-786, L3759-3768). Some subqueries build `<prefix>__<alias>` with `cubeAliasPrefix` (L3760-3765).
  - Member column: `<alias>__<member>` ([bq] L4246).
  - Time dimension: `<alias>__<dim>_<granularity>` ([btd] L70-78).
- **Result rows are mapped back by exact alias.** A column the map doesn't know fails with "Member name not found for alias" ([gw] L2005-2017; [qrt] L383-391, L619-623).
- **The docs on `sql_alias`:** "Use `sql_alias` when auto-generated cube alias prefix is too long and truncated by databases such as Postgres … `sql_alias` affects all member names including pre-aggregation table names" ([d-cube] L108-132).
- **Upstream issue.** Issue #4019, "Auto aliasing for generated SQL", is **open**. `aliasName` carries a TODO pointing to it ([i4019]; [bq] L4240-4241).

### 3. Pre-aggregation table names

- **Logical name** ([scpa] L450-457; [bq] L4393-4400): `<schema>.<aliasName("<cube>.<preAgg sqlAlias or name>", true)>`.
  - The pre-aggregation's own `sql_alias` replaces only the pre-aggregation part. The cube part still comes from the cube's alias.
  - The schema defaults to `prod_pre_aggregations`, or `dev_pre_aggregations` in dev mode ([opts] L411-415).
- **Partition suffix:** the date range start, formatted as `YYYYMMDD` (8 characters), `YYYYMMDDHH` for hour (10) or `YYYYMMDDHHmm` for minute (12) ([prl] L605-625).
- **Physical name:** `<name>_<content_version>_<structure_version>_<updated>` (naming v2) ([opa] L882-888; [pal] L266-272).
  - Each version is at most 8 characters: 40 bits of an md5, in a 32-character alphabet ([opa] L28-60).
  - `<updated>` is Unix seconds in base 32. That is 7 characters for every time between 2004 and about year 3058, since 32⁶ s ≈ 1.07e9 and 32⁷ s ≈ 3.4e10 ([opa] L20-22).
  - So the fixed overhead is **27 characters** (`_` + `_cv` + `_sv` + `_ts`). **Table identifier = len(alias) + len(preAgg) + partition + 27.**
- **Parsing names back:** the regex is `/(.+)_(.+)_(.+)_(.+)/` and greedy ([opa] L240-268). Underscores inside the cube part are therefore safe, but a truncated name misparses. Issue #907, "Postgres table name limit on preaggregation tables", reports "timestamps are not valids" for over-long names ([i907]).
- **Pre-aggregation ids** are `<cube>.<preAgg>`, using the full cube name ([scpa] L381).
- **Structure version** = hash of the load SQL (plus indexes, stream offset and output types) ([opa] L74-87). It contains only alias-derived names, never a folder title or path.

**Where tables are created:**

| Build | Where the table lives | Source |
|---|---|---|
| `rollup` and `rollup_join` default to `external` when `CUBEJS_EXTERNAL_DEFAULT` is on, which is the default | Cube Store | [sym] L772-777; [env] L2079-2081 |
| External, with a **writable** source | **Staged in the source database** under the same physical name, downloaded, then dropped. This applies to Postgres by default: `readOnly()` is false and `capabilities()` lacks `unloadWithoutTempTable`. | [pal] L469-489, L635-654, L667-669, L739-768, L711-728; [pg] L478-480, L528-532; the docs' "Simple" strategy ([d-upa] L1136-1141) |
| External, with a **`readOnly`** source | No source table. The query is streamed or unloaded, and Postgres supports batching in read-only mode. | [pal] L476-484, L782-803; [d-pg] L59-65 |
| Not external (`original_sql` defaults here) | The source database, through `CREATE TABLE … AS` | [sym] L772-777; [pal] L594-633; [bq] L4402-4405; [bd] L463-465 |

**Cube's own length checks** exist only in the drivers' `createTable`: Postgres "longer than 63 symbols" (counting `schema.table`), Redshift 127 and MySQL 64 ([pg] L444-450; [rs-drv] L298-302; [my] L284-285). `createTable` runs only when rows are uploaded into that database as the pre-aggregation target ([bd] L483-492, L566-577). It does not run for `CREATE TABLE … AS` staging ([bd] L463-465).

**Cube Store:** I found no length check. A grep of `rust/cubestore` for name-length patterns returned nothing, so this is UNVERIFIED.

### 4. Identifier limits of the six driver types

| Engine | Limit | Case | Source |
|---|---|---|---|
| Postgres (18 docs) | `NAMEDATALEN`-1 = **63 bytes**. "longer names can be written in commands, but they will be truncated" | Unquoted names fold to lowercase | [pg-ident] |
| Snowflake | 255 characters | Unquoted names are stored as uppercase | [sf-ident] |
| Databricks (Unity Catalog) | "Object names cannot exceed 255 characters" | Stored as lowercase | [dbx-names] |
| BigQuery | Tables: 1,024 UTF-8 bytes. Columns: 300 characters. | Table names are case-sensitive; column names that differ only in case count as duplicates | [bq-tables]; [bq-cols] |
| SQL Server | 1-128 characters; local temp tables 116 | Depends on collation | [ms-ident] |
| Oracle | 128 bytes if `COMPATIBLE` ≥ 12.2, **30 bytes** otherwise | Unquoted names are uppercase | [ora-names] |

### 5. Where a long name breaks (Postgres, 63 bytes)

The budgets below assume the prefix recommended here: `w` + 10 hex + `_`, which is 12 characters.

| Identifier | Formula | Root budget | Budget with a 12-character prefix |
|---|---|---|---|
| Staged or in-source pre-aggregation table | alias + preAgg + partition + 27 ≤ 63 | short + preAgg + partition ≤ 36 | ≤ 24 |
| Result column alias | alias + 2 + member (+ 1 + granularity) ≤ 63 | short + member + granularity ≤ 60 | ≤ 48 |
| Table alias | alias ≤ 63 | 63 | short ≤ 51 |

What breaks. All of these are source-derived inferences, and the probes listed at the end would observe them:

1. **A column alias over 63 bytes.** Postgres truncates it ([pg-ident]), the result column no longer matches the alias map, and the query fails ([qrt] L383-386).
2. **A staged table over 63 bytes.** Postgres creates it under the truncated name.
   - Cleanup drops it only if `schema.<full name>` is among the tables Postgres lists, so the temp table leaks ([pal] L719-728).
   - `dropOrphanedTables` compares the listed names with full names ([pal] L1145-1149).
   - Two partitions that differ only after byte 63 map to one table.
   - In-source pre-aggregations parse their versions back out of the table name ([opa] L243), which is what issue #907 reports ([i907]).
3. **Oracle with `COMPATIBLE` below 12.2.** Even `w3f2a9c1e5b_orders__created_at_day` (34 bytes) is over the 30-byte limit ([ora-names]).
4. **The other engines** allow 128 to 1,024, which is comfortable for the prefix recommended here.

### 6. References to cubes, views and data sources in a model file

| Site | Shape | How Cube reads it | Source |
|---|---|---|---|
| Cube or view name | `name: orders` | A literal string | [yaml] L101-110, L191-197 |
| Join target | `joins: - name: customers` | "The name must match the name of the joined cube" | [d-joins] L56-59; [cv] L1184-1202; [cpt] L217-248 |
| `extends` | `extends: orders` | A Python expression, resolved through the cube dictionary; the parent becomes the child's **prototype** | [yaml] L269-271; [cpt] L77-79; [sym] L537-541 |
| `{cube}`, `{cube.member}` in `sql`, `sql_table` and similar | Python f-string | Identifiers are resolved with **the cube before the current cube's member** | [yaml] L233-238, L394-396; [sym] L1408-1454; [d-syntax] L367-456 |
| Join paths `{a.b.member}` and views' `join_path: a.b` | Every segment but the last names a cube, in **property position** | Resolved left to right by the symbol proxies. The transpiler collects only the head identifier. | [sym] L1261-1279; [cpt] L309-318; [d-syntax] L458-470; [d-view] L512-518 |
| `{CUBE}`, `{TABLE}` | The current cube | Needs no rewriting | [sym] L279 |
| `FILTER_PARAMS.<cube>.<member>.filter(…)` | The cube appears as a property of a context symbol | **Not checked at compile.** At query time `cubeNameFromPath` throws "Cube 'x' not found" | [d-ctx] L142-157; [bq] L5464-5479; [ev] L1041-1047 |
| Pre-aggregation references | `measures`, `dimensions`, `time_dimension`, `segments`, `rollups`, index `columns`, `output_column_types` | Python expressions | [cpt] L26-29 |
| Member references | `drill_members`, `order_by`, `time_shift.time_dimension`, `reduce_by`/`group_by`/`add_group_by`, `filter`, `grain`, `case.switch`, `mask.sql`, `links` `url` and `params` | Python expressions | [cpt] L18-25, L45-47 |
| Hierarchies, access policies, views' `includes`/`excludes`, `folders.join_path`, `default_filters`, `view_group(s)` | | Python expressions | [cpt] L30-44 |
| `view_groups` `includes` | View names | String literals | [yaml] L131-189 |
| `data_source`, `sql_alias`, `title` | Plain strings | Wrapped as f-strings, so `{…}` inside them is a template | [yaml] L272-280; [cv] L20-35 |
| View members with `prefix: true` | Named `<alias or last join-path cube>_<member>` | Generated | [sym] L942-946; [d-view] L539-548 |
| Views with `split: true` | Generate a view named `<view>_<alias or cube>`, added **after** the duplicate check | Generated | [sym] L334-339, L1017-1028 |
| `sql_table: sales.orders` | A database table, **not** a cube reference | | [d-syntax] L194-226 |

**`extends` inherits through the prototype.**

- `createCube` sets the parent definition as the child's prototype ([sym] L537-541). The evaluated cube is that same object ([sym] L314-350; [ev] L221-267).
- So a child that doesn't set `sqlAlias`, `title` or `dataSource` reads the parent's values. This is inferred from source (Open questions, P3).

**Rewriting approaches.**

- **(a) Parse and rewrite the text.** Read the YAML with a parser that keeps positions. Pick fields by Cube's exported `transpiledFieldsPatterns` ([cpt] L14-48), plus `extends`, `joins[].name`, `data_source`, `sql_alias` and the `view_groups` strings. Tokenize each expression and replace identifiers in place.
  - Cube's `PythonParser` is built on antlr4 ([py] L2), and antlr4 tokens carry `start` and `stop` offsets ([antlr] L17-18). But Cube emits Babel nodes without positions ([py] L233-238), so xcube needs its own pass over the grammar.
  - For simple f-strings, the fast-path regex matches Cube's ([py] L72-74).
  - The output is plain Cube YAML containing the full names. That matches "stored as the full prefixed name" (AD 3) and "the prefixed name shows only in YAML and SQL" (R27). Cube compiles it unmodified (AD 1, §P2.4 "Cube's own code stays unmodified", requirements L462).
- **(b) Use Cube's own compiler symbols.**
  - Run `YamlCompiler` and `CubePropContextTranspiler` with a resolver that knows the path's names. The parameters of the generated arrow functions show exactly which identifiers Cube treats as references ([cpt] L95-126, L285-318).
  - But the output is transpiled JavaScript with no source positions, so it can't be written back as YAML.
  - Binding inside the compiler would need per-file scopes in `CubeSymbols`, which is Cube's own code.

### 7. What the chart side sees (`/v1/meta`, queries)

- **Cubes:** `{ name: <full name>, type: 'cube' | 'view', title: <title or titleize(name)>, meta, … }` ([meta] L237-240, L286-296).
- **Member titles:**
  - `titleize` = `inflection.titleize(underscore(PascalCase(name)))`, with `Id` changed to `ID` ([meta] L181-186).
  - With no explicit title, `w3f2a9c1e5b_orders` titles itself "W3f2a9c1e5b Orders". That is an inference from those lines.
  - A member's `title` is `"<cube title> <member title>"`, and its `shortTitle` is the member title alone ([meta] L318-322, L366-368, L477-482).
- **Member names** are `<cube name>.<member>` ([meta] L318, L366).
  - A query names members the same way, for example `w3f2a9c1e5b_orders.count`, and results are keyed by those member names ([gw] L2005-2017).
- **Root cubes keep their short names,** so phase-1 queries such as `orders.count` resolve unchanged (AC-328).
- **`public: false` members are omitted** from `/v1/meta` ([r-apis] L130).

### 8. Data-source names

- **The model value** is passed to `driverFactory` as `context.dataSource` ([d-cube] L219-225; [types] L89-90, L165). It is free text ([cv] L1178).
- **With no `data_source`, a cube uses `'default'`** ([bq] L602-604; [capi] L302).
  - `getSqlGenerator` always resolves the `default` dialect first ([capi] L312-321, L332-349), so a source named `default` must always resolve.
  - A query that joins cubes on different sources is rejected at query time: "To join across data sources use rollupJoin…" ([bq] L594-600; [d-xds] L357-362).
- **`CUBEJS_DATASOURCES`** is a comma list ([env] L414-420).
  - **When it is set,** every name the model uses must be in it, or Cube throws "data source is missing in the declared CUBEJS_DATASOURCES" ([env] L88-101).
  - Env keys become `CUBEJS_DS_<NAME uppercased>_…` ([env] L106-126).
  - The pre-aggregation keys are rewritten by `/^(CUBEJS_DS_[A-Z0-9_]+?_)(DB_|JDBC_|AWS_|DATABASE|FIREBOLT_)(.*)/` ([env] L128-133).
  - The docs' rules: "Letters, digits, and underscores; must start with a letter", `default` reserved, and avoid endings `_db`, `_aws` and `_jdbc` ([d-mds] L30-37).
  - **When it is unset,** any name passes, and every name maps to the bare `CUBEJS_DB_*` keys ([env] L88-90, L111-112).
- **Drivers:** one per data-source name per orchestrator ([r-pfm] Summary finding 6 and §3, citing server.ts L643-706).
- **Data-source names never become SQL identifiers.** They choose a driver, and they appear in lock and cache keys ([pal] L1158-1162; [opa] L912-913). This is an inference.

## Recommendation

### Encodings compared

Budget = Postgres staged-table budget for `short + preAgg + partition` (§5).

| Candidate | Example | Prefix + `_` | Collisions | Rename or move | YAML and SQL | Budget | Verdict |
|---|---|---|---|---|---|---|---|
| Folder path or title slug | `sales_emea_orders` | varies | `a_b`+`c` = `a`+`b_c` | **Changes** | Best | varies | Ruled out by R27 |
| Full UUID, hex | `w3f2a9c1e5b7d4e8a9c217d4e5f6a8b90_orders` | 34 | None | Stable | Traceable, long | ≤ 2 | Breaks Postgres staging and most column aliases |
| Full UUID, base32 or base36 | `w` + 26 or 25 characters | 28 / 27 | None | Stable | Opaque | ≤ 8 / ≤ 9 | Too long |
| Full UUID, base62 | 22 characters | 24 | **Case folding collides** ([infl] L794-807) | Stable | Opaque | — | Invalid |
| xcube sequence, base36 | `w1k_orders` | 4-5 | None, if never reused | Stable only while the registry survives | Readable but opaque | ≤ 31-32 | Not "built from folder ids" (R27). Needs a durable, never-reused registry in wechart and xcube. A database restored with an older counter can reissue a prefix. |
| Short hash of the id (e.g. 8 base32 of sha256) | `wk3q9x2ma_orders` | 10 | ≈ n²/2⁴¹ | Stable | Opaque | ≤ 26 | Works, but gains nothing over the UUID's own random bits |
| **First 10 hex of the UUID (40 random bits)** | **`w3f2a9c1e5b_orders`** | **12** | ≈ n²/2⁴¹, and prevented outright by the uniqueness rule below | **Stable** | **The prefix is the folder id's own prefix** | **≤ 24** | **Recommended** |
| First 12 hex (48 bits) | `w3f2a9c1e5b7d_orders` | 14 | ≈ n²/2⁴⁹ | Stable | Traceable | ≤ 22 | Stricter alternative |

**Why the UUID's own bits are enough.**

- Folder ids come from `crypto.randomUUID()` ([w-srv] L766-768), which "Generates a random RFC 4122 version 4 UUID" ([node-uuid]).
- In a v4 UUID, bits 0-47 (`random_a`) are random ([rfc9562] §5.4). So the first 10 hex digits carry 40 random bits, and no hash is needed.
- **Birthday estimate:** 200 folders gives about 1.8×10⁻⁸, and 10,000 folders gives about 4.5×10⁻⁵. These are arithmetic, not sourced claims.

### The scheme

```
publishedName(folderId, short) =
  folderId === 'root' ? short                                   // shared root: no prefix (R27, AC-328)
  : 'w' + folderId.toLowerCase().replace(/-/g, '').slice(0, 10) + '_' + short
decode: /^w([0-9a-f]{10})_([A-Za-z_][A-Za-z0-9_]*)$/  →  (prefix → folder, short)
```

- **The shared root's id is the literal `root`** ([w-cat] L52-60). Any other id must be a v4 UUID, or the publish is refused.
- **Why the leading `w`:**
  - hex can start with a digit, which neither the docs nor Cube Store allow ([d-syntax] L84; [cs] L752-765);
  - it is outside `a`-`f`, so the prefix boundary is visible;
  - it marks the namespace that root names must not use.
- **Why a single `_` separator:** Cube already uses `__` between cube and member in aliases ([bq] L4246), so `__` would read as another level.
- **Every name stays in `[a-z0-9_]`** and doesn't start with `_`, so both planners leave it unchanged ([infl] L794-807; [plan] L150-162).
- **Worked example** in folder `3f2a9c1e-…`: `w3f2a9c1e5b_orders`, then `w3f2a9c1e5b_orders.count`, then `"w3f2a9c1e5b_orders__created_at_day"` (34 characters). The Cube Store table is `prod_pre_aggregations.w3f2a9c1e5b_orders_main20260901_<cv>_<sv>_<ts>`, whose table part is 57 characters. The folder's data source `warehouse` becomes `w3f2a9c1e5b_warehouse`, and its `default` becomes `w3f2a9c1e5b_default`.

### Rules xcube applies at publish

1. **Prefixes are unique.**
   - wechart re-rolls a new folder's UUID if its 10-hex prefix is already held by any folder, living or deleted.
   - xcube refuses a tree push in which two folders share a prefix, since it knows the tree (AD 5).
   - Existing phase-1 folders are checked once when phase 2 is installed.
2. **Root names avoid the prefix pattern.** No root cube, view, view group or data source may have a folded alias (`inflection.underscore(name)`) matching `^w[0-9a-f]{10}(_|$)`. Otherwise `w3f2a9c1e5b` + pre-aggregation `orders_main` could produce the same table as that folder's `orders` + `main` ([bq] L4246, L4393-4395). Existing root content is checked once.
3. **Folded aliases are unique across the whole model.** Compare `inflection.underscore` of the names, not exact names. Cover cubes, views, generated split views and pre-aggregation table names, since `a_b`+`c` = `a`+`b_c` ([dict] L11-37; [sym] L334-339; [bq] L4240-4246).
4. **Every published folder cube and view gets its own `name`, `title`, `sql_alias` and `data_source`.** This stops a parent's values being inherited through `extends` ([sym] L537-541).
   - **`title`:** keep the author's title. Otherwise use `titleize(short)`, Cube's own formula ([meta] L181-186).
   - **`sql_alias`:** the author's `x` becomes `w<hex>_x`. Otherwise use `w<hex>_<short>`, which is the folded name, so the SQL doesn't change.
5. **View includes with `prefix: true` or `split: true` and no `alias` get `alias: <short name of the last join-path cube>`.** This keeps view member names and split-view names as the author wrote them ([sym] L942-946, L1017-1028).
6. **The published YAML always states `data_source`,** bound nearest first. It is `default` when the root's is nearest (AC-273, AC-310).
7. **Length check.**
   - For each cube and view, xcube computes the longest identifiers Cube will emit against its bound source's engine (§4, §5):
     - the table alias;
     - every member alias, including each granularity;
     - every pre-aggregation that is built in or staged through the source.
   - It refuses the publish with a message naming the member or pre-aggregation and suggesting a `sql_alias`. The pre-aggregation-level `sql_alias` shortens only the pre-aggregation part ([scpa] L450-457).
8. **Refuse what can't be bound statically:**
   - a templated `data_source` or `sql_alias` (`{…}`, [yaml] L272-280);
   - Jinja;
   - a JavaScript cube whose name isn't a literal ([cpt] L70-76).

   Whether folder items may carry these at all is an open question.

### Rewriting procedure (text rewrite, verified by Cube's compiler)

1. **Parse the file** with a YAML parser that keeps positions and accepts what Cube's `js-yaml` `load` accepts ([yaml] L1, L90; wechart's options in `docs/requirements.md` L122).
2. **Pick the fields** that carry references: Cube's exported `transpiledFieldsPatterns` ([cpt] L14-48) plus the extra sites listed in §6.
3. **Tokenize** each expression with the antlr grammar or the simple f-string regex ([py] L72-74), keeping offsets.
4. **Resolve each chain left to right**, the way Cube's symbols do. The table below takes the first segment; §6 covers join paths and `FILTER_PARAMS`.

   | First segment is… | Action |
   |---|---|
   | `CUBE` or `TABLE` | Leave it |
   | A context symbol | Leave it, except for the cube segment after `FILTER_PARAMS` |
   | A cube or view on the path, nearest first | Bind it. Cube resolves a cube before a member ([sym] L1428, L1453) |
   | Anything else | A member of the current cube |

   Later segments are cubes while they resolve as cubes. Then comes a member, and then possibly a granularity ([sym] L1261-1279).
5. **Replace by offset,** then apply the rules above.
6. **Verify** with Cube's own transpiler on the rewritten file.
   - Every identifier it resolves ([cpt] L285-318) must be one of: `CUBE`/`TABLE`, a context symbol, a member of the current cube, or a full name in the expected binding set.
   - No bare short name may resolve to a root cube unless the binding said "root".
   - Every `FILTER_PARAMS` cube segment must name a cube in the model.
   - Then run the whole-model compile (AD 6).

**Charts and dashboards** are structured JSON. Binding rewrites only the cube segment of each stored member (`orders.count` becomes `w3f2a9c1e5b_orders.count`), as AC-272 requires.

### Chart side (AC-328, AC-329)

- **Picker and labels.**
  - The picker lists cubes from wechart's own record of what it published where: the item's folder path, nearest first, shadowed by short name.
  - It takes labels from `/v1/meta` `title` and `shortTitle`. It never shows `name` ([meta] L286-322).
  - Decoding the prefix is only a cross-check.
- **Root and phase-1 content** keeps its names and needs no migration (AC-328).
- **Cube error text contains full names.**
  - wechart maps each full name to its folder and short name before showing it.
  - For folders the viewer can't see, it redacts the names into the "_n_ items in folders you can't see" form (§P2.4, requirements L483).

### Data sources

- **Published names:** `w<hex>_<short>`, while the root's names stay unprefixed; the root's `default` is Cube's default.
- **Keep `CUBEJS_DATASOURCES` unset.** If it were set, every folder-level name would have to be listed, and names would go through the environment-key parser ([env] L88-133). xcube's `driverFactory` resolves the name to the stored connection.

## Gotchas

1. **Case folding.**
   - `Orders` and `orders` are two cubes to Cube ([dict] L11-37), but they share SQL aliases and pre-aggregation table names ([infl] L794-807; [bq] L4229-4247).
   - A leading `_` is dropped from aliases.
   - So AC-270's "same name in the same folder" check should compare folded aliases.
2. **Unprefixed root names are visible everywhere.**
   - Cube resolves `{x}` as the cube `x` before the current cube's member `x` ([sym] L1428-1453).
   - Publishing a root cube named like a folder cube's member changes what the bare `{member}` references in that folder cube mean.
   - A missed rewrite of a short name that also exists at the root compiles and binds to the root cube silently.
   - Rewriting bare member references to `{CUBE.member}` removes this capture. That the two forms are equivalent is UNVERIFIED (P4).
3. **`extends` inherits `sql_alias`, `title` and `data_source`** through the prototype ([sym] L537-541).
   - A child that doesn't set its own shares the parent's aliases and pre-aggregation table names, which breaks AC-274, and shows the parent's title.
   - This is source-derived (P3).
4. **`FILTER_PARAMS` cube names are not checked at compile** ([bq] L5470-5472).
   - A stale short name fails only at query time ([ev] L1041-1047).
   - If the root has a cube of that name, the filter silently matches the root's filters.
5. **Views' `prefix: true` and `split: true` names come from the included cube's name,** so they change when that cube is prefixed unless an `alias` is injected ([sym] L942-946, L1017-1028).
   - Split views are registered after the duplicate check and overwrite silently ([sym] L334-339).
6. **Postgres truncates identifiers without an error** ([pg-ident]):
   - a column alias fails the query ([qrt] L383-386);
   - a staged or in-source table leaks, collides or misparses ([pal] L719-728, L1145-1149; [opa] L243; [i907]).

   Cube's explicit 63-character check covers only Postgres as a pre-aggregation target ([pg] L444-450).
7. **Postgres sources stage external rollups in the source database by default** ([pal] L476-489, L667-669; [pg] L478-480, L528-532).
   - With `readOnly`, no source table is created, and Postgres still batches ([d-pg] L59-65).
   - But then `original_sql` pre-aggregations can't be stored in the source ([d-osql] L32-37).
8. **Oracle with `COMPATIBLE` below 12.2 allows 30 bytes** ([ora-names]), which almost any prefixed member alias exceeds.
9. **Cross-source joins fail at query time, not at publish** ([bq] L594-600). If joined cubes bind to different `default` sources, their joins break when queried.
10. **`default` must always resolve** ([capi] L312-321). The root's `default` data source must never be deletable.
11. **Correction to `docs/research/cube/configuration-deployment.md` L512.** It says data-source names "must not end in `_db`, `_aws`, or `_jdbc`".
    - The parser's regex is broader ([env] L128-133). It also misroutes names that end in `_database` or `_firebolt`, and names that contain `_db_`, `_jdbc_`, `_aws_`, `_database` or `_firebolt_` after the first character. This is an inference from the regex.
    - It matters only when `CUBEJS_DATASOURCES` is set.
12. **View groups are a deployment-wide namespace** ([d-vg] L20-24), and AD 2 names only cubes, views and data sources.
13. **Full names are visible to users.**
    - Pre-aggregation ids (`<cube>.<preAgg>`, [scpa] L381) and Cube Store table names show the prefix in Jobs, Schedules and system partitions, so the UI should label them with titles.
    - Every member key the browser receives carries a 40-bit fragment of the id of the folder that holds the model.
14. **`sql_alias` accepts any string** ([cv] L1177, L555). xcube should hold prefixed values to the identifier regex.
15. **The superseded `per-folder-models.md`, Layout B,** kept folders apart with a hashed `sql_alias`. Prefixes do the same job for AC-274: table names and SQL text differ, so rollups and result-cache keys differ ([r-pfm] Summary findings 4-5).

## Open questions / unverified

**For the user:**

1. **Marker and length.** This doc recommends `w` and 10 hex digits (40 bits). The stricter alternative is 12 hex digits.
2. **Moves that rebind.** A move that changes which ancestor an item binds to rebinds it (AC-275), and that changes SQL and rebuilds its rollups. AC-328's Fails-when says a move "rebuilds a pre-aggregation". The naming scheme guarantees only that no name changes.
3. **`extends` without a data source.** A cube that `extends` another and names no `data_source` could inherit the parent's source, which is Cube's behaviour, or bind to the nearest `default` (AC-310).
4. **View groups.** Should they be prefixed too?
5. **Dynamic content in folder items.** Jinja, templated `data_source`, and JavaScript with computed names can't be bound statically. AC-140 and R6 treat dynamic models as read-only and deferred. Are they refused in folders?
6. **Workspace and proposal overlays.** Which prefix do their names use? The personal root `mine` is not a UUID ([w-cat] L59).
7. **Id fragments in the browser.** Is a 40-bit folder-id fragment in member keys acceptable under R27's "Nothing names or links that folder"?
8. **Postgres `readOnly`.** Should folder Postgres sources run with `readOnly: true`?

**UNVERIFIED:**

- That a truncated column alias fails the query. This is inferred from [pg-ident] and [qrt].
- That staged tables leak or collide when truncated. This is inferred, and partly corroborated by [i907].
- That Tesseract leaves `[a-z0-9_]` names unchanged. I did not read the `convert_case` semantics.
- That Cube Store has no length limit. A grep found no check.
- That `extends` inherits `sqlAlias`, `title` and `dataSource` through the prototype.
- That an explicit `sql_alias` equal to the folded name produces identical SQL under both planners.
- That `{member}` and `{CUBE.member}` are equivalent.
- What happens when Snowflake, SQL Server or Oracle get an over-long name. Their docs don't say.
- That `randomUUID()` returns lowercase. The scheme lowercases anyway.

**Probes** (compose stack):

- **P1:** a folder cube with a member alias over 63 bytes, on Postgres.
- **P2:** a writable Postgres source with an external rollup whose table part is over 63 bytes. List the source's `prod_pre_aggregations` tables after several builds.
- **P3:** a child that `extends` a parent with a `sql_alias`. Check the Cube Store table names.
- **P4:** a root cube `orders`, plus a folder cube with a member `orders` referenced as `{orders}`. Check `/v1/sql`.
- **P5:** a stale `FILTER_PARAMS` short name.
- **P6:** `prefix: true` over a prefixed cube, with and without an injected `alias`, in `/v1/meta`.
- **P7:** SQL with an explicit `sql_alias` against SQL without one, with Tesseract on and off.

[cv]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts
[dict]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeDictionary.ts
[sym]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts
[ev]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts
[yaml]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/YamlCompiler.ts
[cpt]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/transpilers/CubePropContextTranspiler.ts
[py]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/parser/PythonParser.ts
[meta]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/compiler/CubeToMetaTransformer.ts
[bq]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
[btd]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/adapter/BaseTimeDimension.ts
[scpa]: /Users/srajagopal/Work/bi/cube/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts
[opa]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts
[pal]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoader.ts
[prl]: /Users/srajagopal/Work/bi/cube/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts
[pg]: /Users/srajagopal/Work/bi/cube/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[rs-drv]: /Users/srajagopal/Work/bi/cube/packages/cubejs-redshift-driver/src/RedshiftDriver.ts
[my]: /Users/srajagopal/Work/bi/cube/packages/cubejs-mysql-driver/src/MySqlDriver.ts
[bd]: /Users/srajagopal/Work/bi/cube/packages/cubejs-base-driver/src/BaseDriver.ts
[env]: /Users/srajagopal/Work/bi/cube/packages/cubejs-backend-shared/src/env.ts
[opts]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/OptsHandler.ts
[capi]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/CompilerApi.ts
[types]: /Users/srajagopal/Work/bi/cube/packages/cubejs-server-core/src/core/types.ts
[gw]: /Users/srajagopal/Work/bi/cube/packages/cubejs-api-gateway/src/gateway.ts
[qrt]: /Users/srajagopal/Work/bi/cube/rust/cube/cubeorchestrator/src/query_result_transform.rs
[qt]: /Users/srajagopal/Work/bi/cube/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/query_tools.rs
[plan]: /Users/srajagopal/Work/bi/cube/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/sql_templates/plan.rs
[cs]: /Users/srajagopal/Work/bi/cube/rust/cubestore/cubestore/src/sql/mod.rs
[infl]: /Users/srajagopal/Work/bi/cube/node_modules/inflection/lib/inflection.js
[antlr]: /Users/srajagopal/Work/bi/cube/node_modules/antlr4/src/antlr4/Token.d.ts
[d-syntax]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/data-modeling/concepts/syntax.mdx
[d-cube]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/cube.mdx
[d-view]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/view.mdx
[d-vg]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/view-group.mdx
[d-joins]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/joins.mdx
[d-ctx]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/context-variables.mdx
[d-mds]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/connect-to-data/multiple-data-sources.mdx
[d-pg]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/admin/connect-to-data/data-sources/postgres.mdx
[d-upa]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/pre-aggregations/using-pre-aggregations.mdx
[d-osql]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/pre-aggregations/using-originalsql-and-rollups-effectively.mdx
[d-xds]: https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/cross-data-source-queries.mdx
[i907]: https://github.com/cube-js/cube/issues/907
[i4019]: https://github.com/cube-js/cube/issues/4019
[pg-ident]: https://www.postgresql.org/docs/current/sql-syntax-lexical.html
[sf-ident]: https://docs.snowflake.com/en/sql-reference/identifiers-syntax
[dbx-names]: https://docs.databricks.com/aws/en/sql/language-manual/sql-ref-names
[bq-tables]: https://docs.cloud.google.com/bigquery/docs/tables
[bq-cols]: https://docs.cloud.google.com/bigquery/docs/schemas
[ms-ident]: https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers
[ora-names]: https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Database-Object-Names-and-Qualifiers.html
[rfc9562]: https://www.rfc-editor.org/rfc/rfc9562.html
[node-uuid]: /Users/srajagopal/Work/wechart/node_modules/.pnpm/@types+node@26.0.0/node_modules/@types/node/crypto.d.ts
[w-cat]: /Users/srajagopal/Work/wechart/packages/api/src/repos/catalog.ts
[w-srv]: /Users/srajagopal/Work/wechart/packages/api/src/server.ts
[r-pfm]: /Users/srajagopal/Work/wechart/docs/research/cube/per-folder-models.md
[r-apis]: /Users/srajagopal/Work/wechart/docs/research/cube/data-apis.md
