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
| 01 | New data source wizard | **Complete** | T471, T472, T490, T496 | — (the list's "open it and choose Edit in my workspace" comes with T462) | Checks ticking one by one (xcube); vendor logos (decision) | pending |
| 02 | Driver forms | Partly built | T471 | Ask before replacing Access (T473); My workspace first (T348); a target change clears the secret, and the link icon (T462) | — | — |
| 03 | Data source settings | Not built | — | The settings page (T462) | History and version line (proposal chain); the scheduled-check row (decision) | — |
| 07 | Access panel | Partly built | T330 | T473 | The audit note (T368); the panel with sign-in off (decision) | — |
| 09 | Sign-in and roles | Partly built | T317–T321 | The switcher by role (T331, with T342); the signed-out, sign-in-failed and no-groups pages; the single-user chip replacing the avatar; Owner by name; no access anywhere | Reviews (proposal chain) | — |
| 04 | My workspace | Partly built | T345, T346 | T348 and T331's parts; the target tree with a filter; search named for its place | Statuses and Propose (proposal chain); models (T437 → T347) | — |
| 10 | Jobs, Schedules, bookmarks, cube picker | Partly built | T239, T366, T429 | Schedules' columns (T377); bookmark sharing (T367); the docked Jobs pane (T469) | The Folder column and filter (T340 → T371); Recent builds (AC-150; xcube for worker builds); the cube picker (T342 → T475) | — |
| 08 | Security and audit trail | Partly built | T241 | The Not found gate; Policies reworded; Preview as groups' chips, banner and picker | The audit trail (T368 → T369); enforced reach (T437 → T436 → T438) | — |
| 05 | Proposals and reviews | Held back | — | — | All of it (proposal chain; T437 → T347 for bundles) | — |
| 06 | History and restore | Held back | — | — | All of it (proposal chain) | — |

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
