import {
  addToWell,
  applyQuickCalc,
  CHART_TYPE_NAMES,
  chartDocumentOf,
  comboAxesLine,
  comboLimitOf,
  comboSeriesOf,
  membersShownOf,
  withMembersShown,
  type MembersShown,
  compile,
  distinctValues,
  emptySpec,
  isEmpty,
  kpiOptionsOf,
  memberOn,
  membersOn,
  onOneScale,
  removeFromWell,
  swapMeasure,
  targetCount,
  targetMeasuresOf,
  withStack,
  granularitiesOf,
  seriesOf,
  toCubeQuery,
  toUnderlyingQuery,
  undrawnMeasures,
  wellFor,
  type ChartSpec,
  type SortSettings,
} from '@wechart/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  dataReasonFor,
  describeMissing,
  explain,
  recommend,
  warningsFor,
  type ChartType,
  type Signature,
  type WellName,
} from '@wechart/recommender';

import { DEFAULT_PALETTE, STACKABLE_TYPES, type LegendGlyphBox } from '@wechart/charts';

import { ChartTypeCard } from './ChartTypeCard';
import { ChartTypeGallery } from './ChartTypeGallery';
import { CustomizeTab } from './CustomizeTab';
import { answerMetaOf } from '../query/answerMeta';
import { QueryItemContext, useQueryItem, type QueryItem } from '../query/item';
import { elapsedOf, loadTile } from '../query/loadTile';
import { AccelerationBadge, accelerationOf } from '../tiles/AccelerationBadge';
import { ChartTile } from '../tiles/ChartTile';
import { RollupOnlyWarning, refusedInRollupOnly, rollupOnlyKnown } from './RollupOnlyWarning';
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
import { drawnSizeIn, hiddenLabelsAt } from './hiddenLabels';
import { metaQueryOf, siblingsQueryOf, useWorkspaceItem } from '../query/meta';
import { countryMarkingsOf, signatureOf, topTypeOf } from '../query/signature';
import { canRedo, canUndo, discard, historyOf, isDirty, push, redo, undo } from './history';
import { CubeSourcePicker, FieldList, membersWithJoins, useJoined } from './FieldList';
import { Wells } from './Wells';
import { LegendGlyphButtons } from './combo/LegendGlyphButtons';
import { undrawnWell } from './combo/undrawnWell';
import { addToWellAs } from './combo/comboWells';
import { stackChoice, stackCustomize } from './wells/stack';
import { requestCalculation } from './calcRequests';
import { RequestCalcDialog } from './RequestCalcDialog';
import {
  cubesFrom,
  formatsOf,
  measureTypesOf,
  shortTitlesOf,
  titlesOf,
  type Member,
} from './fields';

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
  // A map's legend is its colour scale, and a country has no label to give
  // (T398's review).
  'map',
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
  /**
   * The item its queries serve (T340, AC-268): the chart, on its own route.
   * Left out, the item around it: the dashboard it is edited on.
   */
  readonly item?: QueryItem | undefined;
  /**
   * The chart edited, by its id: what a calculation request carries (T383,
   * AC-050). Given, each measure's menu offers "Request a calculation…".
   */
  readonly chartId?: string | undefined;
}

/** A channel as a dimension's pill names it (T688, EDI-09); x and y by their axes. */
const CHANNEL_WORDS: Readonly<Record<string, string>> = {
  color: 'Color',
  size: 'Size',
  facet: 'Panel',
  row: 'Rows',
  column: 'Columns',
};

/** Each member's channel, as its pill says it; a horizontal bar's x reads "Y" (T688). */
function channelsOf(
  encoding: Readonly<Record<string, readonly string[] | undefined>> | undefined,
  flipped: boolean,
): Record<string, string> {
  const said: Record<string, string> = {};
  for (const [channel, members] of Object.entries(encoding ?? {}))
    for (const member of members ?? []) {
      const name =
        channel === 'x'
          ? flipped
            ? 'Y'
            : 'X'
          : channel === 'y'
            ? flipped
              ? 'X'
              : 'Y'
            : (CHANNEL_WORDS[channel] ?? channel);
      said[member] ??= name;
    }
  return said;
}

/** The inspector's tabs (AC-214, the prototype's Data and Customize). */
const INSPECTOR_TABS = [
  ['data', 'Data'],
  ['customize', 'Customize'],
] as const;
type InspectorTab = (typeof INSPECTOR_TABS)[number][0];

