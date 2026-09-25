---
library: ECharts boxplot + quartile computation
packages: []
version: 6.1.0
researched: 2026-09-25
sources:
  [
    https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/boxplot.md,
    https://echarts.apache.org/handbook/en/concepts/data-transform/,
    https://github.com/apache/echarts/blob/6.1.0/src/chart/boxplot/prepareBoxplotData.ts,
    https://github.com/apache/echarts/blob/6.1.0/extension-src/dataTool/index.ts,
    https://raw.githubusercontent.com/apache/echarts-examples/gh-pages/public/examples/ts/boxplot-light-velocity.ts,
    https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/percentiles.mdx,
    https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/measures.mdx,
    https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/queries.mdx,
    https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/sql-api/reference.mdx,
    https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/pre-aggregations/non-additivity.mdx,
    https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/explore-analyze/charts/chart-types/boxplot.mdx,
    https://www.postgresql.org/docs/current/functions-aggregate.html,
    https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/PERCENTILE_CONT.html,
    https://learn.microsoft.com/en-us/sql/t-sql/functions/percentile-cont-transact-sql?view=sql-server-ver17,
    https://docs.snowflake.com/en/sql-reference/functions/percentile_cont,
    https://docs.databricks.com/aws/en/sql/language-manual/functions/percentile_cont,
    https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/navigation_functions,
    https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html,
    https://stat.ethz.ch/R-manual/R-devel/library/grDevices/html/boxplot.stats.html,
  ]
---

# ECharts boxplot + quartile computation 6.1.0

(ECharts pinned at 6.1.0, as in `docs/research/echarts.md`. Cube is the user's fork of **v1.7.45**. I read Cube files in `/Users/srajagopal/Work/bi/cube`, which is on branch `feat/introspection-package` (`/Users/srajagopal/Work/bi/cube/.git/HEAD`). The input `docs/inputs/2026-09-25-cube-introspection-package.md` says that branch leaves Cube's own files unchanged from v1.7.45. I did not verify that claim as a whole, but I spot-checked five files against the upstream `v1.7.45` tag and all five matched: `CubeValidator.ts`, `measures.mdx`, `percentiles.mdx`, `sql-api/reference.mdx` and `measure_matcher.rs`.)

## Summary

This covers **AC-306** (a box plot of a numeric value by a category, with whiskers set by a chart option: Tukey 1.5 × IQR with dots beyond it by default, or min/max; `[R8, R19]`). It also touches **AC-307 / M3**, the 3 s p95 target for a 10-tile dashboard (requirements Part 1 §4 and §P2.3), and the Superset parity panel "Days to Ship Distribution by Shipper" (`/Users/srajagopal/Work/wechart/docs/design/superset-parity.md` §2).

Findings:

