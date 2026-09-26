/**
 * One AD group in the Access panel (T330; direction.md rules 62, 66): a group
 * set on this folder, with its Remove, or one it inherits, locked, with the
 * folder that sets it as a link and nothing to remove it by.
 */
export interface GroupRowProps {
  readonly group: string;
  /** Inherited: the folder that sets it, by name, opened by `onOpenSource`. */
  readonly source?: { readonly title: string; readonly onOpen: () => void };
  /** Set here: removes it from the folder's pending setting. */
  readonly onRemove?: () => void;
  /** Set here as read-only while an ancestor gives it read-write (rule 66). */
  readonly outrankedBy?: string;
}

function LockIcon() {
  return (
    <svg
      role="img"
      aria-label="Inherited"
      className="access-row__lock"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    >
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" />
    </svg>
  );
}

export function GroupRow({ group, source, onRemove, outrankedBy }: GroupRowProps) {
  return (
    <li
      className="access-row"
      aria-label={source === undefined ? group : `${group}, inherited from ${source.title}`}
    >
      {source === undefined ? null : <LockIcon />}
      <span className="access-row__group">{group}</span>
      {source === undefined ? null : (
        <button type="button" className="link-button access-row__source" onClick={source.onOpen}>
          {source.title}
        </button>
      )}
      {outrankedBy === undefined ? null : (
        <span className="access-row__note">Outranked: read-write from {outrankedBy}.</span>
      )}
      {onRemove === undefined ? null : (
        <button
          type="button"
          className="btn-ghost btn-sm access-row__remove"
          aria-label={`Remove ${group}`}
          onClick={onRemove}
        >
          Remove
        </button>
      )}
    </li>
  );
}
