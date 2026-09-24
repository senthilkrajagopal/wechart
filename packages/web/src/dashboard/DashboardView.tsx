import {
  toChartSpec,
  toCubeQuery,
  type ChartDocument,
  type ChartType,
  type MemberFormats,
  type RenderSpec,
} from '@wechart/core';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { TileSize } from '../editor/PreviewFrame';
import type { AnswerMeta } from '../query/answerMeta';
import { loadTile } from '../query/loadTile';
import { SecurityPreview } from '../query/securityPreview';
import { ChartTile } from '../tiles/ChartTile';
import { TileError } from '../tiles/TileError';
import { hiddenMemberOf, TileUnavailable } from '../tiles/TileUnavailable';
import { accelerationOf } from '../tiles/AccelerationBadge';
import { RollupRefreshNote } from '../tiles/RollupRefreshNote';
import { TileSkeleton } from '../tiles/TileSkeleton';
import { useDashboardColours } from './colours';
import { AddPanel } from './edit/AddPanel';
import { withFormats } from './chartSpec';
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
import { EditChrome, type EditSession } from './edit/EditChrome';
import { openSidebarPanel } from './edit/EditSidebar';
import { MoveToMenu } from './edit/MoveToMenu';
import { NOTHING_CHOSEN, needsOf, templateElements } from './edit/templates';
import { PreviewBanner } from './PreviewBanner';
import { TileViewMenu } from './TileViewMenu';
import { SettingsPage } from './settings/SettingsPage';
import { placeInGrammar } from './model/grammar';
import { insertElement, insertionPoint, newElement } from './model/insert';
import { activeFilters, withFilters, type ActiveFilter } from '../filters/apply';
import { GeneratedSql } from '../workspaces/security/GeneratedSql';
import { coverageOf, type Reach } from '../filters/coverage';
import { chartTilesOf } from '../filters/scope';
import { effectsOn, type CrossEffects, type CrossSelection } from './crossfilter/apply';
import { clickedValue, membersDrawn, seriesCountOf, type ClickedItem } from './crossfilter/clicked';
import { interactionsOf } from './settings/interactionMode';
import { describeFilter } from '../filters/describe';
import { NotCovered } from '../filters/NotCovered';
import { PageTabsProperties, TileProperties } from './edit/TileProperties';
import { ImageTile } from './tiles/ImageTile';
import { LinkTile } from './tiles/LinkTile';
import { FilterBar } from '../filters/FilterBar';
import {
  FilteredCharts,
  keepLastAnswers,
  type FilteredChartsHandle,
  type FilteredResults,
} from '../filters/FilteredCharts';
import { newFilter, type FilterValues } from '../filters/model';
import { adoptValues, sameValues, type SearchFilter } from '../filters/url';
import { StateLine } from '../shell/StatusIcon';
import { Canvas, type CanvasProps } from './grid/Canvas';
import { DRAG_INSTRUCTIONS, DRAG_INSTRUCTIONS_ID, useTileDrag } from './grid/drag';
import { COLUMNS, ROW_UNIT_PX } from './grid/geometry';
import { actionFor } from './grid/keyboard';
import { MIN_ROWS, readoutFor } from './grid/resize';

/**
 * Where a tile has ended up, for the live region. `placeOf` already knows
 * both numbers; saying "third of five" is what tells a reader the move landed
 * and whether there is anywhere further to go.
 */
