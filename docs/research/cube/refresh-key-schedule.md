---
library: Cube refresh_key schedules (pre-aggregation refresh worker)
packages: []
version: 1.7.42
researched: 2026-09-24
sources:
  [
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CompilerCache.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/test/unit/base-query.test.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/utils.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OptsHandler.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts,
    https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube.mdx,
    https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx,
    https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx,
    https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx,
  ]
---

# Cube refresh_key schedules 1.7.42

> **Historical in part, 2026-09-25** (architecture decisions 1 and 12, [docs/inputs/2026-09-25-architecture-decisions.md](../../inputs/2026-09-25-architecture-decisions.md)): "the store's version for store contexts" (:308) and the HS256 probe token (:470–476) predate xcube's own store and RS256.

## Summary

This doc covers a pre-aggregation's `refresh_key` schedule in self-hosted Cube Core 1.7.42: `every` as an interval or a cron, optionally with `timezone`. It explains how Cube turns that schedule into a refresh-key value, how the refresh worker notices when the value changes and rebuilds, and what the REST API shows about it. wechart imports no package for this. It writes YAML into the model and reads `/v1/meta?extended`.

It serves two ACs:

- **AC-153:** edit a cron and time zone, accept only what Cube can run, preview the next runs, and note the lateness.
- **AC-154:** list every schedule read-only in Schedules, with its owner and a "not scheduled" state.

All source links point at tag `v1.7.42`, which Sourcegraph indexes as commit `919434f42b50183179e97d1eed85696bafb05ae2`. Line anchors were read from that index: start lines are exact, and range ends are approximate. `@cubejs-backend/schema-compiler` 1.7.42 depends on `cron-parser ^4.9.0` and `moment-timezone ^0.5.48` ([sc-pkg]).

**Findings that change the plan:**

1. **An unsupported cron passes model compile.**
   - The compiler checks only that cron-parser can parse the string ([cv-every]).
   - The "equal time intervals" check runs later, whenever Cube generates the refresh-key SQL for that rollup ([bq-calc], [bq-inv]). That happens when the worker refreshes it, when a query the rollup would serve is planned (`/v1/load`, `/v1/sql`), and when a job builds it ([rs-rq], [capi-sql], [sc-pa-desc]).
   - `/v1/meta` and a compile-only publish check never see it.
2. **Cube's runtime rule is a regex, not "equal intervals":** `^(\*|\d+)? ?(\*|\d+) (\*|\d+) \* \* (\*|\d+)$` ([bq-calc]). Steps (`*/15`), ranges, lists, day-of-month and month are all refused, even when the schedule would be equally spaced.
   - Some crons the regex accepts are then run on a different schedule from the one they state. For example, `0 * * * 1` (hourly on Mondays) runs hourly every day. This is derived from the code; see "The equal-interval rule".
3. **The turn-over formula** is `FLOOR((utcOffset + now − dayOffset) / interval)` ([bq-every]).
   - `interval` and `dayOffset` come from the cron's first two fire times after the Unix epoch, computed in UTC ([bq-parse]).
   - `utcOffset` is a single snapshot of the zone's offset, taken when Cube generates the SQL ([bq-calc]). So the runs are periodic in UTC, not in local wall-clock time.
   - **A cron with no `timezone` runs in UTC, whatever the build time zone.** `moment.tz(undefined)` has offset 0 ([bq-calc], [mtz]).
   - (Inference) The generated SQL is cached, and the worker keeps that cache entry alive, so the offset snapshot can outlive a DST change until Cube recompiles the model or restarts ([capi-sql], [cc]).
4. **Lateness.** With the defaults, the key is re-read at most every `min(max(round(interval/10), 1), 300)` s ([bq-thresh], [qc-rk]), and the worker ticks every 30 s ([opts-timer]).
   - For a cron with a period of 50 minutes or more, detection is up to about 5 min 30 s after the turn-over, plus queue time and build time. For shorter periods it is `interval/10 + 30 s`.
   - "Up to about five minutes" is therefore close, but slightly low, for hourly and longer crons.
5. **`/v1/meta?extended` shows the refresh key as written**, not as SQL ([tme], [gw-meta]).
   - When the model declares no key, `refreshKey` is simply absent. Cube adds no default there ([sym-pa]).
   - The effective default is not always "every 1 hour": it depends on the cube-level keys ([bq-inv]).
   - (Inference) A `sql` key is a compiled function, and JSON drops functions, so `sql` does not appear in the metadata ([cv-pa], [mdn-json]).

**Verdicts on the earlier analysis:**

| # | Claim | Verdict |
|---|---|---|
| 1 | `every` takes an interval or a cron; `timezone` sets the cron's zone | **Correct, with corrections.**<br>• Cron: 5 fields, or 6 with a leading seconds field.<br>• Interval versus cron: the interval regex is tried first.<br>• `timezone` is also accepted with an interval, but it is ignored there.<br>• A cron without `timezone` runs in UTC, not in the query's time zone. |
| 2 | Cube runs only equal-interval crons; `55 7 * * 1-5`, `0 9,17 * * *` and `0 0 1 * *` fail | **The examples do fail.**<br>• The stage is wrong: they fail at SQL generation, not at compile.<br>• The exact rule is the regex above: day-of-week may be a single integer, and `*/15 * * * *` is refused.<br>• Some accepted shapes run on a different schedule from the one they state. |
| 3 | `FLOOR((epoch − offset) / interval)` | **Correct in form.** The exact formula, its anchor (the epoch, in UTC) and its DST behaviour are below. |
| 4 | "Up to about five minutes" | **Close.** Details under "Refresh worker cadence". |
| 5 | `/v1/meta?extended` exposes `refreshKey` | **Yes, as written.** It is absent when no key is declared, and `sql` is dropped (inference). |
| 6 | `sql`, and `sql` with `every` | Covered under "What `/v1/meta?extended` shows" and in "Gotchas". |
| 7 | The YAML shape | **Confirmed.** Quote the cron string. |
| 8 | Other interplay | Covered in "Gotchas". |

## Syntax

**How Cube tells an interval from a cron.**

