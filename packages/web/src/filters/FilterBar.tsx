import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { cubesFrom, membersOf, type Member } from '../editor/fields';
import { loadTile } from '../query/loadTile';
import { META_QUERY } from '../query/meta';
import {
  FILTER_WIDGETS,
  membersFor,
  type DashboardFilter,
  type FilterValue,
  type FilterValues,
} from './model';
import { CheckboxList } from './widgets/CheckboxList';
import { DateRange } from './widgets/DateRange';
import { ListSearch } from './widgets/ListSearch';
import { NumericRange } from './widgets/NumericRange';

/**
 * The filter bar (F9; direction.md §2: "Horizontal, under the title"). Each
 * filter is a widget on a field; in edit mode it also offers the field to
 * filter on and a way to remove it.
 */
export interface FilterBarProps {
  readonly filters: readonly DashboardFilter[];
  readonly values: FilterValues;
  readonly onValue: (filterId: string, value: FilterValue | undefined) => void;
  readonly editing: boolean;
  /** Change the filters themselves — their fields, which there are. Edit mode only. */
  readonly onFilters?: ((next: readonly DashboardFilter[]) => void) | undefined;
}

/** Every member of every cube and view, once each. */
function allMembers(meta: unknown): Member[] {
  const seen = new Map<string, Member>();
  for (const cube of cubesFrom(meta)) {
    for (const member of membersOf(meta, cube.name)) {
      if (!seen.has(member.name)) seen.set(member.name, member);
    }
  }
  return [...seen.values()];
}

/**
 * The values a list or checkbox filter picks from: the member's own values,
 * asked of Cube as one ungrouped dimension. Capped, because a filter over a
 * member with more values than that wants a search, which the list has.
 */
const OPTION_LIMIT = 1000;

function useOptions(member: string | undefined, needed: boolean) {
  return useQuery({
    queryKey: ['filter-options', member],
    enabled: needed && member !== undefined,
    queryFn: async () => {
      const result = (await loadTile({
        query: { dimensions: [member], limit: OPTION_LIMIT },
      })) as { data?: Record<string, unknown>[] };
      const values = (result.data ?? [])
        .map((row) => row[member ?? ''])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(String);
      return [...new Set(values)];
    },
  });
}

function FilterWidgetFor({
  filter,
  member,
  value,
  onValue,
}: {
  filter: DashboardFilter;
  member: Member;
  value: FilterValue | undefined;
  onValue: (value: FilterValue | undefined) => void;
}) {
  const picksValues = filter.widget === 'list' || filter.widget === 'checkbox';
  const options = useOptions(filter.member, picksValues);
  const props = { label: member.title, value, onChange: onValue };

  switch (filter.widget) {
    case 'dateRange':
      return <DateRange {...props} />;
    case 'range':
      return <NumericRange {...props} />;
    case 'list':
      return <ListSearch {...props} options={options.data ?? []} />;
    case 'checkbox':
      return <CheckboxList {...props} options={options.data ?? []} />;
  }
}

/**
 * Nothing at all for a dashboard with no filters — not even a query for the
 * model, which a dashboard without filters has no use for.
 */
export function FilterBar(props: FilterBarProps) {
  return props.filters.length === 0 ? null : <Filters {...props} />;
}

function Filters({ filters, values, onValue, editing, onFilters }: FilterBarProps) {
  const meta = useQuery(META_QUERY);
  const members = useMemo(() => allMembers(meta.data), [meta.data]);

  return (
    <section aria-label="Filters" className="filter-bar">
      {filters.map((filter) => {
        const member = members.find((candidate) => candidate.name === filter.member);
        const kind = FILTER_WIDGETS.find((entry) => entry.widget === filter.widget);
        // A filter with no field yet has nothing to show a reader.
        if (!editing && member === undefined) return null;

        return (
          <div
            key={filter.id}
            className="filter-bar__filter"
            data-testid={`filter-${filter.id}`}
            data-widget={filter.widget}
          >
            {editing ? (
              <>
                <select
                  aria-label="Filter on"
                  value={filter.member ?? ''}
                  onChange={(event) => {
                    const chosen = event.target.value;
                    onFilters?.(
                      filters.map((each) =>
                        each.id !== filter.id
                          ? each
                          : chosen === ''
                            ? { id: each.id, widget: each.widget }
                            : { ...each, member: chosen },
                      ),
                    );
                    // A value made for another field means nothing on this one.
                    onValue(filter.id, undefined);
                  }}
                >
                  <option value="">{kind?.label ?? 'Filter'}: choose a field…</option>
                  {membersFor(filter.widget, members).map((candidate) => (
                    <option key={candidate.name} value={candidate.name}>
                      {candidate.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Remove filter${member === undefined ? '' : ` ${member.title}`}`}
                  onClick={() => {
                    onFilters?.(filters.filter((each) => each.id !== filter.id));
                    onValue(filter.id, undefined);
                  }}
                >
                  ×
                </button>
              </>
            ) : null}
            {member === undefined ? null : (
              <FilterWidgetFor
                filter={filter}
                member={member}
                value={values[filter.id]}
                onValue={(value) => {
                  onValue(filter.id, value);
                }}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}
