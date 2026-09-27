import { CATEGORICAL, COLORS } from '@wechart/ui';
import { describe, expect, it } from 'vitest';

import { SEQUENTIAL } from './theme';
import { themed } from './themed';

/**
 * T210 / AC-211: THE SYSTEM SHALL draw charts in the dark theme with the dark
 * categorical palette and the dark theme's text and gridline tokens, and
 * redraw them when the theme changes (direction.md rules 2, 24).
 * `Fails when: a chart in the dark theme uses a light-theme series colour,
 * text colour or gridline colour.`
 *
 * The dashboard critique measured the failure: axis text `#54555a` on the dark
 * tile `#1c1c1b`, 2.3:1, and the light palette's `#2a78d6` for series one.
 */
interface Axis {
  axisLabel: { color: string; rotate?: number };
  axisLine: { lineStyle: { color: string } };
  splitLine: { lineStyle: { color: string } };
}
interface Drawn {
  xAxis: Axis;
  yAxis: Axis[];
  legend: { textStyle: { color: string } };
  title: { textStyle: { color: string } }[];
  series: { itemStyle: { color: string; borderColor?: string } }[];
}

const option = () => ({
  xAxis: { type: 'category', data: ['a', 'b'] },
  yAxis: [{ type: 'value' }],
  legend: { data: ['one', 'two'] },
  title: [{ text: 'Panel' }],
  series: [
    { type: 'bar', itemStyle: { color: CATEGORICAL.light[0] }, data: [1, 2] },
    { type: 'bar', itemStyle: { color: CATEGORICAL.light[1], borderColor: '#ffffff' }, data: [3] },
  ],
});

const drawIn = (theme: 'light' | 'dark', source: Record<string, unknown> = option()) =>
  themed(source, theme) as unknown as Drawn;

describe('a chart drawn in the dark theme', () => {
  const dark = drawIn('dark');

  it('draws each series in the dark palette, slot for slot', () => {
    // The same slot, so a member keeps its place in the order (AC-039):
    // only the shade changes with the theme.
    expect(dark.series[0]?.itemStyle.color).toBe(CATEGORICAL.dark[0]);
    expect(dark.series[1]?.itemStyle.color).toBe(CATEGORICAL.dark[1]);
  });

  it('draws the surface-coloured gaps between marks in the dark surface', () => {
    expect(dark.series[1]?.itemStyle.borderColor).toBe(COLORS.dark['bg-surface']);
  });

  it('sets axis labels, legend and panel titles in the dark text tokens', () => {
    expect(dark.xAxis.axisLabel.color).toBe(COLORS.dark['text-secondary']);
    expect(dark.yAxis[0]?.axisLabel.color).toBe(COLORS.dark['text-secondary']);
    expect(dark.legend.textStyle.color).toBe(COLORS.dark['text-secondary']);
    expect(dark.title[0]?.textStyle.color).toBe(COLORS.dark['text-primary']);
  });

  it('draws gridlines and axis lines in the dark border tokens', () => {
    expect(dark.yAxis[0]?.splitLine.lineStyle.color).toBe(COLORS.dark['border-subtle']);
    expect(dark.xAxis.axisLine.lineStyle.color).toBe(COLORS.dark['border-strong']);
  });

  it('keeps what a renderer set on an axis beside the colours', () => {
    const drawn = drawIn('dark', { xAxis: { axisLabel: { rotate: 45 } }, series: [] });
    expect(drawn.xAxis.axisLabel.rotate).toBe(45);
    expect(drawn.xAxis.axisLabel.color).toBe(COLORS.dark['text-secondary']);
  });
});

/**
 * T465 (UX-113): a pie's or donut's data labels, outside the ring, in the
 * theme's text — not ECharts' own `#333` with a white outline, which a dark
 * tile shows as outlined white text. A label inside its slice sits on the
 * slice's colour, not the tile's, and keeps what it has.
 */
describe('a pie’s data labels (T465)', () => {
  const pie = (position?: string) => ({
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        label: { show: true, ...(position === undefined ? {} : { position }) },
        data: [{ name: 'a', value: 1 }],
      },
    ],
  });
  type Labelled = { series: { label: Record<string, unknown> }[] };

  it.each(['light', 'dark'] as const)(
    'are in the %s theme’s secondary text, unoutlined',
    (theme) => {
      const drawn = themed(pie(), theme) as unknown as Labelled;
      expect(drawn.series[0]?.label['color']).toBe(COLORS[theme]['text-secondary']);
      expect(drawn.series[0]?.label['textBorderWidth']).toBe(0);
      expect(drawn.series[0]?.label['show']).toBe(true);
    },
  );

  it('leaves a label inside its slice as it is', () => {
    const drawn = themed(pie('inside'), 'dark') as unknown as Labelled;
    expect(drawn.series[0]?.label['color']).toBeUndefined();
    expect(drawn.series[0]?.label['position']).toBe('inside');
  });
});

