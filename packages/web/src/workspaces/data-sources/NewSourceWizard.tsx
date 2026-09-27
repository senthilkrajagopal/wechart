import { useEffect, useId, useRef, useState } from 'react';

import {
  DRIVER_TYPES,
  DRIVERS,
  sealSecretV1,
  SHORT_NAME,
  type DriverType,
  type FieldValue,
  type SealedV1,
  type XcubeKey,
} from '@wechart/core';

import { StateLine, StatusIcon, type StateKind } from '../../shell/StatusIcon';
import { useFocusTrap } from '../../shell/useFocusTrap';
import { targetLabel, type Target } from '../explore/NewItemDialog';
import {
  ConnectionForm,
  fieldsToSend,
  initialValues,
  secretsToSeal,
  type ConnectionValues,
} from './ConnectionForm';

/**
 * Adding a data source (T363; AC-158, AC-159, AC-160, AC-325, AC-282;
 * direction.md rules 23, 35 and 74): Type → Connection → Test → Name, as the
 * approved prototype's wizard steps (admin-sources.js).
 *
 * - **Type:** the eight drivers xcube takes (AC-160).
 * - **Connection:** that driver's fields and ways to sign in.
 * - **Test:** xcube connects with Cube's own driver and answers each check
 *   (AC-159). Each typed secret is sealed to xcube's key here, as the test is
 *   submitted, and the envelope is what is sent (AC-325).
 * - **Name:** its short name and, in the workspace, the shared folder it is
 *   to go to (AC-282). Create sends exactly what was tested, naming the test
 *   that passed. There is no step past Test without one, and no making one
 *   without (AC-158; the user's answer, 2026-09-27: "test first, and dont
 *   save if test fails"), which the API holds it to too.
 */
export type Seal = (
  driver: DriverType,
  field: string,
  fields: Readonly<Record<string, FieldValue>>,
  secret: string,
) => Promise<SealedV1>;

interface Check {
  readonly id: string;
  readonly status: 'passed' | 'failed' | 'skipped';
  readonly durationMs: number;
  readonly error?: string;
}

/** What the test sent, and xcube's answer to it. */
interface Tested {
  readonly ok: boolean;
  readonly testId?: string;
  readonly checks: readonly Check[];
  readonly authMethod: string;
  readonly fields: Record<string, FieldValue>;
  readonly sealed: Record<string, SealedV1>;
}

const STEPS = ['Type', 'Connection', 'Test', 'Name'] as const;

/** xcube's checks, as AC-159 names them. */
const CHECK_LABELS: Record<string, string> = {
  secrets: 'Open the secrets',
  config: 'Build the connection’s configuration',
  connect: 'Connect',
  schemas: 'Read the catalog',
};
const OUTCOMES: Record<Check['status'], { label: string; icon: StateKind }> = {
  passed: { label: 'Passed', icon: 'ok' },
  failed: { label: 'Failed', icon: 'err' },
  skipped: { label: 'Skipped', icon: 'idle' },
};

/** Seals to the key wechart's API gives out (T441), read once. */
function sealerOf(): Seal {
  let key: Promise<XcubeKey> | undefined;
  return async (driver, field, fields, secret) => {
    key ??= fetch('/api/data-sources/sealing-key').then(async (response) => {
      if (!response.ok) throw new Error(await errorOf(response, 'read the key to seal it to'));
      return (await response.json()) as XcubeKey;
    });
    return sealSecretV1(
      await key.catch((error: unknown) => {
        key = undefined;
        throw error;
      }),
      driver,
      field,
      fields,
      secret,
    );
  };
}

