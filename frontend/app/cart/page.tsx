import type { Metadata } from 'next';
import Link from 'next/link';
import { CartItemRow } from '@/components/cart-item-row';
import { EmptyState } from '@/components/empty-state';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { loadOrRedirect } from '@/lib/guards';

export const metadata: Metadata = { title: 'Cart' };

export default async function CartPage() {
  const cart = await loadOrRedirect('/cart', () => api.getCart());
  const units = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="page flex flex-col gap-8">
      <h1 className="font-display text-display-lg">Cart</h1>
      {cart.items.length === 0 ? (
        <EmptyState
          title="Your cart is empty."
          action={{ href: '/', label: 'Browse the catalog' }}
        />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
          <ul className="flex flex-col gap-5">
            {cart.items.map((item) => (
              <CartItemRow key={item.productId} item={item} />
            ))}
          </ul>
          <aside className="panel flex flex-col gap-5 p-7" aria-label="Summary">
            <h2 className="font-display text-display-sm">Summary</h2>
            <dl className="flex flex-col gap-3">
              <div className="flex justify-between gap-4 text-body-lg">
                <dt>Items</dt>
                <dd className="font-bold">{units}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t-3 border-dashed border-ink pt-3">
                <dt className="font-bold">Total</dt>
                <dd className="font-display text-display-sm">
                  {formatCents(cart.totalCents)}
                </dd>
              </div>
            </dl>
            <Link href="/checkout" className="btn btn-accent btn-lg w-full">
              Checkout
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
