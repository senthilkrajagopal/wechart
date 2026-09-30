import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { querySigner, type QuerySigner } from '../cube/signing';
import { startSigning, xcubeKeys } from './keys';

/**
 * T437 (AC-326): wechart pushes its query keys' public halves to xcube,
 * through xcube's admin API with the service credential, when it starts and
 * whenever they rotate: the whole set, at a version that only rises. xcube
 * holds the version (`GET …/keys`), so every replica pushes one set at one
 * version, and a changed set goes out one version above what xcube holds.
 * A rotation pushes the current and the next key, signs with the next only
 * once that push is answered, and drops the current once its tokens have
 * expired. A `409 stale_keys` is not retried with the old set (research
 * `xcube-slice-4.md`, "PUT …/keys and GET …/keys").
 */
const pem = () =>
  generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  }) as string;
const signer = (): Promise<QuerySigner> => querySigner({ privateKeyPem: pem(), issuer: 'wechart' });

const URL_OF_KEYS = 'http://xcube.test/cubejs-api/v1/semantic/models/m/keys';

interface Held {
  version: number;
  issuer: string | null;
  keys: { kid: string; kty: string; n: string; e: string; alg: string; use: string }[];
}
interface Sent {
  method: string;
  url: string;
  auth: string;
  body?: { version: number; issuer: string; keys: Record<string, unknown>[] };
}

/**
 * A stub xcube's keys routes, as slice 4 answers them: `GET` gives the set it
 * holds or `404 no_keys`; `PUT` takes a higher version, answers `unchanged`
 * for the same set at the same version, and `409 stale_keys` or `conflict`
 * with the set it holds otherwise. `before` answers a PUT in its place, once.
 */
function stubXcube(held?: Held) {
  const state = { held };
  const sent: Sent[] = [];
  let before: ((body: NonNullable<Sent['body']>) => Response | undefined) | undefined;
  const heldAnswer = () => ({
    model: 'm',
    version: state.held!.version,
    issuer: state.held!.issuer,
    kids: state.held!.keys.map((key) => key.kid),
  });
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const auth = String((init?.headers as Record<string, string>)['authorization']);
    if (method === 'GET') {
      sent.push({ method, url, auth });
      return state.held === undefined
        ? Response.json({ error: 'no keys', code: 'no_keys' }, { status: 404 })
        : Response.json({ model: 'm', ...state.held });
    }
    const body = JSON.parse(String(init?.body)) as NonNullable<Sent['body']>;
    sent.push({ method, url, auth, body });
    const instead = before?.(body);
    before = undefined;
    if (instead !== undefined) return instead;
    const same =
      state.held !== undefined &&
      state.held.issuer === body.issuer &&
      JSON.stringify(state.held.keys.map((key) => key.kid).sort()) ===
        JSON.stringify(body.keys.map((key) => String(key['kid'])).sort());
    if (state.held !== undefined && body.version < state.held.version)
      return Response.json(
        { error: 'stale', code: 'stale_keys', ...heldAnswer() },
        { status: 409 },
      );
    if (state.held !== undefined && body.version === state.held.version && !same)
      return Response.json(
        { error: 'conflict', code: 'conflict', ...heldAnswer() },
        { status: 409 },
      );
    const applied = !(state.held !== undefined && body.version === state.held.version);
    state.held = {
      version: body.version,
      issuer: body.issuer,
      keys: body.keys as Held['keys'],
    };
    return Response.json({ ...heldAnswer(), applied });
  }) as typeof fetch;
  return {
    state,
    sent,
    fetchImpl,
    /** Answer the next PUT with this instead, as another replica's push would. */
    beforeNextPut(answer: (body: NonNullable<Sent['body']>) => Response | undefined) {
      before = answer;
    },
  };
}

const keysOf = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof xcubeKeys>[0]> = {}) =>
  xcubeKeys({
    cubeApiUrl: 'http://xcube.test/cubejs-api/',
    model: 'm',
    issuer: 'wechart',
    token: async () => 'service-token',
    fetch: fetchImpl,
    ...extra,
  });

const puts = (sent: readonly Sent[]) => sent.filter(({ method }) => method === 'PUT');

