/* wechart prototype: reusable chart editor (Superset-style Data/Customize + Grafana-style in-place editing).
   CHART_EDITOR.create(container, { spec, mode: 'page' | 'overlay', onApply(spec), onCancel() }) */
(function () {
  const esc = UI.esc,
    SV = UI.STATUS_SVG;
  const SOURCES = {
    'view:sales': {
      label: 'sales',
      kind: 'View',
      cubes: null,
      desc: 'Curated view for dashboard authors',
    },
    'cube:orders': { label: 'orders', kind: 'Cube', cubes: ['orders', 'customers', 'employees'] },
    'cube:order_lines': {
      label: 'order_lines',
      kind: 'Cube',
      cubes: ['order_lines', 'products', 'orders'],
    },
    'cube:customers': { label: 'customers', kind: 'Cube', cubes: ['customers'] },
    'cube:products': { label: 'products', kind: 'Cube', cubes: ['products'] },
  };
  const CATS = [
    ['evolution', 'Evolution over time', ['line', 'area', 'multiline', 'stackedarea', 'combo']],
    ['ranking', 'Ranking and comparison', ['bar', 'hbar', 'groupedbar', 'stackedbar']],
    ['part', 'Part of a whole', ['pie', 'treemap', 'stackedbar', 'stackedarea']],
    ['matrix', 'Distribution and matrix', ['heatmap', 'pivot', 'facet']],
    ['correlation', 'Correlation', ['scatter', 'parallel']],
    ['kpi', 'KPI', ['kpi']],
    ['table', 'Table', ['table', 'pivot']],
  ];
  const DESC = {
    kpi: 'One headline number per metric',
    bar: 'Compare values across categories',
    hbar: 'Bars for long labels or many categories',
    line: 'Trend over time',
    area: 'Volume over time',
    multiline: 'Several series over time',
    stackedarea: 'Composition over time',
    stackedbar: 'Composition within each category',
    groupedbar: 'Side-by-side comparison',
    facet: 'One small panel per member (trellis)',
    heatmap: 'Two dimensions as a colour matrix',
    scatter: 'Relationship between two metrics',
    pie: 'Share of a small whole (≤ 6 slices)',
    treemap: 'Share of a whole with many parts',
    parallel: 'Profiles across 3+ metrics',
    table: 'Exact values',
    pivot: 'Rows × columns with totals',
    combo: 'Bars plus a line on two axes (use with care)',
  };
  const NEEDS = {
    kpi: [1, 0],
    bar: [1, 1],
    hbar: [1, 1],
    line: [1, 1, 'time'],
    area: [1, 1, 'time'],
    multiline: [1, 2],
    stackedarea: [1, 2],
    stackedbar: [1, 2],
    groupedbar: [1, 2],
    facet: [1, 2],
    heatmap: [1, 2],
    scatter: [2, 1],
    pie: [1, 1],
    treemap: [1, 1],
    parallel: [3, 1],
    table: [1, 0],
    pivot: [1, 2],
    combo: [2, 1],
  };

  const fieldsOf = (src) => {
    const s = SOURCES[src];
    return WC.FIELDS.filter((f) => !s.cubes || s.cubes.includes(f.cube));
  };
  const isTime = (id) => WC.byId[id].type === 'time';

  /** Spec → { type, enc, need?, warn?, rec }. 'auto' asks the recommender; explicit types map fields to channels. */
  function encode(spec) {
    const dims = spec.dimensions.slice(),
      ms = spec.metrics.slice(),
      t = spec.time && spec.time.id;
    const grains = t ? { [t]: spec.time.granularity } : {};
    const wells = {
      x: t ? [{ id: t, granularity: spec.time.granularity }] : dims[0] ? [{ id: dims[0] }] : [],
      color: (t ? dims.slice(0, 1) : dims.slice(1, 2)).map((id) => ({ id })),
      trellis: [],
      y: ms.map((id) => ({ id })),
      size: [],
    };
    const rec = RECO.recommend(wells);
    const nD = dims.length + (t ? 1 : 0),
      first = t || dims[0],
      second = t ? dims[0] : dims[1];
    let type = spec.type;
    if (type === 'auto') {
      if (!rec.top) return { need: 'Add at least one metric or dimension', rec };
      return { type: rec.top.type, enc: { ...rec.top.enc, grains }, rec, auto: rec.top };
    }
    const [mNeed, dNeed, tNeed] = NEEDS[type];
    const miss = [];
    if (ms.length < mNeed) miss.push(`${mNeed} metric${mNeed > 1 ? 's' : ''}`);
    if (nD < dNeed) miss.push(`${dNeed} dimension${dNeed > 1 ? 's' : ''} (including time)`);
    if (tNeed && !t) miss.push('a time dimension');
    if (miss.length) return { need: `${RECO.TYPES[type].label} needs ${miss.join(' and ')}`, rec };
    const base = {
      measures: ms,
      grains,
      sort: spec.sort || undefined,
      topK: +spec.topK > 0 ? +spec.topK : undefined,
    };
    let enc,
      warn = '';
    const card = (id) => (id ? WC.cardinality(id, grains[id]) : 0);
    if (['bar', 'hbar', 'line', 'area'].includes(type) && second)
      type =
        type === 'line'
          ? 'multiline'
          : type === 'area'
            ? 'stackedarea'
            : spec.options.stack === false
              ? 'groupedbar'
              : 'stackedbar';
    switch (type) {
      case 'kpi':
      case 'table':
        enc = { ...base, x: first, series: second };
        break;
      case 'bar':
      case 'hbar':
      case 'pie':
      case 'treemap':
        enc = { ...base, x: first, sort: base.sort || (isTime(first) ? undefined : 'desc') };
        break;
      case 'line':
      case 'area':
        enc = { ...base, x: first };
        break;
      case 'combo':
        enc = { ...base, x: first, measures: ms.slice(0, 2) };
        break;
      case 'multiline':
      case 'stackedarea':
      case 'stackedbar':
      case 'groupedbar':
        enc = { ...base, x: first, series: second };
        if (card(second) > RECO.CAP.color)
          warn = `${WC.byId[second].title} has ${card(second)} values but only ${RECO.CAP.color} colours are distinguishable. Switch to Small multiples or set Top N.`;
        break;
      case 'facet':
        enc = {
          ...base,
          x: first,
          facet: second || undefined,
          facetMeasures: !second,
          inner: t ? 'line' : 'bar',
        };
        if (card(second) > RECO.CAP.facet)
          warn = `${card(second)} panels: shown ${RECO.CAP.facet} per page.`;
        break;
      case 'heatmap':
        enc = { ...base, x: first, y: second };
        break;
      case 'pivot':
        enc = { ...base, x: second || first, series: second ? first : undefined };
        break;
      case 'scatter':
      case 'parallel':
        enc = { ...base, x: first };
        break;
      default:
        enc = { ...base, x: first };
    }
    if (type === 'pie' && card(first) > RECO.CAP.pie)
      warn = `${card(first)} slices is too many for a donut (≤ ${RECO.CAP.pie}). A sorted bar compares them better.`;
    return { type, enc, warn, rec };
  }

  function create(container, props) {
    const S = {
      spec: JSON.parse(JSON.stringify(props.spec)),
      tab: 'data',
      drawer: 'results',
      gallery: null,
      gcat: 'recommended',
      gq: '',
      picker: null,
      menu: null,
      pointer: [0, 0],
      why: false,
      drill: [],
      rows: null,
      size: props.tileSize ? 'actual' : 'fit',
    };
    let hist = [JSON.stringify(props.spec)],
      hidx = 0;
    const sp = () => S.spec,
      o = () => S.spec.options;

    const fieldList = () => {
      const groups = {};
      fieldsOf(sp().source).forEach((f) => (groups[f.cube] ||= []).push(f));
      const used = new Set(
        [...sp().metrics, ...sp().dimensions, sp().time && sp().time.id].filter(Boolean),
      );
      const srcCubes = SOURCES[sp().source].cubes;
      return Object.entries(groups)
        .map(
          ([cube, fs]) =>
            `<div class="tgroup"><div class="tgroup-head">${esc(cube)}${srcCubes && cube !== srcCubes[0] ? '<span class="count">via join</span>' : `<span class="count">${fs.length}</span>`}</div>${fs.map((f) => `<div class="frow ${used.has(f.id) ? 'used' : ''}" draggable="true" data-field="${f.id}" data-addf="${f.id}" title="${esc(f.desc)} · click to add" role="button" tabindex="0">${UI.ficon(f)}<span class="fname">${esc(f.title)}</span><span class="fmeta">${f.role === 'measure' ? f.type : f.type === 'time' ? 'time' : WC.cardinality(f.id)}</span></div>`).join('')}</div>`,
        )
        .join('');
    };
    const pills = (key, ids) =>
      ids
        .map((id, i) => {
          const m = WC.byId[id];
          return `<span class="pill ${m.role === 'measure' ? 'measure' : 'dim'}">${esc(m.title)}${m.role === 'measure' ? ` <span class="agg">${m.type}</span>` : ''}${key === 'dimensions' && i === 0 && !sp().time ? ' <span class="agg">X</span>' : ''}<button data-rm="${key}:${i}" aria-label="Remove ${esc(m.title)}">×</button></span>`;
        })
        .join('');
    const dropZone = (key, label, hint, content) =>
      `<div class="field"><span class="lbl">${label}</span><div class="well" data-zone="${key}" style="min-height:36px">${content}<button class="addbtn" data-pick="${key}" aria-haspopup="true">+ ${hint}</button>${S.picker === key ? picker(key) : ''}</div></div>`;
    const picker = (key) => {
      const role = key === 'metrics' ? 'measure' : 'dim';
      const fs = fieldsOf(sp().source).filter(
        (f) =>
          (role === 'measure' ? f.role === 'measure' : f.role !== 'measure') &&
          (key !== 'time' || f.type === 'time') &&
          (key !== 'dimensions' || f.type !== 'time'),
      );
      return `<div class="picker" role="menu">${fs.map((f) => `<button role="menuitem" data-choosef="${key}:${f.id}">${UI.ficon(f)}${esc(f.title)}</button>`).join('') || '<div class="xs muted" style="padding:6px">Nothing to add from this source</div>'}</div>`;
    };

    function typeCard(res) {
      const T = RECO.TYPES,
        cur = sp().type,
        eff = res.type || (res.rec.top && res.rec.top.type);
      const quick = [
        ...new Set(
          [res.rec.top && res.rec.top.type, ...res.rec.runners.map((r) => r.type)].filter(Boolean),
        ),
      ].slice(0, 5);
      return `<div class="field"><span class="lbl">Chart type</span>
        <button class="reco-row" data-gallery aria-haspopup="dialog" style="align-items:center"><span class="ico">${eff ? T[eff].icon : ''}</span><span><span class="reco-name">${cur === 'auto' ? `Auto · ${eff ? T[eff].label : 'waiting for fields'}` : T[cur].label}</span><br><span class="reco-why">${cur === 'auto' ? 'Picked by the recommender; changes as you add fields' : 'Chosen manually'} · Change…</span></span></button>
        <div style="display:flex;gap:4px;flex-wrap:wrap">${cur !== 'auto' ? '<button class="btn sm" data-settype="auto">Auto</button>' : ''}${quick.map((k) => `<button class="btn sm" data-settype="${k}" title="${esc(T[k].label)}" aria-pressed="${eff === k}" style="${eff === k ? 'background:var(--accent-soft);color:var(--accent);border-color:var(--accent)' : ''}">${T[k].icon}</button>`).join('')}<span class="xs muted" style="align-self:center">Suggested for these fields</span></div></div>`;
    }

    function dataTab(res) {
      const s = sp(),
        times = fieldsOf(s.source).filter((f) => f.type === 'time');
      const recBanner =
        s.type !== 'auto' && res.rec.top && res.rec.top.type !== res.type
          ? `<div class="pinned" style="align-items:flex-start"><span class="ico">${RECO.TYPES[res.rec.top.type].icon}</span><span style="flex:1"><b>Recommended: ${RECO.TYPES[res.rec.top.type].label}</b><br><span class="xs sec">${esc(res.rec.top.why)}</span></span><button class="btn sm" data-settype="${res.rec.top.type}">Use</button></div>`
          : '';
      return `<div class="section">
          <div class="field"><label for="src-${props.mode}">Cube or view</label><select id="src-${props.mode}" class="select sm mono" data-src>${[
            'View',
            'Cube',
          ]
            .map(
              (k) =>
                `<optgroup label="${k}s">${Object.entries(SOURCES)
                  .filter(([, v]) => v.kind === k)
                  .map(
                    ([key, v]) =>
                      `<option value="${key}" ${s.source === key ? 'selected' : ''}>${v.label}</option>`,
                  )
                  .join('')}</optgroup>`,
            )
            .join('')}</select></div>
          ${typeCard(res)}${recBanner}
          ${res.need ? `<div class="warnbar" style="border-radius:6px">${SV.warn}<span>${esc(res.need)}</span></div>` : ''}${res.warn ? `<div class="warnbar" style="border-radius:6px">${SV.warn}<span>${esc(res.warn)}</span></div>` : ''}
        </div>
        <div class="section">
          ${dropZone('metrics', 'Metrics', 'metric', pills('metrics', s.metrics))}
          ${dropZone('dimensions', 'Dimensions (group by)', 'dimension', pills('dimensions', s.dimensions))}
          <div class="field"><span class="lbl">Time</span><div class="row2" style="grid-template-columns:1fr auto"><select class="select sm" data-time aria-label="Time dimension"><option value="">No time dimension</option>${times.map((f) => `<option value="${f.id}" ${s.time && s.time.id === f.id ? 'selected' : ''}>${esc(f.title)}</option>`).join('')}</select>${s.time ? `<div class="seg" role="group" aria-label="Time grain">${['month', 'quarter', 'year'].map((g) => `<button data-grain="${g}" aria-pressed="${s.time.granularity === g}">${g[0].toUpperCase() + g.slice(1)}</button>`).join('')}</div>` : ''}</div></div>
          ${dropZone(
            'filters',
            'Filters',
            'filter',
            s.filters
              .map(
                (f, i) =>
                  `<span class="pill dim">${esc(WC.byId[f.id].title)} <select data-fval="${i}" aria-label="Filter value" style="border:0;background:none;color:inherit;font-size:12px;max-width:130px"><option value="">${f.exclude ? 'exclude…' : 'all'}</option>${WC.distinct(
                    f.id,
                  )
                    .map(
                      (v) =>
                        `<option ${f.values && f.values.includes(v) ? 'selected' : ''}>${esc(v)}</option>`,
                    )
                    .join(
                      '',
                    )}</select>${f.exclude ? '<span class="agg">≠</span>' : ''}<button data-rm="filters:${i}" aria-label="Remove filter">×</button></span>`,
              )
              .join(''),
          )}
          <div class="row2"><div class="field"><label>Sort by</label><select class="select sm" data-opt="sort">${[
            ['', 'Default'],
            ['desc', 'Metric, high to low'],
            ['asc', 'Metric, low to high'],
            ['label', 'Label A–Z'],
          ]
            .map(([v, l]) => `<option value="${v}" ${s.sort === v ? 'selected' : ''}>${l}</option>`)
            .join(
              '',
            )}</select></div><div class="field"><label>Top N (+ Other)</label><input class="input sm" data-optin="topK" value="${esc(s.topK || '')}" placeholder="All" inputmode="numeric"></div></div>
        </div>
        ${res.rec.trace ? `<div class="section"><button class="btn ghost sm" data-why aria-expanded="${S.why}" style="justify-self:start">${S.why ? '▾' : '▸'} Why this recommendation?</button>${S.why ? res.rec.trace.map((t) => `<div class="check" style="grid-template-columns:20px 1fr">${t.ok ? SV.ok.replace('currentColor', 'var(--ok-icon)') : SV.warn}<span class="xs">${esc(t.text)}</span></div>`).join('') : ''}</div>` : ''}`;
    }

    const sw = (k, on) =>
      `<button class="switch" role="switch" aria-checked="${!!on}" data-sw="${k}"></button>`;
    const seg = (k, vals, cur) =>
      `<div class="seg" role="group">${vals.map(([v, l]) => `<button data-seg="${k}:${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
    function customizeTab(names) {
      const x = o().x,
        y = o().y;
      return `<details class="section" open style="display:block"><summary class="strong xs sec">AXES</summary><div style="display:grid;gap:8px;margin-top:8px">
          <div class="inline"><span>X title</span>${sw('x.showTitle', x.showTitle)}</div><input class="input sm" data-optin="x.title" value="${esc(x.title || '')}" aria-label="X axis title">
          <div class="inline"><span>X label rotation</span>${seg(
            'x.rotate',
            [
              [0, '0°'],
              [45, '45°'],
              [90, '90°'],
            ],
            x.rotate || 0,
          )}</div>
          <div class="inline"><span>Y title</span>${sw('y.showTitle', y.showTitle)}</div><input class="input sm" data-optin="y.title" value="${esc(y.title || '')}" aria-label="Y axis title">
          <div class="inline"><span>Include zero</span>${sw('y.zero', y.zero)}</div><div class="inline"><span>Log scale</span>${sw('y.log', y.log)}</div><div class="inline"><span>Gridlines</span>${sw('y.grid', y.grid !== false)}</div>
          <div class="row2"><input class="input sm" data-optin="y.min" value="${esc(y.min || '')}" placeholder="Y min (auto)" aria-label="Y min"><input class="input sm" data-optin="y.max" value="${esc(y.max || '')}" placeholder="Y max (auto)" aria-label="Y max"></div></div></details>
        <details class="section" open style="display:block"><summary class="strong xs sec">LEGEND</summary><div style="display:grid;gap:8px;margin-top:8px"><div class="inline"><span>Show legend</span>${sw('legend.show', o().legend.show)}</div><div class="inline"><span>Position</span>${seg(
          'legend.pos',
          [
            ['top', 'Top'],
            ['right', 'Right'],
            ['bottom', 'Bottom'],
          ],
          o().legend.pos,
        )}</div></div></details>
        <details class="section" style="display:block"><summary class="strong xs sec">SERIES (${names.length})</summary><div style="display:grid;gap:6px;margin-top:8px">${
          names
            .map((n) => {
              const ov = o().series[n] || {};
              return `<div class="inline"><span class="xs strong" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</span><select class="select sm" style="width:auto" data-sslot="${esc(n)}" aria-label="Colour for ${esc(n)}"><option value="">Auto colour</option>${[1, 2, 3, 4, 5, 6, 7, 8].map((k) => `<option value="${k}" ${ov.slot == k ? 'selected' : ''}>Slot ${k}</option>`).join('')}</select><label class="xs"><input type="checkbox" data-sflag="${esc(n)}:hidden" ${ov.hidden ? 'checked' : ''}> Hide</label></div>`;
            })
            .join('') || '<span class="xs muted">Single series</span>'
        }<div class="inline"><span>Stack series</span>${sw('stack', o().stack !== false)}</div></div></details>
        <details class="section" style="display:block"><summary class="strong xs sec">VALUES</summary><div style="display:grid;gap:8px;margin-top:8px"><div class="inline"><span>Data labels</span>${sw('labels', o().labels)}</div><select class="select sm" data-optsel="numFmt" aria-label="Number format">${[
          ['', 'Number format: model default'],
          ['full', 'Full'],
          ['percent', 'Percent'],
        ]
          .map(
            ([v, l]) => `<option value="${v}" ${o().numFmt === v ? 'selected' : ''}>${l}</option>`,
          )
          .join('')}</select></div></details>`;
    }

    function galleryHtml(res) {
      const T = RECO.TYPES,
        recSet = new Set(
          [res.rec.top && res.rec.top.type, ...res.rec.runners.map((r) => r.type)].filter(Boolean),
        );
      let list =
        S.gcat === 'recommended'
          ? [...recSet]
          : S.gcat === 'all'
            ? Object.keys(T)
            : (CATS.find((c) => c[0] === S.gcat) || [0, 0, []])[2];
      if (S.gq)
        list = Object.keys(T).filter((k) =>
          (T[k].label + ' ' + DESC[k]).toLowerCase().includes(S.gq.toLowerCase()),
        );
      return `<div role="dialog" aria-modal="true" aria-label="Choose chart type" style="position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.35);display:grid;place-items:center" data-gclose-bg>
        <div style="width:min(920px,94vw);height:min(600px,90vh);background:var(--bg-raised);border-radius:8px;box-shadow:var(--shadow-pop);display:grid;grid-template-columns:220px 1fr;grid-template-rows:auto 1fr auto;overflow:hidden">
          <div style="grid-column:1/-1;display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-subtle)"><h2 style="margin:0;font-size:16px">Choose chart type</h2><input class="input sm" data-gq placeholder="Search chart types" value="${esc(S.gq)}" style="max-width:280px" aria-label="Search chart types"><span style="flex:1"></span><button class="btn sm" data-gclose>Close</button></div>
          <nav style="border-right:1px solid var(--border-subtle);padding:8px;overflow:auto" aria-label="Categories">${[['recommended', `Recommended (${recSet.size})`], ['all', 'All charts'], ...CATS.map((c) => [c[0], c[1]])].map(([k, l]) => `<button class="file" data-gcat="${k}" aria-current="${S.gcat === k && !S.gq}" style="font-family:var(--font-ui)">${l}</button>`).join('')}</nav>
          <div style="padding:12px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;align-content:start">${
            list
              .map((k) => {
                const need = NEEDS[k];
                const r = recSet.has(k);
                return `<button class="card" data-settype="${k}" style="text-align:left;padding:12px;display:grid;gap:6px;cursor:pointer;${sp().type === k ? 'border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)' : ''}"><span style="display:flex;justify-content:space-between;align-items:center"><span style="transform:scale(1.8);transform-origin:left;color:var(--accent);height:28px;display:inline-flex;align-items:center">${T[k].icon}</span>${r ? '<span class="badge accent">Suggested</span>' : ''}</span><span class="strong" style="font-size:13px">${T[k].label}</span><span class="xs sec">${DESC[k]}</span><span class="xs muted">Needs ${need[0]} metric${need[0] === 1 ? '' : 's'}${need[1] ? ` + ${need[1]} dimension${need[1] > 1 ? 's' : ''}` : ''}${need[2] ? ' (time)' : ''}</span></button>`;
              })
              .join('') || '<span class="sec">No chart types match.</span>'
          }</div>
          <div style="grid-column:1/-1;display:flex;gap:8px;align-items:center;padding:10px 16px;border-top:1px solid var(--border-subtle)"><span class="xs muted" style="flex:1">"Suggested" comes from the recommender for your current fields. You can pick any type and then add the fields it needs.</span><button class="btn sm" data-settype="auto">Use Auto</button></div>
        </div></div>`;
    }

    function render() {
      const cur = JSON.stringify(S.spec);
      if (cur !== hist[hidx]) {
        hist = hist.slice(0, hidx + 1);
        hist.push(cur);
        hidx = hist.length - 1;
      }
      const s = sp(),
        res = encode(s),
        overlay = props.mode === 'overlay';
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface);grid-column:1/-1">
          ${overlay ? `<button class="btn sm" data-back title="Apply and return (Esc)">${esc(props.backLabel || '← Back to dashboard')}</button>` : ''}
          <input class="input" data-title value="${esc(s.title)}" aria-label="Chart title" style="max-width:420px;font-weight:600;font-size:15px;border-color:transparent;background:transparent">
          <span id="ed-badges"></span>${props.note ? `<span class="xs ${props.noteWarn ? 'status warn' : 'muted'}" style="display:inline-flex;gap:4px;align-items:center">${props.noteWarn ? UI.STATUS_SVG.warn : ''}${esc(props.note)}</span>` : ''}${props.noteAction ? `<button class="btn ghost sm" data-noteaction>${esc(props.noteAction.label)}</button>` : ''}<span style="flex:1"></span>
          ${overlay ? `<button class="iconbtn" data-eundo aria-label="Undo" title="Undo" ${hidx ? '' : 'disabled style="opacity:.4"'}>↶</button><button class="iconbtn" data-eredo aria-label="Redo" title="Redo" ${hidx < hist.length - 1 ? '' : 'disabled style="opacity:.4"'}>↷</button><button class="btn sm" data-cancel title="Revert this chart to how it was when the editor opened">Discard changes</button>${props.onSaveDashboard ? '<button class="btn primary sm" data-savedash>Save dashboard</button>' : '<button class="btn primary sm" data-apply>Apply</button>'}` : '<button class="btn sm" data-todash>Add to dashboard</button><button class="btn primary sm">Save chart</button>'}
        </div>
        <aside class="pane left" aria-label="Fields"><div class="pane-head"><h2>${esc(SOURCES[s.source].kind)}: <span class="mono">${esc(SOURCES[s.source].label)}</span></h2></div><div class="tree-search"><input class="input sm" placeholder="Search fields" aria-label="Search fields"></div><div class="pane-body">${fieldList()}</div></aside>
        <section class="center" aria-label="Preview">
          <div class="canvas-wrap" style="grid-template-rows:auto 1fr">
            <div class="canvas-tool">${S.drill.length ? `<span class="xs"><button class="btn ghost sm" data-undrill="0">All</button>${S.drill.map((d, i) => ` › <button class="btn ghost sm" data-undrill="${i + 1}">${esc(WC.byId[d.dim].title)}: ${esc(d.value)}</button>`).join('')}</span>` : `<span class="xs muted">${res.type ? `Showing ${RECO.TYPES[res.type].label}${s.type === 'auto' ? ' (auto)' : ''}` : ''} · click a mark to drill or filter</span>`}</div>
            <div style="display:grid;place-items:center;min-height:0;overflow:auto">${props.tileSize ? `<div class="seg" role="group" aria-label="Preview size" style="justify-self:end;margin-bottom:6px"><button data-psize="actual" aria-pressed="${S.size === 'actual'}">Actual size (${props.tileSize.w}/12)</button><button data-psize="fit" aria-pressed="${S.size === 'fit'}">Fit</button></div>` : ''}<div class="tile" style="${S.size === 'actual' && props.tileSize ? `width:${Math.round((props.tileSize.w / 12) * 1392 - 16)}px;max-width:100%;height:${props.tileSize.h * 8}px` : 'width:100%;height:100%;min-height:240px'}"><div class="chart" id="ed-chart" style="height:100%"></div></div></div>
          </div>
          <div class="drawer"><div class="tabs" role="tablist">${[
            ['results', 'Results'],
            ['rows', 'Underlying rows'],
            ['query', 'Cube query'],
          ]
            .map(
              ([k, l]) =>
                `<button role="tab" data-drawer="${k}" aria-selected="${S.drawer === k}">${l}</button>`,
            )
            .join('')}</div><div class="drawer-body" id="ed-drawer"></div></div>
        </section>
        <aside class="pane right" aria-label="Chart settings"><div class="tabs" role="tablist">${[
          ['data', 'Data'],
          ['customize', 'Customize'],
        ]
          .map(
            ([k, l]) =>
              `<button role="tab" data-etab="${k}" aria-selected="${S.tab === k}">${l}</button>`,
          )
          .join('')}</div><div class="pane-body" id="ed-insp"></div></aside>
        ${S.gallery ? galleryHtml(res) : ''}
        ${S.menu ? `<div class="picker" role="menu" style="position:fixed;left:${S.pointer[0]}px;top:${S.pointer[1]}px;width:250px;z-index:90"><div class="xs strong" style="padding:4px 6px">${esc(WC.byId[S.menu.dim].title)}: ${esc(S.menu.value)}</div>${S.menu.dim === 'products.category' ? '<button role="menuitem" data-act="drill">Drill into Product</button>' : ''}<button role="menuitem" data-act="keep">Keep only</button><button role="menuitem" data-act="exclude">Exclude</button><button role="menuitem" data-act="rows">View underlying rows</button></div>` : ''}`;
      const chartEl = container.querySelector('#ed-chart');
      const filters = s.filters
        .filter((f) => f.values && f.values.length)
        .map((f) => ({ id: f.id, values: f.values, exclude: f.exclude }));
      let names = [];
      if (res.type) {
        const r = CH.render(
          chartEl,
          res.enc,
          res.type,
          {
            ...o(),
            onSelect: (dim, value) => {
              S.menu = { dim, value };
              render();
            },
          },
          filters,
        );
        names = res.enc.series
          ? [...new Set(r.rows.map((x) => x[res.enc.series]))]
          : res.enc.measures.map((m) => WC.byId[m].title);
        container.querySelector('#ed-badges').innerHTML =
          `${r.preAgg ? `<span class="badge ok">${SV.ok} Pre-aggregation</span>` : '<span class="badge">Raw query</span>'} <span class="badge tnum">${r.rows.length} rows · ${r.ms} ms</span>`;
        const d = container.querySelector('#ed-drawer');
        if (S.drawer === 'results') {
          const cols = Object.keys(r.rows[0] || {});
          d.innerHTML = `<table class="grid-table"><thead><tr>${cols.map((c) => `<th class="${WC.byId[c].role === 'measure' ? 'num' : ''}">${esc(WC.byId[c].title)}</th>`).join('')}</tr></thead><tbody>${r.rows
            .slice(0, 100)
            .map(
              (row) =>
                `<tr>${cols.map((c) => `<td class="${WC.byId[c].role === 'measure' ? 'num' : ''}">${WC.byId[c].role === 'measure' ? WC.fmt(row[c], WC.byId[c].fmt) : esc(row[c])}</td>`).join('')}</tr>`,
            )
            .join('')}</tbody></table>`;
        } else if (S.drawer === 'rows') {
          const u = WC.underlying([
            ...filters,
            ...(S.rows ? [{ id: S.rows.dim, values: [S.rows.value] }] : []),
          ]);
          d.innerHTML = `<div class="xs sec" style="padding:6px 12px">${u.total.toLocaleString()} line items · first 200</div><table class="grid-table"><thead><tr><th>Order</th><th>Date</th><th>Product</th><th>Category</th><th class="num">Revenue</th></tr></thead><tbody>${u.rows.map((x) => `<tr><td class="mono">${x.order_id}</td><td>${x.order_date}</td><td>${esc(x.product)}</td><td>${esc(x.category)}</td><td class="num">${WC.fmt(x.revenue, 'currency')}</td></tr>`).join('')}</tbody></table>`;
        } else
          d.innerHTML = `<pre class="mono" style="margin:0;padding:12px">${esc(JSON.stringify({ measures: s.metrics, dimensions: s.dimensions, timeDimensions: s.time ? [{ dimension: s.time.id, granularity: s.time.granularity }] : [], filters: filters.map((f) => ({ member: f.id, operator: f.exclude ? 'notEquals' : 'equals', values: f.values })), limit: 5000 }, null, 2))}</pre>`;
      } else
        chartEl.innerHTML = `<div style="height:100%;display:grid;place-items:center;text-align:center" class="sec"><div><div class="strong" style="font-size:16px;color:var(--text-primary)">${esc(res.need || 'Pick a chart type and fields')}</div><p class="xs" style="margin:4px 0 0">Click fields on the left, or use the + buttons under Metrics and Dimensions.</p></div></div>`;
      container.querySelector('#ed-insp').innerHTML =
        S.tab === 'data' ? dataTab(res) : customizeTab(names);
    }

    const setp = (obj, p, v) => {
      const ks = p.split('.');
      let a = obj;
      ks.slice(0, -1).forEach((k) => (a = a[k] ||= {}));
      a[ks.at(-1)] = v;
    };
    const getp = (obj, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), obj);
    function addField(key, id) {
      const s = sp(),
        f = WC.byId[id];
      if (!key) key = f.role === 'measure' ? 'metrics' : f.type === 'time' ? 'time' : 'dimensions';
      if (key === 'time') s.time = { id, granularity: 'month' };
      else if (key === 'filters') s.filters.push({ id, values: [] });
      else if (key === 'metrics' && f.role === 'measure' && !s.metrics.includes(id))
        s.metrics.push(id);
      else if (key === 'dimensions' && f.role !== 'measure') {
        if (f.type === 'time') s.time = { id, granularity: 'month' };
        else if (!s.dimensions.includes(id)) s.dimensions.push(id);
      }
    }
    function act(kind) {
      const { dim, value } = S.menu,
        s = sp();
      S.menu = null;
      if (kind === 'keep' || kind === 'exclude')
        s.filters = [
          ...s.filters.filter((f) => f.id !== dim),
          { id: dim, values: [value], exclude: kind === 'exclude' },
        ];
      if (kind === 'drill') {
        S.drill.push({ dim, value, prev: s.dimensions.slice() });
        s.filters = [...s.filters.filter((f) => f.id !== dim), { id: dim, values: [value] }];
        s.dimensions = s.dimensions.map((d) => (d === dim ? 'products.product_name' : d));
        if (!s.dimensions.includes('products.product_name'))
          s.dimensions.unshift('products.product_name');
      }
      if (kind === 'rows') {
        S.rows = { dim, value };
        S.drawer = 'rows';
      }
      render();
    }

    container.addEventListener('pointerdown', (e) => {
      S.pointer = [Math.min(e.clientX, innerWidth - 260), Math.min(e.clientY, innerHeight - 170)];
    });
    container.addEventListener('dragstart', (e) => {
      const r = e.target.closest('[data-field]');
      if (!r) return;
      e.dataTransfer.setData('text/plain', r.dataset.field);
      container.querySelectorAll('[data-zone]').forEach((z) => {
        const f = WC.byId[r.dataset.field];
        const ok = z.dataset.zone === 'metrics' ? f.role === 'measure' : f.role !== 'measure';
        z.classList.add(ok ? 'legal' : 'illegal');
        if (!ok)
          z.dataset.reason =
            z.dataset.zone === 'metrics' ? `${f.title} is a dimension` : `${f.title} is a metric`;
      });
    });
    container.addEventListener('dragend', () =>
      container.querySelectorAll('[data-zone]').forEach((z) => {
        z.classList.remove('legal', 'illegal', 'over');
        delete z.dataset.reason;
      }),
    );
    container.addEventListener('dragover', (e) => {
      const z = e.target.closest('[data-zone].legal');
      if (z) {
        e.preventDefault();
        z.classList.add('over');
      }
    });
    container.addEventListener('drop', (e) => {
      const z = e.target.closest('[data-zone].legal');
      if (!z) return;
      e.preventDefault();
      addField(z.dataset.zone, e.dataTransfer.getData('text/plain'));
      render();
    });
    container.addEventListener('click', (e) => {
      if (e.target.matches('[data-gclose-bg]')) {
        S.gallery = null;
        return render();
      }
      const t = e.target.closest('button, [data-addf]');
      if (!t) {
        if (
          (S.picker || S.menu) &&
          !e.target.closest('.picker') &&
          !e.target.closest('#ed-chart')
        ) {
          S.picker = null;
          S.menu = null;
          render();
        }
        return;
      }
      const d = t.dataset,
        s = sp();
      if (d.addf && !t.matches('button')) {
        addField(null, d.addf);
        return render();
      }
      if ('gallery' in d) {
        S.gallery = true;
        S.gq = '';
        S.gcat = 'recommended';
        return render();
      }
      if ('gclose' in d) {
        S.gallery = null;
        return render();
      }
      if (d.gcat) {
        S.gcat = d.gcat;
        S.gq = '';
        return render();
      }
      if (d.settype) {
        s.type = d.settype;
        S.gallery = null;
        return render();
      }
      if (d.pick) {
        S.picker = S.picker === d.pick ? null : d.pick;
        return render();
      }
      if (d.choosef) {
        const [k, id] = d.choosef.split(':');
        S.picker = null;
        addField(k, id);
        return render();
      }
      if (d.rm) {
        const [k, i] = d.rm.split(':');
        s[k].splice(+i, 1);
        return render();
      }
      if (d.grain) {
        s.time.granularity = d.grain;
        return render();
      }
      if (d.etab) {
        S.tab = d.etab;
        return render();
      }
      if (d.drawer) {
        S.drawer = d.drawer;
        if (d.drawer !== 'rows') S.rows = null;
        return render();
      }
      if ('why' in d) {
        S.why = !S.why;
        return render();
      }
      if (d.act) return act(d.act);
      if (d.undrill != null) {
        const n = +d.undrill;
        while (S.drill.length > n) {
          const x = S.drill.pop();
          s.dimensions = x.prev;
          s.filters = s.filters.filter((f) => f.id !== x.dim);
        }
        return render();
      }
      if (d.sw) {
        setp(o(), d.sw, !getp(o(), d.sw));
        return render();
      }
      if (d.seg) {
        const [k, v] = d.seg.split(':');
        setp(o(), k, isNaN(+v) ? v : +v);
        return render();
      }
      if ('eundo' in d && hidx > 0) {
        hidx--;
        S.spec = JSON.parse(hist[hidx]);
        return render();
      }
      if ('eredo' in d && hidx < hist.length - 1) {
        hidx++;
        S.spec = JSON.parse(hist[hidx]);
        return render();
      }
      if (d.psize) {
        S.size = d.psize;
        return render();
      }
      if ('noteaction' in d) {
        props.noteAction.run(JSON.parse(JSON.stringify(s)));
        return render();
      }
      if ('savedash' in d) return props.onSaveDashboard(JSON.parse(JSON.stringify(s)));
      if ('apply' in d || 'back' in d)
        return props.onApply && props.onApply(JSON.parse(JSON.stringify(s)));
      if ('cancel' in d) return props.onCancel && props.onCancel();
      if ('todash' in d)
        return props.onToDashboard && props.onToDashboard(JSON.parse(JSON.stringify(s)));
    });
    container.addEventListener('keydown', (e) => {
      const r = e.target.closest('[data-addf]');
      if (r && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        addField(null, r.dataset.addf);
        render();
      }
      if (e.key === 'Escape') {
        if (S.gallery || S.picker || S.menu) {
          S.gallery = null;
          S.picker = null;
          S.menu = null;
          render();
        } else if (props.mode === 'overlay' && props.onApply)
          props.onApply(JSON.parse(JSON.stringify(sp())));
      }
    });
    container.addEventListener('input', (e) => {
      if ('gq' in e.target.dataset) {
        S.gq = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const q = container.querySelector('[data-gq]');
        q.focus();
        q.setSelectionRange(pos, pos);
      }
    });
    container.addEventListener('change', (e) => {
      const d = e.target.dataset,
        s = sp();
      if ('src' in d) {
        s.source = e.target.value;
        const ok = new Set(fieldsOf(s.source).map((f) => f.id));
        s.metrics = s.metrics.filter((m) => ok.has(m));
        s.dimensions = s.dimensions.filter((m) => ok.has(m));
        if (s.time && !ok.has(s.time.id)) s.time = null;
        return render();
      }
      if ('time' in d) {
        s.time = e.target.value
          ? { id: e.target.value, granularity: (s.time && s.time.granularity) || 'month' }
          : null;
        return render();
      }
      if (d.fval != null) {
        s.filters[+d.fval].values = e.target.value ? [e.target.value] : [];
        return render();
      }
      if (d.opt) {
        s[d.opt] = e.target.value;
        return render();
      }
      if (d.optin) {
        if (d.optin === 'topK') s.topK = e.target.value;
        else setp(o(), d.optin, e.target.value);
        return render();
      }
      if (d.optsel) {
        o()[d.optsel] = e.target.value;
        return render();
      }
      if (d.sslot) {
        (o().series[d.sslot] ||= {}).slot = e.target.value ? +e.target.value : undefined;
        return render();
      }
      if (d.sflag) {
        const [n, k] = d.sflag.split(':');
        (o().series[n] ||= {})[k] = e.target.checked;
        return render();
      }
      if ('title' in d) {
        s.title = e.target.value;
      }
    });
    render();
    return { render, spec: () => sp() };
  }

  const DEFAULT_OPTIONS = () => ({
    legend: { show: true, pos: 'top' },
    x: { rotate: 0, showTitle: false, title: '' },
    y: { zero: true, log: false, grid: true, showTitle: false, title: '', min: '', max: '' },
    labels: false,
    numFmt: '',
    series: {},
    stack: true,
  });
  const newSpec = (over = {}) => ({
    title: 'Untitled chart',
    source: 'view:sales',
    type: 'auto',
    time: null,
    metrics: [],
    dimensions: [],
    filters: [],
    sort: '',
    topK: '',
    options: DEFAULT_OPTIONS(),
    ...over,
  });
  window.CHART_EDITOR = { create, encode, newSpec, SOURCES };
})();
