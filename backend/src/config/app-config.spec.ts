import { buildDatabaseUrl } from './app-config.js';

describe('buildDatabaseUrl', () => {
  it('percent-encodes credentials', () => {
    expect(
      buildDatabaseUrl({
        host: 'postgres',
        port: 5432,
        username: 'orders',
        password: 'p@ss/w:rd',
        dbname: 'orders',
      }),
    ).toBe('postgresql://orders:p%40ss%2Fw%3Ard@postgres:5432/orders');
  });
});
