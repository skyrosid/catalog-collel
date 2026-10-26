import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { LibraryMark } from './library-art';
import { bookInputSchema, moveBooksSchema, bulkBookPatchSchema } from '@catalog/contracts';
import type {
  Book,
  BookInput,
  BookLocation,
  BookReference,
  BulkBookPatch,
  ImportPreview,
} from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Field, FormActions, Modal, Notice } from './forms';
import { Button } from './ui/button';

const c = t.catalog;
export const emptyLocation: BookLocation = { cabinet: '', shelf: '', position: '' };
export function locationLabel(location: BookLocation) {
  return location.shelf ? `${c.shelf} ${location.shelf}` : c.unknownLocation;
}

function LocationFields({
  value,
  onChange,
  busy,
}: {
  value: BookLocation;
  onChange: (value: BookLocation) => void;
  busy: boolean;
}) {
  return (
    <fieldset className="space-y-4 rounded-lg border bg-background/60 p-4" disabled={busy}>
      <legend className="px-2 text-sm font-medium">{c.location}</legend>
      <Field
        label={c.shelf}
        hint={c.shelfHint}
        value={value.shelf}
        maxLength={60}
        onChange={(event) => onChange({ ...value, shelf: event.target.value })}
      />
    </fieldset>
  );
}

export function BookForm({
  book,
  busy,
  error,
  onSave,
  onClose,
}: {
  book: Book | null;
  busy: boolean;
  error: string | null;
  onSave: (input: BookInput) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState<BookInput>(
    book ?? { title: '', author: '', subject: '', location: emptyLocation },
  );
  const [invalid, setInvalid] = useState(false);
  return (
    <Modal title={book ? c.edit : c.newBook} onCancel={onClose} busy={busy}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = bookInputSchema.safeParse({
            title: input.title,
            author: input.author,
            subject: input.subject,
            location: input.location,
          });
          setInvalid(!parsed.success);
          if (parsed.success) onSave(parsed.data);
        }}
      >
        {(error || invalid) && <Notice>{error ?? t.errors.INVALID_INPUT}</Notice>}
        <fieldset className="space-y-4" disabled={busy}>
          <Field
            label={c.titleField}
            required
            autoFocus
            value={input.title}
            maxLength={300}
            onChange={(event) => setInput({ ...input, title: event.target.value })}
          />
          <Field
            label={`${c.author} (${c.optional})`}
            value={input.author}
            maxLength={200}
            onChange={(event) => setInput({ ...input, author: event.target.value })}
          />
          <Field
            label={`${c.subject} (${c.optional})`}
            value={input.subject}
            maxLength={120}
            onChange={(event) => setInput({ ...input, subject: event.target.value })}
          />
        </fieldset>
        <LocationFields
          value={input.location}
          busy={busy}
          onChange={(location) => setInput({ ...input, location })}
        />
        <FormActions>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t.cancel}
          </Button>
          <Button disabled={busy}>{busy ? t.saving : t.save}</Button>
        </FormActions>
      </form>
    </Modal>
  );
}

export function MoveBooksForm({
  books,
  busy,
  error,
  onSave,
  onClose,
}: {
  books: BookReference[];
  busy: boolean;
  error: string | null;
  onSave: (location: BookLocation) => void;
  onClose: () => void;
}) {
  const [location, setLocation] = useState(emptyLocation);
  const [invalid, setInvalid] = useState(false);
  return (
    <Modal
      title={`${c.move} · ${books.length}`}
      description={c.moveHint}
      onCancel={onClose}
      busy={busy}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = moveBooksSchema.safeParse({ books, location });
          setInvalid(!parsed.success);
          if (parsed.success) onSave(parsed.data.location);
        }}
      >
        {(error || invalid) && <Notice>{error ?? t.errors.INVALID_INPUT}</Notice>}
        <LocationFields value={location} onChange={setLocation} busy={busy} />
        <FormActions>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t.cancel}
          </Button>
          <Button disabled={busy}>{busy ? t.saving : c.moveConfirm}</Button>
        </FormActions>
      </form>
    </Modal>
  );
}

