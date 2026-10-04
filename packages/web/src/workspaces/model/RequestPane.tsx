import { useQuery } from '@tanstack/react-query';

import { StateLine } from '../../shell/StatusIcon';
import { browserTimeZone } from '../explore/projectFolder';
import { CALC_REQUESTS_QUERY, shortName, type CalcRequestRow } from '../reviews/calcRequests';
import { proposedText } from '../reviews/reviews';

/**
 * A calculation request opened by a read-write member of the folder whose
 * model defines its cube (T384, AC-051): that model in the model editor, in
 * their workspace, with the request beside it.
 *
 * Models change only through My workspace and a proposal (T451), so opening
 * one copies the model defining its cube into the member's workspace (or opens
 * their copy already there), as "Edit in my workspace" does, and takes the
 * request up: approving the proposal that adds its measure resolves it (T385).
 * Each model file holds one cube or view (T448), so the file is the cube.
 */

/** The workspace copy's editor, with the request named in the address. */
export function requestHref(folderId: string, path: string, requestId: string): string {
  return `/explore/folders/${encodeURIComponent(folderId)}/models/${encodeURIComponent(path)}?request=${encodeURIComponent(requestId)}`;
}

/** What a response said, or its status in words. */
async function errorOf(response: Response, otherwise: string): Promise<string> {
  const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
  return typeof said === 'string' ? said : `${otherwise} (${String(response.status)}).`;
}

/**
 * Opens a request: taken up, which answers the file that defines its cube
 * now (it may have moved since the request was made); that file copied into
 * My workspace (or the copy there); and where the copy opens. Or why it
 * can't be: never a failure left unsaid.
 */
export async function openRequest(
  request: Pick<CalcRequestRow, 'id'>,
  fetchImpl: typeof fetch = fetch,
  timeZone: string = browserTimeZone(),
): Promise<{ readonly href: string } | { readonly error: string }> {
  try {
    const taken = await fetchImpl(`/api/calc-requests/${encodeURIComponent(request.id)}/take`, {
      method: 'POST',
    });
    const where = (await taken
      .clone()
      .json()
      .catch(() => null)) as { folderId?: unknown; modelPath?: unknown } | null;
    if (!taken.ok || typeof where?.folderId !== 'string' || typeof where.modelPath !== 'string')
      return { error: await errorOf(taken, 'The request could not be taken up') };
    const copied = await fetchImpl('/api/workspace/copies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'model',
        folderId: where.folderId,
        path: where.modelPath,
        timeZone,
      }),
    });
    const copy = (await copied
      .clone()
      .json()
      .catch(() => null)) as { folderId?: unknown; path?: unknown } | null;
    if (!copied.ok || typeof copy?.folderId !== 'string' || typeof copy.path !== 'string')
      return {
        error: await errorOf(copied, 'The model could not be copied into My workspace'),
      };
    return { href: requestHref(copy.folderId, copy.path, request.id) };
  } catch (failure) {
    return {
      error: `It couldn’t be opened: ${failure instanceof Error ? failure.message : String(failure)}.`,
    };
  }
}

const GROUPS: readonly [keyof CalcRequestRow['fields'], string][] = [
  ['measures', 'Metrics'],
  ['dimensions', 'Dimensions'],
  ['timeDimensions', 'Time'],
  ['filters', 'Filters'],
];

/** The request beside the model editor: what was asked, of which cube, by whom, from what. */
export function RequestPane({ requestId, now = new Date() }: { requestId: string; now?: Date }) {
  const listed = useQuery(CALC_REQUESTS_QUERY);
  const request = listed.data?.find((each) => each.id === requestId);
  return (
    <aside className="admin-pane model-request" aria-label="Calculation request">
      <h2 className="model-request__title">Calculation request</h2>
      {listed.isError ? (
        <StateLine kind="err" role="alert">
          {listed.error.message}
        </StateLine>
      ) : listed.data === undefined ? (
        <StateLine kind="run">Reading the request…</StateLine>
      ) : request === undefined ? (
        <p data-testid="pane-request-missing">
          This request isn’t one of those asked of the folders you may change.
        </p>
      ) : (
        <>
          <p className="reviews__by" data-testid="pane-request-cube">
            On {shortName(request.cube)}, asked by {request.requestedBy}
          </p>
          <p className="reviews__by">
            <time dateTime={request.requestedAt}>{proposedText(request.requestedAt, now)}</time>
          </p>
          <h3 className="reviews__label">What they need</h3>
          <p className="reviews__description" data-testid="pane-request-description">
            {request.description}
          </p>
          <h3 className="reviews__label">Fields in use</h3>
          <p className="reviews__where" data-testid="pane-request-fields">
            {GROUPS.flatMap(([group, label]) =>
              request.fields[group].length === 0
                ? []
                : [`${label}: ${request.fields[group].map(shortName).join(', ')}`],
            ).join(' · ')}
          </p>
          {request.chart === null ? null : (
            <p className="reviews__where">
              From the chart{' '}
              <a href={`/explore/charts/${encodeURIComponent(request.chart.id)}`}>
                {request.chart.title}
              </a>
            </p>
          )}
          <p className="reviews__where">
            Add the measure to this model, then propose it: approving the proposal resolves the
            request.
          </p>
        </>
      )}
    </aside>
  );
}
