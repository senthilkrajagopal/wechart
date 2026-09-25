# Re-critique: chart editor against the design prototype (2026-09-24, after T208–T242)

## Status: incomplete, because the DevTools server stopped responding partway

**What I got through:**
- Opened the prototype editor ("Revenue by category" ✎) at 1440×900 in light theme and screenshotted it.
- In the app, ran Explore › My workspace › New › Chart: chose a cube, clicked fields to add them, typed a title, clicked Save chart, and landed on the chart page. I took screenshots and accessibility snapshots along the way.

**Where it failed:** my next call was `get_network_request` on the save's PUT. From then on every chrome-devtools call hung until it timed out at 1,800 s: `get_network_request` twice, then `evaluate_script`, `list_pages`, `handle_dialog` and `new_page`, all against a server that no longer answered. As the brief says, I stopped rather than critique from source.

**Not done:**
- I captured no `getComputedStyle` or `getBoundingClientRect` values from either the app or the prototype.
- No dark theme and no 390×844 screenshots.
- Two of the three entry points were not exercised: an existing chart, and a dashboard tile's ✎.
- Not opened: the gallery, "Why this chart?", Customize, the time grain, the pinned or combo state, pie, the drawer, and the error states.

Everything below marked "(visual)" comes from a 1440×900 screenshot or the accessibility tree, not from a measured value. Screenshots are inline only; no files were written.

**Test data created:** one library chart in My workspace, id `c9075b78-0631-435b-b4bf-60fa5ff3981c` (cube Orders, Count by Status). I meant to name it "Critique 0924d", but it was stored as **"Untitled chart"** because of the bug below. I could not rename it afterwards. Nothing was deleted.

## The reported title bug is real

**Steps:**
1. Explore › My workspace › New › Chart opened `/explore/charts/c9075b78-…/edit` with the title "Untitled chart".
2. Cube or view = Orders. Clicked Count, then Status: both were added and a bar chart drew.
3. Focused "Chart title", selected all, and typed "Critique 0924d". Before clicking Save:
   - `input.chart-editor__title` value was "Critique 0924d";
   - `document.activeElement` was the title input;
   - the hidden `h1` still read "Chart editor: Untitled chart", so the title had not been committed.
4. Clicked "Save chart" with a real pointer click (so the input lost focus on mousedown).
5. The PUT `/api/documents/chart/c9075b78-…` returned 200. `location.assign` then did a full page load of `/explore/charts/c9075b78-…`, which re-fetched the document (GET 200).
6. The page heading reads **"Untitled chart"**, with the type badge "Bar · auto".

**Result:** the stored title is the old one. The typed title was silently lost. I could not read the PUT body because the tool hung on that request.

**Most likely mechanism** (inferred from the code; the observed result above is what's established):
- `packages/web/src/editor/ChartEditor.tsx` lines 177–184 and 459–470: the title is held as `typedTitle` and only becomes editor state in `commitTitle`, which runs on blur or Enter.
- Lines 190–192: the new state reaches the route only through a passive `useEffect(() => onChange?.(history.present))`.
- `packages/web/src/router/routes.tsx` lines 277–311 and 364–371: Save's `mutationFn` reads `edited` from the route's render closure. `useMutation` also picks up new options in an effect.
- So the blur caused by pressing Save commits the title, but the route's `edited` (and the mutation's options) are not updated before the click handler runs. The PUT carries the state from before the blur.
- Pressing Enter or tabbing out before Save would probably work. I did not test that.
- The dashboard overlay also takes the editor's state through `onChange`, so "Save dashboard" after typing a title is a likely sibling. I did not verify it.

**Severity and fix:**
- **Severity:** major. The user's input is lost silently on the main path for creating a chart.
- **Class:** AC. AC-214 requires the title to be editable in the editor, and the edit does not survive the save action; it also undermines AC-213's New › Chart flow.
- **Fix:** Save, Apply and Back must use the title as it currently reads, including a title still being typed. Either commit the pending title as part of the save action, or have Save read the editor's live state rather than a copy passed along by an effect. Add an e2e test that types a title and clicks Save without blurring first.

