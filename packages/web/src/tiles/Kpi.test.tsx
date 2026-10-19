import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Kpi } from './Kpi';

/**
 * T040 / AC-037: the KPI tile.
 *
 * A KPI is one number, so almost everything that can go wrong with it is about
 * what happens when that number is not there — an empty result, a measure the
 * rows do not carry, a value that is not a number. Those are the cases here;
 * the happy path is one assertion.
 */
const COUNT = 'orders.count';

const spec = (over: Partial<RenderSpec> = {}): RenderSpec => ({
  chartType: 'kpi',
  encoding: { y: [COUNT] },
  rows: [{ [COUNT]: 1234 }],
  ...over,
});

describe('a KPI with a value', () => {
  it('shows the number', () => {
    render(<Kpi spec={spec()} />);

    expect(screen.getByTestId('kpi-value').textContent).toBe('1,234');
  });

  it('writes the number in its member’s format from the model (AC-046, T201)', () => {
    // percent_1, as `/v1/meta` reports it: Cube's specifier `.1~%`.
    render(
      <Kpi
        spec={spec({ rows: [{ [COUNT]: 0.1234 }], formats: { [COUNT]: { specifier: '.1~%' } } })}
      />,
    );

    expect(screen.getByTestId('kpi-value').textContent).toBe('12.3%');
  });

  it('names the measure underneath it, so the number means something', () => {
    render(<Kpi spec={spec()} />);

    expect(screen.getByTestId('kpi-label').textContent).toBe(COUNT);
  });

  // T232 / AC-220: by its title from the model, never "orders.count".
  it('names the measure by its title where the model gives one', () => {
    render(<Kpi spec={spec({ titles: { [COUNT]: 'Orders Count' } })} />);

    expect(screen.getByTestId('kpi-label').textContent).toBe('Orders Count');
  });

  /**
   * T403, AC-220 as amended (R16): a KPI's one measure is one cube's, so its
   * source is evident and its label is the short title. `Fails when: … a
   * one-source chart's … KPI label repeats the source's title.`
   */
  it('names the measure by its short title, its cube being evident', () => {
    render(
      <Kpi
        spec={spec({ titles: { [COUNT]: 'Orders Count' }, shortTitles: { [COUNT]: 'Count' } })}
      />,
    );

    expect(screen.getByTestId('kpi-label').textContent).toBe('Count');
  });

  it('reads the value Cube sent, which is a string over JSON', () => {
    render(<Kpi spec={spec({ rows: [{ [COUNT]: '80' }] })} />);

    // Trusting the raw value would print "80" here but sort and scale it as
    // text everywhere else, so the conversion has to be real.
    expect(screen.getByTestId('kpi-value').textContent).toBe('80');
  });

  it('groups a large number rather than printing a wall of digits', () => {
    render(<Kpi spec={spec({ rows: [{ [COUNT]: 9876543 }] })} />);

    expect(screen.getByTestId('kpi-value').textContent).toBe('9,876,543');
  });
});

/**
 * T453 / AC-097, direction.md §7a: "KPI tiles: a 'Marked $X · p%' badge (no %
 * for non-additive measures)" — the default marking's marked share, which
 * T388 answers apart. The percentage rounded, as the prototype's is
 * (`dashboard.js`, renderMarked).
 */
