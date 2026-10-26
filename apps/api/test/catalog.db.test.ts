import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { catalogQuerySchema } from '@catalog/contracts';
import type { Book, BookInput } from '@catalog/contracts';
import { createServices } from '../src/auth/service.js';
import type { Principal, Services } from '../src/auth/service.js';
import { inTenant } from '../src/db/pool.js';
import { buildApp } from '../src/app.js';

const db = new PGlite();
const client = {
  query: (sql: string, values?: unknown[]) => db.query(sql, values),
  release: () => {},
};
const pool = { ...client, connect: async () => client } as unknown as pg.Pool;
let services: Services;
let admin: Principal;
let visitor: Principal;
let otherAdmin: Principal;
let collel: string;
let other: string;
let book: Book;
let token: string;
const input: BookInput = {
  title: 'אֲבוּדְרַהָם',
  author: 'רבינו דוד',
  subject: 'תפילה',
  location: { cabinet: '', shelf: 'ב - 6', position: '' },
};
const query = (search = '', page = 0) => catalogQuerySchema.parse({ search, page });

beforeAll(async () => {
  await db.exec(
    await readFile(new URL('../../../infra/postgres/provision.sql', import.meta.url), 'utf8'),
  );
  for (const file of [
    '001_foundation.sql',
    '002_platform_administration.sql',
    '003_delete_collel.sql',
    '004_optional_admin_password.sql',
    '005_catalog.sql',
  ])
    await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  await db.exec('SET ROLE catalog_app');
  services = await createServices(pool, 8);
  const setup = await services.setup({ login: 'platform', password: 'test-long-password-123' });
  const platform = await services.authenticate(setup.token);
  const a = await services.createCollel(platform, { name: 'כולל א', slug: 'first' });
  const b = await services.createCollel(platform, { name: 'כולל ב', slug: 'second' });
  collel = a.collel.id;
  other = b.collel.id;
  const login = await services.login(a.credentials.admin, false, 'admin');
  token = login.token;
  admin = await services.authenticate(token);
  visitor = await services.authenticate((await services.activate(a.credentials.catalog)).token);
  otherAdmin = await services.authenticate(
    (await services.login(b.credentials.admin, false, 'admin')).token,
  );
});
afterAll(async () => db.close());

