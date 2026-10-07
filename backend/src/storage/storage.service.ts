import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { appConfig } from '../config/app.config.js';

export interface StoredObject {
  size: number;
  contentType: string | undefined;
}

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly publicClient: S3Client;

  constructor(@Inject(appConfig.KEY) config: ConfigType<typeof appConfig>) {
    const { region, endpoint, s3Bucket, s3PublicEndpoint } = config.aws;
    this.bucket = s3Bucket;
    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle: endpoint !== undefined,
    });
    this.publicClient = new S3Client({
      region,
      endpoint: s3PublicEndpoint,
      forcePathStyle: s3PublicEndpoint !== undefined,
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
    this.publicClient.destroy();
  }

  presignUpload(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn: number,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      {
        expiresIn,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
  }

  presignDownload(key: string): Promise<string> {
    const now = Date.now();
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      {
        expiresIn: (2 * HOUR_MS) / 1000,
        signingDate: new Date(now - (now % HOUR_MS)),
      },
    );
  }

  presignAttachment(
    key: string,
    filename: string,
    expiresIn: number,
  ): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      }),
      { expiresIn },
    );
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: result.ContentLength ?? 0,
        contentType: result.ContentType,
      };
    } catch (error) {
      if (error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }

  async readStart(key: string, bytes: number): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Range: `bytes=0-${bytes - 1}`,
      }),
    );
    return result.Body ? result.Body.transformToByteArray() : new Uint8Array();
  }

  async deleteQuietly(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    try {
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      for (const failure of result.Errors ?? []) {
        this.logger.warn(
          `Could not delete s3://${this.bucket}/${failure.Key}: ${failure.Code}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Could not delete ${keys.length} object(s) from ${this.bucket}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