describe('what the dark theme recolours, and what it leaves alone (T210 review)', () => {
  it('recolours a gridline a renderer set in the light border colour', () => {
    // axis.ts sets gridlines in the light border-subtle when the user turns
    // them on; the renderer's own colour used to win over the theme's.
    const drawn = drawIn('dark', {
      yAxis: { splitLine: { show: true, lineStyle: { color: COLORS.light['border-subtle'] } } },
      series: [],
    }) as unknown as { yAxis: Axis };
    expect(drawn.yAxis.splitLine.lineStyle.color).toBe(COLORS.dark['border-subtle']);
  });

  it('draws "Other" in the dark neutral', () => {
    // direction.md §5: "#b3b1ab light and #5c5b57 dark".
    const drawn = drawIn('dark', {
      series: [{ itemStyle: { color: '#b3b1ab' } }],
    });
    expect(drawn.series[0]?.itemStyle.color).toBe('#5c5b57');
  });

  /**
   * T398: a country map's legend in the dark theme's own colours — its
   * "No data" swatch in the dark null neutral, and the words of the swatch
   * and of the bar's two ends in the dark secondary text.
   */
  it('draws a map’s legend in the dark theme’s colours', () => {
    const drawn = themed(
      {
        visualMap: { text: ['9', '1'] },
        graphic: [
          {
            type: 'group',
            children: [
              { type: 'rect', style: { fill: '#b3b1ab', stroke: COLORS.light['border-strong'] } },
              { type: 'text', style: { text: 'No data', fill: COLORS.light['text-secondary'] } },
            ],
          },
        ],
        series: [{ type: 'map', itemStyle: { areaColor: '#b3b1ab' } }],
      },
      'dark',
    ) as unknown as {
      visualMap: { textStyle: { color: string } };
      graphic: { children: { style: { fill: string; stroke?: string } }[] }[];
      series: { itemStyle: { areaColor: string } }[];
    };

    expect(drawn.visualMap.textStyle.color).toBe(COLORS.dark['text-secondary']);
    const [swatch, words] = drawn.graphic[0]!.children;
    expect(swatch?.style).toEqual({ fill: '#5c5b57', stroke: COLORS.dark['border-strong'] });
    expect(words?.style.fill).toBe(COLORS.dark['text-secondary']);
    expect(drawn.series[0]?.itemStyle.areaColor).toBe('#5c5b57');
  });

  it('never renames a data value that happens to be a palette colour', () => {
    // A member whose value is a colour — a product's colour column — must
    // stay the value it is on the axis, the legend and the click it sends.
    const value = CATEGORICAL.light[0];
    const drawn = drawIn('dark', {
      xAxis: { data: [value] },
      legend: { data: [value] },
      series: [{ name: value, data: [{ name: value, value: 1 }] }],
    }) as unknown as {
      xAxis: { data: string[] };
      legend: { data: string[] };
      series: { name: string; data: { name: string }[] }[];
    };
    expect(drawn.xAxis.data).toEqual([value]);
    expect(drawn.legend.data).toEqual([value]);
    expect(drawn.series[0]?.name).toBe(value);
    expect(drawn.series[0]?.data[0]?.name).toBe(value);
  });

  it('runs the sequential ramp the other way, so magnitude still reads as contrast', () => {
    // direction.md publishes one ramp, light to dark. On a dark tile its high
    // end, #0d366b, is about 1.4:1 — the biggest cells vanished. Reversed, low
    // values sit near the surface and high values stand out, as on light.
    const drawn = drawIn('dark', {
      visualMap: { inRange: { color: [...SEQUENTIAL] } },
      series: [],
    }) as unknown as { visualMap: { inRange: { color: string[] } } };
    expect(drawn.visualMap.inRange.color).toEqual([...SEQUENTIAL].reverse());
  });

  it('draws the tooltip in the dark surface and text tokens', () => {
    const drawn = drawIn('dark', { tooltip: { trigger: 'axis' }, series: [] }) as unknown as {
      tooltip: { trigger: string; backgroundColor: string; textStyle: { color: string } };
    };
    expect(drawn.tooltip.trigger).toBe('axis');
    expect(drawn.tooltip.backgroundColor).toBe(COLORS.dark['bg-raised']);
    expect(drawn.tooltip.textStyle.color).toBe(COLORS.dark['text-primary']);
  });
});

describe('a chart drawn in the light theme', () => {
  it('keeps the light palette and takes the light tokens', () => {
    const light = drawIn('light');
    expect(light.series[0]?.itemStyle.color).toBe(CATEGORICAL.light[0]);
    expect(light.xAxis.axisLabel.color).toBe(COLORS.light['text-secondary']);
  });
});

/**
 * T254 / AC-187, recheck-dashboard N7: the prototype's chart text —
 * textStyle.fontFamily "Inter, system-ui, sans-serif", the tooltip at 12 px —
 * in either theme; and the tooltip's figures tabular, as the tile's are, where
 * its own inline "font" shorthand would reset them
 * (research/echarts-text-and-grid.md, Q1 and Q2).
 */
describe('a chart’s text', () => {
  for (const theme of ['light', 'dark'] as const)
    it(`is set in Inter, the tooltip at 12 px in tabular figures (${theme})`, () => {
      const drawn = themed({ tooltip: { trigger: 'axis' }, series: [] }, theme) as unknown as {
        textStyle: { fontFamily: string };
        tooltip: { textStyle: { fontSize: number }; extraCssText: string };
      };
      expect(drawn.textStyle.fontFamily).toBe('Inter, system-ui, sans-serif');
      expect(drawn.tooltip.textStyle.fontSize).toBe(12);
      expect(drawn.tooltip.extraCssText).toContain('font-variant-numeric: tabular-nums;');
    });

  it('leaves a chart’s own family where it names one', () => {
    const drawn = themed(
      { textStyle: { fontFamily: 'serif' }, series: [] },
      'light',
    ) as unknown as {
      textStyle: { fontFamily: string };
    };
    expect(drawn.textStyle.fontFamily).toBe('serif');
  });
});
