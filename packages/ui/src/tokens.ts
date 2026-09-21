/**
 * The design tokens from docs/design/direction.md §3 (type scale) and §5
 * (colour). This module is the single source of truth: the audit in
 * ./audit/contrast.ts checks these values, and the stylesheet emits them, so a
 * colour that never came from here cannot claim to have been audited.
 */

import type { ContrastPair, Palette, Theme, TypeScale } from './audit/contrast';

/** direction.md §3. Weights are only ever 400 or 600. */
export const TYPE_SCALE = {
  'text-xs': { fontSizePx: 12, lineHeightPx: 16, fontWeight: 400 },
  'text-xs-strong': { fontSizePx: 12, lineHeightPx: 16, fontWeight: 600 },
  'text-sm': { fontSizePx: 14, lineHeightPx: 20, fontWeight: 400 },
  'text-sm-strong': { fontSizePx: 14, lineHeightPx: 20, fontWeight: 600 },
  'text-md': { fontSizePx: 16, lineHeightPx: 22, fontWeight: 600 },
  'text-lg': { fontSizePx: 20, lineHeightPx: 26, fontWeight: 600 },
  'text-xl': { fontSizePx: 24, lineHeightPx: 32, fontWeight: 600 },
  'text-kpi': { fontSizePx: 32, lineHeightPx: 40, fontWeight: 600 },
  'text-kpi-solo': { fontSizePx: 40, lineHeightPx: 52, fontWeight: 600 },
} as const satisfies TypeScale;

export type TypeTokenName = keyof typeof TYPE_SCALE;

/** direction.md §5. Border tokens are not text and are never contrast-audited. */
export const COLORS = {
  light: {
    'bg-page': '#f4f4f2',
    'bg-surface': '#ffffff',
    'bg-raised': '#ffffff',
    'bg-subtle': '#f0efec',
    'border-subtle': '#e3e2de',
    'border-strong': '#c9c7c1',
    'text-primary': '#1f1f1e',
    'text-secondary': '#5c5b57',
    'text-muted': '#6e6c67',
    accent: '#1f6f86',
    crossfilter: '#7a3fb0',
    mk1: '#151107',
    mk2: '#2d025e',
    mk3: '#5b3106',
    mk4: '#225c60',
    'role-dimension': '#2d6ab4',
    'role-measure': '#a85400',
    'text-on-accent': '#ffffff',
    'status-success': '#1d7a3f',
    'status-warning': '#8a5a00',
    'status-error': '#c2362f',
    'status-success-icon': '#0ca30c',
    'status-warning-icon': '#fab219',
    'status-error-icon': '#d03b3b',
  },
  dark: {
    'bg-page': '#121211',
    'bg-surface': '#1c1c1b',
    'bg-raised': '#252523',
    'bg-subtle': '#2a2a28',
    'border-subtle': 'rgba(255,255,255,.10)',
    'border-strong': 'rgba(255,255,255,.20)',
    'text-primary': '#f2f2f0',
    'text-secondary': '#b4b3ab',
    'text-muted': '#97958e',
    accent: '#4fb3d1',
    crossfilter: '#b58be0',
    mk1: '#f2f2f2',
    mk2: '#b6bcd8',
    mk3: '#fab72a',
    mk4: '#81fbbe',
    'role-dimension': '#7fb0ea',
    'role-measure': '#f0a35c',
    'text-on-accent': '#1f1f1e',
    'status-success': '#17aa17',
    'status-warning': '#fab219',
    'status-error': '#eb7070',
    'status-success-icon': '#0ca30c',
    'status-warning-icon': '#fab219',
    'status-error-icon': '#e66767',
  },
} as const satisfies Palette;

/**
 * The categorical series ramp, eight slots in fixed order, both themes
 * (direction.md §5, "Categorical, 8 slots, in fixed order (light / dark)").
 *
 * Here rather than in `@wechart/charts` because AC-099 audits it against the
 * marking tokens above, in both themes, and those live here — a second copy
 * of eight hex values is eight chances to disagree. `DEFAULT_PALETTE` in
 * charts is the light ramp, and re-exports this.
 *
 * Eight and no more: past eight the recommender facets or folds the tail into
 * "Other" rather than inventing a ninth hue, because this is the number of
 * slots that have been validated pairwise.
 */
export const CATEGORICAL = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
} as const;

/** The four marking slots, in order, per theme (direction.md §5). */
export const MARKING_SLOT_KEYS = ['mk1', 'mk2', 'mk3', 'mk4'] as const;

export type ColorTokenName = keyof (typeof COLORS)['light'];

/** Every token that carries text, and so must meet AA on the surfaces below. */
export const TEXT_COLOR_TOKENS = [
  'text-primary',
  'text-secondary',
  'text-muted',
  'accent',
  'crossfilter',
  'role-dimension',
  'role-measure',
  'status-success',
  'status-warning',
  'status-error',
] as const satisfies readonly ColorTokenName[];

/**
 * Surfaces text is placed on. `bg-raised` is a menu or popover; `bg-subtle` is
 * a hover state or a well. Text must stay legible on all of them, which is a
 * stricter bar than direction.md's published ratios, all of which were computed
 * against white.
 */
export const TEXT_SURFACE_TOKENS = [
  'bg-page',
  'bg-surface',
  'bg-raised',
  'bg-subtle',
] as const satisfies readonly ColorTokenName[];

export const THEMES = ['light', 'dark'] as const satisfies readonly Theme[];

/**
 * The smallest type a colour token is used at decides its threshold. Every text
 * colour has to survive body text, so the audit uses `text-sm`; a token used
 * only in a KPI would get the large-text allowance, and none is today.
 */
export const AUDIT_TYPE_TOKEN: TypeTokenName = 'text-sm';

/**
 * Text that sits on a filled control rather than on a surface — the primary
 * button and anything else painted `accent`. This pair needs stating because
 * the obvious choice is wrong in one theme: white on dark `accent` (`#4fb3d1`)
 * is 2.41:1, an AA failure, while `text-on-accent` `#1f1f1e` is 6.84:1.
 * `crossfilter` chips and the `mk1`–`mk4` marking chips have the same shape and
 * are added when those surfaces land (T105, T125).
 */
export const FILLED_SURFACE_PAIRS = [
  { foreground: 'text-on-accent', background: 'accent' },
] as const satisfies readonly {
  foreground: ColorTokenName;
  background: ColorTokenName;
}[];

/**
 * Every contrast pair the token set promises, in both themes: each text colour
 * on each surface, plus the filled-control pairs above. `tokens.test.ts` audits
 * exactly this list, and asserts its own size, so dropping a token from
 * TEXT_COLOR_TOKENS to make the suite green fails instead.
 */
export function contrastPairs(): ContrastPair[] {
  return THEMES.flatMap((theme) => [
    ...TEXT_COLOR_TOKENS.flatMap((foreground) =>
      TEXT_SURFACE_TOKENS.map((background) => ({
        theme,
        foreground,
        background,
        typeToken: AUDIT_TYPE_TOKEN,
      })),
    ),
    ...FILLED_SURFACE_PAIRS.map(({ foreground, background }) => ({
      theme,
      foreground,
      background,
      typeToken: AUDIT_TYPE_TOKEN,
    })),
  ]);
}

export const EXPECTED_PAIR_COUNT =
  THEMES.length *
  (TEXT_COLOR_TOKENS.length * TEXT_SURFACE_TOKENS.length + FILLED_SURFACE_PAIRS.length);
