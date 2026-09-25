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
let respond: (req: IncomingMessage) => { status: number; body: string } = () => ({
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
      const { status, body: responseBody } = respond(req);
      res.writeHead(status, { 'content-type': 'application/json' });
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
    await cube.meta({ wechartDraft: 'd1' });

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
