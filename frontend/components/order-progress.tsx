import type { OrderStatus } from '@/lib/types';
import { statusLabels } from './order-status-badge';

const STEPS: OrderStatus[] = ['CREATED', 'PROCESSING', 'READY', 'DELIVERED'];

export function OrderProgress({ status }: { status: OrderStatus }) {
  const current = STEPS.indexOf(status);
  if (current === -1) {
    return null;
  }
  return (
    <ol
      className="grid grid-cols-4 gap-2"
      aria-label={`Status: ${statusLabels[status]}, step ${current + 1} of ${STEPS.length}`}
    >
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const fill = done ? 'bg-ink' : active ? 'bg-accent' : 'bg-paper';
        return (
          <li key={step} className="flex flex-col gap-2">
            <span className={`h-[18px] rounded-[9px] border-3 border-ink ${fill}`} />
            <span
              className={`text-small ${done || active ? 'font-bold' : 'font-medium text-muted'}`}
            >
              {statusLabels[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
