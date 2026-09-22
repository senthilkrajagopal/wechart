import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { CubeClient, CubeError } from './cube/client';
import { MetaCache } from './cube/meta-cache';
import type { Config } from './config';
import { buildServer, type ModelFile, type ModelFileStore } from './server';

/**
 * T142 / AC-136: WHEN the user saves model changes, THE SYSTEM SHALL
 * validate them against Cube before publishing and refuse to publish a model
 * Cube rejects, showing Cube's error per file.
 * Fails when: an invalid model is published, or the error is not attributed
 * to a file.
 *
 * Cube reads wechart's model through `infra/cube/cube.js`: the live files, a
 * version, and a draft named in the request's security context
 * (research/cube/spike-model-store-and-quick-calcs.md §1a). Here Cube is a
 * stub that reads the draft back through those same routes, as Cube does.
 */
const KEY = 'model-key';
const STORE = 'http://host.docker.internal:4100';
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  modelDir: '',
  modelKey: KEY,
  cubeStoreUrl: STORE,
};

/** The config with one optional setting left out. */
function without(key: 'modelKey' | 'cubeStoreUrl'): Config {
  const copy = { ...config };
  delete copy[key];
  return copy;
}

const ORDERS = { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n' };
const VIEW = { path: 'views/summary.yml', content: 'views:\n  - name: summary\n' };

function memory(initial: readonly ModelFile[]): ModelFileStore & { files: ModelFile[] } {
  const store = {
    files: [...initial],
    list: async () => store.files,
    seed: async () => undefined,
    write: async (files: readonly ModelFile[]) => {
      for (const file of files) {
        store.files = [...store.files.filter((each) => each.path !== file.path), file].sort(
          (a, b) => (a.path < b.path ? -1 : 1),
        );
      }
    },
  };
  return store;
}

/** A Cube whose `/v1/meta` reads the draft its context names, through wechart's own route. */
function cubeReading(
  /** The server, once built: Cube is made before the server that holds it. */
  holder: { app?: FastifyInstance },
  answer: (files: { fileName: string; content: string }[]) => unknown,
) {
  const client = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: 'secret',
    securityContext: config.securityContext,
  });
  const contexts: Record<string, unknown>[] = [];
  const meta = async (context?: Record<string, unknown>) => {
    contexts.push(context ?? {});
    const draft = context?.['wechartDraft'];
    if (holder.app === undefined) throw new Error('no server yet');
    const response = await holder.app.inject({
      method: 'GET',
      url: `/api/cube-model/${typeof draft === 'string' ? `drafts/${draft}` : 'files'}`,
      headers: { 'x-wechart-model-key': KEY },
    });
    return answer((response.json() as { files: { fileName: string; content: string }[] }).files);
  };
  return { cube: Object.create(client, { meta: { value: meta } }) as CubeClient, contexts };
}

const publish = (app: FastifyInstance, files: readonly ModelFile[]) =>
  app.inject({ method: 'POST', url: '/api/model/publish', payload: { files } });

