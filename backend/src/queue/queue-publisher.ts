import {
  GetQueueUrlCommand,
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config.js';

export type QueueName = 'orders';

export abstract class QueuePublisher {
  abstract publish(queue: QueueName, body: string): Promise<void>;
}

@Injectable()
export class SqsQueuePublisher
  extends QueuePublisher
  implements OnModuleInit, OnModuleDestroy
{
  private readonly client: SQSClient;
  private readonly queueNames: Record<QueueName, string>;
  private readonly queueUrls = new Map<QueueName, string>();

  constructor(@Inject(appConfig.KEY) config: ConfigType<typeof appConfig>) {
    super();
    const { region, endpoint, sqsOrdersQueue } = config.aws;
    this.client = new SQSClient({ region, endpoint });
    this.queueNames = { orders: sqsOrdersQueue };
  }

  async onModuleInit(): Promise<void> {
    for (const [queue, name] of Object.entries(this.queueNames) as [
      QueueName,
      string,
    ][]) {
      try {
        const { QueueUrl } = await this.client.send(
          new GetQueueUrlCommand({ QueueName: name }),
        );
        if (!QueueUrl) {
          throw new Error('empty QueueUrl');
        }
        this.queueUrls.set(queue, QueueUrl);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to resolve SQS queue ${name}: ${reason}`);
      }
    }
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async publish(queue: QueueName, body: string): Promise<void> {
    const queueUrl = this.queueUrls.get(queue);
    if (!queueUrl) {
      throw new Error(`Queue ${queue} was not resolved at startup`);
    }
    await this.client.send(
      new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: body }),
    );
  }
}
