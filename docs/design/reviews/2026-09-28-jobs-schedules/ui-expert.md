# Jobs and Schedules: do the requirements, designs and build agree?

Independent review by a UI expert (a subagent given the sources and none of Claude's conclusions), 2026-09-28, at `de5da21`. Read-only: no file was changed. Asked for by the user: "can we have independent ui-expert as well as bi tools/cube expert analyze the jobs and schedules.. and see if the ui designs and the requirements are in sync".

Paths below are relative to the repository root.

**Sources read:**
- `docs/requirements.md`: §6 inventory lines 187–191; §P2.2 lines 424–425; §P2.4; §P2.6 D, E and H; rounds R16, R18, R27, R33 and R35–R37.
- `docs/spec.md`: F1, F16, F17 (lines 557–629), F22 (lines 870–884), F31, F33 and F36.
- Design 10 (`docs/design/reviews/2026-09-27/designs/10-folder-scoped-ops-and-bookmarks.html`) and design 07 (`docs/design/reviews/2026-09-24/designs/07-schedules.html`).
- Both designs' `index.md`, both `ui-review.md`, `phase-1-recheck.md`, `status.md`, `direction.md` and `references.md`.
- The screenshots `app-44`, `app-45`, `app-55-reader-jobs`, `proto-6x-jobs`, `proto-6x-schedules` and `r-61c`.
- The code in `packages/web/src/workspaces/{jobs,schedules}`, the shell and routes, and `packages/api/src/jobs/*`, `server.ts` and `auth/guard.ts`.
- `docs/tasks.md` and `docs/phase-2/backlog.md` §6.

---

## Summary

1. **Blocking.** Every Jobs and Schedules API route is open to any signed-in user.
   - That includes read-only users and users with no access at all.
   - Any of them can list every folder's rollups, start a build of any rollup, and read every user's query records.
   - This breaks AC-268 (the S1 "zero leaks" metric) and AC-297.
   - T371, which fixes it, has not started.
2. **High.** Design 10 says "Building and scheduling need no proposal".
   - A Cube-owned schedule is a `refresh_key` in the model, and every model change reaches a shared folder only through a proposal (§P2.6 E, AC-153, AC-278).
   - That needs the user's decision.
3. **High.** Five phase-2 criteria have no design at all:
   - AC-145: partitions;
   - AC-150: the Run history across builds, and a build's log;
   - AC-151: the build queue;
   - AC-155: suspending a failing schedule, and Resume;
   - AC-234: wechart's own schedules.
   - Design 07 still says AC-234 is deferred.
   - Design 10's two tabs, if read as binding under AC-343, leave nowhere to put them.
4. **High.** Four of design 10's seven Jobs columns need build history (AC-150), not only "Recent builds".
   - Today's "Not built here" status only remembers builds started in the current browser session. It says nothing about the rollup's real state.
5. **High.** The built pages show folder rollups by their prefixed names.
   - For example `fsales__orders.main`, which the unit test at `jobs/schedules.test.ts:191-194` asserts.
   - A folder rollup also gets no link to its model.
   - This goes against §P2.6 D and design 10 pin 4.

---

## 1. Traceability matrix

D10 = the 2026-09-27 design 10. D07 = the 2026-09-24 design 07.

| ID | What it asks | Design 10 | Design 07 | Built | Status |
|---|---|---|---|---|---|
| §P2.2 / R18 Q4 | Super-Admins and a folder's read-write members use Jobs and Schedules; read-write members run and schedule builds of their folder's rollups | Main screen, as a read-write member; state A, as a Super-Admin | — | No role check in the UI or API | Not built (T371) |
| AC-001 (`spec.md:80`) | Switcher: Jobs and Schedules for Super-Admins and read-write members; no Model entry | Top bar: Explore · Data sources · Jobs · Schedules | Top bar shows all six, Model and Security included (stale) | `WorkspaceSwitcher.tsx:16-22` lists all six; `AppShell.tsx:32-35` hides only Security; a reader sees Jobs (`app-55-reader-jobs.png`) | Built differently (T331); D07 is superseded |
| AC-265 (`:995`) | Super-Admins reach every admin surface | State A: all folders, no scope note | — | Reachable, but so it is for everyone | Partly |
| AC-297 (`:1121`) | Read-write members see and act on only their folders' rollups, query records, builds and schedules | Pin 1 scope note, pin 2 Folder column, pin 3 Folder filter | — | APIs are `USER` class: `jobs/build.ts:136,140,151`, `jobs/schedules.ts:170`, `server.ts:2546,2556,2594` | Designed; not built |
| AC-268 / S1 (`:1001`) | Access enforced on every route | n/a | n/a | Not enforced on Jobs or Schedules routes | Not built |
| AC-016 (`:119`) | Query records in Jobs | "Queries" tab present, content not drawn | — | `QueryLog.tsx`, `/api/jobs/queries/page` | Built; no design for the scoped view |
| AC-230 (`:877`) | Query log filtered, sorted and paged | Not drawn | — | `QueryLog.tsx` (UX-082 open, T469) | Built; no design |
| AC-149 (`:610`) | Start a build, show its token, poll to a final state | Pin 6 "Build now"; a "Running" row; **no token anywhere** | "Build it now … in Jobs" | `BuildPanel.tsx:150-165, 209-217` shows tokens | Conflict (D10 omits the token) |
| AC-228 (`:872`) | List beside a full-height pane: state, trigger, Build, open in Model | Pin 5: 400 px pane with Folder, Status, Schedule, Model, Build now, Open in Model, Recent builds | — | `BuildPanel.tsx:313-381`: State, Trigger, Type, Partition granularity, Build now, Open in Model, this session's tokens | Built differently (T469) |
| AC-229 (`:875`) | Row: state as icon and label, **the refresh key that triggers it**, name linking to Model, progress in the row | Trigger = who started the last build ("Schedule", "Wren Writer"); a separate Model column | — | Trigger is the refresh key in words; the name is a link that leaves Jobs (UX-080) | Conflict |
| Rule 22 (`direction.md:556`) | Columns: name, status, last success, duration against average, trigger, model link | Matches (line 174) | — | No Last success, Duration or Model column; adds Partition granularity and a per-row Build | Built differently; waits on AC-150 |
| AC-150 (`:612`) | Every build recorded (both starters), shown in **Run history** with a log, 100 kept per rollup | "Recent builds" (3 rows) in the pane only; no Run history, no log | "Last build" column; note 7 points to Jobs › Run history | Nothing kept; builds are forgotten on leaving Jobs (`BuildPanel.tsx:202-204`; T239's note) | Partly designed; conflict (no Run history tab); not built (T372–T374) |
| AC-145 (`:544`) | A rollup's partitions, their states, rebuild the selected ones | Not drawn (the prototype had them in the pane) | — | Partition granularity only | No design; not built (T375) |
| AC-151 (`:614`) | Build queue with cancel | Not drawn | — | None | No design; not built (T376) |
| AC-152 (`:617`) | Every job and schedule state has an icon and a label | Jobs statuses have icons; **state A's "Not scheduled" and Owner have none** (line 234) | Icons throughout | `StateBadge.tsx`, and `SchedulesPage.tsx:84-89` | D10 conflicts in one state; built in sync |
| AC-153 (`:619`) | Cron and time zone in the model editor; next runs; the five-minute note | Not drawn | The next runs and the note are drawn on Schedules (pins 5–6), not in the editor | `model/preagg/RefreshSchedule.tsx` (T159); unticked, T377 open | Neither design covers the editor; design 03 draws only a cube-level Refresh group (`03-model-workspace.html:319`) |
| AC-154 (`:621`) | Every rollup's schedule with its owner, read-only, a link to the rollup in the editor, "not scheduled" | State A: Folder, Schedule (in words and as written), Next run, Owner; **no link drawn** | Full: owner filter, Cube's default, Not scheduled, Edit in Model, detail pane | `SchedulesPage.tsx`: Pre-aggregation, When, Owner, Edit in Model | Built differently: no Next run or as-written; the link opens the cube, not the rollup; folder rollups have no link (T377) |
| AC-155 (`:623`) | Suspend after the configured number of failures, and Resume | — | Excluded | None | No design; not built (T379) |
| AC-234 (`:625`) | wechart-owned cron schedule for builds and cache warm-ups | — | "Stays deferred" (line 96) | Page note: "…from wechart isn't available yet" (`SchedulesPage.tsx:51-57`) | No design; D07 stale; not built (T378) |
| AC-156 (`:628`) | Refresh worker and deployment health | Header badges | — | `Health.tsx` | In sync |
| AC-233 (`:883`) | Schedules shows its title and a note on what it is for | **State A draws no note** | Intro note (line 112) | InfoBar | D10 conflicts if read literally |
| AC-148 / AC-245 (`:550, :921`) | Tile menu › Data as of › "Open in Jobs" and "Edit schedule in Model" | — | — | Offered to every viewer (`dataAsOf.ts:126-133`) | Conflicts with AC-001 for readers; no requirement covers it |
| §P2.6 D (`requirements.md:667`) | People see titles; a prefixed name appears only in YAML and SQL | Pin 4: short names with their folder | — | Raw `cube.name` (`jobs/build.ts:119`; `schedules.test.ts:191-194`) | Built differently |
| AC-343 / AC-352 (`:1176, :1178`) | Surfaces drawn as their designs | — | — | `status.md` rows 10 and 07: "Partly built" | Open |

---

## 2. Design elements no requirement or AC asks for (candidate spec changes)

- **D10 "Last success" and "Duration vs average".** They come from direction.md rule 22 only, and no AC tests them. Either add them to AC-229 or write a new AC.
- **D10's "Trigger" as who or what started the last build.** AC-229 defines Trigger as the refresh key, so this is a spec change.
- **D10's Status filter and search box on Jobs.** No AC asks for them.
- **D10's pre-aggregation-level statuses: Built, Running, Failed and "Not built yet".** No AC defines a rollup's status. AC-145 defines partition states only (built, not built, building, failed).
- **D10's "Recent builds" per rollup in the pane.** AC-150 asks only for a Run history.
- **D10's Model column and the model opening read-only in its folder.** These come from rule 70 and AC-269, not from any Jobs criterion.
- **D10's "Building and scheduling need no proposal".** AC-297 says "let them build and schedule those" and says nothing about proposals. See §4b.1.
- **D07's owner filter** (All / Cube's refresh worker / wechart, with counts). No AC asks for it.
- **D07's detail pane on Schedules.** It holds the `refresh_key` as written, five next runs with the five-minute note, Edit in Model and Open in Jobs. AC-153 asks for next runs in the model editor, not on Schedules.
- **D07's "Last build" column, and a "Next run" column in both designs.** AC-154 asks for neither. The "Next run" came from T264's review list.
- **D07's "Cube's default" state and its "rollup · partitioned by year" line under each name.** No AC asks for either.

---

## 3. Requirements and ACs no design covers

- **AC-145** (partitions) and **AC-151** (queue with cancel). Only the phase-1 prototype draws them (`proto-6x-jobs.png`).
- **AC-150's Run history across rollups, its filters, and a build's log.** T262 and T374 cite "the prototype's columns". direction.md:67 puts "Logs in Jobs" in a bottom drawer that neither design draws.
- **AC-155:** the Suspended state and Resume.
  - Who sets the "configured number" of failures, and whether there is a default, is not specified anywhere.
- **AC-234:** the schedule form, wechart-owned rows, and "Run now".
  - What a "cache warm-up" warms (a dashboard? a set of queries?) is not defined.
- **AC-297:**
  - The Queries tab for a read-write member is not drawn.
  - Schedules as a read-write member is not drawn.
  - Jobs as a Super-Admin is not drawn.
- **How a read-write member changes a schedule.** The path would run Schedules → the model, read-only → Edit in my workspace → Pre-aggs → Propose → approve. It is not designed.
- **AC-156 with two or more Cube instances** (requirements AD 11). Nothing covers per-instance health in Jobs. F18 does it for data sources (AC-161).
- **States neither page draws:**
  - loading;
  - error, and Cube down;
  - no rollups in the user's folders;
  - a filter that matches nothing;
  - a build refused (403) or access revoked mid-session (`references.md:1214` has the rule);
  - a deep link (`/jobs?preagg=`) to a rollup outside the user's scope (rule 67: Not found);
  - security off;
  - below 1,024 px.
- **Data as of › Open in Jobs for read-only users,** who have no Jobs.

---

## 4. Conflicts

### 4a. Between the two designs (design 10 wins, per R37)

1. **What design 10's state A means for Schedules.**
   - Its text says "The phase-1 Schedules layout (Design 07) with a Folder column and filter" (`10-…html:226`). That reads as design 07 plus a Folder column.
   - But it draws only five columns (line 230). It has no page note, no owner filter, no Last build, no detail pane and no Edit in Model.
   - `status.md` row 07 treats these as dropped by design 10.
   - That same row also says "the columns follow design 10 state A" while listing "Last build" as held back, and state A has no Last build column.
   - The user needs to decide which reading is meant.
2. **Icons.** Design 07 gives "Not scheduled" and the Owner cell icons. Design 10's state A gives them muted text only.
3. **Next run.** Design 07 shows the absolute time and the relative time, with the zone. Design 10 shows only the relative time ("in 12 min") and drops the five-minute caveat.
4. **Status wording.** Design 07 says "Not built here" and "Built only when a job asks". Design 10 says "Not built yet".
5. **The change path.** Design 07's primary action is "Edit in Model". Design 10 opens the model "read-only in Sales / EMEA". In phase 2 a shared model can't be edited in place (AC-278), so design 07's label is now wrong.
6. **AC-234.** Design 07 says it is deferred. The spec's phase-2 note at F17 puts every F17 criterion in scope (R16), and neither design draws it.
7. **Top bar.** Design 07's top bar (Model and Security for everyone) is superseded by AC-001 and design 09.

### 4b. Between the designs and the spec

1. **"Scheduling needs no proposal".**
   - It appears in design 10 pin 6 (line 216), in the pane note (line 189) and in `references.md:1363`.
   - But a Cube-owned schedule is a `refresh_key` edit in the model (AC-153), and model changes land only through a proposal (§P2.6 E; AC-278).
2. **Trigger column.** Design 10's Trigger column means who started the build, while AC-229 (ticked) says the refresh key.
3. **Job token.** Design 10 shows no job token, while AC-149 (ticked) requires one.
4. **Tabs.** Design 10 has two tabs, Pre-aggregations and Queries. AC-150 names "the Jobs workspace's Run history", AC-151 needs a queue, and AC-145 opens a rollup's partitions "in Jobs".
5. **Page note.** Design 10's state A draws no page note, while AC-233 requires one.
6. **Icons.** Design 10's state A shows "Not scheduled" with no icon, while AC-152 requires an icon and a label.
7. **Names versus titles (low).** Design 10 pin 4 shows short *names* in mono. §P2.6 D says "People see titles".
8. **"Open in Model" (low).** Design 10 keeps "Open in Model" and a Model column. AC-001 removes the Model workspace from the switcher.

### 4c. Between the built UI and the designs or spec

1. **APIs open to everyone.** All Jobs and Schedules APIs are `USER` class: any signed-in user (`auth/guard.ts:6-14`).
   - `POST /api/builds` starts a build of any `cube.name` under the service credential.
   - `/api/jobs/queries/page` returns every user's queries, their filter values included.
2. **Switcher.** Readers see Jobs, Schedules and Model (T331 is open).
3. **Folder rollups.**
   - They appear under prefixed ids and with no Model link (`schedules.test.ts:191-194`).
   - Data as of names them the same way.
   - The folder is already in `/v1/meta` as `meta.xcube.folderId`, and the short name as `meta.xcube.shortName` (`requirements.md:545`).
4. **Status.** A rollup's status is only this browser session's memory. "Not built here" shows for a rollup the refresh worker rebuilds hourly.
5. **Name link.** The name link leaves Jobs (UX-080). The pane holds Type and Partition granularity where design 10 has Folder, Schedule, Model and Recent builds (T469).
6. **Schedules page.**
   - It has no Folder column, no Next run and no as-written form.
   - Its link opens the cube, not the rollup; T160's cold review found this.
7. **Query log.**
   - It shows locale timestamps and internal member ids, with the caption centred (UX-082).
   - It uses the glyphs '⚡' and '●' instead of the shared status icons (`QueryLog.tsx:200`).
8. **Folder rollups can't be built yet.** The repo's own e2e says a folder's module "isn't in its build context until T371" (`e2e/security/changed-in-place.spec.ts:18-19`). Yet Build is offered for every listed rollup. Not observed at runtime (UNVERIFIED).
9. **Once the folder gate is on.** wechart's own token will see only the folders its groups reach. Jobs and Schedules must first move to xcube's `…/meta` and T371's filtering (`tasks.md:7738`).
10. **Empty pane.** With no rollups, the pane still says "Select a pre-aggregation…" (`BuildPanel.tsx:332`, `app-44`).
    - The empty list says "The model declares no pre-aggregations." (`:242`). For a scoped user that will be false.
11. **The tracker (`status.md` row 10) is off in two places.**
    - It holds the Folder column back behind T340. T340 scopes query records; the folder column needs only `meta.xcube.folderId`.
    - It names only "Recent builds" as needing history. Status, Last success, Duration vs average and Trigger need it too.

---

## 5. UX problems in the designs

**Information hierarchy**
- **No summary of trouble.**
  - Design 10's header shows only Cube and refresh-worker health.
  - The prototype led with "1 running · 2 need attention · 2 failed or suspended" (`proto-6x-jobs.png`).
  - Looker's PDT admin page filters by status and shows "Last attempt status" (`references.md:580-585`).
  - Tableau's Jobs page filters by status, task type and time (`references.md:221-226`).
  - With many folders, an operator should find failures first. Adding counts would be a proposal for the user's approval.
- **One column, two meanings.** Design 10's Trigger column mixes a rule ("Schedule") with a person ("Wren Writer").
  - Looker shows the persistence rule as a column (`references.md:581`).
  - Looker's Datagroups page shows the trigger type and "Trigger last checked" apart from the actions (https://docs.cloud.google.com/looker/docs/admin-panel-database-datagroups).
  - The pane's "Schedule" row is where the rule belongs.
- **A failed row gives no reason.**
  - Neither the row nor the pane shows Cube's error.
  - The pane for a failed rollup isn't drawn, and neither is a build's log.
  - Superset keeps an execution log per schedule, with last states Success, Working, Error, "Not triggered" and "On Grace" (https://github.com/apache/superset/blob/master/superset/reports/models.py, lines 74–79 and 414).
  - Power BI's refresh history shows status, start, duration and error (`references.md:509-515`).
- **No data-source column.**
  - The prototype had one, and so does Looker (connection, `references.md:581`).
  - With eight drivers and per-folder sources, most build failures are connection failures.
- **Missing states that direction already chose.** "Running late" and "Suspended" are in the pre-aggregation jobs direction (`references.md:700-704`, from Tableau and Power BI). Design 10 draws neither.

**State and error handling**
- Neither page draws a loading, error, empty, refused (403) or revoked state (see §3).
- "Build now" has no rule for a build already running.
- For a partitioned rollup, "Build now" doesn't say what it rebuilds: all partitions, or the ones selected (AC-145).

**Accessibility**
- **Duration against average.** The average is shown only by a marker's position (`.durbar`). It has no number and no text alternative. It should read something like "4.2 s · average 8.1 s" (rule 5).
- **Row selection.** Selectable table rows have no keyboard model in the design. T239 recorded that `aria-selected` on plain table rows has thin screen-reader support.
- **Icons.** State A's "Not scheduled" and the Owner cell lack icons (AC-152).

**Super-Admin versus read-write member**
- **Not drawn.** Only the read-write member's Jobs and the Super-Admin's Schedules are drawn.
- **Dead end when data is stale.** A read-write member of /Sales/EMEA can have dashboards served by /Sales's rollups.
  - AC-297 hides those rollups from them, although §P2.2 lets them see ancestors' models, view-only.
  - "Open in Jobs" from a tile then leads nowhere.
- **Other users' queries.** A scoped Queries tab would show other users' queries and filter values to read-write members. No requirement says whether that is wanted.
- **Datagroups comparison.** Looker's Datagroups page puts "Trigger Datagroup" and "Reset Cache" beside the trigger, for users with update permission (URL above). Design 07 and design 10 make Schedules read-only and put building in Jobs only.
  - That keeps the two pages apart.
  - It also makes every "run this now" a trip between pages.
  - Whether to change it is the user's call.
- **Metabase comparison.** Metabase attaches a schedule policy, and "Refresh cache automatically", to a question, dashboard, database or the site default (https://www.metabase.com/docs/latest/configuring-metabase/caching). This supports AC-153's choice of editing the schedule where the object is defined.

---

## 6. Findings by severity, with recommendations

### Blocking

**B1. Jobs and Schedules APIs have no role or folder check.**
- Evidence: §4c.1, AC-268, S1, AC-297.
- This is a release gate for security-on.
- Decision for the user, while T371 is open:
  - (a) make these routes Super-Admin-only for now; or
  - (b) leave them open until T371.
- Either way, note one coupling. Dashboards read `/api/schedules` for every viewer, for Data as of (`DashboardView.tsx:2649`). Narrowing that route breaks Data as of for readers unless it gets its own narrower answer.

### High

**H1. "Scheduling needs no proposal" against the proposal rule.**
- Decision:
  - (a) Changing a `refresh_key` goes through a proposal, and "no proposal" applies only to builds and to wechart-owned schedules (AC-234). Design 10's note and `references.md:1363` would then need rewording.
  - (b) `refresh_key` changes skip proposals. That would be a requirements and spec change.

**H2. AC-145, AC-150 (Run history and log), AC-151, AC-155 and AC-234 have no design.**
- Decision: confirm that design 10's two tabs are not exhaustive. Then either:
  - have these surfaces designed; or
  - name the prototype's Jobs and Schedules screens as their design, leaving out its "Delivery" kind, which is a non-goal.
- Before any design, AC-155's "configured number" (who sets it, and any default) and what AC-234's "cache warm-up" targets need the user's answers.

**H3. Design 10's table rests on build history.**
- Update `status.md` row 10 to say that Status, Last success, Duration vs average and Trigger wait on AC-150.
- Decision: what Status shows until AC-150 lands. "Not built here", which only reflects this browser session, misleads operators.

**H4. Prefixed names and missing links for folder rollups.**
- No decision is needed: §P2.6 D and design 10 pin 4 already settle it.
- Show the short name and the folder, from `meta.xcube`, in Jobs, Schedules and Data as of.
- The Folder column for Super-Admins doesn't need T340.

**H5. Readers get Jobs and Schedules.**
- T331 covers the switcher.
- Decision: what Data as of offers readers in place of "Open in Jobs" and "Edit schedule in Model". AC-148's wording assumes access to Jobs.

### Medium

- **M1. Trigger column (AC-229).** Decision: amend AC-229 to design 10's meaning, or keep the refresh key in the column and move "Started by" into the history.
- **M2. Job token (AC-149).** Decision: where the token appears, since design 10 has no place for it. Options are the pane while a build runs, or the history.
- **M3. Design 10 state A against design 07.** Decision: which of design 07's parts survive. The AC-233 note should survive at minimum. The others are the owner filter, Last build, and the pane with its next runs, five-minute note and links. See §4a.1.
- **M4. State A's icons.** Add icons to "Not scheduled" and the owner (AC-152).
- **M5. Undrawn states.** Design the missing states in §3. Correct the built empty text and the empty pane.
- **M6. AC-297 is vague.** Decisions needed:
  - whether a query record belongs to the item's folder or the cube's folder, and what happens to a query spanning folders;
  - whether read-write members see other users' queries;
  - whether they see, view-only, the ancestors' rollups that serve their dashboards.
- **M7. Health with two or more Cube instances (AC-156).** Decision: whether Jobs shows health per instance, as F18 does for data sources (AC-161).
- **M8. Build offered for rollups it can't build.** Jobs offers Build on folder rollups outside the build context (changed-in-place.spec.ts:18-19). The gate also needs T371 before its lists are complete (`tasks.md:7738`). Decision: disable Build with a reason until T371 lands, or hide those rows.
- **M9. Duration against average.** Give it a text value (§5).

### Low

- **L1. One status vocabulary.** Choose one across design 07, design 10, AC-145 and the build: "Running", "building" or "Processing"; "Not built yet" or "Not built here".
- **L2. The word "Model".** "Open in Model" and the Model column name a workspace AC-001 removes. Rename them, for example "Open model".
- **L3. Names or titles.** Design 10 shows short names where §P2.6 D says titles.
- **L4. Row selection.** Give selectable rows a keyboard and screen-reader pattern.
- **L5. Query log.** Fix its dates, member titles and caption (UX-082, T469). Use the shared status icons.
- **L6. Public health route.** `/api/cube-health` is `PUBLIC` (`server.ts:402`) and reveals Cube and refresh-worker health without sign-in. Decision: whether that is acceptable.
- **L7. Tracker errors.** Correct `status.md` rows 10 and 07 (§4c.11, §4a.1).
- **L8. Design 10's sample data disagrees with itself.** `orders.monthly` is in "Sales" on the main screen and in "Shared" in state A. The row says "Sales / EMEA" and the pane "Shared / Sales / EMEA". `references.md` names the root "Our analytics".
