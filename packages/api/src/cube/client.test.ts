import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CubeClient, CubeError } from './client';

/**
 * AC-008: WHEN wechart queries Cube, THE SYSTEM SHALL attach the configured
 * phase-1 security context to every request.
 *
 * AC-007 (the half testable here): no response wechart returns to the browser
 * contains the Cube API secret. The browser-side half — that no request from
 * the page targets the Cube host — is demonstrated at T024, when the browser
 * first needs metadata; asserting it now would pass vacuously, because the app
 * makes no data requests yet.
 *
 * A stub Cube stands in for the real one: these tests are about what wechart
 * sends and returns, not about Cube's own behaviour, and a stub can be asked
 * for a 500 or a malformed body on demand. The real Cube arrives in
 * docker-compose at T010/T024, where metadata correctness is the point.
 */
interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

let server: Server;
let baseUrl: string;
let received: RecordedRequest[] = [];
let respond: (req: IncomingMessage) => {
  status: number;
  body: string;
  headers?: Record<string, string>;
} = () => ({
  status: 200,
  body: JSON.stringify({ cubes: [] }),
});

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += String(chunk)));
    req.on('end', () => {
      received.push({
        url: req.url ?? '',
        method: req.method ?? '',
        headers: req.headers,
        body,
      });
      const { status, body: responseBody, headers = {} } = respond(req);
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(responseBody);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

function client(overrides: { apiSecret?: string } = {}): CubeClient {
  received = [];
  respond = () => ({ status: 200, body: JSON.stringify({ cubes: [] }) });
  return new CubeClient({
    apiUrl: baseUrl,
    apiSecret: overrides.apiSecret ?? 'test-secret-do-not-leak',
    securityContext: { tenant: 'acme', role: 'analyst' },
  });
}

describe('security context (AC-008)', () => {
  it('attaches it to a metadata request', async () => {
    await client().meta();

    expect(received).toHaveLength(1);
    expect(payloadOf(received[0]!)).toMatchObject({ tenant: 'acme', role: 'analyst' });
  });

  it('attaches it to a query request', async () => {
    await client().load({ measures: ['Orders.count'] });

    expect(received).toHaveLength(1);
    expect(payloadOf(received[0]!)).toMatchObject({ tenant: 'acme', role: 'analyst' });
  });

  it('attaches it to every request, not just the first', async () => {
    const cube = client();
    await cube.meta();
    await cube.load({ measures: ['Orders.count'] });
    await cube.meta();

    expect(received).toHaveLength(3);
    for (const request of received) {
      expect(payloadOf(request)).toMatchObject({ tenant: 'acme', role: 'analyst' });
    }
  });

  /**
   * T322 (AC-008, phase 2): WHILE security is enabled, … also attach the
   * signed-in user's AD groups, so the model's access policies apply by group.
   */
  it('attaches a user’s groups beside the configured context, exactly as given', async () => {
    const cube = client().as({ groups: ['sales-rw', 'g02'] });
    await cube.meta();
    await cube.load({ measures: ['Orders.count'] });
    await cube.sql({ measures: ['Orders.count'] });

    expect(received).toHaveLength(3);
    for (const request of received) {
      const payload = payloadOf(request);
      expect({
        tenant: payload['tenant'],
        role: payload['role'],
        groups: payload['groups'],
      }).toEqual({
        tenant: 'acme',
        role: 'analyst',
        groups: ['sales-rw', 'g02'],
      });
    }
  });

  it('gives the user’s groups in place of any the configuration names, and none to the client it came from', async () => {
    const configured = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: { tenant: 'acme', groups: ['everyone'] },
    });
    received = [];
    await configured.as({ groups: [] }).meta();
    await configured.meta();
    expect(payloadOf(received[0]!)['groups']).toEqual([]);
    expect(payloadOf(received[1]!)['groups']).toEqual(['everyone']);
  });

  it('signs the token with the configured secret, so Cube can verify it', async () => {
    await client({ apiSecret: 'a-specific-secret' }).meta();

    const token = bearerOf(received[0]!);
    const [header, payload, signature] = token.split('.');
    expect(header).toBeTruthy();
    expect(payload).toBeTruthy();
    // A signed JWT, not an unsigned "alg: none" token.
    expect(signature).toBeTruthy();
    expect(signature).not.toBe('');
  });
});

