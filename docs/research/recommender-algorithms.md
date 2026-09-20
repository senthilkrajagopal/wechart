---
library: chart recommendation algorithms
packages: []
version: draco 2.0.1
researched: 2026-09-19
sources:
  [
    https://github.com/cmudig/draco2/tree/v2.0.1/draco/asp,
    https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf,
    https://arxiv.org/abs/2308.14247,
    https://idl.cs.washington.edu/files/2016-CompassQL-HILDA.pdf,
    https://github.com/vega/compassql/tree/master/src/ranking,
    https://github.com/vega/vega-lite/tree/v6.4.3/src/compile,
    https://idl.cs.washington.edu/files/2010-MTurk-CHI.pdf,
  ]
---

# Chart recommendation algorithms — Draco 2.0.1 as reference

## Summary

Reference material for wechart's own TypeScript recommender (AC-028 … AC-031). Nothing here is
installed: `packages:` is empty and no code is imported. The decided design is hard legality rules
plus weighted soft scoring, so the question is which published rules and weights can be **ported**
and which must be **re-derived**. Verdict up front: Draco 2's hard constraints port well; its soft
weights are portable integers but are **hand-tuned, not learned**; the signature→chart table and
three of the four AC-031 caps in `docs/inputs/2026-09-19-product-direction.md` §3 are **not**
supported by the sources cited there.

## Verification of the §3 claims

| §3 claim                                                                                                             | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Draco 2 is pure Python (ASP knowledge base retained), so no Node+Python split"                                      | **Misleading.** Draco 2.0.1's own code is Python + ASP and its wheel is `py3-none-any`, but it requires Python `>=3.10,<3.12` and `clingo>=5.5.2,<6`, which ships only platform-specific native wheels [pypi-draco][pypi-clingo]. It removes _Draco 1's_ JS half; for a TS app it **adds** Python (or Pyodide/WASM [draco-pyodide]). See `docs/research/vega-lite.md` §G.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| "Weights are learned from graphical perception studies rather than hand-set"                                         | **False for the shipped default weights.** The paper calls the default configuration "Draco-CQL … hand-tuned weights" and states that in it "the weights for all features related to task are zero" [draco1-p8]. Confirmed in the pinned file: every `value_*` and `summary_*` constant in `weights.lp@v2.0.1` is `0` [draco-weights-201]. The learned weights (Draco-Learn) are **not** what ships.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| "Draco-Learn can fit them from ranked pairs of visualizations"                                                       | **True, with scope limits.** RankSVM over pairwise cost differences, `f(v1,v2)=Cost(v1)−Cost(v2)=wᵀ(x1−x2)`, trained by linear regression on hinge loss [draco1-p6]. Implemented as `train_model(X, test_size=0.3, C=1)` using `sklearn.svm.LinearSVC(C=C, fit_intercept=False)`, with half the pairs negated to balance classes [draco-learn-py]. Training data: ~1,100 ranked pairs from Kim & Heer and 10 pairs from Saket et al.; 93% test accuracy vs 65% for the hand-tuned model — but only over a **restricted design space** (3 encodings, the ones those studies covered) [draco1-p7][draco1-p8].                                                                                                                                                                                                                                                                                                                                                                     |
| "Draco emits Vega-Lite"                                                                                              | **Only via Python.** The native spec format is Draco's own entity/attribute tree; Vega-Lite comes out of the optional `AltairRenderer`, capped at Altair 5.x → Vega-Lite **v5** schema by `altair<6` [draco2-paper]. Already documented in `docs/research/vega-lite.md` §G.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| The signature→chart table ("1 N × 1 Q, n ≤ ~12 → bar", "n > 7 → small multiples", "2 Q, rows ≤ ~5k → scatter", etc.) | **Not supported by the cited sources.** Draco contains no signature→mark lookup table; it scores encodings, and its mark preferences are conditioned on continuous/discrete _combinations_, not on cardinality (`c_c_point`, `c_d_overlap_bar`, `d_d_rect`, …) [draco-soft]. Vega-Lite never picks the mark at all — `mark` is required [vl-unit]. CompassQL scores type↔channel, not signature↔mark [cql-typechannel]. The numbers 12, 7 and 50 do appear in Draco, but attached to **different quantities**: `bin_high` fires at bin count `B > 12`, `bin_low` at `B <= 7`, `horizontal_scrolling_x` at x-cardinality `N > 50` [draco-soft-thresholds]. UNVERIFIED: the 5k-row scatter cutoff, the 200-cell heatmap cutoff, "n > 7 → facet", and "n₁·n₂ ≤ 200 → heatmap". No source found.                                                                                                                                                                                    |
| "colour dies past ~8–10 levels; shape past ~6; faceting past ~20 panels — these are hard constraints"                | **Mostly wrong as stated.** In Draco these are _soft_ penalties, not hard constraints: `high_cardinality_categorical_grt10` at `N > 10` (weight 10), `high_cardinality_shape` at `N > 8` (weight 10) [draco-soft-thresholds][draco-weights-201]. The only published **hard** number is shape: "Vega-Lite only implements 8 shape types; we can use the integrity constraint `:- channel(E,shape), cardinality(E,C), C > 8`" [draco1-p4] — corroborated by Vega's default symbol range, which has exactly 8 entries [vega-config]. So the shape number is **8, not 6**. For colour, the nearest published anchors are Draco's 10, Vega's default `tableau10` scheme (10 swatches) [vega-config] and ColorBrewer's qualitative maximum of 12 [colorbrewer]. UNVERIFIED: any 20-panel facet limit; Draco's nearest rule is `horizontal_scrolling_col` at column-count `N > 5` [draco-soft-thresholds], and Vega-Lite documents no panel maximum (`docs/research/vega-lite.md` §C). |

