/**
 * The tile menu's row icons, as design 08 draws them (T682; its `i-*`
 * symbols, 14 px, in the row's secondary ink): one for each action, so a row
 * reads by its shape as well as its words.
 */
const PATHS = {
  funnel: <path d="M2.5 3h11L9.3 8v4.6l-2.6 1.2V8z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
  funnelMinus: (
    <>
      <path d="M1.5 3h9L7.3 7v4.2l-2 1V7z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10.5 11h4.5" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  invert: (
    <>
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" />
    </>
  ),
  all: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.2 1.6" />
      <path d="M5.2 8.2l2 2 3.8-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  x: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />,
  rows: <path d="M2.5 4h11M2.5 8h11M2.5 12h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />,
  drill: (
    <>
      <path d="M4 2.5v6.5h8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.5 6.5L12 9l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  detailsTile: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6.5h12M6 6.5v7" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  panel: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 9.5h12" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 11.5h4" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  table: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6h12M2 9.5h12M6 2.5v11" stroke="currentColor" strokeWidth="1.2" />
    </>
  ),
  chart: (
    <>
      <path d="M2.5 13.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4.5 11V8M8 11V4.5M11.5 11V6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  code: <path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 10.5v-7a1 1 0 0 1 1-1h7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  export: (
    <>
      <path d="M8 10V2.5M5 5.5l3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 9.5v3a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  pencil: <path d="M11.5 2.5l2 2L6 12H4v-2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  /** A range along an axis: its two ends and the span between. */
  range: (
    <>
      <path d="M3 4v8M13 4v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.6" />
    </>
  ),
  /** A series: a line through its points. */
  series: (
    <>
      <path d="M2.5 11.5l3.5-4 3 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
} as const;

export type MenuIconName = keyof typeof PATHS;

export function MenuIcon({ name }: { name: MenuIconName }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" data-icon={name}>
      {PATHS[name]}
    </svg>
  );
}
