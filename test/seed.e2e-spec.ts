import { PrismaService } from '../src/prisma/prisma.service.js';
import { PasswordService } from '../src/auth/password.service.js';
import { Role } from '../src/auth/role.enum.js';
import { ADMIN_EMAIL, ADMIN_PASSWORD, TENANT_NAME, seedDatabase } from '../prisma/seed.js';

describe('Database seed (requires `docker compose up -d`)', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('creates the test tenant with an admin whose password verifies', async () => {
    await seedDatabase(prisma);

    const tenant = await prisma.tenant.findFirstOrThrow({ where: { name: TENANT_NAME } });
    const admin = await prisma.user.findUniqueOrThrow({
      where: { tenantId_email: { tenantId: tenant.id, email: ADMIN_EMAIL } },
    });

    expect(admin.role).toBe(Role.Admin);
    expect(admin.password).not.toContain(ADMIN_PASSWORD);
    await expect(new PasswordService().verify(ADMIN_PASSWORD, admin.password)).resolves.toBe(true);
  });

  it('is idempotent', async () => {
    await seedDatabase(prisma);
    await seedDatabase(prisma);

    const tenants = await prisma.tenant.count({ where: { name: TENANT_NAME } });
    const admins = await prisma.user.count({ where: { email: ADMIN_EMAIL } });

    expect(tenants).toBe(1);
    expect(admins).toBe(1);
  });
});
