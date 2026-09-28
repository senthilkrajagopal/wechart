import { isAdditive, labelOf } from '@wechart/charts';
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

const numberOf = (raw: unknown): number | undefined => {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * The marked share of the KPI's measure, where the marking's was answered
 * (T453, AC-097; direction.md §7a: "KPI tiles: a 'Marked $X · p%' badge (no %
 * for non-additive measures)"). The share is the KPI's own question asked
 * with the marking (T388), so its one row is the measure over the marked
 * rows. An additive measure's with no value is none of it, 0, as the
 * prototype's `rsum` over no marked rows is; its part of the whole is said,
 * rounded as the prototype's is. Any other measure's is said only where it
 * has a value, since a part of an average is no part of it.
 */
function markedShareOf(
  spec: RenderSpec,
  measure: string,
  whole: number,
): { readonly text: string; readonly colour: string } | undefined {
  const marking = spec.marking;
  if (marking?.share === undefined || marking.whole === true) return undefined;
  const additive = isAdditive(marking.aggTypes?.[measure]);
  const marked = numberOf(marking.share[0]?.[measure]) ?? (additive ? 0 : undefined);
  if (marked === undefined) return undefined;
  const part = additive && whole !== 0 ? ` · ${String(Math.round((marked / whole) * 100))}%` : '';
  return {
    text: `Marked ${formatValue(marked, measure, spec.formats ?? {})}${part}`,
    colour: marking.colour,
  };
}

export function Kpi({ spec }: KpiProps) {
  const measure = memberOn(spec.encoding, 'y');
  const row = spec.rows[0];
  const raw = measure === undefined || row === undefined ? undefined : row[measure];
  const value = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
  // By its title from the model (AC-220), never "orders.count": its short
  // one, as a KPI's one measure makes its cube evident (T403).
  const label = measure === undefined ? undefined : labelOf(spec, measure);

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

  const marked = measure === undefined ? undefined : markedShareOf(spec, measure, value);

  // Its name above its value, as the prototype's kpiHtml has them (T300),
  // and under it the marked share, as its renderMarked has it (T453).
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
      {marked === undefined ? null : (
        <p className="kpi__marked">
          {/* The swatch is decorative; the words carry the meaning (AC-098). */}
          <span className="mark-badge" data-testid="kpi-marked">
            <span
              className="mark-badge__swatch"
              data-testid="kpi-marked-swatch"
              aria-hidden="true"
              style={{ background: marked.colour }}
            />
            {marked.text}
          </span>
        </p>
      )}
    </div>
  );
}
