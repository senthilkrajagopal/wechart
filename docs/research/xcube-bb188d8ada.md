---
library: xcube-bb188d8ada
packages: []
# Nothing is imported: wechart's server asks xcube's admin routes over HTTP, under its service credential.
version: 'xcube feat/xcube bb188d8ada; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-bb188d8ada@sha256:96024be5ca88d227ff456a0d832642e9a42a27c6a7d55187520a00d84389f63f (amd64, arm64)'
researched: 2026-10-18
sources:
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-10-18-1330-image-bb188d8ada.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-10-17-2030-sql-run-bound-parameters.md
  - /Users/srajagopal/Work/xcube-exchange/to-wechart/2026-10-18-1300-catalog-foreign-keys.md
  - /Users/srajagopal/Work/bi/cube (git show a1d8219a67 and bb188d8ada, their messages and diffs)
  - /Users/srajagopal/Work/bi/cube/xcube/src/admin/routes.ts at a1d8219a67 (`sqlSchema`, `SQL_STATUS`)
  - /Users/srajagopal/Work/bi/cube/xcube/src/sql/runs.ts at a1d8219a67 (where `parameters` is checked and bound)
  - /Users/srajagopal/Work/bi/cube/xcube/README.md at bb188d8ada ("Bound parameters", "Keys, by driver")
  - docker buildx imagetools inspect ghcr.io/senthilkrajagopal/xcube:v1.7.45-bb188d8ada (run 2026-10-18)
  - docs/research/xcube-407622a6b8.md (the image before it)
  - docs/research/sql-parameter-binding.md (why wechart asked for binding, and the proposal xcube built)
---

# xcube bb188d8ada: bound parameters on the SQL runner, and the catalog's foreign keys (T811, T806)

This doc covers the two changes on top of `407622a6b8` that wechart uses:
- `a1d8219a67`: bound parameters on the SQL runner's run routes (AC-454, AC-465's values, AC-482);
- `bb188d8ada`: the catalog reports foreign keys through a stored connection (AC-448, T806).

Each claim is checked against the fork at that commit, or against xcube's answer where the fork can't show it.

**Short names for the sources:**
- **[image]** `~/Work/xcube-exchange/to-wechart/2026-10-18-1330-image-bb188d8ada.md`.
- **[params]** `…/2026-10-17-2030-sql-run-bound-parameters.md`.
- **[fks]** `…/2026-10-18-1300-catalog-foreign-keys.md`.
- **[c-params]** `git show a1d8219a67`, in `~/Work/bi/cube`.
- **[c-fks]** `git show bb188d8ada`, in `~/Work/bi/cube`.

## The image

- `ghcr.io/senthilkrajagopal/xcube:v1.7.45-bb188d8ada@sha256:96024be5ca88d227ff456a0d832642e9a42a27c6a7d55187520a00d84389f63f`. It is an index for linux/amd64 (`sha256:6de03665…`) and linux/arm64 (`sha256:3e8b5cd5…`), with an attestation manifest for each, per `docker buildx imagetools inspect` on 2026-10-18. The moving tag `v1.7.45-feat-xcube` pointed to the same digest when it was published ([image]).
- **Revision:** `bb188d8ada78264145ff3e018bc2f9b043554721`, the child of `a1d8219a67`, the child of `407622a6b8` ([c-fks]; `git log`). It carries everything `407622a6b8` had ([image]).
- **No migration:** the schema is still 14 ([image]). Changing the image is the whole upgrade from `407622a6b8`.
- **Not published by CI.** GitHub Actions is disabled on the fork, so at the user's request xcube built and pushed it from its own machine, with CI's Dockerfile, build arguments and two tags. Its OCI label `org.opencontainers.image.revision` is `bb188d8ada…` on both platforms ([image]).
- **Tests before the push** ([image]):
  - CI's image-job checks, on a local arm64 build of the same context: it boots as user 1000; `test/image/serving.sh` passes 6 of 6 (the SQL runner among them); `test/image/drivers-env.js` passes 12 of 12.
  - The published amd64 image booted under emulation.
  - The full suite, locally in band against PostgreSQL 18, MySQL 8.4, Dremio, Cube Store 1.7.45, SQL Server 2022 and Oracle 23.26: 525 passed, 5 skipped, 0 failed.
  - **Not run:** CI's own test job (Postgres, MySQL, Trino, Cube Store on its servers). It runs at the next push once Actions works.

## Bound parameters (`a1d8219a67`)

### The request

`POST /v1/admin/connections/{name}/sql` (with or without `?overlay=`) and `POST /v1/admin/cubestore/sql` take an optional `parameters` field beside `sql`, `runId` and the caps ([params]; [c-params], README):

```json
{ "sql": "SELECT … WHERE region = {{region}} AND placed > {{ since }}", "runId": "<uuid>",
  "parameters": { "region": { "type": "text", "value": "EU" }, "since": { "type": "date", "value": "2026-01-01" } } }
```

