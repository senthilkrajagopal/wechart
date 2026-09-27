import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// @ts-expect-error: the chart's Job script is plain JavaScript, with no types.
import { reconcile } from '../../../../deploy/helm/wechart/files/xcube-credential-key.mjs';

/**
 * T455 (AC-324): the chart makes xcube's credential key once, in a Job running
 * xcube's own keygen (research `kubernetes-job-generated-secret.md`): the
 * private key and its sample credential in a Secret for Cube's pods alone, the
 * public JWK and its kid in a ConfigMap for the API. The Job reconciles rather
 * than stopping at "the Secret is there": it may die between its two writes,
 * or run twice.
 */
type Call = { method: string; path: string; body?: Record<string, unknown> };
type Answer = { status: number; body?: Record<string, unknown> | null };

const SECRET = 'wechart-xcube-credential-keys';
const CONFIG_MAP = 'wechart-xcube-public-key';
const KID = 'uYWeMx6i173fsiolFp1xi-qiav50k52AGinM56Y8JEw';
const JWK = {
  kty: 'OKP',
  crv: 'X25519',
  x: 'OKDigdpTk6aEk-tzx6VQP-gIWx08RyrSF-GDtz_z3Gc',
  kid: KID,
};
const PEM = '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VuBCIEI…\n-----END PRIVATE KEY-----\n';
const CHECK = '{"v":1,"kid":"…"}';
const b64 = (text: string) => Buffer.from(text).toString('base64');

const storedSecret = { data: { [`${KID}.pem`]: b64(PEM), [`${KID}.check`]: b64(CHECK) } };
const storedConfigMap = (kid = KID) => ({ data: { jwk: JSON.stringify({ ...JWK, kid }), kid } });

/** A stub Kubernetes API: each call recorded, answered by path and method. */
function cluster(answers: Record<string, Answer | Answer[]>) {
  const calls: Call[] = [];
  const api = async (method: string, path: string, body?: Record<string, unknown>) => {
    calls.push({ method, path, ...(body === undefined ? {} : { body }) });
    const answer = answers[`${method} ${path}`];
    if (answer === undefined) throw new Error(`no answer for ${method} ${path}`);
    return Array.isArray(answer) ? answer.shift()! : answer;
  };
  return { calls, api };
}
const keygens: (string | undefined)[] = [];
const keygen = async (pem?: string) => {
  keygens.push(pem);
  return { jwk: JWK, pem: PEM, check: CHECK };
};
const run = (api: ReturnType<typeof cluster>['api']) =>
  reconcile({ api, keygen, secret: SECRET, configMap: CONFIG_MAP }) as Promise<{
    kid: string;
    made: string[];
  }>;

