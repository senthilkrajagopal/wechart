# Chart editor critique (2026-10-08, T406)

**What this covers.** AC-352: the chart editor's inspector (2026-09-24 design 01), the results drawer (design 02), and the chart type gallery (the prototype, `docs/design/prototype/editor.js:361–390`). No later design draws these surfaces. 2026-09-27 design 10 sets only the cube picker's contents (T475).

**How it was judged.** Captures of the running app at 1,440 × 900: screenshots, plus every visible element's box and computed styles. No editor capture exists at 1,024 or 390 px. The design draws only the Data and Customize tabs, so the capture script's missing Format, Style and Properties tabs are not findings.

**Summary.** 25 findings: 12 major, 11 minor, 2 polish. status.md rows 01 and 02 list most of them as "left to build", but `docs/tasks.md` has no open task for any of them.

## Findings

| # | Sev. | Surface / pin | Design | App | Covered? |
|---|---|---|---|---|---|
| EDI-01 | major | Header facts (01 pin 1) | `Raw query` or `✓ Pre-aggregation` badge, then `8 rows · 42 ms`, both `.badge` 22 px bg-subtle (01:193–194) | Plain text "Orders · 6 rows", 12/400; no ms; "Live" sits in the canvas, not the head | status.md 01; no task; Q5 |
| EDI-02 | major | Rollup-only note (02 pin 6, state D) | In the Raw query badge's tooltip with "Details in Acceleration"; in Acceleration as an `.info` note; a banner only where rollup-only mode is known on | `p.rollup-only-warning` heads every chart's canvas on the warning tint, and repeats full-bleed in Acceleration | status.md 02; no task; Q4 |
| EDI-03 | major | Joined cubes in the field list (01 pin 2) | Each joined cube a group "· via join", collapsed after the first, with ▾/▸; the head "3 cubes" (01:205–226) | One group "Orders 6", no caret; the well holds "Products Category", which the list doesn't show | status.md 01; no task |
| EDI-04 | minor | Field meta (01 pin 2) | Dimension rows show their distinct count ("1,184"); measures their aggregation; time "time" | "number", "string" | no |
| EDI-05 | minor | Cube or view placement (01 pin 3) | First field of the inspector (`.select.sm`, 01:289), and named in the field pane's head | Heads the field pane; the inspector starts at Chart type | no |
| EDI-06 | major | Chart type card and quick picks (01 pin 4) | A `.reco-row` with a 28 px icon, the drawn form's name ("Bar, horizontal"), "Chosen manually · **Change…**" (accent 600); a row of 24 px quick picks (Auto, top pick, runners-up), Auto replacing "Back to recommended" (01:292–303) | No icon; "Bar" while three series are drawn side by side; one 12/400 span; no quick picks; "Back to recommended" shows when the pick equals the recommendation; label line 20 (`.lbl` 16) | status.md 01; no task; Q2 |
| EDI-07 | major | Recommended card (01 pin 5) | Only when the pick differs, under the type card: `.pinned` on bg-subtle at 12/16, icon, "**Recommended: Bar**", a data-built reason ("8 countries × 1 measure → bars, sorted by value"), **Use** (01:305–309) | 14/400 text-primary, a fixed sentence, an "Or" bulleted list, below Sort/Top N/The rest; shows when equal; no Use | status.md 01; no task |
| EDI-08 | minor | Inspector sections (01 layout) | Three `.section` blocks (padding 12, a 1 px border-subtle rule): source and type; wells with Sort and Top N; Why | One grid with gap 12, no rules | status.md 01; no task |
| EDI-09 | minor | Well details (01 pin 6; 02:283) | Dimension pills carry their encoding tag ("Country **Y**"); "Dimensions (group by)", "Top N (+ Other)" with the parenthesis muted 400; "+ time dimension"; well 36 px, padding 5 | No tags; "Dimensions"; one 12/600 run; "+ time"; wells 38 px, padding 6 | no |
| EDI-10 | major | Aggregation menu (01 pin 6) | The aggregation tag opens "a small menu (sum, avg… where the model allows)" | The tag "count ▾" opens AC-047's quick calculations; no aggregation choices | status.md 01; no task; Q6 |
| EDI-11 | major | "+ metric" picker (01 pin 7, state A; not captured) | 264 px with a filter box, rows grouped by cube ("· via join") with aggregation, used members "✓ in chart" disabled, foot "↑ ↓ move · Enter adds · Esc closes" | Source `Wells.tsx`: a flat list, no filter or groups or aggregation; used members dropped; 240 px | no (not in status.md either) |
| EDI-12 | major | "Why this recommendation?" (01 pin 9, state C) | The last section, collapsed with ▸; ✓/⚠ sentences (signature, distinct values, deciding rules, pick, runners-up); link "Show every rule for every type (n × n)" to AC-029's table (01:416–424) | "Why this chart?" `btn-ghost` inside the recommendation block, no caret; opens a Fields table and every candidate's rule ids (`WhyThisChart.tsx`) | status.md 01; no task; Q3 |
| EDI-13 | major | Status line above the preview (01 pin 10; 02:215) | 12/16 muted: "Showing **Bar, horizontal** · chosen manually · click a bar to drill, keep or exclude"; canvas padding 12 | No such line; `result-source` (Live plus the rollup banner) in its place; canvas padding 16 | status.md 01; no task; its drill part relies on backlog §5's open item |
| EDI-14 | minor | "The rest" segmented control (design silent) | Design 01 draws only Sort by beside Top N | "Fold into "Other (n)"" (103 × 28) wraps inside an `overflow:hidden` `.seg`, so "Other (n)" is cut; "Leave out" cut too; label "The rest" 14/400 text-primary where its siblings are 12/600 text-secondary; the pressed ground is `color-mix(accent 12%)`, not `bg-accent-soft` | UX-115 recommends, no decision; Q1 (the label style and token are clear now) |
| EDI-15 | major | Drawer height and resizing (02 pin 1) | 240 px when the editor opens, dragged from 160 px to half the canvas by a grip, double-click resets (also direction §2) | 220 px (`styles.ts`, `height: 220px`); no grip, no `role=separator` | status.md 02; no task |
| EDI-16 | minor | Count and dot on drawer tabs (02 pin 2) | "Results **24**" with the count muted 400; Acceleration a hollow dot or ✓ | "Results" alone; no mark | status.md 02; no task |
| EDI-17 | major | Drawer tools (02 pin 3, states B and C) | "24 rows · 42 ms", Copy (tab-separated), Download CSV, ⌄; Underlying rows' Download CSV; Cube query's Copy | None | status.md 02; no task |
| EDI-18 | minor | Grid anatomy (02 pins 4–5) | A muted "#" column, a role chip in each header, the colour dimension's swatch in its cells | Text-only headers; no row number; no swatch | status.md 02 (swatches only) |
| EDI-19 | minor | Columns in the wells' order (02 pin 4; AC-301) | The columns follow the Dimensions well | Well: Products Category, then Orders Status. Drawer and query: status first, then category | no |
| EDI-20 | major | Cube query tab (02 state C) | JSON in the code colours; a JSON \| SQL `.seg` (Cube's generated SQL); Copy of the view shown; foot "Sent to `POST /cubejs-api/v1/load` · ms · rows" | `JSON.stringify` in one colour; no switch, Copy or foot (the 12/18 mono type and 12 px padding match) | status.md 02; no task |
| EDI-21 | minor | Underlying rows' cap note (02 state B) | `.dline`: 12/16 text-secondary, an accent info icon, padding 6 12, a rule | `state-line` 14/400 text-primary with ⚠: "Showing the first 100 rows. There may be more." | The drill-members part is backlog §6(a); the style isn't (cleanup 44) |
| EDI-22 | minor | Acceleration panel (02 state D) | Padding 12, gap 10; a 12/600 status line with an icon, "Not served by a pre-aggregation"; the reason at 12; the rollup note as `.info` | 14/400, flush on the drawer's edge, "Not served **from** a pre-aggregation."; a full-width warning bar | "Open in Model" is backlog §6(c); layout and wording not covered |
| EDI-23 | minor | Collapsed drawer (02 state E; not captured) | A 37 px strip keeping "24 rows · 42 ms", with ⌃ | The strip stays without the count; ▴/▾ (`ResultsDrawer.tsx`) | status.md 02 |
| EDI-24 | polish | Gallery cards (prototype `editor.js:385`; UX-066) | The type icon at about 28 px in the accent on the top row with the badge; the name on its own line | No icon; "Grouped bar" and "Stacked bar" wrap beside the badge | no |
| EDI-25 | polish | Gallery wording (prototype `editor.js:379, 389`) | "Recommended (n)"; foot ""Suggested" comes from the recommender for your current fields. You can pick any type and then add the fields it needs." | "Suggested (3)"; "…for these fields. Any type can be chosen, and then says which fields it needs." | no |

## Measured and passing
- **Workbench:** 280 / 800 / 360 columns.
- **Editor head:** 48 px; title 15/600; Undo and Redo 32 × 32.
- **Inspector tabs:** Data and Customize, 36 px, 12/600, the selected one accent with a 2 px underline.
- **Drawer:** tabs always shown, open by default.
- **Grid:** th 28 px on bg-subtle, 12/600, sticky; td 24 px; measures right-aligned.
- **Wells:**
  - labels 12/600 text-secondary;
  - the well dashed border-strong, radius 6;
  - pills 24 px with role tints;
  - Sort by beside Top N at 28/12 (pin 8).
- **Field rows:** 28 px, 18 px role chips, a 6 px used dot.
- **Preview tile:** a 1 px border and 16 px padding.
- **Gallery:** 920 × 600, a 220 px nav, a 16/600 title, search, Close, 13/600 names, an accent-soft badge, Use Auto.
- **Built but not captured:** state B "not drawn" (T510); the empty, loading and error previews.
- **Not findings:** "Table view" in the preview's head is backlog §3 F8. Underlying rows by drill members is backlog §6(a).

## Questions for the user
1. **"The rest" and "Result limit"** (AC-041; design 01 draws neither). How should the choice be shown?
   - (a) short labels ("Fold into Other" / "Drop"), the full wording in a tooltip;
   - (b) shown only once Top N is set;
   - (c) a select;
   - (d) a full-width row.
2. **AC-217's "Back to recommended"** against pin 4's Auto quick pick, which replaces it:
   - (a) amend AC-217 to the Auto quick pick;
   - (b) keep both.
3. **AC-029's "Why this chart?"** against the design's "Why this recommendation?" (a checklist, the full table behind a link):
   - (a) amend AC-029's wording;
   - (b) keep "Why this chart?" on the checklist.
4. **AC-147's "warn on the chart":**
   - Does the badge's tooltip (02 pin 6) satisfy it, or should AC-147 be amended?
   - How does wechart know rollup-only mode is on, which is the case where the design brings the banner back?
5. **"Live" against "Raw query":** design 04's tile badge and the app say "Live"; designs 01 and 02 say "Raw query" in the editor's head.
   - (a) one word product-wide (which one?);
   - (b) each surface keeps its own word.
6. **The measure pill's tag:** pin 6 draws aggregations there; AC-047 (T380) put the quick calculations there.
   - (a) one menu: aggregations, then calculations;
   - (b) aggregations on the tag, calculations elsewhere.
7. **Joined members' names:** design 01 writes "Country" on the pill (tooltip "Customers › Country, via join"); AC-220 as amended gives a full title in a multi-source chart ("Products Category"). Which wins?
8. **Customize** (the design draws only the tab):
   - (a) judge it against the prototype (UX-064, cleanup 47);
   - (b) wait for a design.
9. **A local chart's ownership:** the app shows a bordered 12/600 chip, "Local to a dashboard"; designs 01 and 02 draw ownership as a plain note.
   - (a) keep the chip;
   - (b) draw it as the note.

## Suggested grouping (AC-352, with AC-187 for styles)
1. **Type card, quick picks and the Recommended card:** EDI-06, EDI-07 (after Q2).
2. **The Why checklist:** EDI-12 (after Q3).
3. **Inspector structure:** EDI-05, EDI-08, EDI-09, EDI-14 (EDI-14's shape after Q1).
4. **The "+" picker:** EDI-11.
5. **The aggregation menu:** EDI-10 (after Q6).
6. **The field list:** EDI-03, EDI-04.
7. **The answer's facts:** EDI-01, EDI-02, EDI-13, EDI-22 (after Q4 and Q5).
8. **The drawer's frame:** EDI-15, EDI-16, EDI-17, EDI-23.
9. **The drawer's grid:** EDI-18, EDI-19, EDI-21.
10. **The Cube query tab:** EDI-20.
11. **The gallery:** EDI-24, EDI-25.
