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
.text-tile [data-type='text-xl'] { font-size: var(--wc-text-xl-size); line-height: var(--wc-text-xl-line); }
.text-tile [data-type='text-lg'] { font-size: var(--wc-text-lg-size); line-height: var(--wc-text-lg-line); }
.text-tile [data-type='text-md'] { font-size: var(--wc-text-md-size); line-height: var(--wc-text-md-line); }
.text-tile [data-type='text-kpi'] {
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
/* Under its kind head in edit mode, the text fills the rest, as the markdown
   tile's did. */
.grid-tile > .tile-head--kind ~ .text-tile { flex: 1 1 0; min-height: 0; height: auto; }
`;
