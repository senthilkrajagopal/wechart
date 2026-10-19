import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { IconRule } from '@wechart/core';

import { IconText, ruleFor } from './IconElement';

/**
 * T886 / AC-522: THE SYSTEM SHALL let an Icon apply ordered rules, each a
 * condition on a measure, or on one measure as a percentage of another, with
 * one of the states success, warning, error or neutral and an editable label,
 * showing the first matching rule's status icon and its label, and "No rule
 * matched" with a neutral ring in `text-secondary` when none matches or there
 * is no data.
 */
const RULES: IconRule[] = [
  { op: '>=', value: 1, state: 'success', label: 'On track' },
  { op: '>=', value: 0.9, state: 'warning', label: 'Watch' },
  { op: 'otherwise', state: 'error', label: 'Behind' },
];

function drawn(value: number | undefined, rules: readonly IconRule[] = RULES) {
  const { container } = render(<IconText value={value} rules={rules} />);
  return container.firstElementChild as HTMLElement;
}

describe('an Icon (T886, AC-522)', () => {
  it('shows the first matching rule’s icon and word', () => {
    const onTrack = drawn(1.05);
    expect(onTrack.textContent).toBe('On track');
    expect(onTrack.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('ok');
    expect(onTrack.getAttribute('data-tone')).toBe('success');

    const watch = drawn(0.95);
    expect(watch.textContent).toBe('Watch');
    expect(watch.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('warn');

    const behind = drawn(0.5);
    expect(behind.textContent).toBe('Behind');
    expect(behind.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('err');
  });

  it('says "No rule matched" with a neutral ring when none matches, or there is no data', () => {
    for (const shown of [drawn(undefined), drawn(0.5, RULES.slice(0, 2))]) {
      expect(shown.textContent).toBe('No rule matched');
      expect(shown.getAttribute('data-tone')).toBe('neutral');
      expect(shown.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe('idle');
    }
  });

  it('takes the rules in order, each condition as written', () => {
    expect(ruleFor(0.9, RULES)?.label).toBe('Watch');
    expect(ruleFor(1, [{ op: '>', value: 1, state: 'success', label: 'Over' }])).toBeUndefined();
    expect(ruleFor(3, [{ op: '=', value: 3, state: 'neutral', label: 'Three' }])?.label).toBe(
      'Three',
    );
    expect(ruleFor(2, [{ op: '<', value: 3, state: 'error', label: 'Under' }])?.label).toBe(
      'Under',
    );
  });
});
