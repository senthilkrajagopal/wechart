import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { readChartDocument, type ChartDocument, type RenderSpec } from '@wechart/core';

import { answerMetaOf, type AnswerMeta } from '../query/answerMeta';
import { loadTile } from '../query/loadTile';
import { META_QUERY } from '../query/meta';
import { reachFrom } from '../filters/coverage';
import { primaryKeyOf } from './markings/primaryKey';
import { allMembers } from '../filters/FilterBar';
import type { FilterValues } from '../filters/model';
import { CHART_MISSING, formatsFrom, tileChartOf, type TileChart } from './chartSpec';
import { StateLine } from '../shell/StatusIcon';
import { ROOT_FOLDERS } from '../workspaces/explore/roots';
import { DashboardView } from './DashboardView';
import { chartWritesOf, drawnWithDrafts, withoutDrafts } from './edit/chartDrafts';
import { saveDashboard } from './edit/save';
import { chartIdsOf, DEFAULT_SETTINGS, type DashboardDocument } from './model/document';

/**
 * The dashboard route (AC-018): load the saved document, load each of its
 * charts, and hand both to the view.
 *
 * Fetching lives here rather than in `DashboardView` for the reason the rest
 * of the app already follows — `FolderContents` takes its rows, `ChartTile`
 * takes its spec. A view that fetches cannot be rendered in a test without a
 * server, and cannot be reused inside the editor's preview.
 */
/** A request the server answered with an error status, which it carries. */
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`Request failed: ${String(status)}`);
    this.name = 'HttpError';
  }
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new HttpError(response.status);
  return (await response.json()) as T;
}

interface StoredDocument {
  readonly id: string;
  readonly body: Record<string, unknown>;
  readonly version?: number;
}

/**
 * A stored body is *checked*, not cast.
 *
 * A chart body has gone through strict `readChartDocument` since T023 while a
 * dashboard body was taken on trust — so a `pages` that was an object rather
 * than an array threw inside render, with no error boundary, and the whole
 * app went blank. A dashboard that cannot be read should fail like a chart
 * that cannot: as one surface reporting a problem.
 */
export class DashboardDocumentError extends Error {
  constructor(what: string) {
    super(`This dashboard cannot be opened: ${what}.`);
    this.name = 'DashboardDocumentError';
  }
}

/**
 * A stored body becomes a dashboard document. A dashboard saved before there
 * were pages — every seeded one but the first — opens as an empty dashboard
 * rather than as an error, because "no tiles yet" is what it is.
 */
export function dashboardOf(stored: StoredDocument): DashboardDocument {
  const body = stored.body as Partial<DashboardDocument>;

  // A dashboard saved before there were pages — every seeded one but the
  // first — opens as an empty dashboard rather than an error, because "no
  // tiles yet" is what it is. A `pages` that is present and *wrong* is not.
  if (body.pages !== undefined && !Array.isArray(body.pages)) {
    throw new DashboardDocumentError('its pages are not a list');
  }
  for (const page of body.pages ?? []) {
    if (!Array.isArray(page.items)) {
      throw new DashboardDocumentError(`page “${page.title ?? page.id}” has no list of items`);
    }
  }

  /**
   * Spread first, defaults over the top. The four named fields are the ones
   * this build reads; everything else a stored dashboard carries has to come
   * through untouched, because a save sends back the document it was given
   * (AC-065) and the server replaces the body wholesale.
   *
   * Rebuilt as four fields, this dropped `folderId` on every save — and
   * `folder_id` is a column derived from it, so the dashboard left its folder
   * without anyone moving it (AC-017, AC-020). `owner` went the same way, and
   * markings would have at F10. `save.test.ts` could not see it: it builds the
   * document it sends, so the loss happened one step upstream of it.
   */
  /**
   * Never with chart drafts. They belong to one edit session and are never
   * saved (T032), so a stored body carrying them was written by something
   * else — and read as they are, they would draw tiles from specs no query
   * produced, and survive a Discard as part of the state the session opens
   * with.
   */
  return withoutDrafts({
    ...body,
    schemaVersion: body.schemaVersion ?? 1,
    title: typeof body.title === 'string' ? body.title : 'Dashboard',
    // At least one page: with none, there is nowhere for anything added to
    // go — a new dashboard (created with `pages: []`) took no tile at all.
    pages: body.pages !== undefined && body.pages.length > 0 ? body.pages : [FIRST_PAGE],
    settings: body.settings ?? DEFAULT_SETTINGS,
  });
}