/**
 * T275 / AC-250: THE SYSTEM SHALL grant Cube's `introspection` scope only to
 * the short-lived tokens its API signs to browse a data source and generate
 * cubes. The scope is Cube's to grant, from the claim (infra/cube/cube.js);
 * this is the claim, on those tokens and no others.
 */
describe('the introspection token (AC-250)', () => {
  it('carries wechart’s introspection claim, for a minute, beside the security context', async () => {
    const cube = client();
    respond = () => ({ status: 200, body: JSON.stringify({ dataSources: [] }) });

    const answer = await cube.introspect('/v1/introspection/data-sources');

    expect(answer).toEqual({ status: 200, body: { dataSources: [] } });
    const payload = payloadOf(received[0]!);
    expect(payload).toMatchObject({ tenant: 'acme', role: 'analyst', wechartIntrospection: true });
    expect(Number(payload['exp']) - Number(payload['iat'])).toBe(60);
    expect(received[0]!.url).toBe('/v1/introspection/data-sources');
  });

  it('is on no other request’s token', async () => {
    const cube = client();
    await cube.meta();
    await cube.load({ measures: ['orders.count'] });
    await cube.load({ measures: ['orders.count'] }, undefined, { groups: ['sales'] });

    for (const request of received)
      expect(payloadOf(request)).not.toHaveProperty('wechartIntrospection');
  });

  it('asks only Cube’s introspection routes', async () => {
    await expect(client().introspect('/v1/load')).rejects.toThrow(
      'Only Cube’s introspection routes are asked with an introspection token.',
    );
    expect(received).toHaveLength(0);
  });

  it('passes Cube’s refusals back as they are, for the API to turn into its own', async () => {
    const cube = client();
    respond = () => ({
      status: 404,
      body: JSON.stringify({ error: "The 'default' data source has no table public.ghost" }),
    });

    expect(
      await cube.introspect('/v1/introspection/data-sources/default/columns', {
        method: 'POST',
        body: JSON.stringify({ tables: [{ schema: 'public', table: 'ghost' }] }),
      }),
    ).toEqual({
      status: 404,
      body: { error: "The 'default' data source has no table public.ghost" },
    });
    expect(received[0]!.headers['content-type']).toBe('application/json');
  });
});

/**
 * T420 / AC-326, AC-250: WHEN wechart calls Cube on its own behalf (the jobs
 * API, introspection, the whole model's field list), THE SYSTEM SHALL use the
 * service credential, never a user's token; and no user's token SHALL be
 * granted `introspection`. xcube's slice 4 gives a service token `jobs` and
 * `introspection` only, and the whole field list is xcube's own
 * `GET …/meta?extended=true` (`xcube-slice-4.md`, "What wechart calls today").
 */
