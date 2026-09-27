/**
 * The eight data-source driver types and their fields (T360, T454, AC-160):
 * the connection fields and, per authentication method, the credential fields
 * the data-source form asks for. They are exactly what xcube's drivers take
 * (xcube's `drivers.ts` at `ed08180c37`; research `xcube-slice-6.md`), which
 * connect with Cube 1.7.45's own (research/connection-testing.md §2): xcube is
 * what connects. The keys are the form's, and xcube's; mapping them onto each
 * driver's own config (`connectionString`, `server`, the `ssl` object) is
 * xcube's.
 *
 * The user's list (`docs/inputs/2026-09-26-connections-drivers.md`): Amazon
 * Redshift, MySQL and Dremio added, Databricks dropped. No Databricks data
 * source was ever stored, so none is migrated.
 *
 * No field names a file on the server: a path would let whoever edits a data
 * source make the connection test read a file and send it to a host of their
 * choosing (research: Summary finding 8). Keys, certificates and service-account
 * JSON are pasted as content, and sealed as secrets.
 */

export const DRIVER_TYPES = [
  'postgres',
  'redshift',
  'mysql',
  'snowflake',
  'bigquery',
  'mssql',
  'oracle',
  'dremio',
] as const;

export type DriverType = (typeof DRIVER_TYPES)[number];

export interface DriverField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'number' | 'boolean' | 'multiline';
  readonly required: boolean;
  /** Sealed at rest and never shown again (AC-164, AC-298). */
  readonly secret?: true;
  /**
   * Part of the connection's target, which a sealed secret is bound to (xcube's
   * v1 `target`, TLS settings included): changing it clears the stored secret
   * (AC-312).
   */
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

/**
 * The PostgreSQL family's connection: where it connects, and how it checks the
 * server, all of it the target a secret is sealed to (xcube's `TLS_TARGET`):
 * turning verification off needs the secret entered again, as a new host does.
 */
const hostAndTls = (port: number, tlsByDefault: boolean): DriverField[] => [
  text('host', 'Host', { required: true, target: true }),
  text('port', 'Port', { kind: 'number', target: true, defaultValue: port }),
  text('database', 'Database', { required: true }),
  text('ssl', 'Use TLS', { kind: 'boolean', target: true, defaultValue: tlsByDefault }),
  text('sslRejectUnauthorized', 'Verify the server’s certificate', {
    kind: 'boolean',
    target: true,
    defaultValue: true,
  }),
  text('sslCa', 'CA certificate (PEM)', { kind: 'multiline', target: true }),
];

const password: AuthMethod = {
  id: 'password',
  label: 'Password',
  fields: [text('user', 'User', { required: true }), secret('password', 'Password')],
};
const clientCertificate: AuthMethod = {
  id: 'client-certificate',
  label: 'Client certificate',
  fields: [
    text('user', 'User', { required: true }),
    text('sslCert', 'Client certificate (PEM)', { kind: 'multiline', required: true }),
    secret('sslKey', 'Client key (PEM)', { kind: 'multiline' }),
    secret('sslPassphrase', 'Key passphrase', { required: false }),
  ],
};

export const DRIVERS: Readonly<Record<DriverType, DriverSpec>> = {
  postgres: {
    type: 'postgres',
    label: 'PostgreSQL',
    // TLS on by default, as the approved prototype's "Use SSL/TLS and verify
    // certificate" switch is (docs/design/prototype/admin-sources.js), and as
    // xcube's config is.
    connection: hostAndTls(5432, true),
    auth: [password, clientCertificate],
  },
  redshift: {
    type: 'redshift',
    label: 'Amazon Redshift',
    connection: hostAndTls(5439, true),
    // Cube 1.7.45's Redshift driver reads IAM authentication from its own
    // environment only, so it can't differ per connection (`[XD]`).
    auth: [password],
  },
  mysql: {
    type: 'mysql',
    label: 'MySQL',
    // TLS off by default, as xcube's config and MySQL's own are.
    connection: hostAndTls(3306, false),
    // xcube sends a client certificate only over TLS, and no password with it
    // (xcube's `drivers.ts`): with TLS off it would sign in with neither.
    auth: [password, { ...clientCertificate, note: 'Sent only over TLS: turn on Use TLS.' }],
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
      // (research §2). Nothing in the spec or design chooses otherwise. Both
      // are the target a secret is sealed to, as the host is (xcube's v1).
      text('encrypt', 'Encrypt the connection', {
        kind: 'boolean',
        target: true,
        defaultValue: false,
      }),
      text('trustServerCertificate', 'Trust the server’s certificate', {
        kind: 'boolean',
        target: true,
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
    auth: [password],
  },
  dremio: {
    type: 'dremio',
    label: 'Dremio',
    // Dremio Cloud is a project's API URL with a token; Dremio Software a host
    // and port, with a token or a user and password. Neither field is required
    // alone, but xcube refuses a connection with neither, and a URL with a
    // password (`[XD]`; xcube's `drivers.ts`).
    connection: [
      text('url', 'Dremio Cloud project URL', {
        target: true,
        placeholder: 'https://api.dremio.cloud/v0/projects/<id>',
      }),
      text('host', 'Host (Dremio Software)', { target: true }),
      text('port', 'Port', { kind: 'number', target: true, defaultValue: 9047 }),
      // Plain HTTP by default, as Cube's Dremio driver is; it has no
      // certificate setting, and Cloud's TLS is its URL's scheme.
      text('ssl', 'Use HTTPS (Dremio Software)', {
        kind: 'boolean',
        target: true,
        defaultValue: false,
      }),
      text('database', 'Database'),
    ],
    auth: [
      { id: 'token', label: 'Personal access token', fields: [secret('token', 'Token')] },
      { ...password, note: 'Dremio Software only: Dremio Cloud takes a token.' },
    ],
  },
};

/** The fields that say where a source connects (AC-312). */
export function targetKeysOf(type: DriverType): readonly string[] {
  return DRIVERS[type].connection.filter((field) => field.target).map((field) => field.key);
}
