/**
 * The bullet chart (T954, AC-581; design 23 sheet 8; direction.md §7i, rule
 * 150): R80's bullet graph grown to a chart row, one per member of the
 * chart's dimension, all on one value axis from zero.
 *
 * - Each member's bands are the percentages of its own target the chart
 *   keeps (`options.bullet`, 80, 100 and 120 % by default), stacked from zero
 *   in R80's three greys, lightest lowest: a 24 px band row on a 48 px pitch.
 * - Its value is an 8 px `text-primary` bar from zero, and its target a
 *   2 × 32 px `text-primary` mark. The bar is on a second, hidden member axis
 *   so that ECharts lays it out alone, centred on the member as the bands are
 *   (research/echarts-bullet.md §1).
 * - A member with no target draws its bar alone, its label saying "No target".
 * - Members past the tile's height scroll on the member axis by the wheel or
 *   a slim slider, the value axis fixed: `filterMode: 'none'` keeps its
 *   extent from every member (research/echarts-bullet.md §2).
 */
import {
  bulletOptionsOf,
  distinctValues,
  formatterFor,
  memberOn,
  type RenderSpec,
} from '@wechart/core';
import { COLORS } from '@wechart/ui';

import { titleOf } from '../modelWriter';
import type { EChartsOption } from '../theme';
import type { Canvas } from './bar';

/** One member's row, band to band (design 23 sheet 8). */
export const BULLET_PITCH_PX = 48;
const BAND_PX = 24;
const BAR_PX = 8;
const TARGET_PX: [number, number] = [2, 32];
/** Above the rows, and below them for the value axis's labels and its note. */
const TOP_PX = 12;
const BELOW_PX = 56;
/** The slider's width at the right, while the members scroll. */
const SLIDER_PX = 10;
const RIGHT_PX = 28;
/** About one character of 12 px text, for the member labels' column. */
const CHAR_PX = 6.6;

/** R80's three greys, lightest first: the lowest band takes the first. */
const GREYS = ['bg-subtle', 'border-subtle', 'border-strong'] as const;

const numberOf = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export function isBulletType(chartType: string): boolean {
  return chartType === 'bullet';
}

/** Each member's value and target, in the order of the rows. */
export function bulletsOf(spec: RenderSpec): {
  readonly member: string;
  readonly value: number | null;
  readonly target: number | null;
}[] {
  const category = memberOn(spec.encoding, 'x');
  const measure = memberOn(spec.encoding, 'y');
  if (category === undefined || measure === undefined) return [];
  const { target } = bulletOptionsOf(spec.options);
  return distinctValues(spec.rows, category).map((member) => {
    const row = spec.rows.find((one) => String(one[category] ?? '') === member) ?? {};
    return {
      member,
      value: numberOf(row[measure]),
      target:
        target === undefined
          ? null
          : target.kind === 'value'
            ? target.value
            : numberOf(row[target.member]),
    };
  });
}

