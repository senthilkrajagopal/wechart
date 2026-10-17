import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { joinedFrom, joinsQueryOf, metaQueryOf, useWorkspaceItem } from '../query/meta';
import { FOLDERS_QUERY } from '../workspaces/explore/folders';
import { CubePicker } from './CubePicker';
import { pickerGroupsOf } from './pathCubes';
import { missingScopeOf, ScopeUnavailable } from '../query/scopes';
import { StateLine } from '../shell/StatusIcon';
import {
  GROUP_LABELS,
  cubesFrom,
  fieldMetaOf,
  groupByCube,
  groupMembers,
  matchesSearch,
  membersOf,
  type Member,
  type MemberKind,
} from './fields';

/**
 * The chart editor's field list (AC-025): the cubes and views the model
 * exposes, and the members of the chosen one, grouped by type.
 *
 * Metadata comes from wechart's API, never from Cube directly — the browser
 * holds no Cube credentials and makes no request to the Cube host (AC-007).
 */
const MEMBER_ICON: Record<string, string> = {
  measure: 'Σ',
  dimension: 'Aa',
  timeDimension: '◷',
  segment: '⊂',
};

/**
 * A dimension's type icon, as direction.md §5 has it ("always shown with a
 * type icon: Aa, #, clock, ⊙ (geo), ◐ (boolean)") and the prototype's
 * `UI.ficon` draws it (T257).
 */
const DIMENSION_TYPE_ICON: Record<string, string> = {
  number: '#',
  boolean: '◐',
  geo: '⊙',
  time: '◷',
};

/** The glyph on a field's role chip: Σ for a measure, its type's for a dimension. */
export function fieldIconOf(member: Pick<Member, 'kind' | 'type'>): string {
  if (member.kind === 'dimension') return DIMENSION_TYPE_ICON[member.type] ?? 'Aa';
  return MEMBER_ICON[member.kind] ?? 'Aa';
}

/**
 * A field's role chip (the prototype's `.ficon`): its glyph on its role's
 * tint — orange for a measure, blue for the rest (T257, AC-187). Decorative:
 * the field's kind is said by its group heading and its meta, never by the
 * chip alone (direction.md rule 3).
 */
export function FieldIcon({ member }: { member: Pick<Member, 'kind' | 'type'> }) {
  return (
    <span
      className="field-row__icon"
      data-icon={member.kind}
      data-role={member.kind === 'measure' ? 'measure' : 'dimension'}
      aria-hidden="true"
    >
      {fieldIconOf(member)}
    </span>
  );
}

/**
 * A cube as a reader knows it: its title, or — for one the model does not
 * publish, whose members a view shows — its name written as words, never
 * the identifier (T229's review); for a folder's, its short name, never
 * the folder prefix, which no short name holds (AC-329; T475's review;
 * research `xcube-slice-3a.md`, "Names").
 */
export function cubeTitleIn(meta: unknown, name: string): string {
  return (
    cubesFrom(meta).find((cube) => cube.name === name)?.title ??
    (name.split('__').pop() ?? name)
      .replace(/_/g, ' ')
      .replace(/^./, (first) => first.toUpperCase())
  );
}

/**
 * The cubes a chart may use with the chosen one: those it joins to, as the
 * open item's model declares them (T688, EDI-03), and its `/api/meta` holds —
 * a cube it doesn't (hidden, or not the user's to see) has no fields to
 * offer, so no group. None until both are read.
 */
export function useJoined(cubeName: string): readonly string[] {
  const workspace = useWorkspaceItem();
  const joins = useQuery({ ...joinsQueryOf(workspace), enabled: cubeName !== '' });
  const meta = useQuery({ ...metaQueryOf(workspace), enabled: cubeName !== '' });
  // One array while neither changes, so the memos built on it hold.
  return useMemo(() => {
    if (cubeName === '' || joins.data === undefined || meta.data === undefined) return NO_CUBES;
    const held = new Set(cubesFrom(meta.data).map((cube) => cube.name));
    return joinedFrom(joins.data, cubeName).filter((cube) => held.has(cube));
  }, [cubeName, joins.data, meta.data]);
}

