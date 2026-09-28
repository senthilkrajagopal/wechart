import { describe, expect, it, vi } from 'vitest';

import { catchUpDelayOf, CubeClient, CubeError } from './client';

/**
 * T421, AC-334: WHEN a change is published through any API replica, THE
 * SYSTEM SHALL answer every later query for that model, through any replica
 * and on any Cube instance, from that revision or a newer one: each query
 * token names the model and the oldest revision it may be answered from, and
 * a Cube instance still catching up is waited for and asked again rather than
 * answering from an older revision.
 * `Fails when: after a publish is acknowledged, a query or the field list,
 * through the other replica or on the other Cube instance, answers from the
 * previous revision (a new member missing, or a removed one still listed); or
 * a Cube instance's 503 while it catches up reaches the user as an error.`
 *
 * The claims xcube reads (`docs/research/xcube-slice-2.md`, "Token claims"):
 * `wechartModel`, and `wechartRevision` as a positive integer. A Cube instance
 * behind that revision catches up for up to 10 s, then answers `503 Model "<m>"
 * revision <n> is not active on this instance yet` with `Retry-After: 2`.
 */
const payloadOf = (authorization: string | null) =>
  JSON.parse(
    Buffer.from(
      (authorization ?? '').replace(/^Bearer /, '').split('.')[1] ?? '',
      'base64url',
    ).toString(),
  ) as Record<string, unknown>;

function cube(
  answer: (call: number) => { status: number; body: unknown; headers?: Record<string, string> },
  revision: () => Promise<number | undefined> = async () => 7,
) {
  const tokens: Record<string, unknown>[] = [];
  const bodies: unknown[] = [];
  const delays: number[] = [];
  let calls = 0;
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    tokens.push(payloadOf(new Headers(init?.headers).get('authorization')));
    bodies.push(typeof init?.body === 'string' ? JSON.parse(init.body) : undefined);
    const { status, body, headers = {} } = answer(calls);
    calls += 1;
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    });
  });
  const client = new CubeClient({
    apiUrl: 'http://cube.invalid/cubejs-api',
    apiSecret: 'secret',
    securityContext: { tenant: 'acme' },
    fetchImpl: fetchImpl as unknown as typeof fetch,
    model: { id: 'dev', revision },
    catchUpDelayMs: (seconds) => {
      delays.push(seconds);
      return 0;
    },
  });
  return { client, tokens, bodies, delays, fetchImpl };
}

const ok = () => ({ status: 200, body: { cubes: [] } });