function sayPlace(document: DashboardDocument, tileId: string): string {
  const place = placeOf(document, tileId);
  if (place === null) return '';
  return `${nameOfTile(document, tileId)}: position ${String(place.index + 1)} of ${String(place.of)}.`;
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
  nameOfTile,
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
import { duplicateChartTile } from './model/duplicate';
import { withLocalCharts } from './model/localCharts';

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
  /** A field's title in the model, which names a filter in words (AC-043). */
  readonly memberTitle?: ((member: string) => string | undefined) | undefined;
  /**
   * Each member's number format from the Cube model (AC-046). Applied here,
   * after any chart edited from a tile has replaced its saved spec, so a
   * drafted tile is formatted like every other.
   */
  readonly formats?: MemberFormats | undefined;
  /**
   * An edit has begun — an edit session, or the settings page opened in view
   * mode — for the page, which checks that edit's save against the version
   * the dashboard had at this moment (T198, AC-015).
   */
  readonly onEditStart?: (() => void) | undefined;
  /**
   * The tile the URL names as open in the chart editor (T196, AC-002). A
   * reload, or the browser's Forward, that brings one in opens the editor on
   * its chart; one that goes — the browser's Back — closes the editor the way
   * its own Back does, keeping the change.
   */
  readonly editTile?: string | undefined;
  /**
   * The filter values the URL holds now (AC-081). The dashboard opens with
   * them; after that it holds its own, and puts them back in the URL whenever
   * the URL comes to say otherwise — a change made here, or a Back or Forward
   * onto an entry written before the last change.
   */
  readonly urlFilterValues?: FilterValues | undefined;
  /** Put these filter values in the URL (AC-081). */
  readonly onFilterValues?: ((values: FilterValues) => void) | undefined;
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
  onItemClick,
}: {
  tile: Tile;
  /** A click on its chart, while the dashboard cross-filters (AC-117). */
  onItemClick?: ((item: ClickedItem) => void) | undefined;
  spec: RenderSpec | undefined;
  error: unknown;
  loading: boolean;
  /** The type the chart is made for: its document's, or the tile's without one. */
  chartType?: ChartType | undefined;
  /** The tile offers its pencil into the chart editor (T132). */
  canEditChart?: boolean;
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
          <div data-testid="tile-empty-chart" className="tile-empty">
            {needsOf(chartType).map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
            {tile.chartId === undefined || !canEditChart ? null : (
              <p>Add its fields in the chart editor: its ✎, or E when the tile is selected.</p>
            )}
          </div>
        );
      }
      if (hidden !== undefined) return <TileUnavailable member={hidden} />;
      if (error !== undefined) return <TileError error={error} />;
      /**
       * Loading, absent and broken are three states, not two. Collapsing the
       * first into the second made "this chart is no longer available" the
       * normal appearance of a healthy dashboard for as long as its queries
       * took — the missing-chart state showing on charts that were perfectly
       * fine (AC-042, AC-010).
       */
      if (loading) return <TileSkeleton chartType="bar" />;
      return spec === undefined ? (
        // A state, with its icon (T183, AC-177).
        <StateLine kind="warn" role="status" testId="tile-missing-chart">
          This chart is no longer available.
        </StateLine>
      ) : (
        <ChartTile
          spec={spec}
          busy={busy}
          inEffect={inEffect}
          title={title}
          asOf={answered?.lastRefreshTime}
          served={answered}
          {...(tile.h === undefined ? {} : { height: tile.h * ROW_UNIT_PX })}
          {...(onItemClick === undefined ? {} : { onItemClick })}
        />
      );
    case 'markdown':
      return <p>{tile.text}</p>;
    case 'header':
      return <h3>{tile.text}</h3>;
    case 'divider':
      return <hr />;
    case 'image':
      return <ImageTile tile={tile} editing={editing} />;
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
  /** A chart's own type, from its document (T132). */
  readonly typeOf?: ((chartId: string) => ChartType | undefined) | undefined;
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
}

