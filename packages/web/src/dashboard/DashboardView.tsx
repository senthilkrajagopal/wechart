import type { ChartDocument, RenderSpec } from '@wechart/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TileSize } from '../editor/PreviewFrame';
import { ChartTile } from '../tiles/ChartTile';
import { TileError } from '../tiles/TileError';
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
import { MoveToMenu } from './edit/MoveToMenu';
import { needsOf, templateElements } from './edit/templates';
import { SettingsPage } from './settings/SettingsPage';
import { placeInGrammar } from './model/grammar';
import { insertElement, insertionPoint, newElement } from './model/insert';
import { activeFilters, type ActiveFilter } from '../filters/apply';
import { coverageOf, type Reach } from '../filters/coverage';
import { describeFilter } from '../filters/describe';
import { NotCovered } from '../filters/NotCovered';
import { TileProperties } from './edit/TileProperties';
import { ImageTile } from './tiles/ImageTile';
import { FilterBar } from '../filters/FilterBar';
import { FilteredCharts, keepLastAnswers, type FilteredResults } from '../filters/FilteredCharts';
import { newFilter, type FilterValues } from '../filters/model';
import { sameValues } from '../filters/url';
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
  type DashboardDocument,
  type Element_,
  type Tile,
} from './model/document';

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
  readonly formats?: Readonly<Record<string, string>> | undefined;
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
}: {
  tile: Tile;
  spec: RenderSpec | undefined;
  error: unknown;
  loading: boolean;
  /** A filtered answer is on its way (AC-078): what is drawn stays, marked busy. */
  busy?: boolean;
  /** The filters in effect on it, in words (AC-043). */
  inEffect?: readonly string[] | undefined;
  /** In edit mode, an image tile flags missing alternative text (AC-063). */
  editing?: boolean;
}) {
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
      if (tile.chartId === undefined) {
        return (
          <div data-testid="tile-empty-chart" className="tile-empty">
            {needsOf(tile.chartType).map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
          </div>
        );
      }
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
        <p data-testid="tile-missing-chart">This chart is no longer available.</p>
      ) : (
        <ChartTile
          spec={spec}
          busy={busy}
          inEffect={inEffect}
          {...(tile.h === undefined ? {} : { height: tile.h * ROW_UNIT_PX })}
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
    default:
      // Link and filter tiles are AC-064 and F8. The tile is still rendered,
      // because AC-018 fails when a saved tile is missing — what it holds is
      // the later task's to fill in.
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
              />
            )}
            {charts.notCovered?.[chartId] === undefined ? null : (
              <NotCovered
                members={charts.notCovered[chartId].map((each) => each.filter.member ?? '')}
              />
            )}
            <TileBody
              tile={element}
              spec={charts.specs[chartId]}
              error={charts.errors[chartId]}
              loading={charts.loading}
              busy={charts.pending?.has(chartId) === true}
              inEffect={charts.inEffect?.[chartId]}
              editing={editing}
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
  where,
}: {
  session: EditSession<DashboardDocument>;
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

        session.change(insertElement(document, placed.element, placed.at));
        setSaid(placed.message ?? '');
        // Aim at what was just added, so a second insert follows the first
        // rather than stacking in front of it.
        where.onAdded(placed.element.id);
      }}
      onAddTemplate={(id) => {
        const mint = () => `el-${String(Date.now())}-${String(counter++)}`;
        const elements = templateElements(id, mint);

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

        session.change(next);
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

export function DashboardView({
  dashboardId,
  document,
  specs,
  errors,
  loading = false,
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
        { specs, errors: errors ?? {}, documents },
        { ...document, ...(drafts === undefined ? {} : { chartDrafts: drafts }) },
      ),
    [specs, errors, documents, document, drafts],
  );
  const chartTitleOf = (chartId: string) => drawn.documents?.[chartId]?.title;

  /**
   * What each filter holds now (F9). The reader's, not the dashboard's: not
   * in the saved document, and not in the edit history — setting a filter is
   * reading the dashboard, not changing it.
   */
  const [filterValues, setFilterValues] = useState<FilterValues>(() => urlFilterValues ?? {});
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
   * The charts a filter in effect reaches, each with the filters that reach it
   * (AC-078), and what each draws once filtered — asked by `FilteredCharts`.
   */
  /**
   * And the charts a filter's scope takes in but whose cube or view cannot
   * reach its field (AC-079): left unfiltered — never asked with a filter
   * Cube would refuse — and marked. A chart the model cannot yet say about is
   * neither filtered nor marked.
   */
  const { reached, notCovered } = useMemo(
    () =>
      coverageOf(live, activeFilters(live.filters ?? [], filterValues), (member, chartId) => {
        if (reach === undefined) return member;
        const source = drawn.documents?.[chartId]?.chart.source.cube;
        return source === undefined ? undefined : reach(member, source);
      }),
    [live, filterValues, reach, drawn.documents],
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
    }
    return { specs: shown, errors: failed, pending };
  }, [drawn, reached, filtered]);

  // Formatted after the drafts and filters are in, so those tiles are too.
  const formatted = useMemo(
    () => (formats === undefined ? withFiltered.specs : withFormats(withFiltered.specs, formats)),
    [withFiltered.specs, formats],
  );

  // The assignment is held across renders, so a filter that hides a member
  // does not hand its colour to whoever is now first (AC-039).
  const coloured = useDashboardColours(document, formatted);
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
    return all;
  }, [notCovered, reached, filtered]);

  const charts: TileCharts = {
    specs: coloured,
    errors: withFiltered.errors,
    loading,
    pending: withFiltered.pending,
    notCovered: marked,
    inEffect,
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

  const [openPage, setOpenPage] = useState<string | null>(null);
  const pageId = openPage ?? document.pages[0]?.id ?? '';
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
    <>
      {Object.keys(reached).length === 0 ? null : (
        <FilteredCharts reached={reached} documents={drawn.documents} onResults={onFiltered} />
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
         * library chart (AC-128's warning comes first, T134), a chart local to
         * another dashboard, or a draft with no version to check. Charts local
         * to this dashboard are written with it (T192). Saving a draft that
         * cannot be written would drop it in silence and put the old chart back
         * on the tile — AC-034's failing state, reached through Save. See
         * `whyUnsaveable` for the wording and why it names Undo, not Discard.
         */
        saveBlocked={(shown) => whyUnsaveable(shown, dashboardId)}
        onStart={onEditStart}
        headerActions={(session) => (
          <button
            type="button"
            className="dashboard__gear"
            aria-label="Dashboard settings"
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
            ⚙
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
            />
          )
        }
        panels={(session) => ({
          add: <AddSlot session={session} where={where} />,
          properties: (
            <TileProperties
              dashboardId={dashboardId}
              document={session.document}
              selected={selected}
              onChange={(next) => {
                session.change(next);
              }}
            />
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
            />
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
            <DashboardPages
              session={session}
              charts={charts}
              onEditChart={openEditor}
              editTile={editTile}
              editorOpenFor={editingChart?.tileId}
              where={where}
              onAim={(next) => {
                setSelected(next.selected);
                setAddTarget(next.addTarget);
              }}
              onOpenPage={setOpenPage}
            />
          </>
        )}
      </EditChrome>
    </>
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
}: {
  readonly document: DashboardDocument;
  readonly onDocument: (document: DashboardDocument) => void;
  readonly drafts: DashboardDocument['chartDrafts'];
  readonly onDrafts: (drafts: DashboardDocument['chartDrafts']) => void;
  readonly saving: boolean;
  readonly onSaving: (saving: boolean) => void;
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
}: {
  session: EditSession<DashboardDocument>;
  charts: TileCharts;
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

  /** What the last delete took, for the toast (AC-060). */
  const [deleted, setDeleted] = useState('');
  const onDeleted = setDeleted;

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

            session.change(next);
            onDeleted(said);
            drag.say(said);
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

          session.change(next);
          onDeleted(said);
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
            keys: `Arrow keys move. Shift and arrow keys resize.${editable} Delete removes.`,
          };
        }
      : undefined,
    moveTo: editing
      ? {
          containers: containersOf(document),
          onMove: (tileId, to) => {
            // The same move the drag makes, reached without one.
            session.change(moveTile(document, tileId, { key: to, index: null }));
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

      {/**
       * Deleting a page tab, which AC-060 names among the four. It is not an
       * element on the grid, so neither the Delete key nor a tile's ⋯ menu
       * reaches it.
       */}
      {editing && document.pages.length > 1 ? (
        <div className="page-tabs__actions">
          {document.pages.map((page) => (
            <button
              key={page.id}
              type="button"
              data-testid={`delete-page-${page.id}`}
              aria-label={`Delete page ${page.title}`}
              onClick={() => {
                const deletion = { kind: 'page', id: page.id } as const;
                const said = describeDeletion(document, deletion);
                const next = deleteFromDashboard(document, deletion);
                if (next === document) return;

                session.change(next);
                setDeleted(said);
                if (page.id === open) onOpenPage(next.pages[0]?.id ?? '');
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

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
            session.change(deleteFromDashboard(document, deletion));
            setAsking(null);
            setDeleted(said);
          }}
          onKeepContents={() => {
            // Ungrouping: the section goes, its items stay where they were.
            // "Keep" losing a tile is this criterion's own failing state.
            session.change(ungroupSection(document, asking));
            setAsking(null);
            setDeleted(`Deleted section “${askedAbout.title}” and kept what was in it.`);
          }}
          onCancel={() => {
            setAsking(null);
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
