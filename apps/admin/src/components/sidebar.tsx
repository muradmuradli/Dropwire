'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { CalendarClock, LayoutDashboard, ListChecks, Moon, Package, Sun, User } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { redirectToLogin } from '../lib/keycloak-login';
import { Logo } from './logo';
import { Button } from './ui/button';

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Orders', icon: ListChecks },
  { href: '/drops', label: 'Drops', icon: CalendarClock },
  { href: '/products', label: 'Products', icon: Package },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function AppSidebar() {
  const { keycloak, initialized, authenticated } = useAuth();
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const username = keycloak?.tokenParsed?.preferred_username as string | undefined;

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-between border-b px-4">
        <Logo />
        <ThemeToggle />
      </div>

      <nav className="flex-1 space-y-1 p-3" aria-label="Main">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t p-3">
        {!initialized && <span className="px-3 text-sm text-muted-foreground">…</span>}

        {initialized && !authenticated && (
          <Button
            size="sm"
            variant="secondary"
            className="w-full justify-start"
            onClick={() => keycloak && void redirectToLogin(keycloak, resolvedTheme)}
          >
            <User className="h-4 w-4" />
            Sign in
          </Button>
        )}

        {initialized && authenticated && (
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="truncate text-sm text-muted-foreground">{username}</span>
            <Button size="sm" variant="ghost" onClick={() => void keycloak?.logout()}>
              Log out
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
