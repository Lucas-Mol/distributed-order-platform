'use server';

import { refresh } from 'next/cache';
import { api } from '@/lib/api';
import { MAX_ITEM_QUANTITY } from '@/lib/types';
import { handleActionError } from './errors';
import type { ActionState } from './state';

function parseQuantity(value: FormDataEntryValue | null): number | null {
  const quantity = Number(value);
  return Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= MAX_ITEM_QUANTITY
    ? quantity
    : null;
}

function parseProductId(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function addToCart(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const productId = parseProductId(formData.get('productId'));
  const quantity = parseQuantity(formData.get('quantity'));
  if (!productId || !quantity) {
    return { error: `Quantity must be between 1 and ${MAX_ITEM_QUANTITY}.` };
  }
  const currentPath = `/products/${productId}`;
  try {
    const cart = await api.getCart();
    const existing =
      cart.items.find((item) => item.productId === productId)?.quantity ?? 0;
    const total = existing + quantity;
    if (total > MAX_ITEM_QUANTITY) {
      return {
        error: `You can have at most ${MAX_ITEM_QUANTITY} units of a product in the cart (currently ${existing}).`,
      };
    }
    await api.setCartItem(productId, total);
  } catch (error) {
    return handleActionError(error, currentPath, {
      404: 'This product is no longer available.',
    });
  }
  refresh();
  return { success: `Added ${formatUnits(quantity)} to the cart.` };
}

function formatUnits(quantity: number): string {
  return quantity === 1 ? '1 unit' : `${quantity} units`;
}

export async function updateCartItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const productId = parseProductId(formData.get('productId'));
  const quantity = parseQuantity(formData.get('quantity'));
  if (!productId || !quantity) {
    return { error: `Quantity must be between 1 and ${MAX_ITEM_QUANTITY}.` };
  }
  try {
    await api.setCartItem(productId, quantity);
  } catch (error) {
    return handleActionError(error, '/cart', {
      404: 'This product is no longer available.',
    });
  }
  refresh();
  return {};
}

export async function removeCartItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const productId = parseProductId(formData.get('productId'));
  if (!productId) {
    return { error: 'Invalid product.' };
  }
  try {
    await api.removeCartItem(productId);
  } catch (error) {
    return handleActionError(error, '/cart');
  }
  refresh();
  return {};
}
