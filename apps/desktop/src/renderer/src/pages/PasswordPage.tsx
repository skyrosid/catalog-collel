import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Notice } from '@/components/forms';

export function PasswordPage({
  onSession,
  onCancel,
  required,
}: {
  onSession: (session: Session) => void;
  onCancel: () => void;
  required: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get('current'));
    const newPassword = String(data.get('password'));
    if (newPassword !== data.get('confirm')) {
      setError(t.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await window.catalog.changePassword({ currentPassword, newPassword });
      form.reset();
      if (result.ok) onSession(result.data);
      else {
        setError(t.errors[result.error]);
      }
    } catch {
      setError(t.errors.UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="mx-auto my-12 w-full max-w-md">
      <CardHeader>
        <h1 className="text-xl font-semibold">{t.changePassword}</h1>
        {required && <p className="text-sm text-muted-foreground">{t.changePasswordDescription}</p>}
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(event) => void submit(event)} aria-busy={busy}>
          {error && <Notice>{error}</Notice>}
          <Field
            label={t.currentPassword}
            name="current"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            disabled={busy}
          />
          <Field
            label={t.newPassword}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={15}
            maxLength={128}
            disabled={busy}
          />
          <Field
            label={t.confirmPassword}
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={15}
            maxLength={128}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">{t.passwordHint}</p>
          <Button className="w-full" disabled={busy}>
            {busy ? t.saving : t.save}
          </Button>
          {!required && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
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
