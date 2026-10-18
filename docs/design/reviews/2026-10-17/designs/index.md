# Designs for approval — UI design 2026-10-17 (phase 2, R78)

**Approved 2026-10-17** by the user: designs 17 and 18, "Approve with defaults (Recommended)" (R78 in `docs/requirements-log.md`). Every open question takes the way its design draws it, option (a), except where the user answered otherwise. See "Decided 2026-10-17" at the end.

Two static mockups for R78: the SQL runner workspace (F42, with the amended F40 criteria) and personal access tokens for the MCP server (F41). They are numbered after designs 15 and 16 in `../../2026-10-01/designs/index.md`.

- **Format:** the same as the 2026-10-01 designs. Each is a self-contained HTML file with inline CSS in direction.md's tokens, and Inter and IBM Plex Mono from Google Fonts, with no other requests. Open it in a browser. Each shows:
  - 1440 × 900 screens with numbered pins, each followed by the notes on its pins;
  - lettered states, each naming the criteria it shows;
  - the keyboard and accessibility rules, and every new state as an icon and a label;
  - the proposals and questions.
- **Where they come from:**
  - R78 in `docs/requirements-log.md`, and §P2.6 K and L in `docs/requirements.md`;
  - F41 (AC-430 … AC-445, AC-468 … AC-479) and F42 (AC-446 … AC-467, AC-480 … AC-483) in `docs/spec.md`, with the amended AC-001, AC-373, AC-381, AC-385, AC-386 and AC-387;
  - `docs/design/references-sql-runner.md` (its Direction, "The experience, specified", Tokens and Checklist);
  - research `mcp-typescript-sdk.md`, `fastify-rate-limit.md`, `sql-runner.md`, `xcube-sql-runner.md` and `cube/introspection-api.md`;
  - the approved designs they build on: 08 (the audit trail and Security's tabs), 09 (the account menu and the single-user chip), 11 (Generate cubes' docked pane), 15 (the SQL runner's labels, switch and dialogs) and 16.
- **Illustrative content:** people, folders, data sources, SQL, rows, token text, URLs, times and counts are illustrative. The token's text format is not decided.
- **Rendering:** the pins were placed from the layout's computed sizes. The designs weren't opened in a browser in this session, because the local Chrome tools didn't respond, so a pin may sit a few pixels off its target.
- **Keyboard:** design 17 adds only the keys R78 approved under R75: run the statement at the cursor, ⌘/Ctrl+S, ⌘/Ctrl+F in the editor, autocomplete, Ctrl+Q, and Ctrl+Alt+[ and ]. Design 18 adds none.
- **Tokens:** no new colour, type size or weight. Both designs stay on the 12 px floor and the 400 and 600 weights. The layout values are recorded in direction.md §7f, and the checklist gains rules 90–108 from references-sql-runner.md (its 107–125, renumbered because the copilot's proposed 90–106 aren't adopted).

| # | File | Addresses | What it shows | You are asked to approve |
|---|---|---|---|---|
| 17 | [17-sql-runner-workspace.html](17-sql-runner-workspace.html) | R78 · AC-446 … AC-467, AC-480 … AC-483 · amended AC-001, AC-373, AC-381, AC-385, AC-386, AC-387 · with AC-350, AC-374 … AC-380, AC-382 … AC-384, AC-422, AC-139, AC-284, AC-304 · rules 1, 3, 17, 18, 67, 72, 74, 81, 84, 85, 90–108 | **Screen 1: the workspace just after a run on `emea_replica`** (pins 1–19):<br>1. SQL runner in the switcher, after Schedules;<br>2. the data source picker, a custom listbox;<br>3. the source's folder and the runner's state;<br>4. Find a table;<br>5. columns with their types and PK / FK tags, the FK's target in its tooltip;<br>6. a table's ⋯;<br>7. editor tabs bound to a data source, each with its state;<br>8. the run line;<br>9. the warning, above every tab's editor;<br>10. Saved query · Only me, Save and Save as new…;<br>11. the editor, with the statement at the cursor marked;<br>12. Run, the statement at the cursor, and the limits;<br>13. the typed-parameter strip;<br>14. the splitter, 30 : 70;<br>15. the result head, with Make a cube… and Make a chart…;<br>16. the grid;<br>17. Saved and History, All by default;<br>18. a run in History, with its source, folder and values;<br>19. older runs.<br>**Screen 2: Make a cube from that run** (pins 1–14): the pressed button; "in My workspace"; the name, checked; the folder, read-write only; the data source, fixed; the SQL that ran; the parameters written in as literals, and said so; one row per column; Dimension or Measure; the Cube type; one primary key; the `count` measure; how the cube will be read; Add to My workspace.<br>**States:**<br>• **A** (AC-001, AC-446, AC-304): the switcher for each role; Not found at `/sql`; below 1,024 px.<br>• **B** (AC-447, AC-373, AC-383, AC-384, AC-481): the picker open, with My workspace, folders, Cube Store and the "Cube" group; an off source as a member and as a Super-Admin.<br>• **C** (AC-386, AC-448, AC-449, AC-467): a table's ⋯; Insert SELECT; Find a table with pages unread; loading and the built errors; Cube Store; the "Cube" group's cubes, views and members.<br>• **D** (AC-450, AC-451, AC-480): a tab's ⋯; closing an unsaved tab; changing a tab's data source; each tab state; kept in this browser only.<br>• **E** (AC-387, AC-455, AC-456): autocomplete; Run selection; find.<br>• **F** (AC-453, AC-454, AC-482, AC-382): a value missing; the four types; `{{…}}` in a string or comment; Run held on Cube Store and in the "Cube" group; the audit keeping names only.<br>• **G** (AC-452, AC-375, AC-377 … AC-380): running; Run held on other tabs; capped; stopped at 30 seconds; cancelled; not run; database error; busy; Cube Store still finishing.<br>• **H** (AC-466): first visit; no data source to run on; no result; no rows; empty editor; empty Saved and History; loading.<br>• **I** (AC-457 … AC-460, AC-483): the Saved tab; Save… with its name rules; Delete with Undo; a saved query whose source isn't available; ⌘K.<br>• **J** (AC-381, AC-465): a run put back, with Undo; on another source, a new tab; This data source.<br>• **K** (AC-461 … AC-463, AC-481): disabled with each reason; Make a chart's pane; the toast; the chart editor with nothing placed and "Back to SQL runner".<br>• **L** (AC-466, AC-373): the switch turned off mid-session; the folder's access removed.<br>• **M** (AC-467, AC-481): a tab through Cube, with no bypass warning; no Make a cube on its results; the audit's "Cube" mark.<br>• **N** (AC-464, AC-373, AC-374, AC-383): the data source page's SQL runner tab, on, off, and for a workspace source; Open in SQL runner in the page head's ⋯ and each row's ⋯.<br>• **O** (direction §2, AC-304): 1,024–1,279 px and below 1,024 px.<br>Then: what moves from design 15; keyboard and accessibility; every state as an icon and a label. | 1. **The workspace and its place:** SQL runner after Schedules, for Super-Admins and read-write members, at `/sql`.<br>2. **The three panes:** the picker and schema browser on the left (280 px), the tabs in the centre, Saved and History on the right (320 px), split 30 : 70.<br>3. **The picker:** grouped by folder path, My workspace first, Cube Store at the root while on, the "Cube" group last; an off source shows the off panel.<br>4. **The schema browser:** Find a table, PK / FK tags, a table's ⋯ with Insert name, Insert SELECT and Preview 100 rows.<br>5. **Tabs:** bound to one data source, the state as an icon with its label in the tooltip and accessible name, the ⋯ menu, asking before closing unsaved text, kept in the browser.<br>6. **Above the editor:** the run line and the warning on every tab; "through Cube, as you" on a Cube tab.<br>7. **The editor:** the statement at the cursor marked and run; Run selection; autocomplete; find; ⌘/Ctrl+S.<br>8. **Parameters:** the strip, four types, Run held until each has a value, bound and never in the SQL; Run held with the reason where a source can't bind.<br>9. **Run states:** design 15's labels, the same on the tab, the result head and History; Run held on every other tab while one runs.<br>10. **Saved queries:** personal, the Saved tab, Save… with its name rules, Delete with Undo, ⌘K.<br>11. **History:** All by default, with source, folder and values; put back with Undo, or into a new tab.<br>12. **Make a cube and Make a chart:** the docked pane, the run's values written in, the columns table, the `count` measure, a draft in My workspace; the chart editor with nothing placed.<br>13. **The "Cube" group:** no switch, no warning, no Make a cube, audited as "Cube".<br>14. **The data source page's tab,** renamed SQL runner, with the switch and Open in SQL runner, and no editor.<br>15. **Empty, loading, lost access and narrow widths** as drawn in H, L and O.<br>16. **Proposal P1:** "Changed since saved".<br>17. **Proposal P2:** a one-time note that tabs are kept in this browser.<br>18. **Proposal P3:** on Cube Store, a button that inserts a SELECT of `information_schema.tables`. |
| 18 | [18-mcp-access-tokens.html](18-mcp-access-tokens.html) | R78 · AC-430, AC-431, AC-433, AC-435, AC-440 … AC-445, AC-468 … AC-479 · with AC-251 … AC-254, AC-294 … AC-296 · rules 1, 3, 17, 59, 67, 82, 83, 85 | **Screen 1: Access tokens, Wren's own page** (pins 1–12): under Your account, from the account menu; New token; the groups a token uses; each working token's name, scopes, made, expires and last used; scopes as text tags; Revoke; No longer working; shown once, kept unusable; the server URL; how to connect Claude Code; what a token can and can't do; the limits.<br>**Screen 2: New token** (pins 1–6): a name; Read, always included; Workspace edit and Proposals and jobs; 7, 30 or 90 days, 30 to start; it acts as you; Create token.<br>**Screen 3: the token, shown once** (pins 1–7): what was made; only now; the token and Copy; the Claude Code command, filled in; Claude.ai and Claude Desktop; Done; the new row, behind.<br>**Screen 4: Security › Access tokens, as a Super-Admin** (pins 1–9): the fourth tab; filters; owner first; the same fields; Revoke on any row; never the text; the revoke dialog naming owner and token; what the owner will see; Revoke token.<br>**States:**<br>• **A** (AC-430, AC-470, AC-479, AC-252, AC-254): the account menu for anyone and for a Super-Admin; the single-user chip; Not found at `/security/tokens`; a read-only user's scopes.<br>• **B** (AC-430, AC-468, AC-469): no name, a name in use; 90 days; making it fails.<br>• **C** (AC-430): copied; closing without copying; afterwards.<br>• **D** (AC-430, AC-431, AC-468): empty; loading and error; every state.<br>• **E** (AC-431, AC-435): revoking your own; the toast; what the client sees.<br>• **F** (AC-470): one user's; no longer working; none match.<br>• **G** (AC-444, AC-445, AC-476): Claude Code; Claude.ai and Claude Desktop; no MCP host set.<br>• **H** (AC-479): sign-in off.<br>• **I** (AC-442, AC-478): Token made, MCP call, an MCP-marked proposal, Token revoked.<br>• **J:** narrower windows.<br>Then: keyboard and accessibility; every state as an icon and a label. | 1. **Where tokens live:** "Access tokens" in the account menu (and the single-user chip's), at `/account/tokens`, for every signed-in user.<br>2. **The list:** name, scopes, made, expires (with time left), last used; Revoke; no part of the text, ever.<br>3. **New token:** a 520 px dialog with a name, the three scopes with Read locked on, and 7 / 30 / 90 days with 30 chosen.<br>4. **Shown once:** the token with Copy, the warning, the Claude Code command, the connector steps, and Done.<br>5. **Revoke:** confirmed, immediate, no Undo; the toast.<br>6. **Security › Access tokens:** every user's tokens for Super-Admins, filters, Revoke, never the text.<br>7. **How to connect:** the server URL, Claude Code's command, Claude.ai and Claude Desktop's custom connector, what a token can and can't do, and the limits.<br>8. **The audit events:** Token made, Token revoked, MCP call, and the MCP mark on events caused through MCP.<br>9. **Proposal P1:** "Show its calls" in Security › Access tokens.<br>10. **Proposal P2:** the Claude Code command with the new token in it. |

