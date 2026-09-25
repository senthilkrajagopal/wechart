import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useRouter, type ShouldBlockFn } from '@tanstack/react-router';

import { META_QUERY } from '../../query/meta';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { FileList, MODEL_FILES_QUERY } from './FileList';
import { GenerateCubes } from './GenerateCubes';
import { FileTree, fileHref } from './FileTree';
import { objectsOf } from './objects';
import { CubeForm } from './form/CubeForm';
import { JoinEditor } from './JoinEditor';
import { joinGraphOf } from './joinGraph';
import { lossOf, type Loss } from './lossCheck';
import { LossWarning } from './LossWarning';
import { problemsOf, type Problem } from './problems';
import { ProblemsPanel, type CubeProblem } from './ProblemsPanel';
import { editedMembersOf } from './editedMembers';
import { ReadOnlyFile } from './ReadOnlyFile';
import { ReferencesWarning, type MemberReferences } from './ReferencesWarning';
import { publishModel, referencesTo } from './publish';
import { modelOf, withObject } from './sync';
import { memberIndexOf, PickerScopeContext } from './form/scopes';
import { validationProblems } from './validate';
import { YamlEditor } from './YamlEditor';

/**
 * A model file, opened (T138, T139; direction.md §7b): a form for each cube
 * and view it defines, and the file's YAML beside it, each editing the same
 * text. Held here until publishing takes it to Cube (T142).
 */
type Value = Record<string, unknown>;

/** direction.md §7b: "Code edits re-parse after a 300 ms pause" — inside AC-133's 500. */
export const YAML_PAUSE_MS = 300;
/**
 * And never longer than this after the first keystroke the form hasn't
 * read, so typing that never pauses still reaches it inside AC-133's 500 ms
 * (T139's review), with room for the render: the pause itself, as a ceiling.
 */
export const YAML_MAX_WAIT_MS = YAML_PAUSE_MS;

const NONE: readonly Problem[] = [];

const isPlain = (value: unknown): value is Value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * A file's cubes or views, each at its place in the file. Only those that are
 * objects get a form: a `-` with nothing after it yet is `null`, and a list
 * written as something other than a list is Cube's to reject (T142), not the
 * page's to crash on (T139's review).
 */
const entriesOf = (list: unknown): { at: number; value: Value }[] =>
  (Array.isArray(list) ? (list as unknown[]) : []).flatMap((value, at) =>
    isPlain(value) ? [{ at, value }] : [],
  );

/**
 * The rollups a publish in this tab was last refused for (T207's review): kept
 * for the tab, so the refused rollup's row says so when its own file is opened
 * — each file opens as a page of its own. Storage may be refused; the
 * refusal then shows on this page only.
 */
const REFUSED_ROLLUPS = 'wechart.model.refusedRollups';

function readRefusedRollups(): readonly CubeProblem[] {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(REFUSED_ROLLUPS) ?? '[]');
    return Array.isArray(kept) ? (kept as CubeProblem[]) : [];
  } catch {
    return [];
  }
}

function keepRefusedRollups(problems: readonly CubeProblem[]): readonly CubeProblem[] {
  try {
    if (problems.length === 0) sessionStorage.removeItem(REFUSED_ROLLUPS);
    else sessionStorage.setItem(REFUSED_ROLLUPS, JSON.stringify(problems));
  } catch {
    // Kept on this page only.
  }
  return problems;
}

/** A problem that stops the file being read and published; a warning does not (AC-223). */
const isError = (problem: Problem) => problem.severity !== 'warning';

const orNone = (found: readonly Problem[]) => (found.length === 0 ? NONE : found);

