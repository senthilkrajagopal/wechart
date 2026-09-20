/* wechart prototype: Cube model editor v2 — YAML code + schema-driven form + join diagram, kept in sync. */
(function () {
  const { SCHEMA: SC, TABS, TEMPLATES, shapeOf } = window.SCHEMA;
  const FILES = window.MODEL_FILES;
  const S = {
    file: 'model/cubes/orders.yml',
    tab: '__root',
    open: new Set(['dimensions:1']),
    doc: null,
    error: null,
    problems: [],
    acceptedLossy: {},
    cm: null,
    center: 'code',
  };
  let root,
    formEl,
    probEl,
    debounce,
    suppress = false;

  /* ---------- helpers ---------- */
  const get = (o, p) => (p ? p.split('.').reduce((a, k) => (a == null ? a : a[k]), o) : o);
  const set = (o, p, v) => {
    const ks = p.split('.');
    let a = o;
    ks.slice(0, -1).forEach((k, i) => {
      if (a[k] == null || typeof a[k] !== 'object') a[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
      a = a[k];
    });
    const last = ks.at(-1);
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) {
      if (Array.isArray(a)) a.splice(+last, 1);
      else delete a[last];
    } else a[last] = v;
    prune(o);
  };
  const prune = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      prune(o[k]);
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && !Object.keys(o[k]).length)
        delete o[k];
    }
  };
  const rootKind = () => (S.doc && S.doc.views ? 'view' : 'cube');
  const obj = () => (S.doc && (S.doc.cubes || S.doc.views || [])[0]) || null;
  const lossy = (text) => {
    const c = (text.match(/^\s*#/gm) || []).length;
    const j = /\{\{|\{%/.test(text);
    const a = /(^|\s)[&*][A-Za-z][\w-]*/.test(text);
    return [
      c && `${c} comment${c > 1 ? 's' : ''}`,
      j && 'Jinja blocks',
      a && 'YAML anchors',
    ].filter(Boolean);
  };
  const readOnly = () =>
    !!S.error || (lossy(S.cm.getValue()).length > 0 && !S.acceptedLossy[S.file]);

  function index() {
    const cubes = {};
    for (const [path, text] of Object.entries(FILES)) {
      try {
        const d = jsyaml.load(text) || {};
        (d.cubes || []).forEach((c) => {
          cubes[c.name] = {
            path,
            dims: (c.dimensions || []).map((x) => x.name),
            time: (c.dimensions || []).filter((x) => x.type === 'time').map((x) => x.name),
            measures: (c.measures || []).map((x) => x.name),
            segments: (c.segments || []).map((x) => x.name),
            preaggs: (c.pre_aggregations || []).map((x) => x.name),
            joins: (c.joins || []).map((j) => ({ to: j.name, rel: j.relationship })),
          };
        });
      } catch (e) {
        /* unparsable file */
      }
    }
    return cubes;
  }
  function options(scope, context) {
    const idx = index(),
      me = obj() || {},
      own = idx[me.name] || { dims: [], measures: [], time: [], segments: [], preaggs: [] };
    const q = (kind) =>
      Object.entries(idx)
        .filter(([n]) => n !== me.name)
        .flatMap(([n, c]) => c[kind].map((m) => `${n}.${m}`));
    switch (scope) {
      case 'local':
        return [...own.dims, ...own.measures];
      case 'dims':
        return [...own.dims, ...q('dims')];
      case 'measures':
        return [...own.measures, ...q('measures')];
      case 'time':
        return [...own.time, ...q('time')];
      case 'segments':
        return own.segments;
      case 'preaggs':
        return own.preaggs;
      case 'cubes':
        return Object.keys(idx).filter((n) => n !== me.name);
      case 'pathcube': {
        const c = idx[(context.join_path || '').split('.').pop()];
        return c ? [...c.dims, ...c.measures] : [];
      }
      default:
        return [...own.dims, ...own.measures, ...q('dims'), ...q('measures')];
    }
  }

  /* ---------- field renderer ---------- */
  /** Short fields flow two per row in the wide form; SQL, lists, pickers and nested objects span the full width. */
  function field(f, o, base, ro) {
    const html = fieldRaw(f, o, base, ro);
    return ['sql', 'json', 'list', 'refs', 'obj', 'shape'].includes(f.t) || f.area
      ? html.replace('class="field"', 'class="field wide"')
      : html;
  }
  function fieldRaw(f, o, base, ro) {
    if (f.show && !f.show(o)) return '';
    const path = base ? `${base}.${f.k}` : f.k;
    const v = get(o, f.k);
    const dis = ro ? 'disabled' : '';
    const hint = f.hintBy ? f.hintBy(o) : f.hint;
    const lab = `<label>${UI.esc(f.label)}${f.req ? ' <span style="color:var(--err)" aria-label="required">*</span>' : ''}</label>`;
    const help = hint ? `<span class="xs muted">${UI.esc(hint)}</span>` : '';
    switch (f.t) {
      case 'text':
        return `<div class="field">${lab}${f.area ? `<textarea class="input" style="font-family:var(--font-ui);font-size:13px" rows="2" data-path="${path}" ${dis}>${UI.esc(v ?? '')}</textarea>` : `<input class="input sm ${f.mono ? 'mono' : ''}" data-path="${path}" ${f.list ? 'data-list="1"' : ''} value="${UI.esc(Array.isArray(v) ? v.join(', ') : (v ?? ''))}" placeholder="${UI.esc(f.ph || '')}" ${dis}>`}${help}</div>`;
      case 'sql':
        return `<div class="field">${lab}<textarea class="input" rows="2" data-path="${path}" spellcheck="false" ${dis}>${UI.esc(v ?? '')}</textarea>${help}</div>`;
      case 'enum': {
        const opts = f.optsBy ? f.optsBy(o) : f.opts;
        const cur = v ?? f.def ?? '';
        return `<div class="field">${lab}<select class="select sm" data-path="${path}" ${dis}>${opts.map((x) => `<option value="${UI.esc(x)}" ${String(x) === String(cur) ? 'selected' : ''}>${x || '(not set)'}</option>`).join('')}${cur !== '' && !opts.includes(cur) ? `<option selected>${UI.esc(cur)}</option>` : ''}</select>${help}</div>`;
      }
      case 'bool': {
        const on = v == null ? !!f.def : !!v;
        return `<div class="inline"><span>${UI.esc(f.label)}</span><button class="switch" role="switch" aria-checked="${on}" aria-label="${UI.esc(f.label)}" data-toggle="${path}" data-def="${!!f.def}" ${dis}></button></div>${hint ? `<div class="xs muted" style="margin-top:-4px">${UI.esc(hint)}</div>` : ''}`;
      }
      case 'ref': {
        const opts = options(f.scope, o);
        return `<div class="field">${lab}<select class="select sm mono" data-path="${path}" ${dis}><option value="">(not set)</option>${[...new Set([...opts, ...(v ? [v] : [])])].map((x) => `<option ${x === v ? 'selected' : ''}>${UI.esc(x)}</option>`).join('')}</select>${help}</div>`;
      }
      case 'refs': {
        const opts = [...new Set([...options(f.scope, o), ...(Array.isArray(v) ? v : [])])];
        const star = f.star && (v === '*' || v == null);
        return `<div class="field"><span class="lbl">${UI.esc(f.label)}</span><div style="display:flex;flex-wrap:wrap;gap:4px">${f.star ? `<button class="btn sm" data-refstar="${path}" aria-pressed="${star}" ${dis} style="${star ? 'background:var(--accent-soft);color:var(--accent);border-color:var(--accent)' : ''}">All (*)</button>` : ''}${
          opts
            .map((x) => {
              const i = Array.isArray(v) ? v.indexOf(x) : -1;
              const on = i >= 0;
              return `<button class="btn sm mono" data-ref="${path}" data-val="${UI.esc(x)}" aria-pressed="${on}" ${dis} style="${on ? 'background:var(--accent-soft);color:var(--accent);border-color:var(--accent)' : ''}">${f.ordered && on ? `<b>${i + 1}</b> ` : ''}${UI.esc(x)}</button>`;
            })
            .join('') || '<span class="xs muted">No members available in scope</span>'
        }</div>${help}</div>`;
      }
      case 'json':
        return `<div class="field">${lab}<textarea class="input" rows="3" data-path="${path}" data-json="1" spellcheck="false" ${dis}>${v == null ? '' : UI.esc(jsyaml.dump(v).trim())}</textarea>${help}</div>`;
      case 'shape':
        return `<div class="field"><span class="lbl">${UI.esc(f.label)}</span><div class="seg" role="group">${f.opts.map(([k, l]) => `<button data-shape="${base}" data-val="${k}" aria-pressed="${shapeOf(o) === k}" ${dis}>${l}</button>`).join('')}</div></div>`;
      case 'obj':
        return `<div class="field" style="border-left:2px solid var(--border-subtle);padding-left:8px"><span class="lbl">${UI.esc(f.label)}</span>${f.fields.map((sf) => field(sf, v || {}, path, ro)).join('')}</div>`;
      case 'list': {
        const items = Array.isArray(v) ? v : [];
        return `<div class="field"><span class="lbl">${UI.esc(f.label)} <span class="muted" style="font-weight:400">(${items.length})</span></span>${items.map((it, i) => `<div style="border:1px solid var(--border-subtle);border-radius:6px;padding:8px;display:grid;gap:6px;background:var(--bg-surface)"><div style="display:flex;align-items:center"><span class="xs strong" style="flex:1">${UI.esc(f.item)} ${i + 1}${it && it.name ? `: <span class="mono">${UI.esc(it.name)}</span>` : ''}</span><button class="btn ghost sm" data-listdel="${path}" data-i="${i}" ${dis} aria-label="Remove ${f.item} ${i + 1}">Remove</button></div>${f.fields.map((sf) => field(sf, it || {}, `${path}.${i}`, ro)).join('')}</div>`).join('')}<div><button class="btn sm" data-listadd="${path}" ${dis}>+ ${UI.esc(f.item)}</button></div>${help}</div>`;
      }
      default:
        return '';
    }
  }
  function groupsHtml(spec, o, base, ro) {
    return spec.groups
      .filter((g) => !g.show || g.show(o))
      .map(
        (g) =>
          `<details class="section" ${g.collapsed ? '' : 'open'} style="display:block"><summary class="strong xs sec" style="cursor:pointer;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">${UI.esc(g.g)}</summary><div class="formgrid">${g.fields.map((f) => field(f, o, base, ro)).join('')}</div></details>`,
      )
      .join('');
  }
  function knownKeys(spec) {
    return new Set(spec.groups.flatMap((g) => g.fields.map((f) => f.k.split('.')[0])));
  }
  function passThrough(spec, o) {
    const known = knownKeys(spec);
    const extra = Object.keys(o || {}).filter(
      (k) =>
        !known.has(k) &&
        ![
          'dimensions',
          'measures',
          'joins',
          'segments',
          'hierarchies',
          'pre_aggregations',
          'access_policy',
          'cubes',
          'folders',
        ].includes(k),
    );
    return extra.length
      ? `<div class="section xs muted">Kept exactly as written (edit in Code): ${extra.map((k) => `<code>${UI.esc(k)}</code>`).join(', ')}</div>`
      : '';
  }

  /* ---------- form ---------- */
  function renderForm() {
    const kind = rootKind(),
      o = obj(),
      ro = readOnly(),
      L = lossy(S.cm.getValue());
    const tabs = TABS[kind];
    if (!tabs.some((t) => t[0] === S.tab)) S.tab = '__root';
    const [key, , itemKind] = tabs.find((t) => t[0] === S.tab);
    let body = '';
    if (!o) body = '<div class="section sec">This file has no cube or view.</div>';
    else if (key === '__root')
      body = groupsHtml(SC[itemKind], o, '', ro) + passThrough(SC[itemKind], o);
    else {
      const items = o[key] || [];
      const spec = SC[itemKind];
      body =
        items
          .map((it, i) => {
            const k = `${key}:${i}`,
              open = S.open.has(k);
            const badges = [
              it.primary_key && 'PK',
              it.public === false && 'hidden',
              it.format,
              it.rolling_window && 'rolling',
              it.multi_stage && 'multi-stage',
              it.sub_query && 'sub-query',
              it.case && 'case',
            ]
              .filter(Boolean)
              .map((b) => `<span class="mbadge">${UI.esc(b)}</span>`)
              .join(' ');
            const title = spec.title ? spec.title(it, i) : `${itemKind} ${i + 1}`;
            return `<div class="mrow"><button class="mrow-head" data-open="${k}" aria-expanded="${open}"><span aria-hidden="true">${open ? '▾' : '▸'}</span><span class="strong">${UI.esc(title || '(unnamed)')} ${badges}</span><span class="xs muted">${UI.esc(spec.sub ? spec.sub(it) || '' : '')}</span><span></span>${it.sql && typeof it.sql === 'string' ? `<span class="sqlp">${UI.esc(it.sql)}</span>` : ''}</button>${open ? `<div class="mrow-body">${groupsHtml(spec, it, `${key}.${i}`, ro)}${passThrough(spec, it)}<div><button class="btn sm" data-del="${key}" data-i="${i}" ${ro ? 'disabled' : ''} style="color:var(--err)">Remove ${UI.esc(itemKind.replace('_', ' '))}</button></div></div>` : ''}</div>`;
          })
          .join('') +
        `<div class="formbar"><button class="btn sm" data-addroot="${key}" data-kind="${itemKind}" ${ro ? 'disabled' : ''}>+ ${UI.esc(itemKind.replace('_', ' '))}</button><span class="xs muted">${items.length} total</span></div>`;
    }
    const counts = (k) => (o && o[k] ? ` ${o[k].length}` : '');
    formEl.innerHTML = `
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-ftab="${k}" aria-selected="${S.tab === k}">${l}${k !== '__root' ? `<span class="muted" style="font-weight:400">${counts(k)}</span>` : ''}</button>`).join('')}</div>
      ${S.error ? `<div class="readonly-veil">${UI.STATUS_SVG.err}<span>The YAML doesn't parse (line ${S.error.line}). The form is read-only until the code is fixed.</span></div>` : ''}
      ${!S.error && L.length && !S.acceptedLossy[S.file] ? `<div class="warnbar">${UI.STATUS_SVG.warn}<span style="flex:1">This file has ${L.join(' and ')}. Editing in the form rewrites the YAML and <b>drops them</b>; they stay intact while you edit in Code.</span><button class="btn sm" data-acceptlossy>Edit in form anyway</button></div>` : ''}
      <div class="pane-body" style="overflow:auto">${body}</div>`;
  }

  /* ---------- validation (schema-driven subset of CubeValidator rules) ---------- */
  function validate(text) {
    const probs = [],
      o = obj();
    if (!o) return probs;
    const lines = text.split('\n');
    const lineOf = (needle, from = 0) => {
      const i = lines.findIndex((l, n) => n >= from && l.includes(needle));
      return i >= 0 ? i + 1 : 1;
    };
    const add = (sev, msg, needle, tab) => probs.push({ sev, msg, line: lineOf(needle), tab });
    const kind = rootKind();
    const req = (spec, it, needle, tab) =>
      spec.groups
        .filter((g) => !g.show || g.show(it))
        .forEach((g) =>
          g.fields.forEach((f) => {
            if (
              f.req &&
              (!f.show || f.show(it)) &&
              get(it, f.k) == null &&
              !(f.k === 'sql' && it.type === 'count')
            )
              add(
                'err',
                `${tab === '__root' ? kind : spec === SC.join ? 'Join' : 'Member'} \`${it.name || needle}\` is missing required \`${f.k}\``,
                needle,
                tab,
              );
          }),
        );
    const allRefs = new Set(options('any', o));
    if (kind === 'cube') {
      req(SC.cube, o, 'name: ' + o.name, '__root');
      if (!!o.sql === !!o.sql_table)
        add(
          'err',
          `Cube \`${o.name}\` must set exactly one of sql or sql_table`,
          'name: ' + o.name,
          '__root',
        );
      if (!(o.dimensions || []).some((d) => d.primary_key))
        add(
          'warn',
          `Cube \`${o.name}\` has no primary_key dimension; joins can fan out`,
          'dimensions:',
          'dimensions',
        );
      (o.dimensions || []).forEach((d) => {
        req(SC.dimension, d, 'name: ' + d.name, 'dimensions');
        if (!SC.dimension.groups[0].fields[1].opts.includes(d.type))
          add(
            'err',
            `Dimension \`${d.name}\`: type "${d.type}" must be one of string, number, boolean, time, geo, switch`,
            'name: ' + d.name,
            'dimensions',
          );
        if (d.sql && d.case)
          add(
            'err',
            `Dimension \`${d.name}\`: sql and case can't both be set`,
            'name: ' + d.name,
            'dimensions',
          );
        if (!d.sql && !d.case && !['geo', 'switch'].includes(d.type))
          add('err', `Dimension \`${d.name}\` needs sql or case`, 'name: ' + d.name, 'dimensions');
        if (d.currency && d.type !== 'number')
          add(
            'err',
            `Dimension \`${d.name}\`: "currency" can only be used with type number`,
            'name: ' + d.name,
            'dimensions',
          );
        if (d.granularities && d.type !== 'time')
          add(
            'err',
            `Dimension \`${d.name}\`: granularities are only allowed on time dimensions`,
            'name: ' + d.name,
            'dimensions',
          );
        if (d.type === 'time' && d.format && !String(d.format).includes('%'))
          add(
            'err',
            `Dimension \`${d.name}\`: time format needs at least one % specifier`,
            'name: ' + d.name,
            'dimensions',
          );
        (d.links || []).filter((l) => l.primary).length > 1 &&
          add(
            'err',
            `Dimension \`${d.name}\`: only one link can be primary`,
            'links:',
            'dimensions',
          );
      });
      (o.measures || []).forEach((m) => {
        req(SC.measure, m, 'name: ' + m.name, 'measures');
        const types = SC.measure.groups[0].fields[1].optsBy(m);
        if (!types.includes(m.type))
          add(
            'err',
            `Measure \`${m.name}\`: type "${m.type}" is not valid${['number_agg', 'rank'].includes(m.type) ? ' without multi_stage: true' : ''}`,
            'name: ' + m.name,
            'measures',
          );
        if (!m.sql && m.type !== 'count' && !m.multi_stage)
          add(
            'err',
            `Measure \`${m.name}\` (type ${m.type}) needs sql`,
            'name: ' + m.name,
            'measures',
          );
        if (m.currency && ['string', 'boolean', 'time'].includes(m.type))
          add(
            'err',
            `Measure \`${m.name}\`: currency is not allowed on ${m.type} measures`,
            'name: ' + m.name,
            'measures',
          );
        if (m.grain && m.grain.keep_only && m.grain.exclude)
          add(
            'err',
            `Measure \`${m.name}\`: grain keep_only and exclude can't be combined`,
            'grain:',
            'measures',
          );
        if ((m.time_shift || m.grain || m.case || m.order_by) && !m.multi_stage)
          add(
            'err',
            `Measure \`${m.name}\`: time_shift, grain, case and order_by require multi_stage: true`,
            'name: ' + m.name,
            'measures',
          );
        if ((m.rolling_window || {}).type === 'to_date' && !m.rolling_window.granularity)
          add(
            'err',
            `Measure \`${m.name}\`: to_date rolling window needs granularity`,
            'rolling_window',
            'measures',
          );
        (m.drill_members || [])
          .filter((r) => !allRefs.has(r))
          .forEach((r) =>
            add(
              'err',
              `Measure \`${m.name}\`: unknown member \`${r}\` in drill_members`,
              r,
              'measures',
            ),
          );
      });
      (o.joins || []).forEach((j) => {
        req(SC.join, j, 'name: ' + j.name, 'joins');
        if (!index()[j.name])
          add(
            'warn',
            `Join target \`${j.name}\` is not defined in this project`,
            'name: ' + j.name,
            'joins',
          );
      });
      (o.pre_aggregations || []).forEach((p) => {
        [...(p.measures || []), ...(p.dimensions || [])]
          .filter((r) => !allRefs.has(r))
          .forEach((r) =>
            add(
              'err',
              `Pre-aggregation \`${p.name}\`: unknown member \`${r}\``,
              r,
              'pre_aggregations',
            ),
          );
        if (p.time_dimension && !p.granularity && p.type !== 'original_sql')
          add(
            'err',
            `Pre-aggregation \`${p.name}\`: granularity is required with time_dimension`,
            'name: ' + p.name,
            'pre_aggregations',
          );
        if (['rollup_join', 'rollup_lambda'].includes(p.type) && !(p.rollups || []).length)
          add(
            'err',
            `Pre-aggregation \`${p.name}\`: ${p.type} needs rollups`,
            'name: ' + p.name,
            'pre_aggregations',
          );
        if (p.type === 'rollup_join' && p.scheduled_refresh !== false)
          add(
            'warn',
            `Pre-aggregation \`${p.name}\`: scheduled_refresh must be false for rollup_join`,
            'name: ' + p.name,
            'pre_aggregations',
          );
      });
    }
    (o.access_policy || []).forEach((p, i) => {
      if (!!p.group === !!p.groups)
        add(
          'err',
          `access_policy[${i}] must set exactly one of group or groups`,
          'access_policy:',
          'access_policy',
        );
      if (p.member_masking && !p.member_level)
        add(
          'err',
          `access_policy[${i}]: member_masking requires member_level`,
          'member_masking',
          'access_policy',
        );
      if (p.member_level && !Object.keys(p.member_level).length)
        add(
          'warn',
          `access_policy[${i}]: empty member_level behaves like includes "*"`,
          'member_level',
          'access_policy',
        );
      if (p.row_level && p.row_level.allow_all && p.row_level.filters)
        add(
          'err',
          `access_policy[${i}]: row_level takes filters or allow_all, not both`,
          'row_level',
          'access_policy',
        );
    });
    return probs;
  }

  /* ---------- sync ---------- */
  function parseFromCode() {
    const text = S.cm.getValue();
    S.cm.eachLine((l) => S.cm.removeLineClass(l, 'background', 'cm-errline'));
    try {
      S.doc = jsyaml.load(text) || {};
      S.error = null;
      FILES[S.file] = text;
      S.problems = validate(text);
    } catch (e) {
      const line = e.mark ? e.mark.line + 1 : 1;
      S.error = { line };
      S.problems = [{ sev: 'err', msg: `YAML syntax: ${e.reason || e.message}`, line }];
      S.cm.addLineClass(line - 1, 'background', 'cm-errline');
    }
    renderForm();
    renderProblems();
    renderTree();
    if (S.center === 'diagram') renderDiagram();
  }
  function writeFromForm() {
    const text = jsyaml.dump(S.doc, { lineWidth: 110, noRefs: true, quotingType: '"' });
    suppress = true;
    const pos = S.cm.getScrollInfo();
    S.cm.setValue(text);
    S.cm.scrollTo(pos.left, pos.top);
    suppress = false;
    FILES[S.file] = text;
    S.problems = validate(text);
    renderForm();
    renderProblems();
    renderTree();
  }

  function renderProblems() {
    const errs = S.problems.filter((p) => p.sev === 'err').length,
      warns = S.problems.length - errs;
    probEl.innerHTML = `<div class="tabs"><button aria-selected="true">Problems · ${errs} errors · ${warns} warnings</button><span style="flex:1"></span><span class="xs muted" style="align-self:center">Checked against Cube 1.7.42 validator rules (prototype subset)</span></div>
      ${S.problems.length ? S.problems.map((p, i) => `<div class="prob" data-prob="${i}" role="button" tabindex="0">${p.sev === 'err' ? UI.STATUS_SVG.err : UI.STATUS_SVG.warn}<span>${UI.esc(p.msg).replace(/`([^`]+)`/g, '<code>$1</code>')}</span><span class="xs muted">${S.file.split('/').pop()}:${p.line}</span></div>`).join('') : `<div class="prob">${UI.STATUS_SVG.ok}<span>No problems in ${S.file.split('/').pop()}</span><span></span></div>`}`;
  }
  function renderTree() {
    const dirs = {};
    Object.keys(FILES).forEach((p) => (dirs[p.split('/').slice(0, -1).join('/')] ||= []).push(p));
    root.querySelector('#mtree').innerHTML =
      Object.entries(dirs)
        .map(
          ([d, fs]) =>
            `<div class="dir">▾ ${d}/</div>${fs.map((f) => `<button class="file" data-file="${f}" aria-current="${f === S.file}">${f.split('/').pop()}${f === S.file && S.problems.some((p) => p.sev === 'err') ? ' <span style="color:var(--err)" aria-label="has errors">●</span>' : ''}</button>`).join('')}`,
        )
        .join('') +
      `<div class="dir" style="margin-top:12px">▸ model/globals.py</div><div class="section"><button class="btn sm" data-newfile="cube">+ New cube</button><button class="btn sm" data-newfile="view">+ New view</button></div>`;
  }
  function renderDiagram() {
    const el = root.querySelector('#mdiagram');
    const idx = index();
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const names = Object.keys(idx);
    const nodes = names.map((n, i) => ({
      name: n,
      x: 160 + (i % 3) * 260,
      y: 90 + Math.floor(i / 3) * 190,
      symbol: 'roundRect',
      symbolSize: [150, 52],
      itemStyle: {
        color: css('--bg-surface'),
        borderColor: n === (obj() || {}).name ? css('--accent') : css('--border-strong'),
        borderWidth: n === (obj() || {}).name ? 2 : 1,
      },
      label: {
        show: true,
        formatter: `{b|${n}}\n{s|${idx[n].dims.length} dims · ${idx[n].measures.length} measures}`,
        rich: {
          b: {
            fontWeight: 600,
            fontSize: 13,
            color: css('--text-primary'),
            fontFamily: 'IBM Plex Mono',
          },
          s: { fontSize: 12, color: css('--text-secondary'), padding: [4, 0, 0, 0] },
        },
      },
    }));
    const links = names.flatMap((n) =>
      idx[n].joins
        .filter((j) => idx[j.to])
        .map((j) => ({
          source: n,
          target: j.to,
          label: {
            show: true,
            formatter: j.rel.replace(/_/g, ' '),
            fontSize: 12,
            color: css('--text-secondary'),
            backgroundColor: css('--bg-page'),
            padding: [2, 4],
          },
        })),
    );
    const inst = echarts.getInstanceByDom(el) || echarts.init(el);
    inst.setOption(
      {
        series: [
          {
            type: 'graph',
            layout: 'none',
            roam: true,
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: 9,
            lineStyle: { color: css('--axis'), width: 1.5, curveness: 0.12 },
            data: nodes,
            links,
          },
        ],
      },
      true,
    );
    CH.onItemClick(inst, (p) => {
      if (p.dataType === 'node' && idx[p.name]) {
        S.center = 'code';
        renderCenter();
        openFile(idx[p.name].path);
      }
    });
  }
  function renderCenter() {
    root.querySelector('#mcode').style.display = S.center === 'code' ? '' : 'none';
    root.querySelector('#mdiagram').style.display = S.center === 'diagram' ? '' : 'none';
    root
      .querySelectorAll('[data-center]')
      .forEach((b) => b.setAttribute('aria-pressed', b.dataset.center === S.center));
    if (S.center === 'diagram') renderDiagram();
    else setTimeout(() => S.cm.refresh(), 0);
  }
  function openFile(path) {
    S.file = path;
    S.tab = '__root';
    suppress = true;
    S.cm.setValue(FILES[path]);
    S.cm.clearHistory();
    suppress = false;
    root.querySelector('#mfile').textContent = path;
    parseFromCode();
  }

  /* ---------- events ---------- */
  function onClick(e) {
    const b = e.target.closest('button, [data-prob]');
    if (!b) return;
    const d = b.dataset;
    if (d.file) return openFile(d.file);
    if (d.center) {
      S.center = d.center;
      return renderCenter();
    }
    if (d.ftab) {
      S.tab = d.ftab;
      return renderForm();
    }
    if (d.open) {
      S.open.has(d.open) ? S.open.delete(d.open) : S.open.add(d.open);
      return renderForm();
    }
    if ('acceptlossy' in d) {
      S.acceptedLossy[S.file] = true;
      return renderForm();
    }
    if (d.prob != null) {
      const p = S.problems[+d.prob];
      if (p.tab) S.tab = p.tab;
      S.center = 'code';
      renderCenter();
      S.cm.setCursor({ line: p.line - 1, ch: 0 });
      S.cm.focus();
      return renderForm();
    }
    if (d.newfile) {
      const n = Object.keys(FILES).length + 1;
      const path =
        d.newfile === 'cube' ? `model/cubes/new_cube_${n}.yml` : `model/views/new_view_${n}.yml`;
      FILES[path] =
        d.newfile === 'cube'
          ? `cubes:\n  - name: new_cube_${n}\n    sql_table: public.table_name\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n`
          : `views:\n  - name: new_view_${n}\n    cubes:\n      - join_path: orders\n        includes: "*"\n`;
      return openFile(path);
    }
    if (readOnly()) return;
    const o = obj();
    if (!o) return;
    if (d.toggle) {
      const cur = get(o, d.toggle);
      const def = d.def === 'true';
      const now = cur == null ? def : !!cur;
      set(o, d.toggle, !now === def ? undefined : !now);
      return writeFromForm();
    }
    if (d.ref) {
      let cur = get(o, d.ref);
      cur = Array.isArray(cur) ? cur.slice() : [];
      const i = cur.indexOf(d.val);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(d.val);
      const star = e.target.closest('.field').querySelector('[data-refstar]');
      set(o, d.ref, cur.length ? cur : star ? '*' : undefined);
      return writeFromForm();
    }
    if (d.refstar) {
      set(o, d.refstar, '*');
      return writeFromForm();
    }
    if (d.shape) {
      const it = get(o, d.shape);
      const to = d.val;
      delete it.sql;
      delete it.case;
      delete it.latitude;
      delete it.longitude;
      delete it.values;
      if (to === 'sql') {
        it.sql = 'column_name';
        if (['geo', 'switch'].includes(it.type)) it.type = 'string';
      }
      if (to === 'case') {
        it.case = {
          when: [{ sql: '{CUBE}.value > 100', label: 'High' }],
          else: { label: 'Other' },
        };
        if (['geo', 'switch'].includes(it.type)) it.type = 'string';
      }
      if (to === 'geo') {
        it.type = 'geo';
        it.latitude = { sql: 'lat' };
        it.longitude = { sql: 'lng' };
      }
      if (to === 'switch') {
        it.type = 'switch';
        it.values = ['option_a', 'option_b'];
      }
      return writeFromForm();
    }
    if (d.listadd) {
      const cur = get(o, d.listadd) || [];
      set(o, d.listadd, [...cur, {}]);
      return writeFromForm();
    }
    if (d.listdel) {
      const cur = (get(o, d.listdel) || []).slice();
      cur.splice(+d.i, 1);
      set(o, d.listdel, cur);
      return writeFromForm();
    }
    if (d.addroot) {
      o[d.addroot] = o[d.addroot] || [];
      const n = o[d.addroot].length;
      o[d.addroot].push(TEMPLATES[d.kind](n + 1));
      S.open.add(`${d.addroot}:${n}`);
      return writeFromForm();
    }
    if (d.del) {
      o[d.del].splice(+d.i, 1);
      if (!o[d.del].length) delete o[d.del];
      return writeFromForm();
    }
  }
  function onChange(e) {
    const p = e.target.dataset.path;
    if (!p || readOnly() || !obj()) return;
    let v = e.target.value;
    if (e.target.dataset.list)
      v = v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    if (e.target.dataset.json) {
      try {
        v = v.trim() ? jsyaml.load(v) : undefined;
      } catch (err) {
        e.target.setCustomValidity('Not valid YAML');
        e.target.reportValidity();
        return;
      }
    }
    set(obj(), p, v);
    writeFromForm();
  }

  function mount(el) {
    root = el;
    el.innerHTML = `
      <aside class="pane left filetree" aria-label="Model files"><div class="pane-head"><h2>Model</h2><span class="badge" style="margin-left:auto">main · dev mode</span></div><div class="pane-body" id="mtree"></div></aside>
      <section class="pane" aria-label="Form editor" style="min-width:0;min-height:0">
        <div class="editor-head"><span class="mono strong" id="mfile"></span><span style="flex:1"></span><button class="btn sm">History</button><button class="btn sm primary">Save &amp; reload Cube</button></div>
        <div class="pane" id="mform" style="flex:1;min-height:0"></div>
      </section>
      <section class="center" aria-label="YAML and join diagram" style="border-left:1px solid var(--border-subtle)">
        <div class="editor-head"><div class="seg" role="group" aria-label="Right pane view"><button data-center="code" aria-pressed="true">YAML</button><button data-center="diagram" aria-pressed="false">Join diagram</button></div><span style="flex:1"></span><span class="xs muted">Edits in either side stay in sync</span></div>
        <div class="editor-host" id="mcode"></div>
        <div class="editor-host" id="mdiagram" style="display:none"></div>
        <div class="problems" id="mprob"></div>
      </section>`;
    formEl = el.querySelector('#mform');
    probEl = el.querySelector('#mprob');
    S.cm = CodeMirror(el.querySelector('#mcode'), {
      value: FILES[S.file],
      mode: 'yaml',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      extraKeys: { Tab: (cm) => cm.replaceSelection('  ') },
    });
    el.querySelector('#mfile').textContent = S.file;
    S.cm.on('change', () => {
      if (suppress) return;
      clearTimeout(debounce);
      debounce = setTimeout(parseFromCode, 300);
    });
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('keydown', (e) => {
      if (
        e.target.dataset &&
        e.target.dataset.prob != null &&
        (e.key === 'Enter' || e.key === ' ')
      ) {
        e.preventDefault();
        onClick(e);
      }
    });
    parseFromCode();
  }

  window.MODEL = {
    mount,
    render() {
      if (S.cm)
        setTimeout(() => {
          S.cm.refresh();
          if (S.center === 'diagram') renderDiagram();
        }, 0);
    },
  };
})();
