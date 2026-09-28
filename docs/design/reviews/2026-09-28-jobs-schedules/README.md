# Jobs and Schedules: an independent sync check (2026-09-28)

The user asked for an independent UI expert and an independent BI tools and Cube expert to check whether Jobs' and Schedules' designs and requirements are in sync. Each was given the sources and none of Claude's conclusions. Their reports are here, verbatim:
- [`ui-expert.md`](./ui-expert.md): requirements, spec, designs 10 and 07, and the built pages; UX against Superset, Metabase, Tableau and Looker.
- [`cube-expert.md`](./cube-expert.md): what Cube Core 1.7.45 and xcube `919cff8c6e` can supply for each requirement and design element, with sources.

## Where both agree

1. **Every Jobs and Schedules API route is open to any signed-in user.** That includes a reader and a user with no access (both reports: UI B1, Cube H1). Any of them can list every folder's rollups and start builds under the service credential. The query log shows every user's queries. This breaks AC-297 and AC-268 (S1, zero leaks). T371 would fix it, and hasn't started.
2. **"Scheduling needs no proposal" (design 10, pin 6) conflicts with the proposal rule.** A Cube-owned schedule is a `refresh_key` in the model, and a model change reaches a shared folder only through a proposal (§P2.6 E, AC-153, AC-278). This needs the user's decision (UI H1, Cube H2).
3. **Several phase-2 criteria have no design:** partitions (AC-145), Run history and a build's log (AC-150), the queue (AC-151), suspend and Resume (AC-155), and wechart's own schedules (AC-234) (UI H2, Cube M5).
4. **Design 10's "Trigger" means who started a build.** AC-229, as built and ticked, means the refresh key (UI M1, Cube M8).
5. **Folder rollups are shown by prefixed names, with no model link, and can't be built from Jobs yet** (UI H4, Cube M7).

## What only the Cube expert found

- **Two criteria can't be met as written.** Each needs an xcube route that doesn't exist and was never asked for (Cube B1, B2):
  - AC-150's refresh-worker half, the history of builds Cube starts on its own;
  - AC-151, the queue and cancel.
- **Work is held back that needn't be.** xcube's partitions route already gives every rollup's last-built time and built state (Cube M1). That covers design 07's Last build and design 10's Built / Not built yet / Last success.
- **Jobs reads its metadata the phase-1 way.** It uses `/v1/meta` with wechart's HS256 context, where the plan says xcube's admin `…/meta` with the service credential. By reading, the old path breaks once keys are pushed (Cube H4).
- **"Cache warm-up" (AC-234) has no definition** (Cube M3). Nothing says what AC-155's "configured number" of failures is, or whether it applies to Cube's schedules or only wechart's (Cube H3).

## What only the UI expert found

- **Design 10's state A would drop design 07's page note (AC-233) and its icons (AC-152).** Whether state A replaces design 07 or adds a Folder column to it needs deciding (UI M3).
- **Neither page draws its loading, error, empty, refused or revoked states,** or a deep link out of scope (UI M5).
- **Readers get "Open in Jobs" from Data as of,** though they have no Jobs (UI H5).

## Decisions for the user

The first four were asked on 2026-09-28. The rest wait in `docs/phase-2/backlog.md` §6 until they're reached.
