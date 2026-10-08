import { useQueryClient } from '@tanstack/react-query';
import { useBlocker, type ShouldBlockFn } from '@tanstack/react-router';
import { DRIVERS, SHORT_NAME, targetChanges, type DriverField, type SealedV1 } from '@wechart/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import {
  ConnectionForm,
  fieldLabel,
  fieldsToSend,
  missingOf,
  secretsToSeal,
  type ConnectionValues,
} from './ConnectionForm';
import { changesSince, identityMoves, storedValuesOf } from './connectionSummary';
import {
  CHECK_LABELS,
  ConnectionChecks,
  errorOf,
  sealerOf,
  type Check,
  type Seal,
} from './connectionTest';
import type { ListedSource } from './DataSourcesList';
import { DATA_SOURCES_QUERY } from './query';
import type { StoredSource } from './SourceSettings';

/**
 * Changing a stored data source on its page (T497; AC-158, AC-161, AC-164,
 * AC-312; design 03 of 2026-09-27, pins 5–10 and states B, C, D, I): where
 * it may be changed — a copy in the user's workspace, or in place with
 * sign-in off. A rename saves without a test; a change to where or how it
 * connects saves only from a passing test of exactly those settings, with
 * no way round it (R32). Changing a field its stored secrets are bound to
 * asks for them again — as the API decides it, from the fields sent.
 */

/** A test of the form's settings, as sent and as xcube answered. */
interface Tested {
  readonly ok: boolean;
  readonly testId?: string;
  readonly checks: readonly Check[];
  /** What it was of: the form's values and typed secrets, compared to know it still holds. */
  readonly print: string;
  readonly sealed: Record<string, SealedV1>;
  readonly at: Date;
}

const storedOf = (source: StoredSource) =>
  Object.entries(source.secrets)
    .filter(([, secret]) => secret.stored)
    .map(([field]) => field);

const printOf = (source: StoredSource, values: ConnectionValues) =>
  JSON.stringify([values.authMethod, fieldsToSend(source.driver, values), values.secrets]);

/** A time as the test line says it. */
const clock = (at: Date) => at.toLocaleTimeString('en-GB');

/** "A", "A and B", "A, B and C". */
const listed = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/** The rebuild warning's id: Save is described by it (T725). */
const REBUILDS_ID = 'source-rebuilds';

/**
 * What a change that moves the connection's identity does, said before Save
 * (T725, AC-353, R70): its rollups are rebuilt, and what moves it.
 */
const rebuildsSaid = (moves: readonly string[]) =>
  `Saving rebuilds this data source’s pre-aggregations: its ${listed(moves)} ${moves.length === 1 ? 'changes' : 'change'}.`;

/** A path of folders as the page names it: the root as Shared. */
const pathText = (path: readonly { readonly title: string }[]) =>
  path.length === 0 ? 'Shared' : path.map((folder) => folder.title).join(' / ');

