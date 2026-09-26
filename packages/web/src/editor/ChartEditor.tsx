import {
  addToWell,
  CHART_TYPE_NAMES,
  chartDocumentOf,
  compile,
  emptySpec,
  isEmpty,
  removeFromWell,
  granularitiesOf,
  seriesOf,
  toCubeQuery,
  toUnderlyingQuery,
  wellFor,
  type ChartSpec,
  type SortSettings,
} from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  describeMissing,
  explain,
  recommend,
  warningsFor,
  type ChartType,
  type Signature,
} from '@wechart/recommender';

import { DEFAULT_PALETTE, STACKABLE_TYPES } from '@wechart/charts';

import { ChartTypeCard } from './ChartTypeCard';
import { ChartTypeGallery } from './ChartTypeGallery';
import { CustomizeTab } from './CustomizeTab';
import { answerMetaOf } from '../query/answerMeta';
import { loadTile } from '../query/loadTile';
import { AccelerationBadge, accelerationOf } from '../tiles/AccelerationBadge';
import { ChartTile } from '../tiles/ChartTile';
import { RollupOnlyWarning } from './RollupOnlyWarning';
import { TileError } from '../tiles/TileError';
import { TileSkeleton } from '../tiles/TileSkeleton';
import { ResultsDrawer, type DrawerView } from './ResultsDrawer';
import { WhyThisChart } from './WhyThisChart';
import {
  backToRecommended,
  chooseType,
  effectiveType,
  isManual,
  type ChartTypeState,
} from './chartTypeState';
import { OPENED_WITH, type EditorState } from './openChart';
import { PreviewFrame, type TileSize } from './PreviewFrame';
import { META_QUERY } from '../query/meta';
import { signatureOf, topTypeOf } from '../query/signature';
import { canRedo, canUndo, discard, historyOf, isDirty, push, redo, undo } from './history';
import { FieldList } from './FieldList';
import { Wells } from './Wells';
import { cubesFrom, formatsOf, membersOf, shortTitlesOf, titlesOf, type Member } from './fields';

/**
 * The chart editor (AC-025, AC-026).
 *
 * Adding a field to a well re-runs the chart's query. The result is shown as a
 * row count and a preview until the renderer lands (F5); what the criterion
 * asks for is that the result changes, not yet how it is drawn.
 */
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
 * The types whose series the Customize tab lists, to colour and hide
 * (AC-219): those drawing a series per measure or per split — not a pie's or a
 * treemap's slices, nor a heatmap's scale.
 */
const SERIES_TYPES: readonly (ChartType | null)[] = [
  'bar',
  'hbar',
  'groupedBar',
  'stackedBar',
  'line',
  'multiLine',
  'area',
  'stackedArea',
  'scatter',
  'combo',
];

/**
 * The types with no marks for a legend or a label: the Customize tab offers
 * neither. A box plot has one series and a box per category, with nothing a
 * label could say that its tooltip doesn't (T399's review).
 */
const UNDRAWN_TYPES: readonly (ChartType | null)[] = [
  'kpi',
  'table',
  'pivot',
  'trellis',
  'boxplot',
  null,
];

