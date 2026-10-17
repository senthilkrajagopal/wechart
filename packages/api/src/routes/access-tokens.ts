import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { actorOf, recordIn } from '../audit/record';
import { USER } from '../auth/guard';
import { userOf } from '../auth/user';
import { mintToken } from '../mcp/tokenText';
import {
  TOKEN_SCOPES,
  type AccessToken,
  type AccessTokenStore,
  type TokenScope,
} from '../repos/access-tokens';
import type { AuditStore } from '../repos/audit';

/** The expiries a token may have, in days, 30 unless asked (AC-468; R78-1). */
export const TOKEN_DAYS = [7, 30, 90] as const;
const DEFAULT_DAYS = 30;
/** A token's name's limit, in characters, as code points (AC-430; design 18's Q2). */
export const TOKEN_NAME_LIMIT = 100;
const DAY_MS = 86_400_000;

const shown = (token: AccessToken) => ({
  id: token.id,
  name: token.name,
  scopes: token.scopes,
  createdAt: token.createdAt.toISOString(),
  expiresAt: token.expiresAt.toISOString(),
  lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
});

const isScope = (scope: unknown): scope is TokenScope =>
  typeof scope === 'string' && (TOKEN_SCOPES as readonly string[]).includes(scope);

type Asked =
  | { readonly name: string; readonly scopes: readonly TokenScope[]; readonly days: number }
  | { readonly error: string };

/** What a request to make a token asks for, or why it can't be made. */
function askedOf(body: unknown): Asked {
  const given = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const name = typeof given['name'] === 'string' ? given['name'].trim() : '';
  if (name === '') return { error: 'A token needs a name.' };
  if ([...name].length > TOKEN_NAME_LIMIT)
    return { error: `A token’s name can be at most ${TOKEN_NAME_LIMIT} characters.` };
  const scopes = given['scopes'];
  if (!Array.isArray(scopes) || scopes.length === 0)
    return { error: 'A token needs at least one scope: read.' };
  if (!scopes.every(isScope))
    return { error: 'A token’s scopes are read, workspace-edit and proposals-and-jobs only.' };
  if (!scopes.includes('read')) return { error: 'A token’s scopes always include read.' };
  const days = given['days'] ?? DEFAULT_DAYS;
  if (typeof days !== 'number' || !(TOKEN_DAYS as readonly number[]).includes(days))
    return { error: 'A token lasts 7, 30 or 90 days.' };
  // In the order the page offers them, each once.
  return { name, scopes: TOKEN_SCOPES.filter((scope) => scopes.includes(scope)), days };
}

/**
 * A user's own personal access tokens for MCP (T767, AC-430, AC-468,
 * AC-469, AC-442; design 18, screens 1 and 2): made with a name, scopes
 * and 7, 30 or 90 days, the text answered once and never cached, only its
 * digest kept; listed to their owner without it. With sign-in off, the one
 * user's (AC-479).
 */
export function registerAccessTokens(
  app: FastifyInstance,
  {
    store,
    audit,
    now,
  }: {
    readonly store: AccessTokenStore;
    readonly audit: Pick<AuditStore, 'record'> | undefined;
    readonly now: () => Date;
  },
): void {
  app.get('/api/account/tokens', USER, async (request) => {
    const user = userOf(request);
    const at = now();
    const [tokens, stopped] = await Promise.all([
      store.working(user.key, at),
      store.stopped(user.key, at),
    ]);
    return {
      tokens: tokens.map(shown),
      // "No longer working" (T768, AC-431; design 18's Q1 and Q4).
      stopped: stopped.map((token) => ({
        ...shown(token),
        state: token.state,
        stoppedAt: token.stoppedAt.toISOString(),
        revokedBy: token.revokedBy,
      })),
    };
  });

  /** The user's own token by the route's id, or the 404 already sent: another's is as none. */
  const ownOf = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = userOf(request);
    const { id } = request.params as { id: string };
    const token = await store.owned(id);
    if (token === undefined || token.owner.key !== user.key) {
      await reply.status(404).send({ error: 'You have no token with that id.' });
      return undefined;
    }
    return { user, token };
  };

  // Revoke your own (T768, AC-431, AC-442): at once, with no Undo.
  app.delete('/api/account/tokens/:id', USER, async (request, reply) => {
    const own = await ownOf(request, reply);
    if (own === undefined) return reply;
    const { user, token } = own;
    if (!(await store.revoke(token.id, { key: user.key, name: user.name }, now())))
      return reply.status(409).send({ error: 'That token already no longer works.' });
    await recordIn(
      audit,
      {
        actor: actorOf(user),
        event: 'token-revoked',
        folderId: null,
        item: { kind: 'access-token', id: token.id, title: token.name },
        // Design 18, state I: "Wren Writer’s Claude Code · laptop".
        summary: `${token.owner.name}’s ${token.name}`,
        details: { name: token.name, owner: { name: token.owner.name } },
      },
      request.log,
    );
    return reply.status(204).send();
  });

  // Remove from "No longer working" (T768, AC-431; Q1): its audit records stay.
  app.post('/api/account/tokens/:id/remove', USER, async (request, reply) => {
    const own = await ownOf(request, reply);
    if (own === undefined) return reply;
    if (!(await store.remove(own.token.id, now())))
      return reply.status(409).send({
        error:
          'Only a token listed under No longer working can be removed: revoke a working one first.',
      });
    return reply.status(204).send();
  });

  app.post('/api/account/tokens', USER, async (request, reply) => {
    const user = userOf(request);
    const asked = askedOf(request.body);
    if ('error' in asked) return reply.status(400).send({ error: asked.error });
    const at = now();
    if (await store.workingNamed(user.key, asked.name, at))
      return reply
        .status(400)
        .send({ error: `You already have a working token named “${asked.name}”.` });
    const { text, digest } = mintToken();
    const token = await store.create({
      owner: { key: user.key, name: user.name },
      name: asked.name,
      scopes: asked.scopes,
      createdAt: at,
      expiresAt: new Date(at.getTime() + asked.days * DAY_MS),
      digest,
    });
    await recordIn(
      audit,
      {
        actor: actorOf(user),
        event: 'token-made',
        folderId: null,
        item: { kind: 'access-token', id: token.id, title: token.name },
        summary: `${token.name} · ${asked.days} days`,
        details: {
          name: token.name,
          scopes: token.scopes,
          days: asked.days,
          expiresAt: token.expiresAt.toISOString(),
        },
      },
      request.log,
    );
    // Shown this once: no cache may keep it (`mcp-deployment-and-tokens.md` §4).
    return reply
      .status(201)
      .header('cache-control', 'no-store')
      .send({ token: shown(token), text });
  });
}
