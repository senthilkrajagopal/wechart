---
library: Cube Core extended metadata — a pre-aggregation's refresh key and its cube's file (/v1/meta?extended)
packages: []
version: 1.7.42
researched: 2026-09-24
sources:
  [
    https://github.com/cube-js/cube/blob/v1.7.42/packages/cubejs-api-gateway/src/gateway.ts,
    https://github.com/cube-js/cube/blob/v1.7.42/docs-mintlify/reference/data-modeling/pre-aggregations.mdx,
  ]
---

# Extended metadata: what a pre-aggregation carries

A sibling to `data-apis.md`, which records that `?extended` "adds `sql`,
`fileName`, `refreshKey` and `extends` for cubes … and pre-aggregation
references" ([src-gw-metaext] there). It did not say what a **pre-aggregation's**
own entry carries. Jobs (AC-229) needs its refresh key and the file it is
defined in, so this was checked against the local Cube, and is recorded here.

## Observed (local Cube, `cubejs/cube:v1.7.42`, `docker-compose.yml`)

`GET /cubejs-api/v1/meta?extended=true` for the seeded `monthly_orders` cube
(`infra/cube/model/cubes/monthly_orders.yml`) returned, on 2026-09-24:

```json
{
  "fileName": "cubes/monthly_orders.yml",
  "preAggregations": [
    {
      "name": "by_status_month",
      "type": "rollup",
      "granularity": "month",
      "partitionGranularity": "year",
      "refreshKey": { "every": "1 hour" },
      "scheduledRefresh": true,
      "external": true,
      "timeDimensionReference": "ordered_at",
      "dimensionReferences": "[status]",
      "measureReferences": "[count, total_amount]",
      "indexes": { "byStatus": { "type": "regular" } },
      "allowNonStrictDateRangeMatch": true
    }
  ]
}
```

- **`fileName` is on the cube**, relative to the model directory — the same
  path the Model workspace's `/model/files/:path` route takes.
- **Each pre-aggregation carries its `refreshKey`** as declared (`every`, or
  `sql`, with `incremental` and `update_window` in camelCase), and its
  `scheduledRefresh`. The model file declares `refresh_key: every: 1 hour` for
  this rollup, and that is what came back.
- A pre-aggregation **declaring no refresh key** takes Cube's default,
  `every: 1 hour` — per the data-modeling reference, as `refresh-jobs-caching.md`
  records (row "Data model `scheduled_refresh` … `refresh_key` (`every` default
  `1 hour` …)"). Whether the metadata then omits `refreshKey` or fills in the
  default was not observed: every seeded rollup declares one. wechart says
  "Every 1 hour (Cube's default)" when it is absent, which is right either way.

## Observed: two builds of one rollup at once

Running the e2e suite in three browsers at once, each starting
`POST /cubejs-api/v1/pre-aggregations/jobs` for `monthly_orders.by_status_month`
within the same seconds, one build's job was reported `missing_partition`
where the others reported `done` (2026-09-24, this instance). Cube 1.7.42's
`done` means the partition's table exists (`refresh-jobs-caching.md`, gotcha
3); a table another build is replacing can be missing when a job checks. So a
test of the real build (AC-149's) cannot share its rollup with another build
running at once, and Jobs' own row tests answer the build calls themselves.
This is an observation of one instance, not documented behaviour.

## UNVERIFIED

- The shape of `refreshKey` for `sql` keys and for `incremental` /
  `update_window` was not observed on this instance (no seeded rollup uses
  them); it is read by the names the reference gives them, camelCased as every
  other extended field is.