export function BulkBookForm({
  count,
  busy,
  error,
  onSave,
  onClose,
}: {
  count: number;
  busy: boolean;
  error: string | null;
  onSave: (patch: BulkBookPatch) => void;
  onClose: () => void;
}) {
  const [authorEnabled, setAuthorEnabled] = useState(false);
  const [subjectEnabled, setSubjectEnabled] = useState(false);
  const [author, setAuthor] = useState('');
  const [subject, setSubject] = useState('');
  return (
    <Modal
      title={`${c.bulkEdit} · ${count}`}
      description={c.bulkEditHint}
      busy={busy}
      onCancel={onClose}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const patch = bulkBookPatchSchema.safeParse({
            ...(authorEnabled ? { author } : {}),
            ...(subjectEnabled ? { subject } : {}),
          });
          if (patch.success) onSave(patch.data);
        }}
      >
        {error && <Notice>{error}</Notice>}
        <fieldset className="space-y-5" disabled={busy}>
          <section className="bulk-field">
            <label>
              <input
                type="checkbox"
                checked={authorEnabled}
                onChange={(event) => setAuthorEnabled(event.target.checked)}
              />
              {c.updateAuthor}
            </label>
            {authorEnabled && (
              <Field
                label={c.author}
                value={author}
                maxLength={200}
                onChange={(event) => setAuthor(event.target.value)}
              />
            )}
          </section>
          <section className="bulk-field">
            <label>
              <input
                type="checkbox"
                checked={subjectEnabled}
                onChange={(event) => setSubjectEnabled(event.target.checked)}
              />
              {c.updateSubject}
            </label>
            {subjectEnabled && (
              <Field
                label={c.subject}
                value={subject}
                maxLength={120}
                onChange={(event) => setSubject(event.target.value)}
              />
            )}
          </section>
        </fieldset>
        <FormActions>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            {t.cancel}
          </Button>
          <Button disabled={busy || (!authorEnabled && !subjectEnabled)}>
            {busy ? t.saving : t.save}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

export function BookDetails({
  book,
  admin,
  onClose,
  onEdit,
}: {
  book: Book;
  admin: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Modal title={c.details} onCancel={onClose}>
      <div className="space-y-6">
        <div className="book-details-cover">
          <LibraryMark className="book-details-watermark" />
          <span className="catalog-subject">
            <bdi>{book.subject || c.unknown}</bdi>
          </span>
          <h3>
            <bdi>{book.title}</bdi>
          </h3>
          <p>
            <bdi>{book.author || c.unknown}</bdi>
          </p>
        </div>
        <div className="book-details-location">
          <p>
            <MapPin className="size-4" aria-hidden="true" />
            {c.location}
          </p>
          <dl>
            <div>
              <dt>{c.shelf}</dt>
              <dd>
                <bdi>{book.location.shelf || c.unknownLocation}</bdi>
              </dd>
            </div>
          </dl>
        </div>
        <FormActions>
          <Button variant="outline" onClick={onClose}>
            {t.interface.close}
          </Button>
          {admin && <Button onClick={onEdit}>{c.edit}</Button>}
        </FormActions>
      </div>
    </Modal>
  );
}

export function BookImportReview({
  preview,
  busy,
  error,
  onImport,
  onClose,
}: {
  preview: ImportPreview;
  busy: boolean;
  error: string | null;
  onImport: () => void;
  onClose: () => void;
}) {
  const missing = preview.books.filter(
    (book) => !book.author || !book.subject || !book.location.shelf,
  ).length;
  const valid = preview.issues.length === 0 && preview.books.length > 0;
  return (
    <Modal title={c.importReview} onCancel={onClose} busy={busy}>
      <div className="space-y-5">
        {error && <Notice>{error}</Notice>}
        <p className="break-words text-sm font-medium">
          <bdi>{preview.filename}</bdi>
        </p>
        <p className="text-sm leading-7 text-muted-foreground">{c.importHint}</p>
        {preview.issues.length > 0 ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <ul className="space-y-2">
              {preview.issues.slice(0, 20).map((issue, index) => (
                <li key={index}>
                  {issue.row > 0 && `${c.row} ${issue.row}: `}
                  {c.issues[issue.code]}
                </li>
              ))}
            </ul>
            {preview.issues.length > 20 && (
              <p className="mt-2">
                {preview.issues.length - 20} {c.moreIssues}
              </p>
            )}
          </div>
        ) : (
          <p className="font-medium">
            {preview.books.length} {c.ready}
          </p>
        )}
        {!preview.books.length && !preview.issues.length && <Notice>{c.importEmpty}</Notice>}
        {missing > 0 && (
          <p className="rounded-lg bg-accent p-4 text-sm leading-6">
            {missing} {c.missing}. {c.missingHint}
          </p>
        )}
        {preview.books.length > 0 && (
          <div>
            <p className="mb-3 text-xs text-muted-foreground">{c.preview}</p>
            <ol className="divide-y rounded-lg border px-4">
              {preview.books.slice(0, 5).map((book, index) => (
                <li key={index} className="py-3 text-sm">
                  <p className="font-medium">
                    <bdi>{book.title}</bdi>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <bdi>{book.author || c.unknown}</bdi> ·{' '}
                    <bdi>{book.location.shelf || c.unknownLocation}</bdi>
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
        <p className="text-xs leading-6 text-muted-foreground">{c.duplicateHint}</p>
        <FormActions>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t.cancel}
          </Button>
          <Button disabled={busy || !valid} onClick={onImport}>
            {busy ? t.saving : c.importConfirm}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}
