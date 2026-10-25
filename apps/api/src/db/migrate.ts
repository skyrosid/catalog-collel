import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { maintenancePool } from './maintenance.js';

export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('catalog-migrations'))");
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('REVOKE ALL ON public.schema_migrations FROM PUBLIC');
    const folder = new URL('../../migrations/', import.meta.url);
    for (const name of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
      const source = await readFile(new URL(name, folder), 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex');
      const applied = await client.query<{ checksum: string }>(
        'SELECT checksum FROM public.schema_migrations WHERE name = $1',
        [name],
      );
      if (applied.rows[0]) {
        if (applied.rows[0].checksum !== checksum) throw new Error(`Migration modified: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(source);
        await client.query(
          'INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)',
          [name, checksum],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('catalog-migrations'))");
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = maintenancePool();
  try {
    await migrate(pool);
    console.info('Migrations applied.');
  } catch {
    console.error('Migration failed. Check the maintenance connection and database provisioning.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
