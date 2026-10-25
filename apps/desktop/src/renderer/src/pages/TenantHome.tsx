import { useEffect, useState } from 'react';
import type { Collel, Session } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Notice } from '@/components/forms';

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
    <Card className="mx-auto my-12 w-full max-w-xl">
      <CardHeader>
        <h1 className="text-2xl font-semibold">
          <bdi>{collel?.name ?? member?.name}</bdi>
        </h1>
        <p className="text-sm text-muted-foreground">
          {member?.role === 'admin' ? t.administration : t.activated}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <Notice>{error}</Notice>}
        {session.memberships.length > 1 && (
          <label className="block space-y-2 text-sm">
            <span>{t.select}</span>
            <select
              value={id}
              onChange={(event) => {
                setId(event.target.value);
                setCollel(null);
                setError(null);
              }}
              className="h-10 w-full rounded-md border bg-background px-3"
            >
              {session.memberships.map((membership) => (
                <option key={membership.collelId} value={membership.collelId}>
                  {membership.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="rounded-md bg-muted p-4 text-sm" role="status">
          {collel ? (member?.role === 'admin' ? t.adminReady : t.connected) : t.checking}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t.foundation}</p>
      </CardContent>
    </Card>
  );
}
