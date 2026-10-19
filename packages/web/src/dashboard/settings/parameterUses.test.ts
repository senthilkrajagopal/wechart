import { describe, expect, it } from 'vitest';

import type { ChartDocument } from '@wechart/core';

import type { Tile } from '../model/document';
import { CHART, DOC, META, METRIC } from './parameterFixtures';
import {
  choiceProblems,
  everyTile,
  parameterFixedNote,
  parameterUsesOf,
  whereWords,
  withoutParameter,
} from './parameterUses';

/**
 * T897 / AC-532: THE SYSTEM SHALL list a parameter's uses, each its tile and
 * where in it (a chart's well, a parameter control, a Value), as a link
 * opening that tile selected in edit mode; WHILE a choice can't be queried
 * by a chart bound to the parameter, it SHALL hold Save settings, naming the
 * chart and the choice; and WHEN a parameter in use is deleted, it SHALL
 * list the uses and ask first, each use then keeping the parameter's current
 * value as a fixed field and saying so in its tile.
 * `Fails when: a use is missing from the list, or its link opens another
 * tile; settings save with a choice a bound chart can't query, or hold
 * without naming the chart and the choice; or deleting a used parameter
 * doesn't ask, leaves a use broken, or changes its field without saying so.`
 */

const chartOf = (id: string): ChartDocument | undefined => (id === 'c1' ? CHART : undefined);

describe('a parameter’s uses (T897, AC-532)', () => {
  it('lists the chart’s Metrics well, a parameter control and a Value, each with its tile and where', () => {
    const uses = parameterUsesOf(DOC, 'p-metric', chartOf);
    expect(uses.map((use) => [use.tileId, whereWords(use, METRIC.name)])).toEqual([
      ['t-chart', 'chart · its Metrics well'],
      ['t-controls', 'Text · a parameter control'],
      ['t-summary', 'Text · the Value “Metric to show”'],
    ]);
  });

  it('names a bound chart and a choice it can’t query: one from a cube it doesn’t join', () => {
    const margin = {
      ...METRIC,
      choices: [...METRIC.choices, { member: 'products.margin_target', label: 'Margin target' }],
    };
    const document = { ...DOC, parameters: [margin] };
    expect(choiceProblems(document, margin, chartOf, META)).toEqual([
      'Revenue by month can’t query Products › Margin target',
    ]);
    // Every choice from a cube the chart joins: nothing to hold Save for.
    expect(choiceProblems(DOC, METRIC, chartOf, META)).toEqual([]);
  });

  it('deleted, each use keeps the current choice as a fixed field and its tile says so', () => {
    const { document, charts } = withoutParameter(DOC, 'p-metric', 'orders.count', chartOf);

    expect((document.parameters ?? []).map((each) => each.id)).toEqual(['p-break']);
    // The chart's well holds Orders' member; its other parameter stays bound.
    expect(charts['c1']?.chart.wells).toEqual({
      measures: ['orders.count'],
      dimensions: ['parameter:p-break'],
      timeDimensions: [],
    });
    const tiles = new Map(everyTile(document).map((tile) => [tile.id, tile]));
    const json = (tile: Tile | undefined) => JSON.stringify(tile?.document?.doc);
    // The Value takes the member as its measure; the control becomes its label.
    expect(json(tiles.get('t-summary'))).toBe(
      JSON.stringify({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'value', attrs: { measure: 'orders.count' } }] },
        ],
      }),
    );
    expect(json(tiles.get('t-controls'))).toBe(
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Orders' }] }],
      }),
    );
    // Each tile it was used in says so; no use is left following it.
    for (const id of ['t-chart', 't-controls', 't-summary'])
      expect(tiles.get(id)?.parameterFixed).toEqual([
        { parameter: 'Metric to show', label: 'Orders' },
      ]);
    expect(parameterFixedNote(tiles.get('t-chart')?.parameterFixed ?? [])).toBe(
      'Fixed at Orders: the parameter Metric to show was deleted.',
    );
    expect(parameterUsesOf(document, 'p-metric', (id) => charts[id] ?? chartOf(id))).toEqual([]);
  });

  it('deleted while unused, changes nothing else', () => {
    const unused = { ...DOC, parameters: [...(DOC.parameters ?? []), { ...METRIC, id: 'p-x' }] };
    const { document, charts } = withoutParameter(unused, 'p-x', 'orders.revenue', chartOf);
    expect(charts).toEqual({});
    expect(document).toEqual(DOC);
  });
});
