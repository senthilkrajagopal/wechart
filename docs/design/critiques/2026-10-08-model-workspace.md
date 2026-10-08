# Model workspace critique (2026-10-08, T406)

**What this covers.** AC-344: the Model overview (design 12), a model file's editor and its tree (2026-09-24 design 03), New cube (2026-09-27 design 04, state A), and Generate cubes (design 11).

**How it was judged.**
- Every value comes from captures of the running app at 1,440 × 900, 1,024 × 768 and 390 × 844: Playwright screenshots, plus each visible element's box and computed styles. No live browser was used.
- Every file capture is of a shared, read-only file. The captures can't show an editable file's head states (Discard, Save), and they can't show Pre-aggs: the capture script looked for the tab name "Pre-aggregations", and the tab is named "Pre-aggs 0".
- Earlier critique: `2026-09-27-model-workspace.md` (MW-01…MW-26). Fourteen of its findings are closed on the captures. Four are partly open: MW-01, MW-03 and MW-25 have residuals here, and MW-05's editable head isn't captured. Eight more aren't captured, but the source shows them built.

**Summary.** 7 findings (1 major, 4 minor, 2 polish) and 4 questions for the user. Question 2 decides whether eight more differences count as findings. At the coordinator's direction they are recorded in backlog §6(a) with their reasons (option (b)), and wait there on the user.
- MOD-04 is raised as a finding, unlike the calls under Q2, because T494's wrap contradicts design 12's own note 3 rather than a value the design left open.
- D5 is counted as recorded because design 12, which is later, draws the same 12 px.

## The coordinator's named differences

| Difference | Design | App | Reason recorded |
|---|---|---|---|
| 12 px badges | design 03 `.mbadge` 11/16/600 (03:111) | `.model-member__badge` 12/16/600 | **Yes:** D5 (tasks.md, the T470 block). Design 12, which is later (R37), draws `.tag` at 12 px and cites D5. direction.md sets a 12 px floor. Not a finding. |
| Head without `model/` | "model/cubes/orders.yml" (03:178; design 12, state E) | "cubes/orders.yml", 13/600 mono | tasks.md only (T479, T494: the head shows the path as the URL names it, AC-002). No R-decision, no backlog entry. **Q2** |
| Format as a text field | `.select.sm` "(not set)" (03:206) | `<input type="text">` (`form/ObjectForm.tsx:427–443`) | tasks.md only (T494: Cube also takes d3 specifiers). **Q2** |
| Tab strip spacing | `.tabs` padding 0 8 with a 2 px gap; `.tb` padding 0 9 (03:98–99) | tablist padding 8, gap 0; each tab padding 0 8. The last tab ends 29 px short of the strip's edge. At the design's spacing the eight tabs would overflow by 1 px. | tasks.md only (T470). **Q2** |
| 676:524 split | the drawn grid is `240px 676px 524px` (03:87); note 8 says "1.15 fr : 1 fr" (03:294), which gives 642:558 | 676:524 (`styles.ts`, model-editor grid) | Matches the drawing. The design disagrees with itself. T470 recorded that the tabs don't fit at 642. **Q2** |
| T451's read-only "Edit in my workspace" | no design draws it | measured under Q1 | **Q1** |
| "Hide", and the stacked editor below 1,024 px | — | — | **Covered:** backlog §6(a). Not raised again. From 1,024 to 1,279 px the "Form \| YAML" switch is built (T487). Design 03 is drawn at 1,440 only. |

## Findings

**MOD-01 · minor · Generate cubes: section titles and step numbers are 11 px** (design 11, state A, pins 1–2)
- **Design:** `.sect > h3` is 12/16/600, uppercase, text-secondary (11:143). `.step i` is 12/600 (11:146). Design 01 is the same (01:147, 150). direction.md: no text below 12 px.
- **App:** the "Data source" and "Schema" h3s are 11/16/600 (`.connection-form__legend`, `font-size: 11px`). The step numbers 1–3 are 11 px.
- **Covered already?** No. The classes are shared with the data source wizard, so the fix lands there too.

**MOD-02 · minor · Generate cubes: the pane head is 53 px and its ✕ is 28 px** (design 11, pins 1 and 11)
- **Design:** `.pane-head` min-height 44, padding 5/8/5/16, h2 16/22/600 (11:136–137). Design 01's head is also 44. The ✕ is a 32 × 32 `.iconbtn` with the x icon (11:74, 310). `.sect` padding 14.
- **App:** `header.source-pane__head` is 53 px (padding 12/16, h2 16/24). `button.source-pane__close` is 28 × 28 and draws the text glyph "×" at 20 px. The body starts 16 px in.
- **Covered already?** The ✕ is T476 Q5 ("buttons in a pane's head or foot follow the surface's latest design"). The head's height is not covered.

**MOD-03 · polish · Generate cubes: radio buttons are the browser's 13 px** (design 11, state A)
- **Design:** `.radio` 16 × 16, accent-filled when chosen (11:167–168).
- **App:** the inputs are 13 × 13. Their colour is already the accent (T476 step 1).

**MOD-04 · minor · Tree: the Jinja row wraps its tag under the name** (design 12, pin 3, note 3)
- **Design:** one 28 px row. The name is `.fn` with an ellipsis, and the tag sits at the end with `margin-left: auto` (12:121–125, 203). Note 3: "At 240 px the name truncates to make room, with the full name in its tooltip."
- **App:** `templated_example.yml`'s row is 44 px. The "Jinja" tag drops to a second line, which pushes "model/views/" down 16 px.
- **Covered already?** No. T494 chose to wrap marks under the name. That is a build call, not a recorded decision, and it contradicts the note.

