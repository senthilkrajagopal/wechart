/**
 * sRGB → OKLab, ΔEOK, and dichromacy simulation, for the palette audit
 * (AC-099).
 *
 * **Every constant here is transcribed from `docs/research/palette-validation.md`,
 * not from memory.** They are published values whose last digits matter, and a
 * wrong one produces plausible numbers that are silently false — the worst
 * outcome for an audit whose whole job is to be trustworthy.
 *
 * Decisions the user pinned (2026-09-20), because the criterion named none of
 * them:
 *
 * - **ΔEOK ×100.** W3C CSS Color 4's ΔEOK is plain Euclidean distance in
 *   OKLab, where black→white is 1.0; AC-099's thresholds of 15 and 8 only mean
 *   anything after ×100. The scaling is ours, not a published convention.
 * - **Viénot, Brettel & Mollon 1999, full dichromacy**, whose published
 *   purpose is "checking the legibility of displays by dichromats" — our exact
 *   use — and which is valid for protan and deutan, which is all AC-099 asks
 *   for. It is *not* valid for tritan; a criterion adding tritan must switch to
 *   Brettel 1997, and every number changes.
 */

/** sRGB, gamma-encoded, 0..1. */
export type Rgb = readonly [number, number, number];
/** Linear-light sRGB. Nominally 0..1, but simulation can push it outside. */
export type Lin = readonly [number, number, number];
/** OKLab: L is 0..1, a and b roughly ±0.4. */
export type Oklab = readonly [number, number, number];

/** `#rrggbb` to sRGB. Divided by 255, not 256, so 8-bit round-trips exactly. */
export function hexToSrgb(hex: string): Rgb {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);

  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/**
 * The sRGB electro-optical transfer function, piecewise with exponent 2.4 —
 * not the 2.2 approximation, which shifts dark colours most and is exactly
 * where the light theme's `mk1` (#151107) lives.
 *
 * Sign-symmetric, because dichromacy simulation produces negative components
 * and this function is also used on the way back.
 */
export function linearize([r, g, b]: Rgb): Lin {
  return [transfer(r), transfer(g), transfer(b)];
}

function transfer(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);

  if (magnitude <= 0.04045) return value / 12.92;
  return sign * Math.pow((magnitude + 0.055) / 1.055, 2.4);
}

/**
 * Linear sRGB → OKLab, using the high-precision matrices (CSS Color 4 /
 * culori), not the blog's. The two disagree at about the 8th decimal, and the
 * research could not establish why — so one set is pinned and the fixtures are
 * taken from the same source.
 */
export function oklabFromLinear([r, g, b]: Lin): Oklab {
  const l = 0.412221469470763 * r + 0.5363325372617348 * g + 0.0514459932675022 * b;
  const m = 0.2119034958178252 * r + 0.6806995506452344 * g + 0.1073969535369406 * b;
  const s = 0.0883024591900564 * r + 0.2817188391361215 * g + 0.6299787016738222 * b;

  // Math.cbrt, never Math.pow(x, 1/3): the latter is NaN for negatives, and
  // simulation puts negatives here. The W3C sample code carries this warning.
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.210454268309314 * l_ + 0.7936177747023054 * m_ - 0.0040720430116193 * s_,
    1.9779985324311684 * l_ - 2.4285922420485799 * m_ + 0.450593709617411 * s_,
    0.0259040424655478 * l_ + 0.7827717124575296 * m_ - 0.8086757549230774 * s_,
  ];
}

/** Everything in one step: `#rrggbb` to OKLab. */
export function oklabFromHex(hex: string): Oklab {
  return oklabFromLinear(linearize(hexToSrgb(hex)));
}

/**
 * ΔEOK, scaled ×100.
 *
 * The raw metric is W3C CSS Color 4's: the root sum of squares over OKLab. The
 * ×100 is the scale AC-099's thresholds are expressed on, where black→white is
 * 100 rather than 1.
 */
export function deltaEOK(a: Oklab, b: Oklab): number {
  const dL = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];

  return Math.sqrt(dL * dL + da * da + db * db) * 100;
}

export type Dichromacy = 'protan' | 'deutan';

/**
 * Viénot, Brettel & Mollon 1999, as pre-composed linear-RGB matrices from
 * libDaltonLens.
 *
 * Because the algorithm projects onto a single plane, the whole pipeline
 * reduces to one 3×3 multiply in **linear** RGB. Applying these to
 * gamma-encoded sRGB is the most widely replicated bug in the ecosystem — it
 * silently darkens and desaturates, inflating some distances and deflating
 * others — which is why `simulateDichromacy` takes linear input and the type
 * says so.
 */
const VIENOT: Readonly<Record<Dichromacy, readonly number[]>> = {
  protan: [0.11238, 0.88762, 0.0, 0.11238, 0.88762, -0.0, 0.00401, -0.00401, 1.0],
  deutan: [0.29275, 0.70725, 0.0, 0.29275, 0.70725, -0.0, -0.02234, 0.02234, 1.0],
};

/** How one colour looks to a protanope or deuteranope. Linear RGB in and out. */
export function simulateDichromacy([r, g, b]: Lin, kind: Dichromacy): Lin {
  const m = VIENOT[kind];

  return [
    (m[0] ?? 0) * r + (m[1] ?? 0) * g + (m[2] ?? 0) * b,
    (m[3] ?? 0) * r + (m[4] ?? 0) * g + (m[5] ?? 0) * b,
    (m[6] ?? 0) * r + (m[7] ?? 0) * g + (m[8] ?? 0) * b,
  ];
}

/**
 * ΔEOK ×100 between two hex colours as a dichromat sees them.
 *
 * **Not clamped to gamut.** Simulation pushes components slightly outside 0..1
 * — linear green under protan gives blue −0.00401 — and clamping would model
 * what a screen shows while making the metric discontinuous at the boundary.
 * For a distance used as a pass/fail threshold, continuity is the more
 * defensible property, and `Math.cbrt` handles negatives without complaint.
 * Recorded because the two choices give different numbers for saturated
 * primaries and nothing would signal which was in force.
 */
export function deltaEUnderDichromacy(a: string, b: string, kind: Dichromacy): number {
  const seen = (hex: string) =>
    oklabFromLinear(simulateDichromacy(linearize(hexToSrgb(hex)), kind));

  return deltaEOK(seen(a), seen(b));
}
