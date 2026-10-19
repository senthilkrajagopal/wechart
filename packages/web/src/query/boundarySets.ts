/**
 * The Map's custom boundary sets (T979, AC-628), through the wechart API:
 * those a chart's folder is offered along its path, and one set's GeoJSON,
 * which the map registers before it draws (`setBoundarySetLoader`).
 */
export interface OfferedBoundarySet {
  readonly id: string;
  readonly name: string;
  readonly keyProperty: string;
  readonly regions: number;
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
    throw new Error(typeof said === 'string' ? said : `The request failed: ${String(response.status)}`);
  }
  return (await response.json()) as T;
}

/** The sets a chart in this folder is offered; none asked without a folder. */
export function boundarySetsQueryOf(folderId: string | undefined) {
  return {
    queryKey: ['boundary-sets', folderId ?? null] as const,
    queryFn: async (): Promise<readonly OfferedBoundarySet[]> =>
      folderId === undefined
        ? []
        : (
            await json<{ sets: OfferedBoundarySet[] }>(
              `/api/boundary-sets?folder=${encodeURIComponent(folderId)}`,
            )
          ).sets,
    enabled: folderId !== undefined,
  };
}

/** One set's key and GeoJSON. */
export const boundarySetGeoJson = (id: string) =>
  json<{ keyProperty: string; geojson: Record<string, unknown> }>(
    `/api/boundary-sets/${encodeURIComponent(id)}/geojson`,
  );

/** A set uploaded into My workspace, to go to `targetFolderId` (T979). */
export async function uploadBoundarySet(set: {
  readonly name: string;
  readonly keyProperty: string;
  readonly geojson: unknown;
  readonly targetFolderId: string;
}): Promise<OfferedBoundarySet> {
  const response = await fetch('/api/boundary-sets', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(set),
  });
  const body = (await response.json().catch(() => null)) as
    | (OfferedBoundarySet & { error?: string })
    | null;
  if (!response.ok) throw new Error(body?.error ?? `The upload failed: ${String(response.status)}`);
  return body!;
}

/** Its proposal to its folder; the proposal's id. */
export async function proposeBoundarySet(id: string): Promise<string> {
  const response = await fetch('/api/proposals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'boundary-set', id }),
  });
  const body = (await response.json().catch(() => null)) as { id?: string; error?: string } | null;
  if (!response.ok || body?.id === undefined)
    throw new Error(body?.error ?? `The proposal failed: ${String(response.status)}`);
  return body.id;
}
