import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TextDocument, TextNode } from '@wechart/core';

import { outlineNameOf } from '../../dashboard/edit/Outline';
import { TileLoadError } from '../../query/loadTile';
import { namesFrom } from './elementName';
import { ElementsList } from './ElementsList';
import {
  ElementSkeleton,
  ElementUnavailable,
  failureOf,
  useElementPhase,
  type ElementPhase,
} from './ElementState';
import { TextTile } from './TextTile';
import { describeElement } from './ElementTooltip';

/**
 * T889 / AC-525: THE SYSTEM SHALL show in a Text tile, where a value would
 * be and keeping the sentence's shape: while loading, a skeleton the width
 * of its last value, or 4ch when it has none, with `aria-busy` on the tile;
 * with no data, "—", with "No data for these filters" in its tooltip; on an
 * error, the warning icon and "Unavailable", with Details (the measure and
 * Cube's error) on focus and Retry in the tile's ⋯; for a member the viewer
 * may not query, or whose folder their groups can't reach, "Unavailable",
 * with nothing naming the member or why; and for a member no longer in the
 * model, "Unavailable" in view mode and, in edit mode, "‹n› element needs
 * fixing" on the tile with its row marked in the Elements list; and an
 * empty Text tile SHALL show "Type, or press / to insert a live value" in
 * edit mode, nothing in view mode, and "Empty text" in the Outline.
 */
const doc = (...content: TextNode[]): TextDocument => ({
  version: 1,
  doc: { type: 'doc', content: [{ type: 'paragraph', content }] },
});

describe('an element while it loads (T889, AC-525)', () => {
  it('is a skeleton the width of its last value, or 4ch when it has none', () => {
    const { container } = render(
      <p>
        Revenue <ElementSkeleton /> and <ElementSkeleton width={7} />
      </p>,
    );
    const skeletons = container.querySelectorAll('.text-element-skeleton');
    expect([...skeletons].map((one) => (one as HTMLElement).style.width)).toEqual(['4ch', '7ch']);
    expect(container.querySelector('p')?.textContent).toBe('Revenue  and ');
  });

  it('makes its tile aria-busy while any element loads, and not after', () => {
    let phase: ElementPhase = 'loading';
    function Element() {
      useElementPhase(phase);
      return <span>value</span>;
    }
    const { container, rerender } = render(
      <TextTile
        document={doc({ type: 'value', attrs: { measure: 'orders.count' } })}
        renderElement={(_node, key) => <Element key={key} />}
      />,
    );
    const tile = container.querySelector('.text-tile');
    expect(tile?.getAttribute('aria-busy')).toBe('true');
    phase = 'ready';
    rerender(
      <TextTile
        document={doc({ type: 'value', attrs: { measure: 'orders.count' } })}
        renderElement={(_node, key) => <Element key={key} />}
      />,
    );
    expect(tile?.getAttribute('aria-busy')).toBeNull();
  });
});

describe('an element with no data (T889, AC-525)', () => {
  it('says "No data for these filters" in its tooltip', () => {
    expect(
      describeElement({ kind: 'value', measure: 'Revenue', filters: [], noData: true }),
    ).toContain('No data for these filters');
  });
});

describe('an element that failed (T889, AC-525)', () => {
  it('shows the warning icon and "Unavailable", with Details on focus', () => {
    render(
      <ElementUnavailable measure="Revenue" error={new TileLoadError('Cube said no', {}, 500)} />,
    );
    const shown = screen.getByText('Unavailable').closest('.text-element-read') as HTMLElement;
    expect(shown.querySelector('[data-icon="warn"]')).not.toBeNull();
    const tooltip = screen.getByRole('tooltip', { hidden: true });
    expect(tooltip.hidden).toBe(true);
    act(() => {
      shown.focus();
    });
    expect(tooltip.hidden).toBe(false);
    expect([...tooltip.children].map((line) => line.textContent)).toEqual([
      'Details',
      'Revenue: Cube said no',
    ]);
  });

  it('names nothing for a member the viewer may not query, the same as a folder out of reach', () => {
    const refused = [
      new TileLoadError("You requested hidden member: 'orders.margin'. Please make it…", {}, 500),
      new TileLoadError('None of these groups reaches folder sales (orders)', {}, 403),
      new TileLoadError('Forbidden', {}, 403),
    ];
    expect(refused.map(failureOf)).toEqual(['forbidden', 'forbidden', 'forbidden']);
    const drawn = refused.map((error) => {
      const { container, unmount } = render(
        <ElementUnavailable measure="Margin %" error={error} />,
      );
      const html = container.innerHTML;
      unmount();
      return html;
    });
    expect(new Set(drawn).size).toBe(1);
    expect(drawn[0]).toContain('Unavailable');
    expect(drawn[0]).not.toContain('Margin');
    expect(drawn[0]).not.toContain('orders');
    expect(drawn[0]).not.toContain('data-icon');
  });

  it('reads a member no longer in the model as "Unavailable", naming nothing', () => {
    const { container } = render(<ElementUnavailable />);
    expect(container.textContent).toBe('Unavailable');
  });
});

describe('a removed member in edit mode (T889, AC-525)', () => {
  it('marks its row in the Elements list as needing fixing', () => {
    const elements: TextNode[] = [
      { type: 'value', attrs: { measure: 'orders.revenue' } },
      { type: 'value', attrs: { measure: 'orders.gone' } },
    ];
    render(
      <ElementsList
        elements={elements}
        selected={null}
        names={namesFrom({ cubes: [], markings: [], filters: [] })}
        broken={(element) => element.attrs?.['measure'] === 'orders.gone'}
        onSelect={vi.fn()}
      />,
    );
    const rows = within(screen.getByRole('list', { name: 'Elements' })).getAllByRole('button');
    expect(rows.map((row) => row.getAttribute('data-state'))).toEqual([null, 'needs-fixing']);
    expect(rows[1]?.textContent).toContain('Needs fixing');
  });
});

describe('an empty Text tile (T889, AC-525)', () => {
  it('draws nothing in view mode, and is "Empty text" in the Outline', () => {
    const { container } = render(<TextTile document={doc()} />);
    expect(container.textContent).toBe('');
    expect(
      outlineNameOf({ id: 't', kind: 'text', w: 6, h: 6, document: doc() }, () => undefined),
    ).toBe('Empty text');
  });

  it('keeps a skeleton out of the text a value would read as', () => {
    const { container } = render(<ElementSkeleton width={3} />);
    fireEvent.focus(container);
    expect(container.textContent).toBe('');
  });
});
