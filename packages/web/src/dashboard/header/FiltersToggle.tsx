/**
 * The Filters toggle, last in the dashboard's header (AC-486; design 19 pin 6;
 * direction.md §7g): a disclosure button, as the WAI-ARIA pattern defines one
 * (`references-compact-header.md` §2) — `aria-expanded` says whether the
 * header sheet is open, `aria-controls` names it. A plain `button`, so Tab
 * reaches it and Enter or Space presses it, focus staying put; no shortcut of
 * its own (R75).
 *
 * Its name doesn't change with the state: the state is in `aria-expanded`.
 */
export function FiltersToggle({
  open,
  controls,
  onToggle,
}: {
  readonly open: boolean;
  /** The sheet's id. */
  readonly controls: string;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={open ? 'btn header-toggle header-toggle--open' : 'btn header-toggle'}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <FunnelIcon />
      Filters
      <ChevronIcon />
    </button>
  );
}

/** Design 19's funnel (`i-filter`). */
function FunnelIcon() {
  return (
    <svg
      className="header-toggle__funnel"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M2 3h12l-4.6 5.4V13l-2.8-1.4V8.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Design 19's chevron (`i-chevd`), turned up while the sheet is open. */
function ChevronIcon() {
  return (
    <svg
      className="header-toggle__chevron"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path d="M3.5 6L8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
