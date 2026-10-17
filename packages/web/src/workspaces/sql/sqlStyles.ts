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
`;
