import { createHash } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { actorOf, recordIn } from '../audit/record';
import { USER } from '../auth/guard';
import type { AuditStore } from '../repos/audit';
import { refusalOf } from '../xcube/refusal';
import type { CubeClient } from '../cube/client';
import type { MetaCache } from '../cube/meta-cache';
import type { Config } from '../config';
import { ROOT_FOLDER_ID } from '../repos/catalog';
import type { ModelFile, ModelFileStore } from '../server';
import { checkWithXcube, folderOfFile } from '../xcube/check';
import type { XcubeAdmin } from '../xcube/client';
import { clashesOf, compiledIn } from './clashes';
import { refreshKeyProblemsOf } from './refreshKeys';
import { rollupProblemsOf, type RollupProblem } from './rollupReferences';
import type { StoredModelFile } from '../repos/model-files';
import type { Changeset } from '../xcube/changesets';
import { itemsOf } from '../xcube/items';
import type { HeldItem } from '../xcube/client';
import { chainOf, ROOT_ONLY, XCUBE_ROOT, type PublishedFolders } from '../xcube/folders';
import { sharedInPlace } from '../routes/shared-in-place';
import { planLanding, type LandingModel, type LandingWrite } from './landing';
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
 * The context a publish check's probes run as (T436, AC-321): with security
 * on, the Super-Admin group, which every folder's allowed set holds, so
 * xcube's folder gate admits every probe; a refused probe would pass without
 * checking anything (research `xcube-slice-4.md`, Gotcha 10). With it off,
 * the configured context, as before.
 */