- The validator tries `everyInterval` first, then `everyCronInterval`: `every: Joi.alternatives().try(everyInterval, everyCronInterval)` ([cv-pa]).
- The interval test is `^(\d+) (second|minute|hour|day|week)s?$`: exactly one space, lowercase, with an optional plural `s` ([cv-every]).
- At run time `everyRefreshKeyParts` applies the same regex, and treats anything else as a cron ([bq-parts]).
- So `1 Hour`, `1  hour` (two spaces) and `1 month` are not intervals. They are tried as crons and fail at compile.

**Cron check at compile.** The validator calls `cronParser.parseExpression(value)` with no options. The error text is `(<path> = <value>) CronParser: <error>` ([cv-every]).

- cron-parser 4.9 takes an optional leading seconds field (6 fields), plus `*`, `-`, `/`, `,` and `L` ([cp-readme]).
- The docs describe a "standard" 5-field format and an "advanced" format with a leading seconds field ([doc-cube-rk]).
- The compile check therefore passes any expression cron-parser accepts, including ranges, lists and steps.

**Cron check at SQL generation.** Only the regex shapes pass. See the next section.

**`timezone`.**

- At compile, the validator checks the name by parsing `'0 * * * *'` with `{ tz: value }`. On failure it reports `(<path> = <value>) unknown timezone. Take a look here https://docs.cube.dev/admin/time-zones#valid-time-zone-values to get available time zones` ([cv-every]).
- cron-parser 4.9 depends on `luxon` ([cp-npm]).
- At run time the offset comes from moment-timezone instead ([bq-calc]).

**Where each key is allowed.**

| Combination | Allowed | Source |
|---|---|---|
| `sql` with `every` | Only an interval `every`. "We cannot support cron interval" | [cv-pa] |
| `sql` with `timezone`, `incremental` or `update_window` | No. The `sql` branch allows only `sql` and `every`, and Joi `.keys()` narrows the allowed keys | [cv-pa], [joi-keys], `data-modeling.md` Y.4 |
| `every` (interval or cron) with `timezone`, `incremental`, `update_window` | Yes. `update_window` must be an interval string | [cv-pa] |
| cron with `sql` | Documented as a compile error: "Using CRON strings and `sql` is not supported and will result in a compilation error." | [doc-pa-rk] |

**Documented limits.** "`every` can accept only equal time intervals - so "Day of month" and "month" intervals in CRON expressions are not supported." ([doc-cube-rk]). The docs also say `timezone` "takes precedence over the query timezone" ([doc-cube-rk]). In 1.7.42, a cron without `timezone` does **not** fall back to the query time zone (see "Turn-over formula").

## The equal-interval rule (with the exact code)

**1. Compile stage** (`CubeValidator.ts`, [cv-every]). This check only proves that cron-parser can parse the string:

```ts
const everyCronInterval = Joi.string().custom((value, helper) => {
  try {
    cronParser.parseExpression(value);
    return value;
  } catch (e: any) {
    return helper.message({ custom: `(${formatStatePath(helper.state)} = ${value}) CronParser: ${e.toString()}` });
  }
});
```

The pre-aggregation schema ([cv-pa]):

```ts
const PreAggregationRefreshKeySchema = condition(
  (s) => defined(s.sql),
  Joi.object().keys({
    sql: Joi.func().required(),
    // We don't support timezone for this, because it's useless
    // We cannot support cron interval
    every: everyInterval,
  }),
  condition(
    (s) => defined(s.every),
    Joi.object().keys({
      every: Joi.alternatives().try(everyInterval, everyCronInterval),
      timezone: everyCronTimeZone,
      incremental: Joi.boolean().strict(),
      updateWindow: everyInterval
    }),
    requireOneOf('sql', 'every')
  )
);
```

**2. SQL-generation stage** (`BaseQuery.js`, [bq-parse], [bq-calc]). This is where an unsupported cron fails. Code is quoted from the tag with blank lines omitted.

```js
  parseCronSyntax(every) {
    // Use the Unix epoch as the reference point for calculating dayOffset.
    // The refresh key SQL formula is: FLOOR((unix_timestamp - dayOffset) / interval)
    // Since Unix timestamps are measured from Thu, 01 Jan 1970 00:00:00 UTC,
    // week boundaries naturally fall on Thursdays when dividing by 604800 (1 week).
    // By calculating dayOffset from the epoch to the first cron fire time,
    // we correctly shift the boundaries to align with the desired day of week.
    const opt = {
      utc: true,
      currentDate: new Date(0) // Unix epoch
    };
    try {
      const interval = cronParser.parseExpression(every, opt);
      let dayOffset = interval.next().getTime();
      const dayOffsetPrev = interval.prev().getTime();
      // If the cron fires exactly at the epoch, use 0 as dayOffset
      if (dayOffsetPrev === 0) {
        dayOffset = 0;
      }
      return {
        start: interval.next(),
        end: interval.next(),
        dayOffset: dayOffset / 1000, // Convert from ms to seconds
      };
    } catch (err) {
      throw new UserError(`Invalid cron string '${every}' in refreshKey (${err})`);
    }
  }

  calcIntervalForCronString(refreshKey) {
    const every = refreshKey.every || '1 hour';
    const { start, end, dayOffset } = this.parseCronSyntax(every);
    const interval = (end.getTime() - start.getTime()) / 1000;
    if (
      !/^(\*|\d+)? ?(\*|\d+) (\*|\d+) \* \* (\*|\d+)$/g.test(every.replace(/ +/g, ' ').replace(/^ | $/g, ''))
    ) {
      throw new UserError(`Your cron string ('${every}') is correct, but we support only equal time intervals.`);
    }
    let utcOffset = 0;
    if (refreshKey.timezone || this.timezone) {
      utcOffset = moment.tz(refreshKey.timezone).utcOffset() * 60;
    }
    return {
      utcOffset,
      interval,
      dayOffset,
    };
  }
```

`calcIntervalForCronString` is reached from three places ([bq-parts], [bq-thresh], [bq-inv]):

- `everyRefreshKeyParts`, which feeds `everyRefreshKeySql`;
- `refreshKeyRenewalThresholdForInterval`;
- `preAggregationInvalidateKeyQueries`, which runs for each matched or refreshed pre-aggregation.