## Questions for you

Each is drawn one way so the design is complete. The way drawn is only a default until you decide.

### Design 17, the SQL runner workspace

- **17-Q1. Below 1,024 px.** direction §2 makes the app view-only there, but the runner has no view mode.
  - Drawn: (a) both side panes fold to 40 px rails that open over the centre, and the editor stays usable.
  - (b) A message that SQL runner needs a window at least 1,024 px wide, with Saved and History still readable.
  - (c) View-only: Saved and History readable, no editor.
- **17-Q2. The "Cube" group: one entry, or one per folder's model?**
  - Drawn: (a) one entry, "Cubes and views you may query", with each cube's folder shown in the browser.
  - (b) One entry per folder whose model the person may query.
- **17-Q3. Do R78-12's keys reach the page?** A browser or an operating system may keep Ctrl+Q for itself, and some keyboard layouts type [ and ] with a key that sends Ctrl+Alt. Nothing in `docs/research/` covers this yet.
  - Drawn: (a) the keys as approved, with a research doc checking each supported browser, operating system and the enterprise's keyboard layouts before planning. A conflict found comes back to you.
  - (b) Approve a second binding now, used only where research finds a conflict.
- **17-Q4. A History row whose data source the person can no longer use.** AC-381 lists each run with its data source and folder; principle 6 and rule 100 say an unavailable source isn't named.
  - Drawn: (a) the row stays, reading "A data source no longer available to you", and opens with no source chosen.
  - (b) The row keeps naming its source, as AC-381 reads.
  - (c) The row is hidden while access is lost (AC-381 would need amending).
