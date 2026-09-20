import { themeCss } from '@wechart/ui';

/**
 * The generated token custom properties plus the shell's own rules. Injected
 * once at start-up rather than imported as a .css file, so the tokens have a
 * single source in TypeScript and the audit in @wechart/ui checks the same
 * values the browser paints (AC-004, AC-005).
 */
const SHELL_CSS = `
* { box-sizing: border-box; }

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
  height: 48px;
  padding: 0 16px;
  background: var(--wc-bg-surface);
  border-bottom: 1px solid var(--wc-border-subtle);
}

.app-bar__product {
  font-size: var(--wc-text-md-size);
  font-weight: var(--wc-text-md-weight);
}

.workspace-switcher ul {
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workspace-switcher a {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 4px;
  color: var(--wc-text-secondary);
  text-decoration: none;
}

.workspace-switcher a:hover { background: var(--wc-bg-subtle); }

.workspace-switcher a[aria-current='page'] {
  color: var(--wc-text-primary);
  background: var(--wc-bg-subtle);
  font-weight: var(--wc-text-sm-strong-weight);
}

.theme-toggle {
  margin-left: auto;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font: inherit;
  cursor: pointer;
}

main { padding: 16px; }

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

/* The selected row is marked by more than the focus ring, so the selection is
   still visible when focus moves into a control inside the row. */
.folder-contents tbody tr[aria-selected='true'] { background: var(--wc-bg-subtle); }

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
