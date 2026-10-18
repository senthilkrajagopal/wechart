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
import type { ComboAxis, ComboMark, SeriesOptions } from './render-spec';

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
): ComboSeries[] {
  const settings = seriesSettingsOf(options);
  return measures.map((measure, position) => {
    const auto = autoOf(position);
    const chosen = settings[measure] ?? {};
    const mark = isMark(chosen['mark']) ? chosen['mark'] : undefined;
    const axis = isAxis(chosen['axis']) ? chosen['axis'] : undefined;
    return {
      measure,
      mark: mark ?? auto.mark,
      axis: axis ?? auto.axis,
      auto: mark === undefined && axis === undefined,
    };
  });
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
  if (!isRecord(series)) return [];
  const problems: string[] = [];
  for (const [name, settings] of Object.entries(series)) {
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
  return problems;
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
