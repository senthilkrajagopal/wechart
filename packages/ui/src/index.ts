/**
 * @wechart/ui — in-house primitives and the design tokens. No third-party
 * component library (requirements.md §5).
 */
export const PACKAGE_NAME = '@wechart/ui';

export { themeCss } from './css';

export {
  AUDIT_TYPE_TOKEN,
  CATEGORICAL,
  COLORS,
  MARKING_SLOT_KEYS,
  TEXT_COLOR_TOKENS,
  TEXT_SURFACE_TOKENS,
  THEMES,
  TYPE_SCALE,
  type ColorTokenName,
  type TypeTokenName,
} from './tokens';

export {
  MIN_FONT_SIZE_PX,
  auditContrastPairs,
  auditFontSizes,
  contrastRatio,
  requiredRatio,
  type ContrastFinding,
  type ContrastPair,
  type FontSizeFinding,
  type Palette,
  type Theme,
  type TypeScale,
  type TypeToken,
} from './audit/contrast';

export {
  deltaEOK,
  deltaEUnderDichromacy,
  hexToSrgb,
  linearize,
  oklabFromHex,
  oklabFromLinear,
  simulateDichromacy,
  type Dichromacy,
  type Lin,
  type Oklab,
  type Rgb,
} from './audit/oklab';
