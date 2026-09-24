import type { ChartFilter, ChartSpec, TimeGranularity, WellName } from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { QUERY_GRANULARITY } from '@wechart/core';
import { useId, useState } from 'react';

import { loadTile } from '../query/loadTile';
import { StateLine, StatusIcon } from '../shell/StatusIcon';
import type { Member } from './fields';

/**
 * How many of a member's values a filter pill offers (a decision, T229):
 * the first, in order; a member with more is filtered from the dashboard's
 * own filter bar, which searches.
 */
const VALUE_LIMIT = 500;

/**
 * The wells a chart is built from (AC-026), as the prototype's Data tab has
 * them (AC-216): Metrics, Dimensions and Time, each field in them by its
 * title with a tag for its aggregation or its grain, then Filters and Top N.
 *
 * Two routes in, because the criterion names both: a drag for pointer users,
 * and a "+" picker for everyone. The picker is not a fallback — it is the only
 * route a keyboard or screen reader has, and drag-only would fail AC-176.
 */
export const WELLS: { name: WellName; label: string; accepts: Member['kind'] }[] = [
  { name: 'measures', label: 'Metrics', accepts: 'measure' },
  { name: 'dimensions', label: 'Dimensions', accepts: 'dimension' },
  { name: 'timeDimensions', label: 'Time', accepts: 'timeDimension' },
];

/**
 * The grains a time field's pill offers (AC-216), coarsest last: Cube's own
 * (research/cube/data-apis.md), less the sub-hour ones no chart is read at.
 */
export const PILL_GRAINS: readonly TimeGranularity[] = [
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
];

const GRAIN_LABEL: Record<TimeGranularity, string> = {
  second: 'Second',
  minute: 'Minute',
  hour: 'Hour',
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
  year: 'Year',
};

const KIND_NAME: Record<Member['kind'], string> = {
  measure: 'a measure',
  dimension: 'a dimension',
  timeDimension: 'a time dimension',
  segment: 'a segment',
};

/**
 * AC-027: why a well will not take the field being dragged. Null when it will.
 *
 * The reason names both sides — what the well takes and what this field is —
 * because "not allowed here" leaves the user to guess which of the two is
 * wrong.
 */
export function rejectionReason(
  well: (typeof WELLS)[number],
  dragging: Member | null,
): string | null {
  if (!dragging) return null;
  if (dragging.kind === well.accepts) return null;
  return `${well.label} takes ${KIND_NAME[well.accepts]}; ${dragging.shortTitle} is ${KIND_NAME[dragging.kind]}.`;
}

export interface WellsProps {
  readonly spec: ChartSpec;
  readonly available: readonly Member[];
  readonly onAdd: (well: WellName, member: string) => void;
  readonly onRemove: (well: WellName, member: string) => void;
  /** The field currently being dragged, if any. */
  readonly dragging?: Member | null;
  /** A time field's grain, chosen from its pill (AC-216). */
  readonly onGranularity?: (member: string, grain: TimeGranularity) => void;
  /** The chart's own filters, changed in the Filters well (AC-216). */
  readonly onFilters?: (filters: readonly ChartFilter[]) => void;
  /** How many categories are kept before the rest fold into Other (AC-216, AC-041). */
  readonly topN?: number | undefined;
  readonly onTopN?: (n: number | undefined) => void;
}

