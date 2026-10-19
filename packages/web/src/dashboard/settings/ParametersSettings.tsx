import { useEffect, useRef, useState } from 'react';

import type { ChartDocument, DashboardParameter } from '@wechart/core';

import { StateLine } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import type { DashboardDocument } from '../model/document';
import { newParameter, ParameterForm, useParameterModel } from './ParameterForm';
import {
  choiceProblems,
  parameterUsesOf,
  usedBySummary,
  whereWords,
  withoutParameter,
  type ParameterUse,
} from './parameterUses';

const ROLE_WORD = { measure: 'Measure', dimension: 'Dimension' } as const;

const nameOfParameter = (parameter: DashboardParameter) =>
  parameter.name.trim() === '' ? 'Unnamed parameter' : parameter.name;

/**
 * Dashboard settings › Parameters (T896, AC-531; design 21 screen 3, pins
 * 1–3; rule 137): what a parameter is, New parameter, and the dashboard's
 * parameters in 34 px rows — name, kind ("Field switch", the only kind now),
 * what it switches, its number of choices, its default and what uses it. A
 * row's name opens its form below the list. Every change is the settings
 * page's draft until Save settings, as every other section's is.
 *
 * Under the form (T897, AC-532; pins 7 and 8): what uses it, each a link
 * opening its tile selected in edit mode; whether every choice works in
 * every chart bound to it, naming each chart and choice that doesn't; and
 * Delete parameter…, which, while it is used, lists its uses and asks.
 */
export function ParametersSettings({
  document,
  chartOf,
  onChange,
  nameOf = (tileId) => tileId,
  currentOf = (parameter) => parameter.default,
  onOpenTile,
  onDelete,
  model: given,
}: {
  document: DashboardDocument;
  /** A chart tile's chart, where it is at hand: what a well's use is read from. */
  chartOf: (chartId: string) => ChartDocument | undefined;
  onChange: (next: DashboardDocument) => void;
  /** A tile's name, as the dashboard names it (AC-209). */
  nameOf?: ((tileId: string) => string) | undefined;
  /** The member a parameter stands for now: the reader's choice, else its default. */
  currentOf?: ((parameter: DashboardParameter) => string) | undefined;
  /** A use's link: its tile, opened selected in edit mode (AC-532). */
  onOpenTile?: ((tileId: string) => void) | undefined;
  /**
   * A parameter deleted (AC-532): the dashboard with each use fixed, and the
   * charts whose wells now hold the member, to be written with it.
   */
  onDelete?: ((next: DashboardDocument, charts: Record<string, ChartDocument>) => void) | undefined;
  /** The model, where the caller has it; else read here. */
  model?: unknown;
}) {
  const parameters = document.parameters ?? [];
  const [open, setOpen] = useState<string | null>(parameters[0]?.id ?? null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const read = useParameterModel();
  const model = given ?? read;
  const chosen = parameters.find((each) => each.id === open);
  const uses = chosen === undefined ? [] : parameterUsesOf(document, chosen.id, chartOf);
  const unqueryable =
    chosen === undefined || model === undefined
      ? []
      : choiceProblems(document, chosen, chartOf, model);
  const bound = uses.some((use) => use.chartId !== undefined);

  const write = (next: readonly DashboardParameter[]) => {
    onChange({ ...document, parameters: next });
  };
  const remove = (parameter: DashboardParameter) => {
    const fixed = withoutParameter(document, parameter.id, currentOf(parameter), chartOf);
    setDeleting(null);
    setOpen(null);
    if (onDelete === undefined) onChange(fixed.document);
    else onDelete(fixed.document, fixed.charts);
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
                    {nameOfParameter(parameter)}
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
        <div className="parameters-settings__open" data-parameter-open={chosen.id}>
          <ParameterForm
            key={chosen.id}
            parameter={chosen}
            model={model}
            onChange={(next) => {
              write(parameters.map((each) => (each.id === next.id ? next : each)));
            }}
          />
          <div className="parameters-settings__uses">
            <span className="parameters-settings__label" id={`uses-${chosen.id}`}>
              Used by
            </span>
            {uses.length === 0 ? (
              <span className="parameters-settings__hint">Not used yet</span>
            ) : (
              <UseList
                labelledBy={`uses-${chosen.id}`}
                uses={uses}
                parameterName={nameOfParameter(chosen)}
                nameOf={nameOf}
                onOpenTile={onOpenTile}
              />
            )}
          </div>
          {/* Checked against the charts bound to it (pin 8; rule 137). */}
          {unqueryable.length > 0 ? (
            <div className="parameters-settings__checks">
              {unqueryable.map((problem) => (
                <StateLine key={problem} kind="err" role="status" testId="parameter-unqueryable">
                  {problem}
                </StateLine>
              ))}
            </div>
          ) : bound && model !== undefined ? (
            <StateLine kind="ok" testId="parameter-checked">
              Every choice works in every chart that uses this parameter.
            </StateLine>
          ) : null}
          <div>
            <button
              type="button"
              className="btn-sm btn-ghost parameters-settings__delete"
              onClick={() => {
                // Unused, it goes at once: nothing follows it, and Cancel brings it back.
                if (uses.length === 0) remove(chosen);
                else setDeleting(chosen.id);
              }}
            >
              Delete parameter…
            </button>
          </div>
        </div>
      )}
      {chosen === undefined || deleting !== chosen.id ? null : (
        <DeleteParameterDialog
          parameter={chosen}
          uses={uses}
          valueLabel={
            chosen.choices.find((choice) => choice.member === currentOf(chosen))?.label ??
            currentOf(chosen)
          }
          nameOf={nameOf}
          onKeep={() => {
            setDeleting(null);
          }}
          onDelete={() => {
            remove(chosen);
          }}
        />
      )}
    </div>
  );
}

