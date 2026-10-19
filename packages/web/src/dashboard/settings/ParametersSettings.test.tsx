import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChartDocument, RenderSpec } from '@wechart/core';

import type { DashboardDocument } from '../model/document';
import { BREAKDOWN, CHART, DOC, META, METRIC } from './parameterFixtures';
import { ParametersSettings } from './ParametersSettings';
import { SETTINGS_SECTIONS, SettingsPage } from './SettingsPage';

/**
 * T896 / AC-531: WHEN a Super-Admin or read-write member opens Dashboard
 * settings › Parameters, after Cross-filtering and before Layout and showing
 * the number of parameters, THE SYSTEM SHALL list the dashboard's parameters
 * in 34 px rows of name, kind ("Field switch"), what it switches, its number
 * of choices, its default and what uses it; and SHALL make one with New
 * parameter …
 * `Fails when: the section is missing or elsewhere; a field is missing …`
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

function Harness({ start = DOC }: { start?: DashboardDocument }) {
  const [document, setDocument] = useState(start);
  return (
    <ParametersSettings
      document={document}
      chartOf={(id) => (id === 'c1' ? CHART : undefined)}
      onChange={setDocument}
    />
  );
}

/**
 * T897 / AC-532: a parameter's uses as links opening their tiles; a choice
 * a bound chart can't query named, and Save settings held for it; deleting
 * a parameter in use asks first, listing its uses, and each use then keeps
 * the current choice.
 */
