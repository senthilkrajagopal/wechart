---
library: pg-boss
packages: [pg-boss, pg]
version: 12.33.2
researched: 2026-09-19
sources:
  [
    https://pgboss.io/,
    https://pgboss.io/api/constructor,
    https://pgboss.io/api/queues,
    https://pgboss.io/api/jobs,
    https://pgboss.io/api/workers,
    https://github.com/timgit/pg-boss,
    https://registry.npmjs.org/pg-boss/latest,
    https://docs.bullmq.io/,
    https://registry.npmjs.org/bullmq/latest,
    https://registry.npmjs.org/croner/latest,
    https://registry.npmjs.org/cron-parser/latest,
    https://docs.cube.dev/reference/core-data-apis/rest-api/reference,
  ]
---

# pg-boss 12.33.2 (scheduler and job runner)

## Summary

Recommendation: **pg-boss 12.33.2**, MIT, as wechart's queue and cron scheduler; no new infrastructure beyond the Postgres we already run. It covers AC-149 (submit + poll a Cube build), AC-150 (durable history — see the caveat: we own the history table, not pg-boss), AC-153 (cron + next-N-runs preview via `previewSchedule`), AC-155 (retry/backoff/dead-letter primitives; the consecutive-failure suspension is ours to write), AC-156 (queue/worker state via `getQueueStats`; Cube health via Cube's own `/readyz` and `/livez`).

