import { describe, expect, it } from 'vitest';

import { addToWell, emptySpec, isEmpty, removeFromWell, toCubeQuery, wellFor } from './chart-spec';

/**
 * AC-026: WHEN the user drags a field onto a well, or adds it with the well's
 * "+" picker, THE SYSTEM SHALL add it to that well and re-run the chart's
 * query.
 *
 * This file is the model half: what a well holds after an add, and the query
 * that comes out. The two routes into it are tested in the editor.
 */
describe('wells', () => {
  it('adds a member to the well it was dropped on', () => {
    const spec = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    expect(spec.measures).toEqual(['orders.count']);
  });

  it('keeps members in the order they were added', () => {
    let spec = emptySpec('orders');
    spec = addToWell(spec, 'measures', 'orders.count');
    spec = addToWell(spec, 'measures', 'orders.total_amount');

    expect(spec.measures).toEqual(['orders.count', 'orders.total_amount']);
  });

  it('ignores a member the well already holds, rather than duplicating it', () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    spec = addToWell(spec, 'measures', 'orders.count');

    expect(spec.measures).toEqual(['orders.count']);
  });

  it('does not change the other wells', () => {
    const before = addToWell(emptySpec('orders'), 'dimensions', 'orders.status');
    const after = addToWell(before, 'measures', 'orders.count');

    expect(after.dimensions).toEqual(['orders.status']);
  });

  it('removes a member', () => {
    const spec = removeFromWell(
      addToWell(emptySpec('orders'), 'measures', 'orders.count'),
      'measures',
      'orders.count',
    );

    expect(spec.measures).toEqual([]);
  });

  it('routes each member kind to its own well', () => {
    expect(wellFor('measure')).toBe('measures');
    expect(wellFor('dimension')).toBe('dimensions');
    expect(wellFor('timeDimension')).toBe('timeDimensions');
    expect(wellFor('segment')).toBeNull();
  });

  it('reports an untouched spec as empty', () => {
    expect(isEmpty(emptySpec('orders'))).toBe(true);
    expect(isEmpty(addToWell(emptySpec('orders'), 'measures', 'orders.count'))).toBe(false);
  });
});

describe('the Cube query a spec asks for', () => {
  it('carries measures and dimensions', () => {
    let spec = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    spec = addToWell(spec, 'dimensions', 'orders.status');

    expect(toCubeQuery(spec)).toEqual({
      measures: ['orders.count'],
      dimensions: ['orders.status'],
    });
  });

  it('puts a time dimension in timeDimensions, not dimensions', () => {
    const spec = addToWell(emptySpec('orders'), 'timeDimensions', 'orders.ordered_at');

    const query = toCubeQuery(spec);
    expect(query['dimensions']).toEqual([]);
    expect(query['timeDimensions']).toEqual([
      { dimension: 'orders.ordered_at', granularity: 'day' },
    ]);
  });

  it('omits timeDimensions entirely when there are none', () => {
    expect(toCubeQuery(emptySpec('orders'))).not.toHaveProperty('timeDimensions');
  });

  it('produces identical JSON for the same members added in a different order', () => {
    let a = addToWell(emptySpec('orders'), 'measures', 'orders.count');
    a = addToWell(a, 'measures', 'orders.total_amount');

    let b = addToWell(emptySpec('orders'), 'measures', 'orders.total_amount');
    b = addToWell(b, 'measures', 'orders.count');

    // AC-105 depends on this: the same request must be byte-identical so the
    // result can be served from cache.
    expect(JSON.stringify(toCubeQuery(a))).toBe(JSON.stringify(toCubeQuery(b)));
  });
});
