import { MAX_BOOK_SELECTION } from '@catalog/contracts';
import type { BookReference } from '@catalog/contracts';

export function selectBookRange(
  selected: BookReference[],
  page: BookReference[],
  targetId: string,
  checked: boolean,
  anchorId: string | null,
  extend: boolean,
) {
  const target = page.findIndex((book) => book.id === targetId);
  const anchor = extend ? page.findIndex((book) => book.id === anchorId) : -1;
  if (target < 0) return { books: selected, limitReached: false };
  const range = page.slice(
    Math.min(anchor < 0 ? target : anchor, target),
    Math.max(anchor, target) + 1,
  );
  const next = new Map(selected.map((book) => [book.id, book]));
  for (const book of range) {
    if (checked) {
      if (!next.has(book.id)) next.set(book.id, { id: book.id, version: book.version });
    } else next.delete(book.id);
  }
  if (next.size > MAX_BOOK_SELECTION) return { books: selected, limitReached: true };
  return { books: [...next.values()], limitReached: false };
}
