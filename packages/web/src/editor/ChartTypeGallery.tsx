import type { ChartType } from '@wechart/core';
import {
  canDraw,
  describeMissing,
  missingFor,
  type FieldCounts,
  type WellName,
} from '@wechart/recommender';
import { useEffect, useId, useRef, useState } from 'react';

import { useFocusTrap } from '../shell/useFocusTrap';
import { ChartTypeIcon } from './ChartTypeIcon';
import {
  CARD_NAMES,
  cardChoice,
  needsText,
  TYPE_DESCRIPTIONS,
  TYPE_PURPOSES,
  typesMatching,
  type CardId,
} from './chartTypeCatalog';

/**
 * What else a chosen card asks of the editor (T934): a 100 % card's stacking
 * (AC-584), and for a card these fields can't draw, the well to highlight —
 * the first it lacks (AC-217).
 */
export interface ChoiceExtras {
  readonly stack?: 'percent';
  readonly highlight?: WellName;
}

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
  /** The type a card pins, with what else it asks, where it asks anything. */
  readonly onChoose: (type: ChartType, extras?: ChoiceExtras) => void;
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
  const listed: readonly CardId[] =
    query.trim() !== ''
      ? typesMatching(query)
      : shelf === 'suggested'
        ? suggested
        : shelf === 'all'
          ? typesMatching('')
          : (TYPE_PURPOSES.find((purpose) => purpose.id === shelf)?.cards ?? []);
  const shelves: [Shelf, string][] = [
    // As the prototype names it (editor.js:379; EDI-25).
    ['suggested', `Recommended (${String(suggested.length)})`],
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
            listed.map((card) => {
              const { type, stack } = cardChoice(card);
              const drawable = canDraw(type, counts);
              const ids = { name: `${heading}-${card}`, about: `${heading}-${card}-about` };
              // The first well it lacks, for the editor to highlight (AC-217).
              const highlight = drawable ? undefined : missingFor(type, counts)[0]?.well;
              const extras: ChoiceExtras = {
                ...(stack === undefined ? {} : { stack }),
                ...(highlight === undefined ? {} : { highlight }),
              };
              return (
                <button
                  key={card}
                  type="button"
                  className="type-card"
                  data-testid={`type-card-${card}`}
                  data-type={card}
                  data-drawable={String(drawable)}
                  // A 100 % card is its stacked type, but not the one drawn
                  // now (the stacking is Customize's, AC-584).
                  aria-current={card === current ? 'true' : undefined}
                  aria-labelledby={ids.name}
                  aria-describedby={ids.about}
                  onClick={() =>
                    Object.keys(extras).length === 0 ? onChoose(type) : onChoose(type, extras)
                  }
                >
                  {/* The prototype's card (editor.js:385; T688, EDI-24): the
                      type's icon on the top row with the badge, its name
                      on a line of its own. */}
                  <span className="type-card__top">
                    <ChartTypeIcon type={card} size={28} />
                    {(suggested as readonly CardId[]).includes(card) ? (
                      <span className="type-card__badge">Suggested</span>
                    ) : null}
                  </span>
                  <span id={ids.name} className="type-card__name">
                    {CARD_NAMES[card]}
                  </span>
                  <span id={ids.about} className="type-card__about">
                    <span className="type-card__description">{TYPE_DESCRIPTIONS[card]}</span>
                    <span className="type-card__needs">{needsText(card)}</span>
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
          {/* The prototype's words (editor.js:389; EDI-25). */}
          <p>
            “Suggested” comes from the recommender for your current fields. You can pick any type
            and then add the fields it needs.
          </p>
          <button type="button" className="btn-sm" onClick={onAuto}>
            Use Auto
          </button>
        </div>
      </div>
    </div>
  );
}
