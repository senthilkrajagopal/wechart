/**
 * The SQL runner workspace's own rules (F42; design 17; direction §7f),
 * installed after the shell's. Every value reuses an existing token: the
 * workspace adds no colour, type size or weight (rule 108).
 *
 * The panes' widths come from `panes.ts` through custom properties the
 * workspace sets as they are dragged; whether a side pane is a rail comes
 * from its `data-folded`, which the workspace sets by the window's width,
 * so the stylesheet and the component can't disagree.
 */
export const SQL_CSS = `
/* The page itself never scrolls: each pane scrolls on its own, as the Model
   workspace's do (T797; design 17, screen 1). */
main:has(.sql-workspace) {
  height: calc(100vh - var(--wc-app-bar-height));
  display: flex;
  flex-direction: column;
  padding: 0;
}
.sql-workspace {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--sql-left, 280px) minmax(0, 1fr) var(--sql-right, 320px);
}
.sql-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--wc-bg-surface);
}
.sql-pane--left { border-right: 1px solid var(--wc-border-subtle); }
.sql-pane--right { border-left: 1px solid var(--wc-border-subtle); }
.sql-pane__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.sql-pane__body:focus { outline: none; }
.sql-pane__head {
  margin: 0;
  padding: 10px 12px 6px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: 600;
  color: var(--wc-text-secondary);
}
.sql-pane__section { padding: 0 12px 10px; }

/* The data source picker (T798; design 17, pins 2 and 3, state B): design
   10's grouped picker, 360 px wide, each row's driver and state at its
   right, and under its button the chosen one's folder and state. */
.cube-picker__pop.sql-picker__pop { width: min(360px, calc(100vw - 32px)); }
.sql-picker .cube-picker__button { width: 100%; }
.sql-picker__state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.sql-picker__state svg[data-icon='ok'] { color: var(--wc-status-success); }
.sql-picker__state svg[data-icon='off'] { color: var(--wc-text-muted); }
.sql-picker__chosen {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 6px 0 0;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-secondary);
}
/* The editor tabs, in the page-tab style, 13 px (direction §7f, §7d). */
/* T800 (design 17, pin 7): each tab its state's icon and name, then its ⋯
   and × as buttons after it; "+" after the list. The strip scrolls (Q8). */
.sql-tabstrip { display: flex; align-items: stretch; height: 36px; flex: none; }
.sql-tabs { display: flex; align-items: stretch; height: 100%; }
.sql-tabs__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 4px 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  font-size: 13px;
  color: var(--wc-text-secondary);
  white-space: nowrap;
}
.sql-tabs > .menu-button { align-items: center; border-bottom: 2px solid transparent; }
.sql-tabs__icon {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--wc-text-secondary);
}
/* A tab's ×, the end of the tab: a rule after it, as design 17 draws. */
.sql-tabs > .sql-tabs__icon { align-self: center; margin-right: 4px; }
.sql-tabs > .sql-tabs__icon + .sql-tabs__tab { border-left: 1px solid var(--wc-border-subtle); }
.sql-tabs__add { align-self: center; margin-left: 6px; }
/* The ⋯ of a tab not open shows on hover or focus only, keeping tabs short. */
.sql-tabs .sql-tabs__icon--quiet:not(:focus-visible):not([aria-expanded='true']) { width: 0; overflow: hidden; }
.sql-tabs__tab:hover + .menu-button .sql-tabs__icon--quiet,
.sql-tabs > .menu-button:hover .sql-tabs__icon--quiet { width: 22px; }
.sql-tabs__tab[aria-selected='true'] {
  border-bottom-color: var(--wc-accent);
  color: var(--wc-text-primary);
  font-weight: var(--wc-text-sm-strong-weight);
}
.sql-tabs__tab[aria-selected='true'] + .menu-button { border-bottom-color: var(--wc-accent); }
.sql-tabs__tab svg[data-icon] { flex: none; }
.sql-rename { display: grid; gap: 12px; min-width: 300px; }
.sql-rename__name { display: grid; gap: 4px; }
/* An empty state: an icon and one sentence, and an action where there is
   one (design 17, state H; rule 104). */
.sql-empty {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  padding: var(--wc-surface-padding);
  color: var(--wc-text-secondary);
}
.sql-empty > svg { flex: none; margin-top: 3px; color: var(--wc-text-muted); }
.sql-empty > p { flex: 1 1 240px; margin: 0; max-width: 60ch; }
.sql-empty > .btn { flex: none; }
/* An off source chosen: its panel in the editor's place (design 17, B2). */
.sql-centre__off { flex: 1; min-height: 0; overflow: auto; padding: var(--wc-surface-padding); }

/* A pane's edge, dragged to resize it (direction §2; no keys, as the
   results drawer's grip has none). */
.sql-pane__grip {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 8px;
  cursor: col-resize;
  touch-action: none;
}
.sql-pane--left > .sql-pane__grip { right: -4px; }
.sql-pane--right > .sql-pane__grip { left: -4px; }
.sql-pane__rail { display: none; }

/* Folded (design 17, state O): a 40 px rail, its width set by the
   workspace, holding the button that opens the pane over the centre. */
.sql-pane[data-folded='true'] > .sql-pane__grip { display: none; }
.sql-pane[data-folded='true'] > .sql-pane__body { display: none; }
.sql-pane[data-folded='true'] > .sql-pane__rail {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}
.sql-pane__rail button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--wc-text-secondary);
}
.sql-pane__rail button:hover { background: var(--wc-bg-subtle); color: var(--wc-text-primary); }
.sql-pane__rail button[aria-expanded='true'] {
  border-color: var(--wc-border-subtle);
  background: var(--wc-bg-subtle);
  color: var(--wc-text-primary);
}
.sql-pane[data-folded='true'][data-open='true'] > .sql-pane__body {
  display: flex;
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 5;
  width: min(var(--sql-over), calc(100vw - 80px));
  border: 1px solid var(--wc-border-subtle);
  background: var(--wc-bg-surface);
  box-shadow: var(--wc-shadow-pop);
}
.sql-pane--left { --sql-over: 280px; }
.sql-pane--right { --sql-over: 320px; }
.sql-pane--left[data-open='true'] > .sql-pane__body { left: 40px; }
.sql-pane--right[data-open='true'] > .sql-pane__body { right: 40px; }

/* The centre: the tabs over the editor over the results, 30 : 70 to start,
   the editor at least 200 px and the results at least 160 (rule 91). */
.sql-centre {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.sql-centre__tabs {
  flex: none;
  display: flex;
  align-items: flex-end;
  min-height: 36px;
  border-bottom: 1px solid var(--wc-border-subtle);
  overflow-x: auto;
}
/* What lies below the tabs, which the split divides (T797's review). */
.sql-centre__split {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sql-centre__editor {
  flex: 0 0 var(--sql-editor, 30%);
  min-height: 200px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: auto;
}
.sql-centre__grip {
  position: relative;
  flex: none;
  height: 8px;
  margin: -4px 0;
  z-index: 2;
  cursor: row-resize;
  touch-action: none;
}
.sql-centre__grip::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 3px;
  border-top: 1px solid var(--wc-border-subtle);
}
.sql-centre__results {
  flex: 1 1 0;
  min-height: 160px;
  min-width: 0;
  overflow: auto;
}
/* A tab's run line, warning, editor and Run over its result (T802; design
   17, pins 8, 9, 11 and 12): the editor takes what the split leaves it. */
.sql-query { gap: 8px; padding: 8px 12px; }
.sql-query .sql-editor { flex: 1 1 auto; min-height: 60px; display: flex; flex-direction: column; }
.sql-query .sql-editor .cm-editor { flex: 1; min-height: 0; max-height: none; }
.sql-query .sql-runner__bar { flex: none; }
.sql-query__results { padding: 8px 12px; }
`;
