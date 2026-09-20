/* wechart prototype: sample Northwind-shaped data and a tiny in-memory stand-in for Cube /v1/load.
   Deterministic (seeded) so screenshots are stable. Not real Cube; see the prototype note. */
(function () {
  let seed = 20260919;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  const CATEGORIES = [
    'Beverages',
    'Condiments',
    'Confections',
    'Dairy Products',
    'Grains/Cereals',
    'Meat/Poultry',
    'Produce',
    'Seafood',
  ];
  const PRODUCTS = {
    Beverages: [
      'Chai',
      'Chang',
      'Guaraná Fantástica',
      'Sasquatch Ale',
      'Steeleye Stout',
      'Côte de Blaye',
      'Chartreuse verte',
      'Ipoh Coffee',
      'Laughing Lumberjack Lager',
      'Outback Lager',
      'Rhönbräu Klosterbier',
      'Lakkalikööri',
    ],
    Condiments: [
      'Aniseed Syrup',
      "Chef Anton's Cajun Seasoning",
      "Grandma's Boysenberry Spread",
      'Northwoods Cranberry Sauce',
      'Genen Shouyu',
      'Gula Malacca',
      "Sirop d'érable",
      'Vegie-spread',
      'Louisiana Fiery Hot Pepper Sauce',
      'Original Frankfurter grüne Soße',
    ],
    Confections: [
      'Pavlova',
      'Teatime Chocolate Biscuits',
      "Sir Rodney's Marmalade",
      "Sir Rodney's Scones",
      'NuNuCa Nuß-Nougat-Creme',
      'Gumbär Gummibärchen',
      'Schoggi Schokolade',
      'Zaanse koeken',
      'Chocolade',
      'Maxilaku',
      'Valkoinen suklaa',
      'Tarte au sucre',
      'Scottish Longbreads',
    ],
    'Dairy Products': [
      'Queso Cabrales',
      'Queso Manchego La Pastora',
      'Gorgonzola Telino',
      'Mascarpone Fabioli',
      'Geitost',
      'Raclette Courdavault',
      'Camembert Pierrot',
      'Gudbrandsdalsost',
      'Flotemysost',
      'Mozzarella di Giovanni',
    ],
    'Grains/Cereals': [
      "Gustaf's Knäckebröd",
      'Tunnbröd',
      'Singaporean Hokkien Fried Mee',
      'Filo Mix',
      'Gnocchi di nonna Alice',
      'Ravioli Angelo',
      'Wimmers gute Semmelknödel',
    ],
    'Meat/Poultry': [
      'Mishi Kobe Niku',
      'Alice Mutton',
      'Thüringer Rostbratwurst',
      'Perth Pasties',
      'Tourtière',
      'Pâté chinois',
    ],
    Produce: [
      "Uncle Bob's Organic Dried Pears",
      'Tofu',
      'Rössle Sauerkraut',
      'Manjimup Dried Apples',
      'Longlife Tofu',
    ],
    Seafood: [
      'Ikura',
      'Konbu',
      'Carnarvon Tigers',
      'Nord-Ost Matjeshering',
      'Inlagd Sill',
      'Gravad lax',
      'Boston Crab Meat',
      "Jack's New England Clam Chowder",
      'Rogede sild',
      'Spegesild',
      'Escargots de Bourgogne',
      'Röd Kaviar',
    ],
  };
  const COUNTRIES = [
    'USA',
    'Germany',
    'Brazil',
    'France',
    'UK',
    'Venezuela',
    'Austria',
    'Sweden',
    'Canada',
    'Mexico',
    'Italy',
    'Spain',
    'Finland',
    'Ireland',
    'Belgium',
    'Denmark',
    'Switzerland',
    'Argentina',
    'Portugal',
    'Poland',
    'Norway',
  ];
  const REGION = {
    USA: 'Americas',
    Brazil: 'Americas',
    Venezuela: 'Americas',
    Canada: 'Americas',
    Mexico: 'Americas',
    Argentina: 'Americas',
  };
  const EMPLOYEES = [
    'Margaret Peacock',
    'Janet Leverling',
    'Nancy Davolio',
    'Andrew Fuller',
    'Laura Callahan',
    'Robert King',
    'Michael Suyama',
    'Anne Dodsworth',
    'Steven Buchanan',
  ];
  const SHIPPERS = ['United Package', 'Federal Shipping', 'Speedy Express'];
  const catWeight = {
    Beverages: 1.5,
    'Dairy Products': 1.3,
    Confections: 1.1,
    'Meat/Poultry': 1.1,
    Seafood: 1.0,
    Condiments: 0.7,
    'Grains/Cereals': 0.6,
    Produce: 0.6,
  };
  const countryWeight = (c) =>
    ({
      USA: 3,
      Germany: 3,
      Brazil: 1.7,
      France: 1.6,
      UK: 1.4,
      Venezuela: 1.2,
      Austria: 1.6,
      Sweden: 1.1,
    })[c] || 0.5;

  const months = [];
  for (
    let d = new Date(Date.UTC(1996, 6, 1));
    d <= new Date(Date.UTC(1998, 4, 1));
    d.setUTCMonth(d.getUTCMonth() + 1)
  )
    months.push(new Date(d));

  const lines = [];
  let orderId = 10248;
  months.forEach((m, i) => {
    const n = Math.round(24 + i * 1.9 + rnd() * 6) * (i === months.length - 1 ? 0.2 : 1);
    for (let k = 0; k < n; k++) {
      const oid = orderId++;
      let country = pick(COUNTRIES);
      if (rnd() > countryWeight(country) / 3)
        country = pick(['USA', 'Germany', 'Brazil', 'France', 'Austria']);
      const emp = pick(EMPLOYEES),
        ship = pick(SHIPPERS);
      const day = 1 + Math.floor(rnd() * 27);
      const date = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), day));
      const freight = Math.round((8 + rnd() * 120) * 100) / 100;
      const nlines = 1 + Math.floor(rnd() * 4);
      for (let l = 0; l < nlines; l++) {
        let cat = pick(CATEGORIES);
        if (rnd() > catWeight[cat] / 1.6) cat = pick(CATEGORIES);
        const product = pick(PRODUCTS[cat]);
        const price = Math.round((6 + rnd() * 48) * (cat === 'Meat/Poultry' ? 1.8 : 1) * 100) / 100;
        const qty = 4 + Math.floor(rnd() * 36);
        const disc = rnd() < 0.3 ? pick([0.05, 0.1, 0.15, 0.2]) : 0;
        lines.push({
          order_id: oid,
          date,
          category: cat,
          product,
          country,
          region: REGION[country] || 'Europe',
          employee: emp,
          shipper: ship,
          customer: `C${Math.floor(rnd() * 89)}`,
          price,
          qty,
          disc,
          freight: l === 0 ? freight : 0,
          late: rnd() < 0.08,
        });
      }
    }
  });

  const FIELDS = [
    {
      id: 'orders.order_date',
      cube: 'orders',
      title: 'Order date',
      role: 'dim',
      type: 'time',
      desc: 'Date the order was placed',
    },
    {
      id: 'products.category',
      cube: 'products',
      title: 'Category',
      role: 'dim',
      type: 'string',
      desc: 'Product category (8)',
    },
    {
      id: 'products.product_name',
      cube: 'products',
      title: 'Product',
      role: 'dim',
      type: 'string',
      desc: 'Product name (77)',
    },
    {
      id: 'customers.country',
      cube: 'customers',
      title: 'Customer country',
      role: 'dim',
      type: 'string',
      desc: 'Ship-to country (21)',
    },
    {
      id: 'customers.region',
      cube: 'customers',
      title: 'Region',
      role: 'dim',
      type: 'string',
      desc: 'Americas or Europe',
    },
    {
      id: 'employees.full_name',
      cube: 'employees',
      title: 'Sales rep',
      role: 'dim',
      type: 'string',
      desc: 'Employee on the order (9)',
    },
    {
      id: 'orders.shipper',
      cube: 'orders',
      title: 'Shipper',
      role: 'dim',
      type: 'string',
      desc: 'Carrier (3)',
    },
    {
      id: 'orders.is_late',
      cube: 'orders',
      title: 'Shipped late',
      role: 'dim',
      type: 'boolean',
      desc: 'Shipped after required date',
    },
    {
      id: 'order_lines.revenue',
      cube: 'order_lines',
      title: 'Revenue',
      role: 'measure',
      type: 'sum',
      fmt: 'currency',
      desc: 'sum(unit_price × quantity × (1 − discount))',
    },
    {
      id: 'orders.count',
      cube: 'orders',
      title: 'Orders',
      role: 'measure',
      type: 'count',
      fmt: 'number',
      desc: 'Distinct orders',
    },
    {
      id: 'customers.count',
      cube: 'customers',
      title: 'Customers',
      role: 'measure',
      type: 'count_distinct',
      fmt: 'number',
      desc: 'Distinct ordering customers',
    },
    {
      id: 'orders.avg_order_value',
      cube: 'orders',
      title: 'Avg order value',
      role: 'measure',
      type: 'number',
      fmt: 'currency',
      desc: 'revenue / orders',
    },
    {
      id: 'order_lines.units',
      cube: 'order_lines',
      title: 'Units sold',
      role: 'measure',
      type: 'sum',
      fmt: 'number',
      desc: 'sum(quantity)',
    },
    {
      id: 'orders.freight',
      cube: 'orders',
      title: 'Freight',
      role: 'measure',
      type: 'sum',
      fmt: 'currency',
      desc: 'sum(freight)',
    },
    {
      id: 'order_lines.discount_rate',
      cube: 'order_lines',
      title: 'Discount rate',
      role: 'measure',
      type: 'avg',
      fmt: 'percent',
      desc: 'avg(discount)',
    },
  ];
  const byId = Object.fromEntries(FIELDS.map((f) => [f.id, f]));
  /** Cube aggType sum/count sum across rows, so a marked share can be drawn as part of the bar; avg, count_distinct and ratios can't. */
  const additive = (id) => ['sum', 'count'].includes((byId[id] || {}).type);

  const dimValue = (row, id, gran) => {
    switch (id) {
      case 'orders.order_date': {
        const d = row.date,
          y = d.getUTCFullYear(),
          mo = d.getUTCMonth();
        if (gran === 'year') return `${y}`;
        if (gran === 'quarter') return `${y} Q${Math.floor(mo / 3) + 1}`;
        return `${y}-${String(mo + 1).padStart(2, '0')}`;
      }
      case 'products.category':
        return row.category;
      case 'products.product_name':
        return row.product;
      case 'customers.country':
        return row.country;
      case 'customers.region':
        return row.region;
      case 'employees.full_name':
        return row.employee;
      case 'orders.shipper':
        return row.shipper;
      case 'orders.is_late':
        return row.late ? 'Late' : 'On time';
      default:
        return '∅';
    }
  };

  const aggregate = (rs, id) => {
    const rev = () => rs.reduce((s, r) => s + r.price * r.qty * (1 - r.disc), 0);
    const orders = () => new Set(rs.map((r) => r.order_id)).size;
    switch (id) {
      case 'order_lines.revenue':
        return rev();
      case 'orders.count':
        return orders();
      case 'customers.count':
        return new Set(rs.map((r) => r.customer)).size;
      case 'orders.avg_order_value':
        return orders() ? rev() / orders() : 0;
      case 'order_lines.units':
        return rs.reduce((s, r) => s + r.qty, 0);
      case 'orders.freight':
        return rs.reduce((s, r) => s + r.freight, 0);
      case 'order_lines.discount_rate':
        return rs.length ? rs.reduce((s, r) => s + r.disc, 0) / rs.length : 0;
      case '__rows':
        return rs.length; // hidden row count: tells a fully marked item from a partly marked one
      default:
        return 0;
    }
  };

  /** Filters: {id, values, exclude?} or a marking predicate {or: [[{id, granularity, value}, …], …], exclude?}
      — an OR of AND-tuples, the shape Cube's {or:[{and:[…]}]} takes (docs/research/cube/markings-query-support.md Q1). */
  function applyFilters(rs, filters) {
    for (const f of filters || []) {
      if (f.or) {
        if (!f.or.length) continue; // an empty group means "no restriction" in Cube too; callers handle "nothing marked" themselves
        rs = rs.filter((r) => {
          const hit = f.or.some((t) =>
            t.every((c) => dimValue(r, c.id, c.granularity) === c.value),
          );
          return f.exclude ? !hit : hit;
        });
        continue;
      }
      if (!f.values || !f.values.length) continue;
      const set = new Set(f.values);
      rs = rs.filter((r) =>
        f.exclude
          ? !set.has(dimValue(r, f.id, f.granularity))
          : set.has(dimValue(r, f.id, f.granularity)),
      );
    }
    return rs;
  }
  /** Stand-in for Cube's /v1/load: { dims: [{id, granularity}], measures: [id], filters: [...] }. */
  function query(q) {
    const t0 = performance.now();
    const rs = applyFilters(lines, q.filters);
    const groups = new Map();
    for (const r of rs) {
      const key = (q.dims || []).map((d) => dimValue(r, d.id, d.granularity));
      const k = key.join('\u0001');
      if (!groups.has(k)) groups.set(k, { key, rows: [] });
      groups.get(k).rows.push(r);
    }
    const out = [...groups.values()].map((g) => {
      const o = {};
      (q.dims || []).forEach((d, i) => {
        o[d.id] = g.key[i];
      });
      (q.measures || []).forEach((m) => {
        o[m] = aggregate(g.rows, m);
      });
      return o;
    });
    const firstTime = (q.dims || []).find((d) => byId[d.id].type === 'time');
    out.sort(
      (a, b) =>
        (firstTime ? String(a[firstTime.id]).localeCompare(String(b[firstTime.id])) : 0) ||
        ((q.measures || [])[0] ? b[q.measures[0]] - a[q.measures[0]] : 0),
    );
    return {
      rows: out,
      ms: Math.max(4, Math.round(performance.now() - t0 + 18)),
      preAgg: (q.dims || []).every((d) =>
        ['orders.order_date', 'products.category', 'customers.country'].includes(d.id),
      )
        ? 'order_lines.monthly_by_category'
        : null,
    };
  }

  function cardinality(id, gran) {
    return new Set(lines.map((r) => dimValue(r, id, gran))).size;
  }

  const fmt = (v, kind, mode) => {
    if (v == null || Number.isNaN(v)) return '–';
    if (mode === 'full')
      return (
        (kind === 'currency' ? '$' : '') +
        (kind === 'percent'
          ? `${(v * 100).toFixed(2)}%`
          : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }))
      );
    if (mode === 'percent') return `${(v * 100).toFixed(1)}%`;
    if (kind === 'percent') return `${(v * 100).toFixed(1)}%`;
    const abs = Math.abs(v);
    const s =
      abs >= 1e6
        ? `${(v / 1e6).toFixed(2)}M`
        : abs >= 1e4
          ? `${(v / 1e3).toFixed(1)}K`
          : abs >= 100
            ? Math.round(v).toLocaleString('en-US')
            : (Math.round(v * 100) / 100).toLocaleString('en-US');
    return kind === 'currency' ? `$${s}` : s;
  };

  /** Underlying rows for drill-through ("View underlying rows"): line-level records matching the filters. */
  function underlying(filters, limit = 200) {
    const rs = applyFilters(lines, filters);
    return {
      total: rs.length,
      rows: rs
        .slice(0, limit)
        .map((r) => ({
          order_id: r.order_id,
          order_date: r.date.toISOString().slice(0, 10),
          customer: r.customer,
          product: r.product,
          category: r.category,
          quantity: r.qty,
          revenue: r.price * r.qty * (1 - r.disc),
        })),
    };
  }
  const distinct = (id, gran) => [...new Set(lines.map((r) => dimValue(r, id, gran)))].sort();

  /** Shared schedule store (Schedules screen + dashboard "Schedule delivery"). Owned by wechart's scheduler, not Cube. */
  const schedules = [
    {
      id: 's1',
      kind: 'build',
      name: 'Rebuild order_lines.monthly_by_category',
      target: 'order_lines.monthly_by_category',
      cron: '0 * * * *',
      human: 'Every hour at :00',
      tz: 'UTC',
      owner: 'wechart',
      last: ['ok', 'Today 12:00 · 42 s'],
      enabled: true,
      via: 'POST /v1/pre-aggregations/jobs',
    },
    {
      id: 's2',
      kind: 'build',
      name: 'Nightly finance rebuild',
      target: 'finance.*',
      cron: '0 2 * * *',
      human: 'Daily at 02:00',
      tz: 'America/Los_Angeles',
      owner: 'wechart',
      last: ['err', 'Suspended after 4 failures'],
      enabled: false,
      via: 'POST /v1/pre-aggregations/jobs',
    },
    {
      id: 's3',
      kind: 'refresh',
      name: 'customers.country_rollup refresh_key',
      target: 'customers.country_rollup',
      cron: 'every 30 minute',
      human: 'Every 30 minutes',
      tz: 'UTC',
      owner: 'Cube refresh worker',
      last: ['warn', 'Running late · 96 s vs 40 s'],
      enabled: true,
      via: 'refresh_key in model (read-only here)',
    },
    {
      id: 's4',
      kind: 'delivery',
      name: 'Northwind sales → PDF',
      target: 'Dashboard: Northwind sales',
      cron: '0 8 * * 1',
      human: 'Weekly on Monday at 08:00',
      tz: 'America/Los_Angeles',
      owner: 'me',
      last: ['ok', 'Mon 08:00 · delivered'],
      enabled: true,
      via: 'email: me',
    },
    {
      id: 's5',
      kind: 'warmup',
      name: 'Warm cache for Sales overview tab',
      target: 'Dashboard tab: Sales overview',
      cron: '55 7 * * 1-5',
      human: 'Weekdays at 07:55',
      tz: 'America/Los_Angeles',
      owner: 'wechart',
      last: ['ok', 'Today 07:55 · 11 queries'],
      enabled: true,
      via: 'POST /v1/load (renewQuery)',
    },
  ];

  window.WC = {
    schedules,
    underlying,
    distinct,
    FIELDS,
    byId,
    additive,
    query,
    cardinality,
    fmt,
    CATEGORIES,
    COUNTRIES,
    EMPLOYEES,
    SHIPPERS,
    months,
    lineCount: lines.length,
  };
})();
