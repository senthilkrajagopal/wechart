/* wechart prototype: markings (Spotfire-style linked selections) — pure helpers.
   A marking's runtime state is a set of terms; each term is a tuple of {id, granularity, value} (an AND) plus the tile it came from.
   The predicate is the OR of the terms — Cube's {or:[{and:[…]}]} (docs/research/cube/markings-query-support.md Q1).
   Operations follow Spotfire's algebra: Replace, Add, Subtract, Toggle, ToggleOrAdd (docs/design/references-markings.md A2.2, A2.9). */
(function () {
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const SLOTS = 4; // colours validated against the 8 categorical slots in both themes (direction.md §5)
  const color = (slot) => css(`--mk${slot}`);
  const ckey = (c) => `${c.id}@${c.granularity || ''}=${c.value}`;
  const tkey = (t) => t.map(ckey).sort().join('&');

  /** op: 'replace' | 'add' | 'subtract' | 'toggle' | 'toggleOrAdd' | 'clear'. Mutates state {terms}. */
  function apply(state, tuples, from, op) {
    const have = new Map(state.terms.map((x) => [tkey(x.t), x]));
    const incoming = tuples.map((t) => ({ t, from }));
    if (op === 'clear') {
      state.terms = [];
      return state;
    }
    if (op === 'replace') {
      state.terms = dedupe(incoming);
      state.src = from;
      return state;
    }
    if (op === 'add') {
      incoming.forEach((x) => {
        if (!have.has(tkey(x.t))) state.terms.push(x);
      });
      return state;
    }
    if (op === 'subtract') {
      const out = new Set(incoming.map((x) => tkey(x.t)));
      state.terms = state.terms.filter((x) => !out.has(tkey(x.t)));
      return state;
    }
    if (op === 'toggle') {
      incoming.forEach((x) => {
        const k = tkey(x.t);
        if (have.has(k)) state.terms = state.terms.filter((y) => tkey(y.t) !== k);
        else state.terms.push(x);
      });
      return state;
    }
    if (op === 'toggleOrAdd') {
      // Spotfire's Ctrl+drag: toggle if all or none of the set is marked, otherwise add
      const n = incoming.filter((x) => have.has(tkey(x.t))).length;
      return apply(state, tuples, from, n === 0 || n === incoming.length ? 'toggle' : 'add');
    }
    return state;
  }
  const dedupe = (xs) => {
    const seen = new Set();
    return xs.filter((x) => {
      const k = tkey(x.t);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  /** The filter that limits a query to a marking's items, or null when nothing is marked (never an empty group — Cube reads {or: []} as "no filter"). */
  const predicate = (state) =>
    state && state.terms.length ? { or: state.terms.map((x) => x.t) } : null;
  /** Several markings on one details tile: All markings (AND) → one filter each; Any marking (OR) → one merged OR. Empty markings are skipped. */
  function limitFilters(states, combine) {
    const preds = states.map(predicate).filter(Boolean);
    if (!preds.length) return null;
    return combine === 'or' ? [{ or: preds.flatMap((p) => p.or) }] : preds;
  }

  const title = (id) => (WC.byId[id] ? WC.byId[id].title : id);
  /** "Category: Beverages, Condiments +3" — the text a chip, badge or Markdown token shows. */
  function summary(state, max = 2) {
    if (!state || !state.terms.length) return 'nothing marked';
    const byDim = new Map();
    state.terms.forEach((x) =>
      x.t.forEach((c) => {
        if (!byDim.has(c.id)) byDim.set(c.id, new Set());
        byDim.get(c.id).add(c.value);
      }),
    );
    return [...byDim]
      .map(([id, vs]) => {
        const a = [...vs];
        return `${title(id)}: ${a.slice(0, max).join(', ')}${a.length > max ? ` +${a.length - max}` : ''}`;
      })
      .join(' · ');
  }
  const count = (state) => (state ? state.terms.length : 0);
  /** Current marks as a URL parameter: saved dashboards keep marking definitions only; links carry the marks (user decision). */
  const encode = (marks) =>
    btoa(
      unescape(
        encodeURIComponent(
          JSON.stringify(
            Object.fromEntries(
              Object.entries(marks)
                .filter(([, s]) => s.terms.length)
                .map(([k, s]) => [
                  k,
                  s.terms.map((x) => x.t.map((c) => [c.id, c.granularity || '', c.value])),
                ]),
            ),
          ),
        ),
      ),
    );

  window.MARKINGS = { SLOTS, color, apply, predicate, limitFilters, summary, count, encode, tkey };
})();
