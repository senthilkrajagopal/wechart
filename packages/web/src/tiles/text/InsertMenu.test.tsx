import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { TextDocument, TextNode } from '@wechart/core';

import './editorTestDom';
import type { InsertSources } from './InsertMenu';
import TextEditor from './TextEditor';

/**
 * T881 / AC-517: WHEN the author types `/` at a line's start or after a
 * space, types `{{`, or presses Insert, THE SYSTEM SHALL open the insert menu
 * at the cursor, an APG combobox with a listbox, 320 px wide with 28 px rows,
 * focus staying in the text and `aria-activedescendant` marking the row,
 * listing the element kinds in three groups: Live values (Value, Change,
 * Sparkline, Icon, Bullet graph, Marking, Filter value, As of), Controls
 * (Filter control, Parameter control, Action button) and Copilot
 * (Summarize…, AC-535); as the author types, it SHALL narrow the kinds and
 * add the measures of the dashboard's cubes, grouped by cube; ↑ and ↓ SHALL
 * choose, Enter insert (on a measure, a Value of it), → on a measure list the
 * kinds that take one (Value, Change, Sparkline, Icon, Bullet graph, As of),
 * and Esc close it, leaving what was typed as text.
 * `Fails when: one of the three ways doesn't open it; a group or kind is
 * missing or out of order; a measure the author types isn't listed under its
 * cube; Enter on a measure inserts anything but a Value of it; → lists another
 * set of kinds; or Esc removes the typed text or moves focus out of the text.`
 */
const SOURCES: InsertSources = {
  cubes: [
    {
      name: 'orders',
      title: 'Orders',
      measures: [
        { name: 'orders.revenue', title: 'Revenue' },
        { name: 'orders.margin', title: 'Margin %' },
        { name: 'orders.count', title: 'Count' },
      ],
    },
    {
      name: 'products',
      title: 'Products',
      measures: [{ name: 'products.margin_target', title: 'Margin target' }],
    },
  ],
  markings: [{ name: 'Picks' }],
  filters: [{ id: 'f-country', name: 'Country' }],
};

const KINDS = [
  'Value',
  'Change',
  'Sparkline',
  'Icon',
  'Bullet graph',
  'Marking',
  'Filter value',
  'As of',
];

const doc = (...content: TextNode[]): TextDocument => ({
  version: 1,
  doc: { type: 'doc', content },
});
const line = (text: string): TextNode => ({
  type: 'paragraph',
  ...(text === '' ? {} : { content: [{ type: 'text', text }] }),
});

async function opened(
  text: string | TextNode = 'Margin sits at ',
  ai: 'on' | 'off' | 'setup' = 'on',
) {
  const copilot = ai === 'off' ? undefined : ai;
  const onLeave = vi.fn();
  render(
    <TextEditor
      document={doc(typeof text === 'string' ? line(text) : text)}
      name="EMEA summary"
      onLeave={onLeave}
      sources={SOURCES}
      copilot={copilot}
    />,
  );
  const textbox = screen.getByRole('textbox', { name: 'EMEA summary' });
  await waitFor(() => {
    expect(textbox.contains(window.document.activeElement)).toBe(true);
  });
  return { onLeave, textbox };
}

const listbox = () => screen.getByRole('listbox', { name: 'Insert' });
const groupNames = () =>
  within(listbox())
    .getAllByRole('group')
    .map((group) => group.getAttribute('aria-label'));
const rowsOf = (group: string) =>
  within(within(listbox()).getByRole('group', { name: group }))
    .getAllByRole('option')
    .map((row) => row.getAttribute('data-name'));