describe('pushing the query keys to xcube (T437, AC-326)', () => {
  it('pushes the whole set with the service token, one version above what xcube holds, and only when the set changes', async () => {
    const xcube = stubXcube();
    const keys = keysOf(xcube.fetchImpl);
    const [first, second] = [await signer(), await signer()];

    await expect(keys.push([first.publicJwk])).resolves.toEqual({ version: 1, applied: true });
    await expect(keys.push([first.publicJwk])).resolves.toEqual({ version: 1, applied: false });
    await expect(keys.push([first.publicJwk, second.publicJwk])).resolves.toEqual({
      version: 2,
      applied: true,
    });

    expect(xcube.sent.every(({ url }) => url === URL_OF_KEYS)).toBe(true);
    expect(xcube.sent.every(({ auth }) => auth === 'Bearer service-token')).toBe(true);
    // The unchanged set isn't pushed again.
    expect(
      puts(xcube.sent).map(({ body }) => [
        body!.version,
        body!.issuer,
        body!.keys.map((key) => key['kid']),
      ]),
    ).toEqual([
      [1, 'wechart', [first.kid]],
      [2, 'wechart', [first.kid, second.kid]],
    ]);
    // Never a private member.
    for (const { body } of puts(xcube.sent))
      for (const key of body!.keys)
        expect(Object.keys(key).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
  });

  it('replaces a set xcube holds without its key, one version above it', async () => {
    const [old, ours] = [await signer(), await signer()];
    const xcube = stubXcube({
      version: 4,
      issuer: 'wechart',
      keys: [{ ...(old.publicJwk as Held['keys'][number]) }],
    });
    await expect(keysOf(xcube.fetchImpl).push([ours.publicJwk])).resolves.toEqual({
      version: 5,
      applied: true,
    });
    expect(xcube.state.held?.keys.map((key) => key.kid)).toEqual([ours.kid]);
  });

  it('never pushes an older set over a newer one another replica pushed meanwhile, and takes one that holds its key', async () => {
    const [ours, theirs] = [await signer(), await signer()];
    for (const [code, kids, outcome] of [
      ['stale_keys', [ours.kid, theirs.kid], 'taken'],
      ['stale_keys', [theirs.kid], 'refused'],
      ['conflict', [theirs.kid], 'refused'],
    ] as const) {
      const xcube = stubXcube();
      xcube.beforeNextPut(() =>
        Response.json(
          { error: 'newer', code, model: 'm', version: 9, issuer: 'wechart', kids },
          { status: 409 },
        ),
      );
      const pushed = keysOf(xcube.fetchImpl).push([ours.publicJwk]);
      if (outcome === 'taken')
        await expect(pushed, code).resolves.toEqual({ version: 9, applied: false });
      else
        await expect(pushed, code).rejects.toThrow(
          'xcube holds a newer key set (version 9) without this API’s signing key: its query tokens would be refused.',
        );
      // Not pushed again with the older set.
      expect(puts(xcube.sent), code).toHaveLength(1);
    }
  });

  it('says what xcube refused, without retrying', async () => {
    const xcube = stubXcube();
    xcube.beforeNextPut(() =>
      Response.json({ error: 'A key is a service key', code: 'service_kid' }, { status: 400 }),
    );
    await expect(keysOf(xcube.fetchImpl).push([(await signer()).publicJwk])).rejects.toThrow(
      'xcube refused the query keys: 400 A key is a service key',
    );
    expect(puts(xcube.sent)).toHaveLength(1);
  });

  it('rotates: signs with the next key only once both are pushed, and drops the current once its tokens have expired', async () => {
    const [current, next] = [await signer(), await signer()];
    const xcube = stubXcube({
      version: 1,
      issuer: 'wechart',
      keys: [{ ...(current.publicJwk as Held['keys'][number]) }],
    });
    const later: { run: () => void; after: number }[] = [];
    // The push held unanswered until released.
    let release: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      release = resolve;
    });
    let putAsked = false;
    const held = (async (url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putAsked = true;
        await answered;
      }
      return xcube.fetchImpl(url, init);
    }) as typeof fetch;
    const signing = startSigning({
      current,
      next,
      keys: keysOf(held),
      schedule: (run, after) => later.push({ run, after }),
      warn: () => undefined,
    });
    // Nothing is signed RS256 before the push is answered: not while it is asked.
    await expect.poll(() => putAsked).toBe(true);
    expect(signing.signer()).toBeUndefined();
    release();
    await signing.ready;
    expect(signing.signer()?.kid).toBe(next.kid);
    expect(puts(xcube.sent).map(({ body }) => body!.keys.map((key) => key['kid']))).toEqual([
      [current.kid, next.kid],
    ]);

    // Once every token signed with the current key has expired: an hour and a minute.
    expect(later.map(({ after }) => after)).toEqual([61 * 60 * 1000]);
    later[0]!.run();
    await expect.poll(() => puts(xcube.sent).length).toBe(2);
    expect(
      puts(xcube.sent).map(({ body }) => [body!.version, body!.keys.map((key) => key['kid'])]),
    ).toEqual([
      [2, [current.kid, next.kid]],
      [3, [next.kid]],
    ]);
    expect(signing.signer()?.kid).toBe(next.kid);
  });

  it('pushes nothing over a set that holds its key beside others: another replica may be rotating (T437’s review)', async () => {
    const [current, next] = [await signer(), await signer()];
    const xcube = stubXcube({
      version: 2,
      issuer: 'wechart',
      keys: [
        { ...(current.publicJwk as Held['keys'][number]) },
        { ...(next.publicJwk as Held['keys'][number]) },
      ],
    });
    // An API still configured with the current key alone, started while the
    // others rotate: their next key stays, and so do their tokens.
    const signing = startSigning({
      current,
      keys: keysOf(xcube.fetchImpl),
      warn: () => undefined,
    });
    await signing.ready;
    expect(signing.signer()?.kid).toBe(current.kid);
    expect(puts(xcube.sent)).toHaveLength(0);
    expect(xcube.state.held?.keys.map((key) => key.kid)).toEqual([current.kid, next.kid]);
  });

  it('waits for an xcube that can’t be reached yet, as the start waits for its credential keys', async () => {
    const xcube = stubXcube();
    const waits: string[] = [];
    let asks = 0;
    const flaky = (async (url: string, init?: RequestInit) => {
      asks += 1;
      if (asks === 1) throw new TypeError('fetch failed');
      if (asks === 2) return Response.json({ error: 'starting' }, { status: 503 });
      return xcube.fetchImpl(url, init);
    }) as typeof fetch;
    await expect(
      keysOf(flaky, { waitMs: 1, onWait: (why) => waits.push(why) }).push([
        (await signer()).publicJwk,
      ]),
    ).resolves.toEqual({ version: 1, applied: true });
    expect(waits).toEqual([
      'xcube can’t be reached: fetch failed',
      'xcube answered 503 while starting',
    ]);
  });

  it('signs with its one key once it is pushed', async () => {
    const xcube = stubXcube();
    const only = await signer();
    const signing = startSigning({
      current: only,
      keys: keysOf(xcube.fetchImpl),
      warn: () => undefined,
    });
    await signing.ready;
    expect(signing.signer()?.kid).toBe(only.kid);
  });
});
