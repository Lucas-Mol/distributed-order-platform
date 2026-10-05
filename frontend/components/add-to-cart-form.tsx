'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { addToCart } from '@/app/actions/cart';
import { initialActionState } from '@/app/actions/state';
import { MAX_ITEM_QUANTITY } from '@/lib/types';
import { FormMessage } from './form-message';
import { SubmitButton } from './submit-button';

export function AddToCartForm({
  productId,
  stock,
  signedIn,
}: {
  productId: string;
  stock: number;
  signedIn: boolean;
}) {
  const [state, action] = useActionState(addToCart, initialActionState);

  if (stock <= 0) {
    return (
      <button type="button" disabled className="btn w-full">
        Sold out
      </button>
    );
  }
  if (!signedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/products/${productId}`)}`}
        className="btn btn-primary w-full"
      >
        Sign in to buy
      </Link>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-28 flex-col gap-2">
          <label htmlFor="quantity" className="field-label">
            Quantity
          </label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min={1}
            max={Math.min(stock, MAX_ITEM_QUANTITY)}
            defaultValue={1}
            required
            className="input"
          />
        </div>
        <div className="flex-1">
          <SubmitButton size="lg" fullWidth pendingLabel="Adding…">
            Add to cart
          </SubmitButton>
        </div>
      </div>
      <FormMessage state={state} />
      {state.success && (
        <Link href="/cart" className="btn btn-secondary self-start">
          Go to cart
        </Link>
      )}
    </form>
  );
}