interface Affordances {
  readonly editing: boolean;
  readonly charts: TileCharts;
  readonly onResize?: ((id: string, size: { w: number; h: number }) => void) | undefined;
  readonly drag?: CanvasProps['drag'];
  /** What a key does to the focused tile (AC-057). */
  readonly onTileKeyDown?: CanvasProps['onTileKeyDown'];
  readonly describeItem?: CanvasProps['describeItem'];
  readonly selection?: CanvasProps['selection'];
  readonly addHere?: CanvasProps['addHere'];
  /** Deleting an element from its ⋯ menu, with an undo (AC-060). */
  readonly onDelete?: ((id: string) => void) | undefined;
  /** Duplicating a chart tile from its ⋯ menu, the copy with a chart of its own (AC-062). */
  readonly onDuplicate?: ((id: string) => void) | undefined;
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
      describeItem={affordances.describeItem}
      selection={affordances.selection}
      addHere={affordances.addHere}
    >
      {(item) => {
        const element = items.find((candidate) => candidate.id === item.id);
        if (element === undefined) return null;

        if (isSection(element)) {
          return (
            <section className="dashboard-section" data-section={element.id}>
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
              <h2>{element.title}</h2>
              <Elements
                items={element.items}
                containerKey={sectionKey(element.id)}
                affordances={affordances}
              />
            </section>
          );
        }
        if (isTabGroup(element)) {
          return <TabGroupView group={element} affordances={affordances} />;
        }

        const chartId = element.chartId ?? '';
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
                 * Labelled as the tile's ⋯ menu is ("Actions for …"), from the
                 * same source. That makes two chart tiles' pencils read alike,
                 * as their menus already do: a chart's title lives on the chart
                 * document, not the tile, and giving tiles distinct accessible
                 * names is a fix for every tile control at once, not this one.
                 */
                aria-label={`Edit ${element.text ?? element.kind}`}
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
                "Download CSV", for a chart with something drawn. */}
            {affordances.editing ||
            element.kind !== 'chart' ||
            element.chartId === undefined ||
            charts.specs[chartId] === undefined ? null : (
              <TileViewMenu
                tileId={element.id}
                title={charts.titleOf?.(chartId) ?? element.text ?? 'chart'}
                spec={charts.specs[chartId]}
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
              />
            )}
            {affordances.moveTo === undefined ? null : (
              <MoveToMenu
                tileId={element.id}
                tileLabel={element.text ?? element.kind}
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
                element.kind !== 'chart' ||
                element.chartId === undefined ||
                // Only where there is a chart to copy: not while it loads,
                // nor for one that is gone (T068's review).
                charts.titleOf?.(element.chartId) === undefined
                  ? {}
                  : {
                      onDuplicate: () => {
                        affordances.onDuplicate?.(element.id);
                      },
                    })}
              />
            )}
            {charts.notCovered?.[chartId] === undefined ? null : (
              <NotCovered
                members={charts.notCovered[chartId].map((each) => each.filter.member ?? '')}
              />
            )}
            {/* After a refresh, if a pre-aggregation answered it (T154, AC-148):
                in view mode, as Refresh is — its Jobs link would leave an edit. */}
            {affordances.editing ||
            charts.refreshedFromRollup?.has(chartId) !== true ||
            !accelerationOf(charts.answered?.[chartId]).accelerated ? null : (
              <RollupRefreshNote
                preAggregation={accelerationOf(charts.answered?.[chartId]).preAggregation ?? ''}
                builtAt={accelerationOf(charts.answered?.[chartId]).lastUpdatedAt}
                onDismiss={() => charts.onDismissRollupNote?.(chartId)}
              />
            )}
            <TileBody
              tile={element}
              spec={charts.specs[chartId]}
              error={charts.errors[chartId]}
              loading={charts.loading}
              // Asked again by a filter, or refreshed: either way, said (T183's review).
              busy={
                charts.pending?.has(chartId) === true || charts.refreshing?.has(chartId) === true
              }
              inEffect={charts.inEffect?.[chartId]}
              editing={editing}
              carried={charts.carried}
              title={charts.titleOf?.(chartId)}
              answered={charts.answered?.[chartId]}
              // The chart's own type, where it has one (T132's review): the
              // editor changes the document's, not the tile's.
              chartType={charts.typeOf?.(chartId) ?? element.chartType}
              // Named as the way in only where the pencil is offered.
              canEditChart={affordances.onEditChart !== undefined}
              {...(charts.onItemClick === undefined
                ? {}
                : {
                    onItemClick: (item: ClickedItem) => {
                      charts.onItemClick?.(element.id, chartId, item);
                    },
                  })}
            />
          </>
        );
      }}
    </Canvas>
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
  const showing = group.tabs.find((tab) => tab.id === open) ?? group.tabs[0];

  return (
    <div className="tab-group" data-tab-group={group.id}>
      <div role="tablist" aria-label={`Tabs in ${group.id}`}>
        {group.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === showing?.id}
            /**
             * A tile dropped here goes into this tab, whether or not it is the
             * one on screen — the case AC-056 singles out.
             */
            data-droptab={tabKey(group.id, tab.id)}
            onClick={() => setOpen(tab.id)}
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
}: {
  session: EditSession<DashboardDocument>;
  /** Whose local charts a new chart tile's are (T132). */
  dashboardId: string;
  where: {
    pageId: string;
    selected: string | null;
    addTarget: string | null;
    onAdded: (id: string) => void;
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
          : `${container}, after ${nameOfTile(document, where.selected ?? '')}`
      }
      message={said}
      // A filter goes on the filter bar, not the grid (F9, AC-076): one
      // change, which Undo and Discard reach like any other.
      onAddFilter={(widget) => {
        session.change({
          ...document,
          filters: [
            ...(document.filters ?? []),
            newFilter(widget, `filter-${String(Date.now())}-${String(counter++)}`),
          ],
        });
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
        const element = local.elements[0] ?? placed.element;

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

/** The session's chart drafts with new ones added: a new tile's local chart (T132). */
function withDrafts(
  document: DashboardDocument,
  drafts: Readonly<Record<string, ChartDraft>>,
): DashboardDocument {
  return Object.keys(drafts).length === 0
    ? document
    : { ...document, chartDrafts: { ...document.chartDrafts, ...drafts } };
}

export function DashboardView({
  dashboardId,
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
  documents,
  reach,
  memberTitle,
  formats,
  onEditStart,
  editTile,
  onEditTile,
  urlFilterValues,
  onFilterValues,
  onSave,
}: DashboardViewProps) {
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
  const drawn = useMemo(
    () =>
      drawnWithDrafts(
        { specs, errors: errors ?? {}, documents, answered },
        { ...document, ...(drafts === undefined ? {} : { chartDrafts: drafts }) },
      ),
    [specs, errors, documents, answered, document, drafts],
  );
  const chartTitleOf = (chartId: string) => drawn.documents?.[chartId]?.title;

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
   * Whether the dashboard is being edited, mirrored up with it: clicking a
   * mark selects the tile while editing, so cross-filtering is off there —
   * the prototype says so on its filter bar in as many words.
   */
  const [sessionEditing, setSessionEditing] = useState(false);
  /**
   * The cross-filter selections in effect (AC-117): what was clicked, and on
   * which tile. Held here rather than in the document, because clicking a
   * mark is reading the dashboard, not changing it — Looker drops them when
   * the dashboard is left, and so does the prototype
   * (`docs/research/cross-highlight.md` §7).
   */
  const [crossSelections, setCrossSelections] = useState<readonly CrossSelection[]>([]);
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
  const crossFiltering =
    interactions.mode === 'crossFilter' && !sessionEditing && preview === undefined;
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

  const { reached, notCovered } = useMemo(
    () =>
      coverageOf(
        live,
        [...activeFilters(live.filters ?? [], filterValues), ...crossFilters],
        reachOf,
      ),
    [live, filterValues, crossFilters, reachOf],
  );
  const [filtered, setFiltered] = useState<FilteredResults>({});
  // A chart being asked again keeps its last answer, busy, meanwhile.
  const onFiltered = useCallback((results: FilteredResults) => {
    setFiltered((before) => keepLastAnswers(before, results));
  }, []);
  const withFiltered = useMemo(() => {
    const ids = Object.keys(reached).filter((id) => drawn.documents?.[id] !== undefined);
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
        shown[id] = answer.spec;
        delete failed[id];
      } else {
        failed[id] = answer.error;
        delete shown[id];
      }
      if (result?.answered === undefined) delete said[id];
      else said[id] = result.answered;
    }
    return { specs: shown, errors: failed, answered: said, pending };
  }, [drawn, reached, filtered]);

  /**
   * "Refresh now" on a tile (T154, AC-148) asks again what the tile draws: a
   * tile a filter reaches draws its filtered answer, which `FilteredCharts`
   * asks again; any other tile, its chart as loaded, which the page does.
   */
  const filteredCharts = useRef<FilteredChartsHandle>(null);
  const [refreshingFiltered, setRefreshingFiltered] = useState<ReadonlySet<string>>(new Set());
  /** The chart whose SQL as the previewed context is open (T174). */
  const [sqlFor, setSqlFor] = useState<{ chartId: string; tileId: string } | undefined>(undefined);
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

  // Formatted after the drafts and filters are in, so those tiles are too.
  const formatted = useMemo(
    () => (formats === undefined ? withFiltered.specs : withFormats(withFiltered.specs, formats)),
    [withFiltered.specs, formats],
  );

  /**
   * A click on a mark (AC-117): the selection from that tile, replacing
   * whatever it had selected before — one selection per tile, as Superset and
   * the prototype both have it. Clicking the same value again clears it, the
   * way clicking a selected point does in Power BI and Superset.
   */
  const onItemClick = useCallback(
    (tileId: string, chartId: string, item: ClickedItem) => {
      const spec = drawn.specs[chartId];
      const value = spec === undefined ? undefined : clickedValue(spec, item);
      setCrossSelections((before) => {
        const others = before.filter((each) => each.from !== tileId);
        if (value === undefined) return others;
        const had = before.find((each) => each.from === tileId);
        const same = had?.member === value.member && had?.value === value.value;
        return same ? others : [...others, { from: tileId, ...value }];
      });
    },
    [drawn.specs],
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

  // The assignment is held across renders, so a filter that hides a member
  // does not hand its colour to whoever is now first (AC-039).
  // The dashboard as the session has it: a tile added in it — a duplicate's
  // copy (T068) — is drawn, and coloured, before the dashboard is saved.
  const coloured = useDashboardColours(live, withHighlights);
  /**
   * Each filtered chart's filters in words, for the empty state (AC-043):
   * named by the field each was set on — the filter bar's field, not the name
   * a view takes it by.
   */
  const inEffect = useMemo(() => {
    const setOn = new Map((live.filters ?? []).map((filter) => [filter.id, filter.member ?? '']));
    return Object.fromEntries(
      Object.entries(reached).map(([chartId, applied]) => {
        const refused = filtered[chartId]?.uncovered ?? [];
        return [
          chartId,
          applied
            .filter(({ filter }) => !refused.includes(filter.id))
            .map(({ filter, value }) => {
              const field = setOn.get(filter.id) ?? filter.member ?? '';
              return describeFilter(memberTitle?.(field) ?? field, value);
            }),
        ];
      }),
    );
  }, [reached, filtered, live.filters, memberTitle]);

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

  const charts: TileCharts = {
    specs: coloured,
    errors: withFiltered.errors,
    loading,
    // Clicking a mark cross-filters only where the dashboard says so, and not
    // while editing, where a click selects the tile (AC-117, AC-120).
    ...(crossFiltering ? { onItemClick } : {}),
    pending: withFiltered.pending,
    notCovered: marked,
    inEffect,
    carried,
    titleOf: chartTitleOf,
    typeOf: (chartId: string) => drawn.documents?.[chartId]?.chart.chartType,
    answered: withFiltered.answered,
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
  const queryOf = (chartId: string): Record<string, unknown> | undefined => {
    const chart = drawn.documents?.[chartId];
    if (chart === undefined) return undefined;
    const refused = filtered[chartId]?.uncovered ?? [];
    const applied = (reached[chartId] ?? []).filter(({ filter }) => !refused.includes(filter.id));
    try {
      return withFilters(toCubeQuery(toChartSpec(chart)), applied);
    } catch {
      return undefined;
    }
  };
  const sqlQuery = sqlFor === undefined ? undefined : queryOf(sqlFor.chartId);
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
    const target = globalThis.document.querySelector<HTMLElement>(returnFocus.current);
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

  const [addTarget, setAddTarget] = useState<string | null>(null);

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

  const [openPage, setOpenPage] = useState<string | null>(null);
  const pageId = openPage ?? document.pages[0]?.id ?? '';
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
  };

  return (
    <SecurityPreview.Provider value={preview}>
      {preview === undefined ? null : <PreviewBanner context={preview} onExit={onExitPreview} />}
      {preview === undefined || sqlFor === undefined || sqlQuery === undefined ? null : (
        <GeneratedSql
          title={chartTitleOf(sqlFor.chartId) ?? 'this chart'}
          query={sqlQuery}
          context={preview}
          onClose={closeSql}
        />
      )}
      {Object.keys(reached).length === 0 ? null : (
        <FilteredCharts
          ref={filteredCharts}
          reached={reached}
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
      <EditChrome
        document={document}
        title={(shown) => shown.title}
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
        saveBlocked={(shown) => whyUnsaveable(shown, dashboardId)}
        readOnly={preview !== undefined}
        onStart={onEditStart}
        headerActions={(session) => (
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
            disabled={session.saving}
            onClick={() => {
              // In view mode the settings page is an edit of its own, begun now
              // with the dashboard as it stands: its save is checked against
              // this moment's version (T198, AC-015). While editing, it is part
              // of the session, which began earlier.
              if (!session.editing) onEditStart?.();
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
                if (session.editing) session.change(next);
                else {
                  // A failed save is the page's to report, and it does; here it
                  // is only swallowed, or it would surface as an unhandled
                  // rejection (the save has returned its outcome since T197).
                  void Promise.resolve(onSave(withoutDrafts(next))).catch(() => undefined);
                }
                setSettingsOpen(false);
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
                setEditingChart(null);
                closeInUrl();
                session.save(
                  draft === undefined
                    ? session.document
                    : withDraft(session.document, editingChart.chartId, draft),
                );
              }}
              saveBlocked={(pending) =>
                whyUnsaveableWith(session.document, dashboardId, editingChart.chartId, pending)
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
          add: <AddSlot session={session} dashboardId={dashboardId} where={where} />,
          properties: (
            <>
              <TileProperties
                dashboardId={dashboardId}
                document={session.document}
                selected={selected}
                onChange={(apply) => {
                  session.update(apply);
                }}
                // Whose its chart is, and "Save to folders…" (T133, AC-127).
                chartProperties={(tile) =>
                  tile.chartId === undefined ? undefined : (
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
                    />
                  )
                }
              />
              {/**
               * The dashboard's page tabs, each deletable (AC-060), as the
               * prototype's Properties shows them rather than a row of ×
               * under the tabs (AC-187). Always here, below the tile's own
               * settings: a selection has no way back to none, and deleting a
               * page must not wait on one.
               */}
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
            </>
          ),
        })}
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
              /**
               * Under the page tabs, as the prototype has it (AC-187: its
               * `.dash-tabs`, then `.filterbar`), so an open filter's popover
               * lies over the tiles rather than over the tabs.
               */
              filterBar={
                <FilterBar
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
                  onFilters={(next) => {
                    session.change({ ...session.document, filters: next });
                  }}
                />
              }
              session={session}
              charts={charts}
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
              onEditChart={preview === undefined ? openEditor : undefined}
              editTile={editTile}
              editorOpenFor={editingChart?.tileId}
              where={where}
              onAim={(next) => {
                setSelected(next.selected);
                setAddTarget(next.addTarget);
              }}
              onOpenPage={setOpenPage}
              deleted={deleted}
              onDeleted={setDeleted}
            />
          </>
        )}
      </EditChrome>
    </SecurityPreview.Provider>
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

function DashboardPages({
  session,
  charts,
  onEditChart,
  editTile,
  editorOpenFor,
  where,
  onAim,
  onOpenPage,
  filterBar,
  deleted,
  onDeleted,
  duplicateFrom,
}: {
  session: EditSession<DashboardDocument>;
  charts: TileCharts;
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
  /** The filter bar, drawn under the page tabs. */
  filterBar?: ReactNode;
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
  /** The tile the URL names as open in the editor (T196). */
  editTile?: string | undefined;
  /** The tile the editor is open on now, if it is open. */
  editorOpenFor?: string | undefined;
  /** Where the next insert is aimed, owned above so the sidebar agrees. */
  where: { selected: string | null; addTarget: string | null; pageId: string };
  onAim: (next: { selected: string | null; addTarget: string | null }) => void;
  onOpenPage: (pageId: string) => void;
}) {
  const { document, editing } = session;
  // Which page is open is owned above, so the Add panel adds to the page the
  // user is actually looking at.
  const open = where.pageId;

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

  const drag = useTileDrag({
    onMove: (tileId, to) => {
      session.change(moveTile(document, tileId, to));
    },
    // Ids are a poor thing to read aloud, so a container is announced by the
    // name it shows in the Move-to menu and a tile by its kind.
    nameOf: (idOrKey) =>
      containers.find((container) => container.key === idOrKey)?.title ??
      nameOfTile(document, idOrKey),
  });

  const affordances: Affordances = {
    editing,
    charts,
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
          nameOf: (id) => nameOfTile(document, id),
        }
      : undefined,
    /**
     * The keyboard route to everything the pointer can do (AC-057), which is
     * what makes direction.md rule 39 true of this surface — moving and
     * resizing were pointer-only until now.
     */
    onTileKeyDown: editing
      ? (event, tile) => {
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
            const said = describeDeletion(document, deletion);
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
              ? `${nameOfTile(document, tile.id)}: ${readoutFor(action.size.w, action.size.h)}.`
              : sayPlace(next, tile.id),
          );
        }
      : undefined,
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
          const said = describeDeletion(document, deletion);
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
            const copied = duplicateChartTile(document, id, {
              ...duplicateFrom,
              mintTileId: () => `el-${String(Date.now())}-${String(counter++)}`,
              mintChartId,
            });
            if (copied === undefined) return;
            session.change(copied.document);
            // The copy selected, said, and focused, as an insert's tile is:
            // one insertion point, not two (T068's review).
            onAim({ selected: copied.tileId, addTarget: null });
            drag.say(`${nameOfTile(copied.document, copied.tileId)} duplicated.`);
            requestAnimationFrame(() => {
              window.document
                .querySelector<HTMLElement>(`[data-tile="${CSS.escape(copied.tileId)}"]`)
                ?.focus();
            });
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
          onSelect: (id) => {
            onAim({ selected: id, addTarget: null });
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
      : undefined,
    moveTo: editing
      ? {
          containers: containersOf(document),
          onMove: (tileId, to) => {
            // The same move the drag makes, reached without one.
            const elsewhere = focusAfterDeleting(tileId);
            session.change(moveTile(document, tileId, { key: to, index: null }));
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
      {document.pages.length > 1 ? (
        <div role="tablist" aria-label="Pages" className="page-tabs">
          {document.pages.map((page) => (
            <button
              key={page.id}
              type="button"
              role="tab"
              aria-selected={page.id === showing?.id}
              // A tile dropped on a page tab moves to that page (AC-056).
              data-droptab={pageKey(page.id)}
              onClick={() => {
                onOpenPage(page.id);
              }}
            >
              {page.title}
            </button>
          ))}
        </div>
      ) : null}

      {filterBar}

      <div
        data-testid="dashboard-page"
        className="dashboard-page"
        data-width={document.settings.width}
      >
        {showing ? (
          <Elements
            items={showing.items}
            containerKey={pageKey(showing.id)}
            affordances={affordances}
          />
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
            const said = describeDeletion(document, deletion);
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
