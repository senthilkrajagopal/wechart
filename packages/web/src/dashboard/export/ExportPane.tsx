import { useMutation, useQuery } from '@tanstack/react-query';
import { DRIVERS, type DriverType, type FieldValue } from '@wechart/core';
import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from 'react';

import { DiscardQuestion } from '../../shell/DiscardQuestion';
import { CloseIcon } from '../../shell/paneIcons';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { fieldLabel, methodLabel } from '../../workspaces/data-sources/ConnectionForm';

/**
 * Exporting a dashboard (T511; AC-354, AC-355, AC-360; design 13, screen 1
 * and states B–F): design 01's docked pane, 480 px, its head and foot pinned.
 *
 * - **Always in the file:** the dashboard as saved and its own charts, as
 *   locked rows; bookmarks never go, and it says so.
 * - **Choose what goes with it:** the library charts it shows, the models
 *   its charts use and the data sources those bind to, each group with a
 *   tri-state box and "n of m", every row ticked to start (R44, Q6) and
 *   saying what uses it. A data source says "Settings only · no secrets",
 *   and its Details name what goes and each secret that doesn't (AC-355).
 * - **Not offered:** counted with its reason, naming nothing (R46, Q5).
 * - **The foot:** what the file holds, its name (`<name>.wechart.json`,
 *   renamable), and Export file, which downloads it as a browser Blob.
 *
 * Hovering over or focusing a dependency outlines the dashboard's tiles that
 * use it (AC-360, P1), through `onOutline`.
 */
export interface Outline {
  /** The charts whose tiles are outlined. */
  readonly chartIds: readonly string[];
  /** What the outline's chip names. */
  readonly label: string;
}

interface Offered {
  readonly dashboard: {
    readonly id: string;
    readonly title: string;
    readonly version: number;
    readonly path: readonly string[] | null;
    readonly targetPath?: readonly string[];
  };
  readonly fileName: string;
  readonly ownCharts: readonly { readonly id: string; readonly title: string }[];
  readonly libraryCharts: readonly {
    readonly id: string;
    readonly title: string;
    readonly path: readonly string[] | null;
    readonly chartIds: readonly string[];
  }[];
  readonly models: readonly {
    readonly id: string;
    readonly path: string;
    readonly folderPath: readonly string[];
    readonly chartIds: readonly string[];
    /** Used by the dashboard's own filters or text too. */
    readonly byDashboard?: boolean;
  }[];
  readonly dataSources: readonly {
    readonly id: string;
    readonly name: string;
    readonly driver: string;
    readonly authMethod: string;
    readonly fields: Readonly<Record<string, FieldValue>>;
    readonly description: string | null;
    readonly folderPath: readonly string[];
    readonly boundBy: readonly string[];
    readonly chartIds: readonly string[];
  }[];
  readonly notOffered: {
    /** Charts on it the user may not open. */
    readonly charts?: number;
    readonly models: number;
    readonly dataSources: number;
    readonly folders: number;
    readonly usedBy: readonly string[];
  };
  readonly viewOnly: boolean;
}

type Group = 'libraryCharts' | 'models' | 'dataSources';

/** "A", "A and B", "A, B and C". */
export const listed = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
const counted = (count: number, one: string, many = `${one}s`) =>
  `${String(count)} ${count === 1 ? one : many}`;
/** A folder's path as the pane says it: Shared for the root. */
const pathText = (path: readonly string[]) => (path.length === 0 ? 'Shared' : path.join(' / '));

