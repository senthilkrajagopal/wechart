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
import { distinctValues, formatterFor, memberOn, type RenderSpec } from '@wechart/core';

import { DEFAULT_PALETTE, DEFAULT_SURFACE, MARK, type EChartsOption } from '../theme';
import { nameWriter, timeWriter } from '../time';

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

export function trellisOption(spec: RenderSpec): EChartsOption {
  if (!isTrellisType(spec.chartType)) {
    throw new Error(`${spec.chartType} is not a trellis`);
  }

  const palette = spec.palette ?? DEFAULT_PALETTE;
  const surface = spec.surface ?? DEFAULT_SURFACE;
  const facet = memberOn(spec.encoding, 'facet');
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');

  if (facet === undefined || category === undefined || measure === undefined) {
    return { animation: false, grid: [], xAxis: [], yAxis: [], title: [], series: [] };
  }

  // First-appearance order, capped. Sorting would override the order Cube was
  // asked for (AC-044), and dropping from the front would hide the panels a
  // reader is most likely to want.
  const panels = distinctValues(spec.rows, facet).slice(0, MAX_PANELS);
  const categories = distinctValues(spec.rows, category);

  const valuesFor = (panel: string) =>
    categories.map((name) => {
      const row = spec.rows.find(
        (candidate) =>
          String(candidate[facet] ?? '') === panel && String(candidate[category] ?? '') === name,
      );
      return row === undefined ? null : numberAt(row, measure);
    });

  const series = panels.map(valuesFor);

  // Synchronised unless the chart says otherwise.
  const shared = spec.options?.['sharedScale'] !== false;
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
  // granularity (AC-188); each keeps its raw value as its name.
  const panelTitle = nameWriter(spec, facet);
  const categoryTime = timeWriter(spec, category);

  return {
    animation: false,
    grid: panels.map((_, index) => place(index)),
    title: panels.map((panel, index) => ({
      text: panelTitle(panel),
      left: place(index).left,
      top: `${String(GAP_PERCENT + Math.floor(index / columns) * (cellHeight + GAP_PERCENT))}%`,
      textStyle: { fontSize: 12 },
      // The hook AC-091 needs to mark a whole panel from its header.
      triggerEvent: true,
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
      // it wore none at all.
      axisLabel: { formatter: formatterFor(measure, spec.formats ?? {}) },
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
        borderWidth: MARK.gapPx,
        borderRadius: [MARK.cornerRadiusPx, MARK.cornerRadiusPx, 0, 0],
      },
    })),
  };
}
