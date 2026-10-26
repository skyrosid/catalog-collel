import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileSpreadsheet,
  Info,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import type {
  Book,
  BookDirectory,
  BookInput,
  BookReference,
  CatalogQuery,
  ImportPreview,
  Result,
} from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Confirmation, Loading, Modal, Notice } from '@/components/forms';
import { EmptyState } from '@/components/page-layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CatalogMasthead } from '@/components/catalog-masthead';
import { CatalogSheet } from '@/components/catalog-sheet';
import { CatalogBooklet } from '@/components/catalog-booklet';
import {
  BulkBookForm,
  BookForm,
  BookImportReview,
  MoveBooksForm,
} from '@/components/catalog-forms';

const c = t.catalog;
const sortFields = ['title', 'author', 'subject', 'location'] as const;
const sortLabel = {
  title: c.titleField,
  author: c.author,
  subject: c.subject,
  location: c.location,
};

function CatalogNavigation({
  page,
  pages,
  disabled,
  onPage,
}: {
  page: number;
  pages: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      aria-label={c.pagination}
      className="catalog-navigation flex items-center gap-2 text-xs text-muted-foreground"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled || page === 0}
        onClick={() => onPage(0)}
        aria-label={c.firstPage}
        title={c.firstPage}
      >
        <ChevronsRight aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || page === 0}
        onClick={() => onPage(page - 1)}
      >
        <ChevronRight aria-hidden="true" />
        {c.previous}
      </Button>
      <span className="catalog-page-indicator">
        <span className="sr-only">{c.page}</span>
        <strong aria-current="page">{page + 1}</strong>
        <span>
          {c.of} {pages}
        </span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || page + 1 >= pages}
        onClick={() => onPage(page + 1)}
      >
        {c.next}
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled || page + 1 >= pages}
        onClick={() => onPage(pages - 1)}
        aria-label={c.lastPage}
        title={c.lastPage}
      >
        <ChevronsLeft aria-hidden="true" />
      </Button>
    </nav>
  );
}

