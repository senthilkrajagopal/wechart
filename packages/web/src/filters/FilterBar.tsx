import { useQuery } from '@tanstack/react-query';
import { useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import type { DashboardDocument } from '../dashboard/model/document';
import { cubesFrom, membersOf, type Member } from '../editor/fields';
import { pickerGroupsOf } from '../editor/pathCubes';
import type { PathPickerGroup, PathPickerRow } from '../editor/PathPicker';
import { FOLDERS_QUERY } from '../workspaces/explore/folders';
import { loadTile } from '../query/loadTile';
import { metaQueryOf, useWorkspaceItem } from '../query/meta';
import { SecurityPreview } from '../query/securityPreview';
import { pluralOf, summaryOf } from './describe';
import {
  FILTER_WIDGETS,
  membersFor,
  valueKeyOf,
  type DashboardFilter,
  type FilterValue,
  type FilterValues,
  type FilterWidget,
} from './model';
import { scopeLabel } from './scope';
import { useQueryItem } from '../query/item';
import { CheckboxList } from './widgets/CheckboxList';
import { DateRange } from './widgets/DateRange';
import { ListSearch } from './widgets/ListSearch';
import { NumericRange } from './widgets/NumericRange';

/**
 * The filter bar (F9; direction.md §2: "Horizontal, under the title"). Each
 * filter is a widget on a field. In edit mode a filter pressed is selected,
 * and its field, scope and Remove are in the sidebar's Properties
 * (`FilterSettings`; T468, UX-031).
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
  /**
   * The filter selected while editing, whose field, scope and Remove the
   * sidebar's Properties shows (T468, UX-031); and a press on a filter's pill,
   * which selects it.
   */
  readonly selected?: string | null | undefined;
  readonly onSelect?: ((id: string) => void) | undefined;
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
  /** How many values there are in all, past the limit: Cube's `total` (T893, AC-529). */
  readonly total: number | undefined;
  /** What was searched for, of which `total` counts the matches; '' for none. */
  readonly asked: string;
}

