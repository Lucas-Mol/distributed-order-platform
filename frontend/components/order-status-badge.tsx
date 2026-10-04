import type { OrderStatus } from '@/lib/types';

export const statusLabels: Record<OrderStatus, string> = {
  CREATED: 'Created',
  PROCESSING: 'Processing',
  READY: 'Ready',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const backgrounds: Record<OrderStatus, string> = {
  CREATED: 'bg-sun',
  PROCESSING: 'bg-accent',
  READY: 'bg-status-ready',
  DELIVERED: 'bg-status-delivered',
  CANCELLED: 'bg-paper',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${backgrounds[status]}`}>{statusLabels[status]}</span>
  );
}

export function isInProgress(status: OrderStatus): boolean {
  return status === 'CREATED' || status === 'PROCESSING';
}

export function isOpen(status: OrderStatus): boolean {
  return status !== 'DELIVERED' && status !== 'CANCELLED';
}
