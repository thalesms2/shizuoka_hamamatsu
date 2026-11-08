import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccessOperation } from '../access-histories/access-operation.enum.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { Role } from './role.enum.js';

describe('AuthService', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  const passwordService = new PasswordService();

  const buildUsers = () => ({
    findActiveByEmail: vi.fn(),
    findActiveById: vi.fn(),
    create: vi.fn(),
  });

  const refreshTokens = {
    issue: vi.fn().mockResolvedValue('refresh-token-value'),
    consume: vi.fn(),
    revokeAllFor: vi.fn(),
    revokeByValue: vi.fn(),
  };

  const accessHistories = { record: vi.fn() };

  beforeEach(() => {
    accessHistories.record.mockReset();
    refreshTokens.issue.mockClear();
    refreshTokens.consume.mockReset();
    refreshTokens.revokeByValue.mockClear();
  });

  const buildService = (users: ReturnType<typeof buildUsers>) =>
    new AuthService(
      users as never,
      passwordService,
      jwtService,
      accessHistories as never,
      refreshTokens as never,
    );

  it('issues a token carrying userId, tenantId and role', async () => {
    const users = buildUsers();
    users.findActiveByEmail.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: Role.Admin,
      password: await passwordService.hash('secret'),
    });

    const { accessToken } = await buildService(users).login({
      tenantId: 't1',
      email: 'a@a.com',
      password: 'secret',
    });

    expect(await jwtService.verifyAsync(accessToken)).toMatchObject({
      sub: 'u1',
      tenantId: 't1',
      role: Role.Admin,
    });
  });

  it('rejects a wrong password', async () => {
    const users = buildUsers();
    users.findActiveByEmail.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: Role.Admin,
      password: await passwordService.hash('secret'),
    });

    await expect(
      buildService(users).login({ tenantId: 't1', email: 'a@a.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('does not reveal whether the email exists', async () => {
    const users = buildUsers();
    users.findActiveByEmail.mockResolvedValue(null);
    const service = buildService(users);

    const unknown = await service
      .login({ tenantId: 't1', email: 'ghost@a.com', password: 'secret' })
      .catch((error: Error) => error.message);

    users.findActiveByEmail.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: Role.Admin,
      password: await passwordService.hash('secret'),
    });
    const wrongPassword = await service
      .login({ tenantId: 't1', email: 'a@a.com', password: 'wrong' })
      .catch((error: Error) => error.message);

    expect(unknown).toBe(wrongPassword);
  });

  it('looks the user up inside the requested tenant only', async () => {
    const users = buildUsers();
    users.findActiveByEmail.mockResolvedValue(null);

    await buildService(users)
      .login({ tenantId: 't1', email: 'a@a.com', password: 'secret' })
      .catch(() => undefined);

    expect(users.findActiveByEmail).toHaveBeenCalledWith('t1', 'a@a.com');
  });

  it('records a LOGIN access history for a successful login', async () => {
    const users = buildUsers();
    users.findActiveByEmail.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: Role.Admin,
      password: await passwordService.hash('secret'),
    });

    await buildService(users).login({
      tenantId: 't1',
      email: 'a@a.com',
      password: 'secret',
    });

    expect(accessHistories.record).toHaveBeenCalledWith(
      't1',
      'u1',
      AccessOperation.Login,
    );
  });

  it('records nothing when the login fails', async () => {
    const users = buildUsers();
    users.findActiveByEmail.mockResolvedValue(null);

    await buildService(users)
      .login({ tenantId: 't1', email: 'a@a.com', password: 'secret' })
      .catch(() => undefined);

    expect(accessHistories.record).not.toHaveBeenCalled();
  });

  it('returns a refresh token alongside the access token on login', async () => {
    const users = buildUsers();
    users.findActiveByEmail.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: Role.Admin,
      password: await passwordService.hash('secret'),
    });

    const result = await buildService(users).login({
      tenantId: 't1',
      email: 'a@a.com',
      password: 'secret',
    });

    expect(result.refreshToken).toBe('refresh-token-value');
    expect(refreshTokens.issue).toHaveBeenCalledWith('t1', 'u1');
  });

  it('issues no refresh token when the login fails', async () => {
    const users = buildUsers();
    users.findActiveByEmail.mockResolvedValue(null);

    await buildService(users)
      .login({ tenantId: 't1', email: 'a@a.com', password: 'secret' })
      .catch(() => undefined);

    expect(refreshTokens.issue).not.toHaveBeenCalled();
  });

  it('exchanges a refresh token for a new pair', async () => {
    const users = buildUsers();
    users.findActiveById.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: Role.Lawyer,
    });
    refreshTokens.consume.mockResolvedValue({
      tenantId: 't1',
      userId: 'u1',
      refreshToken: 'rotated-token',
    });

    const result = await buildService(users).refresh({ refreshToken: 'old-token' });

    expect(result.refreshToken).toBe('rotated-token');
    expect(await jwtService.verifyAsync(result.accessToken)).toMatchObject({
      sub: 'u1',
      tenantId: 't1',
      role: Role.Lawyer,
    });
  });

  it('refuses to refresh for a user that no longer exists or was deleted', async () => {
    const users = buildUsers();
    users.findActiveById.mockResolvedValue(null);
    refreshTokens.consume.mockResolvedValue({
      tenantId: 't1',
      userId: 'u1',
      refreshToken: 'rotated-token',
    });

    await expect(
      buildService(users).refresh({ refreshToken: 'old-token' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(refreshTokens.revokeAllFor).toHaveBeenCalledWith('u1');
  });

  it('carries the current role, not the one the old token had', async () => {
    const users = buildUsers();
    users.findActiveById.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: Role.Client,
    });
    refreshTokens.consume.mockResolvedValue({
      tenantId: 't1',
      userId: 'u1',
      refreshToken: 'rotated-token',
    });

    const result = await buildService(users).refresh({ refreshToken: 'old-token' });

    expect(await jwtService.verifyAsync(result.accessToken)).toMatchObject({
      role: Role.Client,
    });
  });

  it('deletes the presented refresh token on logout', async () => {
    await buildService(buildUsers()).logout('u1', { refreshToken: 'the-token' });

    expect(refreshTokens.revokeByValue).toHaveBeenCalledWith('u1', 'the-token');
  });
});
