import type { DatabaseConfig } from '../src/config/app-config.js';

export function testDatabaseUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    throw new Error(
      'TEST_DATABASE_URL is required, e.g. postgresql://orders:orders@localhost:5432/orders_test',
    );
  }
  const url = new URL(raw);
  if (!url.pathname.slice(1).endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must point to a database ending in _test',
    );
  }
  return url;
}

export function testDatabaseConfig(): DatabaseConfig {
  const url = testDatabaseUrl();
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    dbname: url.pathname.slice(1),
  };
}
