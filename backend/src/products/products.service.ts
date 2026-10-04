import { Injectable } from '@nestjs/common';
import type { Product } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto/product.dto.js';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll({ limit, offset, q }: ListProductsQueryDto): Promise<Product[]> {
    const pattern = q && escapeLike(q);
    return this.prisma.product.findMany({
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
  }

  findOne(id: string): Promise<Product> {
    return this.prisma.product.findUniqueOrThrow({ where: { id } });
  }

  create(dto: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({ data: dto });
  }

  update(id: string, dto: UpdateProductDto): Promise<Product> {
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.product.delete({ where: { id } });
  }
}
