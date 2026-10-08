import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CartStore } from '../cart/cart.store.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductCache } from '../product-cache/product-cache.js';
import { StorageService } from '../storage/storage.service.js';
import { OrdersService } from './orders.service.js';

const MUG = '8ec62dad-7ed4-4812-861d-5b8ca2a3a321';
const NOTEBOOK = '29f1fdeb-bb70-4da0-ab11-2d2e7dafdac9';
const USER = '80a11a62-136f-4a4d-a96d-4e3e02d7592a';

function createTx() {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue([
        { id: MUG, name: 'Mug', priceCents: 3990 },
        { id: NOTEBOOK, name: 'Notebook', priceCents: 2490 },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    order: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'order-1',
          ...data,
          items: data.items.create,
          createdAt: new Date('2026-01-15T12:00:00Z'),
        }),
      ),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ email: 'customer@example.com' }),
    },
    orderEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let tx: ReturnType<typeof createTx>;
  let storage: { presignAttachment: ReturnType<typeof vi.fn> };
  let cart: {
    get: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
  };
  let productCache: { decrementStock: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    tx = createTx();
    const prisma = {
      ...tx,
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    storage = {
      presignAttachment: vi.fn().mockResolvedValue('http://s3.test/invoice'),
    };
    cart = {
      get: vi.fn().mockResolvedValue([]),
      clear: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
    };
    productCache = { decrementStock: vi.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: CartStore, useValue: cart },
        { provide: ProductCache, useValue: productCache },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('merges duplicate items, reserves stock and computes the total', async () => {
    await service.create(USER, {
      items: [
        { productId: MUG, quantity: 2 },
        { productId: NOTEBOOK, quantity: 1 },
        { productId: MUG, quantity: 1 },
      ],
    });

    expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: MUG, stock: { gte: 3 } },
      data: { stock: { decrement: 3 } },
    });
    const { data } = tx.order.create.mock.calls[0][0];
    expect(data).toMatchObject({
      userId: USER,
      status: 'CREATED',
      totalCents: 3 * 3990 + 2490,
    });
    expect(data.items.create).toHaveLength(2);
  });

  it('clears the cart and decrements cached stock after the commit', async () => {
    await service.create(USER, {
      items: [
        { productId: MUG, quantity: 1 },
        { productId: NOTEBOOK, quantity: 1 },
      ],
    });

    expect(cart.clear).toHaveBeenCalledWith(USER);
    expect(productCache.decrementStock).toHaveBeenCalledWith(
      new Map([
        [MUG, 1],
        [NOTEBOOK, 1],
      ]),
    );
  });

  it('keeps the order when the cart cannot be cleared', async () => {
    cart.clear.mockRejectedValue(new Error('dynamo down'));

    const order = await service.create(USER, {
      items: [{ productId: MUG, quantity: 1 }],
    });

    expect(order.id).toBe('order-1');
  });

  it('writes the order.created event in the same transaction', async () => {
    await service.create(USER, { items: [{ productId: MUG, quantity: 2 }] });

    expect(tx.orderEvent.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        event: 'order.created',
        payload: {
          event: 'order.created',
          version: 1,
          occurred_at: '2026-01-15T12:00:00.000Z',
          data: {
            order_id: 'order-1',
            user_id: USER,
            user_email: 'customer@example.com',
            total_cents: 2 * 3990,
            items: [
              {
                product_id: MUG,
                name: 'Mug',
                quantity: 2,
                unit_price_cents: 3990,
              },
            ],
          },
        },
      },
    });
  });

  it('reserves stock in a fixed product order', async () => {
    await service.create(USER, {
      items: [
        { productId: MUG, quantity: 1 },
        { productId: NOTEBOOK, quantity: 1 },
      ],
    });
    const ids = tx.product.updateMany.mock.calls.map(([arg]) => arg.where.id);
    expect(ids).toEqual([NOTEBOOK, MUG]);
  });

  it('rejects unknown products', async () => {
    tx.product.findMany.mockResolvedValue([
      { id: MUG, name: 'Mug', priceCents: 3990 },
    ]);
    await expect(
      service.create(USER, {
        items: [
          { productId: MUG, quantity: 1 },
          { productId: NOTEBOOK, quantity: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it('rejects the order when stock is insufficient', async () => {
    tx.product.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.create(USER, { items: [{ productId: MUG, quantity: 5 }] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.orderEvent.create).not.toHaveBeenCalled();
    expect(cart.clear).not.toHaveBeenCalled();
  });

  describe('checkout', () => {
    const line = (productId: string, name: string, unitPriceCents: number) => ({
      productId,
      name,
      unitPriceCents,
      quantity: 2,
    });

    it('rejects an empty cart', async () => {
      await expect(service.checkout(USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tx.product.findMany).not.toHaveBeenCalled();
    });

    it('orders the cart contents when the prices match', async () => {
      cart.get.mockResolvedValue([
        line(MUG, 'Mug', 3990),
        line(NOTEBOOK, 'Notebook', 2490),
      ]);

      const order = await service.checkout(USER);

      expect(order.totalCents).toBe(2 * 3990 + 2 * 2490);
      expect(cart.clear).toHaveBeenCalledWith(USER);
      expect(cart.refresh).not.toHaveBeenCalled();
    });

    it('refreshes the cart and rejects when a price changed or a product is gone', async () => {
      tx.product.findMany.mockResolvedValue([
        { id: MUG, name: 'Mug v2', priceCents: 4990 },
      ]);
      cart.get.mockResolvedValue([
        line(MUG, 'Mug', 3990),
        line(NOTEBOOK, 'Notebook', 2490),
      ]);

      await expect(service.checkout(USER)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(tx.product.updateMany).not.toHaveBeenCalled();
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(cart.refresh).toHaveBeenCalledWith(
        USER,
        new Map([[MUG, { name: 'Mug v2', unitPriceCents: 4990 }]]),
        [NOTEBOOK],
      );
      expect(cart.clear).not.toHaveBeenCalled();
    });
  });

  it("returns 404 for another user's order", async () => {
    tx.order.findFirst.mockResolvedValue(null);
    await expect(service.findOne(USER, 'order-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-x', userId: USER } }),
    );
  });

  describe('invoiceUrl', () => {
    const INVOICE_KEY = 'invoices/order-1.pdf';

    it('presigns a short-lived download for a ready order', async () => {
      tx.order.findFirst.mockResolvedValue({
        id: 'order-1',
        status: 'READY',
        invoiceKey: INVOICE_KEY,
      });
      const link = await service.invoiceUrl(USER, 'order-1');

      expect(link.url).toBe('http://s3.test/invoice');
      expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(storage.presignAttachment).toHaveBeenCalledWith(
        INVOICE_KEY,
        'invoice-order-1.pdf',
        300,
      );
      expect(tx.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1', userId: USER } }),
      );
    });

    it("returns 404 for another user's order", async () => {
      tx.order.findFirst.mockResolvedValue(null);
      await expect(service.invoiceUrl(USER, 'order-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([
      { status: 'PROCESSING', invoiceKey: null },
      { status: 'CANCELLED', invoiceKey: INVOICE_KEY },
      { status: 'READY', invoiceKey: null },
    ])('returns 409 when $status with key $invoiceKey', async (order) => {
      tx.order.findFirst.mockResolvedValue({ id: 'order-1', ...order });
      await expect(service.invoiceUrl(USER, 'order-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(storage.presignAttachment).not.toHaveBeenCalled();
    });
  });
});
