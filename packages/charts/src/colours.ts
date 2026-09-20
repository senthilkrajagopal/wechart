/**
 * The colour a mark is drawn in (AC-039).
 *
 * One lookup, used by every renderer, so that "colour follows the member" is a
 * property of wechart rather than of whichever renderers remembered it. The
 * dashboard's assignment wins; without one, position in the palette is right,
 * because a chart standing on its own has no other tile to agree with.
 */
import type { RenderSpec } from '@wechart/core';

import { DEFAULT_PALETTE } from './theme';

export function colourFor(spec: RenderSpec, member: string, index: number): string {
  const assigned = spec.colours?.[member];
  if (assigned !== undefined) return assigned;

  const palette = spec.palette ?? DEFAULT_PALETTE;
  return palette[index % palette.length] ?? DEFAULT_PALETTE[0];
}
