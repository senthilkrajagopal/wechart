import { describe, expect, it } from 'vitest';

import { CAPS, checkLegality, isLegal } from './legality';
import type { Candidate, Field } from './types';

/**
 * AC-030: THE SYSTEM SHALL never recommend a chart with two value axes.
 * AC-031: WHEN a chart would exceed a channel's capacity, THE SYSTEM SHALL
 * reject that candidate: more than 8 colour categories, more than 20 trellis
 * panels, more than 6 pie slices, or more than 200 heatmap cells.
 *
 * Every cap is tested **at the boundary in both directions** — accepted at the
 * cap, rejected one past it. A rule written with the wrong comparison passes a
 * test that only checks a wildly-over case.
 */
const measure: Field = { name: 'orders.count', kind: 'measure' };
const dimension = (cardinality: number, name = 'orders.status'): Field => ({
  name,
  kind: 'dimension',
  cardinality,
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  chartType: 'bar',
  valueFields: [measure],
  categoryField: dimension(4),
  valueAxisCount: 1,
  ...over,
});

const reasonFor = (c: Candidate, rule: string) =>
  checkLegality(c).find((outcome) => outcome.rule === rule);

describe('no second value axis (AC-030)', () => {
  it('accepts one value axis', () => {
    expect(isLegal(candidate({ valueAxisCount: 1 }))).toBe(true);
  });

  it('rejects two', () => {
    const outcome = reasonFor(candidate({ valueAxisCount: 2 }), 'no_dual_value_axis');
    expect(outcome?.passed).toBe(false);
    expect(outcome?.reason).toMatch(/scale/i);
  });

  it('rejects a combo chart that sneaks a second axis in', () => {
    expect(isLegal(candidate({ chartType: 'combo', valueAxisCount: 2 }))).toBe(false);
  });
});

describe('colour capacity (AC-031)', () => {
  it('accepts exactly the cap', () => {
    expect(isLegal(candidate({ colorField: dimension(CAPS.colorCategories) }))).toBe(true);
  });

  it('rejects one past the cap', () => {
    const outcome = reasonFor(
      candidate({ colorField: dimension(CAPS.colorCategories + 1) }),
      'high_cardinality_color',
    );
    expect(outcome?.passed).toBe(false);
    expect(outcome?.reason).toContain(String(CAPS.colorCategories));
  });

  it('says nothing about colour when nothing is on it', () => {
    expect(reasonFor(candidate(), 'high_cardinality_color')?.passed).toBe(true);
  });
});

/**
 * A deliberate decision, not a fallback: a field whose cardinality nobody knows
 * is treated as *over* any cap.
 *
 * The two guesses are not symmetric. Assuming small offers a pie that then
 * draws five hundred slices; assuming large offers a bar for a category that
 * turns out to have four values — a worse chart, not a broken one.
 */
describe('a field with unknown cardinality', () => {
  const unknown: Field = { name: 'orders.unknown', kind: 'dimension' };

  it('fails the colour cap rather than passing it', () => {
    expect(isLegal(candidate({ colorField: unknown }))).toBe(false);
  });

  it('fails the pie cap rather than passing it', () => {
    expect(isLegal(candidate({ chartType: 'pie', categoryField: unknown }))).toBe(false);
  });

  it('fails the trellis cap rather than passing it', () => {
    expect(isLegal(candidate({ facetField: unknown }))).toBe(false);
  });

  it('says the count is unknown rather than printing Infinity', () => {
    const outcome = reasonFor(candidate({ colorField: unknown }), 'high_cardinality_color');
    expect(outcome?.reason).toContain('unknown');
    expect(outcome?.reason).not.toContain('Infinity');
  });

  it('still allows a chart whose capped channels carry nothing', () => {
    // A bar's category axis has no cap, so an unknown count is fine there.
    expect(isLegal(candidate({ chartType: 'bar', categoryField: unknown }))).toBe(true);
  });
});

describe('trellis capacity (AC-031)', () => {
  it('accepts exactly the cap', () => {
    expect(isLegal(candidate({ facetField: dimension(CAPS.trellisPanels) }))).toBe(true);
  });

  it('rejects one past the cap', () => {
    expect(isLegal(candidate({ facetField: dimension(CAPS.trellisPanels + 1) }))).toBe(false);
  });
});

