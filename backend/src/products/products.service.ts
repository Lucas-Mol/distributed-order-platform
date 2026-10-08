import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config.js';
import type { Product } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProductCache } from '../product-cache/product-cache.js';
import { StorageService } from '../storage/storage.service.js';
import type {
  CreateImageUploadDto,
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto/product.dto.js';
import {
  hasImageSignature,
  imageTypeOfKey,
  MAX_IMAGE_BYTES,
  newImageKey,
  SIGNATURE_BYTES,
  thumbnailKeyOf,
} from './product-images.js';

export type ProductView = Product & {
  imageUrl: string | null;
  thumbnailUrl: string | null;
};

export interface ImageUpload {
  uploadUrl: string;
  key: string;
  expiresInSeconds: number;
}

const UPLOAD_URL_TTL_SECONDS = 300;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class ProductsService {
  private readonly imagePrefix: string;
  private readonly thumbnailPrefix: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cache: ProductCache,
    @Inject(appConfig.KEY) config: ConfigType<typeof appConfig>,
  ) {
    this.imagePrefix = config.aws.s3ProductImagePrefix;
    this.thumbnailPrefix = config.aws.s3ThumbnailPrefix;
  }

  async findAll({
    limit,
    offset,
    q,
  }: ListProductsQueryDto): Promise<ProductView[]> {
    const pattern = q && escapeLike(q);
    const products = await this.prisma.product.findMany({
      where: pattern
        ? {
            OR: [
              { name: { contains: pattern, mode: 'insensitive' } },
              { description: { contains: pattern, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
    });
    return Promise.all(products.map((product) => this.toView(product)));
  }

  async findOne(id: string): Promise<ProductView> {
    return this.toView(await this.findCached(id));
  }

  async findCached(id: string): Promise<Product> {
    const cached = await this.cache.get(id);
    if (cached) {
      return cached;
    }
    const product = await this.prisma.product.findUniqueOrThrow({
      where: { id },
    });
    await this.cache.put(product);
    return product;
  }

  async create(dto: CreateProductDto): Promise<ProductView> {
    return this.cachedView(await this.prisma.product.create({ data: dto }));
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    return this.cachedView(
      await this.prisma.product.update({ where: { id }, data: dto }),
    );
  }

  async remove(id: string): Promise<void> {
    const product = await this.prisma.product.delete({ where: { id } });
    await this.cache.delete(id);
    await this.storage.deleteQuietly(this.imageObjects(product.imageKey));
  }

  async createImageUpload(
    id: string,
    { contentType, contentLength }: CreateImageUploadDto,
  ): Promise<ImageUpload> {
    await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { id: true },
    });
    const key = newImageKey(this.imagePrefix, id, contentType);
    return {
      uploadUrl: await this.storage.presignUpload(
        key,
        contentType,
        contentLength,
        UPLOAD_URL_TTL_SECONDS,
      ),
      key,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    };
  }

  async attachImage(id: string, key: string): Promise<ProductView> {
    const contentType = imageTypeOfKey(this.imagePrefix, id, key);
    if (!contentType) {
      throw new BadRequestException(
        'This image key was not issued for this product',
      );
    }
    const current = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { imageKey: true },
    });
    if (current.imageKey === key) {
      return this.findOne(id);
    }

    const stored = await this.storage.head(key);
    if (!stored) {
      throw new BadRequestException('The image was not uploaded');
    }
    const valid =
      stored.size <= MAX_IMAGE_BYTES &&
      stored.contentType === contentType &&
      hasImageSignature(
        await this.storage.readStart(key, SIGNATURE_BYTES),
        contentType,
      );
    if (!valid) {
      await this.storage.deleteQuietly([key]);
      throw new BadRequestException(
        `The image must be a PNG or JPEG of at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
      );
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: { imageKey: key },
    });
    await this.storage.deleteQuietly(this.imageObjects(current.imageKey));
    return this.cachedView(product);
  }

  async removeImage(id: string): Promise<ProductView> {
    const current = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { imageKey: true },
    });
    if (!current.imageKey) {
      throw new NotFoundException('This product has no image');
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: { imageKey: null },
    });
    await this.storage.deleteQuietly(this.imageObjects(current.imageKey));
    return this.cachedView(product);
  }

  private imageObjects(imageKey: string | null): string[] {
    return imageKey
      ? [imageKey, thumbnailKeyOf(this.thumbnailPrefix, imageKey)]
      : [];
  }

  private async cachedView(product: Product): Promise<ProductView> {
    await this.cache.put(product);
    return this.toView(product);
  }

  private async toView(product: Product): Promise<ProductView> {
    if (!product.imageKey) {
      return { ...product, imageUrl: null, thumbnailUrl: null };
    }
    const [imageUrl, thumbnailUrl] = await Promise.all([
      this.storage.presignDownload(product.imageKey),
      this.storage.presignDownload(
        thumbnailKeyOf(this.thumbnailPrefix, product.imageKey),
      ),
    ]);
    return { ...product, imageUrl, thumbnailUrl };
  }
}
