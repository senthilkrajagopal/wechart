import { useMutation, useQuery } from '@tanstack/react-query';
import {
  DRIVERS,
  readExportFile,
  type ExportedDataSource,
  type ExportFile,
  type ReadExport,
} from '@wechart/core';
import { useEffect, useId, useRef, useState, type DragEvent } from 'react';

import { StatusIcon } from '../../../shell/StatusIcon';
import { useFocusTrap } from '../../../shell/useFocusTrap';
import { TargetTree } from '../../data-sources/TargetTree';
import type { Seal } from '../../data-sources/connectionTest';
import { ImportSources, type HeldName, type SourceDecision } from './ImportSources';
import type { Target } from '../NewItemDialog';

/**
 * Importing a dashboard (T513; AC-356, AC-357, AC-359; design 13, screen 2
 * and states G–L, R, S, U, V, X): design 01's 480 px pane, docked beside My
 * workspace, in four steps — File · Target · Data sources · Review.
 *
 * - **File:** the file chosen (or dropped), read whole in the browser and
 *   refused there, naming each part and why, before anything is sent. What
 *   it holds is listed; models stay out until the workspace holds them
 *   (T347; state V).
 * - **Target:** design 04's picker of the folders the user may write.
 * - **Data sources:** each mapped or created (T514). Until then passed over.
 * - **Review:** what lands, each item with what it may affect once proposed,
 *   counted and never blocking (AC-357). The primary writes everything at
 *   once.
 *
 * Everything lands in My workspace as new drafts, with sign-in off too
 * (AC-356). Nothing is written until the last step, so leaving, or a
 * refusal, changes nothing.
 */
export interface Imported {
  readonly dashboard: { readonly id: string; readonly title: string };
  readonly created: {
    readonly dashboards: number;
    readonly charts: number;
    readonly models: number;
    readonly dataSources: number;
  };
  readonly target: { readonly id: string; readonly path: readonly string[] };
}

type Warning =
  | { readonly kind: 'in-target'; readonly version: number | null }
  | { readonly kind: 'in-workspace'; readonly targetPath: readonly string[] | null }
  | { readonly kind: 'cube-in-target'; readonly cube: string; readonly file: string }
  /** The data source its name means is off the target's path: this one blocks (T719). */
  | { readonly kind: 'off-path' };

interface Reviewed {
  readonly target: { readonly id: string; readonly path: readonly string[] };
  readonly items: readonly {
    readonly kind: 'dashboard' | 'chart' | 'model' | 'data-source';
    readonly key: string;
    readonly title: string;
    readonly ownCharts?: number;
    readonly driver?: string;
    /** Its folder's path, none for one the user can't see (T719). */
    readonly mappedTo?: { readonly name: string; readonly path: readonly string[] | null };
    /** Mapped because its name is that one's (T719, AC-358). */
    readonly held?: true;
    readonly lands: 'draft' | 'not-imported-yet' | 'not-imported';
    readonly warnings: readonly Warning[];
  }[];
}

interface Chosen {
  readonly name: string;
  readonly size: number;
  readonly read: ReadExport;
  /** Which choice it was: a second file of the same name is another file. */
  readonly pick: number;
}

const STEPS = ['File', 'Target', 'Data sources', 'Review'] as const;
/** The foot's word while nothing Review says blocks (design 13, pin 23). */
const NONE_BLOCKS = `None stops the import`;
/** Where an import is made. */
const IMPORTS = `/api/import`;

const counted = (count: number, one: string, many = `${one}s`) =>
  `${String(count)} ${count === 1 ? one : many}`;
/** "A", "A and B", "A, B and C". */
const listed = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
const pathText = (path: readonly string[]) => (path.length === 0 ? 'Shared' : path.join(' / '));
const driverLabel = (driver: string) =>
  (DRIVERS as Record<string, { label: string } | undefined>)[driver]?.label ?? driver;
const sizeText = (bytes: number) =>
  bytes < 1024 ? `${String(bytes)} B` : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
const CHIP = {
  dashboard: 'ic-dash',
  chart: 'ic-chart',
  model: 'ic-model',
  'data-source': 'ic-source',
} as const;

/** The API's own words, where it gives them. */
async function saidBy(response: Response, fallback: string): Promise<string> {
  const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
  return typeof said === 'string' ? said : fallback;
}