- **The schema** (`sqlSchema` in `routes.ts`, [c-params]): `parameters` is an object of at most 100 keys. Each key matches `PARAMETER_NAME` and is at most 64 characters; each value is `{ type: 'text' | 'number' | 'date' | 'boolean' (required), value: string (≤ 100000) | boolean (required) }`. A body that fails it is `400 bad_request`, as any malformed body is.
- **Names:** `[A-Za-z_][A-Za-z0-9_]*`, case-sensitive. `{{ name }}`, with spaces inside the braces, is the same parameter ([params]; README).
- **Values, by type** ([params]):
  - `text`: a string;
  - `number`: a decimal string, `-?digits(.digits)?`, at most 38 digits and at most 30 after the point, no exponent;
  - `date`: `YYYY-MM-DD`, a real day;
  - `boolean`: JSON `true` or `false`.
- **Without `parameters`,** nothing changes: `{{…}}` is the SQL's own text. **With `parameters` present, even `{}`,** every check below applies ([params]). In `runs.ts` the binding runs only `if (request.parameters)` ([c-params]).

### The checks, before anything connects ([params])

1. Each `{{name}}` is found with the dialect's own lexer, in code only: never in a string, a comment, a dollar quote or a quoted name. If the readings the check makes (a backslash escaping or not, comments nesting or not) find them differently, the statement is `400 not_read_only`.
2. Every `{{name}}` has a value, and every value is used.
3. A database's own placeholder written by hand is refused while `parameters` is present: `$1` (PostgreSQL, Redshift), `?` (MySQL), `?` and `:1` (Snowflake), `?` and `@x` (BigQuery), `@x` (SQL Server), `:x` and `:1` (Oracle). Not refused: `::` casts, Snowflake's `v:field`, PostgreSQL's `?` operator, and `@@VERSION` and the like.
4. xcube writes its own placeholders, typed where the library doesn't take a type: `$1::text`/`::numeric`/`::date`/`::boolean` (PostgreSQL, Redshift), `?` with `CAST` (MySQL, through a prepared statement), `?::NUMBER(38, s)` etc. (Snowflake), `@p1` with `params` and `types` (BigQuery), `@p1` with `CAST` (SQL Server), `:p1` with `TO_NUMBER`/`TO_DATE` (Oracle). Numbers and dates travel as text and are cast in the SQL, so they are exact and don't depend on the session's locale or time zone.
5. The rewritten statement then goes through the read-only check as any statement does. A write is still `not_read_only`, whatever its parameters.
6. **No value is logged.** `redactedSql` is the statement as it ran, with xcube's placeholders (`$1::text`), its literals out.

### The refusals

Every one is `400 { error, code, reason, statement: null, redactedSql }`, with `redactedSql` from the statement as sent ([params], §3.5; `SQL_STATUS` in [c-params]).

| When | `code` | `reason` | `error` |
| --- | --- | --- | --- |
| A value missing | `invalid_parameters` | `missing_value` | `{{b}} has no value` (several: `{{a}}, {{b}} have no value`) |
| A value unused | `invalid_parameters` | `unused_value` | `"z" is given a value but used nowhere in the statement's code` (several: `"y", "z" are given …`) |
| A malformed `{{…}}` | `invalid_parameters` | `malformed_placeholder` | `A {{…}} in the statement isn't a parameter: write {{name}}, the name letters, digits and underscores, not starting with a digit` |
| A placeholder written by hand | `invalid_parameters` | `placeholder_written` | `The statement holds ?, a placeholder of the database's own: with parameters, write each as {{name}}` (`$1`, `@x`, `:x` as written) |
| A value not of its type | `invalid_parameters` | `invalid_value` | e.g. `"n" is a Number: its value is a decimal string, such as "-12.5"`; `"d" is a Date: its value is a day, written YYYY-MM-DD`; `"b" is Boolean: its value is true or false`; `"t" is Text: its value is a string`; `"n" is a Number of at most 38 digits, at most 30 of them after the point` |
| Dremio | `parameters_unsupported` | `dremio` | `Dremio takes no bound values: run the statement without parameters` |
| Cube Store | `parameters_unsupported` | `cubestore` | `Cube Store takes no bound values: run the statement without parameters` |
| An Oracle before 23ai, given a Boolean | `parameters_unsupported` | `oracle_boolean` | `Oracle binds a Boolean into SQL only from Oracle Database 23ai; this one is <its version>` |

- **Dremio and Cube Store** are refused only once `parameters` holds a value: `{}` passes (`runs.ts`, `UNBOUND_DIALECTS.has(dialect) && Object.keys(request.parameters).length`, [c-params]).
- **The Oracle Boolean refusal** comes once connected, since only then is the version known, but before the statement runs. Its `statement` is set ([params]).
- A key that doesn't match the name pattern is `400 bad_request` from the body's schema, not `invalid_parameters` ([params]).

