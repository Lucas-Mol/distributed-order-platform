import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { MIN_ROLE_KEY, RolesGuard } from './roles.guard.js';

export function Auth(minRole: Role = Role.CUSTOMER) {
  return applyDecorators(
    SetMetadata(MIN_ROLE_KEY, minRole),
    UseGuards(JwtAuthGuard, RolesGuard),
  );
}
