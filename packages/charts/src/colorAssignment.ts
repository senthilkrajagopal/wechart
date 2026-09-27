/**
 * Colour follows the member, not its rank (AC-039, direction.md rule 7).
 *
 * The failure this exists to prevent is colour assigned by position. Two tiles
 * listing the same members in a different order paint them differently, and a
 * filter that removes one member repaints every member after it — so a reader
 * who has learnt that blue means "east" is taught something false by the act
 * of filtering. Superset shows the cost of the alternative: its per-chart
 * `label_colors` is a map copied into each chart, and one shipped example
 * carries a fifty-entry map most of whose keys belong to other charts.
 *
 * An assignment is therefore a *dashboard-level* object, handed to each tile,
 * and it only ever grows.
 */
import { DEFAULT_PALETTE } from './theme';

/**
 * direction.md §5: the neutral outside the palette, used for "Other" and for
 * null. Light theme; the dark value is `#5c5b57`.
 */
export const OTHER_COLOUR = '#b3b1ab';

export interface ColourAssignment {
  /** The colour for a member, assigning one the first time it is asked for. */
  colourFor: (member: string) => string;
  /** Everything assigned so far, so a dashboard can save it. */
  assigned: () => Record<string, string>;
}

export function assignColours(
  palette: readonly string[] = DEFAULT_PALETTE,
  starting: Readonly<Record<string, string>> = {},
  /**
   * Colours spoken for without a claim — a colour a tile's Customize tab
   * chose for a member (T465) — which no member is newly given.
   */
  reserved: readonly string[] = [],
): ColourAssignment {
  const taken = new Map<string, string>(Object.entries(starting));

  return {
    colourFor(member) {
      const already = taken.get(member);
      if (already !== undefined) return already;

      // The next unused slot, so that handing in a starting assignment does
      // not cause a later member to collide with it.
      const used = new Set([...taken.values(), ...reserved]);
      const free = palette.find((colour) => !used.has(colour));

      // Past the last slot, the neutral rather than a repeat. direction.md
      // caps categorical colour at its validated slots; cycling would give
      // two members the same colour and so say they were the same thing,
      // where the neutral says "not separately coloured", which is true.
      const colour = free ?? OTHER_COLOUR;
      taken.set(member, colour);
      return colour;
    },

    assigned() {
      return Object.fromEntries(taken);
    },
  };
}
