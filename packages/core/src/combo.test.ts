/**
 * T845 (AC-497, AC-498, AC-037): each combo series' mark and axis, carried in
 * the chart's options, and Auto resolved from the Metrics well's order.
 *
 * Auto is the first measure as bars and the rest as lines, all on the left
 * (rule 115). A mark or an axis the author chose is pinned to its measure, so
 * adding, removing or reordering another measure never changes it (AC-498);
 * and nothing but the author's choice ever puts a series on the right
 * (rule 117).
 */
import { describe, expect, it } from 'vitest';

import { CHART_DOCUMENT_VERSION, chartDocumentOf, readChartDocument } from './chart-document';
import { emptySpec } from './chart-spec';
import {
  COMBO_AXES,
  COMBO_MARKS,
  comboProblems,
  comboSeriesOf,
  withComboAuto,
  withComboSeries,
} from './combo';

const REVENUE = 'orders.revenue';
const TARGET = 'orders.target';
const MARGIN = 'orders.margin_pct';
const ORDERS = 'orders.count';

const MARGIN_ON_RIGHT = { series: { [MARGIN]: { mark: 'point', axis: 'right' } } };

/** Each series as "measure mark/axis", in order: what a test compares. */
const drawn = (measures: readonly string[], options?: Record<string, unknown>) =>
  comboSeriesOf(measures, options).map((one) => `${one.measure} ${one.mark}/${one.axis}`);

describe('Auto (AC-498)', () => {
  it('draws the first measure as bars and the rest as lines, all on the left', () => {
    expect(drawn([REVENUE, TARGET, MARGIN])).toEqual([
      `${REVENUE} bar/left`,
      `${TARGET} line/left`,
      `${MARGIN} line/left`,
    ]);
  });

  it('marks every series as Auto while nothing is chosen', () => {
    expect(comboSeriesOf([REVENUE, TARGET]).map((one) => one.auto)).toEqual([true, true]);
  });

  it('never puts a series on the right, however many measures there are', () => {
    const many = Array.from({ length: 12 }, (_, at) => `orders.m${String(at)}`);

    expect(comboSeriesOf(many).every((one) => one.axis === 'left')).toBe(true);
  });

  it('follows the well when nothing is chosen: a measure moved first becomes the bars', () => {
    expect(drawn([TARGET, REVENUE])).toEqual([`${TARGET} bar/left`, `${REVENUE} line/left`]);
  });

  it('keeps a colour or a hidden series set in Customize out of Auto', () => {
    const options = { series: { [REVENUE]: { colour: '#123456', hidden: false } } };

    expect(comboSeriesOf([REVENUE, TARGET], options).map((one) => one.auto)).toEqual([true, true]);
  });
});

describe('a mark and an axis the author chose (AC-497, AC-498)', () => {
  it('draws Margin % as points on the right', () => {
    expect(drawn([REVENUE, TARGET, MARGIN], MARGIN_ON_RIGHT)).toEqual([
      `${REVENUE} bar/left`,
      `${TARGET} line/left`,
      `${MARGIN} point/right`,
    ]);
  });

  it('is no longer Auto', () => {
    expect(comboSeriesOf([REVENUE, MARGIN], MARGIN_ON_RIGHT).map((one) => one.auto)).toEqual([
      true,
      false,
    ]);
  });

  it('keeps it when Orders is added before it', () => {
    expect(drawn([ORDERS, REVENUE, TARGET, MARGIN], MARGIN_ON_RIGHT)).toEqual([
      `${ORDERS} bar/left`,
      `${REVENUE} line/left`,
      `${TARGET} line/left`,
      `${MARGIN} point/right`,
    ]);
  });

  it('keeps it when Target is removed', () => {
    expect(drawn([REVENUE, MARGIN], MARGIN_ON_RIGHT)).toEqual([
      `${REVENUE} bar/left`,
      `${MARGIN} point/right`,
    ]);
  });

  it('keeps it when the measures are reordered, Margin % first', () => {
    expect(drawn([MARGIN, TARGET, REVENUE], MARGIN_ON_RIGHT)).toEqual([
      `${MARGIN} point/right`,
      `${TARGET} line/left`,
      `${REVENUE} line/left`,
    ]);
  });

  it('keeps a chosen mark while the axis stays Auto, and the other way round', () => {
    const options = {
      series: { [REVENUE]: { mark: 'area' }, [TARGET]: { axis: 'right' } },
    };

    expect(drawn([REVENUE, TARGET], options)).toEqual([
      `${REVENUE} area/left`,
      `${TARGET} line/right`,
    ]);
  });

  it('keeps a mark chosen for the first measure when another is added before it', () => {
    const options = { series: { [REVENUE]: { mark: 'bar' } } };

    expect(drawn([ORDERS, REVENUE], options)).toEqual([
      `${ORDERS} bar/left`,
      `${REVENUE} bar/left`,
    ]);
  });
});