`preAggregationInvalidateKeyQueries` is called from the schema compiler's `PreAggregations.preAggregationDescriptionFor` ([sc-pa-desc]). `CompilerApi.getSql` includes those descriptions in every SQL result ([capi-sql]). Cube's own test asserts that `everyRefreshKeySql({ every: '*/9 */7 * * *', ... })` throws a `UserError` ([t-sql]). No cron handling exists in the Rust planner at the tag: a code search of `rust/cube/cubesqlplanner` for `cron` or `refresh_key` found only test fixtures.

**The exact rule.**

- Runs of spaces are collapsed to one, and one space is dropped at each end. Nothing else is: a tab or a newline stays, and the cron is refused (corrected 2026-10-02; see "Checked 2026-10-02 (T377)"). The result must have the shape `[S ]M H * * D`, where each of `S`, `M`, `H` and `D` is `*` or an unsigned integer ([bq-calc]).
  - Day of month and month must be `*`.
  - Day of week is allowed, as a single integer.
  - No `/`, `-`, `,`, `L`, `?`, `W`, `#`, and no names such as `MON` or `JAN`.
- **`*/15 * * * *` is refused**, even though its runs are equally spaced. `15 minute` is the interval equivalent.
- Before the regex runs, `parseCronSyntax` must also parse the string. Any cron-parser error becomes `Invalid cron string '<every>' in refreshKey (<err>)` ([bq-parse]).
- The error thrown is the schema compiler's `UserError` (`type = 'UserError'`) ([ue]). The gateway answers such an error with HTTP 400 and `{ type, error, ... }` ([gw-err]).

**What Cube runs for an accepted cron** (derived from the code). The period `I` is the gap between the first two fire times after 1970-01-01T00:00Z, computed in UTC. The phase `D` is the first fire time at or after the epoch. Cube then treats the schedule as periodic, with `(t − D) mod I = 0` shifted by the offset ([bq-parse], [bq-calc], [bq-every]). This equals the cron's own occurrences **only when the integer fields run contiguously from the finest field**:

| Shape (5-field; with 6 fields, prefix `S`) | Example | Cube rebuilds | Matches the cron? |
|---|---|---|---|
| `* * * * *` | | every minute | yes |
| `M * * * *` | `15 * * * *` | hourly at :15 | yes |
| `M H * * *` | `0 8 * * *` | daily at 08:00 | yes |
| `M H * * D` | `30 5 * * 5` | weekly, Friday 05:30 | yes |
| `M * * * D` | `0 * * * 1` | **hourly, every day** (`I` = 3600, `D` = 345600) | no: the cron says Mondays only |
| `* H * * *` | `* 9 * * *` | **every minute, all day** (`I` = 60) | no: the cron says 09:00–09:59 only |
| `* * * * D`, `* H * * D` | `* 9 * * 1` | **every minute, every day** | no |

The rows marked "no" are derived from `parseCronSyntax` and are UNVERIFIED at run time; probe (a2) checks them. For the rows marked "yes", Cube's own tests pin `I` and `D` ([t-sql], [t-parts]):

| Cron | `I` | `D` |
|---|---|---|
| `0 * * * *` | 3600 | 0 |
| `30 * * * *` | 3600 | 1800 |
| `i * * * *` | 3600 | `i·60` |
| `0 10 * * *` | 86400 | 36000 |
| `30 5 * * 5` | 604800 | 106200 |
| `0 * * * * *` | 60 | 0 |

**A closed form wechart can use without a cron library**, for the "yes" shapes. This is derived; check it against the test vectors above.

- `I` is 1, 60, 3600, 86400 or 604800, by shape.
- `D = S + 60·M + 3600·H + 86400·((dow − 4) mod 7)`. Omit the terms for `*` fields, and read dow 7 as 0. The epoch was a Thursday, dow 4 ([bq-parse] comment).
- Check: `30 5 * * 5` gives 86400 + 18000 + 1800 = 106200, which matches [t-parts].

## Turn-over formula

`everyRefreshKeySql` ([bq-every]):

```js
    const { utcOffset, interval, dayOffset, cron } = this.everyRefreshKeyParts(refreshKey);
    if (!cron) {
      const utcOffsetPrefix = utcOffset ? `${utcOffset} + ` : '';
      return [this.floorSql(`(${utcOffsetPrefix}${this.unixTimestampSql()}) / ${interval}`), external, this];
    }
    ...
    return [this.floorSql(`(${utcOffset} + ${this.unixTimestampSql()} - ${dayOffset}) / ${interval}`), external, this];
```

`everyRefreshKeyParts` ([bq-parts]):

```js
    const every = refreshKey.every || '1 hour';
    if (/^(\d+) (second|minute|hour|day|week)s?$/.test(every)) {
      return {
        utcOffset: this.timezone ? moment.tz(this.timezone).utcOffset() * 60 : 0,
        interval: this.parseSecondDuration(every),
        dayOffset: 0,
        cron: false,
      };
    }
    return { ...this.calcIntervalForCronString(refreshKey), cron: true };
```

The query is wrapped as `SELECT <expr> as refresh_key` ([bq-inv]).

**Where the SQL runs.** When an external (Cube Store) query class is configured, as it is locally, `everyRefreshKeySql` delegates to it, and Cube Store's `UNIX_TIMESTAMP()` supplies `now` ([bq-every], [cs-unix]). Otherwise the source database runs it, with `EXTRACT(EPOCH FROM NOW())` on Postgres ([bq-unix], [t-sql]). With `CUBEJS_REFRESH_KEY_LOCAL_TIME=true`, the orchestrator instead computes `Math.floor((utcOffset + nowMs / 1000 - dayOffset) / interval)` from Cube's own clock ([oq-utils], [qc-local], [doc-env]). That path is off when `refreshKeyRenewalThreshold` is set, and for `incremental` keys ([qc-local], [bq-inv]).

**The formula**, with all times in Unix seconds:

- `key(t) = floor((O + t − D) / I)`.
- The key turns over at `t_k = D − O + k·I`.
- The next N runs after `now` are `t_j = D − O + (floor((O + now − D) / I) + 1 + j) · I`, for `j = 0..N−1`.

Cube's test asserts this exact expression against the SQL it renders ([t-agree]). The values of `I`, `D` and `O` depend on the kind of key:

