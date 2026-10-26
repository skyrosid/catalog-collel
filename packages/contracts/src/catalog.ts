import { z } from 'zod';

const label = (max: number) => z.string().trim().min(1).max(max);
export const bookLocationSchema = z.strictObject({
  cabinet: z.string().trim().max(60),
  shelf: z.string().trim().max(60),
  position: z.string().trim().max(100),
});
export const bookInputSchema = z.strictObject({
  title: label(300),
  author: z.string().trim().max(200),
  subject: z.string().trim().max(120),
  location: bookLocationSchema,
});
export const bookSchema = bookInputSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export const catalogQuerySchema = z.strictObject({
  search: z.string().trim().max(100).default(''),
  page: z.number().int().min(0).max(100_000).default(0),
  pageSize: z.union([z.literal(12), z.literal(24), z.literal(48)]).default(12),
  sort: z.enum(['title', 'author', 'subject', 'location']).default('title'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});
export const bookDirectorySchema = z.strictObject({
  items: z.array(bookSchema),
  total: z.number().int().nonnegative(),
});
export const bookReferenceSchema = z.strictObject({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export const MAX_BOOK_SELECTION = 100;
export const bookSelectionSchema = z
  .array(bookReferenceSchema)
  .min(1)
  .max(MAX_BOOK_SELECTION)
  .refine((books) => new Set(books.map((book) => book.id)).size === books.length);
export const bulkBookPatchSchema = z
  .strictObject({
    author: bookInputSchema.shape.author.optional(),
    subject: bookInputSchema.shape.subject.optional(),
  })
  .refine((patch) => patch.author !== undefined || patch.subject !== undefined);
export const bulkBooksSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('update'),
    books: bookSelectionSchema,
    patch: bulkBookPatchSchema,
  }),
  z.strictObject({ action: z.literal('delete'), books: bookSelectionSchema }),
]);
export type BulkBookPatch = z.infer<typeof bulkBookPatchSchema>;
export type BulkBooksInput = z.infer<typeof bulkBooksSchema>;
export const updateBookSchema = z.strictObject({
  input: bookInputSchema,
  version: z.number().int().positive(),
});
export const moveBooksSchema = z.strictObject({
  books: bookSelectionSchema,
  location: bookLocationSchema.refine((value) =>
    Boolean(value.shelf || value.cabinet || value.position),
  ),
});
export const importBooksSchema = z.strictObject({
  books: z.array(bookInputSchema).min(1).max(10000),
});
export const importSummarySchema = z.strictObject({
  added: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
export const importPreviewSchema = z.strictObject({
  filename: z.string(),
  books: z.array(bookInputSchema).max(10000),
  issues: z.array(
    z.strictObject({
      row: z.number().int().nonnegative(),
      code: z.enum(['HEADERS', 'INVALID_ROW', 'TOO_MANY_ROWS', 'INVALID_FILE']),
    }),
  ),
});
export type Book = z.infer<typeof bookSchema>;
export type BookInput = z.infer<typeof bookInputSchema>;
export type BookLocation = z.infer<typeof bookLocationSchema>;
export type BookReference = z.infer<typeof bookReferenceSchema>;
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type BookDirectory = z.infer<typeof bookDirectorySchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
export type MoveBooksInput = z.infer<typeof moveBooksSchema>;
export type ImportSummary = z.infer<typeof importSummarySchema>;
export type ImportPreview = z.infer<typeof importPreviewSchema>;

// Search ignores Hebrew vowel/cantillation marks and treats SQL wildcard characters literally.
export function normalizeBookSearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g, '')
    .toLowerCase()
    .trim();
}
