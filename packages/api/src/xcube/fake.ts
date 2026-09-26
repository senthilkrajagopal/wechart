import { randomUUID } from 'node:crypto';

import type { ModelFile } from '../server';
import { contentHashOf } from './snapshot';

/**
 * A stub xcube for tests (T419): its admin routes as
 * `docs/research/xcube-slice-2.md` records the fork's at `83cb9f0888`
 * (§"API surface we will use"), answered in memory, as a `fetch` a client
 * can be given. Every call is recorded, with the status it was answered.
 *
 * - `GET …/models/:model/revision`: `404 unknown_model` for a model never
 *   imported, otherwise `{ model, generation, current }`.
 * - `PUT …/models/:model/snapshot`: `200` for the current content whatever
 *   the base, `409 conflict` when the base isn't current, `422
 *   invalid_snapshot` when told to refuse, `201` for a new revision.
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
  readonly files: readonly ModelFile[];
}

export interface FakeCall {
  readonly method: string;
  readonly path: string;
  readonly authorization: string | null;
  readonly body: unknown;
  answered: number;
}

export function fakeXcube({ tokens = [FAKE_ADMIN_TOKEN] }: { tokens?: readonly string[] } = {}) {
  let generation = randomUUID();
  let models = new Map<string, Revision[]>();
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
  let refusal: readonly ModelError[] | undefined;
  /** Cube's own text with a refusal, as `/v1/meta` would give it (research: `cubeMessage`). */
  let refusalMessage: string | null = null;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const headOf = (model: string) => models.get(model)?.at(-1);

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

    const route = /\/v1\/semantic\/models\/([^/]+)\/(revision|snapshot)$/.exec(url.pathname);
    if (route === null) return answer(404, { error: 'Not found', code: 'not_found' });
    const model = decodeURIComponent(route[1]!);
    const head = headOf(model);

    if (route[2] === 'revision' && method === 'GET') {
      if (!models.has(model))
        return answer(404, { error: `Unknown model "${model}"`, code: 'unknown_model' });
      return answer(200, {
        model,
        generation,
        current:
          head === undefined
            ? null
            : { revision: head.revision, contentHash: head.contentHash, files: head.files.length },
        instance: {
          revision: head?.revision ?? null,
          state: head === undefined ? 'none' : 'active',
        },
      });
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
      const { baseRevision, files } = body as {
        baseRevision: number | null;
        files: readonly ModelFile[];
      };
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
      // Another replica's import lands between this one's read and its send.
      if (conflicts > 0) {
        conflicts -= 1;
        const other = [{ path: 'other/replica.yml', content: `# ${randomUUID()}\n` }];
        models.set(model, [
          ...(models.get(model) ?? []),
          {
            revision: (headOf(model)?.revision ?? 0) + 1,
            contentHash: contentHashOf(other),
            files: other,
          },
        ]);
      }
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
      if ((current?.revision ?? null) !== baseRevision)
        return answer(409, {
          error: "The model changed since the snapshot's base revision",
          code: 'conflict',
          currentRevision: current?.revision ?? null,
          currentContentHash: current?.contentHash ?? null,
        });
      if (refusal !== undefined)
        return answer(422, {
          error: 'The model does not compile',
          code: 'invalid_snapshot',
          contentHash,
          errors: refusal,
          cubeMessage: null,
        });
      const revision = (current?.revision ?? 0) + 1;
      models.set(model, [...(models.get(model) ?? []), { revision, contentHash, files }]);
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
      return head === undefined ? undefined : { ...head, generation };
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
    /** Imports are refused with these errors, until cleared with `undefined`. */
    refuse: (errors: readonly ModelError[] | undefined, cubeMessage: string | null = null) => {
      refusal = errors;
      refusalMessage = cubeMessage;
    },
    /** xcube's schema emptied and made again: a new generation, and no models. */
    recreate: () => {
      generation = randomUUID();
      models = new Map();
    },
  };
}
