import { useId, useRef, useState } from 'react';

import { MemberList, ObjectForm } from './ObjectForm';
import { SCHEMA, type Field, type SectionId } from './schema';

/**
 * A cube's or a view's form (T138, AC-132): General — every key that is not
 * a list of members — then a tab per list, in direction.md §7b's order.
 */
type Value = Record<string, unknown>;

/** direction.md §7b: the tabs, and what they are called. */
const TABS: Readonly<Record<'cube' | 'view', readonly [key: string, label: string][]>> = {
  cube: [
    ['dimensions', 'Dimensions'],
    ['measures', 'Measures'],
    ['joins', 'Joins'],
    ['segments', 'Segments'],
    ['hierarchies', 'Hierarchies'],
    ['pre_aggregations', 'Pre-aggregations'],
    ['access_policy', 'Access policy'],
  ],
  view: [
    ['cubes', 'Cubes'],
    ['dimensions', 'Dimensions'],
    ['measures', 'Measures'],
    ['folders', 'Folders'],
    ['default_filters', 'Default filters'],
    ['access_policy', 'Access policy'],
  ],
};

export function CubeForm({
  kind,
  value,
  onChange,
}: {
  kind: 'cube' | 'view';
  value: Value;
  onChange: (next: Value) => void;
}) {
  const section: SectionId = kind === 'cube' ? 'Y.3' : 'Y.10';
  const tabs = [['general', 'General'], ...TABS[kind]] as const;
  const listed = new Set(TABS[kind].map(([key]) => key));
  const [open, setOpen] = useState('general');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const name = typeof value['name'] === 'string' ? value['name'] : kind;

  const fieldOf = (key: string): Field | undefined =>
    SCHEMA[section].fields.find((field) => field.key === key);

  return (
    <section className="model-form" aria-label={`${kind === 'cube' ? 'Cube' : 'View'} ${name}`}>
      <div
        role="tablist"
        aria-label={`${name} sections`}
        className="edit-sidebar__tabs model-form__tabs"
      >
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${base}-${key}`}
            ref={(node) => {
              refs.current[index] = node;
            }}
            aria-selected={open === key}
            aria-controls={`${base}-${key}-panel`}
            tabIndex={open === key ? 0 : -1}
            onClick={() => {
              setOpen(key);
            }}
            onKeyDown={(event) => {
              // The APG tabs pattern, as the edit sidebar's.
              const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              const next = (index + step + tabs.length) % tabs.length;
              setOpen(tabs[next]?.[0] ?? 'general');
              refs.current[next]?.focus();
            }}
          >
            {label}
            {key === 'general' ? null : (
              <span className="model-form__count">
                {' '}
                {Array.isArray(value[key]) ? (value[key] as unknown[]).length : 0}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-${open}-panel`}
        aria-labelledby={`${base}-${open}`}
        className="model-form__panel"
      >
        {open === 'general' ? (
          <ObjectForm
            section={section}
            value={value}
            onChange={onChange}
            only={(field) => !listed.has(field.key)}
          />
        ) : (
          <MemberList
            section={fieldOf(open)?.of ?? 'Y.6'}
            items={Array.isArray(value[open]) ? (value[open] as Value[]) : []}
            onChange={(items) => {
              const next = { ...value };
              if (items === undefined || items.length === 0) delete next[open];
              else next[open] = items;
              onChange(next);
            }}
          />
        )}
      </div>
    </section>
  );
}
