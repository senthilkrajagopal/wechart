import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CustomizeTab } from '../CustomizeTab';
import { StackSetting, stackChoice } from './stack';

/**
 * T957 / AC-584: THE SYSTEM SHALL offer Customize › Stack, Sum or 100 %, on
 * Stacked bar and Stacked area, the gallery's 100 % stacked bar and 100 %
 * stacked area cards opening them at 100 %; WHILE the measure isn't summed,
 * 100 % SHALL be disabled with "‹measure› is an average, so its shares of a
 * total wouldn't mean anything. 100 % takes a summed measure." …
 * `Fails when: a 100 % card opens at Sum; 100 % can be chosen for an
 * average; …`
 */
const setting = (props: { options?: Record<string, unknown>; aggType?: string } = {}) => {
  const onOptions = vi.fn();
  render(
    <StackSetting
      options={props.options ?? {}}
      onOptions={onOptions}
      measureTitle="Margin %"
      aggType={props.aggType}
    />,
  );
  const group = screen.getByRole('radiogroup', { name: 'Stack' });
  const radio = (name: string) => within(group).getByRole('radio', { name }) as HTMLInputElement;
  return { onOptions, radio };
};

describe('Customize › Stack (AC-584)', () => {
  it('offers Sum and 100 %, Sum when nothing is stored', () => {
    const { radio } = setting({ aggType: 'sum' });
    expect(radio('Sum').checked).toBe(true);
    expect(radio('100 %').checked).toBe(false);
    expect(radio('100 %').disabled).toBe(false);
  });

  it('stores 100 %, and Sum as nothing', async () => {
    const user = userEvent.setup();
    const { onOptions, radio } = setting({ aggType: 'sum' });
    await user.click(radio('100 %'));
    expect(onOptions).toHaveBeenLastCalledWith({ stack: 'percent' });
    cleanup();
    const again = setting({ aggType: 'sum', options: { stack: 'percent' } });
    await user.click(again.radio('Sum'));
    expect(again.onOptions).toHaveBeenLastCalledWith({ stack: undefined });
  });

  it('disables 100 % for an average, saying why', () => {
    const { radio } = setting({ aggType: 'avg' });
    const percent = radio('100 %');
    expect(percent.disabled).toBe(true);
    const reason = document.getElementById(percent.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe(
      'Margin % is an average, so its shares of a total wouldn’t mean anything. 100 % takes a summed measure.',
    );
  });
});

describe('the Customize tab at 100 % (AC-584)', () => {
  const customize = (shareAxis: boolean) =>
    render(
      <CustomizeTab
        options={{}}
        onOptions={vi.fn()}
        cartesian
        valueAxes={['y']}
        drawn
        stackable
        series={[]}
        colourOf={() => '#000000'}
        stack={<p>the stack setting</p>}
        shareAxis={shareAxis}
      />,
    );

  it('holds the Stack setting, and fixes the value axis at 0–100 % every 25 %, with no log scale, zero, minimum or maximum', () => {
    customize(true);
    expect(screen.getByText('the stack setting')).toBeTruthy();
    const y = screen.getByTestId('axis-panel-y');
    for (const gone of ['Logarithmic scale', 'Include zero', 'Minimum', 'Maximum'])
      expect(within(y).queryByLabelText(gone)).toBeNull();
    expect(y.textContent).toContain('0–100 %, a tick every 25 %');
    // The category axis keeps its own settings.
    expect(
      within(screen.getByTestId('axis-panel-x')).getByLabelText('Logarithmic scale'),
    ).toBeTruthy();
  });

  it('keeps every axis setting at Sum', () => {
    customize(false);
    const y = screen.getByTestId('axis-panel-y');
    for (const kept of ['Logarithmic scale', 'Include zero', 'Minimum', 'Maximum'])
      expect(within(y).getByLabelText(kept)).toBeTruthy();
  });
});

describe('the gallery’s stacked cards (AC-584)', () => {
  it('opens the 100 % stacked bar and area cards at 100 %, and the plain cards at Sum', () => {
    expect(stackChoice('stackedBar', { stack: 'percent' })).toBe('percent');
    expect(stackChoice('stackedArea', { stack: 'percent' })).toBe('percent');
    expect(stackChoice('stackedBar', undefined)).toBe('sum');
    expect(stackChoice('stackedArea', {})).toBe('sum');
    // Any other type leaves the stacking alone.
    expect(stackChoice('bar', undefined)).toBeUndefined();
  });
});
