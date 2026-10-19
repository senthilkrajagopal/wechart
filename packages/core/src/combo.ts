/**
 * A combo's series (F44): each measure drawn with its own mark on its own
 * value axis (AC-497), Auto unless the author chose (AC-498).
 *
 * Carried in the chart's `options.series`, by measure, beside its colour
 * (`SeriesOptions`): sparse, so an absent mark or axis is Auto and a present
 * one is the author's. Auto is resolved here, from the Metrics well's order,
 * every time the chart is drawn, which is what keeps a choice pinned to its
 * measure while the Auto series around it follow the well (rule 115).
 *
 * Nothing here mentions a renderer (CLAUDE.md): `@wechart/charts` turns these
 * into ECharts series, and the editor's three places to set them (Customize ›
 * Series, the Metrics pill's menu, the legend glyph) all read and write them
 * through this one module, so they can't disagree.
 */
import type { MemberFormat, MemberFormats } from './format';
import type { ComboAxis, ComboMark, SeriesOptions } from './render-spec';
import { scaleOf } from './undrawn';

/** The four marks a combo offers, in the order the editor lists them (AC-497). */
export const COMBO_MARKS: readonly ComboMark[] = ['bar', 'line', 'area', 'point'];

/** The two value axes a combo has (AC-497, rule 116). */
export const COMBO_AXES: readonly ComboAxis[] = ['left', 'right'];

/** One measure of a combo as it is drawn. */
export interface ComboSeries {
  readonly measure: string;
  readonly mark: ComboMark;
  readonly axis: ComboAxis;
  /**
   * Neither its mark nor its axis was chosen (AC-498): what its row's Back to
   * Auto button is shown for, once false.
   */
  readonly auto: boolean;
}

const isMark = (value: unknown): value is ComboMark =>
  (COMBO_MARKS as readonly unknown[]).includes(value);
