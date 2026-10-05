import { randomUUID } from 'node:crypto';

export const IMAGE_TYPES = {
  'image/png': {
    extension: 'png',
    signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  'image/jpeg': { extension: 'jpg', signature: [0xff, 0xd8, 0xff] },
} as const;

export type ImageContentType = keyof typeof IMAGE_TYPES;

export const IMAGE_CONTENT_TYPES = Object.keys(
  IMAGE_TYPES,
) as ImageContentType[];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const SIGNATURE_BYTES = Math.max(
  ...Object.values(IMAGE_TYPES).map(({ signature }) => signature.length),
);

const UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

export function newImageKey(
  prefix: string,
  productId: string,
  contentType: ImageContentType,
): string {
  return `${prefix}${productId}/${randomUUID()}.${IMAGE_TYPES[contentType].extension}`;
}

export function imageTypeOfKey(
  prefix: string,
  productId: string,
  key: string,
): ImageContentType | null {
  if (!key.startsWith(`${prefix}${productId}/`)) {
    return null;
  }
  const match = new RegExp(`^${UUID}\\.(png|jpg)$`).exec(
    key.slice(prefix.length + productId.length + 1),
  );
  if (!match) {
    return null;
  }
  return IMAGE_CONTENT_TYPES.find(
    (type) => IMAGE_TYPES[type].extension === match[1],
  )!;
}

export function thumbnailKeyOf(
  thumbnailPrefix: string,
  imageKey: string,
): string {
  return `${thumbnailPrefix}${imageKey.replace(/\.[^./]+$/, '')}.jpg`;
}

export function hasImageSignature(
  bytes: Uint8Array,
  contentType: ImageContentType,
): boolean {
  const { signature } = IMAGE_TYPES[contentType];
  return signature.every((byte, index) => bytes[index] === byte);
}
