import { Injectable } from '@nestjs/common';
import type { Product } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll({ limit, offset }: PaginationQueryDto): Promise<Product[]> {
    return this.prisma.product.findMany({
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
