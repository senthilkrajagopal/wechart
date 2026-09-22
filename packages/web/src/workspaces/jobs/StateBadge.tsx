/**
 * A job's state as the prototype's `.status` shows one (T158, AC-152;
 * direction.md rule 22): an icon of its kind and its words, never colour
 * alone. The states are Cube's jobs API's (research/cube/
 * refresh-jobs-caching.md §B); the icons are the prototype's
 * (`prototype/ui.js`, `STATUS_SVG`), shared from `shell/StatusIcon`.
 */
import { StatusIcon, type StateKind } from '../../shell/StatusIcon';

export type { StateKind };

export function stateOf(status: string): { kind: StateKind; label: string } {
  if (status.startsWith('failure'))
    return { kind: 'err', label: `Failed${status.slice('failure'.length)}` };
  switch (status) {
    // Before Cube's first answer.
    case '':
      // Under way, as every "Asking Cube…" is drawn (T183's review).
      return { kind: 'run', label: 'Asking Cube…' };
    case 'done':
      return { kind: 'ok', label: 'Done' };
    case 'processing':
      return { kind: 'run', label: 'Processing' };
    case 'scheduled':
      return { kind: 'idle', label: 'Scheduled' };
    // "the job has failed" (research §B): its table is missing, with no error.
    case 'missing_partition':
      return { kind: 'err', label: 'Missing partition' };
    // Cube keeps a job's record for 24 hours; after that, or never started.
    case 'not_found':
      return { kind: 'warn', label: 'Not found' };
    case 'pre_agg_not_found':
      return { kind: 'err', label: 'Pre-aggregation not found' };
    default:
      // A raw queue state Cube passes through: shown as it is, still waiting.
      return { kind: 'idle', label: status };
  }
}

/** Any state as the prototype's `.status`: its icon, its words. */
export function Status({
  kind,
  label,
  testId,
  state,
}: {
  kind: StateKind;
  label: string;
  testId: string;
  /** The state as its source gave it, kept for a reader of the page. */
  state?: string;
}) {
  return (
    <span className={`status status--${kind}`} data-testid={testId} data-state={state}>
      <StatusIcon kind={kind} />
      {label}
    </span>
  );
}

export function StateBadge({ status }: { status: string }) {
  const { kind, label } = stateOf(status);
  return <Status kind={kind} label={label} testId="job-state" state={status} />;
}
