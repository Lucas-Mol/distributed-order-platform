import { Module } from '@nestjs/common';
import { ProductCacheModule } from '../product-cache/product-cache.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [StorageModule, ProductCacheModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
