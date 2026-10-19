import { useCallback, useMemo, useState } from 'react';

import {
  parameterChoiceOf,
  parameterValueOf,
  type DashboardParameter,
  type ParameterValues,
} from '@wechart/core';

/** "Metric to show: Orders": a parameter's change, as said once to a polite region. */
export function parameterSaid(parameter: DashboardParameter, member: string): string {
  return `${parameter.name}: ${parameterChoiceOf(parameter, member)?.label ?? member}`;
}

/**
 * The dashboard's parameters as a reader has them (T899, AC-534): each at
 * its default unless a link or a bookmark set it (`initial`, T900), a
 * choice applied at once, and the change said once — `said`, for the
 * dashboard's one polite region; choosing what it already holds changes
 * nothing and says nothing.
 *
 * The reader's, not the dashboard's: a value is never saved with it, as a
 * filter's isn't. A value that is no choice of its parameter reads as its
 * default (`parameterValueOf`).
 */
export function useParameters(
  parameters: readonly DashboardParameter[],
  initial: ParameterValues = {},
) {
  const [values, setValues] = useState<ParameterValues>(initial);
  const [said, setSaid] = useState('');
  const valueOf = useCallback(
    (id: string): string | undefined => {
      const parameter = parameters.find((each) => each.id === id);
      return parameter === undefined ? undefined : parameterValueOf(parameter, values[id]);
    },
    [parameters, values],
  );
  const choose = useCallback(
    (id: string, member: string) => {
      const parameter = parameters.find((each) => each.id === id);
      if (parameter === undefined) return;
      // The choice it already holds changes nothing, and says nothing.
      if (parameterValueOf(parameter, values[id]) === member) return;
      setValues((was) => ({ ...was, [id]: member }));
      setSaid(parameterSaid(parameter, member));
    },
    [parameters, values],
  );
  return useMemo(
    () => ({
      values,
      valueOf,
      choose,
      said,
      /** Every value at once: a bookmark applied, a link opened (T900). */
      replace: setValues,
    }),
    [values, valueOf, choose, said],
  );
}
