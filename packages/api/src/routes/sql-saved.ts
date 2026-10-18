import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type { SavedParameter, SavedQueryInput, SavedQueryStore } from '../repos/saved-queries';
import { runsSqlOn, type SqlSourcesOf } from './sql-sources';

/**
 * Saved queries (T812, AC-457, AC-483; R78 "saved queries (no sharing)";
 * design 17, pin 10 and state I2): a user's own, kept with their SQL, data
 * source and each parameter's name, type and last value.
 *
 * - `POST /api/sql/saved` saves a new one: Save…, and Save as new….
 * - `PUT /api/sql/saved/:id` replaces one: Save on a saved query, and a
 *   rename.
 * - `GET /api/sql/saved/:id` reopens one.
 *
 * Only its owner reaches one, a Super-Admin included: another's id answers
 * 404, as one that doesn't exist. A save needs no proposal and makes no
 * audit event (AC-457). A name is required, at most 100 characters and
 * unique to its owner; a description at most 1,000 (AC-483).
 */
const MAX_NAME = 100;
const MAX_DESCRIPTION = 1000;
/** As a run takes (`sql-runner.ts`'s MAX_SQL). */
const MAX_SQL = 100_000;
const MAX_PARAMETERS = 100;
const TYPES = new Set(['text', 'number', 'date', 'boolean']);
const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = 'No saved query of yours has that id.';

const ownerOf = (request: FastifyRequest) => request.wechartUser?.key ?? 'single-user';

const taken = (name: string) => `You already have a saved query named “${name}”.`;

/**
 * A save's body, or why it isn't one. Its `sourceId` may be null for "the one
 * it was saved with", which its owner isn't told once they may not run SQL on
 * it (T814): the route puts it back.
 */
type SaveInput = Omit<SavedQueryInput, 'sourceId'> & { readonly sourceId: string | null };

const NO_SOURCE = 'Say which data source it runs on: { sourceId }.';

function inputOf(body: unknown): SaveInput | { readonly error: string } {
  const said = (body ?? {}) as Record<string, unknown>;
  const name = typeof said.name === 'string' ? said.name.trim() : '';
  if (name === '') return { error: 'Give the query a name.' };
  if (name.length > MAX_NAME) return { error: `A name is at most ${MAX_NAME} characters.` };
  const description = said.description ?? '';
  if (typeof description !== 'string') return { error: 'A description is text.' };
  if (description.length > MAX_DESCRIPTION)
    return { error: `A description is at most ${MAX_DESCRIPTION.toLocaleString('en')} characters.` };
  if (said.sourceId !== null && (typeof said.sourceId !== 'string' || said.sourceId === ''))
    return { error: NO_SOURCE };
  if (typeof said.sql !== 'string' || said.sql.length > MAX_SQL)
    return { error: `Send its SQL as text, at most ${MAX_SQL.toLocaleString('en')} characters.` };
  const parameters = said.parameters ?? [];
  if (
    !Array.isArray(parameters) ||
    parameters.length > MAX_PARAMETERS ||
    !parameters.every(
      (each: unknown) =>
        typeof each === 'object' &&
        each !== null &&
        typeof (each as SavedParameter).name === 'string' &&
        PARAMETER_NAME.test((each as SavedParameter).name) &&
        TYPES.has((each as SavedParameter).type) &&
        typeof (each as SavedParameter).value === 'string',
    )
  )
    return {
      error: 'Each parameter is { name, type, value }: a name, Text, Number, Date or Boolean, and its value as text.',
    };
  return {
    name,
    description,
    sourceId: said.sourceId as string | null,
    sql: said.sql,
    parameters: (parameters as SavedParameter[]).map(({ name: each, type, value }) => ({
      name: each,
      type,
      value,
    })),
  };
}

type Kept = Awaited<ReturnType<SavedQueryStore['get']>> & object;

/** A saved query as its owner reads it: its source as kept, or null where they may not be told it. */
const answerOf = (query: Kept, sourceId: string | null = query.sourceId) => ({
  id: query.id,
  name: query.name,
  description: query.description,
  sourceId,
  sql: query.sql,
  parameters: query.parameters,
  createdAt: query.createdAt.toISOString(),
  updatedAt: query.updatedAt.toISOString(),
});

