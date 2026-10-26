import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  FileSpreadsheet,
  MapPin,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { MAX_BOOK_SELECTION } from '@catalog/contracts';
import type { Book, BookInput, BookReference, CatalogQuery } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Button } from './ui/button';
import { CatalogRowEditor } from './catalog-row-editor';
import { selectBookRange } from '@/lib/catalog-selection';

const c = t.catalog;
const columns = [
  { field: 'location', letter: 'A', label: c.shelf },
  { field: 'title', letter: 'B', label: c.titleField },
  { field: 'subject', letter: 'C', label: c.subject },
  { field: 'author', letter: 'D', label: c.author },
] as const;

export function CatalogSheet({
  items,
  query,
  selected,
  busy,
  onSelect,
  onSort,
  onEdit,
  onDelete,
  onMove,
  onBulkEdit,
  onBulkDelete,
  editing,
  editError,
  onSave,
  onCancel,
  footer,
}: {
  items: Book[];
  query: CatalogQuery;
  selected: BookReference[];
  busy: boolean;
  onSelect: (books: BookReference[]) => void;
  onSort: (field: CatalogQuery['sort']) => void;
  onEdit: (book: Book) => void;
  onDelete: (book: Book) => void;
  onMove: () => void;
  onBulkEdit: () => void;
  onBulkDelete: () => void;
  editing: Book | null;
  editError: string | null;
  onSave: (input: BookInput) => void;
  onCancel: () => void;
  footer: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const anchorId = useRef<string | null>(null);
  const checkboxShift = useRef(false);
  const [limitReached, setLimitReached] = useState(false);
  const [editingRowHeight, setEditingRowHeight] = useState(0);
  useEffect(() => {
    const sheet = sheetRef.current;
    const toolbar = toolbarRef.current;
    if (!sheet || !toolbar) return;
    const update = () =>
      sheet.style.setProperty(
        '--sheet-toolbar-height',
        `${toolbar.getBoundingClientRect().height}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);
  const selectedIds = new Set(selected.map((book) => book.id));
  const pageIds = new Set(items.map((book) => book.id));
  const outsidePage = selected.filter((book) => !pageIds.has(book.id));
  const allSelected = items.length > 0 && items.every((book) => selectedIds.has(book.id));
  const someSelected = items.some((book) => selectedIds.has(book.id));
  const blocked = busy || editing !== null;
  const noSelection = blocked || selected.length === 0;
  function toggle(book: Book, checked: boolean, extend: boolean) {
    const next = selectBookRange(selected, items, book.id, checked, anchorId.current, extend);
    if (!extend || !items.some((item) => item.id === anchorId.current)) anchorId.current = book.id;
    setLimitReached(next.limitReached);
    if (!next.limitReached) onSelect(next.books);
  }
  return (
    <div className="catalog-sheet" ref={sheetRef} data-editing={editing !== null || undefined}>
      <div
        className="sheet-actionbar"
        ref={toolbarRef}
        data-active={selected.length > 0 || undefined}
      >
        <div className="sheet-selection-status" role="status" aria-live="polite">
          <FileSpreadsheet aria-hidden="true" />
          <div>
            <strong>
              {selected.length === 1
                ? c.selectedOne
                : selected.length
                  ? `${selected.length} ${c.selected}`
                  : c.selectRowsHint}
            </strong>
            <span>
              {c.selectionLimit} · {c.rangeSelectionHint}
            </span>
          </div>
        </div>
        <div className="sheet-bulk-actions">
          <Button size="sm" variant="outline" disabled={noSelection} onClick={onMove}>
            <MapPin aria-hidden="true" />
            {c.move}
          </Button>
          <Button size="sm" variant="outline" disabled={noSelection} onClick={onBulkEdit}>
            <Pencil aria-hidden="true" />
            {c.bulkEdit}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={noSelection}
            onClick={onBulkDelete}
          >
            <Trash2 aria-hidden="true" />
            {c.bulkDelete}
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className={selected.length === 0 ? 'invisible' : undefined}
            disabled={noSelection}
            aria-label={c.clearSelection}
            title={c.clearSelection}
            onClick={() => {
              onSelect([]);
              anchorId.current = null;
              setLimitReached(false);
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
      {limitReached && (
        <p className="sheet-limit-notice" role="alert">
          {c.selectionLimitReached}
        </p>
      )}
      <div className="sheet-scroll">
        <table className="sheet-grid">
          <caption className="sr-only">{c.management}</caption>
          <colgroup>
            <col className="sheet-number-column" />
            <col className="sheet-checkbox-column" />
            <col className="sheet-shelf-column" />
            <col className="sheet-title-column" />
            <col className="sheet-subject-column" />
            <col className="sheet-author-column" />
            <col className="sheet-actions-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sheet-row-number">
                <span aria-hidden="true">#</span>
                <span className="sr-only">{c.sheetRowNumber}</span>
              </th>
              <th scope="col" className="sheet-checkbox">
                <input
                  type="checkbox"
                  aria-label={c.selectPage}
                  checked={allSelected}
                  ref={(element) => {
                    if (element) element.indeterminate = someSelected && !allSelected;
                  }}
                  disabled={
                    blocked ||
                    (!allSelected && outsidePage.length + items.length > MAX_BOOK_SELECTION)
                  }
                  onChange={() => {
                    anchorId.current = null;
                    setLimitReached(false);
                    onSelect(
                      allSelected
                        ? outsidePage
                        : [...outsidePage, ...items.map(({ id, version }) => ({ id, version }))],
                    );
                  }}
                />
              </th>
              {columns.map(({ field, letter, label }) => (
                <th
                  key={field}
                  scope="col"
                  aria-sort={
                    query.sort === field
                      ? query.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <span className="sheet-column-letter" aria-hidden="true">
                    {letter}
                  </span>
                  <button disabled={blocked} onClick={() => onSort(field)}>
                    {label}
                    {query.sort === field ? (
                      query.direction === 'asc' ? (
                        <ArrowUp aria-hidden="true" />
                      ) : (
                        <ArrowDown aria-hidden="true" />
                      )
                    ) : (
                      <ArrowUpDown aria-hidden="true" />
                    )}
                  </button>
                </th>
              ))}
              <th scope="col" className="sheet-row-actions">
                {c.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((book, index) =>
              editing?.id === book.id ? (
                <CatalogRowEditor
                  key={`${book.id}:${book.version}`}
                  book={editing}
                  number={query.page * query.pageSize + index + 1}
                  height={editingRowHeight}
                  busy={busy}
                  error={editError}
                  onSave={onSave}
                  onCancel={onCancel}
                />
              ) : (
                <tr
                  key={book.id}
                  data-selected={selectedIds.has(book.id) || undefined}
                  aria-selected={selectedIds.has(book.id)}
                  onMouseDown={(event) => {
                    if (
                      !blocked &&
                      event.shiftKey &&
                      event.target instanceof Element &&
                      !event.target.closest(
                        'input, button, a, select, textarea, label, [contenteditable]',
                      )
                    )
                      event.preventDefault();
                  }}
                  onClick={(event) => {
                    if (
                      blocked ||
                      !(event.target instanceof Element) ||
                      event.target.closest(
                        'input, button, a, select, textarea, label, [contenteditable]',
                      )
                    )
                      return;
                    if (!event.shiftKey && window.getSelection()?.isCollapsed === false) return;
                    toggle(book, event.shiftKey || !selectedIds.has(book.id), event.shiftKey);
                  }}
                >
                  <th scope="row" className="sheet-row-number">
                    {query.page * query.pageSize + index + 1}
                  </th>
                  <td className="sheet-checkbox">
                    <input
                      type="checkbox"
                      aria-label={`${c.selectBook}: ${book.title}`}
                      checked={selectedIds.has(book.id)}
                      disabled={
                        blocked ||
                        (!selectedIds.has(book.id) && selected.length >= MAX_BOOK_SELECTION)
                      }
                      title={c.rangeSelectionHint}
                      onClickCapture={(event) => {
                        checkboxShift.current = event.shiftKey;
                      }}
                      onChange={(event) => {
                        const extend = checkboxShift.current;
                        checkboxShift.current = false;
                        toggle(book, event.currentTarget.checked, extend);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === ' ' && event.shiftKey) {
                          event.preventDefault();
                          toggle(book, !selectedIds.has(book.id), true);
                        }
                      }}
                    />
                  </td>
                  <td className="sheet-shelf">
                    <bdi>{book.location.shelf || c.unknown}</bdi>
                  </td>
                  <td className="sheet-book-title">
                    <bdi>{book.title}</bdi>
                  </td>
                  <td>
                    <bdi>{book.subject || c.unknown}</bdi>
                  </td>
                  <td>
                    <bdi>{book.author || c.unknown}</bdi>
                  </td>
                  <td className="sheet-row-actions">
                    <div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={blocked}
                        aria-label={`${c.edit}: ${book.title}`}
                        title={c.edit}
                        onClick={(event) => {
                          setEditingRowHeight(
                            event.currentTarget.closest('tr')?.getBoundingClientRect().height ?? 0,
                          );
                          onEdit(book);
                        }}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        disabled={blocked}
                        aria-label={`${c.delete}: ${book.title}`}
                        title={c.delete}
                        onClick={() => onDelete(book)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