/** The page a dashboard with none opens with, empty; saved with it once anything is added. */
const FIRST_PAGE = { id: 'page-1', title: 'Page 1', items: [] } as const;

/** Each chart's drawn spec, or why it could not be drawn — the charts query's data. */
interface DrawnCharts {
  specs: Record<string, RenderSpec>;
  errors: Record<string, unknown>;
  /** Each chart's document as read, which filters re-query and tiles are named by (F9). */
  documents: Record<string, ChartDocument>;
  /** What Cube said of each chart's answer: when from, and from what (T154, T014). */
  answered: Record<string, AnswerMeta>;
}

/** A save, whole: nothing it needs is read from the render it started in. */
interface SaveVariables {
  readonly id: string;
  readonly next: DashboardDocument;
  readonly drafts: DashboardDocument['chartDrafts'];
  /** The dashboard's version, which the server checks the save against. */
  readonly version: number;
}

export interface DashboardPageProps {
  readonly dashboardId: string;
  /** The tile whose chart the URL has open in the editor (T196, AC-002). */
  readonly editTile?: string | undefined;
  /** Put a tile in the URL as the one open in the editor, or none (T196). */
  readonly onEditTile?: ((tileId: string | undefined) => void) | undefined;
  /** The filter values the URL holds now (AC-081). */
  readonly urlFilterValues?: FilterValues | undefined;
  /** Put these filter values in the URL (AC-081). */
  readonly onFilterValues?: ((values: FilterValues) => void) | undefined;
  /**
   * A security context previewed from the Security workspace (T172, AC-166):
   * every query this dashboard asks is signed with its claims.
   */
  readonly preview?: Readonly<Record<string, unknown>> | undefined;
  /** Leave the preview: the dashboard as wechart itself asks. */
  readonly onExitPreview?: (() => void) | undefined;
}

export function DashboardPage({
  dashboardId,
  editTile,
  onEditTile,
  urlFilterValues,
  onFilterValues,
  preview,
  onExitPreview,
}: DashboardPageProps) {
  const saved = useQuery({
    queryKey: ['dashboard', dashboardId],
    // Parsed here rather than during render: a body that cannot be read
    // becomes a query error this page already knows how to show, instead of
    // an exception thrown inside render with no boundary above it.
    queryFn: async () => {
      const stored = await getJson<StoredDocument>(
        `/api/documents/dashboard/${encodeURIComponent(dashboardId)}`,
      );
      return { document: dashboardOf(stored), version: stored.version ?? 1 };
    },
  });

  const document = saved.data?.document;

  if (saved.isPending)
    return (
      <StateLine kind="run" testId="dashboard-loading">
        Loading…
      </StateLine>
    );
  /**
   * The error only when there is no dashboard to show. A fetch that fails
   * after one has loaded — the library fetches again on its own, on
   * reconnecting once the data is stale — keeps what it had (research,
   * Answer 4); putting an error in its place took any edit session on it
   * down with it, AC-184's failing state reached without a save (T197).
   */
  if (document === undefined)
    return (
      <StateLine kind="err" testId="dashboard-error">
        {(saved.error as Error | null)?.message ?? 'This dashboard could not be opened.'}
      </StateLine>
    );

  return (
    <LoadedDashboard
      /**
       * Keyed by the dashboard, as the view below is: what the page holds
       * for one dashboard — why its save failed, the save itself — must not
       * be shown over the next one opened (T197). And by the security
       * context previewed (T172's review): the answers it keeps drawing while
       * newer ones are asked — a filtered tile's, a filter's values — must
       * not be one context's under another's banner, or under none.
       */
      key={`${dashboardId}:${JSON.stringify(preview ?? null)}`}
      document={document}
      dashboardId={dashboardId}
      version={saved.data?.version ?? 1}
      editTile={editTile}
      onEditTile={onEditTile}
      urlFilterValues={urlFilterValues}
      onFilterValues={onFilterValues}
      preview={preview}
      onExitPreview={onExitPreview}
    />
  );
}

/**
 * Separate so the document is in hand before any chart query is keyed on it.
 * `EditChrome` seeds its session when Edit is pressed, and a dashboard that
 * arrived after that would be a session editing nothing.
 */
