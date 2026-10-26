import type { Session } from '@catalog/contracts';
import {
  ChevronDown,
  KeyRound,
  LogOut,
  Monitor,
  Settings2,
  ShieldCheck,
  Unplug,
  UserRound,
} from 'lucide-react';
import { texts as t } from '../../../shared/texts';
import { LibraryMark } from './library-art';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

export function AppHeader({
  session,
  busy,
  onPassword,
  onLogout,
  onNavigate,
  onDeactivate,
}: {
  session: Session | null;
  busy: boolean;
  onPassword: () => void;
  onLogout: () => void;
  onNavigate: (mode: 'admin' | 'platform') => void;
  onDeactivate: () => void;
}) {
  const superadmin = session?.user.platformRole === 'super_admin';
  const administrator =
    superadmin || session?.memberships.some((member) => member.role === 'admin');
  const role = superadmin
    ? t.interface.platformRole
    : administrator
      ? t.interface.libraryRole
      : t.interface.catalogRole;
  return (
    <header className="app-header h-18 shrink-0 border-b bg-card">
      <div className="app-container flex h-full items-center justify-between gap-4">
        <div className="app-brand flex shrink-0 items-center gap-3 text-primary">
          <span className="app-brand-mark">
            <LibraryMark className="size-10" />
          </span>
          <div>
            <p className="font-display text-2xl font-semibold">{t.brand}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{t.catalog.libraryEyebrow}</p>
          </div>
        </div>
        {session && (
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="account-trigger gap-2 px-3"
                aria-label={t.interface.account}
                disabled={busy}
              >
                {administrator ? <UserRound aria-hidden="true" /> : <Monitor aria-hidden="true" />}
                <bdi className="hidden max-w-48 truncate sm:block">{session.user.displayName}</bdi>
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{role}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {administrator ? (
                <>
                  <DropdownMenuItem onSelect={onPassword}>
                    <KeyRound aria-hidden="true" />
                    {t.changePassword}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onLogout}>
                    <LogOut aria-hidden="true" />
                    {t.logout}
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onSelect={() => onNavigate('admin')}>
                    <Settings2 aria-hidden="true" />
                    {t.administration}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onNavigate('platform')}>
                    <ShieldCheck aria-hidden="true" />
                    {t.platformAccess}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={onDeactivate}>
                    <Unplug aria-hidden="true" />
                    {t.deactivate}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
