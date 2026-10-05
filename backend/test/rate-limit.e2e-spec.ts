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

describe('rate limiting behind a trusted proxy (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await TestApp.create(
      testConfig({ ttlSeconds: 60, authMax: 3 }, ['loopback']),
    );
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  const login = (ip: string, email: string) =>
    t
      .http()
      .post('/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password: 'wrong-password' });

  it('keeps a separate auth budget per forwarded client IP', async () => {
    for (let i = 0; i < 3; i++) {
      await login('203.0.113.10', `ip-a-${i}@example.com`).expect(401);
    }
    await login('203.0.113.10', 'ip-a-extra@example.com').expect(429);
    await login('203.0.113.20', 'ip-b@example.com').expect(401);
  });

  it('limits attempts against one email even when the IP changes', async () => {
    for (let i = 0; i < 3; i++) {
      await login(`198.51.100.${i + 1}`, ' Victim@Example.com').expect(401);
    }
    const blocked = await login('198.51.100.99', 'victim@example.com').expect(
      429,
    );
    expect(blocked.headers['retry-after-auth-email']).toBeDefined();
  });
});

describe('rate limiting without trusted proxies (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await TestApp.create(testConfig({ ttlSeconds: 60, authMax: 3 }));
    await t.reset();
  });

  afterAll(async () => {
    await t?.close();
  });

  it('ignores a spoofed X-Forwarded-For header', async () => {
    const login = (i: number) =>
      t
        .http()
        .post('/auth/login')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .send({ email: `spoof-${i}@example.com`, password: 'wrong-password' });

    for (let i = 0; i < 3; i++) {
      await login(i).expect(401);
    }
    await login(99).expect(429);
  });
});