export function useSourceEdit(source: StoredSource, { seal: given }: { seal?: Seal } = {}) {
  const queryClient = useQueryClient();
  const initial = useMemo(
    () => storedValuesOf(source.driver, source.authMethod, source.fields),
    [source],
  );
  const [name, setName] = useState(source.name);
  /** What it is for (T499; state B): no part of the connection, so no test. */
  const [description, setDescription] = useState(source.description ?? '');
  const [values, setValues] = useState<ConnectionValues>(initial);
  const [tested, setTested] = useState<Tested | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  /** A name the API refused, and its reason, said on the name's field. */
  const [nameRefused, setNameRefused] = useState<{ name: string; reason: string } | null>(null);
  const [seal] = useState<Seal>(() => given ?? sealerOf());
  /**
   * Counted each time Save or Discard changes has done its work: the foot
   * then takes focus, which the buttons would drop to the page as they
   * disable (T497's review).
   */
  const [settled, setSettled] = useState(0);
  /** Off once leaving is meant, as when the copy is discarded: nothing left to ask about. */
  const armed = useRef(true);

  const spec = DRIVERS[source.driver];
  const every = useMemo(
    () =>
      [...spec.connection, ...spec.auth.flatMap((method) => method.fields)].filter(
        (field, at, all) => all.findIndex((each) => each.key === field.key) === at,
      ),
    [spec],
  );
  const labelOf = (key: string) => {
    const field = every.find((each) => each.key === key);
    return field === undefined ? key : fieldLabel(source.driver, field);
  };
  const sent = fieldsToSend(source.driver, values);
  /**
   * The target fields changed, as the API reads them: the fields sent
   * against those stored, a field neither holds read as empty (AC-312;
   * `targetChanges`, T497's review). Every stored secret is bound to them.
   */
  const retargeted = targetChanges(source.driver, source.fields, sent);
  const storedSecrets = storedOf(source);
  const methodChanged = values.authMethod !== source.authMethod;
  /** The stored secrets still good for these settings: none once the target or the method changes. */
  const kept = retargeted.length > 0 || methodChanged ? [] : storedSecrets;
  const asked: Record<string, string> =
    retargeted.length === 0 || methodChanged
      ? {}
      : Object.fromEntries(
          storedSecrets.map((key) => [
            key,
            `The ${labelOf(retargeted[0]!).toLowerCase()} changed, so the ${labelOf(key).toLowerCase()} kept${
              source.originPath === undefined ? '' : ' from the original'
            } no longer applies. It’s asked for again.`,
          ]),
        );

  const changes = changesSince(source.driver, { values: initial, secrets: {} }, values);
  /** What of its connection identity this change moves: each rebuilds its rollups (T725, R70). */
  const moves = identityMoves(source.driver, source, values);
  const typed = name.trim();
  const nameChanged = typed !== source.name;
  /** As the API takes a name (the wizard's rule; `checkName`). */
  const nameOk = !nameChanged || (SHORT_NAME.test(typed) && typed.length <= 64);
  const describedAs = description.trim();
  const descriptionChanged = describedAs !== (source.description ?? '');
  const connects = changes.length > 0;
  const count = changes.length + (nameChanged ? 1 : 0) + (descriptionChanged ? 1 : 0);
  /**
   * What must be entered before a test: the required fields left empty, and
   * every stored secret asked for again, an optional one too, as the API
   * asks for each (T497's review).
   */
  const required = missingOf(source.driver, values, kept);
  const missing: DriverField[] = [
    ...required,
    ...Object.keys(asked)
      .filter((key) => (values.secrets[key] ?? '') === '')
      .filter((key) => !required.some((field) => field.key === key))
      .map((key) => every.find((field) => field.key === key))
      .filter((field): field is DriverField => field !== undefined),
  ];
  const print = printOf(source, values);
  /** The test of exactly these settings, passed or not; none once they change after it. */
  const testedNow = tested !== null && tested.print === print ? tested : null;
  const passed = testedNow !== null && testedNow.ok ? testedNow : null;
  // With nothing changed, a test is of the stored settings, and joins its history (pin 8).
  const canTest = missing.length === 0 && busy === null;
  const canSave =
    count > 0 &&
    typed !== '' &&
    nameOk &&
    nameRefused?.name !== typed &&
    busy === null &&
    (!connects || passed?.testId !== undefined);

  const change = (next: ConnectionValues) => {
    // A switch nothing stored, set back to its default, is as stored: no
    // change, and no target moved (T497's review).
    const fields = Object.fromEntries(
      Object.entries(next.fields).filter(([key, value]) => {
        if (source.fields[key] !== undefined) return true;
        const field = spec.connection.find((each) => each.key === key);
        return !(field?.kind === 'boolean' && value === field.defaultValue);
      }),
    );
    setValues({ ...next, fields });
    setSaved(null);
  };

  const runTest = async () => {
    if (!canTest) return;
    setBusy('test');
    setFailure(null);
    try {
      const sealed: Record<string, SealedV1> = {};
      for (const [field, secret] of secretsToSeal(source.driver, values))
        sealed[field] = await seal(source.driver, field, sent, secret);
      const response = await fetch(`/api/data-sources/${encodeURIComponent(source.id)}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authMethod: values.authMethod, fields: sent, sealed }),
      });
      if (!response.ok) throw new Error(await errorOf(response, 'run the test'));
      const answer = (await response.json()) as {
        ok: boolean;
        testId?: string;
        checks: Check[];
      };
      setTested({ ...answer, print, sealed, at: new Date() });
      void queryClient.invalidateQueries({ queryKey: ['data-source', source.id, 'tests'] });
      // A test of the stored settings is its health.
      if (!connects) void queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY.queryKey });
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!canSave) return;
    setBusy('save');
    setFailure(null);
    try {
      const response = await fetch(`/api/data-sources/${encodeURIComponent(source.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(nameChanged ? { name: typed } : {}),
          ...(descriptionChanged ? { description: describedAs } : {}),
          // Exactly what was tested, as it was sealed (T461).
          ...(connects && passed !== null
            ? {
                authMethod: values.authMethod,
                fields: sent,
                sealed: passed.sealed,
                testId: passed.testId,
              }
            : {}),
        }),
      });
      if (!response.ok) {
        const reason = await errorOf(response, 'save it');
        // A name the folder already holds: said on the name, as the wizard says it.
        if (response.status === 409 && nameChanged && reason.includes(typed)) {
          setNameRefused({ name: typed, reason });
          setFailure('Not saved: its name was refused. See General.');
          return;
        }
        throw new Error(reason);
      }
      setSaved(count === 1 ? 'Saved 1 change.' : `Saved ${String(count)} changes.`);
      setTested(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['data-source', source.id] }),
        queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY.queryKey }),
      ]);
      // As it is now stored: nothing typed is left behind, a secret least of
      // all (T497's review).
      if (connects) setValues(storedValuesOf(source.driver, values.authMethod, sent));
      setSettled((n) => n + 1);
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const discard = () => {
    setName(source.name);
    setDescription(source.description ?? '');
    setValues(initial);
    setTested(null);
    setFailure(null);
    setNameRefused(null);
    setSettled((n) => n + 1);
  };

  return {
    name,
    setName: (next: string) => {
      setName(next);
      setSaved(null);
    },
    nameOk,
    nameRefused: nameRefused?.name === typed ? nameRefused.reason : null,
    description,
    setDescription: (next: string) => {
      setDescription(next);
      setSaved(null);
    },
    descriptionChanged,
    values,
    change,
    kept,
    asked,
    changes,
    /** Said before Save where the change moves the connection's identity (T725, R70). */
    rebuilds: moves.length === 0 ? null : rebuildsSaid(moves),
    nameChanged,
    connects,
    count,
    missing,
    tested,
    testedNow,
    passed,
    busy,
    failure,
    saved,
    canTest,
    canSave,
    runTest,
    save,
    discard,
    settled,
    /** Whether leaving is still to be asked about: not once it is meant. */
    isArmed: () => armed.current,
    /** Leaving is meant (the copy is discarded): nothing to ask first. */
    release: () => {
      armed.current = false;
    },
  };
}

