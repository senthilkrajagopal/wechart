import type { MarkingPredicate, RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { UNMARKED_OPACITY } from '../marking/render';
import { optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';
import { LINK_OPACITY } from './sankey';

/**
 * T988 / AC-612: THE SYSTEM SHALL mark a Sankey node as its member and a link
 * as its (source, target) tuple (AC-087); WHILE another tile's marking
 * applies, fade unmarked links to 0.28 of their opacity and give a partly
 * marked link's share in its tooltip ("Marked: $96K of $210K"), the tile's ⓘ
 * saying a link's marked share is given in its tooltip, not drawn …
 * `Fails when: a link marks other than its tuple; a partly marked link's
 * tooltip lacks its share; the ⓘ is missing; …`
 *
 * What a click marks is read in the web package from what each node and
 * link carries (`marks`); here, that they carry it, and how a marking is
 * drawn.
 */
const CHANNEL = 'orders.channel';
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';
const MARKING = '#d9480f';
const EMPTY = { items: [], ranges: [] } as unknown as MarkingPredicate;

const FLOWS: readonly (readonly [string, string, number])[] = [
  ['Web', 'North America', 237000],
  ['Web', 'EMEA', 210000],
  ['Partner', 'EMEA', 112000],
  ['Retail', 'APAC', 31000],
];
const rowsOf = (flows: readonly (readonly [string, string, number])[]) =>
  flows.map(([channel, region, revenue]) => ({
    [CHANNEL]: channel,
    [REGION]: region,
    [REVENUE]: String(revenue),
  }));

const spec = (marking?: RenderSpec['marking']): RenderSpec =>
  ({
    chartType: 'sankey',
    encoding: { x: [CHANNEL, REGION], y: [REVENUE] },
    measures: [REVENUE],
    rows: rowsOf(FLOWS),
    titles: { [CHANNEL]: 'Channel', [REGION]: 'Region', [REVENUE]: 'Revenue' },
    formats: { [REVENUE]: 'currency' },
    measureTypes: { [REVENUE]: 'sum' },
    ...(marking === undefined ? {} : { marking }),
  }) as unknown as RenderSpec;

type Item = {
  name?: string;
  source?: string;
  target?: string;
  marks?: unknown;
  share?: { marked: number; total: number };
  itemStyle?: { opacity?: number };
  lineStyle?: { opacity?: number };
};
const sankeyOf = (option: Record<string, unknown>) =>
  (option['series'] as { type: string; data: Item[]; links: Item[] }[]).find(
    (one) => one.type === 'sankey',
  )!;
const link = (option: Record<string, unknown>, source: string, target: string) =>
  sankeyOf(option).links.find((one) => one.source === source && one.target === target)!;
const node = (option: Record<string, unknown>, name: string) =>
  sankeyOf(option).data.find((one) => one.name === name)!;

describe('what a Sankey’s nodes and links mark (AC-612)', () => {
  it('makes a node its member and a link its (source, target) tuple', () => {
    const option = optionFor(spec());
    expect(node(option, 'Web').marks).toEqual([{ member: CHANNEL, value: 'Web' }]);
    expect(node(option, 'EMEA').marks).toEqual([{ member: REGION, value: 'EMEA' }]);
    expect(link(option, 'Web', 'EMEA').marks).toEqual([
      { member: CHANNEL, value: 'Web' },
      { member: REGION, value: 'EMEA' },
    ]);
  });
});

describe('a Sankey under a marking (AC-612)', () => {
  it('fades the links outside its own marking to 0.28 of their opacity, and the nodes', () => {
    const marked = optionFor(
      spec({
        colour: MARKING,
        predicate: { ...EMPTY, items: [[{ member: CHANNEL, value: 'Web' }]] },
      }),
    );
    // A marked flow keeps the series' 0.4: no opacity of its own.
    expect(link(marked, 'Web', 'EMEA').lineStyle?.opacity ?? LINK_OPACITY).toBe(LINK_OPACITY);
    expect(link(marked, 'Partner', 'EMEA').lineStyle?.opacity).toBeCloseTo(
      LINK_OPACITY * UNMARKED_OPACITY,
    );
    expect(node(marked, 'Partner').itemStyle?.opacity).toBe(UNMARKED_OPACITY);
    expect(node(marked, 'Web').itemStyle?.opacity).toBeUndefined();
    // EMEA holds a marked flow.
    expect(node(marked, 'EMEA').itemStyle?.opacity).toBeUndefined();
  });

  it('gives a partly marked link’s share in its tooltip, under another tile’s marking', () => {
    // Another tile marked a product: its share of each flow, answered apart.
    const share = rowsOf([
      ['Web', 'EMEA', 96000],
      ['Web', 'North America', 237000],
    ]);
    const marked = optionFor(spec({ colour: MARKING, predicate: EMPTY, share }));
    const webEmea = link(marked, 'Web', 'EMEA');
    expect(webEmea.share).toEqual({ marked: 96000, total: 210000 });
    expect(webEmea.lineStyle?.opacity ?? LINK_OPACITY).toBe(LINK_OPACITY);
    expect(link(marked, 'Retail', 'APAC').lineStyle?.opacity).toBeCloseTo(
      LINK_OPACITY * UNMARKED_OPACITY,
    );

    const tooltip = marked['tooltip'] as { formatter: (params: object) => string };
    expect(tooltip.formatter({ dataType: 'edge', value: 210000, data: webEmea })).toContain(
      'Marked: $96K of $210K',
    );
    // As drawn: the unmarked flows at 0.112.
    const svg = renderToSvg(marked, { width: 600, height: 300 });
    expect(svg.match(/fill-opacity="0\.112"/g)).toHaveLength(2);
  });
});
