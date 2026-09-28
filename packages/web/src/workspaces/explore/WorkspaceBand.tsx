/** The person the workspace is: the icon design 04 draws for My workspace. */
export function PersonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * On every page inside the user's workspace, a band saying the place is
 * theirs alone (T498; design 04 of 2026-09-27, pin 2; rule 72; surface 5):
 * in Explore across the contents, on an item's own page across the page.
 */
export function WorkspaceBand() {
  return (
    <div className="workspace-band" role="note">
      <PersonIcon />
      My workspace · only you can see this
    </div>
  );
}