## 1. The earlier report's findings (2026-09-24-chart-editor.md)

| # | Status | Evidence (visual or accessibility tree unless stated) |
|---|---|---|
| F1 Library chart page is a stub | **FIXED (structure; not measured)** | See the F1 detail below. |
| F2 "New chart" never opens an editor | **FIXED, with gaps** | New › Chart goes to `/explore/charts/<id>/edit` with "Untitled chart", and Save lands on the chart page in My workspace. Gaps (see N2): no "← Back to Explore" and no "New shared chart in ‹folder›" note. The document is created at New › Chart, before Save (see N6). |
| F3 Scrolling document, not three panes | **Largely FIXED** | See the F3 detail below. |
| F4 Header lacks title, badges, note | **PARTLY FIXED** | See the F4 detail below. |
| F5 Fields by role, no search, types or click-to-add | **Largely FIXED** | See the F5 detail below. |
| F6 Wells: raw ids, 32 px pills, no Filters, no grain | **PARTLY FIXED** | See the F6 detail below. |
| F7 Reco shows ids and generic descriptions | **PARTLY FIXED** | See the F7 detail below. |
| F8 No gallery | NOT VERIFIED | "Change…" was not opened. |
| F9 No pinned state | NOT VERIFIED | Only the Auto state was seen. |
| F10 No combo warning | NOT VERIFIED | |
| F11 Over-capacity pinned type draws with no warning | NOT VERIFIED | |
| F12 Pie legend omits slices | NOT VERIFIED | |
| F13 Legend and headers show member ids | **PARTLY FIXED** | Pills and the chart page show titles ("Orders Count", "Orders Status"), not `orders.count`. The legend, Results headers and trace were not checked. |
| F14 Debug JSON above the preview | **FIXED (visual)** | The populated preview shows only the Live chip, the rollup-only warning with ⚠, "Table view" and the chart. No JSON text is visible. |
| F15 Unstyled fieldsets; no legend, series or values settings | NOT VERIFIED | The Customize tab exists (`tab "Customize"`) but was not opened. |
| F16 "Why this chart?" raw dump | NOT VERIFIED | |
| F17 Pressed + hover "Actual size" at 1.16:1 | NOT VERIFIED | Needs the dashboard ✎ path. |
| F18 Empty state is one plain sentence | **STILL OPEN** | See the F18 detail below. |
| F19 Offline never errors | NOT VERIFIED | |

**F1, library chart page.**
- `/explore/charts/c9075b78-…` now has:
  - a breadcrumb "← Explore / My workspace";
  - an `h1` with the chart title, a type badge "Bar · auto", and a primary "✎ Edit chart";
  - the chart drawn in a tile, with Live and "as of 7:07:08 PM" badges and "Table view";
  - a right pane with Built on "cube: orders" (mono), Metrics and Dimensions pills, "Used in: Not on any dashboard yet", a Dashboard select, "Add to dashboard" and "Delete chart".
- Remaining differences from the prototype:
  - no UPDATED row;
  - Add to dashboard is a select plus a button, not "＋ Add to a dashboard…";
  - a full-width "Delete chart" sits in its own section.

**F3, editor layout.**
- There is one header row at y 48–96. Fields sit at x 0–280. The Data | Customize inspector starts at about x 1,120, so it is about 320 px wide against the prototype's 360.
- The preview is fully above the fold: bars at y ≈ 250–440.
- Still open: the bottom drawer is collapsed to a single "Results" button (y ≈ 876). The prototype's drawer is open at 220 px with Results, Underlying rows and Cube query tabs. See N4.

**F4, editor header.**
- Fixed: an editable title input, the source and row count ("Orders · 3 rows"), a "⛓ Shared" badge, Undo, Redo, Discard changes and Save chart, all in one row.
- Still open:
  - Undo and Redo are text buttons, not the prototype's ↶ ↷ `.iconbtn`s.
  - The title input shows a visible border on a white field. The prototype's has a transparent border and background at 15/600.
  - There is no "Pre-aggregation" or "Raw query" badge in the header, and the row count is plain text, not a "n rows · ms" badge.
  - There is no Back button (see N2).

