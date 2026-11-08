import { tenantPrismaFactory } from './tenant-prisma.provider.js';

describe('tenantPrismaFactory', () => {
  const prisma = { $extends: vi.fn().mockReturnValue('scoped-client') };

  it('builds a client scoped to the tenant of the authenticated request', () => {
    const client = tenantPrismaFactory(
      { user: { userId: 'u1', tenantId: 't1', role: 'ADMIN' } } as never,
      prisma as never,
    );

    expect(client).toBe('scoped-client');
  });

  it('refuses to build a client for an unauthenticated request', () => {
    expect(() => tenantPrismaFactory({} as never, prisma as never)).toThrow(
      /no authenticated tenant/i,
    );
  });
});
