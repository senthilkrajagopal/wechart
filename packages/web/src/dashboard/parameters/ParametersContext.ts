import { createContext, useContext } from 'react';

import type { DashboardParameter, ParameterValues } from '@wechart/core';

/**
 * The dashboard's parameters as what draws a chart or a Text tile sees them
 * (F46; T898, AC-533): their definitions, the reader's choice of each, and
 * — in a dashboard-local chart's editor only — that its wells may bind them
 * and make a new one (21-Q5 (a): a chart from folders binds none).
 */
export interface DashboardParametersState {
  readonly parameters: readonly DashboardParameter[];
  readonly values: ParameterValues;
  /** Whether the chart being edited is local to this dashboard, and so may bind one. */
  readonly bindable: boolean;
  /** Adds a parameter made from a well's picker to the dashboard, as one change. */
  readonly onCreate?: ((parameter: DashboardParameter) => void) | undefined;
}

export const ParametersContext = createContext<DashboardParametersState>({
  parameters: [],
  values: {},
  bindable: false,
});

export const useDashboardParameters = (): DashboardParametersState => useContext(ParametersContext);

/** "Revenue, Orders or Margin %": a parameter's choices by label, as its tooltip says them. */
export function choicesSaid(parameter: DashboardParameter): string {
  const labels = parameter.choices.map((choice) => choice.label);
  const last = labels.at(-1);
  if (last === undefined) return 'no choices yet';
  return labels.length === 1 ? last : `${labels.slice(0, -1).join(', ')} or ${last}`;
}
