import type { DashboardDocument } from '../model/document';

/**
 * Saving a dashboard (AC-065).
 *
 * The whole document goes, not a diff and not a set of named fields. The
 * criterion lists four things to persist — layout, tile settings, dashboard
 * settings and marking definitions — and marking definitions do not exist
 * yet: they arrive at F9. A save that enumerated what it knew about would
 * drop them on the day they were added, so it sends the document it has.
 *
 * The version travels with it. Two people editing one dashboard would
 * otherwise have whoever saved last win in silence, and the loser would
 * never learn their work had gone.
 */
/**
 * What to do is said as well as what happened (decided with the user,
 * 2026-09-21): the session stays open with the work in it (AC-184), and the
 * same save can only be refused again.
 *
 * - **The dashboard changed**: its version has moved on, so no save of this
 *   session can go through. Reloading is the way on.
 * - **A chart changed**: only that chart's write is refused. The dashboard
 *   has not moved, so undoing back past the chart edit and saving the rest
 *   goes through — said, rather than sending the user to reload and lose it
 *   all. Undo is linear, so what came after goes with it, and that is said
 *   too.
 */
export class StaleSaveError extends Error {
  constructor(what: 'dashboard' | 'chart' = 'dashboard') {
    super(
      what === 'chart'
        ? 'A chart on this dashboard changed somewhere else while you were editing it. To save the rest, undo back past your change to that chart — anything changed after it is undone too — and save again. Or reload: that shows their change and discards yours.'
        : 'This dashboard changed somewhere else while you were editing it. Reloading shows that change and discards yours — copy anything you need first.',
    );
    this.name = 'StaleSaveError';
  }
}

export interface SaveResult {
  readonly version: number;
}

/** A chart edited from one of the dashboard's tiles, to be written with it (T192). */
export interface ChartWrite {
  readonly id: string;
  readonly document: unknown;
  /** The version the chart was read at; the write is refused if it has moved. */
  readonly version: number;
}

export interface SaveOptions {
  readonly dashboardId: string;
  readonly document: DashboardDocument;
  /** The version the editing session started from. */
  readonly version: number;
  /**
   * Charts edited from the dashboard's tiles (AC-183). Written in the same
   * request as the dashboard, which the server writes in one transaction:
   * two requests have no safe order — charts first leaves them changed if the
   * dashboard then fails, dashboard first loses the edit if a chart fails.
   */
  readonly charts?: readonly ChartWrite[];
  readonly fetchImpl?: typeof fetch;
}

export async function saveDashboard({
  dashboardId,
  document,
  version,
  charts = [],
  fetchImpl = fetch,
}: SaveOptions): Promise<SaveResult> {
  let response: Response;
  try {
    // With no chart to write, exactly the request it always was.
    response =
      charts.length === 0
        ? await fetchImpl(`/api/documents/dashboard/${encodeURIComponent(dashboardId)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body: document, version }),
          })
        : await fetchImpl(`/api/dashboards/${encodeURIComponent(dashboardId)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              dashboard: { body: document, version },
              charts: charts.map((chart) => ({
                id: chart.id,
                body: chart.document,
                version: chart.version,
              })),
            }),
          });
  } catch {
    /**
     * The request never got an answer — offline, or the connection dropped.
     * Each browser words that its own way, and none says what to do; the
     * work is kept (AC-184), so the reason says how to get it saved.
     */
    throw new Error(
      'Could not save: the server could not be reached. Check the connection, then save again.',
    );
  }

  if (response.status === 409) throw new StaleSaveError(await staleKind(response));
  if (!response.ok) {
    // A refusal says why; a server fault says only that it failed, with the
    // status — its body is "Internal error" by design, which tells no one
    // anything.
    const reason = response.status < 500 ? await reasonFrom(response) : undefined;
    throw new Error(`Could not save: ${reason ?? String(response.status)}`);
  }

  const saved = (await response.json()) as { version?: number };
  // The new version, so a second save in the same session is not itself
  // stale against the first.
  return { version: saved.version ?? version + 1 };
}

/**
 * The server's own reason for refusing, when its body carries one — `error`
 * from a refusal it authored (400, 422), `message` from a missing document
 * (404). Its 500 answer is "Internal error" by design, so nothing of the
 * service's environment rides along (AC-007).
 */
async function reasonFrom(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      readonly error?: unknown;
      readonly message?: unknown;
    };
    if (typeof body.error === 'string') return body.error;
    return typeof body.message === 'string' ? body.message : undefined;
  } catch {
    return undefined;
  }
}

/** Which document the server found stale, when it says. */
async function staleKind(response: Response): Promise<'dashboard' | 'chart'> {
  try {
    const body = (await response.json()) as { readonly document?: { readonly kind?: unknown } };
    return body.document?.kind === 'chart' ? 'chart' : 'dashboard';
  } catch {
    return 'dashboard';
  }
}
