/**
 * The ECharts build wechart ships.
 *
 * Imported through `echarts/core` with an explicit registration set, never the
 * root package. `docs/research/echarts.md` is blunt about why: `sideEffects`
 * lists `index.js` and `lib/chart/*.js`, so one stray `import 'echarts'` pulls
 * the whole library and adds about 368 KB gzipped.
 *
 * The **SVG** renderer, not canvas. ECharts' own guidance points at SVG for
 * "multiple chart instances that risk browser crashes" and low-memory
 * situations, which is a dashboard of many small tiles; and since 5.3.0 its
 * virtual-DOM refactor made it 2–10× faster. It is also the renderer the tests
 * drive, so what they measure and what the browser paints come off the same
 * path. AC-174/AC-175 still owe this a measurement with real tile counts.
 */
import {
  BarChart,
  BoxplotChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  MapChart,
  ParallelChart,
  PieChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts';
import {
  AxisPointerComponent,
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  BoxplotChart,
  // The box plot's violin (T992), wechart's own custom series
  // (research/echarts-violin.md).
  CustomChart,
  LineChart,
  ScatterChart,
  PieChart,
  TreemapChart,
  HeatmapChart,
  // The country map (T398): its geo component and `registerMap` come with
  // it, and `registerMap` does nothing until it is used (research/country-map.md).
  MapChart,
  // Parallel coordinates (T982): it installs its `parallel` component itself
  // (research/echarts-parallel.md).
  ParallelChart,
  // The Sankey (T987; research/echarts-sankey.md).
  SankeyChart,
  // A bullet chart's members past the tile's height, scrolled by the wheel or
  // a slider, the value axis fixed (T954; research/echarts-bullet.md §2).
  DataZoomInsideComponent,
  DataZoomSliderComponent,
  // The map legend's "No data" swatch (rule 86).
  GraphicComponent,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  // A combo's reference lines and bands (T863; research/echarts.md,
  // research/rich-tiles-and-combo-tech.md "Reference lines and areas").
  MarkLineComponent,
  MarkAreaComponent,
  TitleComponent,
  VisualMapComponent,
  LabelLayout,
  SVGRenderer,
]);

export { echarts };
