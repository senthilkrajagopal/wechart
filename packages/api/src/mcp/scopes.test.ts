import type { AuthInfo, JSONRPCRequest } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

import { scopeChallenge } from './scopes';

/**
 * T785 (AC-433, AC-469): a tool's scope challenge. A token with the tool's
 * scope is let through; one without it is challenged for that scope alone,
 * and the refusal is told first, so it is recorded.
 */
const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'edit_in_my_workspace', arguments: {} },
} as JSONRPCRequest;
const authOf = (scopes: string[]): AuthInfo => ({ token: 't', clientId: 'c', scopes });
const tool = { name: 'edit_in_my_workspace', scope: 'workspace-edit' as const };

describe('a tool’s scope challenge (T785, AC-433)', () => {
  it('lets a token with the scope through, telling nothing', async () => {
    const told: AuthInfo[] = [];
    const challenge = scopeChallenge(tool, async (auth) => {
      told.push(auth);
    });
    expect(
      await challenge({ request, authInfo: authOf(['read', 'workspace-edit']) }),
    ).toBeUndefined();
    expect(told).toEqual([]);
  });

  it('challenges a token without it for that scope alone, in RFC 6750’s grammar, telling the refusal first', async () => {
    const told: AuthInfo[] = [];
    const challenge = scopeChallenge(tool, async (auth) => {
      told.push(auth);
    });
    const auth = authOf(['read']);
    const answer = await challenge({ request, authInfo: auth });
    expect(answer?.scopes).toEqual(['workspace-edit']);
    // The SDK's own check, as a string: the transform unescapes a literal's `]` into `]`.
    expect(answer?.errorDescription).toMatch(
      new RegExp('^[\\u0020-\\u0021\\u0023-\\u005B\\u005D-\\u007E]+$'),
    );
    expect(answer?.errorDescription).toContain('workspace-edit');
    expect(told).toEqual([auth]);
  });

  it('leaves a request with no token to the sign-in gate', async () => {
    const challenge = scopeChallenge(tool, async () => {
      throw new Error('not told');
    });
    expect(await challenge({ request })).toBeUndefined();
  });
});
