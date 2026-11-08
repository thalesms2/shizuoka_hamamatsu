import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Prisma schema defaults (requires `docker compose up -d`)', () => {
  const prisma = new PrismaService();
  let tenantId: string;

  beforeAll(async () => {
    await prisma.onModuleInit();
    const tenant = await prisma.tenant.create({ data: { name: 'Schema Probe' } });
    tenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.service.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.onModuleDestroy();
  });

  it('defaults deleted to false on every tenant-scoped table', async () => {
    const client = await prisma.client.create({
      data: { tenantId, name: 'Probe Client', phone: '+5511999999999' },
    });
    const service = await prisma.service.create({
      data: { tenantId, clientId: client.id, description: 'Probe', value: 1000, balance: 1000 },
    });

    expect(client.deleted).toBe(false);
    expect(service.deleted).toBe(false);
    expect(service.canceled).toBe(false);
  });

  it('bumps updated_at automatically on update', async () => {
    const before = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const after = await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: 'Schema Probe Renamed' },
    });

    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it('allows the same email in two different tenants', async () => {
    const other = await prisma.tenant.create({ data: { name: 'Other Firm' } });
    const email = `shared-${Date.now()}@probe.test`;

    const first = await prisma.user.create({
      data: { tenantId, name: 'A', email, password: 'x', role: 'ADMIN' },
    });
    const second = await prisma.user.create({
      data: { tenantId: other.id, name: 'B', email, password: 'x', role: 'ADMIN' },
    });

    expect(second.email).toBe(first.email);

    await prisma.user.deleteMany({ where: { email } });
    await prisma.tenant.delete({ where: { id: other.id } });
  });

  it('rejects the same email twice inside one tenant', async () => {
    const email = `duplicate-${Date.now()}@probe.test`;
    await prisma.user.create({
      data: { tenantId, name: 'A', email, password: 'x', role: 'ADMIN' },
    });

    await expect(
      prisma.user.create({
        data: { tenantId, name: 'B', email, password: 'x', role: 'ADMIN' },
      }),
    ).rejects.toThrow(/[Uu]nique constraint/);

    await prisma.user.deleteMany({ where: { email } });
  });
});
