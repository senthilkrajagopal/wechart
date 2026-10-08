import type { FieldValue, SealedV1 } from '@wechart/core';

import type { ModelFile } from '../server';
import type { TreeFolder } from './folders';
import type { Item } from './items';
import { DEFAULT_AT_ROOT, nameInUse } from './refusal';

/**
 * xcube's admin routes for one model (T419; `docs/research/xcube-slice-2.md`,
 * §"API surface we will use"; items mode, T449: `xcube-slice-3a.md`), under
 * Cube's base path: `{CUBE_API_URL}/v1/semantic/models/{model}`.
 *
 * Called with wechart's service credential (T420, AC-326; slice 4,
 * `xcube-slice-4.md`), which replaced xcube's static admin token, and never
 * with a user's token. Only wechart's server calls them (AC-327).
 */
export interface XcubeHead {
  readonly generation: string;
  /**
   * `files` until the model's first items snapshot, `items` from then on,
   * never back (research 3a, "Switch once"); `files` for a model never
   * imported.
   */
  readonly mode: 'files' | 'items';
  /**
   * Null when xcube has no revision of the model. Its items hash is null for
   * a files-mode revision.
   */
  readonly current: { readonly revision: number; readonly itemsHash: string | null } | null;
}

export type SnapshotAnswer =
  | {
      readonly kind: 'stored';
      readonly generation: string;
      readonly revision: number;
      readonly itemsHash: string;
      /** False when xcube already held these items, and stored nothing new. */
      readonly created: boolean;
    }
  | { readonly kind: 'conflict'; readonly currentRevision: number | null }
  | {
      readonly kind: 'refused';
      readonly errors: readonly unknown[];
      readonly cubeMessage: unknown;
    };

/** An error xcube places on a file, or on none (research, `ModelError`). */
export interface ModelError {
  readonly path: string | null;
  readonly line?: number;
  readonly column?: number;
  readonly kind: 'yaml' | 'compile';
  readonly message: string;
}

/** xcube's check of a set it doesn't store (research, "`PUT …/snapshot?dryRun=true`"). */
export interface CheckAnswer {
  readonly valid: boolean;
  readonly errors: readonly ModelError[];
  readonly cubeMessage: string | null;
  readonly probes: readonly {
    readonly id: string;
    readonly candidate: { readonly status: number; readonly error?: string };
  }[];
}

export interface XcubeAdmin {
  revision(): Promise<XcubeHead>;
  /** Checks the files, and runs each probe's SQL planning against them, storing nothing. */
  check(input: {
    readonly files: readonly ModelFile[];
    readonly securityContext: Record<string, unknown>;
    readonly probes: readonly { readonly id: string; readonly query: Record<string, unknown> }[];
  }): Promise<CheckAnswer>;
  /**
   * The whole model as items, with its folder tree (T449): how a files-mode
   * model moves to items mode, and how it is kept up to date until publishes
   * go through changesets (T426). No file set is ever sent again.
   */
  itemsSnapshot(input: {
    readonly baseRevision: number | null;
    readonly folders: readonly TreeFolder[];
    readonly items: readonly Item[];
    readonly source?: Record<string, unknown>;
  }): Promise<SnapshotAnswer>;
  /**
   * The folder tree (T449, AC-333), and the tree hash xcube answers for it:
   * each folder with its allowed groups, and whether security is on, when
   * given (T436, AC-320; research `xcube-slice-4.md`, "PUT …/folders").
   */
  folders(tree: readonly TreeFolder[], security?: boolean): Promise<{ readonly hash: string }>;
  /**
   * A changeset checked, storing nothing (T426; research 3a, "POST
   * …/changesets?dryRun=true"): its errors on items, and each probe's answer.
   * A model still holding a file set answers `409 mode`, thrown.
   */
  checkChangeset(input: {
    readonly upserts: readonly Item[];
    readonly deletes: readonly { readonly folderId: string; readonly name: string }[];
    readonly securityContext: Record<string, unknown>;
    readonly probes: readonly { readonly id: string; readonly query: Record<string, unknown> }[];
  }): Promise<ItemsCheckAnswer>;
  /**
   * The head's items, by folder and name, each with its full name and the
   * bindings it was published with (research 3a, "GET …/items"); none for a
   * model never imported. A read for a page can ask to wait less than a
   * publish does (T459's review).
   */
  items(options?: { readonly timeoutMs?: number }): Promise<readonly HeldItem[]>;
  /**
   * Each name to the one item holding it, in any case and in any folder, by
   * that item's own stored name, or `null` where none does (T429, AC-272;
   * T701, AC-421; research `xcube-256d632371.md`, 3.3). The folder asked
   * from is only checked to be in the tree: a folder outside it answers
   * `400 invalid_folders`, thrown.
   */
  resolve(
    folderId: string,
    names: readonly string[],
    /**
     * Through an overlay (T347, AC-329; research `xcube-slice-5.md`, "POST
     * …/resolve with overlay"): its items first, wherever they are, then the
     * published model. One gone answers `410`, thrown.
     */
    overlay?: string,
  ): Promise<Map<string, string | null>>;
  /**
   * A workspace's or a proposal's overlay, pushed whole (T347, T440; research
   * `xcube-slice-5.md`, "PUT …/overlays/{id}"; `xcube-overlay-data-sources.md`):
   * its items, placed in their folders, and every data source it brings.
   */
  putOverlay(id: string, overlay: OverlayPush): Promise<OverlayAnswer>;
  /** An overlay's state, or none where it expired, was dropped or was never pushed. */
  overlay(id: string): Promise<OverlayStatus | undefined>;
  /** An overlay dropped: its previews answer `410` from then on. Whether or not it was there. */
  dropOverlay(id: string): Promise<void>;
  /** A changeset applied on a base revision (T426; research 3a, "POST …/changesets"). */
  applyChangeset(input: {
    readonly baseRevision: number | null;
    readonly upserts: readonly Item[];
    readonly deletes: readonly { readonly folderId: string; readonly name: string }[];
    readonly source?: Record<string, unknown>;
  }): Promise<SnapshotAnswer>;
}

