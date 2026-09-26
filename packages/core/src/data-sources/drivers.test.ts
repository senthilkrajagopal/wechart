import { describe, expect, it } from 'vitest';

import { DRIVER_TYPES, DRIVERS, targetKeysOf, type DriverType } from './drivers';

/**
 * T360 (AC-160): THE SYSTEM SHALL offer PostgreSQL, Snowflake, Databricks,
 * BigQuery, SQL Server and Oracle as driver types, with each driver's own
 * authentication fields. Fails when: a listed driver is absent, or its form
 * omits an authentication method the driver requires.
 *
 * The fields are the ones Cube 1.7.45's own drivers take
 * (research/connection-testing.md §2), because Cube is what connects.
 */
const authOf = (type: DriverType) =>
  Object.fromEntries(
    DRIVERS[type].auth.map((method) => [method.id, method.fields.map((f) => f.key)]),
  );
const connectionOf = (type: DriverType) => DRIVERS[type].connection.map((field) => field.key);

describe('the six driver types (AC-160)', () => {
  it('offers exactly PostgreSQL, Snowflake, Databricks, BigQuery, SQL Server and Oracle', () => {
    expect(DRIVER_TYPES).toEqual([
      'postgres',
      'snowflake',
      'databricks-jdbc',
      'bigquery',
      'mssql',
      'oracle',
    ]);
    expect(DRIVER_TYPES.map((type) => DRIVERS[type].label)).toEqual([
      'PostgreSQL',
      'Snowflake',
      'Databricks',
      'BigQuery',
      'SQL Server',
      'Oracle',
    ]);
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

  it('gives Databricks a personal access token or an OAuth machine-to-machine service principal', () => {
    // No schema field: Cube's driver takes it only from its own CUBEJS_DB_NAME,
    // overwriting any given (research §2; T360's review).
    expect(connectionOf('databricks-jdbc')).toEqual(['url', 'catalog']);
    expect(authOf('databricks-jdbc')).toEqual({
      token: ['token'],
      'oauth-m2m': ['oauthClientId', 'oauthClientSecret'],
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
        'databricks-jdbc.oauthClientSecret',
        'databricks-jdbc.token',
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
    // AC-312: host, port, account, workspace, warehouse, project or connect
    // string. Snowflake's region is part of its account host, Databricks' URL
    // names its workspace, and Oracle's host, port and service make up its
    // connect string.
    expect(targetKeysOf('postgres')).toEqual(['host', 'port']);
    expect(targetKeysOf('snowflake')).toEqual(['account', 'region', 'warehouse']);
    expect(targetKeysOf('databricks-jdbc')).toEqual(['url']);
    expect(targetKeysOf('bigquery')).toEqual(['projectId']);
    expect(targetKeysOf('mssql')).toEqual(['host', 'port']);
    expect(targetKeysOf('oracle')).toEqual(['connectString', 'host', 'port', 'database']);
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
    expect(optional.sort()).toEqual(['postgres.sslPassphrase', 'snowflake.privateKeyPass']);
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

  it('turns TLS on and verifies the certificate by default for PostgreSQL, as the approved prototype does', () => {
    const field = (key: string) => DRIVERS.postgres.connection.find((f) => f.key === key);
    expect(field('ssl')?.defaultValue).toBe(true);
    expect(field('sslRejectUnauthorized')?.defaultValue).toBe(true);
  });
});
