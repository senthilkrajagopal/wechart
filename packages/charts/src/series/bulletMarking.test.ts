import type { MarkingPredicate, RenderSpec } from '@wechart/core';
import { COLORS } from '@wechart/ui';
import { describe, expect, it } from 'vitest';

import { itemsInShape } from '../interaction/itemsInShape';
import { MARKED_OUTLINE_PX, UNMARKED_OPACITY } from '../marking/render';
import { optionFor } from '../optionFor';

/**
 * T955 / AC-582: THE SYSTEM SHALL make a bullet its member: a click marks it,
 * Ctrl/⌘ toggles it, and a drag marks the bullets it touches; WHILE another
 * tile's marking covers part of a member, the value bar SHALL draw the marked
 * share from zero at full strength and fade the rest, an additive measure
 * only, a non-additive one showing "Marked: ‹X›" in its tooltip; and as a
 * cross-filter source a bullet SHALL filter the others to its member.
 * `Fails when: a gesture marks otherwise; a non-additive bar draws a marked
 * share; or a bullet doesn't filter.`
 *
 * What a click and a drag name, and so mark and filter, is read in the web
 * package (`clicked.ts`); here, that every mark of a bullet names its member,
 * and how a marking is drawn on it.
 */
const REGION = 'orders.region';
const REVENUE = 'orders.revenue';
const MARKING = '#d9480f';
const INK = COLORS.light['text-primary'];

const ROWS = [
  ['EMEA', 412000, 450000],
  ['North America', 538000, 520000],
  ['LATAM', 176000, 200000],
  ['APAC', 221000, 225000],
] as const;

const EMPTY = { items: [], ranges: [] } as unknown as MarkingPredicate;

const spec = (marking?: RenderSpec['marking']): RenderSpec =>
  ({
    chartType: 'bullet',
    encoding: { x: [REGION], y: [REVENUE] },
    measures: [REVENUE],
    rows: ROWS.map(([region, revenue]) => ({ [REGION]: region, [REVENUE]: String(revenue) })),
    options: { bullet: { target: { kind: 'value', value: 500000 } } },
    formats: { [REVENUE]: 'currency' },
    titles: { [REGION]: 'Region', [REVENUE]: 'Revenue' },
    ...(marking === undefined ? {} : { marking }),
  }) as unknown as RenderSpec;

type Item = {
  value?: unknown;
  name?: string;
  itemStyle?: Record<string, unknown>;
  share?: unknown;
};
type Series = { name: string; type: string; stack?: string; yAxisIndex?: number; data: unknown[] };
const seriesOf = (option: Record<string, unknown>) => option['series'] as Series[];
const item = (raw: unknown): Item =>
  (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : { value: raw }) as Item;
/** The value bar: the one bar on the hidden member axis. */
const barsOf = (option: Record<string, unknown>) =>
  seriesOf(option).filter((one) => one.type === 'bar' && one.yAxisIndex === 1);
const bandsOf = (option: Record<string, unknown>) =>
  seriesOf(option).filter((one) => one.type === 'bar' && one.stack === 'bands');

describe('a bullet is its member (AC-582)', () => {
  it('names its member from every mark: bands, value bar and target', () => {
    const option = optionFor(spec());
    const target = seriesOf(option).find((one) => one.type === 'scatter');
    expect(target?.data.map((raw) => item(raw).name)).toEqual(ROWS.map(([region]) => region));
    // A drag over the chart takes the bullets it touches, by member.
    const chart = {
      convertToPixel: (finder: { xAxisIndex?: number; yAxisIndex?: number }, value: unknown) =>
        finder.yAxisIndex === undefined
          ? Number(value) / 1000
          : typeof value === 'number'
            ? value * 48 + 24
            : ROWS.findIndex(([region]) => region === value) * 48 + 24,
      getHeight: () => 192,
      getWidth: () => 640,
    };
    // A rectangle over the first two rows, from zero.
    const touched = itemsInShape(chart, option, {
      kind: 'rect',
      x0: 0,
      y0: 10,
      x1: 100,
      y1: 80,
    } as Parameters<typeof itemsInShape>[2]);
    expect([...new Set(touched.map((one) => one.name))].sort()).toEqual(['EMEA', 'North America']);
  });

  it('outlines a marked bullet’s value bar and fades every other bullet, bands and all', () => {
    const predicate = {
      ...EMPTY,
      items: [[{ member: REGION, value: 'EMEA' }]],
    } as unknown as MarkingPredicate;
    const option = optionFor(spec({ predicate, colour: MARKING }));
    const [bar] = barsOf(option);
    expect(item(bar?.data[0]).itemStyle).toMatchObject({
      borderColor: MARKING,
      borderWidth: MARKED_OUTLINE_PX,
    });
    expect(item(bar?.data[1]).itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    for (const band of bandsOf(option)) {
      // The marked bullet's bands as they were, never outlined; the rest faded.
      expect(item(band.data[0]).itemStyle?.['borderWidth'] ?? 0).toBe(0);
      expect(item(band.data[0]).itemStyle?.['opacity'] ?? 1).toBe(1);
      expect(item(band.data[1]).itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    }
  });
});

describe('a bullet partly marked by another tile (AC-582)', () => {
  const share = (aggType: string) => ({
    predicate: {
      ...EMPTY,
      items: [[{ member: 'orders.channel', value: 'Web' }]],
    } as unknown as MarkingPredicate,
    colour: MARKING,
    share: [{ [REGION]: 'EMEA', [REVENUE]: '210000' }],
    aggTypes: { [REVENUE]: aggType },
  });

  it('draws a summed measure’s marked share from zero at full strength, the rest faded', () => {
    const option = optionFor(spec(share('sum')));
    const bars = barsOf(option);
    expect(bars).toHaveLength(2);
    const [marked, rest] = bars;
    expect(marked?.stack).toBe(rest?.stack);
    expect(item(marked?.data[0]).value).toBe(210000);
    expect(item(marked?.data[0]).itemStyle).toMatchObject({ opacity: 1, borderColor: MARKING });
    expect(item(rest?.data[0]).value).toBe(412000 - 210000);
    expect(item(rest?.data[0]).itemStyle?.['opacity']).toBe(UNMARKED_OPACITY);
    // Only the value bar splits: the bands are the target's, not the measure's.
    expect(bandsOf(option)).toHaveLength(3);
    for (const band of bandsOf(option)) expect(band.data).toHaveLength(4);
    expect(item(bars[0]?.data[0]).itemStyle?.['color'] ?? INK).toBe(INK);
  });

  it('draws an average whole, hatched, its marked value said in the tooltip', () => {
    const option = optionFor(spec(share('avg')));
    const bars = barsOf(option);
    const drawn = bars.flatMap((one) => one.data.map(item)).filter((one) => one.value !== null);
    // EMEA's bar is one length, never a share of it.
    const emea = drawn.filter((one) => one.value === 412000);
    expect(emea).toHaveLength(1);
    expect(emea[0]?.itemStyle?.['decal']).toBeDefined();
    // Its whole value, the part a split bar's remainder is (`ItemShare`).
    expect(emea[0]?.share).toEqual({ marked: 210000, total: 412000, part: 'rest' });
    // Its tooltip says both.
    const rest = bars.find((one) => one.data.some((raw) => item(raw).value === 412000));
    const formatter = (option['tooltip'] as { formatter: (params: unknown) => string }).formatter;
    expect(
      formatter({
        name: 'EMEA',
        seriesName: rest?.name,
        seriesIndex: seriesOf(option).indexOf(rest as Series),
        value: 412000,
        data: emea[0],
      }),
    ).toContain('Marked: $210,000');
  });
});
