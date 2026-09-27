import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SealedV1 } from '@wechart/core';

import { NewSourceWizard } from './NewSourceWizard';

/**
 * T363 (AC-158, AC-159, AC-160, AC-325, AC-282): a data source is added in
 * the workspace through Type → Connection → Test → Name. Its test is xcube's,
 * each check shown; Create needs a passing test or an explicit "without one";
 * a secret is sealed when the test (or the create) is submitted, and no body
 * sent to wechart holds it as typed.
 */
const TYPED = 'canary-hunter2-secret';
const envelope: SealedV1 = { v: 1, kid: 'kid-1', enc: 'enc', ct: 'sealed-ct' };

const passed = {
  ok: true,
  testId: 'test-1',
  checks: [
    { id: 'secrets', status: 'passed', durationMs: 2 },
    { id: 'config', status: 'passed', durationMs: 1 },
    { id: 'connect', status: 'passed', durationMs: 30 },
    { id: 'schemas', status: 'passed', durationMs: 12 },
  ],
};
const failed = {
  ok: false,
  testId: 'test-2',
  checks: [
    { id: 'secrets', status: 'passed', durationMs: 2 },
    { id: 'config', status: 'passed', durationMs: 1 },
    {
      id: 'connect',
      status: 'failed',
      durationMs: 9,
      error: 'password authentication failed for user "cube"',
    },
    { id: 'schemas', status: 'skipped', durationMs: 0 },
  ],
};

/** Answers wechart's routes, keeping each request's body as sent; tests answered in turn. */
function serve(...testAnswers: unknown[]) {
  const sent: { url: string; body: string }[] = [];
  let run = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      sent.push({ url, body });
      if (url === '/api/data-sources/test')
        return Response.json(testAnswers[Math.min(run++, testAnswers.length - 1)]);
      if (url === '/api/data-sources')
        return Response.json({ id: 'ds-1', ...(JSON.parse(body) as object) }, { status: 201 });
      return new Response(null, { status: 404 });
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const targets = [{ id: 'f-sales', path: ['Finance', 'Sales'] }];

function open() {
  const seal = vi.fn(async () => envelope);
  const onCreated = vi.fn();
  render(
    <NewSourceWizard
      folderId="mine"
      targets={targets}
      seal={seal}
      onCreated={onCreated}
      onClose={vi.fn()}
    />,
  );
  return { seal, onCreated, dialog: screen.getByRole('dialog', { name: 'New data source' }) };
}

/** Chooses PostgreSQL and fills its connection, the password included. */
async function connect(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('button', { name: 'PostgreSQL' }));
  await user.click(within(dialog).getByRole('button', { name: 'Next' }));
  await user.type(within(dialog).getByLabelText('Host'), 'db.internal');
  await user.type(within(dialog).getByLabelText('Database'), 'sales');
  await user.type(within(dialog).getByLabelText('User'), 'cube');
  await user.type(within(dialog).getByLabelText('Password'), TYPED);
  await user.click(within(dialog).getByRole('button', { name: 'Next' }));
}

