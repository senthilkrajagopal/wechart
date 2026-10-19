import { useCallback, useState } from 'react';

import type { Member } from '../../../editor/fields';
import { FilterPill } from '../../../filters/FilterBar';
import type { DashboardFilter, FilterValue } from '../../../filters/model';

export interface FilterControlProps {
  /** The dashboard filter it is; none once that filter has been deleted. */
  readonly filter: DashboardFilter | undefined;
  readonly member: Member | undefined;
  /** As the bar names the filter (`filterNameOf`). */
  readonly name: string;
  /** Its scope tag's words, as the bar's (`scopeLabel`, AC-077). */
  readonly scope: string;
  /** The dashboard's value for the filter: the one the bar shows. */
  readonly value: FilterValue | undefined;
  /** Sets the dashboard's value for the filter: the one the bar sets. */
  readonly onValue: (value: FilterValue | undefined) => void;
}

/**
 * A Filter control in a Text tile (T892, AC-528; design 21 screen 2 pin 6,
 * states D1, D2 and L; rules 14, 135): one of the dashboard's filters, not a
 * copy. It is the filter bar's own pill (`FilterPill`) at 28 px, with its
 * scope tag, showing the dashboard's value and setting it through the same
 * handler as the bar — so it holds no value of its own, and a change in
 * either place is in both, in the header's count and in every tile the
 * filter reaches.
 *
 * Its popover is its own: opening it here doesn't open the bar's.
 *
 * A control whose filter has been deleted draws nothing a reader can work
 * and filters nothing; in edit mode the tile says it needs fixing (AC-525).
 */
export function FilterControl({ filter, member, name, scope, value, onValue }: FilterControlProps) {
  const [open, setOpen] = useState(false);
  const onOpen = useCallback((next: boolean) => {
    setOpen(next);
  }, []);
  if (filter === undefined || member === undefined) return null;
  return (
    <span className="text-filter-control">
      <FilterPill
        filter={filter}
        member={member}
        name={name}
        scope={scope}
        value={value}
        onValue={onValue}
        open={open}
        onOpen={onOpen}
        compact
      />
    </span>
  );
}
