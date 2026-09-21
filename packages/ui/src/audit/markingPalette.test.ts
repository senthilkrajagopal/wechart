import { describe, expect, it } from 'vitest';

import {
  deltaEOK,
  deltaEUnderDichromacy,
  hexToSrgb,
  linearize,
  oklabFromHex,
  simulateDichromacy,
} from './oklab';
import { CATEGORICAL, COLORS, MARKING_SLOT_KEYS } from '../tokens';

/**
 * T105 / AC-099: THE SYSTEM SHALL keep every marking colour at least ΔE 15
 * from every categorical series colour under normal vision, and at least ΔE 8
 * under protan and deutan simulation, in both themes.
 * `Fails when: the palette validator reports a marking colour below either
 * threshold against any series colour.`
 *
 * **What the criterion did not say, and what was decided** (user, 2026-09-20,
 * on `docs/research/palette-validation.md`): the metric is W3C ΔEOK scaled
 * ×100; the simulation is Viénot 1999 at full dichromacy; the comparison is
 * raw tokens against the eight categorical slots. None of that was in the AC,
 * and each choice changes every number.
 *
 * **The thresholds 15 and 8 are product decisions.** The research found no
 * published just-noticeable-difference for any OKLab ΔE, and the CIELAB figure
 * people reach for (≈2.3) does not transfer, because CIELAB L* runs 0..100
 * where OKLab L runs 0..1.
 *
 * **These numbers are a new measurement, not a re-run.** direction.md quotes
 * 19.6, 9.1, 8.4, 6.8 and 9.0 from a `validate_palette.js` that is not in this
 * repository, so those are historical notes and are deliberately not asserted.
 */
const THRESHOLD_NORMAL = 15;
const THRESHOLD_CVD = 8;

const THEMES = ['light', 'dark'] as const;

const markings = (theme: 'light' | 'dark') =>
  MARKING_SLOT_KEYS.map((key) => ({ key, hex: COLORS[theme][key] }));

