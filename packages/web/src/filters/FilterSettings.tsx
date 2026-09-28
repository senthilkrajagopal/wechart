import { useEffect, useRef } from 'react';

import type { DashboardDocument } from '../dashboard/model/document';
import { filterNameOf, usePickableFields } from './FilterBar';
import {
  FILTER_WIDGETS,
  membersFor,
  valueKeyOf,
  withoutMember,
  type DashboardFilter,
  type FilterValue,
} from './model';
import { ScopeEditor } from './ScopeEditor';

/**
 * A selected filter's settings, in the edit sidebar's Properties (T468,
 * UX-031; the user's answer, 2026-09-28): the field it filters on, where it
 * applies (AC-077), and Remove. Its value is set on its pill in the filter
 * bar, as a reader sets it.
 */
export interface FilterSettingsProps {
  readonly filter: DashboardFilter;
  /** Every filter of the dashboard, which a change is written into. */
  readonly filters: readonly DashboardFilter[];
  readonly dashboard: DashboardDocument;
  readonly chartTitleOf: (chartId: string) => string | undefined;
  readonly onFilters: (next: readonly DashboardFilter[]) => void;
  readonly onValue: (key: string, value: FilterValue | undefined) => void;
  /**
   * Focus asked for in the field picker — the filter just added, say — once:
   * `onFieldFocused` says it is done, and the owner stops asking. Selecting
   * another filter moves nothing by itself.
   */
  readonly focusField?: boolean;
  readonly onFieldFocused?: () => void;
  /** After Remove: where focus goes, the filter being gone. */
  readonly onRemoved?: (neighbour: string | undefined) => void;
}

export function FilterSettings({
  filter,
  filters,
  dashboard,
  chartTitleOf,
  onFilters,
  onValue,
  focusField = false,
  onFieldFocused,
  onRemoved,
}: FilterSettingsProps) {
  const pickable = usePickableFields(dashboard);
  const field = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!focusField) return;
    field.current?.focus();
    onFieldFocused?.();
  }, [focusField, onFieldFocused]);
  /**
   * Escape, from any of its controls, goes back to its pill, still selected,
   * where a second press opens its value (T468's review): the keyboard's way
   * from its settings to its value, the sidebar being after the canvas in Tab
   * order.
   */
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = box.current;
    if (section === null) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      globalThis.document
        .querySelector<HTMLElement>(
          `section.filter-bar [data-filter-id="${CSS.escape(filter.id)}"] button[aria-expanded]`,
        )
        ?.focus();
    };
    section.addEventListener('keydown', onKey);
    return () => {
      section.removeEventListener('keydown', onKey);
    };
  }, [filter.id]);

  const name = filterNameOf(filters, filter.id);
  const kind = FILTER_WIDGETS.find((entry) => entry.widget === filter.widget);
  const index = filters.findIndex((each) => each.id === filter.id);

  return (
    <section ref={box} className="panel-section filter-settings" aria-label={name}>
      <h3>{name}</h3>
      <label className="filter-settings__label" htmlFor={`filter-on-${filter.id}`}>
        Filter on
      </label>
      <select
        ref={field}
        id={`filter-on-${filter.id}`}
        className="select-sm"
        value={filter.member ?? ''}
        onChange={(event) => {
          const chosen = event.target.value;
          // The value stays with the field it was chosen on (`valueKeyOf`),
          // so there is nothing here to clear.
          onFilters(
            filters.map((each) => {
              if (each.id !== filter.id) return each;
              return chosen === '' ? withoutMember(each) : { ...each, member: chosen };
            }),
          );
        }}
      >
        <option value="">{kind?.label ?? 'Filter'}: choose a field…</option>
        {pickable.map(({ label, members }) => {
          const fitting = membersFor(filter.widget, members);
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
      {/* Seen; heard from the select's own name. */}
      <span className="filter-settings__label" aria-hidden="true">
        Applies to
      </span>
      <ScopeEditor
        filter={filter}
        dashboard={dashboard}
        chartTitleOf={chartTitleOf}
        onScope={(scope) => {
          onFilters(filters.map((each) => (each.id === filter.id ? { ...each, scope } : each)));
        }}
      />
      <button
        type="button"
        className="btn-ghost btn-sm filter-settings__remove"
        aria-label={`Remove ${name}`}
        onClick={() => {
          // The next filter, else the one before, for focus once this is gone (T182, AC-176).
          const neighbour = (filters[index + 1] ?? filters[index - 1])?.id;
          onFilters(filters.filter((each) => each.id !== filter.id));
          onValue(valueKeyOf(filter), undefined);
          onRemoved?.(neighbour);
        }}
      >
        {/* Its name begins with what it shows (WCAG 2.5.3). */}
        Remove
      </button>
    </section>
  );
}
