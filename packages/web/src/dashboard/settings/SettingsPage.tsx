import { markingsFrom } from '@wechart/core';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import type { DashboardDocument } from '../model/document';
import { CrossFilterMatrix } from './CrossFilterMatrix';
import { MarkingsSettings } from './MarkingsSettings';
import { chartTileMarkings, markingNameProblem } from './markingsDraft';
import { changedSentence, changesOf } from './dirtyGuard';
import { ModePicture } from './ModePicture';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { ROOT_FOLDERS, rootTitleOf } from '../../workspaces/explore/roots';
import {
  DEFAULT_INTERACTIONS,
  interactionsOf,
  labelOf,
  setMode,
  type CrossFilterConfig,
  type InteractionMode,
} from './interactionMode';

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
  /** What choosing it does, under its name (the prototype's radio card, F27). */
  readonly description?: string;
  /** A picture of what it does (design 05 pin 4). */
  readonly picture?: ReactNode;
  /** How readers use it, each a keycap and its word (design 05 pin 5). */
  readonly gestures?: readonly (readonly [key: string, word: string])[];
  /**
   * What it is set up with, and the way to its section (design 05 pin 6):
   * outside the card's label, so its link chooses no mode.
   */
  readonly foot?: ReactNode;
}

/**
 * Design 05's two mode cards, in its words (pins 3–6; T685). Cross-filtering
 * draws no "Ctrl/⌘ adds": a tile holds one selection, so the keycap would
 * promise what doesn't happen (accepted-differences.md).
 */
const MODE_CARDS: readonly Card<InteractionMode>[] = [
  {
    value: 'markings',
    label: 'Markings',
    description:
      'Readers mark items in a named, coloured marking. Every tile that uses the marking highlights them, on every page tab, and details tiles can show only what is marked.',
    picture: <ModePicture mode="markings" />,
    gestures: [
      ['Click', 'marks'],
      ['Ctrl/⌘', 'toggles'],
      ['Drag', 'rectangle'],
      ['Alt+drag', 'lasso'],
      ['Esc', 'unmarks'],
    ],
  },
  {
    value: 'crossFilter',
    label: 'Cross-filtering and cross-highlighting',
    description:
      'Clicking a mark filters or highlights the other tiles on the same tab, set for each pair of tiles. The selection shows as a chip readers can clear.',
    picture: <ModePicture mode="crossFilter" />,
    gestures: [
      ['Click', 'filters'],
      ['Esc', 'clears'],
    ],
  },
];