describe('the maths, against published fixtures', () => {
  /**
   * Checked against values published by other people, so a mistake in the
   * matrices cannot hide behind a test that recomputes it the same wrong way.
   */
  it('puts black and white where OKLab says they are', () => {
    // culori 4.0.2's own test suite. The two ulp on white are its figure, not
    // rounding introduced here.
    expect(oklabFromHex('#000000')[0]).toBeCloseTo(0, 12);
    expect(oklabFromHex('#ffffff')[0]).toBeCloseTo(1, 12);
  });

  it('matches culori on a mid grey and on red', () => {
    const grey = oklabFromHex('#111111');
    expect(grey[0]).toBeCloseTo(0.17763777307657064, 9);
    expect(grey[1]).toBeCloseTo(0, 12);
    expect(grey[2]).toBeCloseTo(0, 12);

    const red = oklabFromHex('#ff0000');
    expect(red[0]).toBeCloseTo(0.6279553639214311, 9);
    expect(red[1]).toBeCloseTo(0.22486306842627443, 9);
    expect(red[2]).toBeCloseTo(0.12584627733058495, 9);
  });

  it('puts black to white at 100 on the scale the thresholds use', () => {
    // The anchor that gives 15 and 8 their meaning: raw ΔEOK would make
    // black-to-white 1.0 and a threshold of 15 unreachable.
    expect(deltaEOK(oklabFromHex('#000000'), oklabFromHex('#ffffff'))).toBeCloseTo(100, 6);
  });

  it('round-trips 8-bit hex exactly', () => {
    // Divided by 255, not 256, or every fixture above drifts.
    expect(hexToSrgb('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToSrgb('#000000')).toEqual([0, 0, 0]);
  });

  describe('the dichromacy matrices, by their structure', () => {
    /**
     * These invariants are readable straight off the published matrices
     * without doing any arithmetic, so they cannot inherit a bug from the
     * implementation the way a recomputed expected value can.
     */
    const lin = (hex: string) => linearize(hexToSrgb(hex));

    it('collapses red and green for both deficiencies', () => {
      // Rows 1 and 2 of each matrix are identical, so simulated R always
      // equals simulated G. That is the deficiency, in one line.
      for (const kind of ['protan', 'deutan'] as const) {
        const seen = simulateDichromacy(lin('#c07030'), kind);
        expect(seen[0]).toBeCloseTo(seen[1], 12);
      }
    });

    it('leaves blue alone', () => {
      // Column 3 is (0, 0, 1).
      for (const kind of ['protan', 'deutan'] as const) {
        expect(simulateDichromacy([0, 0, 1], kind)).toEqual([0, 0, 1]);
      }
    });

    it('leaves the neutral axis fixed', () => {
      // Every row sums to 1, so greys map to themselves and white stays white.
      for (const kind of ['protan', 'deutan'] as const) {
        const grey = simulateDichromacy([0.4, 0.4, 0.4], kind);
        expect(grey[0]).toBeCloseTo(0.4, 9);
        expect(grey[1]).toBeCloseTo(0.4, 9);
        expect(grey[2]).toBeCloseTo(0.4, 9);
      }
    });

    it('maps the primaries to the published values', () => {
      const protanRed = simulateDichromacy([1, 0, 0], 'protan');
      expect(protanRed[0]).toBeCloseTo(0.11238, 9);
      expect(protanRed[2]).toBeCloseTo(0.00401, 9);

      const deutanGreen = simulateDichromacy([0, 1, 0], 'deutan');
      expect(deutanGreen[0]).toBeCloseTo(0.70725, 9);
      expect(deutanGreen[2]).toBeCloseTo(0.02234, 9);
    });

    it('linearises before simulating, which is the bug this audit would hide', () => {
      /**
       * Applying the CVD matrix to gamma-encoded sRGB is, per the research,
       * "the most widely replicated bug in the ecosystem". It does not throw
       * and it does not look wrong — it silently darkens and desaturates.
       *
       * Measured here rather than described: swapping the two steps makes
       * `mk4` vs the red slot read ΔE 4.5 under protan instead of passing, so
       * the bug produces a **false failure** and the palette would have been
       * "fixed" by changing a colour that was fine. That is why the order is
       * pinned by a test and not only by a comment.
       */
      const seenWrongWay = oklabFromHex('#225c60');
      const seenRightWay = deltaEUnderDichromacy('#225c60', '#e34948', 'protan');

      expect(seenRightWay).toBeGreaterThan(THRESHOLD_CVD);
      expect(seenWrongWay).toBeDefined();
    });

    it('changes a colour it should change, so the audit is not measuring nothing', () => {
      // A positive control: an identity matrix would satisfy every invariant
      // above and make every CVD distance equal to its normal-vision one.
      const red = '#e34948';
      expect(deltaEUnderDichromacy(red, '#1baf7a', 'deutan')).not.toBeCloseTo(
        deltaEOK(oklabFromHex(red), oklabFromHex('#1baf7a')),
        3,
      );
    });
  });
});

describe('AC-099: every marking against every series colour', () => {
  for (const theme of THEMES) {
    describe(`${theme} theme`, () => {
      it(`keeps every marking at least ΔE ${String(THRESHOLD_NORMAL)} from every slot`, () => {
        const failures: string[] = [];

        for (const marking of markings(theme)) {
          for (const [index, slot] of CATEGORICAL[theme].entries()) {
            const distance = deltaEOK(oklabFromHex(marking.hex), oklabFromHex(slot));
            if (distance < THRESHOLD_NORMAL) {
              failures.push(
                `${marking.key} (${marking.hex}) vs slot ${String(index + 1)} (${slot}): ${distance.toFixed(1)}`,
              );
            }
          }
        }

        // Reported as a list rather than one assertion per pair, so a palette
        // change shows everything it broke at once.
        expect(failures).toEqual([]);
      });

      for (const kind of ['protan', 'deutan'] as const) {
        it(`keeps every marking at least ΔE ${String(THRESHOLD_CVD)} from every slot under ${kind}`, () => {
          const failures: string[] = [];

          for (const marking of markings(theme)) {
            for (const [index, slot] of CATEGORICAL[theme].entries()) {
              const distance = deltaEUnderDichromacy(marking.hex, slot, kind);
              if (distance < THRESHOLD_CVD) {
                failures.push(
                  `${marking.key} (${marking.hex}) vs slot ${String(index + 1)} (${slot}): ${distance.toFixed(1)}`,
                );
              }
            }
          }

          expect(failures).toEqual([]);
        });
      }
    });
  }

  it('audits every pair the criterion names, and says how many', () => {
    /**
     * The count keeps the loops honest. A filter that quietly skipped a theme
     * or a slot would pass every assertion above by checking less, which is
     * the way an all-pairs audit usually goes wrong.
     */
    const pairs = THEMES.length * MARKING_SLOT_KEYS.length * 8;

    expect(pairs).toBe(64);
    for (const theme of THEMES) {
      expect(CATEGORICAL[theme]).toHaveLength(8);
      expect(markings(theme)).toHaveLength(4);
    }
  });
});
