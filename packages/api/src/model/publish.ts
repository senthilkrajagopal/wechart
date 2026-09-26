import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { USER } from '../auth/guard';
import type { CubeClient } from '../cube/client';
import type { MetaCache } from '../cube/meta-cache';
import type { Config } from '../config';
import type { ModelFile, ModelFileStore } from '../server';
import { checkWithXcube } from '../xcube/check';
import type { XcubeAdmin } from '../xcube/client';
import { clashesOf, compiledIn } from './clashes';
import { refreshKeyProblemsOf } from './refreshKeys';
import { rollupProblemsOf } from './rollupReferences';
import type { Changeset } from '../xcube/changesets';
import { misnamedIn, redeclaredIn, severalIn, unreadableIn } from './split';
import type { CompileError } from './validate';

/**
 * The model, published (T142, AC-136) and served by xcube (T447).
 *
 * wechart's store holds the published files. A change is checked by xcube's
 * dry run, which compiles the whole model with it and plans each cube's
 * rollups, storing nothing (T445); only a model that compiles is written,
 * then sent to xcube as the model's next revision (T419). Cube reads nothing
 * from wechart: the store's routes for it and the drafts it read are gone
 * (T431, AC-327).
 */

/**
 * What may be published: YAML files, by plain paths — segments of name
 * characters, each starting with a letter, a digit or "_" (so never "." or
 * ".."), one name to a file. Not JavaScript, Python or Jinja: they run
 * inside Cube (spec Non-goals: dynamic models are read-only, AC-140).
 */
const MODEL_PATH = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.ya?ml$/;
/**
 * And nothing xcube wouldn't take: its rule is the one above, of up to 512
 * characters (T419's review; research `xcube-slice-2.md`, "Path rules"). A
 * file published past it would stop every send to xcube after it.
 */
const MAX_PATH_LENGTH = 512;

/**
 * What a file that isn't YAML is, by its extension, for saying why it isn't
 * published (AC-332): the other kinds Cube reads (research/cube/data-modeling.md,
 * "How each file type is compiled"), or else any other file.
 */
const NOT_YAML: readonly (readonly [RegExp, string])[] = [
  [/\.[cm]?js$/, 'JavaScript'],
  [/\.py$/, 'Python'],
  [/\.jinja$/, 'a Jinja template'],
  [/^(?!.*\.ya?ml$)/, 'not a YAML file'],
];

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
 * "Observed locally"). Every one refuses the publish, one already live in a
 * file the change leaves alone included (R29): xcube's probe of it fails, so
 * it is named here rather than answered as a check xcube couldn't make.
 */