describe('adding a data source in the workspace (T363)', () => {
  it('offers the eight drivers, and each one’s own fields and ways to sign in (AC-160)', async () => {
    const user = userEvent.setup();
    serve(passed);
    const { dialog } = open();
    const types = within(dialog).getByRole('group', { name: 'Type' });
    expect(
      within(types)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'PostgreSQL',
      'Amazon Redshift',
      'MySQL',
      'Snowflake',
      'BigQuery',
      'SQL Server',
      'Oracle',
      'Dremio',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);

    await user.click(within(types).getByRole('button', { name: 'MySQL' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    const method = within(dialog).getByRole('combobox', { name: 'Sign in with' });
    expect([...method.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'Password',
      'Client certificate',
    ]);
    expect(within(dialog).getByLabelText('Port')).toHaveProperty('value', '3306');
    expect(within(dialog).getByRole('checkbox', { name: 'Use TLS' })).toHaveProperty(
      'checked',
      false,
    );
    await user.selectOptions(method, 'client-certificate');
    expect(within(dialog).getByText('Sent only over TLS: turn on Use TLS.')).toBeDefined();
    expect(within(dialog).getByLabelText('Client key (PEM)')).toBeDefined();
    expect(within(dialog).queryByLabelText('Password')).toBeNull();
  });

  it.each([
    // AC-160's ways to sign in, each driver's and none other.
    ['PostgreSQL', ['Password', 'Client certificate']],
    ['Amazon Redshift', ['Password']],
    ['MySQL', ['Password', 'Client certificate']],
    ['Snowflake', ['Key pair', 'OAuth token', 'Password']],
    ['BigQuery', ['Service account key']],
    ['SQL Server', ['SQL login', 'Windows (NTLM)', 'Microsoft Entra ID service principal']],
    ['Oracle', ['Password']],
    ['Dremio', ['Personal access token', 'Password']],
  ])('offers %s its own ways to sign in (AC-160)', async (label, methods) => {
    const user = userEvent.setup();
    serve(passed);
    const { dialog } = open();
    await user.click(within(dialog).getByRole('button', { name: label }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    const shown =
      methods.length === 1
        ? [within(dialog).getByText(methods[0]!, { selector: '.connection-form__method' })]
        : [
            ...within(dialog)
              .getByRole('combobox', { name: 'Sign in with' })
              .querySelectorAll('option'),
          ];
    expect(shown.map((each) => each.textContent)).toEqual(methods);
  });

  it('asks Dremio for a Cloud URL or a Software host, and BigQuery for its project (AC-160)', async () => {
    const user = userEvent.setup();
    serve(passed);
    const { dialog } = open();
    await user.click(within(dialog).getByRole('button', { name: 'Dremio' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    for (const field of ['Dremio Cloud project URL', 'Host (Dremio Software)', 'Port', 'Token'])
      expect(within(dialog).getByLabelText(field)).toBeDefined();
    expect(within(dialog).getByLabelText('Port')).toHaveProperty('value', '9047');

    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    await user.click(within(dialog).getByRole('button', { name: 'BigQuery' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    for (const field of ['Project ID', 'Location', 'Service-account key (JSON)'])
      expect(within(dialog).getByLabelText(field)).toBeDefined();
    expect(within(dialog).queryByLabelText('Host')).toBeNull();
  });

  it('runs xcube’s test with the secret sealed, shows each check, and creates from what passed (AC-158, AC-159, AC-325, AC-282)', async () => {
    const user = userEvent.setup();
    const sent = serve(passed);
    const { dialog, seal, onCreated } = open();
    await connect(user, dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    const fields = {
      host: 'db.internal',
      port: 5432,
      database: 'sales',
      ssl: true,
      sslRejectUnauthorized: true,
      user: 'cube',
    };
    expect(seal).toHaveBeenCalledExactlyOnceWith('postgres', 'password', fields, TYPED);
    const checks = within(dialog).getByRole('list', { name: 'Checks' });
    expect(
      within(checks)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Passed: Open the secrets · 2 ms',
      'Passed: Build the connection’s configuration · 1 ms',
      'Passed: Connect · 30 ms',
      'Passed: Read the catalog · 12 ms',
    ]);

    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'sales_replica');
    expect(within(dialog).getByRole('combobox', { name: 'Target folder' })).toHaveProperty(
      'value',
      'f-sales',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create data source' }));

    const tested = {
      driver: 'postgres',
      authMethod: 'password',
      fields,
      sealed: { password: envelope },
    };
    expect(sent.map(({ url, body }) => [url, JSON.parse(body) as unknown])).toEqual([
      ['/api/data-sources/test', { folderId: 'mine', ...tested }],
      [
        '/api/data-sources',
        {
          folderId: 'mine',
          name: 'sales_replica',
          ...tested,
          targetFolderId: 'f-sales',
          testId: 'test-1',
        },
      ],
    ]);
    // Sealed once, at the test: the create sends that envelope, as tested.
    expect(seal).toHaveBeenCalledTimes(1);
    for (const { body } of sent) expect(body).not.toContain(TYPED);
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'ds-1' }));
  });

  it('shows a failed check’s error, and goes no further until a test passes (AC-158, AC-159; the user’s answer, 2026-09-27)', async () => {
    const user = userEvent.setup();
    const sent = serve(failed);
    const { dialog } = open();
    await connect(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));

    const checks = within(dialog).getByRole('list', { name: 'Checks' });
    expect(
      within(checks)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Passed: Open the secrets · 2 ms',
      'Passed: Build the connection’s configuration · 1 ms',
      'Failed: Connect · 9 ms — password authentication failed for user "cube"',
      'Skipped: Read the catalog',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
    // Test first: there is no making one without a passing test.
    expect(within(dialog).queryByRole('button', { name: /without/i })).toBeNull();
    expect(within(dialog).queryByRole('textbox', { name: 'Name' })).toBeNull();
    expect(sent.map(({ url }) => url)).not.toContain('/api/data-sources');
  });

  it('forgets a test once the connection it tested changes', async () => {
    const user = userEvent.setup();
    serve(passed);
    const { dialog } = open();
    await connect(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveProperty('disabled', false);

    await user.click(within(dialog).getByRole('button', { name: 'Back' }));
    await user.clear(within(dialog).getByLabelText('Host'));
    await user.type(within(dialog).getByLabelText('Host'), 'elsewhere');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).queryByRole('list', { name: 'Checks' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
  });

  it('makes it from a later test that passed, with every test it ran in its history (T363’s review; AC-163)', async () => {
    const user = userEvent.setup();
    const sent = serve(failed, passed);
    const { dialog } = open();
    await connect(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
    await user.click(within(dialog).getByRole('button', { name: 'Run again' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'sales_replica');
    await user.click(within(dialog).getByRole('button', { name: 'Create data source' }));

    const created = JSON.parse(sent.at(-1)!.body) as Record<string, unknown>;
    expect(created['testId']).toBe('test-1');
    expect(created['trials']).toEqual(['test-2']);
    expect(created).not.toHaveProperty('override');
  });

  it('says why when a test passed but wasn’t kept, and asks for it again', async () => {
    const user = userEvent.setup();
    const { testId: _kept, ...unkept } = passed;
    void _kept;
    serve(unkept);
    const { dialog } = open();
    await connect(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(within(dialog).getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);
    expect(
      within(dialog).getByText(
        'The test passed, but wechart couldn’t keep it, and a data source is made only from a test it keeps: run it again.',
      ),
    ).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Run again' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('turns TLS on for a client certificate, which is sent only over TLS (T363’s hand-on)', async () => {
    const user = userEvent.setup();
    serve(passed);
    const { dialog } = open();
    await user.click(within(dialog).getByRole('button', { name: 'MySQL' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    const tls = within(dialog).getByRole('checkbox', { name: 'Use TLS' });
    expect(tls).toHaveProperty('checked', false);
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Sign in with' }),
      'client-certificate',
    );
    expect(tls).toHaveProperty('checked', true);
  });

  it('keeps focus in its step, says a test’s outcome, and says why a name won’t do', async () => {
    const user = userEvent.setup();
    serve(failed, passed);
    const { dialog } = open();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'PostgreSQL' }));
    await user.click(within(dialog).getByRole('button', { name: 'PostgreSQL' }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Host'));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    await user.click(within(dialog).getByRole('button', { name: 'Run test' }));
    expect(within(dialog).getByRole('status').textContent).toBe('The test failed at Connect.');
    await user.click(within(dialog).getByRole('button', { name: 'Run again' }));
    expect(within(dialog).getByRole('status').textContent).toBe('Every check passed.');
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    const name = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(name);
    await user.type(name, 'Sales DB');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(
      within(dialog).getByText(
        'Not a name Cube takes: use lower-case letters and digits, words joined by single underscores, at most 64 characters.',
      ),
    ).toBeDefined();
  });
});
