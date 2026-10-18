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
 * - Names one per model, in any case, as `256d632371` holds them (T701,
 *   T709; research `xcube-256d632371.md`): a changeset, an items snapshot
 *   or an overlay whose item takes a name another holds is refused, `422
 *   invalid_items` with errors of kind `name_in_use` on the caller's item;
 *   an overlay bringing two data sources of one name is `409 name_in_use`,
 *   and one bringing `default` outside the root `400 default_outside_root`.
 *   `namesOnePerModel(false)` turns the rule off.
 * - Every item is answered under its own name in every folder: its
 *   `fullName` is its name, and its bindings name each item by its name
 *   (T709; research `xcube-256d632371.md`, "Bare names on every route").
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
  /** Its `{{name}}`s' values, bound (T811; xcube bb188d8ada). */
  readonly parameters?: Readonly<Record<string, { type: string; value: string | boolean }>>;
}

/** PostgreSQL's cast for each type of value xcube binds (research `xcube-bb188d8ada.md`). */
const PG_CASTS: Record<string, string> = {
  text: 'text',
  number: 'numeric',
  date: 'date',
  boolean: 'boolean',
};

/**
 * The statement as xcube runs it with `parameters` (T811): each `{{name}}`
 * its PostgreSQL placeholder, numbered by its first place, typed, and written
 * between spaces, as xcube's `bindParameters` writes it.
 */
function boundOf(sql: string, parameters: NonNullable<FakeSqlAsk['parameters']>): string {
  const slots = new Map<string, number>();
  return sql.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, name: string) => {
    if (!slots.has(name)) slots.set(name, slots.size + 1);
    return ` $${String(slots.get(name))}::${PG_CASTS[parameters[name]?.type ?? 'text'] ?? 'text'} `;
  });
}

/** A folder and each one above it in a tree, to `froot` (T712, T713). */
function folderPathOf(tree: readonly TreeFolder[], folderId: string): Set<string> {
  const parents = new Map(tree.map((folder) => [folder.id, folder.parentId]));
  const path = new Set<string>();
  let at: string | null | undefined = folderId;
  while (at != null && !path.has(at)) {
    path.add(at);
    at = parents.get(at);
  }
  return path;
}

/**
 * Every literal as `?`, as xcube's `redactedSql` has it: strings and numbers,
 * but not a bound parameter's place (`$1`); trailing spaces trimmed.
 */