function useOptions(member: Member, search: string, needed: boolean) {
  // Cube matches `contains` only on a string dimension; any other type is
  // searched among the values already here.
  const asked = member.type === 'string' ? search.trim() : '';
  // Under a previewed security context, the values it may see (T172).
  const context = useContext(SecurityPreview);
  // For the dashboard it filters (T340, AC-268).
  const item = useQueryItem();
  return useQuery<Options>({
    queryKey: ['filter-options', member.name, asked, context ?? null, item ?? null],
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
          // How many there are in all, as if there were no limit: the count
          // a list cut short says, and a search's matches (T893, AC-529;
          // research/cube/data-apis.md, `total`).
          total: true,
        },
        // A search overtaken by the next is cancelled on Cube too (AC-011).
        signal,
        ...(context === undefined ? {} : { context }),
        item,
      })) as { data?: Record<string, unknown>[]; total?: unknown };
      const rows = result.data ?? [];
      const values = rows
        .map((row) => row[member.name])
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map(String);
      return {
        values: [...new Set(values)],
        cutShort: rows.length >= OPTION_LIMIT,
        total: typeof result.total === 'number' ? result.total : undefined,
        asked,
      };
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
  // The values unsearched, for how many there are in all: the same query as
  // the list's before a search, so asked of Cube once (T893, AC-529).
  const all = useOptions(member, '', picksValues);
  const props = { label: member.title, value, onChange: onValue };
  const values = {
    options: options.data?.values ?? [],
    cutShort: options.data?.cutShort ?? false,
    total: all.data?.total,
    matches: options.data !== undefined && options.data.asked !== '' ? options.data.total : undefined,
    noun: pluralOf(member.shortTitle),
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

/**
 * What a filter picks its field from, as design 10's grouped picker lists it
 * (T633; AC-329; R64): the cubes on the dashboard's folder path, by folder,
 * nearest first (`pickerGroupsOf`, as the chart editor's, T475). Each cube's
 * fields that fit the widget are rows, by their titles, with the cube and its
 * folder path beside them; the user's workspace copy's marked "Your copy", in
 * the landed cube's place (T718, AC-428). Nothing is hidden (AC-342 retired).
 */
export function useFieldGroups(
  dashboard: DashboardDocument,
  widget: FilterWidget,
): {
  readonly groups: readonly PathPickerGroup[];
  readonly titleOf: (member: string) => string;
} {
  // A workspace dashboard's from its overlay, its target's path after its own (T347).
  const workspace = useWorkspaceItem();
  const meta = useQuery(metaQueryOf(workspace));
  // The folders' own cubes, for a workspace dashboard: its overlay holds its
  // copy in place of the cube it copies (T475's review).
  const published = useQuery({ ...metaQueryOf(undefined), enabled: workspace !== undefined });
  const folders = useQuery({ ...FOLDERS_QUERY, enabled: dashboard.folderId !== undefined });
  const target = workspace?.targetFolderId;
  return useMemo(() => {
    const cubes = cubesFrom(meta.data);
    const groups = pickerGroupsOf(
      cubes,
      dashboard.folderId,
      folders.data ?? [],
      target,
      published.data === undefined ? undefined : cubesFrom(published.data),
    )
      .map((group) => ({
        label: group.label,
        rows: group.rows.flatMap((row): PathPickerRow[] => {
          const kind = row.cube.isView ? ('view' as const) : ('cube' as const);
          // The user's copy's fields marked as theirs, in the landed cube's place (T718, AC-428).
          return membersFor(widget, membersOf(meta.data, row.cube.name)).map((member) => ({
            key: `${row.key}/${member.name}`,
            value: member.name,
            // Its short title ("Name"): its cube is at the right (T742, design-10-Q6).
            title: member.shortTitle,
            // Found by its whole title, its cube's name in it (T742's review).
            searchText: member.title,
            kind,
            path: group.label === undefined ? row.cube.title : `${row.cube.title} · ${group.label}`,
            chip: row.yours === true ? 'Your copy' : undefined,
            data: { member: member.name },
          }));
        }),
      }))
      .filter((group) => group.rows.length > 0);
    /**
     * A field named by its title wherever the model has it, listed or not —
     * one on a cube off the dashboard's path, say (AC-272: never rebound) — and
     * else by its short name in words, never its prefixed name (AC-329;
     * T633's review, as the chart editor's T475).
     */
    const titles = new Map(
      [...allMembers(published.data), ...allMembers(meta.data)].map((member) => [
        member.name,
        member.title,
      ]),
    );
    const titleOf = (member: string) =>
      titles.get(member) ??
      (member.split('__').pop() ?? member)
        .replace(/[._]/g, ' ')
        .replace(/^./, (first) => first.toUpperCase());
    return { groups, titleOf };
  }, [meta.data, published.data, dashboard.folderId, folders.data, target, widget]);
}

/** How a filter is named apart from the rest, by its kind and place: "List with search filter 2". */
export function filterNameOf(filters: readonly DashboardFilter[], id: string): string {
  const index = filters.findIndex((each) => each.id === id);
  const kind = FILTER_WIDGETS.find((entry) => entry.widget === filters[index]?.widget);
  return `${kind?.label ?? 'Filter'} filter ${String(index + 1)}`;
}

function Filters({
  filters,
  dashboard,
  chartTitleOf,
  values,
  onValue,
  editing,
  selected,
  onSelect,
  chips,
}: FilterBarProps) {
  const meta = useQuery(metaQueryOf(useWorkspaceItem()));
  const members = useMemo(() => allMembers(meta.data), [meta.data]);

  /**
   * Which filter's popover is open, holding its value control; `null` is
   * every popover closed. A filter's field, scope and Remove are in the
   * sidebar's Properties while editing (T468, UX-031), not here.
   */
  const [chosenOpen, setChosenOpen] = useState<{ id: string | null }>({ id: null });
  const openId = chosenOpen.id;

  return (
    <section aria-label="Filters" className="filter-bar" tabIndex={-1}>
      {filters.map((filter) => {
        const member = members.find((candidate) => candidate.name === filter.member);
        // A filter with no field yet has nothing to show a reader.
        if (!editing && member === undefined) return null;
        const key = valueKeyOf(filter);
        return (
          <FilterPill
            key={filter.id}
            filter={filter}
            member={member}
            /**
             * Each filter is a group named by its kind and place, so a reader
             * who cannot see the bar can tell one filter from the next.
             */
            name={filterNameOf(filters, filter.id)}
            scope={scopeLabel(filter, dashboard, chartTitleOf)}
            value={values[key]}
            onValue={(next) => {
              onValue(key, next);
            }}
            open={openId === filter.id}
            onOpen={(open) => {
              setChosenOpen({ id: open ? filter.id : null });
            }}
            editing={editing}
            selected={editing && selected === filter.id}
            onSelect={() => {
              onSelect?.(filter.id);
            }}
          />
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

export interface FilterPillProps {
  readonly filter: DashboardFilter;
  /** Its field in the model; none while it has no field, or one the model lacks. */
  readonly member: Member | undefined;
  /** Its group's name: "List with search filter 2" (`filterNameOf`). */
  readonly name: string;
  /** Its scope tag's words (`scopeLabel`, AC-077). */
  readonly scope: string;
  readonly value: FilterValue | undefined;
  /** Its value changed; `undefined` is no filter. */
  readonly onValue: (value: FilterValue | undefined) => void;
  /** Whether its popover is open, and a press asking it opened or closed. */
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly editing?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly onSelect?: (() => void) | undefined;
  /**
   * At 28 px, as a Text tile's Filter control draws it (T892, AC-528;
   * direction.md §7h, "the filter bar's widget at 28 px compact").
   */
  readonly compact?: boolean | undefined;
}

/**
 * One filter's pill, the bar's widget (F9; AC-187): its scope, then the
 * field and what it holds, and its value control in a popover that opens
 * from it. The filter bar draws one per filter, and a Text tile's Filter
 * control draws the same one for its filter (T892, AC-528) — the same value,
 * state and popover, never a copy.
 */
export function FilterPill({
  filter,
  member,
  name,
  scope,
  value,
  onValue,
  open: asked,
  onOpen,
  editing = false,
  selected = false,
  onSelect,
  compact = false,
}: FilterPillProps) {
  const pill = useRef<HTMLDivElement>(null);
  const kind = FILTER_WIDGETS.find((entry) => entry.widget === filter.widget);
  // Only a filter with a field has a value to set.
  const open = asked && member !== undefined;

  // Escape, or a press outside the open pill, closes its popover.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const here = pill.current;
      onOpen(false);
      /**
       * Focus inside goes back to the pill's summary: left where it was, it
       * fell to the page when the popover went (T204's review), as the ⋯
       * menu's does not (`MoveToMenu`).
       */
      if (here?.contains(document.activeElement) === true)
        here.querySelector<HTMLElement>('button[aria-expanded]')?.focus();
    };
    const onPress = (event: PointerEvent) => {
      const here = pill.current;
      if (here !== null && !here.contains(event.target as Node)) onOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open, onOpen]);

  // A control's popover is its own element, apart from the bar's pill of the same filter.
  const own = useId();
  const popover = compact ? `filter-popover-${filter.id}-${own}` : `filter-popover-${filter.id}`;
  // Its field at 400 and what it holds at 600, as design 04 draws a
  // pill (T683; R76 components-Q2). The words read as before.
  const summary = (
    <>
      <span className="filter-pill__label">
        {member === undefined ? (kind?.label ?? 'Filter') : member.title}:
      </span>{' '}
      <span className="filter-pill__value">
        {member === undefined ? 'choose a field…' : summaryOf(filter.widget, value)}
      </span>
    </>
  );

  return (
    /**
     * The prototype's filter pill (AC-187): its scope, then the field
     * and what it holds; its value control in a popover that opens
     * from it.
     */
    <div
      ref={pill}
      role="group"
      aria-label={name}
      className={compact ? 'filter-pill filter-pill--compact' : 'filter-pill'}
      data-testid={compact ? `filter-control-${filter.id}` : `filter-${filter.id}`}
      data-filter-id={filter.id}
      data-widget={filter.widget}
      // Selected while editing, its settings in Properties (T468).
      {...(editing && selected ? { 'data-selected': 'true' } : {})}
      /**
       * Focus moved out of the pill — Tab past the popover's last
       * control — closes it, or focus lands on whatever it lies over
       * (T204's review). Only a move to somewhere else: a click on a
       * control that takes no focus, as a checkbox in Safari does not,
       * has no next element, and must not close it.
       */
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (open && next !== null && !event.currentTarget.contains(next)) onOpen(false);
      }}
    >
      {/* Its scope, on the widget, in either mode (direction.md rule 14):
        cut at its width with an ellipsis, as the summary is, its whole
        text kept and in its tooltip (the user, 2026-10-18). */}
      <span className="filter-pill__scope" data-testid="scope-badge" title={scope}>
        {scope}
      </span>
      <button
        type="button"
        className="filter-pill__summary"
        aria-expanded={open}
        // Only while there is a popover for it to name.
        {...(open ? { 'aria-controls': popover } : {})}
        onClick={() => {
          /**
           * While editing, a press on a filter not yet selected selects
           * it: its field, scope and Remove in Properties, with focus in
           * its field picker (T468, UX-031). Pressed again, selected, it
           * opens its value, as a reader's press does.
           */
          if (editing && !selected) {
            onOpen(false);
            onSelect?.();
            return;
          }
          if (member !== undefined) onOpen(!open);
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
            onValue(undefined);
          }}
        >
          ×
        </button>
      )}
      {/* Its value control alone (T468, UX-031); none until it has a field. */}
      {open && member !== undefined ? (
        <div id={popover} className="filter-popover">
          <FilterWidgetFor filter={filter} member={member} value={value} onValue={onValue} />
        </div>
      ) : null}
    </div>
  );
}
