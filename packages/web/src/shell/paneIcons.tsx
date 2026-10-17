/**
 * A docked pane's icons, as 2026-09-27 designs 01 and 11 draw them (T691;
 * SRC-05, SRC-12, MOD-02): its head's ✕ (`i-x`), and Back and Next in its
 * foot (`i-back`, `i-chev`), in place of the text glyphs "×", "‹" and "›".
 */
const common = {
  viewBox: '0 0 16 16',
  'aria-hidden': true,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
} as const;

/** The head's ✕: 16 px in its 32 px icon button. */
export function CloseIcon() {
  return (
    <svg {...common} width="16" height="16" data-icon="x">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Back, before its word. */
export function BackIcon() {
  return (
    <svg {...common} width="14" height="14" data-icon="back">
      <path d="M10 3.5L5.5 8 10 12.5" />
    </svg>
  );
}

/** Next, after its words. */
export function NextIcon() {
  return (
    <svg {...common} width="14" height="14" data-icon="chev">
      <path d="M6 3.5L10.5 8 6 12.5" />
    </svg>
  );
}