| `every` kind | `I` | `D` | `O` (seconds east of UTC) |
|---|---|---|---|
| cron with `timezone: Z` | from the cron (previous section) | from the cron | `moment.tz(Z).utcOffset()*60` at SQL-generation time ([bq-calc]) |
| cron without `timezone` | from the cron | from the cron | **0 (UTC)**, whatever the build time zone. The branch is entered because `this.timezone` is set, but `moment.tz(undefined)` returns `moment.utc()` with no zone ([bq-calc], [mtz]) |
| interval `N unit` | `N` × 1, 60, 3600, 86400 or 604800 ([t-parts]) | 0 | the **build (query) time zone's** offset. `refresh_key.timezone` is ignored ([bq-parts]) |

**Consequences for the preview:**

- Interval keys are aligned to the epoch in the build time zone. `every: 1 day` turns over at local midnight of each zone in `scheduledRefreshTimeZones` (UTC by default). `every: 1 week` turns over **Thursdays at 00:00** in that zone. Derived from [bq-every] and the epoch comment in [bq-parse].
- With several build zones, an interval key has one schedule per zone. A cron with an explicit `timezone` has one schedule shared by all zones ([bq-parts], [bq-calc]).
- PR #9479 ("Make RefreshKeySql timezone-aware") describes crons without a zone as inheriting the query zone ([pr-9479]). The tag's code does not do that for crons.

**Across a DST change.** `O` is one constant, the zone's offset when Cube generated the SQL ([bq-calc]). The runs are therefore exactly periodic in UTC, and they sit at the cron's local wall-clock time only while `O` matches the zone's current offset. Two effects follow; both are inferences, checked by probe (b).

- **How long the snapshot lives.**
  - The worker plans each rollup through `compilerApi.getSql(baseQuery, { preAggregationsOnly: true })` ([rs-rq]).
  - `getSql` caches its result by query when `sqlCache` is on, which is the default ([capi-sql], [opts-defaults]). The cache is an LRU with a 10-minute TTL and `updateAgeOnGet: true` ([cc]).
  - `preAggregationInvalidateKeyQueries` is also cached in the query cache ([bq-inv]).
  - The worker's base query contains nothing time-dependent ([rs-base]), and the worker reads it on every tick. The entry, and the offset baked into its SQL, should therefore live until the model is recompiled or Cube restarts.
  - In wechart's `infra/cube/cube.js`, `schemaVersion` is the constant `'disk'` for the mounted model and the store's version for store contexts. So the mounted model recompiles only on restart, and a store model on each publish.
  - This affects the local-time path too: its descriptor is computed alongside the SQL ([bq-local]).
- **What happens when Cube regenerates with the new offset.** The key value jumps by `ΔO / I`. That can add a turn-over at that moment, or repeat an old key value; which one depends on where the jump lands relative to an interval boundary.

A worked example: `0 8 * * *` in America/Los_Angeles has `D` = 28800 and `I` = 86400.

- In PDT, `O` = −25200, so the key turns over at 15:00 UTC (08:00 PDT).
- After 2026-11-01, with the snapshot unchanged, it still turns over at 15:00 UTC, which is 07:00 PST.
- After Cube regenerates the SQL, `O` = −28800 and the turn-over moves to 16:00 UTC (08:00 PST).

wechart cannot read the worker's snapshot through any documented API. `/v1/sql` shows the API instance's own cache entry for a differently shaped query ([gw-sql]).

## Refresh worker cadence

**The tick.**

- With `CUBEJS_REFRESH_WORKER=true`, `scheduledRefreshTimer` is `true` ([opts-defaults], [env-worker]). `true` means **30 000 ms**; a number means that many seconds ([opts-timer]).
- The docs call the timer "merely a refresh worker's heartbeat": the refresh key "is checked for freshness every 30 seconds in the background" ([doc-config]).
- A tick that is still running when the next one is due makes the next one log `Refresh Scheduler Interval` with "Previous interval #N was not finished…" ([srv-timer]). The effective tick is therefore `max(timer, time one run takes)`.

**Each tick** works through three steps:

1. For each context from `scheduledRefreshContexts`, and each time zone ([srv-handle]), the worker walks all scheduled pre-aggregations, round-robin across pre-aggregations and then partitions ([rs-rr], [rs-refresh]).
2. It reads each partition's refresh key with `cacheMode: 'must-revalidate'`, so it waits for a renewed value once the cached one is stale ([rs-rr], [opa-renew], [plc], [qc-decide]).
3. When the key differs from the one the current table was built for, it queues a build.

Only pre-aggregations with a truthy `scheduledRefresh` are walked ([ev-sched]). Failed builds back off exponentially ([rs-refresh]).

**How stale a cached key may be** (`renewalThreshold`, in seconds). Resolution order: the `orchestratorOptions.queryCacheOptions.refreshKeyRenewalThreshold` option if set, else the key's own value, else 120 ([qc-rk]).

| Key | Key's own threshold | Source |
|---|---|---|
| `every` (interval or cron), no `sql` | `min(max(round(I/10), 1), 300)` | [bq-thresh] |
| `sql` with `every` (interval) | `max(round(I), 1)`, uncapped, so the SQL runs once per `every` | [bq-thresh], [bq-inv] |
| `sql` only | 10 (`defaultRefreshKeyRenewalThreshold`) | [bq-inv], [bq-defaults] |
| no `refresh_key` (hourly fallback) | 10 | [bq-inv] |
| incremental partitions outside `update_window` | `min(seconds since the boundary, 86400)` | [prl], [bq-inv] |

The docs agree: the key is "checked ten times within defined interval but not more than once per `1 second` and not less than once per `5 minute`" ([doc-cube-rk]).

**Worst-case start after a turn-over**, derived from the above:

> `renewalThreshold + tick` + the time the run takes to reach the partition + queue wait + build time.

| `every` | Detection lag (default tick 30 s) |
|---|---|
| `* * * * *` | 6 + 30 = 36 s |
| `15 minute` | 90 + 30 = 120 s |
| hourly, daily or weekly | 300 + 30 = 330 s |

So "up to about five minutes" holds for periods of 50 minutes or more only if the build itself is quick; the true bound is about five and a half minutes plus the build. For shorter periods the lag is smaller.

**What changes the cadence:**

- `scheduledRefreshTimer`, or the legacy `CUBEJS_SCHEDULED_REFRESH_TIMER` ([opts-timer], [env-worker]).
- `queryCacheOptions.refreshKeyRenewalThreshold`, which overrides every key's threshold and turns off local-time keys ([qc-rk], [qc-local]).
- `CUBEJS_REFRESH_KEY_LOCAL_TIME=true`, which computes the key on each check, making the lag about one tick ([qc-local], [doc-env]).

