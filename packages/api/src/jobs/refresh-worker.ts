import type { FastifyInstance } from 'fastify';

import { USER } from '../auth/guard';
import { latestModules, moduleFailing, refreshWorkerStateOf } from '../cube/health';
import type { XcubeRefreshWorker } from '../xcube/refresh-worker';
import { NO_JOBS, type JobsAccess } from './scope';

/**
 * The refresh worker's state, for Jobs' header and its panel (T553, AC-393;
 * design 16, state F and Q4), from xcube's refresh-worker route under the
 * service credential, for those who may use Jobs (T371): `/api/cube-health`
 * is anyone's, and this isn't. The state, as `refreshWorkerStateOf` reads it;
 * each worker, newest run first, with its revision, its last run and whether
 * that run finished; each module by its latest run, with its last good run
 * and whether it is failing. A module's error goes to Super-Admins alone: a
 * module can hold cubes of several folders, and its error can name some a
 * member can't see.
 */
const UNREAD = { error: 'The refresh worker’s state couldn’t be read from xcube.' };

export function registerRefreshWorker(
  app: FastifyInstance,
  {
    worker,
    access,
  }: {
    readonly worker: XcubeRefreshWorker;
    /** Required: who is a Super-Admin decides who sees a module's error (T553's review). */
    readonly access: JobsAccess;
  },
): void {
  app.get('/api/jobs/refresh-worker', USER, async (request, reply) => {
    const scope = await access.scope(request);
    if (!scope.all && !scope.writesAny) return reply.status(403).send(NO_JOBS);
    let report;
    try {
      report = await worker.read();
    } catch (error) {
      request.log.warn({ err: error }, 'could not read the refresh worker’s state from xcube');
      return reply.status(502).send(UNREAD);
    }
    const errorsShown = scope.all;
    return {
      status: refreshWorkerStateOf(report),
      modelRevision: report.revision,
      workers: report.workers
        .map((each) => ({
          instance: each.instance,
          revision: each.revision,
          lastRunAt: each.lastTickAt,
          // Its run ended, rather than stopped waiting on builds still running.
          finished: each.modules.length > 0 && each.modules.every((module) => module.finished),
        }))
        .toSorted((a, b) => b.lastRunAt.localeCompare(a.lastRunAt)),
      modules: latestModules(report)
        .map((module) => ({
          module: module.module,
          lastRunAt: module.lastTickAt,
          lastOkAt: module.lastOkAt,
          failing: moduleFailing(module),
          ...(errorsShown && moduleFailing(module) && module.lastError !== null
            ? { error: module.lastError.message }
            : {}),
        }))
        .toSorted((a, b) => a.module.localeCompare(b.module)),
      errorsShown,
    };
  });
}
