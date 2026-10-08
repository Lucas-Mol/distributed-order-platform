import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Injectable, Logger } from '@nestjs/common';
import { DynamoService } from '../dynamo/dynamo.service.js';
import type { Product } from '../generated/prisma/client.js';

export const PRODUCT_CACHE_TTL_SECONDS = 300;

export abstract class ProductCache {
  abstract get(productId: string): Promise<Product | null>;
  abstract put(product: Product): Promise<void>;
  abstract delete(productId: string): Promise<void>;
  abstract decrementStock(quantities: Map<string, number>): Promise<void>;
}

interface ProductCacheItem {
  product_id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageKey: string | null;
  stock: number;
  createdAt: string;
  ttl: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class DynamoProductCache extends ProductCache {
  private readonly logger = new Logger(DynamoProductCache.name);

  constructor(private readonly dynamo: DynamoService) {
    super();
  }

  async get(productId: string): Promise<Product | null> {
    try {
      const { Item } = await this.dynamo.client.send(
        new GetCommand({
          TableName: this.dynamo.productCacheTable,
          Key: { product_id: productId },
        }),
      );
      const item = Item as ProductCacheItem | undefined;
      if (!item || item.ttl <= nowSeconds()) {
        return null;
      }
      return {
        id: item.product_id,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        imageKey: item.imageKey,
        stock: item.stock,
        createdAt: new Date(item.createdAt),
      };
    } catch (error) {
      this.logger.warn(`Product cache read failed: ${message(error)}`);
      return null;
    }
  }

  async put(product: Product): Promise<void> {
    try {
      await this.dynamo.client.send(
        new PutCommand({
          TableName: this.dynamo.productCacheTable,
          Item: {
            product_id: product.id,
            name: product.name,
            description: product.description,
            priceCents: product.priceCents,
            imageKey: product.imageKey,
            stock: product.stock,
            createdAt: product.createdAt.toISOString(),
            ttl: nowSeconds() + PRODUCT_CACHE_TTL_SECONDS,
          } satisfies ProductCacheItem,
        }),
      );
    } catch (error) {
      this.logger.warn(`Product cache write failed: ${message(error)}`);
    }
  }

  async delete(productId: string): Promise<void> {
    try {
      await this.dynamo.client.send(
        new DeleteCommand({
          TableName: this.dynamo.productCacheTable,
          Key: { product_id: productId },
        }),
      );
    } catch (error) {
      this.logger.warn(`Product cache delete failed: ${message(error)}`);
    }
  }

  async decrementStock(quantities: Map<string, number>): Promise<void> {
    await Promise.all(
      [...quantities].map(async ([productId, quantity]) => {
        try {
          await this.dynamo.client.send(
            new UpdateCommand({
              TableName: this.dynamo.productCacheTable,
              Key: { product_id: productId },
              UpdateExpression: 'ADD stock :delta',
              ConditionExpression: 'attribute_exists(product_id)',
              ExpressionAttributeValues: { ':delta': -quantity },
            }),
          );
        } catch (error) {
          if (!(error instanceof ConditionalCheckFailedException)) {
            this.logger.warn(
              `Product cache stock update failed: ${message(error)}`,
            );
          }
        }
      }),
    );
  }
}
