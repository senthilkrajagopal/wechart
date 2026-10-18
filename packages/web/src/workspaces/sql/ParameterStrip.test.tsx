import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { heldFor, missingValues, ParameterStrip, unboundOn, type ParamType } from './ParameterStrip';

/**
 * T809 (AC-453): each parameter in the strip under the editor has a type,
 * Text (the default), Number, Date or Boolean, and a value field; Run is
 * held, naming the parameters that have no value, until each has one.
 * Fails when: a type other than those four is offered; or a run starts while
 * a parameter has no value.
 */
function Harness({ names }: { readonly names: readonly string[] }) {
  const [types, setTypes] = useState<Record<string, ParamType>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <>
      <ParameterStrip
        names={names}
        types={types}
        values={values}
        onType={(name, type) => {
          setTypes({ ...types, [name]: type });
        }}
        onValue={(name, value) => {
          setValues({ ...values, [name]: value });
        }}
      />
      <output data-testid="values">{JSON.stringify(values)}</output>
      <output data-testid="held">{heldFor(missingValues(names, values)) ?? ''}</output>
    </>
  );
}

/**
 * T810 (AC-482): Dremio and Cube Store bind no parameter values, so a run
 * holding one is held there, saying why.
 * Fails when: Run is held without saying why.
 */
describe('a source that can’t bind parameters (T810, AC-482)', () => {
  it('names Dremio and Cube Store, and no other source', () => {
    expect(unboundOn({ driver: 'dremio' })).toBe(
      'Parameters aren’t available on Dremio. Write the value into the SQL to run it here.',
    );
    expect(unboundOn({ cubeStore: true })).toBe(
      'Parameters aren’t available on Cube Store. Write the value into the SQL to run it here.',
    );
    for (const driver of ['postgres', 'mysql', 'mssql', 'oracle', 'bigquery', 'snowflake', 'redshift', 'clickhouse'])
      expect(unboundOn({ driver }), driver).toBeNull();
  });
});

describe('the parameters strip (T809, AC-453)', () => {
  it('is a group named Parameters, each name with a type, Text first, of the four, and a value', () => {
    render(<Harness names={['region', 'since']} />);
    const strip = screen.getByRole('group', { name: 'Parameters' });

    for (const name of ['region', 'since']) {
      const type = within(strip).getByRole('combobox', { name: `${name}, type` });
      expect([...(type as HTMLSelectElement).options].map((option) => option.text)).toEqual([
        'Text',
        'Number',
        'Date',
        'Boolean',
      ]);
      expect((type as HTMLSelectElement).value).toBe('text');
      expect(within(strip).getByRole('textbox', { name: `${name}, value` })).toBeTruthy();
    }
  });

  it('says so when the SQL holds none', () => {
    render(<Harness names={[]} />);
    expect(screen.getByRole('group', { name: 'Parameters' }).textContent).toContain('No parameters');
  });

  it('a value field fits its type: a number, a date, or true and false', async () => {
    render(<Harness names={['n', 'd', 'b']} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'n, type' }), 'Number');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'd, type' }), 'Date');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'b, type' }), 'Boolean');

    expect(screen.getByRole('spinbutton', { name: 'n, value' })).toBeTruthy();
    const date = screen.getByLabelText('d, value');
    expect(date.getAttribute('type')).toBe('date');
    const boolean = screen.getByRole('group', { name: 'b, value' });
    const choices = within(boolean).getAllByRole('button');
    expect(choices.map((choice) => [choice.textContent, choice.getAttribute('aria-pressed')])).toEqual([
      ['true', 'false'],
      ['false', 'false'],
    ]);

    await userEvent.type(screen.getByRole('spinbutton', { name: 'n, value' }), '50');
    fireEvent.change(date, { target: { value: '2026-09-01' } });
    await userEvent.click(within(boolean).getByRole('button', { name: 'false' }));

    expect(JSON.parse(screen.getByTestId('values').textContent!)).toEqual({ n: '50', d: '2026-09-01', b: 'false' });
    expect(within(boolean).getByRole('button', { name: 'false' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('a type changed clears the value, which may not fit it', async () => {
    render(<Harness names={['region']} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'region, value' }), 'EMEA');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'region, type' }), 'Number');

    expect((screen.getByRole('spinbutton', { name: 'region, value' }) as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('held').textContent).toBe('Give region a value to run');
  });

  it('holds Run naming each parameter without a value, until each has one', async () => {
    render(<Harness names={['region', 'since', 'top']} />);
    expect(screen.getByTestId('held').textContent).toBe('Give region, since and top values to run');

    await userEvent.type(screen.getByRole('textbox', { name: 'region, value' }), 'EMEA');
    expect(screen.getByTestId('held').textContent).toBe('Give since and top values to run');
    await userEvent.type(screen.getByRole('textbox', { name: 'since, value' }), 'x');
    expect(screen.getByTestId('held').textContent).toBe('Give top a value to run');
    await userEvent.type(screen.getByRole('textbox', { name: 'top, value' }), '3');

    expect(screen.getByTestId('held').textContent).toBe('');
  });
});
