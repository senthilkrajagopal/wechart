---
library: Colour-science algorithms for palette validation (OKLab, ΔEOK, dichromacy simulation)
packages: []
version: oklab-matrices-2021-01-25; deltaEOK-css-color-4; vienot-brettel-mollon-1999; brettel-vienot-mollon-1997; machado-oliveira-fernandes-2009
researched: 2026-09-20
sources: [https://bottosson.github.io/posts/oklab/, https://bottosson.github.io/posts/colorwrong/, https://bottosson.github.io/posts/colorpicker/, https://github.com/w3c/csswg-drafts/blob/main/css-color-4/conversions.js, https://github.com/w3c/csswg-drafts/blob/main/css-color-4/deltaEOK.js, https://github.com/w3c/csswg-drafts/blob/main/css-color-4/deltaEOK2.js, https://github.com/w3c/csswg-drafts/blob/main/css-color-4/deltaEOKr2.js, https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.c, https://daltonlens.org/understanding-cvd-simulation/, https://github.com/DaltonLens/DaltonLens-Python/blob/master/daltonlens/simulate.py, https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html, https://colorspace.r-forge.r-project.org/reference/simulate_cvd.html, https://github.com/Evercoder/culori/blob/main/test/oklab.test.js]
---

# Colour-science algorithms for the palette validator (OKLab / ΔEOK / protan-deutan simulation)

## Summary

This doc covers the maths behind `validate_palette`-style checking in wechart, for **AC-099** ("keep every marking colour at least ΔE 15 from every categorical series colour under normal vision, and at least ΔE 8 under protan and deutan simulation, in both themes", `docs/spec.md:290`, restating `docs/design/direction.md:498` rule 51) and the failing test named in `docs/tasks.md:1011` (`markingPalette.test.ts`).

**Verdict: implement in-house, no new dependency.** Every constant needed is published under public domain or MIT, the pipeline is pure arithmetic over `Math.cbrt` and 3×3 matrices, and the one npm package that covers both halves (culori) applies its CVD matrices in the wrong colour space for this purpose (see *Alternatives*).

**Three findings you must resolve before the test can be written** — I am flagging them because the AC as written is not yet executable:

1. **AC-099 names no unit, no colour space and no simulation algorithm.** I grepped the whole repo: `ΔE` appears in `docs/spec.md:290`, `docs/tasks.md:882,1004,1011`, `docs/design/direction.md:197,198,199,215,216,498`, `docs/design/prototype/index.html:255`, `packages/web/src/shell/styles.ts:473`, `packages/web/src/dashboard/markings/MarkBadge.tsx:9` and `MarkBadge.test.tsx:16`. **No occurrence defines the metric.** The string "OKLab" (any case) appears **nowhere** in the repo.
2. **`validate_palette.js` is not in the repo.** `docs/design/direction.md:196,203` cite `validate_palette.js` / `dataviz/scripts/validate_palette.js`; a glob for `**/validate_palette*` finds nothing, and `docs/inputs/` contains no file mentioning it. So the published figures (19.6, 9.1, 8.4, 6.8, 9.0) come from a tool we do not have and **cannot be reproduced**. Any implementation we write will be a *new* measurement, not a re-run.
3. **The thresholds 15 and 8 have no published basis.** I found no published just-noticeable-difference or "distinguishable" threshold for any OKLab-based ΔE (details in §*ΔE in OKLab*). They are product decisions, in exactly the sense `docs/design/direction.md:217` already uses for the channel-capacity numbers. The doc should say so rather than imply a standard.

The scale is almost certainly **OKLab ×100**: ΔEOK as defined by the W3C is Euclidean distance with L in 0..1, and black→white is exactly **1.0** in raw units, so a threshold of "15" is only meaningful after ×100. That is consistent with the note you remember, but the ×100 convention is ours, not a published ΔE scaling (§*ΔE in OKLab*).

---

## Install

```
(no new dependency)
```

Nothing to install. The implementation needs `Math.cbrt` (ES2015, present in Node 26 and every Vite target) and no DOM, WebGL or canvas API. It is pure TypeScript, so the same module runs in Vitest under Node and in the browser bundle.

If the user later decides to take a dependency anyway, the only serious candidate is **culori 4.0.2** (MIT, `"type": "module"`, zero runtime dependencies, `engines: ^12.20.0 || ^14.13.1 || >=16.0.0`) — [registry.npmjs.org/culori/latest](https://registry.npmjs.org/culori/latest). See *Alternatives considered* for why it does not cover the CVD half correctly.

---

## Init / auth pattern

Not applicable (pure functions). Suggested shape for a `packages/web/src/theme/palette/` module, all functions total and side-effect free:

```ts
type Rgb = readonly [number, number, number];      // sRGB, gamma-encoded, 0..1
type Lin = readonly [number, number, number];      // linear-light sRGB, 0..1 nominal
type Oklab = readonly [number, number, number];    // L 0..1, a/b ≈ ±0.4

hexToSrgb(hex: string): Rgb
linearize(c: Rgb): Lin                 // sRGB EOTF⁻¹
oklabFromLinear(c: Lin): Oklab
deltaEOK(a: Oklab, b: Oklab): number   // raw, ~0..1
simulateDichromacy(c: Lin, kind: 'protan' | 'deutan'): Lin
```

The validator itself then reads tokens from the theme and runs the all-pairs loop. Note that the constants below are float-exact as published; store them as `const` tuples, not as strings parsed at runtime.

---

## API surface we will use

### 1. sRGB transfer function (linearisation)

**The standard piecewise function with exponent 2.4 is used — not the 2.2 approximation.** Ottosson's own "linear sRGB" definition, which the Oklab post links to for this step ([bottosson.github.io/posts/oklab](https://bottosson.github.io/posts/oklab/) says "To compute linear sRGB values, see my previous post"):

```
// https://bottosson.github.io/posts/colorwrong/
f_inv(x) = x >= 0.04045 ? ((x + 0.055) / 1.055) ^ 2.4 : x / 12.92     // encoded -> linear
f(x)     = x >= 0.0031308 ? 1.055 * x ^ (1/2.4) - 0.055 : 12.92 * x    // linear -> encoded
```
Source: [Ottosson, "How software gets color wrong"](https://bottosson.github.io/posts/colorwrong/).

The W3C sample code is the same function with an odd-symmetric extension for negative values, which matters because CVD simulation produces negatives:

```js
// https://github.com/w3c/csswg-drafts/blob/main/css-color-4/conversions.js
function lin_sRGB(RGB) {
  return RGB.map(function (val) {
    let sign = val < 0 ? -1 : 1;
    let abs = Math.abs(val);
    if (abs <= 0.04045) { return val / 12.92; }
    return sign * (Math.pow((abs + 0.055) / 1.055, 2.4));
  });
}
function gam_sRGB(RGB) {
  return RGB.map(function (val) {
    let sign = val < 0 ? -1 : 1;
    let abs = Math.abs(val);
    if (abs > 0.0031308) { return sign * (1.055 * Math.pow(abs, 1/2.4) - 0.055); }
    return 12.92 * val;
  });
}
```
Source: [csswg-drafts/css-color-4/conversions.js](https://github.com/w3c/csswg-drafts/blob/main/css-color-4/conversions.js). culori uses the identical constants and the same sign handling ([culori/src/lrgb/convertRgbToLrgb.js](https://github.com/Evercoder/culori/blob/main/src/lrgb/convertRgbToLrgb.js): `if (abs <= 0.04045) { return c / 12.92; } return (Math.sign(c) || 1) * Math.pow((abs + 0.055) / 1.055, 2.4);`).

Note the boundary asymmetry (`<= 0.04045` encoded-side, `> 0.0031308` linear-side) is in the published code as shown; it is not a typo.

### 2. linear sRGB → OKLab

Ottosson's reference implementation, linear sRGB straight to LMS, then cube root, then LMS′ to Lab:

```cpp
// https://bottosson.github.io/posts/oklab/  (public domain / MIT)
Lab linear_srgb_to_oklab(RGB c) {
    float l = 0.4122214708f*c.r + 0.5363325363f*c.g + 0.0514459929f*c.b;
    float m = 0.2119034982f*c.r + 0.6806995451f*c.g + 0.1073969566f*c.b;
    float s = 0.0883024619f*c.r + 0.2817188376f*c.g + 0.6299787005f*c.b;
    float l_ = cbrtf(l), m_ = cbrtf(m), s_ = cbrtf(s);
    return {
        0.2104542553f*l_ + 0.7936177850f*m_ - 0.0040720468f*s_,
        1.9779984951f*l_ - 2.4285922050f*m_ + 0.4505937099f*s_,
        0.0259040371f*l_ + 0.7827717662f*m_ - 0.8086757660f*s_,
    };
}
RGB oklab_to_linear_srgb(Lab c) {
    float l_ = c.L + 0.3963377774f*c.a + 0.2158037573f*c.b;
    float m_ = c.L - 0.1055613458f*c.a - 0.0638541728f*c.b;
    float s_ = c.L - 0.0894841775f*c.a - 1.2914855480f*c.b;
    float l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
    return {
        +4.0767416621f*l - 3.3077115913f*m + 0.2309699292f*s,
        -1.2684380046f*l + 2.6097574011f*m - 0.3413193965f*s,
        -0.0041960863f*l - 0.7034186147f*m + 1.7076147010f*s,
    };
}
```
Source: [Ottosson, "A perceptual color space for image processing"](https://bottosson.github.io/posts/oklab/). The same post records "The matrices were updated 2021-01-25. The new matrices have been derived using a higher precision sRGB matrix and with exactly matching D65 values" — i.e. anything copied from a pre-2021 source is a different space.

**Higher-precision variant (recommended).** CSS Color 4 routes via XYZ D65 with more digits:

```js
// https://github.com/w3c/csswg-drafts/blob/main/css-color-4/conversions.js
XYZtoLMS = [
  [ 0.8190224379967030, 0.3619062600528904, -0.1288737815209879 ],
  [ 0.0329836539323885, 0.9292868615863434,  0.0361446663506424 ],
  [ 0.0481771893596242, 0.2642395317527308,  0.6335478284694309 ]];
LMStoOKLab = [
  [ 0.2104542683093140,  0.7936177747023054, -0.0040720430116193 ],
  [ 1.9779985324311684, -2.4285922420485799,  0.4505937096174110 ],
  [ 0.0259040424655478,  0.7827717124575296, -0.8086757549230774 ]];
// "JavaScript Math.cbrt returns a sign-matched cube root — beware if porting to other
//  languages, especially if tempted to use a general power function"
// "L in range [0,1]. For use in CSS, multiply by 100 and add a percent"
// inverse:
OKLabtoLMS = [[1,  0.3963377773761749,  0.2158037573099136],
              [1, -0.1055613458156586, -0.0638541728258133],
              [1, -0.0894841775298119, -1.2914855480194092]];
LMStoXYZ   = [[ 1.2268798758459243, -0.5578149944602171,  0.2813910456659647],
              [-0.0405757452148008,  1.1122868032803170, -0.0717110580655164],
              [-0.0763729366746601, -0.4214933324022432,  1.5869240198367816]];
```

culori collapses the same high-precision chain into one linear-sRGB→LMS matrix, which is what I recommend hard-coding (one matrix multiply, and it matches the fixtures in §*Verification fixtures*):

```
linear sRGB -> LMS  (culori 4.0.2, src/oklab/convertLrgbToOklab.js — no XYZ hop, uses Math.cbrt)
  0.412221469470763   0.5363325372617348  0.0514459932675022
  0.2119034958178252  0.6806995506452344  0.1073969535369406
  0.0883024591900564  0.2817188391361215  0.6299787016738222
LMS' -> OKLab  (identical to the CSS LMStoOKLab matrix above)
```
Source: [culori/src/oklab/convertLrgbToOklab.js](https://github.com/Evercoder/culori/blob/main/src/oklab/convertLrgbToOklab.js).

The blog matrix and the high-precision matrix disagree at about the 8th decimal (e.g. `0.2104542553` vs `0.2104542683`). **UNVERIFIED** why the two differ. Pick one, and pin fixtures to that one.

Ranges: L is 0..1 with D65 (normalised Y=1) mapping to L=1, a=0, b=0 ([Ottosson](https://bottosson.github.io/posts/oklab/)); a and b are conventionally ±0.4 ([MDN `oklab()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklab)).

### 3. ΔE in OKLab

**Yes, plain Euclidean distance.** The W3C's named metric is **ΔEOK**:

```js
// https://github.com/w3c/csswg-drafts/blob/main/css-color-4/deltaEOK.js
function deltaEOK (reference, sample) {
	let [L1, a1, b1] = reference;
	let [L2, a2, b2] = sample;
	let ΔL = L1 - L2, Δa = a1 - a2, Δb = b1 - b2;
	return Math.sqrt(ΔL ** 2 + Δa ** 2 + Δb ** 2);
}
```
Source: [csswg-drafts/css-color-4/deltaEOK.js](https://github.com/w3c/csswg-drafts/blob/main/css-color-4/deltaEOK.js). Color.js ships the same formula — [color-js/color.js src/deltaE/deltaEOK.js](https://github.com/color-js/color.js/blob/main/src/deltaE/deltaEOK.js).

**There are two further named variants in the same spec**, and they give different numbers, so "ΔE" alone is ambiguous:

- **ΔEOK2** — "root sum of squares, scale a and b by 2": `Δa = 2*(a1-a2); Δb = 2*(b1-b2)`. [deltaEOK2.js](https://github.com/w3c/csswg-drafts/blob/main/css-color-4/deltaEOK2.js)
- **ΔEOKr2** — same ×2 on a and b, plus Ottosson's lightness *toe* applied to L first, with `K1 = 0.206`, `K2 = 0.03`, `K3 = (1 + K1)/(1 + K2)` and `toe(x) = 0.5 * (K3*x - K1 + Math.sqrt((K3*x - K1)*(K3*x - K1) + 4*K2*K3*x))`. [deltaEOKr2.js](https://github.com/w3c/csswg-drafts/blob/main/css-color-4/deltaEOKr2.js); the toe/Lr function is from [Ottosson's colour-picker post](https://bottosson.github.io/posts/colorpicker/).

**Scaling (the "×100" question).** There is **no published ×100 convention for ΔEOK**. What exists is a lightness convention: the W3C conversion code comments "L in range [0,1]. For use in CSS, multiply by 100 and add a percent". Multiplying the *distance* by 100 is a presentation choice that follows from it. It is necessary for AC-099 to mean anything: black↔white is ΔEOK ≈ 1.0 raw ([culori oklab tests](https://github.com/Evercoder/culori/blob/main/test/oklab.test.js)), so a raw threshold of "15" would be unreachable. On the ×100 scale, black↔white ≈ 100.

**Thresholds: no published basis.** No published JND or "distinguishable" threshold for ΔEOK, ΔEOK2 or ΔEOKr2 was found. Checked: Ottosson's Oklab post (no threshold); the CSS Color 4 sample code (formulae only); Color.js's colour-difference documentation, which [does not mention deltaEOK at all](https://colorjs.io/docs/color-difference). **UNVERIFIED: whether CSS Color 4 §20's prose attaches any threshold** — four fetches truncated before section 20.

The nearest published number is for a *different* space: "ΔE*ab ≈ 2.3 corresponds to a JND", citing Sharma, *Digital Color Imaging Handbook* (2003) — [Wikipedia, Color difference](https://en.wikipedia.org/wiki/Color_difference). **It does not transfer**: CIELAB L* runs 0..100 where OKLab L runs 0..1.

Conclusion: **ΔE 15 and ΔE 8 in AC-099 / rule 51 are product decisions**, and so is the "6–8 floor band" at `docs/design/direction.md:198` (**UNVERIFIED**, no source found).

### 4. Protan / deuteranopia simulation

Three algorithms, all LMS-based, all operating on **linear RGB**:

| | Space / LMS model | Simulates | Notes |
|---|---|---|---|
| **Brettel, Viénot & Mollon 1997** | LMS via Smith & Pokorny 1975 (Judd-Vos XYZ); two half-planes | dichromacy only | "the most solid reference in the literature" — [DaltonLens-Python](https://github.com/DaltonLens/DaltonLens-Python/blob/master/daltonlens/simulate.py) |
| **Viénot, Brettel & Mollon 1999** | same LMS model, single projection plane ⇒ one 3×3 matrix in linear RGB | dichromacy only (protan/deutan; **not valid for tritan**) | purpose-built for our task — "Digital video colourmaps for checking the legibility of displays by dichromats" ([libDaltonLens.h](https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.h)) |
| **Machado, Oliveira & Fernandes 2009** | LMS (Smith & Pokorny) + opponent-colour second stage | dichromacy **and** anomalous trichromacy, severity 0.0–1.0 | [project page](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html) |

**Which LMS transform.** libDaltonLens states: *"These values use the sRGB standard to go from linearRGB to CIE XYZ, and the Smith & Pokorny 1975 model for CIE XYZ to LMS"* and *"These were computed using RGB white as the neutral element, not the equal-energy E"* ([libDaltonLens.c](https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.c)). DaltonLens recommends Smith & Pokorny over Hunt-Pointer-Estevez ([Understanding CVD simulation](https://daltonlens.org/understanding-cvd-simulation/)). Smith & Pokorny is defined **on Judd-Vos-corrected XYZ, not CIE XYZ 1931**:

```python
# https://github.com/DaltonLens/DaltonLens-Python/blob/master/daltonlens/convert.py
LMS_from_XYZJuddVos_Smith_Pokorny_1975 = np.array([
    [ 0.15514, 0.54312, -0.03286],
    [-0.15514, 0.45684,  0.03286],
    [ 0      , 0      ,  0.01608]])
```

**Recommended: Viénot 1999, at full dichromacy, using the pre-composed linear-RGB matrices.** It is the algorithm whose published purpose is checking display colourmaps for dichromats, and libDaltonLens auto-selects it for protan and deutan. Because there is only one projection plane, *"the entire pipeline can be reduced to a single 3x3 matrix multiplication in the linearRGB space"*:

```c
/* applied to LINEAR RGB, not gamma-encoded sRGB */
dl_vienot_protan_rgbCvd_from_rgb[] = {
     0.11238,  0.88762,  0.00000,
     0.11238,  0.88762, -0.00000,
     0.00401, -0.00401,  1.00000 };
dl_vienot_deutan_rgbCvd_from_rgb[] = {
     0.29275,  0.70725,  0.00000,
     0.29275,  0.70725, -0.00000,
    -0.02234,  0.02234,  1.00000 };
```

Brettel 1997, for a stricter cross-check (take the **minimum** ΔE over both algorithms to stay conservative). Two matrices per deficiency, selected by the sign of the dot product with the separation-plane normal, all in linear RGB — [libDaltonLens.c](https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.c):

```c
/* protan */
rgbCvdFromRgb_1 = { 0.14980, 1.19548, -0.34528,  0.10764, 0.84864, 0.04372,  0.00384, -0.00540, 1.00156 };
rgbCvdFromRgb_2 = { 0.14570, 1.16172, -0.30742,  0.10816, 0.85291, 0.03892,  0.00386, -0.00524, 1.00139 };
separationPlaneNormalInRgb = { 0.00048, 0.00393, -0.00441 };

/* deutan */
rgbCvdFromRgb_1 = { 0.36477, 0.86381, -0.22858,  0.26294, 0.64245, 0.09462, -0.02006, 0.02728, 0.99278 };
rgbCvdFromRgb_2 = { 0.37298, 0.88166, -0.25464,  0.25954, 0.63506, 0.10540, -0.01980, 0.02784, 0.99196 };
separationPlaneNormalInRgb = { -0.00281, -0.00611, 0.00892 };

/* selection */
const float dotWithSepPlane = rgb[0]*n[0] + rgb[1]*n[1] + rgb[2]*n[2];
const float* rgbCvdFromRgb = (dotWithSepPlane >= 0 ? params->rgbCvdFromRgb_1 : params->rgbCvdFromRgb_2);
```

Machado 2009 severity matrices (linear RGB), if a severity slider is ever wanted — [DaltonLens-Python simulate.py](https://github.com/DaltonLens/DaltonLens-Python/blob/master/daltonlens/simulate.py). Severity 1.0 rows:

```
PROTAN 1.0  0.152286 1.052583 -0.204868 | 0.114503 0.786281 0.099216 | -0.003882 -0.048116 1.051998
DEUTAN 1.0  0.367322 0.860646 -0.227968 | 0.280085 0.672501 0.047413 | -0.011820  0.042940 0.968881
```
These match the authors' own published table ([UFRGS](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)).

### 5. Order of operations

**Simulation is applied to linear RGB, before any OKLab conversion, and the input must be linearised first.**

```
hex "#rrggbb"
  -> sRGB 0..1 (divide by 255)
  -> linear sRGB            [lin_sRGB, piecewise 2.4]
  -> CVD matrix             [Viénot/Brettel/Machado — LINEAR RGB in, LINEAR RGB out]
  -> clamp to [0,1]         [decision, see Gotchas]
  -> OKLab                  [linear sRGB -> LMS -> cbrt -> Lab]
  -> ΔEOK, ×100
```

There is **no gamma re-encode** between simulation and OKLab: OKLab's input is linear sRGB.

Evidence the matrices are linear-RGB operators:
- libDaltonLens linearises its input and then applies the matrices, which it describes as living "in the linearRGB space" ([libDaltonLens.c](https://github.com/DaltonLens/libDaltonLens/blob/master/libDaltonLens.c)).
- R's **colorspace** documents fixing exactly this: *"Up to version 2.0-3 ... the CVD transformations had been applied to the gamma-corrected sRGB coordinates ... instead of the more appropriate linear RGB coordinates. The latter is the default starting from version 2.1-0"* ([CVD vignette](https://colorspace.r-forge.r-project.org/articles/color_vision_deficiency.html)).

Getting this wrong is the most common bug: *"the most widely replicated matlab code ... does not take it into account and directly treat the input image as linear RGB"* ([Understanding CVD simulation](https://daltonlens.org/understanding-cvd-simulation/)).

### 6. Verification fixtures

**F1 — XYZ → OKLab, from the author** ([Ottosson](https://bottosson.github.io/posts/oklab/), 3 d.p.):

| X | Y | Z | L | a | b |
|---|---|---|---|---|---|
| 0.950 | 1.000 | 1.089 | 1.000 | 0.000 | 0.000 |
| 1.000 | 0.000 | 0.000 | 0.450 | 1.236 | -0.019 |
| 0.000 | 1.000 | 0.000 | 0.922 | -0.671 | 0.263 |
| 0.000 | 0.000 | 1.000 | 0.153 | -1.415 | -0.449 |

**F2 — sRGB hex → OKLab, independent implementation** ([culori test/oklab.test.js](https://github.com/Evercoder/culori/blob/main/test/oklab.test.js)):

| input | L | a | b |
|---|---|---|---|
| `black` (#000000) | 0 | 0 | 0 |
| `#111111` | 0.17763777307657064 | 0 | 0 |
| `red` (#ff0000) | 0.6279553639214311 | 0.22486306842627443 | 0.12584627733058495 |
| `white` (#ffffff) | 1.0000000000000002 | 0 | 0 |

**F3 — XYZ → OKLab, a third implementation.** `colour` (Python): `XYZ = [0.20654008, 0.12197225, 0.05136952]` → `[0.5163401..., 0.154695..., 0.0628957...]` ([colour.XYZ_to_Oklab](https://colour.readthedocs.io/en/develop/generated/colour.XYZ_to_Oklab.html)).

**F4 — ΔEOK anchors.** black↔white = **1.0** raw, **100** ×100; `#111111`↔black = **0.17763777…** raw, **17.76** ×100.

**F5 — CVD structural invariants, readable directly off the published Viénot matrices** (no arithmetic, so they cannot inherit an implementation bug):

- Rows 1 and 2 identical ⇒ **simulated linear R must equal simulated linear G** for every input.
- Column 3 is (0, 0, 1) ⇒ **linear blue maps to itself** under both protan and deutan.
- Every row sums to 1 ⇒ **the neutral axis is fixed**: linear (g,g,g) → (g,g,g).
- Protan: linear red → **(0.11238, 0.11238, 0.00401)**; linear green → **(0.88762, 0.88762, -0.00401)**.
- Deutan: linear red → **(0.29275, 0.29275, -0.02234)**; linear green → **(0.70725, 0.70725, 0.02234)**.

**F6 — end-to-end hex → simulated hex, cross-implementation (Machado, severity 1.0, deutan).** R colorspace: `#FF0000` → `deutan()` → **`#A39000`** ([vignette](https://colorspace.r-forge.r-project.org/articles/color_vision_deficiency.html)). This confirms (a) linear RGB application, (b) negatives clamped, (c) sRGB OETF on encode. Only applicable if we implement Machado.

**UNVERIFIED — no published hex→hex fixture for Viénot 1999 or Brettel 1997.** DaltonLens-Python's tests compare against stored PNGs rather than numeric fixtures. If we want a numeric cross-check, generate one once with libDaltonLens and commit it with a note naming the tool and version — a recorded third-party output, not a self-check.

---

## Gotchas

1. **The AC is not yet executable.** No unit, no space, no algorithm, and the tool that produced the published numbers is absent. Pin: (a) ΔEOK vs ΔEOK2 vs ΔEOKr2; (b) the ×100 scale; (c) Viénot vs Brettel vs Machado and at what severity; (d) clamping policy; (e) token-vs-token or composited (see #9).
2. **Do not feed gamma-encoded sRGB to a CVD matrix.** The most widely replicated bug in the ecosystem. It silently darkens and desaturates, inflating some ΔE and deflating others.
3. **Do not use a 2.2 power law for linearisation.** A 2.2 approximation shifts dark colours most — exactly where the light-theme `mk1` (`#151107`) lives.
4. **Simulated colours go out of gamut.** F5 shows green under protan gives B = −0.00401. Clamping models what the screen shows; not clamping keeps the metric continuous. `Math.cbrt` is sign-matched, so an unclamped pipeline will **not** throw — the divergence is silent.
5. **Two published OKLab matrix sets exist**, differing at ~1e-8; anything predating 2021-01-25 is a *different* space.
6. **`Math.cbrt`, not `Math.pow(x, 1/3)`.** `Math.pow(-0.001, 1/3)` is `NaN`. The W3C code carries this warning explicitly.
7. **Viénot 1999 is invalid for tritanopia.** Fine for AC-099; if a later AC adds tritan, switch to Brettel 1997 and every published number changes.
8. **Severity semantics differ.** Viénot and Brettel simulate dichromacy only; libDaltonLens fakes severity by interpolating with the original, which is not physiological. Machado's severity *is*. For a worst-case accessibility floor, full dichromacy is the defensible setting.
9. **direction.md's own numbers may measure something AC-099 does not.** Rule at `direction.md:201` sets an **unmarked fade of opacity 0.28**, so on screen an unmarked series colour is composited over the background before any comparison. AC-099 compares raw tokens. A requirements question, not something to guess.
10. **AC-099 does not constrain marking↔marking.** The ΔE 6.8 figure is dark-mode `mk1`↔`mk4`, a marking-vs-marking pair, so it cannot fail AC-099 as written — but it means two simultaneous markings can be near-indistinguishable under CVD, which is why the badge/chip naming (AC-098) is load-bearing.
11. **`other` is in scope?** `direction.md:196` says the audit covered "every categorical slot and `other`"; `other` is `#b3b1ab` light / `#5c5b57` dark. AC-099 says "every categorical series colour", which a literal implementation reads as the 8 slots only.
12. **Expect our numbers to differ from direction.md's.** `validate_palette.js` is unavailable, so treat 19.6 / 9.1 / 8.4 / 6.8 / 9.0 as historical notes, not expected test output.
13. **Hex parsing must round-trip 8-bit exactly.** Divide by 255 (not 256), before linearisation.

---

## Alternatives considered

- **culori 4.0.2** (MIT, ESM, zero runtime deps) — covers the OKLab half correctly, and its test fixtures are what F2 uses. **But its CVD half is unsuitable**: `src/deficiency.js` cites Machado 2009 yet applies the matrices in culori's `rgb` mode — gamma-encoded sRGB, not `lrgb` ([culori/src/deficiency.js](https://github.com/Evercoder/culori/blob/main/src/deficiency.js)). That is precisely the behaviour R's colorspace abandoned in 2.1-0 as "less appropriate". It also offers no Viénot or Brettel implementation.
- **Color.js** — implements `deltaEOK` with the same formula but its documented colour-difference surface does not include CVD simulation.
- **Ports of the Fidaner/Lin/Özgüven MATLAB code** — DaltonLens documents that this widely replicated code treats the input as already linear. **UNVERIFIED** which npm packages descend from it; treat any CVD package as guilty until its source is read for a linearisation step.
- **libDaltonLens** (C, public domain) — not a JS dependency, but the best-sourced constant set and the origin of every CVD matrix quoted above; worth keeping as the citation in code comments and as the generator for a recorded fixture.

---

## Open questions / unverified

1. **UNVERIFIED — CSS Color 4 §20 prose.** Could not retrieve; everything stated about ΔEOK comes from the spec's sample-code files, which are normative-adjacent but not the prose.
2. **UNVERIFIED — any published threshold for "distinguishable" in OKLab ΔE.** None found. Treat 15 and 8 as product decisions and label them as such in direction.md.
3. **UNVERIFIED — the "6–8 floor band"** at `direction.md:198`. No source found.
4. **UNVERIFIED — why the two OKLab matrix sets differ at ~1e-8.**
5. **UNVERIFIED — Machado 2009's own colour-space intent.** Two independent reference implementations use linear RGB and fixture F6 confirms it reproduces R's published output — inference from implementations, not a sentence in the paper.
6. **UNVERIFIED — no numeric published fixture for Viénot 1999 or Brettel 1997.**
7. **Decision needed from the user**: ΔE variant; ×100 scale; simulation algorithm and severity; clamping; whether `other` and the 0.28 fade composite are in scope; whether marking↔marking is in scope. Until these are pinned, `markingPalette.test.ts` would be asserting numbers whose definition is unstated.
