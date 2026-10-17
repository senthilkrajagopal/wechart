import { randomUUID } from 'node:crypto';

import type { Kysely } from 'kysely';

import type { Database } from '../db/schema';

/** The three scopes a token may have, read always among them (AC-469; R78-2). */
export const TOKEN_SCOPES = ['read', 'workspace-edit', 'proposals-and-jobs'] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** A token as its owner's list shows it: never its text, nor its digest (AC-430). */
export interface AccessToken {
  readonly id: string;
  readonly name: string;
  readonly scopes: readonly TokenScope[];
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastUsedAt: Date | null;
}

export interface NewAccessToken {
  readonly owner: { readonly key: string; readonly name: string };
  readonly name: string;
  readonly scopes: readonly TokenScope[];
  /** When it was made; now unless given, so its expiry can count from it. */
  readonly createdAt?: Date;
  readonly expiresAt: Date;
  /** The SHA-256 of its text (`mcp/tokenText.ts`). */
  readonly digest: Buffer;
}

const tokenOf = (row: {
  id: string;
  name: string;
  scopes: string[];
  created_at: Date;
  expires_at: Date;
  last_used_at: Date | null;
}): AccessToken => ({
  id: row.id,
  name: row.name,
  scopes: row.scopes as TokenScope[],
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  lastUsedAt: row.last_used_at,
});

const LISTED = ['id', 'name', 'scopes', 'created_at', 'expires_at', 'last_used_at'] as const;

/**
 * Personal access tokens (T767, AC-430): kept as a digest; a working one is
 * neither revoked nor past its expiry.
 */
export function accessTokenStore(db: Kysely<Database>) {
  const working = (ownerKey: string, now: Date) =>
    db
      .selectFrom('personal_access_tokens')
      .where('owner_key', '=', ownerKey)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now);

  return {
    async create(token: NewAccessToken): Promise<AccessToken> {
      const row = await db
        .insertInto('personal_access_tokens')
        .values({
          id: randomUUID(),
          owner_key: token.owner.key,
          owner_name: token.owner.name,
          name: token.name,
          scopes: [...token.scopes],
          digest: token.digest,
          ...(token.createdAt === undefined ? {} : { created_at: token.createdAt }),
          expires_at: token.expiresAt,
        })
        .returning(LISTED)
        .executeTakeFirstOrThrow();
      return tokenOf(row);
    },

    /** An owner's working tokens, newest first. */
    async working(ownerKey: string, now: Date): Promise<AccessToken[]> {
      const rows = await working(ownerKey, now)
        .select(LISTED)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map(tokenOf);
    },

    /** Whether one of an owner's working tokens has this name (AC-430). */
    async workingNamed(ownerKey: string, name: string, now: Date): Promise<boolean> {
      const row = await working(ownerKey, now)
        .select('id')
        .where('name', '=', name)
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}

export type AccessTokenStore = ReturnType<typeof accessTokenStore>;