export interface ChartEditorProps {
  /**
   * The state the editor opens with: a saved chart's, via `editorStateOf`, or
   * `OPENED_WITH` for a chart with nothing in it yet (AC-182).
   *
   * Read once, on mount, because it seeds the undo history — and that is the
   * point. AC-035's Discard "restores the chart as it was", and *as it was* is
   * this state. Seeding the history with `OPENED_WITH` regardless would make
   * Discard wipe a saved chart back to blank. A caller that opens a different
   * chart must remount the editor (key it by chart id) rather than pass a new
   * `initial`, which would otherwise be ignored.
   */
  readonly initial?: EditorState;
  /**
   * The tile the editor was opened from, measured as the dashboard draws it —
   * which offers an Actual size / Fit preview (T032, AC-034). Absent when the
   * editor is opened on its own.
   */
  readonly tile?: TileSize | undefined;
  /**
   * The editor's state after every change, and once on opening. For a caller
   * that applies the edit elsewhere — the overlay, which holds it as a draft
   * on the dashboard when the user goes back (T032).
   */
  readonly onChange?: ((state: EditorState) => void) | undefined;
  /**
   * What whoever opened the editor puts in its header row (AC-214): at its
   * start, a way back; beside the title, whether the chart is local or
   * shared; at its end, the save action and anything said about it.
   */
  readonly head?: {
    readonly start?: ReactNode;
    readonly badges?: ReactNode;
    readonly end?: ReactNode;
  };
  /**
   * A change is being applied elsewhere: the panes take no input meanwhile,
   * while the header — what says so, and the way out — stays live.
   */
  readonly busy?: boolean;
  /**
   * The folder the chart is kept in (a local chart's, its dashboard's): the
   * picker offers the cubes on its path (T429, AC-329).
   */
  readonly folderId?: string | undefined;
}

/** The inspector's tabs (AC-214, the prototype's Data and Customize). */
const INSPECTOR_TABS = [
  ['data', 'Data'],
  ['customize', 'Customize'],
] as const;
type InspectorTab = (typeof INSPECTOR_TABS)[number][0];

