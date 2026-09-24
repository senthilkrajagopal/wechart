import { CHART_TYPE_NAMES, type ChartType } from '@wechart/core';
import { canDraw, describeMissing, type FieldCounts } from '@wechart/recommender';
import { useEffect, useId, useRef, useState } from 'react';

import { useFocusTrap } from '../shell/useFocusTrap';
import { needsText, TYPE_DESCRIPTIONS, TYPE_PURPOSES, typesMatching } from './chartTypeCatalog';

/**
 * "Choose chart type" (AC-217), the prototype's gallery: every type, searched
 * by name or purpose, or listed by purpose — the recommender's suggestions
 * first — each by its name with what it is for and what it needs. A type the
 * chart's fields cannot draw is greyed and says what is missing; it can still
 * be chosen, and then names the fields to add (AC-033), as the prototype's
 * gallery says: "You can pick any type and then add the fields it needs."
 *
 * A modal dialog, as the app's others are: Escape or Close puts it away and
 * the caller gives focus back to Change.
 */
export interface ChartTypeGalleryProps {
  /** The type drawn now, marked in the list. */
  readonly current: ChartType | null;
  /** The recommender's pick and runners-up, in its order. */
  readonly suggested: readonly ChartType[];
  /** The chart's fields, which decide what can be drawn. */
  readonly counts: FieldCounts;
  readonly onChoose: (type: ChartType) => void;
  /** Hand the choice back to the recommender. */
  readonly onAuto: () => void;
  readonly onClose: () => void;
}

type Shelf = 'suggested' | 'all' | string;

export function ChartTypeGallery({
  current,
  suggested,
  counts,
  onChoose,
  onAuto,
  onClose,
}: ChartTypeGalleryProps) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useFocusTrap(box);
  const [shelf, setShelf] = useState<Shelf>(suggested.length > 0 ? 'suggested' : 'all');
  const [query, setQuery] = useState('');

  // The latest `onClose`, read by Escape without re-running the effect below.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    search.current?.focus();
    /**
     * Heard first, and only while focus is in the gallery — a palette opened
     * over it takes its own Escape — and marked handled, so the editor overlay
     * it sits in does not go back as well (T230's review).
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!box.current?.contains(document.activeElement)) return;
      event.preventDefault();
      closing.current();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  // A search looks across every type, whichever shelf is open.
  const listed: readonly ChartType[] =
    query.trim() !== ''
      ? typesMatching(query)
      : shelf === 'suggested'
        ? suggested
        : shelf === 'all'
          ? typesMatching('')
          : (TYPE_PURPOSES.find((purpose) => purpose.id === shelf)?.types ?? []);
  const shelves: [Shelf, string][] = [
    ['suggested', `Suggested (${String(suggested.length)})`],
    ['all', 'All charts'],
    ...TYPE_PURPOSES.map((purpose): [Shelf, string] => [purpose.id, purpose.name]),
  ];

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog type-gallery"
      >
        <div className="type-gallery__head">
          <h2 id={heading}>Choose chart type</h2>
          <input
            ref={search}
            type="search"
            aria-label="Search chart types"
            placeholder="Search chart types"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
        <nav className="type-gallery__shelves" aria-label="Chart purposes">
          {shelves.map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-pressed={query.trim() === '' && shelf === id}
              onClick={() => {
                setShelf(id);
                setQuery('');
              }}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="type-gallery__cards">
          {listed.length === 0 ? (
            <p className="type-gallery__none">No chart types match.</p>
          ) : (
            listed.map((type) => {
              const drawable = canDraw(type, counts);
              const ids = { name: `${heading}-${type}`, about: `${heading}-${type}-about` };
              return (
                <button
                  key={type}
                  type="button"
                  className="type-card"
                  data-testid={`type-card-${type}`}
                  data-type={type}
                  data-drawable={String(drawable)}
                  aria-current={type === current ? 'true' : undefined}
                  aria-labelledby={ids.name}
                  aria-describedby={ids.about}
                  onClick={() => onChoose(type)}
                >
                  <span className="type-card__top">
                    <span id={ids.name} className="type-card__name">
                      {CHART_TYPE_NAMES[type]}
                    </span>
                    {suggested.includes(type) ? (
                      <span className="type-card__badge">Suggested</span>
                    ) : null}
                  </span>
                  <span id={ids.about} className="type-card__about">
                    <span className="type-card__description">{TYPE_DESCRIPTIONS[type]}</span>
                    <span className="type-card__needs">{needsText(type)}</span>
                    {/* Greyed, and why: what these fields lack (AC-217). */}
                    {drawable
                      ? null
                      : describeMissing(type, counts).map((sentence) => (
                          <span key={sentence} className="type-card__missing">
                            {sentence}
                          </span>
                        ))}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="type-gallery__foot">
          <p>
            “Suggested” comes from the recommender for these fields. Any type can be chosen, and
            then says which fields it needs.
          </p>
          <button type="button" className="btn-sm" onClick={onAuto}>
            Use Auto
          </button>
        </div>
      </div>
    </div>
  );
}
