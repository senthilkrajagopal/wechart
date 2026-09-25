import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { CubeError, type CubeClient } from '../cube/client';
import type { MetaCache } from '../cube/meta-cache';
import type { Config } from '../config';
import type { ModelFile, ModelFileStore } from '../server';
import { refreshKeyProblemsOf } from './refreshKeys';
import { rollupProblemsOf, type RollupProblem } from './rollupReferences';
import { compileErrorsOf, type CompileError } from './validate';

/**
 * The model, served to Cube and published through it (T142, AC-136).
 *
 * Cube reads this store through `infra/cube/cube.js`: the live files, their
 * version — which Cube asks for on each request, and recompiles on a change —
 * and a draft, named in a request's security context. A publish is compiled
 * by Cube as a draft first; only a model Cube compiles goes live
 * (research/cube/spike-model-store-and-quick-calcs.md §1, §1a: a live model
 * that doesn't compile fails every request).
 */

/**
 * What may be published: YAML files, by plain paths — segments of name
 * characters, one name to a file. Not JavaScript, Python or Jinja: they run
 * inside Cube (spec Non-goals: dynamic models are read-only, AC-140).
 */
const MODEL_PATH = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.ya?ml$/;

/**
 * Cube renders a YAML file with Jinja first if it matches this
 * (research/cube/data-modeling.md, "How each file type is compiled", from
 * Cube's source): Cube's own test, so exactly what Cube would render. A
 * template can reach Cube's environment: `{{ env_var(...) }}` came back
 * with Cube's secret in its error text (research spike §1a, T142's review) —
 * the secret AC-007 keeps from the browser. So none is published.
 */
const JINJA = /{%|%}|{{|}}/;

const asCube = (files: readonly ModelFile[]) =>
  files.map(({ path, content }) => ({ fileName: path, content }));

/** The same files, the same version; any change, another. */
const versionOf = (files: readonly ModelFile[]) =>
  createHash('sha256')
    .update(JSON.stringify(asCube(files)))
    .digest('hex')
    .slice(0, 16);

/**
 * Rollups naming what the model doesn't have (T207, AC-189): Cube compiles
 * them, then fails queries on their cube (research/cube/pre-aggregations.md,
 * "Observed locally"). Those in a changed file are refused, and those
 * elsewhere that the change breaks; one already live in a file the change
 * leaves alone does not hold it up.
 */
function unknownInRollups(
  live: readonly ModelFile[],
  draft: readonly ModelFile[],
  changed: ReadonlySet<string>,
): CompileError[] {
  // Name by name: a change that mends some of a rollup's names leaves the rest as they were.
  const keyOf = (problem: RollupProblem, { list, name }: { list: string; name: string }) =>
    JSON.stringify([problem.path, problem.cube, problem.preAggregation, list, name]);
  const before = new Set(
    rollupProblemsOf(live).flatMap((problem) =>
      problem.unknown.map((unknown) => keyOf(problem, unknown)),
    ),
  );
  return rollupProblemsOf(draft)
    .map((problem) =>
      changed.has(problem.path)
        ? problem
        : {
            ...problem,
            unknown: problem.unknown.filter((each) => !before.has(keyOf(problem, each))),
          },
    )
    .filter((problem) => problem.unknown.length > 0)
    .map((problem) => ({
      path: problem.path,
      ...(problem.line === undefined ? {} : { line: problem.line }),
      message: `Pre-aggregation ${problem.preAggregation} names what the model doesn’t have: ${problem.unknown
        .map(({ list, name }) => `${name} (${list})`)
        .join(', ')}. Cube compiles it, then fails queries on ${problem.cube}.`,
      preAggregation: {
        cube: problem.cube,
        name: problem.preAggregation,
        unknown: problem.unknown,
      },
    }));
}