**F5, field list.**
- Fixed:
  - fields are grouped by cube ("Orders 6") under a "Search fields" box;
  - each row has a meta column (count, sum, avg, number, string, time);
  - a ✓ marks the fields in use;
  - rows are buttons named "Count count", with the description "Orders Count · click to add";
  - clicking Count and Status added them to Metrics and Dimensions.
- Still open:
  - The cube group is split again under MEASURES / DIMENSIONS / TIME DIMENSIONS `h4`s, which the prototype does not have.
  - The role icons (Σ, Aa, ◷) show no tinted 18 px square; the prototype uses `.ficon.dim` and `.ficon.measure` on role-soft backgrounds.
  - The "used" mark is a ✓ after the meta, not the prototype's 6 px accent dot after the name.
  - The source select heads the field pane. The prototype has a "View: sales" pane head and puts the select in the Data tab.

**F6, wells.**
- Fixed:
  - a Filters well ("+ Add a filter…");
  - Top N (+ Other);
  - pills show a title plus an aggregation tag ("Orders Count count").
- Still open:
  - Each well is a solid-bordered card about 95 px tall, labelled by an `h3` that looks about 17 px bold. The prototype uses a dashed `.well` (radius 6, min-height 36) with a 12/600 `.lbl`.
  - The "+" is still a native `<select>` ("+ Add to Metrics…"), not the inline "+ metric" `.addbtn` menu.
  - Pills look grey and rounded, not role-tinted with radius 4.
  - Sort by was not visible between Filters and Top N, where the prototype has it; it may be further down the inspector.
  - Time granularity was not tested.

**F7, recommendation.**
- Fixed: the Chart type card reads "Auto · Bar" and "Picked by the recommender; changes as you add fields · Change…", matching the prototype's copy. Labels are human ("Bar, horizontal").
- Still open:
  - The reason is still the fixed per-type blurb "Compares a measure across categories by length.", not a data-derived reason.
  - It appears in an unstyled block below Top N: "Recommended: Bar", that paragraph, "Or", then a bulleted list.
  - There are no quick-pick icon buttons ("Suggested for these fields") under the card.

**F18, empty state.**
- The new chart's canvas shows only "Add a field to see data." centred on the page background, with no tile.
- The prototype keeps the tile and centres "Add at least one metric or dimension" (16/600) over "Click fields on the left, or use the + buttons under Metrics and Dimensions."

## 2. New findings

