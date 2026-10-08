import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import {
  DRIVER_TYPES,
  DRIVERS,
  nameProblem,
  type DriverType,
  type FieldValue,
  type SealedV1,
} from '@wechart/core';

import { clockOf } from '../../shell/formatTime';
import { InfoBar } from '../../shell/InfoBar';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import type { Target } from '../explore/NewItemDialog';
import {
  ConnectionForm,
  fieldLabel,
  fieldsToSend,
  initialValues,
  missingOf,
  secretsToSeal,
  type ConnectionValues,
} from './ConnectionForm';
import { changesSince, signsInOf, tlsOf, whereOf, type TestedValues } from './connectionSummary';
import {
  CHECK_LABELS,
  ConnectionChecks,
  errorOf,
  sealerOf,
  type Check,
  type Seal,
} from './connectionTest';
import { DriverMark, TLS_DEFAULT, WAYS_TO_SIGN_IN } from './driverMarks';
import { TargetTree } from './TargetTree';

/**
 * Adding a data source (T363, T471; AC-158, AC-159, AC-160, AC-282, AC-325;
 * design 01, "New data source"; direction.md rules 23, 35, 74 and 85):
 * Type → Connection → Test → Name and target, in a pane docked beside the
 * list it adds to — the approved prototype's placement — at one size for
 * every step and driver, its steps at the top and its actions at the foot.
 *
 * - **Type:** the eight drivers xcube takes, as tiles saying how each signs
 *   in (AC-160).
 * - **Connection:** that driver's fields, grouped where it connects → how it
 *   signs in → TLS (design 02). Next checks the required ones first.
 * - **Test:** what will be tested, and the four checks Cube runs, listed
 *   before they run (AC-159). Each typed secret is sealed to xcube's key as
 *   the test is submitted, and the envelope is what is sent (AC-325). A
 *   failure opens in place with Cube's own words.
 * - **Name and target:** its short name and, in the workspace, the shared
 *   folder it is to go to, as a tree (AC-282). Create sends exactly what was
 *   tested, naming the test that passed. There is no step past Test without
 *   one, and no making one without (AC-158; the user's answer, 2026-09-27:
 *   "test first, and dont save if test fails"), which the API holds it to
 *   too.
 */
export type { Seal };

/** What the test sent, the settings it was of, and xcube's answer to it. */
interface Tested extends TestedValues {
  readonly ok: boolean;
  readonly testId?: string;
  readonly checks: readonly Check[];
  readonly authMethod: string;
  readonly fields: Record<string, FieldValue>;
  readonly sealed: Record<string, SealedV1>;
  /** When it answered, as the Test step says it. */
  readonly at: string;
}

const THE_RULE =
  'A data source is made only from a test of exactly these settings that passed. Changing any setting afterwards means testing again.';

/** "Host, Database and Password". */
const listed = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/** Now, "14:05:12", on the one 24-hour clock (T477). */
const clock = () => clockOf(new Date(), { seconds: true });

