import 'server-only';
import { getClientIp } from './client-ip';
import { getToken } from './session';
import type {
  AccessToken,
  Cart,
  Order,
  Pagination,
  Product,
  User,
} from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function apiUrl(path: string): string {
  const base = process.env.API_URL;
  if (!base) {
    throw new Error('API_URL is not set');
  }
  return new URL(path, base).toString();
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body as { message: unknown };
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.join('; ');
    }
  }
  return fallback;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

async function request<T>(
  path: string,
  { method = 'GET', body, auth = false }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const clientIp = await getClientIp();
  if (clientIp) {
    headers['X-Forwarded-For'] = clientIp;
  }
  if (auth) {
    const token = await getToken();
    if (!token) {
      throw new ApiError(401, 'Not authenticated');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(apiUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      errorMessage(payload, response.statusText || 'Request failed'),
    );
  }
  return payload as T;
}

function paginate({ limit, offset }: Pagination): string {
  return `limit=${limit}&offset=${offset}`;
}

export const api = {
  register: (email: string, password: string) =>
    request<User>('/auth/register', {
      method: 'POST',
      body: { email, password },
    }),
  login: (email: string, password: string) =>
    request<AccessToken>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  listProducts: (page: Pagination, search?: string) =>
    request<Product[]>(
      `/products?${paginate(page)}${search ? `&q=${encodeURIComponent(search)}` : ''}`,
    ),
  getProduct: (id: string) =>
    request<Product>(`/products/${encodeURIComponent(id)}`),

  getCart: () => request<Cart>('/cart', { auth: true }),
  setCartItem: (productId: string, quantity: number) =>
    request<Cart>(`/cart/items/${encodeURIComponent(productId)}`, {
      method: 'PUT',
      body: { quantity },
      auth: true,
    }),
  removeCartItem: (productId: string) =>
    request<void>(`/cart/items/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      auth: true,
    }),

  createOrder: (items: { productId: string; quantity: number }[]) =>
    request<Order>('/orders', {
      method: 'POST',
      body: { items },
      auth: true,
    }),
  listOrders: (page: Pagination) =>
    request<Order[]>(`/orders?${paginate(page)}`, { auth: true }),
  getOrder: (id: string) =>
    request<Order>(`/orders/${encodeURIComponent(id)}`, { auth: true }),
};