- **17-Q5. Choosing another data source for a tab that has a result.**
  - Drawn: (a) it changes at once; the SQL stays, the result clears, its runs stay in History.
  - (b) Ask first when a result would be cleared.
- **17-Q6. A tab's state on the tab itself.**
  - Drawn: (a) an icon on the tab; the label in its tooltip and accessible name (as AC-450 names), and in full in the result head and History.
  - (b) An icon and a short label on each tab, at the cost of fewer tabs in view.
- **17-Q7. Where Make a cube's "Folder it is to go to" starts.**
  - Drawn: (a) the data source's own folder when the person may write there (a workspace source's target), otherwise empty.
  - (b) Always empty.
- **17-Q8. How many tabs may be open at once.**
  - Drawn: (a) no limit; the tab strip scrolls.
  - (b) A limit, with "+" disabled and the reason at the limit. The number would be yours.
- **17-Q9. Make a cube's Kind and Cube type for a measure.** AC-462 names "a cube type proposed from the database's type", but a Cube measure takes an aggregation.
  - Drawn: (a) numeric columns other than the key start as measures with `sum`, chosen from Cube's measure types; the rest start as dimensions with string, number, time or boolean.
  - (b) Every column starts as a dimension; measures are added later in Model.
  - (c) As (a), but numeric columns start as dimensions too.

