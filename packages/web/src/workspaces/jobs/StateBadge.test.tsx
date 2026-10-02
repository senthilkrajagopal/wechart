import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StateBadge, stateOf } from './StateBadge';

/**
 * T158 / AC-152: THE SYSTEM SHALL show every job and schedule with an icon
 * and a text label for its state, never colour alone (direction.md rule 22).
 *
 * The jobs are Cube's build jobs (T155), in the states its jobs API reports
 * (research/cube/refresh-jobs-caching.md §B); schedules are deferred (spec,
 * F17). Each state wears the prototype's status: an icon of its kind — done,
 * running, waiting, warning, failed — and its words.
 */
describe('a job’s state', () => {
  it.each([
    // Design 16's words, pin 5 (T375): Cube's `scheduled` waits, `processing` builds.
    ['scheduled', 'idle', 'Queued'],
    ['processing', 'run', 'Building'],
    ['done', 'ok', 'Done'],
    ['missing_partition', 'err', 'Missing partition'],
    [
      'failure: relation "public.orders" does not exist',
      'err',
      'Failed: relation "public.orders" does not exist',
    ],
    ['not_found', 'warn', 'Not found'],
    ['pre_agg_not_found', 'err', 'Pre-aggregation not found'],
    // wechart's own: taken out of the queue (T376), with design 16's slashed circle.
    ['cancelled', 'cancel', 'Cancelled'],
    // A raw queue state Cube passes through, as it is.
    ['toProcess', 'idle', 'toProcess'],
    // Before Cube has answered at all: asking, under way (T183's review).
    ['', 'run', 'Asking Cube…'],
  ])('%s reads %s, “%s”', (status, kind, label) => {
    expect(stateOf(status)).toEqual({ kind, label });
  });

  it('is shown as an icon and its words, never colour alone', () => {
    for (const status of ['scheduled', 'processing', 'done', 'missing_partition', 'not_found']) {
      const { container, unmount } = render(<StateBadge status={status} />);
      const badge = container.querySelector('[data-testid="job-state"]') as HTMLElement;
      const { kind, label } = stateOf(status);

      expect(badge.getAttribute('data-state')).toBe(status);
      expect(badge.classList.contains(`status--${kind}`)).toBe(true);
      // The icon: a drawing of its kind, hidden from a screen reader, which
      // reads the words.
      const icon = badge.querySelector('svg');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.getAttribute('data-icon')).toBe(kind);
      expect(badge.textContent).toBe(label);
      unmount();
    }
  });

  it('draws a different icon for each kind', () => {
    const drawn = new Set(
      ['scheduled', 'processing', 'done', 'missing_partition', 'not_found'].map((status) => {
        const { container, unmount } = render(<StateBadge status={status} />);
        const svg = container.querySelector('svg')?.innerHTML;
        unmount();
        return svg;
      }),
    );
    expect(drawn.size).toBe(5);
  });
});
