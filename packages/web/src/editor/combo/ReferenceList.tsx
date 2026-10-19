import {
  comboReferencesOf,
  withReference,
  withoutReference,
  type ComboReference,
} from '@wechart/core';
import { useState } from 'react';

import { MenuButton } from '../../shell/MenuButton';
import { StatusIcon } from '../../shell/StatusIcon';
import { ReferenceForm, type ReferenceFormProps } from './ReferenceForm';

/**
 * Customize's "Reference lines and bands" (T862; AC-507; design 20 pin 10):
 * a row per reference with its kind's icon, its label, its value and the
 * axis it reads (left, right, or vertical for the category axis), and a ⋯
 * menu of Edit, Duplicate and Delete. Delete shows an Undo toast, whose Undo
 * puts the reference back where it was among those there by then. + Line
 * and + Band open the form under the list, as Edit does; there's no limit on
 * how many (20-Q9 (a)).
 */
export interface ReferenceListProps
  extends Pick<ReferenceFormProps, 'axes' | 'category' | 'newId'> {
  readonly options: Readonly<Record<string, unknown>>;
  /** A change to the options: each key set, or cleared where `undefined`. */
  readonly onOptions: (patch: Readonly<Record<string, unknown>>) => void;
  /** A reference's value as its row writes it, in its axis's format. */
  readonly describe: (reference: ComboReference) => string;
  /** The references the chart as drawn leaves out, by id (T863, AC-508). */
  readonly outside?: readonly string[] | undefined;
}

/** The form open: a new line or band, or the reference being edited. */
type Open =
  | { readonly kind: 'line' | 'band'; readonly editing?: undefined }
  | { readonly kind: 'line' | 'band'; readonly editing: ComboReference };

/** A line's or a band's icon, 16 × 10. */
function KindIcon({ kind }: { readonly kind: 'line' | 'band' }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true" className="combo-reference__icon">
      {kind === 'line' ? (
        <line x1="0" y1="5" x2="16" y2="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 4" />
      ) : (
        <rect x="0" y="1" width="16" height="8" rx="1" fill="currentColor" opacity="0.3" />
      )}
    </svg>
  );
}

export function ReferenceList({
  options,
  onOptions,
  axes,
  category,
  newId,
  describe,
  outside = [],
}: ReferenceListProps) {
  const references = comboReferencesOf(options);
  const [open, setOpen] = useState<Open | undefined>(undefined);
  /** The reference last deleted, and where it was, for Undo. */
  const [deleted, setDeleted] = useState<
    { readonly reference: ComboReference; readonly at: number } | undefined
  >(undefined);
  const write = (next: Record<string, unknown>) => onOptions({ references: next['references'] });

  const remove = (reference: ComboReference) => {
    const at = references.findIndex((one) => one.id === reference.id);
    write(withoutReference(options, reference.id));
    setDeleted({ reference, at });
  };
  const undo = (gone: { readonly reference: ComboReference; readonly at: number }) => {
    const now = comboReferencesOf(options);
    const back = [...now.slice(0, gone.at), gone.reference, ...now.slice(gone.at)];
    onOptions({ references: back });
    setDeleted(undefined);
  };

  return (
    <div className="combo-references">
      <ul className="combo-references__list" aria-label="Reference lines and bands">
        {references.map((reference) => (
          <li
            key={reference.id}
            className="combo-series__row"
            data-testid="reference-row"
            data-kind={reference.kind}
          >
            <KindIcon kind={reference.kind} />
            <span className="combo-series__name" data-part="label">
              {reference.label}
            </span>
            <span className="combo-reference__value" data-part="value">
              {describe(reference)}
            </span>
            <span className="combo-reference__axis" data-part="axis">
              {reference.direction === 'vertical' ? 'vertical' : (reference.axis ?? 'left')}
            </span>
            {/* Not drawn, and why (T863, AC-508). */}
            {outside.includes(reference.id) ? (
              <span className="combo-reference__outside" data-testid="reference-outside">
                <StatusIcon kind="warn" />
                Outside the axis range
              </span>
            ) : null}
            <MenuButton
              label={`More for ${reference.label}`}
              className="btn-icon"
              align="end"
              items={[
                {
                  key: 'edit',
                  label: 'Edit',
                  onSelect: () => setOpen({ kind: reference.kind, editing: reference }),
                },
                {
                  key: 'duplicate',
                  label: 'Duplicate',
                  onSelect: () =>
                    write(
                      withReference(options, {
                        ...reference,
                        id: newId(),
                        label: `${reference.label} (copy)`,
                      }),
                    ),
                },
                { key: 'delete', label: 'Delete', danger: true, onSelect: () => remove(reference) },
              ]}
            >
              ⋯
            </MenuButton>
          </li>
        ))}
      </ul>
      {deleted === undefined ? null : (
        <div role="status" className="combo-toast">
          {deleted.reference.label} deleted ·{' '}
          <button type="button" className="btn-link" onClick={() => undo(deleted)}>
            Undo
          </button>
        </div>
      )}
      {open === undefined ? (
        <div className="combo-references__add">
          <button type="button" className="btn btn-sm" onClick={() => setOpen({ kind: 'line' })}>
            + Line
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setOpen({ kind: 'band' })}>
            + Band
          </button>
        </div>
      ) : (
        <ReferenceForm
          key={open.editing?.id ?? `new-${open.kind}`}
          kind={open.kind}
          initial={open.editing}
          axes={axes}
          category={category}
          newId={newId}
          onCancel={() => setOpen(undefined)}
          onSubmit={(reference) => {
            write(withReference(options, reference));
            setOpen(undefined);
          }}
        />
      )}
    </div>
  );
}
