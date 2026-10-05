import { Module } from '@nestjs/common';
import { QueuePublisher, SqsQueuePublisher } from './queue-publisher.js';

@Module({
  providers: [{ provide: QueuePublisher, useClass: SqsQueuePublisher }],
  exports: [QueuePublisher],
})
export class QueueModule {}
