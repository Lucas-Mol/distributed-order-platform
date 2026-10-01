import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set; run through `npm run db:seed`');
  process.exit(1);
}

const products = [
  {
    id: 'b2921e9c-c14d-4380-8f87-ed1904a1e5e1',
    name: 'Classic T-shirt',
    description: '100% cotton, unisex fit',
    priceCents: 6490,
    stock: 50,
  },
  {
    id: 'c6b8c130-2380-4379-922c-16d587fb0992',
    name: 'Canvas Sneakers',
    description: 'Lightweight everyday sneakers',
    priceCents: 18990,
    stock: 20,
  },
  {
    id: '8ec62dad-7ed4-4812-861d-5b8ca2a3a321',
    name: 'Ceramic Mug',
    description: '350 ml, dishwasher safe',
    priceCents: 3990,
    stock: 100,
  },
  {
    id: '471b1ac1-0eee-441c-ad15-1e8d91d57c8d',
    name: 'Laptop Backpack',
    description: 'Water-resistant, fits 15" laptops',
    priceCents: 24990,
    stock: 15,
  },
  {
    id: '29f1fdeb-bb70-4da0-ab11-2d2e7dafdac9',
    name: 'Notebook A5',
    description: 'Dotted pages, 120 sheets',
    priceCents: 2490,
    stock: 200,
  },
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

try {
  for (const { id, ...data } of products) {
    await prisma.product.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
  console.log(`[seed] ${products.length} products upserted`);
} catch (error) {
  console.error(
    '[seed] failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
