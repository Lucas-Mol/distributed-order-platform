import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config.js';

@Injectable()
export class DynamoService implements OnModuleDestroy {
  readonly client: DynamoDBDocumentClient;
  readonly cartsTable: string;
  readonly productCacheTable: string;

  constructor(@Inject(appConfig.KEY) config: ConfigType<typeof appConfig>) {
    const { region, endpoint, dynamoCartsTable, dynamoProductCacheTable } =
      config.aws;
    this.client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region, endpoint }),
    );
    this.cartsTable = dynamoCartsTable;
    this.productCacheTable = dynamoProductCacheTable;
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