export function NewSourceWizard({
  folderId,
  targets,
  seal: givenSeal,
  onCreated,
  onClose,
}: {
  /** Where it is made: My workspace (`mine`), or a folder. */
  folderId: string;
  /** In the workspace, the folders it may go to (T345); none elsewhere. */
  targets?: readonly Target[];
  seal?: Seal;
  onCreated: (source: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const heading = useId();
  const ids = useId();
  const [seal] = useState<Seal>(() => givenSeal ?? sealerOf());
  // Given the folders it may go to only in the workspace (T345).
  const inWorkspace = targets !== undefined;
  const steps = ['Type', 'Connection', 'Test', targets === undefined ? 'Name' : 'Name and target'];

  const [step, setStep] = useState(0);
  const [driver, setDriver] = useState<DriverType | null>(null);
  const [values, setValues] = useState<ConnectionValues | null>(null);
  /** Next pressed on the Connection step: its required fields are checked from then on. */
  const [checked, setChecked] = useState(false);
  const [tested, setTested] = useState<Tested | null>(null);
  /** A test of settings changed since, said as such (state L). */
  const [stale, setStale] = useState<Tested | null>(null);
  const [name, setName] = useState('');
  /** The name the API refused as taken, and why (state H). */
  const [taken, setTaken] = useState<{ name: string; reason: string } | null>(null);
  const [target, setTarget] = useState(targets?.length === 1 ? targets[0]!.id : '');
  const [busy, setBusy] = useState<'test' | 'create' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Every test run here, so all of them join the history of the one made (AC-163). */
  const [trials, setTrials] = useState<readonly string[]>([]);
  /** Asking before typed work is discarded (state I, rule 85). */
  const [asking, setAsking] = useState(false);
  /** Where focus goes once the step it is on is drawn. */
  const [focusOn, setFocusOn] = useState<'first' | 'sign-in' | 'where' | 'invalid'>('first');

  /** Anything typed, which leaving would lose. */
  const typed =
    name !== '' ||
    tested !== null ||
    stale !== null ||
    (driver !== null &&
      values !== null &&
      JSON.stringify(values) !== JSON.stringify(initialValues(driver)));

  /**
   * What opened it — focused as it first draws — which takes focus back as it
   * closes, however it closes, so the keyboard is never dropped to the page
   * (T471's review).
   */
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useEffect(
    () => () => {
      if (opener?.isConnected === true) opener.focus();
    },
    [opener],
  );

  /** Where focus was when the question was asked: where keeping on puts it back. */
  const askedFrom = useRef<HTMLElement | null>(null);
  const leave = () => {
    if (!typed) {
      onClose();
      return;
    }
    askedFrom.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAsking(true);
  };
  const keepOn = () => {
    setAsking(false);
    askedFrom.current?.focus();
  };

  // Escape asks as Cancel does, but not while it is making the data source;
  // with the question open it keeps editing, the answer that loses nothing.
  // Only an Escape meant for the pane: pressed in it, or with focus on
  // nothing — not one a rename field or a menu elsewhere has taken (T471's
  // review).
  const pane = useRef<HTMLElement>(null);
  const onEscape = useRef<() => void>(() => undefined);
  useEffect(() => {
    onEscape.current = () => {
      if (busy === 'create') return;
      if (asking) keepOn();
      else leave();
    };
  });
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const at = event.target;
      const ours =
        at === document.body ||
        at === document.documentElement ||
        (at instanceof Node && pane.current?.contains(at) === true);
      if (ours) onEscape.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  /**
   * Leaving the page with work typed asks first (rule 85; T471's review): a
   * row opened, a workspace in the top bar, a reload — the browser's own
   * question, as a closed tab gets from the model editor.
   */
  useEffect(() => {
    if (!typed) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [typed]);

  // Focus starts on each step's first control (T363's review), or where the
  // step was opened to show; never left behind or dropped to the page.
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const within = body.current;
    if (within === null) return;
    // A group's first field, before its choice of shape or method: that is
    // what a failed check asks to change — for the sign-in, its secret first
    // (design 01, state E: "focus on the password").
    const selectors =
      focusOn === 'invalid'
        ? ['[aria-invalid="true"]']
        : focusOn === 'sign-in'
          ? [
              '[data-group="sign-in"] input[type="password"]:not(:disabled), [data-group="sign-in"] textarea.is-secret',
              '[data-group="sign-in"] input:not(:disabled)',
              '[data-group="sign-in"] [tabindex="0"]',
            ]
          : focusOn === 'where'
            ? ['[data-group="where"] input:not(:disabled)', '[data-group="where"] [tabindex="0"]']
            : ['[role="radio"][tabindex="0"], input:not(:disabled), textarea:not(:disabled)'];
    const first =
      selectors.map((selector) => within.querySelector<HTMLElement>(selector)).find(Boolean) ??
      body.current?.parentElement?.querySelector<HTMLElement>('.source-pane__foot .btn-primary');
    first?.focus();
  }, [step, focusOn]);

  const goTo = (next: number, focus: typeof focusOn = 'first') => {
    setFailure(null);
    setFocusOn(focus);
    setStep(next);
  };

  /** A test holds for the connection it was of: changed, it is kept only to say so. */
  const change = (next: ConnectionValues) => {
    setValues(next);
    if (tested !== null) setStale(tested);
    setTested(null);
    setFailure(null);
  };

  const chooseType = (type: DriverType) => {
    if (driver === type) return;
    setDriver(type);
    setValues(initialValues(type));
    setChecked(false);
    setTested(null);
    setStale(null);
    setFailure(null);
  };

  const missing = driver === null || values === null ? [] : missingOf(driver, values);

  const toTest = () => {
    if (driver === null || values === null) return;
    setChecked(true);
    if (missing.length > 0) {
      // Focus moves to the first field missing, once it is marked.
      setFocusOn('invalid');
      requestAnimationFrame(() => {
        body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }
    goTo(2);
  };

  /** Each typed secret, sealed for these fields: the envelope is all that is sent. */
  const sealAll = async (chosen: DriverType, fields: Record<string, FieldValue>) => {
    const sealed: Record<string, SealedV1> = {};
    for (const [field, secret] of secretsToSeal(chosen, values!))
      sealed[field] = await seal(chosen, field, fields, secret);
    return sealed;
  };

  const runTest = async () => {
    if (driver === null || values === null) return;
    setBusy('test');
    setFailure(null);
    setTested(null);
    try {
      const fields = fieldsToSend(driver, values);
      const sealed = await sealAll(driver, fields);
      const response = await fetch('/api/data-sources/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folderId, driver, authMethod: values.authMethod, fields, sealed }),
      });
      if (!response.ok) throw new Error(await errorOf(response, 'run the test'));
      const answer = (await response.json()) as { ok: boolean; testId?: string; checks: Check[] };
      setTested({
        ...answer,
        authMethod: values.authMethod,
        fields,
        sealed,
        values,
        secrets: values.secrets,
        at: clock(),
      });
      setStale(null);
      const { testId } = answer;
      if (testId !== undefined) setTrials((kept) => [...kept, testId]);
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    // Only from a test that passed and was kept: sent exactly as it was tested.
    if (driver === null || tested?.ok !== true || tested.testId === undefined) return;
    const { testId } = tested;
    setBusy('create');
    setFailure(null);
    setTaken(null);
    try {
      const earlier = trials.filter((id) => id !== testId);
      const response = await fetch('/api/data-sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          folderId,
          name,
          driver,
          authMethod: tested.authMethod,
          fields: tested.fields,
          sealed: tested.sealed,
          ...(targets === undefined ? {} : { targetFolderId: target }),
          testId,
          ...(earlier.length === 0 ? {} : { trials: earlier }),
        }),
      });
      if (response.status === 409) {
        // The name is taken there: said on the field, the passed test kept.
        setTaken({ name, reason: await errorOf(response, 'make it') });
        return;
      }
      if (!response.ok) throw new Error(await errorOf(response, 'make it'));
      onCreated((await response.json()) as { id: string; name: string });
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // As the API takes a name: R72's grammar, core's one rule (T703, AC-426).
  const misnamed = nameProblem(name, 'data-source');
  const named = misnamed === undefined;
  const nameTaken = taken !== null && taken.name === name;
  /** A test that passed and was kept, which a data source can be made from. */
  const passedKept = tested?.ok === true && tested.testId !== undefined;
  const canCreate =
    busy === null && named && !nameTaken && (targets === undefined || target !== '') && passedKept;

  const firstFailed = tested?.checks.find((check) => check.status === 'failed');
  const took = (tested?.checks ?? []).reduce((sum, check) => sum + (check.durationMs ?? 0), 0);
  /** The test's outcome, said as it changes (T363's review). */
  const outcome =
    busy === 'test'
      ? `Testing the ${driver === null ? '' : DRIVERS[driver].label} connection…`
      : tested === null
        ? ''
        : tested.ok
          ? tested.testId === undefined
            ? 'The test passed, but wechart couldn’t keep it, and a data source is made only from a test it keeps: run it again.'
            : `Every check passed · ${tested.at} · ${String(took)} ms in all`
          : `Failed at ${firstFailed === undefined ? 'a check' : (CHECK_LABELS[firstFailed.id] ?? firstFailed.id)} · ${tested.at} · ${String(took)} ms in all`;

  /** What a test is of, said in a line each (states C and G). */
  const summary = (legend: string, result?: string) =>
    driver === null || values === null ? null : (
      <fieldset className="source-pane__summary">
        <legend className="connection-form__legend">{legend}</legend>
        {result === undefined ? (
          // Back to the settings it will test.
          <button
            type="button"
            className="link-button source-pane__edit"
            onClick={() => {
              goTo(1);
            }}
          >
            Edit
          </button>
        ) : null}
        <dl>
          <dt>Type</dt>
          <dd>{DRIVERS[driver].label}</dd>
          <dt>Where</dt>
          <dd className="is-code">{whereOf(driver, values)}</dd>
          <dt>Signs in</dt>
          <dd>{signsInOf(driver, values)}</dd>
          {/* What was tested says where and how; TLS is asked about before (state G). */}
          {result !== undefined || tlsOf(driver, values) === undefined ? null : (
            <>
              <dt>TLS</dt>
              <dd>{tlsOf(driver, values)}</dd>
            </>
          )}
          {result === undefined ? null : (
            <>
              <dt>Result</dt>
              <dd className="source-pane__result">
                <StatusIcon kind="ok" />
                {result}
              </dd>
            </>
          )}
        </dl>
      </fieldset>
    );

  /** The type tiles' arrows and Enter (state A). */
  const onTileKey = (event: KeyboardEvent<HTMLButtonElement>, type: DriverType) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      chooseType(type);
      goTo(1);
      return;
    }
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const at = DRIVER_TYPES.indexOf(type);
    const next = DRIVER_TYPES[(at + step + DRIVER_TYPES.length) % DRIVER_TYPES.length]!;
    chooseType(next);
    event.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-type="${next}"]`)?.focus();
  };

  const changed =
    driver === null || values === null || stale === null ? [] : changesSince(driver, stale, values);

  return (
    <aside ref={pane} role="dialog" aria-labelledby={heading} className="source-pane">
      <header className="source-pane__head">
        {/* As a sheet, below 1,024 px, the head takes a step back too (state K, T496). */}
        {step === 0 ? null : (
          <button
            type="button"
            className="source-pane__head-back"
            aria-label="Previous step"
            disabled={busy !== null}
            onClick={() => {
              goTo(step - 1);
            }}
          >
            ‹
          </button>
        )}
        <h2 id={heading}>New data source</h2>
        {inWorkspace ? (
          <span className="source-pane__where">
            <span className="source-pane__person" aria-hidden="true" />
            in My workspace
          </span>
        ) : null}
        <button
          type="button"
          className="source-pane__close"
          aria-label="Close"
          disabled={busy === 'create'}
          onClick={leave}
        >
          ×
        </button>
      </header>

      <nav className="source-pane__rail" aria-label="Wizard steps">
        <ol aria-label="Steps">
          {steps.map((label, at) => (
            <li
              key={label}
              className={at < step ? 'is-done' : at === step ? 'is-current' : undefined}
            >
              {at < step ? (
                <button
                  type="button"
                  aria-label={`${label}, done`}
                  disabled={busy !== null}
                  onClick={() => {
                    goTo(at);
                  }}
                >
                  <span className="source-pane__step" aria-hidden="true">
                    {String(at + 1)}
                  </span>
                  {label}
                </button>
              ) : (
                <span aria-current={at === step ? 'step' : undefined}>
                  <span className="source-pane__step" aria-hidden="true">
                    {String(at + 1)}
                  </span>
                  {label}
                </span>
              )}
            </li>
          ))}
        </ol>
        {/* A narrow window says it in a line (state K). */}
        {/* Hidden from everyone where the full rail shows, so said once either way. */}
        <p className="source-pane__rail-short">
          <span className="source-pane__step" aria-hidden="true">
            {String(step + 1)}
          </span>
          Step {String(step + 1)} of {String(steps.length)} · {steps[step]}
        </p>
      </nav>

      {step === 1 && driver !== null ? (
        <div className="source-pane__chosen">
          <DriverMark type={driver} />
          <span className="source-pane__chosen-text">
            <b>{DRIVERS[driver].label}</b>
            <span>
              {[WAYS_TO_SIGN_IN[driver], TLS_DEFAULT[driver]].filter(Boolean).join(' · ')}
            </span>
          </span>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              goTo(0);
            }}
          >
            Change type
          </button>
        </div>
      ) : null}

      <div ref={body} className="source-pane__body">
        {step === 0 ? (
          <div className="source-pane__types">
            <h3 id={`${ids}-which`} className="connection-form__legend">
              Which database?
            </h3>
            <div role="radiogroup" aria-labelledby={`${ids}-which`} className="type-tiles">
              {DRIVER_TYPES.map((type) => {
                const on = driver === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-labelledby={`${ids}-${type}-name`}
                    aria-describedby={`${ids}-${type}-ways`}
                    tabIndex={on || (driver === null && type === DRIVER_TYPES[0]) ? 0 : -1}
                    data-type={type}
                    className="type-tile"
                    onClick={() => {
                      chooseType(type);
                    }}
                    onDoubleClick={() => {
                      chooseType(type);
                      goTo(1);
                    }}
                    onKeyDown={(event) => {
                      onTileKey(event, type);
                    }}
                  >
                    <DriverMark type={type} />
                    <span className="type-tile__text">
                      <span id={`${ids}-${type}-name`} className="type-tile__name">
                        {DRIVERS[type].label}
                      </span>
                      <span id={`${ids}-${type}-ways`} className="type-tile__ways">
                        {WAYS_TO_SIGN_IN[type]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="connection-form__note">
              The drivers Cube connects with. A data source’s type can’t be changed later: to use
              another database, make another data source.
              {typed && driver !== null
                ? ' Choosing another type clears what you typed and any test.'
                : ''}
            </p>
          </div>
        ) : null}

        {step === 1 && driver !== null && values !== null ? (
          <>
            {checked && missing.length > 0 ? (
              <p className="source-pane__alert" role="alert">
                <StatusIcon kind="err" />
                Fill in {listed(missing.map((field) => fieldLabel(driver, field)))} to go on.
              </p>
            ) : null}
            <ConnectionForm
              driver={driver}
              values={values}
              onChange={change}
              invalid={checked ? missing.map((field) => field.key) : []}
            />
          </>
        ) : null}

        {step === 2 && driver !== null && values !== null ? (
          <div className="source-pane__test">
            {/* The outcome first, said as it changes (states D–F); kept
                mounted, its words changing, so each outcome is announced. */}
            <StateLine
              role="status"
              kind={
                busy === 'test'
                  ? 'run'
                  : tested === null
                    ? 'idle'
                    : !tested.ok
                      ? 'err'
                      : passedKept
                        ? 'ok'
                        : 'warn'
              }
              className={outcome === '' ? 'source-pane__outcome is-empty' : 'source-pane__outcome'}
            >
              {outcome}
            </StateLine>
            {stale === null ? null : (
              <p className="source-pane__changed" role="note">
                <StatusIcon kind="warn" />
                <span>
                  {`Settings changed since the test.${changed.length === 0 ? '' : ` You changed ${listed(changed)}.`} Test again to go on.`}
                </span>
              </p>
            )}
            {/* What it will test, before it runs (state C). */}
            {tested === null && busy !== 'test' ? summary('What will be tested') : null}
            {stale === null ? null : (
              <div className="source-pane__last">
                <h3 className="connection-form__legend">Last test, of the old settings</h3>
                <StateLine kind={stale.ok ? 'ok' : 'err'}>
                  {stale.ok ? 'Every check passed' : 'Failed'} · {stale.at} · no longer applies
                </StateLine>
              </div>
            )}
            <h3 id={`${ids}-checks`} className="connection-form__legend">
              {tested === null ? 'Checks Cube runs' : 'Checks Cube ran'}
            </h3>
            <ConnectionChecks
              checks={tested?.checks}
              running={busy === 'test'}
              onFix={(group) => {
                goTo(1, group);
              }}
            />
            {/* The rule, said once, before a run (state C). */}
            {tested === null && busy !== 'test' ? (
              <p className="source-pane__rule" role="note">
                <StatusIcon kind="info" />
                {THE_RULE}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="source-pane__name">
            <div className="field">
              <label htmlFor={`${ids}-name`}>
                <span>Name</span>
                <span className="field__req"> · required</span>
              </label>
              <input
                id={`${ids}-name`}
                className="is-code"
                spellCheck={false}
                autoComplete="off"
                value={name}
                aria-invalid={(name !== '' && !named) || nameTaken ? true : undefined}
                aria-describedby={`${ids}-name-hint`}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              <span
                id={`${ids}-name-hint`}
                className={
                  nameTaken || (name !== '' && !named) ? 'field__error' : 'connection-form__note'
                }
              >
                {nameTaken ? (
                  <>
                    <StatusIcon kind="err" />
                    {/* The API's own words, which say what to do (T471's review). */}
                    {taken?.reason}
                  </>
                ) : name !== '' && !named ? (
                  misnamed
                ) : (
                  <>
                    A letter, then letters, digits and single underscores, not ending in one, up to
                    40 characters. Cubes name it as{' '}
                    <code>data_source: {named ? name : 'its_name'}</code>.
                  </>
                )}
              </span>
            </div>
            {targets === undefined ? null : targets.length === 0 ? (
              <InfoBar>
                <p>
                  You have read-write access to no shared folder, so there is nowhere for it to go.
                </p>
              </InfoBar>
            ) : (
              <>
                <TargetTree
                  targets={targets}
                  chosen={target}
                  onChoose={setTarget}
                  describedBy={`${ids}-target-note`}
                />
                <p id={`${ids}-target-note`} className="connection-form__note">
                  Only folders where you have read-write access. It stays private in My workspace
                  until you propose it to the folder.
                </p>
              </>
            )}
            {summary('Tested', tested === null ? '' : `Every check passed · ${tested.at}`)}
          </div>
        ) : null}

        {failure === null ? null : <StateLine kind="err">{failure}</StateLine>}
      </div>

      <footer className="source-pane__foot">
        {step === 0 ? null : (
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => {
              goTo(step - 1);
            }}
          >
            <span aria-hidden="true">‹ </span>Back
          </button>
        )}
        <span className="source-pane__spacer" />
        {step === 2 && tested !== null && !passedKept ? (
          <>
            {tested.ok ? null : (
              <span className="source-pane__foot-note">Name comes after a passing test.</span>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => void runTest()}
            >
              Test again
            </button>
          </>
        ) : step === 2 && passedKept ? (
          <>
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => void runTest()}
            >
              Test again
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => {
                goTo(3);
              }}
            >
              Next: {steps[3]} <span aria-hidden="true">›</span>
            </button>
          </>
        ) : (
          <>
            {/* As a sheet, below 1,024 px, its head's × closes it instead (state K, T496). */}
            <button
              type="button"
              className="btn btn-ghost source-pane__cancel"
              disabled={busy === 'create'}
              onClick={leave}
            >
              Cancel
            </button>
            {step === 0 ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={driver === null}
                onClick={() => {
                  goTo(1);
                }}
              >
                Next: Connection <span aria-hidden="true">›</span>
              </button>
            ) : step === 1 ? (
              <button type="button" className="btn btn-primary" onClick={toTest}>
                Next: Test <span aria-hidden="true">›</span>
              </button>
            ) : step === 2 ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() => void runTest()}
              >
                {busy === 'test' ? 'Testing…' : 'Test connection'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canCreate}
                onClick={() => void create()}
              >
                {busy === 'create'
                  ? 'Creating…'
                  : inWorkspace
                    ? 'Create in My workspace'
                    : 'Create data source'}
              </button>
            )}
          </>
        )}
      </footer>

      {asking ? (
        <AskToDiscard passed={tested?.ok === true} onKeep={keepOn} onDiscard={onClose} />
      ) : null}
    </aside>
  );
}

/**
 * The discard question, inside the pane (state I, rule 85): focus on the
 * answer that loses nothing, and Tab kept to its two answers while it is
 * asked.
 */
function AskToDiscard({
  passed,
  onKeep,
  onDiscard,
}: {
  passed: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);
  useEffect(() => {
    keep.current?.focus();
  }, []);
  return (
    <div className="source-pane__veil">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${ids}-discard`}
        aria-describedby={`${ids}-discard-body`}
        className="source-pane__ask"
      >
        <h3 id={`${ids}-discard`}>Discard this data source?</h3>
        <p id={`${ids}-discard-body`}>
          The connection you typed{passed ? ' and its passed test are' : ' is'} lost. Nothing has
          been saved.
        </p>
        <div className="source-pane__ask-actions">
          <button ref={keep} type="button" className="btn" onClick={onKeep}>
            Keep editing
          </button>
          <button type="button" className="btn btn-danger" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
