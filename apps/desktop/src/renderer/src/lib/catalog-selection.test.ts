import { describe, expect, it } from 'vitest';
import { selectBookRange } from './catalog-selection';

const page = Array.from({ length: 6 }, (_, index) => ({ id: `book-${index}`, version: 1 }));
const external = { id: 'another-page', version: 3 };
describe('catalogue range selection', () => {
  it('selects a single row and preserves selections from other pages without mutating them', () => {
    const before = [external];
    expect(selectBookRange(before, page, 'book-2', true, null, false)).toEqual({
      books: [external, page[2]],
      limitReached: false,
    });
    expect(before).toEqual([external]);
  });
  it('extends the range forward and backward without duplicating the anchor', () => {
    const expected = [external, ...page.slice(1, 5)];
    expect(
      selectBookRange([external, page[1]!], page, 'book-4', true, 'book-1', true).books,
    ).toEqual(expected);
    expect(
      new Set(
        selectBookRange([external, page[4]!], page, 'book-1', true, 'book-4', true).books.map(
          (book) => book.id,
        ),
      ),
    ).toEqual(new Set(expected.map((book) => book.id)));
  });
  it('deselects a range while retaining selections outside it and on other pages', () => {
    expect(
      selectBookRange([external, ...page], page, 'book-4', false, 'book-1', true).books,
    ).toEqual([external, page[0], page[5]]);
  });
  it('does not extend a range using an anchor from another page', () => {
    expect(selectBookRange([external], page, 'book-3', true, external.id, true).books).toEqual([
      external,
      page[3],
    ]);
  });
  it('rejects the complete range if it would exceed 100 selected books', () => {
    const before = Array.from({ length: 98 }, (_, index) => ({
      id: `external-${index}`,
      version: 1,
    }));
    expect(selectBookRange(before, page, 'book-4', true, 'book-1', true)).toEqual({
      books: before,
      limitReached: true,
    });
    expect(selectBookRange(before, page, 'book-1', true, 'book-0', true).books).toHaveLength(100);
    expect(before).toHaveLength(98);
  });
  it('preserves versions of already selected records so concurrent changes cannot be silently overwritten', () => {
    const previous = { ...page[1]!, version: 1 };
    const updated = page.map((book) => ({ ...book, version: 2 }));
    expect(selectBookRange([previous], updated, 'book-2', true, 'book-1', true).books).toEqual([
      previous,
      { ...page[2]!, version: 2 },
    ]);
  });
});
