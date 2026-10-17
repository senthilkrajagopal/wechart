/**
 * The data sources the SQL runner workspace's picker lists for this user
 * (T798, AC-447): `GET /api/sql/sources`, which decides who sees which by
 * the rules a run is held to. Each row's state: "on" and "off" by its
 * switch, "no-switch" for its owner's own workspace source (AC-383).
 */
export interface SqlSourceRow {
  readonly id: string;
  readonly name: string;
  /** None for Cube Store. */
  readonly driver: string | null;
  readonly cubeStore: boolean;
  readonly folderId: string;
  readonly folderPath: readonly { readonly id: string; readonly title: string }[];
  readonly inWorkspace: boolean;
  readonly runner: 'on' | 'off' | 'no-switch';
}

export const SQL_SOURCES_QUERY = {
  queryKey: ['sql-sources'] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<SqlSourceRow[]> => {
    const response = await fetch('/api/sql/sources', signal === undefined ? {} : { signal });
    if (!response.ok) {
      const said = (await response.json().catch(() => ({}))) as { error?: unknown };
      throw new Error(
        typeof said.error === 'string'
          ? said.error
          : `The data sources could not be read (${String(response.status)}).`,
      );
    }
    return (await response.json()) as SqlSourceRow[];
  },
};

/** A shared folder's path as the picker groups by it: "Shared / Sales / EMEA". */
export const placeOf = (row: Pick<SqlSourceRow, 'inWorkspace' | 'folderPath'>): string =>
  row.inWorkspace
    ? 'My workspace'
    : ['Shared', ...row.folderPath.map((folder) => folder.title)].join(' / ');

/** The runner's state as the picker says it, with its icon's kind (design 17, pin 3). */
export const STATE_OF = {
  on: { label: 'SQL runner on', icon: 'ok' },
  off: { label: 'Off', icon: 'off' },
  'no-switch': { label: 'Yours · no switch', icon: 'ok' },
} as const satisfies Record<SqlSourceRow['runner'], { label: string; icon: 'ok' | 'off' }>;
