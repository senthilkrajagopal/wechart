import { formatValue, memberOn, type RenderSpec } from '@wechart/core';

/**
 * The KPI tile (AC-037).
 *
 * DOM rather than ECharts. A KPI is one number and a label; drawing it on a
 * canvas would make it unselectable, unsearchable and invisible to a screen
 * reader for no gain. `docs/research/echarts.md` reaches the same conclusion —
 * KPI, table and pivot stay in the DOM.
 */
export interface KpiProps {
  readonly spec: RenderSpec;
}

/**
 * Grouped, not raw digits. Per-member formats — currency, percentages — are
 * AC-046's business and land at T052; this is the fallback for a measure that
 * declares none.
 */
const FORMAT = new Intl.NumberFormat('en-US');

export function Kpi({ spec }: KpiProps) {
  const measure = memberOn(spec.encoding, 'y');
  const row = spec.rows[0];
  const raw = measure === undefined || row === undefined ? undefined : row[measure];
  const value = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
  // By its title from the model (AC-220), never "orders.count".
  const label = measure === undefined ? undefined : (spec.titles?.[measure] ?? measure);

  if (!Number.isFinite(value)) {
    // An empty result is not zero, and a value that will not parse is not
    // zero either. Printing one would assert a measurement never made.
    return (
      <div className="kpi" data-testid="kpi">
        <p data-testid="kpi-empty">No value</p>
        {label === undefined ? null : <p data-testid="kpi-label">{label}</p>}
      </div>
    );
  }

  // Its name above its value, as the prototype's kpiHtml has them (T300).
  return (
    <div className="kpi" data-testid="kpi">
      <p className="kpi__label" data-testid="kpi-label">
        {label}
      </p>
      <p className="kpi__value" data-testid="kpi-value">
        {/* The measure's own format, so a currency KPI reads as money
            (AC-046). FORMAT is the fallback for a member that declares none. */}
        {measure === undefined
          ? FORMAT.format(value)
          : formatValue(value, measure, spec.formats ?? {})}
      </p>
    </div>
  );
}
