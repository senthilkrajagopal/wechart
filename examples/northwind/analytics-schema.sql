-- The `analytics` schema the Northwind cubes read (sales_lines, order_summary,
-- product_inventory). Run once against the `northwind` database, as a user that
-- may create schemas. Taken from the Superset Northwind database these
-- dashboards were rebuilt from (2026-10-19). Safe to rerun.

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE OR REPLACE FUNCTION analytics.country_iso3(country text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE country
    WHEN 'Argentina' THEN 'ARG' WHEN 'Austria' THEN 'AUT' WHEN 'Belgium' THEN 'BEL'
    WHEN 'Brazil' THEN 'BRA' WHEN 'Canada' THEN 'CAN' WHEN 'Denmark' THEN 'DNK'
    WHEN 'Finland' THEN 'FIN' WHEN 'France' THEN 'FRA' WHEN 'Germany' THEN 'DEU'
    WHEN 'Ireland' THEN 'IRL' WHEN 'Italy' THEN 'ITA' WHEN 'Mexico' THEN 'MEX'
    WHEN 'Norway' THEN 'NOR' WHEN 'Poland' THEN 'POL' WHEN 'Portugal' THEN 'PRT'
    WHEN 'Spain' THEN 'ESP' WHEN 'Sweden' THEN 'SWE' WHEN 'Switzerland' THEN 'CHE'
    WHEN 'UK' THEN 'GBR' WHEN 'USA' THEN 'USA' WHEN 'Venezuela' THEN 'VEN'
    WHEN 'Australia' THEN 'AUS' WHEN 'Japan' THEN 'JPN' WHEN 'Netherlands' THEN 'NLD'
    WHEN 'Singapore' THEN 'SGP'
  END
$function$;

CREATE OR REPLACE VIEW analytics.sales_lines AS
 SELECT od.order_id,
    o.order_date,
    (EXTRACT(year FROM o.order_date))::integer AS order_year,
    ('Q'::text || (EXTRACT(quarter FROM o.order_date))::integer) AS order_quarter,
    c.customer_id,
    c.company_name AS customer,
    c.city AS customer_city,
    c.country AS customer_country,
    analytics.country_iso3((c.country)::text) AS customer_country_iso3,
    (((e.first_name)::text || ' '::text) || (e.last_name)::text) AS employee,
    s.company_name AS shipper,
    p.product_id,
    p.product_name,
    cat.category_name AS category,
    sup.company_name AS supplier,
    sup.country AS supplier_country,
    (od.unit_price)::numeric(10,2) AS unit_price,
    od.quantity,
    (od.discount)::numeric(4,2) AS discount,
    round(((od.unit_price * (od.quantity)::double precision))::numeric, 2) AS gross_amount,
    round((((od.unit_price * (od.quantity)::double precision) * od.discount))::numeric, 2) AS discount_amount,
    round((((od.unit_price * (od.quantity)::double precision) * ((1)::double precision - od.discount)))::numeric, 2) AS revenue
   FROM (((((((order_details od
     JOIN orders o ON ((o.order_id = od.order_id)))
     JOIN products p ON ((p.product_id = od.product_id)))
     JOIN categories cat ON ((cat.category_id = p.category_id)))
     JOIN suppliers sup ON ((sup.supplier_id = p.supplier_id)))
     LEFT JOIN customers c ON (((c.customer_id)::text = (o.customer_id)::text)))
     LEFT JOIN employees e ON ((e.employee_id = o.employee_id)))
     LEFT JOIN shippers s ON ((s.shipper_id = o.ship_via)));

CREATE OR REPLACE VIEW analytics.order_summary AS
 SELECT o.order_id,
    o.order_date,
    o.required_date,
    o.shipped_date,
    (EXTRACT(year FROM o.order_date))::integer AS order_year,
    c.company_name AS customer,
    c.country AS customer_country,
    (((e.first_name)::text || ' '::text) || (e.last_name)::text) AS employee,
    s.company_name AS shipper,
    o.ship_city,
    o.ship_country,
    analytics.country_iso3((o.ship_country)::text) AS ship_country_iso3,
        CASE
            WHEN (o.shipped_date IS NULL) THEN 'Not shipped'::text
            WHEN (o.shipped_date > o.required_date) THEN 'Late'::text
            ELSE 'On time'::text
        END AS ship_status,
    (o.shipped_date - o.order_date) AS days_to_ship,
    round((o.freight)::numeric, 2) AS freight,
    l.line_items,
    l.units,
    l.revenue AS order_revenue
   FROM ((((orders o
     LEFT JOIN customers c ON (((c.customer_id)::text = (o.customer_id)::text)))
     LEFT JOIN employees e ON ((e.employee_id = o.employee_id)))
     LEFT JOIN shippers s ON ((s.shipper_id = o.ship_via)))
     LEFT JOIN LATERAL ( SELECT count(*) AS line_items,
            sum(od.quantity) AS units,
            round((sum(((od.unit_price * (od.quantity)::double precision) * ((1)::double precision - od.discount))))::numeric, 2) AS revenue
           FROM order_details od
          WHERE (od.order_id = o.order_id)) l ON (true));

CREATE OR REPLACE VIEW analytics.product_inventory AS
 SELECT p.product_id,
    p.product_name,
    cat.category_name AS category,
    sup.company_name AS supplier,
    sup.country AS supplier_country,
    p.quantity_per_unit,
    (p.unit_price)::numeric(10,2) AS unit_price,
    p.units_in_stock,
    p.units_on_order,
    p.reorder_level,
    (p.discontinued = 1) AS discontinued,
    round(((p.unit_price * (p.units_in_stock)::double precision))::numeric, 2) AS stock_value,
        CASE
            WHEN (p.discontinued = 1) THEN 'Discontinued'::text
            WHEN (p.units_in_stock = 0) THEN 'Out of stock'::text
            WHEN ((p.units_in_stock + p.units_on_order) <= p.reorder_level) THEN 'Reorder now'::text
            WHEN (p.units_in_stock <= p.reorder_level) THEN 'Low (on order)'::text
            ELSE 'OK'::text
        END AS stock_status
   FROM ((products p
     JOIN categories cat ON ((cat.category_id = p.category_id)))
     JOIN suppliers sup ON ((sup.supplier_id = p.supplier_id)));
