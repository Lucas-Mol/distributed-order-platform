import { Role } from '../src/generated/prisma/client.js';
import { OrderEventsDispatcher } from '../src/orders/order-events.dispatcher.js';
import { TestApp } from './test-app.js';

describe('order.created outbox (e2e)', () => {
  let t: TestApp;
  let dispatcher: OrderEventsDispatcher;
  let manager: string;

  beforeAll(async () => {
    t = await TestApp.create();
    dispatcher = t.app.get(OrderEventsDispatcher);
  });

  beforeEach(async () => {
    await t.reset();
    t.queue.messages.length = 0;
    t.queue.failWith = null;
    manager = await t.userWithRole('manager@example.com', Role.MANAGER);
  });

  afterAll(async () => {
    await t?.close();
  });

  async function placeOrder(email: string) {
    const token = await t.userWithRole(email);
    const productId = await t.createProduct(manager, 10, 1500);
    const res = await t
      .http()
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId, quantity: 2 }] })
      .expect(201);
    return { orderId: res.body.id as string, productId };
  }

  it('stores the event with the order and publishes it once', async () => {
    const { orderId, productId } = await placeOrder('alice@example.com');

    const pending = await t.prisma.orderEvent.findMany({ where: { orderId } });
    expect(pending).toHaveLength(1);
    expect(pending[0].publishedAt).toBeNull();

    expect(await dispatcher.dispatchPending()).toEqual({
      published: 1,
      failed: 0,
    });
    expect(await dispatcher.dispatchPending()).toEqual({
      published: 0,
      failed: 0,
    });

    expect(t.queue.messages).toHaveLength(1);
    const message = JSON.parse(t.queue.messages[0].body);
    expect(message).toEqual({
      event: 'order.created',
      version: 1,
      occurred_at: expect.stringMatching(/Z$/),
      data: {
        order_id: orderId,
        user_id: expect.any(String),
        user_email: 'alice@example.com',
        total_cents: 3000,
        items: [
          {
            product_id: productId,
            name: 'Test product',
            quantity: 2,
            unit_price_cents: 1500,
          },
        ],
      },
    });

    const order = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PROCESSING');
  });

  it('keeps the event pending and the order CREATED while SQS fails', async () => {
    const { orderId } = await placeOrder('bob@example.com');
    t.queue.failWith = new Error('queue unavailable');

    expect(await dispatcher.dispatchPending()).toEqual({
      published: 0,
      failed: 1,
    });

    const event = await t.prisma.orderEvent.findFirstOrThrow({
      where: { orderId },
    });
    expect(event).toMatchObject({
      publishedAt: null,
      attempts: 1,
      lastError: 'queue unavailable',
    });
    const order = await t.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('CREATED');

    t.queue.failWith = null;
    expect(await dispatcher.dispatchPending()).toEqual({
      published: 1,
      failed: 0,
    });
    expect(
      (await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
        .status,
    ).toBe('PROCESSING');
  });

  it('does not write an event when the order is rejected', async () => {
    const token = await t.userWithRole('carol@example.com');
    const productId = await t.createProduct(manager, 1);
    await t
      .http()
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId, quantity: 5 }] })
      .expect(409);

    expect(await t.prisma.orderEvent.count()).toBe(0);
  });
});
