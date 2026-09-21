import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DATE_PRESETS } from '../model';
import { CheckboxList } from './CheckboxList';
import { DateRange } from './DateRange';
import { ListSearch } from './ListSearch';
import { NumericRange } from './NumericRange';

/**
 * T082 / AC-076: THE SYSTEM SHALL offer filter widgets for a date range with
 * presets, a list with search, a numeric range, and a checkbox list.
 *
 * Each widget is controlled: it shows the value it is given and reports the
 * value the user makes, or `undefined` for "no filter". What a value does to
 * the tiles is AC-078's.
 */
const STATUSES = ['completed', 'processing', 'shipped'];

describe('a date range', () => {
  it('offers every preset, and all time', () => {
    render(<DateRange label="Ordered at" value={undefined} onChange={vi.fn()} />);

    const options = [...screen.getByLabelText('Ordered at').querySelectorAll('option')].map(
      (option) => option.value,
    );
    expect(options).toEqual(['', ...DATE_PRESETS, 'dates']);
  });

  it('reports a preset, and all time as no filter', async () => {
    const onChange = vi.fn();
    render(<DateRange label="Ordered at" value={undefined} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Ordered at'), 'last 30 days');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'preset', preset: 'last 30 days' });

    await userEvent.selectOptions(screen.getByLabelText('Ordered at'), '');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('takes two dates when between dates is chosen', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateRange label="Ordered at" value={undefined} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Ordered at'), { target: { value: 'dates' } });
    rerender(
      <DateRange
        label="Ordered at"
        value={{ kind: 'dates', from: '', to: '' }}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'dates', from: '2026-01-01', to: '' });
  });

  it('reports two dates still to be chosen when between dates is picked', async () => {
    const onChange = vi.fn();
    render(<DateRange label="Ordered at" value={undefined} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('Ordered at'), 'dates');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'dates', from: '', to: '' });
  });
});

/**
 * Found by T082's review: the date and numeric ranges named their field only
 * to a screen reader, so a reader of a dashboard with two date filters saw two
 * "All time" menus and could not tell which filtered what.
 */
describe('every widget names its field on screen', () => {
  const shown = (text: string) => screen.getByText(text, { selector: 'label, legend' });

  it('a date range', () => {
    render(<DateRange label="Ordered at" value={undefined} onChange={vi.fn()} />);
    expect(shown('Ordered at').textContent).toBe('Ordered at');
  });

  it('a numeric range', () => {
    render(<NumericRange label="Amount" value={undefined} onChange={vi.fn()} />);
    expect(shown('Amount').textContent).toBe('Amount');
  });

  it('a list with search', () => {
    render(<ListSearch label="Status" options={STATUSES} value={undefined} onChange={vi.fn()} />);
    expect(shown('Status').textContent).toBe('Status');
  });

  it('a checkbox list', () => {
    render(<CheckboxList label="Status" options={STATUSES} value={undefined} onChange={vi.fn()} />);
    expect(shown('Status').textContent).toBe('Status');
  });
});

describe('a list with search', () => {
  it('narrows the list to what is searched for', async () => {
    render(<ListSearch label="Status" options={STATUSES} value={undefined} onChange={vi.fn()} />);

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Status' }), 'pro');

    const listed = within(screen.getByRole('group', { name: 'Status' }))
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(listed).toEqual(['processing']);
  });

  it('picks and unpicks values', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ListSearch label="Status" options={STATUSES} value={undefined} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'shipped' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'values', values: ['shipped'] });

    rerender(
      <ListSearch
        label="Status"
        options={STATUSES}
        value={{ kind: 'values', values: ['shipped'] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'shipped' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'shipped' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  /**
   * The values come from Cube, capped; a search that only looked through what
   * had arrived could not find a value past the cap (T082's review). So what is
   * typed is handed on to be asked of Cube, and a list cut short says so.
   */
  it('hands on what is searched for', async () => {
    const onSearch = vi.fn();
    render(
      <ListSearch
        label="Status"
        options={STATUSES}
        value={undefined}
        onChange={vi.fn()}
        onSearch={onSearch}
      />,
    );

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search Status' }), 'pro');
    expect(onSearch).toHaveBeenLastCalledWith('pro');
  });

  it('says when the list is cut short, and not otherwise', () => {
    const { rerender } = render(
      <ListSearch label="Status" options={STATUSES} value={undefined} onChange={vi.fn()} />,
    );
    expect(screen.queryByTestId('filter-options-cut')).toBeNull();

    rerender(
      <ListSearch
        label="Status"
        options={STATUSES}
        value={undefined}
        onChange={vi.fn()}
        cutShort
      />,
    );
    expect(screen.getByTestId('filter-options-cut').textContent).toBe(
      'Showing the first 1,000 values. Search to find others.',
    );
  });
});

describe('a numeric range', () => {
  it('reports a lowest and a highest value, and none as no filter', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <NumericRange label="Amount" value={undefined} onChange={onChange} />,
    );

    fireEvent.change(screen.getByLabelText('Amount from'), { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'range', min: 10, max: undefined });

    rerender(
      <NumericRange label="Amount" value={{ kind: 'range', min: 10 }} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText('Amount to'), { target: { value: '99' } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'range', min: 10, max: 99 });

    rerender(
      <NumericRange label="Amount" value={{ kind: 'range', min: 10 }} onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText('Amount from'), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('a checkbox list', () => {
  it('reports the values ticked', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <CheckboxList label="Status" options={STATUSES} value={undefined} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'completed' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'values', values: ['completed'] });

    rerender(
      <CheckboxList
        label="Status"
        options={STATUSES}
        value={{ kind: 'values', values: ['completed'] }}
        onChange={onChange}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'shipped' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'values', values: ['completed', 'shipped'] });
  });
});
