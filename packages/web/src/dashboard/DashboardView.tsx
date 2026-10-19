import { keyToMarking, markFromLegend, markFromPanel, nameWriter } from '@wechart/charts';
import { COLORS } from '@wechart/ui';
import {
  addItemsWithinLimit,
  expandWholeTile,
  invertTileItems,
  markAllOfTile,
  markedCount,
  markingMembers,
  MARKING_ITEM_LIMIT,
  OTHER_LABEL,
  type MarkedItem,
  applyAxisRange,
  applyItemClick,
  applyToggleOrAdd,
  isItemMarked,
  isPercentStack,
  markingModeOf,
  rangeFromDrag,
  matchesPredicate,
  rowsCsvOf,
  EMPTY_PREDICATE,
  type CubeFilter,
  isEmptyPredicate,
  limitFilterFor,
  markingApplicability,
  markingsFrom,
  memberOn,
  seriesOf,
  distinctValues,
  type Marking,
  type MarkingPredicate,
  type MarkingSlot,
  toChartSpec,
  toUnderlyingQuery,
  toCubeQuery,
  type ChartDocument,
  type ChartType,
  type DrillOption,
  drilledDocument,
  drillOptions,
  granularitiesOf,
  type MemberFormats,
  type RenderSpec,
  CHART_TYPE_NAMES,
  withMemberLabels,
  withoutCalculations,
  TEXT_ELEMENT_LIMIT,
  elementsOf,
  type TextNode,
} from '@wechart/core';
import {
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';

import { measureTypesOf } from '../editor/fields';
import type { TileSize } from '../editor/PreviewFrame';
import { answerMetaOf, type AnswerMeta } from '../query/answerMeta';
import { DrillCrumb, type DrilledView } from './drill/DrillCrumb';
import { loadTile } from '../query/loadTile';
import { markedShareFilter, needsMarkedShare } from '../query/markedShare';
import { SecurityPreview } from '../query/securityPreview';
import { QueryItemContext, type QueryItem } from '../query/item';
import { ChartTile, type ChartTileProps } from '../tiles/ChartTile';
import { TileError } from '../tiles/TileError';
import { hiddenMemberOf, TileUnavailable } from '../tiles/TileUnavailable';
import { accelerationOf } from '../tiles/AccelerationBadge';
import { RollupRefreshNote } from '../tiles/RollupRefreshNote';
import { TileSkeleton } from '../tiles/TileSkeleton';
import { useDashboardColours } from './colours';
import { AddPanel } from './edit/AddPanel';
import {
  CHART_MISSING,
  CHART_UNTYPED,
  pickedWithFormats,
  tileChartOf,
  withFormats,
} from './chartSpec';
import { ChartEditorOverlay } from './edit/ChartEditorOverlay';
import {
  drawnWithDrafts,
  whyUnsaveable,
  whyUnsaveableWith,
  withDraft,
  withoutDrafts,
} from './edit/chartDrafts';
import {
  deleteFromDashboard,
  describeDeletion,
  sectionHasContents,
  ungroupSection,
} from './edit/deletion';
import { DeleteSectionDialog } from './edit/DeleteSectionDialog';
import { UndoToast } from './edit/UndoToast';
import { EditChrome, PencilIcon, type EditSession } from './edit/EditChrome';
import { Outline, tileNameOf } from './edit/Outline';
import { openSidebarPanel } from './edit/EditSidebar';
import { MoveToMenu } from './edit/MoveToMenu';
import { NOTHING_CHOSEN, needsOf, templateElements } from './edit/templates';
import { MarkRangeDialog } from './MarkRangeDialog';
import { PreviewBanner } from './PreviewBanner';
import { tilePartsOf } from './tileParts';
import { NO_CLIPBOARD, pageClipboard, TileViewMenu } from './TileViewMenu';
import { linkWithMarks } from './markings/shareLink';
import { SettingsPage, type SettingsSection } from './settings/SettingsPage';
import { createDetailsTile } from './tiles/createDetails';
import { placeInGrammar } from './model/grammar';
import { insertElement, insertionPoint, newElement } from './model/insert';
import { readAsText } from './model/stored';
import { activeFilters, withFilters, withLimit, type ActiveFilter } from '../filters/apply';
import { GeneratedSql } from '../workspaces/security/GeneratedSql';
import { ViewQuery } from './ViewQuery';
import {
  emptyTextDocument,
  isEmptyTextDocument,
  tokenOfElement,
  withElementSettings,
  type TokenRender,
} from '../tiles/text/documents';
import { elementCountOf, whyTextUnsaveable } from '../tiles/text/elementLimit';
import { TextTile } from '../tiles/text/TextTile';
import { LazyTextEditor, TextEditingContext, type TextEditing } from '../tiles/text/textEditing';
import type { CopilotOffer, InsertSources } from '../tiles/text/InsertMenu';
import { insertSourcesOf } from '../tiles/text/insertSources';
import { copilotOfferFor } from '../tiles/text/copilotOffer';
import type { ElementRender } from '../tiles/text/readMapping';
import { changeQueryOf, timeOf, valueQueryOf } from '../tiles/text/elementQueries';
import { ValueElement } from '../tiles/text/elements/ValueElement';
import { ChangeElement } from '../tiles/text/elements/ChangeElement';
import { namesFrom } from '../tiles/text/elementName';
import { ElementsList } from '../tiles/text/ElementsList';
import { QueryClientContext } from '@tanstack/react-query';
import type { Me } from '../shell/AccountMenu';
import { ME_QUERY } from '../shell/me';
import { MarkingToken, MeasureToken, UnknownMarkingToken } from './tiles/LiveToken';
import { measureQueryOf } from './tiles/TextTokens';
import { coverageOf, type Reach } from '../filters/coverage';
import { chartTilesOf, scopeOf } from '../filters/scope';
import { effectsOn, type CrossEffects, type CrossSelection } from './crossfilter/apply';
import { CrossFilterChips } from './crossfilter/CrossFilterChip';
import {
  clickedMarkItem,
  clickedValue,
  clickMarksCategory,
  membersDrawn,
  seriesCountOf,
  type ClickedItem,
} from './crossfilter/clicked';
import { useThemeName } from '../shell/ThemeProvider';
import { clearTileMarking } from './markings/clear';
import { announceMarking, MarkingAnnouncer } from './markings/LiveRegion';
import { MarkBadge } from './markings/MarkBadge';
import { MarkChip, summariseMarking } from './markings/MarkChip';
import {
  markFilterFrom,
  markFilterLabel,
  markFilterOn,
  type MarkFilter,
} from './markings/filterToMarked';
import { DOWNLOADED, MarkedRows } from './markings/MarkedRows';
import { markedValuesTsv, shareShownOf, showsShareOnly } from './markings/markedValues';
import { CopyToDashboard } from './CopyToDashboard';
import { clockTimeOf, dataAsOf, type DataAsOfSaid, type ScheduleSaid } from './dataAsOf';
import { WhyNotAccelerated } from './WhyNotAccelerated';
import { markingOf, withMarking, type MarkingState } from './markings/store';
import { interactionsOf, type InteractionMode } from './settings/interactionMode';
import { describeFilter } from '../filters/describe';
import { NotCovered } from '../filters/NotCovered';
import {
  ChartSection,
  MarkingSection,
  PageTabsProperties,
  TileProperties,
} from './edit/TileProperties';
import { chartTypeText } from '../workspaces/explore/chartTypeLabels';
import { ImageTile } from './tiles/ImageTile';
import { LinkTile } from './tiles/LinkTile';
import { allMembers, FilterBar } from '../filters/FilterBar';
import { FilterSettings } from '../filters/FilterSettings';
import {
  FilteredCharts,
  keepLastAnswers,
  type FilteredChartsHandle,
  type FilteredResults,
} from '../filters/FilteredCharts';
import { newFilter, type FilterValues } from '../filters/model';
import { adoptValues, sameValues, type SearchFilter } from '../filters/url';
import { StateLine } from '../shell/StatusIcon';
import { MenuButton } from '../shell/MenuButton';
import { ExportPane, type Outline as ExportOutline } from './export/ExportPane';
import { ExportedToast } from './export/ExportedToast';
import { Canvas, type CanvasProps } from './grid/Canvas';
import { CompactChips } from './header/CompactChips';
import { filterChangeSaid, markFilterSaid } from './header/filterChangeSaid';
import { filtersSet } from './header/filtersSet';
import { PageMenu } from './header/PageMenu';
import { PageTabsMore } from './header/PageTabsMore';
import { useTabsThatFit } from './header/useTabsThatFit';
import { DRAG_INSTRUCTIONS, DRAG_INSTRUCTIONS_ID, useTileDrag } from './grid/drag';
import { COLUMNS, ROW_UNIT_PX } from './grid/geometry';
import { actionFor } from './grid/keyboard';
import { MIN_ROWS, readoutFor } from './grid/resize';

/**
 * Where a tile has ended up, for the live region. `placeOf` already knows
 * both numbers; saying "third of five" is what tells a reader the move landed
 * and whether there is anywhere further to go.
 */
function sayPlace(
  document: DashboardDocument,
  tileId: string,
  /** The tile's name, by its title (AC-209). */
  nameOf: (id: string) => string,
): string {
  const place = placeOf(document, tileId);
  if (place === null) return '';
  return `${clauseOf(nameOf(tileId))}: position ${String(place.index + 1)} of ${String(place.of)}.`;
}

const tileNode = (id: string) =>
  window.document.querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"]`);

/**
 * Where focus goes once an element it was on, or was opened from, is deleted
 * (T182, AC-176): the next item in its container, else the one before, else
 * the section around it. Left alone it falls to the page, and a keyboard user
 * starts again from the top. Read from the rendered order before the delete,
 * because afterwards the element is gone; the returned call focuses after it.
 */
function focusAfterDeleting(id: string): () => void {
  const node = tileNode(id);
  const along = (step: 'nextElementSibling' | 'previousElementSibling') => {
    let at = node?.[step] ?? null;
    while (at !== null && !at.hasAttribute('data-tile')) at = at[step];
    return at?.getAttribute('data-tile') ?? null;
  };
  const neighbour =
    along('nextElementSibling') ??
    along('previousElementSibling') ??
    node?.parentElement?.closest('[data-tile]')?.getAttribute('data-tile') ??
    null;
  return () => {
    if (neighbour === null) return;
    requestAnimationFrame(() => {
      tileNode(neighbour)?.focus();
    });
  };
}
import {
  changeTile,
  chartIdOf,
  containersOf,
  elementAt,
  isSection,
  isSized,
  isTabGroup,
  isTile,
  isTileId,
  moveBy,
  moveTile,
  placeOf,
  pageKey,
  resizeTile,
  sectionKey,
  tabKey,
  type ChartDraft,
  type DashboardDocument,
  type Element_,
  type Tile,
} from './model/document';
import { detach } from '../editor/detach';
import { TileChartOwnership } from './edit/ChartOwnership';
import { allowedLimits, TileLimits } from './settings/TileLimits';
import { TileMarking } from './settings/TileMarking';
import {
  allLimitsEmpty,
  defaultNothingMarkedMessage,
  NothingMarked,
  NOTHING_MARKED_DEFAULT,
  type NothingMarkedState,
} from './tiles/NothingMarked';
import { clauseOf } from './grid/sentence';
import { useNarrowWindow } from './useNarrowWindow';
import { onTabKey } from '../shell/tabKeys';
import { duplicateChartTile, duplicatePlainTile } from './model/duplicate';
import { withLocalCharts } from './model/localCharts';
import { viewFor } from './bookmarks/applyBookmark';
import { Bookmarks } from './bookmarks/Bookmarks';
import type { ViewState } from './bookmarks/viewState';
import { HistoryIcon } from '../workspaces/history/HistoryPanel';

/**
 * A saved dashboard, open for reading (AC-018).
 *
 * It takes its tiles' data as a prop, the way `FolderContents` takes its rows:
 * fetching belongs to the route. What the view owns is the structure — which
 * page is open, what is nested in what — and the colours, because AC-039 makes
 * that a dashboard-level decision rather than a tile-level one.
 */
export interface DashboardViewProps {
  /**
   * Which dashboard this is. A chart edited from a tile can be saved with the
   * dashboard only if it is local to *this* one — the server's rule too — and
   * the document does not carry its own id (T192).
   */
  readonly dashboardId: string;
  /**
   * The item its queries serve (T340, AC-268): the dashboard itself, unless
   * a review draws it from a proposal, whose copy its reviewer can't open.
   */
  readonly queryItem?: QueryItem | undefined;
  readonly document: DashboardDocument;
  /** Compiled specs by chart id. The dashboard supplies their colours. */
  readonly specs: Readonly<Record<string, RenderSpec>>;
  /**
   * What went wrong, by chart id, for the charts that did not load (AC-012).
   * Separate from `specs` because "failed" and "absent" are different states
   * and a failure rendered as an absent spec draws an empty chart, which reads
   * as "no data" — the one answer it is not.
   */
  readonly errors?: Readonly<Record<string, unknown>>;
  /** The charts are still on their way, so tiles show a skeleton (AC-042). */
  readonly loading?: boolean;
  /**
   * What Cube said of each chart's answer, by chart id: when its data is
   * from (T154, AC-148), and whether a pre-aggregation served it (T014, AC-013).
   */
  readonly answered?: Readonly<Record<string, AnswerMeta>> | undefined;
  /**
   * Ask a chart's unfiltered data again, past Cube's cache (AC-148). A tile a
   * filter reaches is refreshed here instead: what it draws is its filtered
   * answer.
   */
  readonly onRefresh?: ((chartId: string) => void) | undefined;
  /** The charts whose refresh is on its way. */
  readonly refreshing?: ReadonlySet<string> | undefined;
  /**
   * False while the dashboard's charts are being loaded: a refresh begun then
   * would be overwritten by the older load landing after it (T154's review).
   */
  readonly refreshable?: boolean | undefined;
  /**
   * A previewed security context (T172, AC-166): the filtered charts and the
   * filters' own values are asked as it too, and a banner names it for as
   * long as it is in effect (direction.md rule 21).
   */
  readonly preview?: Readonly<Record<string, unknown>> | undefined;
  readonly onExitPreview?: (() => void) | undefined;
  /**
   * Drawn to be read, never edited or bookmarked: a proposal's dashboard in
   * its review view (T356; design 05, pin 3), as readers would see it.
   */
  readonly readOnly?: boolean | undefined;
  /**
   * Whether a tile's chart may be copied to another dashboard: not for one
   * read-only everywhere, who has no workspace and no dashboard to change
   * (T760, AC-277). Offered unless said otherwise.
   */
  readonly mayCopyToDashboard?: boolean | undefined;
  /** Its folder's breadcrumb over it; none where it is drawn in a review (T544, AC-390). */
  readonly crumbs?: boolean | undefined;
  /** Open or close its History panel (T357); absent, no History is offered. */
  readonly onHistory?: (() => void) | undefined;
  /** Whether its History panel is open, so its button shows pressed. */
  readonly historyOpen?: boolean | undefined;
  /** Edit mode entered or left (T357's review). */
  readonly onEditingChange?: ((editing: boolean) => void) | undefined;
  /**
   * Delete dashboard…, last in the header's ⋯ (design 14, B2; T528): given
   * to those who may change its folder.
   */
  readonly onDelete?: (() => void) | undefined;
  /**
   * Where it lives, with sign-in on (T348, AC-278; design 04, states E and
   * F): the line under its title; a shared one edited only in a copy; a
   * workspace one proposed back.
   */
  readonly place?:
    | {
        /** None until its folders are read. */
        readonly line: string | undefined;
        readonly editsElsewhere: boolean;
        readonly copy?: { readonly label: string; readonly onClick: () => void } | undefined;
        readonly proposeTo?: { readonly label: string; readonly onClick: () => void } | undefined;
      }
    | undefined;
  /**
   * The saved chart documents, by chart id: what names a tile when a filter
   * is scoped to it (AC-077), and what a filter re-queries (AC-078).
   */
  readonly documents?: Readonly<Record<string, ChartDocument>> | undefined;
  /**
   * Whether a field can reach a cube or view, from the model (AC-079). A tile
   * a filter cannot reach is left unfiltered and marked. Absent, every field
   * is taken to reach every chart.
   */
  readonly reach?: Reach | undefined;
  /**
   * The model as Cube describes it (`/v1/meta`): what a tile's marked items
   * can be drilled by — hierarchies, time, dimensions and join components
   * (T270, AC-237). Absent, Drill by offers nothing.
   */
  readonly model?: unknown;
  /**
   * The dimension that identifies a cube's rows, from the model (AC-092).
   * Rows are markable only where there is one; absent, no table marks.
   */
  readonly primaryKey?: ((cube: string) => string | undefined) | undefined;
  /** A field's title in the model, which names a filter in words (AC-043). */
  readonly memberTitle?: ((member: string) => string | undefined) | undefined;
  /**
   * Each member's number format from the Cube model (AC-046). Applied here,
   * after any chart edited from a tile has replaced its saved spec, so a
   * drafted tile is formatted like every other.
   */
  readonly formats?: MemberFormats | undefined;
  /** Each member's title from the model, for every chart's names (AC-220). */
  readonly titles?: Readonly<Record<string, string>> | undefined;
  /** And its short title, for a one-source chart's legend and KPI (T403). */
  readonly shortTitles?: Readonly<Record<string, string>> | undefined;
  /**
   * An edit has begun — an edit session, or the settings page opened in view
   * mode — for the page, which checks that edit's save against the version
   * the dashboard had at this moment (T198, AC-015).
   */
  readonly onEditStart?: (() => void) | undefined;
  /** An edit session discarded, and edit mode left with it (AC-204). */
  readonly onDiscard?: (() => void) | undefined;
  /**
   * The tile the URL names as open in the chart editor (T196, AC-002). A
   * reload, or the browser's Forward, that brings one in opens the editor on
   * its chart; one that goes — the browser's Back — closes the editor the way
   * its own Back does, keeping the change.
   */
  readonly editTile?: string | undefined;
  /**
   * Open in edit mode, once (T245): a new dashboard from Explore's New, which
   * the prototype opens ready to be built (recheck-shell-explore N15).
   */
  readonly startEditing?: boolean | undefined;
  /** Told once edit mode has been entered as asked, to forget the request. */
  readonly onStartedEditing?: (() => void) | undefined;
  /**
   * A tile to open asking for a folder, once (T463): a local chart page's
   * "Save to folders…", which lands here in edit mode as the tile's ⋯ "Save
   * to folders…" would leave it (AC-127, AC-205).
   */
  readonly publishTile?: string | undefined;
  /** Told once that ask is taken, or can't be, to forget it. */
  readonly onPublishTaken?: (() => void) | undefined;
  /**
   * The filter values the URL holds now (AC-081). The dashboard opens with
   * them; after that it holds its own, and puts them back in the URL whenever
   * the URL comes to say otherwise — a change made here, or a Back or Forward
   * onto an entry written before the last change.
   */
  readonly urlFilterValues?: FilterValues | undefined;
  /** Put these filter values in the URL (AC-081). */
  readonly onFilterValues?: ((values: FilterValues) => void) | undefined;
  /**
   * What a link with marks carries (T129, AC-123): its page tab, marks, the
   * filters "Filter to marked" made, and where each marking was marked from.
   * Taken as the dashboard opens — its filters come in `urlFilterValues` —
   * and then `onViewTaken` drops it from the URL.
   */
  readonly urlView?: ViewState | undefined;
  readonly onViewTaken?: (() => void) | undefined;
  /** Name a tile in the URL as the one open in the editor, or none. */
  readonly onEditTile?: ((tileId: string | undefined) => void) | undefined;
  /**
   * Saving the dashboard. Receives it with no chart drafts on it: drafts are
   * the session's, and a save sends the whole document (T032).
   */
  readonly onSave: (
    document: DashboardDocument,
    /**
     * Charts edited from the dashboard's tiles in this session, to be written
     * with it all-or-nothing (T192, AC-183). `chartWritesOf` picks the ones a
     * tile still shows; Save is held back while any of those cannot be
     * written (`whyUnsaveable`).
     */
    drafts?: DashboardDocument['chartDrafts'],
    /**
     * The save's outcome, when the caller has one: edit mode is left once it
     * resolves, and the session is kept, every change in it, if it rejects
     * (AC-184, T197).
     */
  ) => void | Promise<unknown>;
}

/**
 * Why a marking-limited tile is not showing its data.
 *
 * Two states, kept apart because their remedies are (direction.md: "If a
 * limiting marking isn't empty but its items are all filtered out, the tile
 * says so instead of showing the nothing-marked state"). `'waiting'` wants a
 * mark; `'filtered-out'` wants a filter changed, and someone told to go and
 * mark something that *is* marked would look for a bug.
 */
type LimitedState =
  | { readonly kind: 'waiting'; readonly state: NothingMarkedState; readonly message: string }
  | { readonly kind: 'filtered-out' };

/**
 * A chart the dashboard names that is gone, or cannot be read as stored — a
 * state, with its icon (T183, AC-177), and no Retry: asking again cannot
 * bring a deleted chart back (AC-042's review).
 */
function TileMissing() {
  return (
    <StateLine kind="warn" role="status" testId="tile-missing-chart">
      {CHART_MISSING}
    </StateLine>
  );
}

/**
 * A Markdown or Image element's head while editing: the prototype's
 * tile-head, naming the kind in xs muted (dashboard.js:319, :322). It is the
 * row the grip sits at the start of, so the grip never lies on the content
 * (T253's review, finding 7). View mode has none: the content is the tile.
 */
function KindHead({ kind, children }: { kind: string; children?: ReactNode }) {
  return (
    <div className="tile-head tile-head--kind">
      <span className="tile-head__kind">{kind}</span>
      {children}
    </div>
  );
}

/**
 * The marking a tile marks with when it names none (direction.md rule 44):
 * the dashboard's default, or its first marking where none is marked default.
 *
 * Derived from the document rather than held in a variable, so the memos that
 * need it depend on the document and nothing else — which is also what lets
 * React's compiler keep them memoized.
 */
function defaultMarkingOf(document: DashboardDocument): Marking | undefined {
  const all = markingsFrom(document.markings);
  return all.find((each) => each.isDefault) ?? all[0];
}

/**
 * The tiles a limited tile is waiting on: those that mark with the markings
 * limiting it (AC-110, direction.md rule 58).
 *
 * By name, deduplicated and in the dashboard's own order, because the message
 * reads them out — "Nothing is marked in Revenue by region or Orders" — and
 * the tile to go and click may be on a page tab the user has not opened.
 * A tile with no chart, and so no title, contributes nothing rather than an
 * empty name in the list.
 */
function masterTileNames(
  document: DashboardDocument,
  limitedBy: readonly string[],
  nameOf: (tileId: string) => string | undefined,
  /**
   * The dashboard's default marking, which a tile marks with when it names
   * none. Passed in rather than assumed absent: most tiles never touch the
   * setting, so a master found only by an explicit `marksWith` would be no
   * master at all, and the message would name nobody.
   */
  defaultMarkingId: string | undefined,
): string[] {
  const names = new Set<string>();
  for (const tile of chartTilesOf(document)) {
    const element = elementAt(document, tile.tileId);
    if (element === null || !isTile(element)) continue;
    // `''` is "(None)": a tile that marks with nothing is nobody's master.
    const marksWith = element.marksWith ?? defaultMarkingId;
    if (marksWith === undefined || marksWith === '' || !limitedBy.includes(marksWith)) continue;
    const name = nameOf(tile.tileId);
    if (name !== undefined) names.add(name);
  }
  return [...names];
}

/** A tile drilled (T270, AC-236): its chart, what by, and the drilled answer as it comes. */
interface Drill {
  readonly chartId: string;
  readonly option: DrillOption;
  readonly items: string;
  readonly markingName: string;
  /** The question it was asked under (`drillBasisOf`): another, and it no longer shows. */
  readonly key: string;
  readonly state:
    | { readonly kind: 'loading' }
    | { readonly kind: 'done'; readonly spec: RenderSpec; readonly answered?: AnswerMeta }
    | { readonly kind: 'failed'; readonly error: unknown };
}

/** A tile's spec with the item its keyboard is on, where it is on one (T306). */
/** Whether an element is among these, inside a section or a tab group too. */
function holds(items: readonly Element_[], id: string): boolean {
  return items.some(
    (element) =>
      element.id === id ||
      (isSection(element) && holds(element.items, id)) ||
      (isTabGroup(element) && element.tabs.some((tab) => holds(tab.items, id))),
  );
}

function withKeyboardItem(
  spec: RenderSpec | undefined,
  item: string | undefined,
): RenderSpec | undefined {
  return spec === undefined || item === undefined ? spec : { ...spec, keyboardFocus: item };
}

function TileBody({
  tile,
  spec,
  error,
  loading,
  busy = false,
  inEffect,
  editing = false,
  carried,
  title,
  answered,
  chartType = tile.chartType,
  canEditChart = false,
  onAddTarget,
  onItemClick,
  onShapeMark,
  onAxisRange,
  rangeStripes,
  onContextMenuAt,
  rowMarking,
  limited,
  onRetry,
  badge,
  tableView,
  onTableViewChange,
  memberTitle,
  notes,
  tokens,
  elements,
  rowsTotal,
}: {
  tile: Tile;
  /** A drafted box plot's rows in all, from its draft (T401's review, AC-315). */
  rowsTotal?: number | undefined;
  /** A text tile's live values, drawn for its tokens (T389, AC-116). */
  tokens?: TokenRender | undefined;
  /** A Text tile's live elements, drawn by their kinds (T884, AC-520). */
  elements?: ElementRender | undefined;
  /** What the tile says of its answer, drawn under its head (T253's review). */
  notes?: readonly ReactNode[] | undefined;
  /** A member's title from the model, for what the tile says of one (AC-220). */
  memberTitle?: ((member: string) => string | undefined) | undefined;
  /** The marked-items badge, for the chart's header row (AC-201). */
  badge?: ReactNode;
  /** Whether it shows its table, held above so its ⋯ menu can switch it (AC-199). */
  tableView?: boolean | undefined;
  onTableViewChange?: ((showing: boolean) => void) | undefined;
  /** Ask a failed chart again (AC-042): the tile's own "Refresh now". */
  onRetry?: (() => void) | undefined;
  /**
   * What a marking-limited tile shows instead of its chart (AC-109, AC-111),
   * or undefined when it shows its chart — including the `'all'`
   * nothing-marked state, which *is* the chart.
   */
  limited?: LimitedState | undefined;
  /** A click on its chart: cross-filtering it (AC-117) or marking it (AC-087). */
  onItemClick?: ((item: ClickedItem, toggle: boolean) => void) | undefined;
  /** A shape dragged over its chart, while it marks (AC-088, AC-089). */
  onShapeMark?: ChartTileProps['onShapeMark'];
  /** A drag along its x axis, in a marking's range mode (T386, AC-093). */
  onAxisRange?: ChartTileProps['onAxisRange'];
  /** Its marking's ranges, striped along its x axis (AC-093). */
  rangeStripes?: ChartTileProps['rangeStripes'];
  /** A right-click on its chart: its menu, at the pointer (T266, AC-246). */
  onContextMenuAt?: ChartTileProps['onContextMenuAt'];
  /** Marking its rows, where it draws a table (AC-092). */
  rowMarking?: ChartTileProps['rowMarking'];
  spec: RenderSpec | undefined;
  error: unknown;
  loading: boolean;
  /** The type the chart is made for: its document's, or the tile's without one. */
  chartType?: ChartType | undefined;
  /** The tile offers its pencil into the chart editor (T132). */
  canEditChart?: boolean;
  /** A bullet chart's + Target: its chart opened, where the tile can open it (T954). */
  onAddTarget?: (() => void) | undefined;
  /** A filtered answer is on its way (AC-078): what is drawn stays, marked busy. */
  busy?: boolean;
  /** The filters in effect on it, in words (AC-043). */
  inEffect?: readonly string[] | undefined;
  /** In edit mode, an image tile flags missing alternative text (AC-063). */
  editing?: boolean;
  /** The filter values in effect, which a link tile can pass on (AC-064). */
  carried?: readonly SearchFilter[] | undefined;
  /** A chart tile's heading: its chart's title (AC-187). */
  title?: string | undefined;
  /** What Cube said of its answer: when from, and from what (T154, T014). */
  answered?: AnswerMeta | undefined;
}) {
  // Previewed as a security context, a member it is not given is a state of
  // the context, not a failure of the chart (T173, AC-167).
  const preview = useContext(SecurityPreview);
  const hidden = preview === undefined ? undefined : hiddenMemberOf(error);
  /** A Text tile's text edited in place (T876, AC-302). */
  const textEditing = useContext(TextEditingContext);
  // Under the head where the state has one, and first where it has none.
  const noted = notes === undefined ? null : <div className="tile-notes">{notes}</div>;
  switch (tile.kind) {
    case 'chart':
      /**
       * Empty comes before loading, missing and broken, because a tile bound
       * to no chart is none of those: it is a chart the user has not filled in
       * yet, and it is the state a section template leaves behind (AC-068).
       * Left to fall through it showed a skeleton while anything else loaded
       * and then "This chart is no longer available" — telling someone the
       * tile they just added is gone.
       */
      /**
       * A chart of its own with no fields yet — a new tile's local chart
       * (T132) — is the same instruction, not a failure: what it needs, and
       * now that it has a chart, the way in.
       */
      if (tile.chartId === undefined || error === NOTHING_CHOSEN) {
        return (
          <>
            {/* Headed by its chart's title, as a drawn one is (T252, F13). */}
            {title === undefined || title.trim() === '' ? null : (
              <div className="tile-head">
                <h3 className="tile-head__title">{title}</h3>
              </div>
            )}
            {noted}
            <div data-testid="tile-empty-chart" className="tile-empty">
              {needsOf(chartType).map((sentence) => (
                <p key={sentence}>{sentence}</p>
              ))}
              {/* Its ✎ finishes it in either mode, as the prototype's "Use ✎
                  to finish it"; E on a selected tile is editing's (F13, T252's
                  review). */}
              {tile.chartId === undefined || !canEditChart ? null : (
                <p>
                  {editing === true
                    ? 'Add its fields in the chart editor: its ✎, or E when the tile is selected.'
                    : 'Add its fields in the chart editor: its ✎.'}
                </p>
              )}
            </div>
          </>
        );
      }
      /**
       * Before loading, missing and broken, and before the chart: a tile
       * waiting on a mark has nothing to load, and one whose marked items the
       * filters exclude has an answer — an empty one — that would otherwise
       * draw as an empty chart with no explanation.
       *
       * `'all'` never reaches here: the dashboard leaves `limited` undefined
       * for it, because "All data" means the tile draws normally.
       */
      if (limited !== undefined) {
        if (limited.kind === 'filtered-out')
          return (
            <>
              {noted}
              <StateLine kind="idle" role="status" testId="marks-filtered-out">
                The marked items are hidden by the filters in effect.
              </StateLine>
            </>
          );
        return (
          <>
            {noted}
            <NothingMarked state={limited.state} message={limited.message} />
          </>
        );
      }
      if (hidden !== undefined)
        return (
          <>
            {noted}
            <TileUnavailable member={hidden} title={memberTitle?.(hidden)} />
          </>
        );
      // Gone, not failed: the missing-chart state, with nothing to retry.
      if (error === CHART_MISSING)
        return (
          <>
            {noted}
            <TileMissing />
          </>
        );
      if (error !== undefined)
        return (
          <>
            {/* The tile keeps its title while in error, so the reader knows
                which chart failed without guessing from its position. */}
            {title === undefined || title.trim() === '' ? null : (
              <div className="tile-head">
                <h3 className="tile-head__title">{title}</h3>
              </div>
            )}
            {noted}
            <TileError
              error={error}
              // A chart with no type fails the same way however often it is
              // asked; Retry is for a load that might go differently.
              {...(onRetry === undefined || error === CHART_UNTYPED ? {} : { onRetry })}
            />
          </>
        );
      /**
       * Loading, absent and broken are three states, not two. Collapsing the
       * first into the second made "this chart is no longer available" the
       * normal appearance of a healthy dashboard for as long as its queries
       * took — the missing-chart state showing on charts that were perfectly
       * fine (AC-042, AC-010).
       */
      if (loading)
        return (
          <>
            {noted}
            <TileSkeleton chartType="bar" />
          </>
        );
      return spec === undefined ? (
        <>
          {noted}
          <TileMissing />
        </>
      ) : (
        <ChartTile
          spec={spec}
          notes={noted}
          busy={busy}
          inEffect={inEffect}
          title={title}
          asOf={answered?.lastRefreshTime}
          served={answered}
          // A drafted chart's from its draft, whose answer is not otherwise known (T401's review).
          rowsTotal={answered?.total ?? rowsTotal}
          badge={badge}
          // While editing, its kind where the freshness badge and Table view are (T468, UX-032).
          kind={editing === true ? `Chart · ${CHART_TYPE_NAMES[spec.chartType]}` : undefined}
          {...(tableView === undefined ? {} : { tableView })}
          {...(onTableViewChange === undefined ? {} : { onTableViewChange })}
          // Its table is ⋯'s "View as table", not a button in its head (T681's
          // follow-up; R76 dashboard-Q1; design 04 pin 5).
          tableToggle={false}
          {...(tile.h === undefined ? {} : { height: tile.h * ROW_UNIT_PX })}
          {...(onItemClick === undefined ? {} : { onItemClick })}
          {...(onShapeMark === undefined ? {} : { onShapeMark })}
          {...(onAxisRange === undefined ? {} : { onAxisRange })}
          {...(rangeStripes === undefined ? {} : { rangeStripes })}
          {...(onContextMenuAt === undefined ? {} : { onContextMenuAt })}
          {...(rowMarking === undefined ? {} : { rowMarking })}
          {...(onAddTarget === undefined ? {} : { onAddTarget })}
        />
      );
    case 'markdown':
    case 'text': {
      // The Text tile (F45): its document through the static renderer, never
      // as HTML (AC-208, AC-513); empty, a placeholder in edit mode and
      // nothing in view mode (design 21 G6). A markdown tile is read as the
      // Text tile it now is (T875, AC-512): `dashboardOf` converts each one
      // on open, so this reads only one that never went through it.
      const document = (tile.kind === 'text' ? tile : (readAsText(tile) as Tile)).document;
      const count = elementCountOf(document);
      const drawn = (
        <TextTile
          document={document ?? emptyTextDocument()}
          // Its Value and Marking elements as the markdown tile's tokens
          // were drawn: the markings and measures (T389, AC-116).
          renderElement={(node, key) => {
            // Its kind's own drawing (T884–T886), else as its token was drawn.
            const drawnByKind = elements?.(node, key);
            if (drawnByKind !== undefined) return drawnByKind;
            const token = tokenOfElement(node);
            return token === undefined ? null : tokens?.(token, key);
          }}
        />
      );
      /**
       * Its text editable in place (T876, AC-302): the editor while it is
       * this tile's, the tile as drawn while the editor's chunk loads.
       */
      const inPlace = editing && textEditing !== undefined && textEditing.tileId === tile.id;
      return (
        <>
          {editing ? (
            <KindHead kind="Text">
              {/* While its text is edited, the count is the toolbar's (T878). */}
              {count > 0 && !inPlace ? (
                // Over the limit, a converted tile says so (decision T875-1).
                <span
                  className="text-tile__count"
                  data-testid="text-element-count"
                  data-state={count > TEXT_ELEMENT_LIMIT ? 'warning' : 'normal'}
                >
                  {`${String(count)} / ${String(TEXT_ELEMENT_LIMIT)} elements`}
                </span>
              ) : null}
            </KindHead>
          ) : null}
          {/* Double-clicked in edit mode, its text becomes editable (AC-302);
              the keyboard's way in is Properties' first control. */}
          <div
            className="text-tile-host"
            onDoubleClick={
              editing && !inPlace && textEditing !== undefined
                ? () => {
                    textEditing.start(tile.id);
                  }
                : undefined
            }
          >
            {inPlace ? (
              <Suspense fallback={drawn}>
                <LazyTextEditor
                  document={document ?? emptyTextDocument()}
                  name={textEditing.nameOf(tile.id)}
                  sources={textEditing.sources}
                  copilot={textEditing.copilot}
                  selectElement={textEditing.selectElement}
                  changeElement={textEditing.changeElement}
                  onElements={(elements, selected) => {
                    textEditing.onElements?.(tile.id, elements, selected);
                  }}
                  onLeave={(next, how) => {
                    textEditing.leave(tile.id, next, how);
                  }}
                />
              </Suspense>
            ) : editing && isEmptyTextDocument(document) ? (
              <p className="text-tile text-tile--empty">Type, or press / to insert a live value</p>
            ) : (
              drawn
            )}
          </div>
        </>
      );
    }
    case 'header':
      return <h3 className="dashboard-heading">{tile.text}</h3>;
    case 'divider':
      return <hr className="dashboard-divider" />;
    case 'image':
      return (
        <>
          {editing ? <KindHead kind="Image" /> : null}
          <ImageTile tile={tile} editing={editing} />
        </>
      );
    case 'link':
      return <LinkTile tile={tile} editing={editing} carried={carried} />;
    default:
      // A filter tile, from before filters went to the filter bar (AC-058).
      // Still rendered, because AC-018 fails when a saved tile is missing.
      return <p data-testid={`tile-${tile.kind}`}>{tile.text ?? ''}</p>;
  }
}

/**
 * A run of elements, laid out on the grid.
 *
 * Sections and tab groups break the run: each is a container with its own
 * canvas, which is what makes the nested grammar in direction.md work as CSS
 * grid flow rather than as absolute coordinates.
 */
interface TileCharts {
  readonly specs: Readonly<Record<string, RenderSpec>>;
  readonly errors: Readonly<Record<string, unknown>>;
  readonly loading: boolean;
  /** Charts a filter has just reached, whose filtered answer is not yet in (AC-078). */
  readonly pending?: ReadonlySet<string>;
  /** Charts in a filter's scope that cannot reach its field (AC-079), with those filters. */
  readonly notCovered?: Readonly<Record<string, readonly ActiveFilter[]>>;
  /** Each filtered chart's filters, in words, for its empty state (AC-043). */
  readonly inEffect?: Readonly<Record<string, readonly string[]>>;
  /** The filter values set, as a dashboard's URL carries them — for link tiles (AC-064). */
  readonly carried?: readonly SearchFilter[] | undefined;
  /** A chart's title, which heads its tile (AC-187). */
  readonly titleOf?: ((chartId: string) => string | undefined) | undefined;
  /** A member's title from the model, for what a tile says of one (AC-220). */
  readonly memberTitle?: ((member: string) => string | undefined) | undefined;
  /** A chart's own type, from its document (T132). */
  readonly typeOf?: ((chartId: string) => ChartType | undefined) | undefined;
  /**
   * Whether a chart's document is in hand (T251's review): a failed tile's
   * menu reads its query and its editor from it, so without one there is no
   * menu to offer.
   */
  readonly documented?: ((chartId: string) => boolean) | undefined;
  /** What Cube said of each chart's answer (T154, T014). */
  readonly answered?: Readonly<Record<string, AnswerMeta>> | undefined;
  /** Charts refreshed this session, whose answer may have come from a pre-aggregation (T154). */
  readonly refreshedFromRollup?: ReadonlySet<string> | undefined;
  readonly onDismissRollupNote?: ((chartId: string) => void) | undefined;
  /** Ask a chart's data again, past Cube's cache; in view mode. */
  readonly onRefresh?: ((chartId: string) => void) | undefined;
  readonly refreshing?: ReadonlySet<string> | undefined;
  readonly refreshable?: boolean | undefined;
  /** A chart's query's returned rows and full count, asked of Cube with `total` (T178). */
  readonly countRows?:
    | ((
        chartId: string,
        signal: AbortSignal,
      ) => Promise<{ returned: number; total: number } | undefined>)
    | undefined;
  /** Show a chart's SQL as the previewed security context (T174); only while previewing. */
  readonly onShowSql?: ((chartId: string, tileId: string) => void) | undefined;
  /**
   * A click on a tile's chart, while the dashboard cross-filters (AC-117).
   * Absent in Markings mode and while editing, where a click selects the tile.
   */
  readonly onItemClick?: ((tileId: string, chartId: string, item: ClickedItem) => void) | undefined;
  /**
   * A click on a tile's chart while the dashboard is in Markings mode
   * (AC-087): the modifier says whether it replaces the marking or toggles
   * one item.
   */
  readonly onMarkClick?:
    ((tileId: string, chartId: string, item: ClickedItem, toggle: boolean) => void) | undefined;
  /**
   * A rectangle or lasso dragged over a tile's chart in Markings mode
   * (AC-088): the items it touched, and whether Ctrl or ⌘ was held (AC-089).
   */
  readonly onMarkShape?:
    | ((tileId: string, chartId: string, items: readonly ClickedItem[], toggle: boolean) => void)
    | undefined;
  /**
   * Whether a shape dragged over this tile can mark anything: a chart on
   * axes, marking with a marking. A pie, a treemap, a KPI, a table or a
   * pivot, and a tile set to "(None)", draw no rubber band that would mark
   * nothing (T190 stage 7's review, `dragOverlay.ts`'s own failing state).
   */
  readonly marksShapes?: ((tileId: string, chartId: string) => boolean) | undefined;
  /**
   * A drag along a tile's x axis, where its marking is in range mode and the
   * axis is a time dimension's buckets (T386, AC-093): the buckets under its
   * ends, and whether Ctrl or ⌘ was held. `rangeMarks` says which tiles take it.
   */
  readonly onMarkRange?:
    | ((tileId: string, chartId: string, range: { from: string; to: string }, add: boolean) => void)
    | undefined;
  readonly rangeMarks?: ((tileId: string, chartId: string) => boolean) | undefined;
  /** The marked ranges to stripe along a tile's x axis (AC-093). */
  readonly rangeStripesOn?:
    | ((
        tileId: string,
        chartId: string,
      ) => readonly { from: string | number; to: string | number; slot: MarkingSlot }[] | undefined)
    | undefined;
  /**
   * Open a tile's menu (T266, AC-246): at the pointer of a right-click on
   * its chart, or — from Shift+F10 or the Menu key — at the tile.
   */
  readonly onTileMenu?: ((tileId: string, at?: { x: number; y: number }) => void) | undefined;
  /** The latest request to open this tile's menu, for its menu to answer. */
  readonly menuRequestOn?:
    ((tileId: string) => { seq: number; at?: { x: number; y: number } } | undefined) | undefined;
  /**
   * Marking a table tile's rows (AC-092): the marking it shows, the key that
   * identifies its rows, and where a row click goes.
   */
  readonly rowMarkingOn?:
    ((tileId: string, chartId: string) => ChartTileProps['rowMarking']) | undefined;
  /** Why a tile is not marked: its cube cannot reach the marking's members (AC-103). */
  readonly notLinked?: Readonly<Record<string, string>> | undefined;
  /** The item a tile's keyboard is on, while the tile has the keyboard (T306, AC-176). */
  readonly keyboardFocusOn?: ((tileId: string) => string | undefined) | undefined;
  /**
   * A tile's series and panels for its menu's "Mark series ›" and "Mark
   * panel ›", or "Filter by…" in cross-filter mode (T631, R63).
   */
  readonly partsOn?: ((tileId: string) => ComponentProps<typeof TileViewMenu>['parts']) | undefined;
  /**
   * Why a marking-limited tile is showing something other than its chart
   * (AC-109, AC-111), by chart. A limited tile that has data to show is not
   * here — it draws its limited answer like any other chart.
   */
  readonly limitedStates?: Readonly<Record<string, LimitedState>> | undefined;
  /** A text tile's tokens, drawn as the markings' state and the measures' values (T389, AC-116). */
  readonly textTokensOf?: ((tileId: string) => TokenRender) | undefined;
  /**
   * A Text tile's live elements drawn as their kinds draw them (T884,
   * AC-520, AC-116), or undefined for a kind still drawn as its token.
   */
  readonly textElementsOf?: ((tileId: string) => ElementRender) | undefined;
  /** Each drafted chart's rows in all, where its query asked (T401's review, AC-315). */
  readonly draftTotals?: Readonly<Record<string, number>> | undefined;
  /** The marking a tile shows, its colour and how many items it holds (AC-098). */
  readonly markingOn?:
    | ((tileId: string) =>
        | {
            marking: Marking;
            colour: string;
            markedCount: number;
            /** Whose share the tile shows, where it only shows a share (T935, AC-098). */
            shareShown?: string;
            /** What it holds, by the members' titles, for the menu's heading (AC-247). */
            values?: string;
            /**
             * How many of the tile's own items it marks, of how many (AC-247):
             * asked when the menu opens, as it reads every item.
             */
            onTile?: () => { readonly marked: number; readonly of: number } | undefined;
            /** Its items' values as tab-separated text, for Copy › Marked values (AC-241). */
            valuesTsv?: () => string;
          }
        | undefined)
    | undefined;
  /** Unmark what a tile marks with — its ⋯ menu's marked-rows group (AC-199). */
  readonly onUnmark?: ((tileId: string) => void) | undefined;
  /**
   * Invert marking or Mark all on a tile's own items (AC-115), from the same
   * group — for a tile with items to name, and absent for one without.
   */
  readonly markItemsOn?:
    ((tileId: string) => ((how: 'invert' | 'all') => void) | undefined) | undefined;
  /**
   * "Mark range…" for a tile whose marking marks ranges along its axis (T636;
   * R66): opens the dialog asking the range's ends; absent elsewhere.
   */
  readonly markRangeOn?:
    ((tileId: string, chartId: string) => (() => void) | undefined) | undefined;
  /**
   * Filter to marked, or out (AC-113), from the same group: the action, or
   * why the tile's marking cannot become a filter.
   */
  readonly filterMarkedOn?:
    | ((tileId: string, negate: boolean) => (() => void) | { readonly refused: string } | undefined)
    | undefined;
  /** The query a tile's chart asks, and its SQL (AC-199's View query). */
  readonly onViewQuery?: ((chartId: string, tileId: string) => void) | undefined;
  /** A tile's Data as of submenu (T273, AC-245), read when its menu opens. */
  readonly dataAsOfOf?:
    | ((
        chartId: string,
        tileId: string,
      ) => () => DataAsOfSaid | undefined)
    | undefined;
  /** Copy › To dashboard (T271, AC-243): the dialog that picks one. */
  readonly onCopyToDashboard?: ((chartId: string, tileId: string) => void) | undefined;
  /**
   * The rows behind a tile (T120, AC-114; T268, AC-239): behind its marked
   * items, or behind the whole of it.
   */
  readonly onViewRows?: ((chartId: string, tileId: string, marked: boolean) => void) | undefined;
  /**
   * The details panel (T269, AC-240): those rows pinned open under the
   * dashboard, following the marking — whether it's on for this tile, and
   * its switch in the tile's menu.
   */
  readonly detailsPanelOf?:
    | ((
        chartId: string,
        tileId: string,
      ) => { readonly on: boolean; readonly onToggle: () => void } | undefined)
    | undefined;
  /**
   * Drill by (T270, AC-236, AC-237): what a tile's marked items can be
   * regrouped by, asked when its menu opens, and the tile drilled in place.
   */
  readonly drillByOf?:
    | ((
        chartId: string,
        tileId: string,
        items: string,
        markingName: string,
      ) =>
        | {
            readonly items: string;
            readonly options: () => readonly DrillOption[];
            readonly onDrill: (option: DrillOption) => void;
          }
        | undefined)
    | undefined;
  /** A tile drilled (AC-236), shown in place of its chart until Back. */
  readonly drilledOf?: ((tileId: string) => DrilledView | undefined) | undefined;
  /**
   * The marked rows as CSV, for Export › Marked rows CSV (T272, AC-244): the
   * rows View marked rows shows, read up to Cube's row limit and written as
   * its download writes them.
   */
  readonly exportRowsOf?:
    | ((
        chartId: string,
        tileId: string,
      ) => (
        signal: AbortSignal,
      ) => Promise<{ text: string; written: number; total: number | undefined }>)
    | undefined;
}

interface Affordances {
  readonly editing: boolean;
  readonly charts: TileCharts;
  /**
   * Which chart tiles show their table, held here rather than in each tile so
   * the tile's ⋯ menu can switch it too (AC-199).
   */
  readonly tableViews?:
    | { readonly showing: ReadonlySet<string>; readonly set: (tileId: string, on: boolean) => void }
    | undefined;
  /** Which sections are collapsed (AC-202): view state, in both modes. */
  readonly sections?:
    { readonly collapsed: ReadonlySet<string>; readonly toggle: (id: string) => void } | undefined;
  readonly onResize?: ((id: string, size: { w: number; h: number }) => void) | undefined;
  readonly drag?: CanvasProps['drag'];
  /** What a key does to the focused tile (AC-057). */
  readonly onTileKeyDown?: CanvasProps['onTileKeyDown'];
  readonly takesKeys?: CanvasProps['takesKeys'];
  readonly onTileContextMenu?: CanvasProps['onTileContextMenu'];
  readonly describeItem?: CanvasProps['describeItem'];
  readonly selection?: CanvasProps['selection'];
  readonly addHere?: CanvasProps['addHere'];
  /** A tile's name, as the reader knows it (AC-209): its title, never its id. */
  readonly nameOf?: ((id: string) => string) | undefined;
  /**
   * What outlines a chart's tiles, by the chart: the dependency hovered over
   * or focused in the Export pane (T511, AC-360). Nothing where none is.
   */
  readonly outlinedBy?: ((chartId: string) => string | undefined) | undefined;
  /** Deleting an element from its ⋯ menu, with an undo (AC-060). */
  readonly onDelete?: ((id: string) => void) | undefined;
  /** Duplicating a chart tile from its ⋯ menu, the copy with a chart of its own (AC-062). */
  readonly onDuplicate?: ((id: string) => void) | undefined;
  /**
   * "Create details tile" from a tile's marked-rows group (AC-112): a tile
   * beside it, limited by its marking — the dashboard put into edit mode to
   * hold it, as the prototype's does.
   */
  readonly onCreateDetails?: ((tileId: string) => void) | undefined;
  /**
   * A chart tile's ownership action in its ⋯ menu (AC-205): "Save to
   * folders…" for a chart of this dashboard's, "Make a local copy" for a
   * shared one; none for a tile with no chart.
   */
  readonly ownershipOf?:
    | ((tileId: string) => { readonly label: string; readonly run: () => void } | undefined)
    | undefined;
  /** Opening a chart tile's chart in the editor, from its pencil (T032). */
  readonly onEditChart?: ((tileId: string, chartId: string) => void) | undefined;
  /** Deleting one tab of a tab group, the fourth thing AC-060 names. */
  readonly onDeleteTab?: ((groupId: string, tabId: string) => void) | undefined;
  /**
   * Moving a tile without dragging it. WCAG SC 2.5.7 forbids a drag-only
   * path, and `docs/research/dashboard-grid.md` makes this a condition of
   * building the drag in-house rather than taking a library.
   */
  readonly moveTo?:
    | {
        readonly containers: readonly { key: string; title: string }[];
        readonly onMove: (tileId: string, to: string) => void;
      }
    | undefined;
}

/**
 * One container's items, on one canvas.
 *
 * Every item goes on the same grid — a section and a tab group are grid items
 * spanning their own columns, exactly as a tile is. The first version grouped
 * runs of tiles into separate canvases and rendered sections between them,
 * which looked identical and could not support AC-056: a drop has to name the
 * container it landed in, and one page would have produced several canvases
 * all claiming to be that page.
 */
function Elements({
  items,
  containerKey,
  affordances,
}: {
  items: readonly Element_[];
  containerKey: string;
  affordances: Affordances;
}) {
  const { editing, charts, onResize, drag } = affordances;
  /** A chart with no fields or no type yet (T404): nothing drawn, and nothing failed. */
  const unbuilt = (chartId: string) =>
    charts.specs[chartId] === undefined &&
    (charts.errors[chartId] === NOTHING_CHOSEN || charts.errors[chartId] === CHART_UNTYPED);
  /**
   * One with no fields yet: no query at all, so nothing to view, list or
   * mark. An untyped chart has its query, and keeps them (T404's review).
   */
  const fieldless = (chartId: string) =>
    charts.specs[chartId] === undefined && charts.errors[chartId] === NOTHING_CHOSEN;
  /** A chart that is gone (T404: its menu still opens, saying so). */
  const gone = (chartId: string) =>
    charts.specs[chartId] === undefined && charts.errors[chartId] === CHART_MISSING;
  /** A chart still waiting for its first answer. */
  const waiting = (chartId: string) =>
    charts.specs[chartId] === undefined && charts.errors[chartId] === undefined;
  /** Its document in hand: what its query, its copy and its rows are read from (T251's review). */
  const documented = (chartId: string) => !gone(chartId) && charts.documented?.(chartId) === true;

  return (
    <Canvas
      tiles={items.map((element) =>
        isSection(element) || isTabGroup(element)
          ? { id: element.id, w: isTabGroup(element) ? element.w : COLUMNS }
          : element,
      )}
      editing={editing}
      containerKey={containerKey}
      drag={drag}
      onResize={onResize}
      onTileKeyDown={affordances.onTileKeyDown}
      takesKeys={affordances.takesKeys}
      onTileContextMenu={affordances.onTileContextMenu}
      describeItem={affordances.describeItem}
      selection={affordances.selection}
      addHere={affordances.addHere}
      nameOf={affordances.nameOf}
      outlineOf={
        affordances.outlinedBy === undefined
          ? undefined
          : (id) => {
              const element = items.find((candidate) => candidate.id === id);
              return element !== undefined && isTile(element) && element.chartId !== undefined
                ? affordances.outlinedBy?.(element.chartId)
                : undefined;
            }
      }
    >
      {(item) => {
        const element = items.find((candidate) => candidate.id === item.id);
        if (element === undefined) return null;

        if (isSection(element)) {
          /**
           * The prototype's band (AC-202): a header with its collapse
           * control, its title and how many items it holds, collapsible in
           * view and edit mode alike. Named by its title, not its id.
           */
          const collapsed = affordances.sections?.collapsed.has(element.id) === true;
          const count = element.items.length;
          return (
            <section
              className="dashboard-section"
              data-section={element.id}
              aria-labelledby={`${element.id}-title`}
            >
              <div className="dashboard-section__head">
                <button
                  type="button"
                  className="dashboard-section__toggle"
                  aria-expanded={!collapsed}
                  aria-controls={`${element.id}-body`}
                  aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${element.title}`}
                  onClick={() => {
                    affordances.sections?.toggle(element.id);
                  }}
                >
                  <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                </button>
                <h2 id={`${element.id}-title`}>{element.title}</h2>
                <span className="dashboard-section__count">
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
                {affordances.onDelete === undefined ? null : (
                  // A section is a container, so the Delete key does not reach
                  // it — but AC-060 names sections among the things that can be
                  // deleted, so the menu does.
                  <MoveToMenu
                    tileId={element.id}
                    tileLabel={element.title}
                    containers={[]}
                    currentKey=""
                    onMove={() => undefined}
                    onDelete={() => {
                      affordances.onDelete?.(element.id);
                    }}
                  />
                )}
              </div>
              <div id={`${element.id}-body`} hidden={collapsed}>
                <Elements
                  items={element.items}
                  containerKey={sectionKey(element.id)}
                  affordances={affordances}
                />
              </div>
            </section>
          );
        }
        if (isTabGroup(element)) {
          return <TabGroupView group={element} affordances={affordances} />;
        }

        const chartId = element.chartId ?? '';
        // Drilled (T270, AC-236): its marked items regrouped, in place of its chart.
        const drill = charts.drilledOf?.(element.id);
        return (
          <>
            {/**
              The pointer route into the chart editor (T032; direction.md §2:
              "A tile's ✎ pencil opens the chart editor as a full-viewport
              overlay"). Until now E on a focused tile in edit mode was the
              only way in. Only on a tile bound to a chart: an empty one has
              nothing to open.
            */}
            {element.kind !== 'chart' ||
            element.chartId === undefined ||
            affordances.onEditChart === undefined ? null : (
              <button
                type="button"
                className="tile-pencil"
                data-testid={`edit-chart-${element.id}`}
                // What focus returns to when the editor closes. Its own
                // attribute, not the test id: a build that stripped test ids
                // would otherwise lose focus return without a sound.
                data-edit-chart={element.id}
                /**
                 * Named for its tile as the tile's ⋯ menu is, by the chart's
                 * title (AC-209).
                 */
                aria-label={`Edit ${affordances.nameOf?.(element.id) ?? element.text ?? element.kind}`}
                onClick={() => {
                  affordances.onEditChart?.(element.id, chartId);
                }}
              >
                ✎
              </button>
            )}
            {/* Asking a chart again (T154, AC-148): for reading a dashboard,
                so in view mode; editing one has its own drafts. */}
            {element.kind !== 'chart' ||
            element.chartId === undefined ||
            affordances.editing ||
            affordances.charts.onRefresh === undefined ? null : (
              <button
                type="button"
                className="tile-refresh"
                aria-label={`Refresh ${charts.titleOf?.(chartId) ?? element.text ?? element.kind}`}
                title="Refresh now: ask Cube again, past its cache"
                // Not while this chart or the dashboard's charts are being
                // asked: an answer landing after the refresh would undo it.
                disabled={
                  affordances.charts.refreshable === false ||
                  affordances.charts.refreshing?.has(chartId) === true ||
                  affordances.charts.pending?.has(chartId) === true
                }
                onClick={() => {
                  affordances.charts.onRefresh?.(chartId);
                }}
              >
                ↻
              </button>
            )}
            {/* The chart's SQL as the previewed context (T174, AC-168). */}
            {element.kind !== 'chart' ||
            element.chartId === undefined ||
            affordances.charts.onShowSql === undefined ? null : (
              <button
                type="button"
                className="tile-refresh tile-sql"
                // The tile, not the chart: one chart can be on two tiles, and
                // focus goes back to the one it was opened from.
                data-show-sql={element.id}
                aria-label={`SQL for ${charts.titleOf?.(chartId) ?? element.text ?? element.kind} as this context`}
                title="The SQL Cube runs for this chart as the previewed context"
                onClick={() => {
                  affordances.charts.onShowSql?.(chartId, element.id);
                }}
              >
                SQL
              </button>
            )}
            {/* The ⋯ menu in view mode (T177, AC-171): the prototype's
                "Download CSV", for a chart with something drawn — and for
                one whose load failed, which keeps its menu to view its query
                and edit it (T251; recheck-dashboard F10). And for one with no
                fields or no type yet, whose menu Shift+F10 and the Menu key
                open too (T404, AC-246): Edit chart, with nothing to export
                and no query to view. And, as the user ruled for T404, on
                every other chart tile too: one still waiting for its first
                answer, one whose document couldn't be read, one that is
                gone. Each offers what it has: Edit chart where there is a
                chart to edit, its query only with its document in hand
                (T251's review), and every other item refused with its
                reason, never a failure's where nothing failed. */}
            {affordances.editing ||
            element.kind !== 'chart' ||
            element.chartId === undefined ? null : (
              <TileViewMenu
                tileId={element.id}
                title={charts.titleOf?.(chartId) ?? element.text ?? 'chart'}
                // What is drawn: a drilled tile's drill, for its CSV and images (T270's review).
                spec={drill === undefined ? charts.specs[chartId] : drill.spec}
                // Not while a newer answer is on its way, as for Refresh.
                asking={
                  charts.pending?.has(chartId) === true ||
                  charts.refreshing?.has(chartId) === true ||
                  charts.refreshable === false
                }
                // Whether Cube cut a download short (T178, AC-172).
                countRows={
                  charts.countRows === undefined
                    ? undefined
                    : (signal) => charts.countRows?.(chartId, signal) ?? Promise.resolve(undefined)
                }
                // The prototype's items (AC-199): its table, its query, its
                // editor — and, in Markings mode, its marking's group.
                tableView={affordances.tableViews?.showing.has(element.id) === true}
                onTableView={
                  // Only where the tile draws rows it could show as a table:
                  // not a table already, nor an empty answer, nor a limited
                  // tile showing its waiting state (T219's review).
                  charts.specs[chartId]?.chartType === 'table' ||
                  (charts.specs[chartId]?.rows.length ?? 0) === 0 ||
                  charts.limitedStates?.[chartId] !== undefined
                    ? undefined
                    : (showing) => {
                        affordances.tableViews?.set(element.id, showing);
                      }
                }
                onViewQuery={
                  // A chart with no fields yet has no query to view, and one
                  // gone or unread has no document to read it from.
                  charts.onViewQuery === undefined || fieldless(chartId) || !documented(chartId)
                    ? undefined
                    : () => {
                        charts.onViewQuery?.(chartId, element.id);
                      }
                }
                dataAsOf={charts.dataAsOfOf?.(chartId, element.id)}
                undrawn={
                  unbuilt(chartId)
                    ? `${String(charts.errors[chartId]).replace(/\.$/, '')}, so nothing is drawn to copy or export.`
                    : gone(chartId)
                      ? 'This chart is no longer available, so nothing is drawn to copy or export.'
                      : waiting(chartId)
                        ? 'Its first answer is still on its way, so nothing is drawn to copy or export yet.'
                        : // A limited tile waiting shows its message, not its chart.
                          charts.limitedStates?.[chartId] === undefined
                          ? undefined
                          : 'Nothing is marked yet, so the tile draws no chart.'
                }
                onCopyToDashboard={
                  charts.onCopyToDashboard === undefined || !documented(chartId)
                    ? undefined
                    : () => {
                        charts.onCopyToDashboard?.(chartId, element.id);
                      }
                }
                onEditChart={
                  // Not for a chart that is gone: there is nothing to edit.
                  affordances.onEditChart === undefined || gone(chartId)
                    ? undefined
                    : () => {
                        affordances.onEditChart?.(element.id, chartId);
                      }
                }
                onViewRows={
                  // Not on a limited tile showing its waiting state, whose
                  // rows are none of these (T120's review), as View as table;
                  // nor on a chart with no fields yet, which has none, nor
                  // one gone or unread (T404).
                  charts.onViewRows === undefined ||
                  charts.limitedStates?.[chartId] !== undefined ||
                  fieldless(chartId) ||
                  !documented(chartId)
                    ? undefined
                    : () => {
                        charts.onViewRows?.(chartId, element.id, false);
                      }
                }
                openAt={charts.menuRequestOn?.(element.id)}
                // A series or a panel, from the keyboard (T631, R63).
                parts={charts.partsOn?.(element.id)}
                marked={(() => {
                  const shown = charts.markingOn?.(element.id);
                  const markItems = charts.markItemsOn?.(element.id);
                  // No marked rows to view, export or drill for a chart with
                  // no fields yet, or one gone or unread: no query to ask
                  // (T404's review).
                  return shown === undefined ||
                    charts.onUnmark === undefined ||
                    fieldless(chartId) ||
                    !documented(chartId)
                    ? undefined
                    : {
                        name: shown.marking.name,
                        // Its swatch in the menu's heading (T682; design 08, pin 5).
                        colour: shown.colour,
                        // The marking's own, which its actions go by; the
                        // tile's "n of N" is `onTile` (T267's review).
                        count: shown.markedCount,
                        onTile: shown.onTile,
                        values: shown.values,
                        onUnmark: () => {
                          charts.onUnmark?.(element.id);
                        },
                        filterTo: charts.filterMarkedOn?.(element.id, false),
                        filterOut: charts.filterMarkedOn?.(element.id, true),
                        ...(charts.onViewRows === undefined
                          ? {}
                          : {
                              onViewMarkedRows: () => {
                                charts.onViewRows?.(chartId, element.id, true);
                              },
                            }),
                        detailsPanel: charts.detailsPanelOf?.(chartId, element.id),
                        drillBy: charts.drillByOf?.(
                          chartId,
                          element.id,
                          shown.values ?? '',
                          shown.marking.name,
                        ),
                        ...(charts.exportRowsOf === undefined
                          ? {}
                          : { exportRows: charts.exportRowsOf(chartId, element.id) }),
                        ...(shown.valuesTsv === undefined ? {} : { valuesTsv: shown.valuesTsv }),
                        ...(markItems === undefined
                          ? {}
                          : {
                              onInvert: () => {
                                markItems('invert');
                              },
                              onMarkAll: () => {
                                markItems('all');
                              },
                            }),
                        // A range from the keyboard (T636; R66).
                        onMarkRange: charts.markRangeOn?.(element.id, chartId),
                        ...(affordances.onCreateDetails === undefined
                          ? {}
                          : {
                              onCreateDetails: () => {
                                affordances.onCreateDetails?.(element.id);
                              },
                            }),
                      };
                })()}
              />
            )}
            {affordances.moveTo === undefined ? null : (
              <MoveToMenu
                tileId={element.id}
                // By its title, as the tile itself is named (AC-209).
                tileLabel={affordances.nameOf?.(element.id) ?? element.text ?? element.kind}
                containers={affordances.moveTo.containers}
                currentKey={containerKey}
                onMove={(to: string) => {
                  affordances.moveTo?.onMove(element.id, to);
                }}
                {...(affordances.onDelete === undefined
                  ? {}
                  : {
                      onDelete: () => {
                        affordances.onDelete?.(element.id);
                      },
                    })}
                {...(affordances.onDuplicate === undefined ||
                // Every tile (AC-205); a chart tile only where there is a
                // chart to copy: not while it loads, nor for one that is gone
                // (T068's review).
                (element.kind === 'chart' &&
                  (element.chartId === undefined ||
                    charts.titleOf?.(element.chartId) === undefined))
                  ? {}
                  : {
                      onDuplicate: () => {
                        affordances.onDuplicate?.(element.id);
                      },
                    })}
                ownership={affordances.ownershipOf?.(element.id)}
              />
            )}
            <TileBody
              tile={element}
              /**
               * What the tile says of its answer, under its head: the head
               * stays the tile's first row, where the grip sits while editing
               * (T253's review, finding 6). Above it, the grip covered a note.
               */
              notes={(() => {
                const said = [
                  drill === undefined ? null : <DrillCrumb key="drill" view={drill} />,
                  charts.notCovered?.[chartId] === undefined ? null : (
                    <NotCovered
                      key="not-covered"
                      members={charts.notCovered[chartId].map((each) => each.filter.member ?? '')}
                    />
                  ),
                  // A marking this tile's cube cannot reach: unmarked, and said
                  // rather than left looking like "none of it is in here" (AC-103).
                  charts.notLinked?.[chartId] === undefined ? null : (
                    <StateLine
                      key="not-linked"
                      kind="idle"
                      testId="not-linked"
                      className="tile-not-covered"
                    >
                      {charts.notLinked[chartId]}
                    </StateLine>
                  ),
                  // After a refresh, if a pre-aggregation answered it (T154,
                  // AC-148): in view mode, as Refresh is — its Jobs link would
                  // leave an edit.
                  // Not over a drill, whose answer is its own (AC-238).
                  affordances.editing ||
                  drill !== undefined ||
                  charts.refreshedFromRollup?.has(chartId) !== true ||
                  !accelerationOf(charts.answered?.[chartId]).accelerated ? null : (
                    <RollupRefreshNote
                      key="rollup"
                      preAggregation={
                        accelerationOf(charts.answered?.[chartId]).preAggregation ?? ''
                      }
                      builtAt={accelerationOf(charts.answered?.[chartId]).lastUpdatedAt}
                      onDismiss={() => charts.onDismissRollupNote?.(chartId)}
                    />
                  ),
                ].filter((note) => note !== null);
                return said.length === 0 ? undefined : said;
              })()}
              // A drilled view marks nothing, so draws no keyboard item (T270, T306).
              spec={
                drill === undefined
                  ? withKeyboardItem(charts.specs[chartId], charts.keyboardFocusOn?.(element.id))
                  : drill.spec
              }
              error={drill === undefined ? charts.errors[chartId] : drill.error}
              loading={drill === undefined ? charts.loading : drill.loading}
              // Asked again by a filter, or refreshed: either way, said (T183's review).
              busy={
                charts.pending?.has(chartId) === true || charts.refreshing?.has(chartId) === true
              }
              inEffect={charts.inEffect?.[chartId]}
              editing={editing}
              carried={charts.carried}
              title={charts.titleOf?.(chartId)}
              memberTitle={charts.memberTitle}
              tokens={charts.textTokensOf?.(element.id)}
              elements={charts.textElementsOf?.(element.id)}
              rowsTotal={drill === undefined ? charts.draftTotals?.[chartId] : undefined}
              // A drilled view's own answer, so its own freshness (AC-238).
              answered={drill === undefined ? charts.answered?.[chartId] : drill.answered}
              limited={drill === undefined ? charts.limitedStates?.[chartId] : undefined}
              /**
               * Retry is the tile's "Refresh now" (AC-042): the same request,
               * past Cube's cache, into the same place — so a chart that
               * failed is asked again and drawn where the error was. It was
               * never passed here, which is how the error state on every
               * dashboard came to have no Retry while its component test,
               * which passed the prop, stayed green.
               */
              onRetry={
                // A failed drill is asked again, not the tile's own chart (T270's review).
                drill !== undefined
                  ? drill.onRetry
                  : // Not while editing, where Refresh is hidden on purpose: a
                    // drafted tile's Retry would re-read the saved chart and
                    // drop the draft it is showing.
                    charts.onRefresh === undefined || editing
                    ? undefined
                    : () => {
                        charts.onRefresh?.(chartId);
                      }
              }
              // The chart's own type, where it has one (T132's review): the
              // editor changes the document's, not the tile's.
              chartType={charts.typeOf?.(chartId) ?? element.chartType}
              // Named as the way in only where the pencil is offered.
              canEditChart={affordances.onEditChart !== undefined}
              // A bullet chart's + Target opens its chart, as the pencil does (T954).
              onAddTarget={
                affordances.onEditChart === undefined || gone(chartId)
                  ? undefined
                  : () => {
                      affordances.onEditChart?.(element.id, chartId);
                    }
              }
              /**
               * What this tile is marking, in words and a count (AC-098),
               * beside its title (AC-201) — a chart tile's only: a text tile
               * marks nothing, whatever the default marking holds.
               */
              badge={
                // A drilled view marks nothing (the spec's F23 note).
                element.kind !== 'chart' || drill !== undefined
                  ? undefined
                  : (() => {
                      const shown = charts.markingOn?.(element.id);
                      // Only when its marking holds something: an element
                      // that renders nothing still makes the head row draw.
                      return shown === undefined || shown.markedCount <= 0 ? undefined : (
                        <MarkBadge
                          marking={shown.marking}
                          colour={shown.colour}
                          markedCount={shown.markedCount}
                          shareShown={shown.shareShown}
                        />
                      );
                    })()
              }
              tableView={affordances.tableViews?.showing.has(element.id) === true}
              onTableViewChange={(showing) => {
                affordances.tableViews?.set(element.id, showing);
              }}
              {...(charts.onItemClick === undefined || drill !== undefined
                ? {}
                : {
                    onItemClick: (item: ClickedItem) => {
                      charts.onItemClick?.(element.id, chartId, item);
                    },
                  })}
              {...(charts.onMarkClick === undefined || drill !== undefined
                ? {}
                : {
                    // The same click, read as a marking: the modifier is
                    // what tells replace from toggle (AC-087).
                    onItemClick: (item: ClickedItem, toggle = false) => {
                      charts.onMarkClick?.(element.id, chartId, item, toggle);
                    },
                  })}
              {...(charts.onMarkShape === undefined ||
              drill !== undefined ||
              charts.marksShapes?.(element.id, chartId) !== true ||
              // In range mode a drag marks a span of the axis instead (T386).
              charts.rangeMarks?.(element.id, chartId) === true
                ? {}
                : {
                    onShapeMark: (items: readonly ClickedItem[], toggle: boolean) => {
                      charts.onMarkShape?.(element.id, chartId, items, toggle);
                    },
                  })}
              {...(charts.onMarkRange === undefined ||
              drill !== undefined ||
              charts.rangeMarks?.(element.id, chartId) !== true
                ? {}
                : {
                    onAxisRange: (range: { from: string; to: string }, add: boolean) => {
                      charts.onMarkRange?.(element.id, chartId, range, add);
                    },
                  })}
              {...(() => {
                const stripes =
                  drill === undefined ? charts.rangeStripesOn?.(element.id, chartId) : undefined;
                return stripes === undefined || stripes.length === 0
                  ? {}
                  : { rangeStripes: stripes };
              })()}
              {...(charts.onTileMenu === undefined
                ? {}
                : {
                    onContextMenuAt: (x: number, y: number) => {
                      charts.onTileMenu?.(element.id, { x, y });
                    },
                  })}
              {...(() => {
                const rows =
                  drill === undefined ? charts.rowMarkingOn?.(element.id, chartId) : undefined;
                return rows === undefined ? {} : { rowMarking: rows };
              })()}
            />
          </>
        );
      }}
    </Canvas>
  );
}

/** Whether an element is among these, at any depth of sections and tabs. */
/** Every section around an element, outermost first; none if it is in none. */
function sectionsAround(items: readonly Element_[], id: string): string[] {
  for (const element of items) {
    if (element.kind === 'section') {
      if (holdsElement(element.items, id))
        return [element.id, ...sectionsAround(element.items, id)];
    } else if (element.kind === 'tabs') {
      for (const tab of element.tabs) {
        const found = sectionsAround(tab.items, id);
        if (found.length > 0 || holdsElement(tab.items, id)) return found;
      }
    }
  }
  return [];
}

function holdsElement(items: readonly Element_[], id: string): boolean {
  return items.some(
    (element) =>
      element.id === id ||
      (element.kind === 'section' && holdsElement(element.items, id)) ||
      (element.kind === 'tabs' && element.tabs.some((tab) => holdsElement(tab.items, id))),
  );
}

function TabGroupView({
  group,
  affordances,
}: {
  group: Extract<Element_, { kind: 'tabs' }>;
  affordances: Affordances;
}) {
  const [open, setOpen] = useState(group.tabs[0]?.id ?? '');
  /**
   * A selection made elsewhere — the Outline, say — that lands inside one of
   * this group's tabs shows that tab. Only the showing tab's elements are
   * rendered, so otherwise the selected element had no box on the canvas:
   * nothing to scroll to, nothing highlighted, and the next insert went
   * after it into a tab the user could not see (T209's review).
   *
   * Followed once per new selection, so the user can still switch tabs by
   * hand with an element in another tab selected.
   */
  const selectedId = affordances.selection?.id ?? null;
  const [followed, setFollowed] = useState<string | null>(null);
  if (selectedId !== followed) {
    setFollowed(selectedId);
    const holding =
      selectedId === null
        ? undefined
        : group.tabs.find((tab) => holdsElement(tab.items, selectedId));
    if (holding !== undefined && holding.id !== open) setOpen(holding.id);
  }
  const showing = group.tabs.find((tab) => tab.id === open) ?? group.tabs[0];

  return (
    <div className="tab-group" data-tab-group={group.id}>
      {/* Named as the Outline names it, by its tabs, never its id (AC-209).
          The page tabs' rule, as dashboard.js reuses .dash-tabs (T247, N1). */}
      <div
        role="tablist"
        className="page-tabs tab-group__tabs"
        aria-label={affordances.nameOf?.(group.id) ?? 'Tabs'}
      >
        {group.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === showing?.id}
            // One Tab stop, the arrows along it (T182, APG tabs).
            tabIndex={tab.id === showing?.id ? 0 : -1}
            /**
             * A tile dropped here goes into this tab, whether or not it is the
             * one on screen — the case AC-056 singles out.
             */
            data-droptab={tabKey(group.id, tab.id)}
            onClick={() => setOpen(tab.id)}
            onKeyDown={(event) => {
              onTabKey(event, (index) => {
                const chosen = group.tabs[index];
                if (chosen !== undefined) setOpen(chosen.id);
              });
            }}
          >
            {tab.title}
          </button>
        ))}
        {/* And a tab, the fourth of the four (AC-060). */}
        {affordances.onDeleteTab === undefined || group.tabs.length <= 1
          ? null
          : group.tabs.map((tab) => (
              <button
                key={`delete-${tab.id}`}
                type="button"
                data-testid={`delete-tab-${group.id}-${tab.id}`}
                aria-label={`Delete tab ${tab.title}`}
                onClick={() => {
                  affordances.onDeleteTab?.(group.id, tab.id);
                  // Onto the group's tab now showing, not the page (T182).
                  requestAnimationFrame(() => {
                    const strip = window.document.querySelector(
                      `[data-tab-group="${CSS.escape(group.id)}"] [role="tablist"]`,
                    );
                    (
                      strip?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
                      strip?.querySelector<HTMLElement>('[role="tab"]')
                    )?.focus();
                  });
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            ))}
      </div>
      {showing ? (
        <Elements
          items={showing.items}
          containerKey={tabKey(group.id, showing.id)}
          affordances={affordances}
        />
      ) : null}
    </div>
  );
}

/**
 * The Add panel, bound to the session (AC-058).
 *
 * Where a new element lands is said in words before it is clicked, because
 * "after the selection or into the chosen slot" is a rule the user cannot see
 * — and an insert that lands somewhere unexpected is this criterion's own
 * failing state.
 */
function AddSlot({
  session,
  dashboardId,
  where,
  nameOf,
}: {
  session: EditSession<DashboardDocument>;
  /** Whose local charts a new chart tile's are (T132). */
  dashboardId: string;
  /** A tile's name, by its title (AC-209): what an insert goes after. */
  nameOf: (id: string) => string;
  where: {
    pageId: string;
    selected: string | null;
    addTarget: string | null;
    onAdded: (id: string) => void;
    onAddedFilter: (id: string) => void;
  };
}) {
  const { document } = session;
  /** What the last insert did that was not asked for (AC-059). */
  const [said, setSaid] = useState('');
  const at = insertionPoint(document, {
    pageId: where.pageId,
    ...(where.selected === null ? {} : { selected: where.selected }),
    ...(where.addTarget === null ? {} : { addTarget: where.addTarget }),
  });

  const container =
    containersOf(document).find((entry) => entry.key === at.key)?.title ?? 'this page';

  return (
    <AddPanel
      /**
       * Naming the container alone cannot tell "after this tile" from "the end
       * of the page", which is the distinction the criterion draws — so the
       * position is said too.
       */
      destination={
        at.index === null
          ? `the end of ${container}`
          : `${container}, after ${nameOf(where.selected ?? '')}`
      }
      message={said}
      // A filter goes on the filter bar, not the grid (F9, AC-076): one
      // change, which Undo and Discard reach like any other.
      onAddFilter={(widget) => {
        const id = `filter-${String(Date.now())}-${String(counter++)}`;
        session.change({
          ...document,
          filters: [...(document.filters ?? []), newFilter(widget, id)],
        });
        where.onAddedFilter(id);
      }}
      onAdd={(id) => {
        const mint = () => `el-${String(Date.now())}-${String(counter++)}`;
        /**
         * Through the grammar, not straight into the document: a tab group
         * added anywhere but a section arrives inside one, and the message
         * says so (AC-059, direction.md rule 37).
         */
        const placed = placeInGrammar(document, newElement(id, mint), at, mint);
        /**
         * A new chart has a chart of its own from the start, local to this
         * dashboard (T132, AC-126): a draft, written when the dashboard is
         * saved. Not "Chart from folders", whose tile is for a shared chart —
         * which nothing binds it to yet.
         */
        const local =
          id === 'chart'
            ? withLocalCharts([placed.element], dashboardId, mintChartId)
            : { elements: [placed.element], drafts: {} };
        const made = local.elements[0] ?? placed.element;
        /**
         * A new chart tile marks with the dashboard's default marking
         * (AC-085, direction.md rule 44). Written onto the tile rather than
         * left to be defaulted on read, so the dashboard says what each tile
         * marks with and a later change to the default leaves it where it is.
         */
        const defaultMarks = markingsFrom(document.markings).find((each) => each.isDefault);
        const element =
          made.kind === 'chart' && defaultMarks !== undefined
            ? { ...made, marksWith: defaultMarks.id }
            : made;

        session.change(withDrafts(insertElement(document, element, placed.at), local.drafts));
        setSaid(placed.message ?? '');
        // Aim at what was just added, so a second insert follows the first
        // rather than stacking in front of it.
        where.onAdded(placed.element.id);
      }}
      onAddTemplate={(id) => {
        const mint = () => `el-${String(Date.now())}-${String(counter++)}`;
        // Each chart tile with a chart of its own, as the palette's (T132;
        // direction.md: "or from a section template").
        const local = withLocalCharts(templateElements(id, mint), dashboardId, mintChartId);
        const elements = local.elements;

        /**
         * Folded into one document and handed to the session once, so the
         * whole layout is a single undoable change. Calling `session.change`
         * per tile would put four entries on the history for one click, and
         * "Discard (4 changes)" would be counting tiles rather than decisions.
         *
         * The grammar is not consulted, unlike `onAdd`: a template inserts
         * only tiles, and rule 37 is about where a tab group may live.
         */
        /**
         * The insertion point advances with each element. Reusing one point
         * looks right and is not: `insertElement` puts each element *at* that
         * index, so the second lands in front of the first and a template
         * comes out backwards — "Empty chart 8 + markdown 4" arriving as notes
         * above chart. Only an append (index null) is safe to repeat, which is
         * why every early test missed it: they all inserted with nothing
         * selected, and inserting selects what it added.
         */
        let next = document;
        let index = at.index;
        for (const element of elements) {
          next = insertElement(next, element, { key: at.key, index });
          if (index !== null) index += 1;
        }

        session.change(withDrafts(next, local.drafts));
        setSaid('');
        const last = elements.at(-1);
        if (last !== undefined) where.onAdded(last.id);
      }}
    />
  );
}

/**
 * Opening a tile's chart in the editor overlay (T032): which tile and chart,
 * the tile's height in row units as the session has it (resizes included),
 * and where focus should return when the editor closes.
 */
interface OpenChart {
  readonly tileId: string;
  readonly chartId: string;
  readonly rows: number | undefined;
  /** A selector for the control that opened it: the tile for E, the pencil for a click. */
  readonly returnTo: string;
  /**
   * Opened because the URL names the tile — a reload, or the browser's
   * Forward — so the URL needs no change (T196).
   */
  readonly fromUrl?: boolean;
}

/** Ids only have to be unique within a document; Date.now alone collides. */
let counter = 0;

/**
 * A new local chart's id (T132): minted in the browser, as the session holds
 * it before any save, and random, so it claims no stored chart — the save
 * creates it at version 0, and refuses an id already stored.
 */
const mintChartId = () => crypto.randomUUID();

/**
 * The filter bar's hint while nothing is marked or cross-filtered (AC-196):
 * the prototype's sentences, by mode, and what is off while editing.
 */
function interactionHint(
  mode: 'markings' | 'crossFilter',
  editing: boolean,
  previewing: boolean,
): string {
  if (mode === 'crossFilter') {
    if (editing) return 'Cross-filtering is off while editing';
    if (previewing) return 'Cross-filtering is off while previewing';
    return 'Click a bar, slice or panel to cross-filter';
  }
  if (editing) return 'Marking is off while editing';
  if (previewing) return 'Marking is off while previewing';
  return 'Click, drag or Alt+drag to mark · Ctrl/⌘ adds or toggles · Esc unmarks';
}

/** One empty list, so "nothing selected" is the same value on every render. */
const NO_SELECTIONS: readonly CrossSelection[] = [];

/**
 * A marking's own colour: its slot (`mk1`–`mk4`) in the theme showing. Read
 * from the tokens rather than a CSS variable, because ECharts paints a mark
 * with a colour value, not with a custom property.
 */
/**
 * The highest number a "Filter to marked" filter was given (`mark-filter-n`),
 * of these and `from`: a new one is numbered past those a bookmark or a link
 * brought back, so no two share an id (T128, T129).
 */
function numberedPast(from: number, filters: readonly { readonly id: string }[]): number {
  return filters.reduce(
    (most, filter) => Math.max(most, Number(/^mark-filter-(\d+)$/.exec(filter.id)?.[1] ?? 0)),
    from,
  );
}

/**
 * The charts that draw their x member along a vertical chart's category axis,
 * one band per value: those a range can be dragged along (T386, AC-093). Not a
 * horizontal bar, whose categories run down the y axis.
 */
const RANGE_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'bar',
  'groupedBar',
  'stackedBar',
  'line',
  'multiLine',
  'area',
  'stackedArea',
  'combo',
]);

function markingColour(slot: MarkingSlot, theme: 'light' | 'dark'): string {
  return COLORS[theme][slot];
}

/** The session's chart drafts with new ones added: a new tile's local chart (T132). */
function withDrafts(
  document: DashboardDocument,
  drafts: Readonly<Record<string, ChartDraft>>,
): DashboardDocument {
  return Object.keys(drafts).length === 0
    ? document
    : { ...document, chartDrafts: { ...document.chartDrafts, ...drafts } };
}

/**
 * What every query beneath the dashboard is asked as, and for: its previewed
 * security context (T172), and the item it serves (T340, AC-268).
 */
function QueriesAs({
  preview,
  item,
  children,
}: {
  readonly preview: Readonly<Record<string, unknown>> | undefined;
  readonly item: QueryItem;
  readonly children: React.ReactNode;
}) {
  return (
    <SecurityPreview.Provider value={preview}>
      <QueryItemContext.Provider value={item}>{children}</QueryItemContext.Provider>
    </SecurityPreview.Provider>
  );
}

/**
 * A change said in a polite region afresh, even in the same words as the
 * last thing it said (AC-493; T840's review): emptied, then set a frame
 * later, so the region's text changes and is read again. A region left
 * holding the same words changes nothing, and says nothing.
 */
function sayAfresh(say: (text: string) => void, text: string): void {
  say('');
  requestAnimationFrame(() => {
    say(text);
  });
}

export function DashboardView({
  dashboardId,
  queryItem,
  document,
  specs,
  errors,
  loading = false,
  answered,
  onRefresh,
  refreshing,
  refreshable,
  preview,
  onExitPreview,
  readOnly = false,
  mayCopyToDashboard = true,
  crumbs = true,
  onHistory,
  historyOpen = false,
  onEditingChange,
  place,
  onDelete,
  documents,
  reach,
  model,
  primaryKey,
  memberTitle,
  formats,
  titles,
  shortTitles,
  onEditStart,
  onDiscard,
  editTile,
  onEditTile,
  startEditing,
  onStartedEditing,
  publishTile,
  onPublishTaken,
  urlFilterValues,
  onFilterValues,
  urlView,
  onViewTaken,
  onSave,
}: DashboardViewProps) {
  /**
   * The item every query of its tiles, filters, tokens and drills serves
   * (T340, AC-268): kept by its kind and id, so a new object each render
   * changes nothing below.
   */
  const itemKind = queryItem?.kind ?? 'dashboard';
  const itemId = queryItem?.id ?? dashboardId;
  const item = useMemo<QueryItem>(() => ({ kind: itemKind, id: itemId }), [itemKind, itemId]);
  /** Each measure's aggregation, so a count's axis is ticked in whole numbers (T683, DSH-02). */
  const measureTypes = useMemo(() => measureTypesOf(model), [model]);
  /**
   * A shared one is edited in a copy in My workspace, never in place (T348,
   * AC-278): no Edit, no gear, no tile's ✎ and no "Start editing". Unlike
   * `readOnly`, it keeps what a reader does: bookmarks, History, copying out.
   */
  const editsElsewhere = place?.editsElsewhere === true;
  /**
   * Charts edited from a tile and held in the edit session (T032), mirrored
   * up from it by `SessionMirror` — because the colours are assigned here,
   * above the session, and a drafted chart has to be coloured by the same
   * assignment as every other tile (AC-039). Assigning colours inside the
   * session instead would lose the assignment whenever the dashboard is
   * replaced by an overlay, so closing the settings page with a filter active
   * would recolour every member from scratch.
   */
  const [drafts, setDrafts] = useState<DashboardDocument['chartDrafts']>(undefined);
  const drawn = useMemo(() => {
    const withDrafts = drawnWithDrafts(
      { specs, errors: errors ?? {}, documents, answered },
      { ...document, ...(drafts === undefined ? {} : { chartDrafts: drafts }) },
    );
    /**
     * Picked again with the model's formats (T510; R67, the user: "Pass
     * formats to dashboards"): a chart following the recommender whose
     * metrics are on different scales is drawn as the editor draws it. Done
     * here, as the tiles are drawn, so no tile's first paint waits on the
     * model (T194; T510's review); one drawn before it came is drawn again.
     */
    return formats === undefined
      ? withDrafts
      : {
          ...withDrafts,
          specs: Object.fromEntries(
            Object.entries(withDrafts.specs).map(([id, spec]) => [
              id,
              pickedWithFormats(spec, withDrafts.documents?.[id], formats),
            ]),
          ),
        };
  }, [specs, errors, documents, answered, document, drafts, formats]);
  const chartTitleOf = (chartId: string) => drawn.documents?.[chartId]?.title;
  /**
   * The rows behind a chart, ungrouped, carry no quick calculation (AC-048):
   * each measure is written and named as the model has it, never as its
   * calculation's.
   */
  const plainFormatsOf = (spec: RenderSpec | undefined) =>
    formats ?? withoutCalculations(spec?.formats, spec);
  const plainTitlesOf = (spec: RenderSpec | undefined) =>
    titles ?? withoutCalculations(spec?.titles, spec);
  /**
   * A chart's type as Properties says it (AC-203): its saved type, or, where
   * it follows the recommender, "Automatic" and the type it is drawn as.
   */
  const chartTypeOf = (chartId: string) => {
    const chart = drawn.documents?.[chartId]?.chart;
    if (chart?.chartType !== undefined) return chartTypeText({ chartType: chart.chartType });
    // Nothing in it to draw: "Incomplete", as the prototype and Explore say.
    const hasFields =
      chart !== undefined && Object.values(chart.wells).some((well) => well.length > 0);
    if (!hasFields) return chartTypeText({ hasFields: false });
    const shown = drawn.specs[chartId]?.chartType;
    return shown === undefined ? 'Automatic' : `Automatic (${chartTypeText({ chartType: shown })})`;
  };
  /** The cube or view a chart is built on (AC-203); a new chart has none yet. */
  const chartSourceOf = (chartId: string) => {
    const cube = drawn.documents?.[chartId]?.chart.source.cube ?? '';
    return cube === '' ? 'no cube or view yet' : cube;
  };

  /**
   * What each filter holds now (F9). The reader's, not the dashboard's: not
   * in the saved document, and not in the edit history — setting a filter is
   * reading the dashboard, not changing it.
   */
  // Values passed on from another dashboard's link tile are taken onto this
  // one's filters on the same fields (AC-064).
  const [filterValues, setFilterValues] = useState<FilterValues>(() =>
    adoptValues(document.filters ?? [], urlFilterValues ?? {}),
  );
  /**
   * The URL kept saying what the dashboard shows (AC-081): whenever the two
   * differ, the dashboard's values are written. That is each change made here,
   * and also a Back or Forward onto an older entry. The editor pushes one
   * (T196) and filters replace, so going Forward onto it brought back the
   * filters from before the last change, and closing the editor left them in
   * the URL (T087's review).
   *
   * From an effect, after the change is in: from inside the state update it
   * would run twice under StrictMode.
   */
  useEffect(() => {
    if (urlFilterValues === undefined || onFilterValues === undefined) return;
    if (!sameValues(urlFilterValues, filterValues)) onFilterValues(filterValues);
  }, [urlFilterValues, filterValues, onFilterValues]);
  /**
   * The dashboard as the session has it, mirrored up (`SessionMirror`): its
   * filters and scopes may be edits not yet saved, and a filter set while
   * editing reaches the tiles as they are being edited.
   */
  const [live, setLive] = useState<DashboardDocument>(document);
  /**
   * Below 1,024 px a dashboard is for reading (T250, direction.md §2): no
   * Edit, no ✎, and its tiles stacked by the stylesheet. An edit session
   * already open when the window narrows keeps its bar, so nothing is lost.
   */
  const narrow = useNarrowWindow();
  /** How many times ⋯'s "Bookmarks…" was chosen, below 1,024 px (AC-495). */
  const [bookmarksAsked, setBookmarksAsked] = useState(0);
  /**
   * Whether the dashboard is being edited, mirrored up with it: clicking a
   * mark selects the tile while editing, so cross-filtering is off there —
   * the prototype says so on its filter bar in as many words.
   */
  const [sessionEditing, setSessionEditing] = useState(false);
  // Said to the page, which closes History as editing begins (T357's review):
  // a version drawn in its place would end the session.
  useEffect(() => {
    onEditingChange?.(sessionEditing);
  }, [sessionEditing, onEditingChange]);
  /**
   * Exporting (T511; AC-354, AC-360; design 13): the pane, opened from the
   * header's ⋯ in view mode; the tiles its hovered or focused dependency is
   * used on, outlined; and the toast once the file is downloaded (state E).
   */
  const [exporting, setExporting] = useState(false);
  const [outline, setOutline] = useState<ExportOutline | null>(null);
  const [exported, setExported] = useState('');
  const closeExport = () => {
    setExporting(false);
    setOutline(null);
    // Back to the ⋯ it came from (design 13, keyboard table).
    requestAnimationFrame(() => {
      window.document.querySelector<HTMLElement>('[data-testid="dashboard-more"]')?.focus();
    });
  };
  // The file holds the saved dashboard: not offered while editing (pin 1).
  if (exporting && sessionEditing) {
    setExporting(false);
    setOutline(null);
  }
  /**
   * The cross-filter selections in effect (AC-117): what was clicked, and on
   * which tile. Held here rather than in the document, because clicking a
   * mark is reading the dashboard, not changing it — Looker drops them when
   * the dashboard is left, and so does the prototype
   * (`docs/research/cross-highlight.md` §7).
   */
  /**
   * Held with the mode they were made in, so a saved mode change clears them
   * (AC-071, direction.md §2: "Switching clears current marks and
   * cross-filters"). Each mode's *configuration* is kept — that is AC-070 —
   * but what a reader had selected in it is not, and coming back to
   * cross-filtering must not restore a selection made before they left.
   *
   * Read during render rather than cleared in an effect: an effect would
   * render the stale selection once before taking it away.
   */
  const [held, setHeld] = useState<{
    readonly mode: InteractionMode;
    readonly selections: readonly CrossSelection[];
  }>({ mode: interactionsOf(document.settings).mode, selections: [] });
  /**
   * Whether a chart's own cube or view can be asked about a member, and by
   * what name (AC-079). One answer for filters and cross-filters alike: they
   * are the same question, and two copies of it would drift.
   */
  const reachOf = useCallback(
    (member: string, chartId: string) => {
      if (reach === undefined) return member;
      const source = drawn.documents?.[chartId]?.chart.source.cube;
      return source === undefined ? undefined : reach(member, source);
    },
    [reach, drawn.documents],
  );
  const interactions = interactionsOf(live.settings);
  /**
   * What is selected *in this mode*, dropped the moment the mode changes —
   * during render, React's own way of adjusting state when what it was
   * derived from changes. Merely hiding it would bring it back on the way
   * out and in again, which is the thing AC-071 forbids.
   */
  if (held.mode !== interactions.mode) setHeld({ mode: interactions.mode, selections: [] });
  const crossSelections = held.mode === interactions.mode ? held.selections : NO_SELECTIONS;
  const mode = interactions.mode;
  const setCrossSelections = useCallback(
    (
      next:
        | readonly CrossSelection[]
        | ((before: readonly CrossSelection[]) => readonly CrossSelection[]),
    ) => {
      setHeld((was) => {
        const before = was.mode === mode ? was.selections : NO_SELECTIONS;
        return { mode, selections: typeof next === 'function' ? next(before) : next };
      });
    },
    [mode],
  );
  const crossFiltering =
    interactions.mode === 'crossFilter' && !sessionEditing && preview === undefined;

  /**
   * The dashboard's markings, and what each holds now (AC-084, AC-095).
   *
   * The definitions are the document's; what is marked is the session's —
   * rule 54: "Saved dashboards store marking definitions only. Current marks
   * are carried only by a link or a bookmark" — so marking something must
   * never make the edit session think the dashboard has changed.
   */
  const theme = useThemeName();
  const markings = markingsFrom(live.markings);
  /**
   * What a "Filter to marked" filter says it keeps (AC-113): its marking's
   * values by the members' titles, a tile marked whole by its title. A
   * restored one — from a bookmark or a link — is worded again so, from its
   * predicate (T128's review).
   */
  const markFilterWords = (predicate: MarkingPredicate) =>
    summariseMarking(predicate, memberTitle, 3, (id) => {
      const tile = elementAt(live, id);
      return tile !== null && isTile(tile) && tile.chartId !== undefined
        ? chartTitleOf(tile.chartId)
        : undefined;
    });
  /**
   * A field's title as the bar's pills and the Filters toggle name it (the
   * model's titles; with none handed down, the field's name).
   */
  const filterTitle = (member: string): string | undefined =>
    memberTitle === undefined ? member : memberTitle(member);
  /**
   * How many filters the Filters toggle counts as set with these values and
   * filters made from a marking (AC-486), for a change's announcement (AC-493).
   */
  const filtersSetWith = (
    values: FilterValues,
    made: readonly Pick<MarkFilter, 'members'>[],
  ): number => filtersSet(live.filters ?? [], values, made, filterTitle).set;
  /** A view restored, fitted to the dashboard (`viewFor`) and its marking filters worded here. */
  const restored = (state: ViewState, into: DashboardDocument): ViewState => {
    const view = viewFor(into, state);
    return {
      ...view,
      markFilters: view.markFilters.map((made) => ({
        ...made,
        summary: markFilterWords(made.predicate),
      })),
    };
  };
  /**
   * A link with marks, as the dashboard opens (T129, AC-123), fitted to it as
   * a bookmark is: what the marks and the page tab start as.
   */
  const [linked] = useState(() =>
    urlView === undefined ? undefined : restored(urlView, document),
  );
  const [marks, setMarks] = useState<MarkingState>(() => linked?.marks ?? {});
  /**
   * The filters "Filter to marked" and "Filter out marked" made (AC-113,
   * direction.md rule 53): each a marking's predicate, or its negation, as one
   * Cube filter, shown in the filter bar until removed. View state, as the
   * marks they came from are: a saved dashboard holds neither (rule 54).
   */
  const [markFilters, setMarkFilters] = useState<readonly MarkFilter[]>(
    () => linked?.markFilters ?? [],
  );
  /**
   * Numbers each marking filter, so two made alike stay two (AC-113) — past
   * any a link or a bookmark brought (`numberedPast`).
   */
  const markFilterSeq = useRef(numberedPast(0, linked?.markFilters ?? []));
  /**
   * The tile each marking was last marked from, which its chip names (AC-200,
   * the prototype's "from ‹tile›"). View state, like the marks themselves.
   */
  const [markSources, setMarkSources] = useState<Readonly<Record<string, string>>>(
    () => linked?.from ?? {},
  );
  // The link's view is the dashboard's now: out of the URL (T129).
  useEffect(() => {
    if (urlView !== undefined) onViewTaken?.();
    // Once, as the dashboard opens: what the link said is taken then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /**
   * What is marked, dropped when the saved mode changes (AC-071), as the
   * cross-filter selections above are: during render, so the marks of the
   * mode left are never drawn again, and not brought back on the way in.
   */
  /** The last marking change, for the polite live region (AC-101). */
  const [markSaid, setMarkSaid] = useState('');
  /**
   * What the keyboard's cross-filtering came to (T405, AC-176), in a region
   * of its own: a cross-filtering dashboard says nothing of markings (AC-120).
   */
  const [crossSaid, setCrossSaid] = useState('');
  /** Which item a tile's keyboard is on, and where a Shift-extend began. */
  const [markFocus, setMarkFocus] = useState<
    Readonly<Record<string, { readonly focused: number; readonly anchor: number | null }>>
  >({});
  /**
   * The tile whose keyboard item is drawn (T306, AC-176): from its first
   * marking key until focus leaves it or the pointer is used. Where the
   * keyboard was is kept (`markFocus`); only the ring goes, since a ring left
   * on a tile nobody is at would say the keyboard is still there.
   */
  const [keyShownOn, setKeyShownOn] = useState<string | null>(null);
  useEffect(() => {
    if (keyShownOn === null) return undefined;
    const tile = [...window.document.querySelectorAll<HTMLElement>('[data-tile]')].find(
      (each) => each.dataset['tile'] === keyShownOn,
    );
    const letGo = (event: Event) => {
      if (event.type === 'focusin' && event.target === tile) return;
      setKeyShownOn(null);
    };
    window.document.addEventListener('focusin', letGo);
    window.document.addEventListener('pointerdown', letGo, true);
    return () => {
      window.document.removeEventListener('focusin', letGo);
      window.document.removeEventListener('pointerdown', letGo, true);
    };
  }, [keyShownOn]);
  const [marksMode, setMarksMode] = useState(interactions.mode);
  if (marksMode !== interactions.mode) {
    setMarksMode(interactions.mode);
    // What was said and where the keyboard was, with them (T077's review).
    setMarkSaid('');
    setMarkFocus({});
    setMarks({});
    setMarkSources({});
  }
  const noteSource = (markingId: string, tileId: string) => {
    setMarkSources((now) => (now[markingId] === tileId ? now : { ...now, [markingId]: tileId }));
  };
  /** The title of the tile a marking was last marked from, for its chip. */
  const markSourceTitle = (markingId: string): string | undefined => {
    const tileId = markSources[markingId];
    const element = tileId === undefined ? null : elementAt(live, tileId);
    if (element === null || !isTile(element) || element.chartId === undefined) return undefined;
    return chartTitleOf(element.chartId);
  };
  /**
   * A marking emptied from its chip (AC-200) — every tile's contribution, as
   * the chip is the marking's, not a tile's — and said (AC-101).
   */
  const unmarkAll = (marking: Marking) => {
    setMarks((now) => withMarking(now, marking.id, EMPTY_PREDICATE));
    setMarkSaid(announceMarking({ marking, markedCount: 0 }));
    /**
     * The chip goes with its marking, and the control that had focus with it
     * (T220's review): on to the next chip's ×, or else the filter bar, so a
     * keyboard is never left on the page. With the header sheet closed, the
     * next compact chip's ×, or else the Filters toggle (T838).
     */
    requestAnimationFrame(() => {
      focusFirstOf([
        '[data-testid="compact-mark-chip"] button[aria-label^="Unmark "]',
        '[data-testid="mark-chip"] button[aria-label^="Unmark "]',
        'section.filter-bar',
        '.dashboard__header button.header-toggle',
      ]);
    });
  };
  /**
   * A compact cross-filter chip's × (T838): the cross-filter cleared, and
   * focus on to the next compact chip's ×, or else the Filters toggle, rather
   * than left on the page.
   */
  const clearCompactCrossFilter = (selection: CrossSelection) => {
    clearCrossFilterSaid(selection);
    requestAnimationFrame(() => {
      focusFirstOf([
        '[data-testid="compact-cross-chip"] button[aria-label^="Clear "]',
        '.dashboard__header button.header-toggle',
      ]);
    });
  };
  /** How many items a marking holds now: its items and its ranges. */
  const markedCountOf = (markingId: string) => {
    const predicate = markingOf(marks, markingId);
    return markedCount(predicate);
  };
  const marking = interactions.mode === 'markings' && !sessionEditing && preview === undefined;
  const defaultMarking = defaultMarkingOf(live);
  /**
   * Which marking a tile marks with: its own, or the dashboard's default for
   * a tile saved before the setting existed. "(None)" is a tile that marks
   * with nothing, which is `marksWith: ''` rather than an absent field
   * (AC-085, direction.md rule 44).
   */
  const marksWithOf = (tile: Tile): string | undefined => {
    const own = tile.marksWith ?? defaultMarking?.id;
    return own === '' || own === undefined ? undefined : own;
  };
  /**
   * What each of them does to each chart (AC-117). Read from the charts as
   * loaded, not as filtered, so that what a tile draws cannot decide what it
   * is asked — which would not settle.
   */
  const crossEffects = useMemo(() => {
    const perChart: Record<string, CrossEffects> = {};
    /** The name each highlighted chart's own cube or view takes the member by. */
    const askHighlightAs: Record<string, string> = {};
    if (!crossFiltering || crossSelections.length === 0) return { perChart, askHighlightAs };
    const tiles = chartTilesOf(live);
    const pageOfSource = new Map(tiles.map((tile) => [tile.tileId, tile.pageId]));

    for (const tile of tiles) {
      const chartId = tile.chartId;
      // The first tile's, as a filter's coverage is by chart too: a chart on
      // two tiles is a hand-built dashboard, since a duplicate gets a chart
      // of its own (AC-062).
      if (chartId === undefined || perChart[chartId] !== undefined) continue;
      // Every tile showing this chart, so a chart placed twice cannot
      // cross-filter itself through its other tile (T123's review).
      const own = tiles.filter((each) => each.chartId === chartId).map((each) => each.tileId);
      // On the tab, as direction.md rule 13 has it: a click reaches the tiles
      // beside it, not another page's.
      const here = crossSelections.filter(
        (each) => pageOfSource.get(each.from) === tile.pageId && !own.includes(each.from),
      );
      const spec = drawn.specs[chartId];
      const effects = effectsOn(
        tile.tileId,
        here,
        interactions.crossFilter,
        spec === undefined
          ? undefined
          : {
              chartType: spec.chartType,
              members: membersDrawn(spec),
              // What it draws, not what its type suggests: a bar chart of two
              // measures draws two series (T123's review).
              seriesCount: seriesCountOf(spec),
            },
      );

      /**
       * A highlight is asked of Cube as well, so it answers to the same rule
       * as a filter (AC-079, and the user's decision of 2026-09-22): a chart
       * whose cube cannot join to the field is filtered instead, which is the
       * path that leaves it unfiltered and says "Not filtered by …"; a view
       * that takes the member by another name is asked by that name.
       */
      const highlight = effects.highlight;
      if (highlight === undefined) {
        perChart[chartId] = effects;
        continue;
      }
      const as = reachOf(highlight.selection.member, chartId);
      if (as === false) {
        perChart[chartId] = { filters: [...effects.filters, highlight.selection] };
        continue;
      }
      perChart[chartId] = effects;
      askHighlightAs[chartId] = as ?? highlight.selection.member;
    }
    return { perChart, askHighlightAs };
  }, [crossFiltering, crossSelections, live, interactions.crossFilter, drawn.specs, reachOf]);
  /**
   * The charts a filter in effect reaches, each with the filters that reach it
   * (AC-078), and what each draws once filtered — asked by `FilteredCharts`.
   */
  /**
   * And the charts a filter's scope takes in but whose cube or view cannot
   * reach its field (AC-079): left unfiltered — never asked with a filter
   * Cube would refuse — and marked. A chart the model cannot yet say about is
   * neither filtered nor marked.
   */
  /**
   * A cross-filter is a filter: written as one, it takes the path every
   * dashboard filter takes — reach checked against the model, the tile left
   * unfiltered and told so where its cube cannot join to the field (AC-079),
   * and one query per tile rather than a second mechanism beside it.
   *
   * Scoped to the tiles the pair matrix says it filters, which is also how a
   * tile the click came from is left out of its own selection.
   */
  const crossFilters = useMemo(() => {
    const byKey = new Map<string, { selection: CrossSelection; chartIds: string[] }>();
    for (const [chartId, effects] of Object.entries(crossEffects.perChart))
      for (const selection of effects.filters) {
        const key = `${selection.from}:${selection.member}:${selection.value}`;
        const entry = byKey.get(key) ?? { selection, chartIds: [] };
        entry.chartIds.push(chartId);
        byKey.set(key, entry);
      }
    const tilesOf = (chartIds: readonly string[]) =>
      chartTilesOf(live)
        .filter((tile) => tile.chartId !== undefined && chartIds.includes(tile.chartId))
        .map((tile) => tile.tileId);
    return [...byKey.values()].map(({ selection, chartIds }) => ({
      filter: {
        id: `cross:${selection.from}:${selection.member}`,
        widget: 'checkbox' as const,
        member: selection.member,
        scope: { kind: 'tiles' as const, tileIds: tilesOf(chartIds) },
      },
      value: { kind: 'values' as const, values: [selection.value] },
    }));
  }, [crossEffects, live]);

  /**
   * What the markings limiting each tile do to it (AC-107, direction.md rule
   * 33), by chart.
   *
   * Two outcomes, because they are different states and not degrees of one:
   * a tile with something to show is *asked a narrower question* — the limit
   * goes into its Cube query, not into its rows, so its aggregates are over
   * what it draws — and a tile whose limiting markings are all empty is not
   * asked at all. It is waiting, and AC-109 says what waiting looks like.
   *
   * Empty markings are skipped rather than intersected (rule 33). Under AND
   * the other reading empties a details tile the moment a second marking is
   * added to it, and "go and mark something in the other master tile too" is
   * not a remedy anyone would guess.
   */
  const limitedTiles = useMemo(() => {
    const asked: Record<string, CubeFilter> = {};
    const waiting: Record<string, true> = {};
    if (interactions.mode !== 'markings') return { asked, waiting };

    for (const tile of chartTilesOf(live)) {
      const element = elementAt(live, tile.tileId);
      if (tile.chartId === undefined || element === null || !isTile(element)) continue;
      // Enforced here as well as where the option is offered: a stored
      // document can arrive hand-edited, or from a build older than rule 45
      // (AC-108). Against the marking the tile actually marks with, which for
      // a tile that names none is the dashboard's default.
      const limitedBy = allowedLimits(
        element.limitedBy ?? [],
        element.marksWith ?? defaultMarkingOf(live)?.id,
      );
      if (limitedBy.length === 0) continue;

      const predicates = limitedBy.map((markingId) => markingOf(marks, markingId));
      // The raw list, empty markings included — `limitingMarkings` strips
      // exactly what `allLimitsEmpty` asks about, so the two never compose.
      if (allLimitsEmpty(predicates)) {
        waiting[tile.chartId] = true;
        continue;
      }
      const filter = limitFilterFor(predicates, element.limitCombination ?? 'all');
      if (filter !== undefined) asked[tile.chartId] = filter;
    }
    return { asked, waiting };
  }, [interactions.mode, live, marks]);

  /** What each chart is asked beyond its filters: the markings that limit it (AC-107). */
  const asked = limitedTiles.asked;

  /**
   * The charts a filter in effect reaches and those it cannot (AC-078,
   * AC-079) — the dashboard's filters, its cross-filters, and every filter
   * made from a marking (AC-113).
   *
   * A marking's filter is a dashboard filter holding a Cube filter as it is,
   * so it takes the path every filter takes (T119's review): asked of each
   * tile by the names its cube or view gives the marked members, left off a
   * tile that cannot reach one — which then says "Not filtered by" it — and
   * dropped, rather than failing the tile, where Cube refuses to join it.
   */
  const { reached, notCovered } = useMemo(() => {
    const covered = coverageOf(
      live,
      [...activeFilters(live.filters ?? [], filterValues), ...crossFilters],
      reachOf,
    );
    if (markFilters.length === 0) return covered;
    const seen = new Set<string>();
    for (const tile of chartTilesOf(live)) {
      const chartId = tile.chartId;
      if (chartId === undefined || seen.has(chartId)) continue;
      seen.add(chartId);
      for (const each of markFilters) {
        const on = markFilterOn(each, (member) => reachOf(member, chartId));
        const filter = {
          id: `mark:${each.id}`,
          widget: 'checkbox' as const,
          member: 'unreached' in on ? on.unreached : (each.members[0] ?? ''),
        };
        const words = `${each.negate ? 'not' : 'only'} ${each.summary}`;
        if ('unreached' in on)
          (covered.notCovered[chartId] ??= []).push({
            filter,
            value: { kind: 'cube', filter: each.filter, words },
          });
        else
          (covered.reached[chartId] ??= []).push({
            filter,
            value: { kind: 'cube', filter: on.filter, words },
          });
      }
    }
    return covered;
  }, [live, filterValues, crossFilters, reachOf, markFilters]);

  /**
   * The filters a text tile's measure tokens are asked under (T389's review):
   * the filter bar's that reach the whole dashboard or the tile's page, and
   * Filter to or out marked, as a chart on that page is — the prototype's
   * tokens take the page's filters. A filter scoped to named tiles names
   * charts, never a text tile.
   */
  const textFiltersOf = (tileId: string): ActiveFilter[] => {
    const pageId = live.pages.find((page) => holds(page.items, tileId))?.id;
    const reaches = ({ filter }: ActiveFilter) => {
      const scope = scopeOf(filter);
      return scope.kind === 'dashboard' || (scope.kind === 'page' && scope.pageId === pageId);
    };
    return [
      ...[...activeFilters(live.filters ?? [], filterValues), ...crossFilters].filter(reaches),
      ...markFilters.map((each) => ({
        filter: {
          id: `mark:${each.id}`,
          widget: 'checkbox' as const,
          member: each.members[0] ?? '',
        },
        value: { kind: 'cube' as const, filter: each.filter, words: '' },
      })),
    ];
  };
  const [filtered, setFiltered] = useState<FilteredResults>({});
  // A chart being asked again keeps its last answer, busy, meanwhile.
  const onFiltered = useCallback((results: FilteredResults) => {
    setFiltered((before) => keepLastAnswers(before, results));
  }, []);
  const withFiltered = useMemo(() => {
    // A tile limited by a marking, or reached by a filter made from one,
    // draws a filtered answer too, even with no dashboard filter reaching it.
    const ids = [...new Set([...Object.keys(reached), ...Object.keys(asked)])].filter(
      (id) => drawn.documents?.[id] !== undefined,
    );
    if (ids.length === 0) return { ...drawn, pending: new Set<string>() };
    const shown: Record<string, RenderSpec> = { ...drawn.specs };
    const failed: Record<string, unknown> = { ...drawn.errors };
    // What Cube said of a filtered answer, not of the unfiltered one: when its
    // data is from (T154's review), and what served it.
    const said: Record<string, AnswerMeta> = { ...drawn.answered };
    const pending = new Set<string>();
    for (const id of ids) {
      const result = filtered[id];
      const answer = result?.chart;
      const asking = result?.asking ?? true;
      // No filter reaching it could be joined to it (AC-079): its own chart,
      // unfiltered, as drawn.
      if (result?.unfiltered === true) {
        if (asking) pending.add(id);
        continue;
      }
      // Being asked: what the tile drew stays, marked busy, so it is not taken
      // for the answer to the value now set; a skeleton would unmount the chart
      // and drop a reader's table view.
      if (asking || answer === undefined) pending.add(id);
      if (answer === undefined) continue;
      if ('spec' in answer) {
        // Picked with the model's formats too, as the unfiltered tile (T510).
        shown[id] = pickedWithFormats(answer.spec, drawn.documents?.[id], formats);
        delete failed[id];
      } else {
        failed[id] = answer.error;
        delete shown[id];
      }
      if (result?.answered === undefined) delete said[id];
      else said[id] = result.answered;
    }
    return { specs: shown, errors: failed, answered: said, pending };
  }, [drawn, reached, filtered, asked, formats]);

  /**
   * "Refresh now" on a tile (T154, AC-148) asks again what the tile draws: a
   * tile a filter reaches draws its filtered answer, which `FilteredCharts`
   * asks again; any other tile, its chart as loaded, which the page does.
   */
  const filteredCharts = useRef<FilteredChartsHandle>(null);
  const [refreshingFiltered, setRefreshingFiltered] = useState<ReadonlySet<string>>(new Set());
  /** The chart whose SQL as the previewed context is open (T174). */
  const [sqlFor, setSqlFor] = useState<{ chartId: string; tileId: string } | undefined>(undefined);
  /** The tile whose View query is open (AC-199). */
  const [queryFor, setQueryFor] = useState<{ chartId: string; tileId: string } | undefined>(
    undefined,
  );
  /** The tile whose "Mark range…" is open (T636). */
  const [rangeFor, setRangeFor] = useState<{ chartId: string; tileId: string } | undefined>(
    undefined,
  );
  /** The tile whose chart Copy › To dashboard is copying (T271, AC-243). */
  /** The tile whose Why not accelerated? is open (T273, AC-245). */
  const [whyNotFor, setWhyNotFor] = useState<{ chartId: string; tileId: string } | undefined>(
    undefined,
  );
  /**
   * The model's refresh schedules (T160's `/api/schedules`), for Data as of
   * on a tile a pre-aggregation answered (T273): read once one has.
   */
  const anyRollup = Object.values(withFiltered.answered ?? {}).some(
    (meta) => Object.keys(meta.usedPreAggregations ?? {}).length > 0,
  );
  // Fetched here, as the view's other reads are, rather than through the
  // query client, which a view rendered on its own does not have.
  // Undefined while being read, `failed` once asked and not answered, which
  // the submenu says as such (T273's review).
  const [schedules, setSchedules] = useState<readonly ScheduleSaid[] | 'failed' | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!anyRollup || schedules !== undefined) return undefined;
    const aborted = new AbortController();
    // Of the folders this viewer may see, a reader included, who has no
    // Schedules of their own (T371, R40).
    void fetch('/api/schedules?seen=1', { signal: aborted.signal })
      .then(async (response) => {
        setSchedules(response.ok ? ((await response.json()) as ScheduleSaid[]) : 'failed');
      })
      .catch(() => {
        if (!aborted.signal.aborted) setSchedules('failed');
      });
    return () => {
      aborted.abort();
    };
  }, [anyRollup, schedules]);
  const [copyFor, setCopyFor] = useState<{ chartId: string; tileId: string } | undefined>(
    undefined,
  );
  /** The tile whose rows are open (T120, AC-114; T268, AC-239), and which of them. */
  /**
   * The latest request to open a tile's menu other than by its ⋯ (T266,
   * AC-246): which tile, where, and a number, so a second right-click on the
   * same tile opens it again.
   */
  const [menuRequest, setMenuRequest] = useState<
    { tileId: string; seq: number; at?: { x: number; y: number } } | undefined
  >(undefined);
  /** The rows open once, over the dashboard (T120, T268). */
  const [rowsFor, setRowsFor] = useState<
    { chartId: string; tileId: string; marked: boolean } | undefined
  >(undefined);
  /**
   * The tile the details panel follows (T269, AC-240): a slot of its own, so
   * a one-off view of rows opened meanwhile leaves it be (T269's review).
   */
  /**
   * Tiles drilled (T270, AC-236), by tile: what by, and the drilled answer.
   * Not saved, and not kept on reload (the spec's F23 note).
   */
  const [drills, setDrills] = useState<Readonly<Record<string, Drill>>>({});
  const [panelFor, setPanelFor] = useState<{ chartId: string; tileId: string } | undefined>(
    undefined,
  );
  /**
   * The charts a refresh was asked for (T154, AC-148): once its answer is in,
   * one a pre-aggregation served says so — Cube read it from the rollup as
   * last built — until the note is put away.
   */
  const [refreshedFromRollup, setRefreshedFromRollup] = useState<ReadonlySet<string>>(new Set());
  const refreshTile = (chartId: string) => {
    setRefreshedFromRollup((now) => new Set([...now, chartId]));
    const handle = filteredCharts.current;
    if (handle === null || !handle.isFiltered(chartId) || filtered[chartId]?.unfiltered === true) {
      onRefresh?.(chartId);
      return;
    }
    setRefreshingFiltered((now) => new Set([...now, chartId]));
    handle
      .refresh(chartId)
      // A failed answer is the tile's to show, as any filtered answer's is.
      .catch(() => undefined)
      .finally(() => {
        setRefreshingFiltered((now) => new Set([...now].filter((id) => id !== chartId)));
      });
  };

  // Formatted after the drafts and filters are in, so those tiles are too —
  // and named by the model's titles (AC-220), with each measure's aggregation
  // so a count's axis is ticked in whole numbers (T683, DSH-02).
  const formatted = useMemo(() => {
    const written =
      formats === undefined ? withFiltered.specs : withFormats(withFiltered.specs, formats);
    // A calculated measure keeps its calculation in its name (AC-048).
    return titles === undefined
      ? written
      : Object.fromEntries(
          Object.entries(written).map(([id, spec]) => [
            id,
            withMemberLabels(spec, { titles, shortTitles, measureTypes }),
          ]),
        );
  }, [withFiltered.specs, formats, titles, shortTitles, measureTypes]);

  /**
   * A click on a mark (AC-117): the selection from that tile, replacing
   * whatever it had selected before — one selection per tile, as Superset and
   * the prototype both have it. Clicking the same value again clears it, the
   * way clicking a selected point does in Power BI and Superset.
   */
  const onItemClick = useCallback(
    (tileId: string, chartId: string, item: ClickedItem) => {
      // Read against what the tile draws: a header's panel is its place among
      // the panels as the filters leave them (T632).
      const spec = withFiltered.specs[chartId] ?? drawn.specs[chartId];
      const value = spec === undefined ? undefined : clickedValue(spec, item);
      setCrossSelections((before) => {
        const others = before.filter((each) => each.from !== tileId);
        if (value === undefined) return others;
        const had = before.find((each) => each.from === tileId);
        const same = had?.member === value.member && had?.value === value.value;
        return same ? others : [...others, { from: tileId, ...value }];
      });
    },
    [withFiltered.specs, drawn.specs, setCrossSelections],
  );

  /** One cross-filter, or all of them, taken back (AC-119). */
  const clearCrossFilter = useCallback(
    (selection?: CrossSelection) => {
      setCrossSelections((before) =>
        selection === undefined
          ? []
          : before.filter(
              (each) => each.from !== selection.from || each.member !== selection.member,
            ),
      );
    },
    [setCrossSelections],
  );
  /** A cross-filter in words, by its field's title: "Category is Beverages". */
  const crossWords = (selection: Pick<CrossSelection, 'member' | 'value'>) =>
    `${memberTitle?.(selection.member) ?? selection.member} is ${String(selection.value)}`;
  /** One cross-filter, or all of them, taken back from a chip, and said (AC-493). */
  const clearCrossFilterSaid = (selection?: CrossSelection) => {
    clearCrossFilter(selection);
    sayAfresh(
      setCrossSaid,
      filterChangeSaid({
        kind: 'cross-filter cleared',
        what: selection === undefined ? undefined : crossWords(selection),
      }),
    );
  };
  /**
   * A click on a mark that cross-filters (AC-117), said once (AC-493; design
   * 19 B4): the cross-filter set with the tile it came from, or, a second
   * click on the same value, cleared. The keyboard and a tile's ⋯ say their
   * own (T405, T632).
   */
  const onItemClickSaid = (tileId: string, chartId: string, item: ClickedItem) => {
    const spec = withFiltered.specs[chartId] ?? drawn.specs[chartId];
    const value = spec === undefined ? undefined : clickedValue(spec, item);
    const had = crossSelections.find((each) => each.from === tileId);
    onItemClick(tileId, chartId, item);
    if (value === undefined) {
      if (had !== undefined)
        sayAfresh(
          setCrossSaid,
          filterChangeSaid({ kind: 'cross-filter cleared', what: crossWords(had) }),
        );
      return;
    }
    const same = had?.member === value.member && had?.value === value.value;
    const from = chartTitleOf(chartId);
    sayAfresh(
      setCrossSaid,
      same
        ? filterChangeSaid({ kind: 'cross-filter cleared', what: crossWords(value) })
        : filterChangeSaid({ kind: 'cross-filter', what: crossWords(value), from }),
    );
  };

  /**
   * Escape takes them all back, as the prototype's "Clear (Esc)" says it
   * does. Not while something is open over the dashboard — a dialog, a menu,
   * a filter's popover or the Bookmarks popover (T367) — where Escape means
   * "close this". Nor once something has handled it: the open header sheet
   * takes an Escape with focus in the header first (AC-489, AC-119).
   */
  useEffect(() => {
    if (!crossFiltering || crossSelections.length === 0) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const doc = window.document;
      if (
        doc.querySelector('[aria-modal="true"], [role="menu"], .filter-popover, .bookmarks') !==
        null
      )
        return;
      setCrossSelections([]);
      // Said, as every change while the sheet is closed is (AC-493).
      sayAfresh(setCrossSaid, filterChangeSaid({ kind: 'cross-filter cleared' }));
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => {
      window.document.removeEventListener('keydown', onKeyDown);
    };
  }, [crossFiltering, crossSelections.length, setCrossSelections]);

  /**
   * A click in a tile that marks (AC-087, direction.md rule 47): a plain
   * click replaces that marking with what was clicked, Ctrl or ⌘ toggles the
   * one item and leaves the rest. A click on empty plot area unmarks the
   * tile's marking and leaves every other marking alone (AC-094).
   *
   * `off`: the tile menu's Ctrl+Enter on a series already marked, which takes
   * it off, mirroring the Ctrl-click toggle (T638; the coordinator's call E (a)). A
   * Ctrl-click on its legend entry still only adds (AC-090).
   */
  const onMarkClick = (
    tileId: string,
    chartId: string,
    item: ClickedItem,
    toggle: boolean,
    off = false,
  ) => {
    const tile = elementAt(live, tileId);
    if (tile === null || !isTile(tile)) return;
    const markingId = marksWithOf(tile);
    if (markingId === undefined) return;

    // Read against what the tile draws, as a cross-filter's click is (T632).
    const spec = withFiltered.specs[chartId] ?? drawn.specs[chartId];
    const clicked = spec === undefined ? undefined : clickedValue(spec, item);
    // A tile marked whole (Mark all), as its items again, so a Ctrl-click
    // takes one of them away rather than doing nothing (AC-115).
    const held = markingOf(marks, markingId);
    const expanded = toggle
      ? expandWholeTile(held, tileId, tileItemsOf(tileId) ?? [])
      : { predicate: held, refused: 0 };
    // More items than a marking holds: said, and nothing changed — the
    // whole is not cut short behind the reader's back (AC-102).
    if (expanded.refused > 0) {
      setMarkSaid(
        `This tile is marked whole and has more items than a marking holds (${MARKING_ITEM_LIMIT.toLocaleString('en-GB')}). Unmark it to mark its items one by one.`,
      );
      return;
    }
    const before = expanded.predicate;
    const after =
      clicked === undefined
        ? /**
           * Empty plot area: this tile's marking, and nothing else. The
           * effective marking is passed in, because a tile following the
           * dashboard's default carries no `marksWith` of its own and the
           * helper would then find nothing to clear.
           */
          markingOf(clearTileMarking(marks, { ...tile, marksWith: markingId }), markingId)
        : item.panelIndex !== undefined && !toggle
          ? /**
             * A trellis panel's header marks every item in that panel
             * (AC-091): the facet value alone, which is what makes "every
             * item" true whatever else varies inside it.
             */
            markFromPanel({ member: clicked.member, value: clicked.value })
          : item.legend !== undefined || item.panelIndex !== undefined
            ? /**
               * A legend entry marks every item of that category, and Ctrl
               * there *adds* a further category rather than toggling one
               * (AC-090 against AC-087 — the criteria differ, and Spotfire
               * behaves the same way round). A header's Ctrl-click adds its
               * panel the same way (T635).
               */
              off && isItemMarked(before, [{ member: clicked.member, value: clicked.value }])
              ? applyItemClick(before, [{ member: clicked.member, value: clicked.value }], {
                  toggle: true,
                })
              : markFromLegend(
                  before,
                  { member: clicked.member, value: clicked.value },
                  { add: toggle },
                )
            : // A 100 % segment as its (category, colour member) tuple (T958,
              // AC-585), read from the spec as drawn, with its measures' aggregations.
              applyItemClick(
                before,
                (spec === undefined
                  ? undefined
                  : clickedMarkItem(formatted[chartId] ?? spec, item)) ?? [
                  { member: clicked.member, value: clicked.value },
                ],
                { toggle },
              );
    if (after === before) return;

    setMarks((now) => withMarking(now, markingId, after));
    noteSource(markingId, tileId);
    const named = markings.find((each) => each.id === markingId);
    if (named !== undefined) {
      // Said in the live region, with its count and where from (AC-101).
      const from = chartTitleOf(chartId);
      setMarkSaid(
        announceMarking({
          marking: named,
          markedCount: markedCount(after),
          ...(from === undefined ? {} : { tileName: from }),
        }),
      );
    }
  };

  /**
   * A rectangle, or a lasso, over a tile that marks (AC-088): every item it
   * touched, each read as a click on it reads (`clickedValue`), so a drag and
   * a click reach the same marking. Plain, it replaces the marking with them.
   * With Ctrl or ⌘ it toggles them when all or none are marked and otherwise
   * adds them (AC-089, Spotfire's ToggleOrAdd). A shape that touched nothing
   * changes nothing, as the prototype has it; and growth stops at the
   * marking's cap, which is said (AC-102).
   */
  const onMarkShape = (
    tileId: string,
    chartId: string,
    items: readonly ClickedItem[],
    toggle: boolean,
  ) => {
    const tile = elementAt(live, tileId);
    if (tile === null || !isTile(tile)) return;
    const markingId = marksWithOf(tile);
    const spec = drawn.specs[chartId];
    if (markingId === undefined || spec === undefined) return;

    const enclosed: MarkedItem[] = [];
    for (const item of items) {
      // A 100 % segment as its tuple, as its click marks it (T958).
      const value = clickedMarkItem(formatted[chartId] ?? spec, item);
      if (value !== undefined) enclosed.push(value);
    }
    if (enclosed.length === 0) {
      // A plain shape over nothing replaces the marking with nothing — "marks
      // the items touched, replacing the marking" (direction.md rule 47) — as
      // a click on empty plot area does; with Ctrl or ⌘ it adds nothing.
      if (!toggle) onMarkClick(tileId, chartId, {}, false);
      return;
    }

    const held = markingOf(marks, markingId);
    // A tile marked whole (Mark all), as its items again, as a Ctrl-click
    // reads it (AC-115).
    const expanded = toggle
      ? expandWholeTile(held, tileId, tileItemsOf(tileId) ?? [])
      : { predicate: held, refused: 0 };
    if (expanded.refused > 0) {
      setMarkSaid(
        `This tile is marked whole and has more items than a marking holds (${MARKING_ITEM_LIMIT.toLocaleString('en-GB')}). Unmark it to mark its items one by one.`,
      );
      return;
    }
    const before = expanded.predicate;
    const everyMarked = toggle && enclosed.every((item) => isItemMarked(before, item));
    const grown = everyMarked
      ? { predicate: applyToggleOrAdd(before, enclosed), message: undefined }
      : addItemsWithinLimit(toggle ? before : { ...EMPTY_PREDICATE }, enclosed);
    const after = grown.predicate;
    if (after === before) {
      if (grown.message !== undefined) setMarkSaid(grown.message);
      return;
    }

    setMarks((now) => withMarking(now, markingId, after));
    noteSource(markingId, tileId);
    const named = markings.find((each) => each.id === markingId);
    const from = chartTitleOf(chartId);
    const said =
      named === undefined
        ? undefined
        : announceMarking({
            marking: named,
            markedCount: markedCount(after),
            ...(from === undefined ? {} : { tileName: from }),
          });
    // Said with its count and where from (AC-101), and the cap when reached.
    setMarkSaid([said, grown.message].filter((part) => part !== undefined).join(' '));
  };

  /**
   * The items a tile's keyboard moves between (AC-100): its categories, in
   * the order they are drawn. The same items a click marks, so the two
   * gestures reach the same marking.
   */
  const markableItemsOf = (tileId: string) => {
    const element = elementAt(live, tileId);
    if (element === null || !isTile(element) || element.chartId === undefined) return [];
    if (marksWithOf(element) === undefined) return [];
    // A drilled view marks nothing, by the keyboard either (T270's review).
    if (drillShown(tileId) !== undefined) return [];
    const spec = drawn.specs[element.chartId];
    if (spec === undefined || memberOn(spec.encoding, 'x') === undefined) return [];
    // A scatter's x is a measure, not items to step between (T242's review).
    if (spec.chartType === 'scatter') return [];
    try {
      return seriesOf(spec).categories;
    } catch {
      return [];
    }
  };

  /**
   * The items a tile's keyboard cross-filters by (T405, AC-176; T307): in
   * cross-filter mode, on a chart whose click means its category, its
   * categories in the order drawn, none blank and not Top N's "Other". A
   * drilled view cross-filters nothing, by the pointer either. Charts whose
   * click means a series or a panel wait on how the keyboard reaches those
   * (the user's question, with a legend's and a panel's marking).
   */
  const crossItemsOf = (tileId: string): readonly string[] => {
    if (!crossFiltering) return [];
    const element = elementAt(live, tileId);
    if (element === null || !isTile(element) || element.chartId === undefined) return [];
    if (drillShown(tileId) !== undefined) return [];
    // As drawn: what the filters, and the other tiles' cross-filters, leave
    // of it, as `tileItemsOf` reads it (T405's review).
    const spec = withFiltered.specs[element.chartId] ?? drawn.specs[element.chartId];
    if (spec === undefined || memberOn(spec.encoding, 'x') === undefined) return [];
    if (!clickMarksCategory(spec)) return [];
    try {
      return seriesOf(spec).categories.filter(
        (value) => value !== '' && !value.startsWith(`${OTHER_LABEL} (`),
      );
    } catch {
      return [];
    }
  };

  /**
   * A focused tile's keys in cross-filter mode (T405): the arrows move
   * between its items without filtering, said politely, since each filter
   * asks the other tiles again; Space filters the others by the one focused,
   * as a click on it does, and on the item it filters by takes it back.
   * Escape is the dashboard's, which clears them all (AC-119).
   */
  const onTileCrossKey = (event: React.KeyboardEvent, tileId: string) => {
    const element = elementAt(live, tileId);
    if (element === null || !isTile(element) || element.chartId === undefined) return;
    const chartId = element.chartId;
    const items = crossItemsOf(tileId);
    if (items.length === 0) return;
    // Within what the tile now draws, should its items have narrowed since
    // (T405's review).
    const held = markFocus[tileId];
    const state = { focused: Math.min(held?.focused ?? 0, items.length - 1), anchor: null };
    const result = keyToMarking(event.key, { shift: false, toggle: false }, state, items.length);
    if (!result.handled) return;
    event.preventDefault();
    setMarkFocus((now) => ({ ...now, [tileId]: { focused: result.focused, anchor: null } }));
    setKeyShownOn(tileId);
    const item = items[result.focused];
    if (item === undefined) return;
    if (result.action === 'none') {
      setCrossSaid(
        `${item}, ${String(result.focused + 1)} of ${String(items.length)}. Space filters the other tiles by it.`,
      );
      return;
    }
    const spec = drawn.specs[chartId];
    const value = spec === undefined ? undefined : clickedValue(spec, { name: item });
    const had = crossSelections.some(
      (each) => each.from === tileId && each.member === value?.member && each.value === value.value,
    );
    onItemClick(tileId, chartId, { name: item });
    setCrossSaid(had ? `Stopped filtering by ${item}.` : `Filtering the other tiles by ${item}.`);
  };

  /** The items a focused tile's keys move between, in the dashboard's mode. */
  const keyItemsOf = (tileId: string) =>
    crossFiltering ? crossItemsOf(tileId) : markableItemsOf(tileId);

  /**
   * The items a tile draws, each as a click on it marks it (AC-115): its x
   * categories as the filters leave them (what is on screen, not the
   * unfiltered answer), none blank — a click marks no blank — and not Top N's
   * "Other", which stands for many. None for a chart whose click marks its
   * series, its panel or its rows instead, where these would not be its items.
   */
  const tileItemsOf = (tileId: string): MarkedItem[] | undefined => {
    const element = elementAt(live, tileId);
    if (element === null || !isTile(element) || element.chartId === undefined) return undefined;
    const spec = withFiltered.specs[element.chartId] ?? drawn.specs[element.chartId];
    const member = spec === undefined ? undefined : memberOn(spec.encoding, 'x');
    if (spec === undefined || member === undefined || !clickMarksCategory(spec)) {
      return undefined;
    }
    let categories: readonly string[];
    try {
      categories = seriesOf(spec).categories;
    } catch {
      return undefined;
    }
    return categories
      .filter((value) => value !== '' && !value.startsWith(`${OTHER_LABEL} (`))
      .map((value) => [{ member, value }]);
  };

  /**
   * What a chart's tile is filtered by, as Cube filters (AC-115's Mark all):
   * the query it asks — dashboard filters, and the markings that limit it —
   * with its time range as a filter too. Its segments are not filters Cube
   * can be given back, and are left out.
   */
  const filtersOfChart = (chartId: string): CubeFilter[] => {
    const query = queryOf(chartId);
    if (query === undefined) return [];
    const filters = Array.isArray(query['filters']) ? (query['filters'] as CubeFilter[]) : [];
    const ranges = (
      Array.isArray(query['timeDimensions']) ? (query['timeDimensions'] as CubeFilter[]) : []
    ).flatMap((time) => {
      const range = time['dateRange'];
      if (typeof time['dimension'] !== 'string') return [];
      // Two bounds, or one relative range ("last 30 days"), which
      // `inDateRange` takes as its one value (data-apis.md).
      if (Array.isArray(range))
        return [{ member: time['dimension'], operator: 'inDateRange', values: range }];
      if (typeof range === 'string')
        return [{ member: time['dimension'], operator: 'inDateRange', values: [range] }];
      return [];
    });
    return [...filters, ...ranges];
  };

  /**
   * The marking keys on a focused tile in view mode (AC-100, direction.md
   * rule 52): the arrows move between items *without* marking, because each
   * marking change re-queries every tile using it and "select as you move"
   * would fire a round of queries per keystroke. Space marks, Ctrl and Space
   * toggle, Shift and an arrow extend, and Escape unmarks this tile's
   * marking (AC-094).
   */
  const onTileMarkKey = (event: React.KeyboardEvent, tileId: string) => {
    const element = elementAt(live, tileId);
    if (element === null || !isTile(element) || element.chartId === undefined) return;
    const markingId = marksWithOf(element);
    const items = markableItemsOf(tileId);
    if (markingId === undefined || items.length === 0) return;

    const spec = drawn.specs[element.chartId];
    const member = spec === undefined ? undefined : memberOn(spec.encoding, 'x');
    if (member === undefined) return;
    const before = markingOf(marks, markingId);
    const named = markings.find((each) => each.id === markingId);
    const say = (predicate: MarkingPredicate, extra?: string) => {
      if (named === undefined) return;
      const from = chartTitleOf(element.chartId ?? '');
      setMarkSaid(
        `${announceMarking({
          marking: named,
          markedCount: markedCount(predicate),
          ...(from === undefined ? {} : { tileName: from }),
        })}${extra ?? ''}`,
      );
    };

    if (event.key === 'Escape') {
      event.preventDefault();
      const cleared = markingOf(
        clearTileMarking(marks, { ...element, marksWith: markingId }),
        markingId,
      );
      if (cleared === before) return;
      setMarks((now) => withMarking(now, markingId, cleared));
      say(cleared);
      return;
    }

    const state = markFocus[tileId] ?? { focused: 0, anchor: null };
    const result = keyToMarking(
      event.key,
      { shift: event.shiftKey, toggle: event.ctrlKey || event.metaKey },
      state,
      items.length,
    );
    // Tab above all: a tile that swallowed it would be a keyboard trap.
    if (!result.handled) return;
    event.preventDefault();
    setMarkFocus((now) => ({
      ...now,
      [tileId]: { focused: result.focused, anchor: result.anchor },
    }));
    // Drawn from now until the keyboard leaves the tile (T306).
    setKeyShownOn(tileId);

    const itemAt = (index: number) => [{ member, value: items[index] ?? '' }];
    switch (result.action) {
      case 'none': {
        // Moved, not marked. Said, because nothing on screen says which item
        // the keyboard is on (rule 52).
        setMarkSaid(
          `${items[result.focused] ?? ''}, ${String(result.focused + 1)} of ${String(items.length)}. Space marks.`,
        );
        return;
      }
      case 'replace':
      case 'toggle': {
        const toggling = result.action === 'toggle';
        // As a Ctrl-click: a tile marked whole is its items again first (AC-115),
        // and one with more than a marking holds is said so, not cut short.
        const expanded = toggling
          ? expandWholeTile(before, tileId, tileItemsOf(tileId) ?? [])
          : { predicate: before, refused: 0 };
        if (expanded.refused > 0) {
          setMarkSaid(
            `This tile is marked whole and has more items than a marking holds (${MARKING_ITEM_LIMIT.toLocaleString('en-GB')}). Unmark it to mark its items one by one.`,
          );
          return;
        }
        const after = applyItemClick(expanded.predicate, itemAt(result.focused), {
          toggle: toggling,
        });
        setMarks((now) => withMarking(now, markingId, after));
        noteSource(markingId, tileId);
        say(after);
        return;
      }
      case 'extend': {
        const [from, to] = result.range ?? [result.focused, result.focused];
        const reach = [];
        for (let index = Math.min(from, to); index <= Math.max(from, to); index += 1) {
          reach.push(itemAt(index));
        }
        const after = addItemsWithinLimit({ ...EMPTY_PREDICATE }, reach);
        setMarks((now) => withMarking(now, markingId, after.predicate));
        noteSource(markingId, tileId);
        say(after.predicate, after.message === undefined ? '' : `. ${after.message}`);
        return;
      }
    }
  };

  /** A tile's name: the title of the chart it draws (AC-119). */
  const chartTitleOfTile = useCallback(
    (tileId: string) => {
      const tile = chartTilesOf(live).find((each) => each.tileId === tileId);
      return tile?.chartId === undefined ? undefined : chartTitleOf(tile.chartId);
    },
    // `chartTitleOf` reads `drawn`, which is what changes when a title does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, drawn],
  );

  /**
   * What each highlighted tile draws over its own answer (AC-117): the same
   * question asked with the selection, which is a second answer from Cube —
   * a measure over a subset is not a fraction of the measure over everything.
   */
  const highlightReached = useMemo(() => {
    const asked: Record<string, ActiveFilter[]> = {};
    for (const [chartId, effects] of Object.entries(crossEffects.perChart)) {
      const highlight = effects.highlight;
      if (highlight === undefined || highlight.kind !== 'share') continue;
      asked[chartId] = [
        ...(reached[chartId] ?? []),
        {
          filter: {
            id: `cross-highlight:${highlight.selection.from}`,
            widget: 'checkbox' as const,
            // By the name this chart's own cube or view takes it by: a view
            // reaches a cube's member through its own (AC-079).
            member: crossEffects.askHighlightAs[chartId] ?? highlight.selection.member,
          },
          value: { kind: 'values' as const, values: [highlight.selection.value] },
        },
      ];
    }
    return asked;
  }, [crossEffects, reached]);
  const [highlighted, setHighlighted] = useState<FilteredResults>({});
  const onHighlighted = useCallback((results: FilteredResults) => {
    setHighlighted((before) => keepLastAnswers(before, results));
  }, []);

  /**
   * Each chart's spec with the marking its tile shows (AC-096), and what that
   * marking holds now. Read at render, never pushed: a tile on a page tab
   * nobody has opened yet draws the same marking as the ones on screen the
   * moment it appears, which is what AC-095 asks across page tabs.
   */
  const markedSpecs = useMemo(() => {
    if (!marking) return undefined;
    const byChart: Record<string, { readonly markingId: string; readonly colour: string }> = {};
    for (const tile of chartTilesOf(live)) {
      const element = elementAt(live, tile.tileId);
      if (tile.chartId === undefined || element === null || !isTile(element)) continue;
      // The tile's own marking, or the dashboard's default for one saved
      // before the setting existed; `''` is "(None)".
      const own = element.marksWith ?? defaultMarking?.id;
      const markingId = own === '' ? undefined : own;
      const found = markings.find((each) => each.id === markingId);
      if (markingId === undefined || found === undefined) continue;
      byChart[tile.chartId] ??= { markingId, colour: markingColour(found.slot, theme) };
    }
    return byChart;
  }, [marking, live, markings, defaultMarking, theme]);

  /**
   * A tile whose cube or view cannot reach the members a marking names is
   * left unmarked and says so (AC-103, direction.md §7a rule 18). Silently
   * unbrushed would read as "nothing of yours is in here", which is a
   * different and wrong answer; a query error would be worse still.
   */
  const notLinked = useMemo(() => {
    const said: Record<string, string> = {};
    for (const [chartId, shown] of Object.entries(markedSpecs ?? {})) {
      const predicate = markingOf(marks, shown.markingId);
      if (isEmptyPredicate(predicate)) continue;
      // Every member it names, a whole tile's included (AC-103).
      const reachable = markingMembers(predicate).filter(
        (member) => reachOf(member, chartId) !== false,
      );
      // Naming what it cannot reach by its title (AC-220).
      const applicability = markingApplicability(predicate, reachable, memberTitle);
      if (!applicability.linked) said[chartId] = applicability.label;
    }
    return said;
  }, [markedSpecs, marks, reachOf, memberTitle]);

  /**
   * Each marked tile's marked share, where its items are partly marked (T388,
   * AC-104): a tile that doesn't group by a member its marking names is asked
   * its own question once more, with the marking in its filters — one more
   * query a marking change, and its own answer never asked again, so it stays
   * cached. A tile the marking can't reach says so instead (AC-103).
   */
  const markedShareReached = useMemo(() => {
    const asked: Record<string, ActiveFilter[]> = {};
    for (const [chartId, shown] of Object.entries(markedSpecs ?? {})) {
      if (notLinked[chartId] !== undefined) continue;
      // A limited tile waiting on its marking draws no chart to share (T388's review).
      if (limitedTiles.waiting[chartId] === true) continue;
      const chart = drawn.documents?.[chartId]?.chart;
      if (chart === undefined) continue;
      const predicate = markingOf(marks, shown.markingId);
      const reach = (member: string) => reachOf(member, chartId);
      // Grouped as its query groups: a box plot's "Each point is" too.
      const groupings = [
        ...chart.wells.dimensions,
        ...chart.wells.timeDimensions,
        ...(chart.wells.eachPointIs === undefined ? [] : [chart.wells.eachPointIs]),
      ];
      if (!needsMarkedShare(groupings, predicate, reach)) continue;
      const share = markedShareFilter(predicate, reach);
      if (share === undefined || 'unreached' in share) continue;
      asked[chartId] = [
        ...(reached[chartId] ?? []),
        {
          filter: {
            id: `marked-share:${shown.markingId}`,
            widget: 'checkbox' as const,
            member: markingMembers(predicate)[0] ?? '',
          },
          value: { kind: 'cube' as const, filter: share.filter, words: '' },
        },
      ];
    }
    return asked;
  }, [markedSpecs, notLinked, limitedTiles.waiting, drawn.documents, marks, reached, reachOf]);
  /**
   * Each share asked as its tile's own answer was, less what would make its
   * rows another chart's (T388's review): under the tile's own limit, drawn
   * as the tile's type rather than one recommended from the share's rows,
   * and with every item in it — Top N and a result limit rank and cut by the
   * share's own values, which would leave its items not the tile's.
   */
  const markedShareLimits = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(limitedTiles.asked).filter(([chartId]) => chartId in markedShareReached),
      ),
    [limitedTiles.asked, markedShareReached],
  );
  const markedShareDocuments = useMemo(() => {
    const documents: Record<string, ChartDocument> = {};
    for (const chartId of Object.keys(markedShareReached)) {
      const document = drawn.documents?.[chartId];
      if (document === undefined) continue;
      const options = { ...document.chart.options };
      delete options['topN'];
      delete options['rowLimit'];
      const chartType = drawn.specs[chartId]?.chartType ?? document.chart.chartType;
      documents[chartId] = {
        ...document,
        chart: { ...document.chart, options, ...(chartType === undefined ? {} : { chartType }) },
      };
    }
    return documents;
  }, [markedShareReached, drawn.documents, drawn.specs]);
  /** Each measure's aggregation, from the model: whether its marked share is a part of it (T387). */
  const aggTypes = useMemo(
    () =>
      Object.fromEntries(
        allMembers(model).flatMap((member) =>
          member.kind === 'measure' && member.aggType !== undefined
            ? [[member.name, member.aggType] as const]
            : [],
        ),
      ),
    [model],
  );
  const [markedShares, setMarkedShares] = useState<FilteredResults>({});
  const onMarkedShares = useCallback((results: FilteredResults) => {
    setMarkedShares((before) => keepLastAnswers(before, results));
  }, []);

  /**
   * What a limited tile shows instead of its chart (AC-109, AC-111), by
   * chart. A tile with marked data to show is not here: it draws the limited
   * answer like any other chart.
   *
   * AC-111 before AC-109, as direction.md asks — "if a limiting marking isn't
   * empty but its items are all filtered out, the tile says so instead of
   * showing the nothing-marked state". They cannot both apply to one tile
   * here, because the first branch returns, but the order is the one to keep:
   * telling someone to go and mark something that *is* marked sends them
   * looking for a bug.
   */
  const limitedStates = useMemo(() => {
    const states: Record<string, LimitedState> = {};
    /**
     * Gated on the mode exactly as `limitedTiles` is, and it has to be: with
     * the limit not applied, `waiting` is never set, and a limited tile that
     * happened to return no rows under a *cross-filter* would be told its
     * marks were hidden by the filters when nothing is marked at all.
     *
     * Cross-filter mode has no markings anywhere in the dashboard (AC-120),
     * so a marking limit has nothing to mean there.
     */
    if (interactions.mode !== 'markings') return states;

    for (const tile of chartTilesOf(live)) {
      const element = elementAt(live, tile.tileId);
      if (tile.chartId === undefined || element === null || !isTile(element)) continue;
      const limitedBy = allowedLimits(
        element.limitedBy ?? [],
        element.marksWith ?? defaultMarkingOf(live)?.id,
      );
      if (limitedBy.length === 0) continue;

      if (limitedTiles.waiting[tile.chartId] === true) {
        const state = element.nothingMarked ?? NOTHING_MARKED_DEFAULT;
        // "All data" is the tile drawing normally, so it is not a state to
        // render — it is the absence of one.
        if (state === 'all') continue;
        states[tile.chartId] = {
          kind: 'waiting',
          state,
          // The stored message (AC-110 writes one when the tile is first
          // limited); composed here only for a tile limited before that, or
          // by hand.
          message:
            element.nothingMarkedMessage ??
            defaultNothingMarkedMessage(
              masterTileNames(live, limitedBy, chartTitleOfTile, defaultMarkingOf(live)?.id),
            ),
        };
        continue;
      }

      /**
       * Marked, but nothing came back. Said only while a filter is actually
       * *in effect* on the tile: with no filters, an empty answer means the
       * marked items have no data here, and blaming the filters would send
       * the user to clear filters that do not exist.
       *
       * "In effect" excludes the ones Cube refused to join and left off the
       * query (AC-079) — the same subtraction `inEffect` makes below. A tile
       * whose only reaching filter was dropped is not being filtered by it.
       */
      const answer = filtered[tile.chartId]?.chart;
      const rows = answer !== undefined && 'spec' in answer ? answer.spec.rows : undefined;
      const refused = filtered[tile.chartId]?.uncovered ?? [];
      const applied = (reached[tile.chartId] ?? []).filter(
        ({ filter }) => !refused.includes(filter.id),
      );
      if (rows?.length === 0 && applied.length > 0) states[tile.chartId] = { kind: 'filtered-out' };
    }
    return states;
  }, [interactions.mode, live, limitedTiles, filtered, reached, chartTitleOfTile]);

  /** Each tile's spec with the highlight it draws, where a pair asks for one. */
  const withHighlights = useMemo(() => {
    if (Object.keys(crossEffects.perChart).length === 0) return formatted;
    const specs: Record<string, RenderSpec> = { ...formatted };
    for (const [chartId, effects] of Object.entries(crossEffects.perChart)) {
      const highlight = effects.highlight;
      const spec = specs[chartId];
      if (highlight === undefined || spec === undefined) continue;
      const answer = highlighted[chartId]?.chart;
      const rows = answer !== undefined && 'spec' in answer ? answer.spec.rows : undefined;
      // A share with no answer yet draws the tile as it is: a faded chart
      // with nothing over it would say the selection matched nothing.
      if (highlight.kind === 'share' && rows === undefined) continue;
      specs[chartId] = {
        ...spec,
        highlight: {
          member: highlight.selection.member,
          value: highlight.selection.value,
          kind: highlight.kind,
          ...(rows === undefined ? {} : { rows }),
        },
      };
    }
    return specs;
  }, [formatted, crossEffects, highlighted]);

  /** The same specs, each carrying the marking its tile shows (AC-096). */
  const withMarkings = useMemo(() => {
    if (markedSpecs === undefined || Object.keys(markedSpecs).length === 0) return withHighlights;
    const specs: Record<string, RenderSpec> = { ...withHighlights };
    for (const [chartId, shown] of Object.entries(markedSpecs)) {
      const spec = specs[chartId];
      // A tile that cannot reach the marking's members draws none of it
      // (AC-103); its label says why.
      if (spec === undefined || notLinked[chartId] !== undefined) continue;
      // Its marked share, where its items are partly marked (T388, AC-104),
      // once asked for this marking and answered.
      // Only this marking's own answer (T388's review): not the last one's
      // while this one is asked, and not the tile's whole where Cube would not
      // join the marking's filter to it and the filter was left off.
      const answer = markedShareReached[chartId] === undefined ? undefined : markedShares[chartId];
      const share =
        answer === undefined ||
        answer.asking ||
        answer.unfiltered ||
        answer.uncovered.some((id) => id.startsWith('marked-share:')) ||
        answer.chart === undefined ||
        !('spec' in answer.chart)
          ? undefined
          : answer.chart.spec.rows;
      specs[chartId] = {
        ...spec,
        marking: {
          predicate: markingOf(marks, shown.markingId),
          colour: shown.colour,
          ...(share === undefined ? {} : { share, aggTypes }),
        },
      };
    }
    return specs;
  }, [withHighlights, markedSpecs, marks, notLinked, markedShareReached, markedShares, aggTypes]);

  // The assignment is held across renders, so a filter that hides a member
  // does not hand its colour to whoever is now first (AC-039).
  // The dashboard as the session has it: a tile added in it — a duplicate's
  // copy (T068) — is drawn, and coloured, before the dashboard is saved.
  const coloured = useDashboardColours(live, withMarkings);
  /**
   * The charts of tiles marked whole (Mark all, AC-115) that are still
   * filtered as they were then: each draws every item marked. One filtered
   * otherwise since is read row by row like any other (T121's third review).
   * Keyed by that set, so the specs change only when it does.
   */
  const wholeKey = Object.values(marks)
    .flatMap((predicate) => predicate.wholes ?? [])
    .flatMap((whole) => {
      const element = elementAt(live, whole.tileId);
      if (element === null || !isTile(element) || element.chartId === undefined) return [];
      return JSON.stringify(filtersOfChart(element.chartId)) === JSON.stringify(whole.filters)
        ? [element.chartId]
        : [];
    })
    .sort()
    .join('\n');
  const withWholes = useMemo(() => {
    if (wholeKey === '') return coloured;
    const specs: Record<string, RenderSpec> = { ...coloured };
    for (const chartId of wholeKey.split('\n')) {
      const spec = specs[chartId];
      if (spec?.marking !== undefined)
        specs[chartId] = { ...spec, marking: { ...spec.marking, whole: true } };
    }
    return specs;
  }, [coloured, wholeKey]);
  /**
   * A tile's items that it draws marked by this marking, as `render.ts` marks
   * them: every one while the tile is marked whole and still filtered as it
   * was then, or else each whose drawn rows match the marking. For the menu's
   * "n of N" (AC-247) and Copy › Marked values (AC-241) alike, so neither
   * counts or lists an item the tile does not draw marked (T267's and T271's
   * reviews: a Mark all counted, and listed, every item after the filters had
   * changed). None for a tile whose click marks rows or series.
   */
  const drawnMarkedItemsOf = (
    tileId: string,
    predicate: MarkingPredicate,
  ): MarkedItem[] | undefined => {
    const items = tileItemsOf(tileId);
    const element = elementAt(live, tileId);
    const chartId = element !== null && isTile(element) ? element.chartId : undefined;
    const spec = chartId === undefined ? undefined : withWholes[chartId];
    if (items === undefined || spec === undefined) return undefined;
    if (spec.marking?.whole === true) return items;
    return items.filter((item) => {
      const part = item[0];
      if (part === undefined) return false;
      return spec.rows.some(
        (row) =>
          String(row[part.member]) === String(part.value) && matchesPredicate(predicate, row),
      );
    });
  };
  /**
   * Each filtered chart's filters in words, for the empty state (AC-043):
   * named by the field each was set on — the filter bar's field, not the name
   * a view takes it by.
   */
  const inEffect = useMemo(() => {
    const setOn = new Map((live.filters ?? []).map((filter) => [filter.id, filter.member ?? '']));
    /**
     * A marking limit is a filter in effect too (T088's note), and the empty
     * state has to name it. Without this a limited tile that returns no rows
     * with no dashboard filter on it shows AC-043's "no data matches" naming
     * nothing at all — leaving the reader to guess that the marking they made
     * in another tile is what emptied this one.
     */
    const marked = new Set(Object.keys(limitedTiles.asked));
    return Object.fromEntries(
      [...new Set([...Object.keys(reached), ...marked])].map((chartId) => {
        const refused = filtered[chartId]?.uncovered ?? [];
        return [
          chartId,
          [
            // A filter made from a marking says what it keeps itself (AC-113).
            ...(reached[chartId] ?? [])
              .filter(({ filter }) => !refused.includes(filter.id))
              .map(({ filter, value }) => {
                const field = setOn.get(filter.id) ?? filter.member ?? '';
                return describeFilter(memberTitle?.(field) ?? field, value);
              }),
            ...(marked.has(chartId) ? ['limited to what is marked'] : []),
          ],
        ];
      }),
    );
  }, [reached, filtered, live.filters, memberTitle, limitedTiles.asked]);

  /**
   * What a link tile passes on (AC-064): the filters in effect, and only
   * those. Every value held went before — one kept for Undo on a field its
   * filter has left, or one its widget cannot use — and the target opened
   * filtered by something this dashboard was not showing (T070's review).
   */
  const carried = useMemo(
    () =>
      activeFilters(live.filters ?? [], filterValues).map(({ filter, value }) => ({
        id: filter.id,
        member: filter.member ?? '',
        value,
      })),
    [live.filters, filterValues],
  );

  /**
   * Not covered (AC-079): the filters the model rules out, and those Cube
   * refused to join to the chart when asked (`FilteredCharts`).
   */
  const marked = useMemo(() => {
    const all: Record<string, ActiveFilter[]> = {};
    for (const [chartId, filters] of Object.entries(notCovered)) all[chartId] = [...filters];
    for (const [chartId, applied] of Object.entries(reached)) {
      const refused = filtered[chartId]?.uncovered ?? [];
      const more = applied.filter(({ filter }) => refused.includes(filter.id));
      if (more.length > 0) all[chartId] = [...(all[chartId] ?? []), ...more];
    }
    /**
     * And a highlight Cube would not join to the tile (AC-117, and the user's
     * decision of 2026-09-22): the same note, because it is the same answer —
     * the tile is left as it is, and says which field could not reach it.
     * Without this it drew as though nothing had been clicked (T123's review).
     */
    for (const [chartId, effects] of Object.entries(crossEffects.perChart)) {
      const highlight = effects.highlight;
      if (highlight === undefined || highlight.kind !== 'share') continue;
      const result = highlighted[chartId];
      const asked = `cross-highlight:${highlight.selection.from}`;
      if (result?.unfiltered !== true && !(result?.uncovered ?? []).includes(asked)) continue;
      all[chartId] = [
        ...(all[chartId] ?? []),
        {
          filter: {
            id: asked,
            widget: 'checkbox' as const,
            member: highlight.selection.member,
          },
          value: { kind: 'values' as const, values: [highlight.selection.value] },
        },
      ];
    }
    return all;
  }, [notCovered, reached, filtered, crossEffects, highlighted]);

  /** Whether a shape over this tile can mark anything (T190 stage 7's review). */
  const marksShapes = (tileId: string, chartId: string) => {
    const tile = elementAt(live, tileId);
    const type = drawn.specs[chartId]?.chartType;
    const markingId = tile !== null && isTile(tile) ? marksWithOf(tile) : undefined;
    return (
      markingId !== undefined &&
      markingId !== '' &&
      notLinked[chartId] === undefined &&
      type !== undefined &&
      !['pie', 'donut', 'treemap', 'kpi', 'table', 'pivot'].includes(type)
    );
  };

  /**
   * The x axis a range-mode drag marks along (T386, AC-093): a time
   * dimension's buckets, on a chart that draws them along a vertical chart's
   * category axis, where the tile's marking is in range mode. Nothing
   * elsewhere: a category of words has no span between two of its values.
   */
  const rangeAxisOf = (tileId: string, chartId: string) => {
    if (!marksShapes(tileId, chartId)) return undefined;
    const tile = elementAt(live, tileId);
    const markingId = tile !== null && isTile(tile) ? marksWithOf(tile) : undefined;
    const marking = markings.find((each) => each.id === markingId);
    const spec = drawn.specs[chartId];
    if (marking === undefined || markingModeOf(marking) !== 'range' || spec === undefined)
      return undefined;
    if (!RANGE_TYPES.has(spec.chartType)) return undefined;
    const member = memberOn(spec.encoding, 'x');
    const granularity = member === undefined ? undefined : spec.granularities?.[member];
    return member === undefined || granularity === undefined
      ? undefined
      : { member, granularity, marking };
  };
  const rangeMarks = (tileId: string, chartId: string) =>
    rangeAxisOf(tileId, chartId) !== undefined;

  /**
   * A drag along a tile's axis in range mode (T386, AC-093): the buckets
   * between its ends, bounds that stay as they are whatever the filters do.
   * Plain, it replaces the marking, as a plain drag does; with Ctrl or ⌘ it
   * adds a range and keeps what was marked (`applyAxisRange`).
   */
  const onMarkRange = (
    tileId: string,
    chartId: string,
    ends: { from: string; to: string },
    add: boolean,
  ) => {
    const axis = rangeAxisOf(tileId, chartId);
    if (axis === undefined) return;
    const range = rangeFromDrag({
      member: axis.member,
      granularity: axis.granularity,
      from: ends.from,
      to: ends.to,
    });
    const after = applyAxisRange(markingOf(marks, axis.marking.id), range, { add });
    setMarks((now) => withMarking(now, axis.marking.id, after));
    noteSource(axis.marking.id, tileId);
    const from = chartTitleOf(chartId);
    // Said with its count and where from (AC-101).
    setMarkSaid(
      announceMarking({
        marking: axis.marking,
        markedCount: markedCount(after),
        ...(from === undefined ? {} : { tileName: from }),
      }),
    );
  };

  /**
   * What "Mark range…" asks among (T636): the axis' buckets as the tile draws
   * them, in its order, each by its words (a month as "Feb 2026"), and the
   * axis by its member's title. The same buckets a drag's ends fall on.
   */
  const rangeDialogOf = ({ chartId }: { chartId: string }) => {
    // As the tile draws it: none, where its filtered answer failed (T636's review).
    const spec = formatted[chartId];
    const member = spec === undefined ? undefined : memberOn(spec.encoding, 'x');
    const write = spec === undefined ? undefined : nameWriter(spec, member);
    const buckets =
      spec === undefined || member === undefined
        ? []
        : distinctValues(spec.rows, member).map((value) => ({
            value,
            label: write?.(value) ?? value,
          }));
    return {
      axis: member === undefined ? 'its axis' : (memberTitle?.(member) ?? member),
      buckets,
    };
  };

  /** A tile's marking's ranges over its x member, as stripes in its colour (AC-093). */
  const rangeStripesOn = (tileId: string, chartId: string) => {
    const tile = elementAt(live, tileId);
    const markingId = tile !== null && isTile(tile) ? marksWithOf(tile) : undefined;
    const marking = markings.find((each) => each.id === markingId);
    const spec = drawn.specs[chartId];
    const member = spec === undefined ? undefined : memberOn(spec.encoding, 'x');
    // Not on a tile the marking can't reach, which says so instead (T386's review).
    if (marking === undefined || member === undefined || notLinked[chartId] !== undefined)
      return undefined;
    return markingOf(marks, marking.id)
      .ranges.filter((range) => range.member === member)
      .map((range) => ({ from: range.from, to: range.to, slot: marking.slot }));
  };

  const charts: TileCharts = {
    specs: withWholes,
    errors: withFiltered.errors,
    loading,
    /**
     * A click on a mark: it cross-filters, or it marks, by the dashboard's
     * mode — never both (AC-117, AC-120) — and neither while editing, where
     * a click picks the tile up.
     */
    ...(crossFiltering ? { onItemClick: onItemClickSaid } : {}),
    ...(marking
      ? {
          onMarkClick,
          onMarkShape,
          marksShapes,
          // A span of the axis, in a marking's range mode (T386, AC-093).
          onMarkRange,
          rangeMarks,
          rangeStripesOn,
          notLinked,
        }
      : {}),
    /**
     * Not gated on `marking`: a limited tile explains itself while the
     * dashboard is being edited too, where clicking selects the tile rather
     * than marking (AC-106). An author who could not see the nothing-marked
     * state would be laying out a tile whose real appearance they never see.
     */
    limitedStates,
    ...(marking
      ? {
          /**
           * A table tile's rows, markable only where the cube has a primary
           * key to identify them by (AC-092). The key comes from the model,
           * not from the rows: a column that happens to be unique in one
           * answer is not an identity.
           */
          rowMarkingOn: (tileId: string, chartId: string) => {
            const element = elementAt(live, tileId);
            if (element === null || !isTile(element)) return undefined;
            const markingId = marksWithOf(element);
            if (markingId === undefined) return undefined;
            const cube = drawn.documents?.[chartId]?.chart.source.cube;
            const key = cube === undefined ? undefined : primaryKey?.(cube);
            return {
              predicate: markingOf(marks, markingId),
              ...(key === undefined ? {} : { primaryKey: key }),
              onMark: (predicate: MarkingPredicate) => {
                setMarks((now) => withMarking(now, markingId, predicate));
                noteSource(markingId, tileId);
                const named = markings.find((each) => each.id === markingId);
                const from = chartTitleOf(chartId);
                if (named === undefined) return;
                setMarkSaid(
                  announceMarking({
                    marking: named,
                    markedCount: markedCount(predicate),
                    ...(from === undefined ? {} : { tileName: from }),
                  }),
                );
              },
            };
          },
        }
      : {}),
    // Only for a chart whose query can be read, as the SQL dialog's.
    onViewQuery: (chartId: string, tileId: string) => {
      if (queryOf(chartId) !== undefined) setQueryFor({ chartId, tileId });
    },
    dataAsOfOf: (chartId: string, tileId: string) => () =>
      dataAsOf(
        {
          // A drilled tile's own answer — its pre-aggregation or the database —
          // and never its chart's while the drill's is on its way (AC-238).
          answered: (() => {
            const shown = drillShown(tileId);
            if (shown === undefined) return withFiltered.answered?.[chartId];
            return shown.state.kind === 'done' ? shown.state.answered : undefined;
          })(),
          schedules,
          onRefresh:
            onRefresh === undefined
              ? undefined
              : () => {
                  refreshTile(chartId);
                },
          // Off when the tile's ↻ is, for its reason (T273's review).
          refreshBlocked:
            refreshable === false ||
            loading ||
            refreshing?.has(chartId) === true ||
            refreshingFiltered.has(chartId) ||
            withFiltered.pending.has(chartId)
              ? 'Its newest answer is still on its way.'
              : undefined,
          onWhyNot: () => {
            if (queryOf(chartId) !== undefined) setWhyNotFor({ chartId, tileId });
          },
          // Another workspace: the whole page, as the tile's other links go.
          onOpen: (href) => {
            window.location.assign(href);
          },
        },
        new Date(),
        (date) => clockTimeOf(date),
      ),
    // A saved chart to copy: not while previewing another context, whose
    // answers are not the chart.
    // Nor in a review's read-only drawing (T356's review): nothing is taken from it.
    // Nor for one with no dashboard to change (T760, AC-277).
    ...(preview === undefined && !readOnly && mayCopyToDashboard
      ? {
          onCopyToDashboard: (chartId: string, tileId: string) => {
            if (drawn.documents?.[chartId] !== undefined) setCopyFor({ chartId, tileId });
          },
        }
      : {}),
    // Its menu, from a right-click on its chart or its keys, in view mode only:
    // while editing, the tile's own menu is the arranging one.
    ...(sessionEditing
      ? {}
      : {
          onTileMenu: (tileId: string, at?: { x: number; y: number }) => {
            setMenuRequest((was) => ({
              tileId,
              seq: (was?.seq ?? 0) + 1,
              ...(at === undefined ? {} : { at }),
            }));
          },
          menuRequestOn: (tileId: string) =>
            menuRequest?.tileId === tileId
              ? {
                  seq: menuRequest.seq,
                  ...(menuRequest.at === undefined ? {} : { at: menuRequest.at }),
                }
              : undefined,
        }),
    onViewRows: (chartId: string, tileId: string, marked: boolean) => {
      if (rowsQueryOf(chartId, tileId, marked, 1) !== undefined) {
        setRowsFor({ chartId, tileId, marked });
      }
    },
    // On for one tile at a time; on for another tile, it follows that one.
    // Off from the menu, the focus stays in the menu, which a Space leaves
    // open (T269's review).
    detailsPanelOf: (chartId: string, tileId: string) => {
      const on = panelFor?.tileId === tileId;
      return {
        on,
        onToggle: () => {
          setPanelFor(on ? undefined : { chartId, tileId });
        },
      };
    },
    drillByOf: (chartId: string, tileId: string, items: string, markingName: string) => {
      const chart = drawn.documents?.[chartId];
      if (chart === undefined) return undefined;
      return {
        items,
        // Asked when the menu opens: the marking's members as this tile names them.
        options: () => {
          const spec = toChartSpec(chart);
          const element = elementAt(live, tileId);
          const markingId = element !== null && isTile(element) ? marksWithOf(element) : undefined;
          const marked =
            markingId === undefined
              ? []
              : markingMembers(markingOf(marks, markingId)).map((member) => {
                  const as = reachOf(member, chartId);
                  return typeof as === 'string' ? as : member;
                });
          return drillOptions(model, {
            source: spec.cube,
            dimensions: spec.dimensions,
            timeDimensions: granularitiesOf(spec.timeDimensions, spec.granularities),
            marked,
          });
        },
        onDrill: (option: DrillOption) => {
          drill({ chartId, tileId, option, items, markingName });
        },
      };
    },
    drilledOf: (tileId: string): DrilledView | undefined => {
      const drilled = drillShown(tileId);
      if (drilled === undefined) return undefined;
      const { state, option } = drilled;
      const again = { ...drilled, tileId };
      return {
        crumb: {
          title: chartTitleOf(drilled.chartId) ?? 'this chart',
          items: drilled.items,
          by:
            option.granularity === undefined
              ? option.title
              : `${option.title} by ${option.granularity}`,
        },
        markingName: drilled.markingName,
        loading: state.kind === 'loading',
        ...(state.kind === 'done'
          ? {
              // Written with the model's formats and titles, as every tile is (T270's review).
              spec: withMemberLabels(state.spec, { formats, titles, shortTitles, measureTypes }),
              ...(state.answered === undefined ? {} : { answered: state.answered }),
            }
          : {}),
        ...(state.kind === 'failed' ? { error: state.error } : {}),
        // The drill asked again, as a tile's Retry asks its own chart again.
        onRetry: () => {
          drill(again);
        },
        // Back to the tile's own chart, which was never changed, and the focus
        // on its ⋯, where the drill was chosen (T270's review).
        onBack: () => {
          setDrills((now) =>
            Object.fromEntries(Object.entries(now).filter(([id]) => id !== tileId)),
          );
          requestAnimationFrame(() => {
            window.document
              .querySelector<HTMLElement>(`[data-view-menu="${CSS.escape(tileId)}"]`)
              ?.focus();
          });
        },
      };
    },
    exportRowsOf: (chartId: string, tileId: string) => async (signal: AbortSignal) => {
      const query = rowsQueryOf(chartId, tileId, true, DOWNLOADED);
      if (query === undefined) throw new Error('There is nothing marked to export.');
      if (typeof query === 'string') throw new Error(query);
      const result = (await loadTile({
        query,
        signal,
        ...(preview === undefined ? {} : { context: preview }),
        item,
      })) as { data?: unknown; total?: unknown };
      const rows = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
      const spec = drawn.specs[chartId];
      return {
        text: rowsCsvOf(rows, {
          // In the wells' order, as the chart's table (T393's review, AC-301).
          fields: spec?.fields ?? [],
          measures: spec?.measures ?? [],
          // The rows themselves, never a quick calculation's (AC-048): each
          // measure as the model writes and names it.
          formats: plainFormatsOf(spec),
          titles: plainTitlesOf(spec),
        }),
        written: rows.length,
        total: typeof result.total === 'number' ? result.total : undefined,
      };
    },
    ...(marking
      ? {
          /** Unmark what the tile marks with, as Escape on it does (AC-199). */
          onUnmark: (tileId: string) => {
            const element = elementAt(live, tileId);
            if (element === null || !isTile(element)) return;
            const markingId = marksWithOf(element);
            if (markingId === undefined || markingId === '') return;
            const cleared = markingOf(
              clearTileMarking(marks, { ...element, marksWith: markingId }),
              markingId,
            );
            setMarks((now) => withMarking(now, markingId, cleared));
            // Said, as every other change to a marking is (AC-101).
            const named = markings.find((each) => each.id === markingId);
            if (named === undefined) return;
            const from = element.chartId === undefined ? undefined : chartTitleOf(element.chartId);
            setMarkSaid(
              announceMarking({
                marking: named,
                markedCount: markedCount(cleared),
                ...(from === undefined ? {} : { tileName: from }),
              }),
            );
          },
          /**
           * Filter to marked and Filter out marked (AC-113, direction.md rule
           * 53): the marking the tile marks with, as one dashboard filter or
           * its negation, on the filter bar until removed — and the marking
           * cleared, so what is left is the filter, not two things saying one.
           */
          filterMarkedOn: (tileId: string, negate: boolean) => {
            const element = elementAt(live, tileId);
            if (element === null || !isTile(element)) return undefined;
            const markingId = marksWithOf(element);
            const named = markings.find((each) => each.id === markingId);
            if (markingId === undefined || named === undefined) return undefined;
            const predicate = markingOf(marks, markingId);
            const made = markFilterFrom(predicate, negate, {
              id: `mark-filter-${String((markFilterSeq.current += 1))}`,
              markingName: named.name,
              summary: markFilterWords(predicate),
            });
            if ('refused' in made) return made;
            return () => {
              setMarkFilters((now) => [...now, made]);
              setMarks((now) => withMarking(now, markingId, EMPTY_PREDICATE));
              // Said once, with the new number set (AC-493; design 19 B2):
              // the marking's chip goes with it, unsaid, as the filter
              // holds what it held.
              sayAfresh(
                setMarkSaid,
                filterChangeSaid({
                  kind: 'added',
                  what: markFilterSaid(made, filterTitle),
                  set: filtersSetWith(filterValues, [...markFilters, made]),
                }),
              );
            };
          },
          /**
           * "Mark range…" (T636; R66): on a tile a drag marks ranges on, as
           * `rangeMarks` has it, the dialog asking a from and a to.
           */
          // Only where a drag could mark: not on a drilled view, a limited
          // tile drawing its state, one whose filtered answer failed, or one
          // the filters left empty (T636's review, as `partsOn` has it).
          markRangeOn: (tileId: string, chartId: string) =>
            rangeMarks(tileId, chartId) &&
            drillShown(tileId) === undefined &&
            limitedStates[chartId] === undefined &&
            withFiltered.errors[chartId] === undefined &&
            (formatted[chartId]?.rows.length ?? 0) > 0
              ? () => {
                  setRangeFor({ tileId, chartId });
                }
              : undefined,
          /**
           * Invert marking and Mark all (AC-115): on the items the tile draws —
           * the categories a click or its keyboard marks — and on no other
           * tile's. Inverting adds a list, so it keeps to the cap and says so
           * (AC-102); Mark all is exempt.
           */
          markItemsOn: (tileId: string) => {
            const element = elementAt(live, tileId);
            if (element === null || !isTile(element) || element.chartId === undefined) {
              return undefined;
            }
            const markingId = marksWithOf(element);
            const tileItems = tileItemsOf(tileId);
            if (markingId === undefined || markingId === '' || tileItems === undefined) {
              return undefined;
            }
            if (tileItems.length === 0) return undefined;
            const chartId = element.chartId;
            return (how: 'invert' | 'all') => {
              const before = markingOf(marks, markingId);
              const after =
                how === 'invert'
                  ? invertTileItems(before, tileId, tileItems)
                  : // What the tile is filtered by, not what that matched (AC-102).
                    markAllOfTile(
                      before,
                      tileId,
                      filtersOfChart(chartId),
                      tileItems,
                      tileItems[0]?.[0]?.member,
                    );
              setMarks((now) => withMarking(now, markingId, after.predicate));
              noteSource(markingId, tileId);
              const named = markings.find((each) => each.id === markingId);
              if (named === undefined) return;
              const from = chartTitleOf(chartId);
              setMarkSaid(
                `${announceMarking({
                  marking: named,
                  markedCount: markedCount(after.predicate),
                  ...(from === undefined ? {} : { tileName: from }),
                })}${after.message === undefined ? '' : `. ${after.message}`}`,
              );
            };
          },
          markingOn: (tileId: string) => {
            const element = elementAt(live, tileId);
            if (element === null || !isTile(element)) return undefined;
            // A tile that cannot reach the marking shows no badge: its label
            // already says why it is not marked (AC-103).
            if (element.chartId !== undefined && notLinked[element.chartId] !== undefined) {
              return undefined;
            }
            const id = marksWithOf(element);
            const found = markings.find((each) => each.id === id);
            if (found === undefined) return undefined;
            const predicate = markingOf(marks, found.id);
            /**
             * The tile's own items and how many of them are marked (AC-247):
             * those Invert and Mark all name, each marked as the tile draws
             * it (`render.ts`) — the whole tile marked while still filtered
             * as it was then, or else one of the rows drawn for the item
             * matching the marking (T267's review: a Mark all counted every
             * item after the filters had changed, while the tile drew some).
             * None for a tile whose click marks rows or series, where "of N"
             * would count something else.
             */
            const onTile = () => {
              const items = tileItemsOf(tileId);
              const marked = drawnMarkedItemsOf(tileId, predicate);
              return items === undefined || marked === undefined
                ? undefined
                : { marked: marked.length, of: items.length };
            };
            // R81's types that only show its share say whose (T935, AC-098).
            const chartId = element.chartId;
            const shareShown =
              chartId !== undefined &&
              showsShareOnly(
                drawn.specs[chartId]?.chartType ?? '',
                chartId in markedShareReached,
                // A stack at 100 % shows the share too (T958), read as drawn,
                // with its measures' aggregations.
                formatted[chartId] !== undefined && isPercentStack(formatted[chartId]),
              )
                ? shareShownOf(predicate)
                : undefined;
            return {
              marking: found,
              colour: markingColour(found.slot, theme),
              markedCount: markedCount(predicate),
              ...(shareShown === undefined ? {} : { shareShown }),
              values: summariseMarking(predicate, memberTitle, 5, (id) => chartTitleOfTile(id)),
              // Copy › Marked values (T271, AC-241): a whole tile's items as
              // that tile draws them.
              valuesTsv: () =>
                markedValuesTsv(
                  predicate,
                  (member) => memberTitle?.(member),
                  (wholeTile) => drawnMarkedItemsOf(wholeTile, predicate),
                ),
              onTile,
            };
          },
        }
      : {}),
    /**
     * A tile's series and panels for its menu (T631, AC-176; R63, the user:
     * "Tile ⋯ menu entries"): each read as a click on its legend entry or
     * panel header reads it, so the menu and the pointer reach the same
     * marking or cross-filter. A scatter's points are its series, as a click
     * on one means. Only those the tile draws (`tilePartsOf`), and none on a
     * tile drawing something else: a drill, a marking limit's waiting state,
     * or its filtered answer's error (T631's review).
     */
    ...(marking || crossFiltering
      ? {
          partsOn: (tileId: string) => {
            const element = elementAt(live, tileId);
            if (element === null || !isTile(element) || element.chartId === undefined)
              return undefined;
            if (marking && marksWithOf(element) === undefined) return undefined;
            if (drillShown(tileId) !== undefined) return undefined;
            const chartId = element.chartId;
            if (limitedStates[chartId] !== undefined) return undefined;
            if (withFiltered.errors[chartId] !== undefined) return undefined;
            // As the tile draws it: filtered, with the model's formats (T632).
            const shown = formatted[chartId];
            if (shown === undefined) return undefined;
            const parts = tilePartsOf(shown);
            if (parts.series.length === 0 && parts.panels.length === 0) return undefined;
            // Which series the marking holds whole, as its legend entry marks
            // one: Ctrl+Enter takes those off (T638; the coordinator's call E (a)).
            const markingId = marking ? marksWithOf(element) : undefined;
            const held = markingId === undefined ? undefined : markingOf(marks, markingId);
            const series = parts.series.map((one) => {
              const part =
                held === undefined ? undefined : clickedValue(shown, { legend: one.value });
              return {
                ...one,
                marked:
                  part !== undefined &&
                  held !== undefined &&
                  isItemMarked(held, [{ member: part.member, value: part.value }]),
              };
            });
            const { panels } = parts;
            // `add`: Ctrl+Enter, added to the marking as a Ctrl-click on a
            // legend entry adds a series (T634; R64), and as a Ctrl-click on
            // a header adds a panel (T635): `markFromLegend` with add. A
            // series already marked is taken off instead (T638).
            const pick = (item: ClickedItem, said: string, add = false, off = false) => {
              if (marking) {
                onMarkClick(tileId, chartId, item, add, off);
                return;
              }
              const value = clickedValue(shown, item);
              const had = crossSelections.some(
                (each) =>
                  each.from === tileId &&
                  each.member === value?.member &&
                  each.value === value.value,
              );
              onItemClick(tileId, chartId, item);
              setCrossSaid(
                had ? `Stopped filtering by ${said}.` : `Filtering the other tiles by ${said}.`,
              );
            };
            return {
              verb: marking ? ('mark' as const) : ('filter' as const),
              series,
              panels,
              // Said by its label, as the legend writes it (T632).
              onSeries: (value: string, add?: boolean) => {
                const one = series.find((each) => each.value === value);
                pick(
                  { legend: value },
                  one?.label ?? value,
                  add,
                  add === true && one?.marked === true,
                );
              },
              // By its place among the panels drawn, as a header's click names one.
              onPanel: (index: number, add?: boolean) => {
                const panel = panels.find((one) => one.index === index);
                if (panel !== undefined) pick({ panelIndex: index }, panel.label, add);
              },
            };
          },
        }
      : {}),
    /**
     * The item its keyboard is on, while it has the keyboard (T306): a
     * marking's item, or in cross-filter mode the one Space filters by (T405).
     */
    ...(marking || crossFiltering
      ? {
          keyboardFocusOn: (tileId: string) =>
            keyShownOn === tileId
              ? keyItemsOf(tileId)[
                  Math.min(markFocus[tileId]?.focused ?? 0, keyItemsOf(tileId).length - 1)
                ]
              : undefined,
        }
      : {}),
    pending: withFiltered.pending,
    notCovered: marked,
    inEffect,
    carried,
    titleOf: chartTitleOf,
    memberTitle,
    /**
     * A text tile's tokens (T389, AC-116; direction.md, "Markdown tokens"):
     * a marking by its name, as the author sees it, trimmed and in any case,
     * as the prototype finds one; a measure over the rows its marking holds,
     * or over all data while it holds nothing — under the filters a chart on
     * the tile's page is under, and Filter to or out marked, as the
     * prototype's tokens are (T389's review).
     */
    textTokensOf: (tileId: string) => (token, key) => {
      const named = token.kind === 'marking' ? token.name : token.marking;
      const same = (name: string) => name.trim().toLowerCase() === named?.trim().toLowerCase();
      const found = named === undefined ? undefined : markings.find((each) => same(each.name));
      if (named !== undefined && found === undefined)
        return <UnknownMarkingToken key={key} name={named} />;
      const predicate = found === undefined ? undefined : markingOf(marks, found.id);
      if (token.kind === 'measure')
        return (
          <MeasureToken
            key={key}
            query={withFilters(measureQueryOf(token, predicate), textFiltersOf(tileId))}
            member={token.member}
            formats={formats}
            context={preview}
          />
        );
      const count = predicate === undefined ? 0 : markedCount(predicate);
      return (
        <MarkingToken
          key={key}
          text={
            token.show === 'count'
              ? count.toLocaleString('en-GB')
              : count === 0 || predicate === undefined
                ? 'nothing marked'
                : summariseMarking(predicate, memberTitle, 5, (id) => chartTitleOfTile(id))
          }
        />
      );
    },
    /**
     * A Text tile's Values and Changes (T884, AC-520, AC-116): under the
     * filters that reach the tile and their own; a Value over its marking's
     * rows, all data while nothing is marked unless "—" was chosen; a Change
     * along its time dimension. Other kinds are drawn as their tokens were,
     * until their own drawing (T885, T886).
     */
    textElementsOf: (tileId: string) => (node, key) => {
      const attrs = node.attrs ?? {};
      const measure = typeof attrs['measure'] === 'string' ? attrs['measure'] : undefined;
      if (measure === undefined) return undefined;
      if (node.type === 'value') {
        const named = typeof attrs['marking'] === 'string' ? attrs['marking'] : undefined;
        const found =
          named === undefined
            ? undefined
            : markings.find(
                (each) => each.name.trim().toLowerCase() === named.trim().toLowerCase(),
              );
        if (named !== undefined && found === undefined)
          return <UnknownMarkingToken key={key} name={named} />;
        const asked = valueQueryOf(
          node,
          found === undefined ? undefined : markingOf(marks, found.id),
        );
        return (
          <ValueElement
            key={key}
            asked={
              'query' in asked ? { query: withFilters(asked.query, textFiltersOf(tileId)) } : asked
            }
            member={measure}
            formats={formats}
            context={preview}
          />
        );
      }
      if (node.type === 'change') {
        const time = timeOf(node, model);
        return (
          <ChangeElement
            key={key}
            query={
              time === undefined
                ? undefined
                : withFilters(changeQueryOf(node, time), textFiltersOf(tileId))
            }
            member={measure}
            attrs={attrs}
            formats={formats}
            context={preview}
          />
        );
      }
      return undefined;
    },
    typeOf: (chartId: string) => drawn.documents?.[chartId]?.chart.chartType,
    documented: (chartId: string) => drawn.documents?.[chartId] !== undefined,
    answered: withFiltered.answered,
    draftTotals: drawn.totals,
    ...(onRefresh === undefined ? {} : { onRefresh: refreshTile }),
    refreshedFromRollup,
    onDismissRollupNote: (chartId: string) => {
      setRefreshedFromRollup((now) => new Set([...now].filter((id) => id !== chartId)));
    },
    refreshing: new Set([...(refreshing ?? []), ...refreshingFiltered]),
    refreshable: refreshable !== false && !loading,
    /**
     * The tile's query asked again with `total: true` (T178, AC-172): the
     * rows Cube returns for it — capped by its row limit — and the query's
     * full count, as a top-level `total` that counts past that limit
     * (research/cube/data-apis.md, "Observed locally"). Both from the one
     * answer, so they cannot disagree; the query otherwise the tile's own,
     * asked as its context asks, previewed or not.
     */
    countRows: async (chartId: string, signal: AbortSignal) => {
      const query = queryOf(chartId);
      if (query === undefined) return undefined;
      const result = (await loadTile({
        query: { ...query, total: true },
        signal,
        ...(preview === undefined ? {} : { context: preview }),
        item,
      })) as { data?: unknown; total?: unknown };
      return Array.isArray(result.data) && typeof result.total === 'number'
        ? { returned: result.data.length, total: result.total }
        : undefined;
    },
    ...(preview === undefined
      ? {}
      : {
          // Only for a chart whose query can be read: a click before it has
          // loaded would otherwise open the dialog later, unasked.
          onShowSql: (chartId: string, tileId: string) => {
            if (queryOf(chartId) !== undefined) setSqlFor({ chartId, tileId });
          },
        }),
  };

  /**
   * The query a tile asks, for its SQL as the previewed context (T174): its
   * chart's, with the filters that reach it and that Cube could join — the
   * same query `FilteredCharts` asks — so the SQL shown is the SQL it runs.
   */
  // A declaration, hoisted: what a whole tile was filtered by is compared
  // with this above, where each render's specs are made (AC-115).
  function queryOf(chartId: string): Record<string, unknown> | undefined {
    const chart = drawn.documents?.[chartId];
    if (chart === undefined) return undefined;
    const refused = filtered[chartId]?.uncovered ?? [];
    const applied = (reached[chartId] ?? []).filter(({ filter }) => !refused.includes(filter.id));
    try {
      // And the markings that limit it, as `FilteredCharts` adds them (AC-107):
      // without, a details tile's query was shown, and counted, without the
      // predicate it runs (T219's review).
      return withLimit(withFilters(toCubeQuery(toChartSpec(chart)), applied), asked[chartId]);
    } catch {
      return undefined;
    }
  }
  /**
   * The rows behind a tile (T120, AC-114; T268, AC-239): its chart's query
   * ungrouped, as the chart editor's drawer asks (AC-036), under every filter
   * and limit the tile is — and, for its marked rows, its marking's predicate
   * as well (`markedFilter`, the one "Filter to marked" makes), by the names
   * the tile's cube or view gives its members. With the query's full count,
   * which Cube gives past its row limit.
   *
   * A string is why there are no rows to ask for: a marked member this tile
   * cannot reach (T120's review), said rather than sent for Cube to refuse.
   */
  function rowsQueryOf(
    chartId: string,
    tileId: string,
    marked: boolean,
    limit: number,
  ): Record<string, unknown> | string | undefined {
    const chart = drawn.documents?.[chartId];
    if (chart === undefined) return undefined;
    const refused = filtered[chartId]?.uncovered ?? [];
    const applied = (reached[chartId] ?? []).filter(({ filter }) => !refused.includes(filter.id));
    try {
      const query = withLimit(
        withFilters(toUnderlyingQuery(toChartSpec(chart), limit), applied),
        asked[chartId],
      );
      if (!marked) return { ...query, total: true };
      const element = elementAt(live, tileId);
      const markingId = element !== null && isTile(element) ? marksWithOf(element) : undefined;
      if (markingId === undefined) return undefined;
      const made = markFilterFrom(markingOf(marks, markingId), false, {
        id: '',
        markingName: '',
        summary: '',
      });
      // Every row marked (Mark all, AC-115): the marked rows are the tile's.
      if ('refused' in made)
        return made.everything === true ? { ...query, total: true } : undefined;
      const on = markFilterOn(made, (member) => reachOf(member, chartId));
      if ('unreached' in on)
        return `This tile cannot reach ${memberTitle?.(on.unreached) ?? on.unreached}, so its marked rows cannot be shown.`;
      return { ...withLimit(query, on.filter), total: true };
    } catch {
      return undefined;
    }
  }
  /** What the rows show, once or as the details panel: the tile's query ungrouped, under its marking. */
  const rowsProps = (open: { chartId: string; tileId: string; marked: boolean }) => ({
    title: chartTitleOf(open.chartId) ?? 'this chart',
    heading: open.marked ? 'Marked rows' : 'Underlying rows',
    load: async (limit: number, signal: AbortSignal) => {
      const query = rowsQueryOf(open.chartId, open.tileId, open.marked, limit);
      if (query === undefined) throw new Error('There is nothing marked to show rows for.');
      if (typeof query === 'string') throw new Error(query);
      const result = (await loadTile({
        query,
        signal,
        ...(preview === undefined ? {} : { context: preview }),
        item,
      })) as { data?: unknown; total?: unknown };
      return {
        rows: Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [],
        total: typeof result.total === 'number' ? result.total : undefined,
      };
    },
    measures: drawn.specs[open.chartId]?.measures ?? [],
    fields: drawn.specs[open.chartId]?.fields ?? [],
    // The rows themselves, never a quick calculation's (AC-048).
    formats: plainFormatsOf(drawn.specs[open.chartId]),
    titles: plainTitlesOf(drawn.specs[open.chartId]),
  });
  /**
   * The details panel's marking, as the query it asks (AC-240): a change
   * asks again; none while nothing is marked.
   */
  const followed = (() => {
    if (panelFor === undefined) return undefined;
    const query = rowsQueryOf(panelFor.chartId, panelFor.tileId, true, 1);
    return query === undefined ? undefined : JSON.stringify(query);
  })();
  /**
   * A tile's marked items regrouped by what was chosen (T270, AC-236): its
   * chart grouped by it (`drilledDocument`), asked under every filter and
   * limit the tile is, and its marking's predicate — the filter "Filter to
   * marked" makes, as the marked rows are asked. Its answer is its own, and
   * so is its freshness (AC-238). An answer to a drill already replaced or
   * gone back from is dropped.
   */
  function drill(to: {
    chartId: string;
    tileId: string;
    option: DrillOption;
    items: string;
    markingName: string;
  }) {
    const chart = drawn.documents?.[to.chartId];
    const basis = drillBasisOf(to.chartId, to.tileId);
    if (chart === undefined || basis === undefined) return;
    const drilled: Drill = {
      ...to,
      key: 'reason' in basis ? '' : basis.key,
      state: { kind: 'loading' },
    };
    setDrills((now) => ({ ...now, [to.tileId]: drilled }));
    const settle = (state: Drill['state']) => {
      setDrills((now) =>
        now[to.tileId] === drilled ? { ...now, [to.tileId]: { ...drilled, state } } : now,
      );
    };
    if ('reason' in basis) {
      settle({ kind: 'failed', error: new Error(basis.reason) });
      return;
    }
    let answered: AnswerMeta | undefined;
    void tileChartOf(
      drilledDocument(chart, to.option),
      async (query) => {
        const asked = withLimit(withFilters(query, basis.applied), basis.limit);
        const result = (await loadTile({
          query: basis.marked === undefined ? asked : withLimit(asked, basis.marked),
          ...(preview === undefined ? {} : { context: preview }),
          item,
        })) as { data?: Record<string, unknown>[] };
        answered = answerMetaOf(result);
        return result.data ?? [];
      },
      // With the model's formats where they're in, as a tile picks (T510).
      formats,
    ).then((result) => {
      if ('error' in result) {
        settle({ kind: 'failed', error: result.error });
        return;
      }
      settle({ kind: 'done', spec: result.spec, ...(answered === undefined ? {} : { answered }) });
    });
  }
  /**
   * A tile's drill while it still answers what the tile is under (T270's
   * review): only while marking — not while editing, previewing or in
   * cross-filter mode — only while the tile holds the chart it drilled, and
   * only under the question it was asked (or the same refusal). Otherwise the
   * tile draws its own chart, and never a drill gone stale.
   */
  function drillShown(tileId: string): Drill | undefined {
    const drilled = drills[tileId];
    if (drilled === undefined || !marking) return undefined;
    const element = elementAt(live, tileId);
    if (element === null || !isTile(element) || element.chartId !== drilled.chartId)
      return undefined;
    const basis = drillBasisOf(drilled.chartId, tileId);
    const key = basis === undefined ? undefined : 'reason' in basis ? '' : basis.key;
    return key === drilled.key ? drilled : undefined;
  }
  /**
   * What a tile's drill is asked under (T270): every filter that reaches the
   * tile and it takes, its limits, and its marking's filter — none when every
   * item is marked (Mark all), the tile's whole answer. Its `key` is that
   * question: a drill asked under another no longer answers what the tile is
   * under, and is let go (T270's review). No basis while nothing is marked.
   */
  function drillBasisOf(
    chartId: string,
    tileId: string,
  ):
    | {
        applied: NonNullable<(typeof reached)[string]>;
        limit: CubeFilter | undefined;
        marked: CubeFilter | undefined;
        key: string;
      }
    | { reason: string }
    | undefined {
    const refused = filtered[chartId]?.uncovered ?? [];
    const applied = (reached[chartId] ?? []).filter(({ filter }) => !refused.includes(filter.id));
    const element = elementAt(live, tileId);
    const markingId = element !== null && isTile(element) ? marksWithOf(element) : undefined;
    if (markingId === undefined) return undefined;
    const made = markFilterFrom(markingOf(marks, markingId), false, {
      id: '',
      markingName: '',
      summary: '',
    });
    let marked: CubeFilter | undefined;
    if ('refused' in made) {
      if (made.everything !== true) return undefined;
    } else {
      const on = markFilterOn(made, (member) => reachOf(member, chartId));
      if ('unreached' in on)
        return {
          reason: `This tile cannot reach ${memberTitle?.(on.unreached) ?? on.unreached}, so its marked items cannot be drilled into.`,
        };
      marked = on.filter;
    }
    const limit = asked[chartId];
    return {
      applied,
      limit,
      marked,
      key: JSON.stringify([applied.map(({ filter }) => filter), limit ?? null, marked ?? null]),
    };
  }
  /** The panel turned off from itself: the focus back on its tile's ⋯, where there is one. */
  const closePanel = () => {
    const tile = panelFor?.tileId ?? '';
    setPanelFor(undefined);
    requestAnimationFrame(() => {
      window.document.querySelector<HTMLElement>(`[data-view-menu="${CSS.escape(tile)}"]`)?.focus();
    });
  };
  const closeRows = () => {
    const opener = rowsFor?.tileId ?? '';
    setRowsFor(undefined);
    // Back to the ⋯ menu it was opened from.
    requestAnimationFrame(() => {
      window.document
        .querySelector<HTMLElement>(`[data-view-menu="${CSS.escape(opener)}"]`)
        ?.focus();
    });
  };
  const sqlQuery = sqlFor === undefined ? undefined : queryOf(sqlFor.chartId);
  const viewedQuery = queryFor === undefined ? undefined : queryOf(queryFor.chartId);
  const whyNotQuery = whyNotFor === undefined ? undefined : queryOf(whyNotFor.chartId);
  const closeWhyNot = () => {
    const opener = whyNotFor?.tileId ?? '';
    setWhyNotFor(undefined);
    // Back to the ⋯ menu it was opened from.
    requestAnimationFrame(() => {
      window.document
        .querySelector<HTMLElement>(`[data-view-menu="${CSS.escape(opener)}"]`)
        ?.focus();
    });
  };
  const closeQuery = () => {
    const opener = queryFor?.tileId ?? '';
    setQueryFor(undefined);
    // Back to the ⋯ menu it was opened from.
    requestAnimationFrame(() => {
      window.document
        .querySelector<HTMLElement>(`[data-view-menu="${CSS.escape(opener)}"]`)
        ?.focus();
    });
  };
  const closeSql = () => {
    const opener = sqlFor?.tileId ?? '';
    setSqlFor(undefined);
    // Back to the SQL button of the tile it was opened from.
    requestAnimationFrame(() => {
      window.document
        .querySelector<HTMLElement>(`[data-show-sql="${CSS.escape(opener)}"]`)
        ?.focus();
    });
  };

  /**
   * The chart editor, when it is open over the dashboard (T032, AC-034). Not
   * part of the history, for the same reason the settings page is not:
   * opening a page is not a change to the dashboard.
   */
  const [editingChart, setEditingChart] = useState<{
    /** The tile it was opened from, which the URL names (T196). */
    readonly tileId: string;
    readonly chartId: string;
    readonly tile: TileSize | undefined;
    readonly returnTo: string;
  } | null>(null);

  /**
   * The editor has closed by its own Back or Save: take the tile out of the
   * URL, if it is still there. Not when the browser's Back closed it — the
   * URL has already moved on (T196).
   */
  const closeInUrl = () => {
    if (editTile !== undefined) onEditTile?.(undefined);
  };

  /**
   * Where focus goes once the dashboard is back after the editor closes
   * (T032). The overlay replaces the dashboard, so whatever opened it is
   * unmounted by then, and focus fell to the page — a keyboard user who opened
   * the editor with E lost their place. It returns to the equivalent element
   * after the dashboard is drawn again, as the search palette returns focus to
   * whatever opened it.
   */
  const returnFocus = useRef<string | null>(null);
  /** The tile the editor was opened on, for when that control is gone. */
  const returnTile = useRef<string | null>(null);
  /**
   * Whether the session is saving, mirrored up from it (`SessionMirror`).
   * The editor's Save dashboard closes the editor and starts a save in one
   * step, and a saving dashboard's body is inert — nothing in it can take
   * focus — so focus waits until the save has settled (AC-184, T197).
   */
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    // Only once the editor has closed, the dashboard is drawn again, and it
    // can take focus.
    if (editingChart !== null || saving || returnFocus.current === null) return;
    /**
     * Or, when the control that opened it is gone, its tile's pencil, then
     * the tile: Properties' Edit chart leaves with the sidebar when Save
     * dashboard ends edit mode (T222's review).
     */
    const tile = returnTile.current === null ? null : CSS.escape(returnTile.current);
    const target =
      globalThis.document.querySelector<HTMLElement>(returnFocus.current) ??
      (tile === null
        ? null
        : (globalThis.document.querySelector<HTMLElement>(`[data-edit-chart="${tile}"]`) ??
          globalThis.document.querySelector<HTMLElement>(`[data-tile="${tile}"]`)));
    /**
     * Inert, so it cannot take focus yet. `saving` above lags by a render: the
     * mirror sets it from an effect, and state set there reaches this
     * component only on its next render — so on the render where the save
     * starts it still reads false, which is why the element is asked too.
     * Kept for when the mirrored `saving` settles and this runs again.
     */
    if (target?.closest('[inert]')) return;
    // Without scrolling: whatever opened the editor was on screen when it was
    // used, and the dashboard is where it was left, so moving it would undo
    // exactly what keeping it mounted preserves (AC-067).
    target?.focus({ preventScroll: true });
    returnFocus.current = null;
  }, [editingChart, saving]);

  /**
   * Opens a tile's chart in the editor, measuring the tile first.
   *
   * **Measured, not computed.** A tile stores columns, not pixels, and each
   * section and tab group has its own nested canvas, so a nested tile's
   * column is narrower than the page's — computing its width from `w` and the
   * page width would be wrong for exactly the tiles inside sections. It is
   * measured now, while it is still on screen: the overlay replaces the
   * dashboard, tile included.
   */
  const openEditor = useCallback(
    /**
     * `rows` is the tile's height in row units *as the session has it*, passed
     * in by the caller that holds the session. Read from the saved document
     * here, it was the height from before any resize in this session: a tile
     * made taller and then opened had a frame of the new size with the chart
     * drawn at the old height inside it — the preview ignoring the tile's
     * height, which is AC-034's failing state.
     */
    ({ tileId, chartId, rows, returnTo, fromUrl = false }: OpenChart) => {
      const box = globalThis.document
        .querySelector(`[data-tile="${CSS.escape(tileId)}"]`)
        ?.getBoundingClientRect();

      // Named in the URL, so a reload reopens it and the browser's Back
      // closes it (T196, AC-002).
      if (!fromUrl) onEditTile?.(tileId);
      setEditingChart({
        tileId,
        chartId,
        returnTo,
        tile:
          box === undefined
            ? undefined
            : {
                width: Math.round(box.width),
                height: Math.round(box.height),
                chartHeight: rows === undefined ? undefined : rows * ROW_UNIT_PX,
              },
      });
    },
    [onEditTile],
  );

  /**
   * Where the next insert goes (AC-058): after the selection, or into the
   * chosen "+ Add" slot. Above `EditChrome`, because the Add panel lives
   * inside the sidebar and the canvas is its sibling — they have to agree.
   *
   * Not part of the history: choosing what to add next is not a change to the
   * dashboard, so Undo must not step back through it.
   */
  const [selected, setSelected] = useState<string | null>(null);
  /**
   * The Text tile whose text is editable on the canvas (T876, AC-302): view
   * state, like the selection; the edit reaches the history once, when the
   * text is left.
   */
  const [editingText, setEditingText] = useState<string | null>(null);
  /**
   * The edited text's elements, in order, and the selected one (T882,
   * AC-519), as its editor tells them, for Properties' Elements list; and a
   * row's ask to select one there.
   */
  const [textElements, setTextElements] = useState<{
    readonly tileId: string;
    readonly elements: readonly TextNode[];
    readonly selected: number | null;
  } | null>(null);
  const [elementAsk, setElementAsk] = useState<{ index: number; ask: number } | undefined>(
    undefined,
  );
  /** An element's settings from Properties, for the text being edited (T884, AC-520). */
  const [elementChange, setElementChange] = useState<
    { index: number; settings: Record<string, unknown>; ask: number } | undefined
  >(undefined);
  const onTextElements = useCallback(
    (tileId: string, elements: TextNode[], selected: number | null) => {
      setTextElements({ tileId, elements, selected });
    },
    [],
  );
  /**
   * A text starts or stops being edited: what an earlier one told, and a
   * row's ask for it, go with it.
   */
  const editText = useCallback((tileId: string | null) => {
    setEditingText(tileId);
    setTextElements(null);
    setElementAsk(undefined);
    setElementChange(undefined);
  }, []);
  /** What a Text tile's insert menu offers: the dashboard's measures, markings, filters (T881). */
  const textSources = useMemo(
    () => insertSourcesOf({ model, dashboard: live, documents, memberTitle }),
    [model, live, documents, memberTitle],
  );
  /**
   * The insert menu's Copilot group (AC-535; decision T881-1): none while AI
   * is parked (`copilotOffer.ts`), else a Super-Admin's disabled Summarize….
   */
  const queries = useContext(QueryClientContext);
  const copilot: CopilotOffer = copilotOfferFor(queries?.getQueryData<Me>(ME_QUERY.queryKey));
  /**
   * The filter selected while editing, its field, scope and Remove in
   * Properties (T468, UX-031); and whether focus is asked for in its field
   * picker. A filter is not an element of the canvas, so it has a selection
   * of its own, which choosing an element, aiming elsewhere or leaving edit
   * mode lets go of.
   */
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [focusFilterField, setFocusFilterField] = useState(false);
  const fieldFocused = useCallback(() => {
    setFocusFilterField(false);
  }, []);
  if (selected !== null && selectedFilter !== null) setSelectedFilter(null);
  if (!sessionEditing && selectedFilter !== null) setSelectedFilter(null);
  /**
   * Selected, a filter's Properties show with focus in its field picker —
   * on adding it and on selecting it, as the user asked (2026-09-28, UX-031).
   */
  const selectFilter = (id: string) => {
    setSelected(null);
    setSelectedFilter(id);
    openSidebarPanel('Properties', { focus: false });
    setFocusFilterField(true);
  };

  const [addTarget, setAddTarget] = useState<string | null>(null);
  /**
   * A tile's "Save to folders…" asked from its ⋯ menu (AC-205): counted, so
   * its Properties open on the folder to choose each time it is asked.
   */
  const [publishing, setPublishing] = useState<{ tileId: string | null; asked: number }>({
    tileId: null,
    asked: 0,
  });
  // Answered once: another tile chosen, or edit mode left, and the ask is
  // over — coming back to the tile does not open the chooser again (T223's
  // review).
  if (publishing.tileId !== null && (!sessionEditing || selected !== publishing.tileId)) {
    setPublishing({ tileId: null, asked: publishing.asked });
  }

  /**
   * A local chart page's "Save to folders…" (T463): once edit mode is
   * entered — its link asks for that too — the tile is selected and its
   * Properties open on the folder to choose, as its ⋯ "Save to folders…"
   * leaves it; then the ask is forgotten, so a reload opens the dashboard to
   * be read. Where nothing can be edited — a preview, a narrow window — or no
   * chart tile here has that id, it is only forgotten. Taken once per ask.
   */
  const [publishTaken, setPublishTaken] = useState<{ tileId: string; opened: boolean } | null>(
    null,
  );
  if (publishTile !== undefined && publishTile !== publishTaken?.tileId) {
    const element = elementAt(document, publishTile);
    const chartTile = element !== null && isTile(element) && element.chartId !== undefined;
    if (preview !== undefined || readOnly || editsElsewhere || narrow || !chartTile) {
      setPublishTaken({ tileId: publishTile, opened: false });
    } else if (sessionEditing) {
      setPublishTaken({ tileId: publishTile, opened: true });
      setSelected(publishTile);
      setAddTarget(null);
      setPublishing({ tileId: publishTile, asked: publishing.asked + 1 });
    }
  }
  // Outside render: the sidebar shows Properties, and the address forgets.
  useEffect(() => {
    if (publishTaken === null) return;
    if (publishTaken.opened) openSidebarPanel('Properties');
    onPublishTaken?.();
  }, [publishTaken, onPublishTaken]);

  /**
   * Which page tab is open, here rather than in `DashboardPages`, because the
   * Add panel is its sibling inside the chrome. Left below, an element added
   * with nothing selected went to the *first* page — so on the second page it
   * landed off-screen, and "Discard (1 change)" was the only sign anything
   * had happened at all.
   */
  /**
   * Whether the settings page is showing (AC-069). Not part of the history:
   * opening a page is not a change to the dashboard, so Undo must not step
   * back through it — the same reason the selection is held out here.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The section it opens on: General from the gear, another from a link into it. */
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('General');
  /**
   * Back to the gear once the page closes (T182, AC-176): the gear is gone
   * while the page is open, so focus left with it.
   */
  const gear = useRef<HTMLButtonElement>(null);
  const settingsWereOpen = useRef(false);
  useEffect(() => {
    if (settingsOpen) settingsWereOpen.current = true;
    else if (settingsWereOpen.current) {
      settingsWereOpen.current = false;
      gear.current?.focus();
    }
  }, [settingsOpen]);

  // A link with marks opens on its page tab (T129).
  const [openPage, setOpenPage] = useState<string | null>(() => linked?.page ?? null);
  const pageId = openPage ?? document.pages[0]?.id ?? '';
  /** Whether an element is on the page shown, in any section or tab of it. */
  const onPageShown = (id: string) => {
    const holds = (items: readonly Element_[]): boolean =>
      items.some(
        (element) =>
          element.id === id ||
          (isSection(element) && holds(element.items)) ||
          (isTabGroup(element) && element.tabs.some((tab) => holds(tab.items))),
      );
    const page = document.pages.find((each) => each.id === pageId);
    return page !== undefined && holds(page.items);
  };
  /**
   * A bookmark applied (T128, AC-122): its page tab, filters' values and
   * marks, fitted to the dashboard as it is now (`viewFor`). All of it the
   * reader's view state, so the dashboard's saved definition is never
   * touched. What else the reader had made of the dashboard goes with it:
   * cross-filter selections, drills, the keyboard's place in a tile.
   */
  const applyView = (state: ViewState, name: string) => {
    const view = restored(state, live);
    setOpenPage(view.page);
    setFilterValues(view.filters);
    setMarks(view.marks);
    setMarkFilters(view.markFilters);
    setMarkSources(view.from);
    setMarkFocus({});
    /**
     * Said once, here, whatever it changed (AC-493; design 19 B5): its page
     * where there's more than one, the number of filters set where there are
     * filters, and what is marked.
     */
    const pages = live.pages;
    const opened = pages.find((each) => each.id === view.page) ?? pages[0];
    const shownFilters = filtersSet(
      live.filters ?? [],
      view.filters,
      view.markFilters,
      filterTitle,
    );
    sayAfresh(
      setMarkSaid,
      filterChangeSaid({
        kind: 'bookmark',
        name,
        page: pages.length > 1 ? opened?.title : undefined,
        set: shownFilters.of === 0 ? undefined : shownFilters.set,
        // A cross-filtering dashboard says nothing of markings (AC-120).
        marked:
          interactions.mode === 'markings'
            ? markings.reduce((sum, each) => sum + markedCount(markingOf(view.marks, each.id)), 0)
            : undefined,
      }),
    );
    setCrossSelections([]);
    setDrills({});
    // A "Filter to marked" made after this is numbered past those restored.
    markFilterSeq.current = numberedPast(markFilterSeq.current, view.markFilters);
  };
  /**
   * Copy link with marks (T129, AC-123), from a marking's chip: this
   * dashboard's URL with its filters, page tab and marks (`linkWithMarks`),
   * on the clipboard, said beside the chips for a few seconds and to a
   * screen reader.
   */
  const [linkNote, setLinkNote] = useState('');
  useEffect(() => {
    if (linkNote === '') return undefined;
    const shown = setTimeout(() => {
      setLinkNote('');
    }, 4000);
    return () => {
      clearTimeout(shown);
    };
  }, [linkNote]);
  /** A tile marked whole, by its chart's title, for a marking's words (AC-115). */
  const wholeTileTitle = (tileId: string): string | undefined => {
    const element = elementAt(live, tileId);
    return element !== null && isTile(element) && element.chartId !== undefined
      ? chartTitleOf(element.chartId)
      : undefined;
  };

  const copyLinkWithMarks = () => {
    const said = (text: string) => {
      setLinkNote(text);
      setMarkSaid(text);
    };
    const clipboard = pageClipboard();
    if (clipboard === null) {
      said(NO_CLIPBOARD);
      return;
    }
    const link = linkWithMarks(window.location.href, {
      page: pageId,
      filters: filterValues,
      marks,
      markFilters,
      from: markSources,
    });
    clipboard.writeText(link).then(
      () => {
        said('Copied a link to this view, with its marks.');
      },
      () => {
        said('The link could not be copied: the browser refused the clipboard.');
      },
    );
  };
  /** What the last delete took, for the undo toast (AC-060). */
  const [deleted, setDeleted] = useState('');
  const where = {
    selected,
    addTarget,
    pageId,
    onAdded: (id: string) => {
      setSelected(id);
      setAddTarget(null);
    },
    // A filter added is selected, with focus in its field picker (T468, UX-031).
    onAddedFilter: (id: string) => {
      selectFilter(id);
    },
  };

  return (
    <QueriesAs preview={preview} item={item}>
      {preview === undefined ? null : (
        // Named after the groups, as design 08's state E has it (T630).
        <PreviewBanner context={preview} onExit={onExitPreview} title={document.title} />
      )}
      {rangeFor === undefined ? null : (
        <MarkRangeDialog
          {...rangeDialogOf(rangeFor)}
          onMark={(range, add) => {
            onMarkRange(rangeFor.tileId, rangeFor.chartId, range, add);
          }}
          onClose={() => {
            setRangeFor(undefined);
          }}
        />
      )}
      {queryFor === undefined || viewedQuery === undefined ? null : (
        <ViewQuery
          title={chartTitleOf(queryFor.chartId) ?? 'this chart'}
          query={viewedQuery}
          context={preview}
          onClose={closeQuery}
        />
      )}
      {whyNotFor === undefined || whyNotQuery === undefined ? null : (
        <WhyNotAccelerated
          title={chartTitleOf(whyNotFor.chartId) ?? 'this chart'}
          query={whyNotQuery}
          onClose={closeWhyNot}
        />
      )}
      {copyFor === undefined || drawn.documents?.[copyFor.chartId] === undefined ? null : (
        <CopyToDashboard
          sourceDashboardId={dashboardId}
          title={chartTitleOf(copyFor.chartId) ?? 'this chart'}
          chart={drawn.documents[copyFor.chartId] as ChartDocument}
          size={(() => {
            const element = elementAt(live, copyFor.tileId);
            return element !== null && isTile(element)
              ? { w: element.w, h: element.h }
              : { w: COLUMNS / 2 };
          })()}
          onClose={() => {
            const opener = copyFor.tileId;
            setCopyFor(undefined);
            // Back to the ⋯ menu it was opened from.
            requestAnimationFrame(() => {
              window.document
                .querySelector<HTMLElement>(`[data-view-menu="${CSS.escape(opener)}"]`)
                ?.focus();
            });
          }}
        />
      )}
      {rowsFor === undefined ? null : (
        <MarkedRows
          {...rowsProps(rowsFor)}
          // Marked rows only: pinned open, they follow the marking (AC-240),
          // and the panel takes the focus the dialog had.
          {...(rowsFor.marked
            ? {
                onFollow: () => {
                  setPanelFor({ chartId: rowsFor.chartId, tileId: rowsFor.tileId });
                  setRowsFor(undefined);
                },
              }
            : {})}
          onClose={closeRows}
        />
      )}
      {preview === undefined || sqlFor === undefined || sqlQuery === undefined ? null : (
        <GeneratedSql
          title={chartTitleOf(sqlFor.chartId) ?? 'this chart'}
          query={sqlQuery}
          context={preview}
          onClose={closeSql}
        />
      )}
      {Object.keys(reached).length === 0 && Object.keys(asked).length === 0 ? null : (
        <FilteredCharts
          ref={filteredCharts}
          reached={reached}
          // What each limited tile's markings add to its query (AC-107): a
          // tile listed here is asked even when no filter reaches it.
          limits={asked}
          documents={drawn.documents}
          onResults={onFiltered}
          context={preview}
        />
      )}
      {/* The second answer a highlighted tile draws over its own (AC-117):
          the same question, asked with the selection. */}
      {Object.keys(highlightReached).length === 0 ? null : (
        <FilteredCharts
          reached={highlightReached}
          documents={drawn.documents}
          onResults={onHighlighted}
          context={preview}
        />
      )}
      {/* The marked share of each tile whose items are partly marked (T388,
          AC-104): its own question, asked with the marking. */}
      {Object.keys(markedShareReached).length === 0 ? null : (
        <FilteredCharts
          reached={markedShareReached}
          limits={markedShareLimits}
          documents={markedShareDocuments}
          onResults={onMarkedShares}
          context={preview}
        />
      )}
      <EditChrome
        document={document}
        title={(shown) => shown.title}
        {...(crumbs ? { folderOf: (shown: DashboardDocument) => shown.folderId } : {})}
        /**
         * Never with drafts on it. The save sends the whole document, so a draft
         * left there would be written into the dashboard's own row. The drafts go
         * beside it, and are written as the chart documents they are, in the
         * same transaction as the dashboard (AC-183, T192).
         */
        onSave={(next) =>
          // The document without its drafts, and the drafts beside it: the save
          // writes them as chart documents, never into the dashboard's row. Its
          // outcome goes back to the session, which leaves edit mode only on
          // success (AC-184).
          onSave(withoutDrafts(next), next.chartDrafts)
        }
        /**
         * Held back only while a draft cannot be written with this dashboard: a
         * chart local to another dashboard, or a draft with no version to
         * check. Charts local to this dashboard are written with it (T192),
         * and library charts too, everywhere they are used, after the editor
         * has said they are shared (T134). Saving a draft that
         * cannot be written would drop it in silence and put the old chart back
         * on the tile — AC-034's failing state, reached through Save. See
         * `whyUnsaveable` for the wording and why it names Undo, not Discard.
         */
        saveBlocked={(shown) =>
          // A Text tile over its 10 elements, as a converted markdown tile
          // may be, is held too (decision T875-1).
          whyUnsaveable(shown, dashboardId) ?? whyTextUnsaveable(shown)
        }
        // A shared one is edited in a copy, never in place (AC-278).
        readOnly={preview !== undefined || readOnly || narrow || editsElsewhere}
        subtitle={place?.line}
        quietEdit={place?.proposeTo !== undefined}
        onStart={onEditStart}
        onDiscard={onDiscard}
        description={(shown) => shown.description}
        // The page tabs, inline in the compact row (AC-484; design 19 pin 3).
        // Below 1,024 px in view mode, a "Page: ‹name› ▾" menu on a row of its
        // own under the sheet instead (AC-495; design 19 D2, D3).
        tabs={(session) =>
          narrow && !session.editing ? null : (
            <PageTabsRow session={session} pageId={pageId} onOpenPage={setOpenPage} />
          )
        }
        under={(session) =>
          narrow && !session.editing && session.document.pages.length > 1 ? (
            <div className="page-menu-row">
              <PageMenu pages={session.document.pages} openId={pageId} onOpen={setOpenPage} />
            </div>
          ) : null
        }
        // History and Bookmarks, before the primary (AC-484; design 19 screen 1).
        headerLead={(session) => (
          <>
            {/* Its versions, first of the actions (T357, AC-289; design 06, pin 1;
                2026-09-27 04 state E; T684): for those the API shows them to,
                never while editing or read-only. A .btn, pressed while its
                panel is open. */}
            {/* Below 1,024 px, in ⋯ (AC-495; design 19 D4). */}
            {onHistory === undefined || session.editing || readOnly || narrow ? null : (
              <button
                type="button"
                className={historyOpen ? 'btn pressed dashboard__history' : 'btn dashboard__history'}
                data-history-button=""
                aria-pressed={historyOpen}
                // Named and titled by its word, which only its icon shows
                // from 1,024 to 1,279 px (AC-494; design 19 D1).
                aria-label="History"
                title="History"
                onClick={onHistory}
              >
                <HistoryIcon />
                <span className="header-action__label">History</span>
              </button>
            )}
            {/* A reader's: what the dashboard shows now, under a name (T127,
                AC-121). Not while editing, nor in a security context's
                preview, where nothing is marked and nothing is the reader's. */}
            {session.editing || preview !== undefined || readOnly ? null : (
              <Bookmarks
                dashboardId={dashboardId}
                current={{
                  page: pageId,
                  filters: filterValues,
                  marks,
                  markFilters,
                  from: markSources,
                }}
                onApply={applyView}
                // Below 1,024 px, opened from ⋯'s "Bookmarks…", the same
                // popover under the row (AC-495; design 19 D4).
                opener={
                  narrow
                    ? {
                        asked: bookmarksAsked,
                        focus: () => {
                          window.document
                            .querySelector<HTMLElement>('[data-testid="dashboard-more"]')
                            ?.focus();
                        },
                      }
                    : undefined
                }
              />
            )}
          </>
        )}
        headerActions={(session) => (
          <>
            {/* A shared one's way to change it: a copy in My workspace
                (T348, AC-278; design 04, state E). A workspace one's way
                back: its proposal (state F). Not below 1,024 px, where the
                row holds only the way back, the title, ⋯ and the toggle
                (AC-495; design 19 D2). */}
            {session.editing || readOnly || place === undefined || narrow ? null : place.copy !==
              undefined ? (
              <button type="button" className="btn-primary" onClick={place.copy.onClick}>
                <PencilIcon />
                {place.copy.label}
              </button>
            ) : place.proposeTo !== undefined ? (
              // The copy's primary: its way back (state F).
              <button type="button" className="btn-primary" onClick={place.proposeTo.onClick}>
                {place.proposeTo.label}
              </button>
            ) : null}
            {
              // Not below 1,024 px, where the dashboard is for reading: the
              // settings' Save writes it (T250's review). An edit session already
              // open keeps it, as it keeps its bar.
              // Nor in a read-only drawing, where nothing is edited (T356's),
              // nor on a shared one, edited in a copy (T348's review).
              readOnly || editsElsewhere || (narrow && !session.editing) ? null : (
                <button
                  ref={gear}
                  type="button"
                  className="dashboard__gear icon-button"
                  aria-label="Dashboard settings"
                  title="Dashboard settings"
                  /**
                   * Not while a save is under way (AC-184, T197). The header is
                   * outside the body a save makes inert, and a settings save made now
                   * goes to a session that takes no change — the page would close
                   * with the settings lost and nothing said.
                   */
                  // aria-disabled, not disabled: focus is given back to the gear as
                  // the settings page closes, and a natively disabled gear, while a
                  // view-mode save was answering, took none (T182's second round).
                  aria-disabled={session.saving ? 'true' : undefined}
                  onClick={() => {
                    if (session.saving) return;
                    // In view mode the settings page is an edit of its own, begun now
                    // with the dashboard as it stands: its save is checked against
                    // this moment's version (T198, AC-015). While editing, it is part
                    // of the session, which began earlier.
                    if (!session.editing) onEditStart?.();
                    setSettingsSection('General');
                    setSettingsOpen(true);
                  }}
                >
                  {/* The prototype's gear (AC-187). */}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
              )
            }
            {/* More (⋯), after the header's other actions, holding Export…
                (T511; design 13, pin 1): in view mode only, since the file
                holds the dashboard as saved; pressed while the pane is open. */}
            {session.editing || preview !== undefined ? null : (
              <MenuButton
                label="More"
                testId="dashboard-more"
                className={
                  exporting ? 'icon-button dashboard__more is-pressed' : 'icon-button dashboard__more'
                }
                items={[
                  // Below 1,024 px, History and Bookmarks… first (AC-495;
                  // design 19 D4), as the row's buttons would be.
                  ...(narrow && onHistory !== undefined && !readOnly
                    ? [{ key: 'history', label: 'History', onSelect: onHistory }]
                    : []),
                  ...(narrow && preview === undefined && !readOnly
                    ? [
                        {
                          key: 'bookmarks',
                          label: 'Bookmarks…',
                          onSelect: () => {
                            setBookmarksAsked((was) => was + 1);
                          },
                        },
                      ]
                    : []),
                  {
                    key: 'export',
                    label: 'Export…',
                    onSelect: () => {
                      setExporting(true);
                    },
                  },
                  // Last, set apart, in the error ink (design 14, B2).
                  ...(onDelete === undefined
                    ? []
                    : [
                        {
                          key: 'delete',
                          label: 'Delete dashboard…',
                          danger: true,
                          separatorBefore: true,
                          onSelect: onDelete,
                        },
                      ]),
                ]}
              >
                <span aria-hidden="true">⋯</span>
              </MenuButton>
            )}
          </>
        )}
        /**
         * The settings page, opened over the dashboard rather than navigated to,
         * so the edit session survives it (AC-069, and AC-074 later).
         *
         * Cancel simply closes: the page keeps its edits to itself until Save,
         * which is AC-069's "a way to return without saving".
         */
        overlay={(session) =>
          settingsOpen ? (
            <SettingsPage
              document={session.document}
              section={settingsSection}
              // How the cross-filter matrix names each tile (AC-118).
              titleOf={chartTitleOf}
              onCancel={() => {
                setSettingsOpen(false);
              }}
              /**
               * direction.md: "Saving in view mode saves the dashboard. While
               * editing, a save is one undoable change, and Discard reverts it."
               *
               * Two different things, so two different routes. In view mode
               * there is no session to fold into — `EditChrome` takes the prop
               * as the truth there — so a settings save that only called
               * `session.change` changed nothing a viewer could see. While
               * editing it must go through the session, or Discard would not
               * reach it (AC-074).
               */
              onSave={(next) => {
                if (session.editing) {
                  // One undoable change on the session, which is immediate.
                  session.change(next);
                  setSettingsOpen(false);
                  return undefined;
                }
                /**
                 * In view mode it is a write, and the page waits for it
                 * (AC-185): it closes when the save has gone through, and
                 * stays open with the settings as entered when it fails —
                 * which the page reports, since it is the page that holds
                 * them.
                 */
                return Promise.resolve(onSave(withoutDrafts(next))).then(() => {
                  setSettingsOpen(false);
                });
              }}
            />
          ) : editingChart === null ? null : (
            /**
             * The chart editor over the dashboard (T032, AC-034). Going back
             * with a change holds it as a draft on the session — one change,
             * which Undo and Discard reach like any other (AC-066) — and going
             * back with none records nothing.
             */
            <ChartEditorOverlay
              chartId={editingChart.chartId}
              dashboardTitle={session.document.title}
              dashboardId={dashboardId}
              dashboardFolderId={document.folderId}
              tile={editingChart.tile}
              draft={session.document.chartDrafts?.[editingChart.chartId]}
              // The browser's Back takes the tile out of the URL; the editor
              // then leaves as its own Back would, keeping the change (T196).
              tileId={editingChart.tileId}
              urlTile={editTile}
              onBack={(draft) => {
                if (draft !== undefined) {
                  session.change(withDraft(session.document, editingChart.chartId, draft));
                }
                returnFocus.current = editingChart.returnTo;
                returnTile.current = editingChart.tileId;
                setEditingChart(null);
                closeInUrl();
              }}
              /**
               * "Save dashboard" (direction.md §2: "applies the chart and saves
               * the dashboard", T192): the draft Back would apply, saved with
               * the dashboard in one step through the session — so the same
               * refusal as the bar's Save applies, and a refused edit is kept
               * as a change rather than lost.
               */
              onSaveDashboard={(draft) => {
                returnFocus.current = editingChart.returnTo;
                returnTile.current = editingChart.tileId;
                setEditingChart(null);
                closeInUrl();
                session.save(
                  draft === undefined
                    ? session.document
                    : withDraft(session.document, editingChart.chartId, draft),
                );
              }}
              saveBlocked={(pending) =>
                whyUnsaveableWith(session.document, dashboardId, editingChart.chartId, pending) ??
                // Held here too, where it is pressed (T875's review).
                whyTextUnsaveable(session.document)
              }
              // A shared chart's "Make a local copy" (T135, AC-129): the tile
              // repointed to a copy with the edits so far, the editor on it.
              onMakeLocalCopy={(edited) => {
                const copyId = mintChartId();
                // Onto the session as it is when the copy lands, not as it was
                // when this was made (T135's review).
                session.update((current) =>
                  detach(current, editingChart.tileId, { dashboardId, copyId, edited }),
                );
                setEditingChart({ ...editingChart, chartId: copyId });
              }}
            />
          )
        }
        panels={(session) => ({
          add: (
            <AddSlot
              session={session}
              dashboardId={dashboardId}
              where={where}
              nameOf={(id) => tileNameOf(session.document, id, chartTitleOf)}
            />
          ),
          // The dashboard as a tree (AC-053); a row selects its element.
          outline: (
            <Outline
              document={session.document}
              selected={selected}
              chartTitleOf={chartTitleOf}
              onSelect={(onPage, id) => {
                setOpenPage(onPage);
                setSelected(id);
                setAddTarget(null);
                // Chosen here as on the canvas: its Properties show (AC-203),
                // as the prototype's Outline rows do — with focus, since the
                // row it was on goes with the Outline (T222's review).
                openSidebarPanel('Properties');
                // Brought into view once the page it is on has rendered: it
                // may be far down the canvas, or on a tab that was not open.
                requestAnimationFrame(() => {
                  globalThis.document
                    .querySelector(`[data-tile="${CSS.escape(id)}"]`)
                    ?.scrollIntoView({ block: 'nearest' });
                });
              }}
            />
          ),
          properties: (session.document.filters ?? []).some(
            (each) => each.id === selectedFilter,
          ) ? (
            // A selected filter's field, scope and Remove (T468, UX-031).
            <FilterSettings
              filter={(session.document.filters ?? []).find((each) => each.id === selectedFilter)!}
              filters={session.document.filters ?? []}
              dashboard={session.document}
              chartTitleOf={chartTitleOf}
              focusField={focusFilterField}
              onFieldFocused={fieldFocused}
              onFilters={(next) => {
                session.change({ ...session.document, filters: next });
              }}
              onValue={(key, value) => {
                setFilterValues((current) => {
                  const next = { ...current };
                  if (value === undefined) delete next[key];
                  else next[key] = value;
                  return next;
                });
              }}
              onRemoved={(neighbour) => {
                setSelectedFilter(null);
                // Focus to the next filter's pill, else the filter bar (T182, AC-176).
                requestAnimationFrame(() => {
                  const bar = globalThis.document.querySelector<HTMLElement>('section.filter-bar');
                  (neighbour === undefined
                    ? bar
                    : (bar?.querySelector<HTMLElement>(
                        `[data-filter-id="${CSS.escape(neighbour)}"] button[aria-expanded]`,
                      ) ?? bar)
                  )?.focus();
                });
              }}
            />
          ) : (
            <>
              <TileProperties
                dashboardId={dashboardId}
                document={session.document}
                selected={selected}
                onChange={(apply) => {
                  session.update(apply);
                }}
                // "Edit text on the canvas" (T876, AC-302).
                onEditText={(tileId) => {
                  if (session.saving) return;
                  setSelected(tileId);
                  setAddTarget(null);
                  editText(tileId);
                }}
                /**
                 * Its Elements (T882, AC-519): the edited text's, as its
                 * editor tells them, else the stored document's; a row
                 * selects its element in the text, opening the text first.
                 */
                textProperties={(tile) => {
                  const live =
                    editingText === tile.id && textElements?.tileId === tile.id
                      ? textElements
                      : undefined;
                  const stored = (readAsText(tile) as Tile).document;
                  return (
                    <ElementsList
                      elements={live?.elements ?? (stored === undefined ? [] : elementsOf(stored))}
                      selected={live?.selected ?? null}
                      names={namesFrom(textSources)}
                      onSelect={(index) => {
                        if (session.saving) return;
                        if (editingText !== tile.id) {
                          setSelected(tile.id);
                          setAddTarget(null);
                          editText(tile.id);
                        }
                        setElementAsk((was) => ({ index, ask: (was?.ask ?? 0) + 1 }));
                      }}
                      markings={session.document.markings ?? []}
                      // Its settings (T884, AC-520): to the text being edited,
                      // else to the stored document, one change either way.
                      onChange={(index, settings) => {
                        if (session.saving) return;
                        if (editingText === tile.id) {
                          setElementChange((was) => ({
                            index,
                            settings,
                            ask: (was?.ask ?? 0) + 1,
                          }));
                          return;
                        }
                        session.update((current) =>
                          changeTile(current, tile.id, (each) => {
                            const read = readAsText(each) as Tile;
                            return read.document === undefined
                              ? read
                              : {
                                  ...read,
                                  document: withElementSettings(read.document, index, settings),
                                };
                          }),
                        );
                      }}
                    />
                  );
                }}
                // Whose its chart is, and "Save to folders…" (T133, AC-127).
                chartProperties={(tile) => (
                  <>
                    {/* What it draws, and Edit chart (AC-203). */}
                    {tile.chartId === undefined ? null : (
                      <ChartSection
                        title={chartTitleOf(tile.chartId) ?? 'Untitled chart'}
                        type={chartTypeOf(tile.chartId)}
                        source={chartSourceOf(tile.chartId)}
                        onEdit={() => {
                          openEditor({
                            tileId: tile.id,
                            chartId: tile.chartId ?? '',
                            rows: tile.h,
                            returnTo: '[data-properties-edit-chart]',
                          });
                        }}
                      />
                    )}
                    {tile.chartId === undefined ? null : (
                      <TileChartOwnership
                        key={tile.id}
                        dashboardId={dashboardId}
                        dashboard={session.document}
                        chartId={tile.chartId}
                        stored={documents?.[tile.chartId]}
                        drawn={
                          specs[tile.chartId] === undefined
                            ? { error: errors?.[tile.chartId] }
                            : { spec: specs[tile.chartId] as RenderSpec }
                        }
                        onChange={(apply) => {
                          session.update(apply);
                        }}
                        // Asked for from the tile's ⋯ menu (AC-205).
                        choose={publishing.tileId === tile.id ? publishing.asked : 0}
                      />
                    )}
                    {interactionsOf(session.document.settings).mode !== 'markings' ? (
                      /**
                       * Cross-filtering: no marking control here (AC-120), as
                       * the prototype's Properties has none (`markingProps`) —
                       * what a click here does is set in the settings.
                       */
                      <section className="panel-section marking-section">
                        <h3>Interactions</h3>
                        <p className="panel-section__note">
                          This dashboard uses cross-filtering. What a click here does to each other
                          tile is set in{' '}
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setSettingsSection('Cross-filtering');
                              setSettingsOpen(true);
                            }}
                          >
                            Dashboard settings › Cross-filtering
                          </button>
                          .
                        </p>
                      </section>
                    ) : (
                      <MarkingSection>
                        {/* Which marking clicking in this tile changes (AC-085). */}
                        <TileMarking
                          key={`marking-${tile.id}`}
                          markings={markingsFrom(session.document.markings)}
                          marksWith={tile.marksWith}
                          onChange={(marksWith) => {
                            session.update((current) =>
                              changeTile(current, tile.id, (each) => ({ ...each, marksWith })),
                            );
                          }}
                        />
                        {/* Which markings limit what it shows (AC-107, AC-108),
                        and what it does while they are empty (AC-109). */}
                        <TileLimits
                          key={`limits-${tile.id}`}
                          markings={markingsFrom(session.document.markings)}
                          marksWith={tile.marksWith}
                          limitedBy={tile.limitedBy ?? []}
                          combination={tile.limitCombination ?? 'all'}
                          nothingMarked={tile.nothingMarked ?? NOTHING_MARKED_DEFAULT}
                          nothingMarkedMessage={tile.nothingMarkedMessage ?? ''}
                          onChange={(next) => {
                            session.update((current) =>
                              changeTile(current, tile.id, (each) => ({
                                ...each,
                                ...next,
                                /**
                                 * AC-110: a tile limited for the first time gets
                                 * the message state and a message naming the
                                 * tiles it now waits on.
                                 *
                                 * **Only while the tile has no message of its
                                 * own**, not merely on every 0→1 transition.
                                 * Switching which marking a tile follows is two
                                 * clicks — uncheck one, check another — and the
                                 * second is a 0→1 transition on a tile whose
                                 * message the user may have written themselves.
                                 * The message box is hidden between the clicks,
                                 * so overwriting it there is invisible until
                                 * afterwards.
                                 */
                                ...(each.nothingMarkedMessage === undefined &&
                                (next.limitedBy ?? []).length > 0
                                  ? {
                                      nothingMarked: NOTHING_MARKED_DEFAULT,
                                      nothingMarkedMessage: defaultNothingMarkedMessage(
                                        masterTileNames(
                                          session.document,
                                          next.limitedBy ?? [],
                                          chartTitleOfTile,
                                          defaultMarking?.id,
                                        ),
                                      ),
                                    }
                                  : {}),
                              })),
                            );
                          }}
                        />
                      </MarkingSection>
                    )}
                  </>
                )}
              />
              {/**
               * The dashboard's page tabs, each deletable (AC-060), as the
               * prototype's Properties shows them rather than a row of ×
               * under the tabs (AC-187): the dashboard's own properties, shown
               * with nothing selected, not under a tile's (T248, F19). Escape
               * and an "＋ Add" slot both let go of a selection, and one whose
               * element is gone — the last tile on a page, deleted — is none
               * (T248's review).
               */}
              {selected === null || elementAt(session.document, selected) === null ? (
                <PageTabsProperties
                  document={session.document}
                  onDelete={(page) => {
                    const deletion = { kind: 'page', id: page } as const;
                    const said = describeDeletion(session.document, deletion);
                    const next = deleteFromDashboard(session.document, deletion);
                    if (next === session.document) return;
                    session.change(next);
                    setDeleted(said);
                    if (page === pageId) setOpenPage(next.pages[0]?.id ?? '');
                  }}
                />
              ) : null}
            </>
          ),
        })}
        /**
         * The page tabs, then the filter bar, as the prototype stacks its
         * `.dash-tabs` and `.filterbar`: full width above the canvas and, while
         * editing, the sidebar too (T246, recheck-dashboard mismatch 7) — held
         * there while the tiles scroll (AC-196). The tab strip shows even for
         * one page (AC-207).
         */
        // The details panel, docked under the tiles while it follows the marking (T269, AC-240).
        // Only while marking — not in cross-filter mode (AC-120), not while
        // editing — and for a tile on the page shown (T269's review).
        foot={
          panelFor !== undefined && marking && onPageShown(panelFor.tileId) ? (
            <MarkedRows
              {...rowsProps({ ...panelFor, marked: true })}
              follow={{
                key: followed,
                onChange: (on) => {
                  if (!on) closePanel();
                },
              }}
              onClose={closePanel}
            />
          ) : undefined
        }
        // The toggle's count, name and description (AC-486): the filters
        // holding a value, and those made from a marking, by the bar's titles.
        filtersSummary={filtersSet(
          // The filters the tiles are asked (T831's review).
          live.filters ?? [],
          filterValues,
          markFilters,
          // The model's titles, as the bar's pills read them (DashboardPage's
          // memberTitle is the same meta's): a field it lacks is not shown,
          // so not counted. With no titles handed down, the field's name.
          filterTitle,
        )}
        // While the sheet is closed, its chips in short in the row (AC-200,
        // AC-119; design 19 pin 4): the cross-filters in cross-filter mode,
        // or each non-empty marking, by the same words as the full chips.
        // Not drawn below 1,024 px, where the row holds only the way back,
        // the title, ⋯ and the toggle, whose count still says it (AC-495;
        // headerStyles.ts).
        compact={() => (
          <CompactChips
            crossFilters={
              crossFiltering
                ? crossSelections.map((selection) => ({
                    key: `${selection.from}:${selection.member}`,
                    what: `${memberTitle?.(selection.member) ?? selection.member} = ${selection.value}`,
                    from: chartTitleOfTile(selection.from) ?? selection.from,
                    onClear: () => {
                      clearCompactCrossFilter(selection);
                    },
                  }))
                : []
            }
            markings={
              marking
                ? markings
                    .filter((each) => !isEmptyPredicate(markingOf(marks, each.id)))
                    .map((each) => ({
                      id: each.id,
                      name: each.name,
                      colour: markingColour(each.slot, theme),
                      values: summariseMarking(
                        markingOf(marks, each.id),
                        memberTitle,
                        2,
                        wholeTileTitle,
                      ),
                      from: markSourceTitle(each.id),
                      onUnmark: () => {
                        unmarkAll(each);
                      },
                      onCopyLink: copyLinkWithMarks,
                    }))
                : []
            }
            // Copy link with marks' outcome, seen here too (T838's review).
            note={marking ? linkNote : ''}
          />
        )}
        // The filter bar is in the header sheet, opened by the Filters toggle
        // (F43; design 19 screen 2).
        sheet={(session) => (
          <>
            <FilterBar
              /**
               * The right-hand group (direction.md §7): the cross-filters
               * in effect (AC-119), or a chip per non-empty marking
               * (AC-098) — and, while nothing is set, the one-line hint
               * on how to mark or filter (AC-196), so the bar is always
               * there and says something.
               */
              chips={
                <>
                  {/* Filters made from a marking (AC-113), each removable. */}
                  {markFilters.map((each) => (
                    <span key={each.id} className="mark-filter-chip" data-testid="mark-filter-chip">
                      <span className="mark-filter-chip__label">{markFilterLabel(each)}</span>
                      <button
                        type="button"
                        className="mark-filter-chip__remove"
                        aria-label={`Remove: ${markFilterLabel(each)}`}
                        onClick={() => {
                          setMarkFilters((now) => now.filter((one) => one.id !== each.id));
                          // With the new number set (AC-493).
                          sayAfresh(
                            setMarkSaid,
                            filterChangeSaid({
                              kind: 'removed',
                              what: markFilterSaid(each, filterTitle),
                              set: filtersSetWith(
                                filterValues,
                                markFilters.filter((one) => one.id !== each.id),
                              ),
                            }),
                          );
                          // The × goes with its chip: on to the next one's, or
                          // the filter bar, as a marking's chip does (T120's review).
                          requestAnimationFrame(() => {
                            const next = window.document.querySelector<HTMLElement>(
                              '[data-testid="mark-filter-chip"] button',
                            );
                            (
                              next ??
                              window.document.querySelector<HTMLElement>('section.filter-bar')
                            )?.focus();
                          });
                        }}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </span>
                  ))}
                  {crossFiltering && crossSelections.length > 0 ? (
                    <CrossFilterChips
                      selections={crossSelections}
                      onClear={clearCrossFilterSaid}
                      memberTitle={memberTitle}
                      tileName={chartTitleOfTile}
                    />
                  ) : marking && markings.some((each) => markedCountOf(each.id) > 0) ? (
                    <>
                      {markings.map((each) => (
                        <MarkChip
                          key={each.id}
                          marking={each}
                          colour={markingColour(each.slot, theme)}
                          predicate={markingOf(marks, each.id)}
                          // By the members' titles, from its tile (AC-200).
                          titleOf={memberTitle}
                          from={markSourceTitle(each.id)}
                          // A tile marked whole, by its title (AC-115).
                          tileTitleOf={wholeTileTitle}
                          onUnmark={() => {
                            unmarkAll(each);
                          }}
                          onCopyLink={copyLinkWithMarks}
                        />
                      ))}
                      {linkNote === '' ? null : (
                        <span className="mark-chip-note" data-testid="link-note">
                          {linkNote}
                        </span>
                      )}
                    </>
                  ) : markFilters.length > 0 ? null : (
                    <span className="filter-bar__hint">
                      {interactionHint(interactions.mode, session.editing, preview !== undefined)}
                    </span>
                  )}
                </>
              }
              filters={session.document.filters ?? []}
              dashboard={session.document}
              chartTitleOf={chartTitleOf}
              values={filterValues}
              onValue={(key, value) => {
                setFilterValues((current) => {
                  const next = { ...current };
                  if (value === undefined) delete next[key];
                  else next[key] = value;
                  return next;
                });
              }}
              editing={session.editing}
              // A pill pressed while editing selects its filter (T468, UX-031).
              selected={selectedFilter}
              onSelect={selectFilter}
            />
          </>
        )}
      >
        {(session: EditSession<DashboardDocument>) => (
          <>
            <SessionMirror
              document={session.document}
              onDocument={setLive}
              drafts={session.document.chartDrafts}
              onDrafts={setDrafts}
              saving={session.saving}
              onSaving={setSaving}
              editing={session.editing}
              onEditing={setSessionEditing}
            />
            <DashboardPages
              session={session}
              charts={charts}
              canEdit={preview === undefined && !readOnly && !editsElsewhere && !narrow}
              markSaid={markSaid}
              crossSaid={crossSaid}
              {...(marking
                ? { markKeys: { onKey: onTileMarkKey, itemsOn: markableItemsOf } }
                : crossFiltering
                  ? {
                      // A mark cross-filters from the keyboard too (T405, AC-176).
                      markKeys: {
                        onKey: onTileCrossKey,
                        itemsOn: crossItemsOf,
                        chartsOnly: true,
                        keys: 'Arrow keys move between its items. Space filters the other tiles by it. Escape clears.',
                      },
                    }
                  : {})}
              // A duplicate's chart is made from the stored one and what it
              // draws; the session's drafts are read inside (T068, AC-062).
              duplicateFrom={{
                dashboardId,
                documents: documents ?? {},
                specs,
                errors: errors ?? {},
              }}
              // Not while previewing a security context: the editor asks as
              // wechart (T172's review), so a preview is read, not edited.
              onEditChart={
                preview === undefined && !readOnly && !editsElsewhere && !narrow
                  ? openEditor
                  : undefined
              }
              onSaveToFolders={(tileId) => {
                setSelected(tileId);
                setAddTarget(null);
                setPublishing((was) => ({ tileId, asked: was.asked + 1 }));
                openSidebarPanel('Properties');
              }}
              editTile={editTile}
              startEditing={startEditing}
              onStartedEditing={onStartedEditing}
              editorOpenFor={editingChart?.tileId}
              editingText={editingText}
              onEditingText={editText}
              textSources={textSources}
              copilot={copilot}
              onTextElements={onTextElements}
              elementAsk={elementAsk}
              elementChange={elementChange}
              where={where}
              onAim={(next) => {
                setSelected(next.selected);
                setAddTarget(next.addTarget);
                // Aimed at the canvas — an element, a slot, or nothing: not a filter (T468's review).
                setSelectedFilter(null);
              }}
              deleted={deleted}
              onDeleted={setDeleted}
              outlinedBy={
                outline === null
                  ? undefined
                  : (chartId) => (outline.chartIds.includes(chartId) ? outline.label : undefined)
              }
            />
          </>
        )}
      </EditChrome>
      {/* Export, docked at the dashboard's edge (T511; design 13, pin 2). */}
      {exporting ? (
        <ExportPane
          dashboardId={dashboardId}
          title={document.title}
          className="export-pane--over"
          onOutline={setOutline}
          onClose={closeExport}
          onExported={(message) => {
            setExported(message);
            closeExport();
          }}
        />
      ) : null}
      <ExportedToast
        message={exported}
        onDismiss={() => {
          setExported('');
        }}
      />
    </QueriesAs>
  );
}

/**
 * Mirrors the edit session's chart drafts up to `DashboardView`, which
 * colours every tile and so has to colour drafted charts too (AC-039).
 *
 * The session owns the drafts — its history is what undoes and discards them
 * — and it lives inside `EditChrome`, below where the colours are assigned.
 * Assigning colours down here instead would lose the assignment whenever an
 * overlay replaces the dashboard. So the drafts are copied up, and nothing
 * above treats the copy as the truth: it is re-read from the session after
 * every change, undo and discard.
 *
 * Whether a save is under way comes up the same way, for the one thing above
 * that needs it: returning focus after the editor closes, which has to wait
 * for the saving body to take focus again (T197).
 */
function SessionMirror({
  document,
  onDocument,
  drafts,
  onDrafts,
  saving,
  onSaving,
  editing,
  onEditing,
}: {
  readonly document: DashboardDocument;
  readonly onDocument: (document: DashboardDocument) => void;
  readonly drafts: DashboardDocument['chartDrafts'];
  readonly onDrafts: (drafts: DashboardDocument['chartDrafts']) => void;
  readonly saving: boolean;
  readonly onSaving: (saving: boolean) => void;
  /** Whether the dashboard is being edited: cross-filtering is off while it is (AC-117). */
  readonly editing: boolean;
  readonly onEditing: (editing: boolean) => void;
}) {
  useEffect(() => {
    onDocument(document);
  }, [document, onDocument]);
  useEffect(() => {
    onDrafts(drafts);
  }, [drafts, onDrafts]);
  useEffect(() => {
    onSaving(saving);
  }, [saving, onSaving]);
  useEffect(() => {
    onEditing(editing);
  }, [editing, onEditing]);
  return null;
}

/**
 * Focus on the first of these that can take it: a control in the closed
 * header sheet is hidden, and takes none (T838).
 */
function focusFirstOf(selectors: readonly string[]): void {
  for (const selector of selectors) {
    const found = window.document.querySelector<HTMLElement>(selector);
    if (found === null) continue;
    found.focus();
    if (window.document.activeElement === found) return;
  }
}

/**
 * The page tabs (AC-018, AC-207), and "+ Page tab" beside them while editing
 * (AC-206, the prototype's): inline in the compact row (T829), the tablist holding
 * only tabs, and a new tab opened at once, empty and ready to fill.
 */
function PageTabsRow({
  session,
  pageId,
  onOpenPage,
}: {
  session: EditSession<DashboardDocument>;
  pageId: string;
  onOpenPage: (pageId: string) => void;
}) {
  const { document, editing } = session;
  const showing = document.pages.find((page) => page.id === pageId) ?? document.pages[0];
  const row = useRef<HTMLDivElement>(null);
  /**
   * In view mode, those that don't fit go behind "More ▾", the open page
   * always inline (AC-492, T837). While editing, every tab is in the strip,
   * which scrolls, so each stays a drop target (AC-491).
   */
  const placed = useTabsThatFit(row, document.pages, showing?.id, !editing);
  const inline = document.pages.filter((page) => !placed.menu.includes(page.id));
  const rest = document.pages.filter((page) => placed.menu.includes(page.id));
  return (
    <div className="page-tabs__row" ref={row} data-fit={placed.fits ? '' : undefined}>
      <div role="tablist" aria-label="Pages" className="page-tabs">
        {inline.map((page) => (
          <button
            key={page.id}
            type="button"
            role="tab"
            aria-selected={page.id === showing?.id}
            // One Tab stop, the arrows along it (T182, APG tabs).
            tabIndex={page.id === showing?.id ? 0 : -1}
            // A tile dropped on a page tab moves to that page (AC-056).
            data-droptab={pageKey(page.id)}
            // Its width, for which fit the row (T837).
            data-page={page.id}
            onClick={() => {
              onOpenPage(page.id);
            }}
            onKeyDown={(event) => {
              onTabKey(event, (index) => {
                const chosen = inline[index];
                if (chosen !== undefined) onOpenPage(chosen.id);
              });
            }}
          >
            {page.title}
          </button>
        ))}
      </div>
      {rest.length === 0 ? null : (
        <div className="page-tabs__more-box">
          <PageTabsMore pages={rest} onOpen={onOpenPage} />
        </div>
      )}
      {editing ? (
        <div className="page-tabs__rest">
          <button
            type="button"
            className="btn-ghost btn-sm page-tabs__add"
            onClick={() => {
              const id = `page-${String(Date.now())}-${String(counter++)}`;
              session.change({
                ...document,
                pages: [
                  ...document.pages,
                  { id, title: `Page ${String(document.pages.length + 1)}`, items: [] },
                ],
              });
              onOpenPage(id);
            }}
          >
            + Page tab
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DashboardPages({
  session,
  charts,
  onEditChart,
  onSaveToFolders,
  editTile,
  startEditing = false,
  onStartedEditing,
  editorOpenFor,
  editingText = null,
  onEditingText,
  textSources,
  copilot,
  onTextElements,
  elementAsk,
  elementChange,
  where,
  onAim,
  deleted,
  onDeleted,
  duplicateFrom,
  markSaid = '',
  crossSaid = '',
  markKeys,
  canEdit = true,
  outlinedBy,
}: {
  session: EditSession<DashboardDocument>;
  charts: TileCharts;
  /** What outlines a chart's tiles, from the Export pane (T511, AC-360). */
  outlinedBy?: ((chartId: string) => string | undefined) | undefined;
  /** The last marking change, for the dashboard's polite live region (AC-101). */
  markSaid?: string;
  /** What the keyboard's cross-filtering came to, for its own polite region (T405). */
  crossSaid?: string;
  /**
   * The marking keys a focused tile answers in view mode (AC-100): what each
   * key does is the dashboard's, since the marking is held there. Absent in
   * Markings mode means this tile marks nothing.
   */
  markKeys?:
    | {
        readonly onKey: (event: React.KeyboardEvent, tileId: string) => void;
        readonly itemsOn: (tileId: string) => readonly string[];
        /** What the keys do, said with the tile: the marking's unless given (T405). */
        readonly keys?: string;
        /**
         * Only a chart tile answers them, so only it is a tab stop: in
         * cross-filter mode, as outside Markings (T266's review; T405's).
         */
        readonly chartsOnly?: boolean;
      }
    | undefined;
  /**
   * What a duplicated chart tile's copy is made from (T068, AC-062): the
   * dashboard it is local to, and each chart's stored document and drawing.
   */
  duplicateFrom?:
    | {
        readonly dashboardId: string;
        readonly documents: Readonly<Record<string, ChartDocument>>;
        readonly specs: Readonly<Record<string, RenderSpec>>;
        readonly errors: Readonly<Record<string, unknown>>;
      }
    | undefined;
  /**
   * What the last delete took, for the toast (AC-060). Held above, because a
   * page tab is deleted from the sidebar's Properties, outside this.
   */
  deleted: string;
  onDeleted: (said: string) => void;
  /**
   * Open a tile's chart in the editor overlay (T032) — what E does to the
   * focused tile (AC-057) and what the tile's pencil does. The tile id comes
   * with the chart id, because the overlay measures the tile to preview the
   * chart at its size; it used to be dropped on the way through.
   */
  onEditChart?: ((open: OpenChart) => void) | undefined;
  /**
   * A chart tile's "Save to folders…" from its ⋯ menu (AC-205): its
   * Properties, with the folder to choose (the prototype's `data-publish`).
   */
  onSaveToFolders?: ((tileId: string) => void) | undefined;
  /** The tile the URL names as open in the editor (T196). */
  editTile?: string | undefined;
  /** Enter edit mode once, as asked (T245). */
  startEditing?: boolean | undefined;
  onStartedEditing?: (() => void) | undefined;
  /** The tile the editor is open on now, if it is open. */
  editorOpenFor?: string | undefined;
  /**
   * The Text tile whose text is editable on the canvas (T876, AC-302), owned
   * above so Properties' "Edit text on the canvas" can start it too.
   */
  editingText?: string | null;
  onEditingText?: ((tileId: string | null) => void) | undefined;
  /** What a Text tile's insert menu offers (T881, AC-517), and its Copilot group (AC-535). */
  textSources?: InsertSources | undefined;
  copilot?: CopilotOffer;
  /** The edited text's elements, for Properties' Elements list, and a row's ask to select one (AC-519). */
  onTextElements?: TextEditing['onElements'];
  elementAsk?: TextEditing['selectElement'];
  /** An element's settings from Properties, for the text being edited (T884). */
  elementChange?: TextEditing['changeElement'];
  /** Where the next insert is aimed, owned above so the sidebar agrees. */
  where: { selected: string | null; addTarget: string | null; pageId: string };
  onAim: (next: { selected: string | null; addTarget: string | null }) => void;
  /** Whether the dashboard can be edited here — not while previewing (AC-207). */
  canEdit?: boolean;
}) {
  const { document, editing } = session;
  // Which page is open is owned above, so the Add panel adds to the page the
  // user is actually looking at.
  const open = where.pageId;

  /** The chart tiles showing their table (AC-178), switched there or from ⋯ (AC-199). */
  const [tableTiles, setTableTiles] = useState<ReadonlySet<string>>(() => new Set());
  /** The sections collapsed (AC-202), kept across view and edit mode. */
  const [collapsedSections, setCollapsedSections] = useState<ReadonlySet<string>>(() => new Set());
  /** Open every collapsed section around an element, so it has a box to show. */
  const expandAround = (id: string, including?: string) => {
    const around = [
      ...document.pages.flatMap((page) => sectionsAround(page.items, id)),
      ...(including === undefined ? [] : [including]),
    ];
    if (!around.some((section) => collapsedSections.has(section))) return;
    setCollapsedSections((now) => {
      const next = new Set(now);
      for (const section of around) next.delete(section);
      return next;
    });
  };
  /**
   * A new selection inside a collapsed section opens it — once per selection,
   * as a tab group follows it (T221's review): selected from the Outline, it
   * was hidden, with nothing to scroll to and the next insert out of sight.
   */
  const [followedSelection, setFollowedSelection] = useState<string | null>(null);
  if (where.selected !== followedSelection) {
    setFollowedSelection(where.selected);
    if (where.selected !== null) expandAround(where.selected);
  }

  /**
   * Asked to open in edit mode (T245): entered once, as Edit would enter it —
   * not while previewing, where nothing can be edited — and the request then
   * forgotten, so a reload opens the dashboard to be read.
   */
  const startedEditing = useRef(false);
  useEffect(() => {
    if (!startEditing || startedEditing.current) return;
    startedEditing.current = true;
    if (canEdit) session.edit();
    onStartedEditing?.();
  }, [startEditing, canEdit, session, onStartedEditing]);

  /**
   * The URL naming a tile the editor is not open on — a reload, or the
   * browser's Forward (T196, AC-002): open it, as its pencil would, entering
   * edit mode first. Only when the named tile *changes*, not whenever the two
   * differ: closing the editor takes the tile out of the URL a moment after
   * the editor has gone, and in that moment they differ too.
   */
  const lastEditTile = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (editTile === lastEditTile.current) return;
    lastEditTile.current = editTile;
    if (editTile === undefined || editTile === editorOpenFor || onEditChart === undefined) return;

    const chartId = chartIdOf(document, editTile);
    if (chartId === undefined) return;
    session.edit();
    const element = elementAt(document, editTile);
    onEditChart({
      tileId: editTile,
      chartId,
      rows: element !== null && isTile(element) ? element.h : undefined,
      returnTo: `[data-edit-chart="${CSS.escape(editTile)}"]`,
      fromUrl: true,
    });
  }, [editTile, editorOpenFor, onEditChart, document, session]);

  /** What the last delete took, for the toast (AC-060), held above. */
  const setDeleted = onDeleted;

  /** The section whose contents we are asking about (AC-061). */
  const [asking, setAsking] = useState<string | null>(null);
  const askedAbout = asking === null ? null : elementAt(document, asking);
  const showing = document.pages.find((page) => page.id === open) ?? document.pages[0];

  /**
   * The drag lives here, above every canvas, because a tile can be dropped
   * into a container it did not start in or onto a tab label that is inside
   * no canvas at all (AC-056).
   */
  const containers = containersOf(document);
  /** A tile's name wherever it is announced (AC-209), as the Outline names it. */
  const tileName = (id: string) => tileNameOf(document, id, (chartId) => charts.titleOf?.(chartId));

  /**
   * A Text tile's text edited in place (T876, AC-302; design 21 pin 1): the
   * tile selected as it starts; once it's left, the whole edit is one change
   * to the session, so one Undo reverses it; after Esc, or a click on nothing
   * that takes focus, the tile has focus (rule 85's pattern).
   */
  const textEditing: TextEditing = {
    tileId: editing ? editingText : null,
    start: (tileId) => {
      if (!editing || session.saving) return;
      onAim({ selected: tileId, addTarget: null });
      onEditingText?.(tileId);
    },
    leave: (tileId, next, how) => {
      onEditingText?.(null);
      if (next !== undefined)
        session.update((current) =>
          changeTile(current, tileId, (tile) => ({
            ...(readAsText(tile) as Tile),
            document: next,
          })),
        );
      if (how !== 'away') tileNode(tileId)?.focus();
    },
    nameOf: tileName,
    sources: textSources,
    copilot,
    onElements: onTextElements,
    selectElement: elementAsk,
    changeElement: elementChange,
  };

  const drag = useTileDrag({
    onMove: (tileId, to) => {
      session.change(moveTile(document, tileId, to));
    },
    // Ids are a poor thing to read aloud, so a container is announced by the
    // name it shows in the Move-to menu and a tile by its title (AC-209).
    nameOf: (idOrKey) =>
      containers.find((container) => container.key === idOrKey)?.title ?? tileName(idOrKey),
  });

  const affordances: Affordances = {
    editing,
    charts,
    nameOf: tileName,
    outlinedBy,
    sections: {
      collapsed: collapsedSections,
      toggle: (id) => {
        setCollapsedSections((now) => {
          const next = new Set(now);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
    },
    tableViews: {
      showing: tableTiles,
      set: (tileId, on) => {
        setTableTiles((now) => {
          const next = new Set(now);
          if (on) next.add(tileId);
          else next.delete(tileId);
          return next;
        });
      },
    },
    /**
     * A chart tile's pencil (T032). In view mode too — direction.md §2: "From
     * view mode, the pencil switches the dashboard into edit mode first" —
     * because the edit is held in the session until the dashboard is saved,
     * and in view mode there is no session to hold it. `session.edit()` does
     * nothing when already editing, so no change made so far is re-based.
     */
    onEditChart:
      onEditChart === undefined
        ? undefined
        : (tileId, chartId) => {
            // Not while a save is under way: an edit applied now would go to
            // a session that takes no change (AC-184, T197).
            if (session.saving) return;
            session.edit();
            // The height as the session has it, resizes included (see openEditor).
            const element = elementAt(document, tileId);
            onEditChart({
              tileId,
              chartId,
              rows: element !== null && isTile(element) ? element.h : undefined,
              // Back returns to the pencil it was opened from.
              returnTo: `[data-edit-chart="${CSS.escape(tileId)}"]`,
            });
          },
    // A change to the dashboard goes through the session rather than into
    // local state, which is what makes it undoable and what Discard reverts
    // (AC-060, AC-066).
    onResize: editing
      ? (id, size) => {
          session.change(resizeTile(document, id, size));
        }
      : undefined,
    // Only tiles are picked up. AC-056 is about a tile; a section or a tab
    // group is a container, and a grip on one is a gesture no criterion
    // describes — moving containers belongs with the Outline (AC-058 onwards).
    drag: editing
      ? {
          ...drag,
          canDrag: (id) => isTileId(document, id),
          nameOf: tileName,
        }
      : undefined,
    /**
     * The keyboard route to everything the pointer can do (AC-057), which is
     * what makes direction.md rule 39 true of this surface — moving and
     * resizing were pointer-only until now.
     */
    onTileKeyDown: editing
      ? (event, tile) => {
          // Escape lets go of the selection, as the prototype's does (T248):
          // with nothing selected, Properties is the dashboard's own, its
          // page tabs among them. A section as much as a tile.
          if (event.key === 'Escape' && where.selected !== null) {
            event.preventDefault();
            event.stopPropagation();
            onAim({ selected: null, addTarget: where.addTarget });
            return;
          }
          /**
           * Only a tile, exactly as the drag refuses containers. AC-057 says
           * "a tile", and Delete is the most destructive of the four keys —
           * letting it take a section and everything in it, with no prompt,
           * would also pre-empt AC-061's "ask whether to delete its contents
           * or keep them" in the more destructive direction.
           */
          if (!isTileId(document, tile.id)) return;
          // Nothing while a save is under way (AC-184, T197): the session
          // takes no change, and the editor would apply to one about to end.
          if (session.saving) return;

          const element = elementAt(document, tile.id);
          const action = actionFor(
            event,
            { w: tile.w, h: tile.h ?? MIN_ROWS },
            element !== null && isSized(element),
          );
          if (action === null) return;

          // Only once it is ours: otherwise an arrow key that scrolls the
          // page, or Delete meant for something else, would be swallowed.
          event.preventDefault();
          event.stopPropagation();

          if (action.kind === 'edit') {
            // The chart id comes from the session's document, not the route's
            // saved copy: they are the same today and will not be once a tile
            // can be added (AC-058) or duplicated (AC-062).
            const chartId = chartIdOf(document, tile.id);
            // The height as the session has it, resizes included; Back returns
            // to the tile, which is where E was pressed.
            if (chartId !== undefined) {
              onEditChart?.({
                tileId: tile.id,
                chartId,
                rows: tile.h,
                returnTo: `[data-tile="${CSS.escape(tile.id)}"]`,
              });
            }
            return;
          }

          if (action.kind === 'delete') {
            // Both routes back, as the criterion asks: the toast right here,
            // and the edit bar's Undo. They step the same history.
            const deletion = { kind: 'element', id: tile.id } as const;
            const said = describeDeletion(document, deletion, tileName);
            const next = deleteFromDashboard(document, deletion);
            if (next === document) return;

            const refocus = focusAfterDeleting(tile.id);
            session.change(next);
            onDeleted(said);
            drag.say(said);
            refocus();
            return;
          }

          if (action.kind === 'properties') {
            // This tile's Properties, focus there (T182, AC-176): the tile is
            // selected already, having focus.
            onAim({ selected: tile.id, addTarget: null });
            openSidebarPanel('Properties');
            return;
          }

          const next =
            action.kind === 'move'
              ? moveBy(document, tile.id, action.by)
              : resizeTile(document, tile.id, action.size);

          /**
           * Nothing changed, nothing to record. `moveBy` hands back the same
           * document at either end of a container and `resizeTile` does at
           * the size limits, so holding an arrow key against the edge would
           * otherwise pile up undo entries that each undo nothing — the very
           * failure the pointer path already guards against for a click on a
           * resize handle.
           */
          if (next === document) return;

          session.change(next);
          drag.say(
            action.kind === 'resize'
              ? `${tileName(tile.id)}: ${readoutFor(action.size.w, action.size.h)}.`
              : sayPlace(next, tile.id, (id) =>
                  tileNameOf(next, id, (chartId) => charts.titleOf?.(chartId)),
                ),
          );
        }
      : markKeys === undefined && charts.onTileMenu === undefined
        ? undefined
        : /**
           * In view mode a focused tile answers the marking's keys instead
           * (AC-100): the same tab stop, a different vocabulary, because
           * arranging and reading are different things to be doing. And a
           * chart tile opens its menu on Shift+F10 or the Menu key, in any
           * interaction mode (T266, AC-246): handled here, with the default
           * prevented, since Chromium on a Mac never makes those keys a
           * `contextmenu` itself, and elsewhere makes one only if the key
           * was not handled (research/context-menu-and-submenus.md §4).
           */
          (event, tile) => {
            const opensMenu =
              !event.ctrlKey &&
              !event.altKey &&
              !event.metaKey &&
              ((event.key === 'F10' && event.shiftKey) ||
                (event.key === 'ContextMenu' && !event.shiftKey));
            if (opensMenu && chartIdOf(document, tile.id) !== undefined) {
              event.preventDefault();
              charts.onTileMenu?.(tile.id);
              return;
            }
            markKeys?.onKey(event, tile.id);
          },
    // Outside Markings only a chart tile answers a key — its menu's, or in
    // cross-filter mode the filtering ones — so only it is a tab stop there
    // (T266's review; T405's).
    ...(editing || (markKeys !== undefined && markKeys.chartsOnly !== true)
      ? {}
      : { takesKeys: (id: string) => chartIdOf(document, id) !== undefined }),
    /**
     * A `contextmenu` a keyboard makes at the focused tile — VoiceOver's
     * VO+Shift+M, or the Menu key where the keydown did not stop it — opens
     * the tile's menu, never the browser's (AC-246; research gotcha 2).
     */
    ...(editing || charts.onTileMenu === undefined
      ? {}
      : {
          onTileContextMenu: (event: React.MouseEvent, tile: { id: string }) => {
            if (chartIdOf(document, tile.id) === undefined) return;
            event.preventDefault();
            charts.onTileMenu?.(tile.id);
          },
        }),
    onDelete: editing
      ? (id) => {
          /**
           * A section that holds something asks first (AC-061). Not "are you
           * sure" — *which* of two reasonable things to do: take the contents
           * with it, or keep them where they are.
           */
          if (sectionHasContents(document, id)) {
            setAsking(id);
            return;
          }

          const deletion = { kind: 'element', id } as const;
          const said = describeDeletion(document, deletion, tileName);
          const next = deleteFromDashboard(document, deletion);
          if (next === document) return;

          // The ⋯ menu it came from goes with it.
          const refocus = focusAfterDeleting(id);
          session.change(next);
          onDeleted(said);
          refocus();
        }
      : undefined,
    onDuplicate:
      editing && duplicateFrom !== undefined
        ? (id) => {
            const mintTileId = () => `el-${String(Date.now())}-${String(counter++)}`;
            // A chart tile's copy with a chart of its own (AC-062); any other
            // tile's, itself again (AC-205).
            const copied =
              duplicateChartTile(document, id, { ...duplicateFrom, mintTileId, mintChartId }) ??
              duplicatePlainTile(document, id, mintTileId);
            if (copied === undefined) return;
            session.change(copied.document);
            // The copy selected, said, and focused, as an insert's tile is:
            // one insertion point, not two (T068's review).
            onAim({ selected: copied.tileId, addTarget: null });
            drag.say(
              `${tileNameOf(copied.document, copied.tileId, (chartId) => charts.titleOf?.(chartId))} duplicated.`,
            );
            requestAnimationFrame(() => {
              window.document
                .querySelector<HTMLElement>(`[data-tile="${CSS.escape(copied.tileId)}"]`)
                ?.focus();
            });
          }
        : undefined,
    onCreateDetails:
      canEdit && duplicateFrom !== undefined
        ? (tileId) => {
            // Not while a save is under way: the session takes no change (AC-184).
            if (session.saving) return;
            const shown = charts.markingOn?.(tileId);
            if (shown === undefined) return;
            const detailsId = `el-${String(Date.now())}-${String(counter++)}`;
            const chartIdOfCopy = mintChartId();
            const make = (current: DashboardDocument) =>
              createDetailsTile(current, tileId, {
                ...duplicateFrom,
                mintTileId: () => detailsId,
                mintChartId: () => chartIdOfCopy,
                markingId: shown.marking.id,
                // Every tile that marks with it, as AC-110 names them.
                masters: masterTileNames(
                  current,
                  [shown.marking.id],
                  (id) => {
                    const element = elementAt(current, id);
                    return element !== null && isTile(element) && element.chartId !== undefined
                      ? charts.titleOf?.(element.chartId)
                      : undefined;
                  },
                  defaultMarkingOf(current)?.id,
                ),
              });
            // Nothing made — a chart not yet read — is no change, and not said.
            if (make(document) === undefined) return;
            // From view mode, editing first, which holds the new tile until it
            // is saved — or Discard takes it away.
            session.edit();
            session.update((current) => make(current)?.document ?? current);
            onAim({ selected: detailsId, addTarget: null });
            drag.say(`Details tile added, limited by ${shown.marking.name}.`);
            requestAnimationFrame(() => {
              window.document
                .querySelector<HTMLElement>(`[data-tile="${CSS.escape(detailsId)}"]`)
                ?.focus();
            });
          }
        : undefined,
    ownershipOf:
      editing && duplicateFrom !== undefined
        ? (id) => {
            const found = elementAt(document, id);
            if (found === null || found.kind !== 'chart' || found.chartId === undefined)
              return undefined;
            const chartId = found.chartId;
            const draft = document.chartDrafts?.[chartId];
            const chart = draft?.document ?? duplicateFrom.documents[chartId];
            // Not while it loads, nor one already on its way to a folder.
            if (chart === undefined || draft?.wasLocalTo !== undefined) return undefined;
            if (chart.localToDashboardId === duplicateFrom.dashboardId)
              return { label: 'Save to folders…', run: () => onSaveToFolders?.(id) };
            // Another dashboard's chart is that dashboard's to save.
            if (chart.localToDashboardId !== undefined) return undefined;
            return {
              label: 'Make a local copy',
              // As the editor's "Make a local copy" (T135, AC-129): the tile
              // repointed to a copy only this dashboard has.
              run: () => {
                const spec = duplicateFrom.specs[chartId];
                session.update((current) =>
                  detach(current, id, {
                    dashboardId: duplicateFrom.dashboardId,
                    copyId: mintChartId(),
                    edited: {
                      document: chart,
                      // What it draws as edited in this session, where it was
                      // — never the stored drawing beside the edited chart
                      // (T223's review).
                      drawn:
                        draft?.drawn ??
                        (spec === undefined ? { error: duplicateFrom.errors[chartId] } : { spec }),
                    },
                  }),
                );
                drag.say(`${tileName(id)} is now a local copy, only on this dashboard.`);
                // Focus stays with the tile the menu was on.
                requestAnimationFrame(() => {
                  window.document
                    .querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"]`)
                    ?.focus();
                });
              },
            };
          }
        : undefined,
    onDeleteTab: editing
      ? (groupId, tabId) => {
          const deletion = { kind: 'tab', groupId, id: tabId } as const;
          const said = describeDeletion(document, deletion);
          const next = deleteFromDashboard(document, deletion);
          if (next === document) return;

          session.change(next);
          onDeleted(said);
        }
      : undefined,
    selection: editing
      ? {
          id: where.selected,
          // Choosing somewhere new retires the slot: with two aims at once
          // the user cannot tell which the next insert will follow.
          onSelect: (id, onControl) => {
            onAim({ selected: id, addTarget: null });
            // A tile chosen shows its Properties (AC-203), focus left on it —
            // not a tile whose own control was used, as the prototype's
            // selects only on a click that is not on a button.
            if (!onControl) openSidebarPanel('Properties', { focus: false });
          },
          // Passing through on the way to the sidebar is not a choice.
          onFocusSelect: (id) => {
            onAim({ selected: id, addTarget: where.addTarget });
          },
        }
      : undefined,
    addHere: editing
      ? {
          activeKey: where.addTarget,
          onChoose: (key) => {
            onAim({ selected: null, addTarget: key });
            // What goes there is chosen in Add, as the prototype's slot opens it.
            openSidebarPanel('Add', { focus: false });
          },
          nameOf: (key) =>
            containersOf(document).find((container) => container.key === key)?.title ??
            'this container',
        }
      : undefined,
    describeItem: editing
      ? (id) => {
          // A container answers none of the keys; a tile with no chart has
          // nothing for E to open.
          if (!isTileId(document, id)) return { role: 'dashboard section', keys: '' };

          const editable = chartIdOf(document, id) !== undefined ? ' E edits.' : '';
          return {
            role: 'dashboard tile',
            keys: `Arrow keys move. Shift and arrow keys resize.${editable} Enter opens its properties. Delete removes.`,
          };
        }
      : markKeys !== undefined || charts.onTileMenu !== undefined
        ? (id) => {
            // In view mode the keys are the marking's (AC-100), and only a
            // tile that marks with something answers them; a chart tile's
            // menu opens on Shift+F10 (T266, AC-246).
            const menu =
              charts.onTileMenu !== undefined && chartIdOf(document, id) !== undefined
                ? ' Shift and F10 open its menu.'
                : '';
            if (
              !isTileId(document, id) ||
              markKeys === undefined ||
              markKeys.itemsOn(id).length === 0
            ) {
              return { role: 'dashboard tile', keys: menu.trim() };
            }
            return {
              role: 'dashboard tile',
              keys: `${markKeys.keys ?? 'Arrow keys move between its items. Space marks. Ctrl and Space toggle. Shift and arrow keys extend. Escape unmarks.'}${menu}`,
            };
          }
        : undefined,
    moveTo: editing
      ? {
          containers: containersOf(document),
          onMove: (tileId, to) => {
            // The same move the drag makes, reached without one.
            const elsewhere = focusAfterDeleting(tileId);
            session.change(moveTile(document, tileId, { key: to, index: null }));
            // Into a collapsed section: opened, so the tile — and focus with
            // it — has somewhere to be (T221's review).
            if (to.startsWith('sec:'))
              expandAround(to.slice('sec:'.length), to.slice('sec:'.length));
            /**
             * Focus goes with the tile to where it landed (T182, AC-176): it
             * is drawn afresh there, and its ⋯ menu with it. Moved to a page
             * or tab not showing, it is out of reach, so focus stays where it
             * was, on the tile beside it.
             */
            requestAnimationFrame(() => {
              const moved = tileNode(tileId);
              if (moved === null) elsewhere();
              else moved.focus();
            });
          },
        }
      : undefined,
  };

  return (
    <>
      <div
        data-testid="dashboard-page"
        className="dashboard-page"
        data-width={document.settings.width}
      >
        {showing ? (
          <TextEditingContext value={textEditing}>
            <Elements
              items={showing.items}
              containerKey={pageKey(showing.id)}
              affordances={affordances}
            />
          </TextEditingContext>
        ) : null}
        {/* A page with nothing on it says so, and how to begin (AC-207). While
            editing, the canvas's own drop zones and the Add panel are that. */}
        {!editing && (showing?.items.length ?? 0) === 0 ? (
          <div className="dashboard-empty">
            {/* How to begin only where it can be begun: not while previewing,
                nor in a narrow window (T250's review). */}
            <p>
              {canEdit
                ? 'Nothing here yet. Edit the dashboard to add charts.'
                : 'Nothing here yet.'}
            </p>
            {/* Not while previewing, where the dashboard cannot be edited. */}
            {canEdit ? (
              <button type="button" className="btn-primary" onClick={session.edit}>
                Start editing
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/**
       * The instructions every grip points at with aria-describedby, and the
       * polite region the gesture narrates into. Both are the baseline
       * `docs/research/dashboard-grid.md` makes a condition of building this
       * drag ourselves rather than taking dnd-kit — without them a drag is a
       * silent change to the document.
       */}
      <p id={DRAG_INSTRUCTIONS_ID} hidden>
        {DRAG_INSTRUCTIONS}
      </p>
      <p
        role="status"
        aria-live="polite"
        data-testid="drag-announcement"
        className="visually-hidden"
      >
        {drag.announcement}
      </p>
      {/* What a marking change came to, said politely (AC-101). Its own
          region, so a marking and a drag cannot talk over each other. */}
      <MarkingAnnouncer message={markSaid} />
      {/* What the keyboard's cross-filtering came to (T405), said politely. */}
      <p
        className="visually-hidden"
        data-testid="cross-filter-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {crossSaid}
      </p>

      {/**
       * Both ways back, as AC-060 asks: this toast, and the edit bar's Undo.
       * They step the same history, so undoing in one is undoing in the other.
       */}
      {asking === null || askedAbout === null || !isSection(askedAbout) ? null : (
        <DeleteSectionDialog
          title={askedAbout.title}
          count={askedAbout.items.length}
          onDeleteContents={() => {
            const deletion = { kind: 'element', id: asking } as const;
            const said = describeDeletion(document, deletion, tileName);
            const refocus = focusAfterDeleting(asking);
            session.change(deleteFromDashboard(document, deletion));
            setAsking(null);
            setDeleted(said);
            refocus();
          }}
          onKeepContents={() => {
            // Ungrouping: the section goes, its items stay where they were.
            // "Keep" losing a tile is this criterion's own failing state.
            const refocus = focusAfterDeleting(asking);
            // Onto the first of them, where the section was.
            const kept = askedAbout.items[0]?.id;
            session.change(ungroupSection(document, asking));
            setAsking(null);
            setDeleted(`Deleted section “${askedAbout.title}” and kept what was in it.`);
            requestAnimationFrame(() => {
              const first = kept === undefined ? null : tileNode(kept);
              if (first === null) refocus();
              else first.focus();
            });
          }}
          onCancel={() => {
            // Back to the section it was asked about: its ⋯ menu has closed.
            const section = asking;
            setAsking(null);
            requestAnimationFrame(() => {
              tileNode(section)?.focus();
            });
          }}
        />
      )}

      <UndoToast
        message={deleted}
        onUndo={() => {
          session.undo();
          setDeleted('');
        }}
        onDismiss={() => {
          setDeleted('');
        }}
      />

      {drag.marker === null ? null : (
        <div
          data-testid="drop-marker"
          className="drop-marker"
          style={{
            left: `${String(drag.marker.x)}px`,
            top: `${String(drag.marker.y)}px`,
            width: `${String(drag.marker.width)}px`,
            height: `${String(drag.marker.height)}px`,
          }}
        />
      )}
    </>
  );
}
