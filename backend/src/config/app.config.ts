import { registerAs } from '@nestjs/config';
import { loadAppConfig } from './aws-config.loader.js';

/**
 * Loaded once at boot from SSM Parameter Store and Secrets Manager.
 * Tests override `appConfig.KEY` instead of reaching AWS.
 */
export const appConfig = registerAs('app', () => loadAppConfig());
