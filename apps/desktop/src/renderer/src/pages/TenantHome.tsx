import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Collel, Session } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Loading, Notice } from '@/components/forms';
import { CatalogPage } from './CatalogPage';

export function TenantHome({ session, onExpired }: { session: Session; onExpired: () => void }) {
  const [id, setId] = useState(session.memberships[0]?.collelId ?? '');
  const [collel, setCollel] = useState<Collel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const member = session.memberships.find((membership) => membership.collelId === id);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void window.catalog
      .collel(id)
      .then((result) => {
        if (!alive) return;
        if (result.ok) setCollel(result.data);
        else {
          setError(t.errors[result.error]);
          if (result.error === 'UNAUTHENTICATED' || result.error === 'FORBIDDEN') onExpired();
        }
      })
      .catch(() => {
        if (alive) setError(t.errors.UNAVAILABLE);
      });
    return () => {
      alive = false;
    };
  }, [id, onExpired]);
  return (
    <div className="space-y-6">
      {session.memberships.length > 1 && (
        <div className="flex justify-end">
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{t.select}</span>
            <span className="relative">
              <select
                value={id}
                onChange={(event) => {
                  setId(event.target.value);
                  setCollel(null);
                  setError(null);
                }}
                className="h-10 max-w-64 appearance-none rounded-lg border border-input bg-card pe-9 ps-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
              >
                {session.memberships.map((membership) => (
                  <option key={membership.collelId} value={membership.collelId}>
                    {membership.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute end-3 top-3 size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
          </label>
        </div>
      )}
      {error ? (
        <Notice>{error}</Notice>
      ) : collel ? (
        <CatalogPage
          key={`${id}:${member?.role}`}
          collelId={id}
          name={collel.name}
          admin={member?.role === 'admin'}
          onExpired={onExpired}
        />
      ) : (
        <Loading />
      )}
    </div>
  );
}
