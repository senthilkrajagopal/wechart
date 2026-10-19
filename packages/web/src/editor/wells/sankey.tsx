import { ONE_STEP, sankeyModule, sankeyOf } from '@wechart/core';
import { useId } from 'react';

import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { FieldIcon } from '../FieldList';
import type { TypeWellsProps } from './registry';

/**
 * The Sankey's wells (T986, AC-610; design 23 sheet 10; direction.md rule
 * 153), after Metrics and Dimensions: Steps, the chart's dimensions in order
 * ("Channel → Region"), as the chart reads them; and what it can't draw — one
 * step (with + Step, which adds a dimension), a fifth step, a second measure,
 * or a measure that isn't summed, by the model's aggregation.
 */
const NO_OPTIONS: Readonly<Record<string, unknown>> = {};

export function SankeyWells({
  options = NO_OPTIONS,
  onAdd,
  available = [],
  titleOf = (member) => member,
  spec,
}: TypeWellsProps) {
  const ids = useId();
  const measures = spec?.measures ?? [];
  const dimensions = spec?.dimensions ?? [];
  const aggTypes = Object.fromEntries(
    available.flatMap((one) => (one.aggType === undefined ? [] : [[one.name, one.aggType]])),
  );
  const titles = Object.fromEntries([...measures, ...dimensions].map((one) => [one, titleOf(one)]));
  const { steps, refusal } = sankeyOf(
    { wells: { measures, dimensions }, options },
    aggTypes,
    titles,
  );
  const more: readonly MenuItem[] = available
    .filter((one) => one.kind === 'dimension' && !dimensions.includes(one.name))
    .map((one) => ({
      key: one.name,
      testId: `pick-${one.name}`,
      label: (
        <>
          <FieldIcon member={one} />
          {one.title}
        </>
      ),
      onSelect: () => onAdd?.('dimensions', one.name),
    }));

  return (
    <section className="well-field" aria-labelledby={`${ids}-steps`}>
      <h3 id={`${ids}-steps`} className="well-field__label">
        Steps
      </h3>
      {steps.length === 0 ? (
        <p className="panel-section__note" data-testid="sankey-steps">
          Put 2 to 4 dimensions in Dimensions, in order: a step each.
        </p>
      ) : (
        <p className="panel-section__note" data-testid="sankey-steps">
          {steps.map(titleOf).join(' → ')}
        </p>
      )}
      {refusal === undefined ? null : (
        <p className="panel-section__note" data-testid="sankey-refusal">
          {refusal}
        </p>
      )}
      {refusal === ONE_STEP ? (
        <MenuButton
          label="Add a step to Dimensions"
          className="addbtn"
          align="start"
          testId="add-sankeyStep"
          items={
            more.length === 0
              ? [
                  {
                    key: 'none',
                    label: 'No other dimension in this cube',
                    disabled: true,
                    onSelect: () => undefined,
                  },
                ]
              : more
          }
        >
          + Step
        </MenuButton>
      ) : null}
    </section>
  );
}

/**
 * Customize › Colour links by (AC-610): each link in its source's member's
 * colour, the default, or its target's. Stored sparse as `options.sankey`.
 */
export function SankeyColourLinks({
  options,
  onOptions,
}: {
  readonly options: Readonly<Record<string, unknown>>;
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
}) {
  const ids = useId();
  const { colourLinksBy } = sankeyModule.parse(options['sankey']);
  return (
    <section className="customize-tab__section" aria-labelledby={`${ids}-colour`}>
      <h3 id={`${ids}-colour`}>Colour links by</h3>
      <div role="radiogroup" aria-labelledby={`${ids}-colour`}>
        {(['source', 'target'] as const).map((by) => (
          <label key={by} className="customize-tab__check">
            <input
              type="radio"
              name={`${ids}-colour`}
              checked={colourLinksBy === by}
              onChange={() => onOptions({ sankey: sankeyModule.save({ colourLinksBy: by }) })}
            />
            {by === 'source' ? 'Source' : 'Target'}
          </label>
        ))}
      </div>
    </section>
  );
}
