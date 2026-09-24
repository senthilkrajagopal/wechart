# Critique: chart editor and library chart page (2026-09-24)

Produced by the `design-critic` agent and saved verbatim, as part of the
prototype-alignment pass the user asked for on 2026-09-24.

**Compared:** the running app at http://localhost:5400 (production build, real API and Cube) with the prototype at http://127.0.0.1:5500/index.html (`docs/design/prototype/editor.js`, `explore.js` `chartPage()`, `reco.js`). All screenshots and measurements are at 1440×900. The screenshot tool could not write to the scratchpad ("not within any of the configured workspace roots"), so screenshots were inline only. Every number below comes from `getComputedStyle` or `getBoundingClientRect` on the named element.

**Paths I exercised:**
- The ✎ on the tile `tile-status` on `seed-root-dashboard-1`, from view mode.
- A new local chart: dashboard Edit, then Add › Chart, then its ✎.
- Explore › "New chart".
- Explore › Finance › "Finance chart 3".
- Drag a measure over the wells; add fields through the "+" pickers.
- Pick types manually (pie, line, combo); open "Why this chart?".
- Loading state (Slow 3G) and network offline; dark theme.

**Cleanup:** I discarded every dashboard change; the dashboard still has its 3 tiles. I created one library chart, "Critique chart 0924" (id `c8aeab99-af58-47d6-89a4-a87aea248e63`), and deleted nothing.

## 1. Summary

1. **The library chart page is a stub, and "New chart" from Explore ends there.**
   - Both a seeded chart (`/explore/charts/seed-folder-0-item-3`) and the new one show the same page: an `h1` reading "Chart", the raw id, "Used by", an "Add to a dashboard" select, and "Delete chart".
   - There is no chart, no title, no breadcrumb, no Built on, Metrics or Dimensions, and no **Edit chart** button.
   - So there is no way to build or edit a library chart at all. The only editor entry point is a dashboard tile.
2. **The editor is not the prototype's three-pane workbench.**
   - The prototype is a fixed full-viewport overlay: fields 280 px | preview canvas 800 px with a Results / Underlying rows / Cube query drawer | Data/Customize inspector 360 px.
   - The app is a scrolling document 1,342 px tall with columns of 240 | 240 | 928 px. The third column stacks the recommendation, type select, axis forms, a result count and the preview.
   - The preview starts at **y = 941 px**, below the 900 px fold. You cannot see the chart while editing it.
3. **The recommendation surface reads as developer output.**
   - It shows two unlabelled paragraphs ("bar", "bar"), an "Or" list of camelCase type ids with generic type descriptions, and a native `<select>` of 18 lower-case ids.
   - The prototype has a Chart type card ("Auto · Bar" / "Chosen manually · Change…"), quick-pick icons, a "Recommended: Bar — 8 categories × 1 measure → bars, sorted by value [Use]" banner when pinned, and a searchable "Choose chart type" gallery.
   - A raw JSON dump of the first result row (`<pre>{"orders.status":"shipped",…}`) sits above the preview.
4. **The field list and wells lose their typing, density and click-to-add.**
   - Fields are grouped Measures / Dimensions / Time, not by cube or view. There is no search, no type or cardinality column, and no role colour.
   - Rows are 24 px at 14 px. They are not focusable (`tabindex -1`, no role), and clicking one does nothing.
   - Well pills show raw member ids (`orders.count`) at 32 px, with no role colour and no aggregation tag.
5. **The editor has no Customize tab and no legend, series or values settings.**
   - Axis settings sit in two unstyled UA `<fieldset>`s (2 px groove `#efefef`, visibly white in dark theme).
   - The "Gridlines" label wraps away from its checkbox.
   - There is no title field, no Filters well, no Top N, and no time granularity.

## 2. Findings

### F1. The library chart page has no chart, title or Edit chart
- **Prototype:** `explore.js` `chartPage()`:
  - Breadcrumb "← Explore / Sales /".
  - `h1` with the chart title at 20/600, a type badge ("Bar, horizontal · auto"), and a primary "✎ Edit chart" button (32 px, 14/600).
  - The rendered chart in a tile.
  - A 300 px right pane with BUILT ON (`view: sales`, mono), METRICS (measure pill), DIMENSIONS (dimension pill), USED IN with "＋ Add to a dashboard…", and UPDATED. Section heads are 12/600 `text-secondary`.
