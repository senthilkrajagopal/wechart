import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { MODEL_FILES_QUERY } from './FileList';
import { objectsOf } from './objects';
import { CubeForm } from './form/CubeForm';
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

function FileEditor({ path, content }: { path: string; content: string }) {
  /** The YAML view's text, as typed. */
  const [text, setText] = useState(content);
  /** The text the form reads: the last that parsed, once typing paused. */
  const [read, setRead] = useState(content);

  useEffect(() => {
    if (text === read) return undefined;
    const timer = setTimeout(() => {
      // Only a text that parses reaches the form (T141 says what is wrong).
      if (modelOf(text).model !== undefined) setRead(text);
    }, YAML_PAUSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text, read]);

  const model = useMemo(() => modelOf(read).model ?? {}, [read]);

  /** A form edit, written into the file at once: the YAML view shows it in the same render. */
  const edit = (list: 'cubes' | 'views', index: number, next: Value) => {
    const written = withObject(read, list, index, next);
    setText(written);
    setRead(written);
  };

  return (
    <div className="model-editor">
      <div className="model-editor__form">
        {(model.cubes ?? []).map((cube, index) => (
          <CubeForm
            // The cube's place in the file: its name is a field it edits.
            key={`cube ${String(index)}`}
            kind="cube"
            value={cube}
            onChange={(next) => {
              edit('cubes', index, next);
            }}
          />
        ))}
        {(model.views ?? []).map((view, index) => (
          <CubeForm
            key={`view ${String(index)}`}
            kind="view"
            value={view}
            onChange={(next) => {
              edit('views', index, next);
            }}
          />
        ))}
      </div>
      <div className="model-editor__yaml">
        <YamlEditor value={text} onChange={setText} label={`${path}, as YAML`} />
      </div>
    </div>
  );
}

function FileBody({ path, content }: { path: string; content: string }) {
  const read = useMemo(() => objectsOf(path, content), [path, content]);
  if (read.code !== undefined)
    return <p>{read.code} code: its cubes and views are made when Cube runs it.</p>;
  if (read.problem !== undefined) return <p role="alert">{read.problem}</p>;
  return <FileEditor path={path} content={content} />;
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
