import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

import { ConfigError } from '../config';
import { XCUBE_PUBLIC_KEY, xcubePublicKeyOf } from './xcube-key';

/**
 * T333, AC-324: IF wechart's API starts without xcube's public key, or xcube
 * starts without its private key or with one that can't decrypt a sample
 * credential, THEN THE SYSTEM SHALL refuse to start and say which key is
 * missing or can't decrypt.
 * `Fails when: either service serves requests without its key, or exits
 * without naming the key problem.`
 *
 * wechart's half. xcube's own check, of its private key and a sample
 * credential, is xcube's, on the Cube side. AC-298's "anything wechart holds"
 * is checked here for configuration: no private key in it.
 */
const REPO = new URL('../../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, REPO), 'utf8');
const DEV_JWK = read('infra/xcube/dev-credential-key.pub.jwk').trim();
const DEV = JSON.parse(DEV_JWK) as { x: string; kid: string };

const withKey = (value: unknown) => ({
  [XCUBE_PUBLIC_KEY]: typeof value === 'string' ? value : JSON.stringify(value),
});
const refusal = (value: unknown) => {
  try {
    xcubePublicKeyOf(value === undefined ? {} : withKey(value));
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return (error as Error).message;
  }
  throw new Error(`${JSON.stringify(value)} was taken`);
};

describe('xcube’s public key, read at start (T333, AC-324)', () => {
  it('takes the development public key, by its id', () => {
    expect(xcubePublicKeyOf(withKey(DEV_JWK))).toEqual({ kid: DEV.kid, x: DEV.x });
  });

  it('refuses to start without one, naming the setting', () => {
    expect(refusal(undefined)).toMatch(/^WECHART_XCUBE_PUBLIC_KEY is not set/);
    expect(refusal('')).toMatch(/^WECHART_XCUBE_PUBLIC_KEY is not set/);
  });

  it('refuses one that isn’t a key HPKE can seal to, naming the setting and the problem', () => {
    const cases: [unknown, RegExp][] = [
      ['not json', /isn’t a JSON Web Key/],
      [[DEV], /isn’t a JSON Web Key/],
      // Another curve, or another kind of key.
      [{ ...DEV, crv: 'Ed25519' }, /isn’t an X25519 public key/],
      [{ kty: 'EC', crv: 'P-256', x: DEV.x, y: DEV.x, kid: DEV.kid }, /isn’t an X25519 public key/],
      // Not 32 bytes.
      [{ ...DEV, kty: 'OKP', crv: 'X25519', x: DEV.x.slice(0, 20) }, /"x" that isn’t 32 bytes/],
      [{ kty: 'OKP', crv: 'X25519', kid: DEV.kid }, /"x" that isn’t 32 bytes/],
      // The same bytes, written another way: its thumbprint, taken over the
      // text, would name it by an id the browser and xcube don't
      // (research x25519-public-key-checks.md). And padded.
      [
        { kty: 'OKP', crv: 'X25519', kid: DEV.kid, x: `${DEV.x.slice(0, -1)}d` },
        /"x" that isn’t 32 bytes/,
      ],
      [{ kty: 'OKP', crv: 'X25519', kid: DEV.kid, x: `${DEV.x}=` }, /"x" that isn’t 32 bytes/],
      // No kind at all.
      [{ x: DEV.x, kid: DEV.kid }, /isn’t an X25519 public key \(kty "OKP", crv "X25519"\)/],
      // An id other than its thumbprint, or none.
      [
        { kty: 'OKP', crv: 'X25519', x: DEV.x, kid: 'k1' },
        /"kid" that isn’t the key’s RFC 7638 thumbprint/,
      ],
      [{ kty: 'OKP', crv: 'X25519', x: DEV.x }, /"kid" that isn’t the key’s RFC 7638 thumbprint/],
    ];
    for (const [value, problem] of cases) {
      const message = refusal(value);
      expect(message, JSON.stringify(value)).toMatch(/^WECHART_XCUBE_PUBLIC_KEY /);
      expect(message, JSON.stringify(value)).toMatch(problem);
    }
  });

  it('refuses a point no key can be agreed with, which HPKE can’t seal to', () => {
    // The all-zero point is of low order: every agreement with it is zero.
    const zero = Buffer.alloc(32).toString('base64url');
    const kid = xcubeThumbprint(zero);
    expect(refusal({ kty: 'OKP', crv: 'X25519', x: zero, kid })).toMatch(
      /^WECHART_XCUBE_PUBLIC_KEY .*HPKE can’t seal to it/,
    );
  });

  it('refuses a private key: wechart is given xcube’s public key only (AC-298)', () => {
    const { privateKey } = generateKeyPairSync('x25519');
    const jwk = privateKey.export({ format: 'jwk' });
    const message = refusal({ ...jwk, kid: xcubeThumbprint(jwk.x!) });
    expect(message).toMatch(/^WECHART_XCUBE_PUBLIC_KEY holds a private key/);
    // The key itself is never repeated.
    expect(message).not.toContain(jwk.d);
  });
});

describe('the API’s start-up (T333, AC-324)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.resetModules();
  });

  it('throws naming the setting, and never listens, without the key', async () => {
    const port = await freePort();
    process.env = { ...saved, CUBE_API_SECRET: 'x', PORT: String(port) };
    delete process.env[XCUBE_PUBLIC_KEY];
    vi.resetModules();

    await expect(import('../main')).rejects.toThrow(/WECHART_XCUBE_PUBLIC_KEY is not set/);
    expect(await listening(port)).toBe(false);
  });

  it('throws naming the setting, and never listens, with an unusable key', async () => {
    const port = await freePort();
    process.env = {
      ...saved,
      CUBE_API_SECRET: 'x',
      PORT: String(port),
      [XCUBE_PUBLIC_KEY]: JSON.stringify({ ...DEV, kid: 'k1' }),
    };
    vi.resetModules();

    await expect(import('../main')).rejects.toThrow(
      /WECHART_XCUBE_PUBLIC_KEY .*RFC 7638 thumbprint/,
    );
    expect(await listening(port)).toBe(false);
  });
});

