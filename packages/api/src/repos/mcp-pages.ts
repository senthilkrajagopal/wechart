import { randomUUID } from 'node:crypto';

import { type Kysely, sql } from 'kysely';

import type { Database } from '../db/schema';

/** How long a cursor works after its call was answered (T784; the lane's call, overturnable). */
export const PAGE_LIFETIME_MS = 3_600_000;

/**
 * The pages of MCP tool results too large to give whole (T784, AC-475), in
 * the metadata database, so a cursor works on whichever replica it reaches.
 */
export interface McpPageStore {
  /** Keeps a result's pages for the token whose call it was; gives their id. */
  save(tokenId: string, pages: readonly unknown[]): Promise<string>;
  /**
   * Page `index` of the result `id`, and how many it has: none where the
   * result isn't the token's, is past its lifetime, or has no such page.
   */
  load(
    tokenId: string,
    id: string,
    index: number,
  ): Promise<{ readonly page: unknown; readonly count: number } | null>;
  /** Removes the results made before `cutoff`; says how many. */
  removeBefore(cutoff: Date): Promise<number>;
}

export function mcpPageStore(db: Kysely<Database>): McpPageStore {
  return {
    async save(tokenId, pages) {
      const id = randomUUID();
      await db
        .insertInto('mcp_result_pages')
        .values({ id, token_id: tokenId, pages: JSON.stringify(pages) })
        .execute();
      return id;
    },
    async load(tokenId, id, index) {
      const row = await db
        .selectFrom('mcp_result_pages')
        .select('pages')
        .where('id', '=', id)
        .where('token_id', '=', tokenId)
        .where(sql<boolean>`made_at > now() - ${PAGE_LIFETIME_MS}::int * interval '1 millisecond'`)
        .executeTakeFirst();
      if (row === undefined) return null;
      // Kept as JSON text, which holds what `jsonb` can't (T784's review).
      const pages = JSON.parse(row.pages) as unknown[];
      if (!Number.isInteger(index) || index < 0 || index >= pages.length) return null;
      return { page: pages[index], count: pages.length };
    },
    async removeBefore(cutoff) {
      const result = await db
        .deleteFrom('mcp_result_pages')
        .where('made_at', '<', cutoff)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },
  };
}
