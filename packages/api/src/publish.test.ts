import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { CubeClient } from './cube/client';
import { MetaCache } from './cube/meta-cache';
import type { Config } from './config';
import { buildServer, type ModelFile, type ModelFileStore } from './server';
import { xcubeAdmin } from './xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from './xcube/fake';

/**
 * T142 / AC-136: WHEN the user saves model changes, THE SYSTEM SHALL
 * validate them against Cube before publishing and refuse to publish a model
 * Cube rejects, showing Cube's error per file.
 * Fails when: an invalid model is published, or the error is not attributed
 * to a file.
 *
 * Checked by xcube's dry run of the whole model with the change in it (T445),
 * here a stub xcube that answers as the research records the fork's routes
 * (`xcube/fake.ts`). Cube reads nothing from wechart (T431): no draft, and no
 * route of the store's. What wechart checks itself — paths, templates, names
 * a rollup lacks, crons, generated names — it checks as before.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: { tenant: 'acme' },
  modelDir: '',
};

/** A server whose publishes xcube checks: the given stub, or one that passes everything. */
function serve(options: Parameters<typeof buildServer>[0], stub = fakeXcube()) {
  return buildServer({
    xcube: xcubeAdmin({
      cubeApiUrl: config.cubeApiUrl,
      model: 'dev',
      token: FAKE_ADMIN_TOKEN,
      fetch: stub.fetch,
    }),
    ...options,
  });
}

/**
 * What a stub xcube was asked to check as a file set: each files dry run's
 * files. (Its model is never moved to items mode here, so the changeset's
 * dry run, tried first, answers `409 mode`, T426.)
 */
const checkedFiles = (stub: ReturnType<typeof fakeXcube>) =>
  stub.calls
    .filter((call) => call.path.endsWith('/snapshot?dryRun=true'))
    .map((call) => (call.body as { files: ModelFile[] }).files);

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

/**
 * A Cube that records when its model is read: a publish reads nothing of it
 * but, for generated files, its compiled model's names (T276).
 */
function cubeReading() {
  const client = new CubeClient({
    apiUrl: config.cubeApiUrl,
    apiSecret: 'secret',
    securityContext: config.securityContext,
  });
  const asked: string[] = [];
  return {
    cube: Object.create(client, {
      meta: {
        value: async () => {
          asked.push('meta');
          return { cubes: [] };
        },
      },
      metaExtended: { value: async () => ({ cubes: [] }) },
    }) as CubeClient,
    asked,
  };
}

const publish = (app: FastifyInstance, files: readonly ModelFile[]) =>
  app.inject({ method: 'POST', url: '/api/model/publish', payload: { files } });

