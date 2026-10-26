import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, KeyRound, Monitor } from 'lucide-react';
import type { Session } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Button } from '@/components/ui/button';
import { Field, Notice, PasswordField } from '@/components/forms';
import { LibraryIllustration } from '@/components/library-art';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-layout';
import { cn } from '@/lib/utils';

export type LoginMode = 'catalog' | 'admin' | 'platform';
export function LoginPage({
  mode,
  navigate,
  onSession,
}: {
  mode: LoginMode;
  navigate: (mode: LoginMode) => void;
  onSession: (session: Session) => void;
}) {
  const [required, setRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setup = mode === 'platform' && required === true;
  const title = setup ? t.setupTitle : mode === 'platform' ? t.platformAccess : t.signIn;
  const description = setup
    ? t.setupDescription
    : mode === 'catalog'
      ? t.activationDescription
      : mode === 'admin'
        ? t.adminDescription
        : t.interface.platformDescription;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = { login: String(data.get('login')), password: String(data.get('password')) };
    if (setup && input.password !== data.get('confirm')) {
      setError(t.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'platform' && !setup) {
        const status = await window.catalog.setupStatus();
        if (!status.ok) {
          setError(t.errors[status.error]);
          return;
        }
        if (status.data.required) {
          setRequired(true);
          return;
        }
      }
      const result = await (setup
        ? window.catalog.setup(input)
        : mode === 'platform'
          ? window.catalog.platformLogin(input)
          : mode === 'admin'
            ? window.catalog.login(input)
            : window.catalog.activate(input));
      form.reset();
      if (result.ok) {
        onSession(result.data);
      } else {
        setError(t.errors[result.error]);
        if (result.error === 'SETUP_COMPLETE') {
          setRequired(false);
        }
      }
    } catch {
      setError(t.errors.UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mx-auto my-auto w-full max-w-4xl overflow-hidden">
      <div className="grid md:grid-cols-2">
        <section className="space-y-6 p-6 sm:p-8">
          <PageHeader title={title} />
          {mode !== 'platform' && (
            <nav
              aria-label={t.signIn}
              className="grid grid-cols-2 gap-1 rounded-lg border bg-background p-1"
            >
              {(['catalog', 'admin'] as const).map((value) => {
                const Icon = value === 'catalog' ? Monitor : KeyRound;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-current={mode === value ? 'page' : undefined}
                    className={cn(
                      'flex h-10 items-center justify-center gap-2 rounded-md border text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                      mode === value
                        ? 'border-border bg-card font-medium text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                    disabled={busy}
                    onClick={() => navigate(value)}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {value === 'catalog' ? t.interface.catalogRole : t.interface.libraryRole}
                  </button>
                );
              })}
            </nav>
          )}
          {description && <p className="text-sm leading-6 text-muted-foreground">{description}</p>}
          <form onSubmit={(event) => void submit(event)} className="space-y-5" aria-busy={busy}>
            {error && <Notice>{error}</Notice>}
            <Field
              label={t.login}
              name="login"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              minLength={3}
              maxLength={254}
              required
              disabled={busy}
              dir="ltr"
            />
            <PasswordField
              label={t.password}
              {...(setup ? { hint: t.passwordHint } : {})}
              name="password"
              autoComplete={setup ? 'new-password' : 'current-password'}
              minLength={setup ? 15 : 1}
              maxLength={128}
              required
              disabled={busy}
            />
            {setup && (
              <>
                <PasswordField
                  label={t.confirmPassword}
                  name="confirm"
                  autoComplete="new-password"
                  minLength={15}
                  maxLength={128}
                  required
                  disabled={busy}
                />
              </>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? t.pending
                : setup
                  ? t.setupSubmit
                  : mode === 'catalog'
                    ? t.activate
                    : t.submit}
              <ArrowLeft aria-hidden="true" />
            </Button>
          </form>
          <div className="flex justify-center border-t pt-5">
            <Button
              type="button"
              size="sm"
              variant="link"
              className="h-auto p-0 text-muted-foreground"
              disabled={busy}
              onClick={() => navigate(mode === 'platform' ? 'catalog' : 'platform')}
            >
              {mode === 'platform' && <ArrowRight aria-hidden="true" />}
              {mode === 'platform' ? t.back : t.platformAccess}
            </Button>
          </div>
        </section>
        <figure className="hidden flex-col items-center justify-center gap-6 border-s border-sidebar bg-sidebar p-8 md:flex">
          <LibraryIllustration className="w-full max-w-sm" />
          <figcaption className="space-y-3 text-center">
            <p className="font-display text-2xl font-bold text-sidebar-foreground">
              {t.interface.homeTitle}
            </p>
            <p className="text-sm leading-6 text-sidebar-muted">{t.interface.libraryCaption}</p>
          </figcaption>
        </figure>
      </div>
    </Card>
  );
}
