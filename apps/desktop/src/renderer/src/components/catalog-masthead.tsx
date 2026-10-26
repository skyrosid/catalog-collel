import type { ReactNode } from 'react';
import { BookOpen, ShieldCheck } from 'lucide-react';
import { texts as t } from '../../../shared/texts';
import { LibraryIllustration } from './library-art';

export function CatalogMasthead({
  name,
  admin,
  children,
}: {
  name: string;
  admin: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="catalog-masthead">
      <div className="catalog-masthead-copy">
        <p className="catalog-eyebrow">
          <span aria-hidden="true" />
          {t.catalog.libraryEyebrow}
        </p>
        <h1>
          <bdi>{name}</bdi>
        </h1>
        <p className="catalog-masthead-description">
          {admin ? t.catalog.adminHint : t.catalog.visitorHint}
        </p>
        <div className="catalog-masthead-bottom">
          <span className="catalog-access-label">
            {admin ? <ShieldCheck aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
            {admin ? t.interface.libraryRole : t.catalog.readingMode}
          </span>
          {children && <div className="catalog-masthead-actions">{children}</div>}
        </div>
      </div>
      <div className="catalog-masthead-art" aria-hidden="true">
        <LibraryIllustration />
      </div>
    </header>
  );
}
