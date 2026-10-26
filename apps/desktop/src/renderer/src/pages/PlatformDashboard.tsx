import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type {
  CollelDirectory,
  CollelDirectoryEntry,
  GeneratedCredentials,
} from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EmptyState, PageHeader } from '@/components/page-layout';
import {
  Confirmation,
  Credentials,
  Field,
  FormActions,
  Loading,
  Modal,
  Notice,
} from '@/components/forms';

type Action = { entry: CollelDirectoryEntry; kind: 'status' | 'admin' | 'access' | 'delete' };
type Reveal = { label: string; value: GeneratedCredentials }[];

function CollelForm({
  entry,
  busy,
  error,
  onSave,
  onCancel,
}: {
  entry: CollelDirectoryEntry | null;
  busy: boolean;
  error: string | null;
  onSave: (input: { name: string; slug: string }) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({ name: String(data.get('name')), slug: String(data.get('slug')) });
  }
  return (
    <Modal
      title={entry ? t.platform.editCollel : t.platform.newCollel}
      {...(!entry ? { description: t.platform.createHint } : {})}
      busy={busy}
      onCancel={onCancel}
    >
      <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
        {error && <Notice>{error}</Notice>}
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
          hint={t.platform.slugHint}
          name="slug"
          defaultValue={entry?.slug ?? ''}
          required
          minLength={2}
          maxLength={80}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          disabled={busy}
          dir="ltr"
        />
        <FormActions>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t.saving : entry ? t.save : t.platform.newCollel}
          </Button>
        </FormActions>
      </form>
    </Modal>
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
  const [formOpen, setFormOpen] = useState(false);
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
      setFormOpen(false);
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
      if (kind === 'delete') {
        const result = await window.catalog.deleteCollel(entry.id, { slug: entry.slug });
        if (!result.ok) {
          setError(t.errors[result.error]);
          return;
        }
        setPage(0);
      } else if (kind === 'status') {
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
    action?.kind === 'delete'
      ? t.platform.delete
      : action?.kind === 'admin'
        ? t.platform.resetAdmin
        : action?.kind === 'access'
          ? t.platform.resetAccess
          : action?.entry.active
            ? t.platform.suspend
            : t.platform.restore;
  const actionDescription =
    action?.kind === 'delete'
      ? t.platform.deleteWarning
      : action?.kind === 'admin'
        ? t.platform.resetAdminWarning
        : action?.kind === 'access'
          ? t.platform.resetAccessWarning
          : action?.entry.active
            ? t.platform.suspendWarning
            : t.platform.restoreWarning;

  return (
    <div className="space-y-6">
      <PageHeader title={t.platform.directory}>
        <Button
          disabled={busy}
          onClick={() => {
            setEditing(null);
            setError(null);
            setFormOpen(true);
          }}
        >
          <Plus aria-hidden="true" />
          {t.platform.newCollel}
        </Button>
      </PageHeader>
      {error && !formOpen && <Notice>{error}</Notice>}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5 sm:p-6">
          <p className="text-sm text-muted-foreground">
            {directory.total} {t.platform.total}
          </p>
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
            className="flex w-full gap-2 sm:w-auto"
          >
            <div className="relative min-w-0 flex-1 sm:w-64">
              <Search
                className="pointer-events-none absolute start-3 top-3 size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                name="search"
                aria-label={t.platform.search}
                placeholder={t.platform.search}
                maxLength={100}
                disabled={busy}
                className="ps-10"
              />
            </div>
            <Button type="submit" variant="outline" disabled={busy}>
              {t.platform.searchButton}
            </Button>
          </form>
        </div>
        <div aria-busy={loading}>
          {loading ? (
            <Loading />
          ) : directory.items.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={t.platform.empty}
              description={t.platform.emptyHint}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="library-table w-full min-w-[700px] text-start text-sm">
                <caption className="sr-only">{t.platform.directory}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t.platform.nameColumn}</th>
                    <th scope="col">{t.platform.statusColumn}</th>
                    <th scope="col">{t.platform.accessShort}</th>
                    <th scope="col">{t.platform.adminShort}</th>
                    <th scope="col" className="w-16">
                      <span className="sr-only">{t.platform.actionsColumn}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {directory.items.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-background/60">
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-primary/10 bg-accent/50 text-primary">
                            <Building2 className="size-4" aria-hidden="true" />
                          </span>
                          <div>
                            <h3 className="font-semibold">
                              <bdi>{entry.name}</bdi>
                            </h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              <bdi className="font-mono">{entry.slug}</bdi>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={entry.active ? 'success' : 'neutral'}>
                          <span
                            className={`size-1.5 rounded-full ${entry.active ? 'bg-sage' : 'bg-muted-foreground'}`}
                          />
                          {entry.active ? t.platform.active : t.platform.suspended}
                        </Badge>
                      </td>
                      <td>
                        <bdi className="font-mono text-xs text-muted-foreground">
                          {entry.access?.login ?? t.platform.noAccessAccount}
                        </bdi>
                      </td>
                      <td>
                        <bdi className="font-mono text-xs text-muted-foreground">
                          {entry.admin.login}
                        </bdi>
                      </td>
                      <td>
                        <DropdownMenu dir="rtl">
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={busy}
                              aria-label={`${t.platform.actionsHint} · ${entry.name}`}
                              title={t.platform.actionsHint}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>
                              <bdi>{entry.name}</bdi>
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(entry);
                                setError(null);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil aria-hidden="true" />
                              {t.platform.edit}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setAction({ entry, kind: 'status' })}>
                              {entry.active ? (
                                <Pause aria-hidden="true" />
                              ) : (
                                <Play aria-hidden="true" />
                              )}
                              {entry.active ? t.platform.suspend : t.platform.restore}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => setAction({ entry, kind: 'access' })}>
                              <KeyRound aria-hidden="true" />
                              {t.platform.resetAccess}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setAction({ entry, kind: 'admin' })}>
                              <ShieldCheck aria-hidden="true" />
                              {t.platform.resetAdmin}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive
                              onSelect={() => setAction({ entry, kind: 'delete' })}
                            >
                              <Trash2 aria-hidden="true" />
                              {t.platform.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t bg-background/40 px-5 py-4">
          <span className="text-xs text-muted-foreground">
            {t.platform.page} {page + 1}
          </span>
          <nav aria-label={t.platform.page} className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={page === 0 || loading || busy}
              onClick={() => {
                setPage((value) => value - 1);
                setLoading(true);
              }}
            >
              <ChevronRight aria-hidden="true" />
              {t.platform.previous}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={(page + 1) * 20 >= directory.total || loading || busy}
              onClick={() => {
                setPage((value) => value + 1);
                setLoading(true);
              }}
            >
              {t.platform.next}
              <ChevronLeft aria-hidden="true" />
            </Button>
          </nav>
        </div>
      </Card>
      {formOpen && (
        <CollelForm
          key={editing?.id ?? 'new'}
          entry={editing}
          busy={busy}
          error={error}
          onSave={(input) => void save(input)}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
            setError(null);
          }}
        />
      )}
      {action && (
        <Confirmation
          title={`${actionTitle} · ${action.entry.name}`}
          description={actionDescription}
          {...(action.kind === 'delete'
            ? { confirmationText: action.entry.slug, destructive: true }
            : {})}
          busy={busy}
          onConfirm={() => void confirm()}
          onClose={() => setAction(null)}
        />
      )}
      {reveal && <Credentials entries={reveal} onClose={() => setReveal(null)} />}
    </div>
  );
}
