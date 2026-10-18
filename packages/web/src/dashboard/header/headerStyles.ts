/**
 * The compact dashboard header's own rules (F43; design 19; direction.md
 * §7g), installed after the shell's. Every value reuses an existing token:
 * no new colour, type size or weight.
 *
 * A template literal, so no backtick in a comment below.
 */
export const HEADER_CSS = `
/* The Filters toggle (AC-486; design 19 pin 6): a 32 px .btn, the funnel,
   the label and a chevron; drawn pressed on bg-subtle while the sheet is open,
   its chevron turned up (screen 2 pin 1). */
.header-toggle { gap: 6px; padding: 0 8px 0 10px; flex: none; }
.header-toggle--open { background: var(--wc-bg-subtle); }
.header-toggle__chevron { color: var(--wc-text-secondary); }
.header-toggle--open .header-toggle__chevron { transform: rotate(180deg); }

/* The header sheet (AC-487; design 19 screen 2): directly under the row, the
   full width of the dashboard. Hidden while closed, whatever else styles it. */
.header-sheet { background: var(--wc-bg-page); }
.header-sheet[hidden] { display: none; }
/* The description and the ownership line, 8 + 20 + 4 + 16 + 8 (design 19
   .about), ruled off from the row above. */
.header-sheet__about {
  display: grid;
  gap: 4px;
  padding: 8px 24px;
  border-top: 1px solid var(--wc-border-subtle);
}
.header-sheet__about > .dashboard__description,
.header-sheet__about > .dashboard__ownership { margin: 0; }
`;
