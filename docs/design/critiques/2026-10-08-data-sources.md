# Data sources critique (2026-10-08, T406)

**What this covers.** AC-343:
- the Data sources list;
- the new data source wizard (2026-09-27 design 01) and the driver forms (02);
- a data source's settings page and its tabs (03);
- the SQL runner with the runner off (2026-10-01 design 15, approved R51);
- the History panel on a data source (06).

**How it was judged.** From captures of the running app at 1,440 × 900 with sign-in on as a Super-Admin, plus the list, single-user and empty, at 390 px.

**Summary.** 23 findings (2 major, 17 minor, 4 polish) and 6 questions for the user.

**Captures that failed are not app faults.**
- The capture script looked for tabs named "History", "Used by" and "Overview". Neither the app nor design 03 has them.
- The single-user stack had no data source to open.

## Findings

| # | Sev. | Surface / pin | Design | App | Covered? |
|---|---|---|---|---|---|
| SRC-01 | minor (rule 1) | Section headings and step numbers: wizard, driver forms, settings editor | `.sect > h3` 12/16/600 uppercase (01:147, 02:122, 03:117); `.step i` 12 (01:150) | Every `connection-form__legend` is **11 px** ("Which database?", "Where it connects", "How it signs in", "TLS", "Test to save"); `source-pane__step` 11 px; "Checks Cube runs" 12 px in the same panel | no (same as MOD-01) |
| SRC-02 | **major** | A workspace copy's page: Propose (03 pin 3; 15 state I) | "Propose to Sales / EMEA…" as the head's primary, disabled with unsaved changes and saying why on hover | Only "Discard my copy…"; no Propose (`SourceSettings.tsx`) apart from a rejected band's "Propose again…" | Held back in backlog §6(c) until the proposal chain landed. That chain is done (T349–T358 `[x]`), so it is now unblocked. |
| SRC-03 | minor | The version line (03 state A) | "Version 3 · approved 24 Sep by Ada Admin"; the copy's line reads only "Copied from … · version 3", then Target, then health | On a shared item, "Version 1" alone. On the copy, "Copied from Shared › … · version 1", "Target: Shared", then "Version 1" again. | The same backlog §6(c) entry, now unblocked |
| SRC-04 | minor | The head and foot's `.btn` buttons | `.btn` 32, 14, padding 0 12 (03:69); History a `.btn`; ⋯ a 32 px `.iconbtn` (15:424) | "Discard my copy…" and "Discard changes" 24 px with padding 1 6, the browser's default; "Generate cubes…" 24; History `btn-sm` 24/12; ⋯ 30 × 24. Three heights in one head. | CMP-01, CMP-02 |
| SRC-05 | polish | Icons | History `i-hist`, Edit `i-pencil` (03:289); the SQL tab `i-sql`; "Turn on the SQL runner…" `i-shield` (15); Back and Next as `i-back` and `i-chev` (01:283) | None of the first four; the wizard uses text "‹" and "›" | no |
| SRC-06 | minor | The head's badges | Access `.badge`: 22 px, bg-subtle, no border, 12/400, with `i-eye`; driver `.badge.line`: 12/400 with a border-strong outline (03:95–97, 290) | "Read-only · in Shared" outlined, 12/**600**, 20 px, no eye; the driver badge 12/600, 20 px | no |
| SRC-07 | minor | The page's frame | A white `.pagehead` band holding the crumbs, title and meta, with the tabs edge to edge across its foot (03:126, 200); state A's meta on two lines (03:290–291) | Crumbs, head and line on the page ground; the tabs inside a bordered, rounded card; one meta line | no |
| SRC-08 | minor | The Connection editor's layout | TYPE as its own section with a 220 px locked field and its help to the right; rows at most 680 px with Port 110; the segment 320 px; the TLS switches side by side with "Add a CA certificate" (03:85, 205–225) | "Type" a field label; the field 420 px with its help below; Host 870, Port 96, others 978; the segment 978; the switches stacked | no |
| SRC-09 | minor | Test to save (03:202–242) | 420 px on bg-surface; `.chk` rows at least 30 px; "Not run" as `s-pend` (a dashed circle; the clock is for "Skipped"); Test connection as wide as its text | 380 px on bg-subtle; rows 36–37; "Not run" as the clock (`connectionTest.tsx` maps `not-run` to `idle`); Test connection the panel's full 347 px | The checks ticking one by one is backlog §6(b); this isn't |
| SRC-10 | minor | The save bar | `.formbar` pinned across the screen's foot: padding 10 24, a top border, bg-surface (03:135, 247) | A rounded card under the tab card at [24,866,1392,54], ending at y 920 in a 900 px window, so Save is cut off | no |
| SRC-11 | minor | The stored secret and link buttons | `.input.stored` 32 px, bg-subtle, border-subtle, radius 4 (03:80); link buttons `.btn.link` **12**/600 (01:90) | "Kept from Shared · encrypted" 42 px, transparent, border-strong, radius 6; Replace, Change type and Add a CA certificate at **14**/600 in 28 px boxes | T476 Q5 |
| SRC-12 | minor | The wizard's head | `.pane-head` at least 44 px, padding 8 8 8 16; Close a 32 px `.iconbtn` with `i-x`; "in My workspace" with `i-person` (01:141, 252; rule 72) | 53 px, padding 12 16; a 28 px "×" glyph; a "◉" | T476 Q5 (the button); MOD-02 is the same pane |
| SRC-13 | polish | The wizard's step rail | Equal `flex:1` separators; steps not reached in text-muted (01:149, 153) | Separators about 12, 57 and 12 px; every step not current in text-secondary | no |
| SRC-14 | minor | The driver mark, chosen-type bar and tiles | `.mono-tile` 32 px; `.ctx` 12/16 on bg-page, the name 12 px strong; tiles bordered border-strong (01:154–160) | The mark 28; the bar on bg-subtle with the name 14/600, 61 px tall; tiles border-subtle | no |
| SRC-15 | minor | "Sign in with" segment | `.seg span` 28 + 1, so 30 outside, at 12 (01:104; 02:86; 03:87) | 32 outside, each option 30 | T476 Q5 |
| SRC-16 | minor | "+ Data source" while the wizard is open (01 main screen) | Enabled primary with the accent ring, marking the control that opened the pane (01:230) | Disabled and faded (`DataSourcesPage.tsx:75`) | no |
| SRC-17 | polish | The list's filter row and links | The search with `i-search`; table links with no underline (01:135, 236) | No icon; Folder links underlined | no |
| SRC-18 | minor | Page notes (`InfoBar`) | `.notebar` 12/16 (01:124, 231; 03:103; also design 08's, SEC-14) | `.info-bar` 14/20, on every page | T466 unified the bar; its size was never recorded |
| SRC-19 | minor | In Cube's status line (03:399) | "Cube uses these settings · version 4 · 2 instances" on one line | "Cube uses these settings", then "2 Cube instances reported within the hour" at 14 px; no version | no |
| SRC-20 | minor (§3 weights) | The SQL tab with the runner off (15) | `.offpanel h2` 16/600 with `s-off`; the login in the code face; `.kv` with a 110 px label column at 12/16 (15:136, 213, 279, 430–431) | h2 **700**; the idle clock (`SqlRunner.tsx:220`; an `off` kind exists); the login plain; a 180 px label column with 14/20 values | no |
| SRC-21 | minor | "Who could run SQL" (15 pin 1) | "…read-write members of Sales / EMEA: `sales-emea-rw`", naming the folder's own read-write groups | "Super-Admins, and read-write members of Shared", with no groups | no |
| SRC-22 | **major** | A data source's History panel (06 main screen, state D) | A full-height docked 360 px pane listing the versions newest first, "Current" tagged, the limit note pinned at its foot (06:180–193) | A 360 × **102** card at the top right with only its head and the limit note; no version row, though the page says "Version 1". `HistoryPanel.tsx` draws an empty list without comment. Whether the empty list comes from how the capture made the source needs checking before a fix. | status.md row 06 lists "A data source's History and restore (T515, state D)" as left to build, but T515 is `[x]`; no open task |
| SRC-23 | polish | The 390 px top bar | Design 09's chip on one line | "Single-user / mode" wraps | CMP-07 |

## Measured and passing

- **Rule 1** (except SRC-01): labels are 12/600; "· required" is 12/400; tabs, table text and status text are 12. Tables use tabular figures.
- **Rule 2:** every colour measured maps to a token that passes AA.
- **Rule 3:** every state checked pairs an icon with a label.
- **Rule 17:** inputs are 32/14, and identifiers 32/12 in the code face (T476 Q1/Q2). Filter pills are 28/12. Rows are 34 and tabs 36.
- **Rules 23 and 35:** there's no override. Save is disabled with "No unsaved changes". "Name comes after a passing test." Next is disabled until a type is chosen.
- **Rules 70–74:** the shared page reads "Explore / Shared / …", read-only. "Edit in my workspace" is its primary. The band appears with the person icon. A copy says "Copied from …" with its Target. The wizard picks its target with `TargetTree`.
- **Rules 83 and 84:** secrets read "Stored · encrypted" and "Kept from Shared · encrypted". The list's columns match.
- **Design 01:**
  - a 480 px docked pane with its foot pinned;
  - steps Type → Connection → Test → Name and target;
  - eight tiles in AC-160's order;
  - three groups, 32 × 18 switches, and the secrets line said once;
  - Back, Cancel and "Next: Test", in the design's words.
- **Design 03:**
  - tabs General, Connection, Test history, Usage, In Cube, and SQL (design 15);
  - state A's read-only rows;
  - state E's columns;
  - Usage's note;
  - In Cube's table and footnote.
- **Design 15:** P1's off panel and "Only Super-Admins see this button."; P5's Cube Store switch in the list's ⋯.
- **Not captured, but built in the source:**
  - the wizard's states B–L;
  - design 02's other drivers;
  - design 03's states B, C, D and I;
  - design 15's screen 1 and states A–J;
  - Cube Store's listing.
- **Recorded decisions, not findings:**
  - vendor logos (§6(a));
  - checks ticking one by one (§6(b));
  - the health check row (§6(a));
  - state H's refusal never naming the folder (R71 item 6);
  - no rename once landed (R71 item 3);
  - "Generate cubes…" in the head (R57);
  - Delete in ⋯ (design 14).

## Questions for the user

1. **Table cell padding.** Designs 01 and 03 draw `td` and `th` at 0 10. direction §4 says 8 px inline, and the app uses 8. (Design 08 is the same question, `2026-10-08-security-reviews.md` Q3.)
   - (a) Follow the designs: 10.
   - (b) Follow direction: 8.
2. **"Used by" when no cube uses a source.** The design is silent. references.md surface 10 says "*n* cubes". The app shows "No cube".
   - (a) "No cubes".
   - (b) "0 cubes".
   - (c) "—".
3. **The list with no data sources at all.** The design is silent. The app shows an info bar, "No data source has been added yet.", with "+ Data source" in the head.
   - (a) Keep it as built.
   - (b) direction §6's empty state.
   - (c) The sentence with "+ Data source" inline.
4. **Bold inside notes.** The designs' `<b>` renders at 700, and so does the app's. direction §3 allows only 400 and 600.
   - (a) 600.
   - (b) Keep 700.
5. **A History panel with no earlier versions.** Design 06 is silent.
   - (a) Always list the current version, tagged Current.
   - (b) Say "No earlier versions yet."
6. **The settings page's item mark.** Designs 03 and 15 draw "◍" at 28 px. Design 01 draws the driver monogram in the wizard. The app uses the monogram ("Pg") in both.
   - (a) "◍" on the settings page.
   - (b) The monogram everywhere.

## Suggested grouping

| Group | Findings | ACs |
|---|---|---|
| Propose and the version line on a copy, now unblocked; update backlog §6(c) and status.md rows 03 and 06 | SRC-02, SRC-03 | AC-284, AC-343 |
| Headings and step numbers at 12 (with MOD-01) | SRC-01 | AC-187, rule 1 |
| The button and control sizes T476 left (with CMP-01, CMP-02) | SRC-04, SRC-11, SRC-12's ✕, SRC-15 | AC-187 |
| The settings page as design 03 draws it | SRC-06, SRC-07, SRC-08, SRC-09, SRC-10, SRC-19 | AC-343 |
| The wizard's chrome as design 01 draws it | SRC-12, SRC-13, SRC-14, SRC-16; SRC-05's glyphs | AC-343 |
| The SQL tab's off panel as design 15 draws it | SRC-20, SRC-21; SRC-05's SQL icons | AC-343, AC-374 |
| A data source's History panel | SRC-22; Q5 | AC-289, AC-343 |
| The list's filter row, and notes at 12/16 everywhere | SRC-17, SRC-18 | AC-187 |
