/**
 * The KPI's R81 parts (T937; design 23 sheet 1): its period beside its name,
 * its value in `text-kpi-solo` (40/52) when it stands alone with Compare to,
 * Target or Time set, and its change line in `text-xs` and tabular numerals,
 * the change in R80's Change colours (`.text-change`, textStyles) and the
 * rest in `text-secondary`.
 */
export const KPI_CSS = `
.kpi__head { display: flex; align-items: baseline; gap: 8px; }
.kpi__period {
  margin-left: auto;
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  color: var(--wc-text-muted);
  white-space: nowrap;
}
/* Its parts kept within the tile: the trend and target give way where they
   would not fit (T938-2), so nothing is clipped. */
.kpi--detailed { overflow: hidden; }
.kpi__core { flex: none; }
.kpi--detailed .kpi__value,
.grid-tile .kpi--detailed .kpi__value { font-size: 40px; line-height: 52px; }
.kpi__change {
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.kpi__vs { color: var(--wc-text-secondary); }
.kpi__no-data { color: var(--wc-text-muted); }
/* Its trend, the content width × 32, and its target, × 16 with its words
   beside it (T938; design 23 sheet 1's 10 px gaps). */
.kpi__trend { margin-top: 10px; line-height: 0; }
.kpi__trend svg,
.kpi__target svg { display: block; flex: none; }
.kpi__target { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.kpi__target-of {
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  color: var(--wc-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* A period comparison with no Time (T939, AC-566): said in the warning ink,
   with + Time beside it. */
.kpi__needs {
  margin-top: 4px;
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  color: var(--wc-status-warning);
}
`;
