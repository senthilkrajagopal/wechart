# Done tasks, lane SQL (P2.24, from T797); the rest are in [`tasks-done.md`](./tasks-done.md)

### P2.24 Lane SQL: the workspace (ticked after 2026-10-17)

- [x] T797 (AC-386, AC-381, AC-304) The workspace's three panes: the picker and schema browser on the left, the tabs over the results in the centre, Saved and History on the right, folding to rails below 1,024 px, as design 17 screen 1 and state O draw them
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/SqlWorkspace.tsx` (+ test), `packages/web/src/workspaces/sql/sqlStyles.ts`, `e2e/security/sql-workspace.spec.ts`, `e2e/no-horizontal-scroll.spec.ts`.
  - Failing test: `SqlWorkspace.test.tsx`: the left pane is 280 px (220–400, a 40 px rail), the right 320 px (280–480, a 40 px rail), and the centre splits editor and results 30 : 70 with the editor at least 200 px and the results at least 160 px (direction §7f, rule 91). The e2e: below 1,024 px both side panes are 40 px rails that open over the centre and the editor stays usable (design 17's Q1); at 390 px nothing scrolls sideways (AC-304).
  - Depends on: T796
  - **Built 2026-10-17** (lane SQL). No AC is ticked: the panes hold only their headings until the picker (T798), the schema browser (T805) and History (T817) fill them, and AC-304 was ticked already. The sizes live in `panes.ts`; the grips are pointer-only, as the results drawer's is (R75). Below 1,280 px the right pane is a rail, below 1,024 the left one too (design 17, state O); a rail's pane opens over the centre, one at a time, takes focus, and closes on Esc (focus back to its rail) or a press outside it (rule 85). A dragged pane never leaves the editor under design 17's 560 px. `/sql` joins `shell.spec.ts`'s 390 px pages and `no-horizontal-scroll.spec.ts`.

- [x] T798 (AC-447, AC-373, AC-383, AC-384) The data source picker: the sources the user may run SQL on, grouped by folder path, My workspace's first, Cube Store at the root while on, each with its driver and the runner's state; an off source only to those who may turn it on or see it off, opening the off panel
  - Lane: SQL
  - Files: `packages/api/src/routes/sql-sources.ts` (+ test), `packages/api/src/server.ts`, `packages/web/src/workspaces/sql/SourcePicker.tsx` (+ test), `packages/web/src/workspaces/sql/OffPanel.tsx` (moved from the data source page's), `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `sql-sources.test.ts`: `GET /api/sql/sources` gives a read-write member the sources switched on in their folders and their own workspace's (AC-383), plus the off ones of their own folders; gives a Super-Admin every source and Cube Store while on (AC-384); and gives nobody a source of a folder they see only as an ancestor's, or another user's workspace source (AC-373, AC-447). `SourcePicker.test.tsx`: a custom listbox grouped by folder path, My workspace's first with "Yours", each row's driver and "SQL runner on" or "Off" as an icon and a label; choosing an off source shows the off panel, with Turn on… for a Super-Admin, and no editor that can run (AC-447, AC-373).
  - Depends on: T797
  - **Built 2026-10-17** (lane SQL). AC-447 is ticked; AC-373 stays open for T802, T823 and T824, and AC-383 and AC-384 were ticked already. The route is registered from `routes/data-sources.ts`, beside `registerSqlRunner`, which holds every store it needs, so `server.ts` is untouched; it joins the route matrix. Shared folders' sources by `access(…, 'write')`, as a run is; a workspace's by its owner alone, Super-Admins included; Cube Store by `cubeStoreFor`'s rule. The off panel, its Turn on… dialog, `CubeStoreTurnOn` and the `SqlSource` helpers moved to `workspaces/sql/` (`OffPanel.tsx`, `sqlSource.ts`), re-exported from `SqlRunner.tsx`; Turn on also refreshes the picker. The picker is design 10's `PathPicker` (a row's `path` widened to a node); a row's state reads "SQL runner on", "Off" or "Yours · no switch" (design 17, pin 3), and the root's own sources and Cube Store share one "Shared" group, after the folders'. An off source chosen puts the off panel in the editor's place.

- [x] T799 (AC-466) A first visit: one tab, "Query 1", no data source, focus on the picker, and the sentences for no source and for none available, as design 17 state H draws them
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/SqlWorkspace.tsx`, `packages/web/src/workspaces/sql/EmptyStates.tsx` (+ test), `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `EmptyStates.test.tsx`: on a first visit there is one tab, "Query 1", no data source chosen, focus on the picker and "Choose a data source to write SQL against."; for a member who may run SQL on no source, "No data source runs SQL for you yet. A Super-Admin turns the SQL runner on for each data source. Your own data sources in My workspace need no switch." with a link to Data sources (AC-466).
  - Depends on: T798
  - **Built 2026-10-17** (lane SQL). AC-466 stays open for T824 (Run on a source turned off, or no longer available). One tab, "Query 1", in a labelled tablist ("SQL tabs") over its tabpanel; T800 adds more, with their keys. Neither sentence shows while the sources are read. The calls are T799-1 in `decisions-2026-10-08.md`, "Later decisions": H2 is a member's (a Super-Admin is asked to choose one), and below 1,024 px focus goes to the left rail's button. H2's line about the "Cube" group waits for that group's tasks.

- [x] T800 (AC-450) Editor tabs, each bound to one data source: "+", the tab's ⋯ with Rename…, Duplicate, Close and Close other tabs, a changed source keeping the SQL and clearing the result, the state in the tooltip and accessible name, and asking before closing unsaved text
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/tabs.ts` (+ test), `packages/web/src/workspaces/sql/TabStrip.tsx` (+ test), `packages/web/src/workspaces/sql/CloseTabDialog.tsx`.
  - Failing test: `TabStrip.test.tsx`: "+" opens a tab on the current tab's data source; the ⋯ offers Rename…, Duplicate, Close and Close other tabs, each doing so; changing a tab's source keeps its SQL and clears its result at once (design 17's Q5); a finished tab's accessible name and tooltip read "Query 1, Finished, 1,284 rows", with an icon and no colour alone (design 17's Q6); closing a tab whose text is neither saved nor its last run's SQL asks first, focus on the safe choice, and closing any other doesn't ask (AC-450). `tabs.test.ts`: a tab holds exactly one source id.
  - Depends on: T798
  - **Built 2026-10-17** (lane SQL). AC-450 stays open: no run goes through a tab until T802, whose e2e (two tabs, each running on its own source) is to tick it. `tabs.ts` is the tabs' reducer; the picker chooses the open tab's source, and choosing its own again changes nothing (T800's review). A tab's name and tooltip read "Query 1, Finished, 1,284 rows, on emea_replica" (design 17's keyboard table); a new tab reads "Not run yet". The ⋯ and × are buttons after each tab inside the tablist, as the dashboard's tab groups have them; the ⋯ of a tab not open shows on hover or focus. `MenuButton` takes `fixed`, placing its menu by its button's box and closing it on a scroll, since the strip scrolls (Q8) and would clip it. The calls are T800-1 in `decisions-2026-10-08.md`, "Later decisions".

- [x] T801 (AC-451, AC-446) Keep open tabs in this browser only, for the signed-in user, restore them on reload, and name the open tab in the address
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/tabStore.ts` (+ test), `packages/web/src/workspaces/sql/SqlWorkspace.tsx`, `packages/web/src/router/routes.tsx`, `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `tabStore.test.ts`: tabs (name, data source, SQL, parameters) are kept under a key holding the user's id, so another user in the same browser sees none of them. The e2e: `/sql?tab=<id>` names the open tab; a reload opens that tab with its source and text (AC-446); a second browser context for the same user has no such tab; no request to the API carries a tab, and the metadata database holds none (AC-451).
  - Depends on: T800
  - **Built 2026-10-17** (lane SQL). AC-451 is ticked: the e2e reloads the address of a renamed tab on the folder's source and gets it back, open; a second context for the same user, and another user signed in to the same browser, start with Query 1; no request carries the tab's name or id; and `pg_dump` of the metadata database holds no name. AC-446 stays open for T802: no editor shows a tab's text yet, so T802's e2e is to type SQL, reload the address and find it (and extend the request and `pg_dump` checks to that text). Kept in `localStorage` under `wechart.sql.tabs.‹identity, or name›`, as the data source page keys its drafts, so `/api/me` is unchanged; a result isn't kept. `SqlSurface.tsx` reads `?tab=` once and replaces the address as tabs open; `routes.tsx` changes one line. The calls are T801-1 in `decisions-2026-10-08.md`, "Later decisions".

- [x] T802 (AC-373, AC-385, AC-380) Run a tab's SQL on its data source from the workspace, under the run line and the warning naming that tab's source and login, with the result grid and CSV
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/QueryTab.tsx` (+ test; the editor and result from `workspaces/data-sources/SqlEditor.tsx` and `SqlResult.tsx`, moved), `packages/web/src/workspaces/sql/RunLine.tsx` (+ test), `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `RunLine.test.tsx`: above every tab's editor on a data source or Cube Store, the run line names the tab's database, host and login, and the warning says the SQL runs on the database directly, past folder permissions and access policies, naming that tab's source, with no control to hide either (AC-385). The e2e: an allowed member runs `SELECT` from a workspace tab and gets the grid with each column's type, the row count, the time and CSV (AC-373, AC-380); two tabs on different sources each name their own.
  - Depends on: T800
  - **Built 2026-10-17** (lane SQL). AC-385, AC-446 and AC-450 are ticked on the e2e "running a tab’s SQL in the workspace (T802)": the warning names the tab's source and login above its editor, with nothing to close it; runs go to each tab's own source; changing a tab's source keeps its SQL and clears its result; the ⋯ lists its four actions; closing changed text asks; and reloading a tab's address brings back its source and text, which no request or `pg_dump` holds. AC-373 stays open for T823 and T824 (AC-380 was ticked already). The editor and result are imported from `workspaces/data-sources/`, not moved, while the data source page still uses them. The warning reads "This SQL runs on ‹source›’s database directly, as ‹login›…" so it names the source; where a driver's login can't be named (`loginOf` gives none) it names none, as the page's did. A tab's run and result are in its state (`tabs.ts`), so they are there again on coming back to it; a result is the run's own by its start time, so a late answer never ends a later run (T802's review). Running · n s, Cancel and the hold across tabs are T804's; Run selection and the statement at the cursor, T803's. The e2e adds a second source switched on in the folder, `sqlws_two_‹run›`.

- [x] T803 (AC-387) Run the selection, or with none the statement at the cursor, bounded by semicolons outside strings and comments
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/statementAt.ts` (+ test; the tokens of `@codemirror/lang-sql` 6.10.0), `packages/web/src/workspaces/sql/QueryTab.tsx` (+ test), `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `statementAt.test.ts`: with the cursor in the second of `SELECT 1; SELECT ';' AS a; -- x;` the statement is `SELECT ';' AS a`, a semicolon in a string or comment bounding nothing. `QueryTab.test.tsx`: with text selected, Run reads "Run selection" and only the selection is sent, from Run and from ⌘/Ctrl+Enter; with none, the statement at the cursor is marked in the editor and only it is sent. The e2e: with two statements and the cursor in the second, only that one reaches the database, and the run isn't refused as two statements (AC-387).
  - Depends on: T802
  - **Built 2026-10-17** (lane SQL). AC-387 is ticked on the e2e "runs only the statement at the cursor, or only the selection…": the cursor in the second of two statements sends only it, by ⌘/Ctrl+Enter, and it runs; a selection reads "Run selection" and sends only itself. `statementAt.ts` parses with lang-sql and skips `String`, `LineComment`, `BlockComment` and `QuotedIdentifier` (research/sql-parameter-binding.md §4), in the source's dialect: PostgreSQL for postgres and redshift (`$$…$$`), MySQL with backslash escapes and backticks, MSSQL, and standard SQL for the rest, Cube Store's included (T803's review). `SqlEditor` takes an opt-in `atCursor` (with `dialect` and `onStatement`), which only the workspace sets; the data source page still runs the whole text. The statement is marked with a tint (`.cm-sql-statement`). A cursor just after a semicolon is in the statement it ends; one in a stretch of only space or comments is in the statement before; the text sent keeps its comments and loses its surrounding space. Not built: design 17's gutter mark (pin 11) and the "lines 2–8" note beside Run (pin 12), which no criterion holds. The only key is the approved ⌘/Ctrl+Enter, which the research finds reaches the page everywhere (`keyboard-shortcuts-sql-runner.md` §4).

- [x] T804 (AC-452, AC-379) Show a run's state the same way on its tab, in its result head and in History; hold Run on every other tab with "Go to it · Cancel that run"; keep a run going while the user is away
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/runState.ts` (+ test), `packages/web/src/workspaces/sql/QueryTab.tsx`, `packages/web/src/workspaces/sql/TabStrip.tsx`, `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `runState.test.ts`: each of Running · n s of 30, Finished, Limited to 10,000 rows, Limited to 10 MB, Stopped at 30 seconds, Cancelled, Not run, Database error, Busy and Cube Store still finishing maps to one icon and one label used by the tab, the result head and the History row. The e2e: while a `pg_sleep` run goes on tab 1, tab 2's Run is held with "You have a run going on ‹source›… Go to it · Cancel that run"; Go to it selects tab 1; Cancel that run cancels it (AC-379); leaving for Explore and coming back shows it still running, then Finished (AC-452).
  - Depends on: T802
  - **Built 2026-10-17** (lane SQL, batch 3).
    - **What it adds.** `runState.ts` names each state with one icon and one label. The tab (with a finished run's rows), the result head and, from T817, History all ask it, on one clock the workspace ticks each second while a run goes.
    - **What the e2e "a run going, across tabs and away (T804)" shows.**
      - A `pg_sleep` run's tab and result head read the same "Running · n s of 30".
      - Every other tab shows the hold note, and its Run, button and ⌘/Ctrl+Enter alike, sends nothing.
      - Go to it selects the running tab.
      - Cancel that run, from the other tab, ends it as Cancelled and stops it in `pg_stat_activity`.
      - After leaving for Explore and coming back, the run is still going, then Finished.
    - **AC-452 stays open:** History, its third place, is T817's, which now cites it.
    - **AC-379** was already ticked; its Cube Store clause (no Cancel, saying so) is unit-tested in the workspace.
    - **Leaving loads a new page,** because the switcher's links are plain anchors. So:
      - a run going is kept in `localStorage` with its tab (`tabStore.ts`), its result still not;
      - a request dropped while the page is being left (`beforeunload`/`pagehide`) ends nothing;
      - on return, the run is followed through `GET /api/sql-runs/going`, asked every 3 seconds, a failed ask included. Once it stops, its end is read from History (`GET /api/sql-runs?dataSource=…`): the newest row of its SQL, started within 5 minutes of it.
      - That end shows its label, rows counted, time and start, with "You were away when it ended, so its rows weren’t kept. Run it again to see them."; a run History has no row for reads "No answer".
      - A page brought back by Back (`pageshow` with `persisted`) follows its runs the same way (T804's review).
      - `liveTabs.ts` keeps the tabs, results and all, across a remount within one page.
    - **Moved:** the run-going query and Cancel moved to `going.ts`, shared with the data source page's runner.
    - **`SqlResult`:** it takes an optional `state` for its head, which only the workspace passes. "Finished" then says "no rows" in its detail.
    - **"Unavailable" reads "No answer"**, outside AC-452's list, because whether such a run ran isn't known (lane SQL's call).
    - **Go to it shows only where a tab holds the run.** A run started on the data source page, or before a reload with no tab kept, holds Run with Cancel that run only.

- [x] T805 (AC-386) The schema browser in the left pane: the tab's source's schemas, tables and columns with their types, read as they're opened, putting a chosen name into the editor
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/SchemaTree.tsx` (+ test; from `workspaces/data-sources/SchemaBrowser.tsx`), `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `SchemaTree.test.tsx`: the tree shows the tab's own source, and switching tabs to another source shows that one's; a column shows its database type; choosing a name puts it at the editor's cursor. The e2e: every table and column of the development database's `public` schema is listed (AC-386).
  - Depends on: T800
  - **Built 2026-10-17** (lane SQL, batch 3).
    - **AC-386 stays open, for the coordinator.** Its words take in "a SQL runner tab … on Cube Store", but design 17's C5, approved, draws no browser there: "Cube Store has no catalog to browse", as built. No research says Cube Store can be introspected. Its data-source part passes on the e2e "the schema browser in the left pane (T805)". That e2e compares the tree to the sample database's `information_schema`: every `public` base table, and each one's columns in order as "name, data_type". Choosing `orders` puts `public.orders` in the editor.
    - **The unit tests show:**
      - the tree follows the open tab's source, there and back;
      - a column shows its database type;
      - a chosen name goes in at the cursor of the tab open when it was chosen, once.
    - **Cube Store:** design 17's C5 note, as built, and no catalog read.
    - `SchemaTree.tsx` wraps the data source page's `SchemaBrowser`, which gains an optional `heading` (none here, under the pane's "Schema").
    - Decision T805-1 is in `docs/design/decisions-sql.md`.

- [x] T807 (AC-449) A table's ⋯: Insert name, Insert SELECT with a 100-row limit in the driver's syntax, and Preview 100 rows as an ordinary run in a new tab; opening a node sends only catalog reads
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/tableMenu.ts` (+ test), `packages/web/src/workspaces/sql/SchemaTree.tsx`, `e2e/security/sql-workspace.spec.ts`.
  - Failing test: `tableMenu.test.ts`: Insert SELECT writes `SELECT <columns> FROM <schema>.<table>` with `LIMIT 100` on PostgreSQL and MySQL, `TOP 100` on SQL Server and `FETCH FIRST 100 ROWS ONLY` on Oracle, at the cursor, and runs nothing. The e2e: Preview 100 rows opens a new tab holding that SELECT, runs it capped, and leaves an audit event and a History row; expanding a schema and a table sends xcube only catalog reads (AC-449).
  - Depends on: T805, T802
  - **Built 2026-10-17** (lane SQL, batch 3).
    - **AC-449 is ticked** on the e2e "a table’s ⋯ in the schema browser (T807)", against the sample database:
      - opening `public` and `orders` sends only `/catalog/` requests;
      - the ⋯ offers its three items in order;
      - Insert SELECT writes the 6-column SELECT with `LIMIT 100` and posts no run;
      - Preview 100 rows opens a selected tab named `orders`, holding that SELECT, and runs it once on the ordinary route, with 100 rows or fewer;
      - History (`GET /api/sql-runs`) lists it first, and the audit trail has its `sql-run` event since the test began.
    - History's pane in the workspace is T817's. The row exists now and shows on the data source page's My runs.
    - **Each driver's limit,** from new research `docs/research/sql-row-limits.md`: `LIMIT 100`, but `TOP (100)` on SQL Server, with the parentheses Microsoft recommends, and `FETCH FIRST 100 ROWS ONLY` on Oracle 12c and later. The task line said `TOP 100`.
    - **The ⋯** is the shell's `MenuButton`, which gains an optional `tabIndex`. It's on each table row of the shared `SchemaBrowser`, opt-in through `menu`, which the data source page doesn't pass. It is in the tab order only on the row holding the tree's stop.
    - The pane's foot reads "Opening a schema or a table reads only its names. Nothing runs until you press Run." (pin 6).
    - Decision T807-1 is in `docs/design/decisions-sql.md`.

- [x] T808 (AC-456) Autocomplete the tab's source's schemas, tables and columns as the user types: ↑ ↓ choose, Enter accepts, Esc closes the list only, Tab still leaves the editor
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/completion.ts` (+ test; `schemaCompletionSource` of `@codemirror/lang-sql`, per `code-editor.md`), `packages/web/src/workspaces/sql/QueryTab.tsx` (+ test).
  - Failing test: `completion.test.ts`: typing `cust` offers `customers` and, after `customers.`, its columns read so far. `QueryTab.test.tsx`: with the list open, ↓ then Enter accepts and adds no new line; Esc closes the list and nothing else; Tab moves focus out of the editor (AC-456).
  - Depends on: T805
  - **Built 2026-10-17** (lane SQL, batch 4).
    - **AC-456 is ticked** on the e2e "autocomplete in the editor (T808, AC-456)", against the sample database. With `public` and `customers` opened in the schema browser:
      - typing `SELECT cust` lists `customers`, and Enter takes it;
      - `.` lists its four columns, `co` narrows them to `country`, and Enter takes it on the same line;
      - ↓ ↓ ↑ chooses `id`;
      - Esc closes the list, leaving the text, the address and the focus;
      - Tab leaves the editor while the list is open.
    - **The names** are the schema browser's kept answers (`['sql-catalog', id, version, …]`), read at the moment the list is asked for, at the source's latest version: nothing new is fetched. `completion.ts` turns them into a lang-sql namespace.
    - **The editor** is the shared `SqlEditor`, which gains an optional `completion`; the data source page passes none, so it has no autocomplete.
    - **New pinned package:** `@codemirror/autocomplete` 6.20.3, already in the store as lang-sql's dependency. Research addendum in `code-editor.md`, 2026-10-17.
    - Decisions T808-1 and T808-2 are in `docs/design/decisions-sql.md`. T808-2 binds only AC-456's keys, and lets the list take them at once, not after the library's 75 ms.

- [x] T809 (AC-453) List each `{{ name }}` outside strings and comments once, in a strip under the editor, typed Text, Number, Date or Boolean, and hold Run until each has a value
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/parameterNames.ts` (+ test; per `sql-parameter-binding.md` §4, a dialect per driver, MySQL with backslash escapes), `packages/web/src/workspaces/sql/ParameterStrip.tsx` (+ test).
  - Failing test: `parameterNames.test.ts`: `{{region}}` and `{{ region }}` list once; `{{Region}}` and `{{region}}` list twice; `{{1x}}`, `{{a-b}}`, one in a string, one in a `--` comment and one in a block comment aren't listed; on MySQL, `'it\'s {{x}}'` lists nothing. `ParameterStrip.test.tsx`: each name has Text (first), Number, Date or Boolean and a value field; Run is held naming the parameters that have no value, and a run can't start until each has one (AC-453).
  - Depends on: T802
  - **Built 2026-10-17** (lane SQL, batch 4).
    - **AC-453 is ticked** on the e2e "parameters under the editor (T809, AC-453)". It types SQL holding a `{{…}}` in a comment and in a string, `{{ status }}` and `{{status}}`, and `{{Min}}`, then checks that:
      - the strip lists `status` and `Min` once each;
      - the type is Text first, of the four;
      - Run is disabled, with "Give status and Min values to run", then "Give Min a value to run";
      - ⌘/Ctrl+Enter sends nothing while a value is missing;
      - Run is enabled once both have values.
    - **Also changed:** `QueryTab.tsx` (the strip, and the hold on Run and on ⌘/Ctrl+Enter), `tabs.ts` (`paramTypes` and the `param-value` and `param-type` actions), `tabStore.ts` (the types kept with the tab, any but the four dropped), and `sqlStyles.ts`.
    - **Until T811,** a run sends the SQL with its `{{name}}`s and no values, so the database refuses it. No value is ever written into the SQL text.
    - Decision T809-1 is in `docs/design/decisions-sql.md`.

- [x] T810 (AC-482) Hold Run on Dremio and on Cube Store while the SQL holds a parameter, saying parameters aren't available on that source
  - Lane: SQL
  - Files: `packages/web/src/workspaces/sql/ParameterStrip.tsx` (+ test), `packages/api/src/routes/sql-runner.ts` (+ `sql-runner.test.ts`).
  - Failing test: `ParameterStrip.test.tsx`: on a Dremio tab and a Cube Store tab with `{{x}}` in the SQL, Run is held, saying parameters aren't available on that source. `sql-runner.test.ts`: a run request to those sources holding a `{{ name }}` is refused before xcube is called, and no value is written into the SQL (AC-482).
  - Depends on: T809
  - **Built 2026-10-18** (lane SQL, batch 4).
    - **AC-482 is NOT ticked.** Its "Cube" group half is T826's, which ticks it.
    - **Tests:**
      - `sql-runner.test.ts` (Dremio) and `sql-cube-store.test.ts` (Cube Store): a run holding `{{ name }}` gets a 400 with `outcome: 'refused'` and "Parameters aren’t available on ‹Dremio | Cube Store›. Write the value into the SQL to run it here." before xcube is asked. One in a string or a comment runs as written. On PostgreSQL a `{{name}}` is still sent as written until T811.
      - `QueryTab.test.tsx`: on a Dremio tab and a Cube Store tab, Run and ⌘/Ctrl+Enter are held with that sentence, and there is no strip (design 17, F5).
      - `ParameterStrip.test.tsx`: `unboundOn` names those two sources and no other.
    - **One finder for both ends.** `parameterNames` moved to `@wechart/core`, under its own subpath, `@wechart/core/sql-parameters`, so lang-sql's parser stays out of the package's root. `@wechart/core` now depends on `@codemirror/lang-sql` 6.10.0, which `sql-parameter-binding.md` covers. The web's `parameterNames.ts` re-exports it. The API reads both sources' SQL as standard SQL.
    - No e2e: the security stack has no Dremio source, and Cube Store's run is unit-tested on the route. The browser's hold is the same code as T809's, which the e2e covers.
    - Decision T810-1 is in `docs/design/decisions-sql.md`.
