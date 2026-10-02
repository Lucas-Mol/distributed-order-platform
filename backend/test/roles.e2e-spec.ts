import { Role } from '../src/generated/prisma/client.js';
import { TestApp } from './test-app.js';

describe('roles (e2e)', () => {
  let t: TestApp;
  let customer: string;
  let manager: string;
  let admin: string;

  beforeAll(async () => {
    t = await TestApp.create();
  });

  beforeEach(async () => {
    await t.reset();
    customer = await t.userWithRole('customer@example.com');
    manager = await t.userWithRole('manager@example.com', Role.MANAGER);
    admin = await t.userWithRole('admin@example.com', Role.ADMIN);
  });

  afterAll(async () => {
    await t?.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const product = { name: 'Lamp', priceCents: 5000, stock: 3 };

  it('CUSTOMER can shop but cannot manage products or users', async () => {
    const productId = await t.createProduct(manager, 3);

    await t
      .http()
      .post('/products')
      .set(auth(customer))
      .send(product)
      .expect(403);
    await t
      .http()
      .patch(`/products/${productId}`)
      .set(auth(customer))
      .send({ stock: 99 })
      .expect(403);
    await t
      .http()
      .delete(`/products/${productId}`)
      .set(auth(customer))
      .expect(403);
    await t.http().get('/users').set(auth(customer)).expect(403);

    await t
      .http()
      .post('/orders')
      .set(auth(customer))
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);
  });

  it('MANAGER manages products but not users', async () => {
    const created = await t
      .http()
      .post('/products')
      .set(auth(manager))
      .send(product)
      .expect(201);
    await t
      .http()
      .patch(`/products/${created.body.id}`)
      .set(auth(manager))
      .send({ stock: 10 })
      .expect(200);
    await t
      .http()
      .delete(`/products/${created.body.id}`)
      .set(auth(manager))
      .expect(204);

    await t.http().get('/users').set(auth(manager)).expect(403);
  });

  it('ADMIN can do everything, including changing roles', async () => {
    await t.http().post('/products').set(auth(admin)).send(product).expect(201);

    const users = await t.http().get('/users').set(auth(admin)).expect(200);
    expect(users.body).toHaveLength(3);
    expect(users.body[0]).not.toHaveProperty('passwordHash');

    const target = users.body.find(
      (u: { email: string }) => u.email === 'customer@example.com',
    );
    const res = await t
      .http()
      .patch(`/users/${target.id}/role`)
      .set(auth(admin))
      .send({ role: 'MANAGER' })
      .expect(200);
    expect(res.body.role).toBe('MANAGER');

    await t
      .http()
      .post('/products')
      .set(auth(customer))
      .send(product)
      .expect(201);
  });

  it('a demotion takes effect immediately on existing tokens', async () => {
    const users = await t.http().get('/users').set(auth(admin)).expect(200);
    const target = users.body.find(
      (u: { email: string }) => u.email === 'manager@example.com',
    );
    await t
      .http()
      .patch(`/users/${target.id}/role`)
      .set(auth(admin))
      .send({ role: 'CUSTOMER' })
      .expect(200);

    await t
      .http()
      .post('/products')
      .set(auth(manager))
      .send(product)
      .expect(403);
  });

  it('ADMIN cannot change their own role; invalid roles are rejected', async () => {
    const me = await t.http().get('/users/me').set(auth(admin)).expect(200);
    expect(me.body.role).toBe('ADMIN');

    await t
      .http()
      .patch(`/users/${me.body.id}/role`)
      .set(auth(admin))
      .send({ role: 'CUSTOMER' })
      .expect(400);

    const users = await t.http().get('/users').set(auth(admin)).expect(200);
    await t
      .http()
      .patch(`/users/${users.body[0].id}/role`)
      .set(auth(admin))
      .send({ role: 'SUPERUSER' })
      .expect(400);
  });

  it('a deleted account can no longer use its token', async () => {
    await t.prisma.user.delete({ where: { email: 'customer@example.com' } });
    await t.http().get('/cart').set(auth(customer)).expect(401);
  });
});