function unknownInRollups(draft: readonly ModelFile[]): CompileError[] {
  return rollupProblemsOf(draft)
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
    afterPublish,
    xcube,
  }: {
    config: Config;
    client: CubeClient;
    /** What a publish makes stale: every cache of Cube's metadata (T322). */
    meta: Pick<MetaCache, 'invalidate'>;
    modelFiles: ModelFileStore | undefined;
    /**
     * Once a publish is committed: xcube is sent the changeset it was
     * checked as (T426), or the whole model where there is none (T419,
     * AC-333). It answers for itself: a send that fails is logged there, and
     * the publish stands for the next reconcile to send.
     */
    afterPublish?: (changeset?: Changeset) => Promise<unknown>;
    /**
     * xcube's admin routes, where the deployment names its model in xcube,
     * which check a change (T445). Without them nothing can be published: no
     * one else checks a change, or serves it (T431).
     */
    xcube?: XcubeAdmin;
  },
): void {
  /**
   * Publish changed files: checked by xcube's dry run of the whole model with
   * them in it, and written only if it compiles and plans (AC-136, AC-235).
   * xcube's errors come back on the files they are about.
   */
  app.post('/api/model/publish', USER, async (request, reply) => {
    const body = request.body as { files?: unknown; create?: unknown } | undefined;
    const files = Array.isArray(body?.files) ? (body.files as unknown[]) : [];
    const changed = files.filter(
      (file): file is ModelFile =>
        typeof (file as ModelFile | null)?.path === 'string' &&
        typeof (file as ModelFile).content === 'string' &&
        MODEL_PATH.test((file as ModelFile).path) &&
        (file as ModelFile).path.length <= MAX_PATH_LENGTH,
    );
    // Only YAML models are published: code in any other form runs where
    // Cube's secrets are (R28; AC-332).
    for (const file of files) {
      const path = (file as ModelFile | null)?.path;
      const kind =
        typeof path === 'string' && path !== ''
          ? NOT_YAML.find(([test]) => test.test(path))?.[1]
          : undefined;
      if (kind !== undefined)
        return reply
          .status(400)
          .send({ error: `Only YAML models can be published: ${path} is ${kind}.` });
    }
    if (changed.length === 0 || changed.length !== files.length)
      return reply.status(400).send({
        error: 'Send the changed YAML model files, each by a plain path inside the model.',
      });
    const template = changed.find((file) => JINJA.test(file.content));
    if (template !== undefined)
      return reply.status(400).send({
        error: `Only YAML models can be published: ${template.path} is a Jinja template, which Cube would render with its own environment.`,
      });
    // One cube or view per file: each file is one xcube item (T448, AC-337).
    const several = changed.map(severalIn).filter((each) => each !== undefined);
    if (several.length > 0) return reply.status(422).send({ errors: several });
    // A file that makes no item: never sent, so never checked (T426's review).
    const unreadable = changed.map(unreadableIn).filter((each) => each !== undefined);
    if (unreadable.length > 0) return reply.status(422).send({ errors: unreadable });
    // Names xcube's items refuse, which the files dry run would pass (T449's review).
    const misnamed = changed.flatMap(misnamedIn);
    if (misnamed.length > 0) return reply.status(422).send({ errors: misnamed });
    // xcube checks a change and serves it (T445, T447); without it, neither happens.
    if (modelFiles === undefined || xcube === undefined)
      return reply.status(409).send({
        error:
          modelFiles === undefined
            ? 'There is no model store here to publish to.'
            : 'xcube isn’t configured here (WECHART_XCUBE_MODEL and WECHART_XCUBE_ADMIN_TOKEN), so a change could not be checked or served.',
      });

    const live = await modelFiles.list();
    // Files generated from a data source are new ones: never over what the
    // store has, file or name (T276, AC-249), whatever the browser checked.
    if (body?.create === true) {
      // Cube's model names the cubes of files not read here as YAML; asked
      // as wechart asks it everything, and without it the files alone decide.
      const compiled = await client.metaExtended().then(compiledIn, (error: unknown) => {
        app.log.warn({ err: error }, 'could not read Cube’s model to check generated names');
        return [];
      });
      const clashes = clashesOf(changed, live, compiled);
      if (clashes.length > 0) return reply.status(422).send({ errors: clashes });
    }
    // A name another file declares: one item each (T426's review).
    const redeclared = redeclaredIn(changed, live);
    if (redeclared.length > 0) return reply.status(422).send({ errors: redeclared });
    const paths = new Set(changed.map((file) => file.path));
    const overTemplate = live.find((file) => paths.has(file.path) && JINJA.test(file.content));
    if (overTemplate !== undefined)
      return reply.status(409).send({
        error: `${overTemplate.path} is a Jinja template, and templates are read-only here.`,
      });
    const draft = [...live.filter((file) => !paths.has(file.path)), ...changed].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
    /** The change, checked: written, sent to xcube, and seen at once. */
    const commit = async (changeset?: Changeset) => {
      await modelFiles.write(changed);
      // Committed first, then sent: xcube is never ahead of wechart (T419).
      await afterPublish?.(changeset).catch((error: unknown) => {
        app.log.warn({ err: error }, 'could not send the published model to xcube');
      });
      // A model the user just published must not look stale to them (AC-137).
      meta.invalidate();
      return { version: versionOf(draft) };
    };

    /**
     * Checked by xcube's dry run (T445): one call compiles the whole model with
     * the change in it and plans each cube's rollups against it. Refused in
     * the order Cube's own checks refused: the compile, names the model
     * doesn't have, crons, then joins. Every break refuses it (R29).
     */
    const checked = await checkWithXcube({
      xcube,
      draft,
      changed,
      live,
      securityContext: config.securityContext,
      log: (error) => {
        app.log.warn({ err: error }, 'could not ask xcube to check the model');
      },
    });
    if (checked.kind === 'unreachable') return reply.status(502).send({ error: checked.error });
    if (checked.kind === 'invalid') return reply.status(422).send({ errors: checked.errors });
    const unknown = unknownInRollups(draft);
    if (unknown.length > 0) return reply.status(422).send({ errors: unknown });
    // Crons Cube's refresh worker can't run, in the files being changed (T258, AC-153).
    const crons = refreshKeyProblemsOf(changed);
    if (crons.length > 0) return reply.status(422).send({ errors: crons });
    const rollups = checked.rollups();
    if (rollups.kind === 'unasked') return reply.status(502).send({ error: rollups.error });
    if (rollups.kind === 'unjoinable') return reply.status(422).send({ errors: rollups.errors });
    return commit(checked.changeset);
  });
}
