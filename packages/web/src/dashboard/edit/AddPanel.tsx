import { useState } from 'react';

import { FILTER_WIDGETS, type FilterWidget } from '../../filters/model';
import { PALETTE, type PaletteId } from '../model/insert';
import { SECTION_TEMPLATES, type TemplateId } from './templates';

/**
 * The element palette, in the edit sidebar's Add panel (AC-058).
 *
 * Every entry says what it is and what it does, because the difference
 * between "Chart" and "Chart from folders" is the whole of direction.md's
 * chart-ownership model — one belongs to this dashboard alone, the other
 * stays linked to a shared chart — and a list of bare names would not
 * convey it.
 */
export interface AddPanelProps {
  /** Where the next element will land, in words, so the click is not a guess. */
  readonly destination: string;
  /**
   * Something the last insert did that was not asked for — a tab group
   * wrapped in a section (AC-059). Empty when there is nothing to explain.
   */
  readonly message?: string | undefined;
  readonly onAdd: (id: PaletteId) => void;
  /**
   * Lay out a whole section template (AC-068). Separate from `onAdd` because
   * a template is not an element: it inserts several, and it inserts them as
   * one change.
   */
  readonly onAddTemplate: (id: TemplateId) => void;
  /**
   * Add a filter of this kind to the filter bar (F9, AC-076). When given, the
   * palette's Filter entry offers the four kinds instead of inserting a tile:
   * a filter "adds to the filter bar", as its hint says, not to the grid.
   */
  readonly onAddFilter?: ((widget: FilterWidget) => void) | undefined;
}

export function AddPanel({
  destination,
  message,
  onAdd,
  onAddTemplate,
  onAddFilter,
}: AddPanelProps) {
  const [choosingFilter, setChoosingFilter] = useState(false);

  return (
    <div className="add-panel">
      <p className="add-panel__destination" data-testid="add-destination">
        Adds to {destination}.
      </p>

      {message === undefined || message === '' ? null : (
        // A live region: the section appears without being asked for, and a
        // reader who is not looking at the sidebar would otherwise never know.
        <p className="add-panel__message" role="status" data-testid="add-message">
          {message}
        </p>
      )}

      <ul aria-label="Elements to add">
        {PALETTE.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              data-testid={`add-${entry.id}`}
              {...(entry.id === 'filter' && onAddFilter !== undefined
                ? { 'aria-expanded': choosingFilter }
                : {})}
              onClick={() => {
                if (entry.id === 'filter' && onAddFilter !== undefined) {
                  setChoosingFilter((open) => !open);
                  return;
                }
                onAdd(entry.id);
              }}
            >
              <span className="add-panel__label">{entry.label}</span>
              <span className="add-panel__hint">{entry.hint}</span>
            </button>
            {entry.id === 'filter' && onAddFilter !== undefined && choosingFilter ? (
              <ul aria-label="Filter widgets" className="add-panel__choices">
                {FILTER_WIDGETS.map((kind) => (
                  <li key={kind.widget}>
                    <button
                      type="button"
                      data-testid={`add-filter-${kind.widget}`}
                      onClick={() => {
                        onAddFilter(kind.widget);
                        // Added: the choice is made, so the choices close.
                        setChoosingFilter(false);
                      }}
                    >
                      <span className="add-panel__label">{kind.label}</span>
                      <span className="add-panel__hint">{kind.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {/**
       * Section templates, below the palette and visibly apart from it
       * (direction.md section 2 lists both in the Add panel). They are a
       * different kind of thing: a palette entry inserts one element, a
       * template lays out several at once, and the hint says which several so
       * the click is not a surprise.
       */}
      <h3 className="add-panel__heading">Section templates</h3>
      <ul aria-label="Section templates">
        {SECTION_TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              data-testid={`template-${template.id}`}
              onClick={() => {
                onAddTemplate(template.id);
              }}
            >
              <span className="add-panel__label">{template.label}</span>
              <span className="add-panel__hint">{template.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
