import Link from 'next/link';
import { formatCents, formatDate, shortId } from '@/lib/format';
import type { Order } from '@/lib/types';
import { OrderStatusBadge } from './order-status-badge';

function countUnits(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function OrderCard({ order }: { order: Order }) {
  const cancelled = order.status === 'CANCELLED';
  const units = countUnits(order);
  return (
    <Link
      href={`/orders/${order.id}`}
      className={`card card-interactive flex h-full flex-col gap-3 p-5 ${cancelled ? 'bg-disabled' : ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">#{shortId(order.id)}</span>
        <OrderStatusBadge status={order.status} />
      </div>
      <span className="text-small text-muted">{formatDate(order.createdAt)}</span>
      <span className={`font-display text-display-sm ${cancelled ? 'line-through' : ''}`}>
        {formatCents(order.totalCents)}
      </span>
      <span className="text-small text-muted">
        {units === 1 ? '1 item' : `${units} items`}
      </span>
    </Link>
  );
}
