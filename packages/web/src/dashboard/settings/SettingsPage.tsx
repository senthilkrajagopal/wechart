import { useState } from 'react';

import type { DashboardDocument } from '../model/document';

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
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              aria-current={section === open ? 'true' : undefined}
              onClick={() => {
                setOpen(section);
              }}
            >
              {section}
            </button>
          ))}
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
