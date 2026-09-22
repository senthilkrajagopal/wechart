import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EditBar } from '../dashboard/edit/EditBar';
import { CutShort } from '../filters/widgets/CutShort';
import { TileEmpty } from '../tiles/TileEmpty';
import { LossWarning } from '../workspaces/model/LossWarning';
import { StateLine } from './StatusIcon';

/**
 * T183 / AC-177: THE SYSTEM SHALL pair every status, validation and job state
 * with an icon and a text label (direction.md rule 3).
 * Fails when: any state is conveyed by colour alone.
 *
 * The states the e2e sweep (`e2e/status-labels.spec.ts`) cannot bring about
 * on the seeded model — a query with no rows, a value list cut short, an edit
 * that would drop a comment, a save under way — each held to the rule here.
 */
const iconOf = (element: Element | null) =>
  element?.querySelector('[data-icon]')?.getAttribute('data-icon');

describe('a line of state', () => {
  it('says its words with its kind’s icon, as an alert when it is a failure', () => {
    render(<StateLine kind="err">Could not load this folder.</StateLine>);
    const line = screen.getByRole('alert');
    expect(line.textContent).toBe('Could not load this folder.');
    expect(iconOf(line)).toBe('err');
  });

  it('is a status otherwise', () => {
    render(<StateLine kind="run">Loading…</StateLine>);
    expect(iconOf(screen.getByRole('status'))).toBe('run');
  });

  it('stays mounted with nothing in it while it has nothing to say — no icon alone', () => {
    const { rerender } = render(
      <StateLine kind="warn" testId="reason">
        {''}
      </StateLine>,
    );
    const line = screen.getByTestId('reason');
    expect(line.childNodes).toHaveLength(0);

    rerender(
      <StateLine kind="warn" testId="reason">
        Save is held back.
      </StateLine>,
    );
    // The same element, now with its words and its icon.
    expect(screen.getByTestId('reason')).toBe(line);
    expect(iconOf(line)).toBe('warn');
  });
});

describe('each state’s icon, beside its words', () => {
  it('on a tile whose query returned no rows', () => {
    render(<TileEmpty />);
    const headline = screen.getByText('No rows to show.').parentElement;
    expect(iconOf(headline)).toBe('idle');
  });

  it('under a list of values cut short', () => {
    render(<CutShort search />);
    expect(iconOf(screen.getByTestId('filter-options-cut'))).toBe('warn');
  });

  it('on an edit that would drop what the YAML holds', () => {
    render(
      <LossWarning
        lost={[{ kind: 'comment', text: '# keep me' }]}
        onApply={vi.fn()}
        onKeep={vi.fn()}
      />,
    );
    expect(iconOf(screen.getByRole('alert'))).toBe('warn');
  });

  it('on Save while the save is under way', () => {
    render(
      <EditBar
        changes={1}
        canUndo
        canRedo={false}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onDiscard={vi.fn()}
        onSave={vi.fn()}
        saving
      />,
    );
    const save = screen.getByRole('button', { name: 'Saving…' });
    expect(iconOf(save)).toBe('run');
  });
});
