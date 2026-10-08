'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import type { Order } from '@/lib/types';
import { handleActionError } from './errors';
import type { ActionState } from './state';

export async function placeOrder(): Promise<ActionState> {
  let order: Order;
  try {
    order = await api.checkout();
  } catch (error) {
    return handleActionError(error, '/checkout', {
      400: 'Your cart is empty.',
      409: 'Your cart changed: some prices, availability or stock were updated. Review your cart before ordering.',
    });
  }
  redirect(`/orders/${order.id}?placed=1`);
}
