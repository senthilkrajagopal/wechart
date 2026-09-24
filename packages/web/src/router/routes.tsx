import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useParams,
  useRouter,
} from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { DashboardPage } from '../dashboard/DashboardPage';
import { ChartEditor } from '../editor/ChartEditor';
import { editorViewOf, loadEditorState } from '../editor/openChart';
import type { FilterValues } from '../filters/model';
import { valuesFromSearch, valuesToSearch, type SearchFilter } from '../filters/url';
import { previewClaimsOf } from '../query/securityPreview';
import { AppShell } from '../shell/AppShell';
import { StateLine } from '../shell/StatusIcon';
import { ExplorePage } from '../workspaces/explore/ExplorePage';
import { JobsPage } from '../workspaces/jobs/JobsPage';
import { SecurityPage } from '../workspaces/security/SecurityPage';
import { DataSourcesPage, SchedulesPage } from '../workspaces/admin/DeferredPage';
import { FileList } from '../workspaces/model/FileList';
import { ModelFilePage } from '../workspaces/model/ModelFilePage';
import { LibraryChartPage } from '../workspaces/explore/LibraryChartPage';
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
      <h1 className="workspace-title">Not found</h1>
      <p>Nothing here matches that address.</p>
    </AppShell>
  ),
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
  jobs: () => <JobsPage />,
  // The model's access policies, as declared (T171, AC-165).
  security: () => <SecurityPage />,
  // Their frames and what they are for; managing either waits (AC-233).
  schedules: () => <SchedulesPage />,
  'data-sources': () => <DataSourcesPage />,
  // The model's files and what each defines (T137, AC-131).
  model: () => (
    <div className="model-workspace">
      <h1 className="workspace-title">Model</h1>
      <FileList />
    </div>
  ),
};

const workspaceRoutes = WORKSPACES.map((workspace) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: workspace.path,
    component: () => (
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
  const { edit, filters, preview } = dashboardRoute.useSearch();
  const navigate = dashboardRoute.useNavigate();
  const router = useRouter();
  /** Leaving a security context preview (T172): the dashboard as wechart asks. */
  const onExitPreview = useCallback(() => {
    void navigate({ search: (prev) => ({ ...prev, preview: undefined }) });
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
        urlFilterValues={valuesFromSearch(filters)}
        onFilterValues={onFilterValues}
        {...(preview === undefined ? {} : { preview, onExitPreview })}
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
    filters?: SearchFilter[] | undefined;
    preview?: Record<string, unknown> | undefined;
  } => ({
    edit: typeof search['edit'] === 'string' && search['edit'] !== '' ? search['edit'] : undefined,
    // The filters in effect (AC-081), each checked; none is no parameter.
    filters: valuesToSearch(valuesFromSearch(search['filters'])),
    // A security context previewed from the Security workspace (T172,
    // AC-166): a JSON object, as it runs — less the claims wechart sets
    // itself — or no preview at all.
    preview: previewClaimsOf(search['preview']),
  }),
  component: DashboardSurface,
});

function ChartSurface() {
  const params = useParams({ strict: false }) as { objectId?: string };
  return (
    <AppShell workspace="explore">
      <LibraryChartPage chartId={decodeURIComponent(params.objectId ?? '')} />
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

  const chart = useQuery({
    queryKey: ['chart-editor', chartId],
    queryFn: () => loadEditorState(chartId),
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
  const view = editorViewOf({ data: chart.data, error: chart.error });

  return (
    <AppShell workspace="explore">
      <h1 className="workspace-title">Chart editor</h1>
      <p data-testid="selected-object">{chartId}</p>
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
        <ChartEditor key={chartId} initial={view.initial} />
      )}
    </AppShell>
  );
}

const chartEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/charts/$objectId/edit',
  component: ChartEditorSurface,
});

const chartRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/charts/$objectId',
  component: ChartSurface,
});

const modelFileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/model/files/$objectId',
  // A model file, open on its forms (T138, AC-132).
  component: function ModelFileSurface() {
    const params = useParams({ strict: false }) as { objectId?: string };
    return (
      <AppShell workspace="model">
        <ModelFilePage path={decodeURIComponent(params.objectId ?? '')} />
      </AppShell>
    );
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  sourcesRoute,
  ...workspaceRoutes,
  dashboardRoute,
  // Before chartRoute: the editor path is more specific than /charts/$objectId.
  chartEditorRoute,
  chartRoute,
  modelFileRoute,
]);

export function buildRouter() {
  return createRouter({ routeTree });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof buildRouter>;
  }
}
