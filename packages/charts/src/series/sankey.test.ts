import type { RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { describe, expect, it } from 'vitest';

import { isDrawable, optionFor } from '../optionFor';
import { renderToSvg } from '../testing/renderToSvg';
import { DEFAULT_PALETTE } from '../theme';
import { SANKEY_FLOW_CAP, sankeyNotes } from './sankey';

/**
 * T987 / AC-611: THE SYSTEM SHALL draw a Sankey's nodes 12 px wide, the
 * colouring step's nodes in their members' colours and the other steps' in
 * `text-secondary`; links in that colour at 0.4, 0.6 when hovered; labels
 * outside the nodes with their totals; a member appearing in a later step
 * again split as "‹member› (2)", saying so ("EMEA is in steps 1 and 3; the
 * second is drawn as "EMEA (2)", since flows can't loop back."); and past 50
 * flows, each step keeping the members that carry its top 50 flows and
 * folding the rest into "Other", saying "‹n› flows: each step keeps the
 * members carrying its top 50 flows and folds the rest into "Other"."
 * `Fails when: a size, colour or opacity differs; a repeated member makes a
 * cycle, or its split isn't said; or more than 50 flows draw, or the fold
 * isn't said.`
 *
 * Drawn by ECharts' own `sankey` series (research/echarts-sankey.md), and
 * rendered for real.
 */
const CHANNEL = 'orders.channel';
const REGION = 'orders.region';
const SEGMENT = 'orders.segment';
const REVENUE = 'orders.revenue';
const INK = COLORS.light['text-secondary'];

const FLOWS: readonly (readonly [string, string, number])[] = [
  ['Web', 'North America', 237000],
  ['Web', 'EMEA', 210000],
  ['Web', 'APAC', 120000],
  ['Web', 'LATAM', 84000],
  ['Partner', 'North America', 118000],
  ['Partner', 'EMEA', 112000],
  ['Partner', 'APAC', 70000],
  ['Partner', 'LATAM', 54000],
  ['Retail', 'North America', 183000],
  ['Retail', 'EMEA', 90000],
  ['Retail', 'APAC', 31000],
  ['Retail', 'LATAM', 38000],
];

const spec = (
  rows: RenderSpec['rows'],
  steps: readonly string[] = [CHANNEL, REGION],
  options?: Record<string, unknown>,
): RenderSpec =>
  ({
    chartType: 'sankey',
    encoding: { x: [...steps], y: [REVENUE] },
    measures: [REVENUE],
    rows,
    titles: {
      [CHANNEL]: 'Channel',
      [REGION]: 'Region',
      [SEGMENT]: 'Segment',
      [REVENUE]: 'Revenue',
    },
    formats: { [REVENUE]: 'currency' },
    measureTypes: { [REVENUE]: 'sum' },
    ...(options === undefined ? {} : { options }),
  }) as unknown as RenderSpec;

const channelToRegion = () =>
  spec(
    FLOWS.map(([channel, region, revenue]) => ({
      [CHANNEL]: channel,
      [REGION]: region,
      [REVENUE]: String(revenue),
    })),
  );

type Node = {
  name: string;
  depth: number;
  itemStyle: { color: string };
  label?: { position?: string };
};
type Link = { source: string; target: string; value: number };
type Sankey = {
  type: string;
  nodeWidth: number;
  draggable: boolean;
  data: Node[];
  links: Link[];
  lineStyle: { color: string; opacity: number };
  emphasis: { lineStyle: { opacity: number; color: string } };
  label: { formatter: (params: { name: string; value: number }) => string };
};
const sankeyOf = (option: Record<string, unknown>) =>
  (option['series'] as Sankey[]).find((one) => one.type === 'sankey');

describe('drawing a Sankey (AC-611)', () => {
  it('is drawable', () => {
    expect(isDrawable('sankey')).toBe(true);
  });

  it('draws a node per step’s member, 12 px wide, in its step’s column', () => {
    const series = sankeyOf(optionFor(channelToRegion()));
    expect(series?.nodeWidth).toBe(12);
    expect(series?.draggable).toBe(false);
    expect(series?.data.map((node) => [node.name, node.depth])).toEqual([
      ['Web', 0],
      ['Partner', 0],
      ['Retail', 0],
      ['North America', 1],
      ['EMEA', 1],
      ['APAC', 1],
      ['LATAM', 1],
    ]);
    expect(series?.links).toHaveLength(12);
    expect(series?.links[0]).toMatchObject({
      source: 'Web',
      target: 'North America',
      value: 237000,
    });
  });

  it('colours the source step’s members and greys the others, links in their source’s colour at 0.4, 0.6 hovered', () => {
    const series = sankeyOf(optionFor(channelToRegion()));
    const colours = Object.fromEntries(
      series!.data.map((node) => [node.name, node.itemStyle.color]),
    );
    expect(colours['Web']).toBe(DEFAULT_PALETTE[0]);
    expect(colours['Partner']).toBe(DEFAULT_PALETTE[1]);
    expect(colours['Retail']).toBe(DEFAULT_PALETTE[2]);
    expect(colours['EMEA']).toBe(INK);
    expect(series?.lineStyle).toMatchObject({ color: 'source', opacity: 0.4 });
    expect(series?.emphasis.lineStyle).toMatchObject({ color: 'source', opacity: 0.6 });

    // Colour links by Target: the last step takes the colours.
    const byTarget = sankeyOf(
      optionFor({ ...channelToRegion(), options: { sankey: { colourLinksBy: 'target' } } }),
    );
    const target = Object.fromEntries(
      byTarget!.data.map((node) => [node.name, node.itemStyle.color]),
    );
    expect(target['Web']).toBe(INK);
    expect(target['North America']).toBe(DEFAULT_PALETTE[0]);
    expect(byTarget?.lineStyle.color).toBe('target');
  });

  it('labels each node outside it with its total', () => {
    const series = sankeyOf(optionFor(channelToRegion()));
    expect(series?.label.formatter({ name: 'Web', value: 651000 })).toBe('Web\n$651,000');
    const positions = Object.fromEntries(
      series!.data.map((node) => [node.name, node.label?.position]),
    );
    expect(positions['Web']).toBe('left');
    expect(positions['EMEA']).toBe('right');
  });

  it('says a link’s value and its share of its source and target in its tooltip', () => {
    const tooltip = optionFor(channelToRegion())['tooltip'] as {
      formatter: (params: Record<string, unknown>) => string;
    };
    expect(
      tooltip.formatter({
        dataType: 'edge',
        value: 210000,
        data: { source: 'Web', target: 'EMEA', value: 210000 },
      }),
    ).toBe('Web → EMEA<br/>Revenue: $210,000<br/>32 % of Web · 51 % of EMEA');
    expect(tooltip.formatter({ dataType: 'node', name: 'Web', value: 651000 })).toBe(
      'Web<br/>Revenue: $651,000',
    );
  });

  it('draws 12 px nodes and links at 0.4 as rendered', () => {
    const svg = renderToSvg(optionFor(channelToRegion()), { width: 600, height: 300 });
    const links = [...svg.matchAll(/<path d="M[^"]*C[^"]*"[^>]*>/g)].map(([tag]) => tag);
    expect(links).toHaveLength(12);
    for (const link of links) expect(link).toContain('fill-opacity="0.4"');
    const nodes = [...svg.matchAll(/<path d="M[\d.]+ [\d.]+l([\d.]+) 0/g)].map(([, width]) =>
      Number(width),
    );
    expect(nodes).toHaveLength(7);
    for (const width of nodes) expect(width).toBe(12);
  });

  it('splits a member repeated in a later step as "EMEA (2)", and says so', () => {
    const rows = [
      { [CHANNEL]: 'EMEA', [REGION]: 'Web', [SEGMENT]: 'EMEA', [REVENUE]: '10' },
      { [CHANNEL]: 'EMEA', [REGION]: 'Retail', [SEGMENT]: 'APAC', [REVENUE]: '5' },
    ];
    const repeated = spec(rows, [CHANNEL, REGION, SEGMENT]);
    const series = sankeyOf(optionFor(repeated));
    expect(series?.data.map((node) => node.name)).toEqual([
      'EMEA',
      'Web',
      'Retail',
      'EMEA (2)',
      'APAC',
    ]);
    expect(series?.links).toContainEqual(
      expect.objectContaining({ source: 'Web', target: 'EMEA (2)' }),
    );
    expect(sankeyNotes(repeated)).toEqual([
      'EMEA is in steps 1 and 3; the second is drawn as "EMEA (2)", since flows can’t loop back.',
    ]);
    // Rendered: no cycle.
    expect(() => renderToSvg(optionFor(repeated))).not.toThrow();
  });

  it('past 50 flows keeps the members carrying the top flows, folds the rest into "Other", and says so', () => {
    // 214 flows: 107 channels into 2 regions.
    const rows = Array.from({ length: 107 }, (_, at) => [
      { [CHANNEL]: `C${String(at)}`, [REGION]: 'EMEA', [REVENUE]: String(1000 - at) },
      { [CHANNEL]: `C${String(at)}`, [REGION]: 'APAC', [REVENUE]: String(500 - at) },
    ]).flat();
    const many = spec(rows);
    const series = sankeyOf(optionFor(many));
    expect(SANKEY_FLOW_CAP).toBe(50);
    expect(series!.links.length).toBeLessThanOrEqual(50);
    const names = series!.data.map((node) => node.name);
    expect(names).toContain('Other');
    expect(names).toContain('C0');
    expect(names).not.toContain('C106');
    // Nothing dropped: the flows still add up.
    const total = series!.links.reduce((sum, link) => sum + link.value, 0);
    expect(total).toBe(rows.reduce((sum, row) => sum + Number(row[REVENUE]), 0));
    expect(sankeyNotes(many)).toEqual([
      '214 flows: each step keeps the members carrying its top 50 flows and folds the rest into "Other".',
    ]);
    expect(() => renderToSvg(optionFor(many))).not.toThrow();
  });

  it('draws nothing while the spec is refused', () => {
    const average = { ...channelToRegion(), measureTypes: { [REVENUE]: 'avg' } } as RenderSpec;
    expect(sankeyOf(optionFor(average))).toBeUndefined();
    const oneStep = spec(channelToRegion().rows, [CHANNEL]);
    expect(sankeyOf(optionFor(oneStep))).toBeUndefined();
  });
});
