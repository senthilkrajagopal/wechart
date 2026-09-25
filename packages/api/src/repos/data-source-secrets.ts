import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';
import type { Envelope } from '../secrets/crypto';

/**
 * Where data sources' sealed credentials are kept (T332, AC-298): one envelope
 * per data source, in its own table. This stores and returns envelopes only;
 * sealing and opening are `secrets/crypto.ts`'s, inside the API.
 */
export interface DataSourceSecretStore {
  put(dataSourceId: string, envelope: Envelope): Promise<void>;
  get(dataSourceId: string): Promise<Envelope | undefined>;
}

export function dataSourceSecrets(db: Kysely<Database>): DataSourceSecretStore {
  return {
    async put(dataSourceId, envelope) {
      const row = {
        scheme: envelope.scheme,
        key_id: envelope.keyId,
        iv: envelope.iv,
        ciphertext: envelope.ciphertext,
        tag: envelope.tag,
      };
      await db
        .insertInto('data_source_secrets')
        .values({ data_source_id: dataSourceId, ...row })
        .onConflict((conflict) =>
          conflict.column('data_source_id').doUpdateSet({ ...row, updated_at: new Date() }),
        )
        .execute();
    },
    async get(dataSourceId) {
      const row = await db
        .selectFrom('data_source_secrets')
        .select(['scheme', 'key_id', 'iv', 'ciphertext', 'tag'])
        .where('data_source_id', '=', dataSourceId)
        .executeTakeFirst();
      if (row === undefined) return undefined;
      if (row.scheme !== 1) throw new Error(`unknown credential scheme ${String(row.scheme)}`);
      return { scheme: 1, keyId: row.key_id, iv: row.iv, ciphertext: row.ciphertext, tag: row.tag };
    },
  };
}
