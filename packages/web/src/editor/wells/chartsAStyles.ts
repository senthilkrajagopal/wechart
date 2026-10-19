import { KPI_CSS } from '../../tiles/kpi/kpiStyles';

/**
 * Lane CHARTS-A's own rules for R81's wells (design 23; direction.md §7i),
 * installed after the shell's, as the Text tile's are. Every value is a §3
 * or §5 token.
 *
 * The graphical table's Columns (T943, AC-570): one row per column, its name
 * a button that opens its settings below it and its ⋯ menu at the right; the
 * settings a column of labelled fields, design 21 state C's.
 */
export const CHARTS_A_CSS = `
.gt-columns { flex-direction: column; align-items: stretch; }
.gt-columns > .menu-button { align-self: flex-start; }
.gt-columns__list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.gt-columns__item { display: grid; gap: 4px; }
.gt-columns__row { display: flex; align-items: center; gap: 4px; min-width: 0; }
.gt-columns__name {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 6px;
  overflow: hidden;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: var(--wc-text-xs-size);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gt-columns__name:hover { background: var(--wc-bg-hover); }
.gt-columns__name[aria-expanded='true'] { border-color: var(--wc-border-strong); }
.gt-settings {
  display: grid;
  gap: 8px;
  padding: 8px;
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  font-size: var(--wc-text-xs-size);
}
.gt-settings__field { display: grid; gap: 2px; }
.gt-settings__label { color: var(--wc-text-secondary); font-weight: var(--wc-text-xs-strong-weight); }
.gt-settings__choices { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.gt-settings__pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.gt-settings__rules { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.gt-settings__rule {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 4px;
  align-items: end;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
${KPI_CSS}`;
