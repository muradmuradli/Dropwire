'use client';

import Link from 'next/link';
import { useTheme } from 'next-themes';
import { Minus, Moon, Plus, ShoppingBag, Sun, Trash2, User } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { useCart } from '../lib/cart-context';
import { redirectToLogin } from '../lib/keycloak-login';
import { money } from '../lib/format';
import { ProductArt } from './dw/bits';
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
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
  const { items, count, subtotalCents, setQuantity, removeItem } = useCart();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open cart" className="relative">
          <ShoppingBag className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">Your bag</SheetTitle>
          <SheetDescription>
            Nothing is reserved yet — stock is only checked when you check out.
          </SheetDescription>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-16 text-center">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Your bag is empty</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Join a live drop to add something.
            </p>
          </div>
        ) : (
          <>
            <ul className="flex-1 space-y-4 overflow-y-auto px-4">
              {items.map((item) => (
                <li key={item.productId} className="flex gap-3">
                  <ProductArt
                    imageUrl={item.imageUrl}
                    seedId={item.productId}
                    alt={item.name}
                    className="h-14 w-14 shrink-0 rounded-lg"
                  />
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{item.name}</span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => removeItem(item.productId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center rounded-md border">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Decrease quantity"
                          onClick={() => setQuantity(item.productId, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-xs tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label="Increase quantity"
                          onClick={() => setQuantity(item.productId, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {money(item.priceCents * item.quantity)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <SheetFooter className="border-t">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{money(subtotalCents)}</span>
              </div>
              <SheetClose asChild>
                <Button asChild>
                  <Link href="/checkout">Checkout</Link>
                </Button>
              </SheetClose>
            </SheetFooter>
          </>
        )}
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
