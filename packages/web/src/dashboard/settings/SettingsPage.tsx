import { useCallback, useEffect, useRef, useState } from 'react';

import type { DashboardDocument } from '../model/document';
import { isDirty } from './dirtyGuard';
import { StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { interactionsOf, labelOf, setMode, type InteractionMode } from './interactionMode';

/**
 * The dashboard settings page (AC-069, direction.md "Dashboard settings
 * page").
 *
 * Full-viewport like the chart editor, reached from the gear in the dashboard
 * header in both view and edit mode, with a left nav of five sections.
 *
 * **It is rendered in place rather than routed to**, which is where it differs
 * from the chart editor it is modelled on. AC-074 says a settings save made
 * while editing is *one undoable change* that Discard reverts — and the edit
 * session lives in this component tree. Navigating away would end the session
 * and take the undo history with it, so the page has to open over the
 * dashboard rather than instead of it.
 *
 * This task builds the page, its sections and the two ways back out. What each
 * section contains is its own criterion, and each has a named owner:
 * Interactions is AC-070 to AC-072, Markings is F10 (AC-084 onwards),
 * Cross-filtering is F12 (AC-117's matrix and AC-118's default), Layout is
 * AC-075. Until those land the four say so rather than pretending.
 *
 * General is here for a different reason: AC-069's "leaving applies nothing"
 * is not a claim that can fail on a page where nothing can be changed, so the
 * name field is what makes the criterion testable. direction.md puts name,
 * folder and description here; only the name is built.
 */
export const SETTINGS_SECTIONS = [
  'General',
  'Interactions',
  'Markings',
  'Cross-filtering',
  'Layout',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/**
 * Which nav sections belong to which interaction mode, so the nav can label
 * them active or inactive (AC-070, direction.md rule 56). The other three
 * sections belong to no mode and carry no label.
 */
const MODE_OF: Partial<Record<SettingsSection, InteractionMode>> = {
  Markings: 'markings',
  'Cross-filtering': 'crossFilter',
};

interface Card<T> {
  readonly value: T;
  readonly label: string;
}

const MODE_CARDS: readonly Card<InteractionMode>[] = [
  { value: 'markings', label: 'Markings' },
  { value: 'crossFilter', label: 'Cross-filtering and cross-highlighting' },
];

const WIDTH_CARDS: readonly Card<'fixed' | 'full'>[] = [
  { value: 'fixed', label: 'Fixed width, centred at 1,440 px' },
  { value: 'full', label: 'Full width' },
];

/**
 * A choice of one, as direction.md's "radio cards".
 *
 * Radios rather than buttons or a switch because the mutual exclusion is the
 * rule: AC-070's other failing state is "both modes are active at once", and a
 * radio group cannot express that. The control carries the rule so the handler
 * does not have to.
 */
function RadioCards<T extends string>({
  legend,
  group,
  chosen,
  cards,
  onChoose,
  note,
}: {
  readonly legend: string;
  readonly group: string;
  readonly chosen: T;
  readonly cards: readonly Card<T>[];
  readonly onChoose: (value: T) => void;
  readonly note?: string;
}) {
  return (
    <fieldset className="settings-modes">
      <legend>{legend}</legend>
      {cards.map((card) => (
        <label key={card.value} className="settings-modes__card">
          <input
            type="radio"
            name={group}
            value={card.value}
            checked={chosen === card.value}
            onChange={() => {
              onChoose(card.value);
            }}
          />
          <span>{card.label}</span>
        </label>
      ))}
      {note === undefined ? null : <p className="settings-page__later">{note}</p>}
    </fieldset>
  );
}

export interface SettingsPageProps {
  readonly document: DashboardDocument;
  /** Leave without applying anything. */
  readonly onCancel: () => void;
  /** Leave, applying the edited document. */
  readonly onSave: (next: DashboardDocument) => void;
}

export function SettingsPage({ document, onCancel, onSave }: SettingsPageProps) {
  const [open, setOpen] = useState<SettingsSection>('General');

  /**
   * The edits live here and nowhere else until Save. That is the whole of
   * AC-069's second half: a page that edited the dashboard as the user typed
   * would apply changes that were never saved, and Cancel would have nothing
   * to undo.
   */
  const [draft, setDraft] = useState<DashboardDocument>(document);

  /** Both configurations and which is active, defaulted for older dashboards. */
  const interactions = interactionsOf(draft.settings);

  /**
   * Whether the question has been asked and is waiting for an answer
   * (AC-073). The page stays open behind it: the point of asking is that the
   * answer can be no, and a page that had already closed would have lost the
   * work whatever the answer was.
   */
  const [asking, setAsking] = useState(false);
  /** The control that asked, for focus to go back to when the answer is to stay (T182). */
  const asker = useRef<HTMLElement | null>(null);

  /**
   * Stable, because the dialog focuses its safe answer in an effect keyed on
   * this. A fresh arrow each render re-ran that effect on every keystroke —
   * see the note there.
   */
  const keepEditing = useCallback(() => {
    setAsking(false);
    asker.current?.focus();
  }, []);

  /** Leave, but not silently if there is something to lose. */
  const leave = () => {
    if (isDirty(document, draft)) {
      asker.current =
        window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
      setAsking(true);
    } else onCancel();
  };

  /**
   * Focus onto the page as it opens (T182, AC-176): the gear it opened from is
   * gone while it is open. The section's heading, so what is read first is
   * where the page has opened.
   */
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const chooseMode = (mode: InteractionMode) => {
    setDraft({
      ...draft,
      settings: { ...draft.settings, interactions: setMode(interactions, mode) },
    });
  };

  return (
    <div className="settings-page" data-testid="dashboard-settings">
      <header className="settings-page__bar">
        {/* Both ways out go through the guard, not just the one called
            Cancel: "← Back to …" is the one someone reaches for without
            thinking of it as cancelling, which makes it the more likely way
            to lose work (AC-073). */}
        <button type="button" data-testid="settings-back" onClick={leave}>
          ← Back to {document.title}
        </button>
        <div className="settings-page__actions">
          <button type="button" onClick={leave}>
            Cancel
          </button>
          <button
            type="button"
            className="settings-page__save"
            onClick={() => {
              /**
               * Saving a page nobody altered is leaving it, not a change to
               * record. Handed to the session regardless, it put "Discard (1
               * change)" on a dashboard that was exactly as it opened — and
               * that count is the only thing telling an editor whether they
               * have unsaved work (AC-074).
               */
              if (isDirty(document, draft)) onSave(draft);
              else onCancel();
            }}
          >
            Save settings
          </button>
        </div>
      </header>

      <div className="settings-page__body">
        <nav aria-label="Settings sections" className="settings-page__nav">
          {SETTINGS_SECTIONS.map((section) => {
            const mode = MODE_OF[section];
            return (
              <button
                key={section}
                type="button"
                // The section is named in an attribute as well as in the text,
                // because the text also carries the active/inactive label and
                // a test that matched on it would be asserting both at once.
                data-section={section}
                aria-current={section === open ? 'true' : undefined}
                onClick={() => {
                  setOpen(section);
                }}
              >
                {section}
                {/* Which of the two modes is in effect, read from the draft so
                    it follows the radio immediately rather than after a save
                    (AC-070, direction.md rule 56). */}
                {mode === undefined ? null : (
                  <span className="settings-page__activity">
                    {/* Its icon as well as its word (T183, AC-177). */}
                    <StatusIcon kind={labelOf(interactions, mode) === 'Active' ? 'ok' : 'idle'} />
                    {labelOf(interactions, mode)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <section className="settings-page__panel" aria-label={`${open} settings`}>
          <h2 ref={heading} tabIndex={-1}>
            {open}
          </h2>
          {open === 'General' ? (
            <label className="settings-field">
              Name
              <input
                type="text"
                value={draft.title}
                onChange={(event) => {
                  setDraft({ ...draft, title: event.target.value });
                }}
              />
            </label>
          ) : open === 'Interactions' ? (
            /**
             * direction.md: "Markings or Cross-filtering and cross-highlighting,
             * as radio cards." Radios rather than two buttons or a switch,
             * because AC-070's other failing state is "both modes are active at
             * once" — a radio group cannot express that, so the control itself
             * carries the rule instead of the handler having to.
             */
            <RadioCards
              legend="Interaction mode"
              group="interaction-mode"
              chosen={interactions.mode}
              cards={MODE_CARDS}
              onChoose={chooseMode}
              note="The configuration of the mode you are not using is kept, not cleared."
            />
          ) : open === 'Layout' ? (
            /**
             * direction.md: "The dashboard is fixed-width and centred (max
             * 1,440 px), with a toggle for full width."
             *
             * Applied when the page is saved, not as a live preview. T079
             * recorded why: `isDirty` compares the whole document, which is
             * safe only while the dashboard is unmounted behind this overlay.
             * A preview written through the edit session would move both sides
             * of that comparison together, so `isDirty` would read clean and
             * Cancel would discard the change silently.
             */
            <RadioCards
              legend="Page width"
              group="page-width"
              chosen={draft.settings.width}
              cards={WIDTH_CARDS}
              onChoose={(width) => {
                setDraft({ ...draft, settings: { ...draft.settings, width } });
              }}
            />
          ) : (
            /**
             * Said plainly rather than left blank or filled with invented
             * controls. An empty panel reads as something broken, and a
             * placeholder control that did nothing would be worse than one
             * that is not there.
             */
            <p className="settings-page__later" data-testid={`settings-empty-${open}`}>
              Nothing to set here yet.
            </p>
          )}
        </section>
      </div>

      {asking ? <DiscardSettingsDialog onDiscard={onCancel} onKeep={keepEditing} /> : null}
    </div>
  );
}

/**
 * The question AC-073 asks, when leaving would lose work.
 *
 * An `alertdialog` rather than a `dialog`: it interrupts to prevent a loss
 * rather than to collect something, which is the distinction the role draws.
 * Focus goes to "Keep editing" — the answer that loses nothing — so a stray
 * Enter cannot throw the work away, the same rule `DeleteSectionDialog`
 * follows. Escape means the same as Keep editing: the least destructive
 * reading of "I did not mean that".
 */
function DiscardSettingsDialog({
  onDiscard,
  onKeep,
}: {
  readonly onDiscard: () => void;
  readonly onKeep: () => void;
}) {
  const safe = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);

  /**
   * `onKeep` has to be stable, and the caller makes it so. Given a fresh
   * arrow on every parent render this effect re-ran on every keystroke — and
   * since the dialog does not trap focus, a keyboard user who Tabbed back to
   * the Name field behind it had focus pulled onto "Keep editing" mid-word,
   * where the next Space would activate it.
   */
  useEffect(() => {
    safe.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onKeep();
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => {
      window.document.removeEventListener('keydown', onKeyDown);
    };
  }, [onKeep]);

  return (
    <div className="dialog-backdrop" data-testid="discard-settings-dialog">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="discard-settings-heading"
        className="dialog"
      >
        <h2 id="discard-settings-heading">Discard your changes?</h2>
        <p>These settings have not been saved. Leaving now loses them.</p>
        <div className="dialog__actions">
          <button type="button" ref={safe} onClick={onKeep}>
            Keep editing
          </button>
          <button type="button" className="dialog__destructive" onClick={onDiscard}>
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
