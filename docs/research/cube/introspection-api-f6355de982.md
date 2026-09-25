---
library: Cube data-source introspection API (fork senthilkrajagopal/cube, branch feat/data-source-introspection-api)
packages: []
# Upstream Cube v1.7.45 plus the fork's commits through f6355de982. An HTTP API, so there are no import names.
version: 1.7.45+f6355de98252a62de82dca2ccbac3c356578df4e
researched: 2026-09-25
sources:
  - https://github.com/senthilkrajagopal/cube/commit/4f872cd99fce6b572f28d7db3de569983528d05a
  - https://github.com/senthilkrajagopal/cube/commit/57118be34f8935b2930f87e685bc03c6818ec60a
  - https://github.com/senthilkrajagopal/cube/commit/47fff0b165652a72d126a54707547fef9a21226f
  - https://github.com/senthilkrajagopal/cube/commit/f6355de98252a62de82dca2ccbac3c356578df4e
  - https://github.com/senthilkrajagopal/cube/blob/f6355de98252a62de82dca2ccbac3c356578df4e/docs-mintlify/reference/core-data-apis/rest-api/reference.mdx
---

# Cube introspection API (fork) at f6355de982: what changed since 95ea166012

A sibling of [introspection-api.md](./introspection-api.md), which describes the fork at `95ea166012`. **Everything that doc says still holds, except where this doc corrects it.** Read both. The four commits below were made to the fork at the user's direction (2026-09-25) to close the gaps that doc found. A Cube-expert agent made them, working from wechart's instructions. Each fix was tested first in the fork's own unit tests, and checked against a probe container built from the new image.

**Image:** `cube:v1.7.45-introspection-f6355de982` (also tagged `cube:v1.7.45-introspection`), image ID `6851a509cef6`. Built with the same overlay Dockerfile ([introspection-api.md](./introspection-api.md), "Install").

## What changed

| # | The gap at 95ea166012 (introspection-api.md) | At f6355de982 | Commit |
| --- | --- | --- | --- |
| 1 | **Member-name collisions dropped columns unsaid** ("Silent losses"): `Amount` and `amount` both became `amount`, and only the last was kept | Every member of a cube gets its own name. The first to take a name keeps it; a later one gets the next free `_2`, `_3`…, skipping any name another member would get unnumbered. Joins refer to the renamed member | [4f872cd99f][c1] |
| 2 | **A number column named like `count` took the count measure's name**, so the cube had no count | `count` is reserved for the count measure; the column's sum is `count_2` | [4f872cd99f][c1] |
| 3 | **A time-typed primary key lost `primary_key`**: listed once as a key and again as a time, and the time kept | Listed once, as a key: `type: time`, `primary_key: true` | [4f872cd99f][c1] |
| 4 | **A join could fall back to a same-named table in another schema** ("A join can still land on a same-named table in another schema") | A foreign key naming its schema joins only that schema's requested table, or nothing. A foreign key with no schema is as before. A `<table>_id` column prefers its own schema; otherwise it joins only when exactly one requested table matches, and adds none when several do | [57118be34f][c2] |
| 5 | **"Continue wait" answered 500 `{"error":"Error: Continue wait"}`**, not the documented 200 | `DataSourceIntrospection` rethrows the queue's `ContinueWaitError` as `{ error: 'Continue wait' }`, which the gateway answers with 200 `{"error":"Continue wait"}`, as `OrchestratorApi` does for queries | [47fff0b165][c3] |
| — | The REST reference said nothing of scaffold naming | It describes the `_2` names, the reserved `count`, a key of any type, and the cross-schema join rules | [f6355de982][c4] |

**What didn't change:**
- Joins are keyed by the target cube, so two columns joining the same cube still keep only the last join ("Two FKs to the same target table").
- A self-referencing foreign key still joins the cube to itself.
- The scaffold still ignores wechart's existing model (T276 handles that).

## Consequences for wechart

- **Map members to columns by `sql`, not by name.** A numbered member's name says nothing about which column it came from. For example, `Amount` (the earlier column) is `amount`, and the `amount` column is `amount_2`. A gap such as `name_3` with no `name_2` is possible.
- **Titles.** No explicit `title` is written for a numbered member, so Cube's default titles read "Amount 2" and "Count 2".
- **The Playground and the CLI** follow the same naming and join rules. A multi-schema Playground scaffold now makes fewer cross-schema joins.
- **wechart's own checks stay, as a guard:** `packages/api/src/model/scaffoldCheck.ts` finds a lost column, a lost count and an unmarked key. At this commit they find nothing on `every_loss` (below).
- **Retrying the 500 form stays harmless.** `packages/api/src/model/introspection.ts` retries both forms of "Continue wait", so an older image answering 500 is still retried.

## Observed

**By the Cube-expert agent,** with a probe container on the new image (port 54010), against wechart's sample database, then removed:
- `generate.every_loss` gave 200 and `unmappedColumns: []`, with:
  - dimension `at`: sql `at`, `time`, `primary_key: true`;
  - measures `count` (`count`), `amount` (`{CUBE}."Amount"`, sum), `amount_2` (`amount`, sum), `count_2` (`count`, sum) and `visit_count` (`{CUBE}."Visit Count"`, sum).
- `generate.chrome_stores` with `generate.chrome_visits`: the response was byte-identical to the 95ea166012 image's, with the join `{CUBE}.store_id = {chrome_stores.id}`.
- **Problem 4 over HTTP,** on a throwaway second data source where `public.orders` has `customer_id` with no foreign key and `seller_id` with a foreign key to `crm.customers`:
  - with `sales.customers` also requested, `seller_id` no longer joins `sales.customers`;
  - with `crm.customers` requested too, `seller_id` joins `crm_customers`, and `customer_id`, now ambiguous, joins nothing.
- **Problem 5** is shown by unit tests only (`DataSourceIntrospection.test.ts`, "a wait the queue outlasts"). It was not provoked over HTTP.
- **The fork's tests at f6355de982:**
  - schema-compiler scaffolding: 35 passed, 18 snapshots unchanged;
  - server-core `DataSourceIntrospection`: 28 passed;
  - api-gateway `data-sources`: 35 passed.

**By wechart, 2026-09-25,** once compose's `wechart-cube` and `wechart-cube-refresh-worker` were recreated on `cube:v1.7.45-introspection-f6355de982` (both report image `sha256:6851a509cef6…`):
- `e2e/generate-cubes.spec.ts` passes in Chrome, Firefox and Safari.
  - "Cube's scaffold keeps every column of a table that once lost three…": the members above, "Every column is in the cube.", and none of wechart's loss notes.
  - The stores and visits test: the same exact "Columns left out" lists as on 95ea166012.
- `e2e/cube-scopes.spec.ts` passes. The introspection token still reads no model and loads no data.

## Unverified

- "Continue wait" as 200 over HTTP. Only the unit tests show it.
- The Helm release on this image. It is deployed from `deploy/helm/values/docker-desktop.yaml`, and was not yet observed when this was written.

[c1]: https://github.com/senthilkrajagopal/cube/commit/4f872cd99fce6b572f28d7db3de569983528d05a
[c2]: https://github.com/senthilkrajagopal/cube/commit/57118be34f8935b2930f87e685bc03c6818ec60a
[c3]: https://github.com/senthilkrajagopal/cube/commit/47fff0b165652a72d126a54707547fef9a21226f
[c4]: https://github.com/senthilkrajagopal/cube/commit/f6355de98252a62de82dca2ccbac3c356578df4e
