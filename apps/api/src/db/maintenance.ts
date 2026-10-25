import { createPool } from './pool.js';

export function maintenancePool() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is required for maintenance.');
  const allowInsecureRemote = process.env.DATABASE_ALLOW_INSECURE_REMOTE === 'true';
  if (allowInsecureRemote && (process.env.NODE_ENV ?? 'development') !== 'development') {
    throw new Error('DATABASE_ALLOW_INSECURE_REMOTE is available only in development.');
  }
  return createPool({
    url,
    tls: process.env.DATABASE_TLS !== 'false',
    privateNetwork: process.env.DATABASE_PRIVATE_NETWORK === 'true',
    allowInsecureRemote,
    ...(process.env.DATABASE_CA_FILE ? { caFile: process.env.DATABASE_CA_FILE } : {}),
  });
}
