import type { RequestedFields } from './RequestCalcDialog';

/**
 * The chart a request can carry (T383's review): a stored one. A chart added,
 * copied or duplicated on a dashboard being edited is a draft, version 0,
 * until the dashboard is saved, and there is no chart of its id to carry.
 */
export function requestableChartId(
  chartId: string | undefined,
  version: number | undefined,
): string | undefined {
  return chartId !== undefined && version !== undefined && version > 0 ? chartId : undefined;
}

/**
 * A calculation request sent (T383, AC-050): the chart it is asked from, its
 * cube or view, the fields it has in use and the user's description. The API
 * finds the folder whose model defines the cube, whose read-write members it
 * is shown to. Its id, or the API's reason for refusing it, thrown.
 */
export async function requestCalculation(
  asked:
    | {
        readonly chartId: string;
        readonly cube: string;
        readonly fields: RequestedFields;
        readonly description: string;
      }
    /** A change to a cube asked from a use-only copy's page, with no chart (T717, AC-283). */
    | { readonly cube: string; readonly description: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl('/api/calc-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(asked),
  });
  const body = (await response.json().catch(() => null)) as {
    id?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok || typeof body?.id !== 'string')
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : `The request couldn’t be sent (${String(response.status)}). Try again.`,
    );
  return body.id;
}
