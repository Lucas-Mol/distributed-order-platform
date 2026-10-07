export type Role = 'CUSTOMER' | 'MANAGER' | 'ADMIN';

export type OrderStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageKey: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  stock: number;
  createdAt: string;
}

export interface ProductInput {
  name: string;
  description?: string;
  priceCents: number;
  stock: number;
}

export type ImageContentType = 'image/png' | 'image/jpeg';

export interface ImageUpload {
  uploadUrl: string;
  key: string;
  expiresInSeconds: number;
}

export interface CartItem {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  totalCents: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  totalCents: number;
  invoiceKey: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface InvoiceLink {
  url: string;
  expiresAt: string;
}

export interface AccessToken {
  accessToken: string;
  tokenType: 'Bearer';
}

export interface Pagination {
  limit: number;
  offset: number;
}

export const MAX_ITEM_QUANTITY = 100;

export const PAGE_SIZE = 20;

export const MAX_SEARCH_LENGTH = 100;

export const MAX_PRICE_CENTS = 100_000_000;
export const MAX_STOCK = 1_000_000;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_CONTENT_TYPES: ImageContentType[] = ['image/png', 'image/jpeg'];
