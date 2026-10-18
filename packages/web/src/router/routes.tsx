import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useParams,
  useRouter,
  useRouterState,
} from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { DashboardPage } from '../dashboard/DashboardPage';
import { viewFromLink } from '../dashboard/markings/shareLink';
import { ChartEditor } from '../editor/ChartEditor';
import { LibraryChartNote } from '../editor/LibraryChartNote';
import { chartDocumentWith, editorViewOf, loadChart, type EditorState } from '../editor/openChart';
import { withDrawnAs } from '../editor/drawnAs';
import { formatsFrom, tileChartOf } from '../dashboard/chartSpec';
import { loadTile } from '../query/loadTile';
import type { FilterValues } from '../filters/model';
import { valuesFromSearch, valuesToSearch, type SearchFilter } from '../filters/url';
import { previewClaimsOf } from '../query/securityPreview';
import { AccessTokensPage } from '../account/AccessTokensPage';
import { AppShell } from '../shell/AppShell';
import { NotFound } from '../shell/NotFound';
import { StateLine } from '../shell/StatusIcon';
import { ExplorePage } from '../workspaces/explore/ExplorePage';
import { jobsTabOf, JobsPage } from '../workspaces/jobs/JobsPage';
import { auditFiltersFrom, auditSearchOf } from '../workspaces/security/AuditTrail';
import { SecuritySurface } from '../workspaces/security/SecuritySurface';
import { ReviewsPage, type ReviewsView } from '../workspaces/reviews/ReviewsPage';
import { ReviewView } from '../workspaces/reviews/ReviewView';
import { DataSourcesPage } from '../workspaces/data-sources/DataSourcesPage';
import { CUBE_STORE_ID } from '../workspaces/data-sources/cubeStore';
import { CubeStorePage } from '../workspaces/data-sources/CubeStorePage';
import { SourceSettings } from '../workspaces/data-sources/SourceSettings';
import { SchedulesPage } from '../workspaces/schedules/SchedulesPage';
import { SqlSurface } from '../workspaces/sql/SqlSurface';
import { ModelFilePage } from '../workspaces/model/ModelFilePage';
import { LibraryChartPage } from '../workspaces/explore/LibraryChartPage';
import { LocalChartActions, useChartHome } from '../workspaces/explore/LocalChartHome';
import { exploreHref, folderChain, FOLDERS_QUERY } from '../workspaces/explore/folders';
import { isMyWorkspace, SHARED_ROOT } from '../workspaces/explore/roots';
import { metaQueryOf, WorkspaceItemContext } from '../query/meta';
import { WORKSPACES, type WorkspaceId } from '../shell/WorkspaceSwitcher';

/**
 * The URL is the source of truth for which surface is open and which object is
 * selected, so a reload restores both (AC-002).
 *
 * Workspace routes are generated from WORKSPACES — the same list the switcher
 * renders — so a workspace can never exist in one and not the other.
 *
 * The object routes below render a placeholder naming the selected object. The
 * surfaces themselves arrive later (the dashboard at T023, the chart editor at
 * T032, the model file at T137); what this task settles is the contract that
 * the URL carries the selection and the app comes back to it.
 */

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    // In no workspace: marking Explore current told the user they were in it.
    <AppShell>
      <NotFound />
    </AppShell>
  ),
});

/** A Security tab by its address's last part (T500). */
const securityTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/security/$tab',
  component: function SecurityTabSurface() {
    const { tab } = useParams({ strict: false }) as { tab?: string };
    const router = useRouter();
    // The audit trail's filters live in the address, so a filtered trail
    // can be linked and reloaded (T369; design 08, pin 1).
    const searched = useRouterState({ select: (state) => state.location.searchStr });
    const filters = auditFiltersFrom(new URLSearchParams(searched));
    return (
      <SecuritySurface
        tab={tab === 'preview' || tab === 'audit' || tab === 'tokens' ? tab : undefined}
        audit={{
          filters,
          onFilters: (next) => {
            const search = auditSearchOf(next);
            router.history.push(`/security/audit${search === '' ? '' : `?${search}`}`);
          },
        }}
      />
    );
  },
});

/**
 * The user's own access tokens (T769, AC-430; design 18, screen 1): under
 * their account, in no workspace, for everyone signed in or the single user.
 */
const accessTokensRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account/tokens',
  component: () => (
    <AppShell>
      <AccessTokensPage />
    </AppShell>
  ),
});

/**
 * The Reviews page (T355, AC-287; design 05, state D): in no workspace, its
 * control beside search. Its tab and the proposal chosen are in the address.
 */
const reviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reviews',
  component: function ReviewsSurface() {
    const router = useRouter();
    const searched = useRouterState({ select: (state) => state.location.searchStr });
    const params = new URLSearchParams(searched);
    const tab = params.get('tab');
    const view: ReviewsView = {
      // Calculation requests have a tab of their own (T383, AC-050).
      tab: tab === 'mine' || tab === 'requests' ? tab : 'to-review',
      selected: params.get('selected') ?? undefined,
    };
    return (
      <AppShell reviews>
        <ReviewsPage
          view={view}
          onView={(next) => {
            const search = new URLSearchParams();
            if (next.tab !== 'to-review') search.set('tab', next.tab);
            if (next.selected !== undefined) search.set('selected', next.selected);
            const text = search.toString();
            router.history.push(`/reviews${text === '' ? '' : `?${text}`}`);
          }}
        />
      </AppShell>
    );
  },
});

/**
 * A build's log at its address (T610; design 16, G6): Run history, open on
 * it; one of another folder, or none, reads as the app's Not found page.
 */
const buildLogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/jobs/builds/$buildId',
  component: function BuildLogSurface() {
    const params = useParams({ strict: false }) as { buildId?: string };
    const router = useRouter();
    const buildId = decodeURIComponent(params.buildId ?? '');
    return (
      <AppShell workspace="jobs">
        <JobsPage
          key={buildId}
          buildId={buildId}
          // Another tab, at its own address (T611's review).
          onTab={(tab) => {
            router.history.push(tab === 'preaggs' ? '/jobs' : `/jobs?tab=${tab}`);
          }}
        />
      </AppShell>
    );
  },
});

/**
 * Jobs, its tab at its own address, `?tab=` (T611; design 16, pin 1: "Each
 * tab's address is its own, so Back returns to it").
 */
function JobsSurface() {
  const router = useRouter();
  const searched = useRouterState({ select: (state) => state.location.searchStr });
  return (
    <JobsPage
      tab={jobsTabOf(new URLSearchParams(searched).get('tab')) ?? 'preaggs'}
      onTab={(tab) => {
        router.history.push(tab === 'preaggs' ? '/jobs' : `/jobs?tab=${tab}`);
      }}
    />
  );
}

/**
 * A proposal's review view (T356; design 05's main screen): the item itself,
 * with Approve and Reject, only here.
 */
const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reviews/$proposalId',
  component: function ReviewSurface() {
    const router = useRouter();
    const params = useParams({ strict: false }) as { proposalId?: string };
    return (
      <AppShell reviews>
        <ReviewView
          key={params.proposalId}
          proposalId={decodeURIComponent(params.proposalId ?? '')}
          onOpen={(id) => {
            router.history.push(`/reviews/${encodeURIComponent(id)}`);
          }}
        />
      </AppShell>
    );
  },
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  // Explore is the home surface: it is where dashboards and charts live.
  beforeLoad: () => {
    throw redirect({ to: '/explore' });
  },
});

/** The prototype's name for Data sources' address, kept working (AC-233). */
const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sources',
  beforeLoad: () => {
    throw redirect({ to: '/data-sources' });
  },
});

const WORKSPACE_CONTENT: Partial<Record<string, () => React.ReactNode>> = {
  explore: () => <ExplorePage />,
  // The queries wechart has issued (AC-016), which T015 built and never mounted.
  jobs: () => <JobsSurface />,
  // Their frames and what they are for; managing either waits (AC-233).
  schedules: () => <SchedulesPage />,
  'data-sources': () => <DataSourcesPage />,
  // F42's workspace, which decides for itself whom it is shown to (T796).
  sql: () => <SqlSurface />,
  // The model's files as a tree beside the editor, none open yet (T234, AC-222).
  model: () => <ModelFilePage />,
};

