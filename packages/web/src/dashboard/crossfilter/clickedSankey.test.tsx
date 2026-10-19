import type { RenderSpec } from '@wechart/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SankeyNotes } from '../../tiles/SankeyNotes';
import { clickedMarkItem, clickedMarks, clickedValue } from './clicked';
import { CrossFilterChips } from './CrossFilterChip';

/**
 * T988 / AC-612: THE SYSTEM SHALL mark a Sankey node as its member and a link
 * as its (source, target) tuple (AC-087); … the tile's ⓘ saying a link's
 * marked share is given in its tooltip, not drawn; and as a cross-filter
 * source a node filters the others to its member and a link to its tuple,
 * with one chip ("Channel: Web · Region: EMEA").
 * `Fails when: a link marks other than its tuple; …; the ⓘ is missing; or
 * the chip reads otherwise.`
 *
 * A node and a link carry what they mark as drawn (`series/sankey.ts`).
 */
const CHANNEL = 'orders.channel';
const REGION = 'orders.region';
const spec = {
  chartType: 'sankey',
  encoding: { x: [CHANNEL, REGION], y: ['orders.revenue'] },
  rows: [{ [CHANNEL]: 'Web', [REGION]: 'EMEA', 'orders.revenue': '210000' }],
  measureTypes: { 'orders.revenue': 'sum' },
} as unknown as RenderSpec;

const node = {
  name: 'Web',
  seriesName: 'orders.revenue',
  marks: [{ member: CHANNEL, value: 'Web' }],
};
const link = {
  name: 'Web > EMEA',
  seriesName: 'orders.revenue',
  marks: [
    { member: CHANNEL, value: 'Web' },
    { member: REGION, value: 'EMEA' },
  ],
};

describe('a Sankey clicked (AC-612)', () => {
  it('marks a node as its member and a link as its tuple', () => {
    expect(clickedMarkItem(spec, node)).toEqual([{ member: CHANNEL, value: 'Web' }]);
    expect(clickedMarkItem(spec, link)).toEqual([
      { member: CHANNEL, value: 'Web' },
      { member: REGION, value: 'EMEA' },
    ]);
  });

  it('cross-filters by a node’s member, or a link’s tuple', () => {
    expect(clickedValue(spec, node)).toEqual({ member: CHANNEL, value: 'Web' });
    expect(clickedValue(spec, link)).toEqual({
      member: CHANNEL,
      value: 'Web',
      also: [{ member: REGION, value: 'EMEA' }],
    });
  });

  it('marks and filters nothing from "Other", which is no member', () => {
    const other = { name: 'Other', seriesName: 'orders.revenue' };
    expect(clickedValue(spec, other)).toBeUndefined();
    expect(clickedMarkItem(spec, other)).toBeUndefined();
  });

  it('reads what an item marks from what ECharts reports of it', () => {
    expect(clickedMarks({ data: { marks: link.marks } })).toEqual(link.marks);
    expect(clickedMarks({ data: { value: 3 } })).toBeUndefined();
  });

  it('says a link’s tuple in one cross-filter chip', () => {
    render(
      <CrossFilterChips
        selections={[
          {
            from: 'tile-sankey',
            member: CHANNEL,
            value: 'Web',
            also: [{ member: REGION, value: 'EMEA' }],
          },
        ]}
        onClear={() => undefined}
        memberTitle={(member) => (member === CHANNEL ? 'Channel' : 'Region')}
      />,
    );
    const chips = screen.getAllByTestId('cross-filter-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]?.querySelector('.cross-chip__what')?.textContent).toBe(
      'Channel: Web · Region: EMEA',
    );
  });

  it('says under a partly marked Sankey that a link’s marked share is in its tooltip', () => {
    render(
      <SankeyNotes
        spec={
          {
            ...spec,
            marking: {
              colour: '#000',
              predicate: { items: [], ranges: [] },
              share: [{ [CHANNEL]: 'Web', [REGION]: 'EMEA', 'orders.revenue': '96000' }],
            },
          } as unknown as RenderSpec
        }
      />,
    );
    expect(screen.getByTestId('sankey-share-info').textContent).toBe(
      'A link’s marked share is given in its tooltip, not drawn.',
    );
  });
});
