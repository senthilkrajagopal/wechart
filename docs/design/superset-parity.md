# Building Superset's dashboards in wechart, and comparing the two side by side

**Asked for by the user, 2026-09-23:** after the implementation, build charts
in wechart "similar to what is there on superset", by driving the browser —
choosing dimensions and measures, and changing the model where that is what it
takes — and then compare the two interfaces visually.

This is the plan, written while the Superset instance was up so that it rests
on what is actually installed rather than on memory.

## 1. What is in the Superset instance today

Running on docker-desktop in namespace `superset`, at <http://localhost:8088>.
It was scaled to zero; `kubectl scale deployment superset superset-worker -n
superset --replicas=1` brings it back, and the same command with `--replicas=0`
puts it away. **Only that namespace is touched; `charter` is left alone.**

- **Two dashboards:** "Northwind Sales Overview" and "Northwind Operations &
  Inventory".
- **22 charts**, by Superset's `viz_type`:

  | Superset type | Count | wechart's equivalent |
  | --- | --- | --- |
  | `big_number_total` | 8 | `kpi` |
  | `echarts_timeseries_bar` | 5 | `bar` |
  | `world_map` | 2 | **none — a gap** |
  | `table` | 2 | `table` |
  | `box_plot` | 1 | **none — a gap** |
  | `echarts_area` | 1 | `area` |
  | `pivot_table_v2` | 1 | `pivot` |
  | `treemap_v2` | 1 | `treemap` |
  | `pie` | 1 | `pie` |

- **Its data** is a `Northwind` database on the same Postgres, exposed as three
  datasets: `sales_lines`, `order_summary`, `product_inventory`.

## 2. What that means for wechart

**Two chart types have no equivalent**, so the dashboards cannot be reproduced
in full as things stand:

- **World map** (`world_map`): wechart draws no geographic chart. AC-037 lists
  the types wechart supports and a map is not among them, so this is a spec
  change, not an implementation gap.
- **Box plot** (`box_plot`): same — not in AC-037's list.

**Decided 2026-09-24 (`docs/requirements.md` R8): both are added.** The three
panels they cover, read from Superset's own database:

| Superset chart | Type | What it shows |
| --- | --- | --- |
| Revenue by Customer Country | `world_map` | `revenue` per `customer_country_iso3`, from `sales_lines` |
| Orders by Ship Country | `world_map` | `orders` per `ship_country_iso3`, from `order_summary` |
| Days to Ship Distribution by Shipper | `box_plot` | per `shipper`, the spread of `MAX(days_to_ship)` taken per `order_id` |

What that sets up, before any code:
- **Research.** A country map needs a renderer and a world boundary file that
  is permissively licensed and bundled with the app (requirements §5: open
  source, permissive licences only; no tile server). A box plot needs its
  quartiles computed *in Cube* if Cube can — whether it has a percentile
  measure is to be verified, not assumed — and otherwise a stated reason why
  not.
- **Spec.** New acceptance criteria for each, alongside AC-037, plus the
  recommender rules (a country dimension with one measure suggests a map; one
  category with a per-row numeric value suggests a box plot).

Everything else maps onto a type wechart already draws.

**The data needs a model.** wechart reads Cube, so reproducing these dashboards
means cubes over the same tables. wechart's sample model already has an
`order_summary` view; `sales_lines` and `product_inventory` have no counterpart
and would be written in the model editor — which is itself part of what the
user asked to exercise ("modify create/modify the models if required"), and a
good test of AC-131–AC-137.

## 3. How the comparison will run

1. **Capture Superset first**, at a fixed viewport (1,440 × 900, light theme):
   both dashboards; the Explore chart builder with a chart open; the dataset
   panel; the dashboard in edit mode.
2. **Build the same thing in wechart** through the browser: create the cubes,
   publish, then author each chart by choosing its cube, measures and
   dimensions, and lay the tiles out.
3. **Capture wechart's** equivalent surfaces at the same viewport and theme.
4. **Compare against a checklist**, not by impression: `direction.md`'s
   numbered rules and its type/spacing/colour tokens, plus the design-critic
   agent, which already reviews a running surface against `references.md` and
   `direction.md`.
5. **Write the findings** to `docs/design/critiques/<date>-superset-parity.md`,
   each with a severity and a rule it fails. A finding that breaks an AC
   becomes a fix; one that does not becomes a proposed spec change for the
   user, which is the standing rule for critiques.

## 4. What I need from the user

- **A signed-in Superset session.** I do not type passwords into forms. Either
  sign in at <http://localhost:8088> in Chrome before the comparison, or say
  that a throwaway read-only account may be used and how it is provisioned.
  The admin credentials are in the Helm release's `init.adminUser` values;
  the user has them.
- ~~The two chart-type decisions in §2~~ — decided 2026-09-24: add both.

## 5. Ordering

This runs **after** the acceptance criteria are met, as the user asked. It
needs, at least: F10 markings and F11 details tiles (both in progress), F6
quick calculations, and the model editor, which is already built. Nothing here
blocks the current implementation; it is written now so the Superset instance
did not have to be investigated twice.
