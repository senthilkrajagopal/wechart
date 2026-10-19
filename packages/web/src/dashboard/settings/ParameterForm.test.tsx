import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardParameter } from '@wechart/core';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';
import { ParameterDialog, ParameterForm } from './ParameterForm';
import { META } from './parameterFixtures';

/**
 * T896 / AC-531: … taking: a name; what it switches, Measure or Dimension, a
 * change asking first while choices are set; its choices, members of the
 * dashboard's cubes picked with the field picker and never typed, each with
 * the label its control shows, ordered by drag or by a ⋮⋮ menu of Move up
 * and Move down, at most 1,000; and a default among them; saving in edit
 * mode being one undoable change … also offered from the insert menu's
 * Parameter control and from a chart well's picker, both of which open it in
 * a 520 px dialog and return where they came from.
 * `Fails when: … a choice can be typed rather than picked …; changing what
 * it switches drops set choices without asking; or one Undo doesn't reverse
 * the save.`
 */

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(META))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const EMPTY: DashboardParameter = {
  id: 'p1',
  name: 'Metric to show',
  kind: 'fieldSwitch',
  role: 'measure',
  choices: [],
  default: '',
};

function Harness({ start = EMPTY }: { start?: DashboardParameter }) {
  const [parameter, setParameter] = useState(start);
  return (
    <>
      <ParameterForm parameter={parameter} onChange={setParameter} />
      <output data-testid="stored">{JSON.stringify(parameter)}</output>
    </>
  );
}

const stored = () =>
  JSON.parse(screen.getByTestId('stored').textContent ?? '{}') as DashboardParameter;

/** Picks a member from "+ measure" (or "+ dimension"): the field picker, never typing it in. */
async function pick(member: string, add = 'Add a measure choice') {
  await userEvent.click(screen.getByRole('button', { name: add }));
  const list = await screen.findByRole('listbox', { name: 'Fields' });
  const option = await waitFor(() => {
    const found = list.querySelector<HTMLElement>(`[data-member="${member}"]`);
    if (found === null) throw new Error(`${member} not offered`);
    return found;
  });
  fireEvent.mouseDown(option);
}

describe('a parameter’s form (T896, AC-531)', () => {
  it('picks its choices with the field picker, each labelled, and none can be typed', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a measure choice' }));
    const list = await screen.findByRole('listbox', { name: 'Fields' });
    // A measure parameter is offered measures only.
    await waitFor(() => {
      expect(
        [...list.querySelectorAll<HTMLElement>('[data-member]')].map(
          (option) => option.dataset['member'],
        ),
      ).toEqual([
        'orders.revenue',
        'orders.count',
        'orders.margin_pct',
        // The fixture's third cube, joined to neither (T897).
        'products.margin_target',
      ]);
    });
    await userEvent.keyboard('{Escape}');
    await pick('orders.revenue');
    await pick('orders.count');
    expect(stored().choices).toEqual([
      { member: 'orders.revenue', label: 'Revenue' },
      { member: 'orders.count', label: 'Count' },
    ]);
    // Its first choice is the default until another is chosen.
    expect(stored().default).toBe('orders.revenue');
    // A label is typed; the member never is: the only text fields are the name and the labels.
    const choices = screen.getByRole('list', { name: 'Choices' });
    await userEvent.clear(within(choices).getByRole('textbox', { name: 'Label for Orders Count' }));
    await userEvent.type(
      within(choices).getByRole('textbox', { name: 'Label for Orders Count' }),
      'Orders',
    );
    expect(stored().choices[1]).toEqual({ member: 'orders.count', label: 'Orders' });
    expect(
      screen.getAllByRole('textbox').map((box) => box.getAttribute('aria-label') ?? 'Name'),
    ).toEqual(['Name', 'Label for Orders Revenue', 'Label for Orders Count']);
    // The default among the choices.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Default' }), 'Orders');
    expect(stored().default).toBe('orders.count');
  });

  it('reorders by its ⋮⋮ menu', async () => {
    render(
      <Harness
        start={{
          ...EMPTY,
          choices: [
            { member: 'orders.revenue', label: 'Revenue' },
            { member: 'orders.count', label: 'Orders' },
          ],
          default: 'orders.revenue',
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Move Orders' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(stored().choices.map((choice) => choice.label)).toEqual(['Orders', 'Revenue']);
  });

  it('asks before switching what it switches while choices are set', async () => {
    render(
      <Harness
        start={{
          ...EMPTY,
          choices: [{ member: 'orders.revenue', label: 'Revenue' }],
          default: 'orders.revenue',
        }}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Dimension' }));
    const asked = screen.getByRole('alertdialog', { name: 'Switch to Dimension?' });
    await userEvent.click(within(asked).getByRole('button', { name: 'Keep measures' }));
    expect(stored().role).toBe('measure');
    expect(stored().choices).toHaveLength(1);
    await userEvent.click(screen.getByRole('radio', { name: 'Dimension' }));
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Switch and remove 1 choice',
      }),
    );
    expect(stored()).toMatchObject({ role: 'dimension', choices: [], default: '' });
    expect(screen.getByRole('button', { name: 'Add a dimension choice' })).toBeTruthy();
  });
});

describe('the New parameter dialog (T896, AC-531)', () => {
  it('is a 520 px dialog that returns focus to where it was opened from', async () => {
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Parameter control
          </button>
          {open ? (
            <ParameterDialog
              existing={[]}
              onCreate={() => {
                setOpen(false);
              }}
              onCancel={() => {
                setOpen(false);
              }}
            />
          ) : null}
        </>
      );
    }
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Parameter control' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'New parameter' });
    expect(dialog.style.width).toBe('520px');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('saving a parameter while editing (T896, AC-531)', () => {
  it('is one change, and one Undo takes it back', async () => {
    const doc: DashboardDocument = {
      schemaVersion: 1,
      title: 'Revenue',
      settings: { width: 'fixed' },
      pages: [{ id: 'p1', title: 'Overview', items: [] }],
    };
    render(<DashboardView dashboardId="d1" document={doc} specs={{}} onSave={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const settings = () => screen.getByRole('button', { name: 'Dashboard settings' });
    await userEvent.click(settings());
    await userEvent.click(screen.getByRole('button', { name: /^Parameters/ }));
    await userEvent.click(screen.getByRole('button', { name: 'New parameter' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Metric');
    await pick('orders.revenue');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    const bar = screen.getByRole('toolbar', { name: 'Dashboard editing' });
    expect(within(bar).getByRole('button', { name: /^Discard/ }).textContent).toBe(
      'Discard (1 change)',
    );
    await userEvent.click(settings());
    expect(
      screen
        .getByRole('navigation', { name: 'Settings sections' })
        .querySelector('[data-section="Parameters"]')?.textContent,
    ).toBe('Parameters1');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(within(bar).getByRole('button', { name: 'Undo' }));
    await userEvent.click(settings());
    expect(
      screen
        .getByRole('navigation', { name: 'Settings sections' })
        .querySelector('[data-section="Parameters"]')?.textContent,
    ).toBe('Parameters');
  });
});
