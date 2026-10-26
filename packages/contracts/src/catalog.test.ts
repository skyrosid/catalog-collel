import { describe, expect, it } from 'vitest';
import { bulkBooksSchema, bookSelectionSchema } from './catalog.js';

const books = Array.from({ length: 101 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
  version: 1,
}));
describe('bulk catalogue boundaries', () => {
  it('accepts only 1–100 unique versioned book references', () => {
    expect(bookSelectionSchema.safeParse(books.slice(0, 100)).success).toBe(true);
    for (const invalid of [[], books, [books[0], books[0]], [{ ...books[0], version: 0 }]])
      expect(bookSelectionSchema.safeParse(invalid).success).toBe(false);
  });
  it('requires an explicit patch and distinguishes clearing a value from leaving it unchanged', () => {
    expect(
      bulkBooksSchema.parse({ action: 'update', books: books.slice(0, 2), patch: { author: '' } }),
    ).toMatchObject({ patch: { author: '' } });
    for (const patch of [{}, { title: 'unexpected' }, { subject: 'x'.repeat(121) }])
      expect(
        bulkBooksSchema.safeParse({ action: 'update', books: books.slice(0, 2), patch }).success,
      ).toBe(false);
    expect(
      bulkBooksSchema.safeParse({
        action: 'delete',
        books: books.slice(0, 2),
        patch: { author: '' },
      }).success,
    ).toBe(false);
  });
});
