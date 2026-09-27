# Model workspace critique (2026-09-27)

**Brief.** The user asked, verbatim: "Cleanup the models page.. add models page and generate cube page.. all of them are not in sync with the rest of the app and the ui design.. if required use an ui expert agent. take this as a priority." This critique covers four surfaces:
- the Model overview;
- a model file's editor;
- New cube and New view (the "add models page");
- Generate cubes (the "generate cube page").

## What I looked at, and how

**No live browser.** Chrome DevTools was not available (the MCP server was hung), so I made no live measurements and ran no interactions. I worked only from the Playwright captures of the running app at commit `a3ddbdb`, in `/private/tmp/claude-501/-Users-srajagopal-Work-wechart/390bc406-66bd-4e41-8657-c5005c38ab2c/scratchpad/mw-before/`:
- **Screenshots:** `01-overview`, `01b-overview-full`, `02-orders-general`, `03-orders-{dimensions,measures,joins,pre-aggregations}`, `04-orders-dimension-open`, `05-orders-measure-open`, `06-view-secured-orders`, `07-view-edit-drops-comments`, `08-monthly-orders`, `09-templated-readonly`, `10-new-cube`, `11-new-view`, `12`–`15b` Generate cubes, `16-dark-dimensions`, `17-narrow-1024` and `18-compare-data-sources`.
- **Sizes:** all are 1440×900 except `17`, which is 1024×768. **There is no 390×844 capture.**
- **Measured values:**
  - Values marked "measured" come from `measures.json`, which records Playwright's `getComputedStyle` and `getBoundingClientRect` results.
  - Values marked "read from the screenshot" are pixel positions, accurate to about ±2 px.
- **Source code:** read only to confirm structure, and marked "from source". The files were:
  - `packages/web/src/workspaces/model/`: `ModelFilePage.tsx`, `FileTree.tsx`, `FileList.tsx`, `GenerateCubes.tsx`, `form/CubeForm.tsx`, `form/ObjectForm.tsx` and `form/schema.ts`;
  - `packages/web/src/shell/styles.ts`.

**What I judged against, in this order:**
1. Design 03, `docs/design/reviews/2026-09-24/designs/03-model-workspace.html` (approved, R34): the main screen, notes 1–9, and states B and C.
2. `docs/design/reviews/2026-09-27/phase-1-recheck.md`: §2.7 (UX-070 … UX-079), cleanup items 49–57, and UX-106, UX-107 and UX-108.
3. `docs/design/direction.md`: §2–§5, §7b, §7d and the checklist.
4. The prototype: `docs/design/prototype/model.js` and `schema.js`.
5. Consistency with this week's rebuilds:
   - designs `2026-09-27/designs/01-new-data-source-wizard.html` and `02-driver-forms.html`;
   - T466's page and dialog frame.

Earlier critiques are cited where a finding repeats one of them (`critiques/2026-09-25-model-admin.md`, F- and N-numbers).

**Labels.**
- **Severity:** critical, major, minor or polish.
- **Category:** the re-check's classes: usability, aesthetics, consistency, accessibility and prototype-mismatch.
- **Proposal:** marks anything the references don't cover. It is kept apart from deviations.

**Summary.**
- **Findings:** 26 (MW-01 … MW-26).
- **By severity:** 0 critical, 7 major, 17 minor and 2 polish.
- **The seven majors:**
  - no upfront warning about comments (MW-07);
  - a flat General form (MW-08);
  - boxed member rows (MW-10);
  - an unguided expanded member (MW-12);
  - New cube writes a fake table name that can be published (MW-17);
  - Generate cubes is a modal whose size and position change at every step (MW-20);
  - Generate's clash state is plain text with no icon (MW-21).
- **Repeats:** most Model findings restate items that were already open on 2026-09-24/25 (F2, F4, F6, F9, F10, N1, N7, N8, N10 and N14).

### Decisions the user needs to make (the references conflict)

- **D1 · Size of the file path in the editor head.**
  - Design 03 asks for 13 px.
  - AC-231 fails when "a workspace page title is not 20 px at 600", and today the path is the page's `h1`.
  - 13 px is also off direction §3's type scale; §7d allows 13 px only on filter pills and page tabs.
  - The user needs to choose one of:
    - treat the path as a pane label, so AC-231 applies to the overview's "Model" title, and add 13 px to §7d;
    - or use 12/600 or 14/600 for the path.
  - Affects MW-05.
- **D2 · Save and Discard when nothing has changed.**
  - Design 03 draws both disabled.
  - Re-check item 54 says "Save hidden until there is a change".
  - I followed the design, because it ranks first.
  - Affects MW-05.
- **D3 · "xcube" in user-facing copy.** The Jinja page's note names xcube, the Cube fork's internal name.
  - Affects MW-16.
- **D4 · Generate into drafts or publish directly (proposal).** Should Generate create unpublished drafts in the tree, like New cube, instead of publishing directly? That changes the as-built flow (AC-136/AC-137).
  - Affects the Generate layout below.
- **D5 · Two items where design 03 sits under the 12 px floor, or contradicts as-built behaviour.** I propose 12 px throughout.
  - Its `.mbadge` and `.file .tag` are 11 px, which is below rule 1's floor.
  - Its Jinja tag tooltip reads "edit in YAML", but the file is read-only as built (AC-140, AC-332).

---

## Findings

### Model overview

#### MW-01 · minor · consistency, prototype-mismatch · Overview
- **Saw** (`01`; measured):
  - **Title and note (matching the frame):** the title "Model" is 20/26/600 at x 264, 24 px in from the pane's edge at 240. It sits over an InfoBar with the info icon (720×38, `#e3f0f4`). Both match T466.
  - **One card per file:** each file gets its own white card. The first measures 960×138, with a 1 px `#e3e2de` border, radius 6 and padding 12/16. Each card holds:
    - the path, as an underlined 13/600 mono link;
    - an uppercase "CUBE" tag;
    - member names as running text at 13 px (`.model-object__group`, from source).
  - **Below the fold:** five cards fill the 852 px pane, and the views are below the fold.
  - **Mismatched widths:** the note is 720 px wide and the cards are 960 px, so their right edges don't line up.
  - **No action in the title row:** New cube, New view and Generate cubes exist only in the tree head.
- **Asks:**
  - UX-079 and re-check item 57: "the overview as a table of files, or open the first file";
  - T466's frame (re-check cleanup item 1): "a 20/600 title row … primary action on the right";
  - direction §3 and §7d: 13 px is not on the scale;
  - AC-131: every object of every file is listed.
