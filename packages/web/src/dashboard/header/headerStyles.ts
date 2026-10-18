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
   scroll within the strip, never the page: in edit mode always, each still a
   drop target (AC-491, AC-056); in view mode until T837 puts them behind
   "More" (19-Q5). */
.dashboard__header > .page-tabs__row { flex: 0 1 auto; min-width: 0; align-self: stretch; }
/* Placed to fit, in view mode (AC-492, T837): the strip keeps its width and
   the title alone gives way. Shrinking by flex's weights, the strip gave up a
   fraction of a pixel while the title still had room, and scrolled by one. */
.dashboard__header > .page-tabs__row[data-fit] { flex-shrink: 0; }
.dashboard__header > h1 { flex-shrink: 1000; }
.dashboard__header .page-tabs { padding: 0; border-bottom: 0; align-items: stretch; gap: 2px; }
.dashboard__header .page-tabs [role='tab'] { height: auto; }
.dashboard__header .page-tabs__rest { flex: none; padding: 0 0 0 4px; border-bottom: 0; }
/* "More ▾" after the inline tabs in view mode (AC-492; design 19 pin 3 and
   state D1): drawn as a tab, 13/600 in the secondary ink, the row's full
   height, its menu under it. Outside the strip, which may clip. */
.page-tabs__more-box { display: flex; flex: none; align-self: stretch; margin-left: 4px; }
.page-tabs__more-box > .menu-button { align-items: stretch; }
.page-tabs__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  color: var(--wc-text-secondary);
  font-size: 13px;
  font-weight: var(--wc-text-sm-strong-weight);
  white-space: nowrap;
  cursor: pointer;
}
.page-tabs__more:hover,
.page-tabs__more[aria-expanded='true'] { color: var(--wc-text-primary); }
.page-tabs__more:focus-visible { outline-offset: -2px; }
/* While editing it is the same one row, "Editing ‹name›", the tabs, "+ Page
   tab" and the edit bar where the actions were (AC-491; design 19 state C,
   "row 48"). Its height is the row's own only so that why Save is held back,
   a sentence, can take a second line rather than run out of it (T836-1).
   Below 1,024 px the row may still wrap: the narrow row is T842's (T829-1). */
.dashboard[data-editing='true'] .dashboard__header { height: auto; }
/* Below 1,024 px (AC-495; design 19 D2-D4): in view mode one 48 px row
   padded 0 16, holding the way back, the title at text-md 16/22, ⋯ and the
   toggle; each but the buttons gives way, the title first. While editing the
   row may still wrap (T829-1). The Bookmarks popover, opened from ⋯, hangs
   under the row's right end, 16 px in. */
@media (max-width: 1023.98px) {
  .dashboard__header { position: relative; padding: 0 16px; }
  .dashboard[data-editing='true'] .dashboard__header { flex-wrap: wrap; }
  .dashboard__header > .header-back { flex: 0 1 auto; min-width: 24px; }
  .dashboard__header h1 {
    min-width: 0;
    font-size: var(--wc-text-md-size);
    line-height: var(--wc-text-md-line);
  }
  .dashboard__header .compact-chips,
  .dashboard__header .mark-chip-note { display: none; }
  .dashboard__header .dashboard__bookmarks--menu { display: contents; }
  .dashboard__header .dashboard__bookmarks--menu > .bookmarks { right: 16px; }
  .header-sheet__about { padding: 8px 16px; }
  /* The sheet's pills one under another, each kept inside the window
     (direction §2: "the filter bar becomes a sheet"). */
  .header-sheet .filter-bar {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: flex-start;
    padding: 10px 16px;
  }
  .header-sheet .filter-bar > * { max-width: 100%; }
  .header-sheet .filter-bar > .filter-bar__spacer { display: none; }
}
/* Bookmarks' own button, hidden where ⋯ opens it (AC-495): a .btn draws
   inline-flex, which would otherwise outweigh the hidden attribute. */
.dashboard__bookmarks-button[hidden] { display: none; }
/* The pages below 1,024 px (AC-495; design 19 D2, D3): a 40 px row under the
   sheet, ruled off like the compact row, its "Page: ‹name› ▾" a 32 px .btn. */
.page-menu-row {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 40px;
  padding: 0 16px;
  background: var(--wc-bg-page);
  border-bottom: 1px solid var(--wc-border-subtle);
}
.page-menu { gap: 6px; max-width: 100%; }
/* From 1,024 to 1,279 px (AC-494; design 19 D1): History and Bookmarks are
   32 px icon buttons, their words in their names and tooltips only, so the
   row keeps to one 48 px line with room for the tabs. */
@media (min-width: 1024px) and (max-width: 1279.98px) {
  .dashboard__header .header-action__label,
  .dashboard__header .dashboard__bookmarks-button > svg:last-child { display: none; }
  .dashboard__header .dashboard__history,
  .dashboard__header .dashboard__bookmarks-button {
    justify-content: center;
    min-width: 32px;
    padding: 0 8px;
  }
}

/* The compact chips (AC-200, AC-119; design 19 pin 4, .mchip and .xchip;
   direction §7g): 24 px pills, radius 999, 12 px, before the actions while
   the sheet is closed. A marking's bordered 1.5 px in its colour (set
   inline), a cross-filter's in the crossfilter colour on its tint; the
   values cut short at 240 px, whole in the chip's tooltip. */
.compact-chips { display: inline-flex; align-items: center; gap: 8px; }
.compact-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 2px 0 8px;
  border-radius: 999px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
}
.compact-chip--mark { border: 1.5px solid var(--wc-border-strong); }
.compact-chip--cross {
  padding-left: 10px;
  border: 1px solid var(--wc-crossfilter);
  background: color-mix(in srgb, var(--wc-crossfilter) 12%, var(--wc-bg-surface));
}
.compact-chip__name { font-weight: 600; }
.compact-chip__values {
  min-width: 0;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.compact-chip--mark .compact-chip__values { color: var(--wc-text-secondary); }
.compact-chip--cross .compact-chip__values { font-weight: 600; }
.compact-chip .menu-button { display: inline-flex; position: relative; }
.compact-chip__button {
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--wc-text-secondary);
  font: inherit;
  cursor: pointer;
}
.compact-chip__button:hover { background: var(--wc-bg-hover); color: var(--wc-text-primary); }
/* "+n": the rest, in the sheet's bar. */
.compact-chips__more { color: var(--wc-text-secondary); font-size: 12px; font-weight: 600; }

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
/* Its number just changed with the sheet closed (AC-493; design 19 .tog.hl;
   decision T8xx-1): the accent-soft ground and a 1 px accent border for 2 s,
   distinct from the 3 px focus ring. Nothing moves, so it holds under
   reduced motion too. */
.header-toggle.header-toggle--changed,
.header-toggle.header-toggle--changed:hover:not(:disabled):not([aria-disabled='true']) {
  background: var(--wc-bg-accent-soft);
  border-color: var(--wc-accent);
}

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
/* The description and the ownership line, 8 + 20 + 4 + 16 + 8 = 56 (design
   19 .about), under the row's own rule: a second rule here drew a doubled
   line and put the open chrome at 206 px, past AC-496's 205 (T843). */
.header-sheet__about {
  display: grid;
  gap: 4px;
  padding: 8px 24px;
}
.header-sheet__about > .dashboard__description,
.header-sheet__about > .dashboard__ownership { margin: 0; }
`;
