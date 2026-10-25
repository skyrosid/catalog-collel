import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password.js';
import { createServices, tokenHash } from '../src/auth/service.js';
import type { Services } from '../src/auth/service.js';
import { verifyRuntimeRole } from '../src/db/pool.js';

const db = new PGlite();
const ids = {
  a: '00000000-0000-4000-8000-000000000001',
  b: '00000000-0000-4000-8000-000000000002',
  adminA: '00000000-0000-4000-8000-000000000003',
  adminB: '00000000-0000-4000-8000-000000000004',
  reader: '00000000-0000-4000-8000-000000000005',
};
const password = 'test-password-only-123';
// Test-only adapter: production uses node-postgres over TLS. PGlite executes the
// same SQL and role policies, without requiring access to an online database.
const client = {
  query: (sql: string, parameters?: unknown[]) => db.query(sql, parameters),
  release: () => {},
};
const pool = { ...client, connect: async () => client } as unknown as pg.Pool;
let services: Services;

beforeAll(async () => {
  await db.exec(
    await readFile(new URL('../../../infra/postgres/provision.sql', import.meta.url), 'utf8'),
  );
  await db.exec(
    await readFile(new URL('../migrations/001_foundation.sql', import.meta.url), 'utf8'),
  );
  const encoded = await hashPassword(password);
  await db.exec('BEGIN');
  await db.query('INSERT INTO app.collels (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)', [
    ids.a,
    'Hevron',
    'hevron',
    ids.b,
    'Other',
    'other',
  ]);
  await db.query(
    'INSERT INTO private.users (id, login, display_name, password_hash) VALUES ($1, $2, $2, $3), ($4, $5, $5, $3), ($6, $7, $7, $3)',
    [ids.adminA, 'admin-a', encoded, ids.adminB, 'admin-b', ids.reader, 'reader'],
  );
  await db.query(
    "INSERT INTO private.memberships VALUES ($1, $2, 'admin'), ($3, $4, 'admin'), ($5, $2, 'user')",
    [ids.adminA, ids.a, ids.adminB, ids.b, ids.reader],
  );
  await db.exec('COMMIT');
  await db.exec(
    await readFile(
      new URL('../migrations/002_platform_administration.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec('SET ROLE catalog_app');
  services = await createServices(pool, 8);
});
afterAll(async () => {
  await db.close();
});

async function scopedRows(hash: string, collelId: string) {
  await db.exec('BEGIN');
  try {
    await db.query(
      "SELECT set_config('app.session_hash', $1, true), set_config('app.collel_id', $2, true)",
      [hash, collelId],
    );
    return (await db.query<{ id: string }>('SELECT id FROM app.collels')).rows;
  } finally {
    await db.exec('ROLLBACK');
  }
}

describe('PostgreSQL tenant isolation', () => {
  it('accepts only the dedicated unprivileged runtime role', async () => {
    await expect(verifyRuntimeRole(pool)).resolves.toBeUndefined();
    await db.exec('RESET ROLE');
    try {
      await expect(verifyRuntimeRole(pool)).rejects.toThrow('unprivileged');
    } finally {
      await db.exec('SET ROLE catalog_app');
    }
  });
  it('authenticates, scopes access, and rejects another tenant at both layers', async () => {
    await expect(services.login({ login: 'admin-a', password: 'wrong' })).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    const { token, session } = await services.login({ login: 'admin-a', password });
    expect(session.memberships.map((m) => m.collelId)).toEqual([ids.a]);
    const principal = await services.authenticate(token);
    expect((await services.getCollel(principal, ids.a)).name).toBe('Hevron');
    await expect(services.getCollel(principal, ids.b)).rejects.toThrow('FORBIDDEN');
    expect(await scopedRows(tokenHash(token), ids.a)).toEqual([{ id: ids.a }]);
    expect(await scopedRows(tokenHash(token), ids.b)).toEqual([]);
    expect(await scopedRows('0'.repeat(64), ids.a)).toEqual([]);
  });
  it('defaults to no rows, clears pooled context, and denies private tables and mutations', async () => {
    expect((await db.query('SELECT * FROM app.collels')).rows).toEqual([]);
    for (const table of ['users', 'sessions', 'memberships']) {
      await expect(db.query(`SELECT * FROM private.${table}`)).rejects.toThrow(/permission denied/);
    }
    await expect(db.query("UPDATE app.collels SET name = 'intrusion'")).rejects.toThrow(
      /permission denied/,
    );
  });
  it('revokes sessions and enforces database expiry', async () => {
    const loggedIn = await services.login({ login: 'reader', password });
    const principal = await services.authenticate(loggedIn.token);
    await services.logout(principal);
    await expect(services.authenticate(loggedIn.token)).rejects.toThrow('UNAUTHENTICATED');
    expect(await scopedRows(principal.sessionHash, ids.a)).toEqual([]);
    const expiring = await services.login({ login: 'reader', password });
    await db.exec('RESET ROLE');
    await db.query(
      "UPDATE private.sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [tokenHash(expiring.token)],
    );
    await db.exec('SET ROLE catalog_app');
    await expect(services.authenticate(expiring.token)).rejects.toThrow('UNAUTHENTICATED');
  });
  it('rechecks memberships even when an earlier principal is still in memory', async () => {
    const loggedIn = await services.login({ login: 'reader', password });
    const principal = await services.authenticate(loggedIn.token);
    await db.exec('RESET ROLE');
    await db.exec('BEGIN');
    await db.query("INSERT INTO private.memberships VALUES ($1, $2, 'user')", [ids.reader, ids.b]);
    await db.query('DELETE FROM private.memberships WHERE user_id = $1 AND collel_id = $2', [
      ids.reader,
      ids.a,
    ]);
    await db.exec('COMMIT; SET ROLE catalog_app');
    await expect(services.getCollel(principal, ids.a)).rejects.toThrow('FORBIDDEN');
    expect(
      (await services.authenticate(loggedIn.token)).session.memberships.map((m) => m.collelId),
    ).toEqual([ids.b]);
  });
  it('prevents removing, demoting, or deactivating the last administrator', async () => {
    await db.exec('RESET ROLE');
    try {
      const statements = [
        'DELETE FROM private.memberships WHERE user_id = $1',
        "UPDATE private.memberships SET role = 'user' WHERE user_id = $1",
        'UPDATE private.users SET active = false WHERE id = $1',
      ];
      for (const statement of statements) {
        await db.exec('BEGIN');
        await db.query(statement, [ids.adminA]);
        await expect(db.exec('COMMIT')).rejects.toThrow('active administrator');
        await db.exec('ROLLBACK');
      }
    } finally {
      await db.exec('SET ROLE catalog_app');
    }
  });
  it('rejects a collel without an administrator and a user without membership', async () => {
    await db.exec('RESET ROLE');
    try {
      await expect(
        db.query(
          "INSERT INTO app.collels (name, slug, primary_admin_id) VALUES ('Orphan', 'orphan', $1)",
          [ids.adminA],
        ),
      ).rejects.toThrow('active administrator');
      await expect(
        db.exec(
          "INSERT INTO private.users (login, display_name, password_hash) VALUES ('orphan', 'Orphan', 'hash')",
        ),
      ).rejects.toThrow('collel membership');
    } finally {
      await db.exec('SET ROLE catalog_app');
    }
  });
});
