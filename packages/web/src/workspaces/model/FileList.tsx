import { useQuery } from '@tanstack/react-query';

import { objectsOf, type FileObjects, type MemberKind, type ModelObject } from './objects';

/**
 * The Model workspace's file list (T137, AC-131): every model file, and under
 * each the cubes and views it defines with their members, grouped by kind.
 */
interface ModelFile {
  readonly path: string;
  readonly content: string;
}

const GROUPS: readonly [kind: MemberKind, label: string][] = [
  ['measure', 'Measures'],
  ['dimension', 'Dimensions'],
  ['segment', 'Segments'],
  ['hierarchy', 'Hierarchies'],
  ['join', 'Joins'],
  ['pre-aggregation', 'Pre-aggregations'],
  ['include', 'Includes'],
];

/**
 * What a file that is not plain YAML is, and why its objects are not listed
 * (research/cube/data-modeling.md, "How each file type is compiled").
 */
export function codeNoteOf(path: string, code: NonNullable<FileObjects['code']>): string {
  if (code === 'JavaScript')
    return 'JavaScript: Cube runs it to make its cubes and views, so they aren’t listed from its text.';
  if (code === 'Jinja')
    return 'Jinja template: Cube renders it before reading its cubes and views, so they aren’t listed from its text.';
  // Cube loads only a `globals.py` at the model's root, as the Jinja context.
  return path === 'globals.py'
    ? 'Python: the functions and variables the Jinja templates use. It defines no cubes or views.'
    : 'Python: Cube reads only a globals.py at the model’s root, so it doesn’t use this file.';
}

export const MODEL_FILES_QUERY = {
  queryKey: ['model-files'],
  queryFn: async ({ signal }: { signal: AbortSignal }): Promise<readonly ModelFile[]> => {
    const response = await fetch('/api/model/files', { signal });
    if (!response.ok)
      throw new Error(`The model files could not be read (${String(response.status)}).`);
    return ((await response.json()) as { files: ModelFile[] }).files;
  },
};

function ObjectEntry({ object }: { object: ModelObject }) {
  const label = `${object.kind === 'cube' ? 'Cube' : 'View'} ${object.name}`;
  return (
    <div role="group" aria-label={label} className="model-object">
      <p className="model-object__name">
        <span className="model-object__kind">{object.kind}</span> {object.name}
      </p>
      {GROUPS.map(([kind, title]) => {
        const names = object.members.filter((member) => member.kind === kind).map((m) => m.name);
        return names.length === 0 ? null : (
          <div key={kind} className="model-object__group">
            <span className="model-object__group-title">{title}</span>
            <ul aria-label={title}>
              {names.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function FileList() {
  const files = useQuery(MODEL_FILES_QUERY);

  if (files.isPending) return <p className="model-files__note">Reading the model…</p>;
  if (files.isError)
    return (
      <p role="alert" className="model-files__note">
        {files.error.message}
      </p>
    );

  if (files.data.length === 0)
    // Nothing seeded: an empty or missing model directory (logged by the API).
    return <p className="model-files__note">There are no model files.</p>;

  return (
    <div className="model-files" data-testid="model-files">
      {files.data.map((file) => {
        const read = objectsOf(file.path, file.content);
        return (
          <section key={file.path} aria-label={file.path} className="model-file">
            <h2 className="model-file__path">
              {/* Opens the file on its forms (T138). */}
              <a href={`/model/files/${encodeURIComponent(file.path)}`}>{file.path}</a>
            </h2>
            {read.problem === undefined ? null : (
              <p role="alert" className="model-file__problem">
                {read.problem}
              </p>
            )}
            {read.code === undefined ? null : (
              <p className="model-file__note">{codeNoteOf(file.path, read.code)}</p>
            )}
            {read.objects.map((object) => (
              <ObjectEntry key={`${object.kind} ${object.name}`} object={object} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
