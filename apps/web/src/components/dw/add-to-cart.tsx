'use client';

import { useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { useCart } from '../../lib/cart-context';
import { Button } from '../ui/button';
import type { Product } from '../../lib/catalog-api';

export function AddToCart({ product, dropId }: { product: Product; dropId: string }) {
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-md border">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Decrease quantity"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Increase quantity"
          onClick={() => setQuantity((q) => q + 1)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <Button
        size="sm"
        onClick={() => {
          addItem(
            {
              productId: product.id,
              dropId,
              name: product.name,
              priceCents: product.priceCents,
              imageUrl: product.imageUrl,
            },
            quantity,
          );
          setQuantity(1);
          setAdded(true);
          setTimeout(() => setAdded(false), 1500);
        }}
      >
        {added ? <Check className="h-3.5 w-3.5" /> : null}
        {added ? 'Added' : 'Add to cart'}
      </Button>
    </div>
  );
}