**N1. A typed title is lost on Save chart.**
- Details are in the title-bug section above.
- **Severity:** major. **Class:** AC (AC-214, and AC-213's flow).

**N2. The library-chart editor has no way back.**
- **Prototype:** `explore.js` 174–183 gives the editor "← Back to Explore" (a new chart) or "← Back to chart" (an existing one), with the note "New shared chart in ‹folder›" or "Shared chart · on n dashboard(s)…".
- **App:** the header's accessibility tree is: `textbox "Chart title"`, "Orders", "Shared", Undo, Redo, Discard changes, Save chart. There is no back control and no note; the only exits are the workspace nav and the browser's Back.
- **Severity:** major. **Class:** STRUCTURE.
- **Fix:** add the prototype's back button at the start of the header, and replace the bare "Shared" badge with the ownership note.

**N3. The preview is not in a tile (visual).**
- **Prototype:** the chart sits in a `.tile`: 1 px `border-subtle`, 6 px radius, 16 px padding, on `bg-surface`.
- **App:** the editor preview draws directly on the grey `bg-page` canvas with no frame. The chart page's preview does have a white bordered tile.
- **Severity:** minor. **Class:** VISUAL. Tiles are within AC-187; not measured.
- **Fix:** draw the preview inside the tile component, as the chart page already does.

**N4. The drawer is closed to a lone "Results" button.**
- **Prototype:** a 220 px drawer, open by default, with Results, Underlying rows and Cube query tabs.
- **App:** only a "Results" button at the bottom of the canvas.
- **Severity:** minor. **Class:** STRUCTURE. AC-214 names "a drawer of results, underlying rows and the Cube query"; I did not open it to check its tabs.
- **Fix:** show the tabbed drawer, open by default as the prototype does, or at least show its tabs when it is collapsed.

**N5. The field list and the pills name the same member differently.**
- The field list shows "Count" and "Status"; the pills and the chart page show "Orders Count" and "Orders Status".
- The prototype uses one title in both places.
- **Severity:** minor. **Class:** STRUCTURE.
- **Fix:** use one naming rule, for example the short title under the cube's group head and in the pills.

**N6. New › Chart writes a document before Save.**
- `POST /api/documents` returned 201 as soon as Chart was chosen, before the editor opened.
- The prototype creates the chart on Apply (`explore.js` 298).
- I did not check whether leaving without saving leaves an "Untitled chart" in the folder.
- **Severity:** minor, pending that check. **Class:** STRUCTURE.
- **Fix:** create the chart on first save, or discard the draft when the editor is left without saving.

## 3. AC-187 verdict for this group (buttons, inputs, selects, field list, wells, gallery)

**No verdict from measurement.** No computed values were captured before the tool failed.

On visual evidence alone, the group **does not conform**. These differences are visible but their values are unmeasured:
- **Well label:** an `h3` that looks about 17 px bold; the prototype's is a 12/600 `text-secondary` `.lbl`.
- **Well border:** solid; the prototype's is 1 px dashed `border-strong`, radius 6.
- **Well "+" control:** a bordered native select; the prototype's is a borderless `.addbtn` (24 px, 12 px, `text-muted`).
- **Pill:** grey, apparently fully rounded; the prototype's is 24 px, 12/600, radius 4, with `role-*-soft` background and `role-*` text.
- **Undo and Redo:** text buttons; the prototype's are 32×32 `.iconbtn`s, radius 6, transparent border.
- **Title input:** a visible `border-strong` border on white; the prototype's border and background are transparent, at 15/600.
- **Field icons:** no 18×18 radius-4 role-soft tile.
- **Not seen at all:** the gallery, `.seg`, `.switch`, and `.input.sm` in Customize.

To reach a verdict, the following still need `getComputedStyle` values from both the app and the prototype, in light and dark:
- `.btn.sm`, `.btn.primary` and `.iconbtn`;
- the title input;
- `.select.sm` and `.input.sm` (Top N, search);
- `.frow` and `.tgroup-head`;
- `.well`, `.pill` and `.addbtn`;
- `.reco-row`;
- the gallery cards;
- `.tabs button`.

## Checklist rules seen to pass (limited)

- **Rule 11 ("+" pickers):** every well has a keyboard-reachable picker. The accessibility tree shows the comboboxes "Add to Metrics", "Add to Dimensions", "Add to Time" and "Add a filter".
- **Rule 3 (icon plus label):** the rollup-only notice pairs ⚠ with its text: "Depends on the source database: in rollup-only mode, Cube would refuse this chart."
- **Rule 4 (legend only with 2+ series):** the single-series bar showed no legend box.
- **Rule 19 (pre-aggregation and cache age), in part:** the "Live" chip is in the editor canvas, and "Live" plus "as of 7:07:08 PM" is on the chart page.

## Files

- `/Users/srajagopal/Work/wechart/packages/web/src/editor/ChartEditor.tsx` (177–192, 459–470): title commit and the `onChange` effect.
- `/Users/srajagopal/Work/wechart/packages/web/src/router/routes.tsx` (248–380): Save chart's mutation, which reads `edited`.
- `/Users/srajagopal/Work/wechart/docs/design/prototype/editor.js` (404–437): editor header and panes; `/Users/srajagopal/Work/wechart/docs/design/prototype/explore.js` (164–190, 295–299): the back label, note and create-on-apply.
- `/Users/srajagopal/Work/wechart/docs/design/prototype/index.html` (551–630, 767–954, 1142–1214, 2274–2283): the component rules to measure against.
- `/Users/srajagopal/Work/wechart/docs/design/critiques/2026-09-24-chart-editor.md`: the earlier report.

**To finish this critique:** restart the chrome-devtools MCP server, then run the computed-style pass, dark theme, the existing-chart and dashboard-✎ paths, the gallery, Customize, and the error states.
