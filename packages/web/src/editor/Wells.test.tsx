import { emptySpec } from '@wechart/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

  it('shows each field by its title, a measure with its aggregation', () => {
    render(
      <Wells spec={spec} available={[measure, timeDimension]} onAdd={vi.fn()} onRemove={vi.fn()} />,
    );
    const pill = screen.getByTestId('in-measures-orders.count');
    expect(pill.textContent).toContain('Orders Count');
    expect(pill.textContent).toContain('count');
    expect(pill.textContent).not.toContain('orders.count');
    expect(screen.getByRole('button', { name: 'Remove Orders Count from Metrics' })).toBeTruthy();
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
    const grain = screen.getByLabelText('Grain of Orders Ordered at');
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
    await userEvent.selectOptions(screen.getByTestId('add-filters'), 'orders.status');
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
    const value = screen.getByLabelText('Value of Orders Status');
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
    expect((screen.getByLabelText('Value of Orders Status') as HTMLSelectElement).value).toBe(
      'retired',
    );
    expect((screen.getByLabelText('How Orders Status is held') as HTMLSelectElement).value).toBe(
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
});