const NO_CUBES: readonly string[] = [];

/**
 * The chosen cube's members and those of each cube it joins to (T688): what
 * the chart may use, for the wells as for the list.
 */
export function membersWithJoins(
  meta: unknown,
  cubeName: string,
  joined: readonly string[],
): Member[] {
  if (cubeName === '') return [];
  return [cubeName, ...joined].flatMap((cube) => membersOf(meta, cube));
}

export interface CubeSourcePickerProps {
  readonly cubeName?: string;
  readonly onCubeChange?: (cubeName: string) => void;
  /**
   * The folder the chart is kept in (a local chart's, its dashboard's): the
   * cubes offered are those on its path, each with its folder path (T429,
   * AC-329). Every cube where it isn't known.
   */
  readonly folderId?: string | undefined;
}

/**
 * "Cube or view", the inspector's first field (T688, EDI-05; design 01 pin
 * 3): design 10's picker (T475), each cube by its title under its folder
 * path, never its prefixed name (AC-329), nearest first.
 */
export function CubeSourcePicker({ cubeName = '', onCubeChange, folderId }: CubeSourcePickerProps) {
  // One definition of the model query for every caller (see META_QUERY),
  // read afresh each time a builder opens: a model published since — in
  // this tab or another — is in its field list (AC-137; research/
  // data-layer.md, "Refetch on mount"). wechart's own cache answers it.
  // A workspace item's is its overlay's, and its picker its target's path
  // after its own cubes (T347; AC-323, AC-329).
  const workspace = useWorkspaceItem();
  const meta = useQuery({ ...metaQueryOf(workspace), refetchOnMount: 'always' });
  // The folders, for the path the picker offers (T429, AC-329).
  const folders = useQuery({ ...FOLDERS_QUERY, enabled: folderId !== undefined });
  // For a workspace item, the folders' own cubes: its overlay holds its copy
  // in place of the cube it copies, which the picker lists in that cube's
  // place, "Your copy" (T475's review; T718, AC-428).
  const published = useQuery({ ...metaQueryOf(undefined), enabled: workspace !== undefined });
  if (meta.data === undefined) return null;
  const cubes = cubesFrom(meta.data);
  // The cubes on the chart's folder path, by folder, nearest first, the
  // user's copy in its landed cube's place (AC-329, AC-428; T475, T718).
  // The chart's own cube is named on the button whether listed or not.
  const groups = pickerGroupsOf(
    cubes,
    folderId,
    folders.data ?? [],
    workspace?.targetFolderId,
    published.data === undefined ? undefined : cubesFrom(published.data),
  );
  return (
    <CubePicker
      groups={groups}
      value={cubeName}
      valueTitle={
        cubeName === ''
          ? undefined
          : `${cubeTitleIn(meta.data, cubeName)}${cubes.find((cube) => cube.name === cubeName)?.isView === true ? ' (view)' : ''}`
      }
      onChoose={(next) => {
        onCubeChange?.(next);
      }}
    />
  );
}

export interface FieldListProps {
  /** The chosen cube or view, whose fields are listed; chosen in the inspector (EDI-05). */
  readonly cubeName?: string;
  /**
   * Reports which field is being dragged, so the wells can mark themselves
   * legal or illegal for it (AC-027). The drag payload itself is not readable
   * during `dragover`, so the editor keeps it rather than reading it back.
   */
  readonly onDragStateChange?: (member: Member | null) => void;
  /** The members the chart uses, marked in the list (AC-215). */
  readonly used?: ReadonlySet<string>;
  /** A field clicked, or chosen with Enter or Space: into its role's well (AC-215). */
  readonly onAdd?: (member: Member) => void;
  /**
   * How many distinct values each dimension has in the chart's own result
   * (T688, EDI-04): design 01's "1,184", counted from the rows already come,
   * with no query of its own (the coordinator's call, 2026-10-17). A
   * dimension the result doesn't hold says its type.
   */
  readonly distinct?: ReadonlyMap<string, number> | undefined;
}