function LoadedDashboard({
  document,
  dashboardId,
  version,
  editTile,
  onEditTile,
  urlFilterValues,
  onFilterValues,
  preview,
  onExitPreview,
}: {
  document: DashboardDocument;
  dashboardId: string;
  version: number;
  editTile: string | undefined;
  onEditTile: ((tileId: string | undefined) => void) | undefined;
  urlFilterValues: FilterValues | undefined;
  onFilterValues: ((values: FilterValues) => void) | undefined;
  preview: Readonly<Record<string, unknown>> | undefined;
  onExitPreview: (() => void) | undefined;
}) {
  const queryClient = useQueryClient();
  /**
   * The charts' place in the query cache: keyed by the context they were
   * asked as too, so a preview (T172) never draws answers Cube gave wechart's
   * own context, nor the reverse.
   */
  /**
   * And by the charts the saved dashboard shows (T068's review): a save that
   * adds one — a duplicate's copy, a new local chart — moves the key, so the
   * charts are loaded for the dashboard as saved. Keyed only by the dashboard,
   * the load after a save ran with the chart ids from before it, and the new
   * chart's tile read "no longer available". The previous answer stays on the
   * tiles meanwhile (`placeholderData`), so they do not flash.
   */
  const chartsKeyOf = (id: string) =>
    ['dashboard-charts', id, preview ?? null, chartIdsOf(document)] as const;
  const [saveFailed, setSaveFailed] = useState('');
  /**
   * Where the charts this save put in folders went (T133, AC-127): each by
   * its title and its folder's, said once the save has gone through — the
   * Properties that said it would are gone with the edit session. Cleared by
   * the next edit.
   */
  const [savedToFolders, setSavedToFolders] = useState('');
  const sayWhereSaved = async (
    id: string,
    next: DashboardDocument,
    drafts: DashboardDocument['chartDrafts'],
  ) => {
    const shown = new Set(chartIdsOf(next));
    const moved = Object.entries(drafts ?? {}).flatMap(([chartId, draft]) =>
      shown.has(chartId) &&
      draft.wasLocalTo === id &&
      draft.document.localToDashboardId === undefined &&
      draft.document.folderId !== undefined
        ? [{ title: draft.document.title, folderId: draft.document.folderId }]
        : [],
    );
    if (moved.length === 0) {
      setSavedToFolders('');
      return;
    }
    // By name where the folders can be read; by id, never not at all. The
    // roots are no folders of their own, so they are named from the one list.
    const names = new Map<string, string>(ROOT_FOLDERS.map((root) => [root.id, root.title]));
    try {
      const response = await fetch('/api/folders');
      if (response.ok)
        for (const folder of (await response.json()) as { id: string; title: string }[])
          names.set(folder.id, folder.title);
    } catch {
      // Said by id.
    }
    setSavedToFolders(
      moved
        .map(
          ({ title, folderId }) =>
            `Saved “${title}” to ${names.get(folderId) ?? folderId}. It is now a shared chart.`,
        )
        .join(' '),
    );
  };
  /**
   * Moved on each time the charts are loaded afresh or a save writes them. A
   * tile's refresh (T154) answers for the charts as they were when it was
   * asked, so one overtaken by either drops its answer rather than put older
   * charts back over newer ones (T154's review).
   */
  const chartsGeneration = useRef(0);

  /**
   * The version the dashboard had when the edit being saved began (T198,
   * AC-015): an edit session when it starts, or the settings page when it
   * opens in view mode — each works on the dashboard as it stood then, and
   * each save is checked against that. Not the version when Save is pressed:
   * the dashboard can be fetched again while an edit is open — the library
   * does so on reconnecting once the data is stale (research, "Resolved
   * since") — bringing in someone else's save, and checked against their
   * version, the edit went through over their change without a word.
   *
   * Set afresh whenever an edit begins, and never cleared: clearing it when a
   * save succeeded wiped an edit session begun while a view-mode save was
   * still out, and the session's save then went through over that save.
   */
  const [editBase, setEditBase] = useState<number | undefined>(undefined);

  /**
   * Saving (AC-065). The version the session started from travels with it, so
   * a dashboard changed somewhere else is refused rather than overwritten —
   * and on success the cached copy is refreshed, or the next Edit would begin
   * from the document as it was before this save.
   *
   * **Everything the save needs rides in its own variables** — the dashboard,
   * the document, its drafts, the version — and no callback reads them from
   * this render. A pending save picks up newer renders' options
   * (docs/research/tanstack-query-mutations.md, gotcha 7), so a save still
   * starting when the user moved to another dashboard could otherwise write
   * this dashboard's document under that one's id.
   *
   * `networkMode: 'always'`: with the default, a save made while the browser
   * reports itself offline waits for the connection, neither resolving nor
   * failing — the session would sit "Saving…", untouchable, with nothing
   * said (gotcha 4). Sent regardless, it fails, and AC-184 keeps the work and
   * says why.
   */
  const save = useMutation({
    networkMode: 'always',
    mutationFn: ({ id, next, drafts, version: from }: SaveVariables) =>
      saveDashboard({
        dashboardId: id,
        document: next,
        version: from,
        charts: drafts === undefined ? [] : chartWritesOf({ ...next, chartDrafts: drafts }, id),
      }),
    /**
     * The tiles keep showing the edited charts once the save has gone
     * through. The session leaves edit mode then, and the drafts go with it —
     * so without this the tiles fell back to the charts as they were loaded,
     * and the old chart flashed up until the charts were fetched again.
     */
    onMutate: async ({ id, next, drafts }) => {
      if (drafts === undefined) return undefined;
      /**
       * A load of the charts still running — the last save's re-fetch, with
       * Cube slow — would otherwise land after this and put that save's
       * charts back over this one's edits. Cancelled, its result is dropped
       * and the query reverts (`cancelQueries`, docs/research/data-layer.md).
       */
      await queryClient.cancelQueries({ queryKey: ['dashboard-charts', id] });
      /**
       * Only over charts already drawn: with none yet there is nothing to
       * keep showing, and nothing for a failure to put back. What was there
       * is kept, so a save that fails can put the cache back as it was
       * (`onError`).
       */
      const before = queryClient.getQueryData<DrawnCharts>(chartsKeyOf(id));
      if (before === undefined) return undefined;
      // A refresh still out answers for the charts as they were: overtaken.
      chartsGeneration.current += 1;
      queryClient.setQueryData<DrawnCharts>(
        chartsKeyOf(id),
        drawnWithDrafts(before, { ...next, chartDrafts: drafts }) as DrawnCharts,
      );
      return { before };
    },
    /**
     * Awaited before the save's promise resolves, and so before the session
     * leaves edit mode (AC-184) — the dashboard's re-fetch, that is: the saved
     * dashboard is in the cache by the time the session leaves. The page
     * itself picks it up a moment later — the library tells a query's users
     * on a timeout, after the save's promise has settled (research, Answer 7)
     * — so for that moment the dashboard may show as it was opened; before
     * T197 it did so for the whole re-fetch. The charts are fetched again
     * without waiting: that re-runs every tile's query, which with Cube slow
     * would hold the user at "Saving…" long after the save is stored, and the
     * tiles already show the saved charts (`onMutate`). Must not throw — a
     * throw here would turn a stored save into a failure (gotcha 1) — and
     * `invalidateQueries` neither throws nor rejects unless asked to.
     */
    onSuccess: async (_saved, { id, next, drafts }) => {
      setSaveFailed('');
      void sayWhereSaved(id, next, drafts);
      void queryClient.invalidateQueries({ queryKey: ['dashboard-charts', id] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard', id] });
    },
    onError: (failure: Error, { id }, written) => {
      setSaveFailed(failure.message);
      if (written === undefined) return;
      /**
       * The drafts `onMutate` wrote into the cache were not saved, so they
       * come out of it: put back as it was, at once, then fetched again for
       * anything changed meanwhile. The tiles still show the drafts — the
       * session is kept (AC-184) and draws them over the saved charts — but
       * undone, a tile must show the chart as stored, not the unsaved edit.
       *
       * Put back, not only fetched again: offline, or with the server down,
       * the fetch cannot run, and the unsaved edit stayed in the cache as if
       * saved — found by the offline test (the research's documented pattern,
       * gotcha 9). And not waited for: the save's promise rejects only once
       * this returns (Answer 2), and the fetch re-runs every tile's query —
       * waited for, it kept the session locked at "Saving…" beside a message
       * saying the save had failed.
       */
      queryClient.setQueryData(chartsKeyOf(id), written.before);
      void queryClient.invalidateQueries({ queryKey: ['dashboard-charts', id] });
    },
  });
  const charts = useQuery({
    queryKey: chartsKeyOf(dashboardId),
    // The charts the key names, not the page's at the time: a load asked for
    // just after a save still has the key it was asked under.
    queryFn: async ({ queryKey }): Promise<DrawnCharts> => {
      // A refresh still out was asked before this load: overtaken by it.
      chartsGeneration.current += 1;
      const entries = await Promise.all(
        queryKey[3].map(async (id) => [id, await specFor(id, undefined, preview)] as const),
      );

      // Split rather than collapsed: a chart that drew and a chart that failed
      // are different things to put on a tile, and a failure that arrives as
      // "no spec" would be drawn as an empty chart, which reads as "no data".
      const specs: Record<string, RenderSpec> = {};
      const errors: Record<string, unknown> = {};
      const documents: Record<string, ChartDocument> = {};
      const answered: Record<string, AnswerMeta> = {};
      for (const [id, { chart, document: read, answered: meta }] of entries) {
        if ('spec' in chart) specs[id] = chart.spec;
        else errors[id] = chart.error;
        if (read !== undefined) documents[id] = read;
        if (meta !== undefined) answered[id] = meta;
      }
      return { specs, errors, documents, answered };
    },
    placeholderData: keepPreviousData,
  });

  /**
   * "Refresh now" on one tile (T154, AC-148): its chart asked again, past
   * wechart's cached answer and Cube's (`no-cache`, which "Skips refresh key
   * checks"; `must-revalidate` would serve Cube's cache while its key holds), and put back in
   * place — the other tiles are not asked again.
   */
  const [refreshing, setRefreshing] = useState<ReadonlySet<string>>(new Set());
  const refresh = async (chartId: string) => {
    setRefreshing((now) => new Set([...now, chartId]));
    const began = chartsGeneration.current;
    try {
      const { chart, document: read, answered: meta } = await specFor(chartId, 'no-cache', preview);
      // The charts were loaded again, or saved, while this was out: what
      // they hold now is newer than what this asked (T154's review).
      if (chartsGeneration.current !== began) return;
      queryClient.setQueryData<DrawnCharts>(chartsKeyOf(dashboardId), (before) => {
        if (before === undefined) return before;
        const specs = { ...before.specs };
        const errors = { ...before.errors };
        if ('spec' in chart) {
          specs[chartId] = chart.spec;
          delete errors[chartId];
        } else {
          errors[chartId] = chart.error;
          delete specs[chartId];
        }
        // The chart as read now: what names the tile, and what filters ask.
        const documents = { ...before.documents };
        if (read !== undefined) documents[chartId] = read;
        const answered = { ...before.answered };
        if (meta === undefined) delete answered[chartId];
        else answered[chartId] = meta;
        return { specs, errors, documents, answered };
      });
    } finally {
      setRefreshing((now) => new Set([...now].filter((id) => id !== chartId)));
    }
  };

  /**
   * Number formats from the Cube model (AC-046, T194), applied as the tiles
   * are drawn rather than while they load: no tile waits for the model, and
   * each picks its formats up when the model arrives. The same query the
   * editor uses, so the two read one cache entry.
   *
   * Handed to the view rather than applied here, because the view is where a
   * chart edited from a tile replaces the saved one (T032). Applied here, they
   * reached only the saved charts, and a drafted tile read "76,900" where the
   * editor's preview had just shown "$76,900.00".
   */
  const meta = useQuery(META_QUERY);
  const formats = useMemo(() => formatsFrom(meta.data), [meta.data]);
  // Which fields reach which cubes and views, for filters (AC-079). Until the
  // model arrives it cannot say, and no filter is applied or marked.
  const reach = useMemo(() => reachFrom(meta.data), [meta.data]);
  /**
   * Which dimension identifies a cube's rows, so a table tile knows whether
   * its rows can be marked at all (AC-092). Read here, with the rest of the
   * model, rather than queried again inside the dashboard.
   */
  const primaryKey = useMemo(() => {
    const data = meta.data;
    return (cube: string) => primaryKeyOf(data, cube);
  }, [meta.data]);
  // Fields by the titles the filter bar shows, to name filters in words.
  const memberTitle = useMemo(() => {
    const titles = new Map(allMembers(meta.data).map((member) => [member.name, member.title]));
    return (name: string) => titles.get(name);
  }, [meta.data]);

  return (
    <>
      {saveFailed === '' ? null : (
        // Why the save failed (AC-184). The session is still open beneath it,
        // every change kept, for another try or another course.
        <StateLine kind="err" testId="save-failed">
          {saveFailed}
        </StateLine>
      )}
      {savedToFolders === '' ? null : (
        <StateLine kind="ok" testId="saved-to-folder">
          {savedToFolders}
        </StateLine>
      )}
      <DashboardView
        /**
         * Keyed by the dashboard, so moving from one to another starts a new
         * edit session rather than carrying the previous dashboard's history
         * into it — the session is seeded when Edit is pressed and would
         * otherwise be editing a document that is no longer on screen.
         */
        key={dashboardId}
        dashboardId={dashboardId}
        document={document}
        specs={charts.data?.specs ?? {}}
        documents={charts.data?.documents}
        reach={reach}
        primaryKey={primaryKey}
        memberTitle={memberTitle}
        formats={formats}
        errors={charts.data?.errors ?? {}}
        loading={charts.isPending}
        answered={charts.data?.answered}
        onRefresh={(chartId) => {
          void refresh(chartId);
        }}
        refreshing={refreshing}
        refreshable={!charts.isFetching}
        preview={preview}
        onExitPreview={onExitPreview}
        // E and a tile's pencil open the chart editor over the dashboard, in
        // the view itself (T032). They used to navigate here, a full page
        // load that ended the edit session — so there was no dashboard to
        // return to with the tile updated, and nothing a Discard could reach.
        // The save's outcome goes back to the session: it leaves edit mode when
        // the save resolves, and keeps every change when it rejects (AC-184).
        // The rejection is the session's to handle; why is shown above.
        editTile={editTile}
        onEditTile={onEditTile}
        urlFilterValues={urlFilterValues}
        onFilterValues={onFilterValues}
        onEditStart={() => {
          setEditBase(version);
          setSavedToFolders('');
        }}
        onSave={(next, drafts) =>
          save.mutateAsync({ id: dashboardId, next, drafts, version: editBase ?? version })
        }
      />
    </>
  );
}

/**
 * One tile's chart, ready to render: the saved chart document, read strictly,
 * then drawn by `tileChartOf` — the same recommendation the editor makes, so a
 * chart looks the same on a dashboard as it did where it was built (T193).
 *
 * `readChartDocument` is strict, so a body in an older or broken format is
 * refused here rather than drawn as an empty chart.
 */
async function specFor(
  chartId: string,
  /** `no-cache` for a tile's "Refresh now": asked past Cube's cache (T154, AC-148). */
  cache?: 'no-cache',
  /** A previewed security context, asked as (T172, AC-166). */
  context?: Readonly<Record<string, unknown>>,
): Promise<{ chart: TileChart; document: ChartDocument | undefined; answered?: AnswerMeta }> {
  let stored;
  try {
    stored = await getJson<StoredDocument>(`/api/documents/chart/${encodeURIComponent(chartId)}`);
  } catch (failure) {
    /**
     * Only the server saying the chart does not exist is the missing-chart
     * state. A request that never reached it — the network dropped — or one
     * it failed to answer says nothing about whether the chart is there, and
     * calling it "no longer available" sends the reader looking for whoever
     * deleted it (the dashboard critique, F10). That is a failure to load, and
     * the tile offers Retry for it (AC-042).
     */
    if (failure instanceof HttpError && failure.status === 404)
      return { chart: { error: CHART_MISSING }, document: undefined };
    return {
      chart: {
        error: new Error(
          failure instanceof HttpError
            ? `The server could not read this chart (HTTP ${String(failure.status)}).`
            : 'Could not reach the server to read this chart. Check the connection, then retry.',
        ),
      },
      document: undefined,
    };
  }

  let document;
  try {
    document = readChartDocument(stored.body);
  } catch {
    // Stored but unreadable: the chart as it stands cannot be drawn, which is
    // the missing-chart state — a broken dashboard, not a broken query, so
    // the tile shows it without Retry, which would only fail the same way.
    return { chart: { error: CHART_MISSING }, document: undefined };
  }

  // AC-012: a failed query reaches the tile as the thrown value, so that a
  // TileLoadError still carries its query and the tile can offer it.
  // What Cube says of its answer besides the rows: when the data is from, and
  // whether a pre-aggregation served it (T154, T014).
  let answered: AnswerMeta | undefined;
  const chart = await tileChartOf(document, async (query) => {
    const result = (await loadTile({
      query,
      ...(cache === undefined ? {} : { cache }),
      ...(context === undefined ? {} : { context }),
    })) as { data?: Record<string, unknown>[] };
    answered = answerMetaOf(result);
    return result.data ?? [];
  });
  return answered === undefined ? { chart, document } : { chart, document, answered };
}
