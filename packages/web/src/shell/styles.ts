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

/* Dashboard chrome (AC-053). The sidebar is docked at 300 px and the canvas
   takes the rest, per direction.md section 2. Only the chrome is styled here;
   the 12-column canvas grid arrives with it (T060). */
.dashboard__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 48px;
}

.dashboard__body { display: flex; align-items: flex-start; gap: 16px; }

/* direction.md section 2: "fixed-width and centred (max 1440px), with a toggle
   for full width". This is the saved setting AC-018 asks to come back, so it
   has to change the page and not just an attribute. */
.dashboard-page { width: 100%; }
.dashboard-page[data-width='fixed'] { max-width: 1440px; margin-inline: auto; }
.dashboard-page[data-width='full'] { max-width: none; }
.dashboard__canvas { flex: 1; min-width: 0; }

.edit-bar { display: flex; gap: 8px; }
.edit-bar button { height: 32px; padding: 0 12px; border: 1px solid var(--wc-border-strong); border-radius: 4px; background: var(--wc-bg-surface); color: var(--wc-text-primary); cursor: pointer; }
.edit-bar button:disabled { color: var(--wc-text-muted); cursor: default; }
/* text-on-accent, not white: white on the dark theme's accent is 2.41:1, an AA
   failure the token pair in @wechart/ui exists to prevent (AC-005). */
.edit-bar__save { background: var(--wc-accent); color: var(--wc-text-on-accent); border-color: var(--wc-accent); }

.edit-sidebar {
  flex: 0 0 300px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}

.edit-sidebar__tabs { display: flex; border-bottom: 1px solid var(--wc-border-subtle); }
.edit-sidebar__tabs button {
  flex: 1;
  height: 32px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--wc-text-secondary);
  cursor: pointer;
}
.edit-sidebar__tabs button[aria-selected='true'] {
  color: var(--wc-text-primary);
  border-bottom-color: var(--wc-accent);
}
.edit-sidebar__panel { padding: 16px; }

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
.tile-menu { position: absolute; top: 4px; right: 4px; z-index: 3; }
.tile-menu > button {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 4px;
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
  top: 24px;
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
.tile-menu__empty { padding: 4px 8px; color: var(--wc-text-secondary); }

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