### Design 18, personal access tokens

- **18-Q1. Expired and revoked tokens in the owner's list.**
  - Drawn: (a) under "No longer working", with the state, when, and who revoked, and Remove (the audit keeps the record).
  - (b) Dropped from the list when they stop working.
  - (c) Kept as long as audit records are, with no Remove.
- **18-Q2. A token's name.**
  - Drawn: (a) required, at most 100 characters, unlike the owner's other working tokens (as R78-15 does for saved queries).
  - (b) Required only; duplicates allowed.
- **18-Q3. Closing the shown-once dialog before copying.**
  - Drawn: (a) asks first.
  - (b) Closes without asking.
- **18-Q4. What the owner is told when a Super-Admin revokes their token.**
  - Drawn: (a) "Revoked · by ‹Super-Admin›, ‹date›" in their No longer working.
  - (b) The same, but "by a Super-Admin", unnamed.
  - (c) Also a notice on their next visit (wechart sends no email today).
- **18-Q5. How many working tokens one person may have.**
  - Drawn: (a) no limit.
  - (b) A limit, with New token disabled and the reason at the limit. The number would be yours.
- **18-Q6. A deployment whose Helm values name no MCP host.** AC-476 covers only a named host.
  - Drawn: the help warns that Claude.ai and Claude Desktop can't reach wechart and an administrator sets the host. Open: (a1) `/mcp` is then served on the web app's host, for Claude Code inside the network and for development; or (a2) no MCP at all until a host is named.
