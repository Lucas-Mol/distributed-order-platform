import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoService } from '../dynamo/dynamo.service.js';
import {
  DynamoProductCache,
  PRODUCT_CACHE_TTL_SECONDS,
} from './product-cache.js';

const PRODUCT = {
  id: '8ec62dad-7ed4-4812-861d-5b8ca2a3a321',
  name: 'Mug',
  description: null,
  priceCents: 3990,
  imageKey: null,
  stock: 7,
  createdAt: new Date('2026-01-15T12:00:00.000Z'),
};

describe('DynamoProductCache', () => {
  let send: ReturnType<typeof vi.fn>;
  let cache: DynamoProductCache;
  const now = () => Math.floor(Date.now() / 1000);

  beforeEach(() => {
    send = vi.fn();
    cache = new DynamoProductCache({
      client: { send },
      productCacheTable: 'product_cache',
    } as unknown as DynamoService);
  });

  const item = (ttl: number) => ({
    product_id: PRODUCT.id,
    name: PRODUCT.name,
    description: null,
    priceCents: PRODUCT.priceCents,
    imageKey: null,
    stock: PRODUCT.stock,
    createdAt: PRODUCT.createdAt.toISOString(),
    ttl,
  });

  it('returns a live entry as a product', async () => {
    send.mockResolvedValue({ Item: item(now() + 30) });

    await expect(cache.get(PRODUCT.id)).resolves.toEqual(PRODUCT);
  });

  it('treats expired entries, misses and errors as misses', async () => {
    send.mockResolvedValueOnce({ Item: item(now() - 1) });
    await expect(cache.get(PRODUCT.id)).resolves.toBeNull();

    send.mockResolvedValueOnce({});
    await expect(cache.get(PRODUCT.id)).resolves.toBeNull();

    send.mockRejectedValueOnce(new Error('dynamo down'));
    await expect(cache.get(PRODUCT.id)).resolves.toBeNull();
  });

  it('writes entries with a TTL and swallows failures', async () => {
    send.mockResolvedValueOnce({});
    await cache.put(PRODUCT);

    const { input } = send.mock.calls[0][0] as PutCommand;
    expect(input.Item).toEqual(item(expect.any(Number) as unknown as number));
    expect(input.Item!.ttl).toBeGreaterThanOrEqual(
      now() + PRODUCT_CACHE_TTL_SECONDS - 1,
    );

    send.mockRejectedValueOnce(new Error('dynamo down'));
    await expect(cache.put(PRODUCT)).resolves.toBeUndefined();
  });

  it('decrements only cached entries and ignores missing ones', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new ConditionalCheckFailedException({ message: 'x', $metadata: {} }),
      );

    await expect(
      cache.decrementStock(
        new Map([
          [PRODUCT.id, 2],
          ['other', 1],
        ]),
      ),
    ).resolves.toBeUndefined();

    const { input } = send.mock.calls[0][0] as UpdateCommand;
    expect(input).toMatchObject({
      Key: { product_id: PRODUCT.id },
      UpdateExpression: 'ADD stock :delta',
      ConditionExpression: 'attribute_exists(product_id)',
      ExpressionAttributeValues: { ':delta': -2 },
    });
  });
});