describe('setting a series and going back to Auto', () => {
  it('stores a choice sparsely, beside the series colour, under its measure', () => {
    const options = { series: { [MARGIN]: { colour: '#abcdef' } }, legend: { show: true } };

    expect(withComboSeries(options, MARGIN, { mark: 'point' })).toEqual({
      series: { [MARGIN]: { colour: '#abcdef', mark: 'point' } },
      legend: { show: true },
    });
  });

  it('adds an axis to a mark already chosen', () => {
    const marked = withComboSeries({}, MARGIN, { mark: 'point' });

    expect(withComboSeries(marked, MARGIN, { axis: 'right' })).toEqual(MARGIN_ON_RIGHT);
  });

  it('Back to Auto drops the mark and the axis and keeps the colour', () => {
    const options = { series: { [MARGIN]: { colour: '#abcdef', mark: 'point', axis: 'right' } } };

    expect(withComboAuto(options, MARGIN)).toEqual({ series: { [MARGIN]: { colour: '#abcdef' } } });
  });

  it('Back to Auto leaves no empty entry and no empty series map behind', () => {
    expect(withComboAuto({ ...MARGIN_ON_RIGHT, stacked: true }, MARGIN)).toEqual({ stacked: true });
  });

  it('draws the measure by Auto again after Back to Auto', () => {
    expect(drawn([REVENUE, MARGIN], withComboAuto(MARGIN_ON_RIGHT, MARGIN))).toEqual([
      `${REVENUE} bar/left`,
      `${MARGIN} line/left`,
    ]);
  });
});

describe('only four marks and two axes (AC-497)', () => {
  it('offers bar, line, area and point, and left and right', () => {
    expect(COMBO_MARKS).toEqual(['bar', 'line', 'area', 'point']);
    expect(COMBO_AXES).toEqual(['left', 'right']);
  });

  it('finds nothing wrong with the four marks and the two axes', () => {
    const options = {
      series: {
        a: { mark: 'bar', axis: 'left' },
        b: { mark: 'line', axis: 'right' },
        c: { mark: 'area' },
        d: { mark: 'point' },
        e: { colour: '#123456' },
      },
    };

    expect(comboProblems(options)).toEqual([]);
  });

  it('refuses a stored fifth mark', () => {
    expect(comboProblems({ series: { [REVENUE]: { mark: 'pie' } } })).toEqual([
      `${REVENUE} is drawn as "pie", which isn't a combo mark: bar, line, area or point.`,
    ]);
  });

  it('refuses a third axis', () => {
    expect(comboProblems({ series: { [REVENUE]: { axis: 'top' } } })).toEqual([
      `${REVENUE} is on the "top" axis, but a combo has only a left and a right axis.`,
    ]);
  });

  /**
   * T845's review: only a mark or an axis the combo doesn't have is refused.
   * Series settings of another shape hold no mark or axis, are read as none
   * by every renderer, and so draw by Auto; refusing them would make a chart
   * of any type unopenable for nothing a combo stores.
   */
  it('reads series settings that are not a map as none, and refuses nothing', () => {
    expect(comboProblems({ series: [{ mark: 'pie' }] })).toEqual([]);
    expect(comboProblems({ series: null })).toEqual([]);
    expect(drawn([REVENUE, TARGET], { series: [{ mark: 'pie' }] })).toEqual([
      `${REVENUE} bar/left`,
      `${TARGET} line/left`,
    ]);
  });

  it('draws a refused mark or axis by Auto rather than inventing one', () => {
    const options = { series: { [REVENUE]: { mark: 'pie', axis: 'top' } } };

    expect(drawn([REVENUE], options)).toEqual([`${REVENUE} bar/left`]);
  });
});

describe('saved and opened again (AC-497)', () => {
  const options = {
    series: {
      [REVENUE]: { mark: 'area', colour: '#123456' },
      [TARGET]: { axis: 'right' },
      [MARGIN]: { mark: 'point', axis: 'right' },
    },
  };
  const spec = {
    ...emptySpec('orders'),
    measures: [REVENUE, TARGET, MARGIN],
    chartType: 'combo' as const,
  };

  it('keeps every mark and axis', () => {
    const stored: unknown = JSON.parse(
      JSON.stringify(chartDocumentOf({ title: 'Mix', spec, options })),
    );
    const reopened = readChartDocument(stored);

    expect(reopened.chart.options).toEqual(options);
    expect(drawn(reopened.chart.wells.measures, reopened.chart.options)).toEqual([
      `${REVENUE} area/left`,
      `${TARGET} line/right`,
      `${MARGIN} point/right`,
    ]);
  });

  it('refuses a stored chart with a fifth mark', () => {
    const body = {
      schemaVersion: CHART_DOCUMENT_VERSION,
      title: 'Mix',
      chart: {
        source: { cube: 'orders' },
        wells: { measures: [REVENUE], dimensions: [], timeDimensions: [] },
        chartType: 'combo',
        options: { series: { [REVENUE]: { mark: 'pie' } } },
      },
    };

    expect(() => readChartDocument(body)).toThrow(/"pie", which isn't a combo mark/);
  });
});
