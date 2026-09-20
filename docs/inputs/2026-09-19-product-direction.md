# Product direction from the user (2026-09-19)

Raw input captured during harness setup. It is **input to project-interview**, not requirements.
Claims about third-party tools are unverified until component-research confirms them with sources.

## 1. Cube capability scope

> Before we start remember that you have to do detailed research into all functionality provided by cube js and the goal is to integrate almost all of them into UI. LIke security, pre aggregations, jobs if any, connection management and there may be many more functionality that i am missing here.

## 2. Authoring experience

> The chart building experience and authoring experience should include drag and drop, and a way to create visually appealing dashboards.. (with features like tabs, sections, global filters, cross table filters, trellis (spotfire), markdown (spotfire) and other things that i may have missed.

> … So that charts are autodrawn with option to override recommended charts... have legends for charts.. have options to customize x axis, y axis..

## 3. Chart recommendation: reference material the user provided (verbatim)

> Yes — this is one of the oldest and best-formalized problems in the field. Arity and cardinality alone won't get you all the way, but they get you surprisingly far, and there's a clean lineage of algorithms.
>
> **The theory**
>
> Mackinlay's APT (1986) set the frame that everything since uses: two criteria, expressiveness (the encoding conveys exactly the facts in the data, no more, no less) and effectiveness (of the expressive candidates, pick the one humans decode most accurately). APT ranks encoding choices based on the expressiveness and effectiveness criteria. (arxiv)
>
> Effectiveness comes from Cleveland & McGill (1984): position > length > angle > area > color/saturation, with a different ranking per data type. That ranking is literally the lookup table your scorer needs.
>
> Show Me (Mackinlay, Hanrahan, Stolte 2007) is the productized version — Tableau's chart picker — and is basically a function of the type signature of the selected fields.
>
> **The parts that are actually implementable**
>
> Draco / Draco 2 is the one I'd look at hardest. It's a formal framework representing visualization design knowledge as constraints, based on Answer Set Programming and solved with the Clingo solver, usable both to find effective designs and to validate existing ones. Finding an appropriate encoding is framed as finding an optimal answer set; the authors re-implemented APT and CompassQL in it to demonstrate expressiveness, then added constraints about the data and the user's task. Two things make it interesting for a BI tool rather than a paper: (GitHub, University of Washington)
>
> Weights are learned from graphical perception studies rather than hand-set, and Draco-Learn can fit them from ranked pairs of visualizations, which can come from experimental studies or theoretical rankings. For you that means: log which chart users keep vs. immediately swap, and retrain weights on your own telemetry. (University of Washington)
>
> v2 is pure Python (ASP knowledge base retained), so no Node+Python split. (pypi)
>
> Caveat: it emits Vega-Lite, and it's a rules engine that even experts struggle to debug — a whole VIS paper exists just to visualize its knowledge base because experts lose track of why a recommendation was made. In a BI tool you need to explain the pick to the user, so budget for that. (arXiv)
>
> Others worth knowing: CompassQL / Voyager (partial specs → enumerate + rank, good model for "show me alternatives"), VizML and Data2Vis (learned from a corpus of public charts; higher ceiling, no explainability, needs training data you don't have), and DracoGPT, which extracts design preferences out of an LLM into Draco's formalism — relevant to your phase-2 chat authoring.
>
> **The type signature, concretely**
>
> The real input isn't arity/cardinality alone, it's the multiset of measure/dimension types. With Cube you already have this for free — every field is declared as a measure or dimension with a type, which is exactly the input APT wants and is the thing most BI tools have to infer heuristically from a SQL result set.
>
> | Signature       | Cardinality condition | Pick                                                        |
> | --------------- | --------------------- | ----------------------------------------------------------- |
> | 1 Q             | —                     | histogram                                                   |
> | 1 N × 1 Q       | n ≤ ~12               | bar                                                         |
> | 1 N × 1 Q       | 12 < n ≤ ~50          | horizontal bar, sorted                                      |
> | 1 N × 1 Q       | n > ~50               | ranked bar top-k + "other", or box plot of the distribution |
> | 1 T × 1 Q       | dense, ordered        | line                                                        |
> | 1 T × 1 Q       | few, irregular points | bar                                                         |
> | 2 Q             | rows ≤ ~5k            | scatter                                                     |
> | 2 Q             | rows > ~5k            | binned heatmap / hexbin                                     |
> | 2 N × 1 Q       | n₁·n₂ ≤ ~200          | heatmap                                                     |
> | 1 N × 1 T × 1 Q | n ≤ ~7                | multi-series line                                           |
> | 1 N × 1 T × 1 Q | n > 7                 | small multiples (facet), not 7+ overlapping lines           |
> | 1 N × 2 Q       | n ≤ ~20               | scatter, N → color                                          |
> | ≥3 Q            | —                     | SPLOM or parallel coordinates                               |
>
> Cardinality doesn't just choose the mark — it governs whether an encoding channel is legal at all. Color as a nominal channel dies past ~8–10 levels; shape past ~6; faceting past ~20 panels. Those are hard constraints, not preferences, and they're what separate a usable recommender from one that offers a 400-category pie chart.
>
> **What arity and cardinality can't tell you**
>
> The same signature maps to different charts depending on task: part-to-whole → stacked bar; ranking → sorted bar; correlation → scatter; distribution → box/violin; deviation → bullet. Draco added task as an explicit input for exactly this reason. Since you're migrating ~5000 .dxp files, you have something rarer than a rules engine — a labeled corpus of real (data signature → chart choice) pairs from actual analysts. That's a training set for weights, and a validation set for whatever rules you write.
>
> **Pragmatic suggestion for Charter**
>
> Don't run Clingo in the request path. Implement it in two tiers:
>
> 1. Hard constraints in TypeScript — legality filter over the signature: channel capacity, mark/type compatibility, aggregation requirements. Fast, deterministic, explainable, ~200 lines.
> 2. Weighted soft scoring — port Draco's soft constraints and their default weights as a scoring function over the surviving candidates, then re-fit those weights from your Spotfire corpus and your own swap telemetry.
>
> Return the top candidate plus the runners-up with a one-line reason each ("42 categories — color would be unreadable, faceted instead"). That's what makes it feel like a tool rather than a black box, and it's the affordance Show Me got right.
>
> Two open-source references to read code from: Draco 2 (cmudig/draco2), and Vega-Lite's own guides/* defaults, which encode a lot of this implicitly in how it picks scales and marks when you under-specify.

## 4. Research requests

> Also do research on vega-lite

This is queued for component-research after the interview; the user asked to hold it until then. It is relevant because Draco and CompassQL emit Vega-Lite specs, and section 3 cites Vega-Lite's defaults for picking scales and marks. Cover Vega-Lite in three possible roles: a reference for wechart's engine-neutral chart spec, the recommender's intermediate representation, and an alternative renderer (the decided renderer is ECharts).

## 4b. Cube model YAML authoring

> make sure there is support for authoring cube.yaml.. + visual form/tab based editing for cube.yaml. Do analysis on the contents of the yaml so that you can provide a comprehensive ui for this purpose

## 5. Design bar

> dont go with cubejs playground, that is very basic.. and it is more like a starter playground.. definitely not what i want.. it should be more like what superset/metabase/spotfire/tableu and other enterprise bi tools can do..

## 6. Sequencing preference

> it will be great if you can start with the ui design first so that i can check it out and let you know if it is inline with my expecations

## 7. Phasing of users and groups (after prototype v1 review)

> we will do users and groups in phase 2. Not in current phase. You can go with the simplest users/groups with no admin surface if it is required for the rest of the designing or assume that it is a single user system

Surfaces the user asked to go deeper on next: chart builder, dashboards, model editor, and "Datasources, schedules and jobs".

## 8. Dashboard and chart editing feedback on prototype v2 (verbatim)

> On a dashboard, it should have option to add ui elements like tabs and sections. There should be option to add new charts. Check superset for chart editing functionality. It includes selecting the type of chart, selecting the cube/view, selecting 1 or more metric and one ore more dimensions. When i edit dashboard, i see width option inline.. that should not be there. It should be a wysiwyg experience. The charts should have a pencil like icon on top so that we can click on that and go into the chart editing experience. ... look at something like grafana, superset to check what is the experience for creating dashboards and creating charts within dashboards.

> The chart editing experience was in explore.. it threw me off.. put it in the right place. The explore page should have a folder view that lets the user select the visualization/dashboard he is interested in viewing and editing. Remove the dashboards in the top navigation.. instead have folders in explore and clicking on a dashboard in here will take them to the dashboard experience

> On the models edit page have the yaml representation on the right.. and the general, dimensions, measures..... on the left side of the page.

## 9. Answers to Claude's questions after prototype v4 (2026-09-19)

The options were written by Claude. The user chose:

- **Chart ownership:** "Dashboard-local, opt-in library (Recommended)". A chart added on a dashboard belongs to that dashboard, and editing it never changes other dashboards. "Save to folders" publishes it for reuse. A reused (shared) chart shows that it is shared, and on how many dashboards, before and while it is edited.
- **Extra dashboard elements for phase 1:** "Image" and "Link / button". The user did not choose "Embedded page (iframe)" or "None for now".

## 10. Correction: "markdown (spotfire)" meant Spotfire markings (verbatim)

> Right.... i was not refreering to markdowns.. i was referring to markings in spotfire.. can you do more research on that.. see why it is used.. and how it can be integrated.. and if you have all the information then go ahead with updating the design as well as updating the product specs

Consequences:

- The §2 item "markdown (spotfire)" is a requirement for **Spotfire-style markings**, not for Markdown text.
- Markdown text tiles in the design came from the reference products (Superset, Metabase, Looker and Grafana all have them), not from the user. They stay in the design only as a reference-derived element, pending confirmation in the interview.

## 11. Answers on markings after the research (2026-09-19)

Claude wrote the options; the user chose. Research is in `docs/design/references-markings.md` and `docs/research/cube/markings-query-support.md`.

- **Click model:** "Markings plus per-pair filtering". **Superseded by §12:** the two are per-dashboard alternatives.
  - Markings are the selection model: named, colored, dashboard-wide, and brushing by default.
  - Authors can also set a tile pair to Filter, so a click in the source filters the target directly (Power BI-style). The Interactions matrix stays.
- **Partial bars:** "Marked share full, rest faded". The marked share is drawn from the baseline in the bar's own color, and the unmarked remainder fades. Claude's option text added a pattern plus tooltip for non-additive measures (averages, distinct counts), and the user picked that option.
- **"Cross table filters"** (§2) meant **"Markings across related tables"**. Marking in one table marks the related rows in tiles on other tables; in wechart this happens through Cube joins.
- **Reopen state:** "Empty; the link carries marks (Recommended)". Saved dashboards keep marking definitions only, and a copied link or bookmark carries the current marks.

Research questions not yet put to the user are listed in `references-markings.md` ("Open questions for the user", items 4, 5 and 7–14).

## 12. Markings and cross-filtering are per-dashboard alternatives (verbatim, 2026-09-19)

> Since markings and filters are alternatives experiences, let us retain both. The dashboard will have a settings page (opened via gear icon) and we can set dashboard specific setting on whether to use markings or the cross filtering Cross Highlighting

Claude's reading, applied in `direction.md` §2, §7 and §7a:

- This supersedes the §11 "Markings plus per-pair filtering" answer.
- Each dashboard uses one mode. **Markings** mode filters through details tiles and "Filter to marked". **Cross-filtering** mode uses the per-pair Filter/Highlight/None matrix.
- A dashboard settings page (gear icon) holds the choice, and both configurations are kept.

## 13. Defaults for new dashboards and details tiles (verbatim, 2026-09-19)

> default to markings for new dashboards, message for details

- A new dashboard starts in **Markings** mode.
- A tile that gains a "Limit data using markings" setting defaults to **Message on empty background**, pre-filled with the master tiles' names.

## Open points for the interview (raised by Claude, not decided)

- The quoted material mentions migrating **~5000 Spotfire `.dxp` files** and a product named **"Charter"**. Is Spotfire migration, or using the `.dxp` corpus as training/validation data, in scope for wechart?
- Draco emits Vega-Lite, but wechart's renderer is ECharts. The recommender's output needs to be an engine-neutral chart spec, mapped to ECharts.
- "Phase-2 chat authoring" is mentioned. Confirm whether it is a phase-2 non-goal.
- The Draco claims (pure-Python v2, learned weights, Draco-Learn) need verification in component-research.
