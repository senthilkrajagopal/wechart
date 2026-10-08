import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker, useRouter, type ShouldBlockFn } from '@tanstack/react-router';

import { PencilIcon } from '../../dashboard/edit/EditChrome';
import { META_QUERY } from '../../query/meta';
import { InfoBar } from '../../shell/InfoBar';
import { ME_QUERY } from '../../shell/me';
import { MenuButton, type MenuItem } from '../../shell/MenuButton';
import { NotFound } from '../../shell/NotFound';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { AccessIcon } from '../explore/AccessChip';
import { AccessRefused, folderAccessQuery } from '../explore/access/AccessPanel';
import { rightFrom } from '../explore/folderRole';
import { exploreHref, folderChain, FOLDERS_QUERY, targetPathOf } from '../explore/folders';
import { DeleteDialog } from '../explore/DeleteDialog';
import { checkModel, removeModel } from '../explore/deleteChecks';
import { sayOnExplore } from '../explore/deletedToast';
import { NewItemDialog, type Target } from '../explore/NewItemDialog';
import { PopOut } from '../../shell/PopOut';
import { isMyWorkspace, MY_WORKSPACE, SHARED_ROOT } from '../explore/roots';
import { ALL_MODEL_FILES_QUERY, FileList, modelFilesQuery, ModelFilesNotFound } from './FileList';
import { GenerateCubes, generateWith } from './GenerateCubes';
import { FileTree } from './FileTree';
import {
  fileHref,
  folderWordsOf,
  homesOf,
  modelAccessOf,
  modelHref,
  modelsAreWorkspaceOnly,
  shownMemberOf,
} from './inFolder';
import { objectsOf } from './objects';
import { CubeForm } from './form/CubeForm';
import { JoinEditor } from './JoinEditor';
import { joinGraphOf } from './joinGraph';
import { lossOf, type Loss } from './lossCheck';
import { LossWarning } from './LossWarning';
import { problemsOf, type Problem } from './problems';
import { ProblemsPanel, type CubeProblem } from './ProblemsPanel';
import { draftJoinsOf } from './draftJoins';
import { editedMembersOf, landedEditsOf, placesOf } from './editedMembers';
import { ReadOnlyFile } from './ReadOnlyFile';
import { RequestPane } from './RequestPane';
import { ReferencesWarning, type MemberReferences } from './ReferencesWarning';
import { publishModel, referencesTo, refusedText } from './publish';
import { modelOf, withObject } from './sync';
import { DataSourcesContext } from './form/dataSources';
import { memberIndexOf, PickerScopeContext } from './form/scopes';
import { validationProblems } from './validate';
import { YamlEditor } from './YamlEditor';
import { annotationsOf } from './annotations';
import { AnnotationsBar } from './AnnotationsBar';
import { memberLines } from './memberLines';
import {
  copyModelToWorkspace,
  declaredNameOf,
  draftTargetOf,
  copyOf,
  filesBeside,
  keepDraftTarget,
  namedFileOf,
  namesFixedFor,
  savedTargetOf,
  targetsOf,
} from './workspaceModels';
import { RequestChange } from './RequestChange';
import { UseInWorkspaceDialog } from './UseInWorkspaceDialog';

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

/**
 * The files whose notes bar was hidden (T482): hidden for the tab, as the
 * refused rollups are kept, so it doesn't come back on each opening. Storage
 * may be refused; it is then hidden on this page only.
 */
const NOTES_HIDDEN = 'wechart.model.notesHidden';

function notesHidden(path: string): boolean {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(NOTES_HIDDEN) ?? '[]');
    return Array.isArray(kept) && kept.includes(path);
  } catch {
    return false;
  }
}

function hideNotes(path: string) {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(NOTES_HIDDEN) ?? '[]');
    const paths = Array.isArray(kept) ? kept.filter((each) => typeof each === 'string') : [];
    sessionStorage.setItem(NOTES_HIDDEN, JSON.stringify([...new Set([...paths, path])]));
  } catch {
    // Hidden on this page only.
  }
}

/** The member a form has open, by its place in the file, for the YAML to tint (T482). */
interface OpenMember {
  readonly list: 'cubes' | 'views';
  readonly at: number;
  readonly key: string;
  readonly index: number;
}

/** A problem that stops the file being read and published; a warning does not (AC-223). */
const isError = (problem: Problem) => problem.severity !== 'warning';

interface ModelFile {
  readonly path: string;
  readonly content: string;
}
const NO_DRAFTS: readonly ModelFile[] = [];

const ROOT = SHARED_ROOT.id;

/**
 * Where a model is open (T342; AC-222, rules 70 and 71): its folder — the
 * shared root's in the Model workspace — each of its files' addresses, and
 * whether it may be changed here. Read-only, it says where it is, and offers
 * "Edit in my workspace" to those who could propose it back.
 */
interface Place {
  readonly folderId: string;
  readonly hrefOf: (path: string) => string;
  readonly readOnly: boolean;
  readonly editInWorkspace: boolean;
  /** "Use in my workspace" for one who may only read it (T543, AC-283). */
  readonly useInWorkspace: boolean;
  /** My workspace, or a folder in it (T347): saved through its overlay, never published. */
  readonly inWorkspace: boolean;
  /** The folder as Explore says it: "Sales / EMEA", or "Shared"; none until the folders are read. */
  readonly words: string | undefined;
}

/** The files whose notes bar was hidden, by where each is: one path in two folders is two files. */
const notesKeyOf = (folderId: string, path: string) =>
  folderId === ROOT ? path : `${folderId}/${path}`;

/**
 * A read-only model's word for where it is, with the eye (design 03 of
 * 2026-09-27, state A): its folder once the folders are read.
 */
function ReadOnlyBadge({ words }: { words: string | undefined }) {
  return (
    <span className="badge model-editor__read-only">
      <AccessIcon name="eye" />
      {words === undefined ? 'Read-only' : `Read-only · in ${words}`}
    </span>
  );
}

/**
 * "Edit in my workspace" (rule 71; T347, AC-278), as a read-write member of
 * a shared folder is offered it: the file copied into My workspace, or the
 * copy already there, opened there. A refusal is said under the head, which
 * the button then names as its description.
 */
