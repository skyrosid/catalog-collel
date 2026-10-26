import type pg from 'pg';
import { normalizeBookSearch } from '@catalog/contracts';
import type {
  Book,
  BookDirectory,
  BookInput,
  BookReference,
  BulkBooksInput,
  CatalogQuery,
  ImportSummary,
  MoveBooksInput,
  UpdateBookInput,
} from '@catalog/contracts';
import { requireMembership } from '../auth/service.js';
import type { Principal } from '../auth/service.js';
import { inTenant } from '../db/pool.js';
import { AppError } from '../errors.js';

export interface CatalogServices {
  listBooks(actor: Principal, collelId: string, query: CatalogQuery): Promise<BookDirectory>;
  getBook(actor: Principal, collelId: string, id: string): Promise<Book>;
  createBook(actor: Principal, collelId: string, input: BookInput): Promise<Book>;
  updateBook(actor: Principal, collelId: string, id: string, input: UpdateBookInput): Promise<Book>;
  deleteBook(actor: Principal, collelId: string, book: BookReference): Promise<void>;
  moveBooks(actor: Principal, collelId: string, input: MoveBooksInput): Promise<void>;
  bulkBooks(actor: Principal, collelId: string, input: BulkBooksInput): Promise<void>;
  importBooks(actor: Principal, collelId: string, books: BookInput[]): Promise<ImportSummary>;
}
const columns = `id, title, author, subject, json_build_object('cabinet', cabinet, 'shelf', shelf, 'position', position) AS location, version`;
const orders = {
  title: 'title, author',
  author: 'author, title',
  subject: 'subject, title, author',
  location: 'cabinet, length(shelf), shelf, position, title',
};
const values = (input: BookInput) => [
  input.title,
  input.author,
  input.subject,
  input.location.cabinet,
  input.location.shelf,
  input.location.position,
  normalizeBookSearch(`${input.title} ${input.author} ${input.subject}`),
];

