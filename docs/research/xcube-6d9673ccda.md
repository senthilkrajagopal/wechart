---
library: xcube's read-only SQL runner (the user's Cube fork), rows read before a stop or a cancel
packages: []
# Nothing is imported: wechart's server calls xcube's admin routes over HTTP, under its service credential.
version: 'xcube feat/xcube 6d9673ccda; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-6d9673ccda@sha256:b876ef9e8f9a401a77bb759f9d054aadb412b91ad5ea4425d10c918fc8fd89f4 (amd64, arm64)'
researched: 2026-10-02
---

# xcube 6d9673ccda: the rows a stopped or cancelled run read (T545)

A correction beside [`xcube-sql-runner.md`](./xcube-sql-runner.md), whose "What xcube's answer didn't say" item 1 this answers: on `89628a0e88`, a run stopped at its time cap or cancelled gave no rows.

**Sources:**
- xcube's answer, `~/Work/xcube-exchange/to-wechart/2026-10-02-0700-sql-runner-partial-rows.md`, to wechart's request `~/Work/xcube-exchange/to-xcube/2026-10-01-2308-sql-runner-partial-rows.md`;
- the commits it names, `4f9207f7c1` and `6d9673ccda` on `feat/xcube`: `xcube/src/sql/runs.ts` (`stopped`), `src/sql/runner.ts` (`RowCollector.stopped`, the PostgreSQL and Oracle sessions), `src/admin/routes.ts`, README "SQL runner", `test/integration/sql-runner.test.ts` and `test/unit/sql-runner.test.ts`;
- compose's running image, checked by T545 (below).

## What changed

**A run stopped at its time cap, or cancelled, still answers `422` with its `code`** (`timeout` or `cancelled`), its `error`, `statement`, `redactedSql` and `durationMs`, as before. It now also carries the rows read before the stop [answer, "The answer"]:

```json
{
  "error": "The statement ran past 2 s and was stopped",
  "code": "timeout",
  "statement": "select",
  "redactedSql": "SELECT g, CASE WHEN g > ? THEN pg_sleep(?)::text END AS slept FROM generate_series(?, ?) g",
  "durationMs": 2004,
  "columns": [{ "name": "g", "type": "int4" }, { "name": "slept", "type": "text" }],
  "rows": [[1, null], [2, null], [3, null]],
  "rowCount": 3,
  "truncated": "stopped"
}
```

- **`truncated: "stopped"`** marks them.
- **The caps hold:** never more than `maxRows` rows, nor more than `maxBytes` of them. A run that reaches a cap first stops reading, finishes, and answers `200` with `truncated: "rows"` or `"bytes"`, as before.
- **When nothing came back,** the answer is `rows: []` and `rowCount: 0`, with `columns` as far as the database had described them.
  - `columns` is `[]` where it hadn't described them yet, or where the run was stopped while connecting.
  - PostgreSQL describes them before its first row, so a run stopped before any row still has them.
- **Both stops answer this way:** a `timeout` from the database's own timeout or from xcube's clock, and a `cancelled` from a cancel on this instance or another.
  - A cancel from another instance stops the statement on the instance running it, whose request then answers with the rows it had [answer, question 2].
- **Only `timeout` and `cancelled` carry rows.** A refusal, `query_failed` and `connect_failed` carry none.
- **No migration:** the latest is still 12 [answer].

## Which databases give rows before a stop

[answer, question 1; each checked by xcube against a real server unless said]

| Database | Rows before a stop |
|---|---|
| PostgreSQL, Redshift | Every row that arrived: the cursor now hands each over as it comes, not 500 at a time (checked on PostgreSQL only; Redshift shares its session) |
| MySQL | Every row that arrived (its stream) |
| SQL Server | Only rows in whole 4 KB packets: a small result arrives at its end, and a stop loses it. Its stop may land at xcube's clock, 2 s after `timeoutMs` |
| Oracle | Whole fetches of 100 rows (was 500): a stop loses at most one fetch |
| Snowflake | None while the query runs; rows read once it finished are kept (not checked: no account) |
| BigQuery | None: the job finishes before its results are read (not checked: no account) |
| Dremio | None while the job runs; pages read are kept (by reading the code) |
| Cube Store | None: it answers every row at once (by reading the code). Its route has no cancel ([`xcube-sql-runner.md`](./xcube-sql-runner.md)) |

## Checked against compose's running image (T545, 2026-10-02)

T545 recreated compose's `wechart-cube` and `wechart-cube-refresh-worker` on the image. Its revision label is `6d9673ccdadee1b007a36fdd90cc7e3ef6c06110`, and both came up healthy. Then T545 probed the routes as model `e2e-security`, under the service credential, on the stored root `default` (PostgreSQL 18, `sample-db`, as `sample`). The probe is `scratchpad/stop-probe.mjs`, not kept. What held:
- **Stopped at its time cap with rows:** `timeoutMs: 2000` on xcube's own example answered `422 timeout` after 2,002 ms, with `columns` `g int4` and `slept text`, `rows` `[[1,null],[2,null],[3,null]]`, `rowCount: 3` and `truncated: "stopped"`.
- **Stopped before any row:** `SELECT pg_sleep(5)::text AS slept` answered `rows: []` and `rowCount: 0`, its column described (`slept text`), and `truncated: "stopped"`.
- **Cancelled after two rows:** `POST …/sql/cancel` answered `found: true`. The run's own request answered `422 cancelled` with its 2 rows and `truncated: "stopped"`.
- **Unchanged:**
  - a finished run is `200` with `truncated: null`;
  - a refused DELETE is `400 not_read_only` with no `rows`;
  - Cube Store's SELECT still answers `200`.

## What it means for wechart

- **The run route** passes a stopped run's `columns`, `rows`, `rowCount` and `truncated` on to the browser, as it does a finished one's.
- **The result** shows the rows that arrived, marked stopped, in place of "Nothing came back" (design 15's Q6; AC-378, AC-379). Where none arrived, it still says nothing came back.
- **History and the audit trail** record a stopped run's row count.