/** Downloads the file (R46): a Blob and an anchor, no package. */
export function saveFile(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // After the click has handed the download over.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/** The API's own words, where it gives them. */
async function saidBy(response: Response, fallback: string): Promise<string> {
  const said = ((await response.json().catch(() => null)) as { error?: unknown } | null)?.error;
  return typeof said === 'string' ? said : fallback;
}

/** A setting's value as Details shows it. */
const valueText = (value: FieldValue) =>
  value === true ? 'On' : value === false ? 'Off' : value === null ? '—' : String(value);

export function ExportPane({
  dashboardId,
  title,
  onClose,
  onOutline,
  onExported,
  save = saveFile,
  className = '',
}: {
  readonly dashboardId: string;
  /** The dashboard's name, said while what it uses is found. */
  readonly title: string;
  readonly onClose: () => void;
  readonly onOutline?: (outline: Outline | null) => void;
  /** The file downloaded: what the toast says (state E). */
  readonly onExported: (message: string) => void;
  readonly save?: (text: string, name: string) => void;
  /** Where it docks: beside Explore's list, or over a dashboard's edge. */
  readonly className?: string;
}) {
  const ids = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const offer = useQuery({
    queryKey: ['export-offer', dashboardId],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/export/dashboards/${encodeURIComponent(dashboardId)}`, {
        signal,
      });
      if (!response.ok)
        throw new Error(await saidBy(response, `wechart answered ${String(response.status)}.`));
      return (await response.json()) as Offered;
    },
    // What it uses now: a chart or model may have changed since.
    staleTime: 0,
    gcTime: 0,
  });
  const offered = offer.data;

  /** What is left out, by group; everything starts ticked (R44, Q6). */
  const [cleared, setCleared] = useState<Record<Group, ReadonlySet<string>>>({
    libraryCharts: new Set(),
    models: new Set(),
    dataSources: new Set(),
  });
  const [folded, setFolded] = useState<ReadonlySet<Group>>(new Set());
  const [details, setDetails] = useState<ReadonlySet<string>>(new Set());
  const [fileName, setFileName] = useState<string | null>(null);
  const name = fileName ?? offered?.fileName ?? '';

  // Focus goes to the heading as it opens (design 13, keyboard table).
  useEffect(() => {
    heading.current?.focus();
  }, []);
  /**
   * Escape closes it at once, ticked boxes being no work to lose (rule 85),
   * but a file name typed is: then Escape, Cancel and × ask first (T405).
   * Escape pressed in it, or with focus on nothing, not one a menu or a field
   * elsewhere has taken (as the New data source pane has it); over the
   * question, it keeps editing.
   */
  const pane = useRef<HTMLElement>(null);
  const [asking, setAsking] = useState(false);
  const typedName = fileName !== null && fileName !== (offered?.fileName ?? '');
  const keepEditing = () => {
    setAsking(false);
    pane.current?.querySelector<HTMLInputElement>('.export-pane__file input')?.focus();
  };
  const requestClose = () => {
    if (typedName) setAsking(true);
    else onClose();
  };
  const closing = useRef(requestClose);
  useEffect(() => {
    closing.current = asking ? keepEditing : requestClose;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const at = event.target;
      const ours =
        at === document.body ||
        at === document.documentElement ||
        (at instanceof Node && pane.current?.contains(at) === true);
      if (!ours) return;
      event.preventDefault();
      closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
  // No outline outlives the pane.
  const outline = useRef(onOutline);
  useEffect(() => {
    outline.current = onOutline;
  }, [onOutline]);
  useEffect(
    () => () => {
      outline.current?.(null);
    },
    [],
  );

  const rows = (group: Group): readonly { id: string }[] =>
    offered === undefined ? [] : offered[group];
  const chosen = (group: Group) => rows(group).filter((row) => !cleared[group].has(row.id));
  const setGroup = (group: Group, on: boolean) => {
    setCleared((now) => ({
      ...now,
      [group]: on ? new Set() : new Set(rows(group).map((row) => row.id)),
    }));
  };
  const toggle = (group: Group, id: string) => {
    setCleared((now) => {
      const next = new Set(now[group]);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...now, [group]: next };
    });
  };
  const everything = (on: boolean) => {
    (['libraryCharts', 'models', 'dataSources'] as const).forEach((group) => {
      setGroup(group, on);
    });
    // None folds the groups (state B); All opens them.
    setFolded(on ? new Set() : new Set(['libraryCharts', 'models', 'dataSources']));
  };

  const charts = (offered?.ownCharts.length ?? 0) + chosen('libraryCharts').length;
  const models = chosen('models').length;
  const sources = chosen('dataSources').length;
  const holds = [
    '1 dashboard',
    counted(charts, 'chart'),
    ...(models === 0 ? [] : [counted(models, 'model')]),
    ...(sources === 0 ? [] : [counted(sources, 'data source')]),
  ];
  const nothingChosen = chosen('libraryCharts').length + models + sources === 0;

  const exporting = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/export/dashboards/${encodeURIComponent(dashboardId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          libraryCharts: chosen('libraryCharts').map((row) => row.id),
          models: chosen('models').map((row) => row.id),
          dataSources: chosen('dataSources').map((row) => row.id),
        }),
      });
      if (!response.ok)
        throw new Error(
          await saidBy(response, `It could not be exported (${String(response.status)}).`),
        );
      return response.text();
    },
    onSuccess: (text) => {
      save(text, name);
      onExported(
        `Exported ${name}: ${listed(holds)}${sources === 0 ? '' : ', without their secrets'}.`,
      );
    },
  });

  const titleOf = new Map(
    [...(offered?.ownCharts ?? []), ...(offered?.libraryCharts ?? [])].map((chart) => [
      chart.id,
      chart.title,
    ]),
  );
  /**
   * "Used by 5 charts", or the charts by name where one or two; the
   * dashboard itself first, where its own filters or text use it.
   */
  const usedBy = (chartIds: readonly string[], byDashboard = false) => {
    const named = chartIds.map((id) => titleOf.get(id) ?? 'a chart');
    const charts = named.length <= 2 ? named : [counted(named.length, 'chart')];
    return `Used by ${listed([...(byDashboard ? ['the dashboard'] : []), ...charts])}`;
  };
  const usedInFull = (chartIds: readonly string[], byDashboard = false) =>
    `Used by ${listed([
      ...(byDashboard ? ['the dashboard'] : []),
      ...chartIds.map((id) => titleOf.get(id) ?? 'a chart'),
    ])}`;
  /**
   * The row with focus, whose tiles stay outlined when the pointer leaves
   * another row (AC-360): hovering is a glance, focus is where the user is.
   */
  const focused = useRef<Outline | null>(null);
  const toOutline = (chartIds: readonly string[], label: string) => ({
    onMouseEnter: () => {
      onOutline?.({ chartIds, label });
    },
    onMouseLeave: () => {
      onOutline?.(focused.current);
    },
    onFocus: () => {
      focused.current = { chartIds, label };
      onOutline?.(focused.current);
    },
    onBlur: (event: FocusEvent<HTMLLIElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      focused.current = null;
      onOutline?.(null);
    },
  });

  const where = offered?.dashboard.path;
  const whereText =
    where == null
      ? ''
      : where[0] === 'My workspace'
        ? `My workspace · your draft${offered?.dashboard.targetPath === undefined ? '' : ` → ${pathText(offered.dashboard.targetPath)}`}`
        : `${pathText(where)} · version ${String(offered?.dashboard.version ?? 1)}, as the folder has it`;

  const notOffered = offered?.notOffered;
  const hidden =
    notOffered === undefined || offered?.viewOnly === true
      ? []
      : [
          ...(notOffered.models === 0 ? [] : [counted(notOffered.models, 'model')]),
          ...(notOffered.dataSources === 0 ? [] : [counted(notOffered.dataSources, 'data source')]),
        ];
  /** What isn't offered, said as design 13 says it (pin 10), naming only the charts that use it. */
  const unoffered = [
    ...((notOffered?.charts ?? 0) === 0
      ? []
      : [`${counted(notOffered?.charts ?? 0, 'chart')} on it`]),
    ...(hidden.length === 0 || notOffered === undefined
      ? []
      : [
          `${listed(hidden)} that ${listed(notOffered.usedBy)} ${notOffered.usedBy.length === 1 ? 'uses' : 'use'}`,
        ]),
  ];

  return (
    <aside
      ref={pane}
      role="dialog"
      aria-labelledby={`${ids}-heading`}
      className={`source-pane export-pane ${className}`.trim()}
    >
      <header className="source-pane__head">
        <h2 id={`${ids}-heading`} ref={heading} tabIndex={-1}>
          Export dashboard
        </h2>
        <button
          type="button"
          className="icon-button source-pane__close"
          aria-label="Close"
          onClick={requestClose}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="source-pane__chosen export-pane__what">
        <span className="itemicon ic-dash" data-icon="dashboard" aria-hidden="true" />
        <span className="source-pane__chosen-text">
          <b>{offered?.dashboard.title ?? title}</b>
          <span>{whereText}</span>
        </span>
      </div>

      <div className="source-pane__body export-pane__body">
        {offer.isPending ? (
          <div className="export-pane__finding" aria-busy="true">
            <StateLine kind="run">Finding what {title} uses…</StateLine>
            <span className="export-pane__skeleton" />
            <span className="export-pane__skeleton" />
            <span className="export-pane__skeleton" />
          </div>
        ) : offer.isError ? (
          <div className="export-pane__failed">
            <p className="source-pane__alert" role="alert">
              <StatusIcon kind="err" />
              <span>
                <b>Couldn’t list what {title} uses.</b> {offer.error.message}
              </span>
            </p>
            <button type="button" className="btn btn-sm" onClick={() => void offer.refetch()}>
              Retry
            </button>
          </div>
        ) : offered === undefined ? null : (
          <>
            <section className="export-pane__section" aria-labelledby={`${ids}-always`}>
              <h3 id={`${ids}-always`} className="connection-form__legend">
                Always in the file
              </h3>
              <ul className="export-pane__always" aria-labelledby={`${ids}-always`}>
                <li>
                  <Lock />
                  <span className="itemicon ic-dash" data-icon="dashboard" aria-hidden="true" />
                  <span className="export-pane__name">{offered.dashboard.title}</span>
                  <span className="export-pane__aside">the dashboard, as saved</span>
                </li>
                <li>
                  <Lock />
                  <span className="itemicon ic-chart" data-icon="chart" aria-hidden="true" />
                  <span className="export-pane__name">
                    {counted(offered.ownCharts.length, 'own chart')}
                  </span>
                  <span className="export-pane__aside">made on this dashboard</span>
                </li>
              </ul>
              <p className="export-pane__note">
                <BookmarkIcon />
                Bookmarks aren’t exported, yours or shared.
              </p>
            </section>

            <section className="export-pane__section" aria-labelledby={`${ids}-choose`}>
              <div className="export-pane__choose">
                <h3 id={`${ids}-choose`} className="connection-form__legend">
                  Choose what goes with it
                </h3>
                {offered.viewOnly ? null : (
                  <span className="export-pane__all">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        everything(true);
                      }}
                    >
                      All
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        everything(false);
                      }}
                    >
                      None
                    </button>
                  </span>
                )}
              </div>

              <ExportGroup
                label="Library charts it shows"
                total={offered.libraryCharts.length}
                chosen={chosen('libraryCharts').length}
                folded={folded.has('libraryCharts')}
                onFold={(fold) => {
                  setFolded((now) => {
                    const next = new Set(now);
                    if (fold) next.add('libraryCharts');
                    else next.delete('libraryCharts');
                    return next;
                  });
                }}
                onSet={(on) => {
                  setGroup('libraryCharts', on);
                }}
              >
                {offered.libraryCharts.map((chart) => (
                  <ExportRow
                    key={chart.id}
                    icon="chart"
                    name={chart.title}
                    checked={!cleared.libraryCharts.has(chart.id)}
                    onToggle={() => {
                      toggle('libraryCharts', chart.id);
                    }}
                    aside={chart.path === null ? 'folder not shown' : pathText(chart.path)}
                    used={`On the tile ${chart.title}${chart.path === null ? ' · kept in a folder you can’t see' : ''}`}
                    outline={toOutline(chart.chartIds, chart.title)}
                  />
                ))}
              </ExportGroup>

              {offered.viewOnly ? (
                <p className="export-pane__hidden" data-testid="export-view-only">
                  <HiddenIcon />
                  <span>
                    <b>Models and data sources aren’t offered.</b> With View only access you see
                    dashboards and the charts on them, not the models or data sources behind them.
                  </span>
                </p>
              ) : (
                <>
                  <ExportGroup
                    label="Models its charts use"
                    total={offered.models.length}
                    chosen={chosen('models').length}
                    folded={folded.has('models')}
                    onFold={(fold) => {
                      setFolded((now) => {
                        const next = new Set(now);
                        if (fold) next.add('models');
                        else next.delete('models');
                        return next;
                      });
                    }}
                    onSet={(on) => {
                      setGroup('models', on);
                    }}
                  >
                    {offered.models.map((model) => (
                      <ExportRow
                        key={model.id}
                        icon="model"
                        code
                        name={model.path}
                        checked={!cleared.models.has(model.id)}
                        onToggle={() => {
                          toggle('models', model.id);
                        }}
                        aside={pathText(model.folderPath)}
                        used={usedBy(model.chartIds, model.byDashboard)}
                        usedInFull={usedInFull(model.chartIds, model.byDashboard)}
                        outline={toOutline(model.chartIds, model.path)}
                      />
                    ))}
                  </ExportGroup>

                  <ExportGroup
                    label="Data sources those models bind to"
                    total={offered.dataSources.length}
                    chosen={chosen('dataSources').length}
                    folded={folded.has('dataSources')}
                    onFold={(fold) => {
                      setFolded((now) => {
                        const next = new Set(now);
                        if (fold) next.add('dataSources');
                        else next.delete('dataSources');
                        return next;
                      });
                    }}
                    onSet={(on) => {
                      setGroup('dataSources', on);
                    }}
                    note="Settings only. Never a password, key or token, nor an encrypted copy of one."
                  >
                    {offered.dataSources.map((source) => {
                      const driver = (DRIVERS as Record<string, (typeof DRIVERS)[DriverType] | undefined>)[
                        source.driver
                      ];
                      const open = details.has(source.id);
                      return (
                        <ExportRow
                          key={source.id}
                          icon="data-source"
                          code
                          name={source.name}
                          checked={!cleared.dataSources.has(source.id)}
                          onToggle={() => {
                            toggle('dataSources', source.id);
                          }}
                          badge="Settings only · no secrets"
                          used={`${driver?.label ?? source.driver} in ${pathText(source.folderPath)} · bound by ${source.boundBy.length === 0 ? 'a model you can’t see' : listed(source.boundBy)}`}
                          outline={toOutline(source.chartIds, source.name)}
                          more={
                            <button
                              type="button"
                              className="link-button export-row__details"
                              aria-expanded={open}
                              onClick={() => {
                                setDetails((now) => {
                                  const next = new Set(now);
                                  if (next.has(source.id)) next.delete(source.id);
                                  else next.add(source.id);
                                  return next;
                                });
                              }}
                            >
                              {open ? 'Hide details' : 'Details'}
                            </button>
                          }
                        >
                          {open && driver !== undefined ? (
                            <SourceDetails
                              driver={driver.type}
                              authMethod={source.authMethod}
                              fields={source.fields}
                              description={source.description}
                            />
                          ) : null}
                        </ExportRow>
                      );
                    })}
                  </ExportGroup>

                </>
              )}

              {unoffered.length === 0 ? null : (
                <p className="export-pane__hidden" data-testid="export-not-offered">
                  <HiddenIcon />
                  <span>
                    <b>Not offered:</b>{' '}
                    {`${unoffered.join('; ')}, in ${notOffered?.folders === 1 ? 'a folder' : 'folders'} you can’t see.`}
                  </span>
                </p>
              )}

              {nothingChosen ? (
                <p className="export-pane__info" role="note">
                  <StatusIcon kind="info" />
                  <span>
                    Only the dashboard and its own charts. Where it’s imported, its charts find their
                    cubes only if cubes of the same names are found along its target folder’s path.
                  </span>
                </p>
              ) : null}
            </section>
          </>
        )}
        {exporting.isError ? <StateLine kind="err">{exporting.error.message}</StateLine> : null}
      </div>

      <footer className="source-pane__foot export-pane__foot">
        <p className="export-pane__holds">
          <span data-testid="export-counts">
            <b>In the file:</b> {holds.join(' · ')}
          </span>
          <span>No secrets · no bookmarks</span>
        </p>
        <div className="export-pane__file">
          <label htmlFor={`${ids}-file`}>File name</label>
          <input
            id={`${ids}-file`}
            className="is-code"
            spellCheck={false}
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setFileName(event.target.value);
            }}
          />
        </div>
        <div className="export-pane__actions">
          {offer.isSuccess ? null : (
            <span className="source-pane__foot-note">Export waits for the list</span>
          )}
          <span className="source-pane__spacer" />
          <button type="button" className="btn btn-ghost" onClick={requestClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!offer.isSuccess || name.trim() === '' || exporting.isPending}
            onClick={() => {
              exporting.mutate();
            }}
          >
            <DownloadIcon />
            {exporting.isPending ? 'Exporting…' : 'Export file'}
          </button>
        </div>
      </footer>
      {asking ? (
        <DiscardQuestion
          body="The file name you typed isn’t kept."
          onKeep={keepEditing}
          onDiscard={onClose}
        />
      ) : null}
    </aside>
  );
}

/** A group of dependencies, its box tri-state (all, some, none), with "n of m" (pin 5). */
function ExportGroup({
  label,
  total,
  chosen,
  folded,
  onFold,
  onSet,
  note,
  children,
}: {
  readonly label: string;
  readonly total: number;
  readonly chosen: number;
  readonly folded: boolean;
  readonly onFold: (fold: boolean) => void;
  readonly onSet: (on: boolean) => void;
  readonly note?: string;
  readonly children: ReactNode;
}) {
  const ids = useId();
  const box = useRef<HTMLInputElement>(null);
  const some = chosen > 0 && chosen < total;
  useEffect(() => {
    if (box.current !== null) box.current.indeterminate = some;
  }, [some]);
  return (
    <div role="group" aria-labelledby={`${ids}-label`} className="export-group">
      <div className="export-group__head">
        <button
          type="button"
          className="export-group__fold"
          aria-expanded={!folded}
          aria-label={folded ? `Show ${label}` : `Hide ${label}`}
          onClick={() => {
            onFold(!folded);
          }}
        >
          <span aria-hidden="true">{folded ? '›' : '⌄'}</span>
        </button>
        <label className="export-group__label">
          <input
            ref={box}
            type="checkbox"
            checked={total > 0 && chosen === total}
            disabled={total === 0}
            aria-describedby={`${ids}-count`}
            onChange={() => {
              onSet(chosen < total);
            }}
          />
          <span id={`${ids}-label`}>{label}</span>
        </label>
        <span id={`${ids}-count`} className="export-group__count">
          {`${String(chosen)} of ${String(total)}`}
        </span>
      </div>
      {folded ? null : (
        <>
          {note === undefined ? null : (
            <p className="export-group__note" role="note">
              <Lock />
              {note}
            </p>
          )}
          {total === 0 ? (
            <p className="export-group__none">None.</p>
          ) : (
            <ul className="export-group__rows">{children}</ul>
          )}
        </>
      )}
    </div>
  );
}

/** One dependency: its box, what it is, where it is, and what uses it (pin 6). */
function ExportRow({
  icon,
  code = false,
  name,
  checked,
  onToggle,
  aside,
  badge,
  used,
  usedInFull,
  outline,
  more,
  children,
}: {
  readonly icon: 'chart' | 'model' | 'data-source';
  readonly code?: boolean;
  readonly name: string;
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly aside?: string;
  readonly badge?: string;
  readonly used: string;
  /** The charts by name, where `used` counts them: the tooltip and the description. */
  readonly usedInFull?: string;
  readonly outline: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onFocus: () => void;
    onBlur: (event: FocusEvent<HTMLLIElement>) => void;
  };
  readonly more?: ReactNode;
  readonly children?: ReactNode;
}) {
  const ids = useId();
  const chip = { chart: 'ic-chart', model: 'ic-model', 'data-source': 'ic-source' }[icon];
  const full = usedInFull !== undefined && usedInFull !== used ? usedInFull : undefined;
  return (
    <li className="export-row" data-checked={checked ? 'true' : 'false'} {...outline}>
      <div className="export-row__line">
        <label className="export-row__main">
          <input
            type="checkbox"
            checked={checked}
            aria-describedby={`${ids}-used${full === undefined ? '' : ` ${ids}-full`}`}
            onChange={onToggle}
          />
          <span className={`itemicon ${chip}`} data-icon={icon} aria-hidden="true" />
          <span className={code ? 'export-row__name is-code' : 'export-row__name'}>{name}</span>
        </label>
        {badge === undefined ? null : (
          <span className="export-row__badge">
            <Lock />
            {badge}
          </span>
        )}
        {aside === undefined ? null : <span className="export-row__aside">{aside}</span>}
      </div>
      <div className="export-row__line export-row__line--used">
        <span id={`${ids}-used`} className="export-row__used" title={full}>
          {used}
        </span>
        {full === undefined ? null : (
          <span id={`${ids}-full`} className="visually-hidden">
            {full}
          </span>
        )}
        {more}
      </div>
      {children}
    </li>
  );
}

/**
 * A data source's Details (state C): each setting that goes, from its
 * driver's fields, and each secret field that doesn't, by name (AC-355).
 */
function SourceDetails({
  driver,
  authMethod,
  fields,
  description,
}: {
  readonly driver: DriverType;
  readonly authMethod: string;
  readonly fields: Readonly<Record<string, FieldValue>>;
  readonly description: string | null;
}) {
  const ids = useId();
  const spec = DRIVERS[driver];
  const method = spec.auth.find((each) => each.id === authMethod);
  const user = method?.fields.find(
    (field) => field.secret !== true && (field.key === 'user' || field.key === 'username'),
  );
  const userValue = user === undefined ? undefined : fields[user.key];
  const settings = [
    ...spec.connection,
    ...(method?.fields ?? []).filter((field) => field !== user),
  ].filter((field) => field.secret !== true && Object.hasOwn(fields, field.key));
  const secrets = (method?.fields ?? []).filter((field) => field.secret === true);
  return (
    <div className="export-details">
      <h4 id={`${ids}-goes`} className="export-details__head">
        <StatusIcon kind="ok" />
        Goes in the file
      </h4>
      <ul aria-labelledby={`${ids}-goes`} className="export-details__list">
        <li>
          <span>Driver</span>
          <span>{spec.label}</span>
        </li>
        {settings.map((field) => (
          <li key={field.key}>
            <span>{fieldLabel(driver, field)}</span>
            <span className="is-code">{valueText(fields[field.key] ?? null)}</span>
          </li>
        ))}
        {method === undefined ? null : (
          <li>
            <span>Signs in with</span>
            <span>
              {methodLabel(driver, method)}
              {userValue == null || userValue === '' ? '' : `, as ${String(userValue)}`}
            </span>
          </li>
        )}
        {description === null || description === '' ? null : (
          <li>
            <span>Description</span>
            <span>{description}</span>
          </li>
        )}
      </ul>
      <h4 id={`${ids}-never`} className="export-details__head">
        <Lock />
        Never in the file
      </h4>
      {secrets.length === 0 ? (
        <p className="export-details__note">Its way of signing in takes no secret.</p>
      ) : (
        <>
          <ul aria-labelledby={`${ids}-never`} className="export-details__never">
            {secrets.map((field) => (
              <li key={field.key}>{fieldLabel(driver, field)}</li>
            ))}
          </ul>
          <p className="export-details__note">
            Nor an encrypted copy of {secrets.length === 1 ? 'it' : secrets.length === 2 ? 'either' : 'any'}.
            Whoever imports it enters {secrets.length === 1 ? 'it' : 'them'}.
          </p>
        </>
      )}
    </div>
  );
}

function Lock() {
  return (
    <svg className="export-lock" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M4 2h8v12l-4-3-4 3z" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function HiddenIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
