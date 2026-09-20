/**
 * @wechart/ui — in-house primitives and the design tokens. No third-party
 * component library (requirements.md §5).
 */
export const PACKAGE_NAME = '@wechart/ui';

export { themeCss } from './css';

export {
  AUDIT_TYPE_TOKEN,
  COLORS,
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
