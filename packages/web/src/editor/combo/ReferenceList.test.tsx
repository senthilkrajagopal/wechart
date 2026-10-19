/**
 * T862 (AC-507; design 20 pin 10): Customize's "Reference lines and bands":
 * a row per reference with its kind's icon, label, value and axis, and a ⋯
 * menu of Edit, Duplicate and Delete, Delete with an Undo toast; + Line and
 * + Band open the form, with no limit on how many.
 */
import type { ComboReference } from '@wechart/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ReferenceList } from './ReferenceList';

const REVENUE = 'orders.revenue';
const MARGIN = 'orders.margin_pct';
const plan: ComboReference = {
  id: 'r1',
  kind: 'line',
  direction: 'horizontal',
  axis: 'left',
  value: 100000,
  label: 'Monthly plan',
};
const range: ComboReference = {
  id: 'r2',
  kind: 'band',
  direction: 'horizontal',
  axis: 'right',
  from: 0.1,
  to: 0.2,
  label: 'Target range',
};
const change: ComboReference = {
  id: 'r3',
  kind: 'line',
  direction: 'vertical',
  value: '2026-09',
  label: 'Price change',
};

function Held({
  start,
  outside = [],
}: {
  start: Record<string, unknown>;
  outside?: readonly string[];
}) {
  const [options, setOptions] = useState<Record<string, unknown>>(start);
  let next = 0;
  return (
    <>
      <ReferenceList
        options={options}
        onOptions={(patch) =>
          setOptions((current) => {
            const merged: Record<string, unknown> = { ...current, ...patch };
            for (const [key, value] of Object.entries(patch))
              if (value === undefined) delete merged[key];
            return merged;
          })
        }
        axes={[
          { axis: 'left', measures: [{ measure: REVENUE, title: 'Revenue' }] },
          { axis: 'right', measures: [{ measure: MARGIN, title: 'Margin %' }] },
        ]}
        category={{ kind: 'time', granularity: 'month' }}
        describe={(reference) =>
          reference.kind === 'band'
            ? `${String(reference.from)}–${String(reference.to)}`
            : reference.direction === 'vertical'
              ? String(reference.value)
              : `$${String(Number(reference.value) / 1000)}K`
        }
        newId={() => `new-${String((next += 1))}`}
        outside={outside}
      />
      <pre data-testid="options">{JSON.stringify(options)}</pre>
    </>
  );
}
const stored = () =>
  (JSON.parse(screen.getByTestId('options').textContent ?? '{}') as { references?: ComboReference[] })
    .references ?? [];

describe("Customize's reference lines and bands (T862)", () => {
  it('lists each with its kind’s icon, label, value and axis', () => {
    render(<Held start={{ references: [plan, range, change] }} />);
    const rows = screen.getAllByTestId('reference-row');

    expect(rows.map((row) => row.getAttribute('data-kind'))).toEqual(['line', 'band', 'line']);
    expect(rows.every((row) => row.querySelector('svg') !== null)).toBe(true);
    expect(
      rows.map((row) =>
        [...row.querySelectorAll('[data-part]')].map((part) => part.textContent),
      ),
    ).toEqual([
      ['Monthly plan', '$100K', 'left'],
      ['Target range', '0.1–0.2', 'right'],
      ['Price change', '2026-09', 'vertical'],
    ]);
  });

  it('says a reference outside its axis’s range isn’t drawn, with the warning icon (T863, AC-508)', () => {
    render(<Held start={{ references: [plan, range] }} outside={['r1']} />);
    const [first, second] = screen.getAllByTestId('reference-row');

    expect(first?.querySelector('[data-testid="reference-outside"]')?.textContent).toBe(
      'Outside the axis range',
    );
    expect(first?.querySelector('[data-testid="reference-outside"] [data-icon="warn"]')).not.toBeNull();
    expect(second?.querySelector('[data-testid="reference-outside"]')).toBeNull();
  });

  it('deletes one with an Undo toast that puts it back where it was', async () => {
    render(<Held start={{ references: [plan, range, change] }} />);

    await userEvent.click(screen.getByRole('button', { name: 'More for Target range' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(stored().map((one) => one.id)).toEqual(['r1', 'r3']);
    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Target range deleted');
    await userEvent.click(within(toast).getByRole('button', { name: 'Undo' }));

    expect(stored().map((one) => one.id)).toEqual(['r1', 'r2', 'r3']);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('duplicates one, and edits one in the form', async () => {
    render(<Held start={{ references: [plan] }} />);

    await userEvent.click(screen.getByRole('button', { name: 'More for Monthly plan' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(stored()).toEqual([plan, { ...plan, id: 'new-1', label: 'Monthly plan (copy)' }]);

    await userEvent.click(screen.getAllByRole('button', { name: /^More for Monthly plan/ })[0]!);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const label = screen.getByRole('textbox', { name: 'Label' });
    await userEvent.clear(label);
    await userEvent.type(label, 'Plan');
    await userEvent.click(screen.getByRole('button', { name: 'Save line' }));

    expect(stored().map((one) => one.label)).toEqual(['Plan', 'Monthly plan (copy)']);
    expect(screen.queryByTestId('reference-form')).toBeNull();
  });

  it('adds a line and a band from + Line and + Band', async () => {
    render(<Held start={{}} />);

    await userEvent.click(screen.getByRole('button', { name: '+ Line' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Value' }), '100000');
    await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), 'Monthly plan');
    await userEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Band' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'From' }), '90000');
    await userEvent.type(screen.getByRole('spinbutton', { name: 'To' }), '120000');
    await userEvent.type(screen.getByRole('textbox', { name: 'Label' }), 'Target range');
    await userEvent.click(screen.getByRole('button', { name: 'Add band' }));

    expect(stored().map((one) => [one.kind, one.label])).toEqual([
      ['line', 'Monthly plan'],
      ['band', 'Target range'],
    ]);
  });
});
