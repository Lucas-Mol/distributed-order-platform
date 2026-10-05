import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
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
    cartItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

describe('OrdersService', () => {
  let service: OrdersService;
  let tx: ReturnType<typeof createTx>;

  beforeEach(async () => {
    tx = createTx();
    const prisma = {
      ...tx,
      $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: PrismaService, useValue: prisma }],
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
    expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER },
    });
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
});