/**
 * A data source as an overlay brings it (research `xcube-overlay-data-sources.md`,
 * "Init / auth pattern"): by its short name in the folder it would land in,
 * with exactly these six keys, its envelopes byte for byte (Gotcha 4).
 */
export interface OverlayConnection {
  readonly folderId: string;
  readonly name: string;
  readonly driver: string;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly sealed: Readonly<Record<string, SealedV1>>;
}

/** An overlay pushed whole: its items, its deletes and every data source it brings. */
export interface OverlayPush {
  readonly upserts: readonly Item[];
  readonly deletes: readonly { readonly folderId: string; readonly name: string }[];
  readonly connections: readonly OverlayConnection[];
  /** The version it replaces: `null` for a new one (research, `baseVersion`). */
  readonly baseVersion: number | null;
  /** Its life from this push, clamped to xcube's longest (Gotcha 11). */
  readonly ttlSeconds?: number;
}

/** xcube's answer to an overlay's push. */
export type OverlayAnswer =
  | {
      readonly kind: 'stored';
      readonly version: number;
      readonly created: boolean;
      /** The head it was checked against. */
      readonly revision: number;
      readonly expiresAt: string;
    }
  /** Not over the version it holds: `currentVersion`, null for none. */
  | { readonly kind: 'conflict'; readonly currentVersion: number | null }
  /** It doesn't apply, or a changed module doesn't compile: nothing stored. */
  | {
      readonly kind: 'refused';
      readonly errors: readonly ItemError[];
      readonly cubeMessage: unknown;
    }
  /** An envelope that doesn't open for its target: its secret is entered again. */
  | { readonly kind: 'secret'; readonly error: string }
  /** A data source xcube won't take as a connection. */
  | { readonly kind: 'connection'; readonly error: string }
  /** An xcube before overlay data sources still connected: pushed again later. */
  | { readonly kind: 'older'; readonly instances: readonly string[] };

/** An overlay's state (research `xcube-slice-5.md`, "GET …/overlays/{id}"). */
export interface OverlayStatus {
  readonly id: string;
  readonly version: number;
  readonly expiresAt: string;
  readonly upserts: readonly { readonly folderId: string; readonly name: string }[];
  readonly instance?: {
    readonly state: string;
    readonly errors?: readonly ItemError[];
    readonly cubeMessage?: string | null;
  };
}

