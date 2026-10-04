'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types';
import { handleActionError } from './errors';
import type { ActionState } from './state';

export async function placeOrder(): Promise<ActionState> {
  let order: Order;
  try {
    const cart = await api.getCart();
    if (cart.items.length === 0) {
      return { error: 'Your cart is empty.' };
    }
    order = await api.createOrder(
      cart.items.map(({ productId, quantity }) => ({ productId, quantity })),
    );
  } catch (error) {
    return handleActionError(error, '/checkout', {
      404: 'Some products in your cart are no longer available. Review your cart.',
      409: 'Some products do not have enough stock. Adjust the quantities in your cart.',
    });
  }
  redirect(`/orders/${order.id}?placed=1`);
}