/** The editor, its queries asked for its item where it is given one (T340, AC-268). */
export function ChartEditor({ item, ...props }: ChartEditorProps = {}) {
  return item === undefined ? (
    <EditorBody {...props} />
  ) : (
    <QueryItemContext.Provider value={item}>
      <EditorBody {...props} />
    </QueryItemContext.Provider>
  );
}

function EditorBody({
  initial = OPENED_WITH,
  tile,
  onChange,
  head,
  busy = false,
  folderId,
  chartId,
}: Omit<ChartEditorProps, 'item'>) {
  const [history, setHistory] = useState(() => historyOf(initial));
  /** The measure a calculation is being requested on (T383, AC-050), while its dialog is open. */
  const [requesting, setRequesting] = useState<string | undefined>(undefined);
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
  // A workspace item's from its overlay (T347, AC-323).
  const workspaceItem = useWorkspaceItem();
  const meta = useQuery(metaQueryOf(workspaceItem));
  /** Each measure's siblings, the aggregations its tag offers (T689, chart-editor-Q6). */
  const siblings = useQuery({ ...siblingsQueryOf(workspaceItem), enabled: cubeName !== '' });

  /** The cubes the chosen one joins to, whose fields the chart may use too (T688, EDI-03). */
  const joined = useJoined(cubeName);
  const available = useMemo(
    () => membersWithJoins(meta.data, cubeName, joined),
    [meta.data, cubeName, joined],
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
  /** Each measure's aggregation: a count's axis in whole numbers (T683, DSH-02). */
  const measureTypes = useMemo(() => measureTypesOf(meta.data), [meta.data]);

  /**
   * A chosen type that asks Cube differently is part of the query: a box plot
   * wants its rows ungrouped (T399). Only a manual choice can be one — the
   * recommender, which reads the rows, never proposes it — so this can't loop.
   */
  const query = useMemo(() => {
    // A bullet chart's Target measure asked with its Metrics (T954, AC-581),
    // as the dashboard asks it (`toChartSpec`).
    const targets = targetMeasuresOf(chartTypeState.manual ?? undefined, options);
    const asked = targets.length === 0 ? spec : { ...spec, targets };
    // A KPI's period and comparison (T937, AC-565), as the dashboard asks them.
    if (chartTypeState.manual === 'kpi' && options['kpi'] !== undefined)
      return toCubeQuery({ ...asked, chartType: 'kpi', kpi: kpiOptionsOf(options) });
    // A box plot asks its rows ungrouped, and a bullet chart by its member
    // alone (checkpoint 1's review, AC-581), as the dashboard asks them.
    return toCubeQuery(
      chartTypeState.manual === 'boxplot' || chartTypeState.manual === 'bullet'
        ? { ...asked, chartType: chartTypeState.manual }
        : asked,
    );
  }, [spec, chartTypeState.manual, options]);

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
  // The chart edited, or the dashboard it is edited on (T340, AC-268).
  const item = useQueryItem();
  const result = useQuery({
    queryKey: ['editor-preview', query, item ?? null],
    queryFn: async ({ signal }) => {
      const answer = await loadTile({ query, signal, item });
      // How long it took, read here off the answer `loadTile` measured: kept
      // beside it in the data, as TanStack's structural sharing hands back
      // an object `elapsedOf` doesn't know after the first fetch (T690).
      return { answer, elapsedMs: elapsedOf(answer) };
    },
    enabled: !isEmpty(spec),
  });
  const answer = result.data?.answer;

  // What Cube said of the answer besides its rows: what served it (T153).
  const served = useMemo(() => answerMetaOf(answer), [answer]);
  const elapsedMs = result.data?.elapsedMs;

  // Memoised: a fresh array each render would defeat every memo below it, so
  // the signature — and with it the recommendation — would be recomputed on
  // every keystroke.
  const rows = useMemo(
    () => ((answer as { data?: unknown[] } | undefined)?.data ?? []) as Record<string, unknown>[],
    [answer],
  );
  /**
   * Whether Cube runs the model in rollup-only mode (T690, AC-147): as xcube
   * says it (`GET /api/rollup-only`), null where it can't. Read once; a
   * deployment's mode doesn't change under an editor.
   */
  const rollupOnly = useQuery({
    queryKey: ['rollup-only'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/rollup-only', { signal });
      if (!response.ok) return null;
      const said = ((await response.json()) as { rollupOnly?: unknown } | null)?.rollupOnly;
      return typeof said === 'boolean' ? said : null;
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  /**
   * Each dimension's distinct values in the chart's own result (T688,
   * EDI-04), for the field list: counted from the rows already come, with no
   * query of its own (the coordinator's call, 2026-10-17).
   */
  const distinct = useMemo(
    () =>
      new Map(
        rows.length === 0
          ? []
          : spec.dimensions.map((member) => [member, distinctValues(rows, member).length]),
      ),
    [rows, spec.dimensions],
  );

  /**
   * The same function the dashboard recommends through (T193), so a chart is
   * given the same type in both places. Cardinalities come from the rows the
   * query actually returned (AC-028).
   */
  // A dimension of country codes, by its values unless the model says (T398, AC-313).
  const countryMarking = useMemo(() => countryMarkingsOf(meta.data), [meta.data]);
  /**
   * The size the chart's canvas is drawn at (T516), which says how many of a
   * bar's labels would hide there: opened from a tile, the tile's less its
   * own padding and border, whichever preview size is shown; else the
   * preview's canvas as laid out (T516's review: not the tile's outer box).
   */
  const previewBox = useRef<HTMLDivElement>(null);
  const [drawnAt, setDrawnAt] = useState<{ width: number; height: number } | undefined>(undefined);
  const tileWidth = tile?.width;
  const tileHeight = tile === undefined ? undefined : (tile.chartHeight ?? tile.height);
  // Once each render, as the chart comes and goes; and as the pane resizes.
  useEffect(() => {
    const measure = () => {
      const size = drawnSizeIn(previewBox.current, tileWidth, tileHeight);
      if (size === undefined) return;
      setDrawnAt((now) => (now?.width === size.width && now.height === size.height ? now : size));
    };
    measure();
    const element = previewBox.current;
    if (element === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  });
  const signature: Signature = useMemo(
    () => ({
      // Each measure's scale from the model's formats: metrics on different
      // scales are drawn as small multiples (T510, R67), as on a tile.
      ...signatureOf(spec, rows, countryMarking, formats),
      // More than half a bar's labels hidden at that size: the horizontal bar
      // offered second (T516; R67). The pick itself never turns on it.
      hiddenLabels: hiddenLabelsAt(previewDocument, rows, drawnAt, formats),
    }),
    // `drawnAt` by its numbers, so a new object of the same size asks nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, rows, countryMarking, previewDocument, drawnAt?.width, drawnAt?.height, formats],
  );
  /** What the fields are, for what a type needs (AC-033): a map's country codes too (T398). */
  const counts = {
    measures: spec.measures.length,
    dimensions: spec.dimensions.length,
    timeDimensions: spec.timeDimensions.length,
    // The first dimension's alone: it is the one a map draws by (T398's review).
    countryCodes:
      signature.fields.find((field) => field.kind === 'dimension')?.countryCodes === true ? 1 : 0,
    // What R81's histogram can bin (T934): a dimension of numbers, or a
    // measure with Each point is.
    numericDimensions: spec.dimensions.filter(
      (name) => available.find((member) => member.name === name)?.type === 'number',
    ).length,
    eachPointIs: spec.eachPointIs === undefined ? 0 : 1,
    targets: targetCount(options, (name) => available.some((one) => one.name === name)), // T953
  };

  const recommendation = useMemo(() => recommend(signature), [signature]);

  /**
   * AC-032: a manual choice survives field changes. Nothing here resets it on
   * a spec change — only Auto, or the Recommended card's Use, does (R76).
   */
  // Read exactly as the dashboard reads it (T193), so a chart is drawn with
  // the same type on a tile as here.
  const recommended = topTypeOf(recommendation);
  const shownType = effectiveType(chartTypeState, recommended);
  /**
   * The trace, saying of a combo's right axis that the author drew it; the
   * recommendation itself reads the signature alone (AC-510).
   */
  const secondAxisByHand =
    shownType === 'combo' &&
    comboSeriesOf(spec.measures, options).some((one) => one.axis === 'right');
  const explanation = useMemo(
    () => explain(signature, { secondAxisByHand }),
    [signature, secondAxisByHand],
  );
  /**
   * The pick's reason built from the data (T689, EDI-07): "8 Customers
   * Country values × 1 measure → Bar", each field by its title (AC-220).
   */
  const pickReason =
    recommendation.top === null
      ? undefined
      : dataReasonFor(recommendation.top.candidate, (name) => titles[name] ?? name);
  /** The quick picks (EDI-06): the top pick and runners-up, each with its reason (AC-028). */
  const picks = [...(recommendation.top ? [recommendation.top] : []), ...recommendation.runnersUp]
    .filter(
      (each, at, all) =>
        all.findIndex((other) => other.candidate.chartType === each.candidate.chartType) === at,
    )
    .map((each) => ({ type: each.candidate.chartType, reason: each.reason }));
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
  /**
   * The well a greyed type chosen from the gallery needs (AC-217, T934),
   * highlighted while the fields are as they were when it was chosen and
   * that type is still the one drawn (T934's review: Auto or a quick pick
   * leaves the fields as they were).
   */
  const [highlighted, setHighlighted] = useState<
    { readonly well: WellName; readonly spec: ChartSpec; readonly type: ChartType } | undefined
  >(undefined);
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
  const missing = shownType ? describeMissing(shownType, counts) : [];

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
        : compile(previewDocument, {
            rows,
            chartType: shownType,
            formats,
            titles,
            shortTitles,
            measureTypes,
          }),
    // `missing` is derived from `spec` and `shownType` alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      spec,
      shownType,
      result.isSuccess,
      previewDocument,
      rows,
      formats,
      titles,
      shortTitles,
      measureTypes,
    ],
  );
  /**
   * The metrics the form drawn leaves undrawn (T510; UX-057, design 01-5;
   * R67), which the Metrics well says, with the forms that draw them: Small
   * multiples where one grouping lets a panel per metric draw them all, and
   * Table. Choosing one is a manual choice, focus going to Change.
   */
  /**
   * Each dimension's channel as drawn, its pill's tag (T688, EDI-09): a
   * horizontal bar draws its categories down y and its values along x
   * (`@wechart/charts` axis.ts), so its x reads "Y".
   */
  const channels = channelsOf(drawnSpec?.encoding, shownType === 'hbar');
  /** Each cube's title, for the fields' picker's groups (EDI-11). */
  const cubeTitles = useMemo(
    () => Object.fromEntries(cubesFrom(meta.data).map((cube) => [cube.name, cube.title])),
    [meta.data],
  );
  const undrawn = useMemo(
    () => (drawnSpec === undefined ? [] : undrawnMeasures(drawnSpec)),
    [drawnSpec],
  );
  const byMetric =
    spec.measures.length > 1 && spec.dimensions.length + spec.timeDimensions.length === 1;
  const chooseAndReturn = (type: ChartType) => {
    setChartTypeState(chooseType(type));
    changeType.current?.focus();
  };
  /** Its series, each with how a reader knows it: a member's title, or the value. */
  const drawnSeries = useMemo(() => {
    if (drawnSpec === undefined) return [];
    try {
      // As drawn: a metric on another scale isn't a series to style (T510).
      // A split combo's members, once each: every measure is drawn per member (T852).
      const names = [...new Set(seriesOf(onOneScale(drawnSpec)).series.map((one) => one.name))];
      return names.map((name) => ({
        name,
        // Own keys only: a split's value may be "constructor" (T232's review).
        title: (Object.hasOwn(titles, name) ? titles[name] : undefined) ?? name,
      }));
    } catch {
      // A type `seriesOf` does not lay out — a pie, a KPI — lists none here.
      return [];
    }
  }, [drawnSpec, titles]);
  /**
   * A combo's measures as drawn, and its split's members, for Customize ›
   * Series' rows (T855, AC-497, AC-504).
   */
  const comboRows = useMemo(() => {
    if (drawnSpec === undefined || drawnSpec.chartType !== 'combo') return undefined;
    const own = (member: string) =>
      (Object.hasOwn(titles, member) ? titles[member] : undefined) ?? member;
    // Every measure in the well, one on another scale too: putting it on the
    // right is how it's drawn (T855's review; AC-506).
    const measures = membersOn(drawnSpec.encoding, 'y').map((measure) => ({
      measure,
      title: own(measure),
    }));
    const splitBy = memberOn(drawnSpec.encoding, 'color');
    // The measures drawn: none on another scale or past 8 series (AC-503, AC-505).
    const drawn = membersOn(onOneScale(drawnSpec).encoding, 'y');
    return splitBy === undefined
      ? { measures, drawn }
      : { measures, drawn, split: { dimension: own(splitBy), members: drawnSeries } };
  }, [drawnSpec, titles, drawnSeries]);
  /**
   * A combo's mark and axis menu, as its Metrics pills (T856) and, in the
   * preview, its legend's glyphs (T857) open it: one menu over the same
   * options, so neither can disagree with Customize › Series (AC-497).
   * Format… is the Number format of the axis the measure is on, in
   * Customize › Axes' Left or Right group (decision T856-1, T858).
   */
  const comboMenu =
    shownType === 'combo'
      ? {
          options,
          onOptions: setOptions,
          split:
            comboRows?.split === undefined ? undefined : { dimension: comboRows.split.dimension },
          onFormat: (measure?: string) => {
            const onRight =
              measure !== undefined &&
              comboSeriesOf(spec.measures, options).find((one) => one.measure === measure)
                ?.axis === 'right';
            setInspector('customize');
            requestAnimationFrame(() => {
              const field = document.querySelector<HTMLSelectElement>(
                `[data-testid="axes-section"] #axis-${onRight ? 'right' : 'y'}-format`,
              );
              field?.closest('details')?.setAttribute('open', '');
              field?.focus();
            });
          },
        }
      : undefined;
  /**
   * A combo held to 8 series (T860; AC-504, AC-505): the measures drawn on
   * their scale, how many fit, and while split its members, their fold and
   * "‹dimension› shown", for the Split by well, Customize's Series heading
   * and the undrawn line.
   */
  const comboHeld = useMemo(() => {
    if (drawnSpec === undefined || drawnSpec.chartType !== 'combo') return undefined;
    const offScale = new Set(
      undrawn.filter((each) => each.reason === 'scale').map((each) => each.member),
    );
    const onScale = membersOn(drawnSpec.encoding, 'y').filter((member) => !offScale.has(member));
    const limit = comboLimitOf(drawnSpec, onScale);
    const series = seriesOf(onOneScale(drawnSpec)).series.length;
    const splitBy = memberOn(drawnSpec.encoding, 'color');
    const dimension =
      splitBy === undefined
        ? undefined
        : ((Object.hasOwn(shortTitles, splitBy) ? shortTitles[splitBy] : undefined) ??
          (Object.hasOwn(titles, splitBy) ? titles[splitBy] : undefined) ??
          splitBy);
    return { limit, series, dimension };
  }, [drawnSpec, undrawn, titles, shortTitles]);
  /** The Split by well's count and "‹dimension› shown" (T860, AC-505). */
  const comboCount =
    comboHeld?.dimension === undefined
      ? undefined
      : {
          measures: comboHeld.limit.drawn.length,
          members: comboHeld.limit.members,
          top: comboHeld.limit.top,
          series: comboHeld.series,
          dimension: comboHeld.dimension,
          shown: membersShownOf(options),
          onShown: (shown: MembersShown | undefined) =>
            setOptions({ combo: withMembersShown(options, shown)['combo'] }),
        };
  /**
   * A combo's canvas line (T858; AC-499, AC-501; design 20 pin 1): its
   * series drawn on how many value axes, "3 series on 2 value axes, aligned
   * at zero".
   */
  const comboLine = useMemo(() => {
    if (drawnSpec === undefined || drawnSpec.chartType !== 'combo') return undefined;
    const drawn = onOneScale(drawnSpec);
    return comboAxesLine(
      seriesOf(drawn).series.length,
      membersOn(drawn.encoding, 'y'),
      options,
      formats,
    );
  }, [drawnSpec, options, formats]);
  /** The combo legend's glyph buttons, in the editor's preview only (T857, AC-497). */
  const legendOverlay =
    comboMenu === undefined || comboRows === undefined
      ? undefined
      : (glyphs: readonly LegendGlyphBox[], emphasise: (name: string | undefined) => void) => (
          <LegendGlyphButtons
            glyphs={glyphs}
            emphasise={emphasise}
            measures={comboRows.measures}
            options={comboMenu.options}
            onOptions={comboMenu.onOptions}
            split={comboMenu.split}
            onFormat={(measure) => comboMenu.onFormat(measure)}
            onRemove={(measure) =>
              setSpec((current) => removeFromWell(current, 'measures', measure))
            }
          />
        );
  /**
   * A cell's colour in the results grid (T690, EDI-18): the colour
   * dimension's values each wear their series' colour as drawn — its own,
   * chosen in Customize, or the palette's by place, as Customize shows it.
   */
  const colourMember = drawnSpec?.encoding?.['color']?.[0];
  const seriesSettings = (options['series'] ?? {}) as Record<string, { colour?: unknown }>;
  const swatchOf = (column: string, value: unknown): string | undefined => {
    // Its column, or its grain's (`member.month`) for a time member on colour.
    if (
      colourMember === undefined ||
      (column !== colourMember && !column.startsWith(`${colourMember}.`))
    )
      return undefined;
    const at = drawnSeries.findIndex((one) => one.name === String(value));
    if (at === -1) return undefined;
    const own = seriesSettings[String(value)]?.colour;
    return typeof own === 'string' ? own : DEFAULT_PALETTE[at % DEFAULT_PALETTE.length];
  };

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
        {/* The answer's facts as design 01 pin 1 badges them (T690, EDI-01):
            what served it, "● Live" or "✓ Pre-agg", the rollup-only sentence
            in Live's tooltip (AC-147, chart-editor-Q4, Q5); then
            "8 rows · 42 ms". The cube is named over the field list (T688). */}
        {!isEmpty(spec) && result.isSuccess ? (
          <>
            <AccelerationBadge result={served} variant="head" />
            <span className="badge chart-editor__facts" data-testid="result-facts">
              <span data-testid="result-row-count">{rows.length} rows</span>
              {elapsedMs === undefined ? null : (
                <>
                  {' · '}
                  <span data-testid="result-ms">{Math.round(elapsedMs)} ms</span>
                </>
              )}
            </span>
          </>
        ) : null}
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
          onDragStateChange={setDragging}
          used={used}
          distinct={distinct}
          // Into the well its role belongs in (AC-215).
          onAdd={(member) => {
            const well = wellFor(member.kind);
            // Already there: nothing to add, so no change to undo (T229's review).
            if (well === null || spec[well].includes(member.name)) return;
            // A combo's dimension splits it, replacing its split (T860, AC-504).
            setSpec((current) => addToWellAs(shownType, current, well, member.name));
          }}
        />
      </aside>

      <section
        className="chart-editor__center"
        aria-label="Preview"
        data-testid="editor-result"
        inert={busy}
        aria-busy={busy}
      >
        <div ref={previewBox} className="chart-editor__canvas">
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
            <>
              {/* Refused because Cube runs rollup-only (T690, AC-147): in
                  Cube's own words for it, xcube saying on or unable to say;
                  never for another failure (T690's review). */}
              {refusedInRollupOnly(rollupOnly.data, result.error) ? <RollupOnlyWarning /> : null}
              {/* Cube's own message, with Retry and the query behind a
                  disclosure (AC-012, AC-042). */}
              <TileError
                error={result.error}
                onRetry={() => {
                  void result.refetch();
                }}
              />
            </>
          ) : (
            <>
              {/*
                Design 01 pin 10's one-line status over the preview (T690,
                EDI-13): the form drawn and how it was chosen. What served the
                answer is the head's badge; the banner shows only where wechart
                knows Cube runs in rollup-only mode, which would refuse a chart
                no pre-aggregation serves (AC-147 as amended, chart-editor-Q4).
              */}
              {shownType === null || missing.length > 0 ? null : (
                <p className="chart-editor__status" data-testid="preview-status">
                  Showing <b>{CHART_TYPE_NAMES[shownType]}</b> ·{' '}
                  {isManual(chartTypeState) ? 'chosen manually' : 'auto'}
                  {comboLine === undefined ? null : ` · ${comboLine}`}
                </p>
              )}
              {!accelerationOf(served).accelerated && rollupOnlyKnown(rollupOnly.data, null) ? (
                <RollupOnlyWarning />
              ) : null}
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
                          measureTypes,
                        })
                      }
                      {...(chartHeight === undefined ? {} : { height: chartHeight })}
                      {...(legendOverlay === undefined ? {} : { legendOverlay })}
                      // A box plot's rows cut at Cube's limit, said here too,
                      // where box plots are built (T401's review, AC-315).
                      rowsTotal={served.total}
                      // Held here, not in the tile: the tile unmounts whenever
                      // the query re-runs, so a field change would flip the
                      // reader back from the table to the chart (AC-178).
                      tableView={tableView}
                      onTableViewChange={setTableView}
                      // A note's Filter opens the Filters well's menu (T982),
                      // on the Data tab, where the wells are (T982's review).
                      onFilter={() => {
                        setInspector('data');
                        requestAnimationFrame(() => {
                          const add = document.querySelector<HTMLElement>(
                            '[data-testid="add-filters"]',
                          );
                          add?.focus();
                          add?.click();
                        });
                      }}
                      // The query it asked: a KPI's trend asks it by Time's grain (T938).
                      query={query}
                      // A KPI's + Time takes the reader to its Time well (T939, AC-566).
                      onAddTime={() => {
                        setInspector('data');
                        requestAnimationFrame(() => {
                          document
                            .querySelector<HTMLElement>('[data-testid="well-kpi-time"] select')
                            ?.focus();
                        });
                      }}
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
            // Design 02's facts and marks (T690): how long, what served it.
            elapsedMs={elapsedMs}
            accelerated={accelerationOf(served).accelerated}
            // The columns in the wells' order (AC-301, EDI-19).
            columns={[...spec.timeDimensions, ...spec.dimensions, ...spec.measures]}
            swatchOf={swatchOf}
            query={query}
            underlyingQuery={underlyingQuery}
            formats={formats}
            titles={titles}
            // A quick calculation's values, as the chart writes and names them (AC-048).
            {...(drawnSpec?.calculated === undefined
              ? {}
              : { result: { formats: drawnSpec.formats, titles: drawnSpec.titles } })}
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
              {/* Design 01's three ruled sections (T688, EDI-08): the source
                  and the type; the wells, Sort and Top N; why. */}
              <div className="inspector-section" data-testid="inspector-source">
                {/* The cube or view, the inspector's first field (EDI-05, pin 3). */}
                <CubeSourcePicker
                  cubeName={cubeName}
                  folderId={folderId}
                  onCubeChange={(next) =>
                    // Members belong to a cube; keeping them across a change would
                    // build a query naming fields the new cube does not have.
                    change((current) => ({ ...current, cubeName: next, spec: emptySpec(next) }))
                  }
                />
                {/* The type by its name, and Change into the gallery (AC-217). */}
                <ChartTypeCard
                  shown={shownType}
                  manual={isManual(chartTypeState)}
                  recommended={recommended}
                  recommendedReason={pickReason}
                  picks={picks}
                  warnings={typeWarnings}
                  changeRef={changeType}
                  onChange={() => setGallery(true)}
                  // Auto, or the Recommended card's Use (AC-217, AC-032).
                  onAuto={(from) => {
                    setChartTypeState(backToRecommended());
                    // Use goes with the manual choice: to Change. Auto stays,
                    // and keeps focus (T689's review).
                    if (from === 'use') changeType.current?.focus();
                  }}
                  // A quick pick: that type, by hand (EDI-06).
                  onPick={(type) => setChartTypeState(chooseType(type))}
                />
              </div>
              <div className="inspector-section" data-testid="inspector-wells">
                <Wells
                  spec={spec}
                  available={available}
                  cubeTitles={cubeTitles}
                  joined={joined}
                  channels={channels}
                  titles={titles}
                  dragging={dragging}
                  onAdd={(well, member) =>
                    setSpec((current) => addToWellAs(shownType, current, well, member))
                  }
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
                  // A measure's quick calculation, from the menu on its pill (AC-047).
                  onCalculation={(member, calc) =>
                    setSpec((current) => applyQuickCalc(current, member, calc))
                  }
                  // Anything else, asked of whoever may change the model (T383, AC-050).
                  onRequest={chartId === undefined ? undefined : setRequesting}
                  // Another aggregation the model allows, from the tag (T689, chart-editor-Q6).
                  siblings={siblings.data ?? {}}
                  onSwap={(from, to) => setSpec((current) => swapMeasure(current, from, to))}
                  // The last filter removed leaves none stored, as there were.
                  onFilters={(filters) =>
                    setSpec((current) => {
                      if (filters.length > 0) return { ...current, filters };
                      const { filters: _gone, ...rest } = current;
                      void _gone;
                      return rest;
                    })
                  }
                  // The well a type chosen from the gallery needs (AC-217,
                  // T934), until the fields next change; and R81's type's own
                  // wells (`editor/wells/`).
                  highlight={
                    highlighted?.spec === spec && highlighted.type === shownType
                      ? highlighted.well
                      : undefined
                  }
                  typeWells={
                    shownType === null
                      ? undefined
                      : {
                          chartType: shownType,
                          // What a type's own wells read and set (T936: the KPI's; T973: the Map's).
                          available,
                          options,
                          onOptions: setOptions,
                          titleOf: (member: string) =>
                            available.find((each) => each.name === member)?.title ??
                            titles[member] ??
                            member,
                          spec,
                          formats,
                          onAdd: (well, member) =>
                            setSpec((current) => addToWell(current, well, member)),
                        }
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
                  // A combo draws a metric on another scale on its right axis (AC-506).
                  undrawn={undrawnWell({
                    undrawn,
                    shownType,
                    options,
                    onOptions: setOptions,
                    // Split, a measure past 8 series is offered small multiples
                    // by the split's dimension (AC-505).
                    onSmallMultiples:
                      byMetric || comboCount !== undefined
                        ? () => chooseAndReturn('trellis')
                        : undefined,
                    onTable: () => chooseAndReturn('table'),
                    limit:
                      comboHeld === undefined
                        ? undefined
                        : {
                            drawn: comboHeld.limit.drawn.length,
                            ...(comboCount === undefined
                              ? {}
                              : { members: comboCount.members, dimension: comboCount.dimension }),
                          },
                  })}
                  // A combo's pills: each metric's mark and axis, from its
                  // glyph's menu (T856, AC-497). Format… is the value axis's
                  // Number format, on Customize (decision T856-1).
                  combo={
                    comboMenu === undefined
                      ? undefined
                      : { ...comboMenu, ...(comboCount === undefined ? {} : { count: comboCount }) }
                  }
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
              </div>
              {recommendation.top ? (
                // "Why this recommendation?", the last section, collapsed (EDI-12, pin 9).
                <div className="inspector-section chart-editor__type" data-testid="recommendation">
                  <WhyThisChart
                    explanation={explanation}
                    titles={titles}
                    picked={{
                      type: recommendation.top.candidate.chartType,
                      reason: pickReason ?? recommendation.top.reason,
                      runnersUp: recommendation.runnersUp.map((runnerUp) => ({
                        type: runnerUp.candidate.chartType,
                        reason: runnerUp.reason,
                      })),
                    }}
                  />
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
              eachPointIs={spec.eachPointIs !== undefined}
              sankey={shownType === 'sankey'}
              {...(comboRows === undefined
                ? {}
                : {
                    combo: {
                      ...comboRows,
                      formats,
                      ...(comboHeld === undefined ? {} : { series: comboHeld.series }),
                    },
                  })}
              {...stackCustomize(shownType, {
                options,
                onOptions: setOptions,
                measureTitle: titles[spec.measures[0] ?? ''] ?? spec.measures[0] ?? '',
                aggType: measureTypes[spec.measures[0] ?? ''],
              })}
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
          counts={counts}
          // A greyed card's well highlighted (AC-217, T934). A 100 % card's
          // stacking is Customize's Stack: the card opens its type at 100 %,
          // as one change with the type (T957, AC-584).
          onChoose={(type, extras) => {
            const stack = stackChoice(type, extras);
            if (stack === undefined) setChartTypeState(chooseType(type));
            else
              change((current) => ({
                ...current,
                chartType: chooseType(type),
                options: withStack(current.options, stack),
              }));
            setHighlighted(
              extras?.highlight === undefined ? undefined : { well: extras.highlight, spec, type },
            );
            closeGallery();
          }}
          onAuto={() => {
            setChartTypeState(backToRecommended());
            closeGallery();
          }}
          onClose={closeGallery}
        />
      ) : null}
      {requesting === undefined || chartId === undefined ? null : (
        // A calculation the menu can't express (T383, AC-050): the chart, the
        // fields it has in use and the user's description, asked of the
        // people who may change the model that defines its cube.
        <RequestCalcDialog
          measureTitle={
            available.find((member) => member.name === requesting)?.shortTitle ??
            titles[requesting] ??
            requesting
          }
          cubeTitle={sourceTitle}
          fields={{
            measures: spec.measures,
            dimensions: spec.dimensions,
            timeDimensions: spec.timeDimensions,
            filters: (spec.filters ?? []).map((filter) => filter.member),
          }}
          titleOf={(member) => titles[member] ?? member}
          onSend={async (description) => {
            await requestCalculation({
              chartId,
              cube: spec.cube,
              fields: {
                measures: spec.measures,
                dimensions: spec.dimensions,
                timeDimensions: spec.timeDimensions,
                filters: (spec.filters ?? []).map((filter) => filter.member),
              },
              description,
            });
          }}
          onClose={() => {
            setRequesting(undefined);
          }}
        />
      )}
    </div>
  );
}
