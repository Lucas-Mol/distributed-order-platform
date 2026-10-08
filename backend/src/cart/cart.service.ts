import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductsService } from '../products/products.service.js';
import { type CartLine, CartLimitError, CartStore } from './cart.store.js';

export interface CartView {
  items: CartLine[];
  totalCents: number;
}

function toView(items: CartLine[]): CartView {
  return {
    items,
    totalCents: items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    ),
  };
}

@Injectable()
export class CartService {
  constructor(
    private readonly store: CartStore,
    private readonly products: ProductsService,
  ) {}

  async get(userId: string): Promise<CartView> {
    return toView(await this.store.get(userId));
  }

  async addItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartView> {
    const product = await this.products.findCached(productId);
    try {
      return toView(
        await this.store.add(
          userId,
          productId,
          { name: product.name, unitPriceCents: product.priceCents },
          quantity,
        ),
      );
    } catch (error) {
      if (error instanceof CartLimitError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async setItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartView> {
    const items = await this.store.setQuantity(userId, productId, quantity);
    if (!items) {
      throw new NotFoundException('This product is not in the cart');
    }
    return toView(items);
  }

  removeItem(userId: string, productId: string): Promise<void> {
    return this.store.remove(userId, productId);
  }

  clear(userId: string): Promise<void> {
    return this.store.clear(userId);
  }
}
