import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { StateLine } from '../../shell/StatusIcon';

/**
 * An item's history (T357, AC-289; design 06, pins 2–8, states E and F;
 * rule 80): a 360 px panel beside the item, for its folder's read-write
 * members and Super-Admins, whose answer the API gives no one else. Its
 * last 10 versions newest first: the number, the current one tagged, when,
 * by whom and who let it in ("self-approved" when that was its author), and
 * the description, clamped to two lines with More. View draws a version;
 * "Propose restoring…" asks for a draft of it, to propose like any change.
 * It takes focus as it opens, and Esc closes it.
 */
export type HistoryKind = 'dashboard' | 'chart' | 'data-source';

interface Person {
  readonly key: string;
  readonly name: string;
}

export interface KeptVersion {
  readonly version: number;
  readonly at: string;
  readonly title: string;
  readonly author: Person | null;
  readonly approver: Person | null;
  readonly description: string | null;
  readonly current: boolean;
}

export const historyQuery = (kind: HistoryKind, id: string) => ({
  queryKey: ['history', kind, id] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }) => {
    const response = await fetch(
      `/api/history/${kind}/${encodeURIComponent(id)}`,
      signal === undefined ? {} : { signal },
    );
    // Not this user's to see: no history at all, as for a reader (AC-289).
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`History could not be read (${String(response.status)}).`);
    return (await response.json()) as { current: number; versions: readonly KeptVersion[] };
  },
});

const month = (at: Date) => at.toLocaleDateString('en-US', { month: 'short' });
const clock = (at: Date) => at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "Today, 15:02", "22 Sep, 10:14", or with its year when not this one's. */
export function whenText(iso: string, now: Date): string {
  const at = new Date(iso);
  if (at.toDateString() === now.toDateString()) return `Today, ${clock(at)}`;
  const year = at.getFullYear() === now.getFullYear() ? '' : ` ${String(at.getFullYear())}`;
  return `${String(at.getDate())} ${month(at)}${year}, ${clock(at)}`;
}

/** "approved 22 Sep by Ada Admin", for a restore's description (design 06, state C). */
export function approvedText(version: KeptVersion): string {
  const at = new Date(version.at);
  return version.approver === null
    ? `saved ${String(at.getDate())} ${month(at)}`
    : `approved ${String(at.getDate())} ${month(at)} by ${version.approver.name}`;
}

const byText = (version: KeptVersion, now: Date) => {
  const when = whenText(version.at, now);
  if (version.author === null) return `${when} · before proposals`;
  const approval =
    version.approver === null
      ? ''
      : version.approver.key === version.author.key
        ? ' · self-approved'
        : ` · approved by ${version.approver.name}`;
  return `${when} by ${version.author.name}${approval}`;
};

/** Long enough to be clamped to two lines, with More beside it. */
const LONG = 110;

export function HistoryPanel({
  kind,
  id,
  viewing,
  onView,
  onRestore,
  onClose,
  now = new Date(),
}: {
  readonly kind: HistoryKind;
  readonly id: string;
  /** The version drawn in the centre, if one is. */
  readonly viewing?: number | undefined;
  /** Draw a version, read-only (state A); dashboards and charts. */
  readonly onView?: ((version: number) => void) | undefined;
  /** Ask for a draft of a version, to propose (state C). */
  readonly onRestore?:
    ((version: KeptVersion & { readonly approvedText: string }) => void) | undefined;
  readonly onClose: () => void;
  readonly now?: Date;
}) {
  const ids = useId();
  const history = useQuery(historyQuery(kind, id));
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const heading = useRef<HTMLHeadingElement>(null);
  const box = useRef<HTMLElement>(null);
  // Focus to it as it opens (pin 2).
  useEffect(() => heading.current?.focus(), []);
  // Esc within it closes it, focus going back to where it was opened from.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && box.current?.contains(event.target as Node)) closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <aside ref={box} className="history-panel" aria-labelledby={`${ids}-heading`}>
      <header className="history-panel__head">
        <h2 id={`${ids}-heading`} ref={heading} tabIndex={-1}>
          History
        </h2>
        <span className="history-panel__sub">last 10 versions</span>
        <button
          type="button"
          className="btn-ghost btn-sm"
          aria-label="Close History"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {history.isPending ? (
        <ul className="history-panel__list" aria-busy="true" aria-label="Loading versions">
          {[0, 1, 2].map((each) => (
            <li key={each} className="history-panel__skeleton" aria-hidden="true" />
          ))}
        </ul>
      ) : history.isError ? (
        <div role="alert" className="history-panel__error">
          <StateLine kind="err">Couldn’t load this item’s history.</StateLine>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              void history.refetch();
            }}
          >
            Retry
          </button>
          <details>
            <summary>Details</summary>
            {history.error.message}
          </details>
        </div>
      ) : history.data === null ? (
        <p className="history-panel__none">This item’s history isn’t yours to see.</p>
      ) : (
        <ul className="history-panel__list">
          {history.data.versions.map((version) => {
            const long = (version.description ?? '').length > LONG;
            const more = open.has(version.version);
            return (
              <li
                key={version.version}
                className="history-panel__row"
                aria-current={viewing === version.version ? 'true' : undefined}
              >
                <p className="history-panel__version" data-testid="version-head">
                  <strong>Version {version.version}</strong>
                  {version.current ? <span className="history-panel__current">Current</span> : null}
                </p>
                <p className="history-panel__by" data-testid="version-by">
                  {byText(version, now)}
                </p>
                <p
                  className={`history-panel__description${version.description === null ? ' is-empty' : ''}${long && !more ? ' is-clamped' : ''}`}
                  data-testid="version-description"
                >
                  {version.description ?? 'No description'}
                </p>
                {long ? (
                  <button
                    type="button"
                    className="btn-link"
                    aria-expanded={more}
                    onClick={() => {
                      setOpen((was) => {
                        const next = new Set(was);
                        if (more) next.delete(version.version);
                        else next.add(version.version);
                        return next;
                      });
                    }}
                  >
                    {more ? 'Less' : 'More'}
                  </button>
                ) : null}
                <div className="history-panel__actions">
                  {onView === undefined ? null : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      aria-label={`View version ${String(version.version)}`}
                      onClick={() => {
                        onView(version.version);
                      }}
                    >
                      View
                    </button>
                  )}
                  {/* Never "Restore": restoring is proposed and approved (pin 7). */}
                  {version.current || onRestore === undefined ? null : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      aria-label={`Propose restoring version ${String(version.version)}…`}
                      onClick={() => {
                        onRestore({ ...version, approvedText: approvedText(version) });
                      }}
                    >
                      Propose restoring…
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="history-panel__limit">
        Only the last 10 versions are kept. Restoring one is proposed and approved like any change.
      </p>
    </aside>
  );
}
