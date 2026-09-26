import type { ModelFile } from '../server';

/**
 * xcube's admin routes for one model (T419; `docs/research/xcube-slice-2.md`,
 * §"API surface we will use"), under Cube's base path:
 * `{CUBE_API_URL}/v1/semantic/models/{model}`.
 *
 * Called with xcube's static admin token until slice 4 gives wechart its
 * service credential (R29), never with a user's token. Only wechart's server
 * calls them (AC-327).
 */
export interface XcubeHead {
  readonly generation: string;
  /** Null when xcube has no revision of the model: it has never been imported. */
  readonly current: { readonly revision: number; readonly contentHash: string } | null;
}

export type SnapshotAnswer =
  | {
      readonly kind: 'stored';
      readonly generation: string;
      readonly revision: number;
      readonly contentHash: string;
      /** False when xcube already held this content, and stored nothing new. */
      readonly created: boolean;
    }
  | { readonly kind: 'conflict'; readonly currentRevision: number | null }
  | {
      readonly kind: 'refused';
      readonly errors: readonly unknown[];
      readonly cubeMessage: unknown;
    };

export interface XcubeAdmin {
  revision(): Promise<XcubeHead>;
  snapshot(input: {
    readonly baseRevision: number | null;
    readonly files: readonly ModelFile[];
    readonly source?: Record<string, unknown>;
  }): Promise<SnapshotAnswer>;
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
        return { generation: '', current: null };
      if (status !== 200) throw failed(status, answer);
      const current = answer['current'] as { revision?: unknown; contentHash?: unknown } | null;
      return {
        generation: String(answer['generation'] ?? ''),
        current:
          current === null ||
          typeof current.revision !== 'number' ||
          typeof current.contentHash !== 'string'
            ? null
            : { revision: current.revision, contentHash: current.contentHash },
      };
    },

    async snapshot({ baseRevision, files, source }) {
      const { status, answer } = await call('PUT', '/snapshot', {
        baseRevision,
        files: files.map(({ path, content }) => ({ path, content })),
        ...(source === undefined ? {} : { source }),
      });
      if (status === 200 || status === 201)
        return {
          kind: 'stored',
          generation: String(answer['generation']),
          revision: Number(answer['revision']),
          contentHash: String(answer['contentHash']),
          created: answer['created'] === true,
        };
      if (status === 409)
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
      // A path, a file type or a size xcube will never take: refused as surely.
      if ((status === 400 || status === 413) && REFUSED_CODES.has(String(answer['code'])))
        return {
          kind: 'refused',
          errors: [
            { path: null, kind: 'compile', message: String(answer['error'] ?? answer['code']) },
          ],
          cubeMessage: null,
        };
      throw failed(status, answer);
    },
  };
}
