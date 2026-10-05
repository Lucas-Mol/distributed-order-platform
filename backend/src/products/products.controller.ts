import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Auth } from '../auth/auth.decorator.js';
import { Role } from '../generated/prisma/client.js';
import {
  AttachImageDto,
  CreateImageUploadDto,
  CreateProductDto,
  ListProductsQueryDto,
  UpdateProductDto,
} from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.products.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.findOne(id);
  }

  @Post()
  @Auth(Role.MANAGER)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @Auth(Role.MANAGER)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @Auth(Role.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.remove(id);
  }

  @Post(':id/image-upload-url')
  @Auth(Role.MANAGER)
  createImageUpload(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateImageUploadDto,
  ) {
    return this.products.createImageUpload(id, dto);
  }

  @Put(':id/image')
  @Auth(Role.MANAGER)
  attachImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AttachImageDto,
  ) {
    return this.products.attachImage(id, dto.key);
  }

  @Delete(':id/image')
  @Auth(Role.MANAGER)
  removeImage(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.products.removeImage(id);
  }
}
