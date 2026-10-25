import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@catalog/contracts';
import { texts as t } from '../../shared/texts';
import { Button } from '@/components/ui/button';
import { Confirmation, Notice } from '@/components/forms';
import { LoginPage } from './pages/LoginPage';
import type { LoginMode } from './pages/LoginPage';
import { PasswordPage } from './pages/PasswordPage';
import { PlatformDashboard } from './pages/PlatformDashboard';
import { TenantHome } from './pages/TenantHome';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<LoginMode>('catalog');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordPage, setPasswordPage] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.catalog
      .session()
      .then((result) => {
        if (!alive) return;
        if (result.ok) setSession(result.data);
        else setError(t.errors[result.error]);
      })
      .catch(() => {
        if (alive) setError(t.errors.UNAVAILABLE);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const expired = useCallback(() => {
    setSession(null);
    setMode('catalog');
    setPasswordPage(false);
  }, []);
  function receive(value: Session) {
    setSession(value);
    setError(null);
    setPasswordPage(false);
  }
  async function returnToCatalog() {
    setBusy(true);
    setError(null);
    try {
      const result = await window.catalog.session();
      if (result.ok) setSession(result.data);
      else setError(t.errors[result.error]);
      setMode('catalog');
    } catch {
      setError(t.errors.UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }
  function navigate(next: LoginMode) {
    setError(null);
    setPasswordPage(false);
    if (next === 'catalog') {
      void returnToCatalog();
      return;
    }
    setMode(next);
    setSession(null);
  }
  async function logout() {
    setBusy(true);
    setError(null);
    try {
      const result = await window.catalog.logout();
      setSession(null);
      setPasswordPage(false);
      setMode('catalog');
      if (!result.ok) setError(t.errors[result.error]);
      else await returnToCatalog();
    } catch {
      setError(t.errors.UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }
  async function deactivate() {
    setBusy(true);
    try {
      const result = await window.catalog.deactivate();
      if (!result.ok) setError(t.errors[result.error]);
    } catch {
      setError(t.errors.UNAVAILABLE);
    } finally {
      setSession(null);
      setMode('catalog');
      setDisconnect(false);
      setBusy(false);
    }
  }
  const superadmin = session?.user.platformRole === 'super_admin';
  const administrator =
    superadmin || session?.memberships.some((membership) => membership.role === 'admin');
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-7 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
        <div>
          <p className="font-semibold tracking-wide">{t.brand}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.subtitle}</p>
        </div>
        {session && (
          <nav className="flex flex-wrap gap-2" aria-label={t.administration}>
            {administrator ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => setPasswordPage(true)}
                >
                  {t.changePassword}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void logout()}>
                  {t.logout}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => navigate('admin')}>
                  {t.administration}
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('platform')}>
                  {t.platformAccess}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDisconnect(true)}>
                  {t.deactivate}
                </Button>
              </>
            )}
          </nav>
        )}
      </header>
      {error && (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      )}
      {!ready ? (
        <p role="status" className="py-12">
          {t.loading}
        </p>
      ) : !session ? (
        <LoginPage key={mode} mode={mode} navigate={navigate} onSession={receive} />
      ) : session.user.mustChangePassword || passwordPage ? (
        <PasswordPage
          required={session.user.mustChangePassword}
          onSession={receive}
          onCancel={() => setPasswordPage(false)}
        />
      ) : superadmin ? (
        <PlatformDashboard onExpired={expired} />
      ) : (
        <TenantHome key={session.user.id} session={session} onExpired={expired} />
      )}
      {disconnect && (
        <Confirmation
          title={t.deactivate}
          description={t.deactivateWarning}
          busy={busy}
          onConfirm={() => void deactivate()}
          onClose={() => setDisconnect(false)}
        />
      )}
    </main>
  );
}
