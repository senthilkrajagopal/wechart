import type { RenderSpec } from '@wechart/core';

import { titleOf } from '../modelWriter';
import { sankeyDrawnOf } from '../series/sankey';

/** A step list as a sentence says it: "from A to B", "from A through B and C to D". */
function route(titles: readonly string[]): string {
  const [first, ...rest] = titles;
  const last = rest.pop();
  if (first === undefined || last === undefined) return '';
  if (rest.length === 0) return `from ${first} to ${last}`;
  const through =
    rest.length === 1 ? rest[0] : `${rest.slice(0, -1).join(', ')} and ${rest.at(-1) ?? ''}`;
  return `from ${first} through ${through ?? ''} to ${last}`;
}

/** Whether a measure's model format is money: its name, a currency, or a "$" specifier. */
function isMoney(format: unknown): { currency: string } | undefined {
  if (typeof format === 'string')
    return format.startsWith('currency') ? { currency: 'USD' } : undefined;
  if (typeof format !== 'object' || format === null) return undefined;
  const { currency, specifier } = format as { currency?: unknown; specifier?: unknown };
  if (typeof currency === 'string') return { currency };
  return typeof specifier === 'string' && specifier.startsWith('$')
    ? { currency: 'USD' }
    : undefined;
}

/**
 * A Sankey's text alternative (T989, AC-613; design 23 sheet 10; direction.md
 * rule 166): its measure and steps, how many flows, their total, and the
 * three largest — "Sankey of Revenue from Channel to Region, 12 flows,
 * $1.35M. Largest: Web → North America $237K; Web → EMEA $210K; Retail →
 * North America $183K." Every flow as the rows hold it, not as folded past
 * 50; the total is what leaves the first step. Amounts to three figures.
 */
export function describeSankey(spec: RenderSpec): string | undefined {
  const { steps, measure, flows } = sankeyDrawnOf(spec, false);
  if (measure === undefined || flows.length === 0) return undefined;
  const money = isMoney(spec.formats?.[measure]);
  const short = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumSignificantDigits: 3,
    ...(money === undefined ? {} : { style: 'currency', currency: money.currency }),
  });
  const total = flows.filter((flow) => flow.from === 0).reduce((sum, flow) => sum + flow.value, 0);
  const largest = [...flows]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((flow) => `${flow.source} → ${flow.target} ${short.format(flow.value)}`);
  const count = `${flows.length.toLocaleString('en-US')} ${flows.length === 1 ? 'flow' : 'flows'}`;
  return `Sankey of ${titleOf(spec, measure)} ${route(steps.map((step) => titleOf(spec, step)))}, ${count}, ${short.format(total)}. Largest: ${largest.join('; ')}.`;
}