export function probeContextOf(config: Config): Record<string, unknown> {
  if (config.security !== 'oidc' || config.superAdminGroup === undefined)
    return config.securityContext;
  return { groups: [config.superAdminGroup] };
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
    dependentsOf,
    seesModelsIn,
    audit,
    workspace,
  }: {
    /**
     * Models in My workspace (T347; AC-222, AC-282): saved and removed
     * through the workspace's overlay, never published. Without it, a
     * workspace's folder isn't one xcube serves, and nothing goes into it.
     */
    workspace?: {
      /** The workspace a folder is in, at any depth; null for a shared one. */
      readonly rootOf: (folderId: string) => Promise<string | null>;
      /**
       * Whether a proposal lands a workspace's models (T451): then a shared
       * folder's are changed only that way, never published in place (AC-278).
       */
      readonly proposed: boolean;
      /**
       * Why a new model may not go to this target, as the answer to send:
       * the user's read-write access to a shared folder (AC-282).
       */
      readonly targetRefusal: (
        request: FastifyRequest,
        target: unknown,
      ) => Promise<{ status: number; body: unknown } | undefined>;
      readonly save: (
        workspaceId: string,
        folderId: string,
        changed: readonly ModelFile[],
        target: string | undefined,
      ) => Promise<{ status: number; body: unknown }>;
      readonly remove: (
        workspaceId: string,
        folderId: string,
        path: string,
        /** Whose delete it is: the open proposal the file waits in is withdrawn by them (T350). */
        request: FastifyRequest,
      ) => Promise<{ status: number; body: unknown }>;
    };
    /**
     * Whether this user may see a folder's models (T427, AC-322): a refused
     * publish names the breaks there and counts the rest. Every folder where
     * not given (sign-in off).
     */
    seesModelsIn?: (request: FastifyRequest) => Promise<(folderId: string) => boolean>;
    /** Where every break of a refused publish is recorded (T427, AC-322). */
    audit?: Pick<AuditStore, 'record'>;
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
      /** Those the user may see, named, each with its folder where it has one (T526). */
      readonly charts: readonly {
        readonly id: string;
        readonly title: string | null;
        readonly folderId?: string | null;
      }[];
      readonly dashboards: readonly {
        readonly id: string;
        readonly title: string | null;
        readonly folderId?: string | null;
      }[];
      /** How many more there are that the user may not see: counted, never named (AC-322). */
      readonly hidden: number;
    }>;
    /**
     * The model items bound to any of these cubes, by full name, at their own
     * publish (T520, AC-365): the views that use one and the cubes that join
     * to one, from xcube's recorded bindings. Named where the user sees their
     * folder's models, counted where not.
     */
    dependentsOf?: (
      request: FastifyRequest,
      cubes: readonly string[],
      /** Items the change sends again, by full name: their new bindings are xcube's to judge. */
      except: readonly string[],
    ) => Promise<{
      readonly views: readonly { readonly name: string; readonly folderId: string }[];
      readonly cubes: readonly { readonly name: string; readonly folderId: string }[];
      readonly hidden: number;
    }>;
  },
): { readonly landing: ModelLanding } {
  /**
   * The publish check's refusal (T427, AC-322): its breaks in folders whose
   * models the user may see named, the rest counted, and every one recorded
   * in the audit trail with what the user was shown.
   */
  const refused = async (
    request: FastifyRequest,
    reply: FastifyReply,
    errors: readonly CompileError[],
    what: {
      readonly folderId: string;
      readonly files: readonly string[];
      /** A delete's refusal says so, in its line and its record (T427's review). */
      readonly deleting?: true;
    },
  ) => {
    const sees = (await seesModelsIn?.(request)) ?? (() => true);
    const refusal = refusalOf(errors, sees);
    await recordIn(
      audit,
      {
        actor: actorOf(request.wechartUser ?? null),
        event: 'publish-refused',
        folderId: what.folderId,
        item: { kind: 'model', id: what.files[0] ?? '', title: what.files.join(', ') },
        summary:
          what.deleting === true
            ? `Deleting ${what.files.join(', ')}: ${refusal.summary}`
            : refusal.summary,
        details: {
          ...(what.deleting === true ? { change: 'delete' } : {}),
          ...refusal.recorded,
          files: what.files,
        },
      },
      request.log,
    );
    return reply.status(422).send(refusal.answer);
  };

  /**
   * What depends on these short names in a folder, by its xcube id: the
   * views and cubes bound to them, and the charts and dashboards that name
   * them, each named where the user may see it and counted where not (T428,
   * T520; AC-275, AC-365).
   */
  const dependentsIn = async (
    request: FastifyRequest,
    names: readonly string[],
    xcubeId: string,
    /** Short names of the items the change sends again (T520's review). */
    resent: readonly string[] = [],
  ) => {
    const fullOf = (name: string) => (xcubeId === XCUBE_ROOT ? name : `${xcubeId}__${name}`);
    const full = names.map(fullOf);
    const referenced = names.length === 0 ? undefined : await referencedBy?.(request, full);
    // The model's own dependents first: views and joins (T520, AC-365).
    const models =
      names.length === 0 ? undefined : await dependentsOf?.(request, full, resent.map(fullOf));
    return {
      views: models?.views ?? [],
      cubes: models?.cubes ?? [],
      charts: referenced?.charts ?? [],
      dashboards: referenced?.dashboards ?? [],
      hidden: (referenced?.hidden ?? 0) + (models?.hidden ?? 0),
    };
  };

  /**
   * Refused while a chart or dashboard names any of these short names in a
   * folder, by its xcube id: the refusal, naming them; else nothing (T428,
   * AC-275). wechart checks its own items; xcube, its model's.
   */
  const inUse = async (
    request: FastifyRequest,
    names: readonly string[],
    xcubeId: string,
    /** Short names of the items the change sends again (T520's review). */
    resent: readonly string[] = [],
  ) => {
    if (names.length === 0 || (referencedBy === undefined && dependentsOf === undefined))
      return undefined;
    const { views, cubes, charts, dashboards, hidden } = await dependentsIn(
      request,
      names,
      xcubeId,
      resent,
    );
    if (
      charts.length === 0 &&
      dashboards.length === 0 &&
      views.length === 0 &&
      cubes.length === 0 &&
      hidden === 0
    )
      return undefined;
    const quoted = (titles: readonly { title: string | null }[]) =>
      titles.map((each) => `“${each.title ?? 'Untitled'}”`).join(', ');
    const named = (items: readonly { name: string }[]) =>
      items.map((each) => `“${each.name}”`).join(', ');
    const users = [
      ...(views.length === 0 ? [] : [`the view${views.length === 1 ? '' : 's'} ${named(views)}`]),
      ...(cubes.length === 0 ? [] : [`the cube${cubes.length === 1 ? '' : 's'} ${named(cubes)}`]),
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
    ];
    const listed =
      users.length < 2 ? users.join('') : `${users.slice(0, -1).join(', ')} and ${users.at(-1)!}`;
    return {
      error: `${names.map((name) => `“${name}”`).join(', ')} ${names.length === 1 ? 'is' : 'are'} still used by ${listed}.`,
      views: views.map(({ name, folderId }) => ({ name, folderId })),
      cubes: cubes.map(({ name, folderId }) => ({ name, folderId })),
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
   * What a model file's delete would be refused for, asked before its dialog
   * opens (T526; design 14, D1–D2): what depends on the cube or view it
   * declares, as the delete's own refusal names it, with each view's and
   * cube's file and each chart's and dashboard's folder to say where it is.
   * Asked as the delete is: by those who may change its folder, of a file
   * that is there.
   */
  app.get('/api/model/files/dependents', USER, async (request, reply) => {
    const { folder, path } = request.query as { folder?: unknown; path?: unknown };
    const folderId = typeof folder === 'string' && folder !== '' ? folder : ROOT_FOLDER_ID;
    if (typeof path !== 'string' || path === '')
      return reply.status(400).send({ error: 'Name the model file by its path.' });
    const refusal = await refusalIn?.(request, folderId);
    if (refusal !== undefined) return reply.status(refusal.status).send(refusal.body);
    /**
     * My workspace's (T347): nothing published depends on it, since nothing
     * of a workspace is published. What in the workspace uses it is xcube's
     * to refuse as its overlay is pushed without it, which the delete says.
     */
    if (workspace !== undefined && (await workspace.rootOf(folderId)) !== null) {
      const own = (await modelFiles?.list(folderId))?.find((each) => each.path === path);
      if (own === undefined)
        return reply.status(404).send({ error: `There’s no model file ${path} here.` });
      // Its id, which a proposal names it by: the delete dialog names the
      // proposal its delete withdraws (T350, AC-372).
      const stored = (await modelFiles?.inFolders?.([folderId]))?.find(
        (each) => each.path === path,
      );
      return {
        ...(stored === undefined ? {} : { fileId: stored.id }),
        declares: declaredIn(own.content)
          .filter(({ name }) => name !== '')
          .map(({ kind, name }) => ({ kind, name })),
        views: [],
        cubes: [],
        charts: [],
        dashboards: [],
        hidden: 0,
      };
    }
    // Refused here as the delete refuses them (T526's review).
    const xcubeId = ((await folders?.()) ?? ROOT_ONLY).ids.get(folderId);
    if (modelFiles?.remove === undefined || xcubeId === undefined)
      return reply.status(409).send({
        error: 'Models can’t be deleted here: xcube doesn’t serve this folder.',
      });
    const live = (await modelFiles.all?.()) ?? (await modelFiles.list());
    const inFolder = (each: ModelFile, id: string) => (each.folderId ?? ROOT_FOLDER_ID) === id;
    const file = live.find((each) => inFolder(each, folderId) && each.path === path);
    if (file === undefined)
      return reply.status(404).send({ error: `There’s no model file ${path} here.` });
    if (JINJA.test(file.content))
      return reply.status(409).send({
        error: `${path} is a Jinja template, and templates are read-only here.`,
      });
    const declares = declaredIn(file.content)
      .filter(({ name }) => name !== '')
      .map(({ kind, name }) => ({ kind, name }));
    const found = await dependentsIn(
      request,
      declares.map(({ name }) => name),
      xcubeId,
    );
    /** The file in its folder declaring an item, to say where it is. */
    const fileOf = (name: string, id: string) =>
      live.find(
        (each) => inFolder(each, id) && declaredIn(each.content).some((one) => one.name === name),
      )?.path;
    const placed = (items: readonly { name: string; folderId: string }[]) =>
      items.map(({ name, folderId: id }) => {
        const where = fileOf(name, id);
        return { name, folderId: id, ...(where === undefined ? {} : { file: where }) };
      });
    const foldered = (
      items: readonly { id: string; title: string | null; folderId?: string | null }[],
    ) => items.map(({ id, title, folderId: id2 }) => ({ id, title, folderId: id2 ?? null }));
    return {
      declares,
      views: placed(found.views),
      cubes: placed(found.cubes),
      charts: foldered(found.charts),
      dashboards: foldered(found.dashboards),
      hidden: found.hidden,
    };
  });

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
      // My workspace's: removed from its overlay first, then its store (T347).
      const inWorkspace = await workspace?.rootOf(folderId);
      if (workspace !== undefined && inWorkspace != null) {
        const answer = await workspace.remove(inWorkspace, folderId, path, request);
        return reply.status(answer.status).send(answer.body);
      }
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
        securityContext: probeContextOf(config),
        log: (error) => {
          app.log.warn({ err: error }, 'could not ask xcube to check a delete');
        },
      });
      if (checked.kind === 'unreachable') return reply.status(502).send({ error: checked.error });
      const removing = { folderId, files: [path], deleting: true as const };
      if (checked.kind === 'invalid') return refused(request, reply, checked.errors, removing);
      const rollups = checked.rollups();
      if (rollups.kind === 'unasked') return reply.status(502).send({ error: rollups.error });
      if (rollups.kind === 'unjoinable') return refused(request, reply, rollups.errors, removing);

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
      // folder xcube's tree doesn't hold is served by none, so nothing is
      // published into it; My workspace's are saved through its overlay (T347).
      const inWorkspace = (await workspace?.rootOf(folderId)) ?? null;
      /**
       * A shared folder's model changes only through a proposal (T451,
       * AC-278), as a dashboard does: copied into My workspace, changed and
       * proposed. Wherever workspaces hold models and proposals land them:
       * with sign-in on (with it off, the single user has no overlay yet).
       */
      if (workspace?.proposed === true && inWorkspace === null)
        return reply.status(409).send(sharedInPlace('model'));
      const served = (await folders?.()) ?? ROOT_ONLY;
      if (inWorkspace === null && !served.ids.has(folderId))
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
      /**
       * In My workspace (T347; AC-222, AC-282): saved through its overlay,
       * never published. A new file goes to the shared folder named, one the
       * user may write; a stored one keeps where it is to go.
       */
      if (workspace !== undefined && inWorkspace !== null) {
        const sent = (body as { targetFolderId?: unknown } | undefined)?.targetFolderId;
        let target: string | undefined;
        if (sent !== undefined) {
          const refused = await workspace.targetRefusal(request, sent);
          if (refused !== undefined) return reply.status(refused.status).send(refused.body);
          target = sent as string;
        }
        // One cube or view of a name to a folder, as anywhere (T426's review).
        const own = (modelFiles === undefined ? [] : await modelFiles.list(folderId)).filter(
          (file) => !changed.some((each) => each.path === file.path),
        );
        const again = redeclaredIn(changed, own);
        if (again.length > 0) return reply.status(422).send({ errors: again });
        const answer = await workspace.save(inWorkspace, folderId, changed, target);
        return reply.status(answer.status).send(answer.body);
      }
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
        // only the root holds; the whole model's, xcube's own (T436), and
        // without it the files alone decide.
        const compiled =
          folderId === ROOT_FOLDER_ID
            ? await client.modelMeta().then(compiledIn, (error: unknown) => {
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
      // An item this publish sends again binds anew, as xcube's check judges:
      // its old bindings are no dependence (T520's review).
      const resent = changed
        .flatMap((file) => declaredIn(file.content).map(({ name }) => name))
        .filter((name) => name !== '');
      const used = await inUse(request, renamedAway, served.ids.get(folderId)!, resent);
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
        securityContext: probeContextOf(config),
        log: (error) => {
          app.log.warn({ err: error }, 'could not ask xcube to check the model');
        },
      });
      if (checked.kind === 'unreachable') return reply.status(502).send({ error: checked.error });
      // Every break in any folder named where the user may see it, and
      // counted where not (T427, AC-322).
      const publishing = { folderId, files: changed.map((file) => file.path) };
      if (checked.kind === 'invalid') return refused(request, reply, checked.errors, publishing);
      const unknown = unknownInRollups(draft, served);
      if (unknown.length > 0) return refused(request, reply, unknown, publishing);
      // Crons Cube's refresh worker can't run, in the files being changed (T258,
      // AC-153): so in their folder, which each says (T427's review).
      const crons = refreshKeyProblemsOf(changed).map((problem) => ({
        ...problem,
        ...folderOfFile(changed.find((file) => file.path === problem.path)),
      }));
      if (crons.length > 0) return refused(request, reply, crons, publishing);
      const rollups = checked.rollups();
      if (rollups.kind === 'unasked') return reply.status(502).send({ error: rollups.error });
      if (rollups.kind === 'unjoinable') return refused(request, reply, rollups.errors, publishing);
      return commit(checked.changeset);
    }),
  );

  /**
   * A proposal's models, landed through xcube's changeset (T451; AC-321,
   * AC-288, AC-275, AC-322): checked by its dry run when proposed and again
   * at approval, each in its folder as `planLanding` places it, then applied
   * as a publish is, under the same one-at-a-time.
   */
  const landing: ModelLanding = {
    inTurn: oneAtATime,
    async check(request, { models, phase, record, proposalId, title, targetFolderId }) {
      const nothing = phase === 'approval' ? 'nothing was approved' : 'it wasn’t proposed';
      const no = (status: number, error: string): LandingCheck => ({
        kind: 'refused',
        status,
        body: { error },
      });
      if (modelFiles?.inFolders === undefined || xcube === undefined)
        return no(
          503,
          `Models can’t be landed here: xcube isn’t configured (WECHART_XCUBE_MODEL and WECHART_SERVICE_KEY), so ${nothing}.`,
        );
      const served = (await folders?.()) ?? ROOT_ONLY;
      const unserved = models.find((model) => !served.ids.has(model.folderId));
      if (unserved !== undefined)
        return no(
          409,
          `“${unserved.title}” is to go to a folder xcube doesn’t serve now (it may have been deleted), so ${nothing}.`,
        );
      const landsIn = [...new Set(models.map((model) => model.folderId))];
      const plan = planLanding(await modelFiles.inFolders(landsIn), models);
      if (plan.kind === 'refused') return no(409, plan.error);
      // Read-only, as publishing over one is (T428's review).
      const template = plan.writes.find(
        (write) => write.over !== null && JINJA.test(write.over.content),
      );
      if (template !== undefined)
        return no(
          409,
          `${template.over!.path} is a Jinja template, and templates are read-only here, so ${nothing}.`,
        );
      // A name renamed away is refused while a chart or dashboard names it (AC-275).
      for (const [folderId, names] of plan.renamedAway) {
        const used = await inUse(
          request,
          names,
          served.ids.get(folderId)!,
          plan.resent.get(folderId) ?? [],
        );
        if (used !== undefined) return { kind: 'refused', status: 409, body: used };
      }

      const live = (await modelFiles.all?.()) ?? (await modelFiles.list());
      const keyOf = (folderId: string, path: string) => `${folderId}\n${path}`;
      const goes = new Set(
        plan.writes.flatMap((write) => [
          keyOf(write.folderId, write.path),
          ...(write.from === undefined ? [] : [keyOf(write.folderId, write.from)]),
        ]),
      );
      const changed = plan.writes.map(({ folderId, path, content }): ModelFile =>
        folderId === ROOT_FOLDER_ID ? { path, content } : { folderId, path, content },
      );
      const draft = [
        ...live.filter((file) => !goes.has(keyOf(file.folderId ?? ROOT_FOLDER_ID, file.path))),
        ...changed,
      ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      if (landsIn.some((folderId) => folderId !== ROOT_FOLDER_ID))
        await beforeFolderPublish?.().catch((error: unknown) => {
          app.log.warn({ err: error }, 'could not put the folder tree to xcube before a landing');
        });

      /** Each break named where the user may see its folder's models, the rest counted (AC-322). */
      const breaks = async (errors: readonly CompileError[]): Promise<LandingCheck> => {
        const sees = (await seesModelsIn?.(request)) ?? (() => true);
        const refusal = refusalOf(errors, sees);
        const files = models.map((model) => model.title);
        if (record)
          await recordIn(
            audit,
            {
              actor: actorOf(request.wechartUser ?? null),
              event: 'publish-refused',
              folderId: targetFolderId,
              item:
                proposalId === undefined
                  ? { kind: 'model', id: models[0]?.fileId ?? '', title }
                  : { kind: 'proposal', id: proposalId, title },
              summary: `${phase === 'approval' ? 'Approving' : 'Proposing'} “${title}”: ${refusal.summary}`,
              details: {
                change: phase,
                ...(proposalId === undefined ? {} : { proposalId }),
                ...refusal.recorded,
                files,
              },
            },
            request.log,
          );
        return {
          kind: 'refused',
          status: 422,
          body: {
            error: `${String(errors.length)} ${errors.length === 1 ? 'item' : 'items'} would break, so ${nothing}.`,
            errors: refusal.answer.errors,
            hidden: refusal.answer.hidden ?? 0,
          },
        };
      };
      const checked = await checkWithXcube({
        xcube,
        draft,
        changed,
        live,
        folders: served.ids,
        securityContext: probeContextOf(config),
        log: (error) => {
          app.log.warn({ err: error }, 'could not ask xcube to check a proposal’s models');
        },
      });
      if (checked.kind === 'unreachable') return no(502, checked.error);
      if (checked.kind === 'invalid') return breaks(checked.errors);
      const unknown = unknownInRollups(draft, served);
      if (unknown.length > 0) return breaks(unknown);
      const crons = refreshKeyProblemsOf(changed).map((problem) => ({
        ...problem,
        ...folderOfFile(changed.find((file) => file.path === problem.path)),
      }));
      if (crons.length > 0) return breaks(crons);
      const rollups = checked.rollups();
      if (rollups.kind === 'unasked') return no(502, rollups.error);
      if (rollups.kind === 'unjoinable') return breaks(rollups.errors);

      return {
        kind: 'checked',
        writes: plan.writes,
        // Sent whole where xcube isn't what the store holds (T426): then what
        // it will hold is the draft's items alone, never its head's (T451's review).
        resolver:
          checked.changeset === undefined
            ? await landedResolver(
                undefined,
                { upserts: itemsOf(draft, served.ids), deletes: [] },
                served,
              )
            : await landedResolver(xcube, checked.changeset, served),
        commit: async () => {
          await modelFiles.write(
            plan.writes
              .filter((write) => write.from === undefined || modelFiles.relocate === undefined)
              .map(({ folderId, path, content }) => ({ folderId, path, content })),
          );
          for (const write of plan.writes) {
            if (write.from === undefined) continue;
            if (modelFiles.relocate !== undefined)
              await modelFiles.relocate(write.folderId, write.from, write);
            else await modelFiles.remove?.(write.folderId, write.from);
          }
          // Committed first, then sent: xcube is never ahead of wechart (T419).
          await afterPublish?.(checked.changeset).catch((error: unknown) => {
            app.log.warn({ err: error }, 'could not send a proposal’s models to xcube');
          });
          meta.invalidate();
          const now = await modelFiles.inFolders!(landsIn);
          return new Map(
            plan.writes.flatMap((write) => {
              const file = now.find(
                (each) => each.folderId === write.folderId && each.path === write.path,
              );
              return file === undefined ? [] : [[write.fileId, file] as const];
            }),
          );
        },
      };
    },
  };
  return { landing };
}

