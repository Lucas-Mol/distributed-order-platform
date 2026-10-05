import { Role } from '../src/generated/prisma/client.js';
import { TestApp } from './test-app.js';

describe('product search (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await TestApp.create();
    await t.reset();
    const manager = await t.userWithRole('manager@example.com', Role.MANAGER);
    for (const product of [
      { name: 'Margherita Pizza', description: 'Tomato and basil' },
      { name: 'Caesar Salad', description: 'Romaine, croutons and parmesan' },
      { name: 'Lemonade' },
    ]) {
      await t
        .http()
        .post('/products')
        .set('Authorization', `Bearer ${manager}`)
        .send({ ...product, priceCents: 1000, stock: 5 })
        .expect(201);
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  const search = (q: string) =>
    t
      .http()
      .get('/products')
      .query({ q })
      .expect(200)
      .then((res) => (res.body as { name: string }[]).map((p) => p.name));

  it('matches the name, ignoring case', async () => {
    expect(await search('PIZZA')).toEqual(['Margherita Pizza']);
  });

  it('matches the description', async () => {
    expect(await search('parmesan')).toEqual(['Caesar Salad']);
  });

  it('returns everything for a blank query', async () => {
    expect(await search('   ')).toHaveLength(3);
  });

  it('treats LIKE wildcards as plain text', async () => {
    expect(await search('%')).toEqual([]);
    expect(await search('_')).toEqual([]);
  });

  it('returns nothing when no product matches', async () => {
    expect(await search('sushi')).toEqual([]);
  });

  it('rejects an overly long query', async () => {
    await t
      .http()
      .get('/products')
      .query({ q: 'x'.repeat(101) })
      .expect(400);
  });
});
