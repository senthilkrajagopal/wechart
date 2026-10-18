import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
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
   * `WECHART_TRUST_PROXY`: the proxy in front of the API (nginx, or the
   * Gateway's Envoy), whose `X-Forwarded-*` are believed: its addresses or
   * ranges, comma-separated, in every security mode (T773). Behind a
   * TLS-terminating proxy the API sees plain HTTP, and without this a Secure
   * session cookie is silently never set (research/openid-client.md, Gotcha
   * 3; T316's review); and `request.ip`, which the MCP limits count by, would
   * be the proxy's (`mcp-deployment-and-tokens.md`, Finding 4). Never `true`
   * nor a hop count, which believe any caller's `X-Forwarded-For` (§3).
   */
  readonly trustProxy?: readonly string[];
  /**
   * `WECHART_MCP_HOST`: the host the Helm values name for MCP, lower-cased
   * (T774, AC-476). Unset, MCP is off: nothing is served at `/mcp` (design
   * 18's Q6, "MCP off (Recommended)").
   */
  readonly mcpHost?: string;
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
  readonly xcube?: {
    readonly model: string;
    readonly serviceKey: string;
    /**
     * The private key every query token is signed RS256 with (T437, AC-326):
     * `WECHART_SIGNING_KEY` or `_FILE`, required with the model. Its public
     * half is pushed to xcube at start.
     */
    readonly signingKey: string;
    /** The key to rotate to, `WECHART_SIGNING_NEXT_KEY` or `_FILE`: pushed with it, then signed with. */
    readonly nextSigningKey?: string;
  };
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

  const trustProxy = trustProxyOf(env);
  const mcpHost = mcpHostOf(env);
  return {
    security,
    ...(trustProxy === undefined ? {} : { trustProxy }),
    ...(mcpHost === undefined ? {} : { mcpHost }),
    ...(security === 'oidc' ? signInOf(env, trustProxy) : {}),
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

/**
 * The deployment's model, wechart's service key and its query signing key,
 * all or none (T419, T420, T437), and the signing key to rotate to.
 */
function xcubeOf(env: NodeJS.ProcessEnv): Pick<Config, 'xcube'> {
  const model = env['WECHART_XCUBE_MODEL'] ?? '';
  const serviceKey = keyOf(env, 'WECHART_SERVICE_KEY');
  const signingKey = keyOf(env, 'WECHART_SIGNING_KEY');
  const nextSigningKey = keyOf(env, 'WECHART_SIGNING_NEXT_KEY');
  if (model === '' && serviceKey === '' && signingKey === '') return {};
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
  rsaKeyOf('WECHART_SERVICE_KEY', serviceKey);
  if (signingKey === '')
    throw new ConfigError(
      'WECHART_SIGNING_KEY (or WECHART_SIGNING_KEY_FILE) is required with WECHART_XCUBE_MODEL: every query token is signed RS256 with it (AC-326).',
    );
  rsaKeyOf('WECHART_SIGNING_KEY', signingKey);
  const publicDer = (pem: string) => createPublicKey(pem).export({ type: 'pkcs1', format: 'der' });
  if (publicDer(signingKey).equals(publicDer(serviceKey)))
    throw new ConfigError(
      'WECHART_SIGNING_KEY is the service key: xcube takes no pushed key that it holds as a service key.',
    );
  if (nextSigningKey !== '') rsaKeyOf('WECHART_SIGNING_NEXT_KEY', nextSigningKey);
  return {
    xcube: {
      model,
      serviceKey,
      signingKey,
      ...(nextSigningKey === '' ? {} : { nextSigningKey }),
    },
  };
}

/** A private RSA key of the size xcube takes, or why not: the key itself never repeated. */
function rsaKeyOf(setting: string, pem: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    throw new ConfigError(`${setting} isn’t a private key in PEM.`);
  }
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (key.asymmetricKeyType !== 'rsa' || bits < MIN_SERVICE_KEY_BITS)
    throw new ConfigError(
      `${setting} isn’t a key xcube takes: an RSA key of ${String(MIN_SERVICE_KEY_BITS)} bits or more.`,
    );
  return key;
}

/** A key setting, or the file its `_FILE` names: a mounted Secret. */
function keyOf(env: NodeJS.ProcessEnv, setting: string): string {
  const file = env[`${setting}_FILE`] ?? '';
  if (file === '') return env[setting] ?? '';
  try {
    return readFileSync(file, 'utf8');
  } catch {
    throw new ConfigError(`${setting}_FILE names ${file}, which can’t be read.`);
  }
}

/** An address, or a range as address/prefix, IPv4 or IPv6. */
function isAddressOrRange(entry: string): boolean {
  const [address = '', prefix, ...rest] = entry.split('/');
  const family = isIP(address);
  if (family === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}

/**
 * The proxies whose `X-Forwarded-*` the API believes, in every security mode
 * (T773, AC-474, AC-479): addresses and ranges only. `true` and a hop count
 * are refused, as Fastify itself warns hop-count trust lets direct clients
 * spoof `X-Forwarded-*` (`mcp-deployment-and-tokens.md` §3).
 */
function trustProxyOf(env: NodeJS.ProcessEnv): readonly string[] | undefined {
  const proxy = env['WECHART_TRUST_PROXY'];
  if (proxy === undefined || proxy.trim() === '') return undefined;
  const entries = proxy.split(',').map((entry) => entry.trim());
  const bad = entries.find((entry) => !isAddressOrRange(entry));
  if (bad !== undefined)
    throw new ConfigError(
      `WECHART_TRUST_PROXY names the proxy’s addresses or ranges, comma-separated, such as ` +
        `10.1.0.0/16: “${bad}” is none. Never true nor a hop count, which would believe any ` +
        'caller’s X-Forwarded-For.',
    );
  return entries;
}

/** A DNS host name: dot-separated labels of letters, digits and inner hyphens. */
const HOST_NAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

/** The MCP host (T774, AC-476): a host name alone, or none for MCP off. */
function mcpHostOf(env: NodeJS.ProcessEnv): string | undefined {
  const host = (env['WECHART_MCP_HOST'] ?? '').trim().toLowerCase();
  if (host === '') return undefined;
  if (!HOST_NAME.test(host))
    throw new ConfigError(
      `WECHART_MCP_HOST is a host name alone, such as mcp.wechart.example.com: “${host}” isn’t ` +
        '(no scheme, path or port; MCP is served at https://‹host›/mcp).',
    );
  return host;
}

/** With security on, everything sign-in needs is required: a missing piece is a startup error. */
function signInOf(
  env: NodeJS.ProcessEnv,
  trustProxy: readonly string[] | undefined,
): Pick<Config, 'publicUrl' | 'sessionSecret' | 'oidc'> {
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
  // An https address is served through a TLS-terminating proxy here; without
  // trusting it, the Secure session cookie would never be set.
  if (publicUrl.startsWith('https:') && trustProxy === undefined) {
    throw new ConfigError(
      'WECHART_PUBLIC_URL is https, so WECHART_TRUST_PROXY must name the proxy in front of the ' +
        'API: without it the session cookie is never set.',
    );
  }
  return {
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