describe('a parameter’s uses, its checks and its deletion (T897, AC-532)', () => {
  const NAMES: Record<string, string> = {
    't-chart': 'Revenue by month',
    't-controls': 'Explore',
    't-summary': 'Summary',
  };

  function Uses({
    start = DOC,
    onOpenTile = vi.fn(),
    onDelete = vi.fn(),
  }: {
    start?: DashboardDocument;
    onOpenTile?: (tileId: string) => void;
    onDelete?: (next: DashboardDocument, charts: Record<string, ChartDocument>) => void;
  }) {
    const [document, setDocument] = useState(start);
    return (
      <ParametersSettings
        document={document}
        chartOf={(id) => (id === 'c1' ? CHART : undefined)}
        onChange={setDocument}
        nameOf={(id) => NAMES[id] ?? id}
        currentOf={(parameter) =>
          parameter.id === 'p-metric' ? 'orders.count' : parameter.default
        }
        onOpenTile={onOpenTile}
        onDelete={onDelete}
      />
    );
  }

  it('lists each use as a link naming its tile and where in it, which opens that tile', async () => {
    const onOpenTile = vi.fn();
    render(<Uses onOpenTile={onOpenTile} />);
    const used = screen.getByRole('list', { name: 'Used by' });
    expect(
      within(used)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Revenue by month · chart · its Metrics well',
      'Explore · Text · a parameter control',
      'Summary · Text · the Value “Metric to show”',
    ]);
    await userEvent.click(within(used).getByRole('button', { name: 'Summary' }));
    expect(onOpenTile).toHaveBeenLastCalledWith('t-summary');
    await userEvent.click(within(used).getByRole('button', { name: 'Revenue by month' }));
    expect(onOpenTile).toHaveBeenLastCalledWith('t-chart');
  });

  it('names the chart and the choice it can’t query, and says so when every choice works', async () => {
    const margin = {
      ...METRIC,
      choices: [...METRIC.choices, { member: 'products.margin_target', label: 'Margin target' }],
    };
    const { unmount } = render(<Uses />);
    expect((await screen.findByTestId('parameter-checked')).textContent).toBe(
      'Every choice works in every chart that uses this parameter.',
    );
    unmount();
    render(<Uses start={{ ...DOC, parameters: [margin, BREAKDOWN] }} />);
    expect((await screen.findByTestId('parameter-unqueryable')).textContent).toBe(
      'Revenue by month can’t query Products › Margin target',
    );
  });

  it('asks before deleting a parameter in use, listing its uses; kept, nothing changes', async () => {
    const onDelete = vi.fn();
    render(<Uses onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete parameter…' }));
    const asked = screen.getByRole('alertdialog', { name: 'Delete “Metric to show”?' });
    expect(within(asked).getByTestId('delete-parameter-said').textContent).toBe(
      'It has 3 uses. Each keeps Orders, its value now, as a fixed field, and its tile says so.',
    );
    expect(
      within(asked)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Revenue by month · chart · its Metrics well',
      'Explore · Text · a parameter control',
      'Summary · Text · the Value “Metric to show”',
    ]);
    await userEvent.click(within(asked).getByRole('button', { name: 'Keep parameter' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete parameter…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete parameter' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    const [next, charts] = onDelete.mock.calls[0] as [
      DashboardDocument,
      Record<string, ChartDocument>,
    ];
    expect((next.parameters ?? []).map((each) => each.id)).toEqual(['p-break']);
    expect(charts['c1']?.chart.wells.measures).toEqual(['orders.count']);
  });
});

describe('on the settings page (T897, AC-532)', () => {
  const margin = {
    ...METRIC,
    choices: [...METRIC.choices, { member: 'products.margin_target', label: 'Margin target' }],
  };
  const page = (
    document: DashboardDocument,
    more: Partial<Parameters<typeof SettingsPage>[0]> = {},
  ) => {
    const onSave = vi.fn();
    const onOpenTile = vi.fn();
    render(
      <SettingsPage
        document={document}
        section="Parameters"
        chartOf={(id) => (id === 'c1' ? CHART : undefined)}
        onSave={onSave}
        onCancel={vi.fn()}
        onOpenTile={onOpenTile}
        {...more}
      />,
    );
    return { onSave, onOpenTile };
  };

  it('holds Save settings while a bound chart can’t query a choice, naming both', async () => {
    const { onSave } = page({ ...DOC, parameters: [margin, BREAKDOWN] });
    await screen.findByTestId('parameter-unqueryable');
    await userEvent.type(
      within(screen.getByRole('group', { name: 'Parameter' })).getByRole('textbox', {
        name: 'Name',
      }),
      's',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('settings-save-failed').textContent).toBe(
      'Revenue by month can’t query Products › Margin target',
    );
  });

  it('a use’s link asks first while settings are unsaved, then opens its tile', async () => {
    const { onOpenTile } = page(DOC);
    await userEvent.type(
      within(screen.getByRole('group', { name: 'Parameter' })).getByRole('textbox', {
        name: 'Name',
      }),
      's',
    );
    const used = screen.getByRole('list', { name: 'Used by' });
    await userEvent.click(within(used).getAllByRole('button')[1]!);
    expect(onOpenTile).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(onOpenTile).toHaveBeenLastCalledWith('t-controls');
  });

  it('deleting a used parameter holds each fixed chart as a draft, saved with the dashboard', async () => {
    const draftsFor = vi.fn(async (charts: Record<string, ChartDocument>) =>
      Object.fromEntries(
        Object.entries(charts).map(([id, document]) => [
          id,
          { document, drawn: { spec: {} as RenderSpec }, version: 3 },
        ]),
      ),
    );
    const { onSave } = page(DOC, { draftsFor, parameterValues: { 'p-metric': 'orders.count' } });
    await userEvent.click(screen.getByRole('button', { name: 'Delete parameter…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete parameter' }));
    await waitFor(() => {
      expect(draftsFor).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    const saved = onSave.mock.calls[0]?.[0] as DashboardDocument;
    expect((saved.parameters ?? []).map((each) => each.id)).toEqual(['p-break']);
    expect(saved.chartDrafts?.['c1']?.document.chart.wells.measures).toEqual(['orders.count']);
    expect(saved.chartDrafts?.['c1']?.version).toBe(3);
  });
});

describe('Dashboard settings › Parameters (T896, AC-531)', () => {
  it('sits after Cross-filtering and before Layout', () => {
    expect(SETTINGS_SECTIONS).toEqual([
      'General',
      'Interactions',
      'Markings',
      'Cross-filtering',
      'Parameters',
      'Layout',
    ]);
  });

  it('lists each parameter: name, Field switch, what it switches, choices, default, uses', () => {
    render(<Harness />);
    const table = screen.getByRole('table', { name: 'Parameters' });
    const rows = within(table)
      .getAllByRole('row')
      .map((row) =>
        within(row)
          .queryAllByRole('cell')
          .map((cell) => cell.textContent),
      )
      .filter((cells) => cells.length > 0);
    expect(rows).toEqual([
      ['Metric to show', 'Field switch', 'Measure', '3', 'Revenue', '3 · 1 chart, 2 Text tiles'],
      ['Break down by', 'Field switch', 'Dimension', '2', 'Country', '1 · 1 chart'],
    ]);
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Name', 'Kind', 'Switches a', 'Choices', 'Default', 'Used by']);
  });

  it('makes a new one with New parameter, opened in its form', async () => {
    render(<Harness start={{ ...DOC, parameters: [] }} />);
    expect(screen.getByText('This dashboard has no parameters yet.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'New parameter' }));
    const form = screen.getByRole('group', { name: 'Parameter' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'Metric');
    expect(
      within(screen.getByRole('table', { name: 'Parameters' }))
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
        .slice(0, 3),
    ).toEqual(['Metric', 'Field switch', 'Measure']);
  });
});
