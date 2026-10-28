'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2, TriangleAlert } from 'lucide-react';
import { useCart } from '../../lib/cart-context';
import { useRequireAuth } from '../../lib/use-require-auth';
import { useOrdersApi } from '../../lib/orders-api';
import { ApiError } from '../../lib/api-error';
import { ProductArt, EmptyState } from '../../components/dw/bits';
import { Button } from '../../components/ui/button';
import { money } from '../../lib/format';

// Mirrors inventory's ReservationStatus proto enum (docs/decisions/0007) — the only two values
// that can appear on a CANCELLED order's per-item breakdown.
const OUT_OF_STOCK = 2;
const PRODUCT_NOT_FOUND = 3;

interface ItemProblem {
  productId: string;
  message: string;
}

export default function CheckoutPage() {
  const { initialized, authenticated } = useRequireAuth();
  const { items, subtotalCents, setQuantity, removeItem, clear } = useCart();
  const { placeOrder } = useOrdersApi();
  const router = useRouter();

  const [placing, setPlacing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [itemProblems, setItemProblems] = useState<ItemProblem[]>([]);

  if (!initialized || !authenticated) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
        Redirecting…
      </section>
    );
  }

  async function handlePlaceOrder() {
    setPlacing(true);
    setFormError(null);
    setItemProblems([]);

    try {
      const result = await placeOrder(
        items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      );

      if (result.order.status === 'RESERVED') {
        clear();
        router.push(`/orders/${result.order.id}`);
        return;
      }

      if (result.order.status === 'CANCELLED') {
        setItemProblems(
          result.reservation.items
            .filter((i) => i.status === OUT_OF_STOCK || i.status === PRODUCT_NOT_FOUND)
            .map((i) => ({
              productId: i.productId,
              message:
                i.status === OUT_OF_STOCK
                  ? `Only ${i.availableQuantity} left — lower the quantity and try again.`
                  : "This item isn't available anymore.",
            })),
        );
        setFormError("Couldn't reserve everything in your bag.");
        return;
      }

      // RESERVATION_FAILED: inventory never answered after retries — a transport problem, not a
      // business decline, so there's nothing item-specific to show.
      setFormError("Couldn't reach inventory to reserve your bag — try again.");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong placing the order.');
    } finally {
      setPlacing(false);
    }
  }

  if (items.length === 0) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={ShoppingBag}
          title="Your bag is empty"
          body="Add something from a live drop before checking out."
        />
        <div className="mt-6 text-center">
          <Button asChild variant="secondary">
            <Link href="/">Browse drops</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-3xl font-bold">Checkout</h1>

      <ul className="space-y-4">
        {items.map((item) => {
          const problem = itemProblems.find((p) => p.productId === item.productId);
          return (
            <li key={item.productId} className="flex gap-4 rounded-2xl border bg-card p-4">
              <ProductArt
                imageUrl={item.imageUrl}
                seedId={item.productId}
                alt={item.name}
                className="h-16 w-16 shrink-0 rounded-xl"
              />
              <div className="flex flex-1 flex-col justify-between gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{item.name}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => removeItem(item.productId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center rounded-md border">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Decrease quantity"
                      onClick={() => setQuantity(item.productId, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Increase quantity"
                      onClick={() => setQuantity(item.productId, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="font-mono font-semibold tabular-nums">
                    {money(item.priceCents * item.quantity)}
                  </span>
                </div>
                {problem && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" /> {problem.message}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex items-center justify-between border-t pt-4 text-lg font-semibold">
        <span>Subtotal</span>
        <span className="font-mono tabular-nums">{money(subtotalCents)}</span>
      </div>

      {formError && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {formError}
        </p>
      )}

      <Button
        size="lg"
        className="mt-6 w-full"
        disabled={placing}
        onClick={() => void handlePlaceOrder()}
      >
        {placing ? 'Placing order…' : 'Place order'}
      </Button>
    </section>
  );
}
