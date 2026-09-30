# Designs for approval — UI design 2026-09-30 (phase 2)

One static mockup for R48, deleting, clearing and finding (F39, AC-362 … AC-370). It is numbered after design 13 in `../../2026-09-28/designs/index.md`.

- **Format:** the same as the 2026-09-27 and 2026-09-28 designs. It's a self-contained HTML file with inline CSS in direction.md's tokens, and Inter and IBM Plex Mono from Google Fonts, with no other requests. Open it in a browser. It shows:
  - two 1440 × 900 screens with numbered pins, each followed by the notes on its pins;
  - states A–I, one letter per criterion from AC-362 to AC-370;
  - the keyboard and accessibility rules;
  - the proposals and questions.
- **Where it comes from:** R48 and §P2.6 I in `docs/requirements.md`, F39 in `docs/spec.md`, and the approved designs it builds on:
  - 04: Explore's rows and menus, My workspace, and the Edit in my workspace dialog;
  - 05: proposal states;
  - 06 (2026-09-24): Delete in the chart page's ⋯;
  - 13: the dashboard header's ⋯.

  It changes as little as it can of what's built (`ExplorePage`, `FolderContents`, `EditInWorkspaceDialog`, `LibraryChartPage`, `SourceSettings`, `ModelFilePage`), and reuses `ProposeDialog`'s counter and the Delete-section dialog's destructive button.
- **Illustrative content:** people, folders, dashboards, cubes, versions and counts are illustrative.
- **Build note (A–D):** each delete dialog first asks the server which dependents it may name and how many it may only count. That read answers what the delete's own `409` would, and the delete keeps its own check (T517–T520).
- **Proposals:** anything beyond AC-362 … AC-370 is listed as **Proposals (not in the spec)** in the file and below. The states don't depend on them.

| # | File | Addresses | What it shows | You are asked to approve |
|---|---|---|---|---|
| 14 | [14-deleting-clearing-finding.html](14-deleting-clearing-finding.html) | R48 · AC-362 … AC-370 (AC-023 retired) · with AC-017, AC-019, AC-192 … AC-195, AC-263, AC-269, AC-275, AC-278, AC-279, AC-284, AC-291, AC-322 · rules 1, 3, 17, 67, 68, 69, 71, 72, 73, 75, 79, 85 | **Screen 1: Explore,** a shared folder as a read-write member sees it:<br>• the folder's description under its name, with Edit;<br>• a Show filter over the contents: All · Dashboards and charts · Data sources · Models;<br>• subfolders always listed;<br>• Delete… at the end of every item row's ⋯;<br>• Delete… on an empty folder's row, and none on one that holds something (with the reasoning, from the references, for leaving it out rather than greying it);<br>• a ⋯ for model rows.<br>**Screen 2: a library chart's Delete refused.** Delete chart… moves into the header's ⋯ (design 06, pin 5). The "Can't delete" dialog lists the dashboards you may see, each with its folder and as a link, including your own draft, then "…and 2 more in folders you can't see", with Close alone.<br>**States:**<br>• **A** (AC-362): checking first; only hidden dashboards; the confirmation once unused; a dashboard taking it up in between; deleted.<br>• **B** (AC-363): the dashboard row's ⋯, the header's ⋯, and a confirmation naming its own charts and every bookmark as going, and library charts as staying.<br>• **C** (AC-364): the data source's header ⋯, and the refusal as Cube · Model · Folder, with the unseen count and how to free it; then the confirmation.<br>• **D** (AC-365): the model row's ⋯ and the model page's ⋯. The refusal is grouped as views that use the cube, cubes that join to it, charts bound to it, and dashboards bound to it. A cube taken out of its file has its save refused in the same words.<br>• **E** (AC-366): the two folder menus side by side; an empty folder's header ⋯; the confirmation; the refusal when it's no longer empty, saying what it holds.<br>• **F** (AC-367): Clear My workspace… in My workspace's header ⋯, and its confirmation with the counts by kind and each open proposal it withdraws; then the result.<br>• **G** (AC-368): the dialog's new line, "Into a new folder in My workspace: project-2026-09-30-1430". My workspace then shows `-1430`, `-1430-2`, and a new item with no project folder. The project folder opens with its prefilled description, and a direct copy's toast names its folder.<br>• **H** (AC-369): Add a description; editing in place with the "n / 1,000" counter; over the limit; a reader's view with More.<br>• **I** (AC-370): Models in EMEA, and Data sources in a folder with none: the subfolders are still listed, with "No data sources in this folder." and Show all, and the tree is unchanged. | 1. **Delete… last in each item's ⋯,** after a divider, in the error ink, for those who may change the folder; no key deletes from the list.<br>2. **A check before either dialog;** "Can't delete" (Close only) when something depends on it, otherwise a confirmation (Cancel focused, a filled destructive button).<br>3. **The refusal's content:** what you may see, each with its folder or file, as a link opening in a new tab, grouped by kind for a cube; "…and *n* more in folders you can't see"; one line on what to do.<br>4. **No Delete, rather than a greyed-out one,** on a folder that holds something, and a header ⋯ only when it has something to hold.<br>5. **Delete chart… in the chart page's header ⋯,** and the details pane's Delete section removed.<br>6. **Clear My workspace… in My workspace's header ⋯,** offered only while it holds something, with the counts by kind, each open proposal and "Nothing outside My workspace changes".<br>7. **The project folder's line in Edit in my workspace,** and its name taken from the minute Copy and edit is pressed.<br>8. **The description edited in place** under the name, with Edit beside it, clamped to two lines with More.<br>9. **The Show filter** as a segmented radio group on its own row above the list, subfolders always listed, hidden during a search.<br>10. **Proposal P1 (not in the spec):** a folder row's second line shows its description.<br>11. **Proposal P2 (not in the spec):** the kind kept in the address, and while opening subfolders.<br>12. **Proposal P3 (not in the spec):** every delete and every clear recorded in the audit trail. |

## Questions for you

Each is drawn one way so the design is complete. The way drawn is only a default until you decide.

- **Q1. Someone else's draft dashboard using a shared chart.** Does it block the chart's delete? The person deleting can't see it or remove it.
  - Drawn: it blocks, and it's counted with "…in folders you can't see", as AC-362 says "a dashboard".
- **Q2. One workspace item with an open proposal.** AC-367 covers clearing the whole workspace, but not deleting a single item that has an open proposal.
  - Not drawn. The options are to withdraw the proposal and name it in the confirmation, as Clear does, or to refuse until it's withdrawn.
- **Q3. Readers and the kind filter.** A reader lists only subfolders and dashboards (rule 68, AC-263).
  - Drawn: no filter for readers.
- **Q4. Permanent deletes.** Nothing in the spec restores a deleted item.
  - Drawn: every confirmation ends "You can't undo this."
