/* wechart prototype: engine-neutral encoding → ECharts option. Colours come from CSS tokens (both themes).
   Two interaction modes (dashboard setting): cross-filter (opts.onSelect / opts.highlight) and markings
   (opts.onMark / opts.mark) — see docs/design/references-markings.md and direction.md §7a. */
(function () {
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const palette = () => [1, 2, 3, 4, 5, 6, 7, 8].map((i) => css(`--s${i}`));
  const FIXED_DOMAINS = {
    'products.category': WC.CATEGORIES,
    'orders.shipper': WC.SHIPPERS,
    'customers.region': ['Europe', 'Americas'],
    'orders.is_late': ['On time', 'Late'],
  };
  const dynamicSlots = {};
  /** Colour follows the member, never its rank: fixed domains index into the palette; others keep first-seen slots. */
  function colorFor(dimId, value) {
    const p = palette();
    const dom = FIXED_DOMAINS[dimId];
    if (dom) {
      const i = dom.indexOf(value);
      return i >= 0 && i < 8 ? p[i] : css('--other');
    }
    const m = (dynamicSlots[dimId] ||= new Map());
    if (!m.has(value)) m.set(value, m.size);
    const i = m.get(value);
    return i < 8 ? p[i] : css('--other');
  }

  const title = (id) => (WC.byId[id] ? WC.byId[id].title : id);
  const fmtOf = (id) => (WC.byId[id] || {}).fmt;
  const uniq = (a) => [...new Set(a)];
  const grain = (enc, id) => (enc.grains && enc.grains[id]) || 'month';
  const dimsOf = (enc) =>
    uniq([enc.x, enc.series, enc.facet, enc.y].filter(Boolean)).map((id) => ({
      id,
      granularity: grain(enc, id),
    }));

  function queryFor(enc, filters, extra = []) {
    return WC.query({
      dims: dimsOf(enc),
      measures: [...enc.measures, ...extra],
      filters: filters || [],
    });
  }

  /* ---------- markings ---------- */
  const FADE = 0.28;
  const DECAL = () => ({
    symbol: 'rect',
    symbolSize: 1,
    rotation: Math.PI / 4,
    dashArrayX: [1, 0],
    dashArrayY: [2, 3],
    color: 'rgba(255,255,255,0.55)',
  });
  /** Marking context for one tile: which of its items are fully, partly or not marked (Power BI's values/highlights contract). */
  function markCtx(enc, rows, markedRows, mark) {
    const dims = dimsOf(enc);
    const key = (r) => dims.map((d) => r[d.id]).join('\u0001');
    const tuple = (r) =>
      dims.map((d) => ({ id: d.id, granularity: d.granularity, value: String(r[d.id]) }));
    const tuples = (r) => (r.__tail ? r.__tail.map(tuple) : [tuple(r)]);
    if (!markedRows) return { on: false, dims, key, tuple, tuples };
    const mm = new Map(markedRows.map((r) => [key(r), r]));
    const one = (r) => mm.get(key(r)) || {};
    const val = (r, m) =>
      r.__tail ? r.__tail.reduce((s, t) => s + (one(t)[m] || 0), 0) : one(r)[m] || 0;
    const state = (r) => {
      const n = val(r, '__rows'),
        all = r.__tail ? r.__tail.reduce((s, t) => s + t.__rows, 0) : r.__rows;
      return !n ? 'none' : n >= all ? 'full' : 'partial';
    };
    return {
      on: true,
      dims,
      key,
      tuple,
      tuples,
      val,
      state,
      color: mark.color,
      separate: !!mark.separate,
    };
  }
  const markedTip = (MK, r, m) =>
    MK.on
      ? `<br><span style="color:var(--text-secondary)">Marked: <b>${WC.fmt(MK.val(r, m), fmtOf(m))}</b>${WC.additive(m) && r[m] ? ` (${Math.round((MK.val(r, m) / r[m]) * 100)}%)` : ''}</span>`
      : '';
  /** Style for one item in a marking-aware tile: marked items keep their colour with an outline; unmarked fade (Spotfire default). */
  function itemMark(MK, st, color, extra = {}) {
    if (!MK.on) return { color, ...extra };
    if (st === 'none') return { color, opacity: MK.separate ? 1 : FADE, ...extra };
    return {
      color: MK.separate ? MK.color : color,
      borderColor: MK.color,
      borderWidth: 1.5,
      decal: st === 'partial' ? DECAL() : undefined,
      ...extra,
    };
  }

  function chrome(opts) {
    const text2 = css('--text-secondary'),
      grid = css('--grid'),
      axis = css('--axis');
    return {
      textStyle: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, color: text2 },
      axisX: (o = {}) => ({
        axisLine: { lineStyle: { color: axis } },
        axisTick: { show: false },
        axisLabel: {
          color: text2,
          fontSize: 12,
          rotate: (opts.x || {}).rotate || 0,
          hideOverlap: true,
        },
        splitLine: { show: !!(opts.x || {}).grid, lineStyle: { color: grid } },
        name: (opts.x || {}).showTitle ? (opts.x || {}).title : '',
        nameLocation: 'middle',
        nameGap: 28,
        nameTextStyle: { color: text2, fontWeight: 600 },
        ...o,
      }),
      axisY: (o = {}) => ({
        type: (opts.y || {}).log ? 'log' : 'value',
        scale: !(opts.y || {}).zero,
        min: (opts.y || {}).min === '' || (opts.y || {}).min == null ? null : +(opts.y || {}).min,
        max: (opts.y || {}).max === '' || (opts.y || {}).max == null ? null : +(opts.y || {}).max,
        axisLine: { show: false },
        axisLabel: { color: text2, fontSize: 12, formatter: (v) => WC.fmt(v, o.fmt, opts.numFmt) },
        splitLine: { show: (opts.y || {}).grid !== false, lineStyle: { color: grid } },
        name: (opts.y || {}).showTitle ? (opts.y || {}).title : '',
        nameLocation: 'middle',
        nameGap: 44,
        nameTextStyle: { color: text2, fontWeight: 600 },
        ...o,
      }),
      legend: (show) => ({
        show,
        type: 'scroll',
        top: (opts.legend || {}).pos === 'bottom' ? 'bottom' : 0,
        left: (opts.legend || {}).pos === 'right' ? 'right' : 0,
        orient: (opts.legend || {}).pos === 'right' ? 'vertical' : 'horizontal',
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: text2, fontSize: 12 },
        pageTextStyle: { color: text2 },
      }),
      tooltip: (trigger) => ({
        trigger,
        backgroundColor: css('--bg-raised'),
        borderColor: css('--border-strong'),
        textStyle: { color: css('--text-primary'), fontSize: 12 },
        axisPointer: { type: trigger === 'axis' ? 'line' : 'shadow', lineStyle: { color: axis } },
      }),
    };
  }

  function barItem(color) {
    return { color, borderRadius: [4, 4, 0, 0] };
  }
  /** Per-series overrides from the inspector: colour (palette slot only), hidden, dashed, markers. */
  function applySeries(series, opts) {
    const ov = opts.series || {};
    return series
      .filter((s) => !(ov[s.name] || {}).hidden)
      .map((s) => {
        const o = ov[s.name] || {};
        if (o.slot) {
          const c = palette()[o.slot - 1];
          s.itemStyle = { ...(s.itemStyle || {}), color: c };
          if (s.endLabel) s.endLabel.color = css('--text-secondary');
        }
        if (o.dashed && s.type === 'line') s.lineStyle = { ...(s.lineStyle || {}), type: 'dashed' };
        if (o.markers && s.type === 'line') {
          s.showSymbol = true;
          s.symbolSize = 8;
        }
        if (opts.stack === false && s.stack) delete s.stack;
        return s;
      });
  }
  /** Cross-filter mode "Highlight" interaction: fade marks that don't match the selection instead of filtering them away. */
  function highlight(option, enc, opts) {
    const h = opts.highlight;
    if (!h) return option;
    (option.series || []).forEach((s) => {
      if (h.dim === enc.x && Array.isArray(s.data))
        s.data = s.data.map((d, i) => {
          const name =
            option.yAxis && option.yAxis.data
              ? option.yAxis.data[i]
              : option.xAxis && option.xAxis.data
                ? option.xAxis.data[i]
                : null;
          const v = typeof d === 'object' && d !== null ? d : { value: d };
          return name != null && name !== h.value
            ? { ...v, itemStyle: { ...(v.itemStyle || {}), opacity: 0.25 } }
            : v;
        });
      if ((h.dim === enc.series || h.dim === enc.facet) && s.name !== h.value) {
        s.itemStyle = { ...(s.itemStyle || {}), opacity: 0.2 };
        s.lineStyle = { ...(s.lineStyle || {}), opacity: 0.2 };
        if (s.areaStyle) s.areaStyle = { ...s.areaStyle, opacity: 0.08 };
      }
    });
    return option;
  }

  function build(enc, type, rows, opts, MK) {
    const ch = chrome(opts);
    const m0 = enc.measures[0];
    const legendOn = (n) => (opts.legend || {}).show !== false && n >= 2;
    const topPad = (n) =>
      legendOn(n) && (opts.legend || {}).pos !== 'bottom' && (opts.legend || {}).pos !== 'right'
        ? 36
        : 12;
    const gridBase = (n) => ({
      left: 8,
      right: (opts.legend || {}).pos === 'right' && legendOn(n) ? 140 : 28,
      top: topPad(n),
      bottom: (opts.legend || {}).pos === 'bottom' && legendOn(n) ? 40 : 8,
      containLabel: true,
    });
    const labelOn = !!opts.labels;
    const add = WC.additive(m0);

    if (['bar', 'hbar', 'line', 'area'].includes(type)) {
      let rs = rows.slice();
      if (enc.sort && WC.byId[enc.x].type !== 'time')
        rs.sort(
          enc.sort === 'asc'
            ? (a, b) => a[m0] - b[m0]
            : enc.sort === 'label'
              ? (a, b) => String(a[enc.x]).localeCompare(String(b[enc.x]))
              : (a, b) => b[m0] - a[m0],
        );
      if (enc.topK && rs.length > enc.topK) {
        const head = rs.slice(0, enc.topK),
          tail = rs.slice(enc.topK);
        rs = [
          ...head,
          {
            [enc.x]: `Other (${tail.length})`,
            [m0]: tail.reduce((s, r) => s + r[m0], 0),
            __rows: tail.reduce((s, r) => s + (r.__rows || 0), 0),
            __other: true,
            __tail: tail,
          },
        ];
      }
      const cats = rs.map((r) => r[enc.x]);
      const horiz = type === 'hbar';
      if (horiz) {
        rs.reverse();
        cats.reverse();
      }
      const isBar = type === 'bar' || horiz;
      const ms =
        enc.measures.length > 1 && (type === 'line' || type === 'area') ? enc.measures : [m0];
      const cat = ch.axisX({ type: 'category', data: cats });
      const val = ch.axisY({ fmt: fmtOf(m0) });
      const baseColor = (r, i) => (r.__other ? css('--other') : palette()[i]);
      const endRadius = horiz ? [0, 4, 4, 0] : [4, 4, 0, 0];
      let series;
      if (MK.on && isBar && add) {
        // Marked share drawn from the baseline at full strength; the unmarked remainder fades (user decision 2026-09-19).
        const mv = rs.map((r) => MK.val(r, m0));
        series = [
          {
            name: title(m0),
            type: 'bar',
            stack: 'mk',
            barMaxWidth: 36,
            barCategoryGap: '28%',
            data: rs.map((r, i) => ({
              value: mv[i],
              mk: MK.tuples(r),
              itemStyle: {
                color: MK.separate ? MK.color : baseColor(r, 0),
                borderColor: MK.color,
                borderWidth: mv[i] ? 1.5 : 0,
                borderRadius: mv[i] >= r[m0] ? endRadius : 0,
              },
            })),
          },
          {
            name: title(m0),
            type: 'bar',
            stack: 'mk',
            barMaxWidth: 36,
            data: rs.map((r, i) => ({
              value: Math.max(0, r[m0] - mv[i]),
              mk: MK.tuples(r),
              itemStyle: {
                color: baseColor(r, 0),
                opacity: MK.separate ? 1 : FADE,
                borderRadius: endRadius,
              },
            })),
            label: {
              show: labelOn,
              position: horiz ? 'right' : 'top',
              color: css('--text-secondary'),
              fontSize: 12,
              formatter: (p) => WC.fmt(rs[p.dataIndex][m0], fmtOf(m0)),
            },
          },
        ];
      } else {
        series = ms.map((m, i) => ({
          name: title(m),
          type: type === 'area' ? 'line' : horiz ? 'bar' : type,
          data: rs.map((r) => {
            const st = MK.on ? MK.state(r) : null;
            return {
              value: r[m],
              mk: MK.tuples(r),
              itemStyle: MK.on
                ? itemMark(MK, st, baseColor(r, i), isBar ? { borderRadius: endRadius } : {})
                : r.__other
                  ? { color: css('--other') }
                  : undefined,
              symbolSize: MK.on && st !== 'none' ? 10 : 8,
            };
          }),
          smooth: false,
          showSymbol: MK.on || rs.length < 40,
          symbolSize: 8,
          lineStyle: { width: 2, opacity: MK.on && !isBar ? 0.55 : 1 },
          areaStyle: type === 'area' ? { opacity: 0.18 } : undefined,
          itemStyle: horiz
            ? { color: palette()[i], borderRadius: [0, 4, 4, 0] }
            : type === 'bar'
              ? barItem(palette()[i])
              : { color: palette()[i] },
          barMaxWidth: 36,
          barCategoryGap: '28%',
          label: {
            show: labelOn,
            position: horiz ? 'right' : 'top',
            color: css('--text-secondary'),
            fontSize: 12,
            formatter: (p) => WC.fmt(p.value, fmtOf(m)),
          },
        }));
        if (MK.on && !isBar && add)
          series.push({
            name: title(m0),
            type: 'line',
            z: 3,
            data: rs.map((r) => ({ value: MK.val(r, m0) || null, mk: MK.tuples(r) })),
            showSymbol: false,
            lineStyle: { width: 2.5, color: MK.separate ? MK.color : palette()[0] },
            itemStyle: { color: MK.separate ? MK.color : palette()[0] },
            areaStyle: type === 'area' ? { opacity: 0.3 } : undefined,
          });
      }
      const tip = {
        ...ch.tooltip(type === 'line' || type === 'area' ? 'axis' : 'item'),
        formatter: (p) => {
          const q = Array.isArray(p) ? p[0] : p;
          const r = rs[q.dataIndex];
          return `${r[enc.x]}<br>${ms.map((m) => `${title(m)}: <b>${WC.fmt(r[m], fmtOf(m))}</b>`).join('<br>')}${markedTip(MK, r, m0)}`;
        },
      };
      return {
        textStyle: ch.textStyle,
        grid: gridBase(ms.length),
        legend: ch.legend(legendOn(ms.length)),
        tooltip: tip,
        xAxis: horiz ? { ...val, name: '' } : cat,
        yAxis: horiz ? { ...cat, axisLabel: { ...cat.axisLabel, rotate: 0 } } : val,
        series: applySeries(series, opts),
      };
    }

    if (['multiline', 'stackedarea', 'stackedbar', 'groupedbar'].includes(type)) {
      const xs = uniq(rows.map((r) => r[enc.x]));
      if (type === 'multiline' && !enc.series) {
        return {
          textStyle: ch.textStyle,
          grid: gridBase(enc.measures.length),
          legend: ch.legend(legendOn(enc.measures.length)),
          tooltip: ch.tooltip('axis'),
          xAxis: ch.axisX({ type: 'category', data: xs }),
          yAxis: ch.axisY({ fmt: fmtOf(m0) }),
          series: enc.measures.map((m, i) => ({
            name: title(m),
            type: 'line',
            data: rows.map((r) => ({ value: r[m], mk: MK.tuples(r) })),
            showSymbol: false,
            lineStyle: { width: 2 },
            itemStyle: { color: palette()[i] },
          })),
        };
      }
      if (!enc.series) {
        return {
          textStyle: ch.textStyle,
          grid: gridBase(enc.measures.length),
          legend: ch.legend(legendOn(enc.measures.length)),
          tooltip: ch.tooltip('axis'),
          xAxis: ch.axisX({ type: 'category', data: xs }),
          yAxis: ch.axisY({}),
          series: enc.measures.map((m, i) => ({
            name: title(m),
            type: 'bar',
            data: rows.map((r) => ({ value: r[m], mk: MK.tuples(r) })),
            itemStyle: barItem(palette()[i]),
            barMaxWidth: 24,
          })),
        };
      }
      let groups = uniq(rows.map((r) => r[enc.series]));
      if (FIXED_DOMAINS[enc.series])
        groups = FIXED_DOMAINS[enc.series].filter((g) => groups.includes(g));
      if (enc.sort === 'desc') {
        const tot = {};
        rows.forEach((r) => {
          tot[r[enc.x]] = (tot[r[enc.x]] || 0) + r[m0];
        });
        xs.sort((a, b) => tot[b] - tot[a]);
      }
      const rowAt = (x, g) => rows.find((q) => q[enc.x] === x && q[enc.series] === g);
      const val = (x, g) => {
        const r = rowAt(x, g);
        return r ? r[m0] : 0;
      };
      const isLine = type === 'multiline' || type === 'stackedarea';
      const stack = (g) =>
        type === 'stackedarea' || type === 'stackedbar'
          ? 'total'
          : MK.on && add && !isLine
            ? `g:${g}`
            : undefined;
      const series = [];
      const groupState = {};
      groups.forEach((g) => {
        const color = colorFor(enc.series, g);
        const cells = xs.map((x) => rowAt(x, g));
        const st = MK.on ? cells.map((r) => (r ? MK.state(r) : 'none')) : null;
        const present = MK.on ? st.filter((s, i) => cells[i]) : [];
        groupState[g] = !MK.on
          ? 'full'
          : present.every((s) => s === 'none')
            ? 'none'
            : present.every((s) => s === 'full')
              ? 'full'
              : 'partial';
        const base = {
          name: g,
          type: isLine ? 'line' : 'bar',
          stack: stack(g),
          showSymbol: false,
          barMaxWidth: 28,
          emphasis: { focus: 'series' },
          triggerLineEvent: isLine,
          endLabel:
            type === 'multiline' && groups.length <= 4
              ? { show: true, formatter: '{a}', color: css('--text-secondary'), fontSize: 12 }
              : undefined,
        };
        if (MK.on && !isLine && add) {
          const mv = cells.map((r) => (r ? MK.val(r, m0) : 0));
          series.push({
            ...base,
            data: cells.map((r, i) => ({
              value: mv[i],
              mk: r ? MK.tuples(r) : [],
              itemStyle: {
                color: MK.separate ? MK.color : color,
                borderColor: MK.color,
                borderWidth: mv[i] ? 1.5 : 0,
              },
            })),
            itemStyle: { color },
          });
          series.push({
            ...base,
            data: cells.map((r, i) => ({
              value: Math.max(0, (r ? r[m0] : 0) - mv[i]),
              mk: r ? MK.tuples(r) : [],
              itemStyle: {
                color,
                opacity: MK.separate ? 1 : FADE,
                borderColor: css('--bg-surface'),
                borderWidth: 1,
              },
            })),
            itemStyle: { color },
          });
        } else if (MK.on && isLine) {
          const whole = groupState[g];
          series.push({
            ...base,
            data: cells.map((r) => ({ value: r ? r[m0] : 0, mk: r ? MK.tuples(r) : [] })),
            lineStyle: { width: 2, opacity: whole === 'none' ? FADE : 1 },
            areaStyle:
              type === 'stackedarea' ? { opacity: whole === 'none' ? 0.15 : 0.85 } : undefined,
            itemStyle: {
              color: MK.separate && whole !== 'none' ? MK.color : color,
              opacity: whole === 'none' ? FADE : 1,
            },
          });
          if (type === 'multiline' && whole === 'partial' && add)
            series.push({
              ...base,
              endLabel: undefined,
              z: 3,
              data: cells.map((r) => (r ? MK.val(r, m0) || null : null)),
              lineStyle: { width: 3, color: MK.separate ? MK.color : color },
              itemStyle: { color },
            });
        } else {
          series.push({
            ...base,
            data: cells.map((r, i) => ({
              value: val(xs[i], g),
              mk: r ? MK.tuples(r) : [],
              itemStyle: MK.on ? itemMark(MK, st[i], color) : undefined,
            })),
            lineStyle: { width: 2 },
            areaStyle: type === 'stackedarea' ? { opacity: 0.85 } : undefined,
            itemStyle: { color, borderColor: css('--bg-surface'), borderWidth: isLine ? 0 : 1 },
          });
        }
      });
      const g = gridBase(groups.length);
      if (type === 'multiline' && groups.length <= 4) g.right = 110;
      const legend = ch.legend(legendOn(groups.length));
      if (MK.on)
        legend.data = groups.map((n) =>
          groupState[n] === 'none'
            ? { name: n, itemStyle: { opacity: 0.35 }, textStyle: { color: css('--text-muted') } }
            : { name: n },
        );
      const tip = {
        ...ch.tooltip('axis'),
        formatter: (ps) => {
          const x = ps[0].axisValue;
          const seen = new Set();
          return `${x}<br>${ps
            .filter((p) => !seen.has(p.seriesName) && seen.add(p.seriesName))
            .map((p) => {
              const r = rowAt(x, p.seriesName);
              return `${p.marker}${p.seriesName}: <b>${WC.fmt(r ? r[m0] : 0, fmtOf(m0))}</b>${MK.on && r && MK.val(r, '__rows') ? ` · marked ${WC.fmt(MK.val(r, m0), fmtOf(m0))}` : ''}`;
            })
            .join('<br>')}`;
        },
      };
      return {
        textStyle: ch.textStyle,
        grid: g,
        legend,
        tooltip: tip,
        xAxis: ch.axisX({ type: 'category', data: xs, boundaryGap: !isLine }),
        yAxis: ch.axisY({ fmt: fmtOf(m0) }),
        series: applySeries(series, opts),
      };
    }

    if (type === 'facet') {
      const inner = enc.inner || 'line';
      const panels = enc.facetMeasures
        ? enc.measures.map((m) => ({ key: title(m), m, rows }))
        : uniq(rows.map((r) => r[enc.facet]))
            .slice(0, RECO.CAP.facet)
            .map((v) => ({ key: v, m: m0, rows: rows.filter((r) => r[enc.facet] === v) }));
      const n = panels.length,
        cols = Math.min(n, n <= 3 ? n : n <= 8 ? 4 : 5),
        rowsN = Math.ceil(n / cols);
      const xs = enc.x ? uniq(rows.map((r) => r[enc.x])) : [''];
      const ymax = enc.facetMeasures ? null : Math.max(...rows.map((r) => r[m0]));
      const opt = {
        textStyle: ch.textStyle,
        tooltip: ch.tooltip('axis'),
        grid: [],
        xAxis: [],
        yAxis: [],
        series: [],
        title: [],
      };
      panels.forEach((p, i) => {
        const c = i % cols,
          r = Math.floor(i / cols);
        const w = 100 / cols,
          h = 100 / rowsN;
        const cells = xs.map((x) => p.rows.find((rr) => rr[enc.x] === x));
        const st = MK.on ? cells.map((q) => (q ? MK.state(q) : 'none')) : [];
        const any = MK.on && st.some((s) => s !== 'none');
        opt.grid.push({
          left: `${c * w + 2}%`,
          width: `${w - 5}%`,
          top: `${r * h + 11}%`,
          height: `${h - 19}%`,
          containLabel: true,
        });
        opt.title.push({
          text: String(p.key),
          left: `${c * w + 2}%`,
          top: `${r * h + 1}%`,
          triggerEvent: !enc.facetMeasures,
          textStyle: {
            fontSize: 12,
            fontWeight: 600,
            color: MK.on && !any ? css('--text-muted') : css('--text-primary'),
          },
        });
        opt.xAxis.push(
          ch.axisX({
            gridIndex: i,
            type: 'category',
            data: xs,
            axisLabel: {
              show: r === rowsN - 1,
              color: css('--text-secondary'),
              fontSize: 12,
              hideOverlap: true,
              interval: Math.max(0, Math.ceil(xs.length / 3) - 1),
            },
          }),
        );
        opt.yAxis.push(
          ch.axisY({
            gridIndex: i,
            max: ymax || null,
            splitNumber: 2,
            fmt: fmtOf(p.m),
            axisLabel: {
              show: c === 0 || !!enc.facetMeasures,
              color: css('--text-secondary'),
              fontSize: 12,
              formatter: (v) => WC.fmt(v, fmtOf(p.m)),
            },
          }),
        );
        const color = enc.facet ? colorFor(enc.facet, p.key) : palette()[i % 8];
        opt.series.push({
          name: String(p.key),
          type: inner,
          xAxisIndex: i,
          yAxisIndex: i,
          data: cells.map((q) => ({ value: q ? q[p.m] : 0, mk: q ? MK.tuples(q) : [] })),
          showSymbol: false,
          lineStyle: { width: 2, opacity: MK.on && !st.every((s) => s === 'full') ? FADE : 1 },
          areaStyle: inner === 'line' ? { opacity: MK.on && !any ? 0.05 : 0.12 } : undefined,
          itemStyle: inner === 'bar' ? barItem(color) : { color },
          barMaxWidth: 16,
        });
        if (MK.on && any && !st.every((s) => s === 'full') && WC.additive(p.m))
          opt.series.push({
            name: String(p.key),
            type: 'line',
            xAxisIndex: i,
            yAxisIndex: i,
            z: 3,
            data: cells.map((q) => (q ? MK.val(q, p.m) || null : null)),
            showSymbol: false,
            lineStyle: { width: 2.5, color: MK.separate ? MK.color : color },
            itemStyle: { color },
          });
      });
      opt.__panels = panels;
      return opt;
    }

    if (type === 'combo') {
      const [m1, m2] = enc.measures;
      const xs = rows.map((r) => r[enc.x]);
      return {
        textStyle: ch.textStyle,
        grid: gridBase(2),
        legend: ch.legend(legendOn(2)),
        tooltip: ch.tooltip('axis'),
        xAxis: ch.axisX({ type: 'category', data: xs }),
        yAxis: [
          ch.axisY({ fmt: fmtOf(m1) }),
          ch.axisY({ fmt: fmtOf(m2), splitLine: { show: false } }),
        ],
        series: applySeries(
          [
            {
              name: title(m1),
              type: 'bar',
              data: rows.map((r) => ({
                value: r[m1],
                mk: MK.tuples(r),
                itemStyle: MK.on
                  ? itemMark(MK, MK.state(r), palette()[0], { borderRadius: [4, 4, 0, 0] })
                  : undefined,
              })),
              itemStyle: barItem(palette()[0]),
              barMaxWidth: 24,
            },
            {
              name: title(m2),
              type: 'line',
              yAxisIndex: 1,
              data: rows.map((r) => ({ value: r[m2], mk: MK.tuples(r) })),
              showSymbol: false,
              lineStyle: { width: 2 },
              itemStyle: { color: palette()[1] },
            },
          ],
          opts,
        ),
      };
    }

    if (type === 'heatmap') {
      const xs = uniq(rows.map((r) => r[enc.x])),
        ys = uniq(rows.map((r) => r[enc.y]));
      const data = rows.map((r) => {
        const st = MK.on ? MK.state(r) : null;
        return {
          value: [xs.indexOf(r[enc.x]), ys.indexOf(r[enc.y]), r[m0]],
          mk: MK.tuples(r),
          itemStyle: MK.on
            ? st === 'none'
              ? { opacity: FADE }
              : {
                  borderColor: MK.color,
                  borderWidth: st === 'full' ? 2.5 : 1.5,
                  borderType: st === 'partial' ? 'dashed' : 'solid',
                }
            : undefined,
        };
      });
      const vals = rows.map((r) => r[m0]);
      return {
        textStyle: ch.textStyle,
        tooltip: {
          ...ch.tooltip('item'),
          formatter: (p) => {
            const r = rows[p.dataIndex];
            return `${ys[p.value[1]]} · ${xs[p.value[0]]}<br><b>${WC.fmt(p.value[2], fmtOf(m0))}</b>${markedTip(MK, r, m0)}`;
          },
        },
        grid: { left: 8, right: 16, top: 8, bottom: 44, containLabel: true },
        xAxis: ch.axisX({ type: 'category', data: xs, splitArea: { show: false } }),
        yAxis: {
          type: 'category',
          data: ys,
          axisLabel: { color: css('--text-secondary'), fontSize: 12 },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        visualMap: {
          min: Math.min(...vals),
          max: Math.max(...vals),
          orient: 'horizontal',
          left: 'center',
          bottom: 0,
          itemHeight: 120,
          itemWidth: 10,
          calculable: false,
          textStyle: { color: css('--text-secondary'), fontSize: 12 },
          inRange: { color: ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'] },
          formatter: (v) => WC.fmt(v, fmtOf(m0)),
        },
        series: [
          {
            type: 'heatmap',
            data,
            itemStyle: { borderColor: css('--bg-surface'), borderWidth: 2, borderRadius: 2 },
          },
        ],
      };
    }

    if (type === 'scatter') {
      const [mx, my] = enc.measures;
      return {
        textStyle: ch.textStyle,
        tooltip: {
          ...ch.tooltip('item'),
          formatter: (p) =>
            `<b>${p.data.name}</b><br>${title(mx)}: ${WC.fmt(p.data.value[0], fmtOf(mx))}<br>${title(my)}: ${WC.fmt(p.data.value[1], fmtOf(my))}`,
        },
        grid: { left: 8, right: 24, top: 16, bottom: 32, containLabel: true },
        xAxis: ch.axisY({ fmt: fmtOf(mx), name: title(mx), nameLocation: 'middle', nameGap: 26 }),
        yAxis: ch.axisY({ fmt: fmtOf(my), name: title(my), nameLocation: 'middle', nameGap: 52 }),
        series: [
          {
            type: 'scatter',
            symbolSize: 10,
            itemStyle: { color: palette()[0], borderColor: css('--bg-surface'), borderWidth: 2 },
            label: {
              show: true,
              position: 'right',
              formatter: (p) => p.data.name,
              color: css('--text-secondary'),
              fontSize: 12,
            },
            labelLayout: { hideOverlap: true },
            data: rows.map((r) => ({
              name: r[enc.x],
              value: [r[mx], r[my]],
              mk: MK.tuples(r),
              itemStyle: MK.on ? itemMark(MK, MK.state(r), palette()[0]) : undefined,
            })),
          },
        ],
      };
    }

    if (type === 'pie' || type === 'treemap') {
      const sorted = rows.slice().sort((a, b) => b[m0] - a[m0]);
      const data = sorted.map((r) => {
        const color = colorFor(enc.x, r[enc.x]);
        const st = MK.on ? MK.state(r) : null;
        return {
          name: r[enc.x],
          value: r[m0],
          mk: MK.tuples(r),
          itemStyle: MK.on
            ? itemMark(MK, st, color, {
                borderColor: st === 'none' ? css('--bg-surface') : MK.color,
                borderWidth: 2,
              })
            : { color, borderColor: css('--bg-surface'), borderWidth: 2 },
        };
      });
      const tipF = (p) =>
        `${p.name}<br><b>${WC.fmt(p.value, fmtOf(m0))}</b>${p.percent != null ? ` (${p.percent}%)` : ''}${markedTip(MK, sorted[p.dataIndex], m0)}`;
      if (type === 'treemap')
        return {
          textStyle: ch.textStyle,
          tooltip: { ...ch.tooltip('item'), formatter: tipF },
          series: [
            {
              type: 'treemap',
              roam: false,
              nodeClick: false,
              breadcrumb: { show: false },
              top: 4,
              left: 4,
              right: 4,
              bottom: 4,
              label: {
                color: '#fff',
                fontSize: 12,
                formatter: (p) => `${p.name}\n${WC.fmt(p.value, fmtOf(m0))}`,
              },
              data,
            },
          ],
        };
      const legend = ch.legend(legendOn(data.length));
      if (MK.on)
        legend.data = sorted.map((r) =>
          MK.state(r) === 'none'
            ? {
                name: r[enc.x],
                itemStyle: { opacity: 0.35 },
                textStyle: { color: css('--text-muted') },
              }
            : { name: r[enc.x] },
        );
      return {
        textStyle: ch.textStyle,
        tooltip: { ...ch.tooltip('item'), formatter: tipF },
        legend,
        series: [
          {
            type: 'pie',
            radius: ['48%', '76%'],
            center: ['50%', '56%'],
            avoidLabelOverlap: true,
            label: { color: css('--text-secondary'), fontSize: 12, formatter: '{b}' },
            data,
          },
        ],
      };
    }

    if (type === 'parallel') {
      const ms = enc.measures;
      return {
        textStyle: ch.textStyle,
        tooltip: { trigger: 'item' },
        parallel: {
          left: 40,
          right: 60,
          top: 30,
          bottom: 30,
          parallelAxisDefault: {
            nameTextStyle: { color: css('--text-primary'), fontWeight: 600 },
            axisLabel: { color: css('--text-secondary') },
            axisLine: { lineStyle: { color: css('--axis') } },
          },
        },
        parallelAxis: ms.map((m, i) => ({ dim: i, name: title(m) })),
        series: [
          {
            type: 'parallel',
            lineStyle: { width: 1.5, opacity: 0.7, color: palette()[0] },
            data: rows.map((r) => ms.map((m) => r[m])),
          },
        ],
      };
    }
    return null;
  }

  function html(el, content) {
    const inst = echarts.getInstanceByDom(el);
    if (inst) inst.dispose();
    el.innerHTML = content;
  }

  function kpiHtml(enc, rows) {
    const r = rows[0] || {};
    return `<div style="display:flex;gap:32px;flex-wrap:wrap;align-items:flex-end;height:100%;padding:8px 4px">${enc.measures.map((m) => `<div><div class="xs sec strong">${title(m)}</div><div class="kpi-val">${WC.fmt(r[m], fmtOf(m))}</div></div>`).join('')}</div>`;
  }

  const rowCls = (MK, r) => {
    if (!MK.on) return '';
    const st = MK.state(r);
    return st === 'full' ? 'mk-full' : st === 'partial' ? 'mk-part' : 'mk-none';
  };
  function pivotHtml(enc, rows, MK) {
    const m = enc.measures[0],
      rk = enc.x,
      ck = enc.series;
    if (!ck) return tableHtml(enc, rows, MK);
    const rs = uniq(rows.map((r) => r[rk])),
      cs = uniq(rows.map((r) => r[ck]));
    const find = (a, b) => rows.find((q) => q[rk] === a && q[ck] === b);
    const cell = (a, b) => {
      const r = find(a, b);
      return r ? r[m] : 0;
    };
    const max = Math.max(...rows.map((r) => r[m]));
    const shade = (v) =>
      `background: color-mix(in srgb, var(--s1) ${Math.round((v / max) * 38)}%, transparent)`;
    return `<div style="overflow:auto;height:100%"><table class="grid-table comfy"><thead><tr><th>${title(rk)} \\ ${title(ck)}</th>${cs.map((c) => `<th class="num">${c}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${rs
      .map(
        (a) =>
          `<tr><td class="strong">${a}</td>${cs
            .map((b) => {
              const r = find(a, b);
              return `<td class="num ${r ? rowCls(MK, r) : ''}" ${r ? `data-ri="${rows.indexOf(r)}"` : ''} style="${shade(cell(a, b))}">${WC.fmt(cell(a, b), fmtOf(m))}</td>`;
            })
            .join('')}<td class="num strong">${WC.fmt(
            cs.reduce((t, b) => t + cell(a, b), 0),
            fmtOf(m),
          )}</td></tr>`,
      )
      .join('')}<tr><td class="strong">Total</td>${cs
      .map(
        (b) =>
          `<td class="num strong">${WC.fmt(
            rs.reduce((t, a) => t + cell(a, b), 0),
            fmtOf(m),
          )}</td>`,
      )
      .join('')}<td class="num strong">${WC.fmt(
      rows.reduce((t, r) => t + r[m], 0),
      fmtOf(m),
    )}</td></tr></tbody></table></div>`;
  }

  function tableHtml(enc, rows, MK = { on: false }) {
    const cols = [...uniq([enc.x, enc.series].filter(Boolean)), ...enc.measures];
    return `<div style="overflow:auto;height:100%"><table class="grid-table comfy"><thead><tr>${cols.map((c) => `<th class="${WC.byId[c].role === 'measure' ? 'num' : ''}">${title(c)}</th>`).join('')}</tr></thead><tbody>${rows
      .slice(0, 200)
      .map(
        (r, i) =>
          `<tr data-ri="${i}" class="${rowCls(MK, r)}">${cols.map((c) => `<td class="${WC.byId[c].role === 'measure' ? 'num' : ''}">${WC.byId[c].role === 'measure' ? WC.fmt(r[c], fmtOf(c)) : r[c]}</td>`).join('')}</tr>`,
      )
      .join('')}</tbody></table></div>`;
  }

  /* ---------- gestures (markings mode) ---------- */
  /** Item click = mousedown and mouseup on the same series item or title, with no drag in between. Pairing the two is
      independent of whether the DOM 'click' reaches the canvas, and it can't be confused with a rectangle or lasso drag. */
  function onItemClick(inst, fn) {
    let down = null;
    inst.off('mousedown');
    inst.off('mouseup');
    inst.on('mousedown', (p) => {
      down = {
        c: p.componentType,
        s: p.seriesIndex,
        i: p.dataIndex,
        ci: p.componentIndex,
        x: p.event && p.event.offsetX,
        y: p.event && p.event.offsetY,
      };
    });
    inst.on('mouseup', (p) => {
      const d = down;
      down = null;
      if (
        !d ||
        d.c !== p.componentType ||
        d.s !== p.seriesIndex ||
        d.i !== p.dataIndex ||
        d.ci !== p.componentIndex
      )
        return;
      if (p.event && d.x != null && Math.hypot(p.event.offsetX - d.x, p.event.offsetY - d.y) > 4)
        return;
      fn(p);
    });
  }
  const keys = { ctrl: false };
  window.addEventListener('keydown', (e) => {
    keys.ctrl = e.ctrlKey || e.metaKey;
  });
  window.addEventListener('keyup', (e) => {
    keys.ctrl = e.ctrlKey || e.metaKey;
  });
  window.addEventListener('blur', () => {
    keys.ctrl = false;
  });
  const arr = (a) => (Array.isArray(a) ? a : a ? [a] : []);
  const inPoly = (x, y, pts) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i],
        [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  /** Items whose mark lies in a dragged rectangle or lasso, found through ECharts' public convertToPixel.
      Bars count when any part of the bar is inside; points, cells and line vertices when their centre is. */
  function itemsInArea(inst, option, area) {
    const inside = (x, y) =>
      area.poly
        ? inPoly(x, y, area.poly)
        : x >= area.x0 && x <= area.x1 && y >= area.y0 && y <= area.y1;
    const seen = new Set(),
      out = [];
    const take = (d) =>
      (d.mk || []).forEach((t) => {
        const k = JSON.stringify(t);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(t);
        }
      });
    const sums = {};
    arr(option.series).forEach((s, si) => {
      const xi = s.xAxisIndex || 0,
        yi = s.yAxisIndex || 0;
      const xa = arr(option.xAxis)[xi] || {},
        ya = arr(option.yAxis)[yi] || {};
      const horiz = ya.type === 'category';
      const px = (v) => inst.convertToPixel({ xAxisIndex: xi }, v),
        py = (v) => inst.convertToPixel({ yAxisIndex: yi }, v);
      (s.data || []).forEach((d, j) => {
        if (!d || typeof d !== 'object' || !d.mk || !d.mk.length) return;
        const v = d.value;
        if (s.type === 'scatter') {
          if (inside(px(v[0]), py(v[1]))) take(d);
          return;
        }
        if (s.type === 'heatmap') {
          if (inside(px(v[0]), py(v[1]))) take(d);
          return;
        }
        if (s.type !== 'bar' && s.type !== 'line') return;
        const cat = (horiz ? ya : xa).data ? j : j;
        const key = `${s.stack || `solo${si}`}|${xi}|${cat}`;
        const base = s.stack ? sums[key] || 0 : 0,
          top = base + (+v || 0);
        if (s.stack) sums[key] = top;
        if (s.type === 'line') {
          if (horiz ? inside(px(top), py(cat)) : inside(px(cat), py(top))) take(d);
          return;
        }
        // bar: sample along its length so a rectangle or lasso that touches any part of it counts
        for (let k = 0; k <= 8; k++) {
          const val = base + ((top - base) * k) / 8;
          if (horiz ? inside(px(val), py(cat)) : inside(px(cat), py(val))) {
            take(d);
            break;
          }
        }
      });
    });
    return out;
  }
  /** Click-and-drag draws a rectangle; Alt+drag draws a lasso (Spotfire). Drawn as a DOM overlay so plain clicks still reach the chart. */
  function wireDrag(el, inst, option, onMark) {
    el.onpointerdown = (e) => {
      if (e.button !== 0) return;
      const r0 = el.getBoundingClientRect(),
        p0 = [e.clientX - r0.left, e.clientY - r0.top];
      const lasso = e.altKey,
        pts = [p0];
      let ov = null;
      const move = (ev) => {
        const p = [ev.clientX - r0.left, ev.clientY - r0.top];
        if (!ov && Math.hypot(p[0] - p0[0], p[1] - p0[1]) < 5) return;
        if (!ov) {
          ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          ov.setAttribute('class', 'mk-drag');
          el.appendChild(ov);
          inst.dispatchAction({ type: 'hideTip' });
        }
        pts.push(p);
        const shape = lasso
          ? `<polygon points="${pts.map((q) => q.join(',')).join(' ')}"/>`
          : `<rect x="${Math.min(p0[0], p[0])}" y="${Math.min(p0[1], p[1])}" width="${Math.abs(p[0] - p0[0])}" height="${Math.abs(p[1] - p0[1])}"/>`;
        ov.innerHTML = shape;
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        if (!ov) return;
        ov.remove();
        el.__dragEnd = Date.now();
        const p = pts[pts.length - 1];
        const area = lasso
          ? { poly: pts }
          : {
              x0: Math.min(p0[0], p[0]),
              x1: Math.max(p0[0], p[0]),
              y0: Math.min(p0[1], p[1]),
              y1: Math.max(p0[1], p[1]),
            };
        const tuples = itemsInArea(inst, option, area);
        if (tuples.length)
          onMark(
            tuples,
            { ctrl: ev.ctrlKey || ev.metaKey, shift: false, alt: lasso },
            lasso ? 'lasso' : 'rect',
          );
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  }
  const mods = (e) => ({
    ctrl: !!(e && (e.ctrlKey || e.metaKey)),
    shift: !!(e && e.shiftKey),
    alt: !!(e && e.altKey),
  });

  function wireMarking(el, inst, option, type, enc, rows, MK, opts) {
    const onMark = opts.onMark;
    // Click an item: replace; Ctrl/Cmd+click: toggle (Spotfire).
    const recentDrag = () => el.__dragEnd && Date.now() - el.__dragEnd < 300;
    onItemClick(inst, (p) => {
      el.__clickedItem = true;
      if (recentDrag()) return;
      if (p.componentType === 'title' && option.__panels) {
        const panel = option.__panels[p.componentIndex];
        if (panel)
          onMark(
            [[{ id: enc.facet, granularity: grain(enc, enc.facet), value: String(panel.key) }]],
            mods(p.event && p.event.event),
            'panel',
          );
        return;
      }
      const t = p.data && p.data.mk;
      if (t && t.length) onMark(t, mods(p.event && p.event.event), 'item');
    });
    // Legend text marks every item of that category; Ctrl/Cmd adds (Spotfire). Series visibility lives elsewhere.
    inst.on('legendselectchanged', (p) => {
      inst.dispatchAction({ type: 'legendAllSelect' });
      const dim = type === 'pie' ? enc.x : enc.series;
      if (dim)
        onMark(
          [[{ id: dim, granularity: grain(enc, dim), value: String(p.name) }]],
          { ctrl: keys.ctrl, shift: false, alt: false },
          'legend',
        );
    });
    // Click empty plot area: unmark this tile's marking.
    inst.getZr().on('click', (e) => {
      setTimeout(() => {
        if (!el.__clickedItem && !e.target && !recentDrag()) onMark([], mods(e.event), 'clear');
        el.__clickedItem = false;
      }, 0);
    });
    // Drag: rectangle (Alt: lasso) marks the enclosed items; Ctrl/Cmd adds or toggles (ToggleOrAdd).
    if (
      [
        'bar',
        'hbar',
        'line',
        'area',
        'stackedbar',
        'groupedbar',
        'multiline',
        'stackedarea',
        'scatter',
        'combo',
        'heatmap',
        'facet',
      ].includes(type)
    )
      wireDrag(el, inst, option, onMark);
    else el.onpointerdown = null;
    // Tables: click a row marks it; Ctrl/Cmd toggles; Shift marks the range from the anchor row (Spotfire).
  }

  function wireTable(el, rows, MK, opts) {
    el.onclick = (e) => {
      const td = e.target.closest('[data-ri]');
      if (!td) {
        if (opts.onMark) opts.onMark([], mods(e), 'clear');
        return;
      }
      const i = +td.dataset.ri,
        m = mods(e);
      if (m.shift && el.__anchor != null) {
        const [a, b] = [Math.min(el.__anchor, i), Math.max(el.__anchor, i)];
        opts.onMark(rows.slice(a, b + 1).map(MK.tuple), { ctrl: m.ctrl, shift: false }, 'range');
        return;
      }
      el.__anchor = i;
      opts.onMark([MK.tuple(rows[i])], m, 'row');
    };
  }

  /** Renders a candidate into el.
      opts: { legend, x, y, labels, onSelect(dim, value) | onMark(tuples, mods, how), mark: { filter, color, separate } }. Returns query stats. */
  function render(el, enc, type, opts = {}, filters = []) {
    const marking = !!opts.onMark || !!opts.mark;
    const res = queryFor(enc, filters, marking ? ['__rows'] : []);
    const markedRows =
      opts.mark && opts.mark.filter
        ? queryFor(enc, [...filters, opts.mark.filter], ['__rows']).rows
        : null;
    const MK = markCtx(enc, res.rows, markedRows, opts.mark || {});
    el.__mk = MK;
    el.__type = type;
    el.__enc = enc;
    el.__rowsAll = res.rows;
    if (type === 'kpi') {
      html(el, kpiHtml(enc, res.rows));
      return res;
    }
    if (type === 'table' || type === 'pivot') {
      html(el, type === 'table' ? tableHtml(enc, res.rows, MK) : pivotHtml(enc, res.rows, MK));
      if (opts.onMark) wireTable(el, res.rows, MK, opts);
      return res;
    }
    if (!el.__ec || (el.innerHTML && !echarts.getInstanceByDom(el))) {
      el.innerHTML = '';
    }
    const inst = echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: 'canvas' });
    let option = build(enc, type, res.rows, opts, MK);
    if (!opts.onMark) option = highlight(option, enc, opts);
    inst.setOption(option, true);
    ['click', 'legendselectchanged'].forEach((ev) => inst.off(ev));
    inst.getZr().off('click');
    if (!opts.onMark) el.onpointerdown = null;
    if (opts.onMark) wireMarking(el, inst, option, type, enc, res.rows, MK, opts);
    else if (opts.onSelect)
      onItemClick(inst, (p) => {
        const dim =
          type === 'pie' || type === 'treemap' || type === 'bar' || type === 'hbar'
            ? enc.x
            : ['stackedbar', 'groupedbar', 'multiline', 'stackedarea'].includes(type)
              ? enc.series
              : type === 'facet'
                ? enc.facet
                : enc.x;
        const value = ['stackedbar', 'groupedbar', 'multiline', 'stackedarea'].includes(type)
          ? p.seriesName
          : type === 'facet'
            ? p.seriesName
            : p.name;
        if (dim && value != null) opts.onSelect(dim, String(value).replace(/^Other \(\d+\)$/, ''));
      });
    if (!el.__ro) {
      el.__ro = new ResizeObserver(() => {
        const i = echarts.getInstanceByDom(el);
        if (i) i.resize();
      });
      el.__ro.observe(el);
    }
    el.__ec = true;
    return res;
  }

  /** Items a tile can mark from the keyboard, in reading order: [{label, tuples}] (arrow keys move focus, Space marks). */
  function items(el) {
    const MK = el.__mk,
      rows = el.__rowsAll || [],
      enc = el.__enc;
    if (!MK || !enc) return [];
    return rows.map((r) => ({
      label: MK.dims.map((d) => r[d.id]).join(' · '),
      tuples: [MK.tuple(r)],
      x: r[enc.x],
    }));
  }

  window.CH = { render, queryFor, colorFor, title, fmtOf, items, dimsOf, onItemClick };
})();