describe('the Job that makes xcube’s credential key once (T455, AC-324)', () => {
  it('makes a key where there is none: the Secret for Cube, the ConfigMap for the API', async () => {
    keygens.length = 0;
    const { calls, api } = cluster({
      [`GET secrets/${SECRET}`]: { status: 404 },
      [`GET configmaps/${CONFIG_MAP}`]: { status: 404 },
      'POST secrets': { status: 201, body: storedSecret },
      'POST configmaps': { status: 201, body: storedConfigMap() },
    });

    expect(await run(api)).toEqual({ kid: KID, made: ['Secret', 'ConfigMap'] });
    expect(keygens).toEqual([undefined]);
    expect(calls.filter((call) => call.method === 'POST')).toEqual([
      {
        method: 'POST',
        path: 'secrets',
        body: {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name: SECRET },
          type: 'Opaque',
          immutable: true,
          // Standard base64, which the API takes, never base64url (research, Gotcha 1).
          data: { [`${KID}.pem`]: b64(PEM), [`${KID}.check`]: b64(CHECK) },
        },
      },
      {
        method: 'POST',
        path: 'configmaps',
        body: {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: CONFIG_MAP },
          immutable: true,
          data: { jwk: JSON.stringify(JWK), kid: KID },
        },
      },
    ]);
  });

  it('keeps the key another run made first, and makes only what is missing', async () => {
    keygens.length = 0;
    // Another pod's Secret landed between this one's GET and POST.
    const raced = cluster({
      [`GET secrets/${SECRET}`]: [{ status: 404 }, { status: 200, body: storedSecret }],
      [`GET configmaps/${CONFIG_MAP}`]: { status: 404 },
      'POST secrets': { status: 409 },
      'POST configmaps': { status: 201, body: storedConfigMap() },
    });
    expect(await run(raced.api)).toEqual({ kid: KID, made: ['ConfigMap'] });
    // The key it keeps is the stored one: its JWK derived from its PEM.
    expect(keygens).toEqual([undefined, PEM]);

    // A run that died between its two writes: the Secret there, no ConfigMap.
    keygens.length = 0;
    const halfway = cluster({
      [`GET secrets/${SECRET}`]: { status: 200, body: storedSecret },
      [`GET configmaps/${CONFIG_MAP}`]: { status: 404 },
      'POST configmaps': { status: 201, body: storedConfigMap() },
    });
    expect(await run(halfway.api)).toEqual({ kid: KID, made: ['ConfigMap'] });
    expect(keygens).toEqual([PEM]);

    // Both there: nothing written.
    const done = cluster({
      [`GET secrets/${SECRET}`]: { status: 200, body: storedSecret },
      [`GET configmaps/${CONFIG_MAP}`]: { status: 200, body: storedConfigMap() },
    });
    expect(await run(done.api)).toEqual({ kid: KID, made: [] });
    expect(done.calls.map((call) => call.method)).toEqual(['GET', 'GET']);
  });

  it('never makes a new key where one was: every stored credential would be lost', async () => {
    const lost = cluster({
      [`GET secrets/${SECRET}`]: { status: 404 },
      [`GET configmaps/${CONFIG_MAP}`]: { status: 200, body: storedConfigMap() },
    });
    await expect(run(lost.api)).rejects.toThrow(
      `${SECRET} is missing, but ${CONFIG_MAP} names key ${KID}: restore the Secret from its backup. A new key would leave every stored credential unopenable.`,
    );
    expect(lost.calls.map((call) => call.method)).toEqual(['GET', 'GET']);
  });

  it('refuses a ConfigMap naming another key, and a Secret holding other than one', async () => {
    await expect(
      run(
        cluster({
          [`GET secrets/${SECRET}`]: { status: 200, body: storedSecret },
          [`GET configmaps/${CONFIG_MAP}`]: { status: 200, body: storedConfigMap('other-kid') },
        }).api,
      ),
    ).rejects.toThrow(`${CONFIG_MAP} names key other-kid, but ${SECRET} holds ${KID}.`);

    await expect(
      run(
        cluster({
          [`GET secrets/${SECRET}`]: {
            status: 200,
            body: { data: { ...storedSecret.data, 'second.pem': b64(PEM) } },
          },
          [`GET configmaps/${CONFIG_MAP}`]: { status: 404 },
        }).api,
      ),
    ).rejects.toThrow(`${SECRET} holds 2 keys; this Job takes exactly one.`);
  });

  /**
   * A ConfigMap volume gives each key as a symlink, and node resolves the
   * main module's own path, not its argument's (T455's review): run through
   * one, as the pod runs it, the script must still act. Here with no cluster
   * credentials, so acting is failing on them and saying so.
   */
  it('runs when started through a symlink, as a ConfigMap volume mounts it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'credential-key-job-'));
    try {
      const script = fileURLToPath(
        new URL('../../../../deploy/helm/wechart/files/xcube-credential-key.mjs', import.meta.url),
      );
      mkdirSync(join(dir, '..data'));
      copyFileSync(script, join(dir, '..data', 'xcube-credential-key.mjs'));
      symlinkSync(
        join('..data', 'xcube-credential-key.mjs'),
        join(dir, 'xcube-credential-key.mjs'),
      );

      const ran = spawnSync(process.execPath, [join(dir, 'xcube-credential-key.mjs')], {
        env: { CREDENTIALS: join(dir, 'no-credentials'), WORK: dir, KEYGEN: '/none' },
        encoding: 'utf8',
      });
      expect(ran.status).toBe(1);
      expect(ran.stderr).toContain(`${join(dir, 'no-credentials', 'namespace')}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stops on any other answer, saying which, so the Job tries again', async () => {
    await expect(
      run(
        cluster({
          [`GET secrets/${SECRET}`]: { status: 403, body: { message: 'forbidden: RBAC' } },
          [`GET configmaps/${CONFIG_MAP}`]: { status: 404 },
        }).api,
      ),
    ).rejects.toThrow(`GET secrets/${SECRET} answered 403: forbidden: RBAC`);
  });
});