async function errorOf(response: Response, doing: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    problems?: string[];
  };
  const said = [body.error, ...(body.problems ?? [])].filter(Boolean).join(' ');
  return said === '' ? `Could not ${doing} (${String(response.status)}).` : said;
}

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
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  const [seal] = useState<Seal>(() => givenSeal ?? sealerOf());

  const [step, setStep] = useState(0);
  const [driver, setDriver] = useState<DriverType | null>(null);
  const [values, setValues] = useState<ConnectionValues | null>(null);
  const [tested, setTested] = useState<Tested | null>(null);
  const [name, setName] = useState('');
  const [target, setTarget] = useState(targets?.length === 1 ? targets[0]!.id : '');
  const [busy, setBusy] = useState<'test' | 'create' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** Every test run here, so all of them join the history of the one made (AC-163). */
  const [trials, setTrials] = useState<readonly string[]>([]);

  // Escape closes it, as every dialog here closes, but not while it is
  // making the data source.
  const closing = useRef(onClose);
  const making = useRef(false);
  useEffect(() => {
    closing.current = onClose;
    making.current = busy === 'create';
  }, [onClose, busy]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !making.current) closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Focus starts on each step's first control, the dialog's own included
  // (T363's review): never left behind the dialog or dropped to the page.
  const stepBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stepBox.current
      ?.querySelector<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
      )
      ?.focus();
  }, [step]);

  /** A test holds for the connection it was of. */
  const forget = () => {
    setTested(null);
    setFailure(null);
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
      const answer = (await response.json()) as {
        ok: boolean;
        testId?: string;
        checks: Check[];
      };
      setTested({ ...answer, authMethod: values.authMethod, fields, sealed });
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
      if (!response.ok) throw new Error(await errorOf(response, 'make it'));
      onCreated((await response.json()) as { id: string; name: string });
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // As the API takes a name (repos/data-sources.ts `checkName`).
  const named = SHORT_NAME.test(name) && name.length <= 64;
  /** A test that passed and was kept, which a data source can be made from. */
  const passedKept = tested?.ok === true && tested.testId !== undefined;
  const canNext =
    busy === null && ((step === 0 && driver !== null) || step === 1 || (step === 2 && passedKept));
  const canCreate =
    busy === null && named && (targets === undefined || target !== '') && passedKept;
  /** The test's outcome, said as it changes (T363's review). */
  const firstFailed = tested?.checks.find((check) => check.status === 'failed');
  const outcome =
    busy === 'test'
      ? 'Testing…'
      : tested === null
        ? ''
        : tested.ok
          ? tested.testId === undefined
            ? 'The test passed, but wechart couldn’t keep it, and a data source is made only from a test it keeps: run it again.'
            : 'Every check passed.'
          : `The test failed at ${firstFailed === undefined ? 'a check' : (CHECK_LABELS[firstFailed.id] ?? firstFailed.id)}.`;

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog new-source-wizard"
      >
        <h2 id={heading}>New data source</h2>
        <ol className="new-source-wizard__steps">
          {STEPS.map((label, at) => (
            <li key={label} aria-current={at === step ? 'step' : undefined}>
              {at + 1}. {label}
            </li>
          ))}
        </ol>

        <div ref={stepBox} className="new-source-wizard__step">
          {step === 0 ? (
            <fieldset className="new-source-wizard__types">
              <legend>Type</legend>
              {DRIVER_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={driver === type}
                  onClick={() => {
                    if (driver !== type) {
                      setDriver(type);
                      setValues(initialValues(type));
                      forget();
                    }
                  }}
                >
                  {DRIVERS[type].label}
                </button>
              ))}
            </fieldset>
          ) : null}

          {step === 1 && driver !== null && values !== null ? (
            <ConnectionForm
              driver={driver}
              values={values}
              onChange={(next) => {
                setValues(next);
                forget();
              }}
            />
          ) : null}

          {step === 2 && driver !== null ? (
            <section className="new-source-wizard__test" aria-labelledby={`${heading}-test`}>
              <h3 id={`${heading}-test`}>Test the {DRIVERS[driver].label} connection</h3>
              <p>xcube connects with Cube’s own driver for it, and says how each check went.</p>
              {tested === null ? null : (
                <ul className="connection-checks" aria-label="Checks">
                  {tested.checks.map((check) => {
                    const outcome = OUTCOMES[check.status];
                    return (
                      <li key={check.id} className={`connection-checks__check is-${check.status}`}>
                        <StatusIcon kind={outcome.icon} />
                        {outcome.label}: {CHECK_LABELS[check.id] ?? check.id}
                        {check.status === 'skipped' ? null : ` · ${String(check.durationMs)} ms`}
                        {check.error === undefined ? null : ` — ${check.error}`}
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="new-source-wizard__row">
                <button type="button" className="btn" disabled={busy !== null} onClick={runTest}>
                  {tested === null ? 'Run test' : 'Run again'}
                </button>
              </div>
              {/* Kept mounted, its words changing, so each outcome is said. */}
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
              >
                {outcome}
              </StateLine>
            </section>
          ) : null}

          {step === 3 ? (
            <div className="new-source-wizard__name">
              <div className="field">
                <label htmlFor={`${heading}-name`}>Name</label>
                <input
                  id={`${heading}-name`}
                  spellCheck={false}
                  autoComplete="off"
                  value={name}
                  aria-invalid={name !== '' && !named}
                  aria-describedby={`${heading}-name-hint`}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
                <span id={`${heading}-name-hint`} className="connection-form__note">
                  {name !== '' && !named ? (
                    'Not a name Cube takes: use lower-case letters and digits, words joined by single underscores, at most 64 characters.'
                  ) : (
                    <>
                      Lower-case letters and digits, words joined by single underscores. Cubes name
                      it as <code>data_source: {named ? name : 'its_name'}</code>.
                    </>
                  )}
                </span>
              </div>
              {targets === undefined ? null : targets.length === 0 ? (
                <div className="info-bar" role="note">
                  <StatusIcon kind="idle" />
                  <p>
                    You have read-write access to no shared folder, so there is nowhere for it to
                    go.
                  </p>
                </div>
              ) : (
                <div className="field">
                  <label htmlFor={`${heading}-target`}>Target folder</label>
                  <select
                    id={`${heading}-target`}
                    value={target}
                    onChange={(event) => {
                      setTarget(event.target.value);
                    }}
                  >
                    <option value="" disabled>
                      Choose a folder…
                    </option>
                    {targets.map((each) => (
                      <option key={each.id} value={each.id}>
                        {targetLabel(each)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <StateLine kind="err">{failure ?? ''}</StateLine>

        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          {step === 0 ? null : (
            <button
              type="button"
              className="btn"
              disabled={busy !== null}
              onClick={() => {
                setFailure(null);
                setStep(step - 1);
              }}
            >
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canNext}
              onClick={() => {
                setFailure(null);
                setStep(step + 1);
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canCreate}
              onClick={create}
            >
              Create data source
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