export function registerModelPublishing(
  app: FastifyInstance,
  {
    config,
    client,
    meta,
    modelFiles,
  }: {
    config: Config;
    client: CubeClient;
    meta: MetaCache;
    modelFiles: ModelFileStore | undefined;
  },
): void {
  /**
   * Drafts Cube is compiling: kept only while wechart waits for its answer,
   * and marked once Cube has read one — an answer given without reading it
   * was of another model.
   */
  const drafts = new Map<string, { files: readonly ModelFile[]; read: boolean }>();

  /** Cube, by the key it and this API share; with no key set, no one. */
  const fromCube = (request: FastifyRequest) => {
    const key = config.modelKey;
    const given = request.headers['x-wechart-model-key'];
    if (key === undefined || key === '' || typeof given !== 'string') return false;
    const [a, b] = [Buffer.from(given), Buffer.from(key)];
    return a.length === b.length && timingSafeEqual(a, b);
  };

  app.get('/api/cube-model/files', async (request, reply) => {
    if (!fromCube(request)) return reply.status(401).send({ error: 'Not Cube.' });
    return { files: asCube(modelFiles ? await modelFiles.list() : []) };
  });

  app.get('/api/cube-model/version', async (request, reply) => {
    if (!fromCube(request)) return reply.status(401).send({ error: 'Not Cube.' });
    // From the store each time, not kept here: another instance of this API
    // may have published, and Cube must see what the store holds.
    return { version: versionOf(modelFiles ? await modelFiles.list() : []) };
  });

  app.get('/api/cube-model/drafts/:id', async (request, reply) => {
    if (!fromCube(request)) return reply.status(401).send({ error: 'Not Cube.' });
    const draft = drafts.get((request.params as { id: string }).id);
    if (draft === undefined) return reply.status(404).send({ error: 'No such draft.' });
    draft.read = true;
    return { files: asCube(draft.files) };
  });

  /**
   * Publish changed files: compiled by Cube as a draft of the whole model
   * with them in it, and made live only if Cube compiles it (AC-136). Cube's
   * errors come back on the files they are about.
   */
  app.post('/api/model/publish', async (request, reply) => {
    const body = request.body as { files?: unknown } | undefined;
    const files = Array.isArray(body?.files) ? (body.files as unknown[]) : [];
    const changed = files.filter(
      (file): file is ModelFile =>
        typeof (file as ModelFile | null)?.path === 'string' &&
        typeof (file as ModelFile).content === 'string' &&
        MODEL_PATH.test((file as ModelFile).path),
    );
    if (changed.length === 0 || changed.length !== files.length)
      return reply.status(400).send({
        error: 'Send the changed YAML model files, each by a plain path inside the model.',
      });
    const template = changed.find((file) => JINJA.test(file.content));
    if (template !== undefined)
      return reply.status(400).send({
        error: `${template.path} is a Jinja template: templates are read-only here, and Cube would render one with its own environment.`,
      });
    if (config.cubeStoreUrl === undefined || modelFiles === undefined)
      return reply.status(409).send({
        error:
          'Cube is not reading this model store (WECHART_CUBE_STORE_URL), so a change could not be checked or seen.',
      });

    const live = await modelFiles.list();
    const paths = new Set(changed.map((file) => file.path));
    const overTemplate = live.find((file) => paths.has(file.path) && JINJA.test(file.content));
    if (overTemplate !== undefined)
      return reply.status(409).send({
        error: `${overTemplate.path} is a Jinja template, and templates are read-only here.`,
      });
    const draft = [...live.filter((file) => !paths.has(file.path)), ...changed].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
    const id = randomUUID();
    const held = { files: draft, read: false };
    drafts.set(id, held);
    const unread = () =>
      reply.status(502).send({
        error:
          'Cube answered without reading the change, so it was not checked and nothing was published. Is Cube told to read this store (WECHART_MODEL_STORES)?',
      });
    try {
      await client.meta({ wechartStore: config.cubeStoreUrl, wechartDraft: id });
    } catch (error) {
      // Cube's compiler refuses with a 500 and its errors — having read the
      // draft. A 500 without reading it is Cube failing, not the file.
      if (error instanceof CubeError && error.status === 500 && held.read)
        return reply.status(422).send({ errors: compileErrorsOf(error.message, changed) });
      /**
       * Cube asserts the `meta` scope before it compiles anything, so a draft
       * token refused it was never read: said as that, not as a store Cube
       * was not told of (T176's review; research/cube/api-scope-probes.md).
       */
      if (
        error instanceof CubeError &&
        error.status === 403 &&
        /API scope is missing/.test(error.message)
      )
        return reply.status(502).send({
          error: `Cube refused to check the change — ${error.message} for the context wechart checks drafts as — so nothing was published.`,
        });
      app.log.warn({ err: error }, 'could not ask Cube to compile the model');
      if (!held.read && error instanceof CubeError) return unread();
      return reply
        .status(502)
        .send({ error: 'Cube could not be asked to check the model, so nothing was published.' });
    } finally {
      drafts.delete(id);
    }
    if (!held.read) return unread();

    const rollups = unknownInRollups(live, draft, paths);
    if (rollups.length > 0) return reply.status(422).send({ errors: rollups });
    // Crons Cube's refresh worker can't run, in the files being changed (T258, AC-153).
    const schedules = refreshKeyProblemsOf(changed);
    if (schedules.length > 0) return reply.status(422).send({ errors: schedules });

    await modelFiles.write(changed);
    // A model the user just published must not look stale to them (AC-137).
    meta.invalidate();
    return { version: versionOf(draft) };
  });
}