/**
 * Names resolved as xcube will once a changeset lands (T451): its upserts in
 * their folders, its deletes gone, nearest first from a folder up to the
 * root (research 3a, `Scope.resolve`), so a proposal's charts bind to the
 * models landing with them before anything is written.
 */
async function landedResolver(
  /** The head the changeset goes over; none where it is sent whole. */
  xcube: XcubeAdmin | undefined,
  changeset: Changeset,
  served: PublishedFolders,
): Promise<Pick<XcubeAdmin, 'resolve' | 'items'>> {
  const keyOf = (item: { folderId: string; name: string }) => `${item.folderId}/${item.name}`;
  const away = new Set([...changeset.deletes, ...changeset.upserts].map(keyOf));
  const items: HeldItem[] = [
    ...(xcube === undefined ? [] : await xcube.items()).filter((item) => !away.has(keyOf(item))),
    ...changeset.upserts.map((item) => ({
      folderId: item.folderId,
      name: item.name,
      kind: item.kind,
      fullName: item.folderId === XCUBE_ROOT ? item.name : `${item.folderId}__${item.name}`,
      bindings: {},
    })),
  ];
  const parents = new Map(
    [...served.parents].flatMap(([id, parent]) => {
      const xcubeId = served.ids.get(id);
      return xcubeId === undefined
        ? []
        : [[xcubeId, parent === null ? null : (served.ids.get(parent) ?? null)] as const];
    }),
  );
  return {
    items: () => Promise.resolve(items),
    resolve: (folderId, names) =>
      Promise.resolve(
        new Map(
          names.map((name) => {
            for (const at of chainOf(folderId, parents)) {
              const found = items.find((item) => item.folderId === at && item.name === name);
              if (found !== undefined) return [name, found.fullName] as const;
            }
            return [name, null] as const;
          }),
        ),
      ),
  };
}