describe('a KPI under a marking', () => {
  const AVERAGE = 'orders.average_amount';
  const marked = (
    share: RenderSpec['rows'],
    aggTypes: Record<string, string>,
    over: Partial<RenderSpec> = {},
  ) =>
    spec({
      rows: [{ [COUNT]: 1234 }],
      marking: {
        predicate: { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] },
        colour: '#151107',
        share,
        aggTypes,
      },
      ...over,
    });

  it('shows the marked share of an additive measure, and its part of the whole', () => {
    render(<Kpi spec={marked([{ [COUNT]: '400' }], { [COUNT]: 'count' })} />);

    expect(screen.getByTestId('kpi-marked').textContent).toBe('Marked 400 · 32%');
    // In the marking's colour, which the words don't depend on.
    expect(screen.getByTestId('kpi-marked-swatch').style.background).toBe('rgb(21, 17, 7)');
  });

  it('shows a non-additive measure’s marked value, and no part of the whole', () => {
    render(
      <Kpi
        spec={marked(
          [{ [AVERAGE]: '16.25' }],
          { [AVERAGE]: 'avg' },
          {
            encoding: { y: [AVERAGE] },
            rows: [{ [AVERAGE]: '40' }],
            formats: { [AVERAGE]: 'currency' },
          },
        )}
      />,
    );

    expect(screen.getByTestId('kpi-marked').textContent).toBe('Marked $16.25');
  });

  it('shows none of an additive measure marked as nothing, not as no value', () => {
    // A sum with no marked value: none of the whole is marked.
    render(<Kpi spec={marked([{ [COUNT]: null }], { [COUNT]: 'sum' })} />);

    expect(screen.getByTestId('kpi-marked').textContent).toBe('Marked 0 · 0%');
  });

  it('shows nothing of a non-additive measure with no marked value', () => {
    render(
      <Kpi
        spec={marked(
          [{ [AVERAGE]: null }],
          { [AVERAGE]: 'avg' },
          {
            encoding: { y: [AVERAGE] },
            rows: [{ [AVERAGE]: '40' }],
          },
        )}
      />,
    );

    expect(screen.queryByTestId('kpi-marked')).toBeNull();
  });

  it('shows nothing until the marked share is answered', () => {
    render(
      <Kpi
        spec={spec({
          marking: {
            predicate: { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] },
            colour: '#151107',
          },
        })}
      />,
    );

    expect(screen.queryByTestId('kpi-marked')).toBeNull();
    expect(screen.getByTestId('kpi-value').textContent).toBe('1,234');
  });
});

describe('a KPI with nothing to show', () => {
  it('says so when the query returned no rows', () => {
    render(<Kpi spec={spec({ rows: [] })} />);

    // An empty result is not zero. Printing 0 would assert a measurement that
    // was never made.
    expect(screen.queryByTestId('kpi-value')).toBeNull();
    expect(screen.getByTestId('kpi-empty')).toBeTruthy();
  });

  it('says so when the row does not carry the measure', () => {
    render(<Kpi spec={spec({ rows: [{ 'orders.total': 5 }] })} />);

    expect(screen.getByTestId('kpi-empty')).toBeTruthy();
  });

  it('says so when the value is not a number', () => {
    render(<Kpi spec={spec({ rows: [{ [COUNT]: 'n/a' }] })} />);

    expect(screen.getByTestId('kpi-empty')).toBeTruthy();
  });

  it('says so when no measure is bound at all', () => {
    render(<Kpi spec={spec({ encoding: {} })} />);

    expect(screen.getByTestId('kpi-empty')).toBeTruthy();
  });
});

/**
 * T936 / AC-564: … a KPI with none of the new wells set, a KPI saved before
 * R81 included, SHALL draw exactly as before, with no change line, sparkline
 * or target, and its "Marked $X · p%" badge.
 * `Fails when: … a KPI with none set gains a change line, a sparkline, a
 * target or a new layout.`
 */
/**
 * T937 / AC-565: WHEN a KPI has Compare to, Target or Time set, THE SYSTEM
 * SHALL draw its value in `text-kpi-solo` (40/52) alone …; its change as
 * R80's Change element …, then "vs ‹period› (‹value›)" …, the comparison
 * coming from Cube's `compareDateRange` for Previous period and Same period
 * last year. Cube answers one row per period, in order, each tagged with its
 * range (`loadTile`'s `oneAnswer`).
 */
