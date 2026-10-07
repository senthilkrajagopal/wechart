---
library: pg-boss (as installed)
packages: [pg-boss]
version: 12.33.2
researched: 2026-10-02
sources:
  [
    packages/api/node_modules/pg-boss/package.json,
    packages/api/node_modules/pg-boss/dist/index.d.ts,
    packages/api/node_modules/pg-boss/dist/types.d.ts,
    packages/api/node_modules/pg-boss/dist/clock.d.ts,
    packages/api/node_modules/pg-boss/dist/timekeeper.js,
    https://github.com/timgit/pg-boss/blob/master/src/index.ts,
  ]
---

# pg-boss 12.33.2, as installed (T378): corrections to `scheduler.md`

This doc was read from the installed package (`pnpm add pg-boss@12.33.2`, 2026-10-02) and probed in Node. It corrects and adds to `scheduler.md`. Where the two disagree, this doc holds.

## Corrections

| `scheduler.md` says | As installed | Source |
|---|---|---|
| `import PgBoss from 'pg-boss'` (a default export) | **A named export**: `import { PgBoss } from 'pg-boss'`. The package is ESM (`"type": "module"`), and `dist/index.d.ts` declares `export declare class PgBoss`. It has no default export. | `package.json`; `dist/index.d.ts` L19 |
| "Cron syntax: standard five-field" | **Six fields are accepted too**, the first being seconds. `previewSchedule('0 0 7 * * 1')` returned Mondays at 07:00:00. So a five-field rule is wechart's own to enforce. | probe, below |
| DST rule "UNVERIFIED … Test the spring-forward/fall-back cases" | **Fall-back confirmed:** `previewSchedule('0 7 * 10,11 1', { tz: 'Europe/Berlin', from: 2026-10-02T12:00Z, count: 5 })` gave 05:00Z for 5, 12 and 19 Oct, then 06:00Z for 26 Oct and 2 Nov. That is 07:00 Berlin time on both sides of the 25 Oct change. **Spring-forward confirmed too** (probed 2026-10-04): `0 7 * 3,4 1` from 10 Mar 2026 gave 06:00Z on 16 and 23 Mar, then 05:00Z from 30 Mar, 07:00 Berlin time across the 29 Mar change. A time the change skips runs an hour later that day: `30 2 * * *` gave 01:30Z on 29 Mar, which is 03:30 CEST. A time the autumn change repeats runs once, at the first: `30 2 * * *` gave 00:30Z (02:30 CEST) on 25 Oct, then 01:30Z (02:30 CET) from 26 Oct. | probe, below |

## Additions wechart uses

- **`previewSchedule(cron, { tz?, from?, count? })`** is pure arithmetic: "The count ceiling is not a database limit, since the walk is pure cron-parser arithmetic" (`dist/timekeeper.js` L29–31). It works on an instance that never started or connected. Occurrences are "strictly after" `from` (`types.d.ts`, `PreviewScheduleOptions.from`). The default count is 5 and the maximum is 1000 (`previewScheduleMaxCount`). An expression it can't read throws, for example `Constraint error, got value 25 expected range 0-23`.
- **`schedule()` and `previewSchedule()` reject the same expressions.** Both validate through one function, `assertRecurrence` (`dist/timekeeper.js` L140–150).
- **A zone is judged by cron-parser, not `Intl`.** `assertTimezone` parses `* * * * *` in the zone with a reference date, "so what schedule() accepts is exactly what the cron pass can evaluate", and refuses anything else as "Unknown or unsupported time zone" (`dist/timezone.js`). So wechart checks a zone by previewing its cron in it, as `schedule()` will.
- **`ScheduleOptions.missed`**: "`skip` sends nothing for them. `once` sends a single job for the most recent one, however many were missed" (`types.d.ts` L661–672). That is Q8's choice.
- **One occurrence, one job, across replicas.** Each occurrence is filed under a singleton key built from the schedule's name and key, "which is what keeps two instances sending the same occurrence from creating two jobs" (`dist/timekeeper.js`, comment at L50–59). Occurrences stay due for 60 s (`OCCURRENCE_WINDOW_SECONDS`).
- **The due window: a schedule laid sends an occurrence of the last 60 s, however recently it was laid** (added 2026-10-07, T556).
  - A pass reads a cron's due occurrences as its most recent one at or before now, kept if it is within the last 60 s: `interval.prev()`, `previous.getTime() > window.getTime() ? [previous] : []` (`dist/timekeeper.js`, `readOccurrences`, L543–551).
  - Only the catch-up of a missed occurrence, older than the window, is bounded by the row's `created_on`: `from = Math.max(lastPass, createdOn)` (`missedOccurrence`, L500–509). The due window isn't.
  - So a schedule laid, or laid again by `schedule()`, up to 60 s after one of its times sends that time at the next pass. That covers a new schedule, a changed one, and one resumed or unpaused. T556's e2e saw it: a `* * * * *` schedule resumed 26 s into a minute ran at once, for the minute that fell while it was paused. T556's unit tests reproduce it on the `TestClock`.
  - wechart runs no occurrence earlier than when the schedule was last laid with its present times (`runs_from`; T556): made, resumed, unpaused, or changed in its cron or zone. A change that keeps both, such as a rename, keeps `runs_from`, so a time just due still runs (T556's review).
  - **The job names no occurrence.** The pass files each occurrence in the internal send-it queue, and its worker sends the schedule's own request and nothing else: `const { key, slot, ...request } = data; return await this.manager.send(request)` (`onSendIt`, L565–572). That worker polls every `cronWorkerIntervalSeconds` (L207–212), 5 by default, and passes run every `cronMonitorIntervalSeconds`, 30 by default (`dist/attorney.js` L649–652). So wechart reads a run's occurrence from its own clock, as the cron's latest time at or before the moment it handles the run. For a cron whose times are about a minute apart or less, a run handled after the next time is read as that next one. T556's guard then misses a time from before the resume if it was sent by a pass in the few seconds before the next time: that run starts, and the next time's run starts too (T556's review, its finding 2; open).
