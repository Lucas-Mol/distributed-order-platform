import { TestApp, testConfig } from './test-app.js';

describe('rate limiting (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await TestApp.create(
      testConfig({ ttlSeconds: 60, max: 8, authMax: 3 }),
    );
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('applies the stricter auth limit to login attempts', async () => {
    const attempt = () =>
      t
        .http()
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'wrong-password' });

    for (let i = 0; i < 3; i++) {
      await attempt().expect(401);
    }
    const blocked = await attempt().expect(429);
    expect(blocked.headers['retry-after-auth']).toBeDefined();
  });

  it('applies the global limit to other routes, but never to /health', async () => {
    for (let i = 0; i < 8; i++) {
      await t.http().get('/products').expect(200);
    }
    await t.http().get('/products').expect(429);

    await t.http().get('/health').expect(200);
  });
});
