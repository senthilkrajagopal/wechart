/**
 * The user's run going, as wechart's server says it (`GET
 * /api/sql-runs/going`; T535, T548, T549), and its Cancel: one run per
 * person, across the data source page's runner and every tab of the
 * workspace (AC-379, AC-452). Moved here from `SqlRunner.tsx` (T804).
 */
export interface Going {
  readonly dataSource: { readonly id: string; readonly name: string } | null;
  /** Cube Store's, which has no data source (T536). */
  readonly cubeStore?: boolean;
  readonly startedAt: string;
  /**
   * Their last run, stopped, which Cube Store runs on until `endsBy` at the
   * latest: their next waits (T548, AC-378, AC-379; R62).
   */
  readonly stopping?: true;
  /** None for one its router runs to its end (T549), or where xcube can't say. */
  readonly endsBy?: string | null;
  /** xcube can't be asked whether it has ended: held all the same (T549). */
  readonly unconfirmed?: true;
}

export const GOING_QUERY = {
  queryKey: ['sql-runs', 'going'] as const,
  queryFn: async (): Promise<Going | null> => {
    const response = await fetch('/api/sql-runs/going');
    // Not asked is not none going: what was heard last stands, so a run
    // still finishing in Cube Store isn't said ended (T548's review).
    if (!response.ok) throw new Error(`The run going wasn’t said (${String(response.status)}).`);
    return ((await response.json()) as { going: Going | null }).going;
  },
  refetchInterval: (query: { readonly state: { readonly data: Going | null | undefined } }) =>
    query.state.data == null ? false : 3_000,
};

/** AC-379, amended by R64: Cube Store offers no Cancel, and says so. */
export const NO_CANCEL = 'Cube Store can’t stop a query, so there’s no Cancel.';

/** Cancels the user's run going: why it couldn't be, or null. A 404 is one that ended meanwhile. */
export async function cancelRun(): Promise<string | null> {
  const response = await fetch('/api/sql-runs/cancel', { method: 'POST' }).catch(() => null);
  if (response !== null && (response.ok || response.status === 404)) return null;
  const said = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
  return `It couldn’t be cancelled: ${said?.error ?? 'no answer came back.'}`;
}
