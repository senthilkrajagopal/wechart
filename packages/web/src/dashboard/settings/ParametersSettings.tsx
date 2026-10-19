import { useState } from 'react';

import type { ChartDocument, DashboardParameter } from '@wechart/core';

import type { DashboardDocument } from '../model/document';
import { newParameter, ParameterForm, useParameterModel } from './ParameterForm';
import { parameterUsesOf, usedBySummary } from './parameterUses';

const ROLE_WORD = { measure: 'Measure', dimension: 'Dimension' } as const;

/**
 * Dashboard settings › Parameters (T896, AC-531; design 21 screen 3, pins
 * 1–3; rule 137): what a parameter is, New parameter, and the dashboard's
 * parameters in 34 px rows — name, kind ("Field switch", the only kind now),
 * what it switches, its number of choices, its default and what uses it. A
 * row's name opens its form below the list. Every change is the settings
 * page's draft until Save settings, as every other section's is.
 */
export function ParametersSettings({
  document,
  chartOf,
  onChange,
}: {
  document: DashboardDocument;
  /** A chart tile's chart, where it is at hand: what a well's use is read from. */
  chartOf: (chartId: string) => ChartDocument | undefined;
  onChange: (next: DashboardDocument) => void;
}) {
  const parameters = document.parameters ?? [];
  const [open, setOpen] = useState<string | null>(parameters[0]?.id ?? null);
  const model = useParameterModel();
  const chosen = parameters.find((each) => each.id === open);

  const write = (next: readonly DashboardParameter[]) => {
    onChange({ ...document, parameters: next });
  };

  return (
    <div className="parameters-settings">
      <p className="settings-page__intro">
        A parameter is a value readers change from a control in a Text tile. Charts and text that
        use it follow it. A field switch chooses which measure or dimension they use.
      </p>
      <button
        type="button"
        className="btn-sm"
        onClick={() => {
          const made = newParameter(parameters);
          write([...parameters, made]);
          setOpen(made.id);
        }}
      >
        New parameter
      </button>
      {parameters.length === 0 ? (
        <p className="parameters-settings__none">This dashboard has no parameters yet.</p>
      ) : null}
      <table aria-label="Parameters" className="parameters-settings__table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Kind</th>
            <th scope="col">Switches a</th>
            <th scope="col">Choices</th>
            <th scope="col">Default</th>
            <th scope="col">Used by</th>
          </tr>
        </thead>
        <tbody>
          {parameters.map((parameter) => {
            const fallback = parameter.choices.find(
              (choice) => choice.member === parameter.default,
            );
            return (
              <tr
                key={parameter.id}
                data-parameter={parameter.id}
                aria-selected={parameter.id === open}
                className="parameters-settings__row"
              >
                <td>
                  <button
                    type="button"
                    className="parameters-settings__name"
                    aria-expanded={parameter.id === open}
                    onClick={() => {
                      setOpen(parameter.id === open ? null : parameter.id);
                    }}
                  >
                    {parameter.name.trim() === '' ? 'Unnamed parameter' : parameter.name}
                  </button>
                </td>
                <td>Field switch</td>
                <td>{ROLE_WORD[parameter.role]}</td>
                <td>{parameter.choices.length.toLocaleString('en-GB')}</td>
                <td>{fallback?.label ?? '—'}</td>
                <td>{usedBySummary(parameterUsesOf(document, parameter.id, chartOf))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {chosen === undefined ? null : (
        <ParameterForm
          key={chosen.id}
          parameter={chosen}
          model={model}
          onChange={(next) => {
            write(parameters.map((each) => (each.id === next.id ? next : each)));
          }}
        />
      )}
    </div>
  );
}
