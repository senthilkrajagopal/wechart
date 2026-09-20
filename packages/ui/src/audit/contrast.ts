/**
 * WCAG AA contrast and minimum-type-size auditing (AC-004, AC-005).
 *
 * Pure functions over token values, so the token set can be checked in a unit
 * test rather than only in a browser. T008 runs the equivalent check over
 * rendered nodes, which is what catches a colour that never came from a token.
 *
 * Ratios follow WCAG 2.2 relative luminance:
 * https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 * https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */

/** direction.md rule 1 and §3: "no text smaller than 12 px". */
export const MIN_FONT_SIZE_PX = 12;

/** WCAG 2.2 "large scale" text: 18.66 px bold, or 24 px at any weight. */
const LARGE_TEXT_PX = 24;
const LARGE_TEXT_BOLD_PX = 18.66;
/**
 * 700, not the 600 our type scale calls its heavy weight. WCAG's "large scale"
 * allowance says "bold" without defining a weight; CSS maps the `bold` keyword
 * to 700, and axe-core 4.13.0 — which T008 runs against the rendered page —
 * uses `boldValue: 700`. Taking 600 here would grant `text-lg` (20 px / 600)
 * the 3:1 allowance that axe then refuses, so the two audits would disagree on
 * exactly one token. 700 is the stricter of the two and costs us nothing:
 * `text-lg` clears 4.5:1 on every surface anyway.
 * See docs/research/test-stack.md, "Addendum: the bold threshold".
 */
const BOLD_WEIGHT = 700;

export type Theme = 'light' | 'dark';

export interface TypeToken {
  readonly fontSizePx: number;
  readonly fontWeight: number;
  /** Carried on the token for the stylesheet; it does not affect contrast. */
  readonly lineHeightPx?: number;
}

export type TypeScale = Readonly<Record<string, TypeToken>>;

/**
 * Themes are optional here so a caller can audit one theme in isolation; a pair
 * naming a theme or token the palette does not carry throws rather than being
 * counted as a pass.
 */
export type Palette = Readonly<Partial<Record<Theme, Readonly<Record<string, string>>>>>;

export interface ContrastPair {
  readonly theme: Theme;
  /** Token name of the text colour. */
  readonly foreground: string;
  /** Token name of the colour it sits on. */
  readonly background: string;
  /** Token name in the type scale, which decides the threshold. */
  readonly typeToken: string;
}

export interface FontSizeFinding {
  readonly token: string;
  readonly fontSizePx: number;
  readonly message: string;
}

export interface ContrastFinding {
  readonly theme: Theme;
  readonly foreground: string;
  readonly background: string;
  readonly typeToken: string;
  readonly ratio: number;
  readonly required: number;
  readonly message: string;
}

/**
 * Parse #rgb or #rrggbb into 0-255 channels. Anything else throws: a token the
 * audit cannot read must not be silently scored as passing. That rules out
 * rgba() border tokens, which are never text colours anyway.
 */
function parseHex(color: string): readonly [number, number, number] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) {
    throw new Error(`Cannot parse colour ${JSON.stringify(color)}: expected #rgb or #rrggbb`);
  }

  const hex = match[1] as string;
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;

  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ] as const;
}

/** WCAG relative luminance. */
function relativeLuminance(color: string): number {
  const [r, g, b] = parseHex(color);
  const channel = (value: number): number => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, between 1 and 21. Order of arguments does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The AA threshold this text must clear: 3:1 if it is large scale, else 4.5:1. */
export function requiredRatio({ fontSizePx, fontWeight }: TypeToken): number {
  const isLarge =
    fontSizePx >= LARGE_TEXT_PX || (fontWeight >= BOLD_WEIGHT && fontSizePx >= LARGE_TEXT_BOLD_PX);
  return isLarge ? 3 : 4.5;
}

/** AC-004: every type token is at least 12 px. */
export function auditFontSizes(scale: TypeScale): FontSizeFinding[] {
  return Object.entries(scale)
    .filter(([, token]) => token.fontSizePx < MIN_FONT_SIZE_PX)
    .map(([name, token]) => ({
      token: name,
      fontSizePx: token.fontSizePx,
      message: `${name} is ${token.fontSizePx} px, below the ${MIN_FONT_SIZE_PX} px floor`,
    }));
}

function lookUp(
  palette: Palette,
  theme: Theme,
  token: string,
  role: 'foreground' | 'background',
): string {
  const value = palette[theme]?.[token];
  if (value === undefined) {
    throw new Error(`Palette has no ${role} token ${JSON.stringify(token)} in the ${theme} theme`);
  }
  return value;
}

/** AC-005: every text-on-surface pair meets AA, in both themes. */
export function auditContrastPairs(
  pairs: readonly ContrastPair[],
  palette: Palette,
  scale: TypeScale,
): ContrastFinding[] {
  const findings: ContrastFinding[] = [];

  for (const pair of pairs) {
    const type = scale[pair.typeToken];
    if (type === undefined) {
      throw new Error(`Type scale has no token ${JSON.stringify(pair.typeToken)}`);
    }

    const ratio = contrastRatio(
      lookUp(palette, pair.theme, pair.foreground, 'foreground'),
      lookUp(palette, pair.theme, pair.background, 'background'),
    );
    const required = requiredRatio(type);
    if (ratio >= required) continue;

    findings.push({
      theme: pair.theme,
      foreground: pair.foreground,
      background: pair.background,
      typeToken: pair.typeToken,
      ratio,
      required,
      message:
        `${pair.theme}: ${pair.foreground} on ${pair.background} at ${pair.typeToken} ` +
        `is ${ratio.toFixed(2)}:1, below the required ${required}:1`,
    });
  }

  return findings;
}
