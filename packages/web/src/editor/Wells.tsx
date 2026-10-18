import type {
  ChartFilter,
  ChartSpec,
  QuickCalc,
  QuickCalcKind,
  TimeGranularity,
  Undrawn,
  WellName,
} from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { QUERY_GRANULARITY, quickCalcName } from '@wechart/core';
import { Fragment, useId, useRef, useState, type ReactNode } from 'react';

import { useQueryItem } from '../query/item';
import { loadTile } from '../query/loadTile';
import { MenuButton, type MenuItem } from '../shell/MenuButton';
import { StateLine, StatusIcon } from '../shell/StatusIcon';
import { FieldIcon } from './FieldList';
import { fieldMetaOf, type Member } from './fields';
import { PathPicker } from './PathPicker';
import { QuickCalcMenu } from './QuickCalcMenu';
import { overTimeUnavailable, quickCalcUnavailable } from './quickCalcAvailability';
import { TYPE_WELLS, type TypeWellsProps } from './wells/registry';

/**
 * How many of a member's values a filter pill offers (a decision, T229):
 * the first, in order; a member with more is filtered from the dashboard's
 * own filter bar, which searches.
 */
const VALUE_LIMIT = 500;

/** What becomes of the categories past the top N (T390, AC-041): folded, the default, or left out. */
const REST: readonly { value: 'drop' | undefined; label: string }[] = [
  { value: undefined, label: 'Fold into Other (n)' },
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
export const WELLS: {
  name: WellName;
  label: string;
  /** Said after the label, quieter: design 01's "(group by)" (T688, EDI-09). */
  aside?: string;
  accepts: Member['kind'];
  adds: string;
}[] = [
  { name: 'measures', label: 'Metrics', accepts: 'measure', adds: 'metric' },
  {
    name: 'dimensions',
    label: 'Dimensions',
    aside: '(group by)',
    accepts: 'dimension',
    adds: 'dimension',
  },
  { name: 'timeDimensions', label: 'Time', accepts: 'timeDimension', adds: 'time dimension' },
];

/** What the fields' picker says of its keys, as design 01 state A writes it (EDI-11). */
const PICKER_KEYS = '↑ ↓ move · Enter adds · Esc closes';

/**
 * A well's "+" picker, design 01 state A (T688, EDI-11): 264 px, a filter
 * over the fields the well takes, grouped by cube, a joined one "· via join",
 * each with its role chip and its aggregation or type; those already in the
 * chart listed "✓ in chart", not offered again. The APG combobox the cube
 * picker is (`PathPicker`): ↑ ↓, Enter and Esc, as its foot says.
 */
function FieldPicker({
  well,
  label,
  adds,
  testId,
  candidates,
  held,
  joined,
  cubeTitles,
  disabled,
  describedBy,
  onPick,
}: {
  well: string;
  label: string;
  adds: string;
  testId: string;
  candidates: readonly Member[];
  held: readonly string[];
  /** The cubes joined to the chart's own: only theirs are "· via join", never a view's own cubes. */
  joined: readonly string[];
  cubeTitles: Readonly<Record<string, string>>;
  disabled: boolean;
  describedBy: string | undefined;
  onPick: (member: Member) => void;
}) {
  const cubes = [...new Set(candidates.map((member) => member.cube))];
  // Its title, or its name in words, never the identifier (T229's review).
  const titleOfCube = (name: string) =>
    cubeTitles[name] ??
    (name.split('__').pop() ?? name)
      .replace(/_/g, ' ')
      .replace(/^./, (first) => first.toUpperCase());
  return (
    <PathPicker
      label={label}
      empty=""
      searchLabel="Filter fields"
      listLabel="Fields"
      noMatch={(typed) =>
        typed === '' ? 'Nothing to add from this cube.' : `No field matches “${typed}”.`
      }
      groups={cubes.map((name) => ({
        label: titleOfCube(name),
        aside: joined.includes(name) ? '· via join' : undefined,
        rows: candidates
          .filter((member) => member.cube === name)
          .map((member) => ({
            key: member.name,
            value: member.name,
            title: member.title,
            kind: 'cube' as const,
            path: fieldMetaOf(member),
            icon: <FieldIcon member={member} />,
            ...(held.includes(member.name) ? { disabled: true, chip: '✓ in chart' } : {}),
            data: { testid: `pick-${member.name}` },
          })),
      }))}
      value=""
      valueTitle={undefined}
      onChoose={(name) => {
        const member = candidates.find((each) => each.name === name);
        if (member !== undefined) onPick(member);
      }}
      trigger={{
        text: `+ ${adds}`,
        label,
        className: 'addbtn',
        testId,
        disabled,
        describedBy,
      }}
      foot={PICKER_KEYS}
      popClass={`cube-picker__pop--fields field-picker--${well}`}
      popWidth={264}
      // At the well's left edge, as design 01 state A draws it (T688's review).
      anchor=".well"
    />
  );
}

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
  /** Each cube's title, for the fields' picker's groups (T688, EDI-11). */
  readonly cubeTitles?: Readonly<Record<string, string>>;
  /**
   * The cubes joined to the chart's own (T688's review): their groups in the
   * "+" picker are "· via join"; a view's own cubes' are not.
   */
  readonly joined?: readonly string[];
  /**
   * Each dimension's channel as drawn, "X", "Y", "Color" (T688, EDI-09):
   * its pill's tag. None until the chart is drawn.
   */
  readonly channels?: Readonly<Record<string, string>>;
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
  /**
   * Asks for a calculation the menu can't express, on this measure (T383,
   * AC-050). Given, each measure's menu ends with "Request a calculation…".
   */
  readonly onRequest?: ((member: string) => void) | undefined;
  /**
   * Each measure's siblings, the other measures the model declares on its
   * cube over the same `sql` (T689, chart-editor-Q6; `/api/meta/siblings`):
   * the aggregations its tag offers.
   */
  readonly siblings?: Readonly<Record<string, readonly string[]>>;
  /** Another aggregation chosen from a measure's tag: `to` in `from`'s place. */
  readonly onSwap?: ((from: string, to: string) => void) | undefined;
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
  /**
   * The metrics the chosen form leaves undrawn (T510; UX-057, design 01-5;
   * R67): each one's pill says so, and a line under Metrics says why, with
   * the forms that draw them and Remove. None where every metric is drawn.
   */
  readonly undrawn?:
    | {
        readonly metrics: readonly Undrawn[];
        /** The form drawn, by its name: "Bar". */
        readonly drawnAs: string;
        /** Small multiples, a panel per metric, where they can draw them all. */
        readonly onSmallMultiples?: (() => void) | undefined;
        readonly onTable: () => void;
      }
    | undefined;
  /**
   * The well a type chosen from the gallery needs (AC-217, T934): this
   * one's, or one of the type's own, which it is handed.
   */
  readonly highlight?: TypeWellsProps['highlight'];
  /** R81's type's own wells, drawn from its module after Time (T934). */
  readonly typeWells?: Omit<TypeWellsProps, 'highlight'> | undefined;
}

