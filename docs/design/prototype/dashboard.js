/* wechart prototype: dashboard v4 — Grafana-13-style in-place editing (docs/design/references-dashboard-authoring.md):
   edit bar, docked sidebar (Add · Outline · Properties), faint 12-col grid, drag to move (incl. onto tab labels),
   edge/corner resize with live readout, keyboard move/resize, tabs+sections grammar, pencil → chart editor. */
(function () {
  const esc = UI.esc,
    SV = UI.STATUS_SVG,
    CAT = () => window.CATALOG;
  const ICON = {
    chart: '▦',
    markdown: 'M↓',
    header: 'H',
    divider: '—',
    section: '▤',
    tabs: '⊟',
    image: '◩',
    link: '↗',
  };
  const SIZED = ['chart', 'markdown', 'image', 'link'];
  const minH = (it) => (it.kind === 'link' ? 5 : 10);
  const safeUrl = (u) => /^https?:\/\/[^\s]+$/i.test(u || '');
  const REGION = { region_eu: 'Europe', region_americas: 'Americas' };
  const GEAR =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  const PENCIL =
    '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 2.5l2 2L6 12H4v-2z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 4l2 2" stroke="currentColor" stroke-width="1.5"/></svg>';

  function create(container, dash, props = {}) {
    const S0 = {
      tab: dash.tabs[0].id,
      edit: !!props.edit,
      sel: null,
      side: 'add',
      addTarget: null,
      libq: '',
      menu: null,
      confirm: null,
      date: '',
      category: '',
      cross: [],
      viewAs: props.viewAs || '',
      undo: [],
      redo: [],
      snapshot: null,
      drag: null,
      resize: null,
      pdrag: null,
      toast: null,
      panel: null,
      inter: {},
      live: '',
    };
    const S = Object.assign(S0, {
      date: props.filters?.date || '',
      category: props.filters?.category || '',
      marks: {},
      xf: [],
      drawer: null,
      chipMenu: null,
      kfocus: {},
    });
    dash.settings ||= CAT().settings('markings');
    dash.settings.inter ||= {};
    // Snapshots cover the layout, dashboard settings and every chart record, so undo/discard also revert chart edits, new local charts,
    // save-to-folder and settings-page changes.
    const snap = () =>
      JSON.stringify({
        tabs: dash.tabs,
        name: dash.name,
        description: dash.description,
        folder: dash.folder,
        settings: dash.settings,
        charts: CAT().charts,
      });
    const pushUndo = () => {
      S.undo.push(snap());
      S.redo = [];
      if (S.undo.length > 80) S.undo.shift();
    };
    const restore = (j) => {
      const o = JSON.parse(j);
      Object.assign(dash, {
        tabs: o.tabs,
        name: o.name,
        description: o.description,
        folder: o.folder,
        settings: o.settings,
      });
      CAT().charts.splice(0, CAT().charts.length, ...o.charts);
    };

    /* ---------- markings (Spotfire) vs cross-filtering: one per dashboard, chosen in Settings ---------- */
    const MODE = () => dash.settings.interaction;
    const mkDefs = () => dash.settings.markings;
    const mkDef = (id) => mkDefs().find((m) => m.id === id);
    const defaultMk = () => (mkDefs().find((m) => m.isDefault) || mkDefs()[0] || {}).id || null;
    /** A tile's marking: unset → the dashboard default; null → (None), the tile can't mark. */
    const markingOf = (it) => {
      const id = it.marking === undefined ? defaultMk() : it.marking;
      return id && mkDef(id) ? id : null;
    };
    const mstate = (id) => (S.marks[id] ||= { terms: [] });
    const mSwatch = (id, size = 8) =>
      `<i class="mk-swatch" style="--mk:var(--mk${(mkDef(id) || {}).slot || 1});width:${size}px;height:${size}px"></i>`;
    const isKpi = (it) =>
      it.kind === 'chart' && (CAT().chartById(it.chart) || {}).spec?.type === 'kpi';
    const chartTiles = () =>
      all()
        .filter((x) => x.it.kind === 'chart')
        .map((x) => x.it);
    const pageFilters = () => [...baseFilters(), ...S.xf.map((x) => x.filter)];
    /** Details tile: "Limit data using markings" → filters, or the nothing-marked behaviour when every limiting marking is empty. */
    function limitFor(it) {
      const l = it.limit;
      if (!l || !l.ids || !l.ids.length) return { filters: [] };
      const fs = MARKINGS.limitFilters(l.ids.filter(mkDef).map(mstate), l.combine);
      return fs ? { filters: fs } : { empty: l.empty || 'message', message: l.message };
    }
    const masters = (it) =>
      chartTiles()
        .filter((t) => t.id !== it.id && (it.limit?.ids || []).includes(markingOf(t)))
        .map(title);
    const isLocal = (c) => c && c.owner === dash.id;
    const newLocal = (spec) => {
      const c = {
        id: CAT().id('c-'),
        kind: 'chart',
        folder: null,
        owner: dash.id,
        updated: 'Just now',
        spec: JSON.parse(JSON.stringify(spec)),
      };
      CAT().charts.push(c);
      return c;
    };
    const folderName = (fid) => CAT().folders.find((f) => f.id === fid)?.name || fid;

    /* ---------- tree ---------- */
    const walk = (items, fn, parent) =>
      items.forEach((it, i) => {
        fn(it, items, i, parent);
        if (it.items) walk(it.items, fn, it);
        if (it.tabs) it.tabs.forEach((t) => walk(t.items, fn, t));
      });
    const all = () => {
      const out = [];
      dash.tabs.forEach((t) =>
        walk(t.items, (it, arr, i, parent) => out.push({ it, arr, i, parent, page: t }), t),
      );
      return out;
    };
    const findItem = (id) => all().find((x) => x.it.id === id);
    const containerArr = (key) => {
      const [kind, a, b] = key.split(':');
      if (kind === 'tab') return dash.tabs.find((t) => t.id === a).items;
      const f = findItem(a);
      if (!f) return null;
      return kind === 'sec' ? f.it.items : f.it.tabs.find((t) => t.id === b).items;
    };
    const keyOfArr = (arr) => {
      const p = dash.tabs.find((t) => t.items === arr);
      if (p) return `tab:${p.id}`;
      const f = all().find(
        (x) => x.it.items === arr || (x.it.tabs && x.it.tabs.some((t) => t.items === arr)),
      );
      if (!f) return null;
      if (f.it.items === arr) return `sec:${f.it.id}`;
      const t = f.it.tabs.find((x) => x.items === arr);
      return `tabs:${f.it.id}:${t.id}`;
    };
    const topTab = () => dash.tabs.find((t) => t.id === S.tab) || dash.tabs[0];
    const title = (it) =>
      it.kind === 'chart'
        ? CAT().chartById(it.chart)?.spec.title || 'Chart'
        : it.kind === 'image'
          ? it.alt || 'Image'
          : it.kind === 'link'
            ? it.label || 'Link'
            : it.title ||
              (it.text || '')
                .split('\n')[0]
                .replace(/^#+\s*/, '')
                .slice(0, 32) ||
              it.kind;
    const contains = (outer, arr) =>
      outer.items === arr ||
      (outer.tabs && outer.tabs.some((t) => t.items === arr)) ||
      (outer.items || []).some((c) => contains(c, arr)) ||
      (outer.tabs || []).some((t) => t.items.some((c) => contains(c, arr)));
    /* Grammar (Grafana): a tab group lives only inside a section. */
    const canHold = (key, item) =>
      !(item.kind === 'tabs' && !key.startsWith('sec:')) &&
      !(item.kind === 'section' && key.startsWith('sec:'));

    /* ---------- data ---------- */
    function baseFilters() {
      const f = [];
      if (S.date) f.push({ id: 'orders.order_date', granularity: 'year', values: [S.date] });
      if (S.category) f.push({ id: 'products.category', values: [S.category] });
      if (S.viewAs) f.push({ id: 'customers.region', values: [REGION[S.viewAs]] });
      return f;
    }
    const pairAction = (from, to) =>
      dash.settings.inter[`${from}>${to}`] || dash.settings.crossDefault || 'filter';
    const filtersFor = (id) => [
      ...baseFilters(),
      ...S.cross
        .filter((c) => c.from !== id && pairAction(c.from, id) === 'filter')
        .map((c) => ({ id: c.dim, values: [c.value] })),
    ];
    const rsum = (m, f) => WC.query({ dims: [], measures: [m], filters: f }).rows[0]?.[m];
    const mkByName = (n) => mkDefs().find((m) => m.name.toLowerCase() === n.trim().toLowerCase());
    /** Markdown: {{measure:id}}, {{measure:id | marking:Name}} (limited by a marking; nothing marked → all data, as Spotfire's calculated values),
        {{marking:Name.summary}} and {{marking:Name.count}}. Raw HTML is never rendered. */
    const md = (text, live) =>
      esc(text || '')
        .replace(/\{\{measure:([\w.]+)(?:\s*\|\s*marking:([^}]+?))?\}\}/g, (tok, m, mn) => {
          if (!live || !WC.byId[m]) return `<span class="token">${tok}</span>`;
          const mk = mn && mkByName(mn);
          const pred = mk && MODE() === 'markings' ? MARKINGS.predicate(S.marks[mk.id]) : null;
          return `<strong class="tnum">${WC.fmt(rsum(m, pred ? [...pageFilters(), pred] : MODE() === 'markings' ? pageFilters() : baseFilters()), WC.byId[m].fmt)}</strong>`;
        })
        .replace(/\{\{marking:([^}.]+)\.(summary|count)\}\}/g, (tok, mn, what) => {
          const mk = mkByName(mn);
          if (!live || !mk || MODE() !== 'markings') return `<span class="token">${tok}</span>`;
          const st = S.marks[mk.id];
          return `<span class="mbadge" style="height:auto">${mSwatch(mk.id)}${esc(what === 'count' ? String(MARKINGS.count(st)) : MARKINGS.summary(st))}</span>`;
        })
        .split('\n')
        .map((l) =>
          l.startsWith('## ')
            ? `<h2>${l.slice(3)}</h2>`
            : l.trim()
              ? `<p style="margin:0">${l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`
              : '',
        )
        .join('');

    /* ---------- tile rendering ---------- */
    const actions = (it) =>
      `<span class="tile-actions">${it.kind === 'chart' ? `<button class="iconbtn" data-editchart="${it.id}" title="Edit chart (E)" aria-label="Edit chart ${esc(title(it))}">${PENCIL}</button>` : ''}<span style="position:relative"><button class="iconbtn" data-tmenu="${it.id}" aria-haspopup="menu" aria-label="More actions for ${esc(title(it))}">⋯</button>${S.menu === it.id ? tileMenu(it) : ''}</span></span>`;
    /** Spotfire's "Marked rows" menu, adapted: Filter to/out become ordinary removable filters; Details-on-demand is a drawer. */
    function markedRowsMenu(it) {
      if (MODE() !== 'markings' || it.kind !== 'chart' || isKpi(it)) return '';
      const mk = markingOf(it),
        n = mk ? MARKINGS.count(S.marks[mk]) : 0,
        dis = n ? '' : 'disabled';
      const head = `<div class="xs muted" style="padding:6px 6px 2px">${mk ? `${mSwatch(mk)} ${esc(mkDef(mk).name)} · ${n} marked` : 'Marking: (None)'}</div>`;
      if (!mk)
        return `${head}<button role="menuitem" data-mkdetails="${it.id}">Create details tile</button><div style="border-top:1px solid var(--border-subtle);margin:4px 0"></div>`;
      return `${head}<button role="menuitem" data-mkop="to:${it.id}" ${dis}>Filter to marked <span class="xs muted">Ctrl+M</span></button><button role="menuitem" data-mkop="out:${it.id}" ${dis}>Filter out marked <span class="xs muted">Ctrl+Shift+M</span></button><button role="menuitem" data-mkop="rows:${it.id}" ${dis}>View marked rows</button><button role="menuitem" data-mkop="copy:${it.id}" ${dis}>Copy marked values</button><button role="menuitem" data-mkop="invert:${it.id}">Invert marking</button><button role="menuitem" data-mkop="all:${it.id}">Mark all</button><button role="menuitem" data-mkop="clear:${it.id}" ${dis}>Unmark</button><button role="menuitem" data-mkdetails="${it.id}">Create details tile</button><div style="border-top:1px solid var(--border-subtle);margin:4px 0"></div>`;
    }
    function tileMenu(it) {
      if (!S.edit)
        return `<div class="picker" role="menu" style="right:0;left:auto;width:250px">${markedRowsMenu(it)}<button role="menuitem">View full screen</button><button role="menuitem">View as table</button><button role="menuitem">View query (Cube JSON + SQL)</button><button role="menuitem">Download CSV</button>${it.kind === 'chart' ? `<button role="menuitem" data-editchart="${it.id}">Edit chart</button>` : ''}</div>`;
      const pages = dash.tabs.map((t) => [`tab:${t.id}`, `Page tab: ${t.title}`]);
      const secs = all()
        .filter((x) => x.it.kind === 'section')
        .map((x) => [`sec:${x.it.id}`, `Section: ${x.it.title}`]);
      const inner = all()
        .filter((x) => x.it.kind === 'tabs')
        .flatMap((x) => x.it.tabs.map((t) => [`tabs:${x.it.id}:${t.id}`, `Tab: ${t.title}`]));
      const here = keyOfArr(findItem(it.id).arr);
      const targets = [...pages, ...inner, ...secs].filter(
        ([k]) =>
          k !== here && canHold(k, it) && !((it.items || it.tabs) && contains(it, containerArr(k))),
      );
      const c = it.kind === 'chart' && CAT().chartById(it.chart);
      const own = c
        ? isLocal(c)
          ? `<button role="menuitem" data-publish="${it.id}">Save to folders…</button>`
          : `<button role="menuitem" data-detach="${it.id}">Make a local copy</button>`
        : '';
      return `<div class="picker" role="menu" style="right:0;left:auto;width:250px"><button role="menuitem" data-dup="${it.id}">Duplicate</button>${own}${c && MODE() === 'markings' && !isKpi(it) ? `<button role="menuitem" data-mkdetails="${it.id}">Create details tile</button>` : ''}<div class="xs muted" style="padding:6px 6px 2px">Move to</div>${targets.map(([k, l]) => `<button role="menuitem" data-moveto="${it.id}|${k}">${esc(l)}</button>`).join('')}<div style="border-top:1px solid var(--border-subtle);margin:4px 0"></div><button role="menuitem" data-del="${it.id}" style="color:var(--err)">Delete</button></div>`;
    }
    const handles = (it) =>
      S.edit && SIZED.includes(it.kind)
        ? `<span class="rz rz-e" data-rz="e:${it.id}" aria-hidden="true"></span><span class="rz rz-s" data-rz="s:${it.id}" aria-hidden="true"></span><span class="rz rz-se" data-rz="se:${it.id}" aria-hidden="true"></span>`
        : '';
    const grip = (it) =>
      S.edit
        ? `<span class="grip" data-drag="${it.id}" title="Drag to move" aria-hidden="true">⠿</span>`
        : '';
    const cls = (it, base) =>
      `${base}${S.edit ? ' editing' : ''}${S.sel === it.id ? ' selected' : ''}`;
    const focusAttrs = (it) =>
      S.edit
        ? `tabindex="0" role="group" aria-label="${esc(it.kind)}: ${esc(title(it))}. Arrows move, Shift+Arrows resize, E edits, Delete removes."`
        : '';

    function itemHtml(it) {
      const full = ['section', 'tabs', 'header', 'divider'].includes(it.kind);
      const span = `grid-column: span ${full ? 12 : it.w};`;
      if (it.kind === 'chart') {
        const c = CAT().chartById(it.chart);
        const kpi = c && c.spec.type === 'kpi';
        const cf = MODE() === 'crossfilter';
        const crossing = cf && S.cross.some((x) => x.from === it.id),
          filtered = cf && S.cross.some((x) => x.from !== it.id);
        const mk = !cf && !kpi ? markingOf(it) : null,
          n = mk ? MARKINGS.count(S.marks[mk]) : 0;
        const lim =
          !cf && it.limit && it.limit.ids.length
            ? it.limit.ids.filter(mkDef).map((id) => mkDef(id).name)
            : [];
        // Marking state is never colour alone: the badge names the marking and counts its items (research rule 15).
        const mkBadge = n
          ? `<span class="mbadge" title="${esc(mkDef(mk).name)}: ${esc(MARKINGS.summary(S.marks[mk]))}">${mSwatch(mk)}${n} marked</span>`
          : '';
        const limBadge = lim.length
          ? `<span class="mbadge" title="Limited by ${esc(lim.join(it.limit.combine === 'or' ? ' or ' : ' and '))}">Details · ${esc(lim.join(it.limit.combine === 'or' ? ' | ' : ' & '))}</span>`
          : '';
        const kb =
          !S.edit && mk
            ? `tabindex="0" aria-label="${esc(title(it))}. Arrow keys move between items, Space marks, Ctrl+Space toggles, Escape unmarks."`
            : '';
        return `<div class="${cls(it, `tile dtile${kpi ? ' kpi' : ''}${crossing ? ' crossing' : ''}${filtered ? ' filtered' : ''}${kb ? ' kbd-marking' : ''}`)}" style="${span} height:${it.h * 8}px" data-item="${it.id}" ${focusAttrs(it)} ${kb}><div class="tile-head" ${S.edit ? `data-drag="${it.id}"` : ''}>${grip(it)}<h3>${esc(c ? c.spec.title : 'Missing chart')}</h3>${S.edit && c && !isLocal(c) ? `<span class="badge" role="img" aria-label="Shared chart" title="Shared chart from ${esc(folderName(c.folder))} · used on ${CAT().usedIn(c.id).length} dashboard(s). Edits change every dashboard that uses it." style="padding:0 6px">⛓</span>` : ''}${limBadge}${mkBadge}<span class="fdot" title="Cross-filtered"></span>${kpi || n || lim.length ? '' : `<span class="badge ok" title="Served from a pre-aggregation · cache age 3m">${SV.ok} 3m</span>`}${actions(it)}</div><div class="chart" data-chartbody="${it.id}" ${kpi ? 'style="min-height:0"' : 'style="position:relative"'}></div>${handles(it)}</div>`;
      }
      if (it.kind === 'markdown')
        return `<div class="${cls(it, 'tile dtile')}" style="${span}${it.h ? ` height:${it.h * 8}px` : ''}" data-item="${it.id}" ${focusAttrs(it)}>${S.edit ? `<div class="tile-head" data-drag="${it.id}" style="margin-bottom:0">${grip(it)}<span class="xs muted" style="flex:1">Markdown</span>${actions(it)}</div>` : ''}<div class="md">${md(it.text, !S.edit)}</div>${handles(it)}</div>`;
      if (it.kind === 'image') {
        const head = S.edit
          ? `<div class="tile-head" data-drag="${it.id}" style="margin-bottom:4px">${grip(it)}<span class="xs muted" style="flex:1">Image</span>${it.src && !it.alt ? `<span class="status warn">${SV.warn} Alt text missing</span>` : ''}${actions(it)}</div>`
          : '';
        const body = it.src
          ? `<img src="${esc(it.src)}" alt="${esc(it.alt || '')}" style="width:100%;height:100%;min-height:0;object-fit:${it.fit === 'cover' ? 'cover' : 'contain'};border-radius:4px">`
          : `<div class="sec xs" style="flex:1;display:grid;place-items:center;border:1px dashed var(--border-strong);border-radius:4px;text-align:center">${S.edit ? 'No image yet.<br>Upload one in Properties.' : ''}</div>`;
        return `<div class="${cls(it, 'tile dtile')}" style="${span} height:${it.h * 8}px;${S.edit ? '' : 'padding:0;background:none;border-color:transparent'}" data-item="${it.id}" ${focusAttrs(it)}>${head}<div style="flex:1;min-height:0;display:flex">${body}</div>${handles(it)}</div>`;
      }
      if (it.kind === 'link') {
        const t = it.target || {},
          dest = t.type === 'dashboard' ? CAT().dashById(t.id) : null,
          okUrl = t.type === 'url' && safeUrl(t.href);
        const hint =
          t.type === 'dashboard'
            ? dest
              ? `Opens "${dest.name}"${it.passFilters ? ' with the current filters' : ''}`
              : 'Choose a dashboard'
            : okUrl
              ? `Opens ${t.href} in a new tab`
              : 'Enter an http(s) URL';
        const ctl =
          it.style === 'link'
            ? `class="linklike"`
            : `class="btn ${it.style === 'primary' ? 'primary' : ''}"`;
        const inner =
          t.type === 'url' && okUrl && !S.edit
            ? `<a ${ctl} href="${esc(t.href)}" target="_blank" rel="noopener noreferrer">${esc(it.label)} ↗</a>`
            : `<button ${ctl} ${S.edit ? 'tabindex="-1"' : `data-follow="${it.id}"`} title="${esc(hint)}">${esc(it.label)}${t.type === 'url' ? ' ↗' : ' →'}</button>`;
        return `<div class="${cls(it, 'dplain dlink')}" style="${span} height:${it.h * 8}px" data-item="${it.id}" ${focusAttrs(it)} ${S.edit ? `data-drag="${it.id}"` : ''}>${grip(it)}${inner}${S.edit ? `<span style="flex:1"></span>${(t.type === 'dashboard' && !dest) || (t.type === 'url' && !okUrl) ? `<span class="status warn" title="${esc(hint)}">${SV.warn}</span>` : ''}${actions(it)}` : ''}${handles(it)}</div>`;
      }
      if (it.kind === 'header')
        return `<div class="${cls(it, 'dplain')}" style="${span}" data-item="${it.id}" ${focusAttrs(it)} ${S.edit ? `data-drag="${it.id}"` : ''}>${grip(it)}<h2 style="margin:0;font-size:${it.size === 'lg' ? 24 : it.size === 'sm' ? 16 : 20}px;line-height:1.3;font-weight:600;flex:1">${esc(it.text)}</h2>${S.edit ? actions(it) : ''}</div>`;
      if (it.kind === 'divider')
        return `<div class="${cls(it, 'dplain')}" style="${span}" data-item="${it.id}" ${focusAttrs(it)} ${S.edit ? `data-drag="${it.id}"` : ''}>${grip(it)}<hr style="flex:1;border:0;border-top:1px solid var(--border-strong);margin:8px 0">${S.edit ? actions(it) : ''}</div>`;
      if (it.kind === 'section') {
        const hide = it.hideHeader && !S.edit;
        return `<div class="${cls(it, 'dsection')}${hide ? ' bare' : ''}" style="${span}" data-item="${it.id}" ${focusAttrs(it)}>${hide ? '' : `<div class="dsection-head" ${S.edit ? `data-drag="${it.id}"` : ''}>${grip(it)}${it.hideHeader ? '' : `<button class="iconbtn" data-collapse="${it.id}" aria-expanded="${!it.collapsed}" aria-label="${it.collapsed ? 'Expand' : 'Collapse'} section" style="width:24px;height:24px">${it.collapsed ? '▸' : '▾'}</button>`}<h2 style="${it.hideHeader ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(it.title)}</h2><span class="xs muted">${it.items.length} item${it.items.length === 1 ? '' : 's'}${it.hideHeader ? ' · header hidden in view mode' : ''}</span><span style="flex:1"></span>${S.edit ? actions(it) : ''}</div>`}${it.collapsed && !it.hideHeader ? '' : gridHtml(it.items, `sec:${it.id}`)}${S.confirm === it.id ? `<div class="warnbar" role="alertdialog" style="border-radius:6px;margin-top:8px">${SV.warn}<span style="flex:1">Delete "${esc(it.title)}"?</span><button class="btn sm" data-delsec="${it.id}" style="color:var(--err)">Delete section and its ${it.items.length} item${it.items.length === 1 ? '' : 's'}</button><button class="btn sm" data-ungroup="${it.id}">Ungroup (keep items)</button><button class="btn ghost sm" data-noconfirm>Cancel</button></div>` : ''}</div>`;
      }
      if (it.kind === 'tabs') {
        const act = it.tabs.find((t) => t.id === it.active) || it.tabs[0];
        return `<div class="${cls(it, 'dsection')}" style="${span}" data-item="${it.id}" ${focusAttrs(it)}><div class="dsection-head" ${S.edit ? `data-drag="${it.id}"` : ''}>${grip(it)}<div class="dash-tabs" role="tablist" style="padding:0;border:0;flex:1">${it.tabs.map((t) => `<button role="tab" data-intab="${it.id}:${t.id}" data-droptab="tabs:${it.id}:${t.id}" aria-selected="${t.id === act.id}">${esc(t.title)}</button>`).join('')}${S.edit ? `<button class="btn ghost sm" data-addintab="${it.id}" style="align-self:center">+ Tab</button>` : ''}</div>${S.edit ? actions(it) : ''}</div>${gridHtml(act.items, `tabs:${it.id}:${act.id}`)}</div>`;
      }
      return '';
    }
    const gridHtml = (items, key, top) =>
      `<div class="dgrid dcontainer${top && S.edit ? ' gridlines' : ''}" data-container="${key}">${items.map(itemHtml).join('')}${S.edit ? `<button class="dadd" data-addat="${key}" style="grid-column: span ${items.length ? 3 : 12}">＋ Add${items.length ? '' : key.startsWith('tab:') ? ' a chart, section or text' : ' to this ' + (key.startsWith('sec:') ? 'section' : 'tab')}</button>` : items.length ? '' : '<div class="sec" style="grid-column:1/-1;padding:24px;text-align:center">Nothing here yet. Edit the dashboard to add charts.</div>'}</div>`;

    /* ---------- sidebar ---------- */
    const PALETTE = [
      ['chart', '▦', 'Chart', 'New chart, only on this dashboard'],
      ['library', '⛓', 'Chart from folders', 'Reuse a shared chart'],
      ['section', ICON.section, 'Section', 'A titled, collapsible group'],
      ['tabs', ICON.tabs, 'Tabs', 'A tab group inside a section'],
      ['markdown', ICON.markdown, 'Markdown', 'Text with live values'],
      ['header', ICON.header, 'Header', 'A heading'],
      ['divider', ICON.divider, 'Divider', 'A horizontal rule'],
      ['image', ICON.image, 'Image', 'A logo or picture'],
      ['link', ICON.link, 'Link / button', 'Go to a dashboard or URL'],
      ['filter', '⏷', 'Filter', 'Adds to the filter bar'],
    ];
    const TEMPLATES = [
      ['kpis', 'KPI row', 'Four empty KPI tiles, 3 columns each'],
      ['two', 'Two charts', 'Two empty charts side by side, 6 + 6'],
      ['notes', 'Chart with notes', 'Empty chart 8 + markdown 4'],
    ];
    function sideAdd() {
      const areaName = (key) => {
        const [kind, a, b] = key.split(':');
        if (kind === 'tab') return `page tab "${dash.tabs.find((t) => t.id === a).title}"`;
        const it = findItem(a).it;
        return kind === 'sec'
          ? `section "${it.title}"`
          : `tab "${it.tabs.find((t) => t.id === b).title}"`;
      };
      const tgt = S.addTarget
        ? `the end of ${areaName(S.addTarget)}`
        : S.sel && findItem(S.sel)
          ? `after "${title(findItem(S.sel).it)}"`
          : `the end of page tab "${topTab().title}"`;
      const lib = CAT()
        .library()
        .filter((c) => !S.libq || c.spec.title.toLowerCase().includes(S.libq.toLowerCase()));
      return `<div class="section"><div class="xs sec">Click to insert at ${esc(tgt)}, or drag onto the canvas.</div>${PALETTE.map(([k, i, l, d]) => `<button class="el" draggable="true" data-palette="${k}" style="width:100%;border:1px solid var(--border-subtle);border-radius:6px;background:var(--bg-surface);text-align:left;height:auto;padding:6px 8px;display:flex;gap:10px;align-items:center;cursor:grab"><span class="ficon dim" style="width:24px;height:24px">${i}</span><span style="display:grid"><span class="strong">${l}</span><span class="xs muted">${d}</span></span></button>`).join('')}</div>
        ${S.side === 'library' ? `<div class="section"><h3>Shared charts in folders</h3><div class="xs sec">These stay linked: editing one changes it on every dashboard that uses it. To change one only here, add it and choose "Make a local copy".</div><input class="input sm" data-libq placeholder="Search charts" value="${esc(S.libq)}" aria-label="Search shared charts">${lib.map((c) => `<button class="file" data-addlib="${c.id}" style="font-family:var(--font-ui);height:auto;padding-block:4px"><span class="itemicon ic-chart" style="width:18px;height:18px">◢</span><span style="display:grid;text-align:left"><span>${esc(c.spec.title)}</span><span class="xs muted">${esc(folderName(c.folder))} · on ${CAT().usedIn(c.id).length} dashboard(s)</span></span></button>`).join('') || '<div class="xs muted">No shared charts match.</div>'}</div>` : ''}
        <div class="section"><h3>Section templates</h3>${TEMPLATES.map(([k, l, d]) => `<button class="el" data-template="${k}" style="width:100%;border:1px dashed var(--border-strong);border-radius:6px;background:none;text-align:left;height:auto;padding:6px 8px;display:grid"><span class="strong">${l}</span><span class="xs muted">${d}</span></button>`).join('')}</div>`;
    }
    function outline() {
      const row = (it, depth) =>
        `<button class="file" data-select="${it.id}" aria-current="${S.sel === it.id}" style="padding-left:${12 + depth * 14}px;font-family:var(--font-ui)"><span class="ficon dim" style="width:18px;height:18px;font-size:10px">${ICON[it.kind]}</span>${esc(title(it))}</button>${it.items ? it.items.map((c) => row(c, depth + 1)).join('') : ''}${it.tabs ? it.tabs.map((t) => `<div class="xs muted" style="padding-left:${26 + depth * 14}px">⊟ ${esc(t.title)}</div>${t.items.map((c) => row(c, depth + 2)).join('')}`).join('') : ''}`;
      return `<div class="section" style="padding:8px 0">${dash.tabs.map((t) => `<div class="dir">▭ ${esc(t.title)}</div>${t.items.map((it) => row(it, 1)).join('') || '<div class="xs muted" style="padding-left:26px">Empty</div>'}`).join('')}</div>`;
    }
    /** Tile Properties › Marking — Spotfire's Properties > Data labels, "visualization" read as "tile". */
    function markingProps(it) {
      if (MODE() !== 'markings')
        return `<div class="section"><h3>Interactions</h3><p class="xs sec" style="margin:0">This dashboard uses cross-filtering. What a click here does to each other tile is set in <button class="linklike xs" data-settings="crossfilter">Dashboard settings › Cross-filtering</button>.</p></div>`;
      const own = markingOf(it),
        l = it.limit || { ids: [], combine: 'and', empty: 'message', message: '' };
      const kpi = isKpi(it);
      return `<div class="section"><h3>Marking</h3>
        ${
          kpi
            ? '<div class="xs sec">KPI tiles can\'t mark. They show the marked share of the default marking.</div>'
            : `<div class="field"><label for="pmk">Marking</label><select id="pmk" class="select sm" data-pmk="${it.id}"><option value="" ${own === null ? 'selected' : ''}>(None) — this tile can't be marked</option>${mkDefs()
                .map(
                  (m) =>
                    `<option value="${m.id}" ${own === m.id ? 'selected' : ''}>${esc(m.name)}${m.isDefault ? ' (default)' : ''}</option>`,
                )
                .join('')}</select></div>
        <div class="inline"><span>Use separate color for marked items</span><button class="switch" role="switch" aria-checked="${!!it.separate}" data-psep="${it.id}" ${own ? '' : 'disabled'}></button></div>`
        }
        <div class="field"><span class="lbl">Limit data using markings</span>${mkDefs()
          .map((m) => {
            const self = m.id === own && !kpi;
            return `<label class="inline" style="justify-content:flex-start;gap:6px;${self ? 'opacity:.55' : ''}" title="${self ? "A tile can't be limited by the marking it marks with" : ''}"><input type="checkbox" data-plim="${it.id}:${m.id}" ${l.ids.includes(m.id) ? 'checked' : ''} ${self ? 'disabled' : ''}>${mSwatch(m.id, 10)} ${esc(m.name)}${self ? ' <span class="xs muted">(marks with it)</span>' : ''}</label>`;
          })
          .join('')}</div>
        ${
          l.ids.length
            ? `<div class="field"><span class="lbl">Rows must be included in</span><div class="seg" role="group" aria-label="Rows must be included in">${[
                ['and', 'All markings (AND)'],
                ['or', 'Any marking (OR)'],
              ]
                .map(
                  ([k, t]) =>
                    `<button data-pcomb="${it.id}:${k}" aria-pressed="${(l.combine || 'and') === k}">${t}</button>`,
                )
                .join('')}</div></div>
        <div class="field"><label for="pempty">If no items are marked in the master tiles, show</label><select id="pempty" class="select sm" data-pempty="${it.id}">${[
          ['all', 'All data'],
          ['empty', 'Empty visualization'],
          ['message', 'Message on empty background'],
        ]
          .map(
            ([k, t]) =>
              `<option value="${k}" ${(l.empty || 'message') === k ? 'selected' : ''}>${t}</option>`,
          )
          .join(
            '',
          )}</select>${(l.empty || 'message') === 'message' ? `<textarea class="input" rows="2" data-pmsg="${it.id}" style="font-family:var(--font-ui)" aria-label="Message">${esc(l.message || '')}</textarea><div class="xs muted">Say where to mark: ${esc(masters(it).join(', ') || 'no tile marks with these markings yet')}.</div>` : ''}</div>`
            : ''
        }
        <button class="linklike xs" data-settings="markings" style="justify-self:start">Manage markings…</button></div>`;
    }
    function properties() {
      const f = S.sel && findItem(S.sel),
        it = f && f.it;
      if (!it)
        return `<div class="section"><h3>Dashboard</h3><div class="field"><label for="dn">Name</label><input id="dn" class="input sm" data-dname value="${esc(dash.name)}"></div><div class="field"><label for="dd">Description</label><textarea id="dd" class="input" rows="2" data-ddesc style="font-family:var(--font-ui)">${esc(dash.description || '')}</textarea></div><div class="field"><span class="lbl">Page tabs</span>${dash.tabs.map((t, i) => `<div class="inline"><input class="input sm" data-tabname="${t.id}" value="${esc(t.title)}" aria-label="Page tab ${i + 1} name">${dash.tabs.length > 1 ? `<button class="btn ghost sm" data-deltab="${t.id}" aria-label="Delete page tab">✕</button>` : ''}</div>`).join('')}<button class="btn sm" data-addtoptab>+ Page tab</button></div></div>`;
      const layout = SIZED.includes(it.kind)
        ? `<details class="section" style="display:block"><summary class="strong xs sec">LAYOUT</summary><div class="xs sec" style="margin-top:6px">${it.w} / 12 columns · ${(it.h || 0) * 8 || 'auto'}${it.h ? ' px' : ''} tall. Resize by dragging the tile's edges, or focus the tile and press Shift+Arrow keys.</div></details>`
        : '';
      if (it.kind === 'chart') {
        const c = CAT().chartById(it.chart);
        const enc = CHART_EDITOR.encode(c.spec);
        const n = CAT().usedIn(c.id).length;
        const own = isLocal(c)
          ? `<div class="field"><span class="lbl">Ownership</span><div class="xs sec">Only on this dashboard. Editing it changes nothing else.</div>${
              S.publish === it.id
                ? `<div class="inline"><select class="select sm" data-pubfolder aria-label="Folder">${CAT()
                    .folders.map(
                      (fo) =>
                        `<option value="${fo.id}" ${fo.id === dash.folder ? 'selected' : ''}>${esc(fo.name)}</option>`,
                    )
                    .join(
                      '',
                    )}</select><button class="btn primary sm" data-dopublish="${it.id}">Save</button><button class="btn ghost sm" data-nopublish>Cancel</button></div><div class="xs muted">It becomes a shared chart: other dashboards can reuse it, and later edits change it everywhere it is used.</div>`
                : `<button class="btn sm" data-publish="${it.id}">Save to folders…</button>`
            }</div>`
          : `<div class="field"><span class="lbl">Ownership</span>${n > 1 ? `<div class="status warn">${SV.warn} Shared · ${esc(folderName(c.folder))} · on ${n} dashboards</div>` : `<div class="strong xs">⛓ Shared · ${esc(folderName(c.folder))} · only this dashboard so far</div>`}<div class="xs sec">Edits change it in its folder and on every dashboard that uses it.</div><button class="btn sm" data-detach="${it.id}">Make a local copy</button></div>`;
        return `<div class="section"><h3>Chart</h3><div class="strong">${esc(c.spec.title)}</div><div class="xs sec">${enc.type ? RECO.TYPES[enc.type].label : 'Incomplete'} · <span class="mono">${esc(c.spec.source)}</span></div><button class="btn primary sm" data-editchart="${it.id}">${PENCIL} Edit chart</button>${own}</div>${markingProps(it)}${layout}`;
      }
      if (it.kind === 'image')
        return `<div class="section"><h3>Image</h3><label class="btn sm" style="justify-self:start;cursor:pointer">${it.src ? 'Replace image…' : 'Upload image…'}<input type="file" data-imgfile="${it.id}" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" class="sr-only"></label><div class="xs muted">PNG, JPEG, WebP, GIF or SVG, up to 2 MB. Stored with the dashboard.</div>${S.imgErr ? `<div class="status err">${SV.err} ${esc(S.imgErr)}</div>` : ''}<div class="field"><label for="ialt">Alt text</label><input id="ialt" class="input sm" data-imgalt="${it.id}" value="${esc(it.alt || '')}" placeholder="Describe the image" aria-describedby="ialth"><div id="ialth" class="xs ${it.src && !it.alt ? 'status warn' : 'muted'}">${it.src && !it.alt ? `${SV.warn} Required: screen readers announce this text.` : 'Screen readers announce this text.'}</div></div><div class="field"><span class="lbl">Fit</span><div class="seg" role="group" aria-label="Fit">${[
          ['contain', 'Fit inside'],
          ['cover', 'Fill and crop'],
        ]
          .map(
            ([k, l]) =>
              `<button data-imgfit="${it.id}:${k}" aria-pressed="${(it.fit || 'contain') === k}">${l}</button>`,
          )
          .join(
            '',
          )}</div></div>${it.src ? `<button class="btn ghost sm" data-imgclear="${it.id}" style="justify-self:start">Remove image</button>` : ''}</div>${layout}`;
      if (it.kind === 'link') {
        const t = it.target || { type: 'dashboard' };
        return `<div class="section"><h3>Link / button</h3><div class="field"><label for="llab">Label</label><input id="llab" class="input sm" data-linklabel="${it.id}" value="${esc(it.label)}"></div><div class="field"><span class="lbl">Style</span><div class="seg" role="group" aria-label="Style">${[
          ['button', 'Button'],
          ['primary', 'Primary'],
          ['link', 'Text link'],
        ]
          .map(
            ([k, l]) =>
              `<button data-linkstyle="${it.id}:${k}" aria-pressed="${(it.style || 'button') === k}">${l}</button>`,
          )
          .join(
            '',
          )}</div></div><div class="field"><span class="lbl">Goes to</span><div class="seg" role="group" aria-label="Destination type">${[
          ['dashboard', 'Dashboard'],
          ['url', 'URL'],
        ]
          .map(
            ([k, l]) =>
              `<button data-linktype="${it.id}:${k}" aria-pressed="${t.type === k}">${l}</button>`,
          )
          .join('')}</div></div>
          ${
            t.type === 'url'
              ? `<div class="field"><label for="lurl">URL</label><input id="lurl" class="input sm mono" data-linkurl="${it.id}" value="${esc(t.href || '')}" placeholder="https://…">${t.href && !safeUrl(t.href) ? `<div class="status err">${SV.err} Only http:// and https:// URLs are allowed.</div>` : '<div class="xs muted">Opens in a new tab.</div>'}</div>`
              : `<div class="field"><label for="ldash">Dashboard</label><select id="ldash" class="select sm" data-linkdash="${it.id}"><option value="">Choose…</option>${CAT()
                  .dashboards.filter((d) => d.id !== dash.id)
                  .map(
                    (d) =>
                      `<option value="${d.id}" ${t.id === d.id ? 'selected' : ''}>${esc(d.name)} (${esc(folderName(d.folder))})</option>`,
                  )
                  .join(
                    '',
                  )}</select></div><div class="inline"><span>Pass the current filters</span><button class="switch" role="switch" aria-checked="${!!it.passFilters}" data-linkpass="${it.id}"></button></div><div class="xs muted">Carries Order year and Category to the other dashboard when it has the same filters.</div>`
          }</div>${layout}`;
      }
      if (it.kind === 'markdown')
        return `<div class="section"><h3>Markdown</h3><textarea class="input" rows="8" data-mdtext="${it.id}">${esc(it.text)}</textarea><div class="xs muted">Live values such as <code>{{measure:order_lines.revenue}}</code>. Raw HTML is not rendered.</div></div>${layout}`;
      if (it.kind === 'header')
        return `<div class="section"><h3>Header</h3><input class="input sm" data-hdrtext="${it.id}" value="${esc(it.text)}" aria-label="Header text"><div class="seg" role="group" aria-label="Size">${[
          ['sm', 'Small'],
          ['md', 'Medium'],
          ['lg', 'Large'],
        ]
          .map(
            ([k, l]) =>
              `<button data-hdrsize="${it.id}:${k}" aria-pressed="${(it.size || 'md') === k}">${l}</button>`,
          )
          .join('')}</div></div>`;
      if (it.kind === 'section')
        return `<div class="section"><h3>Section</h3><input class="input sm" data-sectitle="${it.id}" value="${esc(it.title)}" aria-label="Section title"><div class="inline"><span>Collapsed by default</span><button class="switch" role="switch" aria-checked="${!!it.collapsed}" data-collapse="${it.id}" ${it.hideHeader ? 'disabled' : ''}></button></div><div class="inline"><span>Hide header in view mode</span><button class="switch" role="switch" aria-checked="${!!it.hideHeader}" data-hidehdr="${it.id}"></button></div><div class="xs muted">A hidden header also turns off collapsing.</div><button class="btn sm" data-ungroup="${it.id}">Ungroup (keep items)</button></div>`;
      if (it.kind === 'tabs')
        return `<div class="section"><h3>Tab group</h3>${it.tabs.map((t) => `<div class="inline"><input class="input sm" data-intabname="${it.id}:${t.id}" value="${esc(t.title)}" aria-label="Tab name">${it.tabs.length > 1 ? `<button class="btn ghost sm" data-delintab="${it.id}:${t.id}" aria-label="Delete tab">✕</button>` : ''}</div>`).join('')}<button class="btn sm" data-addintab="${it.id}">+ Tab</button></div>`;
      return `<div class="section"><h3>${it.kind}</h3><p class="xs muted" style="margin:0">No settings.</p></div>`;
    }
    const sidebar = () =>
      `<aside class="pane right" aria-label="Edit sidebar"><div class="tabs" role="tablist">${[
        ['add', 'Add'],
        ['outline', 'Outline'],
        ['props', 'Properties'],
      ]
        .map(
          ([k, l]) =>
            `<button role="tab" data-side="${k}" aria-selected="${S.side === k || (k === 'add' && S.side === 'library')}">${l}</button>`,
        )
        .join(
          '',
        )}</div><div class="pane-body">${S.side === 'outline' ? outline() : S.side === 'props' ? properties() : sideAdd()}</div></aside>`;

    /* ---------- page ---------- */
    function render() {
      const tab = topTab();
      const keep = [...container.querySelectorAll('.dash-scroll, .pane.right .pane-body')].map(
        (el) => el.scrollTop,
      );
      container.innerHTML = `
        <div class="viewas ${S.viewAs ? 'on' : ''}" role="status">Previewing with security context region = ${esc(REGION[S.viewAs] || '')}. Row-level policy on customers applies.<span style="flex:1"></span><button class="btn sm" data-viewas="">Exit preview</button></div>
        <div class="dash-head">
          <nav class="xs" aria-label="Breadcrumb"><button class="btn ghost sm" data-back>← Explore</button><span class="muted"> / ${esc(props.folderName || '')} /</span></nav>
          ${S.edit ? `<h1 style="font-size:20px"><span class="muted" style="font-weight:400">Editing</span> ${esc(dash.name)}</h1>` : `<h1>${esc(dash.name)}</h1><span class="badge">Published</span>`}
          <span style="flex:1"></span>
          ${
            S.edit
              ? `<button class="iconbtn" data-undo aria-label="Undo" title="Undo (⌘Z)" ${S.undo.length ? '' : 'disabled style="opacity:.4"'}>↶</button><button class="iconbtn" data-redo aria-label="Redo" title="Redo (⇧⌘Z)" ${S.redo.length ? '' : 'disabled style="opacity:.4"'}>↷</button><button class="btn" data-discard>Discard${S.undo.length ? ` (${S.undo.length} change${S.undo.length === 1 ? '' : 's'})` : ''}</button><button class="btn primary" data-save title="Save (⌘S)">Save</button>`
              : `<select class="select sm" style="width:auto" data-viewas-sel aria-label="Preview with security context"><option value="">Preview as: me</option><option value="region_eu" ${S.viewAs === 'region_eu' ? 'selected' : ''}>region = Europe</option><option value="region_americas" ${S.viewAs === 'region_americas' ? 'selected' : ''}>region = Americas</option></select>${MODE() === 'markings' ? '<button class="btn" data-panel="markings">Markings</button>' : ''}<button class="btn" data-panel="schedule">Schedule</button><button class="btn primary" data-edit>${PENCIL} Edit</button>`
          }
          <button class="iconbtn" data-settings title="Dashboard settings" aria-label="Dashboard settings">${GEAR}</button>
        </div>
        <div class="dash-tabs" role="tablist">${dash.tabs.map((t) => `<button role="tab" data-dtab="${t.id}" data-droptab="tab:${t.id}" aria-selected="${t.id === tab.id}">${esc(t.title)}</button>`).join('')}${S.edit ? '<button class="btn ghost sm" data-addtoptab style="align-self:center;margin-left:8px">+ Page tab</button>' : ''}</div>
        ${filterbar()}
        <div style="display:grid;grid-template-columns:${S.edit ? 'minmax(0,1fr) 300px' : 'minmax(0,1fr)'};min-height:0;overflow:hidden">
          <div class="dash-scroll">${gridHtml(tab.items, `tab:${tab.id}`, true)}</div>
          ${S.edit ? sidebar() : ''}
        </div>
        ${S.drawer ? drawerHtml() : ''}
        ${S.panel ? `<div class="palette on" role="dialog" aria-label="${S.panel}" style="width:${S.panel === 'markings' ? 420 : 320}px"><div class="pane-head"><h2>${S.panel === 'markings' ? 'Markings' : 'Schedule delivery'}</h2><button class="btn sm" data-closepanel style="margin-left:auto">Close</button></div><div class="pane-body" style="padding:12px">${S.panel === 'markings' ? markingsPanel() : '<p class="xs sec">Weekly on Monday 08:00 · PDF · to me. <button class="btn sm primary" data-saveschedule>Save schedule</button></p>'}</div></div>` : ''}
        <div class="dmarker" hidden></div><div class="readout" hidden></div><div class="sr-only" aria-live="polite">${esc(S.live)}</div>
        ${S.toast ? `<div class="proto-note" role="status" style="left:auto;right:16px;display:flex;gap:8px;align-items:center">${SV.ok} ${esc(S.toast.text)}${S.toast.undo ? '<button class="btn sm" data-toastundo>Undo</button>' : ''}</div>` : ''}`;
      container.className = `view dash active${dash.settings.width === 'full' ? ' fullwidth' : ''}`;
      container.style.gridTemplateRows = `${S.viewAs ? 'auto ' : ''}auto auto auto 1fr${S.drawer ? ' auto' : ''}`;
      container.querySelectorAll('.dash-scroll, .pane.right .pane-body').forEach((el, i) => {
        if (keep[i]) el.scrollTop = keep[i];
      });
      container
        .querySelectorAll('[data-chartbody]')
        .forEach((el) => renderChart(el, findItem(el.dataset.chartbody).it));
      if (S.focus) {
        container.querySelector(`[data-item="${S.focus}"]`)?.focus();
        S.focus = null;
      }
      if (S.toast && !S.toast.timer)
        S.toast.timer = setTimeout(() => {
          S.toast = null;
          container.querySelector('.proto-note[role=status]')?.remove();
        }, 5000);
    }
    /** Filter bar: dashboard filters (plus any "Filter to/out marked" filters) on the left; marking chips or cross-filter chips on the right. */
    function filterbar() {
      const sel = `<span class="fw"><span class="scope">Dashboard</span><select data-f="date" aria-label="Order year"><option value="">Order year: all</option>${['1996', '1997', '1998'].map((y) => `<option ${S.date === y ? 'selected' : ''}>${y}</option>`).join('')}</select></span><span class="fw"><span class="scope">Dashboard</span><select data-f="category" aria-label="Category"><option value="">Category: all</option>${WC.CATEGORIES.map((c) => `<option ${S.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></span>`;
      const xf = S.xf
        .map(
          (x, i) =>
            `<span class="fchip"><span class="scope">Dashboard</span>${esc(x.label)}<button data-unxf="${i}" aria-label="Remove filter ${esc(x.label)}">×</button></span>`,
        )
        .join('');
      let right;
      if (MODE() === 'crossfilter')
        right = S.cross.length
          ? `${S.cross.map((c, i) => `<span class="chip">${esc(WC.byId[c.dim].title)} = ${esc(c.value)}<button data-uncross="${i}" aria-label="Clear">×</button></span>`).join('')}<button class="btn ghost sm" data-clearcross>Clear (Esc)</button>`
          : `<span class="xs muted">${S.edit ? 'Cross-filtering is off while editing' : 'Click a bar, slice or panel to cross-filter'}</span>`;
      else {
        const live = mkDefs().filter((m) => MARKINGS.count(S.marks[m.id]));
        right = live.length
          ? live
              .map((m) => {
                const st = S.marks[m.id],
                  src = st.src && findItem(st.src);
                return `<span class="mchip" style="--mk:var(--mk${m.slot})">${mSwatch(m.id, 10)}<span class="mname">${esc(m.name)}</span><span class="msum" title="${esc(MARKINGS.summary(st, 20))}">${esc(MARKINGS.summary(st))}</span>${src ? `<span class="xs muted" style="white-space:nowrap">from ${esc(title(src.it))}</span>` : ''}<button data-chipmenu="${m.id}" aria-haspopup="menu" aria-expanded="${S.chipMenu === m.id}" aria-label="Actions for ${esc(m.name)}"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button><button data-mkclear="${m.id}" aria-label="Unmark ${esc(m.name)}">×</button>${S.chipMenu === m.id ? `<div class="picker" role="menu" style="right:0;left:auto;top:26px;width:220px"><button role="menuitem" data-mkop="to:${m.id}:chip">Filter to marked</button><button role="menuitem" data-mkop="out:${m.id}:chip">Filter out marked</button><button role="menuitem" data-mkop="rows:${m.id}:chip">View marked rows</button><button role="menuitem" data-mkop="link:${m.id}:chip">Copy link with marks</button><button role="menuitem" data-mkclear="${m.id}">Unmark</button></div>` : ''}</span>`;
              })
              .join('')
          : `<span class="xs muted">${S.edit ? 'Marking is off while editing' : 'Click, drag or Alt+drag to mark · Ctrl/⌘ adds or toggles · Esc unmarks'}</span>`;
      }
      return `<div class="filterbar">${sel}${xf}<span style="flex:1"></span>${right}</div>`;
    }
    /** Spotfire's Details-on-Demand, adapted: the rows behind the marked items (a Cube ungrouped query, capped). */
    function drawerHtml() {
      const mk = S.drawer.mk,
        pred = MARKINGS.predicate(S.marks[mk]);
      const res = pred ? WC.underlying([...pageFilters(), pred], 200) : { total: 0, rows: [] };
      const cols = [
        'order_id',
        'order_date',
        'customer',
        'product',
        'category',
        'quantity',
        'revenue',
      ];
      return `<section class="ddrawer" aria-label="Marked rows"><div class="pane-head">${mSwatch(mk, 10)}<h2 style="font-size:14px;margin:0">Marked rows · ${esc(mkDef(mk).name)}</h2><span class="xs sec">${res.total.toLocaleString('en-US')} rows${res.total > 200 ? ' · showing 200' : ''} · ${esc(MARKINGS.summary(S.marks[mk], 4))}</span><span style="flex:1"></span><button class="btn sm" data-exportrows>Export CSV</button><button class="btn ghost sm" data-closedrawer>Close</button></div><div class="tscroll"><table class="grid-table"><thead><tr>${cols.map((c) => `<th class="${['quantity', 'revenue'].includes(c) ? 'num' : ''}">${c.replace('_', ' ')}</th>`).join('')}</tr></thead><tbody>${res.rows.map((r) => `<tr>${cols.map((c) => `<td class="${['quantity', 'revenue'].includes(c) ? 'num' : ''}">${c === 'revenue' ? WC.fmt(r[c], 'currency', 'full') : esc(String(r[c]))}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="7" class="muted">Nothing marked.</td></tr>'}</tbody></table></div></section>`;
    }
    /** View › Markings (Spotfire 12.5+): every marking, its items, which tiles use or are limited by it, jump to a tile. */
    function markingsPanel() {
      return (
        mkDefs()
          .map((m) => {
            const st = S.marks[m.id],
              users = chartTiles().filter((t) => !isKpi(t) && markingOf(t) === m.id),
              lims = chartTiles().filter((t) => (t.limit?.ids || []).includes(m.id));
            return `<div class="section" style="padding:8px 0;border-bottom:1px solid var(--border-subtle)"><div class="inline" style="justify-content:flex-start;gap:8px">${mSwatch(m.id, 14)}<span class="strong">${esc(m.name)}</span>${m.isDefault ? '<span class="badge">default</span>' : ''}<span style="flex:1"></span>${MARKINGS.count(st) ? `<button class="btn sm" data-mkclear="${m.id}">Unmark</button>` : ''}</div><div class="xs sec">${MARKINGS.count(st) ? esc(MARKINGS.summary(st, 6)) : 'Nothing marked'}</div><div class="xs muted">Used by ${users.length} tile${users.length === 1 ? '' : 's'} · limits ${lims.length}</div>${[...users, ...lims].map((t) => `<button class="file" data-jump="${t.id}" style="font-family:var(--font-ui);height:26px">${(t.limit?.ids || []).includes(m.id) ? 'Details · ' : ''}${esc(title(t))}</button>`).join('')}</div>`;
          })
          .join('') +
        '<button class="btn sm" data-settings="markings" style="margin-top:8px">Manage markings…</button>'
      );
    }

    function renderChart(el, it) {
      const c = CAT().chartById(it.chart);
      if (!c) return;
      const res = CHART_EDITOR.encode(c.spec);
      if (!res.type) {
        el.innerHTML = `<div class="sec xs" style="height:100%;display:grid;place-items:center;text-align:center">${esc(res.need || 'Chart is incomplete')}<br>Use ✎ to finish it</div>`;
        return;
      }
      if (MODE() === 'markings') return renderMarked(el, it, c, res);
      const f = filtersFor(it.id);
      if (res.type === 'kpi') {
        const m = res.enc.measures[0];
        el.innerHTML = `<div class="kpi-val">${WC.fmt(rsum(m, f), WC.byId[m].fmt)}</div><div class="xs muted">1997: ${WC.fmt(rsum(m, [...f.filter((x) => x.id !== 'orders.order_date'), { id: 'orders.order_date', granularity: 'year', values: ['1997'] }]), WC.byId[m].fmt)}</div>`;
        return;
      }
      const hl = S.cross.find((x) => x.from !== it.id && pairAction(x.from, it.id) === 'highlight');
      CH.render(
        el,
        res.enc,
        res.type,
        { ...c.spec.options, highlight: hl ? { dim: hl.dim, value: hl.value } : null },
        f,
      );
      const inst = echarts.getInstanceByDom(el);
      if (inst) {
        CH.onItemClick(inst, (p) => {
          if (S.edit) {
            S.sel = it.id;
            S.side = 'props';
            return render();
          }
          const e = res.enc;
          const dim = e.facet || e.series || (res.type === 'heatmap' ? null : e.x);
          const value = e.facet || e.series ? p.seriesName : p.name;
          if (!dim || !value || /^Other/.test(value)) return;
          S.cross = [...S.cross.filter((x) => x.from !== it.id), { dim, value, from: it.id }];
          render();
        });
      }
    }

    /** Markings mode: brush the tile's marking (marked share full, rest faded), apply "Limit data using markings", and the nothing-marked state. */
    function renderMarked(el, it, c, res) {
      const kpi = res.type === 'kpi';
      const mk = kpi ? defaultMk() : markingOf(it);
      const pred = mk ? MARKINGS.predicate(S.marks[mk]) : null;
      const lim = limitFor(it);
      let f = pageFilters();
      if (lim.empty === 'message') {
        el.innerHTML = `<div class="mk-empty"><div><div class="strong">Nothing marked</div><div class="xs" style="margin-top:4px">${esc(lim.message || `Mark items in ${masters(it).join(' or ') || 'a master tile'} to see details.`)}</div></div></div>`;
        return;
      }
      if (lim.empty === 'empty')
        f = [...f, { or: [[{ id: '__none', value: '__none' }]] }]; // scales only
      else f = [...f, ...lim.filters];
      if (kpi) {
        const m = res.enc.measures[0],
          all = rsum(m, f),
          marked = pred ? rsum(m, [...f, pred]) : null;
        el.innerHTML = `<div class="kpi-val">${WC.fmt(all, WC.byId[m].fmt)}</div><div class="xs muted">${marked != null ? `<span class="mbadge" style="height:18px">${mSwatch(mk)}Marked ${WC.fmt(marked, WC.byId[m].fmt)}${WC.additive(m) && all ? ` · ${Math.round((marked / all) * 100)}%` : ''}</span>` : `1997: ${WC.fmt(rsum(m, [...f, { id: 'orders.order_date', granularity: 'year', values: ['1997'] }]), WC.byId[m].fmt)}`}</div>`;
        return;
      }
      const out = CH.render(
        el,
        res.enc,
        res.type,
        {
          ...c.spec.options,
          onMark: S.edit || !mk ? null : (tuples, mods, how) => mark(it, mk, tuples, mods, how),
          mark: pred
            ? { filter: pred, color: MARKINGS.color(mkDef(mk).slot), separate: !!it.separate }
            : null,
        },
        f,
      );
      // Marked items can be hidden by filters; say so instead of looking like nothing is marked (research rule 21).
      if (lim.filters.length && out && !out.rows.length && !lim.empty)
        el.insertAdjacentHTML(
          'beforeend',
          '<div class="mk-empty" style="position:absolute;inset:0">Marked items are hidden by the current filters.</div>',
        );
      const inst = echarts.getInstanceByDom(el);
      if (S.edit && inst)
        CH.onItemClick(inst, () => {
          S.sel = it.id;
          S.side = 'props';
          render();
        });
    }
    /** One marking gesture. Click replaces; Ctrl/⌘+click toggles; Ctrl/⌘+drag is ToggleOrAdd; empty-area click unmarks (Spotfire). */
    function mark(it, mk, tuples, mods, how) {
      const st = mstate(mk);
      let op = 'replace';
      if (how === 'clear') {
        if (!st.terms.length) return;
        op = 'clear';
      } else if (mods.ctrl)
        op = how === 'rect' || how === 'lasso' ? 'toggleOrAdd' : how === 'range' ? 'add' : 'toggle';
      MARKINGS.apply(st, tuples, it.id, op);
      S.live = `${mkDef(mk).name}: ${MARKINGS.count(st)} item${MARKINGS.count(st) === 1 ? '' : 's'} marked${op === 'clear' ? '' : ` from ${title(it)}`}. ${MARKINGS.count(st) ? MARKINGS.summary(st) : ''}`;
      S.chipMenu = null;
      render();
    }
    /** Marked rows › Filter to/out: an ordinary, removable dashboard filter built from the predicate; the marking is then cleared. */
    function markedOp(op, mk, it) {
      const st = mstate(mk),
        pred = MARKINGS.predicate(st),
        name = mkDef(mk).name;
      if (op === 'to' || op === 'out') {
        if (!pred) return;
        S.xf.push({
          label: `${op === 'to' ? '' : 'Not '}${MARKINGS.summary(st)}`,
          filter: { ...pred, exclude: op === 'out' },
        });
        st.terms = [];
        S.toast = {
          text: `${op === 'to' ? 'Filtered to' : 'Filtered out'} the items marked in ${name}`,
        };
      }
      if (op === 'rows') S.drawer = { mk };
      if (op === 'clear') {
        st.terms = [];
        S.live = `${name} unmarked`;
      }
      if (op === 'copy') {
        const txt = st.terms.map((x) => x.t.map((c) => c.value).join('\t')).join('\n');
        try {
          navigator.clipboard.writeText(txt);
        } catch (e) {
          /* clipboard may be blocked */
        }
        S.toast = {
          text: `Copied ${st.terms.length} marked value${st.terms.length === 1 ? '' : 's'}`,
        };
      }
      if (op === 'link') {
        const url = `${location.origin}${location.pathname}#explore/${dash.id}?mk=${MARKINGS.encode(S.marks)}`;
        try {
          navigator.clipboard.writeText(url);
        } catch (e) {
          /* ignore */
        }
        S.toast = { text: `Link copied with the current marks (${url.length} characters)` };
      }
      if ((op === 'invert' || op === 'all') && it) {
        const el = container.querySelector(`[data-chartbody="${it.id}"]`),
          MK = el && el.__mk;
        if (!MK) return;
        const rows = el.__rowsAll || [];
        const pick = op === 'all' ? rows : rows.filter((r) => !MK.on || MK.state(r) === 'none');
        MARKINGS.apply(st, pick.map(MK.tuple), it.id, 'replace');
        S.live = `${name}: ${st.terms.length} items marked`;
      }
      S.menu = null;
      S.chipMenu = null;
      render();
    }
    /** Tile menu › Create details tile: a new tile limited by this tile's marking (Spotfire's Create Details Visualization). */
    function createDetails(itemId) {
      const f = findItem(itemId),
        it = f.it,
        c = CAT().chartById(it.chart),
        mk = markingOf(it);
      if (!S.edit) {
        S.edit = true;
        S.snapshot = snap();
        S.undo = [];
        S.redo = [];
      }
      pushUndo();
      const dims = c.spec.dimensions.includes('products.product_name')
        ? ['customers.country']
        : ['products.product_name'];
      const nc = newLocal(
        CHART_EDITOR.newSpec({
          title: `Details: ${c.spec.title}`,
          type: 'table',
          metrics: c.spec.metrics.slice(0, 2),
          dimensions: dims,
          sort: 'desc',
        }),
      );
      const item = {
        id: CAT().id('i'),
        kind: 'chart',
        chart: nc.id,
        w: Math.max(4, it.w),
        h: 34,
        marking: null,
        limit: {
          ids: mk ? [mk] : [],
          combine: 'and',
          empty: 'message',
          message: `Mark items in "${c.spec.title}" to see details.`,
        },
      };
      f.arr.splice(f.i + 1, 0, item);
      S.sel = item.id;
      S.side = 'props';
      S.menu = null;
      S.toast = {
        text: `Details tile added, limited by ${mk ? mkDef(mk).name : 'no marking yet'}`,
      };
      render();
    }
    /** Gear → settings page. Saving in view mode saves the dashboard; while editing it is one undoable change. */
    function openSettings(section) {
      S.menu = null;
      S.panel = null;
      DASH_SETTINGS.open({
        dash,
        section,
        folders: CAT().folders,
        tiles: chartTiles().map((t) => ({
          id: t.id,
          title: title(t),
          kpi: isKpi(t),
          marking: t.marking,
          limit: t.limit,
        })),
        onSave: (d) => {
          if (S.edit) pushUndo();
          const modeChanged = d.settings.interaction !== dash.settings.interaction;
          Object.assign(dash, {
            name: d.name,
            description: d.description,
            folder: d.folder,
            settings: d.settings,
          });
          chartTiles().forEach((t) => {
            const x = d.tiles[t.id];
            if (!x) return;
            if (x.marking === undefined) delete t.marking;
            else t.marking = x.marking;
            t.limit = x.limit.ids.length ? x.limit : t.limit && { ...x.limit };
          });
          Object.keys(S.marks).forEach((k) => {
            if (!mkDef(k)) delete S.marks[k];
          });
          if (modeChanged) {
            S.marks = {};
            S.cross = [];
            S.drawer = null;
          }
          if (!S.edit) dash.updated = 'Just now';
          S.toast = {
            text: modeChanged
              ? `Settings saved · interactions now use ${d.settings.interaction === 'markings' ? 'markings' : 'cross-filtering'}`
              : 'Settings saved',
          };
          render();
        },
        onClose: () => container.querySelector('[data-settings]')?.focus(),
      });
    }

    /* ---------- chart editor ---------- */
    function openEditor(itemId, specOverride, onApply) {
      if (!S.edit) {
        S.edit = true;
        S.snapshot = snap();
        S.undo = [];
        S.redo = [];
        S.cross = [];
        S.menu = null;
        render();
      }
      const it = itemId && findItem(itemId).it;
      let chart = it && CAT().chartById(it.chart);
      const shared = chart && !isLocal(chart),
        n = chart ? CAT().usedIn(chart.id).length : 0;
      const host = document.createElement('div');
      host.className = 'editor-overlay';
      host.setAttribute('role', 'dialog');
      host.setAttribute('aria-modal', 'true');
      host.setAttribute('aria-label', 'Chart editor');
      host.tabIndex = -1;
      document.body.appendChild(host);
      const close = () => {
        host.remove();
        if (it) {
          S.sel = it.id;
          S.side = 'props';
          S.focus = it.id;
        }
        render();
        container.querySelector(`[data-item="${S.sel}"]`)?.scrollIntoView({ block: 'nearest' });
      };
      const apply = (spec) => {
        if (onApply) onApply(spec);
        else if (JSON.stringify(spec) !== JSON.stringify(chart.spec)) {
          pushUndo();
          chart.spec = spec;
          chart.updated = 'Just now';
        }
      };
      const eprops = {
        spec: specOverride || chart.spec,
        mode: 'overlay',
        backLabel: `← Back to "${dash.name}"`,
        tileSize: it ? { w: it.w, h: it.h } : { w: 4, h: 40 },
        note: !chart
          ? 'New chart · only on this dashboard'
          : shared
            ? n > 1
              ? `Shared chart · on ${n} dashboards · edits change all of them`
              : `Shared chart from ${folderName(chart.folder)} · no other dashboard uses it yet`
            : 'Only on this dashboard',
        noteWarn: shared && n > 1,
        // Detach: the current (possibly edited) spec becomes a dashboard-local chart; the shared chart is left as it was.
        noteAction: shared
          ? {
              label: 'Make a local copy',
              run: (spec) => {
                pushUndo();
                chart = newLocal(spec);
                it.chart = chart.id;
                Object.assign(eprops, {
                  note: 'Local copy · only on this dashboard',
                  noteWarn: false,
                  noteAction: null,
                });
                S.toast = { text: 'Made a local copy. The shared chart is unchanged.' };
              },
            }
          : null,
        onApply: (spec) => {
          apply(spec);
          close();
        },
        onSaveDashboard: (spec) => {
          apply(spec);
          host.remove();
          S.edit = false;
          S.sel = null;
          S.toast = { text: 'Dashboard saved' };
          render();
        },
        onCancel: () => {
          host.remove();
          render();
        },
      };
      CHART_EDITOR.create(host, eprops);
      host.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') e.stopPropagation();
      }); // the editor handles Esc; keep it from also clearing the dashboard selection
      host.focus();
    }

    /* ---------- mutations ---------- */
    function insertAt(item, key, index) {
      const arr = containerArr(key);
      if (!canHold(key, item)) {
        const sec = {
          id: CAT().id('i'),
          kind: 'section',
          title: 'New section',
          collapsed: false,
          items: [item],
        };
        if (item.kind === 'section') return insertAt(item, `tab:${topTab().id}`, null);
        pushUndo();
        arr.splice(index == null ? arr.length : index, 0, sec);
        S.sel = item.id;
        S.toast = { text: 'Tab groups live inside a section, so a section was added around it' };
        return;
      }
      pushUndo();
      arr.splice(index == null ? arr.length : index, 0, item);
      S.sel = item.id;
    }
    function insert(item) {
      if (S.addTarget) insertAt(item, S.addTarget, null);
      else if (S.sel && findItem(S.sel)) {
        const f = findItem(S.sel);
        insertAt(item, keyOfArr(f.arr), f.i + 1);
      } else insertAt(item, `tab:${topTab().id}`, null);
      S.addTarget = null;
      S.side = 'props';
      render();
      container.querySelector(`[data-item="${S.sel}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    const newItem = (kind) => {
      const id = CAT().id('i');
      return {
        markdown: {
          id,
          kind,
          w: 6,
          h: 18,
          text: '## New text\nDescribe what this part of the dashboard shows.',
        },
        header: { id, kind, text: 'New heading', size: 'md' },
        divider: { id, kind },
        section: { id, kind, title: 'New section', collapsed: false, items: [] },
        tabs: {
          id,
          kind,
          active: 'a',
          tabs: [
            { id: 'a', title: 'Tab 1', items: [] },
            { id: 'b', title: 'Tab 2', items: [] },
          ],
        },
        image: { id, kind, w: 3, h: 12, src: '', alt: '', fit: 'contain' },
        link: {
          id,
          kind,
          w: 3,
          h: 7,
          label: 'Open dashboard',
          style: 'button',
          target: { type: 'dashboard', id: '' },
          passFilters: true,
        },
      }[kind];
    };
    // Templates add empty dashboard-local charts to fill in with ✎ (Metabase's section templates).
    function templateItems(k) {
      const L = (type, t, w, h) => ({
        id: CAT().id('i'),
        kind: 'chart',
        chart: newLocal(CHART_EDITOR.newSpec({ title: t, type })).id,
        w,
        h,
      });
      return k === 'kpis'
        ? [1, 2, 3, 4].map((i) => L('kpi', `KPI ${i}`, 3, 13))
        : k === 'two'
          ? [L('auto', 'Chart A', 6, 40), L('auto', 'Chart B', 6, 40)]
          : [L('auto', 'New chart', 8, 40), { ...newItem('markdown'), w: 4, h: 40 }];
    }
    function addKind(kind) {
      if (kind === 'library') {
        S.side = 'library';
        return render();
      }
      if (kind === 'filter') {
        S.toast = { text: 'Filter added to the filter bar (prototype)' };
        return render();
      }
      if (kind === 'chart') {
        const tgt = S.addTarget,
          sel = S.sel;
        return openEditor(null, CHART_EDITOR.newSpec({ title: 'New chart' }), (spec) => {
          if (!spec.metrics.length && !spec.dimensions.length && !spec.time) return;
          const c = newLocal(spec);
          S.addTarget = tgt;
          S.sel = sel;
          insert({ id: CAT().id('i'), kind: 'chart', chart: c.id, w: 4, h: 40 });
        });
      }
      insert(newItem(kind));
    }
    function removeItem(id) {
      const f = findItem(id);
      pushUndo();
      f.arr.splice(f.i, 1);
      S.sel = null;
      S.side = 'add';
      S.toast = { text: `Removed "${title(f.it)}"`, undo: true };
      render();
    }
    function moveTo(id, key, index) {
      const src = findItem(id),
        dest = containerArr(key);
      if (
        !dest ||
        !canHold(key, src.it) ||
        ((src.it.items || src.it.tabs) && contains(src.it, dest))
      )
        return false;
      pushUndo();
      src.arr.splice(src.i, 1);
      dest.splice(
        index == null || index < 0 ? dest.length : Math.min(index, dest.length),
        0,
        src.it,
      );
      S.sel = id;
      const [kind, a, b] = key.split(':');
      if (kind === 'tab') S.tab = a;
      if (kind === 'tabs') findItem(a).it.active = b;
      return true;
    }

    /* ---------- drag (tiles by pointer, palette by HTML5 DnD) ---------- */
    const marker = () => container.querySelector('.dmarker'),
      readout = () => container.querySelector('.readout');
    function dropTarget(x, y, dragId) {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const tabBtn = el.closest('[data-droptab]');
      if (tabBtn) {
        const r = tabBtn.getBoundingClientRect();
        return {
          key: tabBtn.dataset.droptab,
          ref: null,
          tabLabel: true,
          rect: { left: r.left, top: r.bottom - 3, width: r.width, height: 3 },
        };
      }
      const cont = el.closest('[data-container]');
      if (!cont) return null;
      const itemEl = el.closest('[data-item]');
      if (itemEl && itemEl.dataset.item !== dragId && itemEl.parentElement === cont) {
        const r = itemEl.getBoundingClientRect();
        return {
          key: cont.dataset.container,
          ref: itemEl.dataset.item,
          after: x > r.left + r.width / 2,
          rect: r,
        };
      }
      const r = cont.getBoundingClientRect();
      return {
        key: cont.dataset.container,
        ref: null,
        end: true,
        rect: { left: r.left + 8, top: r.bottom - 22, width: r.width - 16, height: 3 },
      };
    }
    function showMarker(t) {
      const m = marker();
      if (!m) return;
      if (!t) {
        m.hidden = true;
        return;
      }
      m.hidden = false;
      const r = t.rect;
      Object.assign(
        m.style,
        t.end || t.tabLabel
          ? { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: '3px' }
          : {
              left: `${(t.after ? r.right : r.left) - 2}px`,
              top: `${r.top}px`,
              width: '4px',
              height: `${r.height}px`,
            },
      );
    }
    const indexFor = (t) => {
      const dest = containerArr(t.key);
      if (!t.ref) return dest.length;
      return dest.findIndex((x) => x.id === t.ref) + (t.after ? 1 : 0);
    };

    container.addEventListener('pointerdown', (e) => {
      if (!S.edit || e.button !== 0) return;
      const rz = e.target.closest('[data-rz]'),
        g =
          !rz &&
          !e.target.closest('button, input, select, textarea') &&
          e.target.closest('[data-drag]');
      if ((rz || g) && S.menu) {
        S.menu = null;
        container.querySelector('[role=menu]')?.remove();
      }
      if (rz) {
        e.preventDefault();
        const [dir, id] = rz.dataset.rz.split(':');
        const el = container.querySelector(`[data-item="${id}"]`);
        const cont = el.parentElement.getBoundingClientRect();
        const it = findItem(id).it;
        S.resize = {
          dir,
          id,
          x: e.clientX,
          y: e.clientY,
          w: it.w,
          h: it.h || Math.round(el.getBoundingClientRect().height / 8),
          col: (cont.width - 48 - 16 * 11) / 12 + 16,
          el,
        };
        container.classList.add('guides');
      } else if (g) {
        S.drag = { id: g.dataset.drag, x: e.clientX, y: e.clientY, moved: false };
      }
    });
    const onMove = (e) => {
      if (S.drag) {
        if (!S.drag.moved && Math.hypot(e.clientX - S.drag.x, e.clientY - S.drag.y) < 5) return;
        S.drag.moved = true;
        container.classList.add('dragging', 'guides');
        container.querySelector(`[data-item="${S.drag.id}"]`)?.classList.add('ghosted');
        S.drag.t = dropTarget(e.clientX, e.clientY, S.drag.id);
        showMarker(S.drag.t);
      }
      if (S.resize) {
        const r = S.resize,
          it = findItem(r.id).it;
        if (r.dir !== 's')
          it.w = Math.max(2, Math.min(12, r.w + Math.round((e.clientX - r.x) / r.col)));
        if (r.dir !== 'e')
          it.h = Math.max(minH(it), Math.min(120, r.h + Math.round((e.clientY - r.y) / 8)));
        r.el.style.gridColumn = `span ${it.w}`;
        r.el.style.height = `${it.h * 8}px`;
        r.el.classList.add('resizing');
        const ro = readout();
        ro.hidden = false;
        ro.textContent = `${it.w} / 12 cols · ${Math.round((it.w / 12) * 100)}% · ${it.h * 8} px`;
        ro.style.left = `${e.clientX + 14}px`;
        ro.style.top = `${e.clientY + 14}px`;
      }
    };
    const onUp = () => {
      if (!container.isConnected) return;
      if (S.drag) {
        const d = S.drag;
        S.drag = null;
        container.classList.remove('dragging', 'guides');
        showMarker(null);
        if (d.moved && d.t) moveTo(d.id, d.t.key, d.t.tabLabel ? null : indexFor(d.t));
        render();
      }
      if (S.resize) {
        const r = S.resize;
        S.resize = null;
        container.classList.remove('guides');
        const it = findItem(r.id).it;
        if (it.w !== r.w || it.h !== r.h) {
          const now = { w: it.w, h: it.h };
          Object.assign(it, { w: r.w, h: r.h });
          pushUndo();
          Object.assign(it, now);
          S.live = `Resized to ${it.w} of 12 columns, ${it.h * 8} pixels tall`;
        }
        S.sel = r.id;
        render();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    container.addEventListener('dragstart', (e) => {
      const p = e.target.closest('[data-palette]');
      if (!p) return;
      S.pdrag = p.dataset.palette;
      e.dataTransfer.setData('text/plain', S.pdrag);
      e.dataTransfer.effectAllowed = 'copy';
      container.classList.add('guides');
    });
    container.addEventListener('dragover', (e) => {
      if (!S.pdrag) return;
      const t = dropTarget(e.clientX, e.clientY, null);
      if (t && !t.tabLabel) {
        e.preventDefault();
        S.pdt = t;
        showMarker(t);
      } else showMarker(null);
    });
    container.addEventListener('drop', (e) => {
      if (!S.pdrag || !S.pdt) return;
      e.preventDefault();
      const kind = S.pdrag,
        t = S.pdt;
      S.pdrag = null;
      S.pdt = null;
      showMarker(null);
      container.classList.remove('guides');
      if (kind === 'chart' || kind === 'library' || kind === 'filter') {
        S.addTarget = t.key;
        return addKind(kind);
      }
      const item = newItem(kind);
      insertAt(item, t.key, indexFor(t));
      S.side = 'props';
      render();
    });
    container.addEventListener('dragend', () => {
      S.pdrag = null;
      showMarker(null);
      container.classList.remove('guides');
    });

    /* ---------- clicks ---------- */
    container.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) {
        if (S.menu || S.chipMenu) {
          S.menu = null;
          S.chipMenu = null;
          return render();
        }
        const itEl = e.target.closest('[data-item]');
        if (S.edit && itEl) {
          S.sel = itEl.dataset.item;
          S.side = 'props';
          render();
        }
        return;
      }
      const d = b.dataset;
      if ('back' in d) return props.onBack && props.onBack();
      if ('settings' in d) return openSettings(d.settings || 'general');
      if (d.chipmenu) {
        S.chipMenu = S.chipMenu === d.chipmenu ? null : d.chipmenu;
        return render();
      }
      if (d.mkclear) {
        S.chipMenu = null;
        return markedOp('clear', d.mkclear);
      }
      if (d.mkop) {
        const [op, id, from] = d.mkop.split(':');
        if (from === 'chip') return markedOp(op, id);
        const it = findItem(id).it;
        return markedOp(op, markingOf(it), it);
      }
      if (d.mkdetails) return createDetails(d.mkdetails);
      if (d.unxf != null) {
        S.xf.splice(+d.unxf, 1);
        return render();
      }
      if ('closedrawer' in d) {
        S.drawer = null;
        return render();
      }
      if ('exportrows' in d) {
        S.toast = { text: 'Export started: marked rows as CSV (prototype)' };
        return render();
      }
      if (d.jump) {
        const f = findItem(d.jump);
        S.tab = f.page.id;
        S.panel = null;
        render();
        const el = container.querySelector(`[data-item="${d.jump}"]`);
        el?.scrollIntoView({ block: 'center' });
        el?.focus();
        return;
      }
      if (d.psep) {
        pushUndo();
        const it = findItem(d.psep).it;
        it.separate = !it.separate;
        return render();
      }
      if (d.pcomb) {
        const [id, v] = d.pcomb.split(':');
        pushUndo();
        findItem(id).it.limit.combine = v;
        return render();
      }
      if ('edit' in d) {
        S.edit = true;
        S.snapshot = snap();
        S.undo = [];
        S.redo = [];
        S.cross = [];
        S.side = 'add';
        return render();
      }
      if ('save' in d) {
        S.edit = false;
        S.sel = null;
        S.menu = null;
        S.toast = { text: 'Dashboard saved' };
        dash.updated = 'Just now';
        return render();
      }
      if ('discard' in d) {
        if (S.snapshot) restore(S.snapshot);
        S.edit = false;
        S.sel = null;
        S.menu = null;
        return render();
      }
      if (('undo' in d || 'toastundo' in d) && S.undo.length) {
        S.redo.push(snap());
        restore(S.undo.pop());
        S.toast = null;
        return render();
      }
      if ('redo' in d && S.redo.length) {
        S.undo.push(snap());
        restore(S.redo.pop());
        return render();
      }
      if (d.side) {
        S.side = d.side;
        return render();
      }
      if (d.addat) {
        S.addTarget = d.addat;
        S.sel = null;
        S.side = 'add';
        return render();
      }
      if (d.palette) return addKind(d.palette);
      if (d.template) {
        pushUndo();
        const items = templateItems(d.template);
        const key = S.addTarget || `tab:${topTab().id}`;
        containerArr(key).push(...items);
        S.sel = items[0].id;
        S.addTarget = null;
        return render();
      }
      if (d.addlib) {
        const c = CAT().chartById(d.addlib);
        S.side = 'add';
        return insert({
          id: CAT().id('i'),
          kind: 'chart',
          chart: c.id,
          w: c.spec.type === 'kpi' ? 3 : 4,
          h: c.spec.type === 'kpi' ? 13 : 40,
        });
      }
      if (d.editchart) {
        S.menu = null;
        return openEditor(d.editchart);
      }
      if (d.tmenu) {
        S.menu = S.menu === d.tmenu ? null : d.tmenu;
        if (S.edit) S.sel = d.tmenu;
        return render();
      }
      if (d.moveto) {
        const [id, key] = d.moveto.split('|');
        S.menu = null;
        moveTo(id, key, null);
        return render();
      }
      if (d.select != null) {
        S.sel = d.select || null;
        S.side = d.select ? 'props' : 'outline';
        render();
        if (d.select)
          container
            .querySelector(`[data-item="${d.select}"]`)
            ?.scrollIntoView({ block: 'nearest' });
        return;
      }
      // Duplicating gives every chart tile its own local copy, so the two tiles can be edited independently.
      if (d.dup) {
        const f = findItem(d.dup);
        pushUndo();
        const copy = JSON.parse(JSON.stringify(f.it));
        const reid = (x) => {
          x.id = CAT().id('i');
          if (x.kind === 'chart') x.chart = newLocal(CAT().chartById(x.chart).spec).id;
          (x.items || []).forEach(reid);
          (x.tabs || []).forEach((t) => t.items.forEach(reid));
        };
        reid(copy);
        f.arr.splice(f.i + 1, 0, copy);
        S.sel = copy.id;
        S.menu = null;
        return render();
      }
      if (d.publish) {
        S.menu = null;
        S.sel = d.publish;
        S.side = 'props';
        S.publish = d.publish;
        return render();
      }
      if ('nopublish' in d) {
        S.publish = null;
        return render();
      }
      if (d.dopublish) {
        const c = CAT().chartById(findItem(d.dopublish).it.chart),
          fo = container.querySelector('[data-pubfolder]').value;
        pushUndo();
        Object.assign(c, { owner: null, folder: fo });
        S.publish = null;
        S.toast = {
          text: `Saved "${c.spec.title}" to ${folderName(fo)}. It is now a shared chart.`,
        };
        return render();
      }
      if (d.detach) {
        const it = findItem(d.detach).it;
        pushUndo();
        it.chart = newLocal(CAT().chartById(it.chart).spec).id;
        S.menu = null;
        S.sel = it.id;
        S.toast = { text: 'Made a local copy. The shared chart is unchanged.', undo: true };
        return render();
      }
      if (d.imgfit) {
        const [id, v] = d.imgfit.split(':');
        pushUndo();
        findItem(id).it.fit = v;
        return render();
      }
      if (d.imgclear) {
        pushUndo();
        Object.assign(findItem(d.imgclear).it, { src: '' });
        return render();
      }
      if (d.linkstyle) {
        const [id, v] = d.linkstyle.split(':');
        pushUndo();
        findItem(id).it.style = v;
        return render();
      }
      if (d.linktype) {
        const [id, v] = d.linktype.split(':');
        const it = findItem(id).it;
        if ((it.target || {}).type === v) return;
        pushUndo();
        it.target = v === 'url' ? { type: 'url', href: '' } : { type: 'dashboard', id: '' };
        return render();
      }
      if (d.linkpass) {
        pushUndo();
        const it = findItem(d.linkpass).it;
        it.passFilters = !it.passFilters;
        return render();
      }
      if (d.follow) {
        const it = findItem(d.follow).it,
          t = it.target || {};
        if (t.type === 'dashboard' && CAT().dashById(t.id) && props.onOpenDashboard)
          props.onOpenDashboard(
            t.id,
            it.passFilters ? { date: S.date, category: S.category } : null,
          );
        return;
      }
      if (d.del) {
        S.menu = null;
        const f = findItem(d.del);
        if (f.it.kind === 'section' && f.it.items.length) {
          S.confirm = f.it.id;
          return render();
        }
        return removeItem(d.del);
      }
      if (d.delsec) {
        S.confirm = null;
        return removeItem(d.delsec);
      }
      if ('noconfirm' in d) {
        S.confirm = null;
        return render();
      }
      if (d.collapse) {
        const it = findItem(d.collapse).it;
        if (S.edit) pushUndo();
        it.collapsed = !it.collapsed;
        return render();
      }
      if (d.hidehdr) {
        const it = findItem(d.hidehdr).it;
        pushUndo();
        it.hideHeader = !it.hideHeader;
        return render();
      }
      if (d.ungroup) {
        const f = findItem(d.ungroup);
        pushUndo();
        f.arr.splice(f.i, 1, ...f.it.items);
        S.sel = null;
        S.confirm = null;
        S.toast = { text: `Ungrouped "${f.it.title}"`, undo: true };
        return render();
      }
      if (d.intab && !S.edit) {
        const [id, t] = d.intab.split(':');
        findItem(id).it.active = t;
        return render();
      }
      if (d.intab) {
        const [id, t] = d.intab.split(':');
        findItem(id).it.active = t;
        return render();
      }
      if (d.addintab) {
        const it = findItem(d.addintab).it;
        pushUndo();
        const tid = CAT().id('t');
        it.tabs.push({ id: tid, title: `Tab ${it.tabs.length + 1}`, items: [] });
        it.active = tid;
        return render();
      }
      if (d.delintab) {
        const [id, t] = d.delintab.split(':');
        const it = findItem(id).it;
        const n = it.tabs.find((x) => x.id === t).items.length;
        pushUndo();
        it.tabs = it.tabs.filter((x) => x.id !== t);
        it.active = it.tabs[0].id;
        S.toast = { text: `Deleted tab with ${n} item${n === 1 ? '' : 's'}`, undo: true };
        return render();
      }
      if ('addtoptab' in d) {
        pushUndo();
        const tid = CAT().id('t');
        dash.tabs.push({ id: tid, title: `Page ${dash.tabs.length + 1}`, items: [] });
        S.tab = tid;
        return render();
      }
      if (d.deltab) {
        const n = dash.tabs.find((t) => t.id === d.deltab).items.length;
        pushUndo();
        dash.tabs = dash.tabs.filter((t) => t.id !== d.deltab);
        S.tab = dash.tabs[0].id;
        S.toast = { text: `Deleted page tab with ${n} item${n === 1 ? '' : 's'}`, undo: true };
        return render();
      }
      if (d.hdrsize) {
        const [id, s] = d.hdrsize.split(':');
        pushUndo();
        findItem(id).it.size = s;
        return render();
      }
      if (d.dtab) {
        S.tab = d.dtab;
        S.cross = [];
        return render();
      }
      if (d.uncross != null) {
        S.cross.splice(+d.uncross, 1);
        return render();
      }
      if ('clearcross' in d) {
        S.cross = [];
        return render();
      }
      if (d.viewas != null) {
        S.viewAs = d.viewas;
        return render();
      }
      if (d.panel) {
        S.panel = S.panel === d.panel ? null : d.panel;
        return render();
      }
      if ('closepanel' in d) {
        S.panel = null;
        return render();
      }
      if ('saveschedule' in d) {
        WC.schedules.push({
          id: CAT().id('s'),
          kind: 'delivery',
          name: `${dash.name} → PDF`,
          target: `Dashboard: ${dash.name}`,
          cron: '0 8 * * 1',
          human: 'Weekly on Monday at 08:00',
          tz: 'America/Los_Angeles',
          owner: 'me',
          last: ['idle', 'Not run yet'],
          enabled: true,
          via: 'email: me',
        });
        S.panel = null;
        S.toast = { text: 'Scheduled. Manage it in Schedules.' };
        return render();
      }
    });
    container.addEventListener('dblclick', (e) => {
      const t = e.target.closest('[data-dtab]');
      if (!S.edit || !t) return;
      S.side = 'props';
      S.sel = null;
      render();
      container.querySelector(`[data-tabname="${t.dataset.dtab}"]`)?.select();
    });
    container.addEventListener('input', (e) => {
      if ('libq' in e.target.dataset) {
        S.libq = e.target.value;
        const p = e.target.selectionStart;
        render();
        const q = container.querySelector('[data-libq]');
        q.focus();
        q.setSelectionRange(p, p);
      }
    });
    container.addEventListener('change', (e) => {
      const d = e.target.dataset;
      if (d.f) {
        S[d.f] = e.target.value;
        return render();
      }
      if ('viewasSel' in d) {
        S.viewAs = e.target.value;
        return render();
      }
      if (d.pmk) {
        pushUndo();
        const it = findItem(d.pmk).it;
        it.marking = e.target.value || null;
        if (it.limit) it.limit.ids = it.limit.ids.filter((x) => x !== it.marking);
        return render();
      }
      // Limiting by a marking makes this a details tile: default to Spotfire's message state (user, 2026-09-19), pre-filled with the master tiles.
      if (d.plim) {
        const [id, mk] = d.plim.split(':');
        pushUndo();
        const it = findItem(id).it;
        it.limit ||= { ids: [], combine: 'and', empty: 'message', message: '' };
        it.limit.ids = e.target.checked
          ? [...it.limit.ids, mk]
          : it.limit.ids.filter((x) => x !== mk);
        if (!it.limit.message) {
          const m = masters(it);
          it.limit.message = `Mark items in ${m.length ? m.map((x) => `"${x}"`).join(' or ') : 'a master tile'} to see details.`;
        }
        return render();
      }
      if (d.pempty) {
        pushUndo();
        findItem(d.pempty).it.limit.empty = e.target.value;
        return render();
      }
      if (d.pmsg) {
        pushUndo();
        findItem(d.pmsg).it.limit.message = e.target.value;
        return render();
      }
      if ('dname' in d) {
        pushUndo();
        dash.name = e.target.value;
        return render();
      }
      if ('ddesc' in d) {
        dash.description = e.target.value;
        return;
      }
      if (d.tabname) {
        pushUndo();
        dash.tabs.find((t) => t.id === d.tabname).title = e.target.value;
        return render();
      }
      if (d.mdtext) {
        pushUndo();
        findItem(d.mdtext).it.text = e.target.value;
        return render();
      }
      if (d.hdrtext) {
        pushUndo();
        findItem(d.hdrtext).it.text = e.target.value;
        return render();
      }
      if (d.sectitle) {
        pushUndo();
        findItem(d.sectitle).it.title = e.target.value;
        return render();
      }
      if (d.intabname) {
        const [id, t] = d.intabname.split(':');
        pushUndo();
        findItem(id).it.tabs.find((x) => x.id === t).title = e.target.value;
        return render();
      }
      if (d.imgalt) {
        pushUndo();
        findItem(d.imgalt).it.alt = e.target.value.trim();
        return render();
      }
      if (d.linklabel) {
        pushUndo();
        findItem(d.linklabel).it.label = e.target.value.trim() || 'Link';
        return render();
      }
      if (d.linkurl) {
        pushUndo();
        findItem(d.linkurl).it.target.href = e.target.value.trim();
        return render();
      }
      if (d.linkdash) {
        pushUndo();
        findItem(d.linkdash).it.target.id = e.target.value;
        return render();
      }
      if (d.imgfile) {
        const file = e.target.files[0],
          id = d.imgfile;
        S.imgErr = '';
        if (!file) return;
        if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
          S.imgErr = 'That file type is not supported.';
          return render();
        }
        if (file.size > 2 * 1024 * 1024) {
          S.imgErr = `That image is ${(file.size / 1048576).toFixed(1)} MB; the limit is 2 MB.`;
          return render();
        }
        const rd = new FileReader();
        rd.onload = () => {
          pushUndo();
          const it = findItem(id).it;
          it.src = rd.result;
          if (!it.alt) it.alt = '';
          render();
          container.querySelector('[data-imgalt]')?.focus();
        };
        rd.readAsDataURL(file);
      }
    });

    /* ---------- keyboard ---------- */
    /** Keyboard marking on a focused tile (markings mode). Arrows move focus between items without marking — each marking change
        re-queries other tiles (WAI-ARIA APG) — Space marks, Ctrl/⌘+Space toggles, Shift+Arrow extends, Esc unmarks,
        Ctrl+M / Ctrl+Shift+M filter to / out (Spotfire). Returns true when handled. */
    function markKey(e, it) {
      const el = container.querySelector(`[data-chartbody="${it.id}"]`),
        mk = markingOf(it);
      if (!el || !mk) return false;
      const inst = echarts.getInstanceByDom(el),
        opt = inst && inst.getOption();
      const data = opt && opt.series && opt.series[0] ? opt.series[0].data : [];
      const cats =
        opt && opt.xAxis && opt.xAxis[0] && opt.xAxis[0].data && opt.series.length > 2
          ? opt.xAxis[0].data
          : null;
      const enc = el.__enc,
        MK = el.__mk;
      let items = cats
        ? cats.map((x, di) => ({
            di,
            label: String(x),
            tuples: [
              [{ id: enc.x, granularity: (enc.grains || {})[enc.x] || 'month', value: String(x) }],
            ],
          }))
        : data.map((d, di) => ({
            di,
            label:
              d.name != null
                ? String(d.name)
                : d.mk && d.mk[0]
                  ? d.mk[0].map((c) => c.value).join(' · ')
                  : '',
            tuples: d.mk || [],
          }));
      if (el.__type === 'hbar') items = items.reverse(); // horizontal bars are stored bottom-up; keyboard order follows reading order (top-down)
      if (!items.length && !(el.__rowsAll || []).length) return false;
      const list = items.length
        ? items
        : (el.__rowsAll || []).map((r) => ({
            label: MK.dims.map((dd) => r[dd.id]).join(' · '),
            tuples: [MK.tuple(r)],
          }));
      const k = e.key,
        ctrl = e.ctrlKey || e.metaKey;
      let i = S.kfocus[it.id] ?? -1;
      const show = () => {
        const di = list[i].di ?? i;
        if (inst) {
          inst.dispatchAction({ type: 'downplay', seriesIndex: 0 });
          inst.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: di });
          inst.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: di });
        }
        const live = container.querySelector('.sr-only[aria-live]');
        if (live) live.textContent = `${list[i].label}, ${i + 1} of ${list.length}. Space marks.`;
      };
      if (k.startsWith('Arrow')) {
        e.preventDefault();
        const prev = i;
        i = Math.max(
          0,
          Math.min(list.length - 1, i + (k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1)),
        );
        if (prev === -1) i = 0;
        S.kfocus[it.id] = i;
        if (e.shiftKey) {
          mark(it, mk, list[i].tuples, { ctrl: true }, 'range');
          container.querySelector(`[data-item="${it.id}"]`)?.focus();
          S.kfocus[it.id] = i;
        }
        show();
        return true;
      }
      if (k === ' ' && i >= 0) {
        e.preventDefault();
        mark(it, mk, list[i].tuples, { ctrl }, 'item');
        container.querySelector(`[data-item="${it.id}"]`)?.focus();
        S.kfocus[it.id] = i;
        return true;
      }
      if (k === 'Escape' && MARKINGS.count(S.marks[mk])) {
        e.preventDefault();
        mark(it, mk, [], {}, 'clear');
        container.querySelector(`[data-item="${it.id}"]`)?.focus();
        return true;
      }
      if (ctrl && k.toLowerCase() === 'm') {
        e.preventDefault();
        markedOp(e.shiftKey ? 'out' : 'to', mk, it);
        return true;
      }
      return false;
    }
    const onKey = (e) => {
      if (!container.isConnected || document.querySelector('.editor-overlay')) return;
      const inField = e.target.closest && e.target.closest('input, textarea, select');
      if (S.edit && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        return container.querySelector('[data-save]')?.click();
      }
      const tile = e.target.closest && e.target.closest('[data-item]');
      if (
        !S.edit &&
        MODE() === 'markings' &&
        tile &&
        e.target === tile &&
        tile.classList.contains('kbd-marking') &&
        markKey(e, findItem(tile.dataset.item).it)
      )
        return;
      if (e.key === 'Escape') {
        if (S.menu || S.confirm || S.chipMenu) {
          S.menu = null;
          S.confirm = null;
          S.chipMenu = null;
          return render();
        }
        if (S.panel) {
          S.panel = null;
          return render();
        }
        if (S.drawer) {
          S.drawer = null;
          return render();
        }
        if (S.cross.length) {
          S.cross = [];
          return render();
        }
        if (!S.edit && Object.values(S.marks).some((s) => s.terms.length)) {
          Object.values(S.marks).forEach((s) => {
            s.terms = [];
          });
          S.live = 'All markings unmarked';
          return render();
        }
        if (S.sel) {
          S.sel = null;
          return render();
        }
      }
      if (S.edit && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !inField) {
        e.preventDefault();
        return container.querySelector(e.shiftKey ? '[data-redo]' : '[data-undo]')?.click();
      }
      if (!S.edit || !tile || inField || e.target !== tile) return;
      const f = findItem(tile.dataset.item);
      if (!f) return;
      const it = f.it;
      if (e.key.toLowerCase() === 'e' && it.kind === 'chart') {
        e.preventDefault();
        return openEditor(it.id);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        return container.querySelector(`[data-del="${it.id}"]`)
          ? container.querySelector(`[data-del="${it.id}"]`).click()
          : removeItem(it.id);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        S.sel = it.id;
        S.side = 'props';
        render();
        container
          .querySelector('.pane.right input, .pane.right textarea, .pane.right button.btn')
          ?.focus();
        return;
      }
      if (!e.key.startsWith('Arrow')) return;
      e.preventDefault();
      pushUndo();
      if (e.shiftKey && SIZED.includes(it.kind)) {
        if (e.key === 'ArrowRight') it.w = Math.min(12, it.w + 1);
        if (e.key === 'ArrowLeft') it.w = Math.max(2, it.w - 1);
        if (e.key === 'ArrowDown') it.h = Math.min(120, (it.h || 18) + 1);
        if (e.key === 'ArrowUp') it.h = Math.max(minH(it), (it.h || 18) - 1);
        S.live = `${it.w} of 12 columns, ${(it.h || 18) * 8} pixels tall`;
      } else {
        const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
        const j = f.i + dir;
        if (j >= 0 && j < f.arr.length) {
          [f.arr[f.i], f.arr[j]] = [f.arr[j], f.arr[f.i]];
          S.live = `Moved to position ${j + 1} of ${f.arr.length}`;
        } else {
          S.undo.pop();
          return;
        }
      }
      S.sel = it.id;
      S.focus = it.id;
      render();
    };
    document.addEventListener('keydown', onKey);
    if (S.edit) S.snapshot = snap();
    render();
    return {
      render,
      destroy() {
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      },
    };
  }

  window.DASHBOARD = { create };
})();
