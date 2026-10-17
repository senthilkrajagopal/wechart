# Designs for approval — UI design 2026-10-17 (phase 2, R78)

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