export function Wells({
  spec,
  available,
  onAdd,
  onRemove,
  dragging = null,
  onGranularity,
  onFilters,
  topN,
  onTopN,
}: WellsProps) {
  const ids = useId();
  /** A member as a reader knows it: its title from the model (AC-216, AC-220). */
  const titleOf = (name: string) => available.find((member) => member.name === name)?.title ?? name;
  const filters = spec.filters ?? [];
  const filterable = available.filter((member) => member.kind === 'dimension');

  return (
    <div className="wells">
      {WELLS.map((well) => {
        const candidates = available.filter((member) => member.kind === well.accepts);
        const held = spec[well.name];
        const refusal = rejectionReason(well, dragging);
        const legal = dragging !== null && refusal === null;

        return (
          <section
            key={well.name}
            className="well"
            data-testid={`well-${well.name}`}
            data-drop={dragging === null ? undefined : legal ? 'legal' : 'illegal'}
            aria-describedby={refusal ? `well-${well.name}-reason` : undefined}
            onDragOver={(event) => {
              // Preventing default is what marks this a valid drop target, so
              // not preventing it is what refuses the drop (AC-027).
              if (legal) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!legal) return;
              const dropped = event.dataTransfer.getData('text/plain');
              if (dropped) onAdd(well.name, dropped);
            }}
          >
            <h3 id={`well-${well.name}-label`}>{well.label}</h3>

            {refusal ? (
              <p
                className="well__reason"
                id={`well-${well.name}-reason`}
                data-testid={`reason-${well.name}`}
              >
                {/* A refused drop, with its icon (T183, AC-177). */}
                <StatusIcon kind="err" />
                {refusal}
              </p>
            ) : null}

            <ul aria-labelledby={`well-${well.name}-label`} className="well__pills">
              {held.map((member) => {
                const known = available.find((each) => each.name === member);
                const title = titleOf(member);
                const grain = spec.granularities?.[member] ?? QUERY_GRANULARITY;
                // A grain saved finer than the pill offers is still shown as it is.
                const grains = PILL_GRAINS.includes(grain) ? PILL_GRAINS : [grain, ...PILL_GRAINS];
                return (
                  <li key={member} className="pill" data-testid={`in-${well.name}-${member}`}>
                    <span className="pill__title">{title}</span>
                    {well.name === 'timeDimensions' ? (
                      // Its grain, changed right here (AC-216).
                      <select
                        className="pill__grain"
                        aria-label={`Grain of ${title}`}
                        value={grain}
                        onChange={(event) =>
                          onGranularity?.(member, event.target.value as TimeGranularity)
                        }
                      >
                        {grains.map((each) => (
                          <option key={each} value={each}>
                            {GRAIN_LABEL[each]}
                          </option>
                        ))}
                      </select>
                    ) : known?.aggType === undefined ? null : (
                      <span className="pill__tag">{known.aggType}</span>
                    )}
                    <button
                      type="button"
                      className="pill__remove"
                      onClick={() => onRemove(well.name, member)}
                      aria-label={`Remove ${title} from ${well.label}`}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>

            <label htmlFor={`add-${well.name}`} className="visually-hidden">
              Add to {well.label}
            </label>
            <select
              id={`add-${well.name}`}
              data-testid={`add-${well.name}`}
              className="select-sm"
              value=""
              onChange={(event) => {
                if (event.target.value) onAdd(well.name, event.target.value);
              }}
            >
              <option value="">+ Add to {well.label}…</option>
              {candidates
                .filter((member) => !held.includes(member.name))
                .map((member) => (
                  <option key={member.name} value={member.name}>
                    {member.title}
                  </option>
                ))}
            </select>
          </section>
        );
      })}

      {/* The chart's own filters (AC-216), the prototype's Filters well. */}
      <section className="well" data-testid="well-filters" aria-labelledby={`${ids}-filters`}>
        <h3 id={`${ids}-filters`}>Filters</h3>
        <ul aria-labelledby={`${ids}-filters`} className="well__pills">
          {filters.map((filter, index) => (
            <FilterPill
              key={filter.member}
              filter={filter}
              title={titleOf(filter.member)}
              onChange={(next) =>
                onFilters?.(filters.map((each, at) => (at === index ? next : each)))
              }
              onRemove={() => onFilters?.(filters.filter((_, at) => at !== index))}
            />
          ))}
        </ul>
        <label htmlFor={`${ids}-add-filter`} className="visually-hidden">
          Add a filter
        </label>
        <select
          id={`${ids}-add-filter`}
          data-testid="add-filters"
          className="select-sm"
          value=""
          onChange={(event) => {
            const member = event.target.value;
            if (member !== '')
              onFilters?.([...filters, { member, operator: 'equals', values: [] }]);
          }}
        >
          <option value="">+ Add a filter…</option>
          {filterable
            .filter((member) => !filters.some((each) => each.member === member.name))
            .map((member) => (
              <option key={member.name} value={member.name}>
                {member.title}
              </option>
            ))}
        </select>
      </section>

      {/* Top N (+ Other) (AC-216): the rest folded into one Other (AC-041). */}
      <TopN id={`${ids}-top`} topN={topN} onTopN={onTopN} />
    </div>
  );
}

/**
 * Top N (AC-216): typed freely, and set down — one change — on leaving the
 * box or Enter. A whole number of one or more keeps that many; nothing keeps
 * all; anything else puts back what was there.
 */
function TopN({
  id,
  topN,
  onTopN,
}: {
  id: string;
  topN: number | undefined;
  onTopN: ((n: number | undefined) => void) | undefined;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const setDown = () => {
    if (typed === null) return;
    setTyped(null);
    const text = typed.trim();
    if (text === '') {
      if (topN !== undefined) onTopN?.(undefined);
      return;
    }
    if (!/^\d+$/.test(text) || Number(text) < 1) return;
    if (Number(text) !== topN) onTopN?.(Number(text));
  };
  return (
    <div className="field">
      <label htmlFor={id}>Top N (+ Other)</label>
      <input
        id={id}
        className="input-sm"
        inputMode="numeric"
        placeholder="All"
        value={typed ?? (topN === undefined ? '' : String(topN))}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={setDown}
        onKeyDown={(event) => {
          if (event.key === 'Enter') setDown();
        }}
      />
    </div>
  );
}

/**
 * One of the chart's filters (AC-216): its member by title, whether rows are
 * held to its value or kept from it, and the value, from the member's own.
 */
function FilterPill({
  filter,
  title,
  onChange,
  onRemove,
}: {
  filter: ChartFilter;
  title: string;
  onChange: (filter: ChartFilter) => void;
  onRemove: () => void;
}) {
  // The member's values, as Cube has them, in order: what can be chosen,
  // never typed. The first VALUE_LIMIT, and the list says so when there are more.
  const values = useQuery({
    queryKey: ['chart-filter-values', filter.member],
    queryFn: async ({ signal }) => {
      const answer = await loadTile({
        query: {
          dimensions: [filter.member],
          order: { [filter.member]: 'asc' },
          limit: VALUE_LIMIT + 1,
        },
        signal,
      });
      return ((answer as { data?: Record<string, unknown>[] }).data ?? [])
        .map((row) => row[filter.member])
        .filter((value) => value !== null && value !== undefined)
        .map(String);
    },
  });
  const chosen = filter.values[0] ?? '';
  const fetched = values.data ?? [];
  // The value the chart is held to is always among the choices, found or
  // not, so the pill never reads "any value" while the chart is filtered.
  const offered = [
    ...(chosen === '' || fetched.includes(chosen) ? [] : [chosen]),
    ...fetched.slice(0, VALUE_LIMIT),
  ];

  return (
    <li className="pill" data-testid={`in-filters-${filter.member}`}>
      <span className="pill__title">{title}</span>
      <select
        className="pill__grain"
        aria-label={`How ${title} is held`}
        value={filter.operator}
        onChange={(event) =>
          onChange({ ...filter, operator: event.target.value as ChartFilter['operator'] })
        }
      >
        <option value="equals">is</option>
        <option value="notEquals">is not</option>
      </select>
      <select
        className="pill__grain"
        aria-label={`Value of ${title}`}
        value={chosen}
        onChange={(event) =>
          onChange({ ...filter, values: event.target.value === '' ? [] : [event.target.value] })
        }
      >
        <option value="">any value</option>
        {offered.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
        {fetched.length > VALUE_LIMIT ? (
          <option disabled value="…">
            The first {VALUE_LIMIT} values only
          </option>
        ) : null}
      </select>
      {values.isError ? (
        <StateLine kind="err" className="pill__problem">
          {title}’s values could not be read.
        </StateLine>
      ) : null}
      <button
        type="button"
        className="pill__remove"
        onClick={onRemove}
        aria-label={`Remove the filter on ${title}`}
      >
        ×
      </button>
    </li>
  );
}