- **App:** `/explore/charts/seed-folder-0-item-3` and `/explore/charts/c8aeab99-…`:
  - `h1` "Chart" at **28px/700**, then the raw id as body text.
  - `h2`s "Used by", "Add to a dashboard" and "Delete" at **21px/700**.
  - The only controls are "Add to dashboard" and "Delete chart". There is no chart render, no title, no breadcrumb, no Built on, Metrics or Dimensions, and no Edit chart.
- **Evidence:** DOM query of `main`: buttons `["Add to dashboard","Delete chart"]`; `innerText` does not contain the chart's name.
- **Severity:** blocker.
- **Class:** AC.
  - AC-195 (breadcrumb, unchecked) is broken.
  - AC-022 passes (Used by plus add).
  - The missing chart, title and Edit chart are STRUCTURE.
- **Fix:** Rebuild the page on the prototype's structure: breadcrumb header with title, type badge and primary Edit chart; the chart canvas; the 300 px detail pane. Edit chart opens the editor overlay with "← Back to chart" and the note "Shared chart · on n dashboards". Headings belong on the §3 scale, 20/600 and 12/600.

### F2. "New chart" in Explore never opens an editor
- **Prototype:** "＋ New ▾ → Chart" opens the editor overlay straight away:
  - The title is "Untitled chart" and editable in the header.
  - The header says "New shared chart in Sales" and has "← Back to Explore" and "Apply".
  - The canvas shows the empty state.
- **App:**
  - Explore shows an inline "New chart in this folder" name field. Its label is clipped under the input ("folde|r").
  - Create navigates to the stub page from F1, which doesn't show the typed name.
  - There is no route from there into an editor.
- **Evidence:**
  - After Create, the URL is `/explore/charts/c8aeab99-…`.
  - The page has only Add to dashboard and Delete.
  - `innerText.includes('Critique chart 0924') === false`.
- **Severity:** blocker.
- **Class:** STRUCTURE. No AC names creating a library chart from Explore, but R7 accepts the prototype's flow.
- **Fix:** "New chart" opens the editor overlay for a new library chart in the current folder, with the title edited in its header. Save lands on the chart page from F1.

### F3. The editor is a scrolling document, not the three-pane overlay
- **Prototype:**
  - `.editor-overlay` is a grid of `280px 800px 360px`, 852 px tall, filling the space under the app bar.
  - The header is a single 49 px row.
  - The left pane is fields, the centre is the canvas plus a 220 px drawer, and the right is the inspector with Data | Customize tabs (36 px, 12/600).
  - The tile preview sits at y = 303 and the drawer at y = 680; nothing scrolls except inside panes.
- **App:**
  - `.chart-editor-overlay` is `position: static` inside `.dashboard--overlaid`.
  - The header is 48 px, followed by a **second 48 px row** holding only Undo, Redo and Discard changes.
  - `.chart-editor` is a grid of `240px 240px 928px` and **1,230 px tall**; the document is 1,342 px.
  - The third column stacks: Chart heading, reco text, type select, "Why this chart?", Sort, the X-axis and Y-axis fieldsets, "Result", "6 rows", the source chip, a JSON `<pre>`, Actual size | Fit, the preview (**y = 941**), and a "Results" disclosure (y = 1,301).
  - Opening "Why this chart?" pushes the preview to y ≈ 2,200.
- **Evidence:** measured rects of `.chart-editor__fields`, `.chart-editor__wells`, `.chart-editor__result` and `.preview-frame`; the only scrollers are the dashboard canvas and sidebar behind the overlay.
- **Severity:** blocker. The chart being edited is off-screen at the only supported viewport.
- **Class:** STRUCTURE. Direction §2's workbench panes table (left 280, centre fluid min 560, inspector 320, bottom drawer) is also broken.
- **Fix:** Use the prototype's frame:
  - One header row: back, editable title, badges and note, undo/redo, Discard, and the primary action.
  - Fields pane 280 px on the left.
  - A centre canvas with the preview always visible and a bottom drawer for Results / Underlying rows / Cube query.
  - A right inspector with Data and Customize tabs, the wells and recommendation in Data, and axes, legend, series and values in Customize. Panes scroll independently.

### F4. The editor header has no editable title, badges or ownership note
- **Prototype:** in one row:
  - "← Back to 'Northwind sales'" as `.btn.sm` (24 px, 12 px, radius 6).
  - The title as an `<input>` at 15/600 with a transparent border.
  - "✓ Pre-aggregation" or "Raw query" badge, a "8 rows · 20 ms" badge, and the note "Only on this dashboard" or "Shared chart · on n dashboard(s) · edits change all of them" (with a warning icon when there is more than one).
  - ↶ ↷ icon buttons, "Discard changes", and "Save dashboard" (primary, 600).
