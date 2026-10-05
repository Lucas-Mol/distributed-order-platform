import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { OrderEventsDispatcher } from './order-events.dispatcher.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [QueueModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderEventsDispatcher],
})
export class OrdersModule {}