describe('catalogue, permissions and PostgreSQL policies', () => {
  it('creates books, reads details and searches title/author/subject without niqqud', async () => {
    book = await services.createBook(admin, collel, input);
    expect(book.version).toBe(1);
    expect((await services.getBook(visitor, collel, book.id)).location.shelf).toBe('ב - 6');
    for (const term of ['אבודרהם', 'דוד', 'תפילה', 'דוד תפילה'])
      expect((await services.listBooks(visitor, collel, query(term))).total).toBe(1);
    for (const term of ['%', '_', '\\', "' OR 1=1 --"])
      expect((await services.listBooks(visitor, collel, query(term))).total).toBe(0);
    expect((await services.listBooks(visitor, collel, query('', 1))).items).toEqual([]);
    expect((await services.listBooks(visitor, collel, query('', 1))).total).toBe(1);
  });
  it('denies visitor writes and cross-collel access at the service and SQL layers', async () => {
    const foreign = await services.createBook(otherAdmin, other, input);
    await expect(services.getBook(admin, collel, foreign.id)).rejects.toThrow('NOT_FOUND');
    await expect(
      inTenant(pool, admin.sessionHash, collel, (sql) =>
        sql.query('UPDATE app.books SET collel_id=$1 WHERE id=$2', [other, book.id]),
      ),
    ).rejects.toThrow(/row-level security/);
    for (const operation of [
      () => services.createBook(visitor, collel, input),
      () => services.updateBook(visitor, collel, book.id, { input, version: 1 }),
      () => services.deleteBook(visitor, collel, book),
      () => services.moveBooks(visitor, collel, { books: [book], location: input.location }),
      () => services.importBooks(visitor, collel, [input]),
      () => services.bulkBooks(visitor, collel, { action: 'delete', books: [book] }),
      () =>
        services.bulkBooks(visitor, collel, {
          action: 'update',
          books: [book],
          patch: { subject: 'intrusion' },
        }),
      () => services.listBooks(admin, other, query()),
      () => services.getBook(otherAdmin, collel, book.id),
    ])
      await expect(operation()).rejects.toThrow('FORBIDDEN');
    expect((await db.query('SELECT * FROM app.books')).rows).toEqual([]);
    await inTenant(pool, visitor.sessionHash, collel, async (sql) => {
      expect(
        (await sql.query('UPDATE app.books SET title=$1 RETURNING id', ['intrusion'])).rows,
      ).toEqual([]);
      expect((await sql.query('DELETE FROM app.books RETURNING id')).rows).toEqual([]);
    });
    await expect(
      inTenant(pool, visitor.sessionHash, collel, (sql) =>
        sql.query(
          "INSERT INTO app.books (collel_id,title,search_text) VALUES ($1,'intrusion','intrusion')",
          [collel],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      await inTenant(
        pool,
        admin.sessionHash,
        other,
        async (sql) => (await sql.query('SELECT * FROM app.books')).rows,
      ),
    ).toEqual([]);
  });
  it('imports atomically, skips exact duplicates and supports stable pagination and every sort', async () => {
    const books = Array.from({ length: 27 }, (_, i) => ({
      ...input,
      title: `ספר ${String(i).padStart(2, '0')}`,
      location: { ...input.location, shelf: String(i) },
    }));
    expect(await services.importBooks(admin, collel, [...books, input, books[0]!])).toEqual({
      added: 27,
      skipped: 2,
    });
    expect(await services.importBooks(admin, collel, books)).toEqual({ added: 0, skipped: 27 });
    for (const sort of ['title', 'author', 'subject', 'location'] as const) {
      const first = await services.listBooks(visitor, collel, { ...query(), sort });
      const second = await services.listBooks(visitor, collel, { ...query('', 1), sort });
      expect(first.total).toBe(28);
      expect(first.items).toHaveLength(12);
      expect(second.items).toHaveLength(12);
      expect(new Set([...first.items, ...second.items].map((entry) => entry.id)).size).toBe(24);
      expect(
        (
          await services.listBooks(visitor, collel, {
            ...query(),
            sort,
            direction: 'desc',
            pageSize: 48,
          })
        ).items,
      ).toHaveLength(28);
    }
  });
  it('prevents lost edits and rolls back an entire move when one version is stale', async () => {
    const edited = await services.updateBook(admin, collel, book.id, {
      input: { ...input, subject: 'סדר התפילה' },
      version: book.version,
    });
    expect(edited.version).toBe(2);
    await expect(
      services.updateBook(admin, collel, book.id, { input, version: 1 }),
    ).rejects.toThrow('CONFLICT');
    const another = (await services.listBooks(visitor, collel, query('ספר 00'))).items[0]!;
    await expect(
      services.moveBooks(admin, collel, {
        books: [another, book],
        location: { cabinet: 'חדש', shelf: '7', position: '' },
      }),
    ).rejects.toThrow('CONFLICT');
    expect((await services.getBook(visitor, collel, another.id)).location).toEqual(
      another.location,
    );
    await services.moveBooks(admin, collel, {
      books: [another, edited],
      location: { cabinet: '', shelf: '49-א', position: '' },
    });
    expect((await services.getBook(visitor, collel, book.id)).location.shelf).toBe('49-א');
    await expect(services.deleteBook(admin, collel, edited)).rejects.toThrow('CONFLICT');
    book = await services.getBook(visitor, collel, book.id);
    await services.deleteBook(admin, collel, book);
    await expect(services.getBook(visitor, collel, book.id)).rejects.toThrow('NOT_FOUND');
  });
  it('updates a selection through the API and rejects stale or cross-collel bulk deletes atomically', async () => {
    const entries: Book[] = [];
    for (const suffix of ['א', 'ב'])
      entries.push(
        await services.createBook(admin, collel, { ...input, title: `בדיקת קבוצה ${suffix}` }),
      );
    const refs = entries.map(({ id, version }) => ({ id, version }));
    const app = buildApp(services, false);
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/collels/${collel}/books/bulk`,
        headers: { authorization: `Bearer ${token}` },
        payload: { action: 'update', books: refs, patch: { author: '', subject: 'נושא קבוצתי' } },
      });
      expect(response.statusCode).toBe(204);
      expect((await services.listBooks(visitor, collel, query('נושא קבוצתי'))).total).toBe(2);
      const updated: Book[] = [];
      for (const entry of entries) updated.push(await services.getBook(visitor, collel, entry.id));
      expect(updated.every((entry) => entry.author === '' && entry.version === 2)).toBe(true);
      const foreign = (await services.listBooks(otherAdmin, other, query())).items[0]!;
      for (const selection of [
        [updated[0]!, refs[1]!],
        [updated[0]!, foreign],
      ]) {
        await expect(
          services.bulkBooks(admin, collel, { action: 'delete', books: selection }),
        ).rejects.toThrow('CONFLICT');
        expect((await services.listBooks(visitor, collel, query('נושא קבוצתי'))).total).toBe(2);
      }
      await services.bulkBooks(admin, collel, { action: 'delete', books: updated });
      expect((await services.listBooks(visitor, collel, query('נושא קבוצתי'))).total).toBe(0);
    } finally {
      await app.close();
    }
  });
  it('rolls back all bulk edits if one of the resulting records would be a duplicate', async () => {
    const entries: Book[] = [];
    for (const author of ['א', 'ב'])
      entries.push(
        await services.createBook(admin, collel, {
          ...input,
          title: 'בדיקת כפילות קבוצתית',
          author,
        }),
      );
    await expect(
      services.bulkBooks(admin, collel, {
        action: 'update',
        books: entries,
        patch: { author: 'מחבר משותף' },
      }),
    ).rejects.toThrow('CONFLICT');
    const unchanged: Book[] = [];
    for (const entry of entries) unchanged.push(await services.getBook(visitor, collel, entry.id));
    expect(unchanged.map((entry) => ({ author: entry.author, version: entry.version }))).toEqual([
      { author: 'א', version: 1 },
      { author: 'ב', version: 1 },
    ]);
    await services.bulkBooks(admin, collel, { action: 'delete', books: entries });
  });
  it('validates API input and protects every write endpoint for visitors', async () => {
    const app = buildApp(services, false);
    const header = { authorization: `Bearer ${token}` };
    try {
      expect((await app.inject({ url: `/v1/collels/${collel}/books` })).statusCode).toBe(401);
      expect(
        (await app.inject({ url: `/v1/collels/${collel}/books?sort=title;DROP`, headers: header }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/v1/collels/${collel}/books/import`,
            headers: header,
            payload: { books: [{ ...input, role: 'admin' }] },
          })
        ).statusCode,
      ).toBe(400);
      const visitorApp = buildApp({ ...services, authenticate: async () => visitor }, false);
      try {
        for (const [method, suffix, payload] of [
          ['POST', '', input],
          ['PATCH', `/${book.id}`, { input, version: 1 }],
          ['DELETE', `/${book.id}`, { version: 1 }],
          [
            'POST',
            '/move',
            { books: [{ id: book.id, version: book.version }], location: input.location },
          ],
          ['POST', '/import', { books: [input] }],
          ['POST', '/bulk', { action: 'delete', books: [{ id: book.id, version: book.version }] }],
          [
            'POST',
            '/bulk',
            {
              action: 'update',
              books: [{ id: book.id, version: book.version }],
              patch: { subject: 'forbidden' },
            },
          ],
        ] as const) {
          expect(
            (
              await visitorApp.inject({
                method,
                url: `/v1/collels/${collel}/books${suffix}`,
                payload,
              })
            ).statusCode,
          ).toBe(403);
        }
      } finally {
        await visitorApp.close();
      }
    } finally {
      await app.close();
    }
  });
  it('rechecks demotion even when the administrator principal is still in memory', async () => {
    await db.exec('RESET ROLE');
    await db.query(
      "INSERT INTO private.memberships (user_id,collel_id,role) VALUES ($1,$2,'admin')",
      [otherAdmin.session.user.id, collel],
    );
    await db.query('UPDATE app.collels SET primary_admin_id=$1 WHERE id=$2', [
      otherAdmin.session.user.id,
      collel,
    ]);
    await db.query("UPDATE private.memberships SET role='user' WHERE user_id=$1 AND collel_id=$2", [
      admin.session.user.id,
      collel,
    ]);
    await db.exec('SET ROLE catalog_app');
    expect((await services.listBooks(admin, collel, query())).total).toBe(27);
    await expect(services.createBook(admin, collel, input)).rejects.toThrow('FORBIDDEN');
    await expect(services.importBooks(admin, collel, [input])).rejects.toThrow('FORBIDDEN');
    await expect(
      services.bulkBooks(admin, collel, { action: 'delete', books: [book] }),
    ).rejects.toThrow('FORBIDDEN');
  });
  it('rechecks expired sessions even for a previously resolved principal', async () => {
    await db.exec('RESET ROLE');
    await db.query(
      "UPDATE private.sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [admin.sessionHash],
    );
    await db.exec('SET ROLE catalog_app');
    await expect(services.listBooks(admin, collel, query())).rejects.toThrow('FORBIDDEN');
    await expect(services.importBooks(admin, collel, [input])).rejects.toThrow('FORBIDDEN');
    expect((await services.listBooks(visitor, collel, query())).total).toBe(27);
  });
});
