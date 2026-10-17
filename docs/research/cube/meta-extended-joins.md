---
library: Cube's extended metadata — each cube's joins and each measure's SQL, as xcube serves them
packages: []
version: 1.7.45
researched: 2026-10-08
sources:
  [
    observed: GET /cubejs-api/v1/meta?extended=true against compose's xcube (ghcr.io/senthilkrajagopal/xcube:v1.7.45-c2602ac72a), model `e2e`, 2026-10-08,
    docs/research/cube/data-apis.md ("?extended"),
    docs/research/cube/rollup-join-paths.md (join edges),
  ]
---

# Cube's extended metadata: joins and measure SQL (T688, T689)

A sibling note to `data-apis.md`, whose "`?extended`" item says extended metadata "adds … joins" without the shape. This note records the shape as served, for the chart editor's field list (T688, EDI-03: joined cubes "· via join") and the measure's aggregation menu (T689, chart-editor-Q6: sibling measures over the same `sql`).

## Observed (2026-10-08)

A query token for model `e2e`, signed as wechart's API signs one (`e2e/tokens.ts`), asked `GET /cubejs-api/v1/meta?extended=true` of compose's xcube on port 54000. It answered 200. Each cube, as printed (name, type, `joins`, `connectedComponent`, then each measure as `name:type:aggType:sql`):

```
customers cube [] 1 customers.count:number:count:
monthly_orders cube [] undefined monthly_orders.count:number:count: | monthly_orders.total_amount:number:sum:`amount`
order_summary view [] undefined order_summary.count:number:count:
orders cube [{"name":"customers","sql":"`${CUBE}.customer_id = ${customers}.id`","relationship":"belongsTo"},{"name":"products","sql":"`${CUBE}.product_id = ${products}.id`","relationship":"belongsTo"}] 1 orders.count:number:count: | orders.total_amount:number:sum:`amount` | orders.average_amount:number:avg:`amount`
product_catalog cube [] undefined product_catalog.count:number:count:
products cube [] 1 products.count:number:count:
```

So, at this version:

1. **Each cube carries `joins`, an array**, empty where it declares none. Each entry is `{ name, sql, relationship }`:
   - `name` is the joined cube's name;
   - `sql` is the join condition as the model writes it;
   - `relationship` is the model's (`belongsTo` here).
2. **A join is declared on one side only.** `orders` names `customers` and `products`; neither names `orders`. This matches `rollup-join-paths.md`: an edge runs from the cube that declares the join to the joined cube, and Cube joins along directed edges. So a field list offers a joined cube's members under the cube that declares the join, and not the other way round.
3. **A view carries `joins: []`** too.
4. **Each measure carries its `sql`** as the model writes it (`` `amount` ``), or none for a `count` with no `sql`. Two measures of one cube over the same `sql` differ only in their `aggType` (`orders.total_amount` sum, `orders.average_amount` avg): these are the "siblings" chart-editor-Q6 names.
5. **The non-extended `/v1/meta` carries neither `joins` nor a measure's `sql`.** That is why wechart asks for the extended answer for these, as its acceleration panel already does (`CubeClient.metaExtended`).

## What wechart may pass on

The join condition and a measure's SQL are the model's internals, not something the field list shows. wechart's API passes the browser each join's `name` and `relationship` only. For T689 it passes which measures are siblings, never the SQL they share.

## Gotchas

- `connectedComponent` is `undefined` for cubes and views that join nothing. Don't use it to find joins (`data-apis.md` correction: it is necessary, not sufficient).
- The answer is per token. Under xcube's folder gate a token sees only the cubes its groups reach (`xcube-meta-revision-and-bindings.md`), so a join may name a cube absent from the answer. wechart drops such a target rather than naming a cube the user can't see.
