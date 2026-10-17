import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChartTypeCard, type ChartTypeCardProps } from './ChartTypeCard';

const PICKS: ChartTypeCardProps['picks'] = [
  { type: 'bar', reason: 'Compares values across categories.' },
  { type: 'hbar', reason: 'Long category names read across.' },
  { type: 'donut', reason: 'Parts of a whole.' },
];

const card = (props: Partial<ChartTypeCardProps> = {}) => {
  const handlers = { onChange: vi.fn(), onAuto: vi.fn(), onPick: vi.fn() };
  render(
    <ChartTypeCard
      shown="bar"
      manual={false}
      recommended="bar"
      recommendedReason="8 Country values × 1 measure → Bar"
      picks={PICKS}
      warnings={[]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

/**
 * T230 / AC-217 as amended by R76 (chart-editor-Q2; T689, EDI-06): THE SYSTEM
 * SHALL show the chart's type by its name — "Auto" with the recommended type,
 * or "Chosen manually" — with a Change action …, and SHALL show under it an
 * "Auto" quick pick, pressed while the recommended type is drawn, that
 * returns a manually chosen type to the recommended one.
 * `Fails when: a type is shown by an internal id such as "groupedBar", … Auto
 * is not pressed while the recommended type is drawn, or choosing Auto while
 * a type is chosen manually doesn't return the chart to the recommended type.`
 */
describe('the chart type card (AC-217)', () => {
  it('reads "Auto" with the recommended type’s name and its icon, and Auto pressed', () => {
    card();
    const type = screen.getByTestId('chart-type');
    expect(type.textContent).toBe('Auto · Bar');
    expect(type.dataset['chartType']).toBe('bar');
    const change = screen.getByTestId('chart-type-change');
    expect(change.textContent).toContain('Picked by the recommender');
    expect(change.querySelector('.type-card-field__icon svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Auto' }).getAttribute('aria-pressed')).toBe('true');
    // The top pick isn't pressed in Auto: pressed means pinned by hand.
    expect(screen.getByRole('button', { name: 'Bar' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Back to recommended' })).toBeNull();
  });

  it('reads a manual choice by its name, “Chosen manually · Change…”, its pick pressed and Auto not', async () => {
    const { onAuto } = card({ shown: 'groupedBar', manual: true });
    expect(screen.getByTestId('chart-type').textContent).toBe('Grouped bar');
    const why = screen.getByTestId('chart-type-change').querySelector('.type-card-field__why');
    expect(why?.textContent).toBe('Chosen manually · Change…');
    // "Change…" in the accent, 600, as design 01's .reco-why u.
    expect(why?.querySelector('.type-card-field__change-word')?.textContent).toBe('Change…');
    const auto = screen.getByRole('button', { name: 'Auto' });
    expect(auto.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(auto);
    expect(onAuto).toHaveBeenCalledTimes(1);
    // From Auto, which stays: the editor leaves focus on it (T689's review).
    expect(onAuto).toHaveBeenCalledWith('auto');
  });

  it('presses a manual pick equal to the recommendation as that type’s pick, not Auto (clarified 2026-10-17)', () => {
    card({ shown: 'bar', manual: true });
    expect(screen.getByRole('button', { name: 'Auto' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Bar' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('offers the top pick and runners-up as 24 px icon quick picks, each with its reason', async () => {
    const { onPick } = card();
    const picks = screen.getByRole('group', { name: 'Quick picks' });
    expect(
      within(picks)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(['Auto', 'Bar', 'Bar, horizontal', 'Donut']);
    const across = within(picks).getByRole('button', { name: 'Bar, horizontal' });
    expect(across.getAttribute('title')).toBe('Bar, horizontal — Long category names read across.');
    expect(across.querySelector('svg')).not.toBeNull();
    expect(picks.textContent).toContain('Suggested for these fields');
    await userEvent.click(across);
    expect(onPick).toHaveBeenCalledWith('hbar');
  });

  it('says it waits for fields when there is nothing to draw, with no quick picks', () => {
    card({ shown: null, recommended: null, picks: [] });
    expect(screen.getByTestId('chart-type').textContent).toBe('Auto · waiting for fields');
    expect(screen.queryByRole('group', { name: 'Quick picks' })).toBeNull();
  });

  it('opens the gallery from Change', async () => {
    const { onChange } = card();
    await userEvent.click(screen.getByTestId('chart-type-change'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

/**
 * T689 (EDI-07; design 01 pin 5; AC-032 as amended): a Recommended card only
 * while the pick differs, with a reason from the data and Use, which returns
 * the chart to the recommendation.
 */
describe('the Recommended card (T689, AC-032)', () => {
  it('shows only while the manual pick differs, with its reason from the data and Use', async () => {
    const { onAuto } = card({ shown: 'hbar', manual: true });
    const pinned = screen.getByTestId('recommended-card');
    expect(pinned.textContent).toContain('Recommended: Bar');
    expect(pinned.textContent).toContain('8 Country values × 1 measure → Bar');
    expect(pinned.querySelector('svg')).not.toBeNull();
    await userEvent.click(within(pinned).getByRole('button', { name: 'Use Bar' }));
    expect(onAuto).toHaveBeenCalledTimes(1);
    // From Use, which goes with the card: the editor moves focus to Change.
    expect(onAuto).toHaveBeenCalledWith('use');
  });

  it('is not shown in Auto, nor for a manual pick equal to the recommendation', () => {
    card();
    expect(screen.queryByTestId('recommended-card')).toBeNull();
    card({ manual: true });
    expect(screen.queryByTestId('recommended-card')).toBeNull();
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
    const { onAuto } = card({ shown: 'pie', manual: true, warnings: [why] });
    const warning = screen.getByTestId('type-warning');
    expect(warning.textContent).toContain(why);
    expect(warning.querySelector('svg[data-icon="warn"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Use Bar' }));
    expect(onAuto).toHaveBeenCalledTimes(1);
  });

  it('is not shown while the type is the recommender’s', () => {
    card({ warnings: [why] });
    expect(screen.queryByTestId('type-warning')).toBeNull();
  });
});
