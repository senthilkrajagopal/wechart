import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config';

/**
 * T419, AC-333: the deployment's model is named by its configured model id,
 * and xcube's admin routes are called with xcube's static admin token (R29).
 * Both are settings of wechart's API: `WECHART_XCUBE_MODEL` and
 * `WECHART_XCUBE_ADMIN_TOKEN`, checked at start against xcube's own rules
 * (`docs/research/xcube-slice-2.md`: the model id's pattern; a token of 32 or
 * more of `[A-Za-z0-9._~-]`, never Cube's API secret).
 */
const TOKEN = 'an-xcube-admin-token-0123456789-abcdef';
const base = { CUBE_API_SECRET: 'secret' };

describe('xcube’s settings (T419, AC-333)', () => {
  it('names the model and carries the admin token when both are given', () => {
    expect(
      loadConfig({ ...base, WECHART_XCUBE_MODEL: 'dev', WECHART_XCUBE_ADMIN_TOKEN: TOKEN }).xcube,
    ).toEqual({ model: 'dev', adminToken: TOKEN });
  });

  it('leaves xcube out when neither is given, as before the cut-over', () => {
    expect(loadConfig(base).xcube).toBeUndefined();
  });

  it('refuses to start with one without the other, naming the missing one', () => {
    expect(() => loadConfig({ ...base, WECHART_XCUBE_MODEL: 'dev' })).toThrow(
      /WECHART_XCUBE_ADMIN_TOKEN/,
    );
    expect(() => loadConfig({ ...base, WECHART_XCUBE_ADMIN_TOKEN: TOKEN })).toThrow(
      /WECHART_XCUBE_MODEL/,
    );
  });

  it('refuses a model id xcube wouldn’t take', () => {
    for (const model of ['Dev', '-dev', 'f.1.2', '', 'x'.repeat(64)]) {
      expect(
        () => loadConfig({ ...base, WECHART_XCUBE_MODEL: model, WECHART_XCUBE_ADMIN_TOKEN: TOKEN }),
        model,
      ).toThrow(model === '' ? /WECHART_XCUBE_MODEL/ : /WECHART_XCUBE_MODEL .*1–63/);
    }
    expect(
      loadConfig({ ...base, WECHART_XCUBE_MODEL: 'demo_2-b', WECHART_XCUBE_ADMIN_TOKEN: TOKEN })
        .xcube?.model,
    ).toBe('demo_2-b');
  });

  it('refuses an admin token xcube wouldn’t take, never repeating it', () => {
    for (const token of ['short', `${'a'.repeat(40)} b`, 'secret'.padEnd(40, '!')]) {
      let message = '';
      try {
        loadConfig({ ...base, WECHART_XCUBE_MODEL: 'dev', WECHART_XCUBE_ADMIN_TOKEN: token });
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        message = (error as Error).message;
      }
      expect(message).toMatch(/^WECHART_XCUBE_ADMIN_TOKEN/);
      expect(message).not.toContain(token);
    }
    // Cube's own API secret is never the admin token.
    const secret = 'z'.repeat(40);
    expect(() =>
      loadConfig({
        CUBE_API_SECRET: secret,
        WECHART_XCUBE_MODEL: 'dev',
        WECHART_XCUBE_ADMIN_TOKEN: secret,
      }),
    ).toThrow(/CUBE_API_SECRET/);
  });
});
