---
library: SQL literals per driver (Cube 1.7.45 drivers)
packages: []
version: 1.7.45
researched: 2026-10-18
sources:
  [
    https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/sql-escape.ts,
    https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/ParamAllocator.ts,
    https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js,
    https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts,
    https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-mysql-driver/src/MySqlDriver.ts,
    https://www.postgresql.org/docs/current/sql-syntax-lexical.html,
    https://www.postgresql.org/docs/current/datatype-datetime.html,
    https://www.postgresql.org/docs/current/functions-string.html,
    https://docs.aws.amazon.com/redshift/latest/dg/r_numeric_literals201.html,
    https://docs.aws.amazon.com/redshift/latest/dg/r_Date_and_time_literals.html,
    https://docs.aws.amazon.com/redshift/latest/dg/r_Boolean_type.html,
    https://docs.aws.amazon.com/redshift/latest/dg/r_CAST_function.html,
    https://docs.aws.amazon.com/redshift/latest/dg/r_CHR.html,
    https://docs.aws.amazon.com/redshift/latest/dg/r_concat_op.html,
    https://docs.aws.amazon.com/redshift/latest/dg/r_patternmatching_condition_like.html,
    https://dev.mysql.com/doc/refman/8.4/en/string-literals.html,
    https://dev.mysql.com/doc/refman/8.4/en/hexadecimal-literals.html,
    https://dev.mysql.com/doc/refman/8.4/en/number-literals.html,
    https://dev.mysql.com/doc/refman/8.4/en/date-and-time-literals.html,
    https://dev.mysql.com/doc/refman/8.4/en/boolean-literals.html,
    https://dev.mysql.com/doc/refman/8.4/en/sql-mode.html,
    https://docs.snowflake.com/en/sql-reference/data-types-text,
    https://docs.snowflake.com/en/sql-reference/data-types-numeric,
    https://docs.snowflake.com/en/sql-reference/data-types-datetime,
    https://docs.snowflake.com/en/sql-reference/data-types-logical,
    https://docs.snowflake.com/en/sql-reference/functions/to_date,
    https://github.com/google/googlesql/blob/master/docs/lexical.md,
    https://github.com/google/googlesql/blob/master/docs/data-types.md,
    https://learn.microsoft.com/en-us/sql/t-sql/data-types/constants-transact-sql,
    https://learn.microsoft.com/en-us/sql/t-sql/language-elements/sql-server-utilities-statements-backslash,
    https://learn.microsoft.com/en-us/sql/t-sql/data-types/date-transact-sql,
    https://learn.microsoft.com/en-us/sql/t-sql/functions/cast-and-convert-transact-sql,
    https://learn.microsoft.com/en-us/sql/t-sql/data-types/nondeterministic-convert-date-literals,
    https://learn.microsoft.com/en-us/sql/t-sql/language-elements/string-concatenation-transact-sql,
    https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Literals.html,
    https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Data-Types.html,
    https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Data-Types.html,
    https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Nulls.html,
    https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Concatenation-Operator.html,
  ]
---

# SQL literals per driver, for Make a cube's SQL (T822, AC-462)

Researched by an integration-researcher agent for lane SQL, 2026-10-18. Line references marked "fork" are from `~/Work/bi/cube`; xcube's `parameters.ts` and `runner.ts` were read from the fork's working tree, and whether the published image holds them is UNVERIFIED.

## Summary

AC-462 replaces each `{{name}}` in the cube's `sql:` with the run's value, written as a literal, for the seven drivers that take parameters: postgres, redshift, mysql, snowflake, bigquery, mssql and oracle.

