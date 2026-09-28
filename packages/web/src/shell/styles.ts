import { themeCss } from '@wechart/ui';

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
  margin-left: auto;
  padding: 0 4px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 3px;
  color: var(--wc-text-muted);
  font: 600 12px/16px Inter, system-ui, sans-serif;
}
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
.seg button[aria-pressed='true'] {
  background: color-mix(in srgb, var(--wc-accent) 12%, var(--wc-bg-surface));
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
   takes up to two lines of its own; the state and the actions never wrap. */
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
   The prototype's .admin-main: 16 px by 24, each part 12 px from the next. */
.explore__contents {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 16px 24px 0;
}
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
.explore__alone {
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-muted);
}
.access-panel {
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
  padding: 8px 12px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.access-panel__head h2 {
  margin: 0;
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
  font-weight: var(--wc-text-sm-strong-weight);
}
.access-panel__folder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--wc-text-secondary);
  font-size: var(--wc-text-xs-size);
}
.access-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.access-panel__alone,
.access-panel__unset {
  margin: 0;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-muted);
}
.access-panel__level h3 {
  margin: 0 0 4px;
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
  font-weight: var(--wc-text-sm-strong-weight);
}
.access-panel__level h4 {
  margin: 8px 0 2px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-sm-strong-weight);
  color: var(--wc-text-secondary);
}
.access-panel__list { list-style: none; margin: 0; padding: 0; }
.access-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  font-size: var(--wc-text-sm-size);
}
.access-row__lock { flex: none; color: var(--wc-text-muted); }
.access-row__group { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.access-row__source,
.access-row__note { font-size: var(--wc-text-xs-size); color: var(--wc-text-muted); }
.access-row__remove { margin-left: auto; }
.access-picker {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 8px;
  align-items: center;
  font-size: var(--wc-text-sm-size);
}
.access-picker button { grid-column: 2; justify-self: start; }
.access-panel__ask {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
}
.access-panel__ask p { flex-basis: 100%; margin: 0; font-size: var(--wc-text-sm-size); }
.access-panel__saved { margin: 0; font-size: var(--wc-text-sm-size); }
.access-panel__foot { display: flex; justify-content: flex-end; }

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
.query-log tbody tr:last-child > :first-child { border-bottom-left-radius: 5px; }
.folder-contents tbody tr:last-child > :last-child,
.query-log tbody tr:last-child > :last-child { border-bottom-right-radius: 5px; }
.folder-contents tbody td,
.folder-contents tbody th,
.query-log tbody td,
.query-log tbody th { font-size: var(--wc-text-xs-size); }
.query-log tbody td,
.query-log tbody th { height: 34px; }
.folder-contents tbody tr:last-child > *,
.query-log tbody tr:last-child > * { border-bottom: 0; }

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
.source-pane__close {
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
.source-pane__foot-note { font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.source-pane__foot-note.is-err { color: var(--wc-status-error); }

/* Generate cubes as design 11 (T485, AC-344): design 01's pane, docked as the
   Model page's third column — beside the overview, or in the code's place on
   a file's page, the form widening — its steps in cards of 34 px rows. */
.model-page.model-page--generating { grid-template-columns: 240px minmax(0, 1fr) 480px; }
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
.generate-pane__opened,
.generate-pane__refused { display: grid; margin: 0; padding: 0; list-style: none; }
.generate-pane__opened > li,
.generate-pane__refused > li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; min-height: 34px; padding: 4px 12px; font-size: 12px; }
.generate-pane__opened > li + li,
.generate-pane__refused > li + li { border-top: 1px solid var(--wc-border-subtle); }
.generate-pane__opened .btn-sm { margin-left: auto; }
.generate-pane__refusal { flex-basis: 100%; color: var(--wc-status-error); }
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
.source-pane .field > label,
.source-pane .field__label {
  font-size: var(--wc-text-xs-size);
  font-weight: 600;
  color: var(--wc-text-primary);
}
.field__req { font-weight: 400; color: var(--wc-text-secondary); }
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
/* Choices seen at once: segmented for two, rows for three, cards where each
   needs saying (design 02, pins 1 and 3). */
.choice--segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  overflow: hidden;
}
.choice--segmented > .choice__option {
  min-height: 0;
  height: 30px;
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
    z-index: 40;
    border-left: 0;
  }
  .source-pane__rail ol { display: none; }
  .source-pane__rail-short { display: flex; }
  .admin-page--docked { grid-template-columns: minmax(0, 1fr); }
  .explore--source { grid-template-columns: minmax(0, 1fr); }
  /* Generate cubes covers the page, as design 01's pane does (design 11 pin 1). */
  .model-page.model-page--generating { grid-template-columns: minmax(0, 1fr); }
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
}
.info-bar p { margin: 0; }
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
/* The Jobs workspace's tabs, and its pre-aggregations with their builds (T155). */
/* Tabs on the page ground, not on a band of their own (T466, UX-109). */
.jobs-workspace__tabs { margin-bottom: 12px; background: none; }
/* Its header: the title, then Cube's health and the refresh worker's (T162). */
.jobs-workspace__head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
.jobs-health { display: flex; flex-wrap: wrap; gap: 12px; }
/* The list beside the prototype's docked 400 px pane (AC-228): the pane runs
   the window's height below the app bar, stays put while the list scrolls,
   and scrolls on its own. */
