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
const base = { CUBE_API_SECRET: 'secret' };

describe('xcube’s settings (T419, T420)', () => {
  it('names the model and carries the service key when both are given', () => {
    expect(
      loadConfig({ ...base, WECHART_XCUBE_MODEL: 'dev', WECHART_SERVICE_KEY: KEY }).xcube,
    ).toEqual({
      model: 'dev',
      serviceKey: KEY,
    });
  });

  it('reads the service key from a mounted file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'service-key-')), 'service-key.pem');
    writeFileSync(file, KEY);

    expect(
      loadConfig({ ...base, WECHART_XCUBE_MODEL: 'dev', WECHART_SERVICE_KEY_FILE: file }).xcube,
    ).toEqual({ model: 'dev', serviceKey: KEY });
    expect(() =>
      loadConfig({ ...base, WECHART_XCUBE_MODEL: 'dev', WECHART_SERVICE_KEY_FILE: `${file}.gone` }),
    ).toThrow(/WECHART_SERVICE_KEY_FILE/);
  });

  it('leaves xcube out when neither is given, as before the cut-over', () => {
    expect(loadConfig(base).xcube).toBeUndefined();
  });

  it('refuses to start with one without the other, naming the missing one', () => {
    expect(() => loadConfig({ ...base, WECHART_XCUBE_MODEL: 'dev' })).toThrow(
      /WECHART_SERVICE_KEY/,
    );
    expect(() => loadConfig({ ...base, WECHART_SERVICE_KEY: KEY })).toThrow(/WECHART_XCUBE_MODEL/);
  });

  it('refuses a model id xcube wouldn’t take', () => {
    for (const model of ['Dev', '-dev', 'f.1.2', '', 'x'.repeat(64)]) {
      expect(
        () => loadConfig({ ...base, WECHART_XCUBE_MODEL: model, WECHART_SERVICE_KEY: KEY }),
        model,
      ).toThrow(model === '' ? /WECHART_XCUBE_MODEL/ : /WECHART_XCUBE_MODEL .*1–63/);
    }
    expect(
      loadConfig({ ...base, WECHART_XCUBE_MODEL: 'demo_2-b', WECHART_SERVICE_KEY: KEY }).xcube
        ?.model,
    ).toBe('demo_2-b');
  });

  it('refuses a service key xcube wouldn’t take, never repeating it', () => {
    for (const key of ['not a key', pem(1024), pem(2048, 'ec')]) {
      let message = '';
      try {
        loadConfig({ ...base, WECHART_XCUBE_MODEL: 'dev', WECHART_SERVICE_KEY: key });
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        message = (error as Error).message;
      }
      expect(message).toMatch(/^WECHART_SERVICE_KEY/);
      expect(message).not.toContain(key.length > 80 ? key.slice(40, 80) : key);
    }
  });
});
