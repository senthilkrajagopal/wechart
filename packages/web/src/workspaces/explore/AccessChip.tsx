import type { FolderAccess } from './folderRole';

/**
 * The user's access in a shared folder, as a chip in its header (T331;
 * direction.md rule 69; designs 04, 07 and 09, pin 7): Super-Admin with a
 * shield, Read-write with a pencil, or View only with an eye. The first two
 * in the accent, since they may change the folder; View only neutral. The
 * icons are the designs' own, at 14 px.
 */
const CHIPS: Record<
  FolderAccess,
  { readonly label: string; readonly icon: 'shield' | 'pencil' | 'eye'; readonly accent: boolean }
> = {
  'super-admin': { label: 'Super-Admin', icon: 'shield', accent: true },
  'read-write': { label: 'Read-write', icon: 'pencil', accent: true },
  'view-only': { label: 'View only', icon: 'eye', accent: false },
};

/** The chips' icons, at 14 px: also a read-only model's eye (T342). */
export function AccessIcon({ name }: { readonly name: 'shield' | 'pencil' | 'eye' | 'lock' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      data-icon={name}
    >
      {name === 'shield' ? (
        <path d="M8 1.8l5 1.9v4c0 3.1-2.1 5.5-5 6.5-2.9-1-5-3.4-5-6.5v-4z" />
      ) : null}
      {name === 'pencil' ? <path d="M10.8 2.7l2.5 2.5-7.6 7.6-3.1.6.6-3.1z" /> : null}
      {name === 'eye' ? (
        <>
          <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" />
          <circle cx="8" cy="8" r="2" />
        </>
      ) : null}
      {name === 'lock' ? (
        <>
          <rect x="3" y="7" width="10" height="7" rx="1.5" strokeWidth="1.5" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" strokeWidth="1.5" />
        </>
      ) : null}
    </svg>
  );
}

export function AccessChip({ access }: { readonly access: FolderAccess }) {
  const chip = CHIPS[access];
  return (
    <span
      className={chip.accent ? 'access-chip access-chip--accent' : 'access-chip'}
      data-testid="access-chip"
    >
      <AccessIcon name={chip.icon} />
      {/* Said as what it is, not as a bare word beside the heading. */}
      <span className="visually-hidden">Your access: </span>
      {chip.label}
    </span>
  );
}

/**
 * No group reaches the folder, on it, above it or beneath it (rule 63;
 * designs 04 and 09, state I): only Super-Admins see it, said as a chip with
 * a lock beside the access chip.
 */
export function OnlySuperAdminsChip() {
  return (
    <span className="access-chip" data-testid="only-super-admins">
      <AccessIcon name="lock" />
      Only Super-Admins can see this folder
    </span>
  );
}
