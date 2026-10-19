import {
  inSeriesOrder,
  type AxesSettings,
  type AxisSettings,
  type LegendPosition,
  type SeriesSettings,
} from '@wechart/charts';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { AxisPanel } from './AxisPanel';
import { ColourSetting } from './ColourSetting';
import { SeriesRows, type SeriesRowsProps } from './combo/SeriesRows';
import { BoxplotDistribution } from './wells/boxplotDistribution';
import { SankeyColourLinks } from './wells/sankey';

/**
 * The chart editor's Customize tab (AC-219; the prototype's customizeTab):
 * the axes, the legend's visibility and position, each series' colour and
 * visibility and whether series stack, data labels and their number format.
 * Each setting is a sparse entry in the chart's options — absent means "as
 * the chart draws it" — which the renderer applies (`@wechart/charts`,
 * `customize.ts`, `axis.ts`). A section shows only for the types it can
 * change: a setting that cannot apply is worse than none.
 */
export interface CustomizeTabProps {
  /** The chart's options, as the editor holds them. */
  readonly options: Readonly<Record<string, unknown>>;
  /** A change to them: each key set, or cleared where `undefined`. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  /** Whether the chart type has cartesian axes to set (AC-040). */
  readonly cartesian: boolean;
  /** Which of those axes carry values — where "include zero" means something. */
  readonly valueAxes: readonly ('x' | 'y')[];
  /** Whether the type draws marks a legend and labels apply to (not a table or KPI). */
  readonly drawn: boolean;
  /** Whether its series can stack: a bar or line family type. */
  readonly stackable: boolean;
  /** The series it draws, by name, with how a reader knows each: none for a pie's slices. */
  readonly series: readonly { readonly name: string; readonly title: string }[];
  /** Each series' colour as drawn now, the default a picker starts from. */
  readonly colourOf: (name: string) => string;
  /** A box plot: its whiskers are a chart option (T399, AC-306). */
  readonly whiskers?: boolean;
  /** A box plot's Each point is is set: its Distribution's points need it (T990, AC-591). */
  readonly eachPointIs?: boolean;
  /** A Sankey: Colour links by, Source or Target (T986, AC-610). */
  readonly sankey?: boolean;
  /**
   * A combo's measures and its split, where it has one: its Series section
   * is then a row per series with its mark and axis (T855, AC-497).
   */
  readonly combo?: Pick<SeriesRowsProps, 'measures' | 'split'>;
  /** Customize › Stack, Sum or 100 %, on a stacked bar or area (T957, AC-584). */
  readonly stack?: ReactNode;
  /** At 100 %, the value axis is 0–100 %, every 25 %, and nothing else of it is set (AC-584). */
  readonly shareAxis?: boolean;
}

const POSITIONS: readonly [LegendPosition, string][] = [
  ['top', 'Top'],
  ['right', 'Right'],
  ['bottom', 'Bottom'],
  ['left', 'Left'],
];

/** The Values section's number formats, the model's own first (AC-046). */
const VALUE_FORMATS: readonly [string, string][] = [
  ['', 'As the model writes it'],
  ['compact', 'Compact (1.3K)'],
  ['full', 'Full (1,300)'],
  ['percent', 'Percent'],
  ['currency', 'Currency'],
];

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** A setting cleared is absent, so the saved options stay sparse. */
const sparse = (value: Record<string, unknown>) => {
  const kept = Object.fromEntries(Object.entries(value).filter(([, each]) => each !== undefined));
  return Object.keys(kept).length === 0 ? undefined : kept;
};