const redactedOf = (sql: string) =>
  sql
    .replace(/'(?:[^']|'')*'/g, '?')
    .replace(/(?<!\$)\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/[ \t]+$/gm, '')
    .trim();

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
  /**
   * Whether names are one per model across folders, as `256d632371` holds
   * them (T701, T709): on unless `namesOnePerModel(false)`. An overlay's two
   * items of one name are refused either way, as they were before.
   */
  let oneNamePerModel = true;
  /** Each model's landed connections, where a test gives them (`holdConnections`, T712). */
  const connectionsOf = new Map<string, { folderId: string; name: string }[]>();
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

  /**
   * An item's full name: its own name, in every folder (T709; research
   * `xcube-256d632371.md`, 1.1).
   */
  const fullNameOf = (item: { folderId: string; name: string }) => item.name;
  /**
   * The one item of a name, in any folder, by its stored name (T711; research
   * `xcube-256d632371.md`, 3.1, 3.3): a reference in YAML matches exactly,
   * `POST …/resolve` in any case. Whether it is on a referrer's path is R72's
   * refusal (T713) or wechart's rule (T711), never this answer.
   */
  const holderOf = (items: readonly Item[], name: string, anyCase = true): string | null => {
    const found = items.find((item) =>
      anyCase ? item.name.toLowerCase() === name.toLowerCase() : item.name === name,
    );
    return found === undefined ? null : fullNameOf(found);
  };
  const resolveIn = (items: readonly Item[], name: string) => holderOf(items, name, false);
  /**
   * What an item bound at its publish (research 3a, "Bindings"): its own
   * name, each cube its joins name, and every segment of a view's
   * `cubes[].join_path` (T590), each to the one item of its name, by that
   * name (research `xcube-256d632371.md`, 3.3).
   */
  const bindingsOf = (model: string, item: Item, items: readonly Item[]) => {
    const held = recorded.get(`${model}/${fullNameOf(item)}`);
    if (held !== undefined) return held;
    const parsed = (parseYaml(item.yaml) ?? {}) as Record<string, unknown>;
    const declared = (parsed['cubes'] ?? parsed['views']) as Record<string, unknown>[] | undefined;
    const joins = (declared?.[0]?.['joins'] ?? []) as { name?: unknown }[];
    const bindings: Record<string, string> = { [item.name]: fullNameOf(item) };
    for (const join of joins)
      if (typeof join.name === 'string') {
        const bound = resolveIn(items, join.name);
        if (bound !== null) bindings[join.name] = bound;
      }
    // What it extends too (research `xcube-256d632371.md`, R72: `bindings`).
    const parent = declared?.[0]?.['extends'];
    if (typeof parent === 'string' && parent !== item.name) {
      const bound = resolveIn(items, parent);
      if (bound !== null) bindings[parent] = bound;
    }
    if (item.kind === 'view') {
      const others = items.filter((other) => other !== item);
      const paths = (declared?.[0]?.['cubes'] ?? []) as { join_path?: unknown }[];
      for (const entry of Array.isArray(paths) ? paths : [])
        if (typeof entry.join_path === 'string')
          entry.join_path.split('.').forEach((segment, at) => {
            const bound = resolveIn(at === 0 ? others : items, segment);
            if (bound !== null) bindings[segment] = bound;
          });
    }
    return bindings;
  };

  /**
   * Each cube's data source held to its folder's path (T712; research
   * `xcube-256d632371.md`, "The data-source rule" 4.1–4.4, "In `422
   * invalid_items`"): the one it names, or its parent's through `extends`,
   * however far up; `default` the root's, Cube's own. One no connection
   * holds is kind `reference`; one held off the path, `data_source_range`.
   * Each error is on the cube, naming the data source and never its folder.
   * Only for a model given connections (`holdConnections`), and only over
   * the cubes it is given (a changeset's touched ones; an overlay's own).
   */
  const rangeRefused = (
    model: string,
    cubes: readonly Item[],
    all: readonly Item[],
    tree: readonly TreeFolder[],
    brought: readonly { folderId: string; name: string }[] = [],
  ): ItemError[] => {
    const held = connectionsOf.get(model);
    if (held === undefined) return [];
    // A brought connection stands in for the held one of its name (research 2.6).
    const key = (name: string) => name.toLowerCase();
    const connections = [
      ...held.filter((each) => !brought.some((own) => key(own.name) === key(each.name))),
      ...brought,
    ];
    const pathOf = (folderId: string) => folderPathOf(tree, folderId);
    const ownOf = (item: Item) => {
      const parsed = (parseYaml(item.yaml) ?? {}) as Record<string, unknown>;
      return ((parsed['cubes'] as Record<string, unknown>[] | undefined)?.[0] ?? {}) as Record<
        string,
        unknown
      >;
    };
    /** The data source a cube uses, and the parent it comes through, if it is inherited. */
    const sourceOf = (item: Item, seen: Set<string>): { name: string; through?: string } => {
      const own = ownOf(item);
      const written = own['data_source'] ?? own['dataSource'];
      if (typeof written === 'string') return { name: written };
      const parentName = own['extends'];
      const parent =
        typeof parentName === 'string' && !seen.has(parentName)
          ? all.find((each) => each.name === parentName && each.kind === 'cube')
          : undefined;
      if (parent === undefined) return { name: 'default' };
      seen.add(parentName as string);
      return { name: sourceOf(parent, seen).name, through: parent.name };
    };
    return cubes.flatMap((item): ItemError[] => {
      if (item.kind !== 'cube' || item.yaml === '') return [];
      const { name, through } = sourceOf(item, new Set([item.name]));
      if (name === 'default') return [];
      const holders = connections.filter((each) => each.name === name);
      if (holders.length === 0)
        return [
          {
            folderId: item.folderId,
            name: item.name,
            kind: 'reference',
            message: `It uses the data source "${name}", which the model doesn't hold`,
          },
        ];
      const path = pathOf(item.folderId);
      if (holders.some((each) => path.has(each.folderId))) return [];
      return [
        {
          folderId: item.folderId,
          name: item.name,
          kind: 'data_source_range',
          message:
            through === undefined
              ? `It uses the data source "${name}", which isn't in its folder or one of its ancestors`
              : `It uses the data source "${name}" (through ${through}, which it extends), which isn't in its folder or one of its ancestors`,
        },
      ];
    });
  };

  /**
   * R72's rule (T713; research `xcube-256d632371.md`, "R72: every reference
   * up the referrer's folder path"): an item whose join, `extends` or view
   * `join_path` segment names an item kept off its folder's path is refused,
   * `reference_range`, on the referrer, naming what it refers to and never
   * that item's folder. A self-reference, or a name no item holds, is not
   * this rule's. Over the items it is given, against `all`. Of the image's
   * references this stub reads joins, `extends` and views' join paths, not
   * `{cube.member}` or `FILTER_PARAMS`; it says several as one sentence each
   * name sorted, `aren't` for more than one, as the research has it.
   */
  const pathRefused = (
    items: readonly Item[],
    all: readonly Item[],
    tree: readonly TreeFolder[],
  ): ItemError[] => {
    const pathOf = (folderId: string) => folderPathOf(tree, folderId);
    return items.flatMap((item): ItemError[] => {
      if (item.yaml === '') return [];
      const parsed = (parseYaml(item.yaml) ?? {}) as Record<string, unknown>;
      const own =
        ((parsed['cubes'] ?? parsed['views']) as Record<string, unknown>[] | undefined)?.[0] ?? {};
      const named = new Set<string>();
      for (const join of (own['joins'] ?? []) as { name?: unknown }[])
        if (typeof join.name === 'string') named.add(join.name);
      if (typeof own['extends'] === 'string') named.add(own['extends']);
      if (item.kind === 'view')
        for (const entry of (Array.isArray(own['cubes']) ? own['cubes'] : []) as {
          join_path?: unknown;
        }[])
          if (typeof entry.join_path === 'string')
            for (const segment of entry.join_path.split('.')) named.add(segment);
      named.delete(item.name);
      const path = pathOf(item.folderId);
      const off = [...named]
        .filter((name) => {
          const held = all.find((each) => each.name === name);
          return held !== undefined && !path.has(held.folderId);
        })
        .sort();
      if (off.length === 0) return [];
      return [
        {
          folderId: item.folderId,
          name: item.name,
          kind: 'reference_range',
          message: `It refers to ${off.map((name) => `"${name}"`).join(', ')}, which ${
            off.length === 1 ? "isn't" : "aren't"
          } in its folder or one of its ancestors`,
        },
      ];
    });
  };

  /**
   * Names one per model, in any case (T701; research `xcube-256d632371.md`,
   * "The error kinds", 2.6, 2.7; xcube's `publish` in `names/publish.ts`):
   * two upserts of one name, or an upsert of a name another kept item holds,
   * are each refused on the caller's item, `name_in_use`, never saying where
   * the other is. A delete and an upsert of one name is a move; an
   * overlay's upsert stands in for the published item of its name.
   */
  const namesRefused = (
    what: 'changeset' | 'overlay',
    current: readonly Item[],
    upserts: readonly Item[],
    deletes: readonly { folderId: string; name: string }[],
  ): ItemError[] => {
    const key = (name: string) => name.toLowerCase();
    const errors: ItemError[] = [];
    const upserted = new Map<string, Item>();
    for (const item of upserts) {
      const other = upserted.get(key(item.name));
      // The same item twice is kind `item` (research, "In `422 invalid_items`").
      if (other !== undefined && other.folderId === item.folderId && other.name === item.name)
        errors.push({
          folderId: item.folderId,
          name: item.name,
          kind: 'item',
          message: `The item is in the ${what} twice`,
        });
      else if (other !== undefined)
        errors.push({
          folderId: item.folderId,
          name: item.name,
          kind: 'name_in_use',
          message: `The ${what} holds two items named "${item.name}" (in ${other.folderId} and ${item.folderId}); names are one per model`,
        });
      upserted.set(key(item.name), item);
    }
    if (errors.length > 0 || what === 'overlay') return errors;
    const kept = new Map(current.map((item) => [key(item.name), item]));
    for (const gone of deletes) {
      const known = kept.get(key(gone.name));
      if (known?.folderId === gone.folderId && known.name === gone.name)
        kept.delete(key(gone.name));
    }
    for (const [name, item] of upserted) {
      const known = kept.get(name);
      if (known !== undefined && (known.folderId !== item.folderId || known.name !== item.name))
        errors.push({
          folderId: item.folderId,
          name: item.name,
          kind: 'name_in_use',
          message:
            known.folderId === item.folderId
              ? `The name "${item.name}" is in use as "${known.name}": a landed name can't change, not even its case`
              : `The name "${item.name}" is already in use`,
        });
    }
    return errors;
  };

  /**
   * An item as a changeset's answer refers to it (research
   * `xcube-meta-revision-and-bindings.md`, `ItemRef`): bound by name over
   * `items`, only the names its YAML uses, never its own (Gotcha 18), and
   * a cube's data source as written, `default` where it names none, `null`
   * where it extends another, as xcube gives it for a model with no
   * connections (Gotcha 8).
   */
  const refOf = (item: Item, items: readonly Item[]) => {
    const parsed = (parseYaml(item.yaml) ?? {}) as Record<string, unknown>;
    const declared = (parsed['cubes'] ?? parsed['views']) as Record<string, unknown>[] | undefined;
    const own = declared?.[0] ?? {};
    // A view's every `join_path` segment too (research `xcube-256d632371.md`, R72).
    const paths = (item.kind === 'view' ? (own['cubes'] ?? []) : []) as { join_path?: unknown }[];
    const named = [
      ...((own['joins'] ?? []) as { name?: unknown }[]).map((join) => join.name),
      own['extends'],
      ...(Array.isArray(paths) ? paths : []).flatMap((entry) =>
        typeof entry.join_path === 'string' ? entry.join_path.split('.') : [],
      ),
    ].filter((name): name is string => typeof name === 'string' && name !== item.name);
    const bindings: Record<string, string> = {};
    for (const name of named) {
      const bound = resolveIn(items, name);
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
          // A data source by its own name in any folder (T701).
          connections: stored.connections.map(({ folderId, name, driver }) => ({
            folderId,
            name,
            fullName: name,
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
        // Two items of one name, in any case (T701); and its own cubes' data
        // sources on their paths, with the connections it brings (T712).
        const headItems = headOf(model)?.items ?? [];
        const standing = [
          ...headItems.filter(
            (item) =>
              !put.upserts.some((own) => own.name.toLowerCase() === item.name.toLowerCase()),
          ),
          ...put.upserts,
        ];
        const twice = [
          ...namesRefused('overlay', [], put.upserts, []),
          ...rangeRefused(
            model,
            put.upserts,
            standing,
            modelOf(model).tree ?? [],
            put.connections ?? [],
          ),
          // Its own items' references on their paths (T713; research, R72).
          ...pathRefused(put.upserts, standing, modelOf(model).tree ?? []),
        ];
        if (twice.length > 0)
          return answer(422, {
            error: 'The overlay does not apply',
            code: 'invalid_items',
            errors: twice,
            cubeMessage: null,
          });
        // Two data sources of one name, in any case; `default` the root's
        // alone (T701; research `xcube-256d632371.md`, 2.6).
        const named = new Set<string>();
        for (const connection of oneNamePerModel ? (put.connections ?? []) : []) {
          if (connection.name.toLowerCase() === 'default' && connection.folderId !== 'froot')
            return answer(400, {
              error: 'Only the root folder (froot) holds the data source "default"',
              code: 'default_outside_root',
              problems: [
                'a cube that names no data source uses the root\'s "default"; name any other data source explicitly',
              ],
            });
          if (named.has(connection.name.toLowerCase()))
            return answer(409, {
              error: `The overlay brings two data sources named "${connection.name}"; names are one per model`,
              code: 'name_in_use',
              problems: [],
            });
          named.add(connection.name.toLowerCase());
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
        // By its own name, in any folder (T701; research `xcube-256d632371.md`, 1.1).
        if (!held.connections.some((each) => each.name === connection))
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
      // The statement as it runs: with `parameters`, xcube's placeholders in their places (T811).
      const redactedSql = redactedOf(
        ask.parameters === undefined ? ask.sql : boundOf(ask.sql, ask.parameters),
      );
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
          // A cube's data source, as `256d632371` gives it (research 3.3).
          ...(item.kind === 'cube' && item.yaml !== ''
            ? { dataSource: refOf(item, head.items).dataSource }
            : {}),
          bindings: bindingsOf(model, item, head.items),
        })),
      });
    }

    /** Each name to its one holder, in any folder (research `xcube-256d632371.md`, 3.3). */
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
              const own = through.upserts.find(
                (item) => item.name.toLowerCase() === name.toLowerCase(),
              );
              return [name, own === undefined ? holderOf(head.items, name) : fullNameOf(own)];
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
        names: Object.fromEntries(names.map((name) => [name, holderOf(items, name)])),
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
      // Names one per model, in any case (T701), checked over the head.
      const nameErrors = !oneNamePerModel
        ? []
        : namesRefused(
            'changeset',
            headOf(model)?.items ?? [],
            change.upserts ?? [],
            change.deletes ?? [],
          );
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
      // Each cube the change touches, held to its path (T712): its upserts and
      // the cubes extending them. NARROWER than the image, which checks every
      // cube (research 4.3), so leftovers of other tests in a shared store
      // don't trip it; a move's stranded cubes are T715's to add.
      const touched = new Set((change.upserts ?? []).map((item) => item.name));
      const extendsOne = (item: Item) => {
        const own = (parseYaml(item.yaml) ?? {}) as { cubes?: { extends?: unknown }[] };
        const parent = own.cubes?.[0]?.extends;
        return typeof parent === 'string' && touched.has(parent);
      };
      const rangeErrors =
        nameErrors.length > 0
          ? []
          : rangeRefused(
              model,
              result.filter((item) => touched.has(item.name) || extendsOne(item)),
              result,
              held.tree,
            );
      // Its upserts' references on their paths (T713; research, R72): as narrow,
      // a published referrer a move strands being T715's to add.
      const pathErrors =
        nameErrors.length > 0
          ? []
          : pathRefused(
              result.filter((item) => touched.has(item.name)),
              result,
              held.tree,
            );
      const placed = [...folderErrors, ...nameErrors, ...rangeErrors, ...pathErrors];
      const refused: readonly (ModelError | ItemError)[] | undefined =
        placed.length > 0 ? [...placed, ...(refusal ?? [])] : refusal;
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
          items: valid ? (change.upserts ?? []).map((item) => refOf(item, result)) : [],
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

    /**
     * The folders a new tree drops that still hold something (research
     * `xcube-c2602ac72a.md`): items of the head, or, with `dataSourcesOnly`,
     * data sources alone, as an items snapshot that replaces the items
     * checks them.
     */
    const inUseDropped = (folders: readonly TreeFolder[], dataSourcesOnly = false) => {
      const kept = new Set(folders.map((folder) => folder.id));
      const holding = new Set([
        ...(dataSourcesOnly ? [] : (head?.items ?? []).map((item) => item.folderId)),
        ...(connectionsOf.get(model) ?? []).map((each) => each.folderId),
      ]);
      return (models.get(model)?.tree ?? [])
        .map((folder) => folder.id)
        .filter((id) => !kept.has(id) && holding.has(id))
        .sort();
    };
    const folderInUse = (folders: readonly string[]) =>
      answer(409, {
        error: `Folders still holding items can't be removed: ${folders.join(', ')}`,
        code: 'folder_in_use',
        folders,
      });

    /** The tree as xcube holds it (research `xcube-c2602ac72a.md`, "GET …/folders"). */
    if (route[2] === 'folders' && method === 'GET') {
      const known = models.get(model);
      if (known?.tree === undefined)
        return answer(404, { error: `Unknown model "${model}"`, code: 'unknown_model' });
      const items = known.mode === 'items' ? (head?.items ?? []) : [];
      const connections = connectionsOf.get(model) ?? [];
      return answer(200, {
        model,
        revision: head?.revision ?? null,
        security: known.security ?? false,
        hash: treeHashOf(known.tree),
        folders: known.tree.map((folder) => ({
          id: folder.id,
          parentId: folder.parentId,
          allowedGroups: folder.allowedGroups ?? [],
          items: items.filter((item) => item.folderId === folder.id).length,
          dataSources: connections.filter((each) => each.folderId === folder.id).length,
        })),
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
      // A folder still holding items or a data source can't go (research 3a, `409 folder_in_use`).
      const dropped = inUseDropped(folders);
      if (dropped.length > 0) return folderInUse(dropped);
      // What the new tree strands that the held one didn't (T715; research
      // `xcube-256d632371.md`, "On `PUT …/folders`"): cubes from their data
      // sources, items from what they refer to, by name, never a folder.
      const kept = headOf(model)?.items ?? [];
      if (held.tree !== undefined && kept.length > 0) {
        const before = held.tree;
        const newly = (refused: (tree: readonly TreeFolder[]) => ItemError[]) => {
          const was = new Set(refused(before).map((error) => error.name));
          return [
            ...new Set(
              refused(folders)
                .map((error) => error.name)
                .filter((name) => !was.has(name)),
            ),
          ].sort();
        };
        const cubes = newly((tree) =>
          rangeRefused(model, kept, kept, tree).filter(
            (error) => error.kind === 'data_source_range',
          ),
        );
        const items = newly((tree) => pathRefused(kept, kept, tree));
        if (cubes.length > 0 || items.length > 0)
          return answer(409, {
            error:
              "The folder tree would leave items using what isn't in their folder or one of its ancestors",
            code: cubes.length > 0 ? 'data_source_range' : 'reference_range',
            cubes,
            items,
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
        // Its tree may not drop a folder holding a data source (research
        // `xcube-c2602ac72a.md`, "The snapshot's new refusal"): its items it replaces.
        const droppedSources = inUseDropped(folders, true);
        if (droppedSources.length > 0) return folderInUse(droppedSources);
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
        // A whole send: two of its items of one name, in any case (T701).
        const twice = oneNamePerModel ? namesRefused('changeset', [], snapshot.items, []) : [];
        if (refusal !== undefined || twice.length > 0)
          return answer(422, {
            error: 'The items do not compile',
            code: 'invalid_items',
            errors: [...twice, ...(refusal ?? [])],
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
    /**
     * The model's landed connections, by folder and name (T712): from then
     * on a cube's data source is held to its folder's path, as the image
     * holds it. A model never given any is one with no connections: its
     * cubes' data sources are answered as written, unchecked.
     */
    holdConnections: (model: string, held: readonly { folderId: string; name: string }[]) => {
      connectionsOf.set(model, [...held]);
    },
    /** Names one per model across folders, as `256d632371` holds them (T701). */
    namesOnePerModel: (on: boolean) => {
      oneNamePerModel = on;
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
