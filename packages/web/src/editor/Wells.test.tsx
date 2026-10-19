import { emptySpec, undrawnMeasures, type ChartSpec, type RenderSpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WELLS, Wells, rejectionReason, type WellsProps } from './Wells';
import { addToWellAs } from './combo/comboWells';
import { undrawnWell } from './combo/undrawnWell';
import type { Member } from './fields';
import { TYPE_WELLS, type TypeWellsProps } from './wells/registry';

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
    // Design 01 state A's picker (T688, EDI-11): a filter over the fields by
    // cube, the one held marked "✓ in chart" and not offered again.
    const list = screen.getByRole('listbox', { name: 'Fields' });
    const options = within(list).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'ΣOrders Count✓ in chartcount',
      'ΣOrders Totalcount',
    ]);
    expect(options[0]!.getAttribute('aria-disabled')).toBe('true');
    expect(options[1]!.getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(within(list).getByRole('option', { name: /Orders Total/ }));
    expect(onAdd).toHaveBeenCalledWith('measures', 'orders.total');
  });

  it('adds nothing for a field already in the chart, and says so', async () => {
    const onAdd = vi.fn();
    render(
      <Wells
        spec={{ ...emptySpec('orders'), measures: ['orders.count'] }}
        available={[measure]}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add to Metrics' }));
    const held = screen.getByRole('option', { name: /Orders Count/ });
    expect(held.getAttribute('aria-disabled')).toBe('true');
    expect(held.textContent).toContain('✓ in chart');
    await userEvent.click(held);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('filters the fields as typed, groups them by cube, joined ones “· via join”, and says its keys (T688, EDI-11)', async () => {
    const onAdd = vi.fn();
    const country: Member = {
      name: 'customers.country',
      title: 'Customers Country',
      shortTitle: 'Country',
      kind: 'dimension',
      type: 'string',
      cube: 'customers',
    };
    const status: Member = {
      ...country,
      name: 'orders.status',
      title: 'Orders Status',
      cube: 'orders',
    };
    render(
      <Wells
        spec={emptySpec('orders')}
        available={[measure, status, country]}
        joined={['customers']}
        cubeTitles={{ orders: 'Orders', customers: 'Customers' }}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add to Dimensions' }));
    const list = screen.getByRole('listbox', { name: 'Fields' });
    expect(
      within(list)
        .getAllByRole('group')
        .map((group) => group.getAttribute('aria-label')),
    ).toEqual(['Orders', 'Customers · via join']);
    expect(screen.getByText('↑ ↓ move · Enter adds · Esc closes')).toBeTruthy();
    const filter = screen.getByRole('combobox', { name: 'Filter fields' });
    expect(document.activeElement).toBe(filter);
    await userEvent.type(filter, 'coun');
    expect(
      within(list)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['AaCustomers Countrystring']);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onAdd).toHaveBeenCalledWith('dimensions', 'customers.country');
  });

  it('opens at its well’s left edge, not its button’s, as design 01 state A draws it (T688’s review)', async () => {
    const box = (left: number) =>
      ({
        left,
        right: left + 100,
        top: 40,
        bottom: 72,
        width: 100,
        height: 32,
        x: left,
        y: 40,
      }) as DOMRect;
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return box(this.classList.contains('well') ? 24 : 180);
    });
    try {
      render(
        <Wells
          spec={emptySpec('orders')}
          available={[measure]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Add to Metrics' }));
      const pop = document.querySelector<HTMLElement>('.cube-picker__pop--fields');
      expect(pop?.style.left).toBe('24px');
    } finally {
      rect.mockRestore();
    }
  });

  /**
   * T936 follow-up (the real-Chrome run): with a KPI's wells after Metrics,
   * Dimensions sits low in a 900 px window, and its picker opened under it
   * ran past the window's foot, its fields out of reach. It opens above its
   * button where it doesn't fit below, and is never placed past the foot.
   */
  it('opens above its button where it wouldn’t fit below, within the window', async () => {
    const box = (top: number, height: number) =>
      ({
        left: 24,
        right: 124,
        top,
        bottom: top + height,
        width: 100,
        height,
        x: 24,
        y: top,
      }) as DOMRect;
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      // The list itself 300 px tall; the button near the foot of an 800 px window.
      return this.classList.contains('cube-picker__pop') ? box(0, 300) : box(700, 32);
    });
    const height = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    try {
      render(
        <Wells
          spec={emptySpec('orders')}
          available={[measure]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Add to Metrics' }));
      const pop = document.querySelector<HTMLElement>('.cube-picker__pop--fields');
      // Above the button (700 − 4 − 300), not under it at 736.
      expect(pop?.style.top).toBe('396px');
    } finally {
      rect.mockRestore();
      height.mockRestore();
    }
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

/**
 * T688 (AC-352; design 01 pin 6 and 02:283; the critique's EDI-09): the
 * wells' labels as drawn, the parenthesis quieter; "+ time dimension"; and a
 * dimension's pill tagged with the channel it is drawn on.
 */
describe('the wells’ words and tags as design 01 draws them (T688, EDI-09)', () => {
  const status: Member = {
    name: 'orders.status',
    title: 'Orders Status',
    shortTitle: 'Status',
    kind: 'dimension',
    type: 'string',
    cube: 'orders',
  };

  it('labels Dimensions “(group by)” and Top N “(+ Other)”, each parenthesis apart, and Time’s “+ time dimension”', () => {
    render(
      <Wells spec={emptySpec('orders')} available={[measure]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    const dimensions = screen.getByRole('heading', { name: 'Dimensions (group by)' });
    expect(dimensions.querySelector('.well-field__opt')?.textContent).toBe('(group by)');
    expect(screen.getByRole('button', { name: 'Add to Time' }).textContent).toBe(
      '+ time dimension',
    );
    const topN = screen.getByText('(+ Other)');
    expect(topN.className).toBe('well-field__opt');
    expect(screen.getByLabelText('Top N (+ Other)')).toBeTruthy();
  });

  it('tags a dimension’s pill with the channel it is drawn on', () => {
    render(
      <Wells
        spec={{ ...emptySpec('orders'), measures: ['orders.count'], dimensions: ['orders.status'] }}
        available={[measure, status]}
        channels={{ 'orders.status': 'Y' }}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const pill = screen.getByTestId('in-dimensions-orders.status');
    expect(pill.querySelector('.pill__tag')?.textContent).toBe('Y');
    expect(pill.querySelector('.pill__tag')?.getAttribute('title')).toBe('Drawn on Y');
  });
});

/**
 * T688's review (AC-220; chart-editor-Q7): a field of a cube the chart holds
 * nothing of is named in full, its source not being evident; and a view's own
 * cubes are no joins, its fields' groups said without "· via join".
 */
describe('joined cubes’ fields, named and grouped (T688’s review)', () => {
  const signedUp: Member = {
    name: 'customers.signed_up_at',
    title: 'Customers Signed Up at',
    shortTitle: 'Signed Up at',
    kind: 'timeDimension',
    type: 'time',
    cube: 'customers',
  };

  it('names a joined cube’s field in full where the chart holds only another cube’s', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Wells
          spec={{ ...emptySpec('orders'), measures: ['orders.count'] }}
          available={[measure, timeDimension, signedUp]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          onCalculation={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Calculations on Count' }));
    expect(screen.getByRole('menuitem', { name: 'Running total' }).textContent).toContain(
      'Needs a time field in Time: add Ordered at or Customers Signed Up at.',
    );
  });

  it('groups a view’s fields by their cubes without “· via join”, and a joined cube’s with it', async () => {
    const country: Member = {
      name: 'customers.country',
      title: 'Customers Country',
      shortTitle: 'Country',
      kind: 'dimension',
      type: 'string',
      cube: 'customers',
    };
    const status: Member = {
      ...country,
      name: 'orders.status',
      title: 'Orders Status',
      cube: 'orders',
    };
    const { rerender } = render(
      <Wells
        spec={emptySpec('order_summary')}
        available={[status, country]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    const groups = () =>
      within(screen.getByRole('listbox', { name: 'Fields' }))
        .getAllByRole('group')
        .map((group) => group.getAttribute('aria-label'));
    await userEvent.click(screen.getByRole('button', { name: 'Add to Dimensions' }));
    // A cube with no title given is named in words, never its identifier (T229's review).
    expect(groups()).toEqual(['Orders', 'Customers']);
    await userEvent.keyboard('{Escape}');

    rerender(
      <Wells
        spec={emptySpec('orders')}
        available={[status, country]}
        joined={['customers']}
        cubeTitles={{ orders: 'Orders', customers: 'Customers' }}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add to Dimensions' }));
    expect(groups()).toEqual(['Orders', 'Customers · via join']);
  });
});

/**
 * T689 (EDI-10; design 01 pin 6; chart-editor-Q6): a measure's tag offers the
 * aggregations the model allows — its siblings over the same `sql` — the
 * current one checked; one chosen takes its place. A sibling the chart holds
 * already isn't offered.
 */
describe('a measure’s aggregations (T689, chart-editor-Q6)', () => {
  const total: Member = {
    name: 'orders.total_amount',
    title: 'Orders Total Amount',
    shortTitle: 'Total Amount',
    kind: 'measure',
    type: 'number',
    cube: 'orders',
    aggType: 'sum',
  };
  const average: Member = {
    ...total,
    name: 'orders.average_amount',
    title: 'Orders Average Amount',
    shortTitle: 'Average Amount',
    aggType: 'avg',
  };
  const largest: Member = {
    ...total,
    name: 'orders.largest_amount',
    title: 'Orders Largest Amount',
    shortTitle: 'Largest Amount',
    aggType: 'max',
  };

  it('lists the siblings by aggregation, the current one checked, and swaps to one chosen', async () => {
    const onSwap = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Wells
          spec={{
            ...emptySpec('orders'),
            measures: ['orders.total_amount', 'orders.largest_amount'],
          }}
          available={[total, average, largest]}
          siblings={{
            'orders.total_amount': ['orders.average_amount', 'orders.largest_amount'],
          }}
          onSwap={onSwap}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          onCalculation={vi.fn()}
        />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Calculations on Total Amount' }));
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios).toEqual([
      screen.getByRole('menuitemradio', { name: 'sum Total Amount' }),
      screen.getByRole('menuitemradio', { name: 'avg Average Amount' }),
    ]);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(radios[1]!);
    expect(onSwap).toHaveBeenCalledWith('orders.total_amount', 'orders.average_amount');
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
    // The fields' picker (T688, EDI-11): an option by its title, its type beside it.
    await userEvent.click(screen.getByRole('option', { name: /^Orders Status/ }));
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
    // Nothing to fold or leave out without a top N: not shown until one is
    // set (chart-editor-Q1, T688).
    expect(screen.queryByLabelText('The rest')).toBeNull();

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
    // A 28/12 native select in Sort by's row (chart-editor-Q1), in its full words.
    const rest = screen.getByLabelText('The rest') as HTMLSelectElement;
    expect(rest.tagName).toBe('SELECT');
    expect([...rest.options].map((option) => option.textContent)).toEqual([
      'Fold into Other (n)',
      'Leave out',
    ]);
    expect(rest.selectedOptions[0]?.textContent).toBe('Fold into Other (n)');
    await userEvent.selectOptions(rest, 'Leave out');
    expect(onTail).toHaveBeenLastCalledWith('drop');

    // And back (T390's review).
    rerender(withTopN('drop'));
    expect(rest.selectedOptions[0]?.textContent).toBe('Leave out');
    await userEvent.selectOptions(rest, 'Fold into Other (n)');
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

  /** T383 / AC-050: a calculation the menu can't express is requested from it, by measure. */
  it('asks for a calculation the menu can’t express on the measure whose menu it is', async () => {
    const onRequest = vi.fn();
    render(
      <Wells
        spec={spec}
        available={[measure, amount]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onCalculation={vi.fn()}
        onRequest={onRequest}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Calculations on Total amount' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Request a calculation…' }));

    expect(onRequest).toHaveBeenCalledWith('orders.total_amount');
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
    // Dimensions with design 01's "(group by)" since T688 (EDI-09).
    expect(headings.slice(0, 3)).toEqual(['Metrics', 'Each point is', 'Dimensions (group by)']);
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

/**
 * T510 (AC-036; UX-057, design 01-5; R67, the user): a metric the chosen
 * form doesn't draw is never silently missing. Its pill says "not drawn",
 * with why ("on another scale"), and a line under Metrics says it is in the
 * query and the results but not on the chart, offering Small multiples and
 * Table, which draw it, and Remove.
 */
describe('a metric the form doesn’t draw (T510)', () => {
  const amount: Member = {
    ...measure,
    name: 'orders.total_amount',
    title: 'Orders Total Amount',
    shortTitle: 'Total Amount',
    aggType: 'sum',
  };
  const spec = { ...emptySpec('orders'), measures: ['orders.total_amount', 'orders.count'] };

  it('says a metric on another scale is not drawn, and offers the forms that draw it', async () => {
    const onRemove = vi.fn();
    const onSmallMultiples = vi.fn();
    const onTable = vi.fn();
    render(
      <Wells
        spec={spec}
        available={[amount, measure]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        undrawn={{
          metrics: [{ member: 'orders.count', reason: 'scale' }],
          drawnAs: 'Bar',
          onSmallMultiples,
          onTable,
        }}
      />,
    );
    expect(screen.getByTestId('in-measures-orders.count').textContent).toContain(
      'not drawn · on another scale',
    );
    expect(screen.getByTestId('in-measures-orders.total_amount').textContent).not.toContain(
      'not drawn',
    );
    const line = screen.getByTestId('undrawn-metrics');
    expect(line.textContent).toContain(
      'Bar draws one scale. Count is on another scale than Total Amount: in the query and the results, but not on the chart.',
    );
    await userEvent.click(within(line).getByRole('button', { name: 'Small multiples' }));
    expect(onSmallMultiples).toHaveBeenCalledTimes(1);
    await userEvent.click(within(line).getByRole('button', { name: 'Table' }));
    expect(onTable).toHaveBeenCalledTimes(1);
    await userEvent.click(within(line).getByRole('button', { name: 'Remove Count' }));
    expect(onRemove).toHaveBeenCalledWith('measures', 'orders.count');
    // Its button goes with the metric: focus to Metrics' "+", not the page (T510's review).
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add to Metrics' }));
  });

  it('says how many a form draws, and offers no small multiples where they can’t draw them', () => {
    render(
      <Wells
        spec={spec}
        available={[amount, measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        undrawn={{
          metrics: [{ member: 'orders.count', reason: 'form' }],
          drawnAs: 'Pie',
          onTable: vi.fn(),
        }}
      />,
    );
    expect(screen.getByTestId('in-measures-orders.count').textContent).toContain('not drawn');
    expect(screen.getByTestId('in-measures-orders.count').textContent).not.toContain(
      'another scale',
    );
    const line = screen.getByTestId('undrawn-metrics');
    expect(line.textContent).toContain(
      'Pie draws one metric. Count is in the query and the results, but not on the chart.',
    );
    expect(within(line).queryByRole('button', { name: 'Small multiples' })).toBeNull();
    expect(within(line).getByRole('button', { name: 'Table' })).toBeTruthy();
  });

  it('offers a combo’s metric on another scale Draw on a right axis, first (AC-506)', async () => {
    const onRightAxis = vi.fn();
    render(
      <Wells
        spec={spec}
        available={[amount, measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        undrawn={{
          metrics: [{ member: 'orders.count', reason: 'scale' }],
          drawnAs: 'Combo',
          onSmallMultiples: vi.fn(),
          onTable: vi.fn(),
          onRightAxis,
        }}
      />,
    );
    const line = screen.getByTestId('undrawn-metrics');
    expect(
      within(line)
        .getAllByRole('button')
        .map((one) => one.textContent),
    ).toEqual(['Draw on a right axis', 'Small multiples', 'Table', 'Remove Count']);
    await userEvent.click(within(line).getByRole('button', { name: 'Draw on a right axis' }));
    expect(onRightAxis).toHaveBeenCalledWith('orders.count');
  });

  it('puts the metric on the right axis from that offer, its pill then ending in R (T854, AC-506)', async () => {
    /**
     * The wells over options held as the editor holds them, with the
     * editor's own wiring (`undrawnWell`, checkpoint 1's review): what's
     * undrawn is worked out from the drawn spec each time, as the editor
     * does, so the count is undrawn only while it's on the left.
     */
    function Combo() {
      const [options, setOptions] = useState<Record<string, unknown>>({});
      const onOptions = (patch: Readonly<Record<string, unknown>>) =>
        setOptions((current) => ({ ...current, ...patch }));
      const drawn: RenderSpec = {
        chartType: 'combo',
        encoding: { x: ['orders.ordered_at'], y: spec.measures },
        measures: spec.measures,
        rows: [],
        formats: { 'orders.total_amount': 'currency' },
        options,
      };
      return (
        <Wells
          spec={spec}
          available={[amount, measure]}
          onAdd={vi.fn()}
          onRemove={vi.fn()}
          combo={{ options, onOptions, onFormat: vi.fn() }}
          undrawn={undrawnWell({
            undrawn: undrawnMeasures(drawn),
            shownType: 'combo',
            options,
            onOptions,
            onSmallMultiples: undefined,
            onTable: vi.fn(),
          })}
        />
      );
    }
    render(<Combo />);
    const pill = screen.getByTestId('in-measures-orders.count');
    expect(within(pill).getByTestId('pill-axis').textContent).toBe('L');

    await userEvent.click(screen.getByRole('button', { name: 'Draw on a right axis' }));

    expect(within(pill).getByTestId('pill-axis').textContent).toBe('R');
    expect(pill.textContent).not.toContain('not drawn');
    expect(
      within(pill)
        .getByRole('button', { name: /Change mark or axis$/ })
        .getAttribute('aria-label'),
    ).toBe('Count: line, right axis. Change mark or axis');
    expect(screen.queryByTestId('undrawn-metrics')).toBeNull();
  });

  it('says nothing where every metric is drawn', () => {
    render(<Wells spec={spec} available={[amount, measure]} onAdd={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByTestId('undrawn-metrics')).toBeNull();
    expect(screen.getByTestId('well-measures').textContent).not.toContain('not drawn');
  });
});

/**
 * T934 / AC-217 (R81): … still letting the type be chosen, the editor then
 * highlighting the well it needs. And R81's wells live in `editor/wells/`,
 * one module per type, routed from here once, after Metrics (direction.md
 * §7i, "New wells").
 */
describe('R81’s wells, and the well a chosen type needs (T934)', () => {
  const Stub = ({ chartType, highlight }: TypeWellsProps) => (
    <section className="well-field" data-testid="stub-wells">
      {chartType} {highlight ?? 'none'}
    </section>
  );

  afterEach(() => {
    delete TYPE_WELLS.waterfall;
  });

  it('highlights the well named, and only it', () => {
    render(
      <Wells
        spec={emptySpec('orders')}
        available={[measure, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        highlight="timeDimensions"
      />,
    );
    expect(screen.getByTestId('well-timeDimensions').getAttribute('data-highlight')).toBe('true');
    expect(screen.getByTestId('well-measures').getAttribute('data-highlight')).toBeNull();
    expect(screen.getByTestId('well-dimensions').getAttribute('data-highlight')).toBeNull();
  });

  const own = (chartType: TypeWellsProps['chartType']) => ({
    chartType,
    available: [measure, timeDimension],
    options: {},
    onOptions: vi.fn(),
    titleOf: (name: string) => name,
  });

  // After Metrics, as design 23's sheets order a type's wells (T936 moved
  // them up from after Time: a KPI's follow Metrics, AC-564).
  it('draws a type’s own wells from its module, after Metrics, passing the highlight on', () => {
    TYPE_WELLS.waterfall = Stub;
    render(
      <Wells
        spec={emptySpec('orders')}
        available={[measure, timeDimension]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        highlight="target"
        typeWells={own('waterfall')}
      />,
    );
    const drawn = screen.getByTestId('stub-wells');
    expect(drawn.textContent).toBe('waterfall target');
    const metrics = screen.getByTestId('well-measures');
    expect(metrics.compareDocumentPosition(drawn) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByTestId('well-dimensions').compareDocumentPosition(drawn)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
    expect(screen.getByTestId('well-filters').compareDocumentPosition(drawn)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it('draws nothing more for a type with no module of its own', () => {
    render(
      <Wells
        spec={emptySpec('orders')}
        available={[measure]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        typeWells={own('bar')}
      />,
    );
    expect(screen.queryByTestId('stub-wells')).toBeNull();
  });
});

/**
 * T860 (AC-504, AC-505; design 20 screen 2 pins 4 to 7): a combo's Split by
 * well, one dimension across every measure, a second replacing the first;
 * its count against 8 and "‹dimension› shown"; and a measure past 8 series
 * not drawn, its pill and its row saying so, with the offers.
 */
describe("a combo's Split by well (T860)", () => {
  const member = (name: string, shortTitle: string, kind: Member['kind']): Member => ({
    name,
    title: `Orders ${shortTitle}`,
    shortTitle,
    kind,
    type: kind === 'measure' ? 'number' : kind === 'timeDimension' ? 'time' : 'string',
    cube: 'orders',
    ...(kind === 'measure' ? { aggType: 'sum' } : {}),
  });
  const REVENUE = member('orders.revenue', 'Revenue', 'measure');
  const MARGIN = member('orders.margin', 'Margin', 'measure');
  const ORDERS = member('orders.count', 'Orders', 'measure');
  const MONTH = member('orders.ordered_at', 'Ordered at', 'timeDimension');
  const REGION = member('orders.region', 'Region', 'dimension');
  const COUNTRY = member('orders.country', 'Country', 'dimension');
  const available = [REVENUE, MARGIN, ORDERS, MONTH, REGION, COUNTRY];
  const start = {
    ...emptySpec('orders'),
    measures: [REVENUE.name, MARGIN.name],
    timeDimensions: [MONTH.name],
    dimensions: [REGION.name],
  };
  const combo = { options: {}, onOptions: vi.fn(), onFormat: vi.fn() };

  /** The wells over a spec held as the editor holds it, adding as the editor adds. */
  function Held({ count }: { count: NonNullable<WellsProps['combo']>['count'] }) {
    const [spec, setSpec] = useState<ChartSpec>(start);
    return (
      <Wells
        spec={spec}
        available={available}
        onAdd={(well, name) => setSpec((current) => addToWellAs('combo', current, well, name))}
        onRemove={vi.fn()}
        combo={{ ...combo, count }}
      />
    );
  }

  it('heads the dimensions as Split by, after Time, its pill counting the regions', () => {
    render(<Held count={{ measures: 2, members: 4, series: 8, dimension: 'Region' }} />);
    const heads = screen.getAllByRole('heading', { level: 3 }).map((one) => one.textContent);

    expect(heads.slice(0, 3)).toEqual([
      'Metrics',
      'Time',
      'Split by · one dimension, across every measure',
    ]);
    expect(within(screen.getByTestId('in-dimensions-orders.region')).getByTestId('split-members').textContent).toBe('4');
    expect(screen.getByTestId('split-count').textContent).toBe(
      '2 measures × 4 regions = 8 of 8 series',
    );
  });

  it('replaces the split with a second dimension added', async () => {
    render(<Held count={{ measures: 2, members: 4, series: 8, dimension: 'Region' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add to Split by' }));
    await userEvent.click(
      within(screen.getByRole('listbox', { name: 'Fields' })).getByRole('option', {
        name: /Orders Country/,
      }),
    );

    expect(screen.queryByTestId('in-dimensions-orders.region')).toBeNull();
    expect(screen.getByTestId('in-dimensions-orders.country')).toBeTruthy();
  });

  it('reads "top 1 + Other of 4" while folded', () => {
    render(
      <Held count={{ measures: 3, members: 4, top: 1, series: 6, dimension: 'Region' }} />,
    );

    expect(within(screen.getByTestId('in-dimensions-orders.region')).getByTestId('split-members').textContent).toBe('top 1 + Other of 4');
  });

  it('says a measure past 8 series isn’t drawn, with Small multiples by Region, Table and Remove', () => {
    const onTable = vi.fn();
    render(
      <Wells
        spec={{ ...start, measures: [REVENUE.name, MARGIN.name, ORDERS.name] }}
        available={available}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        combo={{
          ...combo,
          count: { measures: 3, members: 4, series: 8, dimension: 'Region', shown: 'all' },
        }}
        undrawn={undrawnWell({
          undrawn: [{ member: ORDERS.name, reason: 'series' }],
          shownType: 'combo',
          options: {},
          onOptions: vi.fn(),
          onSmallMultiples: vi.fn(),
          onTable,
          limit: { drawn: 2, members: 4, dimension: 'Region' },
        })}
      />,
    );

    expect(screen.getByTestId('in-measures-orders.count').textContent).toContain(
      'not drawn · over 8 series',
    );
    const line = screen.getByTestId('undrawn-metrics');
    expect(line.textContent).toContain(
      "Orders isn't drawn. 2 measures × 4 regions already make 8 series, the most a combo draws.",
    );
    expect(
      within(line)
        .getAllByRole('button')
        .map((one) => one.textContent),
    ).toEqual(['Small multiples by Region', 'Table', 'Remove Orders']);
  });
});
