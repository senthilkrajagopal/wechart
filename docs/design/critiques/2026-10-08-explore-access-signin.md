# Explore, My workspace, History, Access and sign-in critique (2026-10-08, T406)

**What this covers.** AC-343:
- Explore and My workspace (2026-09-27 design 04; 2026-09-30 design 14, approved R49);
- an item's History panel (2026-09-27 design 06);
- the Access panel (design 07);
- sign-in and roles (design 09): the account menu, the single-user chip, and the signed-out page.

**How it was judged.**
- Captures of the running app at 1,440 × 900 with sign-in off, and with sign-in on as a Super-Admin; Explore also at 390 px.
- Not captured, and judged from the source instead: the New item dialog, the row menus of dashboards and drafts, History's rows, the single user's menu, and the sign-in-failed and no-groups pages.

**Summary.** 27 findings (6 major, 17 minor, 4 polish) and 8 questions for the user.

**status.md is stale.** T331, T348, T498, T515 and T473 are all ticked, so this critique raises status.md's "left to build" items that have no open task as findings.

## Findings

| # | Sev. | Surface / pin | Design | App | Covered? |
|---|---|---|---|---|---|
| EXP-01 | minor | Explore's spacing (14 screen 1) | main padding 14 24, gap 8; description 4 px under the head (margin-top -4); the Show row 12 px under what's above it and 8 px over the card; crumbs 8 px over the head; the workspace band 14 px over the crumbs (14:305–309; 04:200) | padding 16, gap 12: crumbs→head 12, Show→table 12, band→crumbs 12, head→description 8 | **Fixed by T741** (the coordinator's call on `design-conformance.spec.ts:942`, re-based on design 14 with it) |
| EXP-02 | minor | The Show segment (14 pin 3) | "The control is 28 px": `.seg span` 26 with a 1 px border each side; the chosen segment accent-soft | 30 tall; the chosen segment `color-mix(accent 12%)` | T476 Q4 (Show is drawn as design 14 draws it) |
| EXP-03 | minor | Item names in the list (04, 14) | `.nm .strong` 14/20/600; model and data-source names `strong mono` 13 px, IBM Plex Mono (14:319–320; direction §3, tables 14/20) | Inter 12/16/600 for every kind | no |
| EXP-04 | minor | The tree (04 pin 1; 07, 09, 14) | `.tree-head` 16/600; `.trow` 14 | "Folders" 14/20/600; rows 12/16 | Q2: direction §3 lists tree rows under 12/16 |
| EXP-05 | minor | My workspace with sign-in off (04 pin 1; rule 72) | The first root, the person icon on role-dim-soft, then a divider | Last, "◉", no divider. With sign-in on, it is first with the person icon and the divider, as drawn. | T498's overturnable call; Q3 |
| EXP-06 | **major** | The New menu in My workspace (04 pin 5; 13 state G) | 250 px: the head "New in My workspace"; Dashboard, Chart, Model, Data source; a divider; Folder "no target"; a divider; "Import a dashboard…" "from a file" (13:816–826) | 220 px; no head; Dashboard, Chart, Model, Data source, Folder; one divider; Import; Folder without "no target" | no |
| EXP-07 | minor | Menus (04, 13, 14) | `.mi` 30 px at 14 (04:119; direction §3 menus 14); Import on one line in 250 px | `menu-button__item` 28 at 12; "Import a dashboard…" wraps and its aside runs past the menu's foot; menus 220 px against 250, 196 and 170 drawn | T476 Q5 deferred menus to T406 |
| EXP-08 | **major** | New dashboard or chart: the target (04 states A, B; not captured) | "Target folder · required" as a tree of full paths, preselected with one; "Only folders where you have read-write access."; the note naming the folder; past about ten folders, a filter box with "4 of 23 folders…" | `NewItemDialog.tsx`: a native select, "Choose a folder…", no "· required", no help line, no filter; the note "…until you propose it to this folder." | T345's list of paths predates design 04's approval; same as MOD-07 |
| EXP-09 | **major** | Row menus for dashboards, charts and drafts (14 B1; 04 pin 7; source) | A shared dashboard's row: Open; Open my copy or Edit in my workspace; History; Export…; divider; Rename; Move to…; divider; Delete…. A draft's row: "Propose to Sales / EMEA…" first, then Open, Rename, Delete; a waiting item "View proposal". | Rename, Move to…, Propose…, Export…, divider, Delete…; no Open, Edit in my workspace or Open my copy, History, or View proposal; Propose… doesn't name its target. The model row (Open, Delete…) matches 14 D1. | no |
| EXP-10 | minor | Owner (14 screen 1) | Folder rows "—"; model and data-source rows by author ("Ada Admin") | Folder rows "admin"; model rows "—" | no |
| EXP-11 | minor | A shared folder's footnote (14; 04 C) | `p.xs.sec`, text-secondary | text-muted | no |
| EXP-12 | minor | An empty folder's row (14 E2, F3, I2) | `td.one.empty`: a 34 px row at 14 px, secondary, left-aligned | 120 px tall, centred, 12/20 (phase-1 F24, F25) | no decision; the words pass |
| EXP-13 | minor | Access, closed (04 C, I; 14) | `btn ghost sm` with the lock, as Rename; pressed `btn sm pressed` (07:179) | White with a border-strong outline when closed; pressed matches | no |
| EXP-14 | minor | The folder head with Access open (07 main) | One row: name, chip, Rename, Access pressed, spacer, New at the right | 66 px tall: the search and New drop to a second row on the left | Q5 |
| EXP-15 | minor | Workspace rows (04 pin 3; not captured) | `td` 44 px: the name over its origin and target line | One line at 34 px (T498's note) | no open task |
| EXP-16 | minor | The single-user chip and its menu (09 state B) | `.chipwarn` 28, padding 0 10, 12/600 in the warn colour, an open padlock outline, a chevron; the menu 320 px, padding 12, the bold heading "Sign-in is off", then "wechart runs as one user with every permission. Your proposals still wait for your approval in Reviews." at 14/20 | 143 × 32, a filled padlock, no chevron; the menu one sentence in 260 px | Q1 for the avatar; same as CMP-06 |
| EXP-17 | polish | The account button (09 pin 3) | `.acct` 36 tall, padding 0 8 0 4 | 32, padding 0 6 0 2 | no |
| EXP-18 | minor | The account menu (09 pins 4–6) | 280 px with a border-subtle edge; the identity `xs sec mono`; Super-Admin as `badge accent` (accent-soft, accent, 600, 22, shield); "Sign out" a 30 px `.mi` at 14 with its icon | 260 with border-strong; the identity Inter 12; the badge outlined, secondary, 20 px; "Sign out" 28 at 12, no icon | no |
| EXP-19 | **major** | Signing out (09 pin 6, state C) | wechart's own page: the 36 px mark, "You've signed out of wechart.", and a primary "Sign in again"; nothing of wechart behind it | Lands on Dex's "Log in to Your Account" form (the logout route redirects to the provider's end-session URL, `api/src/auth/routes.ts:299–320`) | status.md lists it; no task |
| EXP-20 | **major** | Sign-in failed, and no group list (09 D, E; not captured) | D: the mark, "wechart couldn't sign you in.", Details with the provider's text, "Try again". E: "Your sign-in worked, but no group list came with it." with "Sign out". | The callback answers JSON 400 `{error, detail}` (`routes.ts:239–245`); a missing groups claim gets no page | no |
| EXP-21 | minor | History's shape (06 pin 2) | A 360 px pane docked right, full height, a left border only; a head at least 44 px, padding 8 8 8 16, with a rule, h2 16/22 and a 32 px close; the limit note pinned at the foot over a rule (06:94–96, 180–192) | A 360 × 102 card with radius 8 and a border all round, inset 16; the head 24 px with no rule, h2 14, the close a "×" `btn-ghost btn-sm`; the note after the list | no |
| EXP-22 | **major** | History lists no version (06 pin 3) | The newest row tagged "Current", and "the header's version line says the same" | The dashboard reads "In Shared · version 1" and the data source "Version 1", but each panel has only its head and the note; `HistoryPanel.tsx` draws an empty list without a line | no; same as SRC-22; Q6 |
| EXP-23 | minor | The History button (06 pin 1; 04 E) | First, then Bookmarks, then Edit in my workspace; a `.btn` 32/14 with the clock; pressed accent-soft, accent border and ink, 600 | Bookmarks first; `btn-sm` 24 at 12; pressed on white at 400; no clock on a data source | same as DSH-05, CMP-02, CMP-03 |
| EXP-24 | minor | History's rows (06 pins 4–7; source) | Rows under a rule, padding 8 16; "Version n", Current, and the time at the right; "by author · approved by …"; the description 12/16 primary; "View · More · Propose restoring…" as link buttons | Bordered, rounded cards 8 px apart; the time on line 2; the description 13/18; View and Propose restoring… as bordered `btn-sm`, More apart | no |
| EXP-25 | polish | The Access panel's head (07 pin 2) | Min-height 44, padding 8 8 8 16 | 49 tall | no |
| EXP-26 | polish | The Type column (14; 04 C) | No colour class: text-primary | text-secondary (phase-1 N2) | no |
| EXP-27 | polish | A row's ⋯ (14) | `.iconbtn.sm` 24 × 24 | 30 × 24 | no |

**Covered elsewhere, so not findings:**
- The search's label: backlog §6(a), design 04 pin 6.
- Access with sign-in off: §6(a), design 07 F.
- Explore at 390 px: §6(a). The capture shows the tree keeping 260 px and the contents squeezed to 130, with the Show segments wrapping. That is input for that decision.

## Measured and passing

**The workspace band (04 pin 2):** 32 px, on bg-subtle, 12/16 text-secondary, with the right words.

**Explore (with 04 and 14)**
- My workspace's footnote has design 04's words.
- No header ⋯ on an empty workspace.
- With sign-in on, the tree puts My workspace first, with the person chip and its rules (pin 1, rule 72).
- The kind filter's labels and order (AC-370).
- "Add a description" is 12/16/600 in the accent, 8 px under the head (14 H1).
- The model row's ⋯ (14 D1).
- The shared footnote's words.

**The folder header with sign-in on:** the Super-Admin chip and "Only Super-Admins can see this folder" (04 I, 09 pin 7).

**The Access panel (07)**
- "Access" at 16/22 with the path.
- State C's warning bar and its words.
- "Not set here, and no folder above sets any."
- The read-write help line, as R56 words it.
- Add group in each list.
- The audit note, Cancel, and Save disabled.
- Access pressed while the panel is open.
- The folder stays in view beside it.

**The top bar (09)**
- The switcher has no Model (pin 1).
- Reviews comes after the search (pin 2).
- The account button has 28 px initials and the name at 12/600, hidden below 1,280 (pin 3).
- The menu's name is 14/20/600 (pin 4).

**History (06):** "History · last 10 versions" and its limit sentence (pin 8).

## Questions for the user

1. **The single user's avatar.** Design 09 state B and rule 59 put the "Single-user mode" chip in place of the account button. AC-190 asks for "an identity avatar at the far right". The app shows both.
   - (a) The chip only, amending AC-190 for sign-in off.
   - (b) The chip, then the avatar, as built.
2. **Tree text size.** Designs 04, 07, 09 and 14 draw rows at 14 px and the heading at 16. direction §3 lists tree rows at 12/16, and the app follows the prototype's 12 px.
   - (a) The designs.
   - (b) direction, as built.
3. **The tree with sign-in off.** Design 04 pin 1 and rule 72 put My workspace first. R52 says workspaces work as they do with sign-in on. T498 kept phase 1's order as an overturnable call.
   - (a) First, with the person icon and the divider, in both modes.
   - (b) As built.
4. **The kind filter in My workspace.** Design 14's My workspace frames draw no Show row, but state I says "over the open folder".
   - (a) Show it, as built.
   - (b) Hide it in My workspace.
5. **The folder header with a panel docked.** Design 07 draws the header with no search box. Design 14 draws the search, but with no panel open.
   - (a) Hide the search while a panel is docked.
   - (b) Keep it, and make room for New on the right some other way. The design is silent on how.
6. **An item with no kept version** (phase-1 content saved before proposals). Design 06 is silent.
   - (a) List the current version, tagged Current, as "before proposals". `HistoryPanel.tsx` already has the phrase.
   - (b) A line saying no version is kept yet.
7. ~~**A data source's History.**~~ *Settled by R37, not a question (T406's review):* design 14 C1 draws History inside the data source header's ⋯, but design 15 (2026-10-01), which is later, draws the head as History (`.btn`), "Edit in my workspace" and a 32 px ⋯ (15:424). History stays a header button, as design 06 and design 15 draw it.
8. **The access chip with sign-in off.** Design 09 pin 7 says "for every role", but no design draws sign-in off, and the app shows no chip there.
   - (a) "Super-Admin" for the single user.
   - (b) No chip.

## Suggested grouping

| Group | Findings | ACs |
|---|---|---|
| Explore's list and head as design 14 draws them; update `design-conformance.spec.ts:942` with it | EXP-01, 02, 03, 10, 11, 12, 26, 27 | AC-187, AC-369, AC-370 |
| The tree, after Q2 and Q3 | EXP-04, 05 | AC-187, AC-343 |
| Making things in My workspace (with MOD-07) | EXP-06, 08 | AC-192, AC-282, AC-343, AC-356 |
| Menus' item size and width, in every MenuButton | EXP-07 | AC-187 |
| Row menus by kind and place | EXP-09 | AC-278, AC-284, AC-289, AC-343 |
| Workspace rows on two lines | EXP-15 | AC-281, AC-343 |
| The Access head, after Q5 | EXP-13, 14, 25 | AC-259, AC-187 |
| The account menu and the single-user chip, after Q1 (with CMP-04 to CMP-07) | EXP-16, 17, 18 | AC-252, AC-254, AC-343 |
| The sign-in state pages | EXP-19, 20 | AC-253, AC-251, AC-343 |
| The History panel, after Q6 and Q7 (with SRC-22) | EXP-21, 22, 23, 24 | AC-289, AC-343 |
