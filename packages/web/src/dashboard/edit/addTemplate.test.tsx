import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '../DashboardView';
import type { DashboardDocument } from '../model/document';
import { SECTION_TEMPLATES } from './templates';

/**
 * T074 / AC-068, the way in: the Add panel offers the templates and a click
 * lays one out. direction.md section 2 puts them there — "the element
 * palette, 'Chart from folders' with search, and section templates".
 *
 * `templates.test.ts` holds what a template *is*; this holds that the user can
 * reach one, that its tiles land where the panel said they would, and that
 * what lands is still empty. A template that inserted correctly into the wrong
 * container would pass the model tests and be useless.
 */
const DOC: DashboardDocument = {
  schemaVersion: 1,
  title: 'Revenue',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 'a', kind: 'markdown', w: 6, h: 16, text: 'Notes' },
        { id: 's1', kind: 'section', title: 'Detail', items: [] },
      ],
    },
  ],
};

const edit = async () => {
  render(<DashboardView dashboardId="d1" document={DOC} specs={{}} onSave={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
};

const tileIds = () => screen.getAllByTestId('grid-item').map((item) => item.dataset['tile'] ?? '');

/**
 * What a template put on the canvas, in the order it sits there — the seeded
 * tiles that were already present left out, so a case reads as the layout the
 * template was supposed to make.
 */
const laidOut = () =>
  screen
    .getAllByTestId('grid-item')
    .map((item) => {
      if (item.querySelector('[data-testid="tile-empty-chart"]') !== null) return 'chart';
      // The notes tile, by its rendered heading (AC-208).
      return item.querySelector('h3')?.textContent === 'Notes' ? 'notes' : '';
    })
    .filter((kind) => kind !== '');

describe('adding a section template', () => {
  it('offers every template, with what it lays out', async () => {
    await edit();

    for (const template of SECTION_TEMPLATES) {
      const button = screen.getByTestId(`template-${template.id}`);
      expect(button.textContent).toContain(template.label);
      expect(button.textContent).toContain(template.hint);
    }
  });

  it('lays out the KPI row as four empty tiles', async () => {
    await edit();
    const before = tileIds().length;

    await userEvent.click(screen.getByTestId('template-kpis'));

    expect(tileIds().length).toBe(before + 4);
    // Four tiles, and every one of them still empty: the criterion's point.
    expect(screen.getAllByTestId('tile-empty-chart')).toHaveLength(4);
  });

  /**
   * T132 (AC-126; T074's note): a template's chart tiles each get a chart of
   * their own, local to the dashboard — so each has its way into the editor.
   */
  it('gives each of its chart tiles a chart of its own, with the way in', async () => {
    await edit();

    await userEvent.click(screen.getByTestId('template-kpis'));

    const empties = screen.getAllByTestId('tile-empty-chart');
    expect(empties).toHaveLength(4);
    for (const empty of empties) {
      expect(empty.textContent).toContain('Add its fields in the chart editor');
      const tile = empty.closest('[data-testid="grid-item"]') as HTMLElement;
      expect(tile.querySelector('[data-edit-chart]')).not.toBeNull();
    }
  });

  it('lays out the notes template as a chart and a markdown tile', async () => {
    await edit();

    await userEvent.click(screen.getByTestId('template-notes'));

    expect(screen.getAllByTestId('tile-empty-chart')).toHaveLength(1);

    /**
     * The markdown tile arrives with prompting text rather than blank, so the
     * pair reads as a layout waiting to be filled in rather than as damage.
     *
     * Asserted as the exact strings the template produces, rendered (AC-208):
     * its heading as a heading and its sentence as a paragraph — before T221
     * the tile showed its markdown unparsed, "## Notes" and all.
     */
    expect(screen.getByRole('heading', { name: 'Notes', level: 3 }).textContent).toBe('Notes');
    const paragraphs = [...window.document.querySelectorAll('p')].map((p) => p.textContent);
    expect(paragraphs).toContain('Describe what this chart shows.');
  });

  it('puts the tiles in the container the panel named, not on the page', async () => {
    await edit();

    // Aim at the section's own "+ Add" slot, the way the panel's destination
    // line says it will be used.
    await userEvent.click(screen.getByTestId('add-here-sec:s1'));
    await userEvent.click(screen.getByTestId('template-two'));

    const section = screen
      .getAllByTestId('grid-item')
      .find((item) => item.dataset['tile'] === 's1');
    expect(section?.querySelectorAll('[data-testid="tile-empty-chart"]')).toHaveLength(2);
  });

  it('lays the tiles out in the order the template names them, after a selection', async () => {
    /**
     * The order is the template: "Empty chart 8 + markdown 4" is a chart with
     * notes beside it, and notes-then-chart is a different layout wearing the
     * same name.
     *
     * With nothing selected an insert appends, and appending in a loop happens
     * to preserve order — so every other case here would pass with the tiles
     * reversed. This one selects a tile first, which is what makes the
     * insertion point a *position* rather than the end, and it is the ordinary
     * case: inserting anything selects it, so the second template a user adds
     * in a session already takes this path.
     */
    await edit();
    await userEvent.click(screen.getAllByTestId('grid-item')[0] as HTMLElement);

    await userEvent.click(screen.getByTestId('template-notes'));

    expect(laidOut()).toEqual(['chart', 'notes']);
  });

  it('keeps the order when a template follows another template', async () => {
    // The same trap by a different route: the first insert selects what it
    // added, so the second one is never an append.
    await edit();
    await userEvent.click(screen.getByTestId('template-notes'));
    await userEvent.click(screen.getByTestId('template-notes'));

    expect(laidOut()).toEqual(['chart', 'notes', 'chart', 'notes']);
  });

  it('counts as one undoable change, not one per tile', async () => {
    await edit();
    await userEvent.click(screen.getByTestId('template-kpis'));

    // Four tiles arrive together and go back together. A template that took
    // four undos to reverse is one nobody would risk trying.
    expect(screen.getByRole('button', { name: /^Discard/ }).textContent).toBe('Discard (1 change)');

    await userEvent.click(
      within(screen.getByRole('toolbar', { name: 'Dashboard editing' })).getByRole('button', {
        name: 'Undo',
      }),
    );

    expect(screen.queryAllByTestId('tile-empty-chart')).toHaveLength(0);
  });
});
