/**
 * A combo's reference lines and bands (F44; AC-507, AC-508; design 20 pin
 * 10 and state F): kept in the chart's `options.references`, in the order
 * the author added them, with no limit on how many (20-Q9 (a)).
 *
 * A line is horizontal, reading one value axis, at a fixed value or at the
 * average, median, minimum or maximum of a drawn series (20-Q7 (a)); or
 * vertical, at a member of the category axis, or a date at a time axis's
 * granularity. A band runs From one value To another on the same terms.
 * Nothing here mentions a renderer: `@wechart/charts` draws them (T863).
 */
import type { ComboAxis, RenderSpec } from './render-spec';

/** Which way a reference runs: across a value axis, or up from the category axis. */
export type ReferenceDirection = 'horizontal' | 'vertical';
/** What a computed line is of its series (20-Q7 (a)). */
export type ReferenceStat = 'average' | 'median' | 'minimum' | 'maximum';
/** Where a reference's label sits along it. */
export type ReferenceLabelAt = 'start' | 'end';

/** One reference line or band, as stored. */
export interface ComboReference {
  readonly id: string;
  readonly kind: 'line' | 'band';
  readonly direction: ReferenceDirection;
  /** A horizontal one's value axis. */
  readonly axis?: ComboAxis;
  /** A line's fixed value: a number across a value axis, a member or a date up from the category axis. */
  readonly value?: number | string;
  /** A computed line's statistic, of `series`. */
  readonly stat?: ReferenceStat;
  /** The measure a computed line is of. */
  readonly series?: string;
  /** A band's ends. */
  readonly from?: number | string;
  readonly to?: number | string;
  readonly label: string;
  /** Its value written beside its label, in the axis's format. */
  readonly showValue?: boolean;
  readonly labelAt?: ReferenceLabelAt;
}

export const REFERENCE_STATS: readonly ReferenceStat[] = ['average', 'median', 'minimum', 'maximum'];
const DIRECTIONS: readonly unknown[] = ['horizontal', 'vertical'];
const KINDS: readonly unknown[] = ['line', 'band'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The references a chart keeps, in order; none where it keeps none. */
export function comboReferencesOf(
  options: Readonly<Record<string, unknown>> | undefined,
): ComboReference[] {
  const stored = options?.['references'];
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (one): one is ComboReference =>
      isRecord(one) &&
      typeof one['id'] === 'string' &&
      KINDS.includes(one['kind']) &&
      DIRECTIONS.includes(one['direction']) &&
      typeof one['label'] === 'string',
  );
}

/**
 * `options` with a reference added, or replacing the one of its id where
 * the author edited it; the rest kept in their order.
 */
export function withReference(
  options: Readonly<Record<string, unknown>>,
  reference: ComboReference,
): Record<string, unknown> {
  const references = comboReferencesOf(options);
  const at = references.findIndex((one) => one.id === reference.id);
  const next =
    at === -1
      ? [...references, reference]
      : references.map((one, index) => (index === at ? reference : one));
  return { ...options, references: next };
}

/** `options` without the reference of this id; no empty list left behind. */
export function withoutReference(
  options: Readonly<Record<string, unknown>>,
  id: string,
): Record<string, unknown> {
  const references = comboReferencesOf(options).filter((one) => one.id !== id);
  const next: Record<string, unknown> = { ...options, references };
  if (references.length === 0) delete next['references'];
  return next;
}

/** The middle of sorted values, or the mean of the middle two. */
function median(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Where a reference line sits (AC-507): its fixed value, or its statistic
 * over every value its series has in the chart's rows, which carry the
 * chart's filters. Split, that is every member's value, so the line is one
 * per measure (20-Q8 (a)). A gap isn't a value. None where there's nothing
 * to compute.
 */
export function referenceValue(
  spec: Pick<RenderSpec, 'rows'>,
  reference: ComboReference,
): number | string | undefined {
  if (reference.stat === undefined || reference.series === undefined) return reference.value;
  const series = reference.series;
  const values = spec.rows.flatMap((row) => {
    const raw = row[series];
    if (raw === null || raw === undefined || raw === '') return [];
    const value = Number(raw);
    return Number.isFinite(value) ? [value] : [];
  });
  if (values.length === 0) return undefined;
  switch (reference.stat) {
    case 'average':
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    case 'median':
      return median(values);
    case 'minimum':
      return values.reduce((a, b) => Math.min(a, b));
    case 'maximum':
      return values.reduce((a, b) => Math.max(a, b));
  }
}

/** Whether `from` lies before `to`: numbers by value, members and dates by their text. */
function below(from: number | string, to: number | string): boolean {
  if (typeof from === 'number' && typeof to === 'number') return from < to;
  return String(from) < String(to);
}

/**
 * What the reference form still needs before Add is enabled (AC-507), in
 * words, or nothing: a label, and a band's From below its To.
 */
export function referenceFormProblem(reference: ComboReference): string | undefined {
  if (reference.label.trim() === '') return 'A reference needs a label';
  if (
    reference.kind === 'band' &&
    reference.from !== undefined &&
    reference.to !== undefined &&
    !below(reference.from, reference.to)
  ) {
    return "A band's From must be below its To";
  }
  return undefined;
}

/**
 * What's wrong with a chart's stored references, in words, or nothing
 * (`comboProblems`): a chart stored with one it couldn't draw is refused on
 * reading, as a stored mark the combo hasn't got is.
 */
export function referenceProblems(options: Readonly<Record<string, unknown>> | undefined): string[] {
  const stored = options?.['references'];
  if (stored === undefined) return [];
  if (!Array.isArray(stored)) {
    return ['Reference lines and bands are stored as something other than a list.'];
  }
  return stored.flatMap((one): string[] => {
    if (!isRecord(one)) return ['A reference line is stored as something other than a setting.'];
    const label = typeof one['label'] === 'string' ? one['label'].trim() : '';
    if (label === '') return ['A reference line has no label.'];
    if (!DIRECTIONS.includes(one['direction'])) {
      return [
        `${label} runs "${String(one['direction'])}", but a reference is horizontal or vertical.`,
      ];
    }
    if (!KINDS.includes(one['kind'])) {
      return [`${label} is a "${String(one['kind'])}", but a reference is a line or a band.`];
    }
    return [];
  });
}
