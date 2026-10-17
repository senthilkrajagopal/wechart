import { CATEGORICAL, themeCss } from '@wechart/ui';

import { COLUMNS, GUTTER_PX } from '../dashboard/grid/geometry';
import { PLEX_MONO_FACES } from './fonts';

/**
 * The generated token custom properties plus the shell's own rules. Injected
 * once at start-up rather than imported as a .css file, so the tokens have a
 * single source in TypeScript and the audit in @wechart/ui checks the same
 * values the browser paints (AC-004, AC-005).
 */
const SHELL_CSS = `
* { box-sizing: border-box; }

/* A popover's lift, the prototype's --shadow-pop in each theme. Not a colour
   text sits on, so it is kept here rather than among the audited tokens. */
:root { --wc-shadow-pop: 0 8px 24px rgba(20, 20, 18, 0.14), 0 1px 3px rgba(20, 20, 18, 0.1); }
/* direction.md §3's code face, for code and file paths (AC-223): IBM Plex
   Mono, then the platform's monospace — named, as Inter is, not shipped. */
:root { --wc-font-code: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
:root[data-theme='dark'] { --wc-shadow-pop: 0 8px 24px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4); }
/* The theme's own native controls (T476; UX-108, UX-090): checkboxes,
   radios and ranges in the accent, never the browser's blue; and the dark
   theme says so, so native checkboxes, selects and scrollbars draw dark. */
:root { accent-color: var(--wc-accent); color-scheme: light; }
:root[data-theme='dark'] { color-scheme: dark; }

/* Form controls do not inherit type by default, and Safari's default button
   font-size is 11px -- below the 12px floor (AC-004). The rendered audit in
   e2e/a11y-tokens.spec.ts caught this in WebKit only. */
button,
input,
select,
textarea,
option {
  font: inherit;
}

/* WebKit does not honour "font: inherit" on a native select: the control and
   its options fall back to the UA's 11px where Firefox reports the inherited
   14px. An explicit size does move the options -- measured in
   docs/research/webkit-select-font-size.md -- so the open list meets AC-004's
   12px floor. The closed control stays at 11px in WebKit whatever is
   declared, which is the exception recorded in direction.md section 3. */
select,
option {
  font-size: var(--wc-text-sm-size);
}

body {
  margin: 0;
  background: var(--wc-bg-page);
  color: var(--wc-text-primary);
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
}

/* The two chrome measurements the dashboard has to subtract from the viewport
   to size itself (see .dashboard). Declared once, as custom properties, for
   the same reason styles.ts imports COLUMNS and GUTTER_PX from geometry.ts:
   a second copy of a number is a number that can drift, and here the drift
   would be a silent second scrollbar rather than anything that fails loudly. */
:root {
  --wc-app-bar-height: 48px;
  /* One page frame (T466, UX-109): 24 px gutters on every page, as the
     approved prototype's .admin-main and the dashboard's own. */
  --wc-surface-padding: 24px;
}

/* Buttons, inputs and selects, as the prototype draws them (AC-187: its .btn,
   .btn.primary, .input and .select). Every button takes the look — border,
   radius, surface, ink; a plain button, one no component has styled, also
   takes the prototype's size. Size is kept to plain buttons because a styled
   one lays itself out — the Add palette's two-line entries, the filter bar's
   28 px choices — and a size imposed on all of them broke those. */
button {
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  cursor: pointer;
}
button:not([class]) {
  min-height: 32px;
  padding: 0 12px;
}
/* One button rule (T684, CMP-01): the designs' .btn, 32 tall, padding 0 12,
   at 14/400 (2026-09-27 06:66). Declared before .btn-primary and .btn-sm,
   which keep their weight and their 24 px by coming later. */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  height: 32px;
  padding: 0 12px;
  font-size: var(--wc-text-sm-size);
  font-weight: 400;
  white-space: nowrap;
}
/* Every link, in the accent token (AC-005). With no rule, a link nothing had
   styled drew in the browser's #0000ee — 1.63:1 on a dark surface — and its
   visited purple likewise; the palette's results and Security's dashboard
   list were both such links.
   Wrapped in :where() so it has no specificity: a bare "a:visited" outranks a
   one-class rule, and turned a visited Primary link tile's text into accent on
   its accent fill (T210's review). Any component's own link colour wins. */
:where(a),
:where(a:visited) { color: var(--wc-accent); }
button:hover:not(:disabled):not([aria-disabled='true']) { background: var(--wc-bg-hover); }
button:disabled,
button[aria-disabled='true'] { opacity: 0.5; cursor: not-allowed; }
/* The primary action: a form's submit, or a button marked so. */
button[type='submit'],
.btn-primary {
  background: var(--wc-accent);
  border-color: var(--wc-accent);
  color: var(--wc-text-on-accent);
  font-weight: var(--wc-text-sm-strong-weight);
}
button[type='submit']:hover:not(:disabled):not([aria-disabled='true']),
.btn-primary:hover:not(:disabled):not([aria-disabled='true']) {
  background: var(--wc-accent);
  filter: brightness(1.08);
}
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
}
.btn-ghost { border-color: transparent; background: none; }
.btn-sm { min-height: 24px; height: 24px; padding: 0 8px; font-size: var(--wc-text-xs-size); }
/* One pressed state (T684, CMP-03): the designs' .btn.pressed, accent-soft
   with the accent's border and ink, at 600 (06:68, 07:69). History with its
   panel open, Access with its own. Kept on hover. */
.btn.pressed,
.btn.pressed:hover:not(:disabled):not([aria-disabled='true']) {
  border-color: var(--wc-accent);
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: 600;
}

input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']),
select,
textarea {
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
}
select { padding-right: 4px; }
textarea { height: auto; padding: 6px 8px; }

/* A control that is only an icon (the prototype's .iconbtn), named for
   assistive technology by aria-label. */
.icon-button {
  width: 32px;
  height: 32px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
}
.icon-button:hover:not(:disabled) { background: var(--wc-bg-hover); color: var(--wc-text-primary); }

.app-bar {
  /* Sticky so the workspace switcher, search and theme control stay reachable
     however far a surface has scrolled. A bar that scrolls away also means any
     click on it drags the page back to the top. */
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 16px;
  height: var(--wc-app-bar-height);
  padding: 0 12px;
  background: var(--wc-bg-surface);
  border-bottom: 1px solid var(--wc-border-subtle);
}

/* The prototype's .brand and .brand-mark. */
.app-bar__product {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: var(--wc-text-sm-strong-weight);
  letter-spacing: -0.01em;
}
.app-bar__mark {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
}

/* The prototype's .wsnav: full-height tabs, the current one underlined. */
.workspace-switcher { align-self: stretch; }
.workspace-switcher ul {
  display: flex;
  gap: 2px;
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}
.workspace-switcher a {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 12px;
  color: var(--wc-text-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}
.workspace-switcher a:hover { color: var(--wc-text-primary); }
.workspace-switcher a[aria-current='page'] {
  color: var(--wc-text-primary);
  border-bottom-color: var(--wc-accent);
  font-weight: var(--wc-text-sm-strong-weight);
}

/* The spacer pushes search, theme and avatar to the right, as the prototype's
   .spacer does; the toggle no longer has to. */
.app-bar__spacer { flex: 1; }

/* The narrow menu (T396, AC-304): below 1,024 px the bar's switcher and
   search field fold into it, so the bar fits a phone's width rather than the
   page scrolling sideways. Its panel drops from under the bar, full width,
   the workspaces stacked, the current one marked at its left edge. */
.app-bar__menu { display: none; }
.app-bar__menu-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 12px 12px;
  background: var(--wc-bg-surface);
  border-bottom: 1px solid var(--wc-border-subtle);
  box-shadow: var(--wc-shadow-pop);
}
.app-bar__menu-panel[hidden] { display: none; }
.app-bar__menu-panel .workspace-switcher ul { flex-direction: column; gap: 0; }
.app-bar__menu-panel .workspace-switcher a {
  height: 40px;
  padding: 0 10px;
  border-bottom: 0;
  border-left: 2px solid transparent;
}
.app-bar__menu-panel .workspace-switcher a[aria-current='page'] {
  border-left-color: var(--wc-accent);
}
.app-bar__menu-panel .app-search { width: 100%; }
@media (max-width: 1023.98px) {
  .app-bar { gap: 8px; }
  .app-bar > .workspace-switcher,
  .app-bar > .app-search { display: none; }
  .app-bar__menu { display: block; }
}

/* The top bar's Reviews control (T355; design 05, state C): an icon, its
   word and the count waiting, after search. Below 1,024 px, the icon and the
   count alone. */
.app-reviews {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.app-reviews:hover { color: var(--wc-text-primary); background: var(--wc-bg-hover); }
.app-reviews[aria-current='page'] { color: var(--wc-accent); }
.app-reviews__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 1023.98px) {
  .app-reviews__label { display: none; }
}
/* The top bar's search field (AC-190), the prototype's .search. */
.app-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 260px;
  /* Narrower, its words ellipsed, where the bar runs out of room: at 900 px
     with security off's Single-user mode chip in words beside the avatar
     (rule 59, AC-190), rather than the page scrolling sideways (T319). */
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-muted);
  font-size: 13px;
  text-align: left;
  cursor: text;
}
.app-search span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* .search kbd { font: 600 12px var(--font-ui) }: the shorthand's normal line
   height, and the field's muted ink (N6). */
.app-search kbd {
  font-family: inherit;
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
  line-height: normal;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  padding: 0 4px;
  color: inherit;
}

/* Who is signed in (AC-190), the prototype's .avatar. */
.app-avatar {
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  /* .avatar { background: var(--role-dim-soft); color: var(--role-dim) } (N7) */
  background: var(--wc-bg-role-dimension-soft);
  color: var(--wc-role-dimension);
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
}

/* The account button and its menu (T319, rule 59; references.md › Phase 2 ›
   Surface 1): the avatar and the name, 12/16 600, truncated at 160 px and
   hidden below 1,280 px; security off, the Single-user mode chip. */
.account { position: relative; display: inline-flex; align-items: center; gap: 8px; }
.account-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 6px 0 2px;
  border-color: transparent;
  background: transparent;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
}
.account-button__name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 1279.98px) {
  .account-button__name { display: none; }
}
.account-button--single {
  gap: 6px;
  padding: 0 8px;
  border-color: var(--wc-border-strong);
  border-radius: 999px;
  color: var(--wc-status-warning);
}
.account-panel {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 20;
  margin-top: 4px;
  width: 260px;
  padding: 4px;
  background: var(--wc-bg-raised);
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  box-shadow: var(--wc-shadow-pop);
}
.account-panel__who {
  display: grid;
  justify-items: start;
  gap: 2px;
  padding: 6px 6px 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.account-panel__name {
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
  font-weight: var(--wc-text-sm-strong-weight);
  overflow-wrap: anywhere;
}
.account-panel__identity {
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  overflow-wrap: anywhere;
}
.account-panel__badge { gap: 4px; margin-top: 4px; }

/* A sign-in state (T321, rule 60): the product mark, one sentence, one
   action, on the page's own ground, with nothing of wechart behind it. */
.auth-state {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: var(--wc-bg-page);
}
.auth-state__card {
  display: grid;
  justify-items: start;
  gap: 12px;
  max-width: 400px;
  padding: 24px;
  background: var(--wc-bg-surface);
  border: 1px solid var(--wc-border-subtle);
  border-radius: 8px;
}
.auth-state__title {
  margin: 0;
  font-size: var(--wc-text-lg-size);
  line-height: var(--wc-text-lg-line);
  font-weight: var(--wc-text-lg-weight);
}
.auth-state__card p { margin: 0; color: var(--wc-text-secondary); }

main { padding: var(--wc-surface-padding); }
/* A page with a pane docked the window's height (Jobs, Security): its foot
   as far from the window's as the pane's is, so the page is exactly the
   window's height and never scrolls it by the difference (T466's review). */
main:has(.admin-pane) { padding-bottom: 16px; }

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}

/* Explore as the prototype's browse() (T244): the Folders pane docked at the
   window's edge, 260 px, the contents beside it; the page itself never
   scrolls, only the list does, under its sticky header (recheck-shell-explore
   F8, F23). */
main:has(.explore) {
  height: calc(100vh - var(--wc-app-bar-height));
  display: flex;
  flex-direction: column;
  padding: 0;
}
.explore {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  /* Its row as tall as the window allows: left implicit, Firefox sized it to
     the list, and the page scrolled again. */
  grid-template-rows: minmax(0, 1fr);
}

/* Explore's header (AC-192), the prototype's .crumbs and browse() head row. */
.crumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
.crumbs__step { display: inline-flex; align-items: center; gap: 4px; }
/* A dashboard's or a chart's way back to its folder (AC-195): its own row
   above the title, as the prototype's .dash-head nav. */
.item-crumbs { flex-basis: 100%; gap: 2px; color: var(--wc-text-muted); }
.item-crumbs a { color: inherit; padding: 2px 4px; border-radius: 4px; text-decoration: none; }
.item-crumbs a:hover { background: var(--wc-bg-hover); color: var(--wc-text-primary); }
/* "← Explore" is the prototype's .btn.ghost.sm: 24 px, padded 0 8, radius 6,
   in the primary ink; the folders after it are its .muted span (T246,
   mismatches 1–2). The row is the button's 24 px, so the header is 80. */
.item-crumbs a.item-crumbs__back {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--wc-text-primary);
}
/* 24 px at 12/20 (N5): without a height of its own a crumb took the plain
   button's 32 px minimum. */
.crumbs button {
  min-height: 0;
  height: 24px;
  border: 0;
  background: none;
  color: inherit;
  padding: 2px 4px;
  border-radius: 4px;
  font: inherit;
  line-height: 20px;
}
.crumbs button:hover:not(:disabled) { background: var(--wc-bg-hover); color: var(--wc-text-primary); }
/* A search's sentence keeps the crumbs' row, so the head row does not jump
   when a search begins (F25). */
.explore__contents > .crumbs { min-height: 24px; }
.explore__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.explore__title,
.explore__rename {
  margin: 0;
  font-size: var(--wc-text-lg-size);
  line-height: 26px;
  font-weight: var(--wc-text-lg-weight);
}
.explore__spacer { flex: 1; }
/* The prototype's 36 px rename and its .input.sm search, 260 px (N3, N4) —
   specific enough to outrank the inputs' 32 px, which they lost to. */
.explore__head input.explore__rename:not([type='checkbox']):not([type='radio']):not([type='file']) {
  height: 36px;
  max-width: 320px;
}
/* A folder's description under its name (T524, AC-369; design 14, state H):
   text-sm in text-secondary, two lines then More; Edit beside it. */
.folder-description {
  display: flex;
  gap: 8px;
  align-items: baseline;
  max-width: 860px;
  margin-top: -4px;
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
  color: var(--wc-text-secondary);
}
/* Its own line breaks kept: plain Enter is a new line (design 14, keyboard). */
.folder-description__text { white-space: pre-line; overflow-wrap: anywhere; }
.folder-description__text.is-clamped {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.folder-description .btn-link,
.folder-description__add {
  flex: none;
  padding: 0;
  border: 0;
  background: none;
  color: var(--wc-accent);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  cursor: pointer;
}
.folder-description .btn-link:hover,
.folder-description__add:hover { text-decoration: underline; }
/* Design 14 H1 and E2: the main's 8 px under the name, no closer. */
.folder-description__add { align-self: flex-start; }
/* Its editor 8 px under the name, the main's gap with no pull (design 14 H2;
   T741's review). */
.folder-description.folder-description--editing { display: grid; gap: 6px; max-width: 720px; margin-top: 0; }
.folder-description__top {
  display: flex;
  align-items: center;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
}
.folder-description__counter { margin-left: auto; font-weight: 400; font-variant-numeric: tabular-nums; }
.folder-description__counter.is-over { color: var(--wc-status-error); font-weight: 600; }
.folder-description textarea { width: 100%; min-height: 68px; resize: vertical; font: inherit; color: var(--wc-text-primary); }
.folder-description textarea[aria-invalid='true'] { border-color: var(--wc-status-error); }
.folder-description__over {
  display: flex;
  gap: 4px;
  align-items: center;
  margin: 0;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-status-error);
}
.folder-description__bar { display: flex; align-items: center; gap: 8px; }
.folder-description__keys { font-size: var(--wc-text-xs-size); color: var(--wc-text-muted); }
.explore__head input.explore__search:not([type='checkbox']):not([type='radio']):not([type='file']) {
  width: 260px;
  max-width: 100%;
  height: 28px;
  font-size: var(--wc-text-xs-size);
}

/* The prototype's type chips: a dashboard's, a chart's and a folder's. */
.itemicon {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: inline-grid;
  place-items: center;
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
  flex: none;
}
.itemicon.ic-dash { background: var(--wc-bg-crossfilter-soft); color: var(--wc-crossfilter); }
.itemicon.ic-chart { background: var(--wc-bg-accent-soft); color: var(--wc-accent); }
.itemicon.ic-folder { background: var(--wc-bg-subtle); color: var(--wc-text-secondary); }
.itemicon.ic-model { background: var(--wc-bg-subtle); color: var(--wc-text-primary); }
.itemicon.ic-source { background: var(--wc-bg-subtle); color: var(--wc-text-primary); }
/* My workspace's chip: a person on the dimension role's tint (design 04, pin 1). */
.itemicon.ic-person { background: var(--wc-bg-role-dimension-soft); color: var(--wc-role-dimension); }
.itemicon.ic-person > svg { width: 14px; height: 14px; }

/* The workspace band (design 04, pin 2; rule 72): 32 px on bg-subtle, a
   person and "My workspace · only you can see this", edge to edge. */
.workspace-band {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0 24px;
  background: var(--wc-bg-subtle);
  border-bottom: 1px solid var(--wc-border-subtle);
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  color: var(--wc-text-secondary);
}
.workspace-band > svg { flex: none; }
/* Across Explore's contents column, from its edges. */
/* Its crumbs 14 px below, as design 04 draws them under the band: the
   contents' 8 px gap and 6 more (T741). */
.explore__contents > .workspace-band { margin: -14px -24px 6px; }
/* Across an item's own page. */
.source-settings > .workspace-band {
  margin: calc(-1 * var(--wc-surface-padding)) calc(-1 * var(--wc-surface-padding)) 0;
}

/* The author's proposal band (T358; design 05, state M): 12 px across the
   item's page — waiting on bg-subtle; rejected in error ink on its tint,
   the reason quoted. Under the workspace band, or first on the page. */
.proposal-band {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
  padding: 10px var(--wc-surface-padding);
  background: var(--wc-bg-subtle);
  border-bottom: 1px solid var(--wc-border-subtle);
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  color: var(--wc-text-primary);
}
.proposal-band > svg { flex: none; margin-top: 1px; }
.proposal-band > p { flex: 1; min-width: 0; margin: 0; }
.proposal-band--rejected {
  color: var(--wc-status-error);
  background: color-mix(in srgb, var(--wc-status-error) 7%, var(--wc-bg-surface));
}
.proposal-band__body { flex: 1; min-width: 0; display: grid; gap: 6px; }
.proposal-band__decision { margin: 0; font-weight: 600; }
.proposal-band__reason {
  margin: 0;
  padding: 2px 0 2px 10px;
  border-left: 3px solid var(--wc-border-strong);
  color: var(--wc-text-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.proposal-band__error { margin: 0; }
.proposal-band__actions { display: flex; gap: 8px; }
.source-settings > .proposal-band { margin: 0 calc(-1 * var(--wc-surface-padding)); }
.source-settings > .workspace-band + .proposal-band { margin-top: -10px; }
main > .proposal-band:first-child,
.chart-page > .proposal-band:first-child {
  margin: calc(-1 * var(--wc-surface-padding)) calc(-1 * var(--wc-surface-padding)) 0;
}

/* The Propose dialog (T358; design 05, states A and B): 520 px; the item and
   what it does there, what goes with it, and the description's counter,
   error ink past 1,000. */
.dialog.propose-dialog { width: min(520px, calc(100vw - 32px)); max-width: none; gap: 12px; }
.dialog p.propose-dialog__item { margin: 0; color: var(--wc-text-primary); }
.dialog p.propose-dialog__warning,
.propose-dialog__goes {
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-primary);
}
.dialog p.propose-dialog__warning {
  background: color-mix(in srgb, var(--wc-status-warning-icon) 14%, var(--wc-bg-surface));
}
.propose-dialog__goes { background: var(--wc-bg-accent-soft); }
.propose-dialog__goes h3 { margin: 0 0 4px; font-size: 12px; line-height: 16px; font-weight: 600; }
.dialog .propose-dialog__goes p { margin: 0 0 4px; color: var(--wc-text-primary); }
.propose-dialog__goes ul { margin: 0; padding-left: 16px; }
.propose-dialog__label-row { display: flex; align-items: baseline; gap: 8px; }
.propose-dialog__label-row > label {
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.propose-dialog__optional { font-weight: 400; }
.propose-dialog__counter {
  margin-left: auto;
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--wc-text-secondary);
}
.propose-dialog__counter.is-over { color: var(--wc-status-error); font-weight: 600; }
.propose-dialog__description textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 96px;
  resize: vertical;
  font: inherit;
}
.propose-dialog__description textarea[aria-invalid='true'] { border-color: var(--wc-status-error); }
.dialog p.propose-dialog__over { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-status-error); }
.dialog p.propose-dialog__note { margin: 0; font-size: 12px; line-height: 16px; }
.dialog p.propose-dialog__checking { margin: 0; }
.dialog p.propose-dialog__refused { margin: 0; color: var(--wc-status-error); }

/* The edit sidebar's Outline (AC-053): the prototype's .dir and .file rows. */
.outline, .outline ul { margin: 0; padding: 0; list-style: none; }
.outline { padding: 8px 0; }
.outline__page {
  display: block;
  padding: 6px 12px 2px;
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
}
.outline__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  border: 0;
  border-radius: 0;
  background: none;
  font-size: var(--wc-text-xs-size);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.outline__row[aria-current='true'] {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: var(--wc-text-xs-strong-weight);
}
/* The prototype's .ficon.dim at 18 px, and its .file row's 0 12 padding —
   the left set by depth inline (T248, mismatch 26). */
.outline__row { padding-block: 0; padding-right: 12px; }
/* Its glyphs at 12 px, the .ficon default and AC-004's floor: the prototype
   set these at an inline 10 px, which no token allows (T248's review). */
.outline__icon {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: none;
  border-radius: 4px;
  background: var(--wc-bg-role-dimension-soft);
  color: var(--wc-role-dimension);
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
}
.outline__tab, .outline__empty {
  display: block;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-muted);
}
.outline__empty { padding-left: 26px; }

/* A menu button's menu, the prototype's .picker. */
.menu-button { position: relative; display: inline-flex; }
.menu-button__menu {
  position: absolute;
  top: 100%;
  z-index: 20;
  margin-top: 4px;
  min-width: 220px;
  max-height: 280px;
  overflow: auto;
  padding: 4px;
  background: var(--wc-bg-raised);
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  box-shadow: var(--wc-shadow-pop);
}
.menu-button__menu--end { right: 0; }
.menu-button__menu--start { left: 0; }
.menu-button__sep { height: 1px; margin: 4px 0; background: var(--wc-border-subtle); }
/* A menu's head, design 13's .mhead (state G; T692). */
.menu-button__head { padding: 6px 8px 2px; font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); font-weight: 600; color: var(--wc-text-secondary); }
.menu-button__item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  font-size: var(--wc-text-xs-size);
  text-align: left;
}
.menu-button__item:hover:not(:disabled),
.menu-button__item:focus-visible { background: var(--wc-bg-hover); }
.menu-button__item.is-danger { color: var(--wc-status-error); }

/* The Model workspace's files (T137, AC-131), as design 12's overview (T486). */
/* Spacing only: the overview's size is .workspace-title's, the page title
   every workspace shares (AC-231); a file's path heads its editor at 13/600
   (T479). */
.model-workspace h1 { margin: 0 0 16px; }
/* The overview as design 12 (T486, MW-01): "Model" and its one primary + New ▾
   in the title row; the InfoBar and one card holding a grid table, sharing
   the pane's width inside its gutters; a row per cube or view — a 28 px
   header in 12/600 on bg-subtle, 34 px rows at 12 px in tabular figures —
   the whole row opening its file. */
.model-overview__title-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.model-overview__title-row > .workspace-title { flex: 1; margin: 0; }
.model-page__overview > .info-bar { max-width: none; }
/* Not clipped: a bottom row's Members tooltip hangs below the card (T486's
   review); the header's corners rounded on its corner cells instead. */
.model-overview {
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.model-overview__table { table-layout: auto; }
.model-overview__table thead th { position: static; }
.model-overview__table thead th:first-child { border-top-left-radius: 5px; }
.model-overview__table thead th:last-child { border-top-right-radius: 5px; }
.model-overview__caption { margin: 8px 0 0; font-size: 12px; color: var(--wc-text-muted); }
.model-overview__table tbody td { height: 34px; }
.model-overview__table tbody tr:last-child td { border-bottom: 0; }
.model-overview__row { cursor: pointer; }
.model-overview__table .is-num { text-align: right; }
.model-overview__table .is-zero,
.model-overview__table .is-muted { color: var(--wc-text-muted); }
.model-overview__table .is-secondary { color: var(--wc-text-secondary); }
/* The unreadable file's line truncates in its cell; the mark on its path doesn't (T486's review). */
.model-overview__table td.is-err { color: var(--wc-status-error); max-width: 0; overflow: hidden; text-overflow: ellipsis; }
.model-overview__table .is-code { font-family: var(--wc-font-code); }
.model-overview__file { display: flex; align-items: center; gap: 8px; }
.model-overview__file > a { color: var(--wc-accent); text-decoration: none; }
.model-overview__file > a:hover { text-decoration: underline; }
.model-overview__mark { display: inline-flex; flex: none; align-items: center; gap: 4px; font-size: 12px; }
.model-overview__mark.is-err { color: var(--wc-status-error); }
/* The only sortable column, its arrow drawn from aria-sort (pin 8). */
.model-overview__sort {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
/* The arrow left out of the button's name: aria-sort says it (T486's review). */
.model-overview__table th[aria-sort='ascending'] .model-overview__sort::after {
  content: ' ↑';
  content: ' ↑' / '';
}
.model-overview__table th[aria-sort='descending'] .model-overview__sort::after {
  content: ' ↓';
  content: ' ↓' / '';
}
.model-overview__code { display: inline-flex; align-items: center; gap: 6px; color: var(--wc-text-secondary); }
/* Members truncated to the cell; all of them, by kind, on hover or focus (pin 12). */
.model-overview__members-td { width: 100%; max-width: 0; }
.model-overview__members-cell { position: relative; display: block; }
.model-overview__members {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--wc-font-code);
  color: var(--wc-text-secondary);
}
.model-overview__tip {
  position: absolute;
  z-index: 20;
  right: 0;
  /* Touching its cell, so the pointer can move onto it without it closing. */
  top: 100%;
  display: none;
  gap: 4px;
  width: max-content;
  max-width: 360px;
  padding: 8px 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-raised, var(--wc-bg-surface));
  box-shadow: var(--wc-shadow-pop, 0 4px 12px rgba(0, 0, 0, 0.15));
  white-space: normal;
}
.model-overview__members-cell:hover > .model-overview__tip,
.model-overview__members:focus-visible + .model-overview__tip { display: grid; }
.model-overview__tip-kind { color: var(--wc-text-secondary); }
.model-overview__none { color: var(--wc-text-muted); }
/* State B: no files, what to do about it; the three ways to add as secondary buttons. */
.model-overview--empty { display: grid; gap: 4px; padding: 24px; justify-items: start; }
.model-overview__empty-title { margin: 0; font-weight: 600; }
.model-overview__empty-text { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
.model-overview__empty-actions { display: flex; gap: 8px; margin-top: 4px; }
/* State F: reading, the table's frame beneath — its 28 px header band and 34 px
   rows of bars; can't read, its words and Retry on the error's ground. */
.model-overview--reading { margin-top: 12px; }
.model-overview__skeleton-head { height: 28px; border-bottom: 1px solid var(--wc-border-subtle); border-radius: 5px 5px 0 0; background: var(--wc-bg-subtle); }
.model-overview__skeleton-row { display: flex; align-items: center; gap: 16px; height: 34px; padding: 0 8px; border-bottom: 1px solid var(--wc-border-subtle); }
.model-overview__skeleton-row:last-child { border-bottom: 0; }
.model-overview__skeleton-row > .skeleton-bar { height: 10px; }
.model-overview__failed {
  max-width: none;
  align-items: center;
  background: color-mix(in srgb, var(--wc-status-error) 10%, var(--wc-bg-surface));
}
.model-overview__failed > svg { color: var(--wc-status-error); }
.model-overview__failed > p { flex: 1; }
/* The join diagram's note (JoinEditor), kept when the overview's cards went. */
.model-files__note { margin: 0; color: var(--wc-text-secondary); }
/* A file that is code or a template (T146), in the editor's frame (T483, MW-16):
   the InfoBar across the pane, then the code flush beneath it, filling the
   pane as the editor's YAML does — ruled gutter, 40 px numbers, 12/16. */
.model-readonly__note { padding: 12px 16px; }
.model-readonly__note > .info-bar { max-width: none; }
.model-readonly__code {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--wc-border-subtle);
}
.model-readonly__code .yaml-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.model-readonly__code .yaml-editor .cm-editor { flex: 1; min-height: 0; max-height: none; border: 0; border-radius: 0; }
.model-readonly__code .yaml-editor .cm-editor.cm-focused { outline-offset: -2px; }
.model-readonly__code .yaml-editor .cm-scroller { line-height: 16px; }
.model-readonly__code .yaml-editor .cm-lineNumbers .cm-gutterElement {
  min-width: 40px;
  padding: 0 10px 0 16px;
  box-sizing: border-box;
}

/* A model file's forms (T138, AC-132; direction.md §7b): the tabs as the edit
   sidebar's, fields as the prototype's .field — two short ones to a row, SQL
   and YAML the full width — and members as rows that open in place. */
/* direction.md §7b: the form as the main working area, the YAML on the right,
   in design 03's columns — 676 : 524 beside the 240 px tree at 1,440 (T470). */
.model-editor {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 676fr) minmax(320px, 524fr);
}
/* The Model workspace as one page (T234, AC-222, AC-223): the prototype's
   three panes — the file tree, the form, the code with Problems docked —
   each full height under its own header row, each scrolling on its own; the
   page itself never scrolls. */
main:has(.model-page) {
  height: calc(100vh - var(--wc-app-bar-height));
  display: flex;
  flex-direction: column;
  padding: 0;
}
.model-page { flex: 1; min-height: 0; display: grid; grid-template-columns: 240px minmax(0, 1fr); }
/* Narrower than 1,024 px the Model workspace's panes stack, each as wide as
   the page, which grows and scrolls down instead of sideways (T396,
   AC-304): the tree above the file, the form above its YAML. Every pane
   keeps what it holds. The chart editor does the same, after its own rule. */
@media (max-width: 1023.98px) {
  main:has(.model-page) { height: auto; }
  .model-page,
  .model-editor { grid-template-columns: minmax(0, 1fr); }
  .model-tree { max-height: 40vh; border-right: 0; border-bottom: 1px solid var(--wc-border-subtle); }
  /* The path on a line of its own, cut short there, and the state and the
     actions together on the next, rather than past the window: a shared
     file's "Edit in my workspace" and its menu don't fit beside the path at
     390 px (AC-304). Wrapped as one line, Discard and Save stay side by side
     (design 03 note 2), never split across the break (T680's review). */
  .model-editor__head { flex-wrap: wrap; }
  /* Over the path's own flex, which comes later. */
  .model-workspace .model-editor__head .model-editor__path { flex-basis: 100%; }
}
/* From 1,024 to 1,279 px, one pane at a time behind "Form | YAML" in the
   editor's head (T487, MW-26; direction §2), across both panes' width, the
   sync note giving way. The head stays in both — path, state, the switch,
   Discard and Save — and, YAML chosen, the code takes the form's place
   beneath it (T487's review). Generate docked takes the code's place: the
   form alone, and no switch. Wider, both panes, and no switch. */
/* Over .seg's own display, which comes later. */
.seg.model-editor__switch { display: none; }
@media (min-width: 1024px) and (max-width: 1279.98px) {
  .seg.model-editor__switch { display: inline-flex; flex: none; }
  .model-editor { grid-template-columns: minmax(0, 1fr); }
  .model-editor[data-shown='form'] > .model-editor__yaml { display: none; }
  .model-page:not(.model-page--generating) .model-editor[data-shown='yaml'] {
    grid-template-rows: auto minmax(0, 1fr);
  }
  .model-page:not(.model-page--generating)
    .model-editor[data-shown='yaml']
    > .model-editor__pane:not(.model-editor__yaml)
    > .model-editor__form { display: none; }
  .model-page--generating .seg.model-editor__switch { display: none; }
  .model-editor__sync { display: none; }
}
/* From 1,280 px both panes show, the form narrower than design 03's 676: its
   tabs drawn tighter until then, so all eight stay in view (T487's review). */
@media (min-width: 1280px) and (max-width: 1439.98px) {
  .model-workspace .model-form > .model-form__tabs button { padding: 0 4px; }
}
/* A segment's label never wraps (MW-26). */
.model-editor .seg button { white-space: nowrap; }
.model-page__main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.model-page__main > .state-line { margin: var(--wc-surface-padding); }
.model-page__overview { flex: 1; min-height: 0; overflow: auto; padding: var(--wc-surface-padding); }
.model-page__overview > .info-bar { margin-bottom: 12px; }
.model-tree { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--wc-border-subtle); background: var(--wc-bg-surface); }
/* Design 03 note 1 (T479): a 44 px head, "Model" and the model's state; folder
   rows under model/ that fold; files in 28 px rows, the open one a full-width
   accent-soft row; New cube, New view and Generate cubes after the files. */
.model-tree__head { flex: none; display: flex; gap: 8px; align-items: center; min-height: 44px; padding: 8px 12px; border-bottom: 1px solid var(--wc-border-subtle); }
.model-tree__head h2 { margin: 0; font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); font-weight: var(--wc-text-sm-strong-weight); }
.model-tree__state { display: inline-flex; gap: 4px; align-items: center; margin-left: auto; color: var(--wc-text-secondary); font-size: 12px; line-height: 16px; white-space: nowrap; }
.model-tree__body { flex: 1; min-height: 0; overflow: auto; padding: 4px 0; }
.model-tree__folder + .model-tree__folder { margin-top: 4px; }
.model-tree__folder ul { margin: 0; padding: 0; list-style: none; }
.model-workspace button.model-tree__dir {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--wc-text-secondary);
  font: 600 12px/16px var(--wc-font-code);
  text-align: left;
  cursor: pointer;
}
.model-workspace button.model-tree__dir:hover { background: var(--wc-bg-hover); }
.model-tree__caret { flex: none; width: 10px; }
.model-tree__file {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 28px;
  padding: 2px 12px 2px 28px;
  color: var(--wc-text-primary);
  font: 12px/16px var(--wc-font-code);
  text-decoration: none;
}
.model-tree__file:hover { background: var(--wc-bg-hover); }
.model-tree__file[aria-current='page'] { background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: 600; }
/* Focus drawn inside the row, as its state, not a ring round it (MW-04). */
.model-tree :is(.model-tree__file, .model-tree__dir):focus-visible { outline-offset: -2px; border-radius: 0; }
/* A file the form can't open: its kind, as design 03's tag, at 12 px (D5). */
.model-tree__kind {
  flex: none;
  display: inline-flex;
  gap: 3px;
  align-items: center;
  margin-left: auto;
  padding: 0 5px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 3px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-secondary);
  font: 600 12px/16px Inter, system-ui, sans-serif;
}
/* An empty model, or one still read (design 12 states B and F): a line where the files go. */
.model-tree__empty { margin: 0; padding: 10px 12px; color: var(--wc-text-muted); font-size: 12px; line-height: 16px; }
.model-tree__actions { display: grid; gap: 6px; margin-top: 8px; padding: 12px; border-top: 1px solid var(--wc-border-subtle); }
/* A flex box drops the space after "+": the gap keeps it (T479). */
.model-tree__actions .btn-sm { display: flex; gap: 4px; align-items: center; justify-content: flex-start; text-align: left; }
/* A name is never broken inside a word (design 12's ".fn"): marks that don't
   fit beside it go under it, and a name longer than the row is cut short. */
.model-tree__file { flex-wrap: wrap; }
.model-tree__name { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-tree__tag,
.model-tree__mark {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  font: 12px/16px Inter, system-ui, sans-serif;
  font-weight: 400;
}
.model-tree__tag { color: var(--wc-text-secondary); }
.model-tree__mark { margin-left: auto; color: var(--wc-status-error); }
.model-editor__pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.model-editor__pane + .model-editor__pane { border-left: 1px solid var(--wc-border-subtle); }
/* Flat on the pane, no card inset (design 03 note 9, UX-077): the tabs run its
   full width, and a bar above the form is a band across it. */
.model-editor__form { flex: 1; min-height: 0; overflow: auto; }
/* A file of one cube or view, as nearly every file is: its tabs and any bar
   above them stay put and only its panel scrolls, as the prototype's
   pane-body does — so a scrollbar never takes width from the tabs (T470's
   review). A file of several scrolls whole, each form under its own tabs. */
.model-editor__form:has(> .model-form:only-of-type) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.model-editor__form:has(> .model-form:only-of-type) > * { flex: none; }
.model-editor__form > .model-form:only-of-type {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.model-editor__form > .model-form:only-of-type > .model-form__panel { flex: 1; min-height: 0; overflow: auto; }
.model-editor__code { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8px; overflow: hidden; }
.model-editor__yaml-view:not([hidden]) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* A page with no editor — code, a file there is none of, one being read —
   headed as the editor is, its body scrolling beneath. */
.model-page__solo { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.model-page__body { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
/* Code in the Model workspace, in the code face (AC-223). */
.model-workspace code { font-family: var(--wc-font-code); }
.model-editor__sync { margin-left: auto; color: var(--wc-text-muted); font-size: 12px; }
/* The prototype's .seg: a two-way toggle, the pressed side in the accent. */
.seg {
  display: inline-flex;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  overflow: hidden;
}
.seg button {
  min-height: 0;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-left: 1px solid var(--wc-border-subtle);
  border-radius: 0;
  background: var(--wc-bg-surface);
  font-size: 12px;
}
.seg button:first-child { border-left: 0; }
/* The pressed segment in the one pressed tint (T684, EDI-14; 2026-09-30 14:80). */
.seg button[aria-pressed='true'] {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: 600;
}
.model-editor__view { margin: 0; }
/* Scrolled within the pane, with room for its controls' focus rings (AC-176). */
.model-editor__code > .join-editor { overflow: auto; padding: 6px; }
/* The join diagram (T144, AC-138): the prototype's boxes and arrows, in SVG
   from the tokens. */
.join-editor { display: grid; gap: 12px; }
.join-editor__canvas {
  overflow: auto;
  max-height: calc(100vh - 480px);
  min-height: 160px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-page);
}
/* At its own size, the pane scrolling to it: shrunk, its text would fall
   below the 12 px floor (AC-004). */
.join-editor__diagram { display: block; margin: 0 auto; }
.join-editor__cube rect {
  fill: var(--wc-bg-surface);
  stroke: var(--wc-border-strong);
  stroke-width: 1;
}
.join-editor__cube[data-current='true'] rect { stroke: var(--wc-accent); stroke-width: 2; }
.join-editor__cube[data-missing='true'] rect { stroke-dasharray: 4 3; }
.join-editor__name {
  fill: var(--wc-text-primary);
  font: 600 13px var(--wc-font-code);
}
.join-editor__holds { fill: var(--wc-text-secondary); font-size: 12px; }
.join-editor__edge { fill: none; stroke: var(--wc-text-secondary); stroke-width: 1.5; }
/* Under each arrow, in the ground: where one crosses a box, it stays readable. */
.join-editor__halo { fill: none; stroke: var(--wc-bg-page); stroke-width: 5; }
.join-editor__arrow { fill: var(--wc-text-secondary); }
.join-editor__relationship {
  fill: var(--wc-text-secondary);
  font-size: 12px;
  paint-order: stroke;
  stroke: var(--wc-bg-page);
  stroke-width: 4px;
}
.join-editor__list { margin: 0; padding-left: 18px; font-size: 12px; color: var(--wc-text-secondary); }
.join-editor__list a { color: var(--wc-accent); }
/* The form's fields sit in one fieldset, so the page's lock reaches them all. */
.join-editor__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  align-items: end;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.join-editor__condition { grid-column: 1 / -1; }
.join-editor__add input, .join-editor__add select { width: 100%; height: 28px; font-size: 12px; }
.join-editor__add button { justify-self: start; }
/* The prototype's editor head: the file's one action, and how it went (T142). */
/* Design 03's .editor-head (T479): 44 px, padded 6/12. */
.model-editor__head {
  flex: none;
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
/* The file's path heads its form in the code face a path is written in
   (AC-223), at design 03's 13/600: the editor's head, not a page title (D1). */
/* One line, the head's 44 px holding whatever it says (T479's review): a long
   path gives way first, cut short with its whole in its tooltip; an outcome
   takes up to two lines of its own; the state and the actions never wrap.
   From 1,024 px: narrower, the path takes a line of its own (T680). */
.model-workspace .model-editor__path {
  flex: 0 100 auto;
  min-width: 64px;
  margin: 0;
  overflow: hidden;
  font: 600 13px/20px var(--wc-font-code);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-editor__outcome { flex: 0 0 auto; max-width: 50%; margin: 0; color: var(--wc-text-secondary); font-size: 12px; line-height: 16px; }
/* The drafts Save publishes with the file (T488, AC-346): under Save, whole, set to its edge. */
.model-editor__with {
  margin: 0;
  padding: 6px 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
  color: var(--wc-text-secondary);
  font-size: 12px;
  line-height: 16px;
  text-align: right;
  overflow-wrap: anywhere;
}
.model-editor__head .btn-sm { flex: none; white-space: nowrap; }
/* The file's actions at the head's end, Discard beside Save (design 03 note 2). */
.model-editor__discard { margin-left: auto; }
/* The file's state beside its path: published, unpublished changes, or new (T237, T479, AC-226). */
.model-editor__state {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  color: var(--wc-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
/* Published, and the whole model: design 03's .status.ok, in the status colour (T479's review). */
.model-editor__state--ok,
.model-tree__state--ok { color: var(--wc-status-success); }
/* A shared model, read-only (T342; rules 70 and 71; design 03 of 2026-09-27,
   state A): where it is, with the eye, beside its path; "Edit in my
   workspace" at the head's end, and why it can't be pressed yet on the line
   under the head, beneath it. */
.model-editor__read-only { flex: none; gap: 4px; white-space: nowrap; }
.model-editor__read-only > svg { flex: none; }
.model-editor__head .model-editor__copy { display: inline-flex; gap: 4px; align-items: center; margin-left: auto; }
/* Opened from Explore, under its folder's breadcrumb (rule 70): one line
   above the model's panes, as the data source settings' crumbs read. */
.model-page__crumbs {
  flex: none;
  overflow: hidden;
  padding: 8px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
  color: var(--wc-text-secondary);
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-page__crumbs a { color: var(--wc-text-secondary); text-decoration: none; }
.model-page__crumbs a:hover { text-decoration: underline; }
.model-page__crumbs [aria-current='page'] { color: var(--wc-text-primary); }
.model-page__crumbs .is-code { font-family: var(--wc-font-code); }
/* Leaving with them asks first: the warning bar under the head, in view
   however far the form is scrolled. */
.model-editor__warnbar.model-editor__leave { flex: none; align-items: center; }
.model-editor__outcome--failed { color: var(--wc-status-error); }
.yaml-editor .cm-editor {
  max-height: calc(100vh - 160px);
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: 12px;
}
/* The editor scrolls itself: CodeMirror's scroller needs "overflow: auto" as
   well as the editor's max-height, or the lines past it are cut off, not
   scrolled to (research/code-editor.md, "Scrolling"; T139's review). */
.yaml-editor .cm-scroller {
  overflow: auto;
  font-family: var(--wc-font-code);
}
.yaml-editor .cm-gutters {
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  border-right: 1px solid var(--wc-border-subtle);
}
.yaml-editor .cm-focused { outline: 2px solid var(--wc-accent); }
/* The YAML fills its pane, above the Problems panel docked beneath it. */
.model-editor__code .yaml-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.model-editor__code .yaml-editor .cm-editor { flex: 1; min-height: 0; max-height: none; }

/* Problems (T141, AC-135), the prototype's .problems and .prob: a header as a
   selected tab, then a row a problem, 28 px, glyph · message · file:line. */
.model-problems {
  flex: none;
  max-height: 150px;
  margin: 0 8px 8px;
  overflow: auto;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-surface);
}
/* Under a file's YAML, design 03's: flush across the pane, 150 px, ruled above (T482). */
.model-editor__yaml > .model-problems {
  height: 150px;
  margin: 0;
  border: 0;
  border-top: 1px solid var(--wc-border-subtle);
  border-radius: 0;
}
.model-problems__bar { display: flex; align-items: center; gap: 8px; padding-right: 12px; }
.model-problems__how { margin-left: auto; color: var(--wc-text-muted); font-size: 12px; text-align: right; }
/* The YAML's marks (T482; design 03 notes 8 and 9): the open member's lines on
   the accent's soft ground; a note's lines, shown, on a warning ground; each
   note's first line flagged with the warning glyph in the marks' gutter,
   beside the line numbers (research/code-editor.md: a class on every gutter
   element of the line, so the lint gutter draws one there). */
.yaml-editor .cm-line.yaml-editor__tint { background: var(--wc-bg-accent-soft); }
.yaml-editor .cm-line.yaml-editor__noted {
  background: color-mix(in srgb, var(--wc-status-warning-icon) 10%, var(--wc-bg-surface));
}
.yaml-editor .cm-lineNumbers .cm-gutterElement.yaml-editor__tint-number {
  color: var(--wc-accent);
  font-weight: 600;
}
.yaml-editor .cm-lineNumbers .cm-gutterElement.yaml-editor__flag { position: relative; }
/* The warning glyph, "!" in its triangle, in the number's cell at 3 px (design 03). */
.yaml-editor .cm-lineNumbers .cm-gutterElement.yaml-editor__flag::before {
  content: '!';
  position: absolute;
  left: 3px;
  top: 50%;
  width: 11px;
  height: 11px;
  margin-top: -6px;
  background: var(--wc-status-warning-icon);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  color: #1f1f1e;
  font: 700 8px/13px var(--wc-font-ui, sans-serif);
  text-align: center;
}
/* A file's code, design 03's (MW-15): flush in its pane, no frame, the gutter
   ruled on bg-subtle, the numbers in a 40 px cell with room for a flag, and
   the code at direction §3's 12/16. */
.model-editor__yaml .model-editor__code { padding: 0; }
.model-editor__yaml .model-editor__code .yaml-editor .cm-editor { border: 0; border-radius: 0; }
.model-editor__yaml .model-editor__code .yaml-editor .cm-editor.cm-focused { outline-offset: -2px; }
.model-editor__yaml .model-editor__code .yaml-editor .cm-scroller { line-height: 16px; }
.model-editor__yaml .model-editor__code .yaml-editor .cm-lineNumbers .cm-gutterElement {
  min-width: 40px;
  padding: 0 10px 0 16px;
  box-sizing: border-box;
}
/* The file's notes, under the first form's tabs (design 03 note 4): the text,
   then its actions beneath it. */
.model-annotations { flex: none; }
.model-annotations p { display: inline; margin: 0; }
.model-annotations__actions { display: flex; gap: 6px; margin-top: 6px; }
.model-editor__wrap[aria-pressed='true'] { color: var(--wc-accent); font-weight: 600; }
/* The right pane popped out into a larger dialog and back (T600, AC-420;
   PopOut.tsx): one element, filling its place in the section or the dialog's
   body; it keeps the class model-editor__yaml, so the pane's own rules follow it. */
.model-editor__yaml > .pop-out__place,
.model-editor__popped,
.pop-out__body { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.model-editor__pop[aria-pressed='true'] { color: var(--wc-accent); font-weight: 600; }
/* Code in the popped-out pane, as .model-workspace code has it in place. */
.model-editor__popped code { font-family: var(--wc-font-code); }
.pop-out__note { margin: 16px; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
/* Over .dialog-backdrop's centred grid, later in this sheet: the window less a
   12 px margin, so it is taller than the pane under the app bar, as well as wider. */
.dialog-backdrop.pop-out__backdrop {
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding: 12px;
}
.pop-out {
  flex: 0 1 1600px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 8px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  box-shadow: 0 12px 40px rgb(0 0 0 / 30%);
}
.pop-out__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.pop-out__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-problems__head {
  display: inline-flex;
  align-items: center;
  height: 36px;
  margin: 0 0 0 8px;
  padding: 0 10px;
  border-bottom: 2px solid var(--wc-accent);
  color: var(--wc-accent);
  font-size: 12px;
  font-weight: 600;
}
.model-problems__list { margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--wc-border-subtle); }
.model-problems__row {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-height: 28px;
  margin: 0;
  padding: 2px 12px;
  border: 0;
  border-bottom: 1px solid var(--wc-border-subtle);
  border-radius: 0;
  background: none;
  color: var(--wc-text-primary);
  font-size: 12px;
  font-weight: 400;
  text-align: left;
}
p.model-problems__row { border-top: 1px solid var(--wc-border-subtle); border-bottom: 0; }
button.model-problems__row { cursor: pointer; }
.model-problems__where {
  color: var(--wc-text-muted);
  /* The floor, not below it (AC-004): direction.md §3 has no size under 12. */
  font-size: var(--wc-text-xs-size);
  font-family: var(--wc-font-code);
}
/* The prototype's .warnbar (T140, AC-134): a form edit that would lose
   something, named, with Apply anyway and Keep the file. */
.model-editor__warnbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
  padding: 8px 12px;
  /* A band across the flat pane, as design 03's .warnbar (T470). */
  border-bottom: 1px solid var(--wc-border-subtle);
  background: color-mix(in srgb, var(--wc-status-warning-icon) 16%, var(--wc-bg-surface));
  color: var(--wc-text-primary);
  font-size: 12px;
}
.model-editor__warnbar-text { flex: 1; min-width: 240px; }
/* A chart no rollup serves, in its acceleration panel (T153, AC-147): the
   warning bar's tint, and its icon beside the words. */
.rollup-only-warning {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin: 8px 0 0;
  padding: 6px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--wc-status-warning-icon) 16%, var(--wc-bg-surface));
  color: var(--wc-text-primary);
  font-size: 12px;
}
.rollup-only-warning__icon::before { content: '⚠'; color: var(--wc-status-warning); }
/* Beside the editor's result: what served it, and the warning if nothing did. */
.result-source { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 8px; }
.result-source .rollup-only-warning { margin: 0; }
/* What uses the members a save changes (T147): two short lists in the bar. */
.model-references__lead { margin: 0 0 6px; }
.model-references__head { margin: 6px 0 2px; font-size: 12px; font-weight: 600; }
.model-references__list { margin: 0; padding-left: 18px; }
.model-references__list a { color: var(--wc-accent); }
.model-references__members { color: var(--wc-text-secondary); }
/* The prototype's .readonly-veil: the form is read-only, and why. */
.model-editor__veil {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
  padding: 12px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
  color: var(--wc-status-error);
  font-size: 13px;
}
.model-form__lock { min-width: 0; margin: 0; padding: 0; border: 0; }
/* Locked, and still read: the subtle ground and secondary ink, not the
   buttons' half opacity — the form is read while the YAML is mended. Only
   while it does not parse; the lock while typing catches up is not shown. */
.model-editor__form--frozen .model-form__lock:disabled
  :is(input:not([type='checkbox']):not([type='radio']):not([type='file']), select, textarea) {
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  cursor: not-allowed;
}
.model-form { background: var(--wc-bg-surface); }
/* A file's second cube or view starts under a rule, as a new section. */
.model-form + .model-form { border-top: 1px solid var(--wc-border-subtle); }
/* All eight of a cube's tabs in its 676 px pane (T470, UX-074). Narrower than
   design 03's strip — its 9 px either side and 2 px gaps — which doesn't fit
   once the app's face sets the labels, a count reaches two digits or a tab
   carries the refused mark: 8 px either side and no gap, the padding keeping
   the tabs apart. Over the edit sidebar's tabs, which come later. */
.model-form > .model-form__tabs { flex: none; gap: 0; }
.model-form > .model-form__tabs button { padding: 0 8px; }
.model-form__count { color: var(--wc-text-muted); font-weight: 400; }
/* Members run flush to the pane under their rules; a form of fields is inset 12. */
.model-form__panel { padding: 0; }
.model-form__lock > .model-form__fields { padding: 12px; }
.model-form__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}
/* A field beside a taller one (help beneath it) keeps its control under its
   label, so the two controls line up (design 03's Name and Type). */
.model-form__fields > .model-field { align-content: start; }
.model-form__fields > .model-field:has(.model-field__sql),
.model-form__fields > .model-field:has(.model-field__yaml),
.model-form__fields > .model-field:has(.model-picker),
.model-form__fields > .model-field--object,
.model-form__fields > .model-field--list,
.model-form__legacy { grid-column: 1 / -1; }
/* Inspector controls, 28 px at 12 px (direction.md §7d; UX-107, MW-09), over
   the global 32 px input rule, which the bare class lost to. */
.model-workspace .model-field input:not([type='checkbox']):not([type='radio']),
.model-workspace .model-field select { width: 100%; height: 28px; font-size: 12px; }
/* Design 03's .ta (MW-09): 48 px at least, 12/18 in the code face. */
.model-workspace .model-field__sql,
.model-workspace .model-field__yaml {
  width: 100%;
  min-height: 48px;
  font: 12px/18px var(--wc-font-code);
}
/* A description runs the full width, as design 03 draws it (T480's review). */
.model-form__fields > .model-field[data-key='description'] { grid-column: 1 / -1; }
/* General as design 03 state B (T481): "Reads from" and the refresh key's own
   fields across the row; a field's help beneath it, 12 px muted; a required
   field's label marked, the mark left out of its name. */
.model-form__fields > .model-field--one-of,
.model-form__fields > .model-field--flat { grid-column: 1 / -1; }
.model-field--flat > .model-form__fields { padding: 0; }
.model-field__title { font-size: 12px; font-weight: 600; color: var(--wc-text-secondary); }
.model-field__one-of { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.model-field__one-of > .seg { flex: none; }
.model-field__one-of > input { flex: 1; min-width: 12em; font-family: var(--wc-font-code); }
.model-field__one-of > textarea { flex: 1 1 100%; }
.model-field__help { font-size: 12px; line-height: 16px; color: var(--wc-text-muted); }
/* A switch's help under its row (T481's review), and Advanced's untitled rows
   spaced from its summary as its groups are. */
.field.model-field--switch { flex-wrap: wrap; }
.field.model-field--switch > .model-field__help { flex-basis: 100%; }
.model-form__advanced[open] > .model-form__fields { margin-top: 8px; }
.model-field.is-required > label::after {
  content: ' *';
  content: ' *' / '';
  color: var(--wc-status-error);
}
.model-field__flag { display: flex; gap: 6px; }
fieldset.model-field {
  margin: 0;
  padding: 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
}
fieldset.model-field > legend {
  padding: 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.model-form__legacy > summary,
.model-member > summary {
  cursor: pointer;
  font-size: 12px;
}
.model-form__legacy[open] > summary { margin-bottom: 8px; }
/* Design 03's .mrow (T480, MW-10): members as rows under rules, not boxes,
   flush to the pane; the list closed by "+ dimension · n total". */
.model-members { display: grid; margin: 0; padding: 0; list-style: none; }
.model-members-block { display: grid; }
.model-members__item { display: grid; grid-template-columns: minmax(0, 1fr); border-bottom: 1px solid var(--wc-border-subtle); }
.model-member { padding: 0; border: 0; border-radius: 0; }
.model-member__name { font-family: var(--wc-font-code); font-weight: 600; }
.model-members__foot { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--wc-border-subtle); }
.model-members__total { color: var(--wc-text-muted); font-size: 12px; line-height: 16px; }
/* An open member (design 03 note 6): its fields on the subtle ground, inset
   under its name, Remove at its foot. */
.model-member > .model-form__fields,
.model-member > .model-member__foot { background: var(--wc-bg-subtle); }
.model-member > .model-form__fields { padding: 4px 12px 8px 40px; }
.model-member > .model-member__foot { display: flex; justify-content: flex-end; padding: 0 12px 12px 40px; }
/* A new member not yet written (T493): open, as one being edited is, titled;
   and an empty list's note (MW-19), 12 px muted. */
.model-member--new { border-bottom: 1px solid var(--wc-border-subtle); background: var(--wc-bg-subtle); }
.model-member__new-title { margin: 0; padding: 8px 12px 0 40px; font-size: 12px; font-weight: 600; color: var(--wc-text-secondary); }
.model-members__note { margin: 0; padding: 8px 12px; border-bottom: 1px solid var(--wc-border-subtle); font-size: 12px; color: var(--wc-text-muted); }
.model-workspace .model-member__remove { border-color: transparent; background: none; color: var(--wc-status-error); }
.model-workspace .model-member__remove:hover:not(:disabled) { background: var(--wc-bg-hover); }
/* The rarer groups under Advanced, named by their keys (MW-12). */
.model-form__advanced { grid-column: 1 / -1; }
.model-form__advanced > summary {
  display: flex;
  gap: 6px;
  align-items: baseline;
  padding-top: 8px;
  color: var(--wc-text-secondary);
  font: 600 12px/16px Inter, system-ui, sans-serif;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  list-style: none;
}
.model-form__advanced > summary::-webkit-details-marker { display: none; }
.model-form__advanced > summary::before { content: '▸' / ''; color: var(--wc-text-muted); }
.model-form__advanced[open] > summary::before { content: '▾' / ''; }
.model-form__advanced-keys {
  min-width: 0;
  overflow: hidden;
  color: var(--wc-text-muted);
  font-weight: 400;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}
.model-form__advanced[open] > .model-form__group { margin-top: 8px; }
/* A boolean as design 03's switch, its label, Cube's default, and the switch
   at the row's end. */
/* Over .field's stacked grid, which comes later. */
.field.model-field--switch { display: flex; gap: 6px; align-items: center; min-height: 28px; font-size: 12px; }
.field.model-field--switch > label { font-size: 12px; font-weight: 400; color: var(--wc-text-primary); }
.model-field__default { flex: 1; color: var(--wc-text-muted); }
.model-workspace .model-field__expression {
  height: 20px;
  padding: 0 4px;
  border-color: transparent;
  background: none;
  color: var(--wc-text-muted);
  font: 400 12px/16px var(--wc-font-code);
}
/* What a rollup declares, under it in the list (T148, AC-142): label and
   value in two columns, under its name. */
.rollup-facts {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 2px 12px;
  margin: 0;
  padding: 0 12px 6px 36px;
  font-size: 12px;
  line-height: 16px;
}
.rollup-facts > div { display: contents; }
/* The names a publish was refused for (T207, AC-189), under the rollup's facts. */
.rollup-unknown {
  grid-column: 1;
  grid-row: 3;
  margin: 0;
  padding: 0 12px 6px 36px;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-primary);
  overflow-wrap: anywhere;
}
.rollup-unknown [data-icon='error'] { color: var(--wc-status-error); }
/* An index's columns, in their order, each moved by its own ↑ ↓ (T152). */
.ordered-references { display: grid; gap: 6px; }
.ordered-references__list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.ordered-references__row { display: flex; align-items: center; gap: 4px; }
.ordered-references__name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ordered-references__add { display: flex; gap: 4px; }
.ordered-references__add input { flex: 1; min-width: 0; }
.rollup-facts dt { color: var(--wc-text-muted); }
.rollup-facts dd { margin: 0; color: var(--wc-text-secondary); overflow-wrap: anywhere; }
.model-field__problem { color: var(--wc-status-error); font-size: 12px; }
/* A refresh key's runs stop at a daylight-saving change, said with its icon (T377; design 16, D5). */
.refresh-schedule__warn { display: flex; gap: 6px; align-items: flex-start; margin: 6px 0 0; font-size: 12px; color: var(--wc-status-warning); }
.refresh-schedule__warn > svg { flex: none; margin-top: 1px; }
.model-member__type { grid-column: 3; color: var(--wc-text-secondary); }
/* A member's row, collapsed (T236, AC-225), as design 03's .mrow-head (T480):
   the caret, its name and badges, its type on the right, and its SQL on a
   line of its own under the name. */
.model-member > summary {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  gap: 2px 8px;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  line-height: 16px;
  list-style: none;
  cursor: pointer;
}
.model-member > summary:hover { background: var(--wc-bg-hover); }
/* A grid summary draws no marker of its own: the prototype's caret
   (model.js), closed and open, silent to a screen reader, which hears the
   row's expanded state instead. */
.model-member > summary::-webkit-details-marker { display: none; }
.model-member > summary::before { content: '▸' / ''; grid-column: 1; color: var(--wc-text-muted); font-size: 12px; }
.model-member[open] > summary::before { content: '▾' / ''; }
.model-member__names { grid-column: 2; display: flex; gap: 6px; align-items: center; min-width: 0; }
/* Design 03's .mbadge, at direction's 12 px floor (D5), square as a tag (UX-119). */
.model-member__badge {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 3px;
  color: var(--wc-text-secondary);
  font: 600 12px/16px Inter, system-ui, sans-serif;
}
.model-member__sql {
  grid-column: 2 / -1;
  min-width: 0;
  overflow: hidden;
  color: var(--wc-text-muted);
  font: 12px/16px var(--wc-font-code);
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* A reference field's picker (T235, AC-224), the prototype's toggle chips:
   each member a chip in the code face, picked ones in the accent's soft
   tint, numbered where the order is the meaning. */
.model-picker { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.model-picker__chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  max-width: 100%;
  min-height: 24px;
  overflow-wrap: anywhere;
  text-align: left;
  padding: 0 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font: 12px/16px var(--wc-font-code);
  cursor: pointer;
}
.model-picker__chip[aria-pressed='true'] {
  border-color: var(--wc-accent);
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
}
.model-picker__chip:disabled { cursor: default; opacity: 0.6; }
.model-picker__order { font-weight: 600; }
.model-picker__none { color: var(--wc-text-muted); font-size: 12px; }
.model-picker__select { font-family: var(--wc-font-code); }
/* An expanded member's fields, in the prototype's named groups. */
.model-form__group { grid-column: 1 / -1; display: grid; gap: 6px; }
.model-form__group-title {
  margin: 8px 0 0;
  color: var(--wc-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.model-form__group:first-child .model-form__group-title { margin-top: 0; }

/* The contents sit on the page, and their table is the card (AC-231), as the
   prototype draws it: a card around the card read as a frame in a frame.
   Design 14's main (screen 1, state A; it supersedes the prototype's
   .admin-main, R37): 14 px by 24, each part 8 px from the next, the
   description 4 px under the name and the Show row 12 px under what's above
   it (T741). */
.explore__contents {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  padding: 14px 24px 0;
}
.explore__contents > .kind-filter { margin-top: 4px; }
/* The list and its footnote scroll, below the crumbs and the head row, which
   stay put (F23). The scroller runs to the window's foot, not the table's, so
   a row's menu or Move to at the end of a short list has room to open rather
   than being clipped by a scroller the table's height. Its scrollbar sits at
   the window's edge, as the page's did. */
.explore__scroll {
  /* The containing block of what is positioned within — the visually hidden
     counts and captions — which the window's would otherwise be, where
     Firefox and Safari counted them into the page's height. */
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0 -24px;
  padding: 0 24px 16px;
  /* A row the keys focus comes to rest below the sticky header, not under it
     (T244's review), as the dashboard's canvas does below its band. */
  scroll-padding-top: 28px;
}
.explore__note {
  margin: 0;
  color: var(--wc-text-muted);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
/* The workspace's own, in the secondary text colour (design 04, pin 8). */
.explore__note--workspace { color: var(--wc-text-secondary); }

/* A library chart's page (AC-212), the prototype's chartPage(): a head row
   with the title, its type and Edit chart; the chart; a 300 px details pane
   with 12/600 section heads. */
.chart-page { display: grid; gap: 12px; }
.chart-page__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.chart-page__head .item-crumbs { flex-basis: 100%; }
.chart-page__spacer { flex: 1; }
.chart-page__head a.btn-primary {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border-radius: 6px;
  text-decoration: none;
}
/* A link drawn as a button (T463): an action that goes somewhere, such as a
   local chart's "Save to folders…" and "Edit on ‹dashboard›", in the look
   every button has — border, radius, surface, ink. */
a.btn,
a.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  text-decoration: none;
  white-space: nowrap;
}
a.btn { background: var(--wc-bg-surface); color: var(--wc-text-primary); }
a.btn:hover { background: var(--wc-bg-hover); }
a.btn-primary { border-color: var(--wc-accent); }
a.btn.btn-sm,
a.btn-primary.btn-sm { min-height: 24px; height: 24px; padding: 0 8px; }
/* Whose a local chart is (T463, design 06): "Lives on ‹dashboard› · only
   there", with the dashboard's chip. */
.chart-home {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
}
.chart-home b { color: var(--wc-text-primary); font-weight: var(--wc-text-xs-strong-weight); }
.chart-home > .itemicon { width: 18px; height: 18px; }
.chart-home > .itemicon::before { content: '▦'; }
.badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 999px;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
}
.chart-page__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 16px;
  align-items: start;
}
.chart-page__tile {
  padding: 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.chart-page__details { display: grid; gap: 16px; }
.chart-page__section { display: grid; gap: 6px; }
.chart-page__section h2 {
  margin: 0;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
}
.chart-page__source { margin: 0; font-family: var(--wc-font-code); }
.chart-page__none { margin: 0; color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); }
.chart-page__pills,
.chart-page__used { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
.chart-page__used { display: grid; }
.field-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  font-size: var(--wc-text-xs-size);
}
.chart-page__add { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
@media (max-width: 900px) {
  .chart-page__body { grid-template-columns: minmax(0, 1fr); }
}

/* The level's indent is the row's own padding (FolderTree), so a row, and its
   selection, run the pane's full width. */
.folder-tree,
.folder-tree ul { margin: 0; padding: 0; list-style: none; }
/* A folder with its count at the end: the prototype's .file, 28 px at 12 px,
   square and full width (F8, mismatches 10–11). */
.folder-tree__label {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--wc-text-primary);
  font: inherit;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  text-align: left;
  cursor: pointer;
}
.folder-tree__label:hover:not(:disabled) { background: var(--wc-bg-hover); }
/* Its ring inside the row: a full-width row in a scrolling pane had it cut
   off at both sides (T244's review). */
.folder-tree__label:focus-visible { outline-offset: -2px; }
.folder-tree__title { flex: 1; min-width: 0; overflow-wrap: anywhere; }
/* The row's weight, as the prototype's count takes it: 600 when selected. */
.folder-tree__count {
  color: var(--wc-text-muted);
  font-size: var(--wc-text-xs-size);
  font-variant-numeric: tabular-nums;
}
/* .file[aria-current='true']: the accent on its tint (mismatch 12). */
[role='treeitem'][aria-selected='true'] > .folder-tree__label,
[role='treeitem'][aria-selected='true'] > .folder-tree__label:hover:not(:disabled) {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: var(--wc-text-xs-strong-weight);
}
/* Muted text on the tint is 4.28:1 in dark, below AA (direction rule 2): on
   a selected folder, and a focused row below, it is raised to secondary. */
[role='treeitem'][aria-selected='true'] > .folder-tree__label .folder-tree__count {
  color: var(--wc-text-secondary);
}
/* A folder's chip, the menu's .itemicon.ic-folder at 18 px: ◉ for the
   personal root, ▣ for any other (F7, mismatch 14). The glyph is the
   stylesheet's, so it joins neither the row's name nor its text. */
.folder-tree__label > .itemicon { width: 18px; height: 18px; }
/* My workspace heading the tree, a rule under it and its folders before the
   shared tree (design 04, pin 1: .tdiv, 6 px above and below, 12 px in). */
.folder-tree__item--parted { position: relative; padding-bottom: 13px; }
.folder-tree__item--parted::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 6px;
  height: 1px;
  background: var(--wc-border-subtle);
}
.itemicon[data-icon='folder']::before { content: '▣'; }
.itemicon[data-icon='personal']::before { content: '◉'; }
.itemicon[data-icon='dashboard']::before { content: '▦'; }
.itemicon[data-icon='chart']::before { content: '◢'; }
/* A model (T334): a new glyph in the same style (references.md §4). */
.itemicon[data-icon='model']::before { content: '◇'; }
/* A data source (T335): a glyph of its own, in the same style (references.md §4). */
.itemicon[data-icon='data-source']::before { content: '◍'; }
/* The docked Folders pane (AC-194), the prototype's .pane.left: from the app
   bar to the window's foot, on the surface, with a rule on its right; its
   head stays put while a long tree scrolls. */
.explore__tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--wc-bg-surface);
  border-right: 1px solid var(--wc-border-subtle);
}
/* Positioned for the same reason as .explore__scroll: each folder's hidden
   count is placed within it, not down the window. */
.explore__pane-body { position: relative; flex: 1; min-height: 0; overflow: auto; }
/* .pane-head: 44 px, 8 by 12, over a rule (mismatch 9). */
.explore__pane-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.explore__pane-head h2 {
  margin: 0;
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
  font-weight: var(--wc-text-sm-strong-weight);
}
.explore__pane-head button { margin-left: auto; }

/* The Access panel (T330; direction.md §7e): docked right of the contents,
   360 px, rows of 28, read-write groups before read-only (rules 62–66). */
.explore--access { grid-template-columns: 260px minmax(0, 1fr) 360px; }
/* Narrower than 1,024 px, stacked, as the Model workspace and the chart
   editor are: the tree, the folder's contents, then its access, each as
   wide as the page, which grows down instead of sideways (T396, AC-304). */
@media (max-width: 1023.98px) {
  main:has(.explore--access) { height: auto; }
  .explore--access { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; }
}
/* The folder header's access chip (T331; rule 69; designs 04, 07 and 09,
   pin 7): 22 px, a 14 px icon and 12 px label on bg-subtle, in the accent
   for Super-Admin and Read-write. The lock chip beside it, when only
   Super-Admins see the folder (rule 63), is the neutral one. */
.access-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  white-space: nowrap;
}
.access-chip > svg { flex: none; }
.access-chip--accent {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: var(--wc-text-xs-strong-weight);
}
/* Signed in with access to no folder (T331; design 09, state G; rule 61):
   one sentence and where access comes from, centred, naming no folder. */
.explore__no-access {
  display: grid;
  justify-items: center;
  gap: 12px;
  max-width: 420px;
  margin: 40px auto 0;
  padding: 24px;
  text-align: center;
}
.explore__no-access h1 {
  margin: 0;
  font-size: var(--wc-text-md-size);
  line-height: var(--wc-text-md-line);
  font-weight: var(--wc-text-md-weight);
}
.explore__no-access p { margin: 0; color: var(--wc-text-secondary); }
.explore__no-access > svg { color: var(--wc-text-muted); }
/* The Access panel as the 2026-09-27 design 07 draws it (T473): 360 px,
   docked right; a 44 px head with "Access" at text-md and the folder's path
   beside it (pin 2); each list a section with its help line (pin 3); the
   foot pinned, with the audit note, Cancel and Save (pin 9). */
.access-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--wc-bg-surface);
  border-left: 1px solid var(--wc-border-subtle);
}
.access-panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.access-panel__head h2 {
  margin: 0;
  font-size: var(--wc-text-md-size);
  line-height: var(--wc-text-md-line);
  font-weight: var(--wc-text-md-weight);
}
.access-panel__folder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
.access-panel__close,
.access-row__remove {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
}
.access-row__remove { width: 24px; height: 24px; }
.access-panel__close:hover,
.access-row__remove:hover { background: var(--wc-bg-hover); }
.access-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.access-panel__loading { margin: 12px 16px; padding: 0; list-style: none; display: grid; gap: 8px; }
.access-panel__loading > li { height: 28px; border-radius: 4px; background: var(--wc-bg-subtle); }
.access-panel__level {
  display: grid;
  gap: 6px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.access-panel__level h3 {
  margin: 0;
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
  font-weight: var(--wc-text-sm-strong-weight);
}
.access-panel__help,
.access-panel__unset {
  margin: 0;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
/* "Set here" and "From ancestors": the design's 12/600 capitals. */
.access-panel__level h4 {
  margin: 4px 0 0;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.access-panel__list { list-style: none; margin: 0; padding: 0; }
/* A group, 28 px (direction rule 17), in the code face as the token carries it (pin 4). */
.access-row__line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
.access-row__icon { flex: none; color: var(--wc-text-muted); }
.access-row__group {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--wc-font-code);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
.access-row.is-removing .access-row__group { text-decoration: line-through; color: var(--wc-text-muted); }
.access-row__end { display: flex; align-items: center; gap: 8px; flex: none; margin-left: auto; }
.access-row__from { color: var(--wc-text-secondary); }
.access-row__outranked {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding: 0 0 4px 22px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
.access-row__info { flex: none; color: var(--wc-accent); }
/* Pending changes (pin 8): Adding in the accent, Removing in status-error. */
.access-tag {
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
}
.access-tag--add { background: var(--wc-bg-accent-soft); color: var(--wc-accent); }
.access-tag--remove {
  background: color-mix(in srgb, var(--wc-status-error) 10%, var(--wc-bg-surface));
  color: var(--wc-status-error);
}
/* The design's text links: Add group, Keep, Retry at 12/600; a folder's name at 400. */
.access-panel__link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--wc-accent);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  cursor: pointer;
}
.access-panel__link:hover { text-decoration: underline; }
.access-row__from .access-panel__link,
.access-row__outranked .access-panel__link,
.access-panel__unset .access-panel__link { display: inline; font-weight: var(--wc-text-xs-weight); }
.access-panel__add { justify-self: start; }
/* State A: the AD group box, its label stacked above it, its suggestions below. */
.group-combobox { position: relative; display: grid; gap: 4px; }
.group-combobox > label {
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
}
.group-combobox > input { font-family: var(--wc-font-code); }
.group-combobox__list {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  z-index: 20;
  margin-top: 4px;
  padding: 4px;
  max-height: 280px;
  overflow: auto;
  background: var(--wc-bg-raised);
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  box-shadow: var(--wc-shadow-pop);
}
.group-combobox__head {
  padding: 6px 8px 2px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
}
.group-combobox__option {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  cursor: pointer;
}
.group-combobox__option code { font-family: var(--wc-font-code); font-size: var(--wc-text-xs-size); }
.group-combobox__option:hover { background: var(--wc-bg-hover); }
/* As the cube picker's: the option the keys are on, seen (AC-176; T405's
   audit). Its hint in text-secondary there: text-muted is 4.28:1 on the dark
   tint (tokens.ts; AC-005, T405's review). */
.group-combobox__option[aria-selected='true'] {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  box-shadow: inset 3px 0 0 var(--wc-accent);
}
.group-combobox__option[aria-selected='true'] .group-combobox__hint { color: var(--wc-text-secondary); }
.group-combobox__option.is-typed { margin-top: 4px; border-top: 1px solid var(--wc-border-subtle); border-radius: 0 0 4px 4px; }
.group-combobox__hint { margin-left: auto; color: var(--wc-text-muted); }
/* States C and G: a notice or error band in the panel, icon and words. */
.access-panel__band {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 16px 0;
  padding: 8px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-primary);
}
.access-panel__band > svg { flex: none; margin-top: 1px; }
.access-panel__band > span { flex: 1; min-width: 0; }
.access-panel__band details { flex-basis: 100%; }
.access-panel__band details p { margin: 4px 0 0; color: var(--wc-text-secondary); }
.access-panel__band--warn { background: color-mix(in srgb, var(--wc-status-warning-icon) 14%, var(--wc-bg-surface)); }
.access-panel__band--err { background: color-mix(in srgb, var(--wc-status-error) 9%, var(--wc-bg-surface)); }
.access-panel__foot {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--wc-border-subtle);
}
.access-panel__foot > p {
  margin: 0;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
.access-panel__acts { display: flex; justify-content: flex-end; gap: 8px; }
/* State D, and the discard question: a popover anchored above Save. */
.access-panel__ask {
  position: absolute;
  right: 16px;
  bottom: calc(100% + 8px);
  left: 40px;
  z-index: 20;
  display: grid;
  gap: 10px;
  padding: 14px;
  background: var(--wc-bg-raised);
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  box-shadow: var(--wc-shadow-pop);
}
.access-panel__ask p { margin: 0; font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); }
.access-panel__ask .access-panel__ask-title { font-weight: var(--wc-text-sm-strong-weight); }
.access-panel__ask code { font-family: var(--wc-font-code); font-size: var(--wc-text-xs-size); }
/* State E's toast, left of the docked panel rather than over its Save and
   Cancel (T473's review); stacked below 1,024 px, the page's corner. */
@media (min-width: 1024px) {
  .access-panel .undo-toast { right: calc(360px + 16px); }
}
/* The folder header's Access, with its lock: a ghost closed, .btn.pressed
   while its panel is open (pin 1; 07:179; T684, EXP-13). Both from .btn. */
.access-picker {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 8px;
  align-items: center;
  font-size: var(--wc-text-sm-size);
}
.access-picker button { grid-column: 2; justify-self: start; }

.link-button {
  padding: 4px 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--wc-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.link-button:hover { background: var(--wc-bg-subtle); text-decoration: underline; }

/* A workspace's page title (AC-231): the prototype's .admin-main h1, direction
   §3's text-lg. It was the browser's default h1, 28 px at 700. */
.workspace-title {
  margin: 0;
  font-size: var(--wc-text-lg-size);
  line-height: var(--wc-text-lg-line);
  font-weight: var(--wc-text-lg-weight);
}

/* A workspace's table (AC-231): the prototype's .card + .grid-table — a card,
   a header band, 34 px rows, 12 px cells, tabular numerals (direction rule 1).
   It sat bare on the page with 14 px cells and proportional figures.
   The corners are rounded on the corner cells rather than clipped with
   overflow: a table that clips becomes the scroller a sticky header sticks
   to (T240), and browsers need not honour overflow on a table box at all. */
.folder-contents,
.query-log {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  font-variant-numeric: tabular-nums;
}
/* Narrower than 1,024 px, a workspace's table wider than the page scrolls
   sideways in its own box (TableScroll), and the page doesn't (T396,
   AC-304); the table stays a table, as wide as its box. Only there: wider,
   the box clips nothing, and the page is the scroller a sticky header sticks
   to (T240). Positioned, so what a cell places absolutely (a label for
   screen readers alone) is held in the box rather than pushing the page
   wide. The query log, whose header must stay in view as the page scrolls
   (AC-230), wraps its cells instead, and needs no such box. */
@media (max-width: 1023.98px) {
  .table-scroll-narrow { position: relative; max-width: 100%; overflow-x: auto; }
  .query-log--sticky th,
  .query-log--sticky td { overflow-wrap: anywhere; }
}
.folder-contents thead th,
.query-log thead th { background: var(--wc-bg-subtle); }
.query-log thead th { height: 28px; }
.folder-contents thead tr:first-child > :first-child,
.query-log thead tr:first-child > :first-child { border-top-left-radius: 5px; }
.folder-contents thead tr:first-child > :last-child,
.query-log thead tr:first-child > :last-child { border-top-right-radius: 5px; }
.folder-contents tbody tr:last-child > :first-child,
.query-log tbody:last-of-type tr:last-child > :first-child { border-bottom-left-radius: 5px; }
.folder-contents tbody tr:last-child > :last-child,
.query-log tbody:last-of-type tr:last-child > :last-child { border-bottom-right-radius: 5px; }
.folder-contents tbody td,
.folder-contents tbody th,
.query-log tbody td,
.query-log tbody th { font-size: var(--wc-text-xs-size); }
.query-log tbody td,
.query-log tbody th { height: 34px; }
.folder-contents tbody tr:last-child > *,
.query-log tbody:last-of-type tr:last-child > * { border-bottom: 0; }
/* The query log by day (T469, UX-082): each day's heading a band across the
   table, as its header is, and its caption at the table's start. */
.query-log caption { caption-side: top; text-align: left; padding: 0 0 6px; }
.query-log tbody tr.query-log__day > th {
  height: 28px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-weight: var(--wc-text-xs-strong-weight);
}
.query-log summary code { font-family: var(--wc-font-code); }

.folder-contents th,
.folder-contents td,
.query-log th,
.query-log td {
  padding: 8px;
  border-bottom: 1px solid var(--wc-border-subtle);
  text-align: left;
  font-weight: var(--wc-text-sm-weight);
  vertical-align: top;
}
.folder-contents th,
.folder-contents td,
.query-log th,
.query-log td { padding: 4px 8px; vertical-align: middle; }

.folder-contents thead th,
.query-log thead th {
  font-weight: var(--wc-text-xs-strong-weight);
  font-size: var(--wc-text-xs-size);
  /* The prototype's header band text: primary, on bg-subtle. */
  color: var(--wc-text-primary);
}

/* A workspace page that waits on a later phase (AC-233), and the prototype's
   info bar that says so: an icon, the sentence, on the accent tint. */
.admin-page { display: grid; gap: 12px; }
/* The page's title and its one action, as the prototype's Data sources head. */
.admin-page__head { display: flex; align-items: center; gap: 8px; }
.admin-page__head > h1 { flex: 1; }

/* A page with a pane docked at its right (T471, design 01): the page's own
   content scrolls beside it, and the pane keeps the window's height. */
.admin-page__main { display: grid; gap: 12px; align-content: start; min-width: 0; }
main:has(.admin-page--docked) {
  height: calc(100vh - var(--wc-app-bar-height));
  display: flex;
  padding: 0;
}
.admin-page--docked {
  flex: 1;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) 480px;
  gap: 0;
}
.admin-page--docked > .admin-page__main { overflow: auto; padding: var(--wc-surface-padding); }
/* Explore's workspace listing, with the pane where the Access panel docks. */
.explore--source { grid-template-columns: 260px minmax(0, 1fr) 480px; }

/* New data source (T363, T471; AC-158; design 01): the approved prototype's
   docked pane (admin-sources.js), 480 px, the window's height, its steps at
   the top and its actions at the foot, only its body scrolling, so nothing
   moves between steps or drivers. */
.source-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-left: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
.source-pane__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.source-pane__head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.source-pane__where {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
}
.source-pane__person::before { content: '◉'; font-size: 10px; }
.source-pane__close,
.source-pane__head-back {
  margin-left: auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--wc-text-secondary);
  font-size: 20px;
  line-height: 1;
}
/* The sheet's own way back, before its title (state K): docked, the foot's Back is enough. */
.source-pane__head-back { display: none; margin-left: -6px; }
/* The steps: numbered, a line between each, done ones ticked and a way
   back, the current one filled in the accent (UX-209). */
.source-pane__rail { padding: 10px 16px; border-bottom: 1px solid var(--wc-border-subtle); }
.source-pane__rail ol { display: flex; align-items: center; gap: 8px; margin: 0; padding: 0; list-style: none; }
.source-pane__rail li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
}
.source-pane__rail li + li { flex: 1; }
.source-pane__rail li + li::before {
  content: '';
  flex: 1;
  min-width: 12px;
  height: 1px;
  background: var(--wc-border-strong);
}
.source-pane__rail li > span,
.source-pane__rail li > button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.source-pane__rail li > button {
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
}
.source-pane__rail li > button:hover:not(:disabled) { background: none; color: var(--wc-text-primary); }
.source-pane__rail li.is-current { color: var(--wc-text-primary); font-weight: 600; }
.source-pane__step {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 20px;
  height: 20px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.source-pane__rail li.is-current .source-pane__step {
  border-color: var(--wc-accent);
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
}
.source-pane__rail li.is-done .source-pane__step {
  border-color: var(--wc-bg-accent-soft);
  background: var(--wc-bg-accent-soft);
  color: transparent;
  font-size: 0;
}
.source-pane__rail li.is-done .source-pane__step::before { content: '✓'; font-size: 11px; color: var(--wc-accent); }
.source-pane__rail-short { display: none; margin: 0; align-items: center; gap: 8px; font-size: var(--wc-text-xs-size); font-weight: 600; }
.source-pane__rail-short .source-pane__step { border-color: var(--wc-accent); background: var(--wc-accent); color: var(--wc-text-on-accent); }
/* The chosen type, kept in view with the way to change it (UX-203). */
.source-pane__chosen {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-subtle);
}
.source-pane__chosen-text { display: grid; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.source-pane__chosen-text b { font-size: var(--wc-text-sm-size); font-weight: 600; color: var(--wc-text-primary); }
.source-pane__chosen .link-button { margin-left: auto; color: var(--wc-accent); font-weight: 600; }
.source-pane__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 16px;
  align-content: start;
  padding: 16px;
}
.source-pane__foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
.source-pane__foot > .btn,
.source-pane__foot > .btn-primary { min-height: 32px; }
.source-pane__spacer { flex: 1; }
/* At text-xs's own 16 px line (T684): beside buttons that no longer wrap, a
   note of two lines stays within their 32 px, and the foot keeps its height. */
.source-pane__foot-note { font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); color: var(--wc-text-secondary); }
.source-pane__foot-note.is-err { color: var(--wc-status-error); }

/* Exporting a dashboard (T511; AC-354, AC-360; design 13, screen 1): design
   01's pane, docked beside Explore's list where Access docks, or at the
   dashboard's edge, the dashboard narrowing beside it so the tiles a
   dependency is used on stay in view. */
.explore--export { grid-template-columns: 260px minmax(0, 1fr) 480px; }
.export-pane--over {
  position: fixed;
  top: var(--wc-app-bar-height);
  right: 0;
  bottom: 0;
  width: 480px;
  height: auto;
  z-index: 6;
}
main:has(.export-pane--over) { padding-right: 480px; }
.export-pane h2:focus { outline: none; }
.export-pane h2:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
.export-pane__what .itemicon { width: 18px; height: 18px; }
.export-pane__body { gap: 16px; }
.export-pane__section { display: grid; gap: 8px; align-content: start; }
.export-pane__section + .export-pane__section { padding-top: 16px; border-top: 1px solid var(--wc-border-subtle); }
.export-pane__section h3 { margin: 0; }
.export-pane__always { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.export-pane__always li { display: flex; align-items: center; gap: 8px; min-height: 28px; font-size: var(--wc-text-sm-size); }
.export-pane__always .export-lock {
  width: 16px;
  height: 16px;
  padding: 2px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 3px;
  background: var(--wc-bg-subtle);
}
.export-pane__aside { margin-left: auto; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.export-lock { flex: none; color: var(--wc-text-secondary); }
.export-pane__note { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.export-pane__choose { display: flex; align-items: center; gap: 8px; }
.export-pane__choose h3 { margin-right: auto; }
.export-pane__all { display: inline-flex; align-items: center; gap: 6px; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.export-pane__all .link-button { color: var(--wc-accent); font-weight: 600; }
.export-group { display: grid; gap: 4px; }
.export-group__head { display: flex; align-items: center; gap: 6px; min-height: 28px; }
.export-group__fold {
  width: 20px;
  height: 20px;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--wc-text-secondary);
  line-height: 1;
}
.export-group__label { display: inline-flex; align-items: center; gap: 8px; font-size: var(--wc-text-sm-size); font-weight: 600; }
.export-group__count { margin-left: auto; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); white-space: nowrap; }
.export-group__note,
.export-group__none { display: flex; align-items: flex-start; gap: 6px; margin: 0 0 0 26px; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.export-group__rows { display: grid; gap: 2px; margin: 0 0 0 18px; padding: 0; list-style: none; }
.export-row { display: grid; gap: 2px; padding: 6px 8px; border-radius: 6px; }
.export-row:hover,
.export-row:focus-within { background: var(--wc-bg-subtle); }
.export-row__line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.export-row__main { display: inline-flex; align-items: center; gap: 8px; min-width: 0; font-size: var(--wc-text-sm-size); }
.export-row__name { overflow-wrap: anywhere; }
.export-row__name.is-code { font-weight: 600; }
.export-row__aside { margin-left: auto; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); white-space: nowrap; }
.export-row__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  margin-left: auto;
  padding: 0 6px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 999px;
  background: var(--wc-bg-surface);
  font-size: 11px;
  color: var(--wc-text-secondary);
  white-space: nowrap;
}
.export-row__line--used { padding-left: 48px; }
.export-row__used { font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.export-row__details { margin-left: auto; font-size: var(--wc-text-xs-size); color: var(--wc-accent); font-weight: 600; }
.export-details {
  display: grid;
  gap: 6px;
  margin: 6px 0 2px 48px;
  padding: 10px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.export-details__head { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--wc-text-xs-size); font-weight: 600; }
.export-details__head svg[data-icon='ok'] { color: var(--wc-status-success); }
.export-details__list { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; font-size: var(--wc-text-xs-size); }
.export-details__list li { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 8px; }
.export-details__list li > span:first-child { color: var(--wc-text-secondary); }
.export-details__list .is-code { overflow-wrap: anywhere; white-space: pre-wrap; }
.export-details__never { display: grid; gap: 2px; margin: 0; padding: 0 0 0 20px; font-size: var(--wc-text-xs-size); }
.export-details__note { margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.export-pane__hidden {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 4px 0 0;
  padding: 10px 12px;
  border: 1px dashed var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-subtle);
  font-size: var(--wc-text-xs-size);
  line-height: 18px;
  color: var(--wc-text-secondary);
}
.export-pane__hidden > svg { flex: none; margin-top: 2px; }
.export-pane__hidden b { color: var(--wc-text-primary); }
.export-pane__info {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--wc-bg-accent-soft);
  font-size: var(--wc-text-xs-size);
  line-height: 18px;
}
.export-pane__finding { display: grid; gap: 10px; }
.export-pane__skeleton { display: block; height: 12px; border-radius: 4px; background: var(--wc-bg-subtle); }
.export-pane__skeleton:nth-of-type(2) { width: 72%; }
.export-pane__skeleton:nth-of-type(3) { width: 56%; }
.export-pane__failed { display: grid; gap: 8px; justify-items: start; }
.export-pane__foot { flex-direction: column; align-items: stretch; gap: 10px; }
.export-pane__holds { display: grid; margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.export-pane__holds b { color: var(--wc-text-primary); font-weight: 600; }
.export-pane__file { display: flex; align-items: center; gap: 12px; font-size: var(--wc-text-sm-size); }
.export-pane__file input { flex: 1; min-width: 0; height: 32px; }
.export-pane__actions { display: flex; align-items: center; gap: 8px; }
.export-pane__actions .btn-primary { display: inline-flex; align-items: center; gap: 6px; }
/* The ⋯ stays pressed while its pane is open (design 13, pin 1). */
.dashboard__more.is-pressed { border-color: var(--wc-accent); background: var(--wc-bg-accent-soft); color: var(--wc-accent); }
/* The tiles a hovered or focused dependency is used on, with a chip naming it
   (T511, AC-360; design 13, pin 12). */
.grid-tile[data-outlined='true'] { outline: 2px solid var(--wc-accent); outline-offset: 1px; }
.grid-tile__outline {
  position: absolute;
  top: 0;
  right: 12px;
  z-index: 2;
  padding: 1px 8px;
  border-radius: 0 0 6px 6px;
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
  font-family: var(--wc-font-code);
  font-size: 11px;
  line-height: 16px;
  pointer-events: none;
}
.export-toast { max-width: 440px; }

/* Importing a dashboard (T513; design 13, screen 2): design 01's pane,
   docked beside My workspace where the others dock. */
.explore--importing { grid-template-columns: 260px minmax(0, 1fr) 480px; }
.menu-button__aside { margin-left: auto; padding-left: 12px; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.itemicon.ic-upload { background: var(--wc-bg-subtle); color: var(--wc-text-secondary); }
.import-pane h2:focus { outline: none; }
.import-pane h2:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
.import-pane__body { gap: 12px; }
.import-pane__doc {
  flex: none;
  width: 14px;
  height: 17px;
  border: 1.5px solid currentColor;
  border-radius: 2px 5px 2px 2px;
  color: var(--wc-text-secondary);
}
.import-pane__drop {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 24px 16px;
  border: 1px dashed var(--wc-border-strong);
  border-radius: 8px;
  background: var(--wc-bg-subtle);
  text-align: center;
  font-size: var(--wc-text-sm-size);
}
.import-pane__drop > span { color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); }
.import-pane__hint code { font-family: var(--wc-font-code); }
.import-pane__info {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--wc-bg-accent-soft);
  font-size: var(--wc-text-xs-size);
  line-height: 18px;
}
.import-pane__info > svg { flex: none; margin-top: 2px; }
.import-pane__note { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.import-pane__chosen { display: flex; align-items: center; gap: 8px; font-size: var(--wc-text-sm-size); }
.import-pane__size { font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.import-pane__another { margin-left: auto; color: var(--wc-accent); font-weight: 600; font-size: var(--wc-text-xs-size); }
.import-pane__read { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--wc-text-xs-size); font-weight: 600; color: var(--wc-status-success); }
.import-pane__holds,
.import-pane__lands,
.import-pane__parts { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.import-pane__holds li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  border-bottom: 1px solid var(--wc-border-subtle);
  font-size: var(--wc-text-sm-size);
}
.import-pane__what { margin-left: auto; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); white-space: nowrap; }
.import-pane__refused { display: grid; gap: 8px; outline: none; }
.import-pane__refused:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
.import-pane__refused-head { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--wc-text-sm-size); font-weight: 600; color: var(--wc-status-error); }
.import-pane__part {
  display: grid;
  gap: 2px;
  margin: 0 0 8px;
  padding: 10px 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--wc-status-error) 10%, var(--wc-bg-surface));
  font-size: var(--wc-text-xs-size);
  line-height: 18px;
}
.import-pane__part p { margin: 0; }
.import-pane__lands-head { display: flex; align-items: center; gap: 8px; }
.import-pane__lands-head h3 { margin: 0 auto 0 0; }
.import-pane__count { display: inline-flex; align-items: center; gap: 4px; font-size: var(--wc-text-xs-size); font-weight: 600; }
.import-pane__count.is-ok { color: var(--wc-status-success); }
.import-pane__lands > li { display: grid; gap: 6px; padding: 8px 0; border-bottom: 1px solid var(--wc-border-subtle); }
.import-pane__land { display: flex; align-items: flex-start; gap: 8px; }
.import-pane__land-text { display: grid; font-size: var(--wc-text-sm-size); }
.import-pane__land-text > span { font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.import-pane__land-text .is-code { font-family: var(--wc-font-code); }
.import-pane__lands-as { margin-left: auto; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); white-space: nowrap; }
.import-pane__warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 0 26px;
  padding: 8px 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--wc-status-warning-icon) 16%, var(--wc-bg-surface));
  font-size: var(--wc-text-xs-size);
  line-height: 18px;
}
.import-pane__warning > svg { flex: none; margin-top: 2px; }
/* Leaving out the charts that use a cube off the target's path (T736). */
.import-pane__leave { display: flex; align-items: center; gap: 8px; margin: 6px 0 0 26px; font-size: var(--wc-text-xs-size); }
/* An import's data sources (T514; design 13, states M–P): each mapped or created. */
.import-sources { display: grid; gap: 12px; }
.import-source { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--wc-border-subtle); border-radius: 8px; }
.import-source__head { display: flex; align-items: center; gap: 8px; font-size: var(--wc-text-sm-size); }
.import-source__head .is-code { font-family: var(--wc-font-code); }
.import-source__driver,
.import-source__same {
  padding: 0 6px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 999px;
  font-size: 11px;
  color: var(--wc-text-secondary);
}
.import-source__same { border-color: var(--wc-accent); color: var(--wc-accent); font-weight: 600; }
.import-source__status { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; font-size: var(--wc-text-xs-size); font-weight: 600; }
.import-source__modes { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--wc-border-subtle); border-radius: 6px; overflow: hidden; }
.import-source__modes label { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 30px; font-size: var(--wc-text-xs-size); cursor: pointer; }
.import-source__modes label:has(input:checked) { background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: 600; }
.import-source__map,
.import-source__create { display: grid; gap: 10px; }
.import-source__choices { display: grid; gap: 4px; padding: 8px; border: 1px solid var(--wc-border-subtle); border-radius: 6px; }
.import-source__folder { display: grid; gap: 2px; }
.import-source__folder-name { font-size: var(--wc-text-xs-size); font-weight: 600; color: var(--wc-text-secondary); }
.import-source__none { padding-left: 8px; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.import-source__choice { display: flex; align-items: center; gap: 8px; min-height: 30px; padding: 0 8px; border-radius: 4px; font-size: var(--wc-text-sm-size); cursor: pointer; }
.import-source__choice:has(input:checked) { background: var(--wc-bg-accent-soft); }
.import-source__choice .is-code { font-family: var(--wc-font-code); }
.import-source__choice-driver { margin-left: auto; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.import-source__mismatch { margin: 0; }
/* Mapped by its name, or blocking off the target's path (T719). */
.import-source__held { margin: 0; }
.import-source__ways { display: flex; flex-wrap: wrap; gap: 8px; }
.import-source__test { display: grid; gap: 8px; justify-items: start; }
.import-source__test h4 { margin: 0; }

/* Generate cubes as design 11 (T485, AC-344): design 01's pane, docked as the
   Model page's third column — beside the overview, or in the code's place on
   a file's page, the form widening — its steps in cards of 34 px rows. */
.model-page.model-page--generating { grid-template-columns: 240px minmax(0, 1fr) 480px; }
/* A calculation request beside the file it was opened on (T384, AC-051): a third
   column, as Generate cubes' pane is, at direction.md's right-inspector 320 px. */
.model-page.model-page--request { grid-template-columns: 240px minmax(0, 1fr) 320px; }
.model-request { overflow-y: auto; min-height: 0; padding: var(--wc-surface-padding); }
.model-request__title { margin: 0 0 8px; font-size: var(--wc-text-sm-size); font-weight: 600; }
.model-page--generating .model-editor { grid-template-columns: minmax(0, 1fr); }
.model-page--generating .model-editor__yaml { display: none; }
.model-tree__generate.is-open,
.generate-pane__yaml-head button[aria-pressed='true'] {
  border-color: var(--wc-accent);
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
}
.generate-pane h2:focus { outline: none; }
.generate-pane h2:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
.generate-pane__where .source-pane__chosen-text > span { color: var(--wc-text-secondary); }
.generate-pane__where .source-pane__chosen-text b { font-size: 12px; }
.generate-pane__section { display: grid; gap: 8px; align-content: start; }
.generate-pane__section + .generate-pane__section { padding-top: 16px; border-top: 1px solid var(--wc-border-subtle); }
.generate-pane__card,
.generate-pane__choices {
  overflow: hidden;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.generate-pane__choice {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
  cursor: pointer;
}
.generate-pane__choice + .generate-pane__choice { border-top: 1px solid var(--wc-border-subtle); }
.generate-pane__choices.is-dense .generate-pane__choice { min-height: 28px; }
.generate-pane__choice:has(input:checked) { background: var(--wc-bg-accent-soft); }
.generate-pane__choice input { accent-color: var(--wc-accent); }
.generate-pane__choice-name { font-weight: 600; }
.generate-pane__choice-note { margin-left: auto; color: var(--wc-text-secondary); }
/* Its health after its driver, as Data sources says it (T490, AC-348). */
.generate-pane__choice > .status { flex: none; margin-left: 12px; font-size: 12px; }
.generate-pane__empty { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
.generate-pane__empty a { color: var(--wc-accent); font-weight: 600; }
.generate-pane__filters { display: flex; gap: 8px; align-items: center; }
.model-workspace input.generate-pane__search {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}
.generate-pane__types { position: relative; }
.model-workspace .generate-pane__type {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  font-size: 12px;
  white-space: nowrap;
}
.generate-pane__type[aria-expanded='true'] { border-color: var(--wc-accent); box-shadow: 0 0 0 1px var(--wc-accent); }
.generate-pane__menu {
  position: absolute;
  z-index: 5;
  top: calc(100% + 4px);
  right: 0;
  display: grid;
  min-width: 190px;
  padding: 6px 0;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  box-shadow: 0 8px 24px rgb(20 20 18 / 14%), 0 1px 3px rgb(20 20 18 / 10%);
}
.generate-pane__menu label { display: flex; gap: 8px; align-items: center; min-height: 28px; padding: 0 12px; font-size: 12px; }
.generate-pane__menu label:first-child { border-bottom: 1px solid var(--wc-border-subtle); }
.generate-pane__menu input { accent-color: var(--wc-accent); }
.generate-pane__count { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); font-variant-numeric: tabular-nums; }
.generate-pane__tables { width: 100%; border-collapse: collapse; font-size: 12px; }
.generate-pane__tables > thead th {
  height: 28px;
  padding: 0 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-weight: 600;
  text-align: left;
}
.generate-pane__tables > tbody > tr > td { height: 34px; padding: 0 12px; border-bottom: 1px solid var(--wc-border-subtle); }
.generate-pane__tables > tbody > tr:last-child > td { border-bottom: 0; }
.generate-pane__tables > tbody > tr > td:last-child { width: 24px; padding-right: 8px; text-align: right; }
.generate-pane__tables > tbody > tr.is-open > td { border-bottom: 0; background: var(--wc-bg-subtle); }
.generate-pane__tables label { display: flex; gap: 10px; align-items: center; cursor: pointer; }
.generate-pane__all { display: flex; gap: 10px; align-items: center; }
/* "In model · orders" under a table's name (T489, AC-347): muted, 12 px. */
.generate-pane__in-model { display: block; margin: 2px 0 0 24px; color: var(--wc-text-secondary); font-size: 12px; }
.generate-pane__tables input[type='checkbox'] { accent-color: var(--wc-accent); }
.model-workspace .generate-pane__peek {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
}
.generate-pane__peek[aria-expanded='true'] { background: var(--wc-bg-accent-soft); color: var(--wc-accent); }
.generate-pane__columns > td { padding: 0 12px 12px !important; background: var(--wc-bg-subtle); height: auto !important; }
.generate-pane__caption { display: flex; gap: 4px; align-items: center; margin: 0 0 6px; font-size: 12px; color: var(--wc-text-secondary); }
.generate-pane__inline { display: inline-flex; }
.generate-pane__columns table { width: 100%; border-collapse: collapse; border: 1px solid var(--wc-border-subtle); background: var(--wc-bg-surface); table-layout: fixed; }
.generate-pane__columns th,
.generate-pane__columns td { height: 24px; padding: 0 8px; border-bottom: 1px solid var(--wc-border-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; text-align: left; }
.generate-pane__columns th { color: var(--wc-text-secondary); font-weight: 600; }
.generate-pane__raw { color: var(--wc-text-muted); }
.generate-pane__pages { display: flex; gap: 6px; align-items: center; justify-content: flex-end; padding: 6px 8px; border-top: 1px solid var(--wc-border-subtle); font-size: 12px; color: var(--wc-text-secondary); font-variant-numeric: tabular-nums; }
.generate-pane__pages > span { margin-right: auto; }
.generate-pane__none { display: grid; gap: 4px; justify-items: start; padding: 12px; font-size: 12px; }
.generate-pane__none p { margin: 0; }
.generate-pane__skeleton { display: grid; border: 1px solid var(--wc-border-subtle); border-radius: 6px; }
.generate-pane__skeleton > .skeleton-bar { height: 12px; margin: 11px 12px; }
.generate-pane__skeleton.is-dense > .skeleton-bar { margin: 6px 12px; }
.generate-pane__note {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 16px;
}
.generate-pane__note p { margin: 0; }
.generate-pane__note > div { display: grid; gap: 6px; justify-items: start; }
.generate-pane__note > svg { margin-top: 0; }
.generate-pane__note.is-ok { background: color-mix(in srgb, var(--wc-status-success) 12%, var(--wc-bg-surface)); }
.generate-pane__note.is-ok > svg { color: var(--wc-status-success); }
.generate-pane__note.is-err { background: color-mix(in srgb, var(--wc-status-error) 10%, var(--wc-bg-surface)); }
.generate-pane__note.is-err > svg { color: var(--wc-status-error); }
.generate-pane__note.is-warn { background: color-mix(in srgb, var(--wc-status-warning-icon) 16%, var(--wc-bg-surface)); }
.generate-pane__reason { font-family: var(--wc-font-code); }
.generate-pane__actions { display: flex; flex-wrap: wrap; gap: 6px; }
.generate-pane__files { display: grid; margin: 0; padding: 0; list-style: none; border-top: 1px solid var(--wc-border-subtle); }
.generate-pane__file { border-bottom: 1px solid var(--wc-border-subtle); }
.generate-pane__file.is-waiting { display: grid; gap: 6px; padding: 10px 0; font-size: 12px; color: var(--wc-text-secondary); }
.generate-pane__file > details > summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 8px;
  padding: 8px 0;
  cursor: pointer;
  list-style: none;
}
.generate-pane__file > details > summary::-webkit-details-marker { display: none; }
.generate-pane__path { font-weight: 600; }
.generate-pane__status { display: inline-flex; gap: 4px; align-items: center; font-size: 12px; font-weight: 600; }
.generate-pane__status.is-ready { color: var(--wc-status-success); }
.generate-pane__status.is-clash { color: var(--wc-status-error); }
.generate-pane__status.is-check { color: var(--wc-status-warning); }
.generate-pane__counts { grid-column: 1 / -1; font-size: 12px; color: var(--wc-text-secondary); }
.generate-pane__file-body { display: grid; gap: 8px; padding: 0 0 12px; }
.generate-pane__yaml > summary { font-size: 12px; font-weight: 600; cursor: pointer; }
.generate-pane__yaml > summary span { font-weight: 400; color: var(--wc-text-secondary); }
.generate-pane__yaml-head { display: flex; justify-content: flex-end; margin-top: 6px; }
.generate-pane__yaml .cm-editor { max-height: none; margin-top: 6px; }
.generate-pane__left-title { margin: 0; font-size: 12px; font-weight: 600; }
.generate-pane__left { display: grid; margin: 0; padding: 0; list-style: none; border: 1px solid var(--wc-border-subtle); border-radius: 6px; }
.generate-pane__left > li { padding: 6px 8px; font-size: 12px; }
.generate-pane__left > li + li { border-top: 1px solid var(--wc-border-subtle); }
.generate-pane__left-name { font-weight: 600; }
.generate-pane__why { display: block; color: var(--wc-text-secondary); }
.generate-pane__every,
.generate-pane__footnote { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
.generate-pane__opened { display: grid; margin: 0; padding: 0; list-style: none; }
.generate-pane__opened > li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 34px; padding: 4px 12px; font-size: 12px; }
.generate-pane__opened > li + li { border-top: 1px solid var(--wc-border-subtle); }
.generate-pane__opened .btn-sm { margin-left: auto; }
.source-pane__outcome { font-size: var(--wc-text-sm-size); font-weight: 600; }
/* Nothing to say yet: mounted, so what it says next is announced, but unseen. */
.source-pane__outcome.is-empty { min-height: 0; margin: -16px 0 0; }
.source-pane__outcome.is-empty > * { display: none; }
.source-pane__summary { position: relative; }
.source-pane__edit {
  position: absolute;
  top: 0;
  right: 0;
  padding: 0;
  color: var(--wc-accent);
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}
.source-pane__result { display: flex; align-items: center; gap: 4px; color: var(--wc-status-success); font-weight: 600; }
/* Said in words with an icon, never by colour alone (rule 3). */
.source-pane__alert,
.source-pane__changed,
.source-pane__rule,
.connection-form__caution,
.connection-form__info {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: var(--wc-text-xs-size);
  line-height: 18px;
  color: var(--wc-text-primary);
}
.source-pane__alert { background: color-mix(in srgb, var(--wc-status-error) 10%, var(--wc-bg-surface)); }
.source-pane__changed,
.connection-form__caution { background: color-mix(in srgb, var(--wc-status-warning-icon) 16%, var(--wc-bg-surface)); }
.source-pane__rule,
.connection-form__info { background: var(--wc-bg-accent-soft); }
.source-pane__summary { display: grid; gap: 0; margin: 0; padding: 0; border: 0; min-width: 0; }
.source-pane__summary dl {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
  font-size: var(--wc-text-xs-size);
}
.source-pane__summary dt { color: var(--wc-text-secondary); }
.source-pane__summary dd { margin: 0; overflow-wrap: anywhere; }
.source-pane__test,
.source-pane__name { display: grid; gap: 16px; }
.source-pane__last { display: grid; gap: 4px; }
/* The discard question, inside the pane, over it (state I, rule 85). */
.source-pane__veil {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--wc-text-primary) 28%, transparent);
}
.source-pane__ask {
  display: grid;
  gap: 8px;
  max-width: 400px;
  padding: 20px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 8px;
  background: var(--wc-bg-raised);
  box-shadow: var(--wc-shadow-pop);
}
.source-pane__ask h3 { margin: 0; font-size: 16px; font-weight: 600; }
.source-pane__ask p { margin: 0; font-size: var(--wc-text-sm-size); color: var(--wc-text-secondary); }
.source-pane__ask-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.btn-danger { border-color: var(--wc-status-error); color: var(--wc-status-error); }
/* The type tiles: a mark, the name and the ways to sign in (state A). */
.type-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.type-tile {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 64px;
  padding: 10px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  text-align: left;
}
.type-tile[aria-checked='true'] {
  border-color: var(--wc-accent);
  box-shadow: 0 0 0 1px var(--wc-accent);
  background: var(--wc-bg-accent-soft);
}
.type-tile__text { display: grid; gap: 2px; }
.type-tile__name { font-size: var(--wc-text-sm-size); font-weight: 600; color: var(--wc-text-primary); }
.type-tile__ways { font-size: var(--wc-text-xs-size); line-height: 16px; color: var(--wc-text-secondary); }
.source-pane__types { display: grid; gap: 8px; }
.driver-mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-primary);
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
}

/* A connection's three groups (design 02): where it connects, how it signs
   in, TLS — each under a small capitalised heading, a rule between them. */
.connection-form { display: grid; gap: 16px; min-width: 0; }
.connection-form__group { display: grid; gap: 12px; min-width: 0; margin: 0; padding: 0; border: 0; }
.connection-form__group + .connection-form__group,
.connection-form > .connection-form__group + fieldset {
  padding-top: 16px;
  border-top: 1px solid var(--wc-border-subtle);
}
.connection-form__legend {
  float: none;
  margin: 0;
  padding: 0;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--wc-text-secondary);
}
/* Floated, a legend is laid out as the group's first row rather than drawn
   on its top border, which a rule between groups would run through. */
fieldset > .connection-form__legend { float: left; width: 100%; }
.connection-form__pair { display: grid; grid-template-columns: minmax(0, 1fr) 96px; gap: 12px; }
.connection-form .field,
.source-pane .field { display: grid; gap: 4px; min-width: 0; }
.connection-form .field > label,
.connection-form .field > .field__label,
.source-pane .field > label,
.source-pane .field__label {
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
  /* Designs 01, 02, 03 and 13's .field > label, and their .req (T476's review). */
  color: var(--wc-text-secondary);
}
.field__req { font-weight: 400; color: var(--wc-text-muted); }
/* Design 16's .req is text-secondary, beside its text-primary label. */
.schedule-form .field__req { color: var(--wc-text-secondary); }
.connection-form input:not([type='checkbox']),
.source-pane .field input:not([type='checkbox']) { width: 100%; height: 32px; }
.connection-form textarea { width: 100%; }
.is-code,
.connection-form .is-code { font-family: var(--wc-font-code); font-size: 12px; }
.connection-form [aria-invalid='true'],
.source-pane [aria-invalid='true'] { border-color: var(--wc-status-error); }
.field__error,
.field__warning { display: flex; align-items: flex-start; gap: 4px; font-size: var(--wc-text-xs-size); line-height: 16px; }
.field__error { color: var(--wc-status-error); }
.field__warning { color: var(--wc-status-warning); }
.connection-form__method { margin: 0; font-size: var(--wc-text-sm-size); }
.connection-form__aside { font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.connection-form__note,
.dialog p.connection-form__note { margin: 0; font-size: var(--wc-text-xs-size); line-height: 16px; color: var(--wc-text-secondary); }
/* Secrets: a lock in the field, one line for the group (UX-212). */
.secret-input { position: relative; display: block; }
/* As specific as the base input rule it has to outrank for its padding. */
.connection-form .secret-input > input:not([type='checkbox']):not([type='radio']):not([type='file']) {
  padding-left: 28px;
}
.secret-pasted__lock {
  display: inline-block;
  flex: none;
  width: 12px;
  height: 12px;
  background: var(--wc-text-secondary);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z'/%3E%3C/svg%3E") center / contain no-repeat;
}
.secret-input > .secret-pasted__lock { position: absolute; left: 10px; top: 10px; }
.secret-pasted {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 6px 10px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  font-family: var(--wc-font-code);
  font-size: 12px;
}
.secret-pasted > .link-button { margin-left: auto; color: var(--wc-accent); font-family: inherit; }
.connection-form__sealed { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.connection-form__sealed::before {
  content: '';
  flex: none;
  width: 12px;
  height: 12px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z'/%3E%3C/svg%3E") center / contain no-repeat;
}
.connection-form__add { justify-self: start; color: var(--wc-accent); font-weight: 600; }
/* A form's links as design 01's .btn.link: 12/600 in the accent, no box
   (01:90; T698, SRC-11): Replace, Change type, Add a CA certificate. */
.connection-form .link-button,
.source-pane .link-button.source-pane__link {
  padding: 0;
  color: var(--wc-accent);
  font-size: 12px;
  font-weight: 600;
}
/* Choices seen at once: segmented for two, rows for three, cards where each
   needs saying (design 02, pins 1 and 3). */
/* Design 01–03's .seg: 28 px options in a 1 px border, so 30 outside, at 12 (T698, SRC-15). */
.choice--segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  overflow: hidden;
}
.choice--segmented > .choice__option {
  min-height: 0;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-left: 1px solid var(--wc-border-subtle);
  border-radius: 0;
  background: var(--wc-bg-surface);
  font-size: var(--wc-text-xs-size);
}
.choice--segmented > .choice__option:first-child { border-left: 0; }
.choice--segmented > .choice__option[aria-checked='true'] {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: 600;
}
.choice--rows { display: grid; border: 1px solid var(--wc-border-strong); border-radius: 6px; overflow: hidden; }
.choice--rows > .choice__option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
  padding: 6px 12px;
  border: 0;
  border-top: 1px solid var(--wc-border-subtle);
  border-radius: 0;
  background: var(--wc-bg-surface);
  text-align: left;
  font-size: var(--wc-text-sm-size);
}
.choice--rows > .choice__option:first-child { border-top: 0; }
.choice--rows > .choice__option[aria-checked='true'] { background: var(--wc-bg-accent-soft); font-weight: 600; }
.choice--cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.choice--cards > .choice__option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  text-align: left;
}
.choice--cards > .choice__option[aria-checked='true'] {
  border-color: var(--wc-accent);
  box-shadow: 0 0 0 1px var(--wc-accent);
  background: var(--wc-bg-accent-soft);
}
.choice__mark {
  flex: none;
  width: 14px;
  height: 14px;
  margin-top: 2px;
  border: 1.5px solid var(--wc-border-strong);
  border-radius: 999px;
  background: var(--wc-bg-surface);
}
.choice__option[aria-checked='true'] > .choice__mark { border: 4px solid var(--wc-accent); }
.choice--rows .choice__mark { margin-top: 0; }
.choice__text { display: grid; gap: 2px; }
.choice__label { font-size: var(--wc-text-sm-size); font-weight: 600; }
.choice__description { font-size: var(--wc-text-xs-size); line-height: 16px; color: var(--wc-text-secondary); }
/* A boolean as the prototype's .switch, its words beside it, its default under. */
.switch-row { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 10px; row-gap: 2px; align-items: center; }
.switch-row > label { font-size: var(--wc-text-sm-size); color: var(--wc-text-primary); }
.switch-row__help { grid-column: 2; font-size: var(--wc-text-xs-size); line-height: 16px; color: var(--wc-text-secondary); }
input.switch {
  appearance: none;
  -webkit-appearance: none;
  flex: none;
  width: 32px;
  height: 18px;
  margin: 0;
  border: 0;
  border-radius: 999px;
  background: radial-gradient(circle at 9px 50%, var(--wc-bg-surface) 7px, transparent 7.5px),
    var(--wc-border-strong);
  cursor: pointer;
}
input.switch:checked {
  background: radial-gradient(circle at 23px 50%, var(--wc-bg-surface) 7px, transparent 7.5px),
    var(--wc-accent);
}
input.switch:disabled { opacity: 0.55; cursor: not-allowed; }
input.switch:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
/* Each check Cube runs (AC-159): listed before it runs, its outcome and time
   after, a failed one opened in place with Cube's own words (states C–F). */
.connection-checks { display: grid; margin: 0; padding: 0; list-style: none; }
.connection-checks__check { padding: 8px 0; border-top: 1px solid var(--wc-border-subtle); }
.connection-checks__check:first-child { border-top: 0; }
.connection-checks__row { display: flex; align-items: center; gap: 8px; font-size: var(--wc-text-sm-size); }
.connection-checks__row > svg { flex: none; }
/* Not run yet: design 01's and 03's s-pend, a dashed circle in border-strong (T698, SRC-09). */
.connection-checks__row > svg[data-icon='draft'] { color: var(--wc-border-strong); }
.connection-checks__time { margin-left: auto; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.connection-checks__check.is-passed .connection-checks__row > svg { color: var(--wc-status-success); }
.connection-checks__check.is-failed .connection-checks__label { font-weight: 600; }
.connection-checks__check.is-skipped,
.connection-checks__check.is-not-run,
.connection-checks__check.is-waiting { color: var(--wc-text-secondary); }
.connection-checks__failure { display: grid; gap: 6px; margin: 6px 0 0 24px; font-size: var(--wc-text-xs-size); line-height: 16px; color: var(--wc-text-secondary); }
.connection-checks__failure p { margin: 0; }
.connection-checks__failure pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-primary);
  font-family: var(--wc-font-code);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.connection-checks__fixes { display: flex; gap: 12px; }
.connection-checks__fixes .link-button { padding: 0; color: var(--wc-accent); font-weight: 600; }
/* The target folder as a tree (state G). */
.target-tree {
  display: grid;
  gap: 2px;
  max-height: 240px;
  margin: 0;
  padding: 4px;
  overflow: auto;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  list-style: none;
}
.target-tree__item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding-right: 8px;
  border-radius: 4px;
  font-size: var(--wc-text-sm-size);
  cursor: pointer;
}
.target-tree__item[aria-selected='true'] { background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: 600; }
.target-tree__item[aria-disabled='true'] { color: var(--wc-text-secondary); cursor: default; }
.target-tree__item:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: -2px; }
.target-tree__icon { flex: none; width: 14px; height: 11px; border: 1.5px solid currentColor; border-radius: 2px; }
/* Narrower than 1,024 px, a sheet over the page (state K): the rail in a line. */
@media (max-width: 1023.98px) {
  .source-pane {
    position: fixed;
    inset: var(--wc-app-bar-height) 0 0 0;
    /* Its insets set its height: the docked pane's 100% would be the window's,
       starting under the app bar, and push its foot out of view (T496). */
    height: auto;
    z-index: 40;
    border-left: 0;
  }
  .source-pane__rail ol { display: none; }
  .source-pane__rail-short { display: flex; }
  /* The sheet's actions are Back and the primary; × in its head closes it, and ‹ steps back (state K). */
  .source-pane__cancel { display: none; }
  .source-pane__head-back { display: inline-block; }
  .admin-page--docked { grid-template-columns: minmax(0, 1fr); }
  .explore--source { grid-template-columns: minmax(0, 1fr); }
  /* Export too: a sheet over the page, which keeps its width (design 13's table). */
  .explore--export,
  .explore--importing { grid-template-columns: minmax(0, 1fr); }
  .export-pane--over { width: auto; }
  main:has(.export-pane--over) { padding-right: 0; }
  /* Generate cubes covers the page, as design 01's pane does (design 11 pin 1). */
  .model-page.model-page--generating { grid-template-columns: minmax(0, 1fr); }
  /* The request goes under the editor (T384). */
  .model-page.model-page--request { grid-template-columns: minmax(0, 1fr); }
}
.info-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 720px;
  padding: 8px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-accent-soft);
  color: var(--wc-text-primary);
  /* At 12/16, as every design's .notebar (T698, SRC-18). */
  font-size: 12px;
  line-height: 16px;
}
.info-bar p { margin: 0; }
/* Bold in a note at 600, not the browser's 700 (direction §3; data-sources-Q4). */
.info-bar b,
.info-bar strong,
.source-settings__changed b { font-weight: 600; }
/* The note's "i" in the accent, as the prototype draws it (T466's review). */
svg[data-icon='info'] { flex: none; margin-top: 1px; color: var(--wc-accent); }

.folder-contents__empty,
.query-log__empty { color: var(--wc-text-secondary); }
/* Explore's rows as browse()'s .grid-table.comfy (T244): 28 px for the header
   and 34 for a row — a dashboard's description line included — their cells
   0 by 8 (mismatches 15–16). The heights are the rows', not the cells': on a
   cell, Chrome drew its rule beneath the height rather than within it. */
.folder-contents thead tr { height: 28px; }
.folder-contents tbody tr { height: 34px; }
.folder-contents th,
.folder-contents td { padding: 0 8px; white-space: nowrap; }
/* .grid-table th { position: sticky; top: 0 }: the header stays while the
   list scrolls beneath it (F23). */
.folder-contents thead th { position: sticky; top: 0; z-index: 1; }
/* Empty, a centred 120 px row under the header (F24, F25). */
.folder-contents tbody tr.folder-contents__empty-row { height: 120px; cursor: auto; }
.folder-contents td.folder-contents__empty { text-align: center; }
/* A row's name with its type's chip, as the prototype's browse() draws it;
   its actions behind a ⋯ menu at the end (AC-193). At 16 px a line, so a
   name over its description fits the 34 px row. */
.folder-contents__name {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  line-height: var(--wc-text-xs-line);
}
/* The name: .strong, the row being what opens it (N11) — a button for the
   keyboard, drawn as the prototype's text. */
.folder-contents__open {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: var(--wc-text-xs-strong-weight);
  line-height: var(--wc-text-xs-line);
  text-align: left;
}
.folder-contents__open:hover:not(:disabled):not([aria-disabled='true']) { background: none; }
/* Type .sec; Built on .muted, .sec or .mono by kind (N2, mismatches 18–19). */
.folder-contents td.folder-contents__type,
.folder-contents td.is-secondary { color: var(--wc-text-secondary); }
.folder-contents td.is-muted { color: var(--wc-text-muted); }
.folder-contents td.is-code { font-family: var(--wc-font-code); }
.folder-contents__actions { width: 1%; white-space: nowrap; text-align: right; }
.folder-contents__rename { display: flex; gap: 4px; align-items: center; }
/* Under a workspace item's name, where it goes (design 04, pin 3). */
.folder-contents__origin {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  font-weight: 400;
  color: var(--wc-text-secondary);
}
.folder-contents__origin > svg { flex: none; }
/* Its status, icon and label, 12/600 as design 04's .status (pin 4). */
.folder-contents__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.folder-contents__status > svg { flex: none; }
/* A dashboard's description beneath its name (AC-197): the prototype's
   second line, 12 px muted. */
.folder-contents__description {
  display: block;
  padding: 0;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-weight);
  color: var(--wc-text-muted);
}
/* A folder's, clamped to one line (design 14, P1). */
.folder-contents__description.is-one-line {
  max-width: 60ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The Jobs workspace's tabs, and its pre-aggregations with their builds (T155). */
/* Tabs on the page ground, not on a band of their own (T466, UX-109). */
.jobs-workspace__tabs { margin-bottom: 12px; background: none; }
/* Its header: the title, then Cube's health and the refresh worker's (T162). */
.jobs-workspace__head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
/* What needs attention in the user's folders, each count a link (T558; design 16, P5). */
.jobs-summary { font-size: 12px; color: var(--wc-text-secondary); font-variant-numeric: tabular-nums; }
.jobs-health { display: flex; flex-wrap: wrap; gap: 12px; }
/* The refresh worker's badge opens its panel (T553; design 16, state F). */
.jobs-health__worker {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--wc-text-secondary);
  cursor: pointer;
}
.jobs-health__worker:hover { background: var(--wc-bg-subtle); }
/* Its panel, a non-modal popover under the badge, over the page (design 16's keyboard table; T611). */
.jobs-health__anchor { position: relative; display: inline-flex; }
.refresh-worker-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  width: min(560px, calc(100vw - 32px));
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  box-shadow: var(--wc-shadow-pop);
}
/* A token's copy, beside it (design 16, state C; T611). */
.build-queue__copy { margin-left: 4px; padding: 0 4px; vertical-align: middle; color: var(--wc-text-secondary); }
.refresh-worker-panel__head { display: flex; align-items: baseline; gap: 8px; }
.refresh-worker-panel__head h2 { margin: 0; font-size: 14px; font-weight: 600; }
.refresh-worker-panel__revision { margin-left: auto; font-size: 12px; color: var(--wc-text-secondary); }
/* F3's status lines, each with its icon (J1; T614). */
.refresh-worker-panel__line { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: 12px; }
.refresh-worker-panel__line > svg { flex: none; margin-top: 1px; }
.refresh-worker-panel h3 { margin: 4px 0 0; font-size: 12px; font-weight: 600; }
.refresh-worker-panel__error {
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  font: 12px/16px var(--wc-font-code);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
/* The list beside the prototype's docked 400 px pane (AC-228), which is
   placed below (T469, UX-081): it runs the window's height under the app bar,
   stays put while the list scrolls, and scrolls on its own. */
.build-panel { display: grid; gap: 16px; align-items: start; }
.build-panel__list { display: grid; gap: 12px; min-width: 0; }
.build-panel__row { cursor: pointer; }
/* A folder's rollup, under its short name: its folder (T371; §P2.6 D). */
.build-panel__folder, .schedules__folder { display: block; font-size: 12px; color: var(--wc-text-secondary); }
.build-panel__row[aria-selected='true'] { background: var(--wc-bg-accent-soft); }
.admin-pane {
  position: sticky;
  /* Where it starts on the page (set by the pane), else below the app bar. */
  top: var(--pane-top, calc(var(--wc-app-bar-height) + var(--wc-surface-padding)));
  box-sizing: border-box;
  /* Down to within 16 px of the window's foot, however wide the page's
     gutters are (T466): a docked pane runs the window's height. */
  height: calc(
    100vh - var(--pane-top, calc(var(--wc-app-bar-height) + var(--wc-surface-padding))) - 16px
  );
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 12px 16px;
  overflow: auto;
  border-left: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
.admin-pane__empty { margin: 0; color: var(--wc-text-secondary); }
/* Jobs' pane docked as the prototype's (T469, UX-081): under the app bar at
   the window's right edge, its full height, 400 px, with the list beside it
   rather than under it; its 44 px head holds the pre-aggregation's name. */
.build-panel { grid-template-columns: minmax(0, 1fr); }
.jobs-workspace:has(> [role='tabpanel']:not([hidden]) .build-panel) { margin-right: 400px; }
.build-panel .admin-pane {
  position: fixed;
  top: var(--wc-app-bar-height);
  right: 0;
  bottom: 0;
  width: 400px;
  height: auto;
  padding: 0 16px 16px;
}
.build-panel .admin-pane > .admin-pane__empty { padding-top: 12px; }
.admin-pane__head {
  display: flex;
  align-items: center;
  /* At least, as the prototype's: a long name wraps, and the head grows. */
  min-height: 44px;
  margin: 0 -16px;
  padding: 0 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
/* The query log (AC-230): the prototype's filter row of small selects, a
   header kept in view under the app bar while the rows scroll, and a pager. */
/* One column as wide as the page leaves it, not as its table (T396, AC-304). */
.query-log-view { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
.query-log__filters { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.query-log__filters label { color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); }
/* Data sources (T364): a health's time, quieter than its words, and the
   page with none to list, its note and the way to Explore under it. */
.status__when { font-weight: 400; color: var(--wc-text-secondary); }
.sources-empty { display: grid; gap: 8px; justify-items: start; }
.sources-muted { color: var(--wc-text-secondary); }
/* The list as design 01 (2026-09-27) draws it (T496): filter pills, names in
   the code face, Used by as a count with its cubes one step away. */
.sources-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
/* 28 px, as the pills beside it, over the global 32 px input (T496's review). */
.sources-filters input.sources-filters__search:not([type='checkbox']):not([type='radio']):not([type='file']) {
  width: 220px;
  height: 28px;
  padding-left: 27px;
  font-size: 12px;
}
/* The search's icon at its head (01:135; T698, SRC-17). */
.sources-filters__find { position: relative; display: inline-block; }
.sources-filters__find > svg { position: absolute; top: 7px; left: 9px; color: var(--wc-text-muted); pointer-events: none; }
/* The table's links in the accent, no underline (01:236; SRC-17). */
.sources-folder a { color: var(--wc-accent); text-decoration: none; }
.sources-folder a:hover { text-decoration: underline; }
/* With none yet, design 14's empty-folder line as the table's one row (data-sources-Q3). */
.query-log td.sources-empty-row {
  height: 34px;
  color: var(--wc-text-secondary);
  font-size: 14px;
  text-align: left;
}
.select-pill {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 28px;
  padding: 0 4px 0 10px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: 12px;
}
/* Its value bold at 12 px, as "Folder All" is drawn; focus keeps the app's own ring. */
.select-pill select {
  height: 26px;
  border: 0;
  background: transparent;
  color: var(--wc-text-primary);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
}
.query-log td.sources-name { font-weight: 600; }
/* A name opens its page, read as a name: no underline until pointed at (design 01's list). */
.sources-name a { color: var(--wc-text-primary); text-decoration: none; }
.sources-name a:hover { text-decoration: underline; }
.query-log :is(th, td).sources-num { text-align: right; }
.sources-used-by { display: inline-block; }
.sources-used-by__count { font-variant-numeric: tabular-nums; }
/* Fixed to the window under its count, placed as it opens, so no scrolling table cuts it off. */
.sources-used-by__tip {
  position: fixed;
  z-index: 60;
  display: block;
  width: max-content;
  max-width: 360px;
  padding: 8px 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-raised, var(--wc-bg-surface));
  box-shadow: var(--wc-shadow-pop, 0 4px 12px rgba(0, 0, 0, 0.15));
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  white-space: normal;
}
.sources-used-by__tip[hidden] { display: none; }
/* A stored data source's settings (T462; design 03 of 2026-09-27): its
   breadcrumb, a head with its name in the code face, its type and state, a
   line of where it is and how it is, then five tabs on one card. */
.source-settings { display: grid; gap: 10px; align-content: start; min-width: 0; }
/* Its head as design 03's .pagehead (T698, SRC-07): one white band across
   the page holding the crumbs, the head and its lines, the tabs edge to edge
   at its foot; the chosen tab's panel on white under it. */
.source-settings__pagehead {
  display: grid;
  gap: 8px;
  margin: 0 calc(-1 * var(--wc-surface-padding));
  padding: 12px var(--wc-surface-padding) 0;
  background: var(--wc-bg-surface);
}
.source-settings > .source-settings__pagehead:first-child { margin-top: calc(-1 * var(--wc-surface-padding)); }
.source-settings > .workspace-band + .source-settings__pagehead,
.source-settings > .proposal-band + .source-settings__pagehead { margin-top: -10px; }
.source-settings__pagehead > .source-settings__tabs {
  margin: 4px calc(-1 * var(--wc-surface-padding)) 0;
  padding: 0 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.source-settings__pagehead + .source-settings__panel,
.source-settings__pagehead ~ .source-settings__panel {
  margin: 0 calc(-1 * var(--wc-surface-padding));
  padding: 16px var(--wc-surface-padding);
  background: var(--wc-bg-surface);
  border-bottom: 1px solid var(--wc-border-subtle);
}
.source-settings__pagehead + .source-settings__panel { margin-top: -10px; }
/* Beside an open History, the band stops at the page's column. */
.with-panel[data-open='true'] .source-settings__pagehead,
.with-panel[data-open='true'] .source-settings__pagehead ~ .source-settings__panel { margin-right: 0; }
.with-panel[data-open='true'] .source-settings__pagehead > .source-settings__tabs { margin-right: 0; }
/* The item's mark, "◍" at 28 px (03:125; data-sources-Q6). */
.itemicon.source-settings__mark { width: 28px; height: 28px; border-radius: 6px; font-size: 14px; font-weight: 600; }
/* The head's badges (03:95–97; SRC-06): 22 px at 12/400 on bg-subtle, the
   driver's outlined in border-strong. */
.source-settings__pagehead .badge {
  gap: 4px;
  height: 22px;
  border: 0;
  background: var(--wc-bg-subtle);
  font-weight: 400;
}
.source-settings__pagehead .badge.line { border: 1px solid var(--wc-border-strong); background: none; }
.source-settings__pagehead .badge > svg { flex: none; }
.source-settings__crumbs { color: var(--wc-text-secondary); font-size: 12px; line-height: 16px; }
.source-settings__crumbs a { color: var(--wc-text-secondary); text-decoration: none; }
.source-settings__crumbs a:hover { text-decoration: underline; }
.source-settings__crumbs [aria-current='page'] { color: var(--wc-text-primary); }
.source-settings__head { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
.source-settings__name { margin: 0; font-size: 20px; line-height: 26px; font-weight: 600; }
.source-settings__spacer { flex: 1; }
.source-settings__line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  align-items: center;
  color: var(--wc-text-secondary);
  font-size: 12px;
  line-height: 16px;
}
.source-settings__target b { color: var(--wc-text-primary); font-weight: 600; }
.source-settings__card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.source-settings__tabs { padding: 0 8px; }
.source-settings__panel { min-width: 0; padding: 16px; }
.source-settings__rows {
  display: grid;
  grid-template-columns: minmax(120px, 180px) minmax(0, 1fr);
  gap: 10px 16px;
  margin: 0;
  font-size: 14px;
  line-height: 20px;
}
.source-settings__rows dt { color: var(--wc-text-secondary); font-size: 12px; }
.source-settings__rows dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.source-settings__stored {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: 12px;
  line-height: 20px;
}
.source-settings__none { margin: 0; color: var(--wc-text-secondary); font-size: 12px; line-height: 16px; }
.source-settings__failure { display: block; margin-top: 4px; color: var(--wc-text-secondary); font-size: 12px; }
.source-settings__error {
  display: block;
  margin-top: 4px;
  padding: 6px 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  font: 12px/18px var(--wc-font-code);
  white-space: pre-wrap;
}
.source-settings__checks { display: inline-flex; gap: 2px; }
/* Changing it (T497; design 03 pins 5–10): the form, "Test to save" beside it,
   changed fields tinted with their old value, and a bar under the card. */
/* Test to save beside the form at 420 px on white (03:202, 228; T698, SRC-09). */
.source-settings__edit {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 0;
  margin: -16px calc(-1 * var(--wc-surface-padding));
}
.source-settings__form { display: grid; gap: 16px; align-content: start; min-width: 0; padding: 16px; }
.source-settings__test {
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 16px;
  border-left: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
/* Test connection as wide as its words (03:242). */
.source-settings__test > .btn { justify-self: start; }
/* Its checks as design 03's .chk rows: at least 30 px, a rule between. */
.source-settings__test .connection-checks__check { padding: 0; }
.source-settings__test .connection-checks__row { min-height: 30px; }
@media (max-width: 1023.98px) {
  .source-settings__edit { grid-template-columns: minmax(0, 1fr); }
  .source-settings__test { border-left: 0; border-top: 1px solid var(--wc-border-subtle); }
}
/* The editor as design 03 groups it (03:204–225; SRC-08): the type a section
   of its own, a 220 px locked field with its help to its right; rows to
   680 px, Port 110; the sign-in segment 320; TLS's switches side by side,
   the CA certificate's link beside them. */
.source-settings__type {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 10px 12px;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.source-settings__type-label { grid-column: 1 / -1; }
.source-settings__type-value {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
}
.source-settings__form .connection-form__pair { grid-template-columns: minmax(0, 1fr) 110px; max-width: 680px; }
.source-settings__form .connection-form .field { max-width: 680px; }
.source-settings__form .choice--segmented { width: 320px; max-width: 100%; }
.source-settings__form .connection-form__tls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 32px;
  align-items: center;
}
.source-settings__form .connection-form__tls > :not(.switch-row):not(.connection-form__add) { flex-basis: 100%; }
.source-settings__form .connection-form__tls > .switch-row { flex: 0 1 280px; align-self: start; }
.source-settings__form .connection-form__tls > .connection-form__add { align-self: start; margin-top: 1px; }
.source-settings__changed {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--wc-status-warning-icon) 40%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--wc-status-warning-icon) 12%, var(--wc-bg-surface));
  font-size: 12px;
  line-height: 16px;
}
.source-settings__changed p { margin: 0; }
.source-settings__changes { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: 12px; }
.source-settings__checks-title { margin: 6px 0 0; color: var(--wc-text-secondary); font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.source-settings__general { display: grid; gap: 14px; max-width: 520px; margin-bottom: 16px; }
/* A description keeps the lines it was written in (T499). */
.source-settings__description { white-space: pre-line; }
/* The save bar pinned across the window's foot, as design 03's .formbar
   (03:135, 247; T698, SRC-10); the page keeps room for it at its end. */
.source-settings__foot {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  padding: 10px 24px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
.source-settings:has(> .source-settings__foot) { padding-bottom: 64px; }
.source-settings__count { color: var(--wc-text-secondary); font-size: 12px; }
.source-settings__dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--wc-accent);
  vertical-align: middle;
}
/* A field changed from what is stored: tinted, its old value under it (pin 6). */
.field.is-changed input,
.field.is-changed textarea {
  border-color: var(--wc-accent);
  background: var(--wc-bg-accent-soft);
}
.field__was { color: var(--wc-text-secondary); font-size: 12px; line-height: 16px; }
.field__was s { color: var(--wc-text-muted); }
/* A switch changed from what is stored: its track tinted as a changed field's
   border is, "Was on" or "Was off" under it (pin 6). */
.switch-row.is-changed input.switch { box-shadow: 0 0 0 2px var(--wc-bg-accent-soft); }
/* A stored secret, never drawn: said kept, with Replace (state D). */
.secret-kept { font-family: inherit; font-size: var(--wc-text-sm-size); color: var(--wc-text-secondary); }
/* As design 03's .input.stored (03:80; T698, SRC-11): a 32 px field on
   bg-subtle, its border subtle, Replace at its end. */
.secret-pasted.secret-kept {
  min-height: 0;
  height: 32px;
  padding: 0 8px;
  border-color: var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-primary);
}
.secret-replacing { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.secret-replacing > .link-button { color: var(--wc-accent); font-size: var(--wc-text-xs-size); }
/* A field a stored secret is bound to (AC-312): the link icon beside its label. */
.field__bound {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-left: 6px;
  vertical-align: -1px;
  background: var(--wc-text-muted);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M6.5 9.5l3-3'/%3E%3Cpath d='M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1'/%3E%3Cpath d='M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'%3E%3Cpath d='M6.5 9.5l3-3'/%3E%3Cpath d='M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1'/%3E%3Cpath d='M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1'/%3E%3C/svg%3E") center / contain no-repeat;
}
.source-settings__usage,
.source-settings__cube { display: grid; gap: 10px; }
.source-settings__veil {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 16px;
  background: color-mix(in srgb, var(--wc-text-primary) 28%, transparent);
}
.sources-used-by__tip ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.sources-footnote { margin: 0; color: var(--wc-text-secondary); font-size: 12px; line-height: 16px; }
.query-log--sticky thead th {
  position: sticky;
  top: var(--wc-app-bar-height);
  z-index: 2;
}
.sort-button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sort-button:hover { text-decoration: underline; }
.query-log__pager {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: flex-end;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
  font-variant-numeric: tabular-nums;
}
.admin-pane__title {
  margin: 0;
  font-family: var(--wc-font-code);
  font-size: var(--wc-text-sm-size);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.admin-pane__facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; margin: 0; }
.admin-pane__facts dt { color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); }
.admin-pane__facts dd { margin: 0; }
.admin-pane__actions { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }
@media (max-width: 1000px) {
  .build-panel { grid-template-columns: minmax(0, 1fr); }
  .admin-pane { position: static; height: auto; border-left: 0; }
  /* Narrow, Jobs' pane is under its list, not docked beside it. */
  .jobs-workspace:has(> [role='tabpanel']:not([hidden]) .build-panel) { margin-right: 0; }
  .build-panel .admin-pane { position: static; width: auto; }
}
/* Below 1,024 px (T560; design 16, state G8): each list keeps its name, its
   folder and its state, one row each, the rest moving into the sheet; the
   pane is a full-screen sheet over the list, as designs 01, 11 and 13 have
   it, and × goes back. Nothing is taken away. */
@media (max-width: 1023.98px) {
  .jobs-wide { display: none; }
  /* Pre-aggregations' rows stacked, as G8 draws them: the name, its folder
     under it, then its state; no header row, its heads a reader's (J2, the
     user's call R76; T614). Its roles are set on it, so it reads as a table. */
  .build-panel__table,
  .build-panel__table > tbody,
  .build-panel__table > tbody > tr,
  .build-panel__table > tbody > tr > td:not(.jobs-wide) { display: block; }
  .build-panel__table > .build-panel__heads {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .build-panel__table > tbody > tr {
    padding: 8px 12px;
    border-bottom: 1px solid var(--wc-border-subtle);
  }
  .build-panel__table > tbody > tr > td { height: auto; padding: 1px 0; border: 0; }
  .build-panel__table > tbody > tr > [data-testid='preagg-folder'] {
    font-size: var(--wc-text-xs-size);
    color: var(--wc-text-secondary);
  }
  .jobs-workspace:has(> [role='tabpanel']:not([hidden]) .build-panel) { margin-right: 0; }
  .build-panel .admin-pane:has(> .admin-pane__empty) { display: none; }
  /* The sheet as the .source-pane sheets are (designs 01, 11 and 13; T640):
     over the page under the app bar, its head in place, only its body
     scrolling, and its actions pinned in its foot (.source-pane__foot),
     as G8 draws it ("its actions stay pinned at the bottom"). */
  .build-panel .admin-pane,
  .admin-page .schedules__pane {
    position: fixed;
    inset: var(--wc-app-bar-height) 0 0 0;
    width: auto;
    height: auto;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
    border-left: 0;
    overflow: hidden;
  }
  :is(.build-panel .admin-pane, .admin-page .schedules__pane) > .admin-pane__head {
    flex: none;
    margin: 0;
  }
  :is(.build-panel .admin-pane, .admin-page .schedules__pane) > :is(.admin-pane__body, .admin-pane__missing) {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px 16px;
  }
  :is(.build-panel .admin-pane, .admin-page .schedules__pane) > .source-pane__foot {
    flex: none;
    flex-wrap: wrap;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  }
  .source-pane__foot > .schedule-form__foot { flex: 1; padding-top: 0; border-top: 0; }
  /* As a sheet, × leads its head, back to the list (G8). */
  .admin-pane .admin-pane__close { order: -1; margin: 0 4px 0 -8px; }
  .admin-pane__facts.jobs-narrow { display: grid; }
  /* Wherever the wrapped header puts its badge, the popover is on screen, under the app bar (T611's review). */
  .refresh-worker-panel {
    position: fixed;
    top: calc(var(--wc-app-bar-height) + 8px);
    left: 16px;
    right: 16px;
    width: auto;
  }
  /* A toast over the sheet, above its pinned foot (T640's review): beside it, or in it (T611's review). */
  .sheet-over .undo-toast {
    z-index: 45;
    bottom: calc(var(--sheet-foot-height, 0px) + 16px);
  }
}
/* The sheet and what's said over it: one box for Tab, none for layout (T640). */
.sheet-over { display: contents; }
/* What scrolls under a pane's head: the sheet's body below 1,024 px (T640). */
.admin-pane__body { display: grid; gap: 12px; align-content: start; min-width: 0; }
/* A sheet's foot with nothing pinned in it is no bar at all (T610's review). */
.source-pane__foot:empty { display: none; }
/* The skeleton's bars under the list's heads (T610; G1). */
.jobs-skeleton__bar { display: block; height: 12px; width: 70%; border-radius: 3px; background: var(--wc-bg-subtle); }
.jobs-no-folder { justify-items: center; text-align: center; }
.jobs-no-folder svg, .run-history__empty > svg { color: var(--wc-text-muted); }
.build-panel__head { margin: 0; font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); font-weight: 600; }
.build-panel__builds,
.build-jobs__list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.build-jobs { display: grid; gap: 4px; }
.build-jobs__id { font-weight: 600; }
.build-jobs__job { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; font-size: 12px; }
.build-jobs__table { color: var(--wc-text-secondary); overflow-wrap: anywhere; }
.build-panel__note { margin: 8px 0 0; color: var(--wc-text-secondary); font-size: 12px; }
/* Run history and a build's log (T374; design 16, state B). */
.run-history__count { margin-left: auto; font-size: 12px; color: var(--wc-text-secondary); }
.run-history__table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.run-history__name { font-family: var(--wc-font-code); font-size: 12px; font-weight: 600; }
/* A row's name, a button read as the row is (design 16's keyboard table; T611): drawn as the name, no padding of a button's. */
.link-button.list-name { padding: 0 2px; margin: 0 -2px; }
.run-history__empty {
  display: grid;
  justify-items: center;
  gap: 6px;
  padding: 40px 20px;
  text-align: center;
  color: var(--wc-text-secondary);
  font-size: 12px;
  line-height: 16px;
}
.run-history__empty b { color: var(--wc-text-primary); font-size: 14px; line-height: 20px; }
.run-history .audit-trail__pager { justify-content: flex-start; align-items: center; }
.run-history__note { font-size: 12px; color: var(--wc-text-secondary); }
.owner { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; white-space: nowrap; }
/* Design 16's icons and styling (T613). An action's icon before its words. */
.action-icon { flex: none; }
button:has(> .action-icon) { display: inline-flex; gap: 6px; align-items: center; }
/* The header's badges as pills, as screen 1 draws them (its .hbadge). */
.jobs-health .jobs-badge {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  box-sizing: border-box;
  height: 28px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 999px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.jobs-health button.jobs-badge:hover:not(:disabled) { background: var(--wc-bg-subtle); }
/* A title in the UI face: a schedule's, New schedule; a rollup's stays in the code face. */
.admin-pane__title.admin-pane__title--ui { font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; }
/* G6's Not found: the search's icon over its words. */
.admin-pane__notfound { display: grid; justify-items: center; gap: 8px; padding: 24px 16px; text-align: center; }
.admin-pane__notfound > svg { color: var(--wc-text-muted); }
/* The cron read back, with its tick (pin 10); the refresh key's cube in its note (pin 12). */
.schedule-form__reading { display: flex; gap: 6px; align-items: flex-start; }
.schedule-form__reading > svg { margin-top: 2px; color: var(--wc-status-success); }
[data-testid='refresh-key-runs'] > svg { color: var(--wc-text-secondary); }
.schedules__change svg { vertical-align: -2px; margin-right: 6px; }
/* D4's clock change between dashed rules, tinted as its warning (its .dst). */
.schedules__runs > .schedules__change > span {
  margin: 2px 0;
  padding: 2px 0;
  border-top: 1px dashed color-mix(in srgb, var(--wc-status-warning-icon) 60%, transparent);
  border-bottom: 1px dashed color-mix(in srgb, var(--wc-status-warning-icon) 60%, transparent);
  font-weight: 600;
}
/* The worker badge's chevron in the secondary colour, as screen 1 draws it. */
.jobs-health .jobs-badge > svg:last-child { color: var(--wc-text-secondary); }
/* "Build of" in the UI face, the pre-aggregation in the code face (B1). */
.build-log__title code { font-family: var(--wc-font-code); }
/* A badge's "· last run 14:38", lighter (screen 1's .t). */
.status__detail { font-weight: 400; color: var(--wc-text-secondary); }
/* The pre-aggregation picker: its cube beside it, its names in the code face (pin 9). */
.schedule-form__picker { display: flex; gap: 8px; align-items: center; }
.schedule-form__picker > svg { flex: none; color: var(--wc-text-secondary); }
.schedule-form .field select.is-code { font: 400 13px var(--wc-font-code); }
@media (min-width: 1024px) {
  /* Schedules' pane docked at 400 px, as screen 2 draws it; a sheet below 1,024 px. */
  .admin-page--docked:has(.schedules__pane) { grid-template-columns: minmax(0, 1fr) 400px; }
  /* Its form's foot pinned to the pane's foot, as screen 2 draws it (pin 15). */
  .admin-page .schedules__pane { display: flex; flex-direction: column; }
  .admin-page .schedules__pane > .admin-pane__body { display: flex; flex: 1 0 auto; flex-direction: column; }
  .admin-page .schedules__pane .schedule-form { display: flex; flex: 1 0 auto; flex-direction: column; }
  .admin-page .schedules__pane .schedule-form__foot {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding-bottom: 4px;
    background: var(--wc-bg-surface);
  }
}
.owner svg { color: var(--wc-text-secondary); flex: none; }
.build-log__title code { font-size: 13px; }
.build-log__section { display: grid; gap: 6px; }
.build-log__section h3 {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.build-log__error,
.build-log__lines {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  font: 400 12px/18px var(--wc-font-code);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.build-log__lines { list-style: none; max-height: 320px; overflow: auto; }
.build-log__lines li { display: grid; grid-template-columns: max-content 1fr; gap: 10px; }
.build-log__time { color: var(--wc-text-secondary); }
.build-log__bad { color: var(--wc-status-error); }
.build-log__gap { color: var(--wc-text-muted); font-style: italic; }
.build-log__help { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.build-log__starter { margin: 0; }
/* The build queue (T376; design 16, state C), and its count on its tab (pin 1). */
.jobs-workspace__count {
  display: inline-block;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.build-queue { display: grid; gap: 10px; }
.build-queue__sub { display: block; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.build-queue__table code { font-size: 12px; }
/* Schedules' rows and pane (T551; design 16, screen 2 and D5): a line under
   each cell's first for as written, UTC and how long until; the key's block
   in the code face; the next runs as a grid of day, time and UTC. */
.schedules__sub { display: block; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
code.schedules__sub { font-family: var(--wc-font-code); }
.schedules__written {
  margin: 0;
  padding: 8px 10px;
  font-family: var(--wc-font-code);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-subtle);
}
.schedules__runs {
  display: grid;
  grid-template-columns: max-content max-content 1fr;
  gap: 2px 12px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-variant-numeric: tabular-nums;
}
.schedules__runs > li { display: contents; }
.schedules__utc { color: var(--wc-text-secondary); }
/* A clock change among a schedule's next runs, across the grid (design 16, D4). */
.schedules__change > span { grid-column: 1 / -1; color: var(--wc-status-warning); }
/* The page's head: its title, and New schedule at the far end (T552; screen 2, pin 1). */
.schedules__head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; }
/* A wechart schedule's form in the pane (T552; screen 2, pins 9–15): its
   fields stacked, labels over inputs, as the data source pane's are. */
.schedule-form { display: grid; gap: 12px; }
.schedule-form .field { display: grid; gap: 4px; min-width: 0; }
.schedule-form .field > label,
.schedule-form .field__label {
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
  color: var(--wc-text-primary);
}
.schedule-form .field input[type='text'],
.schedule-form .field select { width: 100%; height: 32px; box-sizing: border-box; }
/* The cron in the code face at 13 px, design 16's .input.mono (T476). */
.schedule-form .field input.is-code { font: 400 13px var(--wc-font-code); }
.schedule-form [aria-invalid='true'] { border-color: var(--wc-status-error); }
.schedule-form .field__help,
.schedule-form__foot > .help { margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.schedule-form__reading,
.schedule-form__each { margin: 0; font-size: var(--wc-text-sm-size); }
.schedule-form__choice { display: grid; gap: 4px; }
.schedule-form__choice > label { display: flex; gap: 6px; align-items: center; font-size: var(--wc-text-sm-size); }
/* Suspend after n failed runs in a row (T379; screen 2, pin 14): the number in the sentence. */
.schedule-form__limit { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: var(--wc-text-sm-size); }
.schedule-form__limit input { width: 64px; height: 28px; box-sizing: border-box; }
/* Failures in a row before the limit, in the warning's colour (E2); a resumed one said (E3). */
.schedules__failing { color: var(--wc-status-warning); font-weight: 600; }
.schedules__resumed { margin: 0; font-size: var(--wc-text-sm-size); }
.schedules__failed td { padding-top: 4px; padding-bottom: 4px; }
.schedule-form__foot {
  display: grid;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--wc-border-subtle);
}
.notebar {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-subtle);
  font-size: 12px;
  line-height: 16px;
}
.notebar--err { background: color-mix(in srgb, var(--wc-status-error) 9%, var(--wc-bg-surface)); }
.notebar b { font-weight: 600; }
/* The Security workspace (T171): its policies' table, and the note on phase 2. */
/* One column as wide as the page leaves it, not as its widest table: an
   implicit column took the tables' width, and the title and notes ran past a
   phone's screen with them (T396, AC-304). */
.security-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  align-content: start;
  min-width: 0;
}
.security-workspace__head { margin: 8px 0 0; font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); font-weight: 600; }
/* Security's tabs as places, design 08's .tabs: 36 px, 12/600, the current
   one underlined in the accent (T500, pin 1). */
.security-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--wc-border-subtle); }
.security-tabs > a {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 10px;
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
}
/* As design 08 spaces the page (T699, SEC-13): its title 14 px under the top
   bar, its parts 10 px apart; its note at 12/16 across the content (SEC-14);
   the policies' identifiers in the code face (SEC-15) and "No policy" in the
   secondary colour (SEC-16). */
.security-workspace--tabs { gap: 10px; margin-top: calc(14px - var(--wc-surface-padding)); }
.security-workspace--tabs .info-bar { max-width: none; font-size: 12px; line-height: 16px; }
.security-workspace td.is-code { font-family: var(--wc-font-code); font-size: 12px; }
.security-workspace td.policies__none { color: var(--wc-text-secondary); }
/* Preview as groups on its tab, the window's height under the tabs and never
   scrolling the page (T466's review; security-Q1): the pane takes what's left. */
.security-workspace--tabs:has(> .groups-preview) {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--wc-app-bar-height) - 14px - 16px);
}
.security-workspace--tabs > .groups-preview.admin-pane {
  position: static;
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
  overflow: auto;
}
/* Preview as groups' fields at 28/12, as design 08 draws them (CMP-08). */
.groups-preview input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']) {
  height: 28px;
  min-height: 28px;
  box-sizing: border-box;
  font-size: 12px;
}
.groups-preview h3 label { font: inherit; color: inherit; letter-spacing: inherit; }
.security-tabs > a:hover { color: var(--wc-text-primary); }
.security-tabs > a[aria-current='page'] { color: var(--wc-accent); border-bottom-color: var(--wc-accent); }

/* The audit trail (T369; design 08): the list, and beside it the open
   record's inspector, 360 px. */
.audit-trail { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
.audit-trail__list { display: grid; gap: 10px; min-width: 0; }
/* A SQL run's SQL, its literals replaced (T534; design 15, state J1): the code face, wrapped. */
.audit-trail__sql {
  margin: 0; padding: 6px 8px; font: 400 12px/18px var(--wc-font-code);
  background: var(--wc-bg-subtle); border: 1px solid var(--wc-border-subtle); border-radius: 4px;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.audit-trail__note { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }

/* The SQL tab (T535; design 15, screen 1): the editor and its result beside
   My runs, 320 px; the warning always above the editor. */
.sql-runner { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; position: relative; }
.sql-runner__main { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.sql-runner__line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.sql-runner__line b { font-weight: 600; color: var(--wc-text-primary); }
.sql-runner__spacer { flex: 1; }
.sql-runner__line .status { white-space: normal; }
.sql-runner__warning {
  display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 8px 12px;
  border-radius: 6px; font-size: 12px; line-height: 16px; color: var(--wc-text-primary);
  background: color-mix(in srgb, var(--wc-status-warning-icon) 14%, var(--wc-bg-surface));
  border: 1px solid color-mix(in srgb, var(--wc-status-warning-icon) 45%, var(--wc-bg-surface));
}
.sql-runner__warning b { font-weight: 600; }
.sql-runner__elsewhere {
  margin: 0; padding: 8px 12px; border-radius: 6px; font-size: 12px; line-height: 16px;
  background: var(--wc-bg-subtle); border: 1px solid var(--wc-border-subtle);
}
.sql-runner__failed { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-status-error); }
/* The editor, and the schema browser beside it (T539, design 15's P3). */
.sql-runner__work { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 10px; align-items: start; }
/* Cube Store's, with no catalog to browse beside it (T536). */
.sql-runner__work--alone { grid-template-columns: minmax(0, 1fr); }
.sql-schema {
  display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow: auto;
  padding: 10px 8px; border-radius: 6px;
  background: var(--wc-bg-surface); border: 1px solid var(--wc-border-subtle);
}
.sql-schema__top { display: flex; align-items: center; justify-content: space-between; margin: 0 4px; }
.sql-schema__head { margin: 0; font-size: 13px; line-height: 18px; font-weight: 600; }
.sql-schema__again { font-size: 14px; line-height: 18px; color: var(--wc-text-secondary); }
.sql-schema__sub, .sql-schema__none { margin: 0 4px; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.sql-schema ul { list-style: none; margin: 0; padding: 0; }
.sql-schema ul[role="group"] { padding-left: 14px; }
/* A tree, one stop in the tab order (T539's review): the row takes focus. */
.sql-schema [role="treeitem"] { outline: none; cursor: pointer; }
.sql-schema__row { display: flex; align-items: center; gap: 2px; min-height: 24px; padding: 0 4px 0 0; border-radius: 4px; }
.sql-schema__row:hover { background: var(--wc-bg-hover); }
.sql-schema [role="treeitem"]:focus-visible > .sql-schema__row { outline: 2px solid var(--wc-accent); outline-offset: -2px; }
.sql-schema__caret { flex: none; width: 16px; text-align: center; color: var(--wc-text-muted); }
.sql-schema__name {
  min-width: 0; padding: 2px; color: var(--wc-text-primary); font: 12px/16px var(--wc-font-code);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sql-schema__kind { flex: none; margin-left: auto; font: 11px/14px var(--wc-font-code); color: var(--wc-text-muted); }
/* A column's name keeps its room; a long type gives way, whole in its title. */
.sql-schema__type {
  flex: 0 1 auto; min-width: 0; margin-left: auto; padding-left: 6px;
  font: 11px/14px var(--wc-font-code); color: var(--wc-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[role="treeitem"][aria-level="3"] .sql-schema__name { flex: none; max-width: 100%; }
.sql-schema__link { color: var(--wc-accent); text-decoration: underline; }
.sql-schema__state { font-size: 12px; line-height: 20px; color: var(--wc-text-secondary); }
.sql-schema__failed-text { font-size: 12px; line-height: 16px; color: var(--wc-status-error); white-space: normal; }
.sql-schema__failed { display: grid; gap: 4px; justify-items: start; }
.sql-runner__editor {
  display: grid; gap: 10px; padding: 12px; border-radius: 6px;
  background: var(--wc-bg-surface); border: 1px solid var(--wc-border-subtle);
}
.sql-editor .cm-editor { min-height: 140px; max-height: 360px; }
.sql-editor .cm-placeholder { color: var(--wc-text-muted); }
.sql-runner__bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sql-runner__keys { display: inline-flex; gap: 4px; }
.sql-runner__keys kbd {
  font-size: 12px; font-weight: 600; line-height: 16px; padding: 0 5px; border-radius: 4px;
  border: 1px solid var(--wc-border-strong); border-bottom-width: 2px; background: var(--wc-bg-surface);
}
.sql-runner__limits { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
/* Cube Store's running run: no Cancel, said so (AC-379, R64). */
.sql-runner__note { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.sql-runner__empty { margin: 0; padding: 28px 16px; text-align: center; font-size: 12px; color: var(--wc-text-secondary); }
.sql-runner__turn-off { margin-left: 8px; }
.sql-runner__toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 80;
  display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 6px;
  background: var(--wc-text-primary); color: var(--wc-bg-surface); font-size: 14px;
}
.sql-runner__toast .btn-link { color: inherit; text-decoration: underline; }

/* A run's result (states B–E): its head, the grid scrolling both ways under its header. */
.sql-result {
  display: flex; flex-direction: column; min-width: 0; border-radius: 6px; overflow: hidden;
  background: var(--wc-bg-surface); border: 1px solid var(--wc-border-subtle);
}
.sql-result__head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-height: 40px; padding: 0 12px; border-bottom: 1px solid var(--wc-border-subtle); }
.sql-result__detail { font-size: 12px; color: var(--wc-text-secondary); font-variant-numeric: tabular-nums; }
.sql-result__spacer { flex: 1; }
.sql-result__note, .sql-result__cut { margin: 0; padding: 8px 12px; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.sql-result__note { border-bottom: 1px solid var(--wc-border-subtle); }
.sql-result__cut {
  color: var(--wc-status-warning); font-weight: 600;
  background: color-mix(in srgb, var(--wc-status-warning-icon) 10%, var(--wc-bg-surface));
}
.sql-result__scroll { overflow: auto; max-height: 480px; }
.sql-result__scroll:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: -2px; }
.sql-result__grid { border-collapse: separate; border-spacing: 0; min-width: 100%; font-size: 12px; font-variant-numeric: tabular-nums; }
.sql-result__grid th {
  position: sticky; top: 0; z-index: 1; text-align: left; vertical-align: top; white-space: nowrap;
  padding: 4px 10px; background: var(--wc-bg-subtle);
  border-bottom: 1px solid var(--wc-border-subtle); border-right: 1px solid var(--wc-border-subtle);
}
.sql-result__name { display: block; font-weight: 600; color: var(--wc-text-primary); }
.sql-result__type { display: block; font: 400 12px/16px var(--wc-font-code); color: var(--wc-text-secondary); }
.sql-result__grid td {
  height: 24px; padding: 0 10px; white-space: nowrap;
  border-bottom: 1px solid var(--wc-border-subtle); border-right: 1px solid var(--wc-border-subtle);
}
.sql-result__n { color: var(--wc-text-muted); text-align: right; width: 52px; }
.sql-result__grid .sql-result__num { text-align: right; }
.sql-result__null { color: var(--wc-text-muted); font-style: italic; }
.sql-result__empty { margin: 0; padding: 16px; font-size: 12px; color: var(--wc-text-secondary); }
.sql-result__error { margin: 0; padding: 8px 12px; font: 400 12px/18px var(--wc-font-code); white-space: pre-wrap; overflow-wrap: anywhere; }

/* While off (P1; G3): a panel, never a greyed-out tab. */
.sql-off {
  display: grid; gap: 12px; max-width: 680px; padding: 22px 24px; border-radius: 6px;
  background: var(--wc-bg-surface); border: 1px solid var(--wc-border-subtle);
}
/* As design 15's .offpanel (15:212–214, 430–431; T698, SRC-20): its heading
   16/600 with the off icon in text-secondary, the login in the code face,
   who could run SQL as a .kv of 110 px keys at 12/16. */
.sql-off h2 { display: flex; gap: 8px; align-items: center; margin: 0; font-size: 16px; line-height: 22px; font-weight: 600; }
.sql-off h2 > svg[data-icon='off'] { color: var(--wc-text-secondary); }
.sql-off p { margin: 0; color: var(--wc-text-secondary); }
.sql-off code { font-family: var(--wc-font-code); font-size: 12px; }
.sql-off__who {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0;
  font-size: 12px;
  line-height: 16px;
}
.sql-off__who dt { color: var(--wc-text-secondary); }
.sql-off__who dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.sql-off__act .btn > svg { flex: none; }
.sql-off__act { display: flex; gap: 10px; align-items: center; }
.sql-off__note { font-size: 12px; color: var(--wc-text-secondary); }

/* Turning it on (screen 2). */
.sql-turn-on { width: min(520px, calc(100vw - 32px)); }
.sql-turn-on .sql-turn-on__as {
  grid-template-columns: 90px minmax(0, 1fr); gap: 6px 12px; padding: 10px 12px;
  border-radius: 6px; background: var(--wc-bg-subtle);
}
.sql-turn-on__sub { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--wc-text-secondary); }
.sql-turn-on__layers { display: grid; gap: 6px; margin: 0; padding-left: 18px; font-size: 12px; line-height: 16px; }
.sql-turn-on__attest {
  display: grid; grid-template-columns: 16px 1fr; gap: 10px; align-items: start;
  padding: 10px 12px; border: 1px solid var(--wc-border-strong); border-radius: 6px;
}
.sql-turn-on__failed { color: var(--wc-status-error); }

/* My runs (pins 11, 12; F). */
.sql-runs {
  display: flex; flex-direction: column; min-width: 0; border-radius: 6px; overflow: hidden;
  background: var(--wc-bg-surface); border: 1px solid var(--wc-border-subtle);
}
.sql-runs__head { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 12px 0 14px; border-bottom: 1px solid var(--wc-border-subtle); }
.sql-runs__head h2 { margin: 0 auto 0 0; font-size: 14px; }
.sql-runs .seg label {
  display: inline-flex; align-items: center; height: 24px; padding: 0 8px; font-size: 12px; cursor: pointer;
  border-left: 1px solid var(--wc-border-subtle); background: var(--wc-bg-surface);
}
.sql-runs .seg label:first-child { border-left: 0; }
.sql-runs .seg label.is-on { background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: 600; }
.sql-runs .seg input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.sql-runs .seg label:focus-within { outline: 2px solid var(--wc-accent); outline-offset: -2px; }
.sql-runs__sub { margin: 0; padding: 6px 14px; font-size: 12px; color: var(--wc-text-secondary); border-bottom: 1px solid var(--wc-border-subtle); }
.sql-runs__none { margin: 0; padding: 12px 14px; font-size: 12px; color: var(--wc-text-secondary); }
.sql-runs__list { margin: 0; padding: 0; list-style: none; }
.sql-runs__run {
  display: grid; gap: 4px; width: 100%; padding: 8px 12px 9px 14px; text-align: left; border: 0; border-radius: 0;
  border-bottom: 1px solid var(--wc-border-subtle); background: none; color: inherit; text-decoration: none; font: inherit;
}
.sql-runs__run:hover { background: var(--wc-bg-hover); }
.sql-runs__top { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; }
.sql-runs__rows, .sql-runs__when { color: var(--wc-text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sql-runs__when { margin-left: auto; }
.sql-runs__source { font-size: 12px; color: var(--wc-text-secondary); }
.sql-runs__sql {
  font: 400 12px/16px var(--wc-font-code); overflow: hidden; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
@media (max-width: 1024px) {
  .sql-runner { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 760px) {
  .sql-runner__work { grid-template-columns: minmax(0, 1fr); }
}
.audit-trail__subfolders { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--wc-text-secondary); }
.audit-trail__range { display: inline-flex; gap: 8px; font-size: 12px; }
.audit-trail__events { position: relative; }
.audit-trail__events-button { cursor: pointer; padding-right: 10px; }
.audit-trail__events-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  display: grid;
  gap: 4px;
  min-width: 200px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 8px;
  background: var(--wc-bg-surface);
  box-shadow: var(--wc-shadow-pop);
}
/* Closed, it's gone: its own display would otherwise outrank "hidden". */
.audit-trail__events-panel[hidden] { display: none; }
.audit-trail__events-panel label { display: flex; gap: 8px; align-items: center; font-size: 12px; }
/* Active filters as the dashboard filters' chips: removable, combined with AND (pin 3). */
.audit-trail__chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.audit-trail__chips ul { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.filter-chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 24px;
  padding: 0 4px 0 10px;
  border-radius: 12px;
  background: var(--wc-bg-accent-soft);
  color: var(--wc-text-primary);
  font-size: 12px;
}
.filter-chip__remove { display: inline-grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--wc-text-secondary); }
.filter-chip__remove:hover { background: var(--wc-bg-hover); }
.audit-trail__count,
.audit-trail__retention,
.audit-trail__none,
.audit-trail__immutable { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
/* Empty, the live region stays in the page, so its first line is announced (T369's review). */
.audit-trail__count:empty { min-height: 0; line-height: 0; }
/* Time to the second in tabular numerals, the order fixed (pins 4 and 9). */
.audit-trail__table { font-variant-numeric: tabular-nums; }
.audit-trail__table th { cursor: default; }
.audit-trail__time { white-space: nowrap; }
.audit-trail__event { display: inline-flex; gap: 6px; align-items: center; }
.audit-trail__summary { text-align: left; color: var(--wc-text-primary); }
.audit-trail__table tr.is-selected td { background: var(--wc-bg-accent-soft); }
.audit-trail__pager { display: flex; gap: 8px; justify-content: flex-end; }
.audit-trail__error { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.audit-trail__error details { flex-basis: 100%; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.audit-trail__skeleton { display: grid; gap: 6px; }
.audit-trail__skeleton span { height: 28px; border-radius: 4px; background: var(--wc-bg-subtle); }
/* Jobs' and Schedules' list states (T560; design 16, state G): skeleton rows
   while a list is read (G1), and an error with Retry and Details (G2). */
.jobs-loading { display: grid; gap: 8px; }
.jobs-error p { margin: 0; }
.jobs-error__actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 6px; }
.jobs-error__actions details { font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.admin-pane__missing { padding-top: 12px; }
.admin-pane__missing p { margin: 4px 0 0; color: var(--wc-text-secondary); }
/* Docked, × closes the pane at the right end of its head (design 16, screen 1 and D1; T611). */
.admin-pane__close { display: inline-flex; order: 99; margin: 0 -8px 0 auto; }
/* What the list leaves out below 1,024 px, said in the sheet there only (G8; T611). */
.jobs-narrow { display: none; }
/* The record docked as design 08 draws it (pin 7; T699, SEC-01 to SEC-03): 380 px
   at the window's right, its full height under the top bar, white with a left
   rule, each part a 14/16 section with a rule under it. */
.audit-trail--open { grid-template-columns: minmax(0, 1fr) calc(380px - var(--wc-surface-padding)); }
.audit-trail__inspector {
  position: fixed;
  top: var(--wc-app-bar-height);
  right: 0;
  bottom: 0;
  z-index: 5;
  box-sizing: border-box;
  width: 380px;
  overflow: auto;
  border-left: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
.audit-trail__inspector > * { margin: 0; padding: 14px 16px; border-bottom: 1px solid var(--wc-border-subtle); }
.audit-trail__inspector > :last-child { border-bottom: 0; }
.audit-trail__inspector > .audit-trail__inspector-head { padding-bottom: 0; border-bottom: 0; }
.audit-trail__inspector-head { display: flex; justify-content: space-between; align-items: center; }
.audit-trail__inspector-head h3 { display: inline-flex; gap: 6px; align-items: center; margin: 0; font-size: var(--wc-text-sm-size); font-weight: 600; }
.audit-trail__inspector-where { font-size: 12px; color: var(--wc-text-secondary); }
.audit-trail__utc { color: var(--wc-text-muted); }
.audit-trail__kv { grid-template-columns: 80px minmax(0, 1fr); gap: 6px 12px; font-size: 12px; line-height: 16px; }
.audit-trail__kv dd { font-size: 12px; line-height: 16px; }
.audit-trail__kv code { font-family: var(--wc-font-code); font-size: 12px; }
.audit-trail__groups { display: grid; gap: 8px; }
.audit-trail__groups h4 {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.audit-trail__before-after { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.audit-trail__column { display: block; margin-bottom: 4px; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.audit-trail__glist { display: grid; gap: 2px; font: 400 12px/20px var(--wc-font-code); }
.audit-trail__glist ins { text-decoration: none; color: var(--wc-status-success); }
.audit-trail__glist del { color: var(--wc-status-error); }
.badge.audit-trail__replaced { gap: 4px; height: 22px; border: 0; background: var(--wc-bg-subtle); font-weight: 400; }
.audit-trail__replaced svg { color: var(--wc-text-secondary); }
.audit-trail__tested { margin: 0; font-size: 12px; }
/* The rows on one line, 34 px, as design 08's table (SEC-04, SEC-10); identities
   in the code face (SEC-05); each event's icon secondary (SEC-06). */
.audit-trail__table td { height: 34px; white-space: nowrap; }
.audit-trail__table td code { font-family: var(--wc-font-code); font-size: 12px; }
.audit-trail__event svg { color: var(--wc-text-secondary); }
.link-button.audit-trail__summary { min-height: 0; padding: 0; white-space: nowrap; }
.audit-trail__chips > .audit-trail__count { margin-left: auto; }
@media (max-width: 1023px) {
  .audit-trail__inspector { position: static; width: auto; border: 1px solid var(--wc-border-subtle); border-radius: 6px; }
}
/* A schedule setting that kept its value (T505; design 16, I1). */
.audit-trail__unchanged { color: var(--wc-text-secondary); }
.audit-trail__breaks { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.audit-trail__breaks code { font-family: var(--wc-font-code); }
@media (max-width: 1023px) {
  .audit-trail--open { grid-template-columns: minmax(0, 1fr); }
}
/* The Reviews page (T355; design 05, states D and E): the list beside a
   360 px summary, as the audit trail's. */
.reviews { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: start; }
.reviews__list { display: grid; gap: 12px; min-width: 0; }
/* Design 05 state D's tabs (T699, SEC-17, SEC-18): flush with the title, on no
   ground of their own; the count an accent pill, white 12/600, 18 px. */
.edit-sidebar__tabs.reviews__tabs { padding: 0; background: none; }
.reviews__tab-count {
  display: inline-block;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
/* Each item with its kind's icon before its title (SEC-24). */
.reviews__item-cell { display: flex; gap: 8px; align-items: center; }
/* The summary as state D's inspector: its icon in the head, sections headed in
   design 05's .sect h3, Open review last (SEC-23). */
.reviews__summary-head { gap: 8px; }
.reviews__summary-head h2 { flex: 1; }
.reviews__summary .reviews__label {
  color: var(--wc-text-secondary);
  line-height: 16px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.reviews__summary .reviews__by { color: var(--wc-text-primary); font-size: var(--wc-text-sm-size); }
/* Fit or Actual size (design 05 pin 3; SEC-21): the canvas scrolls at Actual size. */
.review-view__size { margin-left: auto; }
.review-view__canvas { min-width: 0; overflow-x: auto; }
/* "Proposed by": the time on a line of its own (pin 5; SEC-26). */
.review-view__author-when { display: block; }
/* Test connection under a proposed data source's settings (state H; SEC-22). */
.review-settings__test {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid var(--wc-border-subtle);
}
.review-settings__tested { display: inline-flex; gap: 6px; align-items: center; margin: 0; font-size: 12px; font-weight: 600; }
.review-settings__tested:empty { display: none; }
.reviews__none { margin: 0; color: var(--wc-text-secondary); }
.reviews__item { font-weight: 600; text-align: left; }
.reviews__yours {
  margin-left: 6px;
  padding: 1px 6px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  font-size: 11px;
  color: var(--wc-text-secondary);
}
.reviews__status, .reviews__decision { display: inline-flex; gap: 6px; align-items: center; }
.reviews__summary.admin-pane { width: 360px; border: 1px solid var(--wc-border-subtle); border-radius: 8px; }
.reviews__summary-head { display: flex; justify-content: space-between; align-items: center; }
.reviews__summary-head h2 { margin: 0; font-size: var(--wc-text-sm-size); }
.reviews__where, .reviews__by { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
.reviews__label { margin: 0; font-size: 12px; font-weight: 600; }
/* As written, its line breaks kept (AC-284). */
.reviews__description { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.reviews__description.is-empty { color: var(--wc-text-secondary); }
.reviews__decision { margin: 0; font-size: 12px; }
.reviews__reason {
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid var(--wc-border-subtle);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@media (max-width: 1023px) {
  .reviews { grid-template-columns: minmax(0, 1fr); }
  .reviews__summary.admin-pane { position: static; width: auto; height: auto; }
}
.reviews__summary > .btn { justify-self: start; }

/* Its description, directly under its title in text-sm, text-secondary, as
   design 14 draws an item's (T684; R76 dashboard-Q2). */
.dashboard__description {
  flex-basis: 100%;
  max-width: 860px;
  margin: -6px 0 0;
  font-size: var(--wc-text-sm-size);
  line-height: 20px;
  color: var(--wc-text-secondary);
  overflow-wrap: anywhere;
}
/* Where an item lives, under its title (T348; design 04, states E and F). */
.dashboard__ownership {
  flex-basis: 100%;
  margin: -6px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-secondary);
}
/* Explore's Show filter (T525; design 14, state I): a segmented
   radio group on its own row above the list, as the prototype's .seg. Its
   radios are native, out of sight: the chosen choice in the accent, the
   focused one ringed as every control is. */
.kind-filter { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kind-filter__label { font-size: 12px; font-weight: 600; color: var(--wc-text-secondary); }
.kind-filter__choices {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
}
.kind-filter__choice {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border-left: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
  font-size: 12px;
  cursor: pointer;
}
.kind-filter__choice:first-child { border-left: 0; border-radius: 3px 0 0 3px; }
.kind-filter__choice:last-child { border-radius: 0 3px 3px 0; }
.kind-filter__choice input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
/* The one pressed tint (T684, EXP-02). */
.kind-filter__choice.is-chosen {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: 600;
}
.kind-filter__choice:has(input:focus-visible) {
  outline: 2px solid var(--wc-accent);
  outline-offset: 2px;
  z-index: 1;
}
/* Schedules' filters row, under its note (design 16, screen 2), and its
   owner filter (T557; pin 4): the prototype's .seg, of buttons, each owner
   with its icon and each choice with its count, in the secondary colour. */
.schedules__filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.owner-filter {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
}
.owner-filter__choice {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: 0;
  border-left: 1px solid var(--wc-border-subtle);
  border-radius: 0;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
.owner-filter__choice:first-child { border-left: 0; border-radius: 3px 0 0 3px; }
.owner-filter__choice:last-child { border-radius: 0 3px 3px 0; }
.owner-filter__choice svg { color: var(--wc-text-secondary); flex: none; }
.owner-filter__count { color: var(--wc-text-secondary); font-weight: 400; font-variant-numeric: tabular-nums; }
/* The design's accent-soft, kept under the pointer too (T557's review). */
.owner-filter__choice.is-chosen,
.owner-filter__choice.is-chosen:hover:not(:disabled) {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: 600;
}
.owner-filter__choice.is-chosen svg { color: var(--wc-accent); }
.owner-filter__choice:focus-visible {
  outline: 2px solid var(--wc-accent);
  outline-offset: 2px;
  z-index: 1;
}
/* Edit in my workspace, for a dashboard (T348; design 04, state D). */
.dialog.edit-in-workspace { width: min(520px, calc(100vw - 32px)); max-width: none; gap: 10px; }
.dialog .edit-in-workspace__always { color: var(--wc-text-primary); }
.edit-in-workspace__also {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
}
.edit-in-workspace__also legend { padding: 0 4px; font-size: 12px; font-weight: 600; color: var(--wc-text-secondary); }
.edit-in-workspace__option { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: baseline; }
.edit-in-workspace__name { font-weight: 600; }
.edit-in-workspace__where { grid-column: 2; font-size: 12px; color: var(--wc-text-secondary); }
.dialog p.edit-in-workspace__note { margin: 0; font-size: 12px; }
/* Where its copies go (T523; design 14, state G1). */
.dialog p.edit-in-workspace__folder {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  color: var(--wc-text-secondary);
}
.edit-in-workspace__project {
  font-family: var(--wc-font-code);
  font-weight: 600;
  white-space: nowrap;
  color: var(--wc-text-primary);
}

/* An item's History (T357; design 06): a 360 px panel docked right of the
   item. Closed, its container is no box at all, so nothing moves. */
.with-panel,
.with-panel > .with-panel__main { display: contents; }
.with-panel[data-open='true'] {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: stretch;
}
.with-panel[data-open='true'] > .with-panel__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.with-panel[data-open='true'] > .history-panel { align-self: start; }
/* A dashboard keeps the window's height and scrolls in its own canvas, as it
   does alone (T357's review): every level between gets min-height 0. */
main:has(.dashboard) > .with-panel[data-open='true'] { flex: 1; min-height: 0; padding-right: 16px; }
@media (max-width: 1023px) {
  .with-panel[data-open='true'] { grid-template-columns: minmax(0, 1fr); }
}
.history-panel {
  position: sticky;
  top: 0;
  display: grid;
  gap: 10px;
  align-content: start;
  max-height: calc(100vh - 96px);
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 8px;
  background: var(--wc-bg-surface);
}
.history-panel__head { display: flex; align-items: baseline; gap: 8px; }
.history-panel__head h2 { margin: 0; font-size: var(--wc-text-sm-size); font-weight: 600; }
.history-panel__head > button { margin-left: auto; }
.history-panel__sub { font-size: 12px; color: var(--wc-text-secondary); }
.history-panel__list { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.history-panel__row {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
}
.history-panel__row[aria-current='true'] { border-color: var(--wc-accent); box-shadow: 0 0 0 1px var(--wc-accent); }
.history-panel__row p { margin: 0; }
.history-panel__version { display: flex; align-items: center; gap: 8px; }
.history-panel__current {
  padding: 0 6px;
  border-radius: 9px;
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
}
.history-panel__by { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.history-panel__description { font-size: 13px; line-height: 18px; overflow-wrap: anywhere; }
.history-panel__description.is-empty { color: var(--wc-text-secondary); }
.history-panel__description.is-clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* Its actions on hover and focus (pin 6), kept in the tab order. */
.history-panel__actions { display: flex; gap: 6px; margin-top: 4px; opacity: 0; }
.history-panel__row:hover .history-panel__actions,
.history-panel__row:focus-within .history-panel__actions,
.history-panel__row[aria-current='true'] .history-panel__actions { opacity: 1; }
.history-panel__limit { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.history-panel__skeleton { height: 64px; border-radius: 6px; background: var(--wc-bg-subtle); }
.history-panel__error { display: grid; gap: 6px; justify-items: start; }
/* A kept version in the item's place (state A). */
.version-view { display: grid; gap: 10px; }
.version-band {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--wc-bg-accent-soft);
  font-size: 13px;
}
.version-band > p { flex: 1; min-width: 0; margin: 0; }

/* A proposal's review view (T356, T544; design 05's main screen): its 52 px
   head, then 240 / fluid / 360 at the window's height — what is in it, the
   item drawn, and the inspector, each scrolling on its own. Each side panel
   folds to a 40 px rail that keeps its control (AC-390). */
main:has(.review-view) {
  height: calc(100vh - var(--wc-app-bar-height));
  display: flex;
  flex-direction: column;
  padding: 0;
}
.review-view { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.review-view > .state-line { margin: 0; padding: 8px 16px; border-bottom: 1px solid var(--wc-border-subtle); }
.review-view__head {
  min-height: 52px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 0 16px;
  background: var(--wc-bg-surface);
  border-bottom: 1px solid var(--wc-border-subtle);
}
.review-view__divider { width: 1px; height: 24px; flex: none; background: var(--wc-border-subtle); }
.review-view__title { margin: 0; font-size: 16px; line-height: 22px; font-weight: 600; }
.review-view__arrow { font-weight: 400; color: var(--wc-text-secondary); }
.review-view__spacer { flex: 1; }
.review-view__queue {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--wc-text-secondary);
  font-variant-numeric: tabular-nums;
}
.review-view__body {
  --review-items-width: 240px;
  --review-about-width: 360px;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--review-items-width) minmax(0, 1fr) var(--review-about-width);
  grid-template-rows: minmax(0, 1fr);
}
.review-view__body.is-items-collapsed { --review-items-width: 40px; }
.review-view__body.is-about-collapsed { --review-about-width: 40px; }
.review-view__side {
  position: relative;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--wc-bg-surface);
}
.review-view__side--items { border-right: 1px solid var(--wc-border-subtle); }
.review-view__side--about { border-left: 1px solid var(--wc-border-subtle); }
/* Each panel's control beside its first heading; on the rail, at its top. */
.review-view__toggle {
  position: absolute;
  top: 12px;
  right: 8px;
  z-index: 1;
  width: 24px;
  padding: 0;
  justify-content: center;
  color: var(--wc-text-secondary);
}
.review-view__side--about > .review-view__toggle { top: 10px; }
.is-items-collapsed > .review-view__side--items > .review-view__toggle,
.is-about-collapsed > .review-view__side--about > .review-view__toggle {
  position: static;
  margin: 10px auto 0;
}
.review-view__items[hidden],
.review-view__inspector[hidden] { display: none; }
.review-view__items {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 4px;
  align-content: start;
  padding: 12px 8px;
}
.review-view__items h2,
.review-view__sect h2 {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.review-view__items h2 { padding: 4px 36px 6px 12px; }
.review-view__items ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.review-view__item {
  width: 100%;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  padding: 8px 12px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.review-view__item[aria-current='true'],
.review-view__item[aria-current='true']:hover:not(:disabled) { background: var(--wc-bg-accent-soft); }
.review-view__item-text { display: grid; min-width: 0; }
.review-view__item-title { font-size: 14px; line-height: 20px; font-weight: 600; overflow-wrap: anywhere; }
.review-view__item-what { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
/* Design 05's note bar, its icon first: why the rest goes with it, and what
   the folder has; a warning in the warning's tint. */
.review-view__note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 8px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-accent-soft);
  color: var(--wc-text-primary);
  font-size: 12px;
  line-height: 16px;
}
.review-view__note > svg { flex: none; margin-top: 1px; }
.review-view__note.is-warn { background: color-mix(in srgb, var(--wc-status-warning) 14%, var(--wc-bg-surface)); }
.review-view__items > .review-view__note { margin: 6px 12px 0; }
.review-view__item-pane { min-width: 0; min-height: 0; overflow: auto; }
.review-view__item-pane > :not(.review-view__preview) { margin: 16px 20px; }
.review-view__preview { display: flex; flex-direction: column; gap: 12px; min-width: 0; padding: 16px 20px; }
/* Proposed or Current, in a bar across the item's head (design 05). */
.review-view__switch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin: -16px -20px 0;
  padding: 10px 20px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
.review-view__read-only { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
/* A model's YAML diff (T350; design 05, state G): the code face, line
   numbers, the changes marked + and − beside their tint (YamlDiff.tsx). */
.yaml-diff { display: grid; gap: 6px; min-width: 0; }
.yaml-diff__head { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.yaml-diff__head .is-code { font-family: var(--wc-font-code); color: var(--wc-text-primary); font-weight: 600; }
/* Show all lines, beside the diff; each folded stretch a button, its ring
   drawn inside it, the editor's box clipping one outside (T637). */
.yaml-diff__all { justify-self: start; }
/* On, seen as on, as the History button's pressed state is (T637's review). */
.yaml-diff__all[aria-pressed='true'] { border-color: var(--wc-accent); background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: 600; }
.yaml-diff .cm-collapsedLines:focus-visible { outline-offset: -2px; }
.yaml-diff__code .cm-editor {
  max-height: calc(100vh - 220px);
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: 12px;
}
.yaml-diff__code .cm-scroller { overflow: auto; font-family: var(--wc-font-code); }
.yaml-diff__code .cm-gutters {
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  border-right: 1px solid var(--wc-border-subtle);
}
.yaml-diff__code .cm-focused { outline: 2px solid var(--wc-accent); }
/* The inspector (design 05, pins 5–8): sections ruled apart, and the
   decision at its foot. */
.review-view__inspector { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; }
.review-view__sect {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.review-view__sect:first-child h2 { padding-right: 28px; }
.review-view__sect p { margin: 0; }
.review-view__author { display: flex; align-items: center; gap: 10px; }
.review-view__avatar {
  width: 28px;
  height: 28px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--wc-bg-role-dimension-soft);
  color: var(--wc-role-dimension);
  font-size: 12px;
  font-weight: 600;
}
.review-view__author-name { font-weight: 600; }
.review-view__author-when { font-size: 12px; color: var(--wc-text-secondary); }
.review-decision {
  margin-top: auto;
  display: grid;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--wc-border-subtle);
}
.review-decision__note { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.review-decision__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
/* Reject at the footer's start, Approve at its end (pin 8). */
.review-decision__foot { justify-content: flex-start; }
.review-decision__foot > .review-decision__anchor { margin-left: auto; }
.review-decision__anchor { position: relative; display: inline-flex; }
/* Approve's question, anchored to it (state I). */
.review-decision__confirm {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 20;
  width: 300px;
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  box-shadow: 0 6px 20px rgb(0 0 0 / 18%);
}
.review-decision__confirm h3 { margin: 0; font-size: var(--wc-text-sm-size); }
.review-decision__confirm p { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.review-decision__reason { display: grid; gap: 4px; }
.review-decision__reason textarea { width: 100%; box-sizing: border-box; resize: vertical; font: inherit; }
.review-decision__reason textarea[aria-invalid='true'] { border-color: var(--wc-status-error); }
.review-decision__refused {
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--wc-status-error) 9%, var(--wc-bg-surface));
  color: var(--wc-status-error);
  font-size: 12px;
  line-height: 16px;
}
.review-decision__refused p { margin: 0; }
/* An approval the publish check refused (T451; design 05, state L): each
   break on the error's tint, its error in code type; the rest counted. */
.review-refusal { display: grid; gap: 6px; }
.review-refusal > .state-line { margin: 0; font-size: 13px; color: var(--wc-status-error); }
.review-refusal__breaks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.review-refusal__break {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--wc-status-error) 9%, var(--wc-bg-surface));
  font-size: 12px;
  line-height: 16px;
  overflow-wrap: anywhere;
}
.review-refusal__break .mono { font-family: var(--wc-font-code); }
.review-refusal__hidden,
.review-view__help { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.review-decision__refused ul { margin: 4px 0 0; padding-left: 16px; }
/* A data source's settings beside the folder's (state H). */
.review-settings { width: 100%; border-collapse: collapse; font-size: 13px; }
.review-settings th,
.review-settings td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--wc-border-subtle);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.review-settings thead th { font-size: 12px; font-weight: 600; color: var(--wc-text-secondary); }
.review-settings tbody th { font-weight: 600; }
.review-settings td.is-same { color: var(--wc-text-muted); }
/* Narrower than 1,024 px the panels stack and the page scrolls down; a
   folded panel keeps only its control's row. */
@media (max-width: 1023px) {
  /* Over main:has(.dashboard)'s window height, later in this sheet, when the
     item drawn is a dashboard (T544's review). */
  main:has(.review-view),
  main:has(.review-view):has(.dashboard) { height: auto; }
  .review-view__body { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; }
  .review-view__side--items { border-right: 0; border-bottom: 1px solid var(--wc-border-subtle); }
  .review-view__side--about { border-left: 0; border-top: 1px solid var(--wc-border-subtle); }
  .review-view__items,
  .review-view__inspector,
  .review-view__item-pane { overflow: visible; }
  .is-items-collapsed > .review-view__side--items > .review-view__toggle,
  .is-about-collapsed > .review-view__side--about > .review-view__toggle { margin: 8px 8px 8px auto; }
}
/* A screen that needs a Cube API scope wechart lacks (T176, AC-170): said as
   a state, in secondary ink, as an empty tile is — not as a failure. */
.scope-unavailable { display: grid; gap: 4px; padding: 8px 0; color: var(--wc-text-secondary); }
.scope-unavailable p { margin: 0; }
/* Whether Cube refuses unsigned requests (T175, AC-169): a status line when
   it does, and while it does not, the prototype's .warnbar in the error
   colour — its icon and words, and what makes Cube refuse them. */
.auth-check { display: grid; gap: 4px; }
.auth-check--open {
  padding: 8px 12px;
  border: 1px solid var(--wc-status-error);
  border-radius: 6px;
  background: color-mix(in srgb, var(--wc-status-error) 8%, var(--wc-bg-surface));
}
.auth-check p { margin: 0; color: var(--wc-text-primary); font-size: 13px; }
/* Preview as groups' parts, named for phase 1's context pane they came from. */
.context-preview__note { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.context-preview__found { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.context-preview__presets { display: flex; flex-wrap: wrap; gap: 6px; }
.context-preview__access h3 { margin: 0 0 6px; font-size: var(--wc-text-xs-size); font-weight: 600; color: var(--wc-text-secondary); }
.context-preview__access ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.context-preview__access li { display: flex; flex-wrap: wrap; gap: 2px 6px; align-items: center; font-size: 12px; line-height: 16px; }
.context-preview__object { font-family: var(--wc-font-code); font-weight: 600; }
.context-preview__source { overflow-wrap: anywhere; }
/* The chart type card (AC-217), the prototype's reco-row: the type by name,
   how it was chosen, and Change; and a manual choice's warning (AC-218). */
.type-card-field { display: grid; gap: 6px; margin-bottom: 12px; }
.type-card-field__label { font-size: var(--wc-text-xs-size); font-weight: var(--wc-text-xs-strong-weight); color: var(--wc-text-secondary); }
.type-card-field__change {
  display: grid;
  gap: 2px;
  /* The prototype's .reco-row: padded 8, its name in .reco-name 12/600 (T310). */
  padding: 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.type-card-field__change:hover { border-color: var(--wc-accent); }
/* Design 01's .reco-row (pin 4; T689, EDI-06): a 28 px icon tile, then the
   name over "Chosen manually · Change…", Change in the accent at 600. */
.type-card-field__change { grid-template-columns: 28px 1fr; gap: 8px; align-items: center; }
.type-card-field__icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
}
.type-card-field__text { display: grid; }
.type-card-field__name { font-size: 12px; line-height: 16px; font-weight: var(--wc-text-sm-strong-weight); }
.type-card-field__why { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.type-card-field__change-word { color: var(--wc-accent); font-weight: 600; }
/* Design 01's .quick and .qb: Auto, then 24 px picks; the pressed one in the accent. */
.type-card-field__quick { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-top: -4px; }
.type-card-field__pick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  min-width: 28px;
  padding: 0 6px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.type-card-field__pick[aria-pressed='true'] {
  border-color: var(--wc-accent);
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
}
.type-card-field__suggested { margin-left: 4px; font-size: 12px; line-height: 16px; color: var(--wc-text-muted); }
/* Design 01's .pinned (pin 5; EDI-07): the recommendation, on bg-subtle, with Use. */
.type-card-field__recommended {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  gap: 8px;
  align-items: start;
  padding: 8px;
  border-radius: 6px;
  background: var(--wc-bg-subtle);
  font-size: 12px;
  line-height: 16px;
}
.type-card-field__recommended b { font-weight: 600; }
.type-card-field__recommended-icon { padding-top: 1px; color: var(--wc-text-secondary); }
.type-card-field__recommended-why { color: var(--wc-text-secondary); }
/* "Why this recommendation?" (pin 9, state C; EDI-12): design 01's .whybtn,
   its caret muted; the checklist's .check rows, 12/16, an icon column of 20;
   and the link to every rule in the accent at 600. */
.why-chart { display: grid; gap: 2px; }
.why-chart__toggle {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.why-chart__toggle:hover { background: var(--wc-bg-hover); }
.why-chart__caret { color: var(--wc-text-muted); }
.why-chart__checks { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.why-chart__check {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 6px;
  align-items: start;
  padding: 3px 0;
  font-size: 12px;
  line-height: 16px;
}
.why-chart__check > svg { margin-top: 1px; }
.why-chart__check > svg[data-icon='ok'] { color: var(--wc-status-success-icon); }
.why-chart__check > svg[data-icon='warn'] { color: var(--wc-status-warning-icon); }
.why-chart__check b { font-weight: 600; }
.why-chart__runners { color: var(--wc-text-muted); }
.why-chart__every {
  justify-self: start;
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--wc-accent);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.type-card-field > .btn-sm { justify-self: start; }
.type-card-field__warning {
  flex-wrap: wrap;
  padding: 8px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--wc-status-warning-icon) 14%, var(--wc-bg-surface));
  font-size: 12px;
  line-height: 16px;
}
/* The gallery (AC-217): the prototype's "Choose chart type" — a search and
   Close above, purposes down the left, the types as cards. */
.dialog.type-gallery {
  width: min(920px, calc(100vw - 32px));
  max-width: none;
  height: min(600px, calc(100vh - 64px));
  padding: 0;
  gap: 0;
  grid-template-columns: 220px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}
.type-gallery__head { grid-column: 1 / -1; display: flex; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--wc-border-subtle); }
/* Its search is the prototype's .input.sm, and Close and Use Auto its
   .btn.sm, over the .dialog button rule (T310). */
.type-gallery__head input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']) {
  flex: 1;
  max-width: 280px;
  height: 28px;
  font-size: 12px;
}
.type-gallery__head .btn-sm { margin-left: auto; }
.type-gallery .btn-sm { height: 24px; padding: 0 8px; border-radius: 6px; font-size: 12px; }
.type-gallery__shelves { display: grid; align-content: start; gap: 2px; padding: 8px; overflow: auto; border-right: 1px solid var(--wc-border-subtle); }
/* The prototype's .file, in the UI face as its gallery sets it. */
.dialog .type-gallery__shelves button {
  display: flex;
  align-items: center;
  height: 28px;
  min-height: 28px;
  padding: 0 12px 0 24px;
  border: 0;
  border-radius: 0;
  background: none;
  font-size: 12px;
  text-align: left;
}
.dialog .type-gallery__shelves button[aria-pressed='true'] { background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: var(--wc-text-sm-strong-weight); }
.type-gallery__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; align-content: start; padding: 12px; overflow: auto; }
.dialog .type-card { display: grid; gap: 6px; align-content: start; height: auto; padding: 12px; border-color: var(--wc-border-subtle); border-radius: 6px; text-align: left; }
.dialog .type-card:hover { border-color: var(--wc-accent); }
.dialog .type-card[aria-current='true'] { border-color: var(--wc-accent); box-shadow: 0 0 0 1px var(--wc-accent); }
/* Greyed: these fields cannot draw it, and it says what it lacks. */
.dialog .type-card[data-drawable='false'] { background: var(--wc-bg-subtle); }
.dialog .type-card[data-drawable='false'] .type-card__name { color: var(--wc-text-secondary); }
.type-card__top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
/* The prototype's card (editor.js:385; T688, EDI-24): the type's icon at 28 px
   in the accent on the top row with the badge, the name on its own line. */
.type-card__top > .chart-type-icon { flex: none; color: var(--wc-accent); }
/* <span class="strong" style="font-size:13px"> (editor.js, galleryHtml). */
.type-card__name { font-size: 13px; font-weight: var(--wc-text-sm-strong-weight); }
.type-card__badge { padding: 0 6px; border-radius: 999px; background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-size: 12px; line-height: 18px; }
.type-card__about { display: grid; gap: 4px; }
.type-card__description, .type-card__needs, .type-card__missing { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.type-card__missing { color: var(--wc-text-primary); }
.type-gallery__none { margin: 0; color: var(--wc-text-secondary); }
.type-gallery__foot { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--wc-border-subtle); }
.dialog .type-gallery__foot p { flex: 1; margin: 0; font-size: 12px; line-height: 16px; }
/* A dashboard previewed as a security context (T172, AC-166): the prototype's
   .viewas bar, pinned while the page scrolls (direction.md rule 21). */
.preview-banner {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 6px 16px;
  border-bottom: 1px solid var(--wc-crossfilter);
  background: color-mix(in srgb, var(--wc-crossfilter) 12%, var(--wc-bg-surface));
  color: var(--wc-text-primary);
  font-size: 13px;
  font-weight: 600;
}
.preview-banner code { overflow-wrap: anywhere; font-family: var(--wc-font-code); font-weight: 400; }
.preview-banner a { margin-left: auto; color: var(--wc-text-primary); }
/* A preview as groups, with sign-in on (T630; design 08, state E, as drawn):
   on the accent, 12 px, the eye, each group bold in the code face, and Stop
   preview as a 24 px button outlined in the banner's own ink. */
.preview-banner--groups {
  gap: 10px;
  padding: 8px 24px;
  border-bottom-color: var(--wc-accent);
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  font-weight: 400;
}
.preview-banner--groups .preview-banner__said { flex: 1; min-width: 0; }
.preview-banner--groups b code { font-weight: 600; }
.preview-banner--groups a.btn {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  height: 24px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--wc-text-on-accent) 60%, transparent);
  border-radius: 6px;
  background: transparent;
  color: var(--wc-text-on-accent);
  text-decoration: none;
}
.preview-banner--groups a.btn:hover { background: color-mix(in srgb, var(--wc-text-on-accent) 12%, transparent); }
/* The accent ring would vanish on the accent: in the banner's ink (AC-176). */
.preview-banner--groups a.btn:focus-visible { outline-color: var(--wc-text-on-accent); }
/* What these groups reach, in one list (T630; design 08, state E): 12 px rows
   4 px apart, the folders' icons and those seen from above in secondary, and
   the model's cubes after the folders, each on one line. */
.groups-preview__reach ul { gap: 4px; }
.groups-preview__reach li > svg[data-icon='eye'],
.groups-preview__reach li > svg[data-icon='pencil'] { flex: none; color: var(--wc-text-secondary); }
.groups-preview__above { color: var(--wc-text-secondary); }
.groups-preview__first-object { margin-top: 8px; }
/* Each cube or view by its name in the UI face, bold, as drawn. */
.groups-preview__reach .context-preview__object { font-family: inherit; }
/* The pane's section headings alike, as design 08's .sect > h3. */
.groups-preview h3 {
  margin: 0 0 6px;
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.groups-preview__why { color: var(--wc-text-secondary); overflow-wrap: anywhere; }
/* A chart's SQL as the previewed context (T174, AC-168): Cube's text as it
   wrote it, scrolling within the dialog rather than widening it. */
.dialog.generated-sql { width: min(760px, calc(100vw - 32px)); max-width: none; max-height: calc(100vh - 64px); overflow: auto; }
.dialog.generated-sql h3 { margin: 8px 0 0; font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); font-weight: 600; }
/* A statement may shrink below its longest line (T174's review): the code
   view scrolls it, rather than the line widening the dialog past Close. */
.generated-sql { grid-template-columns: minmax(0, 1fr); }
.generated-sql__query { display: grid; gap: 4px; min-width: 0; }
.generated-sql__query .cm-editor {
  max-height: 320px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  font-size: 12px;
}
.dialog .generated-sql__note { margin: 0; font-size: 12px; }
.dialog .generated-sql__params { font: 12px/16px var(--wc-font-code); }
.dialog .generated-sql__problem { color: var(--wc-status-error); overflow-wrap: anywhere; }
/* A tile's View query (AC-199): the Cube query and its SQL, each scrolling in
   its own box, so a long line never widens the dialog past Close — the rule
   T174's review set for the SQL-as-context dialog. */
.dialog.view-query {
  width: min(760px, calc(100vw - 32px));
  max-width: none;
  max-height: calc(100vh - 64px);
  overflow: auto;
  grid-template-columns: minmax(0, 1fr);
}
.dialog.view-query h3 { margin: 8px 0 0; font-size: var(--wc-text-sm-size); font-weight: 600; }
/* A dialog's primary answer keeps its accent (T363's screenshots): the
   .dialog button rule above out-ranked .btn-primary, so Create and Next
   looked like Cancel. */
.dialog button.btn-primary {
  background: var(--wc-accent);
  border-color: var(--wc-accent);
  color: var(--wc-text-on-accent);
  font-weight: var(--wc-text-sm-strong-weight);
}
.dialog button.btn-primary:hover:not(:disabled) { background: var(--wc-accent); filter: brightness(1.08); }
/* New in My workspace (T345, AC-282): references.md's 520 px dialog, its
   Name and Target folder full width. */
/* Design 04, state A: 520 px, padding 20, its parts 14 px apart (T692). */
.dialog.new-item-dialog { width: min(520px, calc(100vw - 32px)); max-width: none; gap: 14px; padding: 20px; }
/* The target: its label, the filter (state B), the tree and its help, 4 px apart (.field). */
.new-item-dialog__target { display: grid; gap: 4px; }
.new-item-dialog__target > .field { gap: 4px; }
/* Its label as Name's: design 04's .field > label, 12/16 at 600 in text-secondary (T692's review). */
.new-item-dialog .field__label { font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); font-weight: 600; color: var(--wc-text-secondary); }
/* The folder named in the note, in text-primary as design 04 draws it. */
.new-item-dialog__note b { color: var(--wc-text-primary); }
/* Design 04's .ptree: rows edge to edge, radius 4. */
.new-item-dialog .target-tree { gap: 0; border-radius: 4px; }
/* The filter, its search icon at its head (design 04, state B). The text
   starts after the icon, over the global input rule's padding. */
.new-item-dialog__find { position: relative; display: block; }
.new-item-dialog__find > svg { position: absolute; left: 9px; top: 9px; color: var(--wc-text-muted); pointer-events: none; }
.new-item-dialog__find > input.new-item-dialog__filter:not([type='checkbox']):not([type='radio']) {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  padding-left: 29px;
}
.new-item-dialog .field__help { margin: 0; font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); color: var(--wc-text-secondary); }
.new-item-dialog .field input,
.new-item-dialog .field select { height: 32px; }
.dialog .new-item-dialog__note { margin: 0; font-size: var(--wc-text-xs-size); }
/* Copy › To dashboard (T271, AC-243): a search, the dashboards it finds as a
   list that scrolls within the dialog, and Copy and Close. */
.copy-to-dashboard__search { display: grid; gap: 4px; }
.copy-to-dashboard__list {
  display: grid;
  gap: 4px;
  max-height: 240px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
}
.copy-to-dashboard__list label { display: flex; align-items: center; gap: 8px; }
.copy-to-dashboard__done { margin: 0; }

/* The rows behind a tile (T120, AC-114): the table scrolls within the dialog,
   its header in view, so Download and Close never leave the screen. */
.dialog.marked-rows {
  width: min(960px, calc(100vw - 32px));
  max-width: none;
  max-height: calc(100vh - 64px);
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
}
.marked-rows__table {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
}
.marked-rows__table table { width: 100%; border-collapse: collapse; font-size: var(--wc-text-xs-size); font-variant-numeric: tabular-nums; }
.marked-rows__table th {
  position: sticky;
  top: 0;
  padding: 6px 8px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}
.marked-rows__table td { padding: 4px 8px; border-top: 1px solid var(--wc-border-subtle); white-space: nowrap; }
/* Its head: the heading, and the switch that pins it open (the context-menu
   analysis' drawer head, state G). */
.marked-rows__head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }
.marked-rows__head h2 { margin: 0; }
.marked-rows__follow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
}
.marked-rows__note { margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
/* Two classes deep, so a dialog's own button rule (.dialog button) doesn't
   draw it as a button (T269's review). */
.marked-rows__follow .marked-rows__switch {
  position: relative;
  flex: none;
  width: 28px;
  height: 16px;
  min-height: 0;
  padding: 0;
  border: 1px solid var(--wc-border-strong);
  border-radius: 8px;
  background: var(--wc-bg-subtle);
}
.marked-rows__follow .marked-rows__switch::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--wc-text-secondary);
}
.marked-rows__follow .marked-rows__switch[aria-checked='true'] {
  border-color: var(--wc-accent);
  background: var(--wc-accent);
}
.marked-rows__follow .marked-rows__switch[aria-checked='true']::after {
  left: 13px;
  background: var(--wc-bg-surface);
}
/* A drilled tile's breadcrumb and Back (T270, AC-236), the context-menu
   mockup's state B: the way back, then where it came from, then what by. */
.drill-crumb { display: grid; gap: 2px; margin-bottom: 4px; }
.drill-crumb__path {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--wc-text-xs-size);
  white-space: nowrap;
}
.drill-crumb__from { overflow: hidden; text-overflow: ellipsis; color: var(--wc-text-secondary); }
.drill-crumb__path b { font-weight: 600; color: var(--wc-text-primary); }
.drill-crumb__note { margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
/* The details panel (T269, AC-240): the rows pinned open under the tiles,
   which give it room rather than go under it; its own table scrolls. Of one
   height, rows or none, so the tiles don't move as each answer comes (T269's
   review). */
.dashboard__foot {
  flex: none;
  display: flex;
  height: 36vh;
  border-top: 1px solid var(--wc-border-strong);
  background: var(--wc-bg-surface);
}
.marked-rows--panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
  padding: 8px 16px 12px;
}
.marked-rows--panel h2 { font-size: var(--wc-text-sm-size); }
.marked-rows--panel .marked-rows__table { flex: 1; }
.marked-rows--panel .dialog__actions { margin: 0; }
.view-query__code {
  max-height: 280px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  font: 12px/16px var(--wc-font-code);
}
.dialog .view-query__params { margin: 4px 0 0; font: 12px/16px var(--wc-font-code); }
/* A job's state (T158, AC-152): the prototype's .status — its icon, its words. */
.status {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.status svg { flex: none; }
/* A job's or query's failure carries Cube's message, which can be long: it
   wraps where it stands rather than pushing the page sideways (T158's review). */
.build-jobs__job .status,
.query-log__outcome .status,
/* So does the Security workspace's word on Cube's sign-in, a sentence
   (T396, AC-304: it ran past a phone's screen). */
.auth-check .status { white-space: normal; overflow-wrap: anywhere; align-items: flex-start; }
.status--ok { color: var(--wc-status-success); }
.status--warn { color: var(--wc-status-warning); }
.status--err { color: var(--wc-status-error); }
.status--run { color: var(--wc-accent); }
.status--idle { color: var(--wc-text-secondary); }
.status--cancel { color: var(--wc-text-secondary); }
/* Not built, idle; Partly built, a warning (design 16's legend; T550). */
.status--off { color: var(--wc-text-secondary); }
.status--part { color: var(--wc-status-warning); }
.status--susp { color: var(--wc-status-error); }
/* What Last built and Started by mean, under Jobs' table (design 16, pin 9). */
.jobs-foot { margin: 8px 0 0; color: var(--wc-text-secondary); font-size: 12px; line-height: 16px; max-width: 72ch; }
.jobs-foot b { color: var(--wc-text-primary); font-weight: 600; }
/* A line of state — loading, failed, done, a warning — with its icon (T183,
   AC-177; direction.md rule 3): the icon at the words' first line, the words
   wrapping beside it in the line's own colour, the icon in its state's. */
.state-line { display: flex; gap: 6px; align-items: flex-start; }
.state-line > span { min-width: 0; overflow-wrap: anywhere; }
svg[data-icon] { flex: none; }
.state-line > svg[data-icon] { margin-top: 1px; }
.state-line > svg[data-icon='ok'] { color: var(--wc-status-success); }
.state-line > svg[data-icon='run'] { color: var(--wc-accent); }
.state-line > svg[data-icon='idle'] { color: var(--wc-text-secondary); }
/* An icon set in a line of words, rather than beside a block of them. */
.tile-no-rows__headline > svg[data-icon],
.model-field__problem > svg[data-icon],
.filter-widget__cut > svg[data-icon],
.tile-not-covered > svg[data-icon],
.well__reason > svg[data-icon],
.tile-export-note > svg[data-icon] {
  margin-right: 4px;
  vertical-align: -2px;
}
/* On the toast's inverted ground: the disc in the toast's ink, the check in
   its ground, so it keeps the words' contrast in either theme. */
.undo-toast > svg[data-icon='ok'] path { stroke: var(--wc-text-primary); }

/* A row is one target, as the prototype's (recheck-shell-explore N11): the
   pointer, and bg-hover under it. The selection is the focused row, in the
   prototype's selection colour — nothing is selected at rest (N12, F27). */
.folder-contents tbody tr { cursor: pointer; }
.folder-contents tbody tr:hover > * { background: var(--wc-bg-hover); }
.folder-contents tbody tr:focus-within > * { background: var(--wc-bg-accent-soft); }
/* On the tint, muted text is raised to secondary: text-muted is 4.28:1 on
   accent-soft in dark, below AA (T243's review, direction rule 2). */
.folder-contents tbody tr:focus-within .folder-contents__description,
.folder-contents tbody tr:focus-within > td.is-muted { color: var(--wc-text-secondary); }
/* Move to, over the row beside its ⋯ rather than in its place (N14). */
.folder-contents__actions { position: relative; }
.folder-contents__move {
  position: absolute;
  top: calc(100% - 4px);
  right: 8px;
  z-index: 5;
  padding: 4px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  box-shadow: var(--wc-shadow-pop);
}

/* Dashboard chrome (AC-053). The sidebar is docked at 300 px and the canvas
   takes the rest, per direction.md section 2. Only the chrome is styled here;
   the 12-column canvas grid arrives with it (T060). */
.dashboard__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  /* The prototype's .dash-head. */
  padding: 12px 24px 0;
}
/* The prototype's .dash-head h1; what follows it sits at the right. */
.dashboard__header h1 {
  margin: 0 auto 0 0;
  font-size: var(--wc-text-xl-size);
  line-height: var(--wc-text-xl-line);
  font-weight: var(--wc-text-xl-weight);
  letter-spacing: -0.01em;
}

/* direction.md section 2 makes the canvas and the inspector separate panes,
   and rule 40 asks that re-rendering keep both of their scroll positions.
   That only means anything if each one scrolls on its own: with the window
   scrolling instead there is no canvas position to keep, and dragging the
   sidebar's scrollbar would carry the dashboard along with it.

   So the dashboard is as tall as the space it is given and no taller — the
   viewport less the sticky .app-bar above it — and then hands what is left
   down, so each level keeps its natural height and only the panes absorb the
   difference. main's own padding is inside that height, because everything
   here is border-box.

   The height is on main rather than on .dashboard because .dashboard is not
   always main's only child: DashboardPage puts the save-failure alert beside
   it. Sized the other way, a failed save pushed main past the viewport and
   handed the scrollbar back to the window — the state this rule replaced, in
   the one moment the canvas matters most. Constraining the parent makes any
   sibling simply take its height out of the panes' share.

   min-height: 0 on every level because a flex item defaults to
   min-height: auto and so refuses to shrink below its content, which would
   push the overflow back out to the window.

   :has() rather than a class, so nothing has to remember to set one; the
   sheet already relies on it for .grid-tile:has(.tile-menu__list).

   And it is a subtraction rather than flex: 1 on a full-height shell because a
   flex item still offers its content height to its container's intrinsic size,
   flex-basis: 0 or not — measured, not assumed: the dashboard sized the shell
   to its tallest tile instead of the other way round. Sizing the shell itself
   would fix that and take the window's scrollbar away from every workspace
   that still scrolls the window. Explore, the Model workspace and the chart
   editor now dock themselves the same way. */
main:has(.dashboard) {
  position: relative;
  height: calc(100vh - var(--wc-app-bar-height));
  display: flex;
  flex-direction: column;
  /* Edge to edge, as the prototype's .dash: the header, the tab rule and the
     filter band run the full width, each padded 24 px in (AC-187). */
  padding: 0;
}
.dashboard {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.dashboard__body {
  display: flex;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}

/* direction.md section 2: "fixed-width and centred (max 1440px), with a toggle
   for full width". This is the saved setting AC-018 asks to come back, so it
   has to change the page and not just an attribute. */
/* The prototype's .dgrid padding, round the tiles. */
.dashboard-page { width: 100%; padding: 16px 24px 40px; }
/* A section is a band (AC-202), the prototype's .dsection: 8/12/12 padding,
   and a 36 px head with its ▾, its title at 16/600/22 and its count at 12 px
   muted — not a tile card with a 21 px heading. Its ground is the
   prototype's, between the surface and the page (T247, mismatch 15):
   bg-subtle was darker than the tiles in light and lighter in dark. */
.grid-tile:has(> .dashboard-section) {
  padding: 8px 12px 12px;
  background: color-mix(in srgb, var(--wc-bg-surface) 55%, var(--wc-bg-page));
  overflow: visible;
}
/* A tab group is a band of its own, as dashboard.js draws it (a .dsection,
   its tabs the head): the section's ground and 8/12/12 padding, not a white
   card (T247, N1). T247 first drew it bare; its review found the prototype's
   band. */
.grid-tile:has(> .tab-group) {
  padding: 8px 12px 12px;
  background: color-mix(in srgb, var(--wc-bg-surface) 55%, var(--wc-bg-page));
  overflow: visible;
}
.page-tabs.tab-group__tabs { padding: 0; border-bottom: 0; }
/* .dsection > .dgrid { padding: 8px 0 0 }: the tabs' content 8 px below them. */
.tab-group > [role='tablist'] + * { margin-top: 8px; }
/* The Header and the Divider are the prototype's .dplain: on the page, with
   no border, ground or padding, a 32 px row at least (T247, N5). */
.grid-tile:has(> .dashboard-heading),
.grid-tile:has(> .dashboard-divider) {
  display: flex;
  align-items: center;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: none;
}
/* Their ⋯ centred on the row, and room kept for it: at the tile's corner it
   ran past a 32 px row and was clipped (T247's review). */
.grid-tile:has(> .dashboard-heading) > .tile-menu,
.grid-tile:has(> .dashboard-divider) > .tile-menu {
  top: 50%;
  right: 0;
  transform: translateY(-50%);
}
.dashboard[data-editing='true'] .grid-tile:has(> .dashboard-heading),
.dashboard[data-editing='true'] .grid-tile:has(> .dashboard-divider) { padding-right: 32px; }
/* <h2 style="font-size:20px;line-height:1.3;font-weight:600">: text-lg. */
.dashboard-heading {
  flex: 1;
  margin: 0;
  font-size: var(--wc-text-lg-size);
  line-height: var(--wc-text-lg-line);
  font-weight: var(--wc-text-lg-weight);
}
.dashboard-divider {
  flex: 1;
  margin: 8px 0;
  border: 0;
  border-top: 1px solid var(--wc-border-strong);
}
.dashboard-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
}
.dashboard-section__head h2 {
  margin: 0;
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}
/* <span class="xs muted"> (T247, mismatch 15). */
.dashboard-section__count {
  color: var(--wc-text-muted);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
/* Its ⋯ at the end of the head row, not at a tile's corner offsets. */
.dashboard-section__head .tile-menu { margin-left: auto; position: relative; inset: auto; }
/* The prototype's .dsection > .dgrid: 8 px between the head and its tiles. */
.dashboard-section__head + div { padding-top: 8px; }
.dashboard-section__toggle {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  /* An .iconbtn: radius 6 (T247, mismatch 15). */
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
  font: inherit;
  cursor: pointer;
}
.dashboard-section__toggle:hover { background: var(--wc-bg-hover); color: var(--wc-text-primary); }
/* A markdown tile's text (AC-208): headings on the type scale, lists indented.
   The prototype's .md: 14/22 in the secondary ink, its headings and strong
   text primary (T247, N6). */
.markdown {
  overflow-wrap: anywhere;
  font-size: var(--wc-text-sm-size);
  line-height: 22px;
  color: var(--wc-text-secondary);
}
.markdown h3,
.markdown h4,
.markdown strong { color: var(--wc-text-primary); }
.markdown code {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--wc-bg-subtle);
  font: 12px/16px var(--wc-font-code);
}
.markdown > :first-child { margin-top: 0; }
.markdown > :last-child { margin-bottom: 0; }
/* Sized by the markdown's own level: "#" text-xl, "##" the prototype's .md h2
   at text-lg and deeper text-md, while the element stays below the tile's
   title in the page's outline (Markdown.tsx). */
.markdown h3,
.markdown h4 { margin: 0 0 4px; font-size: 16px; line-height: 22px; font-weight: 600; }
.markdown [data-level='1'] {
  font-size: var(--wc-text-xl-size);
  line-height: var(--wc-text-xl-line);
}
.markdown [data-level='2'] {
  font-size: var(--wc-text-lg-size);
  line-height: var(--wc-text-lg-line);
}
.markdown p { margin: 0 0 8px; }
.markdown ul,
.markdown ol { margin: 0 0 8px; padding-left: 20px; }
.dashboard-page[data-width='fixed'] { max-width: 1440px; margin-inline: auto; }
.dashboard-page[data-width='full'] { max-width: none; }
/* position: relative so the canvas is a containing block as well as a scroll
   container. Without it an absolutely positioned descendant with no nearer
   positioned ancestor — the visually-hidden aria-live region at the end of the
   canvas is one — resolves against the page instead, which neither clips it
   nor scrolls it, so it stretches the document and the window gains a second
   scrollbar behind the canvas's own. WebKit showed it first (AC-067's e2e
   test measured window.scrollY at 22 there). */
.dashboard__canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
/* The page tabs and filter bar (AC-196): the prototype's .dash-tabs and
   .filterbar rows, above the canvas and the sidebar at full width (T246) —
   so the canvas scrolls beneath them and nothing scrolls under them. Raised,
   so a filter's popover or a chip's menu opens over the tiles below. */
.dashboard__fixed {
  position: relative;
  z-index: 4;
  background: var(--wc-bg-page);
}
/* The dashboard's frame while it loads (T251, F15): its header's rows, the
   tab strip and the band at their own heights, and tiles with a chart's
   shape in them, each part a placeholder bar on the subtle ground. */
.skeleton-bar {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--wc-bg-subtle);
}
.dashboard-loading__crumbs { display: block; flex-basis: 100%; height: 24px; }
.dashboard-loading__crumbs > .skeleton-bar { width: 160px; height: 16px; margin-top: 4px; }
.dashboard-loading__title { display: block; height: 32px; margin-right: auto; }
.dashboard-loading__title > .skeleton-bar { width: 280px; height: 24px; margin-top: 4px; }
.dashboard-loading__status { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
.dashboard-loading__tab { display: block; height: 36px; padding: 10px 12px; }
.dashboard-loading__tab > .skeleton-bar { width: 72px; height: 14px; }
.dashboard-loading__grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
}
.dashboard-loading__grid .tile-head > .skeleton-bar { width: 45%; height: 14px; }
/* A failed tile's Details (T251): the error, then the query, which scrolls
   within the tile rather than widening it. */
.tile-error__detail {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-secondary);
}
.tile-error__query {
  margin: 4px 0 0;
  max-height: 160px;
  overflow: auto;
  font-family: var(--wc-font-code);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}
/* <span class="xs muted"> (T246, mismatch 6). */
.filter-bar__hint {
  color: var(--wc-text-muted);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
/* A page with no tiles (AC-207): the prototype's centred sentence. */
.dashboard-empty {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 24px;
  color: var(--wc-text-secondary);
  text-align: center;
}
.dashboard-empty p { margin: 0; }

/* The settings gear (AC-069). In the header in both view and edit mode, so it
   sits between the title and whatever the mode puts on the right. */
/* The settings gear: the prototype's icon button, last in the header. */
.dashboard__gear { flex: none; }
/* Copy link with marks, said beside the chips (T129). */
.mark-chip-note { color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); white-space: nowrap; }
/* Bookmarks (T127): a reader's control, before the gear. */
.dashboard__bookmarks { flex: none; position: relative; }
.dashboard__bookmarks-button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 12px; }
/* Its popover (T367; design 10, state B): 320 px from the button's right
   edge, Mine then Shared under 12/600 capitals, each row its name in 14/600
   and its visibility, icon and label, in 12 px secondary under it, with the
   row's ⋯ beside both. */
.bookmarks {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  width: min(320px, calc(100vw - 32px));
  /* Not a scroll box: a row's ⋯ menu hangs out of it, as design 10 draws it,
     and a scroll box would clip it (T367's review). A long list grows the
     page instead. */
  padding: 4px 0;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  box-shadow: var(--wc-shadow-pop);
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
}
.bookmarks:focus { outline: none; }
.bookmarks:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
.bookmarks__note { margin: 0; padding: 8px 12px; color: var(--wc-text-secondary); }
.bookmarks__section + .bookmarks__section { margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--wc-border-subtle); }
.bookmarks__heading {
  margin: 0;
  padding: 8px 12px 4px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--wc-text-secondary);
}
.bookmarks__list { margin: 0; padding: 0; list-style: none; }
.bookmarks__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px 8px;
  align-items: center;
  padding: 6px 8px 6px 12px;
}
.bookmarks__row:hover { background: var(--wc-bg-hover); }
.bookmarks__name {
  grid-column: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  font-weight: 600;
  text-align: left;
  overflow-wrap: anywhere;
}
.bookmarks__name:hover:not(:disabled) { background: none; text-decoration: underline; }
.bookmarks__visibility {
  grid-column: 1;
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
.bookmarks__visibility svg { flex: none; }
.bookmarks__row > .menu-button { grid-column: 2; grid-row: 1 / span 2; }
/* Its menu as wide as its longest item, on one line (design 10 draws 318 px). */
.bookmarks__row .menu-button__menu { width: max-content; max-width: calc(100vw - 32px); }
.bookmarks__row .menu-button__item { white-space: nowrap; }
/* A menuitemradio's ✓ column (T689's review): the chosen one marked in the accent. */
.menu-button__check { flex: none; width: 12px; color: var(--wc-accent); font-weight: 600; }
.bookmarks__foot { margin-top: 4px; padding: 8px 12px 4px; border-top: 1px solid var(--wc-border-subtle); }
.dialog.share-bookmark { width: min(440px, calc(100vw - 32px)); }
.share-bookmark__who { margin: 0 0 12px; color: var(--wc-text-secondary); }
.dialog.save-bookmark { width: min(420px, calc(100vw - 32px)); }
.save-bookmark form { display: grid; gap: 12px; }
.save-bookmark__name { display: grid; gap: 4px; }
.save-bookmark__keeps { margin: 0; color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); }
/* "Mark range…" (T636): as the bookmark's name dialog, a from and a to side by side. */
.dialog.mark-range { width: min(420px, calc(100vw - 32px)); }
.mark-range form { display: grid; gap: 12px; }
.mark-range__axis { margin: 0 0 12px; color: var(--wc-text-secondary); }
.mark-range__ends { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.mark-range__ends .field { display: grid; gap: 4px; }
.mark-range__add { display: flex; gap: 8px; align-items: center; }

/* The settings page (AC-069). Full-viewport like the chart editor: it takes
   the place of the dashboard rather than floating over it, so there is one bar
   on screen and one meaning of Save. .dashboard--overlaid is the same height
   box as .dashboard, so the page inherits the pane sizing rule 40 set up. */
/* An overlay covers the dashboard rather than replacing it (T032): it sits
   over exactly the box the dashboard occupies, inside main's padding, while
   the dashboard keeps its place and its geometry beneath. Hidden with
   visibility, which changes no layout, so its scroll positions are intact
   when the overlay closes (AC-067) and its tab groups are still on the tab
   they were on. */
.dashboard--overlaid {
  position: absolute;
  /* main has no padding round a dashboard (AC-187), so nothing to keep clear. */
  inset: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.dashboard--under-overlay { visibility: hidden; }
/* In My workspace, Settings opens under the workspace band, which says whose
   it is on every page inside the workspace (T685, DSH-06; design 04 pin 2,
   rule 72): the band is one 32 px line. */
main:has(> .workspace-band) .dashboard--overlaid:has(> .settings-page) { top: 32px; }
/* The dashboard settings page, the prototype's settings overlay (T249,
   index.html 2107–2205): a 41 px head, a 220 px nav, and the section's
   content flat on the page, not in a card. */
.settings-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.settings-page__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
/* 16 px as the prototype's h1; 600, not its 700 (direction.md §3). */
/* Design 05 pin 1 (T685): at least 44 px, the designs' pane head; the title
   16/22. */
.settings-page__bar { min-height: 44px; }
.settings-page__title { margin: 0 0 0 8px; font-size: 16px; line-height: 22px; font-weight: 600; }
.settings-page__spacer { flex: 1; }
/* "· 1 unsaved change" beside the title, and "Esc cancels" before Cancel,
   in xs muted ink. */
.settings-page__unsaved,
.settings-page__hint {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-muted);
}
.settings-page__actions { display: flex; gap: 8px; }
/* A state said in the bar (saving, a refused save) takes a line of its own. */
.settings-page__bar > .settings-page__state { flex-basis: 100%; margin: 0; }
.settings-page__bar .btn-sm { border-radius: 6px; }
.settings-page__body { display: flex; align-items: stretch; flex: 1; min-height: 0; }
/* .settings-nav: 220 px on the surface, ruled off from the content. */
.settings-page__nav {
  flex: 0 0 220px;
  display: grid;
  align-content: start;
  padding: 8px 0;
  overflow: auto;
  min-height: 0;
  border-right: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
/* .settings-nav .file: 32 px rows at 12 px, flush to the nav's edges. */
.settings-page__nav button {
  height: 32px;
  padding: 0 12px 0 24px;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--wc-text-primary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.settings-page__nav button:hover { background: var(--wc-bg-hover); }
.settings-page__nav button[aria-current='true'],
.settings-page__nav button[aria-current='true']:hover {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: 600;
  /* Its accent edge (design 05 pin 2; T685). */
  box-shadow: inset 2px 0 0 var(--wc-accent);
}
/* Flat, padded 24/32 (T685; R76 dashboard-Q5: design 05's 20 top is off the
   spacing scale), with 48 under the last. */
.settings-page__panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 24px 32px 48px;
}
/* min-width 0: a wide cross-filter matrix scrolls in its own box rather than
   widening the grid's track and the panel with it (T249's review). */
.settings-page__panel > * { max-width: 872px; min-width: 0; }
.settings-page__panel > h2 { margin: 0; font-size: 18px; line-height: 24px; font-weight: 600; }
/* The Interactions intro, 4 under the heading and 16 above the cards
   (design 05; T685), against the panel's 12 px gap. */
.settings-page__panel > .settings-page__intro--modes { margin: -8px 0 4px; max-width: 760px; }
.settings-page__panel p { margin: 0; }
.settings-page__later,
.settings-page__intro { color: var(--wc-text-secondary); }
.settings-page__subhead {
  margin: 8px 0 0;
  font-size: var(--wc-text-md-size);
  line-height: var(--wc-text-md-line);
  font-weight: 600;
}
/* .formgrid: fields two or more to a row, a wide one the whole row. */
.settings-form {
  display: grid;
  gap: 8px 16px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  align-items: start;
}
.settings-form__wide { grid-column: 1 / -1; }
.settings-form textarea { font-size: 12px; line-height: 18px; }
/* General's Name and Folder at 28/12, the page's compact controls, as its
   description already is (T685, DSH-09; T476's Q2). */
.settings-form input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']),
.settings-form select { height: 28px; font-size: 12px; }
/* The prototype's .warnbar for a section whose mode is not in use (F28). */
.settings-page__inactive {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 20px;
  background: color-mix(in srgb, var(--wc-status-warning-icon) 16%, var(--wc-bg-surface));
  color: var(--wc-text-primary);
}
.settings-page__inactive > svg[data-icon] { flex: none; margin-top: 3px; color: var(--wc-status-warning-icon); }
/* Settings › Markings (AC-198): the prototype's colour slots, default radio,
   and a tile's limit checkboxes, each with its marking's swatch. */
.markings-table td,
.markings-table th[scope='row'] { vertical-align: middle; }
.markings-table th[scope='row'] { background: none; font-weight: 600; }
.marking-slots { display: inline-flex; gap: 2px; align-items: center; }
.marking-limits { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.marking-default { display: inline-flex; gap: 6px; align-items: center; }
/* .mk-slot: 22 × 24, a transparent rule, ringed in the accent when chosen.
   The radio lies over it, unseen, so it is what a pointer presses. */
.marking-slot {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 24px;
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 4px;
}
.marking-slot:has(input:checked) { border-color: var(--wc-accent); box-shadow: 0 0 0 1px var(--wc-accent); }
.marking-slot > input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
/* Clear of the chosen ring by a gap, so focus is not read as the choice
   (T249's review, AC-176). */
.marking-slot:has(input:focus-visible) { outline: 2px solid var(--wc-accent); outline-offset: 3px; }
/* .mk-swatch: the colour, ringed inside in border-strong. */
.marking-swatch {
  display: inline-block;
  flex: none;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px var(--wc-border-strong);
  vertical-align: middle;
}
.marking-slot > .marking-swatch { width: 16px; height: 16px; }
/* .chk: a limit, a 12 px pill with its checkbox and the marking's swatch. */
.marking-limit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  font-size: 12px;
}
.marking-limit > .marking-swatch { width: 10px; height: 10px; }
/* The marking a tile marks with is not one it can be limited by: said in
   muted ink (not the prototype's opacity, which takes the text under AA). */
.marking-limit:has(input:disabled) { color: var(--wc-text-muted); }
.settings-page input[type='radio'],
.settings-page input[type='checkbox'] { accent-color: var(--wc-accent); }
/* The page's small controls are the prototype's .input.sm and .select.sm. */
.settings-page input.input-sm:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']),
.settings-page .select-sm { height: 28px; font-size: 12px; }
.markings-add { display: flex; gap: 12px; align-items: center; }

/* "Limit data using markings" (AC-108). The reason sits beside the option it
   explains, not in a tooltip: a disabled control with no explanation is the
   most frustrating kind, because the user cannot tell whether it is broken,
   forbidden, or waiting on something they have not done. */
.tile-limits { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
/* The prototype's .lbl over 28 px rows at 12/600 (T248, mismatch 25). */
.tile-limits legend {
  padding: 0 0 8px;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
}
.tile-limits__row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-height: 28px;
  /* A .field's label, as the prototype's rows are: 12/16/600 secondary
     (dashboard.js:431-434; T248's review). */
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
}
.tile-limits__reason {
  flex: 1 1 100%;
  padding-left: 24px;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
}

/* The nothing-marked state (AC-109). The message is the default, and it reads
   as instruction rather than failure: secondary ink, centred in the tile, no
   error colour. A details tile waiting for a mark is working correctly.
   Both states fill the tile, so the tile keeps its size in the grid instead of
   collapsing and shoving its neighbours around every time a mark is cleared. */
.nothing-marked {
  display: grid;
  place-content: center;
  height: 100%;
  margin: 0;
  padding: 16px;
  color: var(--wc-text-secondary);
  text-align: center;
}
/* Which of the two interaction modes is in effect (AC-070, rule 56). Pushed to
   the end of the nav row, in secondary ink: it reports state rather than
   naming the destination, so it must not compete with the section name. */
.settings-page__nav button { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.settings-page__activity {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: var(--wc-text-xs-size);
  font-weight: 400;
  color: var(--wc-text-secondary);
}
.settings-page__nav button[aria-current='true'] .settings-page__activity { color: var(--wc-accent); }
.settings-page__activity > svg[data-icon='ok'] { color: var(--wc-status-success); }
/* direction.md calls these radio cards, so they are cards: the whole option is
   the target, not a 13px circle beside it. The prototype's .radio-card (T249,
   F27, mismatch 33): 12 px padding, radius 8, a strong rule; the chosen one
   ringed in the accent over a 40 % tint of its soft ground. */
/* Design 05's metrics in §4's tokens (T685; R76 dashboard-Q5): cards padded
   16 with a border-subtle rule, 16 apart, at §4's 6 px radius where the
   design draws 8; the chosen one ringed in the accent over a 40 % tint. */
.settings-modes { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
.settings-modes legend { padding: 0 0 8px; font-weight: var(--wc-text-sm-strong-weight); }
.settings-page__panel > .settings-modes { max-width: 1060px; }
.settings-modes__cards {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.settings-modes__card {
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 16px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.settings-modes__card:has(input:checked) {
  border-color: var(--wc-accent);
  box-shadow: 0 0 0 1px var(--wc-accent);
  background: color-mix(in srgb, var(--wc-bg-accent-soft) 40%, var(--wc-bg-surface));
}
.settings-modes__choice { display: grid; gap: 12px; cursor: pointer; }
.settings-modes__top { display: flex; align-items: flex-start; gap: 10px; }
.settings-modes__top > input { flex: none; width: 18px; height: 18px; margin: 1px 0 0; }
.settings-modes__text { display: grid; gap: 2px; }
.settings-modes__name { font-size: 14px; line-height: 20px; font-weight: 600; }
/* 14/20 where design 05 draws 13/19, which is off the type scale (R76
   principle 2; accepted-differences.md). */
.settings-modes__about {
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
  color: var(--wc-text-secondary);
}
/* The picture: 128 px on the page's ground, the product's own marks in the
   first two series slots and the first marking (design 05 pin 4). */
.settings-modes__illus {
  display: grid;
  place-items: center;
  height: 128px;
  overflow: hidden;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-page);
}
.settings-modes__picture { max-width: 100%; height: auto; }
.settings-modes__frame { fill: var(--wc-bg-surface); stroke: var(--wc-border-subtle); }
.settings-modes__s1 { fill: ${CATEGORICAL.light[0]}; }
.settings-modes__s2 { fill: ${CATEGORICAL.light[1]}; }
:root[data-theme='dark'] .settings-modes__s1 { fill: ${CATEGORICAL.dark[0]}; }
:root[data-theme='dark'] .settings-modes__s2 { fill: ${CATEGORICAL.dark[1]}; }
.settings-modes__marked { stroke: var(--wc-mk1); stroke-width: 1.5; }
.settings-modes__clicked { fill: var(--wc-crossfilter); }
.settings-modes__arrow { fill: none; stroke: var(--wc-text-muted); stroke-width: 1.5; }
/* 12 px, the floor, where the design draws 11 (R76 components-Q5). */
.settings-modes__caption { font-size: 12px; fill: var(--wc-text-secondary); }
/* How readers use it: each gesture a chip with its key as a keycap. */
.settings-modes__gestures { display: flex; flex-wrap: wrap; gap: 6px; }
.settings-modes__gestures > span {
  padding: 3px 7px;
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
/* 12 px where the design draws 11 (R76 components-Q5). */
.settings-modes__gestures kbd {
  font-family: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-primary);
}
/* What the mode is set up with, ruled off, its link at the end. */
.settings-modes__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--wc-border-subtle);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
.settings-modes__foot b { font-weight: 600; color: var(--wc-text-primary); }
.settings-modes__swatches { display: inline-flex; gap: 4px; }
.settings-modes__swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px var(--wc-border-strong);
}
button.settings-modes__link {
  margin-left: auto;
  padding: 0;
  border: 0;
  background: none;
  color: var(--wc-accent);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: 600;
  cursor: pointer;
}
button.settings-modes__link:hover { text-decoration: underline; }
/* Under the cards, what switching does: an info line on the surface. */
.settings-page__info {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 8px;
  max-width: 1060px;
  margin-top: 4px;
  padding: 10px 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
.settings-page__panel > .settings-page__info { max-width: 1060px; }
.settings-page__info > svg[data-icon] { margin-top: 1px; color: var(--wc-accent); }
.settings-field { display: grid; gap: 4px; max-width: 420px; }
.settings-field input {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
}
/* A field's label, where the control beside it is not one label can wrap. */
.settings-field__label {
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.settings-page__note {
  margin: 12px 0 4px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}

/* The prototype's .grid-table and .tscroll (AC-187): 12 px, tabular figures,
   a 28 px sticky head and 24 px rows, ruled off row by row. The cross-filter
   matrix (AC-118) is the first of these in the app. */
.table-scroll { overflow: auto; }
.grid-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
/* Only the column heads stick: a row header is in the body, and pinning it
   would park every row's name at the top of its column (T124's review). */
.grid-table thead th {
  position: sticky;
  top: 0;
}
.grid-table th {
  height: 28px;
  padding: 0 8px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-subtle);
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
}
.grid-table td {
  height: 24px;
  padding: 0 8px;
  border-bottom: 1px solid var(--wc-border-subtle);
  white-space: nowrap;
}
.grid-table tbody tr:hover td { background: var(--wc-bg-hover); }
.grid-table__self { color: var(--wc-text-muted); }
/* A table or pivot in a tile, as the prototype's .grid-table.comfy (T304,
   charts.js tableHtml and pivotHtml): 34 px rows. A pivot's corner sticks
   with the heads, on their ground; its row names are pivotHtml's td.strong,
   in 600 on the row's own ground, as are its totals. */
/* A table or pivot tile's rows: §4's dense 24 px row, as the editor's
   results grid (T683; R76 dashboard-Q4), where the prototype's were 34. */
.grid-table.comfy tbody td,
.grid-table.comfy tfoot td { height: 24px; }
.grid-table thead td {
  height: 28px;
  padding: 0 8px;
  position: sticky;
  top: 0;
  background: var(--wc-bg-subtle);
  border-bottom: 1px solid var(--wc-border-subtle);
}
.grid-table tbody th,
.grid-table tfoot th { background: transparent; }
.grid-table.comfy tbody th,
.grid-table.comfy tfoot th { height: 24px; }
.grid-table tbody tr:hover th { background: var(--wc-bg-hover); }
.grid-table__total { font-weight: 600; }
/* A table's row or a pivot's cell marked in part (T453, R43): the
   prototype's .mk-part, a 3 px rule down its left in the secondary colour,
   and its marked share said beside each measure. */
.data-table tr[data-marked='partly'] > td:first-child,
.pivot-table td[data-marked='partly'] {
  box-shadow: inset 3px 0 0 var(--wc-text-secondary);
}
.data-table__marked { color: var(--wc-text-secondary); }
/* A table's row or a pivot's cell a marking holds (T507, AC-096; direction.md
   §7a: "Tables: marked rows are bold with a left rule; the others are
   dimmed"): the prototype's .mk-full rule, 3 px, in the marking's colour, a
   marked row's figures in 600; and its .mk-none, the others at 0.45. */
.data-table tr[data-marked='whole'] > td { font-weight: 600; }
.data-table tr[data-marked='whole'] > td:first-child,
.pivot-table td[data-marked='whole'] {
  box-shadow: inset 3px 0 0 var(--wc-mark-colour, var(--wc-text-primary));
}
.data-table tr[data-marked='none'] > td,
.pivot-table td[data-marked='none'] { opacity: 0.45; }
/* The row the keyboard is on (T405, AC-176): the app's 2 px accent ring,
   drawn inside the scrolling table, distinct from a marked row's 3 px rule
   down its left in the marking's colour. */
.data-table tbody tr[data-row-index]:focus { outline: none; }
.data-table tbody tr[data-row-index]:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: -2px; }
/* The prototype's .select.sm, at this table's own 24 px row height rather
   than its 28 px, so a select does not stretch the row it sits in. */
.select-sm {
  height: 24px;
  /* The prototype's .select.sm, padded 0 4 0 8 (mismatch 25, T248's review). */
  padding: 0 4px 0 8px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: 12px;
}

.edit-bar { display: flex; gap: 8px; }
.edit-bar button { height: 32px; padding: 0 12px; border: 1px solid var(--wc-border-strong); border-radius: 6px; background: var(--wc-bg-surface); color: var(--wc-text-primary); cursor: pointer; }
.edit-bar__save { font-weight: var(--wc-text-sm-strong-weight); }
/* "Saving…" with its icon (T183, AC-177), here and on the model's Save. */
.edit-bar__save > svg[data-icon],
.model-editor__head button > svg[data-icon] {
  margin-right: 6px;
  vertical-align: -2px;
}
/* aria-disabled, not :disabled. The bar keeps disabled buttons focusable (the
   APG toolbar pattern, T059), so they are never :disabled and that rule never
   matched: Undo, Redo and Discard looked active when they had nothing to do,
   and a held-back Save looked like the primary action (T032). */
.edit-bar button[aria-disabled='true'] { color: var(--wc-text-muted); cursor: default; }
/* text-on-accent, not white: white on the dark theme's accent is 2.41:1, an AA
   failure the token pair in @wechart/ui exists to prevent (AC-005). */
/* Scoped under .edit-bar: ".edit-bar button" outranks a bare class, and Save
   painted as an ordinary button while the prototype makes it the primary one
   (AC-187, T205's review). */
.edit-bar .edit-bar__save { background: var(--wc-accent); color: var(--wc-text-on-accent); border-color: var(--wc-accent); }
/* Hovered, still the primary button: the global hover repainted it bg-hover. */
.edit-bar .edit-bar__save:hover:not([aria-disabled='true']) {
  background: var(--wc-accent);
  filter: brightness(1.08);
}
/* Undo and Redo: the prototype's .iconbtn — 32 px, borderless until hovered. */
.edit-bar .icon-button {
  width: 32px;
  padding: 0;
  border-color: transparent;
  background: none;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-sm-size);
}
.edit-bar .icon-button:hover:not([aria-disabled='true']) { background: var(--wc-bg-hover); }
/* Nothing to undo: the prototype's ↶ and ↷ at opacity .4 in their own ink
   (T246, mismatch 4), not the muted ink the other buttons take. */
.edit-bar .icon-button[aria-disabled='true'] { color: var(--wc-text-secondary); opacity: 0.4; }
.edit-bar .edit-bar__save[aria-disabled='true'] {
  background: var(--wc-bg-surface);
  color: var(--wc-text-muted);
  border-color: var(--wc-border-strong);
}
/* Why Save is held back, beside it (T032). Secondary ink: it explains, it
   does not alarm — nothing has gone wrong and nothing is lost. */
.edit-bar__blocked { margin: 0; color: var(--wc-text-secondary); font-size: var(--wc-text-sm-size); }

/* The panel scrolls, not the whole sidebar: the tab row is how the user moves
   between panels, so scrolling it out of reach would be the one thing an
   inspector must not do. */
.edit-sidebar {
  display: flex;
  flex-direction: column;
  flex: 0 0 300px;
  min-height: 0;
  overflow: hidden;
  /* The prototype's .pane.right: docked, ruled off on its left only. */
  border-left: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}

/* The prototype's .tabs: 36 px, 12 px at 600, the open panel's tab in the
   accent with its underline (AC-187). */
.edit-sidebar__tabs {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
  padding: 0 8px;
  overflow-x: auto;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
.edit-sidebar__tabs button {
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  color: var(--wc-text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.edit-sidebar__tabs button[aria-selected='true'] {
  color: var(--wc-accent);
  border-bottom-color: var(--wc-accent);
}
/* .tabs button takes no ground in any state, hover included; the global
   button hover would give it bg-hover (T310). */
.edit-sidebar__tabs button:hover:not(:disabled):not([aria-disabled='true']) {
  background: none;
  color: var(--wc-text-primary);
}
.edit-sidebar__tabs button[aria-selected='true']:hover:not(:disabled) { color: var(--wc-accent); }
.edit-sidebar__panel { flex: 1; min-height: 0; overflow: auto; }

/* A panel's sections (the prototype's .section), each headed in small
   capitals, and its fields (.field): a 12/16 600 label over the control. */
.panel-section {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.panel-section > h3 {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.panel-section__note { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
/* A chart tile's Chart section (AC-203): its title strong, its type and
   source beneath with the source in the code face, and Edit chart. */
.chart-section__title { margin: 0; font-size: var(--wc-text-sm-size); line-height: 20px; font-weight: 600; color: var(--wc-text-primary); }
/* Its buttons run the section's width, as the prototype's do (T248, mismatch 25). */
.chart-section > button { width: 100%; justify-content: center; }
.chart-section__source { font-family: var(--wc-font-code); }
/* A sized tile's Layout, collapsed as the prototype's is: its summary set as
   a section heading, at the same inset. */
details.panel-section { display: block; }
.layout-section > summary {
  cursor: pointer;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.layout-section > p { margin-top: 6px; }
/* A chart tile's Ownership (T133, AC-127): Save and Cancel side by side. */
.chart-ownership__actions { display: flex; flex-wrap: wrap; gap: 6px; }
/* "Save to folders…" at the section's width too (T248, mismatch 25). */
.chart-ownership > button { justify-self: stretch; justify-content: center; }
.field { display: grid; gap: 4px; }
/* An inspector's controls are the prototype's .input.sm and .select.sm: 28 px
   at 12 px, direction.md §4's compact row for inspectors. */
.panel-section .field input:not([type='checkbox']):not([type='radio']):not([type='file']),
.panel-section .field select {
  height: 28px;
  padding: 0 4px 0 8px;
  font-size: 12px;
}
/* A markdown tile's text (T394) at the inspector's 12 px too, its height its own. */
.panel-section .field textarea { font-size: 12px; line-height: 18px; }
.field > label {
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
}

/* The Add palette (AC-058). Every entry carries its hint, because the
   difference between "Chart" and "Chart from folders" is the whole of
   direction.md's chart-ownership model and a bare name would not convey it. */
.add-panel__destination { margin: 0; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.add-panel ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 4px; }
.add-panel button {
  width: 100%;
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  text-align: left;
  cursor: pointer;
}
.add-panel button:hover { background: var(--wc-bg-hover); }
/* An element's row: its kind's 24 px chip beside its name and hint, 10 px
   apart, 50 px tall — the prototype's palette row (T248, mismatch 23). */
.add-panel button:has(> .add-panel__icon) {
  grid-template-columns: 24px minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 0;
  align-items: center;
}
.add-panel__icon {
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  background: var(--wc-bg-role-dimension-soft);
  color: var(--wc-role-dimension);
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
}
.add-panel__label { font-weight: 600; }
.add-panel__hint { font-size: 12px; line-height: 16px; color: var(--wc-text-muted); }
/* The four filter kinds, under the Filter entry they came from. */
.add-panel__choices { margin: 4px 0 0 12px !important; }

/* The filter bar (F9; direction.md §2: horizontal, under the title), drawn as
   the prototype's .filterbar: a band on the page ground, ruled off below. */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  /* The height a pill gives it, 10 + 32 + 10 and the rule, whatever it holds:
     a hint or a chip left it shorter, and the tiles jumped as it changed
     (T246, recheck-dashboard N8). */
  min-height: 53px;
  padding: 10px 24px;
  background: var(--wc-bg-page);
  border-bottom: 1px solid var(--wc-border-subtle);
}
/* Each filter is the prototype's .fw pill: its scope tag, the field and what
   it holds, and its control in a popover that opens from it (AC-187). */
.filter-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 6px 0 10px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  font-size: 13px;
}
.filter-pill__scope {
  padding: 0 4px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 3px;
  color: var(--wc-text-muted);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
button.filter-pill__summary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 280px;
  height: 28px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: var(--wc-text-primary);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.filter-pill__caret { color: var(--wc-text-muted); font-weight: 400; }
/* Its field at 400, what it holds at 600 (T683; R76 components-Q2). */
.filter-pill__label { font-weight: 400; }
.filter-pill__value { font-weight: 600; }
button.filter-pill__clear {
  width: 24px;
  min-width: 24px;
  height: 24px;
  border: 0;
  background: none;
  color: var(--wc-text-secondary);
}
.filter-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  display: grid;
  gap: 8px;
  min-width: 260px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  box-shadow: var(--wc-shadow-pop);
  font-size: var(--wc-text-sm-size);
}
.filter-popover input[type='number'] { width: 7em; }
/* A filter selected while editing (T468, UX-031), marked as a selected tile
   is: its settings are the ones in Properties. */
.filter-pill[data-selected='true'] { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
/* Its settings in Properties: its field, where it applies, and Remove. */
.filter-settings { display: grid; gap: 6px; }
.filter-settings__label {
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.filter-settings__remove { justify-self: start; margin-top: 6px; }
.filter-widget { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.filter-widget__options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 480px;
  max-height: 96px;
  overflow: auto;
}
.filter-widget__options button {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 14px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  cursor: pointer;
}
.filter-widget__options button[aria-pressed='true'] {
  background: var(--wc-accent);
  border-color: var(--wc-accent);
  color: var(--wc-text-on-accent);
}
/* A chart with no rows (AC-043): said in words, in secondary ink. */
.tile-no-rows { padding: 8px 0; color: var(--wc-text-secondary); }
.tile-no-rows p { margin: 0 0 4px; }
.tile-no-rows__headline { color: var(--wc-text-primary); font-weight: 600; }
.tile-no-rows ul { margin: 0; padding-left: 18px; }
/* An image tile (AC-063): the image fills the tile, fitted inside or cropped. */
.image-tile { position: relative; height: 100%; min-height: 64px; }
.image-tile__image { display: block; width: 100%; height: 100%; }
.image-tile__image--contain { object-fit: contain; }
.image-tile__image--cover { object-fit: cover; }
.image-tile__warning {
  position: absolute;
  top: 4px;
  left: 4px;
  margin: 0;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--wc-bg-surface);
  border: 1px solid var(--wc-border-strong);
  color: var(--wc-text-primary);
  font-size: 12px;
}
.image-tile__empty { margin: 0; color: var(--wc-text-secondary); }
/* A link tile (AC-064): Button, Primary or Text link (direction.md §2). */
.link-tile--button,
.link-tile--primary {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border-radius: 4px;
  border: 1px solid var(--wc-border-strong);
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  text-decoration: none;
}
.link-tile--primary {
  background: var(--wc-accent);
  border-color: var(--wc-accent);
  color: var(--wc-text-on-accent);
}
.link-tile--text { color: var(--wc-accent); text-decoration: underline; font-weight: 600; }
.link-tile--primary { font-weight: 600; }
/* Link and image tiles draw no tile chrome: no padding, border or ground
   (T683; direction §2; the prototype's dashboard.js 322, 329; CMP-13). */
.dashboard:not([data-editing='true']) .grid-tile:has(> .link-tile, > .image-tile) {
  padding: 0;
  border: 0;
  background: none;
}
.tile-properties__found { margin: 0; padding: 0; list-style: none; }
.tile-properties__found li { padding: 4px 8px; cursor: pointer; }
.tile-properties__found li:hover,
.tile-properties__found li:focus { background: var(--wc-bg-subtle); }
.tile-properties__hint { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
.tile-properties__problem { margin: 0; color: var(--wc-text-primary); }
/* A tile a filter in effect cannot reach (AC-079): said on the tile, in
   secondary ink with an icon-free label, since it is information, not an error. */
.tile-not-covered {
  margin: 0;
  font-size: 12px;
  color: var(--wc-text-secondary);
}
.tile-not-covered__why {
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-muted);
}
/* After a refresh a pre-aggregation answered (T154, AC-148): in the tile's
   flow like the note above, so it covers nothing, with the accelerated icon
   beside the words and a dismiss at the end. */
.tile-note {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  margin: 0 0 4px;
  padding: 4px 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-subtle);
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-primary);
}
.tile-note code { font-size: var(--wc-text-xs-size); overflow-wrap: anywhere; }
.tile-note a { color: var(--wc-accent); }
.tile-note button {
  margin-left: auto;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--wc-text-secondary);
  cursor: pointer;
}
/* A tile's head: the prototype's .tile-head — the chart's title, then the
   tile's own controls. Room is kept at the right for the pencil and the ⋯
   menu, which sit over the tile's corner. */
.tile-head {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 22 in every mode, a chart head's height in the prototype, whose 22 px
     badge it carries in both modes (dashboard.js), and in view mode here
     (T252): edit mode's head names the kind and has no "Table view", and at
     20 it drew a chart 2 px taller than the same tile in view mode and in
     the editor's preview (AC-034). */
  min-height: 22px;
  margin-bottom: 8px;
  /* The prototype puts the tile's two 26 px actions at the end of this row;
     here they sit over the tile's corner, so the row keeps their room
     (26 + 2 + 26, and its 8 px gap) and nothing lies under them. */
  padding-right: 62px;
}
/* The title takes the head's room before the freshness badge does (T250):
   the badge gives way first, its words cut short with the whole sentence in
   its tooltip, so a narrow tile never squeezes its title to nothing. */
.tile-head__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
  font-weight: var(--wc-text-sm-strong-weight);
  color: var(--wc-text-primary);
}
/* The head is the title's (T464, UX-104; the user's answer to question 29):
   while a badge shares it, the title keeps its whole width and the badge
   alone gives way; where even the badge's least width leaves too little, the
   badges go to the foot (badgePlace.ts). Flex shrinking shares a loss between
   everything that can shrink, so a title that could shrink at all lost a
   fraction of a pixel — its ellipsis drawn, "Custome…" — while the badge,
   which had room to spare, kept the head. */
.tile-head:has(> .tile-freshness, > .mark-badge, > .tile-busy) > .tile-head__title {
  flex-shrink: 0;
}
/* The small button's 24 px — a pointer target's minimum — overhanging the
   row by a pixel each way, so the head stays the prototype's 22 (T252,
   mismatch 9) with the badges beside it. */
.tile-head .tile-head__action { margin: -1px 0 -1px auto; }
/* A table tile's rows, "626 rows · first 100", at the head's end in xs muted
   tabular figures (T683; design 04 pin 7). */
.tile-head__count {
  flex: none;
  margin-left: auto;
  color: var(--wc-text-muted);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* "Table view" keeps its words on one line; the title and badge give way. */
.tile-head .tile-head__action { flex: none; white-space: nowrap; }
/* In a narrow head — a three- or four-column tile, or a tile in a phone's
   column (T250) — "Table view" is drawn as an icon, its words kept as its
   text and name, so the title keeps room beside the freshness badge. */
.chart-tile > .tile-head { container: tile-head / inline-size; }
@container tile-head (max-width: 360px) {
  .tile-head__action > .tile-head__action-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .tile-head .tile-head__action { width: 24px; padding: 0; justify-content: center; }
  /* Decorative: the empty alternative keeps the glyph out of its name. */
  .tile-head .tile-head__action::before {
    content: '⊞';
    content: '⊞' / '';
    font-size: 14px;
    line-height: 1;
  }
  .tile-head .tile-head__action[aria-pressed='true']::before {
    content: '▥';
    content: '▥' / '';
  }
}
/* A chart whose filtered answer is on its way (AC-078): still drawn, dimmed. */
/* What is drawn fades while it is asked again; the head — the title, and the
   "Updating…" that says so — keeps its contrast (T183's review, AC-005). */
.chart-tile--busy > :not(.tile-head, .tile-notes, .tile-foot) { opacity: 0.55; transition: opacity 120ms ease-in; }
/* Said in the head — or under the chart where the head has no room for it
   beside the title (T402) — as well as by the fade (T183, AC-177). */
.tile-busy {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: var(--wc-text-secondary);
}
.tile-busy > svg[data-icon] { color: var(--wc-accent); }
.filter-bar__tiles { flex-basis: 100%; border: 0; margin: 0; padding: 0; }
/* The interaction chips sit at the end of the bar (direction.md §7). */
.filter-bar__spacer { flex: 1; }
.cross-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
/* The prototype's .chip (AC-187): a 24 px pill in the cross-filter colour,
   on a tint of it, with a dismiss at the end. */
.cross-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 4px 0 10px;
  border: 1px solid var(--wc-crossfilter);
  border-radius: 999px;
  background: color-mix(in srgb, var(--wc-crossfilter) 12%, var(--wc-bg-surface));
  color: var(--wc-text-primary);
  font-size: 12px;
}
.cross-chip__what { font-weight: 600; }
/* Which tile it came from: present, but not competing with the value. */
.cross-chip__from { color: var(--wc-text-secondary); }
.cross-chip button {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: inherit;
  cursor: pointer;
}
.cross-chip button:hover { background: color-mix(in srgb, var(--wc-crossfilter) 22%, transparent); }
.filter-bar__tiles legend { color: var(--wc-text-secondary); }
.filter-bar__tiles label { margin-right: 10px; white-space: nowrap; }
fieldset.filter-widget { border: 0; margin: 0; padding: 0; min-width: 0; }
/* Every widget names its field on screen, the same way (T082's review). */
.filter-widget__label {
  float: left;
  margin-right: 8px;
  line-height: 32px;
  color: var(--wc-text-secondary);
}
.filter-widget__cut {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: var(--wc-text-secondary);
}
.filter-widget--checkbox label:not(.filter-widget__label) { margin-right: 10px; white-space: nowrap; }
/* Section templates, set apart from the palette above them: one click here
   lays out several tiles rather than one (AC-068), and a run of identical
   buttons would not say so. The dashed border is the prototype's. */
.add-panel ul[aria-label='Section templates'] button {
  border-style: dashed;
  border-color: var(--wc-border-strong);
  background: none;
}
/* A chart tile with nothing in it yet (AC-068). It states what it needs, so it
   is instruction rather than failure: secondary ink and no error colour, set
   away from the tile's edges so it reads as a waiting tile rather than a
   broken one. */
/* At 12 px under the tile's head, as the prototype says what a chart still
   needs (T252, F13); the tile's own padding is its edge. */
.tile-empty {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  text-align: center;
}
/* Centred where there is room; from the top where there is not, rather than
   spilling up over the head (T252's review): auto margins give way, where
   centring would overflow both ways. */
.tile-empty > :first-child { margin-top: auto; }
.tile-empty > :last-child { margin-bottom: auto; }
.tile-empty p { margin: 0; }

/* The marking badge and chip (AC-098, rule 50). These are what make the
   marking palette legal: direction.md's audit puts dark-mode mk1 against mk4
   at ΔE 6.8 under colour-blindness simulation, inside the 6-8 floor band,
   which is allowed "only with secondary encoding, which chips and badges
   provide by always naming the marking". The swatch is decorative; the text
   carries the meaning. */
.mark-badge,
.mark-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
}
/* In the tile's header row beside the title (AC-201): the prototype's .mbadge,
   a 20 px pill, 12/600, bordered border-strong. */
.mark-badge {
  /* Whole, never cut short: a tile whose head has no room for it beside the
     whole title draws it in its foot instead (T402, AC-201). */
  flex: 0 0 auto;
  height: 20px;
  /* .mbadge { padding: 0 6px; color: var(--text-secondary); background: var(--bg-subtle) }
     (T246, mismatch 11). */
  padding: 0 6px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-weight: var(--wc-text-xs-strong-weight);
  white-space: nowrap;
}
/* A tile menu's marked-rows group (AC-199), headed by its marking and count. */
.tile-menu__group { display: grid; border-bottom: 1px solid var(--wc-border-subtle); }
/* A group's heading in the picker: 12/16 muted at 400 (T253, mismatch 14). */
.tile-menu__heading {
  /* The prototype's picker heading, padded 6 6 2 (dashboard.js:247, :273). */
  padding: 6px 6px 2px;
  color: var(--wc-text-muted);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-weight);
}
/* The prototype's .mk-swatch: radius 3, ringed in border-strong so a pale
   marking colour still reads on the surface — 8 px in a badge, 10 in a chip
   (T246, mismatches 8 and 11). */
.mark-badge__swatch,
.mark-chip__swatch {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px var(--wc-border-strong);
  flex: 0 0 auto;
}
.mark-chip__swatch { width: 10px; height: 10px; }
/* The prototype's .mchip (AC-200): 24 px high, 999 px radius, 12 px, bordered
   1.5 px in the marking's colour (set inline) on the surface; the name at 600
   and the rest at 400 — the prototype's weights, where references-markings.md
   had the whole chip at 600. */
.mark-chip {
  height: 24px;
  /* .mchip { padding: 0 2px 0 8px } (T246, mismatch 8). */
  padding: 0 2px 0 8px;
  border: 1.5px solid var(--wc-border-strong);
  border-radius: 999px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: var(--wc-text-xs-size);
  white-space: nowrap;
}
.mark-chip { max-width: 520px; }
.mark-chip__name { font-weight: var(--wc-text-xs-strong-weight); }
/* The summary gives way first: bounded to two values and "+n" already, and
   ellipsised past the chip's width, the whole of it in its title. */
/* .msum in the secondary ink; "from …" a .xs.muted span (T246, mismatch 8). */
.mark-chip__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--wc-text-secondary);
}
.mark-chip__from { color: var(--wc-text-muted); line-height: var(--wc-text-xs-line); }
.mark-chip .menu-button { display: inline-flex; position: relative; }
/* .mchip button { height: 20px; min-width: 20px; padding: 0 4px }. */
.mark-chip__button {
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
.mark-chip__button:hover { background: var(--wc-bg-hover); color: var(--wc-text-primary); }
/* A filter made from a marking (AC-113): a filter-bar chip of the same size as
   a marking's, bordered as a filter rather than in a marking's colour, since
   the marking it came from is cleared. */
.mark-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  max-width: 520px;
  padding: 0 2px 0 8px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-primary);
  font-size: var(--wc-text-xs-size);
  white-space: nowrap;
}
.mark-filter-chip__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.mark-filter-chip__remove {
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
.mark-filter-chip__remove:hover { background: var(--wc-bg-hover); color: var(--wc-text-primary); }

/* AC-059's explanation. Marked out, because it reports something the user did
   not ask for rather than describing what they are about to do. */
.add-panel__message {
  margin: 0;
  padding: 6px 8px;
  border-left: 2px solid var(--wc-accent);
  background: var(--wc-bg-subtle);
}

/* The "+ Add" slot at the end of each container, and the selected element it
   competes with — both are aims at where the next insert lands (AC-058), so
   both have to be visible at a glance. */
/* The prototype's .dadd: 56 px at 600, the accent on its tint when hovered
   or focused (T248, mismatch 24). */
.grid-canvas__add {
  min-height: 56px;
  border: 1px dashed var(--wc-border-strong);
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
  font-weight: var(--wc-text-sm-strong-weight);
  cursor: pointer;
}
.grid-canvas__add:hover:not([aria-pressed='true']),
.grid-canvas__add:focus-visible {
  border-color: var(--wc-accent);
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
}
.grid-canvas__add[aria-pressed='true'] {
  border-style: solid;
  border-color: var(--wc-accent);
  color: var(--wc-text-primary);
}

/* The canvas grid (AC-054). The track count and the tile spans are set as
   inline style by Canvas.tsx, because they are layout the component computes;
   what lives here is the painting. The gridlines are a repeating background
   sized to one column pitch, so they line up with the tracks at any canvas
   width without a second element to keep in step.

   The period has to be the pitch, not the track: with ${String(COLUMNS)}
   tracks and ${String(COLUMNS - 1)} gaps of ${String(GUTTER_PX)}px, a track is
   (100% - ${String(GUTTER_PX * (COLUMNS - 1))}px)/${String(COLUMNS)}, and the
   pitch is that plus its gutter, which is (100% + ${String(GUTTER_PX)}px)/${String(COLUMNS)}.
   Using the track alone drifts by a gutter per column and is
   ${String(GUTTER_PX * (COLUMNS - 1))}px out by the right-hand edge.

   The numbers are interpolated from grid/geometry.ts rather than written out,
   because the painted lines only agree with the real tracks while the canvas,
   the geometry and this rule all use the same gutter. */
.grid-canvas { align-content: start; }
/* direction.md §2, Breakpoints: "<1024: view mode only. Dashboards stack to
   one column" (T250). Every element takes the whole row, in document order;
   heights are kept. The grid's columns are set inline, hence !important. An
   edit session still open when the window narrows keeps its grid. */
@media (max-width: 1023.98px) {
  .dashboard:not([data-editing='true']) .grid-canvas {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .dashboard:not([data-editing='true']) .grid-canvas > * { grid-column: 1 / -1 !important; }
}
/* The prototype's .gridlines: each column a band tinted 4 % accent, the
   gutters clear (T253, mismatch 20) — where 1 px rules marked only the
   columns' edges. */
.grid-canvas[data-gridlines='true'] {
  --wc-grid-column: calc((100% - ${String((COLUMNS - 1) * GUTTER_PX)}px) / ${String(COLUMNS)});
  background-image: repeating-linear-gradient(
    to right,
    color-mix(in srgb, var(--wc-accent) 4%, transparent) 0 var(--wc-grid-column),
    transparent var(--wc-grid-column) calc(var(--wc-grid-column) + ${String(GUTTER_PX)}px)
  );
}

/* direction.md section 2: "a faint 12-column grid while editing, and a
   stronger one during a drag or resize" — the columns are what a resize is
   aiming at, so they step forward while one is happening (the prototype's
   .guides, 10 %). */
.grid-canvas[data-gridlines='true'][data-guides='true'] {
  background-image: repeating-linear-gradient(
    to right,
    color-mix(in srgb, var(--wc-accent) 10%, transparent) 0 var(--wc-grid-column),
    transparent var(--wc-grid-column) calc(var(--wc-grid-column) + ${String(GUTTER_PX)}px)
  );
}
/* A tile a proposal changes or adds, in its review (T356, AC-341; design 05,
   pin 4): an accent outline and its label, top right. */
.grid-tile[data-review] { border-color: var(--wc-accent); box-shadow: 0 0 0 1px var(--wc-accent); }
.grid-tile__review-mark {
  position: absolute;
  top: -9px;
  right: 12px;
  z-index: 2;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--wc-accent);
  color: var(--wc-bg-surface);
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
}
.grid-tile {
  position: relative;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  overflow: hidden;
}
/* A chart tile's body takes what the tile has left, under its head and any
   note above it (T182's review). Given the tile's whole height, the chart and
   the table ran 66 px past the tile's clipped bottom: the table's last rows,
   its scrollbar and its focus ring with them. A zero basis outranks the
   pixel height the body is drawn with, and the chart follows its box. */
.grid-tile:has(> .chart-tile),
.grid-tile:has(> .tile-empty) { display: flex; flex-direction: column; }
/* A chart's text in tabular numerals (direction rule 1; T254, N7). ECharts has
   no option for it, and writes most text's font as longhands, which inherit
   this; the few it writes as the "font" shorthand reset it inline, so the
   rule on the text is !important (research/echarts-text-and-grid.md, Q2). */
.chart-canvas { font-variant-numeric: tabular-nums; }
/* A tile that marks by shape (AC-088), or by a span of its axis (AC-093): a
   drag draws, never selects the axis text. */
.chart-canvas[data-marks-shapes],
.chart-canvas[data-marks-range] { user-select: none; -webkit-user-select: none; }
/* The rectangle or lasso while it is dragged, as the prototype draws it. */
.mark-drag { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 1; }
.mark-drag rect, .mark-drag polygon { fill: color-mix(in srgb, var(--wc-accent) 10%, transparent); stroke: var(--wc-accent); stroke-width: 1; stroke-dasharray: 4 3; }
/* A marked range's stripe along the x axis (T386, AC-093; references-markings.md
   rule 30): its marking's colour, over the axis line, never taking a click. */
.range-stripes { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.range-stripe { position: absolute; border-radius: 2px; }
.chart-canvas svg text { font-variant-numeric: tabular-nums !important; }
.grid-tile > .chart-tile {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
}
.grid-tile > .chart-tile > :not(.tile-head, .tile-notes, .tile-foot) { flex: 1 1 0; min-height: 0; }
/* A tile's badges — its marking's and its freshness — under its chart where
   its head has no room for them beside the whole title (T402, AC-201; the
   user's choices; tiles/badgePlace.ts). They wrap before either is cut short.
   None to show, none drawn. */
.tile-foot {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 8px;
  margin-top: 4px;
  min-width: 0;
}
.tile-foot:empty { display: none; }
/* In a foot narrower than it, the marking's badge wraps within the tile, never
   cut short at either end (T402's review; AC-201, AC-098: its name is how
   markings of like colour are told apart). */
.tile-foot > .mark-badge {
  max-width: 100%;
  height: auto;
  min-height: 20px;
  white-space: normal;
  overflow-wrap: anywhere;
}
/* What a tile says of its answer, under its head (T253's review): as tall as
   its lines, the chart taking the rest. */
.tile-notes { flex: none; margin-bottom: 4px; }
/* The KPI in the KPI ramp (T683; design 04 pin 3; R76 dashboard-Q3): its
   label above in the tile-title style, 14/20/600 in the primary ink, its
   value text-kpi, 32/40/600 in tabular numerals; the tile padded 16 as every
   tile is (rule 16). Alone on its page, text-kpi-solo, 40/52, centred
   (design 06 state B). */
.kpi { display: flex; flex-direction: column; min-height: 0; }
.kpi p { margin: 0; }
.kpi__label {
  font-size: var(--wc-text-sm-size);
  line-height: 20px;
  font-weight: 600;
  color: var(--wc-text-primary);
}
.kpi__value {
  font-size: 32px;
  line-height: 40px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.kpi--solo { align-items: center; justify-content: center; height: 100%; text-align: center; }
.kpi--solo .kpi__value { font-size: 40px; line-height: 52px; text-align: center; }
/* On a dashboard tile, the prototype's 36 px line, and no gap under the
   head: padded 16 now and its label on a 20 px line, a KPI tile at its saved
   height keeps its value and its badge inside it (T683; 4 px differences,
   accepted under R77). */
.grid-tile .kpi__value { line-height: 36px; }
.grid-tile:has(> .chart-tile .kpi) .tile-head { margin-bottom: 0; }
/* A Markdown or Image element's head while editing: the prototype's
   tile-head naming its kind in xs muted, the content under it
   (dashboard.js:319, :322). */
.grid-tile:has(> .tile-head--kind) { display: flex; flex-direction: column; }
.grid-tile > .tile-head--kind { flex: none; margin-bottom: 0; }
.grid-tile > .tile-head--kind:has(+ .image-tile) { margin-bottom: 4px; }
.grid-tile > .tile-head--kind ~ .image-tile,
.grid-tile > .tile-head--kind ~ .markdown { flex: 1 1 0; min-height: 0; height: auto; }
.tile-head__kind {
  flex: 1;
  color: var(--wc-text-muted);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
/* A chart's, after its title, where the freshness badge is while reading
   (T468, UX-032). The head is the title's (the user, question 29): the kind
   gives way first, cut before the title is. */
.chart-tile .tile-head__kind {
  flex: 0 1000 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Resize handles (AC-055, direction.md rule 36). Right edge, bottom edge and
   corner — the three direction.md names. They are invisible until the tile is
   hovered, because a dashboard being edited is still a dashboard being read. */
.grid-tile__handle { position: absolute; opacity: 0; touch-action: none; }
.grid-tile:hover .grid-tile__handle,
.grid-tile__handle:active { opacity: 1; }
/* Where there is no hover there is no reveal, so a handle would be invisible
   and still hittable. On touch they are simply shown. */
@media (hover: none) {
  .grid-tile__handle { opacity: 1; }
}
.grid-tile__handle::after {
  content: '';
  position: absolute;
  inset: 0;
  margin: auto;
  background: var(--wc-accent);
  border-radius: 2px;
}
.grid-tile__handle--e { top: 0; right: 0; width: 8px; height: 100%; cursor: ew-resize; }
.grid-tile__handle--e::after { width: 2px; height: 24px; }
.grid-tile__handle--s { bottom: 0; left: 0; height: 8px; width: 100%; cursor: ns-resize; }
.grid-tile__handle--s::after { height: 2px; width: 24px; }
.grid-tile__handle--se { bottom: 0; right: 0; width: 14px; height: 14px; cursor: nwse-resize; }
.grid-tile__handle--se::after { width: 8px; height: 8px; }

/* The grip (AC-056). Top-left of the tile, revealed with the handles. */
/* The prototype's .grip: 14 px at line height 1, padded 2 by 4, muted — at the
   start of the element's first row, as its inline grip is (T253, mismatch
   19). Placed absolutely there, since the canvas draws the grip and the
   element its own row; the row makes room for it while editing. Markdown and
   Image take the prototype's head row while editing for it; an element with
   no row at all (a Link, or a chart still loading) keeps it at its corner.
   Sections and tab groups have none: they move from their menus. */
.grid-tile__grip {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 2;
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--wc-text-muted);
  font-size: var(--wc-text-sm-size);
  line-height: 1;
  cursor: grab;
  touch-action: none;
}
.grid-tile__grip:hover { background: var(--wc-bg-hover); color: var(--wc-text-primary); }
/* A 24 px target however small the glyph is drawn (WCAG 2.5.8, T253's
   review): the pointer is caught by this square centred on it. The grip is
   the only way to start a drag with a pointer, so it gets no exception. */
.grid-tile__grip::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
}
/* A chart's head, and a Markdown or Image head while editing: 16 px in, its
   row 22 px high. The head is the element's first row: what a tile says of
   its answer is drawn under it (T253's review). */
.grid-tile:has(.tile-head) > .grid-tile__grip { top: 18px; left: 16px; }
/* The Header and the Divider, which have no padding: centred on their row,
   4 px in, so the tile's edge cuts neither its target nor its focus ring. */
.grid-tile:has(> .dashboard-heading) > .grid-tile__grip,
.grid-tile:has(> .dashboard-divider) > .grid-tile__grip {
  top: 50%;
  left: 4px;
  transform: translateY(-50%);
}
.dashboard[data-editing='true'] .grid-tile:has(> .grid-tile__grip) .tile-head,
.dashboard[data-editing='true'] .grid-tile:has(> .grid-tile__grip):has(> .dashboard-heading),
.dashboard[data-editing='true'] .grid-tile:has(> .grid-tile__grip):has(> .dashboard-divider) {
  padding-left: 26px;
}
/* Every tile marked editable at rest while editing (AC-206, the prototype's
   .dtile.editing): its grip shown, its outline dashed, the accent on hover —
   not only once the pointer finds it. */
.dashboard[data-editing='true'] .grid-tile {
  outline: 1px dashed var(--wc-border-strong);
  outline-offset: 2px;
}
.dashboard[data-editing='true'] .grid-tile:hover { outline-color: var(--wc-accent); }
/* 2 px out, as the prototype's .dtile.selected (T248, mismatch 25). */
.dashboard[data-editing='true'] .grid-tile[data-selected='true'] {
  outline: 2px solid var(--wc-accent);
  outline-offset: 2px;
}
/* The focus ring still wins over both, as it does outside edit mode (AC-176). */
.dashboard[data-editing='true'] .grid-tile:focus-visible {
  outline: 2px solid var(--wc-accent);
  outline-offset: 2px;
}
/* A section is a container, not a tile: marked on hover, as the prototype's
   .dsection.editing is, so the tiles in it are what read as editable. */
.dashboard[data-editing='true'] .grid-tile:has(> .dashboard-section):not([data-selected='true']):not(:focus-visible),
.dashboard[data-editing='true'] .grid-tile:has(> .tab-group):not([data-selected='true']):not(:focus-visible),
.dashboard[data-editing='true'] .grid-tile:has(> .dashboard-heading):not([data-selected='true']):not(:focus-visible),
.dashboard[data-editing='true'] .grid-tile:has(> .dashboard-divider):not([data-selected='true']):not(:focus-visible) {
  outline-color: transparent;
}
/* The same for a tab group, the Header and the Divider, the prototype's
   .dsection.editing and .dplain.editing (T247's review). */
.dashboard[data-editing='true'] .grid-tile:has(> .dashboard-section):hover,
.dashboard[data-editing='true'] .grid-tile:has(> .tab-group):hover,
.dashboard[data-editing='true'] .grid-tile:has(> .dashboard-heading):hover,
.dashboard[data-editing='true'] .grid-tile:has(> .dashboard-divider):hover {
  outline-color: var(--wc-accent);
}
/* <h1 style="font-size:20px"><span class="muted" style="font-weight:400">Editing</span> …
   (T246, mismatch 3). */
.dashboard[data-editing='true'] .dashboard__header h1 { font-size: var(--wc-text-lg-size); }
.dashboard__editing { font-weight: 400; color: var(--wc-text-muted); }
/* "+ Page tab" is a .btn.ghost.sm among the prototype's .dash-tabs buttons,
   whose rule gives it their 600 weight and secondary ink (T246, mismatch 5). */
.page-tabs__add { font-weight: var(--wc-text-xs-strong-weight); color: var(--wc-text-secondary); }
/* The tabs, then the rest of the row carrying the same rule, where "+ Page
   tab" sits beside the last tab while editing, as the prototype's does. */
.page-tabs__row { display: flex; }
/* More tabs than the width scroll within the strip, not the page: out of the
   canvas since T246, the strip carried the header and the canvas sideways
   with it (T246's review). */
.page-tabs__row > .page-tabs { flex: 0 1 auto; min-width: 0; padding-right: 0; overflow-x: auto; }
.page-tabs__row > .page-tabs [role='tab'] { flex: none; white-space: nowrap; }
.page-tabs__rest {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 8px 24px 0 8px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
/* The tile in hand recedes, so the marker is what the eye follows. */
.grid-tile[data-dragging='true'] { opacity: 0.4; }

/* A focused tile in edit mode is a keyboard target for move, resize, edit and
   delete (AC-057), so it needs a focus indicator of its own — AC-176 asks for
   one distinct from the marking outline. */
.grid-tile:focus-visible {
  outline: 2px solid var(--wc-accent);
  outline-offset: 2px;
}

/* The tile's ⋯ menu (AC-056's non-drag path). The tile clips its contents, so
   an open menu would be cut off by it — and on a short tile most of the
   destination list would simply be invisible. An inner overflow of auto
   cannot scroll what the parent has already clipped, so the tile stops
   clipping while its menu is open. */
.grid-tile:has(.tile-menu__list) { overflow: visible; }
/* The tile's actions: the prototype's .tile-actions .iconbtn, 26 px with a
   6 px radius, level with the tile's head (its 16 px padding, less the 3 px
   they overhang a 20 px head). */
.tile-menu { position: absolute; top: 13px; right: 16px; z-index: 3; }
.tile-menu > button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  /* It has no class, so the plain button's 32 px minimum would reach it. */
  min-height: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
  cursor: pointer;
  opacity: 0;
}
.grid-tile:hover .tile-menu > button,
.tile-menu > button:focus-visible,
.tile-menu > button[aria-expanded='true'] { opacity: 1; }
@media (hover: none) {
  .tile-menu > button { opacity: 1; }
}
/* The prototype's .picker (T253, N4, mismatch 14): 250 px, on the raised
   surface with the pop shadow and a strong rule, its items 28 px at 12 px —
   as the app's menu buttons already are. */
.tile-menu__list {
  position: absolute;
  top: 28px;
  right: 0;
  z-index: 3;
  width: 250px;
  /* Room for the view-mode menu's marked-rows group and its five items
     (AC-199) without scrolling; 200 px cut them off (T219's review). */
  max-height: 360px;
  margin: 0;
  padding: 4px;
  overflow: auto;
  list-style: none;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  box-shadow: var(--wc-shadow-pop);
}
.tile-menu__list button {
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  min-height: 0;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--wc-text-primary);
  font-size: var(--wc-text-xs-size);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.tile-menu__list button:hover { background: var(--wc-bg-hover); }
/* The view-mode tile menu (T266, AC-246): the same picker, in the top layer,
   so a right-click can open it at the pointer, clear of the tile's box and of
   any transform above it. Its own position, set as it opens. */
.tile-view-menu {
  position: fixed;
  inset: auto;
  z-index: 20;
  /* Design 08's .ctx: 284 px, as tall as the window allows less 8 px each
     side; its heading and Data as of stay, and its actions scroll between
     them (T682; R76 dashboard-Q6). */
  display: flex;
  flex-direction: column;
  width: 284px;
  max-height: calc(100vh - 16px);
  margin: 0;
  padding: 4px;
  overflow: hidden;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  color: var(--wc-text-primary);
  box-shadow: var(--wc-shadow-pop);
}
/* Its actions scroll; a row the arrows reach is brought clear of the pinned
   Data as of below it, never under it (WCAG 2.4.11; T682's review). */
.tile-view-menu > .menu { flex: 1 1 auto; min-height: 0; overflow: auto; scroll-padding-bottom: 52px; }
.tile-view-menu > :not(.menu) { flex: none; }
/* Its heading (pin 5): the title 12/16/600 in the primary ink, then the
   marking with its swatch, then what it holds, muted; 6 px 8 px round it. */
.tile-view-menu > .tile-menu__heading {
  display: grid;
  padding: 6px 8px;
  border-bottom: 1px solid var(--wc-border-subtle);
  margin-bottom: 4px;
  color: var(--wc-text-secondary);
  font-weight: 400;
}
.tile-menu__title,
.tile-menu__line {
  overflow: hidden;
  font-size: var(--wc-text-xs-size);
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-menu__title { color: var(--wc-text-primary); font-weight: 600; }
.tile-menu__line { display: flex; gap: 6px; align-items: center; }
.tile-menu__line--muted { display: block; color: var(--wc-text-muted); }
.tile-menu__swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px var(--wc-border-strong);
}
/* Its rows (.ctx .it): 28 px, padding 0 8, an 8 px gap, the icon 14 px in
   the secondary ink, a hint or a box at the right. */
.tile-view-menu .menu__item { gap: 8px; padding: 0 8px; }
.tile-view-menu .menu__icon { display: inline-flex; flex: none; align-self: center; margin-top: 0; color: var(--wc-text-secondary); }
/* The two-line footer's clock sits by its first line (T681). */
.tile-view-menu .menu__item:has(> .menu__lines) > .menu__icon { align-self: flex-start; margin-top: 1px; }
.tile-view-menu .menu__item[aria-disabled='true'] .menu__icon { color: var(--wc-text-muted); opacity: 0.7; }
.menu__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.menu__hint { margin-left: auto; color: var(--wc-text-muted); font-size: var(--wc-text-xs-size); }
.menu__hint::after { content: attr(data-hint); }
.menu__hint + .menu__chevron { margin-left: 4px; }
.menu__box {
  flex: none;
  width: 14px;
  height: 14px;
  margin-left: auto;
  border: 1px solid var(--wc-border-strong);
  border-radius: 3px;
  background: var(--wc-bg-surface);
}
.menu__box[data-checked='true'] {
  border-color: var(--wc-accent);
  background: var(--wc-accent)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.3l3 3 6-6.3' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center / 12px no-repeat;
}
/* Data as of, kept at the foot as the rest scrolls (R76 dashboard-Q6). */
.menu__sub--pinned {
  position: sticky;
  bottom: 0;
  z-index: 1;
  background: var(--wc-bg-raised);
}
/* A menu (shell/Menu.tsx): its items the picker's 28 px at 12 px. */
.menu { display: grid; }
.menu__group { display: grid; }
.menu__item {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 6px;
  border-radius: 4px;
  color: var(--wc-text-primary);
  font-size: var(--wc-text-xs-size);
  white-space: nowrap;
  cursor: pointer;
}
.menu__item:hover { background: var(--wc-bg-hover); }
/* The current item always shows, from a pointer or the keyboard alike, and
   unlike the marking outline (AC-176; research gotcha 9). */
.menu__item:focus { outline: 2px solid var(--wc-accent); outline-offset: -2px; background: var(--wc-bg-hover); }
.menu__item[aria-disabled='true'] { color: var(--wc-text-muted); cursor: not-allowed; }
/* A line of information (T273): read, not run — in the secondary ink, as
   long as it needs to be, and no "not allowed" pointer over words. */
.menu__item.menu__text {
  height: auto;
  min-height: 24px;
  padding-block: 2px;
  color: var(--wc-text-secondary);
  white-space: normal;
  cursor: default;
}
.menu__chevron { margin-left: auto; color: var(--wc-text-muted); }
/* Two lines in one item or line (T681; design 08, pin 10 and state D): the
   Data as of footer, its clock before it; a heading line; a key-value line. */
.menu__item:has(> .menu__lines) { height: auto; min-height: 28px; padding-block: 4px; white-space: normal; }
.menu__icon { display: inline-flex; flex: none; align-self: flex-start; margin-top: 1px; color: var(--wc-text-secondary); }
.menu__lines { display: grid; gap: 2px; min-width: 0; line-height: 16px; }
.menu__detail { display: inline-flex; align-items: center; gap: 5px; color: var(--wc-text-secondary); }
.menu__bolt { color: var(--wc-status-success); }
.menu__dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--wc-text-secondary); }
.menu__text--heading > .menu__dot { align-self: flex-start; margin-top: 5px; }
.menu__sub-line { color: var(--wc-text-secondary); }
.menu__text--heading .menu__main { color: var(--wc-text-primary); font-weight: 600; }
.menu__text--kv { align-items: flex-start; gap: 12px; }
.menu__term { flex: none; width: 72px; color: var(--wc-text-secondary); line-height: 16px; }
.menu__text--kv .menu__main { color: var(--wc-text-primary); font-variant-numeric: tabular-nums; }
.menu__separator { height: 1px; margin: 4px 0; background: var(--wc-border-subtle); }
/* Fixed, placed by its item's box (Menu), so a menu that scrolls does not
   clip it (T266's review; research §6). */
.menu--sub {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1;
  width: 220px;
  padding: 4px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  box-shadow: var(--wc-shadow-pop);
}
/* Delete in the error ink, as the prototype's is (mismatch 14). */
.tile-menu__delete button { color: var(--wc-status-error); }
.tile-menu__list button:disabled { color: var(--wc-text-muted); cursor: not-allowed; }
/* Why an item is off, under it (T182, AC-176). */
.tile-menu__why {
  max-width: 220px;
  margin: 0;
  padding: 0 8px 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-secondary);
}
/* What a download holds (T178, AC-172), under the ⋯ it came from, over the
   tile until Escape or a press elsewhere. */
.tile-export-note {
  position: absolute;
  top: 28px;
  right: 0;
  z-index: 3;
  width: max-content;
  max-width: 260px;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  box-shadow: var(--wc-shadow-pop);
  color: var(--wc-text-primary);
  font-size: 12px;
  line-height: 16px;
}
.grid-tile:has(.tile-export-note) { overflow: visible; }
/* At the picker's 12 px, as its items are (T253's review). */
.tile-menu__empty {
  padding: 4px 6px;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}
/* Delete sits apart from the destinations above it: one changes where a thing
   is, the other takes it away. */
.tile-menu__delete { margin-top: 4px; border-top: 1px solid var(--wc-border-subtle); }
/* The edit-mode menu (AC-205): Duplicate and whose the chart is first, Move
   to's targets in a list of their own that scrolls — the only part that does,
   however many containers a dashboard has — and Delete last, set apart. */
.tile-menu__move { border-top: 1px solid var(--wc-border-subtle); margin-top: 4px; padding-top: 4px; }
.tile-menu__move:first-child { border-top: 0; margin-top: 0; padding-top: 0; }
.tile-menu__move .tile-menu__heading { display: block; }
.tile-menu__targets { margin: 0; padding: 0; list-style: none; max-height: 168px; overflow: auto; }
/* A target is a whole path, "Page › Section › Tab", and its end is what tells
   two apart, so it wraps within the picker rather than run past it: 28 px a
   line, taller when it needs two (T253's review). */
.tile-menu__targets button {
  height: auto;
  min-height: 28px;
  padding-block: 6px;
  line-height: var(--wc-text-xs-line);
  white-space: normal;
  overflow-wrap: anywhere;
}

/* Deleting a page tab or a tab (AC-060), beside the strip they belong to. */
/* Page tabs: the prototype's .dash-tabs — underlined, on a subtle rule. */
.page-tabs {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  /* The prototype's .dash-tabs. */
  padding: 8px 24px 0;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.page-tabs [role='tab'] {
  height: 36px;
  padding: 0 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  color: var(--wc-text-secondary);
  font-size: 13px;
  font-weight: var(--wc-text-sm-strong-weight);
}
.page-tabs [role='tab']:hover:not([aria-selected='true']) {
  background: none;
  color: var(--wc-text-primary);
}
.page-tabs [role='tab'][aria-selected='true'] {
  color: var(--wc-text-primary);
  border-bottom-color: var(--wc-accent);
}
/* A dashboard's page tabs in Properties, each with Delete (AC-060, AC-187). */
.page-tabs-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.page-tabs-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 28px;
  font-size: 12px;
}
.tab-group [role='tablist'] button[data-testid^='delete-tab-'] {
  border: 0;
  background: none;
  color: var(--wc-text-secondary);
  cursor: pointer;
}

/* The question a non-empty section asks before it goes (AC-061). Two real
   answers and a way out, so the choice is laid out rather than crammed. */
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 40%);
}
.dialog {
  display: grid;
  gap: 8px;
  max-width: 420px;
  padding: 16px;
  border-radius: 6px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
}
/* One dialog pattern (T466, UX-106): its title in direction.md §3's text-md,
   16/600, its body in 14 px, on every dialog — the browser's h2 made them
   21/700, and the gallery's 20. */
.dialog h2 {
  margin: 0;
  font-size: var(--wc-text-md-size);
  line-height: var(--wc-text-md-line);
  font-weight: var(--wc-text-md-weight);
}
.dialog p { margin: 0 0 8px; color: var(--wc-text-secondary); }
.dialog button {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  cursor: pointer;
}
/* Answers on one row, the safe one first, because it is the one that reads
   first and the one focus lands on (AC-073). */
.dialog__actions { display: flex; justify-content: flex-end; gap: 8px; }
/* The answer that loses work is marked as such rather than merely available.
   The selector beats the .dialog button rule above, which sets colour and
   border; written the short way first this rule was inert and the two answers
   rendered identically. The token is status-error, and there is no -text
   variant: the version that named one was invalid at computed-value time, so
   it did nothing twice over. Both mistakes were invisible, because no test
   renders this dialog's colours and the rendered token audit sweeps only
   /explore, /jobs, /model and /security. */
.dialog button.dialog__destructive {
  color: var(--wc-status-error);
  border-color: var(--wc-status-error);
}
/* A destructive answer that is the dialog's one primary: filled in
   status-error (T466, UX-106), as the approved pattern draws it. */
.dialog button.btn-primary.dialog__destructive,
.dialog button.btn-primary.dialog__destructive:hover:not(:disabled) {
  background: var(--wc-status-error);
  border-color: var(--wc-status-error);
  color: var(--wc-text-on-accent);
}

/* Deleting (design 14, states A–E): 520 px, the refusal's icon beside its
   title, and what depends on the item as rows of 34 px, grouped by kind. */
.dialog.delete-dialog { width: min(520px, calc(100vw - 32px)); max-width: none; gap: 12px; padding: 20px; }
.dialog.delete-dialog h2 { display: flex; gap: 8px; align-items: center; }
.dialog.delete-dialog p { margin: 0; }
.delete-dialog__deps {
  max-height: 280px;
  overflow: auto;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.delete-dialog__deps ul { margin: 0; padding: 0; list-style: none; }
.delete-dialog__group {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 26px;
  padding: 0 10px;
  background: var(--wc-bg-subtle);
  border-bottom: 1px solid var(--wc-border-subtle);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
}
.delete-dialog__count { margin-left: auto; font-weight: 400; font-variant-numeric: tabular-nums; }
.delete-dialog__row {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto 14px;
  gap: 8px;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.delete-dialog__deps > div:last-child .delete-dialog__row:last-child { border-bottom: 0; }
.delete-dialog__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.delete-dialog__name a { color: var(--wc-accent); text-decoration: none; }
.delete-dialog__name a:hover { text-decoration: underline; }
.delete-dialog__where {
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
  white-space: nowrap;
}
.delete-dialog__where a { color: var(--wc-accent); text-decoration: none; }
.delete-dialog__where a:hover { text-decoration: underline; }
.delete-dialog__ext { color: var(--wc-text-muted); }
.delete-dialog__kind {
  display: inline-grid;
  place-items: center;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}
.dialog p.delete-dialog__unseen {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
.dialog p.delete-dialog__note { font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); }
.delete-dialog__goes {
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
}
.delete-dialog__goes li {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.delete-dialog__goes li:last-child { border-bottom: 0; }
.delete-dialog__goes .delete-dialog__where { margin-left: auto; }
.delete-dialog__withdraws { display: grid; gap: 6px; }
.dialog p.delete-dialog__label {
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
}
.delete-dialog__title { font-weight: var(--wc-text-sm-strong-weight); }
.delete-dialog__goes .status { display: inline-flex; align-items: center; gap: 4px; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }

/* The undo toast (AC-060, direction.md rule 38). Bottom right, above
   everything, and it does not take the pointer away from the dashboard. */
.undo-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--wc-text-primary);
  color: var(--wc-bg-surface);
}
.undo-toast button {
  padding: 2px 8px;
  border: 1px solid currentColor;
  border-radius: 4px;
  background: none;
  color: inherit;
  cursor: pointer;
}

/* Where the tile would land. Fixed to the viewport because the rectangle is
   measured from the viewport, and painted in the accent so it reads as the
   answer to the question the drag is asking. */
.drop-marker {
  position: fixed;
  z-index: 9;
  background: var(--wc-accent);
  border-radius: 2px;
  pointer-events: none;
}

/* The live readout follows the pointer, so it is fixed to the viewport rather
   than to the canvas, which scrolls under it. */
.resize-readout {
  position: fixed;
  z-index: 10;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--wc-text-primary);
  color: var(--wc-bg-surface);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

/* The chart editor (AC-214, the prototype's workbench): one header row over
   three full-height panes — the fields, the preview above its drawer, and the
   inspector — filling the window below the app bar. Each pane scrolls on its
   own, so the preview never leaves the fold. */
main:has(.chart-editor) {
  height: calc(100vh - var(--wc-app-bar-height));
  display: flex;
  flex-direction: column;
  padding: 0;
}
/* The prototype's .editor-page: 280 | the preview | 360 (T257). */
.chart-editor {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 360px;
  grid-template-rows: auto minmax(0, 1fr);
}
/* Narrower than 1,024 px its panes stack, each as wide as the page, which
   grows and scrolls down instead of sideways (T396, AC-304): the fields
   above the preview above the inspector. */
@media (max-width: 1023.98px) {
  main:has(.chart-editor) { height: auto; }
  .chart-editor { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto; }
  /* Its header row's controls wrap onto a second line, not past the page. */
  .chart-editor__head { flex-wrap: wrap; }
}
.chart-editor__head {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
/* Long things in the row — a refused save's reason, a shared chart's note, a
   long dashboard name on Back — shrink and wrap within it rather than push
   it past the window (AC-179, T228's review). */
.chart-editor__head > * { min-width: 0; }
.chart-editor__head .state-line { margin: 0; flex: 0 1 auto; font-size: 12px; line-height: 16px; }
/* A library chart's plain note: the prototype's \`xs muted\` (T256's review). */
.chart-editor__note { flex: 0 1 auto; font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.chart-editor__head .shared-chart-notice { flex: 0 1 auto; margin: 0; }
.chart-editor__head [data-testid='editor-back'] {
  flex: 0 1 auto;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The title reads as a heading until it is pointed at or typed in. Named with
   the global input rule's own :not()s, which otherwise outrank a class and
   drew it as a bordered field at rest (T257). */
input.chart-editor__title:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']) {
  flex: 0 1 420px;
  min-width: 120px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--wc-text-primary);
  font: inherit;
  /* text-md, 16/600, not design 01's off-scale 15 (components-Q3; T688). */
  font-size: 16px;
  font-weight: 600;
}
/* Pointed at or typed in, it stays bare, as the prototype's [data-title]:
   focus shows as the focus ring alone (T310). */
input.chart-editor__title:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']):hover,
input.chart-editor__title:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']):focus {
  border-color: transparent;
  background: transparent;
}
.chart-editor__meta { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); white-space: nowrap; }
.chart-editor__spacer { flex: 1; }
/* Undo and Redo are .icon-button (the prototype's .iconbtn); with nothing to
   step through, at the prototype's opacity .4 (editor.js 408, T257). */
.chart-editor__head .icon-button:disabled { opacity: 0.4; }
.chart-editor__fields,
.chart-editor__inspector { min-height: 0; overflow: auto; background: var(--wc-bg-surface); }
.chart-editor__fields { padding: 0 0 12px; border-right: 1px solid var(--wc-border-subtle); }
/* The inspector's small controls are the prototype's .input.sm and .select.sm:
   28 px at 12 px (T257). */
.chart-editor input.input-sm:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']),
.chart-editor .select-sm { height: 28px; font-size: 12px; }
.chart-editor__inspector { display: flex; flex-direction: column; border-left: 1px solid var(--wc-border-subtle); }
.chart-editor__inspector-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  display: grid;
  gap: 12px;
  align-content: start;
}
/* Design 01's three .section blocks (T688, EDI-08): the source and the type;
   the wells, Sort and Top N; why. Each padded 12 with a rule under it, across
   the pane, the body's own padding gone where they are. */
.chart-editor__inspector-body:has(> .inspector-section) { padding: 0; gap: 0; }
.inspector-section {
  display: grid;
  gap: 8px;
  align-content: start;
  padding: 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
/* The field pane's head (design 01 pin 2): the cube named, how many it reaches. */
/* Design 01's .pane-head: 44 px, padding 8 12, its h2 14/20/600 (01:94–95). */
.field-list__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}
.field-list__head-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field-list__head-count {
  margin-left: auto;
  flex: none;
  font-size: 12px;
  font-weight: 400;
  color: var(--wc-text-muted);
}
.chart-editor__type { display: grid; gap: 6px; }
.chart-editor__type h3,
.chart-editor__type h4 { margin: 0; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--wc-text-secondary); }
.chart-editor__type p,
.chart-editor__type ul { margin: 0; }
.chart-editor__center { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.chart-editor__canvas {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* Opened on its own, the preview is a tile filling the canvas, as the
   prototype's (editor.js 414: height 100%, min-height 240px; T257). */
.chart-editor__canvas > .preview-frame__tile[data-size='fill'] { flex: 1 1 auto; min-height: 240px; }
/* The empty editor: the prototype's two lines, centred in the preview's tile
   (editor.js 481, T257). */
.chart-editor__canvas > .chart-editor__empty-tile { display: grid; place-items: center; }
.chart-editor__empty { text-align: center; }
.chart-editor__empty-head {
  margin: 0;
  font-size: var(--wc-text-md-size);
  line-height: var(--wc-text-md-line);
  font-weight: 600;
  color: var(--wc-text-primary);
}
.chart-editor__empty-line {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-secondary);
}
.chart-editor__missing { margin: auto; max-width: 480px; }
/* The drawer at the foot of the preview (AC-214), the prototype's .drawer
   (T257): its tab strip always there, and open, 220 px with the strip — the
   only place result rows are printed. */
.chart-editor__center .results-drawer {
  flex: none;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
.chart-editor__center .results-drawer[data-open='true'] { height: 220px; }
.results-drawer__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.results-drawer__tabs { display: flex; flex: 1; gap: 2px; min-width: 0; overflow-x: auto; }
/* The prototype's .tabs button. */
.results-drawer__tabs [role='tab'] {
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  color: var(--wc-text-secondary);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.results-drawer__tabs [role='tab']:hover:not([aria-selected='true']) { background: none; color: var(--wc-text-primary); }
.results-drawer__tabs [role='tab'][aria-selected='true'] {
  color: var(--wc-accent);
  border-bottom-color: var(--wc-accent);
}
/* Drawn inside the strip, which clips (T182's rule). */
.results-drawer__tabs [role='tab']:focus-visible { outline-offset: -2px; }
.results-drawer__toggle { width: 28px; height: 28px; flex: none; }
.results-drawer__body { flex: 1; min-height: 0; overflow: auto; }
.results-drawer__body > .state-line { margin: 8px 12px; }
.results-drawer__body:focus-visible { outline-offset: -2px; }
.results-drawer__query {
  margin: 0;
  padding: 12px;
  font-family: var(--wc-font-code);
  font-size: 12px;
  line-height: 18px;
  white-space: pre-wrap;
}
/* A measure's figures are set right, as the prototype's td.num (T257). */
.grid-table th.num,
.grid-table td.num { text-align: right; }

/* A well (the prototype's .field + .well, T257): a 12/600 label over a dashed
   box holding the pills and the "+" that adds to it. */
.well-field { display: grid; gap: 4px; }
.well-field__label {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.well {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  /* Design 01's .well: padding 5 (02:283; T688, EDI-09). */
  padding: 5px;
  border: 1px dashed var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
/* "(group by)", "(+ Other)": design 01's .lbl .opt, 400 in text-muted (EDI-09). */
.well-field__opt { font-weight: 400; color: var(--wc-text-muted); }
/* A well's "+" picker, design 01 state A (EDI-11): 264 px, its keys at its foot,
   a field already in the chart listed in text-muted and not picked. */
/* Two classes, so it wins over .cube-picker's grid, declared later (T688's review). */
.cube-picker.cube-picker--add { display: inline-block; }
/* Design 01's .picker (01:154–162): 264 px, a strong border, padding 4; its
   groups 12/16/600 muted, "· via join" at 400; rows 28 px at 12, padded 0 6,
   their aggregation muted at the right; one held at half strength; the foot. */
.cube-picker__pop.cube-picker__pop--fields {
  width: min(264px, calc(100vw - 32px));
  padding: 4px;
  border-color: var(--wc-border-strong);
}
.cube-picker__pop--fields .cube-picker__field { margin: 2px 2px 6px; }
.cube-picker__pop--fields .cube-picker__list { border-top: 0; padding-bottom: 0; }
.cube-picker__pop--fields .cube-picker__group { padding: 6px 6px 2px; color: var(--wc-text-muted); }
.cube-picker__aside { font-weight: 400; }
.cube-picker__pop--fields .cube-picker__option {
  height: 28px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
}
.cube-picker__pop--fields .cube-picker__path { color: var(--wc-text-muted); }
.cube-picker__pop--fields .cube-picker__option .field-row__icon { flex: none; }
.cube-picker__option[aria-disabled='true'] { opacity: 0.5; cursor: default; }
.cube-picker__option[aria-disabled='true']:hover { background: none; }
.cube-picker__foot {
  margin: 4px 0 0;
  padding: 6px 6px 2px;
  border-top: 1px solid var(--wc-border-subtle);
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-muted);
}
/* The prototype's .addbtn: borderless, muted, until pointed at. */
.addbtn {
  height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--wc-text-muted);
  font-size: 12px;
}
.addbtn:hover { color: var(--wc-text-primary); }
/* Its .picker is 240 px (index.html 961), placed against the well — left: 0
   — not against the "+", which the pills push along: from there it ran past
   the inspector's edge (T257's review). */
.well > .menu-button { position: static; }
.well .menu-button__menu { width: 240px; }
/* On a legal well's accent tint, text-muted is 4.28:1 in dark; the audited
   text-secondary holds (T257's review, AC-005). */
.well[data-drop='legal'] .addbtn { color: var(--wc-text-secondary); }
.well .menu-button__item .field-row__icon { flex: none; }
/* An empty "Each point is" (T400): each row is a point, said in the .addbtn's ink. */
.well__empty { padding: 0 6px; font-size: 12px; line-height: 16px; color: var(--wc-text-muted); }
.wells__options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: end; }

/* The chart editor opened over the dashboard from a tile (T032). Laid out
   as the settings page is: its own bar in place of the dashboard's, and the
   editor filling what is left. */
.chart-editor-overlay { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 16px; }
/* A library chart's editor note (T134, AC-128): the prototype's under-bar
   line, shared and on how many dashboards, with its Make a local copy. */
.shared-chart-notice {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  margin: -8px 0 0;
  font-size: 12px;
  line-height: 16px;
}
.shared-chart-notice > .state-line { margin: 0; }
.chart-editor-overlay__bar { display: flex; align-items: center; gap: 16px; min-height: 48px; }
.chart-editor-overlay__bar h1 {
  margin: 0;
  font-size: var(--wc-text-lg-size);
  font-weight: var(--wc-text-lg-weight);
}
.chart-editor-overlay__bar button {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  cursor: pointer;
}
/* Save dashboard (T192, direction.md section 2) wears the edit bar's Save:
   the same action, reached from inside the editor, and at the far end of the
   bar as Save is in the dashboard's own. Its reason sits just before it. */
.chart-editor-overlay__bar .chart-editor-overlay__save {
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
  border-color: var(--wc-accent);
}
.chart-editor-overlay__bar .chart-editor-overlay__save[aria-disabled='true'] {
  background: var(--wc-bg-surface);
  color: var(--wc-text-muted);
  border-color: var(--wc-border-strong);
  cursor: default;
}
.chart-editor-overlay__blocked {
  margin: 0 0 0 auto;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-sm-size);
}
/* The editor fills the overlay's height, so that Fit has somewhere to grow,
   and the preview scrolls within itself rather than widening the page. */
.chart-editor-overlay__body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* Never shrinks below its content. Allowed to shrink, it collapsed under a
   tile taller than the space left, and the results drawer that follows it
   was laid over its top, covering the Actual size and Fit buttons so neither
   could be pressed. Its size is set outright in both modes, so it has no
   reason to grow either. */
.chart-editor-overlay .preview-frame { flex: none; }

/* Actual size or Fit (T032, direction.md section 2). The frame is the tile's
   own chrome, grid-tile, so actual size is the tile and not a likeness. */
.preview-frame { display: flex; flex-direction: column; gap: 8px; }
/* The prototype's .seg (editor.js 414, index.html 609; T257): a segmented
   control, not two primary buttons — the pressed one on the accent's tint. */
.preview-frame__sizes {
  display: inline-flex;
  align-self: flex-start;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  overflow: hidden;
}
.preview-frame__sizes button {
  /* Not the 32 px minimum a class-less button takes. */
  min-height: 0;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-left: 1px solid var(--wc-border-subtle);
  border-radius: 0;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font-size: 12px;
  cursor: pointer;
}
.preview-frame__sizes button:first-child { border-left: 0; }
.preview-frame__sizes button[aria-pressed='true'],
.preview-frame__sizes button[aria-pressed='true']:hover {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: 600;
}
.preview-frame__tile { flex: none; }

/* A chart tile's pencil (T032): beside the tile's menu and revealed the same
   way, so the two read as one set of tile controls. It stays visible where
   there is no hover to reveal it. */
.tile-pencil {
  position: absolute;
  top: 13px;
  right: 44px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
  cursor: pointer;
  opacity: 0;
}
.grid-tile:hover .tile-pencil,
.tile-pencil:focus-visible { opacity: 1; }
/* "Refresh now" (T154, AC-148): the pencil's twin, left of it, in view mode. */
.tile-refresh {
  position: absolute;
  top: 13px;
  right: 72px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  min-height: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
  cursor: pointer;
  opacity: 0;
}
.grid-tile:hover .tile-refresh,
.tile-refresh:focus-visible,
.tile-refresh:disabled { opacity: 1; }
/* With "Refresh now" there, the head keeps room for three corner controls:
   26 + 2 + 26 + 2 + 26, and its 8 px gap. */
.grid-tile:has(.tile-refresh) .tile-head { padding-right: 90px; }
/* With no ✎ — a narrow window's reading view (T250), or a preview — Refresh
   takes the pencil's place, and the head the room it leaves. */
/* Not while previewing, where SQL already has the pencil's place (T250's review). */
.grid-tile:has(.tile-refresh):not(:has(.tile-pencil)):not(:has(.tile-sql)) > .tile-refresh { right: 44px; }
/* SQL is a word, wider than the pencil it replaces: Refresh stands clear of
   it, and the head keeps room for both (T250's review). */
.grid-tile:has(.tile-sql) > .tile-refresh:not(.tile-sql) { right: 78px; }
.grid-tile:has(.tile-sql):has(.tile-refresh:not(.tile-sql)) .tile-head { padding-right: 112px; }
.grid-tile:has(.tile-refresh):not(:has(.tile-pencil)):not(:has(.tile-sql)) .tile-head { padding-right: 62px; }
/* A chart's SQL as the previewed context (T174): only while previewing, when
   there is no pencil, so it takes the pencil's place; a word, not an icon. */
.tile-refresh.tile-sql {
  right: 44px;
  width: auto;
  min-width: 26px;
  padding: 0 2px;
  /* At the floor (AC-004); it was 10 px, on a state — previewing a security
     context — that the type audit's pages never opened. */
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
}
/* Where the chart's answer came from (T014, AC-013): the editor head's badge,
   the prototype's .badge, "ok"-coloured when a pre-aggregation served it. */
.acceleration {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.acceleration--accelerated { color: var(--wc-status-success); }
/* A tile's one freshness badge (T681; design 04's .fresh, note 4; DSH-23):
   20 px, padding 0 7, a 5 px gap, a 6 px dot or the check, "ok"-coloured
   for a pre-aggregation. Never cut short, as the design's flex: none: where
   the head has no room for it and the whole title, it goes to the tile's
   foot whole (T464's placement), so its word and age always show (AC-013;
   T681's review). */
.tile-freshness {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
}
.tile-freshness.is-ok { color: var(--wc-status-success); }
.tile-freshness__dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.tile-freshness > svg { flex: none; width: 11px; height: 11px; color: var(--wc-status-success-icon); }
@media (hover: none) {
  .tile-refresh,
  .tile-pencil { opacity: 1; }
}

.wells { display: grid; gap: 8px; }
.wells ul { margin: 0; padding: 0; list-style: none; }
/* What to do before the wells take anything (T467, UX-063), in the pane's
   12 px secondary, as the prototype's hints are. */
.wells__note {
  margin: 0;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}

/* Legality is an outline plus a written reason, never colour alone
   (direction.md rule 3, AC-027); a legal well also takes the prototype's
   .well.legal tint. */
.well[data-drop='legal'] {
  outline: 2px solid var(--wc-accent);
  border-color: var(--wc-accent);
  background: var(--wc-bg-accent-soft);
}
.well[data-drop='illegal'] { outline: 2px dashed var(--wc-border-strong); }

.well__reason {
  margin: 4px 0;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}

/* The chart editor's Customize tab (AC-219, the prototype's customizeTab):
   a section each for the axes, the legend, the series and the values, headed
   as the inspector's sections are. */
.customize-tab { display: grid; gap: 12px; }
.customize-tab__section { display: grid; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--wc-border-subtle); }
.customize-tab__section:last-child { border-bottom: 0; }
.customize-tab__section > h3,
.customize-tab__section > summary > h3 {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
/* Folded as the prototype's <details class="section"> (editor.js:316;
   chart-editor-Q8, T688): the summary its heading, the browser's own marker
   before it, the controls 8 px apart once open. */
details.customize-tab__section { display: block; }
details.customize-tab__section > summary { cursor: pointer; }
details.customize-tab__section > summary > h3 { display: inline; }
details.customize-tab__section[open] > :not(summary) { margin-top: 8px; }
.customize-tab__check { display: flex; align-items: center; gap: 6px; font-size: 12px; }
/* The Customize tab's fields as the prototype's .input.sm and .select.sm,
   28 px at 12 px, named with the global input rule's own :not()s (T310). */
.customize-tab input:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']),
.customize-tab select {
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
}
.customize-tab select { padding: 0 4px 0 8px; }
.customize-tab input[type='color']:not([type='checkbox']):not([type='radio']):not([type='file']):not([type='range']) {
  width: 40px;
  padding: 2px;
}
/* Its toggles as the prototype's .switch: 32 × 18, a pill in border-strong
   with its knob at the left, in the accent with the knob at the right once
   on. Still a checkbox to assistive technology and to a test's check(). */
.customize-tab input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  flex: none;
  width: 32px;
  height: 18px;
  margin: 0;
  border: 0;
  border-radius: 999px;
  background: radial-gradient(circle at 9px 50%, var(--wc-bg-surface) 7px, transparent 7.5px),
    var(--wc-border-strong);
  cursor: pointer;
}
.customize-tab input[type='checkbox']:checked {
  background: radial-gradient(circle at 23px 50%, var(--wc-bg-surface) 7px, transparent 7.5px),
    var(--wc-accent);
}
.customize-tab__series { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.customize-tab__series li { display: flex; align-items: center; gap: 8px; }
/* Each series' place in the order (T392), at the row's end, as the index
   editor's moves are. */
.customize-tab__move { display: inline-flex; gap: 4px; margin-left: auto; }
.customize-tab__reset { justify-self: start; }
.customize-tab__series input[type='color'] { width: 28px; height: 20px; padding: 0; border: 1px solid var(--wc-border-subtle); border-radius: 4px; background: none; }
.axis-panel { display: grid; gap: 4px; margin: 0 0 8px; padding: 8px; border: 1px solid var(--wc-border-subtle); border-radius: 6px; }
.axis-panel > legend { padding: 0 4px; font-size: 12px; font-weight: 600; color: var(--wc-text-secondary); }
.axis-panel > label { font-size: 12px; color: var(--wc-text-secondary); }
/* A switch beside its words, as the prototype's .inline rows (T310). */
.axis-panel > label:has(> input[type='checkbox']) { display: flex; align-items: center; gap: 6px; }
/* The chart editor's field list (AC-215): the prototype's field pane (T257) —
   the search padded 8 12, then each cube's .tgroup. */
.field-list { display: grid; align-content: start; }
/* The cube picker as the 2026-09-27 design 10 draws it (T475, state D): the
   button as the select it replaced; a 520 px list under it with its search
   box, a 12/600 heading per folder, 32 px rows of a C or V chip, the title
   and the path in 12 px secondary at the right, a hidden one in text-muted. */
.cube-picker { position: relative; display: grid; gap: 4px; }
.cube-picker__label { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--wc-text-secondary); }
.cube-picker__button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  text-align: left;
  cursor: pointer;
}
.cube-picker__button > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cube-picker__pop {
  /* Fixed to the window under the button, kept within it (PathPicker places
     it, with this width), so a scrolling pane around it doesn't cut it short:
     the chart editor's field pane, the edit sidebar's filter settings. */
  position: fixed;
  z-index: 30;
  width: min(520px, calc(100vw - 32px));
  background: var(--wc-bg-raised);
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  box-shadow: var(--wc-shadow-pop);
}
.cube-picker__field { position: relative; margin: 10px; }
.cube-picker__glyph { position: absolute; left: 10px; top: 9px; color: var(--wc-text-muted); pointer-events: none; }
.cube-picker__field > input.cube-picker__search:not([type='checkbox']) {
  display: block;
  width: 100%;
  height: 32px;
  padding-left: 30px;
  font-size: var(--wc-text-sm-size);
}
.cube-picker__list { max-height: 360px; overflow: auto; padding-bottom: 6px; border-top: 1px solid var(--wc-border-subtle); }
.cube-picker__group {
  padding: 8px 10px 2px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
}
.cube-picker__option {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  font-size: var(--wc-text-sm-size);
  cursor: pointer;
}
.cube-picker__option:hover { background: var(--wc-bg-hover); }
/* The option the keys are on (AC-176; T405's audit and review): the hover's
   shade alone told it from hover by nothing. Now the search palette's soft
   accent and accent ink, and a 3 px bar in the accent at its start, the part
   past 3:1 against the list. */
.cube-picker__option[aria-selected='true'] {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  box-shadow: inset 3px 0 0 var(--wc-accent);
}
.cube-picker__kind {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: var(--wc-bg-role-dimension-soft);
  color: var(--wc-role-dimension);
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
}
.cube-picker__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cube-picker__path { margin-left: auto; flex: none; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
/* "Your copy" beside the user's workspace copy (T718, AC-428; R73): design 03's
   tree chip, ".file .tag": 600 11/16, muted, a 1 px strong border, 3 px corners. */
.cube-picker__chip {
  flex: none;
  padding: 0 4px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 3px;
  color: var(--wc-text-muted);
  font: 600 11px/16px Inter, system-ui, sans-serif;
}
.cube-picker__none { margin: 10px; font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
/* A filter's "No field", above the groups (T633). */
.cube-picker__clear { color: var(--wc-text-secondary); border-bottom: 1px solid var(--wc-border-subtle); }
.field-list__search-box { padding: 8px 12px; }
.field-list__search { width: 100%; }
.field-list ul { margin: 0; padding: 0; list-style: none; }
/* By type within a cube (AC-025), which the prototype's list does not say. */
.field-list h4 {
  margin: 4px 0 0;
  padding: 0 12px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.field-list__none { margin: 0; padding: 8px 12px; font-size: 12px; color: var(--wc-text-secondary); }
/* A cube's fields under its name and count (AC-215, the prototype's .tgroup). */
.field-list__cube { display: grid; padding: 4px 0; }
.field-list__cube-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 0;
  padding: 0 12px;
  font-size: 12px;
  line-height: 20px;
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.field-list__count { margin-left: auto; font-weight: 400; color: var(--wc-text-muted); font-variant-numeric: tabular-nums; }
/* The head opens and closes its group, as design 01's .tgroup-head (▾ ▸; T688). */
.field-list__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.field-list__caret { width: 10px; color: var(--wc-text-muted); font-weight: 400; }
/* "· via join", quieter than the cube's name (design 01's .via). */
.field-list__via { font-weight: 400; color: var(--wc-text-muted); }
/* One field (the prototype's .frow): chip, title with its "used" dot, what it is. */
.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  margin: 0 4px;
  padding: 0 12px 0 22px;
  border-radius: 4px;
  font-size: 12px;
  cursor: grab;
  user-select: none;
}
.field-row[role='button']:hover { background: var(--wc-bg-hover); }
.field-row__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field-row__meta { font-size: 12px; color: var(--wc-text-muted); }
/* The prototype's .ficon: an 18 px chip in the role's colours. */
.field-row__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  font-family: var(--wc-font-code);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: var(--wc-role-dimension);
  background: var(--wc-bg-role-dimension-soft);
}
.field-row__icon[data-role='measure'] { color: var(--wc-role-measure); background: var(--wc-bg-role-measure-soft); }
/* The prototype's .frow.used .fname::after: a 6 px accent dot after the name. */
.field-row__used {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: 50%;
  background: var(--wc-accent);
  vertical-align: middle;
}
/* A field in a well (AC-216, the prototype's .pill): its title, its tag or
   grain, and ×, in its role's colours (T257). */
.well__pills { display: flex; flex-wrap: wrap; gap: 4px; }
.well__pills:empty { display: none; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  height: 24px;
  padding: 0 4px 0 6px;
  border: 0;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--wc-role-dimension);
  background: var(--wc-bg-role-dimension-soft);
}
.pill--measure { color: var(--wc-role-measure); background: var(--wc-bg-role-measure-soft); }
.pill__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The prototype's .agg is 400 at opacity .85; at full strength here, since
   .85 takes the measure's ink under AA on its tint (rule 2). */
.pill__tag { font-size: 12px; font-weight: 400; color: inherit; }
/* A metric the chosen form doesn't draw (T510; design 01-5's .pill.off): on
   the surface, in muted ink (5.2:1 light, 5.7:1 dark there), dashed, and its
   tag says "not drawn", never the look alone (rule 3). */
.pill.pill--off {
  background: var(--wc-bg-surface);
  color: var(--wc-text-muted);
  outline: 1px dashed var(--wc-border-strong);
  outline-offset: -1px;
}
/* …and why, under Metrics, with the forms that draw it (design 01-5's
   .warnline). */
.wells__undrawn {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 6px;
  padding: 8px;
  border-radius: 6px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  background: color-mix(in srgb, var(--wc-status-warning-icon) 16%, var(--wc-bg-surface));
}
.wells__undrawn-text { margin: 0; }
.wells__undrawn-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.pill__grain {
  height: 20px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: inherit;
  font-size: 12px;
  font-weight: 400;
}
/* A measure's aggregation tag as the menu of quick calculations (T380,
   AC-047): drawn as the tag, in the pill's ink, with a caret. */
.pill__calc {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 2px;
  border: 0;
  border-radius: 3px;
  background: none;
  color: inherit;
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
}
/* Its menu, in the menu's own type rather than the pill's 600, one line an item. */
.pill .menu-button__menu { font-weight: 400; white-space: nowrap; }
/* A quick calculation that can't be applied (T381, AC-049): its name muted,
   and why beneath it. At full strength rather than a disabled item's half
   opacity, so the reason is read at AA contrast (AC-005). */
.menu-button__item:has(.quick-calc__why) {
  height: auto;
  min-height: 28px;
  padding-block: 4px;
  opacity: 1;
}
.quick-calc__item { display: flex; flex-direction: column; gap: 2px; }
.quick-calc__item > :first-child { color: var(--wc-text-muted); }
/* Wrapped within the well's 240 px menu, never cut off (T381's review). */
.quick-calc__why { color: var(--wc-text-secondary); white-space: normal; }
.pill__remove {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: none;
  color: inherit;
  cursor: pointer;
}

/* Above the sticky app bar (z-index 10): a modal dialog leaves nothing behind
   it to click, the workspace tabs included (N9). */
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  background: rgba(0, 0, 0, 0.35);
}

.palette {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  width: min(560px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  /* bg-raised is white and a shadow (direction §5), as the menus are (N9). */
  box-shadow: var(--wc-shadow-pop);
}

.palette__input {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font: inherit;
}

/* A .btn: radius 6, as every button (N8; direction §7d). */
.palette__close {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font: inherit;
  cursor: pointer;
}

.palette__hint {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
}

/* The results, in the text tokens (AC-005). They were the browser's default
   link blue — #0000ee, 1.63:1 on the dark palette — because nothing styled
   them, and the audit only ever saw the palette closed. */
.palette__results ul { margin: 0; padding: 0; list-style: none; max-height: 360px; overflow: auto; }
/* A result: its type, its title, and where it lives (AC-191). The active one
   — the arrows' — is drawn as the prototype draws a selected row. */
.palette__option {
  display: grid;
  grid-template-columns: 96px 1fr;
  column-gap: 8px;
  align-items: baseline;
  padding: 4px 6px;
  border-radius: 4px;
  color: var(--wc-text-primary);
  cursor: pointer;
}
.palette__option:hover { background: var(--wc-bg-hover); }
.palette__option[aria-selected='true'] { background: var(--wc-bg-accent-soft); color: var(--wc-accent); }
.palette__kind { color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); }
.palette__option[aria-selected='true'] .palette__kind { color: var(--wc-accent); }
.palette__detail {
  grid-column: 2;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
}

:focus-visible {
  outline: 2px solid var(--wc-accent);
  outline-offset: 2px;
}
/* The ring drawn inside the control where a box around it clips or scrolls
   (T182, AC-176): outside, as everywhere else, the box would cut it off. */
.seg button:focus-visible,
.edit-sidebar__tabs button:focus-visible,
.edit-sidebar__panel:focus-visible,
.settings-page__nav button:focus-visible,
.tile-menu__list button:focus-visible,
.model-problems :focus-visible,
.filter-widget__options :focus-visible,
.page-tabs [role='tab']:focus-visible,
/* T638 (the re-audit): segments and rows that fill a box that clips. */
.preview-frame__sizes button:focus-visible,
.choice--segmented > .choice__option:focus-visible,
.choice--rows > .choice__option:focus-visible,
nav.outline :focus-visible,
.sql-runs :focus-visible,
/* Jobs' and Schedules' rows, in a table that scrolls sideways when narrow. */
.build-panel__row:focus-visible {
  outline-offset: -2px;
}
/* On the toast's inverted ground the accent falls short of 3:1 (WCAG 1.4.11);
   the toast's own ink does not. The SQL runner's toast is the same ground
   (T638). */
.undo-toast :focus-visible,
.sql-runner__toast :focus-visible { outline-color: currentColor; }
/* A list filter's chosen value is filled in the accent: its ring, inside it,
   in the ink on the accent (T638). */
.filter-widget__options button[aria-pressed='true']:focus-visible { outline-color: var(--wc-text-on-accent); }
`;

export function installStyles(doc: Document = document): void {
  if (doc.querySelector('style[data-wechart-tokens]')) return;

  const style = doc.createElement('style');
  style.dataset['wechartTokens'] = '';
  // The code face's own files first, which --wc-font-code names (AC-223).
  style.textContent = `${PLEX_MONO_FACES}\n${themeCss()}\n${SHELL_CSS}`;
  doc.head.append(style);
}
