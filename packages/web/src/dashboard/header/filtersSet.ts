import { activeFilters } from '../../filters/apply';
import type { DashboardFilter, FilterValues } from '../../filters/model';
import type { MarkFilter } from '../markings/filterToMarked';

/** What the Filters toggle summarises (AC-486). */
export interface FiltersSet {
  /** The filters holding a value, and those made from a marking. */
  readonly set: number;
  /** Every filter a reader is shown: those on a field, and those made from a marking. */
  readonly of: number;
  /** The set ones, by their fields' titles, in the bar's order. */
  readonly names: readonly string[];
}

/**
 * The dashboard's filters in summary, for the toggle's count, name and
 * description (AC-486; design 19 B3): the filters holding a value that
 * filters something — as the tiles are asked them (`activeFilters`) — then
 * the filters made from a marking (AC-113), which sit after them in the bar.
 * A filter with no field yet is not one a reader is shown, so it isn't
 * counted.
 */
export function filtersSet(
  filters: readonly DashboardFilter[],
  values: FilterValues,
  markFilters: readonly Pick<MarkFilter, 'members'>[],
  titleOf: (member: string) => string,
): FiltersSet {
  const active = activeFilters(filters, values);
  const onAField = filters.filter((filter) => filter.member !== undefined);
  return {
    set: active.length + markFilters.length,
    of: onAField.length + markFilters.length,
    names: [
      ...active.map(({ filter }) => titleOf(filter.member ?? '')),
      ...markFilters.map((each) => each.members.map(titleOf).join(' and ')),
    ],
  };
}