- pg-boss is "Queueing jobs in Postgres from Node.js", MIT, deps `pg ^8.23.0`, `cron-parser ^5.10.1`, `rrule-temporal ^2.2.5`, `serialize-error ^13.0.1`, `engines.node >=22.12.0` ([npm registry](https://registry.npmjs.org/pg-boss/latest)).
- Requirements: "PostgreSQL 13 or higher", "Node 22.12 or higher, or Bun"; "Multi-master compatible (for example, in a Kubernetes ReplicaSet)"; "pg-boss is MIT licensed and always will be" ([README](https://github.com/timgit/pg-boss/blob/master/README.md)).
- Maintenance: releases 12.31.1 → 12.33.2 all shipped 2026-09-13 … 2026-09-18 ([releases](https://github.com/timgit/pg-boss/releases)).

## Install

```
pnpm add pg-boss@12.33.2
```

- No separate `pg` install needed for the default backend; `pg ^8.23.0` is a direct dependency ([npm registry](https://registry.npmjs.org/pg-boss/latest)). Other backends/pool sharing go through adapters ([docs](https://pgboss.io/api/adapters)).
- Infrastructure: one Postgres 13+ database/schema. Nothing else — no Redis, no broker ([README](https://github.com/timgit/pg-boss/blob/master/README.md)).
- A CLI ships for schema migrations, plus an optional `@pg-boss/dashboard` 1.9.0 (MIT, React 19 + Hono, no auth of its own) ([README](https://github.com/timgit/pg-boss/blob/master/README.md), [npm](https://registry.npmjs.org/@pg-boss/dashboard/latest)). We build our own UI, so treat the dashboard only as a reference implementation.

## Init / auth pattern

```ts
import PgBoss from 'pg-boss';
const boss = new PgBoss({ connectionString: process.env.WECHART_DB_URL! });
boss.on('error', log.error); // events: { error, warning }
await boss.start(); // runs schema migrations by default
await boss.createQueue('cube.preagg-build', { policy: 'singleton', retryLimit: 3 });
await boss.work('cube.preagg-build', { pollingIntervalSeconds: 2 }, async ([job]) => {
  /* … */
});
await boss.stop({ graceful: true });
```

- `start()` / `stop(options)` and the `error`/`warning` events are on the exported class ([src/index.ts](https://github.com/timgit/pg-boss/blob/master/src/index.ts), [src/boss.ts](https://github.com/timgit/pg-boss/blob/master/src/boss.ts)); `StopOptions = { close?, graceful?, timeout? }` ([src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)).
- Per-replica switches in the constructor: `migrate` (default true — "skip attempts to run schema migrations during `start()`" when false), `schedule` (default true; false = this instance neither monitors nor creates scheduled jobs), `supervise` (default true; false = skip flows, maintenance and monitoring) ([api/constructor](https://pgboss.io/api/constructor)).

## API surface we will use

- `send(name, data?, options?): Promise<string|null>` and `work(name, options, handler): Promise<string>` ([src/index.ts](https://github.com/timgit/pg-boss/blob/master/src/index.ts)). Handler gets a jobs array; "If the `handler` returns a value or an object, it will be stored in the `output` property"; an unhandled error auto-calls `fail()` ([api/workers](https://pgboss.io/api/workers)).
- `WorkOptions` = fetch + polling + concurrency options plus `heartbeatRefreshSeconds`, `perJobResults`, `transactional`, `transactionTimeoutSeconds`; fetch side has `batchSize`, `includeMetadata`, `minPriority`/`maxPriority`; polling has `pollingIntervalSeconds` (default 2, must be >= 0.5) and `localConcurrency` (default 1) ([src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts), [api/workers](https://pgboss.io/api/workers)).
- Long-running poll jobs (AC-149): `Job` carries `signal: AbortSignal`, `heartbeatSeconds`, `expireInSeconds`. `heartbeatSeconds` is "how long before a missing heartbeat is considered a failure"; `heartbeatRefreshSeconds` defaults to `heartbeatSeconds / 2` and "Heartbeats are sent automatically by `work()`"; the job stays `active` for as long as the handler runs, bounded by `expireInSeconds` (default 15 minutes) ([api/workers](https://pgboss.io/api/workers), [src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)).
- Retry/backoff (AC-155 primitives), settable per queue or per job: `retryLimit` (default 2), `retryDelay` (default 0s), `retryBackoff` (exponential on `retryDelay`), `retryDelayMax`, and `deadLetter` to route jobs after retries are exhausted ([api/queues](https://pgboss.io/api/queues), [api/jobs](https://pgboss.io/api/jobs)).
- Queue policies: `standard | short | singleton | stately | exclusive | key_strict_fifo`; `singleton` = "Only one active job allowed; unlimited queued jobs" — the right policy for "one build in flight per pre-aggregation" ([api/queues](https://pgboss.io/api/queues), [src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)).
- Schedules (AC-153):
  ```ts
  schedule(name: string, cron: string, data?: object|null, options?: ScheduleOptions): Promise<void>
  unschedule(name: string, key?: string): Promise<void>
  getSchedules(name?: string, key?: string): Promise<Schedule[]>
  getSchedule(name: string, key?: string): Promise<Schedule | null>
  previewSchedule(cron: string, options?: PreviewScheduleOptions): Date[]
  ```
  ([src/index.ts](https://github.com/timgit/pg-boss/blob/master/src/index.ts)). `PreviewScheduleOptions = { tz?, from?, count? }` (count 1–1000) — this is exactly the "show the next runs it implies" API for AC-153, computed without inserting anything. `ScheduleOptions = SendOptions & { tz?, key?, missed? }` with `ScheduleMissedPolicy = 'skip' | 'once'` and `ScheduleKind = 'cron' | 'rrule'`; `Schedule` exposes `name, key, kind, cron, timezone, data, options, createdOn, updatedOn, lastJobId` ([src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)). The `key` lets one target hold several named schedules and lets us suspend exactly one.
- Cron syntax: standard five-field (minute, hour, day-of-month, month, day-of-week), plus `tz`, plus an `rrule` alternative ([api/jobs](https://pgboss.io/api/jobs)).
- History read: `getJobById<T>(name, id, options?): Promise<JobWithMetadata<T> | null>`; `JobWithMetadata` has `state: 'created'|'retry'|'active'|'completed'|'cancelled'|'failed'`, `retryCount`, `startAfter`, `startedOn`, `completedOn`, `createdOn`, `keepUntil`, `output`, `deadLetter`, `policy` ([src/index.ts](https://github.com/timgit/pg-boss/blob/master/src/index.ts), [src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)).
- Observability (AC-156): `getQueueStats(name, options?)` returns "depth snapshots with job counts (queued, active, failed, total)", with optional time-series downsampling; `getQueue`, `updateQueue`, `deleteQueue` round it out ([api/queues](https://pgboss.io/api/queues), [src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)). Cube-side health for AC-156 is Cube's own `GET /readyz` ("Reports if the deployment has successfully started") and `GET /livez`, both returning `{"health":"HEALTH"}` / `{"health":"DOWN"}` ([Cube REST reference](https://docs.cube.dev/reference/core-data-apis/rest-api/reference)).

## Multi-replica behaviour (K8s, >1 API replica)

- pg-boss claims delivery from "Postgres's SKIP LOCKED … This provides exactly-once delivery and the safety of guaranteed atomic commits" ([README](https://github.com/timgit/pg-boss/blob/master/README.md)). In practice it is at-least-once across a crash: "If a process crashes mid-handler, the job carries the shutdown failure" and becomes available for retry; in-flight jobs that are never settled expire per `expireInSeconds` and retry ([api/workers](https://pgboss.io/api/workers)). Design our Cube-build handler to be idempotent.
- Cron fan-out is coordinated in the database, not by leader election in the app: the cron pass is claimed with `trySetCronTime()` so one instance runs the pass per interval, and each occurrence is filed under a singleton key — "the singleton key a forwarded occurrence is filed under … is what keeps two instances sending the same occurrence from creating two jobs" ([src/timekeeper.ts](https://github.com/timgit/pg-boss/blob/master/src/timekeeper.ts)). Occurrences are also grouped into 60-second throttle slots (same file).
- Maintenance is likewise coordinated: "One instance per interval performs it, coordinated through the database, so adding instances does not multiply the work" ([api/constructor](https://pgboss.io/api/constructor)).
- Clock skew across pods is monitored and surfaced: the timekeeper emits a warning when `skewSeconds >= 60` ([src/timekeeper.ts](https://github.com/timgit/pg-boss/blob/master/src/timekeeper.ts)) — wire that `warning` event into AC-156's worker-state panel.

## Restart and crash recovery

- A schedule whose occurrence came due while nothing was running is governed by `missed: 'skip' | 'once'` — "determines handling of occurrences during downtime" ([src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)). Pick `skip` for cache warm-ups, `once` for builds that must not be skipped; this is a per-schedule UI choice we must expose.
- Jobs already queued survive any restart: they are rows in Postgres, subject only to `retentionSeconds` ([api/queues](https://pgboss.io/api/queues)).
- Graceful shutdown: `offWork(name|id, { wait })` "wait until current jobs finish" (default true), and `stop({ graceful, timeout, close })` ([api/workers](https://pgboss.io/api/workers), [src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)). Combine with `job.signal` so a SIGTERM aborts the Cube poll loop rather than being killed mid-request.
- Hard crash: nothing marks the job complete; it expires after `expireInSeconds` (or a missed heartbeat) and is retried per the queue's retry policy ([api/workers](https://pgboss.io/api/workers)).

## History and retention (AC-150 — important)

- pg-boss's own tables are **not** a long-term history store. Defaults: `retentionSeconds` 14 days (created/retry), `deleteAfterSeconds` 7 days ("How long a job should be retained in the database after it's completed"), `maintenanceIntervalSeconds` default 1 day for cleaning completed/archived jobs ([api/queues](https://pgboss.io/api/queues), [api/jobs](https://pgboss.io/api/jobs), [api/constructor](https://pgboss.io/api/constructor)).
- So AC-150 needs a wechart-owned table (target, partitions, duration, outcome, log) written by the handler. This is what actually beats Cube's limit: Cube states "Job records are kept for 24 hours", and `not_found` means "The token is unknown, or the job record has expired" ([Cube REST reference](https://docs.cube.dev/reference/core-data-apis/rest-api/reference)). Cube's statuses to persist per AC-149: `scheduled`, `processing`, `done`, `failure: <error>`, `missing_partition`, `not_found` (same page).
- `deleteAfterSeconds` can be raised per queue if we also want queue-level forensics, but the durable record should not depend on it.

## Gotchas

- AC-155 is not built in. Neither `schedule/unschedule/getSchedules/getSchedule/previewSchedule` ([src/index.ts](https://github.com/timgit/pg-boss/blob/master/src/index.ts)) nor `ScheduleOptions` ([src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)) has a failure-driven suspend. Implement it in wechart: count consecutive failures in our schedule row (fed by the handler or by a dead-letter queue worker), call `unschedule(name, key)` at the threshold, mark the row suspended, and re-`schedule(...)` on Resume. `retryLimit`/`retryBackoff`/`deadLetter` cover within-run retries only ([api/queues](https://pgboss.io/api/queues)).
- Schema migrations run on `start()` by default ([api/constructor](https://pgboss.io/api/constructor)) and 12.33.0 was a **breaking schema bump to version 42** ([releases](https://github.com/timgit/pg-boss/releases)). With several replicas rolling at once, prefer `migrate: false` in the app plus an explicit CLI migration step ([README](https://github.com/timgit/pg-boss/blob/master/README.md)).
- Known bug, open: "Object with Date inside job data coerces it to ISO String" (#840, 2026-07-08) — job payloads are JSON; re-parse dates in the handler ([issues](https://github.com/timgit/pg-boss/issues?q=is%3Aissue+is%3Aopen)). Also open: "Silently rejecting jobs when the db is not connected" (#438) — surface `send()` results, do not fire-and-forget.
- Open feature request #557 "Job scheduling: save nextExecution in DB for resilience" — next-run times are computed, not stored, so UI previews come from `previewSchedule` at read time ([issues](https://github.com/timgit/pg-boss/issues?q=is%3Aissue+is%3Aopen)).
- Timer fix in 12.33.1: claim logic was "skipping an interval of work on a healthy deployment" ~20% of the time — a reason to pin >= 12.33.1 ([releases](https://github.com/timgit/pg-boss/releases)).
- Polling load: every worker polls (`pollingIntervalSeconds` >= 0.5) ([api/workers](https://pgboss.io/api/workers)); with `useListenNotify` available as a constructor option ([src/types.ts](https://github.com/timgit/pg-boss/blob/master/src/types.ts)), tune before adding many queues.
- DST: pg-boss depends on `cron-parser ^5.10.1` and `rrule-temporal ^2.2.5` ([npm registry](https://registry.npmjs.org/pg-boss/latest)); cron-parser uses Luxon and "will correctly handle DST transition" ([cron-parser README](https://github.com/harrisiirak/cron-parser)). UNVERIFIED: pg-boss's own docs do not state which engine evaluates `cron` vs `rrule` schedules or its exact DST rule for skipped/repeated local times — timekeeper.ts only shows both engines validate the time zone and coalesce a falsy zone to a default ([src/timekeeper.ts](https://github.com/timgit/pg-boss/blob/master/src/timekeeper.ts)). Test the spring-forward/fall-back cases against `previewSchedule` before shipping AC-153.

## Alternatives considered

- **BullMQ 6.3.8** (MIT, Redis): `upsertJobScheduler(id, { pattern, every, tz, limit, startDate, endDate })`, attempts + fixed/exponential (`2 ^ (attempts - 1) * delay`) backoff with jitter and custom `backoffStrategy`, `getJobCounts`/`getJobs(['completed'], 0, 99, true)`, `QueueEvents` for cross-process updates, stalled-job recovery via lock renewal (`stalledInterval`, `maxStalledCount`) ([npm](https://registry.npmjs.org/bullmq/latest), [job schedulers](https://docs.bullmq.io/guide/job-schedulers), [retrying](https://docs.bullmq.io/guide/retrying-failing-jobs), [getters](https://docs.bullmq.io/guide/jobs/getters), [stalled](https://docs.bullmq.io/guide/workers/stalled-jobs)). Double-run protection is "The scheduler will only generate new jobs when the last job begins processing" ([job schedulers](https://docs.bullmq.io/guide/job-schedulers)). Rejected on fit, not effort: it requires Redis in the stack with `maxmemory-policy=noeviction` and `maxRetriesPerRequest: null` on workers ([connections](https://docs.bullmq.io/guide/connections)); history lives in Redis sets that are kept indefinitely by default and trimmed only lazily ("jobs are not removed unless a new job completes or fails") ([auto-removal](https://docs.bullmq.io/guide/queues/auto-removal-of-jobs)), so AC-150's durable record still needs Postgres — plus event streams auto-trim at "~10.000 events" ([events](https://docs.bullmq.io/guide/events)). Adding an in-memory store as the system of record for build history is a durability regression for AC-150.
- **In-process timer (croner 10.0.1, MIT, zero-dep; or cron-parser 5.10.1, MIT)**: croner offers seconds + year fields, `L`/`W`/`#`, `@daily` nicknames, `timezone` "in Europe/Stockholm format" with DST handling, `nextRuns(n)`, `msToNext()`, `pause/resume/stop`, `maxRuns`, and overrun `protect` ([npm](https://registry.npmjs.org/croner/latest), [croner README](https://github.com/hexagon/croner)); cron-parser gives `CronExpressionParser.parse(expr, { currentDate, tz, startDate, endDate, strict })` and `take(n)` ([cron-parser README](https://github.com/harrisiirak/cron-parser)). Both are schedule _calculators/timers_ only — the READMEs document no persistence, no queue, and no cross-process coordination, so with >1 replica every pod fires every schedule, and a crash loses in-flight work. Unsuitable for AC-149/150/155 on their own. Note pg-boss already vendors cron-parser, so `previewSchedule` gives us the AC-153 preview without a second dependency.
- 11.0.0-dev.0 of croner and dev builds of 10.0.2 exist but are pre-release; 10.0.1 is the published latest ([npm](https://registry.npmjs.org/croner/latest), [croner releases](https://github.com/hexagon/croner/releases)).

## Open questions / unverified

- DST semantics for pg-boss schedules on the skipped/duplicated local hour (above). Needs an integration test against `previewSchedule` with `tz`.
- UNVERIFIED: BullMQ's behaviour when every worker is down at a scheduled iteration. Docs only say "as long as a Job Scheduler is producing jobs, there will be always one job associated to the scheduler in the Delayed status" ([job schedulers](https://docs.bullmq.io/guide/job-schedulers)); the downtime/catch-up rule is not stated on that page. Moot if we take pg-boss, whose `missed` policy is explicit.
- Product decisions for the user: default `missed` policy per schedule kind (build vs warm-up), the default consecutive-failure threshold for AC-155, and how long wechart keeps build history and logs for AC-150 (Cube's own window is 24 hours).
- UNVERIFIED: whether `getQueueStats` alone satisfies AC-156's "refresh worker's state", or whether we must also read Cube's refresh-worker signals. Cube's `/readyz` and `/livez` are documented ([Cube REST reference](https://docs.cube.dev/reference/core-data-apis/rest-api/reference)); a dedicated refresh-worker status endpoint was not found on that page and belongs in the Cube API research doc.