/** "1 marking", "2 tiles": a count and its noun (T685). */
const counted = (count: number, noun: string) =>
  `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;

/** A pair action as the Cross-filtering section names it. */
const ACTION_LABEL = { filter: 'Filter', highlight: 'Highlight', none: 'None' } as const;

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
  legendHidden = false,
}: {
  readonly legend: string;
  readonly group: string;
  readonly chosen: T;
  readonly cards: readonly Card<T>[];
  readonly onChoose: (value: T) => void;
  readonly note?: string;
  /** The legend for the ear alone, where the section's heading already says it (T685). */
  readonly legendHidden?: boolean;
}) {
  const ids = useId();
  return (
    <fieldset className="settings-modes">
      <legend className={legendHidden ? 'visually-hidden' : undefined}>{legend}</legend>
      <div className="settings-modes__cards">
        {cards.map((card) => (
          // Design 05's radio card (T685; the prototype's .radio-card, T249,
          // F27): its name, what it does, a picture and the gestures, then
          // its foot. The radio is named by the name alone and described by
          // what it does, so it is still "Markings".
          <div key={card.value} className="settings-modes__card">
            <label className="settings-modes__choice">
              <span className="settings-modes__top">
                <input
                  type="radio"
                  name={group}
                  value={card.value}
                  checked={chosen === card.value}
                  aria-labelledby={`${ids}-${card.value}`}
                  aria-describedby={
                    card.description === undefined ? undefined : `${ids}-${card.value}-about`
                  }
                  onChange={() => {
                    onChoose(card.value);
                  }}
                />
                <span className="settings-modes__text">
                  <span id={`${ids}-${card.value}`} className="settings-modes__name">
                    {card.label}
                  </span>
                  {card.description === undefined ? null : (
                    <span id={`${ids}-${card.value}-about`} className="settings-modes__about">
                      {card.description}
                    </span>
                  )}
                </span>
              </span>
              {card.picture === undefined ? null : (
                <span className="settings-modes__illus">{card.picture}</span>
              )}
              {card.gestures === undefined ? null : (
                <span className="settings-modes__gestures">
                  {card.gestures.map(([key, word]) => (
                    <span key={key}>
                      <kbd>{key}</kbd> {word}
                    </span>
                  ))}
                </span>
              )}
            </label>
            {card.foot === undefined ? null : (
              <div className="settings-modes__foot">{card.foot}</div>
            )}
          </div>
        ))}
      </div>
      {note === undefined ? null : <p className="settings-page__note">{note}</p>}
    </fieldset>
  );
}

/**
 * A section whose mode the dashboard is not using, said in the prototype's
 * banner with its icon (T249, F28; rule 3): its settings are kept for when
 * the mode is switched to.
 */
function InactiveBanner({ children }: { readonly children: string }) {
  return (
    <p className="settings-page__inactive" role="note">
      <StatusIcon kind="warn" />
      <span>{children}</span>
    </p>
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
  const formId = useId();

  /**
   * The edits live here and nowhere else until Save. That is the whole of
   * AC-069's second half: a page that edited the dashboard as the user typed
   * would apply changes that were never saved, and Cancel would have nothing
   * to undo.
   */
  const [draft, setDraft] = useState<DashboardDocument>(document);
  /**
   * What the draft has changed, one per setting (T685; the coordinator's
   * call): counted in the bar, named in the discard question, and what the
   * guard asks about.
   */
  const changes = changesOf(document, draft);

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
    if (changes.length > 0) {
      asker.current =
        window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
      setAsking(true);
    } else onCancel();
  };

  /**
   * Escape leaves as Cancel does, asking first when there is something to
   * lose (T249, F29; the prototype's onKey). While the question is open its
   * own Escape — "Keep editing" — is the one that counts.
   *
   * Only when focus is on the page, or nowhere, as the chart editor over a
   * dashboard does (T249's review): the search palette opens over this page
   * from the app bar, and its Escape is its own. And not when Escape ends an
   * IME composition in a field here.
   */
  const page = useRef<HTMLDivElement>(null);
  const leaveNow = useRef(leave);
  useEffect(() => {
    leaveNow.current = leave;
  });
  useEffect(() => {
    if (asking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      const focused = window.document.activeElement;
      if (focused !== null && focused !== window.document.body && !page.current?.contains(focused))
        return;
      event.preventDefault();
      leaveNow.current();
    };
    window.document.addEventListener('keydown', onKeyDown);
    return () => {
      window.document.removeEventListener('keydown', onKeyDown);
    };
  }, [asking]);

  /**
   * Focus onto the page as it opens (T182, AC-176): the gear it opened from is
   * gone while it is open. The section's heading, so what is read first is
   * where the page has opened.
   */
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  /**
   * A mode card's foot (design 05 pin 6; T685): what the mode is set up
   * with, read from the draft, and the way to its own section, which chooses
   * no mode. The inactive mode's is shown too: its settings are kept.
   */
  const markingsFoot = () => {
    const markings = markingsFrom(draft.markings);
    const tiles = chartTileMarkings(draft);
    return (
      <>
        <span className="settings-modes__swatches" aria-hidden="true">
          {markings.map((marking) => (
            <span
              key={marking.id}
              className="settings-modes__swatch"
              style={{ background: `var(--wc-${marking.slot})` }}
            />
          ))}
        </span>
        <span>
          {`${counted(markings.length, 'marking')} · used by ${counted(
            tiles.filter((tile) => tile.marksWith !== '').length,
            'tile',
          )} · limits ${String(tiles.filter((tile) => tile.limitedBy.length > 0).length)}`}
        </span>
        <button
          type="button"
          className="settings-modes__link"
          onClick={() => {
            setOpen('Markings');
          }}
        >
          Manage markings ›
        </button>
      </>
    );
  };
  const crossFilterFoot = () => {
    // A dashboard may have stored its mode alone, as older ones did: the
    // default then, as cross-filtering would act on it.
    const { defaultAction, pairs } =
      (interactions.crossFilter as CrossFilterConfig | undefined) ??
      DEFAULT_INTERACTIONS.crossFilter;
    return (
      <>
        <span>
          Default for tile pairs: <b>{ACTION_LABEL[defaultAction]}</b>
          {/* Only those set apart from the default (T685's review): one
              kept at what the default now is has not changed. */}
          {` · ${counted(
            Object.values(pairs ?? {}).filter((action) => action !== defaultAction).length,
            'pair',
          )} changed`}
        </span>
        <button
          type="button"
          className="settings-modes__link"
          onClick={() => {
            setOpen('Cross-filtering');
          }}
        >
          Set tile pairs ›
        </button>
      </>
    );
  };

  const chooseMode = (mode: InteractionMode) => {
    setDraft({
      ...draft,
      settings: { ...draft.settings, interactions: setMode(interactions, mode) },
    });
  };

  return (
    <div ref={page} className="settings-page" data-testid="dashboard-settings">
      <header className="settings-page__bar">
        {/* Both ways out go through the guard, not just the one called
            Cancel: "← Back to …" is the one someone reaches for without
            thinking of it as cancelling, which makes it the more likely way
            to lose work (AC-073). */}
        <button type="button" className="btn-sm" data-testid="settings-back" onClick={leave}>
          ← Back to {document.title}
        </button>
        {/* The prototype's settings head: Back, the page's title, then
            Cancel and the primary Save at the far end (T249, F26). */}
        <h1 className="settings-page__title">Dashboard settings</h1>
        {/* Beside the title, how many (design 05 pin 1; T685): a state, with
            its icon as well as its words (AC-177). */}
        {changes.length > 0 ? (
          <span className="settings-page__unsaved">
            {'· '}
            <StatusIcon kind="idle" />
            {counted(changes.length, 'unsaved change')}
          </span>
        ) : null}
        <span className="settings-page__spacer" />
        {/* What Escape already does, said (design 05 pin 1). */}
        <span className="settings-page__hint">Esc cancels</span>
        <div className="settings-page__actions">
          <button type="button" className="btn-sm" onClick={leave}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary btn-sm settings-page__save"
            disabled={saving}
            onClick={() => {
              /**
               * Saving a page nobody altered is leaving it, not a change to
               * record. Handed to the session regardless, it put "Discard (1
               * change)" on a dashboard that was exactly as it opened — and
               * that count is the only thing telling an editor whether they
               * have unsaved work (AC-074).
               */
              if (changes.length === 0) {
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
            // The prototype's .formgrid (T249, mismatch 32): Name and Folder
            // side by side, the description the whole width below them.
            <div className="settings-form">
              <div className="field">
                <label htmlFor={`${formId}-name`}>Name</label>
                <input
                  id={`${formId}-name`}
                  type="text"
                  value={draft.title}
                  onChange={(event) => {
                    setDraft({ ...draft, title: event.target.value });
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor={`${formId}-folder`}>Folder</label>
                <select
                  id={`${formId}-folder`}
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
              </div>
              <div className="field settings-form__wide">
                <label htmlFor={`${formId}-description`}>Description</label>
                <textarea
                  id={`${formId}-description`}
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
              </div>
            </div>
          ) : open === 'Interactions' ? (
            /**
             * direction.md: "Markings or Cross-filtering and cross-highlighting,
             * as radio cards." Radios rather than two buttons or a switch,
             * because AC-070's other failing state is "both modes are active at
             * once" — a radio group cannot express that, so the control itself
             * carries the rule instead of the handler having to.
             */
            // Design 05 pins 3–6 (T685): an intro, the two cards with their
            // pictures, gestures and feet, and what switching does.
            <>
              <p className="settings-page__intro settings-page__intro--modes">
                How readers explore this dashboard by clicking its charts. One mode is active at a
                time; the other mode’s settings are kept, not cleared.
              </p>
              <RadioCards
                legend="Interaction mode"
                legendHidden
                group="interaction-mode"
                chosen={interactions.mode}
                cards={MODE_CARDS.map((card) => ({
                  ...card,
                  foot: card.value === 'markings' ? markingsFoot() : crossFilterFoot(),
                }))}
                onChoose={chooseMode}
              />
              <p className="settings-page__info">
                <StatusIcon kind="info" />
                <span>
                  Switching mode clears readers’ current marks and cross-filters. Saving here while
                  the dashboard is in edit mode is one change you can undo, and Discard reverts it.
                </span>
              </p>
            </>
          ) : open === 'Markings' ? (
            /**
             * The markings and the tiles that use them (AC-198), in the draft
             * until Save like everything else here. Said to be inactive, not
             * hidden, while the dashboard cross-filters: the prototype's note.
             */
            <>
              {interactions.mode === 'markings' ? null : (
                <InactiveBanner>
                  Inactive: this dashboard uses cross-filtering. These settings apply if you switch
                  to Markings.
                </InactiveBanner>
              )}
              <MarkingsSettings document={draft} titleOf={titleOf} onChange={setDraft} />
            </>
          ) : open === 'Cross-filtering' ? (
            /**
             * The default action, and the matrix that overrides it per pair
             * (AC-118, direction.md rule 32). Both live in the draft until
             * Save, as every other setting on this page does. Said to be
             * inactive while the dashboard marks, as Markings is (F28).
             */
            <>
              {interactions.mode === 'crossFilter' ? null : (
                <InactiveBanner>
                  Inactive: this dashboard uses Markings. These settings apply if you switch to
                  cross-filtering.
                </InactiveBanner>
              )}
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
            </>
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

      {asking ? (
        <DiscardSettingsDialog changes={changes} onDiscard={onCancel} onKeep={keepEditing} />
      ) : null}
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
  changes,
  onDiscard,
  onKeep,
}: {
  /** What would be lost, named in the question (design 05 state C). */
  readonly changes: readonly string[];
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
        {/* Design 05 state C: the question names what changed (T685). */}
        <h2 id="discard-settings-heading">Discard your changes to settings?</h2>
        <p>{`${changedSentence(changes)} Leaving now keeps the dashboard as it was.`}</p>
        <div className="dialog__actions">
          <button type="button" ref={safe} onClick={onKeep}>
            Keep editing
          </button>
          {/* The question's one primary, destructive, in status-error (T466, UX-106). */}
          <button type="button" className="btn-primary dialog__destructive" onClick={onDiscard}>
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