/** A warning in words (design 13, pins 19–21), where the target is `target`. */
export function warningText(
  warning: Warning,
  item: { readonly kind: string; readonly title: string },
  target: string,
  signedIn: boolean,
): string {
  const approved = signedIn ? 'once approved' : 'once you approve it';
  switch (warning.kind) {
    case 'in-target': {
      const what =
        item.kind === 'dashboard'
          ? 'a dashboard by this name'
          : item.kind === 'chart'
            ? 'a library chart by this name'
            : item.title;
      const version = warning.version === null ? '' : `, version ${String(warning.version)}`;
      return `${target} has ${what}${version}. Proposed, this draft replaces it ${approved}.`;
    }
    case 'in-workspace': {
      // Only drafts going to one folder replace each other there (T513's review).
      const same = warning.targetPath !== null && pathText(warning.targetPath) === target;
      const goes =
        warning.targetPath === null
          ? ''
          : same
            ? `, also → ${target}`
            : `, → ${pathText(warning.targetPath)}`;
      return `Your workspace has a draft by this name${goes}. Both are kept${same ? '; the second approved replaces the first' : ''}.`;
    }
    case 'cube-in-target':
      return `Cube ${warning.cube} is already in ${target}, in ${warning.file}. Proposing this draft is refused until one of them is renamed.`;
    case 'off-path':
      return `The data source of this name isn’t in ${target} or a folder above it, so a model there couldn’t use it. Choose a target on its path.`;
  }
}

