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
  HeatmapChart,
  LineChart,
  PieChart,
  ScatterChart,
  TreemapChart,
} from 'echarts/charts';
import {
  AxisPointerComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { LabelLayout } from 'echarts/features';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  PieChart,
  TreemapChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  LegendComponent,
  TitleComponent,
  VisualMapComponent,
  LabelLayout,
  SVGRenderer,
]);

export { echarts };
