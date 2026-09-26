import { randomUUID } from 'node:crypto';

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
 * - `PUT …/models/:model/folders`: the tree, `{ model, hash }`; `400
 *   invalid_folders` without the root `froot`.
 * - `PUT …/models/:model/snapshot` with `items`: the switch, and after it
 *   the whole model; `200` for the current items whatever the base, `409
 *   conflict` when the base isn't current, `422 invalid_items` when told to
 *   refuse, `201` for a new revision. With `files`: slice 2's import, or
 *   `409 mode` once the model holds items.
 * - `PUT …/snapshot?dryRun=true` with `files`: the check (T445), with no
 *   mode check, as xcube's.
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

    const route =
      /\/v1\/semantic\/models\/([^/]+)\/(revision|snapshot|folders|changesets|items)$/.exec(
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
        items: head.items.map(({ folderId, name, kind }) => ({
          folderId,
          name,
          kind,
          fullName: folderId === 'froot' ? name : `${folderId}__${name}`,
          bindings: {},
        })),
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
        const valid = refusal === undefined;
        const asFiles = result.map((item) => ({ path: `${item.name}.yml`, content: item.yaml }));
        return answer(200, {
          model,
          valid,
          errors: refusal ?? [],
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
          items: [],
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
      if (refusal !== undefined)
        return answer(422, {
          error: 'The items do not compile',
          code: 'invalid_items',
          errors: refusal,
          cubeMessage: refusalMessage,
        });
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
      const { folders } = body as { folders: readonly TreeFolder[] };
      if (!folders.some((folder) => folder.id === 'froot' && folder.parentId === null))
        return answer(400, {
          error: 'The tree has no root folder froot',
          code: 'invalid_folders',
          problems: ['The tree has no root folder froot'],
        });
      modelOf(model).tree = folders;
      const hash = wrongTreeHash > 0 ? 'f'.repeat(64) : treeHashOf(folders);
      if (wrongTreeHash > 0) wrongTreeHash -= 1;
      return answer(200, { model, hash });
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
    holdItems: (model: string, items: readonly Item[]) => {
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
    /** Imports are refused with these errors, until cleared with `undefined`. */
    refuse: (
      errors: readonly (ModelError | ItemError)[] | undefined,
      cubeMessage: string | null = null,
    ) => {
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
