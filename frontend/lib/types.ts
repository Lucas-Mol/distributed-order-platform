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
  stock: number;
  createdAt: string;
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
