import { useEffect, useRef, useState } from 'react';

/**
 * Creating a folder, dashboard or chart in the selected folder (AC-020).
 *
 * The new object is placed in whichever folder is selected and then opened —
 * creating something and leaving the user where they were makes them hunt for
 * it.
 */
export type CreatableKind = 'folder' | 'dashboard' | 'chart';

export interface CreateMenuProps {
  readonly folderId: string;
  readonly onCreate: (kind: CreatableKind, title: string) => Promise<void> | void;
  readonly busy?: boolean;
}

const LABELS: Record<CreatableKind, string> = {
  folder: 'New folder',
  dashboard: 'New dashboard',
  chart: 'New chart',
};

export function CreateMenu({ folderId, onCreate, busy = false }: CreateMenuProps) {
  const [kind, setKind] = useState<CreatableKind | null>(null);
  const [title, setTitle] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  // Focus moves to the name field because the user just asked to create
  // something and typing a name is the next step. That is focus management in
  // response to an action, not `autoFocus` stealing focus on load.
  useEffect(() => {
    if (kind) titleRef.current?.focus();
  }, [kind]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!kind || title.trim() === '') return;
    await onCreate(kind, title.trim());
    setKind(null);
    setTitle('');
  };

  if (!kind) {
    return (
      <div className="create-menu">
        {(Object.keys(LABELS) as CreatableKind[]).map((option) => (
          <button key={option} type="button" onClick={() => setKind(option)}>
            {LABELS[option]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <form className="create-menu" onSubmit={submit} aria-label={LABELS[kind]}>
      <label htmlFor="create-title">{LABELS[kind]} in this folder</label>
      <input
        id="create-title"
        name="title"
        ref={titleRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        data-folder={folderId}
      />
      <button type="submit" disabled={busy || title.trim() === ''}>
        Create
      </button>
      <button type="button" onClick={() => setKind(null)}>
        Cancel
      </button>
    </form>
  );
}