### Which drivers bind ([params], §3.2–3.4)

| Driver | Binds? | Shown how |
| --- | --- | --- |
| PostgreSQL | yes, the cursor's values | run for real against PostgreSQL 18: the injection string `'; DROP TABLE x; --` comes back as data, and the table compared against keeps its rows |
| MySQL | yes, a prepared statement (mysql2's own `execute`, from the connection's prototype, since Cube's driver replaces it) | run for real against MySQL 8.4; rows still stream as arrays, and the row cap still stops it (`truncated: "rows"`). A bound Boolean comes back `"1"`, a cast decimal `"42.5"` |
| SQL Server | yes, `input` as NVARCHAR(MAX), BIT for a Boolean | run for real against SQL Server 2022 |
| Oracle | yes, named binds; a Boolean only from 23ai | run for real against 23.26 (23ai Free), the Boolean included |
| Redshift | yes, as PostgreSQL's session | unit test only: what the session sends its library. The server's handling is untested |
| Snowflake | yes, `binds` | unit test only. Untested against a server |
| BigQuery | yes, `params` and `types` on the dry run and the job | unit test only. Untested against a server |
| Dremio | **no**: `parameters_unsupported` | run for real against Dremio 26 |
| Cube Store | **no**: `parameters_unsupported` | run for real against Cube Store 1.7.45 |

The compose stack's data sources are PostgreSQL (the sample database), so wechart's e2e reaches the PostgreSQL row.

## The catalog's foreign keys (`bb188d8ada`)

`POST /v1/admin/data-sources/{dataSource}/columns` answers each column's `primaryKey` and `foreignKeys` (`[{ schema, table, column }]`) as before ([fks]). What changed is that they are now filled for a stored connection.

- **Why every `foreignKeys` was `[]`:** a stored connection's driver is a proxy (`SwitchableDriver`). The catalog called Cube's `foreignKeys` through it, which ran the driver's own key query, not the catalog view's. Cube's PostgreSQL query filters on the referenced table, so a read of `orders` alone never found `customers` ([fks]; [c-fks]).
- **The fix:** the catalog view runs its key queries itself ([c-fks], `src/catalog/views.ts`).
- **PostgreSQL reads `pg_catalog.pg_constraint`** (`conrelid`, `confrelid`, `unnest(conkey, confkey)`), so a login that only has SELECT sees the keys too, primary keys included. A key over several columns is paired by position ([fks]; README "Keys, by driver").

### Which drivers report keys ([fks]; README "Keys, by driver")

| Driver | Primary keys | Foreign keys | From |
| --- | --- | --- | --- |
| PostgreSQL | yes | yes, with the target's schema | `pg_constraint` |
| MySQL | yes | yes, with the target's schema | `information_schema.KEY_COLUMN_USAGE`, for the tables the login can see |
| Redshift | no | no | Cube's Redshift driver turns its key queries off |
| SQL Server, Oracle | no | no | Cube's drivers have no key queries. xcube offers to add them |
| Snowflake, BigQuery, Dremio | no | no | Cube's drivers have none |
| DuckDB, Presto, Trino, Cube Store | no | no | none |

Where none are reported, `foreignKeys` is `[]` and `primaryKey` is `false` for every column ([fks]).

**Tested by xcube** ([fks]): an integration test against PostgreSQL 18 reads `purchases` alone through a stored connection whose role owns nothing and holds only SELECT, and gets `customer_id` → `foreignKeys: [{ schema, table: 'customers', column: 'id' }]` and `id` → `primaryKey: true`. Against the catalog code before the fix, the same test fails with `[]`.

## How wechart uses it

- **T811 (AC-454, AC-465):** wechart's API sends a run's values as `parameters`, with the strip's types, and keeps `{{…}}` in `sql`. T810's hold on Dremio and Cube Store stays: wechart never sends them `parameters` with a value.
- **T806 (AC-448):** the workspace's schema browser already tags a column **FK** from `foreignKeys`, with its target in the tooltip. With this image, `orders.customer_id` in the sample database carries it ("References public.customers (id)").

## Gotchas

- **Send `parameters` only when the statement has parameters.** With `parameters` present, even `{}`, xcube refuses a hand-written `$1` or `?`; without it, `{{…}}` is plain text, as before.
- **Values travel as strings,** a Boolean as JSON `true`/`false`. A Number as a JS number fails the schema (`value` is a string or a boolean).
- **A value given but not used is refused** (`unused_value`), so a stale value left in the strip for a removed parameter must not be sent.
- **The compose stack must run this image** for either change to appear. An older image answers `400 bad_request` for any `parameters`, and `foreignKeys: []` through a stored connection.
- **CI hasn't tested this commit** on its servers ([image]); xcube's local suite has.
