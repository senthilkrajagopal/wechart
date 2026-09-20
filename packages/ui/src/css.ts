import { COLORS, TYPE_SCALE } from './tokens';

/**
 * The tokens as CSS custom properties, generated rather than hand-written, so
 * the stylesheet and `tokens.ts` cannot drift — the audit in ./audit/contrast
 * checks the values, and this is what ships them to the browser.
 *
 * Light is the default under `:root`; dark applies under `[data-theme='dark']`.
 * Both are always present, so switching is an attribute change with no
 * stylesheet reload and no re-render (AC-003).
 */
export function themeCss(): string {
  return [
    `:root {\n${declarations('light')}\n${typeDeclarations()}\n}`,
    `:root[data-theme='dark'] {\n${declarations('dark')}\n}`,
  ].join('\n\n');
}

function declarations(theme: 'light' | 'dark'): string {
  return Object.entries(COLORS[theme])
    .map(([token, value]) => `  --wc-${token}: ${value};`)
    .join('\n');
}

function typeDeclarations(): string {
  return Object.entries(TYPE_SCALE)
    .flatMap(([token, type]) => [
      `  --wc-${token}-size: ${String(type.fontSizePx)}px;`,
      `  --wc-${token}-line: ${String(type.lineHeightPx)}px;`,
      `  --wc-${token}-weight: ${String(type.fontWeight)};`,
    ])
    .join('\n');
}
