import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * T447, AC-333: infra/cube/cube.js, the configuration Cube loads, is xcube's:
 * `require('xcube').config(options, cube)` names the claims wechart's tokens
 * carry, and xcube serves each model from its own schema, compiling and
 * switching revisions itself (docs/research/xcube-slice-2.md, "cube.js").
 * Cube no longer reads wechart's model store (T142's `contextToAppId`,
 * `repositoryFactory` and `schemaVersion`), and those keys belong to xcube:
 * its `config()` throws on them.
 *
 * Loaded as Cube loads it, CommonJS, with `xcube` answered here: the package
 * is installed only in the image, at `/cube/node_modules/xcube`.
 */
const CONFIG = fileURLToPath(new URL('../../../../infra/cube/cube.js', import.meta.url));

interface CubeConfig {
  contextToGroups: (context: { securityContext?: unknown }) => string[];
  contextToApiScopes: (context: unknown, defaultScopes: string[]) => Promise<string[]>;
  [key: string]: unknown;
}

type Load = (request: string, parent: unknown, isMain: boolean) => unknown;
const loader = Module as unknown as { _load: Load };
const realLoad = loader._load;

/** cube.js, with what it gave xcube's `config()`. */
function load(): { options: unknown; config: CubeConfig } {
  const given: { options?: unknown } = {};
  loader._load = (request, parent, isMain) =>
    request === 'xcube'
      ? {
          config: (options: unknown, cube: CubeConfig) => {
            given.options = options;
            return cube;
          },
        }
      : realLoad(request, parent, isMain);
  const require = createRequire(import.meta.url);
  delete require.cache[CONFIG];
  const config = require(CONFIG) as CubeConfig;
  return { options: given.options, config };
}

afterEach(() => {
  loader._load = realLoad;
});

describe('Cube’s configuration, xcube’s (T447)', () => {
  it('names the claims wechart’s tokens carry for the model and its revision', () => {
    const { options } = load();

    expect(options).toEqual({ modelClaim: 'wechartModel', revisionClaim: 'wechartRevision' });
  });

  it('leaves the model to xcube: no store, no draft, no version, no compiler-cache settings', () => {
    const { config } = load();

    // xcube's own; its config() refuses them (research, "Keys xcube owns"),
    // and the cache TTL isn't enforced under it (Gotcha 12).
    for (const key of [
      'contextToAppId',
      'repositoryFactory',
      'schemaVersion',
      'scheduledRefreshContexts',
      'maxCompilerCacheKeepAlive',
      'updateCompilerCacheKeepAlive',
    ])
      expect(config, key).not.toHaveProperty(key);
    // Nor the groups policies match: xcube's own `contextToGroups` reads the
    // context's `groups`, strings only, less its reserved group (T437;
    // research xcube-slice-4.md, "cube.js").
    expect(Object.keys(config).sort()).toEqual(['contextToApiScopes', 'orchestratorOptions']);
  });

  /**
   * T423, AC-319: the plan's runtime settings, a queue heartbeat of 5–10 s. A
   * query an instance was running when it stopped is let go after four
   * heartbeats and runs again: at Cube's default of 30 s that took 127.6 s,
   * at 5 s 29.0 s (research cube/ha-topology.md §1). Queries and builds
   * alike; every other queue setting left at its default.
   */
  it('beats its queues’ heartbeat every 5 s, for queries and builds alike', () => {
    const { config } = load();

    expect(config['orchestratorOptions']).toEqual({
      queryCacheOptions: { queueOptions: { heartBeatInterval: 5 } },
      preAggregationsOptions: { queueOptions: { heartBeatInterval: 5 } },
    });
  });

  /**
   * AC-250 (amended 2026-09-25): THE SYSTEM SHALL grant Cube's `introspection`
   * scope only to wechart's service credential, never to a user's token. xcube
   * grants a verified service token `jobs` and `introspection` whatever
   * cube.js says (research xcube-slice-4.md, "Scopes by role"), so cube.js
   * grants it to no context: T420's HS256 introspection claim is retired with
   * HS256 (T437).
   */
  it('grants introspection to no context: only xcube’s service credential has it', async () => {
    const { config } = load();
    const defaults = ['graphql', 'meta', 'data'];

    // The retired claim grants nothing: scoped as any other token.
    for (const context of [
      { wechartIntrospection: true },
      { wechartModel: 'dev', wechartRevision: 3, wechartIntrospection: true },
      { wechartIntrospection: 'true' },
    ])
      expect(await config.contextToApiScopes(context, defaults), JSON.stringify(context)).toEqual([
        ...defaults,
        'jobs',
      ]);
    // Nor do the defaults carry it, should CUBEJS_DEFAULT_API_SCOPES name it.
    const named = [...defaults, 'introspection'];
    expect(await config.contextToApiScopes(undefined, named)).toEqual([...defaults, 'jobs']);
    // A draft's claim means nothing since drafts went (T431, R29).
    expect(await config.contextToApiScopes({ wechartDraft: 'd1' }, named)).toEqual([
      ...defaults,
      'jobs',
    ]);
    // Every other token: jobs as before (a model without keys yet takes
    // HS256 builds), never introspection.
    expect(
      await config.contextToApiScopes({ tenant: 'acme', groups: ['sales'] }, defaults),
    ).toEqual([...defaults, 'jobs']);
    expect(
      await config.contextToApiScopes({ wechartModel: 'dev', wechartRevision: 3 }, defaults),
    ).toEqual([...defaults, 'jobs']);
    expect(await config.contextToApiScopes(undefined, defaults)).toEqual([...defaults, 'jobs']);
  });
});