export type SourceEdit = ReturnType<typeof useSourceEdit>;

/** The Connection tab where it may be changed: the form, and "Test to save" beside it (pin 8). */
export function EditableConnection({ source, edit }: { source: StoredSource; edit: SourceEdit }) {
  return (
    <div className="source-settings__edit">
      <div className="source-settings__form">
        {/* The type is fixed, and the way to another said (pin 5, AC-161). */}
        <div className="field source-settings__type">
          <span className="source-settings__type-label">Type</span>
          <span className="source-settings__type-value">
            <span className="secret-pasted__lock" aria-hidden="true" />
            {DRIVERS[source.driver].label}
          </span>
          <span className="connection-form__note">
            The type is fixed. To use another database, make a new data source.
          </span>
        </div>
        <ConnectionForm
          // Anew for each stored version: a secret replaced and saved is said
          // stored again, its field put away (T497's review).
          key={source.version}
          driver={source.driver}
          values={edit.values}
          onChange={edit.change}
          stored={edit.kept}
          was={source.fields}
          asked={edit.asked}
          keptFrom={source.originPath === undefined ? undefined : pathText(source.originPath)}
        />
      </div>
      <TestToSave source={source} edit={edit} />
    </div>
  );
}

/**
 * "Test to save" (pin 8, states C): what changed, Cube's four checks, and
 * Test connection, enabled once every required field is filled. A pass of
 * exactly these settings is what Save needs; a change after it clears it.
 * With nothing changed, it tests the stored settings.
 */
