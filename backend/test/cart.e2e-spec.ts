import { Role } from '../src/generated/prisma/client.js';
import { TestApp } from './test-app.js';

describe('cart (e2e)', () => {
  let t: TestApp;
  let manager: string;
  let customer: string;
  let mug: string;
  let notebook: string;

  beforeAll(async () => {
    t = await TestApp.create();
  });

  beforeEach(async () => {
    await t.reset();
    manager = await t.userWithRole('manager@example.com', Role.MANAGER);
    mug = await t.createProduct(manager, 10, 3990);
    notebook = await t.createProduct(manager, 10, 2490);
    customer = await t.userWithRole('customer@example.com');
  });

  afterAll(async () => {
    await t?.close();
  });

  const auth = () => ({ Authorization: `Bearer ${customer}` });
  const add = (productId: string, quantity: number) =>
    t.http().post(`/cart/items/${productId}`).set(auth()).send({ quantity });
  const setQuantity = (productId: string, quantity: number) =>
    t.http().put(`/cart/items/${productId}`).set(auth()).send({ quantity });
  const checkout = () => t.http().post('/orders/checkout').set(auth());
  const getCart = () => t.http().get('/cart').set(auth()).expect(200);

  it('adds incrementally, sets quantities and removes items', async () => {
    await add(mug, 2).expect(200);
    const added = await add(mug, 3).expect(200);
    expect(added.body.items).toEqual([
      {
        productId: mug,
        name: 'Test product',
        unitPriceCents: 3990,
        quantity: 5,
      },
    ]);

    await add(notebook, 1).expect(200);
    const updated = await setQuantity(mug, 1).expect(200);
    expect(updated.body.totalCents).toBe(3990 + 2490);

    await t.http().delete(`/cart/items/${notebook}`).set(auth()).expect(204);
    expect((await getCart()).body.totalCents).toBe(3990);
  });

  it('serves the cart without reading products from Postgres', async () => {
    await add(mug, 1).expect(200);
    await t.prisma.product.update({
      where: { id: mug },
      data: { name: 'Renamed directly' },
    });

    expect((await getCart()).body.items[0].name).toBe('Test product');
  });

  it('enforces the per-product limit and rejects unknown products', async () => {
    await add(mug, 99).expect(200);
    const res = await add(mug, 2).expect(400);
    expect(res.body.message).toContain('currently 99');

    await add('8ec62dad-7ed4-4812-861d-5b8ca2a3a321', 1).expect(404);
    await setQuantity(notebook, 1).expect(404);
  });

  it('checks out the cart and empties it', async () => {
    await add(mug, 2).expect(200);

    const order = await checkout().expect(201);

    expect(order.body.totalCents).toBe(2 * 3990);
    expect((await getCart()).body.items).toEqual([]);
    const product = await t.http().get(`/products/${mug}`).expect(200);
    expect(product.body.stock).toBe(8);
  });

  it('refreshes the cart and asks for review when a price changed', async () => {
    await add(mug, 1).expect(200);
    await t
      .http()
      .patch(`/products/${mug}`)
      .set('Authorization', `Bearer ${manager}`)
      .send({ priceCents: 4990 })
      .expect(200);

    const rejected = await checkout().expect(409);
    expect(rejected.body.message).toContain('changed price');
    expect((await getCart()).body.items[0].unitPriceCents).toBe(4990);

    const order = await checkout().expect(201);
    expect(order.body.totalCents).toBe(4990);
  });

  it('rejects checkout of an empty cart', async () => {
    await checkout().expect(400);
  });
});
