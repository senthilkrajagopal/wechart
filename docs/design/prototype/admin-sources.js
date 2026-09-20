/* wechart prototype: Data sources v2 — list, detail (tabs incl. health + usage), add-connection wizard with Test gate. */
(function () {
  const st = UI.status,
    esc = UI.esc;
  const DRIVERS = {
    PostgreSQL: {
      env: 'postgres',
      fields: [
        ['Host', 'host', 'northwind-postgres.wechart.svc'],
        ['Port', 'port', '5432'],
        ['Database', 'db', 'northwind'],
        ['User', 'user', 'cube_reader'],
        ['Password', 'password', '', 'secret'],
      ],
      ssl: true,
    },
    Snowflake: {
      env: 'snowflake',
      fields: [
        ['Account', 'account', 'acme-xy12345'],
        ['Warehouse', 'warehouse', 'ANALYTICS_WH'],
        ['Role', 'role', 'CUBE_ROLE'],
        ['Database', 'db', 'FINANCE'],
        ['User', 'user', 'CUBE_SVC'],
        ['Private key (PEM)', 'key', '', 'secret'],
      ],
    },
    'Google BigQuery': {
      env: 'bigquery',
      fields: [
        ['Project ID', 'project', 'acme-analytics'],
        ['Location', 'location', 'US'],
        ['Service account key (JSON)', 'key', '', 'secret'],
      ],
    },
    Databricks: {
      env: 'databricks-jdbc',
      fields: [
        ['JDBC URL', 'url', 'jdbc:databricks://…'],
        ['Access token', 'token', '', 'secret'],
        ['Catalog', 'catalog', 'main'],
      ],
    },
    MySQL: {
      env: 'mysql',
      fields: [
        ['Host', 'host', ''],
        ['Port', 'port', '3306'],
        ['Database', 'db', ''],
        ['User', 'user', ''],
        ['Password', 'password', '', 'secret'],
      ],
      ssl: true,
    },
    'Microsoft SQL Server': {
      env: 'mssql',
      fields: [
        ['Host', 'host', ''],
        ['Port', 'port', '1433'],
        ['Database', 'db', ''],
        ['User', 'user', ''],
        ['Password', 'password', '', 'secret'],
      ],
      ssl: true,
    },
    ClickHouse: {
      env: 'clickhouse',
      fields: [
        ['Host', 'host', ''],
        ['Port', 'port', '8123'],
        ['Database', 'db', 'default'],
        ['User', 'user', 'default'],
        ['Password', 'password', '', 'secret'],
      ],
      ssl: true,
    },
    'Amazon Redshift': {
      env: 'redshift',
      fields: [
        ['Host', 'host', ''],
        ['Port', 'port', '5439'],
        ['Database', 'db', ''],
        ['User', 'user', ''],
        ['Password', 'password', '', 'secret'],
      ],
      ssl: true,
    },
    'Amazon Athena': {
      env: 'athena',
      fields: [
        ['Region', 'region', 'us-east-1'],
        ['S3 output location', 's3', 's3://…'],
        ['Workgroup', 'wg', 'primary'],
        ['Access key', 'ak', ''],
        ['Secret key', 'sk', '', 'secret'],
      ],
    },
    Trino: {
      env: 'trino',
      fields: [
        ['Host', 'host', ''],
        ['Port', 'port', '8080'],
        ['Catalog', 'catalog', ''],
        ['Schema', 'schema', ''],
        ['User', 'user', ''],
      ],
      ssl: true,
    },
    DuckDB: {
      env: 'duckdb',
      fields: [
        ['Database file or MotherDuck URL', 'url', 'md:analytics'],
        ['Token', 'token', '', 'secret'],
      ],
    },
    Oracle: {
      env: 'oracle',
      fields: [
        ['Host', 'host', ''],
        ['Port', 'port', '1521'],
        ['Service name', 'db', ''],
        ['User', 'user', ''],
        ['Password', 'password', '', 'secret'],
      ],
    },
  };
  const CHECKS = [
    'Resolve host',
    'Open connection',
    'TLS handshake and certificate',
    'Authenticate',
    'Read schema (information_schema)',
    'Run sample query (SELECT 1)',
  ];
  const S = {
    sel: 0,
    tab: 'connection',
    test: null,
    tested: false,
    wiz: null,
    rows: [
      {
        name: 'default',
        type: 'PostgreSQL',
        where: 'northwind-postgres.wechart.svc:5432 / northwind',
        health: ['ok', 'Healthy'],
        used: ['orders', 'order_lines', 'customers', 'products', 'employees'],
        last: '4 min ago',
        hist: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      },
      {
        name: 'finance_dw',
        type: 'Snowflake',
        where: 'acme-xy12345 / FINANCE',
        health: ['warn', 'Key rotates in 5 days'],
        used: ['gl_entries', 'budgets', 'fx_rates'],
        last: '1 h ago',
        hist: [1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 0.5],
      },
      {
        name: 'legacy_mysql',
        type: 'MySQL',
        where: 'mysql-legacy.internal:3306 / erp',
        health: ['err', 'Authentication failed'],
        used: ['erp_invoices'],
        last: '12 min ago',
        hist: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
      },
    ],
  };
  const color = (v) =>
    v === 1 ? 'var(--ok-icon)' : v === 0 ? 'var(--err-icon)' : 'var(--warn-icon)';

  function testList(checks) {
    return `<div class="checks">${CHECKS.map((c, i) => {
      const s = (checks || [])[i];
      return `<div class="check">${s ? UI.STATUS_SVG[s[0]] : UI.STATUS_SVG.idle}<span>${c}</span><span class="xs muted tnum">${s ? esc(s[1]) : ''}</span></div>`;
    }).join('')}</div>`;
  }
  function runTest(onStep, fail) {
    const out = [],
      times = ['4 ms', '12 ms', '31 ms', '48 ms', '22 ms', '9 ms'];
    const step = (i) => {
      if (i >= CHECKS.length) return onStep(out, fail < 0);
      out[i] =
        i === fail ? ['err', 'password authentication failed for user "report"'] : ['ok', times[i]];
      onStep(out, null);
      if (i !== fail) setTimeout(() => step(i + 1), 260);
      else onStep(out, false);
    };
    step(0);
  }

  function detail(r) {
    const d = DRIVERS[r.type] || DRIVERS.PostgreSQL;
    const tabs = [
      ['general', 'General'],
      ['connection', 'Connection'],
      ['advanced', 'Advanced'],
      ['test', 'Test'],
      ['usage', 'Usage'],
    ];
    let body = '';
    if (S.tab === 'general')
      body = `<div class="section"><div class="field"><label>Name</label><input class="input sm mono" value="${esc(r.name)}"></div><div class="field"><label>Type</label><input class="input sm" value="${esc(r.type)}" disabled></div><div class="field"><label>Description</label><textarea class="input" rows="2" style="font-family:var(--font-ui)">Operational replica used by the sales cubes</textarea></div></div>`;
    if (S.tab === 'connection')
      body = `<div class="section">${d.fields.map(([l, k, v, secret]) => `<div class="field"><label>${l}</label><input class="input sm ${secret ? '' : 'mono'}" type="${secret ? 'password' : 'text'}" value="${secret ? '••••••••' : esc(v)}" ${secret ? `aria-describedby="sec-${k}"` : ''}>${secret ? `<span id="sec-${k}" class="xs muted">Stored encrypted by wechart; never shown again</span>` : ''}</div>`).join('')}${d.ssl ? `<div class="inline"><span>Use SSL/TLS</span><button class="switch" role="switch" aria-checked="true"></button></div><div class="inline"><span>Verify server certificate</span><button class="switch" role="switch" aria-checked="true"></button></div><p class="xs muted" style="margin:0">Cube's default doesn't verify certificates (<code>CUBEJS_DB_SSL_REJECT_UNAUTHORIZED=false</code>). wechart turns verification on.</p>` : ''}</div>`;
    if (S.tab === 'advanced')
      body = `<div class="section"><div class="row2"><div class="field"><label>Pool max</label><input class="input sm" value="8"></div><div class="field"><label>Query concurrency</label><input class="input sm" value="4"></div></div><div class="field"><label>Pre-aggregation schema</label><input class="input sm mono" value="prod_pre_aggregations"></div><div class="field"><label>Generated Cube configuration</label><pre class="mono" style="margin:0;padding:8px;background:var(--bg-subtle);border-radius:4px;white-space:pre-wrap">CUBEJS_DS_${r.name.toUpperCase()}_DB_TYPE=${d.env}\n# Served at runtime by wechart via driverFactory({ dataSource: '${r.name}' })</pre></div></div>`;
    if (S.tab === 'test')
      body = `<div class="section"><h3>Connection test</h3>${testList(S.test)}<button class="btn" data-runtest>${S.test ? 'Run again' : 'Run test'}</button></div><div class="section"><h3>Health (last 14 checks)</h3><div style="display:flex;gap:3px" aria-label="Health history">${r.hist.map((v) => `<span title="${v === 1 ? 'OK' : v === 0 ? 'Failed' : 'Warning'}" style="width:14px;height:22px;border-radius:2px;background:${color(v)}"></span>`).join('')}</div><span class="xs muted">wechart tests every 15 minutes. Cube Core has no connection-health API.</span></div>`;
    if (S.tab === 'usage')
      body = `<div class="section"><h3>Cubes using this source (${r.used.length})</h3>${r.used.map((c) => `<div class="inline"><span class="mono">${esc(c)}</span><button class="btn sm" data-goto="model">Open</button></div>`).join('')}<p class="xs muted" style="margin:0">Cubes choose a source with <code>data_source</code> in YAML.</p></div>`;
    return `<div class="pane-head"><h2 class="mono">${esc(r.name)}</h2><span style="margin-left:auto">${st(r.health[0], r.health[1])}</span></div><div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-dstab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}</div><div class="pane-body">${body}</div><div class="formbar" style="border-top:1px solid var(--border-subtle);border-bottom:0"><span class="xs muted" style="flex:1">${S.tested ? 'Test passed. Changes apply when Cube opens a new connection pool.' : 'Run the Test step before saving.'}</span><button class="btn ghost sm">Save without test</button><button class="btn primary sm" ${S.tested ? '' : 'disabled style="opacity:.5"'}>Save</button></div>`;
  }

  function wizard() {
    const w = S.wiz,
      steps = ['Type', 'Connection', 'Test', 'Name and assign'];
    const head = `<div class="pane-head"><h2>New data source</h2><button class="btn sm" data-wizclose style="margin-left:auto">Cancel</button></div><div style="display:flex;gap:4px;padding:8px 12px;border-bottom:1px solid var(--border-subtle)">${steps.map((s, i) => `<span class="badge ${i === w.step ? 'accent' : ''}">${i + 1}. ${s}</span>`).join('')}</div>`;
    let body = '';
    if (w.step === 0)
      body = `<div class="section"><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px">${Object.keys(
        DRIVERS,
      )
        .map(
          (k) =>
            `<button class="btn" data-wiztype="${esc(k)}" aria-pressed="${w.type === k}" style="justify-content:flex-start;${w.type === k ? 'border-color:var(--accent);background:var(--accent-soft)' : ''}">${esc(k)}</button>`,
        )
        .join(
          '',
        )}</div><p class="xs muted" style="margin:0">Officially supported Cube drivers. Community drivers can be added through the Advanced tab.</p></div>`;
    if (w.step === 1)
      body = `<div class="section">${DRIVERS[w.type].fields.map(([l, k, v, secret]) => `<div class="field"><label for="wz-${k}">${l}</label><input id="wz-${k}" class="input sm ${secret ? '' : 'mono'}" type="${secret ? 'password' : 'text'}" placeholder="${esc(v)}"></div>`).join('')}${DRIVERS[w.type].ssl ? '<div class="inline"><span>Use SSL/TLS and verify certificate</span><button class="switch" role="switch" aria-checked="true"></button></div>' : ''}</div>`;
    if (w.step === 2)
      body = `<div class="section"><h3>Test ${esc(w.type)} connection</h3>${testList(w.test)}<button class="btn" data-wiztest>${w.test ? 'Run again' : 'Run test'}</button></div>`;
    if (w.step === 3)
      body = `<div class="section"><div class="field"><label for="wz-name">Name</label><input id="wz-name" class="input sm mono" value="sales_replica"><span class="xs muted">Cubes reference it as <code>data_source: sales_replica</code></span></div><div class="field"><span class="lbl">Move existing cubes to this source (optional)</span>${['orders', 'order_lines', 'customers'].map((c) => `<label class="inline"><span class="mono">${c}</span><input type="checkbox"></label>`).join('')}</div></div>`;
    const canNext =
      (w.step === 0 && w.type) || w.step === 1 || (w.step === 2 && w.passed) || w.step === 3;
    return (
      head +
      `<div class="pane-body">${body}</div><div class="formbar" style="border-top:1px solid var(--border-subtle);border-bottom:0">${w.step ? '<button class="btn sm" data-wizback>Back</button>' : ''}<span style="flex:1"></span><button class="btn primary sm" data-wiznext ${canNext ? '' : 'disabled style="opacity:.5"'}>${w.step === 3 ? 'Create data source' : 'Next'}</button></div>`
    );
  }

  function render(root) {
    const r = S.rows[S.sel];
    root.innerHTML = `<div class="admin-main">
        <div style="display:flex;align-items:center;gap:8px"><h1>Data sources</h1><span style="flex:1"></span><button class="btn primary" data-wizopen>+ Data source</button></div>
        <div class="warnbar" style="background:var(--accent-soft);border:1px solid var(--border-subtle);border-radius:6px"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="var(--accent)"/><path d="M8 7v4M8 4.6v.4" stroke="var(--bg-surface)" stroke-width="1.6"/></svg><span>Cube Core has no API for managing connections. wechart stores them encrypted and serves them through Cube's <code>driverFactory</code>, so an edit takes effect when Cube opens a new pool. Tests and health are wechart's own.</span></div>
        <div class="card tscroll"><table class="grid-table comfy"><thead><tr><th>Name</th><th>Type</th><th>Location</th><th>Status</th><th>Health (14 checks)</th><th class="num">Cubes</th><th>Last test</th></tr></thead><tbody>${S.rows.map((d, i) => `<tr class="${i === S.sel && !S.wiz ? 'sel' : ''}" data-ds="${i}" style="cursor:pointer"><td class="strong mono">${esc(d.name)}</td><td>${esc(d.type)}</td><td class="mono xs">${esc(d.where)}</td><td>${st(d.health[0], d.health[1])}</td><td><span style="display:inline-flex;gap:2px">${d.hist.map((v) => `<span style="width:5px;height:14px;border-radius:1px;background:${color(v)}"></span>`).join('')}</span></td><td class="num tnum">${d.used.length}</td><td class="muted">${d.last}</td></tr>`).join('')}</tbody></table></div>
      </div><aside class="pane right" aria-label="${S.wiz ? 'New data source wizard' : 'Connection detail'}">${S.wiz ? wizard() : detail(r)}</aside>`;
  }

  function bind(root) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ds], button');
      if (!t) return;
      const d = t.dataset;
      if (d.ds) {
        S.sel = +d.ds;
        S.test = null;
        S.tested = false;
        S.wiz = null;
        return render(root);
      }
      if (d.dstab) {
        S.tab = d.dstab;
        return render(root);
      }
      if ('runtest' in d)
        return runTest(
          (out, done) => {
            S.test = out.slice();
            if (done != null) S.tested = done;
            render(root);
          },
          S.sel === 2 ? 3 : -1,
        );
      if ('wizopen' in d) {
        S.wiz = { step: 0, type: null, test: null, passed: false };
        return render(root);
      }
      if ('wizclose' in d) {
        S.wiz = null;
        return render(root);
      }
      if (d.wiztype) {
        S.wiz.type = d.wiztype;
        return render(root);
      }
      if ('wizback' in d) {
        S.wiz.step--;
        return render(root);
      }
      if ('wiztest' in d)
        return runTest((out, done) => {
          S.wiz.test = out.slice();
          if (done != null) S.wiz.passed = done;
          render(root);
        }, -1);
      if ('wiznext' in d) {
        if (S.wiz.step === 3) {
          S.rows.push({
            name: 'sales_replica',
            type: S.wiz.type,
            where: 'new connection',
            health: ['ok', 'Healthy'],
            used: [],
            last: 'Just now',
            hist: [1],
          });
          S.sel = S.rows.length - 1;
          S.wiz = null;
          S.tested = true;
        } else S.wiz.step++;
        return render(root);
      }
      if (d.goto) window.APP.go(d.goto);
    });
  }

  window.ADMIN = window.ADMIN || {};
  window.ADMIN.sources = {
    mount(el) {
      el.className = 'view admin';
      bind(el);
    },
    render,
  };
})();
