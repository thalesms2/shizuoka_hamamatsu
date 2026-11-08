import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTenantClient } from '../src/prisma/tenant-client.js';

describe('Tenant isolation (requires `docker compose up -d`)', () => {
  const prisma = new PrismaService();
  let tenantA: string;
  let tenantB: string;
  let clientOfB: string;

  beforeAll(async () => {
    await prisma.onModuleInit();
    const a = await prisma.tenant.create({ data: { name: 'Isolation A' } });
    const b = await prisma.tenant.create({ data: { name: 'Isolation B' } });
    tenantA = a.id;
    tenantB = b.id;

    const client = await prisma.client.create({
      data: { tenantId: tenantB, name: 'Client of B', phone: '+5511000000000' },
    });
    clientOfB = client.id;
  });

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
    await prisma.onModuleDestroy();
  });

  it('hides another tenant rows from findMany', async () => {
    const scoped = createTenantClient(prisma, tenantA);

    expect(await scoped.client.findMany()).toEqual([]);
    expect(await scoped.client.count()).toBe(0);
  });

  it('hides another tenant row from findUnique by id', async () => {
    const scoped = createTenantClient(prisma, tenantA);

    expect(await scoped.client.findUnique({ where: { id: clientOfB } })).toBeNull();
  });

  it('refuses to update another tenant row', async () => {
    const scoped = createTenantClient(prisma, tenantA);

    await expect(
      scoped.client.update({ where: { id: clientOfB }, data: { name: 'Hijacked' } }),
    ).rejects.toThrow();

    const untouched = await prisma.client.findUniqueOrThrow({ where: { id: clientOfB } });
    expect(untouched.name).toBe('Client of B');
  });

  it('refuses to delete another tenant row', async () => {
    const scoped = createTenantClient(prisma, tenantA);

    await expect(scoped.client.delete({ where: { id: clientOfB } })).rejects.toThrow();
    expect(await prisma.client.count({ where: { id: clientOfB } })).toBe(1);
  });

  it('writes into the scoped tenant even when another tenant is forced', async () => {
    const scoped = createTenantClient(prisma, tenantA);

    const created = await scoped.client.create({
      data: { tenantId: tenantB, name: 'Forced', phone: '+5511111111111' } as never,
    });

    expect(created.tenantId).toBe(tenantA);
  });

  it('still lets the unscoped client see everything', async () => {
    expect(await prisma.client.count({ where: { tenantId: tenantB } })).toBe(1);
  });
});
