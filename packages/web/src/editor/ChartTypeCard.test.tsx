import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChartTypeCard, type ChartTypeCardProps } from './ChartTypeCard';

const card = (props: Partial<ChartTypeCardProps> = {}) => {
  const handlers = { onChange: vi.fn(), onBack: vi.fn() };
  render(
    <ChartTypeCard
      shown="bar"
      manual={false}
      recommended="bar"
      warnings={[]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

/**
 * T230 / AC-217: THE SYSTEM SHALL show the chart's type by its name — "Auto"
 * with the recommended type, or "Chosen manually" — with a Change action …
 * and SHALL show "Back to recommended" only while a type is chosen manually.
 * `Fails when: a type is shown by an internal id such as "groupedBar" … or
 * "Back to recommended" shows while the type is the recommended one.`
 */
describe('the chart type card (AC-217)', () => {
  it('reads "Auto" with the recommended type’s name, and offers no way back', () => {
    card();
    const type = screen.getByTestId('chart-type');
    expect(type.textContent).toBe('Auto · Bar');
    expect(type.dataset['chartType']).toBe('bar');
    expect(screen.getByTestId('chart-type-change').textContent).toContain(
      'Picked by the recommender',
    );
    expect(screen.queryByRole('button', { name: 'Back to recommended' })).toBeNull();
  });

  it('reads a manual choice by its name, and offers the way back', async () => {
    const { onBack } = card({ shown: 'groupedBar', manual: true });
    expect(screen.getByTestId('chart-type').textContent).toBe('Grouped bar');
    expect(screen.getByTestId('chart-type-change').textContent).toContain('Chosen manually');
    await userEvent.click(screen.getByRole('button', { name: 'Back to recommended' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('says it waits for fields when there is nothing to draw', () => {
    card({ shown: null, recommended: null });
    expect(screen.getByTestId('chart-type').textContent).toBe('Auto · waiting for fields');
  });

  it('opens the gallery from Change', async () => {
    const { onChange } = card();
    await userEvent.click(screen.getByTestId('chart-type-change'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

/**
 * T230 / AC-218: WHILE a manually chosen type is a combo, or exceeds a
 * channel's capacity for the chart's fields, THE SYSTEM SHALL show a warning
 * with an icon saying why, and offer to switch to the recommended type.
 * `Fails when: a combo, or a pie drawn with more than 6 slices, shows no
 * warning.`
 */
describe('a manual choice’s warning (AC-218)', () => {
  const why = 'A pie is readable up to 6 slices; this has 8.';

  it('says why, with an icon, and offers the recommended type', async () => {
    const { onBack } = card({ shown: 'pie', manual: true, warnings: [why] });
    const warning = screen.getByTestId('type-warning');
    expect(warning.textContent).toContain(why);
    expect(warning.querySelector('svg[data-icon="warn"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Use Bar' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('is not shown while the type is the recommender’s', () => {
    card({ warnings: [why] });
    expect(screen.queryByTestId('type-warning')).toBeNull();
  });
});
