import { emptySpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WELLS, Wells, rejectionReason } from './Wells';
import type { Member } from './fields';

/**
 * AC-027: WHILE a field is being dragged, THE SYSTEM SHALL mark each well as
 * legal or illegal for it and give a reason for every illegal well.
 * Fails when: an illegal well accepts the drop, or gives no reason.
 *
 * Both halves are load-bearing: a well that shows a reason but still takes the
 * drop fails, and so does one that refuses silently.
 */
const measure: Member = {
  name: 'orders.count',
  title: 'Orders Count',
  shortTitle: 'Count',
  kind: 'measure',
  type: 'number',
  cube: 'orders',
  aggType: 'count',
};

const timeDimension: Member = {
  name: 'orders.ordered_at',
  title: 'Orders Ordered at',
  shortTitle: 'Ordered at',
  kind: 'timeDimension',
  type: 'time',
  cube: 'orders',
};

const wellsFor = (dragging: Member | null) =>
  render(
    <Wells
      spec={emptySpec('orders')}
      available={[measure, timeDimension]}
      onAdd={vi.fn()}
      onRemove={vi.fn()}
      dragging={dragging}
    />,
  );

describe('marking wells during a drag (AC-027)', () => {
  it('marks nothing while no drag is happening', () => {
    wellsFor(null);

    for (const well of WELLS) {
      expect(screen.getByTestId(`well-${well.name}`).getAttribute('data-drop')).toBeNull();
    }
  });

  it('marks the matching well legal and the others illegal', () => {
    wellsFor(measure);

    expect(screen.getByTestId('well-measures').getAttribute('data-drop')).toBe('legal');
    expect(screen.getByTestId('well-dimensions').getAttribute('data-drop')).toBe('illegal');
    expect(screen.getByTestId('well-timeDimensions').getAttribute('data-drop')).toBe('illegal');
  });

  it('gives a reason for every illegal well, and none for the legal one', () => {
    wellsFor(measure);

    expect(screen.getByTestId('reason-dimensions')).toBeTruthy();
    expect(screen.getByTestId('reason-timeDimensions')).toBeTruthy();
    expect(screen.queryByTestId('reason-measures')).toBeNull();
  });

  it('names both sides in the reason, not just that it is not allowed', () => {
    wellsFor(timeDimension);

    const reason = screen.getByTestId('reason-measures').textContent ?? '';
    // What the well takes...
    expect(reason).toMatch(/measure/i);
    // ...and what this field is.
    expect(reason).toMatch(/Ordered at/);
    expect(reason).toMatch(/time dimension/i);
  });

  it('describes the illegal well by its reason for assistive technology', () => {
    wellsFor(measure);

    const well = screen.getByTestId('well-dimensions');
    expect(well.getAttribute('aria-describedby')).toBe('well-dimensions-reason');
  });

  it('routes a time dimension to the time well, not the dimensions well', () => {
    wellsFor(timeDimension);

    expect(screen.getByTestId('well-timeDimensions').getAttribute('data-drop')).toBe('legal');
    expect(screen.getByTestId('well-dimensions').getAttribute('data-drop')).toBe('illegal');
  });
});

/**
 * AC-026 and rule 11: every well can be filled from a keyboard-reachable "+"
 * picker — since T257 the prototype's inline "+ metric" button and its menu.
 */
