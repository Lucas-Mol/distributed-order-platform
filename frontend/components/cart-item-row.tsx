'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { removeCartItem, updateCartItem } from '@/app/actions/cart';
import { initialActionState } from '@/app/actions/state';
import { formatCents } from '@/lib/format';
import { MAX_ITEM_QUANTITY, type CartItem } from '@/lib/types';
import { FormMessage } from './form-message';
import { SubmitButton } from './submit-button';

function StepButton({
  quantity,
  label,
  children,
}: {
  quantity: number;
  label: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const outOfRange = quantity < 1 || quantity > MAX_ITEM_QUANTITY;
  return (
    <button
      type="submit"
      name="quantity"
      value={quantity}
      aria-label={label}
      disabled={pending || outOfRange}
      className="btn btn-secondary btn-icon"
    >
      {children}
    </button>
  );
}

export function CartItemRow({ item }: { item: CartItem }) {
  const [updateState, update] = useActionState(
    updateCartItem,
    initialActionState,
  );
  const [removeState, remove] = useActionState(
    removeCartItem,
    initialActionState,
  );

  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href={`/products/${item.productId}`} className="link text-title">
            {item.name}
          </Link>
          <p className="text-small text-muted">
            {formatCents(item.unitPriceCents)} each
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form action={update} className="flex items-center gap-2">
            <input type="hidden" name="productId" value={item.productId} />
            <StepButton
              quantity={item.quantity - 1}
              label={`Decrease quantity of ${item.name}`}
            >
              −
            </StepButton>
            <span
              className="w-8 text-center text-body-lg font-bold"
              aria-label={`Quantity of ${item.name}`}
            >
              {item.quantity}
            </span>
            <StepButton
              quantity={item.quantity + 1}
              label={`Increase quantity of ${item.name}`}
            >
              +
            </StepButton>
          </form>
          <span className="w-28 text-right font-display text-body-lg">
            {formatCents(item.unitPriceCents * item.quantity)}
          </span>
          <form action={remove}>
            <input type="hidden" name="productId" value={item.productId} />
            <SubmitButton variant="danger" pendingLabel="Removing…">
              Remove
            </SubmitButton>
          </form>
        </div>
      </div>
      <FormMessage state={updateState} />
      <FormMessage state={removeState} />
    </li>
  );
}
