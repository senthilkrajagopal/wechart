# Designs for approval — UI design 2026-10-18 (phase 3, R80 and R81)

**Status:** waiting for the user's approval. Nothing here is planned until it is approved.

Three static mockups for R80: modern combo charts, rich text tiles, and the LLM settings they need now. They are numbered after designs 17–19 in `../../2026-10-17/designs/index.md`. A fourth, design 23, draws R81's fifteen new chart types, designed in parallel with R80 (R81: "In parallel"); its row, notes and questions follow R80's below.

- **Format:** the same as designs 17–19. Each is a self-contained HTML file with inline CSS in direction.md's tokens, and Inter and IBM Plex Mono from Google Fonts, with no other requests. Open it in a browser. Each shows:
  - 1,440 × 900 screens with numbered pins, each followed by the notes on its pins;
  - lettered states;
  - the keyboard and accessibility rules, and every new state as an icon and a label;
  - the criteria it changes, and the questions.
- **Where they come from:**
  - R80 in `docs/requirements-log.md`: the user's eight answers, followed exactly;
  - the two studies: `docs/design/references-combo-and-rich-tiles.md` (the visualization and BI expert) and `docs/design/references-spotfire-combo-textarea.md` (the Spotfire expert);
  - research: `docs/research/rich-tiles-and-combo-tech.md` (Tiptap 3.32.0, ECharts 6.1.0, wechart-owned SVG sparklines);
  - `docs/design/references-copilot.md` §9–§10 and its open questions 7–13, for the Super-Admin settings and the "Made with Copilot" labelling;
  - the designs they build on: 2026-09-24 design 01 (the chart editor) and 05 (dashboard settings); 2026-09-27 design 08 (Security's tabs); 2026-10-17 design 18 (Security › Access tokens) and 19 (the compact header, edit mode).
- **Where the studies disagreed** and R80 didn't settle it, each design draws one answer, chosen on user fit, Spotfire migrants' expectations, safety and consistency, and asks:
  - the split: R80 chose the Spotfire study's "one dimension, all measures"; so, unlike the BI study's single split series, colour means the member and each measure needs its own mark (20-Q1);
  - axis count: R80 chose 2, the BI study's; so Spotfire's "Multiple scales" isn't drawn;
  - the warning: R80 chose "only with two unsynchronized axes" (Spotfire study); the BI study's stronger same-unit wording is kept inside that trigger (20-Q4);
  - Synchronize with different units: Tableau's same-type rule (20-Q12);
  - storage: the BI study kept Markdown as the stored form with a synced source view; the research says to store Tiptap's JSON, since `@tiptap/markdown` is beta, so the source view is dropped (21-Q1);
  - values in view mode: the BI study's "the sentence's own type" against the Spotfire study's 600 weight (21-Q2);
  - controls in text: the BI study kept them out (its N2), R80 chose Spotfire parity, so they're in.
- **Illustrative content:** people, folders, measures, values, endpoints, model names and counts are illustrative. No LLM provider's fields are claimed; a research doc covers them before build (22-Q2).
- **Rendering:** not opened in a browser. The Chrome tools didn't respond in this session (as for designs 17–19), and headless Chrome couldn't be run from the agent's worktree. The pins were placed from the layout's computed sizes, so a pin may sit a few pixels off its target; the files were checked statically for the 12 px floor and the 400 and 600 weights.
- **Keyboard:** no new shortcut. The insert menu uses the APG combobox's standard keys (↑ ↓, →, Enter, Esc). Markdown shortcuts are typing patterns. Whether the editor's standard ⌘B, ⌘I and ⌘Z stay on inside the text is asked (21-Q11).
- **Tokens:** no new colour, type size or weight; the 12 px floor and the 400 and 600 weights hold. Derived sizes (glyphs, sparkline, bullet graph, the draft card) and their provenance are in direction.md §7h, and the checklist gains rules 115–146. ~~The copilot study's proposed rules, when the copilot is taken up, follow from 147.~~ Design 23 takes rules 147–167 (direction.md §7i); the copilot study's proposed rules, when the copilot is taken up, follow from 168.

| # | File | Addresses | What it shows | You are asked to approve |
|---|---|---|---|---|
| 20 | [20-combo-chart.html](20-combo-chart.html) | R80 · changes AC-037, AC-218, AC-219, R67's offer in a combo, §6 and rule 30 · holds AC-030, AC-029, AC-176, AC-304 · rules 1–8, 17, 18, 85, 115–126 | **Screen 1: the chart editor, Customize** (pins 1–16):<br>1. the canvas line naming the axes;<br>2. Customize › Series, a row per series with Mark and Axis;<br>3. Auto per row;<br>4. Bars: side by side or stacked;<br>5. Synchronize axes;<br>6. the AC-218 warning with One axis, Synchronize, Small multiples and Table;<br>7. the Left and Right axis groups;<br>8. include zero locked, with the reason;<br>9. log scale, matching on both axes;<br>10. reference lines and bands, listed;<br>11. the legend's mark glyphs and "(right)";<br>12. axis titles with glyphs;<br>13. ticks aligned on one set of gridlines;<br>14. zero shared;<br>15. reference lines labelled in place;<br>16. a vertical band behind the marks.<br>**Screen 2: Data, split by Region** (pins 1–10): the type card naming the risk; pills with mark and axis, and the pill's menu; one mark per measure while split; "not drawn · over 8 series"; the Split by well; the count against 8; Regions shown (top k + Other); the two-part legend; colour follows the member; grouped bars and lines.<br>**States:**<br>• **A:** Series rows grouped by measure while split.<br>• **B:** the legend's menu in the chart editor; hover emphasises an axis.<br>• **C:** Synchronize on.<br>• **D:** the warning's variants: different units, same unit, an axis not at zero, none.<br>• **E:** log scale on both axes; values ≤ 0 counted; unavailable with bars.<br>• **F:** the reference form; a vertical line at a date; a horizontal band; how they draw and collide.<br>• **G:** over the limits: folding to top k + Other; the ninth series; R67 inside a combo.<br>• **H:** the axes with every series on the left.<br>• **I:** below 1,024 px.<br>• **J:** the table view and the text alternative.<br>• **K:** loading, error, a series with no data.<br>• **L:** the recommender and the "Why" trace, unchanged. | 1. **Series:** each measure's own mark (Bar, Line, Area, Point) and axis (Left, Right), from Customize › Series, the pill's menu and, in the editor, the legend; Auto per row.<br>2. **Two axes:** never automatic; zero and ticks aligned; titled with glyphs; the Right axis group only while needed.<br>3. **Synchronize axes,** offered when both axes share a format.<br>4. **Log scale** per axis, matching on both; unavailable with bars.<br>5. **The split:** one dimension across every measure; colour = member; one mark per measure; 8 series; folding, then "not drawn".<br>6. **Reference lines and bands,** horizontal and vertical, labelled in the chart.<br>7. **The AC-218 warning,** only with two unsynchronized axes, for authors.<br>8. **The criteria amendments** to AC-037, AC-218, AC-219, R67 and rule 30.<br>9. **Narrow widths and the table view** as drawn in I and J. |
| 21 | [21-rich-text-tile.html](21-rich-text-tile.html) | R80 · changes AC-208, AC-302, AC-116, AC-121, §2, §8 and rule 25 · lifts the phase 1 non-goal on controls in text · holds AC-443, AC-176, AC-200, AC-196, AC-304 · rules 1–3, 14, 18, 25, 32, 42, 85, 127–141 | **Screen 1: edit mode, editing in place** (pins 1–14):<br>1. edited on the canvas;<br>2. block styles from §3;<br>3. bold, italic, lists, link;<br>4. Insert;<br>5. "8 / 10 elements";<br>6. the insert menu by "/";<br>7. a live element's edit form;<br>8. Change and Icon with their shapes;<br>9. sparkline and bullet graph, word-sized;<br>10. Filter value and As of;<br>11. the menu's three groups;<br>12. the keyboard route in;<br>13. Elements, listed, and an element's settings;<br>14. interactions.<br>**Screen 2: view mode** (pins 1–10): values as text; the tooltip; sparkline and bullet described; Change and Icon; a parameter control; filter controls that are the bar's filters; a chart that says it follows a parameter; action buttons; the compact header agreeing; prose beside controls.<br>**Screen 3: Dashboard settings › Parameters** (pins 1–8): the section; New parameter; the list; Measure or Dimension; choices with labels, up to 1,000; Default; Used by; checked against the charts.<br>**Screen 4: Summarize** (pins 1–11): Summarize in Properties; what it covers; which facts; the draft card; every number live; the facts shown; Insert, Regenerate, Discard; who set it up; the label; "Written for earlier data"; the author's allowance.<br>**States:**<br>• **A:** the toolbar, block styles and markdown shortcuts.<br>• **B:** the insert menu by `{{`, searching measures.<br>• **C:** settings for Change, Sparkline, Icon, Bullet graph, Value with a marking, Marking, Filter value and As of.<br>• **D:** one filter in the tile and the bar; a list control's 1,000 values and search.<br>• **E:** an action button's ordered actions; 10 / 10.<br>• **F:** binding a chart's field to a parameter.<br>• **G:** loading, no data, error, no permission, a removed member, an empty tile.<br>• **H:** cross-filter mode.<br>• **I:** an existing Markdown tile opening unchanged.<br>• **J:** AI: drafting, a failed draft, the daily limit, the provider down, AI off, the viewer's label.<br>• **K:** below 1,024 px.<br>• **L:** controls in edit mode. | 1. **One Text element replacing Markdown,** existing tiles unchanged.<br>2. **Editing in place** with the toolbar, §3's block styles only, and markdown shortcuts.<br>3. **The insert menu** by `/`, Insert and `{{`, a combobox, kinds then measures.<br>4. **The eight live elements,** their edit and view forms, tooltips and states.<br>5. **Filter controls** that are the filter bar's filters; list controls of 1,000 values with search.<br>6. **Action buttons** with ordered, declared actions: page, bookmark, reset filters, export.<br>7. **Dashboard parameters** (field switch) defined in Settings › Parameters, set by a parameter control, bound from a dashboard-local chart's well, carried by bookmarks.<br>8. **10 elements per tile,** with the counter and the reason at the limit.<br>9. **AI summaries:** facts first, every number live, a draft card with Insert, Regenerate and Discard, the label, and "Written for earlier data".<br>10. **The criteria amendments** to AC-208, AC-302, AC-116, AC-121 and rule 25. |
| 22 | [22-llm-settings.html](22-llm-settings.html) | R80 · references-copilot §9 · new (no AC yet) · holds AC-001, AC-294 … AC-296, AC-470, AC-304 · rules 3, 23, 35, 64, 67, 82, 83, 85, 142–145 | **Screen 1: Security › AI, set up** (pins 1–12): the fifth tab; the state chip; Save n changes; AI on; who may use AI; provider, model, endpoint; the key stored and never shown; limits; the limit message; Test connection's checks; what's sent; usage this month.<br>**Screen 2: first setup, key refused** (pins 1–5): "Test failing · not saved"; Save held and why; the key typed once; the failed check; Test again.<br>**States:**<br>• **A:** where it lives for each person; not set up; single-user mode.<br>• **B:** replacing the key.<br>• **C:** the test running; can't reach; model not found; numbers outside live values.<br>• **D:** turning AI off.<br>• **E:** choosing AD groups.<br>• **F:** limits as authors meet them.<br>• **G:** leaving with unsaved changes.<br>• **H:** the audit trail's new events.<br>• **I:** below 1,024 px.<br>• **J:** usage loading and empty. | 1. **Security › AI** for Super-Admins, Not found for others.<br>2. **The settings:** on or off, who may use AI, provider, endpoint, model, key, limits, message.<br>3. **The key:** typed once, tested, stored, never shown; replaced only after a passing test.<br>4. **Test connection** with four checks; Save held until it passes when the connection changes.<br>5. **What's sent,** stated on the page.<br>6. **Usage** and the **audit events.** |
| 23 | [23-new-chart-types.html](23-new-chart-types.html) | R81 · changes AC-037, AC-217, AC-028, AC-031, AC-305, AC-306, rule 50 and §6's bar marks · holds AC-030, AC-029, AC-032, AC-033, AC-087, AC-093, AC-096, AC-102, AC-104, AC-107, AC-115, AC-176, AC-177, AC-178, AC-236, AC-304, AC-313 … AC-315 · rules 1–9, 12, 17, 18, 43–56, 85–89, 130–134, 147–167 | **Screen 1: the chart-type gallery** (pins 1–8): nine purposes, Flow new; each new card on its shelf; Suggested from the recommender; what each needs; greyed with what's missing; Funnel on two shelves; no gauge; Use Auto.<br>**Screen 2: a dashboard in Markings mode** (pins 1–12): the KPI tiled by Region, a tile marked; Change; sparkline and target; the marking chip; the graphical table's "$X marked"; its sparkline and bullet columns; its Icon column; the waterfall's marked share per step; a total marking its members; the bullet chart; the histogram's marked share per bin; "‹marking›'s share shown".<br>**Fifteen type sheets**, grouped by gallery purpose. Each draws the gallery card, the wells, an example on sample data, marking, cross-filtering, the recommender rule and its reason, the text alternative, and empty, over-limit and table-view frames:<br>• **Evolution over time:** 13 Timeline; 14 Calendar heatmap.<br>• **Ranking and comparison:** 3 Waterfall; 8 Bullet chart.<br>• **Part of a whole:** 9 100 % stacked bar and area; 15 Icicle (sunburst as its option).<br>• **Flow (new):** 10 Sankey; 12 Funnel.<br>• **Distribution and matrix:** 4 Histogram; 11 Box plot points and violin.<br>• **Correlation:** 5 Bubble; 7 Parallel coordinates.<br>• **Geography:** 6 Map with Regions, Points and Density layers.<br>• **KPI:** 1 KPI with comparison, target, sparkline and tile-by.<br>• **Table:** 2 Graphical table.<br>Then keyboard and accessibility, the states legend, the criteria, and research before build. | 1. **The fifteen types** as their sheets draw them, each with a table view and a text alternative.<br>2. **The gallery:** the new cards on their shelves, and a Flow shelf.<br>3. **The KPI upgraded in place**, reusing R80's Change, sparkline and bullet graph; the **graphical table** built from R80's elements.<br>4. **Marking per type:** what an item is in each, ranges where they're exact, member lists where they aren't (≤ 1,000), the Sankey link's marked share in its tooltip, and the density layer and measure stages unmarkable, said.<br>5. **The recommender rules:** new top picks only for histogram, bubble, parallel coordinates, map and bullet; every other new type a runner-up; line stays top for one measure over time.<br>6. **Empty and over-limit states** with the proposed caps.<br>7. **The criteria amendments** to AC-037, AC-217, AC-028, AC-031, AC-305, AC-306, rule 50 and §6. |

## Questions for you

Each is drawn one way, the recommended one, listed first. The way drawn is only a default until you decide.

### Design 20, the combo chart

- **20-Q1. While split, may two measures share a mark?** Colour already means the member.
  - Drawn: (a) no; each split measure has its own mark, a used mark disabled with its reason.
  - (b) Yes; the second measure's lines are dashed and its bars hatched.
  - (c) Yes, told apart by axis and legend only.
- **20-Q2. A split that would pass 8 series.**
  - Drawn: (a) fold members to the top *k* + Other first (at least one member each), then leave whole measures not drawn, last added first.
  - (b) Leave measures not drawn first, keeping every member.
  - (c) Never fold; any field past 8 is not drawn.
- **20-Q3. Log scale with bars.**
  - Drawn: (a) unavailable while either axis has bars, with the reason.
  - (b) Allowed; bars start at the axis minimum, with a note.
- **20-Q4. The warning when both axes share a format.**
  - Drawn: (a) a stronger sentence, with Synchronize first.
  - (b) One wording always.
- **20-Q5. Where the legend changes a series' mark or axis.**
  - Drawn: (a) in the chart editor only; on dashboards the legend keeps marking and toggling.
  - (b) Also in the dashboard's edit mode.
- **20-Q6. Who sees the AC-218 warning.**
  - Drawn: (a) authors only: the editor and the tile's edit mode.
  - (b) Viewers too, as an ⓘ in the tile head.
- **20-Q7. Where a reference line's value comes from.**
  - Drawn: (a) a fixed value, or the average, median, minimum or maximum of a drawn series.
  - (b) Also any measure's total from Cube with its own filters.
  - (c) Also a dashboard parameter, when what-if parameters come.
- **20-Q8. A computed line on a split chart.**
  - Drawn: (a) one line per measure, over every member.
  - (b) One per member (Spotfire's "One per color"), each counted toward the 8.
- **20-Q9. How many reference lines and bands a chart may hold.**
  - Drawn: (a) no set limit; colliding labels move.
  - (b) A limit, with "+ Line" disabled and the reason at it. The number would be yours.
- **20-Q10. Axis titles.**
  - Drawn: (a) horizontal, above each axis, with mark glyphs.
  - (b) Rotated 90° beside each axis.
- **20-Q11. Stacking.**
  - Drawn: (a) chart-wide: bars side by side or stacked, areas overlap or stacked; stacks never cross axes.
  - (b) A stack group per series.
- **20-Q12. Synchronize when the axes' formats differ ($ and %).**
  - Drawn: (a) unavailable, with the reason (Tableau requires the same data type).
  - (b) Allowed, with the warning kept and reworded.
- **20-Q13. "Index to 100" as a fifth offer.**
  - (a) Not now; research first.
  - (b) Add it now.

### Design 21, the rich text tile

- **21-Q1. Does Properties keep a Markdown source view?** The research says to store Tiptap's JSON, not markdown; controls and buttons have no markdown form.
  - Drawn: (a) no; the canvas is the editor; Markdown tiles are read in once (AC-302 amended).
  - (b) A two-way Markdown view with wechart's own mapping, for text and value tokens only.
  - (c) A read-only Markdown export.
- **21-Q2. How a value reads in view mode.**
  - Drawn: (a) the sentence's own type and weight, with a dotted underline on hover and focus.
  - (b) Always 600, as the Spotfire study proposes.
- **21-Q3. Who sees a value's tooltip.**
  - Drawn: (a) everyone, on hover and focus.
  - (b) Only authors.
- **21-Q4. What counts toward the 10.**
  - Drawn: (a) every element: live values, controls and buttons.
  - (b) Only elements that query.
- **21-Q5. May a shared chart from folders bind a dashboard parameter?**
  - Drawn: (a) no; only dashboard-local charts ("Make a local copy" first).
  - (b) Yes; the shared chart declares a parameter slot each dashboard maps.
- **21-Q6. Where parameters are defined.**
  - Drawn: (a) Dashboard settings › Parameters, also reachable from the insert menu and a well's picker.
  - (b) A Parameters list in the edit sidebar's Add tab.
- **21-Q7. Does "Reset filters" reset parameters?**
  - Drawn: (a) no; parameters keep their value.
  - (b) Yes, both to their defaults.
  - (c) A fifth action kind, "Reset parameters".
- **21-Q8. What "Export" exports.**
  - Drawn: (a) the chosen tiles' data as CSV.
  - (b) A PDF of the page (Spotfire's Export Report), after research.
  - (c) Both, PDF once researched.
- **21-Q9. The Copilot label after the author edits the paragraph.**
  - Drawn: (a) it stays, naming who inserted it and when; deleting the paragraph removes it.
  - (b) It names the last person to edit it.
  - (c) It goes once the paragraph is edited.
- **21-Q10. May a viewer ask for a summary of their own filters?**
  - (a) No; only authors draft.
  - (b) Yes, temporary, labelled "Not reviewed", never saved.
- **21-Q11. The editor's ⌘B, ⌘I and ⌘Z inside the text** (Tiptap's defaults; new keys under R75).
  - (a) Keep them, inside the text only; leaving the text hands undo back to the dashboard.
  - (b) Off; the toolbar and markdown typing only.
- **21-Q12. Which facts Copilot may cite.**
  - Drawn: (a) change against the previous period, and top and bottom contributors, now; stage A's statistics later.
  - (b) Wait for stage A.
- **21-Q13. The sparkline's and bullet graph's sizes.**
  - Drawn: (a) 64 × 16 and 96 × 16.
  - (b) 80 × 20, the body's line height.

### Design 22, the AI provider settings

- **22-Q1. Where the settings live.**
  - Drawn: (a) Security › AI, a fifth tab for Super-Admins.
  - (b) A new Admin workspace in the switcher (AC-001 amended).
  - (c) The account menu's "Instance settings…".
- **22-Q2. Which providers.**
  - (a) Anthropic, OpenAI, Azure OpenAI, Amazon Bedrock and Google, plus an OpenAI-compatible endpoint, each researched before build.
  - (b) Anthropic only.
  - (c) One provider you name.
- **22-Q3. Where the key is kept.**
  - (a) wechart's API encrypts it at rest with a server-held key, decrypts it only to call the provider, and never returns it.
  - (b) Sealed to xcube, with calls going through xcube.
  - (c) Only from a deployment secret; the page shows "Set by the deployment".
- **22-Q4. Who may use AI, by default.**
  - (a) Everyone who can edit dashboards.
  - (b) No one until groups are chosen.
- **22-Q5. How limits are counted.**
  - Drawn: (a) summaries per person per day, and for everyone per month.
  - (b) Provider tokens per month.
  - (c) No limits.
- **22-Q6. When Save needs a passing test.**
  - Drawn: (a) when the provider, endpoint, model or key changes.
  - (b) On every save.
  - (c) Never; a failing test only warns.
- **22-Q7. What the audit trail records.**
  - Drawn: (a) settings changes (never the key), key replacements, and each inserted summary with its tile.
  - (b) Settings and keys only.
  - (c) Also every draft request.
- **22-Q8. Drafts after the fact.**
  - (a) No draft kept once inserted or discarded.
  - (b) The last drafts per tile kept for 28 days.
- **22-Q9. One model, or two.**
  - Drawn: (a) one now; the copilot's fast model later.
  - (b) Default and Fast models now.
- **22-Q10. The limit message's length.**
  - Drawn: (a) 280 characters.
  - (b) 500.
- **22-Q11. Sign-in off (single-user mode).**
  - Drawn: (a) the one user manages AI as Super-Admins do.
  - (b) AI unavailable while sign-in is off.

### Design 23, the new chart types

R81 answered the study's Q1 (the `.dxp` inventory: "Proceed without them") and Q5 (gauges: "No gauge"), so they aren't asked again. The study's other questions are carried here with its numbers in brackets; Q2, Q3 and Q11–Q19 are design 23's own.

**Context for 23.** Where the drawing comes from and what's still unknown:
- **Sources:** R81 in `docs/requirements-log.md`; the study `docs/design/references-new-chart-components.md` (§4 ranking, §5 spec sketches, §7 questions); R80's elements as designs 20 and 21 draw them; the gallery as built (`chartTypeCatalog.ts`, `ChartTypeGallery.tsx`); the recommender as built (`packages/recommender/src/recommend.ts`).
- **Research before build** (design 23's last section): the shape of a Cube `geo` value; whether Cube returns min/max of a time column as a timestamp; `@echarts-x/custom-violin`, `@echarts-x/custom-bar-range` and an icicle custom series; an admin-1 boundary dataset and where uploaded GeoJSON lives; ECharts' jitter seed and `parallel` brush events; the palette validator on the waterfall pair and the points-over-ramp pair.
- **Rendering:** not opened in a browser; headless Chrome couldn't be run from the agent's worktree, as for designs 20–22. Pins were placed from the layout's sizes; the file was checked statically for balanced markup, the 12 px floor and the 400 and 600 weights.
- **Illustrative content:** measures such as Revenue target, Margin target, Return rate and the funnel's stage counts, the batches, the sales territories and the store locations.

- **23-Q1. Is the KPI with a comparison its own type, or an upgrade of today's KPI?** (study Q3)
  - Drawn: (a) upgrade KPI in place; a KPI with none of the new wells set draws exactly as today.
  - (b) A new "KPI chart" type beside KPI.
- **23-Q2. One measure over time: which is the top pick?**
  - Drawn: (a) line stays the top pick; "KPI with trend" is the first runner-up.
  - (b) KPI with trend as the top pick, as the study's sketch has it.
- **23-Q3. Saved charts in Auto whose top pick the new rules change** (for example 3 measures and a dimension, a bar today, a bubble under the new rules).
  - Drawn: (a) they keep drawing what they drew until their fields next change; nothing on a published dashboard changes by itself.
  - (b) They redraw under the new rules at release.
  - (c) A migration pins each to its current type, as "Chosen manually".
- **23-Q4. Where histogram bins come from.** (study Q2)
  - Drawn: (a) both: a bin dimension made in the model for numeric dimensions (exact, a range to mark), and browser binning of per-entity values for measures, with "Computed from n of N".
  - (b) Model bins only.
  - (c) Browser binning only.
- **23-Q5. The new caps** (no reference publishes them). (study Q4)
  - Drawn: (a) KPI tiles ≤ 20 (the trellis panel cap); graphical-table rows ≤ 50 a page; parallel-coordinate lines ≤ 1,000 (the marking cap, AC-102); Sankey flows ≤ 50 (Cube Cloud's); calendar ≤ 366 days a panel, offered from 56 days; bubble shapes ≤ 6 (§5 already); bullet bands 2–3 (R80's three greys; the study proposed 2–4, but a fourth band needs a new colour); histogram bins 5–50.
  - (b) Other values, yours.
- **23-Q6. Geo scope** (overlaps phase 3's "is geo-analytics in scope?"). (study Q6)
  - Drawn: (a) now: admin-1 boundaries, custom GeoJSON uploaded by the semantic-layer engineer, a points layer from Cube `geo` dimensions, and a density layer; no tile basemap.
  - (b) Admin-1 only.
  - (c) Defer all geo to phase 3.
- **23-Q7. The timeline's data shape.** (study Q7)
  - Drawn: (a) both: one ungrouped row per bar, and first-to-last per member, after research shows Cube returns min/max of a time column as a timestamp.
  - (b) Ungrouped rows only.
- **23-Q8. Keyboard marking on the new types** (AC-176 needs your OK). (study Q8)
  - Drawn: (a) yes, with §7a's existing keys and roving focus on every new type, and From/To sliders per axis for parallel-coordinate brushing. No new shortcut either way.
  - (b) The table view only (AC-178).
- **23-Q9. The hierarchy's form.** (study Q9)
  - Drawn: (a) icicle by default, sunburst as an option: lengths read better than angles.
  - (b) Sunburst only, as Metabase and Superset ship it.
- **23-Q10. New packages.** (study Q10)
  - Drawn: (a) research the violin and bar-range packages before import, and draw with wechart's own custom series if a package is unmaintained.
  - (b) wechart's own custom series only.
- **23-Q11. A ninth gallery shelf, Flow?**
  - Drawn: (a) yes: Flow holds Sankey and Funnel; Funnel also stays under Ranking and comparison.
  - (b) No new shelf: Sankey under Part of a whole, Funnel under Ranking and comparison.
- **23-Q12. The waterfall's increase and decrease colours.**
  - Drawn: (a) §5's diverging ends, blue up and red down, totals in `text-secondary`; every label with ▲ or ▼ and a sign.
  - (b) Green and red, Spotfire's default; this needs an exception to "status colours are never series colours".
  - (c) One colour, told apart by ▲/▼ and the sign only.
- **23-Q13. Bubble sizes.**
  - Drawn: (a) area-proportional, from 8 px (§6's marker minimum) to 40 px across at any tile size.
  - (b) The largest grows with the plot, a tenth of its shorter side.
- **23-Q14. The KPI tile's sparkline.**
  - Drawn: (a) R80's sparkline at the tile's content width × 32 px (132 × 32 when tiled).
  - (b) R80's 64 × 16 beside the value, as in text.
- **23-Q15. 100 % stacked in the gallery.**
  - Drawn: (a) two cards, presets of Stacked bar and Stacked area with Stack at 100 %.
  - (b) Only the Customize option, as the study's sketch has it.
- **23-Q16. The funnel's form.**
  - Drawn: (a) bars on one baseline, in stage order, with conversion labels; no trapezoid.
  - (b) Bars by default, the trapezoid as an option.
  - (c) The trapezoid by default.
- **23-Q17. The calendar's first day of the week.**
  - Drawn: (a) from the browser's locale.
  - (b) Monday always.
  - (c) Sunday always.
- **23-Q18. The icicle's click.**
  - Drawn: (a) click marks; double-click, or the tile menu's "Zoom into", zooms, with a breadcrumb back.
  - (b) Click zooms (ECharts' default); Ctrl/⌘+click marks.
- **23-Q19. The map in the gallery.**
  - Drawn: (a) Country map becomes "Map", with Regions, Points and Density layers; existing country maps open as a Regions layer on Countries, unchanged.
  - (b) A card per layer: Region map, Point map, Density map.

### For direction.md

- **D-Q1. Rule numbering.** These designs take rules 115–146 (§7h). direction.md said the copilot's rules would follow 114, from 115; ~~they now follow these, from 147, when the copilot is taken up~~ design 23 takes 147–167 (§7i), so the copilot's rules follow from 168 when the copilot is taken up. The design-21 and 22 rules (138–145) already cover the shared AI settings and labelling; the copilot's rules 103 and 104 (its numbering) overlap them and would be merged then.
- **D-Q2. Rule 30 and §6's dual-axis sentence.** Amended as design 20's criteria table says, once approved.
- **D-Q3. §7i (design 23).** Its tokens and rules 147–167 are proposed with design 23 and amend §6's bar marks for histograms and waterfalls, and rule 50's wording; they are accepted or changed with design 23's answers.
