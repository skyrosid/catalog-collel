import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import type { GeneratedCredentials } from '@catalog/contracts';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { texts as t } from '../../../shared/texts';

export function Field({ label, ...props }: ComponentProps<typeof Input> & { label: string }) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label}</span>
      <Input {...props} />
    </label>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {children}
    </p>
  );
}
export function Modal({ children, onCancel }: { children: ReactNode; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="fixed inset-0 m-auto max-h-[90vh] w-[min(92vw,36rem)] overflow-y-auto rounded-xl border bg-card p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      {children}
    </dialog>
  );
}
export function Confirmation({
  title,
  description,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      onCancel={() => {
        if (!busy) onClose();
      }}
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="my-5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          {t.cancel}
        </Button>
        <Button disabled={busy} onClick={onConfirm}>
          {busy ? t.saving : t.platform.confirm}
        </Button>
      </div>
    </Modal>
  );
}
export function Credentials({
  entries,
  onClose,
}: {
  entries: { label: string; value: GeneratedCredentials }[];
  onClose: () => void;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <Modal
      onCancel={() => {
        if (saved) onClose();
      }}
    >
      <h2 className="text-xl font-semibold">{t.platform.credentialsTitle}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.platform.createdHint}</p>
      <div className="my-5 space-y-5">
        {entries.map(({ label, value }) => (
          <section key={label} className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">{label}</h3>
            <Field
              label={t.login}
              value={value.login}
              readOnly
              dir="ltr"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Field
              label={t.password}
              value={value.password}
              readOnly
              dir="ltr"
              onFocus={(event) => event.currentTarget.select()}
            />
          </section>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t.platform.selectToCopy}</p>
      <label className="my-5 flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        {t.platform.credentialsSaved}
      </label>
      <Button className="w-full" disabled={!saved} onClick={onClose}>
        {t.platform.credentialsClose}
      </Button>
    </Modal>
  );
}