## 1. Draco 2: repository, licence, version, constraint files

- Repo `cmudig/draco2`, MIT, default branch `main`, not archived, 15 open issues, last push 2026-09-15 [gh-draco2].
- Latest release: **PyPI `draco` 2.0.1**, 2024-02-02. No newer release [pypi-draco]. **Pin v2.0.1 and read the `.lp` files at the `v2.0.1` tag, not `main`** — they have drifted (`hard.lp` 13,784 B at the tag vs 14,306 B on main; `soft.lp` 29,339 vs 30,061; `weights.lp` 5,131 vs 5,262) [draco-asp-201][draco-asp-main].
- Knowledge base, `draco/asp/` at v2.0.1 [draco-asp-201]:

| File             | Bytes  | Contents                                                                                                                                                                     |
| ---------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `define.lp`      | 2,665  | domains: marks point/bar/line/area/text/tick/rect; channels x/y/color/size/shape/text/detail; facet row/col; field types string/number/boolean/datetime; tasks value/summary |
| `constraints.lp` | 937    | 5 meta-validations (`invalid_domain`, `duplicate_attribute`, `duplicate_field_name`, `existing_field`, `attribute_entity`) plus `:- violation(_).` [draco-constraints]       |
| `generate.lp`    | 2,334  | choice rules that enumerate the design space                                                                                                                                 |
| `helpers.lp`     | 8,081  | derived predicates (continuous/discrete, overlap, …)                                                                                                                         |
| `hard.lp`        | 13,784 | 59 `violation(<name>)` rules — the legality layer                                                                                                                            |
| `soft.lp`        | 29,339 | 151 `preference(<name>, …)` rules                                                                                                                                            |
| `weights.lp`     | 5,131  | one `#const <name>_weight = <int>.` per soft constraint                                                                                                                      |
| `optimize.lp`    | 93     | `#minimize { W,F,Q: preference_weight(F,W), preference(F,Q) }.` [draco-optimize]                                                                                             |

- **Are the soft constraints and default weights published in a portable form? Yes.** `soft.lp` is a flat
  list of named rules each with a one-line `%` description, and `weights.lp` is a flat list of integer
  constants keyed by the same names. `draco/weights.py` reads `weights.lp`, and for every constant
  ending in `_weight` emits `preference_weight(<name>, <name>_weight)` [draco-weights-py]. So the
  weight table is a plain name→int map, directly transcribable into a TS object.
- Caveat on counts: two reads of `weights.lp` returned 154 and 162 `#const` lines. UNVERIFIED — read
  the count from the pinned file.

## 2. Draco hard constraints mapping to our legality rules

All from `hard.lp` [draco-hard]. Names are the atoms inside `violation(...)`; port the name so the
AC-029 trace can quote it.

- **AC-030 (never two value axes).** Nearest Draco rules: `bar_tick_continuous_x_y` (bar and tick
  cannot have both x and y continuous) and `aggregate_not_all_continuous`. Draco has no rule
  forbidding a _second value axis_ on one chart, because its design space has one mark per view and
  no dual-axis construct [draco-define]. **AC-030 must be re-derived.**
