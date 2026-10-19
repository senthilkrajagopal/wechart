import { percentRefusal, STACKED_TYPES, stackOf, type ChartType, type Stack } from '@wechart/core';
import { useId, type ReactNode } from 'react';

/**
 * Customize › Stack (T957, AC-584; design 23 sheet 9): Sum or 100 %, on a
 * stacked bar or a stacked area. 100 % is disabled, with the reason, while
 * the measure isn't summed: its shares of a total wouldn't mean anything.
 * Stored sparse as `options.stack` (`withStack`).
 */
export interface StackSettingProps {
  readonly options: Readonly<Record<string, unknown>>;
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  /** The stacked measure's title (AC-220). */
  readonly measureTitle: string;
  /** Its aggregation from the model; unknown, 100 % isn't offered. */
  readonly aggType: string | undefined;
}

export function StackSetting({ options, onOptions, measureTitle, aggType }: StackSettingProps) {
  const ids = useId();
  const refusal = percentRefusal(measureTitle, aggType);
  // A measure not summed draws at Sum, whatever is stored (`isPercentStack`).
  const stack = refusal === undefined ? stackOf(options) : 'sum';
  const choose = (next: Stack) => onOptions({ stack: next === 'percent' ? 'percent' : undefined });
  return (
    <div className="customize-tab__field">
      <span id={`${ids}-stack`} className="customize-tab__label">
        Stack
      </span>
      <div role="radiogroup" aria-labelledby={`${ids}-stack`}>
        <label className="customize-tab__check">
          <input
            type="radio"
            name={`${ids}-stack`}
            checked={stack === 'sum'}
            onChange={() => choose('sum')}
          />
          Sum
        </label>
        <label className="customize-tab__check">
          <input
            type="radio"
            name={`${ids}-stack`}
            checked={stack === 'percent'}
            disabled={refusal !== undefined}
            {...(refusal === undefined ? {} : { 'aria-describedby': `${ids}-refusal` })}
            onChange={() => choose('percent')}
          />
          100 %
        </label>
      </div>
      {refusal === undefined ? null : (
        <p id={`${ids}-refusal`} className="panel-section__note">
          {refusal}
        </p>
      )}
    </div>
  );
}

/**
 * What the Customize tab takes for a chart's stacking (`CustomizeTab`'s
 * `stack` and `shareAxis`): on a stacked bar or area, the Stack setting, and
 * whether its value axis is the 100 % one; nothing for any other type.
 */
export function stackCustomize(
  type: ChartType | null,
  props: StackSettingProps,
): { stack?: ReactNode; shareAxis?: boolean } {
  if (type === null || !(STACKED_TYPES as readonly string[]).includes(type)) return {};
  return {
    stack: <StackSetting {...props} />,
    shareAxis:
      stackOf(props.options) === 'percent' &&
      percentRefusal(props.measureTitle, props.aggType) === undefined,
  };
}

/**
 * The stacking a gallery card opens its type at (AC-584, T934-1): a 100 %
 * card's type at 100 %, a plain stacked card's at Sum; nothing for any other
 * type, whose options are left as they are.
 */
export function stackChoice(
  type: ChartType,
  extras: { readonly stack?: 'percent' } | undefined,
): Stack | undefined {
  if (!(STACKED_TYPES as readonly string[]).includes(type)) return undefined;
  return extras?.stack === 'percent' ? 'percent' : 'sum';
}
