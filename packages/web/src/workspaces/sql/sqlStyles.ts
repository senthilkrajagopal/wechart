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
/* The statement at the cursor, which Run runs with nothing selected (T803; pin 11). */
.sql-query .cm-sql-statement { background: var(--wc-bg-subtle); box-shadow: inset 0 -1px var(--wc-border-strong, var(--wc-border-subtle)); }
/* Find a table (T806; pin 4): the field's look, 28 px high, 12 px text. */
.sql-schema__find {
  box-sizing: border-box; width: 100%; height: 28px; margin: 0; padding: 0 8px;
  border: 1px solid var(--wc-border-strong, var(--wc-border-subtle)); border-radius: 6px;
  background: var(--wc-bg-surface); color: var(--wc-text-primary); font: inherit; font-size: 12px;
}
.sql-schema__find:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 1px; }
/* A table's ⋯ (T807; pin 6): shown on its row's hover or focus, or while its menu is open. */
.sql-schema__actions { flex: none; margin-left: auto; display: inline-flex; }
.sql-schema__menu {
  display: inline-grid; place-items: center; width: 22px; height: 22px; min-height: 0; padding: 0;
  border: 0; border-radius: 4px; background: none; color: var(--wc-text-secondary);
}
.sql-schema__menu:hover { background: var(--wc-bg-hover); }
[role='treeitem']:not(:focus-visible) > .sql-schema__row:not(:hover) .sql-schema__menu:not(:focus-visible):not([aria-expanded='true']) { opacity: 0; }
.sql-schema__foot { margin-top: 8px; }
/* PK and FK, text tags in a 3 px outline: never colour alone (pin 5). */
.sql-schema__tag {
  flex: none; display: inline-flex; align-items: center; height: 16px; margin-left: 4px; padding: 0 4px;
  border: 1px solid var(--wc-border-subtle); border-radius: 3px;
  font-size: 12px; line-height: 14px; color: var(--wc-text-secondary); background: var(--wc-bg-surface);
}
/* The parameters strip under the editor (T809; pin 13, state F): each name,
   its type and its value in a row that wraps. */
.sql-params { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; font-size: 12px; }
.sql-params__label { font-weight: 600; color: var(--wc-text-secondary); }
.sql-params__none { color: var(--wc-text-secondary); }
.sql-params__field { display: inline-flex; align-items: center; gap: 4px; }
.sql-params__name { font-family: var(--wc-font-code); }
.sql-params__input {
  box-sizing: border-box; height: 24px; margin: 0; padding: 0 6px;
  border: 1px solid var(--wc-border-strong, var(--wc-border-subtle)); border-radius: 6px;
  background: var(--wc-bg-surface); color: var(--wc-text-primary); font: inherit; font-size: 12px;
}
.sql-params__value { width: 128px; }
.sql-params__input[aria-invalid='true'] { border-color: var(--wc-status-error); }
.sql-params__input:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 1px; }
.sql-params__held { display: inline-flex; align-items: center; gap: 4px; }
/* The editor's head: Save…, or a saved query's Save and Save as new… (T812; pin 10). */
.sql-query__head { flex: none; display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; font-size: 12px; }
.sql-query__saved { color: var(--wc-text-secondary); margin-right: auto; }
/* Save… (T812; I2): a name, a description and what it keeps. */
.sql-save form { display: flex; flex-direction: column; gap: 4px; }
.sql-save__field { font-weight: 600; margin-top: 8px; }
.sql-save__input {
  box-sizing: border-box; width: 100%; padding: 4px 8px; margin: 0;
  border: 1px solid var(--wc-border-strong, var(--wc-border-subtle)); border-radius: 6px;
  background: var(--wc-bg-surface); color: var(--wc-text-primary); font: inherit;
}
.sql-save__input[aria-invalid='true'] { border-color: var(--wc-status-error); }
.sql-save__refused { margin: 0; color: var(--wc-status-error); font-size: 12px; }
.sql-save__count, .sql-save__keeps { margin: 0; font-size: 12px; color: var(--wc-text-secondary); }
.sql-save__count { text-align: right; }
/* The Saved tab (T813; I1): rows of a name over its source and "Only me",
   design 15's two-line rows, the ⋯ after each. */
.sql-saved { padding: 0 12px 10px; display: flex; flex-direction: column; gap: 6px; }
.sql-saved__note { margin: 0; font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); color: var(--wc-text-secondary); }
.sql-saved__failed { color: var(--wc-status-error); }
.sql-saved__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sql-saved__row { display: flex; align-items: flex-start; gap: 4px; padding: 6px 0; border-bottom: 1px solid var(--wc-border-subtle); }
.sql-saved__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sql-saved__name {
  align-self: flex-start; max-width: 100%; margin: 0; padding: 0; border: 0; background: none;
  color: var(--wc-text-primary); font: inherit; font-size: var(--wc-text-sm-size); font-weight: 600;
  text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sql-saved__name:hover { text-decoration: underline; }
.sql-saved__name:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 1px; }
.sql-saved__source, .sql-saved__meta {
  font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); color: var(--wc-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sql-saved__only { display: inline-flex; align-items: center; gap: 4px; }
.sql-saved__more { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--wc-text-secondary); cursor: pointer; }
.sql-saved__more:hover { background: var(--wc-bg-hover); }
.sql-saved__more:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 1px; }
/* Saved or History, one at a time (T817; design 17, pin 17). */
.sql-pane__switch { align-self: flex-start; margin: 0 12px 8px; }
/* History (T817; design 17, pins 17 and 18): All or This data source, then
   rows of the state, rows and time over the SQL, its values and its source. */
.sql-history { padding: 0 12px 10px; display: flex; flex-direction: column; gap: 6px; }
.sql-history__scope { align-self: flex-start; }
.sql-history .seg label {
  display: inline-flex; align-items: center; height: 24px; padding: 0 8px; font-size: 12px; cursor: pointer;
  border-left: 1px solid var(--wc-border-subtle); background: var(--wc-bg-surface);
}
.sql-history .seg label:first-child { border-left: 0; }
.sql-history .seg label.is-on { background: var(--wc-bg-accent-soft); color: var(--wc-accent); font-weight: 600; }
.sql-history .seg label:has(input:disabled) { color: var(--wc-text-muted); cursor: default; }
.sql-history .seg input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.sql-history .seg label:focus-within { outline: 2px solid var(--wc-accent); outline-offset: -2px; }
.sql-history__note { margin: 0; font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); color: var(--wc-text-secondary); }
.sql-history__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.sql-history__row { display: grid; gap: 3px; padding: 7px 0; border-bottom: 1px solid var(--wc-border-subtle); min-width: 0; }
.sql-history__top { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; min-width: 0; }
.sql-history__rows, .sql-history__when { color: var(--wc-text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sql-history__when { margin-left: auto; }
.sql-history__sql {
  font: 400 12px/16px var(--wc-font-code); overflow: hidden; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}
.sql-history__values, .sql-history__source {
  font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line); color: var(--wc-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
`;
