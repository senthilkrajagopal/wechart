import {
  parallelModule,
  parallelOf,
  sharedScaleRefusal,
  tooFewMeasures,
  type MemberFormats,
} from '@wechart/core';
import { useId } from 'react';

import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { FieldIcon } from '../FieldList';
import type { TypeWellsProps } from './registry';

/**
 * Parallel coordinates' wells (T981, AC-597; design 23 sheet 7; direction.md
 * rule 159), after Metrics and Dimensions: Line by (the first dimension),
 * Colour (an optional second one) and the axes (the measures, in order), as
 * the chart reads its fields; then Scale, "Each axis, min to max" by default
 * or "Shared", which is disabled with its reason while the measures are in
 * more than one format. With fewer than 3 measures, it says so, with
 * + Measure adding one to Metrics.
 */
const NO_OPTIONS: Readonly<Record<string, unknown>> = {};
const NO_FORMATS: MemberFormats = {};

export function ParallelWells({
  options = NO_OPTIONS,
  onOptions,
  onAdd,
  available = [],
  titleOf = (member) => member,
  formats = NO_FORMATS,
  spec,
}: TypeWellsProps) {
  const ids = useId();
  const measures = spec?.measures ?? [];
  const chart = { wells: { measures, dimensions: spec?.dimensions ?? [] }, options };
  const measureFormats = measures.map((name) => formats[name]);
  const refusal = sharedScaleRefusal(measureFormats);
  const { lineBy, colour, axes, scale } = parallelOf(chart, measureFormats);
  const tooFew = tooFewMeasures(measures.length);
  const more: readonly MenuItem[] = available
    .filter((one) => one.kind === 'measure' && !measures.includes(one.name))
    .map((one) => ({
      key: one.name,
      testId: `pick-${one.name}`,
      label: (
        <>
          <FieldIcon member={one} />
          {one.title}
        </>
      ),
      onSelect: () => onAdd?.('measures', one.name),
    }));

  return (
    <>
      <section className="well-field" aria-labelledby={`${ids}-lineBy`}>
        <h3 id={`${ids}-lineBy`} className="well-field__label">
          Line by
        </h3>
        <p className="panel-section__note" data-testid="parallel-lineBy">
          {lineBy === undefined
            ? 'Put a dimension in Dimensions: one line per member.'
            : titleOf(lineBy)}
        </p>
      </section>

      <section className="well-field" aria-labelledby={`${ids}-colour`}>
        <h3 id={`${ids}-colour`} className="well-field__label">
          Colour
        </h3>
        <p className="panel-section__note" data-testid="parallel-colour">
          {colour === undefined ? 'Optional: a second dimension in Dimensions.' : titleOf(colour)}
        </p>
      </section>

      <section className="well-field" aria-labelledby={`${ids}-axes`}>
        <h3 id={`${ids}-axes`} className="well-field__label">
          Axes
        </h3>
        {axes.length === 0 ? null : (
          <p className="panel-section__note" data-testid="parallel-axes">
            {axes.map(titleOf).join(' → ')}
          </p>
        )}
        {tooFew === undefined ? null : (
          <>
            <p className="panel-section__note" data-testid="parallel-too-few">
              {tooFew}
            </p>
            <MenuButton
              label="Add a measure to Metrics"
              className="addbtn"
              align="start"
              testId="add-parallelMeasure"
              items={
                more.length === 0
                  ? [
                      {
                        key: 'none',
                        label: 'No other measure in this cube',
                        disabled: true,
                        onSelect: () => undefined,
                      },
                    ]
                  : more
              }
            >
              + Measure
            </MenuButton>
          </>
        )}
      </section>

      <section className="well-field" aria-labelledby={`${ids}-scale`}>
        <h3 id={`${ids}-scale`} className="well-field__label">
          Scale
        </h3>
        <div role="radiogroup" aria-labelledby={`${ids}-scale`}>
          <label className="customize-tab__check">
            <input
              type="radio"
              name={`${ids}-scale`}
              checked={scale === 'each'}
              onChange={() => onOptions?.({ parallel: parallelModule.save({ scale: 'each' }) })}
            />
            Each axis, min to max
          </label>
          <label className="customize-tab__check">
            <input
              type="radio"
              name={`${ids}-scale`}
              checked={scale === 'shared'}
              disabled={refusal !== undefined}
              {...(refusal === undefined ? {} : { 'aria-describedby': `${ids}-refusal` })}
              onChange={() => onOptions?.({ parallel: parallelModule.save({ scale: 'shared' }) })}
            />
            Shared
          </label>
        </div>
        {refusal === undefined ? null : (
          <p id={`${ids}-refusal`} className="panel-section__note">
            {refusal}
          </p>
        )}
      </section>
    </>
  );
}