- **App:**
  - `h1` "Chart editor: Orders by category and status" at 20/600. It is not editable, and there is no title input anywhere in the editor.
  - Back and Save are 32 px, 14 px, **radius 4 px**; Save is **weight 400**.
  - Undo, Redo and Discard are in a separate row as text buttons.
  - There is no cache or pre-aggregation badge or row/ms badge in the header; a "● Live" chip sits in the result stack instead.
  - For a local chart there is no ownership note, because both header `status` regions are empty.
- **Severity:** major.
- **Class:**
  - AC-187 for the button radius (6 px per direction §7d) and the primary weight.
  - STRUCTURE for the title field, badges and note.
  - AC-128's shared-chart note could not be verified: no seeded library chart is on a dashboard.
- **Fix:** Put the title field, cache badge, row/ms badge and ownership note in the header row, and use the prototype's `.btn.sm` and icon-button styling.

### F5. The field list is grouped by role, not by cube, with no search, types or cardinalities
- **Prototype:**
  - The pane head reads "View: `sales`" (14/600), with a "Search fields" input (28 px, 12 px) below it.
  - Groups are per cube (`.tgroup-head`, 28 px, 12/600 `text-secondary`), each with a count or "via join".
  - Rows (`.frow`) are **28 px** at 12 px, with `role=button` and `tabindex=0`. Each row has:
    - an 18 px role icon tinted by role (dimension `#7fb0ea` on `#1d2a3a` in dark);
    - the name;
    - a right-aligned `.fmeta` for aggregation or type or cardinality ("sum", "time", "8");
    - a "used" dot and a description tooltip;
    - click or Enter to add.
- **App** (`.chart-editor__fields`):
  - A "Cube or view" select, then `h3` groups "Measures / Dimensions / Time dimensions" at **16.38px/700**.
  - Rows are `<li draggable>`, **24 px** at **14 px**, `tabindex -1`, with no role.
  - Icons are plain glyphs (Σ, Aa, ◷) in `text-primary` `rgb(31,31,30)`, with no role hue.
  - There is no search, no meta column, no used indicator and no description.
  - A synthetic click and double-click on "Average Amount" changed nothing in the wells.
- **Severity:** major.
- **Class:**
  - Direction rule 17 (tree rows 28 px) and §5 (`role-dimension` / `role-measure` hues) are broken.
  - AC-025 passes on content: members are listed and grouped by type.
  - Grouping by cube, search, meta and click-to-add are STRUCTURE.
- **Fix:**
  - Group by cube, with join provenance, under the chosen cube or view, and add a search box.
  - Rows at 28 px / 12 px with a role-tinted icon, a meta column and a used dot.
  - Make rows focusable buttons that add to the default well on click, Enter or Space.

### F6. Wells: raw ids, 32 px pills, no Filters well, no time granularity
- **Prototype:**
  - Wells are Metrics, Dimensions (group by), Time and Filters. Each is a dashed `.well` (radius 6), with a 12/600 label above it and an inline "+ metric" `.addbtn` that opens a menu.
  - Pills are **24 px**, 12/600, radius 4, role-tinted (measure `#f0a35c` on `#3a2a1a`). They show the title plus an aggregation tag ("Revenue sum") or an "X" tag, and an × button.
  - Time is a select plus a Month / Quarter / Year segmented control.
  - Sort by and Top N (+ Other) sit below.
- **App:**
  - Wells are Measures, Dimensions and Time only. There is **no Filters well** and no Top N.
  - Pill text is the raw member id (`orders.count`, `products.category`) at 14/400, no background, **32 px** tall, with a separate bordered 35×32 × button.
  - The "+" picker is a native `<select>` labelled "+ Add to Measures…".
  - After adding "Ordered at", the Time well has only a remove button. There is **no granularity control**, and the query came back at `.day` (240 rows, "orders.ordered_at.day").
- **Severity:** major.
- **Class:**
  - Direction rule 17 (pills 24 px) is broken.
  - The missing granularity breaks what direction §8 WellPill asks for ("aggregation or granularity menu").
  - The rest is STRUCTURE.
- **Fix:**
  - Pills show the member title with a role tint and an aggregation or granularity tag.
  - The time pill carries the grain control.
  - Add the Filters well and Top N back in the Data tab.
  - Keep the "+" as an inline button opening a field menu, as the prototype does.

