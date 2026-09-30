import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';

/**
 * Deleting an item (design 14, R48; states A–E): the dialog opens at once,
 * titled as the confirmation, while it asks the server what depends on the
 * item (A1). Then it is either:
 * - **Can't delete**: what the user may see that depends on it, each a link
 *   opening in a new tab, the rest counted, never named (AC-322), and one
 *   line on what to do, with Close alone; or
 * - **the confirmation**, ending "You can't undo this." (Q4), with Cancel
 *   focused and one filled destructive button.
 *
 * The delete keeps its own check: refused after all, because something took
 * the item up meanwhile, the same dialog says so and nothing is deleted (A4).
 * An `alertdialog` throughout, as the built confirmations are (T182).
 */
export interface Dependent {
  readonly key: string;
  /** Its kind, drawn as Explore draws it: a dashboard's or chart's chip, a cube's or view's letter. */
  readonly icon: 'dashboard' | 'chart' | 'cube' | 'view';
  readonly name: string;
  /** Where it opens, in a new tab, so the list stays here while it is worked through. */
  readonly href?: string;
  /** Its folder or file, after its name. */
  readonly where: string;
  /** Its name in the code face: a cube's or view's. */
  readonly code?: boolean;
}

export interface DependentGroup {
  /** The list's label: "Dashboards that use it". */
  readonly heading: string;
  readonly rows: readonly Dependent[];
}

export interface Refusal {
  readonly kind: 'refused';
  /** Its first sentence: what depends on it, and what to do. */
  readonly lead: string;
  readonly groups?: readonly DependentGroup[];
  /** How many more there are in folders the user can't see. */
  readonly hidden?: number;
  /** One more line on how to free it, where there is one. */
  readonly help?: string;
  /** A way on from here, beside Close: "Open Archive 2025" (state E4). */
  readonly also?: { readonly label: string; readonly onSelect: () => void };
}

export interface Confirmation {
  readonly kind: 'confirm';
  /** What the confirmation says; "You can't undo this." follows it, or follows `note`. */
  readonly text: string;
  /** What goes with it, or the proposals it withdraws, between the text and the note. */
  readonly details?: ReactNode;
  /** A last line, in the small size, before "You can't undo this." */
  readonly note?: string;
}

export type Checked = Refusal | Confirmation;

export interface DeleteDialogProps {
  /** The item's name, as the headings quote it. */
  readonly name: string;
  /** The destructive button's words: "Delete chart". */
  readonly action: string;
  /** Its heading, where not `Delete “name”?`: "Clear My workspace?". */
  readonly heading?: string;
  /** What depends on it, asked as the dialog opens; or the confirmation, given where nothing is asked. */
  readonly check: (() => Promise<Checked>) | Confirmation;
  /** The delete: nothing where it went, or its refusal. */
  readonly remove: () => Promise<Refusal | undefined>;
  readonly onDeleted: () => void;
  /** Cancel, Close or Escape: the owner gives focus back to what opened it. */
  readonly onClose: () => void;
}

type Phase =
  | { readonly at: 'checking' }
  | { readonly at: 'failed'; readonly message: string }
  | { readonly at: 'confirm'; readonly confirmation: Confirmation; readonly failure?: string }
  | { readonly at: 'deleting'; readonly confirmation: Confirmation }
  | { readonly at: 'refused'; readonly refusal: Refusal };

const UNDO = 'You can’t undo this.';

const ICON_CLASS: Record<Dependent['icon'], string> = {
  dashboard: 'itemicon ic-dash',
  chart: 'itemicon ic-chart',
  cube: 'delete-dialog__kind',
  view: 'delete-dialog__kind',
};

