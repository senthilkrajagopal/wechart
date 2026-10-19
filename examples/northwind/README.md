# Northwind demo dashboards

Two dashboards, with their cubes, exported from the docker-desktop deploy on 2026-10-19 (build d31c6ee8), so they can be recreated on a fresh install against the same Northwind Postgres database.

| File | Dashboard | Folder (top level) | Cubes it carries | Charts |
|---|---|---|---|---|
| `northwind-sales-overview.wechart.json` | **Northwind Sales Overview** | **Sales** | `northwind/sales_lines.yml` (cube `sales_lines`) | 14, plus a Text tile |
| `northwind-operations-inventory.wechart.json` | **Northwind Operations & Inventory** | **Shipping** | `northwind/order_summary.yml`, `northwind/product_inventory.yml` | 14, plus a Text tile |
| `analytics-schema.sql` | — | — | the `analytics` schema the cubes read | — |

Each export file holds the dashboard, its charts, its cube files (under the model folder `northwind/`), and a data source named **`default`**:
- driver `postgres`, password auth;
- host `superset-postgresql.superset.svc.cluster.local`, port 5432, user `postgres`, database `northwind`, no TLS.

**No password is in the files.**

## Recreate on a fresh install

### 1. Prepare the database

The cubes read the views `analytics.sales_lines`, `analytics.order_summary` and `analytics.product_inventory`, and the function `analytics.country_iso3`. The views sit on Northwind's own tables (`orders`, `order_details`, `products`, `categories`, `suppliers`, `customers`, `employees`, `shippers`). If your Northwind database doesn't already have the `analytics` schema, run:

```
psql -h <host> -U postgres -d northwind -f examples/northwind/analytics-schema.sql
```

The script is safe to rerun: it uses `CREATE SCHEMA IF NOT EXISTS` and `CREATE OR REPLACE`.

### 2. Set up the data source

Sign in as a Super Admin. In **Explore › Data sources**, make sure the data source the dashboards use is set up:
- named **`default`**;
- PostgreSQL;
- pointing at your Northwind database, with its password.

Then run **Test connection** and make sure it passes. If your host or user differs from the one in the files, change the data source, not the export files. The cubes only name the tables, not the host.

### 3. Create the folders

In Explore, create two top-level folders named exactly **Sales** and **Shipping**. Give them whatever groups should see them; for the demo, everyone signed in had read access.

### 4. Import each dashboard

For each file:

1. Go to **Explore › My workspace**, press **New**, and choose **Import a dashboard…**.
2. Choose the file. The dialog reads it and lists every part: the dashboard, its charts, its cubes and the data source.
3. **Next: Target.** Choose the folder: **Sales** for `northwind-sales-overview.wechart.json`, **Shipping** for `northwind-operations-inventory.wechart.json`.
4. **Next: Review.** Check what will be created. If it says the data source `default` already exists, keep the existing one.
5. Press **Import to My workspace**. A notice says "Imported to My workspace".
6. In that notice, press **Propose to Sales…** (or **Propose to Shipping…**), write a line in **What changed**, and press **Propose**.
7. Open **Reviews** in the top bar, open the proposal, and **Approve** it. As a Super Admin you can approve your own. The dashboard and its cubes then land in the folder, and the cubes are published to Cube.

Import Sales first. The Shipping import brings two different cubes, so the order only matters for the data source, which both share.

### 5. Check

Open each dashboard from its folder.
- The KPI row should show Total Revenue, Orders, Customers and Avg Order Value on Sales, and Avg Days to Ship, Late Shipment Rate, Total Freight and Inventory Value on Shipping.
- The data runs from Jul 1996 to May 1998.
- Maps need the ISO-3 columns, which come from step 1's `country_iso3` function. If a map says its values aren't placed, step 1 is missing.

## What's in each dashboard

- **Sales (Northwind Sales Overview):**
  - KPIs;
  - Monthly Revenue by Category (stacked area);
  - Revenue by Category (donut);
  - Revenue by Customer Country (map);
  - Top 10 Products (bar);
  - Sales Rep Performance by Year (stacked bar);
  - Revenue by Category and Year (pivot);
  - Top Customers (table);
  - Category profile (parallel coordinates);
  - Order revenue by category (box plot);
  - Revenue and orders by month (combo, orders on the right axis).

  It has filters for order date, category, customer country and employee, and two markings, "Selection" and "Rep focus".
- **Shipping (Northwind Operations & Inventory):**
  - KPIs;
  - Orders per Month by Ship Status (stacked bar);
  - Freight by Shipper and Year (bar);
  - Days to Ship Distribution by Shipper (box plot);
  - Orders by Ship Country (map);
  - Stock Status by Category (stacked bar);
  - Stock Value by Category and Product (treemap);
  - Products Needing Reorder (table);
  - Shipping profile by country (parallel coordinates);
  - Freight per order by shipper (box plot);
  - Freight and days to ship by month (combo).

  It has date and shipper filters, which reach the order charts only, and cross-filtering between tiles.

## Refreshing these files

To export again from a running wechart:
1. Sign in as a Super Admin.
2. Open each dashboard's **⋯ › Export…**, choose its cubes and the data source, and save the file here under the same name.
3. Check that no password or secret is in the file before committing.