describe('the service credential, on wechart’s own calls (AC-326, AC-250)', () => {
  const serviced = () => {
    received = [];
    respond = () => ({ status: 200, body: JSON.stringify({ cubes: [] }) });
    return new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: { tenant: 'acme' },
      model: { id: 'e2e', revision: async () => 7 },
      service: async () => 'the-service-token',
    });
  };
  const bearerOf = (request: RecordedRequest) => String(request.headers['authorization']);

  it('builds, and reads builds, with it', async () => {
    const cube = serviced();
    await cube.buildPreAggregations(['orders.daily']);
    await cube.jobStatuses(['job-1']);

    expect(received.map(bearerOf)).toEqual([
      'Bearer the-service-token',
      'Bearer the-service-token',
    ]);
    // Its builds name the model the token is for (research, "The service token").
    expect(JSON.parse(received[0]!.body)).toMatchObject({
      selector: { contexts: [{ securityContext: { wechartModel: 'e2e' } }] },
    });
  });

  it('browses a data source with it, signing no introspection token of its own', async () => {
    const cube = serviced();
    await cube.introspect('/v1/introspection/data-sources');

    // The service token itself, not a minute's HS256 token with the claim.
    expect(received.map(bearerOf)).toEqual(['Bearer the-service-token']);
  });

  it('reads the field list from the revision last published, which xcube’s own meta can’t yet say', async () => {
    const cube = serviced();
    await cube.metaExtended();

    // AC-334: never answered from before a publish (see `metaExtended`).
    expect(received[0]!.url).toBe('/v1/meta?extended=true');
    expect(payloadOf(received[0]!)).toMatchObject({ wechartModel: 'e2e', wechartRevision: 7 });
  });

  /**
   * T436 (AC-320, AC-334): under xcube's folder gate a token sees only the
   * folders its groups reach, so the whole model's field list, Jobs',
   * Schedules' and a publish's, is xcube's own `GET …/meta`, unfiltered, with
   * the service credential, from the revision last recorded or a newer one
   * (research xcube-meta-revision-and-bindings.md, "GET …/meta").
   */
  it('reads the whole model’s field list from xcube’s own meta, with it, at the revision recorded', async () => {
    const cube = serviced();
    await cube.modelMeta();

    expect(received.map((request) => [request.url, bearerOf(request)])).toEqual([
      ['/v1/semantic/models/e2e/meta?extended=true&revision=7', 'Bearer the-service-token'],
    ]);
  });

  it('asks xcube’s own meta for no revision before one is recorded, and Cube’s without xcube', async () => {
    // No xcube: Cube's own (`client()` starts the record afresh).
    const plain = client();
    await new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: { tenant: 'acme' },
      model: { id: 'e2e', revision: async () => undefined },
      service: async () => 'the-service-token',
    }).modelMeta();
    await plain.modelMeta();

    expect(received.map((request) => request.url)).toEqual([
      '/v1/semantic/models/e2e/meta?extended=true',
      '/v1/meta?extended=true',
    ]);
  });

  it('queries for wechart’s users with their own tokens still', async () => {
    const cube = serviced();
    await cube.load({ measures: ['orders.count'] });
    await cube.metaExtended();

    for (const request of received) expect(bearerOf(request)).not.toContain('the-service-token');
  });
});

/**
 * T437 (AC-326, AC-008): with a query signer, every token for a query is
 * RS256 under its key, security on or off, and carries only the groups, the
 * model and the revision: nothing else of the configured context or the user.
 */
describe('RS256 query tokens (T437, AC-326)', () => {
  const signing = async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { querySigner } = await import('./signing');
    const signer = await querySigner({
      privateKeyPem: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string,
      issuer: 'wechart',
    });
    received = [];
    respond = () => ({ status: 200, body: JSON.stringify({ cubes: [] }) });
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: { tenant: 'acme', groups: ['configured'] },
      model: { id: 'e2e', revision: async () => 7 },
      service: async () => 'the-service-token',
      signer: () => signer,
    });
    return { cube, signer };
  };
  /** The groups some access policy or folder names (AC-008, AC-326). */
  const named = async () => new Set(['g-sales', 'g-ops']);
  const headerOf = (request: RecordedRequest) =>
    JSON.parse(
      Buffer.from(bearerOf(request).split('.')[0]!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

  it('signs a user’s query RS256 with the key’s kid, carrying their groups, the model and revision, and nothing else', async () => {
    const { cube, signer } = await signing();
    await cube.as({ groups: ['g-sales', 'g-ops'] }).load({ measures: ['orders.count'] });
    await cube.meta();

    expect(headerOf(received[0]!)).toEqual({ alg: 'RS256', kid: signer.kid, typ: 'JWT' });
    const { iat, exp, ...rest } = payloadOf(received[0]!);
    expect(rest).toEqual({
      aud: 'xcube',
      iss: 'wechart',
      role: 'user',
      groups: ['g-sales', 'g-ops'],
      wechartModel: 'e2e',
      wechartRevision: 7,
    });
    expect(Number(exp) - Number(iat)).toBeLessThanOrEqual(3600);
    // Security off: the configured context's groups, and nothing else of it.
    expect(payloadOf(received[1]!)['groups']).toEqual(['configured']);
    expect(payloadOf(received[1]!)).not.toHaveProperty('tenant');
  });

  it('previews as the chosen groups alone', async () => {
    const { cube } = await signing();
    await cube.as({ groups: ['g-sales'] }).load({ measures: ['orders.count'] }, undefined, {
      groups: ['g-hr'],
      tenant: 'other',
      wechartModel: 'forged',
    });
    const payload = payloadOf(received[0]!);
    expect(payload['groups']).toEqual(['g-hr']);
    expect(payload['wechartModel']).toBe('e2e');
    expect(payload).not.toHaveProperty('tenant');
  });

  it('carries only the user’s groups that some policy or folder names, in the order they have them (AC-008)', async () => {
    const { cube } = await signing();
    await cube
      .as({ groups: ['g-ops', 'g-unnamed', 'g-sales', 'wechart-internal'] }, named)
      .load({ measures: ['orders.count'] });
    await cube.as({ groups: ['g-unnamed'] }, named).meta();
    // A preview is as exactly the groups chosen for it (AC-166).
    await cube
      .as({ groups: ['g-ops'] }, named)
      .load({ measures: ['orders.count'] }, undefined, { groups: ['g-hr', 'g-unnamed'] });

    expect(payloadOf(received[0]!)['groups']).toEqual(['g-ops', 'g-sales']);
    // None named: none carried, not the configured context's.
    expect(payloadOf(received[1]!)['groups']).toEqual([]);
    expect(payloadOf(received[2]!)['groups']).toEqual(['g-hr', 'g-unnamed']);
  });

  it('trims a user’s groups in the tokens signed before the keys are pushed too (AC-008)', async () => {
    received = [];
    respond = () => ({ status: 200, body: JSON.stringify({ cubes: [] }) });
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: { tenant: 'acme' },
      signer: () => undefined,
    });
    await cube.as({ groups: ['g-sales', 'g-unnamed'] }, async () => new Set(['g-sales'])).meta();
    expect(headerOf(received[0]!)).toMatchObject({ alg: 'HS256' });
    expect(payloadOf(received[0]!)['groups']).toEqual(['g-sales']);
  });

  it('keeps wechart’s own calls on the service credential', async () => {
    const { cube } = await signing();
    await cube.buildPreAggregations(['orders.daily']);
    await cube.introspect('/v1/introspection/data-sources');
    expect(received.map(bearerOf)).toEqual(['the-service-token', 'the-service-token']);
  });
});

