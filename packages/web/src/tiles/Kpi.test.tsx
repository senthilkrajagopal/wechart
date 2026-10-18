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
