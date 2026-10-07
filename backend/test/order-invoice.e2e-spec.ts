import { OrderStatus, Role } from '../src/generated/prisma/client.js';
import { StorageService } from '../src/storage/storage.service.js';
import { TestApp, testConfig } from './test-app.js';

class FakeStorage {
  presigned: { key: string; filename: string; expiresIn: number }[] = [];

  presignAttachment(key: string, filename: string, expiresIn: number) {
    this.presigned.push({ key, filename, expiresIn });
    return Promise.resolve(`http://s3.test/${key}`);
  }
}

describe('order invoice download (e2e)', () => {
  let t: TestApp;
  let storage: FakeStorage;
  let manager: string;

  beforeAll(async () => {
    storage = new FakeStorage();
    t = await TestApp.create(testConfig(), (builder) =>
      builder.overrideProvider(StorageService).useValue(storage),
    );
  });

  beforeEach(async () => {
    await t.reset();
    storage.presigned = [];
    manager = await t.userWithRole('manager@example.com', Role.MANAGER);
  });

  afterAll(async () => {
    await t?.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function placeOrder(token: string) {
    const productId = await t.createProduct(manager, 10);
    const res = await t
      .http()
      .post('/orders')
      .set(auth(token))
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);
    return res.body.id as string;
  }

  async function markReady(orderId: string) {
    await t.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.READY,
        invoiceKey: `invoices/${orderId}.pdf`,
      },
    });
  }

  it('returns a presigned attachment link once the order is ready', async () => {
    const customer = await t.userWithRole('alice@example.com');
    const orderId = await placeOrder(customer);

    await t
      .http()
      .get(`/orders/${orderId}/invoice`)
      .set(auth(customer))
      .expect(409);

    await markReady(orderId);
    const res = await t
      .http()
      .get(`/orders/${orderId}/invoice`)
      .set(auth(customer))
      .expect(200);

    expect(res.body.url).toBe(`http://s3.test/invoices/${orderId}.pdf`);
    expect(storage.presigned).toEqual([
      {
        key: `invoices/${orderId}.pdf`,
        filename: `invoice-${orderId}.pdf`,
        expiresIn: 300,
      },
    ]);
    expect(Date.parse(res.body.expiresAt as string)).toBeGreaterThan(
      Date.now(),
    );
  });

  it("does not reveal another customer's invoice", async () => {
    const alice = await t.userWithRole('alice@example.com');
    const bob = await t.userWithRole('bob@example.com');
    const orderId = await placeOrder(alice);
    await markReady(orderId);

    await t.http().get(`/orders/${orderId}/invoice`).set(auth(bob)).expect(404);
    expect(storage.presigned).toEqual([]);
  });

  it('requires authentication and a valid id', async () => {
    const customer = await t.userWithRole('alice@example.com');
    const orderId = await placeOrder(customer);

    await t.http().get(`/orders/${orderId}/invoice`).expect(401);
    await t
      .http()
      .get('/orders/not-a-uuid/invoice')
      .set(auth(customer))
      .expect(400);
  });
});
