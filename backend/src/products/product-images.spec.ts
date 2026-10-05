import {
  hasImageSignature,
  imageTypeOfKey,
  newImageKey,
  thumbnailKeyOf,
} from './product-images.js';

const productId = '3f0b6c1e-0d6a-4c1a-9f5e-2b7a1c9d8e00';

describe('product image keys', () => {
  it('issues keys under the product folder that parse back to their type', () => {
    const key = newImageKey('products/', productId, 'image/jpeg');
    expect(key).toMatch(
      new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(imageTypeOfKey('products/', productId, key)).toBe('image/jpeg');
  });

  it.each([
    `products/another-product/0b1c2d3e-4f50-4a1b-8c2d-3e4f5a6b7c8d.png`,
    `products/${productId}/../other/0b1c2d3e-4f50-4a1b-8c2d-3e4f5a6b7c8d.png`,
    `products/${productId}/0b1c2d3e-4f50-4a1b-8c2d-3e4f5a6b7c8d.gif`,
    `products/${productId}/not-a-uuid.png`,
    `thumbnails/products/${productId}/0b1c2d3e-4f50-4a1b-8c2d-3e4f5a6b7c8d.jpg`,
  ])('rejects a key that was not issued for the product: %s', (key) => {
    expect(imageTypeOfKey('products/', productId, key)).toBeNull();
  });

  it('derives the thumbnail key the Lambda writes', () => {
    expect(thumbnailKeyOf('thumbnails/', `products/${productId}/abc.png`)).toBe(
      `thumbnails/products/${productId}/abc.jpg`,
    );
  });
});

describe('hasImageSignature', () => {
  it('accepts real PNG and JPEG headers', () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(hasImageSignature(png, 'image/png')).toBe(true);
    expect(
      hasImageSignature(
        Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
        'image/jpeg',
      ),
    ).toBe(true);
  });

  it('rejects content that does not match the declared type', () => {
    const html = new TextEncoder().encode('<html><script>');
    expect(hasImageSignature(html, 'image/png')).toBe(false);
    expect(hasImageSignature(new Uint8Array(), 'image/jpeg')).toBe(false);
  });
});