const isAxis = (value: unknown): value is ComboAxis =>
  (COMBO_AXES as readonly unknown[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `options.series` map, or none where it isn't one. */
function seriesSettingsOf(
  options: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, Record<string, unknown>>> {
  const series = options?.['series'];
  if (!isRecord(series)) return {};
  return Object.fromEntries(
    Object.entries(series).filter((entry): entry is [string, Record<string, unknown>] =>
      isRecord(entry[1]),
    ),
  );
}

/**
 * Auto (AC-498, rule 115): the first measure as bars, the rest as lines, and
 * every one on the left. Never the right: only the author puts a series there
 * (rule 117).
 */
function autoOf(position: number): { mark: ComboMark; axis: ComboAxis } {
  return { mark: position === 0 ? 'bar' : 'line', axis: 'left' };
}

/**
 * Each measure as the combo draws it, in the Metrics well's order.
 *
 * Auto goes by the measure's place in the well, so it follows a reorder; a
 * mark or an axis the author chose goes by the measure's name, so it doesn't
 * (AC-498). A stored mark or axis that isn't one of the combo's
 * (`comboProblems`) is drawn by Auto rather than as something invented.
 */
export function comboSeriesOf(
  measures: readonly string[],
  options?: Readonly<Record<string, unknown>>,
  { split = false }: { readonly split?: boolean } = {},
): ComboSeries[] {
  const settings = seriesSettingsOf(options);
  const chosen = measures.map((measure) => {
    const own = settings[measure] ?? {};
    return {
      mark: isMark(own['mark']) ? own['mark'] : undefined,
      axis: isAxis(own['axis']) ? own['axis'] : undefined,
    };
  });
  /**
   * Split, colour means the member, so each measure needs a mark of its own
   * (AC-504, rule 122): an Auto measure takes the first mark, in
   * `SPLIT_AUTO_MARKS`' order, that no chosen mark and no earlier Auto one
   * holds (decision T852-1). Past four, there's none left, and it's a line.
   */
  const taken = new Set(chosen.flatMap((one) => (one.mark === undefined ? [] : [one.mark])));
  const nextFree = (): ComboMark => {
    const free = SPLIT_AUTO_MARKS.find((mark) => !taken.has(mark));
    if (free !== undefined) taken.add(free);
    return free ?? 'line';
  };
  return measures.map((measure, position) => {
    const auto = autoOf(position);
    const { mark, axis } = chosen[position] ?? {};
    return {
      measure,
      mark: mark ?? (split ? nextFree() : auto.mark),
      axis: axis ?? auto.axis,
      auto: mark === undefined && axis === undefined,
    };
  });
}

/** The order an Auto measure takes its mark in while split (decision T852-1). */
const SPLIT_AUTO_MARKS: readonly ComboMark[] = ['bar', 'line', 'point', 'area'];

/**
 * The measure that draws `mark` while the combo is split, other than the one
 * asking, or none (AC-504, rule 122): with a split, two measures with one
 * mark couldn't be told apart, colour already meaning the member, so the
 * editor disables a mark another measure uses and names it. Unsplit, any two
 * measures may share a mark (design 20 Q1 (a)).
 */
export function markTakenBy(
  measures: readonly string[],
  options: Readonly<Record<string, unknown>> | undefined,
  split: boolean,
  mark: ComboMark,
  asking: string,
): string | undefined {
  if (!split) return undefined;
  return comboSeriesOf(measures, options, { split }).find(
    (one) => one.mark === mark && one.measure !== asking,
  )?.measure;
}

/**
 * A combo's wells split by `dimension` (AC-504, R80 "One dimension, all
 * measures"): the category axis kept — the first time dimension, or else the
 * first plain one — and the dimension that splits, the plain one after it,
 * replaced by this one. A combo splits by one dimension only, so a second
 * dropped on its Split by well replaces the first.
 */
export function withComboSplit<
  W extends { readonly dimensions: readonly string[]; readonly timeDimensions: readonly string[] },
>(wells: W, dimension: string): W {
  const [first] = wells.dimensions;
  const onAxis = wells.timeDimensions.length === 0 && first !== undefined ? [first] : [];
  return {
    ...wells,
    dimensions: onAxis.includes(dimension) ? onAxis : [...onAxis, dimension],
  };
}

/**
 * What's wrong with a chart's stored combo settings, in words, or nothing: a
 * mark other than the four, or an axis other than the two (AC-497). A chart
 * read from storage with one is refused (`readChartDocument`), as a stored
 * grain Cube doesn't have is.
 */
export function comboProblems(options: Readonly<Record<string, unknown>> | undefined): string[] {
  // Settings of another shape hold no mark or axis: every renderer reads
  // them as none (T845's review).
  const series = options?.['series'];
  const problems: string[] = [];
  for (const [name, settings] of Object.entries(isRecord(series) ? series : {})) {
    if (!isRecord(settings)) continue;
    const { mark, axis } = settings;
    if (mark !== undefined && !isMark(mark)) {
      problems.push(
        `${name} is drawn as "${String(mark)}", which isn't a combo mark: bar, line, area or point.`,
      );
    }
    if (axis !== undefined && !isAxis(axis)) {
      problems.push(
        `${name} is on the "${String(axis)}" axis, but a combo has only a left and a right axis.`,
      );
    }
  }
  return [...problems, ...stackingProblems(options)];
}

/** How a combo's bars sit within a category (AC-503). */
export type BarStacking = 'side-by-side' | 'stacked';
/** How a combo's areas sit over each other (AC-503). */
export type AreaStacking = 'overlap' | 'stacked';
/** A combo's stacking, chart-wide (AC-503, rule 126). */
export interface ComboStacking {
  readonly bars: BarStacking;
  readonly areas: AreaStacking;
}
/** The two stacking rows Customize › Series can show (AC-503). */
export type ComboStackingRow = keyof ComboStacking;

const STACKING_STARTS: ComboStacking = { bars: 'side-by-side', areas: 'overlap' };
const STACKING_VALUES: Readonly<Record<ComboStackingRow, readonly string[]>> = {
  bars: ['side-by-side', 'stacked'],
  areas: ['overlap', 'stacked'],
};

/** A stored stacking other than its row's two, in words (`comboProblems`). */
function stackingProblems(options: Readonly<Record<string, unknown>> | undefined): string[] {
  const combo = comboSettingsOf(options);
  const problems: string[] = [];
  const { bars, areas } = combo;
  if (bars !== undefined && !STACKING_VALUES.bars.includes(bars as string)) {
    problems.push(
      `Bars are stacked as "${String(bars)}", but a combo's bars are side by side or stacked.`,
    );
  }
  if (areas !== undefined && !STACKING_VALUES.areas.includes(areas as string)) {
    problems.push(
      `Areas are stacked as "${String(areas)}", but a combo's areas overlap or are stacked.`,
    );
  }
  return problems;
}

/**
 * A combo's stacking (AC-503): one setting for every bar series and one for
 * every area series, kept in `options.combo` as `bars` and `areas`, sparse:
 * absent is side by side, or overlapping. Anything else stored is read as
 * the start (and refused on reading the chart, `comboProblems`).
 */
export function comboStackingOf(
  options: Readonly<Record<string, unknown>> | undefined,
): ComboStacking {
  const combo = comboSettingsOf(options);
  return {
    bars: combo['bars'] === 'stacked' ? 'stacked' : STACKING_STARTS.bars,
    areas: combo['areas'] === 'stacked' ? 'stacked' : STACKING_STARTS.areas,
  };
}

/**
 * One stacking row set for the whole chart (AC-503). The starting value is
 * stored as nothing, and an emptied `combo` entry is dropped, so the saved
 * options stay sparse.
 */
export function withComboStacking<Row extends ComboStackingRow>(
  options: Readonly<Record<string, unknown>>,
  row: Row,
  value: ComboStacking[Row],
): Record<string, unknown> {
  const combo: Record<string, unknown> = { ...comboSettingsOf(options) };
  if (value === STACKING_STARTS[row]) delete combo[row];
  else combo[row] = value;
  const next: Record<string, unknown> = { ...options, combo };
  if (Object.keys(combo).length === 0) delete next['combo'];
  return next;
}

/**
 * The stacking rows a combo offers (AC-503, design 20 pin 4): Bars always,
 * Areas only while a series is drawn as an area.
 */
export function comboStackingRows(
  series: readonly Pick<ComboSeries, 'mark'>[],
): ComboStackingRow[] {
  return series.some((one) => one.mark === 'area') ? ['bars', 'areas'] : ['bars'];
}

/** `options` with one series' settings replaced, its map and the options dropped when empty. */
function withSeriesSettings(
  options: Readonly<Record<string, unknown>>,
  name: string,
  settings: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const series = { ...(isRecord(options['series']) ? options['series'] : {}) };
  if (Object.keys(settings).length > 0) series[name] = settings;
  else delete series[name];
  const next: Record<string, unknown> = { ...options, series };
  if (Object.keys(series).length === 0) delete next['series'];
  return next;
}

/**
 * The author's choice of mark, axis or both for one measure (AC-497), kept
 * beside its colour; what isn't given stays as it was.
 */
export function withComboSeries(
  options: Readonly<Record<string, unknown>>,
  measure: string,
  choice: Pick<SeriesOptions, 'mark' | 'axis'>,
): Record<string, unknown> {
  const current = seriesSettingsOf(options)[measure] ?? {};
  return withSeriesSettings(options, measure, {
    ...current,
    ...(choice.mark === undefined ? {} : { mark: choice.mark }),
    ...(choice.axis === undefined ? {} : { axis: choice.axis }),
  });
}

/**
 * The unit a format writes its values in: a currency's symbol, "%" for a
 * share, nothing for a plain number (`scaleOf`). What an axis title ends
 * with (AC-500) and what Synchronize compares (AC-501).
 */
export function unitOfFormat(format: string | MemberFormat | undefined): string {
  const scale = scaleOf(format);
  if (scale === 'percent') return '%';
  if (scale.startsWith('currency ')) {
    const code = scale.slice('currency '.length);
    try {
      return (
        new Intl.NumberFormat('en-US', { style: 'currency', currency: code })
          .formatToParts(0)
          .find((part) => part.type === 'currency')?.value ?? code
      );
    } catch {
      return code;
    }
  }
  return '';
}

/** Whether Synchronize axes can be turned on, and why not where it can't (AC-501). */
export type SynchronizeState =
  { readonly available: true } | { readonly available: false; readonly reason: string };

/**
 * Whether a combo's two axes can show one scale (AC-501, design 20 Q12 (a)):
 * only while a series is on each axis, and only while both axes share a
 * number format. Each axis is written in its first measure's format
 * (decision T846-2), so those are the two compared; the reason names both
 * ("Revenue is in $ and Margin % in %").
 */
export function canSynchronize(
  measures: readonly string[],
  options: Readonly<Record<string, unknown>> | undefined,
  formats: MemberFormats = {},
  label: (measure: string) => string = (measure) => measure,
): SynchronizeState {
  const series = comboSeriesOf(measures, options);
  const left = series.find((one) => one.axis === 'left');
  const right = series.find((one) => one.axis === 'right');
  if (right === undefined) {
    return { available: false, reason: 'Every series is on the left axis.' };
  }
  /**
   * No series on the left: the right's scale is the only one read, and
   * following the unused left's would only throw it away (T849's review).
   */
  if (left === undefined) {
    return { available: false, reason: 'Every series is on the right axis.' };
  }
  if (scaleOf(formats[left.measure]) === scaleOf(formats[right.measure])) {
    return { available: true };
  }
  const unit = (measure: string) => unitOfFormat(formats[measure]) || 'numbers';
  return {
    available: false,
    reason: `${label(left.measure)} is in ${unit(left.measure)} and ${label(right.measure)} in ${unit(right.measure)}`,
  };
}

/** The chart-wide combo settings, `options.combo`, or none (decision T845-1). */
function comboSettingsOf(
  options: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> {
  const combo = options?.['combo'];
  return isRecord(combo) ? combo : {};
}

/**
 * Whether a combo's axes are drawn as one scale (AC-501): the author turned
 * Synchronize on and the axes can still be synchronized. A stored choice is
 * kept while a format change makes it unavailable, and holds again once the
 * formats agree.
 */
export function isSynchronized(
  measures: readonly string[],
  options: Readonly<Record<string, unknown>> | undefined,
  formats: MemberFormats = {},
): boolean {
  return (
    comboSettingsOf(options)['synchronize'] === true &&
    canSynchronize(measures, options, formats).available
  );
}

/**
 * Synchronize axes turned on or off (AC-501). Turned on, the right axis
 * follows the left, so a fixed minimum or maximum it had is cleared (its
 * other settings kept); the editor offers Undo by keeping the options it had.
 * Off leaves no `combo` entry behind, so the saved options stay sparse.
 */
export function withSynchronize(
  options: Readonly<Record<string, unknown>>,
  on: boolean,
): Record<string, unknown> {
  const combo: Record<string, unknown> = { ...comboSettingsOf(options) };
  if (on) combo['synchronize'] = true;
  else delete combo['synchronize'];
  const next: Record<string, unknown> = { ...options, combo };
  if (Object.keys(combo).length === 0) delete next['combo'];
  if (!on) return next;

  const axes = isRecord(options['axes']) ? options['axes'] : undefined;
  const right = axes !== undefined && isRecord(axes['right']) ? axes['right'] : undefined;
  if (axes === undefined || right === undefined) return next;
  const kept: Record<string, unknown> = { ...right };
  delete kept['min'];
  delete kept['max'];
  next['axes'] = { ...axes, right: kept };
  return next;
}

/**
 * Log scale on a combo's axes (AC-502): unavailable while any series draws
 * bars, or on for both axes while two are drawn, or the left's own setting
 * while every series is on it.
 */
export type LogScaleState =
  | { readonly available: false; readonly reason: string }
  | {
      readonly available: true;
      readonly left: boolean;
      readonly right: boolean;
      /** Two axes drawn: log is on or off for both at once. */
      readonly both: boolean;
    };

/** `options.axes[key]`, or none where it isn't a map. */
function axisSettingsOf(
  options: Readonly<Record<string, unknown>> | undefined,
  key: 'y' | 'right',
): Readonly<Record<string, unknown>> {
  const axes = options?.['axes'];
  const settings = isRecord(axes) ? axes[key] : undefined;
  return isRecord(settings) ? settings : {};
}

/**
 * Whether each of a combo's value axes is a log axis (AC-502, design 20
 * state E, Q3 (a)). A bar needs a zero baseline, which a log axis hasn't got,
 * so while any series draws bars log is unavailable on both, the reason
 * naming the first ("Log scale · unavailable: Revenue draws bars, which need
 * a zero baseline"). While two axes are drawn, ticks align only log to log,
 * so log on either axis's settings is log on both.
 */
export function logScaleState(
  measures: readonly string[],
  options: Readonly<Record<string, unknown>> | undefined,
  label: (measure: string) => string = (measure) => measure,
  { split = false }: { readonly split?: boolean } = {},
): LogScaleState {
  // Split, Auto's marks are its own (decision T852-1), bars included.
  const series = comboSeriesOf(measures, options, { split });
  const bars = series.find((one) => one.mark === 'bar');
  if (bars !== undefined) {
    return {
      available: false,
      reason: `Log scale · unavailable: ${label(bars.measure)} draws bars, which need a zero baseline`,
    };
  }
  const left = axisSettingsOf(options, 'y')['log'] === true;
  if (!series.some((one) => one.axis === 'right')) {
    return { available: true, left, right: false, both: false };
  }
  const on = left || axisSettingsOf(options, 'right')['log'] === true;
  return { available: true, left: on, right: on, both: true };
}

/**
 * Log scale turned on or off for both value axes at once (AC-502): with one
 * axis drawn the right's setting is idle, and once a series moves right the
 * two already agree. Off removes the key from both, other settings kept.
 */
export function withLogScale(
  options: Readonly<Record<string, unknown>>,
  on: boolean,
): Record<string, unknown> {
  const axes = isRecord(options['axes']) ? options['axes'] : {};
  const set = (key: 'y' | 'right') => {
    const settings: Record<string, unknown> = { ...axisSettingsOf(options, key) };
    if (on) settings['log'] = true;
    else delete settings['log'];
    return settings;
  };
  return { ...options, axes: { ...axes, y: set('y'), right: set('right') } };
}

/**
 * Back to Auto (AC-498): the measure's mark and axis forgotten, its colour
 * and anything else kept, and no empty entry left behind, so the saved
 * options stay sparse.
 */
export function withComboAuto(
  options: Readonly<Record<string, unknown>>,
  measure: string,
): Record<string, unknown> {
  const current = seriesSettingsOf(options)[measure];
  if (current === undefined) return { ...options };
  const kept = Object.fromEntries(
    Object.entries(current).filter(([key]) => key !== 'mark' && key !== 'axis'),
  );
  return withSeriesSettings(options, measure, kept);
}
