import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import type { DriverType } from '@wechart/core';

import {
  ConnectionForm,
  fieldsToSend,
  initialValues,
  missingOf,
  type ConnectionValues,
} from './ConnectionForm';

/**
 * T471 (AC-160, AC-312, AC-339, AC-340; design 02, "Driver forms"): every
 * driver's Connection step in the same three groups — where it connects, how
 * it signs in, TLS — asking an either/or shape first (Dremio Cloud or
 * Software, Oracle's connect string or host and service name), and showing
 * only the chosen shape's fields and ways to sign in.
 */
function Form({ driver, start }: { driver: DriverType; start?: Partial<ConnectionValues> }) {
  const [values, setValues] = useState<ConnectionValues>({ ...initialValues(driver), ...start });
  return (
    <>
      <ConnectionForm driver={driver} values={values} onChange={setValues} />
      <output data-testid="sent">{JSON.stringify(fieldsToSend(driver, values))}</output>
    </>
  );
}
const sent = () => JSON.parse(screen.getByTestId('sent').textContent ?? '{}') as object;
const group = (name: string) => screen.getByRole('group', { name });

describe('the three groups (design 02)', () => {
  it('asks PostgreSQL where it connects, how it signs in and about TLS, each in its group', () => {
    render(<Form driver="postgres" />);
    expect(within(group('Where it connects')).getByLabelText(/^Host/)).toBeDefined();
    expect(within(group('Where it connects')).getByLabelText(/^Port/)).toHaveProperty(
      'value',
      '5432',
    );
    expect(within(group('How it signs in')).getByLabelText(/^User/)).toBeDefined();
    expect(within(group('TLS')).getByRole('switch', { name: 'Use TLS' })).toHaveProperty(
      'checked',
      true,
    );
    // Required fields say so in words, not by an asterisk alone.
    expect(screen.getByText('Host').parentElement?.textContent).toBe('Host · required');
  });

  it.each(['snowflake', 'bigquery', 'oracle'] as const)(
    'gives %s, which takes no TLS fields, no TLS group',
    (driver) => {
      render(<Form driver={driver} />);
      expect(screen.queryByRole('group', { name: 'TLS' })).toBeNull();
    },
  );
});

