import {
  COMBO_AXES,
  COMBO_MARKS,
  comboSeriesOf,
  markTakenBy,
  withComboAuto,
  withComboSeries,
  type ComboAxis,
  type ComboMark,
} from '@wechart/core';
import { useId } from 'react';

import { ColourSetting } from '../ColourSetting';

/**
 * Customize › Series for a combo (T855; AC-497, AC-498, AC-504, AC-219;
 * design 20 screen 1 pin 2, state A): a 28 px row per series with its
 * swatch, its name, its Mark — four icon buttons, Bar, Line, Area and Point,
 * each named in its tooltip and accessible name — and its Axis, Left | Right,
 * each a radio group named "‹measure› mark" and "‹measure› axis", so Tab
 * reaches each once and the arrows choose along it (native radios; R75 adds
 * no key). A row the author changed shows ↺, "Back to Auto for ‹measure›:
 * ‹mark›, ‹axis›".
 *
 * Split by a dimension (AC-504), the rows group by measure: the measure's row
 * holds its mark, axis and Auto for all its members, and the members' rows,
 * under the first measure, their swatch, name and visibility; the rest say
 * they share them. A mark another measure draws is disabled, saying why
 * (rule 122, `markTakenBy`).
 *
 * Every write goes through `withComboSeries` and `withComboAuto`
 * (`@wechart/core`), as the Metrics pill's menu and the legend's glyphs do,
 * so the three places can't disagree.
 */
export interface SeriesRowsProps {
  /** The measures drawn, in the Metrics well's order, each with its title. */
  readonly measures: readonly { readonly measure: string; readonly title: string }[];
  readonly options: Readonly<Record<string, unknown>>;
  /** A change to the options: each key set, or cleared where `undefined`. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  /** Each series' colour as drawn now, by its name: a measure, or split, a member. */
  readonly colourOf: (name: string) => string;
  /** The dimension the combo is split by, by its title, and its members as drawn. */
  readonly split?: {
    readonly dimension: string;
    readonly members: readonly { readonly name: string; readonly title: string }[];
  };
}

const MARK_NAMES: Record<ComboMark, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  point: 'Point',
};

const AXIS_NAMES: Record<ComboAxis, string> = { left: 'Left', right: 'Right' };

/** "bars", "a line", as a reason says what a measure draws. */
const DRAWS: Record<ComboMark, string> = {
  bar: 'bars',
  line: 'a line',
  area: 'an area',
  point: 'points',
};

