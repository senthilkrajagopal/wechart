import type {
  ChartFilter,
  ChartSpec,
  QuickCalc,
  QuickCalcKind,
  TimeGranularity,
  WellName,
} from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { QUERY_GRANULARITY } from '@wechart/core';
import { Fragment, useId, useState, type ReactNode } from 'react';

import { loadTile } from '../query/loadTile';
import { MenuButton, type MenuItem } from '../shell/MenuButton';
import { StateLine, StatusIcon } from '../shell/StatusIcon';
import { FieldIcon } from './FieldList';
import type { Member } from './fields';
import { QuickCalcMenu } from './QuickCalcMenu';
import { quickCalcUnavailable } from './quickCalcAvailability';

/**
 * How many of a member's values a filter pill offers (a decision, T229):
 * the first, in order; a member with more is filtered from the dashboard's
 * own filter bar, which searches.
 */
const VALUE_LIMIT = 500;

/** What becomes of the categories past the top N (T390, AC-041): folded, the default, or left out. */
const REST: readonly { value: 'drop' | undefined; label: string }[] = [
  { value: undefined, label: 'Fold into “Other (n)”' },
  { value: 'drop', label: 'Leave out' },
];

/**
 * The wells a chart is built from (AC-026), as the prototype's Data tab has
 * them (AC-216): Metrics, Dimensions and Time, each field in them by its
 * title with a tag for its aggregation or its grain, then Filters and Top N.
 *
 * Two routes in, because the criterion names both: a drag for pointer users,
 * and a "+" picker for everyone. The picker is not a fallback — it is the only
 * route a keyboard or screen reader has, and drag-only would fail AC-176.
 */
export const WELLS: { name: WellName; label: string; accepts: Member['kind']; adds: string }[] = [
  { name: 'measures', label: 'Metrics', accepts: 'measure', adds: 'metric' },
  { name: 'dimensions', label: 'Dimensions', accepts: 'dimension', adds: 'dimension' },
  { name: 'timeDimensions', label: 'Time', accepts: 'timeDimension', adds: 'time' },
];

/**
 * A well's "+" (the prototype's `.addbtn` opening its `.picker`, T257): the
 * fields it can still take, each with its role chip, or a line saying there
 * are none — an empty menu would read as a broken one.
 */
function pickerItems(
  candidates: readonly Member[],
  onPick: (member: Member) => void,
): readonly MenuItem[] {
  if (candidates.length === 0)
    return [
      {
        key: 'none',
        label: 'Nothing more to add from this cube',
        disabled: true,
        onSelect: () => undefined,
      },
    ];
  return candidates.map((member) => ({
    key: member.name,
    testId: `pick-${member.name}`,
    label: (
      <>
        <FieldIcon member={member} />
        {member.title}
      </>
    ),
    onSelect: () => onPick(member),
  }));
}

/** A pill's role tint: a measure's orange, or a dimension's blue (the prototype's .pill.measure / .pill.dim). */
const pillClass = (well: WellName) =>
  well === 'measures' ? 'pill pill--measure' : 'pill pill--dimension';

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
  /**
   * A measure's quick calculation, chosen from the menu on its pill (AC-047),
   * or taken off. Given, each measure in Metrics carries the menu.
   */
  readonly onCalculation?: (member: string, calc: QuickCalc | undefined) => void;
  /** The chart's own filters, changed in the Filters well (AC-216). */
  readonly onFilters?: (filters: readonly ChartFilter[]) => void;
  /** How many categories are kept before the rest fold into Other (AC-216, AC-041). */
  readonly topN?: number | undefined;
  readonly onTopN?: (n: number | undefined) => void;
  /** What becomes of the rest past the top N (T390, AC-041): folded into "Other (n)", or dropped. */
  readonly tail?: 'drop' | undefined;
  readonly onTail?: (tail: 'drop' | undefined) => void;
  /** The rows past this are dropped, after sorting (T390, AC-041). */
  readonly rowLimit?: number | undefined;
  readonly onRowLimit?: (n: number | undefined) => void;
  /** Every member's title, of every cube (AC-220): a pill of another cube's member. */
  readonly titles?: Readonly<Record<string, string>>;
  /**
   * The chart's sort, drawn beside Top N under the wells, as the prototype's
   * Data tab has "Sort by" and "Top N (+ Other)" side by side (T257).
   */
  readonly sort?: ReactNode;
  /**
   * A box plot's "Each point is" (T400, AC-314): the field whose every value
   * within a category is one point. Given for a box plot alone.
   */
  readonly eachPointIs?: {
    readonly member: string | undefined;
    readonly onChange: (member: string | undefined) => void;
  };
}