describe('publishing model changes', () => {
  const edited = { ...ORDERS, content: 'cubes:\n  - name: orders\n    title: Orders\n' };

  it('asks xcube to check the whole model with the changes first, then publishes them', async () => {
    const store = memory([ORDERS, VIEW]);
    const metaCache = new MetaCache({ fetchMeta: async () => ({}) });
    const invalidate = vi.spyOn(metaCache, 'invalidate');
    const stub = fakeXcube();
    const { cube, asked } = cubeReading();
    const app = serve({ config, modelFiles: store, cube, metaCache }, stub);

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(200);
    // What xcube checked: the live files, with the change.
    expect(checkedFiles(stub)).toEqual([[edited, VIEW]]);
    // Cube's model is not read: no draft to compile there (T431).
    expect(asked).toEqual([]);
    // Then live, and the metadata cache let go of, so the new model is read at once (AC-137).
    expect(store.files).toEqual([edited, VIEW]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(response.json()).toEqual({ version: expect.any(String) });
    await app.close();
  });

  // T334's review: the folder checked is the request's, so a file naming its
  // own is stored in that one all the same.
  it('stores each file in the folder published to, whatever folder a file names', async () => {
    const store = memory([ORDERS, VIEW]);
    const app = serve({ config, modelFiles: store });

    const response = await app.inject({
      method: 'POST',
      url: '/api/model/publish',
      payload: { files: [{ ...edited, folderId: 'someone-elses' }] },
    });

    expect(response.statusCode).toBe(200);
    expect(store.files).toEqual([edited, VIEW]);
    await app.close();
  });

  it('refuses what xcube rejects, with its error on the file, and publishes nothing', async () => {
    const store = memory([ORDERS, VIEW]);
    const stub = fakeXcube();
    stub.refuse([{ path: null, kind: 'compile', message: 'no_such_member is not defined' }]);
    const app = serve({ config, modelFiles: store }, stub);
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
    // Nothing stored in xcube either: a dry run keeps nothing.
    expect(stub.head('dev')).toBeUndefined();
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
    const app = serve({ config, modelFiles: store, metaCache });

    await publish(app, [edited]);

    expect(order).toEqual(['write', 'invalidate']);
    await app.close();
  });

  it('says xcube could not be asked, rather than publishing unchecked', async () => {
    const store = memory([ORDERS]);
    const stub = fakeXcube();
    stub.down(true);
    const app = serve({ config, modelFiles: store }, stub);

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: string }>().error).toBe(
      'xcube could not be asked to check the model, so nothing was published.',
    );
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  /** T431: no one else checks a change, or serves it. */
  it('can’t publish where xcube isn’t configured, and says which settings name it', async () => {
    const store = memory([ORDERS]);
    const app = buildServer({ config, modelFiles: store });

    const response = await publish(app, [edited]);

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe(
      'xcube isn’t configured here (WECHART_XCUBE_MODEL and WECHART_XCUBE_ADMIN_TOKEN), so a change could not be checked or served.',
    );
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
      // Nothing xcube wouldn't take (T419's review; research, "Path rules"): a
      // segment starting with "-", or a path past 512 characters. Published
      // here, it would stop every send to xcube after it.
      'cubes/-orders.yml',
      `cubes/${'x'.repeat(510)}.yml`,
    ]) {
      const response = await publish(app, [{ path, content: 'cubes: []\n' }]);
      expect({ path, status: response.statusCode }).toEqual({ path, status: 400 });
    }
    // A model that isn't YAML is refused as that, naming the file (T433, AC-332).
    for (const [path, what] of [
      ['cubes/orders.js', 'JavaScript'],
      ['cubes/orders.mjs', 'JavaScript'],
      ['globals.py', 'Python'],
      ['cubes/orders.yml.jinja', 'a Jinja template'],
      ['cubes/orders.yaml.jinja', 'a Jinja template'],
      ['cubes/notes.txt', 'not a YAML file'],
      ['cubes/Orders.JS', 'not a YAML file'],
    ] as const) {
      const response = await publish(app, [{ path, content: 'cubes: []\n' }]);
      expect(response.json<{ error: string }>().error).toBe(
        `Only YAML models can be published: ${path} is ${what}.`,
      );
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
    const app = serve({ config, modelFiles: store, cube });

    // Cube's own test for a template: `{%`, `%}`, `{{` or `}}` (research/cube/data-modeling.md).
    for (const marker of ["{{ env_var('CUBEJS_API_SECRET') }}", '{% set x = 1 %}', 'a }} b']) {
      const response = await publish(app, [
        {
          path: 'cubes/orders.yml',
          content: `cubes:\n  - name: orders\n    description: "${marker}"\n`,
        },
      ]);
      expect(response.statusCode).toBe(400);
      // Said as what it is: only YAML models can be published (T433, AC-332).
      expect(response.json<{ error: string }>().error).toBe(
        'Only YAML models can be published: cubes/orders.yml is a Jinja template, which Cube would render with its own environment.',
      );
    }
    expect(asked).toBe(false);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('publishes a Jinja comment’s braces as the text they are: Cube renders none of it', async () => {
    const store = memory([ORDERS]);
    const app = serve({ config, modelFiles: store });
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
    const stub = fakeXcube();
    const app = serve({ config, modelFiles: store }, stub);

    const response = await publish(app, [
      { path: template.path, content: 'cubes:\n  - name: a\n' },
    ]);

    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toBe(
      'cubes/generated.yml is a Jinja template, and templates are read-only here.',
    );
    expect(store.files).toEqual([template]);
    // Refused before anything was checked.
    expect(checkedFiles(stub)).toEqual([]);
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

  it('is refused on the rollup, naming each unknown member, and nothing is published', async () => {
    const store = memory([CUSTOMERS, ORDERS]);
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });

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
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });
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

  /**
   * R29: every break refuses a publish, a rollup already refused before the
   * change included. This let a change to another file through while a live
   * rollup named what the model doesn't have; xcube's probe of that rollup
   * then failed, and the publish answered 502 rather than naming it (T431's
   * review).
   */
  it('refuses a change to another file while a live rollup it leaves alone names what the model doesn’t have (R29)', async () => {
    const broken = withRollup('CUBE.no_such_member');
    const store = memory([CUSTOMERS, broken]);
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });
    const titled = { ...CUSTOMERS, content: `${CUSTOMERS.content}    title: Customers\n` };

    const response = await publish(app, [titled]);

    expect(response.statusCode).toBe(422);
    expect(
      (response.json() as { errors: { preAggregation: unknown }[] }).errors.map(
        ({ preAggregation }) => preAggregation,
      ),
    ).toEqual([
      {
        cube: 'orders',
        name: 'by_country',
        unknown: [{ list: 'dimensions', name: 'CUBE.no_such_member' }],
      },
    ]);
    expect(store.files).toEqual([CUSTOMERS, broken]);
    await app.close();
  });

  it('refuses a change that mends only some of an untouched rollup’s names, naming the rest (R29)', async () => {
    const broken = withRollup('customers.region, customers.segment');
    const store = memory([CUSTOMERS, broken]);
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });
    // `region` is added; `segment` was already missing and still is.
    const withRegion = {
      ...CUSTOMERS,
      content: `${CUSTOMERS.content}      - name: region\n        sql: region\n        type: string\n`,
    };

    const response = await publish(app, [withRegion]);

    expect(response.statusCode).toBe(422);
    expect(
      (response.json() as { errors: { preAggregation: { unknown: unknown } }[] }).errors.map(
        ({ preAggregation }) => preAggregation.unknown,
      ),
    ).toEqual([[{ list: 'dimensions', name: 'customers.segment' }]]);
    expect(store.files).toEqual([CUSTOMERS, broken]);
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

  it('is refused on its line, saying why, and nothing is published', async () => {
    const store = memory([ORDERS]);
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });

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
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });
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
      const { cube } = cubeReading();
      const app = serve({ config, modelFiles: store, cube });
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
  const create = (app: FastifyInstance, files: readonly ModelFile[]) =>
    app.inject({ method: 'POST', url: '/api/model/publish', payload: { files, create: true } });
  const generated = (path: string, cube: string) => ({
    path,
    content: `cubes:\n  - name: ${cube}\n    sql_table: public.${cube}\n`,
  });

  it('refuses a file already stored, and a cube or view already declared, naming each', async () => {
    const store = memory([ORDERS, VIEW]);
    const stub = fakeXcube();
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube }, stub);

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
    // Nothing is written, the clashing or the rest; and xcube is not asked.
    expect(store.files).toEqual([ORDERS, VIEW]);
    expect(checkedFiles(stub)).toEqual([]);
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
    const stub = fakeXcube();
    const { cube } = cubeReading();
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
    const app = serve({ config, modelFiles: store, cube: compiled }, stub);

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
    expect(checkedFiles(stub)).toEqual([]);
    await app.close();
  });

  it('names the cube once when its file and its name are the same stored file’s', async () => {
    const store = memory([ORDERS]);
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });

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
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });

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
    const { cube } = cubeReading();
    const app = serve({ config, modelFiles: store, cube });
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

  type Seen = readonly ModelFile[];
  /** As the stub decides: the probed cube's rollups, over these files, joined — or Cube's refusal. */
  type Refuses = (cube: string, files: Seen) => { status: number; error: string } | undefined;
  /** By default, a rollup naming user.city in a file that declares no join. */
  const unjoined: Refuses = (cube, files) =>
    files.some(
      (file) =>
        file.content.includes(`name: ${cube}\n`) &&
        file.content.includes('user.city') &&
        !file.content.includes('joins:'),
    )
      ? { status: 400, error: REASON }
      : undefined;

  /**
   * A stub xcube whose check plans each probed cube's rollups over the files
   * it's asked to check, as `refuses` decides (T445): Cube's `/v1/sql` for one
   * member of the cube, a 400 where it can't join them. Cube itself is asked
   * nothing (`cube`, recording).
   */
  function cubeProbing(refuses: Refuses = unjoined) {
    const probed: unknown[] = [];
    const stub = fakeXcube();
    stub.answerProbes((probe, files) => {
      probed.push(probe.query);
      const member = [
        ...((probe.query['measures'] as string[] | undefined) ?? []),
        ...((probe.query['dimensions'] as string[] | undefined) ?? []),
      ][0];
      return refuses((member ?? '').split('.')[0] ?? '', files);
    });
    return { ...cubeReading(), probed, stub };
  }

  it('is refused on the rollup, in its file, with Cube’s reason, and nothing is published', async () => {
    const store = memory([USER]);
    const { cube, probed, stub } = cubeProbing();
    const app = serve({ config, modelFiles: store, cube }, stub);

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
    // One member of the rollup's cube, asked of xcube's check.
    expect(probed).toEqual([{ measures: ['base.count'] }]);
    await app.close();
  });

  it('publishes the same rollup once its cube declares the join', async () => {
    const store = memory([USER]);
    const { cube, stub } = cubeProbing();
    const app = serve({ config, modelFiles: store, cube }, stub);

    const response = await publish(app, [rollupOn(true)]);

    expect(response.statusCode).toBe(200);
    expect(store.files.map((file) => file.path)).toEqual(['cubes/base.yml', 'cubes/user.yml']);
    await app.close();
  });

  it('asks nothing of a change with no rollup in it', async () => {
    const store = memory([USER]);
    const { cube, probed, stub } = cubeProbing();
    const app = serve({ config, modelFiles: store, cube }, stub);

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
    const { cube, probed, stub } = cubeProbing(refuses);
    const app = serve({ config, modelFiles: store, cube }, stub);
    return { app, store, probed: probed as Record<string, unknown>[] };
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
      !(files.find((file) => file.path === 'cubes/user.yml')?.content.includes('joins:') ?? true)
        ? { status: 400, error: unreached }
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

  /**
   * R29: every break refuses a publish, one the change leaves alone that was
   * broken before it included. The draft check let this through (it asked
   * the live model too, and let an old refusal pass); xcube's sends no
   * `compare`, and refuses.
   */
  it('refuses a change that leaves a rollup, in a file it doesn’t touch, as broken as it was (R29)', async () => {
    const { app, store, probed } = serving([rollupOn(false), USER]);

    const response = await publish(app, [ORDERS]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      { errors: [joinRefusal('cubes/base.yml', 8, 'base', 'by_city', REASON)] },
    ]);
    expect(store.files.map((file) => file.path)).toEqual(['cubes/base.yml', 'cubes/user.yml']);
    // Asked once, of the model with the change in it: no second ask of the live one.
    expect(probed).toEqual([{ measures: ['base.count'] }]);
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
    expect(probed).toEqual([{ measures: ['ext.count'] }]);
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

    expect(probed).toEqual([{ measures: ['base.count'] }]);
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
      probed === 'base' ? { status: 400, error: REASON } : undefined,
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

  it('publishes nothing when xcube can’t check the rollups', async () => {
    const { app, store } = serving([USER], () => ({ status: 500, error: 'upstream timed out' }));

    const response = await publish(app, [rollupOn(true)]);

    expect([response.statusCode, response.json()]).toEqual([
      502,
      {
        error:
          'xcube could not check the rollups of base (upstream timed out), so nothing was published.',
      },
    ]);
    expect(store.files).toEqual([USER]);
    await app.close();
  });
});

/**
 * T448 / AC-337: THE SYSTEM SHALL keep one cube or one view per model file: …
 * a publish of a file declaring more than one is refused, naming them.
 * `Fails when: … a file declaring two cubes or views is published, or its
 * refusal doesn't name them.` One file is one xcube item, which holds one
 * cube or view (`xcube-slice-3a.md`, "Items"; R30).
 */
describe('one cube or view per model file (T448, AC-337)', () => {
  it('refuses a file declaring two or more, naming them, before xcube is asked', async () => {
    const store = memory([ORDERS]);
    const stub = fakeXcube();
    const app = serve({ config, modelFiles: store }, stub);
    const two = {
      path: 'cubes/sales.yml',
      content: 'cubes:\n  - name: sales\n  - name: returns\nviews:\n  - name: sales_view\n',
    };

    const response = await publish(app, [two]);

    expect([response.statusCode, response.json()]).toEqual([
      422,
      {
        errors: [
          {
            path: 'cubes/sales.yml',
            message:
              'A model file holds one cube or view, and this one declares 3: the cubes sales and returns, and the view sales_view. Put each in a file of its own.',
          },
        ],
      },
    ]);
    expect(checkedFiles(stub)).toEqual([]);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  /**
   * T449's review: from the move to items mode each file is an xcube item,
   * and xcube refuses a name outside its rule (`xcube-slice-3a.md`, "Names":
   * lower-case letters, digits and single underscores, starting with a
   * letter, at most 40 characters, no Python keyword). The check (a files
   * dry run) doesn't apply that rule, so a file xcube would refuse is refused
   * here, in xcube's own words, before it is committed and never served.
   */
  it('refuses a cube or view named as xcube won’t take it, in xcube’s words', async () => {
    const store = memory([ORDERS]);
    const stub = fakeXcube();
    const app = serve({ config, modelFiles: store }, stub);

    for (const [name, message] of [
      ['lineItems', 'is not a valid name'],
      ['Orders', 'is not a valid name'],
      ['a__b', 'is not a valid name'],
      ['_hidden', 'is not a valid name'],
      ['x'.repeat(41), 'is not a valid name'],
      ['class', "is a reserved word and can't be a name"],
    ] as const) {
      const response = await publish(app, [
        { path: 'cubes/named.yml', content: `cubes:\n  - name: ${name}\n` },
      ]);
      expect({ name, status: response.statusCode }).toEqual({ name, status: 422 });
      expect(response.json<{ errors: { message: string }[] }>().errors[0]?.message).toContain(
        `"${name}" ${message}`,
      );
    }
    expect(checkedFiles(stub)).toEqual([]);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  /**
   * T426's review (H1): in items mode a file that yields no item is never
   * sent to xcube, so it isn't checked there; its cube would be deleted and
   * the broken file kept. It is refused here: YAML that doesn't parse at its
   * line, and a file declaring nothing.
   */
  it('refuses a file that doesn’t parse, at its line, or declares no cube or view', async () => {
    const store = memory([ORDERS]);
    const stub = fakeXcube();
    const app = serve({ config, modelFiles: store }, stub);

    const broken = await publish(app, [
      { path: 'cubes/orders.yml', content: 'cubes:\n  - name: orders\n    title: [\n' },
    ]);
    expect(broken.statusCode).toBe(422);
    expect(broken.json<{ errors: { path: string; line?: number }[] }>().errors[0]).toMatchObject({
      path: 'cubes/orders.yml',
      line: expect.any(Number),
    });

    const empty = await publish(app, [
      { path: 'cubes/orders.yml', content: 'cubes:\n  name: x\n' },
    ]);
    expect([empty.statusCode, empty.json()]).toEqual([
      422,
      {
        errors: [
          {
            path: 'cubes/orders.yml',
            message:
              'A model file holds one cube or view, and this one declares none. Declare it under `cubes:` or `views:` as a list.',
          },
        ],
      },
    ]);
    expect(checkedFiles(stub)).toEqual([]);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  /**
   * T426's review (M1): a name another file already declares would replace
   * that file's cube in xcube, and the store would never match xcube again.
   */
  it('refuses a cube or view another file already declares, naming that file', async () => {
    const store = memory([ORDERS]);
    const app = serve({ config, modelFiles: store });

    const again = await publish(app, [
      { path: 'cubes/copy.yml', content: 'cubes:\n  - name: orders\n' },
    ]);
    expect([again.statusCode, again.json()]).toEqual([
      422,
      {
        errors: [
          { path: 'cubes/copy.yml', message: '`orders` is already a cube in cubes/orders.yml.' },
        ],
      },
    ]);

    // Two changed files declaring one name, likewise.
    const twice = await publish(app, [
      { path: 'cubes/a.yml', content: 'cubes:\n  - name: lines\n' },
      { path: 'cubes/b.yml', content: 'cubes:\n  - name: lines\n' },
    ]);
    expect(twice.statusCode).toBe(422);
    expect(twice.json<{ errors: { path: string; message: string }[] }>().errors).toEqual([
      { path: 'cubes/b.yml', message: '`lines` is already a cube in cubes/a.yml.' },
    ]);
    expect(store.files).toEqual([ORDERS]);
    await app.close();
  });

  it('publishes a file declaring one', async () => {
    const store = memory([ORDERS]);
    const app = serve({ config, modelFiles: store });
    const one = { path: 'cubes/sales.yml', content: 'cubes:\n  - name: sales\n' };

    const response = await publish(app, [one]);

    expect(response.statusCode).toBe(200);
    expect(store.files).toEqual([ORDERS, one]);
    await app.close();
  });
});
