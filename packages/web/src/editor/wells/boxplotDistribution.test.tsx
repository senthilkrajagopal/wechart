import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BoxplotDistribution } from './boxplotDistribution';

/**
 * T990 / AC-591: THE SYSTEM SHALL offer on a box plot Customize ›
 * Distribution: Points, one of None, Outliers (the default, as drawn today),
 * All or Beeswarm, and Violin, on or off; WHILE Each point is is empty, All,
 * Beeswarm and Violin SHALL be disabled, each with "Points need Each point is:
 * choose what one point is, such as an Order."
 * `Fails when: a choice is missing or another is offered; the default isn't
 * Outliers; or All, Beeswarm or Violin can be chosen without Each point is, or
 * is disabled without the reason.`
 */
const REASON = 'Points need Each point is: choose what one point is, such as an Order.';

const distribution = (options: Record<string, unknown> = {}, eachPointIs = true) => {
  const onOptions = vi.fn();
  render(<BoxplotDistribution options={options} onOptions={onOptions} eachPointIs={eachPointIs} />);
  const points = screen.getByRole('radiogroup', { name: 'Points' });
  const radio = (name: string) => within(points).getByRole('radio', { name }) as HTMLInputElement;
  const violin = screen.getByRole('checkbox', { name: /^Violin/ }) as HTMLInputElement;
  return { onOptions, points, radio, violin };
};

describe('a box plot’s Customize › Distribution (AC-591)', () => {
  it('offers Points as None, Outliers, All and Beeswarm, and Violin, under Distribution', () => {
    const { points, violin } = distribution();
    expect(screen.getByRole('heading', { name: 'Distribution' })).toBeTruthy();
    expect(
      within(points)
        .getAllByRole('radio')
        .map((one) => one.closest('label')?.textContent),
    ).toEqual(['None', 'Outliers', 'All', 'Beeswarm']);
    expect(violin.checked).toBe(false);
  });

  it('chooses Outliers by default, as a box plot saved before R81 draws', () => {
    const { radio } = distribution({ whiskers: 'minmax' });
    expect(radio('Outliers').checked).toBe(true);
    for (const name of ['None', 'All', 'Beeswarm']) expect(radio(name).checked).toBe(false);
  });

  it('stores each choice sparsely, Outliers and no Violin as nothing', async () => {
    const { onOptions, radio, violin } = distribution();
    await userEvent.click(radio('Beeswarm'));
    expect(onOptions).toHaveBeenLastCalledWith({ distribution: { points: 'beeswarm' } });
    await userEvent.click(violin);
    expect(onOptions).toHaveBeenLastCalledWith({ distribution: { violin: true } });
  });

  it('puts a choice back to Outliers with no Violin as nothing stored', async () => {
    const { onOptions, radio } = distribution({ distribution: { points: 'all' } });
    expect(radio('All').checked).toBe(true);
    await userEvent.click(radio('Outliers'));
    expect(onOptions).toHaveBeenLastCalledWith({ distribution: undefined });
  });

  it('disables All, Beeswarm and Violin without Each point is, each described by why', async () => {
    const { onOptions, radio, violin } = distribution({}, false);
    for (const control of [radio('All'), radio('Beeswarm'), violin]) {
      expect(control.disabled).toBe(true);
      const note = document.getElementById(control.getAttribute('aria-describedby') ?? '');
      expect(note?.textContent).toBe(REASON);
    }
    // The reason is shown once, not once per control.
    expect(screen.getAllByText(REASON)).toHaveLength(1);
    // None and Outliers stay a box plot's own to choose.
    expect(radio('None').disabled).toBe(false);
    expect(radio('Outliers').disabled).toBe(false);
    expect(radio('None').getAttribute('aria-describedby')).toBeNull();

    await userEvent.click(radio('Beeswarm'));
    await userEvent.click(violin);
    expect(onOptions).not.toHaveBeenCalled();
  });

  it('shows what is drawn without Each point is: a saved Beeswarm and Violin as Outliers', () => {
    const { radio, violin } = distribution(
      { distribution: { points: 'beeswarm', violin: true } },
      false,
    );
    expect(radio('Outliers').checked).toBe(true);
    expect(radio('Beeswarm').checked).toBe(false);
    expect(violin.checked).toBe(false);
  });

  it('keeps a saved Violin while Points change without Each point is (T990’s review)', async () => {
    const { onOptions, radio } = distribution(
      { distribution: { points: 'beeswarm', violin: true } },
      false,
    );
    await userEvent.click(radio('None'));
    expect(onOptions).toHaveBeenLastCalledWith({ distribution: { points: 'none', violin: true } });
  });

  it('with Each point is, offers every choice with no reason shown', () => {
    const { radio, violin } = distribution({}, true);
    for (const control of [
      radio('None'),
      radio('Outliers'),
      radio('All'),
      radio('Beeswarm'),
      violin,
    ]) {
      expect(control.disabled).toBe(false);
      expect(control.getAttribute('aria-describedby')).toBeNull();
    }
    expect(screen.queryByText(REASON)).toBeNull();
  });
});
