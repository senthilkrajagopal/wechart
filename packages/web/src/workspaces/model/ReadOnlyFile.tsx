import { codeNoteOf } from './FileList';
import type { FileObjects } from './objects';
import { YamlEditor } from './YamlEditor';

/**
 * A model file that is code or a template — JavaScript, Python, Jinja —
 * opened read-only in the code view, with the reason it isn't a form (T146,
 * AC-140; spec Non-goals: dynamic models are read-only). Its text is shown,
 * to be read and copied; publishing takes plain YAML only (T142).
 */
const NOTHING = () => undefined;

export function ReadOnlyFile({
  path,
  content,
  code,
}: {
  path: string;
  content: string;
  code: NonNullable<FileObjects['code']>;
}) {
  return (
    <div className="model-readonly">
      <p role="note" className="model-readonly__why">
        {codeNoteOf(path, code)} It opens read-only here: the form edits plain YAML, and wechart
        publishes no {code === 'Jinja' ? 'templates' : 'code'}, which Cube would run.
      </p>
      <YamlEditor
        value={content}
        onChange={NOTHING}
        label={`${path}, read-only`}
        readOnly
        // Jinja is YAML around its tags; JavaScript and Python have no grammar here.
        language={code === 'Jinja' ? 'yaml' : 'plain'}
      />
    </div>
  );
}