export function Wells({
  spec,
  available,
  cubeTitles = {},
  joined = [],
  channels = {},
  onAdd,
  onRemove,
  dragging = null,
  onGranularity,
  onCalculation,
  onRequest,
  siblings = {},
  onSwap,
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
  undrawn,
  highlight,
  typeWells,
}: WellsProps) {
  const TypeWells = typeWells === undefined ? undefined : TYPE_WELLS[typeWells.chartType];
  const ids = useId();
  const root = useRef<HTMLDivElement>(null);
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
  const sources = new Set(held.map((name) => name.split('.')[0]));
  // A field of a cube the chart holds nothing of — a joined cube's — is
  // named in full: its source isn't evident (AC-220; T688's review).
  const titleOf = (name: string) =>
    (sources.size === 1 && sources.has(name.split('.')[0])
      ? available.find((member) => member.name === name)?.shortTitle
      : undefined) ?? fullTitleOf(name);
  const filters = spec.filters ?? [];
  const filterable = available.filter((member) => member.kind === 'dimension');
  /**
   * Why a quick calculation can't be applied here (AC-049): one over time, on
   * a chart with no time field, names the time fields it could take.
   */
  const timeFields = available
    .filter((member) => member.kind === 'timeDimension')
    .map((member) => titleOf(member.name));
  /** …and one wrong for the measure's type, with why (R46). */
  const whyNotOn = (measure: string) => {
    const known = available.find((member) => member.name === measure);
    const kind = {
      ...(known?.aggType === undefined ? {} : { aggType: known.aggType }),
      ...(known?.cumulative === true ? { cumulative: true } : {}),
    };
    return (calc: QuickCalcKind) =>
      quickCalcUnavailable(calc, spec, timeFields, { measure: kind, titleOf });
  };
  /**
   * The aggregations a measure's tag offers (T689, chart-editor-Q6): itself
   * and its siblings the chart doesn't hold already, each by its aggregation.
   */
  const aggregationsOf = (measure: string) =>
    [measure, ...(siblings[measure] ?? []).filter((other) => !spec.measures.includes(other))]
      .map((name) => available.find((member) => member.name === name))
      .filter((member): member is Member => member?.aggType !== undefined)
      .map((member) => ({
        member: member.name,
        aggregation: member.aggType ?? '',
        title: titleOf(member.name),
        current: member.name === measure,
      }));
  /**
   * Each calculation over time still chosen while the chart can't run it
   * (R45.4): paused, its measure drawn plain, and why.
   */
  const paused = spec.measures.flatMap((measure) => {
    const applied = spec.calculations?.[measure];
    const why =
      applied === undefined
        ? undefined
        : overTimeUnavailable(applied.kind, spec, timeFields, titleOf);
    if (applied === undefined || why === undefined) return [];
    const title = titleOf(measure);
    return [
      {
        measure,
        note: `${quickCalcName(applied)} on ${title} is paused, so ${title} is drawn as it is. ${why}`,
      },
    ];
  });
  /**
   * What the chosen form leaves undrawn (T510; UX-057, design 01-5), said
   * on each pill and in one line under Metrics, never silently missing.
   */
  const notDrawn = new Map((undrawn?.metrics ?? []).map((each) => [each.member, each.reason]));
  const undrawnLine = (() => {
    if (undrawn === undefined || undrawn.metrics.length === 0) return null;
    const names = undrawn.metrics.map((each) => titleOf(each.member));
    const listed =
      names.length === 1
        ? (names[0] ?? '')
        : `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
    const are = names.length === 1 ? 'is' : 'are';
    const drawn = spec.measures.length - undrawn.metrics.length;
    const onScale = undrawn.metrics.every((each) => each.reason === 'scale');
    const first = spec.measures[0] === undefined ? '' : titleOf(spec.measures[0]);
    const lead = onScale
      ? `${undrawn.drawnAs} draws one scale.`
      : `${undrawn.drawnAs} draws ${drawn === 1 ? 'one metric' : `${String(drawn)} metrics`}.`;
    const rest = onScale
      ? ` ${listed} ${are} on another scale than ${first}: in the query and the results, but not on the chart.`
      : ` ${listed} ${are} in the query and the results, but not on the chart.`;
    return (
      <div className="wells__undrawn" data-testid="undrawn-metrics">
        <StatusIcon kind="warn" />
        <div>
          <p className="wells__undrawn-text">
            <b>{lead}</b>
            {rest}
          </p>
          <div className="wells__undrawn-actions">
            {undrawn.onSmallMultiples === undefined ? null : (
              <button type="button" className="btn btn-sm" onClick={undrawn.onSmallMultiples}>
                Small multiples
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={undrawn.onTable}>
              Table
            </button>
            {undrawn.metrics.map((each) => (
              <button
                key={each.member}
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  onRemove('measures', each.member);
                  // Its button goes with it: focus to Metrics' "+" (T510's review).
                  root.current?.querySelector<HTMLElement>('[data-testid="add-measures"]')?.focus();
                }}
              >
                Remove {titleOf(each.member)}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  })();
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

  return (
    <div className="wells" ref={root}>
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
              {well.aside === undefined ? null : (
                <>
                  {' '}
                  <span className="well-field__opt">{well.aside}</span>
                </>
              )}
            </h3>
            <div
              className="well"
              data-testid={`well-${well.name}`}
              data-highlight={highlight === well.name ? 'true' : undefined}
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
                  const off = well.name === 'measures' ? notDrawn.get(member) : undefined;
                  return (
                    <li
                      key={member}
                      className={
                        off === undefined
                          ? pillClass(well.name)
                          : `${pillClass(well.name)} pill--off`
                      }
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
                          whyNot={whyNotOn(member)}
                          onRequest={
                            onRequest === undefined
                              ? undefined
                              : () => {
                                  onRequest(member);
                                }
                          }
                          aggregations={aggregationsOf(member)}
                          onAggregation={
                            onSwap === undefined ? undefined : (to) => onSwap(member, to)
                          }
                          testId={`calcs-${member}`}
                        />
                      ) : well.name === 'dimensions' && channels[member] !== undefined ? (
                        // The channel it is drawn on, "Country Y" (EDI-09).
                        <span className="pill__tag" title={`Drawn on ${channels[member]}`}>
                          {channels[member]}
                        </span>
                      ) : known?.aggType === undefined ? null : (
                        <span className="pill__tag">{known.aggType}</span>
                      )}
                      {/* Not on the chart, and why (T510, design 01-5). */}
                      {off === undefined ? null : (
                        <span className="pill__tag pill__off">
                          {off === 'scale' ? 'not drawn · on another scale' : 'not drawn'}
                        </span>
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
              <FieldPicker
                well={well.name}
                label={`Add to ${well.label}`}
                adds={well.adds}
                testId={`add-${well.name}`}
                candidates={candidates}
                held={held}
                joined={joined}
                cubeTitles={cubeTitles}
                disabled={noSource}
                describedBy={noSource ? noSourceId : undefined}
                onPick={(member) => onAdd(well.name, member.name)}
              />
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
            {well.name === 'measures' ? undrawnLine : null}
            {well.name === 'measures'
              ? paused.map(({ measure, note }) => (
                  // A paused calculation, and what it needs (R45.4).
                  <p key={measure} className="wells__note" data-testid={`calc-paused-${measure}`}>
                    {note}
                  </p>
                ))
              : null}
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
      {TypeWells === undefined || typeWells === undefined ? null : (
        <TypeWells {...typeWells} highlight={highlight} />
      )}

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
          <FieldPicker
            well="filters"
            label="Add a filter"
            adds="filter"
            testId="add-filters"
            candidates={filterable}
            held={filters.map((each) => each.member)}
            joined={joined}
            cubeTitles={cubeTitles}
            disabled={noSource}
            describedBy={noSource ? noSourceId : undefined}
            onPick={(member) =>
              onFilters?.([...filters, { member: member.name, operator: 'equals', values: [] }])
            }
          />
        </div>
      </section>

      {/* Sort by beside Top N (+ Other) (AC-216, AC-044): the rest folded
          into one Other (AC-041). */}
      <div className="wells__options">
        {sort}
        <TopN id={`${ids}-top`} label="Top N" aside="(+ Other)" topN={topN} onTopN={onTopN} />
        {/* What becomes of the rest past the top N (T390, AC-041): only once
            Top N is set, a 28/12 native select in Sort by's row grid, in its
            full words (chart-editor-Q1; T688). */}
        {topN === undefined ? null : (
          <div className="field">
            <label htmlFor={`${ids}-rest`} className="field__label">
              The rest
            </label>
            <select
              id={`${ids}-rest`}
              className="select-sm"
              value={tail ?? 'fold'}
              onChange={(event) => {
                const next = event.target.value === 'drop' ? 'drop' : undefined;
                if (tail !== next) onTail?.(next);
              }}
            >
              {REST.map(({ value, label }) => (
                <option key={label} value={value ?? 'fold'}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}
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
  aside,
  placeholder = 'All',
  topN,
  onTopN,
}: {
  id: string;
  label: string;
  /** Quieter after the label: "(+ Other)" (design 01, EDI-09). */
  aside?: string;
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
      <label htmlFor={id}>
        {label}
        {aside === undefined ? null : (
          <>
            {' '}
            <span className="well-field__opt">{aside}</span>
          </>
        )}
      </label>
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
  // For the chart edited, or the dashboard it is edited on (T340, AC-268).
  const item = useQueryItem();
  const values = useQuery({
    queryKey: ['chart-filter-values', filter.member, item ?? null],
    queryFn: async ({ signal }) => {
      const answer = await loadTile({
        query: {
          dimensions: [filter.member],
          order: { [filter.member]: 'asc' },
          limit: VALUE_LIMIT + 1,
        },
        signal,
        item,
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
