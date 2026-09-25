import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T142: infra/cube/cube.js, the configuration Cube loads — which store it
 * reads the model from, a draft, and its fallback to the mounted directory.
 * Its checks are the ones that keep Cube reading only what wechart signed
 * for, from a store it trusts (T142's review, M4).
 *
 * Loaded as Cube loads it — CommonJS, with its environment — and its fetch
 * answered here.
 */
const CONFIG = fileURLToPath(new URL('../../../../infra/cube/cube.js', import.meta.url));
const STORE = 'http://host.docker.internal:4100';

interface CubeConfig {
  contextToAppId: (context: unknown) => string;
  repositoryFactory: (context: unknown) => {
    localPath: () => string;
    dataSchemaFiles: () => Promise<{ fileName: string; content: string }[]>;
  };
  schemaVersion: (context: unknown) => Promise<string>;
  contextToApiScopes: (context: unknown, defaultScopes: string[]) => Promise<string[]>;
  maxCompilerCacheKeepAlive?: number;
  updateCompilerCacheKeepAlive?: boolean;
}

const requested: { url: string; key: string | undefined }[] = [];

function load(): CubeConfig {
  const require = createRequire(import.meta.url);
  delete require.cache[CONFIG];
  return require(CONFIG) as CubeConfig;
}

beforeEach(() => {
  requested.length = 0;
  vi.stubEnv('WECHART_MODEL_STORES', `${STORE}, http://other.invalid:4200/`);
  vi.stubEnv('WECHART_MODEL_KEY', 'k');
  vi.stubGlobal('fetch', async (url: string, init?: { headers?: Record<string, string> }) => {
    requested.push({ url, key: init?.headers?.['x-wechart-model-key'] });
    const body = url.endsWith('/version')
      ? { version: 'v7' }
      : { files: [{ fileName: 'cubes/a.yml', content: `from ${url}` }] };
    return new Response(JSON.stringify(body));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const as = (securityContext: Record<string, unknown>) => ({ securityContext });

describe('Cube’s configuration', () => {
  it('reads the live model from a store it trusts, with the key', async () => {
    const config = load();
    const context = as({ wechartStore: STORE });

    expect(config.contextToAppId(context)).toBe('CUBE_APP_http_host_docker_internal_4100');
    expect(await config.schemaVersion(context)).toBe('v7');
    expect(await config.repositoryFactory(context).dataSchemaFiles()).toEqual([
      { fileName: 'cubes/a.yml', content: `from ${STORE}/api/cube-model/files` },
    ]);
    expect(requested.every((request) => request.key === 'k')).toBe(true);
  });

  it('reads a draft under an app id of its own, and never keeps a version', async () => {
    const config = load();
    const context = as({ wechartStore: STORE, wechartDraft: 'b2c3-d4' });

    expect(config.contextToAppId(context)).toBe(
      'CUBE_APP_http_host_docker_internal_4100_draft_b2c3_d4',
    );
    expect(await config.schemaVersion(context)).toBe('draft_b2c3-d4');
    expect(await config.repositoryFactory(context).dataSchemaFiles()).toEqual([
      { fileName: 'cubes/a.yml', content: `from ${STORE}/api/cube-model/drafts/b2c3-d4` },
    ]);
    // The live version is asked each time: a publish must be seen at once (T143).
    await config.schemaVersion(as({ wechartStore: STORE }));
    await config.schemaVersion(as({ wechartStore: STORE }));
    expect(requested.filter((request) => request.url.endsWith('/version'))).toHaveLength(2);
  });

  it('reads the mounted directory for a store it doesn’t trust, and asks it nothing', async () => {
    const config = load();

    for (const context of [
      as({}),
      as({ wechartStore: 'http://evil.invalid' }),
      as({ wechartStore: `${STORE}/extra` }),
      {},
    ]) {
      expect(config.contextToAppId(context)).toBe('CUBE_APP_disk');
      expect(await config.schemaVersion(context)).toBe('disk');
      expect(config.repositoryFactory(context).localPath()).toMatch(/infra[/\\]cube[/\\]model$/);
      const files = await config.repositoryFactory(context).dataSchemaFiles();
      expect(files.map((file) => file.fileName)).toContain('cubes/orders.yml');
    }
    expect(requested).toEqual([]);
  });

  it('takes a draft name only of name characters, so it can’t reach another route', async () => {
    const config = load();

    for (const draft of ['../files', 'a/b', 'x'.repeat(65), '', 42]) {
      const context = as({ wechartStore: STORE, wechartDraft: draft });
      expect(config.contextToAppId(context)).toBe('CUBE_APP_http_host_docker_internal_4100');
      await config.repositoryFactory(context).dataSchemaFiles();
    }
    expect(requested.map((request) => request.url)).toEqual(
      Array.from({ length: 5 }, () => `${STORE}/api/cube-model/files`),
    );
  });

  /**
   * T275 / AC-250: THE SYSTEM SHALL grant Cube's `introspection` scope only to
   * the short-lived tokens its API signs to browse a data source and generate
   * cubes, never to a draft's token or to any other request's token.
   */
  it('grants introspection to the API’s introspection token alone, and never with a draft', async () => {
    const config = load();
    const defaults = ['graphql', 'meta', 'data'];

    expect(await config.contextToApiScopes({ wechartIntrospection: true }, defaults)).toEqual([
      ...defaults,
      'introspection',
    ]);
    // Every other token wechart signs: jobs as before, never introspection.
    expect(await config.contextToApiScopes({ wechartStore: STORE }, defaults)).toEqual([
      ...defaults,
      'jobs',
    ]);
    expect(await config.contextToApiScopes(undefined, defaults)).toEqual([...defaults, 'jobs']);
    // A draft, even one claiming it, is compiled to be checked and no more.
    expect(
      await config.contextToApiScopes({ wechartDraft: 'd1', wechartIntrospection: true }, defaults),
    ).toEqual(defaults);
    // Only the claim as the API sets it: `true`, not a string that says so.
    expect(
      await config.contextToApiScopes({ wechartIntrospection: 'true' }, defaults),
    ).not.toContain('introspection');
  });

  it('lets idle compiled models go, so the drafts Cube compiles do not pile up', () => {
    const config = load();

    // research/cube/configuration-deployment.md: TTL for compiled models, reset on each access.
    expect(config.maxCompilerCacheKeepAlive).toBe(10 * 60 * 1000);
    expect(config.updateCompilerCacheKeepAlive).toBe(true);
  });
});