1. **Cube 1.7.45 has no literal escaper for any of these seven drivers.** `sql-escape.ts` has three rule sets, `ansi`, `mysql` and `spark` ([escape]), used by Dremio, Presto, Athena, ksqlDB, Pinot, ClickHouse and QuestDB, none of the seven. The schema compiler's `BaseQuery.escapeStringLiteral` only doubles `'` ([bq-js] fork L3695–3697). So "the driver's own escaping" has to come from each database's literal grammar below. Reusing `formatAnsi` would be **injectable** where a backslash escapes (Snowflake, BigQuery, MySQL with backslash escapes on): for a value `\'` it writes `'\'''`.
2. **The session a cube runs in is not xcube's run session.** xcube sets `standard_conforming_strings = on` on Postgres and removes `NO_BACKSLASH_ESCAPES`, `ANSI_QUOTES` and `ANSI` from MySQL's `sql_mode` ([x-runner] L206–208, L289–291). Cube's Postgres driver sets only `TIME ZONE` and `statement_timeout` ([pg-drv]); its MySQL driver only `time_zone` ([my-drv]). A literal must read correctly under the server's own settings: Postgres `E'…'`, a MySQL hex literal.
3. **Cube rewrites `$<digits>$` anywhere in the final SQL, string literals included** (`ParamAllocator.buildSqlAndParams`, `/\$(\d+)\$/g`, [pal]; [bq-js] L935–939). A Text value holding `$0$` would become a bound parameter. Whether the Tesseract planner does the same is UNVERIFIED.
4. **A negative number must be wrapped, `( -12.5 )`**: a sign is a unary operator in Postgres, SQL Server and Redshift ([pg-lex]; [ms-const]), and `x-{{n}}` with `-5` would otherwise read `x--5`, a comment.
5. **Keep xcube's typed wrappers** (`::numeric`, `CAST(… AS DECIMAL(38,s))`, BigQuery `NUMERIC`/`BIGNUMERIC`) so the cube's column types match the run's ([x-params] L79–113; [x-runner] L403–409). xcube validates a Number as `^-?\d+(\.\d+)?$` (at most 38 digits, 30 after the point) and a Date as a real `YYYY-MM-DD` ([x-params] L33–64). Never format a JS `number`.

## Per driver

### postgres

| Type | Literal | Rule | Source |
|---|---|---|---|
| Text | `E'…'` | `\` → `\\`, `'` → `''`, LF → `\n`, CR → `\r`, `$` → `\x24`. Reads the same whatever `standard_conforming_strings` is | [pg-lex] §4.1.2.1–2 |
| Text: NUL | none: refuse | "The character with the code zero cannot be in a string constant" | [pg-lex]; [pg-fn] |
| Number | `( -12.5 )::numeric` | A sign is an operator | [pg-lex] §4.1.2.6 |
| Date | `DATE '2024-01-31'` | ISO 8601, any DateStyle | [pg-lex] §4.1.2.7; [pg-dt] |
| Boolean | `TRUE` / `FALSE` | UNVERIFIED from Postgres's pages; Cube's base template writes them (fork [bq-js] L4737–4738) | — |

### redshift

| Type | Literal | Rule | Source |
|---|---|---|---|
| Text | `'…'`, `'` → `''`, each `\` as `' \|\| CHR(92) \|\| '`, a break after each `$` | Whether a backslash escapes is inferred from LIKE's docs, and `''` is UNVERIFIED; `\|\|` gives NULL if either side is NULL | [rs-like]; [rs-chr]; [rs-concat] |
| Text: NUL | none: refuse | `CHR(0)` is NULL | [rs-chr] |
| Number | `CAST( ( -12.5 ) AS DECIMAL(38,s))` | A decimal literal's type is UNVERIFIED | [rs-num]; [rs-cast] |
| Date | `CAST('2024-01-31' AS DATE)` | `DATE '…'` UNVERIFIED | [rs-dt]; [rs-cast] |
| Boolean | `TRUE` / `FALSE` | | [rs-bool] |

### mysql

| Type | Literal | Rule | Source |
|---|---|---|---|
| Text | `_utf8mb4 X'<hex of the UTF-8 bytes>'`; `''` when empty | No quote, backslash or `$` in it, so no `sql_mode` matters; carries NUL. Collation against a column is UNVERIFIED; empty `X''` is UNVERIFIED | [my-hex] |
| Number | `CAST( ( -12.5 ) AS DECIMAL(65,s))` | An exponent makes a DOUBLE | [my-num]; [x-params] L90–92 |
| Date | `DATE '2024-01-31'` | | [my-date] |
| Boolean | `TRUE` / `FALSE` | They are `1` and `0` | [my-bool] |

### snowflake

| Type | Literal | Rule | Source |
|---|---|---|---|
| Text | `'…'`, `\` → `\\`, `'` → `''`, LF → `\n`, CR → `\r`, NUL → `\0`, `$` → `\x24` | A backslash always escapes; an unknown escape drops it | [sf-text] |
| Number | `( -12.5 )::NUMBER(38,s)` | | [sf-num]; [x-params] L95–99 |
| Date | `TO_DATE('2024-01-31', 'YYYY-MM-DD')` | `DATE '…'` reads the session's `DATE_INPUT_FORMAT` | [sf-dt]; [sf-todate] |
| Boolean | `TRUE` / `FALSE` | | [sf-bool] |

### bigquery

| Type | Literal | Rule | Source |
|---|---|---|---|
| Text | `'…'`, `\` → `\\`, `'` → `\'`, LF → `\n`, CR → `\r`, `$` → `\x24`, other control characters `\xhh` | `''` is not an escape (adjacent literals concatenate); NUL UNVERIFIED | [gsql-lex]; [gsql-types] |
| Number | `NUMERIC '-12.5'` (≤ 29 integer digits, ≤ 9 scale), else `BIGNUMERIC '…'` | A bare `12.5` is FLOAT64 | [gsql-lex]; [gsql-types]; [x-runner] L403–409 |
| Date | `DATE '2024-01-31'` | | [gsql-lex] |
| Boolean | `TRUE` / `FALSE` | | [gsql-types] |

BigQuery's own lexical page could not be read; the GoogleSQL reference repo was used, and BigQuery matching it is UNVERIFIED.

### mssql (SQL Server)

| Type | Literal | Rule | Source |
|---|---|---|---|
| Text | `N'…'`, `'` → `''`; split a `\` before a newline, and after each `$`, with `+`, the first piece `CAST(N'…' AS nvarchar(max))` | `\` + newline is a line continuation inside a string; `+` truncates at 8000 bytes unless one side is `(max)`; NUL UNVERIFIED | [ms-const]; [ms-bs]; [ms-concat] |
| Number | `CAST( ( -12.5 ) AS DECIMAL(38,s))` | | [ms-const]; [x-params] L100–104 |
| Date | `CONVERT(DATE, '20240131', 112)` | No `DATE '…'`; style 112 is deterministic | [ms-nondet]; [ms-cast]; [ms-date] |
| Boolean | `CAST(1 AS BIT)` / `CAST(0 AS BIT)` | No boolean literal | [ms-const] |

### oracle

| Type | Literal | Rule | Source |
|---|---|---|---|
| Text | `'…'`, `'` → `''`, a break after each `$` with `' \|\| '` | No backslash escapes; at most 4000 bytes (STANDARD) or 32767 (EXTENDED); NUL UNVERIFIED | [ora-lit]; [ora-concat] |
| Text: empty | becomes NULL | | [ora-null] |
| Number | `( -12.5 )` | Never an `f`/`d` suffix | [ora-lit] |
| Date | `DATE '2024-01-31'` | | [ora-lit] |
| Boolean | 23ai: `TRUE` / `FALSE`; 19c: none in SQL | xcube binds booleans only on 23ai | [ora-dt23]; [ora-dt19]; [x-runner] L556 |

## Gotchas

1. The preview's session settings and the cube's differ (Summary 2).
2. `$<digits>$` in a literal is taken over by Cube's ParamAllocator (Summary 3).
3. **The model file reads braces before any SQL is read:** YAML models read `{member}` references, and Jinja `{{ }}`/`{% %}` is rendered over the whole file ([sibling-dm] L166–167, L957). A Text value holding `{`, `${` or `{{` must be escaped for the model format too, a layer apart from SQL's.
4. Replace `{{name}}` only in code positions, with the run's own lexer (xcube's `placeholdersOf`, [x-params] L126).
5. Numbers: emit the validated decimal string, in parentheses when negative, spaced; never a JS `number`.
6. SQL Server's `+` truncates at 8000 bytes unless a side is `(max)`.
7. Oracle: an empty Text is NULL; no SQL boolean before 23ai; literal size caps.
8. MySQL hex literal collation may need `COLLATE` (UNVERIFIED).

## Open questions / unverified

1. NUL in Text: impossible on Postgres and Redshift; UNVERIFIED on BigQuery, SQL Server and Oracle. Refuse it everywhere? A requirement decision.
2. Redshift: backslash escaping, `''`, `DATE '…'`, a decimal literal's type, and `CHR(92)`'s trailing blanks. Probe a live Redshift.
3. BigQuery: `'a''b'` with no space, and `\x00`.
4. Postgres `TRUE`/`FALSE` from Postgres's own docs.
5. Whether Tesseract also rewrites `$<digits>$`.
6. MySQL empty `X''` and the hex literal's collation.
7. Model-format escaping of `{`, `${` and `{{` in a Text value (Gotcha 3): not researched here.

[escape]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/sql-escape.ts
[pal]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/ParamAllocator.ts
[bq-js]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js
[pg-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-postgres-driver/src/PostgresDriver.ts
[my-drv]: https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-mysql-driver/src/MySqlDriver.ts
[x-runner]: ~/Work/bi/cube/xcube/src/sql/runner.ts
[x-params]: ~/Work/bi/cube/xcube/src/sql/parameters.ts
[sibling-dm]: ./cube/data-modeling.md
[pg-lex]: https://www.postgresql.org/docs/current/sql-syntax-lexical.html
[pg-dt]: https://www.postgresql.org/docs/current/datatype-datetime.html
[pg-fn]: https://www.postgresql.org/docs/current/functions-string.html
[rs-num]: https://docs.aws.amazon.com/redshift/latest/dg/r_numeric_literals201.html
[rs-dt]: https://docs.aws.amazon.com/redshift/latest/dg/r_Date_and_time_literals.html
[rs-bool]: https://docs.aws.amazon.com/redshift/latest/dg/r_Boolean_type.html
[rs-cast]: https://docs.aws.amazon.com/redshift/latest/dg/r_CAST_function.html
[rs-chr]: https://docs.aws.amazon.com/redshift/latest/dg/r_CHR.html
[rs-concat]: https://docs.aws.amazon.com/redshift/latest/dg/r_concat_op.html
[rs-like]: https://docs.aws.amazon.com/redshift/latest/dg/r_patternmatching_condition_like.html
[my-hex]: https://dev.mysql.com/doc/refman/8.4/en/hexadecimal-literals.html
[my-num]: https://dev.mysql.com/doc/refman/8.4/en/number-literals.html
[my-date]: https://dev.mysql.com/doc/refman/8.4/en/date-and-time-literals.html
[my-bool]: https://dev.mysql.com/doc/refman/8.4/en/boolean-literals.html
[sf-text]: https://docs.snowflake.com/en/sql-reference/data-types-text
[sf-num]: https://docs.snowflake.com/en/sql-reference/data-types-numeric
[sf-dt]: https://docs.snowflake.com/en/sql-reference/data-types-datetime
[sf-bool]: https://docs.snowflake.com/en/sql-reference/data-types-logical
[sf-todate]: https://docs.snowflake.com/en/sql-reference/functions/to_date
[gsql-lex]: https://github.com/google/googlesql/blob/master/docs/lexical.md
[gsql-types]: https://github.com/google/googlesql/blob/master/docs/data-types.md
[ms-const]: https://learn.microsoft.com/en-us/sql/t-sql/data-types/constants-transact-sql
[ms-bs]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/sql-server-utilities-statements-backslash
[ms-date]: https://learn.microsoft.com/en-us/sql/t-sql/data-types/date-transact-sql
[ms-cast]: https://learn.microsoft.com/en-us/sql/t-sql/functions/cast-and-convert-transact-sql
[ms-nondet]: https://learn.microsoft.com/en-us/sql/t-sql/data-types/nondeterministic-convert-date-literals
[ms-concat]: https://learn.microsoft.com/en-us/sql/t-sql/language-elements/string-concatenation-transact-sql
[ora-lit]: https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Literals.html
[ora-dt23]: https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Data-Types.html
[ora-dt19]: https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Data-Types.html
[ora-null]: https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Nulls.html
[ora-concat]: https://docs.oracle.com/en/database/oracle/oracle-database/23/sqlrf/Concatenation-Operator.html
