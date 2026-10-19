import {
  bulletBandOf,
  bulletOptionsOf,
  formatterFor,
  memberOn,
  type RenderSpec,
} from '@wechart/core';

import { nameWriter, titleOf } from '../modelWriter';
import { bulletsOf } from '../series/bullet';

/**
 * A member's title as a count of them: "1 region", "4 regions", "2
 * categories", in lower case as a sentence carries it.
 */
export function countOf(n: number, title: string): string {
  const word = title.toLowerCase();
  if (n === 1) return `1 ${word}`;
  const plural = /[^aeiou]y$/.test(word)
    ? `${word.slice(0, -1)}ies`
    : /(s|x|z|ch|sh)$/.test(word)
      ? `${word}es`
      : `${word}s`;
  return `${String(n)} ${plural}`;
}

/** Up to three names, then how many more. */
function named(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${String(names.length - 3)} more`;
}

/**
 * The bullet chart's text alternative (T956, AC-583; design 23 sheet 8;
 * direction.md rule 166): the chart summed up — "4 regions; 1 above target
 * (North America)." — then each bullet named — "EMEA: $412,000 of $450,000
 * target (92 %), in the 80–100 % band." — each value in its measure's
 * format and each target in its own. A member with no target says so.
 */
export function describeBullet(spec: RenderSpec): string | undefined {
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (category === undefined || measure === undefined) return undefined;
  const { bands, target } = bulletOptionsOf(spec.options);
  const format = formatterFor(measure, spec.formats ?? {}, spec.granularities);
  const formatTarget =
    target?.kind === 'measure'
      ? formatterFor(target.member, spec.formats ?? {}, spec.granularities)
      : format;
  const memberName = nameWriter(spec, category);
  const bullets = bulletsOf(spec);

  const above = bullets
    .filter((one) => one.value !== null && one.target !== null && one.value > one.target)
    .map((one) => memberName(one.member));
  const summary = `${countOf(bullets.length, titleOf(spec, category))}; ${
    above.length === 0
      ? 'none above target'
      : `${String(above.length)} above target (${named(above)})`
  }.`;

  const each = bullets.map(({ member, value, target: goal }) => {
    const shown = value === null ? 'no value' : format(value);
    const band = bulletBandOf(value, goal, bands);
    if (goal === null || band === undefined) return `${memberName(member)}: ${shown}, no target.`;
    return `${memberName(member)}: ${shown} of ${formatTarget(goal)} target (${String(band.percent)} %), in the ${band.band} band.`;
  });
  return [summary, ...each].join(' ');
}
