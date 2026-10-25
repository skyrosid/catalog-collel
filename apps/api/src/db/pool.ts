import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { PoolClient } from 'pg';

export interface DatabaseOptions {
  url: string;
  tls: boolean;
  privateNetwork?: boolean;
  allowInsecureRemote?: boolean;
  caFile?: string;
}

export function createPool(options: DatabaseOptions) {
  const url = new URL(options.url);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('A PostgreSQL URL is required.');
  }
  // pg otherwise lets URL SSL parameters override certificate verification.
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase().startsWith('ssl')) {
      throw new Error('Configure TLS using DATABASE_TLS and DATABASE_CA_FILE, not URL parameters.');
    }
  }
  if (
    !options.tls &&
    !options.privateNetwork &&
    !options.allowInsecureRemote &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error('Remote PostgreSQL connections require verified TLS.');
  }
  return new pg.Pool({
    connectionString: options.url,
    ssl: options.tls
      ? {
          rejectUnauthorized: true,
          ...(options.caFile ? { ca: readFileSync(options.caFile, 'utf8') } : {}),
        }
      : false,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 10_000,
    application_name: 'catalog-api',
  });
}

export async function verifyRuntimeRole(pool: pg.Pool) {
  const result = await pool.query<{ safe: boolean }>(`
    SELECT current_user = 'catalog_app'
      AND NOT r.rolsuper AND NOT r.rolbypassrls
      AND NOT r.rolcreaterole AND NOT r.rolcreatedb
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname IN ('app', 'private') AND c.relowner = r.oid
      ) AS safe
    FROM pg_roles r WHERE r.rolname = current_user
  `);
  if (result.rows[0]?.safe !== true) {
    throw new Error(
      'API requires the unprivileged catalog_app role without role memberships or table ownership.',
    );
  }
}

export async function inTenant<T>(
  pool: pg.Pool,
  sessionHash: string,
  collelId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    // SET LOCAL is transaction-scoped; a pooled connection cannot retain a tenant.
    await client.query(
      "SELECT set_config('app.session_hash', $1, true), set_config('app.collel_id', $2, true)",
      [sessionHash, collelId],
    );
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
