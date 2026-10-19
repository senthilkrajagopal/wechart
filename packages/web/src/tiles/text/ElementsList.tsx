import { useId } from 'react';

import { TEXT_ELEMENT_LIMIT, type TextNode } from '@wechart/core';

import { elementName, elementParts, type ElementNames } from './elementName';

/**
 * A Text tile's Elements in Properties (T882, AC-519; design 21 pin 13,
 * screen 1): every element in text order, with its kind and its source, and
 * "‹n› of 10"; a row selects its element, whose settings follow below.
 */
export function ElementsList({
  elements,
  selected,
  names,
  onSelect,
}: {
  /** In text order. */
  readonly elements: readonly TextNode[];
  /** The selected element's place among them, or null. */
  readonly selected: number | null;
  readonly names: ElementNames;
  readonly onSelect: (index: number) => void;
}) {
  const heading = useId();
  if (elements.length === 0) return null;
  const chosen = selected === null ? undefined : elements[selected];
  return (
    <div className="text-elements" data-keeps-text-editing="">
      <h4 id={heading} className="text-elements__head">
        <span>Elements</span>
        <span className="text-elements__count">
          {`${String(elements.length)} of ${String(TEXT_ELEMENT_LIMIT)}`}
        </span>
      </h4>
      <ul aria-label="Elements" aria-describedby={heading} className="text-elements__list">
        {elements.map((element, index) => {
          const { kind, source } = elementParts(element, names);
          return (
            // Keyed by place: two elements may be the same in every setting.
            <li key={index}>
              <button
                type="button"
                className="text-elements__row"
                aria-current={index === selected ? true : undefined}
                // A press keeps focus where it is — in the text, while it's
                // edited — as browsers that don't focus a pressed button
                // would otherwise leave focus nowhere (T882's review).
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  onSelect(index);
                }}
              >
                <span className="text-elements__kind">{kind}</span>
                <span className="text-elements__source">{source}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {chosen === undefined ? null : <ElementSettings element={chosen} names={names} />}
    </div>
  );
}

/**
 * The selected element's settings (AC-519): what it shows, from where. Each
 * kind's own settings — format, marking, period, rules, target — are its
 * element's task's (T884–T886).
 */
function ElementSettings({ element, names }: { element: TextNode; names: ElementNames }) {
  const attrs = element.attrs ?? {};
  const measure = typeof attrs['measure'] === 'string' ? attrs['measure'] : undefined;
  const { source } = elementParts(element, names);
  const lines: [string, string][] =
    measure !== undefined
      ? [['Measure', names.measurePath(measure)]]
      : element.type === 'actionButton'
        ? [['Label', source]]
        : element.type === 'marking'
          ? [['Marking', source]]
          : element.type === 'parameterControl'
            ? [['Parameter', source]]
            : [['Filter', source]];
  return (
    <section
      className="text-element-settings"
      aria-label={`${elementName(element, names)}: settings`}
    >
      <dl>
        {lines.map(([term, value]) => (
          <div key={term} className="text-element-settings__line">
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
