import { Module } from '@nestjs/common';
import { DynamoService } from './dynamo.service.js';

@Module({
  providers: [DynamoService],
  exports: [DynamoService],
})
export class DynamoModule {}