function FileEditor({
  path,
  content,
  published = true,
  openOn,
  onProblems,
  onChanged,
  onText,
  onDiscard,
}: {
  path: string;
  content: string;
  /** A cube's tab to open on (T160). */
  openOn?: OpenOn | undefined;
  /** False for a file made here and not yet published: there is nothing to go back to. */
  published?: boolean;
  /** Discarding a file made here and not yet published: it goes (AC-226). */
  onDiscard?: (() => void) | undefined;
  /**
   * The errors this editor knows of, by file, for the tree's marks (AC-222):
   * this file's own, and those Cube gave for any file on its last refusal.
   */
  onProblems?: (byPath: Readonly<Record<string, number>>) => void;
  /** Whether the file has changes not yet published, for its row in the tree (AC-226). */
  onChanged?: (changed: boolean) => void;
  /** Each change to the text, for a file made here to keep until it is published. */
  onText?: (text: string) => void;
}) {
  /** The YAML view's text, as typed. */
  const [text, setText] = useState(content);
  /** The text the form reads: the last that parsed, once typing paused. */
  const [read, setRead] = useState(content);
  /** What stops `text` parsing, as of the last pause (T141, AC-135). */
  const [problems, setProblems] = useState(() => orNone(problemsOf(path, content)));
  /**
   * What Cube's validator would refuse in a text that parses, as of the last
   * pause (AC-227): errors that hold the publish, and leave the form open to
   * put them right.
   */
  const [invalid, setInvalid] = useState(() => orNone(validationProblems(path, content)));
  /** Both, in the file's order, for Problems and the editor's marks. */
  const listed = useMemo(
    () =>
      invalid.length === 0
        ? problems
        : problems.length === 0
          ? invalid
          : [...problems, ...invalid].sort((a, b) => a.from - b.from),
    [problems, invalid],
  );
  /** Checks a text, and says whether it parses, for the form to read it. */
  const check = useCallback(
    (checked: string) => {
      const found = problemsOf(path, checked);
      const parses = !found.some(isError);
      setProblems(orNone(found));
      // What Cube would refuse is looked for only in a text that parses.
      setInvalid(parses ? orNone(validationProblems(path, checked)) : NONE);
      return parses;
    },
    [path],
  );

  /** When the text first differed from what the form read: the wait counts from it. */
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (text !== read) since.current ??= Date.now();
    const cap =
      since.current === null ? YAML_PAUSE_MS : since.current + YAML_MAX_WAIT_MS - Date.now();
    const timer = setTimeout(
      () => {
        // Only a text that parses reaches the form; what stops one is listed,
        // and what Cube would refuse in one that does. A warning does not
        // stop it; an error does.
        const parses = check(text);
        // Checked: the next keystroke starts the next wait.
        since.current = null;
        if (parses && text !== read) setRead(text);
      },
      Math.max(0, Math.min(YAML_PAUSE_MS, cap)),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [path, text, read, check]);

  // A file made here keeps what is typed until it is published (AC-222).
  const keepText = useRef(onText);
  useEffect(() => {
    keepText.current = onText;
  }, [onText]);
  useEffect(() => {
    keepText.current?.(text);
  }, [text]);

  const model = useMemo(() => modelOf(read).model ?? {}, [read]);
  const cubes = entriesOf(model.cubes);
  const views = entriesOf(model.views);

  /**
   * A form edit that would lose something, held until the user says (T140,
   * AC-134): the file it would write, and what that file no longer has.
   */
  const [pending, setPending] = useState<{ written: string; lost: readonly Loss[] } | null>(null);
  /** A form edit that can't be written at all, and why. */
  const [refused, setRefused] = useState<string | null>(null);
  /** What uses the members a save edits, shown until the user saves anyway or cancels (T147). */
  const [references, setReferences] = useState<{
    found: MemberReferences;
    /** The text they were found for: what "Save anyway" saves. */
    text: string;
  } | null>(null);
  /** Where the focus goes back to when the warning closes. */
  const saveButton = useRef<HTMLButtonElement>(null);

  const apply = (written: string) => {
    setText(written);
    setRead(written);
    // An edit that went in answers an earlier one that couldn't.
    setRefused(null);
  };

  /**
   * A form edit, written into the file at once, so the YAML view shows it in
   * the same render — unless it would drop a comment, an anchor or an alias,
   * which is named first and applied only if the user says so.
   */
  const edit = (
    list: 'cubes' | 'views',
    index: number,
    next: Value,
  ): 'applied' | 'held' | 'refused' => {
    let written: string;
    try {
      written = withObject(read, list, index, next);
    } catch (error) {
      // An anchor removed that an alias still uses: there's no file to write.
      setRefused(error instanceof Error ? error.message : String(error));
      return 'refused';
    }
    const lost = lossOf(read, written);
    if (lost.length > 0) {
      setPending({ written, lost });
      return 'held';
    }
    apply(written);
    return 'applied';
  };

  /**
   * Read-only while the text does not parse (direction.md rule 28), while
   * the form is behind what was typed — an edit then would be written over
   * the typing, from the text before it — and while an edit waits to be
   * applied or kept.
   */
  const errors = problems.filter(isError);
  const readOnly = errors.length > 0 || text !== read || pending !== null || references !== null;
  /** Where a picked problem sends the editor's cursor. */
  const [goTo, setGoTo] = useState<{ at: number }>();
  const [first] = errors;

  /** The right pane: the YAML, or the join diagram (T144). */
  const [view, setView] = useState<'yaml' | 'joins'>('yaml');
  const allFiles = useQuery(MODEL_FILES_QUERY);
  /**
   * The model's join graph, with this file as the form has it now (AC-138):
   * worked out only while the diagram shows, the other files once each.
   */
  const others = useMemo(
    () =>
      view === 'joins'
        ? joinGraphOf((allFiles.data ?? []).filter((file) => file.path !== path))
        : undefined,
    [view, allFiles.data, path],
  );
  const graph = useMemo(() => {
    if (others === undefined) return undefined;
    const own = joinGraphOf([{ path, content: read }]);
    const cubesHere = [...others.cubes, ...own.cubes];
    const joins = [...others.joins, ...own.joins];
    const defined = new Set(cubesHere.map((each) => each.name));
    return {
      cubes: cubesHere,
      joins,
      missing: [...new Set(joins.map((join) => join.to))].filter((to) => !defined.has(to)),
    };
  }, [others, path, read]);
  /**
   * What the form's pickers may name (AC-224): the other files' cubes, each
   * read once, and this file's as the form has it now.
   */
  const othersIndex = useMemo(
    () => memberIndexOf((allFiles.data ?? []).filter((file) => file.path !== path)),
    [allFiles.data, path],
  );
  const pickers = useMemo(
    () => ({
      index: new Map([...othersIndex, ...memberIndexOf([{ path, content: read }])]),
      cube: undefined,
    }),
    [othersIndex, path, read],
  );
  /** This file's cubes, any of which a join can be added to. */
  const cubeNames = cubes
    .map(({ value }) => value['name'])
    .filter((name): name is string => typeof name === 'string');

  /**
   * The text last published, or as it was read from the store (T142) — none
   * for a file made here, so it has something to publish from the start.
   */
  const [saved, setSaved] = useState(published ? content : '');
  const [publishing, setPublishing] = useState(false);
  /** Cube's reasons for refusing the last save, by file (AC-136). */
  const [cubeProblems, setCubeProblems] = useState<readonly CubeProblem[]>([]);
  /**
   * The rollups the last publish in this tab was refused for (T207, AC-189),
   * whichever file they are in: a change to one file can leave another's
   * rollup naming what the model no longer has, and that rollup's row says
   * so when its file is opened.
   */
  const [refusedRollups, setRefusedRollups] = useState(readRefusedRollups);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const queryClient = useQueryClient();
  /** Changes not yet published (AC-226): for a file made here, all of it. */
  const changed = text !== saved;
  /**
   * Something to publish, that parses, that the form has caught up with, and
   * nothing held. What Cube's validator would refuse is listed, not enforced:
   * Cube has the last word (AC-136), and a value it takes that the list
   * misreads can still be published.
   */
  const canPublish =
    changed &&
    text === read &&
    errors.length === 0 &&
    pending === null &&
    references === null &&
    !publishing;

  const reportChanged = useRef(onChanged);
  useEffect(() => {
    reportChanged.current = onChanged;
  }, [onChanged]);
  useEffect(() => {
    reportChanged.current?.(changed);
  }, [changed]);

  /**
   * Leaving the file with changes it has published nowhere asks first
   * (AC-226): in the page, as the prototype's warning bar; on a reload or a
   * closed tab, as the browser's own question. A file made here keeps its
   * text for the tab, so moving about the tab loses nothing of it — but a
   * closed tab does.
   */
  const unsaved = useRef({ published, changed });
  useEffect(() => {
    unsaved.current = { published, changed };
  }, [published, changed]);
  const shouldBlockFn = useCallback<ShouldBlockFn>(
    ({ current, next }) =>
      unsaved.current.published && unsaved.current.changed && current.pathname !== next.pathname,
    [],
  );
  const enableBeforeUnload = useCallback(() => unsaved.current.changed, []);
  const leaving = useBlocker({ shouldBlockFn, enableBeforeUnload, withResolver: true });
  const stay = useRef<HTMLButtonElement>(null);
  /** Where the focus was when leaving was asked about: where staying puts it back. */
  const returnTo = useRef<HTMLElement | null>(null);
  const { status: leave, reset } = leaving;
  const stayHere = useCallback(() => {
    reset?.();
    returnTo.current?.focus();
  }, [reset]);
  useEffect(() => {
    if (leave !== 'blocked') return undefined;
    returnTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stay.current?.focus();
    // Escape stays, as it closes any question.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stayHere();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [leave, stayHere]);

  /**
   * Back to the file as it was last published, or read (AC-226) — and Cube's
   * reasons for refusing the text it replaces go with it. A file made here
   * has nothing to go back to: discarding it is the page's to do.
   */
  const discard = () => {
    if (!published) {
      onDiscard?.();
      return;
    }
    setText(saved);
    setRead(saved);
    check(saved);
    setPending(null);
    setRefused(null);
    setReferences(null);
    setOutcome(null);
    if (cubeProblems.length > 0) {
      // The last publish was this file's, and refused: its rollups' too.
      setCubeProblems([]);
      setRefusedRollups(keepRefusedRollups([]));
    }
  };

  /**
   * The errors this editor knows of, by file, for the tree (AC-222): this
   * file's own, Cube's reasons for its last refusal, and the rollups refused
   * in this tab — each on the file it is about.
   */
  const reportProblems = useRef(onProblems);
  useEffect(() => {
    reportProblems.current = onProblems;
  }, [onProblems]);
  const ownErrors = errors.length + invalid.length;
  useEffect(() => {
    const byPath: Record<string, number> = { [path]: ownErrors };
    for (const problem of [...cubeProblems, ...refusedRollups])
      byPath[problem.path] = (byPath[problem.path] ?? 0) + 1;
    reportProblems.current?.(byPath);
  }, [path, ownErrors, cubeProblems, refusedRollups]);

  /**
   * Publish this file — after listing the charts and dashboards that use the
   * members the save edits, if any do, and only once the user says so (AC-141).
   */
  const publish = async (checked?: string) => {
    // Saved anyway: exactly the text that was checked, not what is here now.
    const sent = checked ?? text;
    setPublishing(true);
    setOutcome(null);
    if (checked === undefined) {
      // Across the whole model: a view in another file exposes a cube's
      // member by a name of its own (T147's review).
      const others = (allFiles.data ?? []).filter((file) => file.path !== path);
      const edited = editedMembersOf(
        [...others, { path, content: saved }],
        [...others, { path, content: sent }],
      );
      if (edited.length > 0) {
        const found = await referencesTo(edited);
        if (found === undefined) {
          setPublishing(false);
          setOutcome({
            ok: false,
            text: 'What uses the changed members could not be checked, so nothing was saved.',
          });
          return;
        }
        if (found.charts.length + found.dashboards.length > 0) {
          setPublishing(false);
          setReferences({ found, text: sent });
          return;
        }
      }
    }
    const result = await publishModel([{ path, content: sent }]);
    setPublishing(false);
    if (result.kind === 'published') {
      setSaved(sent);
      setCubeProblems([]);
      setRefusedRollups(keepRefusedRollups([]));
      setOutcome({ ok: true, text: 'Published. Cube is reading the new model.' });
      // The listing, and every field list, read the model afresh (AC-137).
      void queryClient.invalidateQueries({ queryKey: MODEL_FILES_QUERY.queryKey });
      void queryClient.invalidateQueries({ queryKey: META_QUERY.queryKey });
    } else if (result.kind === 'refused') {
      setCubeProblems(result.problems);
      setRefusedRollups(
        keepRefusedRollups(
          result.problems.filter((problem) => problem.preAggregation !== undefined),
        ),
      );
      setOutcome({
        ok: false,
        // wechart's refusal, not Cube's, when every problem is a rollup's unknown names (AC-189).
        text: result.problems.every((problem) => problem.preAggregation !== undefined)
          ? 'A pre-aggregation names members the model doesn’t have, so nothing was published.'
          : 'Cube refused the model, so nothing was published.',
      });
    } else {
      setOutcome({ ok: false, text: result.message });
    }
  };

  return (
    <div className="model-editor">
      {/*
        Two full-height panes, each with its own header row and scrolling
        (AC-223), as the prototype's (model.js, `mount`): the form, headed by
        the file and its one action; and the code, headed by its view, with
        Problems docked beneath it.
      */}
      <section className="model-editor__pane" aria-label="Form editor">
        <div className="model-editor__head">
          {/* It names the object the URL selected, as every deep link does (AC-002). */}
          <h1 className="workspace-title model-editor__path" data-testid="selected-object">
            {path}
          </h1>
          {changed ? (
            // Said beside the file's actions, with its icon (AC-226; direction.md rule 3).
            // A state the head keeps, not news: no live region to announce it.
            <span className="model-editor__changed">
              <StatusIcon kind="idle" />
              Unpublished changes
            </span>
          ) : null}
          {changed && (published || onDiscard !== undefined) ? (
            <button type="button" className="btn-sm" onClick={discard}>
              Discard
            </button>
          ) : null}
          {outcome === null ? null : (
            <StateLine
              kind={outcome.ok ? 'ok' : 'err'}
              className={`model-editor__outcome${outcome.ok ? '' : ' model-editor__outcome--failed'}`}
            >
              {outcome.text}
            </StateLine>
          )}
          <button
            ref={saveButton}
            type="button"
            className="btn-sm btn-primary"
            disabled={!canPublish}
            onClick={() => {
              void publish();
            }}
          >
            {publishing ? (
              // Under way, with its icon as well as its word (T183, AC-177).
              <>
                <StatusIcon kind="run" />
                Saving…
              </>
            ) : (
              'Save & reload Cube'
            )}
          </button>
        </div>
        {leaving.status === 'blocked' ? (
          <div
            className="model-editor__warnbar model-editor__leave"
            role="alertdialog"
            aria-labelledby="model-leave-title"
            aria-describedby="model-leave-text"
          >
            <StatusIcon kind="warn" />
            <span className="model-editor__warnbar-text">
              <strong id="model-leave-title">Leave with unpublished changes?</strong>{' '}
              <span id="model-leave-text">
                <code>{path}</code> has changes that aren’t published. Leaving loses them.
              </span>
            </span>
            <button type="button" className="btn-sm" onClick={leaving.proceed}>
              Leave without publishing
            </button>
            <button ref={stay} type="button" className="btn-sm btn-primary" onClick={stayHere}>
              Stay
            </button>
          </div>
        ) : null}
        <div
          // Shown locked only for a parse error: the lock while typing catches up is brief.
          className={`model-editor__form${first === undefined ? '' : ' model-editor__form--frozen'}`}
        >
          {references === null ? null : (
            <ReferencesWarning
              found={references.found}
              onSave={() => {
                const { text: checked } = references;
                setReferences(null);
                saveButton.current?.focus();
                // Changed since it was checked: checked again, not saved unchecked.
                void publish(checked === text ? checked : undefined);
              }}
              onCancel={() => {
                setReferences(null);
                saveButton.current?.focus();
              }}
            />
          )}
          {pending === null ? null : (
            <LossWarning
              lost={pending.lost}
              onApply={() => {
                apply(pending.written);
                setPending(null);
              }}
              onKeep={() => {
                setPending(null);
              }}
            />
          )}
          {refused === null ? null : (
            <p className="model-editor__warnbar" role="alert">
              <StatusIcon kind="warn" />
              <span className="model-editor__warnbar-text">
                This edit can’t be written into the file: {refused}.
              </span>
              <button
                type="button"
                className="btn-sm"
                onClick={() => {
                  setRefused(null);
                }}
              >
                Dismiss
              </button>
            </p>
          )}
          {first === undefined ? null : (
            // The prototype's read-only veil (model.js), over the forms.
            <p className="model-editor__veil" role="status">
              <StatusIcon kind="err" />
              <span>
                The YAML doesn’t parse (line {first.line}).{' '}
                {cubes.length + views.length > 0
                  ? 'The form is read-only until the code is fixed.'
                  : // Broken when it was opened: there is no form yet to hold.
                    'Its form shows once the code is fixed.'}
              </span>
            </p>
          )}
          {/* Its pickers list what the model has (AC-224). */}
          <PickerScopeContext.Provider value={pickers}>
            {cubes.map(({ at, value }) => (
              <CubeForm
                // The cube's place in the file: its name is a field it edits.
                key={`cube ${String(at)}`}
                kind="cube"
                value={value}
                readOnly={readOnly}
                // Opened from Schedules on this cube's pre-aggregations (T160).
                {...(openOn !== undefined && openOn.cube === value['name']
                  ? { initialTab: openOn.tab }
                  : {})}
                // Its rollups a publish was refused for, on their rows (T207, AC-189).
                rollupProblems={refusedRollups.filter(
                  (problem) =>
                    problem.path === path && problem.preAggregation?.cube === value['name'],
                )}
                onChange={(next) => {
                  edit('cubes', at, next);
                }}
              />
            ))}
            {views.map(({ at, value }) => (
              <CubeForm
                key={`view ${String(at)}`}
                kind="view"
                value={value}
                readOnly={readOnly}
                onChange={(next) => {
                  edit('views', at, next);
                }}
              />
            ))}
          </PickerScopeContext.Provider>
        </div>
      </section>
      <section className="model-editor__pane model-editor__yaml" aria-label="YAML and join diagram">
        <div className="model-editor__head">
          {/* The prototype's right-pane toggle (model.js): the YAML, or the join diagram. */}
          <div className="seg model-editor__view" role="group" aria-label="Right pane view">
            <button
              type="button"
              aria-pressed={view === 'yaml'}
              onClick={() => {
                setView('yaml');
              }}
            >
              YAML
            </button>
            <button
              type="button"
              aria-pressed={view === 'joins'}
              onClick={() => {
                setView('joins');
              }}
            >
              Join diagram
            </button>
          </div>
          <span className="model-editor__sync">Edits in either side stay in sync</span>
        </div>
        <div className="model-editor__code">
          {view === 'joins' && graph !== undefined ? (
            <JoinEditor
              graph={graph}
              cube={cubeNames[0]}
              cubes={cubeNames}
              // Locked as the form is (AC-135): an edit then would be written over the typing.
              readOnly={readOnly}
              onAdd={(name, join) => {
                const entry = cubes.find(({ value }) => value['name'] === name);
                if (entry === undefined) return false;
                const joins = Array.isArray(entry.value['joins'])
                  ? (entry.value['joins'] as unknown[])
                  : [];
                return (
                  edit('cubes', entry.at, { ...entry.value, joins: [...joins, join] }) === 'applied'
                );
              }}
            />
          ) : null}
          {/* Hidden, not gone, while the diagram shows: its undo history stays. */}
          <div className="model-editor__yaml-view" hidden={view !== 'yaml'}>
            <YamlEditor
              value={text}
              onChange={(next) => {
                // Typing in the YAML answers a held or refused form edit: it was of the text before.
                setPending(null);
                setRefused(null);
                setText(next);
              }}
              label={`${path}, as YAML`}
              problems={listed}
              goTo={goTo}
            />
          </div>
        </div>
        {/* Docked beneath the code, its own scroll (AC-223). */}
        <ProblemsPanel
          path={path}
          problems={listed}
          cubeProblems={cubeProblems}
          onPick={(problem) => {
            // To the YAML, where the problem is (the prototype's click does too).
            setView('yaml');
            setGoTo({ at: problem.from });
          }}
        />
      </section>
    </div>
  );
}

/**
 * A page with no editor — a file that is code, one there is none of, one
 * still being read — headed as the editor is, by its path (AC-002, AC-231).
 */
function Solo({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="model-page__solo">
      <div className="model-editor__head">
        <h1 className="workspace-title model-editor__path" data-testid="selected-object">
          {path}
        </h1>
      </div>
      <div className="model-page__body">{children}</div>
    </div>
  );
}

function FileBody({
  path,
  content,
  published,
  openOn,
  onProblems,
  onChanged,
  onText,
  onDiscard,
}: {
  path: string;
  content: string;
  published: boolean;
  openOn?: OpenOn | undefined;
  onProblems: (byPath: Readonly<Record<string, number>>) => void;
  onChanged: (changed: boolean) => void;
  onText?: ((text: string) => void) | undefined;
  onDiscard?: (() => void) | undefined;
}) {
  const read = useMemo(() => objectsOf(path, content), [path, content]);
  // Code or a template: its text in the code view, read-only, with the reason (T146, AC-140).
  if (read.code !== undefined)
    return (
      <Solo path={path}>
        <ReadOnlyFile key={path} path={path} content={content} code={read.code} />
      </Solo>
    );
  // A file that does not parse opens too: its problems are listed, to be fixed.
  // Keyed by the file: another file is another text, not this one's state.
  return (
    <FileEditor
      key={path}
      path={path}
      content={content}
      published={published}
      openOn={openOn}
      onProblems={onProblems}
      onChanged={onChanged}
      onDiscard={onDiscard}
      {...(onText === undefined ? {} : { onText })}
    />
  );
}

/**
 * Files made with New cube or New view and not yet published, as last typed:
 * kept for the tab (AC-222), in the query cache for the page and in session
 * storage past a reload — storage may be refused, and then the page alone
 * keeps them.
 */
const DRAFTS_KEY = ['model-drafts'] as const;
/** The file New cube or New view just made, until it opens (ModelFilePage's `made`). */
const MADE_KEY = ['model-made'] as const;
const DRAFTS_STORAGE = 'wechart.model.drafts';

function readDrafts(): Record<string, string> {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(DRAFTS_STORAGE) ?? '{}');
    return isPlain(kept)
      ? Object.fromEntries(
          Object.entries(kept).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {};
  } catch {
    return {};
  }
}

function keepDrafts(drafts: Readonly<Record<string, string>>) {
  try {
    sessionStorage.setItem(DRAFTS_STORAGE, JSON.stringify(drafts));
  } catch {
    // Kept on this page only.
  }
}

/** A new file's name, the next free in its folder, and its first text (the prototype's). */
export function newFileOf(
  kind: 'cube' | 'view',
  taken: ReadonlySet<string>,
  firstCube: string | undefined,
): { path: string; content: string } {
  const folder = kind === 'cube' ? 'cubes' : 'views';
  let n = 1;
  while (taken.has(`${folder}/new_${kind}_${String(n)}.yml`)) n += 1;
  const name = `new_${kind}_${String(n)}`;
  return {
    path: `${folder}/${name}.yml`,
    content:
      kind === 'cube'
        ? `cubes:\n  - name: ${name}\n    sql_table: public.table_name\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n`
        : `views:\n  - name: ${name}\n    cubes:\n      - join_path: ${firstCube ?? 'orders'}\n        includes: "*"\n`,
  };
}

/**
 * The Model workspace (T234, AC-222, AC-223; direction.md §7b), as the
 * prototype lays it out: the model's files as a tree beside the editor —
 * which opens the chosen file in place, its path in the URL — and New cube
 * and New view, which make a file here to be published.
 */
/** A cube's tab to open the file on: Schedules' link to a pre-aggregation (T160). */
interface OpenOn {
  readonly cube: string;
  readonly tab: string;
}

export function ModelFilePage({
  path,
  openOn,
}: {
  path?: string | undefined;
  openOn?: OpenOn | undefined;
}) {
  const files = useQuery(MODEL_FILES_QUERY);
  const queryClient = useQueryClient();
  const router = useRouter();
  const drafts = useQuery({
    queryKey: DRAFTS_KEY,
    queryFn: readDrafts,
    initialData: readDrafts,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  }).data;
  const setDrafts = useCallback(
    (next: Readonly<Record<string, string>>) => {
      queryClient.setQueryData(DRAFTS_KEY, next);
      keepDrafts(next);
    },
    [queryClient],
  );
  /**
   * A file New cube or New view made, kept as a draft once it opens: leaving
   * the open file may be asked about, and staying makes no file (T237's
   * review). Kept in the query cache, not the page: made on the overview, it
   * opens on the file's page, a new one (the Superset parity run).
   */
  const made =
    useQuery<{ path: string; content: string } | null>({
      queryKey: MADE_KEY,
      queryFn: () => null,
      initialData: null,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    }).data ?? undefined;
  const setMade = useCallback(
    (next: { path: string; content: string } | undefined) => {
      queryClient.setQueryData(MADE_KEY, next ?? null);
    },
    [queryClient],
  );
  useEffect(() => {
    if (made === undefined || path !== made.path || made.path in drafts) return;
    setDrafts({ ...drafts, [made.path]: made.content });
  }, [path, made, drafts, setDrafts]);
  const stored = files.data ?? [];
  // A draft once published is a stored file: the store's copy wins.
  const unpublished = Object.entries({
    ...drafts,
    ...(made !== undefined && path === made.path ? { [made.path]: made.content } : {}),
  })
    .filter(([draft]) => !stored.some((file) => file.path === draft))
    .map(([draftPath, content]) => ({ path: draftPath, content }));
  const all = [...stored, ...unpublished];
  const file = path === undefined ? undefined : all.find((each) => each.path === path);
  const isDraft = file !== undefined && !stored.some((each) => each.path === file.path);
  /** The errors the open file's editor reports, by file, for the tree's marks. */
  const [reported, setReported] = useState<{
    from: string;
    byPath: Readonly<Record<string, number>>;
  }>();
  /** Whether the open file's editor has changes not yet published (AC-226). */
  const [changed, setChanged] = useState<{ from: string; changed: boolean }>();
  /** Marked in the tree: files made here, and the open file once it is edited. */
  const unpublishedPaths = new Set(unpublished.map((each) => each.path));
  if (changed !== undefined && changed.from === path && changed.changed)
    unpublishedPaths.add(changed.from);

  const open = (next: string) => {
    router.history.push(fileHref(next));
  };
  /** Whether Generate cubes is open (T145, AC-139). */
  const [generating, setGenerating] = useState(false);
  const makeNew = (kind: 'cube' | 'view') => {
    const firstCube = stored
      .flatMap((each) => objectsOf(each.path, each.content).objects)
      .find((object) => object.kind === 'cube')?.name;
    const next = newFileOf(kind, new Set(all.map((each) => each.path)), firstCube);
    setMade(next);
    open(next.path);
  };
  /** A file made here, discarded: it goes, and the overview opens (AC-226). */
  const discardDraft = (draft: string) => {
    if (made?.path === draft) setMade(undefined);
    setDrafts(Object.fromEntries(Object.entries(drafts).filter(([each]) => each !== draft)));
    router.history.push('/model');
  };

  /**
   * Opened from the overview, the page is a new one and what was pressed is
   * gone: focus goes to the opened file's row in the tree rather than to the
   * page, so a keyboard user keeps their place (T234's review).
   */
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (path === undefined || document.activeElement !== document.body) return;
    page.current?.querySelector<HTMLElement>('.model-tree__file[aria-current="page"]')?.focus();
  }, [path, files.isSuccess]);

  return (
    <div ref={page} className="model-workspace model-page">
      <FileTree
        files={all}
        current={path}
        reported={reported?.from === path ? reported?.byPath : undefined}
        unpublished={unpublishedPaths}
        onOpen={open}
        onNew={makeNew}
        onGenerate={() => {
          setGenerating(true);
        }}
      />
      {generating ? (
        <GenerateCubes
          existing={all}
          onClose={() => {
            setGenerating(false);
          }}
          onPublished={() => {
            // The store now has them: read it again, so the tree lists them.
            void queryClient.invalidateQueries({ queryKey: MODEL_FILES_QUERY.queryKey });
          }}
          onOpen={(opened) => {
            setGenerating(false);
            open(opened);
          }}
        />
      ) : null}
      <div className="model-page__main">
        {files.isPending ? (
          // Untitled while it reads: the title comes once, with what it heads.
          <StateLine kind="run">Reading the model…</StateLine>
        ) : files.isError ? (
          <StateLine kind="err">{files.error.message}</StateLine>
        ) : path === undefined ? (
          // No file open: what each defines (AC-131), beside the tree.
          <div className="model-page__overview">
            <h1 className="workspace-title">Model</h1>
            <p className="model-page__note">
              Choose a file in the tree to edit it, or make a new cube or view.
            </p>
            <FileList />
          </div>
        ) : file === undefined ? (
          <Solo path={path}>
            <StateLine kind="err">There is no model file {path}.</StateLine>
          </Solo>
        ) : (
          <FileBody
            path={file.path}
            content={file.content}
            published={!isDraft}
            openOn={openOn}
            onProblems={(byPath) => {
              setReported({ from: file.path, byPath });
            }}
            onChanged={(now) => {
              setChanged({ from: file.path, changed: now });
            }}
            onDiscard={
              isDraft
                ? () => {
                    discardDraft(file.path);
                  }
                : undefined
            }
            // A new file keeps what is typed in it until it is published.
            onText={
              isDraft
                ? (text) => {
                    if (drafts[file.path] !== text) setDrafts({ ...drafts, [file.path]: text });
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
