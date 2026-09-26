import type { ModelFile } from '../server';
import type { TreeFolder } from './folders';
import type { Item } from './items';

/**
 * xcube's admin routes for one model (T419; `docs/research/xcube-slice-2.md`,
 * §"API surface we will use"; items mode, T449: `xcube-slice-3a.md`), under
 * Cube's base path: `{CUBE_API_URL}/v1/semantic/models/{model}`.
 *
 * Called with xcube's static admin token until slice 4 gives wechart its
 * service credential (R29), never with a user's token. Only wechart's server
 * calls them (AC-327).
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
  /** The folder tree (T449, AC-333), and the tree hash xcube answers for it. */
  folders(tree: readonly TreeFolder[]): Promise<{ readonly hash: string }>;
}

/** An answer xcube gave that none of the above are: said with its status and code. */
export class XcubeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
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

export function xcubeAdmin({
  cubeApiUrl,
  model,
  token,
  fetch: send = fetch,
  timeoutMs = CALL_TIMEOUT_MS,
}: {
  readonly cubeApiUrl: string;
  readonly model: string;
  readonly token: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}): XcubeAdmin {
  const base = `${cubeApiUrl.replace(/\/$/, '')}/v1/semantic/models/${encodeURIComponent(model)}`;
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };

  const call = async (method: 'GET' | 'PUT', path: string, body?: unknown) => {
    const response = await send(`${base}${path}`, {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
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

    async folders(tree) {
      const { status, answer } = await call('PUT', '/folders', {
        folders: tree.map(({ id, parentId }) => ({ id, parentId })),
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

    async itemsSnapshot({ baseRevision, folders, items, source }) {
      const { status, answer } = await call('PUT', '/snapshot', {
        baseRevision,
        folders: folders.map(({ id, parentId }) => ({ id, parentId })),
        items: items.map(({ folderId, name, kind, yaml }) => ({ folderId, name, kind, yaml })),
        ...(source === undefined ? {} : { source }),
      });
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
    },
  };
}
