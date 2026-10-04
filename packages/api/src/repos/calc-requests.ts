import type { Kysely, Selectable } from 'kysely';

import type { CalcRequestFields, CalcRequestTable, Database } from '../db/schema';

/**
 * Calculation requests (T383, AC-050; F6): a calculation the quick
 * calculations menu can't express, asked of the read-write members of the
 * folder whose model defines the chart's cube. Each holds the chart it came
 * from, the fields the chart had in use, the requester's words, and the
 * folder and model file it is asked of.
 */
export interface CalcRequest {
  readonly id: string;
  readonly chartId: string;
  /** The chart's cube or view, by its full published name. */
  readonly cube: string;
  readonly folderId: string;
  /** The model file defining the cube, by its path in that folder. */
  readonly modelPath: string;
  readonly fields: CalcRequestFields;
  readonly description: string;
  readonly requestedBy: { readonly key: string; readonly name: string };
  readonly requestedAt: Date;
  readonly status: 'open' | 'resolved';
}

export type NewCalcRequest = Omit<CalcRequest, 'id' | 'requestedAt' | 'status'>;

export interface CalcRequestStore {
  record(request: NewCalcRequest): Promise<CalcRequest>;
  /** The requests asked of any of these folders, newest first. */
  inFolders(folderIds: readonly string[]): Promise<readonly CalcRequest[]>;
  /** Every request, newest first: for one no folder tree holds back. */
  all(): Promise<readonly CalcRequest[]>;
  /** How many open requests are asked of any of these folders; of every one, for `'all'` (R60). */
  openCount(folderIds: readonly string[] | 'all'): Promise<number>;
  get(id: string): Promise<CalcRequest | undefined>;
}

const requestOf = (row: Selectable<CalcRequestTable>): CalcRequest => ({
  id: row.id,
  chartId: row.chart_id,
  cube: row.cube,
  folderId: row.folder_id,
  modelPath: row.model_path,
  fields: row.fields,
  description: row.description,
  requestedBy: { key: row.requested_by_key, name: row.requested_by_name },
  requestedAt: row.requested_at,
  status: row.status,
});

/** An id as the database reads one, so a malformed one finds nothing rather than failing. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function calcRequestStore(db: Kysely<Database>): CalcRequestStore {
  return {
    async record(request) {
      const row = await db
        .insertInto('calc_requests')
        .values({
          chart_id: request.chartId,
          cube: request.cube,
          folder_id: request.folderId,
          model_path: request.modelPath,
          fields: JSON.stringify(request.fields),
          description: request.description,
          requested_by_key: request.requestedBy.key,
          requested_by_name: request.requestedBy.name,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return requestOf(row);
    },
    async inFolders(folderIds) {
      if (folderIds.length === 0) return [];
      const rows = await db
        .selectFrom('calc_requests')
        .selectAll()
        .where('folder_id', 'in', folderIds)
        .orderBy('requested_at', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map(requestOf);
    },
    async openCount(folderIds) {
      if (folderIds !== 'all' && folderIds.length === 0) return 0;
      let query = db
        .selectFrom('calc_requests')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('status', '=', 'open');
      if (folderIds !== 'all') query = query.where('folder_id', 'in', folderIds);
      return Number((await query.executeTakeFirstOrThrow()).count);
    },
    async all() {
      const rows = await db
        .selectFrom('calc_requests')
        .selectAll()
        .orderBy('requested_at', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map(requestOf);
    },
    async get(id) {
      if (!UUID.test(id)) return undefined;
      const row = await db
        .selectFrom('calc_requests')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row === undefined ? undefined : requestOf(row);
    },
  };
}
