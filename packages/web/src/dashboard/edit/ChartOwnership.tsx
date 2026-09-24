import type { ChartDocument } from '@wechart/core';
import { useEffect, useId, useRef, useState } from 'react';

import { loadChart } from '../../editor/openChart';
import { StateLine } from '../../shell/StatusIcon';
import { ROOT_FOLDERS, SHARED_ROOT, rootTitleOf } from '../../workspaces/explore/roots';
import type { ChartDraft, DashboardDocument } from '../model/document';
import { withDraft } from './chartDrafts';

interface Folder {
  readonly id: string;
  readonly title: string;
}

/**
 * The shared root, and My workspace beside it (AC-194): no folder documents of
 * their own, so `/api/folders` does not list them — offered first, by name, so
 * a dashboard at the top shows and saves what it says (T133's review).
 */
const TOP_LEVEL: Folder = SHARED_ROOT;

/** The folders a chart can be saved to, read once the panel shows; `'failed'` if they cannot be. */
function useFolders(): readonly Folder[] | undefined | 'failed' {
  const [folders, setFolders] = useState<readonly Folder[] | undefined | 'failed'>(undefined);
  useEffect(() => {
    const asked = new AbortController();
    void fetch('/api/folders', { signal: asked.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        setFolders((await response.json()) as Folder[]);
      })
      .catch(() => {
        if (!asked.signal.aborted) setFolders('failed');
      });
    return () => {
      asked.abort();
    };
  }, []);
  return folders;
}

/**
 * The chart as a library chart's, in the folder: every field it has but the
 * one that made it local — a field this build does not model is kept, as the
 * chart editor keeps it (T192, `keepingUnknownFields`).
 */
function inFolder(chart: ChartDocument, folderId: string): ChartDocument {
  const copy: { -readonly [Key in keyof ChartDocument]: ChartDocument[Key] } = { ...chart };
  delete copy.localToDashboardId;
  return { ...copy, folderId };
}

/**
 * A chart tile's Ownership, on the edit session (T133, AC-127): the chart as
 * the session has it, and "Save to folders…" held as a draft of it — a library
 * chart's document, marked as this dashboard's own (`wasLocalTo`), written by
 * the dashboard's Save.
 *
 * A chart with no draft yet is read as stored (`loadChart`), in one read: its
 * whole document and the version the save checks, so neither a field nor
 * someone else's change meanwhile is lost (T133's review).
 */
export function TileChartOwnership({
  dashboardId,
  dashboard,
  chartId,
  stored,
  drawn,
  onChange,
  choose = 0,
}: {
  dashboardId: string;
  /** The dashboard as the session has it. */
  dashboard: DashboardDocument;
  chartId: string;
  /** The chart as the dashboard loaded it, to show until it is read. */
  stored: ChartDocument | undefined;
  /** What the tile draws now, carried by the draft. */
  drawn: ChartDraft['drawn'];
  onChange: (apply: (current: DashboardDocument) => DashboardDocument) => void;
  /** Each time it rises, "Save to folders…" is opened on its folder (AC-205). */
  choose?: number;
}) {
  const folders = useFolders();
  const [problem, setProblem] = useState('');
  const [reading, setReading] = useState(false);
  const draft = dashboard.chartDrafts?.[chartId];

  const saveTo = async (folderId: string) => {
    setProblem('');
    let from: { document: ChartDocument; version: number | undefined } | undefined = draft;
    if (from === undefined) {
      setReading(true);
      try {
        from = await loadChart(chartId);
      } catch {
        setProblem('The chart could not be read, so it was not saved to a folder. Try again.');
        return;
      } finally {
        setReading(false);
      }
    }
    const read = from;
    onChange((current) => {
      // A draft made meanwhile is the chart as it now is.
      const now = current.chartDrafts?.[chartId];
      return withDraft(current, chartId, {
        document: inFolder(now?.document ?? read.document, folderId),
        drawn: now?.drawn ?? drawn,
        version: now === undefined ? read.version : now.version,
        wasLocalTo: dashboardId,
      });
    });
  };

  return (
    <>
      <ChartOwnership
        dashboardId={dashboardId}
        chart={draft?.document ?? stored}
        savingToFolder={draft?.wasLocalTo === dashboardId}
        folders={folders}
        defaultFolderId={dashboard.folderId ?? TOP_LEVEL.id}
        onSaveToFolder={(folderId) => {
          void saveTo(folderId);
        }}
        choose={choose}
      />
      {reading ? <StateLine kind="run">Reading the chart…</StateLine> : null}
      {problem === '' ? null : <StateLine kind="err">{problem}</StateLine>}
    </>
  );
}

