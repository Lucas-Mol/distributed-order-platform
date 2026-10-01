import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import { seconds, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AppConfig } from '../../config/app-config.js';

const AUTH_THROTTLE_KEY = 'authThrottle';

export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE_KEY, true);

function isAuthThrottled(context: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_THROTTLE_KEY, context.getHandler()) === true;
}

export function throttlerOptions({
  rateLimit,
}: AppConfig): ThrottlerModuleOptions {
  const ttl = seconds(rateLimit.ttlSeconds);
  return {
    throttlers: [
      { name: 'default', ttl, limit: rateLimit.max },
      {
        name: 'auth',
        ttl,
        limit: rateLimit.authMax,
        skipIf: (context) => !isAuthThrottled(context),
      },
    ],
  };
}
