import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import type { DashboardDocument } from '../dashboard/model/document';
import { cubesFrom, membersOf, type Member } from '../editor/fields';
import { loadTile } from '../query/loadTile';
import { META_QUERY } from '../query/meta';
import {
  FILTER_WIDGETS,
  membersFor,
  valueKeyOf,
  withoutMember,
  type DashboardFilter,
  type FilterValue,
  type FilterValues,
} from './model';
import { scopeLabel } from './scope';
import { ScopeEditor } from './ScopeEditor';
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
  /** The dashboard, whose tabs and tiles a filter's scope names (AC-077). */
  readonly dashboard: DashboardDocument;
  /** A chart's title, which names its tile. */
  readonly chartTitleOf: (chartId: string) => string | undefined;
  /** The values held, by `valueKeyOf` each filter. */
  readonly values: FilterValues;
  /** A filter's value changed; `undefined` is no filter. */
  readonly onValue: (key: string, value: FilterValue | undefined) => void;
  readonly editing: boolean;
  /** Change the filters themselves — their fields, which there are. Edit mode only. */
  readonly onFilters?: ((next: readonly DashboardFilter[]) => void) | undefined;
}

/** Every member of every cube and view, once each. */
export function allMembers(meta: unknown): Member[] {
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
 * asked of Cube as one ungrouped dimension, in order, so which ones arrive
 * under the cap is the same every time.
 */
const OPTION_LIMIT = 1000;

/** How long typing pauses before a search is asked of Cube. */
const SEARCH_PAUSE_MS = 250;

interface Options {
  readonly values: readonly string[];
  /** As many rows came back as were asked for: there are more. */
  readonly cutShort: boolean;
}

function useOptions(member: Member, search: string, needed: boolean) {
  // Cube matches `contains` only on a string dimension; any other type is
  // searched among the values already here.
  const asked = member.type === 'string' ? search.trim() : '';
  return useQuery<Options>({
    queryKey: ['filter-options', member.name, asked],
    enabled: needed,
    // The previous values stay listed while a search is asked.
    placeholderData: (previous) => previous,
    queryFn: async ({ signal }) => {
      const result = (await loadTile({
        query: {
          dimensions: [member.name],
          ...(asked === ''
            ? {}
            : { filters: [{ member: member.name, operator: 'contains', values: [asked] }] }),
          order: { [member.name]: 'asc' },
          limit: OPTION_LIMIT,
        },
        // A search overtaken by the next is cancelled on Cube too (AC-011).
        signal,
      })) as { data?: Record<string, unknown>[] };
      const rows = result.data ?? [];
      const values = rows
        .map((row) => row[member.name])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(String);
      return { values: [...new Set(values)], cutShort: rows.length >= OPTION_LIMIT };
    },
  });
}

/** What was typed, once typing has paused. */
function usePaused(text: string): string {
  const [paused, setPaused] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPaused(text);
    }, SEARCH_PAUSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);
  return paused;
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
  const [search, setSearch] = useState('');
  const options = useOptions(member, usePaused(search), picksValues);
  const props = { label: member.title, value, onChange: onValue };
  const values = {
    options: options.data?.values ?? [],
    cutShort: options.data?.cutShort ?? false,
  };

  switch (filter.widget) {
    case 'dateRange':
      return <DateRange {...props} />;
    case 'range':
      return <NumericRange {...props} />;
    case 'list':
      return <ListSearch {...props} {...values} onSearch={setSearch} />;
    case 'checkbox':
      return <CheckboxList {...props} {...values} />;
  }
}

/**
 * Nothing at all for a dashboard with no filters — not even a query for the
 * model, which a dashboard without filters has no use for.
 */
export function FilterBar(props: FilterBarProps) {
  return props.filters.length === 0 ? null : <Filters {...props} />;
}

function Filters({
  filters,
  dashboard,
  chartTitleOf,
  values,
  onValue,
  editing,
  onFilters,
}: FilterBarProps) {
  const meta = useQuery(META_QUERY);
  const members = useMemo(() => allMembers(meta.data), [meta.data]);

  return (
    <section aria-label="Filters" className="filter-bar">
      {filters.map((filter, index) => {
        const member = members.find((candidate) => candidate.name === filter.member);
        const kind = FILTER_WIDGETS.find((entry) => entry.widget === filter.widget);
        // A filter with no field yet has nothing to show a reader.
        if (!editing && member === undefined) return null;
        /**
         * Each filter is a group named by its kind and place, so a reader who
         * cannot see the bar can tell one "Filter on" menu from the next.
         */
        const name = `${kind?.label ?? 'Filter'} filter ${String(index + 1)}`;
        const key = valueKeyOf(filter);

        return (
          <div
            key={filter.id}
            role="group"
            aria-label={name}
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
                    // The value stays with the field it was chosen on
                    // (`valueKeyOf`), so there is nothing here to clear.
                    onFilters?.(
                      filters.map((each) => {
                        if (each.id !== filter.id) return each;
                        return chosen === '' ? withoutMember(each) : { ...each, member: chosen };
                      }),
                    );
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
                  aria-label={`Remove ${name}`}
                  onClick={() => {
                    onFilters?.(filters.filter((each) => each.id !== filter.id));
                    onValue(key, undefined);
                  }}
                >
                  ×
                </button>
                <ScopeEditor
                  filter={filter}
                  dashboard={dashboard}
                  chartTitleOf={chartTitleOf}
                  onScope={(scope) => {
                    onFilters?.(
                      filters.map((each) => (each.id === filter.id ? { ...each, scope } : each)),
                    );
                  }}
                />
              </>
            ) : null}
            {/* Its scope, on the widget, in either mode (direction.md rule 14). */}
            <span className="filter-bar__scope" data-testid="scope-badge">
              {scopeLabel(filter, dashboard, chartTitleOf)}
            </span>
            {member === undefined ? null : (
              <FilterWidgetFor
                filter={filter}
                member={member}
                value={values[key]}
                onValue={(value) => {
                  onValue(key, value);
                }}
              />
            )}
            {/*
              Clearing puts every tile it reaches back to its unfiltered result
              (AC-080) in one step, whatever the widget — offered only while
              there is something to clear.
            */}
            {member === undefined || values[key] === undefined ? null : (
              <button
                type="button"
                className="filter-bar__clear"
                aria-label={`Clear ${member.title}`}
                onClick={() => {
                  onValue(key, undefined);
                }}
              >
                Clear
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}