**MOD-05 · minor · Overview: the Jinja row's Kind is plain text, not the tag** (design 12, pin 9)
- **Design:** `.tag`, 12/16/600, text-secondary, 1 px border-strong, radius 3, padding 0 5, bg-surface, with a 12 px lock: "Jinja template · read-only" (12:107, 233).
- **App:** `span.model-overview__code`, 12/400/20, no border, no fill. The words match.

**MOD-06 · polish · Overview: frame insets and column widths** (design 12, main screen and state B)
- **Design:** `.ov` padding 16/24: the title row at y 64, the notebar at 108, the card at 154 (12:130, 251). Columns 232/92/168/88/80/60/74/80/rest (12:220). The empty card's `.empty` padding is 28/24 (12:134).
- **App:** the title row is at y 72 (padding `--wc-surface-padding`), the InfoBar at 110, the table at 161. The title row is 26 px tall with no "+ New" (read-only). The th widths are 210/48/130/85/73/47/70/75/410. The empty card's title sits 25 px below the card's top.

**MOD-07 · major · New cube in My workspace: the target picker isn't design 04's** (2026-09-27 design 04, states A and B; note 5)
- **Design:**
  - a 520 px dialog with padding 20 and gap 14;
  - "Name · required" and "Target folder · required";
  - the target as a tree of full paths (`.ptree`, 28 px `.prow` rows, folder icons), preselected when there is one folder;
  - the help line "Only folders where you have read-write access.";
  - a note naming the chosen folder in bold (04:125–131, 262–271).
- **App:** `NewItemDialog`, 520 px with padding 16. No required marks. The target is a native `select` reading "Choose a folder…". No help line. The note says "…until you propose it to this folder." Create is disabled, with no reason given.
- **Covered already?** status.md row 04 lists "the New menu's target tree with a filter (states A and B)" as left to build, but no open task builds it. T345's list-not-tree call predates design 04's approval. The dialog is shared with Explore's New menu (see `2026-10-08-explore-access-signin.md`).

## Questions for the user

**Q1 · A shared model file, read-only, with "Edit in my workspace" (T451): no design draws it.**
- **App, the file:**
  - the path;
  - a "Read-only · in Shared" pill (999 px radius, 1 px border, no fill, 12/600, eye);
  - a 24 px primary `btn-sm` "Edit in my workspace" with a pencil;
  - ⋯ (Delete, design 14 D1);
  - no head state, and no Discard or Save.
- **App, the overview:** the same pill where "+ New ▾" would be, and the InfoBar "Open a row to read its file." (design 12: "…to edit its file.").
- **Nearest design:** 2026-09-27 design 03, state A (data source settings):
  - History, then a 32 px primary "Edit in my workspace" in the title row;
  - the badge on a meta line under the title: a 22 px `.badge` (bg-subtle fill, no border, 12/400 text-secondary, eye), then "Version n · approved …".
- **Options:**
  - (a) keep it as built;
  - (b) carry state A's badge and button into the model's head and the overview;
  - (c) have a design drawn.

**Q2 · Do tasks.md's "left as built" calls count as AC-352/AC-344's "recorded decision"?**
- **The calls, recorded only in tasks.md:**
  - the head without `model/`;
  - Format as a text field;
  - the tab strip at 8/0;
  - the 676:524 split (design 03's drawing and its note 8 disagree);
  - "Checked against Cube's rules as you type" for "Checked with Cube's validator on every change";
  - code at 12/16 for design 03's 12/19 (direction §3 says 12/16);
  - Refresh as a titled group, the time zone's wording and Title's placeholder;
  - Description with no placeholder.
- **Options:**
  - (a) accept them as recorded decisions;
  - (b) record them in requirements or backlog §6(a);
  - (c) treat each as a finding and build the design's value. For Format, that is a select, which can't hold a d3 specifier.

**Q3 · The colour of "All published".**
- Design 03 draws the label green (`.status.ok`).
- Designs 11 and 12, which are later, draw `.status.ok.q`: the label text-secondary and only the icon green.
- The app's label is green (`#1d7a3f`).
- Options: a green label, or a text-secondary label with a green icon.

**Q4 · Comment lines tinted at rest.**
- Design 03's main screen tints YAML lines 19–22 while the bar shows.
- The app tints them only after "Show in YAML" (T482).
- Note 9's reason ("the comment the form would drop") no longer holds since T482, when the form began to keep comments.
- Options:
  - tint at rest, as drawn;
  - tint on Show only, as built;
  - decide it together with backlog §6(a)'s "Hide".

## Measured and passing
- **Rule 1:** every measured text node in the editor, tree and overview is at least 12 px (the path is 13, D1). Generate is the exception (MOD-01).
- **Contrast:** `#5c5b57` on white is about 6.5. "All published" green is 5.37. The accent on accent-soft is 4.90. White on the accent is 5.71.
- **Rule 17:**
  - tree and folder rows 28;
  - overview header 28 and rows 34;
  - Generate's source rows 34 and schema rows 28;
  - editor controls 28/12.
- **Design 12, state B:** the empty model's tree, foot and card match.
- **Design 11, the docked pane:**
  - 480 px with a rail and three steps;
  - Generate pressed in the tree;
  - the foot's reason, Cancel and one primary;
  - "in My workspace" (R36 item 5).
- **R58:** "Pop out" is in the YAML head.
- **Not captured, built per the source:**
  - design 12's states A, C, D and F;
  - Generate's steps 2 and 3, states B–P;
  - MW-12, MW-16 to MW-19 and MW-21 to MW-24.