The local compose stack sets none of these ([compose]).

## What /v1/meta?extended shows

- The gateway spreads each compiled pre-aggregation definition into the response ([gw-meta], [tme]):

  ```ts
  { ...preAggregation, name, timeDimensionReference, dimensionReferences, measureReferences }
  ```

  So `refreshKey` is the object **as written** (camelCased), such as `{ "every": "0 8 * * *", "timezone": "America/Los_Angeles" }`. It is not SQL. The cube also carries its own `refreshKey` ([tme]).
- **No `refresh_key` declared → no `refreshKey` field.**
  - `transformPreAggregations` in the compiler fills defaults only for `type`, `allowNonStrictDateRangeMatch`, `scheduledRefresh` and `external`, plus indexes ([sym-pa]).
  - This explains the observed `scheduledRefresh: true` and `external: true` on a rollup whose YAML declares neither (`meta-extended-pre-aggregations.md`).
- **`scheduled_refresh: false`** is shown as `"scheduledRefresh": false`, with the key as written. The worker skips it ([ev-sched]). A `rollupJoin` or `rollupLambda` gets no `scheduledRefresh` default ([sym-pa]); the validator allows only `false` for some types (`pre-aggregations.md`).
- **`sql` keys** (inference; probe (d)).
  - A compiled `refreshKey.sql` is a function: the validator requires `Joi.func()` ([cv-pa]). `JSON.stringify` omits function-valued properties ([mdn-json]).
  - So `{sql, every: "1 hour"}` should appear as `{ "every": "1 hour" }`, and `{sql}` as `{}`. That is indistinguishable from a plain interval, or from no schedule.
  - wechart should read `sql` from the YAML it owns.
- **The effective key when none is declared** is decided by `preAggregationInvalidateKeyQueries` ([bq-inv], [bq-bycubes]):
  - If no cube in the rollup has a `sql` key and the rollup's own cube has no `refresh_key`: `every: '1 hour'`, re-read every 10 s.
  - If the rollup's own cube has a `refresh_key`, or any of its cubes has a `sql` key: each cube's own cube-level key. A cube with none uses the dialect default, `every: '10 seconds'` in `BaseQuery` ([bq-defaults]). The docs say `2 minute` on BigQuery, Athena, Snowflake, Presto and Firebolt ([doc-cube-rk]).
  - `original_sql` pre-aggregations: the cube's key, or the dialect default.

  This matches the docs, which say the default is `every: '1 hour'` "if neither of the cubes' pre-aggregation references don't override `refresh_key`" ([doc-pa-rk]).

**For Schedules (AC-154), per pre-aggregation:**

| Model says | Honest description | Source |
|---|---|---|
| cron + `timezone` | "At `<cron>` in `<zone>`", with next runs from the formula | [bq-every] |
| cron, no `timezone` | "At `<cron>` in **UTC**" | [bq-calc] |
| interval | "Every N unit, counted from the Unix epoch in each build time zone" | [bq-parts] |
| `sql` only | "Rebuilt when `<sql>` returns a new value; checked every 10 s" | [bq-inv], [doc-pa-rk] |
| `sql` + `every` | "Rebuilt when `<sql>` returns a new value; checked every `<every>`". The check runs once the cached value is `every` old; it is not aligned to the clock | [bq-thresh], [qc-decide] |
| `incremental` (± `update_window`) | The schedule applies only to partitions whose end, plus `update_window`, is after now. Older partitions are not rebuilt | [bq-incr], [doc-pa-rk] |
| none declared | Inherited, per the rules above | [bq-inv] |
| `scheduled_refresh: false`, `rollup_lambda`, `rollup_join` | Not scheduled; built only on demand (jobs API) | [ev-sched], [doc-pa-rk] |

A non-incremental partitioned rollup's key SQL contains no partition bounds. Every partition therefore turns over at once and is rebuilt; the docs say the key "is evaluated for each partition separately" ([doc-pa-rk], [bq-inv]). This is an inference and UNVERIFIED.

## YAML to write

```yaml
cubes:
  - name: orders
    # ...
    pre_aggregations:
      - name: main
        # ...
        refresh_key:
          every: "0 8 * * 1"            # quoted: see below
          timezone: America/Los_Angeles
          # incremental: true           # keep if already present
          # update_window: 7 day        # interval string only
```

- **Field names are confirmed:** `refresh_key`, `every`, `timezone`, `incremental`, `update_window`. The compiled forms are `refreshKey` and `updateWindow` ([cv-pa], [doc-pa-rk]). The docs' own cron example is `every: 30 5 * * 5` with `timezone: America/Los_Angeles` ([doc-cube-rk]).
- **Always quote the cron.** In YAML, `*` is the alias indicator ([yaml]), so an unquoted `* * * * *` does not parse as a string.
- **`timezone` without a cron** is accepted by the validator ([cv-pa]) but ignored for interval `every` ([bq-parts]). Don't write it with an interval, and don't show it as effective.
- **`timezone` with `sql`** is not allowed ([cv-pa]). **A cron with `sql`** is a compile error ([doc-pa-rk]).
- **`incremental: true` on a non-partitioned rollup** passes compile, then throws `Incremental refresh key can only be used for partitioned pre-aggregations …` at SQL generation ([bq-inv]). This is the same late-failure class as an unsupported cron.
- **Which crons to accept.** To satisfy AC-153's "accept only expressions Cube's refresh worker can run", wechart can mirror both of Cube's checks: cron-parser 4.x parses the string, and it matches the regex above. The accepted set is a product choice:
  - accept Cube's full regex set and preview Cube's periodic schedule, which can differ from the cron's literal meaning; or
  - accept only the rows marked "yes" in the equal-interval table.

## Gotchas

1. **Late failure blocks more than the one rollup** (inference from [rs-run], [rs-rr], [rs-refresh], [srv-handle]; probes (a) and (a3)).
   - The failing call sits outside the `try` that guards `executeQuery` in `refreshPreAggregations`. The error reaches `runScheduledRefresh`, which logs `Refresh Scheduler Error` and ends that context's run.
   - Every tick builds a fresh iterator (the timer passes `{}`), so each run should stop at the same pre-aggregation. Partitions after it, in round-robin order, would then never be refreshed for that context.
   - Queries the rollup would serve should fail with HTTP 400 ([capi-sql], [gw-err]).
