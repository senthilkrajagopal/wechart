/**
 * T052 / AC-046: THE SYSTEM SHALL format every value with its member's format
 * from the Cube model, including currency and percentage, in **axes, labels,
 * tooltips and tables**.
 *
 * `format.test.ts` in core proves the formatter. This proves the four places,
 * because a formatter nothing calls formats nothing — and the criterion names
 * the places for a reason: the same number appearing as `1234` on an axis and
 * `$1,234.00` in the table of the same chart is exactly the failure.
 *
 * Tables are covered in `packages/web` where they are rendered.
 */
import { describe, expect, it } from 'vitest';

import type { RenderSpec } from '@wechart/core';

import { optionFor } from './optionFor';
import { tooltipFor } from './tooltip';
import { labelsOf, renderToSvg } from './testing/renderToSvg';

const STATUS = 'orders.status';
const AMOUNT = 'orders.total_amount';

const spec: RenderSpec = {
  chartType: 'bar',
  encoding: { x: [STATUS], y: [AMOUNT] },
  rows: [
    { [STATUS]: 'paid', [AMOUNT]: 1000 },
    { [STATUS]: 'refunded', [AMOUNT]: 4000 },
  ],
  palette: ['#123456'],
  formats: { [AMOUNT]: 'currency' },
};

describe('the axis', () => {
  it('writes a currency measure as money', () => {
    const labels = labelsOf(renderToSvg(optionFor(spec))).map((label) => label.text);

    expect(labels.some((label) => label.startsWith('$'))).toBe(true);
  });

  it('leaves a measure with no declared format as a plain number', () => {
    const plain: RenderSpec = { ...spec, formats: {} };
    const labels = labelsOf(renderToSvg(optionFor(plain))).map((label) => label.text);

    // The format follows the member; without one there is nothing to follow.
    expect(labels.some((label) => label.startsWith('$'))).toBe(false);
  });

  it('gives way to an explicit axis setting, which is the more specific one', () => {
    const overridden: RenderSpec = {
      ...spec,
      options: { axes: { y: { numberFormat: 'compact' } } },
    };
    const labels = labelsOf(renderToSvg(optionFor(overridden))).map((label) => label.text);

    // AC-040's setting is the exception and the member's format the default,
    // not the other way round.
    expect(labels).toContain('4K');
  });
});

describe('the tooltip', () => {
  const tooltipOf = (rendered: RenderSpec) =>
    (optionFor(rendered)['tooltip'] as { formatter: (params: unknown) => string }).formatter;

  it('exists at all, which it has to before it can carry a format', () => {
    expect(optionFor(spec)['tooltip']).toBeDefined();
  });

  it('writes the value the way its member declares', () => {
    const text = tooltipOf(spec)({ seriesName: AMOUNT, name: 'paid', value: 1000 });

    expect(text).toContain('$1,000.00');
  });

  it('escapes what it interpolates, because the formatter returns raw HTML', () => {
    const text = tooltipOf(spec)({ seriesName: '<img src=x>', name: 'paid', value: 1 });

    // docs/research/echarts.md flags this: 6.1.0 fixed an XSS in a tooltip,
    // and every value wechart interpolates is ours to escape.
    expect(text).not.toContain('<img');
    expect(text).toContain('&lt;img');
  });

  it('is absent for the types drawn as DOM, which have their own', () => {
    // Asked of tooltipFor rather than optionFor, because ECharts draws none
    // of these and optionFor rightly refuses them.
    for (const chartType of ['kpi', 'table', 'pivot'] as const) {
      expect(tooltipFor({ ...spec, chartType })).toEqual({});
    }
  });
});
