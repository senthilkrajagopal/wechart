import {
  effectiveGroups,
  folderRights,
  type FolderAccessSetting,
  type GroupList,
} from '@wechart/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import { Forbidden, userOf } from '../auth/user';
import { DocumentNotFoundError, StaleDocumentError } from '../repos/documents';
import type { FolderAccessStore } from '../repos/folder-access';

/**
 * A folder's AD groups (T314): `GET` its setting and effective groups, `PUT`
 * its setting.
 *
 * - Each setting, read-only and read-write, is a list of group names or
 *   `null` for unset, which inherits the parent's (AC-259, AC-260).
 * - Access is given to groups, never to a person: a body with anything but
 *   the two settings is refused (AC-259).
 * - A Super-Admin, or a read-write member of the folder, may see and change
 *   it (AC-259; direction.md rule 68); anyone else who can see the folder gets
 *   403; anyone who can't, 404, as for a folder that isn't there (AC-264).
 * - This route alone writes a folder's `access`: the folder document's own
 *   save keeps it as stored (server.ts, T314's review).
 */
const SETTINGS = new Set(['readOnly', 'readWrite']);

class Refused extends Error {}

/** A setting from a request: a list of group names, `null`, or left out (unset). */
function listFrom(value: unknown, name: string): GroupList {
  if (value === undefined || value === null) return null;
  if (
    !Array.isArray(value) ||
    !value.every((group) => typeof group === 'string' && group.trim() !== '')
  ) {
    throw new Refused(`${name} must be a list of AD group names, or null to inherit the parent’s.`);
  }
  // Each group once, as the provider names it.
  return [...new Set((value as string[]).map((group) => group.trim()))];
}

function settingFrom(body: unknown): FolderAccessSetting {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Refused('Send the folder’s readOnly and readWrite AD groups.');
  }
  const other = Object.keys(body).find((key) => !SETTINGS.has(key));
  if (other !== undefined) {
    throw new Refused(
      `"${other}" isn’t a setting: a folder’s access names AD groups, as readOnly and readWrite, never a person.`,
    );
  }
  const { readOnly, readWrite } = body as Record<string, unknown>;
  return { readOnly: listFrom(readOnly, 'readOnly'), readWrite: listFrom(readWrite, 'readWrite') };
}

export function registerFolderAccess(app: FastifyInstance, store: FolderAccessStore): void {
  /** What this user may do in the folder: undefined when they can't see it. */
  const lookUp = async (request: FastifyRequest) => {
    const { folderId } = request.params as { folderId: string };
    const user = userOf(request);
    const tree = await store.tree();
    const right = folderRights(tree, { groups: user.groups, superAdmin: user.superAdmin }).get(
      folderId,
    );
    return { folderId, right };
  };

  const answer = async (reply: FastifyReply, folderId: string) => {
    const tree = await store.tree();
    const folder = tree.find((each) => each.id === folderId);
    return reply.send({
      folderId,
      setting: folder?.access ?? { readOnly: null, readWrite: null },
      effective: effectiveGroups(tree, folderId),
    });
  };

  const notFound = (reply: FastifyReply) =>
    reply.code(404).send({ error: 'There’s no such folder, or it isn’t yours to see.' });

  // Seen, like changed, by writers alone: the Access panel is a read-write
  // member's or a Super-Admin's (direction.md §7, rule 68; T314's review).
  app.get('/api/folders/:folderId/access', USER, async (request, reply) => {
    const { folderId, right } = await lookUp(request);
    if (right === undefined) return notFound(reply);
    if (!right.write) {
      throw new Forbidden(
        'Only a Super-Admin or a read-write member of this folder can see its groups.',
      );
    }
    return answer(reply, folderId);
  });

  app.put('/api/folders/:folderId/access', USER, async (request, reply) => {
    const { folderId, right } = await lookUp(request);
    if (right === undefined) return notFound(reply);
    if (!right.write) {
      throw new Forbidden(
        'Only a Super-Admin or a read-write member of this folder can change its groups.',
      );
    }
    let setting: FolderAccessSetting;
    try {
      setting = settingFrom(request.body);
    } catch (error) {
      if (error instanceof Refused) return reply.code(400).send({ error: error.message });
      throw error;
    }
    try {
      if (!(await store.set(folderId, setting))) return notFound(reply);
    } catch (error) {
      // Changed, or removed, between reading it and writing it: said, not a 500.
      if (error instanceof StaleDocumentError) {
        return reply.code(409).send({ error: 'The folder changed as this was saved. Try again.' });
      }
      if (error instanceof DocumentNotFoundError) return notFound(reply);
      throw error;
    }
    return answer(reply, folderId);
  });
}
