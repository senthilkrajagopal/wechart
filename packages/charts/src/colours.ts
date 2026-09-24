/**
 * The colour a mark is drawn in (AC-039).
 *
 * One lookup, used by every renderer, so that "colour follows the member" is a
 * property of wechart rather than of whichever renderers remembered it. The
 * dashboard's assignment wins; without one, position in the palette is right,
 * because a chart standing on its own has no other tile to agree with.
 */
import { OTHER_LABEL, type RenderSpec } from '@wechart/core';

import { OTHER_COLOUR } from './colorAssignment';
import { seriesSettingsOf } from './customize';
import { DEFAULT_PALETTE } from './theme';

export function colourFor(spec: RenderSpec, member: string, index: number): string {
  // A colour chosen for this series in the Customize tab (AC-219) comes first.
  const chosen = seriesSettingsOf(spec)[member]?.colour;
  if (chosen !== undefined) return chosen;

  const assigned = spec.colours?.[member];
  if (assigned !== undefined) return assigned;

  // The folded tail takes the neutral rather than a palette slot (AC-041,
  // direction.md §5). It is not a member, and giving it a member's colour
  // would put it in the same visual class as the things it hides.
  if (member.startsWith(`${OTHER_LABEL} (`)) return OTHER_COLOUR;

  const palette = spec.palette ?? DEFAULT_PALETTE;
  return palette[index % palette.length] ?? DEFAULT_PALETTE[0];
}
