import { fileURLToPath } from 'node:url';

import type { SecurityMode } from './auth/user';

/**
 * Everything the service reads from its environment.
 *
 * The Cube secret is read here and never travels further than the CubeClient
 * (AC-007). Nothing in this module is logged, and nothing returns it.
 */

export interface Config {
  readonly cubeApiUrl: string;
  readonly cubeApiSecret: string;
  /**
   * Phase 1 is single-user, so wechart holds one security context rather than
   * deriving it per request (requirements.md §4). `WECHART_SECURITY_CONTEXT` is
   * JSON; an empty context is legitimate and means "no claims".
   */
  readonly securityContext: Record<string, unknown>;
  readonly port: number;
  /**
   * Where the model files are read from to seed wechart's store (T137):
   * `WECHART_MODEL_DIR`, or by default the repository's `infra/cube/model`,
   * which docker-compose mounts into Cube.
   */
  readonly modelDir: string;
  /**
   * The key Cube presents to read the model from this store (T142):
   * `WECHART_MODEL_KEY`, the same as the Cube container's. Without it the
   * model is served to no one, and Cube reads its mounted directory.
   */
  readonly modelKey?: string;
  /**
   * This store's address as Cube reaches it — `WECHART_CUBE_STORE_URL`, for
   * example `http://host.docker.internal:4100` — named in every token so Cube
   * reads this wechart's model (`infra/cube/cube.js`). Without it Cube reads
   * its mounted directory, and nothing can be published.
   */
  readonly cubeStoreUrl?: string;
  /**
   * The refresh worker's address — `CUBE_WORKER_URL`, for example
   * `http://localhost:54001` — whose own `/readyz` and `/livez` say its state
   * (T162, AC-156). Without it the worker is shown as not watched.
   */
  readonly cubeWorkerUrl?: string;
  /**
   * `WECHART_SECURITY`: `off` (the default) runs as phase 1's single user, a
   * Super-Admin; `oidc` signs every user in (AC-251, AC-254). Unset here means
   * off, so a configuration built in code keeps phase 1's behaviour.
   */
  readonly security?: SecurityMode;
  /**
   * What the browser sees wechart as — `WECHART_PUBLIC_URL`, for example
   * `https://wechart.example.com` — from which the sign-in callback is built.
   * Never taken from a request's Host (research/openid-client.md, Gotcha 2).
   * Required with security on.
   */
  readonly publicUrl?: string;
  /**
   * Signs the session cookie — `WECHART_SESSION_SECRET`, 32 characters or
   * more (research/openid-client.md). Required with security on.
   */
  readonly sessionSecret?: string;
  /** The OIDC provider, with security on (AC-252). */
  readonly oidc?: OidcSettings;
  /**
   * `WECHART_TRUST_PROXY`: the proxy in front of the API (nginx), whose
   * `X-Forwarded-Proto` is believed — `true`, or its addresses, comma-separated.
   * Behind a TLS-terminating proxy the API sees plain HTTP, and without this a
   * Secure session cookie is silently never set (research/openid-client.md,
   * Gotcha 3; T316's review).
   */
  readonly trustProxy?: boolean | readonly string[];
  /**
   * `WECHART_SUPER_ADMIN_GROUP`: the AD group whose members are Super-Admins,
   * exactly as the provider's groups claim carries it (T323, AC-256). Unset,
   * no one signed in is a Super-Admin; with security off the single user is.
   */
  readonly superAdminGroup?: string;
}

/** The OIDC provider wechart signs users in through (AC-252; research/openid-client.md). */
export interface OidcSettings {
  /** `WECHART_OIDC_ISSUER`: exactly the provider's `iss`. */
  readonly issuer: string;
  /** `WECHART_OIDC_CLIENT_ID`. */
  readonly clientId: string;
  /** `WECHART_OIDC_CLIENT_SECRET`: a confidential client. */
  readonly clientSecret: string;
  /** `WECHART_OIDC_GROUPS_CLAIM`, `groups` by default: the claim that carries AD groups. */
  readonly groupsClaim: string;
  /**
   * `WECHART_OIDC_SCOPES`, `openid profile email` by default. Providers that
   * want a scope for groups (Dex's `groups`) are given it here; Entra ID would
   * refuse it (research/openid-client.md).
   */
  readonly scopes: string;
  /** `WECHART_OIDC_ALLOW_HTTP=true`: a plain-HTTP issuer, for development only. */
  readonly allowHttp: boolean;
  /**
   * `WECHART_OIDC_BACKCHANNEL_URL`: where this service reaches the issuer when
   * that differs from the browser's address, as inside a cluster (research
   * Gotcha 1). The issuer string itself stays the browser's.
   */
  readonly backchannelUrl?: string;
}