/** What a landing is asked for (T451). */
export interface LandingRequest {
  readonly models: readonly LandingModel[];
  /** Proposing or approving: said in a refusal's words and its record. */
  readonly phase: 'proposal' | 'approval';
  /** Whether a refusal is recorded: not for the Propose dialog's own check. */
  readonly record: boolean;
  readonly proposalId?: string;
  /** What is proposed, as the record names it. */
  readonly title: string;
  readonly targetFolderId: string;
}

export type LandingCheck =
  | { readonly kind: 'refused'; readonly status: number; readonly body: Record<string, unknown> }
  | {
      readonly kind: 'checked';
      readonly writes: readonly LandingWrite[];
      /** Names as xcube will resolve them once it lands: what a proposal's charts bind with. */
      readonly resolver: Pick<XcubeAdmin, 'resolve' | 'items'>;
      /** Written, sent to xcube and seen: each model's file as it landed, by its workspace file's id. */
      readonly commit: () => Promise<ReadonlyMap<string, StoredModelFile>>;
    };

export interface ModelLanding {
  /** One at a time with publishes, from a landing's check to its commit. */
  readonly inTurn: <T>(work: () => Promise<T>) => Promise<T>;
  check(request: FastifyRequest, landing: LandingRequest): Promise<LandingCheck>;
}
