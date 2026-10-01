import { useEffect, useId, useRef, useState } from 'react';

import { useFocusTrap } from '../../shell/useFocusTrap';

/**
 * The Propose dialog (T358, AC-284; design 05 of 2026-09-27, states A, B
 * and F; rule 75). It names the target folder and what the item does there,
 * "new in this folder" or "replaces version n", and warns when what it
 * replaces isn't what it was copied from. What goes with it is listed with
 * the reason, with no way to take any out (AC-285). The description is
 * optional, counted in characters as the API counts them (code points,
 * `PROPOSAL_TEXT_LIMIT`), and never cut: past 1,000, Propose waits.
 *
 * What proposing would do is checked as the dialog opens (state F), so a
 * refusal is said before anything is typed.
 */
export const PROPOSAL_TEXT_LIMIT = 1000;

type Kind = 'dashboard' | 'chart' | 'data-source';

export interface ProposalCheckItem {
  readonly kind: Kind;
  readonly id: string;
  readonly title: string;
  /** Where it lands, from Shared: a library chart's own folder may differ. */
  readonly landsInPath: readonly string[];
  readonly replaces: {
    readonly id: string;
    readonly version: number;
    /** Whether it replaces the item it was copied from (rule 75). */
    readonly copiedFrom: boolean;
  } | null;
}

export type ProposalCheck =
  | { readonly state: 'checking'; readonly targetPath: readonly string[] }
  | { readonly state: 'refused'; readonly targetPath: readonly string[]; readonly error: string }
  | {
      readonly state: 'ready';
      readonly targetPath: readonly string[];
      /** The item proposed first, then what goes with it. */
      readonly items: readonly ProposalCheckItem[];
    };

const KIND_LABEL: Record<Kind, string> = {
  dashboard: 'Dashboard',
  chart: 'Chart',
  'data-source': 'Data source',
};

/** A folder as the dialog names it: "Sales / EMEA", and the root as "Shared". */
const folderText = (path: readonly string[]) => {
  const below = path[0] === 'Shared' ? path.slice(1) : path;
  return below.length === 0 ? 'Shared' : below.join(' / ');
};

const sameFolder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((part, at) => part === b[at]);

const count = new Intl.NumberFormat('en');

/** What an item does where it lands, from where it is proposed to. */
function doesText(item: ProposalCheckItem, targetPath: readonly string[]): string {
  const where = sameFolder(item.landsInPath, targetPath)
    ? 'this folder'
    : folderText(item.landsInPath);
  return item.replaces === null
    ? `new in ${where}`
    : `replaces version ${String(item.replaces.version)}${where === 'this folder' ? '' : ` in ${where}`}`;
}

/**
 * What the live region says, and only as the count crosses 900 and 1,000:
 * the folder description's counter says it too (T524).
 */
export function announcementOf(length: number): string {
  if (length > PROPOSAL_TEXT_LIMIT)
    return `${count.format(length - PROPOSAL_TEXT_LIMIT)} over the limit of 1,000 characters.`;
  if (length === PROPOSAL_TEXT_LIMIT) return 'At the limit of 1,000 characters.';
  if (length >= 900) return `${count.format(PROPOSAL_TEXT_LIMIT - length)} characters left.`;
  return '';
}

