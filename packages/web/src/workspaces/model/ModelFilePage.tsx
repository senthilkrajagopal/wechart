import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { parseDocument } from 'yaml';

import { MODEL_FILES_QUERY } from './FileList';
import { CUBE_PARSE, objectsOf } from './objects';
import { CubeForm } from './form/CubeForm';

/**
 * A model file, opened (T138, AC-132): a form for each cube and view it
 * defines. Edits are held here until the YAML view writes them (T139) and
 * publishing takes them to Cube (T142).
 */
type Value = Record<string, unknown>;

function FileForms({ path, content }: { path: string; content: string }) {
  const read = useMemo(() => objectsOf(path, content), [path, content]);
  const [model, setModel] = useState<{ cubes?: Value[]; views?: Value[] }>(() => {
    try {
      return (parseDocument(content, CUBE_PARSE).toJS() ?? {}) as {
        cubes?: Value[];
        views?: Value[];
      };
    } catch {
      return {};
    }
  });

  if (read.problem !== undefined) return <p role="alert">{read.problem}</p>;
  if (read.code !== undefined)
    return <p>{read.code} code: its cubes and views are made when Cube runs it.</p>;

  const replace = (list: 'cubes' | 'views', index: number, next: Value) => {
    setModel((current) => ({
      ...current,
      [list]: (current[list] ?? []).map((each, at) => (at === index ? next : each)),
    }));
  };

  return (
    <>
      {(model.cubes ?? []).map((cube, index) => (
        <CubeForm
          // The cube's place in the file: its name is a field it edits.
          key={`cube ${String(index)}`}
          kind="cube"
          value={cube}
          onChange={(next) => {
            replace('cubes', index, next);
          }}
        />
      ))}
      {(model.views ?? []).map((view, index) => (
        <CubeForm
          key={`view ${String(index)}`}
          kind="view"
          value={view}
          onChange={(next) => {
            replace('views', index, next);
          }}
        />
      ))}
    </>
  );
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
        <FileForms path={file.path} content={file.content} />
      )}
    </div>
  );
}
