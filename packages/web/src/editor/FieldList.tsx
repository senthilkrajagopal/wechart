import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { META_QUERY } from '../query/meta';
import { FOLDERS_QUERY } from '../workspaces/explore/folders';
import { cubesOnPath } from './pathCubes';
import { missingScopeOf, ScopeUnavailable } from '../query/scopes';
import { StateLine } from '../shell/StatusIcon';
import {
  GROUP_LABELS,
  cubesFrom,
  fieldMetaOf,
  groupByCube,
  matchesSearch,
  membersOf,
  type CubeSummary,
  type Member,
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

export interface FieldListProps {
  /** Lifted so the editor can build a query from the chosen cube's members. */
  readonly cubeName?: string;
  readonly onCubeChange?: (cubeName: string) => void;
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
   * The folder the chart is kept in (a local chart's, its dashboard's): the
   * cubes offered are those on its path, each with its folder path (T429,
   * AC-329). Every cube where it isn't known.
   */
  readonly folderId?: string | undefined;
}

const NONE_USED: ReadonlySet<string> = new Set();

/** A cube in the picker: its title, and "(view)" for a view. */
const optionOf = (cube: CubeSummary) => (
  <option key={cube.name} value={cube.name}>
    {cube.title}
    {cube.isView ? ' (view)' : ''}
  </option>
);

/**
 * The picker's cubes by their folder path (T429, AC-329): the root's first,
 * then each folder down the path; those with no path, as they come.
 */
function groupedByPath(
  cubes: readonly CubeSummary[],
): { path: string | undefined; cubes: CubeSummary[] }[] {
  const groups: { path: string | undefined; cubes: CubeSummary[] }[] = [];
  for (const cube of cubes) {
    const group = groups.find((each) => each.path === cube.folderPath);
    if (group === undefined) groups.push({ path: cube.folderPath, cubes: [cube] });
    else group.cubes.push(cube);
  }
  const depth = (path: string | undefined) => (path === undefined ? -1 : path.split(' / ').length);
  return groups.sort((a, b) => depth(a.path) - depth(b.path));
}

export function FieldList({
  cubeName: controlled,
  onCubeChange,
  onDragStateChange,
  used = NONE_USED,
  onAdd,
  folderId,
}: FieldListProps = {}) {
  const [search, setSearch] = useState('');
  const [own, setOwn] = useState('');
  const cubeName = controlled ?? own;
  const setCubeName = (next: string) => {
    setOwn(next);
    // A search for the last cube's fields is not one for this one's.
    setSearch('');
    onCubeChange?.(next);
  };

  // One definition of the model query for every caller (see META_QUERY),
  // read afresh each time a builder opens: a model published since — in
  // this tab or another — is in its field list (AC-137; research/
  // data-layer.md, "Refetch on mount"). wechart's own cache answers it.
  const meta = useQuery({ ...META_QUERY, refetchOnMount: 'always' });
  // The folders, for the path the picker offers (T429, AC-329).
  const folders = useQuery({ ...FOLDERS_QUERY, enabled: folderId !== undefined });

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

  const cubes = cubesFrom(meta.data);
  // Only those on the chart's folder path, each name's nearest (AC-329); the
  // chart's own cube too, so the picker still says what it is built on.
  const onPath = cubesOnPath(cubes, folderId, folders.data ?? []);
  const offered = onPath.some((cube) => cube.name === cubeName)
    ? onPath
    : [...onPath, ...cubes.filter((cube) => cube.name === cubeName)];
  /**
   * A cube as a reader knows it: its title, or — for one the model does not
   * publish, whose members a view shows — its name written as words, never
   * the identifier (T229's review).
   */
  const cubeTitle = (name: string) =>
    cubes.find((cube) => cube.name === name)?.title ??
    name.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase());
  const members = cubeName ? membersOf(meta.data, cubeName) : [];
  const found = members.filter((member) => matchesSearch(member, search));
  const byCube = groupByCube(found);

  return (
    <div className="field-list">
      <div className="field-list__source">
        <label htmlFor="cube-picker">Cube or view</label>
        <select
          id="cube-picker"
          className="select-sm"
          value={cubeName}
          onChange={(event) => setCubeName(event.target.value)}
        >
          <option value="">Choose a cube or view…</option>
          {/* Each by its title under its folder path, never its prefixed
              name (AC-329): the root's first, then down the path. */}
          {groupedByPath(offered).map(({ path, cubes: inPath }) =>
            path === undefined ? (
              inPath.map((cube) => optionOf(cube))
            ) : (
              <optgroup key={path} label={path}>
                {inPath.map((cube) => optionOf(cube))}
              </optgroup>
            ),
          )}
        </select>
      </div>

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
          {found.length === 0 ? (
            <p className="field-list__none">
              {search.trim() === ''
                ? 'This cube or view has no fields to show.'
                : `No field matches “${search.trim()}”.`}
            </p>
          ) : null}
          {/* By the cube each belongs to (AC-215), then by type (AC-025). */}
          {byCube.map(([cube, groups]) => (
            <section
              key={cube}
              className="field-list__cube"
              aria-label={`${cubeTitle(cube)} fields`}
            >
              <h3 className="field-list__cube-head">
                {cubeTitle(cube)}
                <span className="field-list__count">
                  {groups.reduce((sum, [, group]) => sum + group.length, 0)}
                </span>
              </h3>
              {groups.map(([kind, group]) => (
                <div key={kind} data-testid={`group-${kind}`} data-cube={cube}>
                  <h4>{GROUP_LABELS[kind]}</h4>
                  <ul aria-label={`${cubeTitle(cube)} ${GROUP_LABELS[kind]}`}>
                    {group.map((member) => (
                      <li key={member.name} data-testid={`member-${member.name}`}>
                        <FieldRow
                          member={member}
                          used={used.has(member.name)}
                          onAdd={onAdd}
                          onDragStateChange={onDragStateChange}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
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
  onAdd,
  onDragStateChange,
}: {
  member: Member;
  used: boolean;
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
      <span className="field-row__meta">{fieldMetaOf(member)}</span>
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
