import { themeCss } from '@wechart/ui';

import { COLUMNS, GUTTER_PX } from '../dashboard/grid/geometry';

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

.theme-toggle { margin-left: auto; }

main { padding: var(--wc-surface-padding); }

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  clip-path: inset(50%);
  overflow: hidden;
  white-space: nowrap;
}

.explore {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  align-items: start;
}

/* The Model workspace's files (T137, AC-131): each file a card, and under it
   the cubes and views it defines, their members grouped by kind. */
.model-workspace h1 { margin: 0 0 16px; font-size: var(--wc-text-xl-size); line-height: var(--wc-text-xl-line); }
.model-files { display: grid; gap: 12px; max-width: 960px; }
.model-file {
  padding: 12px 16px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.model-file__path {
  margin: 0 0 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 1fr);
  gap: 16px;
  align-items: start;
}
.model-editor__yaml { position: sticky; top: 0; }
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
.model-editor__view { margin-bottom: 8px; }
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
  font: 600 13px ui-monospace, SFMono-Regular, Menlo, monospace;
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
  grid-column: 1 / -1;
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
}
.model-editor__outcome { margin: 0; color: var(--wc-text-secondary); font-size: 12px; }
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
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.yaml-editor .cm-gutters {
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  border-right: 1px solid var(--wc-border-subtle);
}
.yaml-editor .cm-focused { outline: 2px solid var(--wc-accent); }
/* The YAML leaves room for the Problems panel beneath it. */
.model-editor__yaml .yaml-editor .cm-editor { max-height: calc(100vh - 330px); }

/* Problems (T141, AC-135), the prototype's .problems and .prob: a header as a
   selected tab, then a row a problem, 28 px, glyph · message · file:line. */
