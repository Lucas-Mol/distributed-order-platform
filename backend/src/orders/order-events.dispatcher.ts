import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config.js';
import { OrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueuePublisher } from '../queue/queue-publisher.js';
import { ORDER_CREATED } from './order-events.js';

const BATCH_SIZE = 10;
const MAX_BACKOFF_MS = 30_000;
const MAX_ERROR_LENGTH = 500;
const TRANSACTION_TIMEOUT_MS = 30_000;

interface PendingEvent {
  id: string;
  order_id: string;
  event: string;
  payload: unknown;
}

export interface DispatchResult {
  published: number;
  failed: number;
}

@Injectable()
export class OrderEventsDispatcher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OrderEventsDispatcher.name);
  private readonly pollIntervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<unknown> | undefined;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: QueuePublisher,
    @Inject(appConfig.KEY) config: ConfigType<typeof appConfig>,
  ) {
    this.pollIntervalMs = config.outbox.pollIntervalMs;
  }

  onApplicationBootstrap(): void {
    if (this.pollIntervalMs > 0) {
      this.schedule(this.pollIntervalMs);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
  }

  dispatchPending(): Promise<DispatchResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const events = await tx.$queryRaw<PendingEvent[]>`
          SELECT id, order_id, event, payload
          FROM order_events
          WHERE published_at IS NULL
          ORDER BY created_at
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED`;

        const result: DispatchResult = { published: 0, failed: 0 };
        for (const event of events) {
          try {
            await this.publisher.publish(
              'orders',
              JSON.stringify(event.payload),
            );
          } catch (error) {
            result.failed++;
            const reason =
              error instanceof Error ? error.message : String(error);
            this.logger.warn(
              `Could not publish ${event.event} for order ${event.order_id}: ${reason}`,
            );
            await tx.orderEvent.update({
              where: { id: event.id },
              data: {
                attempts: { increment: 1 },
                lastError: reason.slice(0, MAX_ERROR_LENGTH),
              },
            });
            continue;
          }

          result.published++;
          await tx.orderEvent.update({
            where: { id: event.id },
            data: {
              attempts: { increment: 1 },
              lastError: null,
              publishedAt: new Date(),
            },
          });
          if (event.event === ORDER_CREATED) {
            await tx.order.updateMany({
              where: { id: event.order_id, status: OrderStatus.CREATED },
              data: { status: OrderStatus.PROCESSING },
            });
          }
        }
        return result;
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.inFlight = this.run(delayMs);
    }, delayMs);
  }

  private async run(previousDelayMs: number): Promise<void> {
    let nextDelayMs = this.pollIntervalMs;
    try {
      let result: DispatchResult;
      do {
        result = await this.dispatchPending();
      } while (
        !this.stopped &&
        result.failed === 0 &&
        result.published === BATCH_SIZE
      );
      if (result.failed > 0) {
        nextDelayMs = Math.min(previousDelayMs * 2, MAX_BACKOFF_MS);
      }
    } catch (error) {
      nextDelayMs = Math.min(previousDelayMs * 2, MAX_BACKOFF_MS);
      this.logger.error(
        `Order event dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.schedule(nextDelayMs);
  }
}
