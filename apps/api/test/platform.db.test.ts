import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreatedCollel } from '@catalog/contracts';
import { createServices, requireMembership } from '../src/auth/service.js';
import type { Principal, Services } from '../src/auth/service.js';
import { buildApp } from '../src/app.js';

const db = new PGlite();
const client = {
  query: (sql: string, parameters?: unknown[]) => db.query(sql, parameters),
  release: () => {},
};
const pool = { ...client, connect: async () => client } as unknown as pg.Pool;
let services: Services;
let platform: Principal;
let created: CreatedCollel;
let other: CreatedCollel;
let activation: string;
let catalogPrincipal: Principal;
let administrator: Principal;
const password = 'strong-initial-password-123';
const newPassword = 'new-personal-password-123';

beforeAll(async () => {
  await db.exec(
    await readFile(new URL('../../../infra/postgres/provision.sql', import.meta.url), 'utf8'),
  );
  for (const file of ['001_foundation.sql', '002_platform_administration.sql']) {
    await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.exec('SET ROLE catalog_app');
  services = await createServices(pool, 8);
});
afterAll(async () => {
  await db.close();
});

describe('platform onboarding and the two collel identities', () => {
  it('allows only one initial setup, even when requests overlap', async () => {
    expect(await services.setupStatus()).toEqual({ required: true });
    const attempts = await Promise.allSettled([
      services.setup({ login: 'platform', password }),
      services.setup({ login: 'other-platform', password }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    const winner = attempts.find((attempt) => attempt.status === 'fulfilled');
    if (!winner || winner.status !== 'fulfilled') throw new Error('Setup failed');
    platform = await services.authenticate(winner.value.token);
    expect(platform.session.user.platformRole).toBe('super_admin');
    expect(platform.session.memberships).toEqual([]);
    expect(await services.setupStatus()).toEqual({ required: false });
    await expect(services.setup({ login: 'third-platform', password })).rejects.toThrow(
      'SETUP_COMPLETE',
    );
  });
  it('creates both credentials atomically and supports search and pagination', async () => {
    created = await services.createCollel(platform, { name: 'כולל ראשון', slug: 'first' });
    other = await services.createCollel(platform, { name: 'כולל שני', slug: 'second' });
    expect(created.credentials.admin.login).toBe('admin-first');
    expect(created.credentials.catalog.login).toBe('catalog-first');
    expect(created.credentials.admin.password).not.toBe(created.credentials.catalog.password);
    expect((await services.listCollels(platform, { search: '', page: 0 })).total).toBe(2);
    expect(
      (await services.listCollels(platform, { search: 'ראשון', page: 0 })).items.map((c) => c.id),
    ).toEqual([created.collel.id]);
    expect((await services.listCollels(platform, { search: '', page: 1 })).items).toEqual([]);
    await expect(
      services.createCollel(platform, { name: 'Duplicate', slug: 'first' }),
    ).rejects.toThrow('CONFLICT');
    expect((await services.listCollels(platform, { search: '', page: 0 })).total).toBe(2);
  });
  it('blocks tenant access until the temporary administrator password is changed', async () => {
    const loggedIn = await services.login(created.credentials.admin, false, 'admin');
    administrator = await services.authenticate(loggedIn.token);
    expect(administrator.session.user.mustChangePassword).toBe(true);
    await expect(services.getCollel(administrator, created.collel.id)).rejects.toThrow(
      'PASSWORD_CHANGE_REQUIRED',
    );
    const session = await services.changePassword(administrator, {
      currentPassword: created.credentials.admin.password,
      newPassword,
    });
    expect(session.user.mustChangePassword).toBe(false);
    administrator = await services.authenticate(loggedIn.token);
    expect((await services.getCollel(administrator, created.collel.id)).id).toBe(created.collel.id);
    await expect(services.getCollel(administrator, other.collel.id)).rejects.toThrow('FORBIDDEN');
  });
  it('keeps a library activation separate from both administration roles', async () => {
    await expect(
      services.activate({ login: created.credentials.admin.login, password: newPassword }),
    ).rejects.toThrow('UNAUTHENTICATED');
    await expect(services.login(created.credentials.catalog, false, 'admin')).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    const activated = await services.activate(created.credentials.catalog);
    activation = activated.activationToken;
    catalogPrincipal = await services.authenticate(activated.token);
    expect(requireMembership(catalogPrincipal, created.collel.id).role).toBe('user');
    expect(() => requireMembership(catalogPrincipal, created.collel.id, 'admin')).toThrow(
      'FORBIDDEN',
    );
    await expect(services.listCollels(catalogPrincipal, { search: '', page: 0 })).rejects.toThrow(
      'FORBIDDEN',
    );
    await expect(services.listCollels(administrator, { search: '', page: 0 })).rejects.toThrow(
      'FORBIDDEN',
    );
    expect((await services.resume(activation)).session.memberships[0]?.collelId).toBe(
      created.collel.id,
    );
    await expect(services.getCollel(platform, created.collel.id)).rejects.toThrow('FORBIDDEN');
    await expect(
      services.listCollels(
        { ...platform, sessionHash: catalogPrincipal.sessionHash },
        { search: '', page: 0 },
      ),
    ).rejects.toThrow('FORBIDDEN');
  });
  it('can reset the administrator without disconnecting library PCs', async () => {
    const reset = await services.resetCollelAdmin(platform, created.collel.id);
    await expect(services.getCollel(administrator, created.collel.id)).rejects.toThrow('FORBIDDEN');
    expect((await services.login(reset, false, 'admin')).session.user.mustChangePassword).toBe(
      true,
    );
    expect((await services.resume(activation)).session.memberships[0]?.collelId).toBe(
      created.collel.id,
    );
  });
  it('revokes all activations when catalogue access is reset', async () => {
    const reset = await services.resetCollelAccess(platform, created.collel.id);
    await expect(services.resume(activation)).rejects.toThrow('UNAUTHENTICATED');
    await expect(services.getCollel(catalogPrincipal, created.collel.id)).rejects.toThrow(
      'FORBIDDEN',
    );
    await expect(services.activate(created.credentials.catalog)).rejects.toThrow('UNAUTHENTICATED');
    activation = (await services.activate(reset)).activationToken;
  });
  it('suspends and restores access without deleting the collel', async () => {
    await services.updateCollel(platform, created.collel.id, {
      name: 'שם חדש',
      slug: 'first-updated',
      active: false,
    });
    await expect(services.resume(activation)).rejects.toThrow('UNAUTHENTICATED');
    const directory = await services.listCollels(platform, { search: 'first-updated', page: 0 });
    expect(directory.items[0]?.active).toBe(false);
    expect(directory.items[0]?.admin.login).toBe('admin-first');
    await services.updateCollel(platform, created.collel.id, {
      name: 'שם חדש',
      slug: 'first-updated',
      active: true,
    });
    expect((await services.resume(activation)).session.memberships[0]?.name).toBe('שם חדש');
    await services.deactivate(activation);
    await expect(services.resume(activation)).rejects.toThrow('UNAUTHENTICATED');
  });
  it('protects HTTP platform routes and never reopens first setup', async () => {
    const app = buildApp(services, false);
    try {
      expect((await app.inject({ url: '/v1/platform/collels' })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/platform/setup',
            payload: { login: 'again', password, platformRole: 'super_admin' },
          })
        ).statusCode,
      ).toBe(400);
      await db.exec('RESET ROLE');
      await expect(
        db.exec("UPDATE private.users SET active = false WHERE platform_role = 'super_admin'"),
      ).rejects.toThrow('active super administrator');
      await db.exec('SET ROLE catalog_app');
      expect(await services.setupStatus()).toEqual({ required: false });
    } finally {
      await app.close();
    }
  });
});
