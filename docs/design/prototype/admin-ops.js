/* wechart prototype: Jobs v2, Schedules, Security (policies + security-context preview; users/groups are phase 2). */
(function () {
  const st = UI.status,
    esc = UI.esc,
    SV = UI.STATUS_SVG;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  /* ---------------- Jobs ---------------- */
  const J = {
    sel: 0,
    tab: 'preaggs',
    run: null,
    picked: new Set(),
    rows: [
      {
        id: 'order_lines.monthly_by_category',
        st: ['ok', 'Done'],
        last: 'Today 12:04',
        dur: 42,
        avg: 45,
        trig: 'every 1 hour',
        parts: ['1998', '1997', '1996'],
        src: 'default',
      },
      {
        id: 'orders.daily_by_shipper',
        st: ['run', 'Processing'],
        last: 'Today 11:00',
        dur: 18,
        avg: 30,
        trig: 'every 1 hour',
        parts: ['2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16'],
        src: 'default',
      },
      {
        id: 'customers.country_rollup',
        st: ['warn', 'Running late'],
        last: 'Today 09:12',
        dur: 96,
        avg: 40,
        trig: 'every 30 minute',
        parts: ['all'],
        src: 'default',
      },
      {
        id: 'products.catalog_rollup',
        st: ['err', 'Failure: relation "public.products_v2" does not exist'],
        last: 'Yesterday 23:10',
        dur: 0,
        avg: 12,
        trig: 'every 1 day',
        parts: ['all'],
        src: 'default',
      },
      {
        id: 'order_lines.recent_lambda',
        st: ['idle', 'Scheduled'],
        last: 'Today 12:00',
        dur: 0,
        avg: 6,
        trig: 'lambda (union with source)',
        parts: ['2026-09', '2026-08'],
        src: 'default',
      },
      {
        id: 'finance.gl_monthly',
        st: ['err', 'Suspended after 4 failures'],
        last: '3 days ago',
        dur: 0,
        avg: 210,
        trig: 'every 1 day',
        parts: ['2026-09', '2026-08', '2026-07'],
        src: 'finance_dw',
        suspended: true,
      },
      {
        id: 'finance.fx_daily',
        st: ['warn', 'Missing partition 2026-09'],
        last: 'Today 06:00',
        dur: 64,
        avg: 60,
        trig: 'every 1 day',
        parts: ['2026-09', '2026-08'],
        src: 'finance_dw',
        missing: '2026-09',
      },
    ],
  };
  const RUNS = Array.from({ length: 18 }, (_, i) => {
    const r = J.rows[i % J.rows.length];
    const fail = r.st[0] === 'err' && i % 3 === 0;
    return {
      at: `2026-09-19 ${String(12 - Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      id: r.id,
      part: r.parts[i % r.parts.length],
      st: fail ? ['err', 'failure'] : i === 1 ? ['run', 'processing'] : ['ok', 'done'],
      dur: fail ? 3 : Math.round(r.avg * (0.8 + (i % 5) / 10)),
      by: i % 4 === 0 ? 'manual' : i % 4 === 1 ? 'schedule: Rebuild hourly' : 'refresh worker',
      rows: fail ? 0 : 9000 + i * 311,
    };
  });

  function jobsRender(root) {
    const j = J.rows[J.sel],
      count = (k) => J.rows.filter((r) => r.st[0] === k).length;
    const tabs = `<div class="tabs" style="padding:0">${[
      ['preaggs', 'Pre-aggregations'],
      ['history', 'Run history'],
      ['queue', 'Queue'],
    ]
      .map(
        ([k, l]) =>
          `<button role="tab" data-jtab="${k}" aria-selected="${J.tab === k}">${l}</button>`,
      )
      .join('')}</div>`;
    let main = '';
    if (J.tab === 'preaggs')
      main = `<div class="card tscroll"><table class="grid-table comfy"><thead><tr><th>Pre-aggregation</th><th>Status</th><th>Last success</th><th>Duration vs avg</th><th>Trigger</th><th class="num">Partitions</th><th>Source</th></tr></thead><tbody>${J.rows.map((r, i) => `<tr class="${i === J.sel ? 'sel' : ''}" data-job="${i}" style="cursor:pointer"><td class="mono strong">${r.id}</td><td>${st(r.st[0], r.st[1].length > 34 ? r.st[1].slice(0, 32) + '…' : r.st[1])}</td><td>${r.last}</td><td>${r.dur ? `<span class="durbar" title="${r.dur}s vs ${r.avg}s average"><i style="width:${Math.min(100, (r.dur / (r.avg * 2)) * 100)}%;${r.dur > r.avg * 1.5 ? 'background:var(--warn-icon)' : ''}"></i><b style="left:50%"></b></span> <span class="xs tnum">${r.dur}s</span>` : '<span class="muted">–</span>'}</td><td class="xs">${r.trig}</td><td class="num tnum">${r.parts.length}</td><td class="mono xs">${r.src}</td></tr>`).join('')}</tbody></table></div>`;
    if (J.tab === 'history')
      main = `<div style="display:flex;gap:8px;flex-wrap:wrap"><select class="select sm" style="width:auto"><option>All statuses</option><option>Failures</option></select><select class="select sm" style="width:auto"><option>All triggers</option><option>Manual</option><option>Schedules</option><option>Refresh worker</option></select><select class="select sm" style="width:auto"><option>Last 24 hours</option><option>Last 7 days</option></select></div><div class="card tscroll"><table class="grid-table comfy"><thead><tr><th>Started</th><th>Pre-aggregation</th><th>Partition</th><th>Status</th><th class="num">Duration</th><th class="num">Rows</th><th>Triggered by</th><th></th></tr></thead><tbody>${RUNS.map((r, i) => `<tr><td class="tnum">${r.at}</td><td class="mono xs">${r.id}</td><td class="mono xs">${r.part}</td><td>${st(r.st[0], r.st[1])}</td><td class="num tnum">${r.dur}s</td><td class="num tnum">${r.rows.toLocaleString()}</td><td class="xs">${r.by}</td><td><button class="btn sm" data-log="${i}">Log</button></td></tr>`).join('')}</tbody></table></div>`;
    if (J.tab === 'queue')
      main = `<div class="card tscroll"><table class="grid-table comfy"><thead><tr><th>Queued</th><th>Pre-aggregation</th><th>Partition</th><th>State</th><th>Token</th><th></th></tr></thead><tbody><tr><td>12:31:02</td><td class="mono xs">orders.daily_by_shipper</td><td class="mono xs">2026-09-19</td><td>${st('run', 'processing')}</td><td class="mono xs">9f2c…a41e</td><td></td></tr><tr><td>12:31:02</td><td class="mono xs">orders.daily_by_shipper</td><td class="mono xs">2026-09-18</td><td>${st('idle', 'scheduled')}</td><td class="mono xs">1b7d…0c93</td><td><button class="btn sm" title="Uses Cube's system cancel route when available">Cancel</button></td></tr><tr><td>12:30:40</td><td class="mono xs">order_lines.recent_lambda</td><td class="mono xs">2026-09</td><td>${st('idle', 'scheduled')}</td><td class="mono xs">77aa…e012</td><td><button class="btn sm">Cancel</button></td></tr></tbody></table></div><p class="xs muted" style="margin:0">Tokens come from <code>POST /v1/pre-aggregations/jobs</code> (<code>action: post</code>) and are polled with <code>action: get</code>. Cube keeps job records for 24 hours.</p>`;
    const run = J.run != null ? RUNS[J.run] : null;
    root.innerHTML = `<div class="admin-main">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h1>Jobs</h1><span class="badge">${SV.run} ${count('run')} running</span><span class="badge">${SV.warn} ${count('warn')} need attention</span><span class="badge">${SV.err} ${count('err')} failed or suspended</span><span style="flex:1"></span><select class="select sm" style="width:auto"><option>All data sources</option><option>default</option><option>finance_dw</option></select><span class="badge ok">${SV.ok} Refresh worker running</span></div>
        ${tabs}${main}
        <p class="xs muted" style="margin:0">Statuses follow Cube's job API (<code>scheduled</code>, <code>processing</code>, <code>done</code>, <code>missing_partition</code>, <code>failure: …</code>). "Running late" and "Suspended" are computed by wechart from its own run history. Cube Core keeps no build history.</p>
      </div>
      <aside class="pane right" aria-label="${run ? 'Run log' : 'Job detail'}">${
        run
          ? `<div class="pane-head"><h2>Run log</h2><button class="btn sm" data-closelog style="margin-left:auto">Close</button></div><div class="pane-body"><div class="section">${st(run.st[0], run.st[1])}<div class="xs sec mono">${run.id} · ${run.part} · ${run.at}</div></div><pre class="mono" style="margin:0;padding:12px;white-space:pre-wrap">${esc(`${run.at}.012  job posted by ${run.by}\n${run.at}.051  token 9f2c…a41e scheduled (queue: default)\n${run.at}.410  processing: CREATE TABLE prod_pre_aggregations.${run.id.replace('.', '_')}_${run.part.replace(/-/g, '')} …\n${run.st[0] === 'err' ? `${run.at}.912  ERROR: relation "public.products_v2" does not exist\n${run.at}.913  failure recorded; consecutive failures: 4 → schedule suspended` : `${run.at}.930  loaded ${run.rows.toLocaleString()} rows into Cube Store (2 chunks)\n${run.at}.944  done in ${run.dur}s`}`)}</pre></div>`
          : `<div class="pane-head"><h2 class="mono" style="font-size:13px">${j.id}</h2></div><div class="pane-body">
          <div class="section">${st(j.st[0], j.st[1])}<div class="xs sec">Trigger: ${j.trig} · source <span class="mono">${j.src}</span></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">${j.suspended ? '<button class="btn primary sm" data-resume>Resume schedule</button>' : '<button class="btn primary sm" data-build>Build all</button>'}<button class="btn sm" data-buildsel ${J.picked.size ? '' : 'disabled style="opacity:.5"'}>Build selected (${J.picked.size})</button><button class="btn sm" data-goto="model">Open in Model</button></div></div>
          <div class="section"><h3>Partitions</h3><table class="grid-table"><thead><tr><th></th><th>Partition</th><th>Status</th><th class="num">Rows</th><th class="num">Size</th></tr></thead><tbody>${j.parts.map((p, i) => `<tr><td><input type="checkbox" data-pick="${p}" ${J.picked.has(p) ? 'checked' : ''} aria-label="Select partition ${p}"></td><td class="mono">${p}</td><td>${j.missing === p ? st('warn', 'missing') : j.st[0] === 'err' ? st('err', 'failed') : st('ok', 'built')}</td><td class="num tnum">${j.missing === p ? '–' : (12000 - i * 1800).toLocaleString()}</td><td class="num tnum">${j.missing === p ? '–' : `${14 - i * 2} MB`}</td></tr>`).join('')}</tbody></table></div>
          <div class="section"><h3>Build duration (last 20 runs)</h3><div id="jobhist" style="height:120px"></div></div></div>`
      }</aside>`;
    const el = root.querySelector('#jobhist');
    if (!el) return;
    const hist = Array.from({ length: 20 }, (_, i) =>
      Math.max(3, Math.round(j.avg * (0.7 + ((i * 37) % 11) / 18))),
    );
    (echarts.getInstanceByDom(el) || echarts.init(el)).setOption(
      {
        grid: { left: 4, right: 4, top: 8, bottom: 4, containLabel: true },
        xAxis: { type: 'category', show: false, data: hist.map((_, i) => i) },
        yAxis: {
          type: 'value',
          axisLabel: { color: css('--text-secondary'), fontSize: 12, formatter: '{value}s' },
          splitLine: { lineStyle: { color: css('--grid') } },
        },
        tooltip: { trigger: 'axis' },
        series: [
          {
            type: 'bar',
            data: hist.map((v, i) => ({
              value: v,
              itemStyle: {
                color: j.st[0] === 'err' && i > 15 ? css('--err-icon') : css('--s1'),
                borderRadius: [3, 3, 0, 0],
              },
            })),
            barMaxWidth: 10,
          },
        ],
      },
      true,
    );
  }
  function jobsBind(root) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-job], button');
      if (!t) return;
      const d = t.dataset,
        j = J.rows[J.sel];
      if (d.job) {
        J.sel = +d.job;
        J.picked.clear();
        J.run = null;
      } else if (d.jtab) {
        J.tab = d.jtab;
        J.run = null;
      } else if (d.log) J.run = +d.log;
      else if ('closelog' in d) J.run = null;
      else if ('resume' in d) {
        j.suspended = false;
        j.st = ['idle', 'Scheduled'];
      } else if ('build' in d || 'buildsel' in d) {
        j.st = ['idle', 'Scheduled'];
        jobsRender(root);
        setTimeout(() => {
          j.st = ['run', 'Processing'];
          jobsRender(root);
          setTimeout(() => {
            j.st = ['ok', 'Done'];
            j.missing = null;
            j.last = 'Just now';
            j.dur = Math.round(j.avg * 0.9);
            J.picked.clear();
            jobsRender(root);
          }, 1400);
        }, 700);
        return;
      } else if (d.goto) return window.APP.go(d.goto);
      else return;
      jobsRender(root);
    });
    root.addEventListener('change', (e) => {
      const p = e.target.dataset.pick;
      if (p) {
        e.target.checked ? J.picked.add(p) : J.picked.delete(p);
        jobsRender(root);
      }
    });
  }

  /* ---------------- Schedules ---------------- */
  const SC = { sel: 0, cron: null };
  const KIND = {
    build: ['Build', 'var(--s1)'],
    refresh: ['Refresh key', 'var(--s7)'],
    delivery: ['Delivery', 'var(--s2)'],
    warmup: ['Cache warm-up', 'var(--s3)'],
  };
  function nextRuns(cron, n = 5) {
    const out = [];
    const m = /^(\d+|\*) (\d+|\*) \* \* (\*|\d|\d-\d)$/.exec(cron || '');
    if (!m) {
      const ev = /every (\d+) (minute|hour)/.exec(cron || '');
      if (!ev) return ['(custom expression)'];
      let t = new Date(2026, 8, 19, 12, 30);
      for (let i = 0; i < n; i++) {
        t = new Date(t.getTime() + +ev[1] * (ev[2] === 'hour' ? 3600e3 : 60e3));
        out.push(t);
      }
      return out.map(fmtD);
    }
    const [, mi, hr, dw] = m;
    const ok = (d) =>
      dw === '*' ||
      (dw.includes('-') ? d.getDay() >= +dw[0] && d.getDay() <= +dw[2] : d.getDay() === +dw);
    let t = new Date(2026, 8, 19, 12, 31);
    while (out.length < n) {
      t = new Date(t.getTime() + 60e3);
      if ((mi === '*' || t.getMinutes() === +mi) && (hr === '*' || t.getHours() === +hr) && ok(t)) {
        out.push(new Date(t));
        if (mi === '*') t = new Date(t.getTime() + 59 * 60e3);
      }
    }
    return out.map(fmtD);
  }
  const fmtD = (d) =>
    d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  function schedRender(root) {
    const rows = WC.schedules,
      s = rows[SC.sel] || rows[0],
      cron = SC.cron ?? s.cron,
      cube = s.kind === 'refresh';
    root.innerHTML = `<div class="admin-main">
        <div style="display:flex;align-items:center;gap:8px"><h1>Schedules</h1><span style="flex:1"></span><button class="btn primary">+ Schedule</button></div>
        <div class="xs sec">Two schedulers are shown together. <b>Refresh keys</b> belong to Cube's refresh worker and are edited in the model. <b>Builds, deliveries and cache warm-ups</b> are run by wechart's scheduler.</div>
        <div class="card tscroll"><table class="grid-table comfy"><thead><tr><th>Name</th><th>Kind</th><th>When</th><th>Next run</th><th>Last run</th><th>Owner</th><th>On</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r === s ? 'sel' : ''}" data-sched="${i}" style="cursor:pointer"><td class="strong">${esc(r.name)}</td><td><span class="lvl"><i style="background:${KIND[r.kind][1]}"></i>${KIND[r.kind][0]}</span></td><td class="xs">${esc(r.human)}<br><span class="mono muted">${esc(r.cron)}</span></td><td class="xs tnum">${r.enabled ? nextRuns(r.cron, 1)[0] : '<span class="muted">paused</span>'}</td><td>${st(r.last[0], r.last[1])}</td><td class="xs">${esc(r.owner)}</td><td><button class="switch" role="switch" aria-checked="${r.enabled}" data-toggle="${i}" ${r.kind === 'refresh' ? 'disabled title="Edit refresh_key in the model"' : ''} aria-label="Enable ${esc(r.name)}"></button></td></tr>`).join('')}</tbody></table></div></div>
      <aside class="pane right" aria-label="Schedule detail"><div class="pane-head"><h2>${esc(s.name)}</h2></div><div class="pane-body">
        <div class="section"><span class="lvl strong"><i style="background:${KIND[s.kind][1]}"></i>${KIND[s.kind][0]}</span><div class="xs sec">Target: <span class="mono">${esc(s.target)}</span><br>Runs via: <span class="mono">${esc(s.via)}</span></div></div>
        <div class="section"><h3>When</h3>${
          cube
            ? `<div class="xs sec">Set by <code>refresh_key.every: ${esc(s.cron.replace('every ', ''))}</code> in the model.</div><button class="btn sm" data-goto="model">Edit in Model</button>`
            : `<div class="seg" role="group">${[
                ['0 * * * *', 'Hourly'],
                ['0 2 * * *', 'Daily'],
                ['0 8 * * 1', 'Weekly'],
                ['55 7 * * 1-5', 'Weekdays'],
              ]
                .map(
                  ([c, l]) => `<button data-cron="${c}" aria-pressed="${cron === c}">${l}</button>`,
                )
                .join(
                  '',
                )}</div><div class="field"><label for="cronx">Cron expression</label><input id="cronx" class="input sm mono" data-cronx value="${esc(cron)}"></div><div class="field"><label for="tz">Time zone</label><select id="tz" class="select sm"><option ${s.tz === 'UTC' ? 'selected' : ''}>UTC</option><option ${s.tz === 'America/Los_Angeles' ? 'selected' : ''}>America/Los_Angeles</option><option>Europe/Berlin</option></select></div>`
        }
          <div class="field"><span class="lbl">Next runs</span>${nextRuns(cron)
            .map((d) => `<div class="xs tnum">${d}</div>`)
            .join('')}</div></div>
        ${s.kind === 'build' ? '<div class="section"><h3>On failure</h3><div class="inline"><span>Retry</span><select class="select sm" style="width:auto"><option>2 times, 5 min apart</option><option>Never</option></select></div><div class="inline"><span>Suspend after</span><select class="select sm" style="width:auto"><option>4 consecutive failures</option><option>Never</option></select></div></div>' : ''}
        <div class="section"><div style="display:flex;gap:8px"><button class="btn primary sm" ${cube ? 'disabled style="opacity:.5"' : ''}>Save</button><button class="btn sm">Run now</button><button class="btn sm" data-goto="jobs">View runs</button></div></div></div></aside>`;
  }
  function schedBind(root) {
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-sched], button');
      if (!t) return;
      const d = t.dataset;
      if (d.sched) {
        SC.sel = +d.sched;
        SC.cron = null;
      } else if (d.toggle) {
        const r = WC.schedules[+d.toggle];
        r.enabled = !r.enabled;
      } else if (d.cron) SC.cron = d.cron;
      else if (d.goto) return window.APP.go(d.goto);
      else return;
      schedRender(root);
    });
    root.addEventListener('change', (e) => {
      if ('cronx' in e.target.dataset) {
        SC.cron = e.target.value.trim();
        schedRender(root);
      }
    });
  }

  /* ---------------- Security (phase 1: policies + security-context preview) ---------------- */
  const SEC = { ctx: '{\n  "groups": ["sales_eu"],\n  "region": "Europe"\n}', err: '' };
  const POLICIES = [
    { cube: 'customers', group: 'admins', members: 'all', rows: 'all rows' },
    { cube: 'customers', group: 'sales_eu', members: 'all', rows: "region = 'Europe'" },
    {
      cube: 'customers',
      group: 'sales_americas',
      members: 'all except company_name',
      rows: "region = 'Americas'",
    },
  ];
  function effective(ctx) {
    const g = ctx.groups || [];
    return ['orders', 'order_lines', 'customers', 'products', 'employees'].map((c) => {
      if (c !== 'customers') return { c, lv: 'open', text: 'No access_policy → open' };
      const hit = POLICIES.filter((p) => g.includes(p.group));
      if (!hit.length) return { c, lv: 'none', text: 'No policy matches → denied (WHERE 1 = 0)' };
      return {
        c,
        lv: hit.some((h) => h.rows === 'all rows') ? 'full' : 'rows',
        text: hit.map((h) => `${h.group}: members ${h.members}; rows ${h.rows}`).join(' · '),
      };
    });
  }
  const LV = {
    full: ['var(--ok-icon)', 'Full'],
    rows: ['var(--s1)', 'Rows filtered'],
    none: ['var(--err-icon)', 'No access'],
    open: ['var(--border-strong)', 'Open'],
  };
  function secRender(root) {
    let ctx = {};
    try {
      ctx = JSON.parse(SEC.ctx);
      SEC.err = '';
    } catch (e) {
      SEC.err = e.message;
    }
    const eff = effective(ctx);
    root.innerHTML = `<div class="admin-main">
        <div style="display:flex;align-items:center;gap:8px"><h1>Access policies</h1><span style="flex:1"></span><button class="btn" data-goto="model">Edit policies in Model</button></div>
        <div class="warnbar" style="background:var(--accent-soft);border:1px solid var(--border-subtle);border-radius:6px">${SV.idle}<span>Users and groups come in phase 2. In phase 1, policies are authored in the model, and you preview their effect by editing a security context here.</span></div>
        <div class="card tscroll"><table class="grid-table comfy"><thead><tr><th>Cube / view</th><th>Group</th><th>Members</th><th>Rows</th><th>Source</th></tr></thead><tbody>${POLICIES.map((p) => `<tr><td class="mono">${p.cube}</td><td class="mono">${p.group}</td><td>${p.members}</td><td>${p.rows}</td><td class="mono xs">model/cubes/${p.cube}.yml</td></tr>`).join('')}<tr><td class="mono">orders, order_lines, products, employees</td><td colspan="3" class="sec">No access_policy. Open to every security context.</td><td></td></tr></tbody></table></div>
      </div>
      <aside class="pane right" aria-label="Security context preview"><div class="pane-head"><h2>Preview a security context</h2></div><div class="pane-body">
        <div class="section"><div class="field"><label for="ctxj">Security context (JWT payload)</label><textarea id="ctxj" class="input" rows="6" data-ctx spellcheck="false">${esc(SEC.ctx)}</textarea>${SEC.err ? `<span class="xs" style="color:var(--err)">${esc(SEC.err)}</span>` : '<span class="xs muted">Cube maps <code>groups</code> to policies through <code>contextToGroups</code></span>'}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${[
          ['EU rep', '{"groups":["sales_eu"],"region":"Europe"}'],
          ['Americas rep', '{"groups":["sales_americas"],"region":"Americas"}'],
          ['Admin', '{"groups":["admins"]}'],
          ['No groups', '{}'],
        ]
          .map(([l, j]) => `<button class="btn sm" data-preset='${j}'>${l}</button>`)
          .join('')}</div></div>
        <div class="section"><h3>Effective access</h3>${eff.map((x) => `<div class="inline"><span class="mono">${x.c}</span><span class="lvl"><i style="background:${LV[x.lv][0]}"></i>${LV[x.lv][1]}</span></div><div class="xs muted" style="margin:-4px 0 4px">${esc(x.text)}</div>`).join('')}</div>
        <div class="section"><button class="btn primary sm" data-previewdash>Preview dashboard with this context</button><span class="xs muted">Uses the impersonated token against <code>/v1/meta</code>, <code>/v1/sql</code> and <code>/v1/load</code>.</span></div></div></aside>`;
  }
  function secBind(root) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.preset) {
        SEC.ctx = JSON.stringify(JSON.parse(d.preset), null, 2);
        secRender(root);
      } else if ('previewdash' in d) {
        let ctx = {};
        try {
          ctx = JSON.parse(SEC.ctx);
        } catch (err) {
          return;
        }
        window.APP.go('explore', {
          open: { kind: 'dashboard', id: 'd-northwind' },
          viewAs:
            ctx.region === 'Europe'
              ? 'region_eu'
              : ctx.region === 'Americas'
                ? 'region_americas'
                : '',
        });
      } else if (d.goto) window.APP.go(d.goto);
    });
    root.addEventListener('change', (e) => {
      if ('ctx' in e.target.dataset) {
        SEC.ctx = e.target.value;
        secRender(root);
      }
    });
  }

  window.ADMIN = window.ADMIN || {};
  Object.assign(window.ADMIN, {
    jobs: {
      mount(el) {
        el.className = 'view admin';
        jobsBind(el);
      },
      render: jobsRender,
    },
    schedules: {
      mount(el) {
        el.className = 'view admin';
        schedBind(el);
      },
      render: schedRender,
    },
    security: {
      mount(el) {
        el.className = 'view admin';
        secBind(el);
      },
      render: secRender,
    },
  });
})();
