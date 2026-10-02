import { Role } from '../src/generated/prisma/client.js';
import { TestApp } from './test-app.js';

describe('register → login → order (e2e)', () => {
  let t: TestApp;
  let manager: string;

  beforeAll(async () => {
    t = await TestApp.create();
  });

  beforeEach(async () => {
    await t.reset();
    manager = await t.userWithRole('manager@example.com', Role.MANAGER);
  });

  afterAll(async () => {
    await t?.close();
  });

  const order = (token: string, productId: string, quantity: number) =>
    t
      .http()
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ productId, quantity }] });

  it('registers as CUSTOMER, rejects duplicates and never returns the hash', async () => {
    const res = await t.register('Alice@Example.com ').expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: 'alice@example.com',
      role: 'CUSTOMER',
      createdAt: expect.any(String),
    });

    await t.register('alice@example.com').expect(409);
  });

  it('ignores a role sent in the registration payload', async () => {
    await t
      .http()
      .post('/auth/register')
      .send({
        email: 'sneaky@example.com',
        password: 'supersecret1',
        role: 'ADMIN',
      })
      .expect(400);
  });

  it('rejects invalid credentials and unauthenticated requests', async () => {
    await t.register('bob@example.com').expect(201);
    await t
      .http()
      .post('/auth/login')
      .send({ email: 'bob@example.com', password: 'wrong-password' })
      .expect(401);
    await t.http().get('/orders').expect(401);
  });

  it('creates an order with the right total and decrements stock', async () => {
    const token = await t.userWithRole('carol@example.com');
    const productId = await t.createProduct(manager, 10, 1500);

    const res = await order(token, productId, 3).expect(201);

    expect(res.body).toMatchObject({ status: 'CREATED', totalCents: 4500 });
    expect(res.body.items).toEqual([
      expect.objectContaining({ productId, quantity: 3, unitPriceCents: 1500 }),
    ]);

    const product = await t.http().get(`/products/${productId}`).expect(200);
    expect(product.body.stock).toBe(7);

    const list = await t
      .http()
      .get('/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it("returns 404 for another user's order", async () => {
    const dave = await t.userWithRole('dave@example.com');
    const erin = await t.userWithRole('erin@example.com');
    const productId = await t.createProduct(manager, 5);

    const res = await order(dave, productId, 1).expect(201);

    await t
      .http()
      .get(`/orders/${res.body.id}`)
      .set('Authorization', `Bearer ${erin}`)
      .expect(404);
  });

  it('rejects insufficient stock and leaves stock untouched', async () => {
    const token = await t.userWithRole('frank@example.com');
    const productId = await t.createProduct(manager, 2);

    await order(token, productId, 3).expect(409);

    const product = await t.prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stock).toBe(2);
  });

  it('never oversells under concurrent checkouts', async () => {
    const token = await t.userWithRole('grace@example.com');
    const productId = await t.createProduct(manager, 5);

    const results = await Promise.all(
      Array.from({ length: 12 }, () => order(token, productId, 1)),
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(5);
    expect(results.filter((res) => res.status === 409)).toHaveLength(7);

    const product = await t.prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stock).toBe(0);
  });

  it('rejects unknown fields in the payload', async () => {
    await t
      .http()
      .post('/products')
      .set('Authorization', `Bearer ${manager}`)
      .send({ name: 'X', priceCents: 100, stock: 1, imageKey: 'forged' })
      .expect(400);
  });
});
