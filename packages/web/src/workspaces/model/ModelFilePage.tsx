import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { codeNoteOf, MODEL_FILES_QUERY } from './FileList';
import { objectsOf } from './objects';
import { CubeForm } from './form/CubeForm';
import { lossOf, type Loss } from './lossCheck';
import { LossWarning } from './LossWarning';
import { problemsOf, type Problem } from './problems';
import { ProblemsPanel } from './ProblemsPanel';
import { modelOf, withObject } from './sync';
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

function FileEditor({ path, content }: { path: string; content: string }) {
  /** The YAML view's text, as typed. */
  const [text, setText] = useState(content);
  /** The text the form reads: the last that parsed, once typing paused. */
  const [read, setRead] = useState(content);
  /** What stops `text` parsing, as of the last pause (T141, AC-135). */
  const [problems, setProblems] = useState(() => {
    const found = problemsOf(path, content);
    return found.length === 0 ? NONE : found;
  });

  /** When the text first differed from what the form read: the wait counts from it. */
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (text !== read) since.current ??= Date.now();
    const cap =
      since.current === null ? YAML_PAUSE_MS : since.current + YAML_MAX_WAIT_MS - Date.now();
    const timer = setTimeout(
      () => {
        // Only a text that parses reaches the form; what stops one is listed.
        const found = problemsOf(path, text);
        setProblems(found.length === 0 ? NONE : found);
        // Checked: the next keystroke starts the next wait.
        since.current = null;
        if (found.length === 0 && text !== read) setRead(text);
      },
      Math.max(0, Math.min(YAML_PAUSE_MS, cap)),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [path, text, read]);

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
  const edit = (list: 'cubes' | 'views', index: number, next: Value) => {
    let written: string;
    try {
      written = withObject(read, list, index, next);
    } catch (error) {
      // An anchor removed that an alias still uses: there's no file to write.
      setRefused(error instanceof Error ? error.message : String(error));
      return;
    }
    const lost = lossOf(read, written);
    if (lost.length > 0) setPending({ written, lost });
    else apply(written);
  };

  /**
   * Read-only while the text does not parse (direction.md rule 28), while
   * the form is behind what was typed — an edit then would be written over
   * the typing, from the text before it — and while an edit waits to be
   * applied or kept.
   */
  const readOnly = problems.length > 0 || text !== read || pending !== null;
  /** Where a picked problem sends the editor's cursor. */
  const [goTo, setGoTo] = useState<{ at: number }>();
  const [first] = problems;

  return (
    <div className="model-editor">
      <div
        // Shown locked only for a parse error: the lock while typing catches up is brief.
        className={`model-editor__form${first === undefined ? '' : ' model-editor__form--frozen'}`}
      >
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
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
              <rect
                x="1.5"
                y="1.5"
                width="13"
                height="13"
                rx="3"
                fill="var(--wc-status-error-icon)"
              />
              <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" />
            </svg>
            <span>
              The YAML doesn’t parse (line {first.line}).{' '}
              {cubes.length + views.length > 0
                ? 'The form is read-only until the code is fixed.'
                : // Broken when it was opened: there is no form yet to hold.
                  'Its form shows once the code is fixed.'}
            </span>
          </p>
        )}
        {cubes.map(({ at, value }) => (
          <CubeForm
            // The cube's place in the file: its name is a field it edits.
            key={`cube ${String(at)}`}
            kind="cube"
            value={value}
            readOnly={readOnly}
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
      </div>
      <div className="model-editor__yaml">
        <YamlEditor
          value={text}
          onChange={(next) => {
            // Typing in the YAML answers a held or refused form edit: it was of the text before.
            setPending(null);
            setRefused(null);
            setText(next);
          }}
          label={`${path}, as YAML`}
          problems={problems}
          goTo={goTo}
        />
        <ProblemsPanel
          path={path}
          problems={problems}
          onPick={(problem) => {
            setGoTo({ at: problem.from });
          }}
        />
      </div>
    </div>
  );
}

function FileBody({ path, content }: { path: string; content: string }) {
  const read = useMemo(() => objectsOf(path, content), [path, content]);
  // Held read-only, with the reason; its text in a read-only editor is T146.
  if (read.code !== undefined)
    return <p className="model-files__note">{codeNoteOf(path, read.code)}</p>;
  // A file that does not parse opens too: its problems are listed, to be fixed.
  // Keyed by the file: another file is another text, not this one's state.
  return <FileEditor key={path} path={path} content={content} />;
}

export function ModelFilePage({ path }: { path: string }) {
  const files = useQuery(MODEL_FILES_QUERY);
  const file = files.data?.find((each) => each.path === path);

  return (
    <div className="model-workspace model-file-page">
      {/* It names the object the URL selected, as every deep link does (AC-002). */}
      <h1 className="model-file-page__path" data-testid="selected-object">
        {path}
      </h1>
      {files.isPending ? (
        <p>Reading the model…</p>
      ) : files.isError ? (
        <p role="alert">{files.error.message}</p>
      ) : file === undefined ? (
        <p role="alert">There is no model file {path}.</p>
      ) : (
        <FileBody path={file.path} content={file.content} />
      )}
    </div>
  );
}
