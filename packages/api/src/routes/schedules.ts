import type { FastifyInstance, FastifyRequest } from 'fastify';

import { USER } from '../auth/guard';
import { userOf } from '../auth/user';
import type { CubeClient } from '../cube/client';
import { listedBuildables } from '../jobs/build';
import { EVERYTHING, NO_JOBS, reaches, type JobsAccess } from '../jobs/scope';
import {
  ScheduleRefused,
  type Schedule,
  type ScheduleFields,
  type WechartScheduler,
} from '../scheduler/schedules';
import type { ModelFileStore } from '../server';

/**
 * wechart's own schedules (T378, AC-234, AC-297; design 16, screen 2, Q10):
 * made, changed and deleted by any read-write member of the pre-aggregation's
 * folder, or a Super-Admin, at once and with no proposal; each listed to
 * those who may change it. Its maker stays its maker, named, whoever changes
 * it after, and after they leave the folder's groups: it runs with wechart's
 * service credential, as Jobs builds (T420), never as them.
 */

/** `cube.pre_aggregation`, as the jobs API names it. */
const PRE_AGGREGATION = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;

const NOT_THEIRS = {
  error: 'You can schedule only the pre-aggregations of folders you have read-write access to.',
};
const NO_SUCH_SCHEDULE = { error: 'There is no such schedule.' };

/** A schedule as the API gives it: its times, with who made it and who last changed it. */
const shown = (schedule: Schedule) => ({
  ...schedule,
  createdAt: schedule.createdAt.toISOString(),
  updatedAt: schedule.updatedAt.toISOString(),
});

export function registerWechartSchedules(
  app: FastifyInstance,
  {
    scheduler,
    client,
    modelFiles,
    access,
  }: {
    readonly scheduler: WechartScheduler;
    readonly client: CubeClient;
    readonly modelFiles?: ModelFileStore;
    /** Who may use Schedules, over which folders (T371); none, and everyone everywhere (sign-in off). */
    readonly access?: JobsAccess;
  },
): void {
  const scopeOf = (request: FastifyRequest) =>
    access === undefined ? Promise.resolve(EVERYTHING) : access.scope(request);

  /**
   * The fields asked for, with the pre-aggregation's folder from the model,
   * or the answer refusing them: one Jobs could build (T371), in a folder
   * the user writes.
   */
  const fieldsOf = async (
    request: FastifyRequest,
  ): Promise<
    { ok: true; fields: ScheduleFields } | { ok: false; status: number; body: { error: string } }
  > => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const text = (key: string) => (typeof body[key] === 'string' ? body[key] : '');
    const preAggregation = text('preAggregation');
    if (!PRE_AGGREGATION.test(preAggregation))
      return { ok: false, status: 400, body: { error: 'Name the pre-aggregation as cube.name.' } };
    const missed = body['missed'];
    if (missed !== undefined && missed !== 'once' && missed !== 'skip')
      return { ok: false, status: 400, body: { error: 'A missed run is run once, or skipped.' } };
    const row = (await listedBuildables(client, modelFiles, access)).find(
      (each) => each.id === preAggregation,
    );
    if (row === undefined)
      return { ok: false, status: 404, body: { error: 'There is no such pre-aggregation.' } };
    if (!reaches(await scopeOf(request), row.folderId ?? null))
      return { ok: false, status: 403, body: NOT_THEIRS };
    // Made of other rollups: built through them, never itself (T375, A3).
    if (row.buildable === false)
      return {
        ok: false,
        status: 400,
        body: { error: 'It has no partitions of its own: schedule the rollups it combines.' },
      };
    return {
      ok: true,
      fields: {
        name: text('name'),
        preAggregation,
        folderId: row.folderId ?? null,
        cron: text('cron'),
        timezone: text('timezone'),
        ...(missed === undefined ? {} : { missed }),
      },
    };
  };

  /** Who is asking, as a schedule names them. */
  const byOf = (request: FastifyRequest) => {
    const user = userOf(request);
    return { key: user.key, name: user.name };
  };

  // Those of the folders they write, a Super-Admin's every folder's (AC-297).
  app.get('/api/wechart-schedules', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    return (await scheduler.list())
      .filter((schedule) => reaches(scope, schedule.folderId))
      .map(shown);
  });

  app.post('/api/wechart-schedules', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const asked = await fieldsOf(request);
    if (!asked.ok) return reply.status(asked.status).send(asked.body);
    try {
      return reply.status(201).send(shown(await scheduler.create(asked.fields, byOf(request))));
    } catch (error) {
      if (error instanceof ScheduleRefused) return reply.status(400).send({ error: error.message });
      throw error;
    }
  });

  /** A schedule they may change, or the answer refusing it. */
  const theirs = async (request: FastifyRequest, id: string) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return { ok: false as const, status: 403, body: NO_JOBS };
    const schedule = await scheduler.get(id);
    if (schedule === undefined) return { ok: false as const, status: 404, body: NO_SUCH_SCHEDULE };
    if (!reaches(scope, schedule.folderId))
      return { ok: false as const, status: 403, body: NOT_THEIRS };
    return { ok: true as const, schedule };
  };

  // Changed at once, with no proposal, by any who write its folder (Q10).
  app.put('/api/wechart-schedules/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await theirs(request, id);
    if (!found.ok) return reply.status(found.status).send(found.body);
    // And the folder of the pre-aggregation it is moved to, if moved.
    const asked = await fieldsOf(request);
    if (!asked.ok) return reply.status(asked.status).send(asked.body);
    try {
      const changed = await scheduler.change(id, asked.fields, byOf(request));
      if (changed === undefined) return reply.status(404).send(NO_SUCH_SCHEDULE);
      return shown(changed);
    } catch (error) {
      if (error instanceof ScheduleRefused) return reply.status(400).send({ error: error.message });
      throw error;
    }
  });

  app.delete('/api/wechart-schedules/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await theirs(request, id);
    if (!found.ok) return reply.status(found.status).send(found.body);
    await scheduler.remove(id);
    return reply.status(204).send();
  });
}
