import type { CubeClient } from '../cube/client';
import type { BuildHistory, OpenToken } from '../repos/build-history';
import { isFinished } from './build';

/**
 * Following the builds wechart starts to their ends, on the server (T372,
 * AC-150): every open job in wechart's history is asked of Cube's jobs API
 * until it ends, whether or not a browser has Jobs open, and again after a
 * restart, since the jobs are read from the database. Any API replica
 * follows any build: each job is taken on a lease, so no two followers ask
 * Cube for it at once, and each state is written once (AC-319; research
 * cube/ha-topology.md, table row 5).
 */

/**
 * Cube writes a job's record and queues its build without waiting for
 * either, so an ask in the first moments after the post can find no record
 * (`not_found`) or nothing queued yet (`missing_partition`), and the next
 * ask the job under way (research cube/job-records.md, "Statuses that can
 * flip in the first moments after a post", an inference from Cube's source).
 * Within this long of its start, neither is taken as the job's end.
 */
export const FIRST_MOMENTS_MS = 30_000;

/** A follower's hold on the jobs it takes while it asks: past it, another may take them. */
const LEASE_MS = 30_000;

/** Jobs asked of Cube in one go: `get` takes any number, but each costs Cube a queue read. */
const BATCH = 100;

/** How often the server asks: Cube sets no limit (research cube/job-records.md, "Polling cost and cadence"). */
export const FOLLOW_EVERY_MS = 2_000;

/**
 * After a round, a job is held this long more, so another replica's round
 * doesn't ask Cube for it again at once: each job is asked about once a round
 * however many replicas follow (AC-319).
 */
const ASKED_AGAIN_AFTER_MS = FOLLOW_EVERY_MS / 2;

/** What Cube answered for one job: its state, and the table it builds. */
interface Answer {
  readonly status: string;
  readonly table?: string;
}

function answersOf(answered: unknown): Map<string, Answer> {
  const answers = new Map<string, Answer>();
  if (!Array.isArray(answered)) return answers;
  for (const each of answered as Record<string, unknown>[]) {
    const { token, status, table } = each;
    // An answer naming no token or no state is left out: asked again next time.
    if (typeof token !== 'string' || typeof status !== 'string') continue;
    answers.set(token, { status, ...(typeof table === 'string' ? { table } : {}) });
  }
  return answers;
}

/** Whether `status` ends the job, given how long since Cube answered the post that made it. */
function ends(status: string, held: OpenToken, at: Date, firstMomentsMs: number): boolean {
  if (!isFinished(status)) return false;
  const early = at.getTime() - held.answeredAt.getTime() < firstMomentsMs;
  return !(early && (status === 'not_found' || status === 'missing_partition'));
}

/**
 * Each job's state, asked of Cube in one go; should Cube fail the batch —
 * one job whose context no longer compiles fails every job asked with it
 * (research cube/job-records.md, "`action: get`", an inference) — each is
 * asked alone, so one broken job holds up no other.
 */
async function answersFor(
  cube: Pick<CubeClient, 'jobStatuses'>,
  tokens: readonly string[],
): Promise<Map<string, Answer>> {
  try {
    return answersOf(await cube.jobStatuses(tokens));
  } catch (failure) {
    if (tokens.length === 1) throw failure;
    const answers = new Map<string, Answer>();
    for (const token of tokens) {
      try {
        for (const [each, answer] of answersOf(await cube.jobStatuses([token])))
          answers.set(each, answer);
      } catch {
        // Asked again next round.
      }
    }
    return answers;
  }
}

export function buildFollower({
  history,
  cube,
  now = () => new Date(),
  firstMomentsMs = FIRST_MOMENTS_MS,
  onEnded,
}: {
  readonly history: BuildHistory;
  readonly cube: Pick<CubeClient, 'jobStatuses'>;
  readonly now?: () => Date;
  readonly firstMomentsMs?: number;
  /**
   * The builds a round closed, with how each ended, once each: wechart's
   * scheduler counts a schedule's failed runs by them (T379, AC-155).
   */
  readonly onEnded?: (
    closed: readonly { readonly runId: string; readonly outcome: string }[],
  ) => unknown;
}) {
  return {
    /**
     * One round: takes the open jobs no other follower holds, asks Cube for
     * their states, writes each new one with when it was seen, and closes
     * every build whose jobs have all ended — this round's, and any a round
     * that stopped short left open.
     */
    async once(): Promise<void> {
      const held = await history.claim({ limit: BATCH, leaseMs: LEASE_MS, now: now() });
      try {
        if (held.length > 0) {
          const answers = await answersFor(
            cube,
            held.map((each) => each.token),
          );
          const at = now();
          for (const each of held) {
            const answer = answers.get(each.token);
            if (answer === undefined) continue;
            const final = ends(answer.status, each, at, firstMomentsMs);
            // The same state, and still not the end: nothing new to keep.
            if (answer.status === each.status && !final) continue;
            await history.seen({
              runId: each.runId,
              token: each.token,
              previous: each.status,
              status: answer.status,
              ...(answer.table === undefined ? {} : { table: answer.table }),
              at,
              final,
            });
          }
        }
        const closed = await history.closeEnded();
        if (closed.length > 0) await onEnded?.(closed);
      } finally {
        await history.release(held, new Date(now().getTime() + ASKED_AGAIN_AFTER_MS));
      }
    },
  };
}

export type BuildFollower = ReturnType<typeof buildFollower>;

/**
 * Follows on an interval until stopped, one round at a time. A round that
 * fails — Cube away, say — is logged and tried again next time; nothing it
 * held stays held past its lease.
 */
export function startFollowingBuilds(
  follower: BuildFollower,
  {
    every = FOLLOW_EVERY_MS,
    onError = () => undefined,
  }: { readonly every?: number; readonly onError?: (error: unknown) => void } = {},
): () => void {
  let running = false;
  const round = () => {
    if (running) return;
    running = true;
    follower
      .once()
      .catch(onError)
      .finally(() => {
        running = false;
      });
  };
  const timer = setInterval(round, every);
  // Never what keeps the process up.
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