### F7. The recommendation shows type ids and generic descriptions, not data-derived reasons
- **Prototype:**
  - The Chart type card (`.reco-row`, 54 px, 12/600 name, 12/400 `text-secondary` reason) reads "Auto · Bar" and "Picked by the recommender; changes as you add fields · Change…", or "Chosen manually · Change…" when pinned.
  - Below it are quick-pick icon buttons for the top pick and runners-up ("Suggested for these fields").
  - When pinned, a `.pinned` banner reads "Recommended: Bar — 8 categories × 1 measure → bars, sorted by value [Use]".
- **App:**
  - `<p>bar</p><p>bar</p><p>Compares a measure across categories by length.</p><h4>Or</h4><ul><li>groupedBar — Compares two categories side by side.</li>…`, all 14/400 unstyled.
  - The first `<p>` is the current type and the second the recommendation, but neither is labelled.
  - The reasons are fixed per-type blurbs that don't change with the data: "Compares a measure across categories by length" appears for both the 2-dimension and 1-dimension cases.
- **Severity:** major.
- **Class:**
  - STRUCTURE.
  - AC-028 and rule 9 pass on their letter (top plus 2 runners-up, each at most 80 characters), but direction §6 gives data-derived reasons ("Time × 1 measure, 184 dense points → line"), and the app's are not.
- **Fix:**
  - A labelled current-type card with a "Change…" gallery and quick picks.
  - Recommended and runner-up rows, each with a reason built from the signature and cardinalities.
  - Human labels ("Grouped bar"), never ids.

### F8. No chart-type gallery; types are a native select of camelCase ids
- **Prototype:** "Change…" opens a "Choose chart type" dialog (920×600):
  - A search box.
  - A category nav: Recommended (n), All charts, Evolution over time, Ranking and comparison, Part of a whole, Distribution and matrix, Correlation, KPI, Table.
  - Cards with icon, label, description, "Needs 1 metric + 1 dimension (time)", and a "Suggested" badge.
  - A "Use Auto" footer.
- **App:** `<select id="chart-type-picker">` with options `area, bar (suggested), combo, donut, groupedBar (suggested), hbar, … multiLine, … stackedArea, … trellis`. Nothing shows a type's requirement, and inapplicable types are not greyed.
- **Severity:** major.
- **Class:** STRUCTURE. Direction §6 "Not applicable types are greyed, and hovering one shows the requirement" is also missed.
- **Fix:** The prototype's gallery dialog, with human labels, requirements and a Suggested badge.

### F9. There is no "Pinned" state, and "Back to recommended" is always shown
- **Prototype:** "Auto" versus "Chosen manually" in the type card; the pinned banner with "Use" only appears when the pick differs from the recommendation.
- **App:** "Back to recommended" appears while the type equals the suggestion ("bar (suggested)" selected). After picking pie, nothing says "Pinned"; only the unlabelled first `<p>` changes to "pie".
- **Evidence:** the type stayed "pie" after adding Total Amount and Ordered at, so the pin itself holds.
- **Severity:** minor.
- **Class:**
  - Direction §6 ("shows a 'Pinned · Back to recommended' chip") is broken.
  - Rule 10 and AC-032 pass.
- **Fix:** Show "Pinned" and "Back to recommended" only when a manual pick is active.

### F10. A manual combo pick shows no warning
- **Prototype:** combo is manual only, with the reason "Manual only: two y-axes with different scales are easy to misread", and the description says "(use with care)".
- **App:**
  - Picking combo with Count and Total Amount by category × status produced no warning. The only status is the rollup-only notice.
  - The preview drew the status series as one bar and two lines on a single 0–40 axis, and `orders.total_amount` did not appear.
- **Severity:** major.
- **Class:** AC-shaped. Direction rule 30 ("while it's active it shows a warning") has no AC of its own; the nearest is AC-030 (never recommend dual axis), which passes: combo was never suggested.
- **Fix:** While combo is active, show a warning bar with icon and text. Encode combo from two measures, as the prototype's `encode()` does (`measures: ms.slice(0,2)`).

### F11. A pinned type far over its capacity draws with no warning
- **Prototype:** `encode()` adds a warning bar with icon and text when a pinned type exceeds a cap. For example: "N slices is too many for a donut (≤ 6). A sorted bar compares them better." Or "X has N values but only 8 colours are distinguishable…".
- **App:** a pinned pie over status × category × day rendered **240 slices** with a paged legend ("1/48") and no warning.
- **Severity:** major.
- **Class:** STRUCTURE. AC-031 only constrains recommendations, which pass. Direction rule 6 ("No chart uses more than 8 categorical colours") is broken for manual picks.
- **Fix:** Show the prototype's capacity warnings for manual picks, with a one-click switch to the suggested alternative.

