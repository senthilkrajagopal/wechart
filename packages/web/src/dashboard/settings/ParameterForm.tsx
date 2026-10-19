import { QueryClientContext } from '@tanstack/react-query';
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  PARAMETER_CHOICE_LIMIT,
  dashboardParameterProblems,
  type DashboardParameter,
  type ParameterChoice,
  type ParameterRole,
} from '@wechart/core';

import { cubesFrom, membersOf, type Member } from '../../editor/fields';
import { PathPicker, type PathPickerGroup } from '../../editor/PathPicker';
import { metaQueryOf, useWorkspaceItem } from '../../query/meta';
import { Menu, type MenuEntry } from '../../shell/Menu';
import { useFocusTrap } from '../../shell/useFocusTrap';

/**
 * The model the parameter's choices are picked from: the open item's (a
 * workspace dashboard's overlay), from the query cache where there is one,
 * else asked once. A plain hook, so the settings page renders where no query
 * client is provided (its tests).
 */
export function useParameterModel(): unknown {
  const workspace = useWorkspaceItem();
  const client = useContext(QueryClientContext);
  const [model, setModel] = useState<unknown>(undefined);
  useEffect(() => {
    let live = true;
    const query = metaQueryOf(workspace);
    const asked = client === undefined ? query.queryFn() : client.fetchQuery(query);
    void asked
      .then((answer) => {
        if (live) setModel(answer);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, workspace]);
  return model;
}

/** A member of the role: a measure, or a dimension (time ones included). */
const ofRole = (member: Member, role: ParameterRole) =>
  role === 'measure'
    ? member.kind === 'measure'
    : member.kind === 'dimension' || member.kind === 'timeDimension';

/** Every member of the model, by name. */
function membersByName(model: unknown): Map<string, Member> {
  const found = new Map<string, Member>();
  for (const cube of cubesFrom(model))
    for (const member of membersOf(model, cube.name))
      if (!found.has(member.name)) found.set(member.name, member);
  return found;
}

const ROLE_WORD: Readonly<Record<ParameterRole, string>> = {
  measure: 'Measure',
  dimension: 'Dimension',
};

const counted = (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'choice' : 'choices'}`;

/**
 * A parameter's form (T896, AC-531; design 21 screen 3, pins 4–6; rule 137):
 * its name; what it switches, a Measure or a Dimension, a change asking first
 * while choices are set, since they must go; its choices, picked with the
 * field picker from the model's members of that role — never typed — each
 * with the label its control shows, ordered by its ⋮⋮ menu, at most 1,000;
 * and its default among them. What is wrong with it is said under it.
 */
export function ParameterForm({
  parameter,
  onChange,
  model: given,
}: {
  parameter: DashboardParameter;
  onChange: (next: DashboardParameter) => void;
  /** The model, where the caller has it; else read here. */
  model?: unknown;
}) {
  const id = useId();
  const read = useParameterModel();
  const model = given ?? read;
  const members = useMemo(() => membersByName(model), [model]);
  const [asking, setAsking] = useState<ParameterRole | undefined>(undefined);
  const [moving, setMoving] = useState<number | null>(null);
  const { role, choices } = parameter;
  const full = choices.length >= PARAMETER_CHOICE_LIMIT;

  const titleOf = (member: string) => members.get(member)?.title ?? member;
  const groups: PathPickerGroup[] = cubesFrom(model)
    .map((cube) => ({
      label: cube.title,
      rows: membersOf(model, cube.name)
        .filter((member) => ofRole(member, role))
        .map((member) => ({
          key: `${cube.name}/${member.name}`,
          value: member.name,
          title: member.shortTitle,
          searchText: member.title,
          kind: cube.isView ? ('view' as const) : ('cube' as const),
          path: cube.title,
          data: { member: member.name },
          // Each member once: one already a choice is listed, not chosen again.
          disabled: choices.some((choice) => choice.member === member.name),
        })),
    }))
    .filter((group) => group.rows.length > 0);

  const setChoices = (next: readonly ParameterChoice[]) => {
    const keeps = next.some((choice) => choice.member === parameter.default);
    onChange({
      ...parameter,
      choices: next,
      default: keeps ? parameter.default : (next[0]?.member ?? ''),
    });
  };
  const move = (at: number, by: number) => {
    const next = [...choices];
    const [moved] = next.splice(at, 1);
    if (moved === undefined) return;
    next.splice(at + by, 0, moved);
    setChoices(next);
  };
  const moveEntries = (at: number): MenuEntry[] => [
    {
      kind: 'item',
      key: 'up',
      label: 'Move up',
      disabled: at === 0 ? 'It is first.' : undefined,
      onSelect: () => {
        move(at, -1);
      },
    },
    {
      kind: 'item',
      key: 'down',
      label: 'Move down',
      disabled: at === choices.length - 1 ? 'It is last.' : undefined,
      onSelect: () => {
        move(at, 1);
      },
    },
    {
      kind: 'item',
      key: 'remove',
      label: 'Remove',
      onSelect: () => {
        setChoices(choices.filter((_, index) => index !== at));
      },
    },
  ];
  const switchTo = (next: ParameterRole) => {
    onChange({ ...parameter, role: next, choices: [], default: '' });
    setAsking(undefined);
  };
  const problems =
    model === undefined
      ? dashboardParameterProblems(parameter)
      : dashboardParameterProblems(parameter, (member) => {
          const found = members.get(member);
          if (found === undefined) return undefined;
          return found.kind === 'measure' ? 'measure' : 'dimension';
        });

  return (
    <div role="group" aria-label="Parameter" className="parameter-form">
      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          type="text"
          value={parameter.name}
          onChange={(event) => {
            onChange({ ...parameter, name: event.target.value });
          }}
        />
      </div>
      <fieldset className="parameter-form__role">
        <legend>Switches a</legend>
        {(['measure', 'dimension'] as const).map((each) => (
          <label key={each}>
            <input
              type="radio"
              name={`${id}-role`}
              value={each}
              checked={role === each}
              onChange={() => {
                if (each === role) return;
                // Its choices must go: asked first while there are any.
                if (choices.length > 0) setAsking(each);
                else switchTo(each);
              }}
            />
            {ROLE_WORD[each]}
          </label>
        ))}
        <p className="parameter-form__hint">
          Kind: field switch. Value parameters for what-if come later.
        </p>
      </fieldset>
      {asking === undefined ? null : (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby={`${id}-ask`}
          className="parameter-form__ask"
        >
          <p id={`${id}-ask`}>{`Switch to ${ROLE_WORD[asking]}?`}</p>
          <p>{`Its ${counted(choices.length)} are ${role === 'measure' ? 'measures' : 'dimensions'}, so they'll be removed.`}</p>
          <button
            type="button"
            className="btn-sm"
            onClick={() => {
              setAsking(undefined);
            }}
          >
            {role === 'measure' ? 'Keep measures' : 'Keep dimensions'}
          </button>
          <button
            type="button"
            className="btn-sm"
            onClick={() => {
              switchTo(asking);
            }}
          >
            {`Switch and remove ${counted(choices.length)}`}
          </button>
        </div>
      )}
      <p className="parameter-form__head">
        {`Choices · in the order the control shows them · up to ${PARAMETER_CHOICE_LIMIT.toLocaleString('en-GB')}`}
      </p>
      <ol aria-label="Choices" className="parameter-form__choices">
        {choices.map((choice, at) => (
          <li key={choice.member} className="parameter-form__choice" data-member={choice.member}>
            <span className="parameter-form__grip">
              <button
                type="button"
                className="icon-button"
                aria-label={`Move ${choice.label === '' ? titleOf(choice.member) : choice.label}`}
                aria-expanded={moving === at}
                onClick={() => {
                  setMoving(moving === at ? null : at);
                }}
              >
                ⋮⋮
              </button>
              {moving === at ? (
                <Menu
                  label={`Move ${choice.label}`}
                  entries={moveEntries(at)}
                  onClose={() => {
                    setMoving(null);
                  }}
                />
              ) : null}
            </span>
            <span className="parameter-form__member">{titleOf(choice.member)}</span>
            <input
              type="text"
              aria-label={`Label for ${titleOf(choice.member)}`}
              value={choice.label}
              onChange={(event) => {
                setChoices(
                  choices.map((each, index) =>
                    index === at ? { ...each, label: event.target.value } : each,
                  ),
                );
              }}
            />
          </li>
        ))}
      </ol>
      <PathPicker
        label={role === 'measure' ? 'Add a measure choice' : 'Add a dimension choice'}
        empty=""
        searchLabel="Search fields"
        listLabel="Fields"
        noMatch={(typed) => `No field matches “${typed}”.`}
        groups={groups}
        value=""
        valueTitle={undefined}
        onChoose={(member) => {
          if (member === '' || full) return;
          const found = members.get(member);
          setChoices([...choices, { member, label: found?.shortTitle ?? member }]);
        }}
        trigger={{
          text: role === 'measure' ? '+ measure' : '+ dimension',
          label: role === 'measure' ? 'Add a measure choice' : 'Add a dimension choice',
          className: 'btn-sm parameter-form__add',
          disabled: full,
          describedBy: full ? `${id}-full` : undefined,
        }}
      />
      {full ? (
        <p id={`${id}-full`} className="parameter-form__hint">
          {`A parameter holds at most ${PARAMETER_CHOICE_LIMIT.toLocaleString('en-GB')} choices.`}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor={`${id}-default`}>Default</label>
        <select
          id={`${id}-default`}
          value={parameter.default}
          disabled={choices.length === 0}
          onChange={(event) => {
            onChange({ ...parameter, default: event.target.value });
          }}
        >
          {choices.map((choice) => (
            <option key={choice.member} value={choice.member}>
              {choice.label === '' ? titleOf(choice.member) : choice.label}
            </option>
          ))}
        </select>
        <p className="parameter-form__hint">
          What every reader starts with, and what Reset filters doesn’t change.
        </p>
      </div>
      {problems.length === 0 ? null : (
        <ul className="parameter-form__problems" aria-label="To fix">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A new parameter: a Measure field switch with no name or choices yet. */
export function newParameter(existing: readonly DashboardParameter[]): DashboardParameter {
  let at = existing.length + 1;
  const taken = new Set(existing.map((each) => each.id));
  while (taken.has(`p${String(at)}`)) at += 1;
  return {
    id: `p${String(at)}`,
    name: '',
    kind: 'fieldSwitch',
    role: 'measure',
    choices: [],
    default: '',
  };
}

/**
 * New parameter, opened from where a parameter is needed — the insert menu's
 * Parameter control, a chart well's picker (AC-531; design 21 S3 pin 2) — as
 * a 520 px dialog over it, focus held inside, and back where it came from
 * when it closes, whichever way.
 */
export function ParameterDialog({
  existing,
  role,
  onCreate,
  onCancel,
}: {
  existing: readonly DashboardParameter[];
  /** What it switches, where the opener already knows: a Metrics well's a measure. */
  role?: ParameterRole | undefined;
  onCreate: (parameter: DashboardParameter) => void;
  onCancel: () => void;
}) {
  const [parameter, setParameter] = useState<DashboardParameter>(() => ({
    ...newParameter(existing),
    ...(role === undefined ? {} : { role }),
  }));
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  useFocusTrap(box);
  useEffect(() => {
    opener.current = window.document.activeElement;
    box.current?.querySelector<HTMLElement>('input')?.focus();
    return () => {
      // Back where it came from, as it closes.
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, []);
  // Escape cancels, unless something inside it (a menu, the picker) took it first.
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!(box.current?.contains(window.document.activeElement) ?? false)) return;
      event.preventDefault();
      cancel.current();
    };
    window.document.addEventListener('keydown', onKey);
    return () => {
      window.document.removeEventListener('keydown', onKey);
    };
  }, []);
  const problems = dashboardParameterProblems(parameter);
  const named = existing.some(
    (each) => each.name.trim().toLowerCase() === parameter.name.trim().toLowerCase(),
  );
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="New parameter"
        className="dialog parameter-dialog"
        style={{ width: '520px' }}
      >
        <h2>New parameter</h2>
        <ParameterForm parameter={parameter} onChange={setParameter} />
        {named ? <p className="parameter-form__hint">Another parameter has this name.</p> : null}
        <div className="dialog__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={problems.length > 0 || named}
            onClick={() => {
              onCreate(parameter);
            }}
          >
            Create parameter
          </button>
        </div>
      </div>
    </div>
  );
}
