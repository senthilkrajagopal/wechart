/**
 * The graphical table's own rules (T944, AC-571; design 23 sheet 2; §4's
 * dense rows): 24 px rows under a 28 px header, each section's heading a row
 * of its own, figures set right, a bullet cell's value beside its graph.
 */
export const GT_CSS = `
.gt-paged { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.gt-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
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
.gt__bullet svg,
.gt td > svg { display: block; }
`;
