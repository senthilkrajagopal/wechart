import { useQuery } from '@tanstack/react-query';
import {
  DRIVERS,
  nameProblem,
  type DriverType,
  type ExportedDataSource,
  type FieldValue,
  type SealedV1,
} from '@wechart/core';
import { useEffect, useId, useRef, useState } from 'react';

import { StateLine, StatusIcon } from '../../../shell/StatusIcon';
import { fieldLabel } from '../../data-sources/ConnectionForm';
import { signsInOf, storedValuesOf, tlsOf, whereOf } from '../../data-sources/connectionSummary';
import {
  CHECK_LABELS,
  ConnectionChecks,
  errorOf,
  sealerOf,
  type Check,
  type Seal,
} from '../../data-sources/connectionTest';
import { DATA_SOURCES_QUERY } from '../../data-sources/query';
import { folderChain, FOLDERS_QUERY } from '../folders';

/**
 * The Import pane's Data sources step (T514; AC-358, AC-361, AC-282, AC-163;
 * design 13, states M, N, O and P). Each data source in the file is:
 *
 * - **mapped** to an existing one a model in the target can bind to: the
 *   target's own, then each folder above it, then Shared (AC-273), of those
 *   the user may see. A same-named one is marked and listed first in its
 *   folder, never chosen for them. One with another driver is warned of,
 *   naming both drivers, and blocks nothing (AC-361, P5); or
 * - **created** in My workspace from the file's settings, as they are
 *   (design 13's P4 wasn't adopted), with its secrets typed and sealed in the
 *   browser (AC-325), and decided only once a test of exactly those settings
 *   has passed (AC-163, AC-158). A name the target already holds is refused
 *   on its row until it is mapped or renamed (AC-282, state P).
 *
 * It is created only at Import, from the test that passed.
 */
export type SourceDecision =
  | {
      readonly kind: 'map';
      readonly to: {
        readonly id: string;
        readonly name: string;
        readonly driver: string;
        readonly path: readonly string[];
      };
    }
  | {
      readonly kind: 'create';
      readonly name: string;
      readonly driver: string;
      readonly authMethod: string;
      readonly fields: Readonly<Record<string, FieldValue>>;
      readonly description: string | null;
      readonly sealed: Readonly<Record<string, SealedV1>>;
      /** The test that passed, which the create claims, and the earlier ones. */
      readonly testId: string;
      readonly trials: readonly string[];
      /** When it passed, as Review says it. */
      readonly at: string;
    };

interface Tested {
  readonly ok: boolean;
  readonly testId?: string;
  readonly checks: readonly Check[];
  readonly sealed: Readonly<Record<string, SealedV1>>;
  readonly at: string;
}

interface Row {
  readonly mode?: 'map' | 'create' | undefined;
  readonly mapTo?: string | undefined;
  readonly name: string;
  readonly secrets: Readonly<Record<string, string>>;
  readonly tested?: Tested | undefined;
  /** Every test run for it, so they join the history of the one made (AC-163). */
  readonly trials: readonly string[];
  readonly testing: boolean;
  readonly failure?: string | undefined;
}

const clock = () =>
  new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
const pathText = (path: readonly string[]) => (path.length === 0 ? 'Shared' : path.join(' / '));
const driverLabel = (driver: string) =>
  (DRIVERS as Record<string, { label: string } | undefined>)[driver]?.label ?? driver;
const known = (driver: string): driver is DriverType => Object.hasOwn(DRIVERS, driver);

