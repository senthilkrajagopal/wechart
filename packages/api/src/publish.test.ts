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
  return {
    cube: Object.create(client, {
      meta: { value: meta },
      // `/v1/sql` under a draft whose rollups Cube can join, as T265 asks it.
      sqlUnder: { value: async () => ({ sql: {} }) },
    }) as CubeClient,
    contexts,
  };
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

    // Cube's own test for a template: `{%`, `%}`, `{{` or `}}` (research/cube/data-modeling.md).
    for (const marker of ["{{ env_var('CUBEJS_API_SECRET') }}", '{% set x = 1 %}', 'a }} b']) {
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

  it('publishes a Jinja comment’s braces as the text they are: Cube renders none of it', async () => {
    const store = memory([ORDERS]);
    const holder: { app?: FastifyInstance } = {};
    const { cube } = cubeReading(holder, () => ({ cubes: [] }));
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;
    const commented = {
      ...ORDERS,
      content: 'cubes:\n  - name: orders\n    description: "{# not a tag #}"\n',
    };

    const response = await publish(app, [commented]);

    expect(response.statusCode).toBe(200);
    expect(store.files).toEqual([commented]);
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

  it('says Cube refused the check for a missing scope, not that it reads another store (T176)', async () => {
    const store = memory([ORDERS]);
    const cube = Object.create(
      new CubeClient({ apiUrl: config.cubeApiUrl, apiSecret: 'secret', securityContext: {} }),
      {
        meta: {
          value: async () => {
            throw new CubeError('API scope is missing: meta', 403);
          },
        },
      },
    ) as CubeClient;
    const app = buildServer({ config, modelFiles: store, cube });

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(502);
    expect((response.json() as { error: string }).error).toContain('API scope is missing: meta');
    expect((response.json() as { error: string }).error).not.toContain('WECHART_MODEL_STORES');
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

/**
 * T207 / AC-189: IF a model change being published leaves a pre-aggregation
 * naming a measure, dimension, segment, time dimension or index column that
 * the model does not have, THEN THE SYSTEM SHALL refuse to publish the change
 * and show each unknown name on that pre-aggregation's row.
 *
 * Cube compiles such a rollup — the stub here does, as the real one did —
 * and then fails queries on its cube (research/cube/pre-aggregations.md,
 * "Observed locally"), so wechart refuses it after Cube's compile.
 */
describe('publishing a rollup that names what the model doesn’t have', () => {
  const CUSTOMERS = {
    path: 'cubes/customers.yml',
    content:
      'cubes:\n  - name: customers\n    sql_table: t\n    dimensions:\n      - name: country\n        sql: country\n        type: string\n',
  };
  const withRollup = (dimensions: string) => ({
    path: 'cubes/orders.yml',
    content: `cubes:\n  - name: orders\n    sql_table: t\n    measures:\n      - name: count\n        type: count\n    pre_aggregations:\n      - name: by_country\n        measures: [CUBE.count]\n        dimensions: [${dimensions}]\n`,
  });
  const compiling = () => {
    const holder: { app?: FastifyInstance } = {};
    return { holder, ...cubeReading(holder, () => ({ cubes: [] })) };
  };

  it('is refused on the rollup, naming each unknown member, and nothing is published', async () => {
    const store = memory([CUSTOMERS, ORDERS]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await publish(app, [withRollup('customers.country, CUBE.no_such_member')]);

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      errors: [
        {
          path: 'cubes/orders.yml',
          line: 8,
          message:
            'Pre-aggregation by_country names what the model doesn’t have: CUBE.no_such_member (dimensions). Cube compiles it, then fails queries on orders.',
          preAggregation: {
            cube: 'orders',
            name: 'by_country',
            unknown: [{ list: 'dimensions', name: 'CUBE.no_such_member' }],
          },
        },
      ],
    });
    expect(store.files).toEqual([CUSTOMERS, ORDERS]);
    await app.close();
  });

  it('is refused when the change takes away a member another file’s rollup names', async () => {
    const good = withRollup('customers.country');
    const store = memory([CUSTOMERS, good]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;
    const withoutCountry = {
      ...CUSTOMERS,
      content: 'cubes:\n  - name: customers\n    sql_table: t\n',
    };

    const response = await publish(app, [withoutCountry]);

    expect(response.statusCode).toBe(422);
    expect(
      (response.json() as { errors: { path: string; preAggregation: unknown }[] }).errors.map(
        ({ path, preAggregation }) => ({ path, preAggregation }),
      ),
    ).toEqual([
      {
        path: 'cubes/orders.yml',
        preAggregation: {
          cube: 'orders',
          name: 'by_country',
          unknown: [{ list: 'dimensions', name: 'customers.country' }],
        },
      },
    ]);
    expect(store.files).toEqual([CUSTOMERS, good]);
    await app.close();
  });

  it('does not hold up a change to another file over a rollup already live and unchanged by it', async () => {
    const broken = withRollup('CUBE.no_such_member');
    const store = memory([CUSTOMERS, broken]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;
    const titled = { ...CUSTOMERS, content: `${CUSTOMERS.content}    title: Customers\n` };

    const response = await publish(app, [titled]);

    expect(response.statusCode).toBe(200);
    expect(store.files).toEqual([titled, broken]);
    await app.close();
  });

  it('does not hold up a change that mends some of an untouched rollup’s names', async () => {
    const broken = withRollup('customers.region, customers.segment');
    const store = memory([CUSTOMERS, broken]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;
    // `region` is added; `segment` was already missing and still is.
    const withRegion = {
      ...CUSTOMERS,
      content: `${CUSTOMERS.content}      - name: region\n        sql: region\n        type: string\n`,
    };

    const response = await publish(app, [withRegion]);

    expect(response.statusCode).toBe(200);
    expect(store.files).toEqual([withRegion, broken]);
    await app.close();
  });
});

/**
 * T258 / AC-153: a refresh key's cron that Cube's refresh worker can't run is
 * refused at publish. Cube compiles it — its compile check only parses the
 * cron — then fails every query the rollup serves, and the worker's refresh
 * of it (research/cube/refresh-key-schedule.md, "Findings that change the plan").
 */
describe('publishing a refresh key Cube can’t run', () => {
  const rollupEvery = (every: string) => ({
    path: 'cubes/orders.yml',
    content: `cubes:\n  - name: orders\n    sql_table: t\n    measures:\n      - name: count\n        type: count\n    pre_aggregations:\n      - name: main\n        measures: [CUBE.count]\n        refresh_key:\n          every: "${every}"\n          timezone: America/Los_Angeles\n`,
  });
  const compiling = () => {
    const holder: { app?: FastifyInstance } = {};
    return { holder, ...cubeReading(holder, () => ({ cubes: [] })) };
  };

  it('is refused on its line, saying why, and nothing is published', async () => {
    const store = memory([ORDERS]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await publish(app, [rollupEvery('55 7 * * 1-5')]);

    expect(response.statusCode).toBe(422);
    const { errors } = response.json() as {
      errors: { path: string; line?: number; message: string }[];
    };
    expect(errors).toHaveLength(1);
    // Line 11: "every" under the rollup's refresh_key.
    expect(errors[0]).toMatchObject({ path: 'cubes/orders.yml', line: 11 });
    expect(errors[0]?.message).toBe(
      'Pre-aggregation main: Cube’s refresh worker can’t run "55 7 * * 1-5": Cube runs only crons of the form "[second] minute hour * * day-of-week", each of those a single number or *, with no ranges, lists, steps, names, day of the month or month.',
    );
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('refuses a cube’s own refresh key Cube can’t run too, which fails every query on the cube', async () => {
    const store = memory([ORDERS]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;
    const cubeKey = {
      path: 'cubes/orders.yml',
      content:
        'cubes:\n  - name: orders\n    sql_table: t\n    refresh_key:\n      every: "0 * * * 1"\n',
    };

    const response = await publish(app, [cubeKey]);

    expect(response.statusCode).toBe(422);
    const { errors } = response.json() as { errors: { line?: number; message: string }[] };
    expect(errors[0]?.line).toBe(5);
    expect(errors[0]?.message).toMatch(
      /^Cube orders: Cube would run "0 \* \* \* 1" every hour, every day/,
    );
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('publishes a cron Cube runs as written, and an interval', async () => {
    for (const every of ['0 8 * * *', '1 hour']) {
      const store = memory([ORDERS]);
      const { holder, cube } = compiling();
      const app = buildServer({ config, modelFiles: store, cube });
      holder.app = app;
      const response = await publish(app, [rollupEvery(every)]);
      expect(response.statusCode, every).toBe(200);
      await app.close();
    }
  });
});

/**
 * T276 / AC-249: IF a cube generated from a data source has the name or file
 * name of a cube or file already in the model store, THEN THE SYSTEM SHALL
 * refuse to save it, name the existing cube or file, and leave the existing
 * one unchanged. `Fails when: an existing model file changes, or a clashing
 * cube is saved, or the refusal does not name what it clashes with.`
 *
 * Generated files are published as new ones (`create: true`): whatever the
 * browser sent, the API refuses one that would overwrite a stored file or
 * declare a cube or view the store already has.
 */
describe('publishing generated cubes (AC-249)', () => {
  const compiling = () => {
    const holder: { app?: FastifyInstance } = {};
    return { holder, ...cubeReading(holder, () => ({ cubes: [] })) };
  };
  const create = (app: FastifyInstance, files: readonly ModelFile[]) =>
    app.inject({ method: 'POST', url: '/api/model/publish', payload: { files, create: true } });
  const generated = (path: string, cube: string) => ({
    path,
    content: `cubes:\n  - name: ${cube}\n    sql_table: public.${cube}\n`,
  });

  it('refuses a file already stored, and a cube or view already declared, naming each', async () => {
    const store = memory([ORDERS, VIEW]);
    const { holder, cube, contexts } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await create(app, [
      generated('cubes/orders.yml', 'public_orders'),
      generated('cubes/sales_orders.yml', 'orders'),
      generated('cubes/summary.yml', 'summary'),
      generated('cubes/customers.yml', 'customers'),
    ]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      {
        errors: [
          { path: 'cubes/orders.yml', message: 'cubes/orders.yml is already in the model store.' },
          {
            path: 'cubes/sales_orders.yml',
            message: '`orders` is already a cube in cubes/orders.yml.',
          },
          {
            path: 'cubes/summary.yml',
            message: '`summary` is already a view in views/summary.yml.',
          },
        ],
      },
    ]);
    // Nothing is written, the clashing or the rest; and Cube is not asked.
    expect(store.files).toEqual([ORDERS, VIEW]);
    expect(contexts).toEqual([]);
    await app.close();
  });

  /**
   * T276's review: a cube declared in a file wechart doesn't read as YAML — its
   * JavaScript, a Jinja template — is in the model all the same; Cube's
   * compiled model names it, and its file (`/v1/meta?extended`,
   * research/cube/data-apis.md).
   */
  it('refuses a cube declared in a file it cannot read, naming the file from Cube’s model', async () => {
    const store = memory([
      { path: 'cubes/orders.js', content: 'cube(`orders`, { sql_table: `public.orders` });\n' },
      { path: 'cubes/lines.yml', content: 'cubes:\n  - name: {{ "lines" }}\n' },
    ]);
    const { holder, cube, contexts } = compiling();
    const compiled = Object.create(cube, {
      metaExtended: {
        value: async () => ({
          cubes: [
            { name: 'orders', type: 'cube', fileName: 'cubes/orders.js' },
            { name: 'lines', type: 'cube', fileName: 'cubes/lines.yml' },
          ],
        }),
      },
    }) as CubeClient;
    const app = buildServer({ config, modelFiles: store, cube: compiled });
    holder.app = app;

    const response = await create(app, [
      generated('cubes/public_orders.yml', 'orders'),
      generated('cubes/public_lines.yml', 'lines'),
    ]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      {
        errors: [
          {
            path: 'cubes/public_orders.yml',
            message: '`orders` is already a cube in cubes/orders.js.',
          },
          {
            path: 'cubes/public_lines.yml',
            message: '`lines` is already a cube in cubes/lines.yml.',
          },
        ],
      },
    ]);
    expect(store.files.map((file) => file.path)).toEqual(['cubes/orders.js', 'cubes/lines.yml']);
    expect(contexts).toEqual([]);
    await app.close();
  });

  it('names the cube once when its file and its name are the same stored file’s', async () => {
    const store = memory([ORDERS]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await create(app, [generated('cubes/orders.yml', 'orders')]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      {
        errors: [
          { path: 'cubes/orders.yml', message: '`orders` is already a cube in cubes/orders.yml.' },
        ],
      },
    ]);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('publishes generated files that clash with nothing', async () => {
    const store = memory([ORDERS]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await create(app, [generated('cubes/customers.yml', 'customers')]);

    expect(response.statusCode).toBe(200);
    expect(store.files.map((file) => file.path)).toEqual([
      'cubes/customers.yml',
      'cubes/orders.yml',
    ]);
    await app.close();
  });

  it('still overwrites a stored file when an edit, not a generation, is published', async () => {
    const store = memory([ORDERS]);
    const { holder, cube } = compiling();
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;
    const edited = {
      path: 'cubes/orders.yml',
      content: 'cubes:\n  - name: orders\n    title: O\n',
    };

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(200);
    expect(store.files).toEqual([edited]);
    await app.close();
  });
});

/**
 * T265 / AC-235: WHEN the user publishes a model change in which a rollup
 * names members of cubes Cube cannot join, THE SYSTEM SHALL refuse the
 * publish, name the rollup and its file, and give Cube's reason.
 * `Fails when: such a change is published, or the refusal names no rollup or
 * gives no reason.`
 *
 * Cube compiles such a model, then fails at query or refresh time; its
 * `/v1/sql` for one member of the rollup's cube, under the draft, builds every
 * rollup's join as its refresh worker does, running nothing
 * (research/cube/rollup-join-paths.md, Q5). Here Cube is a stub that reads the
 * draft back and refuses as Cube does when the file declares no join.
 */
describe('publishing a rollup its cubes cannot be joined for (AC-235)', () => {
  const REASON = "Can't find join path to join 'user', 'base'";
  const rollupOn = (joined: boolean) => ({
    path: 'cubes/base.yml',
    content: [
      'cubes:',
      '  - name: base',
      '    sql_table: public.base',
      ...(joined
        ? [
            '    joins:',
            '      - name: user',
            '        sql: "{CUBE}.user_id = {user}.id"',
            '        relationship: many_to_one',
          ]
        : []),
      '    measures:',
      '      - name: count',
      '        type: count',
      '    pre_aggregations:',
      '      - name: by_city',
      '        measures: [count]',
      '        dimensions: [user.city]',
    ].join('\n'),
  });
  const USER = {
    path: 'cubes/user.yml',
    content:
      'cubes:\n  - name: user\n    sql_table: public.users\n    dimensions:\n      - name: city\n        sql: city\n        type: string\n',
  };

  type Seen = { fileName: string; content: string }[];
  /** As the stub decides: the probed cube's rollups, over these files, joined — or Cube's refusal. */
  type Refuses = (cube: string, files: Seen) => CubeError | undefined;
  /** By default, a rollup naming user.city in a file that declares no join. */
  const unjoined: Refuses = (cube, files) =>
    files.some(
      (file) =>
        file.content.includes(`name: ${cube}\n`) &&
        file.content.includes('user.city') &&
        !file.content.includes('joins:'),
    )
      ? new CubeError(REASON, 400)
      : undefined;

  /**
   * A Cube whose `/v1/sql` reads the model it's asked under — the draft, or
   * the live model with no draft named — and answers for the probed cube.
   */
  function cubeProbing(holder: { app?: FastifyInstance }, refuses: Refuses = unjoined) {
    const probed: { query: unknown; context: unknown }[] = [];
    const { cube } = cubeReading(holder, () => ({ cubes: [] }));
    const probing = Object.create(cube, {
      sqlUnder: {
        value: async (query: Record<string, unknown>, context?: Record<string, unknown>) => {
          probed.push({ query, context });
          const draft = context?.['wechartDraft'];
          if (holder.app === undefined) throw new Error('no server');
          const read = await holder.app.inject({
            method: 'GET',
            url:
              typeof draft === 'string'
                ? `/api/cube-model/drafts/${draft}`
                : '/api/cube-model/files',
            headers: { 'x-wechart-model-key': KEY },
          });
          const files = (read.json() as { files?: Seen }).files ?? [];
          const member = [
            ...((query['measures'] as string[] | undefined) ?? []),
            ...((query['dimensions'] as string[] | undefined) ?? []),
          ][0];
          const refused = refuses((member ?? '').split('.')[0] ?? '', files);
          if (refused !== undefined) throw refused;
          return { sql: {} };
        },
      },
    }) as CubeClient;
    return { cube: probing, probed };
  }

  it('is refused on the rollup, in its file, with Cube’s reason, and nothing is published', async () => {
    const store = memory([USER]);
    const holder: { app?: FastifyInstance } = {};
    const { cube, probed } = cubeProbing(holder);
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await publish(app, [rollupOn(false)]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      {
        errors: [
          {
            path: 'cubes/base.yml',
            // `- name: by_city`, the eighth line of the file.
            line: 8,
            message: `Pre-aggregation by_city can't be built: Cube cannot join its cubes. ${REASON}.`,
            preAggregation: { cube: 'base', name: 'by_city' },
          },
        ],
      },
    ]);
    expect(store.files).toEqual([USER]);
    // One member of the rollup's cube, asked under the draft with the store.
    expect(probed).toEqual([
      {
        query: { measures: ['base.count'] },
        context: { wechartStore: STORE, wechartDraft: expect.any(String) },
      },
    ]);
    await app.close();
  });

  it('publishes the same rollup once its cube declares the join', async () => {
    const store = memory([USER]);
    const holder: { app?: FastifyInstance } = {};
    const { cube } = cubeProbing(holder);
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await publish(app, [rollupOn(true)]);

    expect(response.statusCode).toBe(200);
    expect(store.files.map((file) => file.path)).toEqual(['cubes/base.yml', 'cubes/user.yml']);
    await app.close();
  });

  it('asks nothing of a change with no rollup in it', async () => {
    const store = memory([USER]);
    const holder: { app?: FastifyInstance } = {};
    const { cube, probed } = cubeProbing(holder);
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;

    const response = await publish(app, [ORDERS]);

    expect(response.statusCode).toBe(200);
    expect(probed).toEqual([]);
    await app.close();
  });

  /** A cube's file, from the lines beneath its name. */
  const cubeFile = (path: string, name: string, lines: readonly string[]) => ({
    path,
    content: `${['cubes:', `  - name: ${name}`, ...lines].join('\n')}\n`,
  });
  const serving = (files: readonly ModelFile[], refuses?: Refuses) => {
    const store = memory(files);
    const holder: { app?: FastifyInstance } = {};
    const { cube, probed } = cubeProbing(holder, refuses);
    const app = buildServer({ config, modelFiles: store, cube });
    holder.app = app;
    return { app, store, probed };
  };
  const joinRefusal = (path: string, line: number, cube: string, name: string, reason: string) => ({
    path,
    line,
    message: `Pre-aggregation ${name} can't be built: Cube cannot join its cubes. ${reason}.`,
    preAggregation: { cube, name },
  });

  it('is refused on a rollup in a file the change leaves alone, when the change breaks its join', async () => {
    const statuses = cubeFile('cubes/orders.yml', 'orders', [
      '    sql_table: public.orders',
      '    dimensions:',
      '      - name: status',
      '        sql: status',
      '        type: string',
    ]);
    const user = (joined: boolean) =>
      cubeFile('cubes/user.yml', 'user', [
        '    sql_table: public.users',
        ...(joined
          ? [
              '    joins:',
              '      - name: orders',
              '        sql: "{CUBE}.id = {orders.user_id}"',
              '        relationship: one_to_many',
            ]
          : []),
        '    dimensions:',
        '      - name: city',
        '        sql: city',
        '        type: string',
      ]);
    // base reaches orders only through user's join.
    const base = cubeFile('cubes/base.yml', 'base', [
      '    sql_table: public.base',
      '    joins:',
      '      - name: user',
      '        sql: "{CUBE}.user_id = {user}.id"',
      '        relationship: many_to_one',
      '    measures:',
      '      - name: count',
      '        type: count',
      '    pre_aggregations:',
      '      - name: by_status',
      '        measures: [count]',
      '        dimensions: [orders.status]',
    ]);
    const unreached = "Can't find join path to join 'base', 'orders'";
    const { app, store } = serving([base, statuses, user(true)], (probed, files) =>
      probed === 'base' &&
      !(
        files.find((file) => file.fileName === 'cubes/user.yml')?.content.includes('joins:') ?? true
      )
        ? new CubeError(unreached, 400)
        : undefined,
    );

    const response = await publish(app, [user(false)]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      // `- name: by_status`, the twelfth line of base's file.
      { errors: [joinRefusal('cubes/base.yml', 12, 'base', 'by_status', unreached)] },
    ]);
    expect(store.files).toEqual([base, statuses, user(true)]);
    await app.close();
  });

  it('lets a change through that leaves a rollup, in a file it doesn’t touch, as broken as it was', async () => {
    const { app, store, probed } = serving([rollupOn(false), USER]);

    const response = await publish(app, [ORDERS]);

    expect(response.statusCode).toBe(200);
    expect(store.files.map((file) => file.path)).toEqual([
      'cubes/base.yml',
      'cubes/orders.yml',
      'cubes/user.yml',
    ]);
    // Asked under the draft, then of the model Cube serves now: broken there already.
    expect(probed).toEqual([
      {
        query: { measures: ['base.count'] },
        context: { wechartStore: STORE, wechartDraft: expect.any(String) },
      },
      { query: { measures: ['base.count'] }, context: { wechartStore: STORE } },
    ]);
    await app.close();
  });

  it('reads rollups written under `preAggregations`, as Cube does', async () => {
    const written = rollupOn(false);
    const camel = {
      ...written,
      content: written.content.replace('pre_aggregations:', 'preAggregations:'),
    };
    const { app, store } = serving([USER]);

    const response = await publish(app, [camel]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      { errors: [joinRefusal('cubes/base.yml', 8, 'base', 'by_city', REASON)] },
    ]);
    expect(store.files).toEqual([USER]);
    await app.close();
  });

  it('asks of a cube with no members of its own through what its rollup names of it', async () => {
    const plain = cubeFile('cubes/base.yml', 'base', [
      '    sql_table: public.base',
      '    measures:',
      '      - name: count',
      '        type: count',
    ]);
    const extending = cubeFile('cubes/ext.yml', 'ext', [
      '    extends: base',
      '    pre_aggregations:',
      '      - name: by_city',
      '        measures: [count]',
      '        dimensions: [user.city]',
    ]);
    const { app, store, probed } = serving([plain, USER]);

    const response = await publish(app, [extending]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      { errors: [joinRefusal('cubes/ext.yml', 5, 'ext', 'by_city', REASON)] },
    ]);
    expect(probed.map((each) => each.query)).toEqual([{ measures: ['ext.count'] }]);
    expect(store.files).toEqual([plain, USER]);
    await app.close();
  });

  it('asks with a count of the cube’s own, not a member reaching into another cube', async () => {
    const reaching = cubeFile('cubes/base.yml', 'base', [
      '    sql_table: public.base',
      '    measures:',
      '      - name: user_cities',
      '        type: count_distinct',
      '        sql: "{user.city}"',
      '      - name: count',
      '        type: count',
      '    pre_aggregations:',
      '      - name: by_city',
      '        measures: [count]',
      '        dimensions: [user.city]',
    ]);
    const { app, probed } = serving([USER]);

    await publish(app, [reaching]);

    expect(probed.map((each) => each.query)).toEqual([{ measures: ['base.count'] }]);
    await app.close();
  });

  it('puts Cube’s refusal on the rollups naming the cubes it names, however they name them', async () => {
    const region = cubeFile('cubes/region.yml', 'region', [
      '    sql_table: public.regions',
      '    dimensions:',
      '      - name: name',
      '        sql: name',
      '        type: string',
    ]);
    const user = cubeFile('cubes/user.yml', 'user', [
      '    sql_table: public.users',
      '    dimensions:',
      '      - name: city',
      '        sql: city',
      '        type: string',
      '      - name: signed_up',
      '        sql: signed_up',
      '        type: time',
    ]);
    // Joined to region, and not to user: by path, and by a time dimension's object.
    const base = cubeFile('cubes/base.yml', 'base', [
      '    sql_table: public.base',
      '    joins:',
      '      - name: region',
      '        sql: "{CUBE}.region_id = {region}.id"',
      '        relationship: many_to_one',
      '    measures:',
      '      - name: count',
      '        type: count',
      '    pre_aggregations:',
      '      - name: by_region',
      '        measures: [count]',
      '        dimensions: [region.name]',
      '      - name: by_city',
      '        measures: [count]',
      '        dimensions: [CUBE.user.city]',
      '      - name: by_signup',
      '        measures: [count]',
      '        time_dimensions:',
      '          - dimension: user.signed_up',
      '            granularity: day',
    ]);
    const { app } = serving([region, user], (probed) =>
      probed === 'base' ? new CubeError(REASON, 400) : undefined,
    );

    const response = await publish(app, [base]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      {
        errors: [
          joinRefusal('cubes/base.yml', 15, 'base', 'by_city', REASON),
          joinRefusal('cubes/base.yml', 18, 'base', 'by_signup', REASON),
        ],
      },
    ]);
    await app.close();
  });

  it('publishes nothing when Cube can’t be asked about the rollups', async () => {
    const { app, store } = serving([USER], () => new CubeError('upstream timed out', 500));

    const response = await publish(app, [rollupOn(true)]);

    expect([response.statusCode, response.json()]).toEqual([
      502,
      { error: 'Cube could not be asked to check the rollups of base, so nothing was published.' },
    ]);
    expect(store.files).toEqual([USER]);
    await app.close();
  });
});
