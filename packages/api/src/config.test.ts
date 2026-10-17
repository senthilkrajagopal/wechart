import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from './config';

/**
 * T773 (AC-474, AC-479): `WECHART_TRUST_PROXY` names the proxy in front of
 * the API in every security mode, so `request.ip` is the client's behind it
 * with sign-in off too (`mcp-deployment-and-tokens.md`, Finding 4). Only
 * addresses: `true`, like hop-count trust, would believe any caller's
 * `X-Forwarded-For` (research §3, "Fastify side").
 */
const SIGN_IN_ENV = {
  WECHART_SECURITY: 'oidc',
  WECHART_PUBLIC_URL: 'http://localhost:5373',
  WECHART_SESSION_SECRET: 'a-test-session-secret-at-least-32-characters',
  WECHART_SUPER_ADMIN_GROUP: 'wechart-super-admins',
  WECHART_OIDC_ISSUER: 'http://localhost:5556/dex',
  WECHART_OIDC_CLIENT_ID: 'wechart',
  WECHART_OIDC_CLIENT_SECRET: 'secret',
};

describe('WECHART_TRUST_PROXY in every security mode (T773, AC-474, AC-479)', () => {
  it('is read with sign-in off', () => {
    expect(
      loadConfig({ CUBE_API_SECRET: 's', WECHART_TRUST_PROXY: '10.1.0.0/16' }).trustProxy,
    ).toEqual(['10.1.0.0/16']);
  });

  it('takes several addresses and ranges, IPv6 among them, with sign-in on too', () => {
    expect(
      loadConfig({
        CUBE_API_SECRET: 's',
        ...SIGN_IN_ENV,
        WECHART_TRUST_PROXY: '10.1.0.0/16, 10.2.0.5,fd00::/8',
      }).trustProxy,
    ).toEqual(['10.1.0.0/16', '10.2.0.5', 'fd00::/8']);
  });

  it('trusts no proxy when it is unset or empty', () => {
    expect(loadConfig({ CUBE_API_SECRET: 's' }).trustProxy).toBeUndefined();
    expect(
      loadConfig({ CUBE_API_SECRET: 's', WECHART_TRUST_PROXY: '' }).trustProxy,
    ).toBeUndefined();
  });

  it('refuses true, and a hop count, which trust any caller’s X-Forwarded-For', () => {
    for (const mode of [{}, SIGN_IN_ENV])
      for (const value of ['true', '1', '2']) {
        expect(() =>
          loadConfig({ CUBE_API_SECRET: 's', ...mode, WECHART_TRUST_PROXY: value }),
        ).toThrow(ConfigError);
      }
    expect(() => loadConfig({ CUBE_API_SECRET: 's', WECHART_TRUST_PROXY: 'true' })).toThrow(
      /WECHART_TRUST_PROXY names the proxy’s addresses/,
    );
  });

  it('refuses what is no address or range, naming it', () => {
    for (const value of ['nginx', '10.1.0.0/33', '10.1.0.0/16,', '300.1.2.3'])
      expect(() => loadConfig({ CUBE_API_SECRET: 's', WECHART_TRUST_PROXY: value })).toThrow(
        ConfigError,
      );
    expect(() =>
      loadConfig({ CUBE_API_SECRET: 's', WECHART_TRUST_PROXY: '10.1.0.0/16,nginx' }),
    ).toThrow(/“nginx”/);
  });
});
