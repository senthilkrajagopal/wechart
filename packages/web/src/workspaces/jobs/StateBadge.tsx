/**
 * A job's state as the prototype's `.status` shows one (T158, AC-152;
 * direction.md rule 22): an icon of its kind and its words, never colour
 * alone. The states are Cube's jobs API's (research/cube/
 * refresh-jobs-caching.md §B); the icons are the prototype's
 * (`prototype/ui.js`, `STATUS_SVG`).
 */
export type StateKind = 'ok' | 'run' | 'idle' | 'warn' | 'err';

export function stateOf(status: string): { kind: StateKind; label: string } {
  if (status.startsWith('failure'))
    return { kind: 'err', label: `Failed${status.slice('failure'.length)}` };
  switch (status) {
    // Before Cube's first answer.
    case '':
      return { kind: 'idle', label: 'Asking Cube…' };
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

function Icon({ kind }: { kind: StateKind }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 16 16',
    'aria-hidden': true,
    'data-icon': kind,
  } as const;
  switch (kind) {
    case 'ok':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M4.5 8.2l2.2 2.2 4.8-4.8"
            stroke="var(--wc-bg-surface)"
            strokeWidth="1.8"
            fill="none"
          />
        </svg>
      );
    case 'warn':
      return (
        <svg {...common}>
          <path d="M8 1.5l7 12.5H1z" fill="var(--wc-status-warning-icon)" />
          <path d="M8 6v4M8 11.6v.4" stroke="#1f1f1e" strokeWidth="1.6" />
        </svg>
      );
    case 'err':
      return (
        <svg {...common}>
          <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="var(--wc-status-error-icon)" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" />
        </svg>
      );
    case 'run':
      return (
        <svg {...common}>
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="26 12"
          />
        </svg>
      );
    case 'idle':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      );
  }
}

export function StateBadge({ status }: { status: string }) {
  const { kind, label } = stateOf(status);
  return (
    <span className={`status status--${kind}`} data-testid="job-state" data-state={status}>
      <Icon kind={kind} />
      {label}
    </span>
  );
}
