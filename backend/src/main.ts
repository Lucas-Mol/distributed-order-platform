import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { appConfig } from './config/app.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.enableShutdownHooks();
  const config = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  await app.listen(config.port);
  Logger.log(`Listening on port ${config.port} (${config.env})`, 'Bootstrap');
}

try {
  await bootstrap();
} catch (error) {
  Logger.error(
    error instanceof Error ? error.message : String(error),
    undefined,
    'Bootstrap',
  );
  process.exit(1);
}
