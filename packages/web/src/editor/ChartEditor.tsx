import {
  addToWell,
  chartDocumentOf,
  compile,
  emptySpec,
  isEmpty,
  removeFromWell,
  toCubeQuery,
  toUnderlyingQuery,
  type ChartSpec,
  type SortSettings,
} from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import {
  REQUIREMENTS,
  describeMissing,
  explain,
  recommend,
  type ChartType,
  type Signature,
} from '@wechart/recommender';

import type { AxesSettings, AxisSettings } from '@wechart/charts';

import { AxisPanel } from './AxisPanel';
import { loadTile } from '../query/loadTile';
import { ChartTile } from '../tiles/ChartTile';
import { TileError } from '../tiles/TileError';
import { TileSkeleton } from '../tiles/TileSkeleton';
import { ResultsDrawer, type DrawerView } from './ResultsDrawer';
import { WhyThisChart } from './WhyThisChart';
import {
  FOLLOWING_RECOMMENDATION,
  backToRecommended,
  chooseType,
  effectiveType,
  isManual,
  type ChartTypeState,
} from './chartTypeState';
import { canRedo, canUndo, discard, historyOf, isDirty, push, redo, undo } from './history';
import { FieldList } from './FieldList';
import { Wells } from './Wells';
import { formatsOf, membersOf, type Member } from './fields';

/**
 * The chart editor (AC-025, AC-026).
 *
 * Adding a field to a well re-runs the chart's query. The result is shown as a
 * row count and a preview until the renderer lands (F5); what the criterion
 * asks for is that the result changes, not yet how it is drawn.
 */
/** Every type the recommender knows about, so the override is a real one. */
const ALL_CHART_TYPES = Object.keys(REQUIREMENTS).sort() as ChartType[];

/**
 * The sort choices (AC-044). "Cube's order" is the default and a real choice:
 * Cube was asked for an ordering and returned one, and leaving it is not the
 * same as having none.
 */
const SORT_CHOICES: readonly { value: string; label: string }[] = [
  { value: '', label: "Cube's order" },
  { value: 'value-desc', label: 'Value, high to low' },
  { value: 'value-asc', label: 'Value, low to high' },
  { value: 'label-asc', label: 'Label, A to Z' },
  { value: 'label-desc', label: 'Label, Z to A' },
];

/**
 * The types with cartesian axes to edit. A pie, treemap, KPI, table or pivot
 * has none, and offering settings that cannot apply is worse than offering
 * none — the reader changes something and nothing happens.
 */
const CARTESIAN_TYPES: readonly (ChartType | null)[] = [
  'bar',
  'hbar',
  'groupedBar',
  'stackedBar',
  'line',
  'multiLine',
  'area',
  'stackedArea',
  'scatter',
  'heatmap',
  'combo',
];

/**
 * Everything a change can touch, in one place. AC-035 asks that *every* change
 * is undoable, so the undoable state is one value rather than several pieces
 * that each would have to remember to record themselves.
 */
interface EditorState {
  readonly cubeName: string;
  readonly spec: ChartSpec;
  readonly chartType: ChartTypeState;
  /**
   * How this chart is drawn, over and above its fields — axis settings today
   * (AC-040). Part of the undoable state, because AC-035 asks that *every*
   * change is undoable and an axis edit is a change like any other.
   */
  readonly options: Record<string, unknown>;
}

const OPENED_WITH: EditorState = {
  cubeName: '',
  spec: emptySpec(),
  chartType: FOLLOWING_RECOMMENDATION,
  options: {},
};