/** `infra/cube/model`, three levels up from `src/` or `dist/` in this package. */
const DEFAULT_MODEL_DIR = fileURLToPath(new URL('../../../infra/cube/model', import.meta.url));

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cubeApiUrl = env['CUBE_API_URL'] ?? 'http://localhost:4000/cubejs-api';
  const cubeApiSecret = env['CUBE_API_SECRET'];

  if (!cubeApiSecret) {
    throw new ConfigError(
      'CUBE_API_SECRET is not set. wechart signs every Cube request with it, and is the only ' +
        'holder of it; the browser never sees it.',
    );
  }

  // Not an http(s) URL, every probe of it fails, and the worker reads down
  // forever — the same as a real outage (T162's review).
  const worker = env['CUBE_WORKER_URL'];
  if (worker !== undefined && worker !== '' && !/^https?:\/\/[^/]/.test(worker)) {
    throw new ConfigError(
      `CUBE_WORKER_URL is not an http(s) URL: "${worker}". wechart reads the refresh ` +
        'worker’s state from its /readyz and /livez there.',
    );
  }

  if (env['WECHART_CUBE_STORE_URL'] && !env['WECHART_MODEL_KEY']) {
    throw new ConfigError(
      'WECHART_CUBE_STORE_URL is set without WECHART_MODEL_KEY. Cube reads the model from this ' +
        'store with that key; without it every Cube request would fail.',
    );
  }

  // An unknown mode must never run open: "on" is not "oidc".
  const security = env['WECHART_SECURITY'] ?? 'off';
  if (security !== 'off' && security !== 'oidc') {
    throw new ConfigError(
      `WECHART_SECURITY is "${security}". It is "off" (single-user mode) or "oidc" (sign-in).`,
    );
  }

  return {
    security,
    ...(security === 'oidc' ? signInOf(env) : {}),
    cubeApiUrl,
    cubeApiSecret,
    securityContext: parseSecurityContext(env['WECHART_SECURITY_CONTEXT']),
    port: Number(env['PORT'] ?? 4100),
    modelDir: env['WECHART_MODEL_DIR'] ?? DEFAULT_MODEL_DIR,
    ...(env['WECHART_MODEL_KEY'] ? { modelKey: env['WECHART_MODEL_KEY'] } : {}),
    ...(env['WECHART_CUBE_STORE_URL']
      ? { cubeStoreUrl: env['WECHART_CUBE_STORE_URL'].replace(/\/$/, '') }
      : {}),
    ...(env['CUBE_WORKER_URL'] ? { cubeWorkerUrl: env['CUBE_WORKER_URL'].replace(/\/$/, '') } : {}),
    ...(env['WECHART_SUPER_ADMIN_GROUP']
      ? { superAdminGroup: env['WECHART_SUPER_ADMIN_GROUP'] }
      : {}),
  };
}

/** With security on, everything sign-in needs is required: a missing piece is a startup error. */
function signInOf(
  env: NodeJS.ProcessEnv,
): Pick<Config, 'publicUrl' | 'sessionSecret' | 'oidc' | 'trustProxy'> {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new ConfigError(`${name} is required with WECHART_SECURITY=oidc.`);
    return value;
  };
  const sessionSecret = required('WECHART_SESSION_SECRET');
  if (sessionSecret.length < 32) {
    throw new ConfigError('WECHART_SESSION_SECRET must be at least 32 characters.');
  }
  const backchannel = env['WECHART_OIDC_BACKCHANNEL_URL'];
  const publicUrl = required('WECHART_PUBLIC_URL').replace(/\/$/, '');
  const proxy = env['WECHART_TRUST_PROXY'];
  // An https address is served through a TLS-terminating proxy here; without
  // trusting it, the Secure session cookie would never be set.
  if (publicUrl.startsWith('https:') && !proxy) {
    throw new ConfigError(
      'WECHART_PUBLIC_URL is https, so WECHART_TRUST_PROXY must name the proxy in front of the ' +
        'API (or be "true"): without it the session cookie is never set.',
    );
  }
  return {
    ...(proxy
      ? {
          trustProxy: proxy === 'true' ? true : proxy.split(',').map((address) => address.trim()),
        }
      : {}),
    publicUrl,
    sessionSecret,
    oidc: {
      issuer: required('WECHART_OIDC_ISSUER'),
      clientId: required('WECHART_OIDC_CLIENT_ID'),
      clientSecret: required('WECHART_OIDC_CLIENT_SECRET'),
      groupsClaim: env['WECHART_OIDC_GROUPS_CLAIM'] || 'groups',
      scopes: env['WECHART_OIDC_SCOPES'] || 'openid profile email',
      allowHttp: env['WECHART_OIDC_ALLOW_HTTP'] === 'true',
      ...(backchannel ? { backchannelUrl: backchannel.replace(/\/$/, '') } : {}),
    },
  };
}

function parseSecurityContext(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('WECHART_SECURITY_CONTEXT is not valid JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ConfigError('WECHART_SECURITY_CONTEXT must be a JSON object');
  }

  return parsed as Record<string, unknown>;
}
