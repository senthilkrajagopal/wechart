/**
 * Calculation requests as `GET /api/calc-requests` lists them (T383,
 * AC-050): those asked of the folders the user may change, newest first. A
 * chart only its asker can open is named to no one else; a field of a cube in
 * a folder the user can't see is counted, not named.
 */
export interface CalcRequestRow {
  readonly id: string;
  readonly chart: { readonly id: string; readonly title: string } | null;
  /** The chart's cube or view, by its full published name. */
  readonly cube: string;
  /** The folder whose model defines it, and its path below Shared. */
  readonly folderId: string;
  readonly folderPath: readonly string[];
  /** The model file defining it, in that folder. */
  readonly modelPath: string;
  readonly fields: {
    readonly measures: readonly string[];
    readonly dimensions: readonly string[];
    readonly timeDimensions: readonly string[];
    readonly filters: readonly string[];
  };
  readonly unseenFields: number;
  readonly description: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly status: 'open' | 'resolved';
}

export const CALC_REQUESTS_QUERY = {
  queryKey: ['calc-requests'] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<readonly CalcRequestRow[]> => {
    const response = await fetch('/api/calc-requests', signal === undefined ? {} : { signal });
    const body = (await response.json().catch(() => null)) as {
      requests?: unknown;
      error?: unknown;
    } | null;
    if (!response.ok || !Array.isArray(body?.requests))
      throw new Error(
        typeof body?.error === 'string'
          ? body.error
          : `The calculation requests could not be read (${String(response.status)}).`,
      );
    return body.requests as CalcRequestRow[];
  },
};

/** A full published name as its short one: without its folder's prefix (`fsales__`). */
export const shortName = (name: string): string => name.replace(/^f[a-z0-9]{1,40}__/, '');
