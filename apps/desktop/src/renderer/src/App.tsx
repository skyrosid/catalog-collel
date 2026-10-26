import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@catalog/contracts';
import { texts as t } from '../../shared/texts';
import { Confirmation, Loading, Notice } from '@/components/forms';
import { AppHeader } from '@/components/app-header';
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
  const passwordRequired = superadmin && session.user.mustChangePassword;
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        session={session}
        busy={busy}
        onPassword={() => setPasswordPage(true)}
        onLogout={() => void logout()}
        onNavigate={navigate}
        onDeactivate={() => setDisconnect(true)}
      />
      <main className="app-container flex flex-1 flex-col py-8">
        {error && (
          <div className="mb-6">
            <Notice>{error}</Notice>
          </div>
        )}
        {!ready ? (
          <Loading />
        ) : !session ? (
          <LoginPage key={mode} mode={mode} navigate={navigate} onSession={receive} />
        ) : passwordRequired || passwordPage ? (
          <PasswordPage
            required={passwordRequired}
            onSession={receive}
            onCancel={() => setPasswordPage(false)}
          />
        ) : superadmin ? (
          <PlatformDashboard onExpired={expired} />
        ) : (
          <TenantHome key={session.user.id} session={session} onExpired={expired} />
        )}
      </main>
      {disconnect && (
        <Confirmation
          title={t.deactivate}
          description={t.deactivateWarning}
          busy={busy}
          destructive
          onConfirm={() => void deactivate()}
          onClose={() => setDisconnect(false)}
        />
      )}
    </div>
  );
}
