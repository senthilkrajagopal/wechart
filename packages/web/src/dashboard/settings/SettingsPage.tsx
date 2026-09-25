import { useCallback, useEffect, useRef, useState } from 'react';

import type { DashboardDocument } from '../model/document';
import { CrossFilterMatrix } from './CrossFilterMatrix';
import { MarkingsSettings } from './MarkingsSettings';
import { markingNameProblem } from './markingsDraft';
import { isDirty } from './dirtyGuard';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { ROOT_FOLDERS, rootTitleOf } from '../../workspaces/explore/roots';
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
  /**
   * Leave, applying the edited document. A promise is a write on its way
   * (AC-185): the page stays open until it answers, and stays open with the
   * reason if it fails. Nothing returned is a change handed to the edit
   * session, which is immediate.
   */
  readonly onSave: (next: DashboardDocument) => void | Promise<unknown>;
  /** A chart's title, which is how the cross-filter matrix names a tile (AC-118). */
  readonly titleOf?: ((chartId: string) => string | undefined) | undefined;
  /** The section it opens on, where a link into it names one; General otherwise. */
  readonly section?: SettingsSection | undefined;
}

/** The document without one optional field — absent, not set to undefined. */
function without(document: DashboardDocument, key: 'folderId' | 'description'): DashboardDocument {
  const copy: Partial<Record<keyof DashboardDocument, unknown>> = { ...document };
  delete copy[key];
  return copy as DashboardDocument;
}

interface FolderChoice {
  readonly id: string;
  /** Its ancestors and its own name, so two folders of one name are told apart. */
  readonly path: string;
}

/**
 * The folders a dashboard can be moved to (AC-197), each by its path. A plain
 * fetch, so the page renders where no query client is provided (its tests);
 * until the list arrives, only the root and the current folder are offered.
 */
function useFolders(): readonly FolderChoice[] {
  const [folders, setFolders] = useState<readonly FolderChoice[]>([]);
  useEffect(() => {
    const asked = new AbortController();
    fetch('/api/folders', { signal: asked.signal })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { id: string; title: string; parentId: string | null }[])
          : [],
      )
      .then((all) => {
        const byId = new Map(all.map((folder) => [folder.id, folder]));
        const pathOf = (id: string): string => {
          const names: string[] = [];
          let at = byId.get(id);
          for (let guard = 0; at !== undefined && guard <= all.length; guard += 1) {
            names.unshift(at.title);
            at = at.parentId === null ? undefined : byId.get(at.parentId);
          }
          return names.join(' / ');
        };
        setFolders(
          all
            .map((folder) => ({ id: folder.id, path: pathOf(folder.id) }))
            .sort((one, other) => one.path.localeCompare(other.path)),
        );
      })
      .catch(() => undefined);
    return () => {
      asked.abort();
    };
  }, []);
  return folders;
}

