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
    expect(Object.keys(config).sort()).toEqual(['contextToApiScopes', 'contextToGroups']);
  });

  it('matches access policies on the context’s own groups, each a string', () => {
    const { config } = load();

    expect(config.contextToGroups({ securityContext: { groups: ['sales', 7, 'ops'] } })).toEqual([
      'sales',
      'ops',
    ]);
    expect(config.contextToGroups({ securityContext: {} })).toEqual([]);
    expect(config.contextToGroups({})).toEqual([]);
  });

  /**
   * T275 / AC-250: THE SYSTEM SHALL grant Cube's `introspection` scope only to
   * the short-lived tokens its API signs to browse a data source and generate
   * cubes, never to any other request's token.
   */
  it('grants introspection to the API’s introspection token alone', async () => {
    const { config } = load();
    const defaults = ['graphql', 'meta', 'data'];

    // Introspection and nothing else: the token reads no model and loads no
    // data (research/cube/introspection-api.md, "Two further hardening steps").
    expect(await config.contextToApiScopes({ wechartIntrospection: true }, defaults)).toEqual([
      'introspection',
    ]);
    // Nor do the defaults carry it, should CUBEJS_DEFAULT_API_SCOPES name it.
    const named = [...defaults, 'introspection'];
    expect(await config.contextToApiScopes(undefined, named)).toEqual([...defaults, 'jobs']);
    // A draft's claim means nothing since drafts went (T431, R29): scoped as
    // any other token.
    expect(await config.contextToApiScopes({ wechartDraft: 'd1' }, named)).toEqual([
      ...defaults,
      'jobs',
    ]);
    // Every other token wechart signs: jobs as before, never introspection.
    expect(
      await config.contextToApiScopes({ tenant: 'acme', groups: ['sales'] }, defaults),
    ).toEqual([...defaults, 'jobs']);
    expect(
      await config.contextToApiScopes({ wechartModel: 'dev', wechartRevision: 3 }, defaults),
    ).toEqual([...defaults, 'jobs']);
    expect(await config.contextToApiScopes(undefined, defaults)).toEqual([...defaults, 'jobs']);
    // Nor does a model's claim widen it past introspection.
    expect(
      await config.contextToApiScopes(
        { wechartModel: 'dev', wechartRevision: 3, wechartIntrospection: true },
        defaults,
      ),
    ).toEqual(['introspection']);
    // Only the claim as the API sets it: `true`, not a string that says so.
    expect(
      await config.contextToApiScopes({ wechartIntrospection: 'true' }, defaults),
    ).not.toContain('introspection');
  });
});
