import type { AxesSettings, AxisSettings, LegendPosition, SeriesSettings } from '@wechart/charts';
import { useId, useState } from 'react';

import { AxisPanel } from './AxisPanel';

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

  if (!drawn && !cartesian) {
    return <p className="panel-section__note">This chart type has nothing to customize here.</p>;
  }

  return (
    <div className="customize-tab">
      {cartesian ? (
        <section className="customize-tab__section" aria-labelledby={`${ids}-axes`}>
          <h3 id={`${ids}-axes`}>Axes</h3>
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
              onChange={(next) => setAxis('y', next)}
            />
          </div>
        </section>
      ) : null}

      {drawn ? (
        <section className="customize-tab__section" aria-labelledby={`${ids}-legend`}>
          <h3 id={`${ids}-legend`}>Legend</h3>
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
        </section>
      ) : null}

      {series.length === 0 ? null : (
        <section className="customize-tab__section" aria-labelledby={`${ids}-series`}>
          <h3 id={`${ids}-series`}>Series</h3>
          <ul className="customize-tab__series">
            {series.map(({ name, title }) => (
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
              </li>
            ))}
          </ul>
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
        </section>
      )}

      {drawn ? (
        <section className="customize-tab__section" aria-labelledby={`${ids}-values`}>
          <h3 id={`${ids}-values`}>Values</h3>
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
        </section>
      ) : null}
    </div>
  );
}

/**
 * One series' colour (AC-219): picked, and set down as one change when the
 * picker closes — not one per shade dragged through — or put back to the
 * colour the dashboard gives its member (AC-039).
 */
function ColourSetting({
  title,
  chosen,
  drawn,
  onChoose,
}: {
  title: string;
  chosen: string | undefined;
  drawn: string;
  onChoose: (colour: string | undefined) => void;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const setDown = () => {
    if (picking === null) return;
    setPicking(null);
    if (picking !== (chosen ?? drawn)) onChoose(picking);
  };
  return (
    <>
      <input
        type="color"
        aria-label={`Colour of ${title}`}
        value={picking ?? chosen ?? drawn}
        onChange={(event) => setPicking(event.target.value)}
        onBlur={setDown}
      />
      {chosen === undefined ? null : (
        <button
          type="button"
          className="btn-ghost btn-sm"
          aria-label={`Automatic colour for ${title}`}
          onClick={() => onChoose(undefined)}
        >
          Auto
        </button>
      )}
    </>
  );
}
