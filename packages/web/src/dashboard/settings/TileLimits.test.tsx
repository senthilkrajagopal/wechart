import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TileLimits, allowedLimits } from './TileLimits';

/**
 * T114 / AC-108: THE SYSTEM SHALL prevent a tile from being limited by the
 * marking it marks with, and SHALL state the reason where that option is
 * offered (direction.md rule 45).
 * `Fails when: a tile can be limited by its own marking.`
 *
 * **Why the rule exists**, because the control looks arbitrary without it: a
 * tile limited by its own marking feeds back on itself. Marking two bars would
 * restrict the tile to those two bars — so the other bars vanish, and with
 * them any way to change the marking. The tile locks itself, and the only
 * escape is a settings page the user has no reason to think is involved.
 *
 * "Prevent" is stronger than "do not offer", so this is checked in two places:
 * the control disables the option, and the model refuses it even if a stored
 * document names it. A document can arrive from anywhere — hand-edited, or
 * written before this rule existed.
 */
const markings = [
  { id: 'mk1', name: 'Marking', slot: 'mk1' as const, isDefault: true },
  { id: 'mk2', name: 'Comparison', slot: 'mk2' as const, isDefault: false },
  { id: 'mk3', name: 'Outliers', slot: 'mk3' as const, isDefault: false },
];

const show = (
  marksWith: string | undefined,
  limitedBy: readonly string[] = [],
  rest: Partial<React.ComponentProps<typeof TileLimits>> = {},
) => {
  const onChange = vi.fn();
  render(
    <TileLimits
      markings={markings}
      marksWith={marksWith}
      limitedBy={limitedBy}
      onChange={onChange}
      {...rest}
    />,
  );
  return onChange;
};

describe('the limit list on a tile', () => {
  it('offers every marking', () => {
    show('mk1');

    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  it('disables the marking the tile marks with', () => {
    // The criterion's failing state, at the control.
    show('mk1');

    const own = screen.getByRole('checkbox', { name: /Marking/ }) as HTMLInputElement;
    expect(own.disabled).toBe(true);
  });

  it('leaves the others selectable', () => {
    show('mk1');

    const other = screen.getByRole('checkbox', { name: /Comparison/ }) as HTMLInputElement;
    expect(other.disabled).toBe(false);
  });

  it('states the reason beside the option, not somewhere else', () => {
    /**
     * "SHALL state the reason **where that option is offered**". A disabled
     * checkbox with no explanation is the most frustrating control there is —
     * the user cannot tell whether it is broken, not permitted, or waiting on
     * something they have not done.
     */
    show('mk1');

    const own = screen.getByTestId('limit-mk1');
    expect(own.textContent).toContain('marks with this');
  });

  it('gives no reason beside options that are not disabled', () => {
    // Explaining a control that works would be noise, and would teach people
    // to skip the explanation on the one that does not.
    show('mk1');

    expect(screen.getByTestId('limit-mk2').textContent).not.toContain('marks with this');
  });

  it('reports a change when another marking is chosen', async () => {
    const onChange = show('mk1');

    await userEvent.click(screen.getByRole('checkbox', { name: /Comparison/ }));

    expect(onChange).toHaveBeenCalledWith({ limitedBy: ['mk2'] });
  });

  it('disables nothing when the tile marks with nothing', () => {
    // A "(None)" tile has no own marking, so every limit is available to it.
    // `''`, not absent: absent means "follow the dashboard's default", which
    // is a marking, and the tile is then barred from limiting by that one.
    show('');

    for (const box of screen.getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).disabled).toBe(false);
    }
  });

  it('bars the default marking on a tile that names none, since that is what it marks with', () => {
    /**
     * Most tiles never touch the Marking setting, so rule 45 read off the
     * stored field alone would go unenforced on nearly every tile on a
     * dashboard — and each of those could lock itself.
     */
    show(undefined);

    const byDefault = screen.getByRole('checkbox', { name: 'Limit by Marking' });
    expect((byDefault as HTMLInputElement).disabled).toBe(true);
  });
});

/**
 * T113 / AC-107: "…combined as All markings (AND) or Any marking (OR)
 * **according to its setting**". The setting has to be somewhere the user can
 * reach; this is where.
 */
describe('how several limits combine', () => {
  it('offers the choice once there are two limits to combine', async () => {
    const onChange = show('mk1', ['mk2', 'mk3']);

    await userEvent.selectOptions(screen.getByLabelText('Combine markings'), 'any');

    expect(onChange).toHaveBeenCalledWith({ limitCombination: 'any' });
  });

  it('does not offer it for a single limit, where the two mean the same', () => {
    // A control that changes nothing is worse than none: it invites the
    // reader to look for the difference.
    show('mk1', ['mk2']);

    expect(screen.queryByLabelText('Combine markings')).toBeNull();
  });
});

/**
 * T115 / AC-109: WHEN every marking limiting a tile is empty, THE SYSTEM SHALL
 * show the tile's nothing-marked state: all data, an empty visualization, or a
 * message on an empty background, **as set on the tile**.
 */
describe('what the tile does while nothing is marked', () => {
  it('offers the three states once the tile is limited', () => {
    show('mk1', ['mk2']);

    const labels = [...screen.getByLabelText('When nothing is marked').querySelectorAll('option')];
    expect(labels.map((option) => option.textContent)).toEqual([
      'All data',
      'Empty visualization',
      'Message on an empty background',
    ]);
  });

  it('is not offered on a tile no marking limits, which waits for nothing', () => {
    show('mk1', []);

    expect(screen.queryByLabelText('When nothing is marked')).toBeNull();
  });

  it('edits the message where the message is what the tile shows', async () => {
    const onChange = show('mk1', ['mk2'], {
      nothingMarked: 'message',
      nothingMarkedMessage: 'Nothing is marked in Revenue.',
    });

    await userEvent.type(screen.getByLabelText('Message'), '!');

    expect(onChange).toHaveBeenCalledWith({
      nothingMarkedMessage: 'Nothing is marked in Revenue.!',
    });
  });

  it('hides the message box for a state that shows no message', () => {
    // A tile switched to another state must not leak the text it still holds.
    show('mk1', ['mk2'], { nothingMarked: 'empty' });

    expect(screen.queryByLabelText('Message')).toBeNull();
  });
});

describe('what the model allows, whatever a document says', () => {
  it('drops the tile’s own marking from a stored limit list', () => {
    /**
     * The "prevent" half. A document naming the own marking as a limit can
     * arrive hand-edited, or from a build that predates this rule, and a UI
     * that merely hides the option would apply it anyway — locking the tile
     * with no control on screen to unlock it.
     */
    expect(allowedLimits(['mk1', 'mk2'], 'mk1')).toEqual(['mk2']);
  });

  it('keeps every other limit', () => {
    expect(allowedLimits(['mk2', 'mk3'], 'mk1')).toEqual(['mk2', 'mk3']);
  });

  it('allows everything for a tile that marks with nothing', () => {
    expect(allowedLimits(['mk1', 'mk2'], undefined)).toEqual(['mk1', 'mk2']);
  });

  it('returns the same list by identity when nothing had to be removed', () => {
    // So a document that was already valid is not rewritten, which would make
    // the edit session think it changed.
    const limits = ['mk2'];

    expect(allowedLimits(limits, 'mk1')).toBe(limits);
  });
});
