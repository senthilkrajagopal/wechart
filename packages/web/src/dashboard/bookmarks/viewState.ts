import type { FilterValues } from '../../filters/model';
import type { MarkFilter } from '../markings/filterToMarked';
import type { MarkingState } from '../markings/store';

/**
 * What a reader has made of a dashboard, apart from the dashboard itself: the
 * page tab shown, the filters' values, what is marked — with the filters
 * "Filter to marked" made, and the tile each marking was marked from, which
 * its chip names. A bookmark keeps it (AC-121) and a link with marks carries
 * it (AC-123); neither is ever the dashboard's saved definition (AC-122,
 * direction.md rule 54).
 */
export interface ViewState {
  readonly page: string;
  readonly filters: FilterValues;
  readonly marks: MarkingState;
  readonly markFilters: readonly MarkFilter[];
  readonly from: Readonly<Record<string, string>>;
}
