import { BOUNDARY_SET_MAX_BYTES, boundarySetProblem, boundarySetRegions } from '@wechart/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import type { BoundarySet, BoundarySetStore } from '../repos/boundary-sets';

/**
 * Custom boundary sets (T979, AC-628; R81-1, "Folder item via proposal"):
 *
 * - `POST /api/boundary-sets` uploads one into the user's own My workspace,
 *   naming the shared folder it is to go to, which they must be able to
 *   write: a read-only member is refused (403), as anyone with no workspace.
 *   The GeoJSON is checked first (`boundarySetProblem`), the refusal naming
 *   the first feature that fails (422). It reaches the folder only through a
 *   proposal (`POST /api/proposals { kind: 'boundary-set', id }`) and its
 *   approval.
 * - `GET /api/boundary-sets?folder=` lists the sets a chart in that folder is
 *   offered: those landed in it and in the folders above it, found along
 *   the path as models are, of the folders the user sees.
 * - `GET /api/boundary-sets/:id/geojson` gives one set's GeoJSON, to one who
 *   sees its folder, or whose workspace holds it.
 */
export interface BoundarySetRoutes {
  readonly store: BoundarySetStore;
  /** The user's own workspace root, or none for one who has none. */
  readonly ownWorkspace: (request: FastifyRequest) => Promise<string | null>;
  /** Whether the user may see a shared folder, and write it; all of both with sign-in off. */
  readonly rights: (
    request: FastifyRequest,
  ) => Promise<(folderId: string) => { readonly sees: boolean; readonly writes: boolean }>;
  /** A shared folder's path: it, the folders above it and the root. */
  readonly pathOf: (folderId: string) => Promise<ReadonlySet<string>>;
  /** The workspace a folder is in, or none for a shared one. */
  readonly workspaceOf: (folderId: string) => Promise<string | null>;
  readonly userKey: (request: FastifyRequest) => string;
}

const READ_ONLY =
  'You can view this folder, but not add to it: only its read-write members can propose a boundary set to it.';
const NO_WORKSPACE = 'You have no workspace: only read-write members and Super-Admins have one.';
const MAX_NAME = 100;

const listed = (set: BoundarySet) => ({
  id: set.id,
  name: set.name,
  keyProperty: set.keyProperty,
  regions: set.regions,
  folderId: set.folderId,
  version: set.version,
  targetFolderId: set.targetFolderId,
});

export function registerBoundarySets(app: FastifyInstance, routes: BoundarySetRoutes): void {
  app.post(
    '/api/boundary-sets',
    // A GeoJSON file of up to 5 MB, as JSON text, with room for the rest.
    { ...USER, bodyLimit: BOUNDARY_SET_MAX_BYTES + 100_000 },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const own = await routes.ownWorkspace(request);
      if (own === null) return reply.code(403).send({ error: NO_WORKSPACE });
      const target = body['targetFolderId'];
      if (typeof target !== 'string' || target === '' || (await routes.workspaceOf(target)) !== null)
        return reply.code(400).send({
          error: 'Name the shared folder it is to go to: one where you have read-write access.',
        });
      const right = (await routes.rights(request))(target);
      if (!right.sees)
        return reply.code(404).send({ error: 'There’s no such folder, or it isn’t yours to see.' });
      if (!right.writes) return reply.code(403).send({ error: READ_ONLY });
      const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
      if (name === '' || name.length > MAX_NAME)
        return reply
          .code(400)
          .send({ error: `Give the boundary set a name of at most ${String(MAX_NAME)} characters.` });
      const keyProperty = typeof body['keyProperty'] === 'string' ? body['keyProperty'].trim() : '';
      const geojson = body['geojson'];
      if (JSON.stringify(geojson ?? null).length > BOUNDARY_SET_MAX_BYTES)
        return reply.code(413).send({ error: 'A boundary set is at most 5 MB.' });
      const problem = boundarySetProblem(geojson, keyProperty);
      if (problem !== undefined) return reply.code(422).send({ error: problem });
      const made = await routes.store.create({
        folderId: own,
        targetFolderId: target,
        name,
        keyProperty,
        geojson: geojson as Record<string, unknown>,
        regions: boundarySetRegions(geojson, keyProperty).length,
        createdBy: routes.userKey(request),
      });
      if ('taken' in made)
        return reply
          .code(409)
          .send({ error: `Your workspace already has a boundary set named “${name}”.` });
      return reply.code(201).send(listed(made));
    },
  );

  app.get('/api/boundary-sets', USER, async (request, reply) => {
    const folder = (request.query as { folder?: unknown }).folder;
    if (typeof folder !== 'string' || folder === '')
      return reply.code(400).send({ error: 'Name the folder: ?folder=.' });
    const rights = await routes.rights(request);
    // A workspace item's sets are its target's (AC-281): the caller passes that.
    const path = [...(await routes.pathOf(folder))].filter((id) => rights(id).sees);
    return { sets: (await routes.store.inFolders(path)).map(listed) };
  });

  app.get('/api/boundary-sets/:id/geojson', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const notThere = () =>
      reply.code(404).send({ error: 'There’s no such boundary set, or it isn’t yours to see.' });
    const set = /^[0-9a-f-]{36}$/i.test(id) ? await routes.store.get(id) : undefined;
    if (set === undefined) return notThere();
    const workspace = await routes.workspaceOf(set.folderId);
    const own = workspace === null ? null : await routes.ownWorkspace(request);
    const sees =
      workspace === null ? (await routes.rights(request))(set.folderId).sees : workspace === own;
    if (!sees) return notThere();
    return {
      id: set.id,
      name: set.name,
      keyProperty: set.keyProperty,
      geojson: await routes.store.geojson(id),
    };
  });
}
