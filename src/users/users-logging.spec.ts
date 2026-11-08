import { ConflictException, Logger } from '@nestjs/common';
import { PasswordService } from '../auth/password.service.js';
import { Role } from '../auth/role.enum.js';
import { UsersService } from './users.service.js';

describe('UsersService logging', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const buildService = (existing: unknown) =>
    new UsersService(
      {
        user: {
          findFirst: vi.fn().mockResolvedValue(existing),
          create: vi.fn().mockResolvedValue({
            id: 'u1',
            tenantId: 't1',
            name: 'A',
            email: 'a@a.com',
            role: Role.Lawyer,
          }),
        },
      } as never,
      new PasswordService(),
    );

  const dto = {
    name: 'A',
    email: 'a@a.com',
    password: 'plain-secret',
    role: Role.Lawyer,
  };

  it('logs a created user without its password', async () => {
    await buildService(null).create('t1', dto);

    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).toContain('u1');
    expect(JSON.stringify(log.mock.calls)).not.toContain('plain-secret');
  });

  it('logs a rejected duplicate email as a warning', async () => {
    await expect(buildService({ id: 'existing' }).create('t1', dto)).rejects.toThrow(
      ConflictException,
    );

    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).toContain('a@a.com');
  });
});
