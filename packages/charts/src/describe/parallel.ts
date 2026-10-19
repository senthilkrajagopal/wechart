import { formatterFor, isEmptyPredicate, matchesPredicate, type RenderSpec } from '@wechart/core';

import { membersBrushed } from '../interaction/parallelBrush';
import { titleOf } from '../modelWriter';
import { parallelLinesOf } from '../series/parallel';

/** A dimension's title as a plural noun in a sentence: "Product" → "products". */
function plural(title: string, count: number): string {
  const word = title.toLowerCase();
  if (count === 1) return word;
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`;
  return `${word}s`;
}

/** A list as a sentence says it: "A", "A and B", "A, B and C". */
function listed(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/**
 * Parallel coordinates' text alternative (T985, AC-601; design 23 sheet 7;
 * direction.md rule 166): its members drawn, its measures and its scale,
 * then how many are marked and, where brushes made the marking, through
 * which ranges — "Parallel coordinates of 14 products across 5 measures,
 * each axis min to max. 6 marked through Margin % 22%–26%." Each range in
 * its measure's own format (decision T985-1).
 */
export function describeParallel(spec: RenderSpec): string | undefined {
  const { lineBy, axes, scale, drawn, rows } = parallelLinesOf(spec);
  if (lineBy === undefined || axes.length === 0) return undefined;
  const head = `Parallel coordinates of ${drawn.toLocaleString('en-US')} ${plural(titleOf(spec, lineBy), drawn)} across ${String(axes.length)} measures, ${scale === 'shared' ? 'on one shared scale' : 'each axis min to max'}.`;

  const marking = spec.marking;
  if (marking === undefined || (marking.whole !== true && isEmptyPredicate(marking.predicate)))
    return head;
  const marked = new Set(
    rows
      .filter((row) => marking.whole === true || matchesPredicate(marking.predicate, row))
      .map((row) => String(row[lineBy] ?? '')),
  ).size;
  const brushes = spec.parallelBrushes ?? [];
  // Through the brushes only while they still are what marked it.
  const through =
    brushes.length > 0 && membersBrushed(spec, brushes).length === marked
      ? ` through ${listed(
          brushes.map((brush) => {
            const write = formatterFor(brush.member, spec.formats ?? {});
            return `${titleOf(spec, brush.member)} ${write(brush.from)}–${write(brush.to)}`;
          }),
        )}`
      : '';
  return `${head} ${marked.toLocaleString('en-US')} marked${through}.`;
}