.model-problems {
  max-height: 150px;
  margin-top: 8px;
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
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
.model-file-page__path {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 16px !important;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.explore__tree,
.explore__contents {
  padding: 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}

.folder-tree ul { margin: 0; padding-left: 12px; list-style: none; }
.folder-tree > ul { padding-left: 0; }

.folder-tree__label,
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

.folder-tree__label:hover,
.link-button:hover { background: var(--wc-bg-subtle); text-decoration: underline; }

[role='treeitem'][aria-selected='true'] > .folder-tree__label {
  background: var(--wc-bg-subtle);
  font-weight: var(--wc-text-sm-strong-weight);
}

.folder-contents,
.query-log {
  width: 100%;
  border-collapse: collapse;
}

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

.folder-contents thead th,
.query-log thead th {
  font-weight: var(--wc-text-xs-strong-weight);
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
}

.folder-contents__empty,
.query-log__empty { color: var(--wc-text-secondary); }
/* The Jobs workspace's tabs, and its pre-aggregations with their builds (T155). */
.jobs-workspace__tabs { margin-bottom: 12px; }
/* Its header: the title, then Cube's health and the refresh worker's (T162). */
.jobs-workspace__head { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
.jobs-health { display: flex; flex-wrap: wrap; gap: 12px; }
.build-panel { display: grid; gap: 12px; }
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
.context-preview textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.context-preview__note { font-size: 12px; line-height: 16px; color: var(--wc-text-secondary); }
.context-preview__problem { font-size: 12px; line-height: 16px; color: var(--wc-status-error); }
.context-preview__found { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
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
.dialog .generated-sql__params { font: 12px/16px ui-monospace, SFMono-Regular, Menlo, monospace; }
.dialog .generated-sql__problem { color: var(--wc-status-error); overflow-wrap: anywhere; }
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

/* The selected row is marked by more than the focus ring, so the selection is
   still visible when focus moves into a control inside the row. */
.folder-contents tbody tr[aria-selected='true'] { background: var(--wc-bg-subtle); }

/* Dashboard chrome (AC-053). The sidebar is docked at 300 px and the canvas
   takes the rest, per direction.md section 2. Only the chrome is styled here;
   the 12-column canvas grid arrives with it (T060). */
.dashboard__header {
  display: flex;
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
   would fix that and take the window's scrollbar away from every other
   workspace, including the long Explore list AC-003 scrolls. */
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
.dashboard-page[data-width='fixed'] { max-width: 1440px; margin-inline: auto; }
.dashboard-page[data-width='full'] { max-width: none; }
/* position: relative so the canvas is a containing block as well as a scroll
   container. Without it an absolutely positioned descendant with no nearer
   positioned ancestor — the visually-hidden aria-live region at the end of the
   canvas is one — resolves against the page instead, which neither clips it
   nor scrolls it, so it stretches the document and the window gains a second
   scrollbar behind the canvas's own. WebKit showed it first (AC-067's e2e
   test measured window.scrollY at 22 there). */
.dashboard__canvas { position: relative; flex: 1; min-width: 0; min-height: 0; overflow: auto; }

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
  font-size: 16px;
}
.edit-bar .icon-button:hover:not([aria-disabled='true']) { background: var(--wc-bg-hover); }
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
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--wc-text-secondary);
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
.tile-note code { font-size: 11px; overflow-wrap: anywhere; }
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
.tile-head__action { margin-left: auto; }
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
.tile-empty {
  display: grid;
  gap: 4px;
  place-content: center;
  height: 100%;
  padding: 16px;
  color: var(--wc-text-secondary);
  text-align: center;
}
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
.mark-badge__swatch,
.mark-chip__swatch {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: 0 0 auto;
}
/* references-markings.md fixes the chip: 24px high, 999px radius, 12px at 600. */
.mark-chip {
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-primary);
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
}

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
.grid-canvas[data-gridlines='true'] {
  background-image: repeating-linear-gradient(
    to right,
    var(--wc-border-subtle) 0 1px,
    transparent 1px calc((100% + ${String(GUTTER_PX)}px) / ${String(COLUMNS)})
  );
}

/* direction.md section 2: "a faint 12-column grid while editing, and a
   stronger one during a drag or resize" — the columns are what a resize is
   aiming at, so they step forward while one is happening. */
.grid-canvas[data-gridlines='true'][data-resizing='true'] {
  background-image: repeating-linear-gradient(
    to right,
    var(--wc-border-strong) 0 1px,
    transparent 1px calc((100% + ${String(GUTTER_PX)}px) / ${String(COLUMNS)})
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
.grid-tile__grip {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 2;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--wc-text-secondary);
  cursor: grab;
  opacity: 0;
  touch-action: none;
}
.grid-tile:hover .grid-tile__grip,
.grid-tile__grip:focus-visible { opacity: 1; }
@media (hover: none) {
  .grid-tile__grip { opacity: 1; }
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
.tile-menu__list {
  position: absolute;
  top: 28px;
  right: 0;
  z-index: 3;
  min-width: 180px;
  max-height: 200px;
  margin: 0;
  padding: 4px;
  overflow: auto;
  list-style: none;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.tile-menu__list button {
  width: 100%;
  padding: 4px 8px;
  border: 0;
  background: none;
  color: var(--wc-text-primary);
  text-align: left;
  cursor: pointer;
}
.tile-menu__list button:hover { background: var(--wc-bg-subtle); }
.tile-menu__list button:disabled { color: var(--wc-text-muted); cursor: not-allowed; }
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
/* Duplicate makes something where Delete takes it away: its own group, above (AC-062). */
.tile-menu__duplicate { margin-top: 4px; border-top: 1px solid var(--wc-border-subtle); }
.tile-menu__duplicate + .tile-menu__delete { margin-top: 0; border-top: 0; }

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

.chart-editor {
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  grid-template-areas: 'bar bar bar' 'fields wells result';
  gap: 16px;
}

.editor-bar { grid-area: bar; display: flex; gap: 8px; }
.editor-bar button { height: 32px; padding: 0 12px; border: 1px solid var(--wc-border-strong); border-radius: 4px; background: var(--wc-bg-surface); color: var(--wc-text-primary); cursor: pointer; }
.editor-bar button:disabled { color: var(--wc-text-muted); cursor: default; }

.chart-editor > *,
.well {
  padding: 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
/* The first row's JSON wraps within its column: one unbroken line of it
   pushed the page sideways at 1,280 px (T184, AC-179). */
.chart-editor [data-testid='result-first-row'] { white-space: pre-wrap; overflow-wrap: anywhere; }

/* The chart editor opened over the dashboard from a tile (T032). Laid out
   as the settings page is: its own bar in place of the dashboard's, and the
   editor filling what is left. */
.chart-editor-overlay { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 16px; }
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
/* Here the preview takes the flexible column, not the narrow side one: a
   tile at its actual size is often far wider than 280 pixels. The editor
   fills the overlay's height so that Fit has somewhere to grow, and the
   preview scrolls within itself rather than widening the page. */
.chart-editor-overlay .chart-editor {
  flex: 1;
  min-height: 0;
  grid-template-columns: 240px 240px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
}
.chart-editor-overlay .chart-editor__result { display: flex; flex-direction: column; min-height: 0; overflow: auto; }
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
  font-size: 10px;
  font-weight: 600;
}
/* Where the chart's answer came from (T014, AC-013) and when its data is from
   (T154): the prototype's .badge in the tile head, where its tiles carry their
   data's age — "ok"-coloured when a pre-aggregation served it. */
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
.acceleration { gap: 4px; }
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

.field-list ul { margin: 0; padding: 0; list-style: none; }
.field-list li { padding: 2px 4px; cursor: grab; }

.palette-backdrop {
  position: fixed;
  inset: 0;
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

.palette__close {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
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

:focus-visible {
  outline: 2px solid var(--wc-accent);
  outline-offset: 2px;
}
`;

export function installStyles(doc: Document = document): void {
  if (doc.querySelector('style[data-wechart-tokens]')) return;

  const style = doc.createElement('style');
  style.dataset['wechartTokens'] = '';
  style.textContent = `${themeCss()}\n${SHELL_CSS}`;
  doc.head.append(style);
}