export function SettingsPage({
  document,
  onCancel,
  onSave,
  titleOf,
  section = 'General',
}: SettingsPageProps) {
  const [open, setOpen] = useState<SettingsSection>(section);
  const folders = useFolders();

  /**
   * The edits live here and nowhere else until Save. That is the whole of
   * AC-069's second half: a page that edited the dashboard as the user typed
   * would apply changes that were never saved, and Cancel would have nothing
   * to undo.
   */
  const [draft, setDraft] = useState<DashboardDocument>(document);

  /**
   * A view-mode save is a write, and the page waits for it (AC-185): open
   * while it is on its way, and open with the reason if it fails.
   */
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  /** Whether this page is still on screen when the save answers. */
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

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
            disabled={saving}
            onClick={() => {
              /**
               * Saving a page nobody altered is leaving it, not a change to
               * record. Handed to the session regardless, it put "Discard (1
               * change)" on a dashboard that was exactly as it opened — and
               * that count is the only thing telling an editor whether they
               * have unsaved work (AC-074).
               */
              if (!isDirty(document, draft)) {
                onCancel();
                return;
              }
              /**
               * Held here until the save answers (AC-185). While editing, the
               * save goes to the session and returns nothing, so the page
               * closes as it always did; in view mode it is a write, and the
               * page stays until that write has gone through.
               */
              // Markings each need a name of their own (the prototype's rule
              // on save): said on the Markings section, and nothing saved.
              const named = markingNameProblem(draft);
              if (named !== undefined) {
                setOpen('Markings');
                setFailed(named);
                return;
              }
              setFailed(undefined);
              const answer = onSave(draft);
              if (answer === undefined) return;
              setSaving(true);
              void Promise.resolve(answer)
                .catch((reason: unknown) => {
                  // Kept open, with the settings as entered: closing would
                  // lose them, which is this criterion's failing state.
                  setFailed(reason instanceof Error ? reason.message : String(reason));
                })
                .finally(() => {
                  if (here.current) setSaving(false);
                });
            }}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
        {saving ? (
          <StateLine kind="run" testId="settings-saving" className="settings-page__state">
            Saving the settings…
          </StateLine>
        ) : null}
        {failed === undefined ? null : (
          <StateLine kind="err" testId="settings-save-failed" className="settings-page__state">
            {failed}
          </StateLine>
        )}
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
            /**
             * direction.md §2: "General: name, folder, description" (AC-197).
             * The folder is the dashboard's `folderId`, the same field a move
             * from Explore writes; Explore lists by it, so saving here moves
             * the dashboard there.
             */
            <>
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
              <label className="settings-field">
                Folder
                <select
                  value={draft.folderId ?? 'root'}
                  onChange={(event) => {
                    const chosen = event.target.value;
                    // The root chosen for a dashboard that never named a
                    // folder is no change — the dirty guard must not ask.
                    setDraft(
                      chosen === 'root' && document.folderId === undefined
                        ? without(draft, 'folderId')
                        : { ...draft, folderId: chosen },
                    );
                  }}
                >
                  {ROOT_FOLDERS.map((root) => (
                    <option key={root.id} value={root.id}>
                      {root.title}
                    </option>
                  ))}
                  {/* The folder it is in, offered before the list arrives —
                      or if it cannot — so the picker never shows the root
                      for a dashboard that lives elsewhere (T215's review). */}
                  {draft.folderId !== undefined &&
                  rootTitleOf(draft.folderId) === undefined &&
                  !folders.some((folder) => folder.id === draft.folderId) ? (
                    <option value={draft.folderId}>Its current folder</option>
                  ) : null}
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.path}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-field">
                Description
                <textarea
                  rows={3}
                  value={draft.description ?? ''}
                  onChange={(event) => {
                    // Emptied is none, not "": typing and clearing is no
                    // change, and an empty string is never stored.
                    setDraft(
                      event.target.value === '' && document.description === undefined
                        ? without(draft, 'description')
                        : { ...draft, description: event.target.value },
                    );
                  }}
                />
              </label>
            </>
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
          ) : open === 'Markings' ? (
            /**
             * The markings and the tiles that use them (AC-198), in the draft
             * until Save like everything else here. Said to be inactive, not
             * hidden, while the dashboard cross-filters: the prototype's note.
             */
            <>
              {interactions.mode === 'markings' ? null : (
                <p className="settings-page__later" role="note">
                  Inactive: this dashboard uses cross-filtering. These settings apply if you switch
                  to Markings.
                </p>
              )}
              <MarkingsSettings document={draft} titleOf={titleOf} onChange={setDraft} />
            </>
          ) : open === 'Cross-filtering' ? (
            /**
             * The default action, and the matrix that overrides it per pair
             * (AC-118, direction.md rule 32). Both live in the draft until
             * Save, as every other setting on this page does.
             */
            <CrossFilterMatrix
              document={draft}
              interactions={interactions}
              titleOf={titleOf}
              onChange={(crossFilter) => {
                setDraft({
                  ...draft,
                  settings: {
                    ...draft.settings,
                    interactions: { ...interactions, crossFilter },
                  },
                });
              }}
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
