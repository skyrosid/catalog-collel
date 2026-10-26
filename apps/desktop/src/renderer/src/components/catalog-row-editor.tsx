import { useId, useState } from 'react';
import { Check, X } from 'lucide-react';
import { bookInputSchema } from '@catalog/contracts';
import type { Book, BookInput } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Input } from './ui/input';
import { Button } from './ui/button';

export function CatalogRowEditor({
  book,
  number,
  height,
  busy,
  error,
  onSave,
  onCancel,
}: {
  book: Book;
  number: number;
  height: number;
  busy: boolean;
  error: string | null;
  onSave: (input: BookInput) => void;
  onCancel: () => void;
}) {
  const formId = useId();
  const hintId = `${formId}-hint`;
  const errorId = `${formId}-error`;
  const [input, setInput] = useState<BookInput>({
    title: book.title,
    author: book.author,
    subject: book.subject,
    location: { ...book.location },
  });
  const [invalid, setInvalid] = useState(false);
  const message = error ?? (invalid ? t.errors.INVALID_INPUT : null);
  const describedBy = message ? `${hintId} ${errorId}` : hintId;
  return (
    <>
      <tr
        className="sheet-editing-row"
        style={{ height: height || undefined }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <th scope="row" className="sheet-row-number">
          {number}
        </th>
        <td className="sheet-checkbox">
          <span className="sheet-editing-dot" aria-hidden="true" />
          <span className="sr-only">{t.catalog.edit}</span>
        </td>
        <td>
          <Input
            form={formId}
            aria-label={t.catalog.shelf}
            aria-describedby={describedBy}
            value={input.location.shelf}
            maxLength={60}
            disabled={busy}
            autoFocus
            onChange={(event) =>
              setInput({ ...input, location: { ...input.location, shelf: event.target.value } })
            }
          />
        </td>
        <td>
          <Input
            form={formId}
            aria-label={t.catalog.titleField}
            aria-describedby={describedBy}
            value={input.title}
            maxLength={300}
            required
            disabled={busy}
            onChange={(event) => setInput({ ...input, title: event.target.value })}
          />
        </td>
        <td>
          <Input
            form={formId}
            aria-label={t.catalog.subject}
            aria-describedby={describedBy}
            value={input.subject}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setInput({ ...input, subject: event.target.value })}
          />
        </td>
        <td>
          <Input
            form={formId}
            aria-label={t.catalog.author}
            aria-describedby={describedBy}
            value={input.author}
            maxLength={200}
            disabled={busy}
            onChange={(event) => setInput({ ...input, author: event.target.value })}
          />
        </td>
        <td className="sheet-row-actions">
          <form
            id={formId}
            className="sheet-edit-actions"
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = bookInputSchema.safeParse(input);
              setInvalid(!parsed.success);
              if (parsed.success) onSave(parsed.data);
            }}
          >
            <span id={hintId} className="sr-only">
              {t.catalog.inlineEditHint}
            </span>
            <Button
              size="icon-sm"
              type="submit"
              disabled={busy}
              aria-label={busy ? t.saving : t.save}
              title={t.save}
            >
              <Check aria-hidden="true" />
            </Button>
            <Button
              size="icon-sm"
              type="button"
              variant="outline"
              disabled={busy}
              aria-label={t.cancel}
              title={t.cancel}
              onClick={onCancel}
            >
              <X aria-hidden="true" />
            </Button>
          </form>
        </td>
      </tr>
      {message && (
        <tr className="sheet-editing-help">
          <td colSpan={7}>
            <p id={errorId} role="alert">
              {message}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
