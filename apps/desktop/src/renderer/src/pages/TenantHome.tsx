import { useEffect, useState } from 'react';
import { BookOpen, Check, ChevronDown } from 'lucide-react';
import type { Collel, Session } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading, Notice } from '@/components/forms';
import { EmptyState, PageHeader } from '@/components/page-layout';

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
      <PageHeader
        title={<bdi>{collel?.name ?? member?.name}</bdi>}
        description={member?.role === 'admin' ? t.administration : t.interface.library}
      >
        <div className="flex flex-wrap items-center gap-3">
          {session.memberships.length > 1 && (
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
          )}
          {collel && (
            <Badge tone="success">
              <Check aria-hidden="true" />
              {t.connected}
            </Badge>
          )}
        </div>
      </PageHeader>
      {error ? (
        <Notice>{error}</Notice>
      ) : (
        <Card>
          {collel ? (
            <EmptyState
              icon={BookOpen}
              title={t.interface.catalogEmptyTitle}
              description={t.interface.catalogEmptyDescription}
            />
          ) : (
            <Loading />
          )}
        </Card>
      )}
    </div>
  );
}