function TestToSave({ source, edit }: { source: StoredSource; edit: SourceEdit }) {
  // A test of other settings says nothing of these: a change after it clears it (pin 10).
  const checks = edit.testedNow;
  const unkept = edit.connects && edit.passed !== null && edit.passed.testId === undefined;
  const failedAt = checks?.checks.find((check) => check.status === 'failed');
  /** The outcome, said as it changes, in a line kept mounted (T497's review). */
  const outcome =
    edit.busy === 'test'
      ? 'Testing the connection…'
      : checks === null
        ? ''
        : checks.ok
          ? unkept
            ? 'The test passed, but wechart couldn’t keep it: run it again.'
            : `Every check passed · ${clock(checks.at)}`
          : `Failed at ${failedAt === undefined ? 'a check' : (CHECK_LABELS[failedAt.id] ?? failedAt.id)} · ${clock(checks.at)}`;
  return (
    <section className="source-settings__test" aria-label="Test to save">
      <h3 className="connection-form__legend">Test to save</h3>
      <p className="visually-hidden source-settings__outcome" role="status">
        {outcome}
      </p>
      {!edit.connects ? (
        <p className="source-settings__none">
          No changes: a test now is of the stored settings, and joins its history. A change to where
          or how it connects is saved only once a test of it passes.
        </p>
      ) : edit.passed === null ? (
        <div className="source-settings__changed" role="note">
          <StatusIcon kind="warn" />
          <p>
            <b>
              {edit.changes.length === 1
                ? '1 change to the connection.'
                : `${String(edit.changes.length)} changes to the connection.`}
            </b>{' '}
            It’s saved only once a test of exactly these settings passes.
          </p>
        </div>
      ) : null}
      {checks?.ok === true && !unkept ? (
        <p className="status status--ok">
          <StatusIcon kind="ok" />
          <span>Every check passed</span>
          <span className="status__when">
            {' '}
            · {clock(checks.at)} ·{' '}
            {edit.connects ? 'of exactly these settings' : 'of the stored settings'}
          </span>
        </p>
      ) : null}
      {unkept ? (
        // The wizard's words for it (T363's review): Save needs a test it keeps.
        <p className="field__warning">
          <StatusIcon kind="warn" />
          The test passed, but wechart couldn’t keep it, and a change is saved only from a test it
          keeps: run it again.
        </p>
      ) : null}
      {edit.connects ? (
        <ul className="source-settings__changes" aria-label="What changed">
          {edit.changes.map((each) => (
            <li key={each}>{each}</li>
          ))}
          {Object.keys(edit.asked).map((key) =>
            (edit.values.secrets[key] ?? '') === '' ? (
              <li key={`asked-${key}`}>
                {edit.missing.find((field) => field.key === key) === undefined
                  ? key
                  : fieldLabel(
                      source.driver,
                      edit.missing.find((field) => field.key === key)!,
                    )}
                : needed again
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      <h4 className="source-settings__checks-title">
        {checks === null ? 'Checks Cube runs' : 'Checks Cube ran'}
      </h4>
      {/* The wizard's checks (design 01 state D), as design 03 puts them beside the form. */}
      <ConnectionChecks
        checks={checks?.checks}
        running={edit.busy === 'test'}
        onFix={(group) => {
          // The form is beside it: the group's first field takes focus.
          document
            .querySelector<HTMLElement>(
              `.source-settings__form [data-group="${group}"] :is(input, select, textarea, button)`,
            )
            ?.focus();
        }}
      />
      <button
        type="button"
        className="btn btn-primary"
        disabled={!edit.canTest}
        onClick={() => void edit.runTest()}
      >
        {edit.busy === 'test' ? 'Testing…' : 'Test connection'}
      </button>
      {edit.missing.length > 0 ? (
        <p className="source-settings__none">
          Enter{' '}
          {edit.missing.map((field) => fieldLabel(source.driver, field).toLowerCase()).join(', ')}{' '}
          to test.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Said under a rename when published cubes still name it (AC-275; state B):
 * saving it is refused until they change too, and the refusal names them.
 */
function stillNamedBy(listed: ListedSource | undefined, was: string): string | null {
  const cubes = listed?.usedBy ?? [];
  const hidden = listed?.usedElsewhere ?? 0;
  const count = cubes.length + hidden;
  if (count === 0) return null;
  const folders = [...new Set(cubes.map((cube) => pathText(cube.folderPath)))];
  const where = hidden === 0 && folders.length === 1 ? ` in ${folders[0]!}` : '';
  const what =
    count === 1
      ? `1 published cube${where} names`
      : `${String(count)} published cubes${where} name`;
  return `${what} ${was}. Saving this rename is refused until they’re changed too; the refusal names them.`;
}

/** Its name, where it may be renamed: a copy keeps its original's (AC-280; state B). */
export function EditableGeneral({
  source,
  edit,
  listed,
}: {
  source: StoredSource;
  edit: SourceEdit;
  /** Its row in Data sources, with the cubes that name it. */
  listed?: ListedSource | undefined;
}) {
  const copy = source.origin !== null;
  const typed = edit.name.trim();
  const invalid = !edit.nameOk || edit.nameRefused !== null;
  const still = edit.nameChanged && !copy ? stillNamedBy(listed, source.name) : null;
  return (
    <div className="source-settings__general">
      <div className={`field${edit.nameChanged ? ' is-changed' : ''}`}>
        <label htmlFor="source-name">
          <span>Name</span>
          <span className="field__req"> · required</span>
        </label>
        <input
          id="source-name"
          className="is-code"
          spellCheck={false}
          autoComplete="off"
          value={edit.name}
          readOnly={copy}
          aria-invalid={invalid ? true : undefined}
          aria-describedby="source-name-note"
          onChange={(event) => {
            edit.setName(event.target.value);
          }}
        />
        <span id="source-name-note" className={invalid ? 'field__error' : 'connection-form__note'}>
          {copy ? (
            'A copy keeps its original’s name, which it stands in for in your workspace.'
          ) : edit.nameRefused !== null ? (
            <>
              <StatusIcon kind="err" />
              {edit.nameRefused}
            </>
          ) : !edit.nameOk ? (
            'Not a name Cube takes: use lower-case letters and digits, words joined by single underscores, at most 64 characters.'
          ) : edit.nameChanged ? (
            `Was ${source.name} · cubes name it as data_source: ${typed}`
          ) : (
            'Cubes name it as data_source. A new name needs no test.'
          )}
        </span>
        {still === null ? null : (
          <p className="field__warning">
            <StatusIcon kind="warn" />
            {still}
          </p>
        )}
      </div>
      {/* What it is for: no part of the connection, so it needs no test (state B). */}
      <div className={`field${edit.descriptionChanged ? ' is-changed' : ''}`}>
        {/* As design 03 state B names it. */}
        <label htmlFor="source-description">
          <span>Description</span>
        </label>
        <textarea
          id="source-description"
          rows={3}
          value={edit.description}
          onChange={(event) => {
            edit.setDescription(event.target.value);
          }}
        />
      </div>
    </div>
  );
}

/** Under the card: how many changes, what Save needs, Discard changes and Save (pins 9, 10). */
export function EditFoot({ edit }: { edit: SourceEdit }) {
  const foot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (edit.settled > 0) foot.current?.focus();
  }, [edit.settled]);
  const need = edit.connects
    ? edit.passed === null
      ? 'Save needs a passing test of these settings.'
      : `tested ${edit.passed.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : edit.nameChanged && edit.descriptionChanged
      ? 'no test needed'
      : edit.descriptionChanged
        ? 'no test needed for a description'
        : 'no test needed for a name';
  return (
    <div className="source-settings__foot">
      {/* Kept mounted, their words changing, so each is announced (T497's review). */}
      <StateLine kind="err">{edit.failure ?? ''}</StateLine>
      <StateLine kind="ok">{edit.saved ?? ''}</StateLine>
      <span ref={foot} tabIndex={-1} className="source-settings__count">
        {edit.count === 0
          ? 'No unsaved changes'
          : `${edit.count === 1 ? '1 unsaved change' : `${String(edit.count)} unsaved changes`} · ${need}`}
      </span>
      {edit.rebuilds === null ? null : (
        // Beside Save on every tab, and read with it (T725, AC-353, R70): the
        // foot is the one part of the page each tab shows.
        <span id={REBUILDS_ID} className="field__warning">
          <StatusIcon kind="warn" />
          {edit.rebuilds}
        </span>
      )}
      <span className="source-settings__spacer" />
      <button type="button" className="btn" disabled={edit.count === 0} onClick={edit.discard}>
        Discard changes
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!edit.canSave}
        aria-describedby={edit.rebuilds === null ? undefined : REBUILDS_ID}
        onClick={() => void edit.save()}
      >
        {edit.busy === 'save'
          ? 'Saving…'
          : edit.count > 1
            ? `Save ${String(edit.count)} changes`
            : 'Save'}
      </button>
    </div>
  );
}

/**
 * Leaving with unsaved changes asks first (state I): Back, the breadcrumb, and
 * a workspace in the top bar. The bar's links are the browser's to follow,
 * as on every page, so this page takes a click on one while it has changes,
 * asks, and follows it once left (T499's review: routed in the app, they
 * slipped past the new data source pane's own question). A reload, or a link
 * opened in a new tab, gets the browser's own question or none.
 */
export function LeaveGuard({ source, edit }: { source: StoredSource; edit: SourceEdit }) {
  const unsaved = useRef(edit.count > 0);
  useEffect(() => {
    unsaved.current = edit.count > 0;
  }, [edit.count]);
  const { isArmed, release } = edit;
  const shouldBlockFn = useCallback<ShouldBlockFn>(
    ({ current, next }) => isArmed() && unsaved.current && current.pathname !== next.pathname,
    [isArmed],
  );
  const enableBeforeUnload = useCallback(() => isArmed() && unsaved.current, [isArmed]);
  const leaving = useBlocker({ shouldBlockFn, enableBeforeUnload, withResolver: true });
  /** A workspace in the bar, clicked with changes unsaved: where leaving would go. */
  const [barTo, setBarTo] = useState<string | null>(null);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isArmed() || !unsaved.current) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest('nav[aria-label="Workspaces"] a[href]')
          : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      event.preventDefault();
      setBarTo(link.href);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
    };
  }, [isArmed]);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  const stay = useRef<HTMLButtonElement>(null);
  /** Where focus was as leaving was asked about: back there on Stay (T497's review). */
  const back = useRef<HTMLElement | null>(null);
  const { status, reset } = leaving;
  const asking = status === 'blocked' || barTo !== null;
  const stayHere = useCallback(() => {
    if (status === 'blocked') reset?.();
    setBarTo(null);
    back.current?.focus();
  }, [reset, status]);
  const leave = () => {
    if (barTo === null) {
      leaving.proceed?.();
      return;
    }
    release();
    globalThis.location.assign(barTo);
  };
  useEffect(() => {
    if (!asking) return undefined;
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stay.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stayHere();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [asking, stayHere]);
  if (!asking) return null;
  return (
    <div className="source-settings__veil">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="source-leave-title"
        aria-describedby="source-leave-text"
        className="source-pane__ask"
      >
        <h3 id="source-leave-title">Leave without saving?</h3>
        <p id="source-leave-text">
          You changed <span className="is-code">{source.name}</span>
          {edit.connects && edit.passed === null ? ', and it isn’t tested or saved' : ''}. Leaving
          discards the {edit.count === 1 ? 'change' : 'changes'}.
        </p>
        <div className="source-pane__ask-actions">
          <button ref={stay} type="button" className="btn" onClick={stayHere}>
            Stay
          </button>
          <button type="button" className="btn btn-danger" onClick={leave}>
            Leave and discard
          </button>
        </div>
      </div>
    </div>
  );
}
