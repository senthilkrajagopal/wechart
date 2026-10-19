/**
 * The bullet chart's own settings (T953, AC-580, AC-037; design 23 sheet 8;
 * direction.md rule 150): Target, a measure or a value, and Bands, 2 or 3
 * percentages of the target, 80, 100 and 120 % by default.
 *
 * Metrics and the one dimension are the chart's own wells. Target and Bands
 * are kept sparse in the chart's options under `bullet`, as the KPI keeps
 * its settings (T936-1): no key while nothing differs from the defaults.
 */
import type { ChartTypeModule } from './index';

/** What each member is compared with: another measure, or one value for all. */
export type BulletTarget =
  | { readonly kind: 'measure'; readonly member: string }
  | { readonly kind: 'value'; readonly value: number };

export interface BulletSettings {
  readonly target?: BulletTarget;
  /** Percentages of the target, low to high: 2 or 3 (R80's three greys). */
  readonly bands: readonly number[];
}

/** Design 23 sheet 8's defaults (23-Q5 (a)). */
export const DEFAULT_BANDS: readonly number[] = [80, 100, 120];
export const MIN_BANDS = 2;
export const MAX_BANDS = 3;

/** With Target emptied, what the chart says, the Target well its action (AC-580). */
export const BULLET_NO_TARGET =
  'A bullet chart compares each member with a target. Put a measure or a value in Target.';

const TOO_MANY = 'At most 3 bands: R80’s three greys, and no fourth without a new colour.';
const TOO_FEW = 'At least 2 bands: a bullet chart’s bands are 2 or 3.';
const OUT_OF_ORDER = 'Bands run low to high, each above 0 %.';

/** Why these bands can't be set, in AC-580's words for a fourth; nothing when they can. */
export function bandsRefusal(bands: readonly number[]): string | undefined {
  if (bands.length > MAX_BANDS) return TOO_MANY;
  if (bands.length < MIN_BANDS) return TOO_FEW;
  const ordered = bands.every(
    (band, at) =>
      Number.isFinite(band) && band > 0 && (at === 0 || (bands[at - 1] as number) < band),
  );
  return ordered ? undefined : OUT_OF_ORDER;
}

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

function targetOf(stored: unknown): BulletTarget | undefined {
  const target = record(stored);
  const member = target?.['member'];
  const value = target?.['value'];
  if (target?.['kind'] === 'measure' && typeof member === 'string' && member !== '')
    return { kind: 'measure', member };
  if (target?.['kind'] === 'value' && typeof value === 'number' && Number.isFinite(value))
    return { kind: 'value', value };
  return undefined;
}

/**
 * The settings as stored; a target that can't be read is left out, and bands
 * this chart would refuse read as the defaults, so neither is ever drawn.
 */
function parse(stored: unknown): BulletSettings {
  const bullet = record(stored);
  const target = targetOf(bullet?.['target']);
  const bands = bullet?.['bands'];
  const readBands =
    Array.isArray(bands) &&
    bands.every((band) => typeof band === 'number') &&
    bandsRefusal(bands as number[]) === undefined
      ? (bands as number[])
      : DEFAULT_BANDS;
  return { ...(target === undefined ? {} : { target }), bands: [...readBands] };
}

const sameBands = (bands: readonly number[]) =>
  bands.length === DEFAULT_BANDS.length && bands.every((band, at) => band === DEFAULT_BANDS[at]);

/** Sparse: the default bands and no target store nothing. */
function save(settings: BulletSettings): Record<string, unknown> | undefined {
  const stored: Record<string, unknown> = {};
  if (settings.target !== undefined) stored['target'] = settings.target;
  if (!sameBands(settings.bands)) stored['bands'] = [...settings.bands];
  return Object.keys(stored).length === 0 ? undefined : stored;
}

export const bulletModule: ChartTypeModule<BulletSettings> = {
  type: 'bullet',
  parse,
  save,
};

/** A chart's bullet settings, from its options. */
export function bulletOptionsOf(
  options: Readonly<Record<string, unknown>> | undefined,
): BulletSettings {
  return parse(options?.['bullet']);
}

/** Options with these bullet settings, the key gone when they are all defaults. */
export function withBulletOptions(
  options: Readonly<Record<string, unknown>>,
  settings: BulletSettings,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...options };
  const saved = save(settings);
  if (saved === undefined) delete next['bullet'];
  else next['bullet'] = saved;
  return next;
}

/** The measures or values in Target, for what the chart needs (AC-580; `FieldCounts.targets`). */
export function targetCount(options: Readonly<Record<string, unknown>> | undefined): number {
  return bulletOptionsOf(options).target === undefined ? 0 : 1;
}
