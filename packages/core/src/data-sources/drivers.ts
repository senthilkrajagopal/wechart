/**
 * The six data-source driver types and their fields (T360, AC-160): the
 * connection fields and, per authentication method, the credential fields the
 * data-source form asks for. They cover what Cube 1.7.45's own drivers can use
 * (research/connection-testing.md §2), and nothing they can't: Cube is what
 * connects. The keys are the form's; mapping them onto each driver's own
 * config (`connectionString`, `server`, the `ssl` object) is the connection
 * test's and Cube's config's (T361, T339).
 *
 * No field names a file on the server: a path would let whoever edits a data
 * source make the connection test read a file and send it to a host of their
 * choosing (research: Summary finding 8). Keys, certificates and service-account
 * JSON are pasted as content, and sealed as secrets.
 */

export const DRIVER_TYPES = [
  'postgres',
  'snowflake',
  'databricks-jdbc',
  'bigquery',
  'mssql',
  'oracle',
] as const;

export type DriverType = (typeof DRIVER_TYPES)[number];

export interface DriverField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'number' | 'boolean' | 'multiline';
  readonly required: boolean;
  /** Sealed at rest and never shown again (AC-164, AC-298). */
  readonly secret?: true;
  /** Says where the source connects: changing it clears the stored secret (AC-312). */
  readonly target?: true;
  readonly placeholder?: string;
  readonly defaultValue?: string | number | boolean;
  /** Shown under the field. */
  readonly note?: string;
}

export interface AuthMethod {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly DriverField[];
  /** Why a method needs care, shown beside it. */
  readonly note?: string;
}

export interface DriverSpec {
  readonly type: DriverType;
  readonly label: string;
  readonly connection: readonly DriverField[];
  readonly auth: readonly AuthMethod[];
}

const text = (key: string, label: string, extra: Partial<DriverField> = {}): DriverField => ({
  key,
  label,
  kind: 'text',
  required: false,
  ...extra,
});
const secret = (key: string, label: string, extra: Partial<DriverField> = {}): DriverField =>
  text(key, label, { required: true, secret: true, ...extra });