describe('the insert menu (T881, AC-517)', () => {
  it('opens on {{, listing Live values, Controls and Copilot in order, focus staying in the text', async () => {
    const { textbox } = await opened();
    await userEvent.keyboard('{{{{');
    expect(groupNames()).toEqual(['Live values', 'Controls', 'Copilot']);
    expect(rowsOf('Live values')).toEqual(KINDS);
    expect(rowsOf('Controls')).toEqual(['Filter control', 'Parameter control', 'Action button']);
    expect(rowsOf('Copilot')).toEqual(['Summarize…']);
    // A combobox whose focus stays in the text: the text, a textbox (AC-515),
    // takes the combobox's own attributes, aria-expanded aside, which a
    // textbox doesn't support.
    expect(textbox.contains(window.document.activeElement)).toBe(true);
    expect(textbox.getAttribute('aria-autocomplete')).toBe('list');
    expect(textbox.getAttribute('aria-controls')).toBe(listbox().id);
    const active = textbox.getAttribute('aria-activedescendant');
    expect(active).not.toBeNull();
    expect(window.document.getElementById(active ?? '')?.getAttribute('data-name')).toBe('Value');
    expect(listbox().getAttribute('data-width')).toBe('320');
  });

  it('opens on / at a line’s start and after a space, never inside a word', async () => {
    await opened('');
    await userEvent.keyboard('/');
    expect(groupNames()[0]).toBe('Live values');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();

    await userEvent.keyboard(' and/');
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.keyboard(' /');
    expect(screen.getByRole('listbox', { name: 'Insert' })).toBeTruthy();
  });

  it('opens from Insert on the toolbar, at the cursor', async () => {
    const { textbox } = await opened();
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(groupNames()).toEqual(['Live values', 'Controls', 'Copilot']);
    await waitFor(() => {
      expect(textbox.contains(window.document.activeElement)).toBe(true);
    });
    // Closed, it leaves nothing behind: nothing was typed.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(textbox.textContent).toBe('Margin sits at ');
  });

  it('narrows as the author types, adding the measures by cube; Enter on one inserts a Value of it', async () => {
    const { textbox, onLeave } = await opened();
    // A kind matches by its name, too: "mar" is Marking's start.
    await userEvent.keyboard('{{{{mar');
    expect(groupNames()).toEqual(['Live values', 'Orders', 'Products']);
    expect(rowsOf('Live values')).toEqual(['Marking']);
    await userEvent.keyboard('g');
    expect(groupNames()).toEqual(['Orders', 'Products']);
    expect(rowsOf('Orders')).toEqual(['Margin %']);
    expect(rowsOf('Products')).toEqual(['Margin target']);
    // Narrowed, the first row is the one marked.
    expect(
      window.document
        .getElementById(textbox.getAttribute('aria-activedescendant') ?? '')
        ?.getAttribute('data-name'),
    ).toBe('Margin %');

    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(textbox.textContent).not.toContain('{{');
    await userEvent.keyboard('{Escape}');
    const left = onLeave.mock.calls[0]?.[0] as TextDocument;
    expect(left.doc.content?.[0]?.content).toEqual([
      { type: 'text', text: 'Margin sits at ' },
      { type: 'value', attrs: { measure: 'orders.margin' } },
    ]);
  });

  it('chooses by ↑ and ↓, and → on a measure lists the six kinds that take one', async () => {
    const { textbox, onLeave } = await opened();
    await userEvent.keyboard('{{{{marg');
    await userEvent.keyboard('{ArrowDown}');
    const active = () =>
      window.document
        .getElementById(textbox.getAttribute('aria-activedescendant') ?? '')
        ?.getAttribute('data-name');
    expect(active()).toBe('Margin target');
    await userEvent.keyboard('{ArrowUp}');
    expect(active()).toBe('Margin %');

    await userEvent.keyboard('{ArrowRight}');
    expect(groupNames()).toEqual(['Margin %']);
    expect(rowsOf('Margin %')).toEqual([
      'Value',
      'Change',
      'Sparkline',
      'Icon',
      'Bullet graph',
      'As of',
    ]);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await userEvent.keyboard('{Escape}');
    const left = onLeave.mock.calls[0]?.[0] as TextDocument;
    expect(left.doc.content?.[0]?.content?.[1]).toEqual({
      type: 'change',
      attrs: { measure: 'orders.margin' },
    });
  });

  it('closes on Esc, leaving what was typed as text and focus in it', async () => {
    const { textbox, onLeave } = await opened();
    await userEvent.keyboard('{{{{marg');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(textbox.textContent).toBe('Margin sits at {{marg');
    expect(textbox.contains(window.document.activeElement)).toBe(true);
    expect(textbox.hasAttribute('aria-controls')).toBe(false);
    expect(textbox.hasAttribute('aria-activedescendant')).toBe(false);
    // That Esc closed only the menu; the next leaves the text.
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('inserts a kind’s element from its source: Marking from the dashboard’s markings', async () => {
    const { onLeave } = await opened();
    await userEvent.keyboard('{{{{Marking{Enter}');
    expect(rowsOf('Marking')).toEqual(['Picks']);
    await userEvent.keyboard('{Enter}{Escape}');
    const left = onLeave.mock.calls[0]?.[0] as TextDocument;
    expect(left.doc.content?.[0]?.content?.[1]).toEqual({
      type: 'marking',
      attrs: { marking: 'Picks', show: 'count' },
    });
  });

  it('lists no Copilot group where AI isn’t on for this author (AC-535)', async () => {
    await opened('', 'off');
    await userEvent.keyboard('/');
    expect(groupNames()).toEqual(['Live values', 'Controls']);
  });

  it('shows a Super-Admin Summarize… disabled, saying where AI is set up (AC-535; T881’s review)', async () => {
    const { textbox } = await opened('', 'setup');
    await userEvent.keyboard('/summ');
    const row = within(listbox()).getByRole('option', { name: /Summarize/ });
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(row.textContent).toContain('Set up AI in Security › AI');
    // Enter on it does nothing: the menu stays, the text as typed.
    await userEvent.keyboard('{Enter}');
    expect(screen.queryAllByRole('listbox', { name: 'Insert' })).toHaveLength(1);
    expect(textbox.textContent).toBe('/summ');
  });

  it('keeps the active row in view as ↓ moves it (T881’s review)', async () => {
    const scrolled = vi.fn();
    const was = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrolled;
    try {
      const { textbox } = await opened('');
      await userEvent.keyboard('/');
      await userEvent.keyboard('{ArrowDown}');
      expect(
        window.document
          .getElementById(textbox.getAttribute('aria-activedescendant') ?? '')
          ?.getAttribute('data-name'),
      ).toBe('Change');
      expect(scrolled).toHaveBeenCalled();
      const last = scrolled.mock.contexts.at(-1) as Element | undefined;
      expect(last?.getAttribute('data-name')).toBe('Change');
    } finally {
      Element.prototype.scrollIntoView = was;
    }
  });

  it('opened by Insert over a selection, keeps the selection, and Esc takes back only its own {{ (T881’s review)', async () => {
    const { textbox } = await opened('Revenue');
    await userEvent.keyboard('{Control>}a{/Control}');
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }));
    expect(screen.queryAllByRole('listbox', { name: 'Insert' })).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    expect(textbox.textContent).toBe('Revenue');
  });

  it('doesn’t open on / straight after emphasis or an element, which is inside a word', async () => {
    await opened({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Revenue ' },
        { type: 'value', attrs: { measure: 'orders.revenue' } },
      ],
    });
    await userEvent.keyboard('/');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('is one menu when / and {{ are both typed: one Esc closes it, the next leaves the text', async () => {
    const { onLeave } = await opened('');
    await userEvent.keyboard('/{{{{');
    expect(screen.queryAllByRole('listbox', { name: 'Insert' })).toHaveLength(1);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
