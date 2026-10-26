import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@catalog/contracts';
import { texts as t } from '../../../shared/texts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FormActions, PasswordField, Notice } from '@/components/forms';
import { PageHeader } from '@/components/page-layout';

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
    <Card className="mx-auto my-auto w-full max-w-md">
      <CardHeader>
        <PageHeader
          title={t.changePassword}
          {...(required ? { description: t.changePasswordDescription } : {})}
        />
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={(event) => void submit(event)} aria-busy={busy}>
          {error && <Notice>{error}</Notice>}
          <PasswordField
            label={t.currentPassword}
            name="current"
            autoComplete="current-password"
            required
            maxLength={128}
            disabled={busy}
          />
          <PasswordField
            label={t.newPassword}
            hint={t.passwordHint}
            name="password"
            autoComplete="new-password"
            required
            minLength={15}
            maxLength={128}
            disabled={busy}
          />
          <PasswordField
            label={t.confirmPassword}
            name="confirm"
            autoComplete="new-password"
            required
            minLength={15}
            maxLength={128}
            disabled={busy}
          />
          <FormActions>
            {!required && (
              <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
                {t.cancel}
              </Button>
            )}
            <Button disabled={busy}>{busy ? t.saving : t.save}</Button>
          </FormActions>
        </form>
      </CardContent>
    </Card>
  );
}
