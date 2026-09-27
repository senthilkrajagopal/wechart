import { describe, expect, it } from 'vitest';

import { REQUIREMENTS, canDraw, describeMissing, missingFor } from './requirements';
import type { ChartType } from './types';

/**
 * AC-033: WHEN the chart's fields cannot produce the chosen type, THE SYSTEM
 * SHALL show what is missing, naming the well and the member type needed.
 * Fails when: the chart renders empty axes with no message, or the message does
 * not name what is missing.
 *
 * "Naming the well and the member type" is the part that makes the message
 * useful, so it is asserted directly rather than through a substring of
 * whatever the sentence happens to be.
 */
const counts = (measures = 0, dimensions = 0, timeDimensions = 0) => ({
  measures,
  dimensions,
  timeDimensions,
});

describe('what a chart needs (AC-033)', () => {
  /**
   * T398, AC-305 and AC-313: a country map is offered for one measure and a
   * dimension holding ISO-3 country codes; a dimension of anything else is
   * named for what it lacks.
   */
  it('asks a country map for a measure and a dimension of country codes', () => {
    expect(canDraw('map', { ...counts(1, 1), countryCodes: 1 })).toBe(true);
    expect(canDraw('map', counts(1, 1))).toBe(false);
    expect(describeMissing('map', counts(1, 1))).toEqual([
      'Country map needs a dimension of ISO-3 country codes in Dimensions; add 1 more.',
    ]);
  });

  it('reports nothing missing when the fields are there', () => {
    expect(missingFor('bar', counts(1, 1))).toEqual([]);
    expect(canDraw('bar', counts(1, 1))).toBe(true);
  });

  // T305's review: `compile` draws a pivot's rows from a time dimension and
  // its columns from a dimension, as a trellis's panels (T242).
  it('draws a pivot from a time dimension and a dimension', () => {
    expect(missingFor('pivot', counts(1, 1, 1))).toEqual([]);
    expect(canDraw('pivot', counts(1, 1, 0))).toBe(false);
  });

  it('names the well and the member type when something is missing', () => {
    const [missing] = missingFor('scatter', counts(1));

    expect(missing?.well).toBe('measures');
    expect(missing?.memberType).toContain('measures');
    expect(canDraw('scatter', counts(1))).toBe(false);
  });

  // T242's review: small multiples need a panel per member of one grouping
  // and an axis of another — two dimensions, or a time and a dimension.
  it('asks small multiples for two groupings, time counting as one', () => {
    expect(canDraw('trellis', counts(1, 1))).toBe(false);
    expect(describeMissing('trellis', counts(1, 1))).toEqual([
      'Small multiples needs 2 dimensions, or a time dimension and a dimension, in Dimensions; add 1 more.',
    ]);
    expect(canDraw('trellis', counts(1, 2))).toBe(true);
    expect(canDraw('trellis', counts(1, 1, 1))).toBe(true);
  });

  it('reports a line without a time dimension', () => {
    const missing = missingFor('line', counts(1));

    expect(missing).toHaveLength(1);
    expect(missing[0]?.well).toBe('timeDimensions');
  });

  it('reports every unmet requirement, not only the first', () => {
    // A heatmap wants a measure and two dimensions; this has neither.
    const missing = missingFor('heatmap', counts(0, 0));

    expect(missing.map((requirement) => requirement.well).sort()).toEqual([
      'dimensions',
      'measures',
    ]);
  });

  it('counts how many more are needed, not just that some are', () => {
    // Grouped bar wants two dimensions and there is one.
    const sentences = describeMissing('groupedBar', counts(1, 1));

    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toContain('add 1 more');
  });

  // T230 / AC-217: the type by its name, never its id ("groupedBar").
  it('names the type as a person knows it', () => {
    expect(describeMissing('groupedBar', counts(1, 1))).toEqual([
      'Grouped bar needs 2 dimensions in Dimensions; add 1 more.',
    ]);
  });

  it('writes a sentence naming the well for every unmet requirement', () => {
    const sentences = describeMissing('heatmap', counts(0, 0));

    expect(sentences).toHaveLength(2);
    // The well as the editor names it (AC-216).
    expect(sentences.some((sentence) => sentence.includes('Metrics'))).toBe(true);
    expect(sentences.some((sentence) => sentence.includes('Dimensions'))).toBe(true);
  });

  it('says nothing when the chart can be drawn', () => {
    expect(describeMissing('bar', counts(1, 1))).toEqual([]);
  });

  it('lets a table be drawn from anything, since it is the fallback', () => {
    expect(canDraw('table', counts(0, 0))).toBe(true);
  });

  it('has a requirement list for every chart type the recommender can offer', () => {
    // A type added to the recommender without one here would silently claim it
    // can always be drawn.
    const types = Object.keys(REQUIREMENTS) as ChartType[];
    for (const type of types) {
      expect(Array.isArray(REQUIREMENTS[type])).toBe(true);
    }
    expect(types).toContain('scatter');
    expect(types).toContain('trellis');
  });
});
