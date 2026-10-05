import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { PlaceOrderForm } from '@/components/place-order-form';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { loadOrRedirect } from '@/lib/guards';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage() {
  const cart = await loadOrRedirect('/checkout', () => api.getCart());

  if (cart.items.length === 0) {
    return (
      <div className="page">
        <EmptyState
          title="Your cart is empty."
          action={{ href: '/', label: 'Browse the catalog' }}
        />
      </div>
    );
  }

  return (
    <div className="page flex flex-col gap-8">
      <h1 className="font-display text-display-lg">Checkout</h1>
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit price</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {cart.items.map((item) => (
                <tr key={item.productId}>
                  <td className="font-bold">{item.name}</td>
                  <td className="text-right">{item.quantity}</td>
                  <td className="text-right">
                    {formatCents(item.unitPriceCents)}
                  </td>
                  <td className="text-right font-display">
                    {formatCents(item.unitPriceCents * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <aside className="panel flex flex-col gap-5 p-7" aria-label="Summary">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-bold">Total</span>
            <span className="font-display text-display-sm">
              {formatCents(cart.totalCents)}
            </span>
          </div>
          <PlaceOrderForm />
          <Link href="/cart" className="btn btn-secondary w-full">
            Edit cart
          </Link>
        </aside>
      </div>
    </div>
  );
}