export function ImportSources({
  sources,
  target,
  seal: givenSeal,
  onDecisions,
}: {
  readonly sources: readonly ExportedDataSource[];
  readonly target: { readonly id: string; readonly path: readonly string[] };
  readonly seal?: Seal;
  readonly onDecisions: (decisions: Readonly<Record<string, SourceDecision | undefined>>) => void;
}) {
  const [seal] = useState<Seal>(() => givenSeal ?? sealerOf());
  const listed = useQuery(DATA_SOURCES_QUERY);
  const folders = useQuery(FOLDERS_QUERY);
  const [rows, setRows] = useState<Readonly<Record<string, Row>>>(() =>
    Object.fromEntries(
      sources.map((source) => [
        source.name,
        { name: source.name, secrets: {}, trials: [], testing: false },
      ]),
    ),
  );
  const change = (name: string, next: (row: Row) => Row) => {
    setRows((now) => ({ ...now, [name]: next(now[name]!) }));
  };

  // The folders a model in the target binds from: its own, then each above it, to Shared.
  const chain = [
    ...folderChain(folders.data ?? [], target.id)
      .map((crumb) => crumb.id)
      .filter((id) => id !== 'root')
      .reverse(),
    'root',
  ];
  const bindable = (listed.data ?? [])
    .filter((source) => chain.includes(source.folderId))
    .sort((a, b) => chain.indexOf(a.folderId) - chain.indexOf(b.folderId));
  const heldByTarget = (listed.data ?? []).filter((source) => source.folderId === target.id);
  const pathOf = (source: { folderPath: readonly { title: string }[] }) =>
    source.folderPath.map((folder) => folder.title);

  const decisionOf = (source: ExportedDataSource, row: Row): SourceDecision | undefined => {
    if (row.mode === 'map') {
      const to = bindable.find((each) => each.id === row.mapTo);
      return to === undefined
        ? undefined
        : { kind: 'map', to: { id: to.id, name: to.name, driver: to.driver, path: pathOf(to) } };
    }
    if (row.mode !== 'create' || !named(row.name)) return undefined;
    if (heldByTarget.some((held) => held.name === row.name)) return undefined;
    const tested = row.tested;
    if (tested?.ok !== true || tested.testId === undefined) return undefined;
    const testId = tested.testId;
    return {
      kind: 'create',
      name: row.name,
      driver: source.driver,
      authMethod: source.authMethod,
      fields: source.fields,
      description: source.description,
      sealed: tested.sealed,
      testId,
      trials: row.trials.filter((id) => id !== testId),
      at: tested.at,
    };
  };
  const decisions = Object.fromEntries(
    sources.map((source) => [source.name, decisionOf(source, rows[source.name]!)]),
  );
  const said = useRef('');
  const decided = JSON.stringify(decisions);
  useEffect(() => {
    if (said.current === decided) return;
    said.current = decided;
    onDecisions(JSON.parse(decided) as Record<string, SourceDecision | undefined>);
  }, [decided, onDecisions]);

  const runTest = async (source: ExportedDataSource) => {
    if (!known(source.driver)) return;
    const driver = source.driver;
    const row = rows[source.name]!;
    change(source.name, (now) => ({
      ...now,
      testing: true,
      failure: undefined,
      tested: undefined,
    }));
    try {
      const sealed: Record<string, SealedV1> = {};
      for (const [field, secret] of Object.entries(row.secrets))
        if (secret !== '') sealed[field] = await seal(driver, field, source.fields, secret);
      const response = await fetch('/api/data-sources/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          folderId: 'mine',
          driver,
          authMethod: source.authMethod,
          fields: source.fields,
          sealed,
        }),
      });
      if (!response.ok) throw new Error(await errorOf(response, 'run the test'));
      const answer = (await response.json()) as { ok: boolean; testId?: string; checks: Check[] };
      const { testId } = answer;
      change(source.name, (now) => ({
        ...now,
        testing: false,
        tested: { ...answer, sealed, at: clock() },
        trials: testId === undefined ? now.trials : [...now.trials, testId],
      }));
    } catch (error) {
      change(source.name, (now) => ({ ...now, testing: false, failure: (error as Error).message }));
    }
  };

  return (
    <div className="import-sources">
      {sources.map((source) => (
        <SourceRow
          key={source.name}
          source={source}
          row={rows[source.name]!}
          decided={decisions[source.name] !== undefined}
          target={target}
          bindable={bindable.map((each) => ({
            id: each.id,
            name: each.name,
            driver: each.driver,
            path: pathOf(each),
            folderId: each.folderId,
          }))}
          chain={chain}
          folderTitles={
            new Map([
              ['root', 'Shared'],
              ...folderChain(folders.data ?? [], target.id).map(
                (crumb) => [crumb.id, crumb.title] as [string, string],
              ),
            ])
          }
          taken={heldByTarget.find((held) => held.name === rows[source.name]!.name)?.id}
          onChange={(next) => {
            change(source.name, next);
          }}
          onTest={() => void runTest(source)}
        />
      ))}
    </div>
  );
}