describe('where the development key pair lives (T333, AC-324, AC-298)', () => {
  const pem = read('infra/xcube/dev-credential-key.pem');
  const privateJwk = createPrivateKey(pem).export({ format: 'jwk' });
  const d = privateJwk.d!;
  /**
   * Bytes as base64 or base64url would show them inside anything larger, at
   * each of the three alignments (as T332's dump test reads a canary): the
   * characters that depend on these bytes alone, the edges left off.
   */
  const encodedIn = (bytes: Buffer) =>
    [0, 1, 2].flatMap((shift) => {
      const encoded = Buffer.concat([Buffer.alloc(shift), bytes, Buffer.alloc(3)]);
      const inner = (text: string) => text.slice(shift === 0 ? 0 : 4, -8);
      return [inner(encoded.toString('base64')), inner(encoded.toString('base64url'))];
    });
  // The private key as it could be written anywhere: its JWK value, its bytes
  // in hex and in base64, its PEM body, and the whole PEM file in base64, as a
  // Kubernetes Secret's `data` or a template's `b64enc` would hold it.
  const forms = [
    d,
    Buffer.from(d, 'base64url').toString('hex'),
    ...encodedIn(Buffer.from(d, 'base64url')),
    ...pem
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('-----'))
      .map((line) => line.trim()),
    ...encodedIn(Buffer.from(pem)),
  ];

  it('gives wechart the public half of xcube’s development key', () => {
    const derived = createPublicKey(pem).export({ format: 'jwk' });
    expect(derived.x).toBe(DEV.x);
    expect(xcubePublicKeyOf(withKey(DEV_JWK)).kid).toBe(DEV.kid);
  });

  /**
   * Every file in the repository, tracked or to be added (T333's review): the
   * private key in none of them but its own, and named, to be read or mounted,
   * only where xcube's compose setup and its own directory are, by this test,
   * and in the docs that describe it.
   */
  it('keeps the private half out of everything else in the repository', () => {
    const root = fileURLToPath(REPO);
    const listed = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root },
    )
      .toString()
      .split('\0')
      .filter((path) => path !== '' && existsSync(new URL(path, REPO)));
    expect(listed).toContain('infra/xcube/dev-credential-key.pem');
    const mayName = (path: string) =>
      path === 'docker-compose.yml' ||
      path.startsWith('infra/xcube/') ||
      path.startsWith('docs/') ||
      path === 'packages/api/src/secrets/xcube-key.test.ts' ||
      // T441: the sealing test stands in for xcube, opening what the browser
      // seals (and the golden vectors xcube's tests open) with this key. A
      // test alone; no product code reads it.
      path === 'packages/core/src/data-sources/seal.test.ts';

    const holding: string[] = [];
    const naming: string[] = [];
    for (const path of listed) {
      if (path === 'infra/xcube/dev-credential-key.pem') continue;
      const url = new URL(path, REPO);
      if (statSync(url).size > 2_000_000) continue;
      const text = readFileSync(url).toString('latin1');
      if (forms.some((form) => text.includes(form))) holding.push(path);
      if (text.includes('dev-credential-key.pem') && !mayName(path)) naming.push(path);
    }
    expect(holding, 'files holding the private key').toEqual([]);
    expect(naming, 'files reading or mounting the private key').toEqual([]);
  });

  it('mounts the private half into xcube’s containers alone, and gives the API the public half', () => {
    const compose = parse(read('docker-compose.yml')) as {
      services: Record<string, { secrets?: (string | { source: string })[]; image?: string }>;
      secrets?: Record<string, { file: string }>;
    };
    const secret = Object.entries(compose.secrets ?? {}).find(
      ([, { file }]) => file === './infra/xcube/dev-credential-key.pem',
    )?.[0];
    expect(secret).toBeDefined();
    const holders = Object.entries(compose.services)
      .filter(([, service]) =>
        (service.secrets ?? []).some(
          (each) => (typeof each === 'string' ? each : each.source) === secret,
        ),
      )
      .map(([name]) => name)
      .sort();
    expect(holders).toEqual(['cube', 'cube-refresh-worker']);

    // The API runs outside compose in development: the Playwright configs
    // start it, with the public key.
    for (const path of ['playwright.config.ts', 'playwright.security.config.ts']) {
      expect(read(path), path).toMatch(/WECHART_XCUBE_PUBLIC_KEY: DEV_XCUBE_PUBLIC_KEY/);
    }
    // The chart requires it, and Docker Desktop's values give the development one.
    expect(read('deploy/helm/wechart/templates/api.yaml')).toMatch(
      /name: WECHART_XCUBE_PUBLIC_KEY\s+value: \{\{ required /,
    );
    const desktop = parse(read('deploy/helm/values/docker-desktop.yaml')) as {
      api?: { xcubePublicKey?: string };
    };
    expect(JSON.parse(desktop.api?.xcubePublicKey ?? 'null')).toEqual(JSON.parse(DEV_JWK));
  });
});

/**
 * RFC 7638's thumbprint of an X25519 key, in RFC 8037's member order: written
 * out here, apart from the module under test, so the test doesn't check that
 * code with itself.
 */
function xcubeThumbprint(x: string): string {
  return createHash('sha256').update(`{"crv":"X25519","kty":"OKP","x":"${x}"}`).digest('base64url');
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}
