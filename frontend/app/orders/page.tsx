import type { Metadata } from 'next';
import { AutoRefresh } from '@/components/auto-refresh';
import { EmptyState } from '@/components/empty-state';
import { OrderCard } from '@/components/order-card';
import { OrderHighlight } from '@/components/order-highlight';
import { isInProgress, isOpen } from '@/components/order-status-badge';
import { Pagination } from '@/components/pagination';
import { api } from '@/lib/api';
import { loadOrRedirect } from '@/lib/guards';
import { pageFromSearchParam } from '@/lib/navigation';
import { PAGE_SIZE } from '@/lib/types';

export const metadata: Metadata = { title: 'My orders' };

const POLL_INTERVAL_MS = 5000;

export default async function OrdersPage(props: PageProps<'/orders'>) {
  const page = pageFromSearchParam((await props.searchParams).page);
  const orders = await loadOrRedirect('/orders', () =>
    api.listOrders({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  );
  const highlighted = page === 1 ? orders.find((order) => isOpen(order.status)) : undefined;
  const others = orders.filter((order) => order !== highlighted);

  return (
    <div className="page flex flex-col gap-8">
      <h1 className="font-display text-display-lg">My orders</h1>
      {orders.some((order) => isInProgress(order.status)) && (
        <AutoRefresh intervalMs={POLL_INTERVAL_MS} />
      )}
      {orders.length === 0 ? (
        <EmptyState
          title="You have not placed any orders yet."
          action={{ href: '/', label: 'Browse the catalog' }}
        />
      ) : (
        <>
          {highlighted && <OrderHighlight order={highlighted} />}
          {others.length > 0 && (
            <section className="flex flex-col gap-5">
              {highlighted && (
                <h2 className="font-display text-display-sm">Previous</h2>
              )}
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                {others.map((order) => (
                  <li key={order.id}>
                    <OrderCard order={order} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <Pagination
        basePath="/orders"
        page={page}
        hasNext={orders.length === PAGE_SIZE}
      />
    </div>
  );
}