/** A parameter's uses: each its tile's name, a link to it, and where in it (pin 7). */
function UseList({
  uses,
  parameterName,
  nameOf,
  onOpenTile,
  labelledBy,
}: {
  uses: readonly ParameterUse[];
  parameterName: string;
  nameOf: (tileId: string) => string;
  onOpenTile?: ((tileId: string) => void) | undefined;
  labelledBy?: string;
}) {
  return (
    <ul
      className="parameters-settings__use-list"
      {...(labelledBy === undefined ? { 'aria-label': 'Uses' } : { 'aria-labelledby': labelledBy })}
    >
      {uses.map((use) => (
        <li key={`${use.tileId}/${use.where}`}>
          {onOpenTile === undefined ? (
            <b>{nameOf(use.tileId)}</b>
          ) : (
            <button
              type="button"
              className="parameters-settings__use"
              onClick={() => {
                onOpenTile(use.tileId);
              }}
            >
              {nameOf(use.tileId)}
            </button>
          )}
          <span className="parameters-settings__where">{` · ${whereWords(use, parameterName)}`}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Deleting a parameter in use (AC-532; rule 38): its uses listed, and what
 * becomes of each — it keeps the parameter's value now as a fixed field, and
 * its tile says so. An `alertdialog`, focus on Keep parameter, the answer that
 * loses nothing; Escape keeps it too.
 */
function DeleteParameterDialog({
  parameter,
  uses,
  valueLabel,
  nameOf,
  onKeep,
  onDelete,
}: {
  parameter: DashboardParameter;
  uses: readonly ParameterUse[];
  valueLabel: string;
  nameOf: (tileId: string) => string;
  onKeep: () => void;
  onDelete: () => void;
}) {
  const safe = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  // Focused once, as it opens: a later render must not pull focus back (T182).
  const keep = useRef(onKeep);
  useEffect(() => {
    keep.current = onKeep;
  });
  useEffect(() => {
    safe.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Its own Escape: not the settings page's, which would leave the page.
      event.preventDefault();
      keep.current();
    };
    window.document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
  const name = nameOfParameter(parameter);
  return (
    <div className="dialog-backdrop" data-testid="delete-parameter-dialog">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-parameter-heading"
        className="dialog"
      >
        <h2 id="delete-parameter-heading">{`Delete “${name}”?`}</h2>
        <p data-testid="delete-parameter-said">
          {`It has ${uses.length.toLocaleString('en-GB')} ${uses.length === 1 ? 'use' : 'uses'}. ${
            uses.length === 1 ? 'It keeps' : 'Each keeps'
          } ${valueLabel}, its value now, as a fixed field, and its tile says so.`}
        </p>
        <UseList uses={uses} parameterName={name} nameOf={nameOf} />
        <div className="dialog__actions">
          <button type="button" ref={safe} onClick={onKeep}>
            Keep parameter
          </button>
          <button type="button" className="btn-primary dialog__destructive" onClick={onDelete}>
            Delete parameter
          </button>
        </div>
      </div>
    </div>
  );
}
