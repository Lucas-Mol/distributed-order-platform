import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../generated/prisma/client.js';
import { RolesGuard } from './roles.guard.js';

function contextFor(role: Role | undefined): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: role ? { id: 'u1', email: 'u@example.com', role } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  afterEach(() => vi.restoreAllMocks());

  const requires = (role: Role | undefined) =>
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(role);

  it.each([
    [Role.CUSTOMER, Role.CUSTOMER, true],
    [Role.CUSTOMER, Role.MANAGER, false],
    [Role.CUSTOMER, Role.ADMIN, false],
    [Role.MANAGER, Role.CUSTOMER, true],
    [Role.MANAGER, Role.MANAGER, true],
    [Role.MANAGER, Role.ADMIN, false],
    [Role.ADMIN, Role.CUSTOMER, true],
    [Role.ADMIN, Role.MANAGER, true],
    [Role.ADMIN, Role.ADMIN, true],
  ])('%s accessing a %s route → allowed=%s', (actual, required, allowed) => {
    requires(required);
    if (allowed) {
      expect(guard.canActivate(contextFor(actual))).toBe(true);
    } else {
      expect(() => guard.canActivate(contextFor(actual))).toThrow(
        ForbiddenException,
      );
    }
  });

  it('defaults to CUSTOMER when the route sets no minimum', () => {
    requires(undefined);
    expect(guard.canActivate(contextFor(Role.CUSTOMER))).toBe(true);
  });

  it('rejects a request without an authenticated user', () => {
    requires(Role.CUSTOMER);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
