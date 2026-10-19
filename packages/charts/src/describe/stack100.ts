import {
  foldForShares,
  isPercentStack,
  memberOn,
  seriesOf,
  sharesOf,
  type RenderSpec,
} from '@wechart/core';

import { nameWriter, seriesWriter, titleOf } from '../modelWriter';

/**
 * A 100 % stack's text alternative (T958, AC-585; design 23 sheet 9;
 * direction.md rule 166): the chart by its type, measure and groupings, then
 * where the first colour member's share is largest and smallest — "100 %
 * stacked bar of Revenue by Region and Channel. Web’s share is largest in
 * APAC (62 %) and smallest in LATAM (38 %)." Of the series as drawn, folded
 * past 8 first (`foldForShares`). Nothing for a stack drawn at Sum, which has
 * no shares to name.
 */
export function describeStack100(given: RenderSpec): string | undefined {
  if (!isPercentStack(given)) return undefined;
  const spec = foldForShares(given);
  const category = memberOn(spec.encoding, 'x');
  const split = memberOn(spec.encoding, 'color');
  const measure = memberOn(spec.encoding, 'y');
  if (category === undefined || split === undefined || measure === undefined) return undefined;

  const kind = spec.chartType === 'stackedArea' ? 'area' : 'bar';
  const head = `100 % stacked ${kind} of ${titleOf(spec, measure)} by ${titleOf(spec, category)} and ${titleOf(spec, split)}.`;

  const { categories, series } = seriesOf(spec);
  const first = sharesOf(series)[0];
  if (first === undefined) return head;
  const shares = first.values.flatMap((share, at) =>
    share === null ? [] : [{ share, name: categories[at] ?? '' }],
  );
  const largest = shares.reduce<(typeof shares)[number] | undefined>(
    (best, one) => (best === undefined || one.share > best.share ? one : best),
    undefined,
  );
  const smallest = shares.reduce<(typeof shares)[number] | undefined>(
    (best, one) => (best === undefined || one.share < best.share ? one : best),
    undefined,
  );
  if (largest === undefined || smallest === undefined) return head;

  const named = nameWriter(spec, category);
  const member = seriesWriter(spec, split)(first.name);
  const pct = (share: number) => `${String(Math.round(share))} %`;
  return `${head} ${member}’s share is largest in ${named(largest.name)} (${pct(largest.share)}) and smallest in ${named(smallest.name)} (${pct(smallest.share)}).`;
}
