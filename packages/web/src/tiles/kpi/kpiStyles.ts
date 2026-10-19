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
.kpi--detailed .kpi__value,
.grid-tile .kpi--detailed .kpi__value { font-size: 40px; line-height: 52px; }
.kpi__change {
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.kpi__vs { color: var(--wc-text-secondary); }
`;