export function ProposeDialog({
  check,
  onPropose,
  onClose,
  busy = false,
  failure,
  restoring,
}: {
  readonly check: ProposalCheck;
  readonly onPropose: (description: string) => void;
  readonly onClose: () => void;
  readonly busy?: boolean;
  /** Why the proposal itself was refused, once sent. */
  readonly failure?: string | undefined;
  /**
   * A version restored (T357; design 06, state C): the title names it, the
   * item says whose content replaces what, and the description is filled in.
   */
  readonly restoring?: { readonly version: number; readonly description: string } | undefined;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  useFocusTrap(box);
  const [description, setDescription] = useState(restoring?.description ?? '');
  const length = [...description].length;
  const over = length > PROPOSAL_TEXT_LIMIT;
  const ready = check.state === 'ready';
  const mayPropose = ready && !over && !busy;

  // Escape closes it, as every dialog here closes; focus starts in the text.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    text.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Said politely, and only at 900, 1,000 and past it (design 05, state B).
  const [announced, setAnnounced] = useState('');
  const said = announcementOf(length);
  const band = length > PROPOSAL_TEXT_LIMIT ? 'over' : length >= 900 ? String(length >= 1000) : '';
  const [lastBand, setLastBand] = useState(band);
  if (band !== lastBand) {
    setLastBand(band);
    setAnnounced(said);
  }

  const [first, ...goesWith] = ready ? check.items : [];
  const unrelated =
    first?.replaces !== null && first?.replaces !== undefined && !first.replaces.copiedFrom;

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-heading`}
        className="dialog propose-dialog"
      >
        <h2 id={`${ids}-heading`}>
          {restoring === undefined
            ? `Propose to ${folderText(check.targetPath)}`
            : `Propose restoring version ${String(restoring.version)} to ${folderText(check.targetPath)}`}
        </h2>

        {check.state === 'checking' ? (
          <p role="status" className="propose-dialog__checking">
            Checking what it would replace…
          </p>
        ) : null}
        {check.state === 'refused' ? (
          <p role="alert" className="propose-dialog__refused">
            Can’t propose: {check.error}
          </p>
        ) : null}

        {first === undefined ? null : (
          <>
            <p className="propose-dialog__item" data-testid="propose-item">
              {KIND_LABEL[first.kind]} · {first.title} — {doesText(first, check.targetPath)}
              {restoring === undefined
                ? ''
                : ` with version ${String(restoring.version)}’s content`}
            </p>
            {unrelated ? (
              <p role="note" className="propose-dialog__warning">
                Replaces “{first.title}” (version {first.replaces!.version}), which this item wasn’t
                copied from. It was made new in your workspace.
              </p>
            ) : null}
            {goesWith.length === 0 ? null : (
              <div className="propose-dialog__goes">
                <h3 id={`${ids}-goes`}>Goes with it</h3>
                <p>
                  The {KIND_LABEL[first.kind].toLowerCase()} shows{' '}
                  {goesWith.length === 1 ? 'this item' : 'these items'} from your workspace. They’re
                  approved or rejected together.
                </p>
                <ul aria-labelledby={`${ids}-goes`}>
                  {goesWith.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      {KIND_LABEL[item.kind]} · {item.title} — {doesText(item, check.targetPath)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="field propose-dialog__description">
          <div className="propose-dialog__label-row">
            <label htmlFor={`${ids}-text`}>
              What changed <span className="propose-dialog__optional">· optional</span>
            </label>
            <span
              className={`propose-dialog__counter${over ? ' is-over' : ''}`}
              data-testid="propose-counter"
              aria-describedby={`${ids}-text`}
            >
              {count.format(length)} / 1,000
            </span>
          </div>
          <textarea
            id={`${ids}-text`}
            ref={text}
            rows={5}
            value={description}
            aria-invalid={over}
            aria-describedby={over ? `${ids}-over` : undefined}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && mayPropose) {
                event.preventDefault();
                onPropose(description);
              }
            }}
          />
          {over ? (
            <p id={`${ids}-over`} className="propose-dialog__over">
              Shorten to 1,000 characters.
            </p>
          ) : null}
          <p className="visually-hidden" aria-live="polite">
            {announced}
          </p>
        </div>

        <p className="propose-dialog__note">
          {restoring === undefined
            ? 'It lands when someone approves it. You may approve your own; the step is never skipped.'
            : 'Nothing changes until it’s approved.'}
        </p>
        {failure === undefined ? null : (
          <p role="alert" className="propose-dialog__refused">
            {failure}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            {check.state === 'refused' ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!mayPropose}
            onClick={() => {
              onPropose(description);
            }}
          >
            Propose
          </button>
        </div>
      </div>
    </div>
  );
}
