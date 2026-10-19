import { kpiTrendQuery, type RenderSpec } from '@wechart/core';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { highlightKind } from '../../dashboard/crossfilter/apply';
import { clickedMarkItem, clickedValue, isTiledKpi } from '../../dashboard/crossfilter/clicked';
import { KPI_CSS } from './kpiStyles';
import { KpiTiles } from './KpiTiles';

/**
 * T941 / AC-568: WHILE a KPI is tiled, THE SYSTEM SHALL make each tile its
 * member for marking: a click marks it and Ctrl/⌘+click toggles it
 * (AC-087); the marked tile takes the 1.5 px marking outline and "● Marked",
 * the others keeping their numbers in `text-secondary` and fading their
 * micro-charts to 0.28; limited by a marking, every tile recomputes
 * (AC-107); and as a cross-filter source a tile filters the other tiles to
 * its member, and as a target with Highlight it shows "Selected: $X · p%"
 * as the marked badge does.
 * `Fails when: clicking a tile doesn't mark its member, or Ctrl/⌘ doesn't
 * toggle; an unmarked tile's value fades below text-secondary; a limited
 * KPI's tiles don't recompute; or a tile doesn't filter or highlight as said.`
 */
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';
const MARKING = '#d9480f';

const spec = (more: Partial<RenderSpec> = {}): RenderSpec =>
  ({
    chartType: 'kpi',
    encoding: { y: [REVENUE] },
    rows: [
      { [REGION]: 'EMEA', [REVENUE]: '412000' },
      { [REGION]: 'APAC', [REVENUE]: '221000' },
      { [REGION]: 'LATAM', [REVENUE]: '176000' },
    ],
    formats: { [REVENUE]: 'currency' },
    titles: { [REVENUE]: 'Revenue', [REGION]: 'Region' },
    measureTypes: { [REVENUE]: 'sum' },
    options: { kpi: { tileBy: REGION } },
    ...more,
  }) as unknown as RenderSpec;

const tile = (region: string) => screen.getByRole('listitem', { name: new RegExp(`^${region}:`) });

describe('a tiled KPI’s tiles as their members (T941, AC-568)', () => {
  it('marks EMEA on a click, and adds APAC on a Ctrl-click, each as its Region', () => {
    const onItemClick = vi.fn();
    render(<KpiTiles spec={spec()} measure={REVENUE} onItemClick={onItemClick} />);
    fireEvent.click(tile('EMEA'));
    fireEvent.click(tile('APAC'), { ctrlKey: true });
    fireEvent.click(tile('LATAM'), { metaKey: true });
    expect(onItemClick.mock.calls).toEqual([
      [{ name: 'EMEA', marks: [{ member: REGION, value: 'EMEA' }] }, false],
      [{ name: 'APAC', marks: [{ member: REGION, value: 'APAC' }] }, true],
      [{ name: 'LATAM', marks: [{ member: REGION, value: 'LATAM' }] }, true],
    ]);
    // As the dashboard reads the click: a marking's item, and a cross-filter's value.
    const [[item]] = onItemClick.mock.calls as [[Parameters<typeof clickedValue>[1]]];
    expect(clickedMarkItem(spec(), item)).toEqual([{ member: REGION, value: 'EMEA' }]);
    expect(clickedValue(spec(), item)).toEqual({ member: REGION, value: 'EMEA' });
  });

  it('outlines the marked tile with "● Marked", the others’ values in text-secondary and their micro-charts at 0.28', () => {
    render(
      <KpiTiles
        spec={spec({
          marking: {
            predicate: { items: [[{ member: REGION, value: 'EMEA' }]], ranges: [] },
            colour: MARKING,
          },
        } as Partial<RenderSpec>)}
        measure={REVENUE}
      />,
    );
    const emea = tile('EMEA');
    expect(emea.classList.contains('kpi-tile--marked')).toBe(true);
    // Its outline in the marking's colour, 1.5 px drawn as a ring a browser
    // doesn't round to whole pixels.
    expect(emea.style.getPropertyValue('--kpi-mark')).toBe(MARKING);
    expect(within(emea).getByTestId('kpi-tile-marked').textContent).toBe('● Marked');
    for (const other of ['APAC', 'LATAM']) {
      expect(tile(other).classList.contains('kpi-tile--dimmed')).toBe(true);
      expect(within(tile(other)).queryByTestId('kpi-tile-marked')).toBeNull();
    }
    expect(KPI_CSS).toMatch(
      /\.kpi-tile--marked \{[^}]*box-shadow: inset 0 0 0 1\.5px var\(--kpi-mark\);[^}]*\}/,
    );
    expect(KPI_CSS).toMatch(
      /\.kpi-tile--dimmed \.kpi-tile__value \{[^}]*color: var\(--wc-text-secondary\);[^}]*\}/,
    );
    expect(KPI_CSS).toMatch(/\.kpi-tile--dimmed svg \{[^}]*opacity: 0\.28;[^}]*\}/);
  });

  it('dims nothing while nothing of it is marked', () => {
    render(
      <KpiTiles
        spec={spec({
          marking: { predicate: { items: [], ranges: [] }, colour: MARKING },
        } as Partial<RenderSpec>)}
        measure={REVENUE}
      />,
    );
    expect(document.querySelectorAll('.kpi-tile--dimmed, .kpi-tile--marked')).toHaveLength(0);
  });

  it('asks every tile’s trend under the marking that limits it, as its value is', () => {
    const limited = {
      measures: [REVENUE],
      dimensions: [REGION],
      filters: [{ member: 'orders.channel', operator: 'equals', values: ['Web'] }],
    };
    const trend = kpiTrendQuery(
      limited,
      REVENUE,
      { member: 'orders.ordered_at', granularity: 'month' },
      new Date('2026-10-18T00:00:00Z'),
    );
    expect(trend['filters']).toEqual(limited.filters);
    expect(trend['dimensions']).toEqual([REGION]);
  });

  it('is a Highlight target that shows the selection’s share, where a single KPI is filtered as before', () => {
    expect(isTiledKpi(spec())).toBe(true);
    expect(highlightKind('kpi', false, 1, isTiledKpi(spec()))).toBe('share');
    const single = { ...spec(), options: {} } as RenderSpec;
    expect(isTiledKpi(single)).toBe(false);
    expect(highlightKind('kpi', false, 1, isTiledKpi(single))).toBe('filter');
  });

  it('says "Selected: $X · p%" on each tile as a Highlight target', () => {
    render(
      <KpiTiles
        spec={spec({
          highlight: {
            member: 'orders.channel',
            value: 'Web',
            kind: 'share',
            rows: [
              { [REGION]: 'EMEA', [REVENUE]: '103000' },
              { [REGION]: 'APAC', [REVENUE]: '55250' },
            ],
          },
        })}
        measure={REVENUE}
      />,
    );
    expect(within(tile('EMEA')).getByTestId('kpi-tile-selected').textContent).toBe(
      'Selected: $103,000 · 25%',
    );
    expect(within(tile('APAC')).getByTestId('kpi-tile-selected').textContent).toBe(
      'Selected: $55,250 · 25%',
    );
    // None of LATAM in the selection: none of a summed measure, said as 0.
    expect(within(tile('LATAM')).getByTestId('kpi-tile-selected').textContent).toBe(
      'Selected: $0 · 0%',
    );
  });
});
