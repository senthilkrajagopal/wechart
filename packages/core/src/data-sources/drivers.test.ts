import { describe, expect, it } from 'vitest';

import { DRIVER_TYPES, DRIVERS, targetKeysOf, type DriverType } from './drivers';

/**
 * T360, T454 (AC-160): THE SYSTEM SHALL offer PostgreSQL, Amazon Redshift,
 * MySQL, Snowflake, BigQuery, SQL Server, Oracle and Dremio as driver types,
 * with each driver's own authentication fields. Fails when: a listed driver
 * is absent, Databricks is offered, or a driver's form omits an
 * authentication method listed or offers one xcube doesn't take.
 *
 * The fields are the ones xcube's drivers take, as Cube 1.7.45's own drivers
 * connect (`docs/inputs/2026-09-26-connections-drivers.md`, `[XD]`, the
 * user's list; research `xcube-slice-6.md`, and xcube's `drivers.ts` at
 * `ed08180c37`), because xcube is what connects.
 */
const authOf = (type: DriverType) =>
  Object.fromEntries(
    DRIVERS[type].auth.map((method) => [method.id, method.fields.map((f) => f.key)]),
  );
const connectionOf = (type: DriverType) => DRIVERS[type].connection.map((field) => field.key);

describe('the eight driver types (AC-160)', () => {
  it('offers exactly PostgreSQL, Redshift, MySQL, Snowflake, BigQuery, SQL Server, Oracle and Dremio', () => {
    expect(DRIVER_TYPES).toEqual([
      'postgres',
      'redshift',
      'mysql',
      'snowflake',
      'bigquery',
      'mssql',
      'oracle',
      'dremio',
    ]);
    expect(DRIVER_TYPES.map((type) => DRIVERS[type].label)).toEqual([
      'PostgreSQL',
      'Amazon Redshift',
      'MySQL',
      'Snowflake',
      'BigQuery',
      'SQL Server',
      'Oracle',
      'Dremio',
    ]);
    // Dropped by the user (`[XD]`): xcube serves no Databricks connection.
    expect(DRIVER_TYPES as readonly string[]).not.toContain('databricks-jdbc');
  });

  it('gives Amazon Redshift its connection and TLS fields, with password sign-in only', () => {
    // IAM authentication can't differ per connection in Cube 1.7.45 (`[XD]`).
    expect(connectionOf('redshift')).toEqual([
      'host',
      'port',
      'database',
      'ssl',
      'sslRejectUnauthorized',
      'sslCa',
    ]);
    expect(authOf('redshift')).toEqual({ password: ['user', 'password'] });
  });

  it('gives MySQL its connection and TLS fields, with password or client-certificate sign-in', () => {
    expect(connectionOf('mysql')).toEqual([
      'host',
      'port',
      'database',
      'ssl',
      'sslRejectUnauthorized',
      'sslCa',
    ]);
    expect(authOf('mysql')).toEqual({
      password: ['user', 'password'],
      'client-certificate': ['user', 'sslCert', 'sslKey', 'sslPassphrase'],
    });
  });

  it('gives Dremio a Cloud URL or a Software host and port, with a token or a user and password', () => {
    expect(connectionOf('dremio')).toEqual(['url', 'host', 'port', 'ssl', 'database']);
    expect(authOf('dremio')).toEqual({ token: ['token'], password: ['user', 'password'] });
  });

  it('gives PostgreSQL its connection and TLS fields, with password or client-certificate sign-in', () => {
    expect(connectionOf('postgres')).toEqual([
      'host',
      'port',
      'database',
      'ssl',
      'sslRejectUnauthorized',
      'sslCa',
    ]);
    expect(authOf('postgres')).toEqual({
      password: ['user', 'password'],
      'client-certificate': ['user', 'sslCert', 'sslKey', 'sslPassphrase'],
    });
  });

  it('gives Snowflake key pair, OAuth token and password sign-in', () => {
    expect(connectionOf('snowflake')).toEqual([
      'account',
      'region',
      'warehouse',
      'role',
      'database',
    ]);
    expect(authOf('snowflake')).toEqual({
      'key-pair': ['username', 'privateKey', 'privateKeyPass'],
      oauth: ['oauthToken'],
      password: ['username', 'password'],
    });
  });

  it('gives BigQuery a service-account JSON key', () => {
    expect(connectionOf('bigquery')).toEqual(['projectId', 'location']);
    expect(authOf('bigquery')).toEqual({ 'service-account': ['credentials'] });
  });

  it('gives SQL Server SQL login, NTLM and an Entra ID service principal', () => {
    expect(connectionOf('mssql')).toEqual([
      'host',
      'port',
      'database',
      'encrypt',
      'trustServerCertificate',
    ]);
    expect(authOf('mssql')).toEqual({
      'sql-login': ['user', 'password'],
      ntlm: ['domain', 'user', 'password'],
      'entra-service-principal': ['tenantId', 'clientId', 'clientSecret'],
    });
  });

  it('gives Oracle a connect string or host, port and service, with password sign-in', () => {
    expect(connectionOf('oracle')).toEqual(['connectString', 'host', 'port', 'database']);
    expect(authOf('oracle')).toEqual({ password: ['user', 'password'] });
  });
});

