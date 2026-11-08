import { ConflictException } from '@nestjs/common';
import { PasswordService } from '../auth/password.service.js';
import { Role } from '../auth/role.enum.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  const buildPrisma = () => ({
    user: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  });

  const buildService = (prisma: ReturnType<typeof buildPrisma>) =>
    new UsersService(prisma as never, new PasswordService());

  it('finds an active user by tenant and email', async () => {
    const prisma = buildPrisma();
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });

    await buildService(prisma).findActiveByEmail('t1', 'a@a.com');

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 't1', email: 'a@a.com', deleted: false },
    });
  });

  it('stores a hashed password, never the plain one', async () => {
    const prisma = buildPrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: never) => ({ id: 'u1', ...data }));

    await buildService(prisma).create('t1', {
      name: 'A',
      email: 'a@a.com',
      password: 'secret',
      role: Role.Lawyer,
    });

    const stored = prisma.user.create.mock.calls[0][0].data.password;
    expect(stored).not.toBe('secret');
    expect(stored).toMatch(/^scrypt:/);
  });

  it('creates the user inside the caller tenant, ignoring any other tenant', async () => {
    const prisma = buildPrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: never) => ({ id: 'u1', ...data }));

    await buildService(prisma).create('caller-tenant', {
      name: 'A',
      email: 'a@a.com',
      password: 'secret',
      role: Role.Lawyer,
    });

    expect(prisma.user.create.mock.calls[0][0].data.tenantId).toBe('caller-tenant');
  });

  it('never returns the password hash to the caller', async () => {
    const prisma = buildPrisma();
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }: never) => ({ id: 'u1', ...data }));

    const created = await buildService(prisma).create('t1', {
      name: 'A',
      email: 'a@a.com',
      password: 'secret',
      role: Role.Lawyer,
    });

    expect(created).not.toHaveProperty('password');
  });

  it('rejects an email already used inside the tenant', async () => {
    const prisma = buildPrisma();
    prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(
      buildService(prisma).create('t1', {
        name: 'A',
        email: 'a@a.com',
        password: 'secret',
        role: Role.Lawyer,
      }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
