import { CHART_TYPES } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChartTypeGallery } from './ChartTypeGallery';

/**
 * T230 / AC-217: THE SYSTEM SHALL show the chart's type by its name … with a
 * Change action opening a gallery of every type that can be searched, groups
 * types by purpose, states what each needs and greys those the chart's
 * fields cannot draw …
 * `Fails when: a type is shown by an internal id such as "groupedBar", a type
 * the fields cannot draw is not greyed with its requirement …`
 *
 * One measure and one dimension, no time: a bar can be drawn and a line
 * cannot.
 */
const gallery = () => {
  const handlers = { onChoose: vi.fn(), onAuto: vi.fn(), onClose: vi.fn() };
  render(
    <ChartTypeGallery
      current="bar"
      suggested={['bar', 'hbar']}
      counts={{ measures: 1, dimensions: 1, timeDimensions: 0 }}
      {...handlers}
    />,
  );
  return { ...handlers, dialog: screen.getByRole('dialog', { name: 'Choose chart type' }) };
};

const typesShown = (dialog: HTMLElement) =>
  within(dialog)
    .queryAllByTestId(/^type-card-/)
    .map((each) => each.dataset['type']);

describe('the chart type gallery (AC-217)', () => {
  it('opens on the suggested types, each by its name', () => {
    const { dialog } = gallery();
    // "Recommended (n)", as the prototype names the shelf (T688, EDI-25).
    const suggested = within(dialog).getByRole('button', { name: 'Recommended (2)' });
    expect(suggested.getAttribute('aria-pressed')).toBe('true');
    expect(typesShown(dialog)).toEqual(['bar', 'hbar']);
    expect(within(dialog).getByTestId('type-card-hbar').textContent).toContain('Bar, horizontal');
  });

  it('draws each card as the prototype does: its icon on the top row with the badge, its name on its own line, and the prototype’s foot (T688, EDI-24, EDI-25)', async () => {
    const { dialog } = gallery();
    await userEvent.click(within(dialog).getByRole('button', { name: 'All charts' }));
    for (const type of CHART_TYPES) {
      const card = within(dialog).getByTestId(`type-card-${type}`);
      const top = card.querySelector('.type-card__top')!;
      // The icon first on the top row; the name below it, not beside the badge.
      expect(top.firstElementChild?.getAttribute('data-chart-icon'), type).toBe(type);
      expect(top.querySelector('.type-card__name'), type).toBeNull();
      expect(card.querySelector(':scope > .type-card__name'), type).not.toBeNull();
    }
    expect(
      within(dialog).getByTestId('type-card-bar').querySelector('.type-card__badge')?.textContent,
    ).toBe('Suggested');
    expect(dialog.querySelector('.type-gallery__foot p')?.textContent).toBe(
      '“Suggested” comes from the recommender for your current fields. You can pick any type and then add the fields it needs.',
    );
  });

  it('lists every type under All charts, and a purpose’s under it', async () => {
    const { dialog } = gallery();
    await userEvent.click(within(dialog).getByRole('button', { name: 'All charts' }));
    // Every type the spec knows, the box plot (T399) included.
    expect(typesShown(dialog)).toEqual([...CHART_TYPES]);
    expect(dialog.textContent).not.toContain('groupedBar');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Part of a whole' }));
    expect(typesShown(dialog)).toEqual(['pie', 'donut', 'treemap', 'stackedBar', 'stackedArea']);
  });

  it('greys a type the fields cannot draw, saying what it needs', async () => {
    const { dialog } = gallery();
    await userEvent.click(within(dialog).getByRole('button', { name: 'All charts' }));
    const line = within(dialog).getByTestId('type-card-line');
    expect(line.dataset['drawable']).toBe('false');
    expect(line.textContent).toContain('Needs a measure and a time dimension');
    expect(line.textContent).toContain('Line needs a time dimension in Time; add 1 more.');
    const bar = within(dialog).getByTestId('type-card-bar');
    expect(bar.dataset['drawable']).toBe('true');
    expect(bar.textContent).toContain('Suggested');
  });

  it('searches every type by name and purpose, and says when none match', async () => {
    const { dialog } = gallery();
    const search = within(dialog).getByRole('searchbox', { name: 'Search chart types' });
    expect(document.activeElement).toBe(search);
    await userEvent.type(search, 'trend');
    expect(typesShown(dialog)).toEqual(['line']);
    await userEvent.clear(search);
    await userEvent.type(search, 'no type is called this');
    expect(typesShown(dialog)).toEqual([]);
    expect(within(dialog).getByText('No chart types match.')).toBeTruthy();
  });

  it('chooses a type, goes back to Auto, and closes on Escape', async () => {
    const { dialog, onChoose, onAuto, onClose } = gallery();
    await userEvent.click(within(dialog).getByTestId('type-card-hbar'));
    expect(onChoose).toHaveBeenCalledWith('hbar');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use Auto' }));
    expect(onAuto).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('marks the type drawn now', () => {
    const { dialog } = gallery();
    expect(within(dialog).getByTestId('type-card-bar').getAttribute('aria-current')).toBe('true');
  });
});
