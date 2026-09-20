/* wechart prototype: Explore v3 — folder browser for dashboards and charts; opens dashboards (WYSIWYG) and chart pages.
   Chart editing happens only in context: pencil on a chart (dashboard tile or chart page) or "New chart". */
(function () {
  const esc = UI.esc,
    SV = UI.STATUS_SVG,
    CAT = () => window.CATALOG;
  const S = {
    folder: 'sales',
    q: '',
    open: null,
    newMenu: false,
    renaming: null,
    viewAs: '',
    editNew: false,
  };
  let root,
    dashInst = null;

  const folderName = (id) => (CAT().folders.find((f) => f.id === id) || {}).name || '';
  const chain = (id) => {
    const out = [];
    let f = CAT().folders.find((x) => x.id === id);
    while (f) {
      out.unshift(f);
      f = CAT().folders.find((x) => x.id === f.parent);
    }
    return out;
  };
  const itemsIn = (fid) => [
    ...CAT().dashboards.filter((d) => d.folder === fid),
    ...CAT().charts.filter((c) => c.folder === fid),
  ];
  const count = (fid) =>
    itemsIn(fid).length +
    CAT()
      .folders.filter((f) => f.parent === fid)
      .reduce((n, f) => n + count(f.id), 0);
  const typeLabel = (c) => {
    const r = CHART_EDITOR.encode(c.spec);
    return r.type ? RECO.TYPES[r.type].label : 'Incomplete';
  };

  function tree() {
    const node = (f, depth) =>
      `<button class="file" data-folder="${f.id}" aria-current="${S.folder === f.id && !S.q}" style="padding-left:${12 + depth * 14}px;font-family:var(--font-ui)"><span class="itemicon ic-folder" style="width:18px;height:18px">${f.personal ? '◉' : '▣'}</span><span style="flex:1;text-align:left">${esc(f.name)}</span><span class="xs muted">${count(f.id)}</span></button>${CAT()
        .folders.filter((c) => c.parent === f.id)
        .map((c) => node(c, depth + 1))
        .join('')}`;
    return CAT()
      .folders.filter((f) => !f.parent)
      .map((f) => node(f, 0))
      .join('');
  }

  function browse() {
    const q = S.q.trim().toLowerCase();
    const subfolders = q ? [] : CAT().folders.filter((f) => f.parent === S.folder);
    const items = q
      ? [...CAT().dashboards, ...CAT().library()].filter((x) =>
          (x.name || x.spec.title).toLowerCase().includes(q),
        )
      : itemsIn(S.folder);
    const cur = CAT().folders.find((f) => f.id === S.folder);
    root.className = 'view browser active';
    root.innerHTML = `
      <aside class="pane left" aria-label="Folders"><div class="pane-head"><h2>Folders</h2><button class="btn ghost sm" data-newfolder style="margin-left:auto">+ Folder</button></div><div class="pane-body">${tree()}</div></aside>
      <section class="admin-main" aria-label="Folder contents">
        <div class="crumbs">${
          q
            ? `<span>Search results for "${esc(S.q)}"</span>`
            : chain(S.folder)
                .map(
                  (f, i, a) =>
                    `<button data-folder="${f.id}">${esc(f.name)}</button>${i < a.length - 1 ? '<span>/</span>' : ''}`,
                )
                .join('')
        }</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${S.renaming === S.folder && !q ? `<input class="input" data-renamefolder value="${esc(cur.name)}" style="font-size:20px;font-weight:600;max-width:320px;height:36px" aria-label="Folder name">` : `<h1>${q ? 'Search' : esc(cur.name)}</h1>${!q && cur.parent ? '<button class="btn ghost sm" data-rename>Rename</button>' : ''}`}
          <span style="flex:1"></span>
          <input class="input sm" data-search placeholder="Search dashboards and charts" value="${esc(S.q)}" style="max-width:260px" aria-label="Search dashboards and charts">
          <span style="position:relative"><button class="btn primary" data-newmenu aria-haspopup="menu" aria-expanded="${S.newMenu}">＋ New ▾</button>${S.newMenu ? `<div class="picker" role="menu" style="right:0;left:auto;width:220px"><button role="menuitem" data-new="dashboard"><span class="itemicon ic-dash">▦</span>Dashboard</button><button role="menuitem" data-new="chart"><span class="itemicon ic-chart">◢</span>Chart</button><button role="menuitem" data-newfolder><span class="itemicon ic-folder">▣</span>Folder</button></div>` : ''}</span>
        </div>
        <div class="card tscroll"><table class="grid-table comfy"><thead><tr><th style="width:40%">Name</th><th>Type</th><th>Built on</th><th>Updated</th><th>Owner</th></tr></thead><tbody>
          ${subfolders.map((f) => `<tr data-folder="${f.id}" tabindex="0" style="cursor:pointer"><td><span style="display:inline-flex;gap:8px;align-items:center"><span class="itemicon ic-folder">▣</span><span class="strong">${esc(f.name)}</span></span></td><td class="sec">Folder</td><td class="muted">${count(f.id)} items</td><td></td><td></td></tr>`).join('')}
          ${items
            .map((x) =>
              x.kind === 'dashboard'
                ? `<tr data-open="dashboard:${x.id}" tabindex="0" style="cursor:pointer"><td><span style="display:inline-flex;gap:8px;align-items:center"><span class="itemicon ic-dash">▦</span><span><span class="strong">${esc(x.name)}</span><br><span class="xs muted">${esc(x.description || '')}</span></span></span></td><td class="sec">Dashboard</td><td class="xs sec">${x.tabs.length} tab${x.tabs.length === 1 ? '' : 's'}${q ? ` · ${esc(folderName(x.folder))}` : ''}</td><td class="xs">${esc(x.updated)}</td><td class="xs">me</td></tr>`
                : `<tr data-open="chart:${x.id}" tabindex="0" style="cursor:pointer"><td><span style="display:inline-flex;gap:8px;align-items:center"><span class="itemicon ic-chart">◢</span><span class="strong">${esc(x.spec.title)}</span></span></td><td class="sec">${esc(typeLabel(x))}</td><td class="xs mono">${esc(CHART_EDITOR.SOURCES[x.spec.source].kind.toLowerCase())}: ${esc(CHART_EDITOR.SOURCES[x.spec.source].label)}</td><td class="xs">${esc(x.updated)}</td><td class="xs">me</td></tr>`,
            )
            .join('')}
          ${!subfolders.length && !items.length ? `<tr><td colspan="5" style="height:120px;text-align:center" class="sec">${q ? 'Nothing matches.' : 'This folder is empty. Use ＋ New to add a dashboard or chart.'}</td></tr>` : ''}
        </tbody></table></div>
        <p class="xs muted" style="margin:0">Charts are shared: a chart used on several dashboards is edited once, and every dashboard shows the change.</p>
      </section>`;
  }

  function chartPage(c) {
    root.className = 'view active';
    root.style.cssText = 'grid-template-rows:auto 1fr;height:100%;min-height:0';
    const res = CHART_EDITOR.encode(c.spec),
      used = CAT().usedIn(c.id);
    root.innerHTML = `
      <div class="dash-head" style="padding-bottom:12px;border-bottom:1px solid var(--border-subtle)">
        <nav class="xs" aria-label="Breadcrumb" style="width:100%;display:flex;gap:2px;align-items:center"><button class="btn ghost sm" data-back>← Explore</button><span class="muted"> / ${esc(folderName(c.folder))} /</span></nav>
        <h1 style="font-size:20px">${esc(c.spec.title)}</h1><span class="badge">${esc(res.type ? RECO.TYPES[res.type].label : 'Incomplete')}${c.spec.type === 'auto' ? ' · auto' : ''}</span><span style="flex:1"></span>
        <button class="btn primary" data-editchart title="Edit chart"><svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12H4v-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> Edit chart</button>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;min-height:0">
        <div style="padding:16px 24px;min-height:0;display:flex"><div class="tile" style="flex:1"><div class="chart" id="cp-chart" style="height:100%"></div></div></div>
        <aside class="pane right" aria-label="Chart details"><div class="pane-body">
          <div class="section"><h3>Built on</h3><div class="mono">${esc(CHART_EDITOR.SOURCES[c.spec.source].kind.toLowerCase())}: ${esc(CHART_EDITOR.SOURCES[c.spec.source].label)}</div></div>
          <div class="section"><h3>Metrics</h3>${c.spec.metrics.map((m) => `<span class="pill measure">${esc(WC.byId[m].title)}</span>`).join(' ') || '<span class="xs muted">None</span>'}</div>
          <div class="section"><h3>Dimensions</h3>${
            [
              c.spec.time && `${WC.byId[c.spec.time.id].title} · ${c.spec.time.granularity}`,
              ...c.spec.dimensions.map((d) => WC.byId[d].title),
            ]
              .filter(Boolean)
              .map((t) => `<span class="pill dim">${esc(t)}</span>`)
              .join(' ') || '<span class="xs muted">None</span>'
          }</div>
          <div class="section"><h3>Used in</h3>${
            used.length
              ? used
                  .map((n) => {
                    const d = CAT().dashboards.find((x) => x.name === n);
                    return `<button class="btn ghost sm" data-open="dashboard:${d.id}" style="justify-content:flex-start">▦ ${esc(n)}</button>`;
                  })
                  .join('')
              : '<span class="xs muted">Not on any dashboard yet</span>'
          }<button class="btn sm" data-addtodash>＋ Add to a dashboard…</button>${
            S.addPick
              ? `<div class="picker" role="menu" style="position:static;width:auto;margin-top:4px">${CAT()
                  .dashboards.map(
                    (d) => `<button role="menuitem" data-addto="${d.id}">▦ ${esc(d.name)}</button>`,
                  )
                  .join('')}</div>`
              : ''
          }</div>
          <div class="section"><h3>Updated</h3><span class="xs">${esc(c.updated)} by me</span></div>
        </div></aside>
      </div>`;
    const el = root.querySelector('#cp-chart');
    if (!res.type) {
      el.innerHTML = `<div class="sec" style="height:100%;display:grid;place-items:center">${esc(res.need || 'Incomplete chart')} · use Edit chart to finish it</div>`;
      return;
    }
    if (res.type === 'kpi') {
      const m = res.enc.measures[0];
      el.innerHTML = `<div style="height:100%;display:grid;place-items:center"><div class="kpi-val" style="font-size:40px;line-height:52px">${WC.fmt(WC.query({ dims: [], measures: [m] }).rows[0][m], WC.byId[m].fmt)}</div></div>`;
      return;
    }
    CH.render(
      el,
      res.enc,
      res.type,
      c.spec.options,
      (c.spec.filters || []).filter((f) => f.values && f.values.length),
    );
  }

  function editChart(c, spec, onApply) {
    const host = document.createElement('div');
    host.className = 'editor-overlay';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-label', 'Edit chart');
    document.body.appendChild(host);
    const close = () => {
      host.remove();
      render();
    };
    CHART_EDITOR.create(host, {
      spec: spec || c.spec,
      mode: 'overlay',
      backLabel: c ? '← Back to chart' : '← Back to Explore',
      note: c
        ? CAT().usedIn(c.id).length
          ? `Shared chart · on ${CAT().usedIn(c.id).length} dashboard(s) · edits change all of them`
          : 'Shared chart · not on a dashboard yet'
        : `New shared chart in ${folderName(S.folder)}`,
      noteWarn: !!c && CAT().usedIn(c.id).length > 1,
      onApply: (s) => {
        onApply(s);
        close();
      },
      onCancel: close,
    });
  }

  function render() {
    if (dashInst && (!S.open || S.open.kind !== 'dashboard')) {
      dashInst.destroy();
      dashInst = null;
    }
    root.style.cssText = '';
    if (!S.open) return browse();
    if (S.open.kind === 'chart') return chartPage(CAT().chartById(S.open.id));
    const d = CAT().dashById(S.open.id);
    if (dashInst) dashInst.destroy();
    root.innerHTML = '';
    root.className = 'view active';
    root.style.cssText = 'grid-template-rows:minmax(0,1fr);height:100%;min-height:0';
    const host = document.createElement('section');
    host.style.cssText = 'height:100%;min-height:0';
    root.appendChild(host);
    dashInst = DASHBOARD.create(host, d, {
      folderName: folderName(d.folder),
      viewAs: S.viewAs,
      edit: S.editNew,
      filters: S.carry,
      onBack: () => {
        S.open = null;
        S.folder = d.folder;
        S.editNew = false;
        render();
      },
      onOpenDashboard: (id, filters) => {
        S.open = { kind: 'dashboard', id };
        S.carry = filters;
        render();
      },
    });
    S.editNew = false;
    S.carry = null;
  }

  function bind() {
    root.addEventListener('click', (e) => {
      if (S.open && S.open.kind === 'dashboard') return; // dashboard handles its own events
      const t = e.target.closest('[data-folder], [data-open], button');
      if (!t) {
        if (S.newMenu) {
          S.newMenu = false;
          render();
        }
        return;
      }
      const d = t.dataset;
      if (d.folder) {
        S.folder = d.folder;
        S.q = '';
        S.newMenu = false;
        S.renaming = null;
        return render();
      }
      if (d.open) {
        const [kind, id] = d.open.split(':');
        S.open = { kind, id };
        S.addPick = false;
        return render();
      }
      if ('back' in d) {
        S.open = null;
        return render();
      }
      if ('newmenu' in d) {
        S.newMenu = !S.newMenu;
        return render();
      }
      if ('newfolder' in d) {
        const f = { id: CAT().id('f'), name: 'New folder', parent: S.folder || 'root' };
        CAT().folders.push(f);
        S.folder = f.id;
        S.renaming = f.id;
        S.newMenu = false;
        render();
        root.querySelector('[data-renamefolder]')?.select();
        return;
      }
      if ('rename' in d) {
        S.renaming = S.folder;
        render();
        root.querySelector('[data-renamefolder]')?.select();
        return;
      }
      if (d.new === 'dashboard') {
        const dash = {
          id: CAT().id('d-'),
          kind: 'dashboard',
          folder: S.folder,
          name: 'Untitled dashboard',
          updated: 'Just now',
          description: '',
          settings: CAT().settings('markings'),
          tabs: [{ id: CAT().id('t'), title: 'Page 1', items: [] }],
        };
        CAT().dashboards.push(dash);
        S.newMenu = false;
        S.open = { kind: 'dashboard', id: dash.id };
        S.editNew = true;
        return render();
      }
      if (d.new === 'chart') {
        S.newMenu = false;
        render();
        return editChart(null, CHART_EDITOR.newSpec({ title: 'Untitled chart' }), (s) => {
          const c = {
            id: CAT().id('c-'),
            kind: 'chart',
            folder: S.folder,
            updated: 'Just now',
            spec: s,
          };
          CAT().charts.push(c);
          S.open = { kind: 'chart', id: c.id };
        });
      }
      if ('editchart' in d) {
        const c = CAT().chartById(S.open.id);
        return editChart(c, null, (s) => {
          c.spec = s;
          c.updated = 'Just now';
        });
      }
      if ('addtodash' in d) {
        S.addPick = !S.addPick;
        return render();
      }
      if (d.addto) {
        const dash = CAT().dashById(d.addto),
          c = CAT().chartById(S.open.id);
        dash.tabs[0].items.push({
          id: CAT().id('i'),
          kind: 'chart',
          chart: c.id,
          w: c.spec.type === 'kpi' ? 3 : 6,
          h: c.spec.type === 'kpi' ? 13 : 40,
        });
        S.addPick = false;
        S.open = { kind: 'dashboard', id: dash.id };
        return render();
      }
    });
    root.addEventListener('input', (e) => {
      if ('search' in e.target.dataset) {
        S.q = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const s = root.querySelector('[data-search]');
        s.focus();
        s.setSelectionRange(pos, pos);
      }
    });
    root.addEventListener('change', (e) => {
      if ('renamefolder' in e.target.dataset) {
        CAT().folders.find((f) => f.id === S.renaming).name = e.target.value || 'Untitled folder';
        S.renaming = null;
        render();
      }
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('tr[data-open], tr[data-folder]')) e.target.click();
      if (e.key === 'Enter' && 'renamefolder' in (e.target.dataset || {})) e.target.blur();
    });
  }

  window.EXPLORE = {
    mount(el) {
      root = el;
      bind();
    },
    render() {
      render();
    },
    open(kind, id, opts = {}) {
      S.open = { kind, id };
      if (opts.viewAs != null) S.viewAs = opts.viewAs;
    },
  };
})();