2. **A cron with no `timezone` runs in UTC**, contrary to the docs' "precedence over the query timezone" wording and PR #9479's description ([bq-calc], [mtz], [doc-cube-rk], [pr-9479]).
3. **The offset snapshot may survive a DST change** until the model recompiles or Cube restarts (inference; probe (b)).
4. **Two time-zone databases.**
   - The name is validated with cron-parser, which uses luxon ([cv-every], [cp-npm]). The offset comes from moment-timezone 0.5.x ([bq-calc]).
   - moment-timezone logs `Moment Timezone has no data for <name>` for an unknown name, and leaves the moment in UTC ([mtz]). So a name only luxon knows would silently give offset 0. Which names differ is UNVERIFIED.
5. **`every` guarantees "at least once" per interval, not "at most once"** ([doc-pa-rk]). Jobs-API builds do not move the schedule: the next turn-over still rebuilds.
6. **The weekly anchor moved recently.** The changelog lists "schema-compiler: Correctly align weekly-based cron expressions (#10229)" ([changelog], [pr-10229]); that change is what anchors `dayOffset` to the epoch. The tag's code is as quoted. Don't carry over older descriptions of `dayOffset`.
7. **A bad cube-level cron is worse.** A cube-level `refresh_key` cron goes through the same function via `refreshKeysByCubes` ([bq-bycubes]). An unsupported one would break every non-rollup query on that cube (inference).
8. **The local REST port is 54000, not 4000.** The compose file maps `54000:4000` for the API and `127.0.0.1:54001:4000` for the worker ([compose]).

## Corrections to sibling docs

| Doc | Claim | Verdict | Source |
|---|---|---|---|
| `meta-extended-pre-aggregations.md` | Each pre-aggregation carries its `refreshKey` "as declared (`every`, or `sql`, with `incremental` and `update_window` in camelCase)" | **Partly.** `every`, `timezone`, `incremental` and `updateWindow` appear as written. `sql` is a function and is dropped by JSON (inference; probe (d)) | [tme], [cv-pa], [mdn-json] |
| `meta-extended-pre-aggregations.md` | With no key declared, "Whether the metadata then omits `refreshKey` or fills in the default was not observed" | **Answered:** omitted. No default is filled in | [sym-pa], [tme] |
| `meta-extended-pre-aggregations.md` | "Every 1 hour (Cube's default)" is right when the key is absent | **Only if** the rollup's own cube has no `refresh_key` and none of its cubes has a `sql` key. Otherwise cube-level keys apply, including the 10-second dialect default | [bq-inv], [bq-bycubes], [doc-pa-rk] |
| `pre-aggregations.md` | `refresh_key.timezone` is "Source-only"; CRON `timezone` is "Core (source-only, undocumented)… not surfaced until documented" | **Wrong.** Documented in the cube `refresh_key` reference, which the pre-aggregation reference points to for `every` values | [doc-cube-rk], [doc-pa-rk] |
| `pre-aggregations.md` | `refresh_key.every`: "Interval or CRON" | **Add:** at run time only the regex shapes pass | [bq-calc] |
| `pre-aggregations.md` | `refresh_key.sql` "Checked every 10 s by default"; CRON + `sql` is a compile error | **Confirmed** | [bq-inv], [bq-defaults], [cv-pa] |
| `data-modeling.md` Y.4 | `timezone` default: "query time zone" | **Wrong for crons** (they use UTC when it is absent). **Ignored for intervals**, which use the build zone | [bq-calc], [bq-parts], [mtz] |
| `data-modeling.md` Y.4 | `every` accepts "a 5- or 6-field CRON string" | **At compile, yes.** At run time only the regex shapes pass | [cv-every], [bq-calc] |
| `data-modeling.md` §Y (pre-aggregation `refresh_key`) | `{sql, every (interval)}` or `{every (interval or CRON), timezone, incremental, update_window}` | **Confirmed** | [cv-pa] |
| `refresh-jobs-caching.md` | `scheduledRefreshTimer` `true` means 30 s; it is a heartbeat | **Confirmed** | [opts-timer], [doc-config] |
| `refresh-jobs-caching.md` | `refreshKeyRenewalThreshold` and `backgroundRenew` are "tuning knobs" | **Add:** `refreshKeyRenewalThreshold` overrides every key's threshold and turns off `CUBEJS_REFRESH_KEY_LOCAL_TIME` | [qc-rk], [qc-local] |
| `configuration-deployment.md` | `refreshKeyRenewalThreshold` "dialect-dependent" | **More exactly:** computed per key (the threshold table above). The fallback is 120 s | [bq-thresh], [qc-rk] |
| `docs/tasks.md` T258 | The cron "passes Cube's compile check and wechart's publish check today, then fails later, at refresh time" | **Confirmed and extended.** It also fails queries the rollup serves, and (inference) aborts the worker's run for that context. Some regex-accepted crons run on a different schedule | [cv-every], [bq-calc], [rs-run] |

## Probes to run locally

The probes run against `docker compose up`. The API is at `http://localhost:54000/cubejs-api/v1` and the worker at `http://127.0.0.1:54001` ([compose]). The mounted model's `schemaVersion` is the constant `'disk'`, so **restart both Cube containers after each model edit** (`infra/cube/cube.js`; `data-modeling.md` §16). Put the probe model in a temporary file, `infra/cube/model/cubes/zz_probe_refresh.yml`, and delete it afterwards. Don't commit it.

Mint a token. `CUBEJS_API_SECRET` defaults to `dev-secret` ([compose]). An empty security context selects the mounted model (`infra/cube/cube.js`).

```sh
export CUBE=http://localhost:54000/cubejs-api/v1
export TOKEN=$(node -e '
const c=require("node:crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const n=Math.floor(Date.now()/1e3);const h=b({alg:"HS256",typ:"JWT"}),p=b({iat:n,exp:n+3600});
process.stdout.write(`${h}.${p}.${c.createHmac("sha256",process.env.CUBE_API_SECRET||"dev-secret").update(`${h}.${p}`).digest("base64url")}`)')
Q='{"measures":["probe_refresh.count"],"dimensions":["probe_refresh.status"]}'
```