/** The folders-you-can't-see line's icon, the eye struck through (design 14). */
function EyeOff() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Opens() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      className="delete-dialog__ext"
    >
      <path
        d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3.5a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1H7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function Groups({ groups }: { readonly groups: readonly DependentGroup[] }) {
  return (
    <div className="delete-dialog__deps">
      {groups.map((group) => (
        <div key={group.heading}>
          {/* Read as the list's label instead: "Views that use it, 1" (design 14, keyboard). */}
          <div className="delete-dialog__group" aria-hidden="true">
            {group.heading}
            <span className="delete-dialog__count">{group.rows.length}</span>
          </div>
          <ul aria-label={`${group.heading}, ${String(group.rows.length)}`}>
            {group.rows.map((row) => (
              <li key={row.key} className="delete-dialog__row">
                <span
                  className={ICON_CLASS[row.icon]}
                  data-icon={
                    row.icon === 'dashboard' || row.icon === 'chart' ? row.icon : undefined
                  }
                  aria-hidden="true"
                >
                  {row.icon === 'cube' ? 'C' : row.icon === 'view' ? 'V' : null}
                </span>
                <span className="delete-dialog__name">
                  {row.href === undefined ? (
                    <span className={row.code === true ? 'is-code' : undefined}>{row.name}</span>
                  ) : (
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={row.code === true ? 'is-code' : undefined}
                    >
                      {row.name}
                      <span className="visually-hidden"> (opens in a new tab)</span>
                    </a>
                  )}
                </span>
                <span className="delete-dialog__where">{row.where}</span>
                {row.href === undefined ? <span /> : <Opens />}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DeleteDialog({
  name,
  action,
  heading,
  check,
  remove,
  onDeleted,
  onClose,
}: DeleteDialogProps) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const safe = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  const [phase, setPhase] = useState<Phase>(() =>
    typeof check === 'function' ? { at: 'checking' } : { at: 'confirm', confirmation: check },
  );

  // Asked once, as it opens (A1).
  const asking = useRef(check);
  useEffect(() => {
    const ask = asking.current;
    if (typeof ask !== 'function') return undefined;
    let current = true;
    ask().then(
      (checked) => {
        if (!current) return;
        setPhase(
          checked.kind === 'refused'
            ? { at: 'refused', refusal: checked }
            : { at: 'confirm', confirmation: checked },
        );
      },
      (error: unknown) => {
        if (current)
          setPhase({
            at: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => {
      current = false;
    };
  }, []);

  // Escape is Cancel, or Close: whichever loses nothing; nothing while the
  // delete is under way, which can't be called back. Read through refs, so
  // the owner's re-renders never re-run it (T182's review).
  const closing = useRef(onClose);
  const under = useRef(phase.at);
  useEffect(() => {
    closing.current = onClose;
    under.current = phase.at;
  }, [onClose, phase.at]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && under.current !== 'deleting') closing.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Focus on the choice that loses nothing: Cancel, then Close once refused.
  const refused = phase.at === 'refused';
  useEffect(() => {
    safe.current?.focus();
  }, [refused]);

  const destroy = async (confirmation: Confirmation) => {
    setPhase({ at: 'deleting', confirmation });
    try {
      const refusal = await remove();
      if (refusal === undefined) onDeleted();
      else setPhase({ at: 'refused', refusal });
    } catch (error) {
      setPhase({
        at: 'confirm',
        confirmation,
        failure: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const title =
    phase.at === 'refused' ? `Can’t delete “${name}”` : (heading ?? `Delete “${name}”?`);
  const announced =
    phase.at === 'refused'
      ? `Can’t delete: ${phase.refusal.lead}`
      : phase.at === 'confirm'
        ? phase.confirmation.text
        : '';

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={`${ids}-body`}
        className="dialog delete-dialog"
      >
        <h2 id={`${ids}-title`}>
          {refused ? <StatusIcon kind="err" /> : null}
          {title}
        </h2>
        {phase.at === 'refused' ? (
          <>
            <p id={`${ids}-body`}>{phase.refusal.lead}</p>
            {phase.refusal.groups === undefined || phase.refusal.groups.length === 0 ? null : (
              <Groups groups={phase.refusal.groups} />
            )}
            {(phase.refusal.hidden ?? 0) === 0 ||
            (phase.refusal.groups ?? []).length === 0 ? null : (
              <p className="delete-dialog__unseen">
                <EyeOff />
                …and {String(phase.refusal.hidden)} more in folders you can’t see.
              </p>
            )}
            {phase.refusal.help === undefined ? null : (
              <p className="delete-dialog__note">{phase.refusal.help}</p>
            )}
          </>
        ) : phase.at === 'checking' ? (
          <StateLine kind="run" id={`${ids}-body`}>
            Checking what uses it…
          </StateLine>
        ) : phase.at === 'failed' ? (
          <StateLine kind="err" id={`${ids}-body`}>
            What uses it couldn’t be checked, so nothing was deleted: {phase.message}
          </StateLine>
        ) : (
          <>
            <p id={`${ids}-body`}>
              {phase.confirmation.text}
              {phase.confirmation.note === undefined ? ` ${UNDO}` : ''}
            </p>
            {phase.confirmation.details}
            {phase.confirmation.note === undefined ? null : (
              <p className="delete-dialog__note">
                {phase.confirmation.note} {UNDO}
              </p>
            )}
            {phase.at === 'deleting' ? <StateLine kind="run">Deleting…</StateLine> : null}
            {phase.at === 'confirm' && phase.failure !== undefined ? (
              <StateLine kind="err">{phase.failure}</StateLine>
            ) : null}
          </>
        )}
        {/* Said politely once the check answers (design 14, keyboard). */}
        <p role="status" className="visually-hidden">
          {announced}
        </p>
        <div className="dialog__actions">
          {phase.at === 'refused' ? (
            <>
              {phase.refusal.also === undefined ? null : (
                <button type="button" onClick={phase.refusal.also.onSelect}>
                  {phase.refusal.also.label}
                </button>
              )}
              <button ref={safe} type="button" className="btn-primary" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <button ref={safe} type="button" disabled={phase.at === 'deleting'} onClick={onClose}>
                Cancel
              </button>
              {/* The dialog's one primary, destructive, filled (T466, UX-106). */}
              <button
                type="button"
                className="btn-primary dialog__destructive"
                disabled={phase.at !== 'confirm'}
                onClick={() => {
                  if (phase.at === 'confirm') void destroy(phase.confirmation);
                }}
              >
                {action}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