export function createCatalogServices(pool: pg.Pool): CatalogServices {
  async function scoped<T>(
    actor: Principal,
    collelId: string,
    admin: boolean,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    requireMembership(actor, collelId, admin ? 'admin' : undefined);
    try {
      return await inTenant(pool, actor.sessionHash, collelId, async (client) => {
        // Recheck database permissions, including revoked/stale principals, before reading or writing.
        const access = await client.query<{ allowed: boolean }>(
          'SELECT app.has_access($1, $2) AS allowed',
          [collelId, admin ? 'admin' : null],
        );
        if (!access.rows[0]?.allowed) throw new AppError(403, 'FORBIDDEN');
        return work(client);
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
        throw new AppError(409, 'CONFLICT');
      throw error;
    }
  }
  async function insert(client: pg.PoolClient, collelId: string, input: BookInput) {
    return client.query<Book>(
      `INSERT INTO app.books (collel_id, title, author, subject, cabinet, shelf, position, search_text) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${columns}`,
      [collelId, ...values(input)],
    );
  }
  return {
    listBooks: (actor, collelId, query) =>
      scoped(actor, collelId, false, async (client) => {
        const tokens = normalizeBookSearch(query.search)
          .split(/\s+/)
          .filter(Boolean)
          .map((token) => `%${token.replace(/[\\%_]/g, '\\$&')}%`);
        const where = 'collel_id = $1 AND search_text LIKE ALL($2::text[])';
        const direction = query.direction === 'desc' ? 'DESC' : 'ASC';
        const order = orders[query.sort]
          .split(', ')
          .map((column) => `${column} ${direction}`)
          .join(', ');
        // A single statement gives the count and page the same database snapshot.
        const result = await client.query<BookDirectory>(
          `SELECT (SELECT count(*)::integer FROM app.books WHERE ${where}) AS total, COALESCE(json_agg(page), '[]'::json) AS items FROM (SELECT ${columns} FROM app.books WHERE ${where} ORDER BY ${order}, id LIMIT $3 OFFSET $4) page`,
          [collelId, tokens, query.pageSize, query.page * query.pageSize],
        );
        return result.rows[0]!;
      }),
    getBook: (actor, collelId, id) =>
      scoped(actor, collelId, false, async (client) => {
        const result = await client.query<Book>(
          `SELECT ${columns} FROM app.books WHERE collel_id = $1 AND id = $2`,
          [collelId, id],
        );
        if (!result.rows[0]) throw new AppError(404, 'NOT_FOUND');
        return result.rows[0];
      }),
    createBook: (actor, collelId, input) =>
      scoped(
        actor,
        collelId,
        true,
        async (client) => (await insert(client, collelId, input)).rows[0]!,
      ),
    updateBook: (actor, collelId, id, { input, version }) =>
      scoped(actor, collelId, true, async (client) => {
        const result = await client.query<Book>(
          `UPDATE app.books SET title=$4, author=$5, subject=$6, cabinet=$7, shelf=$8, position=$9, search_text=$10, version=version+1 WHERE collel_id=$1 AND id=$2 AND version=$3 RETURNING ${columns}`,
          [collelId, id, version, ...values(input)],
        );
        if (!result.rows[0]) throw new AppError(409, 'CONFLICT');
        return result.rows[0];
      }),
    deleteBook: (actor, collelId, book) =>
      scoped(actor, collelId, true, async (client) => {
        const result = await client.query(
          'DELETE FROM app.books WHERE collel_id=$1 AND id=$2 AND version=$3 RETURNING id',
          [collelId, book.id, book.version],
        );
        if (!result.rows.length) throw new AppError(409, 'CONFLICT');
      }),
    moveBooks: (actor, collelId, { books, location }) =>
      scoped(actor, collelId, true, async (client) => {
        // Consistent lock order and one transaction: a stale/deleted book rolls back the whole move.
        for (const book of [...books].sort((a, b) => a.id.localeCompare(b.id))) {
          const result = await client.query(
            'UPDATE app.books SET cabinet=$4, shelf=$5, position=$6, version=version+1 WHERE collel_id=$1 AND id=$2 AND version=$3 RETURNING id',
            [collelId, book.id, book.version, location.cabinet, location.shelf, location.position],
          );
          if (!result.rows.length) throw new AppError(409, 'CONFLICT');
        }
      }),
    bulkBooks: (actor, collelId, input) =>
      scoped(actor, collelId, true, async (client) => {
        const expected = new Map(input.books.map((book) => [book.id, book.version]));
        const locked = await client.query<Book>(
          `SELECT ${columns} FROM app.books WHERE collel_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
          [collelId, input.books.map((book) => book.id)],
        );
        if (
          locked.rows.length !== input.books.length ||
          locked.rows.some((book) => expected.get(book.id) !== book.version)
        )
          throw new AppError(409, 'CONFLICT');
        if (input.action === 'delete') {
          const removed = await client.query(
            'DELETE FROM app.books WHERE collel_id=$1 AND id=ANY($2::uuid[]) RETURNING id',
            [collelId, locked.rows.map((book) => book.id)],
          );
          if (removed.rows.length !== input.books.length) throw new AppError(409, 'CONFLICT');
        } else {
          for (const book of locked.rows) {
            const author = input.patch.author ?? book.author;
            const subject = input.patch.subject ?? book.subject;
            const updated = await client.query(
              'UPDATE app.books SET author=$4, subject=$5, search_text=$6, version=version+1 WHERE collel_id=$1 AND id=$2 AND version=$3 RETURNING id',
              [
                collelId,
                book.id,
                book.version,
                author,
                subject,
                normalizeBookSearch(`${book.title} ${author} ${subject}`),
              ],
            );
            if (!updated.rows.length) throw new AppError(409, 'CONFLICT');
          }
        }
      }),
    importBooks: (actor, collelId, books) =>
      scoped(actor, collelId, true, async (client) => {
        const records = books.map((book) => ({
          title: book.title,
          author: book.author,
          subject: book.subject,
          ...book.location,
          search_text: normalizeBookSearch(`${book.title} ${book.author} ${book.subject}`),
        }));
        const result = await client.query<{ added: number }>(
          `WITH inserted AS (INSERT INTO app.books (collel_id, title, author, subject, cabinet, shelf, position, search_text) SELECT $1, title, author, subject, cabinet, shelf, position, search_text FROM jsonb_to_recordset($2::jsonb) AS source(title text, author text, subject text, cabinet text, shelf text, position text, search_text text) ON CONFLICT (collel_id, title, author, subject, cabinet, shelf, position) DO NOTHING RETURNING 1) SELECT count(*)::integer AS added FROM inserted`,
          [collelId, JSON.stringify(records)],
        );
        const added = result.rows[0]!.added;
        return { added, skipped: books.length - added };
      }),
  };
}
