import type { AuditStore } from '../repos/audit';

/**
 * The audit trail's retention (T370, AC-296): records older than the period
 * the deployment configures are removed, one year when it configures none.
 * Nothing else ever removes a record.
 */
export const AUDIT_RETENTION_DAYS = 365;

const DAY_MS = 86_400_000;
/** How often the period is applied: the trail is read in days, so hourly is ample. */
const EVERY_MS = 3_600_000;

/** Removes the records older than `days` before `now`; says how many. */
export function pruneAudit(
  audit: Pick<AuditStore, 'removeBefore'>,
  days: number,
  now: Date = new Date(),
): Promise<number> {
  return audit.removeBefore(new Date(now.getTime() - days * DAY_MS));
}

/**
 * Applies the period at once and then on an interval, until stopped. A
 * failure is logged and tried again next time: it removes nothing it
 * shouldn't, and what it leaves goes next time.
 */
export function startAuditRetention(
  audit: Pick<AuditStore, 'removeBefore'>,
  {
    days,
    every = EVERY_MS,
    now = () => new Date(),
    onError = () => undefined,
  }: {
    readonly days: number;
    readonly every?: number;
    readonly now?: () => Date;
    readonly onError?: (error: unknown) => void;
  },
): () => void {
  const prune = () => {
    pruneAudit(audit, days, now()).catch(onError);
  };
  prune();
  const timer = setInterval(prune, every);
  // Never what keeps the process up.
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
