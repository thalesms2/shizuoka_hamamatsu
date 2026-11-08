import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { tenantPrismaProvider, TENANT_PRISMA } from './tenant-prisma.provider.js';

@Global()
@Module({
  providers: [PrismaService, tenantPrismaProvider],
  exports: [PrismaService, TENANT_PRISMA],
})
export class PrismaModule {}
