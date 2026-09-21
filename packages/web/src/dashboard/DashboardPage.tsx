import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { readChartDocument, type RenderSpec } from '@wechart/core';

import { loadTile } from '../query/loadTile';
import { META_QUERY } from '../query/meta';
import { formatsFrom, tileChartOf, type TileChart } from './chartSpec';
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
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${String(response.status)}`);
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
    pages: body.pages ?? [],
    settings: body.settings ?? DEFAULT_SETTINGS,
  });
}

export interface DashboardPageProps {
  readonly dashboardId: string;
}

export function DashboardPage({ dashboardId }: DashboardPageProps) {
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

  if (saved.isPending) return <p data-testid="dashboard-loading">Loading…</p>;
  if (saved.isError)
    return (
      <p role="alert" data-testid="dashboard-error">
        {(saved.error as Error).message}
      </p>
    );
  if (document === undefined) return null;

  return (
    <LoadedDashboard
      document={document}
      dashboardId={dashboardId}
      version={saved.data?.version ?? 1}
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
}: {
  document: DashboardDocument;
  dashboardId: string;
  version: number;
}) {
  const queryClient = useQueryClient();
  const [saveFailed, setSaveFailed] = useState('');

  /**
   * Saving (AC-065). The version the session started from travels with it, so
   * a dashboard changed somewhere else is refused rather than overwritten —
   * and on success the cached copy is refreshed, or the next Edit would begin
   * from the document as it was before this save.
   */
  const save = useMutation({
    mutationFn: ({
      next,
      drafts,
    }: {
      next: DashboardDocument;
      drafts: DashboardDocument['chartDrafts'];
    }) =>
      saveDashboard({
        dashboardId,
        document: next,
        version,
        charts:
          drafts === undefined ? [] : chartWritesOf({ ...next, chartDrafts: drafts }, dashboardId),
      }),
    /**
     * The tiles keep showing the edited charts while the save is in flight.
     * Saving leaves edit mode at once, before the server has answered, and
     * the drafts go with the session — so without this the tiles fell back
     * to the charts as they were loaded, and the old chart flashed up until
     * the charts were fetched again.
     */
    onMutate: async ({ next, drafts }) => {
      if (drafts === undefined) return;
      /**
       * A load of the charts still running — the last save's re-fetch, with
       * Cube slow — would otherwise land after this and put that save's
       * charts back over this one's edits. Cancelled, its result is dropped
       * and the query reverts (`cancelQueries`, docs/research/data-layer.md).
       */
      await queryClient.cancelQueries({ queryKey: ['dashboard-charts', dashboardId] });
      queryClient.setQueryData<{
        specs: Record<string, RenderSpec>;
        errors: Record<string, unknown>;
      }>(['dashboard-charts', dashboardId], (drawn) =>
        drawn === undefined
          ? drawn
          : (drawnWithDrafts(drawn, { ...next, chartDrafts: drafts }) as typeof drawn),
      );
    },
    onSuccess: async () => {
      setSaveFailed('');
      await queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-charts', dashboardId] });
    },
    onError: async (failure: Error) => {
      setSaveFailed(failure.message);
      // Back to what the server has: the edit shown optimistically was not kept.
      await queryClient.invalidateQueries({ queryKey: ['dashboard-charts', dashboardId] });
    },
  });
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

  return (
    <>
      {saveFailed === '' ? null : (
        // A save that failed in silence is the worst outcome of all: the
        // editor has left edit mode believing the work is stored.
        <p role="alert" data-testid="save-failed">
          {saveFailed}
        </p>
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
        formats={formats}
        errors={charts.data?.errors ?? {}}
        loading={charts.isPending}
        // E and a tile's pencil open the chart editor over the dashboard, in
        // the view itself (T032). They used to navigate here, a full page
        // load that ended the edit session — so there was no dashboard to
        // return to with the tile updated, and nothing a Discard could reach.
        onSave={(next, drafts) => {
          save.mutate({ next, drafts });
        }}
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

  // AC-012: a failed query reaches the tile as the thrown value, so that a
  // TileLoadError still carries its query and the tile can offer it.
  return tileChartOf(document, async (query) => {
    const result = (await loadTile({ query })) as { data?: Record<string, unknown>[] };
    return result.data ?? [];
  });
}
