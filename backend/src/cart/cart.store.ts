import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { Injectable } from '@nestjs/common';
import { DynamoService } from '../dynamo/dynamo.service.js';
import { MAX_ITEM_QUANTITY } from '../orders/dto/create-order.dto.js';

export const MAX_CART_PRODUCTS = 50;

export interface CartProduct {
  name: string;
  unitPriceCents: number;
}

export interface CartLine extends CartProduct {
  productId: string;
  quantity: number;
}

export class CartLimitError extends Error {}

export abstract class CartStore {
  abstract get(userId: string): Promise<CartLine[]>;
  abstract add(
    userId: string,
    productId: string,
    product: CartProduct,
    quantity: number,
  ): Promise<CartLine[]>;
  abstract setQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartLine[] | null>;
  abstract remove(userId: string, productId: string): Promise<void>;
  abstract clear(userId: string): Promise<void>;
  abstract refresh(
    userId: string,
    products: Map<string, CartProduct>,
    removed: string[],
  ): Promise<void>;
}

interface CartItem {
  user_id: string;
  quantities: Record<string, number>;
  products: Record<string, CartProduct>;
  updated_at: string;
}

const QUANTITIES = 'quantities';
const PRODUCTS = 'products';
const ATTRIBUTE_NAMES = { '#q': QUANTITIES, '#s': PRODUCTS };

export function cartLines(item: CartItem | undefined): CartLine[] {
  if (!item) {
    return [];
  }
  return Object.entries(item.quantities)
    .filter(([productId]) => productId in item.products)
    .map(([productId, quantity]) => ({
      productId,
      ...item.products[productId],
      quantity,
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

export function limitMessage(
  lines: CartLine[],
  productId: string,
  quantity: number,
): string {
  const existing = lines.find((line) => line.productId === productId);
  if (existing) {
    return `You can have at most ${MAX_ITEM_QUANTITY} units of a product in the cart (currently ${existing.quantity}).`;
  }
  if (lines.length >= MAX_CART_PRODUCTS) {
    return `A cart holds at most ${MAX_CART_PRODUCTS} different products.`;
  }
  return `You can have at most ${MAX_ITEM_QUANTITY} units of a product in the cart (requested ${quantity}).`;
}

@Injectable()
export class DynamoCartStore extends CartStore {
  constructor(private readonly dynamo: DynamoService) {
    super();
  }

  async get(userId: string): Promise<CartLine[]> {
    return cartLines(await this.read(userId));
  }

  async add(
    userId: string,
    productId: string,
    product: CartProduct,
    quantity: number,
  ): Promise<CartLine[]> {
    try {
      return await this.increment(userId, productId, product, quantity);
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }
    }

    const current = await this.read(userId);
    if (current) {
      throw new CartLimitError(
        limitMessage(cartLines(current), productId, quantity),
      );
    }
    try {
      const item: CartItem = {
        user_id: userId,
        quantities: { [productId]: quantity },
        products: { [productId]: product },
        updated_at: new Date().toISOString(),
      };
      await this.dynamo.client.send(
        new PutCommand({
          TableName: this.dynamo.cartsTable,
          Item: item,
          ConditionExpression: 'attribute_not_exists(user_id)',
        }),
      );
      return cartLines(item);
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }
      return this.increment(userId, productId, product, quantity);
    }
  }

  async setQuantity(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<CartLine[] | null> {
    try {
      const { Attributes } = await this.dynamo.client.send(
        new UpdateCommand({
          TableName: this.dynamo.cartsTable,
          Key: { user_id: userId },
          UpdateExpression: 'SET #q.#p = :quantity, updated_at = :now',
          ConditionExpression: 'attribute_exists(#q.#p)',
          ExpressionAttributeNames: { '#q': QUANTITIES, '#p': productId },
          ExpressionAttributeValues: {
            ':quantity': quantity,
            ':now': new Date().toISOString(),
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return cartLines(Attributes as CartItem);
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return null;
      }
      throw error;
    }
  }

  async remove(userId: string, productId: string): Promise<void> {
    try {
      await this.dynamo.client.send(
        new UpdateCommand({
          TableName: this.dynamo.cartsTable,
          Key: { user_id: userId },
          UpdateExpression: 'REMOVE #q.#p, #s.#p SET updated_at = :now',
          ConditionExpression: 'attribute_exists(user_id)',
          ExpressionAttributeNames: { ...ATTRIBUTE_NAMES, '#p': productId },
          ExpressionAttributeValues: { ':now': new Date().toISOString() },
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }
    }
  }

  async clear(userId: string): Promise<void> {
    await this.dynamo.client.send(
      new DeleteCommand({
        TableName: this.dynamo.cartsTable,
        Key: { user_id: userId },
      }),
    );
  }

  async refresh(
    userId: string,
    products: Map<string, CartProduct>,
    removed: string[],
  ): Promise<void> {
    if (products.size === 0 && removed.length === 0) {
      return;
    }
    const names: Record<string, string> = { '#s': PRODUCTS };
    const values: Record<string, unknown> = {
      ':now': new Date().toISOString(),
    };
    const sets = ['updated_at = :now'];
    const removes: string[] = [];
    [...products].forEach(([productId, product], i) => {
      names[`#u${i}`] = productId;
      values[`:u${i}`] = product;
      sets.push(`#s.#u${i} = :u${i}`);
    });
    if (removed.length > 0) {
      names['#q'] = QUANTITIES;
    }
    removed.forEach((productId, i) => {
      names[`#r${i}`] = productId;
      removes.push(`#q.#r${i}`, `#s.#r${i}`);
    });
    try {
      await this.dynamo.client.send(
        new UpdateCommand({
          TableName: this.dynamo.cartsTable,
          Key: { user_id: userId },
          UpdateExpression:
            `SET ${sets.join(', ')}` +
            (removes.length > 0 ? ` REMOVE ${removes.join(', ')}` : ''),
          ConditionExpression: 'attribute_exists(user_id)',
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        }),
      );
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) {
        throw error;
      }
    }
  }

  private async read(userId: string): Promise<CartItem | undefined> {
    const { Item } = await this.dynamo.client.send(
      new GetCommand({
        TableName: this.dynamo.cartsTable,
        Key: { user_id: userId },
        ConsistentRead: true,
      }),
    );
    return Item as CartItem | undefined;
  }

  private async increment(
    userId: string,
    productId: string,
    product: CartProduct,
    quantity: number,
  ): Promise<CartLine[]> {
    const { Attributes } = await this.dynamo.client.send(
      new UpdateCommand({
        TableName: this.dynamo.cartsTable,
        Key: { user_id: userId },
        UpdateExpression:
          'SET #q.#p = if_not_exists(#q.#p, :zero) + :quantity, #s.#p = :product, updated_at = :now',
        ConditionExpression:
          'attribute_exists(user_id)' +
          ' AND (attribute_exists(#q.#p) OR size(#q) < :maxProducts)' +
          ' AND (attribute_not_exists(#q.#p) OR #q.#p <= :maxBefore)',
        ExpressionAttributeNames: { ...ATTRIBUTE_NAMES, '#p': productId },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':quantity': quantity,
          ':product': product,
          ':now': new Date().toISOString(),
          ':maxProducts': MAX_CART_PRODUCTS,
          ':maxBefore': MAX_ITEM_QUANTITY - quantity,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return cartLines(Attributes as CartItem);
  }
}