The probe cube (a copy of the seeded `monthly_orders` columns), with one pre-aggregation swapped in per probe:

```yaml
cubes:
  - name: probe_refresh
    sql_table: public.orders
    dimensions:
      - { name: id, sql: id, type: number, primary_key: true }
      - { name: status, sql: status, type: string }
    measures:
      - { name: count, type: count }
    pre_aggregations:
      - name: probe
        measures: [count]
        dimensions: [status]
        refresh_key:
          every: "55 7 * * 1-5"          # (a); swap per probe
          timezone: America/Los_Angeles
```

**(a) Where a bad cron fails.** Run `docker compose restart cube cube-refresh-worker`, then:

1. `curl -s -H "Authorization: $TOKEN" "$CUBE/meta?extended=true" | jq '.cubes[]|select(.name=="probe_refresh").preAggregations'`
   - Expect 200, with `refreshKey: {every:"55 7 * * 1-5", timezone:"America/Los_Angeles"}`. Compile passes.
2. `curl -s -G -H "Authorization: $TOKEN" --data-urlencode "query=$Q" "$CUBE/sql"`, and the same against `$CUBE/load`.
   - Expect HTTP 400 with `{"type":"UserError","error":"Your cron string ('55 7 * * 1-5') is correct, but we support only equal time intervals."}`.
3. `docker logs --since 2m wechart-cube-refresh-worker 2>&1 | grep -i "Refresh Scheduler"`
   - Expect `Refresh Scheduler Error` naming the same message on each tick. If nothing shows, add `CUBEJS_LOG_LEVEL=info` to the worker (UNVERIFIED log level).
4. Set `every: "61 * * * *"`, restart, and repeat step 1.
   - Expect a compile error containing `CronParser:`. The exact text is UNVERIFIED.

**(a2) An accepted cron that runs on a different schedule.** Set `every: "0 * * * 1"` with no `timezone`, restart, then:

`curl -s -G -H "Authorization: $TOKEN" --data-urlencode "query=$Q" "$CUBE/sql" | jq '.sql.preAggregations[]|{preAggregationId,invalidateKeyQueries}'`

- Expect `SELECT FLOOR((0 + UNIX_TIMESTAMP() - 345600) / 3600) as refresh_key`, with `renewalThreshold: 300`. That is hourly, every day, in UTC.
- `/v1/sql` returns the whole `getSql` result, pre-aggregation descriptions included ([gw-sql], [capi-sql]).

**(a3) Does one bad rollup stall the others?**

1. Add a second cube, `probe_zz_ok`, after `probe_refresh` in the same file, with `every: "* * * * *"`. Keep `probe_refresh` on the bad cron. Restart.
2. Poll `/v1/load` for `probe_zz_ok` (as in (c)).
3. If `usedPreAggregations` never appears, or its table never changes, the stall is confirmed.
4. Swap the order of the two cubes and repeat.

**(b) Turn-over under a non-UTC zone, and across DST.**

- **Immediately:** set `every: "0 8 * * *"` with `timezone: America/Los_Angeles`, restart, and run the `/v1/sql` command from (a2).
  - In PDT, expect `FLOOR((-25200 + UNIX_TIMESTAMP() - 28800) / 86400)`.
  - Drop `timezone`, and send the query with `"timezone":"America/Los_Angeles"`. Expect `(0 + UNIX_TIMESTAMP() - 28800)`, which confirms the UTC fallback.
  - Set `every: "1 day"` with the same query zone. Expect `(-25200 + UNIX_TIMESTAMP()) / 86400`.
  - If `preAggregations` comes back empty for the LA-zone query, add `CUBEJS_SCHEDULED_REFRESH_TIMEZONES=UTC,America/Los_Angeles` to both services.
- **Across DST:** the nearest change is Sydney, 2026-10-04 02:00 AEST, which is 2026-10-03 16:00 UTC ([tad-syd], secondary source). Europe falls back on 2026-10-25 and the US on 2026-11-01 ([tc-2026], [tad-usa], secondary sources).
  1. Set `every: "0 9 * * *"` with `timezone: Australia/Sydney` before 2026-10-03, restart once, then leave the stack running. No restart and no publish until afterwards.
  2. Poll `/v1/load` every minute from 21:30 to 23:40 UTC on 2026-10-03, recording `usedPreAggregations[*].lastUpdatedAt` and the table name.
  3. A rebuild at about 22:00 UTC (09:00 AEDT) means Cube follows the wall clock. A rebuild at about 23:00 UTC (10:00 AEDT) confirms the frozen snapshot.

**(c) A `* * * * *` key rebuilds within its check period.** Set `every: "* * * * *"` (quoted), restart, then:

```sh
for i in $(seq 1 24); do date -u +%T; curl -s -G -H "Authorization: $TOKEN" --data-urlencode "query=$Q" "$CUBE/load" \
  | jq -c '.usedPreAggregations // .results[0].usedPreAggregations'; sleep 10; done
```

- Expect the table key and `lastUpdatedAt` to change once a minute, within about 36 s of each minute boundary plus build time. That is `renewalThreshold` 6 s plus the 30 s tick ([bq-thresh], [opts-timer]).
- The API refuses rollup queries until the first build finishes (`pre-aggregations.md`, "Observed locally").

**(d) `sql` keys in the metadata.** Set `refresh_key: { sql: "SELECT MAX(id) FROM public.orders", every: "1 hour" }`, restart, and run step 1 of (a).

- Expect `refreshKey: {"every":"1 hour"}`, with no `sql`.

## Checked 2026-10-02 (T377)

These were run on compose's Cube (xcube `v1.7.45-6d9673ccda`), on a throwaway model of their own, `probe-t377`, so the e2e model was not touched. Each rollup had `scheduled_refresh: false`. The SQL comes from `/v1/sql` under a query token for that model.

