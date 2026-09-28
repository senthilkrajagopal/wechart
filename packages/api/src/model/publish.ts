import { createHash } from 'node:crypto';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type { CubeClient } from '../cube/client';
import type { MetaCache } from '../cube/meta-cache';
import type { Config } from '../config';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { ModelFile, ModelFileStore } from '../server';
import { checkWithXcube } from '../xcube/check';
import type { XcubeAdmin } from '../xcube/client';
import { clashesOf, compiledIn } from './clashes';
import { refreshKeyProblemsOf } from './refreshKeys';
import { rollupProblemsOf, type RollupProblem } from './rollupReferences';
import type { Changeset } from '../xcube/changesets';
import { chainOf, ROOT_ONLY, XCUBE_ROOT, type PublishedFolders } from '../xcube/folders';
import { declaredIn, misnamedIn, redeclaredIn, severalIn, unreadableIn } from './split';
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
 * The files a folder's names reach (T452): its own, then each folder's above
 * it, nearest first, a file declaring a name a nearer one does left out, as
 * xcube binds names (research 3a, `Scope.resolve`).
 */
function onPath(files: readonly ModelFile[], chain: readonly string[]): ModelFile[] {
  const taken = new Set<string>();
  return chain.flatMap((folderId) =>
    files
      .filter((file) => (file.folderId ?? ROOT_FOLDER_ID) === folderId)
      .filter((file) => {
        const names = declaredIn(file.content).map((declared) => declared.name);
        if (names.some((name) => taken.has(name))) return false;
        for (const name of names) taken.add(name);
        return true;
      }),
  );
}

/**
 * Rollups naming what the model doesn't have (T207, AC-189): Cube compiles
 * them, then fails queries on their cube (research/cube/pre-aggregations.md,
 * "Observed locally"). Every one refuses the publish, one already live in a
 * file the change leaves alone included, in any folder (R29): xcube's probe
 * of it fails, so it is named here rather than answered as a check xcube
 * couldn't make.
 *
 * Each folder's cubes are read along that folder's own path (T452's review):
 * a nearer name in one folder never stands in for the one an ancestor's
 * cube binds. An error outside the root names its folder, as paths repeat.
 */
function unknownInRollups(draft: readonly ModelFile[], served: PublishedFolders): CompileError[] {
  return [...served.ids.keys()].flatMap((folderId) => {
    const own = new Set(
      draft
        .filter((file) => (file.folderId ?? ROOT_FOLDER_ID) === folderId)
        .flatMap((file) => declaredIn(file.content).map((declared) => declared.name)),
    );
    if (own.size === 0) return [];
    // Its own cubes come first on its path, so a problem on one of their
    // names is on its own file.
    return rollupProblemsOf(onPath(draft, chainOf(folderId, served.parents)))
      .filter((problem) => problem.unknown.length > 0 && own.has(problem.cube))
      .map((problem) => unknownIn(problem, folderId));
  });
}

