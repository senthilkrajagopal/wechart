/**
 * The graphical table's own rules (T944, AC-571; design 23 sheet 2; §4's
 * dense rows): 24 px rows under a 28 px header, each section's heading a row
 * of its own, figures set right, a bullet cell's value beside its graph.
 */
export const GT_CSS = `
.gt-paged { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.gt-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.gt-scroll:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: -2px; }
.gt-pager {
  flex: none;
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
}
.gt { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.gt caption {
  caption-side: top;
  text-align: left;
  padding-bottom: 4px;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
}
.gt thead th {
  height: 28px;
  padding: 0 8px;
  text-align: left;
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
  color: var(--wc-text-secondary);
  border-bottom: 1px solid var(--wc-border-subtle);
  white-space: nowrap;
}
.gt tbody tr { height: 24px; }
.gt tbody th,
.gt tbody td { padding: 0 8px; white-space: nowrap; text-align: left; font-weight: 400; }
.gt tbody td.gt__figure { text-align: right; }
.gt tbody th[scope='rowgroup'] {
  font-weight: 600;
  color: var(--wc-text-secondary);
  border-bottom: 1px solid var(--wc-border-subtle);
}
.gt__bullet { display: inline-flex; align-items: center; gap: 8px; }
/* Marking (T946, AC-573; design 23 sheet 2; §7a "Tables"): a row is its
   member. A marked row is bold with a 3 px rule down its left in the
   marking's colour; the others' text dims to text-secondary and their
   micro-charts to 0.28, while Change and Icon cells, states rather than
   marks, keep their colours. A row partly marked by another tile says its
   additive Value cells' marked amounts in text-secondary. */
.gt tr.gt__markable { cursor: pointer; }
.gt tr[data-marked='whole'] > * { font-weight: 600; }
.gt tr[data-marked='whole'] > th[scope='row'] { box-shadow: inset 3px 0 0 var(--gt-mark, var(--wc-text-primary)); }
.gt tr[data-marked='none'] > :not(.gt__change):not(.gt__icon) { color: var(--wc-text-secondary); }
.gt tr[data-marked='none'] > :not(.gt__icon) svg { opacity: 0.28; }
.gt__marked { color: var(--wc-text-secondary); }
.gt__bullet svg,
.gt td > svg { display: block; }
`;
