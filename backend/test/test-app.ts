import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import {
  type CartLine,
  CartLimitError,
  type CartProduct,
  CartStore,
  limitMessage,
  MAX_CART_PRODUCTS,
} from '../src/cart/cart.store.js';
import type { AppConfig } from '../src/config/app-config.js';
import { appConfig } from '../src/config/app.config.js';
import type { Product, Role } from '../src/generated/prisma/client.js';
import { MAX_ITEM_QUANTITY } from '../src/orders/dto/create-order.dto.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ProductCache } from '../src/product-cache/product-cache.js';
import {
  QueuePublisher,
  type QueueName,
} from '../src/queue/queue-publisher.js';
import { testDatabaseConfig } from './test-database.js';

export const PASSWORD = 'supersecret1';

export function testConfig(
  rateLimit: Partial<AppConfig['rateLimit']> = {},
  trustedProxies: string[] = [],
): AppConfig {
  return {
    env: 'test',
    port: 0,
    database: testDatabaseConfig(),
    jwt: { secret: randomBytes(48).toString('hex'), expiresIn: '15m' },
    rateLimit: { ttlSeconds: 60, max: 10_000, authMax: 10_000, ...rateLimit },
    trustedProxies,
    outbox: { pollIntervalMs: 0 },
    aws: {
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
      s3Bucket: 'test-bucket',
      s3PublicEndpoint: 'http://localhost:4566',
      s3ProductImagePrefix: 'products/',
      s3ThumbnailPrefix: 'thumbnails/',
      s3InvoicePrefix: 'invoices/',
      sqsOrdersQueue: 'orders-queue',
      dynamoCartsTable: 'carts',
      dynamoProductCacheTable: 'product_cache',
    },
  };
}

export class FakeQueuePublisher extends QueuePublisher {
  readonly messages: { queue: QueueName; body: string }[] = [];
  failWith: Error | null = null;

  publish(queue: QueueName, body: string): Promise<void> {
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    this.messages.push({ queue, body });
    return Promise.resolve();
  }
}

export class FakeCartStore extends CartStore {
  readonly carts = new Map<string, Map<string, CartLine>>();

  get(userId: string): Promise<CartLine[]> {
    return Promise.resolve(this.lines(userId));
  }

  add(
    userId: string,
    productId: string,
    product: CartProduct,
    quantity: number,
  ): Promise<CartLine[]> {
    const cart = this.carts.get(userId) ?? new Map<string, CartLine>();
    const existing = cart.get(productId);
    if (
      (existing && existing.quantity + quantity > MAX_ITEM_QUANTITY) ||
      (!existing && cart.size >= MAX_CART_PRODUCTS)
    ) {
      return Promise.reject(
        new CartLimitError(
          limitMessage(this.lines(userId), productId, quantity),
        ),
      );
    }
    cart.set(productId, {
      productId,
      ...product,
      quantity: (existing?.quantity ?? 0) + quantity,
    });
    this.carts.set(userId, cart);
    return Promise.resolve(this.lines(userId));
  }

  setQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartLine[] | null> {
    const line = this.carts.get(userId)?.get(productId);
    if (!line) {
      return Promise.resolve(null);
    }
    line.quantity = quantity;
    return Promise.resolve(this.lines(userId));
  }

  remove(userId: string, productId: string): Promise<void> {
    this.carts.get(userId)?.delete(productId);
    return Promise.resolve();
  }

  clear(userId: string): Promise<void> {
    this.carts.delete(userId);
    return Promise.resolve();
  }

  refresh(
    userId: string,
    products: Map<string, CartProduct>,
    removed: string[],
  ): Promise<void> {
    const cart = this.carts.get(userId);
    products.forEach((product, productId) => {
      const line = cart?.get(productId);
      if (line) {
        Object.assign(line, product);
      }
    });
    removed.forEach((productId) => cart?.delete(productId));
    return Promise.resolve();
  }

  private lines(userId: string): CartLine[] {
    return [...(this.carts.get(userId)?.values() ?? [])]
      .map((line) => ({ ...line }))
      .sort((a, b) => a.productId.localeCompare(b.productId));
  }
}

export class FakeProductCache extends ProductCache {
  readonly products = new Map<string, Product>();

  get(productId: string): Promise<Product | null> {
    const product = this.products.get(productId);
    return Promise.resolve(product ? { ...product } : null);
  }

  put(product: Product): Promise<void> {
    this.products.set(product.id, { ...product });
    return Promise.resolve();
  }

  delete(productId: string): Promise<void> {
    this.products.delete(productId);
    return Promise.resolve();
  }

  decrementStock(quantities: Map<string, number>): Promise<void> {
    quantities.forEach((quantity, productId) => {
      const product = this.products.get(productId);
      if (product) {
        product.stock -= quantity;
      }
    });
    return Promise.resolve();
  }
}

export class TestApp {
  private constructor(
    readonly app: INestApplication<App>,
    readonly prisma: PrismaService,
    readonly queue: FakeQueuePublisher,
    readonly cart: FakeCartStore,
    readonly productCache: FakeProductCache,
  ) {}

  static async create(
    config: AppConfig = testConfig(),
    customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) =>
      b,
  ): Promise<TestApp> {
    const queue = new FakeQueuePublisher();
    const cart = new FakeCartStore();
    const productCache = new FakeProductCache();
    const moduleRef = await customize(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(appConfig.KEY)
        .useValue(config)
        .overrideProvider(QueuePublisher)
        .useValue(queue)
        .overrideProvider(CartStore)
        .useValue(cart)
        .overrideProvider(ProductCache)
        .useValue(productCache),
    ).compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.listen(0);
    return new TestApp(app, app.get(PrismaService), queue, cart, productCache);
  }

  http() {
    return request(this.app.getHttpServer());
  }

  async reset(): Promise<void> {
    this.cart.carts.clear();
    this.productCache.products.clear();
    await this.prisma.$executeRawUnsafe(
      'TRUNCATE payments, order_events, order_items, orders, products, users CASCADE',
    );
  }

  register(email: string, password = PASSWORD) {
    return this.http().post('/auth/register').send({ email, password });
  }

  async login(email: string, password = PASSWORD): Promise<string> {
    const res = await this.http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  async userWithRole(email: string, role?: Role): Promise<string> {
    await this.register(email).expect(201);
    if (role) {
      await this.prisma.user.update({ where: { email }, data: { role } });
    }
    return this.login(email);
  }

  async createProduct(managerToken: string, stock: number, priceCents = 1500) {
    const res = await this.http()
      .post('/products')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Test product', priceCents, stock })
      .expect(201);
    return res.body.id as string;
  }

  close(): Promise<void> {
    return this.app.close();
  }
}