- **A test clock:** `TestClock` is exported (`dist/clock.d.ts`), with `setTime()` and `tick(ms)`. It is passed as the constructor's `clock` option (`types.d.ts` L390–394). Attached to a schema, "every pg-boss statement there reads the same time through ${schema}.job_now()", so Postgres agrees with the test about "now".
- **`schedule()` again under the same name and key replaces it.** Its insert is `ON CONFLICT (name, key) DO UPDATE` (`dist/plans.js`, `schedule()`, L1214–1230). So a changed wechart schedule is laid again by the same call, with no unschedule first (T378's route test shows the new cron in `getSchedules`).
- **Replicas starting at once.** `start()` creates or migrates the schema under an advisory lock (`plans.locked`), and a replica that loses the race is let through: `create()` passes an "already exists" error and `migrate()` the race's "division by zero" (`dist/contractor.js` L247–263; `dist/plans.js` L9–10). `scheduler.md`'s "prefer `migrate: false` … plus an explicit CLI migration step" is advice for rolling a breaking schema bump, not a need: wechart starts pg-boss with migrations on.

## Probe (2026-10-02, Node 26, in `packages/api`)

```js
import { PgBoss } from 'pg-boss';
const boss = new PgBoss({ connectionString: 'postgres://nobody@127.0.0.1:1/none' }); // never started
boss.previewSchedule('0 7 * 10,11 1', { tz: 'Europe/Berlin', from: new Date('2026-10-02T12:00:00Z'), count: 5 });
// → 2026-10-05T05:00Z, 10-12T05:00Z, 10-19T05:00Z, 10-26T06:00Z, 11-02T06:00Z
boss.previewSchedule('0 25 * * *', {}); // throws "Constraint error, got value 25 expected range 0-23"
boss.previewSchedule('0 0 7 * * 1', { count: 2 }); // → 2026-10-05T07:00Z, 10-12T07:00Z (six fields accepted)
// 2026-10-04:
boss.previewSchedule('0 7 * 3,4 1', { tz: 'Europe/Berlin', from: new Date('2026-03-10T12:00:00Z'), count: 5 });
// → 03-16T06:00Z, 03-23T06:00Z, 03-30T05:00Z, 04-06T05:00Z, 04-13T05:00Z
boss.previewSchedule('30 2 * * *', { tz: 'Europe/Berlin', from: new Date('2026-03-27T12:00:00Z'), count: 4 });
// → 03-28T01:30Z, 03-29T01:30Z (03:30 CEST: 02:30 is skipped), 03-30T00:30Z, 03-31T00:30Z
boss.previewSchedule('30 2 * * *', { tz: 'Europe/Berlin', from: new Date('2026-10-23T12:00:00Z'), count: 4 });
// → 10-24T00:30Z, 10-25T00:30Z (the first 02:30 only), 10-26T01:30Z, 10-27T01:30Z
boss.previewSchedule('0 5 * * *', { tz: 'europe/london', from: new Date('2026-10-23T12:00:00Z'), count: 2 });
// → 10-24T04:00Z, 10-25T05:00Z: a zone's name in any case is taken
```
