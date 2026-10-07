/**
 * The trellis, or small multiples (AC-037, AC-045).
 *
 * One ECharts instance holding several `grid`s, each with its own axes, title
 * and series — the arrangement `docs/research/echarts.md` identifies for this,
 * and the reason `title.triggerEvent` will carry panel-header marking later
 * (AC-091).
 *
 * The shared scale is the part that matters. Under independent scales every
 * panel fills its own box, which looks correct and says something false: two
 * regions whose values differ tenfold appear alike. direction.md has axes
 * synchronised by default and settable to independent, and that is the shape
 * here.
 */
import { distinctValues, formatterFor, memberOn, membersOn, type RenderSpec } from '@wechart/core';

import { DEFAULT_PALETTE, DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';
import { labelOf, modelWriter, nameWriter } from '../modelWriter';
import { DEFAULT_CANVAS, gapFor, laidBarWidth, type Canvas } from '../series/bar';

export function isTrellisType(chartType: string): boolean {
  return chartType === 'trellis';
}

/**
 * direction.md rule 6. Past twenty a panel is too small to read, and the
 * chart stops being a chart.
 */
export const MAX_PANELS = 20;

/** Columns before wrapping, so panels stay wide enough to read. */
const COLUMNS = 4;
const GAP_PERCENT = 4;
const TITLE_SPACE_PERCENT = 6;

function numberAt(row: Record<string, unknown>, member: string): number | null {
  const raw = row[member];
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function trellisOption(spec: RenderSpec, canvas: Canvas = DEFAULT_CANVAS): EChartsOption {
  if (!isTrellisType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a trellis`);
  }

  const palette = spec.palette ?? DEFAULT_PALETTE;
  const surface = spec.surface ?? DEFAULT_SURFACE;
  const facet = memberOn(spec.encoding, 'facet');
  const category = memberOn(spec.encoding, 'x');
  const measures = membersOn(spec.encoding, 'y');
  const measure = measures[0];
  /**
   * A panel per metric (T510; UX-057, the user's option (a)): with nothing to
   * panel by and several metrics, each is drawn in a panel of its own, on its
   * own scale and in its own format, so metrics on different scales are each
   * read at their own height.
   */
  const byMetric = facet === undefined && measures.length > 1;

  if (category === undefined || measure === undefined || (facet === undefined && !byMetric)) {
    return { animation: false, grid: [], xAxis: [], yAxis: [], title: [], series: [] };
  }

  // First-appearance order, capped. Sorting would override the order Cube was
  // asked for (AC-044), and dropping from the front would hide the panels a
  // reader is most likely to want. By metric, the Metrics well's order.
  const panels = (byMetric ? [...measures] : distinctValues(spec.rows, facet ?? '')).slice(
    0,
    MAX_PANELS,
  );
  const categories = distinctValues(spec.rows, category);

  const valuesFor = (panel: string) =>
    categories.map((name) => {
      const row = spec.rows.find(
        (candidate) =>
          (byMetric || String(candidate[facet ?? ''] ?? '') === panel) &&
          String(candidate[category] ?? '') === name,
      );
      return row === undefined ? null : numberAt(row, byMetric ? panel : measure);
    });

  const series = panels.map(valuesFor);

  // Synchronised unless the chart says otherwise; by metric, each its own,
  // as one scale for two units would say nothing true.
  const shared = !byMetric && spec.options?.['sharedScale'] !== false;
  const everyValue = series.flat().filter((value) => value !== null);
  const sharedMax = everyValue.length === 0 ? undefined : Math.max(...everyValue);

  // Never more columns than panels: two panels laid on a four-column grid sit
  // in the left half with empty space beside them, which reads as two panels
  // missing rather than as two panels.
  const columns = Math.min(COLUMNS, panels.length);
  const rows = Math.ceil(panels.length / columns);
  const cellWidth = (100 - GAP_PERCENT * (columns + 1)) / columns;
  const cellHeight = (100 - GAP_PERCENT * (rows + 1)) / rows;

  const place = (index: number) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      left: `${String(GAP_PERCENT + column * (cellWidth + GAP_PERCENT))}%`,
      top: `${String(GAP_PERCENT + row * (cellHeight + GAP_PERCENT) + TITLE_SPACE_PERCENT)}%`,
      width: `${String(cellWidth)}%`,
      height: `${String(cellHeight - TITLE_SPACE_PERCENT)}%`,
    };
  };

  // A panel of time is titled, and a category of time labelled, by its
  // granularity (AC-188); each keeps its raw value as its name. A metric's
  // panel by the metric, as a legend names it (AC-220).
  const panelTitle = byMetric ? (panel: string) => labelOf(spec, panel) : nameWriter(spec, facet);
  const categoryTime = modelWriter(spec, category);

  return {
    animation: false,
    grid: panels.map((_, index) => place(index)),
    title: panels.map((panel, index) => ({
      text: panelTitle(panel),
      left: place(index).left,
      top: `${String(GAP_PERCENT + Math.floor(index / columns) * (cellHeight + GAP_PERCENT))}%`,
      textStyle: { fontSize: 12 },
      // The hook AC-091 needs to mark a whole panel from its header. A
      // metric's header names no value to mark by (T510): its bars mark by
      // their category, as a bar's do.
      triggerEvent: !byMetric,
    })),
    xAxis: panels.map((_, index) => ({
      gridIndex: index,
      type: 'category' as const,
      data: categories,
      ...(categoryTime === undefined ? {} : { axisLabel: { formatter: categoryTime } }),
    })),
    yAxis: panels.map((_, index) => ({
      gridIndex: index,
      type: 'value' as const,
      ...(shared && sharedMax !== undefined ? { min: 0, max: sharedMax } : {}),
      // The measure's format on every panel's values (AC-046, T195). A trellis
      // has an array of axes, which the shared axis settings leave alone, so
      // it wore none at all. By metric, each panel its own metric's (T510).
      axisLabel: {
        formatter: formatterFor(
          byMetric ? (panels[index] ?? measure) : measure,
          spec.formats ?? {},
        ),
      },
    })),
    series: panels.map((panel, index) => ({
      type: 'bar' as const,
      // Named for its panel, so the tooltip can say which panel a value is in.
      name: panel,
      xAxisIndex: index,
      yAxisIndex: index,
      data: series[index] ?? [],
      itemStyle: {
        color: palette[0],
        borderColor: surface,
        // The gap where it leaves each bar its colour (AC-210): a panel's
        // category axis runs its cell's width, set here rather than by
        // ECharts' default grid.
        borderWidth: gapFor(laidBarWidth((canvas.width * cellWidth) / 100, categories.length, 1)),
        borderRadius: [MARK.cornerRadiusPx, MARK.cornerRadiusPx, 0, 0],
      },
    })),
  };
}
