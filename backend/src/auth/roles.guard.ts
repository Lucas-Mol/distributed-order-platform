import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '../generated/prisma/client.js';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { hasRole } from './roles.js';

export const MIN_ROLE_KEY = 'minRole';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<Role | undefined>(MIN_ROLE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? Role.CUSTOMER;
    const user = context.switchToHttp().getRequest<Request>().user as
      AuthenticatedUser | undefined;

    if (!user || !hasRole(user.role, required)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
