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
  --wc-surface-padding: 16px;
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

/* The top bar's search field (AC-190), the prototype's .search. */
.app-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 260px;
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

main { padding: var(--wc-surface-padding); }

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
  gap: 6px;
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
.outline__icon { width: 18px; flex: none; text-align: center; color: var(--wc-text-secondary); }
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

/* The Model workspace's files (T137, AC-131): each file a card, and under it
   the cubes and views it defines, their members grouped by kind. */
/* Spacing only: its size is .workspace-title's, the page title every
   workspace shares (AC-231). */
.model-workspace h1 { margin: 0 0 16px; }
.model-files { display: grid; gap: 12px; max-width: 960px; }
.model-file {
  padding: 12px 16px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.model-file__path {
  margin: 0 0 8px;
  font-family: var(--wc-font-code);
  font-size: 13px;
  font-weight: 600;
}
.model-file__problem { margin: 0; color: var(--wc-text-primary); }
.model-file__note { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
/* The workspace's own notes: reading, none, or a file that is not plain YAML. */
.model-files__note { margin: 0; color: var(--wc-text-secondary); }
/* A file that is code or a template (T146): why it is read-only, above its text. */
.model-readonly { display: grid; gap: 8px; max-width: 960px; }
.model-readonly__why {
  margin: 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: 12px;
}
.model-object { padding: 8px 0; border-top: 1px solid var(--wc-border-subtle); }
.model-object__name { margin: 0 0 4px; font-weight: 600; }
.model-object__kind {
  margin-right: 6px;
  padding: 0 4px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 3px;
  color: var(--wc-text-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}
.model-object__group { display: flex; gap: 8px; align-items: baseline; font-size: 13px; }
.model-object__group-title {
  flex: 0 0 120px;
  color: var(--wc-text-secondary);
  font-size: 12px;
  font-weight: 600;
}
.model-object__group ul { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 0; list-style: none; }
.model-file__path a { color: inherit; }

/* A model file's forms (T138, AC-132; direction.md §7b): the tabs as the edit
   sidebar's, fields as the prototype's .field — two short ones to a row, SQL
   and YAML the full width — and members as rows that open in place. */
/* direction.md §7b: the form as the main working area, the YAML on the right. */
.model-editor {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
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
.model-page__main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.model-page__main > .state-line { margin: 16px; }
.model-page__overview { flex: 1; min-height: 0; overflow: auto; padding: var(--wc-surface-padding); }
.model-page__note { margin: 0 0 12px; color: var(--wc-text-secondary); }
.model-tree { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--wc-border-subtle); background: var(--wc-bg-surface); }
.model-tree__head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 48px; padding: 8px 12px; border-bottom: 1px solid var(--wc-border-subtle); }
.model-tree__head h2 { flex: 1 0 100%; margin: 0; font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); font-weight: var(--wc-text-sm-strong-weight); }
.model-tree__body { flex: 1; min-height: 0; overflow: auto; padding: 8px; }
.model-tree__folder ul { margin: 0; padding: 0; list-style: none; }
.model-tree__dir { margin: 8px 0 2px; padding: 0 8px; color: var(--wc-text-secondary); font: 12px/16px var(--wc-font-code); }
.model-tree__folder:first-child .model-tree__dir { margin-top: 0; }
.model-tree__file {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 28px;
  padding: 2px 8px;
  border-radius: 4px;
  color: var(--wc-text-primary);
  font: 12px/16px var(--wc-font-code);
  text-decoration: none;
}
.model-tree__file:hover { background: var(--wc-bg-hover); }
.model-tree__file[aria-current='page'] { background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: 600; }
.model-tree__name { min-width: 0; overflow-wrap: anywhere; }
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
.model-editor__form { flex: 1; min-height: 0; overflow: auto; padding: 16px; }
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
.model-editor__head {
  flex: none;
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 48px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}
/* The file's path heads its form: the page title's size (AC-231), in the
   code face a path is written in (AC-223). */
.model-workspace .model-editor__path { flex: 1; min-width: 0; margin: 0; font-family: var(--wc-font-code); overflow-wrap: anywhere; }
.model-editor__outcome { margin: 0; color: var(--wc-text-secondary); font-size: 12px; }
/* The file's unpublished changes, beside Discard (T237, AC-226). */
.model-editor__changed {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  color: var(--wc-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
/* Leaving with them asks first: the warning bar under the head, in view
   however far the form is scrolled. */
.model-editor__warnbar.model-editor__leave { flex: none; align-items: center; margin: 8px 16px 0; }
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
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 6px;
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
  margin: 0 0 12px;
  padding: 12px 16px;
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
.model-form {
  max-width: 960px;
  margin-bottom: 16px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.model-form__count { color: var(--wc-text-muted); font-weight: 400; }
.model-form__panel { padding: 12px; }
.model-form__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}
.model-form__fields > .model-field:has(.model-field__sql),
.model-form__fields > .model-field:has(.model-field__yaml),
.model-form__fields > .model-field:has(.model-picker),
.model-form__fields > .model-field--object,
.model-form__fields > .model-field--list,
.model-form__legacy { grid-column: 1 / -1; }
/* Inspector controls, 28 px at 12 px (direction.md §7d), over the global
   32 px input rule, which outranks a bare class. */
.model-field input:not([type='checkbox']):not([type='radio']),
.model-field select { width: 100%; height: 28px; font-size: 12px; }
.model-field__sql,
.model-field__yaml {
  width: 100%;
  font-family: var(--wc-font-code);
  font-size: 12px;
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
.model-members { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.model-member {
  padding: 6px 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
}
.model-member[open] > summary { margin-bottom: 8px; }
.model-member__name { font-weight: 600; }
/* A member's row with its Remove beside it, and the list's "+ measure" under
   it, as the prototype's .formbar. */
.model-members-block { display: grid; gap: 6px; justify-items: start; }
.model-members-block > .model-members { width: 100%; }
.model-members__item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: start;
}
.model-members__item > .model-members__remove { grid-column: 2; grid-row: 1; }
/* What a rollup declares, under it in the list (T148, AC-142): label and
   value in two columns, in the member's own inset. */
.rollup-facts {
  grid-column: 1;
  grid-row: 2;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 2px 12px;
  margin: 0;
  padding: 0 9px 4px;
  font-size: 12px;
  line-height: 16px;
}
.rollup-facts > div { display: contents; }
/* The names a publish was refused for (T207, AC-189), under the rollup's facts. */
.rollup-unknown {
  grid-column: 1;
  grid-row: 3;
  margin: 0;
  padding: 0 9px 4px;
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
.model-member__type {
  margin-left: 8px;
  color: var(--wc-text-secondary);
  font-family: var(--wc-font-code);
}
/* A member's row, collapsed (T236, AC-225), as the prototype's .mrow-head:
   its name and badges, its type, and a line of its SQL. */
.model-member > summary { display: flex; flex-wrap: nowrap; gap: 6px; align-items: baseline; min-width: 0; list-style: none; }
/* A flex summary draws no marker of its own: the prototype's caret
   (model.js), closed and open, silent to a screen reader, which hears the
   row's expanded state instead. */
.model-member > summary::-webkit-details-marker { display: none; }
.model-member > summary::before { content: '▸' / ''; flex: none; width: 10px; color: var(--wc-text-muted); }
.model-member[open] > summary::before { content: '▾' / ''; }
.model-member__badge {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 999px;
  color: var(--wc-text-secondary);
  font-size: 12px;
  line-height: 16px;
}
.model-member__sql {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--wc-text-muted);
  font: 12px/16px var(--wc-font-code);
  text-align: right;
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
.jobs-workspace__tabs { margin-bottom: 12px; }
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
  height: calc(
    100vh - var(--pane-top, calc(var(--wc-app-bar-height) + var(--wc-surface-padding))) -
      var(--wc-surface-padding)
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
.query-log-view { display: grid; gap: 8px; }
.query-log__filters { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.query-log__filters label { color: var(--wc-text-secondary); font-size: var(--wc-text-xs-size); }
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
.security-workspace { display: grid; gap: 12px; align-content: start; min-width: 0; }
.security-workspace__note { margin: 0; color: var(--wc-text-secondary); }
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
  padding: 8px 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.type-card-field__change:hover { border-color: var(--wc-accent); }
.type-card-field__name { font-weight: var(--wc-text-sm-strong-weight); }
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
.type-gallery__head h2 { font-size: var(--wc-text-lg-size); }
.type-gallery__head input { flex: 1; max-width: 280px; }
.type-gallery__head .btn-sm { margin-left: auto; }
.type-gallery__shelves { display: grid; align-content: start; gap: 2px; padding: 8px; overflow: auto; border-right: 1px solid var(--wc-border-subtle); }
.dialog .type-gallery__shelves button { height: auto; min-height: 28px; padding: 4px 8px; border: 0; text-align: left; }
.dialog .type-gallery__shelves button[aria-pressed='true'] { background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: var(--wc-text-sm-strong-weight); }
.type-gallery__cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; align-content: start; padding: 12px; overflow: auto; }
.dialog .type-card { display: grid; gap: 6px; align-content: start; height: auto; padding: 12px; border-color: var(--wc-border-subtle); border-radius: 6px; text-align: left; }
.dialog .type-card:hover { border-color: var(--wc-accent); }
.dialog .type-card[aria-current='true'] { border-color: var(--wc-accent); box-shadow: 0 0 0 1px var(--wc-accent); }
/* Greyed: these fields cannot draw it, and it says what it lacks. */
.dialog .type-card[data-drawable='false'] { background: var(--wc-bg-subtle); }
.dialog .type-card[data-drawable='false'] .type-card__name { color: var(--wc-text-secondary); }
.type-card__top { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.type-card__name { font-weight: var(--wc-text-sm-strong-weight); }
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
.query-log__outcome .status { white-space: normal; overflow-wrap: anywhere; align-items: flex-start; }
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
.settings-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.settings-page__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 48px;
}
.settings-page__actions { display: flex; gap: 8px; }
.settings-page__bar button {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  cursor: pointer;
}
.settings-page__save {
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
  border-color: var(--wc-accent);
}
.settings-page__body { display: flex; align-items: stretch; gap: 16px; flex: 1; min-height: 0; }
/* The left nav direction.md asks for, at the workbench tree's 280px. */
.settings-page__nav {
  flex: 0 0 280px;
  display: grid;
  align-content: start;
  gap: 4px;
  overflow: auto;
  min-height: 0;
}
.settings-page__nav button {
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--wc-text-secondary);
  text-align: left;
  cursor: pointer;
}
.settings-page__nav button:hover { background: var(--wc-bg-subtle); }
.settings-page__nav button[aria-current='true'] {
  background: var(--wc-bg-subtle);
  color: var(--wc-text-primary);
  font-weight: var(--wc-text-sm-strong-weight);
}
.settings-page__panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.settings-page__later { color: var(--wc-text-secondary); }
/* Settings › Markings (AC-198): the prototype's colour slots, default radio,
   and a tile's limit checkboxes, each with its marking's swatch. */
.markings-table { margin-bottom: 8px; }
.marking-slots,
.marking-limits { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
.marking-slot,
.marking-limit,
.marking-default { display: inline-flex; gap: 4px; align-items: center; }
.marking-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid var(--wc-border-subtle);
}
.markings-add { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }

/* "Limit data using markings" (AC-108). The reason sits beside the option it
   explains, not in a tooltip: a disabled control with no explanation is the
   most frustrating kind, because the user cannot tell whether it is broken,
   forbidden, or waiting on something they have not done. */
.tile-limits { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
.tile-limits legend { padding: 0 0 8px; font-weight: var(--wc-text-sm-strong-weight); }
.tile-limits__row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
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
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.settings-page__activity > svg[data-icon='ok'] { color: var(--wc-status-success); }
/* direction.md calls these radio cards, so they are cards: the whole option is
   the target, not a 13px circle beside it. */
.settings-modes { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; max-width: 520px; }
.settings-modes legend { padding: 0 0 8px; font-weight: var(--wc-text-sm-strong-weight); }
.settings-modes__card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  cursor: pointer;
}
.settings-modes__card:hover { background: var(--wc-bg-subtle); }
.settings-modes__card:has(input:checked) {
  border-color: var(--wc-accent);
  background: var(--wc-bg-subtle);
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
/* The prototype's .select.sm, at this table's own 24 px row height rather
   than its 28 px, so a select does not stretch the row it sits in. */
.select-sm {
  height: 24px;
  padding: 0 6px;
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
.chart-section__title { margin: 0; font-size: 13px; line-height: 20px; font-weight: 600; color: var(--wc-text-primary); }
.chart-section__source { font-family: var(--wc-font-code); }
.chart-section > button { justify-self: start; }
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
.chart-ownership > button { justify-self: start; }
.field { display: grid; gap: 4px; }
/* An inspector's controls are the prototype's .input.sm and .select.sm: 28 px
   at 12 px, direction.md §4's compact row for inspectors. */
.panel-section .field input:not([type='checkbox']):not([type='radio']):not([type='file']),
.panel-section .field select {
  height: 28px;
  font-size: 12px;
}
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
.tile-head__title {
  flex: 1;
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
/* The small button's 24 px — a pointer target's minimum — overhanging the
   row by a pixel each way, so the head stays the prototype's 22 (T252,
   mismatch 9) with the badges beside it. */
.tile-head .tile-head__action { margin: -1px 0 -1px auto; }
/* A chart whose filtered answer is on its way (AC-078): still drawn, dimmed. */
/* What is drawn fades while it is asked again; the head — the title, and the
   "Updating…" that says so — keeps its contrast (T183's review, AC-005). */
.chart-tile--busy > :not(.tile-head) { opacity: 0.55; transition: opacity 120ms ease-in; }
/* Said in the head, as well as by the fade (T183, AC-177). */
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
  padding: 4px 6px;
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
.grid-canvas__add {
  min-height: 32px;
  border: 1px dashed var(--wc-border-strong);
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
  cursor: pointer;
}
.grid-canvas__add[aria-pressed='true'] {
  border-style: solid;
  border-color: var(--wc-accent);
  color: var(--wc-text-primary);
}
.grid-tile[data-selected='true'] { outline: 2px solid var(--wc-accent); outline-offset: -1px; }

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
.grid-canvas[data-gridlines='true'][data-resizing='true'] {
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
.grid-tile > .chart-tile {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
}
.grid-tile > .chart-tile > :not(.tile-head) { flex: 1 1 0; min-height: 0; }

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
   element its own row; the row makes room for it while editing. An element
   with no row of its own keeps it at its corner. */
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
/* A chart's head: 16 px in, its row 22 px high. */
.grid-tile:has(.tile-head) > .grid-tile__grip { top: 18px; left: 16px; }
/* A section's head: 8 px down and 12 in, its row 36 px high. */
.grid-tile:has(> .dashboard-section) > .grid-tile__grip { top: 17px; left: 12px; }
/* The Header and the Divider, which have no padding: centred on their row. */
.grid-tile:has(> .dashboard-heading) > .grid-tile__grip,
.grid-tile:has(> .dashboard-divider) > .grid-tile__grip {
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}
.dashboard[data-editing='true'] .grid-tile:has(> .grid-tile__grip) .tile-head,
.dashboard[data-editing='true'] .grid-tile:has(> .grid-tile__grip) > .dashboard-section > .dashboard-section__head,
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
.dashboard[data-editing='true'] .grid-tile[data-selected='true'] {
  outline: 2px solid var(--wc-accent);
  outline-offset: -1px;
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
.tile-menu__empty { padding: 4px 8px; color: var(--wc-text-secondary); }
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
.dialog h2 { margin: 0; }
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
.chart-editor {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  grid-template-rows: auto minmax(0, 1fr);
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
.chart-editor__head .shared-chart-notice { flex: 0 1 auto; margin: 0; }
.chart-editor__head [data-testid='editor-back'] {
  flex: 0 1 auto;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* The title reads as a heading until it is pointed at or typed in. */
.chart-editor__title {
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
.chart-editor__title:hover,
.chart-editor__title:focus { border-color: var(--wc-border-strong); background: var(--wc-bg-surface); }
.chart-editor__meta { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); white-space: nowrap; }
.chart-editor__spacer { flex: 1; }
.chart-editor__fields,
.chart-editor__inspector { min-height: 0; overflow: auto; background: var(--wc-bg-surface); }
.chart-editor__fields { padding: 12px; border-right: 1px solid var(--wc-border-subtle); }
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
.chart-editor__empty { margin: auto; color: var(--wc-text-secondary); }
.chart-editor__missing { margin: auto; max-width: 480px; }
/* The drawer at the foot of the preview (AC-214): the only place result rows
   are printed, its height its own so the preview keeps the rest. */
.chart-editor__center .results-drawer {
  flex: none;
  max-height: 40%;
  overflow: auto;
  padding: 8px 12px;
  border-top: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
}

.well {
  padding: 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}

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
.preview-frame__sizes { display: flex; gap: 4px; }
.preview-frame__sizes button {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  cursor: pointer;
}
.preview-frame__sizes button[aria-pressed='true'] {
  border-color: var(--wc-accent);
  background: var(--wc-accent);
  color: var(--wc-text-on-accent);
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
/* Its two parts are one badge's text (T252): no pill of their own inside it.
   Kept on screen while the marking badge shows, where the prototype hides it:
   AC-013 fails on an accelerated tile without its mark. */
.tile-freshness > .acceleration,
.tile-freshness > .tile-as-of { height: auto; padding: 0; background: none; }
.acceleration--accelerated { color: var(--wc-status-success); }
@media (hover: none) {
  .tile-refresh,
  .tile-pencil { opacity: 1; }
}

.wells { display: grid; gap: 8px; }
.wells ul { margin: 0; padding: 0; list-style: none; }

/* Legality is an outline plus a written reason, never colour alone
   (direction.md rule 3, AC-027). */
.well[data-drop='legal'] { outline: 2px solid var(--wc-accent); }
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
.customize-tab__check { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.customize-tab__series { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.customize-tab__series li { display: flex; align-items: center; gap: 8px; }
.customize-tab__series input[type='color'] { width: 28px; height: 20px; padding: 0; border: 1px solid var(--wc-border-subtle); border-radius: 4px; background: none; }
.axis-panel { display: grid; gap: 4px; margin: 0 0 8px; padding: 8px; border: 1px solid var(--wc-border-subtle); border-radius: 6px; }
.axis-panel > legend { padding: 0 4px; font-size: 12px; font-weight: 600; color: var(--wc-text-secondary); }
.axis-panel > label { font-size: 12px; color: var(--wc-text-secondary); }
.field-list { display: grid; gap: 8px; align-content: start; }
.field-list > label { font-size: 12px; line-height: 16px; font-weight: 600; color: var(--wc-text-secondary); }
.field-list ul { margin: 0; padding: 0; list-style: none; }
.field-list h4 {
  margin: 6px 0 2px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.field-list__none { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
/* A cube's fields under its name and count (AC-215, the prototype's .tgroup). */
.field-list__cube { display: grid; }
.field-list__cube-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 20px;
  font-weight: 600;
  color: var(--wc-text-primary);
}
.field-list__count { margin-left: auto; font-weight: 400; color: var(--wc-text-secondary); font-variant-numeric: tabular-nums; }
/* One field (the prototype's .frow): icon, title, what it is, in the chart. */
.field-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 13px;
  cursor: grab;
}
.field-row[role='button']:hover { background: var(--wc-bg-subtle); }
.field-row[data-used='true'] .field-row__name { font-weight: 600; }
.field-row__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.field-row__meta { font-size: 12px; color: var(--wc-text-secondary); }
.field-row__used { color: var(--wc-accent); }
/* A field in a well (AC-216, the prototype's .pill): its title, its tag or
   grain, and ×. */
.well__pills { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  min-height: 24px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 12px;
  background: var(--wc-bg-subtle);
  font-size: 12px;
}
.pill__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill__tag { font-size: 12px; color: var(--wc-text-secondary); }
.pill__grain { height: 20px; border: 0; background: none; color: var(--wc-text-secondary); font-size: 12px; }
.pill__remove { border: 0; background: none; color: var(--wc-text-secondary); cursor: pointer; padding: 0 4px; }

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
.filter-widget__options :focus-visible {
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