export function ImportPane({
  signedIn,
  onImported,
  onClose,
  seal,
}: {
  /** With sign-in off, the single user's workspace: said so (state U). */
  readonly signedIn: boolean;
  readonly onImported: (imported: Imported) => void;
  readonly onClose: () => void;
  /** How a typed secret is sealed (T514); to xcube's key unless a test says. */
  readonly seal?: Seal;
}) {
  const ids = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [target, setTarget] = useState('');
  const [asking, setAsking] = useState(false);
  const file: ExportFile | undefined = chosen?.read.ok === true ? chosen.read.file : undefined;
  /** The file's data sources, each mapped or created in the Data sources step (T514). */
  const sources = (file?.items ?? []).filter(
    (item): item is ExportedDataSource => item.kind === 'data-source',
  );
  const [decisions, setDecisions] = useState<Readonly<Record<string, SourceDecision | undefined>>>(
    {},
  );
  const undecided = sources.filter((source) => decisions[source.name] === undefined);
  /**
   * Those made at Import, by the test each was made from — a test is claimed
   * by one create alone — so a second try makes none twice, and a new choice
   * is never given an old one.
   */
  const made = useRef(new Map<string, { id: string; name: string; described: boolean }>());
  /** Their names, which discarding leaves in My workspace (T514's review). */
  const [leftBehind, setLeftBehind] = useState<readonly string[]>([]);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  const targets = useQuery({
    queryKey: ['folder-targets'],
    queryFn: async () => {
      const response = await fetch('/api/folders/targets');
      if (!response.ok) throw new Error(await saidBy(response, 'The folders couldn’t be listed.'));
      return (await response.json()) as Target[];
    },
    enabled: step >= 1,
    staleTime: 0,
  });
  // The only folder there is, chosen for them (T345).
  const only = targets.data?.length === 1 ? targets.data[0]!.id : '';
  const targetId = target === '' ? only : target;

  /**
   * The file's data sources whose names are held (T719, AC-358): Review asked
   * with nothing decided, once the file and the target are known. Each is
   * mapped by the import itself, and the Data sources step asks nothing of it.
   */
  const held = useQuery({
    queryKey: ['import-held', chosen?.pick, targetId],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/import/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file, targetFolderId: targetId }),
        signal,
      });
      if (!response.ok)
        throw new Error(
          await saidBy(response, `It couldn’t be reviewed (${String(response.status)}).`),
        );
      const reviewed = (await response.json()) as Reviewed;
      return Object.fromEntries(
        reviewed.items.flatMap((item): [string, HeldName][] =>
          item.kind === 'data-source' && item.held === true && item.mappedTo !== undefined
            ? [
                [
                  item.key,
                  {
                    name: item.mappedTo.name,
                    path: item.mappedTo.path,
                    onPath: !item.warnings.some((warning) => warning.kind === 'off-path'),
                  },
                ],
              ]
            : [],
        ),
      );
    },
    enabled: step >= 1 && file !== undefined && targetId !== '' && sources.length > 0,
    staleTime: 0,
  });

  const review = useQuery({
    queryKey: ['import-review', chosen?.pick, targetId, JSON.stringify(decisions)],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/import/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          file,
          targetFolderId: targetId,
          ...(sources.length === 0
            ? {}
            : {
                dataSources: sources.flatMap(
                  (source): { name: string; map?: string; create?: string }[] => {
                    const decision = decisions[source.name];
                    // A held one the API maps itself: nothing is sent of it (T719).
                    return decision === undefined || decision.kind === 'held'
                      ? []
                      : decision.kind === 'map'
                        ? [{ name: source.name, map: decision.to.id }]
                        : [{ name: source.name, create: decision.name }];
                  },
                ),
              }),
        }),
        signal,
      });
      if (!response.ok)
        throw new Error(
          await saidBy(response, `It couldn’t be reviewed (${String(response.status)}).`),
        );
      return (await response.json()) as Reviewed;
    },
    enabled: step === 3 && file !== undefined && targetId !== '',
    staleTime: 0,
    gcTime: 0,
  });

  const importing = useMutation({
    mutationFn: async () => {
      /**
       * Each data source to create is made first, in My workspace, going to
       * the target, from the test that passed (AC-358, AC-163): the data
       * sources' own route, so a name the target holds, an untested setting
       * and its record are refused and kept as for any other. Then the rest,
       * each data source given the one chosen for it.
       */
      const to = new Map<string, string>();
      for (const source of sources) {
        const decision = decisions[source.name];
        if (decision === undefined) throw new Error(`Decide ${source.name} first.`);
        // Held, the API maps it: nothing to make or send (T719).
        if (decision.kind === 'held') continue;
        if (decision.kind === 'map') {
          to.set(source.name, decision.to.id);
          continue;
        }
        // Made already by an earlier try, from this very test: that one (T514's review).
        let already = made.current.get(decision.testId);
        if (already === undefined) {
          const created = await fetch('/api/data-sources', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              folderId: 'mine',
              name: decision.name,
              driver: decision.driver,
              authMethod: decision.authMethod,
              fields: decision.fields,
              sealed: decision.sealed,
              targetFolderId: targetId,
              testId: decision.testId,
              ...(decision.trials.length === 0 ? {} : { trials: decision.trials }),
            }),
          });
          if (!created.ok)
            throw new Error(
              `${decision.name} couldn’t be created: ${await saidBy(created, `error ${String(created.status)}`)}`,
            );
          already = {
            id: ((await created.json()) as { id: string }).id,
            name: decision.name,
            described: false,
          };
          made.current.set(decision.testId, already);
          setLeftBehind([...made.current.values()].map((each) => each.name));
        }
        to.set(source.name, already.id);
        // What it is for, as the file has it: no part of the connection, so no test.
        if (!already.described && decision.description !== null && decision.description !== '') {
          const described = await fetch(`/api/data-sources/${encodeURIComponent(already.id)}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ description: decision.description }),
          });
          if (!described.ok)
            throw new Error(
              `${decision.name} was made, but its description couldn’t be saved: ${await saidBy(described, `error ${String(described.status)}`)}`,
            );
        }
        already.described = true;
      }
      const response = await fetch(IMPORTS, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          file,
          targetFolderId: targetId,
          ...(sources.length === 0
            ? {}
            : {
                dataSources: sources.flatMap((source) => {
                  const chosen = to.get(source.name);
                  return chosen === undefined ? [] : [{ name: source.name, to: chosen }];
                }),
              }),
        }),
      });
      if (!response.ok)
        throw new Error(
          await saidBy(response, `It couldn’t be imported (${String(response.status)}).`),
        );
      return (await response.json()) as Imported;
    },
    onSuccess: (imported) => {
      onImported(imported);
    },
  });

  /** Leaving: at once before a file is chosen; asked after (state X, rule 85). */
  const leave = () => {
    if (chosen === null) onClose();
    else setAsking(true);
  };
  const pane = useRef<HTMLElement>(null);
  const onEscape = useRef(leave);
  useEffect(() => {
    onEscape.current = () => {
      if (importing.isPending) return;
      if (asking) setAsking(false);
      else leave();
    };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const at = event.target;
      const ours =
        at === document.body ||
        at === document.documentElement ||
        (at instanceof Node && pane.current?.contains(at) === true);
      if (!ours) return;
      event.preventDefault();
      onEscape.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const refusal = useRef<HTMLDivElement>(null);
  const take = async (picked: File) => {
    const text = await picked.text();
    setChosen((was) => ({
      name: picked.name,
      size: picked.size,
      read: readExportFile(text),
      pick: (was?.pick ?? 0) + 1,
    }));
    setStep(0);
    setTarget('');
  };
  // A refusal takes focus as it arrives (state J, the keyboard table).
  useEffect(() => {
    if (chosen !== null && !chosen.read.ok) refusal.current?.focus();
  }, [chosen]);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (dropped !== undefined) void take(dropped);
  };

  const models = (file?.items ?? []).flatMap((item) => (item.kind === 'model' ? [item.path] : []));
  const board = file?.items.find((item) => item.kind === 'dashboard');
  const warnings = review.data?.items.reduce((sum, item) => sum + item.warnings.length, 0) ?? 0;
  const drafts = review.data?.items.filter((item) => item.lands === 'draft').length ?? 0;
  const targetPath =
    review.data === undefined
      ? pathText(targets.data?.find((each) => each.id === targetId)?.path ?? [])
      : pathText(review.data.target.path);

  /** A step's number to go to: Data sources, with none in the file, is passed over (pin 15). */
  const goTo = (next: number) => {
    setStep(next === 2 && sources.length === 0 ? (step < 2 ? 3 : 1) : next);
  };

  return (
    <aside
      ref={pane}
      role="dialog"
      aria-labelledby={`${ids}-heading`}
      className="source-pane import-pane"
    >
      <header className="source-pane__head">
        <h2 id={`${ids}-heading`} ref={heading} tabIndex={-1}>
          Import a dashboard
        </h2>
        <span className="source-pane__where">
          <span className="source-pane__person" aria-hidden="true" />
          into My workspace
        </span>
        <button
          type="button"
          className="source-pane__close"
          aria-label="Close"
          disabled={importing.isPending}
          onClick={leave}
        >
          ×
        </button>
      </header>

      <nav className="source-pane__rail" aria-label="Import steps">
        <ol aria-label="Steps">
          {STEPS.map((label, at) => (
            <li
              key={label}
              className={at < step ? 'is-done' : at === step ? 'is-current' : undefined}
            >
              {at < step && (at !== 2 || sources.length > 0) ? (
                <button
                  type="button"
                  aria-label={`${label}, done`}
                  disabled={importing.isPending}
                  onClick={() => {
                    setStep(at);
                  }}
                >
                  <span className="source-pane__step" aria-hidden="true">
                    {String(at + 1)}
                  </span>
                  {label}
                </button>
              ) : (
                <span aria-current={at === step ? 'step' : undefined}>
                  <span className="source-pane__step" aria-hidden="true">
                    {String(at + 1)}
                  </span>
                  {label}
                </span>
              )}
            </li>
          ))}
        </ol>
        <p className="source-pane__rail-short">
          <span className="source-pane__step" aria-hidden="true">
            {String(step + 1)}
          </span>
          Step {String(step + 1)} of {String(STEPS.length)} · {STEPS[step]}
        </p>
      </nav>

      {chosen !== null && step > 0 && file !== undefined ? (
        <div className="source-pane__chosen import-pane__file">
          <span className="import-pane__doc" aria-hidden="true" />
          <span className="source-pane__chosen-text">
            <b className="is-code">{chosen.name}</b>
            <span data-testid="import-summary">
              {board?.title ?? ''}
              {step === 3 && review.data !== undefined
                ? ` → ${targetPath} · ${counted(drafts, 'new draft')} · ${counted(warnings, 'warning')}`
                : targetId === ''
                  ? ''
                  : ` → ${targetPath}`}
            </span>
          </span>
        </div>
      ) : null}

      <div className="source-pane__body import-pane__body">
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            event.target.value = '';
            if (picked !== undefined) void take(picked);
          }}
        />
        {step === 0 && chosen === null ? (
          <>
            <div
              className="import-pane__drop"
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={onDrop}
            >
              <UploadIcon />
              <b>Drop an export file here</b>
              <span>or</span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  picker.current?.click();
                }}
              >
                Choose file…
              </button>
              <span className="import-pane__hint">
                A <code>.wechart.json</code> file made by Export, in this wechart or another.
              </span>
            </div>
            <p className="import-pane__info" role="note">
              <StatusIcon kind="info" />
              <span>
                Nothing changes until you choose Import at the end. Every part of the file is
                checked first.
              </span>
            </p>
          </>
        ) : null}

        {step === 0 && chosen !== null ? (
          <>
            <div className="import-pane__chosen" data-testid="import-file">
              <span className="import-pane__doc" aria-hidden="true" />
              <b className="is-code">{chosen.name}</b>
              <span className="import-pane__size">{sizeText(chosen.size)}</span>
              {chosen.read.ok ? (
                <button
                  type="button"
                  className="link-button import-pane__another"
                  onClick={() => {
                    picker.current?.click();
                  }}
                >
                  Choose another
                </button>
              ) : null}
            </div>
            {chosen.read.ok ? (
              <>
                <p className="import-pane__read">
                  <StatusIcon kind="ok" />
                  Read · every part is one this wechart has
                </p>
                <h3 id={`${ids}-holds`} className="connection-form__legend">
                  What it holds
                </h3>
                <ul className="import-pane__holds" aria-labelledby={`${ids}-holds`}>
                  {chosen.read.file.items.flatMap((item) => {
                    if (item.kind === 'chart' && item.dashboardId !== undefined) return [];
                    const [name, what] =
                      item.kind === 'dashboard'
                        ? [
                            item.title,
                            `Dashboard · ${counted(
                              file?.items.filter(
                                (each) => each.kind === 'chart' && each.dashboardId === item.id,
                              ).length ?? 0,
                              'own chart',
                            )}`,
                          ]
                        : item.kind === 'chart'
                          ? [item.title, 'Library chart']
                          : item.kind === 'model'
                            ? [item.path, 'Not imported yet']
                            : [item.name, `${driverLabel(item.driver)} · settings only`];
                    return [
                      <li key={`${item.kind}:${name}`}>
                        <span
                          className={`itemicon ${CHIP[item.kind]}`}
                          data-icon={item.kind}
                          aria-hidden="true"
                        />
                        <span
                          className={
                            item.kind === 'model' || item.kind === 'data-source'
                              ? 'import-pane__name is-code'
                              : 'import-pane__name'
                          }
                        >
                          {name}
                        </span>
                        <span className="import-pane__what">{what}</span>
                      </li>,
                    ];
                  })}
                </ul>
                <p className="import-pane__note">
                  <LockIcon />
                  No secrets: you enter them for any data source you create. No bookmarks.
                </p>
                {models.length === 0 ? null : (
                  <p className="import-pane__info" role="note">
                    <StatusIcon kind="info" />
                    <span>
                      {`This wechart doesn’t take models from a file yet, so ${listed(models)} ${models.length === 1 ? 'stays' : 'stay'} out. The dashboard’s charts will look up their cubes along the target folder’s path, as any workspace item’s do.`}
                    </span>
                  </p>
                )}
              </>
            ) : (
              <div ref={refusal} tabIndex={-1} role="alert" className="import-pane__refused">
                {'unreadable' in chosen.read ? (
                  <>
                    <p className="import-pane__refused-head">
                      <StatusIcon kind="err" />
                      Refused · nothing was imported
                    </p>
                    <div className="import-pane__part">
                      <p>
                        <b className="is-code">{chosen.name}</b> can’t be read as a wechart export.
                      </p>
                      <p>{chosen.read.unreadable}</p>
                    </div>
                    <p className="import-pane__note">
                      Export the dashboard again, or choose another file.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="import-pane__refused-head">
                      <StatusIcon kind="err" />
                      Refused · {counted(chosen.read.parts.length, 'part')} this wechart doesn’t
                      have
                    </p>
                    <p className="import-pane__note">
                      <span className="is-code">{chosen.name}</span> · nothing was imported
                    </p>
                    <ul className="import-pane__parts">
                      {chosen.read.parts.map((part) => (
                        <li key={`${part.part}:${part.why}`} className="import-pane__part">
                          <b>{part.part}</b>
                          <span>{part.why}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </>
        ) : null}

        {step === 1 ? (
          targets.isPending ? (
            <p className="import-pane__note">Listing the folders you may write…</p>
          ) : targets.isError ? (
            <p className="source-pane__alert" role="alert">
              <StatusIcon kind="err" />
              {targets.error.message}
            </p>
          ) : targets.data.length === 0 ? (
            <p className="import-pane__info" role="note">
              <StatusIcon kind="info" />
              <span>
                You have read-write access to no shared folder, so there is nowhere for it to go.
              </span>
            </p>
          ) : (
            <>
              <TargetTree
                targets={targets.data}
                chosen={targetId}
                onChoose={setTarget}
                describedBy={`${ids}-target-note`}
              />
              <p id={`${ids}-target-note`} className="connection-form__note">
                Only folders where you have read-write access.
              </p>
              {targetId === '' ? null : (
                <p className="import-pane__info" role="note">
                  <StatusIcon kind="info" />
                  <span>
                    {`Everything in the file lands in My workspace as new drafts with this target. Nothing in ${targetPath} changes until you propose a draft and the proposal is approved. You may approve your own.`}
                  </span>
                </p>
              )}
            </>
          )
        ) : null}

        {/* What is held couldn't be read: said, not left silent (T719's review). */}
        {step === 2 && held.isError ? (
          <p className="source-pane__alert" role="alert">
            <StatusIcon kind="err" />
            {held.error.message}
          </p>
        ) : null}
        {/* Kept while other steps show, so what was typed and tested stays;
            anew for another file or target, which what may be chosen follows. */}
        {file === undefined || targetId === '' || sources.length === 0 ? null : (
          <div hidden={step !== 2}>
            <ImportSources
              key={`${String(chosen?.pick)}:${targetId}`}
              sources={sources}
              target={{
                id: targetId,
                path: targets.data?.find((each) => each.id === targetId)?.path ?? [],
              }}
              held={held.data ?? {}}
              onDecisions={setDecisions}
              {...(seal === undefined ? {} : { seal })}
            />
          </div>
        )}

        {step === 3 ? (
          review.isPending ? (
            <p className="import-pane__note">Checking what it may affect…</p>
          ) : review.isError ? (
            <p className="source-pane__alert" role="alert">
              <StatusIcon kind="err" />
              {review.error.message}
            </p>
          ) : (
            <>
              <p className="import-pane__info" role="note">
                <StatusIcon kind="info" />
                <span data-testid="import-where">
                  {signedIn
                    ? `Everything lands in My workspace as new drafts, with the target ${targetPath}. Nothing there changes until you propose a draft and it’s approved.`
                    : `Sign-in is off. Everything still lands in My workspace as new drafts, with the target ${targetPath}.`}
                </span>
              </p>
              <div className="import-pane__lands-head">
                <h3 id={`${ids}-lands`} className="connection-form__legend">
                  What lands, and what it may affect
                </h3>
                <span
                  className={warnings === 0 ? 'import-pane__count is-ok' : 'import-pane__count'}
                >
                  <StatusIcon kind={warnings === 0 ? 'ok' : 'warn'} />
                  {warnings === 0 ? 'No warnings' : counted(warnings, 'warning')}
                </span>
              </div>
              <ul className="import-pane__lands" aria-labelledby={`${ids}-lands`}>
                {review.data.items.map((item) => (
                  <li
                    key={`${item.kind}:${item.key}`}
                    data-testid={`lands-${item.kind}-${item.key}`}
                  >
                    <div className="import-pane__land">
                      <span
                        className={`itemicon ${CHIP[item.kind]}`}
                        data-icon={item.kind}
                        aria-hidden="true"
                      />
                      <span className="import-pane__land-text">
                        <b
                          className={
                            item.kind === 'model' || item.kind === 'data-source'
                              ? 'is-code'
                              : undefined
                          }
                        >
                          {item.title}
                        </b>
                        <span>
                          {item.kind === 'dashboard'
                            ? `Dashboard and ${counted(item.ownCharts ?? 0, 'own chart')}`
                            : item.kind === 'chart'
                              ? 'Library chart'
                              : item.kind === 'model'
                                ? 'Model'
                                : item.mappedTo !== undefined
                                  ? `Mapped to ${item.mappedTo.name} in ${item.mappedTo.path === null ? 'a folder you can’t see' : pathText(item.mappedTo.path)}`
                                  : item.lands === 'draft'
                                    ? `Data source, created · test passed ${(() => {
                                        const decision = decisions[item.key];
                                        return decision?.kind === 'create' ? decision.at : '';
                                      })()}`
                                    : `Data source · ${driverLabel(item.driver ?? '')}`}
                        </span>
                      </span>
                      <span className="import-pane__lands-as">
                        {item.lands === 'draft'
                          ? 'New draft'
                          : item.lands === 'not-imported-yet'
                            ? 'Not imported yet'
                            : 'Not imported'}
                      </span>
                    </div>
                    {item.warnings.map((warning) => (
                      <p key={JSON.stringify(warning)} className="import-pane__warning">
                        <StatusIcon kind="warn" />
                        <span>{warningText(warning, item, targetPath, signedIn)}</span>
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}

        {importing.isError ? (
          <p className="source-pane__alert" role="alert">
            <StatusIcon kind="err" />
            {importing.error.message}
          </p>
        ) : null}
      </div>

      <footer className="source-pane__foot">
        {step === 0 ? null : (
          <button
            type="button"
            className="btn"
            disabled={importing.isPending}
            onClick={() => {
              goTo(step - 1);
            }}
          >
            <span aria-hidden="true">‹ </span>Back
          </button>
        )}
        <span className="source-pane__spacer" />
        {step === 0 && chosen === null ? (
          <span className="source-pane__foot-note">Choose a file to go on</span>
        ) : null}
        {step === 2 && undecided.length > 0 ? (
          <span id={`${ids}-undecided`} className="source-pane__foot-note">
            {`Decide ${listed(undecided.map((source) => source.name))} to go on`}
          </span>
        ) : null}
        {step === 3 && review.data !== undefined ? (
          <span className="source-pane__foot-note">
            {warnings === 0 ? 'No warnings' : NONE_BLOCKS}
          </span>
        ) : null}
        {step === 3 ? null : (
          <button
            type="button"
            className="btn btn-ghost source-pane__cancel"
            disabled={importing.isPending}
            onClick={leave}
          >
            Cancel
          </button>
        )}
        {step === 0 && chosen !== null && !chosen.read.ok ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              picker.current?.click();
            }}
          >
            Choose another file
          </button>
        ) : step === 0 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={file === undefined}
            onClick={() => {
              goTo(1);
            }}
          >
            Next: Target <span aria-hidden="true">›</span>
          </button>
        ) : step === 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={targetId === ''}
            onClick={() => {
              goTo(2);
            }}
          >
            {sources.length === 0 ? 'Next: Review' : 'Next: Data sources'}{' '}
            <span aria-hidden="true">›</span>
          </button>
        ) : step === 2 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={undecided.length > 0}
            aria-describedby={undecided.length > 0 ? `${ids}-undecided` : undefined}
            onClick={() => {
              goTo(3);
            }}
          >
            Next: Review <span aria-hidden="true">›</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={review.data === undefined || importing.isPending}
            onClick={() => {
              importing.mutate();
            }}
          >
            {importing.isPending ? 'Importing…' : 'Import to My workspace'}
          </button>
        )}
      </footer>

      {asking ? (
        <AskToDiscard
          secrets={sources.length > 0}
          left={leftBehind}
          onKeep={() => {
            setAsking(false);
          }}
          onDiscard={onClose}
        />
      ) : null}
    </aside>
  );
}

/** Discard this import? (state X, rule 85): focus on the answer that loses nothing. */
function AskToDiscard({
  secrets,
  left,
  onKeep,
  onDiscard,
}: {
  /** Whether secrets may have been typed, which are lost too. */
  secrets: boolean;
  /** Data sources an Import that then failed already made: they stay, as drafts. */
  left: readonly string[];
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div className="source-pane__veil">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-discard`}
        aria-describedby={`${ids}-discard-body`}
        className="source-pane__ask"
      >
        <h3 id={`${ids}-discard`}>Discard this import?</h3>
        <p id={`${ids}-discard-body`}>
          {`${secrets ? 'Your choices and any secret you typed are lost.' : 'Your choices are lost.'} ${
            left.length === 0
              ? 'Nothing has been imported.'
              : `${listed(left)} ${left.length === 1 ? 'was' : 'were'} made already and ${left.length === 1 ? 'stays' : 'stay'} in My workspace as ${left.length === 1 ? 'a draft' : 'drafts'}; nothing else has been imported.`
          }`}
        </p>
        <div className="source-pane__ask-actions">
          <button ref={keep} type="button" className="btn" onClick={onKeep}>
            Keep going
          </button>
          <button type="button" className="btn btn-danger" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
