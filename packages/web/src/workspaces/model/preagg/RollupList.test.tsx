import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CubeForm } from '../form/CubeForm';
import { rollupFacts } from './RollupList';

/**
 * T148 / AC-142: WHEN the user opens a cube's pre-aggregations, THE SYSTEM
 * SHALL list each rollup with its measures, dimensions, time dimension,
 * granularity, partition granularity and indexes.
 * Fails when: a declared rollup or any of those attributes is missing.
 *
 * Listed, not behind each rollup's form: the list says what every rollup
 * holds, and a rollup's form is opened to change it.
 */
const MONTHLY = {
  name: 'monthly_orders',
  sql_table: 'public.orders',
  measures: [
    { name: 'count', type: 'count' },
    { name: 'total_amount', sql: 'amount', type: 'sum' },
  ],
  dimensions: [{ name: 'status', sql: 'status', type: 'string' }],
  pre_aggregations: [
    {
      name: 'by_status_month',
      measures: ['count', 'total_amount'],
      dimensions: ['status'],
      time_dimension: 'ordered_at',
      granularity: 'month',
      partition_granularity: 'year',
      indexes: [
        { name: 'by_status', columns: ['status'] },
        { name: 'totals', columns: ['status', 'count'], type: 'aggregate' },
      ],
    },
    // As little as a rollup can declare: every attribute is still listed.
    { name: 'everything', type: 'rollup' },
    { name: 'combined', type: 'rollup_lambda', rollups: ['by_status_month', 'orders.recent'] },
  ],
};

describe('a cube’s pre-aggregations', () => {
  it('lists every rollup with each attribute, without opening its form', async () => {
    render(<CubeForm kind="cube" value={MONTHLY} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Pre-aggs/ }));

    const list = screen.getByRole('list', { name: 'Pre-aggregations' });
    // The rollups themselves: each one's closed form holds lists of its own.
    const items = [...list.querySelectorAll<HTMLElement>(':scope > li')];
    expect(items).toHaveLength(3);

    const facts = (item: HTMLElement) =>
      [...item.querySelectorAll('.rollup-facts > div')].map((row) => [
        row.querySelector('dt')?.textContent,
        row.querySelector('dd')?.textContent,
      ]);
    expect(facts(items[0] as HTMLElement)).toEqual([
      ['Measures', 'count, total_amount'],
      ['Dimensions', 'status'],
      ['Time dimension', 'ordered_at'],
      ['Granularity', 'month'],
      ['Partition granularity', 'year'],
      ['Indexes', 'by_status (status); totals (status, count), aggregate'],
    ]);
    expect(facts(items[1] as HTMLElement)).toEqual([
      ['Measures', 'none'],
      ['Dimensions', 'none'],
      ['Time dimension', 'none'],
      ['Granularity', 'none'],
      ['Partition granularity', 'none'],
      ['Indexes', 'none'],
    ]);
    // A lambda or join is made of rollups, and says which.
    expect(facts(items[2] as HTMLElement)).toContainEqual([
      'Rollups',
      'by_status_month, orders.recent',
    ]);

    // Shown with the list, not only inside a rollup's closed form.
    const first = items[0] as HTMLElement;
    expect(first.querySelector('details')?.open).toBe(false);
    expect(within(first).getByText('count, total_amount').closest('details')).toBeNull();
  });
});