/** An item xcube holds (research 3a, "GET …/items"). */
export interface HeldItem {
  readonly folderId: string;
  readonly name: string;
  /** `cube` or `view`, as xcube says; absent from an answer that says neither. */
  readonly kind?: 'cube' | 'view';
  readonly fullName: string;
  /** Every name it bound when it was published, to the full name bound: its own included. */
  readonly bindings: Readonly<Record<string, string>>;
  /**
   * A cube's data source as bound at publish and never rebound (T459, AC-157;
   * research xcube-e53cf2a8b8.md): the connection's full name, `default`, or
   * null for a cube that `extends` another and takes its parent's. Absent on
   * a view, and on any item from an image older than `e53cf2a8b8`: unknown.
   * From `4754c2c960` a whole send keeps it too, for an item sent unchanged
   * (research xcube-4754c2c960.md, "`PUT …/snapshot` with items"); from
   * `bc18f82c01` a change to that connection's settings serves it from the
   * new target as a new epoch, with no rebinding (xcube-bc18f82c01.md).
   */
  readonly dataSource?: string | null;
  /** The cube it extends, by name, where it extends one (research `xcube-0406293add.md`, 3.3). */
  readonly extends?: string;
}

/**
 * An error xcube places on an item, or on none (research 3a, `ItemError`).
 * From `256d632371` its kinds include `name_in_use`, `data_source_range` and
 * `reference_range`, each on the caller's own item and naming no other
 * item's folder (T701; research `xcube-256d632371.md`, "The error kinds").
 */
export interface ItemError {
  readonly folderId: string | null;
  readonly name: string | null;
  readonly line?: number;
  readonly column?: number;
  readonly kind: string;
  readonly message: string;
}

/**
 * An item a changeset would make, bound as it would land (research
 * `xcube-meta-revision-and-bindings.md`, "Item references (`ItemRef`) in
 * answers"): each name to the one item holding it, over the database head
 * (research `xcube-256d632371.md`, 3.3).
 */
export interface ItemRef {
  readonly folderId: string;
  readonly name: string;
  readonly fullName: string;
  /** Each other cube or view it names, to the full name bound; never its own, nor a data source. */
  readonly bindings: Readonly<Record<string, string>>;
  /** A cube's data source as bound; absent on a view, `null` for one that `extends`. */
  readonly dataSource?: string | null;
}

/** xcube's check of a changeset (research 3a, `ItemsCheck`). */
export interface ItemsCheckAnswer {
  readonly valid: boolean;
  readonly errors: readonly ItemError[];
  readonly cubeMessage: string | null;
  readonly probes: CheckAnswer['probes'];
  /** The database head the change was checked on. */
  readonly currentRevision: number | null;
  /**
   * The upserted items, as they would bind (T456): none where names or
   * bindings fail, and none from an image older than `40efaef823`.
   */
  readonly items: readonly ItemRef[];
}

/** The items of an answer, each as xcube refers to one; any it doesn't shape so, left out. */
const itemRefsOf = (items: unknown): ItemRef[] =>
  Array.isArray(items)
    ? items.flatMap((each: unknown): ItemRef[] => {
        const item = each as Partial<Record<keyof ItemRef, unknown>> | null;
        if (
          typeof item?.folderId !== 'string' ||
          typeof item.name !== 'string' ||
          typeof item.fullName !== 'string' ||
          item.bindings === null ||
          typeof item.bindings !== 'object'
        )
          return [];
        return [
          {
            folderId: item.folderId,
            name: item.name,
            fullName: item.fullName,
            bindings: Object.fromEntries(
              Object.entries(item.bindings as Record<string, unknown>).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
            ),
            ...(typeof item.dataSource === 'string' || item.dataSource === null
              ? { dataSource: item.dataSource }
              : {}),
          },
        ];
      })
    : [];

/** An answer xcube gave that none of the above are: said with its status and code. */
export class XcubeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    /** xcube's answer, where it gives more than its words: `instances`, say (T436). */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'XcubeError';
  }
}

/**
 * How long one call may take: xcube's own wait for its compile lane
 * (`XCUBE_COMPILE_WAIT_MS`, 120 s by default; research §"Install"), since an
 * import compiles its candidate before it answers. Past it the call is given
 * up, and the publish it follows stands (T419's review).
 */
