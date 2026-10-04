import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export const MAX_PRICE_CENTS = 100_000_000;
export const MAX_STOCK = 1_000_000;

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents: number;

  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  stock: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_CENTS)
  priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_STOCK)
  stock?: number;
}

export class ListProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;
}