describe('the model, as Cube reads it', () => {
  it('is served to Cube only with the key', async () => {
    const app = buildServer({ config, modelFiles: memory([ORDERS, VIEW]) });

    const without = await app.inject({ method: 'GET', url: '/api/cube-model/files' });
    const wrong = await app.inject({
      method: 'GET',
      url: '/api/cube-model/files',
      headers: { 'x-wechart-model-key': 'guess' },
    });
    const right = await app.inject({
      method: 'GET',
      url: '/api/cube-model/files',
      headers: { 'x-wechart-model-key': KEY },
    });

    expect(without.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    // Named as Cube's FileRepository names them: `fileName`.
    expect(right.json()).toEqual({
      files: [
        { fileName: 'cubes/orders.yml', content: ORDERS.content },
        { fileName: 'views/summary.yml', content: VIEW.content },
      ],
    });
    await app.close();
  });

  it('is not served at all where no key is set', async () => {
    const app = buildServer({ config: without('modelKey'), modelFiles: memory([ORDERS]) });

    const response = await app.inject({
      method: 'GET',
      url: '/api/cube-model/files',
      headers: { 'x-wechart-model-key': '' },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('has a version that stays while the files do, and changes when they do', async () => {
    const store = memory([ORDERS]);
    const app = buildServer({ config, modelFiles: store });
    const version = async () =>
      (
        await app.inject({
          method: 'GET',
          url: '/api/cube-model/version',
          headers: { 'x-wechart-model-key': KEY },
        })
      ).json<{ version: string }>().version;

    const first = await version();
    expect(await version()).toBe(first);
    await store.write([{ ...ORDERS, content: 'cubes:\n  - name: orders\n    title: O\n' }]);
    expect(await version()).not.toBe(first);
    await app.close();
  });
});

describe('publishing model changes', () => {
  const edited = { ...ORDERS, content: 'cubes:\n  - name: orders\n    title: Orders\n' };

  it('asks Cube to compile the changes as a draft first, then publishes them', async () => {
    const store = memory([ORDERS, VIEW]);
    const metaCache = new MetaCache({ fetchMeta: async () => ({}) });
    const invalidate = vi.spyOn(metaCache, 'invalidate');
    const holder: { app?: FastifyInstance } = {};
    let seen: { fileName: string; content: string }[] = [];
    const { cube, contexts } = cubeReading(holder, (files) => {
      seen = files;
      return { cubes: [] };
    });
    const app = buildServer({ config, modelFiles: store, cube, metaCache });
    holder.app = app;

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(200);
    // The draft Cube compiled: the live files, with the change.
    expect(seen).toEqual([
      { fileName: 'cubes/orders.yml', content: edited.content },
      { fileName: 'views/summary.yml', content: VIEW.content },
    ]);
    // Named in the security context, alongside this wechart's store.
    expect(contexts[0]).toEqual({ wechartStore: STORE, wechartDraft: expect.any(String) });
    // Then live, and the metadata cache let go of, so the new model is read at once (AC-137).
    expect(store.files).toEqual([edited, VIEW]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(response.json()).toEqual({ version: expect.any(String) });
    await app.close();
  });

  it('refuses what Cube rejects, with Cube’s error on the file, and publishes nothing', async () => {
    const store = memory([ORDERS, VIEW]);
    const holder: { app?: FastifyInstance } = {};
    const { cube, contexts } = cubeReading(holder, () => {
      throw new CubeError('Error: Compile errors:\nErrors:\nno_such_member is not defined\n', 500);
    });
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;
    const broken = {
      ...ORDERS,
      content: 'cubes:\n  - name: orders\n    sql: "{no_such_member}"\n',
    };

    const response = await publish(app, [broken]);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      errors: [{ path: 'cubes/orders.yml', message: 'no_such_member is not defined' }],
    });
    expect(store.files).toEqual([ORDERS, VIEW]);
    // The draft is gone once it has been answered.
    const draft = await app.inject({
      method: 'GET',
      url: `/api/cube-model/drafts/${String(contexts[0]?.['wechartDraft'])}`,
      headers: { 'x-wechart-model-key': KEY },
    });
    expect(draft.statusCode).toBe(404);
    await app.close();
  });

  it('lets go of the metadata cache after the files are written, not before (T143)', async () => {
    // Let go first, and a fetch in between would cache the old model for a minute.
    const order: string[] = [];
    const store = memory([ORDERS]);
    const write = store.write;
    store.write = async (files) => {
      order.push('write');
      await write(files);
    };
    const metaCache = new MetaCache({ fetchMeta: async () => ({}) });
    vi.spyOn(metaCache, 'invalidate').mockImplementation(() => {
      order.push('invalidate');
    });
    const holder: { app?: FastifyInstance } = {};
    const { cube } = cubeReading(holder, () => ({ cubes: [] }));
    const app = buildServer({ config, modelFiles: store, cube, metaCache });
    holder.app = app;

    await publish(app, [edited]);

    expect(order).toEqual(['write', 'invalidate']);
    await app.close();
  });

  it('says Cube could not be asked, rather than publishing unchecked', async () => {
    const store = memory([ORDERS]);
    const holder: { app?: FastifyInstance } = {};
    const { cube } = cubeReading(holder, () => {
      throw new Error('connect ECONNREFUSED');
    });
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(502);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('can’t publish where Cube isn’t reading this store', async () => {
    const store = memory([ORDERS]);
    const app = buildServer({ config: without('cubeStoreUrl'), modelFiles: store });

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(409);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('takes only YAML model files, by plain paths inside the model', async () => {
    const app = buildServer({ config, modelFiles: memory([ORDERS]) });

    for (const path of [
      '../etc/passwd.yml',
      'cubes/notes.txt',
      '/cubes/abs.yml',
      '',
      // Code runs inside Cube: JavaScript, Python, Jinja (spec Non-goals; AC-140).
      'cubes/orders.js',
      'globals.py',
      'cubes/orders.yml.jinja',
      // One file by one name: no `.`, no empty segment, nothing but name characters.
      './cubes/x.yml',
      'cubes//x.yml',
      'cubes/./x.yml',
      'cubes/x\ny.yml',
    ]) {
      const response = await publish(app, [{ path, content: 'cubes: []\n' }]);
      expect({ path, status: response.statusCode }).toEqual({ path, status: 400 });
    }
    await app.close();
  });

  it('refuses a Jinja template before Cube sees it: Cube would render it, secrets and all', async () => {
    // Observed: `{{ env_var('CUBEJS_API_SECRET') }}` in a draft came back with
    // the secret in Cube's own error text (research spike §1a).
    const store = memory([ORDERS]);
    let asked = false;
    const cube = Object.create(
      new CubeClient({ apiUrl: config.cubeApiUrl, apiSecret: 'secret', securityContext: {} }),
      {
        meta: {
          value: async () => {
            asked = true;
            return {};
          },
        },
      },
    ) as CubeClient;
    const app = buildServer({ config, modelFiles: store, cube });

    for (const marker of ["{{ env_var('CUBEJS_API_SECRET') }}", '{% set x = 1 %}', '{# note #}']) {
      const response = await publish(app, [
        {
          path: 'cubes/orders.yml',
          content: `cubes:\n  - name: orders\n    description: "${marker}"\n`,
        },
      ]);
      expect(response.statusCode).toBe(400);
    }
    expect(asked).toBe(false);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('never writes over a stored template', async () => {
    const template = {
      path: 'cubes/generated.yml',
      content: 'cubes:\n{% for n in ["a"] %}\n  - name: {{ n }}\n{% endfor %}\n',
    };
    const store = memory([template]);
    const app = buildServer({ config, modelFiles: store });

    const response = await publish(app, [
      { path: template.path, content: 'cubes:\n  - name: a\n' },
    ]);

    expect(response.statusCode).toBe(409);
    expect(store.files).toEqual([template]);
    await app.close();
  });

  it('publishes nothing that Cube answered without reading: its answer was of another model', async () => {
    // Cube not told to read this store answers from its directory, 200 and all.
    const store = memory([ORDERS]);
    const cube = Object.create(
      new CubeClient({ apiUrl: config.cubeApiUrl, apiSecret: 'secret', securityContext: {} }),
      { meta: { value: async () => ({ cubes: [] }) } },
    ) as CubeClient;
    const app = buildServer({ config, modelFiles: store, cube });

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(502);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('says Cube failed, not that it refused the file, when it failed without reading it', async () => {
    const store = memory([ORDERS]);
    const cube = Object.create(
      new CubeClient({ apiUrl: config.cubeApiUrl, apiSecret: 'secret', securityContext: {} }),
      {
        meta: {
          value: async () => {
            throw new CubeError("Error: wechart's model store answered 401 to version", 500);
          },
        },
      },
    ) as CubeClient;
    const app = buildServer({ config, modelFiles: store, cube });

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(502);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });
});
