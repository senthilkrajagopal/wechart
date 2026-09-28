import { createPrivateKey, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { AUDIT_RETENTION_DAYS } from './audit/retention';
import type { SecurityMode } from './auth/user';
import type { XcubePublicKey } from './secrets/xcube-key';

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
   * exactly as the provider's groups claim carries it (T323, AC-256). Required
   * with security on (T416, AC-318); with security off the single user is the
   * Super-Admin, and no group is read.
   */
  readonly superAdminGroup?: string;
  /**
   * xcube's public key, which data-source credentials are encrypted to:
   * `WECHART_XCUBE_PUBLIC_KEY`, a JWK, read and checked at start by
   * `secrets/xcube-key.ts` (T333, AC-324). wechart never holds a key that
   * decrypts them (AC-298).
   */
  readonly xcubePublicKey?: XcubePublicKey;
  /**
   * The deployment's model in xcube (T419, AC-333), and the private key of
   * wechart's service credential, which xcube's admin routes, the jobs API
   * and introspection take (T420, AC-326; slice 4): `WECHART_XCUBE_MODEL`, and
   * `WECHART_SERVICE_KEY` or a file named by `WECHART_SERVICE_KEY_FILE`, both
   * or neither. Without them wechart sends xcube nothing, as before the
   * cut-over (T447).
   */
  readonly xcube?: { readonly model: string; readonly serviceKey: string };
  /**
   * The install Job's token, `WECHART_SEED_TOKEN` or the file
   * `WECHART_SEED_TOKEN_FILE` names (T443, AC-310, AC-251): the one thing its
   * route to seed the shared root's `default` data source answers. Unset,
   * there is no such route.
   */
  readonly seedToken?: string;
  /**
   * `WECHART_AUDIT_RETENTION_DAYS`: how long audit records are kept, in
   * whole days; a year unless set (T370, AC-296).
   */
  readonly auditRetentionDays?: number;
}

/** `WECHART_AUDIT_RETENTION_DAYS`: a whole number of days from 1, or a year unset. */
function auditRetentionOf(env: NodeJS.ProcessEnv): number {
  const said = env['WECHART_AUDIT_RETENTION_DAYS'];
  if (said === undefined || said === '') return AUDIT_RETENTION_DAYS;
  if (!/^[1-9]\d*$/.test(said))
    throw new ConfigError(
      `WECHART_AUDIT_RETENTION_DAYS is "${said}". It is how many days audit records are kept: a whole number from 1.`,
    );
  return Number(said);
}

/** A seeding token shorter than this could be guessed (T443). */
const SEED_TOKEN_MIN = 32;

/** `WECHART_SEED_TOKEN`, or the file `WECHART_SEED_TOKEN_FILE` names: a mounted Secret. */
function seedTokenOf(env: NodeJS.ProcessEnv): Pick<Config, 'seedToken'> {
  const file = env['WECHART_SEED_TOKEN_FILE'] ?? '';
  let token = env['WECHART_SEED_TOKEN'] ?? '';
  if (file !== '') {
    try {
      token = readFileSync(file, 'utf8').trim();
    } catch {
      throw new ConfigError(`WECHART_SEED_TOKEN_FILE names ${file}, which can’t be read.`);
    }
  }
  if (token === '') return {};
  if (token.length < SEED_TOKEN_MIN)
    throw new ConfigError(
      `WECHART_SEED_TOKEN is ${String(token.length)} characters; it needs at least ${String(SEED_TOKEN_MIN)}.`,
    );
  return { seedToken: token };
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
    ...(env['CUBE_WORKER_URL'] ? { cubeWorkerUrl: env['CUBE_WORKER_URL'].replace(/\/$/, '') } : {}),
    ...(env['WECHART_SUPER_ADMIN_GROUP']
      ? { superAdminGroup: env['WECHART_SUPER_ADMIN_GROUP'] }
      : {}),
    ...xcubeOf(env),
    ...seedTokenOf(env),
    auditRetentionDays: auditRetentionOf(env),
  };
}

/** xcube's model id (research: `MODEL_ID` in its `snapshot.ts`). */
const MODEL_ID = /^[a-z0-9][a-z0-9_-]{0,62}$/;
/** The smallest RSA key xcube takes (research `xcube-slice-4.md`, "Keys and tokens"). */
const MIN_SERVICE_KEY_BITS = 2048;

/** The deployment's model and wechart's service key, both or neither (T419, T420). */
function xcubeOf(env: NodeJS.ProcessEnv): Pick<Config, 'xcube'> {
  const model = env['WECHART_XCUBE_MODEL'] ?? '';
  const serviceKey = serviceKeyOf(env);
  if (model === '' && serviceKey === '') return {};
  if (model === '')
    throw new ConfigError(
      'WECHART_XCUBE_MODEL is required with WECHART_SERVICE_KEY: it names this deployment’s model in xcube.',
    );
  if (serviceKey === '')
    throw new ConfigError(
      'WECHART_SERVICE_KEY (or WECHART_SERVICE_KEY_FILE) is required with WECHART_XCUBE_MODEL: xcube’s admin routes take its tokens.',
    );
  if (!MODEL_ID.test(model))
    throw new ConfigError(
      `WECHART_XCUBE_MODEL "${model}" isn’t a model id xcube takes: 1–63 lower-case letters, digits, "_" and "-", starting with a letter or digit.`,
    );
  // The key itself is never repeated.
  let key: KeyObject;
  try {
    key = createPrivateKey(serviceKey);
  } catch {
    throw new ConfigError('WECHART_SERVICE_KEY isn’t a private key in PEM.');
  }
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (key.asymmetricKeyType !== 'rsa' || bits < MIN_SERVICE_KEY_BITS)
    throw new ConfigError(
      `WECHART_SERVICE_KEY isn’t a key xcube takes: an RSA key of ${String(MIN_SERVICE_KEY_BITS)} bits or more.`,
    );
  return { xcube: { model, serviceKey } };
}

/** `WECHART_SERVICE_KEY`, or the file `WECHART_SERVICE_KEY_FILE` names: a mounted Secret. */
function serviceKeyOf(env: NodeJS.ProcessEnv): string {
  const file = env['WECHART_SERVICE_KEY_FILE'] ?? '';
  if (file === '') return env['WECHART_SERVICE_KEY'] ?? '';
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new ConfigError(`WECHART_SERVICE_KEY_FILE names ${file}, which can’t be read.`);
  }
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
  // Without a Super-Admin group, nobody could reach the admin surfaces
  // (T416, AC-318; the user's R26): read below, with the rest of the config.
  required('WECHART_SUPER_ADMIN_GROUP');
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
