---
packages: []
version: "n/a (SQL dialects as documented on 2026-10-17)"
researched: 2026-10-17
---
# Limiting a SELECT to the first 100 rows, per dialect

For T807 (AC-449): the schema browser's Insert SELECT and Preview 100 rows write `SELECT <columns> FROM <schema>.<table>`, limited to 100 rows in the driver's own syntax. The SELECT has **no ORDER BY**. Every dialect below documents that without one, which rows come back is undefined or non-deterministic.

Researched by an integration-researcher agent for lane SQL, with every claim sourced below.

## Per driver

| driver id | First 100 rows | Where the limit goes | Version notes | Qualified names and identifiers |
|---|---|---|---|---|
| `postgres` | `SELECT <cols> FROM <schema>.<table> LIMIT 100` (SQL:2008: `FETCH FIRST 100 ROWS ONLY`) | At the end, after any ORDER BY [P1] | `OFFSET … FETCH` since 8.4 [P2]. Both forms are in the current docs [P1]. ORDER BY isn't required, but without it the subset is unpredictable [P1]. | `schema.table` [P3]. Unquoted names fold to lower case; `"Foo"` keeps case [P4]. |
| `redshift` | `… LIMIT 100`, or `SELECT TOP 100 …` | LIMIT after ORDER BY [R1]; TOP right after SELECT [R2] | LIMIT works without ORDER BY [R1]. TOP behaves as LIMIT, and the two can't be combined [R2]. FETCH FIRST isn't in the synopsis: UNVERIFIED. | `schema.table`; identifiers fold to lower case unless `enable_case_sensitive_identifier` is on [R3]. |
| `mysql` | `SELECT <cols> FROM <db>.<table> LIMIT 100` | After ORDER BY, before `FOR UPDATE`/`FOR SHARE` [M1] | FETCH FIRST isn't in 8.4's SELECT syntax: UNVERIFIED as unsupported [M1]. | The schema is the database, `db_name.tbl_name` [M1][M2]. Quote with backticks, each part on its own [M2]; double quotes only under `ANSI_QUOTES` [M3]. |
| `snowflake` | `… LIMIT 100`, `SELECT TOP 100 …` or `… FETCH FIRST 100 ROWS ONLY` | LIMIT and FETCH after ORDER BY [S1]; TOP right after SELECT [S2] | TOP n and LIMIT are equivalent [S1]. ORDER BY isn't required; the results are non-deterministic without it [S1][S2]. | `database.schema.object` or `schema.object`. Unquoted names resolve as UPPERCASE; quoted ones keep case [S3]. |
| `bigquery` | ``SELECT <cols> FROM `dataset.table` LIMIT 100`` | `LIMIT count [OFFSET n]` at the end [B1] | The grammar has no TOP or FETCH FIRST [B1]. | Up to three parts: project, dataset, table; quoted with backticks. A dash is allowed unquoted only in the project part or a bare table name [B2]. Table names are case-sensitive by default [B4]. |
| `mssql` | `SELECT TOP (100) <cols> FROM <schema>.<table>` | Right after SELECT [T1] | Without ORDER BY, TOP returns rows "in an undefined order". Parentheses are optional for a constant, kept for backward compatibility, and Microsoft recommends them [T1]. OFFSET/FETCH needs ORDER BY and SQL Server 2012 or later [T2]. TOP before 2017: UNVERIFIED, since the page covers 2017 and later [T1]. | `schema.object`, delimited with `[ ]`, or `" "` under `QUOTED_IDENTIFIER ON` [T3]. |
| `oracle` (12c and later) | `SELECT <cols> FROM <schema>.<table> FETCH FIRST 100 ROWS ONLY` | After ORDER BY, before FOR UPDATE [O1] | Added in 12.1.0.1 [O2]. No ORDER BY is needed; only `WITH TIES` needs one. It can't be combined with FOR UPDATE [O3]. | `schema.object`. Unquoted names are UPPERCASE; quoted ones keep case [O4]. |
| `oracle` (before 12c) | `… WHERE ROWNUM <= 100` | A WHERE predicate | Documented in 11.2 [O5]. 19c calls the row-limiting clause "superior" [O6]. | As above [O4]. |
| `dremio` | `SELECT <cols> FROM <source>.<folder…>.<table> LIMIT 100` | `LIMIT <count>` after ORDER BY [D1] | No OFFSET, FETCH or TOP in the 26.x synopsis: UNVERIFIED [D1]. | A dot-separated path: source or space, then folders, then the dataset; parts with dots double-quoted [D1][D2][D3]. Case-folding: UNVERIFIED. |

## What wechart uses (T807)

- **`LIMIT 100`** on postgres, redshift, mysql, snowflake, bigquery and dremio.
- **`TOP (100)`** on mssql, with the parentheses Microsoft recommends.
- **`FETCH FIRST 100 ROWS ONLY`** on oracle, which needs 12c or later. Before 12c, `ROWNUM` would be needed. wechart doesn't record an Oracle source's version, so it writes the 12c form; an older server refuses it with its own error.
- Names go in as the catalog lists them, unquoted, as the schema browser already inserts them (T539's call). A name that needs quoting in its dialect must be quoted by hand.

## Sources

- [P1] https://www.postgresql.org/docs/current/sql-select.html
- [P2] https://www.postgresql.org/docs/8.4/release-8-4.html
- [P3] https://www.postgresql.org/docs/current/ddl-schemas.html
- [P4] https://www.postgresql.org/docs/current/sql-syntax-lexical.html
- [R1] https://docs.aws.amazon.com/redshift/latest/dg/r_ORDER_BY_clause.html
- [R2] https://docs.aws.amazon.com/redshift/latest/dg/r_SELECT_list.html
- [R3] https://docs.aws.amazon.com/redshift/latest/dg/r_names.html
- [M1] https://dev.mysql.com/doc/refman/8.4/en/select.html
- [M2] https://dev.mysql.com/doc/refman/8.4/en/identifier-qualifiers.html
- [M3] https://dev.mysql.com/doc/refman/8.4/en/identifiers.html
- [S1] https://docs.snowflake.com/en/sql-reference/constructs/limit
- [S2] https://docs.snowflake.com/en/sql-reference/constructs/top_n
- [S3] https://docs.snowflake.com/en/sql-reference/identifiers-syntax
- [B1] https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/query-syntax
- [B2] https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/lexical
- [B4] https://docs.cloud.google.com/bigquery/docs/data-definition-language
- [T1] https://learn.microsoft.com/en-us/sql/t-sql/queries/top-transact-sql
- [T2] https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql
- [T3] https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-identifiers
- [O1] https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/SELECT.html
- [O2] https://docs.oracle.com/database/121/NEWFT/chapter12101.htm
- [O3] https://docs.oracle.com/database/121/SQLRF/statements_10002.htm
- [O4] https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Database-Object-Names-and-Qualifiers.html
- [O5] https://docs.oracle.com/cd/E11882_01/server.112/e41084/pseudocolumns009.htm
- [O6] https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/ROWNUM-Pseudocolumn.html
- [D1] https://docs.dremio.com/current/reference/sql/commands/SELECT-statements
- [D2] https://docs.dremio.com/25.x/sonar/query-manage/managing-data/spaces
- [D3] https://docs.dremio.com/25.x/sonar/client-applications/clients/datagrip
