import { useQuery } from '@tanstack/react-query';

import { StateLine } from '../../shell/StatusIcon';
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
 * What a file that is not plain YAML is, and why its objects are not listed:
 * xcube serves plain YAML alone, so such a file stays in wechart and is never
 * sent (T447, AC-335, R29; research xcube-slice-2.md, "Path rules"). Cube once
 * ran, rendered or read such files itself (research/cube/data-modeling.md,
 * "How each file type is compiled"); under xcube it sees none of them.
 */
export function codeNoteOf(_path: string, code: NonNullable<FileObjects['code']>): string {
  if (code === 'JavaScript')
    return 'JavaScript: xcube serves plain YAML alone, so Cube never runs it, and its cubes and views aren’t served or listed.';
  if (code === 'Jinja')
    return 'Jinja template: xcube serves plain YAML alone, so Cube never renders it, and its cubes and views aren’t served or listed.';
  return 'Python: xcube serves plain YAML alone, so Cube never reads it.';
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

  if (files.isPending)
    return (
      <StateLine kind="run" className="model-files__note">
        Reading the model…
      </StateLine>
    );
  if (files.isError)
    return (
      <StateLine kind="err" className="model-files__note">
        {files.error.message}
      </StateLine>
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
              <StateLine kind="err" className="model-file__problem">
                {read.problem}
              </StateLine>
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
