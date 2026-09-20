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
export class StaleSaveError extends Error {
  constructor() {
    super('This dashboard changed somewhere else while you were editing it.');
    this.name = 'StaleSaveError';
  }
}

export interface SaveResult {
  readonly version: number;
}

export interface SaveOptions {
  readonly dashboardId: string;
  readonly document: DashboardDocument;
  /** The version the editing session started from. */
  readonly version: number;
  readonly fetchImpl?: typeof fetch;
}

export async function saveDashboard({
  dashboardId,
  document,
  version,
  fetchImpl = fetch,
}: SaveOptions): Promise<SaveResult> {
  const response = await fetchImpl(`/api/documents/dashboard/${encodeURIComponent(dashboardId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body: document, version }),
  });

  if (response.status === 409) throw new StaleSaveError();
  if (!response.ok) throw new Error(`Could not save: ${String(response.status)}`);

  const saved = (await response.json()) as { version?: number };
  // The new version, so a second save in the same session is not itself
  // stale against the first.
  return { version: saved.version ?? version + 1 };
}