describe('a KPI compared (T937, AC-565)', () => {
  const time = { member: 'orders.ordered_at', granularity: 'month' };
  const OCT = '2026-10-01T00:00:00.000 - 2026-10-31T23:59:59.999';
  const SEP = '2026-09-01T00:00:00.000 - 2026-09-30T23:59:59.999';

  it('compares this period’s value with the previous one’s, naming both periods', () => {
    render(
      <Kpi
        spec={spec({
          rows: [
            { [COUNT]: '31', compareDateRange: OCT },
            { [COUNT]: '29', compareDateRange: SEP },
          ],
          options: { kpi: { compareTo: { kind: 'previousPeriod' }, time } },
        })}
      />,
    );
    expect(screen.getByTestId('kpi-value').textContent).toBe('31');
    expect(screen.getByTestId('kpi-period').textContent).toBe('Oct 2026');
    expect(screen.getByTestId('kpi-change').textContent).toBe('▲ +6.9% vs Sep 2026 (29)');
    // Alone, with a setting of R81's: text-kpi-solo.
    expect(screen.getByTestId('kpi').classList.contains('kpi--detailed')).toBe(true);
  });

  it('compares with Same period last year as Cube answers it, coloured by Direction', () => {
    render(
      <Kpi
        spec={spec({
          rows: [
            { [COUNT]: '31', compareDateRange: OCT },
            {
              [COUNT]: '40',
              compareDateRange: '2025-10-01T00:00:00.000 - 2025-10-31T23:59:59.999',
            },
          ],
          options: { kpi: { compareTo: { kind: 'samePeriodLastYear' }, time, direction: 'lower' } },
        })}
      />,
    );
    const change = screen.getByTestId('kpi-change');
    expect(change.textContent).toBe('▼ −22.5% vs Oct 2025 (40) · lower is better');
    expect(change.querySelector('.text-change')?.getAttribute('data-tone')).toBe('success');
  });

  it('compares with another measure by its title, and with a value by itself', () => {
    const { unmount } = render(
      <Kpi
        spec={spec({
          rows: [{ [COUNT]: '31', 'orders.target_count': '25' }],
          titles: { 'orders.target_count': 'Target count' },
          options: { kpi: { compareTo: { kind: 'measure', member: 'orders.target_count' } } },
        })}
      />,
    );
    expect(screen.getByTestId('kpi-change').textContent).toBe('▲ +24.0% vs Target count (25)');
    // No Time: no period to name.
    expect(screen.queryByTestId('kpi-period')).toBeNull();
    unmount();
    render(
      <Kpi
        spec={spec({
          rows: [{ [COUNT]: '31' }],
          options: { kpi: { compareTo: { kind: 'value', value: 40 }, direction: 'neutral' } },
        })}
      />,
    );
    expect(screen.getByTestId('kpi-change').textContent).toBe('▼ −22.5% vs 40');
  });
});

describe('a KPI with none of R81’s settings (AC-564)', () => {
  const marked: Partial<RenderSpec> = {
    marking: {
      predicate: { items: [[{ member: 'orders.status', value: 'shipped' }]], ranges: [] },
      colour: '#151107',
      share: [{ [COUNT]: '617' }],
      aggTypes: { [COUNT]: 'count' },
    },
  };
  const cases: [string, Partial<RenderSpec>][] = [
    ['a value', {}],
    ['a value in its format', { rows: [{ [COUNT]: 0.1234 }], formats: { [COUNT]: '.1~%' } }],
    ['a value under a marking', marked],
    ['no rows', { rows: [] }],
    ['a value that is no number', { rows: [{ [COUNT]: 'n/a' }] }],
  ];

  for (const [name, over] of cases) {
    it(`draws ${name} exactly as before, whether its options hold an empty \`kpi\` or none`, () => {
      const before = render(<Kpi spec={spec(over)} />);
      const html = before.container.innerHTML;
      before.unmount();
      for (const options of [{ kpi: {} }, { kpi: { direction: 'higher' } }, { legend: 'top' }]) {
        const after = render(<Kpi spec={spec({ ...over, options })} />);
        expect(after.container.innerHTML).toBe(html);
        for (const part of ['kpi-change', 'kpi-trend', 'kpi-target'])
          expect(screen.queryByTestId(part)).toBeNull();
        after.unmount();
      }
    });
  }
});
