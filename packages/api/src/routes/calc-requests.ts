import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { Visibility } from '../access/visible';
import { USER } from '../auth/guard';
import type { WechartUser } from '../auth/user';
import type { CalcRequestFields } from '../db/schema';
import { shortOf } from '../model/bind';
import type { CalcRequest, CalcRequestStore } from '../repos/calc-requests';

/**
 * Calculation requests (T383, AC-050; F6): a calculation the quick
 * calculations menu can't express, asked by whoever builds a chart, of the
 * read-write members of the folder whose model defines the chart's cube.
 *
 * - `POST /api/calc-requests` records one: `{ chartId, cube, fields,
 *   description }`, the chart a chart its asker may open, and the cube one a
 *   shared folder's model defines, in a folder whose every kind they may see
 *   (AC-263). A cube of a folder they can't see answers as one no model
 *   defines, so a request says nothing of what they can't see.
 * - `GET /api/calc-requests` lists those asked of the folders the user may
 *   write, newest first. The chart is named only to those who may open it:
 *   one in its asker's workspace is theirs alone (AC-276). A field of a cube
 *   in a folder the user can't see is counted, not named.
 */

/** The longest description kept: the Propose dialog's limit (references.md, "Propose dialog"). */
const DESCRIPTION_LIMIT = 1000;

export interface CalcRequestRoutes {
  readonly store: CalcRequestStore;
  readonly userOf: (request: FastifyRequest) => WechartUser;
  /** What the user may see of the shared tree; undefined: everything, as with sign-in off. */
  readonly visibilityOf: (request: FastifyRequest) => Promise<Visibility | undefined>;
  /** The chart, by its id and title, where the user, seeing what `seen` says, may open it. */
  readonly openableChart: (
    request: FastifyRequest,
    chartId: string,
    seen: Visibility | undefined,
  ) => Promise<{ readonly id: string; readonly title: string } | undefined>;
  /** The shared folder and the model file in it that define a cube or view, by its full name. */
  readonly definedBy: (
    cube: string,
  ) => Promise<{ readonly folderId: string; readonly modelPath: string } | undefined>;
  /** The shared folder a full name's cube is in, by its prefix: the root's for one with none. */
  readonly folderOfCube: (cube: string) => Promise<string | undefined>;
  /** Each folder's path of titles below Shared, as the user may see it; null for one they can't. */
  readonly pathsOf: (request: FastifyRequest) => Promise<(folderId: string) => string[] | null>;
}

const FIELD_KINDS = ['measures', 'dimensions', 'timeDimensions', 'filters'] as const;

/** The fields as sent, or undefined where they aren't lists of names. */
function fieldsOf(value: unknown): CalcRequestFields | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const read = (kind: (typeof FIELD_KINDS)[number]): string[] | undefined => {
    const list = raw[kind] ?? [];
    if (!Array.isArray(list)) return undefined;
    return list.every((each) => typeof each === 'string' && each !== '')
      ? (list as string[])
      : undefined;
  };
  const [measures, dimensions, timeDimensions, filters] = FIELD_KINDS.map(read);
  if (
    measures === undefined ||
    dimensions === undefined ||
    timeDimensions === undefined ||
    filters === undefined
  )
    return undefined;
  return { measures, dimensions, timeDimensions, filters };
}

/** The cube a member is of: what comes before its first dot. */
const cubeOfMember = (member: string): string => member.slice(0, Math.max(0, member.indexOf('.')));

/** Whether the user sees a folder's models: every kind of it (AC-263); everything, where undefined. */
const seesModelsOf = (seen: Visibility | undefined, folderId: string): boolean =>
  seen === undefined || seen.rights.get(folderId)?.kinds === 'all';

