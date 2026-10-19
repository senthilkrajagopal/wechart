import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { parameterChoiceOf, type DashboardParameter } from '@wechart/core';

/** Up to this many choices, segments; more, a list (design 21 pin 5; §7h). */
export const SEGMENTS_UP_TO = 5;

export interface ParameterControlProps {
  readonly parameter: DashboardParameter;
  /** The member it stands for now: the reader's choice, or its default. */
  readonly value: string;
  /** A choice made: applied at once, by the dashboard, to all that follow it. */
  readonly onChoose: (member: string) => void;
}

/**
 * A Parameter control in a Text tile (T899, AC-534; design 21 screen 2 pin
 * 5, state F; rule 137): its parameter's choices by label, as a radio group
 * of 32 px segments for up to 5 — one tab stop, the arrows moving and
 * choosing, as the APG radio group does — and a button opening a listbox
 * for more. A choice is applied at once; the dashboard says it once.
 */
export function ParameterControl({ parameter, value, onChoose }: ParameterControlProps) {
  return parameter.choices.length <= SEGMENTS_UP_TO ? (
    <Segments parameter={parameter} value={value} onChoose={onChoose} />
  ) : (
    <ChoiceList parameter={parameter} value={value} onChoose={onChoose} />
  );
}

function Segments({ parameter, value, onChoose }: ParameterControlProps) {
  const box = useRef<HTMLSpanElement>(null);
  const { choices } = parameter;
  const current = Math.max(
    0,
    choices.findIndex((choice) => choice.member === value),
  );
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const by =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (by === 0) return;
    event.preventDefault();
    const next = (at + by + choices.length) % choices.length;
    const choice = choices[next];
    if (choice === undefined) return;
    box.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
    onChoose(choice.member);
  };
  return (
    <span
      ref={box}
      role="radiogroup"
      aria-label={parameter.name}
      className="text-parameter text-parameter--segments"
    >
      {choices.map((choice, at) => {
        const on = at === current;
        return (
          <button
            key={choice.member}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className="text-parameter__segment"
            onClick={() => {
              onChoose(choice.member);
            }}
            onKeyDown={(event) => {
              onKey(event, at);
            }}
          >
            {choice.label}
          </button>
        );
      })}
    </span>
  );
}

function ChoiceList({ parameter, value, onChoose }: ParameterControlProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const now = parameterChoiceOf(parameter, value);
  const [active, setActive] = useState(0);
  // Opened, the list takes focus, its active option the one chosen.
  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (member: string) => {
    onChoose(member);
    close();
  };
  return (
    <span className="text-parameter text-parameter--list">
      <button
        ref={button}
        type="button"
        className="text-parameter__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => {
          if (!open)
            setActive(
              Math.max(
                0,
                parameter.choices.findIndex((choice) => choice.member === value),
              ),
            );
          setOpen(!open);
        }}
      >
        {`${parameter.name}: ${now?.label ?? ''}`}
        <span aria-hidden="true"> ▾</span>
      </button>
      {open ? (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={parameter.name}
          tabIndex={-1}
          className="text-parameter__list"
          aria-activedescendant={`${id}-option-${String(active)}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              close();
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              const by = event.key === 'ArrowDown' ? 1 : -1;
              setActive((was) => Math.min(parameter.choices.length - 1, Math.max(0, was + by)));
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              const choice = parameter.choices[active];
              if (choice !== undefined) choose(choice.member);
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
          }}
        >
          {parameter.choices.map((choice, at) => (
            // Chosen by a press, or by Enter on the active one (the list's keys).
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <li
              key={choice.member}
              id={`${id}-option-${String(at)}`}
              role="option"
              aria-selected={choice.member === now?.member}
              data-active={at === active ? 'true' : undefined}
              className="text-parameter__option"
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                choose(choice.member);
              }}
            >
              {choice.label}
            </li>
          ))}
        </ul>
      ) : null}
    </span>
  );
}
