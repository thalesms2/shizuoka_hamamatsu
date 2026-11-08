import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PasswordService } from '../src/auth/password.service.js';
import { Role } from '../src/auth/role.enum.js';

export const TENANT_NAME = 'Tenant Teste';
export const ADMIN_EMAIL = 'adm@adm.com';
export const ADMIN_PASSWORD = 'adm';

type SeedClient = Pick<PrismaClient, 'tenant' | 'user'>;

export async function seedDatabase(prisma: SeedClient): Promise<void> {
  const existingTenant = await prisma.tenant.findFirst({
    where: { name: TENANT_NAME },
  });

  const tenant =
    existingTenant ??
    (await prisma.tenant.create({ data: { name: TENANT_NAME } }));

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: ADMIN_EMAIL } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Administrador',
      email: ADMIN_EMAIL,
      password: await new PasswordService().hash(ADMIN_PASSWORD),
      role: Role.Admin,
    },
  });

  console.log(`tenant: ${tenant.id} (${tenant.name})`);
  console.log(`admin:  ${admin.id} (${admin.email}, role ${admin.role})`);
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
