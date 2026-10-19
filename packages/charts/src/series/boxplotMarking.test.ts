import type { MarkingPredicate, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { itemsInShape, type PixelConverter } from '../interaction/itemsInShape';
import { UNMARKED_OPACITY } from '../marking/render';
import { optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';

/**
 * T993 / AC-593: THE SYSTEM SHALL mark a box plot's point as its entity by
 * ID, at most 1,000 (AC-102), and the points inside a rectangle or lasso, and
 * a box or violin as its category member, as today …
 * `Fails when: a point marks other than its entity's ID; a box or violin
 * marks other than its member; …`
 *
 * What a click and a drag name, and so mark, is read in the web package
 * (`clicked.ts`, which turns a point's entity into its "Each point is"
 * member); here, that every point carries its entity's ID as drawn, that a
 * shape names the points inside it by their IDs where they are drawn (moved
 * sideways), that a violin names its category, and that a violin fades as
 * its box does under a marking.
 */
const REGION = 'orders.region';
const ORDER = 'orders.id';
const AMOUNT = 'orders.amount';
const MARKING = '#d9480f';

const rows = (): RenderSpec['rows'] => [
  ...Array.from({ length: 12 }, (_, at) => ({
    [REGION]: 'EMEA',
    [ORDER]: `E-${String(at)}`,
    [AMOUNT]: String(100 + at * 5),
  })),
  ...Array.from({ length: 12 }, (_, at) => ({
    [REGION]: 'APAC',
    [ORDER]: `A-${String(at)}`,
    [AMOUNT]: String(150 + at * 9),
  })),
];

const spec = (distribution: Record<string, unknown>, marking?: RenderSpec['marking']): RenderSpec =>
  ({
    chartType: 'boxplot',
    encoding: { x: [REGION], y: [AMOUNT] },
    rows: rows(),
    eachPointIs: ORDER,
    options: { distribution },
    ...(marking === undefined ? {} : { marking }),
  }) as unknown as RenderSpec;

type Item = { value?: unknown; name?: string; entity?: unknown; symbolOffset?: number[] };
type Series = { name: string; type: string; data: unknown[] };
const seriesOf = (option: Record<string, unknown>) => option['series'] as Series[];
const item = (raw: unknown): Item =>
  (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : { value: raw }) as Item;

describe('a box plot’s points carry their entity (AC-593)', () => {
  it('names each point drawn as All or Beeswarm by its Each point is value', () => {
    for (const points of ['all', 'beeswarm']) {
      const [, dots] = seriesOf(optionFor(spec({ points })));
      const drawn = (dots?.data ?? []).map(item);
      expect(drawn).toHaveLength(24);
      expect(drawn[0]).toMatchObject({ value: ['EMEA', 100], entity: 'E-0' });
      expect(drawn[13]).toMatchObject({ value: ['APAC', 159], entity: 'A-1' });
    }
  });

  it('names each outlier by its row’s entity', () => {
    const far = [...rows(), { [REGION]: 'EMEA', [ORDER]: 'E-far', [AMOUNT]: '900' }];
    const option = optionFor({ ...spec({}), rows: far });
    const [, outliers] = seriesOf(option);
    expect((outliers?.data ?? []).map(item)).toEqual([
      expect.objectContaining({ entity: 'E-far' }),
    ]);
  });

  it('carries no entity without Each point is', () => {
    const far = [...rows(), { [REGION]: 'EMEA', [ORDER]: 'E-far', [AMOUNT]: '900' }];
    const without = { ...spec({}), rows: far, eachPointIs: undefined } as unknown as RenderSpec;
    const [, outliers] = seriesOf(optionFor(without));
    expect((outliers?.data ?? []).map(item)[0]?.entity).toBeUndefined();
  });
});

/**
 * The chart stood in for by a converter: EMEA's centre at x = 100, APAC's at
 * 300, and a value v at y = 400 − v.
 */
const converter: PixelConverter = {
  convertToPixel(finder, value) {
    if (finder.xAxisIndex !== undefined)
      return value === 'EMEA' ? 100 : value === 'APAC' ? 300 : 100 * Number(value) + 100;
    return 400 - Number(value);
  },
};

describe('a shape over a box plot’s points (AC-593)', () => {
  const option = {
    xAxis: { type: 'category', data: ['EMEA', 'APAC'] },
    yAxis: { type: 'value' },
    series: [
      { type: 'boxplot', name: AMOUNT, data: [] },
      {
        type: 'scatter',
        name: `${AMOUNT} (points)`,
        data: [
          { value: ['EMEA', 100], symbolOffset: [-20, 0], entity: 'E-0' },
          { value: ['EMEA', 100], symbolOffset: [20, 0], entity: 'E-1' },
          { value: ['APAC', 150], symbolOffset: [0, 0], entity: 'A-0' },
        ],
      },
    ],
  };

  it('names the points inside it by their entity, where they are drawn', () => {
    // Around E-1 alone, 20 px right of EMEA's centre.
    const shape = { kind: 'rect', x0: 110, y0: 290, x1: 130, y1: 310 } as const;
    expect(itemsInShape(converter, option, shape)).toEqual([
      { name: 'EMEA', seriesName: `${AMOUNT} (points)`, entity: 'E-1' },
    ]);
  });

  it('names each point inside once, even where two share a value', () => {
    const shape = { kind: 'rect', x0: 0, y0: 200, x1: 400, y1: 400 } as const;
    expect(itemsInShape(converter, option, shape).map((one) => one.entity)).toEqual([
      'E-0',
      'E-1',
      'A-0',
    ]);
  });
});

describe('a violin is its category (AC-593)', () => {
  it('names each violin by its category, as a click on its box does', () => {
    const series = seriesOf(optionFor(spec({ points: 'beeswarm', violin: true })));
    const violin = series.find((one) => one.type === 'custom');
    expect((violin?.data ?? []).map((raw) => item(raw).name)).toEqual(['EMEA', 'APAC']);
  });

  it('fades the violin of a category none of whose points are marked, as its box', () => {
    const marked = spec(
      { points: 'beeswarm', violin: true },
      {
        colour: MARKING,
        predicate: {
          items: [[{ member: ORDER, value: 'A-3' }]],
          ranges: [],
        } as unknown as MarkingPredicate,
      },
    );
    const series = seriesOf(optionFor(marked));
    const violin = series.find((one) => one.type === 'custom');
    const opacities = (violin?.data ?? []).map((raw) => {
      const value = item(raw).value;
      return Array.isArray(value) ? value[3] : undefined;
    });
    expect(opacities).toEqual([UNMARKED_OPACITY, 1]);

    // As drawn: EMEA's violin at the faded opacity, APAC's at full.
    const svg = renderToSvg(optionFor(marked), { width: 600, height: 400 });
    const faded = [...svg.matchAll(/<polygon ([^>]*)>/g)].filter(([, attributes = '']) =>
      new RegExp(`opacity="${String(UNMARKED_OPACITY)}"`).test(attributes),
    );
    expect(faded).toHaveLength(1);
  });
});
