import { describe, expect, it } from 'vitest';

import { chartSvg, imageFileName } from './chartImage';

/**
 * T272 / AC-244: SVG and PNG images of a chart ECharts draws, each the chart
 * as drawn. The SVG is ECharts' own rendering of what it has drawn
 * (`renderToSVGString`, research/clipboard-and-image-export.md), made a file
 * that stands alone; rasterising it is the browser's, tested end to end.
 */
const DRAWN =
  '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
  '<rect width="400" height="300" x="0" y="0" fill="none"/>' +
  '<path d="M10 10L20 20" fill="#3a6ea5" fill-opacity="0.28"/>' +
  '<text x="5" y="5" style="font-size:12px">shipped</text></svg>';
const chart = { getWidth: () => 400, getHeight: () => 300, renderToSVGString: () => DRAWN };

describe('a chart as an SVG file', () => {
  it('keeps what was drawn, marking included, at its own size', () => {
    const { svg, width, height } = chartSvg(chart, { surface: '#ffffff' });
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;

    expect([width, height]).toEqual([400, 300]);
    expect(root.getAttribute('width')).toBe('400');
    expect(root.getAttribute('viewBox')).toBe('0 0 400 300');
    // The unmarked item's fade, as drawn.
    expect(root.querySelector('path')?.getAttribute('fill-opacity')).toBe('0.28');
    expect(root.querySelector('text')?.textContent).toBe('shipped');
  });

  it('lies on the tile’s surface, so its inks read wherever it is put', () => {
    const { svg } = chartSvg(chart, { surface: 'rgb(255, 255, 255)' });
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    const back = [...root.children].find((node) => node.localName === 'rect');

    expect(back?.getAttribute('fill')).toBe('rgb(255, 255, 255)');
    expect(back?.getAttribute('width')).toBe('400');
    // Before anything drawn, so it is behind all of it.
    expect(root.querySelector('path')?.compareDocumentPosition(back as Node)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it('is its size times the pixel ratio, drawn in the same coordinates', () => {
    const { svg, width, height } = chartSvg(chart, { pixelRatio: 2 });
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;

    expect([width, height]).toEqual([800, 600]);
    expect(root.getAttribute('height')).toBe('600');
    expect(root.getAttribute('viewBox')).toBe('0 0 400 300');
  });
});

describe('an image file’s name', () => {
  it('is the chart’s title with the extension, without characters a file system refuses', () => {
    expect(imageFileName('Revenue: by region?', 'png')).toBe('Revenue- by region-.png');
    expect(imageFileName('  ', 'svg')).toBe('chart.svg');
  });
});
