import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { dayOf, whenOf } from '../../shell/formatTime';
import { CloseIcon } from '../../shell/paneIcons';
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
  /**
   * False for the current version where none is kept, as content saved
   * before proposals (T695): listed, with no kept copy to view or restore.
   */
  readonly kept?: boolean;
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

/**
 * "Today 15:02", "Yesterday 09:30", "22 Sep 10:14", with its year when not
 * this one's: as every moment is written (T477; the coordinator's Q8).
 */
export function whenText(iso: string, now: Date): string {
  return whenOf(new Date(iso), now);
}

/** "approved 22 Sep by Ada Admin", for a restore's description (design 06, state C). */
export function approvedText(version: KeptVersion): string {
  const at = new Date(version.at);
  // The day alone, as design 06 writes it ("22 Sep"): read against itself, no year.
  const day = dayOf(at, at);
  return version.approver === null ? `saved ${day}` : `approved ${day} by ${version.approver.name}`;
}

/** Its second line, who and who let it in (design 06, pin 5); its time is on the first. */
const byText = (version: KeptVersion) => {
  if (version.author === null) return 'before proposals';
  const approval =
    version.approver === null
      ? ''
      : version.approver.key === version.author.key
        ? ' · self-approved'
        : ` · approved by ${version.approver.name}`;
  return `by ${version.author.name}${approval}`;
};

/** Long enough to be clamped to two lines, with More beside it. */
const LONG = 110;

/** The clock on every item head's History button (design 06, pin 1; design 15:424; T684). */
export function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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
      {/* Design 06's .pane-head (pin 2; T695, EXP-21): 44 px over a rule,
          h2 16/22, and the 32 px close icon button. */}
      <header className="history-panel__head">
        <h2 id={`${ids}-heading`} ref={heading} tabIndex={-1}>
          History
        </h2>
        <span className="history-panel__sub">last 10 versions</span>
        <button
          type="button"
          className="icon-button history-panel__close"
          aria-label="Close History"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>

      <div className="history-panel__body">
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
              // The current version kept for none is the item itself (T695).
              const kept = version.kept !== false;
              return (
                <li
                  key={version.version}
                  className="history-panel__row"
                  aria-current={viewing === version.version ? 'true' : undefined}
                >
                  {/* Its number, Current, and its time at the right (pins 3 and 4). */}
                  <p className="history-panel__version">
                    <span data-testid="version-head">
                      <strong>Version {version.version}</strong>
                      {version.current ? (
                        <span className="history-panel__current">Current</span>
                      ) : null}
                    </span>
                    <time
                      className="history-panel__when"
                      dateTime={version.at}
                      data-testid="version-when"
                    >
                      {whenText(version.at, now)}
                    </time>
                  </p>
                  <p className="history-panel__by" data-testid="version-by">
                    {byText(version)}
                  </p>
                  <p
                    className={`history-panel__description${version.description === null ? ' is-empty' : ''}${long && !more ? ' is-clamped' : ''}`}
                    data-testid="version-description"
                  >
                    {version.description ?? 'No description'}
                  </p>
                  {/* View · More · Propose restoring… as link buttons (pin 6; EXP-24). */}
                  <div className="history-panel__actions">
                    {onView === undefined || !kept ? null : (
                      <button
                        type="button"
                        className="btn-link"
                        aria-label={
                          kind === 'data-source'
                            ? `Compare version ${String(version.version)} with current`
                            : `View version ${String(version.version)}`
                        }
                        onClick={() => {
                          onView(version.version);
                        }}
                      >
                        {/* A data source's settings are set against now (design 06, pin 6). */}
                        {kind === 'data-source' ? 'Compare with current' : 'View'}
                      </button>
                    )}
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
                    {/* Never "Restore": restoring is proposed and approved (pin 7). */}
                    {version.current || !kept || onRestore === undefined ? null : (
                      <button
                        type="button"
                        className="btn-link"
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
      </div>
      {/* Pinned at its foot over a rule (pin 8; EXP-21). */}
      <p className="history-panel__limit">
        Only the last 10 versions are kept. Restoring one is proposed and approved like any change.
      </p>
    </aside>
  );
}
