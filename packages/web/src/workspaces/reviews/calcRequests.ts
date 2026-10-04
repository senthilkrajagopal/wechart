import { proposedText } from './reviews';

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
  /**
   * What resolved it (T385, AC-052; R63): the measures an approved proposal
   * added to its cube, by full name, from a member who took it up; whose
   * proposal, who approved it, and when. Null while it is open.
   */
  readonly resolution: {
    readonly members: readonly string[];
    readonly by: string;
    readonly approvedBy: string;
    readonly at: string;
  } | null;
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

/**
 * A resolution in words (T385, AC-052): the members that resolve it, whose
 * proposal added them, who approved it, and when.
 */
export function resolutionText(
  resolution: NonNullable<CalcRequestRow['resolution']>,
  now: Date,
): string {
  return (
    `Resolved by ${resolution.members.map(shortName).join(', ')}` +
    ` · added by ${resolution.by}, approved by ${resolution.approvedBy}` +
    ` · ${proposedText(resolution.at, now)}`
  );
}
