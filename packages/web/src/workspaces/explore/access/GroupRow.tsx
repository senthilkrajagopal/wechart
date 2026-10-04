import { useRef } from 'react';

/**
 * One AD group in the Access panel (T330, redrawn by T473 as the 2026-09-27
 * design 07; direction.md rules 62, 65, 66):
 *
 * - a group set on this folder: a people icon, the group in the code face as
 *   the token carries it, and its × "Remove _group_ from read-write" (pin 4);
 *   marked Adding or Removing until saved, a removal with its Keep (pin 8);
 * - a group it inherits: locked, "from _folder_" as a link, with nothing to
 *   remove it by and a tooltip saying how a grant reaches down (pin 5);
 * - a group set here that an ancestor grants higher: "Read-write from
 *   _folder_ outranks this" under it (pin 6).
 */
export type ListName = 'read-write' | 'read-only';

interface FolderLink {
  readonly title: string;
  readonly onOpen: () => void;
}

export interface GroupRowProps {
  readonly group: string;
  /** Inherited: the folder that sets it, by name, opened by its link. */
  readonly source?: FolderLink;
  /** Set here: the list it is in, which its Remove names. */
  readonly listName?: ListName;
  /** Not saved yet: added to the list, or taken out of it (rule 65). */
  readonly pending?: 'adding' | 'removing' | undefined;
  /** Set here: takes it out of the pending setting. None while the panel is read-only. */
  readonly onRemove?: (() => void) | undefined;
  /** A pending removal: puts it back. */
  readonly onKeep?: (() => void) | undefined;
  /** Set here as read-only while an ancestor gives it read-write (rule 66). */
  readonly outrankedBy?: FolderLink | undefined;
}

function LockIcon() {
  return (
    <svg
      role="img"
      aria-label="Inherited"
      className="access-row__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg
      aria-hidden="true"
      className="access-row__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="11" cy="6.5" r="1.8" />
      <path d="M1.8 13c.5-2.2 2.1-3.4 4.2-3.4s3.7 1.2 4.2 3.4M10.2 9.8c1.9 0 3.3 1 3.8 3" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="access-row__info"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
    >
      <circle cx="8" cy="8" r="6.2" strokeWidth="1.4" />
      <path d="M8 7v4M8 4.8v.4" strokeWidth="1.6" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function GroupRow({
  group,
  source,
  listName,
  pending,
  onRemove,
  onKeep,
  outrankedBy,
}: GroupRowProps) {
  const removing = pending === 'removing';
  /**
   * Remove and Keep take each other's place: focus goes from the one used to
   * the one that replaces it, not to the page.
   */
  const swapped = useRef(false);
  const takeFocus = (button: HTMLButtonElement | null) => {
    if (button === null || !swapped.current) return;
    swapped.current = false;
    button.focus();
  };
  return (
    <li
      className={removing ? 'access-row is-removing' : 'access-row'}
      aria-label={source === undefined ? group : `${group}, inherited from ${source.title}`}
      title={
        source === undefined
          ? undefined
          : `Set on ${source.title}. A grant reaches every folder below it.`
      }
    >
      <div className="access-row__line">
        {source === undefined ? <PeopleIcon /> : <LockIcon />}
        <code className="access-row__group">{group}</code>
        {pending === 'adding' ? <span className="access-tag access-tag--add">Adding</span> : null}
        {removing ? <span className="access-tag access-tag--remove">Removing</span> : null}
        <span className="access-row__end">
          {source === undefined ? null : (
            <span className="access-row__from">
              from{' '}
              <button type="button" className="access-panel__link" onClick={source.onOpen}>
                {source.title}
              </button>
            </span>
          )}
          {removing && onKeep !== undefined ? (
            <button
              type="button"
              className="access-panel__link"
              aria-label={`Keep ${group}`}
              ref={takeFocus}
              onClick={() => {
                swapped.current = true;
                onKeep();
              }}
            >
              Keep
            </button>
          ) : null}
          {!removing && onRemove !== undefined && listName !== undefined ? (
            <button
              type="button"
              className="access-row__remove"
              aria-label={`Remove ${group} from ${listName}`}
              ref={takeFocus}
              onClick={() => {
                // A stored group stays, marked, with its Keep to go to.
                swapped.current = pending !== 'adding';
                onRemove();
              }}
            >
              <CrossIcon />
            </button>
          ) : null}
        </span>
      </div>
      {outrankedBy === undefined ? null : (
        <p className="access-row__outranked">
          <InfoIcon />
          <span>
            Read-write from{' '}
            <button type="button" className="access-panel__link" onClick={outrankedBy.onOpen}>
              {outrankedBy.title}
            </button>{' '}
            outranks this.
          </span>
        </p>
      )}
    </li>
  );
}