- **AC-031 caps.** Only shape has a published hard analogue: `C > 8` [draco1-p4]. Colour, trellis
  panels, pie slices and heatmap cells are soft penalties or absent. **AC-031's four numbers are
  product decisions, not ported rules.**
- **Directly portable legality rules** (grouped): type/scale — `scale_type_data_type`,
  `bin_n_d`, `aggregate_num_valid`, `aggregate_t_valid`, `bin_and_aggregate`, `count_with_field`,
  `count_without_q`, `zero_d_n`, `zero_linear`, `log_non_positive`, `log_zero_included`;
  mark/channel compatibility — `shape_without_point`, `shape_not_ordinal`, `size_without_point_text`,
  `size_negative`, `text_mark_without_text_channel`, `text_channel_without_text_mark`,
  `point_tick_bar_without_x_or_y`, `line_area_without_x_y`, `line_area_with_discrete`,
  `bar_tick_continuous_x_y`, `rect_without_d_d`, `bar_area_without_zero`, `area_bar_with_log`,
  `bar_tick_area_line_without_continuous_x_y`; well-formedness — `no_encodings`,
  `encoding_no_field_and_not_count`, `encoding_repeat_channel`, `scale_repeat_channel`,
  `encoding_channel_without_scale`, `scale_channel_without_encoding`, `same_field_x_and_y`,
  `count_twice`, `view_scale_conflict`; faceting — `row_no_y`, `col_no_x`,
  `facet_no_duplicate_field`, `facet_no_duplicate_channel_on_same_view`; stacking —
  `stack_without_bar_area`, `stack_without_summative_agg`, `stack_without_x_y`, `stack_discrete`,
  `stack_without_discrete_color_or_detail`, `no_stack_with_bar_area_discrete_color`,
  `stack_with_non_positional_non_agg`; data validity — `invalid_num_rows`, `invalid_unique`,
  `invalid_bin`, `invalid_extent_order`, `invalid_extent_non_number`, `invalid_std`,
  `invalid_non_number_std`, `invalid_non_string_freq`, `enforce_order`; plus `detail_without_agg`,
  `detail_not_ordinal`, `aggregate_detail`, `categorical_not_color`.
- Draco distinguishes **well-formedness** ("cannot be rendered") from **expressiveness**
  ("conveys all and only the facts in the data", e.g. `:- channel(E,size), type(E,nominal)`)
  [draco1-p4]. Worth keeping as two categories in the AC-029 trace.

**How soft weights are expressed.** Each violation costs its weight, once per violation:
`Cost(v) = Σ wᵢ · n_pᵢ(v)`, with `n_pᵢ` = the number of times constraint `i` is violated
[draco1-p5]. Lower cost is better. Weights are non-negative integers (many are `0`). This is exactly
a weighted soft-scoring function and maps 1:1 onto the decided TS design. Sample values at v2.0.1:
`high_cardinality_ordinal 10`, `high_cardinality_categorical_grt10 10`, `high_cardinality_shape 10`,
`high_cardinality_size 1`, `horizontal_scrolling_x 20`, `horizontal_scrolling_col 20`,
`non_pos_used_before_pos 10`, `multi_non_pos 3`, `categorical_color 10`, `ordinal_shape 11`,
`c_c_point 0`, `c_d_no_overlap_bar 0`, `d_d_rect 0`, `d_d_point 0`, and all 28 `value_*`/`summary_*`
task weights `0` [draco-weights-201]. Full soft-rule thresholds found: `bin_high B>12`,
`bin_low B<=7`, `bin_low_unique U<15`, `high_cardinality_ordinal N>30`,
`high_cardinality_categorical_grt10 N>10`, `high_cardinality_shape N>8`,
`high_cardinality_size N>100`, `horizontal_scrolling_x N>50`, `horizontal_scrolling_col N>5`,
`position_entropy N>100 and EN<=3000` [draco-soft-thresholds].

**Python API worth mirroring in TS** (for AC-029): `Draco.check_spec(spec) -> bool`,
`Draco.get_violations(spec)` (lists violated hard constraints _without_ enforcing
`:- violation(_)`, i.e. a pass/fail trace), `Draco.count_preferences(spec)` (name → violation
count), `Draco.complete_spec(spec, models=n)` (top-n completions), property
`soft_constraint_names` [draco-py]. `get_violations` + `count_preferences` is precisely the shape
AC-029 and AC-028 need.

