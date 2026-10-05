import Link from 'next/link';
import { AutoRefresh } from '@/components/auto-refresh';
import { OrderProgress } from '@/components/order-progress';
import { isInProgress, OrderStatusBadge } from '@/components/order-status-badge';
import { api, ApiError } from '@/lib/api';
import { formatCents, formatDate, shortId } from '@/lib/format';
import { loadOrRedirect } from '@/lib/guards';

const POLL_INTERVAL_MS = 5000;

export default async function OrderPage(props: PageProps<'/orders/[id]'>) {
  const [{ id }, { placed }] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const order = await loadOrRedirect(`/orders/${id}`, () => api.getOrder(id));
  const products = await Promise.all(
    order.items.map((item) =>
      api.getProduct(item.productId).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }),
    ),
  );
  const names = new Map(
    products.flatMap((product) => (product ? [[product.id, product.name]] : [])),
  );
  const cancelled = order.status === 'CANCELLED';

  return (
    <div className="page flex flex-col gap-8">
      {isInProgress(order.status) && <AutoRefresh intervalMs={POLL_INTERVAL_MS} />}
      <Link href="/orders" className="link self-start">
        ← My orders
      </Link>
      {placed && (
        <p
          role="status"
          className="rounded-sm border-3 border-ink bg-status-delivered px-4 py-3 font-bold"
        >
          Order placed successfully.
        </p>
      )}
      <section
        className={`panel flex flex-col gap-6 p-7 ${cancelled ? 'bg-disabled' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="overline">
              Placed {formatDate(order.createdAt)} · updated {formatDate(order.updatedAt)}
            </span>
            <h1 className="font-display text-display-lg">
              Order #{shortId(order.id)}
            </h1>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>
        <OrderProgress status={order.status} />
      </section>
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
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="font-bold">
                  {names.get(item.productId) ?? `#${shortId(item.productId)}`}
                </td>
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
      <p className="flex items-baseline gap-4 self-end">
        <span className="font-bold">Total</span>
        <span
          className={`font-display text-display-sm ${cancelled ? 'line-through' : ''}`}
        >
          {formatCents(order.totalCents)}
        </span>
      </p>
    </div>
  );
}
