import { formatValue, type RenderSpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { optionFor } from '../optionFor';

/**
 * T957 / AC-584: … at 100 %, the value axis SHALL be fixed at 0–100 % with
 * ticks every 25 %, include zero and log scale not offered; folding to
 * "Other" (AC-041) and the row limit SHALL apply before shares are taken, so
 * each bar's or point's drawn shares add to 100 %; tooltips SHALL give both
 * value and share ("Web: $210K · 51 % of EMEA"); and with 4 series or fewer,
 * direct labels SHALL sit at the last bar.
 * `Fails when: … the axis passes 100 % or isn't in steps of 25 %; a bar's
 * drawn shares don't add to 100 %, or shares are taken before folding; or a
 * tooltip lacks the value or the share.`
 */
const REGION = 'orders.region';
const CHANNEL = 'orders.channel';
const REVENUE = 'orders.revenue';
const FORMATS = { [REVENUE]: 'currency' };

const rowsOf = (channels: readonly string[]) =>
  ['EMEA', 'APAC', 'LATAM'].flatMap((region, r) =>
    channels.map((channel, c) => ({
      [REGION]: region,
      [CHANNEL]: channel,
      [REVENUE]: String(r === 0 && channel === 'Web' ? 210000 : (c + 1) * 50000 + r * 1000),
    })),
  );

const spec = (
  chartType: 'stackedBar' | 'stackedArea',
  options: Record<string, unknown>,
  channels: readonly string[] = ['Web', 'Store', 'Phone'],
): RenderSpec =>
  ({
    chartType,
    encoding: { x: [REGION], color: [CHANNEL], y: [REVENUE] },
    rows: rowsOf(channels),
    options,
    formats: FORMATS,
  }) as unknown as RenderSpec;

type Series = { name: string; data: unknown[]; label?: { show?: boolean } };
const valueOf = (item: unknown) =>
  typeof item === 'object' && item !== null ? (item as { value: number | null }).value : item;
const seriesOf = (option: Record<string, unknown>) => option['series'] as Series[];

describe('a stack drawn at 100 % (AC-584)', () => {
  for (const chartType of ['stackedBar', 'stackedArea'] as const) {
    it(`draws a ${chartType}'s shares adding to 100 in every category, on a 0–100 % axis every 25 %`, () => {
      const option = optionFor(spec(chartType, { stack: 'percent' }));
      const series = seriesOf(option);
      for (const at of [0, 1, 2]) {
        const total = series.reduce((sum, one) => sum + Number(valueOf(one.data[at]) ?? 0), 0);
        expect(Math.abs(total - 100)).toBeLessThan(1e-9);
      }
      const axis = option['yAxis'] as Record<string, unknown>;
      expect(axis).toMatchObject({ type: 'value', min: 0, max: 100, interval: 25 });
      const label = axis['axisLabel'] as { formatter: (value: number) => string };
      expect(label.formatter(25)).toBe('25 %');
    });
  }

  it('keeps a stored log scale and min and max off the 100 % axis', () => {
    const option = optionFor(
      spec('stackedBar', { stack: 'percent', axes: { y: { log: true, min: 5, max: 500 } } }),
    );
    expect(option['yAxis']).toMatchObject({ type: 'value', min: 0, max: 100, interval: 25 });
  });

  it('says each series’ value and its share of the category in the tooltip', () => {
    const option = optionFor(spec('stackedBar', { stack: 'percent' }));
    const tooltip = option['tooltip'] as { formatter: (params: unknown) => string };
    const series = seriesOf(option);
    const params = series.map((one, seriesIndex) => ({
      seriesName: one.name,
      seriesIndex,
      dataIndex: 0,
      name: 'EMEA',
      value: valueOf(one.data[0]),
    }));
    const text = tooltip.formatter(params);
    const web = formatValue(210000, REVENUE, FORMATS);
    // 210,000 of 210,000 + 100,000 + 150,000.
    expect(text).toContain(`Web: ${web} · 46 % of EMEA`);
    expect(text).toContain('EMEA');
  });

  it('folds 12 channels to 7 and "Other (5)" before shares are taken', () => {
    const channels = ['Web', ...Array.from({ length: 11 }, (_, at) => `Channel ${String(at + 2)}`)];
    const option = optionFor(spec('stackedBar', { stack: 'percent' }, channels));
    const names = seriesOf(option).map((one) => one.name);
    expect(names).toHaveLength(8);
    expect(names).toContain('Other (5)');
    const total = seriesOf(option).reduce((sum, one) => sum + Number(valueOf(one.data[1]) ?? 0), 0);
    expect(Math.abs(total - 100)).toBeLessThan(1e-9);
  });

  it('names 4 series or fewer directly, beside the last bar, as at Sum', () => {
    const option = optionFor(spec('stackedBar', { stack: 'percent' }));
    for (const one of seriesOf(option)) {
      const shown = one.data.flatMap((item, at) =>
        (item as { label?: { show?: boolean } }).label?.show === true ? [at] : [],
      );
      expect(shown).toEqual([2]);
    }
  });

  it('draws a stack at Sum as it always has', () => {
    const sum = optionFor(spec('stackedBar', {}));
    const values = seriesOf(sum)[0]?.data.map(valueOf);
    expect(values?.[0]).toBe(210000);
    expect(sum['yAxis']).not.toMatchObject({ max: 100 });
  });
});
