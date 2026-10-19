/**
 * 100 % stacking (T957, AC-584; design 23 sheet 9; direction.md rule 152):
 * Customize › Stack, Sum or 100 %, on a stacked bar or a stacked area. The
 * gallery's 100 % stacked bar and area are these types at 100 % (T934-1).
 *
 * At 100 %, each category's series are drawn as their shares of its total.
 * The shares are taken last: Top N's "Other" (AC-041) and the row limit
 * already shaped the rows, and past the categorical palette's 16 slots the
 * smallest series fold into one "Other (n)" here, so the drawn shares of a
 * bar or a point always add to 100.
 *
 * Stored sparse as `options.stack`: `'percent'`, or nothing for Sum.
 */
import { memberOn, type RenderSpec } from '../render-spec';
import { OTHER_LABEL } from '../topN';

export type Stack = 'sum' | 'percent';

/** The types Stack applies to. */
export const STACKED_TYPES = ['stackedBar', 'stackedArea'] as const;

/**
 * The categorical palette's slots (direction.md §5): past them, "Other (n)".
 * 16 from 2026-10-19, as the palette grew (COLOUR-1).
 */
export const SHARE_SERIES_CAP = 16;

/** A chart's stacking, from its options: Sum unless 100 % is stored. */
export function stackOf(options: Readonly<Record<string, unknown>> | undefined): Stack {
  return options?.['stack'] === 'percent' ? 'percent' : 'sum';
}

/** Options with this stacking, the key gone for Sum. */
export function withStack(
  options: Readonly<Record<string, unknown>>,
  stack: Stack,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...options };
  if (stack === 'percent') next['stack'] = 'percent';
  else delete next['stack'];
  return next;
}

/**
 * Aggregations whose parts add to their whole (direction.md: "additive
 * measures (Cube `sum` and `count`)"); a distinct count doesn't.
 */
const SUMMED = new Set(['sum', 'count']);

/**
 * Whether a spec draws its stack at 100 %: a stacked bar or area with 100 %
 * stored, whose measure the model says is summed. Any other — changed to an
 * average after 100 % was chosen, or one nothing is known of, as a quick
 * calculation's — draws at Sum, as Customize then shows (AC-584; T957's
 * review: the editor and the drawing by one rule, `percentRefusal`'s).
 */
export function isPercentStack(
  spec: Pick<RenderSpec, 'chartType' | 'options' | 'encoding' | 'measureTypes'>,
): boolean {
  if (!(STACKED_TYPES as readonly string[]).includes(spec.chartType)) return false;
  if (stackOf(spec.options) !== 'percent') return false;
  const measure = memberOn(spec.encoding, 'y');
  const aggType = measure === undefined ? undefined : spec.measureTypes?.[measure];
  return aggType !== undefined && SUMMED.has(aggType);
}

/** Why 100 % can't be chosen for this measure (AC-584); nothing when it can. */
export function percentRefusal(title: string, aggType: string | undefined): string | undefined {
  if (aggType !== undefined && SUMMED.has(aggType)) return undefined;
  const why = aggType === 'avg' ? 'is an average' : 'isn’t summed';
  return `${title} ${why}, so its shares of a total wouldn’t mean anything. 100 % takes a summed measure.`;
}

const numberOf = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

/**
 * At 100 %, past 16 series, the 15 largest by total kept and the rest summed
 * into "Other (n)" per category, before any share is taken (AC-584, AC-041).
 * The same spec when there is nothing to fold.
 */
export function foldForShares(spec: RenderSpec): RenderSpec {
  if (!isPercentStack(spec)) return spec;
  const category = memberOn(spec.encoding, 'x');
  const split = memberOn(spec.encoding, 'color');
  const measure = memberOn(spec.encoding, 'y');
  if (split === undefined || measure === undefined) return spec;

  const totals = new Map<string, number>();
  for (const row of spec.rows) {
    const member = String(row[split] ?? '');
    totals.set(member, (totals.get(member) ?? 0) + Math.abs(numberOf(row[measure]) ?? 0));
  }
  if (totals.size <= SHARE_SERIES_CAP) return spec;

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([member]) => member);
  const kept = new Set(ranked.slice(0, SHARE_SERIES_CAP - 1));
  const other = `${OTHER_LABEL} (${String(ranked.length - kept.size)})`;

  const rows: Record<string, unknown>[] = [];
  const otherAt = new Map<string, Record<string, unknown>>();
  for (const row of spec.rows) {
    if (kept.has(String(row[split] ?? ''))) {
      rows.push(row);
      continue;
    }
    const key = category === undefined ? '' : String(row[category] ?? '');
    const value = numberOf(row[measure]);
    const folded = otherAt.get(key);
    if (folded === undefined) {
      const first = { ...row, [split]: other, [measure]: value };
      otherAt.set(key, first);
      rows.push(first);
    } else if (value !== null) {
      folded[measure] = (numberOf(folded[measure]) ?? 0) + value;
    }
  }
  return { ...spec, rows };
}

/**
 * Each series' values as its percentage of its category's total, so the
 * drawn shares of a category add to 100. A gap stays a gap; a category whose
 * total is 0 has no shares.
 */
export function sharesOf<S extends { readonly values: readonly (number | null)[] }>(
  series: readonly S[],
): (Omit<S, 'values'> & { readonly values: (number | null)[] })[] {
  const width = Math.max(0, ...series.map((one) => one.values.length));
  const totals = Array.from({ length: width }, (_, at) =>
    series.reduce((sum, one) => sum + (one.values[at] ?? 0), 0),
  );
  return series.map((one) => ({
    ...one,
    values: one.values.map((value, at) => {
      const total = totals[at] ?? 0;
      return value === null || total === 0 ? null : (value / total) * 100;
    }),
  }));
}

/** A tooltip's line at 100 %: "Web: $210K · 51 % of EMEA" (AC-584). */
export function shareText(series: string, value: string, share: number, category: string): string {
  return `${series}: ${value} · ${String(Math.round(share))} % of ${category}`;
}