1. **ECharts draws a box plot but computes nothing.** `series-boxplot` takes `[min, Q1, median, Q3, max]` per box, and "the five statistic values should be calculated by yourself" ([boxplot option doc](https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/boxplot.md)). Outliers go in a separate `scatter` series ([example](https://raw.githubusercontent.com/apache/echarts-examples/gh-pages/public/examples/ts/boxplot-light-velocity.ts)). ECharts also ships a `boxplot` dataset transform and a `prepareBoxplotData` helper. Both use R-7 quartiles, but both put the Tukey whisker **at the fence** rather than at the last data point inside it (details below).
2. **Quartile definition to use: R-7** (Hyndman–Fan type 7, linear interpolation at h = (n−1)p). Reasons:
   - ECharts' own `quantile` computes R-7.
   - Postgres `percentile_cont` computes R-7 (read from its source), and so does Oracle (its documented formula).
   - It is the default in R, numpy and d3.
   - So the seeded Postgres gives AC-306 an independent test oracle.
3. **Cube has no percentile measure type.** The documented way is a `type: number` measure whose SQL is `PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY col)` ([recipe](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/percentiles.mdx)). That SQL is dialect-specific:
   - It works as an exact grouped aggregate on Postgres, Snowflake, Databricks (10.4 LTS+) and Oracle.
   - It does not on BigQuery or SQL Server. BigQuery has only `OVER` and the approximate `APPROX_QUANTILES`; SQL Server requires `OVER`.
   - Pre-aggregations serve it only on an exact dimension match.
4. **Computing in the browser from rows** is exact on every dialect and gives outliers directly. It is limited by Cube's row cap: 10,000 rows by default, 50,000 at most, adjustable with `CUBEJS_DB_QUERY_LIMIT`. Cube truncates without error, has no sampling, and `total: true` reports the full count.
5. **Recommendation, on correctness, dialect coverage and scale only:** wechart computes R-7 quartiles, whiskers and outliers from the observation rows, and checks `total` to tell whether the rows are the whole population. **What to do when the population is larger than the cap is a requirement gap for the user** (see Open questions). Percentile measures in Cube are the only exact path at very large scale, and they exist only on four of the six R4 warehouses.

## Install

No new package. Everything comes from `echarts@6.1.0`, which `docs/research/echarts.md` already covers:

- `BoxplotChart` from `echarts/charts`. The exported installer and the `BoxplotSeriesOption` type are in `/Users/srajagopal/Work/wechart/node_modules/.pnpm/echarts@6.1.0/node_modules/echarts/lib/export/charts.js` (line 63) and `types/dist/charts.d.ts`.
- `ScatterChart`, for the outlier dots. It is already registered in `/Users/srajagopal/Work/wechart/packages/charts/src/echarts.ts`.
- `DatasetComponent` from `echarts/components`, **only if** the built-in transform is used. Dataset registration lives in `lib/component/dataset/install.js`. `TransformComponent` only adds `filter`/`sort` (`lib/component/transform/install.js`). The `boxplot` transform itself is registered by `BoxplotChart`'s installer (`lib/chart/boxplot/install.js`: `registers.registerTransform(boxplotTransform)`).

Do **not** import `echarts/extension/dataTool`. Its index does `import * as echarts from 'echarts'`, the root import that defeats tree-shaking ([extension-src/dataTool/index.ts @6.1.0](https://github.com/apache/echarts/blob/6.1.0/extension-src/dataTool/index.ts); root-import cost in `docs/research/echarts.md`).

`echarts/extension/dataTool/prepareBoxplotData` is exported. It is in the `exports` map (installed `package.json`, lines 166–167) and has no imports (installed `extension/dataTool/prepareBoxplotData.js`). But the package has **no `.d.ts` beside it**: the only declaration is `types/src/chart/boxplot/prepareBoxplotData.d.ts`, for the internal `lib/chart/boxplot` copy, which is not in `exports`. Under strict TypeScript that import would lack types (inference from the file listing).

## Init / auth pattern

Add `BoxplotChart` to the `echarts.use([...])` list in `/Users/srajagopal/Work/wechart/packages/charts/src/echarts.ts`, and to the test harness `/Users/srajagopal/Work/wechart/packages/charts/src/testing/renderToSvg.ts`. Both register the SVG renderer. `use()` must run before `init()` ([import guide](https://echarts.apache.org/handbook/en/basics/import/), via echarts.md).

```ts
import { BoxplotChart, ScatterChart } from 'echarts/charts';
echarts.use([BoxplotChart, ScatterChart, GridComponent, TooltipComponent, SVGRenderer /* … */]);

const option = {
  xAxis: { type: 'category', data: categories },     // category axis ⇒ layout 'horizontal'
  yAxis: { type: 'value' },
  series: [
    { type: 'boxplot', data: boxes.map((b) => [b.low, b.q1, b.median, b.q3, b.high]) },
    { type: 'scatter', data: outliers.map((o) => [o.category, o.value]) }, // Tukey mode only
  ],
};
```

## API surface we will use

### 1. ECharts `series-boxplot` (6.1.0)

- **Data shape.** Each item is `[min, Q1, median (or Q2), Q3, max]`, or `{ value: [...], itemStyle }` ([option doc](https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/boxplot.md)). The type is `data?: (BoxplotDataValue | BoxplotDataItemOption)[]` (installed `types/src/chart/boxplot/BoxplotSeries.d.ts`).
- **ECharts does not interpret the two ends.** The series declares value dimensions `min, Q1, median, Q3, max`, and its comment reads "The meanings of 'min' and 'max' depend on user, and echarts do not need to know it" (installed `lib/chart/boxplot/BoxplotSeries.js`, lines 57–78). So the whisker option (Tukey or min/max) lives entirely in the numbers wechart passes.
- **Options:**
  - `layout`: `'horizontal' | 'vertical'`, defaulted from which axis is the category axis.
  - `boxWidth`: `[min, max]` in px or %, default `[7, 50]`.
  - `clip`: new in 6.1.0, default `true`.
  - `itemStyle`, `emphasis`, `dimensions`, `encode`, `tooltip`.

  Sources: [option doc](https://raw.githubusercontent.com/apache/echarts-doc/master/en/option/series/boxplot.md); defaults in `BoxplotSeries.js` lines 84–107.
- **Category axis.** If `xAxis.type === 'category'`, the layout is forced to `'horizontal'`. With no `encode.x`, ECharts prepends the item's index to each data item, so items carry only the five values (`lib/chart/helper/whiskerBoxCommon.js`, lines 75–123). `setOption` clones the raw option first ("some series modify option data", `lib/model/OptionManager.js`, lines 87–90), so wechart's arrays are not mutated.
- **What is drawn.** One `Path` per box (`lib/chart/boxplot/BoxplotView.js`, `BoxPath.buildPath`, lines 145–159). It uses moveTo/lineTo/closePath, so the SVG `d` contains only `M`, `L` and `Z`, which the existing `outline()` in `renderToSvg.ts` can read. The point order comes from `lib/chart/boxplot/boxplotLayout.js`, lines 118–135:
  1. The body rectangle: Q1-left, Q1-right, Q3-right, Q3-left, closed.
  2. The whisker lines min→Q1 and max→Q3.
  3. The end caps at min and at max.
  4. The median bar, last.

  A test can read each box's median and quartile pixel positions from these. Note that `filledPaths()` would treat the whole path as one box that spans the whiskers, so tests need a reader specific to box plots (inference).
- **Tooltip.**
  - The default item tooltip lists the five value dimensions under the names `min`, `Q1`, `median`, `Q3`, `max` (`defaultTooltip: true` on each, `BoxplotSeries.js`).
  - In Tukey mode the two ends are whisker ends, not min and max. Rename them with series `dimensions` (the doc includes `partial-series-dimensions`) or use a `tooltip.formatter`.
  - `formatter` returns raw HTML, so escape interpolated names (echarts.md, Gotchas).
  - The second argument of `tooltip.valueFormatter` is `rawDataIndex` as of 6.1.0 ([changelog](https://github.com/apache/echarts-doc/blob/master/en/changelog.md)).
- **Outliers.** A plain `scatter` series with `[categoryName, value]` pairs, as in ECharts' own example ([boxplot-light-velocity](https://raw.githubusercontent.com/apache/echarts-examples/gh-pages/public/examples/ts/boxplot-light-velocity.ts)) and Superset's `transformProps` ([Superset BoxPlot transformProps](https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-echarts/src/BoxPlot/transformProps.ts)). The optional `ScatterJitter` feature (`echarts/features`; axis `jitter`, `jitterOverlap`, `jitterMargin`) can spread dots that overlap (installed `lib/chart/scatter/install.js`, `lib/coord/axisDefault.js` lines 164–165).
- **v6.1.0 behaviour.** Box plots no longer overflow grid edges (`axis.containShape`), and gained `clip` ([changelog #21511](https://github.com/apache/echarts/pull/21511)). A box is not drawn if all its points fall outside the grid area, and is clip-pathed if some do (`BoxplotView.js`, `resolveNormalBoxClipping`).

### 2. The built-in `boxplot` dataset transform and `prepareBoxplotData`

- **Registration and naming.** The transform is registered as `echarts:boxplot` and referenced as `type: 'boxplot'`, because the `echarts:` namespace is stripped for built-ins (`lib/chart/boxplot/boxplotTransform.js`; `lib/data/helper/transform.js`, lines 268–273). The handbook calls it "the built-in boxplot transform", which also outputs the outlier data ([data transform](https://echarts.apache.org/handbook/en/concepts/data-transform/)).
- **Input.** Upstream must be `arrayRows`, one row of raw values per box, or it throws "Expect number[][]" (`boxplotTransform.js`).
- **Config:** `boundIQR` (number or `'none'`) and `itemNameFormatter` (string with `{value}`, or a function). `{value}` is the box's **index**, not a category name.
- **Output.** Two results:
  - dims `['ItemName','Low','Q1','Q2','Q3','High']`;
  - outliers as `[itemName, value]`.

  Sources: `boxplotTransform.js`; `types/src/chart/boxplot/prepareBoxplotData.d.ts`.
- **Algorithm** ([prepareBoxplotData.ts @6.1.0](https://github.com/apache/echarts/blob/6.1.0/src/chart/boxplot/prepareBoxplotData.ts)):
  - It sorts a copy with `a - b`, then takes `Q1/Q2/Q3 = quantile(asc, 0.25/0.5/0.75)`.
  - `bound = (boundIQR ?? 1.5) × (Q3 − Q1)`.
  - `low = max(min, Q1 − bound)` and `high = min(max, Q3 + bound)`. With `'none'` or `0`, low and high are min and max.
  - Outliers are the values `< low` or `> high`.
- **`quantile`** is "copied from d3.js": `H = (n−1)p + 1; h = floor(H); v = asc[h−1]; e = H − h; return e ? v + e·(asc[h] − v) : v` (installed `lib/util/number.js`, lines 560–572). That is R-7 (see §3).
- **ecStat (`echarts-stat` 1.2.0, BSD)** has histogram, clustering and regression transforms, and **no boxplot transform** ([README](https://raw.githubusercontent.com/ecomfe/echarts-stat/master/README.md), [registry](https://registry.npmjs.org/echarts-stat/latest)). Not needed.

### 3. Quartile definitions

| Implementation                                       | Definition                                                                                                  | Source                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R type 7 (R's default)                               | Q(p) = (1−γ)x_j + γx_{j+1}, j = ⌊np + m⌋, m = 1−p                                                           | [R quantile](https://stat.ethz.ch/R-manual/R-devel/library/stats/html/quantile.html)                                                                                                                                                                    |
| d3 `quantile`                                        | "uses the R-7 method"                                                                                       | [d3-array](https://d3js.org/d3-array/summarize#quantile)                                                                                                                                                                                                |
| ECharts `quantile`                                   | R-7 (formula above)                                                                                         | installed `lib/util/number.js`                                                                                                                                                                                                                          |
| numpy `percentile`, default `'linear'`               | H&F type 7; `(1−g)y[j] + g·y[j+1]`, j and g the parts of q(n−1)                                             | [numpy.quantile](https://numpy.org/doc/stable/reference/generated/numpy.quantile.html)                                                                                                                                                                  |
| numpy `'midpoint'`                                   | Mean of y[⌊q(n−1)⌋] and y[⌈q(n−1)⌉]; exact when q(n−1) is whole                                             | [numpy source](https://raw.githubusercontent.com/numpy/numpy/main/numpy/lib/_function_base_impl.py)                                                                                                                                                     |
| **Superset box plot**                                | Q1/Q3 = `np.nanpercentile(..., method="midpoint")`; median = pandas `median`                                | [superset boxplot.py](https://raw.githubusercontent.com/apache/superset/master/superset/utils/pandas_postprocessing/boxplot.py)                                                                                                                          |
| R `boxplot.stats`                                    | Tukey hinges (`fivenum`): equal to quartiles for odd n, differ for even n                                   | [boxplot.stats](https://stat.ethz.ch/R-manual/R-devel/library/grDevices/html/boxplot.stats.html)                                                                                                                                                         |
| Postgres `percentile_cont`                           | first_row = ⌊p(n−1)⌋, second_row = ⌈p(n−1)⌉, `lo + pct·(hi − lo)`, which is R-7; nulls ignored; returns `double precision` | [source](https://raw.githubusercontent.com/postgres/postgres/master/src/backend/utils/adt/orderedsetaggs.c), [docs](https://www.postgresql.org/docs/current/functions-aggregate.html)                                                                    |
| Oracle `PERCENTILE_CONT`                             | RN = 1 + P(N−1), interpolating between FLOOR and CEILING rows, which is R-7; nulls ignored                   | [Oracle](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/PERCENTILE_CONT.html)                                                                                                                                                      |
| Snowflake, Databricks, BigQuery, SQL Server          | "linear interpolation" (formula not stated)                                                                 | [Snowflake](https://docs.snowflake.com/en/sql-reference/functions/percentile_cont), [Databricks](https://docs.databricks.com/aws/en/sql/language-manual/functions/percentile_cont), [BigQuery](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/navigation_functions), [SQL Server](https://learn.microsoft.com/en-us/sql/t-sql/functions/percentile-cont-transact-sql?view=sql-server-ver17) |

**Choose R-7.** It is what ECharts, d3, numpy (default), R (default), Postgres and Oracle compute.

- **A test oracle for AC-306.** Grouping `percentile_cont(ARRAY[0.25,0.5,0.75]) WITHIN GROUP (ORDER BY v)` by category on the seeded Postgres gives an independent implementation of the same definition ([array form](https://www.postgresql.org/docs/current/functions-aggregate.html)).
- **Expected precision (inference).** For p ∈ {0.25, 0.5, 0.75} the interpolation fraction is exact in binary floating point. Postgres (`loval + pct*(hival-loval)`) and ECharts (`v + e*(asc[h]-v)`) apply the same operation, so the results should match exactly when the inputs parse to the same doubles.
- **Superset will differ on Q1 and Q3.** For `[1,2,3,4]`, R-7 gives Q1 = 1.75 and midpoint gives 1.5 (arithmetic from the definitions above). The median agrees. Expect small Q1/Q3 differences in the parity comparison.

**Whisker conventions.** The outlier set is the same under both conventions; only where the whisker line ends differs.

- **T1, most extreme data point within the fence.** R: "the whiskers extend to the most extreme data point which is no more than coef times the length of the box away from the box" ([boxplot.stats](https://stat.ethz.ch/R-manual/R-devel/library/grDevices/html/boxplot.stats.html)). matplotlib: "last datum within whis·IQR" ([matplotlib](https://matplotlib.org/stable/api/_as_gen/matplotlib.pyplot.boxplot.html)). Superset: `series[series <= Q3 + 1.5·IQR].max()` ([boxplot.py](https://raw.githubusercontent.com/apache/superset/master/superset/utils/pandas_postprocessing/boxplot.py)). Cube Cloud's chart: "Extend to min/max within 1.5× the IQR" ([boxplot.mdx @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/explore-analyze/charts/chart-types/boxplot.mdx)).
- **T2, the fence itself, clamped to min/max.** This is ECharts' `prepareBoxplotData` and transform ([source](https://github.com/apache/echarts/blob/6.1.0/src/chart/boxplot/prepareBoxplotData.ts)). ECharts' example labels its whiskers "Q3 + 1.5 * IQR" ([example](https://raw.githubusercontent.com/apache/echarts-examples/gh-pages/public/examples/ts/boxplot-light-velocity.ts)).
- **Min/max option.** The whiskers sit at the minimum and maximum, with no dots. Superset calls this "Min/max (no outliers)" ([controlPanel.ts](https://raw.githubusercontent.com/apache/superset/master/superset-frontend/plugins/plugin-chart-echarts/src/BoxPlot/controlPanel.ts)).

### 4. Cube: computing percentiles in Cube (Option B)

- **No percentile type.** At v1.7.45 the measure types are `count, number, string, boolean, time, sum, avg, min, max, countDistinct, countDistinctApprox`, plus `numberAgg` and `rank` for multi-stage measures only ([CubeValidator.ts @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/compiler/CubeValidator.ts), verified by fetch).
- **The documented pattern:**

  ```yaml
  - name: median_age
    type: number
    sql: PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age)
  ```

  The recipe says: "Calculating the percentiles would require using database-specific functions… almost every database has them under names of `PERCENTILE_CONT` and `PERCENTILE_DISC`… For BigQuery, you'd need to use the `APPROX_QUANTILES` function" ([percentiles.mdx @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/percentiles.mdx)). A box needs five such measures per value column: min, the three quartiles, and max.
- **`number_agg`** is described as "Custom aggregate not covered by other types (e.g., `PERCENTILE_CONT`). Tesseract only" ([measures.mdx @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/data-modeling/measures.mdx)).
  - The validator accepts it only with `multi_stage: true` (see above). `data-modeling.md` Gotcha 12 already records this disagreement with the docs.
  - The only documented use is XIRR with `grain.include` over per-day totals (`docs-mintlify/recipes/data-modeling/xirr.mdx`).
  - It is rendered without an aggregate wrapper (`AggregateWrap::PassThrough`) ([measure_kinds/mod.rs @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/symbols/measure_kinds/mod.rs), verified by fetch).
- **Nested aggregates** (the Superset panel: a spread of per-order MAX). "A single measure can only contain a single aggregation… the outer aggregation would need to be defined in a separate cube and the inner aggregation (measure) would need to be brought to that cube as a subquery dimension" ([nested-aggregates.mdx @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/nested-aggregates.mdx)).
- **Dialect coverage of an exact grouped percentile.** These are the R4 warehouses from requirements Part 1 "Data":

  | Warehouse   | Usable as a grouped `type: number` measure?                                                                                                                                                                                              |
  | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | PostgreSQL  | Yes: `percentile_cont(f) WITHIN GROUP (ORDER BY …)` is an ordered-set aggregate ([PG](https://www.postgresql.org/docs/current/functions-aggregate.html))                                                                                                        |
  | Snowflake   | Yes: aggregate form `PERCENTILE_CONT(p) WITHIN GROUP (ORDER BY …)` ([Snowflake](https://docs.snowflake.com/en/sql-reference/functions/percentile_cont))                                                                                                      |
  | Databricks  | Yes, on Databricks Runtime 10.4 LTS and above ([Databricks](https://docs.databricks.com/aws/en/sql/language-manual/functions/percentile_cont))                                                                                                                  |
  | BigQuery    | **No exact aggregate.** `PERCENTILE_CONT(value, p) … OVER over_clause` is a navigation (window) function ([BigQuery](https://docs.cloud.google.com/bigquery/docs/reference/standard-sql/navigation_functions)). The Cube recipe points to `APPROX_QUANTILES`, which is approximate ([recipe](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/data-modeling/percentiles.mdx)) |
  | SQL Server  | **No.** The syntax requires `OVER ([partition_by_clause])` ([SQL Server](https://learn.microsoft.com/en-us/sql/t-sql/functions/percentile-cont-transact-sql?view=sql-server-ver17)). Cube's own MSSQL adapter comments "PERCENTILE_CONT works but requires PARTITION BY" and removes it from SQL API pushdown ([MssqlQuery.ts @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-schema-compiler/src/adapter/MssqlQuery.ts), line 305) |
  | Oracle      | Yes: aggregate form ([Oracle](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/PERCENTILE_CONT.html)). Cube's Oracle driver is community-supported (`docs/research/cube/data-sources.md` §"Tier wording")                                  |

- **SQL API route (Option C).** `PERCENTILE_CONT` is supported by pushdown and not by post-processing. "PERCENTILE_CONT pushdown is only available on data sources whose SQL dialect supports it. It is not supported with BigQuery, ClickHouse, Microsoft SQL Server, MySQL, or Presto" ([sql-api/reference.mdx @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/sql-api/reference.mdx), verified by fetch). Pushdown queries use no pre-aggregations (`docs/research/cube/data-apis.md` §8). wechart uses REST `/v1/load` for every chart (`data-apis.md` "Use REST `/v1/load` for every chart").
- **Pre-aggregations.** Percentile measures are non-additive. A rollup holding them "would only accelerate a query that fully matches its definition" ([non-additivity.mdx @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/recipes/pre-aggregations/non-additivity.mdx)). In Tesseract's matcher, a partial match requires `measure.is_additive()` ([measure_matcher.rs @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/logical_plan/optimizers/pre_aggregation/measure_matcher.rs), verified by fetch), and `Calculated` (`type: number`) kinds are never additive (`measure_kinds/mod.rs`, `is_additive`). So a dashboard filter on a dimension outside the rollup sends the query to the warehouse (inference from those two rules).
- **Joins that multiply rows.** Tesseract moves measures of a multiplied cube into a separate multiplied-measure path (`full_key_aggregate_measures` in [query_properties.rs @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/query_properties.rs)). Whether `PERCENTILE_CONT` stays correct there is **UNVERIFIED**; it needs a probe.

### 5. Cube: rows for computing in the browser (Option A)

- **`ungrouped: true`.** Cube "will not add the `GROUP BY`… Measures will be rendered as their `sql` without any aggregation" ([queries.mdx @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/queries.mdx) §Ungrouped query). The primary-key check is off by default through `CUBESQL_SQL_PUSH_DOWN` (`docs/research/cube/markings-query-support.md` "Corrections" 1). wechart already builds such queries (`toUnderlyingQuery`, `/Users/srajagopal/Work/wechart/packages/core/src/chart-spec.ts`, lines 180–193).
- **Row limits:**
  - "By default, any query that does not explicitly specify the row limit, will return no more than 10,000 rows… The maximum allowed limit is 50,000 rows. You can use the `CUBEJS_DB_QUERY_LIMIT` environment variable to override it. You can also implement pagination" ([queries.mdx](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/queries.mdx) §Row limit).
  - The defaults in source are `dbQueryLimit` 50000 and `dbQueryDefaultLimit` 10000 ([env.ts @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-backend-shared/src/env.ts), lines 752–765).
  - An explicit `limit` above the maximum throws `The query limit has been exceeded.` ([query.js @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js), lines 458–472).
- **Very large facts.** Truncation is silent (`data-apis.md` Gotcha 14). The REST query schema has **no sampling option**: its keys are measures, dimensions, filters, timeDimensions, order, segments, timezone, limit, offset, total, cacheMode/cache, ungrouped, responseFormat, subqueryJoins, joinHints, maskedMembers ([query.js](https://github.com/cube-js/cube/blob/v1.7.45/packages/cubejs-api-gateway/src/query.js), lines 179–212). A search of the v1.7.45 docs for sampling found nothing. `total: true` returns the row count "as if no row limit or offset are set" ([queries.mdx](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/queries.mdx)). It works for ungrouped queries: observed `ungrouped`, `limit: 3`, `total: 120` (`docs/design/reviews/2026-09-24/chart-context-menu.md`, observation table). It runs a separate `count(*)` over the query without its limit (`markings-query-support.md` "Ungrouped queries"). So `total > rows.length` is the truncation signal.
- **Default order.** A REST query without `order` is sorted by time dimension, else first measure, else first dimension. `[]` opts out ([queries.mdx](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/queries.mdx) §Order).
- **Payload.** `responseFormat: 'compact'` returns `{members, dataset}` with rows as arrays (`data-apis.md` line 281). Numbers arrive as strings (`data-apis.md` Gotcha 2).
- **Observation grain (the Superset panel).** A grouped query at `[shipper, order_id]` with an additive `max` measure returns one row per order. Rollups can serve it on the additive path (`pre-aggregations.md` §2). An ungrouped query matches only rollups containing the primary keys of all cubes involved (same doc).

### 6. Outliers under each option

- **A (browser):** every value is already in the rows. Outliers are the values beyond the fences. Under T1 the whisker ends are the extreme values inside the fences. One request.
- **B (Cube):** after the quartile query, two more queries are needed. Both depend on per-category fences, as nested and/or filter groups (`data-apis.md` query table):
  1. Ungrouped rows with `(category = c AND (v < lo_c OR v > hi_c))` OR'd across categories, capped by the row limit.
  2. For T1 whisker ends, a grouped `min`/`max` of `v` restricted to `lo_c ≤ v ≤ hi_c`.

  `v` must be a **dimension**. Cube's legacy path throws "Measure filters aren't allowed in ungrouped query" (`markings-query-support.md` "Ungrouped queries"). That doc also records a measure without `filters` that did not throw, so the behaviour is mixed.

### 7. Recommendation, by the four criteria

| Criterion                             | A: wechart computes R-7 from Cube rows                                                                                                 | B: percentile measures in Cube                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Correctness / "computed from the rows" | Exact when `total ≤ rows` returned; wrong, silently, if truncation is not detected                                                     | Exact over all rows at any size on PG, Snowflake, Databricks and Oracle; approximate or unavailable on BigQuery and SQL Server |
| Definition consistency                | One R-7 implementation owned by wechart, on every dialect                                                                              | R-7 on PG and Oracle by source or doc; "linear interpolation" elsewhere, not proved identical                      |
| Whiskers and outliers                 | T1 or T2 and outliers from the same rows, one request                                                                                  | Three dependent requests; `v` must be a dimension                                                                  |
| Performance at scale                  | Bounded by the cap and payload; `total` costs a count scan; ungrouped rarely hits rollups                                             | Warehouse sorts per group; rollups only on exact match                                                            |
| Dialect coverage (R4)                 | All six                                                                                                                                | Four of six                                                                                                        |

Recommended: **A with R-7, and truncation detected through `total`.** It is the only option exact on all six R4 warehouses, and it matches ECharts' and Postgres' definition. It also matches Cube Cloud's own design: "Boxplots require raw, row-level data… the chart engine computes the distribution itself" ([boxplot.mdx](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/explore-analyze/charts/chart-types/boxplot.mdx)). Beyond the cap, A cannot meet "computed from the rows". The user must decide what happens there (see Open questions); B is the only exact fallback, on four dialects.

Compute the numbers in a wechart pure function rather than ECharts' transform, for three reasons:

- The transform treats `null` as 0. It sorts with `a - b` and never filters nulls. SQL `percentile_cont` ignores nulls on PG, Oracle, SQL Server and Snowflake (docs above).
- The transform names boxes by index.
- The transform implements only T2.

## Gotchas

- **ECharts' Tukey whisker is T2** (it sits at the fence), while R, matplotlib, Superset and Cube Cloud use T1. The outlier sets are identical ([prepareBoxplotData.ts](https://github.com/apache/echarts/blob/6.1.0/src/chart/boxplot/prepareBoxplotData.ts)).
- **Empty group:** `quantile([], p)` reads `asc[-1]` and returns NaN (from reading `lib/util/number.js`). Drop categories with no finite values before rendering.
- **Values must be numbers:** Cube returns strings, and `castNumerics` loses precision above 2^53 (`data-apis.md` Gotcha 2). Filter out null, `''` and non-finite values, as `packages/charts/src/series/scatter.ts` already does.
- **Ungrouped rows replicate across one-to-many joins.** Tesseract's comment: "An ungrouped query returns raw rows… so the replication the wider join tree introduces would reach the result directly" ([query_properties.rs](https://github.com/cube-js/cube/blob/v1.7.45/rust/cube/cubesqlplanner/cubesqlplanner/src/planner/query_properties.rs), lines 329–341). If the category's cube is on the "many" side of the value's cube, duplicated values would skew the quartiles.
- **Do not put percentile measures in an ungrouped query.** Measures are rendered "as their `sql` without any aggregation" ([queries.mdx](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/queries.mdx)), so an aggregate SQL would be emitted without `GROUP BY` (inference: likely an SQL error). This affects "View underlying rows" (AC-239) on a box-plot tile built with option B.
- **Security (phase 2, AC-307):** "SQL masks (`mask: { sql }`) on measures are not applied in ungrouped queries… Static masks… are applied in all cases" ([data-access-policies.mdx @v1.7.45](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/docs/data-modeling/data-access-policies.mdx), lines 325–336). Under option A, a box plot over a measure with an SQL mask needs a test.
- **`limit` above the server's `CUBEJS_DB_QUERY_LIMIT` throws**, so wechart must know the deployed value (`query.js`, line 468).
- **Default ordering** on an ungrouped box-plot query sorts by the first measure. Pass `order: []` ([queries.mdx](https://github.com/cube-js/cube/blob/v1.7.45/docs-mintlify/reference/core-data-apis/queries.mdx)).
- **Tooltip names** default to `min`/`max` for the whisker ends (`BoxplotSeries.js`). Rename them in Tukey mode.
- **`echarts/extension/dataTool`** pulls in root `echarts` ([index.ts](https://github.com/apache/echarts/blob/6.1.0/extension-src/dataTool/index.ts)).

## Alternatives considered

- **ECharts `boxplot` transform or `prepareBoxplotData`:** R-7, but T2 only, no null handling, and names by index (see §2). The `extension/dataTool` path lacks types.
- **ecStat:** no boxplot transform ([README](https://raw.githubusercontent.com/ecomfe/echarts-stat/master/README.md)).
- **Cube percentile measures (B)** and the **SQL API `PERCENTILE_CONT` pushdown (C):** see §4 and §7. C is excluded on BigQuery, SQL Server, MySQL, ClickHouse and Presto, and uses no rollups.

## Open questions / unverified

1. **Populations larger than the row cap: needs the user.** Options are to refuse with a message, to fall back to Cube-side percentiles on PG, Snowflake, Databricks and Oracle, or to raise `CUBEJS_DB_QUERY_LIMIT`. Cube offers no sampling, and sampling would contradict "computed from the rows". Not decided here.
2. **Whisker convention for the spec:** T1 (most extreme data point within 1.5 × IQR) or T2 (the fence). The outliers are the same either way.
3. **Quantile definition confirmation:** R-7 is recommended, where Superset uses midpoint for Q1/Q3.
4. **Comparison tolerance for AC-306's test.** Exact equality is expected by inference (§3). The spec should state one.
5. **A "distribute across" (observation grain) control** is needed to reproduce the Superset panel's per-order MAX. AC-306 doesn't mention one.
6. UNVERIFIED: that Snowflake, Databricks, BigQuery and SQL Server `PERCENTILE_CONT` equal R-7 exactly. Their docs say only "linear interpolation".
7. UNVERIFIED: whether a `PERCENTILE_CONT` `number` measure is correct under a one-to-many join (Tesseract's multiplied path).
8. UNVERIFIED: whether `multi_stage` `number_agg` with `PERCENTILE_CONT` and `grain.include` works (a nested-percentile alternative). There are no tests in the fork.
9. UNVERIFIED: an exact grouped percentile on BigQuery via `ARRAY_AGG` plus a subquery, and on SQL Server via a window function inside a Cube measure or dimension.
10. UNVERIFIED: which value an SQL-masked measure returns in an ungrouped query.
11. UNVERIFIED: that renaming tooltip dimensions with `series.dimensions` works for a box plot on a category axis, given that ECharts prepends an index dimension.
12. UNVERIFIED: the performance of A and B against M3's 3 s p95. There is no source, so it must be measured.
13. I did not query the running local Cube. This session had no shell, so every Cube behaviour above comes from docs and source reading, plus the earlier observations cited from sibling docs.