describe('what a rollup declares, in words', () => {
  it('reads members as written, whatever form the model writes them in', () => {
    expect(
      rollupFacts({
        measures: ['CUBE.count'],
        dimensions: 'status',
        time_dimension: 'CUBE.ordered_at',
        indexes: [{ columns: ['status'] }, 'not an index'],
      }),
    ).toEqual([
      ['Measures', 'CUBE.count'],
      // One member written on its own, as Cube and the form both take it.
      ['Dimensions', 'status'],
      ['Time dimension', 'CUBE.ordered_at'],
      ['Granularity', 'none'],
      ['Partition granularity', 'none'],
      ['Indexes', 'unnamed (status)'],
    ]);
  });

  it('reads every way Cube accepts a rollup being written (T148’s review)', () => {
    // The legacy reference keys, which the form lists under its legacy keys.
    expect(
      rollupFacts({
        measure_references: ['count'],
        dimension_references: ['status'],
        time_dimension_reference: 'ordered_at',
        granularity: 'day',
      }).slice(0, 4),
    ).toEqual([
      ['Measures', 'count'],
      ['Dimensions', 'status'],
      ['Time dimension', 'ordered_at'],
      ['Granularity', 'day'],
    ]);
    // camelCase keys and types: Cube's YAML compiler camelises a rollup.
    expect(
      rollupFacts({
        type: 'rollupLambda',
        measureReferences: ['count'],
        timeDimension: 'ordered_at',
        partitionGranularity: 'year',
        rollupReferences: ['a', 'b'],
      }),
    ).toEqual([
      ['Measures', 'count'],
      ['Dimensions', 'none'],
      ['Time dimension', 'ordered_at'],
      ['Granularity', 'none'],
      ['Partition granularity', 'year'],
      ['Indexes', 'none'],
      ['Rollups', 'a, b'],
    ]);
    // Several time dimensions, each with its granularity, in order.
    expect(
      rollupFacts({
        measures: ['count'],
        time_dimensions: [
          { dimension: 'ordered_at', granularity: 'day' },
          { dimension: 'shipped_at', granularity: 'month' },
        ],
      }).slice(2, 4),
    ).toEqual([
      ['Time dimension', 'ordered_at, shipped_at'],
      ['Granularity', 'day, month'],
    ]);
    // An index on SQL rather than columns.
    expect(
      rollupFacts({ indexes: [{ name: 'by_lower', sql: 'lower(status)', type: 'aggregate' }] })[5],
    ).toEqual(['Indexes', 'by_lower (sql: lower(status)), aggregate']);
  });
});

/**
 * T207 / AC-189: IF a model change being published leaves a pre-aggregation
 * naming a measure, dimension, segment, time dimension or index column that
 * the model does not have, THEN THE SYSTEM SHALL refuse to publish the change
 * and show each unknown name on that pre-aggregation's row.
 */
describe('a rollup refused for what it names', () => {
  const refused = {
    path: 'cubes/monthly_orders.yml',
    message: 'Pre-aggregation by_status_month names what the model doesn’t have: …',
    preAggregation: {
      cube: 'monthly_orders',
      name: 'by_status_month',
      unknown: [
        { list: 'dimensions', name: 'CUBE.no_such_member' },
        { list: 'index by_status', name: 'status' },
      ],
    },
  };
  const broken = {
    ...MONTHLY,
    pre_aggregations: [
      { ...MONTHLY.pre_aggregations[0], dimensions: ['status', 'CUBE.no_such_member'] },
      ...MONTHLY.pre_aggregations.slice(1),
    ],
  };

  it('shows each unknown name on that rollup’s row, and on no other', async () => {
    render(<CubeForm kind="cube" value={broken} onChange={vi.fn()} rollupProblems={[refused]} />);
    // The tab says a rollup there has a problem, before it is opened.
    const tab = screen.getByRole('tab', { name: /^Pre-aggs/ });
    expect(tab.querySelector('[data-icon="error"]')).not.toBeNull();
    await userEvent.click(tab);

    const [first, ...others] = screen
      .getByRole('list', { name: 'Pre-aggregations' })
      .querySelectorAll<HTMLElement>(':scope > li');
    const unknown = within(first as HTMLElement).getByTestId('rollup-unknown');
    expect(unknown.textContent).toContain('CUBE.no_such_member (dimensions)');
    expect(unknown.textContent).toContain('status (index by_status)');
    // An icon with the words (direction.md rule 3).
    expect(unknown.querySelector('[data-icon="error"]')).not.toBeNull();
    for (const other of others) expect(within(other).queryByTestId('rollup-unknown')).toBeNull();
  });

  it('stops naming a name once the rollup no longer writes it', async () => {
    render(<CubeForm kind="cube" value={MONTHLY} onChange={vi.fn()} rollupProblems={[refused]} />);
    await userEvent.click(screen.getByRole('tab', { name: /^Pre-aggs/ }));
    const unknown = screen.getByTestId('rollup-unknown');
    // `CUBE.no_such_member` was taken out; the index's `status` is still written.
    expect(unknown.textContent).not.toContain('CUBE.no_such_member');
    expect(unknown.textContent).toContain('status (index by_status)');
  });

  it('takes the tab’s mark away once no rollup writes a refused name (T207’s review)', () => {
    const mended = {
      ...MONTHLY,
      pre_aggregations: [{ name: 'by_status_month', measures: ['count'] }],
    };
    render(<CubeForm kind="cube" value={mended} onChange={vi.fn()} rollupProblems={[refused]} />);
    const tab = screen.getByRole('tab', { name: /^Pre-aggs/ });
    expect(tab.querySelector('[data-icon="error"]')).toBeNull();
    expect(tab.textContent).not.toContain('refused');
  });
});