/**
 * T347 (AC-323): a workspace item's previews name its overlay in the signed
 * token, `wechartOverlay`, and only the tokens wechart signs for them do
 * (research `xcube-slice-5.md`, "Query tokens"). A preview never names it
 * itself, and wechart's own calls never carry it.
 */
describe('an overlay in a query token (T347, AC-323)', () => {
  const signed = async () => {
    const { generateKeyPairSync } = await import('node:crypto');
    const { querySigner } = await import('./signing');
    return querySigner({
      privateKeyPem: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string,
      issuer: 'wechart',
    });
  };

  /** As xcube answers a preview: saying which overlay, at which version, answered. */
  const fromOverlay = (request: IncomingMessage) => {
    const token = String(request.headers.authorization ?? '').replace(/^Bearer /, '');
    // The service credential here is no JWT: it names no overlay.
    const payload = Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8');
    const overlay =
      payload === ''
        ? undefined
        : (JSON.parse(payload) as Record<string, unknown>)['wechartOverlay'];
    return typeof overlay === 'string' ? { 'x-xcube-overlay': `${overlay}@1` } : undefined;
  };

  it('names it in a user’s RS256 token, set last, and in no preview’s own claims or service call', async () => {
    const signer = await signed();
    received = [];
    respond = (request) => ({
      status: 200,
      body: JSON.stringify({ cubes: [] }),
      ...(fromOverlay(request) === undefined ? {} : { headers: fromOverlay(request)! }),
    });
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: {},
      model: { id: 'e2e', revision: async () => 7 },
      service: async () => 'the-service-token',
      signer: () => signer,
    });
    const user = cube.as({ groups: ['g-sales'] });
    await user.inOverlay('ws-1').load({ measures: ['orders.count'] });
    await user.inOverlay('ws-1').meta();
    // A preview's context can't name one for itself.
    await user.load({ measures: ['orders.count'] }, undefined, {
      groups: ['g-hr'],
      wechartOverlay: 'p-other',
      xcubeOverlay: 'p-other',
    });
    await user.inOverlay('ws-1').buildPreAggregations(['orders.daily']);
    // The client it came from names none.
    await user.load({ measures: ['orders.count'] });

    const { iat: _iat, exp: _exp, ...rest } = payloadOf(received[0]!);
    void [_iat, _exp];
    expect(rest).toEqual({
      aud: 'xcube',
      iss: 'wechart',
      role: 'user',
      groups: ['g-sales'],
      wechartModel: 'e2e',
      wechartRevision: 7,
      wechartOverlay: 'ws-1',
    });
    expect(payloadOf(received[1]!)['wechartOverlay']).toBe('ws-1');
    expect(payloadOf(received[2]!)).not.toHaveProperty('wechartOverlay');
    expect(payloadOf(received[2]!)).not.toHaveProperty('xcubeOverlay');
    expect(bearerOf(received[3]!)).toBe('the-service-token');
    expect(payloadOf(received[4]!)).not.toHaveProperty('wechartOverlay');
  });

  it('names it in an HS256 token too, after the configured context, so nothing configured names another', async () => {
    received = [];
    respond = (request) => ({
      status: 200,
      body: JSON.stringify({ cubes: [] }),
      headers: fromOverlay(request) ?? {},
    });
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: { wechartOverlay: 'configured' },
    });
    await cube.inOverlay('ws-2').meta();
    expect(payloadOf(received[0]!)['wechartOverlay']).toBe('ws-2');
  });

  it('asks again while Cube compiles it, and pushes it again once, when xcube says it is gone', async () => {
    received = [];
    const answers = [
      { status: 503, body: JSON.stringify({ error: 'Cube is busy compiling; try again' }) },
      {
        status: 503,
        body: JSON.stringify({
          error: 'The overlay this request was pinned to is no longer compiled here; try again',
        }),
      },
      {
        status: 410,
        body: JSON.stringify({
          error: 'Overlay "ws-3" of model "e2e" is gone: it expired, or was dropped',
        }),
      },
      {
        status: 200,
        body: JSON.stringify({ data: [{ n: 7 }] }),
        headers: { 'x-xcube-overlay': 'ws-3@2' },
      },
    ];
    respond = () => answers.shift()!;
    let pushed = 0;
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: {},
      catchUpDelayMs: () => 0,
    });

    const answer = await cube
      .inOverlay('ws-3', async () => {
        pushed += 1;
      })
      .load({ measures: ['orders.count'] });

    expect(answer).toEqual({ data: [{ n: 7 }] });
    expect(pushed).toBe(1);
    expect(received).toHaveLength(4);
  });

  /**
   * An instance from before overlays ignores the claim and answers from the
   * published model, with 200 (research `xcube-slice-5.md`, Gotcha 2): an
   * answer that doesn't say it came from the overlay is never passed on as
   * the preview's.
   */
  it('refuses an answer that doesn’t say it came from the overlay', async () => {
    received = [];
    respond = () => ({ status: 200, body: JSON.stringify({ data: [{ n: 42 }] }) });
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: {},
    });
    const failure = await cube
      .inOverlay('ws-5')
      .load({ measures: ['orders.count'] })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(CubeError);
    expect((failure as CubeError).status).toBe(503);
    // In words for a workspace's preview and a proposal's alike (T440).
    expect((failure as CubeError).message).toBe(
      'Cube answered this preview without the changes it previews, so it isn’t shown. Try again.',
    );
    // Without an overlay, the same answer is the answer.
    expect(await cube.load({ measures: ['orders.count'] })).toEqual({ data: [{ n: 42 }] });
  });

  /**
   * An instance not yet told of the latest push answers the version before
   * it, for up to 30 s with notices down (research `xcube-slice-5.md`,
   * Gotcha 17; "check `x-xcube-overlay` equals `<id>@<version>`"): asked
   * again, then refused, never passed on as the preview of what was saved.
   */
  it('asks again while an instance answers an older version of it, and refuses one that stays older', async () => {
    received = [];
    const versions = ['ws-6@3', 'ws-6@4'];
    respond = () => ({
      status: 200,
      body: JSON.stringify({ data: [{ n: 4 }] }),
      headers: { 'x-xcube-overlay': versions.shift() ?? 'ws-6@3' },
    });
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: {},
      catchUpDelayMs: () => 0,
    });
    expect(await cube.inOverlay('ws-6', undefined, 4).load({ measures: ['orders.count'] })).toEqual(
      { data: [{ n: 4 }] },
    );
    expect(received).toHaveLength(2);

    received = [];
    respond = () => ({
      status: 200,
      body: JSON.stringify({ data: [{ n: 3 }] }),
      headers: { 'x-xcube-overlay': 'ws-6@3' },
    });
    const failure = await cube
      .inOverlay('ws-6', undefined, 4)
      .load({ measures: ['orders.count'] })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(CubeError);
    expect((failure as CubeError).status).toBe(503);
    expect(received).toHaveLength(3);
    // A newer one is newer than what this server saved: as current, or more.
    respond = () => ({
      status: 200,
      body: JSON.stringify({ data: [{ n: 5 }] }),
      headers: { 'x-xcube-overlay': 'ws-6@5' },
    });
    expect(await cube.inOverlay('ws-6', undefined, 4).load({ measures: ['orders.count'] })).toEqual(
      { data: [{ n: 5 }] },
    );
  });

  it('says it is gone when pushing it again doesn’t bring it back', async () => {
    received = [];
    respond = () => ({
      status: 410,
      body: JSON.stringify({
        error: 'Overlay "ws-4" of model "e2e" is gone: it expired, or was dropped',
      }),
    });
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: {},
      catchUpDelayMs: () => 0,
    });
    const failure = await cube
      .inOverlay('ws-4', async () => undefined)
      .load({ measures: ['orders.count'] })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(CubeError);
    expect((failure as CubeError).status).toBe(410);
    expect(received).toHaveLength(2);
  });
});