describe('pie capacity (AC-031)', () => {
  const pie = (slices: number) => candidate({ chartType: 'pie', categoryField: dimension(slices) });

  it('accepts exactly the cap', () => {
    expect(isLegal(pie(CAPS.pieSlices))).toBe(true);
  });

  it('rejects one past the cap', () => {
    expect(isLegal(pie(CAPS.pieSlices + 1))).toBe(false);
  });

  it('applies only to pies, so a bar with many categories is fine', () => {
    expect(isLegal(candidate({ categoryField: dimension(CAPS.pieSlices + 20) }))).toBe(true);
  });

  it('refuses a pie of several measures, which is not a division of one', () => {
    expect(
      isLegal(
        candidate({
          chartType: 'pie',
          categoryField: dimension(3),
          valueFields: [measure, { name: 'orders.total_amount', kind: 'measure' }],
        }),
      ),
    ).toBe(false);
  });
});

describe('heatmap capacity (AC-031)', () => {
  const heatmap = (rows: number, columns: number) =>
    candidate({
      chartType: 'heatmap',
      categoryField: dimension(rows, 'rows'),
      secondCategoryField: dimension(columns, 'columns'),
    });

  it('accepts exactly the cap', () => {
    // 20 x 10 = 200 cells.
    expect(isLegal(heatmap(20, 10))).toBe(true);
  });

  it('rejects one past the cap', () => {
    // 21 x 10 = 210 cells.
    const outcome = reasonFor(heatmap(21, 10), 'heatmap_cell_capacity');
    expect(outcome?.passed).toBe(false);
    expect(outcome?.reason).toContain('210');
  });

  it('counts cells rather than either axis alone', () => {
    // Neither axis is large, but together they are over.
    expect(isLegal(heatmap(15, 15))).toBe(false);
  });
});

describe('the trace (AC-029 groundwork)', () => {
  it('reports every rule, passed or failed, not only the failures', () => {
    const outcomes = checkLegality(candidate());

    expect(outcomes.length).toBeGreaterThan(3);
    expect(outcomes.every((outcome) => typeof outcome.rule === 'string')).toBe(true);
    expect(outcomes.every((outcome) => outcome.passed)).toBe(true);
  });

  it('gives a reason for every rule it fails', () => {
    const outcomes = checkLegality(candidate({ valueAxisCount: 2 }));
    const failures = outcomes.filter((outcome) => !outcome.passed);

    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((outcome) => (outcome.reason ?? '').length > 0)).toBe(true);
  });

  it('rejects a chart with nothing to draw', () => {
    expect(
      isLegal(candidate({ valueFields: [], categoryField: undefined as unknown as Field })),
    ).toBe(false);
  });
});

/**
 * T968 / AC-031 (R81): … a KPI tiled by more than 20 members … (design 23
 * Q5 (a): "KPI tiles ≤ 20 (the panel cap)").
 */
describe('a KPI’s tiles (T968, AC-031)', () => {
  const tiled = (members: number): Candidate => ({
    chartType: 'kpi',
    valueFields: [measure],
    facetField: dimension(members, 'customers.region'),
    valueAxisCount: 1,
  });

  it('accepts a KPI tiled by 20 members', () => {
    expect(CAPS.kpiTiles).toBe(20);
    expect(isLegal(tiled(20))).toBe(true);
  });

  it('rejects a KPI tiled by 21, saying why', () => {
    const outcome = reasonFor(tiled(21), 'kpi_tile_capacity');
    expect(outcome?.passed).toBe(false);
    expect(outcome?.reason).toBe('A KPI shows 20 tiles at most; this needs 21.');
    expect(isLegal(tiled(21))).toBe(false);
    // Said once, as a KPI's tiles, never as a trellis's panels.
    expect(reasonFor(tiled(21), 'high_cardinality_facet')?.passed).toBe(true);
  });

  it('leaves a KPI of one number alone', () => {
    expect(reasonFor(candidate({ chartType: 'kpi' }), 'kpi_tile_capacity')?.passed).toBe(true);
  });
});
