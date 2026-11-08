import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordService } from './password.service.js';
import { RolesGuard } from './roles.guard.js';
import { Role } from './role.enum.js';

describe('Authentication logging', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const passwordService = new PasswordService();
  const accessHistories = { record: vi.fn() };
  const refreshTokens = {
    issue: vi.fn().mockResolvedValue('refresh-token-value'),
    consume: vi.fn(),
    revokeAllFor: vi.fn(),
  };

  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const serialize = (spy: typeof log) => JSON.stringify(spy.mock.calls);

  const buildAuthService = (user: unknown) =>
    new AuthService(
      { findActiveByEmail: vi.fn().mockResolvedValue(user) } as never,
      passwordService,
      jwtService,
      accessHistories as never,
      refreshTokens as never,
    );

  it('logs a successful login', async () => {
    const service = buildAuthService({
      id: 'u1',
      tenantId: 't1',
      role: Role.Admin,
      password: await passwordService.hash('secret'),
    });

    await service.login({ tenantId: 't1', email: 'a@a.com', password: 'secret' });

    expect(log).toHaveBeenCalled();
    expect(serialize(log)).toContain('u1');
  });

  it('logs a failed login as a warning, with the tenant and email', async () => {
    const service = buildAuthService(null);

    await expect(
      service.login({ tenantId: 't1', email: 'ghost@a.com', password: 'secret' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(warn).toHaveBeenCalled();
    expect(serialize(warn)).toContain('ghost@a.com');
    expect(serialize(warn)).toContain('t1');
  });

  it('never writes the password or the token to the log', async () => {
    const ok = buildAuthService({
      id: 'u1',
      tenantId: 't1',
      role: Role.Admin,
      password: await passwordService.hash('top-secret-password'),
    });
    await ok.login({ tenantId: 't1', email: 'a@a.com', password: 'top-secret-password' });

    const failing = buildAuthService(null);
    await failing
      .login({ tenantId: 't1', email: 'a@a.com', password: 'top-secret-password' })
      .catch(() => undefined);

    expect(serialize(log)).not.toContain('top-secret-password');
    expect(serialize(warn)).not.toContain('top-secret-password');
    expect(serialize(log)).not.toContain('scrypt:');
    expect(serialize(log)).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it('logs a rejected token', async () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = new JwtAuthGuard(jwtService, reflector);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, method: 'GET', url: '/probe' }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);

    expect(warn).toHaveBeenCalled();
    expect(serialize(warn)).toContain('/probe');
  });

  it('logs a rejected role', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Admin]);
    const guard = new RolesGuard(reflector);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'u1', tenantId: 't1', role: Role.Client },
          method: 'POST',
          url: '/auth/signup',
        }),
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow();
    expect(serialize(warn)).toContain('/auth/signup');
    expect(serialize(warn)).toContain('CLIENT');
  });
});
