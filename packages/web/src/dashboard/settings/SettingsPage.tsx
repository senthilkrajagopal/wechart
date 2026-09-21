import { useState } from 'react';

import type { DashboardDocument } from '../model/document';
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

const MODE_CARDS: readonly { readonly mode: InteractionMode; readonly label: string }[] = [
  { mode: 'markings', label: 'Markings' },
  { mode: 'crossFilter', label: 'Cross-filtering and cross-highlighting' },
];

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

  const chooseMode = (mode: InteractionMode) => {
    setDraft({
      ...draft,
      settings: { ...draft.settings, interactions: setMode(interactions, mode) },
    });
  };

  return (
    <div className="settings-page" data-testid="dashboard-settings">
      <header className="settings-page__bar">
        <button type="button" data-testid="settings-back" onClick={onCancel}>
          ← Back to {document.title}
        </button>
        <div className="settings-page__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="settings-page__save"
            onClick={() => {
              onSave(draft);
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
                  <span className="settings-page__activity">{labelOf(interactions, mode)}</span>
                )}
              </button>
            );
          })}
        </nav>

        <section className="settings-page__panel" aria-label={`${open} settings`}>
          <h2>{open}</h2>
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
            <fieldset className="settings-modes">
              <legend>Interaction mode</legend>
              {MODE_CARDS.map((card) => (
                <label key={card.mode} className="settings-modes__card">
                  <input
                    type="radio"
                    name="interaction-mode"
                    value={card.mode}
                    checked={interactions.mode === card.mode}
                    onChange={() => {
                      chooseMode(card.mode);
                    }}
                  />
                  <span>{card.label}</span>
                </label>
              ))}
              <p className="settings-page__later">
                The configuration of the mode you are not using is kept, not cleared.
              </p>
            </fieldset>
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
    </div>
  );
}
