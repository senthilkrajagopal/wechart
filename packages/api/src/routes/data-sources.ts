import type { FieldValue, SealedV1 } from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import {
  DataSourceRefused,
  type DataSource,
  type DataSourceChange,
  type DataSourceStore,
  type Landing,
} from '../repos/data-sources';
import { XCUBE_PUBLIC_KEY, type XcubePublicKey } from '../secrets/xcube-key';

/**
 * A data source's own routes (T335; AC-269, AC-164, AC-312, AC-161, AC-262,
 * AC-263): opened in its settings, made in a folder, changed and removed.
 *
 * A secret is said only as stored, `{ stored: true }` (AC-164): what the store
 * keeps is the envelope the browser sealed to xcube's key (AC-298, AC-325),
 * and it never leaves for the browser.
 *
 * Until workspaces (T343, T344), a read-write member changes a folder's data
 * sources in place, as a folder's models are published in place today; T344
 * makes shared items read-only and routes a change through a proposal.
 */
export type DataSourceAccess = (
  request: FastifyRequest,
  folderId: string,
  want: 'read' | 'write',
) => Promise<{ readonly status: number; readonly body: { readonly error: string } } | undefined>;

/**
 * Where a save lands before wechart commits it, and a removal first (T442):
 * xcube's connections. Each throws `DataSourceRefused` to refuse.
 */
export interface DataSourceLanding {
  /** Made ready for a folder before a save's transaction: it asks the database nothing after. */
  readonly prepare: (folderId: string) => Promise<Required<Pick<Landing, 'land' | 'unland'>>>;
  readonly unland: (source: DataSource) => Promise<void>;
}

/** As the browser sees one: its secrets named, never held out. */
export function viewOf(source: DataSource) {
  return {
    id: source.id,
    folderId: source.folderId,
    name: source.name,
    driver: source.driver,
    authMethod: source.authMethod,
    fields: source.fields,
    secrets: Object.fromEntries(source.secrets.map((field) => [field, { stored: true }])),
    version: source.version,
    updatedAt: source.updatedAt,
  };
}

const NOT_THERE = { error: 'There’s no such data source, or it isn’t yours to see.' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFieldValue = (value: unknown): value is FieldValue =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/** The body's fields and envelopes, typed, or why not. */
function readBody(body: unknown): { value?: Record<string, unknown>; error?: string } {
  if (!isRecord(body)) return { error: 'Send the data source as a JSON object.' };
  if (body['fields'] !== undefined) {
    const fields = body['fields'];
    if (!isRecord(fields) || !Object.values(fields).every(isFieldValue))
      return { error: 'fields are an object of text, numbers, true or false.' };
  }
  if (body['sealed'] !== undefined && !isRecord(body['sealed']))
    return { error: 'sealed is an object of envelopes, by field.' };
  for (const key of ['name', 'driver', 'authMethod', 'folderId'])
    if (body[key] !== undefined && typeof body[key] !== 'string')
      return { error: `${key} is text.` };
  return { value: body };
}

export function registerDataSources(
  app: FastifyInstance,
  {
    store,
    access,
    key,
    landing,
  }: {
    readonly store: DataSourceStore;
    readonly access: DataSourceAccess;
    readonly landing?: DataSourceLanding;
    /** xcube's public key, which the browser seals a typed secret to (T441, AC-325). */
    readonly key?: XcubePublicKey;
  },
): void {
  // Public by nature: it seals, and opens nothing (AC-298).
  app.get('/api/data-sources/sealing-key', USER, async (_request, reply) =>
    key === undefined
      ? reply.status(503).send({
          error: `wechart has no key to seal a data source’s secrets to: set ${XCUBE_PUBLIC_KEY}.`,
        })
      : { kid: key.kid, x: key.x },
  );

  // Landed in xcube before it is committed, where xcube is there (T442): made
  // ready for the folder before the store opens its transaction.
  const landingIn = async (folderId: string): Promise<Landing> =>
    landing === undefined ? {} : landing.prepare(folderId);
  const refused = (reply: FastifyReply, error: unknown) => {
    if (error instanceof DataSourceRefused)
      return reply.status(error.status).send({ error: error.message, problems: error.problems });
    throw error;
  };
  /** The data source, where the request's user may `want` it; else the answer already sent. */
  const reached = async (
    request: FastifyRequest,
    reply: FastifyReply,
    want: 'read' | 'write',
  ): Promise<DataSource | undefined> => {
    const { id } = request.params as { id: string };
    const source = await store.get(id);
    if (source === undefined) {
      await reply.status(404).send(NOT_THERE);
      return undefined;
    }
    const readRefusal = await access(request, source.folderId, 'read');
    // One they may not see answers as one that isn't there (AC-264).
    if (readRefusal !== undefined) {
      await reply.status(404).send(NOT_THERE);
      return undefined;
    }
    const refusal = want === 'read' ? undefined : await access(request, source.folderId, want);
    if (refusal !== undefined) {
      await reply.status(refusal.status).send(refusal.body);
      return undefined;
    }
    return source;
  };

  app.get('/api/data-sources/:id', USER, async (request, reply) => {
    const source = await reached(request, reply, 'read');
    return source === undefined ? reply : viewOf(source);
  });

  app.post('/api/data-sources', USER, async (request, reply) => {
    const { value, error } = readBody(request.body);
    if (value === undefined) return reply.status(400).send({ error });
    const folderId = typeof value['folderId'] === 'string' ? value['folderId'] : '';
    if (folderId === '') return reply.status(400).send({ error: 'Name the folder it goes in.' });
    const refusal = await access(request, folderId, 'write');
    if (refusal !== undefined) return reply.status(refusal.status).send(refusal.body);
    try {
      const made = await store.create(
        {
          folderId,
          name: String(value['name'] ?? ''),
          driver: String(value['driver'] ?? ''),
          authMethod: String(value['authMethod'] ?? ''),
          fields: (value['fields'] ?? {}) as Record<string, FieldValue>,
          sealed: (value['sealed'] ?? {}) as Record<string, SealedV1>,
        },
        await landingIn(folderId),
      );
      return reply.status(201).send(viewOf(made));
    } catch (failure) {
      return refused(reply, failure);
    }
  });

  app.put('/api/data-sources/:id', USER, async (request, reply) => {
    const { value, error } = readBody(request.body);
    if (value === undefined) return reply.status(400).send({ error });
    const source = await reached(request, reply, 'write');
    if (source === undefined) return reply;
    const change: DataSourceChange = {
      ...(typeof value['name'] === 'string' ? { name: value['name'] } : {}),
      ...(typeof value['driver'] === 'string' ? { driver: value['driver'] } : {}),
      ...(typeof value['authMethod'] === 'string' ? { authMethod: value['authMethod'] } : {}),
      ...(value['fields'] === undefined
        ? {}
        : { fields: value['fields'] as Record<string, FieldValue> }),
      ...(value['sealed'] === undefined
        ? {}
        : { sealed: value['sealed'] as Record<string, SealedV1> }),
    };
    try {
      return viewOf(await store.update(source.id, change, await landingIn(source.folderId)));
    } catch (failure) {
      return refused(reply, failure);
    }
  });

  app.delete('/api/data-sources/:id', USER, async (request, reply) => {
    const source = await reached(request, reply, 'write');
    if (source === undefined) return reply;
    try {
      await store.remove(source.id, landing === undefined ? {} : { unland: landing.unland });
    } catch (failure) {
      return refused(reply, failure);
    }
    return reply.status(204).send();
  });
}
