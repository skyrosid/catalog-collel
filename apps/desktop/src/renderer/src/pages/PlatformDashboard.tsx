import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  CollelDirectory,
  CollelDirectoryEntry,
  GeneratedCredentials,
} from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Confirmation, Credentials, Field, Notice } from '@/components/forms';

type Action = { entry: CollelDirectoryEntry; kind: 'status' | 'admin' | 'access' };
type Reveal = { label: string; value: GeneratedCredentials }[];

function CollelForm({
  entry,
  busy,
  onSave,
  onCancel,
}: {
  entry: CollelDirectoryEntry | null;
  busy: boolean;
  onSave: (input: { name: string; slug: string }) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({ name: String(data.get('name')), slug: String(data.get('slug')) });
  }
  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">{entry ? t.platform.editCollel : t.platform.newCollel}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t.platform.createHint}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
          <Field
            label={t.platform.name}
            name="name"
            defaultValue={entry?.name ?? ''}
            required
            maxLength={200}
            disabled={busy}
            dir="auto"
          />
          <Field
            label={t.platform.slug}
            name="slug"
            defaultValue={entry?.slug ?? ''}
            required
            minLength={2}
            maxLength={80}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            disabled={busy}
            dir="ltr"
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t.platform.slugHint}</p>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t.saving : entry ? t.save : t.platform.newCollel}
          </Button>
          {entry && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="w-full"
              onClick={onCancel}
            >
              {t.cancel}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function PlatformDashboard({ onExpired }: { onExpired: () => void }) {
  const [directory, setDirectory] = useState<CollelDirectory>({ items: [], total: 0 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CollelDirectoryEntry | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);

  useEffect(() => {
    let alive = true;
    void window.catalog
      .listCollels({ search, page })
      .then((result) => {
        if (!alive) return;
        if (result.ok) setDirectory(result.data);
        else {
          setError(t.errors[result.error]);
          if (result.error === 'UNAUTHENTICATED' || result.error === 'FORBIDDEN') onExpired();
        }
      })
      .catch(() => {
        if (alive) setError(t.errors.UNAVAILABLE);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [search, page, refresh, onExpired]);

  function reload() {
    setLoading(true);
    setRefresh((value) => value + 1);
  }
  async function save(input: { name: string; slug: string }) {
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const result = await window.catalog.updateCollel(editing.id, {
          ...input,
          active: editing.active,
        });
        if (!result.ok) {
          setError(t.errors[result.error]);
          return;
        }
      } else {
        const result = await window.catalog.createCollel(input);
        if (!result.ok) {
          setError(t.errors[result.error]);
          return;
        }
        setReveal([
          { label: t.platform.accessAccount, value: result.data.credentials.catalog },
          { label: t.platform.adminAccount, value: result.data.credentials.admin },
        ]);
      }
      setEditing(null);
      reload();
    } catch {
      setError(t.errors.UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const { entry, kind } = action;
      if (kind === 'status') {
        const result = await window.catalog.updateCollel(entry.id, {
          name: entry.name,
          slug: entry.slug,
          active: !entry.active,
        });
        if (!result.ok) {
          setError(t.errors[result.error]);
          return;
        }
      } else {
        const result = await (kind === 'admin'
          ? window.catalog.resetCollelAdmin(entry.id)
          : window.catalog.resetCollelAccess(entry.id));
        if (!result.ok) {
          setError(t.errors[result.error]);
          return;
        }
        setReveal([
          {
            label: kind === 'admin' ? t.platform.adminAccount : t.platform.accessAccount,
            value: result.data,
          },
        ]);
      }
      setEditing(null);
      reload();
    } catch {
      setError(t.errors.UNAVAILABLE);
    } finally {
      setAction(null);
      setBusy(false);
    }
  }
  const actionTitle =
    action?.kind === 'admin'
      ? t.platform.resetAdmin
      : action?.kind === 'access'
        ? t.platform.resetAccess
        : action?.entry.active
          ? t.platform.suspend
          : t.platform.restore;
  const actionDescription =
    action?.kind === 'admin'
      ? t.platform.resetAdminWarning
      : action?.kind === 'access'
        ? t.platform.resetAccessWarning
        : action?.entry.active
          ? t.platform.suspendWarning
          : t.platform.restoreWarning;

  return (
    <div className="space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">{t.platform.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t.platform.subtitle}</p>
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
        <CollelForm
          key={editing?.id ?? `new-${refresh}`}
          entry={editing}
          busy={busy}
          onSave={(input) => void save(input)}
          onCancel={() => setEditing(null)}
        />
        <Card>
          <CardHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                setSearch(String(data.get('search')));
                setPage(0);
                setError(null);
                setLoading(true);
                setRefresh((value) => value + 1);
              }}
              className="flex gap-2"
            >
              <Input
                name="search"
                aria-label={t.platform.search}
                placeholder={t.platform.search}
                maxLength={100}
                disabled={busy}
              />
              <Button type="submit" variant="outline" disabled={busy}>
                {t.platform.searchButton}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              {directory.total} {t.platform.total}
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p role="status" className="py-8 text-sm text-muted-foreground">
                {t.loading}
              </p>
            ) : directory.items.length === 0 ? (
              <div className="space-y-2 py-10 text-center">
                <p>{t.platform.empty}</p>
                <p className="text-sm text-muted-foreground">{t.platform.emptyHint}</p>
              </div>
            ) : (
              <ul className="divide-y">
                {directory.items.map((entry) => (
                  <li key={entry.id} className="space-y-4 py-5 first:pt-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="font-semibold">
                          <bdi>{entry.name}</bdi>
                        </h2>
                        <p dir="ltr" className="mt-1 text-start text-xs text-muted-foreground">
                          {entry.slug}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${entry.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                      >
                        {entry.active ? t.platform.active : t.platform.suspended}
                      </span>
                    </div>
                    <dl className="grid gap-2 rounded-md bg-muted/60 p-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">{t.platform.accessAccount}</dt>
                        <dd dir="ltr" className="mt-1 text-start">
                          {entry.access?.login ?? t.platform.noAccessAccount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">{t.platform.adminAccount}</dt>
                        <dd dir="ltr" className="mt-1 text-start">
                          {entry.admin.login}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditing(entry);
                          setError(null);
                        }}
                      >
                        {t.platform.edit}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setAction({ entry, kind: 'status' })}
                      >
                        {entry.active ? t.platform.suspend : t.platform.restore}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setAction({ entry, kind: 'access' })}
                      >
                        {t.platform.resetAccess}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setAction({ entry, kind: 'admin' })}
                      >
                        {t.platform.resetAdmin}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0 || loading || busy}
                onClick={() => {
                  setPage((value) => value - 1);
                  setLoading(true);
                }}
              >
                {t.platform.previous}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t.platform.page} {page + 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={(page + 1) * 20 >= directory.total || loading || busy}
                onClick={() => {
                  setPage((value) => value + 1);
                  setLoading(true);
                }}
              >
                {t.platform.next}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {action && (
        <Confirmation
          title={`${actionTitle} · ${action.entry.name}`}
          description={actionDescription}
          busy={busy}
          onConfirm={() => void confirm()}
          onClose={() => setAction(null)}
        />
      )}
      {reveal && <Credentials entries={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}
