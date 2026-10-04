---
library: xcube's build queue cancel with `processing: true` (the user's Cube fork) — observed against compose's xcube
packages: []
# Nothing is imported: wechart's server calls xcube's admin routes over HTTP.
version: 'xcube image ghcr.io/senthilkrajagopal/xcube:v1.7.45-2099b13f2d@sha256:1e483afc30f1da9bcc58a0cc37e5ba96824c2f9fda709b2b2d699dcc768b2e12'
researched: 2026-10-04
---

# A processing build "stopped" through the queue's cancel still finishes (T554, AC-394)

**A correction to** `xcube-jobs-schedules-routes.md` §1. That section says a processing entry cancelled with `"processing": true` is stopped "at the queue's next heartbeat (8 s)". On compose's xcube (the image above), the build ran on to its end and made a version.

**Source:** wechart's own probe, 2026-10-04 at 21:02Z, through wechart's e2e API (model `e2e`, the service credential). The request to xcube is `~/Work/xcube-exchange/to-xcube/2026-10-04-2105-stop-processing-build.md`.

## What was observed

- **The cube:** a rollup that isn't partitioned, `scheduled_refresh: false`, whose SQL is `SELECT o.* FROM public.orders o, pg_sleep(40)`. Its one build takes about 40 s.
- **Building at once.** Right after the jobs post, xcube's queue listed the entry `processing`.
- **Cancelled.** `POST …/queue/cancel` with `{ keys: [its key], processing: true }` answered it under `cancelled`, and the queue route listed it no more.
- **Not stopped.** Cube's jobs API said, for its token:
  - `processing` at 5, 10, 20 and 30 s;
  - `done` at 45, 60 and 75 s, the same table throughout.
- **It made a version.** The partitions route then gave the rollup `built`, `lastBuiltAt` the build's own time, which is the last part of its table's name read as base-32 seconds (as `xcube-jobs-schedules-routes.md` notes for T550).

## What wechart does with it

- **Stop (T554) is held back** until xcube stops such a build, or says in its answer that it couldn't. Offering Stop now would record a build as cancelled while building while it makes a version: AC-394's Fails-when.
- **A queued entry's cancel (T376, AC-151) is not affected.** It is taken out before it runs, and wechart's e2e shows it never builds.