### F12. The pie legend doesn't match its slices
- **App:** pie over Count × category × status draws **6 slices in 6 colours**, but the legend lists only "Components, Instruments".
- **Evidence:** screenshot of `.preview-frame` after picking pie.
- **Severity:** major. Four slices have no legend entry.
- **Class:** AC-038, in spirit (a multi-series chart whose legend omits series).
- **Fix:** A pie's legend lists every slice's member, or the pie folds a second dimension away before drawing.

### F13. Legend and table headers show member ids instead of titles
- **Prototype:** the legend and Results table use member titles ("Category", "Revenue").
- **App:**
  - The combo and two-measure bar legends read "orders.count", "orders.tot…".
  - Results headers read `orders.status`, `products.category`, `orders.ordered_at.day`, `orders.ordered_at` (a duplicated time column).
  - The "Why this chart?" fields table also uses ids.
- **Severity:** major.
- **Class:** STRUCTURE.
- **Fix:** Use the Cube `title` of each member everywhere a person reads it, and drop the duplicate un-grained time column.

### F14. A debug JSON row sits above the preview
- **App:** `.chart-editor__result > pre` prints the first result row as JSON (14 px monospace, 910 px wide, wrapping to 3 lines with a time dimension), between the source chip and the preview.
- **Severity:** major. It is the most prominent text above the chart.
- **Class:** STRUCTURE.
- **Fix:** Remove it; the Results drawer already shows the rows.

### F15. Axis settings are unstyled fieldsets; legend, series and values settings are missing
- **Prototype:** Customize tab with collapsible sections:
  - **AXES:** X title switch plus input; X label rotation 0/45/90 as a segmented control; Y title; Include zero, Log scale and Gridlines switches; Y min and max.
  - **LEGEND:** Show legend switch; Position Top/Right/Bottom.
  - **SERIES (n):** per-series colour slot, Hide, Stack series.
  - **VALUES:** Data labels, number format.
  - Rows are 28 px inputs at 12 px (`.input.sm`), with section heads at 12/600.
- **App:**
  - Two `<fieldset>`s, "X axis" and "Y axis", with UA-default border `2px groove rgb(239,239,239)` in both themes, which glares in dark.
  - Inputs are 32 px at 14 px; checkboxes are 13 px.
  - The "Gridlines" label renders at x = 536 on the next line while its checkbox is at x = 1,344 on the line above, so it reads as "Logarithmic scale ☑" (the checked box is Gridlines).
  - Nothing for legend, series, data labels or stacking: `innerText` of the editor contains neither "legend" nor "series".
  - Include zero is absent.
- **Severity:** major.
- **Class:**
  - AC for the legend: direction §6 legend position and IN-2d (legend customisation). No AC names legend settings; AC-040 covers axes and passes on content.
  - Include zero is required by direction §6 Axes.
  - Styling is AC-187 (inputs).
- **Fix:** Build a Customize tab with the prototype's Axes, Legend, Series and Values sections, using switches, segmented controls and `.input.sm` rows. Add Include zero, and bind each label to its control.

### F16. "Why this chart?" is a raw rule dump, and opening it buries the preview
- **Prototype:** "▸ Why this recommendation?" expands 5 lines, each with a status icon:
  - "Signature: 0 time × 1 category × 1 measure (from Cube /v1/meta member types)"
  - "Category: 8 distinct values"
  - "Colour channel: 8 ≤ 8? legal"
  - "Trellis panels: 8 ≤ 20? fits one page"
  - "Picked Bar: 8 categories × 1 measure → bars, sorted by value"
- **App:**
  - A Fields table (Field | Kind | Distinct values, with measures showing "unknown").
  - Then, for **each of 9 candidates**, the same 7 rule ids (`no_encodings passed`, `no_dual_value_axis passed`, `high_cardinality_color passed`, …).
  - That is about 1,300 px of nested lists, which pushes the preview to y ≈ 2,200.
- **Severity:** minor.
- **Class:** rule 29 and AC-029 **pass** (signature, cardinalities, each rule with pass or fail). The presentation is STRUCTURE.
- **Fix:**
  - One trace in plain sentences with the thresholds ("Colour channel: 3 ≤ 8, legal"), led by the signature line.
  - Per-candidate rejections only where a rule failed.
  - Keep it in the inspector so the canvas doesn't move.

