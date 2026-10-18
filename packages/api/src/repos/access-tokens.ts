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

/** A token that no longer works, under its owner's "No longer working" (T768, AC-431). */
export interface StoppedAccessToken extends AccessToken {
  readonly state: 'revoked' | 'expired';
  /** When it was revoked, or when it expired. */
  readonly stoppedAt: Date;
  /** Who revoked it; none for one that expired. Its key tells a list "by you". */
  readonly revokedBy: Revoker | null;
}

/** Who revoked a token. */
export interface Revoker {
  readonly key: string;
  readonly name: string;
}

/** A token on Security's list of everyone's (T772, AC-470): with its owner and its state. */
export interface AnyonesAccessToken extends AccessToken {
  readonly owner: { readonly key: string; readonly name: string };
  readonly state: 'working' | 'revoked' | 'expired';
  /** When it was revoked, or when it expired; none while it works. */
  readonly stoppedAt: Date | null;
  readonly revokedBy: Revoker | null;
}

/** Who revoked it, from its row; a row from before keys were kept names no one. */
const revokerOf = (row: {
  revoked_at: Date | null;
  revoked_by_key: string | null;
  revoked_by_name: string | null;
}): Revoker | null =>
  row.revoked_at === null
    ? null
    : { key: row.revoked_by_key ?? '', name: row.revoked_by_name ?? 'Someone' };

/** Whom a token belongs to, for a revoke's audit record. */
export interface TokenOwned {
  readonly id: string;
  readonly name: string;
  readonly owner: { readonly key: string; readonly name: string };
}

/** A working token presented on `/mcp`: whose it is and what it may do (T776). */
export interface PresentedToken {
  readonly id: string;
  /** Its owner's name for it, which the audit trail gives every MCP call (T781, AC-478). */
  readonly name: string;
  readonly scopes: readonly TokenScope[];
  readonly expiresAt: Date;
  readonly owner: { readonly key: string; readonly name: string };
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Personal access tokens (T767, AC-430): kept as a digest; a working one is
 * neither revoked nor past its expiry. One that stopped stays, unusable,
 * under its owner's "No longer working" until removed from there (T768,
 * AC-431).
 */
export function accessTokenStore(db: Kysely<Database>) {
  const working = (ownerKey: string, now: Date) =>
    db
      .selectFrom('personal_access_tokens')
      .where('owner_key', '=', ownerKey)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now);

  return {
    /**
     * The working token whose text has this digest, with its owner (T776,
     * AC-435, AC-431): none for a digest no token has, or a token revoked
     * or past its expiry at `now`. Found by the digest's unique index.
     */
    async presented(digest: Buffer, now: Date): Promise<PresentedToken | undefined> {
      const row = await db
        .selectFrom('personal_access_tokens')
        .select(['id', 'name', 'scopes', 'expires_at', 'owner_key', 'owner_name'])
        .where('digest', '=', digest)
        .where('revoked_at', 'is', null)
        .where('expires_at', '>', now)
        .executeTakeFirst();
      return row === undefined
        ? undefined
        : {
            id: row.id,
            name: row.name,
            scopes: row.scopes as TokenScope[],
            expiresAt: row.expires_at,
            owner: { key: row.owner_key, name: row.owner_name },
          };
    },

    /** Records a token's use at `at`, its list's Last used (AC-430). */
    async used(id: string, at: Date): Promise<void> {
      await db
        .updateTable('personal_access_tokens')
        .set({ last_used_at: at })
        .where('id', '=', id)
        .execute();
    },

    /** A token's owner and name, by id; none for an id no token has. */
    async owned(id: string): Promise<TokenOwned | undefined> {
      if (!UUID.test(id)) return undefined;
      const row = await db
        .selectFrom('personal_access_tokens')
        .select(['id', 'name', 'owner_key', 'owner_name'])
        .where('id', '=', id)
        .executeTakeFirst();
      return row === undefined
        ? undefined
        : { id: row.id, name: row.name, owner: { key: row.owner_key, name: row.owner_name } };
    },

    /** Stops a working token now, by `by`; false where it no longer worked. */
    async revoke(id: string, by: { key: string; name: string }, now: Date): Promise<boolean> {
      if (!UUID.test(id)) return false;
      const done = await db
        .updateTable('personal_access_tokens')
        .set({ revoked_at: now, revoked_by_key: by.key, revoked_by_name: by.name })
        .where('id', '=', id)
        .where('revoked_at', 'is', null)
        .where('expires_at', '>', now)
        .executeTakeFirst();
      return done.numUpdatedRows > 0n;
    },

    /** An owner's tokens that no longer work and aren't removed, the latest to stop first. */
    async stopped(ownerKey: string, now: Date): Promise<StoppedAccessToken[]> {
      const rows = await db
        .selectFrom('personal_access_tokens')
        .select([...LISTED, 'revoked_at', 'revoked_by_key', 'revoked_by_name'])
        .where('owner_key', '=', ownerKey)
        .where('removed_at', 'is', null)
        .where((where) =>
          where.or([where('revoked_at', 'is not', null), where('expires_at', '<=', now)]),
        )
        .execute();
      return rows
        .map((row): StoppedAccessToken => ({
          ...tokenOf(row),
          state: row.revoked_at === null ? 'expired' : 'revoked',
          stoppedAt: row.revoked_at ?? row.expires_at,
          revokedBy: revokerOf(row),
        }))
        .sort((a, b) => b.stoppedAt.getTime() - a.stoppedAt.getTime() || (a.id < b.id ? 1 : -1));
    },

    /** Takes a stopped token off its owner's list; false for a working one, or one already removed. */
    async remove(id: string, now: Date): Promise<boolean> {
      if (!UUID.test(id)) return false;
      const done = await db
        .updateTable('personal_access_tokens')
        .set({ removed_at: now })
        .where('id', '=', id)
        .where('removed_at', 'is', null)
        .where((where) =>
          where.or([where('revoked_at', 'is not', null), where('expires_at', '<=', now)]),
        )
        .executeTakeFirst();
      return done.numUpdatedRows > 0n;
    },

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

    /**
     * Every user's tokens, working and stopped, newest first (T772, AC-470).
     * One its owner removed from "No longer working" is left out, as it is
     * from their list; its audit records stay.
     */
    async everyone(now: Date): Promise<AnyonesAccessToken[]> {
      const rows = await db
        .selectFrom('personal_access_tokens')
        .select([
          ...LISTED,
          'owner_key',
          'owner_name',
          'revoked_at',
          'revoked_by_key',
          'revoked_by_name',
        ])
        .where('removed_at', 'is', null)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .execute();
      return rows.map((row): AnyonesAccessToken => {
        const state =
          row.revoked_at !== null ? 'revoked' : row.expires_at <= now ? 'expired' : 'working';
        return {
          ...tokenOf(row),
          owner: { key: row.owner_key, name: row.owner_name },
          state,
          stoppedAt: state === 'working' ? null : (row.revoked_at ?? row.expires_at),
          revokedBy: revokerOf(row),
        };
      });
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
