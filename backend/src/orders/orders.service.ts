import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { StorageService } from '../storage/storage.service.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { ORDER_CREATED, orderCreatedEvent } from './order-events.js';

const orderWithItems = {
  include: { items: true },
} satisfies Prisma.OrderDefaultArgs;

export type OrderWithItems = Prisma.OrderGetPayload<typeof orderWithItems>;

export interface InvoiceLink {
  url: string;
  expiresAt: string;
}

const INVOICE_URL_TTL_SECONDS = 300;
const INVOICE_STATUSES: OrderStatus[] = [
  OrderStatus.READY,
  OrderStatus.DELIVERED,
];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  create(userId: string, dto: CreateOrderDto): Promise<OrderWithItems> {
    const quantities = new Map<string, number>();
    for (const item of dto.items) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const productIds = [...quantities.keys()].sort();

    return this.prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, priceCents: true },
      });
      const prices = new Map(products.map((p) => [p.id, p.priceCents]));
      const names = new Map(products.map((p) => [p.id, p.name]));
      const missing = productIds.filter((id) => !prices.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(
          `Products not found: ${missing.join(', ')}`,
        );
      }

      for (const productId of productIds) {
        const quantity = quantities.get(productId)!;
        const { count } = await tx.product.updateMany({
          where: { id: productId, stock: { gte: quantity } },
          data: { stock: { decrement: quantity } },
        });
        if (count === 0) {
          throw new ConflictException(
            `Insufficient stock for product ${productId}`,
          );
        }
      }

      const items = productIds.map((productId) => ({
        productId,
        quantity: quantities.get(productId)!,
        unitPriceCents: prices.get(productId)!,
      }));
      const totalCents = items.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceCents,
        0,
      );

      const order = await tx.order.create({
        data: {
          userId,
          status: OrderStatus.CREATED,
          totalCents,
          items: { create: items },
        },
        ...orderWithItems,
      });

      const { email } = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { email: true },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          event: ORDER_CREATED,
          payload: orderCreatedEvent(order, email, names),
        },
      });

      await tx.cartItem.deleteMany({ where: { userId } });
      return order;
    });
  }

  findAll(
    userId: string,
    { limit, offset }: PaginationQueryDto,
  ): Promise<OrderWithItems[]> {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
      ...orderWithItems,
    });
  }

  async findOne(userId: string, id: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      ...orderWithItems,
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async invoiceUrl(userId: string, id: string): Promise<InvoiceLink> {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      select: { id: true, status: true, invoiceKey: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (!order.invoiceKey || !INVOICE_STATUSES.includes(order.status)) {
      throw new ConflictException('Invoice is not ready yet');
    }
    const expiresAt = new Date(Date.now() + INVOICE_URL_TTL_SECONDS * 1000);
    const url = await this.storage.presignAttachment(
      order.invoiceKey,
      `invoice-${order.id}.pdf`,
      INVOICE_URL_TTL_SECONDS,
    );
    return { url, expiresAt: expiresAt.toISOString() };
  }
}