const NONE_USED: ReadonlySet<string> = new Set();
const NONE_COUNTED: ReadonlyMap<string, number> = new Map();

interface Section {
  readonly cube: string;
  readonly title: string;
  /** A cube the chosen one joins to (EDI-03). */
  readonly viaJoin: boolean;
  readonly groups: [MemberKind, Member[]][];
  readonly count: number;
}

export function FieldList({
  cubeName = '',
  onDragStateChange,
  used = NONE_USED,
  onAdd,
  distinct = NONE_COUNTED,
}: FieldListProps = {}) {
  const [search, setSearch] = useState('');
  const [searchedIn, setSearchedIn] = useState(cubeName);
  // A search for the last cube's fields is not one for this one's.
  if (searchedIn !== cubeName) {
    setSearchedIn(cubeName);
    setSearch('');
  }
  /** Groups opened or closed by hand, over what they'd be by default. */
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());

  const workspace = useWorkspaceItem();
  const meta = useQuery({ ...metaQueryOf(workspace), refetchOnMount: 'always' });
  const joined = useJoined(cubeName);

  if (meta.isPending) return <StateLine kind="run">Loading the model…</StateLine>;
  if (meta.isError) {
    // A scope the context lacks, said as that (T176, AC-170).
    const lacking = missingScopeOf(meta.error);
    return lacking === undefined ? (
      <StateLine kind="err">{(meta.error as Error).message}</StateLine>
    ) : (
      <ScopeUnavailable scope={lacking} what="The model’s fields" />
    );
  }

  const cubeTitle = (name: string) => cubeTitleIn(meta.data, name);
  const searching = search.trim() !== '';
  const found = (members: readonly Member[]) =>
    members.filter((member) => matchesSearch(member, search));
  /**
   * The chosen one's fields by the cube each belongs to (AC-215) — a view's
   * by its cubes — then each joined cube's (EDI-03), each by type (AC-025).
   */
  const sections: Section[] = [
    ...groupByCube(found(membersOf(meta.data, cubeName))).map(([cube, groups]) => ({
      cube,
      title: cubeTitle(cube),
      viaJoin: false,
      groups,
      count: groups.reduce((sum, [, group]) => sum + group.length, 0),
    })),
    ...joined.map((cube) => {
      const members = found(membersOf(meta.data, cube));
      return {
        cube,
        title: cubeTitle(cube),
        viaJoin: true,
        groups: groupMembers(members),
        count: members.length,
      };
    }),
  ].filter((section) => !searching || section.count > 0);
  /** Open: the chosen one's, a joined cube the chart uses, any while searching, or as toggled. */
  const isOpen = (section: Section) =>
    searching ||
    (toggled.get(section.cube) ??
      (!section.viaJoin ||
        section.groups.some(([, group]) => group.some((member) => used.has(member.name)))));

  return (
    <div className="field-list">
      {cubeName === '' ? null : (
        // The cube named, and how many it reaches (design 01's pane head).
        <h2 className="field-list__head">
          Cube: <span className="field-list__head-name">{cubeTitle(cubeName)}</span>
          <span className="field-list__head-count">
            {joined.length + 1 === 1 ? '1 cube' : `${String(joined.length + 1)} cubes`}
          </span>
        </h2>
      )}
      {cubeName === '' ? (
        <p className="field-list__none" data-testid="no-cube-chosen">
          Choose a cube or view to see its fields.
        </p>
      ) : (
        <>
          {/* Narrowed as it is typed (AC-215); the prototype's .tree-search. */}
          <div className="field-list__search-box">
            <input
              type="search"
              className="input-sm field-list__search"
              aria-label="Search fields"
              placeholder="Search fields"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {sections.every((section) => section.count === 0) ? (
            <p className="field-list__none">
              {searching
                ? `No field matches “${search.trim()}”.`
                : 'This cube or view has no fields to show.'}
            </p>
          ) : null}
          {sections.map((section) => {
            const open = isOpen(section);
            const name = `${section.title} fields`;
            return (
              <section key={section.cube} className="field-list__cube" aria-label={name}>
                <h3 className="field-list__cube-head">
                  {/* Opened and closed as design 01's .tgroup-head (▾ ▸). */}
                  <button
                    type="button"
                    className="field-list__toggle"
                    aria-expanded={open}
                    aria-label={name}
                    onClick={() => {
                      setToggled((was) => new Map(was).set(section.cube, !open));
                    }}
                  >
                    <span className="field-list__caret" aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                    {section.title}
                    {section.viaJoin ? <span className="field-list__via"> · via join</span> : null}
                    <span className="field-list__count">{section.count}</span>
                  </button>
                </h3>
                {open
                  ? section.groups.map(([kind, group]) => (
                      <div key={kind} data-testid={`group-${kind}`} data-cube={section.cube}>
                        <h4>{GROUP_LABELS[kind]}</h4>
                        <ul aria-label={`${section.title} ${GROUP_LABELS[kind]}`}>
                          {group.map((member) => (
                            <li key={member.name} data-testid={`member-${member.name}`}>
                              <FieldRow
                                member={member}
                                used={used.has(member.name)}
                                distinct={
                                  member.kind === 'dimension'
                                    ? distinct.get(member.name)
                                    : undefined
                                }
                                onAdd={onAdd}
                                onDragStateChange={onDragStateChange}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  : null}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/**
 * One field (AC-215): its type's icon, its title, its aggregation or type,
 * and whether the chart uses it. A click, Enter or Space adds it to the well
 * its role belongs in; a drag takes it to a well of the reader's choosing
 * (AC-026). A segment goes in no well, so it is listed, not offered.
 */
function FieldRow({
  member,
  used,
  distinct,
  onAdd,
  onDragStateChange,
}: {
  member: Member;
  used: boolean;
  /** Its distinct values in the chart's result, where it holds them (EDI-04). */
  distinct: number | undefined;
  onAdd: ((member: Member) => void) | undefined;
  onDragStateChange: ((member: Member | null) => void) | undefined;
}) {
  const addable = onAdd !== undefined && member.kind !== 'segment';
  const content = (
    <>
      {/* Type shown as an icon and a group heading, never colour alone
          (direction.md rule 3). */}
      <FieldIcon member={member} />
      <span className="field-row__name">
        {member.shortTitle}
        {/* The prototype's 6 px accent dot after the name (.frow.used), said
            in words to assistive technology (T257). */}
        {used ? (
          <span className="field-row__used" title="In the chart">
            <span className="visually-hidden">, in the chart</span>
          </span>
        ) : null}
      </span>
      <span
        className="field-row__meta"
        title={distinct === undefined ? undefined : 'Distinct values in the chart’s result'}
      >
        {/* A dimension by its distinct values, once counted (EDI-04). */}
        {distinct === undefined ? fieldMetaOf(member) : distinct.toLocaleString('en-US')}
      </span>
    </>
  );
  const drag = {
    draggable: true,
    // The pointer route into a well (AC-026).
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData('text/plain', member.name);
      event.dataTransfer.effectAllowed = 'copy';
      onDragStateChange?.(member);
    },
    onDragEnd: () => onDragStateChange?.(null),
  };

  return addable ? (
    <div
      role="button"
      tabIndex={0}
      className="field-row"
      data-used={used ? 'true' : undefined}
      title={`${member.title} · click to add`}
      {...drag}
      onClick={() => onAdd(member)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onAdd(member);
      }}
    >
      {content}
    </div>
  ) : (
    <div className="field-row" data-used={used ? 'true' : undefined} {...drag}>
      {content}
    </div>
  );
}
