/**
 * A stacked bar or area drawn at 100 % (T957, AC-584; design 23 sheet 9;
 * direction.md rule 152).
 *
 * Applied last, over the chart as the bar and line families draw it, with its
 * marks, Customize and direct labels: each series' values become its shares
 * of their category's total, the value axis is fixed at 0–100 % with a tick
 * every 25 % (no log scale, no minimum or maximum of the axis editor's), and
 * the tooltip gives each value with its share ("Web: $210K · 51 % of EMEA").
 * The series past the palette's 8 were already folded into "Other (n)"
 * (`foldForShares`), so the shares of every category add to 100.
 */
import {
  formatterFor,
  isPercentStack,
  memberOn,
  seriesOf,
  sharesOf,
  shareText,
  type RenderSpec,
} from '@wechart/core';

import { nameWriter, seriesWriter } from '../modelWriter';
import type { EChartsOption } from '../theme';

type Series = Record<string, unknown> & { name?: unknown; data?: unknown };

interface Params {
  readonly seriesName?: string;
  readonly dataIndex?: number;
  readonly name?: string;
  readonly marker?: string;
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** A tick on the 0–100 % axis. */
const percent = (value: unknown) => `${String(value)} %`;

export function withShares(option: EChartsOption, spec: RenderSpec): EChartsOption {
  if (!isPercentStack(spec)) return option;

  const { series: raw } = seriesOf(spec);
  const shares = sharesOf(raw);
  const byName = new Map(
    raw.map((one, at) => [one.name, { raw: one.values, share: shares[at]?.values ?? [] }]),
  );
  /** Each category's total, which every drawn value is a share of. */
  const totals = (raw[0]?.values ?? []).map((_, at) =>
    raw.reduce((sum, one) => sum + (one.values[at] ?? 0), 0),
  );
  /**
   * A drawn value as its share of its category, scaled rather than looked up
   * by its series' name: a bar split by a marked share draws two parts under
   * one name, each its own fraction of the whole (T957's review).
   */
  const scaled = (value: unknown, at: number) => {
    const number = typeof value === 'number' ? value : null;
    const total = totals[at] ?? 0;
    return number === null || total === 0 ? null : (number / total) * 100;
  };
  // As Customize writes data labels: the share, never the measure's format.
  const shareLabel = (params: { value?: unknown }) =>
    percent(Math.round(Number(Array.isArray(params.value) ? params.value[1] : params.value)));

  const series = ((option['series'] as Series[] | undefined) ?? []).map((one) => {
    if (!Array.isArray(one.data)) return one;
    const label = record(one['label']);
    return {
      ...one,
      ...(label['show'] === true ? { label: { ...label, formatter: shareLabel } } : {}),
      data: (one.data as unknown[]).map((item, at) =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? {
              ...(item as Record<string, unknown>),
              value: scaled((item as Record<string, unknown>)['value'], at),
            }
          : scaled(item, at),
      ),
    };
  });

  const axis = record(option['yAxis']);
  // Linear, whatever the axis editor stored: a share has no log scale.
  const linear = Object.fromEntries(Object.entries(axis).filter(([key]) => key !== 'logBase'));
  const yAxis = {
    ...linear,
    type: 'value',
    min: 0,
    max: 100,
    interval: 25,
    axisLabel: { ...record(axis['axisLabel']), formatter: percent },
    axisPointer: {
      ...record(axis['axisPointer']),
      label: {
        ...record(record(axis['axisPointer'])['label']),
        formatter: (params: { value: unknown }) => percent(Math.round(Number(params.value))),
      },
    },
  };

  const measure = memberOn(spec.encoding, 'y') ?? '';
  const format = formatterFor(measure, spec.formats ?? {}, spec.granularities);
  const category = nameWriter(spec, memberOn(spec.encoding, 'x'));
  const seriesName = seriesWriter(spec, memberOn(spec.encoding, 'color'));
  const render = (params: Params | Params[]) => {
    const rows = Array.isArray(params) ? params : [params];
    const heading = category(rows[0]?.name ?? '');
    const lines = rows.flatMap((row) => {
      const own = byName.get(String(row.seriesName ?? ''));
      const at = row.dataIndex ?? -1;
      const share = own?.share[at];
      const value = own?.raw[at];
      if (own === undefined || share === null || share === undefined) return [];
      return [
        escapeHtml(shareText(seriesName(row.seriesName ?? ''), format(value), share, heading)),
      ];
    });
    return [escapeHtml(heading), ...lines].filter((line) => line !== '').join('<br/>');
  };

  return {
    ...option,
    series,
    yAxis,
    tooltip: { ...record(option['tooltip']), formatter: render },
  };
}