/** A name a data source takes, as the API does: R72's grammar, core's one rule (T703, AC-426). */
const named = (name: string) => nameProblem(name, 'data-source') === undefined;

function SourceRow({
  source,
  row,
  decided,
  target,
  bindable,
  chain,
  folderTitles,
  taken,
  onChange,
  onTest,
}: {
  readonly source: ExportedDataSource;
  readonly row: Row;
  readonly decided: boolean;
  readonly target: { readonly id: string; readonly path: readonly string[] };
  readonly bindable: readonly {
    readonly id: string;
    readonly name: string;
    readonly driver: string;
    readonly path: readonly string[];
    readonly folderId: string;
  }[];
  readonly chain: readonly string[];
  readonly folderTitles: ReadonlyMap<string, string>;
  /** The target's own data source of the name typed, where it holds one (AC-282). */
  readonly taken: string | undefined;
  readonly onChange: (next: (row: Row) => Row) => void;
  readonly onTest: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const targetText = pathText(target.path);
  const driver = known(source.driver) ? source.driver : undefined;
  const method =
    driver === undefined
      ? undefined
      : DRIVERS[driver].auth.find((each) => each.id === source.authMethod);
  const secrets = (method?.fields ?? []).filter((field) => field.secret === true);
  const missing = secrets.some(
    (field) => field.required && (row.secrets[field.key] ?? '').trim() === '',
  );
  const values =
    driver === undefined ? undefined : storedValuesOf(driver, source.authMethod, source.fields);
  const nameTaken = row.mode === 'create' && taken !== undefined;
  const firstFailed = row.tested?.checks.find((check) => check.status === 'failed');
  const status =
    row.mode === 'map'
      ? decided
        ? 'Mapped'
        : 'To decide'
      : row.mode === 'create'
        ? nameTaken
          ? 'Name taken'
          : row.testing
            ? 'Testing…'
            : row.tested === undefined
              ? 'To decide'
              : row.tested.ok
                ? `Passed · ${row.tested.at}`
                : `Failed at ${firstFailed === undefined ? 'a check' : (CHECK_LABELS[firstFailed.id] ?? firstFailed.id)} · ${row.tested.at}`
        : 'To decide';
  const mapped = bindable.find((each) => each.id === row.mapTo);

  return (
    <div ref={box} role="group" aria-labelledby={`${ids}-name`} className="import-source">
      <div className="import-source__head">
        <span className="itemicon ic-source" data-icon="data-source" aria-hidden="true" />
        <b id={`${ids}-name`} className="is-code">
          {source.name}
        </b>
        <span className="import-source__driver">{driverLabel(source.driver)}</span>
        <span className="import-source__status">
          <StatusIcon
            kind={
              status === 'Mapped' || status.startsWith('Passed')
                ? 'ok'
                : status === 'Name taken' || status.startsWith('Failed')
                  ? 'err'
                  : status === 'Testing…'
                    ? 'run'
                    : 'idle'
            }
          />
          {status}
        </span>
      </div>
      <div
        className="import-source__modes"
        role="radiogroup"
        aria-label={`What to do with ${source.name}`}
      >
        <label>
          <input
            type="radio"
            name={`${ids}-mode`}
            checked={row.mode === 'map'}
            disabled={row.testing}
            onChange={() => {
              onChange((now) => ({ ...now, mode: 'map' }));
            }}
          />
          Map to an existing one
        </label>
        <label>
          <input
            type="radio"
            name={`${ids}-mode`}
            checked={row.mode === 'create'}
            disabled={row.testing}
            onChange={() => {
              onChange((now) => ({ ...now, mode: 'create' }));
            }}
          />
          Create it
        </label>
      </div>

      {row.mode === 'map' ? (
        <div className="import-source__map">
          <div
            role="radiogroup"
            aria-label={`Data sources a model in ${targetText} can bind to`}
            className="import-source__choices"
          >
            {chain.map((folderId) => {
              const here = bindable
                .filter((each) => each.folderId === folderId)
                // A same-named one first in its folder, never chosen for them.
                .sort((a, b) => Number(b.name === source.name) - Number(a.name === source.name));
              return (
                <div key={folderId} className="import-source__folder">
                  <span className="import-source__folder-name">
                    {folderTitles.get(folderId) ?? folderId}
                  </span>
                  {here.length === 0 ? (
                    <span className="import-source__none">None here</span>
                  ) : (
                    here.map((each) => (
                      <label key={each.id} className="import-source__choice">
                        <input
                          type="radio"
                          name={`${ids}-map`}
                          checked={row.mapTo === each.id}
                          aria-label={[
                            each.name,
                            ...(each.name === source.name ? ['Same name'] : []),
                            driverLabel(each.driver),
                            `in ${pathText(each.path)}`,
                          ].join(', ')}
                          onChange={() => {
                            onChange((now) => ({ ...now, mapTo: each.id }));
                          }}
                        />
                        <span className="is-code">{each.name}</span>
                        {each.name === source.name ? (
                          <span className="import-source__same">Same name</span>
                        ) : null}
                        <span className="import-source__choice-driver">
                          {driverLabel(each.driver)}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              );
            })}
          </div>
          {mapped !== undefined && mapped.driver !== source.driver ? (
            <p
              className="import-pane__warning import-source__mismatch"
              role="note"
              aria-label="Different driver"
              data-testid="driver-mismatch"
            >
              <StatusIcon kind="warn" />
              <span>
                {`${source.name} is ${driverLabel(source.driver)} in the file, and ${mapped.name} is ${driverLabel(mapped.driver)}: a model written for ${driverLabel(source.driver)}’s SQL may not run on ${driverLabel(mapped.driver)}.`}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {row.mode === 'create' ? (
        <div className="import-source__create">
          {nameTaken ? (
            <div className="source-pane__alert import-source__taken" role="alert">
              <StatusIcon kind="err" />
              <div>
                <p>
                  {`${targetText} already has a data source named ${row.name}. A new one can’t take that name there.`}
                </p>
                <div className="import-source__ways">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      onChange((now) => ({ ...now, mode: 'map', mapTo: taken }));
                      // Focus on the one chosen (design 13, the keyboard table).
                      requestAnimationFrame(() => {
                        box.current
                          ?.querySelector<HTMLElement>('.import-source__choices input:checked')
                          ?.focus();
                      });
                    }}
                  >
                    Use the existing one instead
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      nameField.current?.focus();
                      nameField.current?.select();
                    }}
                  >
                    Create under another name
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="field">
            <label htmlFor={`${ids}-new-name`}>
              <span>Name</span>
              <span className="field__req"> · required</span>
            </label>
            <input
              ref={nameField}
              // Held while its test runs: the pass is of what was sent (T514's review).
              disabled={row.testing}
              id={`${ids}-new-name`}
              className="is-code"
              spellCheck={false}
              autoComplete="off"
              value={row.name}
              aria-invalid={nameTaken || !named(row.name) ? true : undefined}
              aria-describedby={`${ids}-name-note`}
              onChange={(event) => {
                const next = event.target.value;
                onChange((now) => ({ ...now, name: next }));
              }}
            />
            <span
              id={`${ids}-name-note`}
              className={nameTaken || !named(row.name) ? 'field__error' : 'connection-form__note'}
            >
              {nameTaken
                ? `Taken in ${targetText}. Choose another name, or use the existing one.`
                : !named(row.name)
                  ? nameProblem(row.name, 'data-source')
                  : `${targetText} has none by this name.`}
            </span>
          </div>
          {driver === undefined || values === undefined ? null : (
            <fieldset className="source-pane__summary">
              <legend className="connection-form__legend">From the file · settings only</legend>
              <dl>
                <dt>Where</dt>
                <dd className="is-code">{whereOf(driver, values)}</dd>
                <dt>Signs in with</dt>
                <dd>{signsInOf(driver, values)}</dd>
                {tlsOf(driver, values) === undefined ? null : (
                  <>
                    <dt>TLS</dt>
                    <dd>{tlsOf(driver, values)}</dd>
                  </>
                )}
                {source.description === null || source.description === '' ? null : (
                  <>
                    <dt>Description</dt>
                    <dd>{source.description}</dd>
                  </>
                )}
              </dl>
            </fieldset>
          )}
          {driver === undefined
            ? null
            : secrets.map((field) => (
                <div key={field.key} className="field">
                  <label htmlFor={`${ids}-${field.key}`}>
                    <span>{fieldLabel(driver, field)}</span>
                    <span className="field__req">
                      {field.required ? ' · required' : ''} · not in the file
                    </span>
                  </label>
                  {field.kind === 'multiline' ? (
                    <textarea
                      id={`${ids}-${field.key}`}
                      className="is-secret"
                      disabled={row.testing}
                      spellCheck={false}
                      autoComplete="off"
                      value={row.secrets[field.key] ?? ''}
                      onChange={(event) => {
                        const typed = event.target.value;
                        onChange((now) => ({
                          ...now,
                          secrets: { ...now.secrets, [field.key]: typed },
                          tested: undefined,
                        }));
                      }}
                    />
                  ) : (
                    <input
                      id={`${ids}-${field.key}`}
                      type="password"
                      disabled={row.testing}
                      autoComplete="new-password"
                      value={row.secrets[field.key] ?? ''}
                      onChange={(event) => {
                        const typed = event.target.value;
                        onChange((now) => ({
                          ...now,
                          secrets: { ...now.secrets, [field.key]: typed },
                          tested: undefined,
                        }));
                      }}
                    />
                  )}
                </div>
              ))}
          <p className="connection-form__note">
            Encrypted in your browser before it’s sent, and never shown again.
          </p>
          <div className="import-source__test">
            <h4 className="connection-form__legend">Test to create</h4>
            <StateLine
              role="status"
              kind={
                row.testing
                  ? 'run'
                  : row.tested === undefined
                    ? 'idle'
                    : row.tested.ok && row.tested.testId !== undefined
                      ? 'ok'
                      : 'err'
              }
              className={
                row.tested === undefined && !row.testing
                  ? 'source-pane__outcome is-empty'
                  : 'source-pane__outcome'
              }
            >
              {row.testing
                ? 'Testing…'
                : row.tested === undefined
                  ? ''
                  : row.tested.ok
                    ? row.tested.testId === undefined
                      ? 'The test passed, but wechart couldn’t keep it, and a data source is made only from a test it keeps: run it again.'
                      : `Every check passed · of exactly these settings · ${row.tested.at}`
                    : `Failed at ${firstFailed === undefined ? 'a check' : (CHECK_LABELS[firstFailed.id] ?? firstFailed.id)} · ${row.tested.at}`}
            </StateLine>
            {row.tested === undefined && !row.testing ? null : (
              <ConnectionChecks
                checks={row.tested?.checks}
                running={row.testing}
                // The file's settings are as they are (P4 not adopted): its sign-in, or Map.
                fixes={['sign-in']}
                onFix={() => {
                  document.getElementById(`${ids}-${secrets[0]?.key ?? 'new-name'}`)?.focus();
                }}
              />
            )}
            {row.tested?.ok === false ? (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  onChange((now) => ({ ...now, mode: 'map' }));
                }}
              >
                Map to an existing one instead
              </button>
            ) : null}
            {row.failure === undefined ? null : <StateLine kind="err">{row.failure}</StateLine>}
            <button
              type="button"
              className="btn"
              disabled={
                row.testing || missing || nameTaken || !named(row.name) || driver === undefined
              }
              onClick={onTest}
            >
              {row.tested === undefined && row.trials.length === 0
                ? 'Test connection'
                : 'Test again'}
            </button>
            {row.tested?.ok === true ? null : (
              <span className="connection-form__note">Created only after a passing test.</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
