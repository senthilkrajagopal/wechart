/* wechart prototype: dashboard settings page (gear icon). Full-viewport, like the chart editor.
   Sections: General · Interactions (Markings vs Cross-filtering, a per-dashboard choice) · Markings · Cross-filtering · Layout.
   Both interaction configurations are kept; only the selected one is active (user, 2026-09-19). */
(function () {
  const esc = UI.esc,
    SV = UI.STATUS_SVG;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /** props: { dash, tiles: [{id, title, kpi, marking, limit}], folders, section, onSave(draft), onClose() } */
  function open(props) {
    const d = props.dash;
    const draft = {
      name: d.name,
      description: d.description || '',
      folder: d.folder,
      settings: clone(d.settings),
      tiles: Object.fromEntries(
        props.tiles.map((t) => [
          t.id,
          {
            marking: t.marking,
            limit: clone(t.limit || { ids: [], combine: 'and', empty: 'message', message: '' }),
          },
        ]),
      ),
    };
    const initial = JSON.stringify(draft);
    const S = { section: props.section || 'general', confirm: false, err: '' };
    const host = document.createElement('div');
    host.className = 'editor-overlay settings-overlay';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Dashboard settings');
    host.tabIndex = -1;
    document.body.appendChild(host);
    const st = () => draft.settings;
    const mkName = (id) => (st().markings.find((m) => m.id === id) || {}).name || '(None)';
    const defaultMk = () =>
      (st().markings.find((m) => m.isDefault) || st().markings[0] || {}).id || null;
    const tileMk = (t) =>
      draft.tiles[t.id].marking === undefined ? defaultMk() : draft.tiles[t.id].marking;
    const usedBy = (id) => props.tiles.filter((t) => !t.kpi && tileMk(t) === id).length;
    const limits = (id) =>
      props.tiles.filter((t) => draft.tiles[t.id].limit.ids.includes(id)).length;
    const dirty = () => JSON.stringify(draft) !== initial;
    const NAV = [
      ['general', 'General'],
      ['interactions', 'Interactions'],
      ['markings', 'Markings'],
      ['crossfilter', 'Cross-filtering'],
      ['layout', 'Layout'],
    ];
    const inactive = (k) =>
      (k === 'markings' && st().interaction !== 'markings') ||
      (k === 'crossfilter' && st().interaction !== 'crossfilter');
    const swatch = (slot, size = 14) =>
      `<i class="mk-swatch" style="--mk:var(--mk${slot});width:${size}px;height:${size}px"></i>`;

    function general() {
      return `<h2>General</h2><div class="formgrid"><div class="field"><label for="s-name">Name</label><input id="s-name" class="input" data-f="name" value="${esc(draft.name)}"></div><div class="field"><label for="s-folder">Folder</label><select id="s-folder" class="select" data-f="folder">${props.folders.map((f) => `<option value="${f.id}" ${f.id === draft.folder ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div><div class="field wide"><label for="s-desc">Description</label><textarea id="s-desc" class="input" rows="3" data-f="description" style="font-family:var(--font-ui)">${esc(draft.description)}</textarea></div></div>`;
    }
    function interactions() {
      const card = (k, t, body, refs) =>
        `<label class="radio-card ${st().interaction === k ? 'on' : ''}"><input type="radio" name="imode" value="${k}" data-imode ${st().interaction === k ? 'checked' : ''}><span><span class="strong" style="font-size:14px">${t}</span><span class="sec" style="display:block;margin-top:4px">${body}</span><span class="xs muted" style="display:block;margin-top:6px">${refs}</span></span></label>`;
      return `<h2>Interactions</h2><p class="sec" style="margin-top:0">How clicking a chart affects the other tiles on this dashboard. Choose one; the other stays configured but inactive.</p>
        <div class="radio-cards" role="radiogroup" aria-label="Interaction mode">
        ${card('markings', 'Markings', 'Clicking, dragging a rectangle or lasso marks items in a named, coloured marking. Every tile that uses the same marking shows the marked share and fades the rest, across all page tabs. Details tiles can be limited to what is marked.', 'Spotfire-style · Ctrl/⌘ adds or toggles · Esc unmarks')}
        ${card('crossfilter', 'Cross-filtering and cross-highlighting', 'Clicking a bar or slice filters or highlights the other tiles. Each source → target pair can be set to Filter, Highlight or None.', 'Power BI / Superset-style · one selection per tile')}
        </div>
        <p class="xs muted">Switching clears any current marks or cross-filters. Saved dashboards keep marking definitions, not marked items; a copied link carries the marks.</p>`;
    }
    function markings() {
      const ms = st().markings;
      const note = inactive('markings')
        ? `<div class="warnbar" style="border-radius:6px">${SV.warn}<span>Inactive: this dashboard uses cross-filtering. These settings apply if you switch to Markings.</span></div>`
        : '';
      const rows = ms
        .map(
          (m) =>
            `<tr><td><div class="mk-slots" role="radiogroup" aria-label="Colour for ${esc(m.name)}">${[1, 2, 3, 4].map((s) => `<button class="mk-slot" role="radio" aria-checked="${m.slot === s}" data-mkslot="${m.id}:${s}" aria-label="Colour ${s}">${swatch(s, 16)}</button>`).join('')}</div></td><td><input class="input sm" data-mkname="${m.id}" value="${esc(m.name)}" aria-label="Marking name"></td><td><label class="inline" style="gap:6px"><input type="radio" name="mkdefault" data-mkdefault="${m.id}" ${m.isDefault ? 'checked' : ''}> Default</label></td><td class="xs sec">Used by ${usedBy(m.id)} · limits ${limits(m.id)}</td><td><button class="btn ghost sm" data-mkdel="${m.id}" ${ms.length === 1 ? 'disabled title="A dashboard keeps at least one marking"' : ''} aria-label="Delete ${esc(m.name)}">Delete</button></td></tr>`,
        )
        .join('');
      const tiles = props.tiles
        .map((t) => {
          const cfg = draft.tiles[t.id];
          const own = tileMk(t);
          return `<tr><td class="strong">${esc(t.title)}</td><td>${t.kpi ? '<span class="xs muted">KPI tiles can\'t mark</span>' : `<select class="select sm" data-tmk="${t.id}" aria-label="Marking for ${esc(t.title)}"><option value="" ${own === null ? 'selected' : ''}>(None)</option>${ms.map((m) => `<option value="${m.id}" ${own === m.id ? 'selected' : ''}>${esc(m.name)}${m.isDefault ? ' (default)' : ''}</option>`).join('')}</select>`}</td><td><div class="inline" style="gap:4px;flex-wrap:wrap">${ms.map((m) => `<label class="chk ${own === m.id && !t.kpi ? 'dis' : ''}" title="${own === m.id && !t.kpi ? "A tile can't be limited by the marking it marks with" : ''}"><input type="checkbox" data-tlim="${t.id}:${m.id}" ${cfg.limit.ids.includes(m.id) ? 'checked' : ''} ${own === m.id && !t.kpi ? 'disabled' : ''}>${swatch(m.slot, 10)} ${esc(m.name)}</label>`).join('')}</div></td></tr>`;
        })
        .join('');
      return `<h2>Markings</h2>${note}<p class="sec" style="margin-top:0">A marking is a named, coloured selection shared by every tile that uses it, on every page tab. New chart tiles use the default marking.</p>
        <table class="grid-table"><thead><tr><th>Colour</th><th>Name</th><th></th><th>Tiles</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        <button class="btn sm" data-mknew ${ms.length >= MARKINGS.SLOTS ? `disabled title="${MARKINGS.SLOTS} marking colours are validated against the chart palette"` : ''}>+ New marking</button>
        ${S.err ? `<div class="status err">${SV.err} ${esc(S.err)}</div>` : ''}
        <h3 style="margin-top:20px">Tiles and markings</h3><p class="xs sec" style="margin-top:0">Which marking each tile marks with, and which markings limit it (a details tile). Details for one tile — AND/OR and what to show when nothing is marked — are in the tile's Properties while editing.</p>
        <table class="grid-table"><thead><tr><th>Tile</th><th>Marks with</th><th>Limited by</th></tr></thead><tbody>${tiles}</tbody></table>`;
    }
    function crossfilter() {
      const cs = props.tiles.filter((t) => !t.kpi);
      const inter = st().inter || {};
      const note = inactive('crossfilter')
        ? `<div class="warnbar" style="border-radius:6px">${SV.warn}<span>Inactive: this dashboard uses Markings. These settings apply if you switch to cross-filtering.</span></div>`
        : '';
      return `<h2>Cross-filtering</h2>${note}<div class="field"><span class="lbl">Default for tile pairs</span><div class="seg" role="group" aria-label="Default action">${[
        ['filter', 'Filter'],
        ['highlight', 'Highlight'],
        ['none', 'None'],
      ]
        .map(
          ([k, l]) =>
            `<button data-xdef="${k}" aria-pressed="${(st().crossDefault || 'filter') === k}">${l}</button>`,
        )
        .join('')}</div></div>
        <p class="xs sec">What a click in the source tile (row) does to each target tile (column).</p>
        <div class="tscroll"><table class="grid-table"><thead><tr><th>Source ↓ · Target →</th>${cs.map((t) => `<th title="${esc(t.title)}">${esc(t.title.split(' ').slice(0, 2).join(' '))}…</th>`).join('')}</tr></thead><tbody>${cs.map((s) => `<tr><td class="strong">${esc(s.title)}</td>${cs.map((t) => (s.id === t.id ? '<td class="muted">–</td>' : `<td><select class="select sm" style="width:auto" data-inter="${s.id}>${t.id}" aria-label="${esc(s.title)} to ${esc(t.title)}">${['filter', 'highlight', 'none'].map((v) => `<option value="${v}" ${(inter[`${s.id}>${t.id}`] || st().crossDefault || 'filter') === v ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    function layout() {
      return `<h2>Layout</h2><div class="field"><span class="lbl">Page width</span><div class="seg" role="group" aria-label="Page width">${[
        ['fixed', 'Fixed (1,440 px, centred)'],
        ['full', 'Full width'],
      ]
        .map(
          ([k, l]) =>
            `<button data-width="${k}" aria-pressed="${(st().width || 'fixed') === k}">${l}</button>`,
        )
        .join('')}</div></div>`;
    }
    const BODY = { general, interactions, markings, crossfilter, layout };

    function render() {
      const keep = host.querySelector('.settings-body')?.scrollTop || 0;
      host.innerHTML = `<div class="settings-head"><button class="btn sm" data-sclose>← Back to "${esc(d.name)}"</button><h1>Dashboard settings</h1><span style="flex:1"></span>${dirty() ? '<span class="xs sec">Unsaved changes</span>' : ''}<button class="btn sm" data-scancel>Cancel</button><button class="btn primary sm" data-ssave ${dirty() ? '' : 'disabled'}>Save settings</button></div>
        ${S.confirm ? `<div class="warnbar" role="alertdialog" style="grid-column:1/-1">${SV.warn}<span style="flex:1">Discard unsaved settings?</span><button class="btn sm" data-sdiscard>Discard</button><button class="btn ghost sm" data-skeep>Keep editing</button></div>` : ''}
        <nav class="settings-nav" aria-label="Settings sections">${NAV.map(([k, l]) => `<button class="file" data-ssec="${k}" aria-current="${S.section === k}">${l}${inactive(k) ? ' <span class="xs muted">inactive</span>' : k === st().interaction || (k === 'markings' && st().interaction === 'markings') ? ' <span class="badge ok" style="height:18px">active</span>' : ''}</button>`).join('')}</nav>
        <div class="settings-body"><div class="settings-inner">${BODY[S.section]()}</div></div>`;
      host.querySelector('.settings-body').scrollTop = keep;
    }
    const close = () => {
      host.remove();
      document.removeEventListener('keydown', onKey, true);
      props.onClose && props.onClose();
    };
    const tryClose = () => {
      if (dirty()) {
        S.confirm = true;
        render();
      } else close();
    };
    function onKey(e) {
      if (e.key === 'Escape' && host.isConnected) {
        e.stopPropagation();
        e.preventDefault();
        if (S.confirm) {
          S.confirm = false;
          render();
        } else tryClose();
      }
    }
    document.addEventListener('keydown', onKey, true);

    host.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const x = b.dataset;
      if ('sclose' in x || 'scancel' in x) return tryClose();
      if ('sdiscard' in x) return close();
      if ('skeep' in x) {
        S.confirm = false;
        return render();
      }
      if ('ssave' in x) {
        const names = st().markings.map((m) => m.name.trim());
        if (names.some((n) => !n) || new Set(names).size !== names.length) {
          S.section = 'markings';
          S.err = 'Each marking needs a unique name.';
          return render();
        }
        props.onSave(draft);
        return close();
      }
      if (x.ssec) {
        S.section = x.ssec;
        return render();
      }
      if (x.mkslot) {
        const [id, s] = x.mkslot.split(':');
        st().markings.find((m) => m.id === id).slot = +s;
        return render();
      }
      if ('mknew' in x) {
        const used = st().markings.map((m) => m.slot);
        const slot = [1, 2, 3, 4].find((s) => !used.includes(s)) || 1;
        const n = st().markings.length + 1;
        st().markings.push({ id: `mk${Date.now().toString(36)}`, name: `Marking (${n})`, slot });
        return render();
      }
      if (x.mkdel) {
        // Deleting a marking sets its tiles to (None) and removes it from limits (Spotfire).
        st().markings = st().markings.filter((m) => m.id !== x.mkdel);
        if (!st().markings.some((m) => m.isDefault)) st().markings[0].isDefault = true;
        Object.values(draft.tiles).forEach((t) => {
          if (t.marking === x.mkdel) t.marking = null;
          t.limit.ids = t.limit.ids.filter((i) => i !== x.mkdel);
        });
        props.tiles.forEach((t) => {
          if (draft.tiles[t.id].marking === undefined && tileMk(t) === null)
            draft.tiles[t.id].marking = null;
        });
        return render();
      }
      if (x.xdef) {
        st().crossDefault = x.xdef;
        return render();
      }
      if (x.width) {
        st().width = x.width;
        return render();
      }
    });
    // Typing updates the draft without re-rendering (keeps focus); only the Save button's state follows.
    host.addEventListener('input', (e) => {
      const x = e.target.dataset;
      if (x.mkname) st().markings.find((m) => m.id === x.mkname).name = e.target.value;
      else if (x.f) draft[x.f] = e.target.value;
      else return;
      host.querySelector('[data-ssave]').disabled = !dirty();
    });
    host.addEventListener('change', (e) => {
      const t = e.target,
        x = t.dataset;
      if (x.f) {
        draft[x.f] = t.value;
        return render();
      }
      if ('imode' in x) {
        st().interaction = t.value;
        return render();
      }
      if (x.mkdefault) {
        st().markings.forEach((m) => {
          m.isDefault = m.id === x.mkdefault;
        });
        return render();
      }
      if (x.tmk) {
        draft.tiles[x.tmk].marking = t.value || null;
        draft.tiles[x.tmk].limit.ids = draft.tiles[x.tmk].limit.ids.filter((i) => i !== t.value);
        return render();
      }
      if (x.tlim) {
        const [id, mk] = x.tlim.split(':');
        const l = draft.tiles[id].limit;
        l.ids = t.checked ? [...l.ids, mk] : l.ids.filter((i) => i !== mk);
        return render();
      }
      if (x.inter) {
        st().inter = { ...(st().inter || {}), [x.inter]: t.value };
        return render();
      }
    });
    render();
    host.focus();
    return { close };
  }

  window.DASH_SETTINGS = { open };
})();