## 3. CompassQL / Voyager: enumerate + rank

- A CompassQL query is a **partial specification with enumeration specifiers** (wildcards, written
  as capitals: `mark: M` means enumerate bar/line/area/point), plus `choose by`, `order by` and
  `group by` clauses [cql-p3].
- Pipeline: **enumerate** candidates → drop those violating query and **expressiveness** constraints
  (e.g. quantitative on `shape` is "misleading since different shapes are unordered") → **rank** by
  a named function → **group** to cut redundancy, then choose one representative per group
  [cql-p3][cql-p2].
- `Effectiveness` is the default ranking function and is "provided natively by the query engine"; it
  depends only on the specification and simple statistics such as cardinality [cql-p3].
- Source modules: `src/ranking/{ranking.ts, aggregation.ts, fieldorder.ts}` and
  `src/ranking/effectiveness/{axis, dimension, facet, mark, sizechannel, type, typechannel}.ts`
  [cql-ranking-dir][cql-eff-dir].
- **`TypeChannelScorer` is the single most portable table** — negative penalties per (type, channel)
  [cql-typechannel]:
  - continuous (Q, T, timeUnit-T): `x 0, y 0, size −0.575, color −0.725, text −2, opacity −3,
shape −10, row −10, column −10, detail −20`
  - ordered (binned-Q, timeUnit-O, O): `x 0, y 0, size −0.575, color −0.725, opacity −3,
shape −3.1, text −3.2, row −0.75, column −0.75, detail −4`
  - nominal: `x 0, y 0, color −0.6, shape −0.65, row −0.7, column −0.7, text −0.8, detail −2,
size −3, opacity −3.1`
  - key: `x −1, y −1, detail −1`, other channels = nominal score − 2
- Reusable as the model for AC-028's "runner-up": Voyager's Main View **groups by data query, picks
  the most effective member of each group, then orders groups**, so alternatives differ meaningfully
  rather than being transposes of each other [cql-p5]. Show Me Alternatives is expressed as
  `group by ChartType(s); choose by Effectiveness(s,D); order by Effectiveness(s,D)` [cql-p4].
- **Maintenance:** npm `compassql` 0.21.2, BSD-3-Clause, depends on `vega-lite ^3.3.0`; tag commit
  2019-08-20; only dependabot commits since (`docs/research/vega-lite.md` §G). Treat as a **reference
  to read, not a dependency**.

## 4. Vega-Lite's defaults when under-specified

Already researched in depth; do not duplicate. See `/Users/srajagopal/Work/wechart/docs/research/vega-lite.md` §B, which pins v6.4.3 and
lists every decision site. Two facts that bear directly on this doc:

- **The `guides/*` path named in §3 does not exist in Vega-Lite.** The defaults live in
  `src/compile/scale/{type,properties,range}.ts`, `src/compile/mark/init.ts`, `src/stack.ts`,
  `src/channeldef.ts`, `src/encoding.ts`, `src/compile/axis/*`, `src/compile/legend/*`,
  `src/scale.ts`, `src/config.ts` [vl-compile-dir].
- **Vega-Lite never picks the mark, and none of those functions reads cardinality.** `mark` is a
  required property of a unit spec [vl-unit]. So Vega-Lite is a source for _scale/axis/legend/stack_
  defaults only — it contributes nothing to AC-028 or AC-031.

## 5. Published basis for the channel-capacity thresholds

- **Shape — 8, published and hard.** "Vega-Lite only implements 8 shape types; we can use the
  integrity constraint `:- channel(E,shape), cardinality(E,C), C > 8`" [draco1-p4]. Vega's default
  `range.symbol` is `['circle','square','triangle-up','cross','diamond','triangle-right',
'triangle-down','triangle-left']` — 8 entries [vega-config]. The §3 figure of "~6" has no source.
- **Colour — soft, 10-ish.** Draco `high_cardinality_categorical_grt10` at `N > 10`, weight 10
  [draco-soft-thresholds][draco-weights-201]; Vega default categorical scheme `tableau10` = 10
  [vega-config]; ColorBrewer qualitative schemes top out at 12 classes [colorbrewer]. UNVERIFIED:
  a peer-reviewed "maximum N distinguishable colours" number. Healey 1996 is the usual citation for
  ~7 preattentively distinguishable colours, but no retrievable copy of the paper was reached
  (`csc2.ncsu.edu/.../vis.96.pdf` 404s; the author's _Perception in Visualization_ page states no
  numeric limit [healey-pp]). **Do not cite "8–10" to the literature.** AC-031's 8 is a product
  decision and should be recorded as such in the spec.