export const DRIVERS: Readonly<Record<DriverType, DriverSpec>> = {
  postgres: {
    type: 'postgres',
    label: 'PostgreSQL',
    connection: [
      text('host', 'Host', { required: true, target: true }),
      text('port', 'Port', { kind: 'number', target: true, defaultValue: 5432 }),
      text('database', 'Database', { required: true }),
      // On by default, as the approved prototype's "Use SSL/TLS and verify
      // certificate" switch is (docs/design/prototype/admin-sources.js).
      text('ssl', 'Use TLS', { kind: 'boolean', defaultValue: true }),
      text('sslRejectUnauthorized', 'Verify the server’s certificate', {
        kind: 'boolean',
        defaultValue: true,
      }),
      text('sslCa', 'CA certificate (PEM)', { kind: 'multiline' }),
    ],
    auth: [
      {
        id: 'password',
        label: 'Password',
        fields: [text('user', 'User', { required: true }), secret('password', 'Password')],
      },
      {
        id: 'client-certificate',
        label: 'Client certificate',
        fields: [
          text('user', 'User', { required: true }),
          text('sslCert', 'Client certificate (PEM)', { kind: 'multiline', required: true }),
          secret('sslKey', 'Client key (PEM)', { kind: 'multiline' }),
          secret('sslPassphrase', 'Key passphrase', { required: false }),
        ],
      },
    ],
  },
  snowflake: {
    type: 'snowflake',
    label: 'Snowflake',
    connection: [
      text('account', 'Account', { required: true, target: true }),
      text('region', 'Region', { target: true }),
      text('warehouse', 'Warehouse', { required: true, target: true }),
      text('role', 'Role'),
      text('database', 'Database', { required: true }),
    ],
    auth: [
      {
        id: 'key-pair',
        label: 'Key pair',
        fields: [
          text('username', 'User', { required: true }),
          secret('privateKey', 'Private key (PEM)', { kind: 'multiline' }),
          secret('privateKeyPass', 'Key passphrase', { required: false }),
        ],
      },
      { id: 'oauth', label: 'OAuth token', fields: [secret('oauthToken', 'OAuth token')] },
      {
        id: 'password',
        label: 'Password',
        fields: [text('username', 'User', { required: true }), secret('password', 'Password')],
        note: 'Snowflake blocks passwords for non-human users from its 2026 rollout; prefer a key pair.',
      },
    ],
  },
  'databricks-jdbc': {
    type: 'databricks-jdbc',
    label: 'Databricks',
    connection: [
      text('url', 'JDBC URL', {
        required: true,
        target: true,
        placeholder: 'jdbc:databricks://<host>:443/default;httpPath=/sql/1.0/warehouses/<id>',
        // Cube reads a token from UID/PWD in the URL (T360's review); the URL
        // isn't sealed, so the token must go in its own field (T335 refuses
        // UID and PWD in it).
        note: 'A SQL warehouse’s URL. Put the token below, never as UID or PWD in the URL.',
      }),
      // No schema: Cube's driver takes it only from its own CUBEJS_DB_NAME
      // (research §2).
      text('catalog', 'Catalog'),
    ],
    auth: [
      { id: 'token', label: 'Personal access token', fields: [secret('token', 'Token')] },
      {
        id: 'oauth-m2m',
        label: 'OAuth service principal',
        fields: [
          text('oauthClientId', 'Client ID', { required: true }),
          secret('oauthClientSecret', 'Client secret'),
        ],
      },
    ],
  },
  bigquery: {
    type: 'bigquery',
    label: 'BigQuery',
    connection: [
      text('projectId', 'Project ID', { required: true, target: true }),
      text('location', 'Location'),
    ],
    auth: [
      {
        id: 'service-account',
        label: 'Service account key',
        fields: [secret('credentials', 'Service-account key (JSON)', { kind: 'multiline' })],
      },
    ],
  },
  mssql: {
    type: 'mssql',
    label: 'SQL Server',
    connection: [
      text('host', 'Server', { required: true, target: true }),
      text('port', 'Port', { kind: 'number', target: true, defaultValue: 1433 }),
      text('database', 'Database', { required: true }),
      // Cube's defaults: encryption follows CUBEJS_DB_SSL, off unless set
      // (research §2). Nothing in the spec or design chooses otherwise.
      text('encrypt', 'Encrypt the connection', { kind: 'boolean', defaultValue: false }),
      text('trustServerCertificate', 'Trust the server’s certificate', {
        kind: 'boolean',
        defaultValue: false,
      }),
    ],
    auth: [
      {
        id: 'sql-login',
        label: 'SQL login',
        fields: [text('user', 'User', { required: true }), secret('password', 'Password')],
      },
      {
        id: 'ntlm',
        label: 'Windows (NTLM)',
        fields: [
          text('domain', 'Domain', { required: true }),
          text('user', 'User', { required: true }),
          secret('password', 'Password'),
        ],
      },
      {
        id: 'entra-service-principal',
        label: 'Microsoft Entra ID service principal',
        fields: [
          text('tenantId', 'Tenant ID', { required: true }),
          text('clientId', 'Client ID', { required: true }),
          secret('clientSecret', 'Client secret'),
        ],
      },
    ],
  },
  oracle: {
    type: 'oracle',
    label: 'Oracle',
    connection: [
      text('connectString', 'Connect string', {
        target: true,
        placeholder: 'host:1521/service, or a tcps:// descriptor',
      }),
      text('host', 'Host', { target: true }),
      text('port', 'Port', { kind: 'number', target: true, defaultValue: 1521 }),
      text('database', 'Service name', { target: true }),
    ],
    auth: [
      {
        id: 'password',
        label: 'Password',
        fields: [text('user', 'User', { required: true }), secret('password', 'Password')],
      },
    ],
  },
};

/** The fields that say where a source connects (AC-312). */
export function targetKeysOf(type: DriverType): readonly string[] {
  return DRIVERS[type].connection.filter((field) => field.target).map((field) => field.key);
}