describe('every token names the model and the revision (T421, AC-334)', () => {
  it('on a query, the field list, a plan, a preview, a build and introspection', async () => {
    const { client, tokens } = cube(ok);

    await client.load({ measures: ['orders.count'] });
    await client.meta();
    await client.sql({ measures: ['orders.count'] });
    await client.load({ measures: ['orders.count'] }, undefined, { groups: ['sales'] });
    await client.buildPreAggregations(['orders.main']);
    await client.introspect('/v1/introspection/data-sources');

    expect(tokens).toHaveLength(6);
    for (const token of tokens)
      expect(token).toMatchObject({ wechartModel: 'dev', wechartRevision: 7 });
    // The configured context still, and a preview's own in its place.
    expect(tokens[0]).toMatchObject({ tenant: 'acme' });
    expect(tokens[3]).toMatchObject({ groups: ['sales'] });
    expect(tokens[3]).not.toHaveProperty('tenant');
  });

  it('names no revision before xcube has acknowledged one', async () => {
    const { client, tokens } = cube(ok, async () => undefined);
    await client.meta();
    expect(tokens[0]).toMatchObject({ wechartModel: 'dev' });
    expect(tokens[0]).not.toHaveProperty('wechartRevision');
  });

  /** T421's review: 0 is recorded for a model xcube holds no revision of, and xcube refuses it. */
  it('names no revision 0', async () => {
    const { client, tokens } = cube(ok, async () => 0);
    await client.meta();
    expect(tokens[0]).toMatchObject({ wechartModel: 'dev' });
    expect(tokens[0]).not.toHaveProperty('wechartRevision');
  });

  /**
   * T421's review: a build is made for the context in its selector, which
   * Cube puts in place of the token's (research `xcube-slice-2.md`: refresh
   * contexts name the model); without the model it built the mounted
   * directory's rollups.
   */
  it('builds for the model and its revision', async () => {
    const { client, bodies } = cube(ok);
    await client.buildPreAggregations(['orders.main']);
    expect(bodies[0]).toMatchObject({
      selector: {
        contexts: [
          { securityContext: { tenant: 'acme', wechartModel: 'dev', wechartRevision: 7 } },
        ],
      },
    });
  });

  it('as a user’s groups ask, with security on', async () => {
    const { client, tokens } = cube(ok);
    await client.as({ groups: ['sales'] }).meta();
    expect(tokens[0]).toMatchObject({ groups: ['sales'], wechartModel: 'dev', wechartRevision: 7 });
  });

  it('reads the revision as each request is signed: another replica’s publish is seen at once', async () => {
    let recorded = 7;
    const { client, tokens } = cube(ok, async () => recorded);
    await client.meta();
    recorded = 8;
    await client.meta();
    expect(tokens.map((token) => token['wechartRevision'])).toEqual([7, 8]);
  });

  it('can’t be named by a previewed context', async () => {
    const { client, tokens } = cube(ok);
    await client.load({ measures: ['orders.count'] }, undefined, {
      wechartModel: 'other',
      wechartRevision: 1,
    });
    expect(tokens[0]).toMatchObject({ wechartModel: 'dev', wechartRevision: 7 });
  });

  /**
   * T438 (research xcube-slice-3b.md, Gotcha 4): xcube honours its own keys
   * in a security context — a module to serve from, a service role — so a
   * previewed context loses every `xcube…` key, as it loses wechart's.
   */
  it('can’t carry xcube’s own keys either', async () => {
    const { client, tokens } = cube(ok);
    await client.load({ measures: ['orders.count'] }, undefined, {
      groups: ['sales-ro'],
      xcubeRole: 'service',
      xcubeModule: 'm0',
    });
    expect(tokens[0]!['groups']).toEqual(['sales-ro']);
    expect(Object.keys(tokens[0]!).filter((key) => key.startsWith('xcube'))).toEqual([]);
  });
});

describe('a Cube instance still catching up (T421, AC-334)', () => {
  const catchingUp = {
    status: 503,
    body: { error: 'Model "dev" revision 7 is not active on this instance yet' },
    headers: { 'retry-after': '2' },
  };

  it('is asked again after its Retry-After, and its answer is the caller’s', async () => {
    const { client, fetchImpl, delays } = cube((call) =>
      call === 0
        ? catchingUp
        : call === 1
          ? { ...catchingUp, headers: { 'retry-after': '3' } }
          : ok(),
    );
    await expect(client.load({ measures: ['orders.count'] })).resolves.toEqual({ cubes: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([2, 3]);
  });

  it('waits what it asks, up to 5 s, by default', () => {
    expect([2, 3, 30].map(catchUpDelayOf)).toEqual([2000, 3000, 5000]);
  });

  /** T421's review: introspection and the scope probes pass xcube's pin too. */
  it('is asked again on introspection and a probe, never answering its 503', async () => {
    const answers = () => cube((call) => (call === 0 ? catchingUp : ok()));
    const introspecting = answers();
    await expect(
      introspecting.client.introspect('/v1/introspection/data-sources'),
    ).resolves.toEqual({ status: 200, body: { cubes: [] } });
    expect(introspecting.fetchImpl).toHaveBeenCalledTimes(2);
    const probing = answers();
    await expect(probing.client.ask('/v1/meta', { method: 'GET' })).resolves.toEqual({
      status: 200,
      body: { cubes: [] },
    });
    expect(probing.fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('is given up after a few asks, as a 503 the web app waits out in turn (T422)', async () => {
    const { client, fetchImpl } = cube(() => catchingUp);
    const failed = await client
      .load({ measures: ['orders.count'] })
      .catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(CubeError);
    expect((failed as CubeError).status).toBe(503);
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('answers any other 503 at once, as before', async () => {
    const { client, fetchImpl } = cube(() => ({ status: 503, body: { error: 'Continue wait' } }));
    await expect(client.load({ measures: ['orders.count'] })).rejects.toBeInstanceOf(CubeError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
