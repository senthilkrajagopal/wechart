/* wechart prototype: sample Cube model files (YAML) for the model editor. */
window.MODEL_FILES = {
  'model/cubes/orders.yml': `# Orders placed by customers. Owner: data platform team.
cubes:
  - name: orders
    sql_table: public.orders
    data_source: default
    title: Orders
    description: One row per customer order
    joins:
      - name: customers
        relationship: many_to_one
        sql: "{CUBE}.customer_id = {customers}.customer_id"
      - name: employees
        relationship: many_to_one
        sql: "{CUBE}.employee_id = {employees}.employee_id"
    dimensions:
      - name: order_id
        sql: order_id
        type: number
        primary_key: true
      - name: order_date
        sql: order_date
        type: time
        title: Order date
      - name: shipper
        sql: "{CUBE}.ship_via_name"
        type: string
      - name: is_late
        sql: "{CUBE}.shipped_date > {CUBE}.required_date"
        type: boolean
        title: Shipped late
    measures:
      - name: count
        type: count
        title: Orders
        drill_members: [order_id, order_date, customers.company_name]
      - name: freight
        sql: freight
        type: sum
        format: currency
      - name: avg_order_value
        sql: "{order_lines.revenue} / NULLIF({count}, 0)"
        type: number
        format: currency
        title: Avg order value
    segments:
      - name: late_orders
        sql: "{CUBE}.shipped_date > {CUBE}.required_date"
`,
  'model/cubes/order_lines.yml': `cubes:
  - name: order_lines
    sql_table: public.order_details
    joins:
      - name: orders
        relationship: many_to_one
        sql: "{CUBE}.order_id = {orders}.order_id"
      - name: products
        relationship: many_to_one
        sql: "{CUBE}.product_id = {products}.product_id"
    dimensions:
      - name: id
        sql: "{CUBE}.order_id || '-' || {CUBE}.product_id"
        type: string
        primary_key: true
      - name: unit_price
        sql: unit_price
        type: number
        format: currency
    measures:
      - name: revenue
        sql: "{CUBE}.unit_price * {CUBE}.quantity * (1 - {CUBE}.discount)"
        type: sum
        format: currency
        title: Revenue
      - name: units
        sql: quantity
        type: sum
        title: Units sold
      - name: discount_rate
        sql: discount
        type: avg
        format: percent
      - name: revenue_ytd
        sql: "{CUBE}.unit_price * {CUBE}.quantity"
        type: sum
        rolling_window:
          type: to_date
          granularity: year
    pre_aggregations:
      - name: monthly_by_category
        type: rollup
        measures: [revenue, units]
        dimensions: [products.category, customers.country]
        time_dimension: orders.order_date
        granularity: month
        partition_granularity: year
        refresh_key:
          every: 1 hour
`,
  'model/cubes/customers.yml': `cubes:
  - name: customers
    sql_table: public.customers
    dimensions:
      - name: customer_id
        sql: customer_id
        type: string
        primary_key: true
      - name: company_name
        sql: company_name
        type: string
      - name: country
        sql: country
        type: string
      - name: region
        sql: "CASE WHEN country IN ('USA','Canada','Mexico','Brazil','Argentina','Venezuela') THEN 'Americas' ELSE 'Europe' END"
        type: string
    measures:
      - name: count
        sql: customer_id
        type: count_distinct
        title: Customers
    access_policy:
      - group: admins
        member_level:
          includes: "*"
        row_level:
          allow_all: true
      - group: sales_eu
        member_level:
          includes: "*"
        row_level:
          filters:
            - member: region
              operator: equals
              values: [Europe]
      - group: sales_americas
        member_level:
          excludes: [company_name]
        row_level:
          filters:
            - member: region
              operator: equals
              values: [Americas]
`,
  'model/cubes/products.yml': `cubes:
  - name: products
    sql_table: public.products
    dimensions:
      - name: product_id
        sql: product_id
        type: number
        primary_key: true
      - name: product_name
        sql: product_name
        type: string
        title: Product
      - name: category
        sql: category_name
        type: string
    measures:
      - name: count
        type: count
    hierarchies:
      - name: catalog
        title: Catalog
        levels: [category, product_name]
`,
  'model/cubes/employees.yml': `cubes:
  - name: employees
    sql_table: public.employees
    title: Sales reps
    dimensions:
      - name: employee_id
        sql: employee_id
        type: number
        primary_key: true
      - name: full_name
        sql: "{CUBE}.first_name || ' ' || {CUBE}.last_name"
        type: string
        title: Sales rep
      - name: hire_date
        sql: hire_date
        type: time
        granularities:
          - name: fiscal_year
            interval: 1 year
            offset: 6 month
            title: Fiscal year (Jul–Jun)
      - name: email
        sql: email
        type: string
        links:
          - name: mail
            label: Email rep
            url: "'mailto:' || {CUBE}.email"
            primary: true
    measures:
      - name: count
        type: count
        title: Reps
`,
  'model/views/sales.yml': `views:
  - name: sales
    title: Sales
    description: Curated view for dashboard authors
    cubes:
      - join_path: order_lines
        includes: [revenue, units, discount_rate]
      - join_path: order_lines.orders
        includes: [order_date, count, freight, avg_order_value, shipper, is_late]
      - join_path: order_lines.orders.customers
        prefix: true
        includes: [country, region, count]
      - join_path: order_lines.products
        includes: [category, product_name]
    folders:
      - name: Revenue
        includes: [revenue, avg_order_value, discount_rate]
      - name: Customers
        includes: [customers_country, customers_region]
`,
};