- **(a2), confirmed:** `every: "0 * * * 1"` with no zone generates `SELECT FLOOR((0 + UNIX_TIMESTAMP() - 345600) / 3600) as refresh_key`, with `renewalThreshold: 300`. That is hourly, every day, as derived above, so UNVERIFIED item 5 is settled for this shape.
- **(b), immediately, confirmed:** `every: "0 8 * * *"` with `timezone: America/Los_Angeles`, in PDT, generates `FLOOR((-25200 + UNIX_TIMESTAMP() - 28800) / 86400)`. The offset is taken when the SQL is generated. The DST half of (b) is still to be run.
- **An interval of 0:** `every: "0 hour"` passes compile and generates `FLOOR((UNIX_TIMESTAMP()) / 0)`, with `renewalThreshold: 1`. It is a key that divides by zero, so wechart refuses it.
- **Whitespace, confirmed as "The exact rule" reads:** `"\t0 8 * * *"` passes compile, and a dry-run `/v1/sql` probe answers `400 Your cron string ('\t0 8 * * *') is correct, but we support only equal time intervals.` `" 0 8 * * * "` (spaces) is accepted. Cube collapses spaces and drops one at each end, and nothing else.

## UNVERIFIED items

1. The end-to-end effects of an unsupported cron: the HTTP 400 body on `/v1/load` and `/v1/sql`, the jobs-API failure, and the worker log text and its level. These are inferred from the code path ([capi-sql], [gw-err], [rs-run]); probe (a) settles them.
2. That one bad rollup stops a context's whole scheduled run on every tick. Inferred from [rs-rr], [rs-refresh] and [srv-handle]; probe (a3).
3. That the `utcOffset` snapshot outlives a DST change until the model recompiles or Cube restarts, and what happens to the key when it is regenerated. Inferred from [capi-sql], [cc], [rs-base] and [bq-calc]; probe (b).
4. That `sql` is missing from `/v1/meta?extended`. Inferred from [cv-pa], [tme] and [mdn-json]; probe (d).
5. The run-time schedule of regex-accepted shapes such as `0 * * * 1` and `* 9 * * *`. Derived from [bq-parse] and [bq-calc]; probe (a2). *`0 * * * 1` confirmed 2026-10-02 (see "Checked 2026-10-02 (T377)"); the other shapes follow the same code.*
6. The exact compile-error text for an unparsable cron. The Joi alternatives message may list both the interval and the `CronParser` reasons (`data-modeling.md` notes "Possible reasons (one of):").
7. Whether cron-parser 4.9 accepts aliases such as `@hourly`. Its README does not mention them ([cp-readme]). The run-time regex refuses them in any case ([bq-calc]).
8. Which IANA names luxon accepts but moment-timezone 0.5.48 lacks. Such a name would give offset 0 ([mtz]).
9. That every partition of a non-incremental partitioned rollup rebuilds at each turn-over. Inferred from identical key SQL ([bq-inv], [doc-pa-rk]).
10. The 2026 DST dates come from secondary sources ([tad-syd], [tc-2026], [tad-usa]).
11. Which release first shipped #10229's epoch-anchored `dayOffset`. The PR page states none ([pr-10229]); the tag's code is as quoted.

[bq-parse]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4853-L4882
[bq-calc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4885-L4910
[bq-parts]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4917-L4930
[bq-local]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4936-L4940
[bq-every]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4942-L4965
[bq-incr]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L5054-L5067
[bq-defaults]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L5070-L5078
[bq-inv]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L5104-L5212
[bq-thresh]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L5215-L5230
[bq-bycubes]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4288-L4345
[bq-unix]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/BaseQuery.js#L4387-L4389
[cs-unix]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/CubeStoreQuery.ts#L140-L142
[sc-pa-desc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/adapter/PreAggregations.ts#L319-L325
[cv-every]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts#L87-L111
[cv-pa]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts#L531-L556
[sym-pa]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeSymbols.ts#L749-L776
[ev-sched]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CubeEvaluator.ts#L934-L985
[cc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/CompilerCache.ts#L9-L40
[ue]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/src/compiler/UserError.ts#L1-L7
[sc-pkg]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/package.json
[t-sql]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/test/unit/base-query.test.ts#L1316-L1368
[t-parts]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/test/unit/base-query.test.ts#L1371-L1396
[t-agree]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-schema-compiler/test/unit/base-query.test.ts#L1399-L1436
[qc-local]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts#L240-L262
[qc-rk]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts#L513-L532
[qc-decide]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts#L1040-L1067
[oq-utils]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/utils.ts#L46-L60
[plc]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationLoadCache.ts#L193-L208
[opa-renew]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts#L580
[prl]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-query-orchestrator/src/orchestrator/PreAggregationPartitionRangeLoader.ts#L185-L203
[opts-defaults]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OptsHandler.ts#L402-L418
[opts-timer]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/OptsHandler.ts#L556-L588
[env-worker]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-backend-shared/src/env.ts#L261-L280
[srv-timer]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts#L371-L396
[srv-handle]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/server.ts#L810-L841
[rs-rq]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L143-L190
[rs-base]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L193-L227
[rs-run]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L258-L310
[rs-rr]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L503-L611
[rs-refresh]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/RefreshScheduler.ts#L614-L672
[capi-sql]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-server-core/src/core/CompilerApi.ts#L355-L382
[gw-meta]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L832-L855
[gw-sql]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L1556-L1593
[gw-err]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts#L2524-L2585
[tme]: https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/helpers/transform-meta-extended.ts#L37-L109
[doc-cube-rk]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/cube.mdx
[doc-pa-rk]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx
[doc-config]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/config.mdx
[doc-env]: https://raw.githubusercontent.com/cube-js/cube/v1.7.42/docs-mintlify/reference/configuration/environment-variables.mdx
[changelog]: https://github.com/cube-js/cube/blob/v1.7.42/CHANGELOG.md
[pr-10229]: https://github.com/cube-js/cube/pull/10229
[pr-9479]: https://github.com/cube-js/cube/pull/9479
[mtz]: https://github.com/moment/moment-timezone/blob/0.5.48/moment-timezone.js
[cp-readme]: https://github.com/harrisiirak/cron-parser/blob/4.9.0/README.md
[cp-npm]: https://registry.npmjs.org/cron-parser/4.9.0
[yaml]: https://yaml.org/spec/1.2.2/#53-indicator-characters
[joi-keys]: https://github.com/hapijs/joi/blob/v17.13.3/API.md#objectkeysschema
[mdn-json]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
[compose]: ../../../docker-compose.yml
[tad-syd]: https://www.timeanddate.com/time/change/australia/sydney
[tad-usa]: https://www.timeanddate.com/time/change/usa
[tc-2026]: https://timechange.org/pages/time-change-2026
