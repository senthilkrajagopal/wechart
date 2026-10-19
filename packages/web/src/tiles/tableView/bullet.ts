import { bulletsOf } from '@wechart/charts';
import {
  bulletBandOf,
  bulletOptionsOf,
  columnTitleOf,
  formatterFor,
  memberOn,
  type RenderSpec,
} from '@wechart/core';

import type { TableView } from './index';

/**
 * The bullet chart's table view (T956, AC-583; design 23 sheet 8; AC-178):
 * a row per member, its value in its measure's format, its target in its
 * own, its share of target ("92%") and the band it is in ("80–100 %"); a
 * member with no target says so in Band.
 */
export function bulletTableView(spec: RenderSpec): TableView {
  const category = memberOn(spec.encoding, 'x') ?? '';
  const measure = memberOn(spec.encoding, 'y') ?? '';
  const { bands, target } = bulletOptionsOf(spec.options);
  const formats = spec.formats ?? {};
  const format = formatterFor(measure, formats, spec.granularities);
  const formatTarget =
    target?.kind === 'measure' ? formatterFor(target.member, formats, spec.granularities) : format;
  return {
    columns: [
      columnTitleOf(category, spec.titles),
      columnTitleOf(measure, spec.titles),
      'Target',
      '% of target',
      'Band',
    ],
    figures: [1, 2, 3],
    rows: bulletsOf(spec).map(({ member, value, target: goal }) => {
      const band = bulletBandOf(value, goal, bands);
      return [
        member,
        value === null ? '' : format(value),
        goal === null ? '' : formatTarget(goal),
        band === undefined ? '' : `${String(band.percent)}%`,
        goal === null ? 'No target' : (band?.band ?? ''),
      ];
    }),
  };
}
