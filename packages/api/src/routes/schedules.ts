import type { FastifyInstance, FastifyRequest } from 'fastify';

import {
  actorOf,
  recordIn,
  scheduleChangeEntry,
  scheduleSettingsOf,
  type ScheduleChange,
} from '../audit/record';
import { USER } from '../auth/guard';
import { userOf } from '../auth/user';
import type { CubeClient } from '../cube/client';
import { listedBuildables, type Buildable } from '../jobs/build';
import { EVERYTHING, NO_JOBS, reaches, type JobsAccess } from '../jobs/scope';
import type { AuditStore } from '../repos/audit';
import type { BuildHistory, LastRun } from '../repos/build-history';
import { cronPreview } from '../scheduler/cron';
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

/**
 * A schedule as Schedules lists it (T552, AC-154; design 16, screen 2): its
 * pre-aggregation by its short name, with its folder, as Jobs shows it
 * (T371); its cron in words; its next five runs in its zone, from pg-boss's
 * own preview, with a clock change among them (Q3); and how its last run
 * went, from Run history.
 */
function listedRow(
  schedule: Schedule,
  row: Buildable | undefined,
  last: LastRun | undefined,
  now: Date,
  /** Whether the model's pre-aggregations were read: none, and whether it has this one isn't known. */
  known = true,
) {
  const preview = cronPreview(schedule.cron, schedule.timezone, now);
  return {
    ...shown(schedule),
    ...(row?.shortName === undefined ? {} : { shortName: row.shortName }),
    ...(row?.folderPath === undefined ? {} : { folderPath: row.folderPath }),
    // Whether the model still has its pre-aggregation (T379, design 16 E4).
    ...(known ? { inModel: row !== undefined } : {}),
    ...(preview.ok
      ? {
          when: preview.words,
          runs: preview.runs,
          ...(preview.change === undefined ? {} : { change: preview.change }),
        }
      : {}),
    lastRun:
      last === undefined
        ? null
        : {
            id: last.id,
            outcome: last.outcome,
            startedAt: last.startedAt.toISOString(),
            endedAt: last.endedAt?.toISOString() ?? null,
            error: last.error,
          },
  };
}

