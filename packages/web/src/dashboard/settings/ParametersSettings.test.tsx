import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DashboardDocument } from '../model/document';
import { CHART, DOC, META } from './parameterFixtures';
import { ParametersSettings } from './ParametersSettings';
import { SETTINGS_SECTIONS } from './SettingsPage';

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