### F17. Pressed + hover on "Actual size" makes the label unreadable
- **App:** `button[aria-pressed=true]` "Actual size" under the pointer computed `color rgb(255,255,255)` on `background rgb(239,238,234)`. That is about **1.16:1**.
- **Severity:** minor.
- **Class:** VISUAL. Rule 2 is broken.
- **Fix:** Keep the pressed foreground and background together on hover, as the prototype's `.seg` does (accent-soft background, accent text).

### F18. The empty state is one plain sentence with no chart area
- **Prototype:** the canvas keeps a tile-sized area centred on "Add at least one metric or dimension" (16/600) with "Click fields on the left, or use the + buttons under Metrics and Dimensions." A warning bar in the Data tab says the same.
- **App:** the new local chart shows "Chart" and "Result" `h3`s over "Add a field to see data." (14/400), with no preview frame. The field pane shows "Choose a cube or view to see its fields."
- **Severity:** minor.
- **Class:** STRUCTURE. Direction §6's empty state ("an illustration, a sentence, and a primary action") is also broken.
- **Fix:** Keep the canvas, and centre a titled empty state in it that points to the field list and the "+" buttons.

### F19. The preview never reaches an error state while offline
- **App:** with DevTools set to Offline, changing a field left the preview at "Loading chart" (a line skeleton) for more than 40 s. No request or console error was recorded. On reconnecting, it resolved.
- **What I could not do:** produce a field combination Cube rejects. The field list is scoped to one cube, so no cross-cube mix is possible.
- **Severity:** minor. It is unverified whether a failed `/api/load` inside the editor shows the tile error state.
- **Class:** AC-042 (unchecked in the spec).
- **Fix:** Time out and fail to the error state (icon, message, Details, Retry) when the load cannot complete.

## 3. What already matches

- **Rule 12 / AC-027: illegal wells give a reason during a drag.** With a synthetic `dragstart` on "Average Amount":
  - Measures got `data-drop=legal` and a 2 px solid accent outline (`#1f6f86`).
  - Dimensions and Time got `data-drop=illegal`, a 2 px dashed `#c9c7c1` outline, and a visible reason with a ✕ icon, "Dimensions takes a dimension; Average Amount is a measure." (12 px `text-secondary`), wired by `aria-describedby`.
  - This is stronger than the prototype, which only sets `data-reason`.
- **Rule 11: every well is keyboard-reachable through a "+" picker.** "+ Add to Measures / Dimensions / Time…" are native selects, and adding through them re-ran the query (AC-026).
- **Rule 10 / AC-032: a manual pick stays pinned.** Pie stayed selected after adding a measure and a time dimension; "Back to recommended" exists.
- **Rule 8 / AC-030: combo is never suggested.** With two measures and two dimensions, the suggested set was bar, groupedBar and stackedBar.
- **Rule 9 / AC-028 (on the letter):** a top pick plus 2 runners-up, each reason under 80 characters.
- **Rule 29 / AC-029 (on content):** the trace lists fields, kinds, distinct values, and each hard rule's result per candidate.
- **AC-033: what's missing is named.** "⚠ This chart cannot be drawn yet. • A line needs a time dimension in Time; add 1 more." It names the well and member type, with an icon (rule 3).
- **Rule 18, loading half:** under Slow 3G, the preview showed a line-shaped skeleton, not a spinner.
- **AC-034: Actual size and Fit are offered,** and the editor returns to the dashboard.
- **AC-035: Undo, Redo and Discard work.** Discard changes restored the type to bar and the measures to Count; Undo enabled after changes.
- **The ✎ from view mode switches the dashboard into edit mode** (direction §2), and **Esc returns to the dashboard** keeping edit mode.
- **AC-036: the Results drawer has more than the prototype's:** Result rows, Underlying rows, Query and Acceleration ("Showing the first 100 of 240 rows"). It is just misplaced (F3) and uses ids (F13).
- **AC-022: the chart page lists "Used by" and offers "Add to a dashboard".**
- **Rule 4:** a two-plus-series bar shows a legend (shipped, completed, processing).
- **Rule 1:** no text below 12 px was measured in the editor (smallest: the well reason, 12 px).
- **Dark theme (rule 24):** the editor frame follows the tokens: panes `#1c1c1b` with `rgba(255,255,255,.10)` borders, text `#f2f2f0`, controls with `rgba(255,255,255,.20)` borders, and the warning chip tinted. The exception is the UA fieldset border (F15).
- **Font:** Inter throughout, matching the prototype.
