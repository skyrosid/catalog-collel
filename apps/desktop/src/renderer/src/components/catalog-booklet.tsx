import { Fragment } from 'react';
import { MapPin } from 'lucide-react';
import type { Book, CatalogQuery } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { findBookSearchMatches } from '@/lib/catalog-highlight';

const c = t.catalog;

function BookText({ value, search }: { value: string; search: string }) {
  const matches = findBookSearchMatches(value, search);
  let previous = 0;
  return (
    <bdi>
      {matches.map(({ start, end }) => {
        const prefix = value.slice(previous, start);
        previous = end;
        return (
          <Fragment key={start}>
            {prefix}
            <mark>{value.slice(start, end)}</mark>
          </Fragment>
        );
      })}
      {value.slice(previous)}
    </bdi>
  );
}

export function CatalogBooklet({
  items,
  query,
  name,
}: {
  items: Book[];
  query: CatalogQuery;
  name: string;
}) {
  const split = items.length > query.pageSize / 2 ? Math.ceil(items.length / 2) : items.length;
  const pages = [items.slice(0, split), items.slice(split)].filter((page) => page.length);
  const first = query.page * query.pageSize + 1;
  return (
    <div className="booklet-cover" data-single={pages.length === 1 || undefined}>
      <span className="booklet-ribbon" aria-hidden="true" />
      <div className="booklet">
        {pages.map((books, pageIndex) => {
          const start = first + pageIndex * split;
          const folio = query.page * 2 + pageIndex + 1;
          return (
            <section key={pageIndex} className="booklet-page" aria-label={`${c.page} ${folio}`}>
              <div className="booklet-running-head">
                <bdi>{name}</bdi>
                <span className="booklet-running-label">
                  {c.books}{' '}
                  <bdi dir="ltr">
                    {start}–{start + books.length - 1}
                  </bdi>
                </span>
              </div>
              <ol className="booklet-entries" start={start}>
                {books.map((book, index) => (
                  <li key={book.id}>
                    <article className="booklet-entry" aria-labelledby={`book-${book.id}`}>
                      <div className="booklet-entry-copy">
                        <div className="booklet-entry-heading">
                          <span className="booklet-number" aria-hidden="true">
                            {String(start + index).padStart(3, '0')}
                          </span>
                          <h3 id={`book-${book.id}`} className="booklet-entry-title">
                            <BookText value={book.title} search={query.search} />
                          </h3>
                        </div>
                        <dl className="booklet-metadata">
                          {[
                            [c.authorLabel, book.author],
                            [c.subjectLabel, book.subject],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd data-unknown={!value || undefined}>
                                <BookText
                                  value={value || c.unknown}
                                  search={value ? query.search : ''}
                                />
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      <dl
                        className="booklet-location"
                        data-unknown={!book.location.shelf || undefined}
                      >
                        <dt>
                          <MapPin aria-hidden="true" />
                          {c.shelfMark}
                        </dt>
                        <dd>
                          <bdi>{book.location.shelf || c.unknown}</bdi>
                        </dd>
                      </dl>
                    </article>
                  </li>
                ))}
              </ol>
              <div className="booklet-folio" aria-hidden="true">
                <span />
                {folio}
                <span />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