function EditInWorkspace({
  folderId,
  path,
  refusalId,
  onRefused,
}: {
  folderId: string;
  path: string;
  refusalId: string;
  onRefused: (why: string | undefined) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [copying, setCopying] = useState(false);
  return (
    <button
      type="button"
      className="btn-sm btn-primary model-editor__copy"
      disabled={copying}
      aria-describedby={refusalId}
      onClick={() => {
        setCopying(true);
        onRefused(undefined);
        void copyModelToWorkspace(folderId, path).then((copied) => {
          if ('error' in copied) {
            setCopying(false);
            onRefused(copied.error);
            return;
          }
          // Its project folder is new: the tree and the workspace read it afresh.
          void queryClient.invalidateQueries({ queryKey: ['folders'] });
          void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
          void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
          router.history.push(fileHref(copied.path, copied.folderId));
        });
      }}
    >
      <PencilIcon />
      {copying ? 'Copying…' : 'Edit in my workspace'}
    </button>
  );
}

/**
 * "Use in my workspace" (T543, AC-283; R53), as one who may only read the
 * model's folder is offered it: the file is copied into My workspace for
 * use, or the copy already there opened there. It is proposed to no folder,
 * so no folder is asked for (T717, R73).
 */
function UseInWorkspace({
  folderId,
  path,
  words,
}: {
  folderId: string;
  path: string;
  words: string | undefined;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [failure, setFailure] = useState<string>();
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="btn-sm btn-primary model-editor__copy"
        onClick={() => {
          setFailure(undefined);
          setAsking(true);
        }}
      >
        <PencilIcon />
        Use in my workspace
      </button>
      {asking ? (
        <UseInWorkspaceDialog
          path={path}
          folderWords={words}
          busy={copying}
          failure={failure}
          onClose={() => {
            setAsking(false);
            button.current?.focus();
          }}
          onCopy={() => {
            setCopying(true);
            setFailure(undefined);
            void copyModelToWorkspace(folderId, path).then((copied) => {
              setCopying(false);
              if ('error' in copied) {
                setFailure(copied.error);
                return;
              }
              // Its project folder is new: the tree and the workspace read it afresh.
              void queryClient.invalidateQueries({ queryKey: ['folders'] });
              void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
              void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
              router.history.push(fileHref(copied.path, copied.folderId));
            });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Delete *file*…, in the model page's header ⋯ (T526, AC-365; design 14,
 * state D1): for those who may change its folder, since a delete is direct
 * (AC-291) though a shared model is read-only here. It asks first what
 * depends on its cube (D2); deleted, its folder opens in Explore, saying so.
 */
function DeleteModelMenu({ path, where }: { path: string; where: Place }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const folders = useQuery(FOLDERS_QUERY);
  const [deleting, setDeleting] = useState(false);
  const more = useRef<HTMLSpanElement>(null);
  const name = path.split('/').at(-1) ?? path;
  const pathOf = (id: string) => targetPathOf(folders.data ?? [], id);
  return (
    <>
      <span ref={more}>
        <MenuButton
          label={`More actions for ${name}`}
          className="btn-ghost btn-sm"
          items={[
            {
              key: 'delete',
              label: `Delete ${name}…`,
              danger: true,
              onSelect: () => {
                setDeleting(true);
              },
            },
          ]}
        >
          <span aria-hidden="true">⋯</span>
        </MenuButton>
      </span>
      {deleting ? (
        <DeleteDialog
          name={name}
          action="Delete model"
          check={checkModel(where.folderId, path, pathOf)}
          remove={removeModel(where.folderId, path, pathOf)}
          onDeleted={() => {
            setDeleting(false);
            sayOnExplore(`Deleted “${name}”.`);
            void queryClient.invalidateQueries({
              queryKey: modelFilesQuery(where.folderId).queryKey,
            });
            void queryClient.invalidateQueries({ queryKey: META_QUERY.queryKey });
            void queryClient.invalidateQueries({ queryKey: ['folder-contents'] });
            void queryClient.invalidateQueries({ queryKey: ['folders'] });
            void queryClient.invalidateQueries({ queryKey: ['folder-roots'] });
            router.history.push(exploreHref(where.folderId));
          }}
          onClose={() => {
            setDeleting(false);
            more.current?.querySelector<HTMLButtonElement>('button')?.focus();
          }}
        />
      ) : null}
    </>
  );
}

/** Why the copy wasn't made, under the head, in the API's words. */
function CopyRefused({ id, why }: { id: string; why: string }) {
  return (
    <p id={id} role="alert" className="model-editor__with model-editor__blocked">
      {why}
    </p>
  );
}

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
  fresh = false,
  drafts = NO_DRAFTS,
  onPublished,
  where,
}: {
  path: string;
  content: string;
  /** Where the file is, and whether it may be changed here (T342). */
  where: Place;
  /** Just made by New view: opens on its Cubes, a new one ready to pick (T493). */
  fresh?: boolean;
  /** The model's other unpublished files: those this one's cubes join publish with it (T488). */
  drafts?: readonly ModelFile[];
  /** The files a save published: this one and the drafts it joins (T488). */
  onPublished?: ((files: readonly ModelFile[]) => void) | undefined;
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
    /**
     * Saved in My workspace: the shared folder it lands in, whose members it
     * edits, and that folder's path as the warning says it (T546, R55).
     */
    landing?: { readonly folderId: string; readonly words: string };
    /** Each cube's folder, by its one name, from the model's files (T710). */
    homeOf: (cube: string) => string | undefined;
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
      // Said in the form: shown, below 1,280 px, where it can be read (T487's review).
      setShown('form');
      return 'refused';
    }
    const lost = lossOf(read, written);
    if (lost.length > 0) {
      setPending({ written, lost });
      setShown('form');
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
  // And always where the model is shared (T342, rule 71).
  const readOnly =
    where.readOnly || errors.length > 0 || text !== read || pending !== null || references !== null;
  /** Where a picked problem sends the editor's cursor. */
  const [goTo, setGoTo] = useState<{ at: number }>();
  const [first] = errors;

  /** The right pane: the YAML, or the join diagram (T144). */
  const [view, setView] = useState<'yaml' | 'joins'>('yaml');
  /** The right pane popped out into a larger dialog (T600, AC-420), and its control. */
  const [poppedOut, setPoppedOut] = useState(false);
  const popButton = useRef<HTMLButtonElement>(null);
  /** Soft wrap, on by default (design 03 note 8). */
  const [wrap, setWrap] = useState(true);
  /**
   * Below 1,280 px, one pane at a time (T487, MW-26; direction §2): the form,
   * or the code. Wider, both show, and this is not asked.
   */
  const [shown, setShown] = useState<'form' | 'yaml'>(() => {
    // A file with no form yet — it doesn't parse — opens on its code (T487's review).
    const opened = modelOf(content).model;
    return entriesOf(opened?.cubes).length + entriesOf(opened?.views).length === 0
      ? 'yaml'
      : 'form';
  });
  const editorRoot = useRef<HTMLDivElement>(null);
  /**
   * The switch, in the editor's head, which stays in both: the path, the
   * state, Discard and Save with it (T487's review). Shown only below 1,280
   * px, by the stylesheet.
   */
  const switcher = (
    <div className="seg model-editor__switch" role="group" aria-label="Show">
      {(['form', 'yaml'] as const).map((each) => (
        <button
          key={each}
          type="button"
          aria-pressed={shown === each}
          onClick={() => {
            setShown(each);
          }}
        >
          {each === 'form' ? 'Form' : 'YAML'}
        </button>
      ))}
    </div>
  );

  /**
   * What a form edit could lose, said upfront (T482, design 03 note 4): the
   * file's comments, anchors and aliases, as the YAML has them now. Each is
   * flagged in the gutter; "Show in YAML" tints them and brings the first
   * into view (note 9).
   */
  const annotations = useMemo(() => annotationsOf(text), [text]);
  const notesKey = notesKeyOf(where.folderId, path);
  const [notesShut, setNotesShut] = useState(() => notesHidden(notesKey));
  const [notesShown, setNotesShown] = useState(false);
  const [reveal, setReveal] = useState<{ line: number }>();
  const flagged = useMemo(() => annotations.map((each) => each.from), [annotations]);
  const noted = useMemo(
    () =>
      notesShown
        ? annotations.flatMap((each) =>
            Array.from({ length: each.to - each.from + 1 }, (_, n) => each.from + n),
          )
        : [],
    [annotations, notesShown],
  );
  const notesBar =
    notesShut || annotations.length === 0 ? null : (
      <AnnotationsBar
        annotations={annotations}
        onShow={() => {
          setView('yaml');
          setShown('yaml');
          setNotesShown(true);
          const [firstNote] = annotations;
          if (firstNote !== undefined) setReveal({ line: firstNote.from });
          // Below 1,280 px the bar goes with the form: focus to the code it shows (T487's review).
          setTimeout(() => {
            const pressed = document.activeElement;
            if (pressed instanceof HTMLElement && pressed.offsetParent === null)
              editorRoot.current
                ?.querySelector<HTMLElement>('.model-editor__yaml .cm-content')
                ?.focus();
          }, 0);
        }}
        onHide={() => {
          hideNotes(notesKey);
          setNotesShut(true);
          setNotesShown(false);
        }}
      />
    );
  /** The member a form has open, its lines tinted in the YAML (note 9). */
  const [openMember, setOpenMember] = useState<OpenMember | null>(null);
  const tinted = useMemo(
    () =>
      openMember === null
        ? []
        : memberLines(text, openMember.list, openMember.at, openMember.key, openMember.index),
    [text, openMember],
  );
  /** A form's member opened or closed: closing clears the tint only when it is that form's. */
  const openIn = (list: 'cubes' | 'views', at: number) => (key: string, index: number | null) => {
    setOpenMember((now) =>
      index !== null
        ? { list, at, key, index }
        : now !== null && now.list === list && now.at === at
          ? null
          : now,
    );
  };
  // The folder's files: the model this one is in (T342).
  const allFiles = useQuery(modelFilesQuery(where.folderId));
  // To name the folder of a refusal about another folder's file (T450's review).
  const folders = useQuery(FOLDERS_QUERY);
  /**
   * The data sources Cube has, for a cube's Data source to be picked from
   * (T481, design 03 state B) — as Generate cubes lists them. Not readable
   * (a user without the route, Cube down): the field is typed.
   */
  const sources = useQuery({
    queryKey: ['introspection-sources'],
    queryFn: async (): Promise<string[]> => {
      const response = await fetch('/api/introspection/sources');
      if (!response.ok)
        throw new Error(`The data sources could not be read (${String(response.status)}).`);
      const body = (await response.json()) as { dataSources?: { dataSource: string }[] };
      return (body.dataSources ?? []).map((each) => each.dataSource);
    },
    retry: false,
    staleTime: 60_000,
  });
  /**
   * In My workspace, the shared folder this file goes to and each above it,
   * the root's included: where its names resolve once it lands, after the
   * workspace's own (T347, R53). What its joins and pickers may name too
   * (AC-138, AC-224), now every shared model is changed there (T451's
   * switch). A cube or view the workspace's files declare is theirs.
   */
  const landsIn = useQuery({
    queryKey: ['model-lands-in', where.folderId, path, published],
    queryFn: async () =>
      (published
        ? await savedTargetOf(where.folderId, path)
        : draftTargetOf(where.folderId, path)) ?? null,
    enabled: where.inWorkspace,
    retry: false,
  });
  /**
   * A copy of a landed file, saved in My workspace: a use-only one's page
   * offers "Request a change" (T717, AC-283); either keeps its original's
   * name (T722, AC-423).
   */
  const copy = useQuery({
    queryKey: ['model-copy-of', where.folderId, path],
    queryFn: () => copyOf(where.folderId, path),
    enabled: where.inWorkspace && published,
    retry: false,
  });
  /**
   * Its cubes' and views' names are fixed where they have landed: the file in
   * its shared folder, or an edit copy of it in My workspace (T722, AC-423).
   * A draft's, and a use-only copy's, stay editable (`namesFixedFor`).
   */
  const namesFixed = namesFixedFor({
    inWorkspace: where.inWorkspace,
    published,
    copy: copy.data,
  });
  const everyFile = useQuery({
    ...ALL_MODEL_FILES_QUERY,
    enabled: where.inWorkspace && landsIn.data != null,
  });
  /** The folders on the path of the folder it goes to; none outside My workspace. */
  const onPath = useMemo(() => {
    const target = landsIn.data;
    return !where.inWorkspace || target == null || everyFile.data === undefined
      ? new Set<string>()
      : new Set(placesOf(folders.data ?? []).pathOf(target));
  }, [where.inWorkspace, landsIn.data, everyFile.data, folders.data]);
  /**
   * The model's join graph, with this file as the form has it now (AC-138):
   * worked out only while the diagram shows, the other files once each —
   * the model as the tree shows it, its stored files and its other drafts,
   * which publish with this one when it joins them (T488's review); in My
   * workspace, and the shared model on the path it goes to (`filesBeside`).
   */
  const modelFiles = useMemo(
    () =>
      filesBeside({
        open: path,
        own: [...(allFiles.data ?? []), ...drafts],
        shared: everyFile.data ?? [],
        onPath,
      }),
    [allFiles.data, drafts, everyFile.data, onPath, path],
  );
  const others = useMemo(
    () => (view === 'joins' ? joinGraphOf(modelFiles) : undefined),
    [view, modelFiles],
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
  const othersIndex = useMemo(() => memberIndexOf(modelFiles), [modelFiles]);
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
  /** What a use-only copy's "Request a change" asks about: its saved file's cube or view (T717). */
  const requestable = useMemo(() => declaredNameOf(saved), [saved]);
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
    // A name outside R72's grammar is wechart's to refuse: never sent (T723, AC-426).
    !invalid.some((problem) => problem.holds === true) &&
    pending === null &&
    references === null &&
    !publishing;
  /**
   * The unpublished files this one's cubes join, by the text as last read:
   * published with it in one publish, and named beside Save before it is
   * pressed (T488, AC-346).
   */
  const joined = useMemo(() => {
    const paths = draftJoinsOf({ path, content: read }, allFiles.data ?? [], drafts);
    return paths.flatMap((each) => drafts.filter((draft) => draft.path === each));
  }, [path, read, allFiles.data, drafts]);
  const withId = useId();
  const copyRefusalId = useId();
  /** Why "Edit in my workspace" made no copy, until it is pressed again (T347). */
  const [copyRefused, setCopyRefused] = useState<string>();

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
  /**
   * A question the page asks beside the form — leaving with changes, an edit
   * held or refused, the charts a save would change — puts a popped-out pane
   * back first, so it isn't asked behind the dialog (T600's review).
   */
  const asking = leave === 'blocked' || pending !== null || refused !== null || references !== null;
  const [wasAsking, setWasAsking] = useState(asking);
  if (asking !== wasAsking) {
    setWasAsking(asking);
    if (asking) setPoppedOut(false);
  }
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
    // The tree is this folder's files: another folder's file of the same
    // path is not one of them (T450's review, T342).
    for (const problem of [...cubeProblems, ...refusedRollups])
      if ((problem.folderId ?? ROOT) === where.folderId)
        byPath[problem.path] = (byPath[problem.path] ?? 0) + 1;
    reportProblems.current?.(byPath);
  }, [path, ownErrors, cubeProblems, refusedRollups, where.folderId]);

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
      const unchecked = () => {
        setPublishing(false);
        setOutcome({
          ok: false,
          text: 'What uses the changed members could not be checked, so nothing was saved.',
        });
      };
      // In My workspace nothing is published: the shared charts and
      // dashboards its landing would change, in the folder it goes to, are
      // what is listed (T546, AC-141, R55). One going nowhere lands nowhere.
      let landsIn: string | undefined;
      if (where.inWorkspace)
        try {
          landsIn = published
            ? await savedTargetOf(where.folderId, path)
            : draftTargetOf(where.folderId, path);
        } catch {
          unchecked();
          return;
        }
      // Across the whole model: a view in another file exposes a cube's
      // member by a name of its own (T147's review) — and a view or an
      // extending cube in another folder, by its own (T342, T710). Every
      // folder's files the user may see, as they are now.
      let every: readonly (ModelFile & { readonly folderId?: string })[] = [];
      let known: Awaited<ReturnType<(typeof FOLDERS_QUERY)['queryFn']>> = [];
      if (!where.inWorkspace || landsIn !== undefined)
        try {
          [every, known] = await Promise.all([
            queryClient.fetchQuery(ALL_MODEL_FILES_QUERY),
            queryClient.fetchQuery(FOLDERS_QUERY),
          ]);
        } catch {
          unchecked();
          return;
        }
      const places = placesOf(known);
      let edited: string[] = [];
      if (!where.inWorkspace) {
        const own = { folderId: where.folderId, path };
        const others = every.filter(
          (file) => (file.folderId ?? ROOT) !== where.folderId || file.path !== path,
        );
        edited = editedMembersOf(
          [...others, { ...own, content: saved }],
          [...others, { ...own, content: sent }],
          places,
        );
      } else if (landsIn !== undefined)
        edited = landedEditsOf(every, { landsIn, path, content: sent }, places);
      if (edited.length > 0) {
        const found = await referencesTo(edited);
        if (found === undefined) {
          unchecked();
          return;
        }
        if (found.charts.length + found.dashboards.length > 0) {
          setPublishing(false);
          setReferences({
            found,
            text: sent,
            homeOf: homesOf(every, (folderId) => places.prefixOf(folderId) !== undefined),
            ...(landsIn === undefined
              ? {}
              : {
                  landing: {
                    folderId: landsIn,
                    words: folderWordsOf(landsIn, known) ?? SHARED_ROOT.title,
                  },
                }),
          });
          setShown('form');
          return;
        }
      }
    }
    // With the drafts it joins, in one publish, so the joins compile (AC-346);
    // each new file refused over a file or a name the model has (AC-249).
    // A new file in My workspace goes where it was asked to when made (T347, AC-282).
    const target = where.inWorkspace ? draftTargetOf(where.folderId, path) : undefined;
    const result = await publishModel([{ path, content: sent }, ...joined], {
      created: [...(published ? [] : [path]), ...joined.map((each) => each.path)],
      // Into its own folder (T452, T342).
      folderId: where.folderId === ROOT ? undefined : where.folderId,
      ...(published || target === undefined ? {} : { targetFolderId: target }),
    });
    setPublishing(false);
    if (result.kind === 'published') {
      setSaved(sent);
      // Stored now, drafts no longer: said at once, not once the files are read again (T488's review).
      onPublished?.([{ path, content: sent }, ...joined]);
      setCubeProblems([]);
      setRefusedRollups(keepRefusedRollups([]));
      setOutcome({
        ok: true,
        text: where.inWorkspace
          ? 'Saved. Previews in My workspace use it now.'
          : 'Published. Cube is reading the new model.',
      });
      void queryClient.invalidateQueries({ queryKey: modelFilesQuery(where.folderId).queryKey });
      // The listing, every folder's, and every field list, read the model afresh (AC-137).
      void queryClient.invalidateQueries({ queryKey: modelFilesQuery(ROOT).queryKey });
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
        // wechart's refusal, not Cube's, when every problem is a rollup's unknown names
        // (AC-189); a rollup whose cubes Cube can't join is said as that (AC-235); and
        // the breaks in folders the user can't see, counted (T427, AC-322).
        text: refusedText(result.problems, result.hidden),
      });
    } else {
      setOutcome({ ok: false, text: result.message });
    }
  };

  return (
    <div ref={editorRoot} className="model-editor" data-shown={shown}>
      {/*
        Two full-height panes, each with its own header row and scrolling
        (AC-223), as the prototype's (model.js, `mount`): the form, headed by
        the file and its one action; and the code, headed by its view, with
        Problems docked beneath it.
      */}
      <section className="model-editor__pane" aria-label="Form editor">
        <div className="model-editor__head">
          {/* It names the object the URL selected, as every deep link does (AC-002):
              the editor's head, at design 03's 13/600 (T479, D1). */}
          <h1 className="model-editor__path" data-testid="selected-object" title={path}>
            {path}
          </h1>
          {/* The file's state, with its icon and in words (AC-226; direction.md
              rule 3; design 03 note 2 and state C). A state the head keeps, not
              news: no live region to announce it. Just published, the outcome
              says it instead, the one line the head has room for (T479's review). */}
          {where.readOnly ? (
            // Shared: where it is, read-only (T342; design 03 of 2026-09-27, state A).
            <ReadOnlyBadge words={where.words} />
          ) : outcome?.ok === true && !changed ? null : (
            <span
              className={`model-editor__state${published && !changed ? ' model-editor__state--ok' : ''}`}
            >
              <StatusIcon kind={published && !changed ? 'ok' : 'idle'} />
              {where.inWorkspace
                ? // Saved in My workspace, never published (T347).
                  !published
                  ? 'New file · not saved'
                  : changed
                    ? 'Unsaved changes'
                    : 'Saved · no changes'
                : !published
                  ? 'New file · not published'
                  : changed
                    ? 'Unpublished changes'
                    : 'Published · no changes'}
            </span>
          )}
          {/* Edited since: "Published" no longer holds, and only the state is said. */}
          {outcome === null || (outcome.ok && changed) ? null : (
            <StateLine
              kind={outcome.ok ? 'ok' : 'err'}
              className={`model-editor__outcome${outcome.ok ? '' : ' model-editor__outcome--failed'}`}
            >
              {outcome.text}
            </StateLine>
          )}
          {switcher}
          {where.readOnly ? (
            // No change in place: a copy in My workspace, for those who may make one (rule 71).
            where.editInWorkspace ? (
              <EditInWorkspace
                folderId={where.folderId}
                path={path}
                refusalId={copyRefusalId}
                onRefused={setCopyRefused}
              />
            ) : where.useInWorkspace ? (
              <UseInWorkspace folderId={where.folderId} path={path} words={where.words} />
            ) : null
          ) : (
            <>
              {/* Proposed to no folder, a use-only copy asks its cube's folder
                  for a change instead (T717, AC-283; R73): about the cube or
                  view its saved file holds, its original's name. */}
              {copy.data?.useOnly === true && requestable !== undefined ? (
                <RequestChange cube={requestable} cubeTitle={requestable} />
              ) : null}
              {copy.isError ? (
                <StateLine kind="err" className="model-editor__with model-editor__blocked">
                  {copy.error.message}
                </StateLine>
              ) : null}
              {/* Both always there, as design 03 draws them; pressed only with a
                  change (D2) — a file made here always has one to discard. */}
              <button
                type="button"
                className="btn-sm model-editor__discard"
                disabled={published ? !changed : onDiscard === undefined}
                onClick={discard}
              >
                Discard
              </button>
              <button
                ref={saveButton}
                type="button"
                className="btn-sm btn-primary"
                aria-describedby={joined.length === 0 ? undefined : withId}
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
                ) : where.inWorkspace ? (
                  // Nothing is published from My workspace (T347).
                  'Save'
                ) : (
                  'Save & reload Cube'
                )}
              </button>
            </>
          )}
          {/* A published file, for those who may change its folder (design 14,
              D1); not while it has unpublished changes, which Discard or Save
              settles first (T526's review: leaving would ask about a file gone). */}
          {published && !changed && (!where.readOnly || where.editInWorkspace) ? (
            <DeleteModelMenu path={path} where={where} />
          ) : null}
        </div>
        {where.readOnly && where.editInWorkspace && copyRefused !== undefined ? (
          <CopyRefused id={copyRefusalId} why={copyRefused} />
        ) : null}
        {/* What Save publishes besides this file, said under it before it is
            pressed, whole on its own line (AC-346; T488's review). */}
        {joined.length === 0 ? null : (
          <p id={withId} className="model-editor__with">
            Saves with{' '}
            {joined.map((each, at) => (
              <span key={each.path}>
                {at === 0 ? '' : at === joined.length - 1 ? ' and ' : ', '}
                <span className="is-code">{each.path}</span>
              </span>
            ))}
            , which {joined.length === 1 ? 'defines a cube' : 'define cubes'} this file joins.
          </p>
        )}
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
              landsIn={references.landing?.words}
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
              // Each member by its one name (T710, AC-328), with its cube's
              // folder where that isn't the folder the model lands in, from
              // My workspace (T546), or the one open (T342, AC-329).
              nameOf={(member) =>
                shownMemberOf(
                  member,
                  references.landing?.folderId ?? where.folderId,
                  folders.data ?? [],
                  references.homeOf,
                )
              }
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
                The YAML doesn’t parse (line {first.line}).
                {/* Shared, it isn't fixed here (T342). */}
                {where.readOnly
                  ? null
                  : cubes.length + views.length > 0
                    ? ' The form is read-only until the code is fixed.'
                    : // Broken when it was opened: there is no form yet to hold.
                      ' Its form shows once the code is fixed.'}
              </span>
            </p>
          )}
          {/* No form to put it under yet: the file's notes are said all the same. */}
          {cubes.length + views.length === 0 ? notesBar : null}
          {/* Its pickers list what the model has (AC-224). */}
          <DataSourcesContext.Provider value={sources.data}>
            <PickerScopeContext.Provider value={pickers}>
              {cubes.map(({ at, value }, place) => (
                <CubeForm
                  // The cube's place in the file: its name is a field it edits.
                  key={`cube ${String(at)}`}
                  kind="cube"
                  value={value}
                  readOnly={readOnly}
                  nameFixed={namesFixed}
                  // The file's notes, under the first form's tabs (design 03 note 4).
                  banner={place === 0 ? notesBar : null}
                  onOpenMember={openIn('cubes', at)}
                  // Opened from Schedules on this cube's pre-aggregations (T160).
                  {...(openOn !== undefined && openOn.cube === value['name']
                    ? { initialTab: openOn.tab, initialMember: openOn.member }
                    : {})}
                  // Its rollups a publish was refused for, on their rows (T207, AC-189).
                  rollupProblems={refusedRollups.filter(
                    (problem) =>
                      (problem.folderId ?? ROOT) === where.folderId &&
                      problem.path === path &&
                      problem.preAggregation?.cube === value['name'],
                  )}
                  onChange={(next) => {
                    edit('cubes', at, next);
                  }}
                />
              ))}
              {views.map(({ at, value }, place) => (
                <CubeForm
                  key={`view ${String(at)}`}
                  kind="view"
                  value={value}
                  readOnly={readOnly}
                  nameFixed={namesFixed}
                  // New, it opens on its Cubes with one ready to pick (T493, MW-19).
                  addingOn={fresh && place === 0 ? 'cubes' : undefined}
                  banner={place === 0 && cubes.length === 0 ? notesBar : null}
                  onOpenMember={openIn('views', at)}
                  onChange={(next) => {
                    edit('views', at, next);
                  }}
                />
              ))}
            </PickerScopeContext.Provider>
          </DataSourcesContext.Provider>
        </div>
      </section>
      <section className="model-editor__pane model-editor__yaml" aria-label="YAML and join diagram">
        {/* Popped out into a larger dialog and back, the same pane moved, so
            nothing in it is reset (T600, AC-420; R58). */}
        <PopOut
          out={poppedOut}
          onClose={() => {
            setPoppedOut(false);
          }}
          label={`${path} · YAML and join diagram`}
          className="model-editor__popped model-editor__yaml"
          returnFocus={popButton}
        >
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
            {/* Soft wrap, so long descriptions and comments stay in the pane (note 8). */}
            {view === 'yaml' ? (
              <button
                type="button"
                className="btn-sm btn-ghost model-editor__wrap"
                aria-pressed={wrap}
                onClick={() => {
                  setWrap(!wrap);
                }}
              >
                <span aria-hidden="true">↵ </span>Wrap
              </button>
            ) : null}
            <button
              ref={popButton}
              type="button"
              className="btn-sm btn-ghost model-editor__pop"
              aria-pressed={poppedOut}
              title={poppedOut ? 'Put it back in its place' : 'Show it in a larger view'}
              onClick={() => {
                setPoppedOut(!poppedOut);
              }}
            >
              <span aria-hidden="true">{poppedOut ? '⤡ ' : '⤢ '}</span>
              {poppedOut ? 'Pop back in' : 'Pop out'}
            </button>
          </div>
          <div className="model-editor__code">
            {view === 'joins' && graph !== undefined ? (
              <JoinEditor
                graph={graph}
                cube={cubeNames[0]}
                cubes={cubeNames}
                // Its cubes' files are this folder's (T342's review).
                hrefOf={where.hrefOf}
                // Locked as the form is (AC-135): an edit then would be written over the typing.
                readOnly={readOnly}
                onAdd={(name, join) => {
                  const entry = cubes.find(({ value }) => value['name'] === name);
                  if (entry === undefined) return false;
                  const joins = Array.isArray(entry.value['joins'])
                    ? (entry.value['joins'] as unknown[])
                    : [];
                  return (
                    edit('cubes', entry.at, { ...entry.value, joins: [...joins, join] }) ===
                    'applied'
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
                // Shared, it is read, not typed in (T342): fixed for the editor's
                // life, which is keyed by it.
                readOnly={where.readOnly}
                problems={listed}
                goTo={goTo}
                wrap={wrap}
                tinted={tinted}
                noted={noted}
                flagged={flagged}
                reveal={reveal}
              />
            </div>
          </div>
          {/* Docked beneath the code, its own scroll (AC-223). */}
          <ProblemsPanel
            path={path}
            problems={listed}
            cubeProblems={cubeProblems}
            folders={folders.data ?? []}
            folderId={where.folderId}
            hrefOf={where.hrefOf}
            onPick={(problem) => {
              // To the YAML, where the problem is (the prototype's click does too).
              setView('yaml');
              setShown('yaml');
              setGoTo({ at: problem.from });
            }}
          />
        </PopOut>
      </section>
    </div>
  );
}

/**
 * A page with no editor — a file that is code, one there is none of, one
 * still being read — headed as the editor is, by its path (AC-002; T479).
 */
function Solo({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="model-page__solo">
      <div className="model-editor__head">
        <h1 className="model-editor__path" data-testid="selected-object">
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
  fresh = false,
  drafts,
  onPublished,
  where,
}: {
  path: string;
  content: string;
  published: boolean;
  /** Just made by New view: its form opens on Cubes, ready to pick one (T493). */
  fresh?: boolean;
  /** The model's other unpublished files (T488). */
  drafts: readonly ModelFile[];
  onPublished: (files: readonly ModelFile[]) => void;
  openOn?: OpenOn | undefined;
  onProblems: (byPath: Readonly<Record<string, number>>) => void;
  onChanged: (changed: boolean) => void;
  onText?: ((text: string) => void) | undefined;
  onDiscard?: (() => void) | undefined;
  where: Place;
}) {
  const read = useMemo(() => objectsOf(path, content), [path, content]);
  // Code or a template: its text in the code view, read-only, with the reason (T146, AC-140).
  // Headed as every file is, by its path and its state (T483).
  if (read.code !== undefined)
    return <ReadOnlyFile key={path} path={path} content={content} code={read.code} />;
  // A file that does not parse opens too: its problems are listed, to be fixed.
  // Keyed by the file: another file is another text, not this one's state —
  // and by whether it may be changed here, which the YAML's editor keeps.
  return (
    <FileEditor
      key={`${path}${where.readOnly ? ' read-only' : ''}`}
      where={where}
      path={path}
      content={content}
      published={published}
      openOn={openOn}
      onProblems={onProblems}
      onChanged={onChanged}
      onDiscard={onDiscard}
      fresh={fresh}
      drafts={drafts}
      onPublished={onPublished}
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
/** Whether Generate cubes is docked, kept for the tab (ModelFilePage's `generating`). */
const GENERATING_KEY = ['generate-cubes-open'] as const;

/**
 * Generate cubes, opened afresh on a data source for the model page to dock
 * (T492; the user, 2026-10-02): from that data source's page or its row's
 * ⋯ in Explore. Where models are workspace-only (`modelsAreWorkspaceOnly`:
 * signed in, and with sign-in off too since T451's switch), the cubes go to
 * My workspace's model, to go to `target`; elsewhere, to the root's. Gives
 * the model page's address.
 */
export function generateFrom(
  queryClient: ReturnType<typeof useQueryClient>,
  {
    source,
    target,
    workspaceOnly,
  }: {
    readonly source: string;
    readonly target?: string | undefined;
    readonly workspaceOnly: boolean;
  },
): string {
  generateWith(queryClient, { source, ...(workspaceOnly ? { target } : {}) });
  queryClient.setQueryData(GENERATING_KEY, true);
  return workspaceOnly ? modelHref(MY_WORKSPACE.id) : modelHref();
}
const DRAFTS_STORAGE = 'wechart.model.drafts';
/**
 * Each folder's own drafts and made file (T342): a draft is published into
 * the folder it was made in. The root's keep the Model workspace's keys.
 */
const inFolderKey = <Key extends readonly string[]>(key: Key, folderId: string) =>
  folderId === ROOT ? key : ([...key, folderId] as const);
const draftsStorageOf = (folderId: string) =>
  folderId === ROOT ? DRAFTS_STORAGE : `${DRAFTS_STORAGE}.${folderId}`;

/**
 * A cube or view made from Explore's New in My workspace (T347; AC-192,
 * AC-282): its file made as New cube makes one, kept with the folder it is
 * to go to, for the model page to open as its draft. Gives its path, free in
 * `taken`.
 */
export function startModelDraft(
  queryClient: ReturnType<typeof useQueryClient>,
  folderId: string,
  kind: 'cube' | 'view',
  name: string,
  target: string,
  taken: ReadonlySet<string>,
): string {
  const named = namedFileOf(kind, name);
  let path = named.path;
  for (let n = 2; taken.has(path); n += 1) path = named.path.replace(/\.yml$/, `_${String(n)}.yml`);
  keepDraftTarget(folderId, path, target);
  queryClient.setQueryData(inFolderKey(MADE_KEY, folderId), { path, content: named.content });
  return path;
}

/**
 * The files New cube or New view made whose Name has had its first focus
 * (T484) — each made file, not its path: a discarded draft's path is the next
 * one's (T484's review).
 */
const NAMED = new WeakSet<object>();
const named = (made: object) => NAMED.has(made);
/** A view New view has just made, not yet opened: it opens on its Cubes (T493). */
const freshView = (made: { readonly path: string }) => made.path.startsWith('views/');
function markNamed(made: object) {
  NAMED.add(made);
}

function readDrafts(storage: string): Record<string, string> {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(storage) ?? '{}');
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

function keepDrafts(storage: string, drafts: Readonly<Record<string, string>>) {
  try {
    sessionStorage.setItem(storage, JSON.stringify(drafts));
  } catch {
    // Kept on this page only.
  }
}

/** A new file's name, the next free in its folder, and its first text (the prototype's). */
export function newFileOf(
  kind: 'cube' | 'view',
  taken: ReadonlySet<string>,
): { path: string; content: string } {
  const folder = kind === 'cube' ? 'cubes' : 'views';
  let n = 1;
  while (taken.has(`${folder}/new_${kind}_${String(n)}.yml`)) n += 1;
  const name = `new_${kind}_${String(n)}`;
  return {
    path: `${folder}/${name}.yml`,
    content:
      // No made-up table (T484, MW-17): Reads from shows the shape, and
      // Problems says what is missing until one is given.
      kind === 'cube'
        ? `cubes:\n  - name: ${name}\n    dimensions:\n      - name: id\n        sql: id\n        type: number\n        primary_key: true\n    measures:\n      - name: count\n        type: count\n`
        : // No cube, and no members, chosen for the user (T493, MW-19): its Cubes
          // tab opens to pick one. A view's `cubes` is optional (Y.10).
          `views:\n  - name: ${name}\n`,
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
  /** A member of that tab to open, by name: Jobs' "Open in Model" (T469, UX-080). */
  readonly member?: string | undefined;
}

export function ModelFilePage({
  path,
  openOn,
  folderId,
  request,
}: {
  path?: string | undefined;
  openOn?: OpenOn | undefined;
  /**
   * The calculation request the file is opened for (T384, AC-051): shown
   * beside the editor, by its id.
   */
  request?: string | undefined;
  /**
   * The folder whose model this is, opened from Explore under its
   * breadcrumb (T342, AC-222); none is the Model workspace's, the root's.
   */
  folderId?: string | undefined;
}) {
  const folder = folderId ?? ROOT;
  const files = useQuery(modelFilesQuery(folder));
  const queryClient = useQueryClient();
  const router = useRouter();
  const folders = useQuery(FOLDERS_QUERY);
  /**
   * Whether it may be changed here (rules 70 and 71): a shared model is
   * read-only (`modelsAreWorkspaceOnly`); "Edit in my workspace" for those
   * whose access to its folder answers them, a Super-Admin or read-write
   * member, and with sign-in off, its one user (T451's switch).
   */
  const me = useQuery(ME_QUERY);
  const access = useQuery({
    ...folderAccessQuery(folder),
    enabled: me.data?.security === 'oidc',
    retry: false,
  });
  // My workspace, or a folder in it (T347): its models are its owner's to
  // change there; with sign-in off, the single user's (T451's switch).
  const inWorkspace =
    modelsAreWorkspaceOnly(me.data) &&
    (isMyWorkspace(folder) || isMyWorkspace(folderChain(folders.data ?? [], folder)[0]?.id ?? ''));
  const { readOnly, editInWorkspace, useInWorkspace } = modelAccessOf({
    me: me.data,
    right: rightFrom({
      answered: access.isSuccess,
      refusedWith: access.error instanceof AccessRefused ? access.error.status : undefined,
    }),
    inWorkspace,
  });
  const hrefOf = useCallback((each: string) => fileHref(each, folderId), [folderId]);
  const words = folderWordsOf(folder, folders.data ?? []);
  const where = useMemo<Place>(
    () => ({
      folderId: folder,
      hrefOf,
      readOnly,
      editInWorkspace,
      useInWorkspace,
      inWorkspace,
      words,
    }),
    [folder, hrefOf, readOnly, editInWorkspace, useInWorkspace, inWorkspace, words],
  );
  const draftsKey = inFolderKey(DRAFTS_KEY, folder);
  const draftsStorage = draftsStorageOf(folder);
  const madeKey = inFolderKey(MADE_KEY, folder);
  const drafts = useQuery({
    queryKey: draftsKey,
    queryFn: () => readDrafts(draftsStorage),
    initialData: () => readDrafts(draftsStorage),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  }).data;
  const setDrafts = useCallback(
    (next: Readonly<Record<string, string>>) => {
      queryClient.setQueryData(inFolderKey(DRAFTS_KEY, folder), next);
      keepDrafts(draftsStorageOf(folder), next);
    },
    [queryClient, folder],
  );
  /**
   * A file New cube or New view made, kept as a draft once it opens: leaving
   * the open file may be asked about, and staying makes no file (T237's
   * review). Kept in the query cache, not the page: made on the overview, it
   * opens on the file's page, a new one (the Superset parity run).
   */
  const made =
    useQuery<{ path: string; content: string } | null>({
      queryKey: madeKey,
      queryFn: () => null,
      initialData: null,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    }).data ?? undefined;
  const setMade = useCallback(
    (next: { path: string; content: string } | undefined) => {
      queryClient.setQueryData(inFolderKey(MADE_KEY, folder), next ?? null);
    },
    [queryClient, folder],
  );
  useEffect(() => {
    if (made === undefined || path !== made.path || made.path in drafts) return;
    setDrafts({ ...drafts, [made.path]: made.content });
  }, [path, made, drafts, setDrafts]);
  const stored = files.data ?? [];
  // A draft once published is a stored file: the store's copy wins. None
  // where the model is read-only: nothing made here would be published (T342).
  const unpublished = readOnly
    ? []
    : Object.entries({
        ...drafts,
        ...(made !== undefined && path === made.path ? { [made.path]: made.content } : {}),
      })
        .filter(([draft]) => !stored.some((file) => file.path === draft))
        .map(([draftPath, content]) => ({ path: draftPath, content }));
  const all = [...stored, ...unpublished];
  /**
   * The open file's fellow drafts, one list while their text is unchanged:
   * typing in the open draft doesn't read the others again (T488).
   */
  const othersKey = JSON.stringify(unpublished.filter((each) => each.path !== path));
  const otherDrafts = useMemo(() => JSON.parse(othersKey) as ModelFile[], [othersKey]);
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
    router.history.push(hrefOf(next));
  };
  /**
   * What may be made here (AC-222): New cube and New view where the model
   * may be changed; Generate cubes only in the root's model, whose data
   * sources it reads (T490) and whose drafts it adds.
   */
  const mayMake = !readOnly;
  // And My workspace's, whence the cubes are proposed to their folder (T492, AC-350).
  const mayGenerate = mayMake && (folder === ROOT || where.inWorkspace);
  /**
   * Whether Generate cubes is open (T145, AC-139): kept for the tab, as what
   * it holds is (GenerateCubes' `GENERATE_KEY`), so it stays docked when a
   * clashing file opens from the overview — another page (design 11 pin 17).
   */
  const generating =
    useQuery({
      queryKey: GENERATING_KEY,
      queryFn: () => false,
      initialData: false,
      staleTime: Number.POSITIVE_INFINITY,
      gcTime: Number.POSITIVE_INFINITY,
    }).data === true;
  const setGenerating = (next: boolean) => {
    queryClient.setQueryData(GENERATING_KEY, next);
  };
  /** Closed: focus back on what opened it (design 11 pin 9, rule 85), else the tree's. */
  const generateOpener = useRef<HTMLElement | null>(null);
  const closeGenerate = () => {
    setGenerating(false);
    setTimeout(() => {
      const opener = generateOpener.current;
      if (opener?.isConnected === true) opener.focus();
      else page.current?.querySelector<HTMLElement>('.model-tree__generate')?.focus();
    }, 0);
  };
  /**
   * A cube or view made in My workspace asks first for its name and the
   * shared folder it is to go to (T347; AC-282, AC-222), from the folders
   * read afresh, as a dashboard made there does (T345).
   */
  const [askingNew, setAskingNew] = useState<{
    readonly kind: 'cube' | 'view';
    readonly targets: readonly Target[];
  }>();
  const [targetsFailed, setTargetsFailed] = useState<string>();
  /**
   * What asked for the dialog: given the focus back as it closes (rule 85),
   * before the new file opens — so a question about leaving an unsaved file
   * puts it back there on Stay (AC-226), as it does where nothing is asked.
   */
  const newOpener = useRef<HTMLElement | null>(null);
  const makeNew = (kind: 'cube' | 'view') => {
    if (where.inWorkspace) {
      newOpener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setTargetsFailed(undefined);
      void targetsOf().then(
        (targets) => {
          setAskingNew({ kind, targets });
        },
        (error: unknown) => {
          setTargetsFailed((error as Error).message);
        },
      );
      return;
    }
    const next = newFileOf(kind, new Set(all.map((each) => each.path)));
    setMade(next);
    open(next.path);
  };
  /** Named, with where it is to go: made as a draft here, kept with its target until saved. */
  const makeNamed = (kind: 'cube' | 'view', name: string, target: string) => {
    open(
      startModelDraft(
        queryClient,
        folder,
        kind,
        name,
        target,
        new Set(all.map((each) => each.path)),
      ),
    );
  };
  /**
   * Generate cubes opened; already open, pressed again, it takes you to the
   * pane. What opened it — the tree's foot, + New ▾ (whose menu has given focus
   * back to its button), the empty overview's button — gets focus back on close
   * (design 11 pin 9, rule 85; T486's review).
   */
  const startGenerate = () => {
    if (generating) {
      page.current?.querySelector<HTMLElement>('.generate-pane h2')?.focus();
      return;
    }
    generateOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setGenerating(true);
  };
  /**
   * The overview's + New ▾ (design 12 pin 5, state A): the tree foot's three
   * ways to add, in its order; Generate last, as it opens a pane, not a file.
   */
  const newItems: readonly MenuItem[] = [
    {
      key: 'cube',
      label: (
        <>
          <span className="itemicon ic-model" aria-hidden="true">
            ◇
          </span>
          New cube
        </>
      ),
      onSelect: () => {
        makeNew('cube');
      },
    },
    {
      key: 'view',
      label: (
        <>
          <span className="itemicon ic-model" aria-hidden="true">
            ◈
          </span>
          New view
        </>
      ),
      onSelect: () => {
        makeNew('view');
      },
    },
    // Only where Generate may add to the model (T342).
    ...(mayGenerate
      ? [
          {
            key: 'generate',
            // Set apart: it opens a pane, not a file (state A).
            separatorBefore: true,
            label: (
              <>
                <span className="itemicon ic-source" aria-hidden="true">
                  ◍
                </span>
                Generate from a data source…
              </>
            ),
            onSelect: startGenerate,
          },
        ]
      : []),
  ];
  /** A file made here, discarded: it goes, and the overview opens (AC-226). */
  const discardDraft = (draft: string) => {
    if (made?.path === draft) setMade(undefined);
    setDrafts(Object.fromEntries(Object.entries(drafts).filter(([each]) => each !== draft)));
    router.history.push(modelHref(folderId));
  };
  /** The breadcrumb's links, followed in the app, so leaving with changes is asked about (AC-226). */
  const inApp = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    router.history.push(event.currentTarget.getAttribute('href') ?? '/explore');
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
  /**
   * A file New cube or New view has just made opens on General with its Name
   * focused and selected, to type over (design 03 state C, MW-18; T484) — the
   * first time only, not each time it is opened again. After the tree's.
   */
  useEffect(() => {
    if (path === undefined || made === undefined || made.path !== path || named(made)) return;
    // A new view's form puts focus on its Cubes' join path itself (T493): not taken
    // from it. Offered once its form is drawn, not while the model still reads.
    if (freshView(made)) {
      if (page.current?.querySelector('.model-form__panel') != null) markNamed(made);
      return;
    }
    const name = page.current?.querySelector<HTMLInputElement>(
      '.model-form__panel [data-key="name"] input',
    );
    if (name === null || name === undefined) return;
    markNamed(made);
    name.focus();
    name.select();
  }, [path, made, files.isSuccess]);

  /** Generate cubes docked: only where it may be (T342). */
  const docked = generating && mayGenerate;
  /** The shared folders generated cubes may go to, from My workspace (T492). */
  const generateTargets = useQuery({
    queryKey: ['folder-targets'],
    queryFn: targetsOf,
    enabled: docked && where.inWorkspace,
  });

  // A folder that isn't there, or isn't the user's to see: the same page for
  // both, as any address that matches nothing (rule 67; T342's review).
  if (files.error instanceof ModelFilesNotFound) return <NotFound />;

  return (
    <>
      {folderId === undefined ? null : (
        // Opened from Explore: under its folder's breadcrumb (rule 70), each
        // step a way back — to Explore, each folder, the folder's model.
        <nav aria-label="Breadcrumb" className="model-page__crumbs">
          <a href="/explore" onClick={inApp}>
            Explore
          </a>
          {folderChain(folders.data ?? [], folder).map((crumb) => (
            <span key={crumb.id}>
              <span aria-hidden="true"> / </span>
              <a href={exploreHref(crumb.id)} onClick={inApp}>
                {crumb.title}
              </a>
            </span>
          ))}
          <span aria-hidden="true"> / </span>
          {path === undefined ? (
            <span aria-current="page">Model</span>
          ) : (
            <>
              <a href={modelHref(folderId)} onClick={inApp}>
                Model
              </a>
              <span aria-hidden="true"> / </span>
              <span aria-current="page" className="is-code">
                {path}
              </span>
            </>
          )}
        </nav>
      )}
      <div
        ref={page}
        className={`model-workspace model-page${
          docked
            ? ' model-page--generating'
            : request !== undefined && path !== undefined
              ? ' model-page--request'
              : ''
        }`}
      >
        <FileTree
          files={all}
          current={path}
          reported={reported?.from === path ? reported?.byPath : undefined}
          unpublished={unpublishedPaths}
          onOpen={open}
          onNew={mayMake ? makeNew : undefined}
          generating={docked}
          onGenerate={mayGenerate ? startGenerate : undefined}
          reading={files.isPending}
          hrefOf={hrefOf}
        />
        <div className="model-page__main">
          {path === undefined ? (
            // No file open: every cube and view, by file (AC-131), as design 12
            // draws it (T486): the title row at once, its one primary + New ▾ —
            // none where the model is read-only, which it says (T342).
            <div className="model-page__overview">
              <div className="model-overview__title-row">
                <h1 className="workspace-title">Model</h1>
                {readOnly ? (
                  <ReadOnlyBadge words={words} />
                ) : (
                  <MenuButton label="New" items={newItems}>
                    ＋ New ▾
                  </MenuButton>
                )}
              </div>
              {files.isPending ? (
                // State F: reading, the table's frame drawn beneath (no jump when it comes).
                <>
                  <StateLine kind="run">Reading the model…</StateLine>
                  <div className="model-overview model-overview--reading" aria-hidden="true">
                    <div className="model-overview__skeleton-head" />
                    {[120, 140].map((width) => (
                      <div key={width} className="model-overview__skeleton-row">
                        <span className="skeleton-bar" style={{ width }} />
                        <span className="skeleton-bar" style={{ width: 40 }} />
                        <span className="skeleton-bar" style={{ width: 80 }} />
                      </div>
                    ))}
                  </div>
                </>
              ) : files.isError ? (
                // Its words, and Retry (rule 18).
                <div className="info-bar model-overview__failed" role="alert">
                  <StatusIcon kind="err" />
                  <p>{files.error.message}</p>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => {
                      void files.refetch();
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <InfoBar>
                    <p>
                      {readOnly
                        ? 'Every cube and view in the model, by file. Open a row to read its file.'
                        : 'Every cube and view in the model, by file. Open a row to edit its file.'}
                    </p>
                  </InfoBar>
                  <FileList
                    files={all}
                    unpublished={unpublishedPaths}
                    onOpen={open}
                    onNew={mayMake ? makeNew : undefined}
                    onGenerate={mayGenerate ? startGenerate : undefined}
                    hrefOf={hrefOf}
                  />
                </>
              )}
            </div>
          ) : files.isPending ? (
            // Untitled while it reads: the title comes once, with what it heads.
            <StateLine kind="run">Reading the model…</StateLine>
          ) : files.isError ? (
            <StateLine kind="err">{files.error.message}</StateLine>
          ) : file === undefined ? (
            <Solo path={path}>
              <StateLine kind="err">There is no model file {path}.</StateLine>
            </Solo>
          ) : (
            <FileBody
              where={where}
              path={file.path}
              content={file.content}
              published={!isDraft}
              openOn={openOn}
              // Opened for the first time from New view: on its Cubes, ready to pick one.
              fresh={
                made !== undefined && made.path === file.path && !named(made) && freshView(made)
              }
              drafts={otherDrafts}
              onPublished={(sent) => {
                // In the store now: listed so at once, before the files are read again,
                // and no longer drafts, so a second save doesn't send them as new
                // (T488's review).
                queryClient.setQueryData(
                  modelFilesQuery(folder).queryKey,
                  (old: readonly ModelFile[] | undefined) => [
                    ...(old ?? []).filter((each) => !sent.some((one) => one.path === each.path)),
                    ...sent,
                  ],
                );
                const paths = new Set(sent.map((each) => each.path));
                setDrafts(
                  Object.fromEntries(Object.entries(drafts).filter(([at]) => !paths.has(at))),
                );
                if (made !== undefined && paths.has(made.path)) setMade(undefined);
              }}
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
        {/* The calculation request it was opened for, beside the editor (T384, AC-051). */}
        {request === undefined || path === undefined || docked ? null : (
          <RequestPane requestId={request} />
        )}
        {/* Docked beside the model, as design 01's pane is (design 11): on a
          file's page it takes the code's place, and the form widens. */}
        {docked ? (
          <GenerateCubes
            existing={all}
            onClose={closeGenerate}
            {...(where.inWorkspace
              ? {
                  workspace: {
                    targets: generateTargets.data,
                    failed: generateTargets.error?.message,
                  },
                }
              : {})}
            onAdded={(added, target) => {
              // In My workspace, each kept with where it is to go, as New cube's is (T492).
              if (target !== undefined)
                for (const each of added) keepDraftTarget(folder, each.path, target);
              // Drafts in the tree, none published until saved (R36, AC-345).
              setDrafts({
                ...drafts,
                ...Object.fromEntries(added.map((each) => [each.path, each.content])),
              });
            }}
            onOpen={(opened) => {
              setGenerating(false);
              open(opened);
            }}
            onShow={open}
          />
        ) : null}
      </div>
      {targetsFailed === undefined ? null : (
        <StateLine kind="err">Could not list the folders it may go to: {targetsFailed}</StateLine>
      )}
      {askingNew === undefined ? null : (
        <NewItemDialog
          kind={askingNew.kind}
          defaultTitle={newFileOf(askingNew.kind, new Set(all.map((each) => each.path)))
            .path.split('/')
            .at(-1)!
            .replace(/\.yml$/, '')}
          targets={askingNew.targets}
          onClose={() => {
            setAskingNew(undefined);
            newOpener.current?.focus();
          }}
          onCreate={(name, target) => {
            setAskingNew(undefined);
            newOpener.current?.focus();
            makeNamed(askingNew.kind, name, target);
          }}
        />
      )}
    </>
  );
}
