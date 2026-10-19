import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SankeyNotes } from './SankeyNotes';

/**
 * T987 / AC-611: … a member appearing in a later step again split as
 * "‹member› (2)", saying so …; and past 50 flows … saying "‹n› flows: each
 * step keeps the members carrying its top 50 flows and folds the rest into
 * "Other"." `Fails when: … its split isn't said; … or the fold isn't said.`
 *
 * Said under the chart in the page's own text (rule 165), as the map's
 * unplaced codes are.
 */
const spec = (rows: RenderSpec['rows']): RenderSpec =>
  ({
    chartType: 'sankey',
    encoding: { x: ['a.from', 'a.via', 'a.to'], y: ['a.value'] },
    rows,
    measureTypes: { 'a.value': 'sum' },
  }) as unknown as RenderSpec;

describe('a Sankey’s notes (AC-611)', () => {
  it('says a split member in the page’s text', () => {
    render(
      <SankeyNotes
        spec={spec([{ 'a.from': 'EMEA', 'a.via': 'Web', 'a.to': 'EMEA', 'a.value': '3' }])}
      />,
    );
    expect(screen.getByTestId('sankey-notes').textContent).toBe(
      'EMEA is in steps 1 and 3; the second is drawn as "EMEA (2)", since flows can’t loop back.',
    );
  });

  it('says nothing where every member is drawn once', () => {
    render(
      <SankeyNotes
        spec={spec([{ 'a.from': 'EMEA', 'a.via': 'Web', 'a.to': 'APAC', 'a.value': '3' }])}
      />,
    );
    expect(screen.queryByTestId('sankey-notes')).toBeNull();
  });
});
