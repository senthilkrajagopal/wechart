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

/* The two chrome measurements the dashboard has to subtract from the viewport
   to size itself (see .dashboard). Declared once, as custom properties, for
   the same reason styles.ts imports COLUMNS and GUTTER_PX from geometry.ts:
   a second copy of a number is a number that can drift, and here the drift
   would be a silent second scrollbar rather than anything that fails loudly. */
:root {
  --wc-app-bar-height: 48px;
  --wc-surface-padding: 16px;
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
  height: var(--wc-app-bar-height);
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
  gap: 16px;
  flex: 1;
  min-height: 0;
}

/* direction.md section 2: "fixed-width and centred (max 1440px), with a toggle
   for full width". This is the saved setting AC-018 asks to come back, so it
   has to change the page and not just an attribute. */
.dashboard-page { width: 100%; }
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
.dashboard__gear {
  margin-right: auto;
  width: 32px;
  height: 32px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  cursor: pointer;
}
.dashboard__gear:hover { background: var(--wc-bg-subtle); }

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
  inset: var(--wc-surface-padding);
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
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
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
.edit-bar button { height: 32px; padding: 0 12px; border: 1px solid var(--wc-border-strong); border-radius: 4px; background: var(--wc-bg-surface); color: var(--wc-text-primary); cursor: pointer; }
/* aria-disabled, not :disabled. The bar keeps disabled buttons focusable (the
   APG toolbar pattern, T059), so they are never :disabled and that rule never
   matched: Undo, Redo and Discard looked active when they had nothing to do,
   and a held-back Save looked like the primary action (T032). */
.edit-bar button[aria-disabled='true'] { color: var(--wc-text-muted); cursor: default; }
/* text-on-accent, not white: white on the dark theme's accent is 2.41:1, an AA
   failure the token pair in @wechart/ui exists to prevent (AC-005). */
.edit-bar__save { background: var(--wc-accent); color: var(--wc-text-on-accent); border-color: var(--wc-accent); }
.edit-bar__save[aria-disabled='true'] {
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
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}

.edit-sidebar__tabs { display: flex; flex: 0 0 auto; border-bottom: 1px solid var(--wc-border-subtle); }
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
.edit-sidebar__panel { padding: 16px; flex: 1; min-height: 0; overflow: auto; }

/* The Add palette (AC-058). Every entry carries its hint, because the
   difference between "Chart" and "Chart from folders" is the whole of
   direction.md's chart-ownership model and a bare name would not convey it. */
.add-panel__destination { margin: 0 0 8px; color: var(--wc-text-secondary); }
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
.add-panel button:hover { background: var(--wc-bg-subtle); }
.add-panel__label { font-weight: 600; }
.add-panel__hint { color: var(--wc-text-secondary); }
/* The four filter kinds, under the Filter entry they came from. */
.add-panel__choices { margin: 4px 0 0 12px !important; }

/* The filter bar (F9; direction.md §2: horizontal, under the title). Controls
   are 32 px high, direction.md's default control height. */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px 12px;
  padding: 8px 0 12px;
}
.filter-bar__filter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.filter-bar__filter select,
.filter-bar__filter input:not([type='checkbox']) {
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
}
.filter-bar__filter input[type='number'] { width: 7em; }
.filter-bar__filter > button {
  height: 32px;
  min-width: 32px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-secondary);
  cursor: pointer;
}
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
.tile-properties { display: grid; gap: 6px; }
.tile-properties__hint { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
.tile-properties__problem { margin: 0; color: var(--wc-text-primary); }
/* A tile a filter in effect cannot reach (AC-079): said on the tile, in
   secondary ink with an icon-free label, since it is information, not an error. */
.tile-not-covered {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--wc-text-secondary);
}
/* A chart whose filtered answer is on its way (AC-078): still drawn, dimmed. */
.chart-tile--busy { opacity: 0.55; transition: opacity 120ms ease-in; }
/* A filter's scope (direction.md rule 14): a 24 px chip, like the other chips. */
.filter-bar__scope {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
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
.add-panel__heading {
  margin: 16px 0 8px;
  font-size: var(--wc-text-sm-size);
  font-weight: var(--wc-text-sm-strong-weight);
  color: var(--wc-text-secondary);
}
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
  margin: 0 0 8px;
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
/* Delete sits apart from the destinations above it: one changes where a thing
   is, the other takes it away. */
.tile-menu__delete { margin-top: 4px; border-top: 1px solid var(--wc-border-subtle); }

/* Deleting a page tab or a tab (AC-060), beside the strip they belong to. */
.page-tabs__actions { display: flex; gap: 8px; }
.page-tabs__actions button,
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
  top: 4px;
  right: 28px;
  z-index: 3;
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
.grid-tile:hover .tile-pencil,
.tile-pencil:focus-visible { opacity: 1; }
@media (hover: none) {
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