describe('each well’s "+" picker (AC-026)', () => {
  it('offers what the well takes and does not hold, and adds the one chosen', async () => {
    const onAdd = vi.fn();
    const total: Member = { ...measure, name: 'orders.total', title: 'Orders Total' };
    render(
      <Wells
        spec={{ ...emptySpec('orders'), measures: ['orders.count'] }}
        available={[measure, total, timeDimension]}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    );
    const add = screen.getByRole('button', { name: 'Add to Metrics' });
    expect(add.textContent).toBe('+ metric');

    await userEvent.click(add);
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(items).toEqual(['ΣOrders Total']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Orders Total' }));
    expect(onAdd).toHaveBeenCalledWith('measures', 'orders.total');
  });

  it('says so when the well can take nothing more', async () => {
    render(
      <Wells
        spec={{ ...emptySpec('orders'), measures: ['orders.count'] }}
        available={[measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add to Metrics' }));
    const none = screen.getByRole('menuitem', { name: 'Nothing more to add from this cube' });
    expect(none.getAttribute('aria-disabled')).toBe('true');
  });

  /** T467, UX-063: until a cube or view is chosen there is nothing to add, and the wells say why. */
  it('is disabled until a cube or view is chosen, saying so', () => {
    const { rerender } = render(
      <Wells spec={emptySpec('')} available={[]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    const adds = ['Add to Metrics', 'Add to Dimensions', 'Add to Time', 'Add a filter'].map(
      (name) => screen.getByRole('button', { name }),
    );

    for (const add of adds) {
      expect((add as HTMLButtonElement).disabled).toBe(true);
      // Described by the note, so a screen reader hears why.
      const note = document.getElementById(add.getAttribute('aria-describedby') ?? '');
      expect(note?.textContent).toBe('Choose a cube or view first.');
    }
    expect(screen.getAllByText('Choose a cube or view first.')).toHaveLength(1);

    rerender(
      <Wells spec={emptySpec('orders')} available={[measure]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    for (const name of ['Add to Metrics', 'Add to Dimensions', 'Add to Time', 'Add a filter']) {
      const add = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(add.disabled).toBe(false);
      expect(add.getAttribute('aria-describedby')).toBeNull();
    }
    expect(screen.queryByText('Choose a cube or view first.')).toBeNull();
  });
});

describe('rejectionReason', () => {
  const measuresWell = WELLS.find((well) => well.name === 'measures')!;

  it('is null when the well takes the field', () => {
    expect(rejectionReason(measuresWell, measure)).toBeNull();
  });

  it('is null when nothing is being dragged', () => {
    expect(rejectionReason(measuresWell, null)).toBeNull();
  });

  it('explains the mismatch otherwise', () => {
    // The well as the prototype names it (AC-216): Metrics.
    expect(rejectionReason(measuresWell, timeDimension)).toContain('Metrics takes a measure');
  });
});

/**
 * T229 / AC-216: THE SYSTEM SHALL show each field in a well by its title with
 * a tag for its aggregation or its time granularity, let the user change a
 * time field's granularity from its pill, and offer a Filters well and a Top N
 * setting beside the Metrics, Dimensions and Time wells.
 * `Fails when: a pill shows a member's internal name, a time field's
 * granularity cannot be changed from its pill, or the Filters well is missing.`
 */
describe('the wells’ pills, Filters and Top N (AC-216)', () => {
  // A stub a failing test leaves behind must not answer the next one's fetch.
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const status: Member = {
    name: 'orders.status',
    title: 'Orders Status',
    shortTitle: 'Status',
    kind: 'dimension',
    type: 'string',
    cube: 'orders',
  };
  const spec = {
    ...emptySpec('orders'),
    measures: ['orders.count'],
    timeDimensions: ['orders.ordered_at'],
    granularities: { 'orders.ordered_at': 'month' as const },
  };
  const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

  /**
   * T403, AC-220: "Where the member's cube or view is evident (a pill, a
   * legend or a KPI label of a one-source chart), it SHALL use the member's
   * short title". Every member here is Orders', so "Count", not "Orders
   * Count" (UX-061's "Orders Count" beside its "count" tag).
   */
  it('shows each field by its short title in a one-source chart, a measure with its aggregation', () => {
    render(
      <Wells spec={spec} available={[measure, timeDimension]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    const pill = screen.getByTestId('in-measures-orders.count');
    expect(pill.querySelector('.pill__title')?.textContent).toBe('Count');
    expect(pill.textContent).toContain('count');
    expect(pill.textContent).not.toContain('orders.count');
    expect(screen.getByRole('button', { name: 'Remove Count from Metrics' })).toBeTruthy();
    expect(
      screen.getByTestId('in-timeDimensions-orders.ordered_at').querySelector('.pill__title')
        ?.textContent,
    ).toBe('Ordered at');
  });

  // T232's review / AC-220: a member of a cube other than the one chosen —
  // a saved chart over joined cubes — by its title too.
  it('names a member of another cube by its title', () => {
    render(
      <Wells
        spec={{ ...spec, dimensions: ['customers.country'] }}
        available={[measure, timeDimension]}
        titles={{ 'customers.country': 'Customers Country' }}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const pill = screen.getByTestId('in-dimensions-customers.country');
    expect(pill.textContent).toContain('Customers Country');
    expect(pill.textContent).not.toContain('customers.country');
    // Two cubes, so neither is evident: Orders' members by their full titles too (T403).
    expect(
      screen.getByTestId('in-measures-orders.count').querySelector('.pill__title')?.textContent,
    ).toBe('Orders Count');
  });

  it('changes a time field’s grain from its pill', async () => {
    const onGranularity = vi.fn();
    render(
      <Wells
        spec={spec}
        available={[measure, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onGranularity={onGranularity}
      />,
    );
    // Labelled as the pill reads: its short title, the chart being Orders' alone (T403).
    const grain = screen.getByLabelText('Grain of Ordered at');
    expect((grain as HTMLSelectElement).value).toBe('month');
    await userEvent.selectOptions(grain, 'quarter');
    expect(onGranularity).toHaveBeenCalledWith('orders.ordered_at', 'quarter');
  });

  it('adds a filter, and holds it to a value the member has', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ data: [{ 'orders.status': 'shipped' }, { 'orders.status': 'refunded' }] }),
      ),
    );
    const onFilters = vi.fn();
    const { rerender } = render(
      <QueryClientProvider client={client()}>
        <Wells
          spec={spec}
          available={[measure, timeDimension, status]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          onFilters={onFilters}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('well-filters')).toBeTruthy();
    // The well's "+ filter", the prototype's inline picker (T257).
    await userEvent.click(screen.getByRole('button', { name: 'Add a filter' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Orders Status' }));
    expect(onFilters).toHaveBeenLastCalledWith([
      { member: 'orders.status', operator: 'equals', values: [] },
    ]);

    rerender(
      <QueryClientProvider client={client()}>
        <Wells
          spec={{ ...spec, filters: [{ member: 'orders.status', operator: 'equals', values: [] }] }}
          available={[measure, timeDimension, status]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          onFilters={onFilters}
        />
      </QueryClientProvider>,
    );
    // Labelled as the pill reads: its short title, the chart being Orders' alone (T403).
    const value = screen.getByLabelText('Value of Status');
    await screen.findByRole('option', { name: 'refunded' });
    await userEvent.selectOptions(value, 'refunded');
    expect(onFilters).toHaveBeenLastCalledWith([
      { member: 'orders.status', operator: 'equals', values: ['refunded'] },
    ]);
  });

  it('offers the value a chart is held to even when the member no longer has it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [{ 'orders.status': 'shipped' }] })),
    );
    render(
      <QueryClientProvider client={client()}>
        <Wells
          spec={{
            ...spec,
            filters: [{ member: 'orders.status', operator: 'notEquals', values: ['retired'] }],
          }}
          available={[measure, status]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await screen.findByRole('option', { name: 'shipped' });
    // Never "any value" while the chart is filtered.
    expect((screen.getByLabelText('Value of Status') as HTMLSelectElement).value).toBe('retired');
    expect((screen.getByLabelText('How Status is held') as HTMLSelectElement).value).toBe(
      'notEquals',
    );
  });

  it('keeps the top N the reader sets down, all for none, and ignores what is not a count', async () => {
    const onTopN = vi.fn();
    const { rerender } = render(
      <Wells
        spec={spec}
        available={[measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onTopN={onTopN}
      />,
    );
    const box = screen.getByLabelText('Top N (+ Other)');
    // One change when set down, not one per keystroke.
    await userEvent.type(box, '15');
    expect(onTopN).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onTopN).toHaveBeenLastCalledWith(15);
    expect(onTopN).toHaveBeenCalledTimes(1);

    rerender(
      <Wells
        spec={spec}
        available={[measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onTopN={onTopN}
        topN={15}
      />,
    );
    await userEvent.clear(box);
    await userEvent.type(box, '3.5{Enter}');
    expect(onTopN).toHaveBeenCalledTimes(1);
    expect((box as HTMLInputElement).value).toBe('15');

    await userEvent.clear(box);
    await userEvent.keyboard('{Enter}');
    expect(onTopN).toHaveBeenLastCalledWith(undefined);
  });

  /**
   * T390, AC-041: the rest past the top N folded into "Other (n)" or dropped,
   * and a row limit that drops rows past it.
   */
  it('folds the rest into Other (n) by default, or leaves it out, once there is a top N', async () => {
    const onTail = vi.fn();
    const { rerender } = render(
      <Wells
        spec={spec}
        available={[measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onTail={onTail}
      />,
    );
    // A segmented control, as direction.md's inspector fields have it.
    const group = screen.getByRole('group', { name: 'The rest' });
    // Nothing to fold or leave out without a top N.
    const choices = within(group).getAllByRole('button');
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Fold into “Other (n)”',
      'Leave out',
    ]);
    for (const choice of choices) expect((choice as HTMLButtonElement).disabled).toBe(true);

    const withTopN = (tail?: 'drop') => (
      <Wells
        spec={spec}
        available={[measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        topN={5}
        tail={tail}
        onTail={onTail}
      />
    );
    rerender(withTopN());
    const fold = within(group).getByRole('button', { name: 'Fold into “Other (n)”' });
    const leaveOut = within(group).getByRole('button', { name: 'Leave out' });
    expect(fold.getAttribute('aria-pressed')).toBe('true');
    expect(leaveOut.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(leaveOut);
    expect(onTail).toHaveBeenLastCalledWith('drop');

    // And back (T390's review).
    rerender(withTopN('drop'));
    expect(leaveOut.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(fold);
    expect(onTail).toHaveBeenLastCalledWith(undefined);
  });

  it('sets a row limit down as one change, and clears it back to none', async () => {
    const onRowLimit = vi.fn();
    const { rerender } = render(
      <Wells
        spec={spec}
        available={[measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onRowLimit={onRowLimit}
      />,
    );
    const limit = screen.getByLabelText('Result limit');
    await userEvent.type(limit, '20');
    expect(onRowLimit).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onRowLimit).toHaveBeenLastCalledWith(20);

    rerender(
      <Wells
        spec={spec}
        available={[measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        rowLimit={20}
        onRowLimit={onRowLimit}
      />,
    );
    await userEvent.clear(limit);
    await userEvent.keyboard('{Enter}');
    expect(onRowLimit).toHaveBeenLastCalledWith(undefined);
  });
});

/**
 * AC-047: WHEN the user opens the menu on a measure in the chart editor, THE
 * SYSTEM SHALL offer % of total, difference from previous period, % difference
 * from previous period, running total, rank and moving average.
 * Fails when: any of the six is missing from the menu.
 *
 * The menu is the measure pill's: here, that each measure in Metrics carries
 * it, applies what is chosen to that measure, and names what is applied.
 */
describe('the menu on a measure pill (AC-047)', () => {
  const amount: Member = {
    name: 'orders.total_amount',
    title: 'Orders Total amount',
    shortTitle: 'Total amount',
    kind: 'measure',
    type: 'number',
    cube: 'orders',
    aggType: 'sum',
  };
  const spec = { ...emptySpec('orders'), measures: ['orders.count', 'orders.total_amount'] };

  it('is on each measure in Metrics, by the measure’s title', () => {
    render(
      <Wells
        spec={spec}
        available={[measure, amount]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={vi.fn()}
      />,
    );

    expect(
      within(screen.getByTestId('in-measures-orders.count')).getByRole('button', {
        name: 'Calculations on Count',
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId('in-measures-orders.total_amount')).getByRole('button', {
        name: 'Calculations on Total amount',
      }),
    ).toBeTruthy();
  });

  it('applies the one chosen to that measure', async () => {
    const onCalculation = vi.fn();
    render(
      <Wells
        spec={spec}
        available={[measure, amount]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={onCalculation}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Calculations on Total amount' }));
    await userEvent.click(screen.getByRole('menuitem', { name: '% of total' }));

    expect(onCalculation).toHaveBeenCalledWith('orders.total_amount', { kind: 'percentOfTotal' });
  });

  it('names the calculation applied on its measure’s pill, and only there', () => {
    render(
      <Wells
        spec={{ ...spec, calculations: { 'orders.count': { kind: 'runningTotal' } } }}
        available={[measure, amount]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={vi.fn()}
      />,
    );

    expect(screen.getByTestId('in-measures-orders.count').textContent).toContain('Running total');
    expect(screen.getByTestId('in-measures-orders.total_amount').textContent).not.toContain(
      'Running total',
    );
    expect(screen.getByTestId('in-measures-orders.total_amount').textContent).toContain('sum');
  });

  /**
   * AC-049: WHEN a quick calculation needs a time dimension and the chart has
   * none, THE SYSTEM SHALL disable it and say which field is missing.
   * Fails when: the calculation is offered and produces an error, or gives no
   * reason when disabled.
   */
  it('disables the calculations over time on a chart with no time field, naming the one to add (AC-049)', async () => {
    const onCalculation = vi.fn();
    render(
      <Wells
        spec={spec}
        available={[measure, amount, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={onCalculation}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Calculations on Count' }));
    for (const name of [
      'Difference from previous period',
      '% difference from previous period',
      'Running total',
      'Moving average, 3 periods',
    ]) {
      const item = screen.getByRole('menuitem', {
        name,
        description: 'Needs a time field in Time: add Ordered at.',
      });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(item.textContent).toContain('Needs a time field in Time: add Ordered at.');
    }
    expect(
      screen.getByRole('menuitem', { name: '% of total' }).getAttribute('aria-disabled'),
    ).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Running total' }));
    expect(onCalculation).not.toHaveBeenCalled();
  });

  it('offers them once the chart has a time field', async () => {
    render(
      <Wells
        spec={{ ...spec, timeDimensions: ['orders.ordered_at'] }}
        available={[measure, amount, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Calculations on Count' }));
    expect(
      screen.getByRole('menuitem', { name: 'Running total' }).getAttribute('aria-disabled'),
    ).toBeNull();
  });

  /**
   * R46: a calculation that would be wrong for the measure's type is
   * disabled, with the reason (research `xcube-quick-calcs.md`, "Which types
   * take which calculation").
   */
  it('disables, with the reason, what is wrong for an average, and offers the rest', async () => {
    const average: Member = {
      name: 'orders.average_amount',
      title: 'Orders Average amount',
      shortTitle: 'Average amount',
      kind: 'measure',
      type: 'number',
      cube: 'orders',
      aggType: 'avg',
    };
    const onCalculation = vi.fn();
    render(
      <Wells
        spec={{
          ...spec,
          measures: ['orders.average_amount'],
          timeDimensions: ['orders.ordered_at'],
        }}
        available={[average, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={onCalculation}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Calculations on Average amount' }));
    for (const [name, why] of [
      ['% of total', 'Not for an average: its values don’t add up to a total.'],
      ['Running total', 'Not for an average: adding up its periods gives no true total.'],
      [
        'Moving average, 3 periods',
        'Not for an average: averaging its periods gives no true average.',
      ],
    ] as const) {
      const item = screen.getByRole('menuitem', { name, description: why });
      expect(item.getAttribute('aria-disabled')).toBe('true');
      expect(item.textContent).toContain(why);
    }
    for (const name of ['Difference from previous period', 'Rank'])
      expect(screen.getByRole('menuitem', { name }).getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Running total' }));
    expect(onCalculation).not.toHaveBeenCalled();
  });

  /**
   * R45.4: with the chart's last time field taken out, a calculation over
   * time stays chosen but paused: the chart draws the plain measure, with a
   * note naming the field it needs.
   */
  it('says a calculation over time is paused, and what it needs, while the chart has no time field', () => {
    render(
      <Wells
        spec={{ ...spec, calculations: { 'orders.count': { kind: 'runningTotal' } } }}
        available={[measure, amount, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={vi.fn()}
      />,
    );

    // Still chosen, on its pill.
    expect(screen.getByTestId('in-measures-orders.count').textContent).toContain('Running total');
    expect(screen.getByTestId('calc-paused-orders.count').textContent).toBe(
      'Running total on Count is paused, so Count is drawn as it is. Needs a time field in Time: add Ordered at.',
    );
  });

  it('says nothing is paused once the chart has a time field again', () => {
    render(
      <Wells
        spec={{
          ...spec,
          timeDimensions: ['orders.ordered_at'],
          calculations: { 'orders.count': { kind: 'runningTotal' } },
        }}
        available={[measure, amount, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('calc-paused-orders.count')).toBeNull();
  });
});

/**
 * T400 (AC-314): WHEN the user sets a box plot's "Each point is" field (for
 * example Order ID), THE SYSTEM SHALL compute the measure once per value of
 * that field within each category, and draw the boxes from those values.
 * The field itself: offered for a box plot, one dimension, set and cleared.
 */
describe('a box plot’s "Each point is" (AC-314)', () => {
  const dimensionNamed = (name: string, title: string): Member => ({
    name,
    title,
    shortTitle: title,
    kind: 'dimension',
    type: 'string',
    cube: name.split('.')[0]!,
  });
  const status = dimensionNamed('orders.status', 'Orders Status');
  const orderId = dimensionNamed('orders.id', 'Orders Id');
  const customer = dimensionNamed('customers.name', 'Customers Name');
  const boxSpec = {
    ...emptySpec('orders'),
    measures: ['orders.count'],
    dimensions: ['orders.status'],
    chartType: 'boxplot' as const,
  };
  const boxWells = (
    eachPointIs:
      { member: string | undefined; onChange: (member: string | undefined) => void } | undefined,
  ) =>
    render(
      <Wells
        spec={
          eachPointIs?.member === undefined
            ? boxSpec
            : { ...boxSpec, eachPointIs: eachPointIs.member }
        }
        available={[measure, status, orderId, customer, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        {...(eachPointIs === undefined ? {} : { eachPointIs })}
      />,
    );

  it('is not there for a chart that isn’t a box plot', () => {
    boxWells(undefined);
    expect(screen.queryByTestId('well-eachPointIs')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Each point is' })).toBeNull();
  });

  it('offers the dimensions not already the category, and sets the one picked', async () => {
    const onChange = vi.fn();
    boxWells({ member: undefined, onChange });
    expect(screen.getByRole('heading', { name: 'Each point is' })).toBeTruthy();
    // Unset, each row is a point, and the well says so.
    expect(screen.getByTestId('well-eachPointIs').textContent).toContain('Each row');

    await userEvent.click(screen.getByTestId('add-eachPointIs'));
    const offered = screen.getAllByRole('menuitem').map((item) => item.getAttribute('data-testid'));
    expect(offered).toEqual(['pick-orders.id', 'pick-customers.name']);
    await userEvent.click(screen.getByTestId('pick-customers.name'));
    expect(onChange).toHaveBeenCalledWith('customers.name');
  });

  it('sits below the value, before Dimensions (direction.md, Box plot)', () => {
    boxWells({ member: undefined, onChange: vi.fn() });
    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
    expect(headings.slice(0, 3)).toEqual(['Metrics', 'Each point is', 'Dimensions']);
  });

  it('holds one field, shown by its title, and clears to each row a point', async () => {
    const onChange = vi.fn();
    boxWells({ member: 'orders.id', onChange });
    const well = screen.getByTestId('well-eachPointIs');
    expect(screen.getByTestId('in-eachPointIs-orders.id').textContent).toContain('Orders Id');
    // One field: no "+" while it holds one.
    expect(screen.queryByTestId('add-eachPointIs')).toBeNull();
    expect(well.textContent).not.toContain('Each row');

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Orders Id from Each point is' }),
    );
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