function CatalogStatusBar({
  query,
  total,
  disabled,
  onPage,
  onPageSize,
}: {
  query: CatalogQuery;
  total: number;
  disabled: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: CatalogQuery['pageSize']) => void;
}) {
  const start = total ? query.page * query.pageSize + 1 : 0;
  const end = Math.min((query.page + 1) * query.pageSize, total);
  return (
    <div className="sheet-statusbar">
      <p role="status" aria-live="polite">
        <strong>
          <bdi dir="ltr">
            {start}–{end}
          </bdi>
        </strong>{' '}
        {c.of} {total.toLocaleString('he-IL')} {total === 1 ? c.bookSingle : c.books}
      </p>
      <div>
        <label>
          {c.perPage}
          <select
            className="catalog-select"
            value={query.pageSize}
            disabled={disabled}
            onChange={(event) => onPageSize(Number(event.target.value) as CatalogQuery['pageSize'])}
          >
            {[12, 24, 48].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <CatalogNavigation
          page={query.page}
          pages={Math.max(1, Math.ceil(total / query.pageSize))}
          disabled={disabled}
          onPage={onPage}
        />
      </div>
    </div>
  );
}

export function CatalogPage({
  collelId,
  name,
  admin,
  onExpired,
}: {
  collelId: string;
  name: string;
  admin: boolean;
  onExpired: () => void;
}) {
  const [query, setQuery] = useState<CatalogQuery>({
    search: '',
    page: 0,
    pageSize: admin ? 24 : 12,
    sort: 'title',
    direction: 'asc',
  });
  const [term, setTerm] = useState('');
  const [directory, setDirectory] = useState<BookDirectory>({ items: [], total: 0 });
  const [loadedQuery, setLoadedQuery] = useState(query);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ book: Book | null } | null>(null);
  const [deleting, setDeleting] = useState<Book | null>(null);
  const [selected, setSelected] = useState<BookReference[]>([]);
  const [moving, setMoving] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importHelp, setImportHelp] = useState(false);
  const resultsAnchor = useRef<HTMLElement>(null);
  const scrollToResults = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    void window.catalog
      .listBooks(collelId, query)
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          const lastPage = Math.max(0, Math.ceil(result.data.total / query.pageSize) - 1);
          if (query.page > lastPage) {
            setQuery({ ...query, page: lastPage });
            return;
          }
          setDirectory(result.data);
          setLoadedQuery(query);
          setError(null);
        } else {
          setError(t.errors[result.error]);
          if (result.error === 'UNAUTHENTICATED' || result.error === 'FORBIDDEN') onExpired();
        }
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setError(t.errors.UNAVAILABLE);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [collelId, query, revision, onExpired]);
  useEffect(() => {
    if (!loading && scrollToResults.current) {
      resultsAnchor.current?.scrollIntoView({ block: 'start' });
      scrollToResults.current = false;
    }
  }, [loading]);

  function changeQuery(next: Partial<CatalogQuery>) {
    if (
      (next.search !== undefined && next.search !== query.search) ||
      (next.sort !== undefined && next.sort !== query.sort) ||
      (next.direction !== undefined && next.direction !== query.direction)
    )
      setSelected([]);
    setLoading(true);
    setQuery({ ...query, page: 0, ...next });
  }
  function refresh() {
    setSelected([]);
    setLoading(true);
    setRevision((value) => value + 1);
  }
  function close() {
    setForm(null);
    setDeleting(null);
    setMoving(false);
    setBulkEditing(false);
    setBulkDeleting(false);
    setPreview(null);
    setImportHelp(false);
    setActionError(null);
  }
  async function execute<T>(task: () => Promise<Result<T>>, done: (data: T) => void) {
    setBusy(true);
    setActionError(null);
    setMessage(null);
    try {
      const result = await task();
      if (result.ok) done(result.data);
      else {
        setActionError(result.error === 'CONFLICT' ? c.conflict : t.errors[result.error]);
        if (result.error === 'UNAUTHENTICATED' || result.error === 'FORBIDDEN') onExpired();
      }
    } catch {
      setActionError(t.errors.UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }
  function saved(message: string) {
    close();
    setMessage(message);
    refresh();
  }
  function saveBook(input: BookInput) {
    void execute(
      () =>
        form?.book
          ? window.catalog.updateBook(collelId, form.book.id, { input, version: form.book.version })
          : window.catalog.createBook(collelId, input),
      () => saved(c.saved),
    );
  }
  function turn(page: number) {
    scrollToResults.current = true;
    changeQuery({ page });
  }
  function resize(pageSize: CatalogQuery['pageSize']) {
    scrollToResults.current = true;
    changeQuery({ pageSize, page: Math.floor((query.page * query.pageSize) / pageSize) });
  }
  function clearSearch() {
    setTerm('');
    changeQuery({ search: '' });
    searchInput.current?.focus();
  }
  function sort(field: CatalogQuery['sort']) {
    changeQuery({
      sort: field,
      direction: query.sort === field && query.direction === 'asc' ? 'desc' : 'asc',
    });
  }
  const displayQuery = !admin && loading ? loadedQuery : query;
  const editing = form?.book ?? null;
  const disabled = loading || busy || editing !== null;
  return (
    <div className="catalog-workspace" data-mode={admin ? 'admin' : 'visitor'}>
      <CatalogMasthead name={name} admin={admin}>
        {admin && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="hero-action-secondary"
              disabled={disabled}
              onClick={() =>
                void execute(
                  () => window.catalog.chooseBookImport(collelId),
                  (value) => {
                    if (value) setPreview(value);
                  },
                )
              }
            >
              <FileSpreadsheet aria-hidden="true" />
              {c.import}
            </Button>
            <Button
              variant="outline"
              className="hero-action-secondary"
              disabled={busy || editing !== null}
              onClick={() =>
                void execute(
                  () => window.catalog.saveBookTemplate(collelId),
                  () => {},
                )
              }
            >
              <Download aria-hidden="true" />
              {c.template}
            </Button>
            <Button
              variant="outline"
              className="hero-action-secondary"
              disabled={busy || editing !== null}
              onClick={() => setImportHelp(true)}
            >
              <Info aria-hidden="true" />
              {c.importGuide}
            </Button>
            <Button
              className="hero-action-primary"
              disabled={disabled}
              onClick={() => {
                setActionError(null);
                setForm({ book: null });
              }}
            >
              <Plus aria-hidden="true" />
              {c.newBook}
            </Button>
          </div>
        )}
      </CatalogMasthead>
      <div className="catalog-toolbar">
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            changeQuery({ search: term.trim() });
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchInput}
              type="search"
              aria-label={c.searchLabel}
              placeholder={c.search}
              value={term}
              maxLength={100}
              onChange={(event) => setTerm(event.target.value)}
              className="catalog-search-input ps-10 pe-10"
              disabled={busy || editing !== null}
            />
            {(term || query.search) && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute end-1 top-1"
                aria-label={c.clear}
                title={c.clear}
                disabled={busy || editing !== null}
                onClick={clearSearch}
              >
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
          <Button className="catalog-search-submit" disabled={busy || editing !== null}>
            {c.searchSubmit}
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{c.sort}</span>
            <select
              className="catalog-select"
              value={query.sort}
              disabled={disabled}
              onChange={(event) =>
                changeQuery({ sort: event.target.value as CatalogQuery['sort'] })
              }
            >
              {sortFields.map((field) => (
                <option key={field} value={field}>
                  {sortLabel[field]}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={query.direction === 'asc' ? c.descending : c.ascending}
            onClick={() => changeQuery({ direction: query.direction === 'asc' ? 'desc' : 'asc' })}
          >
            {query.direction === 'asc' ? (
              <ArrowUp aria-hidden="true" />
            ) : (
              <ArrowDown aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={c.refresh}
            onClick={refresh}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
      </div>
      {message && (
        <p
          role="status"
          className="rounded-lg border border-sage/20 bg-sage-light p-4 text-sm text-sage"
        >
          {message}
        </p>
      )}
      {actionError &&
        !form &&
        !moving &&
        !preview &&
        !deleting &&
        !bulkEditing &&
        !bulkDeleting && <Notice>{actionError}</Notice>}
      {error ? (
        <div className="space-y-3">
          <Notice>{error}</Notice>
          <Button variant="outline" onClick={refresh}>
            {t.retry}
          </Button>
        </div>
      ) : (
        <section
          className="catalog-results"
          ref={resultsAnchor}
          aria-busy={loading}
          aria-label={c.title}
        >
          {(!loading || !admin) && directory.total > 0 && (
            <div className="catalog-results-heading">
              <div className="catalog-results-count">
                <BookOpen aria-hidden="true" />
                <h2>{admin ? c.management : displayQuery.search ? c.results : c.collection}</h2>
                {!admin && (
                  <span>
                    {directory.total.toLocaleString('he-IL')}{' '}
                    {directory.total === 1 ? c.bookSingle : c.books}
                  </span>
                )}
              </div>
              {displayQuery.search && (
                <p className="catalog-search-context">
                  {c.searchFor} <bdi>{displayQuery.search}</bdi>
                </p>
              )}
            </div>
          )}
          {loading && (admin || directory.items.length === 0) ? (
            <div className="rounded-xl border bg-card py-16">
              <Loading />
            </div>
          ) : directory.items.length === 0 ? (
            <div className="rounded-xl border bg-card">
              <EmptyState
                icon={BookOpen}
                title={query.search ? c.noResults : c.empty}
                description={query.search ? c.noResultsHint : admin ? c.emptyAdmin : c.emptyVisitor}
              />
              {query.search && (
                <div className="catalog-empty-action">
                  <Button variant="outline" onClick={clearSearch}>
                    {c.backToCollection}
                  </Button>
                </div>
              )}
            </div>
          ) : admin ? (
            <CatalogSheet
              items={directory.items}
              query={query}
              selected={selected}
              busy={busy}
              editing={editing}
              editError={actionError}
              onSave={saveBook}
              onCancel={close}
              footer={
                <CatalogStatusBar
                  query={query}
                  total={directory.total}
                  disabled={disabled}
                  onPage={turn}
                  onPageSize={resize}
                />
              }
              onSelect={setSelected}
              onSort={sort}
              onEdit={(book) => {
                setActionError(null);
                setForm({ book });
              }}
              onDelete={(book) => {
                setActionError(null);
                setDeleting(book);
              }}
              onMove={() => {
                setActionError(null);
                setMoving(true);
              }}
              onBulkEdit={() => {
                setActionError(null);
                setBulkEditing(true);
              }}
              onBulkDelete={() => {
                setActionError(null);
                setBulkDeleting(true);
              }}
            />
          ) : (
            <div className="catalog-reader" data-loading={loading || undefined}>
              <CatalogBooklet items={directory.items} query={displayQuery} name={name} />
              {loading && (
                <div className="catalog-reader-loading" role="status">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  {t.loading}
                </div>
              )}
              <CatalogStatusBar
                query={displayQuery}
                total={directory.total}
                disabled={disabled}
                onPage={turn}
                onPageSize={resize}
              />
            </div>
          )}
          {!loading && directory.items.length === 0 && (
            <CatalogStatusBar
              query={query}
              total={directory.total}
              disabled={disabled}
              onPage={turn}
              onPageSize={resize}
            />
          )}
        </section>
      )}
      {importHelp && (
        <Modal title={c.importGuide} onCancel={() => setImportHelp(false)}>
          <div className="space-y-5 text-sm leading-7">
            <p>{c.importHint}</p>
            <p className="text-muted-foreground">{c.duplicateHint}</p>
            <div className="flex justify-end border-t pt-4">
              <Button onClick={() => setImportHelp(false)}>{t.interface.close}</Button>
            </div>
          </div>
        </Modal>
      )}
      {bulkEditing && (
        <BulkBookForm
          count={selected.length}
          busy={busy}
          error={actionError}
          onClose={close}
          onSave={(patch) =>
            void execute(
              () =>
                window.catalog.bulkBooks(collelId, { action: 'update', books: selected, patch }),
              () => saved(c.bulkUpdated),
            )
          }
        />
      )}
      {bulkDeleting && (
        <Confirmation
          title={`${c.bulkDelete} · ${selected.length}`}
          description={c.bulkDeleteWarning}
          confirmLabel={c.deleteConfirm}
          error={actionError}
          busy={busy}
          destructive
          onClose={close}
          onConfirm={() =>
            void execute(
              () => window.catalog.bulkBooks(collelId, { action: 'delete', books: selected }),
              () => saved(c.bulkDeleted),
            )
          }
        />
      )}
      {form && !form.book && (
        <BookForm
          key="new"
          book={form.book}
          error={actionError}
          busy={busy}
          onSave={saveBook}
          onClose={close}
        />
      )}
      {deleting && (
        <Confirmation
          title={`${c.delete} · ${deleting.title}`}
          description={c.deleteWarning}
          confirmLabel={c.deleteConfirm}
          error={actionError}
          destructive
          busy={busy}
          onClose={close}
          onConfirm={() =>
            void execute(
              () =>
                window.catalog.deleteBook(collelId, { id: deleting.id, version: deleting.version }),
              () => saved(c.deleted),
            )
          }
        />
      )}
      {moving && (
        <MoveBooksForm
          books={selected}
          busy={busy}
          error={actionError}
          onClose={close}
          onSave={(location) =>
            void execute(
              () => window.catalog.moveBooks(collelId, { books: selected, location }),
              () => saved(c.moved),
            )
          }
        />
      )}
      {preview && (
        <BookImportReview
          preview={preview}
          busy={busy}
          error={actionError}
          onClose={close}
          onImport={() =>
            void execute(
              () => window.catalog.importBooks(collelId, preview.books),
              (summary) =>
                saved(
                  `${summary.added.toLocaleString('he-IL')} ${c.added} · ${summary.skipped.toLocaleString('he-IL')} ${c.skipped}`,
                ),
            )
          }
        />
      )}
    </div>
  );
}