describe('ways to sign in (UX-205)', () => {
  it('states the one way where there is one, and offers two as a segmented choice', () => {
    const { unmount } = render(<Form driver="redshift" />);
    expect(within(group('How it signs in')).getByText('User and password')).toBeDefined();
    expect(screen.queryByRole('radiogroup', { name: 'Sign in with' })).toBeNull();
    unmount();

    render(<Form driver="postgres" />);
    const methods = screen.getByRole('radiogroup', { name: 'Sign in with' });
    expect(
      within(methods)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Password', 'Client certificate']);
    expect(
      within(methods).getByRole('radio', { name: 'Password' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('offers Snowflake’s three as rows, with the password’s caution beside it', async () => {
    const user = userEvent.setup();
    render(<Form driver="snowflake" />);
    const methods = screen.getByRole('radiogroup', { name: 'Sign in with' });
    expect(
      within(methods)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Key pair', 'OAuth token', 'Password']);
    await user.click(within(methods).getByRole('radio', { name: 'Password' }));
    expect(
      screen.getByText(
        'Snowflake blocks passwords for non-human users from its 2026 rollout; prefer a key pair.',
      ),
    ).toBeDefined();
    expect(screen.getByLabelText(/^Password/)).toBeDefined();
  });

  it('turns TLS on for a client certificate and locks it, saying why', async () => {
    const user = userEvent.setup();
    render(<Form driver="mysql" />);
    const tls = within(group('TLS')).getByRole('switch', { name: 'Use TLS' });
    expect(tls).toHaveProperty('checked', false);
    expect(
      screen.getByText('Off by default for MySQL. Turn on if the server offers TLS.'),
    ).toBeDefined();
    // Verification and a CA certificate matter only over TLS.
    expect(screen.queryByRole('switch', { name: 'Verify the server’s certificate' })).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Client certificate' }));
    expect(tls).toHaveProperty('checked', true);
    expect(tls).toHaveProperty('disabled', true);
    expect(
      screen.getByText('On, because a client certificate is sent only over TLS.'),
    ).toBeDefined();
    expect(screen.getByRole('switch', { name: 'Verify the server’s certificate' })).toHaveProperty(
      'checked',
      true,
    );
    // The CA box only on request.
    expect(screen.queryByLabelText(/^CA certificate/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add a CA certificate (PEM)' }));
    expect(screen.getByLabelText(/^CA certificate/)).toBeDefined();
  });
});

describe('either/or shapes, asked first (UX-206)', () => {
  it('asks Dremio Cloud or Software, and shows and sends only the chosen shape’s fields', async () => {
    const user = userEvent.setup();
    render(<Form driver="dremio" />);
    const which = screen.getByRole('radiogroup', { name: 'Which Dremio?' });
    expect(
      within(which)
        .getByRole('radio', { name: /^Dremio Cloud/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
    // Cloud: its project URL, and a token, stated.
    expect(screen.getByLabelText(/^Project URL/)).toBeDefined();
    expect(screen.queryByLabelText(/^Host/)).toBeNull();
    expect(screen.getByText('Personal access token')).toBeDefined();
    expect(screen.queryByRole('radiogroup', { name: 'Sign in with' })).toBeNull();
    expect(
      screen.getByText(
        'Dremio Cloud uses TLS when the project URL starts with https://. Cube’s Dremio driver has no certificate settings.',
      ),
    ).toBeDefined();
    await user.type(
      screen.getByLabelText(/^Project URL/),
      'https://api.dremio.cloud/v0/projects/7f',
    );
    expect(sent()).toEqual({ url: 'https://api.dremio.cloud/v0/projects/7f' });

    await user.click(within(which).getByRole('radio', { name: /^Dremio Software/ }));
    expect(screen.queryByLabelText(/^Project URL/)).toBeNull();
    await user.type(screen.getByLabelText(/^Host/), 'dremio.lake.internal');
    expect(screen.getByRole('switch', { name: 'Use HTTPS' })).toHaveProperty('checked', false);
    expect(
      within(screen.getByRole('radiogroup', { name: 'Sign in with' }))
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Personal access token', 'User and password']);
    // The URL typed for Cloud is not sent for Software.
    expect(sent()).toEqual({ host: 'dremio.lake.internal', port: 9047, ssl: false });
  });

  it('warns beside a Dremio Cloud URL that starts with http:// (AC-339)', async () => {
    const user = userEvent.setup();
    render(<Form driver="dremio" />);
    await user.type(
      screen.getByLabelText(/^Project URL/),
      'http://api.dremio.cloud/v0/projects/7f',
    );
    expect(
      screen.getByText(/This URL starts with http:\/\/, so the token would travel unencrypted/),
    ).toBeDefined();
    await user.clear(screen.getByLabelText(/^Project URL/));
    await user.type(
      screen.getByLabelText(/^Project URL/),
      'https://api.dremio.cloud/v0/projects/7f',
    );
    expect(screen.queryByText(/so the token would travel unencrypted/)).toBeNull();
  });

  it('asks Oracle for a connect string, or a host and service name', async () => {
    const user = userEvent.setup();
    render(<Form driver="oracle" />);
    const shape = screen.getByRole('radiogroup', { name: 'Connect with' });
    expect(
      within(shape)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toEqual(['Connect string', 'Host and service name']);
    await user.type(screen.getByLabelText(/^Connect string/), 'db.fin.internal:1521/FINPDB');
    expect(screen.queryByLabelText(/^Service name/)).toBeNull();
    expect(sent()).toEqual({ connectString: 'db.fin.internal:1521/FINPDB' });

    await user.click(within(shape).getByRole('radio', { name: 'Host and service name' }));
    await user.type(screen.getByLabelText(/^Host/), 'db.fin.internal');
    await user.type(screen.getByLabelText(/^Service name/), 'FINPDB');
    expect(sent()).toEqual({ host: 'db.fin.internal', port: 1521, database: 'FINPDB' });
  });
});

describe('secrets (AC-325, AC-340)', () => {
  it('says once that secrets are sealed, and says a pasted key by its length, never its text', () => {
    render(<Form driver="snowflake" />);
    expect(
      screen.getAllByText(
        'Secrets are encrypted in your browser before they are sent, and are never shown again.',
      ),
    ).toHaveLength(1);
    const key = screen.getByLabelText(/^Private key \(PEM\)/);
    fireEvent.change(key, { target: { value: 'x'.repeat(1675) } });
    fireEvent.blur(key);
    expect(screen.getByText('Pasted · 1,675 characters')).toBeDefined();
    expect(screen.queryByDisplayValue('x'.repeat(1675))).toBeNull();
    expect(screen.getByRole('button', { name: 'Replace the private key (PEM)' })).toBeDefined();
  });

  it('reads a BigQuery key’s client_email in the browser and shows it (AC-340)', () => {
    render(<Form driver="bigquery" />);
    const key = screen.getByLabelText(/^Key \(JSON\)/);
    fireEvent.change(key, {
      target: {
        value: JSON.stringify({
          type: 'service_account',
          client_email: 'cube-reader@acme-analytics.iam.gserviceaccount.com',
          private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        }),
      },
    });
    expect(
      screen.getByText('Key for cube-reader@acme-analytics.iam.gserviceaccount.com'),
    ).toBeDefined();
    // Nothing of the key is a field sent unsealed.
    expect(sent()).toEqual({});
  });
});

describe('what is missing (design 01, state B)', () => {
  it('names the required fields left empty, secrets included, of the shape and method chosen', () => {
    expect(missingOf('postgres', initialValues('postgres')).map((field) => field.label)).toEqual([
      'Host',
      'Database',
      'User',
      'Password',
    ]);
    // A stored secret isn't asked for again.
    expect(
      missingOf('postgres', initialValues('postgres'), ['password']).map((field) => field.label),
    ).toEqual(['Host', 'Database', 'User']);
    // Dremio Cloud needs its URL and token; Software, its host.
    expect(missingOf('dremio', initialValues('dremio')).map((field) => field.key)).toEqual([
      'url',
      'token',
    ]);
    expect(
      missingOf('dremio', { ...initialValues('dremio'), shape: 'software' }).map(
        (field) => field.key,
      ),
    ).toEqual(['host', 'token']);
  });
});

/**
 * T497 (AC-312; design 03 pins 6 and 7): on a stored one's page, a field
 * changed from what is stored is marked with its old value, the fields a
 * secret is bound to wear the link icon, and a secret asked for again says why.
 */
describe('a stored one’s fields, changed', () => {
  const was = { host: 'db-1', port: 5432, database: 'sales', user: 'cube', ssl: false };
  function Stored({
    asked,
    fields = was,
    keptFrom,
  }: {
    asked?: Record<string, string>;
    fields?: Record<string, string | number | boolean>;
    keptFrom?: string;
  }) {
    const [values, setValues] = useState<ConnectionValues>({
      ...initialValues('postgres'),
      fields,
    });
    return (
      <>
        <ConnectionForm
          driver="postgres"
          values={values}
          onChange={setValues}
          stored={asked === undefined ? ['password'] : []}
          was={fields}
          {...(asked === undefined ? {} : { asked })}
          {...(keptFrom === undefined ? {} : { keptFrom })}
        />
        <output data-testid="secrets">{JSON.stringify(values.secrets)}</output>
        <output data-testid="fields">{JSON.stringify(values.fields)}</output>
      </>
    );
  }

  it('never tints a field left at a default nothing stored, and tints one filled in (T497’s review)', async () => {
    // The seeded default stores no port and no verification (AC-310).
    render(<Stored fields={{ host: 'db-1', database: 'sales', user: 'cube', ssl: true }} />);
    const port = screen.getByLabelText(/^Port/);
    expect(port.closest('.field')?.classList.contains('is-changed')).toBe(false);
    await userEvent.type(port, '5433');
    expect(port.closest('.field')?.classList.contains('is-changed')).toBe(true);
    expect(port.closest('.field')?.querySelector('.field__was')?.textContent).toBe('Was empty');
  });

  it('shows a switch nothing stored at its default, bound, and says what it was once changed', async () => {
    render(<Stored fields={{ host: 'db-1', database: 'sales', user: 'cube', ssl: true }} />);
    const verify = screen.getByRole('switch', { name: /Verify the server/ });
    // Unstored, the certificate is still verified: the driver's default.
    expect((verify as HTMLInputElement).checked).toBe(true);
    const row = verify.closest('.switch-row') as HTMLElement;
    expect(row.querySelector('.field__bound')).not.toBeNull();
    expect(row.classList.contains('is-changed')).toBe(false);
    await userEvent.click(verify);
    expect(row.classList.contains('is-changed')).toBe(true);
    expect(row.querySelector('.field__was')?.textContent).toBe('Was on');
    expect(verify.getAttribute('aria-describedby')).toContain(
      row.querySelector('.field__was')?.id ?? 'none',
    );
  });

  it('never draws a stored secret: said kept, with Replace, which opens an empty field (state D)', async () => {
    render(<Stored keptFrom="Sales / EMEA" />);
    expect(screen.getByText('Kept from Sales / EMEA · encrypted')).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Replace the password' }));
    const password = screen.getByLabelText(/^Password/);
    expect((password as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(password);
    await userEvent.type(password, 'new-secret');
    expect(screen.getByTestId('secrets').textContent).toBe('{"password":"new-secret"}');

    await userEvent.click(screen.getByRole('button', { name: 'Keep the stored one' }));
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByTestId('secrets').textContent).toBe('{"password":""}');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Replace the password' }),
    );
  });

  it('says a stored secret is stored, in place, where it isn’t a copy', () => {
    render(<Stored />);
    expect(screen.getByText('Stored · encrypted')).toBeTruthy();
  });

  it('marks a changed field with its stored value, and the fields a secret is bound to', async () => {
    render(<Stored />);
    const host = screen.getByLabelText(/^Host/);
    expect(host.closest('.field')?.classList.contains('is-changed')).toBe(false);
    await userEvent.clear(host);
    await userEvent.type(host, 'db-2');
    const field = host.closest('.field');
    expect(field?.classList.contains('is-changed')).toBe(true);
    expect(field?.querySelector('.field__was')?.textContent).toBe('Was db-1');
    expect(host.getAttribute('aria-describedby')).toContain(
      field?.querySelector('.field__was')?.id ?? 'none',
    );
    // The host is a target field; the database isn't (AC-312). Said in its
    // description, so its name stays "Host" (T497's review).
    const bound = field?.querySelector('.field__bound-said');
    expect(bound?.textContent).toBe(
      'A stored secret is bound to this: changing it asks for the secret again.',
    );
    expect(host.getAttribute('aria-describedby')).toContain(bound?.id ?? 'none');
    expect(screen.getByRole('textbox', { name: /^Host\s?· required$/ })).toBe(host);
    expect(
      screen
        .getByLabelText(/^Database/)
        .closest('.field')
        ?.querySelector('.field__bound'),
    ).toBeNull();
  });

  it('says why a stored secret is asked for again', () => {
    render(<Stored asked={{ password: 'The host changed, so it’s asked for again.' }} />);
    const input = screen.getByLabelText(/^Password/);
    const password = input.closest('.field');
    const said = within(password as HTMLElement).getByRole('status');
    expect(said.textContent).toBe('The host changed, so it’s asked for again.');
    // Read with the field, not only announced (T497's review).
    expect(input.getAttribute('aria-describedby')).toContain(said.id || 'none');
  });
});

/**
 * T506 (AC-353; R42.5): a stored BigQuery key, Snowflake OAuth token or
 * Dremio token is kept unless the user chooses to replace it. xcube takes
 * each one entered as a new target, even the same one, and rebuilds the data
 * source's pre-aggregations (research `xcube-bc18f82c01.md`, Gotcha 6;
 * `xcube-2d5ac86f24.md`, Gotcha 2), so replacing one says so first. A
 * password or a private key entered again changes nothing there, and says
 * nothing of it.
 */
describe('a stored key or token (T506, AC-353)', () => {
  function StoredSecret({
    driver,
    authMethod,
    shape,
    fields,
    secret,
    asked,
  }: {
    driver: DriverType;
    authMethod: string;
    shape?: string;
    fields: Record<string, string | number | boolean>;
    secret: string;
    asked?: Record<string, string>;
  }) {
    const [values, setValues] = useState<ConnectionValues>({
      authMethod,
      shape,
      fields,
      secrets: {},
    });
    return (
      <>
        <ConnectionForm
          driver={driver}
          values={values}
          onChange={setValues}
          stored={asked === undefined ? [secret] : []}
          was={fields}
          {...(asked === undefined ? {} : { asked })}
        />
        <output data-testid="secrets">{JSON.stringify(values.secrets)}</output>
      </>
    );
  }
  const rebuilds = (noun: string) =>
    `Replacing the ${noun} rebuilds this data source’s pre-aggregations, even when the new ${noun} is the same.`;
  const dremio = { host: 'dremio.internal', port: 9047, ssl: false };

  it('keeps a stored Dremio token, and says once Replace is chosen that replacing it rebuilds the pre-aggregations', async () => {
    render(
      <StoredSecret
        driver="dremio"
        authMethod="token"
        shape="software"
        fields={dremio}
        secret="token"
      />,
    );
    expect(screen.getByText('Stored · encrypted')).toBeTruthy();
    expect(screen.queryByText(rebuilds('token'))).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Replace the token' }));
    const token = screen.getByLabelText(/^Token/);
    const warning = screen.getByText(rebuilds('token'));
    expect(warning.classList.contains('field__warning')).toBe(true);
    // Read with the field, which Replace puts focus on.
    expect(document.activeElement).toBe(token);
    expect(token.getAttribute('aria-describedby')).toContain(warning.id || 'none');
    await userEvent.type(token, 'fixture-token');
    expect(screen.getByText(rebuilds('token'))).toBeTruthy();

    // Kept after all: nothing is replaced, and nothing to warn of.
    await userEvent.click(screen.getByRole('button', { name: 'Keep the stored one' }));
    expect(screen.queryByText(rebuilds('token'))).toBeNull();
    expect(screen.getByTestId('secrets').textContent).toBe('{"token":""}');
  });

  it('says it of a Snowflake OAuth token', async () => {
    render(
      <StoredSecret
        driver="snowflake"
        authMethod="oauth"
        fields={{ account: 'acme-eu', warehouse: 'reporting', database: 'sales' }}
        secret="oauthToken"
      />,
    );
    // Its name as its label says it: an initialism keeps its capitals.
    await userEvent.click(screen.getByRole('button', { name: 'Replace the OAuth token' }));
    expect(screen.getByText(rebuilds('token'))).toBeTruthy();
  });

  it('says it of a BigQuery key, and still once the new key is pasted', async () => {
    render(
      <StoredSecret
        driver="bigquery"
        authMethod="service-account"
        fields={{ projectId: 'acme-analytics' }}
        secret="credentials"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Replace the key (JSON)' }));
    expect(screen.getByText(rebuilds('key'))).toBeTruthy();
    const key = screen.getByLabelText(/^Key \(JSON\)/);
    fireEvent.paste(key);
    fireEvent.change(key, { target: { value: '{"type":"service_account"}' } });
    expect(screen.getByText('Pasted · 26 characters')).toBeTruthy();
    expect(screen.getByText(rebuilds('key'))).toBeTruthy();
  });

  it('says it of a token asked for again after its target changed', () => {
    render(
      <StoredSecret
        driver="dremio"
        authMethod="token"
        shape="software"
        fields={dremio}
        secret="token"
        asked={{ token: 'The host changed, so the token kept no longer applies.' }}
      />,
    );
    expect(screen.getByText(rebuilds('token'))).toBeTruthy();
  });

  it('says nothing of a rebuild for a password or a private key replaced', async () => {
    render(
      <StoredSecret
        driver="snowflake"
        authMethod="key-pair"
        fields={{ account: 'acme-eu', warehouse: 'reporting', database: 'sales', username: 'cube' }}
        secret="privateKey"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Replace the private key (PEM)' }));
    expect(screen.getByRole('button', { name: 'Keep the stored one' })).toBeTruthy();
    expect(screen.queryByText(/rebuilds this data source/)).toBeNull();
  });

  it('says nothing of a rebuild for a PostgreSQL password replaced', async () => {
    render(
      <StoredSecret
        driver="postgres"
        authMethod="password"
        fields={{ host: 'db-1', port: 5432, database: 'sales', user: 'cube', ssl: false }}
        secret="password"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Replace the password' }));
    expect(screen.getByRole('button', { name: 'Keep the stored one' })).toBeTruthy();
    expect(screen.queryByText(/rebuilds this data source/)).toBeNull();
  });
});
