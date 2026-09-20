import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router';

import { ChartEditor } from '../editor/ChartEditor';
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

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/explore/dashboards/$objectId',
  component: () => <SelectedObject workspace="explore" label="Dashboard" />,
});

function ChartSurface() {
  const params = useParams({ strict: false }) as { objectId?: string };
  return (
    <AppShell workspace="explore">
      <LibraryChartPage chartId={decodeURIComponent(params.objectId ?? '')} />
    </AppShell>
  );
}

/** The chart editor (AC-025 onwards). */
function ChartEditorSurface() {
  const params = useParams({ strict: false }) as { objectId?: string };
  return (
    <AppShell workspace="explore">
      <h1>Chart editor</h1>
      <p data-testid="selected-object">{decodeURIComponent(params.objectId ?? '')}</p>
      <ChartEditor />
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
