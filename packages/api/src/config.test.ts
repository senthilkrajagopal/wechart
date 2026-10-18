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

/**
 * T1015 (AC-630): `WECHART_TIME_ZONE`, the deployment's time zone, from the
 * Helm values: an IANA zone, UTC when none is set, and a name that is no
 * zone stops the start, naming it (R80-2).
 */
describe('WECHART_TIME_ZONE (T1015, AC-630)', () => {
  it('reads UTC when unset or empty', () => {
    expect(loadConfig({ CUBE_API_SECRET: 's' }).timeZone).toBe('UTC');
    expect(loadConfig({ CUBE_API_SECRET: 's', WECHART_TIME_ZONE: '' }).timeZone).toBe('UTC');
  });

  it('keeps an IANA zone, in either security mode', () => {
    expect(loadConfig({ CUBE_API_SECRET: 's', WECHART_TIME_ZONE: 'Europe/Berlin' }).timeZone).toBe(
      'Europe/Berlin',
    );
    expect(
      loadConfig({ CUBE_API_SECRET: 's', ...SIGN_IN_ENV, WECHART_TIME_ZONE: 'Asia/Tokyo' })
        .timeZone,
    ).toBe('Asia/Tokyo');
  });

  it('stops the start with a name that is no zone, naming it', () => {
    expect(() => loadConfig({ CUBE_API_SECRET: 's', WECHART_TIME_ZONE: 'Mars/Olympus' })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ CUBE_API_SECRET: 's', WECHART_TIME_ZONE: 'Mars/Olympus' })).toThrow(
      /WECHART_TIME_ZONE.*“Mars\/Olympus”/,
    );
  });
});

/**
 * T774 (AC-476): `WECHART_MCP_HOST`, the host the Helm values name for MCP.
 * Unset, MCP is off: nothing is served at `/mcp` (design 18's Q6, "MCP off").
 */
describe('WECHART_MCP_HOST (T774, AC-476)', () => {
  it('is the MCP host, as a host name alone, in either security mode', () => {
    expect(
      loadConfig({ CUBE_API_SECRET: 's', WECHART_MCP_HOST: 'mcp.wechart.example.com' }).mcpHost,
    ).toBe('mcp.wechart.example.com');
    expect(
      loadConfig({ CUBE_API_SECRET: 's', ...SIGN_IN_ENV, WECHART_MCP_HOST: 'MCP.Example.com' })
        .mcpHost,
    ).toBe('mcp.example.com');
  });

  it('is off when unset or empty', () => {
    expect(loadConfig({ CUBE_API_SECRET: 's' }).mcpHost).toBeUndefined();
    expect(loadConfig({ CUBE_API_SECRET: 's', WECHART_MCP_HOST: '' }).mcpHost).toBeUndefined();
  });

  it('refuses an address, a path or a port in place of a host name', () => {
    for (const value of [
      'https://mcp.example.com',
      'mcp.example.com/mcp',
      'mcp.example.com:443',
      'mcp example',
      // An address, or a single label, is no host a TLS certificate is made for (T774's review).
      '10.0.0.1',
      'localhost',
    ])
      expect(() => loadConfig({ CUBE_API_SECRET: 's', WECHART_MCP_HOST: value })).toThrow(
        /WECHART_MCP_HOST/,
      );
  });
});