function unknownIn(problem: RollupProblem, folderId: string): CompileError {
  return {
    path: problem.path,
    ...(folderId === ROOT_FOLDER_ID ? {} : { folderId }),
    ...(problem.line === undefined ? {} : { line: problem.line }),
    message: `Pre-aggregation ${problem.preAggregation} names what the model doesn’t have: ${problem.unknown
      .map(({ list, name }) => `${name} (${list})`)
      .join(', ')}. Cube compiles it, then fails queries on ${problem.cube}.`,
    preAggregation: {
      cube: problem.cube,
      name: problem.preAggregation,
      unknown: problem.unknown,
    },
  };
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
    refusalIn,
    folders,
    beforeFolderPublish,
    referencedBy,
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
    /**
     * Why this user may not change the models in a folder, as the answer to
     * send; nothing where they may (T334, AC-262, AC-266). Asked before
     * anything else of the request is read.
     */
    refusalIn?: (
      request: FastifyRequest,
      folderId: string,
    ) => Promise<{ status: number; body: unknown } | undefined>;
    /** The folders xcube's tree holds (T452); the root alone where not given. */
    folders?: () => Promise<PublishedFolders>;
    /** The tree put to xcube, before a publish into a folder other than the root (T452). */
    beforeFolderPublish?: () => Promise<unknown>;
    /**
     * The charts and dashboards that name any of these cubes, by full name
     * (T428, AC-275): what a delete or rename of them would leave bound to
     * nothing.
     */
    referencedBy?: (
      request: FastifyRequest,
      cubes: readonly string[],
    ) => Promise<{
      /** Those the user may see, named. */
      readonly charts: readonly { readonly id: string; readonly title: string | null }[];
      readonly dashboards: readonly { readonly id: string; readonly title: string | null }[];
      /** How many more there are that the user may not see: counted, never named (AC-322). */
      readonly hidden: number;
    }>;
  },
): void {
  /**
   * Refused while a chart or dashboard names any of these short names in a
   * folder, by its xcube id: the refusal, naming them; else nothing (T428,
   * AC-275). wechart checks its own items; xcube, its model's.
   */
  const inUse = async (request: FastifyRequest, names: readonly string[], xcubeId: string) => {
    if (names.length === 0 || referencedBy === undefined) return undefined;
    const full = names.map((name) => (xcubeId === XCUBE_ROOT ? name : `${xcubeId}__${name}`));
    const { charts, dashboards, hidden } = await referencedBy(request, full);
    if (charts.length === 0 && dashboards.length === 0 && hidden === 0) return undefined;
    const quoted = (titles: readonly { title: string | null }[]) =>
      titles.map((each) => `“${each.title ?? 'Untitled'}”`).join(', ');
    const users = [
      ...(charts.length === 0
        ? []
        : [`the chart${charts.length === 1 ? '' : 's'} ${quoted(charts)}`]),
      ...(dashboards.length === 0
        ? []
        : [`the dashboard${dashboards.length === 1 ? '' : 's'} ${quoted(dashboards)}`]),
      // Counted, never named, where the user may not see them (AC-322).
      ...(hidden === 0
        ? []
        : [`${String(hidden)} item${hidden === 1 ? '' : 's'} in folders you can’t see`]),
    ].join(' and ');
    return {
      error: `${names.map((name) => `“${name}”`).join(', ')} ${names.length === 1 ? 'is' : 'are'} still used by ${users}.`,
      charts: charts.map(({ id, title }) => ({ id, title })),
      dashboards: dashboards.map(({ id, title }) => ({ id, title })),
      hidden,
    };
  };

  /**
   * The model's publishes and deletes one at a time (T460, AC-273): each is
   * checked only once the one before it is committed and sent to xcube. One
   * checked while another's change was in wechart's store and not yet in
   * xcube found the two apart and sent the whole model, which, before xcube
   * 4754c2c960, bound every cube afresh: published cubes moved to a nearer
   * data source without being published again. From 4754c2c960 a whole send
   * keeps what it sends unchanged as it was bound (research
   * xcube-4754c2c960.md, Gotcha 3); one at a time still keeps each publish
   * its own changeset, checked against what is in xcube.
   */
  let last: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(work: () => Promise<T>): Promise<T> => {
    const run = last.then(work, work);
    last = run.catch(() => undefined);
    return run;
  };

  /**
   * Delete a model item: its file, from its folder (T428, AC-275, AC-291).
   * Refused while a chart or dashboard names it, naming them, and applied
   * only if xcube's check of the delete passes: xcube refuses one another
   * model item is bound to, naming it. Then removed from the store and sent.
   */
  app.delete('/api/model/files', USER, (request, reply) =>
    oneAtATime(async () => {
      const { folder, path } = request.query as { folder?: unknown; path?: unknown };
      const folderId = typeof folder === 'string' && folder !== '' ? folder : ROOT_FOLDER_ID;
      if (typeof path !== 'string' || path === '')
        return reply.status(400).send({ error: 'Name the model file to delete by its path.' });
      const refusal = await refusalIn?.(request, folderId);
      if (refusal !== undefined) return reply.status(refusal.status).send(refusal.body);
      const served = (await folders?.()) ?? ROOT_ONLY;
      const xcubeId = served.ids.get(folderId);
      if (modelFiles?.remove === undefined || xcubeId === undefined)
        return reply.status(409).send({
          error: 'Models can’t be deleted here: xcube doesn’t serve this folder.',
        });
      const live = (await modelFiles.all?.()) ?? (await modelFiles.list());
      const file = live.find(
        (each) => (each.folderId ?? ROOT_FOLDER_ID) === folderId && each.path === path,
      );
      if (file === undefined)
        return reply.status(404).send({ error: `There’s no model file ${path} here.` });
      // Read-only, as publishing over one is refused (T428's review).
      if (JINJA.test(file.content))
        return reply.status(409).send({
          error: `${path} is a Jinja template, and templates are read-only here.`,
        });

      const used = await inUse(
        request,
        declaredIn(file.content)
          .map(({ name }) => name)
          .filter((name) => name !== ''),
        xcubeId,
      );
      if (used !== undefined) return reply.status(409).send(used);
      // xcube checks a delete and serves it (T445, T447); without it, neither happens.
      if (xcube === undefined)
        return reply.status(409).send({
          error:
            'xcube isn’t configured here (WECHART_XCUBE_MODEL and WECHART_SERVICE_KEY), so a delete could not be checked or served.',
        });

      const draft = live.filter((each) => each !== file);
      const checked = await checkWithXcube({
        xcube,
        draft,
        changed: [file],
        live,
        folders: served.ids,
        securityContext: config.securityContext,
        log: (error) => {
          app.log.warn({ err: error }, 'could not ask xcube to check a delete');
        },
      });
      if (checked.kind === 'unreachable') return reply.status(502).send({ error: checked.error });
      if (checked.kind === 'invalid') return reply.status(422).send({ errors: checked.errors });
      const rollups = checked.rollups();
      if (rollups.kind === 'unasked') return reply.status(502).send({ error: rollups.error });
      if (rollups.kind === 'unjoinable') return reply.status(422).send({ errors: rollups.errors });

      await modelFiles.remove(folderId, path);
      // Committed first, then sent: xcube is never ahead of wechart (T419).
      await afterPublish?.(checked.changeset).catch((error: unknown) => {
        app.log.warn({ err: error }, 'could not send the deleted model item to xcube');
      });
      meta.invalidate();
      return { version: versionOf(draft) };
    }),
  );

  /**
   * Publish changed files: checked by xcube's dry run of the whole model with
   * them in it, and written only if it compiles and plans (AC-136, AC-235).
   * xcube's errors come back on the files they are about.
   */
  app.post('/api/model/publish', USER, (request, reply) =>
    oneAtATime(async () => {
      const body = request.body as
        { files?: unknown; create?: unknown; folderId?: unknown } | undefined;
      // The folder whose models change: the shared root's unless one is named (T334).
      const folderId =
        typeof body?.folderId === 'string' && body.folderId !== '' ? body.folderId : ROOT_FOLDER_ID;
      const refusal = await refusalIn?.(request, folderId);
      if (refusal !== undefined) return reply.status(refusal.status).send(refusal.body);
      // Published as the folder's items, under its xcube id (T452, AC-328). A
      // folder xcube's tree doesn't hold (a workspace's, until slice 5) is
      // served by none, so nothing is published into it.
      const served = (await folders?.()) ?? ROOT_ONLY;
      if (!served.ids.has(folderId))
        return reply.status(409).send({
          error:
            'This folder isn’t one xcube serves (a workspace’s, say), so its models can’t be published.',
        });
      const files = Array.isArray(body?.files) ? (body.files as unknown[]) : [];
      const changed = files
        .filter(
          (file): file is ModelFile =>
            typeof (file as ModelFile | null)?.path === 'string' &&
            typeof (file as ModelFile).content === 'string' &&
            MODEL_PATH.test((file as ModelFile).path) &&
            (file as ModelFile).path.length <= MAX_PATH_LENGTH,
        )
        // Each in the folder checked above, whatever a file says of its own
        // (T334's review): its path and text, and nothing else it was sent with.
        // In the folder published to (T452); a root file names none, as before.
        .map(({ path, content }): ModelFile =>
          folderId === ROOT_FOLDER_ID ? { path, content } : { folderId, path, content },
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
              : 'xcube isn’t configured here (WECHART_XCUBE_MODEL and WECHART_SERVICE_KEY), so a change could not be checked or served.',
        });

      // The whole model, every folder's files (T452), and this folder's own.
      const live = (await modelFiles.all?.()) ?? (await modelFiles.list());
      const inFolder = live.filter((file) => (file.folderId ?? ROOT_FOLDER_ID) === folderId);
      // Files generated from a data source are new ones: never over what the
      // folder has, file or name (T276, AC-249), whatever the browser checked.
      // All of them (`create: true`), or those named, published beside an
      // edit to a stored file as Generate's drafts are (T488, AC-346).
      const created =
        body?.create === true
          ? changed
          : Array.isArray(body?.create)
            ? changed.filter((file) => (body.create as unknown[]).includes(file.path))
            : [];
      if (created.length > 0) {
        // Cube's model names the cubes of files not read here as YAML, which
        // only the root holds; asked as wechart asks it everything, and
        // without it the files alone decide.
        const compiled =
          folderId === ROOT_FOLDER_ID
            ? await client.metaExtended().then(compiledIn, (error: unknown) => {
                app.log.warn(
                  { err: error },
                  'could not read Cube’s model to check generated names',
                );
                return [];
              })
            : [];
        const clashes = clashesOf(created, inFolder, compiled).map((clash) =>
          // Said as that folder's file, as its rollups' refusals are (T450's review).
          folderId === ROOT_FOLDER_ID ? clash : { ...clash, folderId },
        );
        if (clashes.length > 0) return reply.status(422).send({ errors: clashes });
      }
      // A name another file in the folder declares: one item each (T426's
      // review), and free in another folder (AC-271, T452).
      const redeclared = redeclaredIn(changed, inFolder);
      if (redeclared.length > 0) return reply.status(422).send({ errors: redeclared });
      // A name a changed file no longer declares is renamed away: refused while
      // a chart or dashboard still names it (T428, AC-275).
      const declaring = new Set(
        changed.flatMap((file) => declaredIn(file.content)).map(({ name }) => name),
      );
      const renamedAway = inFolder
        .filter((file) => changed.some((each) => each.path === file.path))
        .flatMap((file) => declaredIn(file.content).map(({ name }) => name))
        .filter((name) => name !== '' && !declaring.has(name));
      const used = await inUse(request, renamedAway, served.ids.get(folderId)!);
      if (used !== undefined) return reply.status(409).send(used);
      const paths = new Set(changed.map((file) => file.path));
      const overTemplate = inFolder.find(
        (file) => paths.has(file.path) && JINJA.test(file.content),
      );
      if (overTemplate !== undefined)
        return reply.status(409).send({
          error: `${overTemplate.path} is a Jinja template, and templates are read-only here.`,
        });
      const replaced = (file: ModelFile) =>
        (file.folderId ?? ROOT_FOLDER_ID) === folderId && paths.has(file.path);
      const draft = [...live.filter((file) => !replaced(file)), ...changed].sort((a, b) =>
        a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
      );
      // A folder's cubes join cubes in the folders above it: xcube needs the
      // tree it holds to have this folder, made a moment ago or not.
      if (folderId !== ROOT_FOLDER_ID)
        await beforeFolderPublish?.().catch((error: unknown) => {
          app.log.warn({ err: error }, 'could not put the folder tree to xcube before a publish');
        });
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
        folders: served.ids,
        securityContext: config.securityContext,
        log: (error) => {
          app.log.warn({ err: error }, 'could not ask xcube to check the model');
        },
      });
      if (checked.kind === 'unreachable') return reply.status(502).send({ error: checked.error });
      if (checked.kind === 'invalid') return reply.status(422).send({ errors: checked.errors });
      const unknown = unknownInRollups(draft, served);
      if (unknown.length > 0) return reply.status(422).send({ errors: unknown });
      // Crons Cube's refresh worker can't run, in the files being changed (T258, AC-153).
      const crons = refreshKeyProblemsOf(changed);
      if (crons.length > 0) return reply.status(422).send({ errors: crons });
      const rollups = checked.rollups();
      if (rollups.kind === 'unasked') return reply.status(502).send({ error: rollups.error });
      if (rollups.kind === 'unjoinable') return reply.status(422).send({ errors: rollups.errors });
      return commit(checked.changeset);
    }),
  );
}
