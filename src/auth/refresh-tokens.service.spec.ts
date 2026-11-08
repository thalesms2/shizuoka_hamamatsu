import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RefreshTokensService } from './refresh-tokens.service.js';

describe('RefreshTokensService', () => {
  const buildPrisma = () => ({
    refreshToken: {
      create: vi.fn().mockResolvedValue({ id: 'rt1' }),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  });

  const build = (prisma: ReturnType<typeof buildPrisma>) =>
    new RefreshTokensService(prisma as never);

  const sha256 = (value: string) =>
    createHash('sha256').update(value).digest('hex');

  it('stores only the hash, never the token itself', async () => {
    const prisma = buildPrisma();

    const token = await build(prisma).issue('t1', 'u1');

    const stored = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(sha256(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('issues a different token every time', async () => {
    const prisma = buildPrisma();
    const service = build(prisma);

    expect(await service.issue('t1', 'u1')).not.toBe(await service.issue('t1', 'u1'));
  });

  it('sets an expiry in the future', async () => {
    const prisma = buildPrisma();

    await build(prisma).issue('t1', 'u1');

    const { expiresAt } = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a token that is not stored', async () => {
    const prisma = buildPrisma();
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(build(prisma).consume('whatever')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const prisma = buildPrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      tenantId: 't1',
      userId: 'u1',
      revoked: false,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(build(prisma).consume('whatever')).rejects.toThrow(UnauthorizedException);
  });

  it('revokes every active token of the user when a revoked token is replayed', async () => {
    const prisma = buildPrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      tenantId: 't1',
      userId: 'u1',
      revoked: true,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(build(prisma).consume('whatever')).rejects.toThrow(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) },
    });
  });

  it('rotates a valid token: revokes it and links the replacement', async () => {
    const prisma = buildPrisma();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt1',
      tenantId: 't1',
      userId: 'u1',
      revoked: false,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.refreshToken.create.mockResolvedValue({ id: 'rt2' });

    const result = await build(prisma).consume('whatever');

    expect(result.tenantId).toBe('t1');
    expect(result.userId).toBe('u1');
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt1' },
      data: { revoked: true, revokedAt: expect.any(Date), replacedById: 'rt2' },
    });
  });

  it('deletes the presented token, scoped to its owner', async () => {
    const prisma = buildPrisma();

    await build(prisma).revokeByValue('u1', 'the-token');

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: sha256('the-token'), userId: 'u1' },
    });
  });

  it('does not delete a token belonging to another user', async () => {
    const prisma = buildPrisma();
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(build(prisma).revokeByValue('u2', 'the-token')).resolves.toBeUndefined();
    expect(prisma.refreshToken.deleteMany.mock.calls[0][0].where.userId).toBe('u2');
  });

  it('stays silent when the token is not stored', async () => {
    const prisma = buildPrisma();
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(build(prisma).revokeByValue('u1', 'ghost')).resolves.toBeUndefined();
  });
});
