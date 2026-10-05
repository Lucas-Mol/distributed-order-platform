import Link from 'next/link';
import { formatCents, formatDate, shortId } from '@/lib/format';
import type { Order, OrderStatus } from '@/lib/types';
import { OrderProgress } from './order-progress';
import { isInProgress } from './order-status-badge';

const headlines: Partial<Record<OrderStatus, string>> = {
  CREATED: 'We got your order',
  PROCESSING: 'We are preparing your order',
  READY: 'Your order is ready',
};

export function OrderHighlight({ order }: { order: Order }) {
  return (
    <section className="panel flex flex-col gap-6 p-7" aria-label="Current order">
      <div className="flex flex-col gap-2">
        <span className="overline">
          Order #{shortId(order.id)} · {formatDate(order.createdAt)}
        </span>
        <h2 className="font-display text-display-md">
          {headlines[order.status] ?? 'Order update'}
        </h2>
        <span className="font-display text-display-sm">
          {formatCents(order.totalCents)}
        </span>
      </div>
      <OrderProgress status={order.status} />
      <div className="flex flex-wrap items-center justify-between gap-4 border-t-3 border-dashed border-ink pt-5">
        <p className="text-small text-muted">
          {isInProgress(order.status)
            ? 'This page updates on its own.'
            : 'Your order is waiting for you.'}
        </p>
        <Link href={`/orders/${order.id}`} className="btn btn-secondary">
          View details
        </Link>
      </div>
    </section>
  );
}
