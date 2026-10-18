import { useId } from 'react';

import type { FiltersSet } from './filtersSet';

/**
 * The Filters toggle, last in the dashboard's header (AC-486; design 19 pin 6,
 * states B3 and E; direction.md §7g): a disclosure button, as the WAI-ARIA
 * pattern defines one (`references-compact-header.md` §2) — `aria-expanded`
 * says whether the header sheet is open, `aria-controls` names it. A plain
 * `button`, so Tab reaches it and Enter or Space presses it, focus staying
 * put; no shortcut of its own (R75).
 *
 * It summarises the filters at all times (AC-196): the funnel, "Filters" and
 * the number set, named "Filters, n set" ("Filters, none set"), with "n of m
 * filters set: ‹their names›" as its description and tooltip. With no
 * filters at all it reads "Details", with the info icon: the sheet still
 * holds the description and the ownership line. Its name doesn't change with
 * the state: the state is in `aria-expanded`.
 */
export function FiltersToggle({
  open,
  controls,
  summary,
  onToggle,
}: {
  readonly open: boolean;
  /** The sheet's id. */
  readonly controls: string;
  readonly summary: FiltersSet;
  readonly onToggle: () => void;
}) {
  const describedBy = useId();
  const details = summary.of === 0;
  const name = details
    ? 'Details'
    : `Filters, ${summary.set === 0 ? 'none' : String(summary.set)} set`;
  const said = details
    ? undefined
    : `${String(summary.set)} of ${String(summary.of)} filters set${
        summary.names.length === 0 ? '' : `: ${summary.names.join(', ')}`
      }`;
  return (
    <>
      <button
        type="button"
        className={open ? 'btn header-toggle header-toggle--open' : 'btn header-toggle'}
        aria-expanded={open}
        aria-controls={controls}
        aria-label={name}
        aria-describedby={said === undefined ? undefined : describedBy}
        title={said}
        onClick={onToggle}
      >
        {details ? <InfoIcon /> : <FunnelIcon />}
        <span className="header-toggle__label">{details ? 'Details' : 'Filters'}</span>
        {details || summary.set === 0 ? null : (
          <span className="header-toggle__count">{summary.set}</span>
        )}
        <ChevronIcon />
      </button>
      {/* Its description, beside it rather than in it, so its text is not
        the button's. */}
      {said === undefined ? null : (
        <span id={describedBy} hidden>
          {said}
        </span>
      )}
    </>
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

/** The info icon, for "Details" (design 19 state E). */
function InfoIcon() {
  return (
    <svg
      className="header-toggle__info"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.2v4M8 4.8v.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
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