export function registerWechartSchedules(
  app: FastifyInstance,
  {
    scheduler,
    client,
    modelFiles,
    access,
    history,
    audit,
    now = () => new Date(),
  }: {
    readonly scheduler: WechartScheduler;
    readonly client: CubeClient;
    readonly modelFiles?: ModelFileStore;
    /** Who may use Schedules, over which folders (T371); none, and everyone everywhere (sign-in off). */
    readonly access?: JobsAccess;
    /** Each schedule's last run (T552); none, and none is shown. */
    readonly history?: BuildHistory;
    /** Where each change is recorded with who made it (T505, AC-294); none, and it isn't. */
    readonly audit?: Pick<AuditStore, 'record'>;
    /** Next runs are counted from it. */
    readonly now?: () => Date;
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
    | { ok: true; fields: ScheduleFields; row: Buildable }
    | { ok: false; status: number; body: { error: string } }
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
      row,
      fields: {
        name: text('name'),
        preAggregation,
        folderId: row.folderId ?? null,
        cron: text('cron'),
        timezone: text('timezone'),
        ...(missed === undefined ? {} : { missed }),
        // Checked by the scheduler: a whole number of 1 or more (T379, Q9).
        ...('suspendAfter' in body ? { suspendAfter: body['suspendAfter'] as number } : {}),
      },
    };
  };

  /** Who is asking, as a schedule names them. */
  const byOf = (request: FastifyRequest) => {
    const user = userOf(request);
    return { key: user.key, name: user.name };
  };

  /**
   * A schedule made, changed, resumed or deleted, in the audit trail by whom
   * (T505, AC-294; design 16, state I), in its pre-aggregation's folder.
   */
  const recorded = (request: FastifyRequest, schedule: Schedule, done: ScheduleChange) =>
    recordIn(audit, scheduleChangeEntry(actorOf(userOf(request)), schedule, done), request.log);

  // Those of the folders they write, a Super-Admin's every folder's (AC-297).
  app.get('/api/wechart-schedules', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const schedules = (await scheduler.list()).filter((schedule) =>
      reaches(scope, schedule.folderId),
    );
    // Each pre-aggregation's short name and folder, as Jobs has them; a
    // schedule doesn't need Cube to be listed, so none where it can't be read.
    const rows = await listedBuildables(client, modelFiles, access).catch(() => undefined);
    const byId = new Map((rows ?? []).map((row) => [row.id, row]));
    const last =
      history === undefined
        ? new Map<string, LastRun>()
        : await history.lastRunsOf(schedules.map((schedule) => schedule.id));
    const at = now();
    return schedules.map((schedule) =>
      listedRow(
        schedule,
        byId.get(schedule.preAggregation),
        last.get(schedule.id),
        at,
        rows !== undefined,
      ),
    );
  });

  /**
   * The form's reading of a cron and zone as they are typed (T552, AC-234;
   * design 16, D2–D4): in words or what's wrong, the refresh-key note's
   * flag, and the next five runs, from pg-boss's own preview, so what is
   * shown is what runs. Nothing of any folder's.
   */
  app.get('/api/wechart-schedules/preview', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const query = request.query as { cron?: unknown; timezone?: unknown };
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    return cronPreview(text(query.cron), text(query.timezone), now());
  });

  app.post('/api/wechart-schedules', USER, async (request, reply) => {
    const scope = await scopeOf(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    const asked = await fieldsOf(request);
    if (!asked.ok) return reply.status(asked.status).send(asked.body);
    try {
      const made = await scheduler.create(asked.fields, byOf(request));
      await recorded(request, made, { change: 'made', after: scheduleSettingsOf(made) });
      // As the list has it (T552's review): the page shows it at once.
      return reply.status(201).send(listedRow(made, asked.row, undefined, now()));
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
      await recorded(request, changed, {
        change: 'changed',
        before: scheduleSettingsOf(found.schedule),
        after: scheduleSettingsOf(changed),
      });
      const last = (await history?.lastRunsOf([id]))?.get(id);
      return listedRow(changed, asked.row, last, now());
    } catch (error) {
      if (error instanceof ScheduleRefused) return reply.status(400).send({ error: error.message });
      throw error;
    }
  });

  /**
   * Resume (T379, AC-155; design 16, E1, E3): a suspended schedule runs again
   * from its next time, its count of failures at 0, by any who write its
   * folder (Q10). One not suspended is answered as it is.
   */
  app.post('/api/wechart-schedules/:id/resume', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await theirs(request, id);
    if (!found.ok) return reply.status(found.status).send(found.body);
    const resumed = await scheduler.resume(id, byOf(request));
    if (resumed === undefined) return reply.status(404).send(NO_SUCH_SCHEDULE);
    // Recorded where it was suspended and now runs: one already running is answered as it is.
    if (found.schedule.suspendedAt !== null && resumed.suspendedAt === null)
      await recorded(request, resumed, {
        change: 'resumed',
        suspendedAt: found.schedule.suspendedAt,
        error: found.schedule.suspendedError,
      });
    const rows = await listedBuildables(client, modelFiles, access).catch(() => undefined);
    const last = (await history?.lastRunsOf([id]))?.get(id);
    return listedRow(
      resumed,
      rows?.find((row) => row.id === resumed.preAggregation),
      last,
      now(),
      rows !== undefined,
    );
  });

  app.delete('/api/wechart-schedules/:id', USER, async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = await theirs(request, id);
    if (!found.ok) return reply.status(found.status).send(found.body);
    if (await scheduler.remove(id))
      await recorded(request, found.schedule, {
        change: 'deleted',
        before: scheduleSettingsOf(found.schedule),
      });
    return reply.status(204).send();
  });
}
