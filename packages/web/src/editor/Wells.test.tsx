import { emptySpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
};

const timeDimension: Member = {
  name: 'orders.ordered_at',
  title: 'Orders Ordered at',
  shortTitle: 'Ordered at',
  kind: 'timeDimension',
  type: 'time',
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
    expect(rejectionReason(measuresWell, timeDimension)).toContain('Measures takes a measure');
  });
});
