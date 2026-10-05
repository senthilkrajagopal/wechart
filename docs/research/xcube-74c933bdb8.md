---
library: xcube's queue cancel of a building pre-aggregation build, which now stops it (the user's Cube fork)
packages: []
# Nothing is imported: wechart's server asks xcube's admin routes over HTTP, under its service credential.
version: 'xcube feat/xcube 74c933bdb8; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-74c933bdb8@sha256:262d59e434cd98eb0c1cf238fcbbc7168809e0fd31e103f87d127d9082e3df71 (amd64, arm64)'
researched: 2026-10-05
---

# xcube 74c933bdb8: a building build the queue's cancel takes out is stopped (T554)

This answers [`xcube-queue-stop-observed.md`](./xcube-queue-stop-observed.md) and corrects [`xcube-jobs-schedules-routes.md`](./xcube-jobs-schedules-routes.md) §1, whose "stopped at the queue's next heartbeat" didn't hold on `2099b13f2d` or `46ca0ce708`.

**Sources:**
- xcube's answer, `~/Work/xcube-exchange/to-wechart/2026-10-04-2200-stop-processing-build.md`, to wechart's `~/Work/xcube-exchange/to-xcube/2026-10-04-2105-stop-processing-build.md`;
- the image's `org.opencontainers.image.revision` label, `74c933bdb80f6c3c9aca279ec27c7116cb27bc05`, read from the pulled image;
- compose's running image, probed by T554's e2e (below).

## Why it ran on before

[answer, "Why it ran on"]
- Cube's queue does call a cancelled processing build's cancel, at once on the instance the cancel reaches, else at the building instance's next heartbeat (xcube's 8 s).
- That cancel reaches only driver calls whose promise carries a `cancel`, and Cube's PostgreSQL driver gives none for a build's query. So the query ran on and Cube Store took its table.

## What xcube does now

[answer, "What xcube does now"]

**1. The build is stopped,** and none of it is kept:
- **In the source:** xcube wraps the drivers Cube's orchestrators get, so a build's source calls can be cancelled. On PostgreSQL its query is cancelled with `pg_cancel_backend`, from a connection of xcube's own, matched by the query's text, user and database. Other drivers use their own cancel where the build call has one, and a stream already reading is cut.
- **Nothing kept:** its upload to Cube Store is refused, and a table it made anyway is dropped (in Cube Store, or in the source for a rollup kept there).
- **When:** at once if the cancel reaches the building instance, otherwise within that instance's next heartbeat, 8 s.

**2. Cube's jobs API then reports the job's token as**
`failure: xcube stopped this build: it was cancelled while building, and none of it is kept`.
Match on `xcube stopped this build`. It is neither `missing_partition` nor `not_found`.

**3. The cancel's answer says what came of it,** waiting up to two heartbeats and some (20 s) for a processing entry:

| What came of the build | Answer |
|---|---|
| Stopped, none of it kept | `cancelled: [{ key, preAggregation, status: "processing", build: "stopped" }]` |
| Failed of its own before the stop took (also no version) | `cancelled`, `build: "failed"` |
| Ended before the stop reached it: its version stands | `notCancelled: [{ key, reason: "finished" }]` |
| No outcome within the wait (a stalled build whose instance is gone, say) | `cancelled`, `build: "stopping"`; read the jobs API later |

- A queued entry is answered as before, with no `build`.
- A processing entry's answer comes in under 1 s on the building instance, up to about 9 s otherwise.

**4. No migration:** the latest is still 13.

## What remains

[answer, "What remains"]
- **A driver whose build call has no cancel** (Oracle and Dremio, it seems; xcube checked PostgreSQL alone): the build's query may run on in its database, but no table of it is kept, and it fails as stopped.
- **Redshift:** its query isn't cancelled on the server, since its activity view differs; nothing of it is kept.

## Checked against compose's running image (T554, 2026-10-05)

- compose's `wechart-cube` and `wechart-cube-refresh-worker` were recreated under the e2e lock from the main checkout's `docker-compose.yml` and project directory with only `CUBE_IMAGE` set. Before, each container's `com.docker.compose.config-hash` equalled `docker compose config --hash` for the old pin; after, the new one's (`3edb386a…` for cube, `b265ebbc…` for the worker). Both run `revision` `74c933bdb80f…` and answer `/readyz` HEALTH.
- **T554's e2e** (`e2e/jobs.spec.ts`, "Stop ends a building build …"), model `e2e`, a cube of the run's own whose one build sleeps 40 s in the sample Postgres, `scheduled_refresh: false`:
  - Stop on its building entry answered `build: "stopped"`, and the entry left the queue;
  - Run history read "Cancelled while building · by admin";
  - 60 s after the start, Cube's jobs API read exactly the failure above for its token, never `done`;
  - the rollup read Not built: no version came from it.

## What wechart does with it (T554, AC-394)

- **Stop** sends `processing: true` and waits on the answer, saying "Stopping…" on the button meanwhile.
- **`stopped`:** recorded cancelled while building, by whom, and said "None of it is kept".
- **`failed`:** said as a failure of its own, left for the follower to record with Cube's words, and no stop recorded.
- **`stopping`:** said as still stopping. The person is kept on the build and named only if the jobs API then reads it stopped.
- **`finished`:** said as not stopped, its version standing; nothing recorded.
- **The jobs API's stop failure** reads as cancelled while building, however it was stopped, even where the follower sees it before the cancel's answer comes.
