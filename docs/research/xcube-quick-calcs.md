---
library: xcube's quick calculations (the user's Cube fork), as built for R45 and R46
packages: []
# Nothing is imported: a query asks for a calculation through a `calculations` block in the REST query wechart's API already sends to Cube.
version: 'xcube feat/xcube 89628a0e88; image ghcr.io/senthilkrajagopal/xcube:v1.7.45-89628a0e88@sha256:155d204cf8405578c1667435c4518e4fb14e7b1f63af1bea66ebc263fb7a4d17 (quick calculations from e597c37c6c and 5a237aedf8)'
researched: 2026-10-02
sources:
  - ~/Work/xcube-exchange/to-wechart/2026-09-28-1500-quick-calcs.md (xcube's advice, option c′)
  - ~/Work/xcube-exchange/to-wechart/2026-09-28-1700-quick-calcs-spike.md (the spike's numbers)
  - ~/Work/xcube-exchange/to-wechart/2026-09-28-1800-quick-calcs-built.md (as built, image 5a237aedf8)
  - ~/Work/xcube-exchange/to-xcube/2026-09-28-1600-quick-calcs-decision.md (wechart's decision and the types it disables)
  - docs/research/cube/spike-model-store-and-quick-calcs.md (the 2026-09-21 spike on Cube 1.7.42)
  - docs/research/xcube-sql-runner.md ("The pin brings more than the SQL runner")
  - xcube at the fork's working tree, read, not run: xcube/README.md "Quick calculations"; xcube/src/calcs/requests.ts (planCalculations); xcube/src/runtime/runtime.ts (planQueryCalculations, repin, overlayRevision)
  - observed against compose's running wechart-cube (image 89628a0e88), 2026-10-02
---

# xcube's quick calculations (F6, AC-048)

**For T382.** The user chose xcube's option (c′) with companions made **on demand** (R46). xcube generates a companion measure for each calculation a query asks for, at serve time, on the measure's own cube. Nothing is published, nothing goes through a proposal, and wechart never names a companion: a query asks by calculation, and the answer names the column.

## Corrections to earlier research

`docs/research` was searched for earlier claims about quick calculations (`quick calc`, `multi-stage`, `rolling_window`, `__xc_`). These no longer hold:

| Claim | Where | Now |
|---|---|---|
| Companions are added to wechart's served files, generated from the chart | `cube/spike-model-store-and-quick-calcs.md` §2 ("Generate only what charts use"), already marked superseded in part | xcube adds them when it serves the model, on first use. They are never in an item, `GET …/items` or a publish [1800, "On first use"; README] |
| Companions are published into xcube's model | the same doc's 2026-09-25 note ("Now: companion measures are published into xcube's model") | Not published. Served only, and hidden from `/v1/meta` [1800, "Security and field lists"; observed below] |
| A running total counts from the start of the data | spike §2, "Running total" | With a range on the query's time dimension, it counts from the range's start: xcube adds the range again as an `inDateRange` filter [1800; observed below]. Without a range it still counts from the start of the data |
| Rolling windows need a time dimension with a date range | `cube/data-modeling.md` Y.7, the `rolling_window` row; quoted in T381's notes | Under Tesseract on PostgreSQL, a time dimension with a granularity is enough: the series runs over the data's own dates [1500 §2.3; observed: a running total with no range answered] |
| Rank and moving-average windows are wechart-generated per grain and dimension | spike §2, "What this means for generating them" | xcube picks the companion for the query's granularity. Rank is across all rows only (R45.2) [1800] |
| Moving average divides by the periods present | spike §2 | Still so: "empty periods left out" [1800]. Observed: January's 3-month average is January's own count (30) |

Nothing in the other docs (`cube-capabilities.md`, `cube/upgrade-1.7.43.md`, `cube/pre-aggregations.md`, `cube/data-apis.md`) contradicts what follows.

## The `calculations` block

A REST query to `/v1/load`, `/v1/sql` or `/v1/dry-run` may carry, beside `measures` [1800; README]:

```json
"calculations": [{ "measure": "orders.count", "kind": "running_total" }]
```

- **`measure`**: one of the query's `measures`. A cube's member, or a view's under the view's name for it.
- **`kind`**: `pct_of_total`, `previous_period`, `difference`, `pct_difference`, `running_total`, `moving_average` (with `periods`: 3, 6 or 12), or `rank`.
- **One per measure.** It replaces its measure in `measures` and in `order`.
- **Period calculations** (every kind but `pct_of_total` and `rank`) need exactly one time dimension with a granularity: `hour`, `day`, `week`, `month`, `quarter` or `year`.
- xcube removes the block before Cube sees the query [`requests.ts` `planCalculations`].

wechart's six map onto these kinds:

| wechart (`QuickCalcKind`) | xcube `kind` |
|---|---|
| `percentOfTotal` | `pct_of_total` |
| `differenceFromPrevious` | `difference` |
| `percentDifferenceFromPrevious` | `pct_difference` |
| `runningTotal` | `running_total` |
| `rank` | `rank` |
| `movingAverage` (`periods` 3, 6, 12) | `moving_average` with the same `periods` |

xcube's `previous_period` (the previous period's value itself) is not one of wechart's six (AC-047).

## The answer

- **The column** is the companion: `<measure>__xc_<calculation>` [1800]. Observed names:
  - `orders.count__xc_running_total`;
  - `orders.total_amount__xc_pct_of_total`;
  - `orders.count__xc_prev_month`;
  - `orders.count__xc_diff_month`, `orders.total_amount__xc_diff_quarter`;
  - `orders.count__xc_pdiff_month`;
  - `orders.count__xc_ma3_month`, `orders.total_amount__xc_ma6_month`;
  - `orders.count__xc_rank`;
  - through a view, `order_summary.count__xc_pct_of_total`.
- **`__xc_` is reserved**: an authored member or view alias holding it is refused at publish (`422`) [1800; README]. So a column `<measure>__xc_…` in an answer is that measure's calculation and nothing else.
- **The echoed `query`** names the companion in `measures` (and `order`), and for a running total with a range, the added filter.
- **`annotation.measures[<column>]`**, observed:
  - `title`: `Orders Count (running total)`; `shortTitle`: `Count (running total)`.
  - Other short titles: `Count (% of total)`, `Count (previous month)`, `Count (difference from previous month)`, `Total Amount (difference from previous quarter)`, `Count (% difference from previous month)`, `Count (3-month moving average)`, `Total Amount (6-month moving average)`, `Count (rank)`.
  - `type: number`.
  - `format: percent` for `pct_of_total` and `pct_difference`, and **no `format` on any other kind**. The base measure's format is not carried: a difference, running total or moving average of the currency measure `orders.total_amount` came with none (Gotcha 1).
  - `meta.xcube.calculation`: `{ measure, kind, granularity?, periods? }`, with `measure` the cube's short name for it (`count`).
- **A row may be missing where the calculation has no value** [1800]: with the previous-period calculation as the only measure and a range starting in January, there was no January row. With another measure beside it, January came with `null`.
- **Values are strings**, as Cube's are: `"31"`, `"0.33595456531236347750"`, `"29.6666666666666667"`.
- **The SQL is Cube's**: `/v1/sql` for a running total answered a `WITH time_series … cte_0 … cte_1` statement with `sum("rolling_source"."orders__count__xc_running_total")`, and `/v1/dry-run` listed `orders.count` as the leaf measure of `orders.count__xc_running_total`. So the value is computed in the database, not in the browser (AC-048's failing state).

## Refusals: `400`, `code: "invalid_calculation"`

```json
{ "error": "Calculations can't be computed: orders.average_amount running_total: an avg measure has no correct running total",
  "code": "invalid_calculation",
  "calculations": [{ "measure": "orders.average_amount", "kind": "running_total", "reason": "type", "message": "an avg measure has no correct running total" }] }
```

Every calculation that can't be computed is listed with its `reason`: `kind`, `not_in_query`, `duplicate`, `unknown_measure`, `type`, `granularity`, `periods`, `combination` or `compile` [1800; `requests.ts`]. `/v1/dry-run` refuses the same way (observed). A plain query on the same cube still answers.

## Which types take which calculation

xcube's rule [1800, "What each measure type takes"; README]:

| | count, sum | count_distinct, count_distinct_approx | avg, min, max, number |
|---|---|---|---|
| `pct_of_total` | yes | computed, but the shares overlap | refused |
| `previous_period`, `difference`, `pct_difference` | yes | yes | yes |
| `running_total` | yes (reads rollups) | yes, distinct so far (reads the source) | refused |
| `moving_average` | yes | yes (mean of the period distinct counts) | refused |
| `rank` | yes | yes | yes |

A measure that is itself multi-stage or rolling takes none (`type`). `/v1/meta` marks a rolling measure `cumulative: true`, but has no flag for a multi-stage one (observed: a measure's keys are `name`, `title`, `shortTitle`, `format`, `formatDescription`, `cumulativeTotal`, `cumulative`, `type`, `aggType`, `drillMembers`, `drillMembersGrouped`, `isVisible`, `public`).

**What wechart disables** (R46; `to-xcube/2026-09-28-1600-quick-calcs-decision.md`, with the spike's correction):
- **% of total** for `avg`, `min`, `max`, `number` (refused by xcube), and for `count_distinct`, since distinct counts overlap and the shares add up to more than 100% (the spike: three categories each at 1.0). `count_distinct_approx` overlaps the same way [1500 §3, note 1; 1800's table groups the two], so it is disabled too.
- **Running total** for `avg`, `min`, `max` and `number`. **Enabled for `count_distinct`**: the spike found xcube's plain rolling form correct (3, 5, 7, … distinct customers so far) and xcube generates it [1700 §5.1; 1800]. T382's notes record the same.
- **Moving average** for `avg`, `min`, `max` and `number`.
- The previous-period ones and rank: every type.

## What was observed against compose's xcube (2026-10-02)

Compose's `wechart-cube` runs `ghcr.io/senthilkrajagopal/xcube:v1.7.45-89628a0e88` (`docker ps`), which holds quick calculations (`xcube-sql-runner.md`, "The pin brings more than the SQL runner"). The probes were REST calls to `http://localhost:54000/cubejs-api`, each under a query token signed as wechart's API signs one (RS256 under `infra/xcube/dev-signing-key.pem`, issuer `wechart`, audience `xcube`, `role: user`, `wechartModel`). They ran on model `e2e`, the phase-1 suite's, and on `e2e-security`, the security suite's. The seed has `orders` with 80 orders of each of three statuses, and monthly counts of 30, 28, 31, 30, 31, 30, 31 and 29 from January to August 2026.

**Held as xcube said:**
- **Running total, range sent once on the time dimension** (`month`, 2026-03-01 to 2026-06-30): March 31, April 61, May 92, June 122. The echoed query carries the added `inDateRange` filter. A range given in words (`"from 2026-03-01 to 2026-06-30"`, `"this year"`) is resolved first, and the filter carries the dates.
- **Running total, no range:** 30, 58, 89, 119, 150, 180, 211, 240, counted from the data's start.
- **Running total by week** over March, of the currency sum: 4,150.00 rising to 18,755.00.
- **% of total**, `orders.total_amount` by status: 0.336, 0.333, 0.331, adding up to 1. `orders.count` filtered to `shipped` and `pending` (no `pending` rows): `shipped` 1.0, the share of the filtered total (R45.3). Through the view `order_summary`: ⅓ each.
- **Previous month** from January to April: no January row; February 30, March 28, April 31.
- **Difference**, with `orders.total_amount` beside it: January `null`, February −2, March 3, April −1. The plain measure answered under its own name.
- **% difference:** −0.0667, 0.107, −0.0323. For `avg` (`orders.average_amount`), allowed: 1.308, 0.577.
- **Moving average of 3 months:** 30, 29, 29.67, 29.67, 30.67, 30.33. Of 6 months of the sum: 4,987.50 rising to 35,527.92.
- **Rank** by status, ordered by the measure `asc`: the echoed order is on `orders.total_amount__xc_rank`, and rank 1 comes first. By month: the three 31s are 1, the 30s are 4, 29 is 7 and 28 is 8, so ties share a rank (competition ranking).
- **First use compiles:** the first query for a new measure and calculation answered in about 1.0–1.3 s, and later ones in 40–200 ms.
- **Refusals, each `400 invalid_calculation`:**
  - `type`: a running total, % of total or moving average on `avg`;
  - `granularity`: a moving average with no time dimension, and a difference whose only time dimension has a range but no granularity;
  - `combination`: a running total with a range beside a difference;
  - `periods`: a moving average of 4;
  - `not_in_query`: a calculation on a measure the query doesn't ask for, or on a dimension;
  - `kind`: an unknown kind (`median`).
  
  Several refusals in one query are listed together.
- **Allowed:** a running total with no range beside a difference, in one query. An empty `calculations: []`, which answers as the plain query.
- **Hidden:** after the probes, `/v1/meta` and `/v1/meta?extended=true` for `e2e` named no `__xc_` member.
- **The folder gate covers companions.** On `e2e-security`, with no groups, a rank on `orders.count` answered `403` "None of these groups reaches folder froot (orders)", as the plain query did. With `wechart-super-admins`, it answered `200`. A folder cube in `e2e` (`fb00ab7d…__folder_orders.count`) took a rank.

**Gotchas found:**
1. **The base measure's format isn't carried.** Only `pct_of_total` and `pct_difference` come with a format (`percent`). A difference, running total, moving average or previous period of a currency measure comes with none, and a rank of one, rightly, with none. A tile that formats a calculated value by its measure's format must give the four unit-keeping kinds the measure's own format, and rank none.
2. **A running total's annotation can name another granularity.** A daily running total's `meta.xcube.calculation.granularity` read `month`, where the first one asked of that measure had been monthly. A running total's companion is one for every granularity (`__xc_running_total`), so this is the granularity it was first recorded with. Its values were right (1, 2, 3, 4, 5 for March 1–5). Don't read the granularity from the annotation.
3. **A range on a second entry for the same time member is ignored by a running total.** `timeDimensions: [{ ordered_at, month }, { ordered_at, dateRange: March–June }]` answered January to August, counted from the data's start. A difference in the same shape kept to the range. xcube adds its filter only for a range on the time dimension that has the granularity (`requests.ts`, `granular[0].dateRange`). wechart's dashboard filters already put a range for the chart's own time member on that entry (`packages/web/src/filters/apply.ts` `withFilters`), and add an entry only for another member.
4. **`combination`:** a running total with a range can't share a query with a difference, % difference or moving average. They must be asked in separate queries [1800], and their rows joined by the other columns.
5. **A missing row isn't an empty one.** With the calculation as the only measure, a period with no value has no row at all [1800; observed].
6. **First use waits** for one compile of the module, about a second here [1700 §1; observed].

**Not checked here:**
- A `count_distinct` measure. Compose's models have none, so the distinct-so-far running total rests on xcube's tests and spike [1700 §5.1; 1800, "Tested"].
- A workspace overlay's preview. By reading `runtime.ts`, an overlay is served over its base revision's companions (`overlayRevision` passes `base.calcs`), and a first use re-pins the request to the new revision and its overlay (`repin`). This was not run, and a measure that only the overlay defines was not tried.
- Rollups. Per the spike, a moving average and running total of a sum read the rollup, with the same values [1700 §3].
