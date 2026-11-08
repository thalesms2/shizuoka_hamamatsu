import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const reflector = new Reflector();
  const guard = new JwtAuthGuard(jwtService, reflector);

  const contextFor = (headers: Record<string, string>, metadata?: unknown) => {
    const request: Record<string, unknown> = { headers };
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
      key === IS_PUBLIC_KEY ? metadata : undefined,
    );

    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => undefined,
        getClass: () => undefined,
      } as unknown as ExecutionContext,
    };
  };

  it('allows a public route with no token', async () => {
    const { context } = contextFor({}, true);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a request with no Authorization header', async () => {
    const { context } = contextFor({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    const foreign = new JwtService({ secret: 'other-secret' });
    const token = await foreign.signAsync({ sub: 'u1', tenantId: 't1', role: 'ADMIN' });
    const { context } = contextFor({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token missing the tenant claim', async () => {
    const token = await jwtService.signAsync({ sub: 'u1', role: 'ADMIN' });
    const { context } = contextFor({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches userId, tenantId and role to the request', async () => {
    const token = await jwtService.signAsync({ sub: 'u1', tenantId: 't1', role: 'ADMIN' });
    const { context, request } = contextFor({ authorization: `Bearer ${token}` });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'u1', tenantId: 't1', role: 'ADMIN' });
  });
});
