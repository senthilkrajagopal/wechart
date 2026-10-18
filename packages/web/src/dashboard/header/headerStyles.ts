/**
 * The compact dashboard header's own rules (F43; design 19; direction.md
 * §7g), installed after the shell's. Every value reuses an existing token:
 * no new colour, type size or weight.
 *
 * A template literal, so no backtick in a comment below.
 */
export const HEADER_CSS = `
/* The compact row (AC-484; design 19 .dhrow; direction §7g): one 48 px row,
   padded 0 24, ruled off in border-subtle on bg-page, fixed above the
   scrolling canvas as the header always was. In view mode at 1,024 px and
   wider it never wraps: the title and the tabs give way instead. */
.dashboard__header {
  flex-wrap: nowrap;
  gap: 8px;
  height: 48px;
  min-height: 48px;
  padding: 0 24px;
  background: var(--wc-bg-page);
  border-bottom: 1px solid var(--wc-border-subtle);
}
/* Each part keeps to its own width; the title, the way back, the tabs and
   the buttons keep to one line by their own rules, not by the row's, which
   would pass nowrap on to the popovers and dialogs that open from it. */
.dashboard__header > * { flex: none; }
.dashboard__header h1,
.header-back,
.dashboard__header .page-tabs [role='tab'] { white-space: nowrap; }
/* While editing, why Save is held back is a sentence: it wraps on a line of
   its own, as it did (T829's review). */
.dashboard__header > .edit-bar__blocked { flex: 0 1 auto; min-width: 0; white-space: normal; }
/* The title at text-lg 20/26/600 (AC-485; 19-Q4), cut with "…", never
   narrower than 160 px. */
.dashboard__header h1 {
  margin: 0;
  flex: 0 1 auto;
  min-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--wc-text-lg-size);
  line-height: var(--wc-text-lg-line);
  font-weight: var(--wc-text-lg-weight);
}
/* The way back (AC-485; design 19 .back): a 24 px ghost link, 12/16 in the
   primary ink, "← ‹folder›"; a long folder's name cut at 240 px. Then a
   muted rule (design 19 .sl). */
.header-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  max-width: 240px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-primary);
  text-decoration: none;
}
.header-back:hover { background: var(--wc-bg-hover); }
.header-back__folder { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.header-back__rule { color: var(--wc-text-muted); font-size: 12px; }
/* The whole title, first in the open sheet where the row cut it (state G). */
.header-sheet__title {
  margin: 0 0 2px;
  font-size: var(--wc-text-lg-size);
  line-height: var(--wc-text-lg-line);
  font-weight: var(--wc-text-lg-weight);
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.dashboard__header-spacer { flex: 1 1 0; min-width: 0; }
/* The page tabs inline: 13/600, each the row's full height, the 2 px accent
   underline on the row's rule (design 19 .itabs). Not over it by the
   design's 1 px: the strip clips, and the ring a focused tab draws inside
   itself would be cut (R77). */
/* The title gives way first, down to its 160 px, the tabs only after it
   (design 19 G): a far larger shrink factor. Tabs that still don't fit
   scroll within the strip, never the page, until T837 puts them behind
   "More" in view mode (19-Q5). */
.dashboard__header > .page-tabs__row { flex: 0 1 auto; min-width: 0; align-self: stretch; }
.dashboard__header > h1 { flex-shrink: 1000; }
.dashboard__header .page-tabs { padding: 0; border-bottom: 0; align-items: stretch; gap: 2px; }
.dashboard__header .page-tabs [role='tab'] { height: auto; }
.dashboard__header .page-tabs__rest { flex: none; padding: 0 0 0 4px; border-bottom: 0; }
/* While editing, and below 1,024 px, the row may still wrap: edit mode's row
   is T836's, and the narrow row T842's (T829-1). */
.dashboard[data-editing='true'] .dashboard__header { flex-wrap: wrap; height: auto; }
@media (max-width: 1023px) {
  .dashboard__header { flex-wrap: wrap; height: auto; }
}

/* The Filters toggle (AC-486; design 19 pin 6): a 32 px .btn, the funnel,
   the label and a chevron; drawn pressed on bg-subtle while the sheet is open,
   its chevron turned up (screen 2 pin 1). */
.header-toggle { gap: 6px; padding: 0 8px 0 10px; flex: none; }
.header-toggle--open { background: var(--wc-bg-subtle); }
.header-toggle__chevron { color: var(--wc-text-secondary); }
/* The number set, in a pill: 18 px, 12/600, accent on text-on-accent
   (direction §7g; design 18's .count). */
.header-toggle__count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
}
.header-toggle--open .header-toggle__chevron { transform: rotate(180deg); }

/* The header sheet (AC-487; design 19 screen 2): directly under the row, the
   full width of the dashboard. Hidden while closed, whatever else styles it. */
.header-sheet { background: var(--wc-bg-page); }
.header-sheet[hidden] { display: none; }
/* Its motion (AC-488; design 19 pin 8; direction §7g): the height only,
   opening over 200 ms decelerating (Fluent 2 durationNormal,
   curveDecelerateMid) and closing over 150 ms accelerating (durationFast,
   curveAccelerateMid), its contents clipped while it moves and free again at
   rest, where a filter's popover opens over the tiles. None under reduced
   motion. */
.header-sheet {
  transition-property: height;
  transition-duration: 200ms;
  transition-timing-function: cubic-bezier(0, 0, 0, 1);
}
.header-sheet[data-motion] { overflow: hidden; }
.header-sheet[data-motion='closing'] {
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(1, 0, 1, 1);
}
@media (prefers-reduced-motion: reduce) {
  .header-sheet,
  .header-sheet[data-motion] { transition-duration: 0s; }
}
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