describe('the secret never leaves the service (AC-007)', () => {
  it('is not in the metadata result wechart hands back', async () => {
    const result = await client({ apiSecret: 'super-secret-value' }).meta();
    expect(JSON.stringify(result)).not.toContain('super-secret-value');
  });

  it('is not in a query result wechart hands back', async () => {
    const result = await client({ apiSecret: 'super-secret-value' }).load({
      measures: ['Orders.count'],
    });
    expect(JSON.stringify(result)).not.toContain('super-secret-value');
  });

  it('is not in the error wechart raises when Cube fails', async () => {
    const cube = client({ apiSecret: 'super-secret-value' });
    respond = () => ({ status: 500, body: JSON.stringify({ error: 'Internal error' }) });

    const error = await cube.meta().then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(CubeError);
    const serialised = `${(error as Error).message}\n${(error as Error).stack ?? ''}`;
    expect(serialised).not.toContain('super-secret-value');
  });

  it('keeps Cube’s own message on the error, so a tile can show it', async () => {
    const cube = client();
    respond = () => ({
      status: 400,
      body: JSON.stringify({ error: "Can't find join path between Orders and Suppliers" }),
    });

    const error = await cube.load({ measures: ['Orders.count'] }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(CubeError);
    expect((error as CubeError).message).toContain('join path');
    expect((error as CubeError).status).toBe(400);
  });
});

/**
 * T422, AC-319: a Cube instance stopping mid-request drops the socket. That is
 * Cube being away, not wechart failing: 503, which the web app waits out and
 * asks again, where a 500 would be reported at once (research/cube/ha-topology.md §5).
 */
describe('a Cube that can’t be reached (T422, AC-319)', () => {
  it('is a CubeError with status 503, saying Cube could not be reached', async () => {
    const gone = new CubeClient({
      // Nothing listens on port 1.
      apiUrl: 'http://127.0.0.1:1/cubejs-api',
      apiSecret: 'test-secret-do-not-leak',
      securityContext: {},
    });

    const error = await gone.load({ measures: ['Orders.count'] }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(CubeError);
    expect((error as CubeError).status).toBe(503);
    expect((error as CubeError).message).toBe('Cube could not be reached. Try again.');
  });

  it('stays a cancellation when the caller aborted', async () => {
    const cube = new CubeClient({
      apiUrl: baseUrl,
      apiSecret: 'test-secret-do-not-leak',
      securityContext: {},
      fetchImpl: () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    });

    const error = await cube.load({ measures: ['Orders.count'] }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).not.toBeInstanceOf(CubeError);
    expect((error as Error).name).toBe('AbortError');
  });
});

function bearerOf(request: RecordedRequest): string {
  const header = request.headers['authorization'];
  expect(header, 'every Cube request carries an Authorization header').toBeTruthy();
  return String(header).replace(/^Bearer /, '');
}

/** The security context travels as the JWT payload Cube reads. */
function payloadOf(request: RecordedRequest): Record<string, unknown> {
  const payload = bearerOf(request).split('.')[1];
  expect(payload).toBeTruthy();
  return JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as Record<string, unknown>;
}
