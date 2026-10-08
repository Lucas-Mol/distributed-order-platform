import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoService } from '../dynamo/dynamo.service.js';
import {
  CartLimitError,
  DynamoCartStore,
  MAX_CART_PRODUCTS,
} from './cart.store.js';

const USER = '80a11a62-136f-4a4d-a96d-4e3e02d7592a';
const MUG = '8ec62dad-7ed4-4812-861d-5b8ca2a3a321';
const MUG_SNAPSHOT = { name: 'Mug', unitPriceCents: 3990 };

function conflict() {
  return new ConditionalCheckFailedException({
    message: 'conflict',
    $metadata: {},
  });
}

function cartItem(quantities: Record<string, number>) {
  return {
    user_id: USER,
    quantities,
    products: Object.fromEntries(
      Object.keys(quantities).map((id) => [id, MUG_SNAPSHOT]),
    ),
  };
}

describe('DynamoCartStore', () => {
  let send: ReturnType<typeof vi.fn>;
  let store: DynamoCartStore;

  beforeEach(() => {
    send = vi.fn();
    store = new DynamoCartStore({
      client: { send },
      cartsTable: 'carts',
    } as unknown as DynamoService);
  });

  const commands = () => send.mock.calls.map(([command]) => command);

  it('adds to an existing cart with a single conditional update', async () => {
    send.mockResolvedValueOnce({ Attributes: cartItem({ [MUG]: 3 }) });

    const lines = await store.add(USER, MUG, MUG_SNAPSHOT, 2);

    expect(lines).toEqual([{ productId: MUG, ...MUG_SNAPSHOT, quantity: 3 }]);
    expect(commands()).toHaveLength(1);
    const { input } = commands()[0] as UpdateCommand;
    expect(input.UpdateExpression).toContain(
      'if_not_exists(#q.#p, :zero) + :quantity',
    );
    expect(input.ExpressionAttributeNames).toMatchObject({ '#p': MUG });
    expect(input.ExpressionAttributeValues).toMatchObject({
      ':quantity': 2,
      ':maxProducts': MAX_CART_PRODUCTS,
      ':maxBefore': 98,
    });
    expect(input.ReturnValues).toBe('ALL_NEW');
  });

  it('creates the cart when there is none', async () => {
    send
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const lines = await store.add(USER, MUG, MUG_SNAPSHOT, 1);

    expect(lines).toEqual([{ productId: MUG, ...MUG_SNAPSHOT, quantity: 1 }]);
    expect(commands()[1]).toBeInstanceOf(GetCommand);
    const put = commands()[2] as PutCommand;
    expect(put).toBeInstanceOf(PutCommand);
    expect(put.input.ConditionExpression).toBe('attribute_not_exists(user_id)');
  });

  it('retries the update when another request created the cart first', async () => {
    send
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ Attributes: cartItem({ [MUG]: 2 }) });

    const lines = await store.add(USER, MUG, MUG_SNAPSHOT, 1);

    expect(lines[0].quantity).toBe(2);
    expect(commands()[3]).toBeInstanceOf(UpdateCommand);
  });

  it('explains which limit was hit', async () => {
    send
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ Item: cartItem({ [MUG]: 99 }) });
    await expect(store.add(USER, MUG, MUG_SNAPSHOT, 5)).rejects.toThrow(
      new CartLimitError(
        'You can have at most 100 units of a product in the cart (currently 99).',
      ),
    );

    const full = Object.fromEntries(
      Array.from({ length: MAX_CART_PRODUCTS }, (_, i) => [`p${i}`, 1]),
    );
    send
      .mockRejectedValueOnce(conflict())
      .mockResolvedValueOnce({ Item: cartItem(full) });
    await expect(store.add(USER, MUG, MUG_SNAPSHOT, 1)).rejects.toThrow(
      `A cart holds at most ${MAX_CART_PRODUCTS} different products.`,
    );
  });

  it('returns null when setting the quantity of a product not in the cart', async () => {
    send.mockRejectedValueOnce(conflict());

    await expect(store.setQuantity(USER, MUG, 3)).resolves.toBeNull();
  });

  it('ignores removals from a cart that does not exist', async () => {
    send.mockRejectedValueOnce(conflict());

    await expect(store.remove(USER, MUG)).resolves.toBeUndefined();
  });

  it('refreshes snapshots and drops removed products in one update', async () => {
    send.mockResolvedValueOnce({});

    await store.refresh(
      USER,
      new Map([[MUG, { name: 'Mug v2', unitPriceCents: 4990 }]]),
      ['gone'],
    );

    const { input } = commands()[0] as UpdateCommand;
    expect(input.UpdateExpression).toBe(
      'SET updated_at = :now, #s.#u0 = :u0 REMOVE #q.#r0, #s.#r0',
    );
    expect(input.ExpressionAttributeNames).toMatchObject({
      '#u0': MUG,
      '#r0': 'gone',
    });
  });

  it('declares only the attribute names each expression uses', async () => {
    send.mockResolvedValue({ Attributes: cartItem({ [MUG]: 1 }) });

    await store.refresh(
      USER,
      new Map([[MUG, { name: 'Mug v2', unitPriceCents: 4990 }]]),
      [],
    );
    await store.setQuantity(USER, MUG, 2);

    const [refresh, setQuantity] = commands() as UpdateCommand[];
    expect(Object.keys(refresh.input.ExpressionAttributeNames!)).toEqual([
      '#s',
      '#u0',
    ]);
    expect(Object.keys(setQuantity.input.ExpressionAttributeNames!)).toEqual([
      '#q',
      '#p',
    ]);
  });
});
