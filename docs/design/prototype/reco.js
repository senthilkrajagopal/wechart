/* wechart prototype: chart recommender.
   Tier 1 = hard legality rules over the Cube type signature (N nominal, T time, Q measure) + cardinality,
   following docs/inputs §3 and direction.md §5 channel capacity. Tier 2 (learned soft weights) is out of scope here. */
(function () {
  const CAP = { color: 8, shape: 6, facet: 20, pie: 6, heat: 200, scatterColor: 3 };
  const svg = (d) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const TYPES = {
    kpi: { label: 'KPI', icon: svg('<path d="M3 11h10M5 8l2-3 2 2 2-3"/>') },
    bar: { label: 'Bar', icon: svg('<path d="M3 13V8M8 13V4M13 13V9"/>') },
    hbar: { label: 'Bar, horizontal', icon: svg('<path d="M3 4h7M3 8h10M3 12h5"/>') },
    line: { label: 'Line', icon: svg('<path d="M2 12l4-4 3 2 5-6"/>') },
    area: {
      label: 'Area',
      icon: svg('<path d="M2 13l4-5 3 2 5-6v9z" fill="currentColor" fill-opacity=".2"/>'),
    },
    multiline: {
      label: 'Multi-series line',
      icon: svg('<path d="M2 12l4-4 3 2 5-6M2 13l4-2 3 1 5-3"/>'),
    },
    stackedarea: {
      label: 'Stacked area',
      icon: svg('<path d="M2 13l4-3 4 1 4-4v6zM2 10l4-4 4 1 4-4"/>'),
    },
    stackedbar: {
      label: 'Stacked bar',
      icon: svg('<path d="M4 13V7M4 7V4M9 13V9M9 9V6M14 13V10"/>'),
    },
    groupedbar: { label: 'Grouped bar', icon: svg('<path d="M3 13V7M5 13V5M10 13V8M12 13V4"/>') },
    facet: {
      label: 'Small multiples',
      icon: svg(
        '<rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/>',
      ),
    },
    heatmap: {
      label: 'Heatmap',
      icon: svg(
        '<rect x="2" y="2" width="12" height="12"/><path d="M6 2v12M10 2v12M2 6h12M2 10h12"/>',
      ),
    },
    scatter: {
      label: 'Scatter',
      icon: svg(
        '<circle cx="4" cy="11" r="1"/><circle cx="7" cy="7" r="1"/><circle cx="11" cy="9" r="1"/><circle cx="12" cy="4" r="1"/>',
      ),
    },
    pie: {
      label: 'Donut',
      icon: svg('<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/><path d="M8 2v3.5"/>'),
    },
    treemap: {
      label: 'Treemap',
      icon: svg('<rect x="2" y="2" width="12" height="12"/><path d="M8 2v12M8 8h6"/>'),
    },
    parallel: {
      label: 'Parallel coordinates',
      icon: svg('<path d="M3 2v12M8 2v12M13 2v12M3 5l5 6 5-4M3 10l5-5 5 6"/>'),
    },
    table: {
      label: 'Table',
      icon: svg('<rect x="2" y="3" width="12" height="10"/><path d="M2 6h12M6 3v10"/>'),
    },
    pivot: {
      label: 'Pivot table',
      icon: svg(
        '<rect x="2" y="3" width="12" height="10"/><path d="M2 6h12M6 3v10M10 3v10M2 9.5h12"/>',
      ),
    },
    combo: {
      label: 'Combo (bar + line)',
      icon: svg('<path d="M3 13V9M7 13V7M11 13V10"/><path d="M2 6l4-2 4 3 4-4"/>'),
    },
  };

  function signature(wells) {
    const dims = [...wells.x, ...wells.color, ...wells.trellis].map((f) => ({
      ...f,
      meta: WC.byId[f.id],
      n: WC.cardinality(f.id, f.granularity),
    }));
    const measures = [...wells.y, ...wells.size].map((f) => f.id);
    const T = dims.filter((d) => d.meta.type === 'time');
    const N = dims.filter((d) => d.meta.type !== 'time');
    return { dims, measures, T, N, Q: measures.length };
  }

  const R = (type, why, enc) => ({ type, why, enc });

  /** Returns { top, runners[], na[], sig }. Each candidate carries an encoding for charts.js. */
  function recommend(wells) {
    const s = signature(wells);
    const { T, N, Q } = s;
    const m = s.measures;
    const c = [];
    const forcedFacet = wells.trellis[0];
    const base = { measures: m };

    if (!s.dims.length && Q === 0) return { top: null, runners: [], na: [], sig: s };

    if (forcedFacet) {
      const f = s.dims.find((d) => d.id === forcedFacet.id);
      const x = s.dims.find((d) => d.id !== forcedFacet.id);
      const paged = f.n > CAP.facet;
      c.push(
        R(
          'facet',
          `Trellis by ${f.meta.title}: ${f.n} panels${paged ? `, paged ${CAP.facet} per page` : ''}; axes synchronized`,
          {
            ...base,
            x: x && x.id,
            facet: f.id,
            inner: x && x.meta.type === 'time' ? 'line' : 'bar',
          },
        ),
      );
    }

    if (!s.dims.length) {
      c.push(
        R(
          'kpi',
          Q === 1
            ? '1 measure, no dimensions → a single headline value'
            : `${Q} measures, no dimensions → a KPI row`,
          base,
        ),
      );
      c.push(R('table', 'Exact values, one column per measure', base));
    } else if (s.dims.length === 1 && Q === 1) {
      const d = s.dims[0];
      if (d.meta.type === 'time') {
        if (d.n >= 12)
          c.push(
            R('line', `Time × 1 measure, ${d.n} ordered points → line shows the trend`, {
              ...base,
              x: d.id,
            }),
          );
        c.push(
          R(
            'bar',
            d.n < 12
              ? `Only ${d.n} time points → bars compare periods directly`
              : 'Bars compare individual periods',
            { ...base, x: d.id },
          ),
        );
        if (d.n >= 12)
          c.push(R('area', 'Area stresses cumulative volume over time', { ...base, x: d.id }));
      } else {
        if (d.n <= 12)
          c.push(
            R('bar', `${d.n} categories × 1 measure → bars, sorted by value`, {
              ...base,
              x: d.id,
              sort: 'desc',
            }),
          );
        else if (d.n <= 50)
          c.push(
            R('hbar', `${d.n} categories: horizontal bars keep labels readable, sorted`, {
              ...base,
              x: d.id,
              sort: 'desc',
            }),
          );
        else
          c.push(
            R('hbar', `${d.n} categories: top 15 + "Other", sorted`, {
              ...base,
              x: d.id,
              sort: 'desc',
              topK: 15,
            }),
          );
        if (d.n <= CAP.pie)
          c.push(R('pie', `Part-to-whole across ${d.n} slices`, { ...base, x: d.id }));
        if (d.n <= 50)
          c.push(R('treemap', `Part-to-whole with room for ${d.n} labels`, { ...base, x: d.id }));
        if (d.n <= 12)
          c.push(
            R('hbar', 'Horizontal bars for long category names', {
              ...base,
              x: d.id,
              sort: 'desc',
            }),
          );
      }
      c.push(R('table', 'Exact values with sorting', { ...base, x: d.id }));
    } else if (s.dims.length === 1 && Q >= 2) {
      const d = s.dims[0];
      if (d.meta.type === 'time') {
        c.push(
          R('facet', `${Q} measures on different scales → one panel per measure, not a dual axis`, {
            ...base,
            x: d.id,
            facetMeasures: true,
            inner: 'line',
          }),
        );
        c.push(
          R('multiline', `Shared axis works only if ${Q} measures share units`, {
            ...base,
            x: d.id,
          }),
        );
      } else if (Q === 2 || Q >= 3) {
        if (Q >= 3)
          c.push(
            R(
              'parallel',
              `${Q} measures per ${d.meta.title} → parallel coordinates compare profiles`,
              { ...base, x: d.id },
            ),
          );
        if (d.n <= 20)
          c.push(
            R(
              'scatter',
              `2 measures across ${d.n} ${d.meta.title.toLowerCase()} values → scatter shows correlation${d.n > CAP.scatterColor ? '; labels instead of colour (' + d.n + ' > ' + CAP.scatterColor + ')' : ''}`,
              { ...base, x: d.id },
            ),
          );
        if (d.n <= 12)
          c.push(
            R(
              'groupedbar',
              `Side-by-side bars per ${d.meta.title.toLowerCase()} (scales differ, read with care)`,
              { ...base, x: d.id },
            ),
          );
        c.push(
          R('facet', 'One bar panel per measure keeps each scale honest', {
            ...base,
            x: d.id,
            facetMeasures: true,
            inner: 'bar',
          }),
        );
      }
      c.push(R('table', 'Exact values, one column per measure', { ...base, x: d.id }));
    } else if (s.dims.length === 2 && Q >= 1) {
      const t = T[0],
        ns = N.slice().sort((a, b) => a.n - b.n);
      if (t && ns.length === 1) {
        const n = ns[0];
        if (n.n <= 7)
          c.push(
            R('multiline', `${n.n} series over time → multi-series line with direct labels`, {
              ...base,
              x: t.id,
              series: n.id,
            }),
          );
        else if (n.n <= CAP.facet)
          c.push(
            R(
              'facet',
              `${n.n} ${n.meta.title.toLowerCase()} values: more than 7 overlapping lines → small multiples`,
              { ...base, x: t.id, facet: n.id, inner: 'line' },
            ),
          );
        else
          c.push(
            R('heatmap', `${n.n} × ${t.n} cells: too many panels for small multiples → heatmap`, {
              ...base,
              x: t.id,
              y: n.id,
            }),
          );
        if (n.n <= CAP.color)
          c.push(
            R('stackedarea', `Part-to-whole over time across ${n.n} series`, {
              ...base,
              x: t.id,
              series: n.id,
            }),
          );
        if (n.n <= CAP.color && n.n > 7)
          c.push(
            R('multiline', `${n.n} lines overlap; still legal (≤ ${CAP.color} colours)`, {
              ...base,
              x: t.id,
              series: n.id,
            }),
          );
        if (n.n * t.n <= 600)
          c.push(
            R('heatmap', `Scan ${n.n} × ${t.n} cells for hot spots`, { ...base, x: t.id, y: n.id }),
          );
        if (n.n <= CAP.facet && n.n <= 7)
          c.push(
            R('facet', `One panel per ${n.meta.title.toLowerCase()} for clean comparison`, {
              ...base,
              x: t.id,
              facet: n.id,
              inner: 'line',
            }),
          );
      } else {
        const [small, big] = ns.length === 2 ? ns : [ns[0], t];
        if (small.n * big.n <= CAP.heat)
          c.push(
            R(
              'heatmap',
              `${big.n} × ${small.n} = ${big.n * small.n} cells ≤ ${CAP.heat} → heatmap`,
              { ...base, x: big.id, y: small.id },
            ),
          );
        if (small.n <= CAP.color)
          c.push(
            R(
              'stackedbar',
              `Stack ${small.n} ${small.meta.title.toLowerCase()} values within each ${big.meta.title.toLowerCase()}`,
              { ...base, x: big.id, series: small.id, sort: 'desc' },
            ),
          );
        if (small.n <= CAP.color && big.n <= 12)
          c.push(
            R('groupedbar', 'Side-by-side bars compare members directly', {
              ...base,
              x: big.id,
              series: small.id,
            }),
          );
        if (small.n <= CAP.facet)
          c.push(
            R('facet', `One bar panel per ${small.meta.title.toLowerCase()} (${small.n})`, {
              ...base,
              x: big.id,
              facet: small.id,
              inner: 'bar',
            }),
          );
      }
      c.push(
        R('pivot', 'Rows × columns with totals and shading', {
          ...base,
          x: (ns[1] || ns[0] || t).id,
          series: (ns.length === 2 ? ns[0] : t).id,
        }),
      );
      c.push(
        R('table', 'Flat table of every combination', {
          ...base,
          x: s.dims[0].id,
          series: s.dims[1].id,
        }),
      );
    } else {
      c.push(
        R('table', `${s.dims.length} dimensions: a table keeps every combination readable`, {
          ...base,
          x: s.dims[0] && s.dims[0].id,
        }),
      );
      if (s.dims.length === 3 && T.length)
        c.push(
          R('facet', 'Facet by the smallest dimension, colour by the next', {
            ...base,
            x: T[0].id,
            facet: N[0] && N[0].id,
            series: N[1] && N[1].id,
            inner: 'line',
          }),
        );
    }

    const seen = new Set();
    const ranked = c.filter((r) => r.why && !seen.has(r.type) && seen.add(r.type));
    const top = ranked[0] || null;
    const runners = ranked.slice(1, 5);
    const more = ranked.slice(5);
    const d0 = s.dims[0];
    if (s.dims.length === 1 && Q === 2 && !seen.has('combo')) {
      more.push(
        R('combo', 'Manual only: two y-axes with different scales are easy to misread', {
          ...base,
          x: d0.id,
        }),
      );
      seen.add('combo');
    }
    const na = Object.keys(TYPES)
      .filter((k) => !seen.has(k))
      .map((k) => ({ type: k, need: requirement(k, s) }));
    return { top, runners, more, na, sig: s, trace: trace(s, top) };
  }

  /** Human-readable rule trace for "Why this chart?" (tier 1 hard constraints + the signature). */
  function trace(s, top) {
    const out = [
      {
        ok: true,
        text: `Signature: ${s.T.length} time × ${s.N.length} category × ${s.Q} measure${s.Q === 1 ? '' : 's'} (from Cube /v1/meta member types)`,
      },
    ];
    s.dims.forEach((d) =>
      out.push({
        ok: true,
        text: `${d.meta.title}: ${d.n} distinct values${d.meta.type === 'time' ? ` at ${d.granularity || 'month'} grain` : ''}`,
      }),
    );
    s.N.forEach((d) =>
      out.push({
        ok: d.n <= CAP.color,
        text: `Colour channel: ${d.n} ≤ ${CAP.color}? ${d.n <= CAP.color ? 'legal' : 'illegal → facet or top-k'}`,
      }),
    );
    s.N.forEach((d) => {
      if (s.T.length)
        out.push({
          ok: d.n <= 7,
          text: `Overlapping lines: ${d.n} ≤ 7? ${d.n <= 7 ? 'one chart' : 'too many → small multiples'}`,
        });
    });
    s.N.forEach((d) =>
      out.push({
        ok: d.n <= CAP.facet,
        text: `Trellis panels: ${d.n} ≤ ${CAP.facet}? ${d.n <= CAP.facet ? 'fits one page' : 'pages of 20'}`,
      }),
    );
    if (s.Q >= 2)
      out.push({ ok: false, text: 'Dual y-axis: never recommended (different scales mislead)' });
    if (top) out.push({ ok: true, text: `Picked ${TYPES[top.type].label}: ${top.why}` });
    return out;
  }

  function requirement(type, s) {
    const n = s.N[0];
    return {
      kpi: 'Needs measures and no dimensions',
      pie:
        n && n.n > CAP.pie
          ? `Needs ≤ ${CAP.pie} slices (${n.meta.title} has ${n.n})`
          : 'Needs 1 category + 1 measure',
      heatmap: 'Needs 2 dimensions + 1 measure',
      scatter: 'Needs 2 measures + 1 dimension',
      parallel: 'Needs 3+ measures',
      multiline: 'Needs time + 1 dimension with ≤ 7 values',
      stackedarea: `Needs time + 1 dimension with ≤ ${CAP.color} values`,
      stackedbar: `Needs 2 dimensions, one with ≤ ${CAP.color} values`,
      groupedbar: 'Needs 2 dimensions or 2 measures',
      facet: 'Needs a dimension with ≤ 20 values to split by',
      line: 'Needs a time dimension',
      area: 'Needs a time dimension',
      treemap: 'Needs 1 category (≤ 50) + 1 measure',
      bar: 'Needs 1 dimension + 1 measure',
      hbar: 'Needs 1 dimension + 1 measure',
      table: 'Always available',
      pivot: 'Needs 2 dimensions + 1 measure',
      combo: 'Needs 1 dimension + exactly 2 measures',
    }[type];
  }

  /** Why a field may not go into a well (drag-time legality). Returns '' when legal. */
  function illegal(well, field, wells) {
    const meta = WC.byId[field.id];
    if (['y', 'size'].includes(well) && meta.role !== 'measure')
      return `${well === 'y' ? 'Y' : 'Size'} takes measures; ${meta.title} is a dimension`;
    if (['x', 'color', 'trellis'].includes(well) && meta.role === 'measure')
      return `${meta.title} is a measure; drop it on Y or Size`;
    if (well === 'color') {
      const n = WC.cardinality(field.id, field.granularity || 'month');
      if (n > CAP.color)
        return `Color takes ≤ ${CAP.color} values; ${meta.title} has ${n}. Use Trellis instead`;
      if (wells.color.length)
        return 'Color already has a dimension (Shift-drop is not allowed here)';
    }
    if (well === 'trellis' && wells.trellis.length)
      return 'One trellis dimension at a time in this prototype';
    return '';
  }

  window.RECO = { TYPES, recommend, illegal, CAP };
})();
