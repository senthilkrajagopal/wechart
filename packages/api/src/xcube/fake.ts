import { randomUUID } from 'node:crypto';

import { parse as parseYaml } from 'yaml';

import type { ModelFile } from '../server';
import type { ItemError } from './client';
import { treeHashOf, type TreeFolder } from './folders';
import { itemsHashOf, type Item } from './items';
import { contentHashOf } from './snapshot';

/**
 * A stub xcube for tests (T419; items mode, T449): its admin routes as
 * `docs/research/xcube-slice-2.md` and `xcube-slice-3a.md` record the fork's
 * (§"API surface we will use"), answered in memory, as a `fetch` a client can
 * be given. Every call is recorded, with the status it was answered.
 *
 * - `GET …/models/:model/revision`: `404 unknown_model` for a model never
 *   put, otherwise `{ model, generation, mode, current }`, `current` with
 *   its `itemsHash` (null for a files-mode revision).
 * - `PUT …/models/:model/folders`: the tree, `{ model, hash, security }`,
 *   each folder's `allowedGroups` kept as sent and `security` as given
 *   (slice 4); `400 invalid_folders` without the root `froot`; `409
 *   older_instances` when told to.
 * - `PUT …/models/:model/snapshot` with `items`: the switch, and after it
 *   the whole model; `200` for the current items whatever the base, `409
 *   conflict` when the base isn't current, `422 invalid_items` when told to
 *   refuse, `201` for a new revision. With `files`: slice 2's import, or
 *   `409 mode` once the model holds items.
 * - `PUT …/snapshot?dryRun=true` with `files`: the check (T445), with no
 *   mode check, as xcube's.
 * - `POST …/connections/:name/sql`, `POST …/cubestore/sql` and `POST
 *   …/sql/cancel` (T532; research `xcube-sql-runner.md`): one row by default,
 *   or as the test answers it; with `?overlay=`, `404 unknown_overlay` or
 *   `unknown_connection` unless the overlay holds the connection; held until
 *   cancelled when told to hold.
 * - `401 unauthorized` without `Bearer <admin token>`.
 */
export const FAKE_ADMIN_TOKEN = 'fake-xcube-admin-token-0123456789abcdef';

/** xcube's path rule and its Jinja test (research, "Path rules for folder-qualified file names"). */
const FILE_PATH =
  /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.(?:ya?ml|js|jinja|py)$/;
const JINJA = /{%|%}|{{|}}/;

export interface ModelError {
  readonly path: string | null;
  readonly line?: number;
  readonly column?: number;
  readonly kind: 'yaml' | 'compile';
  readonly message: string;
}

interface Revision {
  readonly revision: number;
  readonly contentHash: string;
  /** Null for a files-mode revision. */
  readonly itemsHash: string | null;
  readonly files: readonly ModelFile[];
  readonly items: readonly Item[];
}

interface Model {
  mode: 'files' | 'items';
  tree: readonly TreeFolder[] | undefined;
  revisions: Revision[];
  /** The folder gate (slice 4): off until a tree turns it on. */
  security?: boolean;
}

/** A data source as an overlay push brings it (T347). */
interface OverlayConnectionBody {
  readonly folderId: string;
  readonly name: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Record<string, unknown>;
  readonly sealed: Record<string, unknown>;
}

export interface FakeCall {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | null;
  readonly body: unknown;
  answered: number;
}

/**
 * A SQL run as the stub was asked it (T532; research `xcube-sql-runner.md`):
 * on a stored connection, an overlay's own, or Cube Store.
 */
export interface FakeSqlAsk {
  readonly model: string;
  readonly target:
    { readonly connection: string; readonly overlay: string | null } | { readonly cubeStore: true };
  readonly sql: string;
  readonly runId: string;
  readonly maxRows?: number;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

/** Every literal as `?`, as xcube's `redactedSql` has it: strings and numbers. */
const redactedOf = (sql: string) =>
  sql.replace(/'(?:[^']|'')*'/g, '?').replace(/\b\d+(?:\.\d+)?\b/g, '?');