- **Fix:**
  - **Layout:** one card holding a grid table, per direction §4:
    - a 28 px `bg-subtle` header in 12/600;
    - 34 px rows with 12 px cells and tabular numerals.
  - **One row per cube or view**, with these columns:
    - **File:** mono, a link without an underline;
    - **Kind:** as text ("Cube", "View", or "Jinja template · read-only" with a lock icon);
    - **Name:** mono;
    - **Counts:** Dimensions, Measures, Joins, Pre-aggs and Segments;
    - **Members:** a truncating 12 px cell with the full list in a tooltip, so AC-131 still holds.
  - **Title row:** "Model" on the left, and a primary **+ New ▾** on the right (New cube, New view, Generate from a data source…).
  - **Widths:** the InfoBar and the card share one maximum width.

### Tree (every Model page)

#### MW-02 · minor · prototype-mismatch · Tree head
- **Saw** (`01`, `02`; measured tree head 239×97, padding 8/12):
  - The head reads "Files" (14/600) and holds New cube, New view and Generate cubes as three bordered 24 px `btn-sm`, wrapping onto two rows.
  - The head is 97 px tall, beside a 48 px editor head. So the first folder starts at y 153, while the form's tabs start at y 113.
  - Nothing shows the model's overall draft state.
  - This is 2026-09-25 N8, still open.
- **Asks:** design 03 note 1:
  - a 44 px pane head reading "Model", with "All published" or "2 unpublished";
  - New cube and New view under the tree.

  Re-check item 53 asks for the same buttons "in the pane head's overflow or as ghost buttons". Design 03 has no Generate control.
- **Fix:**
  - A 44 px head: `h2` "Model" at 14/600, plus the model's state ("✓ All published" or "◷ n unpublished") at 12 px, with icon and label.
  - After the last folder, a block inset 12 px holding "+ New cube" and "+ New view" as 24 px `btn-sm`, as design 03 draws them.
  - **Proposal** (the design is silent): "+ Generate from a data source…" joins them.

#### MW-03 · minor · prototype-mismatch · Tree rows
- **Saw** (`01`, `09`; measured):
  - **Folder labels:** `.model-tree__dir` "cubes/" and "views/" are 12/16 at weight 400 in `#5c5b57`, and only 16 px tall. They have no ▾ and no `model/` root.
  - **File rows:** 223×28, inset 8 px (x 8), radius 4. So the current file is an inset pill rather than a full-width row.
  - **No Jinja tag:** `templated_example.yml` has none.
  - This is 2026-09-25 N7.
- **Asks:**
  - design 03 note 1:
    - "▾ model/cubes/" as 28 px rows at 12/600 mono;
    - files in 28 px rows indented 28 px;
    - the current file as a full-width `accent-soft` row;
    - a Jinja tag;
  - checklist 17: tree rows are 28 px.
- **Fix:**
  - **Folder rows:** 28 px buttons with `aria-expanded`, "▾ model/cubes/" at 12/600 mono secondary.
  - **File rows:** indented 28 px, edge to edge with no radius; the current one at `accent-soft`/`accent` 600.
  - **Jinja files:** a 12 px "Jinja" tag with a lock icon and the tooltip "Jinja template · read-only here" (see D5).