- **18-Q7. The exact Claude.ai and Claude Desktop custom-connector steps.** The research records that these connectors call from Anthropic's cloud and accept "fixed credentials such as API keys that Claude sends on every request", but not the form's fields or how the credential is sent.
  - Drawn: (a) generic steps and a link to Anthropic's guide; a research doc on the connector form before build, which also confirms the token arrives as `Authorization: Bearer` (AC-435).
  - (b) Only the link.
- **18-Q8. May an owner see their own token's recent calls?** The audit trail is Super-Admins' only.
  - Drawn: (a) no, Last used only.
  - (b) A "Recent calls" list per token for its owner, from the same audit records.
- **18-Q9. Renaming a token.**
  - Drawn: (a) not offered.
  - (b) Rename, recorded in the audit trail.
- **18-Q10. A read-only user's scopes.** They have no My workspace, and AC-297 shows them no Jobs.
  - Drawn: (a) Workspace edit and Proposals and jobs shown disabled, with the reason.
  - (b) Left out for read-only users.

### For direction.md

- **D-Q1. Checklist rules for the token pages.** references-sql-runner.md gave rules only for the SQL runner, so rules 90–108 cover design 17 alone. Design 18's behaviour is held by its ACs (AC-430, AC-468 … AC-470).
  - (a) Add rules for design 18 once it's approved (shown once, never the text, Read locked, 7 / 30 / 90, Revoke confirmed with no Undo).
  - (b) None: the ACs suffice.
- **D-Q2. The copilot's proposed rules 90–106** (references-copilot.md) now collide with 90–108 here. When the copilot is taken up, they would be renumbered from 109.

## Decided 2026-10-17

The user approved both designs: "Approve with defaults (Recommended)" (R78 in `docs/requirements-log.md`). Three questions were asked on their own; every other question takes the way its design draws it.

**Design 17**
- **17-Q1:** (a), drawn. Below 1,024 px both side panes fold to 40 px rails that open over the centre; the editor stays usable.
- **17-Q2:** (a), drawn. One "Cube" group entry, "Cubes and views you may query", each cube's folder shown in the browser.
- **17-Q3:** asked. "Research first (Recommended)": R78-12's keys are built only after `docs/research/keyboard-shortcuts-sql-runner.md` checks each supported browser, operating system and keyboard layout; a conflict found comes back to the user.
- **17-Q4:** (a), drawn. A History row whose data source is no longer available reads "A data source no longer available to you" and opens with no source chosen (AC-381 amended).
- **17-Q5:** (a), drawn. Choosing another data source changes it at once; the SQL stays, the result clears, its runs stay in History.
- **17-Q6:** (a), drawn. An icon on the tab; its label in the tooltip and accessible name, and in full in the result head and History.
- **17-Q7:** (a), drawn. Make a cube's folder starts at the data source's own folder when the user may write there, otherwise empty (AC-462 amended).
- **17-Q8:** (a), drawn. No limit on open tabs; the tab strip scrolls.
- **17-Q9:** asked. "Numbers as sum measures (Recommended)", option (a): numeric columns other than the key start as `sum` measures; the rest as dimensions typed string, number, time or boolean (AC-462 amended).

