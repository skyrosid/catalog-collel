import { createPool } from './pool.js';

export function maintenancePool() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('MIGRATION_DATABASE_URL is required for maintenance.');
  return createPool({
    url,
    tls: process.env.DATABASE_TLS !== 'false',
    privateNetwork: process.env.DATABASE_PRIVATE_NETWORK === 'true',
    ...(process.env.DATABASE_CA_FILE ? { caFile: process.env.DATABASE_CA_FILE } : {}),
  });
}
