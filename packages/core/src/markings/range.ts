import { EMPTY_PREDICATE, type BoundedRange, type MarkingPredicate } from './predicate';

/**
 * Marking a continuous range by dragging along an axis (AC-093).
 *
 * Spotfire's range-based marking, and `references-markings.md` quotes the
 * part that matters most: a marked range "does not take active filtering and
 * data limitations into consideration". That is why the bounds are two values
 * on the axis and nothing else. A range derived from what is currently on
 * screen — the extent of the visible data, say — would rescale itself every
 * time a filter changed, so the same stripe would mean a different span from
 * one moment to the next and two readings of the same dashboard would not be
 * comparable.
 *
 * The pixels-to-values conversion is `convertFromPixel` at the call site, for
 * the same reason the hit-testing geometry keeps it out: the hard part stays
 * testable without a chart instance.
 */
export interface AxisDrag {
  readonly member: string;
  readonly granularity?: string;
  /** Where the drag began and ended, in axis values, in that order. */
  readonly from: string | number;
  readonly to: string | number;
}

export interface RangeModifiers {
  /** True for Ctrl-drag and ⌘-drag: add a range rather than replace. */
  readonly add: boolean;
}

/**
 * The range a drag describes, with its ends the right way round.
 *
 * Dragging right to left is the same intention as left to right, and a range
 * that ended before it started would match nothing at all — a marking that
 * silently did nothing, which is worse than one that refuses.
 */
export function rangeFromDrag({ member, granularity, from, to }: AxisDrag): BoundedRange {
  const [start, end] = from <= to ? [from, to] : [to, from];

  return {
    member,
    ...(granularity === undefined ? {} : { granularity }),
    from: start,
    to: end,
  };
}

/**
 * The marking after dragging a range on an axis.
 *
 * A plain drag replaces the marking, as a plain click does; Ctrl-drag adds a
 * range, which `references-markings.md` records as Spotfire's gesture, and
 * keeps whatever was already marked — adding is not restarting.
 */
export function applyAxisRange(
  predicate: MarkingPredicate,
  range: BoundedRange,
  { add }: RangeModifiers,
): MarkingPredicate {
  if (!add) return { ...EMPTY_PREDICATE, ranges: [range] };

  return { ...predicate, ranges: [...predicate.ranges, range] };
}