const CALL_TIMEOUT_MS = 120_000;

/** The 400s and 413 xcube gives the same files every time: refusals, not failures. */
const REFUSED_CODES = new Set(['invalid_path', 'invalid_file_type', 'duplicate_path', 'too_large']);
/**
 * And the same items and tree (research 3a, "Common"; T449): Joi's
 * `bad_request` too, which the same body earns every time (T449's review).
 */
const REFUSED_ITEMS_CODES = new Set(['invalid_folders', 'too_large', 'bad_request']);

/** A folder as xcube takes it: its allowed groups where it has them (T436). */
const folderOf = ({ id, parentId, allowedGroups }: TreeFolder) => ({
  id,
  parentId,
  ...(allowedGroups === undefined ? {} : { allowedGroups: [...allowedGroups] }),
});

export function xcubeAdmin({
  cubeApiUrl,
  model,
  token,
  fetch: send = fetch,
  timeoutMs = CALL_TIMEOUT_MS,
}: {
  readonly cubeApiUrl: string;
  readonly model: string;
  /**
   * The service credential's token, minted for each call (T420, slice 4);
   * or a fixed token, as the stub xcube takes one.
   */
  readonly token: string | (() => Promise<string>);
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}): XcubeAdmin {
  const base = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/models/${encodeURIComponent(model)}`;
  const credential = typeof token === 'string' ? async () => token : token;

  const call = async (
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    wait = timeoutMs,
  ) => {
    const response = await send(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await credential()}`,
        'content-type': 'application/json',
      },
      signal: AbortSignal.timeout(wait),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, answer };
  };
  const failed = (status: number, answer: Record<string, unknown>) =>
    new XcubeError(
      status,
      typeof answer['code'] === 'string' ? answer['code'] : undefined,
      `xcube answered ${String(status)}${typeof answer['error'] === 'string' ? `: ${answer['error']}` : ''}`,
      answer,
    );

  return {
    async revision() {
      const { status, answer } = await call('GET', '/revision');
      // A model never imported: no revision to base the first one on.
      if (status === 404 && answer['code'] === 'unknown_model')
        return { generation: '', mode: 'files', current: null };
      if (status !== 200) throw failed(status, answer);
      const current = answer['current'] as { revision?: unknown; itemsHash?: unknown } | null;
      return {
        generation: String(answer['generation'] ?? ''),
        mode: answer['mode'] === 'items' ? 'items' : 'files',
        current:
          current === null || typeof current.revision !== 'number'
            ? null
            : {
                revision: current.revision,
                itemsHash: typeof current.itemsHash === 'string' ? current.itemsHash : null,
              },
      };
    },

    async folders(tree, security) {
      const { status, answer } = await call('PUT', '/folders', {
        folders: tree.map(folderOf),
        ...(security === undefined ? {} : { security }),
      });
      if (status !== 200) throw failed(status, answer);
      return { hash: String(answer['hash'] ?? '') };
    },

    async check({ files, securityContext, probes }) {
      const { status, answer } = await call('PUT', '/snapshot?dryRun=true', {
        files: files.map(({ path, content }) => ({ path, content })),
        securityContext,
        probes,
      });
      if (status === 200)
        return {
          valid: answer['valid'] === true,
          errors: Array.isArray(answer['errors']) ? (answer['errors'] as ModelError[]) : [],
          cubeMessage: typeof answer['cubeMessage'] === 'string' ? answer['cubeMessage'] : null,
          probes: Array.isArray(answer['probes'])
            ? (answer['probes'] as CheckAnswer['probes'])
            : [],
        };
      // A path, a file type or a size xcube won't take: the files are refused,
      // on the file xcube names where it names one of them (T445's review).
      if ((status === 400 || status === 413) && REFUSED_CODES.has(String(answer['code']))) {
        const message = String(answer['error'] ?? answer['code']);
        const named = files.find((file) => message.startsWith(`${file.path}: `));
        return {
          valid: false,
          errors: [{ path: named?.path ?? null, kind: 'compile', message }],
          cubeMessage: null,
          probes: [],
        };
      }
      throw failed(status, answer);
    },

    async checkChangeset({ upserts, deletes, securityContext, probes }) {
      const { status, answer } = await call('POST', '/changesets?dryRun=true', {
        baseRevision: null,
        upserts: upserts.map(({ folderId, name, kind, yaml }) => ({ folderId, name, kind, yaml })),
        deletes: deletes.map(({ folderId, name }) => ({ folderId, name })),
        securityContext,
        probes,
      });
      // A size, a tree or a request xcube won't take: refused as surely as
      // items that don't compile, as the files check's were (T426's review).
      if ((status === 400 || status === 413) && REFUSED_ITEMS_CODES.has(String(answer['code'])))
        return {
          valid: false,
          errors: [
            {
              folderId: null,
              name: null,
              kind: 'item',
              message: String(answer['error'] ?? answer['code']),
            },
          ],
          cubeMessage: null,
          probes: [],
          currentRevision: null,
          items: [],
        };
      if (status !== 200) throw failed(status, answer);
      return {
        valid: answer['valid'] === true,
        errors: Array.isArray(answer['errors']) ? (answer['errors'] as ItemError[]) : [],
        cubeMessage: typeof answer['cubeMessage'] === 'string' ? answer['cubeMessage'] : null,
        probes: Array.isArray(answer['probes']) ? (answer['probes'] as CheckAnswer['probes']) : [],
        currentRevision:
          typeof answer['currentRevision'] === 'number' ? answer['currentRevision'] : null,
        items: itemRefsOf(answer['items']),
      };
    },

    async items(options) {
      const { status, answer } = await call('GET', '/items', undefined, options?.timeoutMs);
      if (status === 404 && answer['code'] === 'unknown_model') return [];
      if (status !== 200) throw failed(status, answer);
      return (Array.isArray(answer['items']) ? (answer['items'] as Record<string, unknown>[]) : [])
        .filter((item) => typeof item['folderId'] === 'string' && typeof item['name'] === 'string')
        .map((item) => {
          const folderId = String(item['folderId']);
          const name = String(item['name']);
          const bindings = item['bindings'];
          const kind = item['kind'];
          const dataSource = item['dataSource'];
          return {
            folderId,
            name,
            ...(kind === 'cube' || kind === 'view' ? { kind } : {}),
            ...(kind === 'cube' && (typeof dataSource === 'string' || dataSource === null)
              ? { dataSource }
              : {}),
            ...(typeof item['extends'] === 'string' ? { extends: item['extends'] } : {}),
            // Its own name in any folder, as `256d632371` gives it (T701;
            // research `xcube-256d632371.md`, 1.1).
            fullName: typeof item['fullName'] === 'string' ? item['fullName'] : name,
            bindings: Object.fromEntries(
              Object.entries(
                bindings !== null && typeof bindings === 'object'
                  ? (bindings as Record<string, unknown>)
                  : {},
              ).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
            ),
          };
        });
    },

    async resolve(folderId, names, overlay) {
      const { status, answer } = await call('POST', '/resolve', {
        folderId,
        names,
        ...(overlay === undefined ? {} : { overlay }),
      });
      if (status !== 200) throw failed(status, answer);
      const found = (answer['names'] ?? {}) as Record<string, unknown>;
      return new Map(
        names.map((name) => [name, typeof found[name] === 'string' ? found[name] : null]),
      );
    },

    async putOverlay(id, { upserts, deletes, connections, baseVersion, ttlSeconds }) {
      const { status, answer } = await call('PUT', `/overlays/${encodeURIComponent(id)}`, {
        upserts: upserts.map(({ folderId, name, kind, yaml }) => ({ folderId, name, kind, yaml })),
        deletes: deletes.map(({ folderId, name }) => ({ folderId, name })),
        // Exactly the six keys: any other is refused (research, Gotcha 4).
        connections: connections.map(({ folderId, name, driver, authMethod, fields, sealed }) => ({
          folderId,
          name,
          driver,
          authMethod,
          fields,
          sealed,
        })),
        baseVersion,
        ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
      });
      const code = answer['code'];
      const error = String(answer['error'] ?? code ?? '');
      if (status === 200 || status === 201)
        return {
          kind: 'stored',
          version: Number(answer['version']),
          created: answer['created'] === true,
          revision: Number(answer['revision']),
          expiresAt: String(answer['expiresAt']),
        };
      if (status === 409 && code === 'conflict')
        return {
          kind: 'conflict',
          currentVersion:
            typeof answer['currentVersion'] === 'number' ? answer['currentVersion'] : null,
        };
      if (status === 409 && code === 'older_instances')
        return {
          kind: 'older',
          instances: Array.isArray(answer['instances'])
            ? (answer['instances'] as unknown[]).map(String)
            : [],
        };
      if (status === 422 && code === 'invalid_secret') return { kind: 'secret', error };
      if (status === 400 && code === 'invalid_connection') return { kind: 'connection', error };
      // Its data sources' refusals from `256d632371` (T701; research
      // `xcube-256d632371.md`, 2.6): two of one name, said only as in use,
      // and a `default` anywhere but the root.
      if (status === 409 && code === 'name_in_use')
        return { kind: 'connection', error: nameInUse(/"([^"]+)"/.exec(error)?.[1] ?? '') };
      if (status === 400 && code === 'default_outside_root')
        return { kind: 'connection', error: DEFAULT_AT_ROOT };
      if (status === 422)
        return {
          kind: 'refused',
          errors: Array.isArray(answer['errors']) ? (answer['errors'] as ItemError[]) : [],
          cubeMessage: answer['cubeMessage'],
        };
      // A size or a tree xcube will never take: refused as surely (as a changeset's).
      if ((status === 400 || status === 413) && REFUSED_ITEMS_CODES.has(String(code)))
        return {
          kind: 'refused',
          errors: [{ folderId: null, name: null, kind: 'item', message: error }],
          cubeMessage: null,
        };
      throw failed(status, answer);
    },

    async overlay(id) {
      const { status, answer } = await call('GET', `/overlays/${encodeURIComponent(id)}`);
      if (status === 404 && answer['code'] === 'unknown_overlay') return undefined;
      if (status !== 200) throw failed(status, answer);
      return answer as unknown as OverlayStatus;
    },

    async dropOverlay(id) {
      const { status, answer } = await call('DELETE', `/overlays/${encodeURIComponent(id)}`);
      if (status !== 204 && status !== 200) throw failed(status, answer);
    },

    async applyChangeset({ baseRevision, upserts, deletes, source }) {
      const { status, answer } = await call('POST', '/changesets', {
        baseRevision,
        upserts: upserts.map(({ folderId, name, kind, yaml }) => ({ folderId, name, kind, yaml })),
        deletes: deletes.map(({ folderId, name }) => ({ folderId, name })),
        ...(source === undefined ? {} : { source }),
      });
      return stored(status, answer);
    },

    async itemsSnapshot({ baseRevision, folders, items, source }) {
      const { status, answer } = await call('PUT', '/snapshot', {
        baseRevision,
        // Each with its allowed groups; `security` is no key of a snapshot's (Gotcha 1).
        folders: folders.map(folderOf),
        items: items.map(({ folderId, name, kind, yaml }) => ({ folderId, name, kind, yaml })),
        ...(source === undefined ? {} : { source }),
      });
      return stored(status, answer);
    },
  };

  /** An items snapshot's or a changeset's answer, which read alike (research 3a). */
  function stored(status: number, answer: Record<string, unknown>): SnapshotAnswer {
    if (status === 200 || status === 201)
      return {
        kind: 'stored',
        generation: String(answer['generation']),
        revision: Number(answer['revision']),
        itemsHash: String(answer['itemsHash']),
        created: answer['created'] === true,
      };
    if (status === 409 && answer['code'] === 'conflict')
      return {
        kind: 'conflict',
        currentRevision:
          typeof answer['currentRevision'] === 'number' ? answer['currentRevision'] : null,
      };
    if (status === 422)
      return {
        kind: 'refused',
        errors: Array.isArray(answer['errors']) ? answer['errors'] : [],
        cubeMessage: answer['cubeMessage'],
      };
    // A tree or a size xcube will never take: refused as surely.
    if ((status === 400 || status === 413) && REFUSED_ITEMS_CODES.has(String(answer['code'])))
      return {
        kind: 'refused',
        errors: [
          {
            folderId: null,
            name: null,
            kind: 'item',
            message: String(answer['error'] ?? answer['code']),
          },
        ],
        cubeMessage: null,
      };
    throw failed(status, answer);
  }
}
