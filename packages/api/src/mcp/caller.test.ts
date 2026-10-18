import { randomUUID } from 'node:crypto';

import { type AccessFolder, folderRights } from '@wechart/core';
import { afterAll, describe, expect, it } from 'vitest';

import { SINGLE_USER } from '../auth/user';
import { closeDb, getDb } from '../db/client';
import { accessTokenStore } from '../repos/access-tokens';
import { signInStore } from '../repos/sign-ins';
import { bearerAuth } from './auth';
import { mcpCaller } from './caller';
import { mintToken } from './tokenText';

/**
 * T777 (AC-471, AC-432): a token's caller on `/mcp` is its owner, with the
 * groups of the owner's latest web sign-in, so a change of groups takes
 * effect from their next sign-in; with sign-in off, it is the single user.
 * Its folders are those the web app gives a user with those groups
 * (`folderRights`, as `visibilityOf` in `server.ts` computes them).
 */
const OWNER = { key: `caller-${randomUUID()}`, name: 'Wren Caller' };
const NAME = `t777 ${OWNER.key}`;
const ADMINS = 'wechart-super-admins';

/** A shared root with one folder granted to group A and one to group B. */
const TREE: AccessFolder[] = [
  { id: 'root', parentId: null },
  { id: 'for-a', parentId: 'root', access: { readWrite: ['A'], readOnly: [] } },
  { id: 'for-b', parentId: 'root', access: { readWrite: [], readOnly: ['B'] } },
];

afterAll(async () => {
  await getDb().deleteFrom('personal_access_tokens').where('name', '=', NAME).execute();
  await getDb().deleteFrom('latest_sign_ins').where('user_key', '=', OWNER.key).execute();
  await closeDb();
});

async function ownersToken(): Promise<string> {
  const { text, digest } = mintToken();
  await accessTokenStore(getDb()).create({
    owner: OWNER,
    name: NAME,
    scopes: ['read'],
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
    digest,
  });
  return text;
}

describe('the caller of /mcp, sign-in on (T777, AC-471)', () => {
  const signIns = () => signInStore(getDb());
  const authenticate = () =>
    bearerAuth(
      accessTokenStore(getDb()),
      () => new Date(),
      mcpCaller({ security: 'oidc', superAdminGroup: ADMINS, signIns: signIns() }),
    );

  it('is the owner with the groups of their latest web sign-in, as each new sign-in changes them', async () => {
    const text = await ownersToken();
    const folders = async () => {
      const { caller } = (await authenticate()(`Bearer ${text}`)).extra;
      // The two granted folders, of what the caller may see.
      return [...folderRights(TREE, caller).keys()].filter((id) => id.startsWith('for-')).sort();
    };

    await signIns().record(OWNER.key, ['A'], new Date());
    const { caller } = (await authenticate()(`Bearer ${text}`)).extra;
    expect(caller).toEqual({ key: OWNER.key, name: OWNER.name, groups: ['A'], superAdmin: false });
    expect(await folders()).toEqual(['for-a']);

    // Signed in again without A: its folder is gone.
    await signIns().record(OWNER.key, [], new Date(Date.now() + 1000));
    expect(await folders()).toEqual([]);

    // Signed in again with B: B's folder is there.
    await signIns().record(OWNER.key, ['B'], new Date(Date.now() + 2000));
    expect(await folders()).toEqual(['for-b']);

    // With the Super-Admin group, a Super-Admin.
    await signIns().record(OWNER.key, [ADMINS], new Date(Date.now() + 3000));
    expect((await authenticate()(`Bearer ${text}`)).extra.caller.superAdmin).toBe(true);
  });

  it('has no groups where the owner has no sign-in on record', async () => {
    const caller = await mcpCaller({
      security: 'oidc',
      superAdminGroup: ADMINS,
      signIns: signIns(),
    })({ key: `never-${randomUUID()}`, name: 'Never' });
    expect(caller.groups).toEqual([]);
    expect(caller.superAdmin).toBe(false);
    expect(folderRights(TREE, caller).size).toBe(0);
  });
});

describe('the caller of /mcp, sign-in off (T777, AC-479)', () => {
  it('is the single user', async () => {
    const caller = await mcpCaller({ security: 'off', signIns: signInStore(getDb()) })({
      key: 'admin',
      name: 'admin',
    });
    expect(caller).toEqual(SINGLE_USER);
  });
});
