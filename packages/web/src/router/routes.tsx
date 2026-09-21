import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';

import { DashboardPage } from '../dashboard/DashboardPage';
import { ChartEditor } from '../editor/ChartEditor';
import { editorViewOf, loadEditorState } from '../editor/openChart';
import { AppShell } from '../shell/AppShell';
import { ExplorePage } from '../workspaces/explore/ExplorePage';
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
    <AppShell workspace="explore">
      <h1>Not found</h1>
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

const WORKSPACE_CONTENT: Partial<Record<string, () => React.ReactNode>> = {
  explore: () => <ExplorePage />,
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

/** A surface that names the object the URL selected. */
function SelectedObject({ workspace, label }: { workspace: WorkspaceId; label: string }) {
  const params = useParams({ strict: false }) as { objectId?: string };
  return (
    <AppShell workspace={workspace}>
      <h1>{label}</h1>
      <p data-testid="selected-object">{decodeURIComponent(params.objectId ?? '')}</p>
    </AppShell>
  );
}

/** The dashboard, in view mode with its saved pages, tiles and settings (AC-018). */
function DashboardSurface() {
  const params = useParams({ strict: false }) as { objectId?: string };
  const dashboardId = decodeURIComponent(params.objectId ?? '');

  return (
    <AppShell workspace="explore">
      <DashboardPage dashboardId={dashboardId} />
    </AppShell>
  );
}

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/dashboards/$objectId',
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
      <h1>Chart editor</h1>
      <p data-testid="selected-object">{chartId}</p>
      {view.kind === 'loading' ? (
        <p data-testid="editor-loading">Opening the chart…</p>
      ) : view.kind === 'error' ? (
        <p role="alert" data-testid="editor-load-error">
          {view.message}
        </p>
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
  component: () => <SelectedObject workspace="model" label="Model file" />,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
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
