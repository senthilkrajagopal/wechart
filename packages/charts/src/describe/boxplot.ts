import { drawnDistribution, formatterFor, memberOn, type RenderSpec } from '@wechart/core';

import { nameWriter, titleOf } from '../modelWriter';
import { boxesOf, drawnPointsOf, valuesByCategory } from '../series/boxplot';
import { densityOf } from '../series/violin';

/** A value to two significant figures: where a violin gathers is "near" it. */
const near = (value: number) => (value === 0 ? 0 : Number(value.toPrecision(2)));

/**
 * A box plot's text alternative (T993, AC-593; design 23 sheet 11; direction.md
 * rule 166): its measure and category, each box's n and five statistics as
 * drawn (the whiskers' ends, its quartiles and median), then how its points
 * are drawn and, with a violin, where each category gathers and which spreads
 * widest — "Points: every Order, as a beeswarm. Violin: EMEA gathers near
 * $120, APAC near $230; APAC spreads widest." (decision T993-1). Of what is
 * drawn: without Each point is, Outliers and no violin (T990-3).
 */
export function describeBoxplot(spec: RenderSpec): string | undefined {
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (category === undefined || measure === undefined) return undefined;
  const write = formatterFor(measure, spec.formats ?? {});
  const named = nameWriter(spec, category);

  const boxes = boxesOf(spec).map(
    ({ name, stats }) =>
      `${named(name)}: n ${stats.n.toLocaleString('en-US')}, low ${write(stats.low)}, Q1 ${write(stats.q1)}, median ${write(stats.median)}, Q3 ${write(stats.q3)}, high ${write(stats.high)}.`,
  );

  const { points, violin } = drawnDistribution(spec.options, spec.eachPointIs !== undefined);
  const entity = spec.eachPointIs === undefined ? '' : titleOf(spec, spec.eachPointIs);
  const pointsSaid =
    points === 'none'
      ? 'Points: none.'
      : points === 'outliers'
        ? (() => {
            const count = drawnPointsOf(spec).length;
            return `Points: ${count.toLocaleString('en-US')} ${count === 1 ? 'value' : 'values'} beyond the whiskers.`;
          })()
        : `Points: every ${entity}, ${points === 'beeswarm' ? 'as a beeswarm' : 'jittered'}.`;

  const sentences = [
    `Box plot of ${titleOf(spec, measure)} by ${titleOf(spec, category)}.`,
    ...boxes,
    pointsSaid,
  ];
  if (violin) {
    // Each violin's widest place, and the one running over the most values.
    const shapes = [...valuesByCategory(spec)].flatMap(([name, values]) => {
      const density = densityOf(values);
      if (density.length < 2) return [];
      const peak = density.reduce((best, one) => (one.width > best.width ? one : best));
      const spread = (density[density.length - 1]?.at ?? 0) - (density[0]?.at ?? 0);
      return [{ name, peak: near(peak.at), spread }];
    });
    const gathers = shapes.map(({ name, peak }, at) =>
      at === 0
        ? `${named(name)} gathers near ${write(peak)}`
        : `${named(name)} near ${write(peak)}`,
    );
    const widest = shapes.reduce<(typeof shapes)[number] | undefined>(
      (best, one) => (best === undefined || one.spread > best.spread ? one : best),
      undefined,
    );
    if (gathers.length > 0)
      sentences.push(
        `Violin: ${gathers.join(', ')}${
          shapes.length > 1 && widest !== undefined ? `; ${named(widest.name)} spreads widest` : ''
        }.`,
      );
  }
  return sentences.join(' ');
}
