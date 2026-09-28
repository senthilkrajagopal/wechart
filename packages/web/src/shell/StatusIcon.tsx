import type { ReactNode } from 'react';

/**
 * A state's icon, as the prototype draws each (`prototype/ui.js`,
 * `STATUS_SVG`), and a line of state with it (T183, AC-177; direction.md
 * rule 3): every status, validation and job state shows an icon and words,
 * never colour alone.
 */
export type StateKind = 'ok' | 'run' | 'idle' | 'warn' | 'err' | 'info' | 'draft';

export function StatusIcon({ kind }: { kind: StateKind }) {
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
    // Not yet proposed: a dashed circle (design 04, pin 4; rule 79).
    case 'draft':
      return (
        <svg {...common}>
          <circle
            cx="8"
            cy="8"
            r="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2.6 2"
          />
        </svg>
      );
    // A note, not a state: the prototype's "i" (T466, UX-109).
    case 'info':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M8 7v4.5" stroke="var(--wc-bg-surface)" strokeWidth="1.6" />
          <circle cx="8" cy="4.8" r="1" fill="var(--wc-bg-surface)" />
        </svg>
      );
  }
}

/**
 * A line of state — loading, failed, done, a warning — with its icon: `err`
 * as an alert, the others as a status, unless the caller says otherwise.
 *
 * A live region is best kept mounted with its words changing (one inserted
 * with its words in it is announced unreliably), so with no words it stays,
 * empty, and its icon comes with its words.
 */
export function StateLine({
  kind,
  children,
  className,
  role,
  testId,
  id,
}: {
  kind: StateKind;
  children: ReactNode;
  className?: string | undefined;
  role?: 'alert' | 'status' | undefined;
  testId?: string | undefined;
  id?: string | undefined;
}) {
  const said = children !== '' && children !== null && children !== undefined && children !== false;
  return (
    <p
      id={id}
      className={className === undefined ? 'state-line' : `state-line ${className}`}
      role={role ?? (kind === 'err' ? 'alert' : 'status')}
      data-testid={testId}
    >
      {said ? (
        <>
          <StatusIcon kind={kind} />
          <span>{children}</span>
        </>
      ) : null}
    </p>
  );
}