export function fakeXcube({ tokens = [FAKE_ADMIN_TOKEN] }: { tokens?: readonly string[] } = {}) {
  let generation = randomUUID();
  let models = new Map<string, Model>();
  const calls: FakeCall[] = [];
  let isDown = false;
  let hanging = false;
  let dropping = false;
  /** How the check's probes are answered: Cube's `/v1/sql` over the candidate. */
  let probeAnswer:
    | ((
        probe: { id: string; query: Record<string, unknown> },
        files: readonly ModelFile[],
      ) => { status: number; error?: string } | undefined)
    | undefined;
  let conflicts = 0;
  /** A file set's errors (`ModelError`) or items' (`ItemError`), as the test gives them. */
  let refusal: readonly (ModelError | ItemError)[] | undefined;
  /** Cube's own text with a refusal, as `/v1/meta` would give it (research: `cubeMessage`). */
  let refusalMessage: string | null = null;
  let tooLarge = false;
  /** A tree hash to answer instead of the tree's own, as a stale answer would. */
  let wrongTreeHash: number = 0;
  /** Tree puts to refuse `409 older_instances`, as with an older xcube connected. */
  let olderInstances = 0;
  /** Overlays held, by `<model>/<id>` (T347), and the sequence their versions come from. */
  const overlays = new Map<
    string,
    {
      version: number;
      content: string;
      upserts: Item[];
      connections: OverlayConnectionBody[];
      expiresAt: string;
    }
  >();
  let overlayVersions = 0;
  /** Overlay pushes to refuse as told, in order: `422 invalid_secret`, say. */
  const overlayRefusals: { status: number; body: Record<string, unknown>; id?: string }[] = [];
  /** Each SQL run asked (T532), and how the test answers one: `undefined` is one row. */
  const sqlAsked: FakeSqlAsk[] = [];
  let sqlAnswer:
    | ((ask: FakeSqlAsk) => { status: number; body: Record<string, unknown> } | undefined)
    | undefined;
  /** Runs held until cancelled, or until their caller gives up (T533). */
  let holdingSql = false;
  /** How long a held run takes to be known, and so cancellable, after it arrives. */
  let sqlKnownAfterMs = 0;
  const sqlGoing = new Map<string, () => void>();
  /** A run's state, as `GET …/sql/runs/{runId}` answers it (T548): `ended` unless told. */
  let sqlState:
    ((runId: string) => { state: 'running' | 'stopping' | 'ended'; endsBy?: string }) | undefined;
  const sqlStatesAsked: string[] = [];

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const modelOf = (model: string): Model => {
    const found = models.get(model);
    if (found !== undefined) return found;
    const made: Model = { mode: 'files', tree: undefined, revisions: [] };
    models.set(model, made);
    return made;
  };
  const headOf = (model: string) => models.get(model)?.revisions.at(-1);
  /** Bindings held as recorded, by `<model>/<fullName>` (`holdItems`). */
  const recorded = new Map<string, Record<string, string>>();

  /** An item's full name: its own in the root, else `<folderId>__<name>` (research 3a, "Names"). */
  const fullNameOf = (item: { folderId: string; name: string }) =>
    item.folderId === 'froot' ? item.name : `${item.folderId}__${item.name}`;
  /**
   * A name resolved nearest first from a folder, over these items: the
   * folder's own, then each parent's to `froot` (research 3a, `Scope.resolve`).
   */
  const resolveIn = (
    items: readonly Item[],
    tree: readonly TreeFolder[],
    folderId: string,
    name: string,
  ): string | null => {
    const parents = new Map(tree.map((folder) => [folder.id, folder.parentId]));
    const seen = new Set<string>();
    for (
      let at: string | null | undefined = folderId;
      at != null && !seen.has(at);
      at = parents.get(at)
    ) {
      seen.add(at);
      const found = items.find((item) => item.folderId === at && item.name === name);
      if (found !== undefined) return fullNameOf(found);
    }
    return null;
  };
  /**
   * What an item bound at its publish (research 3a, "Bindings"): its own
   * name, each cube its joins name, and every segment of a view's
   * `cubes[].join_path`, nearest first from its folder (T590). Research 3a's
   * resolution table: "Every segment bound; the first by `bindOther`", the
   * nearest item other than itself; the rest as any name is bound.
   */
  const bindingsOf = (
    model: string,
    item: Item,
    items: readonly Item[],
    tree: readonly TreeFolder[],
  ) => {
    const held = recorded.get(`${model}/${fullNameOf(item)}`);
    if (held !== undefined) return held;
    const parsed = (parseYaml(item.yaml) ?? {}) as Record<string, unknown>;
    const declared = (parsed['cubes'] ?? parsed['views']) as Record<string, unknown>[] | undefined;
    const joins = (declared?.[0]?.['joins'] ?? []) as { name?: unknown }[];
    const bindings: Record<string, string> = { [item.name]: fullNameOf(item) };
    for (const join of joins)
      if (typeof join.name === 'string') {
        const bound = resolveIn(items, tree, item.folderId, join.name);
        if (bound !== null) bindings[join.name] = bound;
      }
    if (item.kind === 'view') {
      const others = items.filter((other) => other !== item);
      const paths = (declared?.[0]?.['cubes'] ?? []) as { join_path?: unknown }[];
      for (const entry of Array.isArray(paths) ? paths : [])
        if (typeof entry.join_path === 'string')
          entry.join_path.split('.').forEach((segment, at) => {
            const bound = resolveIn(at === 0 ? others : items, tree, item.folderId, segment);
            if (bound !== null) bindings[segment] = bound;
          });
    }
    return bindings;
  };

  /**
   * An item as a changeset's answer refers to it (research
   * `xcube-meta-revision-and-bindings.md`, `ItemRef`): bound nearest first
   * over `items`, only the names its YAML uses, never its own (Gotcha 18), and
   * a cube's data source as written, `default` where it names none, `null`
   * where it extends another, as xcube gives it for a model with no
   * connections (Gotcha 8).
   */
  const refOf = (item: Item, items: readonly Item[], tree: readonly TreeFolder[]) => {
    const parsed = (parseYaml(item.yaml) ?? {}) as Record<string, unknown>;
    const declared = (parsed['cubes'] ?? parsed['views']) as Record<string, unknown>[] | undefined;
    const own = declared?.[0] ?? {};
    const named = [
      ...((own['joins'] ?? []) as { name?: unknown }[]).map((join) => join.name),
      own['extends'],
    ].filter((name): name is string => typeof name === 'string');
    const bindings: Record<string, string> = {};
    for (const name of named) {
      const bound = resolveIn(items, tree, item.folderId, name);
      if (bound !== null) bindings[name] = bound;
    }
    const written = own['data_source'];
    return {
      folderId: item.folderId,
      name: item.name,
      fullName: fullNameOf(item),
      bindings,
      ...(item.kind === 'cube'
        ? {
            dataSource:
              typeof written === 'string'
                ? written
                : typeof own['extends'] === 'string'
                  ? null
                  : 'default',
          }
        : {}),
    };
  };

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    if (isDown) throw new TypeError('fetch failed');
    if (hanging)
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const call: FakeCall = {
      method,
      path: url.pathname + url.search,
      authorization: headers.get('authorization'),
      body,
      answered: 0,
    };
    calls.push(call);
    const answer = (status: number, content: unknown) => {
      call.answered = status;
      return json(status, content);
    };

    const given = /^Bearer\s+(\S+)$/i.exec(call.authorization ?? '')?.[1];
    if (given === undefined || !tokens.includes(given))
      return answer(401, { error: 'A valid xcube admin token is required', code: 'unauthorized' });

    /**
     * An overlay (T347; research `xcube-slice-5.md`, "PUT …/overlays/{id}",
     * `xcube-overlay-data-sources.md`): `404 unknown_model` with no head;
     * `409 conflict` with `currentVersion` when `baseVersion` isn't what it
     * holds; `422 invalid_items` for two items of one short name, or when
     * told to refuse; else stored at a new version (the same one for the same
     * content), `201` for a new id. `GET` answers its state or `404
     * unknown_overlay`; `DELETE` answers `204` whether or not it was there.
     */
    const overlayRoute = /\/v1\/semantic\/models\/([^/]+)\/overlays\/([^/]+)$/.exec(url.pathname);
    if (overlayRoute !== null) {
      const model = decodeURIComponent(overlayRoute[1]!);
      const id = decodeURIComponent(overlayRoute[2]!);
      const key = `${model}/${id}`;
      const stored = overlays.get(key);
      if (method === 'DELETE') {
        overlays.delete(key);
        call.answered = 204;
        return new Response(null, { status: 204 });
      }
      if (method === 'GET') {
        if (stored === undefined)
          return answer(404, { error: `Unknown overlay "${id}"`, code: 'unknown_overlay' });
        return answer(200, {
          model,
          id,
          version: stored.version,
          expiresAt: stored.expiresAt,
          upserts: stored.upserts.map(({ folderId, name, kind }) => ({
            folderId,
            name,
            kind,
            fullName: fullNameOf({ folderId, name }),
          })),
          deletes: [],
          connections: stored.connections.map(({ folderId, name, driver }) => ({
            folderId,
            name,
            fullName: fullNameOf({ folderId, name }),
            driver,
          })),
          instance: { revision: headOf(model)?.revision ?? null, state: 'idle' },
        });
      }
      if (method === 'PUT') {
        if (headOf(model) === undefined)
          return answer(404, { error: `Unknown model "${model}"`, code: 'unknown_model' });
        const put = body as {
          upserts: Item[];
          connections?: OverlayConnectionBody[];
          baseVersion?: number | null;
        };
        if (put.baseVersion !== undefined && put.baseVersion !== (stored?.version ?? null))
          return answer(409, {
            error: 'The overlay has moved on',
            code: 'conflict',
            currentVersion: stored?.version ?? null,
          });
        const at = overlayRefusals.findIndex((each) => each.id === undefined || each.id === id);
        const refused = at < 0 ? undefined : overlayRefusals.splice(at, 1)[0];
        if (refused !== undefined) return answer(refused.status, refused.body);
        const seen = new Map<string, string>();
        for (const item of put.upserts) {
          const other = seen.get(item.name);
          if (other !== undefined)
            return answer(422, {
              error: 'The overlay does not apply',
              code: 'invalid_items',
              errors: [
                {
                  folderId: item.folderId,
                  name: item.name,
                  kind: 'item',
                  message: `The overlay holds two items named "${item.name}" (in ${other} and ${item.folderId}); names in it resolve to its own items first, so they must differ`,
                },
              ],
              cubeMessage: null,
            });
          seen.set(item.name, item.folderId);
        }
        const content = JSON.stringify([put.upserts, put.connections ?? []]);
        const version = stored?.content === content ? stored.version : (overlayVersions += 1);
        overlays.set(key, {
          version,
          content,
          upserts: put.upserts,
          connections: put.connections ?? [],
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        });
        return answer(stored === undefined ? 201 : 200, {
          model,
          id,
          version,
          created: stored === undefined,
          revision: headOf(model)?.revision ?? null,
          expiresAt: overlays.get(key)!.expiresAt,
          items: put.upserts.map(({ folderId, name }) => ({
            folderId,
            name,
            fullName: fullNameOf({ folderId, name }),
          })),
        });
      }
    }

    /** A run's state (T548; xcube 2099b13f2d, research `xcube-2099b13f2d.md`). */
    const stateRoute = /\/v1\/semantic\/models\/([^/]+)\/sql\/runs\/([^/]+)$/.exec(url.pathname);
    if (stateRoute !== null && method === 'GET') {
      const runId = decodeURIComponent(stateRoute[2]!);
      sqlStatesAsked.push(runId);
      if (sqlGoing.has(runId))
        return answer(200, { model: decodeURIComponent(stateRoute[1]!), runId, state: 'running' });
      return answer(200, {
        model: decodeURIComponent(stateRoute[1]!),
        runId,
        ...(sqlState?.(runId) ?? { state: 'ended' }),
      });
    }

    /** The SQL runner's routes (T532; research `xcube-sql-runner.md`). */
    const sqlRoute =
      /\/v1\/semantic\/models\/([^/]+)\/(?:connections\/([^/]+)\/sql|(cubestore)\/sql|sql\/(cancel))$/.exec(
        url.pathname,
      );
    if (sqlRoute !== null && method === 'POST') {
      const model = decodeURIComponent(sqlRoute[1]!);
      const asked = body as Omit<FakeSqlAsk, 'model' | 'target'>;
      if (sqlRoute[4] === 'cancel') {
        const going = sqlGoing.get(asked.runId);
        going?.();
        return answer(200, { model, runId: asked.runId, found: going !== undefined });
      }
      const overlay = url.searchParams.get('overlay');
      const connection = sqlRoute[2] === undefined ? undefined : decodeURIComponent(sqlRoute[2]);
      if (connection !== undefined && overlay !== null) {
        const held = overlays.get(`${model}/${overlay}`);
        if (held === undefined)
          return answer(404, {
            error: `No overlay "${overlay}": it expired, was dropped, or never was`,
            code: 'unknown_overlay',
            statement: null,
            redactedSql: null,
          });
        if (!held.connections.some((each) => fullNameOf(each) === connection))
          return answer(404, {
            error: `No connection "${connection}"`,
            code: 'unknown_connection',
            statement: null,
            redactedSql: null,
          });
      }
      const ask: FakeSqlAsk = {
        ...asked,
        model,
        target: connection === undefined ? { cubeStore: true } : { connection, overlay },
      };
      sqlAsked.push(ask);
      const redactedSql = redactedOf(ask.sql);
      const statement = /^\s*explain\b/i.test(ask.sql) ? 'explain' : 'select';
      if (holdingSql)
        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            sqlGoing.delete(ask.runId);
            reject(init.signal?.reason);
          });
          const known = () =>
            sqlGoing.set(ask.runId, () => {
              sqlGoing.delete(ask.runId);
              resolve(
                answer(422, {
                  error: 'The run was cancelled',
                  code: 'cancelled',
                  statement,
                  redactedSql,
                  durationMs: 5,
                }),
              );
            });
          if (sqlKnownAfterMs === 0) known();
          else setTimeout(known, sqlKnownAfterMs);
        });
      const given = sqlAnswer?.(ask);
      if (given !== undefined) return answer(given.status, given.body);
      return answer(200, {
        columns: [{ name: 'one', type: 'int4' }],
        rows: [[1]],
        rowCount: 1,
        truncated: null,
        durationMs: 1,
        statement,
        redactedSql,
      });
    }

    const route =
      /\/v1\/semantic\/models\/([^/]+)\/(revision|snapshot|folders|changesets|items|resolve)$/.exec(
        url.pathname,
      );
    if (route === null) return answer(404, { error: 'Not found', code: 'not_found' });
    const model = decodeURIComponent(route[1]!);
    const head = headOf(model);

    if (route[2] === 'revision' && method === 'GET') {
      const known = models.get(model);
      if (known === undefined)
        return answer(404, { error: `Unknown model "${model}"`, code: 'unknown_model' });
      return answer(200, {
        model,
        generation,
        mode: known.mode,
        current:
          head === undefined
            ? null
            : {
                revision: head.revision,
                contentHash: head.contentHash,
                itemsHash: head.itemsHash,
                files: head.files.length,
              },
        instance: {
          revision: head?.revision ?? null,
          state: head === undefined ? 'none' : 'active',
        },
      });
    }

    /**
     * A changeset (T426; research 3a, "POST …/changesets"): `409 mode` on a
     * model holding a file set. Its dry run answers `valid`, the errors it
     * is told to refuse with, and each probe run against the items it would
     * make. Applied, it is `200` when the result is the head whatever the
     * base, `409 conflict` on a stale base, `422 invalid_items` when told to
     * refuse, and `201` for a new revision.
     */
    /** The head's items (research 3a, "GET …/items"): each one's folder, name and kind. */
    if (route[2] === 'items' && method === 'GET') {
      const known = models.get(model);
      if (known === undefined || head === undefined)
        return answer(404, { error: `Unknown model "${model}"`, code: 'unknown_model' });
      return answer(200, {
        model,
        revision: head.revision,
        mode: known.mode,
        items: head.items.map((item) => ({
          folderId: item.folderId,
          name: item.name,
          kind: item.kind,
          fullName: fullNameOf(item),
          bindings: bindingsOf(
            model,
            item,
            head.items,
            known.tree ?? [{ id: 'froot', parentId: null }],
          ),
        })),
      });
    }

    /** Names resolved nearest first from a folder (research 3a, "POST …/resolve"). */
    if (route[2] === 'resolve' && method === 'POST') {
      const known = models.get(model);
      const { folderId, names, overlay } = body as {
        folderId: string;
        names: string[];
        overlay?: string;
      };
      const tree = known?.tree ?? [];
      // Through an overlay (T347): its items first by short name, whatever
      // their folder; one gone is a 410 (research `xcube-slice-5.md`).
      const through = overlay === undefined ? undefined : overlays.get(`${model}/${overlay}`);
      if (overlay !== undefined && through === undefined)
        return answer(410, { error: `Overlay "${overlay}" of model "${model}" is gone` });
      if (through !== undefined && head !== undefined)
        return answer(200, {
          model,
          revision: head.revision,
          folderId,
          overlay,
          names: Object.fromEntries(
            names.map((name) => {
              const own = through.upserts.find((item) => item.name === name);
              return [
                name,
                own === undefined ? resolveIn(head.items, tree, folderId, name) : fullNameOf(own),
              ];
            }),
          ),
        });
      // A model with no revision is answered as an unknown one (research 3a).
      if (
        known === undefined ||
        head === undefined ||
        !tree.some((folder) => folder.id === folderId)
      )
        return answer(400, {
          error: `Folder ${folderId} is not in the folder tree`,
          code: 'invalid_folders',
        });
      const items = head?.items ?? [];
      return answer(200, {
        model,
        revision: head?.revision ?? null,
        folderId,
        names: Object.fromEntries(
          names.map((name) => [name, resolveIn(items, tree, folderId, name)]),
        ),
      });
    }

    if (route[2] === 'changesets' && method === 'POST') {
      if (tooLarge) return answer(413, { error: 'The change is too large', code: 'too_large' });
      const held = models.get(model);
      if (held === undefined || held.mode !== 'items')
        return answer(409, {
          error: `Model "${model}" holds a file set; send an items snapshot first`,
          code: 'mode',
        });
      const change = body as {
        baseRevision: number | null;
        upserts?: readonly Item[];
        deletes?: readonly { folderId: string; name: string }[];
        probes?: readonly { id: string; query: Record<string, unknown> }[];
      };
      // No tree yet: refused before the dry-run branch. An upsert into a
      // folder the tree doesn't hold is the item's error, kind `folder`
      // (research 3a, "POST …/changesets" and "Item content").
      if (held.tree === undefined)
        return answer(400, {
          error: `Model "${model}" has no folder tree yet: put its folders first`,
          code: 'invalid_folders',
        });
      const inTree = new Set(held.tree.map((folder) => folder.id));
      const folderErrors: ItemError[] = (change.upserts ?? [])
        .filter((item) => !inTree.has(item.folderId))
        .map((item) => ({
          folderId: item.folderId,
          name: item.name,
          kind: 'folder',
          message: `Folder ${item.folderId} is not in the folder tree`,
        }));
      const refused: readonly (ModelError | ItemError)[] | undefined =
        folderErrors.length > 0 ? [...folderErrors, ...(refusal ?? [])] : refusal;
      const keyOf = (item: { folderId: string; name: string }) => `${item.folderId}/${item.name}`;
      const applied = (items: readonly Item[]) => {
        const gone = new Set((change.deletes ?? []).map(keyOf));
        const upserted = new Map((change.upserts ?? []).map((item) => [keyOf(item), item]));
        return [
          ...items.filter((item) => !gone.has(keyOf(item)) && !upserted.has(keyOf(item))),
          ...upserted.values(),
        ];
      };
      const current = headOf(model);
      const result = applied(current?.items ?? []);
      if (url.searchParams.get('dryRun') === 'true') {
        const valid = refused === undefined;
        const asFiles = result.map((item) => ({ path: `${item.name}.yml`, content: item.yaml }));
        return answer(200, {
          model,
          valid,
          errors: refused ?? [],
          cubeMessage: valid ? null : refusalMessage,
          probes:
            valid && !dropping
              ? (change.probes ?? []).map((probe) => ({
                  id: probe.id,
                  candidate: probeAnswer?.(probe, asFiles) ?? { status: 200 },
                }))
              : [],
          itemsHash: valid ? itemsHashOf(result) : null,
          currentRevision: current?.revision ?? null,
          // As each would land, bound over the result (T456); none when refused.
          items: valid ? (change.upserts ?? []).map((item) => refOf(item, result, held.tree!)) : [],
        });
      }
      // Another replica's changeset lands between this one's read and its send.
      if (conflicts > 0) {
        conflicts -= 1;
        const other: Item = {
          folderId: 'froot',
          name: `other_${String(conflicts)}`,
          kind: 'cube',
          yaml: '',
        };
        held.revisions.push({
          revision: (current?.revision ?? 0) + 1,
          contentHash: randomUUID(),
          itemsHash: itemsHashOf([...(current?.items ?? []), other]),
          files: [],
          items: [...(current?.items ?? []), other],
        });
      }
      const head = headOf(model);
      const next = applied(head?.items ?? []);
      const itemsHash = itemsHashOf(next);
      if (head !== undefined && head.itemsHash === itemsHash)
        return answer(200, {
          model,
          generation,
          revision: head.revision,
          created: false,
          contentHash: head.contentHash,
          itemsHash,
          items: [],
        });
      if ((head?.revision ?? null) !== change.baseRevision)
        return answer(409, {
          error: "The model changed since the changeset's base revision",
          code: 'conflict',
          currentRevision: head?.revision ?? null,
          currentItemsHash: head?.itemsHash ?? null,
        });
      if (refused !== undefined)
        return answer(422, {
          error: 'The items do not compile',
          code: 'invalid_items',
          errors: refused,
          cubeMessage: refusalMessage,
        });
      // An item published again binds afresh: what was recorded for it goes.
      for (const upserted of change.upserts ?? [])
        recorded.delete(`${model}/${fullNameOf(upserted)}`);
      const revision = (head?.revision ?? 0) + 1;
      held.revisions.push({
        revision,
        contentHash: randomUUID(),
        itemsHash,
        files: [],
        items: next,
      });
      return answer(201, {
        model,
        generation,
        revision,
        created: true,
        contentHash: held.revisions.at(-1)?.contentHash,
        itemsHash,
        items: [],
      });
    }

    /** The tree (research 3a, "PUT …/folders"): one root, `froot`; it creates the model. */
    if (route[2] === 'folders' && method === 'PUT') {
      const { folders, security } = body as {
        folders: readonly TreeFolder[];
        security?: boolean;
      };
      if (!folders.some((folder) => folder.id === 'froot' && folder.parentId === null))
        return answer(400, {
          error: 'The tree has no root folder froot',
          code: 'invalid_folders',
          problems: ['The tree has no root folder froot'],
        });
      const held = modelOf(model);
      // Only turning security on is refused while older instances are connected.
      if (olderInstances > 0 && security === true && held.security !== true) {
        olderInstances -= 1;
        return answer(409, {
          error: 'Older xcube instances are connected',
          code: 'older_instances',
          instances: ['xcube-v3-old'],
        });
      }
      held.tree = folders;
      if (security !== undefined) held.security = security;
      const hash = wrongTreeHash > 0 ? 'f'.repeat(64) : treeHashOf(folders);
      if (wrongTreeHash > 0) wrongTreeHash -= 1;
      return answer(200, { model, hash, security: held.security ?? false });
    }

    /**
     * The check (T445; research §"`PUT …/snapshot?dryRun=true`"): the same
     * path and type checks, then `valid` and its errors, then each probe run
     * against the candidate only when it's valid. Nothing is stored.
     */
    if (route[2] === 'snapshot' && method === 'PUT' && url.searchParams.get('dryRun') === 'true') {
      const { files, probes = [] } = body as {
        files: readonly ModelFile[];
        probes?: readonly { id: string; query: Record<string, unknown>; compare?: boolean }[];
      };
      const refusedPath = files.find(
        (file) => !FILE_PATH.test(file.path) || file.path.length > 512,
      );
      if (refusedPath !== undefined)
        return answer(400, {
          error: `${refusedPath.path}: not a path xcube takes`,
          code: 'invalid_path',
        });
      const code = files.find((file) => !/\.ya?ml$/.test(file.path) || JINJA.test(file.content));
      if (code !== undefined)
        return answer(400, {
          error: `${code.path}: only plain YAML models are taken (no JavaScript, Python or Jinja)`,
          code: 'invalid_file_type',
        });
      const valid = refusal === undefined;
      return answer(200, {
        model,
        contentHash: contentHashOf(files),
        currentRevision: head?.revision ?? null,
        sameAsCurrent: head?.contentHash === contentHashOf(files),
        valid,
        errors: refusal ?? [],
        cubeMessage: valid ? null : refusalMessage,
        probes:
          valid && !dropping
            ? probes.map((probe) => ({
                id: probe.id,
                candidate: probeAnswer?.(probe, files) ?? { status: 200 },
              }))
            : [],
        durationMs: 1,
      });
    }

    if (route[2] === 'snapshot' && method === 'PUT' && url.searchParams.get('dryRun') === null) {
      const snapshot = body as {
        baseRevision: number | null;
        files?: readonly ModelFile[];
        items?: readonly Item[];
        folders?: readonly TreeFolder[];
      };

      /** The items snapshot: the switch, and no mode check (research 3a). */
      if (Array.isArray(snapshot.items)) {
        const folders = snapshot.folders ?? [];
        if (!folders.some((folder) => folder.id === 'froot' && folder.parentId === null))
          return answer(400, {
            error: 'The tree has no root folder froot',
            code: 'invalid_folders',
            problems: ['The tree has no root folder froot'],
          });
        const held = modelOf(model);
        // Another replica's snapshot lands between this one's read and its send.
        if (conflicts > 0) {
          conflicts -= 1;
          const other: Item[] = [
            { folderId: 'froot', name: `other_${String(conflicts)}`, kind: 'cube', yaml: '' },
          ];
          held.revisions.push({
            revision: (headOf(model)?.revision ?? 0) + 1,
            contentHash: randomUUID(),
            itemsHash: itemsHashOf(other),
            files: [],
            items: other,
          });
          held.mode = 'items';
        }
        const current = headOf(model);
        const itemsHash = itemsHashOf(snapshot.items);
        held.tree = folders;
        if (current !== undefined && current.itemsHash === itemsHash)
          return answer(200, {
            model,
            generation,
            revision: current.revision,
            created: false,
            contentHash: current.contentHash,
            itemsHash,
            items: [],
          });
        if ((current?.revision ?? null) !== snapshot.baseRevision)
          return answer(409, {
            error: "The model changed since the snapshot's base revision",
            code: 'conflict',
            currentRevision: current?.revision ?? null,
            currentItemsHash: current?.itemsHash ?? null,
          });
        if (refusal !== undefined)
          return answer(422, {
            error: 'The items do not compile',
            code: 'invalid_items',
            errors: refusal,
            cubeMessage: refusalMessage,
          });
        const revision = (current?.revision ?? 0) + 1;
        held.revisions.push({
          revision,
          contentHash: randomUUID(),
          itemsHash,
          files: [],
          items: snapshot.items,
        });
        held.mode = 'items';
        return answer(201, {
          model,
          generation,
          revision,
          created: true,
          contentHash: held.revisions.at(-1)?.contentHash,
          itemsHash,
          items: [],
        });
      }

      // Slice 2's files import: refused once the model holds items (research 3a, Gotcha 4).
      const files = snapshot.files ?? [];
      if (models.get(model)?.mode === 'items')
        return answer(409, {
          error: `Model "${model}" holds items; send changesets or an items snapshot`,
          code: 'mode',
        });
      // As xcube checks them before anything else (research, "Path rules").
      const refusedPath = files.find(
        (file) => !FILE_PATH.test(file.path) || file.path.length > 512,
      );
      if (refusedPath !== undefined)
        return answer(400, {
          error: `${refusedPath.path}: not a path xcube takes`,
          code: 'invalid_path',
        });
      const code = files.find((file) => !/\.ya?ml$/.test(file.path) || JINJA.test(file.content));
      if (code !== undefined)
        return answer(400, {
          error: `${code.path}: only plain YAML models are taken (no JavaScript, Python or Jinja)`,
          code: 'invalid_file_type',
        });
      const current = headOf(model);
      const contentHash = contentHashOf(files);
      if (current !== undefined && current.contentHash === contentHash)
        return answer(200, {
          model,
          generation,
          revision: current.revision,
          created: false,
          contentHash,
        });
      if ((current?.revision ?? null) !== snapshot.baseRevision)
        return answer(409, {
          error: "The model changed since the snapshot's base revision",
          code: 'conflict',
          currentRevision: current?.revision ?? null,
          currentContentHash: current?.contentHash ?? null,
        });
      const revision = (current?.revision ?? 0) + 1;
      modelOf(model).revisions.push({ revision, contentHash, itemsHash: null, files, items: [] });
      return answer(201, { model, generation, revision, created: true, contentHash });
    }

    return answer(400, { error: 'Not a route of this stub', code: 'bad_request' });
  };

  return {
    fetch,
    calls,
    /** The model's current revision, as xcube's store holds it. */
    head: (model: string) => {
      const head = headOf(model);
      return head === undefined
        ? undefined
        : { ...head, generation, mode: models.get(model)?.mode ?? 'files' };
    },
    /** The model's folder tree, as last put. */
    tree: (model: string) => models.get(model)?.tree,
    /** A model imported as a file set, as slice 2 left it (T449's switch starts from this). */
    holdFiles: (model: string, files: readonly ModelFile[]) => {
      const held = modelOf(model);
      held.mode = 'files';
      held.revisions.push({
        revision: (headOf(model)?.revision ?? 0) + 1,
        contentHash: contentHashOf(files),
        itemsHash: null,
        files,
        items: [],
      });
    },
    /** A model moved to items mode, holding these items (T426's changesets start from this). */
    holdItems: (
      model: string,
      items: readonly Item[],
      /**
       * Bindings recorded at an item's publish, by its full name, where they
       * aren't what its joins resolve to now: xcube never rebinds (T429).
       */
      bindings: Readonly<Record<string, Record<string, string>>> = {},
    ) => {
      for (const [fullName, bound] of Object.entries(bindings))
        recorded.set(`${model}/${fullName}`, bound);
      const held = modelOf(model);
      held.mode = 'items';
      held.tree ??= [{ id: 'froot', parentId: null }];
      held.revisions.push({
        revision: (headOf(model)?.revision ?? 0) + 1,
        contentHash: randomUUID(),
        itemsHash: itemsHashOf(items),
        files: [],
        items,
      });
    },
    /** The check answers without its probes' results, as a garbled answer would. */
    dropProbes: (on: boolean) => {
      dropping = on;
    },
    /** How the check's probes answer; `undefined` from it is a 200. */
    answerProbes: (answer: typeof probeAnswer) => {
      probeAnswer = answer;
    },
    /** Every call waits for ever, until its caller gives up (its signal aborts). */
    hang: (on: boolean) => {
      hanging = on;
    },
    /** Every call fails as a lost connection does, until put back. */
    down: (on: boolean) => {
      isDown = on;
    },
    /** The next `n` imports are answered 409, as if another replica got there first. */
    conflictNext: (n: number) => {
      conflicts = n;
    },
    /** Changesets are answered `413 too_large`, until put back. */
    refuseSize: (on: boolean) => {
      tooLarge = on;
    },
    /** The next `n` tree puts answer a hash that isn't the tree's. */
    wrongTreeHashNext: (n: number) => {
      wrongTreeHash = n;
    },
    /** The next `n` tree puts turning security on are refused `409 older_instances` (slice 4). */
    olderInstancesNext: (n: number) => {
      olderInstances = n;
    },
    /** Whether the model's folder gate is on, as the last tree put it. */
    security: (model: string): boolean => models.get(model)?.security ?? false,
    /** Imports are refused with these errors, until cleared with `undefined`. */
    refuse: (
      errors: readonly (ModelError | ItemError)[] | undefined,
      cubeMessage: string | null = null,
    ) => {
      refusal = errors;
      refusalMessage = cubeMessage;
    },
    /** An overlay as xcube holds it (T347): its version, items and data sources; none once dropped. */
    overlay: (model: string, id: string) => {
      const held = overlays.get(`${model}/${id}`);
      return held === undefined
        ? undefined
        : { version: held.version, upserts: held.upserts, connections: held.connections };
    },
    /**
     * The next overlay push answered so, as xcube refuses one (`422
     * invalid_secret`, say): of the overlay named, where one is, so another's
     * push meanwhile (a workspace's, after a save) doesn't take it.
     */
    refuseOverlayNext: (status: number, body: Record<string, unknown>, id?: string) => {
      overlayRefusals.push({ status, body, ...(id === undefined ? {} : { id }) });
    },
    /** Each SQL run asked, in order (T532). */
    sqlAsked: () => [...sqlAsked],
    /** How SQL runs are answered from now on: `undefined` from it, or none given, is one row. */
    answerSql: (answer: typeof sqlAnswer) => {
      sqlAnswer = answer;
    },
    /** SQL runs held until cancelled, or until their caller gives up (T533). */
    holdSql: (on: boolean) => {
      holdingSql = on;
    },
    /** The run ids held now. */
    sqlGoing: () => [...sqlGoing.keys()],
    /** A held run known, and so cancellable, only this long after it arrives (T533's review). */
    sqlKnownAfter: (ms: number) => {
      sqlKnownAfterMs = ms;
    },
    /** How `GET …/sql/runs/{runId}` answers a run not held (T548): `ended` where none is given. */
    answerSqlState: (answer: typeof sqlState) => {
      sqlState = answer;
    },
    /** The run ids whose state was asked, in order. */
    sqlStatesAsked: () => [...sqlStatesAsked],
    /** xcube's schema emptied and made again: a new generation, and no models. */
    recreate: () => {
      generation = randomUUID();
      models = new Map();
    },
  };
}
