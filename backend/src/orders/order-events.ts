export const ORDER_CREATED = 'order.created';

export type EventEnvelope<T> = {
  event: string;
  version: number;
  occurred_at: string;
  data: T;
};

export type OrderCreatedData = {
  order_id: string;
  user_id: string;
  user_email: string;
  total_cents: number;
  items: {
    product_id: string;
    name: string;
    quantity: number;
    unit_price_cents: number;
  }[];
};

export function orderCreatedEvent(
  order: {
    id: string;
    userId: string;
    totalCents: number;
    createdAt: Date;
    items: { productId: string; quantity: number; unitPriceCents: number }[];
  },
  userEmail: string,
  productNames: Map<string, string>,
): EventEnvelope<OrderCreatedData> {
  return {
    event: ORDER_CREATED,
    version: 1,
    occurred_at: order.createdAt.toISOString(),
    data: {
      order_id: order.id,
      user_id: order.userId,
      user_email: userEmail,
      total_cents: order.totalCents,
      items: order.items.map((item) => ({
        product_id: item.productId,
        name: productNames.get(item.productId)!,
        quantity: item.quantity,
        unit_price_cents: item.unitPriceCents,
      })),
    },
  };
}
