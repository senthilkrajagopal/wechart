import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config';

/**
 * T419, AC-333: the deployment's model is named by its configured model id
 * (`WECHART_XCUBE_MODEL`, checked against xcube's pattern,
 * `docs/research/xcube-slice-2.md`).
 *
 * T420, AC-326: xcube's admin routes are called with wechart's service
 * credential, which replaced xcube's static admin token in slice 4
 * (`xcube-slice-4.md`, "The service token"). Its private key is a setting of
 * wechart's API alone — `WECHART_SERVICE_KEY`, or a file named by
 * `WECHART_SERVICE_KEY_FILE` (a mounted Secret) — an RSA key of 2048 bits or
 * more, as xcube takes; its public half goes to xcube by configuration.
 *
 * T437, AC-326: every query token is RS256 under a signing key of its own,
 * whose public half wechart pushes to xcube: `WECHART_SIGNING_KEY` (or
 * `_FILE`), required with the model, and `WECHART_SIGNING_NEXT_KEY` (or
 * `_FILE`) to rotate to. xcube refuses a pushed key that is a service key.
 */
const pem = (bits = 2048, type: 'rsa' | 'ec' = 'rsa') =>
  (type === 'rsa'
    ? generateKeyPairSync('rsa', {
        modulusLength: bits,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })
    : generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })
  ).privateKey;
const KEY = pem();
const SIGNING = pem();
const NEXT = pem();
const base = { CUBE_API_SECRET: 'secret' };
/** The three xcube settings, all given. */
const all = {
  ...base,
  WECHART_XCUBE_MODEL: 'dev',
  WECHART_SERVICE_KEY: KEY,
  WECHART_SIGNING_KEY: SIGNING,
};

describe('xcube’s settings (T419, T420, T437)', () => {
  it('names the model and carries the service and signing keys when all are given', () => {
    expect(loadConfig(all).xcube).toEqual({ model: 'dev', serviceKey: KEY, signingKey: SIGNING });
    expect(loadConfig({ ...all, WECHART_SIGNING_NEXT_KEY: NEXT }).xcube).toEqual({
      model: 'dev',
      serviceKey: KEY,
      signingKey: SIGNING,
      nextSigningKey: NEXT,
    });
  });

  it('reads each key from a mounted file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xcube-keys-'));
    const files = { service: join(dir, 'service.pem'), signing: join(dir, 'signing.pem') };
    writeFileSync(files.service, KEY);
    writeFileSync(files.signing, SIGNING);

    expect(
      loadConfig({
        ...base,
        WECHART_XCUBE_MODEL: 'dev',
        WECHART_SERVICE_KEY_FILE: files.service,
        WECHART_SIGNING_KEY_FILE: files.signing,
      }).xcube,
    ).toEqual({ model: 'dev', serviceKey: KEY, signingKey: SIGNING });
    expect(() =>
      loadConfig({
        ...all,
        WECHART_SERVICE_KEY: '',
        WECHART_SERVICE_KEY_FILE: `${files.service}.gone`,
      }),
    ).toThrow(/WECHART_SERVICE_KEY_FILE/);
    expect(() =>
      loadConfig({
        ...all,
        WECHART_SIGNING_KEY: '',
        WECHART_SIGNING_KEY_FILE: `${files.signing}.gone`,
      }),
    ).toThrow(/WECHART_SIGNING_KEY_FILE/);
  });

  it('leaves xcube out when none is given, as before the cut-over', () => {
    expect(loadConfig(base).xcube).toBeUndefined();
  });

  it('refuses to start with some without the others, naming the missing one', () => {
    expect(() => loadConfig({ ...all, WECHART_SERVICE_KEY: '' })).toThrow(/WECHART_SERVICE_KEY/);
    expect(() => loadConfig({ ...all, WECHART_XCUBE_MODEL: '' })).toThrow(/WECHART_XCUBE_MODEL/);
    expect(() => loadConfig({ ...all, WECHART_SIGNING_KEY: '' })).toThrow(
      'WECHART_SIGNING_KEY (or WECHART_SIGNING_KEY_FILE) is required with WECHART_XCUBE_MODEL: every query token is signed RS256 with it (AC-326).',
    );
  });

  it('refuses a model id xcube wouldn’t take', () => {
    for (const model of ['Dev', '-dev', 'f.1.2', 'x'.repeat(64)]) {
      expect(() => loadConfig({ ...all, WECHART_XCUBE_MODEL: model }), model).toThrow(
        /WECHART_XCUBE_MODEL .*1–63/,
      );
    }
    expect(loadConfig({ ...all, WECHART_XCUBE_MODEL: 'demo_2-b' }).xcube?.model).toBe('demo_2-b');
  });

  it('refuses a key xcube wouldn’t take, never repeating it', () => {
    for (const setting of [
      'WECHART_SERVICE_KEY',
      'WECHART_SIGNING_KEY',
      'WECHART_SIGNING_NEXT_KEY',
    ])
      for (const key of ['not a key', pem(1024), pem(2048, 'ec')]) {
        let message = '';
        try {
          loadConfig({ ...all, [setting]: key });
        } catch (error) {
          expect(error).toBeInstanceOf(ConfigError);
          message = (error as Error).message;
        }
        expect(message.startsWith(setting), `${setting}: ${message}`).toBe(true);
        expect(message).not.toContain(key.length > 80 ? key.slice(40, 80) : key);
      }
  });

  it('refuses a signing key that is the service key, which xcube refuses to take pushed', () => {
    expect(() => loadConfig({ ...all, WECHART_SIGNING_KEY: KEY })).toThrow(
      'WECHART_SIGNING_KEY is the service key: xcube takes no pushed key that it holds as a service key.',
    );
  });
});
