import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { ProductCacheModule } from '../product-cache/product-cache.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { OrderEventsDispatcher } from './order-events.dispatcher.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [QueueModule, StorageModule, CartModule, ProductCacheModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderEventsDispatcher],
})
export class OrdersModule {}
