import { useQuery } from '@tanstack/react-query';
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { DashboardDocument } from '../dashboard/model/document';
import { cubesFrom, membersOf, type Member } from '../editor/fields';
import { cubesOnPath } from '../editor/pathCubes';
import { FOLDERS_QUERY } from '../workspaces/explore/folders';
import { loadTile } from '../query/loadTile';
import { META_QUERY } from '../query/meta';
import { SecurityPreview } from '../query/securityPreview';
import { summaryOf } from './describe';
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
  /**
   * The interaction chips, at the end of the bar: the cross-filters in
   * effect (AC-119), or a marking's chips in Markings mode (direction.md §7,
   * "the right-hand group holds the interaction chips").
   */
  readonly chips?: ReactNode | undefined;
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
  // Under a previewed security context, the values it may see (T172).
  const context = useContext(SecurityPreview);
  return useQuery<Options>({
    queryKey: ['filter-options', member.name, asked, context ?? null],
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
        ...(context === undefined ? {} : { context }),
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

/** The dashboard's filter bar: its filters, then the interaction group. */
export function FilterBar(props: FilterBarProps) {
  /**
   * Always a bar (AC-196): the dashboard's filters and the interaction group,
   * which says how to mark or filter while nothing is set. With no filters it
   * is only that group — and asks nothing of the model, which a dashboard
   * without filters has no use for.
   */
  if (props.filters.length > 0) return <Filters {...props} />;
  return (
    // Focusable by script only: where focus goes when a chip it held unmarks
    // itself and goes (T220's review).
    <section aria-label="Filters" className="filter-bar" tabIndex={-1}>
      {props.chips === undefined ? null : (
        <>
          <span className="filter-bar__spacer" />
          {props.chips}
        </>
      )}
    </section>
  );
}

function Filters({
  filters,
  dashboard,
  chartTitleOf,
  values,
  onValue,
  editing,
  onFilters,
  chips,
}: FilterBarProps) {
  const meta = useQuery(META_QUERY);
  const members = useMemo(() => allMembers(meta.data), [meta.data]);
  // What a filter picks from: the members of the cubes on the dashboard's
  // folder path, by cube, each cube with its folder path (T429, AC-329).
  const folders = useQuery({ ...FOLDERS_QUERY, enabled: dashboard.folderId !== undefined });
  const pickable = useMemo(
    () =>
      cubesOnPath(cubesFrom(meta.data), dashboard.folderId, folders.data ?? []).map((cube) => ({
        label: cube.folderPath === undefined ? cube.title : `${cube.title} · ${cube.folderPath}`,
        members: membersOf(meta.data, cube.name),
      })),
    [meta.data, dashboard.folderId, folders.data],
  );

  /**
   * Which filter's popover is open. Unset, the newest filter still without a
   * field is open while editing — it shows nothing until one is chosen; `null`
   * is every popover closed.
   */
  const [chosenOpen, setChosenOpen] = useState<{ id: string | null } | undefined>(undefined);
  // A filter just added opens, ready for its field.
  const ids = filters.map((filter) => filter.id).join(' ');
  const [knownIds, setKnownIds] = useState(ids);
  if (knownIds !== ids) {
    setKnownIds(ids);
    const known = new Set(knownIds.split(' '));
    const added = filters.findLast((filter) => !known.has(filter.id));
    if (editing && added !== undefined) setChosenOpen({ id: added.id });
  }
  const unset = editing ? filters.findLast((filter) => filter.member === undefined)?.id : undefined;
  const openId = chosenOpen === undefined ? (unset ?? null) : chosenOpen.id;
  const bar = useRef<HTMLElement>(null);

  // Escape, or a press outside the open pill, closes its popover.
  useEffect(() => {
    if (openId === null) return undefined;
    const pillOf = () => bar.current?.querySelector(`[data-filter-id="${CSS.escape(openId)}"]`);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const pill = pillOf();
      setChosenOpen({ id: null });
      /**
       * Focus inside goes back to the pill's summary: left where it was, it
       * fell to the page when the popover went (T204's review), as the ⋯
       * menu's does not (`MoveToMenu`).
       */
      if (pill?.contains(document.activeElement) === true)
        pill.querySelector<HTMLElement>('button[aria-expanded]')?.focus();
    };
    const onPress = (event: PointerEvent) => {
      const pill = pillOf();
      if (pill !== null && pill !== undefined && !pill.contains(event.target as Node))
        setChosenOpen({ id: null });
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [openId]);

  return (
    <section aria-label="Filters" className="filter-bar" ref={bar} tabIndex={-1}>
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
        const value = values[key];
        const open = openId === filter.id;
        const popover = `filter-popover-${filter.id}`;
        const summary =
          member === undefined
            ? `${kind?.label ?? 'Filter'}: choose a field…`
            : `${member.title}: ${summaryOf(filter.widget, value)}`;

        return (
          /**
           * The prototype's filter pill (AC-187): its scope, then the field
           * and what it holds; its control, and while editing its settings,
           * in a popover that opens from it.
           */
          <div
            key={filter.id}
            role="group"
            aria-label={name}
            className="filter-pill"
            data-testid={`filter-${filter.id}`}
            data-filter-id={filter.id}
            data-widget={filter.widget}
            /**
             * Focus moved out of the pill — Tab past the popover's last
             * control — closes it, or focus lands on whatever it lies over
             * (T204's review). Only a move to somewhere else: a click on a
             * control that takes no focus, as a checkbox in Safari does not,
             * has no next element, and must not close it.
             */
            onBlur={(event) => {
              const next = event.relatedTarget;
              if (open && next !== null && !event.currentTarget.contains(next))
                setChosenOpen({ id: null });
            }}
          >
            {/* Its scope, on the widget, in either mode (direction.md rule 14). */}
            <span className="filter-pill__scope" data-testid="scope-badge">
              {scopeLabel(filter, dashboard, chartTitleOf)}
            </span>
            <button
              type="button"
              className="filter-pill__summary"
              aria-expanded={open}
              // Only while there is a popover for it to name.
              {...(open ? { 'aria-controls': popover } : {})}
              onClick={() => {
                setChosenOpen({ id: open ? null : filter.id });
              }}
            >
              {summary}
              <span aria-hidden="true" className="filter-pill__caret">
                ▾
              </span>
            </button>
            {/*
              Clearing puts every tile it reaches back to its unfiltered result
              (AC-080) in one step, whatever the widget — offered only while
              there is something to clear.
            */}
            {member === undefined || value === undefined ? null : (
              <button
                type="button"
                className="filter-pill__clear icon-button"
                aria-label={`Clear ${member.title}`}
                title={`Clear ${member.title}`}
                onClick={(event) => {
                  // The × goes with the value; focus stays on the filter
                  // rather than falling to the page (T182, AC-176).
                  event.currentTarget.parentElement
                    ?.querySelector<HTMLElement>('button[aria-expanded]')
                    ?.focus();
                  onValue(key, undefined);
                }}
              >
                ×
              </button>
            )}
            {open ? (
              <div id={popover} className="filter-popover">
                {editing ? (
                  <div className="filter-popover__settings">
                    <select
                      aria-label="Filter on"
                      value={filter.member ?? ''}
                      onChange={(event) => {
                        const chosen = event.target.value;
                        // Kept open on this filter: its control comes next.
                        setChosenOpen({ id: filter.id });
                        // The value stays with the field it was chosen on
                        // (`valueKeyOf`), so there is nothing here to clear.
                        onFilters?.(
                          filters.map((each) => {
                            if (each.id !== filter.id) return each;
                            return chosen === ''
                              ? withoutMember(each)
                              : { ...each, member: chosen };
                          }),
                        );
                      }}
                    >
                      <option value="">{kind?.label ?? 'Filter'}: choose a field…</option>
                      {pickable.map(({ label, members: ofCube }) => {
                        const fitting = membersFor(filter.widget, ofCube);
                        return fitting.length === 0 ? null : (
                          <optgroup key={label} label={label}>
                            {fitting.map((candidate) => (
                              <option key={candidate.name} value={candidate.name}>
                                {candidate.title}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    <ScopeEditor
                      filter={filter}
                      dashboard={dashboard}
                      chartTitleOf={chartTitleOf}
                      onScope={(scope) => {
                        onFilters?.(
                          filters.map((each) =>
                            each.id === filter.id ? { ...each, scope } : each,
                          ),
                        );
                      }}
                    />
                    <button
                      type="button"
                      className="btn-ghost btn-sm filter-popover__remove"
                      aria-label={`Remove ${name}`}
                      onClick={() => {
                        /**
                         * Focus to the next filter, else the one before, once
                         * this one has gone (T182, AC-176): with it goes the
                         * control focus was on.
                         */
                        const neighbour = (filters[index + 1] ?? filters[index - 1])?.id;
                        // The bar's place, which outlives this bar: with its
                        // last filter gone it is drawn by another component.
                        const holder = bar.current?.parentElement ?? null;
                        setChosenOpen({ id: null });
                        onFilters?.(filters.filter((each) => each.id !== filter.id));
                        onValue(key, undefined);
                        requestAnimationFrame(() => {
                          // The last one gone: the bar itself, not the page
                          // (T182's second round).
                          if (neighbour === undefined) {
                            holder?.querySelector<HTMLElement>(':scope > .filter-bar')?.focus();
                            return;
                          }
                          bar.current
                            ?.querySelector<HTMLElement>(
                              `[data-filter-id="${CSS.escape(neighbour)}"] button[aria-expanded]`,
                            )
                            ?.focus();
                        });
                      }}
                    >
                      {/* Its name begins with what it shows (WCAG 2.5.3). */}
                      Remove
                    </button>
                  </div>
                ) : null}
                {member === undefined ? null : (
                  <FilterWidgetFor
                    filter={filter}
                    member={member}
                    value={value}
                    onValue={(next) => {
                      onValue(key, next);
                    }}
                  />
                )}
              </div>
            ) : null}
          </div>
        );
      })}
      {chips === undefined ? null : (
        <>
          {/* Pushes the chips to the end of the bar, as the prototype's own
              spacer does (AC-187). */}
          <span className="filter-bar__spacer" />
          {chips}
        </>
      )}
    </section>
  );
}
