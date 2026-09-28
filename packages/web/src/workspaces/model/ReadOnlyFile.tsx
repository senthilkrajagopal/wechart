import { InfoBar } from '../../shell/InfoBar';
import { codeNoteOf } from './FileList';
import type { FileObjects } from './objects';
import { YamlEditor } from './YamlEditor';

/**
 * A model file that is code or a template — JavaScript, Python, Jinja —
 * opened read-only in the code view, with the reason it isn't a form (T146,
 * AC-140; spec Non-goals: dynamic models are read-only). Its text is shown,
 * to be read and copied; publishing takes plain YAML only (T142).
 *
 * In the editor's frame (T483, MW-16): headed by its path and its state —
 * read-only, with the lock, and what it is; the note an InfoBar; the code
 * across the pane, as there is no form, with line numbers and wrap.
 */
const NOTHING = () => undefined;

const KINDS: Readonly<Record<NonNullable<FileObjects['code']>, string>> = {
  Jinja: 'Jinja template',
  JavaScript: 'JavaScript',
  Python: 'Python',
};

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
    <div className="model-page__solo model-readonly">
      <div className="model-editor__head">
        <h1 className="model-editor__path" data-testid="selected-object" title={path}>
          {path}
        </h1>
        {/* A state, with its icon and in words (rule 3). */}
        <span className="model-editor__state">
          <span className="secret-pasted__lock" aria-hidden="true" />
          Read-only · {KINDS[code]}
        </span>
      </div>
      <div className="model-readonly__note">
        <InfoBar>
          {/* Why it isn't a form, as AC-140 asks (T483's review). */}
          <p>{codeNoteOf(path, code)} It opens read-only here: the form edits plain YAML only.</p>
        </InfoBar>
      </div>
      <div className="model-readonly__code">
        <YamlEditor
          value={content}
          onChange={NOTHING}
          label={`${path}, read-only`}
          readOnly
          wrap
          // Jinja is YAML around its tags; JavaScript and Python have no grammar here.
          language={code === 'Jinja' ? 'yaml' : 'plain'}
        />
      </div>
    </div>
  );
}
