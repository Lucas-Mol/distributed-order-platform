import { Role } from '../src/generated/prisma/client.js';
import type { StoredObject } from '../src/storage/storage.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { TestApp, testConfig } from './test-app.js';

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);

class FakeStorage {
  objects = new Map<string, StoredObject & { body: Uint8Array }>();
  deleted: string[] = [];

  presignUpload(key: string) {
    return Promise.resolve(`http://s3.test/upload/${key}`);
  }

  presignDownload(key: string) {
    return Promise.resolve(`http://s3.test/${key}`);
  }

  head(key: string) {
    const object = this.objects.get(key);
    return Promise.resolve(
      object ? { size: object.size, contentType: object.contentType } : null,
    );
  }

  readStart(key: string, bytes: number) {
    return Promise.resolve(this.objects.get(key)!.body.slice(0, bytes));
  }

  deleteQuietly(keys: string[]) {
    this.deleted.push(...keys);
    keys.forEach((key) => this.objects.delete(key));
    return Promise.resolve();
  }

  put(key: string, body: Uint8Array, contentType: string, size = body.length) {
    this.objects.set(key, { body, contentType, size });
  }
}

describe('product images (e2e)', () => {
  let t: TestApp;
  let storage: FakeStorage;
  let manager: string;
  let customer: string;
  let productId: string;

  beforeAll(async () => {
    storage = new FakeStorage();
    t = await TestApp.create(testConfig(), (builder) =>
      builder.overrideProvider(StorageService).useValue(storage),
    );
  });

  beforeEach(async () => {
    await t.reset();
    storage.objects.clear();
    storage.deleted = [];
    manager = await t.userWithRole('manager@example.com', Role.MANAGER);
    customer = await t.userWithRole('customer@example.com');
    productId = await t.createProduct(manager, 5);
  });

  afterAll(async () => {
    await t?.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const requestUpload = (token: string, body: object) =>
    t
      .http()
      .post(`/products/${productId}/image-upload-url`)
      .set(auth(token))
      .send(body);

  const attach = (key: string) =>
    t
      .http()
      .put(`/products/${productId}/image`)
      .set(auth(manager))
      .send({ key });

  async function uploadPng(): Promise<string> {
    const res = await requestUpload(manager, {
      contentType: 'image/png',
      contentLength: PNG.length,
    }).expect(201);
    const key = res.body.key as string;
    storage.put(key, PNG, 'image/png');
    return key;
  }

  it('only lets managers request upload URLs', async () => {
    await requestUpload(customer, {
      contentType: 'image/png',
      contentLength: 10,
    }).expect(403);

    const res = await requestUpload(manager, {
      contentType: 'image/jpeg',
      contentLength: 10,
    }).expect(201);
    expect(res.body.key).toMatch(
      new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(res.body.uploadUrl).toContain(res.body.key);
  });

  it.each([
    [{ contentType: 'image/gif', contentLength: 10 }],
    [{ contentType: 'image/png', contentLength: 5 * 1024 * 1024 + 1 }],
    [{ contentType: 'image/png', contentLength: 0 }],
  ])('rejects an invalid upload request %j', async (body) => {
    await requestUpload(manager, body).expect(400);
  });

  it('attaches a verified upload and exposes image and thumbnail URLs', async () => {
    const key = await uploadPng();
    const res = await attach(key).expect(200);
    expect(res.body).toMatchObject({
      imageKey: key,
      imageUrl: `http://s3.test/${key}`,
      thumbnailUrl: `http://s3.test/thumbnails/${key.replace('.png', '.jpg')}`,
    });

    const list = await t.http().get('/products').expect(200);
    expect(list.body[0].imageUrl).toBe(`http://s3.test/${key}`);
  });

  it('rejects keys that were not issued for the product', async () => {
    const otherId = await t.createProduct(manager, 1);
    const key = `products/${otherId}/0b1c2d3e-4f50-4a1b-8c2d-3e4f5a6b7c8d.png`;
    storage.put(key, PNG, 'image/png');
    await attach(key).expect(400);
  });

  it('rejects a key that was never uploaded', async () => {
    const res = await requestUpload(manager, {
      contentType: 'image/png',
      contentLength: 10,
    }).expect(201);
    await attach(res.body.key).expect(400);
  });

  it('deletes uploads whose content is not the declared image type', async () => {
    const res = await requestUpload(manager, {
      contentType: 'image/png',
      contentLength: 20,
    }).expect(201);
    const key = res.body.key as string;
    storage.put(key, new TextEncoder().encode('<html><script>'), 'image/png');

    await attach(key).expect(400);
    expect(storage.deleted).toContain(key);
  });

  it('deletes oversized uploads', async () => {
    const key = await uploadPng();
    storage.put(key, PNG, 'image/png', 5 * 1024 * 1024 + 1);
    await attach(key).expect(400);
    expect(storage.deleted).toContain(key);
  });

  it('removes the old image and thumbnail when replaced, removed or deleted', async () => {
    const first = await uploadPng();
    await attach(first).expect(200);
    const second = await uploadPng();
    await attach(second).expect(200);
    const thumbOf = (key: string) =>
      `thumbnails/${key.replace('.png', '.jpg')}`;
    expect(storage.deleted).toEqual([first, thumbOf(first)]);

    await t
      .http()
      .delete(`/products/${productId}/image`)
      .set(auth(manager))
      .expect(200)
      .expect((res) => expect(res.body.imageUrl).toBeNull());
    expect(storage.deleted).toContain(thumbOf(second));

    const third = await uploadPng();
    await attach(third).expect(200);
    await t
      .http()
      .delete(`/products/${productId}`)
      .set(auth(manager))
      .expect(204);
    expect(storage.deleted).toEqual(
      expect.arrayContaining([third, thumbOf(third)]),
    );
  });
});