export function ChartEditor({
  initial = OPENED_WITH,
  tile,
  onChange,
  head,
  busy = false,
  folderId,
}: ChartEditorProps = {}) {
  const [history, setHistory] = useState(() => historyOf(initial));
  const { cubeName, spec, chartType: chartTypeState, options, title } = history.present;
  /** The title as being typed, until it is set down (null: not being typed). */
  const [typedTitle, setTypedTitle] = useState<string | null>(null);
  const commitTitle = () => {
    if (typedTitle === null) return;
    const typed = typedTitle;
    setTypedTitle(null);
    if (typed !== (title ?? '')) change((current) => ({ ...current, title: typed }));
  };
  /** Which of the inspector's tabs is open: looking, not a change to the chart. */
  const [inspector, setInspector] = useState<InspectorTab>('data');
  const inspectorId = useId();
  const inspectorTabs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * The chart as it reads now: its history's present, with a title still
   * being typed (T255). Reported as that, so a save pressed while the title
   * field has the focus sends what the field shows — it sent the title from
   * before the typing, the blur's commit arriving after the save had read the
   * state (recheck-chart-editor N1). The typing is still one undo step, taken
   * when it is set down.
   */
  const live = useMemo(
    () => (typedTitle === null ? history.present : { ...history.present, title: typedTitle }),
    [history.present, typedTitle],
  );
  useEffect(() => {
    onChange?.(live);
  }, [live, onChange]);

  /** Records the change, which is what makes it undoable. */
  const change = (next: (current: EditorState) => EditorState) =>
    setHistory((current) => push(current, next(current.present)));

  const setSpec = (next: (current: ChartSpec) => ChartSpec) =>
    change((current) => ({ ...current, spec: next(current.spec) }));

  // A choice that changes nothing — Auto while following, the type already
  // chosen — is no undo step (T230's review).
  const setChartTypeState = (next: ChartTypeState) => {
    if (next.manual === chartTypeState.manual) return;
    change((current) => ({ ...current, chartType: next }));
  };

  /**
   * Not part of the history: a drag in progress is a pointer position, not a
   * change to the chart, and undo should not step back through one.
   */
  const [dragging, setDragging] = useState<Member | null>(null);

  // Shared with the dashboard, which takes its number formats from it (AC-046).
  const meta = useQuery(META_QUERY);

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
  /**
   * Each member's title (AC-220), so the preview's legend and tooltips, the
   * results' headers and the trace name members as the model does.
   */
  const titles = useMemo(() => titlesOf(meta.data), [meta.data]);
  /** And its short title, for a one-source chart's legend and KPI (T403). */
  const shortTitles = useMemo(() => shortTitlesOf(meta.data), [meta.data]);

  /**
   * A chosen type that asks Cube differently is part of the query: a box plot
   * wants its rows ungrouped (T399). Only a manual choice can be one — the
   * recommender, which reads the rows, never proposes it — so this can't loop.
   */
  const query = useMemo(
    () =>
      toCubeQuery(chartTypeState.manual === 'boxplot' ? { ...spec, chartType: 'boxplot' } : spec),
    [spec, chartTypeState.manual],
  );

  /** The members the chart uses, marked in the field list (AC-215). */
  const used = useMemo<ReadonlySet<string>>(
    () =>
      new Set([
        ...spec.measures,
        ...spec.dimensions,
        ...spec.timeDimensions,
        ...(spec.filters ?? []).map((filter) => filter.member),
        // A box plot's "Each point is" (T400), while it is a box plot.
        ...(chartTypeState.manual === 'boxplot' && spec.eachPointIs !== undefined
          ? [spec.eachPointIs]
          : []),
      ]),
    [spec, chartTypeState.manual],
  );

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

  /**
   * The Customize tab's settings (AC-219), each a key of the options set or
   * cleared — cleared is absent, so the saved options stay sparse — as one
   * undoable change (AC-035).
   */
  const setOptions = (patch: Readonly<Record<string, unknown>>) => {
    change((current) => {
      const next: Record<string, unknown> = { ...current.options, ...patch };
      for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
      return { ...current, options: next };
    });
  };

  /**
   * Which drawer view is open. Not part of the history — opening a drawer is
   * not a change to the chart — and not inside the drawer either, because the
   * drawer unmounts whenever the chart has no fields; state held there would
   * be lost every time the user emptied a well or switched cube.
   */
  // Open on the result rows at first, as the prototype's editor opens
  // (editor.js 183; recheck-chart-editor N4, T257).
  const [drawer, setDrawer] = useState<{ open: boolean; view: DrawerView }>({
    open: true,
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

  // What Cube said of the answer besides its rows: what served it (T153).
  const served = useMemo(() => answerMetaOf(result.data), [result.data]);

  // Memoised: a fresh array each render would defeat every memo below it, so
  // the signature — and with it the recommendation — would be recomputed on
  // every keystroke.
  const rows = useMemo(
    () =>
      ((result.data as { data?: unknown[] } | undefined)?.data ?? []) as Record<string, unknown>[],
    [result.data],
  );

  /**
   * The same function the dashboard recommends through (T193), so a chart is
   * given the same type in both places. Cardinalities come from the rows the
   * query actually returned (AC-028).
   */
  const signature: Signature = useMemo(() => signatureOf(spec, rows), [spec, rows]);

  const recommendation = useMemo(() => recommend(signature), [signature]);
  const explanation = useMemo(() => explain(signature), [signature]);

  /**
   * AC-032: a manual choice survives field changes. Nothing here resets it on
   * a spec change — only "Back to recommended" does.
   */
  // Read exactly as the dashboard reads it (T193), so a chart is drawn with
  // the same type on a tile as here.
  const recommended = topTypeOf(recommendation);
  const shownType = effectiveType(chartTypeState, recommended);
  /** The recommender's pick and runners-up, suggested in the gallery (AC-217). */
  const suggested = [
    ...new Set(
      [...(recommendation.top ? [recommendation.top] : []), ...recommendation.runnersUp].map(
        (alternative) => alternative.candidate.chartType,
      ),
    ),
  ];
  /** Whether the type gallery is open (AC-217), and Change, to give focus back to. */
  const [gallery, setGallery] = useState(false);
  const changeType = useRef<HTMLButtonElement>(null);
  const closeGallery = () => {
    setGallery(false);
    changeType.current?.focus();
  };

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

  /**
   * What a manual choice strains (AC-218): a combo's two value axes, or more
   * slices, colours, panels or cells than can be told apart — by the rules the
   * recommender rejects its own candidates with, on these fields.
   */
  const topN = typeof options['topN'] === 'number' ? options['topN'] : undefined;
  const rowLimit = typeof options['rowLimit'] === 'number' ? options['rowLimit'] : undefined;
  /** One option set or cleared, as one change (T390's settings beside Top N). */
  const setOption = (key: string, value: unknown) =>
    change((current) => {
      const next = { ...current.options };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return { ...current, options: next };
    });
  const typeWarnings = useMemo(
    () =>
      // Only of a chart these fields draw — what they lack is said apart
      // (AC-033) — and of rows that have come: while the query runs there is
      // nothing to count (T230's review).
      isManual(chartTypeState) &&
      shownType !== null &&
      missing.length === 0 &&
      result.isSuccess &&
      rows.length > 0
        ? warningsFor(shownType, signature, { topN })
        : [],
    // `missing` is derived from `spec` and `shownType`, and `signature` from `rows`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartTypeState, shownType, signature, result.isSuccess, rows, topN],
  );

  /**
   * The chart as drawn, once its fields can draw its type: the preview's, and
   * what the Customize tab lists its series from (AC-219).
   */
  const drawnSpec = useMemo(
    () =>
      isEmpty(spec) || shownType === null || missing.length > 0 || !result.isSuccess
        ? undefined
        : compile(previewDocument, { rows, chartType: shownType, formats, titles, shortTitles }),
    // `missing` is derived from `spec` and `shownType` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, shownType, result.isSuccess, previewDocument, rows, formats, titles, shortTitles],
  );
  /** Its series, each with how a reader knows it: a member's title, or the value. */
  const drawnSeries = useMemo(() => {
    if (drawnSpec === undefined) return [];
    try {
      return seriesOf(drawnSpec).series.map((one) => ({
        name: one.name,
        // Own keys only: a split's value may be "constructor" (T232's review).
        title: (Object.hasOwn(titles, one.name) ? titles[one.name] : undefined) ?? one.name,
      }));
    } catch {
      // A type `seriesOf` does not lay out — a pie, a KPI — lists none here.
      return [];
    }
  }, [drawnSpec, titles]);

  /** The chart's cube or view, as the model titles it. */
  const sourceTitle =
    cubeName === ''
      ? 'No cube or view yet'
      : (cubesFrom(meta.data).find((cube) => cube.name === cubeName)?.title ?? cubeName);

  return (
    <div className="chart-editor">
      {/**
       * One header row (AC-214, the prototype's editor head): whatever opened
       * the editor at its start — Back to the dashboard — then the chart's
       * title to edit, its source and row count, whether it is local or
       * shared, Undo, Redo, Discard, and the save action at its end.
       */}
      <header className="chart-editor__head" data-testid="editor-bar">
        <h1 className="visually-hidden">
          Chart editor{title === undefined || title.trim() === '' ? '' : `: ${title}`}
        </h1>
        {head?.start}
        {/* One change when the title is set down — on leaving it or Enter —
            not one Undo step per letter (T228's review). Read-only while a
            change is being applied, so nothing typed then is lost. */}
        <input
          className="chart-editor__title"
          aria-label="Chart title"
          placeholder="Untitled chart"
          readOnly={busy}
          value={typedTitle ?? title ?? ''}
          onChange={(event) => setTypedTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitTitle();
          }}
        />
        <span className="chart-editor__meta">
          {sourceTitle}
          {!isEmpty(spec) && result.isSuccess ? (
            <>
              {' · '}
              <span data-testid="result-row-count">{rows.length} rows</span>
            </>
          ) : null}
        </span>
        {head?.badges}
        <span className="chart-editor__spacer" />
        {/* Not while a change is being applied: an edit then would be lost
            with the draft already taken (T032, T228's review). The
            prototype's ↶ and ↷ icon buttons, named by aria-label (T257). */}
        <button
          type="button"
          className="icon-button"
          data-testid="undo"
          aria-label="Undo"
          title="Undo"
          disabled={busy || !canUndo(history)}
          onClick={() => setHistory(undo)}
        >
          ↶
        </button>
        <button
          type="button"
          className="icon-button"
          data-testid="redo"
          aria-label="Redo"
          title="Redo"
          disabled={busy || !canRedo(history)}
          onClick={() => setHistory(redo)}
        >
          ↷
        </button>
        <button
          type="button"
          className="btn-sm"
          data-testid="discard"
          disabled={busy || !isDirty(history)}
          onClick={() => {
            // A title half typed goes with the rest (T255).
            setTypedTitle(null);
            setHistory(discard);
          }}
        >
          Discard changes
        </button>
        {head?.end}
      </header>

      <aside className="chart-editor__fields" aria-label="Fields" inert={busy} aria-busy={busy}>
        <FieldList
          cubeName={cubeName}
          folderId={folderId}
          onDragStateChange={setDragging}
          used={used}
          // Into the well its role belongs in (AC-215).
          onAdd={(member) => {
            const well = wellFor(member.kind);
            // Already there: nothing to add, so no change to undo (T229's review).
            if (well === null || spec[well].includes(member.name)) return;
            setSpec((current) => addToWell(current, well, member.name));
          }}
          onCubeChange={(next) =>
            // Members belong to a cube; keeping them across a change would
            // build a query naming fields the new cube does not have.
            change((current) => ({ ...current, cubeName: next, spec: emptySpec(next) }))
          }
        />
      </aside>

      <section
        className="chart-editor__center"
        aria-label="Preview"
        data-testid="editor-result"
        inert={busy}
        aria-busy={busy}
      >
        <div className="chart-editor__canvas">
          {isEmpty(spec) ? (
            // In the preview's tile, as the prototype's empty editor draws it
            // (editor.js 481; recheck-chart-editor F18, T257): what to do, then
            // where to do it.
            <div
              className="grid-tile preview-frame__tile chart-editor__empty-tile"
              data-testid="preview-frame"
              data-size="fill"
            >
              <div className="chart-editor__empty" data-testid="result-empty">
                <p className="chart-editor__empty-head">Add at least one metric or dimension</p>
                <p className="chart-editor__empty-line">
                  Click fields on the left, or use the + buttons under Metrics and Dimensions.
                </p>
              </div>
            </div>
          ) : result.isPending ? (
            // A skeleton in the shape of the chart, not a spinner (AC-042): a
            // spinner says something is happening, a skeleton says something
            // is happening *here* and will look like this.
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
              {/*
                Where this answer came from, as the prototype's editor badges
                it, and — when no pre-aggregation served it — the warning that
                rollup-only mode would refuse the chart, on the chart itself
                (T153, AC-147; its panel says the same). Read from the answer
                the chart drew, so the two cannot disagree.
              */}
              <div className="result-source" data-testid="result-source">
                <AccelerationBadge result={served} />
                {accelerationOf(served).accelerated ? null : <RollupOnlyWarning />}
              </div>
              {missing.length > 0 ? (
                // In the chart's place, what it still needs (AC-033), rather
                // than empty axes.
                <div role="status" className="chart-editor__missing" data-testid="missing-fields">
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
              ) : shownType === null ? null : (
                <PreviewFrame tile={tile}>
                  {(chartHeight) => (
                    <ChartTile
                      spec={
                        drawnSpec ??
                        compile(previewDocument, {
                          rows,
                          chartType: shownType,
                          formats,
                          titles,
                          shortTitles,
                        })
                      }
                      {...(chartHeight === undefined ? {} : { height: chartHeight })}
                      // Held here, not in the tile: the tile unmounts whenever
                      // the query re-runs, so a field change would flip the
                      // reader back from the table to the chart (AC-178).
                      tableView={tableView}
                      onTableViewChange={setTableView}
                    />
                  )}
                </PreviewFrame>
              )}
            </>
          )}
        </div>

        {/*
          Outside the loading and error branches on purpose: rendered inside
          them, the drawer unmounts whenever the query re-runs and reopens
          closed, so changing a field would shut a drawer the user had opened.
          It shows the rows the chart rendered, passed in rather than
          re-fetched, so the two cannot disagree (AC-036). The only place the
          result's rows are printed (AC-214).
        */}
        {isEmpty(spec) ? null : (
          <ResultsDrawer
            rows={rows}
            query={query}
            underlyingQuery={underlyingQuery}
            formats={formats}
            titles={titles}
            granularities={granularitiesOf(spec.timeDimensions, spec.granularities)}
            open={drawer.open}
            view={drawer.view}
            onOpenChange={(open) => setDrawer((current) => ({ ...current, open }))}
            onViewChange={(view) => setDrawer((current) => ({ ...current, view }))}
          />
        )}
      </section>

      <aside
        className="chart-editor__inspector"
        aria-label="Chart settings"
        inert={busy}
        aria-busy={busy}
      >
        <div role="tablist" aria-label="Inspector" className="edit-sidebar__tabs">
          {INSPECTOR_TABS.map(([key, label], index) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${inspectorId}-${key}`}
              ref={(node) => {
                inspectorTabs.current[index] = node;
              }}
              aria-selected={inspector === key}
              aria-controls={`${inspectorId}-panel`}
              tabIndex={inspector === key ? 0 : -1}
              onClick={() => setInspector(key)}
              onKeyDown={(event) => {
                // The APG tabs pattern, as the dashboard's sidebar.
                const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (step === 0) return;
                event.preventDefault();
                const next = (index + step + INSPECTOR_TABS.length) % INSPECTOR_TABS.length;
                setInspector(INSPECTOR_TABS[next]?.[0] ?? 'data');
                inspectorTabs.current[next]?.focus();
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${inspectorId}-panel`}
          aria-labelledby={`${inspectorId}-${inspector}`}
          // Reachable by Tab even when it holds no control (APG tabs).
          tabIndex={0}
          className="chart-editor__inspector-body"
        >
          {inspector === 'data' ? (
            <>
              {/* The type by its name, and Change into the gallery (AC-217). */}
              <ChartTypeCard
                shown={shownType}
                manual={isManual(chartTypeState)}
                recommended={recommended}
                warnings={typeWarnings}
                changeRef={changeType}
                onChange={() => setGallery(true)}
                onBack={() => {
                  setChartTypeState(backToRecommended());
                  // The button pressed goes with the manual choice: to Change.
                  changeType.current?.focus();
                }}
              />
              <Wells
                spec={spec}
                available={available}
                titles={titles}
                dragging={dragging}
                onAdd={(well, member) => setSpec((current) => addToWell(current, well, member))}
                onRemove={(well, member) =>
                  setSpec((current) => removeFromWell(current, well, member))
                }
                // A time field's grain, from its pill (AC-216).
                onGranularity={(member, grain) =>
                  setSpec((current) => ({
                    ...current,
                    granularities: { ...current.granularities, [member]: grain },
                  }))
                }
                // The last filter removed leaves none stored, as there were.
                onFilters={(filters) =>
                  setSpec((current) => {
                    if (filters.length > 0) return { ...current, filters };
                    const { filters: _gone, ...rest } = current;
                    void _gone;
                    return rest;
                  })
                }
                // A box plot's "Each point is" (T400, AC-314), for a box plot alone.
                {...(shownType === 'boxplot'
                  ? {
                      eachPointIs: {
                        member: spec.eachPointIs,
                        onChange: (member: string | undefined) =>
                          setSpec((current) => {
                            if (member !== undefined) return { ...current, eachPointIs: member };
                            const { eachPointIs: _gone, ...rest } = current;
                            void _gone;
                            return rest;
                          }),
                      },
                    }
                  : {})}
                topN={topN}
                onTopN={(n) => setOption('topN', n)}
                tail={options['tail'] === 'drop' ? 'drop' : undefined}
                onTail={(tail) => setOption('tail', tail)}
                rowLimit={rowLimit}
                onRowLimit={(n) => setOption('rowLimit', n)}
                sort={
                  /*
                    Sorting (AC-044), beside Top N as the prototype has it
                    (T257). "Cube's order" is the default and is not the same
                    as any of the others: Cube was asked for an ordering and
                    returned one, and leaving it alone is a real choice rather
                    than the absence of one.
                  */
                  <div className="field">
                    <label htmlFor="chart-sort">Sort by</label>
                    <select
                      id="chart-sort"
                      className="select-sm"
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
                  </div>
                }
              />
              {recommendation.top ? (
                <div className="chart-editor__type" data-testid="recommendation">
                  {/* Each type by its name (AC-217), never its id. */}
                  <p data-testid="recommended-type" data-chart-type={recommended ?? undefined}>
                    Recommended: {recommended === null ? '' : CHART_TYPE_NAMES[recommended]}
                  </p>
                  <p data-testid="recommended-reason">{recommendation.top.reason}</p>

                  <h4>Or</h4>
                  <ul>
                    {recommendation.runnersUp.map((runnerUp) => (
                      <li
                        key={runnerUp.candidate.chartType}
                        data-testid={`runner-up-${runnerUp.candidate.chartType}`}
                      >
                        {CHART_TYPE_NAMES[runnerUp.candidate.chartType]} — {runnerUp.reason}
                      </li>
                    ))}
                  </ul>

                  <WhyThisChart explanation={explanation} titles={titles} />
                </div>
              ) : null}
            </>
          ) : (
            /*
              Customize (AC-219): the axes — only for the types that have
              cartesian axes (AC-040), since a pie or a KPI has none and a
              setting that cannot apply is worse than none — the legend, each
              series, stacking and data labels.
            */
            <CustomizeTab
              options={options}
              onOptions={setOptions}
              cartesian={CARTESIAN_TYPES.includes(shownType)}
              // The values run along x for a horizontal bar, both ways for a
              // scatter, and up y for the rest.
              valueAxes={
                shownType === 'hbar' ? ['x'] : shownType === 'scatter' ? ['x', 'y'] : ['y']
              }
              drawn={!UNDRAWN_TYPES.includes(shownType)}
              stackable={shownType !== null && STACKABLE_TYPES.includes(shownType)}
              series={SERIES_TYPES.includes(shownType) ? drawnSeries : []}
              colourOf={(name) => {
                const at = drawnSeries.findIndex((one) => one.name === name);
                return DEFAULT_PALETTE[Math.max(0, at) % DEFAULT_PALETTE.length] ?? '#000000';
              }}
              whiskers={shownType === 'boxplot'}
            />
          )}
        </div>
      </aside>
      {gallery ? (
        // Every type, searched or by purpose (AC-217): an override limited
        // to the suggestions is barely one, and a type these fields cannot
        // draw is greyed and chosen anyway says what to add (AC-033).
        <ChartTypeGallery
          current={shownType}
          suggested={suggested}
          counts={{
            measures: spec.measures.length,
            dimensions: spec.dimensions.length,
            timeDimensions: spec.timeDimensions.length,
          }}
          onChoose={(type) => {
            setChartTypeState(chooseType(type));
            closeGallery();
          }}
          onAuto={() => {
            setChartTypeState(backToRecommended());
            closeGallery();
          }}
          onClose={closeGallery}
        />
      ) : null}
    </div>
  );
}