export function bulletOption(spec: RenderSpec, canvas: Canvas): EChartsOption {
  const measure = memberOn(spec.encoding, 'y') ?? '';
  const { bands, target: targetIs } = bulletOptionsOf(spec.options);
  const bullets = bulletsOf(spec);
  const members = bullets.map((one) => one.member);
  const format = formatterFor(measure, spec.formats ?? {}, spec.granularities);
  // A Target measure in its own format; a value in the measure's.
  const formatTarget =
    targetIs?.kind === 'measure'
      ? formatterFor(targetIs.member, spec.formats ?? {}, spec.granularities)
      : format;
  const tokens = COLORS.light;

  // Each member's label: its name, and its figures under it.
  const figures = new Map(
    bullets.map(({ member, value, target }) => {
      const shown = value === null ? '—' : format(value);
      if (target === null || target === 0) return [member, `${shown} · No target`];
      const share = value === null ? '' : ` · ${String(Math.round((value / target) * 100))} %`;
      return [member, `${shown} of ${formatTarget(target)}${share}`];
    }),
  );
  const longest = Math.max(
    0,
    ...members.map((member) => Math.max(member.length, (figures.get(member) ?? '').length)),
  );
  const left = Math.round(Math.min(canvas.width * 0.45, longest * CHAR_PX + 12));

  // Whole rows on the pitch: as many as the tile holds, the rest scrolled to.
  const fits = Math.max(1, Math.floor((canvas.height - TOP_PX - BELOW_PX) / BULLET_PITCH_PX));
  const shown = Math.max(1, Math.min(members.length, fits));
  const scrolls = members.length > shown;

  const memberAxis = {
    type: 'category',
    data: members,
    // The first member at the top, as a table reads.
    inverse: true,
    axisTick: { show: false },
    axisLine: { show: false },
  };

  /**
   * The window: as many members as the tile holds, never more or fewer (its
   * span held at that by `min`/`maxValueSpan`, so a pinch can't zoom it), the
   * value axis from every member (`filterMode: 'none'`).
   */
  const zoomed = {
    yAxisIndex: [0, 1],
    filterMode: 'none',
    startValue: 0,
    endValue: shown - 1,
    minValueSpan: shown - 1,
    maxValueSpan: shown - 1,
  };

  const series = [
    ...bands.map((percent, at) => {
      const from = at === 0 ? 0 : (bands[at - 1] ?? 0);
      return {
        type: 'bar' as const,
        name: `${String(from)}–${String(percent)} % of target`,
        stack: 'bands',
        yAxisIndex: 0,
        barWidth: BAND_PX,
        z: 1,
        silent: true,
        // A marking fades an unmarked bullet's bands and leaves a marked
        // one's as they are: they are its target's, never its share (T955).
        markedAs: 'fade',
        itemStyle: { color: tokens[GREYS[at] ?? 'border-strong'], borderRadius: 0 },
        data: bullets.map(({ target }) =>
          target === null ? null : ((percent - from) / 100) * target,
        ),
      };
    }),
    {
      type: 'bar' as const,
      name: titleOf(spec, measure),
      yAxisIndex: 1,
      barWidth: BAR_PX,
      z: 3,
      itemStyle: { color: tokens['text-primary'], borderRadius: 0 },
      data: bullets.map(({ value }) => value),
    },
    {
      type: 'scatter' as const,
      name: 'Target',
      yAxisIndex: 0,
      symbol: 'rect',
      symbolSize: TARGET_PX,
      z: 4,
      markedAs: 'fade',
      // At full strength: a scatter point is 0.8 by default.
      itemStyle: { color: tokens['text-primary'], opacity: 1 },
      // Each named by its member, which a click on it marks (T955, AC-582),
      // and carrying it, which a drag over it marks (checkpoint 1's review).
      data: bullets.flatMap(({ member, target }) =>
        target === null ? [] : [{ value: [target, member], name: member, category: member }],
      ),
    },
  ];

  return {
    animation: false,
    grid: {
      left,
      right: RIGHT_PX + (scrolls ? SLIDER_PX : 0),
      top: TOP_PX,
      height: shown * BULLET_PITCH_PX,
      // The rows on the pitch exactly: the labels' column is kept by `left`.
      outerBoundsMode: 'none',
    },
    xAxis: {
      type: 'value',
      // One axis from zero for every bullet: bars are lengths.
      min: 0,
      name: `Axis starts at ${format(0)}: bars are lengths`,
      nameLocation: 'middle',
      nameGap: 28,
      axisLabel: { formatter: (value: number) => format(value) },
    },
    yAxis: [
      {
        ...memberAxis,
        axisLabel: {
          formatter: (member: string) => `{name|${member}}\n{figure|${figures.get(member) ?? ''}}`,
          rich: {
            name: { color: tokens['text-primary'], fontSize: 12, lineHeight: 16 },
            figure: { color: tokens['text-secondary'], fontSize: 12, lineHeight: 16 },
          },
        },
      },
      { ...memberAxis, show: false },
    ],
    series,
    ...(scrolls
      ? {
          dataZoom: [
            {
              // Not `zoomLock`, which leaves the wheel unheard: ECharts
              // listens for it only where it may zoom (research/echarts-bullet.md §2).
              type: 'inside',
              ...zoomed,
              moveOnMouseWheel: true,
              moveOnMouseMove: false,
              zoomOnMouseWheel: false,
            },
            {
              type: 'slider',
              ...zoomed,
              zoomLock: true,
              right: 4,
              width: SLIDER_PX,
              showDetail: false,
              brushSelect: false,
              showDataShadow: false,
              // A plain scrollbar in wechart's greys, not ECharts' blue
              // window with handles: its size is fixed.
              handleSize: 0,
              moveHandleSize: 0,
              borderColor: 'transparent',
              backgroundColor: tokens['bg-subtle'],
              fillerColor: tokens['border-strong'],
            },
          ],
        }
      : {}),
  };
}