.build-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 16px;
  align-items: start;
}
.build-panel__list { display: grid; gap: 12px; min-width: 0; }
.build-panel__row { cursor: pointer; }
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
/* The cubes each uses (T459): one a line, its folder after it, quieter. */
.sources-used-by { margin: 0; padding: 0; list-style: none; display: grid; gap: 2px; }
.sources-muted { color: var(--wc-text-secondary); }
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
}
.build-panel__head { margin: 0; font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); font-weight: 600; }
.build-panel__builds,
.build-jobs__list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.build-jobs { display: grid; gap: 4px; }
.build-jobs__id { font-weight: 600; }
.build-jobs__job { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; font-size: 12px; }
.build-jobs__table { color: var(--wc-text-secondary); overflow-wrap: anywhere; }
.build-panel__note { margin: 8px 0 0; color: var(--wc-text-secondary); font-size: 12px; }
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
/* The policies, and beside them the prototype's right pane, "Preview a
   security context" (T172); stacked when there is no room for both. */
.security-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) { .security-layout { grid-template-columns: minmax(0, 1fr); } }
.context-preview {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.context-preview h2 { margin: 0; font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); font-weight: 600; }
.context-preview textarea { font-family: var(--wc-font-code); font-size: 12px; }
.context-preview__note { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.context-preview__problem { font-size: 12px; line-height: 16px; color: var(--wc-status-error); }
.context-preview__found { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
/* Docked as the full-height pane beside the policies (AC-228, AC-232): the
   pane's edge, not a card's box. */
.context-preview.admin-pane { padding: 12px 16px; border: 0; border-left: 1px solid var(--wc-border-subtle); border-radius: 0; }
@media (max-width: 1100px) { .context-preview.admin-pane { position: static; height: auto; border-left: 0; } }
.context-preview__presets { display: flex; flex-wrap: wrap; gap: 6px; }
.context-preview__access h3 { margin: 0 0 6px; font-size: var(--wc-text-xs-size); font-weight: 600; color: var(--wc-text-secondary); }
.context-preview__access ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.context-preview__access li { display: flex; flex-wrap: wrap; gap: 2px 6px; align-items: center; font-size: 12px; line-height: 16px; }
.context-preview__object { font-family: var(--wc-font-code); font-weight: 600; }
.context-preview__why { flex-basis: 100%; color: var(--wc-text-secondary); overflow-wrap: anywhere; }
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
.type-card-field__name { font-size: 12px; font-weight: var(--wc-text-sm-strong-weight); }
.type-card-field__why { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
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
.preview-banner code { overflow-wrap: anywhere; font-weight: 400; }
.preview-banner a { margin-left: auto; color: var(--wc-text-primary); }
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
.dialog.new-item-dialog { width: min(520px, calc(100vw - 32px)); max-width: none; gap: 12px; }
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
.context-preview__problem > svg[data-icon],
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
.dashboard__bookmarks { flex: none; }
.dashboard__bookmarks-button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 12px; }
.dialog.save-bookmark { width: min(420px, calc(100vw - 32px)); }
.save-bookmark form { display: grid; gap: 12px; }
.save-bookmark__name { display: grid; gap: 4px; }
.save-bookmark__keeps { margin: 0; color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); }

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
.settings-page__title { margin: 0 0 0 8px; font-size: 16px; line-height: 20px; font-weight: 600; }
.settings-page__spacer { flex: 1; }
.settings-page__unsaved {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-secondary);
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
}
/* .settings-inner: flat, padded 16 24 48, at most 920 px. */
.settings-page__panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 16px 24px 48px;
}
/* min-width 0: a wide cross-filter matrix scrolls in its own box rather than
   widening the grid's track and the panel with it (T249's review). */
