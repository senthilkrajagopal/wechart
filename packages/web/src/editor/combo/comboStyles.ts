/**
 * The combo chart editor's own rules (F44, design 20), installed after the
 * shell's: Customize › Series' 28 px rows (rule 17), each with its Mark as
 * four 24 px icon buttons and its Axis as Left | Right, segmented as
 * design 20 draws them (`.seg`), and a split's member rows indented under
 * their measure. Every value is a §3 or §5 token.
 */
export const COMBO_CSS = `
.combo-series { display: grid; gap: 2px; margin-bottom: 8px; }
.combo-series__measure { display: grid; gap: 2px; }
.combo-series__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  font-size: var(--wc-text-xs-size);
}
.combo-series__row--member { padding-left: 20px; }
.combo-series__row input[type='color'] {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--wc-border-subtle);
  border-radius: 4px;
  background: none;
  flex: none;
}
.combo-series__glyph { display: inline-flex; width: 20px; justify-content: center; color: var(--wc-text-secondary); flex: none; }
.combo-series__name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--wc-text-primary); }
.combo-series__seg {
  display: inline-flex;
  flex: none;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  overflow: hidden;
  background: var(--wc-bg-surface);
}
.combo-series__seg > label {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  min-width: 24px;
  padding: 0 6px;
  border-left: 1px solid var(--wc-border-subtle);
  color: var(--wc-text-secondary);
  cursor: pointer;
}
.combo-series__seg--icons > label { width: 24px; padding: 0; }
.combo-series__seg > label:first-child { border-left: 0; }
.combo-series__seg input[type='radio'] {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}
.combo-series__seg > label:has(input:checked) {
  background: var(--wc-bg-accent-soft);
  color: var(--wc-accent);
  font-weight: var(--wc-text-xs-strong-weight);
}
.combo-series__seg > label:has(input:disabled) { color: var(--wc-border-strong); cursor: not-allowed; }
.combo-series__seg > label:has(input:focus-visible) { outline: 2px solid var(--wc-accent); outline-offset: -2px; }
.combo-series__auto { width: 20px; height: 20px; flex: none; }
.combo-series__same { margin: 0 0 4px 20px; font-size: var(--wc-text-xs-size); color: var(--wc-text-muted); }
/* A combo's Metrics pill (T856, design 20 screen 2): its mark's glyph first,
   a 20 px button in the pill's ink opening its menu, and its axis tag, L or
   R, boxed in the pill's ink, before ×. */
.pill__mark {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: none;
  color: inherit;
  cursor: pointer;
}
.pill__mark:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
.pill__mark:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 0; }
.pill__axis {
  font-weight: 600;
  border: 1px solid currentColor;
  border-radius: 3px;
  padding: 0 3px;
  line-height: 14px;
}
.pill .menu-button__item > svg { flex: none; color: var(--wc-text-secondary); }
.legend-glyph-layer { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.legend-glyph { position: absolute; display: grid; place-items: center; pointer-events: auto; }
.legend-glyph .menu-button { display: grid; width: 100%; height: 100%; }
.legend-glyph__button { width: 20px; height: 20px; color: var(--wc-text-primary); }
.legend-glyph__button:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
`;
