import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const contextFor = (user: unknown, required: string[] | undefined) => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);

    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  };

  it('allows a route that declares no roles', () => {
    expect(guard.canActivate(contextFor({ role: 'CLIENT' }, undefined))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    expect(guard.canActivate(contextFor({ role: 'ADMIN' }, ['ADMIN']))).toBe(true);
  });

  it('rejects a user whose role is not listed', () => {
    expect(() => guard.canActivate(contextFor({ role: 'CLIENT' }, ['ADMIN']))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no authenticated user', () => {
    expect(() => guard.canActivate(contextFor(undefined, ['ADMIN']))).toThrow(ForbiddenException);
  });
});