- **Facet panels — no published number found.** Draco's nearest is `horizontal_scrolling_col` at
  `N > 5`, a soft penalty of weight 20 [draco-soft-thresholds][draco-weights-201]. Vega-Lite
  documents no panel maximum. AC-031's 20 is a product decision. Same for the 6-slice pie and
  200-cell heatmap caps: UNVERIFIED, no source found.

## 6. Cleveland & McGill's ranking, and how APT uses it per data type

- **Cleveland & McGill (1984), JASA 79(387):531–554, doi:10.1080/01621459.1984.10478080.**
  UNVERIFIED — no retrievable full text was reached (JSTOR/T&F paywalled; four course mirrors 404 or
  DNS-fail). **Do not transcribe their ordered list from memory.**
- **Verified empirical substitute: Heer & Bostock (CHI 2010)**, a direct replication. Their 9 tasks,
  ordered by measured log absolute error (lower = more accurate) [hb-p3][hb-p4]:
  1. T1–T3 position along a common scale · 2. T4–T5 length · 3. T6 angle (pie) ·
  2. T7 circular area (bubble) · 5. T8–T9 rectangular area (aligned rectangles, treemap).
     Their caveats matter for AC-028 reasons: "our results suggest that the tasks ranked by Cleveland
     and McGill may not reflect actual user performance"; angle did **not** underperform length in the
     original study [hb-p4]. So publish the ordering as _position > length > angle > area_, and treat
     finer distinctions as unsupported.