**Design 18**
- **18-Q1:** (a), drawn. Expired and revoked tokens sit under "No longer working", with the state, when and who revoked, and Remove; the audit keeps the record (AC-431 amended).
- **18-Q2:** (a), drawn. A token's name is required, at most 100 characters, unlike the owner's other working tokens (AC-430 amended).
- **18-Q3:** (a), drawn. Closing the shown-once dialog before copying asks first (AC-430 amended).
- **18-Q4:** (a), drawn. "Revoked · by ‹Super-Admin›, ‹date›", the Super-Admin named (AC-431 amended).
- **18-Q5:** (a), drawn. No limit on working tokens.
- **18-Q6:** asked. "MCP off (Recommended)", option (a2): with no MCP host in the Helm values, nothing is served at `/mcp`, and the token pages say MCP isn't set up (AC-476 amended).
- **18-Q7:** (a), drawn, but moot while Claude.ai and Claude Desktop are deferred (AC-445 retired). The token pages show Claude Code only.
- **18-Q8:** (a), drawn. No per-token call list for the owner; Last used only.
- **18-Q9:** (a), drawn. No rename.
- **18-Q10:** (a), drawn. A read-only user sees Workspace edit and Proposals and jobs disabled, with the reason (AC-469 amended).

**Not settled by this answer**
- The proposals, 17-P1 ("Changed since saved"), 17-P2 (the one-time note that tabs are kept in this browser), 17-P3 (Cube Store's insert of `information_schema.tables`), 18-P1 ("Show its calls") and 18-P2 (the Claude Code command with the new token in it). The answer didn't name them, as R33's "Approve all with proposals" did, and no criterion holds them, so they are not planned.
- D-Q1 and D-Q2, which are direction.md's, not the designs'.

## Design 19, the compact dashboard header (approved 2026-10-17)

**Approved 2026-10-17** by the user: "Approve (Recommended)", with three questions answered on their own (R79 in `docs/requirements-log.md`). See "Decided 2026-10-17, design 19" at the end.

Added on 2026-10-17, after designs 17 and 18 were approved, for the user's request in `docs/inputs/2026-10-17-compact-dashboard-header.md`: "nearly 30% of the page goes away for the dashboard header and the filters. Can we have a more compressed header that can be expanded with a slide down so that the complete header can be seen... default will be the compressed header." It isn't covered by the approval of 17 and 18 above.

- **Format:** the same as designs 17 and 18: self-contained HTML in direction.md's tokens, with two 1,440 × 900 screens with pins and notes, states A–I, then keyboard and accessibility, the criteria it changes, and the questions.
- **Where it comes from:**
  - the study in `docs/design/references-compact-header.md` (Power BI, Looker, Superset, Metabase and Tableau; Spotfire's pages didn't load, so it isn't covered);
  - today's CSS in `packages/web/src/shell/styles.ts` and the header in `dashboard/edit/EditChrome.tsx` and `DashboardView.tsx`;
  - the designs it changes: 2026-09-24 design 04, and 2026-09-27 design 04 states E and F; design 13's ⋯; decision dashboard-Q2.
- **Measured today:** app bar 48, header 128, page tabs 45 and filter bar 53, so **274 px of chrome: 30.4 % of 1,440 × 900, 38.1 % of 1,280 × 720**. Compact, it is **96 px (10.7 % / 13.3 %), 178 px less**. Expanded, it is 205 px (22.8 % / 28.5 %), still 69 px less than today.
- **Rendering:** not opened in a browser. The Chrome tools didn't respond in this session, as for designs 17 and 18, so a pin may sit a few pixels off. Every height above is computed from the CSS, not taken from the drawing.
- **Keyboard:** no new shortcut (R75). The toggle is a button (Tab, then Enter or Space). Esc closes the sheet under rule 85, only with focus in the header.
- **Tokens:** no new colour, type size or weight; the 12 px floor and the 400 and 600 weights hold. The motion takes Fluent 2's `durationNormal` and `durationFast` and its decelerate and accelerate curves. The highlight's 2 s is wechart's own choice (Q6).

| # | File | Addresses | What it shows | You are asked to approve |
|---|---|---|---|---|
| 19 | [19-compact-dashboard-header.html](19-compact-dashboard-header.html) | The user's request of 2026-10-17 · changes AC-196, AC-200, AC-119, AC-352, AC-343 · holds AC-098, AC-195, AC-206, AC-207, AC-176, AC-187, AC-304 · rules 1, 3, 13, 14, 17, 40, 50, 72, 85 | **Screen 1: compact, the default** (pins 1–8): the way back in one step; the title at `text-lg`; page tabs inline; compact marking chips; the actions as today; the Filters toggle with its count, last; the 48 px fixed row; the 178 px gained.<br>**Screen 2: expanded** (pins 1–8): the pressed toggle; the description; the ownership line; today's filter bar; it stays open while a filter is changed; the full chips; it pushes the tiles; the motion.<br>**States:**<br>• **A:** the heights, today, compact and expanded, at 1,440 × 900 and 1,280 × 720, and in My workspace, with no description, and with wrapping filters.<br>• **B** (AC-113, AC-119, AC-121, AC-200): a filter changed while collapsed: Filter to marked, the toggle's tooltip, a cross-filter, a bookmark applied, each with its announcement.<br>• **C** (AC-053, AC-056, AC-206): edit mode, the sheet open and no toggle.<br>• **D** (AC-304): 1,152 px; 390 px collapsed, expanded, and its ⋯.<br>• **E:** no filters ("Details").<br>• **F:** many filters.<br>• **G:** a long title.<br>• **H:** no description.<br>• **I:** focus and motion.<br>Then: keyboard and accessibility; every state as an icon and a label; the criteria and the questions. | 1. **One 48 px row by default:** "← ‹folder›", the title, the page tabs, the compact marking or cross-filter chips, the actions, and the Filters toggle with its count.<br>2. **The expanded sheet:** the description, the ownership line and today's filter bar, unchanged, pushing the tiles down.<br>3. **Closing:** the toggle, or Esc with focus in the header, innermost first, ahead of the dashboard's own Esc.<br>4. **Motion:** 200 ms opening, 150 ms closing, height only; none with reduced motion.<br>5. **Feedback while collapsed:** the count or chip changes, a 2 s highlight, one polite announcement.<br>6. **Persistence:** for the visit; every opening starts compact.<br>7. **Edit mode:** the sheet open, no toggle.<br>8. **Narrow widths** as drawn in D.<br>9. **The amendments** to AC-196, AC-200, AC-119, AC-352 and AC-343. |

### Questions for you, design 19

Each is drawn one way, the recommended one, listed first. The way drawn is only a default until you decide.

- **19-Q1. Does the expanded sheet push the tiles or cover them?**
  - Drawn: (a) it pushes them down, as Tableau's show/hide containers do; the top KPIs stay in view while a filter changes, and nothing needs a scrim or a click-outside rule.
  - (b) It slides over the tiles with a shadow and closes on a click outside.
- **19-Q2. Is the open or closed choice remembered?**
  - Drawn: (a) for the visit only, across page tabs, bookmarks and edit mode; every opening starts compact, as the user asked. Superset stores nothing either.
  - (b) Per person per dashboard, in this browser.
  - (c) Per person, for every dashboard.
  - (d) A per-dashboard default set by its author in Settings › Layout, as Power BI and Looker do.
- **19-Q3. Edit mode.**
  - Drawn: (a) the sheet is open and the toggle gone while editing; leaving edit mode restores the reader's state.
  - (b) The toggle stays while editing, starting as the reader left it.
- **19-Q4. The title's size in the compact row.**
  - Drawn: (a) `text-lg` 20/26/600, §3's page title.
  - (b) Keep `text-xl` 24/32, within the same 48 px row, with less room for the title before it's cut short.
- **19-Q5. Page tabs that don't fit, in view mode.**
  - Drawn: (a) inline, then "More ▾" with the rest, the open page always visible.
  - (b) The strip scrolls, as in edit mode today.
  - (c) Always a "Page: ‹name› ▾" menu button.
- **19-Q6. Feedback when a filter changes while collapsed.**
  - Drawn: (a) the count or chip changes, the toggle is highlighted for 2 s, and the change is announced politely.
  - (b) As (a), and the sheet opens by itself when a filter is added from a tile.
  - (c) The text and the announcement only, no highlight.
- **19-Q7. Many filters in the open sheet.**
  - Drawn: (a) the bar wraps as today, and the sheet grows with it.
  - (b) The sheet keeps to a set number of rows, with "Show all filters". The number would be yours.
- **19-Q8. The My workspace band above the header.**
  - Drawn: (a) unchanged, as rule 72 requires.
  - (b) Folded into the compact row as a "My workspace" chip with its person icon, saving 32 px (rule 72 amended).
- **19-Q9. The breadcrumb.**
  - Drawn: (a) one step, "← ‹folder›", with the whole path in its name and tooltip and in the ownership line. AC-195 holds as written.
  - (b) The whole path inline before the title, cut short from the left.
- **19-Q10. How the sheet closes.**
  - Drawn: (a) its toggle, or Esc with focus in the header.
  - (b) Also a click on the tiles, though that click marks or cross-filters too.
- **19-D. Checklist rules.** `references-compact-header.md` §4 proposes six rules. Once design 19 is approved, they are numbered after whatever the copilot's rules take (D-Q2).

### Decided 2026-10-17, design 19

The user approved design 19: "Approve (Recommended)" (R79 in `docs/requirements-log.md`). Three questions were asked on their own; every other question takes the way the design draws it, option (a). The spec's F43 (AC-484 … AC-496) and the amended AC-196, AC-200, AC-119, AC-352 and AC-343 hold it.

- **19-Q1:** asked. "Push down (Recommended)": the sheet pushes the tiles down and never covers them.
- **19-Q2:** asked. "No, always start compact (Recommended)": the choice lasts the visit only, across page tabs, bookmarks, refreshes and edit mode; every opening starts compact; nothing is stored.
- **19-Q3:** (a), drawn. In edit mode the sheet is open and the toggle gone; leaving edit mode restores the reader's state.
- **19-Q4:** (a), drawn. The title is `text-lg` 20/26/600 in the compact row.
- **19-Q5:** (a), drawn. In view mode, page tabs that don't fit go behind "More ▾", the open page always inline; in edit mode the strip scrolls, as built.
- **19-Q6:** asked. "Highlight + announce (Recommended)": the count or a compact chip changes, the count is highlighted for 2 s, and the change is announced once, politely; the sheet never opens by itself.
- **19-Q7:** (a), drawn. Many filters wrap in the open sheet, which grows with them.
- **19-Q8:** (a), drawn. The My workspace band above the header is unchanged (rule 72).
- **19-Q9:** (a), drawn. A one-step "← ‹folder›", the whole path in its name and tooltip and in the ownership line. AC-195 holds as written.
- **19-Q10:** (a), drawn. The sheet closes with its toggle, or Esc with focus in the header; a click on the tiles doesn't close it.
- **19-D:** the six rules are direction.md's rules 109–114, with §7g holding the tokens. The copilot's proposed rules are still unnumbered (D-Q2); they will follow, from 115.
