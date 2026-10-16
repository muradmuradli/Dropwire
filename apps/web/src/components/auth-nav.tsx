'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Moon, ShoppingBag, Sun, User } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { redirectToLogin } from '../lib/keycloak-login';
import { Logo } from './logo';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet';

const NAV_LINKS = [
  { href: '/', label: 'Drops' },
  { href: '/orders', label: 'Orders' },
  { href: '/admin', label: 'Ops console' },
];

const navLinkClass =
  'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground';

function initials(name: string) {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== 'light';
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

function CartSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open cart">
          <ShoppingBag className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Your bag</SheetTitle>
          <SheetDescription>Items are held for you while the timer runs.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
            <ShoppingBag className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Your bag is empty</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Join a live drop to reserve a pair. Reservations last 10 minutes.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AuthNav() {
  const { keycloak, initialized, authenticated } = useAuth();
  const { resolvedTheme } = useTheme();
  const username = keycloak?.tokenParsed?.preferred_username as string | undefined;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={navLinkClass}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <CartSheet />

          {!initialized && (
            <span className="ml-1 px-3 py-2 text-sm text-muted-foreground">…</span>
          )}

          {initialized && !authenticated && (
            <Button
              size="sm"
              variant="secondary"
              className="ml-1"
              onClick={() => keycloak && void redirectToLogin(keycloak, resolvedTheme)}
            >
              <User className="h-4 w-4" />
              Sign in
            </Button>
          )}

          {initialized && authenticated && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-secondary text-xs font-bold transition hover:ring-2 hover:ring-primary"
                aria-label="Account menu"
              >
                {username ? initials(username) : <User className="h-4 w-4" />}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/account">Account</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void keycloak?.logout()}>
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-t px-4 py-1 md:hidden" aria-label="Mobile">
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
