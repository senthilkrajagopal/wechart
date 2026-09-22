import { fileURLToPath } from 'node:url';

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

  if (env['WECHART_CUBE_STORE_URL'] && !env['WECHART_MODEL_KEY']) {
    throw new ConfigError(
      'WECHART_CUBE_STORE_URL is set without WECHART_MODEL_KEY. Cube reads the model from this ' +
        'store with that key; without it every Cube request would fail.',
    );
  }

  return {
    cubeApiUrl,
    cubeApiSecret,
    securityContext: parseSecurityContext(env['WECHART_SECURITY_CONTEXT']),
    port: Number(env['PORT'] ?? 4100),
    modelDir: env['WECHART_MODEL_DIR'] ?? DEFAULT_MODEL_DIR,
    ...(env['WECHART_MODEL_KEY'] ? { modelKey: env['WECHART_MODEL_KEY'] } : {}),
    ...(env['WECHART_CUBE_STORE_URL']
      ? { cubeStoreUrl: env['WECHART_CUBE_STORE_URL'].replace(/\/$/, '') }
      : {}),
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
