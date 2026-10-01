import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CartView {
  items: {
    productId: string;
    name: string;
    unitPriceCents: number;
    quantity: number;
  }[];
  totalCents: number;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<CartView> {
    const rows = await this.prisma.cartItem.findMany({
      where: { userId },
      include: { product: { select: { name: true, priceCents: true } } },
      orderBy: { productId: 'asc' },
    });
    const items = rows.map((row) => ({
      productId: row.productId,
      name: row.product.name,
      unitPriceCents: row.product.priceCents,
      quantity: row.quantity,
    }));
    return {
      items,
      totalCents: items.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceCents,
        0,
      ),
    };
  }

  async setItem(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartView> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    await this.prisma.cartItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId, quantity },
      update: { quantity },
    });
    return this.get(userId);
  }

  async removeItem(userId: string, productId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId, productId } });
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
  }
}
