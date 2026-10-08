import { Module } from '@nestjs/common';
import { DynamoModule } from '../dynamo/dynamo.module.js';
import { DynamoProductCache, ProductCache } from './product-cache.js';

@Module({
  imports: [DynamoModule],
  providers: [{ provide: ProductCache, useClass: DynamoProductCache }],
  exports: [ProductCache],
})
export class ProductCacheModule {}
