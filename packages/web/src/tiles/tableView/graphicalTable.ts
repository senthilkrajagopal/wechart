import { columnsOf, columnTitleOf, formatValue, memberOn, type RenderSpec } from '@wechart/core';

import {
  changeReadingOf,
  headingOf,
  iconValueOf,
  matcherFor,
  rulesOf,
  sparklineValuesOf,
  targetOf,
  trendFor,
  type LoadedTrend,
} from '../GraphicalTable';
import { changeWordsOf } from '../text/elements/ChangeElement';
import { ruleFor } from '../text/elements/IconElement';
import { shortValues } from '../text/elements/shortNumbers';
import type { TableView } from './index';

type Row = Readonly<Record<string, unknown>>;

/**
 * The graphical table's "View as table" (T947, AC-574; design 23 sheet 2,
 * "View as table"; AC-178): a row per member of Rows, in the sections' order,
 * every page's, and for each column the numbers behind its cell, as its cell
 * draws them — a Value its value; a Sparkline its first and last values as
 * its text alternative writes them ("$84K → $112K"); a Bullet its value and
 * target ("23.1% / 25%"); an Icon its word; a Change its two periods' values
 * and the change its cell shows ("$320K → $337K · ▲ 5.3%"), or which period
 * has no data. Columns headed as the table heads them, members by their full
 * titles (AC-220). A trend on its way or failed says so.
 */
export function graphicalTableTableView(
  spec: RenderSpec,
  trends: readonly LoadedTrend[],
  now: Date,
): TableView {
  const columns = columnsOf(spec.options);
  const rowsMember = memberOn(spec.encoding, 'x') ?? '';
  const groupBy = memberOn(spec.encoding, 'facet');
  const chartTime = Object.keys(spec.granularities ?? {})[0];
  const formats = spec.formats ?? {};
  const full: RenderSpec = { ...spec, shortTitles: {} };
  const lead = groupBy === undefined ? 1 : 2;
  // In the sections' order, as the table draws them.
  const sections =
    groupBy === undefined
      ? [spec.rows]
      : [...new Set(spec.rows.map((row) => String(row[groupBy] ?? '')))].map((name) =>
          spec.rows.filter((row) => String(row[groupBy] ?? '') === name),
        );

  const cellOf = (column: (typeof columns)[number], row: Row): string => {
    const measure = column.settings.measure;
    const write = (value: unknown) => formatValue(value, measure, formats);
    if (column.kind === 'value') return write(row[measure]);
    if (column.kind === 'icon')
      return ruleFor(iconValueOf(column, row), rulesOf(column))?.label ?? 'No rule matched';
    if (column.kind === 'bullet') {
      const value = row[measure];
      if (value === null || value === undefined || value === '') return '—';
      // Both in the measure's format, as the bullet's alternative reads them.
      const target = targetOf(column, row);
      return target === undefined ? write(value) : `${write(value)} / ${write(target)}`;
    }
    const trend = trendFor(column, trends, chartTime);
    if (trend?.pending === true) return 'Loading…';
    if (trend?.error !== undefined) return 'Unavailable';
    const matches = matcherFor(row, rowsMember, groupBy);
    if (column.kind === 'sparkline') {
      const present = sparklineValuesOf(column, trend, matches, now).filter(
        (value): value is number => value !== null,
      );
      if (present.length === 0) return '—';
      // As its text alternative writes them: one scale for first, last, low and high.
      const [first, last] = shortValues(
        [present[0] ?? 0, present.at(-1) ?? 0, Math.min(...present), Math.max(...present)],
        measure,
        formats,
      );
      return `${first ?? ''} → ${last ?? ''}`;
    }
    const reading = changeReadingOf(measure, trend, matches, now, formats);
    if (reading.kind === 'missing') return reading.said;
    const { change } = reading;
    if (change === undefined) return '—';
    const [previous, current] = shortValues([change.previous, change.current], measure, formats);
    const words = changeWordsOf(
      change,
      measure,
      formats,
      column.settings['show'] === 'amount' ? 'amount' : 'percent',
    );
    return `${previous ?? ''} → ${current ?? ''} · ${words ?? '—'}`;
  };

  return {
    columns: [
      columnTitleOf(rowsMember, spec.titles),
      ...(groupBy === undefined ? [] : [columnTitleOf(groupBy, spec.titles)]),
      ...columns.map((column) => headingOf(column, full)),
    ],
    // Its figures set right: every column but an Icon's word.
    figures: columns.flatMap((column, at) => (column.kind === 'icon' ? [] : [lead + at])),
    rows: sections
      .flat()
      .map((row) => [
        String(row[rowsMember] ?? ''),
        ...(groupBy === undefined ? [] : [String(row[groupBy] ?? '')]),
        ...columns.map((column) => cellOf(column, row)),
      ]),
  };
}
