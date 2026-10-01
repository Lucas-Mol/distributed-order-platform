import { defineConfig } from 'prisma/config';

// DATABASE_URL is only set by scripts/with-database-url.ts, which builds it
// from the `database` secret. `prisma generate` does not need it.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