export function ChartEditor() {
  const [history, setHistory] = useState(() => historyOf(OPENED_WITH));
  const { cubeName, spec, chartType: chartTypeState, options } = history.present;

  /** Records the change, which is what makes it undoable. */
  const change = (next: (current: EditorState) => EditorState) =>
    setHistory((current) => push(current, next(current.present)));

  const setSpec = (next: (current: ChartSpec) => ChartSpec) =>
    change((current) => ({ ...current, spec: next(current.spec) }));

  const setChartTypeState = (next: ChartTypeState) =>
    change((current) => ({ ...current, chartType: next }));

  /**
   * Not part of the history: a drag in progress is a pointer position, not a
   * change to the chart, and undo should not step back through one.
   */
  const [dragging, setDragging] = useState<Member | null>(null);

  const meta = useQuery({
    queryKey: ['meta'],
    queryFn: async () => {
      const response = await fetch('/api/meta');
      if (!response.ok) throw new Error(`Could not load the model: ${String(response.status)}`);
      return (await response.json()) as unknown;
    },
  });

  const available = useMemo(
    () => (cubeName ? membersOf(meta.data, cubeName) : []),
    [meta.data, cubeName],
  );

  /**
   * What each member declares in the model (AC-046). Read from the metadata
   * rather than chosen per chart, so a currency measure reads as money on the
   * axis, in the tooltip and in the table without anyone setting it.
   */
  const formats = useMemo(() => formatsOf(meta.data), [meta.data]);

  const query = useMemo(() => toCubeQuery(spec), [spec]);

  /**
   * The rows beneath the aggregate (AC-036): the chart's own query, ungrouped.
   * Derived from the same spec as `query`, so the two cannot name different
   * members — showing "data from a different query than the chart rendered" is
   * the criterion's own failing state.
   */
  const underlyingQuery = useMemo(() => toUnderlyingQuery(spec), [spec]);

  /**
   * The unsaved chart, in the shape a saved one has. Going spec → document →
   * `RenderSpec` rather than straight to a render spec means the preview is
   * drawn by exactly the path a saved chart will be, so the two cannot drift
   * apart (AC-037).
   */
  const previewDocument = useMemo(
    () => chartDocumentOf({ title: '', spec, options }),
    [spec, options],
  );

  /**
   * The sort, as one control rather than a pair. "By value, descending" is one
   * decision to a reader, and splitting it into two selects would let them
   * build states like "by label, but which direction?" a step at a time.
   */
  const sort = options['sort'] as SortSettings | undefined;
  const sortValue = sort === undefined ? '' : `${sort.by}-${sort.direction}`;
  const setSort = (value: string) => {
    const [by, direction] = value.split('-');
    change((current) => {
      const next = { ...current.options };
      if (by === undefined || direction === undefined || value === '') delete next['sort'];
      else next['sort'] = { by, direction };
      return { ...current, options: next };
    });
  };

  /** The axis settings, sparse: absent means "leave it to the data". */
  const axes = (options['axes'] ?? {}) as AxesSettings;
  const setAxis = (axis: 'x' | 'y', next: AxisSettings) => {
    change((current) => ({
      ...current,
      options: { ...current.options, axes: { ...axes, [axis]: next } },
    }));
  };

  /**
   * Which drawer view is open. Not part of the history — opening a drawer is
   * not a change to the chart — and not inside the drawer either, because the
   * drawer unmounts whenever the chart has no fields; state held there would
   * be lost every time the user emptied a well or switched cube.
   */
  const [drawer, setDrawer] = useState<{ open: boolean; view: DrawerView }>({
    open: false,
    view: 'result',
  });

  /**
   * Whether the tile is showing its table. Here rather than in the tile for
   * the same reason as the drawer: the tile unmounts on every re-query, and a
   * reader who switched to the table should not be switched back by adding a
   * field. Not undoable — looking at a chart differently is not a change to it.
   */
  const [tableView, setTableView] = useState(false);

  /**
   * Keyed by the query, so adding a field re-runs it: the key changes, the
   * previous request is abandoned and its Cube-side query cancelled (AC-011),
   * and the tile shows the new result rather than the old one.
   */
  const result = useQuery({
    queryKey: ['editor-preview', query],
    queryFn: ({ signal }) => loadTile({ query, signal }),
    enabled: !isEmpty(spec),
  });

  // Memoised: a fresh array each render would defeat every memo below it, so
  // the signature — and with it the recommendation — would be recomputed on
  // every keystroke.
  const rows = useMemo(
    () =>
      ((result.data as { data?: unknown[] } | undefined)?.data ?? []) as Record<string, unknown>[],
    [result.data],
  );

  /**
   * Cardinalities come from the rows the query actually returned, not from a
   * separate count. What decides whether a chart reads is how many values are
   * *in this result*, and it costs nothing extra (AC-028).
   */
  const signature: Signature = useMemo(() => {
    const distinct = (member: string) => new Set(rows.map((row) => String(row[member] ?? ''))).size;

    return {
      fields: [
        ...spec.measures.map((name) => ({ name, kind: 'measure' as const })),
        ...spec.dimensions.map((name) => ({
          name,
          kind: 'dimension' as const,
          ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
        })),
        ...spec.timeDimensions.map((name) => ({
          name,
          kind: 'timeDimension' as const,
          ...(rows.length > 0 ? { cardinality: distinct(name) } : {}),
        })),
      ],
      rowCount: rows.length,
    };
  }, [spec, rows]);

  const recommendation = useMemo(() => recommend(signature), [signature]);
  const explanation = useMemo(() => explain(signature), [signature]);

  /**
   * AC-032: a manual choice survives field changes. Nothing here resets it on
   * a spec change — only "Back to recommended" does.
   */
  const recommended = recommendation.top?.candidate.chartType ?? null;
  const shownType = effectiveType(chartTypeState, recommended);
  const alternatives = [
    ...(recommendation.top ? [recommendation.top] : []),
    ...recommendation.runnersUp,
  ];

  /**
   * AC-033: when the chosen type cannot be drawn from these fields, say what is
   * missing and where — rather than rendering empty axes and leaving the user
   * to work out which of three wells wants what.
   */
  const missing = shownType
    ? describeMissing(shownType, {
        measures: spec.measures.length,
        dimensions: spec.dimensions.length,
        timeDimensions: spec.timeDimensions.length,
      })
    : [];

  return (
    <div className="chart-editor">
      <div className="editor-bar" data-testid="editor-bar">
        <button
          type="button"
          data-testid="undo"
          disabled={!canUndo(history)}
          onClick={() => setHistory(undo)}
        >
          Undo
        </button>
        <button
          type="button"
          data-testid="redo"
          disabled={!canRedo(history)}
          onClick={() => setHistory(redo)}
        >
          Redo
        </button>
        <button
          type="button"
          data-testid="discard"
          disabled={!isDirty(history)}
          onClick={() => setHistory(discard)}
        >
          Discard changes
        </button>
      </div>

      <div className="chart-editor__fields">
        <FieldList
          cubeName={cubeName}
          onDragStateChange={setDragging}
          onCubeChange={(next) =>
            // Members belong to a cube; keeping them across a change would
            // build a query naming fields the new cube does not have.
            change((current) => ({ ...current, cubeName: next, spec: emptySpec(next) }))
          }
        />
      </div>

      <div className="chart-editor__wells">
        <Wells
          spec={spec}
          available={available}
          dragging={dragging}
          onAdd={(well, member) => setSpec((current) => addToWell(current, well, member))}
          onRemove={(well, member) => setSpec((current) => removeFromWell(current, well, member))}
        />
      </div>

      <section className="chart-editor__result" data-testid="editor-result">
        <h3>Chart</h3>
        {recommendation.top ? (
          <div data-testid="recommendation">
            <p data-testid="chart-type">{shownType}</p>
            <p data-testid="recommended-type">{recommended}</p>
            <p data-testid="recommended-reason">{recommendation.top.reason}</p>

            <h4>Or</h4>
            <ul>
              {recommendation.runnersUp.map((runnerUp) => (
                <li
                  key={runnerUp.candidate.chartType}
                  data-testid={`runner-up-${runnerUp.candidate.chartType}`}
                >
                  {runnerUp.candidate.chartType} — {runnerUp.reason}
                </li>
              ))}
            </ul>

            {missing.length > 0 ? (
              <div role="status" data-testid="missing-fields">
                <p>
                  <span data-icon="incomplete" aria-hidden="true">
                    ⚠
                  </span>{' '}
                  This chart cannot be drawn yet.
                </p>
                <ul>
                  {missing.map((sentence) => (
                    <li key={sentence}>{sentence}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <label htmlFor="chart-type-picker">Chart type</label>
            <select
              id="chart-type-picker"
              value={shownType ?? ''}
              onChange={(event) =>
                setChartTypeState(chooseType(event.target.value as typeof shownType & string))
              }
            >
              {/* Every type, not only the recommended ones: an override
                  limited to the runners-up is barely an override, and a type
                  the fields cannot yet produce is answered by the message
                  above rather than by hiding it (AC-033). */}
              {ALL_CHART_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                  {alternatives.some((alternative) => alternative.candidate.chartType === option)
                    ? ' (suggested)'
                    : ''}
                </option>
              ))}
            </select>

            {isManual(chartTypeState) ? (
              <button
                type="button"
                data-testid="back-to-recommended"
                onClick={() => setChartTypeState(backToRecommended())}
              >
                Back to recommended
              </button>
            ) : null}

            <WhyThisChart explanation={explanation} />

            {/*
              Sorting (AC-044). "Cube's order" is the default and is not the
              same as any of the others: Cube was asked for an ordering and
              returned one, and leaving it alone is a real choice rather than
              the absence of one.
            */}
            <label htmlFor="chart-sort">Sort</label>
            <select
              id="chart-sort"
              value={sortValue}
              onChange={(event) => {
                setSort(event.target.value);
              }}
            >
              {SORT_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>

            {/*
              The inspector's Axes section (AC-040, direction.md §6). Only for
              the types that have cartesian axes: a pie or a KPI has none, and
              offering settings that cannot apply is worse than offering none.
            */}
            {CARTESIAN_TYPES.includes(shownType) ? (
              <div data-testid="axes-section">
                <AxisPanel
                  axis="x"
                  label="X axis"
                  settings={axes.x ?? {}}
                  onChange={(next) => {
                    setAxis('x', next);
                  }}
                />
                <AxisPanel
                  axis="y"
                  label="Y axis"
                  settings={axes.y ?? {}}
                  onChange={(next) => {
                    setAxis('y', next);
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <h3>Result</h3>
        {isEmpty(spec) ? (
          <p data-testid="result-empty">Add a field to see data.</p>
        ) : result.isPending ? (
          // A skeleton in the shape of the chart, not a spinner (AC-042): a
          // spinner says something is happening, a skeleton says something is
          // happening *here* and will look like this.
          <div data-testid="result-loading">
            <TileSkeleton chartType={shownType ?? 'bar'} />
          </div>
        ) : result.isError ? (
          // Cube's own message, with Retry and the query behind a disclosure
          // (AC-012, AC-042).
          <TileError
            error={result.error}
            onRetry={() => {
              void result.refetch();
            }}
          />
        ) : (
          <>
            <p data-testid="result-row-count">{rows.length} rows</p>
            <pre data-testid="result-first-row">{JSON.stringify(rows[0] ?? null)}</pre>
            {shownType === null || missing.length > 0 ? null : (
              // Only once the fields can actually produce the chosen type.
              // Drawing anyway would put a chart on screen that contradicts
              // the message AC-033 has just shown beside it.
              <ChartTile
                spec={compile(previewDocument, { rows, chartType: shownType, formats })}
                // Held here, not in the tile: the tile unmounts whenever the
                // query re-runs, so a field change would flip the reader back
                // from the table to the chart (AC-178).
                tableView={tableView}
                onTableViewChange={setTableView}
              />
            )}
          </>
        )}

        {/*
          Outside the loading and error branches on purpose: rendered inside
          them, the drawer unmounts whenever the query re-runs and reopens
          closed, so changing a field would shut a drawer the user had opened.
          It shows the rows the chart rendered, passed in rather than
          re-fetched, so the two cannot disagree (AC-036).
        */}
        {isEmpty(spec) ? null : (
          <ResultsDrawer
            rows={rows}
            query={query}
            underlyingQuery={underlyingQuery}
            open={drawer.open}
            view={drawer.view}
            onOpenChange={(open) => setDrawer((current) => ({ ...current, open }))}
            onViewChange={(view) => setDrawer((current) => ({ ...current, view }))}
          />
        )}
      </section>
    </div>
  );
}
