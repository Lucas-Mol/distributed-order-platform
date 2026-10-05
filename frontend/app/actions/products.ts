'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { api } from '@/lib/api';
import { parseCents } from '@/lib/format';
import {
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PRICE_CENTS,
  MAX_STOCK,
  type ImageContentType,
  type ProductInput,
} from '@/lib/types';
import { handleActionError } from './errors';
import type { ActionState } from './state';

const PERMISSION_MESSAGES = {
  403: 'Only managers can change products.',
  404: 'This product no longer exists.',
};

function readProductInput(
  formData: FormData,
): { input: ProductInput } | { error: string } {
  const name = String(formData.get('name') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const priceCents = parseCents(String(formData.get('price') ?? ''));
  const stock = Number(formData.get('stock'));

  if (!name || name.length > 200) {
    return { error: 'Name is required (up to 200 characters).' };
  }
  if (description.length > 2000) {
    return { error: 'Description can have up to 2000 characters.' };
  }
  if (priceCents === null || priceCents > MAX_PRICE_CENTS) {
    return { error: 'Price must look like 12.90 and be at most 1,000,000.00.' };
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > MAX_STOCK) {
    return { error: `Stock must be a whole number from 0 to ${MAX_STOCK}.` };
  }
  return { input: { name, description, priceCents, stock } };
}

export async function saveProduct(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get('id');
  const parsed = readProductInput(formData);
  if ('error' in parsed) {
    return parsed;
  }

  if (typeof id === 'string' && id) {
    const currentPath = `/admin/products/${id}`;
    try {
      await api.updateProduct(id, parsed.input);
    } catch (error) {
      return handleActionError(error, currentPath, PERMISSION_MESSAGES);
    }
    refresh();
    return { success: 'Product saved.' };
  }

  let createdId: string;
  try {
    createdId = (await api.createProduct(parsed.input)).id;
  } catch (error) {
    return handleActionError(error, '/admin/products/new', PERMISSION_MESSAGES);
  }
  redirect(`/admin/products/${createdId}?created=1`);
}

export async function deleteProduct(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '');
  try {
    await api.deleteProduct(id);
  } catch (error) {
    return handleActionError(error, `/admin/products/${id}`, {
      ...PERMISSION_MESSAGES,
      409: 'This product appears in orders, so it cannot be deleted. Set its stock to 0 instead.',
    });
  }
  redirect('/admin/products');
}

export type UploadTicket =
  | { uploadUrl: string; key: string }
  | { error: string };

export async function requestImageUpload(
  productId: string,
  contentType: string,
  contentLength: number,
): Promise<UploadTicket> {
  if (!IMAGE_CONTENT_TYPES.includes(contentType as ImageContentType)) {
    return { error: 'Use a PNG or JPG image.' };
  }
  if (
    !Number.isInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_IMAGE_BYTES
  ) {
    return { error: 'The image must be at most 5 MB.' };
  }
  try {
    const { uploadUrl, key } = await api.createImageUpload(
      productId,
      contentType as ImageContentType,
      contentLength,
    );
    return { uploadUrl, key };
  } catch (error) {
    const state = handleActionError(
      error,
      `/admin/products/${productId}`,
      PERMISSION_MESSAGES,
    );
    return { error: state.error ?? 'Could not start the upload.' };
  }
}

export async function attachImage(
  productId: string,
  key: string,
): Promise<ActionState> {
  try {
    await api.attachImage(productId, key);
  } catch (error) {
    return handleActionError(
      error,
      `/admin/products/${productId}`,
      PERMISSION_MESSAGES,
    );
  }
  refresh();
  return { success: 'Photo updated.' };
}

export async function removeImage(productId: string): Promise<ActionState> {
  try {
    await api.removeImage(productId);
  } catch (error) {
    return handleActionError(
      error,
      `/admin/products/${productId}`,
      PERMISSION_MESSAGES,
    );
  }
  refresh();
  return { success: 'Photo removed.' };
}