export function Wells({
  spec,
  available,
  onAdd,
  onRemove,
  dragging = null,
  onGranularity,
  onCalculation,
  onFilters,
  topN,
  onTopN,
  tail,
  onTail,
  rowLimit,
  onRowLimit,
  titles = {},
  sort,
  eachPointIs,
}: WellsProps) {
  const ids = useId();
  /**
   * A member as a reader knows it: its title from the model (AC-216, AC-220)
   * — from every cube's, for a chart naming members of more than one.
   */
  const fullTitleOf = (name: string) =>
    available.find((member) => member.name === name)?.title ??
    (Object.hasOwn(titles, name) ? titles[name] : undefined) ??
    name;
  /**
   * Where every member the chart holds is one cube's or view's, its source is
   * evident, and a pill says "Count", not "Orders Count" (T403, AC-220; the
   * UI review's UX-061); over two, each keeps its full title.
   */
  const held = [
    ...WELLS.flatMap((well) => spec[well.name]),
    ...(spec.filters ?? []).map((filter) => filter.member),
    ...(eachPointIs?.member === undefined ? [] : [eachPointIs.member]),
  ];
  const oneSource = new Set(held.map((name) => name.split('.')[0])).size === 1;
  const titleOf = (name: string) =>
    (oneSource ? available.find((member) => member.name === name)?.shortTitle : undefined) ??
    fullTitleOf(name);
  const filters = spec.filters ?? [];
  const filterable = available.filter((member) => member.kind === 'dimension');
  /**
   * Why a quick calculation can't be applied here (AC-049): one over time, on
   * a chart with no time field, names the time fields it could take.
   */
  const timeFields = available
    .filter((member) => member.kind === 'timeDimension')
    .map((member) => titleOf(member.name));
  const whyNot = (kind: QuickCalcKind) => quickCalcUnavailable(kind, spec, timeFields);
  // Any dimension but the category the boxes are drawn by (T400).
  const pointWell =
    eachPointIs === undefined ? null : (
      <EachPointIs
        member={eachPointIs.member}
        onChange={eachPointIs.onChange}
        title={eachPointIs.member === undefined ? '' : titleOf(eachPointIs.member)}
        candidates={available.filter(
          (member) => member.kind === 'dimension' && member.name !== spec.dimensions[0],
        )}
      />
    );
  /**
   * No cube or view chosen yet (T467, UX-063): nothing can be added, so the
   * "+"s are disabled, and one note says what to do first.
   */
  const noSource = spec.cube === '';
  const noSourceId = `${ids}-no-source`;
  const addState = noSource ? { disabled: true, describedBy: noSourceId } : {};

  return (
    <div className="wells">
      {noSource ? (
        <p className="wells__note" id={noSourceId} data-testid="wells-no-source">
          Choose a cube or view first.
        </p>
      ) : null}
      {WELLS.map((well) => {
        const candidates = available.filter((member) => member.kind === well.accepts);
        const held = spec[well.name];
        const refusal = rejectionReason(well, dragging);
        const legal = dragging !== null && refusal === null;

        const section = (
          // The prototype's .field: a 12/600 label over its dashed .well
          // (T257, editor.js 222).
          <section key={well.name} className="well-field">
            <h3 id={`well-${well.name}-label`} className="well-field__label">
              {well.label}
            </h3>
            <div
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
              <ul aria-labelledby={`well-${well.name}-label`} className="well__pills">
                {held.map((member) => {
                  const known = available.find((each) => each.name === member);
                  const title = titleOf(member);
                  const grain = spec.granularities?.[member] ?? QUERY_GRANULARITY;
                  // A grain saved finer than the pill offers is still shown as it is.
                  const grains = PILL_GRAINS.includes(grain)
                    ? PILL_GRAINS
                    : [grain, ...PILL_GRAINS];
                  return (
                    <li
                      key={member}
                      className={pillClass(well.name)}
                      data-testid={`in-${well.name}-${member}`}
                    >
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
                      ) : well.name === 'measures' && onCalculation !== undefined ? (
                        // Its aggregation tag as the menu of quick calculations (AC-047).
                        <QuickCalcMenu
                          title={title}
                          tag={known?.aggType}
                          applied={spec.calculations?.[member]}
                          onApply={(calc) => onCalculation(member, calc)}
                          whyNot={whyNot}
                          testId={`calcs-${member}`}
                        />
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
              {/* The "+" picker (AC-026, rule 11): the keyboard's route in. */}
              <MenuButton
                label={`Add to ${well.label}`}
                className="addbtn"
                align="start"
                testId={`add-${well.name}`}
                {...addState}
                items={pickerItems(
                  candidates.filter((member) => !held.includes(member.name)),
                  (member) => onAdd(well.name, member.name),
                )}
              >
                + {well.adds}
              </MenuButton>
            </div>

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
          </section>
        );
        // A box plot's "Each point is" sits below the value (direction.md §7, Box plot).
        return well.name === 'measures' && pointWell !== null ? (
          <Fragment key={well.name}>
            {section}
            {pointWell}
          </Fragment>
        ) : (
          section
        );
      })}

      {/* The chart's own filters (AC-216), the prototype's Filters well. */}
      <section className="well-field">
        <h3 id={`${ids}-filters`} className="well-field__label">
          Filters
        </h3>
        <div className="well" data-testid="well-filters">
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
          <MenuButton
            label="Add a filter"
            className="addbtn"
            align="start"
            testId="add-filters"
            {...addState}
            items={pickerItems(
              filterable.filter((member) => !filters.some((each) => each.member === member.name)),
              (member) =>
                onFilters?.([...filters, { member: member.name, operator: 'equals', values: [] }]),
            )}
          >
            + filter
          </MenuButton>
        </div>
      </section>

      {/* Sort by beside Top N (+ Other) (AC-216, AC-044): the rest folded
          into one Other (AC-041). */}
      <div className="wells__options">
        {sort}
        <TopN id={`${ids}-top`} label="Top N (+ Other)" topN={topN} onTopN={onTopN} />
        {/* What becomes of the rest, as a segmented control (direction.md
            §8's inspector fields), and a row limit (T390, AC-041). */}
        <div className="field">
          <span id={`${ids}-rest`} className="field__label">
            The rest
          </span>
          <div className="seg" role="group" aria-labelledby={`${ids}-rest`}>
            {REST.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                disabled={topN === undefined}
                aria-pressed={tail === value}
                onClick={() => {
                  if (tail !== value) onTail?.(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <TopN
          id={`${ids}-limit`}
          // Not "Row limit": "rows" reads as a size unit, and no size field
          // may be offered anywhere in the editor (AC-055, rule 36).
          label="Result limit"
          placeholder="None"
          topN={rowLimit}
          onTopN={onRowLimit}
        />
      </div>
    </div>
  );
}

/**
 * A box plot's "Each point is" (T400, AC-314), a well that holds one field: a
 * dimension other than the category, whose every value within a category is
 * one point, Cube computing the measure once for it. Empty, each row is one.
 */
function EachPointIs({
  member,
  title,
  candidates,
  onChange,
}: {
  member: string | undefined;
  title: string;
  candidates: readonly Member[];
  onChange: (member: string | undefined) => void;
}) {
  const label = 'Each point is';
  return (
    <section className="well-field">
      <h3 id="well-eachPointIs-label" className="well-field__label">
        {label}
      </h3>
      <div className="well" data-testid="well-eachPointIs">
        {member === undefined ? (
          <>
            <span className="well__empty">Each row</span>
            <MenuButton
              label={`Choose what ${label.toLowerCase()}`}
              className="addbtn"
              align="start"
              testId="add-eachPointIs"
              items={pickerItems(candidates, (picked) => onChange(picked.name))}
            >
              + dimension
            </MenuButton>
          </>
        ) : (
          <ul aria-labelledby="well-eachPointIs-label" className="well__pills">
            <li className={pillClass('dimensions')} data-testid={`in-eachPointIs-${member}`}>
              <span className="pill__title">{title}</span>
              <button
                type="button"
                className="pill__remove"
                onClick={() => onChange(undefined)}
                aria-label={`Remove ${title} from ${label}`}
              >
                ×
              </button>
            </li>
          </ul>
        )}
      </div>
    </section>
  );
}

/**
 * Top N (AC-216): typed freely, and set down — one change — on leaving the
 * box or Enter. A whole number of one or more keeps that many; nothing keeps
 * all; anything else puts back what was there.
 */
function TopN({
  id,
  label,
  placeholder = 'All',
  topN,
  onTopN,
}: {
  id: string;
  label: string;
  placeholder?: string;
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
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input-sm"
        inputMode="numeric"
        placeholder={placeholder}
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
    <li className="pill pill--dimension" data-testid={`in-filters-${filter.member}`}>
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
