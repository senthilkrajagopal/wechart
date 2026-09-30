import type { JWK } from 'jose';

import type { QuerySigner } from '../cube/signing';
import { XcubeError } from './client';

/**
 * wechart's query keys, pushed to xcube (T437, AC-326; research
 * `xcube-slice-4.md`, "PUT …/keys and GET …/keys"): the public halves, never
 * a private one, as the whole set, at a version that only rises, through
 * xcube's admin API with the service credential. xcube never asks wechart for
 * them (AC-327).
 *
 * xcube holds the version: each push reads the set it holds, sends nothing
 * when that will do, and otherwise sends this set one version above it. So
 * replicas with one set push it at one version (a second push of it is
 * xcube's `unchanged`), and no version is kept in wechart's own database,
 * which could fall behind xcube's.
 */
export interface XcubeKeys {
  /**
   * These keys held, at start: nothing sent when xcube holds every one of
   * them, beside others or not, since another replica may be rotating and
   * signing with a key held beside them (T437's review); else exactly these.
   * `applied` false when nothing was sent.
   */
  ensure(keys: readonly JWK[]): Promise<{ version: number; applied: boolean }>;
  /** Exactly these keys held: a rotation's drop. Nothing sent when xcube holds just these. */
  push(keys: readonly JWK[]): Promise<{ version: number; applied: boolean }>;
}

/** What xcube holds for the model: its set's version, issuer and keys. */
interface HeldSet {
  readonly version: number;
  readonly issuer: string | null;
  readonly keys: readonly { readonly kid?: unknown; readonly n?: unknown; readonly e?: unknown }[];
}

/** One key's identity: its id and public numbers. */
const identityOf = (key: { kid?: unknown; n?: unknown; e?: unknown }) =>
  JSON.stringify([key.kid, key.n, key.e]);

/** Whether xcube holds every one of these keys under this issuer: `exactly` these, or among others. */
function holds(held: HeldSet, issuer: string, keys: readonly JWK[], exactly: boolean): boolean {
  if (held.issuer !== issuer) return false;
  if (exactly && held.keys.length !== keys.length) return false;
  const theirs = new Set(held.keys.map(identityOf));
  return keys.every((key) => theirs.has(identityOf(key)));
}

export function xcubeKeys({
  cubeApiUrl,
  model,
  issuer,
  token,
  fetch: send = fetch,
  timeoutMs = 15_000,
  waitMs = 2_000,
  onWait,
}: {
  readonly cubeApiUrl: string;
  readonly model: string;
  /** Pushed with the set: xcube then requires it on every token. */
  readonly issuer: string;
  /** The service credential's token (T420). */
  readonly token: () => Promise<string>;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** How long to wait before asking an xcube that can't be reached, or is starting, again. */
  readonly waitMs?: number;
  readonly onWait?: (why: string) => void;
}): XcubeKeys {
  const url = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/models/${encodeURIComponent(model)}/keys`;
  const wait = (why: string) => {
    onWait?.(why);
    return new Promise((resolve) => setTimeout(resolve, waitMs));
  };

  /**
   * One call, waited for while xcube can't be reached or is starting (a 5xx),
   * as the start waits for its credential keys (T455). Any other answer is
   * the caller's.
   */
  const ask = async (
    init: RequestInit,
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    for (;;) {
      let response: Response;
      try {
        response = await send(url, {
          ...init,
          headers: {
            authorization: `Bearer ${await token()}`,
            ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (failure) {
        await wait(`xcube can’t be reached: ${String((failure as Error).message ?? failure)}`);
        continue;
      }
      if (response.status >= 500) {
        await wait(`xcube answered ${String(response.status)} while starting`);
        continue;
      }
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: response.status, body };
    }
  };

  const refused = (status: number, body: Record<string, unknown>) =>
    new XcubeError(
      status,
      typeof body['code'] === 'string' ? body['code'] : undefined,
      `xcube refused the query keys: ${String(status)}${typeof body['error'] === 'string' ? ` ${body['error']}` : ''}`,
    );

  const pushed = async (
    keys: readonly JWK[],
    exactly: boolean,
  ): Promise<{ version: number; applied: boolean }> => {
    const read = await ask({ method: 'GET' });
    let held: HeldSet | undefined;
    if (read.status === 200)
      held = {
        version: Number(read.body['version']),
        issuer: typeof read.body['issuer'] === 'string' ? read.body['issuer'] : null,
        keys: Array.isArray(read.body['keys']) ? (read.body['keys'] as HeldSet['keys']) : [],
      };
    else if (!(read.status === 404 && read.body['code'] === 'no_keys'))
      throw refused(read.status, read.body);
    if (held !== undefined && holds(held, issuer, keys, exactly))
      return { version: held.version, applied: false };

    const version = (held?.version ?? 0) + 1;
    const put = await ask({
      method: 'PUT',
      body: JSON.stringify({
        version,
        issuer,
        // The public members only, as xcube stores them.
        keys: keys.map(({ kty, kid, n, e }) => ({ kty, kid, n, e, alg: 'RS256', use: 'sig' })),
      }),
    });
    if (put.status === 200) return { version, applied: put.body['applied'] !== false };
    /**
     * Another replica pushed meanwhile (`stale_keys`, a higher version;
     * `conflict`, another set at this one): never pushed over with this set
     * again. One that holds every key of ours will do, since our tokens
     * verify under it; one without them would refuse our tokens, so the
     * start stops rather than undo the other's push.
     */
    if (
      put.status === 409 &&
      (put.body['code'] === 'stale_keys' || put.body['code'] === 'conflict')
    ) {
      const stored = Number(put.body['version']);
      const kids = Array.isArray(put.body['kids']) ? (put.body['kids'] as unknown[]) : [];
      if (put.body['issuer'] === issuer && keys.every((key) => kids.includes(key.kid)))
        return { version: stored, applied: false };
      throw new XcubeError(
        409,
        String(put.body['code']),
        `xcube holds a newer key set (version ${String(stored)}) without this API’s signing key: its query tokens would be refused.`,
      );
    }
    throw refused(put.status, put.body);
  };

  return {
    ensure: (keys) => pushed(keys, false),
    push: (keys) => pushed(keys, true),
  };
}

/** Every token signed with a dropped key has expired by then: an hour, and a minute's grace. */
const TOKEN_LIFE_MS = 61 * 60 * 1000;

/**
 * Signing from the start (T437, AC-326): the key set pushed, then tokens
 * signed RS256 under it. With a next key, the rotation: the current and the
 * next pushed together, the next signed with once that push is answered, and
 * the current dropped once every token signed with it has expired.
 */
export function startSigning({
  current,
  next,
  keys,
  schedule = (run, after) => {
    setTimeout(run, after).unref();
  },
  warn,
}: {
  readonly current: QuerySigner;
  readonly next?: QuerySigner;
  readonly keys: XcubeKeys;
  readonly schedule?: (run: () => void, afterMs: number) => void;
  readonly warn: (message: string, error: unknown) => void;
}): { readonly signer: () => QuerySigner | undefined; readonly ready: Promise<void> } {
  let active: QuerySigner | undefined;
  const ready = (async () => {
    if (next === undefined) {
      await keys.ensure([current.publicJwk]);
      active = current;
      return;
    }
    await keys.ensure([current.publicJwk, next.publicJwk]);
    active = next;
    schedule(() => {
      keys.push([next.publicJwk]).catch((error: unknown) => {
        warn('could not drop the previous query key from xcube', error);
      });
    }, TOKEN_LIFE_MS);
  })();
  return { signer: () => active, ready };
}
