import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';
import type { ImageStore } from '../server';

/**
 * Image tiles' images (AC-063), in the metadata database beside the dashboard
 * they were added to. What is stored has already passed `imageProblem`; this
 * only keeps it and gives it back.
 */
export function imageStore(db: Kysely<Database>): ImageStore {
  return {
    async add({ id, dashboardId, contentType, bytes }) {
      await db
        .insertInto('images')
        .values({
          id,
          dashboard_id: dashboardId,
          content_type: contentType,
          bytes,
          size: bytes.length,
        })
        .execute();
    },
    async get(id) {
      const row = await db
        .selectFrom('images')
        .select(['content_type', 'bytes'])
        .where('id', '=', id)
        .executeTakeFirst();
      return row === undefined ? undefined : { contentType: row.content_type, bytes: row.bytes };
    },
  };
}
