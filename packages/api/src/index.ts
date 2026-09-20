/**
 * @wechart/api — the Fastify service: Cube proxy, metadata persistence, jobs
 * and connection tests. It is the only holder of Cube credentials (AC-007).
 */
export const PACKAGE_NAME = '@wechart/api';

export { buildServer, type BuildOptions } from './server';
export { loadConfig, ConfigError, type Config } from './config';
export { CubeClient, CubeError, type CubeClientOptions } from './cube/client';
export { closeDb, getDb, databaseUrl, DEFAULT_DB_URL } from './db/client';
export { migrateToLatest } from './db/migrate';
export {
  documents,
  DOCUMENT_KINDS,
  DocumentNotFoundError,
  StaleDocumentError,
  type DocumentKind,
  type StoredDocument,
} from './repos/documents';
