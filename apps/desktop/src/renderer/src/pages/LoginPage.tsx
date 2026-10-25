import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Notice } from '@/components/forms';

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
  const [required, setRequired] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (mode !== 'platform') return;
    let alive = true;
    void window.catalog
      .setupStatus()
      .then((result) => {
        if (!alive) return;
        if (result.ok) {
          setRequired(result.data.required);
          setError(null);
        } else setError(t.errors[result.error]);
      })
      .catch(() => {
        if (alive) setError(t.errors.UNAVAILABLE);
      });
    return () => {
      alive = false;
    };
  }, [mode, retry]);
  const setup = mode === 'platform' && required === true;
  const loading = mode === 'platform' && required === null;
  const title = setup
    ? t.setupTitle
    : mode === 'platform'
      ? t.platformAccess
      : mode === 'admin'
        ? t.administration
        : t.catalogAccess;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const result = await (setup
        ? window.catalog.setup(input)
        : mode === 'platform'
          ? window.catalog.platformLogin(input)
          : mode === 'admin'
            ? window.catalog.login(input)
            : window.catalog.activate(input));
      form.reset();
      if (result.ok) onSession(result.data);
      else {
        setError(t.errors[result.error]);
        if (result.error === 'SETUP_COMPLETE') setRequired(false);
      }
    } catch {
      setError(t.errors.UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto w-full max-w-md space-y-7 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{t.title}</h1>
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {setup
              ? t.setupDescription
              : mode === 'catalog'
                ? t.activationDescription
                : t.adminDescription}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && <Notice>{error}</Notice>}
          {loading ? (
            <div className="space-y-3">
              <p>{t.loading}</p>
              <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
                {t.retry}
              </Button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="space-y-5" aria-busy={busy}>
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
                dir="auto"
              />
              <Field
                label={t.password}
                name="password"
                type="password"
                autoComplete={setup ? 'new-password' : 'current-password'}
                minLength={setup ? 15 : 1}
                maxLength={128}
                required
                disabled={busy}
                dir="auto"
              />
              {setup && (
                <>
                  <p className="text-xs text-muted-foreground">{t.passwordHint}</p>
                  <Field
                    label={t.confirmPassword}
                    name="confirm"
                    type="password"
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
              </Button>
            </form>
          )}
          <div className="flex flex-wrap justify-center gap-3 border-t pt-4">
            {mode !== 'catalog' && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => navigate('catalog')}
              >
                {t.back}
              </Button>
            )}
            {mode === 'catalog' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => navigate('admin')}>
                {t.administration}
              </Button>
            )}
            {mode !== 'platform' && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => navigate('platform')}
              >
                {t.platformAccess}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
