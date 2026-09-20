/**
 * Formatting a value the way its member declares (AC-046).
 *
 * "From the Cube model" is the load-bearing phrase in the criterion. A format
 * is not a chart setting picked per tile — it is declared once on the measure
 * and follows it everywhere, so the same number never appears as `1234` on an
 * axis and `$1,234.00` in a table of the same chart.
 *
 * Cube's `format` vocabulary is wider than anything a chart can honour:
 * `imageUrl`, `link`, `id` and d3 specifiers are all legal
 * (`research/cube/data-modeling.md`). The ones with a visual meaning here are
 * currency and percent; the rest fall back to a plain grouped number, because
 * refusing to draw would be worse than drawing a number.
 */

/** Member name to the `format` string `/v1/meta` reports, where there is one. */
export type MemberFormats = Readonly<Record<string, string>>;

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const PERCENT = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
});

const PLAIN = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function forFormat(format: string | undefined): Intl.NumberFormat {
  switch (format) {
    case 'currency':
      return CURRENCY;
    case 'percent':
      return PERCENT;
    default:
      return PLAIN;
  }
}

/**
 * The value as text.
 *
 * A gap is an empty string, not `0` and not `NaN`: nothing was measured, and
 * both alternatives assert something. A value that is not a number at all —
 * a dimension's label — passes through, because formatting text as currency
 * would be worse than leaving it.
 */
export function formatValue(value: unknown, member: string, formats: MemberFormats = {}): string {
  if (value === null || value === undefined || value === '') return '';

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);

  return forFormat(formats[member]).format(numeric);
}

/** The formatter for one member, taken once and reused down a column or an axis. */
export function formatterFor(
  member: string,
  formats: MemberFormats = {},
): (value: unknown) => string {
  const format = forFormat(formats[member]);

  return (value) => {
    if (value === null || value === undefined || value === '') return '';
    const numeric = Number(value);
    return Number.isFinite(numeric) ? format.format(numeric) : String(value);
  };
}