export function registerSavedQueries(
  app: FastifyInstance,
  {
    store,
    sourcesOf,
  }: {
    readonly store: SavedQueryStore;
    /**
     * The sources the request's user may see in the SQL runner's picker
     * (T814, AC-459). Unset where there are no data sources here, when each
     * query's source is answered as kept.
     */
    readonly sourcesOf?: SqlSourcesOf;
  },
) {
  /**
   * Each query answered to the request's user with its source only where
   * they may still run SQL on it; else none, neither its id nor its name,
   * so it opens with no source chosen (T814, AC-459).
   */
  const answersFor = async (request: FastifyRequest) => {
    const rows = await sourcesOf?.(request);
    return (query: Kept) =>
      answerOf(query, rows === undefined || runsSqlOn(rows, query.sourceId) ? query.sourceId : null);
  };
  /**
   * A save's source: as sent; else, null, the one it was saved with, kept
   * (Rename), or that of `from`, another of the owner's (Duplicate). The
   * owner holds none to send once they may not run SQL on it (T814-1).
   */
  const sourceFor = async (
    input: SaveInput,
    keptOf: () => Promise<Kept | undefined>,
  ): Promise<SavedQueryInput | undefined> => {
    if (input.sourceId !== null) return { ...input, sourceId: input.sourceId };
    const kept = await keptOf();
    return kept === undefined ? undefined : { ...input, sourceId: kept.sourceId };
  };
  /**
   * A new saved query; with `id`, one just deleted brought back under its own
   * id, by Delete's Undo (T813, AC-458). An id anyone holds is refused alike,
   * saying nothing of whose it is.
   */
  app.post('/api/sql/saved', USER, async (request, reply) => {
    const said = inputOf(request.body);
    if ('error' in said) return reply.status(400).send({ error: said.error });
    const { id, from } = (request.body ?? {}) as { id?: unknown; from?: unknown };
    if (id !== undefined && (typeof id !== 'string' || !UUID.test(id)))
      return reply.status(400).send({ error: 'A saved query’s id is a UUID.' });
    const input = await sourceFor(said, async () =>
      typeof from === 'string' && UUID.test(from) ? store.get(ownerOf(request), from) : undefined,
    );
    if (input === undefined) return reply.status(400).send({ error: NO_SOURCE });
    const result = await store.create(ownerOf(request), input, id?.toLowerCase());
    if ('held' in result) return reply.status(409).send({ error: 'That saved query can’t be brought back.' });
    if ('taken' in result) return reply.status(409).send({ error: taken(input.name) });
    return reply.status(201).send((await answersFor(request))(result.saved));
  });

  /** The owner's saved queries, by name, for the Saved tab (T813, AC-458): nobody else's. */
  app.get('/api/sql/saved', USER, async (request) => {
    const answer = await answersFor(request);
    return { queries: (await store.list(ownerOf(request))).map((query) => answer(query)) };
  });

  /**
   * Deleted by its owner alone, answered whole so Undo can bring it back
   * (T813, AC-458): its source as kept, for Undo alone, never shown (T814-1).
   */
  app.delete('/api/sql/saved/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = UUID.test(id) ? await store.remove(ownerOf(request), id) : undefined;
    if (removed === undefined) return reply.status(404).send({ error: NOT_FOUND });
    return reply.send(answerOf(removed));
  });

  app.put('/api/sql/saved/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.test(id)) return reply.status(404).send({ error: NOT_FOUND });
    const said = inputOf(request.body);
    if ('error' in said) return reply.status(400).send({ error: said.error });
    const input = await sourceFor(said, () => store.get(ownerOf(request), id));
    if (input === undefined) return reply.status(404).send({ error: NOT_FOUND });
    const result = await store.update(ownerOf(request), id, input);
    if (result === undefined) return reply.status(404).send({ error: NOT_FOUND });
    if ('taken' in result) return reply.status(409).send({ error: taken(input.name) });
    return reply.send((await answersFor(request))(result.saved));
  });

  app.get('/api/sql/saved/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = UUID.test(id) ? await store.get(ownerOf(request), id) : undefined;
    if (query === undefined) return reply.status(404).send({ error: NOT_FOUND });
    return reply.send((await answersFor(request))(query));
  });
}