.settings-page__panel > * { max-width: 872px; min-width: 0; }
.settings-page__panel > h2 { margin: 0; font-size: 18px; line-height: 20px; font-weight: 600; }
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
.settings-modes { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
.settings-modes legend { padding: 0 0 8px; font-weight: var(--wc-text-sm-strong-weight); }
.settings-modes__cards {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}
.settings-modes__card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 8px;
  background: var(--wc-bg-surface);
  cursor: pointer;
}
.settings-modes__card:hover { background: var(--wc-bg-hover); }
.settings-modes__card:has(input:checked),
.settings-modes__card:has(input:checked):hover {
  border-color: var(--wc-accent);
  box-shadow: 0 0 0 1px var(--wc-accent);
  background: color-mix(in srgb, var(--wc-bg-accent-soft) 40%, var(--wc-bg-surface));
}
.settings-modes__card > input { flex: none; margin: 3px 0 0; }
.settings-modes__text { display: grid; gap: 4px; }
.settings-modes__name { font-size: 14px; line-height: 20px; font-weight: 600; }
.settings-modes__about { color: var(--wc-text-secondary); }
.settings-modes__refs {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  line-height: 16px;
  color: var(--wc-text-secondary);
}
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
.grid-table.comfy tbody td,
.grid-table.comfy tfoot td { height: 34px; }
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
.grid-table.comfy tfoot th { height: 34px; }
.grid-table tbody tr:hover th { background: var(--wc-bg-hover); }
.grid-table__total { font-weight: 600; }
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
.filter-popover__settings {
  display: grid;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--wc-border-subtle);
}
.filter-popover__remove { justify-self: start; }
.filter-popover input[type='number'] { width: 7em; }
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
.link-tile--text { color: var(--wc-accent); text-decoration: underline; }
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
  min-height: 20px;
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
/* The KPI, as the prototype draws it (T300, AC-187, direction rule 1): its
   name in .xs.sec.strong over its value in .kpi-val, 32 px at 600 in tabular
   numerals, on a 36 px line in a dashboard's .dtile.kpi, which is padded
   12 16 with 4 px under its head. */
.kpi { display: flex; flex-direction: column; min-height: 0; }
.kpi p { margin: 0; }
.kpi__label {
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.kpi__value {
  font-size: 32px;
  line-height: 40px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.grid-tile:has(> .chart-tile .kpi) { padding: 12px 16px; }
.grid-tile:has(> .chart-tile .kpi) .tile-head { margin-bottom: 4px; }
.grid-tile .kpi__value { line-height: 36px; }
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
  width: 250px;
  max-height: min(480px, calc(100vh - 16px));
  margin: 0;
  padding: 4px;
  overflow: auto;
  border: 1px solid var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  color: var(--wc-text-primary);
  box-shadow: var(--wc-shadow-pop);
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
.menu__check { width: 12px; flex: 0 0 auto; color: var(--wc-accent); }
.menu__chevron { margin-left: auto; color: var(--wc-text-muted); }
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
  font-size: 15px;
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
  padding: 6px;
  border: 1px dashed var(--wc-border-strong);
  border-radius: 6px;
  background: var(--wc-bg-surface);
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
/* Where the chart's answer came from (T014, AC-013) and when its data is from
   (T154): the prototype's .badge in the tile head, where its tiles carry their
   data's age — "ok"-coloured when a pre-aggregation served it. */
.tile-freshness,
.acceleration,
.tile-as-of {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.tile-freshness,
.acceleration { gap: 4px; }
/* Gives way to the title (T250): shrinks far faster than it, cutting its
   words short rather than the title's — but never below "● Live…" or
   "⚡ 40m…", its state's icon and word (rule 3); the whole in its tooltip. */
.tile-freshness {
  display: block;
  flex: 0 100 auto;
  min-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 22px;
}
/* Its two parts are one badge's text (T252): no pill of their own inside it.
   Kept on screen while the marking badge shows, where the prototype hides it:
   AC-013 fails on an accelerated tile without its mark. */
.tile-freshness > .acceleration,
.tile-freshness > .tile-as-of { display: inline; height: auto; padding: 0; background: none; }
/* The badge's 4 px between its parts, as inline text now (T250's review):
   its gap no longer applies, and the markup has no spaces of its own. */
.tile-freshness > * + * { margin-left: 4px; }
.tile-freshness .acceleration--accelerated > .acceleration__short { margin-left: 4px; }
.acceleration--accelerated { color: var(--wc-status-success); }
@media (hover: none) {
  .tile-refresh,
  .tile-pencil { opacity: 1; }
}

.wells { display: grid; gap: 8px; }
.wells ul { margin: 0; padding: 0; list-style: none; }

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
.customize-tab__section > h3 {
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
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
   the source and the search each padded 8 12, then each cube's .tgroup. */
.field-list { display: grid; align-content: start; }
.field-list__source { display: grid; gap: 4px; padding: 8px 12px 0; }
.field-list__source > label { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--wc-text-secondary); }
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
.pill__grain {
  height: 20px;
  padding: 0 2px;
  border: 0;
  background: none;
  color: inherit;
  font-size: 12px;
  font-weight: 400;
}
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
.page-tabs [role='tab']:focus-visible {
  outline-offset: -2px;
}
/* On the toast's inverted ground the accent falls short of 3:1 (WCAG 1.4.11);
   the toast's own ink does not. */
.undo-toast :focus-visible { outline-color: currentColor; }
`;

export function installStyles(doc: Document = document): void {
  if (doc.querySelector('style[data-wechart-tokens]')) return;

  const style = doc.createElement('style');
  style.dataset['wechartTokens'] = '';
  // The code face's own files first, which --wc-font-code names (AC-223).
  style.textContent = `${PLEX_MONO_FACES}\n${themeCss()}\n${SHELL_CSS}`;
  doc.head.append(style);
}