/** A mark's glyph (direction.md §7h), in the button's own colour. */
export function MarkGlyph({ mark }: { readonly mark: ComboMark }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {mark === 'bar' ? <rect x="2" y="2" width="8" height="8" rx="2" fill="currentColor" /> : null}
      {mark === 'line' ? <rect x="0" y="5" width="12" height="2" fill="currentColor" /> : null}
      {mark === 'area' ? <rect x="0" y="2" width="12" height="8" fill="currentColor" /> : null}
      {mark === 'point' ? <circle cx="6" cy="6" r="4" fill="currentColor" /> : null}
    </svg>
  );
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function SeriesRows({ measures, options, onOptions, colourOf, split }: SeriesRowsProps) {
  const ids = useId();
  const names = measures.map((one) => one.measure);
  const splitBy = split !== undefined;
  const drawn = comboSeriesOf(names, options, { split: splitBy });
  const titleOf = (measure: string) =>
    measures.find((one) => one.measure === measure)?.title ?? measure;
  const perSeries = record(options['series']);

  /** The options' `series` after a change, as a patch: absent once empty. */
  const write = (next: Record<string, unknown>) => onOptions({ series: next['series'] });
  const setSeries = (name: string, patch: Record<string, unknown>) => {
    const own: Record<string, unknown> = { ...record(perSeries[name]), ...patch };
    for (const [key, value] of Object.entries(own)) if (value === undefined) delete own[key];
    const next: Record<string, unknown> = { ...perSeries };
    if (Object.keys(own).length === 0) delete next[name];
    else next[name] = own;
    onOptions({ series: Object.keys(next).length === 0 ? undefined : next });
  };

  const row = (measure: string, index: number) => {
    const series = drawn.find((one) => one.measure === measure);
    if (series === undefined) return null;
    const title = titleOf(measure);
    const auto = comboSeriesOf(names, withComboAuto(options, measure), { split: splitBy }).find(
      (one) => one.measure === measure,
    );
    const colour = record(perSeries[measure])['colour'];
    return (
      <div className="combo-series__row">
        {splitBy ? (
          // Split, a measure is its mark, for every member (design 20 state A).
          <span className="combo-series__glyph">
            <MarkGlyph mark={series.mark} />
          </span>
        ) : (
          <ColourSetting
            title={title}
            chosen={typeof colour === 'string' ? colour : undefined}
            drawn={colourOf(measure)}
            onChoose={(next) => setSeries(measure, { colour: next })}
          />
        )}
        {splitBy ? (
          <span className="combo-series__name">{title}</span>
        ) : (
          // Unsplit, a series is its measure, shown or hidden as any chart's
          // (AC-219; T855's review): a measure hidden as another type would
          // otherwise stay hidden with nothing to bring it back.
          <label className="customize-tab__check combo-series__name">
            <input
              type="checkbox"
              aria-label={`Show ${title}`}
              checked={record(perSeries[measure])['hidden'] !== true}
              onChange={(event) =>
                setSeries(measure, { hidden: event.target.checked ? undefined : true })
              }
            />
            {title}
          </label>
        )}
        <div
          role="radiogroup"
          aria-label={`${title} mark`}
          className="combo-series__seg combo-series__seg--icons"
        >
          {COMBO_MARKS.map((mark) => {
            const takenBy = markTakenBy(names, options, splitBy, mark, measure);
            // Never the mark it draws: two measures stored on one mark
            // before a split each keep theirs (T852-1; T855's review).
            const why =
              takenBy === undefined || split === undefined || series.mark === mark
                ? undefined
                : `${titleOf(takenBy)} draws ${DRAWS[mark]}. While the chart is split by ${split.dimension}, each measure needs its own mark.`;
            const whyId = `${ids}-${String(index)}-${mark}-why`;
            return (
              <label key={mark} title={why ?? MARK_NAMES[mark]}>
                <input
                  type="radio"
                  name={`${ids}-${String(index)}-mark`}
                  aria-label={MARK_NAMES[mark]}
                  checked={series.mark === mark}
                  disabled={why !== undefined}
                  {...(why === undefined ? {} : { 'aria-describedby': whyId })}
                  onChange={() => write(withComboSeries(options, measure, { mark }))}
                />
                <MarkGlyph mark={mark} />
                {why === undefined ? null : (
                  <span id={whyId} className="visually-hidden">
                    {why}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div role="radiogroup" aria-label={`${title} axis`} className="combo-series__seg">
          {COMBO_AXES.map((axis) => (
            <label key={axis}>
              <input
                type="radio"
                name={`${ids}-${String(index)}-axis`}
                aria-label={AXIS_NAMES[axis]}
                checked={series.axis === axis}
                onChange={() => write(withComboSeries(options, measure, { axis }))}
              />
              <span aria-hidden="true">{AXIS_NAMES[axis]}</span>
            </label>
          ))}
        </div>
        {series.auto || auto === undefined ? (
          <span className="combo-series__auto" />
        ) : (
          <button
            type="button"
            className="btn-ghost btn-sm combo-series__auto"
            aria-label={`Back to Auto for ${title}: ${auto.mark}, ${auto.axis}`}
            title={`Back to Auto: ${auto.mark}, ${auto.axis}`}
            onClick={() => write(withComboAuto(options, measure))}
          >
            ↺
          </button>
        )}
      </div>
    );
  };

  if (split === undefined) {
    return (
      <div className="combo-series">
        {measures.map(({ measure }, index) => (
          <div key={measure}>{row(measure, index)}</div>
        ))}
      </div>
    );
  }

  const [first] = measures;
  return (
    <div className="combo-series">
      {measures.map(({ measure, title }, index) => (
        <div key={measure} role="group" aria-label={title} className="combo-series__measure">
          {row(measure, index)}
          {index === 0 ? (
            split.members.map((member) => {
              const own = record(perSeries[member.name]);
              return (
                <div key={member.name} className="combo-series__row combo-series__row--member">
                  <ColourSetting
                    title={member.title}
                    chosen={typeof own['colour'] === 'string' ? own['colour'] : undefined}
                    drawn={colourOf(member.name)}
                    onChoose={(next) => setSeries(member.name, { colour: next })}
                  />
                  <label className="customize-tab__check combo-series__name">
                    <input
                      type="checkbox"
                      aria-label={`Show ${member.title}`}
                      checked={own['hidden'] !== true}
                      onChange={(event) =>
                        setSeries(member.name, { hidden: event.target.checked ? undefined : true })
                      }
                    />
                    {member.title}
                  </label>
                </div>
              );
            })
          ) : (
            <p className="combo-series__same">
              Same members, same colours, as {first?.title ?? 'the first measure'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