export function registerCalcRequests(app: FastifyInstance, routes: CalcRequestRoutes): void {
  const { store, userOf, visibilityOf, openableChart, definedBy, folderOfCube, pathsOf } = routes;

  app.post('/api/calc-requests', USER, async (request, reply) => {
    const body = request.body as
      { chartId?: unknown; cube?: unknown; fields?: unknown; description?: unknown } | undefined;
    const { chartId, cube } = body ?? {};
    const fields = fieldsOf(body?.fields);
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    if (
      typeof chartId !== 'string' ||
      chartId === '' ||
      typeof cube !== 'string' ||
      cube === '' ||
      fields === undefined ||
      description === '' ||
      description.length > DESCRIPTION_LIMIT
    )
      return reply.code(400).send({
        error: `Send the chart, its cube, the fields in use and a description of the calculation, up to ${String(DESCRIPTION_LIMIT)} characters: { chartId, cube, fields, description }.`,
      });
    const seen = await visibilityOf(request);
    const chart = await openableChart(request, chartId, seen);
    if (chart === undefined)
      return reply.code(404).send({ error: 'There’s no such chart, or it isn’t yours to open.' });
    const defined = await definedBy(cube);
    // One in a folder they can't see answers as one no model defines.
    if (defined === undefined || !seesModelsOf(seen, defined.folderId))
      return reply.code(409).send({
        error: `No shared folder’s model defines ${cube}, so there is no one to ask. A cube of your own workspace is yours to change.`,
      });
    const user = userOf(request);
    const recorded = await store.record({
      chartId: chart.id,
      cube,
      folderId: defined.folderId,
      modelPath: defined.modelPath,
      fields,
      description,
      requestedBy: { key: user.key, name: user.name },
    });
    return reply.code(201).send({ id: recorded.id });
  });

  /**
   * A read-write member takes a request up, opening it into their workspace
   * (T384, AC-051): recorded with it, so that approving their proposal of the
   * measure resolves it (T385, AC-052). It answers the file that defines the
   * cube now, to copy it, since that file may have moved since the request
   * was made. Anyone else finds no such request. An open request only, of a
   * cube some model still defines; otherwise no one is recorded.
   */
  app.post('/api/calc-requests/:id/take', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const asked = await store.get(id);
    const seen = await visibilityOf(request);
    if (
      asked === undefined ||
      (seen !== undefined && seen.rights.get(asked.folderId)?.write !== true)
    )
      return reply.code(404).send({ error: 'There’s no such request, or it isn’t asked of you.' });
    if (asked.status !== 'open') return reply.code(409).send({ error: 'It is resolved already.' });
    const defined = await definedBy(asked.cube);
    if (defined?.folderId !== asked.folderId)
      return reply.code(409).send({
        error: `No model in its folder defines ${shortOf(asked.cube)} now, so there is nothing to open.`,
      });
    const user = userOf(request);
    await store.take(asked.id, { key: user.key, name: user.name });
    return { folderId: defined.folderId, modelPath: defined.modelPath, cube: asked.cube };
  });

  app.get('/api/calc-requests', USER, async (request) => {
    const seen = await visibilityOf(request);
    // Where no tree holds the user to folders, every one (a Super-Admin's).
    const asked =
      seen === undefined
        ? await store.all()
        : await store.inFolders(
            [...seen.rights].flatMap(([folderId, right]) => (right.write ? [folderId] : [])),
          );
    const pathOf = await pathsOf(request);
    // Each cube's folder found once for the whole list.
    const folders = new Map<string, Promise<string | undefined>>();
    const folderOf = (cube: string) => {
      let found = folders.get(cube);
      if (found === undefined) {
        found = folderOfCube(cube);
        folders.set(cube, found);
      }
      return found;
    };
    return {
      requests: await Promise.all(
        asked.map((each) => shownTo(request, seen, pathOf, folderOf, each)),
      ),
    };
  });

  /** A request as the user may see it. */
  const shownTo = async (
    request: FastifyRequest,
    seen: Visibility | undefined,
    pathOf: (folderId: string) => string[] | null,
    folderOf: (cube: string) => Promise<string | undefined>,
    each: CalcRequest,
  ) => {
    const chart = await openableChart(request, each.chartId, seen);
    const shown = async (members: readonly string[]) => {
      const kept: string[] = [];
      for (const member of members) {
        const folder = await folderOf(cubeOfMember(member));
        if (folder !== undefined && seesModelsOf(seen, folder)) kept.push(member);
      }
      return kept;
    };
    const fields = {
      measures: await shown(each.fields.measures),
      dimensions: await shown(each.fields.dimensions),
      timeDimensions: await shown(each.fields.timeDimensions),
      filters: await shown(each.fields.filters),
    };
    const total = FIELD_KINDS.reduce((sum, kind) => sum + each.fields[kind].length, 0);
    const named = FIELD_KINDS.reduce((sum, kind) => sum + fields[kind].length, 0);
    return {
      id: each.id,
      chart: chart ?? null,
      cube: each.cube,
      folderId: each.folderId,
      // Listed to its read-write members alone, who see its path.
      folderPath: pathOf(each.folderId) ?? [],
      modelPath: each.modelPath,
      fields,
      // Fields of cubes in folders the user can't see: counted, never named.
      unseenFields: total - named,
      description: each.description,
      requestedBy: each.requestedBy.name,
      requestedAt: each.requestedAt.toISOString(),
      status: each.status,
      // What resolved it (T385, AC-052): the measures, on its own cube, which
      // its readers see; by whose proposal, approved by whom, and when.
      resolution:
        each.resolution === null
          ? null
          : {
              members: each.resolution.members,
              by: each.resolution.by.name,
              approvedBy: each.resolution.approvedBy,
              at: each.resolution.at.toISOString(),
            },
    };
  };
}