describe('what the fields say about themselves', () => {
  it('marks every credential secret, so it is stored sealed and never shown again (AC-164)', () => {
    const secrets = DRIVER_TYPES.flatMap((type) =>
      DRIVERS[type].auth.flatMap((method) =>
        method.fields.filter((f) => f.secret).map((f) => `${type}.${f.key}`),
      ),
    );
    expect(secrets.sort()).toEqual(
      [
        'bigquery.credentials',
        'dremio.password',
        'dremio.token',
        'mysql.password',
        'mysql.sslKey',
        'mysql.sslPassphrase',
        'redshift.password',
        'mssql.clientSecret',
        'mssql.password',
        'mssql.password',
        'oracle.password',
        'postgres.password',
        'postgres.sslKey',
        'postgres.sslPassphrase',
        'snowflake.oauthToken',
        'snowflake.password',
        'snowflake.privateKey',
        'snowflake.privateKeyPass',
      ].sort(),
    );
  });

  it('has no field that names a file on the server (research: path fields read and send out files)', () => {
    for (const type of DRIVER_TYPES) {
      const keys = [
        ...DRIVERS[type].connection.map((f) => f.key),
        ...DRIVERS[type].auth.flatMap((m) => m.fields.map((f) => f.key)),
      ];
      // The keys Cube's drivers read files from: oauthTokenPath, privateKeyPath,
      // keyFilename, walletLocation, configDir (research Gotchas). BigQuery's
      // `location` is a region, not a file.
      for (const key of keys) {
        expect(key, `${type}.${key}`).not.toMatch(/path|filename|wallet|configdir/i);
      }
    }
  });

  it('names the fields that say where a source connects, whose change clears its secret (AC-312)', () => {
    // AC-312, amended 2026-09-26 (`[X6]`): exactly xcube's v1 target per
    // driver, TLS settings included, since a sealed secret is bound to them
    // and opens for no other (research `xcube-overlay-data-sources.md`, "The
    // TLS binding"; xcube's `drivers.ts` at `ed08180c37`). In sorted order,
    // as the binding sorts them.
    const target = (type: DriverType) => [...targetKeysOf(type)].sort();
    const tls = ['ssl', 'sslCa', 'sslRejectUnauthorized'];
    expect(target('postgres')).toEqual(['host', 'port', ...tls]);
    expect(target('redshift')).toEqual(['host', 'port', ...tls]);
    expect(target('mysql')).toEqual(['host', 'port', ...tls]);
    expect(target('snowflake')).toEqual(['account', 'region', 'warehouse']);
    expect(target('bigquery')).toEqual(['projectId']);
    expect(target('mssql')).toEqual(['encrypt', 'host', 'port', 'trustServerCertificate']);
    expect(target('oracle')).toEqual(['connectString', 'database', 'host', 'port']);
    expect(target('dremio')).toEqual(['host', 'port', 'ssl', 'url']);
    // A database name or a user is not where it connects: it keeps the secret.
    expect(targetKeysOf('postgres')).not.toContain('database');
  });

  it('requires every credential a method signs in with, so Cube never falls back to its own', () => {
    // An empty Snowflake OAuth token makes Cube read a token file from its own
    // disk and send it (research finding 8; T360's review).
    const optional = DRIVER_TYPES.flatMap((type) =>
      DRIVERS[type].auth.flatMap((method) =>
        method.fields.filter((f) => f.secret && !f.required).map((f) => `${type}.${f.key}`),
      ),
    );
    // Only passphrases, which an unencrypted key doesn't have.
    expect(optional.sort()).toEqual([
      'mysql.sslPassphrase',
      'postgres.sslPassphrase',
      'snowflake.privateKeyPass',
    ]);
    for (const type of DRIVER_TYPES) {
      for (const method of DRIVERS[type].auth) {
        const principal = method.fields.find((f) =>
          /user|username|clientid|oauthclientid/i.test(f.key),
        );
        if (principal !== undefined)
          expect(principal.required, `${type}.${principal.key}`).toBe(true);
      }
    }
  });

  it('requires exactly the connection fields xcube requires, each of the kind it takes (T454’s review)', () => {
    // xcube refuses an empty required field (`connections.ts`), and reads each
    // by its kind; a field wechart left optional would be refused at landing.
    const required = (type: DriverType) =>
      DRIVERS[type].connection.filter((field) => field.required).map((field) => field.key);
    expect(Object.fromEntries(DRIVER_TYPES.map((type) => [type, required(type)]))).toEqual({
      postgres: ['host', 'database'],
      redshift: ['host', 'database'],
      mysql: ['host', 'database'],
      snowflake: ['account', 'warehouse', 'database'],
      bigquery: ['projectId'],
      mssql: ['host', 'database'],
      oracle: [],
      dremio: [],
    });
    const kinds = (type: DriverType) =>
      Object.fromEntries(DRIVERS[type].connection.map((field) => [field.key, field.kind]));
    expect(kinds('postgres')).toEqual({
      host: 'text',
      port: 'number',
      database: 'text',
      ssl: 'boolean',
      sslRejectUnauthorized: 'boolean',
      sslCa: 'multiline',
    });
    expect(kinds('mssql')).toEqual({
      host: 'text',
      port: 'number',
      database: 'text',
      encrypt: 'boolean',
      trustServerCertificate: 'boolean',
    });
    expect(kinds('dremio')).toEqual({
      url: 'text',
      host: 'text',
      port: 'number',
      ssl: 'boolean',
      database: 'text',
    });
  });

  it('says a MySQL client certificate is sent only over TLS, which is off by default', () => {
    // xcube sends the certificate only when TLS is on, and no password with
    // it (xcube's `drivers.ts`): with TLS off it would sign in with neither.
    const method = DRIVERS.mysql.auth.find((each) => each.id === 'client-certificate');
    expect(method?.note).toBe('Sent only over TLS: turn on Use TLS.');
  });

  it('turns TLS on and verifies the certificate by default for PostgreSQL, as the approved prototype does', () => {
    const field = (key: string) => DRIVERS.postgres.connection.find((f) => f.key === key);
    expect(field('ssl')?.defaultValue).toBe(true);
    expect(field('sslRejectUnauthorized')?.defaultValue).toBe(true);
  });

  it('starts the new drivers from xcube’s own defaults: their TLS and their ports', () => {
    // xcube's configs: Redshift's TLS on, MySQL's and Dremio's off; ports
    // 5439, 3306 and 9047 (`[XD]`; xcube's `drivers.ts`).
    const field = (type: DriverType, key: string) =>
      DRIVERS[type].connection.find((f) => f.key === key)?.defaultValue;
    expect([field('redshift', 'ssl'), field('mysql', 'ssl'), field('dremio', 'ssl')]).toEqual([
      true,
      false,
      false,
    ]);
    expect([
      field('redshift', 'sslRejectUnauthorized'),
      field('mysql', 'sslRejectUnauthorized'),
    ]).toEqual([true, true]);
    expect([field('redshift', 'port'), field('mysql', 'port'), field('dremio', 'port')]).toEqual([
      5439, 3306, 9047,
    ]);
  });
});