- **APT (Mackinlay 1986, ACM TOG 5(2):110–141, doi:10.1145/22949.22950).** The paper's own ranking
  figure is UNVERIFIED (no retrievable copy; `research.tableau.com` now 301-redirects all paper PDFs
  to a landing page). What _is_ verified is the Draco team's faithful re-encoding, **Draco-APT**,
  which is the per-data-type table §3 asks for — priority level in `[w@P,E]`, lower = more effective
  [draco1-p6]:

  | Data type    | Channel order (most → least effective)       |
  | ------------ | -------------------------------------------- |
  | quantitative | x (1), y (1), size (2), color (3)            |
  | ordinal      | x (1), y (1), color (2), size (3)            |
  | nominal      | x (1), y (1), color (2), shape (3), size (4) |

  APT is a **strict priority ordering** ("each field is assigned to the most effective channel for
  the corresponding data type in order of decreasing user-specified importance"), solved as
  lexicographic optimisation over priority levels, not as a single weighted sum [draco1-p6].

- Draco's own framing: "APT uses a ranking of encoding channels by data type informed by
  Cleveland & McGill" [draco1-p2]. Draco's two criteria are the APT pair: expressiveness and
  effectiveness [draco1-p4].
- CompassQL's `TypeChannelScorer` (§3 above) is the same idea as a continuous weighted table rather
  than priority levels — the better fit for wechart's decided "weighted soft scoring" [cql-typechannel].

## 7. What must be re-derived, and what is unverifiable

**Port directly (name + rule + weight, all machine-readable):**

- The 59 `hard.lp` violation names as the AC-029 legality trace [draco-hard].
- The 151 `soft.lp` names with their `%` descriptions (usable verbatim as AC-028's ≤80-char reasons —
  e.g. "Prefer not to use categorical (color) for fields with high cardinality" is 68 chars) and the
  `weights.lp@v2.0.1` integers [draco-soft][draco-weights-201].
- `Cost(v) = Σ wᵢ·n_pᵢ(v)`, minimised [draco1-p5].
- CompassQL's `TypeChannelScorer` table [cql-typechannel].
- Draco-APT's per-type channel order [draco1-p6].
- Vega-Lite's scale/axis/legend/stack defaults (`docs/research/vega-lite.md` §B).

**Must be re-derived (no source exists):**

- AC-030's "never two value axes" — Draco's design space has no dual-axis construct.
- AC-031's colour (8), trellis (20), pie (6) and heatmap (200) caps. Only shape has a published hard
  number, and it is 8.
- The entire §3 signature→chart table, including the 12 / 50 / 5k / 200 / 7 thresholds.
- Mark selection from a field signature: neither Draco, CompassQL nor Vega-Lite exposes one.
- Pie/donut, box plot, SPLOM and parallel-coordinates candidates — Draco's mark domain is
  point/bar/line/area/text/tick/rect only [draco-define].
- ECharts output. Draco emits Vega-Lite v5 only through Python/Altair; the recommender's output must
  be wechart's engine-neutral spec (`docs/research/vega-lite.md` §H).

**Unverified / open:**

- Cleveland & McGill 1984's canonical ordered list, verbatim (paywalled; use Heer & Bostock instead).
- Mackinlay 1986's own ranking figure (use the Draco-APT encoding instead).
- Any published maximum number of distinguishable colours or facet panels.
- The exact `#const` count in `weights.lp` (154 vs 162 across two reads).
- Whether `weights.lp@v2.0.1` is numerically identical to the paper's Draco-CQL weights. The
  task weights being all-zero is consistent with it [draco1-p8][draco-weights-201], but no
  file-level statement of provenance exists — `weights.lp` opens only with `% Weights as constants`.
- Re-fitting weights from a Spotfire `.dxp` corpus or swap telemetry (§3's suggestion) depends on the
  open scope question in the input doc §"Open points"; not decided.

[pypi-draco]: https://pypi.org/pypi/draco/json
[pypi-clingo]: https://pypi.org/pypi/clingo/json
[gh-draco2]: https://api.github.com/repos/cmudig/draco2
[draco-asp-201]: https://github.com/cmudig/draco2/tree/v2.0.1/draco/asp
[draco-asp-main]: https://github.com/cmudig/draco2/tree/main/draco/asp
[draco-hard]: https://github.com/cmudig/draco2/blob/v2.0.1/draco/asp/hard.lp
[draco-soft]: https://github.com/cmudig/draco2/blob/v2.0.1/draco/asp/soft.lp
[draco-soft-thresholds]: https://github.com/cmudig/draco2/blob/main/draco/asp/soft.lp
[draco-weights-201]: https://github.com/cmudig/draco2/blob/v2.0.1/draco/asp/weights.lp
[draco-constraints]: https://github.com/cmudig/draco2/blob/main/draco/asp/constraints.lp
[draco-optimize]: https://github.com/cmudig/draco2/blob/main/draco/asp/optimize.lp
[draco-define]: https://github.com/cmudig/draco2/blob/main/draco/asp/define.lp
[draco-weights-py]: https://github.com/cmudig/draco2/blob/main/draco/weights.py
[draco-learn-py]: https://github.com/cmudig/draco2/blob/main/draco/learn.py
[draco-py]: https://github.com/cmudig/draco2/blob/main/draco/draco.py
[draco-pyodide]: https://registry.npmjs.org/draco-pyodide/latest
[draco2-paper]: https://arxiv.org/abs/2308.14247
[draco1-p2]: https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf#page=2
[draco1-p4]: https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf#page=4
[draco1-p5]: https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf#page=5
[draco1-p6]: https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf#page=6
[draco1-p7]: https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf#page=7
[draco1-p8]: https://idl.cs.washington.edu/files/2019-Draco-InfoVis.pdf#page=8
[cql-p2]: https://idl.cs.washington.edu/files/2016-CompassQL-HILDA.pdf#page=2
[cql-p3]: https://idl.cs.washington.edu/files/2016-CompassQL-HILDA.pdf#page=3
[cql-p4]: https://idl.cs.washington.edu/files/2016-CompassQL-HILDA.pdf#page=4
[cql-p5]: https://idl.cs.washington.edu/files/2016-CompassQL-HILDA.pdf#page=5
[cql-ranking-dir]: https://github.com/vega/compassql/tree/master/src/ranking
[cql-eff-dir]: https://github.com/vega/compassql/tree/master/src/ranking/effectiveness
[cql-typechannel]: https://github.com/vega/compassql/blob/master/src/ranking/effectiveness/typechannel.ts
[vl-unit]: https://github.com/vega/vega-lite/blob/v6.4.3/src/spec/unit.ts
[vl-compile-dir]: https://github.com/vega/vega-lite/tree/v6.4.3/src/compile
[vega-config]: https://github.com/vega/vega/blob/v6.4.0/packages/vega-parser/src/config.js
[hb-p3]: https://idl.cs.washington.edu/files/2010-MTurk-CHI.pdf#page=3
[hb-p4]: https://idl.cs.washington.edu/files/2010-MTurk-CHI.pdf#page=4
[healey-pp]: https://www.csc2.ncsu.edu/faculty/healey/PP/index.html
[colorbrewer]: https://colorbrewer2.org/
