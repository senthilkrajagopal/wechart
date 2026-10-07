import { chartDocumentOf, emptySpec } from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { drawnSizeIn, hiddenLabelsAt } from './hiddenLabels';

/**
 * T516 (R67): what the editor tells the recommender of a chart's labels at
 * the tile's size: the share a vertical bar of its fields would hide there,
 * whatever type it is drawn as. None without a size to reckon at.
 */
const PRODUCT = 'orders.product';
const COUNT = 'orders.count';
const documentOf = (dimensions: string[]) =>
  chartDocumentOf({
    title: '',
    spec: { ...emptySpec(), measures: [COUNT], dimensions },
    options: {},
  });
const rowsOf = (names: readonly string[]) =>
  names.map((name, at) => ({ [PRODUCT]: name, [COUNT]: String(100 - at) }));
const many = Array.from({ length: 60 }, (_, at) => `Product number ${String(at + 1)}`);

describe('the labels a bar would hide at the tile’s size (T516)', () => {
  it('is more than half for sixty long names in a small tile, and none for four', () => {
    const small = { width: 360, height: 260 };
    expect(hiddenLabelsAt(documentOf([PRODUCT]), rowsOf(many), small)).toBeGreaterThan(0.5);
    expect(
      hiddenLabelsAt(documentOf([PRODUCT]), rowsOf(['North', 'South', 'East', 'West']), small),
    ).toBe(0);
  });

  it('is none where there is no size to reckon at, or no field across', () => {
    expect(hiddenLabelsAt(documentOf([PRODUCT]), rowsOf(many), undefined)).toBe(0);
    expect(hiddenLabelsAt(documentOf([]), [{ [COUNT]: '3' }], { width: 360, height: 260 })).toBe(0);
  });
});

/**
 * T516's review: the size reckoned at is the chart's canvas, not the tile's
 * outer box: opened from a tile, its width less the frame's padding and
 * border, at the chart's height; else the canvas as laid out.
 */
describe('the size the preview’s chart is drawn at (T516)', () => {
  const paneWith = (inner: string) => {
    const pane = document.createElement('div');
    pane.innerHTML = inner;
    return pane;
  };

  it('is the tile’s width less its frame’s padding and border, at the chart’s height', () => {
    const pane = paneWith(
      '<div class="preview-frame__tile" style="padding: 0 12px; border: 1px solid black"></div>',
    );
    expect(drawnSizeIn(pane, 400, 240)).toEqual({ width: 374, height: 240 });
  });

  it('is the canvas as laid out with no tile, and nothing before it is', () => {
    const pane = paneWith('<div data-testid="chart-canvas"></div>');
    expect(drawnSizeIn(pane, undefined, undefined)).toBeUndefined();
    const canvas = pane.querySelector('[data-testid="chart-canvas"]')!;
    Object.defineProperty(canvas, 'clientWidth', { value: 610 });
    Object.defineProperty(canvas, 'clientHeight', { value: 320 });
    expect(drawnSizeIn(pane, undefined, undefined)).toEqual({ width: 610, height: 320 });
    expect(drawnSizeIn(null, 400, 240)).toBeUndefined();
  });
});
