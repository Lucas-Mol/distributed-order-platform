import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import type { AppConfig } from '../src/config/app-config.js';
import { appConfig } from '../src/config/app.config.js';
import type { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { testDatabaseConfig } from './test-database.js';

export const PASSWORD = 'supersecret1';

export function testConfig(
  rateLimit: Partial<AppConfig['rateLimit']> = {},
): AppConfig {
  return {
    env: 'test',
    port: 0,
    database: testDatabaseConfig(),
    jwt: { secret: randomBytes(48).toString('hex'), expiresIn: '15m' },
    rateLimit: { ttlSeconds: 60, max: 10_000, authMax: 10_000, ...rateLimit },
    aws: {
      s3Bucket: 'test-bucket',
      s3ProductImagePrefix: 'products/',
      s3InvoicePrefix: 'invoices/',
      sqsOrdersQueue: 'orders-queue',
      dynamoCartsTable: 'carts',
      dynamoStockCacheTable: 'stock_cache',
    },
  };
}

export class TestApp {
  private constructor(
    readonly app: INestApplication<App>,
    readonly prisma: PrismaService,
  ) {}

  static async create(config: AppConfig = testConfig()): Promise<TestApp> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(appConfig.KEY)
      .useValue(config)
      .compile();
    const app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.listen(0);
    return new TestApp(app, app.get(PrismaService));
  }

  http() {
    return request(this.app.getHttpServer());
  }

  async reset(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      'TRUNCATE cart_items, payments, order_items, orders, products, users CASCADE',
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
