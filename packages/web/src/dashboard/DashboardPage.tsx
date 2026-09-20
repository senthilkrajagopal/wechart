import { useQuery } from '@tanstack/react-query';
import {
  compile,
  readChartDocument,
  toChartSpec,
  toCubeQuery,
  type RenderSpec,
} from '@wechart/core';

import { loadTile } from '../query/loadTile';
import { DashboardView } from './DashboardView';
import { DEFAULT_SETTINGS, type DashboardDocument } from './model/document';

/**
 * The dashboard route (AC-018): load the saved document, load each of its
 * charts, and hand both to the view.
 *
 * Fetching lives here rather than in `DashboardView` for the reason the rest
 * of the app already follows — `FolderContents` takes its rows, `ChartTile`
 * takes its spec. A view that fetches cannot be rendered in a test without a
 * server, and cannot be reused inside the editor's preview.
 */
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${String(response.status)}`);
  return (await response.json()) as T;
}

interface StoredDocument {
  readonly id: string;
  readonly body: Record<string, unknown>;
}

/**
 * A stored body becomes a dashboard document. A dashboard saved before there
 * were pages — every seeded one but the first — opens as an empty dashboard
 * rather than as an error, because "no tiles yet" is what it is.
 */
function dashboardOf(stored: StoredDocument): DashboardDocument {
  const body = stored.body as Partial<DashboardDocument>;
  return {
    schemaVersion: body.schemaVersion ?? 1,
    title: typeof body.title === 'string' ? body.title : 'Dashboard',
    pages: body.pages ?? [],
    settings: body.settings ?? DEFAULT_SETTINGS,
  };
}

export interface DashboardPageProps {
  readonly dashboardId: string;
}

export function DashboardPage({ dashboardId }: DashboardPageProps) {
  const saved = useQuery({
    queryKey: ['dashboard', dashboardId],
    queryFn: () =>
      getJson<StoredDocument>(`/api/documents/dashboard/${encodeURIComponent(dashboardId)}`),
  });

  const document = saved.data === undefined ? undefined : dashboardOf(saved.data);

  if (saved.isPending) return <p data-testid="dashboard-loading">Loading…</p>;
  if (saved.isError)
    return (
      <p role="alert" data-testid="dashboard-error">
        {(saved.error as Error).message}
      </p>
    );
  if (document === undefined) return null;

  return <LoadedDashboard document={document} dashboardId={dashboardId} />;
}

/**
 * Separate so the document is in hand before any chart query is keyed on it.
 * `EditChrome` seeds its session when Edit is pressed, and a dashboard that
 * arrived after that would be a session editing nothing.
 */
function LoadedDashboard({
  document,
  dashboardId,
}: {
  document: DashboardDocument;
  dashboardId: string;
}) {
  const charts = useQuery({
    queryKey: ['dashboard-charts', dashboardId],
    queryFn: async () => {
      const entries = await Promise.all(
        chartIdsOf(document).map(async (id) => [id, await specFor(id)] as const),
      );

      // Split rather than collapsed: a chart that drew and a chart that failed
      // are different things to put on a tile, and a failure that arrives as
      // "no spec" would be drawn as an empty chart, which reads as "no data".
      const specs: Record<string, RenderSpec> = {};
      const errors: Record<string, unknown> = {};
      for (const [id, loaded] of entries) {
        if ('spec' in loaded) specs[id] = loaded.spec;
        else errors[id] = loaded.error;
      }
      return { specs, errors };
    },
  });

  return (
    <DashboardView
      /**
       * Keyed by the dashboard, so moving from one to another starts a new
       * edit session rather than carrying the previous dashboard's history
       * into it — the session is seeded when Edit is pressed and would
       * otherwise be editing a document that is no longer on screen.
       */
      key={dashboardId}
      document={document}
      specs={charts.data?.specs ?? {}}
      errors={charts.data?.errors ?? {}}
      loading={charts.isPending}
      /**
       * Where E on a focused tile leads (AC-057). Navigating is the route's
       * business; what the editor then shows — a preview at the tile's own
       * size, and the way back — is AC-034's.
       */
      onEditChart={(chartId) => {
        globalThis.location.assign(`/explore/charts/${encodeURIComponent(chartId)}/edit`);
      }}
      onSave={() => {
        // Saving is AC-065 (T071). Until then the dashboard is read-only and
        // an edit session is discarded when the page is left.
      }}
    />
  );
}

/**
 * One tile's chart, ready to render: the saved chart document, the rows its
 * query returns, and the two compiled together.
 *
 * The same three steps the editor takes (`ChartEditor`), which is the point —
 * a chart has to look the same on a dashboard as it did where it was built.
 * `readChartDocument` is strict, so a body in an older or broken format is
 * refused here rather than drawn as an empty chart.
 */
/**
 * The error is carried as the thrown value, not as its message. `TileError`
 * offers the query JSON only for a `TileLoadError` (AC-012), and flattening to
 * a string throws away the one thing that makes a failed tile diagnosable.
 */
type TileChart = { readonly spec: RenderSpec } | { readonly error: unknown };

async function specFor(chartId: string): Promise<TileChart> {
  let document;
  try {
    const stored = await getJson<StoredDocument>(
      `/api/documents/chart/${encodeURIComponent(chartId)}`,
    );
    document = readChartDocument(stored.body);
  } catch {
    // The chart itself is gone or unreadable. That is the missing-chart state
    // (AC-017), which the tile shows, and it is not the same thing as a query
    // that failed — one is a broken dashboard, the other a broken query.
    return { error: 'This chart is no longer available.' };
  }

  const chartType = document.chart.chartType;
  if (chartType === undefined) return { error: 'This chart has no chart type yet.' };

  try {
    const query = toCubeQuery(toChartSpec(document));
    const result = (await loadTile({ query })) as { data?: Record<string, unknown>[] };
    return { spec: compile(document, { rows: result.data ?? [], chartType }) };
  } catch (failure) {
    // AC-012: what Cube said, on the tile — the thrown value, so that a
    // TileLoadError still carries its query and the tile can offer it. The
    // message alone would show the text and lose the diagnosis.
    return { error: failure };
  }
}

function chartIdsOf(document: DashboardDocument): string[] {
  const ids: string[] = [];
  const walk = (items: DashboardDocument['pages'][number]['items']) => {
    for (const element of items) {
      if (element.kind === 'section') walk(element.items);
      else if (element.kind === 'tabs') for (const tab of element.tabs) walk(tab.items);
      else if (element.kind === 'chart' && element.chartId !== undefined) ids.push(element.chartId);
    }
  };
  for (const page of document.pages) walk(page.items);
  return ids;
}
