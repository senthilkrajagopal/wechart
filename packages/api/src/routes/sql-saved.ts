import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type { SavedParameter, SavedQueryInput, SavedQueryStore } from '../repos/saved-queries';

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

/** A save's body, or why it isn't one. */
function inputOf(body: unknown): SavedQueryInput | { readonly error: string } {
  const said = (body ?? {}) as Record<string, unknown>;
  const name = typeof said.name === 'string' ? said.name.trim() : '';
  if (name === '') return { error: 'Give the query a name.' };
  if (name.length > MAX_NAME) return { error: `A name is at most ${MAX_NAME} characters.` };
  const description = said.description ?? '';
  if (typeof description !== 'string') return { error: 'A description is text.' };
  if (description.length > MAX_DESCRIPTION)
    return { error: `A description is at most ${MAX_DESCRIPTION.toLocaleString('en')} characters.` };
  if (typeof said.sourceId !== 'string' || said.sourceId === '')
    return { error: 'Say which data source it runs on: { sourceId }.' };
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
    sourceId: said.sourceId,
    sql: said.sql,
    parameters: (parameters as SavedParameter[]).map(({ name: each, type, value }) => ({
      name: each,
      type,
      value,
    })),
  };
}

const answerOf = (query: Awaited<ReturnType<SavedQueryStore['get']>> & object) => ({
  id: query.id,
  name: query.name,
  description: query.description,
  sourceId: query.sourceId,
  sql: query.sql,
  parameters: query.parameters,
  createdAt: query.createdAt.toISOString(),
  updatedAt: query.updatedAt.toISOString(),
});

export function registerSavedQueries(app: FastifyInstance, { store }: { readonly store: SavedQueryStore }) {
  /**
   * A new saved query; with `id`, one just deleted brought back under its own
   * id, by Delete's Undo (T813, AC-458). An id anyone holds is refused alike,
   * saying nothing of whose it is.
   */
  app.post('/api/sql/saved', USER, async (request, reply) => {
    const input = inputOf(request.body);
    if ('error' in input) return reply.status(400).send({ error: input.error });
    const id = (request.body as { id?: unknown } | undefined)?.id;
    if (id !== undefined && (typeof id !== 'string' || !UUID.test(id)))
      return reply.status(400).send({ error: 'A saved query’s id is a UUID.' });
    const result = await store.create(ownerOf(request), input, id?.toLowerCase());
    if ('held' in result) return reply.status(409).send({ error: 'That saved query can’t be brought back.' });
    if ('taken' in result) return reply.status(409).send({ error: taken(input.name) });
    return reply.status(201).send(answerOf(result.saved));
  });

  /** The owner's saved queries, by name, for the Saved tab (T813, AC-458): nobody else's. */
  app.get('/api/sql/saved', USER, async (request) => ({
    queries: (await store.list(ownerOf(request))).map(answerOf),
  }));

  /** Deleted by its owner alone, answered whole so Undo can bring it back (T813, AC-458). */
  app.delete('/api/sql/saved/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = UUID.test(id) ? await store.remove(ownerOf(request), id) : undefined;
    if (removed === undefined) return reply.status(404).send({ error: NOT_FOUND });
    return reply.send(answerOf(removed));
  });

  app.put('/api/sql/saved/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!UUID.test(id)) return reply.status(404).send({ error: NOT_FOUND });
    const input = inputOf(request.body);
    if ('error' in input) return reply.status(400).send({ error: input.error });
    const result = await store.update(ownerOf(request), id, input);
    if (result === undefined) return reply.status(404).send({ error: NOT_FOUND });
    if ('taken' in result) return reply.status(409).send({ error: taken(input.name) });
    return reply.send(answerOf(result.saved));
  });

  app.get('/api/sql/saved/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = UUID.test(id) ? await store.get(ownerOf(request), id) : undefined;
    if (query === undefined) return reply.status(404).send({ error: NOT_FOUND });
    return reply.send(answerOf(query));
  });
}
