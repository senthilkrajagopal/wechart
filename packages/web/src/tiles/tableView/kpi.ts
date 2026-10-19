import { labelOf } from '@wechart/charts';
import { formatterFor, kpiOptionsOf, kpiPeriodOf, memberOn, type RenderSpec } from '@wechart/core';

import { changeTextOf } from '../kpi/KpiChange';
import {
  comparedOf,
  numberOf,
  ordered,
  periodLabelOf,
  periodStartOf,
  targetOf,
  tilesOf,
  type KpiTileRows,
} from '../kpi/kpiFigures';
import type { TableView } from './index';

/**
 * The KPI's table view (T942, AC-569; design 23 sheet 1's table view; AC-178):
 * a row per tile, or one row, with the value in each period compared, the
 * change with ▲ or ▼, the target and the share of it ("EMEA · $412,000 ·
 * $395,000 · ▲ +4.2% · $450,000 · 92%"); only the columns the KPI has. A
 * KPI with none of R81's settings keeps its rows as queried.
 */
export function kpiTableView(spec: RenderSpec): TableView | undefined {
  const kpi = kpiOptionsOf(spec.options);
  const measure = memberOn(spec.encoding, 'y');
  if (measure === undefined) return undefined;
  if (
    kpi.compareTo === undefined &&
    kpi.target === undefined &&
    kpi.time === undefined &&
    kpi.tileBy === undefined
  )
    return undefined;
  const formats = spec.formats ?? {};
  const format = formatterFor(measure, formats, spec.granularities);
  const compareFormat = formatterFor(
    kpi.compareTo?.kind === 'measure' ? kpi.compareTo.member : measure,
    formats,
    spec.granularities,
  );
  const targetFormat = formatterFor(
    kpi.target?.kind === 'measure' ? kpi.target.member : measure,
    formats,
    spec.granularities,
  );

  const tiles: readonly KpiTileRows[] =
    kpi.tileBy === undefined
      ? [
          {
            member: '',
            value: numberOf(spec.rows[0]?.[measure]),
            current: spec.rows[0] ?? {},
            compared: spec.rows[1],
          },
        ]
      : ordered(tilesOf(spec, kpi.tileBy, measure), kpi.tileOrder);
  const each = tiles.map((tile) => ({
    tile,
    compared: comparedOf(spec, kpi, measure, tile.current, tile.compared),
    goal: targetOf(kpi, tile.current),
  }));

  // Headed by the periods where Time is set: the value's, then the one compared.
  const current =
    kpi.time === undefined
      ? labelOf(spec, measure)
      : periodLabelOf(
          periodStartOf(spec.rows[0]) ?? kpiPeriodOf(kpi.time.granularity, new Date()).current[0],
          kpi.time,
          spec,
        );
  const against =
    kpi.compareTo?.kind === 'value'
      ? 'Compared with'
      : (each.find((one) => one.compared?.against !== undefined)?.compared?.against ??
        'Compared with');
  const compares = kpi.compareTo !== undefined;
  const targets = kpi.target !== undefined;

  const columns = [
    ...(kpi.tileBy === undefined ? [] : [labelOf(spec, kpi.tileBy)]),
    current,
    ...(compares ? [against, 'Change'] : []),
    ...(targets ? ['Target', '%'] : []),
  ];
  const first = kpi.tileBy === undefined ? 0 : 1;
  return {
    columns,
    rows: each.map(({ tile, compared, goal }) => [
      ...(kpi.tileBy === undefined ? [] : [tile.member]),
      tile.value === undefined ? '—' : format(tile.value),
      ...(compares
        ? [
            compared?.value === undefined ? '—' : compareFormat(compared.value),
            compared === undefined || tile.value === undefined
              ? '—'
              : changeTextOf(tile.value, compared, measure, formats),
          ]
        : []),
      ...(targets
        ? [
            goal === undefined ? '—' : targetFormat(goal),
            goal === undefined || goal === 0 || tile.value === undefined
              ? '—'
              : `${String(Math.round((tile.value / goal) * 100))}%`,
          ]
        : []),
    ]),
    figures: columns.slice(first).map((_, at) => first + at),
  };
}
