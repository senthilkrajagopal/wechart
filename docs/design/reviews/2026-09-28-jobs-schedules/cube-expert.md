# Jobs and Schedules in wechart: are requirements, designs, code and Cube/xcube in sync?

Independent review by a Cube and BI-operations expert (a subagent given the sources and none of Claude's conclusions), 2026-09-28. Read-only: no file was changed. Asked for by the user: "can we have independent ui-expert as well as bi tools/cube expert analyze the jobs and schedules.. and see if the ui designs and the requirements are in sync".

**Path legend.**
- `W/` means `/Users/srajagopal/Work/wechart`, read from the working tree on 2026-09-28.
- `C/` means `/Users/srajagopal/Work/bi/cube`, read at commit `919cff8c6e` with `git show 919cff8c6e:<path>`. The branch head has since moved one commit, to `465865f3fd`.
- Cube's own packages are unmodified v1.7.45.

**Headline.** Requirements, spec, designs and code mostly agree on who owns a schedule. A Cube-owned schedule is a rollup's `refresh_key`, and wechart's own schedules are deferred and run through pg-boss and the jobs API. They do not agree on three things:
- where build history and the queue come from;
- whether scheduling is a direct action or a proposal;
- which Jobs and Schedules calls are allowed and how they are authenticated.

Two phase-2 criteria can't be met as written today: AC-150's refresh-worker half and AC-151. Each needs an xcube route that doesn't exist and was never asked of xcube.

---

## 1. Capability check

"Yes" means Cube Core 1.7.45 plus xcube `919cff8c6e` supplies it now.

| Item (requirement, AC or design element) | Supplied? | Through | Needs outside Cube | Sources |
|---|---|---|---|---|
| Start a build, show its token, poll it (AC-149, `W/docs/spec.md` L610) | **Yes** | `POST /v1/pre-aggregations/jobs`. `action` is only `post` or `get`. xcube checks the service token's model and fans a post out per module. | — (built, T155) | `C/packages/cubejs-api-gateway/src/query.js` L233-259; `C/xcube/src/gateway.ts` L180-236; `W/packages/api/src/cube/client.ts` L195-222 |
| Rebuild selected partitions (AC-145, 2nd half, L544) | **Yes** | `selector.dateRange = [start,start]`. `start` is the partition's local wall-clock start. One zone per post. | — | `W/docs/research/cube/system-partitions.md` "Jobs-API rebuild" (L286-313) |
| List a rollup's partitions with their periods (AC-145) | **Yes** | xcube `POST …/models/{model}/pre-aggregations/partitions` (service credential). It answers what Cube's system route answers. Periods come from `build_range_start/end`, else min/max of the time dimension. | — | `C/xcube/src/admin/routes.ts` L471-478; `C/xcube/src/gateway.ts` L420-458; `system-partitions.md` "Derivation" L240-270 |
| Partition state "built" / "not built", and the last build time | **Yes** | `versionEntries` non-empty means built. `versionEntries[0].last_updated_at` is when Cube created that version entry (enqueue time, to the second), not when the build ended. | — | `system-partitions.md` L209, L219 |
| Partition state "building" / "failed" | **Partly** | For builds wechart starts: the jobs API's `processing` or `failure: …`. The partitions route never reads Cube's build-status record. | For refresh-worker builds: **an xcube change** | `system-partitions.md` finding 4 (L55) |
| Partitions "in the time zones wechart builds in" | **Yes, in UTC only** | Nothing sets `scheduledRefreshTimeZones` or `CUBEJS_SCHEDULED_REFRESH_TIMEZONES`, so the worker builds UTC. wechart posts `timezones:['UTC']`. All zones share one table name per period. | — | `C/packages/cubejs-server-core/src/core/server.ts` L838-841; `RefreshScheduler.ts` L271-272; `W/packages/api/src/cube/client.ts` L208; `system-partitions.md` points 8, 12 |
| Build history for builds wechart starts (AC-150, L612) | **No, but Cube supplies the inputs** | Cube keeps `PRE_AGG_JOB_<token>` for 86,400 s. `get` returns token, table, status and selector, with no timing. | **wechart's history store** (T372) | `C/…/RefreshScheduler.ts` L832-837; `C/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx` L688; `W/docs/research/cube/job-records.md` finding 1 |
| Build history for builds the refresh worker starts (AC-150; design 10's Recent builds, Trigger, Duration) | **No** | Only Cube's `logger` events (`Performing query completed`, `Error while querying`, `scheduler-…` request ids). Cube never calls wechart (AC-327). | **An xcube record plus route.** None exists: the admin routes at `C/xcube/src/admin/routes.ts` L346-661 list none. It was never asked: no file in `~/Work/xcube-exchange/to-xcube/` mentions it. | `W/docs/research/cube/logger-build-events.md` Summary; `W/docs/requirements.md` L524 |
| Build queue with states and tokens, and cancel (AC-151, L614) | **Not reachable** | Cube has `getPreAggregationQueueStates` and `cancelPreAggregationQueriesFromQueue`, but only behind `/cubejs-system/*`. xcube switches those routes off. | **An xcube admin route.** Never asked. | `C/…/api-gateway/src/gateway.ts` L620-690, L1357-1390; `C/…/QueryOrchestrator.ts` L432-438; `C/xcube/src/server.ts` L169-174 |
| Set a schedule as a cron with a time zone (AC-153, L619) | **Yes** | The model's `refresh_key: {every, timezone}`. Cube accepts only crons matching `[S] M H * * D`, and checks that only at SQL generation. | — (built T258/T159; unticked, T377) | `W/docs/research/cube/refresh-key-schedule.md` findings 1-2 |
| "Next runs" for a cron key | **Yes, by formula** | `floor((O+t−D)/I)`. O is a UTC-offset snapshot taken when Cube generates the SQL, so runs are periodic in UTC. How long the snapshot lasts across DST is UNVERIFIED. | — | `refresh-key-schedule.md` "Turn-over formula", "Across a DST change" |
| "A run can start up to about five minutes late" | **Differently** | For hourly-or-longer keys the worst case is about 330 s (300 s renewal plus the 30 s tick), plus queue and build time. | — | `refresh-key-schedule.md` "Worst-case start" |
| Every schedule listed, owner-labelled and read-only (AC-154, L621) | **Yes for Cube-owned** | `/v1/meta?extended` shows `refreshKey` as written. It drops a key's `sql`, so that is read from the YAML. | wechart-owned rows need **wechart's scheduler** | `refresh-key-schedule.md` "What /v1/meta?extended shows" |
| Jobs' and Schedules' field list | **Yes** | xcube's admin `GET …/meta?extended=true&revision=<n>`, unfiltered, with the service credential. It is in the committed pin `e53cf2a8b8` too. | — | `C/xcube/src/admin/routes.ts` L480-497; `W/docs/requirements.md` L580 |
| Suspend after N failures (AC-155, L623) | **No** | Cube never suspends. It retries a failing table with exponential backoff capped by `CUBEJS_PRE_AGGREGATIONS_BACKOFF_MAX_TIME` (600 s). | wechart's scheduler and history, for wechart-owned schedules. For Cube-owned: a model change to `scheduled_refresh: false`, plus a failure feed from xcube. | `C/…/RefreshScheduler.ts` L643-680; `C/…/backend-shared/src/env.ts` L828-830; `C/docs-mintlify/reference/configuration/environment-variables.mdx` L1510-1519 |
| wechart cron schedule for a build (AC-234, L625) | **No scheduler in Core** | Each run posts to the jobs API, which force-builds. | **wechart's scheduler** (pg-boss, T378) | `W/docs/research/cube-capabilities.md` §4; `W/docs/research/scheduler.md` |
| "Cache warm-up" (AC-234; `W/docs/requirements.md` L190) | **No** | Core has no warm-up. The refresh worker doesn't fill the result cache. The service token has only the `jobs` and `introspection` scopes, so it can't read data. | Undefined (see M3) | `W/docs/research/cube/refresh-jobs-caching.md` gotcha 10 and the table at L382; `C/xcube/src/gateway.ts` L75 |
| Refresh worker's state (AC-156, L628) | **Partly** | The worker's `/readyz` checks the `default` connection and Cube Store. `/livez` checks the data sources it has seen. Neither says whether refresh runs succeed. | Run state per model and module: **an xcube change** | `C/…/api-gateway/src/gateway.ts` L3044-3077; `C/…/RefreshScheduler.ts` L281-307 |
| Cube deployment health (AC-156) | **Yes** | `/readyz` and `/livez` through the Cube Service (2 replicas). | — | `W/packages/api/src/cube/health.ts`; `W/deploy/helm/wechart/values.yaml` L79-81 |
| Scope Jobs and Schedules to the user's read-write folders (AC-297, L1121) | **wechart-side** | xcube only checks that a service token builds its own model's rollups. The folder comes from `meta.xcube.folderId`. | wechart enforces it (T371) | `C/xcube/src/gateway.ts` L199-215 |
| Design 10 Jobs: Built · N ago, Not built yet, Last success | **Yes** | The partitions route (see above). | — | as above |
| Design 10 Jobs: Running, Failed | Partly | Jobs API for wechart's builds. | xcube for worker builds | as above |
| Design 10 Jobs: Duration vs average; Trigger ("Schedule" or a user's name) | **No** | Cube reports no timing. | wechart's history, plus xcube for worker builds | `job-records.md` finding 1 |
| Design 10 state A Schedules: Folder, Schedule, Next run, Owner | **Yes** | Metadata, YAML and the turn-over formula. | — | as above |
| Query-queue concurrency display (`W/docs/requirements.md` L189, "In") | Config only | `CUBEJS_CONCURRENCY`, `queueOptions`, `CUBEJS_SCHEDULED_REFRESH_QUERIES_PER_APP_ID`. No runtime API. **No AC covers it.** | — | `refresh-jobs-caching.md` capability table |
| Pre-aggregation data preview (`W/docs/requirements.md` L183, "In") | **Not reachable** | Only `/cubejs-system/…/preview`, which skips query-time row filters. Not served under xcube. **No AC covers it.** | An xcube route and a security decision | `system-partitions.md` "Security" |

---

## 2. Mismatches: requirements or designs that promise what Cube can't do, or can do only differently

1. **Build history for builds the refresh worker starts.**
   - `W/docs/requirements.md` L524 says "xcube records the refresh worker's builds, and wechart pulls them" (R27).
   - xcube has no such record or route at `919cff8c6e`.
   - The backlog admits it: `W/docs/phase-2/backlog.md` L266 says "xcube's contract doesn't have" it.
   - T373 says the route "is proposed on the plan's contract" (`W/docs/tasks.md` L6432-6438). No ask exists in `xcube-exchange/to-xcube/`.
2. **The build queue and cancel (AC-151).**
   - Cube's queue functions exist but can't be reached under xcube (sources in §1).
   - Cancelling a build the refresh worker queued probably doesn't stick. The worker re-reads each partition's refresh key every 30 s tick and queues the build again (by reading `RefreshScheduler.ts` L636-680; UNVERIFIED).
   - AC-151's Fails-when ("cancelling leaves it queued") would then be met, while the build still happens moments later.
3. **Partitions per time zone.**
   - Fine today, because everything is UTC.
   - If more build zones are added, one period has the same table name in every zone. Per-zone states then can't be told apart, and a multi-zone request overwrites versions (`system-partitions.md` points 8 and 12).
4. **"Next runs" for a cron key.**
   - The formula matches Cube only while Cube's offset snapshot matches the zone's current offset.
   - Across a DST change, AC-153's Fails-when ("a shown run differs from when Cube's refresh key turns over") can't be judged from outside Cube.
   - T264 already lists this as a question for the user (`W/docs/tasks.md` L2999 onward).
   - The spec's "about five minutes" is short of the researched ≈5½ minutes plus build time.
5. **Cube-owned vs wechart-owned schedules.**
   - A wechart schedule adds builds; it doesn't replace the refresh key.
   - Cube still rebuilds at every turn-over unless the rollup has `scheduled_refresh: false` (`refresh-key-schedule.md` Gotcha 5).
   - AC-234 and AC-154 don't say what happens when a rollup has both.
   - AC-154 labels one owner per pre-aggregation.
6. **Suspend after N failures (AC-155).**
   - The prototype draws "Suspended after 4 failures" with Resume on a rollup whose trigger is a refresh key (`W/docs/design/prototype/admin-ops.js` L65-75).
   - Cube can't do that. It backs off to 10 minutes and keeps retrying.
   - The prototype's "Suspend after" control appears only on wechart "build" schedules (L290). The AC's text doesn't make that distinction.
   - Nothing decides "the configured number" (`W/docs/research/scheduler.md` L120 lists it as the user's decision).
7. **"Refresh worker running" (AC-156; design 10 header).** It reflects the worker process and its connections being up. A model whose refresh runs abort every tick ("Refresh Scheduler Error", `RefreshScheduler.ts` L300-307) still shows "running".
8. **"Last build" and "Last success" are held back as waiting on AC-150.**
   - `W/docs/design/reviews/status.md` rows 10 and 07 hold these back.
   - Cube already supplies them, for every builder, through the partitions route (enqueue-time caveat).
   - This is a mismatch in the other direction: work is blocked that needn't be.
9. **The "Trigger" column means two different things.**
   - AC-229 (L875, ticked) and the built code use "Trigger" for the refresh key in words (`W/packages/api/src/jobs/build.ts` L70-93).
   - Design 10 uses "Trigger" for who started the last build: "Schedule" or "Wren Writer" (`…/10-folder-scoped-ops-and-bookmarks.html` L174-179).

---

## 3. Cube capabilities the designs and requirements leave out (candidates for the user)

1. **Refresh run failures per model and module.**
   - A `Refresh Scheduler Error` stops scheduled refresh for that whole context (`refresh-key-schedule.md` Gotcha 1). Under xcube a context is one module.
   - AC-235 prevents new cases at publish, but not failures at run time: a broken connection, or a build-range query that fails.
   - Needs xcube to record the events. **Worth proposing:** it is the main thing an operator needs.
2. **Rollups rebuilding after a data source changes target (xcube epochs).**
   - A changed target gets a new epoch and a new orchestrator `<base>_<model>_<epoch>` (`C/xcube/src/config.ts` L175-196).
   - Every rollup on it is aliased and rebuilt.
   - Rollup-served tiles answer "No pre-aggregation partitions were built yet…" until then.
   - The old epoch's tables are dropped after the new epoch's first full refresh cycle (`W/docs/research/xcube-2d5ac86f24.md` finding 8; `xcube-919cff8c6e.md` Gotcha 1).
   - Jobs could say "rebuilding after <data source> changed", using xcube's connection health (cube-state) and the partitions route. **Worth proposing.**
3. **Sealed and incremental partitions.**
   - The partition details (`updateWindowSeconds`, `sealAt`) explain why old partitions aren't refreshed. Don't forward the SQL fields (`system-partitions.md` L402 and "Security").
   - **Worth proposing** alongside AC-145.
4. **Each rollup's effective build range**, from the first and last partitions. It explains when a new period's partition appears (the range is cached up to 24 h). **Worth proposing.**
5. **Backoff state** ("failed, retrying in N min"). Cube keeps it under `SQL_PRE_AGGREGATIONS_BACKOFF` and exposes no route for it. Needs xcube. **Optional.**
6. **Build time zones versus a query's time zone.**
   - Cube's docs: "The time zone in the query must match the time zone of a pre-aggregation" (`C/docs-mintlify/docs/pre-aggregations/matching-pre-aggregations.mdx` L85).
   - wechart's queries set no time zone today. **Propose only if** dashboards gain time zones.
7. **Cube-level refresh keys**, which decide when non-rollup results go stale. Schedules lists only pre-aggregations. **Low value.**
8. **Auditing builds, cancels and schedule changes.** AC-294's list leaves them out. **A decision for the user.**
9. **A build interrupted by a Cube instance stopping.**
   - It reads `processing` for about 20 minutes, then `failure: the build has not completed` (`W/docs/research/cube/ha-topology.md` L175).
   - Worth wording in Jobs, since the query path runs 2 instances.

---

## 4. Do requirements, spec, designs and code agree on who owns what?

**They agree on:**
- A Cube-owned schedule is the model's `refresh_key`, run by the refresh worker.
  - Requirements L187-190; spec F17 note and AC-153/154; design 07 note 2; `W/docs/design/direction.md` rule 34.
  - The code: `owner: 'cube'` only, in `W/packages/api/src/jobs/schedules.ts` L29-30 and `W/packages/web/src/workspaces/schedules/SchedulesPage.tsx` L51-56.
- wechart's scheduler (pg-boss) and its history store are in phase-2 scope.
  - R16 brought them back; the spec F17 phase-2 note says so.
  - This overrides the phase-1 memory rule "Cube first, defer the rest" for F17.
  - Stale deferral text remains in `W/docs/phase-2/backlog.md` §1 F17 (L49-66).

**They disagree on:**
- **Scheduling: direct action or proposal?**
  - Design 10 pin 6 says "Building and scheduling are direct for the folder's read-write members" (html L216). AC-297 says "let them build and schedule those".
  - AC-153 writes a Cube-owned schedule into the model, "published as any model change".
  - In phase 2, a model change reaches a shared folder only through a workspace and an approved proposal (`W/docs/requirements.md` L676, L683-685).
  - Direct changes are limited to subfolders, permissions, rename, move and delete (L691).
- **Who records the refresh worker's builds.** See §2.1. Five places say different things:

  | Place | What it says |
  |---|---|
  | Requirements L524 | xcube records them |
  | AC-150 | requires them within one check period |
  | Design 10 | draws them |
  | Status/backlog | holds them back |
  | xcube | has nothing, and was never asked |

- **Where Jobs and Schedules read metadata from.**
  - Requirements L580 and the slice-4 contract say xcube's admin `…/meta` with the service credential.
  - The code reads `/v1/meta?extended` with wechart's configured context, signed HS256 (`W/packages/api/src/cube/client.ts` L226-237).
  - The code's reason, "the move waits for its image", is stale: that route with `?revision=` is in `e53cf2a8b8` and `919cff8c6e` (commit `40efaef823`).
  - By reading, this path breaks once keys are pushed, since a model takes HS256 only until its first key push (requirements L578).
  - With security on, the folder gate filters it for a context holding no groups. UNVERIFIED at runtime.
- **Who may use Jobs.**
  - Requirements L424-425 and AC-297 limit Jobs and Schedules to Super-Admins and each folder's read-write members.
  - The built routes use `USER` (`build.ts` L136, L140, L151; `schedules.ts` L170).
  - So any signed-in user can list every folder's rollups and start builds through the service credential.
- **Folder rollups.** Jobs can't build a folder's rollups today: "a folder's module isn't in its build context until T371" (`W/e2e/security/changed-in-place.spec.ts` L18-19).
- **xcube epochs and modules.** No document or design accounts for them in Jobs.
  - The queue, backoff and touch records live under the per-epoch orchestrator id.
  - Job records are keyed without a prefix (`C/packages/cubejs-cubestore-driver/src/CubeStoreCacheDriver.ts` L66-80), so they outlive an epoch.
  - By reading (UNVERIFIED), a build wechart starts just before a change of target can report `done` for an old-alias table that is never served.
  - History keyed by `cube.preAggregation` survives, because aliases change table names, not cube names.
  - A jobs post returns one token per module (`W/docs/research/xcube-slice-3b.md` L236-247). The code already handles token lists.

---

## 5. Findings by severity

### Blocking

- **B1. AC-150's refresh-worker half has no source.**
  - Also blocked: AC-145's "building/failed" for worker builds, and design 10's Recent builds, Trigger and Duration for worker builds.
  - xcube has no build-event record or route, and nobody asked for one (§2.1).
  - *Question for the user:* is an xcube build-event feed a "simple change" (R35: do it) or a "redesign" (backlog)? Options:
    - (a) Ask xcube, through the Cube-expert agent, for a model-scoped admin route. It would list build outcomes from Cube's logger events: pre-aggregation, table or partition, requestId (`scheduler-…` or a job's), start, end, duration, outcome with error, module and epoch.
    - (b) Narrow AC-150 to builds wechart starts, plus Cube's own last-built time from the partitions route.
    - (c) Defer the worker half past phase 2.
- **B2. AC-151 (queue and cancel) can't be reached under xcube, and was never asked of xcube.**
  - Cancelling a worker-queued build likely doesn't stop it (§2.2, UNVERIFIED).
  - *Question:* choose one:
    - (a) ask xcube for queue and cancel routes per model data source, in the current epoch;
    - (b) limit cancel to builds wechart started, and show the worker's queue read-only;
    - (c) defer AC-151.

### High

- **H1. Built Jobs and Schedules routes are open to every signed-in user** (§4).
  - This conflicts with AC-297 and the role table.
  - *Recommendation:* until T371 lands, gate `/api/preaggregations`, `/api/builds*` and `/api/schedules` to Super-Admins, as requirements L424-425 already require.
- **H2. Scheduling: direct or by proposal?** (§4)
  - *Question:*
    - (a) Cube-owned schedule edits go through workspace and proposal like any model change. Correct design 10 pin 6, and read AC-297's "schedule" as proposing.
    - (b) Add `refresh_key` edits to the direct changes, which needs a changeset publish outside proposals.
    - (c) AC-297's "schedule" means wechart-owned schedules (AC-234) only.
- **H3. AC-155 doesn't say whose schedule it suspends** (§2.6).
  - *Question:*
    - (a) wechart-owned schedules only, as the prototype's "On failure" section has it;
    - (b) also Cube-owned, by publishing `scheduled_refresh: false`, which needs B1's failure feed and H2's route;
    - (c) drop it.
  - Also needed: what "the configured number" is, and who configures it.
- **H4. Move Jobs' and Schedules' metadata to xcube's admin `…/meta?extended=true&revision=<n>` with the service credential.**
  - The route exists at the pin (§4).
  - The current path is at odds with requirements L580, and by reading breaks after the key push (T437).
  - The plan is already stated in `to-xcube/2026-09-27-2210-proposals-history-security.md` L41.

### Medium

- **M1. Unblock what the partitions route already gives.**
  - That covers design 07's Last build and design 10's Built / Not built yet / Last success.
  - *Recommendation:* split T375's listing half off from T372 (T375 depends on T372 at `W/docs/tasks.md` L6443-6446).
  - Label the time as "last built" (version created), not build end.
  - Retry when a module drops out with "Continue wait" (`W/docs/research/xcube-slice-6.md` Gotcha 11).
- **M2. The refresh worker indicator overstates** (§2.7).
  - *Question:* relabel it "Refresh worker up", or ask xcube for the last run and error per model and module (see §3.1)?
- **M3. "Cache warm-up" is undefined** (AC-234; requirements L190).
  - *Question:* does it mean:
    - (a) a scheduled pre-aggregation build only;
    - (b) running chosen dashboards' queries for chosen groups (the service token can't read data, and results are cached per SQL, so per group set);
    - (c) nothing? Remove the term.
- **M4. Double builds under AC-234** (§2.5).
  - *Question:* when a wechart schedule is created, should wechart require or offer `scheduled_refresh: false` (a model change, see H2), or let both run?
  - How does AC-154 label a rollup with both kinds of schedule?
- **M5. Design coverage.**
  - No approved design draws Run history, Queue, the partition list with Rebuild selected, the suspended state with Resume, or the wechart schedule form.
  - Design 10 draws only Recent builds in the pane. `status.md` reads design 10 as dropping parts of design 07.
  - *Question:* do the prototype's drawings (`admin-ops.js` L108-136, L256-296) stand for those surfaces, or should a design be drawn?
- **M6. xcube epochs.** No state in Jobs for rollups rebuilding after a change of target (§3.2, §4).
  - *Recommendation:* T372 records the epoch, or the cube-state, at post, and marks builds that span a change.
  - Add a check of this to `changed-in-place.spec.ts`.
- **M7. Folder rollups can't be built from Jobs** (§4). T371 and T340 are open; keep them ahead of the build-history tasks.
- **M8. The two meanings of "Trigger"** (§2.9).
  - *Question:* keep "Trigger" as the refresh key (AC-229) and add "Started by", or change AC-229 to follow design 10?
- **M9. DST and "next runs"** (§2.4).
  - *Question* (already raised in T264): show runs at today's offset with a DST caveat, or stop the list at the DST change?

### Low

- **L1.** AC-153 says "about five minutes". The research says ≈5½ minutes plus the build (T264 lists this).
- **L2.** Per-zone partitions are fine while everything is UTC. Revisit AC-145 if build zones are added (§2.3).
- **L3.** Two "In" requirements have no AC: the query-queue concurrency display and pre-aggregation preview.
  - *Question:* add ACs, or move them to the non-goals? "Configuration … screens" is already a non-goal, and preview skips row filters.
- **L4.** Design 10 state A writes "Daily at 06:00, Berlin" but shows `every: 0 6 * * *` without its `timezone` (html L233).
- **L5.** Stale text:
  - backlog §1 F17's "deferred";
  - direction.md rule 34's "deliveries", which are a non-goal;
  - `client.ts` L231-233's "waits for its image".
- **L6.** The deployment health check reaches one pod through the Service. AC-156 passes as worded, but the check shows no per-instance health.
- **L7.** Word the UI for builds interrupted when a Cube instance stops (§3.9).
- **L8.** Builds and schedule changes aren't audited (§3.8). This is a decision for the user.

**UNVERIFIED items in this report:**
- a cancelled build the refresh worker queued being queued again;
- `done` reported for an old-epoch table when a data source changes target;
- the metadata path failing after the key push, or being filtered by the folder gate;
- Cube's DST snapshot lifetime.

All are by reading code, not by running it.
