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
/* Live values as read (T884; direction §7h): in the sentence's own type,
   tabular; a Change in the status its direction gives it (rule 3). */
.text-value,
.text-change { font-variant-numeric: tabular-nums; }
.text-value--waiting,
.text-value--unavailable { color: var(--wc-text-muted); }
.text-change[data-tone='success'] { color: var(--wc-status-success); }
.text-change[data-tone='error'] { color: var(--wc-status-error); }
.text-change[data-tone='neutral'] { color: var(--wc-text-secondary); }
/* A value in view mode (T888, AC-524; rule 132): the sentence's own type
   and weight, no chip; on hover or focus a dotted text-muted underline and
   its tooltip, which is also its description. */
.text-element-read {
  position: relative;
  font: inherit;
  font-variant-numeric: tabular-nums;
  background: none;
  border: 0;
  border-radius: 2px;
}
.text-element-read:hover,
.text-element-read:focus,
.text-element-read[data-open='true'] {
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--wc-text-muted);
  text-underline-offset: 3px;
}
.text-element-tip {
  /* Under the value, placed where it is (ElementTooltip). */
  position: fixed;
  z-index: 30;
  pointer-events: none;
  display: grid;
  gap: 2px;
  width: max-content;
  max-width: 300px;
  padding: 8px 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-raised, var(--wc-bg-surface));
  box-shadow: var(--wc-shadow-pop);
  color: var(--wc-text-primary);
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  font-weight: 400;
  font-style: normal;
  text-align: left;
  text-decoration: none;
  white-space: normal;
}
.text-element-tip[hidden] { display: none; }
.text-element-tip__line:first-child { font-weight: 600; }
/* An Icon: its status icon and its word, in the status's text (rule 3). */
.text-icon { display: inline-flex; align-items: center; gap: 4px; vertical-align: -2px; }
.text-icon[data-tone='success'] { color: var(--wc-status-success); }
.text-icon[data-tone='warning'] { color: var(--wc-status-warning); }
.text-icon[data-tone='error'] { color: var(--wc-status-error); }
.text-icon[data-tone='neutral'] { color: var(--wc-text-secondary); }
.text-sparkline,
.text-bullet { display: inline-block; vertical-align: -2px; }
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
.text-toolbar__button[aria-disabled='true'] { color: var(--wc-text-muted); cursor: default; }
.text-toolbar__button[aria-disabled='true']:hover { background: none; }
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
/* At 10 elements, why nothing can be chosen, and a refused paste's reason
   under the text (AC-518; design 21 state E). */
.insert-menu__note,
.text-editor__refused {
  margin: 0;
  padding: 6px 8px;
  font-size: var(--wc-text-xs-size);
  line-height: var(--wc-text-xs-line);
  color: var(--wc-status-warning);
}
.insert-menu__note { border-bottom: 1px solid var(--wc-border-subtle); }
.text-editor__refused { flex: none; }
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
/* An element in the editor, at the text's own size (rule 130; direction §7h):
   bg-subtle, a 1 px border-subtle, radius 4, padding 0 4; selected, the
   accent border and its 3 px ring. */
.text-element {
  padding: 0 4px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: var(--wc-bg-subtle);
  color: var(--wc-text-primary);
  font-variant-numeric: tabular-nums;
}
.ProseMirror-selectednode > .text-element,
.text-element.ProseMirror-selectednode {
  border-color: var(--wc-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--wc-accent) 35%, transparent);
}
.text-element-view { white-space: nowrap; }
.text-element--control { display: inline-block; padding: 2px; vertical-align: middle; }
/* A control as itself, inert while editing (state L). */
.text-element__pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 999px;
  background: var(--wc-bg-surface);
  font-size: var(--wc-text-xs-size);
}
.text-element__button {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 6px;
  background: var(--wc-bg-surface);
  font-size: var(--wc-text-sm-size);
}
.text-element__button--primary { border-color: var(--wc-accent); background: var(--wc-accent); color: var(--wc-text-on-accent); }
.text-element__button--text { border-color: transparent; background: transparent; color: var(--wc-accent); text-decoration: underline; }
/* Properties' Elements list and the chosen element's settings (pin 13). */
.text-elements { margin-top: 12px; }
.text-elements__head {
  display: flex;
  justify-content: space-between;
  margin: 0 0 4px;
  font-size: var(--wc-text-xs-size);
  font-weight: var(--wc-text-xs-strong-weight);
  color: var(--wc-text-secondary);
}
.text-elements__count { font-weight: normal; color: var(--wc-text-muted); font-variant-numeric: tabular-nums; }
.text-elements__list { margin: 0; padding: 0; list-style: none; }
.text-elements__row {
  display: flex;
  gap: 6px;
  width: 100%;
  min-height: 28px;
  padding: 4px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  text-align: left;
  font-size: var(--wc-text-sm-size);
  color: var(--wc-text-primary);
}
.text-elements__row:hover { background: var(--wc-bg-hover); }
.text-elements__row[aria-current='true'] { background: var(--wc-bg-accent-soft); }
.text-elements__kind { flex: none; font-weight: 600; }
.text-elements__source { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--wc-text-secondary); }
.text-element-settings { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--wc-border-subtle); }
.text-element-settings dl { margin: 0; }
.text-element-settings__line { display: grid; grid-template-columns: 72px 1fr; gap: 8px; font-size: var(--wc-text-sm-size); }
.text-element-settings dt { color: var(--wc-text-secondary); }
.text-element-settings dd { margin: 0; }
/* Under its kind head in edit mode, the text fills the rest, as the markdown
   tile's did. */
.grid-tile > .tile-head--kind ~ .text-tile { flex: 1 1 0; min-height: 0; height: auto; }
`;