const workspaceRoutes = WORKSPACES.map((workspace) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: workspace.path,
    component: () =>
      // Security decides for itself whom it is shown to (T500).
      workspace.id === 'security' ? (
        <SecuritySurface tab="policies" />
      ) : (
        <AppShell workspace={workspace.id as WorkspaceId}>
          {WORKSPACE_CONTENT[workspace.id]?.()}
        </AppShell>
      ),
  }),
);

/**
 * The dashboard, in view mode with its saved pages, tiles and settings
 * (AC-018) — and, when the URL names a tile in `edit`, its chart open in the
 * editor over it (T196, AC-002), so a reload restores that too.
 */
function DashboardSurface() {
  const params = useParams({ strict: false }) as { objectId?: string };
  const dashboardId = decodeURIComponent(params.objectId ?? '');
  const { edit, editing, filters, preview, publish, view, panel } = dashboardRoute.useSearch();
  const navigate = dashboardRoute.useNavigate();
  const router = useRouter();
  /**
   * A link with marks, taken (T129, AC-123): its view is dropped from the
   * address once the dashboard has it, so the URL never claims marks the
   * reader has since changed — a reload then opens it unmarked (AC-124).
   */
  const onViewTaken = useCallback(() => {
    void navigate({
      search: (prev) => ({ ...prev, view: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [navigate]);
  /** Leaving a security context preview (T172): the dashboard as wechart asks. */
  const onExitPreview = useCallback(() => {
    void navigate({ search: (prev) => ({ ...prev, preview: undefined }) });
  }, [navigate]);
  /**
   * Edit mode entered as asked (T245): the request is taken out of the
   * address, so a reload or a link opens the dashboard to be read.
   */
  const onStartedEditing = useCallback(() => {
    void navigate({
      search: (prev) => ({ ...prev, editing: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [navigate]);
  /** The ask for a folder, taken (T463): out of the address, as `editing` is. */
  const onPublishTaken = useCallback(() => {
    void navigate({
      search: (prev) => ({ ...prev, publish: undefined }),
      replace: true,
      resetScroll: false,
    });
  }, [navigate]);

  /**
   * Whether the `edit` entry in history is ours — pushed when the editor was
   * opened here — so closing the editor can step back over it rather than
   * leave it behind for the browser's Back to reopen. After a reload there is
   * no entry of ours before it, and closing replaces instead.
   */
  const pushed = useRef(false);

  const onEditTile = (tileId: string | undefined) => {
    // Search-only navigations keep the dashboard mounted, and its edit
    // session with it (research: router-search-history.md, Q4). Pushes and
    // replaces here do not scroll the window to the top; a step back does,
    // and cannot be told not to (Q8) — the dashboard scrolls in its own
    // canvas, which the router leaves alone.
    if (tileId !== undefined) {
      pushed.current = true;
      void navigate({ search: (prev) => ({ ...prev, edit: tileId }), resetScroll: false });
      return;
    }
    // Decided by the URL as it is now, not as the caller last rendered it: an
    // editor that finishes closing after the browser's Back finds the tile
    // already gone, and a step back from there would leave the dashboard.
    // `history.location` is updated before anyone is told of the popstate (Q5).
    if (!new URLSearchParams(router.history.location.search).has('edit')) {
      pushed.current = false;
      return;
    }
    if (pushed.current) {
      pushed.current = false;
      router.history.back();
      return;
    }
    void navigate({
      search: (prev) => ({ ...prev, edit: undefined }),
      replace: true,
      resetScroll: false,
    });
  };

  /**
   * The filters in effect, written into the URL as they change (AC-081), so
   * the URL opens the dashboard filtered the same way. Replacing, not pushing:
   * a filter set is not a place Back should step through.
   *
   * The same function across renders: the view reports changes from an
   * effect that depends on it, and a new one each render would report — and
   * navigate — again on every render.
   */
  const onFilterValues = useCallback(
    (values: FilterValues) => {
      void navigate({
        search: (prev) => ({ ...prev, filters: valuesToSearch(values) }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  return (
    <AppShell workspace="explore">
      <DashboardPage
        dashboardId={dashboardId}
        editTile={edit}
        onEditTile={onEditTile}
        startEditing={editing === true}
        onStartedEditing={onStartedEditing}
        publishTile={publish}
        onPublishTaken={onPublishTaken}
        urlFilterValues={valuesFromSearch(filters)}
        onFilterValues={onFilterValues}
        urlView={view === undefined ? undefined : viewFromLink({ filters, view })}
        onViewTaken={onViewTaken}
        {...(preview === undefined ? {} : { preview, onExitPreview })}
        panel={panel}
        onPanel={(next) => {
          void navigate({
            search: (prev) => ({ ...prev, panel: next }),
            replace: true,
            resetScroll: false,
          });
        }}
      />
    </AppShell>
  );
}

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/dashboards/$objectId',
  /**
   * `edit`, the tile whose chart is open in the editor (T196). Always returned,
   * as undefined when absent, empty or not a string: omitted, a malformed value would
   * reach the page untyped; thrown, the dashboard and its edit session would
   * be replaced by an error (research: router-search-history.md, Q1).
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    edit?: string | undefined;
    editing?: true | undefined;
    filters?: SearchFilter[] | undefined;
    preview?: Record<string, unknown> | undefined;
    publish?: string | undefined;
    view?: Record<string, unknown> | undefined;
    panel?: 'history' | undefined;
  } => ({
    edit: typeof search['edit'] === 'string' && search['edit'] !== '' ? search['edit'] : undefined,
    // Its History panel open (T357; design 06, pin 2), so a reload keeps it.
    panel: search['panel'] === 'history' ? 'history' : undefined,
    // Open in edit mode (T245): a new dashboard from Explore's New, as the
    // prototype opens one. Only `true`; anything else is no request.
    editing: search['editing'] === true ? true : undefined,
    // A tile to open asking for a folder (T463): a local chart page's "Save
    // to folders…". A tile id; anything else is no request.
    publish:
      typeof search['publish'] === 'string' && search['publish'] !== ''
        ? search['publish']
        : undefined,
    // The filters in effect (AC-081), each checked; none is no parameter.
    filters: valuesToSearch(valuesFromSearch(search['filters'])),
    // A security context previewed from the Security workspace (T172,
    // AC-166): a JSON object, as it runs — less the claims wechart sets
    // itself — or no preview at all.
    preview: previewClaimsOf(search['preview']),
    // A link with marks' page tab, marks and marking filters (T129, AC-123):
    // an object, each part checked as the dashboard takes it (`viewFromLink`).
    view:
      typeof search['view'] === 'object' &&
      search['view'] !== null &&
      !Array.isArray(search['view'])
        ? (search['view'] as Record<string, unknown>)
        : undefined,
  }),
  component: DashboardSurface,
});

function ChartSurface() {
  const params = useParams({ strict: false }) as { objectId?: string };
  const { panel } = chartRoute.useSearch();
  return (
    <AppShell workspace="explore">
      <LibraryChartPage chartId={decodeURIComponent(params.objectId ?? '')} panel={panel} />
    </AppShell>
  );
}

/**
 * The chart editor (AC-025 onwards), opened on the chart the URL names
 * (AC-182).
 *
 * Until AC-182 the id was printed and never used, so every editor opened
 * blank whichever chart it was reached from.
 */
function ChartEditorSurface() {
  const params = useParams({ strict: false }) as { objectId?: string };
  const chartId = decodeURIComponent(params.objectId ?? '');
  const queryClient = useQueryClient();

  const chart = useQuery({
    queryKey: ['chart-editor', chartId],
    // The stored document and its version too, so Save can write it back
    // (AC-213) — refused, not overwritten, if it changed meanwhile (T192).
    queryFn: () => loadChart(chartId),
    /**
     * Fetched once per opening, and never again while the editor is open.
     *
     * `gcTime: 0` drops the result when the editor closes, so every opening
     * fetches what is stored now — an editor seeded from a cached copy would
     * put stale content in its undo history, and Discard would "restore" a
     * chart that no longer exists.
     *
     * `staleTime: Infinity` then stops any refetch while it is open. The
     * editor reads its chart once, to seed its history, so a refetch could
     * only ever do harm: `refetchOnReconnect` is on by default, and a failed
     * one sets the query's error. `editorViewOf` already refuses to let that
     * unmount a loaded editor; this makes it not happen at all.
     */
    staleTime: Infinity,
    gcTime: 0,
  });
  const view = editorViewOf({ data: chart.data?.state, error: chart.error });

  /** The editor's state as the user leaves it, for Save. */
  const [edited, setEdited] = useState<EditorState | undefined>(undefined);
  /**
   * Save chart (AC-213): the edit written over the chart as read, at the
   * version read, then its page — where a new chart from New › Chart lands,
   * in the folder it was made in.
   */
  const save = useMutation({
    /** Where to go once it is written: the chart's page. */
    mutationFn: async (then: string) => {
      const loaded = chart.data;
      // Refused, not a silent success that goes to the page with nothing
      // written (T227's review).
      if (loaded === undefined || edited === undefined)
        throw new Error('The chart has not finished opening, so there is nothing to save yet.');
      if (loaded.version === undefined)
        throw new Error('This chart was read without its version, so it cannot be saved safely.');
      const document = chartDocumentWith(loaded.document, edited);
      // Drawn as a tile draws it, for what it was drawn as (AC-193): Explore
      // names a chart that follows the recommendation by that. With the
      // model's formats the editor picked with (T510's review, R67).
      const meta = queryClient.getQueryData(metaQueryOf(workspaceItem).queryKey);
      const drawn = await tileChartOf(
        document,
        async (query) => {
          const result = (await loadTile({ query, item: { kind: 'chart', id: chartId } })) as {
            data?: Record<string, unknown>[];
          };
          return result.data ?? [];
        },
        meta === undefined ? undefined : formatsFrom(meta),
      );
      const response = await fetch(`/api/documents/chart/${encodeURIComponent(chartId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: loaded.version, body: withDrawnAs(document, drawn) }),
      });
      if (response.status === 409)
        throw new Error('This chart was changed elsewhere since it was opened. Reopen it to see.');
      if (!response.ok) throw new Error(`Could not save the chart (${String(response.status)}).`);
      return then;
    },
    onSuccess: (then) => {
      globalThis.location.assign(then);
    },
  });

  const owner = chart.data?.document.localToDashboardId;
  const local = owner !== undefined;
  /**
   * The dashboard it lives on (T463): its title and the tile showing it, for
   * the way there, and its folder — a dashboard's own chart is kept in its
   * dashboard's folder, so the picker offers the cubes on that folder's path
   * (T429's review, AC-329).
   */
  const home = useChartHome(owner, chartId);
  // New only as New › Chart opens it (T256's review): a saved chart with no
  // fields yet is not new, and may already be on dashboards.
  const fresh = chartEditorRoute.useSearch().new === true && !local;
  const page = `/explore/charts/${encodeURIComponent(chartId)}`;
  /**
   * The prototype's way back (T256, recheck-chart-editor N2). Like the
   * prototype's, it applies the edit on the way: a changed library chart is
   * saved and its page opened, as Save chart does (AC-213), and a failed save
   * keeps the editor open with its reason. Unchanged, a new chart goes back
   * to Explore in its folder, and a saved one to its page. A dashboard's own
   * chart is saved with that dashboard, so it goes back there as it is.
   */
  const folderId = chart.data?.document.folderId;
  /**
   * In My workspace, its field list is its overlay's, and its picker offers
   * its target's path after the workspace's own cubes (T347; AC-323, AC-329).
   * A dashboard's own chart is where its dashboard is.
   */
  const folders = useQuery(FOLDERS_QUERY);
  const keptIn = local ? home.data?.folderId : folderId;
  const inWorkspace =
    keptIn !== undefined &&
    (isMyWorkspace(keptIn) || isMyWorkspace(folderChain(folders.data ?? [], keptIn)[0]?.id ?? ''));
  const target = (chart.data?.document as { targetFolderId?: unknown } | undefined)?.targetFolderId;
  const workspaceItem = inWorkspace
    ? {
        item: { kind: 'chart' as const, id: chartId },
        ...(typeof target === 'string' ? { targetFolderId: target } : {}),
      }
    : undefined;
  const back = local
    ? { label: '← Back to dashboard', to: `/explore/dashboards/${encodeURIComponent(owner)}` }
    : fresh
      ? { label: '← Back to Explore', to: exploreHref(folderId ?? SHARED_ROOT.id) }
      : { label: '← Back to chart', to: page };
  const changed =
    !local &&
    edited !== undefined &&
    view.kind === 'editor' &&
    JSON.stringify(edited) !== JSON.stringify(view.initial);
  // Written and leaving: nothing more to press until the page goes.
  const leaving = save.isPending || save.isSuccess;

  return (
    <AppShell workspace="explore">
      {/* Until the editor opens, and its header with it (AC-214). */}
      {view.kind === 'editor' ? null : (
        <div className="chart-page__head">
          <h1 className="workspace-title">Chart editor</h1>
        </div>
      )}
      <p data-testid="selected-object" hidden>
        {chartId}
      </p>
      {view.kind === 'loading' ? (
        <StateLine kind="run" testId="editor-loading">
          Opening the chart…
        </StateLine>
      ) : view.kind === 'error' ? (
        <StateLine kind="err" testId="editor-load-error">
          {view.message}
        </StateLine>
      ) : (
        // Keyed by chart id: the editor reads `initial` once, to seed its
        // history, so a different chart has to be a different editor.
        <WorkspaceItemContext.Provider value={workspaceItem}>
          <ChartEditor
            key={chartId}
            // Its queries are for this chart (T340, AC-268).
            item={{ kind: 'chart', id: chartId }}
            // What a calculation request carries (T383, AC-050).
            chartId={chartId}
            initial={view.initial}
            onChange={setEdited}
            // Its folder's path, for the picker (T429, AC-329): a local chart's
            // is its dashboard's.
            folderId={local ? home.data?.folderId : folderId}
            // An edit made while it is written would be lost as the page goes.
            busy={leaving}
            head={{
              start: (
                <button
                  type="button"
                  className="btn-sm"
                  data-testid="editor-back"
                  disabled={leaving}
                  // Said before it is pressed: Back writes a changed chart.
                  title={changed ? 'Saves the change, then opens the chart' : undefined}
                  onClick={() => {
                    if (changed) save.mutate(page);
                    else globalThis.location.assign(back.to);
                  }}
                >
                  {back.label}
                </button>
              ),
              // Whose it is (AC-214), in the prototype's words (T256): new in its
              // folder, or shared and on how many dashboards.
              badges: local ? (
                // A plain note, as designs 01 and 02 draw ownership, not a
                // bordered chip that reads as a control (chart-editor-Q9; T690).
                <span className="chart-editor__note" data-testid="editor-ownership">
                  Local to a dashboard
                </span>
              ) : (
                <LibraryChartNote chartId={chartId} folderId={folderId} fresh={fresh} />
              ),
              end: (
                <>
                  {save.isError ? <StateLine kind="err">{save.error.message}</StateLine> : null}
                  {local ? (
                    // A chart of one dashboard's is saved with that dashboard, in
                    // its edit session — never on its own here (T227's review).
                    // So the way there, or to folders, in place of a Save (T463,
                    // UX-040).
                    <LocalChartActions dashboardId={owner} home={home} small />
                  ) : (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={leaving || edited === undefined}
                      onClick={() => save.mutate(page)}
                    >
                      {save.isPending ? 'Saving…' : 'Save chart'}
                    </button>
                  )}
                </>
              ),
            }}
          />
        </WorkspaceItemContext.Provider>
      )}
    </AppShell>
  );
}

const chartEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/charts/$objectId/edit',
  /** Opened by New › Chart (T256's review): anything else is no flag. */
  validateSearch: (search: Record<string, unknown>): { new?: true | undefined } => ({
    new: search['new'] === true || search['new'] === 'true' ? true : undefined,
  }),
  component: ChartEditorSurface,
});

const chartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/charts/$objectId',
  /** Its History open on arrival, from its Explore row (T694); anything else is none. */
  validateSearch: (search: Record<string, unknown>): { panel?: 'history' | undefined } => ({
    panel: search['panel'] === 'history' ? 'history' : undefined,
  }),
  component: ChartSurface,
});

const modelFileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/model/files/$objectId',
  /**
   * A cube's tab to open on (T160): Schedules links a pre-aggregation to its
   * cube's Pre-aggregations. Strings only; anything else is no request.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { cube?: string | undefined; tab?: string | undefined; member?: string | undefined } => ({
    cube: typeof search['cube'] === 'string' && search['cube'] !== '' ? search['cube'] : undefined,
    tab: typeof search['tab'] === 'string' && search['tab'] !== '' ? search['tab'] : undefined,
    // A member of that tab to open: Jobs' "Open in Model" (T469, UX-080).
    member:
      typeof search['member'] === 'string' && search['member'] !== ''
        ? search['member']
        : undefined,
  }),
  // A model file, open on its forms (T138, AC-132).
  component: function ModelFileSurface() {
    const params = useParams({ strict: false }) as { objectId?: string };
    const { cube, tab, member } = modelFileRoute.useSearch();
    return (
      <AppShell workspace="model">
        <ModelFilePage
          path={decodeURIComponent(params.objectId ?? '')}
          {...(cube === undefined || tab === undefined ? {} : { openOn: { cube, tab, member } })}
        />
      </AppShell>
    );
  },
});

/**
 * A folder's model, opened from its row in Explore (T342; AC-222, AC-131;
 * rules 70 and 71): under the folder's breadcrumb, its files beside the
 * editor, the file chosen opened in place with the folder and its path in
 * the address — read-only in a shared folder with sign-in on. Without a
 * file, what each of the folder's files defines.
 */
const folderModelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/folders/$folderId/models',
  component: function FolderModelSurface() {
    const params = useParams({ strict: false }) as { folderId?: string };
    const folderId = decodeURIComponent(params.folderId ?? '');
    return (
      <AppShell workspace="explore">
        <ModelFilePage key={folderId} folderId={folderId} />
      </AppShell>
    );
  },
});

const folderModelFileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/folders/$folderId/models/$path',
  /**
   * A cube's tab, and a member of it, to open on, as the root's file takes
   * them: Schedules', Jobs' and "Data as of"'s links to a folder's rollup
   * (T530, AC-222).
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    cube?: string | undefined;
    tab?: string | undefined;
    member?: string | undefined;
    request?: string | undefined;
  } => ({
    cube: typeof search['cube'] === 'string' && search['cube'] !== '' ? search['cube'] : undefined,
    tab: typeof search['tab'] === 'string' && search['tab'] !== '' ? search['tab'] : undefined,
    member:
      typeof search['member'] === 'string' && search['member'] !== ''
        ? search['member']
        : undefined,
    // A calculation request it was opened for, shown beside it (T384, AC-051).
    request:
      typeof search['request'] === 'string' && search['request'] !== ''
        ? search['request']
        : undefined,
  }),
  component: function FolderModelFileSurface() {
    const params = useParams({ strict: false }) as { folderId?: string; path?: string };
    const folderId = decodeURIComponent(params.folderId ?? '');
    const { cube, tab, member, request } = folderModelFileRoute.useSearch();
    return (
      <AppShell workspace="explore">
        <ModelFilePage
          key={folderId}
          folderId={folderId}
          path={decodeURIComponent(params.path ?? '')}
          {...(cube === undefined || tab === undefined ? {} : { openOn: { cube, tab, member } })}
          {...(request === undefined ? {} : { request })}
        />
      </AppShell>
    );
  },
});

/**
 * A stored data source's settings (T462, AC-269; design 03 of 2026-09-27):
 * an Explore item, under its folder's breadcrumb, opened from its row in
 * Explore or in Data sources.
 */
const dataSourceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/data-sources/$objectId',
  component: function DataSourceSurface() {
    const params = useParams({ strict: false }) as { objectId?: string };
    const id = decodeURIComponent(params.objectId ?? '');
    return (
      <AppShell workspace="explore">
        {/* Cube Store's page, its SQL tab alone (T536, AC-384). */}
        {id === CUBE_STORE_ID ? <CubeStorePage /> : <SourceSettings id={id} />}
      </AppShell>
    );
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  sourcesRoute,
  ...workspaceRoutes,
  buildLogRoute,
  securityTabRoute,
  accessTokensRoute,
  reviewsRoute,
  reviewRoute,
  dashboardRoute,
  // Before chartRoute: the editor path is more specific than /charts/$objectId.
  chartEditorRoute,
  chartRoute,
  dataSourceRoute,
  modelFileRoute,
  folderModelRoute,
  folderModelFileRoute,
]);

export function buildRouter() {
  return createRouter({ routeTree });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof buildRouter>;
  }
}
