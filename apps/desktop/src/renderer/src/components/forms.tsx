import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Eye, EyeOff, KeyRound, LoaderCircle, X } from 'lucide-react';
import type { GeneratedCredentials } from '@catalog/contracts';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import { texts as t } from '../../../shared/texts';

export function Field({
  label,
  hint,
  ...props
}: ComponentProps<typeof Input> & { label: string; hint?: string }) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Input
        {...props}
        id={id}
        aria-describedby={
          hint
            ? [props['aria-describedby'], hintId].filter(Boolean).join(' ')
            : props['aria-describedby']
        }
      />
      {hint && (
        <p id={hintId} className="text-xs leading-6 text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function PasswordField({
  label,
  hint,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { label: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Input
          {...props}
          id={id}
          type={visible ? 'text' : 'password'}
          dir="ltr"
          aria-describedby={
            hint
              ? [props['aria-describedby'], hintId].filter(Boolean).join(' ')
              : props['aria-describedby']
          }
          className={cn('pl-11 font-mono', className)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute end-1 top-1"
          aria-label={visible ? t.hidePassword : t.showPassword}
          title={visible ? t.hidePassword : t.showPassword}
          aria-pressed={visible}
          disabled={props.disabled}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {hint && (
        <p id={hintId} className="text-xs leading-6 text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 p-3.5 text-sm leading-relaxed text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

export function Loading({ label = t.loading }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-3 border-t pt-5">{children}</div>;
}

export function Modal({
  children,
  onCancel,
  title,
  description,
  showClose = true,
  busy = false,
}: {
  children: ReactNode;
  onCancel: () => void;
  title: string;
  description?: string;
  showClose?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="app-dialog fixed inset-0 m-auto max-h-[90vh] w-[min(92vw,34rem)] overflow-y-auto rounded-[20px] border bg-card p-0 text-foreground shadow-xl backdrop:bg-sidebar/55 backdrop:backdrop-blur-xs"
    >
      <header className="flex items-start justify-between gap-4 border-b p-6">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="font-display text-2xl font-semibold leading-tight break-words"
          >
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {showClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            aria-label={t.interface.close}
            onClick={onCancel}
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </header>
      <div className="p-6">{children}</div>
    </dialog>
  );
}

export function Confirmation({
  title,
  description,
  busy,
  onConfirm,
  onClose,
  confirmationText,
  confirmationLabel,
  confirmLabel = t.platform.confirm,
  error,
  destructive = false,
}: {
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  confirmationText?: string;
  confirmationLabel?: string;
  confirmLabel?: string;
  error?: string | null;
  destructive?: boolean;
}) {
  const [confirmation, setConfirmation] = useState('');
  return (
    <Modal title={title} busy={busy} onCancel={onClose}>
      {error && (
        <div className="mb-5">
          <Notice>{error}</Notice>
        </div>
      )}
      <div className="mb-6 flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary',
            destructive && 'bg-destructive/10 text-destructive',
          )}
        >
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
      {confirmationText && (
        <div className="mb-6 space-y-3">
          <label className="block space-y-3 text-sm">
            <span>
              {confirmationLabel ?? t.platform.deleteConfirmation}{' '}
              <bdi className="font-mono font-semibold">{confirmationText}</bdi>
            </span>
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              dir="auto"
            />
          </label>
        </div>
      )}
      <FormActions>
        <Button variant="outline" disabled={busy} onClick={onClose}>
          {t.cancel}
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'default'}
          disabled={busy || (confirmationText !== undefined && confirmation !== confirmationText)}
          onClick={onConfirm}
        >
          {busy ? t.saving : confirmLabel}
        </Button>
      </FormActions>
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
      title={t.platform.credentialsTitle}
      description={t.platform.createdHint}
      showClose={false}
      onCancel={() => {
        if (saved) onClose();
      }}
    >
      <div className="space-y-4">
        {entries.map(({ label, value }) => (
          <section key={label} className="space-y-4 rounded-xl border bg-background/60 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="size-4 text-primary" aria-hidden="true" />
              {label}
            </h3>
            <Field
              label={t.login}
              value={value.login}
              readOnly
              dir="ltr"
              className="font-mono"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Field
              label={t.password}
              value={value.password}
              className="font-mono"
              readOnly
              dir="ltr"
              onFocus={(event) => event.currentTarget.select()}
            />
          </section>
        ))}
      </div>
      <p className="mt-5 text-xs leading-6 text-muted-foreground">
        {t.platform.selectToCopy} {t.passwordCaseHint}
      </p>
      <label className="my-5 flex items-start gap-3 text-sm leading-6">
        <input
          className="mt-1"
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        {t.platform.credentialsSaved}
      </label>
      <FormActions>
        <Button disabled={!saved} onClick={onClose}>
          {t.platform.credentialsClose}
        </Button>
      </FormActions>
    </Modal>
  );
}
