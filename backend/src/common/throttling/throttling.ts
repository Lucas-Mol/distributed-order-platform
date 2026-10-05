import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import {
  seconds,
  type ThrottlerGetTrackerFunction,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { AppConfig } from '../../config/app-config.js';

const AUTH_THROTTLE_KEY = 'authThrottle';

export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE_KEY, true);

function isAuthThrottled(context: ExecutionContext): boolean {
  return Reflect.getMetadata(AUTH_THROTTLE_KEY, context.getHandler()) === true;
}

const emailTracker: ThrottlerGetTrackerFunction = (req) => {
  const { body, ip } = req as { body?: { email?: unknown }; ip?: string };
  const email = body?.email;
  return typeof email === 'string' && email.trim()
    ? `email:${email.trim().toLowerCase()}`
    : `ip:${ip}`;
};

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
      {
        name: 'auth-email',
        ttl,
        limit: rateLimit.authMax,
        skipIf: (context) => !isAuthThrottled(context),
        getTracker: emailTracker,
      },
    ],
  };
}