export function CustomizeTab({
  options,
  onOptions,
  cartesian,
  valueAxes,
  drawn,
  stackable,
  series,
  colourOf,
  whiskers = false,
  eachPointIs = false,
  sankey = false,
  combo,
  stack,
  shareAxis = false,
}: CustomizeTabProps) {
  const ids = useId();
  const axes = record(options['axes']) as AxesSettings;
  const legend = record(options['legend']);
  const perSeries = record(options['series']) as Record<string, SeriesSettings>;

  const setAxis = (axis: 'x' | 'y', next: AxisSettings) =>
    onOptions({ axes: sparse({ ...axes, [axis]: sparse({ ...next }) }) });
  const setLegend = (patch: Record<string, unknown>) =>
    onOptions({ legend: sparse({ ...legend, ...patch }) });
  const setSeries = (name: string, patch: Record<string, unknown>) =>
    onOptions({
      series: sparse({ ...perSeries, [name]: sparse({ ...perSeries[name], ...patch }) }),
    });

  /**
   * The series in the order set (T392, AC-300), as the chart draws, stacks
   * and lists them, and saved as the whole list of their names; back in the
   * data's own order, nothing is kept. Focus follows the series moved, and
   * the move is said, as the index editor's columns are (T152's review).
   */
  const setOrder = Array.isArray(options['seriesOrder'])
    ? (options['seriesOrder'] as unknown[]).filter(
        (name): name is string => typeof name === 'string',
      )
    : [];
  const ordered = inSeriesOrder(series, setOrder);
  const moveButtons = useRef(new Map<string, HTMLButtonElement>());
  const following = useRef<{ at: number; way: 'up' | 'down' } | null>(null);
  const [said, setSaid] = useState('');
  useEffect(() => {
    const target = following.current;
    if (target === null) return;
    following.current = null;
    const there = moveButtons.current.get(`${String(target.at)}:${target.way}`);
    const other = moveButtons.current.get(
      `${String(target.at)}:${target.way === 'up' ? 'down' : 'up'}`,
    );
    (there !== undefined && !there.disabled ? there : other)?.focus();
  });
  const moveSeries = (from: number, to: number) => {
    const next = [...ordered];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    /**
     * The whole order is kept once set, even where it matches the data's
     * today: that can change on a refresh, and the order set must not. A
     * series not drawn today (filtered out, say) keeps its saved place; the
     * ones drawn fill theirs in their new order (T392's review).
     */
    const drawnNames = next.map((one) => one.name);
    const drawnSet = new Set(drawnNames);
    let filled = 0;
    const kept = setOrder.map((name) => (drawnSet.has(name) ? drawnNames[filled++]! : name));
    onOptions({ seriesOrder: [...kept, ...drawnNames.slice(filled)] });
    following.current = { at: to, way: to < from ? 'up' : 'down' };
    setSaid(`${moved.title} moved to position ${String(to + 1)} of ${String(next.length)}.`);
  };
  const moveButton = (index: number, way: 'up' | 'down', title: string) => (
    <button
      type="button"
      className="btn-sm"
      aria-label={`Move ${title} ${way}`}
      disabled={way === 'up' ? index === 0 : index === ordered.length - 1}
      ref={(node) => {
        const key = `${String(index)}:${way}`;
        if (node === null) moveButtons.current.delete(key);
        else moveButtons.current.set(key, node);
      }}
      onClick={() => {
        moveSeries(index, way === 'up' ? index - 1 : index + 1);
      }}
    >
      {way === 'up' ? '↑' : '↓'}
    </button>
  );

  if (!drawn && !cartesian && !whiskers) {
    return <p className="panel-section__note">This chart type has nothing to customize here.</p>;
  }

  return (
    <div className="customize-tab">
      {cartesian ? (
        // Each section folds, as the prototype's <details> (editor.js:316;
        // chart-editor-Q8, T688): Axes and Legend open at first.
        <details className="customize-tab__section" open aria-labelledby={`${ids}-axes`}>
          <summary>
            <h3 id={`${ids}-axes`}>Axes</h3>
          </summary>
          <div data-testid="axes-section">
            <AxisPanel
              axis="x"
              label="X axis"
              settings={axes.x ?? {}}
              values={valueAxes.includes('x')}
              onChange={(next) => setAxis('x', next)}
            />
            <AxisPanel
              axis="y"
              label="Y axis"
              settings={axes.y ?? {}}
              values={valueAxes.includes('y')}
              share={shareAxis}
              onChange={(next) => setAxis('y', next)}
            />
          </div>
        </details>
      ) : null}

      {stack === undefined ? null : (
        <section className="customize-tab__section" data-testid="stack-section">
          {stack}
        </section>
      )}

      {drawn ? (
        <details className="customize-tab__section" open aria-labelledby={`${ids}-legend`}>
          <summary>
            <h3 id={`${ids}-legend`}>Legend</h3>
          </summary>
          <label className="customize-tab__check">
            <input
              type="checkbox"
              checked={legend['show'] !== false}
              onChange={(event) => setLegend({ show: event.target.checked ? undefined : false })}
            />
            Show the legend
          </label>
          <div className="field">
            <label htmlFor={`${ids}-position`}>Legend position</label>
            <select
              id={`${ids}-position`}
              className="select-sm"
              value={typeof legend['position'] === 'string' ? legend['position'] : 'top'}
              disabled={legend['show'] === false}
              onChange={(event) =>
                setLegend({
                  position: event.target.value === 'top' ? undefined : event.target.value,
                })
              }
            >
              {POSITIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <p className="panel-section__note">A legend shows only for two or more series.</p>
        </details>
      ) : null}

      {series.length === 0 && combo === undefined ? null : (
        // Closed at first, and counted, as the prototype's "SERIES (n)".
        <details className="customize-tab__section" aria-labelledby={`${ids}-series`}>
          <summary>
            <h3 id={`${ids}-series`}>
              {/* A combo's every measure, one on another scale too (T855's follow-up). */}
              Series ({combo === undefined ? series.length : combo.measures.length})
            </h3>
          </summary>
          {combo === undefined ? null : (
            // A combo's series: each one's mark and axis, in place of the
            // list below (T855, AC-497; design 20 screen 1 pin 2).
            <SeriesRows
              measures={combo.measures}
              {...(combo.split === undefined ? {} : { split: combo.split })}
              options={options}
              onOptions={onOptions}
              colourOf={colourOf}
            />
          )}
          <ol
            className="customize-tab__series"
            aria-label="Series order"
            hidden={combo !== undefined}
          >
            {ordered.map(({ name, title }, index) => (
              <li key={name}>
                <ColourSetting
                  title={title}
                  chosen={perSeries[name]?.colour}
                  drawn={colourOf(name)}
                  onChoose={(colour) => setSeries(name, { colour })}
                />
                <label className="customize-tab__check">
                  <input
                    type="checkbox"
                    checked={perSeries[name]?.hidden !== true}
                    onChange={(event) =>
                      setSeries(name, { hidden: event.target.checked ? undefined : true })
                    }
                  />
                  {title}
                </label>
                {ordered.length > 1 ? (
                  <span className="customize-tab__move">
                    {moveButton(index, 'up', title)}
                    {moveButton(index, 'down', title)}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <span className="visually-hidden" role="status">
            {said}
          </span>
          {setOrder.length > 0 ? (
            // Back to the order the data comes in, said so rather than
            // guessed from a move that happens to match it.
            <button
              type="button"
              className="btn-sm customize-tab__reset"
              aria-label="Reset the series order"
              onClick={() => {
                onOptions({ seriesOrder: undefined });
                setSaid('The series are in the data’s order again.');
              }}
            >
              Reset order
            </button>
          ) : null}
          {stackable && series.length > 1 ? (
            <label className="customize-tab__check">
              <input
                type="checkbox"
                checked={options['stacked'] === true}
                onChange={(event) =>
                  onOptions({ stacked: event.target.checked ? true : undefined })
                }
              />
              Stack the series
            </label>
          ) : null}
        </details>
      )}

      {drawn ? (
        // Closed at first, as the prototype's VALUES.
        <details className="customize-tab__section" aria-labelledby={`${ids}-values`}>
          <summary>
            <h3 id={`${ids}-values`}>Values</h3>
          </summary>
          <label className="customize-tab__check">
            <input
              type="checkbox"
              checked={options['dataLabels'] === true}
              onChange={(event) =>
                onOptions({ dataLabels: event.target.checked ? true : undefined })
              }
            />
            Data labels
          </label>
          <div className="field">
            <label htmlFor={`${ids}-format`}>Number format</label>
            <select
              id={`${ids}-format`}
              className="select-sm"
              value={typeof options['valueFormat'] === 'string' ? options['valueFormat'] : ''}
              onChange={(event) =>
                onOptions({
                  valueFormat: event.target.value === '' ? undefined : event.target.value,
                })
              }
            >
              {VALUE_FORMATS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <p className="panel-section__note">
            For the data labels; the value axis’s own format is set under Axes.
          </p>
        </details>
      ) : null}

      {whiskers ? (
        /* A box plot's whiskers (T399, AC-306): Tukey's unless chosen otherwise. */
        <section className="customize-tab__section" aria-labelledby={`${ids}-whiskers`}>
          <h3 id={`${ids}-whiskers`}>Whiskers</h3>
          <div role="radiogroup" aria-labelledby={`${ids}-whiskers`}>
            <label className="customize-tab__check">
              <input
                type="radio"
                name={`${ids}-whiskers`}
                checked={options['whiskers'] !== 'minmax'}
                onChange={() => onOptions({ whiskers: undefined })}
              />
              1.5 × IQR, values beyond as dots
            </label>
            <label className="customize-tab__check">
              <input
                type="radio"
                name={`${ids}-whiskers`}
                checked={options['whiskers'] === 'minmax'}
                onChange={() => onOptions({ whiskers: 'minmax' })}
              />
              Minimum and maximum
            </label>
          </div>
        </section>
      ) : null}
      {whiskers ? (
        <BoxplotDistribution options={options} onOptions={onOptions} eachPointIs={eachPointIs} />
      ) : null}
      {sankey ? <SankeyColourLinks options={options} onOptions={onOptions} /> : null}
    </div>
  );
}
