import type { RenderSpec } from '@wechart/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { kpiKeyItemsOf, KpiTiles } from './KpiTiles';

/**
 * T940 / AC-567: WHILE a KPI has Tile by set, THE SYSTEM SHALL draw one tile
 * per member, 8 px apart, each with its own value, change, sparkline and
 * target, as a list whose items are named "‹member›: ‹value›, ‹up or down›
 * ‹change› vs ‹comparison›, ‹p›% of ‹target›"; order them by value, highest
 * first, unless the author orders them in Customize; and past 20 tiles, page
 * them with "Tiles 1–20 of ‹n›" and ‹ › buttons.
 * `Fails when: tiles share one value, aren't a list, or lack their names;
 * the order isn't by value without a custom order; or more than 20 show at
 * once.`
 */
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';
const OCT = '2026-10-01T00:00:00.000 - 2026-10-31T23:59:59.999';
const SEP = '2026-09-01T00:00:00.000 - 2026-09-30T23:59:59.999';

const REGIONS: readonly (readonly [string, number, number])[] = [
  ['LATAM', 176_000, 182_400],
  ['EMEA', 412_000, 395_400],
  ['APAC', 221_000, 214_000],
  ['North America', 538_000, 520_000],
];

const spec = (
  regions: readonly (readonly [string, number, number])[] = REGIONS,
  kpi: Record<string, unknown> = {},
): RenderSpec =>
  ({
    chartType: 'kpi',
    encoding: { y: [REVENUE] },
    rows: [
      // Cube's compareDateRange answer, read as one: October's rows, then September's.
      ...regions.map(([region, october]) => ({
        [REGION]: region,
        [REVENUE]: String(october),
        compareDateRange: OCT,
      })),
      ...regions.map(([region, , september]) => ({
        [REGION]: region,
        [REVENUE]: String(september),
        compareDateRange: SEP,
      })),
    ],
    formats: { [REVENUE]: 'currency' },
    titles: { [REVENUE]: 'Revenue', [REGION]: 'Region' },
    options: {
      kpi: {
        compareTo: { kind: 'previousPeriod' },
        time: { member: 'orders.ordered_at', granularity: 'month' },
        target: { kind: 'value', value: 450_000 },
        tileBy: REGION,
        ...kpi,
      },
    },
  }) as unknown as RenderSpec;

const names = () => screen.getAllByRole('listitem').map((item) => item.getAttribute('aria-label'));

describe('a KPI tiled by a dimension (T940, AC-567)', () => {
  it('draws Revenue by 4 regions as a list of 4 tiles, highest first, each named', () => {
    render(<KpiTiles spec={spec()} measure={REVENUE} />);
    const list = screen.getByRole('list', { name: 'Revenue by Region' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(names()).toEqual([
      'North America: $538K, up 3.5% vs Sep 2026, 120% of $450K',
      'EMEA: $412K, up 4.2% vs Sep 2026, 92% of $450K',
      'APAC: $221K, up 3.3% vs Sep 2026, 49% of $450K',
      'LATAM: $176K, down 3.5% vs Sep 2026, 39% of $450K',
    ]);
    // Each its own value, in text-kpi, and its own change.
    const emea = screen.getByRole('listitem', { name: /^EMEA:/ });
    expect(within(emea).getByTestId('kpi-tile-value').textContent).toBe('$412,000');
    expect(within(emea).getByTestId('kpi-change').textContent).toBe('▲ +4.2% vs Sep 2026 ($395K)');
    expect(within(emea).getByTestId('kpi-target').textContent).toBe('92% of $450K');
  });

  it('keeps the author’s order: by name, or by value lowest first', () => {
    const { unmount } = render(
      <KpiTiles spec={spec(REGIONS, { tileOrder: 'name' })} measure={REVENUE} />,
    );
    expect(names().map((name) => name?.split(':')[0])).toEqual([
      'APAC',
      'EMEA',
      'LATAM',
      'North America',
    ]);
    unmount();
    render(<KpiTiles spec={spec(REGIONS, { tileOrder: 'valueAscending' })} measure={REVENUE} />);
    expect(names().map((name) => name?.split(':')[0])).toEqual([
      'LATAM',
      'APAC',
      'EMEA',
      'North America',
    ]);
  });

  it('shows 20 of 32 members, "Tiles 1–20 of 32", and pages with ‹ ›', () => {
    const many = Array.from(
      { length: 32 },
      (_, at) => [`Region ${String(at + 1).padStart(2, '0')}`, 1000 * (at + 1), 900] as const,
    );
    render(<KpiTiles spec={spec(many)} measure={REVENUE} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(20);
    expect(screen.getByTestId('kpi-tiles-page').textContent).toBe('Tiles 1–20 of 32');
    // Highest first: Region 32 leads.
    expect(names()[0]).toMatch(/^Region 32:/);
    const previous = screen.getByRole('button', { name: 'Previous tiles' });
    expect(previous).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Next tiles' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByTestId('kpi-tiles-page').textContent).toBe('Tiles 21–32 of 32');
    expect(screen.getByRole('button', { name: 'Next tiles' })).toHaveProperty('disabled', true);
  });
});

/**
 * T971 / AC-563: … focus moving through KPI tiles … in reading order …, the
 * focused one drawn distinct from a marked one (AC-176).
 */
describe('a tiled KPI’s tiles from the keyboard (T971, AC-563)', () => {
  it('lists its members as its tiles read, by value or as Customize orders them', () => {
    expect(kpiKeyItemsOf(spec())).toEqual(['North America', 'EMEA', 'APAC', 'LATAM']);
    expect(kpiKeyItemsOf(spec(REGIONS, { tileOrder: 'name' }))).toEqual([
      'APAC',
      'EMEA',
      'LATAM',
      'North America',
    ]);
    // A KPI not tiled has no items to step between.
    const single = spec();
    expect(
      kpiKeyItemsOf({
        ...single,
        options: { kpi: { time: { member: 'x', granularity: 'month' } } },
      }),
    ).toEqual([]);
  });

  it('draws the tile the keyboard is on, and pages to it', () => {
    const many = Array.from(
      { length: 32 },
      (_, at) => [`Region ${String(at + 1).padStart(2, '0')}`, 1000 * (at + 1), 900] as const,
    );
    render(<KpiTiles spec={{ ...spec(many), keyboardFocus: 'Region 05' }} measure={REVENUE} />);
    // Region 05 is 28th by value: on the second page, which shows.
    expect(screen.getByTestId('kpi-tiles-page').textContent).toBe('Tiles 21–32 of 32');
    const focused = screen.getByRole('listitem', { name: /^Region 05:/ });
    expect(focused.getAttribute('data-keyboard-focus')).toBe('true');
    expect(
      screen
        .getAllByRole('listitem')
        .filter((one) => one.getAttribute('data-keyboard-focus') === 'true'),
    ).toHaveLength(1);
  });
});
