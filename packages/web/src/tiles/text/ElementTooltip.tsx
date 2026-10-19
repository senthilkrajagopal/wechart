import { Fragment, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { clockTimeOf } from '../../dashboard/dataAsOf';

/**
 * A value in view mode (T888, AC-524; design 21 screen 2 pins 1 and 2, rule
 * 132): text in its sentence's own type and weight, focusable, which on
 * hover or focus — for every viewer — takes a dotted `text-muted` underline
 * and shows what it is: its kind and measure, what it compares, the filters
 * in effect, the marking it follows and the data's age. The same lines are
 * its accessible description.
 */

/** What a value's tooltip is made from. */
export interface ElementFacts {
  readonly kind: 'value' | 'change' | 'icon';
  /** Its measure, by its title. */
  readonly measure: string;
  /** A Change's period: "month" where it names none (decision T884-1). */
  readonly period?: string | undefined;
  /** The filters in effect, the tile's then its own, each in words: "Country Germany, France". */
  readonly filters: readonly string[];
  /** The marking it follows, by its name, or none. */
  readonly marking?: string | undefined;
  /** When its answer was refreshed, and the pre-aggregation that answered, if one did. */
  readonly data?: { readonly at?: Date | undefined; readonly preAggregation?: string | undefined };
  /** Answered, with nothing for these filters (AC-525). */
  readonly noData?: boolean | undefined;
  readonly now?: Date;
}

const KINDS = { value: 'Value', change: 'Change', icon: 'Icon' } as const;

/** The tooltip's lines, in design 21's order. */
export function describeElement(facts: ElementFacts): string[] {
  const at = facts.data?.at;
  return [
    `${KINDS[facts.kind]} · ${facts.measure}`,
    ...(facts.noData === true ? ['No data for these filters'] : []),
    ...(facts.kind === 'change' ? [`This ${facts.period ?? 'month'} against the previous`] : []),
    `Filters: ${facts.filters.length === 0 ? 'none' : facts.filters.join(' · ')}`,
    `Marking: ${facts.marking ?? 'none'}`,
    at === undefined || Number.isNaN(at.getTime())
      ? 'Data: not yet answered'
      : `Data: as of ${clockTimeOf(at, facts.now)} · ${
          facts.data?.preAggregation === undefined ? 'database' : 'pre-aggregation'
        }`,
  ];
}

/**
 * The value, focusable, with its tooltip: shown while hovered or focused,
 * hidden by Esc (APG tooltip), and always its description.
 */
export function ElementTooltip({
  lines,
  children,
}: {
  readonly lines: readonly string[];
  readonly children: ReactNode;
}) {
  const id = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  /** Where the value is, so its tooltip opens under it. */
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const open = (hovered || focused) && !dismissed;
  const place = (value: HTMLElement) => {
    const box = value.getBoundingClientRect();
    setAt({ left: box.left, top: box.bottom + 4 });
  };
  return (
    // A value is read, not run: focusable so a keyboard reaches its tooltip
    // (design 21, "View mode: a value", Tab).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    <span
      className="text-element-read"
      tabIndex={0}
      aria-describedby={id}
      data-open={open ? 'true' : undefined}
      onMouseEnter={(event) => {
        place(event.currentTarget);
        setHovered(true);
        setDismissed(false);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      onFocus={(event) => {
        place(event.currentTarget);
        setFocused(true);
        setDismissed(false);
      }}
      onBlur={() => {
        setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setDismissed(true);
        }
      }}
    >
      {children}
      {/* Outside the sentence, so its words are never part of the text — copied, or read as it. */}
      {createPortal(
        <span
          role="tooltip"
          id={id}
          className="text-element-tip"
          hidden={!open}
          style={
            at === null ? undefined : { left: `${String(at.left)}px`, top: `${String(at.top)}px` }
          }
        >
          {/* Spaced, so its lines are words apart as a description too. */}
          {lines.map((line, index) => (
            <Fragment key={line}>
              {index === 0 ? null : ' '}
              <span className="text-element-tip__line">{line}</span>
            </Fragment>
          ))}
        </span>,
        document.body,
      )}
    </span>
  );
}
