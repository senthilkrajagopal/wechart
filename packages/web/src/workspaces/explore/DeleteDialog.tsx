import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { shortDay } from '../../shell/relativeAge';
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
  /** Where its folder opens, in a new tab: a cube's, whose name opens nothing (state C). */
  readonly whereHref?: string;
  /** Its model file, before its folder, a link of its own (state C: Cube · Model · Folder). */
  readonly file?: { readonly text: string; readonly href?: string };
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

/** One thing that goes with what is deleted (design 14, B3): "Its 6 own charts · on no other dashboard". */
export interface Goes {
  readonly key: string;
  readonly icon: 'chart' | 'bookmark';
  readonly text: string;
  readonly aside: string;
}

/** An open proposal the delete withdraws (T528, AC-372; design 14, F2's rows). */
export interface WithdrawnProposal {
  readonly id: string;
  readonly title: string;
  /** Where it goes: "Sales / EMEA", or "Shared". */
  readonly targetPath: string;
  readonly proposedAt: string;
}

export interface Confirmation {
  readonly kind: 'confirm';
  /** What the confirmation says; "You can't undo this." follows it, or follows `note`. */
  readonly text: string;
  /** What goes with it, listed under the text (B3). */
  readonly goes?: readonly Goes[];
  /** Each open proposal it withdraws, named before anything goes (AC-372). */
  readonly withdraws?: readonly WithdrawnProposal[];
  /** Anything else, between the lists and the note. */
  readonly details?: ReactNode;
  /** A last line, in the small size, before "You can't undo this." */
  readonly note?: string;
}

/** A bookmark's icon, for what goes with a dashboard (B3). */
function BookmarkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M4.5 2h7v12L8 11.2 4.5 14z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** What goes with it, and the proposals it withdraws, each a list named by its heading. */
function ConfirmationLists({
  confirmation,
  withdrawsId,
}: {
  readonly confirmation: Confirmation;
  /** The withdrawn proposals' heading's id, which the dialog is described by too. */
  readonly withdrawsId: string;
}) {
  const withdraws = confirmation.withdraws ?? [];
  const now = new Date();
  return (
    <>
      {confirmation.goes === undefined || confirmation.goes.length === 0 ? null : (
        <ul className="delete-dialog__goes" aria-label={confirmation.text}>
          {confirmation.goes.map((each) => (
            <li key={each.key}>
              {each.icon === 'chart' ? (
                <span className="itemicon ic-chart" data-icon="chart" aria-hidden="true" />
              ) : (
                <span className="itemicon" aria-hidden="true">
                  <BookmarkIcon />
                </span>
              )}
              <span>{each.text}</span> <span className="delete-dialog__where">{each.aside}</span>
            </li>
          ))}
        </ul>
      )}
      {withdraws.length === 0 ? null : (
        <div className="delete-dialog__withdraws">
          <p id={withdrawsId} className="delete-dialog__label">
            {withdraws.length === 1
              ? 'It withdraws its open proposal'
              : `It withdraws ${String(withdraws.length)} open proposals`}
          </p>
          <ul className="delete-dialog__goes" aria-labelledby={withdrawsId}>
            {withdraws.map((proposal) => (
              <li key={proposal.id}>
                <span className="status status--idle">
                  <StatusIcon kind="idle" />
                  Waiting for review
                </span>{' '}
                <span className="delete-dialog__title">{proposal.title}</span>{' '}
                <span className="delete-dialog__where">
                  → {proposal.targetPath} · {shortDay(new Date(proposal.proposedAt), now)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
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

/** Whether "You can't undo this." follows the text: nothing listed or noted after it. */
const endsInText = (confirmation: Confirmation) =>
  confirmation.note === undefined &&
  (confirmation.goes ?? []).length === 0 &&
  (confirmation.withdraws ?? []).length === 0 &&
  confirmation.details === undefined;

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

/** Words, as a link opening in a new tab where there is somewhere to go. */
function Linked({
  text,
  href,
  code = false,
}: {
  readonly text: string;
  readonly href?: string | undefined;
  readonly code?: boolean;
}) {
  if (href === undefined) return <span className={code ? 'is-code' : undefined}>{text}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={code ? 'is-code' : undefined}
    >
      {text}
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
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
                <span className="delete-dialog__where">
                  {row.file === undefined ? null : (
                    <>
                      <Linked text={row.file.text} href={row.file.href} code />
                      {' · '}
                    </>
                  )}
                  <Linked text={row.where} href={row.whereHref} />
                </span>
                {row.href === undefined &&
                row.whereHref === undefined &&
                row.file?.href === undefined ? (
                  <span />
                ) : (
                  <Opens />
                )}
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
  /** The proposals a confirmation withdraws, said with it (T528's review). */
  const withdrawn =
    phase.at === 'confirm' || phase.at === 'deleting' ? (phase.confirmation.withdraws ?? []) : [];
  const announced =
    phase.at === 'refused'
      ? `Can’t delete: ${phase.refusal.lead}`
      : phase.at === 'confirm'
        ? withdrawn.length === 0
          ? phase.confirmation.text
          : `${phase.confirmation.text} It withdraws ${withdrawn.length === 1 ? 'its open proposal' : `${String(withdrawn.length)} open proposals`}: ${withdrawn.map((each) => each.title).join(', ')}.`
        : '';

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={withdrawn.length === 0 ? `${ids}-body` : `${ids}-body ${ids}-withdraws`}
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
            {/* "You can't undo this." ends it: after the text alone, or after
                what is listed, in the last line (Q4). */}
            <p id={`${ids}-body`}>
              {phase.confirmation.text}
              {endsInText(phase.confirmation) ? ` ${UNDO}` : ''}
            </p>
            <ConfirmationLists confirmation={phase.confirmation} withdrawsId={`${ids}-withdraws`} />
            {phase.confirmation.details}
            {endsInText(phase.confirmation) ? null : (
              <p className="delete-dialog__note">
                {phase.confirmation.note === undefined
                  ? UNDO
                  : `${phase.confirmation.note} ${UNDO}`}
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
