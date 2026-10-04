# Design status: the 2026-09-24 and 2026-09-27 reviews

R37 (the user, 2026-09-27) asks for every design in both reviews to be built. Where two designs differ, the 2026-09-27 one wins. An item blocked by a decision, by xcube, or by wechart work not yet built goes to `docs/phase-2/backlog.md` §6, and the rest is built. Each design is deployed to docker-desktop once it is finished.

This file is the tracker. A design is **Complete** when everything in it that isn't held back is built, tested, and deployed.

**States:**
- **Complete:** built and deployed; anything left is held back in backlog §6.
- **In progress:** being built now.
- **Partly built:** some of it built; what's left is named, with its task.
- **Held back:** nothing buildable until what it waits on lands (backlog §6).

The 2026-09-27 inventory of both reviews, item by item, is the source for "left": every pin, state and approve item, checked against the code and tasks.

## 2026-09-27 (phase 2)

| # | Design | State | Built by | Left to build | Held back (backlog §6) | Deployed |
|---|---|---|---|---|---|---|
| 11 | Generate cubes | **Complete** | T485, T488–T491 | — | Proposal 5, "in My workspace" (T492, waits on T342 and T347) | 8ef30f1, 2026-09-27 |
| 12 | Model overview | **Complete** | T479, T484, T486, T493, T495 | — | — | 8ef30f1, 2026-09-27 |
| 13 | Dashboard export and import (2026-09-28, approved R46) | Built, with sign-in on | T511 (Export: the pane, dependencies with what uses each, the hidden count, outlines, one JSON file without secrets); T512 (reading and refusing a file); T513 (Import into My workspace: File, Target, Review with warnings); T514 (its data sources: map, or create with a passing test; the name clash; the driver warning) | "Open my draft" (pin 20); image tiles' images in the file | Models in an import (T347, T350); with sign-in off, creating a data source (T359) | a162220 (T511, T512), 2026-09-28 |
| 01 | New data source wizard | **Complete** | T471, T472, T490, T496, T462 (the list's names open their page) | — | Checks ticking one by one (xcube); vendor logos (decision) | 55aa7c1, 2026-09-27 |
| 02 | Driver forms | Partly built | T471, T497 (a target change asks for the secret again; the link icon) | Ask before replacing Access (T473); My workspace first (T498) | — | — |
| 03 | Data source settings | **Complete** | T462 (the page: head, line, the five tabs read-only, Edit in my workspace, Discard my copy); T497 (changing it: rename, the Connection form, stored secrets never drawn, Test to save, leaving with changes); T499 (Usage's Model column, Description, the bar asking before leaving) | — | History and version line (proposal chain); Propose (T358); the scheduled-check row (decision) | 26b6b82, 2026-09-27 |
| 07 | Access panel | Built, but for state F | T330; T473 (pins 1–9: Access with its lock, pressed; the path title; help lines, state J's for read-write; Add group per list with the AD group combobox and its two suggestion groups; Adding and Removing with Keep; the audit note, Cancel and Save _n_ changes; states A–E and G) | — | The panel with sign-in off (decision) | T473, 2026-10-04 |
| 09 | Sign-in and roles | Partly built | T317–T321 | The switcher by role (T331, with T342); the signed-out, sign-in-failed and no-groups pages; the single-user chip replacing the avatar; Owner by name; no access anywhere | Reviews (proposal chain) | — |
| 04 | My workspace | In progress | T345, T346, T498 (first in the tree, the band, origin and target, Draft, the footnote) | T348's states D–F and H; T331's states C, G and I; the New menu's target tree with a filter (states A and B), Folder "no target", row actions | Statuses past Draft and Propose (proposal chain); Model in New and model copies (T437 → T347); search named for its place (a decision: AC-019's search is global) | — |
| 10 | Jobs, Schedules, bookmarks, cube picker | Partly built | T239, T366, T429 | Schedules' columns (T377); bookmark sharing (T367); the docked Jobs pane (T469) | The Folder column and filter (T340 → T371); Recent builds (AC-150; xcube for worker builds); the cube picker (T342 → T475) | — |
| 08 | Security and audit trail | **Complete** | T241; T368 (the records); T370 (retention); T500 (Super-Admins only, the tabs, Policies reworded); T369 (the audit trail's page: four filters as chips, in the address; newest first, a page at a time; the inspector; the retention); T438 (Preview as groups: chips, the presets, what they reach by path, the dashboard to preview, the banner); T474 (the trail's error with Details; the spec's checks for every role) | — | Tiles a previewed group doesn't reach, refused by xcube's folder gate (T437 → T436); the Folder filter as a tree picker (a list of paths for now); state E's banner wording and one reach list (for the user; T474's note) | 59a2634, 2026-09-28 |
| 05 | Proposals and reviews | In progress | T349 (proposing, API); T351 (deciders); T352 (approval landing, with versions); T353 (rejection and withdrawal, API); T355 (state C, the Reviews control and its count; state D, the Reviews page; state E, My proposals); T358 (states A, B, F and M: the Propose dialog from a workspace row, the waiting and rejected band on the author's dashboard, chart and data source, Dismiss); T356 (the review view: the main screen, states H–K, changed and new tiles marked) | Test connection on proposed settings (state H) and Fit / Actual size; the single user (T359); the publish check at approval (T451, state L) | Models bundled with a dashboard, and their YAML diff (state G) (T350: T437 → T347) | — |
| 06 | History and restore | Built, for dashboards and charts | T354 (the last 10 kept; the API; restore as a draft to propose); T357 (pins 1–8, states A, C, E, F: History in the item's header, the 360 px panel in the address, View, Propose restoring…) | A data source's History and restore (T515, state D); a chart's View, and its panel in the address | A model's Compare with current (state B; T347) | — |

## 2026-09-24 (phase 1)

| # | Design | State | Built by | Left to build | Held back (backlog §6) | Deployed |
|---|---|---|---|---|---|---|
| 03 | Model workspace | **Complete** | T470, T479–T487, T493, T494 | — | "Hide" rather than "Edit in form anyway"; below 1,024 px (decisions). The top bar is 2026-09-27 design 09's. | bf31889, 2026-09-27 |
| 08 | Chart context menu | Partly built | T266–T273, T387, T402, T404 | Ctrl+M and Ctrl+Shift+M; "Find a dimension" in Drill by; Copy link with marks in Copy ›; the marked share on the remaining chart types (T453) | .xlsx export; "Keep as details tile" (decisions) | — |
| 01 | Chart editor inspector | Partly built | T257, T310, T403, T429 | The inspector as drawn: badges, the type card with quick picks, Recommended with a reason and Use, the aggregation menu, the Why checklist, the status line, "not drawn" and its offers (T467), joined cubes | The cube picker follows 2026-09-27 design 10 (T475) | — |
| 02 | Results drawer | Partly built | T257, T304 | 240 px open and resizable; counts and the dot on its tabs; rows and ms, Copy, Download CSV; swatches; the rollup note in the badge; Cube query's JSON/SQL switch; the collapsed strip | Underlying rows by drill members (proposal); "Open in Model" (T342) | — |
| 04 | Dashboard view | Partly built | T252, T300, T305, T464 | The badge's relative time (T477); the table tile's row count; UX-023 (T467); the header, reconciled with 2026-09-27 design 04 state E | Coarser default grain (proposal) | — |
| 05 | Dashboard settings | Partly built | T249, T466 | The mode cards' illustrations, gestures as keycaps, and "Manage markings ›" links | — | — |
| 06 | Chart page | Partly built | T463 | Naming the drawn form; the single KPI at `text-kpi-solo`; the row count; Lives on / Used in with the picker, and ⋯ with Delete, both reconciled with 2026-09-27 design 04 (no in-place edits) | — | — |
| 07 | Schedules | Partly built | T160, T466 | As written, Next run, and the link to the pre-aggregation itself (T377). The table's columns follow 2026-09-27 design 10 state A. | Last build and Builds (AC-150); the owner filter, detail pane and five runs, which 2026-09-27 design 10 drops | — |

## Order

These come first, and each is deployed when it is finished:
1. The Model workspace: 03, then 11 and 12.
2. The data sources: 01, 02, then 03.
3. The rest of 2026-09-27: 07, 09, 04, 10, 08.
4. The rest of 2026-09-24: 08, 01, 02, 04, 05, 06, 07.