/**
 * Whose a chart tile's chart is (T133, AC-127): the prototype's Ownership in
 * a chart tile's Properties (`prototype/dashboard.js`).
 *
 * - **Local to this dashboard**, it offers "Save to folders…": a folder, the
 *   dashboard's own first, and what that will mean. Chosen, the chart becomes
 *   a library chart with the dashboard's Save, as every edit in the session
 *   does (the user's decision, 2026-09-22).
 * - **Being saved to a folder**, it says which, and when.
 * - **A library chart**, it names its folder.
 * - **Local to another dashboard**, it is that dashboard's to save.
 */
export function ChartOwnership({
  dashboardId,
  chart,
  savingToFolder,
  folders,
  defaultFolderId,
  onSaveToFolder,
  choose = 0,
}: {
  dashboardId: string;
  chart: ChartDocument | undefined;
  /** Saved to a folder in this session: goes there with the dashboard's Save. */
  savingToFolder: boolean;
  /** The folders, not yet read, or `'failed'`. */
  folders: readonly Folder[] | undefined | 'failed';
  /** The dashboard's own folder, offered first. */
  defaultFolderId: string;
  onSaveToFolder: (folderId: string) => void;
  /** Each time it rises, the folder chooser opens (AC-205's ⋯ "Save to folders…"). */
  choose?: number;
}) {
  const [choosing, setChoosing] = useState(false);
  const [folder, setFolder] = useState(defaultFolderId);
  /** The last ask followed: each new one opens the chooser, once. */
  const [followed, setFollowed] = useState(0);
  if (choose !== followed) {
    setFollowed(choose);
    if (choose > 0) {
      setChoosing(true);
      // From the dashboard's own folder, as the button starts it.
      setFolder(defaultFolderId);
    }
  }
  const selectId = useId();
  /** Where focus goes once the panel has changed under it: never left on a control that went. */
  const focusNext = useRef<'select' | 'offer' | 'head' | null>(null);
  const setFocusNext = (to: 'select' | 'offer' | 'head') => {
    focusNext.current = to;
  };
  const select = useRef<HTMLSelectElement>(null);
  const offer = useRef<HTMLButtonElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  // After the render the change of mode brings: once.
  useEffect(() => {
    const next = focusNext.current;
    if (next === null) return;
    focusNext.current = null;
    ({ select, offer, head })[next].current?.focus();
  });

  if (chart === undefined) return null;
  const listed = folders === undefined || folders === 'failed' ? [] : folders;
  const choices = [...ROOT_FOLDERS, ...listed.filter((each) => rootTitleOf(each.id) === undefined)];
  const nameOf = (id: string | undefined) =>
    choices.find((each) => each.id === id)?.title ?? id ?? 'a folder';

  return (
    <section className="panel-section chart-ownership" aria-labelledby={`${selectId}-head`}>
      <h3 id={`${selectId}-head`} ref={head} tabIndex={-1}>
        Ownership
      </h3>
      {savingToFolder ? (
        <StateLine kind="idle">
          Goes to {nameOf(chart.folderId)} when the dashboard is saved: it becomes a shared chart
          other dashboards can reuse.
        </StateLine>
      ) : chart.localToDashboardId === undefined ? (
        <p className="panel-section__note">
          <span aria-hidden="true">⛓</span> Shared · in {nameOf(chart.folderId)}. Other dashboards
          can reuse it.
        </p>
      ) : chart.localToDashboardId !== dashboardId ? (
        <p className="panel-section__note">
          Local to another dashboard, and saved only with that one.
        </p>
      ) : (
        <>
          <p className="panel-section__note">
            Only on this dashboard. Editing it changes nothing else.
          </p>
          {folders === 'failed' ? (
            <StateLine kind="err">
              The folders could not be read, so the chart cannot be saved to one now.
            </StateLine>
          ) : choosing ? (
            <>
              <div className="field">
                <label htmlFor={selectId}>Folder</label>
                <select
                  id={selectId}
                  ref={select}
                  value={folder}
                  onChange={(event) => {
                    setFolder(event.target.value);
                  }}
                >
                  {choices.map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="chart-ownership__actions">
                <button
                  type="button"
                  className="btn-sm btn-primary"
                  onClick={() => {
                    setChoosing(false);
                    setFocusNext('head');
                    onSaveToFolder(folder);
                  }}
                >
                  Save to this folder
                </button>
                <button
                  type="button"
                  className="btn-sm"
                  onClick={() => {
                    setChoosing(false);
                    setFocusNext('offer');
                  }}
                >
                  Cancel
                </button>
              </div>
              <p className="panel-section__note">
                It becomes a shared chart: other dashboards can reuse it, and later edits change it
                everywhere it is used.
              </p>
            </>
          ) : (
            <button
              type="button"
              className="btn-sm"
              ref={offer}
              disabled={folders === undefined}
              onClick={() => {
                setFolder(defaultFolderId);
                setChoosing(true);
                setFocusNext('select');
              }}
            >
              Save to folders…
            </button>
          )}
        </>
      )}
    </section>
  );
}
