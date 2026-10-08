import { Module } from '@nestjs/common';
import { DynamoModule } from '../dynamo/dynamo.module.js';
import { ProductsModule } from '../products/products.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';
import { CartStore, DynamoCartStore } from './cart.store.js';

@Module({
  imports: [DynamoModule, ProductsModule],
  controllers: [CartController],
  providers: [CartService, { provide: CartStore, useClass: DynamoCartStore }],
  exports: [CartStore],
})
export class CartModule {}
