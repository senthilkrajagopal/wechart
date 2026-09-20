/* wechart prototype: content catalog — folders, charts (specs) and dashboards (layout trees). In-memory.
   Chart ownership (user decision 2026-09-19): a chart belongs to one dashboard (owner = dashboard id, folder = null)
   unless it has been saved to a folder, which makes it a shared library chart (owner = null) usable on many dashboards. */
(function () {
  const O = () => ({
    legend: { show: true, pos: 'top' },
    x: { rotate: 0, showTitle: false, title: '' },
    y: { zero: true, log: false, grid: true, showTitle: false, title: '', min: '', max: '' },
    labels: false,
    numFmt: '',
    series: {},
    stack: true,
  });
  const chart = (id, folder, title, s) => ({
    id,
    kind: 'chart',
    folder,
    owner: null,
    updated: s.updated || 'Sep 18',
    spec: {
      title,
      source: 'view:sales',
      type: 'auto',
      time: null,
      metrics: [],
      dimensions: [],
      filters: [],
      sort: '',
      topK: '',
      options: O(),
      ...s,
    },
  });
  const local = (id, owner, title, s) => ({ ...chart(id, null, title, s), owner });
  const T = (id, g = 'month') => ({ id, granularity: g });

  const folders = [
    { id: 'root', name: 'Our analytics', parent: null },
    { id: 'sales', name: 'Sales', parent: 'root' },
    { id: 'ops', name: 'Operations', parent: 'root' },
    { id: 'finance', name: 'Finance', parent: 'root' },
    { id: 'mine', name: 'My workspace', parent: null, personal: true },
  ];

  const charts = [
    chart('c-rev', 'sales', 'Revenue', { type: 'kpi', metrics: ['order_lines.revenue'] }),
    chart('c-orders', 'sales', 'Orders', { type: 'kpi', metrics: ['orders.count'] }),
    chart('c-cust', 'sales', 'Customers', { type: 'kpi', metrics: ['customers.count'] }),
    chart('c-aov', 'sales', 'Avg order value', {
      type: 'kpi',
      metrics: ['orders.avg_order_value'],
    }),
    local('c-monthly', 'd-northwind', 'Monthly revenue by category', {
      type: 'stackedarea',
      time: T('orders.order_date'),
      metrics: ['order_lines.revenue'],
      dimensions: ['products.category'],
    }),
    local('c-bycat', 'd-northwind', 'Revenue by category', {
      type: 'hbar',
      metrics: ['order_lines.revenue'],
      dimensions: ['products.category'],
      sort: 'desc',
    }),
    local('c-country', 'd-northwind', 'Revenue by customer country', {
      type: 'hbar',
      metrics: ['order_lines.revenue'],
      dimensions: ['customers.country'],
      sort: 'desc',
      topK: '10',
    }),
    local('c-shipper', 'd-northwind', 'Monthly revenue by shipper', {
      type: 'facet',
      time: T('orders.order_date'),
      metrics: ['order_lines.revenue'],
      dimensions: ['orders.shipper'],
    }),
    chart('c-products', 'sales', 'Top 10 products', {
      type: 'auto',
      metrics: ['order_lines.revenue'],
      dimensions: ['products.product_name'],
      topK: '10',
      updated: 'Sep 12',
    }),
    chart('c-late', 'ops', 'Orders per month, on time vs late', {
      type: 'stackedbar',
      time: T('orders.order_date'),
      metrics: ['orders.count'],
      dimensions: ['orders.is_late'],
    }),
    local('c-freight', 'd-northwind', 'Freight by shipper', {
      type: 'bar',
      metrics: ['orders.freight'],
      dimensions: ['orders.shipper'],
      sort: 'desc',
    }),
    local('c-repcat', 'd-northwind', 'Revenue by sales rep and category', {
      type: 'heatmap',
      metrics: ['order_lines.revenue'],
      dimensions: ['employees.full_name', 'products.category'],
    }),
    local('c-details', 'd-northwind', 'Products in the marked categories and countries', {
      type: 'table',
      metrics: ['order_lines.revenue', 'order_lines.units'],
      dimensions: ['products.product_name'],
      sort: 'desc',
    }),
    chart('c-freightk', 'ops', 'Freight', { type: 'kpi', metrics: ['orders.freight'] }),
    chart('c-units', 'ops', 'Units sold', { type: 'kpi', metrics: ['order_lines.units'] }),
    chart('c-disc', 'mine', 'Discount rate by quarter', {
      type: 'auto',
      time: T('orders.order_date', 'quarter'),
      metrics: ['order_lines.discount_rate'],
      updated: 'Sep 19',
    }),
  ];

  let uid = 1;
  const id = (p) => `${p}${uid++}`;
  const C = (chartId, w, h, extra = {}) => ({
    id: id('i'),
    kind: 'chart',
    chart: chartId,
    w,
    h,
    ...extra,
  });
  /* Dashboard settings (gear → settings page). interaction: 'markings' (Spotfire) | 'crossfilter' (Power BI-style filter/highlight
     per tile pair) — a per-dashboard choice (user, 2026-09-19). New dashboards default to markings (user, 2026-09-19).
     Markings are definitions only; marked items live in the URL. */
  const settings = (interaction = 'markings', markings) => ({
    interaction,
    markings: markings || [{ id: 'mk1', name: 'Marking', slot: 1, isDefault: true }],
    crossDefault: 'filter',
    width: 'fixed',
  });

  const dashboards = [
    {
      id: 'd-northwind',
      kind: 'dashboard',
      folder: 'sales',
      name: 'Northwind sales',
      updated: 'Sep 19',
      description: 'Revenue, orders and customers since July 1996',
      settings: settings('markings', [
        { id: 'mk1', name: 'Marking', slot: 1, isDefault: true },
        { id: 'mk2', name: 'Countries', slot: 2 },
      ]),
      tabs: [
        {
          id: 't-s',
          title: 'Sales overview',
          items: [
            {
              id: id('i'),
              kind: 'markdown',
              w: 12,
              text: '## Northwind Traders: sales\nRevenue {{measure:order_lines.revenue}} across {{measure:orders.count}} orders. Mark bars, slices or trellis panels to brush the other tiles.\n**Marked:** {{marking:Marking.summary}} · revenue {{measure:order_lines.revenue | marking:Marking}}',
            },
            C('c-rev', 3, 13),
            C('c-orders', 3, 13),
            C('c-cust', 3, 13),
            C('c-aov', 3, 13),
            C('c-monthly', 8, 40),
            C('c-bycat', 4, 40),
            {
              id: id('i'),
              kind: 'section',
              title: 'Customers and fulfilment',
              collapsed: false,
              items: [C('c-country', 6, 40, { marking: 'mk2' }), C('c-shipper', 6, 40)],
            },
            {
              id: id('i'),
              kind: 'section',
              title: 'Marked details',
              collapsed: false,
              items: [
                C('c-details', 12, 34, {
                  marking: null,
                  limit: {
                    ids: ['mk1', 'mk2'],
                    combine: 'and',
                    empty: 'message',
                    message:
                      'Mark categories in "Revenue by category" or countries in "Revenue by customer country" to list their products.',
                  },
                }),
              ],
            },
            {
              id: id('i'),
              kind: 'link',
              w: 3,
              h: 7,
              label: 'Open Fulfilment health',
              style: 'button',
              target: { type: 'dashboard', id: 'd-ops' },
              passFilters: true,
            },
          ],
        },
        {
          id: 't-o',
          title: 'Operations',
          items: [
            C('c-freightk', 6, 13),
            C('c-units', 6, 13),
            C('c-late', 8, 40),
            C('c-freight', 4, 40),
            C('c-repcat', 12, 42),
          ],
        },
      ],
    },
    {
      id: 'd-ops',
      kind: 'dashboard',
      folder: 'ops',
      name: 'Fulfilment health',
      updated: 'Sep 16',
      description: 'Shipping, lateness and freight',
      settings: settings('crossfilter'),
      tabs: [
        {
          id: 't-1',
          title: 'Overview',
          items: [C('c-freightk', 4, 13), C('c-units', 4, 13), C('c-late', 12, 40)],
        },
      ],
    },
    {
      id: 'd-fin',
      kind: 'dashboard',
      folder: 'finance',
      name: 'Finance close (draft)',
      updated: 'Sep 10',
      description: 'Empty draft',
      tabs: [{ id: 't-2', title: 'Overview', items: [] }],
    },
  ];

  const usedIn = (chartId) =>
    dashboards
      .filter((d) => JSON.stringify(d.tabs).includes(`"chart":"${chartId}"`))
      .map((d) => d.name);
  // Library = charts saved to a folder; dashboard-local charts never appear in folders or search.
  const library = () => charts.filter((c) => !c.owner);
  window.CATALOG = {
    folders,
    charts,
    dashboards,
    id,
    usedIn,
    library,
    settings,
    chartById: (cid) => charts.find((c) => c.id === cid),
    dashById: (did) => dashboards.find((d) => d.id === did),
  };
})();