#### MW-04 · polish · aesthetics · Tree focus on arrival
- **Saw** (`02`, `06`, `08`, `09`, `17`):
  - Opening a file by URL or from the overview draws a 2 px accent focus ring around the current row, over its fill. In `03`, after a tab click, the ring is gone.
  - **Cause:** `ModelFilePage.tsx:972–976` moves focus to the row on purpose (T234's review), and `:focus-visible` matches that programmatic focus.
  - This is 2026-09-25 N10.
- **Asks:** design 03 note 1 replaces "today a 2 px ring box" with the `accent-soft` row.
- **Fix:** keep moving focus there, for keyboard users. Draw the tree's focus indicator inside the row instead: `outline-offset: -2px`, radius 0, so it reads as the row's state.

### File editor

#### MW-05 · minor · prototype-mismatch · Editor head
- **Saw** (`02` and `10`; measured):
  - **Head and path:** the head is 48 px with padding 8/16. The path is `h1.workspace-title` at 20/26/600 in IBM Plex Mono.
  - **At rest:** only a pale, disabled "Save & reload Cube" (133×24, 12/600). There is no state and no Discard.
  - **After an edit** (`10`): "◷ Unpublished changes" (12/400 secondary), then Discard, then Save.
  - **New files:** a never-published file (`10`, `11`) says the same "Unpublished changes" as an edited one.
- **Asks:**
  - design 03 note 2:
    - a 44 px head;
    - a 13 px path;
    - "✓ Published · no changes" or "◷ Unpublished changes";
    - Discard and Save, both drawn disabled at rest;
  - design 03 state C: "New file · not published";
  - UX-076 and re-check item 54.

  D1 and D2 apply.
- **Fix:**
  - A 44 px head with padding 6/12, as the design draws it.
  - The path in mono at weight 600, at the size D1 settles.
  - "✓ Published · no changes" (ok icon, 12/400) at rest; "◷ New file · not published" for drafts.
  - Discard and Save as 24 px `btn-sm`, disabled at rest.

#### MW-06 · minor · usability · Form tabs
- **Saw** (measured):
  - **At 1440:** the tab strip's `scrollWidth` is 781 against a `clientWidth` of 666. "Access policy 0" is scrolled out of view, 115 px hidden (`02`).
  - **At 1024:** 781 against 423, and three tabs are hidden (`17`).
  - There is no fade, arrow or overflow menu.
  - The tabs' type and states otherwise match the design: 12/600, 36 px, `accent` with a 2 px underline, and counts in the muted weight.
  - This is UX-074 and 2026-09-25 N14.
- **Asks:** design 03 note 3: "Pre-aggs" and "Access", with all eight tabs fitting the 676 px pane (re-check item 52).
- **Fix:**
  - The short labels, keeping the full names as each tab's accessible name and tooltip.
  - When a narrow window still clips them, a "More ▾" tab that lists the clipped tabs with their counts.

#### MW-07 · major · prototype-mismatch, usability · Form over a file with comments
- **Saw:** three sample files have comments, and none gets a bar above the form or a mark in the YAML gutter. The form is fully editable in all three. `measures.json` for `07` records `warnbar: null`.
  - `orders.yml`: a four-line comment at YAML 19–22 (`02`, `03`).
  - `monthly_orders.yml`: comments at lines 2–7 (`08`).
  - `secured_orders.yml`: comments explaining its access policies. Lines 2–6, 18, 24 and 38 are visible in `06`; the brief counts eight.

  The only guard is the just-in-time LossWarning, which appears when an edit would drop a comment. That was not exercised (see "Not observable").
- **Asks:**
  - design 03 note 4: on opening such a file, a bar naming each comment by its first line and its YAML lines, with "Show in YAML" and "Edit in form anyway", keeping the just-in-time guard;
  - design 03 note 9: a warn icon in the gutter on commented lines;
  - direction §7b, the lossy round-trip warning;
  - checklist 20;
  - re-check item 49 and UX-070.
- **Fix:**
  - **The bar:** design 03's `.warnbar` under the tabs, with a warn icon, reading: "This file has 8 comments (YAML 2–6 "The sample's secured view (F19)…", 18, 24, 38, + n more). Editing in the form rewrites the YAML and drops them; they stay intact while you edit in YAML."
  - **Its buttons:** 24 px "Show in YAML" (scrolls to the comments and tints them) and "Edit in form anyway" (dismisses the bar for this file for the session; the just-in-time guard still fires).
  - **Scope:** the same for YAML anchors and aliases.

#### MW-08 · major · usability · General tab (cube and view)
- **Saw** (`02`, `08`, `10`; measured textarea 642×54 at 12/20 mono): the cube's General tab is one grid of equal fields in schema order:
  - Name;
  - SQL table (a 54 px textarea);
  - SQL (a second 54 px textarea);
  - Extends | Data source (free text);
  - SQL alias | Title;
  - Description | Public (a "(not set)/true/false/expression" select);
  - Meta (a 54 px textarea);
  - Calendar (a "(not set)" select);
  - a bordered "Refresh key" fieldset.

  Nothing is grouped or collapsed, and there are no help lines: `schema.ts` has no hint field, and a search for help or hint finds 0 matches.

  The view's General tab (`06`) puts View group | View groups in the main grid. Those keys are undocumented (data-modeling.md, Y.10), and the second has the placeholder "member, member". They sit above a "Legacy and undocumented keys" disclosure with the browser's ▶ marker.

  This is 2026-09-25 F9 and UX-073.
- **Asks:**
  - design 03 state B:
    - **Basics:**
      - Name, with help;
      - Data source, as a select with help;
      - "Reads from": a SQL table | SQL query segmented control plus one mono input, with the help "Cube accepts exactly one";
      - Title, with the placeholder "from the name";
      - the switch "Public · default on";
      - Description;
    - **▾ Refresh:** Every and Time zone;
    - **▸ Advanced** (collapsed): extends, sql_alias, calendar and meta;
  - every key stays reachable (checklist 26);
  - re-check item 51;
  - the prototype's `schema.js` groups (Basics, Advanced, Meta), each with hints;
  - direction §7b: reference fields are never free text.
- **Fix:**
  - **Layout:** as state B.
  - **Help lines:** taken from data-modeling.md Y.3, which says `sql_table` and `sql` are exclusive (exactly one) and that `public` defaults to true.
  - **Booleans and flags:** `.switch`es showing Cube's default. A "Use an expression" link reveals a mono input for expression values, so checklist 26 still holds.
  - **Data source:** a picker of the Data sources list.
  - **Views:**
    - Basics: Name, Title, Description and Public.
    - ▸ Advanced: Extends, Meta, View group(s) with a view-group placeholder, and the legacy keys, all under the same ▸ caret the member rows use.

#### MW-09 · minor · consistency · Control sizes in the form
- **Saw** (measured):
  - In `02`, inputs are 315×32 at 12/20, while selects are 315×28 at 12 px.
  - In `04`, Name (272×32) sits beside Type (272×28) on one row, so their boxes run y 281–313 and y 283–311.
  - **Cause:** the CSS rule `.model-field input { height: 28px }` (styles.ts ≈1001) loses to the global 32 px input rule.
  - This is 2026-09-25 N1, and the "32/12" row of UX-107.
- **Asks:**
  - UX-107: one size per surface, with panes and inspectors at 28/12;
  - checklist 17;
  - design 03's `.input.sm` and `.select.sm` at 28/12.
- **Fix:**
  - Every text control in the model form at 28/12.
  - Textareas at a minimum of 48 px, 12/18 mono, as design 03's `.ta`.

#### MW-10 · major · prototype-mismatch · Member rows
- **Saw** (`03-*`; measured):
  - **Boxed rows:** each member is a 642×34 box with a 1 px border and radius 6.
  - **SQL on the name's line:** the summary is 12/20, and the SQL preview (12/16 mono, `#6e6c67`) is right-aligned on the name's own line (x 404–833).
  - **Remove on every row:** a 63×24 bordered `btn-sm` "Remove" sits outside each row, at x 848.
  - **Pill badges:** "PK" and "currency" are 999 px pills at 12/16 with a `#e3e2de` border.
  - **The list's foot:** "+ dimension" is a bordered 24 px button with no total.
  - **Public badge:** a member that isn't public gets "hidden"; design 03 draws "public" instead. Both satisfy AC-225.
  - This is UX-072 (partly fixed) and 2026-09-25 F4.
- **Asks:**
  - design 03 note 5:
    - rules between rows;
    - the name in mono 600 with PK, public and format badges;
    - the type on the right;
    - the SQL on its own muted line under the name;
    - no box, and no Remove on the row;
  - design 03 note 7: "+ dimension · 3 total";
  - re-check item 50;
  - UX-119: 999 px radius only on status chips.
- **Fix:**
  - **Rows:** `.mrow` rows with a 1 px rule between them, the head padded 6/12, laid out as [caret 16 px | name + badges | type, right-aligned].
  - **SQL:** its own second line, 12/16 mono, muted, ellipsis.
  - **Hover:** `bg-hover`.
  - **Badges:** radius 3, at 12 px rather than the design's 11 px.
  - **Remove:** moves into the expanded body (MW-12).
  - **The list's foot:** "+ dimension · 3 total", with the count in 12 px muted.

#### MW-11 · minor · usability · Joins tab
- **Saw** (`03-orders-joins`): rows read "customers {CUBE}.customer_id = {customers}.id". The relationship, `many_to_one` (YAML lines 9 and 12), isn't on the row.
- **Asks:** direction §7b says rows show "name, type, SQL preview". A join's relationship is its type, and the join diagram labels its edges with it.
- **Fix:** put the relationship in the type slot, humanised the way the diagram writes it ("many to one"), with the SQL on the second line.

#### MW-12 · major · usability · Expanded member
- **Saw** (`04`; measured group titles 12/20/600, uppercase, `#5c5b57`): expanding the string dimension `status` opens every group at once:
  - **Basics:** Name; Type; SQL (a 54 px textarea); Title; Description; Primary key, Public and Order, each a "(not set)" select;
  - **Geography:** Country code, set to "Decided by its values (ISO-3 codes)";
  - **Formatting:** Format, and Mask (a 54 px textarea);
  - **Sub-query** and more groups, running below the fold.

  Also:
  - There is no Advanced collapse and no help line.
  - The body is white inside the row's box, with no `bg-subtle` and no inset.
  - Remove stays at the row's top right, outside the body.
  - The YAML doesn't tint lines 24–26, the open member's lines.
- **Asks:**
  - design 03 note 6:
    - Basics first:
      - Name, Type, Title, Format and Description;
      - SQL, with the help line "{CUBE} refers to this cube's table";
      - the switches "Public · default on" and "Primary key";
    - rare keys under "▸ Advanced" (case, sub_query, meta, order);
    - "Remove dimension" as a ghost danger button at the body's foot;
    - the body on `bg-subtle`, inset 4/12/12/40;
  - design 03 note 9: the member's YAML lines tinted `accent-soft`;
  - re-check items 50 and 51.
- **Fix:**
  - **The body:** as design 03 draws it.
  - **Collapsed by default:**
    - Geography (T397's country code) and Formatting, each unless it has a value;
    - Multi-stage, Sub-query, Links and More, under Advanced, whose summary lists their keys.
  - **YAML link:** the open member's YAML lines tinted `accent-soft`, with its line numbers in the accent.

#### MW-13 · minor · aesthetics · The form as a card in its pane
- **Saw** (measured `02`):
  - **Card in the pane:** the form pane has 16 px padding. Inside it, `.model-form` (668×864) has a 1 px `#e3e2de` border, radius 6 and a max width of 960, on the page's `#f4f4f2`.
  - **Insets:** the first field starts at x 269, 29 px from the pane's edge. The tabs start at y 113, 17 px below the head.
  - **Empty tabs:** an empty tab (`03-pre-aggregations`) is a white card of about 668×92 holding only "+ pre-aggregation".
  - This is UX-077 and 2026-09-25 F2.
- **Asks:** design 03 note 9: "flat on the pane — no card inset — which gives back 32 px" (re-check item 55).
- **Fix:**
  - The tabs flush under the head, at y 92 at 1440.
  - The form on `bg-surface` across the pane's full width, with 12 px insets.
  - An empty list tab ends in "+ pre-aggregation · 0 total".
  - **Proposal** (design silent): one 12 px secondary sentence saying what the list is for.

#### MW-14 · minor · usability · YAML long lines
- **Saw:**
  - In `08` (measured), the code box is 570 px wide from x 990, so it ends at x 1,560 in a 1,440 px window.
  - In `02`, line 4 and lines 19–22 are cut at x 1,432.
  - There is no wrap control.
  - The re-check rated this polish (UX-078). I raise it to minor, because MW-07's bar sends users to comments they can't read.
- **Asks:** design 03 note 8: a "↵ Wrap" toggle, on (re-check item 56).
- **Fix:**
  - A ghost 24 px "↵ Wrap" toggle with `aria-pressed` in the YAML head, on by default.
  - Wrapped lines hang-indented to their key.

#### MW-15 · polish · prototype-mismatch · YAML pane and Problems
- **Saw** (measured):
  - **Pane width:** the YAML pane is 500 px, so the form and code split 700:500, or 1.4 fr : 1 fr.
  - **Problems panel:** an inset card (483×66 at x 949, with a 1 px border and radius 4) whose height follows its content. The editor is also bordered, inside 8 px of padding.
  - **Code type:** the code is 12/16.8.
  - **Missing note:** Problems doesn't name its validator.
  - This is 2026-09-25 F2, F6 and F10.
- **Asks:**
  - design 03 note 8:
    - form and code at 676 and 524 px, 1.15 fr : 1 fr;
    - the code flush, with a `bg-subtle` gutter;
    - Problems docked flush at 150 px, with "Checked with Cube's validator on every change";
  - direction §3: `text-xs` is 12/16.
- **Fix:**
  - The code flush, with no border and a ruled gutter.
  - Problems fixed at 150 px, with the note right-aligned in 12 px muted.
  - The columns set to 240 | 1.15 fr | 1 fr.
  - The code line height from §3.

#### MW-16 · minor · consistency · Jinja (read-only) file page
- **Saw** (`09`):
  - **Frame:** a single column under a 20 px path head, with no state in the head.
  - **Note:** grey, `bg-subtle`, 12 px secondary, and without an icon.
  - **Code:** a bordered box capped at 960 px (it ends at x 1,215), with the rest of the pane empty.
  - **Tree:** no tag on the file.
- **Asks:**
  - T466: InfoBar notes carry the info icon;
  - rule 3: read-only is a state, so it needs an icon and a label;
  - design 03 note 1: the Jinja tag;
  - AC-140.
- **Fix:**
  - **Frame:** the same frame as every other file.
  - **Head:** "🔒 Read-only · Jinja template".
  - **Note:** an InfoBar with the info icon, carrying the existing sentence.
  - **Code:** the flush YAML view across the full pane, since there is no form, with line numbers and wrap.
  - **Tree:** the tag from MW-03.
  - **Proposal** (D3): reword the note without "xcube", for example "wechart publishes plain YAML only, so this template is never rendered or served; it opens read-only here."

### New cube and New view

#### MW-17 · major · usability · New cube writes a fake table
- **Saw** (`10`; `ModelFilePage.tsx:859`, from source):
  - **The fake value:** the new file is written with `sql_table: public.table_name` (YAML line 3). The SQL table field shows it as a value, not a placeholder.
  - **What follows:** Problems reads "No problems in cubes/new_cube_1.yml", and "Save & reload Cube" is enabled as a filled primary at once.
  - **The risk:** one click publishes a cube over a table that probably doesn't exist. Cube's validator can't catch this: it checks only that exactly one of `sql` and `sql_table` is set (data-modeling.md Y.3).
- **Asks:** design 03 state C draws `schema.table` as a placeholder in "Reads from" (`.input.ph`). Direction §7b's validation says Problems names what is missing.
- **Fix:**
  - Write no `sql_table`, and show "Reads from" with the placeholder `schema.table`.
  - Problems then lists the missing source ("exactly one of SQL table or SQL"), and a publish is refused with that reason rather than accepted with a fake table.

#### MW-18 · minor · usability · Focus after New cube / New view
- **Saw** (`10`, `11`; measured: the focused element is the tree row at x 8, y 227):
  - Focus lands on the new file's tree row. Name is neither focused nor selected.
  - The head reads "Unpublished changes" (see MW-05).
- **Asks:**
  - design 03 state C: "the General tab with Name selected for typing" and "New file · not published";
  - design 03 note 7: a new member opens expanded, with Name focused.
- **Fix:**
  - After New cube or New view, focus Name with its text selected.
  - For drafts, the head reads "◷ New file · not published".

#### MW-19 · minor · usability · New view pre-fills a join path (the fix is a proposal)
- **Saw** (`11`; `ModelFilePage.tsx:860`, from source):
  - The view is written with `cubes: - join_path: customers, includes: "*"`, taking the first cube in the store and all its members. The user chose neither.
  - It opens on General.
- **Asks:** design 03 draws no New view state. Direction §7b's view tabs include Cubes (join_path, includes/excludes, prefix, alias), filled with member pickers.
- **Fix (proposal):**
  - Write the view with no `cubes` and open it on the Cubes tab, with "+ cube" expanded and the join-path picker focused.
  - A 12 px note in the empty tab: "A view shows nothing until it includes a cube." Data-modeling.md Y.10 makes `cubes` optional, so this is a note, not an error.

### Generate cubes (no design exists; judged on direction.md, UX-106, UX-107 and designs 01–02)

#### MW-20 · major · consistency, usability · Generate is a growing modal
- **Saw** (`12`–`15b`; measured `12`: a 960×167 dialog at (240, 367), with no border and no shadow):
  - It is a centred modal over a 40 % scrim, sized to its content.
  - It moves and grows at every step (read from the screenshots, ±2 px):

    | Screenshot | Dialog top (y) | Dialog height | Primary button (centre y) |
    |---|---|---|---|
    | `12` | 367 | 167 | ≈502 |
    | `13` | 244 | 412 | ≈624 |
    | `14` | 168 | 564 | ≈700 |
    | `15` | 32 | 836 | ≈836 |

  - By `15`, everything scrolls inside the dialog (`15b`): the source, the filters, the table list, the columns, two YAML files and the left-out lists. The YAML boxes scroll again inside that.
  - The tree and the overview are covered. So while choosing tables, the user can't see which cube names already exist, which is exactly what the clash check (AC-249) is about.
- **Asks:**
  - design 01 note 1, and its table "Dialog or pane? Decided on the evidence: pane" (a stable size and position; the context stays visible);
  - the rebuilt wizard (T471), a 480 px docked pane;
  - direction §2: the docked inspector is 280–480 px;
  - UX-106.
- **Fix:** the docked pane under "Generate cubes: recommended layout" below.

#### MW-21 · major · accessibility, usability · Clash state is plain text
- **Saw** (`15`, `15b`):
  - **No icon or label:** a clash is a secondary-text bullet, "\`customers\` is already a cube in cubes/customers.yml.", with the backticks printed literally. `GenerateCubes.tsx:161` builds a Markdown string into a plain `<li>`.
  - **Reads as a column:** under `orders.yml` it follows directly after the "Left out of the cube:" bullets (customer_id, product_id), so it reads as a third column left out.
  - **The reason is out of sight:** the explanation ("Nothing is published while a cube clashes…") appears only at the scroll's foot (`15b`, y ≈785). At `15`, where Publish sits pale at y ≈836, nothing says why it can't be pressed.
  - **No per-file status.**
- **Asks:**
  - checklist 3: a validation state shows an icon and a text label;
  - AC-249: its naming of the existing cube is met in words;
  - design 01: a blocked primary carries a reason beside it (for example "Name comes after a passing test."), and errors are `.notebar.err`.
- **Fix:**
  - **Per file:** a status of ✕ "Clashes" (in status-error, with its icon), ✓ "Ready" or ⚠ "Check".
  - **Each clash:** an error notebar naming the existing file in the code face, with "Open cubes/customers.yml" and "Leave this table out".
  - **Summary:** a line at the top of Review.
  - **The foot:** the reason for the blocked primary, beside it.

#### MW-22 · minor · consistency · Generate's controls
- **Saw** (measured `12`, `13`; screenshots `14`, `15`):
  - **Labels:** 14/20/400 in the primary text colour, above 32/14 native selects.
  - **Data source option:** reads "default (postgres)", while the Data sources list and design 01 say "PostgreSQL".
  - **Types filter:** "Types" is a browser-default legend over four native checkboxes in the browser's blue (UX-108). With all four unchecked it means every type, which is not obvious.
  - **Columns buttons:** 75×32 at 12/20 with radius 4 (the `.dialog button` rule), among 32/14 controls. They make each table row about 41 px tall.
  - **Wording:** the search placeholder reads "Its name", and a column header reads "Its type".
  - This partly repeats 2026-09-25 N4.
- **Asks:**
  - UX-107: labels stacked at 12/600 secondary;
  - direction §7d: buttons have a 6 px radius;
  - direction §4: table rows are 34 px, or 24 px dense;
  - UX-108: `accent-color`;
  - design 01: filters as `.fpill` (28/12) and a 28/12 search.
- **Fix** (in the pane layout below):
  - **Labels and search:** labels at 12/600 secondary; the search at 28/12.
  - **Type filter:** an "Type · All ▾" pill.
  - **Rows:** accent checkboxes; 34 px rows, with a 24 px chevron to show the columns.
  - **Wording:** the driver's display name, and the headers Table / Type / Column / Database type / Cube type / Key.

#### MW-23 · minor · usability · Column preview doesn't name its table
- **Saw** (`14`):
  - **No table name:** the column table has headers only (Column, Its type, Cube type, Key).
  - **Ambiguous source:** its rows (id, name, country, signed_up_at) are customers' columns, which `01` lists for customers. Yet the button shown grey under the pointer is products'.
  - **Styling:** it is unframed, with rows about 29 px tall, under a framed table list.
- **Asks:** direction §4's row heights, and design 01's rule that every section has a title.
- **Fix:**
  - The columns expand in place under their table's row, with `aria-expanded` on the chevron.
  - A caption: "customers · 4 columns".
  - Dense 24 px rows, inset on `bg-subtle`.

#### MW-24 · minor · aesthetics, consistency · Generated YAML preview
- **Saw** (measured `15`: the `pre` is 928×240 at 12/20 in `ui-monospace`, background `#fff`, no border):
  - **Wrong typeface:** `.generate-cubes__cube pre` asks for `var(--wc-font-mono, …)`, a token no stylesheet defines; the code face is `--wc-font-code`. So the text falls back from IBM Plex Mono to `ui-monospace`.
  - **No frame:** `bg-raised` is white in light, so the block is white on white.
  - **Plain code:** no line numbers and no highlighting.
  - **Nested scroll:** a 240 px scroller inside a scrolling dialog. `15b` cuts `orders.yml` off at "sql: id".
  - **Heading weight:** the file headings are `h3` with no weight set, so they render at the browser's 700 (from source).
- **Asks:**
  - AC-223: code is set in IBM Plex Mono;
  - direction §3: weights 400 and 600 only;
  - design 01's `.code`: 12/18 mono on `bg-subtle` with a border and wrap.
- **Fix:**
  - **Rendering:** each file in the model's read-only YAML view, in IBM Plex Mono with line numbers, highlighting and wrap.
  - **No inner scroller:** the YAML sits behind a "YAML · n lines" disclosure and shows at full length.
  - **Headings:** 12/600 mono.

#### MW-25 · minor · consistency, accessibility · Foot, Close and Esc
- **Saw** (`15`; `GenerateCubes.tsx:223–236` and `669–698`):
  - **Three buttons in the foot at the review step:** Cancel · Generate 2 cubes · Publish 2 cubes.
  - **No close control:** there is no ✕ in the head.
  - **Esc (from source, not exercised):** it closes at once and discards the chosen tables and any generated, unpublished cubes.
- **Asks:**
  - UX-106: Cancel to the left of one primary, and Close always in the same place;
  - design 01:
    - a ✕ in the pane head;
    - Back on the left of the foot;
    - Cancel, then one primary named for its step;
    - the "Discard this data source?" question;
  - rule 85: Esc asks first when there are unsaved changes, and focus returns to the opener.
- **Fix:**
  - **Close:** a ✕ in the head.
  - **Foot:** Back · Cancel · one primary.
  - **Discarding work:** Esc, ✕ or Cancel, with anything chosen, asks "Discard this generation?".
  - **Focus:** returns to the Generate control.

### Narrow window

#### MW-26 · minor · usability · Editor at 1024×768
- **Saw** (`17`; measured tabs at 423 against 781):
  - **Pane widths:** the tree is 240 px, the form about 457 and the YAML about 327 (read from the screenshot).
  - **Clipped toggle:** "Join diagram" wraps inside its 28 px segment and is cut off.
  - **Wrapped note:** the sync note wraps onto two lines.
  - **Tabs:** only five of the eight show.
  - **Shell, not Model:** in the app bar, "Data sources" and "Single-user mode" also wrap onto two lines.
- **Asks:**
  - direction §2's breakpoints: from 1024 to 1279 px, "the inspector overlays the canvas";
  - design 01's narrow state.
- **Fix:**
  - **Below 1,280 px:** the right pane goes behind a "Form | YAML" `.seg` in the editor head.
  - **Below 1,024 px:** it overlays as design 01's pane does.
  - **Labels:** segment labels never wrap, and the sync note hides.
  - The app-bar wrapping belongs on the shell's list, not this one.

---

## Checklist rules and references that pass

- **Rule 1: passes, in Chrome.** Every measured text node is at least 12 px:
  - the tree, labels, inputs, selects, badges and SQL preview at 12;
  - group titles at 12/20;
  - "Unpublished changes" at 12/20;
  - the YAML at 12/16.8;
  - Generate's tables at 12, its body at 14 and its title at 16;
  - page titles at 20.

  Native selects in WebKit were not measured (UX-096).
- **Rule 2: passes on the measured light-theme pairs.** "Computed" means I worked out the ratio from the colour values.

  | Text | On | Ratio | Source |
  |---|---|---|---|
  | `#5c5b57` | white | 5.91 or more | §5 |
  | `#6e6c67` (SQL preview) | white | 5.24 | computed |
  | Current tree row, `#1f6f86` | `#e3f0f4` | 4.90 | computed |
  | "◷ unpublished", `#5c5b57` | `#e3f0f4` | 5.84 | computed |
  | Save, white | `#1f6f86` | 5.71 | §5 |
  | InfoBar text, `#1f1f1e` | `#e3f0f4` | 14.2 | computed |

  Dark theme: not observable.
- **Rule 3: passes in the editor** (fails in Generate, MW-21):
  - the tree's "◷ unpublished" (`10`, `11`);
  - the head's "◷ Unpublished changes" (`10`);
  - Problems' "✓ No problems in cubes/orders.yml" (`02`).
- **Rule 17: partly passes.**
  - Tree file rows are 28 px (measured 223×28), and the tabs are 36 px.
  - Inputs (MW-09) and folder rows (MW-03) fail.
- **Rule 20: partly passes.** Form and YAML sit side by side on one document ("Edits in either side stay in sync", `02`). The upfront warning is missing (MW-07).
- **Rule 26: passes in what the captures show.**
  - The cube's General tab lists every key in data-modeling.md Y.3 (`02`).
  - The view's General tab adds View group(s) and the legacy keys, and its tabs cover Y.10: Cubes, Dimensions, Measures, Folders, Default filters and Access policy (`06`).
  - That enumerations offer exactly the validator's values rests on AC-132's tests.
- **AC-223: passes, except the Generate preview** (MW-24).
  - The panes are full height, each with a head and its own scroll. `01b` equals `01` because the page itself never scrolls.
  - Problems is docked under the code and counts "0 errors · 0 warnings".
  - The tree, the path and the YAML are in IBM Plex Mono (measured).
- **AC-225: passes on content.** Rows show the name, the type, the SQL preview and the PK and "currency" badges (`03`).
- **AC-226: passes.** A tree tag, a head state and Discard (`10`, `11`).
- **UX-071: fixed.** New cube from the overview opens the draft (`10`).
- **Direction §7b's layout: passes.**
  - Tree · form · YAML, with highlighting, line numbers and Problems beneath.
  - A YAML | Join diagram toggle.
  - Short fields two to a row, with SQL at full width.
  - Cube tabs in §7b's order (`02`).
- **T466's frame: passes on the overview and in the dialog title.**
  - The title is 20/26/600, 24 px in from the pane (x 264).
  - The InfoBar carries the info icon (`01`), as on Data sources (`18`).
  - Generate's title is 16/22/600 (`12`).
  - Cancel leads Generate's foot.
- **Design 03 items already matching:**
  - the form tabs: 12/600, 36 px, accent underline, muted counts;
  - "Save & reload Cube": a 24 px 12/600 primary with radius 6 (measured 133×24);
  - the YAML | Join diagram `.seg`: 28 px, 12 px;
  - the sync note: 12 px muted;
  - the Problems head: a selected tab.

---

## Generate cubes: recommended layout (for a designer to draw)

**What stays as built:**
- the API flow: data source → schema → tables → columns → scaffold;
- one model change for all the cubes (AC-136, AC-137);
- the clash rule (AC-249);
- the reasons for leaving columns out, and the footnote about foreign keys.

**Container.**
- **Size and frame:** the frame of design 01. A pane docked at the right edge of the Model workspace:
  - 480 px wide, full height under the app bar (852 px at 1440×900);
  - a 1 px `border-subtle` rule on its left, on `bg-surface`.
- **Where it opens from:**
  - "+ Generate from a data source…" at the tree's foot;
  - the overview's "+ New ▾" menu.
- **What it replaces:** on a file page it takes the place of the YAML and Problems pane, and the form becomes fluid. On the overview it docks to the right of the overview.
- **Why the tree stays:** it shows the existing names, and published files appear in it.
- **What scrolls:** only the body. The head, step rail and foot are pinned, so nothing moves between steps.
- **Below 1,024 px:** it covers the page, and the rail shortens to "Step 2 of 3 · Tables", as in design 01's narrow state.

**Regions, top to bottom.**
1. **Pane head, 44 px** (padding 8/8/8/16):
   - `h2` "Generate cubes" at 16/600;
   - with security on, a target badge like design 01's "in My workspace" (**proposal**, rule 74);
   - a spacer;
   - ✕ as a 32 px icon button.
2. **Step rail, about 40 px** (padding 10/16): ① Source — ② Tables — ③ Review.
   - Steps are 20 px circles with 12/16 labels.
   - A done step shows ✓ on `accent-soft` and can be clicked.
   - The current step is filled in the accent, with its label at 600.
   - Later steps are muted and can't be clicked.
3. **Context strip** (design 01's `.ctx`, 12/16 on `bg-page`), from step 2 on:
   - "default · PostgreSQL › public", with a "Change" link (12/600, accent);
   - at step 3, it adds "· 2 tables".
4. **Body:** `.sect` blocks with 14/16 padding, a 1 px rule between them, and 12/600 uppercase section titles.
5. **Foot, about 56 px** (padding 12/16):
   - **Back:** a 32 px button on the left, from step 2 on.
   - **Cancel:** a ghost button.
   - **One primary,** named for what it does next. When it's blocked, a 12 px secondary reason sits to its left, as in design 01.

**Controls, as design 01 sizes them.**
- Text fields: 32/14. Identifiers: mono 12.
- Filters and search: 28/12.
- Foot buttons: 32 px, radius 6.
- Row actions: 24 px.
- Checkboxes and radios: 16 px in the accent.
- Lists: grid tables in a card, with a 28 px header and 34 px rows (24 px dense for columns).

**Step 1 · Source**
- **Data source:** a single-choice list in a card, one 34 px radio row per source: a mono name at 12/600 and the driver's display name at 12 secondary.
  - **Proposal:** add Health (icon, label and age), taken from Data sources.
  - A single source is pre-selected, as built.
- **Schema:** the same list at 28 px rows, with a 28/12 search when there are more than 10 schemas.
- **Primary:** "Next: Tables". Its blocked reason: "Choose a schema".
- **States to draw:**
  - sources loading: three 34 px skeleton rows;
  - sources error: an error notebar with a 24 px Retry;
  - no source: "No data source yet.", linking to Data sources;
  - schemas loading;
  - schemas error.

**Step 2 · Tables**
- **Filter row:**
  - the search "Search tables" at 28/12, with its icon, taking the free width;
  - an `.fpill` "Type · All ▾", whose menu holds checkboxes for Tables, Views, Materialized views and External tables, plus "All".
- **Count line:** 12/16 secondary in tabular figures, "3 tables · 2 chosen", adding "· 1–50 of 312" when paged.
- **Table card:**
  - header: a select-all checkbox for the page, then Table, then Type;
  - rows: a checkbox, the mono name, the type at 12 secondary, and a 24 px chevron icon button named "Columns of customers" (`aria-expanded`);
  - an expanded row shows an inset panel on `bg-subtle`, captioned "customers · 4 columns", with 24 px rows: Column (mono), Database type (mono, muted), Cube type, Key ("Primary key" or "→ customers.id");
  - only one row is expanded at a time;
  - when paged, the card's foot reads "1–50 of 312", with 24 px ‹ › buttons.
- **Primary:** "Generate 2 cubes". Its blocked reason: "Choose at least one table".
- **States to draw:**
  - loading: five 34 px skeleton rows;
  - no match: "No tables match "cust"." with "Clear search";
  - error with Retry;
  - columns loading: three 24 px skeleton rows;
  - columns error, inline.

**Step 3 · Review**
- **Summary notebar:**
  - ok: "2 cubes ready to publish."
  - error: "1 of 2 cubes clashes with the model. Nothing is published while a cube clashes.", with a 24 px "Leave out clashing tables".
- **One block per generated file,** ruled like design 03's member rows:
  - **Head, 32 px:**
    - status as icon and label (✓ Ready / ✕ Clashes / ⚠ Check);
    - the mono path at 12/600;
    - "4 dimensions · 1 measure · 1 join" at 12 secondary;
    - a chevron.
    - Blocks that clash or need checking open by default; ready ones stay closed.
  - **Body:**
    1. For a clash, an error notebar naming the existing file in the code face, with "Open cubes/customers.yml" and "Leave this table out".
    2. Warning notebars:
       - "Not marked as the cube's primary key: id. A join to this cube needs one."
       - "No count measure: …"
    3. "YAML · n lines" as a disclosure, rendered at full length (no inner scroller) in the model's read-only code view.
    4. "Columns left out (n)": 12 px rows, each with the mono column, its database type (muted) and the reason.
  - **Section foot:** the existing sentence "A column used only in a join, such as a foreign key, is listed as left out too.", at 12 secondary.
- **Primary:** "Publish 2 cubes". Its blocked reason: "Resolve 1 clash to publish".
- **States to draw:**
  - generating: one skeleton block per table, with "◷ Generating…";
  - generation error: a notebar, Retry and Back;
  - publishing: the primary reads "◷ Publishing…" and is disabled, and the body is locked;
  - published: an ok notebar "Published 2 cubes.", each file with an "Open" 24 px `btn-sm`, and "Close" as the only primary;
  - refused by Cube: an error notebar "Cube refused the model, so nothing was published.", with each file's messages in mono, and Back to Tables.

**Discard question.** Esc, ✕, Cancel, or navigating away, with any table chosen or any cube generated, opens design 01's state I:
- a 400 px dialog titled "Discard this generation?" (16/600);
- the body "The 2 generated cubes aren't published.";
- the foot "Keep editing", then a primary "Discard" in status-error.

Focus goes to the pane's `h2` on open, and back to the opener on close (rule 85).

**Proposals needing the user** (D4):
- "Add 2 cubes as drafts" instead of publishing: they land in the tree as unpublished files, to be reviewed and then saved with "Save & reload Cube", like New cube.
- Mark tables that already have a cube "in model" before generating. This needs research into whether the scaffolder's naming is deterministic.

---

## Cleanup list, by surface, in build order

**A. The shared frame (every Model page)**
1. Tree pane head with the model's state; New cube, New view (and Generate) at the tree's foot. (MW-02)
2. Tree folder rows at 28 px with ▾ and the `model/` root; full-width file rows; a Jinja tag; an inset focus indicator. (MW-03, MW-04)
3. Editor head:
   - 44 px, with the path at the size D1 settles;
   - "✓ Published", or "◷ New file · not published";
   - Discard and Save disabled at rest (D2). (MW-05)
4. The form flat in its pane, with the tabs flush under the head. (MW-13)
5. One control size, 28/12, across the model form. (MW-09)
6. Short tab labels, with a "More ▾" tab for overflow. (MW-06)

**B. File editor content**

7. The upfront banner for comments and anchors, gutter flags, and "Show in YAML"; keep the just-in-time guard. (MW-07)
8. YAML pane:
   - wrap on;
   - flush code, and Problems flush at 150 px with its note;
   - a 1.15 : 1 split;
   - the open member's lines tinted. (MW-14, MW-15, part of MW-12)
9. General tab grouped as state B, with help lines, switches that show defaults, and a Data source picker. (MW-08)
10. Member rows as `.mrow`, with the relationship on join rows. (MW-10, MW-11)
11. Expanded member: Basics, then ▸ Advanced; Remove in the body. (MW-12)
12. The Jinja page in the same frame, with an InfoBar and a read-only state. (MW-16)

**C. New cube and New view**

13. No fake `sql_table`: a placeholder, and Problems names what is missing. (MW-17)
14. Focus Name with its text selected; the head reads "New file · not published". (MW-18, MW-05)
15. **Proposal:** New view opens on Cubes, with nothing pre-filled. (MW-19)

**D. Generate cubes**

16. A docked 480 px pane with the step rail, a pinned foot, ✕, and the discard question. (MW-20, MW-25)
17. Tables step: pill filters, 34 px rows, and the column preview expanding in place under its caption. (MW-22, MW-23)
18. Review step:
    - a status per file;
    - clash notebars and a summary;
    - YAML in the code view, with no inner scroll;
    - headings at 12/600. (MW-21, MW-24)

**E. Overview**

19. A table of objects, and a title row with "+ New ▾". (MW-01)

**F. Narrow windows**

20. Below 1,280 px, a Form | YAML toggle; segment labels never wrap. (MW-26)

Afterwards, re-capture every surface in light, dark and at 390×844, and run T406's re-critique (AC-187).

---

## Not observable from the captures

- **Dark theme.** `16-dark-dimensions` renders in light: the app bar and the `#f4f4f2` ground are identical to `03`, and its measurements are empty. So these are unverified:
  - rule 24 (both themes complete);
  - contrast in dark;
  - `color-scheme` (UX-108).
- **390×844.** No capture exists.
- **An expanded measure.** `05` is identical to `03-orders-measures`, and its measurements are empty.
- **The just-in-time loss warning.** In `07`, Title was retyped with the same value, so no edit reached `lossOf`. The capture doesn't show:
  - its wording, placement or focus;
  - "Apply anyway" or "Keep the file";
  - what a real form edit does to `secured_orders.yml`'s eight comments.
- **Code-to-form sync and parse errors** (rules 27 and 28):
  - YAML-to-form timing;
  - the parse-error veil and the frozen form;
  - a Problems row linking to its line;
  - whether 2026-09-25 F8 and N12 still stand.
- **The rest of the editor:**
  - the Join diagram;
  - member pickers (`drill_members`, pre-aggregation members);
  - `monthly_orders`' pre-aggregation row;
  - Access policy, a view's Cubes, and Folders;
  - the tree's "problems" mark (no file had errors).
- **Publishing:**
  - "Save & reload Cube";
  - the references warning (T147);
  - Cube refusing a publish;
  - the "Leave with unpublished changes?" bar;
  - discarding a draft.
- **List edits** (from source only):
  - "+ dimension" adds the new member closed, where design 03 note 7 wants it open with Name focused;
  - Remove acts at once, with no confirmation and no undo.
- **The overview below the fold.** The overview scrolls in its own container, so `01b` equals `01`. The views' entries and the Jinja file's note on the overview weren't captured.
- **Generate cubes:**
  - loading and error states for sources, schemas, tables and columns;
  - paging past 50 tables;
  - the Types filter's results;
  - generating, publishing, published with Open, and refused;
  - focus trapping and focus return;
  - Esc (read from source only; see MW-25).
- **Phase 2 with security on** (every capture is single-user mode):
  - the My workspace band;
  - the target-folder picker (rule 74);
  - New cube offered only in the workspace (AC-222);
  - read-only models in shared folders (rules 70 and 71).
- **Firefox and WebKit.** The 11 px WebKit native selects of UX-096 were not measured.
- **Hover and keyboard states.** Tab arrow keys and hover on rows and buttons weren't captured. The one exception is the focus ring on arrival (MW-04).
