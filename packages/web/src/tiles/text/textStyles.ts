/**
 * The Text tile's own rules (F45; design 21; direction.md §7h), installed
 * after the shell's. Every value is a §3 or §5 token: the block styles map to
 * the type scale only, and the tile adds no colour, font or size of its own
 * (rule 128).
 *
 * Body text reads as the markdown tile's did — secondary ink, its headings
 * and bold primary — so a converted tile reads the same (AC-512); its line is
 * §7h's 24 px in tiles.
 */
export const TEXT_CSS = `
.text-tile {
  overflow-wrap: anywhere;
  font-size: var(--wc-text-sm-size);
  line-height: 24px;
  color: var(--wc-text-secondary);
}
.text-tile h3,
.text-tile h4,
.text-tile h5,
.text-tile strong,
.text-tile .text-tile__large { color: var(--wc-text-primary); }
.text-tile h3,
.text-tile h4,
.text-tile h5 { margin: 0 0 4px; font-weight: 600; }
.text-tile [data-type='text-xl'],
.text-style-menu [data-type='text-xl'] { font-size: var(--wc-text-xl-size); line-height: var(--wc-text-xl-line); }
.text-tile [data-type='text-lg'],
.text-style-menu [data-type='text-lg'] { font-size: var(--wc-text-lg-size); line-height: var(--wc-text-lg-line); }
.text-tile [data-type='text-md'],
.text-style-menu [data-type='text-md'] { font-size: var(--wc-text-md-size); line-height: var(--wc-text-md-line); }
.text-style-menu [data-type='text-sm'] { font-size: var(--wc-text-sm-size); line-height: var(--wc-text-sm-line); }
.text-tile [data-type='text-kpi'],
.text-style-menu [data-type='text-kpi'] {
  font-size: var(--wc-text-kpi-size);
  line-height: var(--wc-text-kpi-line);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.text-tile p { margin: 0 0 8px; }
.text-tile ul,
.text-tile ol { margin: 0 0 8px; padding-left: 20px; }
.text-tile li > p { margin: 0; }
.text-tile a { color: var(--wc-accent); text-decoration: underline; }
.text-tile > :first-child { margin-top: 0; }
.text-tile > :last-child { margin-bottom: 0; }
/* The tile's element count in edit mode, in its head; past 10, the warning
   state (decision T875-1). */
.text-tile__count {
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-text-muted);
  font-variant-numeric: tabular-nums;
}
.text-tile__count[data-state='warning'] { color: var(--wc-status-warning); font-weight: 600; }
/* An empty tile's placeholder, in edit mode only (design 21 G6). */
.text-tile--empty { margin: 0; color: var(--wc-text-muted); }
/* Double-click's target in edit mode; no box of its own (T876). */
.text-tile-host { display: contents; }
/* While its text is edited, the tile stacks its head, the toolbar and the
   text, the text scrolling in what's left. */
.grid-tile:has(> .text-tile-host > .text-editor) { display: flex; flex-direction: column; }
.text-editor {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}
.text-editor__content { flex: 1 1 0; min-height: 0; overflow: auto; }
/* The toolbar (AC-515; direction §7h): a 40 px strip of 32 px buttons, radius 6;
   the block-style button 128 px wide. */
.text-toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  height: 40px;
  padding: 0 4px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
}
.text-toolbar__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--wc-text-primary);
  font-size: var(--wc-text-sm-size);
}
.text-toolbar__button:hover { background: var(--wc-bg-hover); }
.text-toolbar__button[aria-pressed='true'] { background: var(--wc-bg-accent-soft); color: var(--wc-accent); }
.text-toolbar__block { width: 128px; justify-content: space-between; }
.text-toolbar__block-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.text-toolbar__count { margin-left: auto; padding: 0 4px; white-space: nowrap; }
/* The block-style menu, under its button, each style in its own type. */
.text-style-menu {
  position: absolute;
  top: 40px;
  left: 0;
  z-index: 3;
  min-width: 200px;
  padding: 4px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  box-shadow: var(--wc-shadow-pop);
}
.text-style-menu__item {
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--wc-text-primary);
  cursor: default;
}
.text-style-menu__item[data-type='text-kpi'] { font-variant-numeric: tabular-nums; }
.text-style-menu__item:is(:hover, :focus-visible) { background: var(--wc-bg-hover); }
.text-style-menu__item[aria-checked='true'] { color: var(--wc-accent); }
/* The insert menu, at the cursor (AC-517; direction §7h): 320 px wide, 28 px
   rows, bg-raised, group headings text-xs-strong in text-muted. Fixed, so a
   tile's clipped edge never cuts it. */
.insert-menu {
  position: fixed;
  z-index: 20;
  width: 320px;
  max-height: 336px;
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-raised);
  box-shadow: var(--wc-shadow-pop);
}
.insert-menu__heading {
  padding: 6px 8px 2px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-muted);
}
.insert-menu__row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 8px;
  border-radius: 4px;
  color: var(--wc-text-primary);
  font-size: var(--wc-text-sm-size);
  cursor: default;
}
.insert-menu__row[aria-selected='true'] { background: var(--wc-bg-hover); }
.insert-menu__row[aria-disabled='true'] { color: var(--wc-text-muted); }
.insert-menu__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.insert-menu__hint {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-muted);
}
.insert-menu__foot {
  margin: 4px 0 0;
  padding: 6px 8px 2px;
  border-top: 1px solid var(--wc-border-subtle);
  font-size: var(--wc-text-xs-size);
  color: var(--wc-text-muted);
}
/* Link's address, under the toolbar. */
.text-link-form { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.text-link-form label { font-size: var(--wc-text-xs-size); color: var(--wc-text-secondary); }
.text-link-form input { flex: 1 1 160px; height: 28px; }
.text-link-form__problem { flex-basis: 100%; margin: 0; font-size: var(--wc-text-xs-size); color: var(--wc-status-error); }
/* The text edited in place: a 2 px accent border (AC-302; design 21 pin 1). */
.text-editor__text {
  box-sizing: border-box;
  min-height: 100%;
  padding: 4px 6px;
  border: 2px solid var(--wc-accent);
  border-radius: 4px;
  outline: none;
}
/* An element in the editor, at the text's own size (rule 130). */
.text-element {
  padding: 0 4px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-subtle);
}
/* Under its kind head in edit mode, the text fills the rest, as the markdown
   tile's did. */
.grid-tile > .tile-head--kind ~ .text-tile { flex: 1 1 0; min-height: 0; height: auto; }
`;
