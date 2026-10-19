/**
 * T858 (AC-501): Synchronize axes, off by default, offered only while both
 * axes share a number format and otherwise disabled with the reason; turned
 * on, it clears the right axis's fixed minimum and maximum, with a toast
 * whose Undo brings them back.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SynchronizeSwitch } from './SynchronizeSwitch';

const REVENUE = 'orders.revenue';
const COST = 'orders.cost';
const MARGIN = 'orders.margin_pct';
const formats = { [REVENUE]: 'currency', [COST]: 'currency', [MARGIN]: 'percent' };
const label = (measure: string) =>
  ({ [REVENUE]: 'Revenue', [COST]: 'Cost', [MARGIN]: 'Margin %' })[measure] ?? measure;

function Held({ measures, start }: { measures: string[]; start: Record<string, unknown> }) {
  const [options, setOptions] = useState<Record<string, unknown>>(start);
  return (
    <>
      <SynchronizeSwitch
        measures={measures}
        options={options}
        formats={formats}
        label={label}
        onOptions={(patch) =>
          setOptions((current) => {
            const next: Record<string, unknown> = { ...current, ...patch };
            for (const [key, value] of Object.entries(patch))
              if (value === undefined) delete next[key];
            return next;
          })
        }
      />
      {/* Not an <output>, whose role is status, as the toast's is. */}
      <pre data-testid="options">{JSON.stringify(options)}</pre>
    </>
  );
}

const options = () => JSON.parse(screen.getByTestId('options').textContent ?? '{}') as unknown;

describe('Synchronize axes (T858)', () => {
  it('is disabled for $ and %, naming both formats', () => {
    render(<Held measures={[REVENUE, MARGIN]} start={{ series: { [MARGIN]: { axis: 'right' } } }} />);
    const toggle = screen.getByRole('switch', { name: 'Synchronize axes' }) as HTMLButtonElement;

    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    const reason = document.getElementById(toggle.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('Revenue is in $ and Margin % in %');
  });

  it('for $ and $, turning it on clears the right’s fixed max, and Undo restores it', async () => {
    const start = {
      series: { [COST]: { axis: 'right' } },
      axes: { right: { max: 500, title: 'Cost' } },
    };
    render(<Held measures={[REVENUE, COST]} start={start} />);
    const toggle = screen.getByRole('switch', { name: 'Synchronize axes' });

    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);

    expect(options()).toEqual({
      series: { [COST]: { axis: 'right' } },
      axes: { right: { title: 'Cost' } },
      combo: { synchronize: true },
    });
    expect(screen.getByRole('switch', { name: 'Synchronize axes' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Right axis now follows the left axis');

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(options()).toEqual(start);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  /**
   * Checkpoint 2's review (AC-501): Undo takes back what turning Synchronize
   * on did, the switch and the right's cleared ends, and keeps every edit
   * made since.
   */
  it('keeps an edit made after turning it on when Undo restores the right’s ends', async () => {
    const start = {
      series: { [COST]: { axis: 'right' } },
      axes: { right: { max: 500 } },
    };
    function Edited() {
      const [options, setOptions] = useState<Record<string, unknown>>(start);
      const onOptions = (patch: Readonly<Record<string, unknown>>) =>
        setOptions((current) => {
          const next: Record<string, unknown> = { ...current, ...patch };
          for (const [key, value] of Object.entries(patch))
            if (value === undefined) delete next[key];
          return next;
        });
      return (
        <>
          <SynchronizeSwitch
            measures={[REVENUE, COST]}
            options={options}
            formats={formats}
            label={label}
            onOptions={onOptions}
          />
          <button
            type="button"
            onClick={() =>
              setOptions((current) => ({
                ...current,
                axes: { ...(current['axes'] as object), y: { title: 'Money', log: true } },
                legend: { show: false },
              }))
            }
          >
            Edit the left axis
          </button>
          <pre data-testid="options">{JSON.stringify(options)}</pre>
        </>
      );
    }
    render(<Edited />);

    await userEvent.click(screen.getByRole('switch', { name: 'Synchronize axes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit the left axis' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(options()).toEqual({
      series: { [COST]: { axis: 'right' } },
      axes: { right: { max: 500 }, y: { title: 'Money', log: true } },
      legend: { show: false },
    });
  });

  it('turns on with no toast when the right has no fixed ends', async () => {
    render(<Held measures={[REVENUE, COST]} start={{ series: { [COST]: { axis: 'right' } } }} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Synchronize axes' }));

    expect(options()).toEqual({
      series: { [COST]: { axis: 'right' } },
      combo: { synchronize: true },
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('turns off again, leaving no combo setting behind', async () => {
    render(
      <Held
        measures={[REVENUE, COST]}
        start={{ series: { [COST]: { axis: 'right' } }, combo: { synchronize: true } }}
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: 'Synchronize axes' }));

    expect(options()).toEqual({ series: { [COST]: { axis: 'right' } } });
  });
});
