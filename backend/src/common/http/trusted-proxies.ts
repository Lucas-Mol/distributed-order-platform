import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { appConfig } from '../../config/app.config.js';

@Injectable()
export class TrustedProxiesSetup implements OnApplicationBootstrap {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  onApplicationBootstrap(): void {
    const { trustedProxies } = this.config;
    this.adapterHost.httpAdapter
      .getInstance<{ set(setting: string, value: unknown): void }>()
      .set('trust proxy', trustedProxies.length > 0 ? trustedProxies : false);
  }
}
